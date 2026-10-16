"""Verify the test harness itself works: the dialog text check, and the
fixtures that stand in for BamBuddy's answers."""
from __future__ import annotations

from pathlib import Path
import re
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
import pytest

from tests.conftest import flow_text_problems, load_fixture

_INTEGRATION = Path(__file__).parent.parent / "custom_components" / "bambuddy"

# The texts of a made-up flow, for the check every flow test runs through
# (tests/conftest.py, check_flow_texts).
_FLOW_TEXTS = {
    "step": {
        "form": {
            "title": "Form",
            "description": "Pick {thing}.",
            "data_description": {"field": "About {hint}."},
        },
        "menu": {
            "title": "Menu",
            "description": "Choose for {name}.",
            "menu_options": {"yes": "Yes", "no": "No"},
        },
        "button": {
            "title": "Button",
            "description": "Go on.",
            "menu_options": {"go": "Go to {target}"},
        },
    },
    "error": {"bad": "Bad: {why}."},
    "abort": {"done": "Done at {when}."},
}


def test_the_flow_text_check_accepts_complete_texts():
    shown = [
        {"type": FlowResultType.FORM, "step_id": "form", "errors": {"base": "bad"},
         "description_placeholders": {"thing": "x", "hint": "y", "why": "z"}},
        {"type": FlowResultType.MENU, "step_id": "menu", "menu_options": ["yes", "no"],
         "description_placeholders": {"name": "n"}},
        {"type": FlowResultType.MENU, "step_id": "button", "menu_options": ["go"],
         "description_placeholders": {"target": "t"}},
        {"type": FlowResultType.ABORT, "reason": "done",
         "description_placeholders": {"when": "now"}},
    ]
    assert [flow_text_problems(_FLOW_TEXTS, result) for result in shown] == [[], [], [], []]


@pytest.mark.parametrize(
    ("result", "problems"),
    [
        ({"type": FlowResultType.FORM, "step_id": "gone"}, [("no step texts", "gone")]),
        (
            {"type": FlowResultType.MENU, "step_id": "gone", "menu_options": ["no"]},
            [("no step texts", "gone")],
        ),
        (
            {"type": FlowResultType.FORM, "step_id": "form", "errors": {"base": "worse"},
             "description_placeholders": {"thing": "x", "hint": "y"}},
            [("no error text", "form", "worse")],
        ),
        (
            {"type": FlowResultType.MENU, "step_id": "menu", "menu_options": ["yes", "maybe"],
             "description_placeholders": {"name": "n"}},
            [("no menu option text", "menu", "maybe")],
        ),
        ({"type": FlowResultType.ABORT, "reason": "left"}, [("no abort text", "left")]),
        (
            {"type": FlowResultType.FORM, "step_id": "form",
             "description_placeholders": {"thing": "x"}},
            [("placeholder not supplied", "form", frozenset({"hint"}))],
        ),
        (
            {"type": FlowResultType.MENU, "step_id": "menu", "menu_options": ["no"]},
            [("placeholder not supplied", "menu", frozenset({"name"}))],
        ),
        # The frontend fills the placeholders into a button's label too.
        (
            {"type": FlowResultType.MENU, "step_id": "button", "menu_options": ["go"]},
            [("placeholder not supplied", "button", frozenset({"target"}))],
        ),
    ],
    ids=[
        "form_without_texts", "menu_without_texts", "error_without_text",
        "button_without_label", "abort_without_text", "form_placeholder",
        "menu_placeholder", "button_placeholder",
    ],
)
def test_the_flow_text_check_reports_what_a_shown_text_lacks(result, problems):
    assert flow_text_problems(_FLOW_TEXTS, result) == problems


# Every field of BamBuddy's answers the integration reads, by fixture: the
# integration's modules read these and nothing else. Names checked against
# BamBuddy 1.2.5.7's code (backend/app/schemas/printer.py, archive.py;
# backend/app/api/routes/system.py, updates.py, firmware.py).
_STATUS = [
    "connected",
    "state",
    "current_print",
    "subtask_name",
    "gcode_file",
    "progress",
    "remaining_time",
    "layer_num",
    "total_layers",
    "temperatures",
    "temperatures.nozzle",
    "temperatures.bed",
    "cover_url",
    "hms_errors",
    "ams",
    "vt_tray",
    "sdcard",
    "timelapse",
    "wifi_signal",
    "wired_network",
    "door_open",
    "nozzles",
    "print_options",
    "stg_cur",
    "stg_cur_name",
    "airduct_mode",
    "speed_level",
    "chamber_light",
    "active_extruder",
    "ams_extruder_map",
    "extruder_slots",
    "tray_now",
    "ams_status_main",
    "ams_status_sub",
    "printable_objects_count",
    "cooling_fan_speed",
    "big_fan1_speed",
    "big_fan2_speed",
    "heatbreak_fan_speed",
    "left_aux_fan_speed",
    "firmware_version",
    "developer_mode",
    "ams_filament_backup",
    "awaiting_plate_clear",
    "supports_drying",
    "supports_chamber_heater",
]
_READ = {
    "system_info.json": [
        "app.version",
        "printers.total",
        "printers.connected",
        "storage.disk_free_bytes",
        "storage.disk_percent_used",
    ],
    "archives_stats.json": [
        "total_prints",
        "successful_prints",
        "failed_prints",
        "cancelled_prints",
        "total_print_time_hours",
        "total_filament_grams",
    ],
    "update_check.json": ["current_version", "latest_version", "release_url", "release_notes"],
    "auth_status.json": ["auth_enabled"],
    "auth_me_control.json": ["permissions"],
    "status_x1c.json": [*_STATUS, "temperatures.chamber", "temperatures.nozzle_target", "temperatures.bed_target"],
    "status_h2d.json": [*_STATUS, "temperatures.nozzle_2", "temperatures.nozzle_2_target", "temperatures.chamber_target"],
}
# The fields of each printer in GET /printers/, which setup and the flows read.
_READ_PER_PRINTER = ["id", "name", "model", "serial_number", "ip_address", "nozzle_count"]
# The fields of an AMS unit and of a tray.
_READ_PER_AMS = ["id", "humidity", "temp", "tray", "serial_number", "sw_ver", "dry_time", "module_type"]
_READ_PER_TRAY = [
    "id",
    "tray_color",
    "tray_type",
    "tray_sub_brands",
    "remain",
    "nozzle_temp_min",
    "nozzle_temp_max",
    "exists",
]


def _missing(data: Any, path: str) -> bool:
    """Whether the dotted `path` does not lead to a key in `data`."""
    for key in path.split("."):
        if not isinstance(data, dict) or key not in data:
            return True
        data = data[key]
    return False


def test_the_fixtures_carry_every_field_the_integration_reads():
    missing = [
        (name, path)
        for name, paths in _READ.items()
        for path in paths
        if _missing(load_fixture(name), path)
    ]
    missing += [
        ("printers.json", printer.get("id"), field)
        for printer in load_fixture("printers.json")
        for field in _READ_PER_PRINTER
        if field not in printer
    ]
    for name in ("status_x1c.json", "status_a1mini.json", "status_p1s.json", "status_h2d.json"):
        for unit in load_fixture(name)["ams"]:
            missing += [(name, "ams", field) for field in _READ_PER_AMS if field not in unit]
            missing += [(name, "tray", field) for tray in unit["tray"] for field in _READ_PER_TRAY if field not in tray]
    missing += [
        ("firmware_updates.json", field)
        for field in ("printer_id", "current_version", "latest_version", "release_notes")
        if field not in load_fixture("firmware_updates.json")["updates"][0]
    ]
    assert missing == []


def test_the_list_names_every_status_field_the_code_reads():
    """The claim above, kept true: every field of the printer status the
    integration's modules read is in `_STATUS`, so the fixtures carry it
    under BamBuddy's name."""
    modules = {module.name: module.read_text(encoding="utf-8") for module in _INTEGRATION.glob("*.py")}
    code = "\n".join(modules.values())
    # Read directly, through the sensors' and binary sensors' helpers, and as the fans' fields.
    read = set(re.findall(r'(?:status(?:\.get\(|\[)|_status\(|_text\(|_flag\()"([a-z0-9_]+)"', code))
    read |= set(re.findall(r'field="([a-z0-9_]+)"', modules["fan.py"]))
    # The temperatures: the temperature sensors, the numbers' setpoints.
    temperatures = set(re.findall(r'temperatures\.get\("([a-z0-9_]+)"', code))
    temperatures |= set(re.findall(r'_temperature_sensor\(\s*"[^"]+",\s*"[^"]+",\s*"([a-z0-9_]+)"', modules["sensor.py"]))
    temperatures |= set(re.findall(r'field="([a-z0-9_]+)"', modules["number.py"]))
    listed = {path for paths in _READ.values() for path in paths}
    assert read and temperatures
    assert read - {path.split(".")[0] for path in _STATUS} == set()
    assert {f"temperatures.{name}" for name in temperatures} - listed == set()


@pytest.mark.parametrize(
    "name", ["status_a1mini.json", "status_p1s.json", "status_h2d.json", "status_offline.json", "status_never.json"]
)
def test_every_status_carries_the_same_fields(name: str) -> None:
    """BamBuddy answers every printer with the same schema -- one it never
    reached with every field at its default."""
    assert list(load_fixture(name)) == list(load_fixture("status_x1c.json"))


def test_the_printer_bambuddy_never_reached():
    never = load_fixture("status_never.json")
    assert (never["connected"], never["temperatures"], never["nozzles"]) == (False, None, [])


async def test_home_assistant_fixture_starts(hass: HomeAssistant) -> None:
    assert hass.config.config_dir is not None
