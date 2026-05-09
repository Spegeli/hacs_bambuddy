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
from homeassistant.helpers.entity import DeviceInfo, EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

# ── Instance Sensors ───────────────────────────────────────────────────────

INSTANCE_SENSORS: list[SensorEntityDescription] = [
    SensorEntityDescription(key="version", name="Version", icon="mdi:tag"),
    SensorEntityDescription(key="health_status", name="Health Status", icon="mdi:heart-pulse"),
    SensorEntityDescription(key="uptime", name="Uptime", icon="mdi:clock-outline", native_unit_of_measurement=UnitOfTime.HOURS, device_class=SensorDeviceClass.DURATION, state_class=SensorStateClass.MEASUREMENT),
    SensorEntityDescription(key="total_prints", name="Total Prints", icon="mdi:printer-3d", state_class=SensorStateClass.TOTAL_INCREASING),
    SensorEntityDescription(key="successful_prints", name="Successful Prints", icon="mdi:printer-3d-nozzle-alert-outline", state_class=SensorStateClass.TOTAL_INCREASING),
    SensorEntityDescription(key="failed_prints", name="Failed Prints", icon="mdi:printer-3d-nozzle-alert", state_class=SensorStateClass.TOTAL_INCREASING),
    SensorEntityDescription(key="total_print_time", name="Total Print Time", icon="mdi:timer", native_unit_of_measurement=UnitOfTime.HOURS, device_class=SensorDeviceClass.DURATION),
    SensorEntityDescription(key="total_filament_used", name="Total Filament Used", icon="mdi:spool", native_unit_of_measurement="g"),
    SensorEntityDescription(key="archive_count", name="Archive Count", icon="mdi:archive"),
    SensorEntityDescription(key="printers_total", name="Printers Total", icon="mdi:printer-3d"),
    SensorEntityDescription(key="printers_connected", name="Printers Connected", icon="mdi:printer-3d-nozzle"),
    SensorEntityDescription(key="disk_free", name="Disk Free", icon="mdi:harddisk", native_unit_of_measurement="GB"),
    SensorEntityDescription(key="disk_percent_used", name="Disk Used", icon="mdi:harddisk", native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT),
]

# ── Printer Sensors ────────────────────────────────────────────────────────

PRINTER_SENSORS: list[SensorEntityDescription] = [
    SensorEntityDescription(key="status", name="Status", icon="mdi:printer-3d"),
    SensorEntityDescription(key="current_print", name="Current Print", icon="mdi:file-cad"),
    SensorEntityDescription(key="progress", name="Progress", icon="mdi:percent", native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT, suggested_display_precision=0),
    SensorEntityDescription(key="remaining_time", name="Remaining Time", icon="mdi:timer-sand", native_unit_of_measurement=UnitOfTime.MINUTES, device_class=SensorDeviceClass.DURATION),
    SensorEntityDescription(key="current_layer", name="Current Layer", icon="mdi:layers"),
    SensorEntityDescription(key="total_layers", name="Total Layers", icon="mdi:layers-triple"),
    SensorEntityDescription(key="nozzle_temp", name="Nozzle Temperature", icon="mdi:thermometer", native_unit_of_measurement=UnitOfTemperature.CELSIUS, device_class=SensorDeviceClass.TEMPERATURE, state_class=SensorStateClass.MEASUREMENT, suggested_display_precision=0),
    SensorEntityDescription(key="bed_temp", name="Bed Temperature", icon="mdi:thermometer", native_unit_of_measurement=UnitOfTemperature.CELSIUS, device_class=SensorDeviceClass.TEMPERATURE, state_class=SensorStateClass.MEASUREMENT, suggested_display_precision=0),
    SensorEntityDescription(key="chamber_temp", name="Chamber Temperature", icon="mdi:thermometer", native_unit_of_measurement=UnitOfTemperature.CELSIUS, device_class=SensorDeviceClass.TEMPERATURE, state_class=SensorStateClass.MEASUREMENT),
    SensorEntityDescription(key="hms_status", name="HMS Status", icon="mdi:alert-circle-outline"),
    SensorEntityDescription(key="subtask_name", name="Subtask", icon="mdi:file-cad"),
    SensorEntityDescription(key="gcode_file", name="GCode File", icon="mdi:file-code"),
    SensorEntityDescription(key="cooling_fan_speed", name="Cooling Fan", icon="mdi:fan", native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT),
    SensorEntityDescription(key="aux_fan_speed", name="Auxiliary Fan", icon="mdi:fan", native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT),
    SensorEntityDescription(key="chamber_fan_speed", name="Chamber Fan", icon="mdi:fan", native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT),
    SensorEntityDescription(key="heatbreak_fan_speed", name="Heatbreak Fan", icon="mdi:fan", native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT),
    SensorEntityDescription(key="printable_objects_count", name="Printable Objects", icon="mdi:cube-outline"),
    SensorEntityDescription(key="ip_address", name="IP Address", icon="mdi:ip-network", entity_category=EntityCategory.DIAGNOSTIC),
    SensorEntityDescription(key="firmware_version", name="Firmware Version", icon="mdi:chip", entity_category=EntityCategory.DIAGNOSTIC),
    SensorEntityDescription(key="wifi_signal", name="WiFi Signal", icon="mdi:wifi", native_unit_of_measurement="dBm", device_class=SensorDeviceClass.SIGNAL_STRENGTH, state_class=SensorStateClass.MEASUREMENT, entity_category=EntityCategory.DIAGNOSTIC),
    SensorEntityDescription(key="model", name="Model", icon="mdi:printer-3d", entity_category=EntityCategory.DIAGNOSTIC),
]


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up BamBuddy sensors."""
    data = hass.data[DOMAIN][entry.entry_id]
    entities = []

    entities.extend(
        BamBuddyInstanceSensor(data["coordinator"], entry, description)
        for description in INSTANCE_SENSORS
    )

    for printer_data in data["printers"].values():
        coordinator = printer_data["coordinator"]
        status_data = (coordinator.data or {}).get("status", {})
        for description in PRINTER_SENSORS:
            if description.key == "chamber_temp":
                if status_data.get("temperatures", {}).get("chamber") is None:
                    continue
            entities.append(BamBuddyPrinterSensor(coordinator, entry, printer_data, description))

    async_add_entities(entities)


# ── Instance Sensor Entity ─────────────────────────────────────────────────

class BamBuddyInstanceSensor(CoordinatorEntity, SensorEntity):
    """BamBuddy instance sensor."""

    def __init__(self, coordinator, entry: ConfigEntry, description: SensorEntityDescription) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=f"BamBuddy ({entry.data['host']})",
            manufacturer="BamBuddy",
            model="BamBuddy Instance",
            configuration_url=f"http://{entry.data['host']}:{entry.data['port']}",
        )

    @property
    def native_value(self):
        data = self.coordinator.data
        if not data:
            return None

        key = self.entity_description.key
        health = data.get("health", {})
        system_info = data.get("system_info", {})
        statistics = data.get("statistics", {})

        if key == "health_status":
            return health.get("status")
        if key == "version":
            return system_info.get("app", {}).get("version")
        if key == "uptime":
            seconds = system_info.get("system", {}).get("uptime_seconds", 0)
            return round(seconds / 3600, 2)
        if key == "archive_count":
            return system_info.get("database", {}).get("archives")
        if key == "printers_total":
            return system_info.get("printers", {}).get("total")
        if key == "printers_connected":
            return system_info.get("printers", {}).get("connected")
        if key == "disk_free":
            free_bytes = system_info.get("storage", {}).get("disk_free_bytes")
            return round(free_bytes / 1_073_741_824, 1) if free_bytes is not None else None
        if key == "disk_percent_used":
            return system_info.get("storage", {}).get("disk_percent_used")
        if key == "total_prints":
            return statistics.get("total_prints")
        if key == "successful_prints":
            return statistics.get("successful_prints")
        if key == "failed_prints":
            return statistics.get("failed_prints")
        if key == "total_print_time":
            return statistics.get("total_print_time_hours")
        if key == "total_filament_used":
            return statistics.get("total_filament_grams")
        return None


# ── Printer Sensor Entity ──────────────────────────────────────────────────

class BamBuddyPrinterSensor(CoordinatorEntity, SensorEntity):
    """BamBuddy printer sensor."""

    def __init__(self, coordinator, entry: ConfigEntry, printer_data: dict, description: SensorEntityDescription) -> None:
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
    def native_value(self):
        data = self.coordinator.data
        if not data:
            return None

        printer = data.get("printer", {})
        status = data.get("status", {})
        key = self.entity_description.key

        if key == "status":
            return status.get("state") or printer.get("status")
        if key == "current_print":
            return status.get("current_print") or status.get("subtask_name")
        if key == "progress":
            return status.get("progress")
        if key == "remaining_time":
            return status.get("remaining_time")
        if key == "current_layer":
            return status.get("layer_num")
        if key == "model":
            return printer.get("model")
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
        if key == "subtask_name":
            return status.get("subtask_name")
        if key == "gcode_file":
            return status.get("gcode_file")
        if key == "cooling_fan_speed":
            return status.get("cooling_fan_speed")
        if key == "aux_fan_speed":
            return status.get("big_fan1_speed")
        if key == "chamber_fan_speed":
            return status.get("big_fan2_speed")
        if key == "heatbreak_fan_speed":
            return status.get("heatbreak_fan_speed")
        if key == "printable_objects_count":
            return status.get("printable_objects_count")
        if key == "ip_address":
            return printer.get("ip_address")
        if key == "firmware_version":
            return status.get("firmware_version")
        if key == "wifi_signal":
            return status.get("wifi_signal")
        return None
