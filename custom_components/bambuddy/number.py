"""BamBuddy's numbers: the target temperatures of nozzle(s), bed and
chamber; the camera's frame rate and the switch-off's temperature, which
Home Assistant keeps itself."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import partial

from homeassistant.components.number import (
    NumberDeviceClass,
    NumberEntity,
    NumberEntityDescription,
    NumberMode,
    RestoreNumber,
)
from homeassistant.const import EntityCategory, UnitOfTemperature
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from .api import BamBuddyClient
from .auto_off import MAX_TEMPERATURE, MIN_TEMPERATURE, AutoOff, auto_off_for
from .const import DOMAIN
from .coordinator import BamBuddyConfigEntry, BamBuddyPlugCoordinator, BamBuddyPrinterCoordinator
from .entity import (
    BamBuddyDescribedEntity,
    BamBuddyPlugEntity,
    BamBuddyPrinterEntity,
    async_add_plug_entities,
    async_run_command,
    key_by_printer,
)
from .models import CAMERA_FPS_STEP, CAMERA_MIN_FPS, PrinterData, camera_max_fps, heater_max
from .plugs import Plug

PARALLEL_UPDATES = 1


@dataclass(frozen=True, kw_only=True)
class BamBuddyTemperatureDescription(NumberEntityDescription):
    """A heater's target; the key is BamBuddy's field in `temperatures`."""

    set_fn: Callable[[BamBuddyClient, int, int], Awaitable[None]]
    exists_fn: Callable[[PrinterData], bool] = lambda _: True
    # The heater in the model table: its maximum where the model reaches less.
    heater: str | None = None
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


# BamBuddy's limits, or the model's where it heats less.
NUMBERS: tuple[BamBuddyTemperatureDescription, ...] = (
    BamBuddyTemperatureDescription(
        key="nozzle_target",
        translation_key="nozzle_target_temperature",
        native_max_value=320,
        heater="nozzle",
        set_fn=_nozzle(0),
        exists_fn=lambda data: not data.is_dual_nozzle,
    ),
    # Two nozzles: BamBuddy's `nozzle` is the left one, `nozzle_2` the right.
    BamBuddyTemperatureDescription(
        key="nozzle_target",
        translation_key="left_nozzle_target_temperature",
        native_max_value=320,
        heater="nozzle",
        set_fn=_nozzle(1),
        exists_fn=lambda data: data.is_dual_nozzle,
    ),
    BamBuddyTemperatureDescription(
        key="nozzle_2_target",
        translation_key="right_nozzle_target_temperature",
        native_max_value=320,
        heater="nozzle",
        set_fn=_nozzle(0),
        exists_fn=lambda data: data.is_dual_nozzle,
    ),
    BamBuddyTemperatureDescription(
        key="bed_target",
        translation_key="bed_target_temperature",
        native_max_value=140,
        heater="bed",
        set_fn=lambda client, printer, target: client.set_bed_temperature(printer, target),
    ),
    BamBuddyTemperatureDescription(
        key="chamber_target",
        translation_key="chamber_target_temperature",
        native_max_value=65,
        set_fn=lambda client, printer, target: client.set_chamber_temperature(printer, target),
        exists_fn=lambda data: bool(data.status.get("supports_chamber_heater")),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    runtime = entry.runtime_data
    plugs = runtime.plugs

    def create(plug: Plug) -> list[tuple[str, Callable[[], NumberEntity]]]:
        auto_off = auto_off_for(entry, plug)
        return [("auto_off_temperature", partial(BamBuddyAutoOffTemperature, plugs, plug, auto_off))] if auto_off else []

    async_add_plug_entities(plugs, async_add_entities, create)
    # Home Assistant's setting, not the printer's: with any key; where the
    # camera gives no more than the least (an external camera taken away in
    # BamBuddy), it goes.
    registry = er.async_get(hass)
    for coordinator in runtime.printers.values():
        if camera_max_fps(coordinator.info) > CAMERA_MIN_FPS:
            async_add_entities([BamBuddyCameraFrameRate(coordinator)])
        elif stale := registry.async_get_entity_id("number", DOMAIN, coordinator.entity_unique_id("camera_fps")):
            registry.async_remove(stale)
    async_add_entities(
        BamBuddyTemperature(coordinator, description)
        for coordinator in runtime.printers.values()
        for description in NUMBERS
        if description.exists_fn(coordinator.data)
    )


class BamBuddyTemperature(BamBuddyDescribedEntity, NumberEntity):
    """A target temperature: 0 turns the heater off. A running job may set
    it again with its next command."""

    entity_description: BamBuddyTemperatureDescription

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, description: BamBuddyTemperatureDescription) -> None:
        super().__init__(coordinator, description)
        most = heater_max(coordinator.info.get("model"), description.heater) if description.heater else None
        if most is not None and description.native_max_value is not None:
            self._attr_native_max_value = min(description.native_max_value, most)

    @property
    def native_value(self) -> float | None:
        value = self.data.temperatures.get(self.entity_description.key)
        return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None

    async def async_set_native_value(self, value: float) -> None:
        await async_run_command(
            self.coordinator,
            partial(self.entity_description.set_fn, self.coordinator.client, self.coordinator.printer_id, round(value)),
        )


class BamBuddyAutoOffTemperature(BamBuddyPlugEntity, RestoreNumber):
    """The switch-off after the print waits until every nozzle is below
    this: 50 °C unless the user sets another."""

    _attr_translation_key = "auto_off_temperature"
    _attr_entity_category = EntityCategory.CONFIG
    _attr_device_class = NumberDeviceClass.TEMPERATURE
    _attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS
    _attr_native_min_value = MIN_TEMPERATURE
    _attr_native_max_value = MAX_TEMPERATURE
    _attr_native_step = 1
    _attr_mode = NumberMode.BOX

    def __init__(self, coordinator: BamBuddyPlugCoordinator, plug: Plug, auto_off: AutoOff) -> None:
        super().__init__(coordinator, plug, "auto_off_temperature")
        self.auto_off = auto_off
        key_by_printer(self, auto_off.printer, "auto_off_temperature")

    @property
    def available(self) -> bool:
        """Home Assistant's own value: kept over a restart only while available."""
        return True

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        # Its own value in °C: Home Assistant stores the state in the user's
        # unit (°F with US customary units).
        stored = await self.async_get_last_number_data()
        value = stored.native_value if stored is not None else None
        if value is not None and MIN_TEMPERATURE <= value <= MAX_TEMPERATURE:
            self.auto_off.set_threshold(value)
        self.async_on_remove(self.auto_off.async_add_listener(self.async_write_ha_state))

    @property
    def native_value(self) -> float:
        return self.auto_off.threshold

    async def async_set_native_value(self, value: float) -> None:
        self.auto_off.set_threshold(value)


class BamBuddyCameraFrameRate(BamBuddyPrinterEntity, NumberEntity, RestoreEntity):
    """The live view's frames a second: from 5 to the most the
    camera gives, in steps of 5; the most until the user chooses less. A
    camera that gives only 5 has none."""

    _attr_translation_key = "camera_frame_rate"
    _attr_entity_category = EntityCategory.CONFIG
    _attr_native_unit_of_measurement = "fps"
    _attr_native_min_value = CAMERA_MIN_FPS
    _attr_native_step = CAMERA_FPS_STEP
    # A box: the device page shows its figure (a slider row shows none).
    _attr_mode = NumberMode.BOX

    def __init__(self, coordinator: BamBuddyPrinterCoordinator) -> None:
        super().__init__(coordinator, "camera_fps")

    @property
    def available(self) -> bool:
        """Home Assistant's own value: kept over a restart only while
        available, and it may be chosen while the printer is off."""
        return True

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        try:
            value = float(last.state) if last is not None else None
        except ValueError:
            value = None
        # A rate beyond the camera's most gives the most (`frame_rate`).
        if value is not None and value.is_integer() and value % CAMERA_FPS_STEP == 0:
            self._choose(int(value))

    @property
    def native_max_value(self) -> float:
        return camera_max_fps(self.coordinator.info)

    @property
    def native_value(self) -> float:
        return self.coordinator.frame_rate

    async def async_set_native_value(self, value: float) -> None:
        self._choose(round(value / CAMERA_FPS_STEP) * CAMERA_FPS_STEP)

    def _choose(self, fps: int) -> None:
        """The camera says its rate too: every entity of the printer is written."""
        self.coordinator.camera_fps = fps
        self.coordinator.async_update_listeners()
