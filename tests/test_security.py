"""What must never reach Home Assistant's log: a printer's access code, a
camera address's login, the smart plugs' logins and tokens, the API key and
the camera's stream token -- also at DEBUG, the level a bug report asks for."""
from __future__ import annotations

import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import aiohttp
from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.components.camera import async_get_image
from homeassistant.core import HomeAssistant

from custom_components.bambuddy.api import BamBuddyApiError, BamBuddyClient, BamBuddyConnectionError
from custom_components.bambuddy.diagnostics import async_get_config_entry_diagnostics

from tests.conftest import (
    API_KEY,
    H2D,
    STREAM_TOKEN,
    URL,
    WS_TOKEN,
    X1C,
    entity_id,
    load_fixture,
    next_refresh,
    past_polls,
    past_the_minute,
    printer_serial,
    printer_uid,
    set_up,
)
from tests.helpers import handshake_refusal, open_options, with_plugs

# The client's own socket call, before the tests' mock takes its place.
_OPEN_SOCKET = BamBuddyClient.open_socket

# The secrets the fixtures and this test hand the integration.
_SECRETS = ("AC31415926", "camsecret", "tasmota-secret", "rest-secret", "rest-header-secret", API_KEY, STREAM_TOKEN)


async def test_no_secret_reaches_the_debug_log(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """With BamBuddy's authentication off, its printer list and each
    printer's details carry the access code; an external camera's address
    may carry a login; the plug list carries plug logins and tokens in plain
    text. Through the setup, the minute's details, the plug reads, a camera
    picture and failing reads, none of it reaches the log."""
    caplog.set_level(logging.DEBUG)
    printers = load_fixture("printers.json")
    for printer in printers:
        printer.update({"access_code": "AC31415926", "external_camera_url": "rtsp://admin:camsecret@192.0.2.50/live"})
    bambuddy_api.get_printers.return_value = printers
    bambuddy_api.get_printer.side_effect = lambda printer_id: next(item for item in printers if item["id"] == printer_id)
    bambuddy_api.get_auth_status.return_value = {"auth_enabled": False, "requires_setup": False}
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C, H2D)

    await past_polls(hass, freezer, 7)
    await async_get_image(hass, entity_id(hass, "camera", printer_uid(entry, "camera")))
    bambuddy_api.get_status.side_effect = BamBuddyApiError(500, "Internal Server Error")
    bambuddy_api.get_plug_status.side_effect = BamBuddyConnectionError("GET /smart-plugs/3/status: TimeoutError")
    await next_refresh(hass, freezer, 16)

    for secret in _SECRETS:
        assert secret not in caplog.text, secret


async def test_the_debug_log_names_a_printer_without_its_serial(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """The diagnostics leave a printer's serial out; a log line about the
    printer names it by its BamBuddy name, not by its device name."""
    caplog.set_level(logging.DEBUG, logger="custom_components.bambuddy")
    bambuddy_api.get_runtime.side_effect = BamBuddyConnectionError("down")
    await set_up(hass, X1C)
    await past_the_minute(hass, freezer)

    assert "No runtime counter for Workshop:" in caplog.text
    assert printer_serial(X1C) not in caplog.text


async def test_the_live_token_never_reaches_the_log(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """The live connection's token travels in its URL, which aiohttp's
    errors name: refused by a proxy, refused by BamBuddy, BamBuddy away --
    the log says what happened, never the URL."""
    caplog.set_level(logging.DEBUG)
    url = f"{URL}/api/v1/ws?token={WS_TOKEN}"
    failures = [handshake_refusal(url, 403), handshake_refusal(url, 404), aiohttp.ClientConnectionError(f"Cannot connect to {url}")]
    with (
        patch.object(BamBuddyClient, "open_socket", _OPEN_SOCKET),
        patch.object(aiohttp.ClientSession, "ws_connect", AsyncMock(side_effect=failures)),
    ):
        entry = await set_up(hass, X1C)
        for wait in (1.3, 2.5):
            await next_refresh(hass, freezer, wait)

    assert WS_TOKEN not in caplog.text
    assert "token=" not in caplog.text
    # Nor the diagnostics a bug report carries.
    dumped = json.dumps(await async_get_config_entry_diagnostics(hass, entry))
    assert WS_TOKEN not in dumped
    assert "token=" not in dumped


async def test_configures_live_test_never_names_the_token(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, caplog: pytest.LogCaptureFixture
) -> None:
    """Configure's test of the live connection fails through aiohttp, whose
    errors name the URL with the token: neither the log nor the page (its
    error and the kind it names) carries it."""
    caplog.set_level(logging.DEBUG)
    entry = await set_up(hass, X1C)
    url = f"{URL}/api/v1/ws?token={WS_TOKEN}"
    failures = [
        handshake_refusal(url, 404, f"Invalid response status for {url}"),
        aiohttp.ClientConnectionError(f"Cannot connect to {url}"),
        RuntimeError(f"Session is closed while asking {url}"),
        # One the client does not foresee: only its kind may show.
        ValueError(f"Cannot read {url}"),
    ]
    with (
        patch.object(BamBuddyClient, "open_socket", _OPEN_SOCKET),
        patch.object(aiohttp.ClientSession, "ws_connect", AsyncMock(side_effect=failures)),
    ):
        for _ in failures:
            result = await open_options(hass, entry, "live_updates")
            assert result["step_id"] == "live_updates_failed"
            shown = json.dumps({"errors": result["errors"], "placeholders": result["description_placeholders"]})
            for secret in (WS_TOKEN, "token=", "bambuddy.local"):
                assert secret not in shown, (secret, shown)
            result = await hass.config_entries.options.async_configure(result["flow_id"], {"live_updates": True, "push_gap": "1"})
            assert result["type"] == "create_entry"

    assert WS_TOKEN not in caplog.text
    assert "token=" not in caplog.text
