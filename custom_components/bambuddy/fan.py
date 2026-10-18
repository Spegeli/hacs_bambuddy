"""BamBuddy's fans: part cooling, auxiliary, chamber (or exhaust) and the
left auxiliary fan, each settable in percent."""
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

from .coordinator import BamBuddyConfigEntry
from .entity import BamBuddyDescribedEntity, async_run_command
from .models import PrinterData

PARALLEL_UPDATES = 1


@dataclass(frozen=True, kw_only=True)
class BamBuddyFanDescription(FanEntityDescription):
    # BamBuddy's name for the fan in fan-speed, and its status field.
    fan: str
    field: str
    exists_fn: Callable[[PrinterData], bool] = lambda _: True


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
        exists_fn=lambda data: data.has_aux_fans(),
    ),
    BamBuddyFanDescription(
        key="chamber_fan",
        translation_key="chamber_fan",
        fan="chamber",
        field="big_fan2_speed",
        exists_fn=lambda data: data.has_aux_fans() and not data.has_exhaust_fan(),
    ),
    BamBuddyFanDescription(
        key="chamber_fan",
        translation_key="exhaust_fan",
        fan="chamber",
        field="big_fan2_speed",
        exists_fn=lambda data: data.has_exhaust_fan(),
    ),
    # An accessory on the P2S, built into the X2D.
    BamBuddyFanDescription(
        key="left_aux_fan",
        translation_key="left_auxiliary_fan",
        fan="aux2",
        field="left_aux_fan_speed",
        exists_fn=lambda data: data.status.get("left_aux_fan_speed") is not None,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    if not runtime.can_control:
        return
    async_add_entities(
        BamBuddyFan(coordinator, description)
        for coordinator in runtime.printers.values()
        for description in FANS
        if description.exists_fn(coordinator.data)
    )


class BamBuddyFan(BamBuddyDescribedEntity, FanEntity):
    """The printer reports its fans in fifteenths: 15 steps. A running job
    sets the fans again with its next command."""

    entity_description: BamBuddyFanDescription
    _attr_supported_features = FanEntityFeature.SET_SPEED | FanEntityFeature.TURN_ON | FanEntityFeature.TURN_OFF
    _attr_speed_count = 15

    @property
    def percentage(self) -> int | None:
        value = self.data.status.get(self.entity_description.field)
        return value if isinstance(value, int) else None

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
                percentage,
            ),
        )

    async def async_turn_on(
        self, percentage: int | None = None, preset_mode: str | None = None, **kwargs: Any
    ) -> None:
        await self.async_set_percentage(100 if percentage is None else percentage)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.async_set_percentage(0)
