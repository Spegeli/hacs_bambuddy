"""BamBuddy's switches: the AMS filament backup -- with it on, the printer
switches to a slot with the same filament when one runs out -- and the AI
detectors the printer has."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from functools import partial
from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util import dt as dt_util

from .auto_off import AutoOff, auto_off_for
from .coordinator import BamBuddyConfigEntry, BamBuddyPlugCoordinator, BamBuddyPrinterCoordinator
from .entity import BamBuddyPlugEntity, BamBuddyToggle, async_add_plug_entities, async_switch_plug
from .models import detectors, plate_position_only
from .plugs import Plug

PARALLEL_UPDATES = 1

# BamBuddy's module name of a detector: the entity's key, and the field of
# its state in the status's print options.
_DETECTORS = {
    "printing_monitor": ("ai_monitoring", "printing_monitor"),
    "first_layer_inspector": ("first_layer_inspection", "first_layer_inspector"),
    "buildplate_marker_detector": ("build_plate_detection", "buildplate_marker_detector"),
    "spaghetti_detector": ("spaghetti_detection", "spaghetti_detector"),
    "pileup_detector": ("pileup_detection", "pileup_detector"),
    "clump_detector": ("clumping_detection", "nozzle_clumping_detector"),
    "airprint_detector": ("air_printing_detection", "airprint_detector"),
}


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    if runtime.plugs is not None and runtime.can_control_plugs:
        _add_plug_switches(runtime.plugs, async_add_entities)
    if not runtime.can_control:
        return
    entities: list[SwitchEntity] = []
    for coordinator in runtime.printers.values():
        _add_filament_backup(coordinator, async_add_entities)
        entities.extend(BamBuddyDetector(coordinator, module) for module in detectors(coordinator.data))
    async_add_entities(entities)


def _add_filament_backup(coordinator: BamBuddyPrinterCoordinator, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    """The filament backup once the printer reports an AMS unit, now or
    when one is plugged in: every printer has the setting, but it backs up
    AMS spools only (the external spool takes no part)."""

    added = False

    @callback
    def add_once() -> None:
        nonlocal added
        if not added and coordinator.data.ams_units:
            added = True
            async_add_entities([BamBuddyFilamentBackup(coordinator)])

    add_once()
    coordinator.config_entry.async_on_unload(coordinator.async_add_listener(add_once))


class BamBuddyFilamentBackup(BamBuddyToggle, SwitchEntity):
    """BamBuddy 1.2.5.7 reads the setting only where the printer reports it
    in `cfg`: not on the A1 and P1 series (they report it elsewhere; read
    from BamBuddy 1.2.6 on). Unknown there -- and it still switches."""

    _attr_translation_key = "ams_filament_backup"
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator: BamBuddyPrinterCoordinator) -> None:
        super().__init__(coordinator, "ams_filament_backup")

    @property
    def assumed_state(self) -> bool:
        """Unknown: Home Assistant offers on and off alike."""
        return self._reported() is None

    def _reported(self) -> Any:
        return self.data.status.get("ams_filament_backup")

    def _command(self, on: bool) -> Callable[[], Awaitable[None]]:
        return partial(self.coordinator.client.set_ams_backup, self.coordinator.printer_id, on)


class BamBuddyDetector(BamBuddyToggle, SwitchEntity):
    """An AI detector: on, the printer watches for it and pauses the print
    as its sensitivity says. Switchable during a print, to silence a false
    alarm."""

    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, module: str) -> None:
        key, self._field = _DETECTORS[module]
        # The name follows the kind of detection; the unique ID keeps the key.
        if module == "buildplate_marker_detector" and plate_position_only(coordinator.data):
            self._attr_translation_key = "build_plate_position_detection"
        else:
            self._attr_translation_key = key
        super().__init__(coordinator, key)
        self._module = module

    def _reported(self) -> Any:
        return (self.data.status.get("print_options") or {}).get(self._field)

    def _command(self, on: bool) -> Callable[[], Awaitable[None]]:
        return partial(self.coordinator.client.set_print_option, self.coordinator.printer_id, self._module, on)


def _add_plug_switches(coordinator: BamBuddyPlugCoordinator, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    """A switch for each plug BamBuddy can switch (not a script, not an
    MQTT plug it only watches)."""

    def create(plug: Plug) -> list[tuple[str, Callable[[], SwitchEntity]]]:
        entities: list[tuple[str, Callable[[], SwitchEntity]]] = []
        if plug.kind == "switch":
            entities.append(("power", partial(BamBuddyPlugSwitch, coordinator, plug)))
        auto_off = auto_off_for(coordinator.config_entry, plug)
        if auto_off is not None:
            entities.append(("auto_off", partial(BamBuddyAutoOffSwitch, coordinator, plug, auto_off)))
            entities.append(("auto_off_every_print", partial(BamBuddyAutoOffEveryPrint, coordinator, plug, auto_off)))
        return entities

    async_add_plug_entities(coordinator, async_add_entities, create)


class BamBuddyPlugSwitch(BamBuddyPlugEntity, SwitchEntity):
    """A smart plug on or off, as BamBuddy reads it from the plug. Off cuts
    the power: a plug that powers the printer takes it offline in BamBuddy,
    a print stops -- never refused here (the plug is an emergency stop);
    the card asks first."""

    # The plug's own entity: named as its device, the plug.
    _attr_name = None
    _attr_translation_key = "plug"

    def __init__(self, coordinator: BamBuddyPlugCoordinator, plug: Plug) -> None:
        super().__init__(coordinator, plug, "power")

    @property
    def available(self) -> bool:
        return super().available and self.plug is not None and self.plug.reachable

    @property
    def is_on(self) -> bool | None:
        return self.plug.state if self.plug else None

    @property
    def assumed_state(self) -> bool:
        """A REST plug without a status URL says nothing of its state: on and
        off both offered. One BamBuddy cannot reach is unavailable instead."""
        return self.plug is not None and self.plug.reachable and self.plug.state is None

    @property
    def capability_attributes(self) -> dict[str, Any] | None:
        return self.plug_role()

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return self.plug_attributes()

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._switch(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._switch(False)

    async def _switch(self, on: bool) -> None:
        plug = self.plug
        if plug is not None:
            await async_switch_plug(self.coordinator, plug, on)


class _AutoOffEntity(BamBuddyPlugEntity, RestoreEntity):
    """A part of a plug's switch-off after the print: it shows what the
    switch-off holds and keeps it over a restart. Always available: its
    values are Home Assistant's own -- an unavailable one would be saved
    without them and lost at the next start."""

    def __init__(self, coordinator: BamBuddyPlugCoordinator, plug: Plug, key: str, auto_off: AutoOff) -> None:
        super().__init__(coordinator, plug, key)
        self.auto_off = auto_off

    @property
    def available(self) -> bool:
        return True

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last is not None:
            self._restore(last.state, dict(last.attributes))
        self.async_on_remove(self.auto_off.async_add_listener(self.async_write_ha_state))

    def _restore(self, state: str, attributes: dict[str, Any]) -> None:
        raise NotImplementedError


class BamBuddyAutoOffSwitch(_AutoOffEntity, SwitchEntity):
    """Switch off after the print: its phase and since when, for the card."""

    _attr_translation_key = "auto_off"

    def __init__(self, coordinator: BamBuddyPlugCoordinator, plug: Plug, auto_off: AutoOff) -> None:
        super().__init__(coordinator, plug, "auto_off", auto_off)

    @property
    def is_on(self) -> bool:
        return self.auto_off.armed

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        auto_off = self.auto_off
        return {
            "phase": auto_off.phase,
            "since": auto_off.since.isoformat() if auto_off.since else None,
            # What a wait waits for: nozzle, drying, filament, heating, printer, plug.
            "waiting_for": auto_off.waiting_for,
            "switching": auto_off.switching,
            "temperature": auto_off.threshold,
            "every_print": auto_off.every_print,
        }

    def _restore(self, state: str, attributes: dict[str, Any]) -> None:
        since = attributes.get("since")
        self.auto_off.restore(state == "on", attributes.get("phase"), dt_util.parse_datetime(since) if isinstance(since, str) else None)

    async def async_turn_on(self, **kwargs: Any) -> None:
        self.auto_off.arm()

    async def async_turn_off(self, **kwargs: Any) -> None:
        self.auto_off.disarm()


class BamBuddyAutoOffEveryPrint(_AutoOffEntity, SwitchEntity):
    """After every print, or only after the next one (BamBuddy's
    "einmalig")."""

    _attr_translation_key = "auto_off_every_print"
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator: BamBuddyPlugCoordinator, plug: Plug, auto_off: AutoOff) -> None:
        super().__init__(coordinator, plug, "auto_off_every_print", auto_off)

    @property
    def is_on(self) -> bool:
        return self.auto_off.every_print

    def _restore(self, state: str, attributes: dict[str, Any]) -> None:
        if state in ("on", "off"):
            self.auto_off.set_every_print(state == "on")

    async def async_turn_on(self, **kwargs: Any) -> None:
        self.auto_off.set_every_print(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        self.auto_off.set_every_print(False)
