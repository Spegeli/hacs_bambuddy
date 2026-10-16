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
    ams_model,
    ams_name,
    ams_number,
    detectors,
    find_tray,
    nozzle_type,
    printer_name,
    print_stage,
    print_status,
    short_name,
    slot_attributes,
    slot_state,
    tray_id,
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
        ({"stg_cur": 0, "stg_cur_name": "Printing"}, "printing"),
        ({"stg_cur": 2, "stg_cur_name": "Heatbed preheating"}, "heatbed_preheating"),
        ({"stg_cur": 16, "stg_cur_name": "Paused by the user"}, "paused_by_user"),
        ({"stg_cur": 77, "stg_cur_name": "Preparing AMS"}, "preparing_ams"),
        # Idle: BamBuddy names no stage.
        ({"stg_cur": -1, "stg_cur_name": None}, "idle"),
        ({"stg_cur": 255, "stg_cur_name": None}, "idle"),
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
    ],
)
def test_ams_model(unit: dict[str, Any], model: str, expected: str) -> None:
    assert ams_model(unit, _printer({}, model)) == expected


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
        ({**_TRAY, "exists": False}, "empty"),
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
        "remaining": 85,
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


def test_an_unknown_remaining_amount_is_none() -> None:
    """BamBuddy says -1 for spools without an RFID estimate."""
    assert slot_attributes({**_TRAY, "remain": -1}, 2, 1, None)["remaining"] is None


def test_an_empty_slot_tells_no_filament() -> None:
    attributes = slot_attributes({"id": 0, "tray_color": "000000FF", "exists": False}, 1, 0, 5)
    assert attributes["empty"] is True
    assert attributes["present"] is False
    assert attributes["color"] is None
    assert attributes["active"] is False


@pytest.mark.parametrize(("tray_now", "expected"), [(255, None), (None, None), (5, 5), (254, 254)])
def test_active_tray(tray_now: int | None, expected: int | None) -> None:
    assert active_tray({"tray_now": tray_now}) == expected


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
    ("model", "aux", "door", "airduct", "ethernet", "sd", "exhaust"),
    [
        ("X1C", True, True, False, True, True, False),
        ("A1 Mini", False, False, False, False, False, False),
        ("a1", False, False, False, False, False, False),
        ("P1S", True, False, False, True, True, False),
        ("H2D", True, True, True, True, True, False),
        ("P2S", True, True, True, True, True, True),
        # An unknown model: only what every printer has.
        ("", False, False, False, False, False, False),
    ],
)
def test_model_capabilities(
    model: str, aux: bool, door: bool, airduct: bool, ethernet: bool, sd: bool, exhaust: bool
) -> None:
    printer = _printer({}, model)
    assert (
        printer.has_aux_fans(),
        printer.has_door(),
        printer.has_airduct(),
        printer.has_ethernet(),
        printer.has_sd_card(),
        printer.has_exhaust_fan(),
    ) == (aux, door, airduct, ethernet, sd, exhaust)


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


def test_a_spool_nobody_described_is_there() -> None:
    """A spool without a chip, just put in: empty of information, but
    present -- the printer now asks what it holds."""
    attributes = slot_attributes({"id": 2, "tray_type": "", "tray_sub_brands": "", "exists": True}, 3, 2, None)
    assert (attributes["empty"], attributes["present"]) == (True, True)


def test_the_names_trim_bambuddys_blanks() -> None:
    printer = {"id": 1, "name": " Lab ", "model": "X1C", "serial_number": "00M00A000000001"}
    assert (printer_name(printer), short_name(printer)) == ("Lab (X1C / 00M00A000000001)", "Lab")


@pytest.mark.parametrize(
    ("unit_id", "model", "serial", "name"),
    [
        (0, "AMS 2 Pro", "19C06A000000001", "Studio AMS A (AMS 2 Pro / 19C06A000000001)"),
        (1, "AMS 2 Pro", "19C06A000000003", "Studio AMS B (AMS 2 Pro / 19C06A000000003)"),
        (128, "AMS HT", "19F06A000000002", "Studio AMS HT A (AMS HT / 19F06A000000002)"),
        (129, "AMS HT", "", "Studio AMS HT B (AMS HT)"),
        # An A2L's AMS Lite: BamBuddy's unit 6.
        (6, "AMS Lite", "", "Studio AMS A (AMS Lite)"),
    ],
)
def test_ams_names(unit_id: int, model: str, serial: str, name: str) -> None:
    """After the printer, lettered as Bambu Lab and BamBuddy do."""
    assert ams_name({"id": 4, "name": "Studio", "model": "H2D"}, unit_id, model, serial) == name

