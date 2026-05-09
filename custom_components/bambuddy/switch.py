"""BamBuddy switch entities."""
from __future__ import annotations

import logging

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .api import BamBuddyClient
from .const import DOMAIN
from .entity import BamBuddyPrinterEntityMixin

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up BamBuddy switch entities."""
    data = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        BamBuddyChamberLightSwitch(printer_data["coordinator"], data["client"], printer_data, entry)
        for printer_data in data["printers"].values()
    )


class BamBuddyChamberLightSwitch(BamBuddyPrinterEntityMixin, CoordinatorEntity, SwitchEntity):
    """Switch for the printer chamber light."""

    _attr_name = "Chamber Light"
    _attr_icon = "mdi:lightbulb"

    def __init__(
        self,
        coordinator,
        client: BamBuddyClient,
        printer_data: dict,
        entry: ConfigEntry,
    ) -> None:
        super().__init__(coordinator)
        self._client = client
        self._printer_data = printer_data
        self._entry_id = entry.entry_id
        self._instance_url = f"http://{entry.data.get('host')}:{entry.data.get('port', 8000)}"
        self._attr_unique_id = f"{entry.entry_id}_p{printer_data['printer_id']}_chamber_light"

    @property
    def is_on(self) -> bool | None:
        data = self.coordinator.data
        if not data:
            return None
        return data.get("status", {}).get("chamber_light")

    async def async_turn_on(self, **kwargs) -> None:
        await self._client.set_chamber_light(self._printer_data["printer_id"], True)
        await self.coordinator.async_request_refresh()

    async def async_turn_off(self, **kwargs) -> None:
        await self._client.set_chamber_light(self._printer_data["printer_id"], False)
        await self.coordinator.async_request_refresh()
