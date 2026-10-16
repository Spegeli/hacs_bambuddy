"""BamBuddy's selects: the print speed, and the airduct mode and the
active nozzle of printers that have them."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import partial

from homeassistant.components.select import SelectEntity, SelectEntityDescription
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import BamBuddyClient
from .const import PRINT_SPEEDS
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator
from .entity import BamBuddyPrinterEntity, async_run_command
from .models import JOB_STATES, PrinterData

PARALLEL_UPDATES = 1

_SPEED_MODES = {name: mode for mode, name in PRINT_SPEEDS.items()}
_AIRDUCT_MODES = {0: "cooling", 1: "heating"}
# BamBuddy's extruders: 0 is the right nozzle, 1 the left one.
_NOZZLES = {1: "left", 0: "right"}
_NOZZLE_INDEX = {name: index for index, name in _NOZZLES.items()}


@dataclass(frozen=True, kw_only=True)
class BamBuddySelectDescription(SelectEntityDescription):
    value_fn: Callable[[PrinterData], str | None]
    select_fn: Callable[[BamBuddyClient, int, str], Awaitable[None]]
    exists_fn: Callable[[PrinterData], bool] = lambda _: True
    allowed: Callable[[PrinterData], bool] | None = None
    refusal: str = "not_now"
    idle_only: bool = False


async def _set_speed(client: BamBuddyClient, printer_id: int, option: str) -> None:
    await client.set_print_speed(printer_id, _SPEED_MODES[option])


SELECTS: tuple[BamBuddySelectDescription, ...] = (
    BamBuddySelectDescription(
        key="print_speed",
        translation_key="print_speed",
        options=list(PRINT_SPEEDS.values()),
        value_fn=lambda data: PRINT_SPEEDS.get(data.status.get("speed_level")),  # type: ignore[arg-type]
        select_fn=_set_speed,
        # The speed belongs to the running job; the printer forgets it after.
        allowed=lambda data: data.state in JOB_STATES,
        refusal="not_printing",
    ),
    BamBuddySelectDescription(
        key="airduct_mode",
        translation_key="airduct_mode",
        options=list(_AIRDUCT_MODES.values()),
        entity_category=EntityCategory.CONFIG,
        exists_fn=lambda data: data.has_airduct(),
        value_fn=lambda data: _AIRDUCT_MODES.get(data.status.get("airduct_mode")),  # type: ignore[arg-type]
        select_fn=lambda client, printer, mode: client.set_airduct_mode(printer, mode),
    ),
    BamBuddySelectDescription(
        key="active_nozzle",
        translation_key="active_nozzle",
        options=list(_NOZZLES.values()),
        exists_fn=lambda data: data.is_dual_nozzle,
        value_fn=lambda data: _NOZZLES.get(data.status.get("active_extruder")),  # type: ignore[arg-type]
        select_fn=lambda client, printer, nozzle: client.select_extruder(printer, _NOZZLE_INDEX[nozzle]),
        # The job switches nozzles itself while it runs, and so does a
        # filament change.
        idle_only=True,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    if not runtime.can_control:
        return
    async_add_entities(
        BamBuddySelect(coordinator, description)
        for coordinator in runtime.printers.values()
        for description in SELECTS
        if description.exists_fn(coordinator.data)
    )


class BamBuddySelect(BamBuddyPrinterEntity, SelectEntity):
    entity_description: BamBuddySelectDescription

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, description: BamBuddySelectDescription) -> None:
        # First: the entity ID is made from its translation key.
        self.entity_description = description
        super().__init__(coordinator, description.key)

    @property
    def current_option(self) -> str | None:
        return self.entity_description.value_fn(self.data)

    async def async_select_option(self, option: str) -> None:
        description = self.entity_description
        await async_run_command(
            self.coordinator,
            partial(description.select_fn, self.coordinator.client, self.coordinator.printer_id, option),
            allowed=description.allowed,
            refusal=description.refusal,
            idle_only=description.idle_only,
        )
