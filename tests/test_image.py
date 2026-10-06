"""The cover image of the current print job, from BamBuddy's cover
endpoint."""
from __future__ import annotations

from datetime import timedelta
from http import HTTPStatus
from types import SimpleNamespace

import aiohttp
from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed
from pytest_homeassistant_custom_component.test_util.aiohttp import AiohttpClientMocker
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from tests.conftest import (
    API_KEY,
    HOST,
    PORT,
    entity_id,
    load_fixture,
    printer_uid,
    setup_integration,
)

_COVER = f"http://{HOST}:{PORT}/api/v1/printers/1/cover"


async def _cover(hass: HomeAssistant, entry: MockConfigEntry) -> str:
    await setup_integration(hass, entry)
    return entity_id(hass, "image", printer_uid(entry, "cover"))


async def _next_refresh(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    """Past the printer's next refresh, 9 to 10.5 seconds after the last
    (tests/test_init.py, _next_refresh)."""
    freezer.tick(timedelta(seconds=11))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()


async def test_the_cover_comes_from_bambuddy_with_the_key(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    aioclient_mock: AiohttpClientMocker,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
) -> None:
    aioclient_mock.get(_COVER, content=b"cover")
    cover = await _cover(hass, config_entry)
    client = await hass_client()

    response = await client.get(f"/api/image_proxy/{cover}")

    assert response.status == HTTPStatus.OK
    assert await response.read() == b"cover"
    [(_, _, _, headers)] = aioclient_mock.mock_calls
    assert headers["X-API-Key"] == API_KEY


@pytest.mark.parametrize(
    "answer",
    [{"status": HTTPStatus.NOT_FOUND, "content": b"not found"}, {"exc": aiohttp.ClientError()}],
    ids=["error_status", "connection_error"],
)
async def test_a_failed_cover_gives_no_image(
    hass: HomeAssistant,
    hass_client: ClientSessionGenerator,
    aioclient_mock: AiohttpClientMocker,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    caplog: pytest.LogCaptureFixture,
    answer: dict[str, object],
) -> None:
    """No image, and no unhandled error in Home Assistant's web server."""
    aioclient_mock.get(_COVER, **answer)
    cover = await _cover(hass, config_entry)
    client = await hass_client()

    response = await client.get(f"/api/image_proxy/{cover}")

    assert response.status == HTTPStatus.INTERNAL_SERVER_ERROR
    assert "Error handling request" not in caplog.text


async def test_the_cover_is_renewed_when_the_job_changes(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    freezer: FrozenDateTimeFactory,
) -> None:
    """Its state is the time of its last change: a refresh with the same
    job keeps it, one with another job moves it."""
    cover = await _cover(hass, config_entry)
    await _next_refresh(hass, freezer)
    first = hass.states.get(cover).state

    await _next_refresh(hass, freezer)
    assert hass.states.get(cover).state == first

    bambuddy_api.get_printer_status.return_value = {
        **load_fixture("printer_status.json"),
        "current_print": "cube.3mf",
    }
    await _next_refresh(hass, freezer)
    assert hass.states.get(cover).state != first
