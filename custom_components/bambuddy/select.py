"""BamBuddy select entities."""
from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .api import BamBuddyClient
from .const import DOMAIN, PRINT_SPEED_MODES


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    """Set up BamBuddy select entities."""
    data = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([
        BamBuddyPrintSpeedSelect(
            hass,
            data["coordinator"],
            data["client"],
            data["printer_id"],
            entry,
        )
    ])


class BamBuddyPrintSpeedSelect(CoordinatorEntity, SelectEntity):
    """Select entity for print speed."""

    _attr_name = "Print Speed"
    _attr_icon = "mdi:speedometer"
    _attr_options = list(PRINT_SPEED_MODES.values())

    def __init__(self, hass, coordinator, client: BamBuddyClient, printer_id: int, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self.hass = hass
        self._client = client
        self._printer_id = printer_id
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_print_speed"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.data.get("printer_name", f"Printer {printer_id}"),
            manufacturer="BamBuddy",
        )

    @property
    def current_option(self) -> str | None:
        """Return current print speed."""
        # BamBuddy API does not currently expose active speed mode
        # Default to Standard when no active print
        return PRINT_SPEED_MODES.get(2)

    async def async_select_option(self, option: str) -> None:
        """Set print speed."""
        mode = next((k for k, v in PRINT_SPEED_MODES.items() if v == option), None)
        if mode is not None:
            await self._client.set_print_speed(self._printer_id, mode)
            await self.coordinator.async_request_refresh()
