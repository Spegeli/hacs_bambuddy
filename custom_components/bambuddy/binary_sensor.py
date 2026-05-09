"""BamBuddy binary sensor entities."""
from __future__ import annotations

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo, EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

PRINTER_BINARY_SENSORS: list[BinarySensorEntityDescription] = [
    BinarySensorEntityDescription(
        key="connected",
        name="Online",
        device_class=BinarySensorDeviceClass.CONNECTIVITY,
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    BinarySensorEntityDescription(
        key="sdcard",
        name="SD Card",
        device_class=BinarySensorDeviceClass.PRESENCE,
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    BinarySensorEntityDescription(
        key="hms_errors",
        name="HMS Errors",
        device_class=BinarySensorDeviceClass.PROBLEM,
    ),
    BinarySensorEntityDescription(
        key="wired_network",
        name="Wired Network",
        icon="mdi:ethernet",
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    BinarySensorEntityDescription(
        key="developer_mode",
        name="Developer Mode",
        icon="mdi:code-braces",
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
]


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up BamBuddy binary sensors."""
    data = hass.data[DOMAIN][entry.entry_id]
    entities = []
    for printer_data in data["printers"].values():
        entities.extend(
            BamBuddyPrinterBinarySensor(printer_data["coordinator"], entry, printer_data, description)
            for description in PRINTER_BINARY_SENSORS
        )
    async_add_entities(entities)


class BamBuddyPrinterBinarySensor(CoordinatorEntity, BinarySensorEntity):
    """BamBuddy printer binary sensor."""

    def __init__(
        self,
        coordinator,
        entry: ConfigEntry,
        printer_data: dict,
        description: BinarySensorEntityDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._printer_data = printer_data
        self._entry_id = entry.entry_id
        self._instance_url = f"http://{entry.data.get('host')}:{entry.data.get('port', 8000)}"
        self._attr_unique_id = f"{entry.entry_id}_p{printer_data['printer_id']}_{description.key}"

    @property
    def device_info(self) -> DeviceInfo:
        printer_info = (self.coordinator.data or {}).get("printer", {})
        status_info = (self.coordinator.data or {}).get("status", {})
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

    @property
    def is_on(self) -> bool | None:
        data = self.coordinator.data
        if not data:
            return None
        status = data.get("status", {})
        key = self.entity_description.key
        if key == "connected":
            return status.get("connected")
        if key == "sdcard":
            return status.get("sdcard")
        if key == "hms_errors":
            errors = status.get("hms_errors", [])
            return len(errors) > 0 if isinstance(errors, list) else bool(errors)
        if key == "wired_network":
            return status.get("wired_network")
        if key == "developer_mode":
            return status.get("developer_mode")
        return None
