"""The config flow and the options flow, every path through them."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker

from custom_components.bambuddy.api import BamBuddyApiError, BamBuddyAuthError
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import PRINTER_NAME, load_fixture

BAMBUDDY = "http://bambuddy.local:8000"
USER_INPUT = {"host": "bambuddy.local", "port": 8000, "api_key": "test-key"}
_PRINTERS = {printer["id"]: printer for printer in load_fixture("printers.json")}
_FIRST = {"printer_id": 1, "printer_name": PRINTER_NAME}
_SECOND = {"printer_id": 2, "printer_name": "A1 mini (0309CA000000002)"}


def _choices(result: Any) -> dict[int, str]:
    """The choices of the form's printer field: printer ID -> label."""
    [choices] = [
        validator.container
        for field, validator in result["data_schema"].schema.items()
        if field == "printer_id"
    ]
    return dict(choices)


async def _options_step(hass: HomeAssistant, entry: MockConfigEntry, step: str) -> Any:
    """Configure, and the menu's `step`."""
    result = await hass.config_entries.options.async_init(entry.entry_id)
    return await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": step}
    )


async def test_setup_creates_the_entry(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """A BamBuddy that answers: the entry is created, with BamBuddy's version."""
    aioclient_mock.get(f"{BAMBUDDY}/health", json={"status": "healthy"})
    aioclient_mock.get(f"{BAMBUDDY}/api/v1/system/info", json={"app": {"version": "1.2.5.7"}})

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    with patch("custom_components.bambuddy.async_setup_entry", return_value=True):
        result = await hass.config_entries.flow.async_configure(result["flow_id"], USER_INPUT)
        await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "BamBuddy (bambuddy.local)"
    assert result["data"] == {
        "host": "bambuddy.local",
        "port": 8000,
        "api_key": "test-key",
        "version": "1.2.5.7",
    }
    assert result["result"].unique_id == "bambuddy_bambuddy.local_8000"


async def test_unreachable_bambuddy_shows_cannot_connect(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """A BamBuddy that does not answer: the form stays open and says so,
    and the setup goes on once it answers."""
    aioclient_mock.get(f"{BAMBUDDY}/health", exc=asyncio.TimeoutError())

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(result["flow_id"], USER_INPUT)

    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"
    assert result["errors"] == {"base": "cannot_connect"}

    aioclient_mock.clear_requests()
    aioclient_mock.get(f"{BAMBUDDY}/health", json={"status": "healthy"})
    aioclient_mock.get(f"{BAMBUDDY}/api/v1/system/info", json={"app": {"version": "1.2.5.7"}})
    with patch("custom_components.bambuddy.async_setup_entry", return_value=True):
        result = await hass.config_entries.flow.async_configure(result["flow_id"], USER_INPUT)
        await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY


async def test_a_rejected_key_shows_invalid_auth_then_finishes(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """A wrong key, or one without "Read Status": BamBuddy answers 401 or
    403 to the first request that needs the key."""
    bambuddy_api.get_system_info.side_effect = BamBuddyAuthError("Invalid API key")

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(result["flow_id"], USER_INPUT)

    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "invalid_auth"}

    bambuddy_api.get_system_info.side_effect = None
    with patch("custom_components.bambuddy.async_setup_entry", return_value=True):
        result = await hass.config_entries.flow.async_configure(result["flow_id"], USER_INPUT)
        await hass.async_block_till_done()
    assert result["type"] is FlowResultType.CREATE_ENTRY


async def test_the_same_instance_twice_aborts(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(result["flow_id"], USER_INPUT)

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_the_menu_offers_removal_only_with_printers(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    result = await hass.config_entries.options.async_init(config_entry.entry_id)
    assert result["type"] is FlowResultType.MENU
    assert result["menu_options"] == ["add_printer", "remove_printer"]

    hass.config_entries.async_update_entry(config_entry, options={"printers": []})
    result = await hass.config_entries.options.async_init(config_entry.entry_id)
    assert result["menu_options"] == ["add_printer"]


async def test_adding_offers_the_printers_not_added_yet(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    """Each printer by BamBuddy's name for it, its model -- unless the name
    is the model -- and its serial number."""
    result = await _options_step(hass, config_entry, "add_printer")
    assert result["type"] is FlowResultType.FORM
    assert _choices(result) == {2: "A1 mini · 0309CA000000002"}

    hass.config_entries.async_update_entry(config_entry, options={"printers": []})
    result = await _options_step(hass, config_entry, "add_printer")
    assert _choices(result) == {
        1: "Workshop (X1C) · 00M00A000000001",
        2: "A1 mini · 0309CA000000002",
    }


async def test_adding_a_printer_stores_its_model_and_serial(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    """Stored as "<model> (<serial>)", the name its device shows."""
    bambuddy_api.get_printer.side_effect = lambda printer_id: _PRINTERS[printer_id]
    result = await _options_step(hass, config_entry, "add_printer")

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"printer_id": 2}
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert config_entry.options == {"printers": [_FIRST, _SECOND]}


async def test_listing_the_printers_fails_with_cannot_connect(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    bambuddy_api.get_printers.side_effect = BamBuddyApiError("down")

    result = await _options_step(hass, config_entry, "add_printer")

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "cannot_connect"


async def test_reading_the_chosen_printer_fails_then_finishes(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    bambuddy_api.get_printer.side_effect = BamBuddyApiError("down")
    result = await _options_step(hass, config_entry, "add_printer")

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"printer_id": 2}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "cannot_connect"}

    bambuddy_api.get_printer.side_effect = lambda printer_id: _PRINTERS[printer_id]
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"printer_id": 2}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert config_entry.options == {"printers": [_FIRST, _SECOND]}


async def test_all_printers_added_aborts(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    hass.config_entries.async_update_entry(config_entry, options={"printers": [_FIRST, _SECOND]})

    result = await _options_step(hass, config_entry, "add_printer")

    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "all_printers_added"


async def test_removing_a_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    result = await _options_step(hass, config_entry, "remove_printer")
    assert result["type"] is FlowResultType.FORM
    assert _choices(result) == {1: PRINTER_NAME}

    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"printer_id": 1}
    )

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert config_entry.options == {"printers": []}
