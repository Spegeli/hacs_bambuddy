"""BamBuddy's buttons: pause, resume and stop a print, tell BamBuddy the
plate is clear, clear HMS errors, refresh the status; a smart plug's script,
and "not this time" for the switch-off after the print."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import partial
from typing import Any

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import BamBuddyClient
from .auto_off import AutoOff, auto_off_for
from .coordinator import BamBuddyConfigEntry, BamBuddyPlugCoordinator
from .entity import BamBuddyDescribedEntity, BamBuddyPlugEntity, async_add_plug_entities, async_run_command, async_switch_plug, key_by_printer
from .models import ACTIVE_STATES, ENDED_STATES, JOB_STATES, PrinterData
from .plugs import Plug

PARALLEL_UPDATES = 1


@dataclass(frozen=True, kw_only=True)
class BamBuddyButtonDescription(ButtonEntityDescription):
    press_fn: Callable[[BamBuddyClient, int], Awaitable[None]]
    allowed: Callable[[PrinterData], bool] | None = None
    refusal: str = "not_now"
    # The refusal by the printer's state, where one text does not fit all.
    refusal_fn: Callable[[PrinterData], str] | None = None
    # BamBuddy acts without the printer: the button stays available.
    available_when_offline: bool = False


def _plate_waits(data: PrinterData) -> bool:
    """BamBuddy takes the plate as cleared after a print, or while its queue
    waits for it."""
    return bool(data.status.get("awaiting_plate_clear")) or data.state in ENDED_STATES


BUTTONS: tuple[BamBuddyButtonDescription, ...] = (
    BamBuddyButtonDescription(
        key="pause",
        translation_key="pause",
        press_fn=lambda client, printer: client.pause(printer),
        allowed=lambda data: data.state in ACTIVE_STATES,
        refusal_fn=lambda data: "already_paused" if data.state == "PAUSE" else "not_printing",
    ),
    BamBuddyButtonDescription(
        key="resume",
        translation_key="resume",
        press_fn=lambda client, printer: client.resume(printer),
        # Not in the middle of a filament change: the print would go on
        # while the AMS still feeds or purges.
        allowed=lambda data: data.state == "PAUSE" and not data.changing_filament,
        refusal_fn=lambda data: "filament_change" if data.state == "PAUSE" and data.changing_filament else "not_paused",
    ),
    BamBuddyButtonDescription(
        key="stop",
        translation_key="stop",
        press_fn=lambda client, printer: client.stop(printer),
        allowed=lambda data: data.state in JOB_STATES,
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
        available_when_offline=True,
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
    )
    plugs = runtime.plugs

    def create(plug: Plug) -> list[tuple[str, Callable[[], ButtonEntity]]]:
        entities: list[tuple[str, Callable[[], ButtonEntity]]] = []
        if plug.kind == "script":
            entities.append(("run", partial(BamBuddyPlugRun, plugs, plug)))
        auto_off = auto_off_for(entry, plug)
        if auto_off is not None:
            entities.append(("auto_off_skip", partial(BamBuddyAutoOffSkip, plugs, plug, auto_off)))
        return entities

    async_add_plug_entities(plugs, async_add_entities, create)


class BamBuddyButton(BamBuddyDescribedEntity, ButtonEntity):
    """Available whenever the printer is: pressed at the wrong time, it says
    why it does nothing."""

    entity_description: BamBuddyButtonDescription

    async def async_press(self) -> None:
        description = self.entity_description
        await async_run_command(
            self.coordinator,
            partial(description.press_fn, self.coordinator.client, self.coordinator.printer_id),
            allowed=description.allowed,
            refusal=description.refusal_fn(self.coordinator.data) if description.refusal_fn else description.refusal,
            offline_ok=description.available_when_offline,
        )


class BamBuddyPlugRun(BamBuddyPlugEntity, ButtonEntity):
    """A Home Assistant script BamBuddy keeps as a plug: it runs, it has
    no on and off."""

    _attr_translation_key = "plug_run"

    def __init__(self, coordinator: BamBuddyPlugCoordinator, plug: Plug) -> None:
        super().__init__(coordinator, plug, "run")

    @property
    def available(self) -> bool:
        return super().available and self.plug is not None and self.plug.reachable

    @property
    def capability_attributes(self) -> dict[str, Any] | None:
        return self.plug_role()

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return self.plug_attributes()

    async def async_press(self) -> None:
        plug = self.plug
        if plug is not None:
            await async_switch_plug(self.coordinator, plug, True)


class BamBuddyAutoOffSkip(BamBuddyPlugEntity, ButtonEntity):
    """Not this time: while the switch-off after the print waits, the
    printer stays on."""

    _attr_translation_key = "auto_off_skip"

    def __init__(self, coordinator: BamBuddyPlugCoordinator, plug: Plug, auto_off: AutoOff) -> None:
        super().__init__(coordinator, plug, "auto_off_skip")
        self.auto_off = auto_off
        key_by_printer(self, auto_off.printer, "auto_off_skip")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(self.auto_off.async_add_listener(self.async_write_ha_state))

    @property
    def available(self) -> bool:
        """While it waits -- not once the switch-off is on its way."""
        return self.auto_off.phase == "waiting" and not self.auto_off.switching

    async def async_press(self) -> None:
        self.auto_off.skip()
