"""BamBuddy image entities."""
from __future__ import annotations

import logging
from datetime import datetime

import aiohttp

from homeassistant.components.image import ImageEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_API_KEY, DOMAIN
from .entity import BamBuddyPrinterEntityMixin

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up BamBuddy image entities."""
    data = hass.data[DOMAIN][entry.entry_id]
    session = async_get_clientsession(hass)
    entities = []
    for printer_data in data["printers"].values():
        entities.append(
            BamBuddyCoverImage(hass, printer_data["coordinator"], entry, printer_data, session)
        )
    async_add_entities(entities)


class BamBuddyCoverImage(BamBuddyPrinterEntityMixin, CoordinatorEntity, ImageEntity):
    """Cover image of the current print job."""

    _attr_name = "Cover"
    _attr_content_type = "image/jpeg"

    def __init__(
        self,
        hass: HomeAssistant,
        coordinator,
        entry: ConfigEntry,
        printer_data: dict,
        session: aiohttp.ClientSession,
    ) -> None:
        CoordinatorEntity.__init__(self, coordinator)
        ImageEntity.__init__(self, hass)
        self._printer_data = printer_data
        self._entry_id = entry.entry_id
        self._instance_url = f"http://{entry.data.get('host')}:{entry.data.get('port', 8000)}"
        self._api_key = entry.data.get(CONF_API_KEY, "")
        self._session = session
        self._last_job: str | None = None
        self._attr_unique_id = f"{entry.entry_id}_p{printer_data['printer_id']}_cover"

    def _get_current_job(self) -> str | None:
        status = (self.coordinator.data or {}).get("status", {})
        return status.get("current_print") or status.get("subtask_name")

    def _handle_coordinator_update(self) -> None:
        """Refresh image timestamp when a new print job starts."""
        job = self._get_current_job()
        if job and job != self._last_job:
            self._last_job = job
            self._attr_image_last_updated = datetime.now()
        super()._handle_coordinator_update()

    async def async_image(self) -> bytes | None:
        """Fetch the cover image from the dedicated cover endpoint."""
        printer_id = self._printer_data["printer_id"]
        url = f"{self._instance_url}/api/v1/printers/{printer_id}/cover"
        try:
            async with self._session.get(
                url,
                headers={"X-API-Key": self._api_key},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    return await resp.read()
                _LOGGER.warning("Cover image request returned HTTP %s", resp.status)
        except Exception as err:
            _LOGGER.error("Error fetching cover image: %s", err)
        return None
