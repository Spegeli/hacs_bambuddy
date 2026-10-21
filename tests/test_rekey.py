"""AMS units that get their serial later: the running entry holds such a
unit until it reloads, and the next setup moves its device and entities to
the serial -- one device, history kept, the stand-in entity IDs renamed, a
Repairs notice (BamBuddy drops the AMS Lite's serial today,
maziggy/bambuddy#3348)."""
from __future__ import annotations

import json
import logging
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from custom_components.bambuddy import renames
from custom_components.bambuddy.const import DOMAIN, HOLD_LIMIT
from custom_components.bambuddy.coordinator import find_device, renames_issue
from tests.conftest import (
    A1_MINI,
    H2D,
    INTEGRATION,
    X1C,
    load_fixture,
    make_entry,
    next_refresh,
    printer_device,
    printer_entry,
    printer_key,
    printer_serial,
    set_up,
    setup_integration,
)

LITE_SERIAL = "03C00A000000004"
LITE_FIRMWARE = "00.00.07.94"


def _lite_reports_its_serial(bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy reads the AMS Lite's version, as it will once #3348 is fixed."""
    bambuddy_api.statuses[A1_MINI]["ams"][0].update(
        {"serial_number": LITE_SERIAL, "module_type": "ams_f1", "sw_ver": LITE_FIRMWARE}
    )


def _place_device(entry: MockConfigEntry) -> str:
    return f"{printer_device(entry, A1_MINI)}_ams_0"


def _serial_device(entry: MockConfigEntry, serial: str = LITE_SERIAL) -> str:
    return f"{printer_device(entry, A1_MINI)}_ams_{serial}"


def _ams_devices(hass: HomeAssistant, entry: MockConfigEntry) -> list[str]:
    return sorted(
        identifier
        for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id)
        for domain, identifier in device.identifiers
        if domain == DOMAIN and "_ams_" in identifier
    )


def _serial_entities(hass: HomeAssistant, entry: MockConfigEntry, serial: str = LITE_SERIAL) -> list[str]:
    return [
        item.unique_id
        for item in er.async_entries_for_config_entry(er.async_get(hass), entry.entry_id)
        if f"_ams{serial}_" in item.unique_id
    ]


def _holds(hass: HomeAssistant, entry: MockConfigEntry, serial: str = LITE_SERIAL, printer_id: int = A1_MINI) -> int:
    return int(hass.data.get(DOMAIN, {}).get("ams_holds", {}).get((entry.entry_id, printer_key(printer_id), serial), 0))


async def test_a_serial_that_arrives_holds_the_unit_and_asks_one_reload(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The unit known by its place reports its serial: nothing of the
    serial's is built in the running entry -- no second device --, and the
    entry asks for one reload, counted once however often it is asked."""
    entry = await set_up(hass, A1_MINI)
    assert _ams_devices(hass, entry) == [_place_device(entry)]
    _lite_reports_its_serial(bambuddy_api)

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)
        assert _ams_devices(hass, entry) == [_place_device(entry)]
        assert _serial_entities(hass, entry) == []
        await next_refresh(hass, freezer)

    reload.assert_called_once_with(entry.entry_id)
    assert _serial_entities(hass, entry) == []
    assert _holds(hass, entry) == 1


async def test_a_hold_while_a_reload_is_pending(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A reload already asked for (a corrected model, Configure): the unit
    is held all the same, and no second reload is asked."""
    entry = await set_up(hass, A1_MINI)
    entry.runtime_data.reloading = True
    _lite_reports_its_serial(bambuddy_api)

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)

    reload.assert_not_called()
    assert _serial_entities(hass, entry) == []
    assert _holds(hass, entry) == 1

    # The reload that was pending moves the unit.
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert _ams_devices(hass, entry) == [_serial_device(entry)]


async def test_a_unit_of_another_model_is_no_hold(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The AMS Lite swapped for another unit at its place: not the same
    unit -- a new device, as before, and no reload."""
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI]["ams"][0].update(
        {"serial_number": "19C06A000000009", "module_type": "n3f", "sw_ver": "03.00.21.29"}
    )

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)

    reload.assert_not_called()
    assert _serial_device(entry, "19C06A000000009") in _ams_devices(hass, entry)


async def test_a_known_serial_is_no_hold(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A device for the serial exists (the unit came back): it gets its
    entities again, the place device stays."""
    entry = await set_up(hass, A1_MINI)
    dr.async_get(hass).async_get_or_create(config_entry_id=entry.entry_id, identifiers={(DOMAIN, _serial_device(entry))})
    _lite_reports_its_serial(bambuddy_api)

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)

    reload.assert_not_called()
    assert _serial_entities(hass, entry) != []


async def test_a_place_device_with_a_serial_is_no_hold(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A place device that holds a serial already belongs to some unit."""
    entry = await set_up(hass, A1_MINI)
    registry = dr.async_get(hass)
    device = find_device(hass, entry.entry_id, (DOMAIN, _place_device(entry)))
    assert device is not None
    registry.async_update_device(device.id, serial_number="03C00A000000077")
    _lite_reports_its_serial(bambuddy_api)

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)

    reload.assert_not_called()


@pytest.mark.parametrize(("firmware", "held"), [(None, True), ("00.00.06.49", False)])
async def test_a_model_less_printers_guess(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, firmware: str | None, held: bool
) -> None:
    """A printer BamBuddy reports no model for: its AMS Lite was "AMS" by
    its place. Without firmware that was a guess -- a real AMS reports it --
    and it may become the "AMS Lite" the serial now tells; with firmware it
    was a real AMS, and an AMS Lite at its place is another unit."""
    printers = load_fixture("printers.json")
    for printer in printers:
        if printer["id"] == A1_MINI:
            printer["model"] = None
    bambuddy_api.get_printers.return_value = printers
    entry = await set_up(hass, A1_MINI)
    registry = dr.async_get(hass)
    device = find_device(hass, entry.entry_id, (DOMAIN, _place_device(entry)))
    assert device is not None and device.model == "AMS"
    registry.async_update_device(device.id, sw_version=firmware)
    _lite_reports_its_serial(bambuddy_api)

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)

    assert reload.called is held


async def test_the_hold_gives_up_after_three_runs(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """Three reloads that did not settle it: the unit gets its entities as
    a new device rather than the entry reloading for ever."""
    entry = await set_up(hass, A1_MINI)
    hass.data.setdefault(DOMAIN, {}).setdefault("ams_holds", {})[(entry.entry_id, printer_key(A1_MINI), LITE_SERIAL)] = HOLD_LIMIT
    _lite_reports_its_serial(bambuddy_api)

    with caplog.at_level(logging.WARNING), patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)

    reload.assert_not_called()
    assert _serial_entities(hass, entry) != []
    assert LITE_SERIAL in caplog.text


def _uid(entry: MockConfigEntry, unit: str, key: str, printer_id: int = A1_MINI) -> str:
    return f"{entry.entry_id}_p{printer_key(printer_id)}_ams{unit}_{key}"


def _entity_id(hass: HomeAssistant, domain: str, unique_id: str) -> str | None:
    return er.async_get(hass).async_get_entity_id(domain, DOMAIN, unique_id)


async def _serial_then_reload(hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory) -> None:
    """The AMS Lite reports its serial in a refresh (held), then the entry reloads."""
    _lite_reports_its_serial(bambuddy_api)
    with patch.object(hass.config_entries, "async_schedule_reload"):
        await next_refresh(hass, freezer)
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)


async def test_the_unit_moves_to_its_serial(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """One device stays, with the serial and the unit's firmware; its
    entities keep their registry entries -- names, areas, history -- under
    the serial, their stand-in IDs renamed to the serial's."""
    entry = await set_up(hass, A1_MINI)
    registry = er.async_get(hass)
    before = {item.unique_id: item.id for item in er.async_entries_for_config_entry(registry, entry.entry_id) if "_ams0_" in item.unique_id}
    assert len(before) == 4
    device = find_device(hass, entry.entry_id, (DOMAIN, _place_device(entry)))
    assert device is not None

    await _serial_then_reload(hass, bambuddy_api, entry, freezer)

    moved = find_device(hass, entry.entry_id, (DOMAIN, _serial_device(entry)))
    assert moved is not None and moved.id == device.id
    assert (moved.serial_number, moved.sw_version) == (LITE_SERIAL, LITE_FIRMWARE)
    assert _ams_devices(hass, entry) == [_serial_device(entry)]
    for unique_id, registry_id in before.items():
        item = registry.async_get(_entity_id(hass, "sensor", unique_id.replace("_ams0_", f"_ams{LITE_SERIAL}_")) or "")
        assert item is not None and item.id == registry_id
    for slot in range(1, 5):
        assert _entity_id(hass, "sensor", _uid(entry, LITE_SERIAL, f"slot_{slot}")) == f"sensor.ams_lite_03c00a000000004_slot_{slot}"
    assert hass.states.get("sensor.ams_lite_03c00a000000004_slot_1") is not None


async def test_the_serial_at_a_restart_needs_no_reload(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The serial already in the setup's first read: moved in that setup."""
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    assert await hass.config_entries.async_unload(entry.entry_id)
    _lite_reports_its_serial(bambuddy_api)

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await setup_integration(hass, entry)

    reload.assert_not_called()
    assert _ams_devices(hass, entry) == [_serial_device(entry)]
    assert _entity_id(hass, "sensor", _uid(entry, LITE_SERIAL, "slot_1")) == "sensor.ams_lite_03c00a000000004_slot_1"


async def test_the_race_between_the_setup_step_and_the_platforms(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The serial arrives after the setup's step, before the platforms:
    held, one reload, and that setup moves it."""
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    assert await hass.config_entries.async_unload(entry.entry_id)
    forward = hass.config_entries.async_forward_entry_setups

    async def serial_meanwhile(setting_up: Any, platforms: Any) -> None:
        _lite_reports_its_serial(bambuddy_api)
        for coordinator in setting_up.runtime_data.printers.values():
            await coordinator.async_refresh()
        await forward(setting_up, platforms)

    with (
        patch.object(hass.config_entries, "async_forward_entry_setups", serial_meanwhile),
        patch.object(hass.config_entries, "async_schedule_reload") as reload,
    ):
        await setup_integration(hass, entry)
    reload.assert_called_once_with(entry.entry_id)
    assert _serial_entities(hass, entry) == []

    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert _ams_devices(hass, entry) == [_serial_device(entry)]


async def test_a_users_own_id_stays(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """An entity ID the user chose is not the integration's to change; the
    entity follows the unit all the same."""
    entry = await set_up(hass, A1_MINI)
    registry = er.async_get(hass)
    registry.async_update_entity(_entity_id(hass, "sensor", _uid(entry, "0", "slot_1")) or "", new_entity_id="sensor.desk_spool_one")

    await _serial_then_reload(hass, bambuddy_api, entry, freezer)

    assert _entity_id(hass, "sensor", _uid(entry, LITE_SERIAL, "slot_1")) == "sensor.desk_spool_one"
    assert _entity_id(hass, "sensor", _uid(entry, LITE_SERIAL, "slot_2")) == "sensor.ams_lite_03c00a000000004_slot_2"


@pytest.mark.parametrize(
    "old",
    [
        # Home Assistant's suffix on a stand-in ID.
        "sensor.ams_lite_0309da000000002_a_slot_1_2",
        # A model guessed when the entity was built.
        "sensor.ams_0309da000000002_a_slot_1",
    ],
)
async def test_other_forms_of_the_stand_in_are_ours(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, old: str
) -> None:
    entry = await set_up(hass, A1_MINI)
    registry = er.async_get(hass)
    slot_1 = registry.async_update_entity(_entity_id(hass, "sensor", _uid(entry, "0", "slot_1")) or "", new_entity_id=old)

    await _serial_then_reload(hass, bambuddy_api, entry, freezer)

    moved = registry.async_get("sensor.ams_lite_03c00a000000004_slot_1")
    assert moved is not None and moved.id == slot_1.id


async def test_a_taken_target_gets_the_next_free_id(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The serial's ID taken by another entity: Home Assistant's next free
    one -- still no printer serial in it."""
    entry = await set_up(hass, A1_MINI)
    registry = er.async_get(hass)
    slot_1 = registry.async_get(_entity_id(hass, "sensor", _uid(entry, "0", "slot_1")) or "")
    assert slot_1 is not None
    registry.async_get_or_create("sensor", "other", "x", suggested_object_id="ams_lite_03c00a000000004_slot_1")

    await _serial_then_reload(hass, bambuddy_api, entry, freezer)

    moved = registry.async_get("sensor.ams_lite_03c00a000000004_slot_1_2")
    assert moved is not None and moved.id == slot_1.id
    assert (STAND_IN.format(1), "sensor.ams_lite_03c00a000000004_slot_1_2") in await renames.async_get(
        hass, entry.entry_id, printer_key(A1_MINI)
    )


async def test_a_stop_part_way_is_finished_by_the_next_setup(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The device moves last: a re-key that stops before it leaves the
    device by its place, the unit is held again, the entry reloads by
    itself, and that setup finishes -- one device, nothing twice."""
    entry = await set_up(hass, A1_MINI)
    registry = dr.async_get(hass)
    update = registry.async_update_device
    failed: list[bool] = []

    def fail_once(device_id: str, **changes: Any) -> Any:
        if "new_identifiers" in changes and not failed:
            failed.append(True)
            raise ValueError("stopped")
        return update(device_id, **changes)

    with patch.object(registry, "async_update_device", fail_once):
        await _serial_then_reload(hass, bambuddy_api, entry, freezer)

    assert failed
    assert _ams_devices(hass, entry) == [_serial_device(entry)]
    assert _entity_id(hass, "sensor", _uid(entry, LITE_SERIAL, "slot_1")) == "sensor.ams_lite_03c00a000000004_slot_1"


async def test_two_units_in_one_refresh(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """Both units of a printer get their serials at once: one reload, both
    move."""
    units = bambuddy_api.statuses[H2D]["ams"]
    serials = [unit["serial_number"] for unit in units]
    for unit in units:
        unit["serial_number"] = ""
    entry = await set_up(hass, H2D)
    for unit, serial in zip(units, serials, strict=True):
        unit["serial_number"] = serial

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)
    reload.assert_called_once_with(entry.entry_id)
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)

    # The AMS HT's entities come from two platforms (sensor, binary sensor): one hold.
    assert [_holds(hass, entry, serial, H2D) for serial in serials] == [1, 1]
    assert _entity_id(hass, "sensor", _uid(entry, serials[0], "slot_1", H2D)) == "sensor.ams_2_pro_19c06a000000001_slot_1"
    assert _entity_id(hass, "sensor", _uid(entry, serials[1], "humidity", H2D)) == "sensor.ams_ht_19f06a000000002_humidity"
    renamed = {new for _, new in await renames.async_get(hass, entry.entry_id, printer_key(H2D))}
    assert {"sensor.ams_2_pro_19c06a000000001_slot_1", "sensor.ams_ht_19f06a000000002_humidity"} <= renamed
    devices = {identifier for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id) for _, identifier in device.identifiers}
    assert {f"{printer_device(entry, H2D)}_ams_{serial}" for serial in serials} <= devices
    assert not {f"{printer_device(entry, H2D)}_ams_{place}" for place in (0, 128)} & devices


async def test_a_partly_deleted_unit(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """A slot the user deleted comes back in the serial's form; the others move."""
    entry = await set_up(hass, A1_MINI)
    registry = er.async_get(hass)
    slot_1 = registry.async_get(_entity_id(hass, "sensor", _uid(entry, "0", "slot_1")) or "")
    assert slot_1 is not None
    registry.async_remove("sensor.ams_lite_0309da000000002_a_slot_2")
    await hass.async_block_till_done()

    await _serial_then_reload(hass, bambuddy_api, entry, freezer)

    assert _entity_id(hass, "sensor", _uid(entry, LITE_SERIAL, "slot_2")) == "sensor.ams_lite_03c00a000000004_slot_2"
    moved = registry.async_get("sensor.ams_lite_03c00a000000004_slot_1")
    assert moved is not None and moved.id == slot_1.id


async def test_an_action_on_a_moved_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """The slot's actions find the unit under its serial."""
    entry = await set_up(hass, A1_MINI)
    await _serial_then_reload(hass, bambuddy_api, entry, freezer)

    await hass.services.async_call(DOMAIN, "load_filament", {"entity_id": "sensor.ams_lite_03c00a000000004_slot_1"}, blocking=True)

    bambuddy_api.load_filament.assert_awaited_once_with(A1_MINI, 0)


STAND_IN = "sensor.ams_lite_0309da000000002_a_slot_{}"
RENAMED = "sensor.ams_lite_03c00a000000004_slot_{}"


def _notice(hass: HomeAssistant, entry: MockConfigEntry, printer_id: int = A1_MINI) -> ir.IssueEntry | None:
    return ir.async_get(hass).async_get_issue(DOMAIN, renames_issue(entry.entry_id, printer_key(printer_id)))


async def _start_fix(hass: HomeAssistant, hass_client: ClientSessionGenerator, issue_id: str) -> tuple[Any, dict[str, Any]]:
    assert await async_setup_component(hass, "repairs", {})
    client = await hass_client()
    started = await client.post("/api/repairs/issues/fix", json={"handler": DOMAIN, "issue_id": issue_id})
    return client, await started.json()


def _printer_name(hass: HomeAssistant, entry: MockConfigEntry, printer_id: int = A1_MINI) -> str:
    device = find_device(hass, entry.entry_id, (DOMAIN, printer_device(entry, printer_id)))
    assert device is not None and device.name
    return device.name


async def test_the_notice_lists_the_renamed_ids(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, hass_client: ClientSessionGenerator
) -> None:
    """One notice for the printer under Settings -> Repairs: fixable, not
    kept over a restart by Home Assistant (the list holds serials, and Home
    Assistant writes a persistent issue into every diagnostics download);
    its dialog lists each renamed ID, old -> new."""
    entry = await set_up(hass, A1_MINI)
    await _serial_then_reload(hass, bambuddy_api, entry, freezer)

    issue = _notice(hass, entry)
    assert issue is not None and issue.is_fixable and not issue.is_persistent
    assert (issue.translation_key, issue.translation_placeholders) == ("ams_ids_renamed", {"name": _printer_name(hass, entry)})
    _, flow = await _start_fix(hass, hass_client, issue.issue_id)
    assert flow["step_id"] == "confirm"
    assert flow["description_placeholders"]["name"] == _printer_name(hass, entry)
    assert sorted(flow["description_placeholders"]["renamed"].split("\n- ")) == [
        f"`{STAND_IN.format(slot)}` → `{RENAMED.format(slot)}`" for slot in range(1, 5)
    ]


async def test_done_clears_the_notice_and_its_list(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, hass_client: ClientSessionGenerator
) -> None:
    entry = await set_up(hass, A1_MINI)
    await _serial_then_reload(hass, bambuddy_api, entry, freezer)
    issue = _notice(hass, entry)
    assert issue is not None

    client, flow = await _start_fix(hass, hass_client, issue.issue_id)
    done = await client.post(f"/api/repairs/issues/fix/{flow['flow_id']}", json={})
    assert (await done.json())["type"] == "create_entry"
    await hass.async_block_till_done()

    assert _notice(hass, entry) is None
    assert await renames.async_get(hass, entry.entry_id, printer_key(A1_MINI)) == []
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert _notice(hass, entry) is None


async def test_a_confirmed_notice_aborts(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, hass_client: ClientSessionGenerator
) -> None:
    """Its list gone meanwhile (confirmed in another window): the dialog says so."""
    entry = await set_up(hass, A1_MINI)
    await _serial_then_reload(hass, bambuddy_api, entry, freezer)
    issue = _notice(hass, entry)
    assert issue is not None
    await renames.async_clear(hass, entry.entry_id, printer_key(A1_MINI))

    _, flow = await _start_fix(hass, hass_client, issue.issue_id)

    assert (flow["type"], flow["reason"]) == ("abort", "already_confirmed")


async def test_the_notice_comes_back_after_a_restart(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Home Assistant forgets a non-persistent notice at a restart; the
    list in the integration's own store raises it again."""
    entry = await set_up(hass, A1_MINI)
    await _serial_then_reload(hass, bambuddy_api, entry, freezer)
    assert await hass.config_entries.async_unload(entry.entry_id)
    ir.async_delete_issue(hass, DOMAIN, renames_issue(entry.entry_id, printer_key(A1_MINI)))
    # What a restart forgets; the store's file keeps the list.
    hass.data[DOMAIN].pop("ams_renames")

    await setup_integration(hass, entry)

    assert _notice(hass, entry) is not None
    assert len(await renames.async_get(hass, entry.entry_id, printer_key(A1_MINI))) == 4


async def test_an_ignored_notice_stays_ignored(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """"Ignore" holds across setups while nothing new is renamed (the
    setup's clean-up of the entry's notices keeps it, too)."""
    entry = await set_up(hass, A1_MINI)
    await _serial_then_reload(hass, bambuddy_api, entry, freezer)
    ir.async_ignore_issue(hass, DOMAIN, renames_issue(entry.entry_id, printer_key(A1_MINI)), True)

    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    issue = _notice(hass, entry)
    assert issue is not None and issue.dismissed_version is not None


async def test_new_renames_show_again_after_ignore(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A second unit renamed later: the notice shows again, with both."""
    units = bambuddy_api.statuses[H2D]["ams"]
    serials = [unit["serial_number"] for unit in units]
    for unit in units:
        unit["serial_number"] = ""
    entry = await set_up(hass, H2D)
    for index in (0, 1):
        units[index]["serial_number"] = serials[index]
        with patch.object(hass.config_entries, "async_schedule_reload"):
            await next_refresh(hass, freezer)
        assert await hass.config_entries.async_reload(entry.entry_id)
        await hass.async_block_till_done(wait_background_tasks=True)
        if index == 0:
            ir.async_ignore_issue(hass, DOMAIN, renames_issue(entry.entry_id, printer_key(H2D)), True)

    issue = _notice(hass, entry, H2D)
    assert issue is not None and issue.dismissed_version is None
    pairs = await renames.async_get(hass, entry.entry_id, printer_key(H2D))
    assert {new for _, new in pairs} >= {"sensor.ams_2_pro_19c06a000000001_slot_1", "sensor.ams_ht_19f06a000000002_humidity"}


async def test_the_list_goes_with_the_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The printer removed (Configure, or its repair): its notice and list go."""
    entry = await set_up(hass, A1_MINI, X1C)
    await _serial_then_reload(hass, bambuddy_api, entry, freezer)
    assert _notice(hass, entry) is not None

    hass.config_entries.async_update_entry(entry, options={**entry.options, "printers": [printer_entry(X1C)]})
    await hass.async_block_till_done(wait_background_tasks=True)

    assert _notice(hass, entry) is None
    assert await renames.async_get(hass, entry.entry_id, printer_key(A1_MINI)) == []


async def test_the_list_goes_with_the_entry(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, A1_MINI)
    await _serial_then_reload(hass, bambuddy_api, entry, freezer)

    assert await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()

    assert await renames.async_get(hass, entry.entry_id, printer_key(A1_MINI)) == []


async def test_two_entries_keep_their_own_lists(hass: HomeAssistant) -> None:
    """Each entry's lists are its own: confirming one leaves the other's."""
    assert await renames.async_add(hass, "entry_a", "P1", [("sensor.a", "sensor.b")])
    assert await renames.async_add(hass, "entry_b", "P1", [("sensor.a", "sensor.c")])
    # The same pair again changes nothing.
    assert not await renames.async_add(hass, "entry_a", "P1", [("sensor.a", "sensor.b")])

    await renames.async_clear(hass, "entry_a", "P1")

    assert await renames.async_get(hass, "entry_a", "P1") == []
    assert await renames.async_get(hass, "entry_b", "P1") == [("sensor.a", "sensor.c")]


async def test_the_download_carries_no_renamed_serial(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    """Home Assistant adds the domain's issues to every diagnostics
    download: the notice's list of IDs (both serials) stays out of it.
    (Moved at a restart, without the frozen clock: Home Assistant 2025.5's
    download fails on freezegun's datetime.)"""
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    assert await hass.config_entries.async_unload(entry.entry_id)
    _lite_reports_its_serial(bambuddy_api)
    await setup_integration(hass, entry)
    assert _notice(hass, entry) is not None
    assert await async_setup_component(hass, "diagnostics", {})
    client = await hass_client()

    response = await client.get(f"/api/diagnostics/config_entry/{entry.entry_id}")
    body = (await response.text()).lower()

    assert response.status == 200
    assert LITE_SERIAL.lower() not in body
    assert printer_serial(A1_MINI).lower() not in body


OTHER_SERIAL = "00600A3B0000009"


async def test_a_unit_waiting_for_its_type_is_not_held(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Before BamBuddy has read the printer's version, a unit that reports
    its serial but not its type waits for the type -- no hold, no reload: a
    guessed model must not merge two units."""
    entry = await set_up(hass, A1_MINI)
    status = bambuddy_api.statuses[A1_MINI]
    status["firmware_version"] = None
    status["ams"][0].update({"serial_number": OTHER_SERIAL, "module_type": ""})

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)

    reload.assert_not_called()
    assert _holds(hass, entry, OTHER_SERIAL) == 0
    assert _serial_entities(hass, entry, OTHER_SERIAL) == []


@pytest.mark.parametrize(("module", "held"), [("ams", False), ("n3f", False), ("ams_f1", True)])
async def test_the_type_decides_after_the_wait(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, module: str, held: bool
) -> None:
    """The type that then comes decides: the AMS Lite it was is held for
    the move; another unit at the place gets a device of its own."""
    entry = await set_up(hass, A1_MINI)
    status = bambuddy_api.statuses[A1_MINI]
    firmware = status["firmware_version"]
    status["firmware_version"] = None
    status["ams"][0].update({"serial_number": OTHER_SERIAL, "module_type": ""})

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        await next_refresh(hass, freezer)
        status["ams"][0]["module_type"] = module
        status["firmware_version"] = firmware
        await next_refresh(hass, freezer)

    assert reload.called is held
    assert (_serial_entities(hass, entry, OTHER_SERIAL) == []) is held


async def test_a_unit_still_without_its_type_after_the_wait_is_no_merge(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """No type within the minute: a device of its own rather than a merge
    on a guessed model."""
    entry = await set_up(hass, A1_MINI)
    status = bambuddy_api.statuses[A1_MINI]
    status["firmware_version"] = None
    status["ams"][0].update({"serial_number": OTHER_SERIAL, "module_type": ""})

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        for _ in range(7):
            await next_refresh(hass, freezer)

    reload.assert_not_called()
    assert _serial_entities(hass, entry, OTHER_SERIAL) != []


async def test_the_setup_moves_the_unit_at_the_cap_too(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The cap limits the holds, not the setup's move: a setup that finds
    the serial moves the unit however often it was held."""
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    assert await hass.config_entries.async_unload(entry.entry_id)
    hass.data.setdefault(DOMAIN, {}).setdefault("ams_holds", {})[(entry.entry_id, printer_key(A1_MINI), LITE_SERIAL)] = HOLD_LIMIT
    _lite_reports_its_serial(bambuddy_api)

    await setup_integration(hass, entry)

    assert _ams_devices(hass, entry) == [_serial_device(entry)]


async def test_a_rename_that_failed_is_done_by_the_next_setup(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """An entity whose unique ID moved but whose ID could not be renamed:
    the next setup renames it."""
    entry = await set_up(hass, A1_MINI)
    registry = er.async_get(hass)
    update = registry.async_update_entity
    failed: list[bool] = []

    def fail_once(entity_id: str, **changes: Any) -> Any:
        if "new_entity_id" in changes and not failed:
            failed.append(True)
            raise ValueError("stopped")
        return update(entity_id, **changes)

    with patch.object(registry, "async_update_entity", fail_once):
        await _serial_then_reload(hass, bambuddy_api, entry, freezer)

    assert failed
    for slot in range(1, 5):
        assert _entity_id(hass, "sensor", _uid(entry, LITE_SERIAL, f"slot_{slot}")) == RENAMED.format(slot)


async def test_an_unexpected_error_in_the_move_lets_the_setup_go_on(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """Whatever stops the move, the entry still loads; the log says so."""
    entry = await set_up(hass, A1_MINI)
    registry = er.async_get(hass)
    update = registry.async_update_entity

    def broken(entity_id: str, **changes: Any) -> Any:
        if "new_unique_id" in changes:
            raise RuntimeError("broken registry")
        return update(entity_id, **changes)

    with caplog.at_level(logging.WARNING), patch.object(registry, "async_update_entity", broken):
        await _serial_then_reload(hass, bambuddy_api, entry, freezer)

    assert entry.state is ConfigEntryState.LOADED
    assert "Moving the AMS unit" in caplog.text


async def test_a_store_that_cannot_load_changes_nothing(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The list cannot be kept: nothing is moved, so nothing renamed goes
    unsaid; the next setup tries again."""
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    assert await hass.config_entries.async_unload(entry.entry_id)
    _lite_reports_its_serial(bambuddy_api)
    hass.data[DOMAIN].pop("ams_renames", None)

    with patch.object(renames.Store, "async_load", side_effect=OSError("disk")):
        await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()

    assert entry.state is not ConfigEntryState.LOADED
    assert _place_device(entry) in _ams_devices(hass, entry)


async def test_confirming_one_printers_notice_leaves_the_others(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, hass_client: ClientSessionGenerator
) -> None:
    units = bambuddy_api.statuses[H2D]["ams"]
    serials = [unit["serial_number"] for unit in units]
    for unit in units:
        unit["serial_number"] = ""
    entry = await set_up(hass, A1_MINI, H2D)
    _lite_reports_its_serial(bambuddy_api)
    for unit, serial in zip(units, serials, strict=True):
        unit["serial_number"] = serial
    with patch.object(hass.config_entries, "async_schedule_reload"):
        await next_refresh(hass, freezer)
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    desk, studio = _notice(hass, entry), _notice(hass, entry, H2D)
    assert desk is not None and studio is not None

    client, flow = await _start_fix(hass, hass_client, desk.issue_id)
    await client.post(f"/api/repairs/issues/fix/{flow['flow_id']}", json={})
    await hass.async_block_till_done()

    assert _notice(hass, entry) is None
    assert _notice(hass, entry, H2D) is not None
    assert await renames.async_get(hass, entry.entry_id, printer_key(H2D)) != []


async def test_an_absent_printers_notice_names_its_device(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy does not list the printer right now: its notice stays,
    under the name its device has now (as its repair names it)."""
    entry = await set_up(hass, A1_MINI, X1C)
    await _serial_then_reload(hass, bambuddy_api, entry, freezer)
    registry = dr.async_get(hass)
    device = find_device(hass, entry.entry_id, (DOMAIN, printer_device(entry, A1_MINI)))
    assert device is not None
    registry.async_update_device(device.id, name="Desk renamed (A1 Mini / 0309DA000000002)")
    bambuddy_api.get_printers.return_value = [printer for printer in load_fixture("printers.json") if printer["id"] != A1_MINI]

    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    issue = _notice(hass, entry)
    assert issue is not None
    assert issue.translation_placeholders == {"name": "Desk renamed (A1 Mini / 0309DA000000002)"}


def test_the_notices_texts() -> None:
    """It names the units in general (one or several), says what Home
    Assistant leaves to the user and that the card follows by itself, and
    its last screen is its own."""
    for language, words in (
        ("en", ("AMS serial numbers", "the BamBuddy card finds", "notice is closed")),
        ("de", ("Seriennummern von AMS-Einheiten", "die BamBuddy-Karte findet", "Hinweis ist geschlossen")),
    ):
        texts = json.loads((INTEGRATION / "translations" / f"{language}.json").read_text(encoding="utf-8"))
        flow = texts["issues"]["ams_ids_renamed"]["fix_flow"]
        description, done = flow["step"]["confirm"]["description"], flow["create_entry"]["default"]
        assert words[0] in description and words[1] in description, language
        assert words[2] in done, language


async def test_a_unique_id_taken_under_the_serial_keeps_the_unit_by_its_place(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, caplog: pytest.LogCaptureFixture
) -> None:
    """An entry under the serial's unique ID already (left by something
    else): nothing moves -- no registry entry is overwritten -- and the log
    says why."""
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    assert await hass.config_entries.async_unload(entry.entry_id)
    er.async_get(hass).async_get_or_create("sensor", DOMAIN, _uid(entry, LITE_SERIAL, "slot_1"))
    _lite_reports_its_serial(bambuddy_api)

    with caplog.at_level(logging.WARNING), patch.object(hass.config_entries, "async_schedule_reload"):
        await setup_integration(hass, entry)

    assert "keeps its place" in caplog.text
    assert _place_device(entry) in _ams_devices(hass, entry)
