"""Switch off after the print: ours, in Home Assistant -- BamBuddy's own
auto off cannot be changed with an API key. The scenarios of the design:
it switches the printer's plug off only after a print that finished,
once the printer stands still and every nozzle is cool, and never on a
paused print, on stale values, or beside BamBuddy's own auto off."""
from __future__ import annotations

import asyncio
from datetime import timedelta
from types import SimpleNamespace
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant, State
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed, mock_restore_cache
import pytest

from custom_components.bambuddy.api import BamBuddyApiError, BamBuddyConnectionError, BamBuddyPermissionError
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import H2D, P1S, X1C, load_fixture, make_entry, set_up, setup_integration

# The X1C's plug: Tasmota, powers the printer, BamBuddy's own auto off off.
PLUG = 3


def _plugs(**changes: dict[str, Any]) -> list[dict[str, Any]]:
    """BamBuddy's plug list, some plugs changed (by number as text)."""
    return [{**plug, **changes.get(str(plug["id"]), {})} for plug in load_fixture("smart_plugs.json")]


@pytest.fixture(autouse=True)
def with_plugs(bambuddy_api: SimpleNamespace) -> None:
    bambuddy_api.get_smart_plugs.return_value = _plugs()


def _entity_id(hass: HomeAssistant, entry_id: str, domain: str, key: str, plug_id: int = PLUG) -> str:
    entity_id = er.async_get(hass).async_get_entity_id(domain, DOMAIN, f"{entry_id}_plug{plug_id}_{key}")
    assert entity_id is not None, key
    return entity_id


async def _tick(hass: HomeAssistant, freezer: FrozenDateTimeFactory, seconds: float = 16) -> None:
    freezer.tick(timedelta(seconds=seconds))
    async_fire_time_changed(hass)
    await hass.async_block_till_done(wait_background_tasks=True)


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
            status["temperatures"].update({key: 0.0 for key in ("nozzle_target", "nozzle_2_target", "bed_target") if key in status["temperatures"]})
    status["temperatures"].update(temperatures)


def _phase(hass: HomeAssistant, entry_id: str, plug_id: int = PLUG) -> Any:
    state = hass.states.get(_entity_id(hass, entry_id, "switch", "auto_off", plug_id))
    assert state is not None
    return state.attributes["phase"]


def _switched_off(api: SimpleNamespace, plug_id: int = PLUG) -> bool:
    return any(call.args == (plug_id, False) for call in api.control_plug.await_args_list)


async def test_the_entities_of_a_printers_plug(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Off by default; only after the next print, below 50 °C (his decisions)."""
    entry = await set_up(hass, X1C)

    armed = hass.states.get(_entity_id(hass, entry.entry_id, "switch", "auto_off"))
    every = hass.states.get(_entity_id(hass, entry.entry_id, "switch", "auto_off_every_print"))
    temperature = hass.states.get(_entity_id(hass, entry.entry_id, "number", "auto_off_temperature"))
    assert armed is not None and every is not None and temperature is not None
    assert (armed.state, armed.attributes["phase"], every.state, temperature.state) == ("off", "idle", "off", "50.0")
    assert (temperature.attributes["min"], temperature.attributes["max"], temperature.attributes["unit_of_measurement"]) == (30, 100, "°C")
    # Only the plug that powers the printer: not its accessory.
    assert er.async_get(hass).async_get_entity_id("switch", DOMAIN, f"{entry.entry_id}_plug4_auto_off") is None


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
    assert hass.states.get(_entity_id(hass, entry.entry_id, "switch", "power")).state == "off"  # type: ignore[union-attr]
    # Only after the next print (the default): used up.
    assert hass.states.get(_entity_id(hass, entry.entry_id, "switch", "auto_off")).state == "off"  # type: ignore[union-attr]


async def test_after_every_print_it_stays_armed(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    entry = await set_up(hass, X1C)
    await _every_print(hass, entry.entry_id)
    await _arm(hass, entry.entry_id)

    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)
    assert _switched_off(bambuddy_api)
    assert hass.states.get(_entity_id(hass, entry.entry_id, "switch", "auto_off")).state == "on"  # type: ignore[union-attr]


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
    entity_id = f"switch.bambuddy_smart_plug_{PLUG}_auto_off"
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
    """One-shot (BamBuddy's "einmalig"): it turns itself off afterwards."""
    entry = await set_up(hass, X1C)
    await hass.services.async_call(
        "switch", "turn_off", {"entity_id": _entity_id(hass, entry.entry_id, "switch", "auto_off_every_print")}, blocking=True
    )
    await _arm(hass, entry.entry_id)
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)

    assert _switched_off(bambuddy_api)
    assert hass.states.get(_entity_id(hass, entry.entry_id, "switch", "auto_off")).state == "off"  # type: ignore[union-attr]


async def test_not_this_time(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """While it waits: this print it stays on; after the next it goes off."""
    entry = await set_up(hass, X1C)
    await _every_print(hass, entry.entry_id)
    await _arm(hass, entry.entry_id)
    skip = _entity_id(hass, entry.entry_id, "button", "auto_off_skip")
    assert hass.states.get(skip).state == "unavailable"  # type: ignore[union-attr]
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
    mock_restore_cache(
        hass,
        [
            State(f"switch.bambuddy_smart_plug_{PLUG}_auto_off", "on", {"phase": "idle"}),
            State(f"switch.bambuddy_smart_plug_{PLUG}_auto_off_every_print", "off"),
            State(f"number.bambuddy_smart_plug_{PLUG}_auto_off_temperature", "42.0"),
        ],
    )
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    states = [
        hass.states.get(_entity_id(hass, entry.entry_id, domain, key)).state  # type: ignore[union-attr]
        for domain, key in (("switch", "auto_off"), ("switch", "auto_off_every_print"), ("number", "auto_off_temperature"))
    ]
    assert states == ["on", "off", "42.0"]


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

    assert hass.states.get(_entity_id(hass, entry.entry_id, "switch", "auto_off")).state == "off"  # type: ignore[union-attr]


async def test_a_wait_older_than_the_limit_is_over_after_a_restart(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entity_id = f"switch.bambuddy_smart_plug_{PLUG}_auto_off"
    since = (dt_util.utcnow() - timedelta(hours=3)).isoformat()
    mock_restore_cache(hass, [State(entity_id, "on", {"phase": "waiting", "since": since})])
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    assert _phase(hass, entry.entry_id) == "gave_up"
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

    assert hass.states.get(_entity_id(hass, entry.entry_id, "switch", "auto_off")).state == "off"  # type: ignore[union-attr]


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
    """Tried again, given up after ten minutes, no reauthentication."""
    entry = await set_up(hass, X1C)
    await _arm(hass, entry.entry_id)
    bambuddy_api.control_plug.side_effect = BamBuddyPermissionError(403, "API key does not have 'can_control_printer' permission")
    _printer(bambuddy_api, state="FINISH", nozzle=30.0)
    await _tick(hass, freezer)
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
        assert hass.states.get(_entity_id(hass, entry.entry_id, domain, key)).state != "unavailable", key  # type: ignore[union-attr]
