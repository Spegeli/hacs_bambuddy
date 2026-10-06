"""Verify the test harness itself works: the dialog text check, and the
fixtures that stand in for BamBuddy's answers."""
from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
import pytest

from tests.conftest import flow_text_problems, load_fixture

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
# BamBuddy's code (backend/app/schemas/printer.py, archive.py;
# backend/app/api/routes/system.py; /health in backend/app/main.py).
_READ = {
    "health.json": ["status"],
    "system_info.json": [
        "app.version",
        "system.uptime_seconds",
        "database.archives",
        "printers.total",
        "printers.connected",
        "storage.disk_free_bytes",
        "storage.disk_percent_used",
    ],
    "archives_stats.json": [
        "total_prints",
        "successful_prints",
        "failed_prints",
        "total_print_time_hours",
        "total_filament_grams",
    ],
    "printer.json": ["model", "serial_number", "ip_address"],
    "printer_status.json": [
        "connected",
        "state",
        "current_print",
        "subtask_name",
        "gcode_file",
        "progress",
        "remaining_time",
        "layer_num",
        "total_layers",
        "temperatures.nozzle",
        "temperatures.nozzle_target",
        "temperatures.bed",
        "temperatures.bed_target",
        "temperatures.chamber",
        "hms_errors",
        "sdcard",
        "wired_network",
        "developer_mode",
        "wifi_signal",
        "speed_level",
        "chamber_light",
        "printable_objects_count",
        "cooling_fan_speed",
        "big_fan1_speed",
        "big_fan2_speed",
        "heatbreak_fan_speed",
        "firmware_version",
    ],
}
# The fields of each printer in GET /printers/, which the options flow reads.
_READ_PER_PRINTER = ["id", "name", "model", "serial_number"]


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
    assert missing == []


def test_the_offline_status_carries_the_same_fields():
    """BamBuddy answers a printer it holds no live state for with the same
    schema, every field at its default."""
    offline = load_fixture("printer_status_offline.json")
    assert set(offline) == set(load_fixture("printer_status.json"))
    assert offline["connected"] is False
    assert offline["temperatures"] is None


async def test_home_assistant_fixture_starts(hass: HomeAssistant) -> None:
    assert hass.config.config_dir is not None
