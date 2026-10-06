"""The camera: snapshots and the live stream through BamBuddy's camera
proxy, with a stream token fetched from BamBuddy."""
from __future__ import annotations

from datetime import timedelta
from http import HTTPStatus
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

from custom_components.bambuddy.api import BamBuddyApiError

from tests.conftest import HOST, PORT, STREAM_TOKEN, entity_id, printer_uid, setup_integration

_CAMERA = f"http://{HOST}:{PORT}/api/v1/printers/1/camera"
_SNAPSHOT = f"{_CAMERA}/snapshot?token={STREAM_TOKEN}"
_STREAM = f"{_CAMERA}/stream?token={STREAM_TOKEN}&fps=5"


async def _camera(hass: HomeAssistant, entry: MockConfigEntry) -> str:
    await setup_integration(hass, entry)
    return entity_id(hass, "camera", printer_uid(entry, "camera"))


async def test_the_snapshot_comes_through_bambuddys_camera_proxy(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
) -> None:
    aioclient_mock.get(_SNAPSHOT, content=b"jpeg")
    camera = await _camera(hass, config_entry)

    image = await async_get_image(hass, camera)

    assert image.content == b"jpeg"


async def test_the_token_is_reused_for_55_minutes_then_renewed(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    freezer: FrozenDateTimeFactory,
) -> None:
    """BamBuddy's stream tokens last an hour: one is fetched, used for 55
    minutes, then replaced. Snapshots through the camera component, not its
    HTTP view: 55 minutes outlast the test client's access token."""
    aioclient_mock.get(_SNAPSHOT, content=b"jpeg")
    camera = await _camera(hass, config_entry)

    await async_get_image(hass, camera)
    freezer.tick(timedelta(minutes=54))
    await async_get_image(hass, camera)
    assert bambuddy_api.get_stream_token.await_count == 1

    freezer.tick(timedelta(minutes=1))
    await async_get_image(hass, camera)
    assert bambuddy_api.get_stream_token.await_count == 2


async def test_no_token_no_snapshot(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
) -> None:
    """No request to BamBuddy's camera proxy without a token."""
    aioclient_mock.get(f"{_CAMERA}/snapshot", content=b"jpeg")  # any token
    bambuddy_api.get_stream_token.side_effect = BamBuddyApiError("down")
    camera = await _camera(hass, config_entry)

    with pytest.raises(HomeAssistantError):
        await async_get_image(hass, camera)
    assert aioclient_mock.call_count == 0


@pytest.mark.parametrize(
    "answer",
    [
        {"status": HTTPStatus.SERVICE_UNAVAILABLE, "content": b"error page"},
        {"exc": aiohttp.ClientError()},
    ],
    ids=["error_status", "connection_error"],
)
async def test_a_failed_snapshot_gives_no_image(
    hass: HomeAssistant,
    aioclient_mock: AiohttpClientMocker,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    answer: dict[str, object],
) -> None:
    aioclient_mock.get(_SNAPSHOT, **answer)
    camera = await _camera(hass, config_entry)

    with pytest.raises(HomeAssistantError):
        await async_get_image(hass, camera)


async def test_the_stream_is_passed_through(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    aioclient_mock: AiohttpClientMocker,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
) -> None:
    aioclient_mock.get(
        _STREAM,
        content=b"--frame\r\n",
        headers={"Content-Type": "multipart/x-mixed-replace;boundary=frame"},
    )
    camera = await _camera(hass, config_entry)
    client = await hass_client()

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status == HTTPStatus.OK
    assert response.headers["Content-Type"] == "multipart/x-mixed-replace;boundary=frame"
    assert await response.read() == b"--frame\r\n"


async def test_no_token_no_stream(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    aioclient_mock: AiohttpClientMocker,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
) -> None:
    """No request to BamBuddy's camera proxy without a token."""
    aioclient_mock.get(f"{_CAMERA}/stream", content=b"--frame\r\n")  # any token
    bambuddy_api.get_stream_token.side_effect = BamBuddyApiError("down")
    camera = await _camera(hass, config_entry)
    client = await hass_client()

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status == HTTPStatus.BAD_GATEWAY
    assert aioclient_mock.call_count == 0


async def test_a_failed_stream_gives_bad_gateway(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    aioclient_mock: AiohttpClientMocker,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
) -> None:
    aioclient_mock.get(_STREAM, exc=aiohttp.ClientError())
    camera = await _camera(hass, config_entry)
    client = await hass_client()

    response = await client.get(f"/api/camera_proxy_stream/{camera}")

    assert response.status == HTTPStatus.BAD_GATEWAY
