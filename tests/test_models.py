"""The printer data model: print status and stage, AMS units and slots, and
what each model has -- read from BamBuddy's status, without Home Assistant."""
from __future__ import annotations

from typing import Any

import pytest

from custom_components.bambuddy.models import (
    STAGE_OPTIONS,
    STAGES,
    PrinterData,
    active_tray,
    AMS_MODELS,
    ams_letter,
    ams_model,
    ams_object_id,
    ams_name,
    ams_number,
    camera_max_fps,
    chamber_heats,
    detectors,
    display_model,
    find_tray,
    heater_max,
    nozzle_type,
    printer_name,
    print_stage,
    print_status,
    round_ten,
    short_name,
    slot_attributes,
    slot_state,
    tray_id,
    tray_label,
    ventilating,
)


def _printer(status: dict[str, Any], model: str = "X1C", **info: Any) -> PrinterData:
    return PrinterData(info={"model": model, **info}, status=status)


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        ({"connected": True, "state": "RUNNING"}, "printing"),
        ({"connected": True, "state": "PAUSE"}, "paused"),
        ({"connected": True, "state": "PREPARE"}, "preparing"),
        ({"connected": True, "state": "SLICING"}, "slicing"),
        ({"connected": True, "state": "IDLE"}, "idle"),
        ({"connected": True, "state": "FINISH"}, "finished"),
        ({"connected": True, "state": "FAILED"}, "failed"),
        ({"connected": True, "state": "unknown"}, "unknown"),
        # A printer starting up: no job yet.
        ({"connected": True, "state": "INIT"}, "idle"),
        # BamBuddy keeps the last state of a printer it lost.
        ({"connected": False, "state": "RUNNING"}, "offline"),
        ({"connected": False, "state": None}, "offline"),
        # A state BamBuddy may add one day.
        ({"connected": True, "state": "CALIBRATING"}, None),
        ({"connected": True, "state": None}, None),
    ],
)
def test_print_status(status: dict[str, Any], expected: str | None) -> None:
    assert print_status(_printer(status)) == expected


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        ({"stg_cur": 0, "stg_cur_name": "Printing", "state": "RUNNING"}, "printing"),
        ({"stg_cur": 0, "stg_cur_name": "Printing", "state": "PAUSE"}, "printing"),
        # Stage 0 outside a print: the A series and the P1 report it while
        # idle too (BamBuddy clears it for the A1, A1 mini and P1 only).
        ({"stg_cur": 0, "stg_cur_name": "Printing", "state": "IDLE"}, "idle"),
        ({"stg_cur": 0, "stg_cur_name": "Printing", "state": "FINISH"}, "idle"),
        ({"stg_cur": 2, "stg_cur_name": "Heatbed preheating"}, "heatbed_preheating"),
        ({"stg_cur": 16, "stg_cur_name": "Paused by the user"}, "paused_by_user"),
        ({"stg_cur": 77, "stg_cur_name": "Preparing AMS"}, "preparing_ams"),
        # Idle: BamBuddy names no stage.
        ({"stg_cur": -1, "stg_cur_name": None}, "idle"),
        ({"stg_cur": 255, "stg_cur_name": None}, "idle"),
        ({"stg_cur": 255, "stg_cur_name": None, "state": "FINISH"}, "idle"),
        # No name during a job is no idle printer: unknown.
        ({"stg_cur": -1, "stg_cur_name": None, "state": "RUNNING"}, None),
        ({"stg_cur": 255, "stg_cur_name": None, "state": "PAUSE"}, None),
        # Derived at the start of a print, without a stage number.
        ({"stg_cur": -1, "stg_cur_name": "Heating heatbed"}, "heating_heatbed"),
        ({"stg_cur": 255, "stg_cur_name": "Heating nozzle"}, "heating_nozzle"),
        ({"stg_cur": -1, "stg_cur_name": "Preparing"}, "preparing"),
        # A number BamBuddy names "Preparing" because it is not in its table.
        ({"stg_cur": 90, "stg_cur_name": "Preparing"}, "preparing"),
        ({"stg_cur": 90, "stg_cur_name": "Something new"}, None),
    ],
)
def test_print_stage(status: dict[str, Any], expected: str | None) -> None:
    assert print_stage(status) == expected


def test_every_stage_is_an_option() -> None:
    assert set(STAGES.values()) <= set(STAGE_OPTIONS)
    assert {"idle", "heating_heatbed", "heating_nozzle"} <= set(STAGE_OPTIONS)


@pytest.mark.parametrize(
    ("unit", "model", "expected"),
    [
        ({"id": 0, "module_type": "ams"}, "X1C", "AMS"),
        ({"id": 0, "module_type": "n3f"}, "H2D", "AMS 2 Pro"),
        ({"id": 128, "module_type": "n3s"}, "H2D", "AMS HT"),
        ({"id": 129, "module_type": ""}, "H2D", "AMS HT"),
        ({"id": 0, "module_type": ""}, "A1 Mini", "AMS Lite"),
        ({"id": 6, "module_type": ""}, "A2L", "AMS Lite"),
        ({"id": 1, "module_type": ""}, "P1S", "AMS"),
        # BamBuddy's module once it reads the AMS Lite's (maziggy/bambuddy#3348).
        ({"id": 0, "module_type": "ams_f1"}, "P1S", "AMS Lite"),
        # Place 6 is only ever the A2L's AMS Lite, whatever the printer is called.
        ({"id": 6, "module_type": ""}, None, "AMS Lite"),
        # The Lite is guessed only where one can be: A1 and A1 mini at 0, A2L at 6.
        ({"id": 1, "module_type": ""}, "A1", "AMS"),
        ({"id": 2, "module_type": ""}, "A2L", "AMS"),
        ({"id": 0, "module_type": ""}, "A2L", "AMS"),
    ],
)
def test_ams_model(unit: dict[str, Any], model: str | None, expected: str) -> None:
    assert ams_model(unit, _printer({}, model)) == expected  # type: ignore[arg-type]
    assert expected in AMS_MODELS


@pytest.mark.parametrize(("unit_id", "letter"), [(0, "a"), (3, "d"), (128, "a"), (135, "h"), (6, None)])
def test_ams_letter(unit_id: int, letter: str | None) -> None:
    """The place's letter as on the printer; the A2L's AMS Lite has none."""
    assert ams_letter(unit_id) == letter


@pytest.mark.parametrize(
    ("model", "printer_key", "unit_id", "serial", "key", "expected"),
    [
        # What stays for the unit: its model and serial, no place.
        ("AMS 2 Pro", "00M09A350500654", 0, "19C06A000000001", "slot_1", "ams_2_pro_19c06a000000001_slot_1"),
        ("AMS HT", "0948AD000000004", 129, "19F06A000000002", "humidity", "ams_ht_19f06a000000002_humidity"),
        # Without a serial: the printer's serial and the place's letter.
        ("AMS Lite", "03C00A000000004", 0, None, "slot_1", "ams_lite_03c00a000000004_a_slot_1"),
        ("AMS Lite", "26A19A500700555", 6, None, "slot_1", "ams_lite_26a19a500700555_slot_1"),
        ("AMS HT", "id7", 128, None, "humidity", "ams_ht_id7_a_humidity"),
        ("AMS", "00M09A350500654", 2, "", "drying", "ams_00m09a350500654_c_drying"),
    ],
)
def test_ams_object_id(model: str, printer_key: str, unit_id: int, serial: str | None, key: str, expected: str) -> None:
    assert ams_object_id(model, printer_key, unit_id, serial, key) == expected


@pytest.mark.parametrize(("unit_id", "number"), [(0, 1), (3, 4), (6, 1), (128, 1), (130, 3)])
def test_ams_number(unit_id: int, number: int) -> None:
    assert ams_number(unit_id) == number


@pytest.mark.parametrize(
    ("unit_id", "slot", "global_id"), [(0, 0, 0), (0, 3, 3), (1, 2, 6), (3, 3, 15), (6, 1, 25), (128, 0, 128)]
)
def test_tray_id(unit_id: int, slot: int, global_id: int) -> None:
    assert tray_id(unit_id, slot) == global_id


_TRAY = {
    "id": 1,
    "tray_color": "FF6A13FF",
    "tray_type": "PLA",
    "tray_sub_brands": "PLA Basic",
    "remain": 85,
    "nozzle_temp_min": 190,
    "nozzle_temp_max": 230,
    "state": 11,
    "exists": True,
}


@pytest.mark.parametrize(
    ("tray", "state"),
    [
        (_TRAY, "PLA Basic"),
        ({**_TRAY, "tray_sub_brands": ""}, "PLA"),
        # BamBuddy sets exists only from a report with the presence bits, and
        # clears the filament with it: a filament named after it is newer --
        # a spool put in and described (his A1, 2026-10-25), as BamBuddy's card reads it.
        ({**_TRAY, "exists": False}, "PLA Basic"),
        ({"id": 2, "tray_color": "", "tray_type": "", "tray_sub_brands": "", "exists": False}, "empty"),
        ({"id": 2, "tray_color": "", "tray_type": "", "tray_sub_brands": "", "exists": None}, "empty"),
        # The AMS HT reports state 9 for a loaded tray: the material decides.
        ({**_TRAY, "state": 9, "exists": None}, "PLA Basic"),
    ],
)
def test_slot_state(tray: dict[str, Any], state: str) -> None:
    assert slot_state(tray) == state


def test_slot_attributes() -> None:
    assert slot_attributes(_TRAY, 2, 1, active_tray={"tray_now": 1}.get("tray_now")) == {
        "slot": 2,
        "color": "#FF6A13",
        "type": "PLA",
        "name": "PLA Basic",
        # No chip: the AMS cannot estimate it.
        "remaining": None,
        "active": True,
        "empty": False,
        "tray_id": 1,
        "nozzle_temp_min": 190,
        "nozzle_temp_max": 230,
        "drying_temp": None,
        "drying_time": None,
        "rfid": False,
        "present": True,
    }


def test_the_external_spool_has_no_remaining_amount() -> None:
    """The printer reports 0 % for every spool on the holder."""
    assert slot_attributes({**_TRAY, "id": 254, "remain": 0}, 1, 254, None)["remaining"] is None


# A Bambu spool's chip: BamBuddy names both its ids (null without a chip).
_CHIP = {"tag_uid": "3B9E01AA22CC44EE", "tray_uuid": "0F1E2D3C4B5A69788796A5B4C3D2E1F0"}


def test_a_chip_spool_tells_its_remaining_amount() -> None:
    """The AMS estimates what is left of a Bambu spool from its chip."""
    assert slot_attributes({**_TRAY, **_CHIP, "remain": 85}, 2, 1, None)["remaining"] == 85


@pytest.mark.parametrize(
    "ids",
    [
        {},
        {"tag_uid": None, "tray_uuid": None},
        {"tag_uid": "3B9E01AA22CC44EE", "tray_uuid": None},
        {"tag_uid": None, "tray_uuid": "0F1E2D3C4B5A69788796A5B4C3D2E1F0"},
    ],
)
def test_a_spool_without_a_chip_has_no_remaining_amount(ids: dict[str, Any]) -> None:
    """Without a chip the AMS knows neither the spool nor what is on it: the
    A1's AMS Lite says 100 for every such spool."""
    assert slot_attributes({**_TRAY, **ids, "remain": 100}, 2, 1, None)["remaining"] is None


def test_an_unknown_remaining_amount_is_none() -> None:
    """-1: the AMS has no estimate, a chip or not."""
    assert slot_attributes({**_TRAY, **_CHIP, "remain": -1}, 2, 1, None)["remaining"] is None


def test_an_empty_slot_tells_no_filament() -> None:
    attributes = slot_attributes({"id": 0, "tray_color": "000000FF", "exists": False}, 1, 0, 5)
    assert attributes["empty"] is True
    assert attributes["present"] is False
    assert attributes["color"] is None
    assert attributes["active"] is False


@pytest.mark.parametrize(("tray_now", "expected"), [(255, None), (None, None), (5, 5), (254, 254)])
def test_active_tray(tray_now: int | None, expected: int | None) -> None:
    assert active_tray(_printer({"tray_now": tray_now})) == expected


@pytest.mark.parametrize(("extruder", "expected"), [(1, 254), (0, 255), (None, 255)])
def test_a_two_nozzle_printer_s_external_spool_by_its_nozzle(extruder: int | None, expected: int) -> None:
    """BamBuddy names both holders 254 there: the left nozzle (1) feeds from the left spool."""
    status = {"tray_now": 254, "active_extruder": extruder, "temperatures": {"nozzle": 25, "nozzle_2": 25}}
    assert active_tray(_printer(status, "H2D")) == expected


def test_find_tray() -> None:
    printer = _printer(
        {
            "ams": [{"id": 1, "tray": [{"id": 0}, {"id": 1, "tray_type": "PETG"}]}],
            "vt_tray": [{"id": 254, "tray_type": "TPU"}],
        }
    )
    assert find_tray(printer, 5) == ({"id": 1, "tray_type": "PETG"}, 2)
    assert find_tray(printer, 254) == ({"id": 254, "tray_type": "TPU"}, 1)
    assert find_tray(printer, 9) is None


@pytest.mark.parametrize(
    ("model", "aux", "door", "airduct", "ethernet", "sd", "exhaust", "usb"),
    [
        # Ethernet only on the X1E and the H2D Pro (Bambu's spec pages and FAQs, 2026-10-19).
        ("X1C", True, True, False, False, True, False, False),
        ("X1E", True, True, False, True, True, False, False),
        ("C13", True, True, False, True, True, False, False),
        # The A1 series has a microSD slot.
        ("A1 Mini", False, False, False, False, True, False, False),
        ("a1", False, False, False, False, True, False, False),
        ("P1S", True, False, False, False, True, False, False),
        # No SD slot: BamBuddy's flag tells a USB drive.
        ("H2D", True, True, True, False, True, True, True),
        ("H2D Pro", True, True, True, True, True, True, True),
        ("O1E", True, True, True, True, True, True, True),
        # The P2S's exhaust fan is a kit: here without it (see the next test).
        ("P2S", True, True, True, False, True, False, True),
        # The X2D's is fitted.
        ("X2D", True, True, True, False, True, True, True),
        # An unknown model: only what every printer has.
        ("", False, False, False, False, False, False, False),
    ],
)
def test_model_capabilities(
    model: str, aux: bool, door: bool, airduct: bool, ethernet: bool, sd: bool, exhaust: bool, usb: bool
) -> None:
    printer = _printer({}, model)
    assert (
        printer.has_aux_fans(),
        printer.has_door(),
        printer.has_airduct(),
        printer.has_ethernet(),
        printer.has_sd_card(),
        printer.has_exhaust_fan(),
        printer.stores_on_usb(),
    ) == (aux, door, airduct, ethernet, sd, exhaust, usb)


_T, _F = True, False


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        # aux fans, enclosed, door, airduct, Ethernet, USB drive, chamber fan, exhaust fan (no kit), stock aux,
        # stock chamber, A1 family, drying from the screen only -- after Bambu's spec pages and FAQs.
        ("X1", (_T, _T, _T, _F, _F, _F, _T, _F, _F, _T, _F, _F)),
        ("BL-P002", (_T, _T, _T, _F, _F, _F, _T, _F, _F, _T, _F, _F)),
        ("X1C", (_T, _T, _T, _F, _F, _F, _T, _F, _T, _T, _F, _F)),
        ("X1E", (_T, _T, _T, _F, _T, _F, _T, _F, _T, _T, _F, _F)),
        ("P1P", (_T, _F, _F, _F, _F, _F, _T, _F, _F, _F, _F, _F)),
        ("P1S", (_T, _T, _F, _F, _F, _F, _T, _F, _T, _T, _F, _F)),
        ("C12", (_T, _T, _F, _F, _F, _F, _T, _F, _T, _T, _F, _F)),
        ("P2S", (_T, _T, _T, _T, _F, _T, _F, _F, _T, _F, _F, _F)),
        ("N7", (_T, _T, _T, _T, _F, _T, _F, _F, _T, _F, _F, _F)),
        ("A1", (_F, _F, _F, _F, _F, _F, _F, _F, _F, _F, _T, _T)),
        ("A1 Mini", (_F, _F, _F, _F, _F, _F, _F, _F, _F, _F, _T, _T)),
        ("A04", (_F, _F, _F, _F, _F, _F, _F, _F, _F, _F, _T, _T)),
        ("A2L", (_F, _F, _F, _F, _F, _F, _F, _F, _F, _F, _T, _F)),
        ("N9", (_F, _F, _F, _F, _F, _F, _F, _F, _F, _F, _T, _F)),
        ("H2D", (_T, _T, _T, _T, _F, _T, _F, _T, _T, _F, _F, _F)),
        ("H2D Pro", (_T, _T, _T, _T, _T, _T, _F, _T, _T, _F, _F, _F)),
        ("O1E", (_T, _T, _T, _T, _T, _T, _F, _T, _T, _F, _F, _F)),
        ("H2S", (_T, _T, _T, _T, _F, _T, _F, _T, _T, _F, _F, _F)),
        ("H2C", (_T, _T, _T, _T, _F, _T, _F, _T, _T, _F, _F, _F)),
        ("O1C2", (_T, _T, _T, _T, _F, _T, _F, _T, _T, _F, _F, _F)),
        ("X2D", (_T, _T, _T, _T, _F, _T, _F, _T, _T, _F, _F, _F)),
    ],
)
def test_every_model_has_what_it_has(model: str, expected: tuple[bool, ...]) -> None:
    """Every model BamBuddy knows, and some of their codes: what it is given, and what not."""
    printer = _printer({}, model)
    assert (
        printer.has_aux_fans(),
        printer.enclosed(),
        printer.has_door(),
        printer.has_airduct(),
        printer.has_ethernet(),
        printer.stores_on_usb(),
        printer.has_chamber_fan(),
        printer.has_exhaust_fan(),
        printer.stock_aux_fan(),
        printer.stock_chamber_fan(),
        printer.is_a1_family(),
        printer.dries_on_screen_only(),
    ) == expected


@pytest.mark.parametrize(
    ("status", "info", "dual"),
    [
        ({"temperatures": {"nozzle": 200.0, "nozzle_2": 30.0}}, {}, True),
        ({"temperatures": None}, {"nozzle_count": 2}, True),
        ({"temperatures": {"nozzle": 200.0}}, {"nozzle_count": 1}, False),
    ],
)
def test_dual_nozzle(status: dict[str, Any], info: dict[str, Any], dual: bool) -> None:
    assert _printer(status, "H2D", **info).is_dual_nozzle is dual


@pytest.mark.parametrize(
    ("status", "running"),
    [
        ({"connected": True, "state": "RUNNING"}, True),
        ({"connected": True, "state": "PAUSE"}, True),
        ({"connected": True, "state": "IDLE"}, False),
        ({"connected": False, "state": "RUNNING"}, False),
    ],
)
def test_job_running(status: dict[str, Any], running: bool) -> None:
    assert _printer(status).job_running is running


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("hardened_steel", "hardened_steel"),
        ("stainless_steel", "stainless_steel"),
        # The H2 series: flow type, then material.
        ("HS01", "hardened_steel"),
        ("HS05", "tungsten_carbide"),
        ("HH00", "stainless_steel_high_flow"),
        ("HE01", "hardened_steel_high_flow"),
        # Bambu Lab names no material for its TPU high-flow nozzle.
        ("HU01", "tpu_high_flow"),
        ("HS09", "HS09"),
    ],
)
def test_nozzle_type(code: str, expected: str) -> None:
    assert nozzle_type(code) == expected


def test_a_spool_with_a_chip_describes_itself() -> None:
    attributes = slot_attributes({**_TRAY, "tray_uuid": "7C2E4A9B1D0F4E5A8B3C6D7E8F901234"}, 2, 1, None)
    assert attributes["rfid"] is True


@pytest.mark.parametrize(
    ("model", "firmware", "expected"),
    [
        # The X1 series: one AI monitoring switch, the lidar's first layer
        # check, the plate's marker.
        ("X1C", "01.09.01.00", ["printing_monitor", "first_layer_inspector", "buildplate_marker_detector"]),
        ("X1E", None, ["printing_monitor", "first_layer_inspector", "buildplate_marker_detector"]),
        # No camera detection at all.
        ("P1S", "01.08.02.00", []),
        ("P1P", None, []),
        # The A series checks the plate with its force sensor.
        ("A1 Mini", "01.07.00.00", ["buildplate_marker_detector"]),
        ("A2L", None, ["buildplate_marker_detector"]),
        # The newer cameras: each detector on its own.
        ("H2S", None, ["buildplate_marker_detector", "spaghetti_detector", "pileup_detector", "clump_detector"]),
        ("P2S", None, ["buildplate_marker_detector", "spaghetti_detector", "pileup_detector", "clump_detector"]),
        (
            "H2C",
            None,
            ["buildplate_marker_detector", "spaghetti_detector", "pileup_detector", "clump_detector", "airprint_detector"],
        ),
        # The H2D got the single detectors with 01.01.02.08.
        (
            "H2D",
            "01.01.02.08",
            ["buildplate_marker_detector", "spaghetti_detector", "pileup_detector", "clump_detector", "airprint_detector"],
        ),
        ("H2D", "01.01.01.00", ["printing_monitor", "buildplate_marker_detector"]),
        ("X1", None, ["printing_monitor", "first_layer_inspector", "buildplate_marker_detector"]),
        (
            "H2D Pro",
            None,
            ["buildplate_marker_detector", "spaghetti_detector", "pileup_detector", "clump_detector", "airprint_detector"],
        ),
        ("X2D", None, ["buildplate_marker_detector", "spaghetti_detector", "pileup_detector", "clump_detector"]),
        # A firmware that is no version counts as a current one.
        (
            "H2D",
            "01.01.02.08x",
            ["buildplate_marker_detector", "spaghetti_detector", "pileup_detector", "clump_detector", "airprint_detector"],
        ),
        ("", None, []),
    ],
)
def test_detectors(model: str, firmware: str | None, expected: list[str]) -> None:
    assert detectors(_printer({"firmware_version": firmware}, model)) == expected


def test_a_described_spool_is_there_whatever_exists_says() -> None:
    """A filament the printer names after the last presence bits: the spool
    is there (the card offers its pencil), as in BamBuddy's own card."""
    attributes = slot_attributes({**_TRAY, "exists": False}, 2, 1, None)
    assert (attributes["empty"], attributes["present"], attributes["name"]) == (False, True, "PLA Basic")


def test_a_spool_nobody_described_is_there() -> None:
    """A spool without a chip, just put in: empty of information, but
    present -- the printer now asks what it holds."""
    attributes = slot_attributes({"id": 2, "tray_type": "", "tray_sub_brands": "", "exists": True}, 3, 2, None)
    assert (attributes["empty"], attributes["present"]) == (True, True)


def test_a_printer_without_a_name_is_named_by_its_model_not_its_code() -> None:
    printer = {"id": 4, "name": " ", "model": "C12", "serial_number": "01P00A000000004"}
    assert short_name(printer) == "P1S"
    assert ams_name(printer, 0, "AMS", "006000000000001").startswith("P1S AMS A")


def test_the_names_trim_bambuddys_blanks() -> None:
    printer = {"id": 1, "name": " Lab ", "model": "X1C", "serial_number": "00M00A000000001"}
    assert (printer_name(printer), short_name(printer)) == ("Lab (X1C / 00M00A000000001)", "Lab")


@pytest.mark.parametrize(
    ("unit_id", "model", "serial", "label", "name"),
    [
        (0, "AMS 2 Pro", "19C06A000000001", None, "Studio AMS A (AMS 2 Pro / 19C06A000000001)"),
        (1, "AMS 2 Pro", "19C06A000000003", None, "Studio AMS B (AMS 2 Pro / 19C06A000000003)"),
        (128, "AMS HT", "19F06A000000002", None, "Studio AMS HT A (AMS HT / 19F06A000000002)"),
        (129, "AMS HT", "", None, "Studio AMS HT B (AMS HT)"),
        # An A2L's AMS Lite: BamBuddy's unit 6, "AMS Lite" without a letter (amsHelpers.ts) -- an AMS
        # at place 0 is AMS A beside it.
        (6, "AMS Lite", "", None, "Studio AMS Lite"),
        # An A1's AMS Lite is the A1's AMS A.
        (0, "AMS Lite", "", None, "Studio AMS A (AMS Lite)"),
        # Named in BamBuddy: its name in place of the place.
        (1, "AMS", "00600A3B0000012", "Silk", "Studio Silk (AMS / 00600A3B0000012)"),
        (6, "AMS Lite", "", "Silk", "Studio Silk (AMS Lite)"),
    ],
)
def test_ams_names(unit_id: int, model: str, serial: str, label: str | None, name: str) -> None:
    """After the printer, lettered as Bambu Lab and BamBuddy do -- or by
    the unit's name in BamBuddy."""
    assert ams_name({"id": 4, "name": "Studio", "model": "H2D"}, unit_id, model, serial, label) == name


@pytest.mark.parametrize(
    ("model", "fps"),
    [
        ("X1C", 30),
        ("X1", 30),
        ("X1E", 30),
        ("X2D", 30),
        ("H2D", 30),
        ("H2D Pro", 30),
        ("H2S", 30),
        ("H2C", 30),
        ("P2S", 30),
        ("BL-P001", 30),
        ("N7", 30),
        ("O1C2", 30),
        ("A1", 5),
        ("A1 Mini", 5),
        ("P1S", 5),
        ("P1P", 5),
        ("A2L", 5),
        ("", 5),
    ],
)
def test_the_camera_frame_rate_by_model(model: str, fps: int) -> None:
    """BamBuddy's rule (services/camera.py supports_rtsp, routes/camera.py
    camera_stream): the RTSP models stream up to 30 frames a second; the
    chamber image of the A1 and P1 series, and a model BamBuddy does not
    know, up to 5."""
    assert camera_max_fps({"model": model}) == fps


def test_a_camera_bambuddy_takes_from_elsewhere_gives_15() -> None:
    """An external camera BamBuddy streams instead (on, with an address):
    BamBuddy caps it at 15, whatever the printer."""
    external = {"external_camera_enabled": True, "external_camera_url": "http://camera.local/stream"}
    assert camera_max_fps({"model": "X1C", **external}) == 15
    assert camera_max_fps({"model": "A1 Mini", **external}) == 15
    # On without an address, or an address switched off: the printer's own.
    assert camera_max_fps({"model": "A1 Mini", "external_camera_enabled": True, "external_camera_url": None}) == 5
    assert camera_max_fps({"model": "X1C", **external, "external_camera_enabled": False}) == 30


@pytest.mark.parametrize(
    ("model", "status", "chamber", "exhaust"),
    [
        # BamBuddy reports the P2S's External Exhaust Fan kit as exhaust_fan_present (bambu_mqtt.py 4730-4737):
        # the base P2S has neither a chamber nor an exhaust fan.
        ("P2S", {}, False, False),
        ("P2S", {"exhaust_fan_present": False}, False, False),
        ("P2S", {"exhaust_fan_present": True}, False, True),
        ("N7", {"exhaust_fan_present": True}, False, True),
        ("X2D", {}, False, True),
        # Bambu calls the H2 series' fan 3 the exhaust fan (Studio's default, the wiki).
        ("H2D", {}, False, True),
        ("H2S", {}, False, True),
        ("X1C", {}, True, False),
        ("A1", {}, False, False),
    ],
)
def test_the_chamber_and_the_exhaust_fan(model: str, status: dict[str, Any], chamber: bool, exhaust: bool) -> None:
    printer = _printer(status, model)
    assert (printer.has_chamber_fan(), printer.has_exhaust_fan()) == (chamber, exhaust)


@pytest.mark.parametrize(
    ("model", "aux", "chamber"),
    [("X1", False, True), ("BL-P002", False, True), ("P1P", False, False), ("C11", False, False), ("X1C", True, True),
     ("P1S", True, True), ("H2D", True, False)],
)
def test_fans_the_stock_printer_lacks(model: str, aux: bool, chamber: bool) -> None:
    """The stock X1 has no auxiliary fan, the P1P neither that nor a chamber fan (Bambu's pages);
    kits add them, so the integration still offers them, disabled at first."""
    printer = _printer({}, model)
    assert (printer.stock_aux_fan(), printer.stock_chamber_fan()) == (aux, chamber)


# BamBuddy's PRINTER_MODEL_ID_MAP (utils/printer_models.py) and the discovery's BL-P003 (printerModel.ts).
_CODES = {
    "BL-P001": "X1C", "BL-P002": "X1", "BL-P003": "X1E", "C13": "X1E", "C11": "P1P", "C12": "P1S", "N7": "P2S",
    "N6": "X2D", "N9": "A2L", "A11": "A1", "A12": "A1 Mini", "N1": "A1 Mini", "N2S": "A1", "A04": "A1 Mini",
    "O1D": "H2D", "O1E": "H2D Pro", "O2D": "H2D Pro", "O1C": "H2C", "O1C2": "H2C", "O1S": "H2S",
}


@pytest.mark.parametrize(("code", "model"), list(_CODES.items()))
def test_a_model_code_has_its_models_capabilities(code: str, model: str) -> None:
    """BamBuddy may store a printer under its code: it has what the model has."""
    def capabilities(name: str) -> tuple:
        printer = _printer({"firmware_version": "01.09.00.00", "exhaust_fan_present": True}, name)
        return (printer.has_aux_fans(), printer.has_chamber_fan(), printer.has_exhaust_fan(), printer.stock_aux_fan(),
                printer.stock_chamber_fan(), printer.has_door(), printer.has_airduct(), printer.has_ethernet(),
                printer.has_sd_card(), printer.stores_on_usb(), printer.is_a1_family(), detectors(printer))

    assert capabilities(code) == capabilities(model)



@pytest.mark.parametrize(
    ("model", "shown"),
    [("BL-P002", "X1"), ("O1S", "H2S"), ("C12", "P1S"), ("N7", "P2S"), ("X1C", "X1C"), ("", ""), ("Something", "Something")],
)
def test_a_model_code_shows_as_its_model(model: str, shown: str) -> None:
    """BamBuddy may store a printer under its model code: device names and models say the model."""
    assert display_model(model) == shown
    printer = {"id": 1, "name": "Lab", "model": model, "serial_number": "00W00A000000001"}
    assert printer_name(printer) == (f"Lab ({shown} / 00W00A000000001)" if shown else "Lab (00W00A000000001)")



@pytest.mark.parametrize(
    ("model", "enclosed"),
    [("X1C", True), ("P1S", True), ("H2D", True), ("P2S", True), ("A1", False), ("A1 Mini", False), ("A2L", False),
     ("P1P", False), ("C11", False), ("N1", False), ("", True)],
)
def test_which_printers_have_a_chamber(model: str, enclosed: bool) -> None:
    """The A1 series and the P1P are open frames; a printer of unknown model counts as enclosed."""
    assert _printer({}, model).enclosed() is enclosed


@pytest.mark.parametrize(
    ("model", "nozzle", "bed"),
    [
        ("A1 Mini", 300, 80),
        ("A2L", 300, 80),
        ("A1", 300, 100),
        ("P1P", 300, 100),
        ("C12", 300, 100),
        ("P2S", 300, 110),
        ("X1E", 320, 110),
        # 110 °C on 220 V, 120 °C on 110 V: the higher.
        ("X1C", 300, 120),
        ("X1", 300, 120),
        ("X2D", 300, 120),
        ("H2D", 350, 120),
        ("H2D Pro", 350, 120),
        ("H2C", 350, 120),
        ("H2S", 350, 120),
        # A model nobody knows: BamBuddy's limits alone.
        ("", None, None),
        ("Z9", None, None),
    ],
)
def test_every_model_heats_as_far_as_it_can(model: str, nozzle: int | None, bed: int | None) -> None:
    assert (heater_max(model, "nozzle"), heater_max(model, "bed")) == (nozzle, bed)


@pytest.mark.parametrize(
    ("value", "ten"),
    [(0, 0), (4, 0), (5, 10), (7, 10), (13, 10), (47, 50), (53, 50), (55, 60), (93, 90), (95, 100), (100, 100), (104, 100), (-3, 0)],
)
def test_round_ten(value: float, ten: int) -> None:
    """The printer reports its fans in fifteenths; BamBuddy makes percent of
    them (level 7 = 47 %, 8 = 53 %), Bambu's apps set and show tens."""
    assert round_ten(value) == ten


@pytest.mark.parametrize(("model", "swapped"), [("X2D", True), ("N6", True), ("P2S", False), ("H2D", False), ("X1C", False)])
def test_only_the_x2d_has_its_auxiliary_fans_the_other_way_round(model: str, swapped: bool) -> None:
    """Fan 2 is the X2D's left one and fan 10 its right one; the P2S has them
    the other way round (Bambu Studio's N6.json and N7.json)."""
    assert _printer({}, model).swapped_aux_fans() is swapped


@pytest.mark.parametrize(
    ("model", "status", "heats"),
    [
        # Where BamBuddy reports a heater: its target.
        ("H2D", {"supports_chamber_heater": True, "temperatures": {"chamber_target": 40}, "airduct_mode": 0}, True),
        ("H2D", {"supports_chamber_heater": True, "temperatures": {"chamber_target": 0}, "airduct_mode": 1}, False),
        # Where it reports none (the P2S): the airduct on heating keeps the warmth.
        ("P2S", {"supports_chamber_heater": False, "airduct_mode": 1}, True),
        ("P2S", {"supports_chamber_heater": False, "airduct_mode": 0}, False),
        ("X1C", {"supports_chamber_heater": False, "airduct_mode": 1}, False),
    ],
)
def test_chamber_heats(model: str, status: dict[str, Any], heats: bool) -> None:
    assert chamber_heats(_printer(status, model)) is heats


@pytest.mark.parametrize(
    ("model", "status", "on"),
    [
        ("H2D", {"airduct_mode": 0, "big_fan2_speed": 7}, True),
        ("H2D", {"airduct_mode": 0, "big_fan2_speed": 0}, False),
        ("H2D", {"airduct_mode": 1, "big_fan2_speed": 60}, False),
        # The X2D's fan 10 in whole percent: 3 % reads as 0.
        ("X2D", {"airduct_mode": 0, "left_aux_fan_speed": 3, "big_fan2_speed": 0}, False),
        ("P2S", {"airduct_mode": 0, "big_fan1_speed": 53}, True),
        ("X1C", {"airduct_mode": 0, "big_fan2_speed": 60}, False),
    ],
)
def test_ventilating(model: str, status: dict[str, Any], on: bool) -> None:
    assert ventilating(_printer(status, model)) is on


@pytest.mark.parametrize(
    ("tray", "name"),
    [
        ({"tray_type": "PLA", "tray_info_idx": "GFA00", "tray_sub_brands": ""}, "PLA Basic"),
        ({"tray_type": "PLA", "tray_info_idx": "GFL99", "tray_sub_brands": ""}, "Generic PLA"),
        ({"tray_type": "PLA", "tray_info_idx": "GFSNL03", "tray_sub_brands": ""}, "SUNLU PLA+"),
        # BamBuddy's misreading of a cloud preset, a user's own: as today.
        ({"tray_type": "PLA", "tray_info_idx": "GFNLS03", "tray_sub_brands": ""}, "PLA"),
        ({"tray_type": "PLA", "tray_info_idx": "P4d64437", "tray_sub_brands": "My PLA"}, "My PLA"),
        # A chip names its spool.
        ({"tray_type": "PLA", "tray_info_idx": "GFA00", "tray_sub_brands": "PLA Matte", "tag_uid": "AB12"}, "PLA Matte"),
    ],
)
def test_a_slot_is_named_by_its_profile(tray: dict[str, Any], name: str) -> None:
    assert tray_label(tray) == name
