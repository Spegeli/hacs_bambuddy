"""BamBuddy's camera: each printer's camera through BamBuddy's camera proxy,
as a live MJPEG stream and as snapshots."""
from __future__ import annotations

from datetime import datetime, timedelta
from http import HTTPStatus
import logging

import aiohttp
from aiohttp import web
from aiohttp.hdrs import CONTENT_TYPE

from homeassistant.components.camera import Camera
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_aiohttp_proxy_stream
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from .api import BamBuddyAuthError, BamBuddyError
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator
from .entity import BamBuddyPrinterEntity

_LOGGER = logging.getLogger(__name__)

PARALLEL_UPDATES = 0

# BamBuddy's camera tokens last 60 minutes.
_TOKEN_LIFETIME = timedelta(minutes=55)


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities(BamBuddyCamera(coordinator) for coordinator in entry.runtime_data.printers.values())


class BamBuddyCamera(BamBuddyPrinterEntity, Camera):
    """The stream runs while someone watches; the camera reads "idle" in
    between. BamBuddy takes a camera token, never the key, in the URL: the
    token is kept for 55 minutes and renewed when BamBuddy refuses it -- a
    restart or a restored database forgets tokens."""

    _attr_translation_key = "camera"

    def __init__(self, coordinator: BamBuddyPrinterCoordinator) -> None:
        BamBuddyPrinterEntity.__init__(self, coordinator, "camera")
        Camera.__init__(self)
        self._token: str | None = None
        self._token_until: datetime | None = None

    async def _get_token(self, *, renew: bool = False) -> str:
        now = dt_util.utcnow()
        if renew or self._token is None or self._token_until is None or now >= self._token_until:
            self._token = await self.coordinator.client.get_stream_token()
            self._token_until = now + _TOKEN_LIFETIME
        return self._token

    async def async_camera_image(self, width: int | None = None, height: int | None = None) -> bytes | None:
        client, printer_id = self.coordinator.client, self.coordinator.printer_id
        try:
            try:
                return await client.get_snapshot(printer_id, await self._get_token())
            except BamBuddyAuthError:
                return await client.get_snapshot(printer_id, await self._get_token(renew=True))
        except BamBuddyError as err:
            _LOGGER.debug("No camera picture from %s: %s", self.coordinator.printer_name, err)
            return None

    async def _open_stream(self, *, renew: bool = False) -> aiohttp.ClientResponse:
        token = await self._get_token(renew=renew)
        return await self.coordinator.client.open_stream(self.coordinator.printer_id, token)

    async def handle_async_mjpeg_stream(self, request: web.Request) -> web.StreamResponse | None:
        try:
            upstream = await self._open_stream()
            if upstream.status == HTTPStatus.UNAUTHORIZED:
                upstream.release()
                upstream = await self._open_stream(renew=True)
        except BamBuddyError as err:
            _LOGGER.debug("No camera stream from %s: %s", self.coordinator.printer_name, err)
            return None
        except (aiohttp.ClientError, TimeoutError) as err:
            # Only the kind: some aiohttp errors name the address, and the
            # token is part of it.
            _LOGGER.debug("No camera stream from %s: %s", self.coordinator.printer_name, type(err).__name__)
            return None
        if upstream.status >= HTTPStatus.BAD_REQUEST:
            _LOGGER.debug("No camera stream from %s: HTTP %s", self.coordinator.printer_name, upstream.status)
            upstream.release()
            return None
        try:
            return await async_aiohttp_proxy_stream(
                self.hass,
                request,
                upstream.content,
                upstream.headers.get(CONTENT_TYPE, "multipart/x-mixed-replace;boundary=frame"),
            )
        finally:
            upstream.release()
