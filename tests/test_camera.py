"""The camera: snapshots and the live stream through BamBuddy's camera
proxy, with a camera token fetched from BamBuddy."""
from __future__ import annotations

from datetime import timedelta
from http import HTTPStatus
import logging
from types import SimpleNamespace

import aiohttp

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.components.camera import async_get_image
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from custom_components.bambuddy.api import BamBuddyAuthError, BamBuddyConnectionError

from tests.conftest import STREAM_TOKEN, URL, X1C, entity_id, make_entry, printer_uid, setup_integration


async def _camera(hass: HomeAssistant, entry: MockConfigEntry) -> str:
    await setup_integration(hass, entry)
    return entity_id(hass, "camera", printer_uid(entry, "camera"))


async def test_a_snapshot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    camera = await _camera(hass, make_entry(hass, X1C))

    image = await async_get_image(hass, camera)

    assert image.content == b"jpeg"
    bambuddy_api.get_snapshot.assert_awaited_once_with(X1C, STREAM_TOKEN)


async def test_the_token_is_kept_and_renewed(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy's tokens last an hour: one per 55 minutes."""
    camera = await _camera(hass, make_entry(hass, X1C))

    await async_get_image(hass, camera)
    freezer.tick(timedelta(minutes=54))
    await async_get_image(hass, camera)
    assert bambuddy_api.get_stream_token.await_count == 1

    freezer.tick(timedelta(minutes=2))
    await async_get_image(hass, camera)
    assert bambuddy_api.get_stream_token.await_count == 2


async def test_a_refused_token_is_renewed_at_once(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy restarted and forgot its tokens."""
    camera = await _camera(hass, make_entry(hass, X1C))
    bambuddy_api.get_snapshot.side_effect = [BamBuddyAuthError(401, "Valid camera stream token required"), b"jpeg"]

    image = await async_get_image(hass, camera)

    assert image.content == b"jpeg"
    assert bambuddy_api.get_stream_token.await_count == 2


async def test_no_picture_without_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    camera = await _camera(hass, make_entry(hass, X1C))
    bambuddy_api.get_snapshot.side_effect = BamBuddyConnectionError("refused")

    with pytest.raises(HomeAssistantError):
        await async_get_image(hass, camera)


async def test_the_stream_is_proxied(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    aioclient_mock: AiohttpClientMocker,
    hass_client: ClientSessionGenerator,
) -> None:
    camera = await _camera(hass, make_entry(hass, X1C))
    aioclient_mock.get(
        f"{URL}/api/v1/printers/{X1C}/camera/stream?fps=5&token={STREAM_TOKEN}",
        content=b"--frame\r\nContent-Type: image/jpeg\r\n\r\njpeg\r\n",
        headers={"Content-Type": "multipart/x-mixed-replace;boundary=frame"},
    )
    client = await hass_client()

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status == HTTPStatus.OK
    assert b"jpeg" in await response.read()


async def test_no_stream_without_a_token(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_client: ClientSessionGenerator
) -> None:
    camera = await _camera(hass, make_entry(hass, X1C))
    bambuddy_api.get_stream_token.side_effect = BamBuddyConnectionError("refused")
    client = await hass_client()

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status != HTTPStatus.OK


async def test_a_refused_stream_token_is_renewed(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    aioclient_mock: AiohttpClientMocker,
    hass_client: ClientSessionGenerator,
) -> None:
    """BamBuddy forgot the token (a restart, a restored database): the
    stream asks for a new one instead of failing for the rest of the hour."""
    camera = await _camera(hass, make_entry(hass, X1C))
    bambuddy_api.get_stream_token.side_effect = ["old-token", "new-token"]
    stream = f"{URL}/api/v1/printers/{X1C}/camera/stream"
    aioclient_mock.get(f"{stream}?fps=5&token=old-token", status=401, json={"detail": "Valid camera stream token required"})
    aioclient_mock.get(
        f"{stream}?fps=5&token=new-token",
        content=b"--frame\r\nContent-Type: image/jpeg\r\n\r\njpeg\r\n",
        headers={"Content-Type": "multipart/x-mixed-replace;boundary=frame"},
    )
    client = await hass_client()

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status == HTTPStatus.OK
    assert b"jpeg" in await response.read()


async def test_a_stream_bambuddy_refuses_is_no_stream(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    aioclient_mock: AiohttpClientMocker,
    hass_client: ClientSessionGenerator,
) -> None:
    camera = await _camera(hass, make_entry(hass, X1C))
    aioclient_mock.get(f"{URL}/api/v1/printers/{X1C}/camera/stream", status=503, json={"detail": "busy"})
    client = await hass_client()

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status != HTTPStatus.OK


async def test_a_failed_stream_keeps_its_token_out_of_the_log(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    aioclient_mock: AiohttpClientMocker,
    hass_client: ClientSessionGenerator,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """aiohttp names the request's whole address in some errors (a redirect
    loop behind a proxy, a bad address), and the token is part of it."""
    camera = await _camera(hass, make_entry(hass, X1C))
    stream = f"{URL}/api/v1/printers/{X1C}/camera/stream?fps=5&token={STREAM_TOKEN}"
    aioclient_mock.get(stream, exc=aiohttp.InvalidURL(stream))
    client = await hass_client()
    caplog.set_level(logging.DEBUG, logger="custom_components.bambuddy")

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status != HTTPStatus.OK
    assert "No camera stream" in caplog.text
    assert STREAM_TOKEN not in caplog.text

