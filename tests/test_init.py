"""Setting an entry up and down: devices, permissions, printers BamBuddy no
longer has, the migration from 1.x, and deleting devices."""
from __future__ import annotations

import copy
from types import SimpleNamespace
from unittest.mock import patch

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

from custom_components.bambuddy.api import BamBuddyAuthError, BamBuddyConnectionError, BamBuddyNotFoundError
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import (
    A1_MINI,
    API_KEY,
    H2D,
    URL,
    X1C,
    ams_device,
    ams_uid,
    load_fixture,
    make_entry,
    next_refresh,
    printer_device,
    printer_entry,
    printer_key,
    printer_name,
    printer_serial,
    printer_uid,
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
    entry = make_entry(hass, X1C, H2D)
    await setup_integration(hass, entry)

    assert set(entry.runtime_data.printers) == {X1C, H2D}
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert entry.state is ConfigEntryState.NOT_LOADED


async def test_the_devices(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy as a service, each printer a Bambu Lab printer under it,
    each AMS unit under its printer."""
    entry = make_entry(hass, X1C, H2D)
    await setup_integration(hass, entry)

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
    button but the status refresh, no select, number, fan or light."""
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    domains = _domains(hass, entry)
    assert not domains & {Platform.SELECT, Platform.NUMBER, Platform.FAN, Platform.LIGHT}
    registry = er.async_get(hass)
    buttons = [e.unique_id for e in er.async_entries_for_config_entry(registry, entry.entry_id) if e.domain == "button"]
    assert buttons == [printer_uid(entry, "refresh_status")]
    assert entry.runtime_data.can_control is False


async def test_with_authentication_off_any_key_controls(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy without authentication answers every request; it has no
    permissions to ask about."""
    bambuddy_api.get_auth_status.return_value = {"auth_enabled": False, "requires_setup": False}
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required")
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

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
    bambuddy_api.get_printers.return_value = [
        printer for printer in load_fixture("printers.json") if printer["id"] != A1_MINI
    ]
    entry = make_entry(hass, X1C, A1_MINI)
    await setup_integration(hass, entry)

    assert set(entry.runtime_data.printers) == {X1C}
    issue = ir.async_get(hass).async_get_issue(DOMAIN, f"printer_missing_{entry.entry_id}_{printer_key(A1_MINI)}")
    assert issue is not None
    assert issue.translation_placeholders == {"printer": printer_name(A1_MINI)}

    hass.config_entries.async_update_entry(
        entry, options={"printers": [printer_entry(X1C)]}
    )
    await hass.async_block_till_done()

    assert ir.async_get(hass).async_get_issue(DOMAIN, f"printer_missing_{entry.entry_id}_{printer_key(A1_MINI)}") is None


async def test_removing_a_printer_removes_its_devices(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C, A1_MINI)
    await setup_integration(hass, entry)
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
    entry = make_entry(hass, X1C, A1_MINI)
    await setup_integration(hass, entry)

    response = await _remove_device(hass, hass_ws_client, entry, _devices(hass, entry)[printer_device(entry, A1_MINI)])
    await hass.async_block_till_done()

    assert response["success"]
    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_the_instance_device_cannot_be_deleted(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    response = await _remove_device(hass, hass_ws_client, entry, _devices(hass, entry)[entry.entry_id])

    assert not response["success"]
    assert "cannot be deleted here" in response["error"]["message"]


async def test_an_ams_unit_the_printer_reports_stays(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    """It would come back with the next poll."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    response = await _remove_device(hass, hass_ws_client, entry, _devices(hass, entry)[ams_device(entry, X1C, 0)])

    assert not response["success"]


async def test_a_device_nothing_reports_can_go(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    """An AMS unit moved to another printer leaves a device behind."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
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
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[X1C]["firmware_version"] = "01.09.02.00"

    await next_refresh(hass, freezer)

    assert _devices(hass, entry)[printer_device(entry, X1C)].sw_version == "01.09.02.00"


async def test_a_refused_key_while_running_asks_for_a_new_one(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.get_status.side_effect = BamBuddyAuthError(401, "Authentication required")

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
    }


async def test_a_printer_deleted_in_bambuddy_while_running_raises_the_issue(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Not only at the next restart."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.get_status.side_effect = BamBuddyNotFoundError(404, "Printer not found")

    await next_refresh(hass, freezer)

    assert ir.async_get(hass).async_get_issue(DOMAIN, f"printer_missing_{entry.entry_id}_{printer_key(X1C)}") is not None


async def test_an_unreachable_bambuddy_is_tried_again(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Already its version cannot be read: Home Assistant tries again later."""
    bambuddy_api.get_version.side_effect = BamBuddyConnectionError("refused")
    entry = make_entry(hass, X1C)

    await hass.config_entries.async_setup(entry.entry_id)

    assert entry.state is ConfigEntryState.SETUP_RETRY


async def test_the_device_name_follows_bambuddy(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy's name is the one: renamed there, the device follows within a
    minute -- and a name given in Home Assistant goes back to it."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
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


async def test_another_ams_in_the_same_place(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A unit is known by its serial number: another one plugged in where
    the first was is a device of its own, the first keeps its history."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
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
    entry = make_entry(hass, H2D)
    await setup_integration(hass, entry)
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
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
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
    entry = make_entry(hass, X1C, A1_MINI)
    await setup_integration(hass, entry)
    assert ams_device(entry, A1_MINI, 0) in _devices(hass, entry)
    bambuddy_api.get_printers.return_value = [p for p in load_fixture("printers.json") if p["id"] != A1_MINI]
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert await async_setup_component(hass, "repairs", {})
    issue = ir.async_get(hass).async_get_issue(DOMAIN, f"printer_missing_{entry.entry_id}_{printer_key(A1_MINI)}")
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
    bambuddy_api.get_printers.return_value = [p for p in load_fixture("printers.json") if p["id"] != A1_MINI]
    await setup_integration(hass, entry)
    assert await async_setup_component(hass, "repairs", {})
    client = await hass_client()
    started = await client.post(
        "/api/repairs/issues/fix",
        json={"handler": DOMAIN, "issue_id": f"printer_missing_{entry.entry_id}_{printer_key(A1_MINI)}"},
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
        json={"handler": DOMAIN, "issue_id": f"printer_missing_{entry.entry_id}_{printer_key(X1C)}"},
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
    status["ams"][0]["serial_number"] = ""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    assert not [identifier for identifier in _devices(hass, entry) if "_ams_" in identifier]

    status["ams"][0]["serial_number"] = serial
    await next_refresh(hass, freezer)

    assert [identifier for identifier in _devices(hass, entry) if "_ams_" in identifier] == [ams_device(entry, X1C, 0)]


async def test_an_ams_without_serial_comes_after_a_minute(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A unit that never reports a serial is known by its place."""
    bambuddy_api.statuses[X1C]["ams"][0]["serial_number"] = ""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

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
    assert ir.async_get(hass).async_get_issue(DOMAIN, f"printer_missing_{entry.entry_id}_id9") is not None


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
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    registry = er.async_get(hass)
    device = _devices(hass, entry)[printer_device(entry, X1C)]
    assert (device.name, device.model) == ("Workshop (00M00A000000001)", None)
    # The X1 series' detections, its auxiliary and chamber fans and SD card come with the model.
    for domain, key in (("switch", "ai_monitoring"), ("fan", "aux_fan"), ("fan", "chamber_fan"), ("binary_sensor", "sdcard")):
        assert registry.async_get_entity_id(domain, DOMAIN, printer_uid(entry, key)) is None, key

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


async def test_a_known_model_is_not_asked_again(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    for _ in range(6):
        await next_refresh(hass, freezer)

    bambuddy_api.get_printer.assert_not_awaited()



async def test_asking_for_the_model_may_fail(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy refuses the question: the printer goes on without a model and
    is asked again a minute later."""
    x1c = next(printer for printer in load_fixture("printers.json") if printer["id"] == X1C)
    bambuddy_api.get_printers.return_value = [{**x1c, "model": None}]
    bambuddy_api.get_printer.side_effect = BamBuddyConnectionError("refused")
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

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
    """The model is kept at once: until the reload runs, no further question
    and no second reload."""
    x1c = next(printer for printer in load_fixture("printers.json") if printer["id"] == X1C)
    bambuddy_api.get_printers.return_value = [{**x1c, "model": None}]
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = x1c
    entry = make_entry(hass, X1C)
    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await setup_integration(hass, entry)
        for _ in range(12):
            await next_refresh(hass, freezer)

    reload.assert_called_once_with(entry.entry_id)
    assert bambuddy_api.get_printer.await_count == 1


async def test_two_printers_get_their_models(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    printers = load_fixture("printers.json")
    chosen = [printer for printer in printers if printer["id"] in (X1C, A1_MINI)]
    bambuddy_api.get_printers.return_value = [{**printer, "model": None} for printer in chosen]
    bambuddy_api.get_printer.side_effect = lambda printer_id: {
        **next(p for p in chosen if p["id"] == printer_id), "model": None
    }
    entry = make_entry(hass, X1C, A1_MINI)
    await setup_integration(hass, entry)

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
