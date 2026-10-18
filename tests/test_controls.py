"""The controls: buttons, selects, target temperatures, fans and the chamber
light -- what each sends, and when a printer cannot take it."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.bambuddy.api import (
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyConnectionError,
    BamBuddyPermissionError,
)

from tests.conftest import (
    A1_MINI,
    H2D,
    P1S,
    X1C,
    entity_id,
    load_fixture,
    make_entry,
    next_refresh,
    no_entity,
    printer_uid,
    set_up,
    setup_integration,
    state_of,
)


async def _call(hass: HomeAssistant, domain: str, service: str, entity_id: str, **data: Any) -> None:
    await hass.services.async_call(domain, service, {"entity_id": entity_id, **data}, blocking=True)


@pytest.mark.parametrize(
    ("printer", "key", "method"),
    [
        (X1C, "pause", "pause"),
        (P1S, "resume", "resume"),
        (X1C, "stop", "stop"),
        (P1S, "stop", "stop"),
        (X1C, "clear_hms", "clear_hms"),
        (X1C, "refresh_status", "refresh_status"),
    ],
)
async def test_each_button_sends_its_command(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, printer: int, key: str, method: str
) -> None:
    entry = make_entry(hass, printer)
    await setup_integration(hass, entry)

    await _call(hass, "button", "press", entity_id(hass, "button", printer_uid(entry, key, printer)))

    getattr(bambuddy_api, method).assert_awaited_once_with(printer)


@pytest.mark.parametrize(
    ("printer", "key", "refusal"),
    [
        (A1_MINI, "pause", "not_printing"),
        # Paused already: it says so.
        (P1S, "pause", "already_paused"),
        (X1C, "resume", "not_paused"),
        (A1_MINI, "stop", "no_print"),
        (X1C, "clear_plate", "plate_not_waiting"),
    ],
)
async def test_a_button_at_the_wrong_time_says_why(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, printer: int, key: str, refusal: str
) -> None:
    """Pressed when it makes no sense, a button sends nothing and tells why;
    it stays available -- an unavailable Pause would look broken."""
    entry = make_entry(hass, printer)
    await setup_integration(hass, entry)
    entity = entity_id(hass, "button", printer_uid(entry, key, printer))

    with pytest.raises(ServiceValidationError) as raised:
        await _call(hass, "button", "press", entity)

    assert raised.value.translation_key == refusal
    # BamBuddy's name, short enough for a phone's toast.
    assert raised.value.translation_placeholders == {"printer": entry.options["printers"][0]["printer_name"].rsplit(" (", 1)[0]}
    for method in ("pause", "resume", "stop", "clear_plate"):
        getattr(bambuddy_api, method).assert_not_awaited()


async def test_resume_waits_for_a_filament_change(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Paused, the AMS loading new filament: resuming now would print on
    while it still feeds or purges."""
    entry = await set_up(hass, P1S)
    bambuddy_api.statuses[P1S]["ams_status_main"] = 1
    bambuddy_api.statuses[P1S]["ams_status_sub"] = 7
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _call(hass, "button", "press", entity_id(hass, "button", printer_uid(entry, "resume", P1S)))

    assert raised.value.translation_key == "filament_change"
    bambuddy_api.resume.assert_not_awaited()


async def test_the_plate_is_cleared_after_a_print(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C].update({"state": "FINISH", "awaiting_plate_clear": True})
    await next_refresh(hass, freezer)

    await _call(hass, "button", "press", entity_id(hass, "button", printer_uid(entry, "clear_plate")))

    bambuddy_api.clear_plate.assert_awaited_once_with(X1C)


async def test_a_command_reads_the_status_again_soon(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy answers as soon as it passed the command on: the result
    shows after the printer reported back, not ten seconds later."""
    entry = await set_up(hass, X1C)
    calls = bambuddy_api.get_status.await_count

    await _call(hass, "button", "press", entity_id(hass, "button", printer_uid(entry, "pause")))
    freezer.tick(2)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert bambuddy_api.get_status.await_count == calls + 1

    # A second command right after: read again too, not ten seconds later
    # (Home Assistant's refresh request waits that long after the last).
    bambuddy_api.statuses[X1C]["chamber_light"] = False
    await _call(hass, "light", "turn_off", entity_id(hass, "light", printer_uid(entry, "chamber_light")))
    freezer.tick(2)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert bambuddy_api.get_status.await_count == calls + 2
    assert state_of(hass, "light", printer_uid(entry, "chamber_light")).state == "off"


@pytest.mark.parametrize(
    ("failure", "key"),
    [
        (BamBuddyPermissionError(403, "API key does not have 'can_control_printer' permission"), "control_not_permitted"),
        (BamBuddyConnectionError("refused"), "cannot_connect"),
        (BamBuddyApiError(500, "Failed to pause print"), "command_failed"),
        (BamBuddyAuthError(401, "Authentication required"), "auth_failed"),
    ],
)
async def test_bambuddys_refusals(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, failure: Exception, key: str
) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.pause.side_effect = failure

    with pytest.raises(HomeAssistantError) as raised:
        await _call(hass, "button", "press", entity_id(hass, "button", printer_uid(entry, "pause")))

    assert raised.value.translation_key == key
    if key == "command_failed":
        assert raised.value.translation_placeholders == {"error": "Failed to pause print"}
    if key == "auth_failed":
        await hass.async_block_till_done()
        assert [flow["context"]["source"] for flow in hass.config_entries.flow.async_progress()] == ["reauth"]


async def test_nothing_reaches_an_offline_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its entities are unavailable: Home Assistant skips them."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C] = load_fixture("status_offline.json")
    await next_refresh(hass, freezer)

    await _call(hass, "light", "turn_on", entity_id(hass, "light", printer_uid(entry, "chamber_light")))
    await _call(hass, "button", "press", entity_id(hass, "button", printer_uid(entry, "pause")))

    bambuddy_api.set_chamber_light.assert_not_awaited()
    bambuddy_api.pause.assert_not_awaited()


async def test_the_print_speed(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    entity = entity_id(hass, "select", printer_uid(entry, "print_speed"))
    assert hass.states.get(entity).state == "standard"  # type: ignore[union-attr]

    await _call(hass, "select", "select_option", entity, option="sport")

    bambuddy_api.set_print_speed.assert_awaited_once_with(X1C, 3)


async def test_the_print_speed_needs_a_print(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError):
        await _call(hass, "select", "select_option", entity_id(hass, "select", printer_uid(entry, "print_speed", A1_MINI)), option="silent")


async def test_the_airduct_mode(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Only printers that have one; not during a print or a filament change
    -- the print sets it at its start, as Bambu Studio says."""
    entry = await set_up(hass, H2D, X1C)
    entity = entity_id(hass, "select", printer_uid(entry, "airduct_mode", H2D))
    assert hass.states.get(entity).state == "heating"  # type: ignore[union-attr]
    assert no_entity(hass, "select", printer_uid(entry, "airduct_mode"))

    with pytest.raises(ServiceValidationError) as raised:
        await _call(hass, "select", "select_option", entity, option="cooling")
    assert raised.value.translation_key == "job_running"

    bambuddy_api.statuses[H2D].update({"state": "IDLE", "ams_status_main": 1, "ams_status_sub": 2})
    await next_refresh(hass, freezer)
    with pytest.raises(ServiceValidationError) as raised:
        await _call(hass, "select", "select_option", entity, option="cooling")
    assert raised.value.translation_key == "filament_change"
    bambuddy_api.set_airduct_mode.assert_not_awaited()

    bambuddy_api.statuses[H2D].update({"ams_status_main": 0, "ams_status_sub": 0})
    await next_refresh(hass, freezer)
    await _call(hass, "select", "select_option", entity, option="cooling")

    bambuddy_api.set_airduct_mode.assert_awaited_once_with(H2D, "cooling")


@pytest.mark.parametrize(
    ("printer", "key", "value", "method", "args"),
    [
        (X1C, "nozzle_target", 215, "set_nozzle_temperature", (X1C, 215, 0)),
        # Two nozzles: BamBuddy's nozzle 1 is the left one, 0 the right one.
        (H2D, "nozzle_target", 215, "set_nozzle_temperature", (H2D, 215, 1)),
        (H2D, "nozzle_2_target", 215, "set_nozzle_temperature", (H2D, 215, 0)),
        (X1C, "bed_target", 60, "set_bed_temperature", (X1C, 60)),
        (H2D, "chamber_target", 45, "set_chamber_temperature", (H2D, 45)),
    ],
)
async def test_the_target_temperatures(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    printer: int,
    key: str,
    value: int,
    method: str,
    args: tuple[int, ...],
) -> None:
    entry = make_entry(hass, printer)
    await setup_integration(hass, entry)
    entity = entity_id(hass, "number", printer_uid(entry, key, printer))

    await _call(hass, "number", "set_value", entity, value=value)

    getattr(bambuddy_api, method).assert_awaited_once_with(*args)


async def test_the_targets_show_bambuddys_values(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, H2D)
    temperatures = bambuddy_api.statuses[H2D]["temperatures"]

    left = state_of(hass, "number", printer_uid(entry, "nozzle_target", H2D))
    assert float(left.state) == temperatures["nozzle_target"]
    assert left.attributes["friendly_name"].endswith("Left nozzle target temperature")
    assert float(state_of(hass, "number", printer_uid(entry, "chamber_target", H2D)).state) == temperatures["chamber_target"]


async def test_only_a_chamber_heater_gets_a_chamber_target(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The X1C has a chamber sensor but no heater."""
    entry = await set_up(hass, X1C)

    assert no_entity(hass, "number", printer_uid(entry, "chamber_target"))


@pytest.mark.parametrize(
    ("service", "data", "speed"),
    [
        ("set_percentage", {"percentage": 40}, 40),
        ("turn_on", {}, 100),
        ("turn_on", {"percentage": 20}, 20),
        ("turn_off", {}, 0),
    ],
)
async def test_the_fans(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, service: str, data: dict[str, Any], speed: int
) -> None:
    entry = await set_up(hass, X1C)

    await _call(hass, "fan", service, entity_id(hass, "fan", printer_uid(entry, "aux_fan")), **data)

    bambuddy_api.set_fan_speed.assert_awaited_once_with(X1C, "aux", speed)


async def test_the_fans_show_bambuddys_speeds(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    status = bambuddy_api.statuses[X1C]

    for key, field in (("part_cooling_fan", "cooling_fan_speed"), ("aux_fan", "big_fan1_speed"), ("chamber_fan", "big_fan2_speed")):
        state = state_of(hass, "fan", printer_uid(entry, key))
        assert (state.state, state.attributes["percentage"]) == ("on" if status[field] else "off", status[field]), key


async def test_an_a1_mini_has_only_the_part_cooling_fan(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    fans = {e.unique_id for e in er.async_entries_for_config_entry(er.async_get(hass), entry.entry_id) if e.domain == "fan"}
    assert fans == {printer_uid(entry, "part_cooling_fan", A1_MINI)}


async def test_an_h2d_has_an_exhaust_fan_name_only_where_bambu_uses_it(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    entry = await set_up(hass, H2D)

    assert state_of(hass, "fan", printer_uid(entry, "chamber_fan", H2D)).attributes["friendly_name"].endswith("Chamber fan")


@pytest.mark.parametrize(("service", "on"), [("turn_on", True), ("turn_off", False)])
async def test_the_chamber_light(hass: HomeAssistant, bambuddy_api: SimpleNamespace, service: str, on: bool) -> None:
    entry = await set_up(hass, X1C)
    entity = entity_id(hass, "light", printer_uid(entry, "chamber_light"))
    assert hass.states.get(entity).state == "on"  # type: ignore[union-attr]

    await _call(hass, "light", service, entity)

    bambuddy_api.set_chamber_light.assert_awaited_once_with(X1C, on)


async def test_the_plate_can_be_cleared_with_the_printer_off(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A finished print, the printer switched off, BamBuddy's queue waiting:
    BamBuddy takes the plate as cleared without the printer (it sends it
    nothing), so Home Assistant offers it too."""
    entry = await set_up(hass, X1C)
    offline = load_fixture("status_offline.json")
    offline.update({"state": "FINISH", "awaiting_plate_clear": True})
    bambuddy_api.statuses[X1C] = offline
    await next_refresh(hass, freezer)

    assert state_of(hass, "binary_sensor", printer_uid(entry, "awaiting_plate_clear")).state == "on"
    await _call(hass, "button", "press", entity_id(hass, "button", printer_uid(entry, "clear_plate")))

    bambuddy_api.clear_plate.assert_awaited_once_with(X1C)


async def test_the_active_nozzle(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Two-nozzle printers: BamBuddy's extruder 0 is the right nozzle, 1 the
    left one. Not while a print runs: the job decides then."""
    entry = await set_up(hass, H2D, X1C)
    entity = entity_id(hass, "select", printer_uid(entry, "active_nozzle", H2D))
    assert hass.states.get(entity).state == "left"  # type: ignore[union-attr]
    assert no_entity(hass, "select", printer_uid(entry, "active_nozzle"))

    with pytest.raises(ServiceValidationError) as raised:
        await _call(hass, "select", "select_option", entity, option="right")
    assert raised.value.translation_key == "job_running"

    bambuddy_api.statuses[H2D]["state"] = "IDLE"
    await next_refresh(hass, freezer)
    await _call(hass, "select", "select_option", entity, option="right")

    bambuddy_api.select_extruder.assert_awaited_once_with(H2D, 0)


@pytest.mark.parametrize(("service", "enabled"), [("turn_on", True), ("turn_off", False)])
async def test_the_ams_filament_backup(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, service: str, enabled: bool
) -> None:
    """With it on, the printer switches to a slot with the same filament
    when one runs out."""
    entry = await set_up(hass, X1C)
    entity = entity_id(hass, "switch", printer_uid(entry, "ams_filament_backup"))
    assert hass.states.get(entity).state == "on"  # type: ignore[union-attr]

    await _call(hass, "switch", service, entity)

    bambuddy_api.set_ams_backup.assert_awaited_once_with(X1C, enabled)


async def test_the_filament_backup_unknown_to_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """With an AMS every printer has the setting; BamBuddy 1.2.5.7 cannot
    read it from the A1 and P1 series -- unknown then, and it still
    switches."""
    entry = await set_up(hass, A1_MINI)
    entity = entity_id(hass, "switch", printer_uid(entry, "ams_filament_backup", A1_MINI))
    state = hass.states.get(entity)
    assert state is not None
    assert (state.state, state.attributes.get("assumed_state")) == ("unknown", True)

    await _call(hass, "switch", "turn_on", entity)

    bambuddy_api.set_ams_backup.assert_awaited_once_with(A1_MINI, True)


async def test_the_filament_backup_comes_with_an_ams(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Without an AMS there is nothing to back up -- the external spool takes
    no part; a unit plugged in later brings the switch."""
    units = bambuddy_api.statuses[X1C]["ams"]
    bambuddy_api.statuses[X1C]["ams"] = []
    entry = await set_up(hass, X1C)
    assert no_entity(hass, "switch", printer_uid(entry, "ams_filament_backup"))

    bambuddy_api.statuses[X1C]["ams"] = units
    await next_refresh(hass, freezer)

    state = state_of(hass, "switch", printer_uid(entry, "ams_filament_backup"))
    assert (state.state, state.attributes.get("assumed_state")) == ("on", None)


async def test_no_nozzle_switch_during_a_filament_change(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, H2D)
    bambuddy_api.statuses[H2D].update({"state": "IDLE", "ams_status_main": 1, "ams_status_sub": 2})
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _call(hass, "select", "select_option", entity_id(hass, "select", printer_uid(entry, "active_nozzle", H2D)), option="right")

    assert raised.value.translation_key == "filament_change"
    bambuddy_api.select_extruder.assert_not_awaited()


async def test_the_ai_detection(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Only what the model has: BamBuddy reads a detector a printer lacks
    as on. Switchable during a print -- a false alarm is when it matters."""
    entry = await set_up(hass, X1C, P1S)
    for key in ("ai_monitoring", "first_layer_inspection", "build_plate_detection"):
        assert hass.states.get(entity_id(hass, "switch", printer_uid(entry, key))).state == "on"  # type: ignore[union-attr]
    for key in ("spaghetti_detection", "clumping_detection"):
        assert no_entity(hass, "switch", printer_uid(entry, key)), key
    for key in ("ai_monitoring", "build_plate_detection", "spaghetti_detection"):
        assert no_entity(hass, "switch", printer_uid(entry, key, P1S)), key

    await _call(hass, "switch", "turn_off", entity_id(hass, "switch", printer_uid(entry, "first_layer_inspection")))

    bambuddy_api.set_print_option.assert_awaited_once_with(X1C, "first_layer_inspector", False)


async def test_the_build_plate_detection_is_named_as_in_bambu_studio(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """The X1 and A series detect the plate's position only, the others its
    type and position: Bambu Studio names the two apart."""
    entry = await set_up(hass, X1C, H2D)
    registry = er.async_get(hass)

    x1c = registry.async_get(entity_id(hass, "switch", printer_uid(entry, "build_plate_detection")))
    h2d = registry.async_get(entity_id(hass, "switch", printer_uid(entry, "build_plate_detection", H2D)))

    assert x1c is not None and h2d is not None
    assert (x1c.translation_key, x1c.entity_id) == (
        "build_plate_position_detection",
        "switch.x1c_00m00a000000001_build_plate_position_detection",
    )
    assert (h2d.translation_key, h2d.entity_id) == ("build_plate_detection", "switch.h2d_0948ad000000004_build_plate_detection")


async def test_the_single_detectors_of_an_h2d(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, H2D)
    clumping = entity_id(hass, "switch", printer_uid(entry, "clumping_detection", H2D))
    bambuddy_api.statuses[H2D]["print_options"]["nozzle_clumping_detector"] = False
    await next_refresh(hass, freezer)
    assert hass.states.get(clumping).state == "off"  # type: ignore[union-attr]

    await _call(hass, "switch", "turn_on", clumping)

    bambuddy_api.set_print_option.assert_awaited_once_with(H2D, "clump_detector", True)
    assert no_entity(hass, "switch", printer_uid(entry, "ai_monitoring", H2D))
