"""The integration's actions: what is no entity -- moving the axes, homing,
extruding, loading and unloading filament, setting a slot's filament,
drying an AMS unit. The dashboard card calls them too."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from functools import partial
import re
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator, printer_identifier
from .entity import ams_identifier, async_run_command
from .models import (
    EXTERNAL_LEFT,
    EXTERNAL_RIGHT,
    MATERIALS,
    PrinterData,
    ams_key,
    active_tray,
    find_tray,
    has_rfid,
    tray_empty,
    tray_id,
    tray_label,
)

ATTR_DEVICE_ID = "device_id"
ATTR_ENTITY_ID = "entity_id"
ATTR_AXIS = "axis"
ATTR_DISTANCE = "distance"
ATTR_TEMPERATURE = "temperature"
ATTR_DURATION = "duration"
ATTR_OBJECTS = "objects"
ATTR_MATERIAL = "material"
ATTR_COLOR = "color"
# BamBuddy's AMS id of the external spools.
_EXTERNAL_AMS = 255
# BamBuddy skips objects only in these states.
_SKIPPABLE = frozenset({"RUNNING", "PAUSE"})

# The firmware refuses to extrude below this nozzle temperature.
MIN_EXTRUDE_TEMPERATURE = 170
# <printer>_ams<unit>_slot_<n>, or <printer>_external_spool[_2].
_SLOT_IN_UNIQUE_ID = re.compile(r"p([^_]+)_(?:ams([^_]+)_slot_(\d+)|external_spool(_2)?)")


def _nonzero(value: float) -> float:
    if value == 0:
        raise vol.Invalid("the distance must not be 0")
    return value


def _distance(limit: float) -> vol.All:
    return vol.All(vol.Coerce(float), vol.Range(min=-limit, max=limit), _nonzero)


_DEVICE = {vol.Required(ATTR_DEVICE_ID): cv.string}
SCHEMAS: dict[str, vol.Schema] = {
    "move_axis": vol.Schema({**_DEVICE, vol.Required(ATTR_AXIS): vol.In(["x", "y", "z"]), vol.Required(ATTR_DISTANCE): _distance(200)}),
    "home_axes": vol.Schema(_DEVICE),
    "extrude": vol.Schema({**_DEVICE, vol.Required(ATTR_DISTANCE): _distance(100)}),
    "load_filament": vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id}),
    "unload_filament": vol.Schema(_DEVICE),
    "start_drying": vol.Schema(
        {
            **_DEVICE,
            vol.Required(ATTR_TEMPERATURE): vol.All(vol.Coerce(int), vol.Range(min=45, max=85)),
            vol.Required(ATTR_DURATION): vol.All(vol.Coerce(int), vol.Range(min=1, max=24)),
        }
    ),
    "stop_drying": vol.Schema(_DEVICE),
    "get_print_objects": vol.Schema(_DEVICE),
    "skip_objects": vol.Schema(
        {**_DEVICE, vol.Required(ATTR_OBJECTS): vol.All(cv.ensure_list, [vol.Coerce(int)], vol.Length(min=1))}
    ),
    "set_filament": vol.Schema(
        {
            vol.Required(ATTR_ENTITY_ID): cv.entity_id,
            vol.Optional(ATTR_MATERIAL): vol.In(list(MATERIALS)),
            vol.Optional(ATTR_COLOR): vol.All(vol.Coerce(tuple), vol.ExactSequence((cv.byte, cv.byte, cv.byte))),
        }
    ),
}


def _refuse(key: str, **placeholders: str) -> ServiceValidationError:
    return ServiceValidationError(
        translation_domain=DOMAIN, translation_key=key, translation_placeholders=placeholders or None
    )


def _loaded_entries(hass: HomeAssistant) -> list[BamBuddyConfigEntry]:
    return [
        entry
        for entry in hass.config_entries.async_entries(DOMAIN)
        if entry.state is ConfigEntryState.LOADED
    ]


def _controllable(entry: BamBuddyConfigEntry, coordinator: BamBuddyPrinterCoordinator) -> BamBuddyPrinterCoordinator:
    if not entry.runtime_data.can_control:
        raise _refuse("control_not_permitted")
    return coordinator


def _printer(hass: HomeAssistant, device_id: str, *, control: bool = True) -> BamBuddyPrinterCoordinator:
    """The printer of a printer device; `control`: the action commands it."""
    device = dr.async_get(hass).async_get(device_id)
    if device is not None:
        for entry in _loaded_entries(hass):
            for coordinator in entry.runtime_data.printers.values():
                if printer_identifier(entry.entry_id, coordinator.key) in device.identifiers:
                    return _controllable(entry, coordinator) if control else coordinator
    raise _refuse("not_a_printer")


def _ams(hass: HomeAssistant, device_id: str) -> tuple[BamBuddyPrinterCoordinator, int]:
    """The printer and the unit id of an AMS unit's device."""
    device = dr.async_get(hass).async_get(device_id)
    if device is not None:
        for entry in _loaded_entries(hass):
            for coordinator in entry.runtime_data.printers.values():
                for unit in coordinator.data.ams_units:
                    if ams_identifier(entry.entry_id, coordinator.key, ams_key(unit)) in device.identifiers:
                        return _controllable(entry, coordinator), int(unit.get("id", 0))
    raise _refuse("not_an_ams")


def _place(hass: HomeAssistant, entity_id: str) -> tuple[BamBuddyPrinterCoordinator, int, int, int]:
    """Where a slot or external spool sensor's filament sits, from its
    unique ID -- the sensor is unavailable while the printer is offline, and
    the command then says so: the printer, BamBuddy's AMS id and slot in it
    (the external spools: AMS 255, 0 left or the only one, 1 right), and
    BamBuddy's global tray id."""
    entity = er.async_get(hass).async_get(entity_id)
    if entity is not None and entity.platform == DOMAIN:
        for entry in _loaded_entries(hass):
            if entity.config_entry_id != entry.entry_id:
                continue
            match = _SLOT_IN_UNIQUE_ID.fullmatch(entity.unique_id.removeprefix(f"{entry.entry_id}_"))
            coordinator = next(
                (printer for printer in entry.runtime_data.printers.values() if match and printer.key == match.group(1)),
                None,
            )
            if match and coordinator is not None:
                _, ams, slot, right = match.groups()
                if ams is not None:
                    unit, index = _unit_place(coordinator, ams), int(slot) - 1
                    return _controllable(entry, coordinator), unit, index, tray_id(unit, index)
                return _controllable(entry, coordinator), _EXTERNAL_AMS, int(bool(right)), (
                    EXTERNAL_RIGHT if right else EXTERNAL_LEFT
                )
    raise _refuse("not_a_slot")


def _unit_place(coordinator: BamBuddyPrinterCoordinator, key: str) -> int:
    """Where an AMS unit is plugged in now (BamBuddy's AMS id). A unit the
    printer does not report: with the printer online, its slots hold
    nothing; offline, the command says so first."""
    for unit in coordinator.data.ams_units:
        if ams_key(unit) == key:
            return int(unit.get("id", 0))
    if coordinator.data.connected:
        raise _refuse("slot_empty")
    return int(key) if key.isdigit() else 0


def _slot(hass: HomeAssistant, entity_id: str) -> tuple[BamBuddyPrinterCoordinator, int]:
    """The printer and BamBuddy's tray id of a slot that holds filament."""
    coordinator, _, _, tray = _place(hass, entity_id)
    found = find_tray(coordinator.data, tray)
    if coordinator.data.connected and (found is None or tray_empty(found[0])):
        raise _refuse("slot_empty")
    return coordinator, tray


async def _move_axis(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID])
    client, printer, distance = coordinator.client, coordinator.printer_id, call.data[ATTR_DISTANCE]
    move = {
        "x": partial(client.jog_xy, printer, distance, 0.0),
        "y": partial(client.jog_xy, printer, 0.0, distance),
        "z": partial(client.jog_z, printer, distance),
    }[call.data[ATTR_AXIS]]
    await async_run_command(coordinator, move, idle_only=True)


async def _home_axes(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID])
    await async_run_command(coordinator, partial(coordinator.client.home_axes, coordinator.printer_id), idle_only=True)


def _active_nozzle_temperature(coordinator: BamBuddyPrinterCoordinator) -> float:
    """The temperature of the nozzle that extrudes: on two-nozzle printers
    BamBuddy's `nozzle` is the left one (extruder 1), `nozzle_2` the right."""
    data = coordinator.data
    temperatures = data.temperatures
    key = "nozzle_2" if data.is_dual_nozzle and data.status.get("active_extruder") == 0 else "nozzle"
    value = temperatures.get(key)
    return float(value) if isinstance(value, int | float) else 0.0


async def _extrude(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID])
    data = coordinator.data
    # Offline, a job or a filament change: the general refusal says why.
    if data.connected and not data.job_running and not data.changing_filament:
        temperature = _active_nozzle_temperature(coordinator)
        if temperature < MIN_EXTRUDE_TEMPERATURE:
            raise _refuse("nozzle_too_cold", temperature=f"{temperature:.0f}", minimum=str(MIN_EXTRUDE_TEMPERATURE))
    await async_run_command(
        coordinator,
        partial(coordinator.client.jog_extruder, coordinator.printer_id, call.data[ATTR_DISTANCE]),
        idle_only=True,
    )


async def _load_filament(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator, tray = _slot(hass, call.data[ATTR_ENTITY_ID])
    if 128 <= tray < 254:
        # BamBuddy cannot load from an AMS HT.
        raise _refuse("ams_ht_load")
    await async_run_command(
        coordinator,
        partial(coordinator.client.load_filament, coordinator.printer_id, tray),
        idle_only=True,
        paused_ok=True,
    )


async def _unload_filament(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID])
    await async_run_command(
        coordinator,
        partial(coordinator.client.unload_filament, coordinator.printer_id),
        idle_only=True,
        paused_ok=True,
    )


async def _set_filament(hass: HomeAssistant, call: ServiceCall) -> None:
    """A slot's material and colour, for spools without a chip: what the
    printer's screen asks after a spool goes in. A new colour alone keeps
    the slot's preset and its K value; a new material takes Bambu's generic
    profile of it and the default K value, as on the printer's screen."""
    if ATTR_MATERIAL not in call.data and ATTR_COLOR not in call.data:
        raise _refuse("nothing_to_set")
    coordinator, ams, slot, tray = _place(hass, call.data[ATTR_ENTITY_ID])
    data = coordinator.data
    found = find_tray(data, tray)
    current = found[0] if found else {}
    if data.connected:
        if ams != _EXTERNAL_AMS and (found is None or current.get("exists") is False):
            raise _refuse("slot_empty")
        if has_rfid(current):
            raise _refuse("rfid_spool")
        if data.changing_filament:
            raise _refuse("filament_change", printer=coordinator.printer_name)
        # A paused print may relabel the spool swapped in by hand.
        if data.job_running and data.state != "PAUSE" and _in_use(data, ams, slot, tray):
            raise _refuse("slot_in_use", printer=coordinator.printer_name)
    material = MATERIALS.get(call.data.get(ATTR_MATERIAL, ""))
    if material is not None:
        tray_type, name, profile, cali_idx = (
            material.tray_type,
            f"Generic {call.data[ATTR_MATERIAL]}",
            material.profile,
            -1,
        )
        temp_min, temp_max = material.temp_min, material.temp_max
    else:
        tray_type = str(current.get("tray_type") or "")
        if not tray_type:
            raise _refuse("material_needed")
        name, profile = tray_label(current), ""
        cali = current.get("cali_idx")
        cali_idx = cali if isinstance(cali, int) else -1
        temp_min, temp_max = _temperatures(current, tray_type)
    color = call.data.get(ATTR_COLOR)
    hex_color = "{:02X}{:02X}{:02X}".format(*color) if color else str(current.get("tray_color") or "FFFFFF")[:6]
    await async_run_command(
        coordinator,
        partial(
            coordinator.client.configure_slot,
            coordinator.printer_id,
            ams,
            slot,
            tray_type=tray_type,
            name=name,
            color=f"{hex_color.upper()}FF",
            temp_min=temp_min,
            temp_max=temp_max,
            tray_info_idx=profile,
            cali_idx=cali_idx,
            nozzle_diameter=_nozzle_diameter(data, ams, slot),
        ),
    )


def _in_use(data: PrinterData, ams: int, slot: int, tray: int) -> bool:
    """The slot feeds a nozzle: BamBuddy's tray_now names one, its
    extruder_slots each nozzle's on two-nozzle printers -- in the printer's
    own ids there, the external spools 254 (left) and 255 (right)."""
    if active_tray(data.status) == tray:
        return True
    fed = [item for item in (data.status.get("extruder_slots") or {}).values() if item.get("has_filament")]
    if ams == _EXTERNAL_AMS:
        return any(item.get("ams_id") == tray for item in fed)
    return any((item.get("ams_id"), item.get("slot_id")) == (ams, slot) for item in fed)


def _nozzle_diameter(data: PrinterData, ams: int, slot: int) -> str:
    """The diameter of the nozzle the slot feeds -- the printer keeps a K
    value per diameter. BamBuddy's nozzles: 0 the right or only nozzle, 1
    the left; an AMS unit's from its ams_extruder_map, the left external
    spool feeds the left nozzle."""
    extruder = 0
    if data.is_dual_nozzle:
        if ams == _EXTERNAL_AMS:
            extruder = 1 if slot == 0 else 0
        else:
            extruder = int((data.status.get("ams_extruder_map") or {}).get(str(ams), 0))
    nozzles = data.status.get("nozzles") or []
    for index in (extruder, 0):
        if index < len(nozzles) and nozzles[index].get("nozzle_diameter"):
            return str(nozzles[index]["nozzle_diameter"])
    return "0.4"


def _temperatures(tray: dict[str, Any], tray_type: str) -> tuple[int, int]:
    """The slot's own nozzle range, else its material's."""
    low, high = tray.get("nozzle_temp_min"), tray.get("nozzle_temp_max")
    if isinstance(low, int) and isinstance(high, int) and 0 < low <= high:
        return low, high
    material = MATERIALS.get(tray_type) or MATERIALS["PLA"]
    return material.temp_min, material.temp_max


async def _start_drying(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator, unit = _ams(hass, call.data[ATTR_DEVICE_ID])
    await async_run_command(
        coordinator,
        partial(
            coordinator.client.start_drying,
            coordinator.printer_id,
            unit,
            call.data[ATTR_TEMPERATURE],
            call.data[ATTR_DURATION],
        ),
    )


async def _stop_drying(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator, unit = _ams(hass, call.data[ATTR_DEVICE_ID])
    await async_run_command(coordinator, partial(coordinator.client.stop_drying, coordinator.printer_id, unit))


async def _get_print_objects(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    """A read: Read Status is enough."""
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID], control=False)
    answer = await async_run_command(
        coordinator,
        partial(coordinator.client.get_print_objects, coordinator.printer_id),
        allowed=lambda data: data.state in _SKIPPABLE,
        refusal="not_printing",
        refresh=False,
    )
    return {
        "objects": [
            {"id": item.get("id"), "name": item.get("name"), "skipped": bool(item.get("skipped"))}
            for item in answer.get("objects") or []
            if isinstance(item, dict)
        ]
    }


async def _skip_objects(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID])
    await async_run_command(
        coordinator,
        partial(coordinator.client.skip_objects, coordinator.printer_id, call.data[ATTR_OBJECTS]),
        allowed=lambda data: data.state in _SKIPPABLE,
        refusal="not_printing",
    )


_HANDLERS: dict[str, Callable[[HomeAssistant, ServiceCall], Awaitable[None]]] = {
    "move_axis": _move_axis,
    "home_axes": _home_axes,
    "extrude": _extrude,
    "load_filament": _load_filament,
    "unload_filament": _unload_filament,
    "start_drying": _start_drying,
    "stop_drying": _stop_drying,
    "skip_objects": _skip_objects,
    "set_filament": _set_filament,
}


@callback
def async_setup_services(hass: HomeAssistant) -> None:
    """Register the actions once, for every entry."""
    for name, handler in _HANDLERS.items():

        async def _handle(call: ServiceCall, handler: Any = handler) -> None:
            await handler(hass, call)

        # Home Assistant 2026.10 types schemas as probatio schemas; voluptuous
        # works the same from 2025.5 on.
        hass.services.async_register(DOMAIN, name, _handle, schema=SCHEMAS[name])  # type: ignore[arg-type]

    async def _handle_objects(call: ServiceCall) -> ServiceResponse:
        return await _get_print_objects(hass, call)

    hass.services.async_register(
        DOMAIN,
        "get_print_objects",
        _handle_objects,
        schema=SCHEMAS["get_print_objects"],  # type: ignore[arg-type]
        supports_response=SupportsResponse.ONLY,
    )
