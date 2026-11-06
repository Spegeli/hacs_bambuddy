"""The slot actions: set_filament, get_filaments, get_k_profiles, reset_slot and refresh_rfid."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
import voluptuous as vol
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError

from custom_components.bambuddy import services

from tests.conftest import (
    A1_MINI,
    H2D,
    P1S,
    X1C,
    ams_uid,
    entity_id,
    load_fixture,
    next_refresh,
    printer_uid,
    set_up,
)
from tests.helpers import as_model, call_action


async def _get_k_profiles(hass: HomeAssistant, slot: str) -> Any:
    return await call_action(hass, "get_k_profiles", response=True, entity_id=entity_id(hass, "sensor", slot))


async def _slot_action(hass: HomeAssistant, action: str, slot: str) -> None:
    await call_action(hass, action, entity_id=entity_id(hass, "sensor", slot))


async def _set_filament(hass: HomeAssistant, slot: str, **data: Any) -> None:
    await call_action(hass, "set_filament", entity_id=entity_id(hass, "sensor", slot), **data)


async def _get_filaments(hass: HomeAssistant, slot: str) -> dict[str, Any]:
    response = await call_action(hass, "get_filaments", response=True, entity_id=entity_id(hass, "sensor", slot))
    assert isinstance(response, dict)
    return response


def _offered(response: dict[str, Any]) -> set[str]:
    return {item["id"] for vendor in response["vendors"] for item in vendor["filaments"]}


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

    response = await _get_k_profiles(hass, ams_uid(entry, 0, "slot_2"))

    bambuddy_api.get_kprofiles.assert_awaited_once_with(X1C, "0.4")
    assert response == {
        "nozzle_diameter": 0.4,
        "current": 3,
        "profiles": [
            {"index": 1, "name": "Generic PLA", "k_value": 0.02, "filament_id": "GFL99", "nozzle": None},
            {"index": 2, "name": "Generic PETG", "k_value": 0.035, "filament_id": "GFG99", "nozzle": None},
            {"index": 3, "name": "Grey PLA matte", "k_value": 0.018, "filament_id": "GFL99", "nozzle": None},
        ],
        "answered": True,
    }


async def test_an_empty_answer_at_once_is_the_printers_answer(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The printer answers in a moment, also with no profiles of its own:
    that is its answer, no failure."""
    bambuddy_api.get_kprofiles.return_value = []
    entry = await set_up(hass, A1_MINI)

    response = await _get_k_profiles(hass, ams_uid(entry, 0, "slot_2", A1_MINI))

    assert response is not None
    assert (response["profiles"], response["answered"]) == ([], True)


async def test_an_empty_list_after_bambuddys_retries_is_no_answer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, monkeypatch: pytest.MonkeyPatch
) -> None:
    """BamBuddy asks three times, 5 s each, then gives an empty list
    (16 s): the printer did not answer. A first or a later answer comes
    within about 11 s."""
    bambuddy_api.get_kprofiles.return_value = []
    entry = await set_up(hass, A1_MINI)
    slot = ams_uid(entry, 0, "slot_2", A1_MINI)
    clock = iter([100.0, 116.2, 200.0, 213.9])
    monkeypatch.setattr(services, "_monotonic", lambda: next(clock))

    late = await _get_k_profiles(hass, slot)
    third = await _get_k_profiles(hass, slot)

    assert late is not None and third is not None
    assert (late["answered"], third["answered"]) == (False, True)


async def test_bambuddys_504_is_no_answer(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy 1.3 says the printer did not answer by a 504, which the
    client gives as None: no profiles, not answered -- however fast."""
    bambuddy_api.get_kprofiles.return_value = None
    entry = await set_up(hass, A1_MINI)
    slot = ams_uid(entry, 0, "slot_2", A1_MINI)

    response = await _get_k_profiles(hass, slot)

    assert response is not None
    assert (response["profiles"], response["answered"]) == ([], False)
    with pytest.raises(ServiceValidationError) as silent:
        await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), k_profile=3)
    assert silent.value.translation_key == "k_profiles_no_answer"


async def test_a_two_nozzle_printers_k_profiles_are_its_nozzles(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The H2D's AMS HT feeds the left nozzle: its calibrations only."""
    entry = await set_up(hass, H2D)

    response = await _get_k_profiles(hass, ams_uid(entry, 128, "slot_1", H2D))

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

    response = await _get_k_profiles(hass, ams_uid(entry, 0, "slot_1", H2D))

    assert [item["nozzle"] for item in response["profiles"]] == [None, None, None, None]  # type: ignore[index,union-attr]


async def test_a_k_profile_just_listed_is_set_without_asking_again(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The printer may not answer a second time (BamBuddy then
    gives an empty list after 16 s); the list the card showed holds."""
    entry = await set_up(hass, A1_MINI)
    slot = ams_uid(entry, 0, "slot_2", A1_MINI)
    await _get_k_profiles(hass, slot)
    bambuddy_api.get_kprofiles.return_value = []

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), k_profile=3)

    assert bambuddy_api.get_kprofiles.await_count == 1
    assert bambuddy_api.configure_slot.await_args.kwargs["cali_idx"] == 3


async def test_a_printer_that_lists_no_k_profiles_says_so(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An empty list at once: the printer has no such profile. After
    BamBuddy's retries: it did not answer -- ask again."""
    bambuddy_api.get_kprofiles.return_value = []
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as none:
        await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), k_profile=3)
    clock = iter([100.0, 116.2])
    monkeypatch.setattr(services, "_monotonic", lambda: next(clock))
    with pytest.raises(ServiceValidationError) as silent:
        await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), k_profile=3)

    assert (none.value.translation_key, silent.value.translation_key) == ("k_profile_unknown", "k_profiles_no_answer")


async def test_profiles_that_came_late_are_an_answer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The printer answered BamBuddy's third ask: its list counts, however long it took."""
    entry = await set_up(hass, A1_MINI)
    clock = iter([100.0, 117.0])
    monkeypatch.setattr(services, "_monotonic", lambda: next(clock))

    response = await _get_k_profiles(hass, ams_uid(entry, 0, "slot_2", A1_MINI))

    assert response is not None and response["profiles"] and response["answered"] is True


async def test_a_chip_is_read_in_a_pause_with_nothing_loaded(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """As the card says -- pause first."""
    bambuddy_api.statuses[P1S]["tray_now"] = 255
    entry = await set_up(hass, P1S)

    await _slot_action(hass, "refresh_rfid", ams_uid(entry, 0, "slot_2", P1S))

    bambuddy_api.refresh_rfid.assert_awaited_once_with(P1S, 0, 1)


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
    entry = await set_up(hass, printer_id)
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
    entry = await set_up(hass, printer_id)
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


async def test_the_slot_printing_now_is_set_mid_print(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """As BamBuddy: the slot a running print feeds takes a filament, a colour
    or a K profile too -- the card warns that it changes mid-print."""
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI].update({"state": "RUNNING", "tray_now": 1})
    await next_refresh(hass, freezer)

    await _set_filament(hass, ams_uid(entry, 0, "slot_2", A1_MINI), color=[0, 0, 0])

    bambuddy_api.configure_slot.assert_awaited_once()


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


async def test_the_left_external_spool_is_free_while_the_right_one_feeds(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """BamBuddy's 254 on a two-nozzle printer is "an external spool": the right nozzle feeds from the
    right one, so the left one may be set during the print."""
    bambuddy_api.statuses[H2D].update({"tray_now": 254, "active_extruder": 0})
    entry = await set_up(hass, H2D)

    await _set_filament(hass, printer_uid(entry, "external_spool", H2D), filament="GFL99")

    bambuddy_api.configure_slot.assert_awaited_once()


async def test_reading_a_chip_waits_for_a_print_first(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """During a running print the reason is the print, not the filament loaded."""
    entry = await set_up(hass, X1C)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "refresh_rfid", entity_id=entity_id(hass, "sensor", ams_uid(entry, 0, "slot_3")))

    assert raised.value.translation_key == "slot_pause_first"


async def test_reading_a_chip_waits_for_a_filament_change(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, A1_MINI)
    bambuddy_api.statuses[A1_MINI].update({"ams_status_main": 1, "ams_status_sub": 3, "tray_now": 1})
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "refresh_rfid", entity_id=entity_id(hass, "sensor", ams_uid(entry, 0, "slot_1", A1_MINI)))

    assert raised.value.translation_key == "filament_change"


async def test_reading_the_chip_of_an_empty_slot_is_refused(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """No spool in slot 4 (BamBuddy's exists false): nothing to read."""
    entry = await set_up(hass, A1_MINI)

    with pytest.raises(ServiceValidationError) as raised:
        await call_action(hass, "refresh_rfid", entity_id=entity_id(hass, "sensor", ams_uid(entry, 0, "slot_4", A1_MINI)))

    assert raised.value.translation_key == "slot_empty"
    bambuddy_api.refresh_rfid.assert_not_awaited()


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
