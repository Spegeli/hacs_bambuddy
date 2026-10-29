"""What a setup does with BamBuddy's smart plugs: a plug's device is its
BamBuddy record, its entities what it switches -- those that stay are moved,
never deleted and made again; what no plug needs any more goes."""
from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import attr
from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import async_capture_events
import pytest

from custom_components.bambuddy import plug_history
from custom_components.bambuddy.api import BamBuddyConnectionError
from custom_components.bambuddy.const import DOMAIN
from custom_components.bambuddy.coordinator import find_device

from tests.conftest import (
    A1_MINI,
    X1C,
    entity_id,
    load_fixture,
    make_entry,
    plug_identifier_of,
    plug_unique_id,
    printer_key,
    set_up,
    setup_integration,
)
from tests.test_plugs import _info, _listed, with_plugs

# Home Assistant restores a deleted entity's settings from 2025.x on; the floor only its registry id.
_RESTORES_SETTINGS = "area_id" in attr.fields_dict(er.DeletedRegistryEntry)


async def _reload(hass: HomeAssistant, entry_id: str) -> None:
    assert await hass.config_entries.async_reload(entry_id)
    await hass.async_block_till_done()


def _device_id(hass: HomeAssistant, entry_id: str, plug_id: int) -> str:
    device = find_device(hass, entry_id, plug_identifier_of(hass, entry_id, plug_id))
    assert device is not None
    return device.id


def _removed(events: list, entity: str) -> bool:  # type: ignore[type-arg]
    return any(event.data.get("action") == "remove" and event.data.get("entity_id") == entity for event in events)


async def test_a_swap_keeps_both_devices_and_moves_the_entities(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Two plugs' Tasmotas swapped in BamBuddy: each device stays its
    BamBuddy plug, the entities go with their Tasmota."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C, A1_MINI)
    three, eight = _device_id(hass, entry.entry_id, 3), _device_id(hass, entry.entry_id, 8)
    switch = entity_id(hass, "switch", plug_unique_id(hass, entry.entry_id, 3, "power"))
    registry_id = er.async_get(hass).async_get(switch).id  # type: ignore[union-attr]
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"ip_address": _info(8)["ip_address"]}, "8": {"ip_address": _info(3)["ip_address"]}})

    await _reload(hass, entry.entry_id)

    assert (_device_id(hass, entry.entry_id, 3), _device_id(hass, entry.entry_id, 8)) == (three, eight)
    moved = er.async_get(hass).async_get(switch)
    assert moved is not None and (moved.id, moved.device_id) == (registry_id, eight)


async def test_a_source_change_keeps_the_device_and_brings_new_entities(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    device = _device_id(hass, entry.entry_id, 3)
    old = plug_unique_id(hass, entry.entry_id, 3, "power")
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"ip_address": "192.0.2.199"}})

    await _reload(hass, entry.entry_id)

    assert _device_id(hass, entry.entry_id, 3) == device
    assert er.async_get(hass).async_get_entity_id("switch", DOMAIN, old) is None
    assert er.async_get(hass).async_get_entity_id("switch", DOMAIN, plug_unique_id(hass, entry.entry_id, 3, "power")) is not None


async def test_a_plug_created_again_is_a_new_device_with_the_same_entities(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Created again in BamBuddy with its number: a new device, and the
    entities, moved there, are never deleted."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    device = _device_id(hass, entry.entry_id, 3)
    switch = entity_id(hass, "switch", plug_unique_id(hass, entry.entry_id, 3, "power"))
    registry_id = er.async_get(hass).async_get(switch).id  # type: ignore[union-attr]
    events = async_capture_events(hass, er.EVENT_ENTITY_REGISTRY_UPDATED)
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"created_at": "2026-10-20T09:00:00"}})

    await _reload(hass, entry.entry_id)

    now = _device_id(hass, entry.entry_id, 3)
    assert now != device and dr.async_get(hass).async_get(device) is None
    moved = er.async_get(hass).async_get(switch)
    assert moved is not None and (moved.id, moved.device_id) == (registry_id, now)
    assert not _removed(events, switch)


async def test_another_server_other_source_is_new(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Another BamBuddy's plug 12 where plug 3 was, on another Tasmota:
    plug 3's device and entities go, plug 12 has its own."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    device = _device_id(hass, entry.entry_id, 3)
    old = plug_unique_id(hass, entry.entry_id, 3, "power")
    bambuddy_api.plug_statuses["12"] = dict(bambuddy_api.plug_statuses["3"])
    twelve = {**_info(3), "id": 12, "ip_address": "192.0.2.212", "created_at": "2026-10-20T09:00:00"}
    bambuddy_api.get_smart_plugs.return_value = [plug for plug in load_fixture("smart_plugs.json") if plug["id"] != 3] + [twelve]

    await _reload(hass, entry.entry_id)

    assert dr.async_get(hass).async_get(device) is None
    assert er.async_get(hass).async_get_entity_id("switch", DOMAIN, old) is None
    assert er.async_get(hass).async_get_entity_id("switch", DOMAIN, plug_unique_id(hass, entry.entry_id, 12, "power")) is not None


async def test_another_server_with_the_same_tasmota_keeps_its_entities(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Another BamBuddy's plug 12 on the same Tasmota: a new device, the
    entities moved to it."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    switch = entity_id(hass, "switch", plug_unique_id(hass, entry.entry_id, 3, "power"))
    registry_id = er.async_get(hass).async_get(switch).id  # type: ignore[union-attr]
    events = async_capture_events(hass, er.EVENT_ENTITY_REGISTRY_UPDATED)
    bambuddy_api.plug_statuses["12"] = dict(bambuddy_api.plug_statuses["3"])
    twelve = {**_info(3), "id": 12, "created_at": "2026-10-20T09:00:00"}
    bambuddy_api.get_smart_plugs.return_value = [plug for plug in load_fixture("smart_plugs.json") if plug["id"] != 3] + [twelve]

    await _reload(hass, entry.entry_id)

    moved = er.async_get(hass).async_get(switch)
    assert moved is not None and (moved.id, moved.device_id) == (registry_id, _device_id(hass, entry.entry_id, 12))
    assert not _removed(events, switch)


async def test_a_user_named_entity_survives_a_new_record(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Moved, not made again: also on Home Assistant 2025.5, which would
    not bring the user's ID and name back."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    switch = entity_id(hass, "switch", plug_unique_id(hass, entry.entry_id, 3, "power"))
    er.async_get(hass).async_update_entity(switch, new_entity_id="switch.my_plug", name="Mine")
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"created_at": "2026-10-20T09:00:00"}})

    await _reload(hass, entry.entry_id)

    mine = er.async_get(hass).async_get("switch.my_plug")
    assert mine is not None and mine.name == "Mine" and mine.device_id == _device_id(hass, entry.entry_id, 3)


async def test_the_switch_off_survives_its_plug_created_again(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The printer's own plug created again: its switch-off moves to the new
    device with the user's ID and stays armed."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    switch_off = entity_id(hass, "switch", f"{entry.entry_id}_switchoff_{printer_key(X1C)}_auto_off")
    er.async_get(hass).async_update_entity(switch_off, new_entity_id="switch.my_switch_off")
    await hass.services.async_call("switch", "turn_on", {"entity_id": "switch.my_switch_off"}, blocking=True)
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"created_at": "2026-10-20T09:00:00"}})

    await _reload(hass, entry.entry_id)

    mine = er.async_get(hass).async_get("switch.my_switch_off")
    assert mine is not None and mine.device_id == _device_id(hass, entry.entry_id, 3)
    state = hass.states.get("switch.my_switch_off")
    assert state is not None and state.state == "on"


async def test_beta_plugs_are_set_up_anew(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The first betas knew a plug by BamBuddy's number: their devices and
    entities go, the plug comes in the new form."""
    with_plugs(bambuddy_api)
    entry = make_entry(hass, X1C)
    device = dr.async_get(hass).async_get_or_create(config_entry_id=entry.entry_id, identifiers={(DOMAIN, f"{entry.entry_id}_plug_3")})
    registry = er.async_get(hass)
    for key in ("power", "auto_off"):
        registry.async_get_or_create("switch", DOMAIN, f"{entry.entry_id}_plug3_{key}", config_entry=entry, device_id=device.id)

    await setup_integration(hass, entry)

    assert dr.async_get(hass).async_get(device.id) is None
    assert [registry.async_get_entity_id("switch", DOMAIN, f"{entry.entry_id}_plug3_{key}") for key in ("power", "auto_off")] == [None, None]
    assert registry.async_get_entity_id("switch", DOMAIN, plug_unique_id(hass, entry.entry_id, 3, "power")) is not None


async def test_nothing_is_removed_while_the_list_cannot_be_read(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    device = _device_id(hass, entry.entry_id, 3)
    switch = entity_id(hass, "switch", plug_unique_id(hass, entry.entry_id, 3, "power"))
    bambuddy_api.get_smart_plugs.side_effect = BamBuddyConnectionError("GET /smart-plugs/: ClientConnectorError")

    await _reload(hass, entry.entry_id)

    assert dr.async_get(hass).async_get(device) is not None
    assert er.async_get(hass).async_get(switch) is not None


@pytest.mark.skipif(not _RESTORES_SETTINGS, reason="Home Assistant 2025.5 restores a deleted entity's registry id only")
async def test_a_plug_gone_across_a_read_comes_back_with_its_settings(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Unlinked in BamBuddy, then linked again: its entities were removed
    and come back by their unique ID, with the user's ID and name."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    unique_id = plug_unique_id(hass, entry.entry_id, 3, "power")
    switch = entity_id(hass, "switch", unique_id)
    er.async_get(hass).async_update_entity(switch, new_entity_id="switch.my_plug", name="Mine")
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"printer_id": None}})
    await _reload(hass, entry.entry_id)
    assert er.async_get(hass).async_get_entity_id("switch", DOMAIN, unique_id) is None

    with_plugs(bambuddy_api)
    await _reload(hass, entry.entry_id)

    mine = er.async_get(hass).async_get("switch.my_plug")
    assert mine is not None and mine.name == "Mine" and mine.unique_id == unique_id


async def test_without_the_recorder_nothing_breaks(hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]) -> None:
    """No recorder, no statistics to delete: the ID leaves the store all the same."""
    gone = "sensor.bambuddy_smart_plug_abcdef_power"
    await plug_history.async_vanished(hass, [gone])
    freezer.tick(timedelta(days=11))

    assert await plug_history.async_purge(hass) == [gone]
    assert gone not in hass_storage["bambuddy.plug_history"]["data"]["vanished"]


async def test_removed_ids_are_noted_even_when_the_platforms_fail(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_storage: dict[str, Any]
) -> None:
    """Noted as soon as they are removed: a setup that fails afterwards
    leaves no statistics behind for good."""
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    old = entity_id(hass, "switch", plug_unique_id(hass, entry.entry_id, 3, "power"))
    bambuddy_api.get_smart_plugs.return_value = _listed(**{"3": {"ip_address": "192.0.2.199"}})

    with patch.object(hass.config_entries, "async_forward_entry_setups", side_effect=RuntimeError("platform setup failed")):
        assert not await hass.config_entries.async_reload(entry.entry_id)
        await hass.async_block_till_done()

    assert old in hass_storage["bambuddy.plug_history"]["data"]["vanished"]
