"""BamBuddy sensors."""
from __future__ import annotations

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    PERCENTAGE,
    UnitOfTemperature,
    UnitOfTime,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, ENTRY_TYPE_INSTANCE, ENTRY_TYPE_PRINTER

# ── Instance Sensors ───────────────────────────────────────────────────────

INSTANCE_SENSORS: list[SensorEntityDescription] = [
    SensorEntityDescription(key="version", name="Version", icon="mdi:tag"),
    SensorEntityDescription(key="health_status", name="Health Status", icon="mdi:heart-pulse"),
    SensorEntityDescription(key="health_database", name="Database Status", icon="mdi:database"),
    SensorEntityDescription(key="health_mqtt", name="MQTT Status", icon="mdi:mqtt"),
    SensorEntityDescription(key="uptime", name="Uptime", icon="mdi:clock-outline", native_unit_of_measurement=UnitOfTime.SECONDS, device_class=SensorDeviceClass.DURATION),
    SensorEntityDescription(key="total_prints", name="Total Prints", icon="mdi:printer-3d", state_class=SensorStateClass.TOTAL_INCREASING),
    SensorEntityDescription(key="successful_prints", name="Successful Prints", icon="mdi:printer-3d-nozzle-alert-outline"),
    SensorEntityDescription(key="failed_prints", name="Failed Prints", icon="mdi:printer-3d-nozzle-alert"),
    SensorEntityDescription(key="success_rate", name="Success Rate", icon="mdi:percent", native_unit_of_measurement=PERCENTAGE),
    SensorEntityDescription(key="total_print_time", name="Total Print Time", icon="mdi:timer", native_unit_of_measurement=UnitOfTime.SECONDS, device_class=SensorDeviceClass.DURATION),
    SensorEntityDescription(key="total_filament_used", name="Total Filament Used", icon="mdi:spool", native_unit_of_measurement="g"),
    SensorEntityDescription(key="archive_count", name="Archive Count", icon="mdi:archive"),
]

# ── Printer Sensors ────────────────────────────────────────────────────────

PRINTER_SENSORS: list[SensorEntityDescription] = [
    SensorEntityDescription(key="status", name="Status", icon="mdi:printer-3d"),
    SensorEntityDescription(key="model", name="Model", icon="mdi:printer-3d"),
    SensorEntityDescription(key="current_print", name="Current Print", icon="mdi:file-cad"),
    SensorEntityDescription(key="progress", name="Progress", icon="mdi:percent", native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT),
    SensorEntityDescription(key="remaining_time", name="Remaining Time", icon="mdi:timer-sand", native_unit_of_measurement=UnitOfTime.SECONDS, device_class=SensorDeviceClass.DURATION),
    SensorEntityDescription(key="current_layer", name="Current Layer", icon="mdi:layers"),
    SensorEntityDescription(key="total_layers", name="Total Layers", icon="mdi:layers-triple"),
    SensorEntityDescription(key="nozzle_temp", name="Nozzle Temperature", icon="mdi:thermometer", native_unit_of_measurement=UnitOfTemperature.CELSIUS, device_class=SensorDeviceClass.TEMPERATURE, state_class=SensorStateClass.MEASUREMENT),
    SensorEntityDescription(key="bed_temp", name="Bed Temperature", icon="mdi:thermometer", native_unit_of_measurement=UnitOfTemperature.CELSIUS, device_class=SensorDeviceClass.TEMPERATURE, state_class=SensorStateClass.MEASUREMENT),
    SensorEntityDescription(key="chamber_temp", name="Chamber Temperature", icon="mdi:thermometer", native_unit_of_measurement=UnitOfTemperature.CELSIUS, device_class=SensorDeviceClass.TEMPERATURE, state_class=SensorStateClass.MEASUREMENT),
    SensorEntityDescription(key="hms_status", name="HMS Status", icon="mdi:alert-circle-outline"),
]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    """Set up BamBuddy sensors."""
    data = hass.data[DOMAIN][entry.entry_id]
    coordinator = data["coordinator"]
    entry_type = data["entry_type"]

    if entry_type == ENTRY_TYPE_INSTANCE:
        async_add_entities([
            BamBuddyInstanceSensor(coordinator, entry, description)
            for description in INSTANCE_SENSORS
        ])
    elif entry_type == ENTRY_TYPE_PRINTER:
        async_add_entities([
            BamBuddyPrinterSensor(coordinator, entry, description)
            for description in PRINTER_SENSORS
        ])


# ── Instance Sensor Entity ─────────────────────────────────────────────────

class BamBuddyInstanceSensor(CoordinatorEntity, SensorEntity):
    """BamBuddy instance sensor."""

    def __init__(self, coordinator, entry: ConfigEntry, description: SensorEntityDescription) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=f"BamBuddy ({entry.data['host']})",
            manufacturer="BamBuddy",
            model="BamBuddy Instance",
            sw_version=entry.data.get("version", "unknown"),
            configuration_url=f"http://{entry.data['host']}:{entry.data['port']}",
        )

    @property
    def native_value(self):
        data = self.coordinator.data
        if not data:
            return None

        key = self.entity_description.key

        if key == "version":
            return data.get("system_info", {}).get("version")
        if key == "health_status":
            return data.get("health", {}).get("status")
        if key == "health_database":
            return data.get("health", {}).get("database")
        if key == "health_mqtt":
            return data.get("health", {}).get("mqtt")
        if key == "uptime":
            return data.get("system_info", {}).get("uptime")
        if key == "archive_count":
            return data.get("system_info", {}).get("database", {}).get("archives")
        if key in ("total_prints", "successful_prints", "failed_prints", "success_rate", "total_print_time", "total_filament_used"):
            return data.get("statistics", {}).get(key)

        return None


# ── Printer Sensor Entity ──────────────────────────────────────────────────

class BamBuddyPrinterSensor(CoordinatorEntity, SensorEntity):
    """BamBuddy printer sensor."""

    def __init__(self, coordinator, entry: ConfigEntry, description: SensorEntityDescription) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.data.get("printer_name", f"Printer {entry.data.get('printer_id')}"),
            manufacturer="BamBuddy",
            model=None,
            via_device=(DOMAIN, entry.entry_id),
        )

    @property
    def native_value(self):
        data = self.coordinator.data
        if not data:
            return None

        printer = data.get("printer", {})
        status = data.get("status", {})
        key = self.entity_description.key

        if key == "status":
            return status.get("state") or printer.get("status")
        if key == "model":
            return printer.get("model")
        if key == "current_print":
            cp = printer.get("current_print") or {}
            return cp.get("filename")
        if key == "progress":
            return status.get("progress") or (printer.get("current_print") or {}).get("progress")
        if key == "remaining_time":
            return status.get("remaining_time") or (printer.get("current_print") or {}).get("remaining_time")
        if key == "current_layer":
            return status.get("current_layer")
        if key == "total_layers":
            return status.get("total_layers")
        if key == "nozzle_temp":
            return status.get("temperatures", {}).get("nozzle")
        if key == "bed_temp":
            return status.get("temperatures", {}).get("bed")
        if key == "chamber_temp":
            return status.get("temperatures", {}).get("chamber")
        if key == "hms_status":
            return status.get("hms_status")

        return None
