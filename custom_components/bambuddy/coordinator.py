"""BamBuddy data update coordinator."""
from __future__ import annotations

import logging
from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import BamBuddyClient, BamBuddyApiError
from .const import DEFAULT_SCAN_INTERVAL, DOMAIN

_LOGGER = logging.getLogger(__name__)


class BamBuddyInstanceCoordinator(DataUpdateCoordinator):
    """Coordinator for BamBuddy instance data."""

    def __init__(self, hass: HomeAssistant, client: BamBuddyClient) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_instance",
            update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL),
        )
        self.client = client

    async def _async_update_data(self) -> dict:
        try:
            health = await self.client.get_health()
            system_info = await self.client.get_system_info()
            statistics = await self.client.get_statistics()
            _LOGGER.debug("Instance data — health: %s", health)
            _LOGGER.debug("Instance data — system_info: %s", system_info)
            _LOGGER.debug("Instance data — statistics: %s", statistics)
            return {
                "health": health,
                "system_info": system_info,
                "statistics": statistics,
            }
        except BamBuddyApiError as err:
            raise UpdateFailed(f"Error fetching BamBuddy data: {err}") from err


class BamBuddyPrinterCoordinator(DataUpdateCoordinator):
    """Coordinator for a single BamBuddy printer."""

    def __init__(self, hass: HomeAssistant, client: BamBuddyClient, printer_id: int) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_printer_{printer_id}",
            update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL),
        )
        self.client = client
        self.printer_id = printer_id

    async def _async_update_data(self) -> dict:
        try:
            printer = await self.client.get_printer(self.printer_id)
            status = await self.client.get_printer_status(self.printer_id)
            _LOGGER.debug("Printer %s data — printer: %s", self.printer_id, printer)
            _LOGGER.debug("Printer %s data — status: %s", self.printer_id, status)
            return {
                "printer": printer,
                "status": status,
            }
        except BamBuddyApiError as err:
            raise UpdateFailed(f"Error fetching printer data: {err}") from err
