"""Setting an entry up and down: devices, the key's permissions, printers
BamBuddy no longer has (and their repair), AMS units and their serials,
reads that fail, deleting devices, and the settings that apply without a
reload. Names: test_device_names.py; migrations: test_migration.py."""
from __future__ import annotations

import asyncio
import copy
import logging
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import aiohttp
from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import STATE_UNAVAILABLE, Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator, WebSocketGenerator

from custom_components.bambuddy.api import (
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyConnectionError,
    BamBuddyNotFoundError,
    BamBuddyPermissionError,
)
from custom_components.bambuddy.const import DOMAIN
from custom_components.bambuddy.coordinator import missing_issue

from tests.conftest import (
    A1_MINI,
    API_KEY,
    H2D,
    SHORT_KEYS,
    URL,
    X1C,
    ams_device,
    ams_uid,
    entity_id,
    load_fixture,
    make_entry,
    next_refresh,
    no_entity,
    past_polls,
    past_the_minute,
    printer_device,
    printer_entry,
    printer_info,
    printer_key,
    printer_name,
    printer_serial,
    printer_uid,
    printers_but,
    printers_only,
    set_up,
    setup_integration,
    state_of,
    try_set_up,
)
from tests.helpers import (
    details_are,
    devices_by_identifier,
    failure_key,
    home_assistant_stops,
    listed_with,
    reauth_flows,
    reload_entry,
    remove_device,
    timed_out,
)


def _domains(hass: HomeAssistant, entry: MockConfigEntry) -> set[str]:
    return {entity.domain for entity in er.async_entries_for_config_entry(er.async_get(hass), entry.entry_id)}


async def test_setup_and_unload(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C, H2D)

    assert set(entry.runtime_data.printers) == {X1C, H2D}
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert entry.state is ConfigEntryState.NOT_LOADED


async def test_the_devices(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy as a service, each printer a Bambu Lab printer under it,
    each AMS unit under its printer."""
    entry = await set_up(hass, X1C, H2D)

    devices = devices_by_identifier(hass, entry)
    instance = devices[entry.entry_id]
    assert (instance.name, instance.manufacturer, instance.model, instance.sw_version) == (
        "BamBuddy (bambuddy.local)",
        "BamBuddy",
        "BamBuddy",
        "1.2.5.7",
    )
    assert instance.entry_type is dr.DeviceEntryType.SERVICE
    printer = devices[printer_device(entry, X1C)]
    assert (printer.name, printer.manufacturer, printer.model, printer.serial_number, printer.sw_version) == (
        printer_name(X1C),
        "Bambu Lab",
        "X1C",
        "00M00A000000001",
        "01.09.01.00",
    )
    assert printer.via_device_id == instance.id
    ams = devices[ams_device(entry, X1C, 0)]
    # After the printer's BamBuddy name, so it sorts right under the printer;
    # lettered as Bambu does, with its model and serial.
    assert (ams.name, ams.model, ams.via_device_id) == ("Workshop AMS A (AMS / 00600A3B0000001)", "AMS", printer.id)
    h2d_ams = {
        devices[ams_device(entry, H2D, unit)].name for unit in (0, 128)
    }
    assert h2d_ams == {"Studio AMS A (AMS 2 Pro / 19C06A000000001)", "Studio AMS HT A (AMS HT / 19F06A000000002)"}


@pytest.mark.parametrize(("fixture", "marks"), SHORT_KEYS)
async def test_setup_refuses_a_key_without_every_scope(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, fixture: str, marks: dict[str, str]
) -> None:
    """The integration works only with a key that may do all it does: one
    lacking a scope asks for a new key, with each scope's mark."""
    bambuddy_api.get_auth_me.return_value = load_fixture(fixture)
    entry = await try_set_up(hass, X1C)

    assert entry.state is ConfigEntryState.SETUP_ERROR
    assert (entry.error_reason_translation_key, entry.error_reason_translation_placeholders) == ("key_scopes_missing", marks)
    assert len(reauth_flows(hass)) == 1
    bambuddy_api.get_printers.assert_not_awaited()


async def test_setup_refuses_an_unknown_key(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A 401 twice, a second apart: BamBuddy does not know the key."""
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required", "GET /auth/me")
    entry = await try_set_up(hass, X1C)

    assert (entry.state, entry.error_reason_translation_key) == (ConfigEntryState.SETUP_ERROR, "auth_failed")
    # Twice at setup, once more by the reauth dialog (why a new key).
    assert bambuddy_api.get_auth_me.await_count == 3
    assert len(reauth_flows(hass)) == 1


async def test_a_lone_401_at_setup_is_asked_again(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy also answers 401 when its key lookup fails for a moment."""
    bambuddy_api.get_auth_me.side_effect = [BamBuddyAuthError(401, "Authentication required", "GET /auth/me"), load_fixture("auth_me_control.json")]
    entry = await try_set_up(hass, X1C)

    assert entry.state is ConfigEntryState.LOADED
    assert reauth_flows(hass) == []


async def test_setup_refuses_a_deactivated_owner(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    bambuddy_api.get_auth_me.side_effect = BamBuddyPermissionError(403, "API key owner is deactivated or no longer exists", "GET /auth/me")
    entry = await try_set_up(hass, X1C)

    assert (entry.state, entry.error_reason_translation_key) == (ConfigEntryState.SETUP_ERROR, "key_owner_inactive")
    assert len(reauth_flows(hass)) == 1


async def test_setup_waits_while_bambuddy_is_away(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """No answer to the key's check: no new key would help."""
    bambuddy_api.get_auth_me.side_effect = BamBuddyConnectionError("GET /auth/me: ClientConnectorError")
    entry = await try_set_up(hass, X1C)

    assert entry.state is ConfigEntryState.SETUP_RETRY
    assert reauth_flows(hass) == []


async def test_an_answer_without_permissions_is_an_error(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A BamBuddy that renamed the field: an error, not a retry for ever."""
    bambuddy_api.get_auth_me.return_value = {"username": "api-key:bb_x..."}
    entry = await try_set_up(hass, X1C)

    assert (entry.state, entry.error_reason_translation_key) == (ConfigEntryState.SETUP_ERROR, "key_check_unreadable")
    assert reauth_flows(hass) == []


async def test_a_full_key_gets_every_control(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The key with BamBuddy's default toggles and Control Printer: the
    extra toggles do no harm, every control is there."""
    entry = await set_up(hass, X1C)

    assert {Platform.SELECT, Platform.FAN, Platform.LIGHT, Platform.NUMBER, Platform.BUTTON, Platform.SWITCH} <= _domains(hass, entry)
    assert entry.runtime_data.key.last.outcome == "ok"


async def test_a_poll_from_before_a_command_does_not_undo_it(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A slow BamBuddy: a poll that started before the light was switched
    answers with the light off. It is dropped; the light stays on."""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    assert state_of(hass, "light", printer_uid(entry, "chamber_light")).state == "on"
    status = copy.deepcopy(bambuddy_api.statuses[X1C])
    status["chamber_light"] = False

    async def slow(printer_id: int) -> dict[str, Any]:
        # The command goes out while this read is under way.
        coordinator.note_command()
        return status

    bambuddy_api.get_status.side_effect = slow
    await next_refresh(hass, freezer)

    assert state_of(hass, "light", printer_uid(entry, "chamber_light")).state == "on"


async def test_the_key_is_checked_with_authentication_off(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy answers every request then, but tells what the key may do:
    a key lacking a scope is refused all the same (so a BamBuddy that one
    day enforces scopes without authentication changes nothing here), a
    full one works, and the diagnostics say authentication is off."""
    bambuddy_api.get_auth_status.return_value = {"auth_enabled": False, "requires_setup": False}
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")
    refused = await try_set_up(hass, X1C)
    assert refused.error_reason_translation_key == "key_scopes_missing"
    await hass.config_entries.async_remove(refused.entry_id)

    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_control.json")
    entry = await set_up(hass, X1C)

    assert entry.runtime_data.auth_enabled is False
    assert {Platform.LIGHT, Platform.FAN, Platform.NUMBER} <= _domains(hass, entry)


@pytest.mark.parametrize(
    ("failure", "state"),
    [
        # The key's check passed a moment before: not the key -- tried again later.
        (BamBuddyAuthError(401, "Authentication required"), ConfigEntryState.SETUP_RETRY),
        (BamBuddyConnectionError("refused"), ConfigEntryState.SETUP_RETRY),
    ],
)
async def test_setup_failures(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, failure: Exception, state: ConfigEntryState
) -> None:
    """The printers' list refused or unreachable after the key's check
    passed: tried again later, no new key asked for."""
    bambuddy_api.get_printers.side_effect = failure
    entry = await try_set_up(hass, X1C)

    assert entry.state is state
    assert reauth_flows(hass) == []


@pytest.mark.parametrize("version", ["1.2.5.6", None])
async def test_a_bambuddy_too_old_is_refused_at_setup(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, version: str | None
) -> None:
    """An entry set up before BamBuddy was downgraded, or with a BamBuddy
    from before its public version route: its permissions cannot be
    trusted. Setup stops with a message instead of offering controls that
    fail."""
    if version is None:
        bambuddy_api.get_version.side_effect = BamBuddyNotFoundError(404, "Not Found")
    else:
        bambuddy_api.get_version.return_value = version
    entry = await try_set_up(hass, X1C)

    assert entry.state is ConfigEntryState.SETUP_ERROR
    assert entry.reason is not None and "too old" in entry.reason
    # Before the key: such a BamBuddy claims every permission for any key.
    bambuddy_api.get_auth_me.assert_not_awaited()


async def test_a_printer_bambuddy_no_longer_has_raises_an_issue(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """The other printers set up; the missing one is reported until it is
    back or removed here."""
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    entry = await set_up(hass, X1C, A1_MINI)

    assert set(entry.runtime_data.printers) == {X1C}
    issue = ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(A1_MINI)))
    assert issue is not None
    assert issue.translation_placeholders == {"printer": printer_name(A1_MINI)}

    hass.config_entries.async_update_entry(
        entry, options={"printers": [printer_entry(X1C)]}
    )
    await hass.async_block_till_done()

    assert ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(A1_MINI))) is None


async def test_a_missing_printer_comes_back_by_itself(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """While BamBuddy does not list it, its list is read once a minute; once
    the serial is there again, the entry reloads: the printer is back and
    the issue gone. Nothing missing, nothing more is read."""
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    entry = await set_up(hass, X1C, A1_MINI)
    issue_id = missing_issue(entry.entry_id, printer_key(A1_MINI))
    reads = bambuddy_api.get_printers.await_count

    await next_refresh(hass, freezer, 61)
    assert bambuddy_api.get_printers.await_count == reads + 1
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is not None

    bambuddy_api.get_printers.return_value = load_fixture("printers.json")
    await next_refresh(hass, freezer, 61)

    assert set(entry.runtime_data.printers) == {X1C, A1_MINI}
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is None
    reads = bambuddy_api.get_printers.await_count
    await next_refresh(hass, freezer, 61)
    assert bambuddy_api.get_printers.await_count == reads


async def test_a_missing_printer_is_not_looked_for_while_home_assistant_stops(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Home Assistant closes its web session while it stops: a look after
    that raised "Session is closed" into the log ("Task exception was never
    retrieved"). The first thing its stop does is cancel the timers marked
    for it."""
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    await set_up(hass, X1C, A1_MINI)
    reads = bambuddy_api.get_printers.await_count

    home_assistant_stops(hass)
    await next_refresh(hass, freezer, 61)

    assert bambuddy_api.get_printers.await_count == reads


async def test_a_missing_printer_is_not_mistaken_for_another(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A stored printer without a serial is not matched to another
    printer's record by its old number -- no reload every minute."""
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    entry = await set_up(hass, X1C, A1_MINI)
    stored = [dict(printer) for printer in entry.options["printers"]]
    for printer in stored:
        if printer.get("printer_id") == A1_MINI:
            printer.pop("serial_number", None)
    hass.config_entries.async_update_entry(entry, options={**entry.options, "printers": stored})
    await hass.async_block_till_done()
    # BamBuddy renumbers: the X1C now carries the missing printer's old number.
    bambuddy_api.get_printers.return_value = [{**printer, "id": A1_MINI} for printer in printers_only(X1C)]
    reloads = bambuddy_api.get_version.await_count

    await next_refresh(hass, freezer, 61)

    assert bambuddy_api.get_version.await_count == reloads


async def test_looking_for_a_missing_printer_survives_a_failing_list(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    entry = await set_up(hass, X1C, A1_MINI)
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("GET /printers/: ClientConnectorError")

    await next_refresh(hass, freezer, 61)

    assert entry.state is ConfigEntryState.LOADED
    assert ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(A1_MINI))) is not None


async def test_removing_a_printer_removes_its_devices(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C, A1_MINI)
    assert ams_device(entry, A1_MINI, 0) in devices_by_identifier(hass, entry)

    hass.config_entries.async_update_entry(
        entry, options={"printers": [printer_entry(X1C)]}
    )
    await hass.async_block_till_done()

    assert not [identifier for identifier in devices_by_identifier(hass, entry) if printer_key(A1_MINI) in identifier]
    assert printer_device(entry, X1C) in devices_by_identifier(hass, entry)


async def test_deleting_a_printer_device_removes_the_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    entry = await set_up(hass, X1C, A1_MINI)

    response = await remove_device(hass, hass_ws_client, entry, devices_by_identifier(hass, entry)[printer_device(entry, A1_MINI)])
    await hass.async_block_till_done()

    assert response["success"]
    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_the_instance_device_cannot_be_deleted(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    entry = await set_up(hass, X1C)

    response = await remove_device(hass, hass_ws_client, entry, devices_by_identifier(hass, entry)[entry.entry_id])

    assert not response["success"]
    assert "cannot be deleted here" in response["error"]["message"]


async def test_an_ams_unit_the_printer_reports_stays(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    """It would come back with the next poll."""
    entry = await set_up(hass, X1C)

    response = await remove_device(hass, hass_ws_client, entry, devices_by_identifier(hass, entry)[ams_device(entry, X1C, 0)])

    assert not response["success"]
    assert "still reports" in response["error"]["message"]


async def test_a_device_of_an_entry_that_did_not_load(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    """While BamBuddy cannot be reached -- already its version cannot be read
    -- Home Assistant tries again later and nothing reports a unit: its old
    device may go."""
    bambuddy_api.get_version.side_effect = BamBuddyConnectionError("refused")
    entry = await try_set_up(hass, X1C)
    assert entry.state is ConfigEntryState.SETUP_RETRY
    stale = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={(DOMAIN, f"{printer_device(entry, X1C)}_ams_XYZ")}
    )

    response = await remove_device(hass, hass_ws_client, entry, stale)

    assert response["success"]


async def test_a_device_nothing_reports_can_go(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    """An AMS unit moved to another printer leaves a device behind."""
    entry = await set_up(hass, X1C)
    stale = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={(DOMAIN, ams_device(entry, X1C, 3))}
    )

    response = await remove_device(hass, hass_ws_client, entry, stale)

    assert response["success"]


async def test_the_firmware_follows_on_the_device_page(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Home Assistant reads a device's details when its first entity is
    added; a firmware update after that reaches the device all the same."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["firmware_version"] = "01.09.02.00"

    await next_refresh(hass, freezer)

    assert devices_by_identifier(hass, entry)[printer_device(entry, X1C)].sw_version == "01.09.02.00"


async def test_a_refused_read_asks_the_guard(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """A read BamBuddy refuses although the key has every scope: the
    printer's values wait, the key is checked -- no reauth by the read."""
    entry = await set_up(hass, X1C)
    checked = bambuddy_api.get_auth_me.await_count
    bambuddy_api.get_status.side_effect = BamBuddyPermissionError(403, "Not allowed", "GET /printers/1/status")

    await next_refresh(hass, freezer)
    await next_refresh(hass, freezer, 6)

    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == STATE_UNAVAILABLE
    assert bambuddy_api.get_auth_me.await_count == checked + 1
    assert reauth_flows(hass) == []


async def test_a_read_401_is_confirmed_before_the_reauth(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The key deleted in BamBuddy: the reads and the check answer 401; a
    minute later the check again -- then Home Assistant asks for a new key."""
    await set_up(hass, X1C)
    refused = BamBuddyAuthError(401, "Authentication required", "GET /printers/1/status")
    bambuddy_api.get_status.side_effect = refused
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required", "GET /auth/me")

    await next_refresh(hass, freezer)
    await next_refresh(hass, freezer, 6)
    assert reauth_flows(hass) == []
    await next_refresh(hass, freezer, 61)

    assert len(reauth_flows(hass)) == 1


async def test_the_card_is_only_offered_with_a_frontend(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, caplog: pytest.LogCaptureFixture
) -> None:
    """The test environment has no frontend: the entities set up all the
    same."""
    await setup_integration(hass, make_entry(hass, X1C))

    assert "The dashboard card is not available" in caplog.text


async def test_actions_need_no_entry(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Registered once, with the integration, not per entry."""
    await setup_integration(hass, make_entry(hass, X1C))

    assert set(hass.services.async_services()[DOMAIN]) == {
        "move_axis",
        "home_axes",
        "extrude",
        "load_filament",
        "unload_filament",
        "start_drying",
        "stop_drying",
        "get_print_objects",
        "skip_objects",
        "set_filament",
        "run_diagnostic",
        "mark_maintenance_done",
        "answer_hms",
        "get_k_profiles",
        "get_filaments",
        "reset_slot",
        "refresh_rfid",
        "assign_spool",
        "unassign_spool",
        "get_spools",
    }


async def test_a_printer_deleted_in_bambuddy_while_running_raises_the_issue(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Not only at the next restart: its number answers 404, BamBuddy's list no longer has it."""
    entry = await set_up(hass, X1C, A1_MINI)
    bambuddy_api.statuses.pop(X1C)
    bambuddy_api.get_printers.return_value = printers_but(X1C)

    await next_refresh(hass, freezer)
    await hass.async_block_till_done()

    assert ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(X1C))) is not None
    assert entry.state is ConfigEntryState.LOADED
    assert state_of(hass, "sensor", printer_uid(entry, "status", A1_MINI)).state != "unavailable"


async def test_a_printer_deleted_in_bambuddy_logs_no_error(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """Its number answers 404 and the list no longer has it: the entry
    reloads and the repair tells -- "Error fetching" in the log would say
    something is broken."""
    await set_up(hass, X1C, A1_MINI)
    bambuddy_api.statuses.pop(X1C)
    bambuddy_api.get_printers.return_value = printers_but(X1C)

    with caplog.at_level(logging.ERROR):
        await next_refresh(hass, freezer)
        await hass.async_block_till_done()

    assert not [record for record in caplog.records if record.levelno >= logging.ERROR and "Error fetching" in record.getMessage()]


async def test_a_404_of_a_printer_bambuddy_still_lists_raises_no_issue(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """One 404 while BamBuddy still lists the printer under its number: no "remove this printer" repair
    that would stay after it answers again."""
    entry = await set_up(hass, X1C)
    reads = bambuddy_api.get_status.side_effect
    bambuddy_api.get_status.side_effect = BamBuddyNotFoundError(404, "Printer not found")

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)
        assert ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(X1C))) is None
        bambuddy_api.get_status.side_effect = reads
        await next_refresh(hass, freezer)

    reload.assert_not_called()
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"


async def test_a_404_with_a_failing_list_raises_no_issue(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.get_status.side_effect = BamBuddyNotFoundError(404, "Printer not found")
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("refused")

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)

    reload.assert_not_called()
    assert ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(X1C))) is None
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "unavailable"


async def test_a_printer_renumbered_while_running_is_found_by_its_serial(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A restored database while Home Assistant runs: the old number answers 404, the list has the printer
    under another; the entry reloads and finds it by its serial -- no repair."""
    entry = await set_up(hass, X1C)
    printers = load_fixture("printers.json")
    next(printer for printer in printers if printer["id"] == X1C)["id"] = 9
    bambuddy_api.get_printers.return_value = printers
    bambuddy_api.statuses[9] = bambuddy_api.statuses.pop(X1C)

    await next_refresh(hass, freezer)
    await hass.async_block_till_done()

    assert entry.options["printers"][0]["printer_id"] == 9
    assert ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(X1C))) is None
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"


async def test_an_error_bambuddy_answers_with_is_no_unreachable_bambuddy(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]

    bambuddy_api.get_status.side_effect = BamBuddyApiError(500, "Internal Server Error")
    await next_refresh(hass, freezer)
    assert failure_key(coordinator) == "bad_answer"

    bambuddy_api.get_status.side_effect = BamBuddyConnectionError("GET /printers/1/status: ClientConnectorError")
    await next_refresh(hass, freezer)
    assert failure_key(coordinator) == "update_failed"


async def test_a_rename_survives_a_dropped_poll(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The poll that brought the new name is dropped (a command went out
    meanwhile): the next one still renames the devices, before the minute."""
    entry = await set_up(hass, X1C)
    await past_the_minute(hass, freezer)
    coordinator = entry.runtime_data.printers[X1C]
    printer = printer_info(X1C)
    details_are(bambuddy_api, {**printer, "name": "Lab"})
    renamed = {**bambuddy_api.statuses[X1C], "name": "Lab"}

    async def with_a_command(printer_id: int) -> dict[str, Any]:
        coordinator.note_command()
        return renamed

    reads = bambuddy_api.get_status.side_effect
    bambuddy_api.get_status.side_effect = with_a_command
    await next_refresh(hass, freezer)
    bambuddy_api.get_status.side_effect = reads
    bambuddy_api.statuses[X1C] = renamed
    minute_reads = bambuddy_api.get_ams_labels.await_count
    await next_refresh(hass, freezer)

    assert bambuddy_api.get_ams_labels.await_count == minute_reads
    assert devices_by_identifier(hass, entry)[printer_device(entry, X1C)].name == "Lab (X1C / 00M00A000000001)"


async def test_a_connection_that_never_opened_reads_as_unreachable(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Only a slow answer is slow: a connect that times out is no answer."""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    never = BamBuddyConnectionError("GET /printers/1/status: ConnectionTimeoutError")
    never.__cause__ = aiohttp.ConnectionTimeoutError("connect")
    bambuddy_api.get_status.side_effect = never

    await next_refresh(hass, freezer)

    assert failure_key(coordinator) == "update_failed"


async def test_another_ams_in_the_same_place(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A unit is known by its serial number: another one plugged in where
    the first was is a device of its own, the first keeps its history."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["ams"][0].update({"serial_number": "00600A3B0000009", "sw_ver": "00.00.07.00"})

    await next_refresh(hass, freezer)

    devices = devices_by_identifier(hass, entry)
    new = devices[f"{printer_device(entry, X1C)}_ams_00600A3B0000009"]
    assert (new.name, new.serial_number, new.sw_version) == (
        "Workshop AMS A (AMS / 00600A3B0000009)",
        "00600A3B0000009",
        "00.00.07.00",
    )
    assert devices[ams_device(entry, X1C, 0)].serial_number == "00600A3B0000001"
    old = state_of(hass, "sensor", ams_uid(entry, 0, "humidity"))
    assert old.state == STATE_UNAVAILABLE


async def test_ams_units_keep_their_entities_when_swapped(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Two units change places: each keeps its device, entities and
    history; only the letter in the name follows the place."""
    entry = make_entry(hass, X1C)
    status = bambuddy_api.statuses[X1C]
    second = {**copy.deepcopy(status["ams"][0]), "id": 1, "serial_number": "00600A3B0000007", "humidity": 55}
    status["ams"].append(second)
    await setup_integration(hass, entry)
    humidity = ams_uid(entry, 0, "humidity")
    assert state_of(hass, "sensor", humidity).state == str(status["ams"][0]["humidity"])

    status["ams"][0]["id"], second["id"] = 1, 0
    await past_the_minute(hass, freezer)

    assert state_of(hass, "sensor", humidity).state == str(status["ams"][0]["humidity"])
    devices = devices_by_identifier(hass, entry)
    assert devices[ams_device(entry, X1C, 0)].name == "Workshop AMS B (AMS / 00600A3B0000001)"
    assert devices[f"{printer_device(entry, X1C)}_ams_00600A3B0000007"].name == "Workshop AMS A (AMS / 00600A3B0000007)"


async def test_a_renumbered_printer_is_found_by_its_serial(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A new BamBuddy, a restored database: BamBuddy numbers its printers
    anew, the serial number finds them -- devices and entities stay."""
    listed_with(bambuddy_api, X1C, id=9)
    bambuddy_api.statuses[9] = bambuddy_api.statuses[X1C]
    entry = make_entry(hass, X1C)

    await setup_integration(hass, entry)

    assert entry.options["printers"][0]["printer_id"] == 9
    bambuddy_api.get_status.assert_awaited_with(9)
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"


async def test_an_unplugged_ams_keeps_what_was_known(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its device stays (the user may delete it) and keeps its name, serial
    number and firmware."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["ams"] = []

    await past_the_minute(hass, freezer)

    ams = devices_by_identifier(hass, entry)[ams_device(entry, X1C, 0)]
    assert (ams.name, ams.serial_number, ams.sw_version) == (
        "Workshop AMS A (AMS / 00600A3B0000001)",
        "00600A3B0000001",
        "00.00.06.49",
    )


async def test_the_repair_removes_a_missing_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    """The issue's "Fix" removes the printer here too, with its devices."""
    entry = await set_up(hass, X1C, A1_MINI)
    assert ams_device(entry, A1_MINI, 0) in devices_by_identifier(hass, entry)
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    await reload_entry(hass, entry.entry_id)
    assert await async_setup_component(hass, "repairs", {})
    issue = ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(A1_MINI)))
    assert issue is not None and issue.is_fixable

    client = await hass_client()
    started = await client.post("/api/repairs/issues/fix", json={"handler": DOMAIN, "issue_id": issue.issue_id})
    flow = await started.json()
    assert flow["step_id"] == "confirm"
    # Which entry: two may show the same printer.
    assert flow["description_placeholders"] == {"printer": printer_name(A1_MINI), "entry": entry.title}
    done = await client.post(f"/api/repairs/issues/fix/{flow['flow_id']}", json={})
    assert (await done.json())["type"] == "create_entry"
    await hass.async_block_till_done()

    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C]
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue.issue_id) is None
    assert not [identifier for identifier in devices_by_identifier(hass, entry) if printer_key(A1_MINI) in identifier]


async def test_the_repair_of_a_printer_gone_already(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    """Removed through Configure meanwhile: the repair has nothing left to do."""
    entry = make_entry(hass, X1C, A1_MINI)
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    await setup_integration(hass, entry)
    assert await async_setup_component(hass, "repairs", {})
    client = await hass_client()
    started = await client.post(
        "/api/repairs/issues/fix",
        json={"handler": DOMAIN, "issue_id": missing_issue(entry.entry_id, printer_key(A1_MINI))},
    )
    flow = await started.json()
    hass.config_entries.async_update_entry(entry, options={"printers": [printer_entry(X1C)]})

    done = await client.post(f"/api/repairs/issues/fix/{flow['flow_id']}", json={})

    answer = await done.json()
    assert (answer["type"], answer["reason"]) == ("abort", "already_removed")


async def test_the_repair_removes_the_missing_printer_not_its_new_number(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    """A restored BamBuddy has only the A1 Mini, now under the X1C's old
    number: the repair for the missing X1C must not hit the A1 Mini."""
    entry = make_entry(hass, A1_MINI, X1C)
    bambuddy_api.get_printers.return_value = [{**printers_only(A1_MINI)[0], "id": X1C}]
    bambuddy_api.statuses[X1C] = load_fixture("status_a1mini.json")
    await setup_integration(hass, entry)
    assert await async_setup_component(hass, "repairs", {})
    client = await hass_client()

    started = await client.post(
        "/api/repairs/issues/fix",
        json={"handler": DOMAIN, "issue_id": missing_issue(entry.entry_id, printer_key(X1C))},
    )
    flow = await started.json()
    assert flow["description_placeholders"] == {"printer": printer_name(X1C), "entry": entry.title}
    await client.post(f"/api/repairs/issues/fix/{flow['flow_id']}", json={})
    await hass.async_block_till_done()

    assert [printer["serial_number"] for printer in entry.options["printers"]] == [printer_serial(A1_MINI)]


async def test_an_ams_serial_that_comes_late(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Right after BamBuddy connects, it reports an AMS unit without its
    serial number for a moment: the unit waits for it -- one device, not one
    for its place and one for its serial."""
    status = bambuddy_api.statuses[X1C]
    serial = status["ams"][0]["serial_number"]
    firmware = status["firmware_version"]
    # Its versions (the firmware, the AMS serials) not read yet.
    status["ams"][0]["serial_number"] = ""
    status["firmware_version"] = None
    entry = await set_up(hass, X1C)
    assert not [identifier for identifier in devices_by_identifier(hass, entry) if "_ams_" in identifier]

    status["ams"][0]["serial_number"] = serial
    status["firmware_version"] = firmware
    await next_refresh(hass, freezer)

    assert [identifier for identifier in devices_by_identifier(hass, entry) if "_ams_" in identifier] == [ams_device(entry, X1C, 0)]


async def test_a_unit_with_a_serial_waits_for_its_type(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy may take a unit's serial from its report before the
    printer's version tells its type: the unit waits for the type too, so
    its entity IDs name the right model for good."""
    status = bambuddy_api.statuses[H2D]
    firmware = status["firmware_version"]
    status["firmware_version"] = None
    status["ams"][0]["module_type"] = ""
    entry = await set_up(hass, H2D)
    assert no_entity(hass, "sensor", ams_uid(entry, 0, "slot_1", H2D))

    status["ams"][0]["module_type"] = "n3f"
    status["firmware_version"] = firmware
    await next_refresh(hass, freezer)

    assert entity_id(hass, "sensor", ams_uid(entry, 0, "slot_1", H2D)) == (
        "sensor.ams_2_pro_19c06a000000001_slot_1"
    )


async def test_an_ams_ht_does_not_wait_for_its_type(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """An AMS HT is told by its id: its serial is all it waits for."""
    status = bambuddy_api.statuses[H2D]
    status["firmware_version"] = None
    status["ams"][1]["module_type"] = ""
    entry = await set_up(hass, H2D)

    assert entity_id(hass, "sensor", ams_uid(entry, 128, "humidity", H2D)) == (
        "sensor.ams_ht_19f06a000000002_humidity"
    )


async def test_an_ams_without_serial_comes_after_a_minute(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A unit that never reports a serial is known by its place."""
    bambuddy_api.statuses[X1C]["ams"][0]["serial_number"] = ""
    bambuddy_api.statuses[X1C]["firmware_version"] = None
    entry = await set_up(hass, X1C)

    await past_the_minute(hass, freezer)

    assert f"{printer_device(entry, X1C)}_ams_0" in devices_by_identifier(hass, entry)
    assert state_of(hass, "sensor", f"{entry.entry_id}_p{printer_key(X1C)}_ams0_slot_1").state == "PLA Basic"


async def test_units_bambuddy_names_n_a_are_known_by_their_places(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy may report "N/A" as a unit's serial (an X1C with four AMS,
    two of them so): that is no serial. Taken for one, the two units shared
    a device and only one of them showed."""
    status = bambuddy_api.statuses[X1C]
    second = {**copy.deepcopy(status["ams"][0]), "id": 1}
    status["ams"] = [{**status["ams"][0], "serial_number": "N/A"}, {**second, "serial_number": "N/A"}]
    entry = await set_up(hass, X1C)

    devices = devices_by_identifier(hass, entry)
    unit_b = f"{printer_device(entry, X1C)}_ams_1"
    assert f"{printer_device(entry, X1C)}_ams_0" in devices
    assert unit_b in devices
    assert f"{printer_device(entry, X1C)}_ams_N/A" not in devices
    assert devices[unit_b].serial_number is None
    assert "N/A" not in (devices[unit_b].name or "")
    assert entity_id(hass, "sensor", f"{entry.entry_id}_p{printer_key(X1C)}_ams1_humidity") == (
        f"sensor.ams_{printer_key(X1C).lower()}_b_humidity"
    )


@pytest.mark.parametrize("written", ["N/A", "n/a"])
async def test_a_device_of_the_serial_n_a_goes(hass: HomeAssistant, bambuddy_api: SimpleNamespace, written: str) -> None:
    """A device made for the serial "N/A" (however BamBuddy wrote it) stood
    for whichever unit came first: the setup removes it, with its entities."""
    entry = make_entry(hass, X1C)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={(DOMAIN, f"{printer_device(entry, X1C)}_ams_{written}")}
    )
    stale = f"{entry.entry_id}_p{printer_key(X1C)}_ams{written}_humidity"
    er.async_get(hass).async_get_or_create("sensor", DOMAIN, stale, config_entry=entry, device_id=device.id)
    await setup_integration(hass, entry)

    assert f"{printer_device(entry, X1C)}_ams_{written}" not in devices_by_identifier(hass, entry)
    assert no_entity(hass, "sensor", stale)


async def test_an_ams_known_by_its_place_needs_no_wait(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A unit known by its place before has no serial to wait for: after a
    restart its entities come at once."""
    bambuddy_api.statuses[X1C]["ams"][0]["serial_number"] = ""
    entry = make_entry(hass, X1C)
    dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={(DOMAIN, f"{printer_device(entry, X1C)}_ams_0")}
    )

    await setup_integration(hass, entry)

    assert state_of(hass, "sensor", f"{entry.entry_id}_p{printer_key(X1C)}_ams0_slot_1").state == "PLA Basic"


async def test_two_stored_printers_never_become_one(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """One stored by serial, one by number only: the serial is matched first,
    the number only among the rest."""
    entry = make_entry(hass, X1C)
    hass.config_entries.async_update_entry(
        entry, options={"printers": [{"printer_id": 9, "printer_name": "old"}, printer_entry(X1C)]}
    )
    listed_with(bambuddy_api, X1C, id=9)
    bambuddy_api.statuses[9] = bambuddy_api.statuses[X1C]

    await setup_integration(hass, entry)

    assert [printer["printer_id"] for printer in entry.options["printers"]] == [9, 9]
    assert len(entry.runtime_data.printers) == 1
    assert ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, "id9")) is not None


@pytest.mark.parametrize("read", ["get_statistics", "get_firmware_updates", "get_update_check"])
async def test_a_figure_the_key_may_not_read_starts_no_reauthentication(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, read: str
) -> None:
    """A key whose owner may not read the statistics or the firmware (a custom group): the same key would
    pass the reauthentication again, a loop. Those figures fail; the printers go on."""
    getattr(bambuddy_api, read).side_effect = BamBuddyPermissionError(403, "API key owner does not have 'stats:read' permission")
    entry = await set_up(hass, X1C)
    await past_polls(hass, freezer, 3)

    assert not reauth_flows(hass)
    assert entry.state is ConfigEntryState.LOADED
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"


async def test_an_ams_without_serial_needs_no_wait_once_bambuddy_read_the_versions(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """BamBuddy reads the AMS serials with the printer's firmware version: with that version there, a unit
    without a serial -- BamBuddy drops the AMS Lite's (maziggy/bambuddy#3348) -- will not get one. Its entities come at once."""
    bambuddy_api.statuses[X1C]["ams"][0]["serial_number"] = ""
    entry = await set_up(hass, X1C)

    assert f"{printer_device(entry, X1C)}_ams_0" in devices_by_identifier(hass, entry)
    assert state_of(hass, "sensor", f"{entry.entry_id}_p{printer_key(X1C)}_ams0_slot_1").state == "PLA Basic"


async def test_a_failed_printer_read_at_setup_ends_the_reads_beside_it(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """The setup tries again later; BamBuddy's figures read beside the printers are not left running."""
    ended = asyncio.Event()
    statistics = bambuddy_api.get_statistics.return_value

    async def slow_statistics(**_: Any) -> dict:
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            ended.set()
            raise
        return statistics

    bambuddy_api.get_statistics.side_effect = slow_statistics
    bambuddy_api.get_status.side_effect = BamBuddyConnectionError("refused")
    entry = await try_set_up(hass, X1C)

    assert entry.state is ConfigEntryState.SETUP_RETRY
    assert ended.is_set()


async def test_a_permission_taken_from_the_key_is_named_in_the_log(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """BamBuddy still accepts the key; its owner lost a permission every read
    needs: the guard's check says which, and Home Assistant asks for a new key."""
    await set_up(hass, X1C)
    bambuddy_api.get_status.side_effect = BamBuddyPermissionError(403, "API key does not have 'can_read_status' permission")
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_other.json")

    await next_refresh(hass, freezer)
    await next_refresh(hass, freezer, 6)

    assert len(reauth_flows(hass)) == 1
    assert "lacks permissions the integration needs: read_status" in caplog.text
    assert "is not accepted" not in caplog.text


async def test_printers_configured_while_the_entry_sets_up_are_taken(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Configure saved while the entry still sets up -- its update listener
    comes at the end of the setup: the setup reloads once for it."""
    entry = make_entry(hass, X1C)

    async def saved_meanwhile() -> list[dict[str, Any]]:
        if len(entry.options["printers"]) == 1:
            hass.config_entries.async_update_entry(entry, options={**entry.options, "printers": [*entry.options["printers"], printer_entry(A1_MINI)]})
        return []

    bambuddy_api.get_smart_plugs.side_effect = saved_meanwhile
    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await setup_integration(hass, entry)

    reload.assert_called_once_with(entry.entry_id)
    # The reload's setup opens the live connection, not this one.
    assert not entry.runtime_data.live.enabled


async def test_settings_saved_while_the_entry_unloads_wait_for_its_setup(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """Saved while the entry unloads: the entry on its way out opens
    nothing -- the next setup takes the settings."""
    entry = make_entry(hass, X1C, live_updates=False)
    await setup_integration(hass, entry)
    unload = hass.config_entries.async_unload_platforms

    async def saved_meanwhile(*args: Any, **kwargs: Any) -> bool:
        hass.config_entries.async_update_entry(entry, options={**entry.options, "live_updates": True})
        return await unload(*args, **kwargs)

    with patch.object(hass.config_entries, "async_unload_platforms", saved_meanwhile):
        assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()

    bambuddy_api.get_ws_token.assert_not_awaited()


async def test_settings_saved_while_the_entry_sets_up_apply_without_a_reload(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """Configure -> Settings saved while the entry still sets up: the end of
    the setup takes them as they are then -- no reload for them."""
    entry = make_entry(hass, X1C)

    async def saved_meanwhile() -> list[dict[str, Any]]:
        if "live_updates" not in entry.options:
            hass.config_entries.async_update_entry(entry, options={**entry.options, "live_updates": False, "push_gap": 5})
        return []

    bambuddy_api.get_smart_plugs.side_effect = saved_meanwhile
    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await setup_integration(hass, entry)

    reload.assert_not_called()
    assert not entry.runtime_data.live.enabled
    assert entry.runtime_data.printers[X1C].push_gap == 5


@pytest.mark.parametrize(
    "change",
    [
        {"data": {"url": URL, "api_key": "a-new-key-for-tests", "verify_ssl": True}},
        {"data": {"url": "http://bambuddy.example:8000", "api_key": API_KEY, "verify_ssl": True}},
        {"data": {"url": URL, "api_key": API_KEY, "verify_ssl": False}},
        {"title": "Workshop BamBuddy"},
        {"unique_id": "http://bambuddy.example:8000"},
    ],
)
async def test_every_other_change_still_reloads(hass: HomeAssistant, bambuddy_api: SimpleNamespace, change: dict[str, Any]) -> None:
    """Sign in again, Reconfigure with the same printers, a rename: the
    entry is set up anew with it -- only Configure's settings are taken in
    place."""
    entry = await set_up(hass, X1C)
    runtime = entry.runtime_data

    hass.config_entries.async_update_entry(entry, **change)
    await hass.async_block_till_done(wait_background_tasks=True)

    assert entry.state is ConfigEntryState.LOADED
    assert entry.runtime_data is not runtime


async def test_a_printer_change_still_reloads(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    runtime = entry.runtime_data

    hass.config_entries.async_update_entry(entry, options={**entry.options, "printers": [*entry.options["printers"], printer_entry(A1_MINI)]})
    await hass.async_block_till_done(wait_background_tasks=True)

    assert entry.runtime_data is not runtime
    assert set(entry.runtime_data.printers) == {X1C, A1_MINI}


async def test_a_printer_change_after_a_settings_change_brings_both(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Settings saved, and a printer added right after: one reload, and the
    new setup has the settings too."""
    entry = await set_up(hass, X1C)
    runtime = entry.runtime_data

    hass.config_entries.async_update_entry(entry, options={**entry.options, "live_updates": False, "push_gap": 2})
    hass.config_entries.async_update_entry(entry, options={**entry.options, "printers": [*entry.options["printers"], printer_entry(A1_MINI)]})
    await hass.async_block_till_done(wait_background_tasks=True)

    assert entry.runtime_data is not runtime
    assert not entry.runtime_data.live.enabled
    assert {printer.push_gap for printer in entry.runtime_data.printers.values()} == {2}


async def test_a_slow_answer_reads_as_slow(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A poll that times out says that BamBuddy did not answer in time, not
    that it cannot be reached."""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    timeout = timed_out("GET /printers/1/status")
    bambuddy_api.get_status.side_effect = timeout

    await next_refresh(hass, freezer)

    assert failure_key(coordinator) == "update_timeout"
