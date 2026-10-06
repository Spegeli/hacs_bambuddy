"""The API client against an HTTP mock: the request each method sends, and
what becomes of BamBuddy's answer."""
from __future__ import annotations

import logging

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker

from custom_components.bambuddy.api import BamBuddyClient

from tests.conftest import API_KEY, HOST, PORT, STREAM_TOKEN

API = f"http://{HOST}:{PORT}/api/v1"


def _client(hass: HomeAssistant) -> BamBuddyClient:
    return BamBuddyClient(HOST, PORT, API_KEY, async_get_clientsession(hass))


async def test_the_stream_token_never_reaches_the_log(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, caplog: pytest.LogCaptureFixture
) -> None:
    """The token travels in the camera's snapshot and stream URLs: whoever
    reads the log could watch the printer."""
    caplog.set_level(logging.DEBUG, logger="custom_components.bambuddy")
    aioclient_mock.post(f"{API}/printers/camera/stream-token", json={"token": STREAM_TOKEN})

    assert await _client(hass).get_stream_token() == STREAM_TOKEN

    [(method, url, _, headers)] = aioclient_mock.mock_calls
    assert (method, str(url)) == ("POST", f"{API}/printers/camera/stream-token")
    assert headers["X-API-Key"] == API_KEY
    assert STREAM_TOKEN not in caplog.text
