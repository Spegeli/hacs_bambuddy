"""BamBuddy's image: the cover of each printer's current job."""
from __future__ import annotations

import logging

from homeassistant.components.image import ImageEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from .api import BamBuddyError
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator
from .entity import BamBuddyPrinterEntity

_LOGGER = logging.getLogger(__name__)

PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities(BamBuddyCover(hass, coordinator) for coordinator in entry.runtime_data.printers.values())


class BamBuddyCover(BamBuddyPrinterEntity, ImageEntity):
    """The job's plate picture, while a job runs or is paused. Fetched once
    per job: BamBuddy may have to download the job from the printer first."""

    _attr_translation_key = "cover"
    _attr_content_type = "image/png"

    def __init__(self, hass: HomeAssistant, coordinator: BamBuddyPrinterCoordinator) -> None:
        BamBuddyPrinterEntity.__init__(self, coordinator, "cover")
        ImageEntity.__init__(self, hass)
        self._job: str | None = None
        self._image: bytes | None = None
        # The job BamBuddy found no cover for.
        self._missing: str | None = None
        self._follow_job()

    def _current_job(self) -> str | None:
        """BamBuddy offers a cover only for a running or paused job."""
        status = self.data.status
        if not status.get("cover_url"):
            return None
        return str(status.get("subtask_name") or status.get("gcode_file") or "") or None

    def _follow_job(self) -> None:
        job = self._current_job()
        if job != self._job:
            self._job = job
            self._image = None
            self._attr_image_last_updated = dt_util.utcnow()

    @callback
    def _handle_coordinator_update(self) -> None:
        self._follow_job()
        super()._handle_coordinator_update()

    @property
    def available(self) -> bool:
        return super().available and self._job is not None

    async def async_image(self) -> bytes | None:
        if self._image is None and self._job is not None and self._job != self._missing:
            try:
                self._image = await self.coordinator.client.get_cover(self.coordinator.printer_id)
            except BamBuddyError as err:
                self._missing = self._job
                _LOGGER.debug("No cover for %s: %s", self.coordinator.printer_name, err)
        return self._image
