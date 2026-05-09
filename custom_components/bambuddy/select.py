"""BamBuddy select entities."""
from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .api import BamBuddyClient
from .const import DOMAIN, PRINT_SPEED_MODES
from .entity import BamBuddyPrinterEntityMixin


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up BamBuddy select entities."""
    data = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        BamBuddyPrintSpeedSelect(hass, printer_data["coordinator"], data["client"], printer_data, entry)
        for printer_data in data["printers"].values()
    )


class BamBuddyPrintSpeedSelect(BamBuddyPrinterEntityMixin, CoordinatorEntity, SelectEntity):
    """Select entity for print speed."""

    _attr_name = "Print Speed"
    _attr_icon = "mdi:speedometer"
    _attr_options = list(PRINT_SPEED_MODES.values())

    def __init__(
        self,
        hass: HomeAssistant,
        coordinator,
        client: BamBuddyClient,
        printer_data: dict,
        entry: ConfigEntry,
    ) -> None:
        super().__init__(coordinator)
        self.hass = hass
        self._client = client
        self._printer_data = printer_data
        self._entry_id = entry.entry_id
        self._instance_url = f"http://{entry.data.get('host')}:{entry.data.get('port', 8000)}"
        self._attr_unique_id = f"{entry.entry_id}_p{printer_data['printer_id']}_print_speed"

    @property
    def current_option(self) -> str | None:
        mode = self._coordinator_data().get("status", {}).get("speed_level")
        return PRINT_SPEED_MODES.get(mode)

    async def async_select_option(self, option: str) -> None:
        mode = next((k for k, v in PRINT_SPEED_MODES.items() if v == option), None)
        if mode is not None:
            await self._client.set_print_speed(self._printer_data["printer_id"], mode)
            await self.coordinator.async_request_refresh()
