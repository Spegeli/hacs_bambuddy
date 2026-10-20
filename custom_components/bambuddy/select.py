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
from .coordinator import BamBuddyConfigEntry
from .entity import BamBuddyDescribedEntity, async_run_command
from .models import JOB_STATES, PrinterData

PARALLEL_UPDATES = 1

_SPEED_MODES = {name: mode for mode, name in PRINT_SPEEDS.items()}
_AIRDUCT_MODES = {0: "cooling", 1: "heating", 2: "laser"}
# BamBuddy sets only these; the laser mode (2, the H2 series' laser module) comes from the printer.
_AIRDUCT_SETTABLE = ["cooling", "heating"]
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


SELECTS: tuple[BamBuddySelectDescription, ...] = (
    BamBuddySelectDescription(
        key="print_speed",
        translation_key="print_speed",
        options=list(PRINT_SPEEDS.values()),
        value_fn=lambda data: PRINT_SPEEDS.get(data.status.get("speed_level")),  # type: ignore[arg-type]
        select_fn=lambda client, printer, option: client.set_print_speed(printer, _SPEED_MODES[option]),
        # The speed belongs to the running job; the printer forgets it after.
        allowed=lambda data: data.state in JOB_STATES,
        refusal="not_printing",
    ),
    BamBuddySelectDescription(
        key="airduct_mode",
        translation_key="airduct_mode",
        options=_AIRDUCT_SETTABLE,
        entity_category=EntityCategory.CONFIG,
        exists_fn=lambda data: data.has_airduct(),
        value_fn=lambda data: _AIRDUCT_MODES.get(data.status.get("airduct_mode")),  # type: ignore[arg-type]
        select_fn=lambda client, printer, mode: client.set_airduct_mode(printer, mode),
        # The print sets it at its start (Bambu Studio refuses a change
        # during one).
        idle_only=True,
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


class BamBuddySelect(BamBuddyDescribedEntity, SelectEntity):
    entity_description: BamBuddySelectDescription

    @property
    def current_option(self) -> str | None:
        return self.entity_description.value_fn(self.data)

    @property
    def options(self) -> list[str]:
        """The choices; a mode only the printer sets (the airduct's laser mode) while it is in it."""
        options = list(self.entity_description.options or [])
        current = self.current_option
        return [*options, current] if current is not None and current not in options else options

    async def async_select_option(self, option: str) -> None:
        description = self.entity_description
        if option not in (description.options or []):
            return  # the mode it is in, which only the printer sets
        await async_run_command(
            self.coordinator,
            partial(description.select_fn, self.coordinator.client, self.coordinator.printer_id, option),
            allowed=description.allowed,
            refusal=description.refusal,
            idle_only=description.idle_only,
        )
