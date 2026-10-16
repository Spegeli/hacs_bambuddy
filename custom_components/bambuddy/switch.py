"""BamBuddy's switches: the AMS filament backup -- with it on, the printer
switches to a slot with the same filament when one runs out -- and the AI
detectors the printer has."""
from __future__ import annotations

from functools import partial
from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator
from .entity import BamBuddyPrinterEntity, async_run_command
from .models import detectors, plate_position_only

PARALLEL_UPDATES = 1

# BamBuddy's module name of a detector: the entity's key, and the field of
# its state in the status's print options.
_DETECTORS = {
    "printing_monitor": ("ai_monitoring", "printing_monitor"),
    "first_layer_inspector": ("first_layer_inspection", "first_layer_inspector"),
    "buildplate_marker_detector": ("build_plate_detection", "buildplate_marker_detector"),
    "spaghetti_detector": ("spaghetti_detection", "spaghetti_detector"),
    "pileup_detector": ("pileup_detection", "pileup_detector"),
    "clump_detector": ("clumping_detection", "nozzle_clumping_detector"),
    "airprint_detector": ("air_printing_detection", "airprint_detector"),
}


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    if not runtime.can_control:
        return
    entities: list[SwitchEntity] = []
    for coordinator in runtime.printers.values():
        # BamBuddy reports the backup only for printers that have it (not
        # the A1 series).
        if coordinator.data.status.get("ams_filament_backup") is not None:
            entities.append(BamBuddyFilamentBackup(coordinator))
        entities.extend(BamBuddyDetector(coordinator, module) for module in detectors(coordinator.data))
    async_add_entities(entities)


class BamBuddyFilamentBackup(BamBuddyPrinterEntity, SwitchEntity):
    _attr_translation_key = "ams_filament_backup"
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator: BamBuddyPrinterCoordinator) -> None:
        super().__init__(coordinator, "ams_filament_backup")

    @property
    def is_on(self) -> bool | None:
        value = self.data.status.get("ams_filament_backup")
        return None if value is None else bool(value)

    async def _switch(self, on: bool) -> None:
        await async_run_command(
            self.coordinator, partial(self.coordinator.client.set_ams_backup, self.coordinator.printer_id, on)
        )

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._switch(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._switch(False)


class BamBuddyDetector(BamBuddyPrinterEntity, SwitchEntity):
    """An AI detector: on, the printer watches for it and pauses the print
    as its sensitivity says. Switchable during a print, to silence a false
    alarm."""

    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, module: str) -> None:
        key, self._field = _DETECTORS[module]
        # The name follows the kind of detection; the unique ID keeps the key.
        if module == "buildplate_marker_detector" and plate_position_only(coordinator.data):
            self._attr_translation_key = "build_plate_position_detection"
        else:
            self._attr_translation_key = key
        super().__init__(coordinator, key)
        self._module = module

    @property
    def is_on(self) -> bool | None:
        options = self.data.status.get("print_options") or {}
        value = options.get(self._field)
        return None if value is None else bool(value)

    async def _switch(self, on: bool) -> None:
        await async_run_command(
            self.coordinator,
            partial(self.coordinator.client.set_print_option, self.coordinator.printer_id, self._module, on),
        )

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._switch(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._switch(False)
