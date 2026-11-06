"""The actions: moving the axes, homing, extruding, loading and unloading
filament, drying, answering HMS messages, skipping objects, the connection
check -- and when a printer must not take them."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
import voluptuous as vol
import yaml
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError

from custom_components.bambuddy.api import BamBuddyApiError, BamBuddyConnectionError
from custom_components.bambuddy.models import HMS_ANSWERS
from custom_components.bambuddy.services import SCHEMAS

from tests.conftest import (
    A1_MINI,
    H2D,
    INTEGRATION,
    P1S,
    X1C,
    ams_device,
    ams_uid,
    device_id,
    entity_id,
    load_fixture,
    next_refresh,
    printer_device_id,
    printer_key,
    printer_name,
    printer_uid,
    printers_but,
    set_up,
    state_of,
)
from tests.helpers import call_action, reload_entry, timed_out


def _ams(hass: HomeAssistant, entry: Any, printer_id: int, unit: int) -> str:
    return device_id(hass, entry, ams_device(entry, printer_id, unit))


@pytest.mark.parametrize(
    ("axis", "method", "args"),
    [
        ("x", "jog_xy", (A1_MINI, 10.0, 0.0)),
        ("y", "jog_xy", (A1_MINI, 0.0, 10.0)),
        ("z", "jog_z", (A1_MINI, 10.0)),
    ],
)
async def test_moving_an_axis(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, axis: str, method: str, args: tuple[Any, ...]
) -> None:
    entry = await set_up(hass, A1_MINI)

    await call_action(hass, "move_axis", device_id=printer_device_id(hass, entry, A1_MINI), axis=axis, distance=10)

    getattr(bambuddy_api, method).assert_awaited_once_with(*args)


@pytest.mark.parametrize("printer", [X1C, P1S])
async def test_nothing_moves_during_a_print(hass: HomeAssistant, bambuddy_api: SimpleNamespace, printer: int) -> None:
    """BamBuddy would put the move into the running (or paused) job."""
    entry = await set_up(hass, printer)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "move_axis", device_id=printer_device_id(hass, entry, printer), axis="x", distance=1)
    with pytest.raises(ServiceValidationError):
        await call_action(hass, "home_axes", device_id=printer_device_id(hass, entry, printer))

    assert raised.value.translation_key == "job_running"
    bambuddy_api.jog_xy.assert_not_awaited()
    bambuddy_api.home_axes.assert_not_awaited()


async def test_homing(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    await call_action(hass, "home_axes", device_id=printer_device_id(hass, entry, A1_MINI))

    bambuddy_api.home_axes.assert_awaited_once_with(A1_MINI)


async def test_a_too_long_move_is_refused(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(vol.Invalid):
        await call_action(hass, "move_axis", device_id=printer_device_id(hass, entry, A1_MINI), axis="z", distance=250)


async def test_extruding_needs_a_hot_nozzle(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, A1_MINI)
    device = printer_device_id(hass, entry, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "extrude", device_id=device, distance=10)
    assert raised.value.translation_key == "nozzle_too_cold"

    bambuddy_api.statuses[A1_MINI]["temperatures"]["nozzle"] = 220.0
    await next_refresh(hass, freezer)
    await call_action(hass, "extrude", device_id=device, distance=-5)

    bambuddy_api.jog_extruder.assert_awaited_once_with(A1_MINI, -5.0)


async def test_a_two_nozzle_printer_extrudes_with_the_active_nozzle(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy's `nozzle_2` is the right nozzle, extruder 0."""
    entry = await set_up(hass, H2D)
    status = bambuddy_api.statuses[H2D]
    status.update({"state": "IDLE", "active_extruder": 0})
    status["temperatures"].update({"nozzle": 30.0, "nozzle_2": 230.0})
    await next_refresh(hass, freezer)

    await call_action(hass, "extrude", device_id=printer_device_id(hass, entry, H2D), distance=10)

    bambuddy_api.jog_extruder.assert_awaited_once_with(H2D, 10.0)


async def test_loading_a_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The slot's sensor names the slot; BamBuddy's tray id goes along."""
    entry = await set_up(hass, A1_MINI)
    slot = entity_id(hass, "sensor", ams_uid(entry, 0, "slot_3", A1_MINI))

    await call_action(hass, "load_filament", entity_id=slot)

    bambuddy_api.load_filament.assert_awaited_once_with(A1_MINI, 2)


@pytest.mark.parametrize(("key", "refusal"), [("slot_4", "slot_empty")])
async def test_an_empty_slot_is_refused(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, key: str, refusal: str
) -> None:
    entry = await set_up(hass, A1_MINI)
    slot = entity_id(hass, "sensor", ams_uid(entry, 0, key, A1_MINI))

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "load_filament", entity_id=slot)

    assert raised.value.translation_key == refusal


async def test_an_ams_ht_cannot_load(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, H2D)
    bambuddy_api.statuses[H2D]["state"] = "IDLE"
    await next_refresh(hass, freezer)
    slot = entity_id(hass, "sensor", ams_uid(entry, 128, "slot_1", H2D))

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "load_filament", entity_id=slot)

    assert raised.value.translation_key == "ams_ht_load"


async def test_something_else_is_no_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)
    other = entity_id(hass, "sensor", printer_uid(entry, "progress", A1_MINI))

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "load_filament", entity_id=other)

    assert raised.value.translation_key == "not_a_slot"


async def test_unloading(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    await call_action(hass, "unload_filament", device_id=printer_device_id(hass, entry, A1_MINI))

    bambuddy_api.unload_filament.assert_awaited_once_with(A1_MINI)


async def test_drying(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, H2D)
    ams = _ams(hass, entry, H2D, 0)

    await call_action(hass, "start_drying", device_id=ams, temperature=55, duration=8)
    # The AMS HT dries.
    await call_action(hass, "stop_drying", device_id=_ams(hass, entry, H2D, 128))

    bambuddy_api.start_drying.assert_awaited_once_with(H2D, 0, 55, 8)
    bambuddy_api.stop_drying.assert_awaited_once_with(H2D, 128)


@pytest.mark.parametrize(("action", "minutes"), [("start_drying", 120), ("stop_drying", 0)])
async def test_drying_on_an_offline_printer_says_offline(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, action: str, minutes: int
) -> None:
    """Its drying figures are stale offline: the printer's state is the reason to name."""
    entry = await set_up(hass, H2D)
    bambuddy_api.statuses[H2D]["connected"] = False
    bambuddy_api.statuses[H2D]["ams"][1]["dry_time"] = minutes
    await next_refresh(hass, freezer)
    extra = {"temperature": 55, "duration": 8} if action == "start_drying" else {}

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, action, device_id=_ams(hass, entry, H2D, 128), **extra)

    assert raised.value.translation_key == "printer_offline"


async def test_a_parked_drying_countdown_may_be_stopped(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    bambuddy_api.statuses[H2D]["ams"][1]["dry_countdown_stalled"] = True
    entry = await set_up(hass, H2D)

    await call_action(hass, "stop_drying", device_id=_ams(hass, entry, H2D, 128))

    bambuddy_api.stop_drying.assert_awaited_once_with(H2D, 128)


async def test_a_unit_that_is_not_drying_is_said_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "stop_drying", device_id=_ams(hass, entry, H2D, 0))

    assert raised.value.translation_key == "not_drying"
    bambuddy_api.stop_drying.assert_not_awaited()


async def test_drying_only_where_and_as_hot_as_a_unit_can(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A first AMS has no heater; the AMS 2 Pro dries at 65 °C at most."""
    entry = await set_up(hass, X1C, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "start_drying", device_id=_ams(hass, entry, X1C, 0), temperature=55, duration=8)
    assert raised.value.translation_key == "cannot_dry"

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "start_drying", device_id=_ams(hass, entry, H2D, 0), temperature=80, duration=8)
    assert (raised.value.translation_key, raised.value.translation_placeholders) == (
        "drying_too_hot",
        {"model": "AMS 2 Pro", "maximum": "65"},
    )
    bambuddy_api.start_drying.assert_not_awaited()


@pytest.mark.parametrize("action", ["move_axis", "extrude"])
async def test_a_distance_of_0_is_refused_in_words(hass: HomeAssistant, bambuddy_api: SimpleNamespace, action: str) -> None:
    entry = await set_up(hass, A1_MINI)
    data = {"device_id": printer_device_id(hass, entry, A1_MINI), "distance": 0, **({"axis": "x"} if action == "move_axis" else {})}

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, action, **data)

    assert raised.value.translation_key == "zero_distance"


async def test_a_printer_is_no_ams(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "stop_drying", device_id=printer_device_id(hass, entry, H2D))

    assert raised.value.translation_key == "not_an_ams"


async def test_an_ams_is_no_printer(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "home_axes", device_id=_ams(hass, entry, A1_MINI, 0))

    assert raised.value.translation_key == "not_a_printer"


async def test_answering_an_hms_message(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """As on the printer's screen: an answer the printer offers for the
    message, sent with its full code and its job."""
    entry = await set_up(hass, P1S)
    sensor = state_of(hass, "sensor", printer_uid(entry, "hms_status", P1S))
    assert [error["actions"] for error in sensor.attributes["errors"]] == [["RESUME_PRINTING"], []]

    await call_action(hass, "answer_hms", device_id=printer_device_id(hass, entry, P1S), code="0700_2000_0002_0012", action="RESUME_PRINTING")

    bambuddy_api.execute_hms_action.assert_awaited_once_with(P1S, "0700200000020012", "RESUME_PRINTING", "498765432")


@pytest.mark.parametrize(
    ("code", "action", "key"),
    [
        ("0700_2000_0002_0099", "RESUME_PRINTING", "hms_not_current"),
        ("0700_2000_0002_0012", "STOP_PRINTING", "hms_answer_not_offered"),
        # A button of Bambu's own screen that sends nothing, though listed: said so.
        ("0700_2000_0002_0012", "CHECK_ASSISTANT", "hms_answer_screen_only"),
    ],
)
async def test_an_hms_answer_the_printer_does_not_offer_is_refused(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, code: str, action: str, key: str
) -> None:
    bambuddy_api.statuses[P1S]["hms_errors"][0]["actions"] = ["CHECK_ASSISTANT", "RESUME_PRINTING"]
    entry = await set_up(hass, P1S)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "answer_hms", device_id=printer_device_id(hass, entry, P1S), code=code, action=action)

    assert raised.value.translation_key == key
    bambuddy_api.execute_hms_action.assert_not_awaited()


async def test_only_answers_that_send_something_are_listed(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Bambu's catalogue also names buttons of its own screen (the
    assistant, the live view) that send the printer nothing."""
    status = load_fixture("status_p1s.json")
    status["hms_errors"][0]["actions"] = ["CHECK_ASSISTANT", "RESUME_PRINTING", "JUMP_TO_LIVEVIEW", "STOP_PRINTING"]
    bambuddy_api.statuses[P1S] = status
    entry = await set_up(hass, P1S)

    sensor = state_of(hass, "sensor", printer_uid(entry, "hms_status", P1S))
    assert sensor.attributes["errors"][0]["actions"] == ["RESUME_PRINTING", "STOP_PRINTING"]


async def test_an_hms_answer_the_printer_does_not_take_says_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy's 400 in words: the printer did not take it."""
    entry = await set_up(hass, P1S)
    bambuddy_api.execute_hms_action.side_effect = BamBuddyApiError(400, "Failed to execute HMS action")

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "answer_hms", device_id=printer_device_id(hass, entry, P1S), code="0700_2000_0002_0012", action="RESUME_PRINTING")

    assert raised.value.translation_key == "hms_answer_not_taken"


async def test_stopping_through_an_hms_answer_reads_the_printer_first(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A message cleared at the printer meanwhile stops nothing."""
    status = bambuddy_api.statuses[P1S]
    status["hms_errors"][0]["actions"] = ["RESUME_PRINTING", "STOP_PRINTING"]
    entry = await set_up(hass, P1S)
    status["hms_errors"] = []

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "answer_hms", device_id=printer_device_id(hass, entry, P1S), code="0700_2000_0002_0012", action="STOP_PRINTING")

    assert raised.value.translation_key == "hms_not_current"
    bambuddy_api.execute_hms_action.assert_not_awaited()


async def test_an_offline_printer_takes_no_action(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C] = load_fixture("status_offline.json")
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "unload_filament", device_id=printer_device_id(hass, entry, X1C))

    assert raised.value.translation_key == "printer_offline"


async def test_loading_on_an_offline_printer_says_offline(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its slot sensors are unavailable; the action still names the reason."""
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI]["connected"] = False
    await next_refresh(hass, freezer)
    slot = entity_id(hass, "sensor", ams_uid(entry, 0, "slot_1", A1_MINI))

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "load_filament", entity_id=slot)

    assert raised.value.translation_key == "printer_offline"


async def test_loading_the_external_spool(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI]["vt_tray"][0].update({"tray_type": "PLA", "exists": True})
    await next_refresh(hass, freezer)
    spool = entity_id(hass, "sensor", printer_uid(entry, "external_spool", A1_MINI))

    await call_action(hass, "load_filament", entity_id=spool)

    bambuddy_api.load_filament.assert_awaited_once_with(A1_MINI, 254)


@pytest.mark.parametrize(
    ("action", "fields", "field"),
    [
        ("mark_maintenance_done", {"device_id": "d"}, "task_id"),
        ("assign_spool", {"entity_id": "sensor.slot"}, "spool_id"),
        ("set_filament", {"entity_id": "sensor.slot"}, "k_profile"),
    ],
)
def test_a_number_field_takes_whole_numbers_only(action: str, fields: dict[str, Any], field: str) -> None:
    """A fraction would be cut off and name another spool, task or profile."""
    schema = SCHEMAS[action]
    assert schema({**fields, field: "2"})[field] == 2
    assert schema({**fields, field: 2.0})[field] == 2
    for wrong in (2.5, True, "2.5", "two", None, [2]):
        with pytest.raises(vol.Invalid):
            schema({**fields, field: wrong})


def test_the_objects_to_skip_are_whole_numbers() -> None:
    schema = SCHEMAS["skip_objects"]
    assert schema({"device_id": "d", "objects": ["87", 121.0]})["objects"] == [87, 121]
    with pytest.raises(vol.Invalid):
        schema({"device_id": "d", "objects": [2.5]})


def test_drying_takes_its_numbers_as_before() -> None:
    assert SCHEMAS["start_drying"]({"device_id": "d", "temperature": 55.5, "duration": "4"}) == {"device_id": "d", "temperature": 55, "duration": 4}


async def test_the_objects_of_the_running_print(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """For the dashboard card and for scripts: which objects there are, and
    which are skipped already."""
    entry = await set_up(hass, X1C)

    response = await call_action(hass, "get_print_objects", device_id=printer_device_id(hass, entry, X1C), response=True)

    assert response == {
        "objects": [
            {"id": 87, "name": "Bracket left", "skipped": False},
            {"id": 104, "name": "Bracket right", "skipped": True},
            {"id": 121, "name": "Spacer", "skipped": False},
        ]
    }


async def test_skipping_objects(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    await call_action(hass, "skip_objects", device_id=printer_device_id(hass, entry, X1C), objects=[87, 121])

    bambuddy_api.skip_objects.assert_awaited_once_with(X1C, [87, 121])


async def test_skipping_needs_a_print(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "skip_objects", device_id=printer_device_id(hass, entry, A1_MINI), objects=[87])
    with pytest.raises(ServiceValidationError):
        await call_action(hass, "get_print_objects", device_id=printer_device_id(hass, entry, A1_MINI), response=True)

    assert raised.value.translation_key == "not_printing"
    bambuddy_api.skip_objects.assert_not_awaited()


async def test_objects_bambuddy_cannot_read(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The job lies where BamBuddy cannot reach it."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_print_objects.side_effect = BamBuddyApiError(500, "Could not download 3MF file")

    with pytest.raises(HomeAssistantError) as raised:
        await call_action(hass, "get_print_objects", device_id=printer_device_id(hass, entry, X1C), response=True)

    # A read, not a command BamBuddy refused.
    assert raised.value.translation_key == "read_failed"


@pytest.mark.parametrize(
    ("action", "data"),
    [
        ("unload_filament", {}),
        ("move_axis", {"axis": "x", "distance": 1}),
        ("home_axes", {}),
        ("extrude", {"distance": 5}),
    ],
)
async def test_no_action_during_a_filament_change(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, action: str, data: dict[str, Any]
) -> None:
    """BamBuddy sends it anyway: it would collide with the change."""
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI].update({"ams_status_main": 1, "ams_status_sub": 3})
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, action, device_id=printer_device_id(hass, entry, A1_MINI), **data)

    assert raised.value.translation_key == "filament_change"


async def test_a_paused_print_can_change_filament(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A colour change by hand: pause, unload, load, resume. Moving stays
    locked: the print would shift."""
    entry = await set_up(hass, P1S)
    printer = printer_device_id(hass, entry, P1S)

    await call_action(hass, "unload_filament", device_id=printer)
    await call_action(hass, "load_filament", entity_id=entity_id(hass, "sensor", ams_uid(entry, 0, "slot_2", P1S)))
    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "home_axes", device_id=printer)

    bambuddy_api.unload_filament.assert_awaited_once_with(P1S)
    bambuddy_api.load_filament.assert_awaited_once_with(P1S, 1)
    assert raised.value.translation_key == "job_running"


async def test_a_running_print_keeps_its_filament(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "unload_filament", device_id=printer_device_id(hass, entry, X1C))

    assert raised.value.translation_key == "pause_first"
    bambuddy_api.unload_filament.assert_not_awaited()


async def test_a_slot_of_an_ams_plugged_in_elsewhere(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The slot follows its unit by its serial: plugged in as AMS B, it loads
    from there. (An AMS through the A1 mini's hub: BamBuddy reports no
    serial for an AMS Lite.)"""
    bambuddy_api.statuses[A1_MINI]["ams"][0].update({"serial_number": "00600A3B0000009", "module_type": "ams"})
    entry = await set_up(hass, A1_MINI)
    slot = entity_id(hass, "sensor", f"{entry.entry_id}_p{printer_key(A1_MINI)}_ams00600A3B0000009_slot_1")
    bambuddy_api.statuses[A1_MINI]["ams"][0]["id"] = 1
    await next_refresh(hass, freezer)

    await call_action(hass, "load_filament", entity_id=slot)

    bambuddy_api.load_filament.assert_awaited_once_with(A1_MINI, 4)


async def test_a_slot_of_an_unplugged_ams(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A unit the printer no longer reports is named so while the printer is
    online -- never the filament of another unit plugged in at its place;
    offline, the action says that first. (Units with serials: a unit known
    by its place that reports a serial is the same unit, and moves to it.)"""
    bambuddy_api.statuses[A1_MINI]["ams"][0].update({"serial_number": "00600A3B0000009", "module_type": "ams"})
    entry = await set_up(hass, A1_MINI)
    slot = entity_id(hass, "sensor", f"{entry.entry_id}_p{printer_key(A1_MINI)}_ams00600A3B0000009_slot_1")
    bambuddy_api.statuses[A1_MINI]["ams"][0]["serial_number"] = "00600A3B0000099"
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "load_filament", entity_id=slot)
    assert raised.value.translation_key == "ams_not_reported"

    bambuddy_api.statuses[A1_MINI]["connected"] = False
    await next_refresh(hass, freezer)
    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "load_filament", entity_id=slot)
    assert raised.value.translation_key == "printer_offline"


async def test_a_printer_bambuddy_does_not_list_now_points_to_its_repair(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """Its device waits under Repairs: an action on it, or on one of its AMS
    units, says so -- not that it is no printer."""
    entry = await set_up(hass, X1C, A1_MINI)
    printer = printer_device_id(hass, entry, A1_MINI)
    unit = _ams(hass, entry, A1_MINI, 0)
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    await reload_entry(hass, entry.entry_id)

    for service, device in (("home_axes", printer), ("stop_drying", unit)):
        with pytest.raises(ServiceValidationError) as raised:
            await call_action(hass, service, device_id=device)
        assert raised.value.translation_key == "printer_not_listed"
        assert raised.value.translation_placeholders == {"printer": printer_name(A1_MINI)}


async def test_an_unplugged_unit_is_named_as_such(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its device stays (settled); an action on it says the printer does not
    report it now -- not that it is a printer."""
    entry = await set_up(hass, X1C)
    unit = _ams(hass, entry, X1C, 0)
    bambuddy_api.statuses[X1C]["ams"] = []
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "stop_drying", device_id=unit)

    assert raised.value.translation_key == "ams_not_reported"
    assert raised.value.translation_placeholders == {"printer": "Workshop"}


async def test_a_slot_of_a_printer_bambuddy_does_not_list_now_points_to_its_repair(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    entry = await set_up(hass, X1C, A1_MINI)
    slot = entity_id(hass, "sensor", ams_uid(entry, 0, "slot_1", A1_MINI))
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    await reload_entry(hass, entry.entry_id)

    for action, data in (("load_filament", {}), ("set_filament", {"filament": "GFL99"})):
        with pytest.raises(ServiceValidationError) as raised:
            await call_action(hass, action, entity_id=slot, **data)
        assert raised.value.translation_key == "printer_not_listed"


async def test_a_read_that_times_out_is_no_command(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Nothing may still reach the printer: it was a read."""
    entry = await set_up(hass, X1C)
    timeout = timed_out("GET /printers/1/print/objects")
    bambuddy_api.get_print_objects.side_effect = timeout

    with pytest.raises(HomeAssistantError) as raised:
        await call_action(hass, "get_print_objects", device_id=printer_device_id(hass, entry, X1C), response=True)

    assert raised.value.translation_key == "update_timeout"


async def test_drying_started_on_the_screen_stops_there(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A P1S dries an AMS 2 Pro from its own screen only: Home Assistant
    shows it drying, and says where to stop it."""
    status = bambuddy_api.statuses[P1S]
    status["ams"][0]["module_type"] = "n3f"
    status["ams"][0]["dry_time"] = 120
    status["supports_drying"] = False
    status["drying_screen_only"] = True
    entry = await set_up(hass, P1S)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "stop_drying", device_id=_ams(hass, entry, P1S, 0))

    assert raised.value.translation_key == "dry_stop_on_screen"
    bambuddy_api.stop_drying.assert_not_awaited()


async def test_checking_the_connection(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """BamBuddy's verdict and checks as it gives them -- for an offline
    printer too: it reads, it sends nothing."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C] = load_fixture("status_offline.json")
    await next_refresh(hass, freezer)

    response = await call_action(hass, "run_diagnostic", device_id=printer_device_id(hass, entry, X1C), response=True)

    assert response is not None
    assert response["overall"] == "problems"
    assert response["checks"][0] == {"id": "port_mqtt", "status": "fail", "params": {}}
    assert response["checks"][2] == {"id": "port_rtsps", "status": "warn", "params": {"port": 322, "protocol": "RTSPS"}}
    assert len(response["checks"]) == 9  # type: ignore[arg-type]
    bambuddy_api.get_diagnostic.assert_awaited_once_with(X1C)


async def test_a_connection_check_bambuddy_cannot_run(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.get_diagnostic.side_effect = BamBuddyConnectionError("refused")

    with pytest.raises(HomeAssistantError) as raised:
        await call_action(hass, "run_diagnostic", device_id=printer_device_id(hass, entry, X1C), response=True)

    assert raised.value.translation_key == "cannot_connect"


async def test_a_connection_check_bambuddy_fails(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A check is no command: BamBuddy reported an error."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_diagnostic.side_effect = BamBuddyApiError(500, "Simulated failure")

    with pytest.raises(HomeAssistantError) as raised:
        await call_action(hass, "run_diagnostic", device_id=printer_device_id(hass, entry, X1C), response=True)

    assert (raised.value.translation_key, raised.value.translation_placeholders) == ("read_failed", {"error": "Simulated failure"})


async def test_a_unit_drying_already_is_said_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The H2D's AMS HT dries: another start would be BamBuddy's error; said before it is sent."""
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "start_drying", device_id=_ams(hass, entry, H2D, 128), temperature=55, duration=8)

    assert raised.value.translation_key == "already_drying"
    bambuddy_api.start_drying.assert_not_awaited()


async def test_no_drying_during_a_filament_change(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    bambuddy_api.statuses[H2D].update({"ams_status_main": 1, "ams_status_sub": 2})
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "start_drying", device_id=_ams(hass, entry, H2D, 0), temperature=55, duration=8)

    assert raised.value.translation_key == "filament_change"


async def test_bambuddys_own_refusal_is_no_error_of_home_assistant(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy refuses with a 4xx (here a 409 "AMS is busy"): a validation error -- no ERROR in the log,
    an automation can tell it from a failing BamBuddy."""
    bambuddy_api.start_drying.side_effect = BamBuddyApiError(409, "AMS is busy")
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "start_drying", device_id=_ams(hass, entry, H2D, 0), temperature=55, duration=8)

    assert raised.value.translation_key == "command_failed"


async def test_a_failing_bambuddy_stays_an_error(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A 5xx is BamBuddy failing, not refusing: an error, not a validation error."""
    bambuddy_api.start_drying.side_effect = BamBuddyApiError(500, "Internal Server Error")
    entry = await set_up(hass, H2D)

    with pytest.raises(HomeAssistantError) as raised:
        await call_action(hass, "start_drying", device_id=_ams(hass, entry, H2D, 0), temperature=55, duration=8)

    assert type(raised.value) is HomeAssistantError


async def test_a_parked_drying_timer_is_no_drying(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The AMS HT's countdown stands still (the drying sensor says off): a new drying may start."""
    bambuddy_api.statuses[H2D]["ams"][1]["dry_countdown_stalled"] = True
    entry = await set_up(hass, H2D)

    await call_action(hass, "start_drying", device_id=_ams(hass, entry, H2D, 128), temperature=55, duration=8)

    bambuddy_api.start_drying.assert_awaited_once()


async def test_a_parked_countdown_the_printer_still_counts_is_said_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Where the printer still counts a parked countdown as drying, BamBuddy refuses the start (409):
    said in the user's words, with the way out. A 409 for a unit without a parked countdown stays BamBuddy's."""
    bambuddy_api.statuses[H2D]["ams"][1]["dry_countdown_stalled"] = True
    bambuddy_api.start_drying.side_effect = BamBuddyApiError(409, "AMS is already drying")
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "start_drying", device_id=_ams(hass, entry, H2D, 128), temperature=55, duration=8)

    assert raised.value.translation_key == "drying_parked"


@pytest.mark.parametrize(
    "detail",
    [
        "Insufficient power: too many AMS drying or external PSU required",
        "Plug in the external AMS power adapter to start drying",
        "Filament is at the AMS outlet, retract it first",
    ],
)
async def test_a_parked_countdown_keeps_bambuddys_other_reasons(hass: HomeAssistant, bambuddy_api: SimpleNamespace, detail: str) -> None:
    """BamBuddy's 409 names the printer's reason (power and the filament at the outlet come first); only
    "AMS is already drying" is the parked countdown's -- the others say what to do."""
    bambuddy_api.statuses[H2D]["ams"][1]["dry_countdown_stalled"] = True
    bambuddy_api.start_drying.side_effect = BamBuddyApiError(409, detail)
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "start_drying", device_id=_ams(hass, entry, H2D, 128), temperature=55, duration=8)

    assert raised.value.translation_key == "command_failed"
    assert detail in str(raised.value.translation_placeholders)


@pytest.mark.parametrize(("running", "key"), [(True, "dry_while_printing"), (False, "command_failed")])
async def test_a_printer_that_cannot_dry_while_it_prints_is_said_so(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, running: bool, key: str
) -> None:
    """BamBuddy's "Printer is busy" (the printer's reason 0) during a job: the firmware cannot dry while it
    prints -- said in the user's words. The same refusal outside a job stays BamBuddy's own text."""
    bambuddy_api.statuses[H2D]["state"] = "RUNNING" if running else "IDLE"
    bambuddy_api.start_drying.side_effect = BamBuddyApiError(409, "Printer is busy")
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "start_drying", device_id=_ams(hass, entry, H2D, 0), temperature=55, duration=8)

    assert raised.value.translation_key == key


def test_the_answer_field_offers_the_answers() -> None:
    """The action field's choices are the answers the integration sends."""
    actions = yaml.safe_load((INTEGRATION / "services.yaml").read_text(encoding="utf-8"))
    select = actions["answer_hms"]["fields"]["action"]["selector"]["select"]
    assert (set(select["options"]), select["custom_value"]) == (set(HMS_ANSWERS), True)


async def test_a_load_through_the_filament_track_switch_is_refused(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """With the switch fitted every AMS is bound to a switch inlet: a load must name its nozzle, or the
    firmware drops it (BamBuddy's ams_load_filament). The external spools name their side."""
    bambuddy_api.statuses[H2D].update(
        {
            "state": "IDLE",
            "tray_now": 255,
            "extruder_slots": {},
            "ams_extruder_map": {},
            "fila_switch": {"installed": True, "in_slots": [-1, -1], "out_extruders": [0, 1], "stat": 0, "info": 0, "ready": True},
        }
    )
    for spool in bambuddy_api.statuses[H2D]["vt_tray"]:
        spool.update({"tray_type": "PETG", "tray_sub_brands": "", "exists": True})
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "load_filament", entity_id=entity_id(hass, "sensor", ams_uid(entry, 0, "slot_1", H2D)))
    assert raised.value.translation_key == "load_track_switch"
    bambuddy_api.load_filament.assert_not_awaited()

    await call_action(hass, "load_filament", entity_id=entity_id(hass, "sensor", printer_uid(entry, "external_spool", H2D)))
    bambuddy_api.load_filament.assert_awaited_once()


async def test_an_a1_mini_dries_on_its_own_screen(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The A1 and the A1 mini dry an AMS 2 Pro / AMS HT behind the AMS hub from their screen only:
    no update helps (Bambu's drying guide; BamBuddy files them as unsupported)."""
    bambuddy_api.statuses[A1_MINI]["ams"][0]["module_type"] = "n3f"
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "start_drying", device_id=_ams(hass, entry, A1_MINI, 0), temperature=55, duration=8)

    assert raised.value.translation_key == "dry_on_screen"


@pytest.mark.parametrize(("code", "action"), [("0700_2000_0002_0099", "RESUME_PRINTING"), ("0700_2000_0002_0012", "STOP_PRINTING")])
async def test_an_hms_answer_to_an_offline_printer_says_offline(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, code: str, action: str
) -> None:
    """Its messages are stale offline: the printer's state is the reason to name."""
    entry = await set_up(hass, P1S)
    bambuddy_api.statuses[P1S]["connected"] = False
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "answer_hms", device_id=printer_device_id(hass, entry, P1S), code=code, action=action)

    assert raised.value.translation_key == "printer_offline"


async def test_an_hms_answer_the_printer_did_not_acknowledge_is_said_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy's 502: the printer sent nothing back -- not BamBuddy refusing."""
    entry = await set_up(hass, P1S)
    bambuddy_api.execute_hms_action.side_effect = BamBuddyApiError(502, "Printer did not acknowledge HMS action within 2.5s")

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "answer_hms", device_id=printer_device_id(hass, entry, P1S), code="0700_2000_0002_0012", action="RESUME_PRINTING")

    assert raised.value.translation_key == "hms_answer_not_taken"


async def test_stopping_drying_on_a_unit_that_cannot_dry_says_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The X1C's first AMS has no heater: it cannot dry, so it cannot stop either."""
    entry = await set_up(hass, X1C)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "stop_drying", device_id=_ams(hass, entry, X1C, 0))

    assert raised.value.translation_key == "cannot_dry"
    bambuddy_api.stop_drying.assert_not_awaited()


async def test_an_hms_answer_bambuddy_fails_says_the_command_failed(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, P1S)
    bambuddy_api.execute_hms_action.side_effect = BamBuddyApiError(404, "Printer not found")

    with pytest.raises(HomeAssistantError) as raised:
        await call_action(hass, "answer_hms", device_id=printer_device_id(hass, entry, P1S), code="0700_2000_0002_0012", action="RESUME_PRINTING")

    assert raised.value.translation_key == "command_failed"
