"""BamBuddy's numbers: the target temperatures of nozzle(s), bed and
chamber."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import partial

from homeassistant.components.number import NumberDeviceClass, NumberEntity, NumberEntityDescription, NumberMode
from homeassistant.const import UnitOfTemperature
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import BamBuddyClient
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator
from .entity import BamBuddyPrinterEntity, async_run_command
from .models import PrinterData

PARALLEL_UPDATES = 1


@dataclass(frozen=True, kw_only=True)
class BamBuddyTemperatureDescription(NumberEntityDescription):
    # BamBuddy's key in `temperatures`.
    field: str
    set_fn: Callable[[BamBuddyClient, int, int], Awaitable[None]]
    exists_fn: Callable[[PrinterData], bool] = lambda _: True
    device_class: NumberDeviceClass = NumberDeviceClass.TEMPERATURE
    native_unit_of_measurement: str = UnitOfTemperature.CELSIUS
    native_min_value: float = 0
    native_step: float = 1
    mode: NumberMode = NumberMode.BOX


def _nozzle(nozzle: int) -> Callable[[BamBuddyClient, int, int], Awaitable[None]]:
    """BamBuddy's nozzle 0 is the only or the right one, 1 the left one."""

    async def set_target(client: BamBuddyClient, printer_id: int, target: int) -> None:
        await client.set_nozzle_temperature(printer_id, target, nozzle)

    return set_target


# BamBuddy's limits; the printer's firmware clamps to its own.
NUMBERS: tuple[BamBuddyTemperatureDescription, ...] = (
    BamBuddyTemperatureDescription(
        key="nozzle_target",
        translation_key="nozzle_target_temperature",
        field="nozzle_target",
        native_max_value=320,
        set_fn=_nozzle(0),
        exists_fn=lambda data: not data.is_dual_nozzle,
    ),
    # Two nozzles: BamBuddy's `nozzle` is the left one, `nozzle_2` the right.
    BamBuddyTemperatureDescription(
        key="nozzle_target",
        translation_key="left_nozzle_target_temperature",
        field="nozzle_target",
        native_max_value=320,
        set_fn=_nozzle(1),
        exists_fn=lambda data: data.is_dual_nozzle,
    ),
    BamBuddyTemperatureDescription(
        key="nozzle_2_target",
        translation_key="right_nozzle_target_temperature",
        field="nozzle_2_target",
        native_max_value=320,
        set_fn=_nozzle(0),
        exists_fn=lambda data: data.is_dual_nozzle,
    ),
    BamBuddyTemperatureDescription(
        key="bed_target",
        translation_key="bed_target_temperature",
        field="bed_target",
        native_max_value=140,
        set_fn=lambda client, printer, target: client.set_bed_temperature(printer, target),
    ),
    BamBuddyTemperatureDescription(
        key="chamber_target",
        translation_key="chamber_target_temperature",
        field="chamber_target",
        native_max_value=65,
        set_fn=lambda client, printer, target: client.set_chamber_temperature(printer, target),
        exists_fn=lambda data: bool(data.status.get("supports_chamber_heater")),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    if not runtime.can_control:
        return
    async_add_entities(
        BamBuddyTemperature(coordinator, description)
        for coordinator in runtime.printers.values()
        for description in NUMBERS
        if description.exists_fn(coordinator.data)
    )


class BamBuddyTemperature(BamBuddyPrinterEntity, NumberEntity):
    """A target temperature: 0 turns the heater off. A running job may set
    it again with its next command."""

    entity_description: BamBuddyTemperatureDescription

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, description: BamBuddyTemperatureDescription) -> None:
        # First: the entity ID is made from its translation key.
        self.entity_description = description
        super().__init__(coordinator, description.key)

    @property
    def native_value(self) -> float | None:
        value = self.data.temperatures.get(self.entity_description.field)
        return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None

    async def async_set_native_value(self, value: float) -> None:
        await async_run_command(
            self.coordinator,
            partial(self.entity_description.set_fn, self.coordinator.client, self.coordinator.printer_id, round(value)),
        )
