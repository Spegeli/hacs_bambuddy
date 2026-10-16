"""BamBuddy's buttons: pause, resume and stop a print, tell BamBuddy the
plate is clear, clear HMS errors, refresh the status."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import partial

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import BamBuddyClient
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator
from .entity import BamBuddyPrinterEntity, async_run_command
from .models import PAUSABLE_STATES, STOPPABLE_STATES, PrinterData

PARALLEL_UPDATES = 1


@dataclass(frozen=True, kw_only=True)
class BamBuddyButtonDescription(ButtonEntityDescription):
    press_fn: Callable[[BamBuddyClient, int], Awaitable[None]]
    allowed: Callable[[PrinterData], bool] | None = None
    refusal: str = "not_now"
    # Needs the key's Control Printer permission.
    control: bool = True
    # BamBuddy acts without the printer: the button stays available.
    offline_ok: bool = False


def _plate_waits(data: PrinterData) -> bool:
    """BamBuddy takes the plate as cleared after a print, or while its queue
    waits for it."""
    return bool(data.status.get("awaiting_plate_clear")) or data.state in ("FINISH", "FAILED")


BUTTONS: tuple[BamBuddyButtonDescription, ...] = (
    BamBuddyButtonDescription(
        key="pause",
        translation_key="pause",
        press_fn=lambda client, printer: client.pause(printer),
        allowed=lambda data: data.state in PAUSABLE_STATES,
        refusal="not_printing",
    ),
    BamBuddyButtonDescription(
        key="resume",
        translation_key="resume",
        press_fn=lambda client, printer: client.resume(printer),
        allowed=lambda data: data.state == "PAUSE",
        refusal="not_paused",
    ),
    BamBuddyButtonDescription(
        key="stop",
        translation_key="stop",
        press_fn=lambda client, printer: client.stop(printer),
        allowed=lambda data: data.state in STOPPABLE_STATES,
        refusal="no_print",
    ),
    BamBuddyButtonDescription(
        key="clear_plate",
        translation_key="plate_cleared",
        press_fn=lambda client, printer: client.clear_plate(printer),
        allowed=_plate_waits,
        refusal="plate_not_waiting",
        # A finished print on a printer switched off: BamBuddy's queue waits
        # all the same, and BamBuddy sends the printer nothing.
        offline_ok=True,
    ),
    BamBuddyButtonDescription(
        key="clear_hms",
        translation_key="clear_hms_errors",
        entity_category=EntityCategory.DIAGNOSTIC,
        press_fn=lambda client, printer: client.clear_hms(printer),
    ),
    # Asks the printer for its full status; Read Status suffices.
    BamBuddyButtonDescription(
        key="refresh_status",
        translation_key="refresh_status",
        entity_category=EntityCategory.DIAGNOSTIC,
        press_fn=lambda client, printer: client.refresh_status(printer),
        control=False,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    async_add_entities(
        BamBuddyButton(coordinator, description)
        for coordinator in runtime.printers.values()
        for description in BUTTONS
        if runtime.can_control or not description.control
    )


class BamBuddyButton(BamBuddyPrinterEntity, ButtonEntity):
    """Available whenever the printer is: pressed at the wrong time, it says
    why it does nothing."""

    entity_description: BamBuddyButtonDescription

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, description: BamBuddyButtonDescription) -> None:
        # First: the entity ID is made from its translation key.
        self.entity_description = description
        super().__init__(coordinator, description.key)
        self.available_when_offline = description.offline_ok

    async def async_press(self) -> None:
        description = self.entity_description
        await async_run_command(
            self.coordinator,
            partial(description.press_fn, self.coordinator.client, self.coordinator.printer_id),
            allowed=description.allowed,
            refusal=description.refusal,
            offline_ok=description.offline_ok,
        )
