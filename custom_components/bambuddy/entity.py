"""What the entities share: their devices, when they are available, and how
a command reaches a printer."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, TypeVar, cast

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import slugify

from .api import BamBuddyAuthError, BamBuddyConnectionError, BamBuddyError, BamBuddyPermissionError
from .const import CONF_URL, DOMAIN
from .coordinator import (
    BamBuddyConfigEntry,
    BamBuddyInstanceCoordinator,
    BamBuddyPrinterCoordinator,
    BamBuddyUpdateCoordinator,
    printer_identifier,
)
from .models import PrinterData, ams_key, ams_label, ams_model, ams_name

_T = TypeVar("_T")

# Home Assistant 2026.8 links a device to its parent by the parent's
# registry id and deprecates the identifiers (removed in 2027.8); 2025.5,
# the floor, knows only the identifiers.
_VIA_BY_ID = "via_device_id" in DeviceInfo.__annotations__


def _via(hass: HomeAssistant, entry_id: str, parent: tuple[str, str]) -> dict[str, Any]:
    if not _VIA_BY_ID:
        return {"via_device": parent}
    registry = dr.async_get(hass)
    for device in dr.async_entries_for_config_entry(registry, entry_id):
        if parent in device.identifiers:
            return {"via_device_id": device.id}
    return {}


def instance_device_info(entry: BamBuddyConfigEntry, version: str | None) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, entry.entry_id)},
        name=entry.title,
        manufacturer="BamBuddy",
        model="BamBuddy",
        sw_version=version,
        entry_type=DeviceEntryType.SERVICE,
        configuration_url=entry.data[CONF_URL],
    )


def printer_device_info(hass: HomeAssistant, coordinator: BamBuddyPrinterCoordinator) -> DeviceInfo:
    entry = coordinator.config_entry
    info = coordinator.info
    device = DeviceInfo(
        identifiers={printer_identifier(entry.entry_id, coordinator.key)},
        name=coordinator.printer_name,
        manufacturer="Bambu Lab",
        model=info.get("model") or None,
        serial_number=info.get("serial_number") or None,
        sw_version=coordinator.data.status.get("firmware_version") or None,
        configuration_url=entry.data[CONF_URL],
    )
    return cast(DeviceInfo, {**device, **_via(hass, entry.entry_id, (DOMAIN, entry.entry_id))})


def ams_identifier(entry_id: str, printer: str, unit: str) -> tuple[str, str]:
    """An AMS unit's device identifier, by its printer's key and its own."""
    return (DOMAIN, f"{entry_id}_printer_{printer}_ams_{unit}")


def _domain_of(entity: object) -> str | None:
    """The platform an entity class belongs to: the Home Assistant
    component its entity base class comes from."""
    for cls in type(entity).__mro__:
        parts = cls.__module__.split(".")
        if len(parts) == 3 and parts[:2] == ["homeassistant", "components"]:
            return parts[2]
    return None


def suggest_entity_id(entity: Any, coordinator: BamBuddyPrinterCoordinator, *parts: str) -> None:
    """The entity ID a new entity gets: model, serial number and key --
    the same whatever the printer is called in BamBuddy, in any language.
    Home Assistant keeps the ID of an entity it knows."""
    domain = _domain_of(entity)
    info = coordinator.info
    if domain:
        serial = str(info.get("serial_number") or "").strip() or coordinator.key
        entity.entity_id = f"{domain}.{slugify(' '.join((str(info.get('model') or ''), serial, *parts)))}"


def suggest_instance_entity_id(entity: Any, key: str) -> None:
    """The entity ID a new entity of the instance gets: BamBuddy and the
    English key -- not its address, which may change. A second instance's
    get Home Assistant's `_2`."""
    domain = _domain_of(entity)
    if domain:
        entity.entity_id = f"{domain}.{slugify(' '.join(('bambuddy', key.removeprefix('bambuddy_'))))}"


class BamBuddyInstanceEntity(CoordinatorEntity[BamBuddyInstanceCoordinator]):
    """An entity of the BamBuddy instance's device (created at setup)."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: BamBuddyInstanceCoordinator, key: str) -> None:
        super().__init__(coordinator)
        entry_id = coordinator.config_entry.entry_id
        self._attr_unique_id = f"{entry_id}_{key}"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry_id)})
        description = getattr(self, "entity_description", None)
        translation_key = getattr(description, "translation_key", None) or getattr(self, "_attr_translation_key", None)
        suggest_instance_entity_id(self, translation_key or key)


class BamBuddyUpdatesEntity(CoordinatorEntity[BamBuddyUpdateCoordinator]):
    """An entity fed by the update checks, on the instance's or a printer's
    device."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: BamBuddyUpdateCoordinator, unique_id: str, device: tuple[str, str]) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = unique_id
        self._attr_device_info = DeviceInfo(identifiers={device})


class BamBuddyPrinterEntity(CoordinatorEntity[BamBuddyPrinterCoordinator]):
    """An entity of a printer's device (created at setup). Unavailable while
    the printer is offline: BamBuddy keeps the last values of a printer it
    lost, a print may still read as running."""

    _attr_has_entity_name = True
    # The few entities that tell about the connection itself.
    available_when_offline = False

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, key: str, *, object_id: tuple[str, ...] = ()) -> None:
        super().__init__(coordinator)
        entry_id = coordinator.config_entry.entry_id
        self._attr_unique_id = f"{entry_id}_p{coordinator.key}_{key}"
        self._attr_device_info = DeviceInfo(identifiers={printer_identifier(entry_id, coordinator.key)})
        # The English translation key reads as the entity's English name;
        # an AMS unit's entities name their place and key.
        description = getattr(self, "entity_description", None)
        translation_key = getattr(description, "translation_key", None) or getattr(self, "_attr_translation_key", None)
        suggest_entity_id(self, coordinator, *(object_id or (translation_key or key,)))

    @property
    def data(self) -> PrinterData:
        return self.coordinator.data

    @property
    def available(self) -> bool:
        return super().available and (self.available_when_offline or self.data.connected)


class BamBuddyAmsEntity(BamBuddyPrinterEntity):
    """An entity of an AMS unit's device, a child of the printer's. It
    follows its unit by the unit's serial number: plugged in elsewhere, the
    unit keeps its entities."""

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, ams_id: int, key: str) -> None:
        unit = next((unit for unit in coordinator.data.ams_units if unit.get("id") == ams_id), {"id": ams_id})
        self.ams_key = ams_key(unit)
        self._ams_id = ams_id
        label = ams_label(ams_id).lower()
        super().__init__(coordinator, f"ams{self.ams_key}_{key}", object_id=(label, key))

    @property
    def unit(self) -> dict[str, Any] | None:
        return next((unit for unit in self.data.ams_units if ams_key(unit) == self.ams_key), None)

    @property
    def ams_id(self) -> int:
        """The unit's place now (BamBuddy's AMS id), else where it was."""
        unit = self.unit
        if unit is not None:
            self._ams_id = int(unit.get("id", 0))
        return self._ams_id

    @property
    def available(self) -> bool:
        return super().available and self.unit is not None

    @property
    def device_info(self) -> DeviceInfo:
        """Read when the entity is added: the unit as BamBuddy reports it then."""
        coordinator = self.coordinator
        entry_id = coordinator.config_entry.entry_id
        unit = self.unit or {"id": self.ams_id}
        model = ams_model(unit, self.data)
        device = DeviceInfo(
            identifiers={ams_identifier(entry_id, coordinator.key, self.ams_key)},
            name=ams_name(coordinator.info, self.ams_id, model, unit.get("serial_number")),
            manufacturer="Bambu Lab",
            model=model,
            serial_number=unit.get("serial_number") or None,
            sw_version=unit.get("sw_ver") or None,
        )
        parent = printer_identifier(entry_id, coordinator.key)
        return cast(DeviceInfo, {**device, **_via(self.hass, entry_id, parent)})


async def async_run_command(
    coordinator: BamBuddyPrinterCoordinator,
    call: Callable[[], Awaitable[_T]],
    *,
    allowed: Callable[[PrinterData], bool] | None = None,
    refusal: str = "not_now",
    idle_only: bool = False,
    paused_ok: bool = False,
    offline_ok: bool = False,
    refresh: bool = True,
) -> _T:
    """Send a command to a printer, unless it cannot take it now; BamBuddy's
    refusals as translated errors; the status read again shortly after.

    `allowed`: whether the command makes sense in the printer's state, else
    the error `refusal`. `idle_only`: refused while a job is under way --
    BamBuddy would put moves and filament changes into the running print --
    and while the AMS changes filament. `paused_ok`: but a paused print
    takes it -- a filament swap by hand, between the colours of a print.
    `offline_ok`: BamBuddy acts without the printer (it sends it nothing).
    `refresh`: a command, not a read: read the status again soon after."""
    data = coordinator.data
    placeholders = {"printer": coordinator.printer_name}
    if not data.connected and not offline_ok:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="printer_offline", translation_placeholders=placeholders
        )
    if idle_only and data.job_running:
        if not paused_ok:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="job_running", translation_placeholders=placeholders
            )
        if data.state != "PAUSE":
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="pause_first", translation_placeholders=placeholders
            )
    if idle_only and data.changing_filament:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="filament_change", translation_placeholders=placeholders
        )
    if allowed is not None and not allowed(data):
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key=refusal, translation_placeholders=placeholders
        )
    try:
        result = await call()
    except BamBuddyPermissionError as err:
        raise HomeAssistantError(translation_domain=DOMAIN, translation_key="control_not_permitted") from err
    except BamBuddyAuthError as err:
        coordinator.config_entry.async_start_reauth(coordinator.hass)
        raise HomeAssistantError(translation_domain=DOMAIN, translation_key="auth_failed") from err
    except BamBuddyConnectionError as err:
        raise HomeAssistantError(translation_domain=DOMAIN, translation_key="cannot_connect") from err
    except BamBuddyError as err:
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="command_failed",
            translation_placeholders={"error": str(err)},
        ) from err
    if refresh:
        coordinator.async_refresh_soon()
    return result
