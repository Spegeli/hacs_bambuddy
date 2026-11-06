"""Migrating entries: from 1.x (host and port) to 2.x, and from 2.1's
printer numbers to 2.2's serial numbers."""
from __future__ import annotations

from types import SimpleNamespace

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.bambuddy.const import DOMAIN

from tests.conftest import (
    A1_MINI,
    API_KEY,
    URL,
    X1C,
    ams_device,
    ams_uid,
    load_fixture,
    printer_device,
    printer_entry,
    printer_name,
    printer_serial,
    printer_uid,
    setup_integration,
)
from tests.helpers import (
    devices_by_identifier,
    reauth_flows,
    reload_entry,
)


def _entry_1x(hass: HomeAssistant) -> MockConfigEntry:
    """An entry as 1.x stored it: host and port."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="BamBuddy (bambuddy.local)",
        data={"host": "bambuddy.local", "port": 8000, "api_key": API_KEY, "version": "0.2.4.5"},
        options={"printers": [{"printer_id": X1C, "printer_name": printer_name(X1C)}]},
        unique_id="bambuddy_bambuddy.local_8000",
        version=1,
    )
    entry.add_to_hass(hass)
    return entry


def _entry_2_1(hass: HomeAssistant, *printer_ids: int) -> MockConfigEntry:
    """An entry as 2.1 stored it: its printers by BamBuddy's numbers."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="BamBuddy (bambuddy.local)",
        data={"url": URL, "api_key": API_KEY, "verify_ssl": True},
        options={"printers": [{"printer_id": printer_id, "printer_name": printer_name(printer_id)} for printer_id in printer_ids]},
        unique_id=URL,
        version=2,
        minor_version=1,
    )
    entry.add_to_hass(hass)
    return entry


async def test_a_1x_entry_with_a_read_only_key_asks_for_a_new_one(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """1.x worked with Read Status alone: after the migration Home Assistant
    asks for a key with all three; with one, the entry loads."""
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")
    entry = _entry_1x(hass)

    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert (entry.version, entry.state, entry.error_reason_translation_key) == (2, ConfigEntryState.SETUP_ERROR, "key_scopes_missing")
    assert len(reauth_flows(hass)) == 1

    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_control.json")
    await reload_entry(hass, entry.entry_id)
    assert entry.state is ConfigEntryState.LOADED


async def test_migration_from_version_1(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """1.x stored host and port: 2.0 makes them a URL, and the entities it
    merged or replaced leave the registry; the others keep their IDs."""
    entry = _entry_1x(hass)
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


async def test_migration_to_serial_numbers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """2.1 knew printers and AMS units by BamBuddy's numbers: 2.2 by their
    serial numbers, from the device registry. Entity IDs, and so their
    history, stay."""
    entry = _entry_2_1(hass, X1C)
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
    assert printer_device(entry, X1C) in devices_by_identifier(hass, entry)
    assert ams_device(entry, X1C, 0) in devices_by_identifier(hass, entry)


async def test_migration_keeps_a_unit_seen_twice_apart(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Under 2.1 a unit moved to another place left both place devices with
    its serial: the second keeps its place, and the migration goes through.
    A printer never set up has no device to rename; setup finds it by its
    number."""
    entry = _entry_2_1(hass, X1C, A1_MINI)
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
    identifiers = devices_by_identifier(hass, entry)
    assert ams_device(entry, X1C, 0) in identifiers
    assert f"{printer_device(entry, X1C)}_ams_1" in identifiers
    assert entry.options["printers"] == [printer_entry(X1C), printer_entry(A1_MINI)]
