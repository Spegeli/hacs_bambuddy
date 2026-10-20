"""BamBuddy's sensors: its own figures, each printer's status, the AMS
units' slots, humidity and temperature, and the smart plugs' power and
energy."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import partial
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
    UnitOfEnergy,
    UnitOfInformation,
    UnitOfLength,
    UnitOfMass,
    UnitOfPower,
    UnitOfTemperature,
    UnitOfTime,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.typing import StateType
from homeassistant.util import dt as dt_util

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
from .models import (
    ACTIVE_STATES,
    AMS_STATUSES,
    EXTERNAL_LEFT,
    EXTERNAL_RIGHT,
    PRINT_STATUSES,
    STAGE_OPTIONS,
    PrinterData,
    active_tray,
    ams_model,
    ams_status,
    bambuddy_name,
    find_tray,
    has_heater,
    hms_answers,
    maintenance_state,
    maintenance_task,
    nozzle_type,
    print_stage,
    print_status,
    slot_attributes,
    slot_state,
    tray_empty,
    tray_id,
    tray_label,
)
from .plugs import Plug

PARALLEL_UPDATES = 0

_SEVERITIES = {1: "error", 2: "warning", 3: "notice"}


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
    # Whether the entity is on at first, from what the printer reports then.
    enabled_fn: Callable[[PrinterData], bool] = lambda _: True


def _stat(key: str) -> Callable[[dict[str, Any]], StateType]:
    return lambda data: data["stats"].get(key)


def _system(section: str, key: str) -> Callable[[dict[str, Any]], StateType]:
    return lambda data: (data["system"].get(section) or {}).get(key)


# BamBuddy's totals go down when archives are purged with their statistics
# or its print log is cleared: totals, not meters that only grow.
INSTANCE_SENSORS: tuple[BamBuddyInstanceSensorDescription, ...] = (
    BamBuddyInstanceSensorDescription(
        key="total_prints", translation_key="total_prints",
        state_class=SensorStateClass.TOTAL, value_fn=_stat("total_prints"),
    ),
    BamBuddyInstanceSensorDescription(
        key="successful_prints", translation_key="successful_prints",
        state_class=SensorStateClass.TOTAL, value_fn=_stat("successful_prints"),
    ),
    BamBuddyInstanceSensorDescription(
        key="failed_prints", translation_key="failed_prints",
        state_class=SensorStateClass.TOTAL, value_fn=_stat("failed_prints"),
    ),
    BamBuddyInstanceSensorDescription(
        key="cancelled_prints", translation_key="cancelled_prints",
        state_class=SensorStateClass.TOTAL, value_fn=_stat("cancelled_prints"),
    ),
    BamBuddyInstanceSensorDescription(
        key="total_print_time", translation_key="total_print_time",
        device_class=SensorDeviceClass.DURATION, native_unit_of_measurement=UnitOfTime.HOURS,
        state_class=SensorStateClass.TOTAL, suggested_display_precision=0,
        value_fn=_stat("total_print_time_hours"),
    ),
    BamBuddyInstanceSensorDescription(
        key="total_filament_used", translation_key="total_filament_used",
        device_class=SensorDeviceClass.WEIGHT, native_unit_of_measurement=UnitOfMass.GRAMS,
        state_class=SensorStateClass.TOTAL, suggested_display_precision=0,
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
        native_unit_of_measurement=UnitOfInformation.BYTES, suggested_unit_of_measurement=UnitOfInformation.GIBIBYTES,
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


# How far an estimate that stands still may fall behind the clock.
END_TIME_DRIFT = timedelta(minutes=2)


def _end_time(data: PrinterData) -> datetime | None:
    """Now plus the remaining minutes, to the minute: the time stays put
    from poll to poll."""
    remaining = data.status.get("remaining_time")
    if data.state not in ACTIVE_STATES or not isinstance(remaining, int) or remaining <= 0:
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
                # What the printer's screen offers to answer (the card shows them).
                "actions": hms_answers(error),
            }
        )
    return {"errors": errors}


def _active_slot(data: PrinterData) -> tuple[dict[str, Any], int, int] | None:
    """The slot the printer feeds from: its tray, its slot number and
    BamBuddy's global id of it."""
    loaded = active_tray(data)
    found = find_tray(data, loaded) if loaded is not None else None
    return None if found is None or loaded is None else (found[0], found[1], loaded)


def _active_filament(data: PrinterData) -> str:
    slot = _active_slot(data)
    return tray_label(slot[0]) if slot and not tray_empty(slot[0]) else "none"


def _active_filament_attributes(data: PrinterData) -> dict[str, Any]:
    slot = _active_slot(data)
    if slot is None:
        return {}
    tray, place, loaded = slot
    return slot_attributes(tray, place, loaded, loaded)


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
        return slot_attributes(spool, number, int(spool.get("id", EXTERNAL_LEFT)), active_tray(data))

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
            # A nozzle is told by its millimetres, also where inches are the unit.
            suggested_unit_of_measurement=UnitOfLength.MILLIMETERS,
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
        # A total: BamBuddy's print hours offset can be lowered.
        native_unit_of_measurement=UnitOfTime.HOURS, state_class=SensorStateClass.TOTAL,
        suggested_display_precision=0, value_fn=lambda data: data.hours, available_when_offline=True,
    ),
    BamBuddyPrinterSensorDescription(
        key="maintenance", translation_key="maintenance", device_class=SensorDeviceClass.ENUM,
        options=["ok", "due_soon", "overdue"], value_fn=maintenance_state,
        # BamBuddy keeps it, not the printer.
        available_when_offline=True, available_fn=lambda data: data.maintenance is not None,
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
    # Known as the temperatures are: "nozzle" the only or the left one,
    # "nozzle_2" the right one.
    *_nozzle_sensors(0, "nozzle", "", _single),
    *_nozzle_sensors(1, "nozzle", "left_", _dual),
    *_nozzle_sensors(0, "nozzle_2", "right_", _dual),
    BamBuddyPrinterSensorDescription(
        key="wifi_signal", translation_key="wifi_signal", device_class=SensorDeviceClass.SIGNAL_STRENGTH,
        native_unit_of_measurement=SIGNAL_STRENGTH_DECIBELS_MILLIWATT, state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        # BamBuddy reports -90 dBm for a printer on Ethernet: no signal to wait for.
        value_fn=lambda data: data.status.get("wifi_signal"),
        available_fn=lambda data: not data.wired,
        # On a cable from the start: no signal to show.
        enabled_fn=lambda data: not data.wired,
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


def _has_climate(unit: dict[str, Any], printer: PrinterData) -> bool:
    """Every AMS but the AMS Lite measures humidity and temperature;
    BamBuddy may not have the value yet when the integration starts. The
    Lite sends a fixed 0 instead (temperature, on the A2L humidity too):
    never a sensor. A unit of a printer without a model may be a Lite: only
    one BamBuddy has named (AMS, AMS 2 Pro, AMS HT) gets them before the
    model comes (the entry reloads then)."""
    if ams_model(unit, printer) == "AMS Lite":
        return False
    if printer.model.strip():
        return True
    unit_id = unit.get("id", 0)
    return bool(unit.get("module_type")) or (isinstance(unit_id, int) and unit_id >= 128)


@dataclass(frozen=True, kw_only=True)
class BamBuddyAmsSensorDescription(SensorEntityDescription):
    value_fn: Callable[[dict[str, Any]], StateType]
    exists_fn: Callable[[dict[str, Any], PrinterData], bool] = lambda unit, _: True


AMS_SENSORS: tuple[BamBuddyAmsSensorDescription, ...] = (
    BamBuddyAmsSensorDescription(
        key="humidity", translation_key="ams_humidity", device_class=SensorDeviceClass.HUMIDITY,
        native_unit_of_measurement=PERCENTAGE, state_class=SensorStateClass.MEASUREMENT,
        exists_fn=_has_climate, value_fn=lambda unit: unit.get("humidity"),
    ),
    BamBuddyAmsSensorDescription(
        key="temperature", translation_key="ams_temperature", device_class=SensorDeviceClass.TEMPERATURE,
        native_unit_of_measurement=UnitOfTemperature.CELSIUS, state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=0,
        exists_fn=_has_climate, value_fn=lambda unit: unit.get("temp"),
    ),
    BamBuddyAmsSensorDescription(
        key="drying_remaining_time", translation_key="drying_remaining_time",
        device_class=SensorDeviceClass.DURATION, native_unit_of_measurement=UnitOfTime.MINUTES,
        exists_fn=has_heater,
        # 0 while not drying: nothing left to wait for, no "0 min"; nor
        # while the countdown stands still (BamBuddy's dry_countdown_stalled).
        value_fn=lambda unit: None if unit.get("dry_countdown_stalled") else unit.get("dry_time") or None,
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
            _PRINTER_SENSOR_CLASSES.get(description.key, BamBuddyPrinterSensor)(coordinator, description)
            for description in PRINTER_SENSORS
            if description.exists_fn(coordinator.data)
        )
        _add_ams_units(coordinator, async_add_entities)
    _add_plug_sensors(runtime.plugs, async_add_entities)
    async_add_entities(entities)


def _add_ams_units(coordinator: BamBuddyPrinterCoordinator, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    """The AMS units' sensors and slots."""

    def create(unit: dict[str, Any], data: PrinterData) -> list[tuple[str, Callable[[], SensorEntity]]]:
        unit_id = int(unit.get("id", 0))
        trays = [int(tray.get("id", 0)) for tray in unit.get("tray") or []]
        return [
            *(
                (description.key, partial(BamBuddyAmsSensor, coordinator, unit_id, description))
                for description in AMS_SENSORS
                if description.exists_fn(unit, data)
            ),
            *((f"slot_{tray}", partial(BamBuddyAmsSlotSensor, coordinator, unit_id, tray)) for tray in trays),
        ]

    async_add_ams_entities(coordinator, async_add_entities, create)


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
        # No figures yet when BamBuddy's first answer failed.
        data = self.coordinator.data
        return None if data is None else self.entity_description.value_fn(data)


class BamBuddyPrinterSensor(BamBuddyDescribedEntity, SensorEntity):
    entity_description: BamBuddyPrinterSensorDescription
    # The HMS list can be long and changes with each error: kept out of the
    # recorder.
    _unrecorded_attributes = frozenset({"errors"})

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, description: BamBuddyPrinterSensorDescription) -> None:
        super().__init__(coordinator, description)
        if not description.enabled_fn(coordinator.data):
            self._attr_entity_registry_enabled_default = False

    @property
    def available(self) -> bool:
        return super().available and self.entity_description.available_fn(self.data)

    @callback
    def _handle_coordinator_update(self) -> None:
        if self.entity_description.key != "status":
            super()._handle_coordinator_update()
            return
        # The print status last of the poll: Home Assistant starts an
        # automation at once, and a "print finished" trigger reads the
        # printer's other entities -- they must be the same poll's.
        self.hass.loop.call_soon(self.async_write_ha_state)

    @property
    def native_value(self) -> StateType | datetime:
        return self.entity_description.value_fn(self.data)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        attr_fn = self.entity_description.attr_fn
        return attr_fn(self.data) if attr_fn else None


class BamBuddyMaintenanceSensor(BamBuddyPrinterSensor):
    """BamBuddy's maintenance of the printer: overdue when a task is due,
    due soon in a task's last tenth. Its tasks (enabled ones), and whether
    the key may mark them done."""

    _unrecorded_attributes = frozenset({"tasks"})

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        tasks = self.data.maintenance_tasks
        return {
            "tasks": [maintenance_task(task) for task in tasks],
            "due_count": sum(1 for task in tasks if task.get("is_due")),
            "due_soon_count": sum(1 for task in tasks if task.get("is_warning") and not task.get("is_due")),
            "can_mark_done": self.coordinator.config_entry.runtime_data.can_manage_maintenance,
        }


class BamBuddyEndTimeSensor(BamBuddyPrinterSensor):
    """Moves when the printer's estimate does: computed at each poll, polls
    on both sides of a minute boundary would flip it back and forth. The
    printer keeps its estimate while it prepares or changes filament: once
    the clock is 2 minutes past the held end, it moves on with it."""

    _remaining: int | None = None
    _end: datetime | None = None

    @property
    def native_value(self) -> datetime | None:
        remaining = self.data.status.get("remaining_time")
        behind = (
            isinstance(remaining, int)
            and self._end is not None
            and dt_util.utcnow() + timedelta(minutes=remaining) - self._end >= END_TIME_DRIFT
        )
        if remaining != self._remaining or self._end is None or behind:
            self._remaining = remaining if isinstance(remaining, int) else None
            self._end = _end_time(self.data)
        elif self.data.state not in ACTIVE_STATES:
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
        attributes = slot_attributes(tray, self.slot + 1, tray_id(self.ams_id, self.slot), active_tray(self.data))
        fed = (self.data.status.get("ams_extruder_map") or {}).get(str(self.ams_id))
        if self.data.is_dual_nozzle and fed is not None:
            # The nozzle the unit feeds: BamBuddy's 0 right, 1 left;
            # a unit on the filament track switch reaches both and has none.
            attributes["nozzle"] = "left" if str(fed) == "1" else "right"
        return attributes


_PRINTER_SENSOR_CLASSES: dict[str, type[BamBuddyPrinterSensor]] = {
    "end_time": BamBuddyEndTimeSensor,
    "maintenance": BamBuddyMaintenanceSensor,
}


@dataclass(frozen=True, kw_only=True)
class PlugSensorDescription(SensorEntityDescription):
    """A figure of a plug's energy report (BamBuddy's field)."""

    field: str


PLUG_SENSORS = (
    PlugSensorDescription(
        key="power",
        translation_key="plug_power",
        field="power",
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfPower.WATT,
    ),
    # BamBuddy's day starts at its own midnight: a drop is a new day.
    PlugSensorDescription(
        key="energy_today",
        translation_key="plug_energy_today",
        field="today",
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
    ),
    # For Home Assistant's energy dashboard.
    PlugSensorDescription(
        key="energy_total",
        translation_key="plug_energy_total",
        field="total",
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
    ),
)


def _add_plug_sensors(coordinator: BamBuddyPlugCoordinator, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    """A sensor for each figure a plug has reported once (a plug without
    metering gets none -- no "0 W" for nothing); one known
    from before keeps its place while the plug has not answered yet."""
    registry = er.async_get(coordinator.hass)
    entry_id = coordinator.config_entry.entry_id

    def create(plug: Plug) -> list[tuple[str, Callable[[], SensorEntity]]]:
        return [
            (description.key, partial(BamBuddyPlugSensor, coordinator, plug, description))
            for description in PLUG_SENSORS
            if coordinator.reported(plug.id, description.field)
            or registry.async_get_entity_id("sensor", DOMAIN, f"{entry_id}_plug{plug.id}_{description.key}")
        ]

    async_add_plug_entities(coordinator, async_add_entities, create)


class BamBuddyPlugSensor(BamBuddyPlugEntity, SensorEntity):
    """Power in W, energy in kWh, as the plug reports them to BamBuddy."""

    entity_description: PlugSensorDescription

    def __init__(self, coordinator: BamBuddyPlugCoordinator, plug: Plug, description: PlugSensorDescription) -> None:
        self.entity_description = description
        super().__init__(coordinator, plug, description.key)

    @property
    def available(self) -> bool:
        return super().available and self.plug is not None and self.plug.reachable

    @property
    def native_value(self) -> float | None:
        return self.plug.figure(self.entity_description.field) if self.plug else None
