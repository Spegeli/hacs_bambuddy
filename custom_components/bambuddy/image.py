"""BamBuddy's image: the cover of each printer's current job."""
from __future__ import annotations

from datetime import datetime, timedelta
import logging

from homeassistant.components.image import ImageEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from .api import BamBuddyApiError, BamBuddyError
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator
from .entity import BamBuddyPrinterEntity
from .models import ENDED_STATES

_LOGGER = logging.getLogger(__name__)

PARALLEL_UPDATES = 0

# After a failed fetch -- a timeout while BamBuddy downloads the job from a
# busy printer, a 503 -- the cover is asked for again this much later,
# twice as late each time, at most MAX_RETRY.
FIRST_RETRY = timedelta(minutes=1)
MAX_RETRY = timedelta(minutes=10)


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities(BamBuddyCover(hass, coordinator) for coordinator in entry.runtime_data.printers.values())


class BamBuddyCover(BamBuddyPrinterEntity, ImageEntity):
    """The job's plate picture, while a job runs or is paused and after it
    finished or failed. Fetched once per job: BamBuddy may have to download
    the job from the printer first.
    A job without a cover is not asked for again; a failed fetch is, later."""

    _attr_translation_key = "cover"
    _attr_content_type = "image/png"

    @property
    def entity_picture(self) -> str | None:
        """None while unavailable: the frontend would ask for a picture and
        get an error; it shows the icon instead."""
        return super().entity_picture if self.available else None

    def __init__(self, hass: HomeAssistant, coordinator: BamBuddyPrinterCoordinator) -> None:
        BamBuddyPrinterEntity.__init__(self, coordinator, "cover")
        ImageEntity.__init__(self, hass)
        self._job: str | None = None
        self._image: bytes | None = None
        # The job BamBuddy found no cover for.
        self._missing: str | None = None
        # When to ask again after a failed fetch, and how long to wait then.
        self._retry_at: datetime | None = None
        self._retry_in = FIRST_RETRY
        # The last job ended: the next may carry its name (plate 2 of a project).
        self._ended = False
        self._follow_job()

    def _current_job(self) -> str | None:
        """BamBuddy names a cover only for a running or paused job; its
        cover route serves the job after it ended too, until the next."""
        status = self.data.status
        if not status.get("cover_url") and status.get("state") not in ENDED_STATES:
            return None
        return str(status.get("subtask_name") or status.get("gcode_file") or "") or None

    def _follow_job(self) -> None:
        state = self.data.status.get("state")
        if self._ended and state not in ENDED_STATES:
            self._job = self._missing = None
        self._ended = state in ENDED_STATES
        job = self._current_job()
        if job != self._job:
            self._job = job
            self._image = None
            self._retry_at = None
            self._retry_in = FIRST_RETRY
            self._attr_image_last_updated = dt_util.utcnow()
        elif self._retry_at is not None and dt_util.utcnow() >= self._retry_at:
            # A new picture to the frontend: it asks for it again.
            self._retry_at = None
            self._attr_image_last_updated = dt_util.utcnow()

    @callback
    def _handle_coordinator_update(self) -> None:
        self._follow_job()
        super()._handle_coordinator_update()

    @property
    def available(self) -> bool:
        return super().available and self._job is not None

    async def async_image(self) -> bytes | None:
        if self._image is None and self._job is not None and self._job != self._missing and self._retry_at is None:
            try:
                self._image = await self.coordinator.client.get_cover(self.coordinator.printer_id)
            except BamBuddyError as err:
                if isinstance(err, BamBuddyApiError) and err.status == 404:
                    self._missing = self._job
                else:
                    self._retry_at = dt_util.utcnow() + self._retry_in
                    self._retry_in = min(self._retry_in * 2, MAX_RETRY)
                _LOGGER.debug("No cover for %s: %s", self.coordinator.printer_name, err)
        return self._image
