"""BamBuddy's light: the printer's light (the chamber light of an enclosed printer)."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from functools import partial
from typing import Any

from homeassistant.components.light import LightEntity
from homeassistant.components.light.const import ColorMode
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator
from .entity import BamBuddyToggle

PARALLEL_UPDATES = 1


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    if runtime.can_control:
        async_add_entities(BamBuddyChamberLight(coordinator) for coordinator in runtime.printers.values())


class BamBuddyChamberLight(BamBuddyToggle, LightEntity):
    """On or off; BamBuddy switches both chamber lights of printers that
    have two."""

    _attr_translation_key = "chamber_light"
    _attr_color_mode = ColorMode.ONOFF
    _attr_supported_color_modes = {ColorMode.ONOFF}

    def __init__(self, coordinator: BamBuddyPrinterCoordinator) -> None:
        # An open frame's light is no chamber light; before the base names
        # the entity ID after it. The unique ID's key stays.
        if not coordinator.data.enclosed():
            self._attr_translation_key = "light"
        super().__init__(coordinator, "chamber_light")

    def _reported(self) -> Any:
        return self.data.status.get("chamber_light")

    def _command(self, on: bool) -> Callable[[], Awaitable[None]]:
        return partial(self.coordinator.client.set_chamber_light, self.coordinator.printer_id, on)
