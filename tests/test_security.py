"""What must never reach Home Assistant's log: a printer's access code, a
camera address's login, the smart plugs' logins and tokens, the API key and
the camera's stream token -- also at DEBUG, the level a bug report asks for."""
from __future__ import annotations

import logging
from types import SimpleNamespace

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.components.camera import async_get_image
from homeassistant.core import HomeAssistant

from custom_components.bambuddy.api import BamBuddyApiError, BamBuddyConnectionError

from tests.conftest import API_KEY, STREAM_TOKEN, H2D, X1C, entity_id, load_fixture, next_refresh, printer_uid, set_up

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
    bambuddy_api.get_smart_plugs.return_value = load_fixture("smart_plugs.json")
    entry = await set_up(hass, X1C, H2D)

    for _ in range(7):
        await next_refresh(hass, freezer)
    await async_get_image(hass, entity_id(hass, "camera", printer_uid(entry, "camera")))
    bambuddy_api.get_status.side_effect = BamBuddyApiError(500, "Internal Server Error")
    bambuddy_api.get_plug_status.side_effect = BamBuddyConnectionError("GET /smart-plugs/3/status: TimeoutError")
    await next_refresh(hass, freezer, 16)

    for secret in _SECRETS:
        assert secret not in caplog.text, secret
