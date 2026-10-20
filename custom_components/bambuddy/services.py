"""The integration's actions: what is no entity -- moving the axes, homing,
extruding, loading and unloading filament, setting a slot's filament and K
profile, resetting a slot, reading its chip again, drying an AMS unit,
skipping objects, answering HMS messages, checking the connection, marking
maintenance done. The dashboard card calls them too."""
from __future__ import annotations

from collections.abc import Callable, Coroutine, Iterator
from functools import partial
import re
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from .api import BamBuddyApiError
from .const import CONF_PRINTER_NAME, CONF_PRINTERS, DOMAIN, K_PROFILES_KEEP
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator, printer_identifier
from .entity import async_run_command, refuse as _refuse
from .models import (
    DRYING_MAX,
    EXTERNAL_LEFT,
    EXTERNAL_RIGHT,
    MATERIALS,
    PRINTING_STATES,
    PrinterData,
    active_tray,
    ams_key,
    ams_model,
    can_dry,
    drying_minutes,
    find_tray,
    has_heater,
    has_rfid,
    hms_answers,
    hms_code,
    is_drying,
    short_name,
    stored_key,
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
ATTR_TASK_ID = "task_id"
ATTR_CODE = "code"
ATTR_K_PROFILE = "k_profile"
ATTR_ACTION = "action"
# BamBuddy's AMS id of the external spools.
_EXTERNAL_AMS = 255
# BamBuddy's text for the printer's reason 6, "already drying"
# (drying_preflight.DRY_SF_REASON_MESSAGES, 1.2.5.7).
_ALREADY_DRYING = "AMS is already drying"
# ... and for its reason 0, "printer busy".
_PRINTER_BUSY = "Printer is busy"

# The firmware refuses to extrude below this nozzle temperature.
MIN_EXTRUDE_TEMPERATURE = 170
# <printer>_ams<unit>_slot_<n>, or <printer>_external_spool[_2].
_SLOT_IN_UNIQUE_ID = re.compile(r"p([^_]+)_(?:ams([^_]+)_slot_(\d+)|external_spool(_2)?)")


def _distance(limit: float) -> vol.All:
    return vol.All(vol.Coerce(float), vol.Range(min=-limit, max=limit))


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
    "run_diagnostic": vol.Schema(_DEVICE),
    "mark_maintenance_done": vol.Schema({**_DEVICE, vol.Required(ATTR_TASK_ID): vol.Coerce(int)}),
    "answer_hms": vol.Schema(
        {**_DEVICE, vol.Required(ATTR_CODE): cv.string, vol.Required(ATTR_ACTION): vol.All(cv.string, vol.Upper)}
    ),
    "skip_objects": vol.Schema(
        {**_DEVICE, vol.Required(ATTR_OBJECTS): vol.All(cv.ensure_list, [vol.Coerce(int)], vol.Length(min=1))}
    ),
    "set_filament": vol.Schema(
        {
            vol.Required(ATTR_ENTITY_ID): cv.entity_id,
            vol.Optional(ATTR_MATERIAL): vol.In(list(MATERIALS)),
            vol.Optional(ATTR_COLOR): vol.All(vol.Coerce(tuple), vol.ExactSequence((cv.byte, cv.byte, cv.byte))),
            # The printer's K calibration by its index; -1 its default K.
            vol.Optional(ATTR_K_PROFILE): vol.All(vol.Coerce(int), vol.Range(min=-1)),
        }
    ),
    "get_k_profiles": vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id}),
    "reset_slot": vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id}),
    "refresh_rfid": vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id}),
}


def _coordinators(hass: HomeAssistant) -> Iterator[BamBuddyPrinterCoordinator]:
    """The printers of every loaded entry."""
    for entry in hass.config_entries.async_loaded_entries(DOMAIN):
        yield from entry.runtime_data.printers.values()


def _controllable(coordinator: BamBuddyPrinterCoordinator) -> BamBuddyPrinterCoordinator:
    if not coordinator.config_entry.runtime_data.can_control:
        raise _refuse("control_not_permitted")
    return coordinator


def _printer(hass: HomeAssistant, device_id: str, *, control: bool = True) -> BamBuddyPrinterCoordinator:
    """The printer of a printer device; `control`: the action commands it."""
    device = dr.async_get(hass).async_get(device_id)
    if device is not None:
        for coordinator in _coordinators(hass):
            if coordinator.identifier in device.identifiers:
                return _controllable(coordinator) if control else coordinator
    _refuse_not_listed(hass, device_id)
    raise _refuse("not_a_printer")


def _refuse_not_listed(hass: HomeAssistant, device_id: str) -> None:
    """A printer its entry keeps but BamBuddy does not list now, or one of
    its AMS units: its repair issue says what to do."""
    devices = dr.async_get(hass)
    device = devices.async_get(device_id)
    if device is None:
        return
    # An AMS unit: its printer (a child device of 2026.9 is none of ours).
    printer = devices.async_get(device.via_device_id) if isinstance(device, dr.DeviceEntry) and device.via_device_id else None
    identifiers = device.identifiers | (printer.identifiers if printer else set())
    for entry in hass.config_entries.async_loaded_entries(DOMAIN):
        for key, stored in _waiting(entry).items():
            if printer_identifier(entry.entry_id, key) in identifiers:
                raise _refuse("printer_not_listed", printer=stored[CONF_PRINTER_NAME])


def _waiting(entry: BamBuddyConfigEntry) -> dict[str, dict[str, Any]]:
    """The entry's printers BamBuddy does not list now, by their keys."""
    served = {coordinator.key for coordinator in entry.runtime_data.printers.values()}
    stored: list[dict[str, Any]] = entry.options.get(CONF_PRINTERS, [])
    return {stored_key(printer): printer for printer in stored if stored_key(printer) not in served}


def _ams(hass: HomeAssistant, device_id: str) -> tuple[BamBuddyPrinterCoordinator, int]:
    """The printer and the unit id of an AMS unit's device."""
    device = dr.async_get(hass).async_get(device_id)
    if device is not None:
        for coordinator in _coordinators(hass):
            for unit in coordinator.data.ams_units:
                if coordinator.ams_identifier(ams_key(unit)) in device.identifiers:
                    return _controllable(coordinator), int(unit.get("id", 0))
    _refuse_not_listed(hass, device_id)
    if device is not None:
        for coordinator in _coordinators(hass):
            # A unit the printer does not report now (unplugged): its device stays.
            prefix = coordinator.ams_identifier("")[1]
            if any(domain == DOMAIN and name.startswith(prefix) for domain, name in device.identifiers):
                raise _refuse("ams_not_reported", printer=short_name(coordinator.info))
    raise _refuse("not_an_ams")


def _place(hass: HomeAssistant, entity_id: str, *, control: bool = True) -> tuple[BamBuddyPrinterCoordinator, int, int, int]:
    """Where a slot or external spool sensor's filament sits, from its
    unique ID -- the sensor is unavailable while the printer is offline, and
    the command then says so: the printer, BamBuddy's AMS id and slot in it
    (the external spools: AMS 255, 0 left or the only one, 1 right), and
    BamBuddy's global tray id."""
    entity = er.async_get(hass).async_get(entity_id)
    if entity is not None and entity.platform == DOMAIN:
        for coordinator in _coordinators(hass):
            entry_id = coordinator.config_entry.entry_id
            match = _SLOT_IN_UNIQUE_ID.fullmatch(entity.unique_id.removeprefix(f"{entry_id}_"))
            if entity.config_entry_id != entry_id or match is None or match.group(1) != coordinator.key:
                continue
            _, ams, slot, right = match.groups()
            printer = _controllable(coordinator) if control else coordinator
            if ams is not None:
                unit, index = _unit_place(coordinator, ams), int(slot) - 1
                return printer, unit, index, tray_id(unit, index)
            return printer, _EXTERNAL_AMS, 1 if right else 0, EXTERNAL_RIGHT if right else EXTERNAL_LEFT
        # A slot of a printer BamBuddy does not list now: its repair says why.
        for entry in hass.config_entries.async_loaded_entries(DOMAIN):
            match = _SLOT_IN_UNIQUE_ID.fullmatch(entity.unique_id.removeprefix(f"{entry.entry_id}_"))
            waiting = _waiting(entry) if entity.config_entry_id == entry.entry_id and match else {}
            if match and match.group(1) in waiting:
                raise _refuse("printer_not_listed", printer=waiting[match.group(1)][CONF_PRINTER_NAME])
    raise _refuse("not_a_slot")


def _unit_place(coordinator: BamBuddyPrinterCoordinator, key: str) -> int:
    """Where an AMS unit is plugged in now (BamBuddy's AMS id). A unit the
    printer does not report: with the printer online, the action says so;
    offline, the command says that first."""
    for unit in coordinator.data.ams_units:
        if ams_key(unit) == key:
            return int(unit.get("id", 0))
    if coordinator.data.connected:
        raise _refuse("ams_not_reported", printer=short_name(coordinator.info))
    return int(key) if key.isdigit() else 0


def _slot(hass: HomeAssistant, entity_id: str) -> tuple[BamBuddyPrinterCoordinator, int]:
    """The printer and BamBuddy's tray id of a slot that holds filament."""
    coordinator, _, _, tray = _place(hass, entity_id)
    found = find_tray(coordinator.data, tray)
    if coordinator.data.connected and (found is None or tray_empty(found[0])):
        raise _refuse("slot_empty")
    return coordinator, tray


async def _move_axis(hass: HomeAssistant, call: ServiceCall) -> None:
    if call.data[ATTR_DISTANCE] == 0:
        raise _refuse("zero_distance")
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
    if call.data[ATTR_DISTANCE] == 0:
        raise _refuse("zero_distance")
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
    # The Filament Track Switch binds every AMS to a switch inlet: a load must
    # name its nozzle, or the firmware drops it (BamBuddy's ams_load_filament).
    # The external spools name their side.
    switch = coordinator.data.status.get("fila_switch")
    if tray < EXTERNAL_LEFT and isinstance(switch, dict) and switch.get("installed"):
        raise _refuse("load_track_switch", printer=short_name(coordinator.info))
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
    if not {ATTR_MATERIAL, ATTR_COLOR, ATTR_K_PROFILE} & set(call.data):
        raise _refuse("nothing_to_set")
    coordinator, ams, slot, tray = _place(hass, call.data[ATTR_ENTITY_ID])
    data = coordinator.data
    found = find_tray(data, tray)
    current = found[0] if found else {}
    _online(coordinator)
    if ams != _EXTERNAL_AMS and (found is None or current.get("exists") is False):
        raise _refuse("slot_empty")
    if has_rfid(current):
        raise _refuse("rfid_spool")
    if data.changing_filament:
        raise _refuse("filament_change", printer=short_name(coordinator.info))
    # A paused print may relabel the spool swapped in by hand.
    if data.job_running and data.state != "PAUSE" and _in_use(data, ams, slot, tray):
        raise _refuse("slot_in_use", printer=short_name(coordinator.info))
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
    if color:
        # Home Assistant's colour picker has no transparency: opaque.
        hex_color = "{:02X}{:02X}{:02X}FF".format(*color)
    else:
        # The slot's own, a translucent filament's transparency kept; a slot
        # BamBuddy reset is fully transparent black -- the new one is not.
        kept = str(current.get("tray_color") or "FFFFFF").upper()
        hex_color = kept if len(kept) == 8 and not kept.endswith("00") else f"{kept[:6]}FF"
    k_profile: dict[str, Any] = {}
    chosen = call.data.get(ATTR_K_PROFILE)
    if chosen is not None:
        cali_idx = chosen
        if chosen >= 0:
            # The printer's own calibration: BamBuddy files the slot under its filament.
            profiles = (await _k_profiles(coordinator, ams, slot, listed_lately=True))[1]
            if not profiles:
                raise _refuse("k_profiles_no_answer", printer=short_name(coordinator.info))
            found_profile = next((item for item in profiles if item["index"] == chosen), None)
            if found_profile is None:
                raise _refuse("k_profile_unknown", printer=short_name(coordinator.info))
            k_profile = {
                "kprofile_filament_id": found_profile["filament_id"] or None,
                "kprofile_setting_id": found_profile["setting_id"],
                "k_value": found_profile["k_value"],
            }
    await async_run_command(
        coordinator,
        partial(
            coordinator.client.configure_slot,
            coordinator.printer_id,
            ams,
            slot,
            tray_type=tray_type,
            name=name,
            color=hex_color,
            temp_min=temp_min,
            temp_max=temp_max,
            tray_info_idx=profile,
            cali_idx=cali_idx,
            nozzle_diameter=_nozzle_diameter(data, ams, slot),
            **k_profile,
        ),
    )


async def _k_profiles(
    coordinator: BamBuddyPrinterCoordinator, ams: int, slot: int, *, listed_lately: bool = False
) -> tuple[str, list[dict[str, Any]]]:
    """The printer's K calibrations for the nozzle that feeds the slot --
    on a two-nozzle printer that nozzle's, where the printer files them per
    nozzle -- as BamBuddy's own Configure dialog offers them. `listed_lately`:
    the list read for the card a moment ago will do (a printer may not
    answer the same question twice in a row)."""
    data = coordinator.data
    diameter = _nozzle_diameter(data, ams, slot)
    now = coordinator.hass.loop.time()
    kept = coordinator.kprofiles.get(diameter)
    if listed_lately and kept is not None and now - kept[0] < K_PROFILES_KEEP:
        listed = kept[1]
    else:
        listed = await async_run_command(
            coordinator, partial(coordinator.client.get_kprofiles, coordinator.printer_id, diameter), refresh=False
        )
        if listed:
            coordinator.kprofiles[diameter] = (now, listed)
    nozzle = _extruder(data, ams, slot)
    if nozzle is not None and any(item.get("extruder_id") == nozzle for item in listed):
        listed = [item for item in listed if item.get("extruder_id") == nozzle]
    profiles = []
    for item in listed:
        index = item.get("slot_id")
        if not isinstance(index, int):
            continue
        try:
            k_value = float(item.get("k_value") or 0)
        except (TypeError, ValueError):
            k_value = 0.0
        profiles.append(
            {
                "index": index,
                "name": str(item.get("name") or ""),
                "k_value": k_value,
                "filament_id": str(item.get("filament_id") or ""),
                "setting_id": item.get("setting_id") if isinstance(item.get("setting_id"), str) else None,
                "nozzle": ("right", "left")[nozzle] if data.is_dual_nozzle and nozzle in (0, 1) else None,
            }
        )
    return diameter, profiles


async def _get_k_profiles(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    """A read: Read Status is enough."""
    coordinator, ams, slot, tray = _place(hass, call.data[ATTR_ENTITY_ID], control=False)
    diameter, profiles = await _k_profiles(coordinator, ams, slot)
    found = find_tray(coordinator.data, tray)
    current = found[0].get("cali_idx") if found else None
    return {
        # A number, as the nozzle diameter sensor's.
        "nozzle_diameter": float(diameter) if diameter.replace(".", "", 1).isdigit() else diameter,
        "current": current if isinstance(current, int) else -1,
        "profiles": [{key: value for key, value in item.items() if key != "setting_id"} for item in profiles],
    }


async def _reset_slot(hass: HomeAssistant, call: ServiceCall) -> None:
    """The slot's material and colour cleared, as Reset on the printer's
    screen -- not during a print (a paused one may have had a spool swapped)."""
    coordinator, ams, slot, tray = _place(hass, call.data[ATTR_ENTITY_ID])
    data = coordinator.data
    found = find_tray(data, tray)
    if data.connected and ams != _EXTERNAL_AMS and (found is None or tray_empty(found[0])):
        raise _refuse("slot_empty")
    _pause_first(coordinator)
    await async_run_command(coordinator, partial(coordinator.client.reset_slot, coordinator.printer_id, ams, slot))


async def _refresh_rfid(hass: HomeAssistant, call: ServiceCall) -> None:
    """The AMS reads the spool's chip again: BamBuddy refuses while any
    filament is loaded, and the external spools have no reader."""
    coordinator, ams, slot, tray = _place(hass, call.data[ATTR_ENTITY_ID])
    if ams == _EXTERNAL_AMS:
        raise _refuse("rfid_not_external")
    data = coordinator.data
    # A print or a filament change is the reason first; then the slot.
    _pause_first(coordinator)
    if data.connected:
        found = find_tray(data, tray)
        if found is None or found[0].get("exists") is False:
            raise _refuse("slot_empty")
        if active_tray(data) is not None:
            raise _refuse("rfid_unload_first", printer=short_name(coordinator.info))
    await async_run_command(coordinator, partial(coordinator.client.refresh_rfid, coordinator.printer_id, ams, slot))


def _online(coordinator: BamBuddyPrinterCoordinator) -> None:
    """Offline the printer's figures are stale: that is the reason to name."""
    if not coordinator.data.connected:
        raise _refuse("printer_offline", printer=short_name(coordinator.info))


def _pause_first(coordinator: BamBuddyPrinterCoordinator) -> None:
    """A slot's tools wait for a running print and a filament change; a
    paused print allows them (a spool swapped by hand)."""
    data = coordinator.data
    if not data.connected:
        return
    if data.changing_filament:
        raise _refuse("filament_change", printer=short_name(coordinator.info))
    if data.job_running and data.state != "PAUSE":
        raise _refuse("slot_pause_first", printer=short_name(coordinator.info))


def _in_use(data: PrinterData, ams: int, slot: int, tray: int) -> bool:
    """The slot feeds a nozzle: BamBuddy's tray_now names one, its
    extruder_slots each nozzle's on two-nozzle printers -- in the printer's
    own ids there, the external spools 254 (left) and 255 (right)."""
    if active_tray(data) == tray:
        return True
    fed = [item for item in (data.status.get("extruder_slots") or {}).values() if item.get("has_filament")]
    if ams == _EXTERNAL_AMS:
        return any(item.get("ams_id") == tray for item in fed)
    return any((item.get("ams_id"), item.get("slot_id")) == (ams, slot) for item in fed)


def _extruder(data: PrinterData, ams: int, slot: int) -> int | None:
    """The nozzle a slot feeds: 0 the right or only nozzle, 1 the left; an
    AMS unit's from its ams_extruder_map, the left external spool the left
    nozzle. None: a unit BamBuddy leaves out of the map -- one on the
    filament track switch reaches both nozzles."""
    if not data.is_dual_nozzle:
        return 0
    if ams == _EXTERNAL_AMS:
        return 1 if slot == 0 else 0
    fed = (data.status.get("ams_extruder_map") or {}).get(str(ams))
    return None if fed is None else int(fed)


def _nozzle_diameter(data: PrinterData, ams: int, slot: int) -> str:
    """The diameter of the nozzle the slot feeds -- the printer keeps a K
    value per diameter; a unit on both nozzles takes the first's (both are
    alike as a rule)."""
    extruder = _extruder(data, ams, slot) or 0
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
    data = coordinator.data
    found = _unit(data, unit)
    model = ams_model(found, data)
    if not can_dry(found, data):
        if model not in DRYING_MAX:
            raise _refuse("cannot_dry")
        if data.status.get("drying_screen_only") or data.dries_on_screen_only():
            raise _refuse("dry_on_screen", printer=short_name(coordinator.info))
        raise _refuse("dry_firmware", printer=short_name(coordinator.info))
    _online(coordinator)
    # Past the guard the unit has a heater: its model is in the table.
    maximum = DRYING_MAX[model]
    # What BamBuddy would refuse, said before it is sent.
    if is_drying(found):
        raise _refuse("already_drying")
    if data.changing_filament:
        raise _refuse("filament_change", printer=short_name(coordinator.info))
    if call.data[ATTR_TEMPERATURE] > maximum:
        raise _refuse("drying_too_hot", model=model, maximum=str(maximum))

    async def start() -> None:
        try:
            await coordinator.client.start_drying(coordinator.printer_id, unit, call.data[ATTR_TEMPERATURE], call.data[ATTR_DURATION])
        except BamBuddyApiError as err:
            # A countdown that stands still may still count as drying for the
            # printer: the way out is a stop. BamBuddy's other reasons
            # (power, the filament at the outlet) say what to do themselves.
            if err.status == 409 and found.get("dry_countdown_stalled") and err.detail == _ALREADY_DRYING:
                raise _refuse("drying_parked") from err
            # Busy with a job: a firmware that cannot dry while it prints.
            if err.status == 409 and err.detail == _PRINTER_BUSY and coordinator.data.job_running:
                raise _refuse("dry_while_printing", printer=short_name(coordinator.info)) from err
            raise

    await async_run_command(coordinator, start)


def _unit(data: PrinterData, unit: int) -> dict[str, Any]:
    """BamBuddy's report of the unit at this place."""
    return next((item for item in data.ams_units if int(item.get("id", 0)) == unit), {})


async def _stop_drying(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator, unit = _ams(hass, call.data[ATTR_DEVICE_ID])
    data = coordinator.data
    found = _unit(data, unit)
    if not has_heater(found, data):
        raise _refuse("cannot_dry")
    _online(coordinator)
    # Nothing to stop (BamBuddy answers yes and does nothing); a parked
    # countdown may be stopped.
    if not drying_minutes(found):
        raise _refuse("not_drying")
    # Started on its own screen, it stops there too (BamBuddy refuses it).
    if data.status.get("drying_screen_only"):
        raise _refuse("dry_stop_on_screen", printer=short_name(coordinator.info))
    await async_run_command(coordinator, partial(coordinator.client.stop_drying, coordinator.printer_id, unit))


async def _get_print_objects(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    """A read: Read Status is enough."""
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID], control=False)
    answer = await async_run_command(
        coordinator,
        partial(coordinator.client.get_print_objects, coordinator.printer_id),
        allowed=lambda data: data.state in PRINTING_STATES,
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


async def _run_diagnostic(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    """BamBuddy's connection check: a read (Read Status is enough), also
    for an offline printer -- that is when it helps."""
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID], control=False)
    answer = await async_run_command(
        coordinator, partial(coordinator.client.get_diagnostic, coordinator.printer_id), offline_ok=True, refresh=False
    )
    return {
        "overall": answer.get("overall"),
        "checks": [
            {"id": check.get("id"), "status": check.get("status"), "params": check.get("params") or {}}
            for check in answer.get("checks") or []
            if isinstance(check, dict)
        ],
    }


async def _mark_maintenance_done(hass: HomeAssistant, call: ServiceCall) -> None:
    """A task of the printer done: BamBuddy's count starts over. Needs the
    key's Manage Maintenance; BamBuddy keeps it, the printer may be off."""
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID], control=False)
    if not coordinator.config_entry.runtime_data.can_manage_maintenance:
        raise _refuse("maintenance_not_permitted")
    task = call.data[ATTR_TASK_ID]
    # Any task BamBuddy listed, a disabled one too; before the first read the
    # task goes as given (BamBuddy marks the task of that ID, whichever
    # printer's).
    listed = coordinator.data.maintenance
    if listed is not None and task not in {item.get("id") for item in listed.get("maintenance_items") or [] if isinstance(item, dict)}:
        raise _refuse("maintenance_task_unknown", printer=short_name(coordinator.info))
    try:
        await async_run_command(
            coordinator, partial(coordinator.client.perform_maintenance, task), offline_ok=True, denied="maintenance_not_permitted"
        )
    finally:
        # Also after no answer: BamBuddy may have marked it done.
        await coordinator.async_reread_maintenance()


async def _skip_objects(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID])
    await async_run_command(
        coordinator,
        partial(coordinator.client.skip_objects, coordinator.printer_id, call.data[ATTR_OBJECTS]),
        allowed=lambda data: data.state in PRINTING_STATES,
        refusal="not_printing",
    )


async def _answer_hms(hass: HomeAssistant, call: ServiceCall) -> None:
    """Answers one of the printer's HMS messages as its screen would: only
    with an answer the printer offers for it now."""
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID])
    wanted = call.data[ATTR_CODE].replace("_", "").replace("-", "").upper().removeprefix("0X")
    action = call.data[ATTR_ACTION]
    if action == "STOP_PRINTING":
        # The printer's word now: a message cleared at it meanwhile stops nothing.
        await coordinator.async_refresh()
    _online(coordinator)
    error = next((error for error in coordinator.data.status.get("hms_errors") or [] if hms_code(error) == wanted), None)
    if error is None:
        raise _refuse("hms_not_current", code=call.data[ATTR_CODE])
    if action not in hms_answers(error):
        # Offered, but one of the answers that only steer Bambu's own screen.
        offered = error.get("actions")
        if isinstance(offered, list) and action in offered:
            raise _refuse("hms_answer_screen_only")
        raise _refuse("hms_answer_not_offered", code=call.data[ATTR_CODE])
    job = error.get("job_id")

    async def answer() -> None:
        try:
            await coordinator.client.execute_hms_action(coordinator.printer_id, hms_code(error), action, str(job) if job else None)
        except BamBuddyApiError as err:
            if err.status in (400, 502):
                # BamBuddy could not hand it to the printer, or the printer
                # did not acknowledge it.
                raise _refuse("hms_answer_not_taken", printer=short_name(coordinator.info)) from err
            raise

    await async_run_command(coordinator, answer)


_HANDLERS: dict[str, Callable[[HomeAssistant, ServiceCall], Coroutine[Any, Any, ServiceResponse]]] = {
    "move_axis": _move_axis,
    "home_axes": _home_axes,
    "extrude": _extrude,
    "load_filament": _load_filament,
    "unload_filament": _unload_filament,
    "start_drying": _start_drying,
    "stop_drying": _stop_drying,
    "skip_objects": _skip_objects,
    "set_filament": _set_filament,
    "get_print_objects": _get_print_objects,
    "run_diagnostic": _run_diagnostic,
    "mark_maintenance_done": _mark_maintenance_done,
    "answer_hms": _answer_hms,
    "get_k_profiles": _get_k_profiles,
    "reset_slot": _reset_slot,
    "refresh_rfid": _refresh_rfid,
}
# The actions that answer (and only answer).
_RESPONSES = {"get_print_objects", "run_diagnostic", "get_k_profiles"}


@callback
def async_setup_services(hass: HomeAssistant) -> None:
    """Register the actions once, for every entry."""
    for name, handler in _HANDLERS.items():
        hass.services.async_register(
            DOMAIN,
            name,
            partial(handler, hass),
            # Home Assistant 2026.10 types schemas as probatio schemas;
            # voluptuous works the same from 2025.5 on.
            schema=SCHEMAS[name],  # type: ignore[arg-type]
            supports_response=SupportsResponse.ONLY if name in _RESPONSES else SupportsResponse.NONE,
        )
