"""The actions: moving the axes, homing, extruding, loading and unloading
filament, drying -- and when a printer must not take them."""
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
from custom_components.bambuddy.const import DOMAIN
from custom_components.bambuddy.models import HMS_ANSWERS

from tests.conftest import (
    A1_MINI,
    H2D,
    INTEGRATION,
    P1S,
    X1C,
    ams_device,
    ams_uid,
    as_model,
    device_id,
    entity_id,
    load_fixture,
    make_entry,
    next_refresh,
    printer_device,
    printer_key,
    printer_name,
    printer_uid,
    printers_but,
    set_up,
    setup_integration,
)


def _printer(hass: HomeAssistant, entry: Any, printer_id: int) -> str:
    return device_id(hass, entry, printer_device(entry, printer_id))


async def _act(hass: HomeAssistant, action: str, **data: Any) -> None:
    await hass.services.async_call(DOMAIN, action, data, blocking=True)


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

    await _act(hass, "move_axis", device_id=_printer(hass, entry, A1_MINI), axis=axis, distance=10)

    getattr(bambuddy_api, method).assert_awaited_once_with(*args)


@pytest.mark.parametrize("printer", [X1C, P1S])
async def test_nothing_moves_during_a_print(hass: HomeAssistant, bambuddy_api: SimpleNamespace, printer: int) -> None:
    """BamBuddy would put the move into the running (or paused) job."""
    entry = make_entry(hass, printer)
    await setup_integration(hass, entry)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "move_axis", device_id=_printer(hass, entry, printer), axis="x", distance=1)
    with pytest.raises(ServiceValidationError):
        await _act(hass, "home_axes", device_id=_printer(hass, entry, printer))

    assert raised.value.translation_key == "job_running"
    bambuddy_api.jog_xy.assert_not_awaited()
    bambuddy_api.home_axes.assert_not_awaited()


async def test_homing(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    await _act(hass, "home_axes", device_id=_printer(hass, entry, A1_MINI))

    bambuddy_api.home_axes.assert_awaited_once_with(A1_MINI)


async def test_a_too_long_move_is_refused(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(vol.Invalid):
        await _act(hass, "move_axis", device_id=_printer(hass, entry, A1_MINI), axis="z", distance=250)


async def test_extruding_needs_a_hot_nozzle(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, A1_MINI)
    device = _printer(hass, entry, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "extrude", device_id=device, distance=10)
    assert raised.value.translation_key == "nozzle_too_cold"

    bambuddy_api.statuses[A1_MINI]["temperatures"]["nozzle"] = 220.0
    await next_refresh(hass, freezer)
    await _act(hass, "extrude", device_id=device, distance=-5)

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

    await _act(hass, "extrude", device_id=_printer(hass, entry, H2D), distance=10)

    bambuddy_api.jog_extruder.assert_awaited_once_with(H2D, 10.0)


async def test_loading_a_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The slot's sensor names the slot; BamBuddy's tray id goes along."""
    entry = await set_up(hass, A1_MINI)
    slot = entity_id(hass, "sensor", ams_uid(entry, 0, "slot_3", A1_MINI))

    await _act(hass, "load_filament", entity_id=slot)

    bambuddy_api.load_filament.assert_awaited_once_with(A1_MINI, 2)


@pytest.mark.parametrize(("key", "refusal"), [("slot_4", "slot_empty")])
async def test_an_empty_slot_is_refused(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, key: str, refusal: str
) -> None:
    entry = await set_up(hass, A1_MINI)
    slot = entity_id(hass, "sensor", ams_uid(entry, 0, key, A1_MINI))

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "load_filament", entity_id=slot)

    assert raised.value.translation_key == refusal


async def test_an_ams_ht_cannot_load(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, H2D)
    bambuddy_api.statuses[H2D]["state"] = "IDLE"
    await next_refresh(hass, freezer)
    slot = entity_id(hass, "sensor", ams_uid(entry, 128, "slot_1", H2D))

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "load_filament", entity_id=slot)

    assert raised.value.translation_key == "ams_ht_load"


async def test_something_else_is_no_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)
    other = entity_id(hass, "sensor", printer_uid(entry, "progress", A1_MINI))

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "load_filament", entity_id=other)

    assert raised.value.translation_key == "not_a_slot"


async def test_unloading(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    await _act(hass, "unload_filament", device_id=_printer(hass, entry, A1_MINI))

    bambuddy_api.unload_filament.assert_awaited_once_with(A1_MINI)


async def test_drying(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, H2D)
    ams = device_id(hass, entry, ams_device(entry, H2D, 0))

    await _act(hass, "start_drying", device_id=ams, temperature=55, duration=8)
    # The AMS HT dries.
    await _act(hass, "stop_drying", device_id=device_id(hass, entry, ams_device(entry, H2D, 128)))

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
        await _act(hass, action, device_id=device_id(hass, entry, ams_device(entry, H2D, 128)), **extra)

    assert raised.value.translation_key == "printer_offline"


async def test_a_parked_drying_countdown_may_be_stopped(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    bambuddy_api.statuses[H2D]["ams"][1]["dry_countdown_stalled"] = True
    entry = await set_up(hass, H2D)

    await _act(hass, "stop_drying", device_id=device_id(hass, entry, ams_device(entry, H2D, 128)))

    bambuddy_api.stop_drying.assert_awaited_once_with(H2D, 128)


async def test_a_unit_that_is_not_drying_is_said_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "stop_drying", device_id=device_id(hass, entry, ams_device(entry, H2D, 0)))

    assert raised.value.translation_key == "not_drying"
    bambuddy_api.stop_drying.assert_not_awaited()


async def test_setting_a_colour_on_an_offline_printer_says_offline(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Offline, the slot's material is unknown too: the printer's state is the reason to name."""
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI]["connected"] = False
    bambuddy_api.statuses[A1_MINI]["ams"][0]["tray"][0]["tray_type"] = ""
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, ams_uid(entry, 0, "slot_1", A1_MINI), color=[255, 0, 0])

    assert raised.value.translation_key == "printer_offline"


async def test_drying_only_where_and_as_hot_as_a_unit_can(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A first AMS has no heater; the AMS 2 Pro dries at 65 °C at most."""
    entry = await set_up(hass, X1C, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "start_drying", device_id=device_id(hass, entry, ams_device(entry, X1C, 0)), temperature=55, duration=8)
    assert raised.value.translation_key == "cannot_dry"

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "start_drying", device_id=device_id(hass, entry, ams_device(entry, H2D, 0)), temperature=80, duration=8)
    assert (raised.value.translation_key, raised.value.translation_placeholders) == (
        "drying_too_hot",
        {"model": "AMS 2 Pro", "maximum": "65"},
    )
    bambuddy_api.start_drying.assert_not_awaited()


@pytest.mark.parametrize("action", ["move_axis", "extrude"])
async def test_a_distance_of_0_is_refused_in_words(hass: HomeAssistant, bambuddy_api: SimpleNamespace, action: str) -> None:
    entry = await set_up(hass, A1_MINI)
    data = {"device_id": _printer(hass, entry, A1_MINI), "distance": 0, **({"axis": "x"} if action == "move_axis" else {})}

    with pytest.raises(ServiceValidationError) as raised:
        await hass.services.async_call(DOMAIN, action, data, blocking=True)

    assert raised.value.translation_key == "zero_distance"


async def test_a_printer_is_no_ams(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "stop_drying", device_id=_printer(hass, entry, H2D))

    assert raised.value.translation_key == "not_an_ams"


async def test_an_ams_is_no_printer(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "home_axes", device_id=device_id(hass, entry, ams_device(entry, A1_MINI, 0)))

    assert raised.value.translation_key == "not_a_printer"


async def test_answering_an_hms_message(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """As on the printer's screen: an answer the printer offers for the
    message, sent with its full code and its job."""
    entry = await set_up(hass, P1S)
    sensor = hass.states.get(entity_id(hass, "sensor", printer_uid(entry, "hms_status", P1S)))
    assert sensor is not None
    assert [error["actions"] for error in sensor.attributes["errors"]] == [["RESUME_PRINTING"], []]

    await hass.services.async_call(
        DOMAIN,
        "answer_hms",
        {"device_id": _printer(hass, entry, P1S), "code": "0700_2000_0002_0012", "action": "RESUME_PRINTING"},
        blocking=True,
    )

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
        await hass.services.async_call(
            DOMAIN, "answer_hms", {"device_id": _printer(hass, entry, P1S), "code": code, "action": action}, blocking=True
        )

    assert raised.value.translation_key == key
    bambuddy_api.execute_hms_action.assert_not_awaited()


async def test_only_answers_that_send_something_are_listed(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Bambu's catalogue also names buttons of its own screen (the
    assistant, the live view) that send the printer nothing."""
    status = load_fixture("status_p1s.json")
    status["hms_errors"][0]["actions"] = ["CHECK_ASSISTANT", "RESUME_PRINTING", "JUMP_TO_LIVEVIEW", "STOP_PRINTING"]
    bambuddy_api.statuses[P1S] = status
    entry = await set_up(hass, P1S)

    sensor = hass.states.get(entity_id(hass, "sensor", printer_uid(entry, "hms_status", P1S)))
    assert sensor is not None and sensor.attributes["errors"][0]["actions"] == ["RESUME_PRINTING", "STOP_PRINTING"]


async def test_more_generic_filaments(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Bambu's generic profiles, with Bambu Studio's nozzle ranges -- the
    external spool needs them too."""
    entry = await set_up(hass, H2D)

    await _set_filament(hass, printer_uid(entry, "external_spool", H2D), filament="GFT98")

    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert {key: kwargs[key] for key in ("tray_type", "name", "tray_info_idx", "setting_id", "temp_min", "temp_max")} == {
        "tray_type": "PPS-CF",
        "name": "Generic PPS-CF",
        "tray_info_idx": "GFT98",
        "setting_id": "GFST98_04",
        "temp_min": 310,
        "temp_max": 340,
    }


async def test_a_slots_k_profiles(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The printer's calibrations for the nozzle that feeds the slot; the
    slot's own one named."""
    entry = await set_up(hass, X1C)

    response = await hass.services.async_call(
        DOMAIN, "get_k_profiles", {"entity_id": entity_id(hass, "sensor", ams_uid(entry, 0, "slot_2"))}, blocking=True, return_response=True
    )

    bambuddy_api.get_kprofiles.assert_awaited_once_with(X1C, "0.4")
    assert response == {
        "nozzle_diameter": 0.4,
        "current": 3,
        "profiles": [
            {"index": 1, "name": "Generic PLA", "k_value": 0.02, "filament_id": "GFL99", "nozzle": None},
            {"index": 2, "name": "Generic PETG", "k_value": 0.035, "filament_id": "GFG99", "nozzle": None},
            {"index": 3, "name": "Grey PLA matte", "k_value": 0.018, "filament_id": "GFL99", "nozzle": None},
        ],
    }


async def test_a_two_nozzle_printers_k_profiles_are_its_nozzles(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The H2D's AMS HT feeds the left nozzle: its calibrations only."""
    entry = await set_up(hass, H2D)

    response = await hass.services.async_call(
        DOMAIN, "get_k_profiles", {"entity_id": entity_id(hass, "sensor", ams_uid(entry, 128, "slot_1", H2D))}, blocking=True, return_response=True
    )

    assert response["profiles"] == [  # type: ignore[index]
        {"index": 1, "name": "Generic ABS", "k_value": 0.024, "filament_id": "GFB99", "nozzle": "left"}
    ]


async def test_a_k_profile_for_a_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Chosen with a filament or alone; sent with its filament, so BamBuddy
    selects it where the printer files it."""
    entry = await set_up(hass, A1_MINI)
    slot = ams_uid(entry, 0, "slot_2", A1_MINI)

    await _set_filament(hass, slot, filament="GFL99", k_profile=3)
    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert {key: kwargs[key] for key in ("tray_type", "cali_idx", "kprofile_filament_id", "kprofile_setting_id", "k_value")} == {
        "tray_type": "PLA",
        "cali_idx": 3,
        "kprofile_filament_id": "GFL99",
        "kprofile_setting_id": None,
        "k_value": 0.018,
    }

    await _set_filament(hass, slot, k_profile=2)
    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert (kwargs["tray_type"], kwargs["cali_idx"], kwargs["kprofile_filament_id"]) == ("PETG", 2, "GFG99")

    # The printer's default K.
    await _set_filament(hass, slot, k_profile=-1)
    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert (kwargs["cali_idx"], "kprofile_filament_id" in kwargs) == (-1, False)


async def test_a_k_profile_the_printer_does_not_have_is_refused(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), k_profile=99)

    assert raised.value.translation_key == "k_profile_unknown"
    bambuddy_api.configure_slot.assert_not_awaited()


async def _slot_action(hass: HomeAssistant, action: str, unique_id: str) -> None:
    await hass.services.async_call(DOMAIN, action, {"entity_id": entity_id(hass, "sensor", unique_id)}, blocking=True)


async def test_resetting_a_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Material and colour go, as Reset on the printer's screen; the
    external spool too."""
    entry = await set_up(hass, A1_MINI, P1S)

    await _slot_action(hass, "reset_slot", ams_uid(entry, 0, "slot_2", A1_MINI))
    bambuddy_api.reset_slot.assert_awaited_with(A1_MINI, 0, 1)
    await _slot_action(hass, "reset_slot", printer_uid(entry, "external_spool", A1_MINI))
    bambuddy_api.reset_slot.assert_awaited_with(A1_MINI, 255, 0)
    # A paused print may have a spool swapped by hand.
    await _slot_action(hass, "reset_slot", ams_uid(entry, 0, "slot_2", P1S))
    bambuddy_api.reset_slot.assert_awaited_with(P1S, 0, 1)


@pytest.mark.parametrize(("printer_id", "slot", "key"), [(X1C, "slot_3", "slot_pause_first"), (A1_MINI, "slot_4", "slot_empty")])
async def test_a_slot_is_not_reset_during_a_print_or_empty(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, printer_id: int, slot: str, key: str
) -> None:
    entry = await set_up(hass, printer_id)

    with pytest.raises(ServiceValidationError) as raised:
        await _slot_action(hass, "reset_slot", ams_uid(entry, 0, slot, printer_id))

    assert raised.value.translation_key == key
    bambuddy_api.reset_slot.assert_not_awaited()


async def test_a_spool_nobody_named_is_no_slot_to_reset(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Present, but without a material: nothing to reset, as an empty slot."""
    bambuddy_api.statuses[A1_MINI]["ams"][0]["tray"][1]["tray_type"] = ""
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await _slot_action(hass, "reset_slot", ams_uid(entry, 0, "slot_2", A1_MINI))

    assert raised.value.translation_key == "slot_empty"
    bambuddy_api.reset_slot.assert_not_awaited()


async def test_reading_a_spools_chip_again(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    await _slot_action(hass, "refresh_rfid", ams_uid(entry, 0, "slot_2", A1_MINI))

    bambuddy_api.refresh_rfid.assert_awaited_once_with(A1_MINI, 0, 1)


@pytest.mark.parametrize(
    ("printer_id", "unique_id", "key"),
    [
        # BamBuddy refuses while any filament is loaded.
        (P1S, "slot_2", "rfid_unload_first"),
        (A1_MINI, "external_spool", "rfid_not_external"),
    ],
)
async def test_a_chip_is_read_again_only_unloaded_and_in_an_ams(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, printer_id: int, unique_id: str, key: str
) -> None:
    entry = await set_up(hass, printer_id)
    target = printer_uid(entry, unique_id, printer_id) if unique_id == "external_spool" else ams_uid(entry, 0, unique_id, printer_id)

    with pytest.raises(ServiceValidationError) as raised:
        await _slot_action(hass, "refresh_rfid", target)

    assert raised.value.translation_key == key
    bambuddy_api.refresh_rfid.assert_not_awaited()


async def test_a_unit_on_both_nozzles_gets_every_k_profile(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Not narrowed to a nozzle the unit may not feed."""
    bambuddy_api.statuses[H2D]["ams_extruder_map"] = {}
    entry = await set_up(hass, H2D)

    response = await hass.services.async_call(
        DOMAIN, "get_k_profiles", {"entity_id": entity_id(hass, "sensor", ams_uid(entry, 0, "slot_1", H2D))}, blocking=True, return_response=True
    )

    assert [item["nozzle"] for item in response["profiles"]] == [None, None, None, None]  # type: ignore[index,union-attr]


async def test_a_k_profile_just_listed_is_set_without_asking_again(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The printer may not answer a second time (BamBuddy then
    gives an empty list after 16 s); the list the card showed holds."""
    entry = await set_up(hass, A1_MINI)
    slot = entity_id(hass, "sensor", ams_uid(entry, 0, "slot_2", A1_MINI))
    await hass.services.async_call(DOMAIN, "get_k_profiles", {"entity_id": slot}, blocking=True, return_response=True)
    bambuddy_api.get_kprofiles.return_value = []

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), k_profile=3)

    assert bambuddy_api.get_kprofiles.await_count == 1
    assert bambuddy_api.configure_slot.await_args.kwargs["cali_idx"] == 3


async def test_a_printer_that_lists_no_k_profiles_says_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    bambuddy_api.get_kprofiles.return_value = []
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), k_profile=3)

    assert raised.value.translation_key == "k_profiles_no_answer"


async def test_a_chip_is_read_in_a_pause_with_nothing_loaded(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """As the card says -- pause first."""
    bambuddy_api.statuses[P1S]["tray_now"] = 255
    entry = await set_up(hass, P1S)

    await _slot_action(hass, "refresh_rfid", ams_uid(entry, 0, "slot_2", P1S))

    bambuddy_api.refresh_rfid.assert_awaited_once_with(P1S, 0, 1)


async def test_an_hms_answer_the_printer_does_not_take_says_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy's 400 in words: the printer did not take it."""
    entry = await set_up(hass, P1S)
    bambuddy_api.execute_hms_action.side_effect = BamBuddyApiError(400, "Failed to execute HMS action")

    with pytest.raises(ServiceValidationError) as raised:
        await hass.services.async_call(
            DOMAIN,
            "answer_hms",
            {"device_id": _printer(hass, entry, P1S), "code": "0700_2000_0002_0012", "action": "RESUME_PRINTING"},
            blocking=True,
        )

    assert raised.value.translation_key == "hms_answer_not_taken"


async def test_stopping_through_an_hms_answer_reads_the_printer_first(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A message cleared at the printer meanwhile stops nothing."""
    status = bambuddy_api.statuses[P1S]
    status["hms_errors"][0]["actions"] = ["RESUME_PRINTING", "STOP_PRINTING"]
    entry = await set_up(hass, P1S)
    status["hms_errors"] = []

    with pytest.raises(ServiceValidationError) as raised:
        await hass.services.async_call(
            DOMAIN,
            "answer_hms",
            {"device_id": _printer(hass, entry, P1S), "code": "0700_2000_0002_0012", "action": "STOP_PRINTING"},
            blocking=True,
        )

    assert raised.value.translation_key == "hms_not_current"
    bambuddy_api.execute_hms_action.assert_not_awaited()


async def test_an_offline_printer_takes_no_action(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C] = load_fixture("status_offline.json")
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "unload_filament", device_id=_printer(hass, entry, X1C))

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
        await _act(hass, "load_filament", entity_id=slot)

    assert raised.value.translation_key == "printer_offline"


async def test_loading_the_external_spool(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI]["vt_tray"][0].update({"tray_type": "PLA", "exists": True})
    await next_refresh(hass, freezer)
    spool = entity_id(hass, "sensor", printer_uid(entry, "external_spool", A1_MINI))

    await _act(hass, "load_filament", entity_id=spool)

    bambuddy_api.load_filament.assert_awaited_once_with(A1_MINI, 254)


async def test_the_objects_of_the_running_print(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """For the dashboard card and for scripts: which objects there are, and
    which are skipped already."""
    entry = await set_up(hass, X1C)

    response = await hass.services.async_call(
        DOMAIN, "get_print_objects", {"device_id": _printer(hass, entry, X1C)}, blocking=True, return_response=True
    )

    assert response == {
        "objects": [
            {"id": 87, "name": "Bracket left", "skipped": False},
            {"id": 104, "name": "Bracket right", "skipped": True},
            {"id": 121, "name": "Spacer", "skipped": False},
        ]
    }


async def test_skipping_objects(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    await _act(hass, "skip_objects", device_id=_printer(hass, entry, X1C), objects=[87, 121])

    bambuddy_api.skip_objects.assert_awaited_once_with(X1C, [87, 121])


async def test_skipping_needs_a_print(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "skip_objects", device_id=_printer(hass, entry, A1_MINI), objects=[87])
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            "get_print_objects",
            {"device_id": _printer(hass, entry, A1_MINI)},
            blocking=True,
            return_response=True,
        )

    assert raised.value.translation_key == "not_printing"
    bambuddy_api.skip_objects.assert_not_awaited()


async def test_objects_bambuddy_cannot_read(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The job lies where BamBuddy cannot reach it."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_print_objects.side_effect = BamBuddyApiError(500, "Could not download 3MF file")

    with pytest.raises(HomeAssistantError) as raised:
        await hass.services.async_call(
            DOMAIN, "get_print_objects", {"device_id": _printer(hass, entry, X1C)}, blocking=True, return_response=True
        )

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
        await _act(hass, action, device_id=_printer(hass, entry, A1_MINI), **data)

    assert raised.value.translation_key == "filament_change"


async def test_a_paused_print_can_change_filament(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A colour change by hand: pause, unload, load, resume. Moving stays
    locked: the print would shift."""
    entry = await set_up(hass, P1S)
    printer = _printer(hass, entry, P1S)

    await _act(hass, "unload_filament", device_id=printer)
    await hass.services.async_call(
        DOMAIN, "load_filament", {"entity_id": entity_id(hass, "sensor", ams_uid(entry, 0, "slot_2", P1S))}, blocking=True
    )
    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "home_axes", device_id=printer)

    bambuddy_api.unload_filament.assert_awaited_once_with(P1S)
    bambuddy_api.load_filament.assert_awaited_once_with(P1S, 1)
    assert raised.value.translation_key == "job_running"


async def test_a_running_print_keeps_its_filament(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "unload_filament", device_id=_printer(hass, entry, X1C))

    assert raised.value.translation_key == "pause_first"
    bambuddy_api.unload_filament.assert_not_awaited()


async def _set_filament(hass: HomeAssistant, slot: str, **data: Any) -> None:
    await hass.services.async_call(
        DOMAIN, "set_filament", {"entity_id": entity_id(hass, "sensor", slot), **data}, blocking=True
    )


async def test_a_new_colour_keeps_the_slot_s_filament(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Only the colour: BamBuddy keeps the slot's preset, and its K value
    stays."""
    entry = await set_up(hass, A1_MINI)

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), color=[193, 46, 31])

    bambuddy_api.configure_slot.assert_awaited_once_with(
        A1_MINI, 0, 1, tray_type="PETG", name="Generic PETG", color="C12E1FFF", temp_min=220, temp_max=260,
        tray_info_idx="GFG99", setting_id="GFSG99", cali_idx=-1, nozzle_diameter="0.4",
    )


async def test_a_described_spool_takes_a_colour_whatever_exists_says(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy's exists still says empty from before the spool went in,
    while the printer names its filament: the slot takes the colour."""
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI]["ams"][0]["tray"][1]["exists"] = False
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), color=[193, 46, 31])

    bambuddy_api.configure_slot.assert_awaited_once()


async def test_a_vendor_profile_is_set_with_bambu_studios_ids(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """SUNLU PLA+ on the A1 mini's slot without a chip: its id and setting id
    as Bambu Studio sends them, never derived."""
    entry = await set_up(hass, A1_MINI)

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), filament="GFSNL03", color=[0, 0, 0])

    bambuddy_api.configure_slot.assert_awaited_once_with(
        A1_MINI, 0, 1, tray_type="PLA", name="SUNLU PLA+", color="000000FF", temp_min=190, temp_max=240,
        tray_info_idx="GFSNL03", setting_id="GFSNLS03_04", cali_idx=-1, nozzle_diameter="0.4",
    )


async def test_a_bambu_spool_with_a_broken_chip(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Bambu PLA Basic on a slot without a chip; no K profile named: the
    printer's default, no calibration of another filament."""
    entry = await set_up(hass, X1C)

    await _set_filament(hass, ams_uid(entry, 0, "slot_3"), filament="GFA00")

    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert (kwargs["tray_info_idx"], kwargs["setting_id"], kwargs["name"], kwargs["cali_idx"]) == ("GFA00", "GFSA00_04", "Bambu PLA Basic", -1)
    assert not {"kprofile_filament_id", "kprofile_setting_id", "k_value"} & set(kwargs)


async def test_tpu_for_ams_goes_as_bambu_studios_type(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), filament="GFU98")

    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert {key: kwargs[key] for key in ("tray_type", "tray_info_idx", "setting_id", "temp_min", "temp_max")} == {
        "tray_type": "TPU-AMS", "tray_info_idx": "GFU98", "setting_id": "GFSU98_02", "temp_min": 200, "temp_max": 250,
    }  # fmt: skip


@pytest.mark.parametrize(
    ("data", "key", "placeholders"),
    [
        # Bambu Studio offers the A1 mini no ABS, and no PPS-CF.
        ({"filament": "GFB99"}, "filament_not_offered", {"filament": "Generic ABS", "printer": "Desk"}),
        ({"filament": "GFT98"}, "filament_not_offered", {"filament": "Generic PPS-CF", "printer": "Desk"}),
        # An id Bambu Studio does not have.
        ({"filament": "GFNLS03"}, "filament_not_offered", {"filament": "GFNLS03", "printer": "Desk"}),
        # Plain TPU is for the external spool.
        ({"filament": "GFU99"}, "filament_not_for_ams", {"filament": "Generic TPU"}),
    ],
)
async def test_a_filament_bambu_studio_would_refuse(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, data: dict[str, Any], key: str, placeholders: dict[str, str]
) -> None:
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), **data)

    assert raised.value.translation_key == key
    assert {name: raised.value.translation_placeholders[name] for name in placeholders} == placeholders
    bambuddy_api.configure_slot.assert_not_awaited()


async def test_plain_tpu_on_the_external_spool(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    await _set_filament(hass, printer_uid(entry, "external_spool", A1_MINI), filament="GFU99")

    assert bambuddy_api.configure_slot.await_args.kwargs["tray_info_idx"] == "GFU99"


async def test_the_h2ds_right_nozzle_refuses_pet_cf(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The right external spool feeds the right nozzle, which Bambu Studio
    gives no Bambu PET-CF."""
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, printer_uid(entry, "external_spool_2", H2D), filament="GFT01")

    assert (raised.value.translation_key, raised.value.translation_placeholders["filament"]) == ("filament_not_right", "Bambu PET-CF")


@pytest.mark.parametrize(
    ("spool", "code", "filament", "key"),
    [
        # The left spool feeds the left nozzle, which takes no Generic TPU.
        ("external_spool", "HS01", "GFU99", "filament_not_left"),
        # A TPU high-flow nozzle on the right takes only its own TPUs.
        ("external_spool_2", "HU01", "GFU98", "filament_not_for_nozzle"),
    ],
)
async def test_the_h2ds_nozzles(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, spool: str, code: str, filament: str, key: str
) -> None:
    entry = await set_up(hass, H2D)
    bambuddy_api.statuses[H2D]["nozzles"][0]["nozzle_type"] = code
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, printer_uid(entry, spool, H2D), filament=filament)

    assert raised.value.translation_key == key


async def test_set_filament_takes_no_material(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """One way to name a profile: its id, the generic ones among them."""
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(vol.Invalid):
        await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), material="PLA")

    bambuddy_api.configure_slot.assert_not_awaited()


async def test_an_empty_filament_is_none(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), filament="")

    assert raised.value.translation_key == "nothing_to_set"


async def test_a_colour_alone_keeps_a_generic_profile(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Generic PETG HF stays Generic PETG HF: the slot's id goes back with
    the colour (with none, BamBuddy picks the generic of the type)."""
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI]["ams"][0]["tray"][1]["tray_info_idx"] = "GFG96"
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), color=[0, 0, 0])

    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert (kwargs["tray_info_idx"], kwargs["setting_id"], kwargs["name"]) == ("GFG96", "GFSG96_04", "Generic PETG HF")


async def test_a_colour_alone_keeps_a_foreign_id(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """An id Bambu Studio does not have (a user's own, BamBuddy's misread
    SUNLU): sent back as it is, without a setting id of ours."""
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI]["ams"][0]["tray"][1]["tray_info_idx"] = "GFNLS03"
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), color=[0, 0, 0])

    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert (kwargs["tray_info_idx"], kwargs["setting_id"]) == ("GFNLS03", "")


async def _get_filaments(hass: HomeAssistant, slot: str) -> dict[str, Any]:
    response = await hass.services.async_call(
        DOMAIN, "get_filaments", {"entity_id": entity_id(hass, "sensor", slot)}, blocking=True, return_response=True
    )
    assert isinstance(response, dict)
    return response


def _offered(response: dict[str, Any]) -> set[str]:
    return {item["id"] for vendor in response["vendors"] for item in vendor["filaments"]}


async def test_get_filaments_answers_the_slots_offer(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    response = await _get_filaments(hass, ams_uid(entry, 0, "slot_2", A1_MINI))

    assert response["current"] == "GFG99"
    assert [vendor["name"] for vendor in response["vendors"]] == ["Bambu Lab", "Generic", "Polymaker", "Overture", "SUNLU", "eSUN"]
    generic = response["vendors"][1]["filaments"]
    assert generic[0] == {"id": "GFL99", "name": "PLA", "type": "PLA"}
    assert "GFB99" not in _offered(response) and "GFU99" not in _offered(response)


async def test_get_filaments_for_an_empty_slot_and_an_offline_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI]["connected"] = False
    await next_refresh(hass, freezer)

    response = await _get_filaments(hass, ams_uid(entry, 0, "slot_4", A1_MINI))

    assert response["current"] is None
    assert "GFL99" in _offered(response)


async def test_a_switch_slot_is_offered_what_either_nozzle_takes(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The H2D's AMS on the filament track switch (BamBuddy leaves it out of
    its map): Bambu PPA-CF goes through the left nozzle."""
    entry = await set_up(hass, H2D)
    slot = ams_uid(entry, 0, "slot_1", H2D)
    assert "GFN06" not in _offered(await _get_filaments(hass, slot))  # unit 0 feeds the right nozzle

    bambuddy_api.statuses[H2D]["ams_extruder_map"] = {"128": 1}
    await next_refresh(hass, freezer)

    assert "GFN06" in _offered(await _get_filaments(hass, slot))


@pytest.mark.parametrize(("code", "absent", "present"), [("N1", "GFB99", "GFL99"), ("O1E", "GFSNL03", "GFT98")])
async def test_a_model_code_is_read_as_its_model(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, code: str, absent: str, present: str
) -> None:
    """BamBuddy may store a model code: N1 is the A1 mini (no ABS), O1E the
    H2D Pro (no SUNLU, but PPS-CF)."""
    as_model(bambuddy_api, code)
    entry = await set_up(hass, X1C)

    offered = _offered(await _get_filaments(hass, ams_uid(entry, 0, "slot_3")))

    assert absent not in offered and present in offered



async def test_a_generic_filament_takes_its_profile(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A generic filament: Bambu's generic profile; the K value goes back to
    the default, as on the printer's screen."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["ams"][0]["tray"][2]["cali_idx"] = 4
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_3"), filament="GFG96")

    bambuddy_api.configure_slot.assert_awaited_once_with(
        X1C, 0, 2, tray_type="PETG", name="Generic PETG HF", color="FFFFFFFF", temp_min=220, temp_max=270,
        tray_info_idx="GFG96", setting_id="GFSG96_04", cali_idx=-1, nozzle_diameter="0.4",
    )


async def test_the_colour_alone_keeps_the_k_value(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    tray = bambuddy_api.statuses[X1C]["ams"][0]["tray"][2]
    tray.update({"cali_idx": 4, "nozzle_temp_min": 200, "nozzle_temp_max": 220})
    bambuddy_api.statuses[X1C]["nozzles"][0]["nozzle_diameter"] = "0.6"
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_3"), color=[0, 0, 0])

    bambuddy_api.configure_slot.assert_awaited_once_with(
        X1C, 0, 2, tray_type="PLA", name="Generic PLA", color="000000FF", temp_min=200, temp_max=220,
        tray_info_idx="GFL99", setting_id="GFSL99", cali_idx=4, nozzle_diameter="0.6",
    )


async def test_a_slot_without_a_nozzle_range_takes_its_profile_s(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["ams"][0]["tray"][2].update({"nozzle_temp_min": 0, "nozzle_temp_max": 0})
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_3"), color=[0, 0, 0])

    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert (kwargs["temp_min"], kwargs["temp_max"]) == (190, 240)


@pytest.mark.parametrize(
    ("tray_type", "nozzle_range"),
    [
        ("TPU-AMS", (200, 250)),  # Generic TPU for AMS, not PLA's
        ("PLA-S", (190, 240)),  # Bambu Support For PLA: no Generic of the type
        ("PA-S", (260, 300)),  # Bambu Support For PA/PET
        ("Wood", (190, 240)),  # a type Bambu Studio does not have: Generic PLA's
    ],
)
async def test_a_foreign_profile_without_a_range_takes_its_type_s(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    freezer: FrozenDateTimeFactory,
    tray_type: str,
    nozzle_range: tuple[int, int],
) -> None:
    """A profile the list lacks and no range of the slot's own: the range of
    the profile the slot's type stands for."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["ams"][0]["tray"][2].update(
        {"tray_info_idx": "P4d64437", "tray_type": tray_type, "nozzle_temp_min": 0, "nozzle_temp_max": 0}
    )
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_3"), color=[0, 0, 0])

    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert (kwargs["tray_info_idx"], kwargs["temp_min"], kwargs["temp_max"]) == ("P4d64437", *nozzle_range)


@pytest.mark.parametrize(("printer_id", "tray", "diameter"), [(X1C, 0, "0.4"), (H2D, 0, "0.6"), (H2D, 1, "0.4")])
async def test_the_external_spool_gets_its_filament(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, printer_id: int, tray: int,
    diameter: str,
) -> None:
    """The spool on the holder: BamBuddy's AMS 255, left 0, right 1 -- with
    the diameter of the nozzle it feeds (an H2D's left nozzle: 0.6 mm here;
    BamBuddy's nozzles[0] is the right one)."""
    entry = make_entry(hass, printer_id)
    await setup_integration(hass, entry)
    if printer_id == H2D:
        bambuddy_api.statuses[H2D]["nozzles"][1]["nozzle_diameter"] = "0.6"
        await next_refresh(hass, freezer)
    external = "external_spool_2" if tray else "external_spool"

    await _set_filament(hass, printer_uid(entry, external, printer_id), filament="GFL99", color=[255, 106, 19])

    bambuddy_api.configure_slot.assert_awaited_once_with(
        printer_id, 255, tray, tray_type="PLA", name="Generic PLA", color="FF6A13FF", temp_min=190, temp_max=240,
        tray_info_idx="GFL99", setting_id="GFSL99", cali_idx=-1, nozzle_diameter=diameter,
    )


@pytest.mark.parametrize(
    ("printer_id", "change", "slot", "data", "refusal"),
    [
        # A Bambu spool's chip says what it holds; the printer reads it again.
        (X1C, {}, "slot_1", {"color": [0, 0, 0]}, "rfid_spool"),
        (X1C, {}, "slot_4", {"filament": "GFL99"}, "slot_empty"),
        # The slot printing right now.
        (A1_MINI, {"state": "RUNNING", "tray_now": 1}, "slot_2", {"color": [0, 0, 0]}, "slot_in_use"),
        (A1_MINI, {"ams_status_main": 1, "ams_status_sub": 3}, "slot_2", {"color": [0, 0, 0]}, "filament_change"),
    ],
)
async def test_a_slot_that_cannot_take_a_filament(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    freezer: FrozenDateTimeFactory,
    printer_id: int,
    change: dict[str, Any],
    slot: str,
    data: dict[str, Any],
    refusal: str,
) -> None:
    entry = make_entry(hass, printer_id)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[printer_id].update(change)
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, ams_uid(entry, 0, slot, printer_id), **data)

    assert raised.value.translation_key == refusal
    bambuddy_api.configure_slot.assert_not_awaited()


async def test_a_paused_print_may_relabel_its_slot(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Paused for a colour change by hand: the new spool gets its colour."""
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI].update({"state": "PAUSE", "tray_now": 1})
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), color=[0, 0, 0])

    bambuddy_api.configure_slot.assert_awaited_once()


async def test_an_unknown_material_needs_a_choice(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The external spool holds nothing the printer knows: a colour alone
    does not say what it is."""
    entry = await set_up(hass, X1C)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, printer_uid(entry, "external_spool"), color=[0, 0, 0])

    assert raised.value.translation_key == "material_needed"


async def test_set_filament_needs_a_filament_or_a_colour(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, ams_uid(entry, 0, "slot_3"))

    assert raised.value.translation_key == "nothing_to_set"


@pytest.mark.parametrize(("unit", "index", "slot", "diameter"), [(0, 1, "slot_2", "0.4"), (128, 0, "slot_1", "0.6")])
async def test_an_ams_slot_names_the_nozzle_it_feeds(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    freezer: FrozenDateTimeFactory,
    unit: int,
    index: int,
    slot: str,
    diameter: str,
) -> None:
    """The H2D's AMS 2 Pro feeds the right nozzle, its AMS HT the left one
    (BamBuddy's ams_extruder_map): the printer keeps a K value per nozzle
    diameter."""
    entry = await set_up(hass, H2D)
    status = bambuddy_api.statuses[H2D]
    status["nozzles"][1]["nozzle_diameter"] = "0.6"
    status["state"] = "IDLE"
    ams = next(item for item in status["ams"] if item["id"] == unit)
    ams["tray"][index].update({"tag_uid": None, "tray_uuid": None})
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, unit, slot, H2D), color=[0, 0, 0])

    assert bambuddy_api.configure_slot.await_args.kwargs["nozzle_diameter"] == diameter


async def test_the_slot_feeding_the_other_nozzle_is_in_use(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Two nozzles, two slots in use: BamBuddy's tray_now names one, its
    extruder_slots both."""
    entry = await set_up(hass, H2D)
    bambuddy_api.statuses[H2D]["ams"][0]["tray"][2].update({"tag_uid": None, "tray_uuid": None})
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, ams_uid(entry, 0, "slot_3", H2D), color=[0, 0, 0])

    assert raised.value.translation_key == "slot_in_use"


async def test_a_filament_without_a_colour_is_opaque(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A slot BamBuddy reset carries a transparent black: the new filament
    keeps the colour, not the transparency."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["ams"][0]["tray"][2]["tray_color"] = "00000000"
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_3"), filament="GFL98")

    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert (kwargs["color"], kwargs["temp_min"], kwargs["temp_max"]) == ("000000FF", 190, 240)


async def test_a_new_filament_keeps_a_translucent_colour(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A translucent filament's colour carries its transparency: a new
    filament keeps it. Only a colour chosen anew is opaque -- Home
    Assistant's colour picker has no transparency."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["ams"][0]["tray"][2]["tray_color"] = "00ae42cc"
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_3"), filament="GFG96")
    assert bambuddy_api.configure_slot.await_args.kwargs["color"] == "00AE42CC"

    await _set_filament(hass, ams_uid(entry, 0, "slot_3"), color=[255, 0, 0])
    assert bambuddy_api.configure_slot.await_args.kwargs["color"] == "FF0000FF"


async def test_an_unknown_nozzle_counts_as_0_4_mm(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Bambu's standard nozzle, as BamBuddy's own default."""
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI]["nozzles"] = []
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), color=[0, 0, 0])

    assert bambuddy_api.configure_slot.await_args.kwargs["nozzle_diameter"] == "0.4"


@pytest.mark.parametrize(("feed", "external"), [(255, "external_spool_2"), (254, "external_spool")])
async def test_the_external_spool_feeding_a_nozzle_is_in_use(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, feed: int, external: str
) -> None:
    """The printer names the external spools 254 (left) and 255 (right) in
    extruder_slots -- not BamBuddy's AMS 255 with slot 0 or 1."""
    entry = await set_up(hass, H2D)
    bambuddy_api.statuses[H2D]["extruder_slots"]["0"] = {"ams_id": feed, "slot_id": 0, "has_filament": True}
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, printer_uid(entry, external, H2D), filament="GFL99")

    assert raised.value.translation_key == "slot_in_use"


async def test_the_left_external_spool_is_free_while_the_right_one_feeds(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """BamBuddy's 254 on a two-nozzle printer is "an external spool": the right nozzle feeds from the
    right one, so the left one may be set during the print."""
    bambuddy_api.statuses[H2D].update({"tray_now": 254, "active_extruder": 0})
    entry = await set_up(hass, H2D)

    await _set_filament(hass, printer_uid(entry, "external_spool", H2D), filament="GFL99")

    bambuddy_api.configure_slot.assert_awaited_once()


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

    await hass.services.async_call(DOMAIN, "load_filament", {"entity_id": slot}, blocking=True)

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
        await _act(hass, "load_filament", entity_id=slot)
    assert raised.value.translation_key == "ams_not_reported"

    bambuddy_api.statuses[A1_MINI]["connected"] = False
    await next_refresh(hass, freezer)
    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "load_filament", entity_id=slot)
    assert raised.value.translation_key == "printer_offline"


async def test_a_printer_bambuddy_does_not_list_now_points_to_its_repair(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """Its device waits under Repairs: an action on it, or on one of its AMS
    units, says so -- not that it is no printer."""
    entry = await set_up(hass, X1C, A1_MINI)
    printer = device_id(hass, entry, printer_device(entry, A1_MINI))
    unit = device_id(hass, entry, ams_device(entry, A1_MINI, 0))
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    for service, device in (("home_axes", printer), ("stop_drying", unit)):
        with pytest.raises(ServiceValidationError) as raised:
            await hass.services.async_call(DOMAIN, service, {"device_id": device}, blocking=True)
        assert raised.value.translation_key == "printer_not_listed"
        assert raised.value.translation_placeholders == {"printer": printer_name(A1_MINI)}


async def test_an_unplugged_unit_is_named_as_such(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its device stays (settled); an action on it says the printer does not
    report it now -- not that it is a printer."""
    entry = await set_up(hass, X1C)
    unit = device_id(hass, entry, ams_device(entry, X1C, 0))
    bambuddy_api.statuses[X1C]["ams"] = []
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await hass.services.async_call(DOMAIN, "stop_drying", {"device_id": unit}, blocking=True)

    assert raised.value.translation_key == "ams_not_reported"
    assert raised.value.translation_placeholders == {"printer": "Workshop"}


async def test_a_slot_of_a_printer_bambuddy_does_not_list_now_points_to_its_repair(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    entry = await set_up(hass, X1C, A1_MINI)
    slot = entity_id(hass, "sensor", ams_uid(entry, 0, "slot_1", A1_MINI))
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    for action, data in (("load_filament", {}), ("set_filament", {"filament": "GFL99"})):
        with pytest.raises(ServiceValidationError) as raised:
            await hass.services.async_call(DOMAIN, action, {"entity_id": slot, **data}, blocking=True)
        assert raised.value.translation_key == "printer_not_listed"


async def test_a_read_that_times_out_is_no_command(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Nothing may still reach the printer: it was a read."""
    entry = await set_up(hass, X1C)
    timeout = BamBuddyConnectionError("GET /printers/1/print/objects: TimeoutError")
    timeout.__cause__ = TimeoutError()
    bambuddy_api.get_print_objects.side_effect = timeout

    with pytest.raises(HomeAssistantError) as raised:
        await hass.services.async_call(
            DOMAIN, "get_print_objects", {"device_id": _printer(hass, entry, X1C)}, blocking=True, return_response=True
        )

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
        await hass.services.async_call(DOMAIN, "stop_drying", {"device_id": device_id(hass, entry, ams_device(entry, P1S, 0))}, blocking=True)

    assert raised.value.translation_key == "dry_stop_on_screen"
    bambuddy_api.stop_drying.assert_not_awaited()


async def test_checking_the_connection(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    """BamBuddy's verdict and checks as it gives them -- for an offline
    printer too: it reads, it sends nothing."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C] = load_fixture("status_offline.json")
    await next_refresh(hass, freezer)

    response = await hass.services.async_call(
        DOMAIN, "run_diagnostic", {"device_id": _printer(hass, entry, X1C)}, blocking=True, return_response=True
    )

    assert response is not None
    assert response["overall"] == "problems"
    assert response["checks"][0] == {"id": "port_mqtt", "status": "fail", "params": {}}
    assert response["checks"][2] == {"id": "port_rtsps", "status": "warn", "params": {"port": 322, "protocol": "RTSPS"}}
    assert len(response["checks"]) == 9  # type: ignore[arg-type]
    bambuddy_api.get_diagnostic.assert_awaited_once_with(X1C)


async def test_a_connection_check_bambuddy_cannot_run(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.get_diagnostic.side_effect = BamBuddyConnectionError("refused")

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN, "run_diagnostic", {"device_id": _printer(hass, entry, X1C)}, blocking=True, return_response=True
        )


async def test_a_connection_check_bambuddy_fails(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A check is no command: BamBuddy reported an error."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_diagnostic.side_effect = BamBuddyApiError(500, "Simulated failure")

    with pytest.raises(HomeAssistantError) as raised:
        await hass.services.async_call(
            DOMAIN, "run_diagnostic", {"device_id": _printer(hass, entry, X1C)}, blocking=True, return_response=True
        )

    assert (raised.value.translation_key, raised.value.translation_placeholders) == ("read_failed", {"error": "Simulated failure"})



async def test_a_unit_drying_already_is_said_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The H2D's AMS HT dries: another start would be BamBuddy's error; said before it is sent."""
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "start_drying", device_id=device_id(hass, entry, ams_device(entry, H2D, 128)), temperature=55, duration=8)

    assert raised.value.translation_key == "already_drying"
    bambuddy_api.start_drying.assert_not_awaited()


async def test_no_drying_during_a_filament_change(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    bambuddy_api.statuses[H2D].update({"ams_status_main": 1, "ams_status_sub": 2})
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "start_drying", device_id=device_id(hass, entry, ams_device(entry, H2D, 0)), temperature=55, duration=8)

    assert raised.value.translation_key == "filament_change"


async def test_bambuddys_own_refusal_is_no_error_of_home_assistant(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy refuses with a 4xx (here a 409 "AMS is busy"): a validation error -- no ERROR in the log,
    an automation can tell it from a failing BamBuddy."""
    bambuddy_api.start_drying.side_effect = BamBuddyApiError(409, "AMS is busy")
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "start_drying", device_id=device_id(hass, entry, ams_device(entry, H2D, 0)), temperature=55, duration=8)

    assert raised.value.translation_key == "command_failed"


async def test_a_failing_bambuddy_stays_an_error(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A 5xx is BamBuddy failing, not refusing: an error, not a validation error."""
    bambuddy_api.start_drying.side_effect = BamBuddyApiError(500, "Internal Server Error")
    entry = await set_up(hass, H2D)

    with pytest.raises(HomeAssistantError) as raised:
        await _act(hass, "start_drying", device_id=device_id(hass, entry, ams_device(entry, H2D, 0)), temperature=55, duration=8)

    assert type(raised.value) is HomeAssistantError


async def test_a_parked_drying_timer_is_no_drying(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The AMS HT's countdown stands still (the drying sensor says off): a new drying may start."""
    bambuddy_api.statuses[H2D]["ams"][1]["dry_countdown_stalled"] = True
    entry = await set_up(hass, H2D)

    await _act(hass, "start_drying", device_id=device_id(hass, entry, ams_device(entry, H2D, 128)), temperature=55, duration=8)

    bambuddy_api.start_drying.assert_awaited_once()


async def test_a_parked_countdown_the_printer_still_counts_is_said_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Where the printer still counts a parked countdown as drying, BamBuddy refuses the start (409):
    said in the user's words, with the way out. A 409 for a unit without a parked countdown stays BamBuddy's."""
    bambuddy_api.statuses[H2D]["ams"][1]["dry_countdown_stalled"] = True
    bambuddy_api.start_drying.side_effect = BamBuddyApiError(409, "AMS is already drying")
    entry = await set_up(hass, H2D)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "start_drying", device_id=device_id(hass, entry, ams_device(entry, H2D, 128)), temperature=55, duration=8)

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
        await _act(hass, "start_drying", device_id=device_id(hass, entry, ams_device(entry, H2D, 128)), temperature=55, duration=8)

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
        await _act(hass, "start_drying", device_id=device_id(hass, entry, ams_device(entry, H2D, 0)), temperature=55, duration=8)

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
        await _act(hass, "load_filament", entity_id=entity_id(hass, "sensor", ams_uid(entry, 0, "slot_1", H2D)))
    assert raised.value.translation_key == "load_track_switch"
    bambuddy_api.load_filament.assert_not_awaited()

    await _act(hass, "load_filament", entity_id=entity_id(hass, "sensor", printer_uid(entry, "external_spool", H2D)))
    bambuddy_api.load_filament.assert_awaited_once()


async def test_an_a1_mini_dries_on_its_own_screen(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The A1 and the A1 mini dry an AMS 2 Pro / AMS HT behind the AMS hub from their screen only:
    no update helps (Bambu's drying guide; BamBuddy files them as unsupported)."""
    bambuddy_api.statuses[A1_MINI]["ams"][0]["module_type"] = "n3f"
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "start_drying", device_id=device_id(hass, entry, ams_device(entry, A1_MINI, 0)), temperature=55, duration=8)

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
        await hass.services.async_call(
            DOMAIN, "answer_hms", {"device_id": device_id(hass, entry, printer_device(entry, P1S)), "code": code, "action": action}, blocking=True
        )

    assert raised.value.translation_key == "printer_offline"


async def test_an_hms_answer_the_printer_did_not_acknowledge_is_said_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy's 502: the printer sent nothing back -- not BamBuddy refusing."""
    entry = await set_up(hass, P1S)
    bambuddy_api.execute_hms_action.side_effect = BamBuddyApiError(502, "Printer did not acknowledge HMS action within 2.5s")

    with pytest.raises(ServiceValidationError) as raised:
        await hass.services.async_call(
            DOMAIN,
            "answer_hms",
            {"device_id": device_id(hass, entry, printer_device(entry, P1S)), "code": "0700_2000_0002_0012", "action": "RESUME_PRINTING"},
            blocking=True,
        )

    assert raised.value.translation_key == "hms_answer_not_taken"


async def test_reading_a_chip_waits_for_a_print_first(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """During a running print the reason is the print, not the filament loaded."""
    entry = await set_up(hass, X1C)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "refresh_rfid", entity_id=entity_id(hass, "sensor", ams_uid(entry, 0, "slot_3")))

    assert raised.value.translation_key == "slot_pause_first"


async def test_reading_a_chip_waits_for_a_filament_change(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI].update({"ams_status_main": 1, "ams_status_sub": 3, "tray_now": 1})
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "refresh_rfid", entity_id=entity_id(hass, "sensor", ams_uid(entry, 0, "slot_1", A1_MINI)))

    assert raised.value.translation_key == "filament_change"


async def test_reading_the_chip_of_an_empty_slot_is_refused(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """No spool in slot 4 (BamBuddy's exists false): nothing to read."""
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "refresh_rfid", entity_id=entity_id(hass, "sensor", ams_uid(entry, 0, "slot_4", A1_MINI)))

    assert raised.value.translation_key == "slot_empty"
    bambuddy_api.refresh_rfid.assert_not_awaited()


async def test_stopping_drying_on_a_unit_that_cannot_dry_says_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The X1C's first AMS has no heater: it cannot dry, so it cannot stop either."""
    entry = await set_up(hass, X1C)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "stop_drying", device_id=device_id(hass, entry, ams_device(entry, X1C, 0)))

    assert raised.value.translation_key == "cannot_dry"
    bambuddy_api.stop_drying.assert_not_awaited()


@pytest.mark.parametrize("service", ["reset_slot", "refresh_rfid"])
async def test_a_slot_tool_on_an_offline_printer_says_offline(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, service: str
) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C] = load_fixture("status_offline.json")
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _slot_action(hass, service, ams_uid(entry, 0, "slot_2", X1C))

    assert raised.value.translation_key == "printer_offline"
    getattr(bambuddy_api, service).assert_not_awaited()


async def test_an_hms_answer_bambuddy_fails_says_the_command_failed(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, P1S)
    bambuddy_api.execute_hms_action.side_effect = BamBuddyApiError(404, "Printer not found")

    with pytest.raises(HomeAssistantError) as raised:
        await hass.services.async_call(
            DOMAIN,
            "answer_hms",
            {"device_id": _printer(hass, entry, P1S), "code": "0700_2000_0002_0012", "action": "RESUME_PRINTING"},
            blocking=True,
        )

    assert raised.value.translation_key == "command_failed"
