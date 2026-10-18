"""Shared fixtures for the BamBuddy tests.

BamBuddy's answers come from tests/fixtures/, one file per answer, built
from the shapes BamBuddy 1.2.5.7 returns. The field names are BamBuddy's own;
the values are invented -- addresses from the documentation range
192.0.2.0/24, made-up serial numbers. Five printers: an X1C printing with an
AMS (1), an A1 Mini idle with an AMS Lite (2), a P1S paused with HMS errors
(3), an H2D with two nozzles, an AMS 2 Pro and an AMS HT (4), and an X1E
BamBuddy never reached (5).
"""
from __future__ import annotations

from collections.abc import Iterator, Mapping
import copy
from datetime import timedelta
import json
from pathlib import Path
import string
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

from freezegun.api import FrozenDateTimeFactory
from homeassistant.config_entries import (
    ConfigEntriesFlowManager,
    ConfigEntryState,
    OptionsFlowManager,
)
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowManager, FlowResultType
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.bambuddy.api import BamBuddyClient
from custom_components.bambuddy.const import DOMAIN

URL = "http://bambuddy.local:8000"
API_KEY = "bb_test_key"
STREAM_TOKEN = "stream-token-123"

X1C, A1_MINI, P1S, H2D, X1E = 1, 2, 3, 4, 5
_STATUSES = {
    X1C: "status_x1c.json",
    A1_MINI: "status_a1mini.json",
    P1S: "status_p1s.json",
    H2D: "status_h2d.json",
    X1E: "status_never.json",
}

_FIXTURES = Path(__file__).parent / "fixtures"
_INTEGRATION = Path(__file__).parent.parent / "custom_components" / "bambuddy"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Let Home Assistant load custom_components/bambuddy in every test."""


def load_fixture(name: str) -> Any:
    """One of BamBuddy's answers, as tests/fixtures/ holds it."""
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


def printer_serial(printer_id: int) -> str:
    """A printer's serial number, as BamBuddy lists it."""
    printer = next(p for p in load_fixture("printers.json") if p["id"] == printer_id)
    return str(printer.get("serial_number") or "")


def printer_key(printer_id: int) -> str:
    """What the integration knows a printer by: its serial number."""
    return printer_serial(printer_id) or f"id{printer_id}"


def ams_key(printer_id: int, ams_id: int) -> str:
    """What the integration knows an AMS unit by: its serial number, else
    its place."""
    units = load_fixture(_STATUSES[printer_id]).get("ams") or []
    unit = next((u for u in units if u["id"] == ams_id), {})
    return str(unit.get("serial_number") or ams_id)


def printer_entry(printer_id: int) -> dict[str, Any]:
    """A printer as the entry's options store it."""
    return {"printer_id": printer_id, "printer_name": printer_name(printer_id), "serial_number": printer_serial(printer_id)}


def printer_name(printer_id: int) -> str:
    """The device name a printer gets: its name in BamBuddy, then model and
    serial."""
    printer = next(p for p in load_fixture("printers.json") if p["id"] == printer_id)
    return f"{printer['name']} ({printer['model']} / {printer['serial_number']})"


# The methods of BamBuddyClient that send a command and only report success.
CONTROLS = (
    "execute_hms_action",
    "pause",
    "resume",
    "stop",
    "set_print_speed",
    "set_chamber_light",
    "set_nozzle_temperature",
    "set_bed_temperature",
    "set_chamber_temperature",
    "set_fan_speed",
    "set_airduct_mode",
    "jog_xy",
    "jog_z",
    "jog_extruder",
    "home_axes",
    "clear_hms",
    "clear_plate",
    "refresh_status",
    "load_filament",
    "unload_filament",
    "start_drying",
    "stop_drying",
    "select_extruder",
    "set_ams_backup",
    "configure_slot",
    "reset_slot",
    "refresh_rfid",
    "set_print_option",
    "skip_objects",
    "perform_maintenance",
    "control_plug",
)


@pytest.fixture
def bambuddy_api() -> Iterator[SimpleNamespace]:
    """BamBuddyClient's requests, answered from the fixtures without a
    network: one AsyncMock per method that talks to BamBuddy. The mocks
    replace the methods on the class, so a call carries no `self`:
    `assert_awaited_once_with(X1C, ...)`. A test changes a printer's status
    through `statuses` (read again on every refresh), any other answer
    through its mock."""
    statuses = {printer_id: load_fixture(name) for printer_id, name in _STATUSES.items()}
    # Every printer the X1C's tasks, under its own number.
    maintenance = {printer_id: {**load_fixture("maintenance_x1c.json"), "printer_id": printer_id} for printer_id in _STATUSES}
    # Each plug's status, by its number as text (read again on every refresh).
    plug_statuses: dict[str, Any] = load_fixture("plug_statuses.json")
    mocks = {
        "get_version": AsyncMock(return_value="1.2.5.7"),
        "get_auth_status": AsyncMock(return_value=load_fixture("auth_status.json")),
        "get_auth_me": AsyncMock(return_value=load_fixture("auth_me_control.json")),
        "get_system_info": AsyncMock(return_value=load_fixture("system_info.json")),
        "get_statistics": AsyncMock(return_value=load_fixture("archives_stats.json")),
        "get_update_check": AsyncMock(return_value=load_fixture("update_check.json")),
        "get_firmware_updates": AsyncMock(return_value=load_fixture("firmware_updates.json")),
        "get_printers": AsyncMock(return_value=load_fixture("printers.json")),
        "get_printer": AsyncMock(
            side_effect=lambda printer_id: next(p for p in load_fixture("printers.json") if p["id"] == printer_id)
        ),
        "get_status": AsyncMock(side_effect=lambda printer_id: copy.deepcopy(statuses[printer_id])),
        "get_stream_token": AsyncMock(return_value=STREAM_TOKEN),
        # Nobody else watches: BamBuddy ends the camera connection.
        "stop_camera": AsyncMock(return_value=True),
        "get_snapshot": AsyncMock(return_value=b"jpeg"),
        "get_cover": AsyncMock(return_value=b"png"),
        "get_print_objects": AsyncMock(return_value=load_fixture("print_objects.json")),
        "get_runtime": AsyncMock(return_value={"runtime_hours": 547.5, "print_hours_offset": 12.0, "total_hours": 559.5}),
        "get_maintenance": AsyncMock(
            side_effect=lambda printer_id: copy.deepcopy(
                maintenance.setdefault(printer_id, {**load_fixture("maintenance_x1c.json"), "printer_id": printer_id})
            )
        ),
        "get_diagnostic": AsyncMock(return_value=load_fixture("diagnostic_offline.json")),
        "get_kprofiles": AsyncMock(return_value=load_fixture("kprofiles.json")),
        # No smart plugs unless a test gives BamBuddy some (`with_plugs`).
        "get_smart_plugs": AsyncMock(return_value=[]),
        "get_plug_status": AsyncMock(side_effect=lambda plug_id, patient=True: copy.deepcopy(plug_statuses[str(plug_id)])),
        **{name: AsyncMock(return_value=None) for name in CONTROLS},
    }
    with patch.multiple(BamBuddyClient, **mocks):
        yield SimpleNamespace(statuses=statuses, maintenance=maintenance, plug_statuses=plug_statuses, **mocks)


def make_entry(hass: HomeAssistant, *printer_ids: int) -> MockConfigEntry:
    """A BamBuddy entry as the config flow creates it, with these printers;
    added to Home Assistant, not set up."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="BamBuddy (bambuddy.local)",
        data={"url": URL, "api_key": API_KEY, "verify_ssl": True},
        options={
            "printers": [printer_entry(printer_id) for printer_id in printer_ids]
        },
        unique_id=URL,
        version=2,
        minor_version=2,
    )
    entry.add_to_hass(hass)
    return entry


@pytest.fixture
def config_entry(hass: HomeAssistant) -> MockConfigEntry:
    """An entry with the printing X1C."""
    return make_entry(hass, X1C)


async def setup_integration(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    """Set `entry` up and wait until it is loaded."""
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED


async def set_up(hass: HomeAssistant, *printer_ids: int) -> MockConfigEntry:
    """An entry with these printers, set up and loaded."""
    entry = make_entry(hass, *printer_ids)
    await setup_integration(hass, entry)
    return entry


async def next_refresh(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    """Past the printers' next poll: a coordinator's next refresh comes 9 to
    10.5 seconds after the last."""
    freezer.tick(timedelta(seconds=11))
    async_fire_time_changed(hass)
    # The coordinators refresh in background tasks.
    await hass.async_block_till_done(wait_background_tasks=True)


def entity_id(hass: HomeAssistant, platform: str, unique_id: str) -> str:
    """The entity ID Home Assistant gave the entity `unique_id` of
    `platform` -- looked up, never spelled."""
    found = er.async_get(hass).async_get_entity_id(platform, DOMAIN, unique_id)
    assert found is not None, (platform, unique_id)
    return found


def no_entity(hass: HomeAssistant, platform: str, unique_id: str) -> bool:
    """Whether the entity `unique_id` of `platform` does not exist."""
    return er.async_get(hass).async_get_entity_id(platform, DOMAIN, unique_id) is None


def printer_uid(entry: MockConfigEntry, key: str, printer_id: int = X1C) -> str:
    """The unique ID of a printer's entity `key`."""
    return f"{entry.entry_id}_p{printer_key(printer_id)}_{key}"


def ams_uid(entry: MockConfigEntry, ams_id: int, key: str, printer_id: int = X1C) -> str:
    """The unique ID of an AMS unit's entity `key`."""
    return f"{entry.entry_id}_p{printer_key(printer_id)}_ams{ams_key(printer_id, ams_id)}_{key}"


def printer_device(entry: MockConfigEntry, printer_id: int) -> str:
    """BamBuddy's identifier of a printer's device."""
    return f"{entry.entry_id}_printer_{printer_key(printer_id)}"


def ams_device(entry: MockConfigEntry, printer_id: int, ams_id: int) -> str:
    """BamBuddy's identifier of an AMS unit's device."""
    return f"{printer_device(entry, printer_id)}_ams_{ams_key(printer_id, ams_id)}"


def instance_uid(entry: MockConfigEntry, key: str) -> str:
    """The unique ID of the instance's entity `key`."""
    return f"{entry.entry_id}_{key}"


def device_id(hass: HomeAssistant, entry: MockConfigEntry, identifier: str) -> str:
    """The registry ID of the entry's device with BamBuddy's `identifier`
    (async_get_device by identifiers is deprecated from 2026.8 on)."""
    for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id):
        if (DOMAIN, identifier) in device.identifiers:
            return device.id
    raise AssertionError(identifier)


def state_of(hass: HomeAssistant, platform: str, unique_id: str) -> Any:
    """The state object of an entity found by its unique ID."""
    state = hass.states.get(entity_id(hass, platform, unique_id))
    assert state is not None, unique_id
    return state


def _placeholders(template: str) -> frozenset[str]:
    """The {placeholders} of a text, parsed as Home Assistant parses them."""
    return frozenset(
        field for _, field, _, _ in string.Formatter().parse(template) if field is not None
    )


def flow_text_problems(texts: dict, result: Mapping[str, Any]) -> list[tuple]:
    """What the flow result `result` shows without a text, and every
    placeholder a text it shows uses that the code did not supply. `texts`
    are the flow's part of the English strings: `config` or `options`."""
    problems: list[tuple] = []
    shown: list[str] = []
    if result["type"] in (FlowResultType.FORM, FlowResultType.MENU):
        step = texts.get("step", {}).get(result["step_id"])
        if step is None:
            return [("no step texts", result["step_id"])]
        shown += [step.get("title", ""), step.get("description", "")]
    if result["type"] == FlowResultType.FORM:
        shown += step.get("data_description", {}).values()
        for part in step.get("sections", {}).values():
            shown += [part.get("description", ""), *part.get("data_description", {}).values()]
        for error in (result.get("errors") or {}).values():
            if error in texts.get("error", {}):
                shown.append(texts["error"][error])
            else:
                problems.append(("no error text", result["step_id"], error))
    elif result["type"] == FlowResultType.MENU:
        # The frontend fills the placeholders into the button labels too.
        labels = step.get("menu_options", {})
        for option in result["menu_options"]:
            if option in labels:
                shown.append(labels[option])
            else:
                problems.append(("no menu option text", result["step_id"], option))
    elif result["type"] == FlowResultType.ABORT:
        if result["reason"] in texts.get("abort", {}):
            shown.append(texts["abort"][result["reason"]])
        else:
            problems.append(("no abort text", result["reason"]))
    supplied = set(result.get("description_placeholders") or {})
    problems.extend(
        ("placeholder not supplied", result.get("step_id") or result["reason"], missing)
        for text in shown
        if (missing := _placeholders(text) - supplied)
    )
    return problems


@pytest.fixture(autouse=True)
def check_flow_texts() -> Iterator[None]:
    """Every form, menu and abort a BamBuddy flow shows has its texts, and
    every placeholder of a text it shows is supplied.

    Home Assistant core checks this with its check_translations fixture,
    which pytest-homeassistant-custom-component does not ship. Without the
    check, a dropped text or a renamed placeholder shows the user a raw key
    or a literal {placeholder}. Checked for the config and the options flow:
    the step's title and texts, a form's errors and sections, a menu's
    option labels, and the abort reason.
    Read from translations/en.json, which equals strings.json (test_strings).
    """
    english = json.loads(
        (_INTEGRATION / "translations" / "en.json").read_text(encoding="utf-8")
    )
    problems: list[tuple] = []
    original = FlowManager._async_handle_step

    def _texts(manager: FlowManager, flow: Any) -> dict | None:
        """The texts of the kind of flow `flow` is; None for a flow of
        another integration."""
        if isinstance(manager, OptionsFlowManager):
            entry = manager.hass.config_entries.async_get_entry(flow.handler)
            return english["options"] if entry and entry.domain == DOMAIN else None
        if isinstance(manager, ConfigEntriesFlowManager) and flow.handler == DOMAIN:
            return english["config"]
        return None

    async def _checked(self: FlowManager, flow: Any, *args: Any, **kwargs: Any) -> Any:
        result = await original(self, flow, *args, **kwargs)
        texts = _texts(self, flow)
        if texts is not None:
            problems.extend(flow_text_problems(texts, result))
        return result

    with patch.object(FlowManager, "_async_handle_step", _checked):
        yield
    assert problems == []
