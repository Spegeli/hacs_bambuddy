"""The actions: moving the axes, homing, extruding, loading and unloading
filament, drying -- and when a printer must not take them."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
import voluptuous as vol
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import entity_registry as er

from custom_components.bambuddy.api import BamBuddyApiError
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import (
    A1_MINI,
    H2D,
    P1S,
    X1C,
    ams_device,
    ams_uid,
    device_id,
    entity_id,
    load_fixture,
    make_entry,
    next_refresh,
    printer_device,
    printer_uid,
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
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)

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
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)

    await _act(hass, "home_axes", device_id=_printer(hass, entry, A1_MINI))

    bambuddy_api.home_axes.assert_awaited_once_with(A1_MINI)


async def test_a_zero_or_too_long_move_is_refused(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)

    for distance in (0, 250):
        with pytest.raises(vol.Invalid):
            await _act(hass, "move_axis", device_id=_printer(hass, entry, A1_MINI), axis="z", distance=distance)


async def test_extruding_needs_a_hot_nozzle(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
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
    entry = make_entry(hass, H2D)
    await setup_integration(hass, entry)
    status = bambuddy_api.statuses[H2D]
    status.update({"state": "IDLE", "active_extruder": 0})
    status["temperatures"].update({"nozzle": 30.0, "nozzle_2": 230.0})
    await next_refresh(hass, freezer)

    await _act(hass, "extrude", device_id=_printer(hass, entry, H2D), distance=10)

    bambuddy_api.jog_extruder.assert_awaited_once_with(H2D, 10.0)


async def test_loading_a_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The slot's sensor names the slot; BamBuddy's tray id goes along."""
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    slot = er.async_get(hass).async_get_entity_id("sensor", DOMAIN, ams_uid(entry, 0, "slot_3", A1_MINI))

    await _act(hass, "load_filament", entity_id=slot)

    bambuddy_api.load_filament.assert_awaited_once_with(A1_MINI, 2)


@pytest.mark.parametrize(("key", "refusal"), [("slot_4", "slot_empty")])
async def test_an_empty_slot_is_refused(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, key: str, refusal: str
) -> None:
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    slot = er.async_get(hass).async_get_entity_id("sensor", DOMAIN, ams_uid(entry, 0, key, A1_MINI))

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "load_filament", entity_id=slot)

    assert raised.value.translation_key == refusal


async def test_an_ams_ht_cannot_load(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = make_entry(hass, H2D)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[H2D]["state"] = "IDLE"
    await next_refresh(hass, freezer)
    slot = er.async_get(hass).async_get_entity_id("sensor", DOMAIN, ams_uid(entry, 128, "slot_1", H2D))

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "load_filament", entity_id=slot)

    assert raised.value.translation_key == "ams_ht_load"


async def test_something_else_is_no_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    other = er.async_get(hass).async_get_entity_id("sensor", DOMAIN, printer_uid(entry, "progress", A1_MINI))

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "load_filament", entity_id=other)

    assert raised.value.translation_key == "not_a_slot"


async def test_unloading(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)

    await _act(hass, "unload_filament", device_id=_printer(hass, entry, A1_MINI))

    bambuddy_api.unload_filament.assert_awaited_once_with(A1_MINI)


async def test_drying(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, H2D)
    await setup_integration(hass, entry)
    ams = device_id(hass, entry, ams_device(entry, H2D, 0))

    await _act(hass, "start_drying", device_id=ams, temperature=55, duration=8)
    await _act(hass, "stop_drying", device_id=ams)

    bambuddy_api.start_drying.assert_awaited_once_with(H2D, 0, 55, 8)
    bambuddy_api.stop_drying.assert_awaited_once_with(H2D, 0)


async def test_a_printer_is_no_ams(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, H2D)
    await setup_integration(hass, entry)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "stop_drying", device_id=_printer(hass, entry, H2D))

    assert raised.value.translation_key == "not_an_ams"


async def test_an_ams_is_no_printer(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "home_axes", device_id=device_id(hass, entry, ams_device(entry, A1_MINI, 0)))

    assert raised.value.translation_key == "not_a_printer"


async def test_actions_refuse_without_control_permission(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "home_axes", device_id=_printer(hass, entry, A1_MINI))

    assert raised.value.translation_key == "control_not_permitted"


async def test_a_read_only_key_lists_the_print_objects(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy lists them for Read Status."""
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_read.json")
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    response = await hass.services.async_call(
        DOMAIN, "get_print_objects", {"device_id": _printer(hass, entry, X1C)}, blocking=True, return_response=True
    )

    assert len(response["objects"]) == 3  # type: ignore[arg-type,index]


async def test_an_offline_printer_takes_no_action(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[X1C] = load_fixture("status_offline.json")
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "unload_filament", device_id=_printer(hass, entry, X1C))

    assert raised.value.translation_key == "printer_offline"


async def test_loading_on_an_offline_printer_says_offline(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its slot sensors are unavailable; the action still names the reason."""
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[A1_MINI]["connected"] = False
    await next_refresh(hass, freezer)
    slot = er.async_get(hass).async_get_entity_id("sensor", DOMAIN, ams_uid(entry, 0, "slot_1", A1_MINI))

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "load_filament", entity_id=slot)

    assert raised.value.translation_key == "printer_offline"


async def test_loading_the_external_spool(hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory) -> None:
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[A1_MINI]["vt_tray"][0].update({"tray_type": "PLA", "exists": True})
    await next_refresh(hass, freezer)
    spool = er.async_get(hass).async_get_entity_id("sensor", DOMAIN, printer_uid(entry, "external_spool", A1_MINI))

    await _act(hass, "load_filament", entity_id=spool)

    bambuddy_api.load_filament.assert_awaited_once_with(A1_MINI, 254)


async def test_the_objects_of_the_running_print(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """For the dashboard card and for scripts: which objects there are, and
    which are skipped already."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

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
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    await _act(hass, "skip_objects", device_id=_printer(hass, entry, X1C), objects=[87, 121])

    bambuddy_api.skip_objects.assert_awaited_once_with(X1C, [87, 121])


async def test_skipping_needs_a_print(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)

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
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.get_print_objects.side_effect = BamBuddyApiError(500, "Could not download 3MF file")

    with pytest.raises(HomeAssistantError) as raised:
        await hass.services.async_call(
            DOMAIN, "get_print_objects", {"device_id": _printer(hass, entry, X1C)}, blocking=True, return_response=True
        )

    assert raised.value.translation_key == "command_failed"


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
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[A1_MINI].update({"ams_status_main": 1, "ams_status_sub": 3})
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, action, device_id=_printer(hass, entry, A1_MINI), **data)

    assert raised.value.translation_key == "filament_change"


async def test_a_paused_print_can_change_filament(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A colour change by hand: pause, unload, load, resume. Moving stays
    locked: the print would shift."""
    entry = make_entry(hass, P1S)
    await setup_integration(hass, entry)
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
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

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
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), color=[193, 46, 31])

    bambuddy_api.configure_slot.assert_awaited_once_with(
        A1_MINI, 0, 1, tray_type="PETG", name="PETG", color="C12E1FFF", temp_min=220, temp_max=260,
        tray_info_idx="", cali_idx=-1, nozzle_diameter="0.4",
    )


async def test_a_new_material_takes_its_generic_profile(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Bambu's generic profile of the material; the K value goes back to
    the default, as on the printer's screen."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[X1C]["ams"][0]["tray"][2]["cali_idx"] = 4
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_3"), material="PETG HF")

    bambuddy_api.configure_slot.assert_awaited_once_with(
        X1C, 0, 2, tray_type="PETG", name="Generic PETG HF", color="FFFFFFFF", temp_min=220, temp_max=260,
        tray_info_idx="GFG96", cali_idx=-1, nozzle_diameter="0.4",
    )


async def test_the_colour_alone_keeps_the_k_value(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    tray = bambuddy_api.statuses[X1C]["ams"][0]["tray"][2]
    tray.update({"cali_idx": 4, "nozzle_temp_min": 200, "nozzle_temp_max": 220})
    bambuddy_api.statuses[X1C]["nozzles"][0]["nozzle_diameter"] = "0.6"
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_3"), color=[0, 0, 0])

    bambuddy_api.configure_slot.assert_awaited_once_with(
        X1C, 0, 2, tray_type="PLA", name="PLA", color="000000FF", temp_min=200, temp_max=220,
        tray_info_idx="", cali_idx=4, nozzle_diameter="0.6",
    )


async def test_a_slot_without_a_nozzle_range_takes_its_material_s(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[X1C]["ams"][0]["tray"][2].update({"nozzle_temp_min": 0, "nozzle_temp_max": 0})
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_3"), color=[0, 0, 0])

    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert (kwargs["temp_min"], kwargs["temp_max"]) == (190, 230)


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

    await _set_filament(hass, printer_uid(entry, external, printer_id), material="PLA", color=[255, 106, 19])

    bambuddy_api.configure_slot.assert_awaited_once_with(
        printer_id, 255, tray, tray_type="PLA", name="Generic PLA", color="FF6A13FF", temp_min=190, temp_max=230,
        tray_info_idx="GFL99", cali_idx=-1, nozzle_diameter=diameter,
    )


@pytest.mark.parametrize(
    ("printer_id", "change", "slot", "data", "refusal"),
    [
        # A Bambu spool's chip says what it holds; the printer reads it again.
        (X1C, {}, "slot_1", {"color": [0, 0, 0]}, "rfid_spool"),
        (X1C, {}, "slot_4", {"material": "PLA"}, "slot_empty"),
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
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[A1_MINI].update({"state": "PAUSE", "tray_now": 1})
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), color=[0, 0, 0])

    bambuddy_api.configure_slot.assert_awaited_once()


async def test_an_unknown_material_needs_a_choice(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The external spool holds nothing the printer knows: a colour alone
    does not say what it is."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, printer_uid(entry, "external_spool"), color=[0, 0, 0])

    assert raised.value.translation_key == "material_needed"


async def test_set_filament_needs_a_material_or_a_colour(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

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
    entry = make_entry(hass, H2D)
    await setup_integration(hass, entry)
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
    entry = make_entry(hass, H2D)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[H2D]["ams"][0]["tray"][2].update({"tag_uid": None, "tray_uuid": None})
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, ams_uid(entry, 0, "slot_3", H2D), color=[0, 0, 0])

    assert raised.value.translation_key == "slot_in_use"


async def test_a_material_without_a_colour_is_opaque(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A slot BamBuddy reset carries a transparent black: the new filament
    keeps the colour, not the transparency."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[X1C]["ams"][0]["tray"][2]["tray_color"] = "00000000"
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_3"), material="PLA-CF")

    kwargs = bambuddy_api.configure_slot.await_args.kwargs
    assert (kwargs["color"], kwargs["temp_min"], kwargs["temp_max"]) == ("000000FF", 210, 240)



async def test_an_unknown_nozzle_counts_as_0_4_mm(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Bambu's standard nozzle, as BamBuddy's own default."""
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
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
    entry = make_entry(hass, H2D)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[H2D]["extruder_slots"]["0"] = {"ams_id": feed, "slot_id": 0, "has_filament": True}
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _set_filament(hass, printer_uid(entry, external, H2D), material="PLA")

    assert raised.value.translation_key == "slot_in_use"


async def test_a_slot_of_an_ams_plugged_in_elsewhere(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The slot follows its unit: plugged in as AMS B, it loads from there."""
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    slot = entity_id(hass, "sensor", ams_uid(entry, 0, "slot_1", A1_MINI))
    bambuddy_api.statuses[A1_MINI]["ams"][0]["id"] = 1
    await next_refresh(hass, freezer)

    await hass.services.async_call(DOMAIN, "load_filament", {"entity_id": slot}, blocking=True)

    bambuddy_api.load_filament.assert_awaited_once_with(A1_MINI, 4)


async def test_a_slot_of_an_unplugged_ams(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A unit the printer no longer reports holds nothing while the printer
    is online -- not the filament of another unit plugged in at its place;
    offline, the action says that first."""
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    slot = er.async_get(hass).async_get_entity_id("sensor", DOMAIN, ams_uid(entry, 0, "slot_1", A1_MINI))
    bambuddy_api.statuses[A1_MINI]["ams"][0]["serial_number"] = "03C00A000000099"
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "load_filament", entity_id=slot)
    assert raised.value.translation_key == "slot_empty"

    bambuddy_api.statuses[A1_MINI]["connected"] = False
    await next_refresh(hass, freezer)
    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "load_filament", entity_id=slot)
    assert raised.value.translation_key == "printer_offline"
