"""BamBuddy's binary sensors: whether BamBuddy and each printer are online,
the door, the plate, the storage, developer mode, the wired network, the
timelapse, an AMS unit drying, and a smart plug's state where it cannot be
switched."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, replace
from functools import partial
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
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import DOMAIN
from .coordinator import BamBuddyConfigEntry, BamBuddyInstanceCoordinator, BamBuddyPlugCoordinator, BamBuddyPrinterCoordinator
from .entity import (
    BamBuddyAmsEntity,
    BamBuddyDescribedEntity,
    BamBuddyInstanceEntity,
    BamBuddyPlugEntity,
    async_add_ams_entities,
    async_add_plug_entities,
)
from .models import PrinterData, can_dry, has_heater, is_drying
from .plugs import Plug

PARALLEL_UPDATES = 0


@dataclass(frozen=True, kw_only=True)
class BamBuddyPrinterBinarySensorDescription(BinarySensorEntityDescription):
    value_fn: Callable[[PrinterData], bool | None]
    exists_fn: Callable[[PrinterData], bool] = lambda _: True
    available_when_offline: bool = False
    # A name after the printer's hardware; the unique ID keeps the key.
    translation_key_fn: Callable[[PrinterData], str | None] | None = None

    def for_printer(self, data: PrinterData) -> BamBuddyPrinterBinarySensorDescription:
        name = self.translation_key_fn(data) if self.translation_key_fn else None
        return replace(self, translation_key=name) if name else self


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
        translation_key_fn=lambda data: "usb_drive" if data.stores_on_usb() else None,
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
    registry = er.async_get(hass)
    for coordinator in runtime.printers.values():
        # 1.x gave every printer a Wired network sensor; a model without a
        # network port (all but the X1E and the H2D Pro) keeps none.
        if coordinator.data.model.strip() and not coordinator.data.has_ethernet():
            stale = registry.async_get_entity_id("binary_sensor", DOMAIN, coordinator.entity_unique_id("wired_network"))
            if stale is not None:
                registry.async_remove(stale)
        entities.extend(
            BamBuddyPrinterBinarySensor(coordinator, description.for_printer(coordinator.data))
            for description in PRINTER_BINARY_SENSORS
            if description.exists_fn(coordinator.data)
        )
        _add_drying_sensors(coordinator, async_add_entities)
    _add_plug_states(runtime.plugs, async_add_entities)
    async_add_entities(entities)


def _add_drying_sensors(
    coordinator: BamBuddyPrinterCoordinator, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    """One per AMS unit with a heater."""

    def create(unit: dict[str, Any], data: PrinterData) -> list[tuple[str, Callable[[], BinarySensorEntity]]]:
        return [("drying", partial(BamBuddyDryingSensor, coordinator, int(unit.get("id", 0))))]

    async_add_ams_entities(coordinator, async_add_entities, create, wanted=has_heater)


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


class BamBuddyPrinterBinarySensor(BamBuddyDescribedEntity, BinarySensorEntity):
    entity_description: BamBuddyPrinterBinarySensorDescription

    @property
    def is_on(self) -> bool | None:
        return self.entity_description.value_fn(self.data)


class BamBuddyDryingSensor(BamBuddyAmsEntity, BinarySensorEntity):
    """An AMS unit drying its filament. BamBuddy's REST status leaves the
    drying phase at 0: the minutes left tell. Whether Home Assistant may
    start it stands beside: a P1S dries from its own screen only."""

    _attr_translation_key = "drying"
    _attr_device_class = BinarySensorDeviceClass.RUNNING

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, ams_id: int) -> None:
        super().__init__(coordinator, ams_id, "drying")

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        unit: dict[str, Any] = self.unit or {}
        target = unit.get("dry_target_temp")
        return {
            "remote_start": can_dry(unit, self.data),
            # What it dries at, while it dries -- BamBuddy knows it only for a
            # drying it started itself.
            "target_temperature": target if self.is_on and isinstance(target, int | float) and target > 0 else None,
        }

    @property
    def is_on(self) -> bool | None:
        return is_drying(self.unit or {})


def _add_plug_states(coordinator: BamBuddyPlugCoordinator, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    """A plug's state where no switch shows it: a plug BamBuddy only
    watches (MQTT)."""

    def create(plug: Plug) -> list[tuple[str, Callable[[], BinarySensorEntity]]]:
        if plug.kind != "monitor":
            return []
        return [("power", partial(BamBuddyPlugState, coordinator, plug))]

    async_add_plug_entities(coordinator, async_add_entities, create)


class BamBuddyPlugState(BamBuddyPlugEntity, BinarySensorEntity):
    """On while the plug delivers power, as BamBuddy reads it."""

    # The plug's own entity: named as its device, the plug.
    _attr_name = None
    _attr_translation_key = "plug"
    _attr_device_class = BinarySensorDeviceClass.POWER

    def __init__(self, coordinator: BamBuddyPlugCoordinator, plug: Plug) -> None:
        super().__init__(coordinator, plug, "power")

    @property
    def available(self) -> bool:
        return super().available and self.plug is not None and self.plug.reachable

    @property
    def is_on(self) -> bool | None:
        return self.plug.state if self.plug else None

    @property
    def capability_attributes(self) -> dict[str, Any] | None:
        return self.plug_role()

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return self.plug_attributes()
