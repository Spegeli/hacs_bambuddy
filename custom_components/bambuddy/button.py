"""BamBuddy buttons."""
from __future__ import annotations

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CONF_API_KEY, CONF_HOST, CONF_PORT, CONF_PRINTER_ID, DOMAIN
from .api import BamBuddyClient
from homeassistant.helpers.aiohttp_client import async_get_clientsession

PRINTER_BUTTONS: list[ButtonEntityDescription] = [
    ButtonEntityDescription(key="clear_hms", name="Clear HMS Errors", icon="mdi:alert-circle-check"),
    ButtonEntityDescription(key="clear_plate", name="Clear Plate", icon="mdi:tray-remove"),
    ButtonEntityDescription(key="refresh_status", name="Refresh Status", icon="mdi:refresh"),
]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    """Set up BamBuddy buttons."""
    data = hass.data[DOMAIN][entry.entry_id]
    client = data["client"]
    printer_id = data["printer_id"]

    async_add_entities([
        BamBuddyPrinterButton(hass, entry, client, printer_id, description)
        for description in PRINTER_BUTTONS
    ])


class BamBuddyPrinterButton(ButtonEntity):
    """BamBuddy printer button."""

    def __init__(self, hass, entry: ConfigEntry, client: BamBuddyClient, printer_id: int, description: ButtonEntityDescription) -> None:
        self.hass = hass
        self.entity_description = description
        self._entry = entry
        self._client = client
        self._printer_id = printer_id
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.data.get("printer_name", f"Printer {printer_id}"),
            manufacturer="BamBuddy",
        )

    async def async_press(self) -> None:
        key = self.entity_description.key
        if key == "clear_hms":
            await self._client.clear_hms_errors(self._printer_id)
        elif key == "clear_plate":
            await self._client.clear_plate(self._printer_id)
        elif key == "refresh_status":
            await self._client.refresh_printer_status(self._printer_id)

        # Refresh coordinator after action
        coordinator = hass_data = self.hass.data[DOMAIN][self._entry.entry_id]["coordinator"]
        await coordinator.async_request_refresh()
