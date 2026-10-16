"""BamBuddy's sensors: its own figures, each printer's status, and the AMS
units' slots, humidity and temperature."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import (
    PERCENTAGE,
    SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
    EntityCategory,
    UnitOfInformation,
    UnitOfLength,
    UnitOfMass,
    UnitOfTemperature,
    UnitOfTime,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.typing import StateType
from homeassistant.util import dt as dt_util

from .coordinator import BamBuddyConfigEntry, BamBuddyInstanceCoordinator, BamBuddyPrinterCoordinator
from .entity import BamBuddyAmsEntity, BamBuddyInstanceEntity, BamBuddyPrinterEntity
from .models import (
    AMS_STATUSES,
    EXTERNAL_LEFT,
    EXTERNAL_RIGHT,
    PRINT_STATUSES,
    STAGE_OPTIONS,
    PrinterData,
    active_tray,
    ams_key,
    ams_model,
    ams_status,
    bambuddy_name,
    can_dry,
    find_tray,
    nozzle_type,
    print_stage,
    print_status,
    slot_attributes,
    slot_state,
    tray_empty,
    tray_id,
    tray_label,
)

PARALLEL_UPDATES = 0

_SEVERITIES = {1: "error", 2: "warning", 3: "notice"}
# States of a job whose end can be told: a paused one ends whenever it is
# resumed.
_ENDING_STATES = frozenset({"PREPARE", "SLICING", "RUNNING"})


@dataclass(frozen=True, kw_only=True)
class BamBuddyInstanceSensorDescription(SensorEntityDescription):
    value_fn: Callable[[dict[str, Any]], StateType]


@dataclass(frozen=True, kw_only=True)
class BamBuddyPrinterSensorDescription(SensorEntityDescription):
    value_fn: Callable[[PrinterData], StateType | datetime]
    exists_fn: Callable[[PrinterData], bool] = lambda _: True
    attr_fn: Callable[[PrinterData], dict[str, Any]] | None = None
    available_when_offline: bool = False
    # Whether the printer has the value at all just now.
    available_fn: Callable[[PrinterData], bool] = lambda _: True


def _stat(key: str) -> Callable[[dict[str, Any]], StateType]:
    return lambda data: data["stats"].get(key)


def _system(section: str, key: str) -> Callable[[dict[str, Any]], StateType]:
    return lambda data: (data["system"].get(section) or {}).get(key)


INSTANCE_SENSORS: tuple[BamBuddyInstanceSensorDescription, ...] = (
    BamBuddyInstanceSensorDescription(
        key="total_prints", translation_key="total_prints",
        state_class=SensorStateClass.TOTAL_INCREASING, value_fn=_stat("total_prints"),
    ),
    BamBuddyInstanceSensorDescription(
        key="successful_prints", translation_key="successful_prints",
        state_class=SensorStateClass.TOTAL_INCREASING, value_fn=_stat("successful_prints"),
    ),
    BamBuddyInstanceSensorDescription(
        key="failed_prints", translation_key="failed_prints",
        state_class=SensorStateClass.TOTAL_INCREASING, value_fn=_stat("failed_prints"),
    ),
    BamBuddyInstanceSensorDescription(
        key="cancelled_prints", translation_key="cancelled_prints",
        state_class=SensorStateClass.TOTAL_INCREASING, value_fn=_stat("cancelled_prints"),
    ),
    BamBuddyInstanceSensorDescription(
        key="total_print_time", translation_key="total_print_time",
        device_class=SensorDeviceClass.DURATION, native_unit_of_measurement=UnitOfTime.HOURS,
        state_class=SensorStateClass.TOTAL_INCREASING, suggested_display_precision=0,
        value_fn=_stat("total_print_time_hours"),
    ),
    BamBuddyInstanceSensorDescription(
        key="total_filament_used", translation_key="total_filament_used",
        device_class=SensorDeviceClass.WEIGHT, native_unit_of_measurement=UnitOfMass.GRAMS,
        state_class=SensorStateClass.TOTAL_INCREASING, suggested_display_precision=0,
        value_fn=_stat("total_filament_grams"),
    ),
    BamBuddyInstanceSensorDescription(
        key="printers_connected", translation_key="printers_online", value_fn=_system("printers", "connected"),
    ),
    BamBuddyInstanceSensorDescription(
        key="printers_total", translation_key="printers_total", entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=_system("printers", "total"),
    ),
    BamBuddyInstanceSensorDescription(
        key="disk_free", translation_key="disk_free", device_class=SensorDeviceClass.DATA_SIZE,
        native_unit_of_measurement=UnitOfInformation.BYTES, suggested_unit_of_measurement=UnitOfInformation.GIGABYTES,
        suggested_display_precision=1, entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=_system("storage", "disk_free_bytes"),
    ),
    BamBuddyInstanceSensorDescription(
        key="disk_percent_used", translation_key="disk_usage", native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT, suggested_display_precision=0,
        entity_category=EntityCategory.DIAGNOSTIC, value_fn=_system("storage", "disk_percent_used"),
    ),
)  # fmt: skip


def _status(key: str) -> Callable[[PrinterData], StateType]:
    return lambda data: data.status.get(key)


def _temperature(key: str) -> Callable[[PrinterData], StateType]:
    return lambda data: data.temperatures.get(key)


def _text(key: str) -> Callable[[PrinterData], StateType]:
    """A text BamBuddy sends empty when there is none."""
    return lambda data: data.status.get(key) or None


def _end_time(data: PrinterData) -> datetime | None:
    """Now plus the remaining minutes, to the minute: the time stays put
    from poll to poll."""
    remaining = data.status.get("remaining_time")
    if data.state not in _ENDING_STATES or not isinstance(remaining, int) or remaining <= 0:
        return None
    return dt_util.utcnow().replace(second=0, microsecond=0) + timedelta(minutes=remaining)


def _hms_errors(data: PrinterData) -> dict[str, Any]:
    """Each error with the code Bambu Lab's wiki knows it by."""
    errors = []
    for error in data.status.get("hms_errors") or []:
        code = str(error.get("full_code") or error.get("code") or "")
        errors.append(
            {
                "code": "_".join(code[i : i + 4] for i in range(0, len(code), 4)) if code.isalnum() else code,
                "severity": _SEVERITIES.get(error.get("severity"), "unknown"),
                "description": error.get("description"),
            }
        )
    return {"errors": errors}


def _active_filament(data: PrinterData) -> str:
    loaded = active_tray(data.status)
    found = find_tray(data, loaded) if loaded is not None else None
    return tray_label(found[0]) if found and not tray_empty(found[0]) else "none"


def _active_filament_attributes(data: PrinterData) -> dict[str, Any]:
    loaded = active_tray(data.status)
    found = find_tray(data, loaded) if loaded is not None else None
    if found is None or loaded is None:
        return {}
    return slot_attributes(found[0], found[1], loaded, loaded)


def _find_spool(data: PrinterData, tray: int | None) -> dict[str, Any] | None:
    """An external spool by BamBuddy's id (254 left, 255 right on two-nozzle
    printers); None: the only one."""
    spools = data.external_spools
    if tray is None:
        return spools[0] if spools else None
    return next((spool for spool in spools if spool.get("id") == tray), None)


def _spool(tray: int | None) -> Callable[[PrinterData], StateType]:
    def value(data: PrinterData) -> StateType:
        spool = _find_spool(data, tray)
        return slot_state(spool) if spool is not None else None

    return value


def _spool_attributes(tray: int | None) -> Callable[[PrinterData], dict[str, Any]]:
    def attributes(data: PrinterData) -> dict[str, Any]:
        spool = _find_spool(data, tray)
        if spool is None:
            return {}
        number = 2 if spool.get("id") == EXTERNAL_RIGHT else 1
        return slot_attributes(spool, number, int(spool.get("id", EXTERNAL_LEFT)), active_tray(data.status))

    return attributes


def _nozzle(index: int, field: str) -> Callable[[PrinterData], StateType]:
    """BamBuddy's `nozzles`: 0 the only or the right nozzle, 1 the left."""

    def value(data: PrinterData) -> StateType:
        nozzles = data.status.get("nozzles") or []
        text = nozzles[index].get(field) if index < len(nozzles) else None
        if not text:
            return None
        if field == "nozzle_diameter":
            try:
                return float(text)
            except ValueError:
                return None
        return nozzle_type(str(text))

    return value


def _single(data: PrinterData) -> bool:
    return not data.is_dual_nozzle


def _dual(data: PrinterData) -> bool:
    return data.is_dual_nozzle


def _temperature_sensor(
    key: str, translation_key: str, field: str, exists_fn: Callable[[PrinterData], bool] = lambda _: True
) -> BamBuddyPrinterSensorDescription:
    return BamBuddyPrinterSensorDescription(
        key=key,
        translation_key=translation_key,
        device_class=SensorDeviceClass.TEMPERATURE,
        native_unit_of_measurement=UnitOfTemperature.CELSIUS,
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=0,
        exists_fn=exists_fn,
        value_fn=_temperature(field),
    )


def _nozzle_sensors(
    index: int, prefix: str, translation_prefix: str, exists_fn: Callable[[PrinterData], bool]
) -> tuple[BamBuddyPrinterSensorDescription, BamBuddyPrinterSensorDescription]:
    """A nozzle's type and diameter, diagnostic."""
    return (
        BamBuddyPrinterSensorDescription(
            key=f"{prefix}_type",
            translation_key=f"{translation_prefix}nozzle_type",
            entity_category=EntityCategory.DIAGNOSTIC,
            exists_fn=exists_fn,
            value_fn=_nozzle(index, "nozzle_type"),
        ),
        BamBuddyPrinterSensorDescription(
            key=f"{prefix}_diameter",
            translation_key=f"{translation_prefix}nozzle_diameter",
            device_class=SensorDeviceClass.DISTANCE,
            native_unit_of_measurement=UnitOfLength.MILLIMETERS,
            suggested_display_precision=1,
            entity_category=EntityCategory.DIAGNOSTIC,
            exists_fn=exists_fn,
            value_fn=_nozzle(index, "nozzle_diameter"),
        ),
    )


PRINTER_SENSORS: tuple[BamBuddyPrinterSensorDescription, ...] = (
    BamBuddyPrinterSensorDescription(
        key="status", translation_key="print_status", device_class=SensorDeviceClass.ENUM,
        options=PRINT_STATUSES, value_fn=print_status, available_when_offline=True,
        # The printer's name in BamBuddy, for the dashboard card's title.
        attr_fn=lambda data: {"bambuddy_name": bambuddy_name(data.info)},
    ),
    BamBuddyPrinterSensorDescription(
        key="print_hours", translation_key="print_hours", device_class=SensorDeviceClass.DURATION,
        native_unit_of_measurement=UnitOfTime.HOURS, state_class=SensorStateClass.TOTAL_INCREASING,
        suggested_display_precision=0, value_fn=lambda data: data.hours, available_when_offline=True,
    ),
    BamBuddyPrinterSensorDescription(
        key="stage", translation_key="print_stage", device_class=SensorDeviceClass.ENUM,
        options=STAGE_OPTIONS, value_fn=lambda data: print_stage(data.status),
    ),
    BamBuddyPrinterSensorDescription(
        key="progress", translation_key="progress", native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT, suggested_display_precision=0, value_fn=_status("progress"),
    ),
    BamBuddyPrinterSensorDescription(
        key="remaining_time", translation_key="remaining_time", device_class=SensorDeviceClass.DURATION,
        native_unit_of_measurement=UnitOfTime.MINUTES, value_fn=_status("remaining_time"),
    ),
    BamBuddyPrinterSensorDescription(
        key="end_time", translation_key="end_time", device_class=SensorDeviceClass.TIMESTAMP, value_fn=_end_time,
    ),
    BamBuddyPrinterSensorDescription(
        key="ams_status", translation_key="ams_status", device_class=SensorDeviceClass.ENUM,
        options=AMS_STATUSES, value_fn=lambda data: ams_status(data.status),
    ),
    # A state class keeps the layers out of the activity log: one entry
    # per layer would bury everything else.
    BamBuddyPrinterSensorDescription(
        key="current_layer", translation_key="current_layer", state_class=SensorStateClass.MEASUREMENT,
        value_fn=_status("layer_num"),
    ),
    BamBuddyPrinterSensorDescription(
        key="total_layers", translation_key="total_layers", state_class=SensorStateClass.MEASUREMENT,
        value_fn=_status("total_layers"),
    ),
    BamBuddyPrinterSensorDescription(
        key="current_print", translation_key="current_print", value_fn=_text("current_print"),
    ),
    _temperature_sensor("nozzle_temp", "nozzle_temperature", "nozzle", _single),
    # Two nozzles: BamBuddy's `nozzle` is the left one, `nozzle_2` the right.
    _temperature_sensor("nozzle_temp", "left_nozzle_temperature", "nozzle", _dual),
    _temperature_sensor("nozzle_2_temp", "right_nozzle_temperature", "nozzle_2", _dual),
    _temperature_sensor("bed_temp", "bed_temperature", "bed"),
    # Only for printers that report a chamber temperature when set up: the
    # A1 and P1 series have no chamber sensor.
    _temperature_sensor(
        "chamber_temp", "chamber_temperature", "chamber", lambda data: data.temperatures.get("chamber") is not None
    ),
    BamBuddyPrinterSensorDescription(
        key="heatbreak_fan_speed", translation_key="hotend_fan", native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT, entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=_status("heatbreak_fan_speed"),
    ),
    BamBuddyPrinterSensorDescription(
        key="hms_status", translation_key="hms_errors",
        value_fn=lambda data: len(data.status.get("hms_errors") or []), attr_fn=_hms_errors,
    ),
    BamBuddyPrinterSensorDescription(
        key="active_filament", translation_key="active_filament", value_fn=_active_filament,
        attr_fn=_active_filament_attributes,
    ),
    BamBuddyPrinterSensorDescription(
        key="external_spool", translation_key="external_spool", exists_fn=_single,
        value_fn=_spool(None), attr_fn=_spool_attributes(None),
    ),
    BamBuddyPrinterSensorDescription(
        key="external_spool", translation_key="left_external_spool", exists_fn=_dual,
        value_fn=_spool(EXTERNAL_LEFT), attr_fn=_spool_attributes(EXTERNAL_LEFT),
    ),
    BamBuddyPrinterSensorDescription(
        key="external_spool_2", translation_key="right_external_spool", exists_fn=_dual,
        value_fn=_spool(EXTERNAL_RIGHT), attr_fn=_spool_attributes(EXTERNAL_RIGHT),
    ),
    # BamBuddy's `nozzles`: 0 the only or the right nozzle, 1 the left one.
    *_nozzle_sensors(0, "nozzle", "", _single),
    *_nozzle_sensors(0, "nozzle", "right_", _dual),
    *_nozzle_sensors(1, "nozzle_2", "left_", _dual),
    BamBuddyPrinterSensorDescription(
        key="wifi_signal", translation_key="wifi_signal", device_class=SensorDeviceClass.SIGNAL_STRENGTH,
        native_unit_of_measurement=SIGNAL_STRENGTH_DECIBELS_MILLIWATT, state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        # BamBuddy reports -90 dBm for a printer on Ethernet: no signal to wait for.
        value_fn=lambda data: data.status.get("wifi_signal"),
        available_fn=lambda data: not data.status.get("wired_network"),
    ),
    BamBuddyPrinterSensorDescription(
        key="ip_address", translation_key="ip_address", entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda data: data.info.get("ip_address") or None,
    ),
    BamBuddyPrinterSensorDescription(
        key="printable_objects_count", translation_key="printable_objects", entity_registry_enabled_default=False,
        value_fn=_status("printable_objects_count"),
    ),
)  # fmt: skip


def _has_climate(unit: dict[str, Any], printer: PrinterData, field: str) -> bool:
    """Every AMS but the AMS Lite measures humidity and temperature;
    BamBuddy may not have the value yet when the integration starts."""
    return unit.get(field) is not None or ams_model(unit, printer) != "AMS Lite"


@dataclass(frozen=True, kw_only=True)
class BamBuddyAmsSensorDescription(SensorEntityDescription):
    value_fn: Callable[[dict[str, Any]], StateType]
    exists_fn: Callable[[dict[str, Any], PrinterData], bool] = lambda unit, _: True


AMS_SENSORS: tuple[BamBuddyAmsSensorDescription, ...] = (
    BamBuddyAmsSensorDescription(
        key="humidity", translation_key="ams_humidity", device_class=SensorDeviceClass.HUMIDITY,
        native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT,
        exists_fn=lambda unit, printer: _has_climate(unit, printer, "humidity"), value_fn=lambda unit: unit.get("humidity"),
    ),
    BamBuddyAmsSensorDescription(
        key="temperature", translation_key="ams_temperature", device_class=SensorDeviceClass.TEMPERATURE,
        native_unit_of_measurement=UnitOfTemperature.CELSIUS, state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=0,
        exists_fn=lambda unit, printer: _has_climate(unit, printer, "temp"), value_fn=lambda unit: unit.get("temp"),
    ),
    BamBuddyAmsSensorDescription(
        key="drying_remaining_time", translation_key="drying_remaining_time",
        device_class=SensorDeviceClass.DURATION, native_unit_of_measurement=UnitOfTime.MINUTES,
        exists_fn=can_dry,
        value_fn=lambda unit: unit.get("dry_time"),
    ),
)  # fmt: skip


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    entities: list[SensorEntity] = [
        BamBuddyInstanceSensor(runtime.instance, description) for description in INSTANCE_SENSORS
    ]
    for coordinator in runtime.printers.values():
        entities.extend(
            (BamBuddyEndTimeSensor if description.key == "end_time" else BamBuddyPrinterSensor)(coordinator, description)
            for description in PRINTER_SENSORS
            if description.exists_fn(coordinator.data)
        )
        _add_ams_units(coordinator, async_add_entities)
    async_add_entities(entities)


def _add_ams_units(coordinator: BamBuddyPrinterCoordinator, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    """The AMS units' sensors; units attached later get theirs when the
    printer first reports them."""
    known: set[str] = set()

    @callback
    def add_new_units() -> None:
        entities: list[SensorEntity] = []
        data = coordinator.data
        for unit in data.ams_units:
            unit_id = int(unit.get("id", 0))
            if ams_key(unit) in known or not coordinator.ams_unit_ready(unit):
                continue
            known.add(ams_key(unit))
            entities.extend(
                BamBuddyAmsSensor(coordinator, unit_id, description)
                for description in AMS_SENSORS
                if description.exists_fn(unit, data)
            )
            entities.extend(
                BamBuddyAmsSlotSensor(coordinator, unit_id, int(tray.get("id", 0))) for tray in unit.get("tray") or []
            )
        if entities:
            async_add_entities(entities)

    add_new_units()
    coordinator.config_entry.async_on_unload(coordinator.async_add_listener(add_new_units))


class BamBuddyInstanceSensor(BamBuddyInstanceEntity, SensorEntity):
    entity_description: BamBuddyInstanceSensorDescription

    def __init__(
        self, coordinator: BamBuddyInstanceCoordinator, description: BamBuddyInstanceSensorDescription
    ) -> None:
        # First: the entity ID is made from its translation key.
        self.entity_description = description
        super().__init__(coordinator, description.key)

    @property
    def native_value(self) -> StateType:
        return self.entity_description.value_fn(self.coordinator.data)


class BamBuddyPrinterSensor(BamBuddyPrinterEntity, SensorEntity):
    entity_description: BamBuddyPrinterSensorDescription
    # The HMS list can be long and changes with each error: kept out of the
    # recorder.
    _unrecorded_attributes = frozenset({"errors"})

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, description: BamBuddyPrinterSensorDescription) -> None:
        # First: the entity ID is made from its translation key.
        self.entity_description = description
        super().__init__(coordinator, description.key)
        self.available_when_offline = description.available_when_offline

    @property
    def available(self) -> bool:
        return super().available and self.entity_description.available_fn(self.data)

    @property
    def native_value(self) -> StateType | datetime:
        return self.entity_description.value_fn(self.data)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        attr_fn = self.entity_description.attr_fn
        return attr_fn(self.data) if attr_fn else None


class BamBuddyEndTimeSensor(BamBuddyPrinterSensor):
    """Moves only when the printer's estimate does: computed at each poll,
    polls on both sides of a minute boundary would flip it back and forth."""

    _remaining: int | None = None
    _end: datetime | None = None

    @property
    def native_value(self) -> datetime | None:
        remaining = self.data.status.get("remaining_time")
        if remaining != self._remaining or self._end is None:
            self._remaining = remaining if isinstance(remaining, int) else None
            self._end = _end_time(self.data)
        elif self.data.state not in _ENDING_STATES:
            self._end = None
        return self._end


class BamBuddyAmsSensor(BamBuddyAmsEntity, SensorEntity):
    entity_description: BamBuddyAmsSensorDescription

    def __init__(
        self, coordinator: BamBuddyPrinterCoordinator, ams_id: int, description: BamBuddyAmsSensorDescription
    ) -> None:
        super().__init__(coordinator, ams_id, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> StateType:
        unit = self.unit
        return self.entity_description.value_fn(unit) if unit else None


class BamBuddyAmsSlotSensor(BamBuddyAmsEntity, SensorEntity):
    """One slot of an AMS unit: the filament's name, or empty."""

    _attr_translation_key = "ams_slot"

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, ams_id: int, slot: int) -> None:
        super().__init__(coordinator, ams_id, f"slot_{slot + 1}")
        self.slot = slot
        self._attr_translation_placeholders = {"slot": str(slot + 1)}

    @property
    def tray(self) -> dict[str, Any] | None:
        unit = self.unit or {}
        return next((tray for tray in unit.get("tray") or [] if tray.get("id") == self.slot), None)

    @property
    def available(self) -> bool:
        return super().available and self.tray is not None

    @property
    def native_value(self) -> StateType:
        tray = self.tray
        return slot_state(tray) if tray is not None else None

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        tray = self.tray
        if tray is None:
            return None
        return slot_attributes(tray, self.slot + 1, tray_id(self.ams_id, self.slot), active_tray(self.data.status))
