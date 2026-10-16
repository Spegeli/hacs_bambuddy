"""The API client against an HTTP mock: the request each method sends, and
what becomes of BamBuddy's answer."""
from __future__ import annotations

import logging
from typing import Any
from unittest.mock import patch

import aiohttp
import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker

from custom_components.bambuddy.api import (
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyClient,
    BamBuddyConnectionError,
    BamBuddyNotFoundError,
    BamBuddyPermissionError,
    normalise_url,
)

from tests.conftest import API_KEY, STREAM_TOKEN, URL

API = f"{URL}/api/v1"


def _client(hass: HomeAssistant, **kwargs: Any) -> BamBuddyClient:
    return BamBuddyClient(URL, API_KEY, async_get_clientsession(hass), **kwargs)


@pytest.mark.parametrize(
    ("typed", "normalised"),
    [
        ("192.0.2.5:8000", "http://192.0.2.5:8000"),
        ("http://bambuddy.local:8000/", "http://bambuddy.local:8000"),
        ("https://bb.example.com/api/v1/", "https://bb.example.com"),
        ("https://bb.example.com/api/v1", "https://bb.example.com"),
        ("HTTP://BamBuddy.Local:8000", "http://bambuddy.local:8000"),
        ("https://example.com/bambuddy/", "https://example.com/bambuddy"),
        ("  http://192.0.2.5:8000  ", "http://192.0.2.5:8000"),
        ("bambuddy.local", "http://bambuddy.local"),
    ],
)
def test_normalise_url(typed: str, normalised: str) -> None:
    """One form for whatever a user types: the scheme added when missing,
    scheme and host in lower case, the trailing slash and an /api/v1 the
    user copied from BamBuddy's docs removed, a reverse-proxy path kept."""
    assert normalise_url(typed) == normalised


@pytest.mark.parametrize("typed", ["", "   ", "ftp://bambuddy.local", "http://", "http://bad host:8000"])
def test_normalise_url_refuses_what_is_no_address(typed: str) -> None:
    with pytest.raises(ValueError):
        normalise_url(typed)


async def test_the_version_is_read_without_the_key(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """BamBuddy names its version and whether its authentication is on on
    public routes: the setup reads them before it knows whether the key is
    good."""
    aioclient_mock.get(f"{API}/updates/version", json={"version": "1.2.5.7", "repo": "maziggy/bambuddy"})

    aioclient_mock.get(f"{API}/auth/status", json={"auth_enabled": True, "requires_setup": False})

    client = _client(hass)
    assert await client.get_version() == "1.2.5.7"
    assert await client.get_auth_status() == {"auth_enabled": True, "requires_setup": False}

    for _, _, _, headers in aioclient_mock.mock_calls:
        assert "X-API-Key" not in (headers or {})


@pytest.mark.parametrize(
    ("call", "args", "verb", "url"),
    [
        ("get_auth_me", (), "GET", f"{API}/auth/me"),
        ("get_system_info", (), "GET", f"{API}/system/info"),
        ("get_statistics", (), "GET", f"{API}/archives/stats"),
        ("get_update_check", (), "GET", f"{API}/updates/check"),
        ("get_firmware_updates", (), "GET", f"{API}/firmware/updates"),
        ("get_printers", (), "GET", f"{API}/printers/"),
        ("get_printer", (1,), "GET", f"{API}/printers/1"),
        ("get_status", (1,), "GET", f"{API}/printers/1/status"),
    ],
)
async def test_each_read_reaches_its_path_with_the_key(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    call: str,
    args: tuple[int, ...],
    verb: str,
    url: str,
) -> None:
    """BamBuddy's routes, and the key its scoped API keys are checked by."""
    answer: Any = [{"answer": call}] if call == "get_printers" else {"answer": call}
    aioclient_mock.request(verb, url, json=answer)

    assert await getattr(_client(hass), call)(*args) == answer

    [(method, called, _, headers)] = aioclient_mock.mock_calls
    assert (method, str(called)) == (verb, url)
    assert headers["X-API-Key"] == API_KEY


@pytest.mark.parametrize(
    ("call", "args", "url"),
    [
        ("pause", (1,), f"{API}/printers/1/print/pause"),
        ("resume", (1,), f"{API}/printers/1/print/resume"),
        ("stop", (1,), f"{API}/printers/1/print/stop"),
        ("set_print_speed", (1, 3), f"{API}/printers/1/print-speed?mode=3"),
        ("set_chamber_light", (1, True), f"{API}/printers/1/chamber-light?on=true"),
        ("set_chamber_light", (1, False), f"{API}/printers/1/chamber-light?on=false"),
        ("set_nozzle_temperature", (1, 220, 1), f"{API}/printers/1/temperature/nozzle?target=220&nozzle=1"),
        ("set_bed_temperature", (1, 60), f"{API}/printers/1/temperature/bed?target=60"),
        ("set_chamber_temperature", (1, 45), f"{API}/printers/1/temperature/chamber?target=45"),
        ("set_fan_speed", (1, "aux", 40), f"{API}/printers/1/fan-speed?fan=aux&speed=40"),
        ("set_airduct_mode", (1, "heating"), f"{API}/printers/1/airduct-mode?mode=heating"),
        ("jog_xy", (1, 10.0, -1.0), f"{API}/printers/1/xy-jog?x=10.0&y=-1.0"),
        ("jog_z", (1, -5.0), f"{API}/printers/1/bed-jog?distance=-5.0"),
        ("jog_extruder", (1, 10.0), f"{API}/printers/1/extruder-jog?distance=10.0"),
        ("home_axes", (1,), f"{API}/printers/1/home-axes?axes=all"),
        ("clear_hms", (1,), f"{API}/printers/1/hms/clear"),
        ("clear_plate", (1,), f"{API}/printers/1/clear-plate"),
        ("refresh_status", (1,), f"{API}/printers/1/refresh-status"),
        ("load_filament", (1, 254), f"{API}/printers/1/ams/load?tray_id=254"),
        ("unload_filament", (1,), f"{API}/printers/1/ams/unload"),
        ("start_drying", (1, 128, 65, 8), f"{API}/printers/1/drying/start?ams_id=128&temp=65&duration=8"),
        ("stop_drying", (1, 128), f"{API}/printers/1/drying/stop?ams_id=128"),
        ("select_extruder", (1, 1), f"{API}/printers/1/select-extruder?extruder=1"),
        ("set_ams_backup", (1, True), f"{API}/printers/1/ams-backup?enabled=true"),
        ("set_ams_backup", (1, False), f"{API}/printers/1/ams-backup?enabled=false"),
    ],
)
async def test_each_command_reaches_its_route(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    call: str,
    args: tuple[Any, ...],
    url: str,
) -> None:
    """Every control is a POST with its parameters in the query, as
    BamBuddy's FastAPI routes read them. The chamber light's flag goes as
    text: aiohttp refuses a Python bool in a query."""
    aioclient_mock.post(url, json={"success": True, "message": "sent"})

    assert await getattr(_client(hass), call)(*args) is None

    [(method, called, _, headers)] = aioclient_mock.mock_calls
    assert (method, str(called)) == ("POST", url)
    assert headers["X-API-Key"] == API_KEY


@pytest.mark.parametrize(
    ("status", "body", "error", "detail"),
    [
        (401, {"detail": "Authentication required"}, BamBuddyAuthError, None),
        (
            403,
            {"detail": "API key does not have 'can_control_printer' permission"},
            BamBuddyPermissionError,
            "API key does not have 'can_control_printer' permission",
        ),
        (404, {"detail": "Printer not found"}, BamBuddyNotFoundError, "Printer not found"),
        (500, {"detail": "Failed to pause print"}, BamBuddyApiError, "Failed to pause print"),
        (422, {"detail": [{"type": "missing", "msg": "Field required"}]}, BamBuddyApiError, "Field required"),
        (502, b"<html>Bad gateway</html>", BamBuddyApiError, "HTTP 502"),
    ],
)
async def test_each_failure_becomes_its_error(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    status: int,
    body: Any,
    error: type[Exception],
    detail: str | None,
) -> None:
    """A wrong key, a missing permission, an unknown printer and BamBuddy's
    own refusals each reach the caller as their own error, with
    BamBuddy's text where it sent one."""
    url = f"{API}/printers/1/print/pause"
    if isinstance(body, bytes):
        aioclient_mock.post(url, status=status, content=body)
    else:
        aioclient_mock.post(url, status=status, json=body)

    with pytest.raises(error) as raised:
        await _client(hass).pause(1)

    if detail is not None:
        assert detail in str(raised.value)


@pytest.mark.parametrize("failure", [aiohttp.ClientConnectionError("refused"), TimeoutError()])
async def test_an_unreachable_bambuddy_is_a_connection_error(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, failure: Exception
) -> None:
    aioclient_mock.get(f"{API}/system/info", exc=failure)

    with pytest.raises(BamBuddyConnectionError):
        await _client(hass).get_system_info()


async def test_an_answer_that_is_no_json_is_an_api_error(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """A proxy page in front of BamBuddy answers 200 with HTML."""
    aioclient_mock.get(f"{API}/system/info", content=b"<html>login</html>")

    with pytest.raises(BamBuddyApiError):
        await _client(hass).get_system_info()


async def test_the_stream_token_never_reaches_the_log(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, caplog: pytest.LogCaptureFixture
) -> None:
    """The token travels in the camera's snapshot and stream URLs: whoever
    reads the log could watch the printer."""
    caplog.set_level(logging.DEBUG, logger="custom_components.bambuddy")
    aioclient_mock.post(f"{API}/printers/camera/stream-token", json={"token": STREAM_TOKEN})

    client = _client(hass)
    assert await client.get_stream_token() == STREAM_TOKEN
    assert client.stream_url(1, STREAM_TOKEN) == f"{API}/printers/1/camera/stream?fps=5&token={STREAM_TOKEN}"
    assert client.snapshot_url(1, STREAM_TOKEN) == f"{API}/printers/1/camera/snapshot?token={STREAM_TOKEN}"
    assert STREAM_TOKEN not in caplog.text
    assert API_KEY not in caplog.text


async def test_the_print_objects_and_skipping_them(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """The objects come from the running job; skipping takes their ids as a
    JSON array -- BamBuddy's route reads a bare list as the body."""
    objects = {"objects": [{"id": 87, "name": "Bracket", "x": 72.4, "y": 128.0, "skipped": False}], "total": 1}
    aioclient_mock.get(f"{API}/printers/1/print/objects", json=objects)
    aioclient_mock.post(f"{API}/printers/1/print/skip-objects", json={"success": True, "skipped_objects": [87]})
    client = _client(hass)

    assert await client.get_print_objects(1) == objects
    await client.skip_objects(1, [87])

    assert aioclient_mock.mock_calls[1][2] == [87]


async def test_the_snapshot_is_fetched_with_the_token(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    aioclient_mock.get(f"{API}/printers/1/camera/snapshot", content=b"jpeg")

    assert await _client(hass).get_snapshot(1, STREAM_TOKEN) == b"jpeg"

    [(_, url, _, _)] = aioclient_mock.mock_calls
    assert url.query["token"] == STREAM_TOKEN


async def test_the_cover_is_fetched_with_the_key(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """BamBuddy 1.2.5.6 and newer take the key for the cover."""
    aioclient_mock.get(f"{API}/printers/1/cover", content=b"png")

    assert await _client(hass).get_cover(1) == b"png"

    [(_, _, _, headers)] = aioclient_mock.mock_calls
    assert headers["X-API-Key"] == API_KEY


async def test_an_older_bambuddy_gets_the_camera_token_for_the_cover(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker
) -> None:
    """Up to 1.2.5.5 BamBuddy wanted the camera token for the cover once
    its authentication was on, and refused the key with a 401."""
    # The more specific URL first: the mock takes the first that matches.
    aioclient_mock.get(f"{API}/printers/1/cover?token={STREAM_TOKEN}", content=b"png")
    aioclient_mock.get(f"{API}/printers/1/cover", status=401, json={"detail": "Valid camera stream token required"})
    aioclient_mock.post(f"{API}/printers/camera/stream-token", json={"token": STREAM_TOKEN})

    assert await _client(hass).get_cover(1) == b"png"
    assert [str(url) for _, url, _, _ in aioclient_mock.mock_calls] == [
        f"{API}/printers/1/cover",
        f"{API}/printers/camera/stream-token",
        f"{API}/printers/1/cover?token={STREAM_TOKEN}",
    ]


@pytest.mark.parametrize(("verify_ssl", "ssl"), [(False, False), (True, True)])
async def test_certificate_checks_can_be_turned_off(
    hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, verify_ssl: bool, ssl: bool
) -> None:
    """A BamBuddy behind a self-signed certificate: aiohttp skips the
    check with ssl=False and makes it with ssl=True."""
    aioclient_mock.get(f"{API}/system/info", json={})
    session = async_get_clientsession(hass)
    client = BamBuddyClient(URL, API_KEY, session, verify_ssl=verify_ssl)

    with patch.object(session, "request", wraps=session.request) as request:
        await client.get_system_info()

    assert request.call_args.kwargs["ssl"] is ssl


async def test_configuring_a_slot(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """BamBuddy's own Configure dialog: all in the query, the colour with its
    alpha; an empty filament id lets BamBuddy keep the slot's preset."""
    url = (
        f"{API}/printers/1/slots/255/1/configure?tray_info_idx=&tray_type=PETG&tray_sub_brands=Generic+PETG"
        "&tray_color=C12E1FFF&nozzle_temp_min=220&nozzle_temp_max=260&cali_idx=-1&nozzle_diameter=0.6"
    )
    aioclient_mock.post(url, json={"success": True, "message": "Configured AMS 255 tray 1 with Generic PETG"})

    await _client(hass).configure_slot(
        1, 255, 1, tray_type="PETG", name="Generic PETG", color="C12E1FFF", temp_min=220, temp_max=260, nozzle_diameter="0.6"
    )

    [(method, called, _, _)] = aioclient_mock.mock_calls
    assert (method, called.path, dict(called.query)) == (
        "POST",
        "/api/v1/printers/1/slots/255/1/configure",
        {
            "tray_info_idx": "",
            "tray_type": "PETG",
            "tray_sub_brands": "Generic PETG",
            "tray_color": "C12E1FFF",
            "nozzle_temp_min": "220",
            "nozzle_temp_max": "260",
            "cali_idx": "-1",
            "nozzle_diameter": "0.6",
        },
    )


@pytest.mark.parametrize(("enabled", "flag"), [(True, "true"), (False, "false")])
async def test_switching_a_detector(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker, enabled: bool, flag: str) -> None:
    """"never_halt" makes BamBuddy leave the sensitivity out: the printer
    keeps the one its user chose."""
    url = f"{API}/printers/1/print-options?module_name=clump_detector&enabled={flag}&sensitivity=never_halt"
    aioclient_mock.post(url, json={"success": True})

    await _client(hass).set_print_option(1, "clump_detector", enabled)

    [(method, called, _, _)] = aioclient_mock.mock_calls
    assert (method, str(called)) == ("POST", url)


async def test_the_print_hours(hass: HomeAssistant, aioclient_mock: AiohttpClientMocker) -> None:
    """BamBuddy's runtime counter, Read Status suffices."""
    aioclient_mock.get(f"{API}/printers/1/runtime-debug", json={"total_hours": 559.5})

    assert await _client(hass).get_runtime(1) == {"total_hours": 559.5}
