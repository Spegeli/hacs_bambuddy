"""Shared fixtures for the BamBuddy tests.

BamBuddy's answers come from tests/fixtures/, one file per answer. The field
names are BamBuddy's own; the values are invented -- addresses from the
documentation range 192.0.2.0/24, made-up serial numbers.
"""
from __future__ import annotations

from collections.abc import Iterator, Mapping
import json
from pathlib import Path
import string
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

from homeassistant.config_entries import (
    ConfigEntriesFlowManager,
    ConfigEntryState,
    OptionsFlowManager,
)
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowManager, FlowResultType
from homeassistant.helpers import entity_registry as er
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.bambuddy.api import BamBuddyClient
from custom_components.bambuddy.const import DOMAIN

HOST = "bambuddy.local"
PORT = 8000
API_KEY = "test-key"
PRINTER_ID = 1
PRINTER_NAME = "X1C (00M00A000000001)"
STREAM_TOKEN = "stream-token-123"

_FIXTURES = Path(__file__).parent / "fixtures"
_INTEGRATION = Path(__file__).parent.parent / "custom_components" / "bambuddy"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Let Home Assistant load custom_components/bambuddy in every test."""


def load_fixture(name: str) -> Any:
    """One of BamBuddy's answers, as tests/fixtures/ holds it."""
    return json.loads((_FIXTURES / name).read_text(encoding="utf-8"))


# The methods of BamBuddyClient that send a request to BamBuddy and only
# report success: the print controls and the like.
_ACTIONS = (
    "set_print_speed",
    "clear_hms_errors",
    "clear_plate",
    "refresh_printer_status",
    "pause_print",
    "resume_print",
    "stop_print",
    "set_chamber_light",
)


@pytest.fixture
def bambuddy_api() -> Iterator[SimpleNamespace]:
    """BamBuddyClient's requests, answered from the fixtures without a
    network: one AsyncMock per method that talks to BamBuddy. The mocks
    replace the methods on the class, so a call carries no `self`:
    `assert_awaited_once_with(PRINTER_ID, ...)`. A test changes an answer,
    or makes a method raise, through its mock."""
    mocks = {
        "get_health": AsyncMock(return_value=load_fixture("health.json")),
        "get_system_info": AsyncMock(return_value=load_fixture("system_info.json")),
        "get_statistics": AsyncMock(return_value=load_fixture("archives_stats.json")),
        "get_printers": AsyncMock(return_value=load_fixture("printers.json")),
        "get_printer": AsyncMock(return_value=load_fixture("printer.json")),
        "get_printer_status": AsyncMock(return_value=load_fixture("printer_status.json")),
        "get_stream_token": AsyncMock(return_value=STREAM_TOKEN),
        **{name: AsyncMock(return_value={}) for name in _ACTIONS},
    }
    with patch.multiple(BamBuddyClient, **mocks):
        yield SimpleNamespace(**mocks)


@pytest.fixture
def config_entry(hass: HomeAssistant) -> MockConfigEntry:
    """A BamBuddy entry as the config flow creates it, with one printer
    added through Configure; added to Home Assistant, not set up."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title=f"BamBuddy ({HOST})",
        data={"host": HOST, "port": PORT, "api_key": API_KEY, "version": "0.2.4.5"},
        options={"printers": [{"printer_id": PRINTER_ID, "printer_name": PRINTER_NAME}]},
        unique_id=f"bambuddy_{HOST}_{PORT}",
    )
    entry.add_to_hass(hass)
    return entry


async def setup_integration(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    """Set `entry` up and wait until it is loaded."""
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED


def entity_id(hass: HomeAssistant, platform: str, unique_id: str) -> str:
    """The entity ID Home Assistant gave the entity `unique_id` of
    `platform` -- looked up, never spelled: today's entity IDs come from
    the English names, which the feature work may change."""
    found = er.async_get(hass).async_get_entity_id(platform, DOMAIN, unique_id)
    assert found is not None, (platform, unique_id)
    return found


def printer_uid(entry: MockConfigEntry, key: str, printer_id: int = PRINTER_ID) -> str:
    """The unique ID of a printer's entity `key`."""
    return f"{entry.entry_id}_p{printer_id}_{key}"


def instance_uid(entry: MockConfigEntry, key: str) -> str:
    """The unique ID of the instance's sensor `key`."""
    return f"{entry.entry_id}_{key}"


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
