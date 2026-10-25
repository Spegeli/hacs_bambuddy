"""What the entities share: their devices, when they are available, and how
a command reaches a printer."""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterable
from typing import Any, TypeVar, cast

from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity import Entity, EntityDescription
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import slugify

from .api import BamBuddyApiError, BamBuddyAuthError, BamBuddyConnectionError, BamBuddyError, BamBuddyPermissionError, timed_out
from .const import CONF_URL, DOMAIN
from .coordinator import (
    BamBuddyConfigEntry,
    BamBuddyInstanceCoordinator,
    BamBuddyPlugCoordinator,
    BamBuddyPrinterCoordinator,
    BamBuddyUpdateCoordinator,
    failure,
    find_device,
)
from .models import PrinterData, ams_key, ams_model, ams_name, ams_object_id, ams_serial, display_model, short_name
from .plug_identity import PlugIdentity, device_identifier, entity_unique_id
from .plugs import Plug

_T = TypeVar("_T")

# Home Assistant 2026.8 links a device to its parent by the parent's
# registry id and deprecates the identifiers (removed in 2027.8); 2025.5,
# the floor, knows only the identifiers.
_VIA_BY_ID = "via_device_id" in DeviceInfo.__annotations__


def _with_parent(hass: HomeAssistant, entry_id: str, device: DeviceInfo, parent: tuple[str, str]) -> DeviceInfo:
    """The device, linked to its parent."""
    if not _VIA_BY_ID:
        return cast(DeviceInfo, {**device, "via_device": parent})
    found = find_device(hass, entry_id, parent)
    return cast(DeviceInfo, {**device, "via_device_id": found.id}) if found else device


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
        identifiers={coordinator.identifier},
        name=coordinator.printer_name,
        manufacturer="Bambu Lab",
        model=display_model(info.get("model")) or None,
        serial_number=info.get("serial_number") or None,
        sw_version=coordinator.data.status.get("firmware_version") or None,
        configuration_url=entry.data[CONF_URL],
    )
    return _with_parent(hass, entry.entry_id, device, (DOMAIN, entry.entry_id))


def _translation_key(entity: Entity) -> str | None:
    """The entity's translation key, from its description or its class."""
    description = getattr(entity, "entity_description", None)
    return getattr(description, "translation_key", None) or getattr(entity, "_attr_translation_key", None)


def _domain_of(entity: object) -> str | None:
    """The platform an entity class belongs to: the Home Assistant
    component its entity base class comes from."""
    for cls in type(entity).__mro__:
        parts = cls.__module__.split(".")
        if len(parts) == 3 and parts[:2] == ["homeassistant", "components"]:
            return parts[2]
    return None


def _suggest(entity: Any, *words: str) -> None:
    """The entity ID a new entity gets: its platform and the words, in
    Home Assistant's form. Home Assistant keeps the ID of an entity it knows."""
    domain = _domain_of(entity)
    if domain:
        entity.entity_id = f"{domain}.{slugify(' '.join(words))}"


def printer_object_id(coordinator: BamBuddyPrinterCoordinator, *parts: str) -> str:
    """The object ID a new printer entity gets: model, serial number and key --
    the same whatever the printer is called in BamBuddy, in any language."""
    info = coordinator.info
    serial = str(info.get("serial_number") or "").strip() or coordinator.key
    # Without a model, "printer" in its place: no entity ID begins with a digit.
    return slugify(" ".join((display_model(info.get("model")) or "printer", serial, *parts)))


def suggest_entity_id(entity: Any, coordinator: BamBuddyPrinterCoordinator, *parts: str) -> None:
    """The ID a new printer entity gets (`printer_object_id`)."""
    domain = _domain_of(entity)
    if domain:
        entity.entity_id = f"{domain}.{printer_object_id(coordinator, *parts)}"


def suggest_instance_entity_id(entity: Any, key: str) -> None:
    """The ID a new entity of the instance gets: BamBuddy and the English
    key -- not its address, which may change. A second instance's get Home
    Assistant's `_2`."""
    _suggest(entity, "bambuddy", key.removeprefix("bambuddy_"))


def suggest_plug_entity_id(entity: Any, identity: PlugIdentity, key: str) -> None:
    """The ID a new entity of a smart plug gets: six characters of what the
    plug switches and the English key -- it stays when the plug is renamed,
    moved to another printer or found on another BamBuddy; a second plug
    that switches the same gets Home Assistant's `_2`. The plug's own switch
    or state is named as its device, without the key:
    `switch.bambuddy_smart_plug_3f9a2c` beside its power sensor
    `sensor.bambuddy_smart_plug_3f9a2c_power`."""
    own = key == "power" and _domain_of(entity) in ("switch", "binary_sensor")
    _suggest(entity, "bambuddy smart plug", identity.digest, *(() if own else (key,)))


def switch_off_unique_id(entry_id: str, printer_key: str, key: str) -> str:
    """Our switch-off after the print belongs to its printer: its settings
    stay with it whichever plug is the printer's own."""
    return f"{entry_id}_switchoff_{printer_key}_{key}"


def key_by_printer(entity: Any, printer: BamBuddyPrinterCoordinator, key: str) -> None:
    """A switch-off entity's unique ID and entity ID, by its printer."""
    entity._attr_unique_id = switch_off_unique_id(printer.config_entry.entry_id, printer.key, key)
    suggest_entity_id(entity, printer, key)


def plug_device_info(
    hass: HomeAssistant, entry_id: str, identifier: tuple[str, str], name: str, model: str, printer: tuple[str, str] | None
) -> DeviceInfo:
    """A plug's device, under its printer's where there is one."""
    device = DeviceInfo(identifiers={identifier}, name=name, model=model)
    return device if printer is None else _with_parent(hass, entry_id, device, printer)


class BamBuddyInstanceEntity(CoordinatorEntity[BamBuddyInstanceCoordinator]):
    """An entity of the BamBuddy instance's device (created at setup)."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: BamBuddyInstanceCoordinator, key: str) -> None:
        super().__init__(coordinator)
        entry_id = coordinator.config_entry.entry_id
        self._attr_unique_id = f"{entry_id}_{key}"
        self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, entry_id)})
        suggest_instance_entity_id(self, _translation_key(self) or key)


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
        self._attr_unique_id = coordinator.entity_unique_id(key)
        coordinator.created.add(self._attr_unique_id)
        self._attr_device_info = DeviceInfo(identifiers={coordinator.identifier})
        # The English translation key reads as the entity's English name;
        # an AMS unit's entity names its own (`BamBuddyAmsEntity`).
        suggest_entity_id(self, coordinator, *(object_id or (_translation_key(self) or key,)))

    @property
    def data(self) -> PrinterData:
        return self.coordinator.data

    @property
    def available(self) -> bool:
        return super().available and (self.available_when_offline or self.data.connected)


class BamBuddyDescribedEntity(BamBuddyPrinterEntity):
    """A printer entity made from its description: its key and name come
    from it, and whether it stays available while the printer is offline."""

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, description: EntityDescription) -> None:
        # First: the entity ID is made from its translation key.
        self.entity_description = description
        super().__init__(coordinator, description.key)
        self.available_when_offline = getattr(description, "available_when_offline", False)


class BamBuddyToggle(BamBuddyPrinterEntity):
    """An on/off control: on as BamBuddy reports it, one command both ways."""

    def _reported(self) -> Any:
        raise NotImplementedError

    def _command(self, on: bool) -> Callable[[], Awaitable[None]]:
        raise NotImplementedError

    @property
    def is_on(self) -> bool | None:
        value = self._reported()
        return None if value is None else bool(value)

    async def async_turn_on(self, **kwargs: Any) -> None:
        await async_run_command(self.coordinator, self._command(True))

    async def async_turn_off(self, **kwargs: Any) -> None:
        await async_run_command(self.coordinator, self._command(False))


class BamBuddyAmsEntity(BamBuddyPrinterEntity):
    """An entity of an AMS unit's device, a child of the printer's. It
    follows its unit by the unit's serial number: plugged in elsewhere, the
    unit keeps its entities. Its entity ID names what stays for the unit,
    its model and serial (`models.ams_object_id`)."""

    def __init__(self, coordinator: BamBuddyPrinterCoordinator, ams_id: int, key: str) -> None:
        unit = next((unit for unit in coordinator.data.ams_units if unit.get("id") == ams_id), {"id": ams_id})
        self.ams_key = ams_key(unit)
        self._ams_id = ams_id
        super().__init__(coordinator, f"ams{self.ams_key}_{key}")
        _suggest(self, ams_object_id(ams_model(unit, coordinator.data), coordinator.key, ams_id, ams_serial(unit), key))

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
            identifiers={coordinator.ams_identifier(self.ams_key)},
            name=ams_name(coordinator.info, self.ams_id, model, unit.get("serial_number")),
            manufacturer="Bambu Lab",
            model=model,
            serial_number=unit.get("serial_number") or None,
            sw_version=unit.get("sw_ver") or None,
        )
        return _with_parent(self.hass, entry_id, device, coordinator.identifier)


def async_add_ams_entities(
    coordinator: BamBuddyPrinterCoordinator,
    async_add_entities: AddConfigEntryEntitiesCallback,
    create: Callable[[dict[str, Any], PrinterData], Iterable[tuple[str, Callable[[], Entity]]]],
    wanted: Callable[[dict[str, Any], PrinterData], bool] = lambda unit, data: True,
) -> None:
    """The entities of each AMS unit `wanted`, each once: `create` names
    them by key with a maker. Now, and later for a unit attached later or
    for an entity its report allows only later -- BamBuddy may name a
    unit's type a moment after the unit."""
    known: set[tuple[str, str]] = set()

    @callback
    def add_new() -> None:
        data = coordinator.data
        entities: list[Entity] = []
        # A unit whose device was deleted (unplugged, then removed) is new
        # when it comes back.
        for gone in {unit_key for unit_key, _ in known}:
            if find_device(coordinator.hass, coordinator.config_entry.entry_id, coordinator.ams_identifier(gone)) is None:
                known.difference_update({item for item in known if item[0] == gone})
        for unit in data.ams_units:
            if not wanted(unit, data) or not coordinator.ams_unit_ready(unit):
                continue
            unit_key = ams_key(unit)
            for key, make in create(unit, data):
                if (unit_key, key) not in known:
                    known.add((unit_key, key))
                    entities.append(make())
        if entities:
            async_add_entities(entities)

    add_new()
    coordinator.config_entry.async_on_unload(coordinator.async_add_listener(add_new))


def refuse(key: str, **placeholders: str) -> ServiceValidationError:
    """A command or an action the printer cannot take now, and why."""
    return ServiceValidationError(
        translation_domain=DOMAIN, translation_key=key, translation_placeholders=placeholders or None
    )


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
    check: Callable[[PrinterData, str], None] | None = None,
) -> _T:
    """Send a command to a printer, unless it cannot take it now; BamBuddy's
    refusals as translated errors; the status read again shortly after.

    `allowed`: whether the command makes sense in the printer's state, else
    the error `refusal`. `idle_only`: refused while a job is under way --
    BamBuddy would put moves and filament changes into the running print --
    and while the AMS changes filament. `paused_ok`: but a paused print
    takes it -- a filament swap by hand, between the colours of a print.
    `offline_ok`: BamBuddy acts without the printer (it sends it nothing).
    `refresh`: a command, not a read: read the status again soon after.
    `check`: raises `refuse(key, printer=name)` where the printer's state
    rules the command out for a reason of its own, after `allowed`.
    A refusal (401, 403) goes to the key's guard: it says whether the key is
    the cause, and alone starts a reauthentication."""
    data = coordinator.data
    # BamBuddy's name, short enough for a phone's toast.
    name = short_name(coordinator.info)
    if coordinator.replaced:
        raise refuse("printer_replaced", printer=name)
    if not data.connected and not offline_ok:
        raise refuse("printer_offline", printer=name)
    if idle_only and data.job_running:
        if not paused_ok:
            raise refuse("job_running", printer=name)
        if data.state != "PAUSE":
            raise refuse("pause_first", printer=name)
    if idle_only and data.changing_filament:
        raise refuse("filament_change", printer=name)
    if allowed is not None and not allowed(data):
        raise refuse(refusal, printer=name)
    if check is not None:
        check(data, name)
    if refresh:
        coordinator.note_command()
    try:
        result = await call()
    except (BamBuddyAuthError, BamBuddyPermissionError) as err:
        raise await coordinator.config_entry.runtime_data.key.async_refused(err) from err
    except BamBuddyConnectionError as err:
        if timed_out(err) and not refresh:
            # A read: nothing may still reach the printer.
            raise failure(err, HomeAssistantError) from err
        if timed_out(err):
            raise HomeAssistantError(translation_domain=DOMAIN, translation_key="no_answer") from err
        raise HomeAssistantError(translation_domain=DOMAIN, translation_key="cannot_connect") from err
    except BamBuddyError as err:
        if not refresh:
            # A read is no command BamBuddy refused.
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="read_failed", translation_placeholders={"error": str(err)}
            ) from err
        # BamBuddy said no (4xx): a validation error -- no ERROR in the log,
        # and an automation can tell it from a BamBuddy that fails.
        kind = ServiceValidationError if isinstance(err, BamBuddyApiError) and 400 <= err.status < 500 else HomeAssistantError
        raise kind(
            translation_domain=DOMAIN,
            translation_key="command_failed",
            translation_placeholders={"error": str(err)},
        ) from err
    if refresh:
        coordinator.async_refresh_soon()
    return result


class BamBuddyPlugEntity(CoordinatorEntity[BamBuddyPlugCoordinator]):
    """An entity of a smart plug's device, a child of its printer's. The
    entity belongs to what the plug switches, the device to BamBuddy's plug
    (`plug_identity`); BamBuddy's number is only what it is asked by."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: BamBuddyPlugCoordinator, plug: Plug, key: str) -> None:
        super().__init__(coordinator)
        identity = coordinator.identity(plug.id)
        if identity is None:
            # Entities are made for linked plugs only, each known by then.
            raise RuntimeError(f"smart plug {plug.id} has no identity")
        self.plug_id = plug.id
        self._printer_id = plug.printer_id
        self._identity = identity
        self._attr_unique_id = entity_unique_id(coordinator.config_entry.entry_id, identity, key)
        suggest_plug_entity_id(self, identity, key)

    @property
    def plug(self) -> Plug | None:
        return (self.coordinator.data or {}).get(self.plug_id)

    def plug_role(self) -> dict[str, Any] | None:
        """What the card tells plugs apart by, and BamBuddy's own auto off --
        as capability attributes: Home Assistant keeps those while the plug
        is unavailable, and drops the others."""
        plug = self.plug
        if plug is None:
            return None
        return {
            "powers_printer": plug.powers_printer,
            # Of two plugs that power the printer, which is its own (the card's
            # tag, switch-off row and offline view): BamBuddy's choice.
            "printer_main": plug.id == self.coordinator.main_plug(plug.printer_id),
            "on_printer_card": plug.on_card,
            "bambuddy_auto_off": plug.bambuddy_auto_off,
            "plug_type": plug.plug_type,
        }

    def plug_attributes(self) -> dict[str, Any]:
        """Off to on, seen by the integration: the card counts the start."""
        plug = self.plug
        if plug is None:
            return {}
        on_since = self.coordinator.on_since(plug.id)
        return {"on_since": on_since.isoformat() if on_since else None}

    @property
    def available(self) -> bool:
        return super().available and self.plug is not None

    @property
    def device_info(self) -> DeviceInfo:
        """Read when the entity is added: the plug as BamBuddy lists it then."""
        coordinator = self.coordinator
        entry_id = coordinator.config_entry.entry_id
        plug = self.plug or Plug({"id": self.plug_id, "printer_id": self._printer_id})
        printer = coordinator.printers.get(plug.printer_id or -1)
        return plug_device_info(
            self.hass,
            entry_id,
            device_identifier(entry_id, self._identity),
            coordinator.device_name(plug),
            plug.model,
            printer.identifier if printer else None,
        )


def async_add_plug_entities(
    coordinator: BamBuddyPlugCoordinator,
    async_add_entities: AddConfigEntryEntitiesCallback,
    create: Callable[[Plug], Iterable[tuple[str, Callable[[], Entity]]]],
) -> None:
    """The entities `create` names for each plug, each once: now, and later
    for a plug BamBuddy links later, or a figure a plug reports later."""
    known: set[tuple[int, str]] = set()

    @callback
    def add_new() -> None:
        if coordinator.config_entry.runtime_data.reloading:
            # The reload builds anew: meanwhile a unique ID may have moved
            # to another plug that still holds it.
            return
        entities: list[Entity] = []
        # By number: of two plugs that switch the same, the second gets the _2
        # (BamBuddy lists its plugs by name).
        for plug in sorted((coordinator.data or {}).values(), key=lambda plug: plug.id):
            for key, make in create(plug):
                if (plug.id, key) not in known:
                    known.add((plug.id, key))
                    entities.append(make())
                    coordinator.note_built(plug.id)
        if entities:
            async_add_entities(entities)

    add_new()
    coordinator.config_entry.async_on_unload(coordinator.async_add_listener(add_new))


async def async_switch_plug(coordinator: BamBuddyPlugCoordinator, plug: Plug, on: bool) -> None:
    """A plug on or off (a script runs); BamBuddy's refusals as translated
    errors; the plug read again shortly after, and its printer: off, a plug
    that powers the printer takes it offline. Off is never refused -- the
    plug is an emergency stop; the card asks first."""
    coordinator.note_command()
    try:
        await coordinator.client.control_plug(plug.id, on)
    except (BamBuddyAuthError, BamBuddyPermissionError) as err:
        raise await coordinator.config_entry.runtime_data.key.async_refused(err) from err
    except BamBuddyConnectionError as err:
        if timed_out(err):
            raise HomeAssistantError(translation_domain=DOMAIN, translation_key="no_answer") from err
        raise HomeAssistantError(translation_domain=DOMAIN, translation_key="cannot_connect") from err
    except BamBuddyApiError as err:
        if err.status == 503:
            # BamBuddy reached, the plug not.
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="plug_not_answering", translation_placeholders={"plug": plug.name}
            ) from err
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="plug_command_failed",
            translation_placeholders={"plug": plug.name, "error": err.detail},
        ) from err
    coordinator.async_switched(plug.id, on)
    coordinator.async_refresh_soon()
    printer = coordinator.printers.get(plug.printer_id or -1)
    if printer is not None and plug.powers_printer:
        printer.async_refresh_soon()

