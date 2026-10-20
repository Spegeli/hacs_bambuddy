"""Setting an entry up and down: devices, permissions, printers BamBuddy no
longer has, the migration from 1.x, and deleting devices."""
from __future__ import annotations

import asyncio
import copy
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import aiohttp
from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN, Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator, WebSocketGenerator

from custom_components.bambuddy.api import (
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyConnectionError,
    BamBuddyNotFoundError,
    BamBuddyPermissionError,
)
from custom_components.bambuddy.const import DOMAIN
from custom_components.bambuddy.coordinator import find_device, missing_issue, names_issue
from custom_components.bambuddy.plugs import plug_identifier

from tests.conftest import (
    A1_MINI,
    API_KEY,
    H2D,
    P1S,
    URL,
    X1C,
    ams_device,
    ams_uid,
    entity_id,
    instance_uid,
    load_fixture,
    make_entry,
    next_refresh,
    no_entity,
    printer_device,
    printer_entry,
    printer_info,
    printer_key,
    printer_name,
    printer_serial,
    printer_uid,
    printers_but,
    set_up,
    setup_integration,
    state_of,
)


def _devices(hass: HomeAssistant, entry: MockConfigEntry) -> dict[str, dr.DeviceEntry]:
    """The entry's devices by their BamBuddy identifier."""
    return {
        identifier: device
        for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id)
        for domain, identifier in device.identifiers
        if domain == DOMAIN
    }


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

    devices = _devices(hass, entry)
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


async def test_a_read_only_key_creates_no_controls(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Without Control Printer, BamBuddy would refuse every command: no
    button but the status refresh, no select, number, fan or light -- but
    the camera's frame rate, Home Assistant's own setting."""
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")
    entry = await set_up(hass, X1C)

    domains = _domains(hass, entry)
    assert not domains & {Platform.SELECT, Platform.FAN, Platform.LIGHT}
    registry = er.async_get(hass)
    numbers = [e.unique_id for e in er.async_entries_for_config_entry(registry, entry.entry_id) if e.domain == "number"]
    assert numbers == [printer_uid(entry, "camera_fps")]
    buttons = [e.unique_id for e in er.async_entries_for_config_entry(registry, entry.entry_id) if e.domain == "button"]
    assert buttons == [printer_uid(entry, "refresh_status")]
    assert entry.runtime_data.can_control is False


async def test_a_key_that_may_no_longer_control_leaves_no_controls_behind(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """Control Printer turned off for the key: the controls would stay as
    entities no longer provided. They go; the refresh button stays."""
    entry = await set_up(hass, X1C)
    assert Platform.FAN in _domains(hass, entry)
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    registry = er.async_get(hass)
    left = {e.domain for e in er.async_entries_for_config_entry(registry, entry.entry_id)}
    assert not left & {"fan", "light", "select", "switch"}
    numbers = [e.unique_id for e in er.async_entries_for_config_entry(registry, entry.entry_id) if e.domain == "number"]
    assert numbers == [printer_uid(entry, "camera_fps")]
    buttons = [e.unique_id for e in er.async_entries_for_config_entry(registry, entry.entry_id) if e.domain == "button"]
    assert buttons == [printer_uid(entry, "refresh_status")]


async def test_a_poll_from_before_a_command_does_not_undo_it(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A slow BamBuddy: a poll that started before the light was switched
    answers with the light off. It is dropped; the light stays on."""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    light = entity_id(hass, "light", printer_uid(entry, "chamber_light"))
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
    assert hass.states.get(light) is not None


async def test_a_name_given_in_home_assistant_is_explained(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The name goes back to BamBuddy's; Repairs says why,
    once, so it does not look like a fault."""
    entry = await set_up(hass, X1C)
    printer = _devices(hass, entry)[printer_device(entry, X1C)]
    dr.async_get(hass).async_update_device(printer.id, name_by_user="My printer")

    for _ in range(6):
        await next_refresh(hass, freezer)

    issue = ir.async_get(hass).async_get_issue(DOMAIN, names_issue(entry.entry_id, printer_key(X1C)))
    assert issue is not None
    assert issue.translation_placeholders == {"given": "My printer", "name": printer_name(X1C)}
    assert dr.async_get(hass).async_get(printer.id).name_by_user is None  # type: ignore[union-attr]


async def test_each_renamed_printer_is_explained(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Two printers renamed in Home Assistant: a notice for each, not only the last."""
    entry = await set_up(hass, X1C, P1S)
    devices = _devices(hass, entry)
    for printer, name in ((X1C, "Desk printer"), (P1S, "Big printer")):
        dr.async_get(hass).async_update_device(devices[printer_device(entry, printer)].id, name_by_user=name)

    for _ in range(6):
        await next_refresh(hass, freezer)

    given = {
        printer: ir.async_get(hass).async_get_issue(DOMAIN, names_issue(entry.entry_id, printer_key(printer)))
        for printer in (X1C, P1S)
    }
    assert {printer: issue.translation_placeholders["given"] for printer, issue in given.items() if issue} == {
        X1C: "Desk printer",
        P1S: "Big printer",
    }


async def test_with_authentication_off_any_key_controls(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy without authentication answers every request; it has no
    permissions to ask about."""
    bambuddy_api.get_auth_status.return_value = {"auth_enabled": False, "requires_setup": False}
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required")
    entry = await set_up(hass, X1C)

    assert entry.runtime_data.can_control is True
    assert {Platform.LIGHT, Platform.FAN, Platform.NUMBER} <= _domains(hass, entry)


@pytest.mark.parametrize(
    ("failure", "state"),
    [
        (BamBuddyAuthError(401, "Authentication required"), ConfigEntryState.SETUP_ERROR),
        (BamBuddyConnectionError("refused"), ConfigEntryState.SETUP_RETRY),
    ],
)
async def test_setup_failures(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, failure: Exception, state: ConfigEntryState
) -> None:
    """A refused key asks for a new one; an unreachable BamBuddy is tried
    again later."""
    bambuddy_api.get_printers.side_effect = failure
    entry = make_entry(hass, X1C)

    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.state is state
    reauth = [flow for flow in hass.config_entries.flow.async_progress() if flow["context"]["source"] == "reauth"]
    assert bool(reauth) is isinstance(failure, BamBuddyAuthError)


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
    entry = make_entry(hass, X1C)

    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.state is ConfigEntryState.SETUP_ERROR
    assert entry.reason is not None and "too old" in entry.reason


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


async def test_the_missing_printer_s_repair_names_it_as_its_device_does(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """Renamed in BamBuddy since the last start (the device followed), then removed there: the
    repair names the printer as the user sees it now."""
    entry = await set_up(hass, X1C, A1_MINI)
    devices = dr.async_get(hass)
    device = _devices(hass, entry)[printer_device(entry, A1_MINI)]
    devices.async_update_device(device.id, name="Workbench (A1 Mini / 0309DA471800789)")
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    issue = ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(A1_MINI)))
    assert issue is not None
    assert issue.translation_placeholders == {"printer": "Workbench (A1 Mini / 0309DA471800789)"}


async def test_a_missing_printer_comes_back_by_itself(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """While BamBuddy does not list it, its list is read once a minute; once
    the serial is there again, the entry reloads: the printer is back and
    the issue gone. Nothing missing, nothing more is read."""
    everything = load_fixture("printers.json")
    bambuddy_api.get_printers.return_value = [printer for printer in everything if printer["id"] != A1_MINI]
    entry = await set_up(hass, X1C, A1_MINI)
    issue_id = missing_issue(entry.entry_id, printer_key(A1_MINI))
    reads = bambuddy_api.get_printers.await_count

    freezer.tick(61)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert bambuddy_api.get_printers.await_count == reads + 1
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is not None

    bambuddy_api.get_printers.return_value = everything
    freezer.tick(61)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert set(entry.runtime_data.printers) == {X1C, A1_MINI}
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is None
    reads = bambuddy_api.get_printers.await_count
    freezer.tick(61)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert bambuddy_api.get_printers.await_count == reads


async def test_a_missing_printer_is_not_mistaken_for_another(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A stored printer without a serial is not matched to another
    printer's record by its old number -- no reload every minute."""
    everything = load_fixture("printers.json")
    bambuddy_api.get_printers.return_value = [printer for printer in everything if printer["id"] != A1_MINI]
    entry = await set_up(hass, X1C, A1_MINI)
    stored = [dict(printer) for printer in entry.options["printers"]]
    for printer in stored:
        if printer.get("printer_id") == A1_MINI:
            printer.pop("serial_number", None)
    hass.config_entries.async_update_entry(entry, options={**entry.options, "printers": stored})
    await hass.async_block_till_done()
    # BamBuddy renumbers: the X1C now carries the missing printer's old number.
    bambuddy_api.get_printers.return_value = [{**printer, "id": A1_MINI} for printer in everything if printer["id"] == X1C]
    reloads = bambuddy_api.get_version.await_count

    freezer.tick(61)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert bambuddy_api.get_version.await_count == reloads


async def test_looking_for_a_missing_printer_survives_a_failing_list(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    entry = await set_up(hass, X1C, A1_MINI)
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("GET /printers/: ClientConnectorError")

    freezer.tick(61)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert entry.state is ConfigEntryState.LOADED
    assert ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(A1_MINI))) is not None


async def test_removing_a_printer_removes_its_devices(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C, A1_MINI)
    assert ams_device(entry, A1_MINI, 0) in _devices(hass, entry)

    hass.config_entries.async_update_entry(
        entry, options={"printers": [printer_entry(X1C)]}
    )
    await hass.async_block_till_done()

    assert not [identifier for identifier in _devices(hass, entry) if printer_key(A1_MINI) in identifier]
    assert printer_device(entry, X1C) in _devices(hass, entry)


async def _remove_device(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, entry: MockConfigEntry, device: dr.DeviceEntry
) -> dict:
    assert await async_setup_component(hass, "config", {})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "config/device_registry/remove_config_entry",
            "config_entry_id": entry.entry_id,
            "device_id": device.id,
        }
    )
    response: dict = await client.receive_json()
    return response


async def test_deleting_a_printer_device_removes_the_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    entry = await set_up(hass, X1C, A1_MINI)

    response = await _remove_device(hass, hass_ws_client, entry, _devices(hass, entry)[printer_device(entry, A1_MINI)])
    await hass.async_block_till_done()

    assert response["success"]
    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_the_instance_device_cannot_be_deleted(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    entry = await set_up(hass, X1C)

    response = await _remove_device(hass, hass_ws_client, entry, _devices(hass, entry)[entry.entry_id])

    assert not response["success"]
    assert "cannot be deleted here" in response["error"]["message"]


async def test_an_ams_unit_the_printer_reports_stays(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    """It would come back with the next poll."""
    entry = await set_up(hass, X1C)

    response = await _remove_device(hass, hass_ws_client, entry, _devices(hass, entry)[ams_device(entry, X1C, 0)])

    assert not response["success"]
    assert "still reports" in response["error"]["message"]


async def test_a_device_of_an_entry_that_did_not_load(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    """While BamBuddy cannot be reached, nothing reports a unit: its old
    device may go."""
    bambuddy_api.get_version.side_effect = BamBuddyConnectionError("refused")
    entry = make_entry(hass, X1C)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_RETRY
    stale = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={(DOMAIN, f"{printer_device(entry, X1C)}_ams_XYZ")}
    )

    response = await _remove_device(hass, hass_ws_client, entry, stale)

    assert response["success"]


async def test_a_device_nothing_reports_can_go(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    """An AMS unit moved to another printer leaves a device behind."""
    entry = await set_up(hass, X1C)
    stale = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={(DOMAIN, ams_device(entry, X1C, 3))}
    )

    response = await _remove_device(hass, hass_ws_client, entry, stale)

    assert response["success"]


async def test_migration_from_version_1(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """1.x stored host and port: 2.0 makes them a URL, and the entities it
    merged or replaced leave the registry; the others keep their IDs."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="BamBuddy (bambuddy.local)",
        data={"host": "bambuddy.local", "port": 8000, "api_key": API_KEY, "version": "0.2.4.5"},
        options={"printers": [{"printer_id": X1C, "printer_name": printer_name(X1C)}]},
        unique_id="bambuddy_bambuddy.local_8000",
        version=1,
    )
    entry.add_to_hass(hass)
    dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, f"{entry.entry_id}_printer_{X1C}")},
        serial_number=printer_serial(X1C),
    )
    registry = er.async_get(hass)
    kept = registry.async_get_or_create(
        "sensor", DOMAIN, f"{entry.entry_id}_p{X1C}_nozzle_temp", config_entry=entry, suggested_object_id="x1c_nozzle"
    )
    dropped = [
        registry.async_get_or_create("sensor", DOMAIN, f"{entry.entry_id}_p{X1C}_gcode_file", config_entry=entry),
        registry.async_get_or_create("sensor", DOMAIN, f"{entry.entry_id}_health_status", config_entry=entry),
        registry.async_get_or_create("switch", DOMAIN, f"{entry.entry_id}_p{X1C}_chamber_light", config_entry=entry),
        registry.async_get_or_create("binary_sensor", DOMAIN, f"{entry.entry_id}_p{X1C}_hms_errors", config_entry=entry),
    ]

    await setup_integration(hass, entry)

    assert (entry.version, entry.minor_version) == (2, 2)
    assert dict(entry.data) == {"url": "http://bambuddy.local:8000", "api_key": API_KEY, "verify_ssl": True}
    assert entry.unique_id == "http://bambuddy.local:8000"
    renamed = registry.async_get("sensor.x1c_nozzle")
    assert renamed is not None and renamed.unique_id == printer_uid(entry, "nozzle_temp")
    assert kept.entity_id == "sensor.x1c_nozzle"
    # The same entity, not a second one beside it.
    assert [
        entity.entity_id
        for entity in er.async_entries_for_config_entry(registry, entry.entry_id)
        if entity.unique_id == printer_uid(entry, "nozzle_temp")
    ] == ["sensor.x1c_nozzle"]
    for entity in dropped:
        assert registry.async_get(entity.entity_id) is None, entity.unique_id


async def test_a_newer_entry_version_is_refused(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """After a downgrade: this code cannot read what a newer one stored."""
    entry = MockConfigEntry(domain=DOMAIN, data={}, version=3)
    entry.add_to_hass(hass)

    await hass.config_entries.async_setup(entry.entry_id)

    assert entry.state is ConfigEntryState.MIGRATION_ERROR


async def test_the_firmware_follows_on_the_device_page(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Home Assistant reads a device's details when its first entity is
    added; a firmware update after that reaches the device all the same."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["firmware_version"] = "01.09.02.00"

    await next_refresh(hass, freezer)

    assert _devices(hass, entry)[printer_device(entry, X1C)].sw_version == "01.09.02.00"


@pytest.mark.parametrize(
    "refusal",
    [
        BamBuddyAuthError(401, "Authentication required"),
        # Read Status taken from the key: the printers' own reads, unlike BamBuddy's figures, ask for a new one.
        BamBuddyPermissionError(403, "API key does not have 'can_read_status' permission"),
    ],
)
async def test_a_refused_key_while_running_asks_for_a_new_one(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, refusal: Exception
) -> None:
    await set_up(hass, X1C)
    bambuddy_api.get_status.side_effect = refusal

    await next_refresh(hass, freezer)

    assert [flow["context"]["source"] for flow in hass.config_entries.flow.async_progress()] == ["reauth"]


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
        "reset_slot",
        "refresh_rfid",
    }


async def test_a_printer_deleted_in_bambuddy_while_running_raises_the_issue(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Not only at the next restart: its number answers 404, BamBuddy's list no longer has it."""
    entry = await set_up(hass, X1C, A1_MINI)
    bambuddy_api.get_status.side_effect = lambda printer_id: (
        _raise(BamBuddyNotFoundError(404, "Printer not found")) if printer_id == X1C else copy.deepcopy(bambuddy_api.statuses[printer_id])
    )
    bambuddy_api.get_printers.return_value = printers_but(X1C)

    await next_refresh(hass, freezer)
    await hass.async_block_till_done()

    assert ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(X1C))) is not None
    assert entry.state is ConfigEntryState.LOADED
    assert state_of(hass, "sensor", printer_uid(entry, "status", A1_MINI)).state != "unavailable"


def _raise(err: Exception) -> None:
    raise err


async def test_a_404_of_a_printer_bambuddy_still_lists_raises_no_issue(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """One 404 while BamBuddy still lists the printer under its number: no "remove this printer" repair
    that would stay after it answers again."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_status.side_effect = BamBuddyNotFoundError(404, "Printer not found")

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)
        assert ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(X1C))) is None
        bambuddy_api.get_status.side_effect = lambda printer_id: copy.deepcopy(bambuddy_api.statuses[printer_id])
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
    bambuddy_api.get_status.side_effect = lambda printer_id: (
        copy.deepcopy(bambuddy_api.statuses[printer_id])
        if printer_id in bambuddy_api.statuses
        else _raise(BamBuddyNotFoundError(404, "Printer not found"))
    )

    await next_refresh(hass, freezer)
    await hass.async_block_till_done()

    assert entry.options["printers"][0]["printer_id"] == 9
    assert ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(X1C))) is None
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"


async def test_an_unreachable_bambuddy_is_tried_again(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Already its version cannot be read: Home Assistant tries again later."""
    bambuddy_api.get_version.side_effect = BamBuddyConnectionError("refused")
    entry = make_entry(hass, X1C)

    await hass.config_entries.async_setup(entry.entry_id)

    assert entry.state is ConfigEntryState.SETUP_RETRY


async def test_an_error_bambuddy_answers_with_is_no_unreachable_bambuddy(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]

    bambuddy_api.get_status.side_effect = BamBuddyApiError(500, "Internal Server Error")
    await next_refresh(hass, freezer)
    assert coordinator.last_exception.translation_key == "bad_answer"  # type: ignore[union-attr]

    bambuddy_api.get_status.side_effect = BamBuddyConnectionError("GET /printers/1/status: ClientConnectorError")
    await next_refresh(hass, freezer)
    assert coordinator.last_exception.translation_key == "update_failed"  # type: ignore[union-attr]


async def test_bambuddys_figures_do_not_hold_up_the_printers(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy's statistics fail: its figures wait for the next minute,
    the printers do not."""
    bambuddy_api.get_statistics.side_effect = BamBuddyConnectionError("timeout")
    entry = await set_up(hass, X1C)

    assert entry.state is ConfigEntryState.LOADED
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == STATE_UNAVAILABLE
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"
    assert _devices(hass, entry)[entry.entry_id].sw_version == "1.2.5.7"

    bambuddy_api.get_statistics.side_effect = None
    for _ in range(6):
        await next_refresh(hass, freezer)
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == "812"


async def test_bambuddy_answers_without_its_system_information(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its archive walk may not finish in time at setup: BamBuddy still reads
    as online and its statistics come; the figures of the system information
    stay unknown until its next read."""
    bambuddy_api.get_system_info.side_effect = BamBuddyConnectionError("GET /system/info: TimeoutError")
    entry = await set_up(hass, X1C)

    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == STATE_ON
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == "812"
    assert state_of(hass, "sensor", instance_uid(entry, "printers_connected")).state == STATE_UNKNOWN

    bambuddy_api.get_system_info.side_effect = None
    for _ in range(30):
        await next_refresh(hass, freezer)
    assert state_of(hass, "sensor", instance_uid(entry, "printers_connected")).state == "2"


async def test_a_slow_answer_reads_as_slow(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A poll that times out says that BamBuddy did not answer in time, not
    that it cannot be reached."""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    timeout = BamBuddyConnectionError("GET /printers/1/status: TimeoutError")
    timeout.__cause__ = TimeoutError()
    bambuddy_api.get_status.side_effect = timeout

    await next_refresh(hass, freezer)

    assert coordinator.last_exception.translation_key == "update_timeout"  # type: ignore[union-attr]


async def test_setup_waits_for_the_system_information_only_briefly(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The printers come after it at setup: there it gets 10 s, later 30 s."""
    await set_up(hass, X1C)
    assert bambuddy_api.get_system_info.await_args.kwargs == {"patient": False}

    for _ in range(30):
        await next_refresh(hass, freezer)

    assert bambuddy_api.get_system_info.await_args.kwargs == {"patient": True}


async def test_a_rename_survives_a_dropped_poll(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The poll that brought the new name is dropped (a command went out
    meanwhile): the next one still renames the devices, before the minute."""
    entry = await set_up(hass, X1C)
    for _ in range(6):
        await next_refresh(hass, freezer)
    coordinator = entry.runtime_data.printers[X1C]
    printer = printer_info(X1C)
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = {**printer, "name": "Lab"}
    renamed = {**bambuddy_api.statuses[X1C], "name": "Lab"}

    async def with_a_command(printer_id: int) -> dict[str, Any]:
        coordinator.note_command()
        return renamed

    reads = bambuddy_api.get_status.side_effect
    bambuddy_api.get_status.side_effect = with_a_command
    await next_refresh(hass, freezer)
    bambuddy_api.get_status.side_effect = reads
    bambuddy_api.statuses[X1C] = renamed
    runtime_reads = bambuddy_api.get_runtime.await_count
    await next_refresh(hass, freezer)

    assert bambuddy_api.get_runtime.await_count == runtime_reads
    assert _devices(hass, entry)[printer_device(entry, X1C)].name == "Lab (X1C / 00M00A000000001)"


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

    assert coordinator.last_exception.translation_key == "update_failed"  # type: ignore[union-attr]


async def test_the_log_names_a_printer_as_bambuddy_does(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """A failed read names the printer as the user knows it, not by
    BamBuddy's number, which Home Assistant shows nowhere -- and a printer
    renamed in BamBuddy by its new name."""
    entry = await set_up(hass, X1C)
    reads = bambuddy_api.get_status.side_effect
    bambuddy_api.get_status.side_effect = BamBuddyConnectionError("GET /printers/1/status: ConnectionTimeoutError")

    await next_refresh(hass, freezer)

    assert "Error fetching bambuddy Workshop data" in caplog.text
    assert "bambuddy printer 1" not in caplog.text
    bambuddy_api.get_status.side_effect = reads
    printer = printer_info(X1C)
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = {**printer, "name": "Lab"}
    bambuddy_api.statuses[X1C]["name"] = "Lab"
    await next_refresh(hass, freezer)
    assert entry.runtime_data.printers[X1C].name == "bambuddy Lab"


async def test_the_system_information_is_read_every_five_minutes(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """For it BamBuddy walks through its whole archive; the statistics come
    every minute. A new BamBuddy version shows on its device with it."""
    entry = await set_up(hass, X1C)
    system = load_fixture("system_info.json")
    bambuddy_api.get_system_info.return_value = {**system, "app": {**system["app"], "version": "1.2.6"}}

    for _ in range(27):
        await next_refresh(hass, freezer)
    assert bambuddy_api.get_system_info.await_count == 1
    for _ in range(3):
        await next_refresh(hass, freezer)

    assert bambuddy_api.get_system_info.await_count == 2
    assert bambuddy_api.get_statistics.await_count >= 5
    assert _devices(hass, entry)[entry.entry_id].sw_version == "1.2.6"


async def test_the_device_name_follows_bambuddy(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy's name is the one: renamed there, the device follows within a
    minute -- and a name given in Home Assistant goes back to it."""
    entry = await set_up(hass, X1C)
    registry = dr.async_get(hass)
    printer = _devices(hass, entry)[printer_device(entry, X1C)]
    registry.async_update_device(printer.id, name_by_user="My printer")
    bambuddy_api.get_runtime.return_value = {"printer_name": "Lab", "total_hours": 560.0}

    for _ in range(6):
        await next_refresh(hass, freezer)

    devices = _devices(hass, entry)
    printer = devices[printer_device(entry, X1C)]
    assert (printer.name, printer.name_by_user) == ("Lab (X1C / 00M00A000000001)", None)
    assert devices[ams_device(entry, X1C, 0)].name == "Lab AMS A (AMS / 00600A3B0000001)"


async def test_a_name_changed_in_bambuddy_follows_at_the_next_refresh(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The status names the printer: a new name there reads its details and
    renames its devices at once, not at the next minute."""
    entry = await set_up(hass, X1C)
    for _ in range(6):
        await next_refresh(hass, freezer)
    printer = printer_info(X1C)
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = {**printer, "name": "Lab"}
    bambuddy_api.statuses[X1C]["name"] = "Lab"
    runtime_reads = bambuddy_api.get_runtime.await_count

    await next_refresh(hass, freezer)

    assert bambuddy_api.get_runtime.await_count == runtime_reads
    devices = _devices(hass, entry)
    assert devices[printer_device(entry, X1C)].name == "Lab (X1C / 00M00A000000001)"
    assert devices[ams_device(entry, X1C, 0)].name == "Lab AMS A (AMS / 00600A3B0000001)"


async def test_another_ams_in_the_same_place(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A unit is known by its serial number: another one plugged in where
    the first was is a device of its own, the first keeps its history."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["ams"][0].update({"serial_number": "00600A3B0000009", "sw_ver": "00.00.07.00"})

    await next_refresh(hass, freezer)

    devices = _devices(hass, entry)
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
    for _ in range(6):
        await next_refresh(hass, freezer)

    assert state_of(hass, "sensor", humidity).state == str(status["ams"][0]["humidity"])
    devices = _devices(hass, entry)
    assert devices[ams_device(entry, X1C, 0)].name == "Workshop AMS B (AMS / 00600A3B0000001)"
    assert devices[f"{printer_device(entry, X1C)}_ams_00600A3B0000007"].name == "Workshop AMS A (AMS / 00600A3B0000007)"


async def test_a_renumbered_printer_is_found_by_its_serial(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A new BamBuddy, a restored database: BamBuddy numbers its printers
    anew, the serial number finds them -- devices and entities stay."""
    printers = load_fixture("printers.json")
    x1c = next(printer for printer in printers if printer["id"] == X1C)
    x1c["id"] = 9
    bambuddy_api.get_printers.return_value = printers
    bambuddy_api.statuses[9] = bambuddy_api.statuses[X1C]
    entry = make_entry(hass, X1C)

    await setup_integration(hass, entry)

    assert entry.options["printers"][0]["printer_id"] == 9
    bambuddy_api.get_status.assert_awaited_with(9)
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"


async def test_migration_to_serial_numbers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """2.1 knew printers and AMS units by BamBuddy's numbers: 2.2 by their
    serial numbers, from the device registry. Entity IDs, and so their
    history, stay."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="BamBuddy (bambuddy.local)",
        data={"url": URL, "api_key": API_KEY, "verify_ssl": True},
        options={"printers": [{"printer_id": X1C, "printer_name": printer_name(X1C)}]},
        unique_id=URL,
        version=2,
        minor_version=1,
    )
    entry.add_to_hass(hass)
    devices = dr.async_get(hass)
    printer = devices.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, f"{entry.entry_id}_printer_{X1C}")},
        serial_number=printer_serial(X1C),
    )
    devices.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, f"{entry.entry_id}_printer_{X1C}_ams_0")},
        serial_number="00600A3B0000001",
    )
    registry = er.async_get(hass)
    status = registry.async_get_or_create(
        "sensor", DOMAIN, f"{entry.entry_id}_p{X1C}_status", config_entry=entry, device_id=printer.id,
        suggested_object_id="x1c_old_status",
    )
    slot = registry.async_get_or_create(
        "sensor", DOMAIN, f"{entry.entry_id}_p{X1C}_ams0_slot_1", config_entry=entry, suggested_object_id="x1c_old_slot",
    )

    await setup_integration(hass, entry)

    assert (entry.version, entry.minor_version) == (2, 2)
    assert entry.options["printers"] == [printer_entry(X1C)]
    assert registry.async_get(status.entity_id).unique_id == printer_uid(entry, "status")  # type: ignore[union-attr]
    assert registry.async_get(slot.entity_id).unique_id == ams_uid(entry, 0, "slot_1")  # type: ignore[union-attr]
    assert status.entity_id == "sensor.x1c_old_status"
    assert printer_device(entry, X1C) in _devices(hass, entry)
    assert ams_device(entry, X1C, 0) in _devices(hass, entry)


async def test_new_entity_ids_follow_model_and_serial(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Whatever the printer is called in BamBuddy, in any language: model,
    serial number and the entity's key."""
    hass.config.language = "de"
    entry = await set_up(hass, H2D)
    registry = er.async_get(hass)

    assert registry.async_get_entity_id("sensor", DOMAIN, printer_uid(entry, "status", H2D)) == (
        "sensor.h2d_0948ad000000004_print_status"
    )
    assert registry.async_get_entity_id("sensor", DOMAIN, ams_uid(entry, 0, "slot_1", H2D)) == (
        "sensor.h2d_0948ad000000004_ams_a_slot_1"
    )
    assert registry.async_get_entity_id("sensor", DOMAIN, ams_uid(entry, 128, "humidity", H2D)) == (
        "sensor.h2d_0948ad000000004_ams_ht_a_humidity"
    )
    assert registry.async_get_entity_id("update", DOMAIN, f"{entry.entry_id}_p{printer_key(H2D)}_firmware") == (
        "update.h2d_0948ad000000004_firmware"
    )
    # The instance's: BamBuddy and the key -- not its address, which may change.
    assert registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_total_prints") == (
        "sensor.bambuddy_total_prints"
    )
    assert registry.async_get_entity_id("binary_sensor", DOMAIN, f"{entry.entry_id}_connected") == (
        "binary_sensor.bambuddy_online"
    )
    assert registry.async_get_entity_id("update", DOMAIN, f"{entry.entry_id}_bambuddy_update") == (
        "update.bambuddy_update"
    )


async def test_the_stored_name_follows_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entry keeps each printer's current name: a printer missing later
    is named as it was last seen."""
    entry = make_entry(hass, X1C)
    hass.config_entries.async_update_entry(entry, options={"printers": [{**printer_entry(X1C), "printer_name": "old"}]})

    await setup_integration(hass, entry)

    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_an_unplugged_ams_keeps_what_was_known(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its device stays (the user may delete it) and keeps its name, serial
    number and firmware."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["ams"] = []

    for _ in range(6):
        await next_refresh(hass, freezer)

    ams = _devices(hass, entry)[ams_device(entry, X1C, 0)]
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
    assert ams_device(entry, A1_MINI, 0) in _devices(hass, entry)
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert await async_setup_component(hass, "repairs", {})
    issue = ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(A1_MINI)))
    assert issue is not None and issue.is_fixable

    client = await hass_client()
    started = await client.post("/api/repairs/issues/fix", json={"handler": DOMAIN, "issue_id": issue.issue_id})
    flow = await started.json()
    assert flow["step_id"] == "confirm"
    assert flow["description_placeholders"] == {"printer": printer_name(A1_MINI)}
    done = await client.post(f"/api/repairs/issues/fix/{flow['flow_id']}", json={})
    assert (await done.json())["type"] == "create_entry"
    await hass.async_block_till_done()

    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C]
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue.issue_id) is None
    assert not [identifier for identifier in _devices(hass, entry) if printer_key(A1_MINI) in identifier]


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

    assert ((await done.json())["type"], (await done.json())["reason"]) == ("abort", "already_removed")


async def test_the_repair_removes_the_missing_printer_not_its_new_number(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    """A restored BamBuddy has only the A1 Mini, now under the X1C's old
    number: the repair for the missing X1C must not hit the A1 Mini."""
    entry = make_entry(hass, A1_MINI, X1C)
    printers = load_fixture("printers.json")
    a1_mini = next(printer for printer in printers if printer["id"] == A1_MINI)
    bambuddy_api.get_printers.return_value = [{**a1_mini, "id": X1C}]
    bambuddy_api.statuses[X1C] = load_fixture("status_a1mini.json")
    await setup_integration(hass, entry)
    assert await async_setup_component(hass, "repairs", {})
    client = await hass_client()

    started = await client.post(
        "/api/repairs/issues/fix",
        json={"handler": DOMAIN, "issue_id": missing_issue(entry.entry_id, printer_key(X1C))},
    )
    flow = await started.json()
    assert flow["description_placeholders"] == {"printer": printer_name(X1C)}
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
    assert not [identifier for identifier in _devices(hass, entry) if "_ams_" in identifier]

    status["ams"][0]["serial_number"] = serial
    status["firmware_version"] = firmware
    await next_refresh(hass, freezer)

    assert [identifier for identifier in _devices(hass, entry) if "_ams_" in identifier] == [ams_device(entry, X1C, 0)]


async def test_an_ams_without_serial_comes_after_a_minute(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A unit that never reports a serial is known by its place."""
    bambuddy_api.statuses[X1C]["ams"][0]["serial_number"] = ""
    bambuddy_api.statuses[X1C]["firmware_version"] = None
    entry = await set_up(hass, X1C)

    for _ in range(6):
        await next_refresh(hass, freezer)

    assert f"{printer_device(entry, X1C)}_ams_0" in _devices(hass, entry)
    assert state_of(hass, "sensor", f"{entry.entry_id}_p{printer_key(X1C)}_ams0_slot_1").state == "PLA Basic"


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
    printers = load_fixture("printers.json")
    x1c = next(printer for printer in printers if printer["id"] == X1C)
    bambuddy_api.get_printers.return_value = [{**x1c, "id": 9}]
    bambuddy_api.statuses[9] = bambuddy_api.statuses[X1C]

    await setup_integration(hass, entry)

    assert [printer["printer_id"] for printer in entry.options["printers"]] == [9, 9]
    assert len(entry.runtime_data.printers) == 1
    assert ir.async_get(hass).async_get_issue(DOMAIN, missing_issue(entry.entry_id, "id9")) is not None


async def test_migration_keeps_a_unit_seen_twice_apart(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Under 2.1 a unit moved to another place left both place devices with
    its serial: the second keeps its place, and the migration goes through.
    A printer never set up has no device to rename; setup finds it by its
    number."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="BamBuddy (bambuddy.local)",
        data={"url": URL, "api_key": API_KEY, "verify_ssl": True},
        options={
            "printers": [
                {"printer_id": X1C, "printer_name": printer_name(X1C)},
                {"printer_id": A1_MINI, "printer_name": printer_name(A1_MINI)},
            ]
        },
        unique_id=URL,
        version=2,
        minor_version=1,
    )
    entry.add_to_hass(hass)
    devices = dr.async_get(hass)
    devices.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, f"{entry.entry_id}_printer_{X1C}")},
        serial_number=printer_serial(X1C),
    )
    for place in (0, 1):
        devices.async_get_or_create(
            config_entry_id=entry.entry_id,
            identifiers={(DOMAIN, f"{entry.entry_id}_printer_{X1C}_ams_{place}")},
            serial_number="00600A3B0000001",
        )

    await setup_integration(hass, entry)

    assert (entry.version, entry.minor_version) == (2, 2)
    identifiers = _devices(hass, entry)
    assert ams_device(entry, X1C, 0) in identifiers
    assert f"{printer_device(entry, X1C)}_ams_1" in identifiers
    assert entry.options["printers"] == [printer_entry(X1C), printer_entry(A1_MINI)]


async def test_a_model_bambuddy_detects_later(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Added in BamBuddy by hand without a model, a printer has none until
    someone enters it there: asked again once a minute. Once BamBuddy has
    it, the entry reloads -- the name, the device and the model's entities
    follow. Until then only what every printer has: no fans or SD card an
    A1 might lack."""
    printers = load_fixture("printers.json")
    x1c = next(printer for printer in printers if printer["id"] == X1C)
    bambuddy_api.get_printers.return_value = [{**x1c, "model": None}]
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = {**x1c, "model": None}
    entry = await set_up(hass, X1C)
    registry = er.async_get(hass)
    device = _devices(hass, entry)[printer_device(entry, X1C)]
    assert (device.name, device.model) == ("Workshop (00M00A000000001)", None)
    # The X1 series' detections, its auxiliary and chamber fans and SD card come with the model.
    for domain, key in (("switch", "ai_monitoring"), ("fan", "aux_fan"), ("fan", "chamber_fan"), ("binary_sensor", "sdcard")):
        assert no_entity(hass, domain, printer_uid(entry, key)), key

    bambuddy_api.get_printers.return_value = printers
    bambuddy_api.get_printer.return_value = x1c
    for _ in range(6):
        await next_refresh(hass, freezer)
    await hass.async_block_till_done()

    device = _devices(hass, entry)[printer_device(entry, X1C)]
    assert (device.name, device.model) == (printer_name(X1C), "X1C")
    for domain, key in (("switch", "ai_monitoring"), ("fan", "aux_fan"), ("fan", "chamber_fan"), ("binary_sensor", "sdcard")):
        assert registry.async_get_entity_id(domain, DOMAIN, printer_uid(entry, key)) is not None, key
    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_bambuddys_details_are_read_once_a_minute(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """With the runtime counter, not at setup -- it has just read the list --
    and not on every refresh: the address may change, and the number must
    still be this printer's. A known model does not reload anything."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_printer.assert_not_awaited()
    x1c = printer_info(X1C)
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = {**x1c, "ip_address": "192.168.1.77"}

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        for _ in range(12):
            await next_refresh(hass, freezer)

    assert bambuddy_api.get_printer.await_count == bambuddy_api.get_runtime.await_count - 1 >= 2
    reload.assert_not_called()
    assert state_of(hass, "sensor", printer_uid(entry, "ip_address")).state == "192.168.1.77"


async def test_another_printer_under_the_number_is_not_this_one(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """SQLite gives a new printer the number of a deleted newest one, and a
    restored database numbers anew: BamBuddy's printer 1 is now the A1 Mini.
    The X1C's entities neither show it nor send it a command; the entry
    reloads, and finds the X1C again by its serial, or reports it missing."""
    entry = await set_up(hass, X1C)
    a1_mini = printer_info(A1_MINI)
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = {**a1_mini, "id": X1C}
    bambuddy_api.statuses[X1C] = load_fixture("status_a1mini.json")

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        for _ in range(6):
            await next_refresh(hass, freezer)
        # Nothing reaches the other printer before the reload.
        device = _devices(hass, entry)[printer_device(entry, X1C)]
        with pytest.raises(ServiceValidationError, match="another printer"):
            await hass.services.async_call(DOMAIN, "home_axes", {"device_id": device.id}, blocking=True)
        for _ in range(3):
            await next_refresh(hass, freezer)

    reload.assert_called_once_with(entry.entry_id)
    bambuddy_api.home_axes.assert_not_awaited()
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == STATE_UNAVAILABLE
    device = _devices(hass, entry)[printer_device(entry, X1C)]
    assert device.name == printer_name(X1C)


async def test_a_printer_bambuddy_had_not_reached_yet_completes_itself(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy restarted while the H2D was off, then Home Assistant set the
    entry up: BamBuddy had nothing but its defaults for it -- no chamber, no
    AMS backup. Once the printer reports, the entry reloads once and the
    printer gets what it has."""
    never = load_fixture("status_never.json")
    never["id"] = H2D
    bambuddy_api.statuses[H2D] = never
    entry = await set_up(hass, H2D)
    registry = er.async_get(hass)
    keys = (("sensor", "chamber_temp"), ("number", "chamber_target"), ("switch", "ams_filament_backup"))
    assert all(no_entity(hass, domain, printer_uid(entry, key, H2D)) for domain, key in keys)

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        for _ in range(3):
            await next_refresh(hass, freezer)
        reload.assert_not_called()
        bambuddy_api.statuses[H2D] = load_fixture("status_h2d.json")
        for _ in range(3):
            await next_refresh(hass, freezer)
    reload.assert_called_once_with(entry.entry_id)

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert all(registry.async_get_entity_id(domain, DOMAIN, printer_uid(entry, key, H2D)) for domain, key in keys)


async def test_asking_for_the_model_may_fail(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy refuses the question: the printer goes on without a model and
    is asked again a minute later."""
    x1c = printer_info(X1C)
    bambuddy_api.get_printers.return_value = [{**x1c, "model": None}]
    bambuddy_api.get_printer.side_effect = BamBuddyConnectionError("refused")
    entry = await set_up(hass, X1C)

    for _ in range(12):
        await next_refresh(hass, freezer)

    assert entry.state is ConfigEntryState.LOADED
    assert _devices(hass, entry)[printer_device(entry, X1C)].model is None
    # Once a minute, with the runtime counter -- not at setup, which has just
    # read the list, and not on every refresh.
    assert bambuddy_api.get_printer.await_count == bambuddy_api.get_runtime.await_count - 1 >= 2


async def test_a_model_found_reloads_once(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The model is kept at once: until the reload runs, the next minute's
    answer reloads nothing again."""
    x1c = printer_info(X1C)
    bambuddy_api.get_printers.return_value = [{**x1c, "model": None}]
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = x1c
    entry = make_entry(hass, X1C)
    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await setup_integration(hass, entry)
        for _ in range(12):
            await next_refresh(hass, freezer)

    reload.assert_called_once_with(entry.entry_id)
    assert bambuddy_api.get_printer.await_count == 2


async def test_two_printers_get_their_models(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    printers = load_fixture("printers.json")
    chosen = [printer for printer in printers if printer["id"] in (X1C, A1_MINI)]
    bambuddy_api.get_printers.return_value = [{**printer, "model": None} for printer in chosen]
    bambuddy_api.get_printer.side_effect = lambda printer_id: {
        **next(p for p in chosen if p["id"] == printer_id), "model": None
    }
    entry = await set_up(hass, X1C, A1_MINI)

    bambuddy_api.get_printers.return_value = chosen
    bambuddy_api.get_printer.side_effect = lambda printer_id: next(p for p in chosen if p["id"] == printer_id)
    for _ in range(6):
        await next_refresh(hass, freezer)
    await hass.async_block_till_done()

    devices = _devices(hass, entry)
    assert entry.state is ConfigEntryState.LOADED
    assert (devices[printer_device(entry, X1C)].model, devices[printer_device(entry, A1_MINI)].model) == ("X1C", "A1 Mini")
    # Both models in the same minute: one reload, not one per printer.
    assert bambuddy_api.get_printers.await_count == 2


async def test_one_reload_for_several_printers(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Two printers find their model before the reload runs: the entry
    reloads once."""
    chosen = [printer for printer in load_fixture("printers.json") if printer["id"] in (X1C, A1_MINI)]
    bambuddy_api.get_printers.return_value = [{**printer, "model": None} for printer in chosen]
    bambuddy_api.get_printer.side_effect = lambda printer_id: next(p for p in chosen if p["id"] == printer_id)
    entry = make_entry(hass, X1C, A1_MINI)
    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await setup_integration(hass, entry)
        for _ in range(6):
            await next_refresh(hass, freezer)

    assert bambuddy_api.get_printer.await_count == 2
    reload.assert_called_once_with(entry.entry_id)



@pytest.mark.parametrize("read", ["get_statistics", "get_firmware_updates", "get_update_check"])
async def test_a_figure_the_key_may_not_read_starts_no_reauthentication(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, read: str
) -> None:
    """A key whose owner may not read the statistics or the firmware (a custom group): the same key would
    pass the reauthentication again, a loop. Those figures fail; the printers go on."""
    getattr(bambuddy_api, read).side_effect = BamBuddyPermissionError(403, "API key owner does not have 'stats:read' permission")
    entry = await set_up(hass, X1C)
    for _ in range(3):
        await next_refresh(hass, freezer)

    assert not [flow for flow in hass.config_entries.flow.async_progress() if flow["context"].get("source") == "reauth"]
    assert entry.state is ConfigEntryState.LOADED
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"



def _listed_as(bambuddy_api: SimpleNamespace, printer_id: int, **fields: object) -> dict:
    printers = load_fixture("printers.json")
    for printer in printers:
        if printer["id"] == printer_id:
            printer.update(fields)
    bambuddy_api.get_printers.return_value = printers
    return next(printer for printer in printers if printer["id"] == printer_id)


async def test_a_printer_stored_under_its_code_shows_its_model(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy may store the model code (BL-P002): the device page and its name say "X1"."""
    _listed_as(bambuddy_api, X1C, model="BL-P002")
    entry = await set_up(hass, X1C)

    device = _devices(hass, entry)[printer_device(entry, X1C)]
    assert (device.model, device.name) == ("X1", "Workshop (X1 / 00M00A000000001)")


async def test_a_model_changed_in_bambuddy_reloads(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The model corrected in BamBuddy (X1C to X1E): the device, its name and the model's entities follow
    with one reload, as with a model that comes later."""
    entry = await set_up(hass, X1C)
    x1c = printer_info(X1C)
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = {**x1c, "model": "X1E"}

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        for _ in range(6):
            await next_refresh(hass, freezer)

    reload.assert_called_once_with(entry.entry_id)


async def test_the_same_model_in_another_spelling_reloads_nothing(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    x1c = printer_info(X1C)
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = {**x1c, "model": " x1c "}

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        for _ in range(6):
            await next_refresh(hass, freezer)

    reload.assert_not_called()
    assert entry.state is ConfigEntryState.LOADED


@pytest.mark.parametrize("field", ["exhaust_fan_present", "left_aux_fan_speed"])
async def test_a_fan_kit_bambuddy_reports_after_setup_reloads_once(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, field: str
) -> None:
    """BamBuddy learns of the P2S's exhaust fan kit or left auxiliary fan from the printer's first full
    airduct report, a moment after it connects: set up before that, the fan comes with one reload."""
    _listed_as(bambuddy_api, X1C, model="P2S")
    bambuddy_api.statuses[X1C].update({"exhaust_fan_present": False, "left_aux_fan_speed": None})
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C][field] = True if field == "exhaust_fan_present" else 0

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        for _ in range(3):
            await next_refresh(hass, freezer)

    reload.assert_called_once_with(entry.entry_id)



async def test_an_ams_without_serial_needs_no_wait_once_bambuddy_read_the_versions(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """BamBuddy reads the AMS serials with the printer's firmware version: with that version there, a unit
    without a serial -- an AMS Lite never has one -- will not get one. Its entities come at once."""
    bambuddy_api.statuses[X1C]["ams"][0]["serial_number"] = ""
    entry = await set_up(hass, X1C)

    assert f"{printer_device(entry, X1C)}_ams_0" in _devices(hass, entry)
    assert state_of(hass, "sensor", f"{entry.entry_id}_p{printer_key(X1C)}_ams0_slot_1").state == "PLA Basic"


async def test_setup_reads_the_printers_beside_bambuddys_figures(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy's statistics wait for its plugs, the update checks for GitHub and Bambu Lab: the printers'
    first reads do not wait for them."""
    events: list[str] = []
    statistics = bambuddy_api.get_statistics.return_value
    read = bambuddy_api.get_status.side_effect

    async def slow_statistics(**_: Any) -> dict:
        events.append("statistics asked")
        await asyncio.sleep(0.2)
        events.append("statistics answered")
        return statistics

    def status(printer_id: int) -> dict:
        events.append("status asked")
        return read(printer_id)

    bambuddy_api.get_statistics.side_effect = slow_statistics
    bambuddy_api.get_status.side_effect = status
    entry = await set_up(hass, X1C)

    assert entry.state is ConfigEntryState.LOADED
    assert events.index("status asked") < events.index("statistics answered")



async def test_statistics_the_key_may_not_read_leave_bambuddy_connected(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Only the statistics are unknown: BamBuddy answers, its system figures stay."""
    bambuddy_api.get_statistics.side_effect = BamBuddyPermissionError(403, "API key owner does not have 'stats:read' permission")
    entry = await set_up(hass, X1C)
    await next_refresh(hass, freezer)

    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == "on"
    assert state_of(hass, "sensor", instance_uid(entry, "disk_free")).state not in ("unavailable", "unknown")
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == "unknown"


@pytest.mark.parametrize("failure", ["timeout", "server error"])
async def test_statistics_bambuddy_took_but_did_not_finish_keep_it_connected(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, failure: str
) -> None:
    """BamBuddy's statistics ask every smart plug for its energy, one after another (up to 10 s
    each): one unreachable plug makes them slow. BamBuddy answers -- the last figures stand."""
    entry = await set_up(hass, X1C)
    if failure == "timeout":
        error: Exception = BamBuddyConnectionError("GET /archives/stats: TimeoutError")
        error.__cause__ = TimeoutError()
    else:
        error = BamBuddyApiError(500, "Internal Server Error")
    bambuddy_api.get_statistics.side_effect = error
    calls = bambuddy_api.get_statistics.await_count

    for _ in range(6):
        await next_refresh(hass, freezer)

    assert bambuddy_api.get_statistics.await_count > calls
    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == STATE_ON
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == "812"


async def test_statistics_slow_since_the_start_leave_bambuddy_connected_after_it(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A plug does not answer while Home Assistant starts: the setup's read fails in its 10 s; the
    reads after it get their 30 s and, failing too, keep BamBuddy connected (figures unknown)."""
    error = BamBuddyConnectionError("GET /archives/stats: TimeoutError")
    error.__cause__ = TimeoutError()
    bambuddy_api.get_statistics.side_effect = error
    entry = await set_up(hass, X1C)
    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == "off"

    for _ in range(6):
        await next_refresh(hass, freezer)

    assert bambuddy_api.get_statistics.await_args.kwargs == {"patient": True}
    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == STATE_ON
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == STATE_UNKNOWN


async def test_statistics_of_a_bambuddy_that_cannot_be_reached_say_so(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.get_statistics.side_effect = BamBuddyConnectionError("GET /archives/stats: Cannot connect to host")

    for _ in range(6):
        await next_refresh(hass, freezer)

    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == "off"


async def test_the_statistics_wait_only_briefly_at_setup(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The printers' setup waits for them: 10 s there, 30 s later."""
    await set_up(hass, X1C)
    assert bambuddy_api.get_statistics.await_args.kwargs == {"patient": False}

    for _ in range(6):
        await next_refresh(hass, freezer)

    assert bambuddy_api.get_statistics.await_args.kwargs == {"patient": True}


async def test_the_setup_does_not_wait_for_the_update_checks(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """They ask GitHub and Bambu Lab through BamBuddy, up to a minute each: the printers come first, the
    update entities once a check answers."""
    answer = asyncio.Event()
    firmware = bambuddy_api.get_firmware_updates.return_value

    async def slow_firmware() -> dict:
        await answer.wait()
        return firmware

    bambuddy_api.get_firmware_updates.side_effect = slow_firmware
    entry = make_entry(hass, X1C)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.state is ConfigEntryState.LOADED
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"
    assert state_of(hass, "update", printer_uid(entry, "firmware")).state == "unavailable"
    answer.set()
    await hass.async_block_till_done(wait_background_tasks=True)
    assert state_of(hass, "update", printer_uid(entry, "firmware")).state == "on"


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
    entry = make_entry(hass, X1C)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.state is ConfigEntryState.SETUP_RETRY
    assert ended.is_set()



async def test_a_permission_taken_from_the_key_is_named_in_the_log(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """BamBuddy still accepts the key; its owner lost a permission every read needs."""
    await set_up(hass, X1C)
    bambuddy_api.get_status.side_effect = BamBuddyPermissionError(403, "API key does not have 'can_read_status' permission")

    await next_refresh(hass, freezer)

    assert [flow["context"]["source"] for flow in hass.config_entries.flow.async_progress()] == ["reauth"]
    assert "lacks a permission" in caplog.text
    assert "no longer accepts" not in caplog.text


async def test_a_permission_taken_from_the_key_is_named_at_setup_too(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, caplog: pytest.LogCaptureFixture
) -> None:
    """The same 403 after a restart: the key still works, a permission is missing."""
    bambuddy_api.get_printers.side_effect = BamBuddyPermissionError(403, "API key owner does not have 'printers:read' permission")
    entry = make_entry(hass, X1C)

    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.state is ConfigEntryState.SETUP_ERROR
    assert [flow["context"]["source"] for flow in hass.config_entries.flow.async_progress()] == ["reauth"]
    assert "lacks a permission" in caplog.text
    assert "no longer accepts" not in caplog.text


async def test_the_names_notice_goes_with_its_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Removed with Configure: its notice about a name goes too."""
    entry = await set_up(hass, X1C, P1S)
    workshop = _devices(hass, entry)[printer_device(entry, X1C)]
    dr.async_get(hass).async_update_device(workshop.id, name_by_user="My printer")
    for _ in range(6):
        await next_refresh(hass, freezer)
    assert ir.async_get(hass).async_get_issue(DOMAIN, names_issue(entry.entry_id, printer_key(X1C))) is not None

    hass.config_entries.async_update_entry(entry, options={"printers": [printer_entry(P1S)]})
    await hass.async_block_till_done()

    assert ir.async_get(hass).async_get_issue(DOMAIN, names_issue(entry.entry_id, printer_key(X1C))) is None


async def test_a_stored_printers_names_notice_survives_a_reload(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Still stored: its notice about a name stays until Home Assistant restarts, a reload keeps it."""
    entry = await set_up(hass, X1C, P1S)
    workshop = _devices(hass, entry)[printer_device(entry, X1C)]
    dr.async_get(hass).async_update_device(workshop.id, name_by_user="My printer")
    for _ in range(6):
        await next_refresh(hass, freezer)
    issue_id = names_issue(entry.entry_id, printer_key(X1C))
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is not None

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is not None


async def test_a_missing_printer_is_named_the_same_everywhere(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Renamed in BamBuddy since the last start, then gone: the stored name follows its device's, so
    the repair's dialog and an action's refusal say what its title says."""
    entry = await set_up(hass, X1C, A1_MINI)
    device = _devices(hass, entry)[printer_device(entry, A1_MINI)]
    dr.async_get(hass).async_update_device(device.id, name="Kitchen (A1 Mini / 0309DA000000002)")
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    stored = next(p for p in entry.options["printers"] if p["serial_number"] == printer_serial(A1_MINI))
    assert stored["printer_name"] == "Kitchen (A1 Mini / 0309DA000000002)"
    with pytest.raises(ServiceValidationError) as raised:
        await hass.services.async_call(DOMAIN, "home_axes", {"device_id": device.id}, blocking=True)
    assert raised.value.translation_placeholders == {"printer": "Kitchen (A1 Mini / 0309DA000000002)"}


async def test_plug_and_bambuddy_devices_keep_a_name_given_in_home_assistant(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Only the printers and their AMS units follow BamBuddy's names."""
    bambuddy_api.get_smart_plugs.return_value = load_fixture("smart_plugs.json")
    entry = await set_up(hass, X1C)
    registry = dr.async_get(hass)
    devices = [find_device(hass, entry.entry_id, identifier) for identifier in (plug_identifier(entry.entry_id, 3), (DOMAIN, entry.entry_id))]
    for device in devices:
        assert device is not None
        registry.async_update_device(device.id, name_by_user="Mine")

    for _ in range(6):
        await next_refresh(hass, freezer)

    assert [registry.async_get(device.id).name_by_user for device in devices] == ["Mine", "Mine"]  # type: ignore[union-attr]


async def test_a_corrected_model_takes_its_entities_along(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Corrected in BamBuddy from an X1C to an A1: after the reload the
    X1C's door and fans are gone from the registry; what an A1 has stays,
    the AMS units' entities and the firmware update too."""
    entry = await set_up(hass, X1C)
    assert not no_entity(hass, "binary_sensor", printer_uid(entry, "door"))
    printers = [{**printer, "model": "A1"} if printer["id"] == X1C else printer for printer in load_fixture("printers.json")]
    bambuddy_api.get_printers.return_value = printers
    bambuddy_api.get_printer.side_effect = lambda printer_id: next(item for item in printers if item["id"] == printer_id)

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    for platform, key in (("binary_sensor", "door"), ("fan", "aux_fan"), ("fan", "chamber_fan")):
        assert no_entity(hass, platform, printer_uid(entry, key)), key
    assert not no_entity(hass, "sensor", printer_uid(entry, "status"))
    assert not no_entity(hass, "update", printer_uid(entry, "firmware"))
    assert not no_entity(hass, "sensor", ams_uid(entry, 0, "humidity"))
    assert _devices(hass, entry)[printer_device(entry, X1C)].model == "A1"


async def test_the_name_notice_names_every_device_reset(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The printer and its AMS unit renamed in Home Assistant: one notice for
    the printer, naming both names that were reset."""
    entry = await set_up(hass, X1C)
    devices = _devices(hass, entry)
    registry = dr.async_get(hass)
    registry.async_update_device(devices[printer_device(entry, X1C)].id, name_by_user="My printer")
    registry.async_update_device(devices[ams_device(entry, X1C, 0)].id, name_by_user="My AMS")

    for _ in range(6):
        await next_refresh(hass, freezer)

    issue = ir.async_get(hass).async_get_issue(DOMAIN, names_issue(entry.entry_id, printer_key(X1C)))
    assert issue is not None
    assert issue.translation_placeholders == {"given": "My printer\n- My AMS", "name": printer_name(X1C)}


def _ids(hass: HomeAssistant, entry: MockConfigEntry) -> dict[str, str]:
    """The entry's registered entities, unique ID to entity ID."""
    return {item.unique_id: item.entity_id for item in er.async_entries_for_config_entry(er.async_get(hass), entry.entry_id)}


def _listed(bambuddy_api: SimpleNamespace, printer_id: int, **fields: Any) -> None:
    """BamBuddy lists the printer with these fields, in its list and its details."""
    printers = [{**item, **fields} if item["id"] == printer_id else item for item in load_fixture("printers.json")]
    bambuddy_api.get_printers.return_value = printers
    bambuddy_api.get_printer.side_effect = lambda wanted: next(item for item in printers if item["id"] == wanted)


async def test_a_corrected_model_met_blank_waits_for_the_printers_report(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy reconnects a printer whose model was corrected in its edit
    dialog: the reload may meet it blank. Then nothing goes and the device
    keeps its model; the setup after the printer's report (its reload) takes
    the change."""
    entry = await set_up(hass, X1C)
    before = _ids(hass, entry)
    _listed(bambuddy_api, X1C, model="A1")
    connected = bambuddy_api.statuses[X1C]
    bambuddy_api.statuses[X1C] = {**load_fixture("status_never.json"), "id": X1C, "name": connected["name"]}

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    # Only the camera's frame rate goes: it follows BamBuddy's printer
    # information (an A1's camera gives 5 frames a second), not a report.
    assert sorted(set(before) - set(_ids(hass, entry))) == [printer_uid(entry, "camera_fps")]
    assert _devices(hass, entry)[printer_device(entry, X1C)].model == "X1C"
    bambuddy_api.statuses[X1C] = connected
    await next_refresh(hass, freezer)
    await hass.async_block_till_done()
    await next_refresh(hass, freezer)
    for platform, key in (("binary_sensor", "door"), ("fan", "aux_fan"), ("fan", "chamber_fan")):
        assert no_entity(hass, platform, printer_uid(entry, key)), key
    assert _devices(hass, entry)[printer_device(entry, X1C)].model == "A1"


async def test_a_failed_setup_after_a_corrected_model_takes_it_again(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The X1C corrected to an A1; at the reload the A1 mini's first read
    times out. The device keeps its model, so the next try takes the change."""
    entry = await set_up(hass, X1C, A1_MINI)
    _listed(bambuddy_api, X1C, model="A1")
    reads = bambuddy_api.get_status.side_effect
    failed: list[int] = []

    def the_a1_minis_first_read_fails(printer_id: int) -> Any:
        if printer_id == A1_MINI and not failed:
            failed.append(printer_id)
            raise BamBuddyConnectionError("GET /printers/2/status: TimeoutError")
        return reads(printer_id)

    bambuddy_api.get_status.side_effect = the_a1_minis_first_read_fails
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert failed
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.state is ConfigEntryState.LOADED
    for platform, key in (("binary_sensor", "door"), ("fan", "aux_fan"), ("fan", "chamber_fan")):
        assert no_entity(hass, platform, printer_uid(entry, key)), key


async def test_a_fan_kit_reported_after_the_reload_keeps_its_fan(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """An H2D with its left auxiliary fan corrected to an H2D Pro: the reload
    meets BamBuddy right after its reconnect, the kit not reported yet --
    the fan stays, with its ID."""
    bambuddy_api.statuses[H2D]["left_aux_fan_speed"] = 40
    entry = await set_up(hass, H2D)
    fan = printer_uid(entry, "left_aux_fan", H2D)
    before = er.async_get(hass).async_get_entity_id("fan", DOMAIN, fan)
    assert before
    _listed(bambuddy_api, H2D, model="H2D Pro")
    bambuddy_api.statuses[H2D]["left_aux_fan_speed"] = None

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert er.async_get(hass).async_get_entity_id("fan", DOMAIN, fan) == before


@pytest.mark.parametrize(("stored", "model"), [("BamBuddy Printer (X1C)", "X1C"), ("BamBuddy Printer", "")])
async def test_a_1x_device_is_no_model_change(hass: HomeAssistant, bambuddy_api: SimpleNamespace, stored: str, model: str) -> None:
    """After the upgrade from 1.x the device still has 1.x's model --
    "BamBuddy Printer (X1C)", or "BamBuddy Printer" without one: the same
    model in 1.x's words, so the 1.x entities 2.0 keeps (a model-less
    printer's SD card) stay."""
    _listed(bambuddy_api, X1C, model=model)
    entry = make_entry(hass, X1C)
    dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id, identifiers={(DOMAIN, printer_device(entry, X1C))}, model=stored, serial_number=printer_serial(X1C)
    )
    er.async_get(hass).async_get_or_create("binary_sensor", DOMAIN, printer_uid(entry, "sdcard"), config_entry=entry, suggested_object_id="workshop_sd_card")

    await setup_integration(hass, entry)

    assert not entry.runtime_data.printers[X1C].model_changed
    assert not no_entity(hass, "binary_sensor", printer_uid(entry, "sdcard"))


async def test_a_blank_printer_keeps_its_entities_without_a_model_change(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy restarted while the printer is off: its status is blank at
    the reload, and it keeps everything it had (its chamber temperature)."""
    entry = await set_up(hass, X1C)
    before = _ids(hass, entry)
    bambuddy_api.statuses[X1C] = {**load_fixture("status_never.json"), "id": X1C, "name": "Workshop"}

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert sorted(set(before) - set(_ids(hass, entry))) == []


async def test_an_ams_unit_still_without_its_serial_keeps_its_entities(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Corrected to an X1E: at the reload BamBuddy reports the AMS unit
    without its serial yet (it comes a moment after the connection), so its
    entities come later -- they stay."""
    entry = await set_up(hass, X1C)
    before = {uid for uid in _ids(hass, entry) if "_ams" in uid.removeprefix(entry.entry_id)}
    assert before
    _listed(bambuddy_api, X1C, model="X1E")
    status = bambuddy_api.statuses[X1C]
    status["firmware_version"] = None
    for unit in status["ams"]:
        unit["serial_number"] = ""

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert sorted(before - set(_ids(hass, entry))) == []


async def test_a_model_that_comes_is_no_model_change(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A printer BamBuddy had no model for gets one: that only adds."""
    _listed(bambuddy_api, X1C, model="")
    entry = await set_up(hass, X1C)
    _listed(bambuddy_api, X1C, model="X1C")

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert not entry.runtime_data.printers[X1C].model_changed


async def test_the_name_notice_keeps_its_names_over_a_reload_and_follows_a_rename(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The names an earlier setup reset stay in the notice; a name reset
    twice is listed once; renamed in BamBuddy, the title follows."""
    entry = await set_up(hass, X1C)
    devices = _devices(hass, entry)
    registry = dr.async_get(hass)
    issue_id = names_issue(entry.entry_id, printer_key(X1C))
    for _ in range(2):
        registry.async_update_device(devices[printer_device(entry, X1C)].id, name_by_user="My printer")
        for _ in range(6):
            await next_refresh(hass, freezer)
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    registry.async_update_device(devices[ams_device(entry, X1C, 0)].id, name_by_user="My AMS")
    for _ in range(6):
        await next_refresh(hass, freezer)
    issue = ir.async_get(hass).async_get_issue(DOMAIN, issue_id)
    assert issue is not None
    assert issue.translation_placeholders["given"] == "My printer\n- My AMS"

    _listed(bambuddy_api, X1C, name="Garage")
    bambuddy_api.statuses[X1C]["name"] = "Garage"
    for _ in range(7):
        await next_refresh(hass, freezer)
    issue = ir.async_get(hass).async_get_issue(DOMAIN, issue_id)
    assert issue is not None
    assert issue.translation_placeholders["name"] == _devices(hass, entry)[printer_device(entry, X1C)].name


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


async def test_a_printer_without_a_model_says_printer_in_its_entity_ids(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy has no model for it: `printer` stands in for the model, so
    no entity ID begins with a digit (templates' dot access needs a letter)."""
    _listed(bambuddy_api, X1C, model=None)
    entry = await set_up(hass, X1C)

    assert er.async_get(hass).async_get_entity_id("sensor", DOMAIN, printer_uid(entry, "status")) == "sensor.printer_00m00a000000001_print_status"
