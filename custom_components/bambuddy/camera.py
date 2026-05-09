"""BamBuddy camera entity."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

import aiohttp
from aiohttp import web

from homeassistant.components.camera import Camera
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .api import BamBuddyClient, BamBuddyApiError
from .const import DOMAIN
from .entity import BamBuddyPrinterEntityMixin

_LOGGER = logging.getLogger(__name__)

_TOKEN_TTL = timedelta(minutes=55)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up BamBuddy camera."""
    data = hass.data[DOMAIN][entry.entry_id]
    session = async_get_clientsession(hass)
    async_add_entities(
        BamBuddyCamera(printer_data["coordinator"], data["client"], printer_data, entry, session)
        for printer_data in data["printers"].values()
    )


class BamBuddyCamera(BamBuddyPrinterEntityMixin, CoordinatorEntity, Camera):
    """Camera entity streaming from the BamBuddy camera proxy."""

    _attr_name = "Camera"
    _attr_icon = "mdi:cctv"

    def __init__(
        self,
        coordinator,
        client: BamBuddyClient,
        printer_data: dict,
        entry: ConfigEntry,
        session: aiohttp.ClientSession,
    ) -> None:
        CoordinatorEntity.__init__(self, coordinator)
        Camera.__init__(self)
        self._client = client
        self._printer_data = printer_data
        self._entry_id = entry.entry_id
        self._instance_url = f"http://{entry.data.get('host')}:{entry.data.get('port', 8000)}"
        self._session = session
        self._token: str | None = None
        self._token_expires: datetime | None = None
        self._attr_unique_id = f"{entry.entry_id}_p{printer_data['printer_id']}_camera"

    async def _get_valid_token(self) -> str | None:
        now = datetime.now()
        if self._token is None or (self._token_expires and now >= self._token_expires):
            try:
                self._token = await self._client.get_stream_token()
                self._token_expires = now + _TOKEN_TTL
                _LOGGER.debug("Camera stream token refreshed, expires at %s", self._token_expires)
            except BamBuddyApiError as err:
                _LOGGER.error("Failed to get camera stream token: %s", err)
                return None
        return self._token

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        """Return a JPEG snapshot from the printer camera."""
        token = await self._get_valid_token()
        if not token:
            return None
        url = self._client.snapshot_url(self._printer_data["printer_id"], token)
        try:
            async with self._session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    return await resp.read()
                _LOGGER.warning("Camera snapshot returned HTTP %s", resp.status)
        except Exception as err:
            _LOGGER.error("Error fetching camera snapshot: %s", err)
        return None

    async def handle_async_mjpeg_stream(
        self, request: web.Request
    ) -> web.StreamResponse | None:
        """Proxy the MJPEG stream from BamBuddy to the HA client."""
        token = await self._get_valid_token()
        if not token:
            return None
        url = self._client.stream_url(self._printer_data["printer_id"], token)
        try:
            async with self._session.get(
                url, timeout=aiohttp.ClientTimeout(total=None, connect=10)
            ) as upstream:
                response = web.StreamResponse(
                    status=upstream.status,
                    headers={
                        "Content-Type": upstream.headers.get(
                            "Content-Type", "multipart/x-mixed-replace;boundary=frame"
                        )
                    },
                )
                await response.prepare(request)
                async for chunk in upstream.content.iter_any():
                    await response.write(chunk)
                return response
        except (asyncio.CancelledError, ConnectionResetError):
            return None
        except Exception as err:
            _LOGGER.error("MJPEG stream error: %s", err)
            return None
