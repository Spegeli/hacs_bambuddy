"""BamBuddy buttons."""
from __future__ import annotations

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.helpers.entity import EntityCategory
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api import BamBuddyClient
from .const import DOMAIN

PRINTER_BUTTONS: list[ButtonEntityDescription] = [
    ButtonEntityDescription(key="pause", name="Pause Print", icon="mdi:pause", entity_category=EntityCategory.CONFIG),
    ButtonEntityDescription(key="resume", name="Resume Print", icon="mdi:play", entity_category=EntityCategory.CONFIG),
    ButtonEntityDescription(key="stop", name="Stop Print", icon="mdi:stop", entity_category=EntityCategory.CONFIG),
    ButtonEntityDescription(key="clear_hms", name="Clear HMS Errors", icon="mdi:alert-circle-check"),
    ButtonEntityDescription(key="clear_plate", name="Clear Plate", icon="mdi:tray-remove"),
    ButtonEntityDescription(key="refresh_status", name="Refresh Status", icon="mdi:refresh"),
]


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up BamBuddy buttons."""
    data = hass.data[DOMAIN][entry.entry_id]
    entities = []
    for printer_data in data["printers"].values():
        entities.extend(
            BamBuddyPrinterButton(hass, entry, data["client"], printer_data, description)
            for description in PRINTER_BUTTONS
        )
    async_add_entities(entities)


class BamBuddyPrinterButton(ButtonEntity):
    """BamBuddy printer button."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        client: BamBuddyClient,
        printer_data: dict,
        description: ButtonEntityDescription,
    ) -> None:
        self.hass = hass
        self.entity_description = description
        self._entry = entry
        self._entry_id = entry.entry_id
        self._instance_url = f"http://{entry.data.get('host')}:{entry.data.get('port', 8000)}"
        self._client = client
        self._printer_data = printer_data
        self._attr_unique_id = f"{entry.entry_id}_p{printer_data['printer_id']}_{description.key}"

    @property
    def device_info(self) -> DeviceInfo:
        data = self._printer_data["coordinator"].data or {}
        printer_info = data.get("printer", {})
        status_info = data.get("status", {})
        printer_id = self._printer_data["printer_id"]
        return DeviceInfo(
            identifiers={(DOMAIN, f"{self._entry_id}_printer_{printer_id}")},
            name=self._printer_data["printer_name"],
            manufacturer="BamBuddy",
            model=f"BamBuddy Printer ({printer_info['model']})" if printer_info.get("model") else "BamBuddy Printer",
            serial_number=printer_info.get("serial_number"),
            sw_version=status_info.get("firmware_version"),
            configuration_url=self._instance_url,
            via_device=(DOMAIN, self._entry_id),
        )

    async def async_press(self) -> None:
        printer_id = self._printer_data["printer_id"]
        key = self.entity_description.key
        if key == "pause":
            await self._client.pause_print(printer_id)
        elif key == "resume":
            await self._client.resume_print(printer_id)
        elif key == "stop":
            await self._client.stop_print(printer_id)
        elif key == "clear_hms":
            await self._client.clear_hms_errors(printer_id)
        elif key == "clear_plate":
            await self._client.clear_plate(printer_id)
        elif key == "refresh_status":
            await self._client.refresh_printer_status(printer_id)

        coordinator = self.hass.data[DOMAIN][self._entry.entry_id]["printers"][self._printer_data["printer_id"]]["coordinator"]
        await coordinator.async_request_refresh()
