"""BamBuddy's light: the printer's chamber light."""
from __future__ import annotations

from functools import partial
from typing import Any

from homeassistant.components.light import LightEntity
from homeassistant.components.light.const import ColorMode
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator
from .entity import BamBuddyPrinterEntity, async_run_command

PARALLEL_UPDATES = 1


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    if runtime.can_control:
        async_add_entities(BamBuddyChamberLight(coordinator) for coordinator in runtime.printers.values())


class BamBuddyChamberLight(BamBuddyPrinterEntity, LightEntity):
    """On or off; BamBuddy switches both chamber lights of printers that
    have two."""

    _attr_translation_key = "chamber_light"
    _attr_color_mode = ColorMode.ONOFF
    _attr_supported_color_modes = {ColorMode.ONOFF}

    def __init__(self, coordinator: BamBuddyPrinterCoordinator) -> None:
        super().__init__(coordinator, "chamber_light")

    @property
    def is_on(self) -> bool | None:
        value = self.data.status.get("chamber_light")
        return None if value is None else bool(value)

    async def _switch(self, on: bool) -> None:
        await async_run_command(
            self.coordinator, partial(self.coordinator.client.set_chamber_light, self.coordinator.printer_id, on)
        )

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._switch(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._switch(False)
