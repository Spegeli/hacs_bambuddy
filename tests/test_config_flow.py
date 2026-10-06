"""Smoke tests of the setup flow: a BamBuddy that answers, and one that does not."""
from __future__ import annotations

import asyncio
from unittest.mock import patch

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker

from custom_components.bambuddy.const import DOMAIN

BAMBUDDY = "http://bambuddy.local:8000"
USER_INPUT = {"host": "bambuddy.local", "port": 8000, "api_key": "test-key"}


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
    """A BamBuddy that does not answer: the form stays open and says so."""
    aioclient_mock.get(f"{BAMBUDDY}/health", exc=asyncio.TimeoutError())

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(result["flow_id"], USER_INPUT)

    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"
    assert result["errors"] == {"base": "cannot_connect"}
