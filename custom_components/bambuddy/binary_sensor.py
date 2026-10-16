"""BamBuddy's binary sensors: whether BamBuddy and each printer are online,
the door, the plate, and an AMS unit drying."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.binary_sensor import (  # type: ignore[attr-defined]
    # BinarySensorDeviceClass: in binary_sensor/__init__.py at 2025.5, in
    # binary_sensor/const.py at 2026.10 and only offered here; only this path
    # works on both.
    BinarySensorDeviceClass,
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import BamBuddyConfigEntry, BamBuddyInstanceCoordinator, BamBuddyPrinterCoordinator
from .entity import BamBuddyAmsEntity, BamBuddyInstanceEntity, BamBuddyPrinterEntity
from .models import PrinterData, ams_key, can_dry

PARALLEL_UPDATES = 0


@dataclass(frozen=True, kw_only=True)
class BamBuddyPrinterBinarySensorDescription(BinarySensorEntityDescription):
    value_fn: Callable[[PrinterData], bool | None]
    exists_fn: Callable[[PrinterData], bool] = lambda _: True
    available_when_offline: bool = False


def _flag(key: str) -> Callable[[PrinterData], bool | None]:
    return lambda data: None if data.status.get(key) is None else bool(data.status.get(key))


PRINTER_BINARY_SENSORS: tuple[BamBuddyPrinterBinarySensorDescription, ...] = (
    BamBuddyPrinterBinarySensorDescription(
        key="connected",
        translation_key="online",
        device_class=BinarySensorDeviceClass.CONNECTIVITY,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda data: data.connected,
        available_when_offline=True,
    ),
    BamBuddyPrinterBinarySensorDescription(
        key="door",
        translation_key="door",
        device_class=BinarySensorDeviceClass.DOOR,
        exists_fn=lambda data: data.has_door(),
        value_fn=_flag("door_open"),
    ),
    # A problem: BamBuddy's queue starts no print until the plate is clear.
    BamBuddyPrinterBinarySensorDescription(
        key="awaiting_plate_clear",
        translation_key="plate_clear_needed",
        device_class=BinarySensorDeviceClass.PROBLEM,
        value_fn=_flag("awaiting_plate_clear"),
        # BamBuddy keeps the gate across power cycles.
        available_when_offline=True,
    ),
    BamBuddyPrinterBinarySensorDescription(
        key="sdcard",
        translation_key="sd_card",
        device_class=BinarySensorDeviceClass.PLUG,
        entity_category=EntityCategory.DIAGNOSTIC,
        exists_fn=lambda data: data.has_sd_card(),
        value_fn=_flag("sdcard"),
    ),
    BamBuddyPrinterBinarySensorDescription(
        key="developer_mode",
        translation_key="developer_mode",
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=_flag("developer_mode"),
    ),
    BamBuddyPrinterBinarySensorDescription(
        key="wired_network",
        translation_key="wired_network",
        entity_category=EntityCategory.DIAGNOSTIC,
        exists_fn=lambda data: data.has_ethernet(),
        value_fn=_flag("wired_network"),
    ),
    BamBuddyPrinterBinarySensorDescription(
        key="timelapse",
        translation_key="timelapse",
        device_class=BinarySensorDeviceClass.RUNNING,
        entity_registry_enabled_default=False,
        value_fn=_flag("timelapse"),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    entities: list[BinarySensorEntity] = [BamBuddyOnlineSensor(runtime.instance)]
    for coordinator in runtime.printers.values():
        entities.extend(
            BamBuddyPrinterBinarySensor(coordinator, description)
            for description in PRINTER_BINARY_SENSORS
            if description.exists_fn(coordinator.data)
        )
        _add_drying_sensors(coordinator, async_add_entities)
    async_add_entities(entities)


def _add_drying_sensors(
    coordinator: BamBuddyPrinterCoordinator, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    """One per AMS unit that can dry, also for units attached later."""
    known: set[str] = set()

    @callback
    def add_new_units() -> None:
        data = coordinator.data
        new = [
            unit
            for unit in data.ams_units
            if ams_key(unit) not in known and can_dry(unit, data) and coordinator.ams_unit_ready(unit)
        ]
        known.update(ams_key(unit) for unit in new)
        if new:
            async_add_entities(BamBuddyDryingSensor(coordinator, int(unit.get("id", 0))) for unit in new)

    add_new_units()
    coordinator.config_entry.async_on_unload(coordinator.async_add_listener(add_new_units))


class BamBuddyOnlineSensor(BamBuddyInstanceEntity, BinarySensorEntity):
    """Whether BamBuddy answers: available also when it does not, so that an
    automation can tell."""

    _attr_translation_key = "bambuddy_online"
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY

    def __init__(self, coordinator: BamBuddyInstanceCoordinator) -> None:
        super().__init__(coordinator, "connected")

    @property
    def available(self) -> bool:
        return True

    @property
    def is_on(self) -> bool:
        return self.coordinator.last_update_success


class BamBuddyPrinterBinarySensor(BamBuddyPrinterEntity, BinarySensorEntity):
    entity_description: BamBuddyPrinterBinarySensorDescription

    def __init__(
        self, coordinator: BamBuddyPrinterCoordinator, description: BamBuddyPrinterBinarySensorDescription
    ) -> None:
        # First: the entity ID is made from its translation key.
        self.entity_description = description
        super().__init__(coordinator, description.key)
        self.available_when_offline = description.available_when_offline

    @property
    def is_on(self) -> bool | None:
        return self.entity_description.value_fn(self.data)


class BamBuddyDryingSensor(BamBuddyAmsEntity, BinarySensorEntity):
    """An AMS unit drying its filament. BamBuddy's REST status leaves the
    drying phase at 0: the minutes left tell."""

    _attr_translation_key = "drying"
    _attr_device_class = BinarySensorDeviceClass.RUNNING

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, ams_id: int) -> None:
        super().__init__(coordinator, ams_id, "drying")

    @property
    def is_on(self) -> bool | None:
        unit: dict[str, Any] = self.unit or {}
        minutes = unit.get("dry_time")
        return isinstance(minutes, int) and minutes > 0 and not unit.get("dry_countdown_stalled")
