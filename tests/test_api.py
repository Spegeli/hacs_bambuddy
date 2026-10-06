"""The API client against an HTTP mock: the request each method sends, and
what becomes of BamBuddy's answer."""
from __future__ import annotations

import logging
from unittest.mock import Mock

import aiohttp
import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker

from custom_components.bambuddy.api import BamBuddyApiError, BamBuddyAuthError, BamBuddyClient

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


@pytest.mark.parametrize(
    ("call", "args", "verb", "url"),
    [
        ("get_system_info", (), "GET", f"{API}/system/info"),
        ("get_printers", (), "GET", f"{API}/printers/"),
        ("get_printer", (1,), "GET", f"{API}/printers/1"),
        ("get_printer_status", (1,), "GET", f"{API}/printers/1/status"),
        ("get_statistics", (), "GET", f"{API}/archives/stats"),
        ("set_print_speed", (1, 3), "POST", f"{API}/printers/1/print-speed?mode=3"),
        ("clear_hms_errors", (1,), "POST", f"{API}/printers/1/hms/clear"),
        ("clear_plate", (1,), "POST", f"{API}/printers/1/clear-plate"),
        ("refresh_printer_status", (1,), "POST", f"{API}/printers/1/refresh-status"),
        ("pause_print", (1,), "POST", f"{API}/printers/1/print/pause"),
        ("resume_print", (1,), "POST", f"{API}/printers/1/print/resume"),
        ("stop_print", (1,), "POST", f"{API}/printers/1/print/stop"),
    ],
)
async def test_each_request_reaches_its_path_with_the_key(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    call: str,
    args: tuple[int, ...],
    verb: str,
    url: str,
) -> None:
    """BamBuddy's routes and the key the scoped API keys are checked by."""
    answer = {"answer": call}
    aioclient_mock.request(verb, url, json=answer)

    assert await getattr(_client(hass), call)(*args) == answer

    [(method, called, _, headers)] = aioclient_mock.mock_calls
    assert (method, str(called)) == (verb, url)
    assert headers["X-API-Key"] == API_KEY


async def test_health_is_read_outside_the_api_without_the_key(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """/health lies outside /api/v1 and needs no key."""
    aioclient_mock.get(f"http://{HOST}:{PORT}/health", json={"status": "healthy"})

    assert await _client(hass).get_health() == {"status": "healthy"}

    [(method, called, _, headers)] = aioclient_mock.mock_calls
    assert (method, str(called)) == ("GET", f"http://{HOST}:{PORT}/health")
    assert "X-API-Key" not in (headers or {})


@pytest.mark.parametrize("status", [401, 403])
async def test_a_rejected_key_raises_the_auth_error(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, status: int
) -> None:
    """401: the key is wrong; 403: it lacks the permission. The config flow
    tells "invalid auth" from "cannot connect" by this error."""
    aioclient_mock.get(f"{API}/system/info", status=status)

    with pytest.raises(BamBuddyAuthError):
        await _client(hass).get_system_info()


@pytest.mark.parametrize("status", [404, 500])
async def test_an_error_status_raises_the_api_error(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, status: int
) -> None:
    aioclient_mock.get(f"{API}/system/info", status=status, text="failure")

    with pytest.raises(BamBuddyApiError) as raised:
        await _client(hass).get_system_info()
    assert not isinstance(raised.value, BamBuddyAuthError)


async def test_health_reports_an_error_status_as_the_api_error(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    aioclient_mock.get(f"http://{HOST}:{PORT}/health", status=500)

    with pytest.raises(BamBuddyApiError):
        await _client(hass).get_health()


@pytest.mark.parametrize(
    "error",
    [aiohttp.ClientConnectorError(Mock(), OSError("refused")), TimeoutError()],
    ids=["connection", "timeout"],
)
@pytest.mark.parametrize(
    ("call", "url"),
    [("get_system_info", f"{API}/system/info"), ("get_health", f"http://{HOST}:{PORT}/health")],
    ids=["api", "health"],
)
async def test_a_connection_error_or_timeout_raises_the_api_error(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    call: str,
    url: str,
    error: Exception,
) -> None:
    """A BamBuddy that is down or slow: the coordinators and the config flow
    catch this error, never aiohttp's own."""
    aioclient_mock.get(url, exc=error)

    with pytest.raises(BamBuddyApiError):
        await getattr(_client(hass), call)()


def test_the_camera_urls_carry_the_token() -> None:
    """The camera entity hands these to BamBuddy's camera proxy."""
    client = BamBuddyClient(HOST, PORT, API_KEY, Mock())

    assert client.snapshot_url(1, "tok") == f"{API}/printers/1/camera/snapshot?token=tok"
    assert client.stream_url(1, "tok") == f"{API}/printers/1/camera/stream?token=tok&fps=5"
