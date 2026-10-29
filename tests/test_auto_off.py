"""Switch off after the print: ours, in Home Assistant -- BamBuddy's own
auto off cannot be changed with an API key. The scenarios of the design:
it switches the printer's plug off only after a print that finished,
once the printer stands still and every nozzle is cool, and never on a
paused print, on stale values, or beside BamBuddy's own auto off."""
from __future__ import annotations

import asyncio
from unittest.mock import patch
from datetime import timedelta
from types import SimpleNamespace
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import Event, HomeAssistant, State, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util, slugify
from homeassistant.util.unit_system import US_CUSTOMARY_SYSTEM
from pytest_homeassistant_custom_component.common import mock_restore_cache, mock_restore_cache_with_extra_data
import pytest

from custom_components.bambuddy.api import BamBuddyApiError, BamBuddyConnectionError, BamBuddyPermissionError
from custom_components.bambuddy.const import DOMAIN
from custom_components.bambuddy.coordinator import find_device
from custom_components.bambuddy.models import display_model

from tests.conftest import (
    A1_MINI,
    H2D,
    P1S,
    X1C,
    load_fixture,
    make_entry,
    next_refresh,
    plug_identifier_of,
    plug_unique_id,
    printer_info,
    printer_key,
    printer_serial,
    set_up,
    setup_integration,
    state_at,
)

# The X1C's plug: Tasmota, powers the printer, BamBuddy's own auto off off.
PLUG = 3


def _plugs(**changes: dict[str, Any]) -> list[dict[str, Any]]:
    """BamBuddy's plug list, some plugs changed (by number as text)."""
    return [{**plug, **changes.get(str(plug["id"]), {})} for plug in load_fixture("smart_plugs.json")]


@pytest.fixture(autouse=True)
def with_plugs(bambuddy_api: SimpleNamespace) -> None:
    bambuddy_api.get_smart_plugs.return_value = _plugs()


# The switch-off's keys: its entities belong to the printer, not the plug.
_SWITCH_OFF_KEYS = ("auto_off", "auto_off_every_print", "auto_off_temperature", "auto_off_skip")


def _unique_id(hass: HomeAssistant, entry_id: str, key: str, plug_id: int = PLUG) -> str:
    if key in _SWITCH_OFF_KEYS:
        entry = hass.config_entries.async_get_entry(entry_id)
        assert entry is not None
        plugs = entry.runtime_data.plugs
        printer = plugs.printers[plugs.data[plug_id].printer_id or -1]
        return f"{entry_id}_switchoff_{printer.key}_{key}"
    return plug_unique_id(hass, entry_id, plug_id, key)


def _entity_id(hass: HomeAssistant, entry_id: str, domain: str, key: str, plug_id: int = PLUG) -> str:
    entity_id = er.async_get(hass).async_get_entity_id(domain, DOMAIN, _unique_id(hass, entry_id, key, plug_id))
    assert entity_id is not None, key
    return entity_id


def _switch_off_entity_id(domain: str, key: str, printer_id: int = X1C) -> str:
    """The entity ID a printer's switch-off entity is given: model, serial, key."""
    model = display_model(printer_info(printer_id).get("model")) or "printer"
    return f"{domain}.{slugify(f'{model} {printer_serial(printer_id)} {key}')}"


async def _tick(hass: HomeAssistant, freezer: FrozenDateTimeFactory, seconds: float = 16) -> None:
    """Past the plugs' next read (every 15 s)."""
    await next_refresh(hass, freezer, seconds)


async def _every_print(hass: HomeAssistant, entry_id: str, plug_id: int = PLUG) -> None:
    await hass.services.async_call(
        "switch", "turn_on", {"entity_id": _entity_id(hass, entry_id, "switch", "auto_off_every_print", plug_id)}, blocking=True
    )


async def _arm(hass: HomeAssistant, entry_id: str, plug_id: int = PLUG) -> None:
    await hass.services.async_call("switch", "turn_on", {"entity_id": _entity_id(hass, entry_id, "switch", "auto_off", plug_id)}, blocking=True)


def _printer(api: SimpleNamespace, printer_id: int = X1C, *, state: str | None = None, connected: bool = True, **temperatures: float | None) -> None:
    """The printer's status; at the end of a job its targets go to 0, as the
    firmware sets them, unless given."""
    status = api.statuses[printer_id]
    status["connected"] = connected
    if state is not None:
        status["state"] = state
        if state not in ("RUNNING", "PAUSE", "PREPARE", "SLICING"):
            status["temperatures"].update(
                {key: 0.0 for key in ("nozzle_target", "nozzle_2_target", "bed_target", "chamber_target") if key in status["temperatures"]}
            )
    status["temperatures"].update(temperatures)


def _phase(hass: HomeAssistant, entry_id: str, plug_id: int = PLUG) -> Any:
    state = hass.states.get(_entity_id(hass, entry_id, "switch", "auto_off", plug_id))
    assert state is not None
    return state.attributes["phase"]


def _switched_off(api: SimpleNamespace, plug_id: int = PLUG) -> bool:
    return any(call.args == (plug_id, False) for call in api.control_plug.await_args_list)


async def test_the_entities_of_a_printers_plug(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Off by default; only after the next print, below 50 °C."""
    entry = await set_up(hass, X1C)

    armed = hass.states.get(_entity_id(hass, entry.entry_id, "switch", "auto_off"))
    every = hass.states.get(_entity_id(hass, entry.entry_id, "switch", "auto_off_every_print"))
    temperature = hass.states.get(_entity_id(hass, entry.entry_id, "number", "auto_off_temperature"))
    assert armed is not None and every is not None and temperature is not None
    assert (armed.state, armed.attributes["phase"], every.state, temperature.state) == ("off", "idle", "off", "50.0")
    assert (temperature.attributes["min"], temperature.attributes["max"], temperature.attributes["unit_of_measurement"]) == (30, 100, "°C")
    # Only on the plug that powers the printer: not its accessory.
    switch_off = er.async_get(hass).async_get(_entity_id(hass, entry.entry_id, "switch", "auto_off"))
    device = find_device(hass, entry.entry_id, plug_identifier_of(hass, entry.entry_id, PLUG))
    assert switch_off is not None and device is not None and switch_off.device_id == device.id


async def test_1_switches_off_once_the_nozzle_is_cool(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)

    _printer(bambuddy_api, state="FINISH", nozzle=180.0)
    await _tick(hass, freezer)
    assert (_switched_off(bambuddy_api), _phase(hass, entry.entry_id)) == (False, "waiting")

    _printer(bambuddy_api, nozzle=49.0)
    await _tick(hass, freezer)
    assert _switched_off(bambuddy_api)
    assert _phase(hass, entry.entry_id) == "done"
    # The plug shows off at once, as BamBuddy shows the printer offline.
    assert state_at(hass, _entity_id(hass, entry.entry_id, "switch", "power")).state == "off"
    # Only after the next print (the default): used up.
    assert state_at(hass, _entity_id(hass, entry.entry_id, "switch", "auto_off")).state == "off"


async def test_after_every_print_it_stays_armed(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    entry = await set_up(hass, X1C)
    await _every_print(hass, entry.entry_id)
    await _arm(hass, entry.entry_id)

    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)
    assert _switched_off(bambuddy_api)
    assert state_at(hass, _entity_id(hass, entry.entry_id, "switch", "auto_off")).state == "on"


async def test_2_a_paused_print_never_switches_off(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """A filament swap by hand: the nozzle cools, the print goes on later."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)

    _printer(bambuddy_api, state="PAUSE", nozzle=30.0)
    for _ in range(3):
        await _tick(hass, freezer)

    assert not _switched_off(bambuddy_api)
    assert _phase(hass, entry.entry_id) == "idle"


async def test_3_a_failed_or_stopped_print_leaves_the_printer_on(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)

    _printer(bambuddy_api, state="FAILED", nozzle=30.0)
    await _tick(hass, freezer)
    await _tick(hass, freezer)

    assert not _switched_off(bambuddy_api)
    assert _phase(hass, entry.entry_id) == "failed_print"


async def test_4_a_new_print_ends_the_wait(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """Armed for the new print: it switches off after that one."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)

    _printer(bambuddy_api, state="PREPARE", nozzle=30.0)
    await _tick(hass, freezer)
    assert (_switched_off(bambuddy_api), _phase(hass, entry.entry_id)) == (False, "idle")

    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)
    assert _switched_off(bambuddy_api)


async def test_5_drying_waits(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """Drying needs the power: it waits until the AMS is done."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    bambuddy_api.statuses[X1C]["ams"][0]["dry_time"] = 120
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)
    assert not _switched_off(bambuddy_api)

    bambuddy_api.statuses[X1C]["ams"][0]["dry_time"] = 0
    await _tick(hass, freezer)
    assert _switched_off(bambuddy_api)


async def test_6_a_filament_change_waits(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    bambuddy_api.statuses[X1C]["ams_status_main"] = 1
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)
    assert not _switched_off(bambuddy_api)

    bambuddy_api.statuses[X1C]["ams_status_main"] = 0
    await _tick(hass, freezer)
    assert _switched_off(bambuddy_api)


async def test_7_a_finish_found_at_start_does_not_arm(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """Home Assistant starts while the printer stands at FINISH since hours:
    no print ended now."""
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    await _tick(hass, freezer)
    await _tick(hass, freezer)

    assert not _switched_off(bambuddy_api)


async def test_8_stale_values_never_switch_off(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """BamBuddy lost the printer: its last values stay, a cool nozzle among
    them perhaps -- it waits for the printer to come back."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)

    _printer(bambuddy_api, connected=False, nozzle=30.0)
    await _tick(hass, freezer)
    assert (_switched_off(bambuddy_api), _phase(hass, entry.entry_id)) == (False, "waiting")

    _printer(bambuddy_api, connected=True)
    await _tick(hass, freezer)
    assert _switched_off(bambuddy_api)


async def test_9_a_plug_switched_off_by_hand_ends_the_wait(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)

    # Off by hand while the nozzle is still hot.
    bambuddy_api.plug_statuses[str(PLUG)]["state"] = "OFF"
    await _tick(hass, freezer)
    assert _phase(hass, entry.entry_id) == "done"

    _printer(bambuddy_api, nozzle=30.0)
    await _tick(hass, freezer)
    assert not _switched_off(bambuddy_api)


async def test_10_a_failing_switch_off_is_tried_again_then_given_up(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    bambuddy_api.control_plug.side_effect = BamBuddyApiError(503, "Failed to communicate with device")
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)
    await _tick(hass, freezer)
    assert bambuddy_api.control_plug.await_count >= 2
    assert _phase(hass, entry.entry_id) == "waiting"
    # The nozzle is cool: what it waits for is the plug.
    assert _attribute(hass, entry.entry_id, "waiting_for") == "plug"

    await _tick(hass, freezer, 11 * 60)
    assert _phase(hass, entry.entry_id) == "gave_up"
    tries = bambuddy_api.control_plug.await_count
    await _tick(hass, freezer)
    assert bambuddy_api.control_plug.await_count == tries


async def test_11_bambuddys_own_auto_off_comes_first(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """The P1S's plug: BamBuddy switches it off itself -- ours refuses.
    The X1C's: BamBuddy's turned on later -- ours stands aside."""
    entry = await set_up(hass, X1C, P1S)
    with pytest.raises(ServiceValidationError) as caught:
        await _arm(hass, entry.entry_id, 5)
    assert caught.value.translation_key == "auto_off_bambuddy"

    await _arm(hass, entry.entry_id)
    bambuddy_api.get_smart_plugs.return_value = _plugs(**{str(PLUG): {"auto_off": True}})
    await _tick(hass, freezer, 61)
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)

    assert not _switched_off(bambuddy_api)
    assert _phase(hass, entry.entry_id) == "bambuddy"


async def test_12_the_wait_goes_on_after_a_restart(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    entity_id = _switch_off_entity_id("switch", "auto_off")
    mock_restore_cache(hass, [State(entity_id, "on", {"phase": "waiting", "since": dt_util.utcnow().isoformat()})])
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    assert _entity_id(hass, entry.entry_id, "switch", "auto_off") == entity_id

    await _tick(hass, freezer)

    assert _switched_off(bambuddy_api)


async def test_13_every_nozzle_must_be_cool(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """Two nozzles: the hotter one decides."""
    bambuddy_api.get_smart_plugs.return_value = _plugs(**{str(PLUG): {"printer_id": H2D}})
    # The fixture's AMS HT dries: done.
    bambuddy_api.statuses[H2D]["ams"][1]["dry_time"] = 0
    entry = await set_up(hass, H2D)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, H2D, state="FINISH", nozzle=40.0, nozzle_2=120.0)
    await _tick(hass, freezer)
    assert not _switched_off(bambuddy_api)

    _printer(bambuddy_api, H2D, nozzle_2=45.0)
    await _tick(hass, freezer)
    assert _switched_off(bambuddy_api)


async def test_14_an_unknown_nozzle_temperature_waits(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=None)
    await _tick(hass, freezer)
    await _tick(hass, freezer)

    assert not _switched_off(bambuddy_api)


async def test_15_only_after_the_next_print(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """One-shot (BamBuddy's "Keep Enabled" off): it turns itself off afterwards."""
    entry = await set_up(hass, X1C)
    await hass.services.async_call(
        "switch", "turn_off", {"entity_id": _entity_id(hass, entry.entry_id, "switch", "auto_off_every_print")}, blocking=True
    )
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)

    assert _switched_off(bambuddy_api)
    assert state_at(hass, _entity_id(hass, entry.entry_id, "switch", "auto_off")).state == "off"


async def test_not_this_time(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """While it waits: this print it stays on; after the next it goes off."""
    entry = await set_up(hass, X1C)
    await _every_print(hass, entry.entry_id)
    await _arm(hass, entry.entry_id)
    skip = _entity_id(hass, entry.entry_id, "button", "auto_off_skip")
    assert state_at(hass, skip).state == "unavailable"
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)

    await hass.services.async_call("button", "press", {"entity_id": skip}, blocking=True)
    _printer(bambuddy_api, nozzle=30.0)
    await _tick(hass, freezer)
    assert (_switched_off(bambuddy_api), _phase(hass, entry.entry_id)) == (False, "skipped")

    _printer(bambuddy_api, state="RUNNING", nozzle=220.0)
    await _tick(hass, freezer)
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)
    assert _switched_off(bambuddy_api)


async def test_it_gives_up_after_two_hours(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)

    await _tick(hass, freezer, 2 * 3600 + 60)
    _printer(bambuddy_api, nozzle=30.0)
    await _tick(hass, freezer)

    assert (_switched_off(bambuddy_api), _phase(hass, entry.entry_id)) == (False, "gave_up")


async def test_the_temperature_is_the_users(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    entry = await set_up(hass, X1C)
    await hass.services.async_call(
        "number", "set_value", {"entity_id": _entity_id(hass, entry.entry_id, "number", "auto_off_temperature"), "value": 40}, blocking=True
    )
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=45.0)
    await _tick(hass, freezer)
    assert not _switched_off(bambuddy_api)

    _printer(bambuddy_api, nozzle=39.0)
    await _tick(hass, freezer)
    assert _switched_off(bambuddy_api)


async def test_settings_survive_a_restart(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    # One cache: each mock replaces the last.
    mock_restore_cache_with_extra_data(
        hass,
        [
            (State(_switch_off_entity_id("switch", "auto_off"), "on", {"phase": "idle"}), {}),
            (State(_switch_off_entity_id("switch", "auto_off_every_print"), "off"), {}),
            (
                State(_switch_off_entity_id("number", "auto_off_temperature"), "42.0"),
                {"native_value": 42.0, "native_unit_of_measurement": "°C", "native_min_value": 30.0, "native_max_value": 100.0, "native_step": 1.0},
            )
        ],
    )
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    states = [
        state_at(hass, _entity_id(hass, entry.entry_id, domain, key)).state
        for domain, key in (("switch", "auto_off"), ("switch", "auto_off_every_print"), ("number", "auto_off_temperature"))
    ]
    assert states == ["on", "off", "42.0"]


async def test_the_threshold_survives_a_restart_in_fahrenheit(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """With US customary units Home Assistant stores the state in °F (42 °C reads 107.6): the
    threshold comes back from its own value, not from the state."""
    hass.config.units = US_CUSTOMARY_SYSTEM
    number = _switch_off_entity_id("number", "auto_off_temperature")
    mock_restore_cache_with_extra_data(
        hass,
        [
            (
                State(number, "107.6", {"unit_of_measurement": "°F"}),
                {"native_value": 42.0, "native_unit_of_measurement": "°C", "native_min_value": 30.0, "native_max_value": 100.0, "native_step": 1.0},
            )
        ],
    )
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    state = hass.states.get(_entity_id(hass, entry.entry_id, "number", "auto_off_temperature"))
    assert state is not None
    assert (round(float(state.state), 1), state.attributes["unit_of_measurement"]) == (107.6, "°F")


async def test_an_odd_printer_state_while_waiting_waits(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Neither a job nor standing still (BamBuddy's "unknown"): not now."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)

    _printer(bambuddy_api, state="unknown", nozzle=30.0)
    await _tick(hass, freezer)

    assert (_switched_off(bambuddy_api), _phase(hass, entry.entry_id)) == (False, "waiting")


async def test_bambuddys_auto_off_turned_on_while_waiting(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy takes over: ours stands aside."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)

    bambuddy_api.get_smart_plugs.return_value = _plugs(**{str(PLUG): {"auto_off": True}})
    await _tick(hass, freezer, 61)
    _printer(bambuddy_api, nozzle=30.0)
    await _tick(hass, freezer)

    assert (_switched_off(bambuddy_api), _phase(hass, entry.entry_id)) == (False, "bambuddy")


async def test_switched_off_while_it_waits(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)

    await hass.services.async_call("switch", "turn_off", {"entity_id": _entity_id(hass, entry.entry_id, "switch", "auto_off")}, blocking=True)
    _printer(bambuddy_api, nozzle=30.0)
    await _tick(hass, freezer)

    assert (_switched_off(bambuddy_api), _phase(hass, entry.entry_id)) == (False, "idle")


async def test_not_this_time_uses_up_only_the_next_print(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    await hass.services.async_call(
        "switch", "turn_off", {"entity_id": _entity_id(hass, entry.entry_id, "switch", "auto_off_every_print")}, blocking=True
    )
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)

    await hass.services.async_call("button", "press", {"entity_id": _entity_id(hass, entry.entry_id, "button", "auto_off_skip")}, blocking=True)

    assert state_at(hass, _entity_id(hass, entry.entry_id, "switch", "auto_off")).state == "off"


@pytest.mark.parametrize(("every_print", "armed"), [(False, "off"), (True, "on")])
async def test_a_wait_older_than_the_limit_is_over_after_a_restart(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, every_print: bool, armed: str
) -> None:
    """Over as a running wait is over: from now, and "only after the next print" used up -- days later
    the next print must not switch the printer off unasked."""
    entity_id = _switch_off_entity_id("switch", "auto_off")
    since = (dt_util.utcnow() - timedelta(hours=3)).isoformat()
    mock_restore_cache(hass, [State(entity_id, "on", {"phase": "waiting", "since": since, "every_print": every_print})])
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    state = hass.states.get(entity_id)
    assert state is not None
    assert (state.state, state.attributes["phase"]) == (armed, "gave_up")
    assert state.attributes["since"] != since
    assert not _switched_off(bambuddy_api)



async def test_an_unknown_state_after_a_job_is_no_end(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """BamBuddy reports "unknown" for a moment (its start, its power-off guess): the print goes on, and its end counts."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="RUNNING", nozzle=220.0)
    await _tick(hass, freezer)
    _printer(bambuddy_api, state="unknown")
    await _tick(hass, freezer)
    assert _phase(hass, entry.entry_id) == "idle"
    _printer(bambuddy_api, state="RUNNING", nozzle=220.0)
    await _tick(hass, freezer)
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)

    assert _switched_off(bambuddy_api)


async def test_an_unreachable_plug_waits_then_is_switched_once_it_answers(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    bambuddy_api.plug_statuses[str(PLUG)].update({"reachable": False, "state": None})
    await _tick(hass, freezer)
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)
    assert (_attribute(hass, entry.entry_id, "waiting_for"), _switched_off(bambuddy_api)) == ("plug", False)

    bambuddy_api.plug_statuses[str(PLUG)].update({"reachable": True, "state": "ON"})
    await _tick(hass, freezer)

    assert _switched_off(bambuddy_api)


async def test_a_plug_moved_in_bambuddy_while_waiting_is_not_switched(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Linked to another printer meanwhile: it powers that one now -- nothing goes off before the reload follows
    it. The reload held back, so the plugs' reads meet the moved plug."""
    entry = await set_up(hass, X1C, P1S)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=180.0)
    await _tick(hass, freezer)
    assert _phase(hass, entry.entry_id) == "waiting"

    bambuddy_api.get_smart_plugs.return_value = _plugs(**{str(PLUG): {"printer_id": P1S}})
    with patch("custom_components.bambuddy.coordinator.async_schedule_reload") as reload:
        # The list says so (once a minute); then the nozzle is cool.
        await _tick(hass, freezer, 61)
        _printer(bambuddy_api, state="FINISH", nozzle=30.0)
        await _tick(hass, freezer)

    assert reload.called
    assert not _switched_off(bambuddy_api)


def _attribute(hass: HomeAssistant, entry_id: str, name: str) -> Any:
    state = hass.states.get(_entity_id(hass, entry_id, "switch", "auto_off"))
    assert state is not None
    return state.attributes[name]


async def test_a_finish_after_a_reconnect_does_not_arm(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """The print ended while BamBuddy did not see the printer: not before
    our eyes -- the printer stays on (the design's rule)."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, connected=False)
    await _tick(hass, freezer)

    _printer(bambuddy_api, state="FINISH", connected=True, nozzle=30.0)
    await _tick(hass, freezer)
    await _tick(hass, freezer)

    assert (_switched_off(bambuddy_api), _phase(hass, entry.entry_id)) == (False, "idle")


async def test_a_printer_home_assistant_cannot_read_never_switches_off(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its last values stay while its reads fail; the plug's reads go on."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)
    bambuddy_api.get_status.side_effect = BamBuddyConnectionError("GET /printers/1/status: TimeoutError")
    _printer(bambuddy_api, nozzle=30.0)
    await _tick(hass, freezer)
    await _tick(hass, freezer)

    assert not _switched_off(bambuddy_api)
    assert _attribute(hass, entry.entry_id, "waiting_for") == "printer"


async def test_a_print_started_just_before_the_switch_off_stops_it(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """It reads the printer once more right before it switches."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)
    _printer(bambuddy_api, nozzle=30.0)
    started = {**bambuddy_api.statuses[X1C], "state": "PREPARE"}
    reads = 0
    real = bambuddy_api.get_status.side_effect

    async def status(printer_id: int) -> dict[str, Any]:
        nonlocal reads
        reads += 1
        # The poll still sees it standing; the read right before the off a new job.
        return dict(started) if reads > 1 else dict(real(printer_id))

    bambuddy_api.get_status.side_effect = status
    await _tick(hass, freezer)

    assert not _switched_off(bambuddy_api)


async def test_a_set_target_waits(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """Someone heats the nozzle -- to unload, say: not now."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=30.0, nozzle_target=200.0)
    await _tick(hass, freezer)

    assert not _switched_off(bambuddy_api)
    assert _attribute(hass, entry.entry_id, "waiting_for") == "heating"


async def test_it_says_what_it_waits_for(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)
    assert _attribute(hass, entry.entry_id, "waiting_for") == "nozzle"

    bambuddy_api.statuses[X1C]["ams"][0]["dry_time"] = 60
    _printer(bambuddy_api, nozzle=30.0)
    await _tick(hass, freezer)
    assert _attribute(hass, entry.entry_id, "waiting_for") == "drying"


async def test_a_failed_print_uses_up_only_the_next_print(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Days later, after another print, it must not go off unasked."""
    entry = await set_up(hass, X1C)
    await hass.services.async_call(
        "switch", "turn_off", {"entity_id": _entity_id(hass, entry.entry_id, "switch", "auto_off_every_print")}, blocking=True
    )
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FAILED", nozzle=30.0)
    await _tick(hass, freezer)

    assert state_at(hass, _entity_id(hass, entry.entry_id, "switch", "auto_off")).state == "off"


async def test_not_this_time_is_too_late_once_it_switches(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """While the switch-off is on its way, its button cannot be pressed."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)
    release = asyncio.Event()

    async def slow(plug_id: int, on: bool) -> None:
        await release.wait()

    bambuddy_api.control_plug.side_effect = slow
    _printer(bambuddy_api, nozzle=30.0)
    # A read now, not in a background task: the switch-off's own one waits.
    await entry.runtime_data.printers[X1C].async_refresh()
    await hass.async_block_till_done()
    skip = hass.states.get(_entity_id(hass, entry.entry_id, "button", "auto_off_skip"))
    assert skip is not None and skip.state == "unavailable"

    release.set()
    await hass.async_block_till_done(wait_background_tasks=True)
    assert _phase(hass, entry.entry_id) == "done"


async def test_a_switch_off_the_key_may_not_send_gives_up(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Tried again, given up after ten minutes; the key's guard checks the
    key (it has every scope here: no reauthentication)."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    checked = bambuddy_api.get_auth_me.await_count
    bambuddy_api.control_plug.side_effect = BamBuddyPermissionError(403, "API key does not have 'can_control_printer' permission")
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)
    await _tick(hass, freezer, 6)
    assert bambuddy_api.get_auth_me.await_count > checked
    await _tick(hass, freezer, 11 * 60)

    assert _phase(hass, entry.entry_id) == "gave_up"
    assert not hass.config_entries.flow.async_progress_by_handler(DOMAIN)


async def test_its_settings_stay_available_while_bambuddy_is_away(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """They are Home Assistant's own: an unavailable one would be saved
    without them."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    bambuddy_api.get_smart_plugs.side_effect = BamBuddyConnectionError("GET /smart-plugs/: ClientConnectorError")
    await _tick(hass, freezer, 61)

    for domain, key in (("switch", "auto_off"), ("switch", "auto_off_every_print"), ("number", "auto_off_temperature")):
        assert state_at(hass, _entity_id(hass, entry.entry_id, domain, key)).state != "unavailable", key



async def test_a_chamber_target_waits(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """The next job's chamber preheat after a print: someone heats the printer."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=30.0, chamber_target=60.0)
    await _tick(hass, freezer)

    assert not _switched_off(bambuddy_api)
    assert _attribute(hass, entry.entry_id, "waiting_for") == "heating"


async def test_a_switch_off_the_plug_did_not_take_says_plug_until_it_ends(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """From the first try on, the wait says "plug" -- never the nozzle again,
    between two tries or after a failed one."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    entity_id = _entity_id(hass, entry.entry_id, "switch", "auto_off")
    seen: list[dict[str, Any]] = []

    @callback
    def record(event: Event) -> None:
        if event.data["entity_id"] == entity_id and event.data["new_state"] is not None:
            seen.append(dict(event.data["new_state"].attributes))

    hass.bus.async_listen("state_changed", record)
    bambuddy_api.control_plug.side_effect = BamBuddyApiError(503, "Failed to communicate with device")
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    for _ in range(4):
        await _tick(hass, freezer)

    tried = next(index for index, attributes in enumerate(seen) if attributes.get("switching"))
    after = [attributes for attributes in seen[tried:] if attributes["phase"] == "waiting" and not attributes["switching"]]
    assert after
    assert all(attributes["waiting_for"] == "plug" for attributes in after), after


async def test_a_job_that_goes_idle_is_over(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """IDLE after a job ends it, and not as a FINISH: the printer stays on."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="RUNNING", nozzle=220.0)
    await _tick(hass, freezer)
    _printer(bambuddy_api, state="IDLE", nozzle=30.0)
    await _tick(hass, freezer)

    assert _phase(hass, entry.entry_id) == "failed_print"
    assert not _switched_off(bambuddy_api)


async def test_done_lasts_until_the_plug_is_on_again(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """Switched off after the print, it says so until the plug is on again
    (the card says when it was switched off). A read right after the
    switch-off that still says on is no new start."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)
    assert _phase(hass, entry.entry_id) == "done"
    # BamBuddy still says on a moment after the switch-off.
    await _tick(hass, freezer)
    assert _phase(hass, entry.entry_id) == "done"

    bambuddy_api.plug_statuses[str(PLUG)]["state"] = "OFF"
    await _tick(hass, freezer)
    await _tick(hass, freezer, 3600)
    assert _phase(hass, entry.entry_id) == "done"

    # The next morning: switched on again.
    bambuddy_api.plug_statuses[str(PLUG)]["state"] = "ON"
    await _tick(hass, freezer)
    assert _phase(hass, entry.entry_id) == "idle"


async def test_a_failed_read_before_the_switch_off_is_not_the_plug(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The printer read right before the switch-off fails: the plug was never
    asked, so the wait never says "plug" -- the next check decides, and
    switches off."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=60.0)
    await _tick(hass, freezer)
    entity_id = _entity_id(hass, entry.entry_id, "switch", "auto_off")
    said: list[Any] = []

    @callback
    def record(event: Event) -> None:
        if event.data["entity_id"] == entity_id and event.data["new_state"] is not None:
            said.append(event.data["new_state"].attributes.get("waiting_for"))

    hass.bus.async_listen("state_changed", record)
    reads = bambuddy_api.get_status.side_effect
    auto_off = entry.runtime_data.auto_offs[PLUG]
    failed = []

    def the_switch_offs_read_fails(printer_id: int) -> dict[str, Any]:
        if auto_off.switching and not failed:
            failed.append(printer_id)
            raise BamBuddyConnectionError("GET /printers/1/status: ConnectionTimeoutError")
        return reads(printer_id)  # type: ignore[no-any-return]

    bambuddy_api.get_status.side_effect = the_switch_offs_read_fails
    _printer(bambuddy_api, nozzle=30.0)
    await _tick(hass, freezer)
    await _tick(hass, freezer)

    assert failed
    assert "plug" not in said, said
    assert _switched_off(bambuddy_api)
    assert _phase(hass, entry.entry_id) == "done"


async def test_a_restart_keeps_done_while_the_plug_is_off(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """Switched off in the evening, Home Assistant restarted at night: still
    done, from the same time, until the plug is on again."""
    entity_id = _switch_off_entity_id("switch", "auto_off")
    since = (dt_util.utcnow() - timedelta(hours=8)).isoformat()
    mock_restore_cache(hass, [State(entity_id, "off", {"phase": "done", "since": since})])
    bambuddy_api.plug_statuses[str(PLUG)]["state"] = "OFF"
    _printer(bambuddy_api, state="FINISH", connected=False, nozzle=25.0)
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    await _tick(hass, freezer)
    await _tick(hass, freezer, 120)
    state = hass.states.get(entity_id)
    assert state is not None
    assert (state.attributes["phase"], state.attributes["since"]) == ("done", since)

    bambuddy_api.plug_statuses[str(PLUG)]["state"] = "ON"
    await _tick(hass, freezer)
    assert _phase(hass, entry.entry_id) == "idle"


async def test_a_failed_print_stays_while_the_plug_is_on(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """Only done ends when the plug is on: a failed print, which leaves the
    printer on, keeps saying so."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="RUNNING", nozzle=220.0)
    await _tick(hass, freezer)
    _printer(bambuddy_api, state="FAILED", nozzle=30.0)
    await _tick(hass, freezer)
    await _tick(hass, freezer, 120)
    await _tick(hass, freezer)
    assert _phase(hass, entry.entry_id) == "failed_print"


async def test_a_plug_without_a_state_keeps_done(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """Only a plug read on ends done: one that reports no state does not."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)
    assert _phase(hass, entry.entry_id) == "done"
    bambuddy_api.plug_statuses[str(PLUG)]["state"] = None
    await _tick(hass, freezer, 120)
    await _tick(hass, freezer)
    assert _phase(hass, entry.entry_id) == "done"


async def test_a_plug_moved_while_waiting_does_not_switch_its_new_printer_off(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Linked to another printer in BamBuddy while its switch-off waits: the
    entry reloads, and the wait -- the last printer's -- does not go over to
    the new one. The switch-off belongs to the printer: the new printer's
    is its own, off until armed there."""
    entry = await set_up(hass, X1C, P1S)
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=120.0)
    await _tick(hass, freezer)
    assert _phase(hass, entry.entry_id) == "waiting"

    bambuddy_api.get_smart_plugs.return_value = _plugs(**{str(PLUG): {"printer_id": P1S}})
    _printer(bambuddy_api, nozzle=30.0)
    _printer(bambuddy_api, P1S, state="IDLE", nozzle=26.0)
    await _tick(hass, freezer, 61)
    await hass.async_block_till_done()
    for _ in range(3):
        await _tick(hass, freezer)

    assert not _switched_off(bambuddy_api)
    assert _phase(hass, entry.entry_id) == "idle"
    assert state_at(hass, _entity_id(hass, entry.entry_id, "switch", "auto_off")).state == "off"


async def test_a_wait_restored_for_another_printer_starts_over(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The plug was moved in BamBuddy while Home Assistant was off: the
    stored phase belongs to the last printer."""
    entity_id = _switch_off_entity_id("switch", "auto_off")
    since = (dt_util.utcnow() - timedelta(minutes=20)).isoformat()
    mock_restore_cache_with_extra_data(
        hass, [(State(entity_id, "on", {"phase": "waiting", "since": since}), {"printer": "a printer of before"})]
    )
    _printer(bambuddy_api, state="FINISH", nozzle=26.0)
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    await _tick(hass, freezer)

    assert not _switched_off(bambuddy_api)
    assert _phase(hass, entry.entry_id) == "idle"


# Our switch-off's entities: (domain, key).
SWITCH_OFF = (("switch", "auto_off"), ("switch", "auto_off_every_print"), ("number", "auto_off_temperature"), ("button", "auto_off_skip"))


def _second_plug(api: SimpleNamespace, **changes: Any) -> dict[str, Any]:
    """A second plug that powers the X1C: a Home Assistant plug, of which
    BamBuddy lets a printer have several (a Tasmota only one)."""
    template = next(plug for plug in load_fixture("smart_plugs.json") if plug["id"] == 5)
    api.plug_statuses["11"] = {"state": "ON", "reachable": True, "device_name": "Second", "energy": None}
    return {**template, "id": 11, "name": "Second", "printer_id": X1C, "ha_entity_id": "switch.second", "auto_off": False, **changes}


def _switch_off_of(hass: HomeAssistant, entry_id: str, plug_id: int) -> list[str | None]:
    """The printer's switch-off entities that sit on this plug's device."""
    registry = er.async_get(hass)
    device = find_device(hass, entry_id, plug_identifier_of(hass, entry_id, plug_id))
    found: list[str | None] = []
    for domain, key in SWITCH_OFF:
        entity_id = registry.async_get_entity_id(domain, DOMAIN, _unique_id(hass, entry_id, key, plug_id))
        entity = registry.async_get(entity_id) if entity_id else None
        found.append(entity_id if entity is not None and device is not None and entity.device_id == device.id else None)
    return found


async def test_only_the_printers_own_plug_switches_it_off_after_the_print(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Of two plugs that power the printer, only BamBuddy's pick -- here the
    Tasmota, which reports power -- gets the switch-off: two would switch
    the printer off twice."""
    bambuddy_api.get_smart_plugs.return_value = [*_plugs(), _second_plug(bambuddy_api)]
    entry = await set_up(hass, X1C)

    assert None not in _switch_off_of(hass, entry.entry_id, PLUG)
    assert _switch_off_of(hass, entry.entry_id, 11) == [None] * 4
    # Its own switch stays.
    assert er.async_get(hass).async_get_entity_id("switch", DOMAIN, plug_unique_id(hass, entry.entry_id, 11, "power")) is not None


async def test_the_switch_off_follows_bambuddys_pick_of_the_printers_plug(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The Tasmota disabled in BamBuddy: the other plug is the printer's
    own now. The entry reloads; the switch-off goes over, and the old
    plug's entities leave rather than stay as entities no longer provided."""
    second = _second_plug(bambuddy_api, ha_power_entity="sensor.second_power")
    bambuddy_api.get_smart_plugs.return_value = [*_plugs(), second]
    entry = await set_up(hass, X1C)
    assert _switch_off_of(hass, entry.entry_id, 11) == [None] * 4

    bambuddy_api.get_smart_plugs.return_value = [*_plugs(**{str(PLUG): {"enabled": False}}), second]
    await _tick(hass, freezer, 61)
    await hass.async_block_till_done()

    assert None not in _switch_off_of(hass, entry.entry_id, 11)
    assert _switch_off_of(hass, entry.entry_id, PLUG) == [None] * 4



# --- The switch-off belongs to its printer ----------------------------------------


async def _set_threshold(hass: HomeAssistant, entry_id: str, value: float, plug_id: int = PLUG) -> None:
    await hass.services.async_call(
        "number", "set_value", {"entity_id": _entity_id(hass, entry_id, "number", "auto_off_temperature", plug_id), "value": value}, blocking=True
    )


def _settings(hass: HomeAssistant, entry_id: str, plug_id: int) -> tuple[str, str, str]:
    """Armed, after every print, threshold: as the printer's switch-off shows them."""
    return (
        state_at(hass, _entity_id(hass, entry_id, "switch", "auto_off", plug_id)).state,
        state_at(hass, _entity_id(hass, entry_id, "switch", "auto_off_every_print", plug_id)).state,
        state_at(hass, _entity_id(hass, entry_id, "number", "auto_off_temperature", plug_id)).state,
    )


async def _reload(hass: HomeAssistant, entry_id: str) -> None:
    assert await hass.config_entries.async_reload(entry_id)
    await hass.async_block_till_done()


async def test_a_swap_leaves_each_printer_its_settings(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The two printers' Tasmotas swapped in BamBuddy: each printer keeps
    its own settings -- printer 2 is not armed to cut its power because
    printer 1 was."""
    entry = await set_up(hass, X1C, A1_MINI)
    await _arm(hass, entry.entry_id)
    await _every_print(hass, entry.entry_id)
    await _set_threshold(hass, entry.entry_id, 40)
    plugs = load_fixture("smart_plugs.json")
    three, eight = (next(plug["ip_address"] for plug in plugs if plug["id"] == number) for number in (3, 8))
    bambuddy_api.get_smart_plugs.return_value = _plugs(**{"3": {"ip_address": eight}, "8": {"ip_address": three}})

    await _reload(hass, entry.entry_id)

    assert _settings(hass, entry.entry_id, PLUG) == ("on", "on", "40.0")
    assert _settings(hass, entry.entry_id, 8) == ("off", "off", "50.0")


async def test_another_own_plug_takes_the_switch_off_along(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Another plug became the printer's own in BamBuddy: the switch-off
    goes onto its device with its IDs and settings."""
    second = _second_plug(bambuddy_api, ha_power_entity="sensor.second_power")
    bambuddy_api.get_smart_plugs.return_value = [*_plugs(), second]
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    await _set_threshold(hass, entry.entry_id, 40)
    before = _entity_id(hass, entry.entry_id, "switch", "auto_off")

    bambuddy_api.get_smart_plugs.return_value = [*_plugs(**{str(PLUG): {"enabled": False}}), second]
    await _tick(hass, freezer, 61)
    await hass.async_block_till_done()

    assert _entity_id(hass, entry.entry_id, "switch", "auto_off", 11) == before
    assert None not in _switch_off_of(hass, entry.entry_id, 11)
    assert _settings(hass, entry.entry_id, 11)[::2] == ("on", "40.0")


@pytest.mark.parametrize("change", [{"printer_id": None}, {"controls_printer_power": False}])
async def test_a_printer_without_an_own_plug_loses_its_switch_off(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, change: dict[str, Any]
) -> None:
    """Its Tasmota unlinked in BamBuddy, or now an accessory that powers
    nothing: no plug powers the printer, its switch-off's four entities go
    -- also from a plug device that stays."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_smart_plugs.return_value = _plugs(**{str(PLUG): change})

    await _reload(hass, entry.entry_id)

    registry = er.async_get(hass)
    assert [
        registry.async_get_entity_id(domain, DOMAIN, f"{entry.entry_id}_switchoff_{printer_key(X1C)}_{key}") for domain, key in SWITCH_OFF
    ] == [None] * 4
