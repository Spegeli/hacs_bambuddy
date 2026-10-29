"""BamBuddy's fans: part cooling, auxiliary, chamber (or exhaust) and the
left (on the X2D right) auxiliary fan, each settable in percent; and the
ventilation of a printer with an airduct, which sets the airduct to cooling
and runs the fans that bring the air through."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from functools import partial
from typing import Any

from homeassistant.components.fan import (  # type: ignore[attr-defined]
    # FanEntityFeature: in fan/__init__.py at 2025.5, in fan/const.py at
    # 2026.10 and only offered here; only this path works on both.
    FanEntity,
    FanEntityDescription,
    FanEntityFeature,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator
from .entity import BamBuddyDescribedEntity, BamBuddyPrinterEntity, async_run_command, refuse
from .models import PrinterData, chamber_heats, round_ten, ventilating, ventilation_fans, ventilation_speed

PARALLEL_UPDATES = 1

# Where the card's „+“ starts and what turning on without a speed sets.
VENT_START = 60
# The wait for the airduct's report after switching to cooling: the H2
# series lets its exhaust fan be set only in cooling mode. The fans go
# after it either way.
VENT_MODE_WAIT = 4.0
VENT_MODE_POLL = 1.0


@dataclass(frozen=True, kw_only=True)
class BamBuddyFanDescription(FanEntityDescription):
    # BamBuddy's name for the fan in fan-speed, and its status field.
    fan: str
    field: str
    exists_fn: Callable[[PrinterData], bool] = lambda _: True
    # Enabled at first: a fan the stock printer lacks is disabled (a kit may add it).
    enabled_fn: Callable[[PrinterData], bool] = lambda _: True


FANS: tuple[BamBuddyFanDescription, ...] = (
    BamBuddyFanDescription(
        key="part_cooling_fan",
        translation_key="part_cooling_fan",
        fan="part",
        field="cooling_fan_speed",
    ),
    # The A1 series has neither an auxiliary nor a chamber fan.
    BamBuddyFanDescription(
        key="aux_fan",
        translation_key="auxiliary_fan",
        fan="aux",
        field="big_fan1_speed",
        exists_fn=lambda data: data.has_aux_fans() and not data.swapped_aux_fans(),
        enabled_fn=lambda data: data.stock_aux_fan(),
    ),
    # The X2D's fan 2 is its left one (Bambu Studio's N6.json).
    BamBuddyFanDescription(
        key="aux_fan",
        translation_key="left_auxiliary_fan",
        fan="aux",
        field="big_fan1_speed",
        exists_fn=lambda data: data.swapped_aux_fans(),
    ),
    BamBuddyFanDescription(
        key="chamber_fan",
        translation_key="chamber_fan",
        fan="chamber",
        field="big_fan2_speed",
        exists_fn=lambda data: data.has_chamber_fan(),
        enabled_fn=lambda data: data.stock_chamber_fan(),
    ),
    BamBuddyFanDescription(
        key="chamber_fan",
        translation_key="exhaust_fan",
        fan="chamber",
        field="big_fan2_speed",
        exists_fn=lambda data: data.has_exhaust_fan(),
    ),
    # An accessory on the P2S, built into the X2D -- where it is the right one.
    BamBuddyFanDescription(
        key="left_aux_fan",
        translation_key="left_auxiliary_fan",
        fan="aux2",
        field="left_aux_fan_speed",
        exists_fn=lambda data: data.status.get("left_aux_fan_speed") is not None and not data.swapped_aux_fans(),
    ),
    BamBuddyFanDescription(
        key="left_aux_fan",
        translation_key="right_auxiliary_fan",
        fan="aux2",
        field="left_aux_fan_speed",
        exists_fn=lambda data: data.status.get("left_aux_fan_speed") is not None and data.swapped_aux_fans(),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    async_add_entities(
        BamBuddyFan(coordinator, description)
        for coordinator in runtime.printers.values()
        for description in FANS
        if description.exists_fn(coordinator.data)
    )
    async_add_entities(
        BamBuddyVentilation(coordinator) for coordinator in runtime.printers.values() if ventilation_fans(coordinator.data)
    )


class BamBuddyFan(BamBuddyDescribedEntity, FanEntity):
    """A fan in tens, as Bambu's apps set and show it (`round_ten`). A
    running job sets the fans again with its next command."""

    entity_description: BamBuddyFanDescription
    _attr_supported_features = FanEntityFeature.SET_SPEED | FanEntityFeature.TURN_ON | FanEntityFeature.TURN_OFF
    _attr_speed_count = 10

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, description: BamBuddyFanDescription) -> None:
        super().__init__(coordinator, description)
        self._attr_entity_registry_enabled_default = description.enabled_fn(coordinator.data)

    @property
    def percentage(self) -> int | None:
        value = self.data.status.get(self.entity_description.field)
        return round_ten(value) if isinstance(value, int) and not isinstance(value, bool) else None

    @property
    def is_on(self) -> bool | None:
        percentage = self.percentage
        return None if percentage is None else percentage > 0

    async def async_set_percentage(self, percentage: int) -> None:
        await async_run_command(
            self.coordinator,
            partial(
                self.coordinator.client.set_fan_speed,
                self.coordinator.printer_id,
                self.entity_description.fan,
                round_ten(percentage),
            ),
        )

    async def async_turn_on(
        self, percentage: int | None = None, preset_mode: str | None = None, **kwargs: Any
    ) -> None:
        await self.async_set_percentage(100 if percentage is None else percentage)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.async_set_percentage(0)


def _may_ventilate(data: PrinterData, name: str) -> None:
    """Ventilating needs cooling mode, which a print or a filament change
    keeps as they set it, and goes not with a heated chamber."""
    mode = data.status.get("airduct_mode")
    if data.job_running:
        if mode == 1:
            raise refuse("ventilation_heating_print", printer=name)
        if mode == 2:
            raise refuse("not_now", printer=name)
    elif chamber_heats(data):
        if data.status.get("supports_chamber_heater"):
            raise refuse("chamber_heating", printer=name)
        raise refuse("keep_warm_on", printer=name)
    if data.changing_filament and mode != 0:
        raise refuse("filament_change", printer=name)


class BamBuddyVentilation(BamBuddyPrinterEntity, FanEntity):
    """The chamber ventilated: the airduct on cooling and its ventilation
    fans (`models.ventilation_fans`) at one speed, in tens. Off stops the
    fans and leaves the mode; the H2's vents close by themselves."""

    _attr_translation_key = "ventilation"
    _attr_supported_features = FanEntityFeature.SET_SPEED | FanEntityFeature.TURN_ON | FanEntityFeature.TURN_OFF
    _attr_speed_count = 10
    _unrecorded_attributes = frozenset({"fans"})

    def __init__(self, coordinator: BamBuddyPrinterCoordinator) -> None:
        super().__init__(coordinator, "ventilation")

    @property
    def is_on(self) -> bool:
        return ventilating(self.data)

    @property
    def percentage(self) -> int:
        return ventilation_speed(self.data) if ventilating(self.data) else 0

    @property
    def capability_attributes(self) -> dict[str, Any]:
        """The fans it runs, for the card: kept while the entity is unavailable."""
        return {**(super().capability_attributes or {}), "fans": [fan.name for fan in ventilation_fans(self.data)]}

    async def async_set_percentage(self, percentage: int) -> None:
        speed = round_ten(percentage)
        if speed == 0:
            await self.async_turn_off()
            return
        coordinator = self.coordinator
        fans = ventilation_fans(self.data)

        async def ventilate() -> None:
            if coordinator.data.status.get("airduct_mode") != 0:
                await coordinator.client.set_airduct_mode(coordinator.printer_id, "cooling")
                await coordinator.async_wait_for(lambda data: data.status.get("airduct_mode") == 0, VENT_MODE_WAIT, VENT_MODE_POLL)
            for fan in fans:
                await coordinator.client.set_fan_speed(coordinator.printer_id, fan.fan, speed)

        await async_run_command(coordinator, ventilate, check=_may_ventilate)

    async def async_turn_on(
        self, percentage: int | None = None, preset_mode: str | None = None, **kwargs: Any
    ) -> None:
        await self.async_set_percentage(VENT_START if percentage is None else percentage)

    async def async_turn_off(self, **kwargs: Any) -> None:
        # Outside cooling mode it is off already, and its fans do other work:
        # the X2D's right fan filters, the P2S's circulates through the
        # filter, the H2's exhaust fan draws off the laser's fumes.
        if self.data.status.get("airduct_mode") != 0:
            return
        coordinator = self.coordinator
        fans = ventilation_fans(self.data)

        async def stop() -> None:
            for fan in fans:
                await coordinator.client.set_fan_speed(coordinator.printer_id, fan.fan, 0)

        await async_run_command(coordinator, stop)
