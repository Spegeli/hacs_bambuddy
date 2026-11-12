"""The integration's actions: what is no entity -- moving the axes, homing,
extruding, loading and unloading filament, setting a slot's filament and K
profile (and listing the filaments and K profiles to choose from), resetting
a slot, reading its chip again, assigning a spool of BamBuddy's inventory to
a slot (and listing its spools), drying an AMS unit, skipping objects,
answering HMS messages, checking the connection, marking maintenance done.
The dashboard card calls them too."""
from __future__ import annotations

from collections.abc import Callable, Coroutine, Iterator
import contextlib
from dataclasses import dataclass
from functools import partial
import re
import time
from typing import Any, Literal

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse, callback
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from . import filaments
from .api import (
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyConnectionError,
    BamBuddyError,
    BamBuddyNotFoundError,
    BamBuddyPermissionError,
)
from .const import CONF_PRINTER_NAME, CONF_PRINTERS, DOMAIN, K_PROFILES_KEEP, K_PROFILES_NO_ANSWER
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator, printer_identifier
from .entity import async_run_command, command_error, connection_error, refuse
from .filament_types import printer_filament_type
from .inventory import BamBuddyInventoryCoordinator, InventoryData, Placed, Spool, external_counts, place_json, spool_fit
from .models import (
    AMS_HT_FIRST_ID,
    DRYING_MAX,
    EXTERNAL_AMS,
    EXTERNAL_LEFT,
    EXTERNAL_RIGHT,
    JOB_STATES,
    PRINTING_STATES,
    PrinterData,
    active_tray,
    ams_key,
    ams_model,
    can_dry,
    drying_filament,
    drying_minutes,
    find_tray,
    has_heater,
    has_rfid,
    hms_answers,
    hms_code,
    input_global_id,
    input_tray,
    is_drying,
    model_key,
    nozzle_side,
    part_id,
    spool_present,
    stored_key,
    studio_ams_type,
    tray_empty,
    tray_id,
    tray_label,
    unit_extruder,
)

ATTR_DEVICE_ID = "device_id"
ATTR_ENTITY_ID = "entity_id"
ATTR_AXIS = "axis"
ATTR_DISTANCE = "distance"
ATTR_TEMPERATURE = "temperature"
ATTR_DURATION = "duration"
ATTR_OBJECTS = "objects"
ATTR_FILAMENT = "filament"
ATTR_COLOR = "color"
ATTR_TASK_ID = "task_id"
ATTR_CODE = "code"
ATTR_K_PROFILE = "k_profile"
ATTR_ACTION = "action"
ATTR_SPOOL_ID = "spool_id"
# BamBuddy's text for the printer's reason 6, "already drying"
# (drying_preflight.DRY_SF_REASON_MESSAGES, 1.2.5.7).
_ALREADY_DRYING = "AMS is already drying"
# ... and for its reason 0, "printer busy".
_PRINTER_BUSY = "Printer is busy"

# The firmware refuses to extrude below this nozzle temperature.
MIN_EXTRUDE_TEMPERATURE = 170
# p<printer key>_ams<AMS key>_slot_<n>, p<printer key>_external_spool[_2], or an
# H3C's input p<printer key>_external_<tool>.
_SLOT_IN_UNIQUE_ID = re.compile(r"p([^_]+)_(?:ams([^_]+)_slot_(\d+)|external_spool(_2)?|external_(\d))")


def _distance(limit: float) -> vol.All:
    return vol.All(vol.Coerce(float), vol.Range(min=-limit, max=limit))


def _whole(value: Any) -> int:
    """A whole number, as 2, 2.0 or "2": `vol.Coerce(int)` cuts 2.5 down to 2,
    which names another spool, task or profile."""
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            pass
    raise vol.Invalid("expected a whole number")


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
    "mark_maintenance_done": vol.Schema({**_DEVICE, vol.Required(ATTR_TASK_ID): vol.All(_whole, vol.Range(min=1, max=1_000_000))}),
    "answer_hms": vol.Schema(
        {**_DEVICE, vol.Required(ATTR_CODE): cv.string, vol.Required(ATTR_ACTION): vol.All(cv.string, vol.Upper)}
    ),
    "skip_objects": vol.Schema(
        {**_DEVICE, vol.Required(ATTR_OBJECTS): vol.All(cv.ensure_list, [_whole], vol.Length(min=1))}
    ),
    "set_filament": vol.Schema(
        {
            vol.Required(ATTR_ENTITY_ID): cv.entity_id,
            # A Bambu Studio profile by its id; empty reads as none.
            vol.Optional(ATTR_FILAMENT): cv.string,
            vol.Optional(ATTR_COLOR): vol.All(vol.Coerce(tuple), vol.ExactSequence((cv.byte, cv.byte, cv.byte))),
            # The printer's K calibration by its index; -1 its default K.
            vol.Optional(ATTR_K_PROFILE): vol.All(_whole, vol.Range(min=-1)),
        }
    ),
    "get_k_profiles": vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id}),
    "get_filaments": vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id}),
    "reset_slot": vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id}),
    "refresh_rfid": vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id}),
    "assign_spool": vol.Schema(
        {vol.Required(ATTR_ENTITY_ID): cv.entity_id, vol.Required(ATTR_SPOOL_ID): vol.All(_whole, vol.Range(min=1))}
    ),
    "unassign_spool": vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id}),
    "get_spools": vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id}),
}


def _coordinators(hass: HomeAssistant) -> Iterator[BamBuddyPrinterCoordinator]:
    """The printers of every loaded entry."""
    for entry in hass.config_entries.async_loaded_entries(DOMAIN):
        yield from entry.runtime_data.printers.values()


def _printer(hass: HomeAssistant, device_id: str) -> BamBuddyPrinterCoordinator:
    """The printer of a printer device."""
    device = dr.async_get(hass).async_get(device_id)
    if device is not None:
        for coordinator in _coordinators(hass):
            if coordinator.identifier in device.identifiers:
                return coordinator
    _refuse_not_listed(hass, device_id)
    raise refuse("not_a_printer")


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
        for key, stored in _unlisted(entry).items():
            if printer_identifier(entry.entry_id, key) in identifiers:
                raise refuse("printer_not_listed", printer=stored[CONF_PRINTER_NAME])


def _unlisted(entry: BamBuddyConfigEntry) -> dict[str, dict[str, Any]]:
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
                    return coordinator, part_id(unit)
    _refuse_not_listed(hass, device_id)
    if device is not None:
        for coordinator in _coordinators(hass):
            # A unit the printer does not report now (unplugged): its device stays.
            prefix = coordinator.ams_identifier_prefix()
            if any(domain == DOMAIN and name.startswith(prefix) for domain, name in device.identifiers):
                raise refuse("ams_not_reported", printer=coordinator.short_name)
    raise refuse("not_an_ams")


def _place(hass: HomeAssistant, entity_id: str) -> tuple[BamBuddyPrinterCoordinator, int, int, int]:
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
            _, ams, slot, right, tool = match.groups()
            if ams is not None:
                unit, index = _unit_place(coordinator, ams), int(slot) - 1
                return coordinator, part_id(unit), index, tray_id(unit, index)
            if tool is not None:
                return coordinator, EXTERNAL_AMS, input_tray(int(tool)), 256 - int(tool)
            return coordinator, EXTERNAL_AMS, 1 if right else 0, EXTERNAL_RIGHT if right else EXTERNAL_LEFT
        # A slot of a printer BamBuddy does not list now: its repair says why.
        for entry in hass.config_entries.async_loaded_entries(DOMAIN):
            match = _SLOT_IN_UNIQUE_ID.fullmatch(entity.unique_id.removeprefix(f"{entry.entry_id}_"))
            waiting = _unlisted(entry) if entity.config_entry_id == entry.entry_id and match else {}
            if match and match.group(1) in waiting:
                raise refuse("printer_not_listed", printer=waiting[match.group(1)][CONF_PRINTER_NAME])
    raise refuse("not_a_slot")


def _unit_place(coordinator: BamBuddyPrinterCoordinator, key: str) -> dict[str, Any]:
    """The AMS unit as the printer reports it now (its id is where it is
    plugged in). A unit the printer does not report: with the printer
    online, the action says so; offline, the command says that first."""
    for unit in coordinator.data.ams_units:
        if ams_key(unit) == key:
            return unit
    if coordinator.data.connected:
        raise refuse("ams_not_reported", printer=coordinator.short_name)
    return {"id": int(key) if key.isdigit() else 0}


def _filled_slot(hass: HomeAssistant, entity_id: str) -> tuple[BamBuddyPrinterCoordinator, int]:
    """The printer and BamBuddy's tray id of a slot that holds filament."""
    coordinator, _, _, tray = _place(hass, entity_id)
    found = find_tray(coordinator.data, tray)
    if coordinator.data.connected and (found is None or tray_empty(found[0])):
        raise refuse("slot_empty")
    return coordinator, tray


async def _move_axis(hass: HomeAssistant, call: ServiceCall) -> None:
    if call.data[ATTR_DISTANCE] == 0:
        raise refuse("zero_distance")
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
        raise refuse("zero_distance")
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID])
    data = coordinator.data
    # Offline, a job or a filament change: the general refusal says why.
    if data.connected and not data.job_running and not data.changing_filament:
        temperature = _active_nozzle_temperature(coordinator)
        if temperature < MIN_EXTRUDE_TEMPERATURE:
            raise refuse("nozzle_too_cold", temperature=f"{temperature:.0f}", minimum=str(MIN_EXTRUDE_TEMPERATURE))
    await async_run_command(
        coordinator,
        partial(coordinator.client.jog_extruder, coordinator.printer_id, call.data[ATTR_DISTANCE]),
        idle_only=True,
    )


async def _load_filament(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator, tray = _filled_slot(hass, call.data[ATTR_ENTITY_ID])
    # The Filament Track Switch binds every AMS to a switch inlet: a load must
    # name its nozzle, or the firmware drops it (BamBuddy's ams_load_filament).
    # The external spools name their side.
    switch = coordinator.data.status.get("fila_switch")
    if tray < EXTERNAL_LEFT and isinstance(switch, dict) and switch.get("installed"):
        raise refuse("load_track_switch", printer=coordinator.short_name)

    async def load() -> None:
        try:
            await coordinator.client.load_filament(coordinator.printer_id, tray)
        except BamBuddyApiError as err:
            # BamBuddy 1.3.0 loads from an AMS HT (the tray is the unit's id);
            # 1.2.5.7 refuses it with a 400 before it asks the printer
            # ("tray_id must be 0..15"); another 400 (the printer gone between
            # our read and the call) is not that. Nothing tells them apart before.
            if err.status == 400 and AMS_HT_FIRST_ID <= tray < EXTERNAL_LEFT and "tray_id" in (err.detail or ""):
                raise refuse("ams_ht_load") from err
            raise

    await async_run_command(coordinator, load, idle_only=True, paused_ok=True)


async def _unload_filament(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID])
    await async_run_command(
        coordinator,
        partial(coordinator.client.unload_filament, coordinator.printer_id),
        idle_only=True,
        paused_ok=True,
    )


async def _set_filament(hass: HomeAssistant, call: ServiceCall) -> None:
    """A slot's filament and colour, for spools without a chip: what the
    printer's screen asks after a spool goes in. A new colour alone keeps
    the slot's profile and its K value; a new filament (a Bambu Studio
    profile) takes its profile as Bambu Studio sends it and the default K
    value, as on the printer's screen."""
    filament_id = call.data.get(ATTR_FILAMENT) or None
    if filament_id is None and not {ATTR_COLOR, ATTR_K_PROFILE} & set(call.data):
        raise refuse("nothing_to_set")
    coordinator, ams, slot, tray = _place(hass, call.data[ATTR_ENTITY_ID])
    data = coordinator.data
    found = find_tray(data, tray)
    current = found[0] if found else {}
    _online(coordinator)
    if ams != EXTERNAL_AMS and (found is None or not spool_present(current)):
        raise refuse("slot_empty")
    if has_rfid(current):
        raise refuse("rfid_spool")
    if data.changing_filament:
        raise refuse("filament_change", printer=coordinator.short_name)
    # The slot a running print feeds is set too, as in BamBuddy: the card warns it changes mid-print.
    if filament_id is not None:
        filament = _new_filament(coordinator, ams, slot, filament_id)
    else:
        filament = _kept_filament(current)
    hex_color = _slot_color(current, call.data.get(ATTR_COLOR))
    cali_idx = filament.cali_idx
    k_profile: dict[str, Any] = {}
    chosen = call.data.get(ATTR_K_PROFILE)
    if chosen is not None:
        cali_idx = chosen
        if chosen >= 0:
            k_profile = await _chosen_k_profile(coordinator, ams, slot, chosen)
    await async_run_command(
        coordinator,
        partial(
            coordinator.client.configure_slot,
            coordinator.printer_id,
            ams,
            slot,
            tray_type=filament.tray_type,
            name=filament.name,
            color=hex_color,
            temp_min=filament.temp_min,
            temp_max=filament.temp_max,
            tray_info_idx=filament.profile,
            setting_id=filament.setting_id,
            cali_idx=cali_idx,
            nozzle_diameter=_nozzle_diameter(data, ams, slot),
            **k_profile,
        ),
    )


@dataclass(frozen=True)
class _Filament:
    """What `configure_slot` is told of a slot's filament."""

    tray_type: str
    name: str
    profile: str
    setting_id: str
    cali_idx: int
    temp_min: int
    temp_max: int


def _new_filament(coordinator: BamBuddyPrinterCoordinator, ams: int, slot: int, filament_id: str) -> _Filament:
    """A Bambu Studio profile, as Bambu Studio sends it, with the default K
    value -- or the refusal of one it would not set here."""
    why = filaments.refusal(filament_id, _filament_slot(coordinator.data, ams, slot))
    item = filaments.get(filament_id)
    if why is not None or item is None:
        raise _refused_filament(why, item.name if item else filament_id, coordinator.short_name)
    return _Filament(item.type, item.name, item.id, item.setting_id, -1, item.temp_min, item.temp_max)


def _kept_filament(current: dict[str, Any]) -> _Filament:
    """The slot's own filament: its profile goes back with the colour (with
    none, BamBuddy would take the generic of its type), and its K value."""
    tray_type = str(current.get("tray_type") or "")
    if not tray_type:
        raise refuse("material_needed")
    profile = str(current.get("tray_info_idx") or "")
    listed = filaments.get(profile)
    cali = current.get("cali_idx")
    temp_min, temp_max = _temperatures(current, tray_type, listed)
    return _Filament(
        tray_type,
        listed.name if listed else tray_label(current),
        profile,
        listed.setting_id if listed else "",
        cali if isinstance(cali, int) else -1,
        temp_min,
        temp_max,
    )


def _slot_color(current: dict[str, Any], color: Any) -> str:
    """The colour to send: the one asked for, opaque (Home Assistant's colour
    picker has no transparency); else the slot's own, a translucent
    filament's transparency kept -- a slot BamBuddy reset is fully
    transparent black, the new one is not."""
    if color:
        return "{:02X}{:02X}{:02X}FF".format(*color)
    kept = str(current.get("tray_color") or "FFFFFF").upper()
    return kept if len(kept) == 8 and not kept.endswith("00") else f"{kept[:6]}FF"


async def _chosen_k_profile(coordinator: BamBuddyPrinterCoordinator, ams: int, slot: int, chosen: int) -> dict[str, Any]:
    """The printer's own calibration `chosen`: BamBuddy files the slot under
    its filament."""
    _, profiles, answered = await _k_profiles(coordinator, ams, slot, listed_lately=True)
    # None listed: it has none (unknown), or it did not answer (ask again).
    if not profiles and not answered:
        raise refuse("k_profiles_no_answer", printer=coordinator.short_name)
    found = next((item for item in profiles if item["index"] == chosen), None)
    if found is None:
        raise refuse("k_profile_unknown", printer=coordinator.short_name)
    return {
        "kprofile_filament_id": found["filament_id"] or None,
        "kprofile_setting_id": found["setting_id"],
        "k_value": found["k_value"],
    }


# The clock the time an answer took is read by (tests set it).
_monotonic = time.monotonic


async def _k_profiles(
    coordinator: BamBuddyPrinterCoordinator, ams: int, slot: int, *, listed_lately: bool = False
) -> tuple[str, list[dict[str, Any]], bool]:
    """The printer's K calibrations for the nozzle that feeds the slot --
    on a two-nozzle printer that nozzle's, where the printer files them per
    nozzle -- as BamBuddy's own Configure dialog offers them, and whether
    the printer answered: BamBuddy 1.3 says it did not by a 504, 1.2.5.7 by
    an empty list after its retries (`K_PROFILES_NO_ANSWER`). `listed_lately`: the
    list read for the card a moment ago will do (a printer may not answer
    the same question twice in a row)."""
    data = coordinator.data
    diameter = _nozzle_diameter(data, ams, slot)
    listed, answered = await _read_k_profiles(coordinator, diameter, listed_lately)
    nozzle = _extruder(data, ams, slot)
    if nozzle is not None and any(item.get("extruder_id") == nozzle for item in listed):
        listed = [item for item in listed if item.get("extruder_id") == nozzle]
    side = nozzle_side(nozzle) if data.is_dual_nozzle and nozzle in (0, 1) else None
    profiles = [profile for item in listed if (profile := _k_profile_entry(item, side)) is not None]
    return diameter, profiles, answered


async def _read_k_profiles(
    coordinator: BamBuddyPrinterCoordinator, diameter: str, listed_lately: bool
) -> tuple[list[dict[str, Any]], bool]:
    """The printer's K profiles for the nozzle diameter, and whether it
    answered: the list read a moment ago where it will do."""
    now = coordinator.hass.loop.time()
    kept = coordinator.kprofiles.get(diameter)
    if listed_lately and kept is not None and now - kept[0] < K_PROFILES_KEEP:
        return kept[1], True
    asked = _monotonic()
    read = await async_run_command(
        coordinator, partial(coordinator.client.get_kprofiles, coordinator.printer_id, diameter), refresh=False
    )
    # Not answered: BamBuddy 1.3's 504 (None), or 1.2.5.7's empty list
    # after its retries.
    listed = read or []
    answered = read is not None and (bool(listed) or _monotonic() - asked < K_PROFILES_NO_ANSWER)
    if listed:
        coordinator.kprofiles[diameter] = (now, listed)
    return listed, answered


def _k_profile_entry(item: dict[str, Any], side: str | None) -> dict[str, Any] | None:
    """One K profile as the action gives it; none without a slot number."""
    index = item.get("slot_id")
    if not isinstance(index, int):
        return None
    try:
        k_value = float(item.get("k_value") or 0)
    except (TypeError, ValueError):
        k_value = 0.0
    return {
        "index": index,
        "name": str(item.get("name") or ""),
        "k_value": k_value,
        "filament_id": str(item.get("filament_id") or ""),
        "setting_id": item.get("setting_id") if isinstance(item.get("setting_id"), str) else None,
        "nozzle": side,
    }


async def _get_k_profiles(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    """A read: Read Status is enough."""
    coordinator, ams, slot, tray = _place(hass, call.data[ATTR_ENTITY_ID])
    diameter, profiles, answered = await _k_profiles(coordinator, ams, slot)
    found = find_tray(coordinator.data, tray)
    current = found[0].get("cali_idx") if found else None
    return {
        # A number, as the nozzle diameter sensor's.
        "nozzle_diameter": float(diameter) if diameter.replace(".", "", 1).isdigit() else diameter,
        "current": current if isinstance(current, int) else -1,
        "profiles": [{key: value for key, value in item.items() if key != "setting_id"} for item in profiles],
        # An empty list: the printer has none of its own (True) or did not answer (False).
        "answered": answered,
    }


async def _get_filaments(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    """A read of the integration's own list: the filaments Bambu Studio
    offers the slot, by vendor, and the slot's profile."""
    coordinator, ams, slot, tray = _place(hass, call.data[ATTR_ENTITY_ID])
    data = coordinator.data
    found = find_tray(data, tray)
    current = str((found[0] if found else {}).get("tray_info_idx") or "") or None
    return {
        "current": current,
        "vendors": [
            {
                "name": vendor,
                "filaments": [{"id": item.id, "name": filaments.field_name(item), "type": item.type} for item in items],
            }
            for vendor, items in filaments.offer(_filament_slot(data, ams, slot))
        ],
    }


async def _reset_slot(hass: HomeAssistant, call: ServiceCall) -> None:
    """The slot's material and colour cleared, as Reset on the printer's
    screen -- not during a print (a paused one may have had a spool swapped)."""
    coordinator, ams, slot, tray = _place(hass, call.data[ATTR_ENTITY_ID])
    data = coordinator.data
    found = find_tray(data, tray)
    if data.connected and ams != EXTERNAL_AMS and (found is None or tray_empty(found[0])):
        raise refuse("slot_empty")
    _pause_first(coordinator)
    await async_run_command(coordinator, partial(coordinator.client.reset_slot, coordinator.printer_id, ams, slot))


async def _refresh_rfid(hass: HomeAssistant, call: ServiceCall) -> None:
    """The AMS reads the spool's chip again: BamBuddy refuses while any
    filament is loaded, and the external spools have no reader."""
    coordinator, ams, slot, tray = _place(hass, call.data[ATTR_ENTITY_ID])
    if ams == EXTERNAL_AMS:
        raise refuse("rfid_not_external")
    data = coordinator.data
    # A print or a filament change is the reason first; then the slot.
    _pause_first(coordinator)
    if data.connected:
        found = find_tray(data, tray)
        if found is None or not spool_present(found[0]):
            raise refuse("slot_empty")
        if active_tray(data) is not None:
            raise refuse("rfid_unload_first", printer=coordinator.short_name)
    await async_run_command(coordinator, partial(coordinator.client.refresh_rfid, coordinator.printer_id, ams, slot))


def _inventory(coordinator: BamBuddyPrinterCoordinator, *, assigning: bool) -> tuple[BamBuddyInventoryCoordinator, InventoryData]:
    """The entry's inventory, shown -- and, to change it, a key with Manage Inventory."""
    inventory = coordinator.config_entry.runtime_data.inventory
    if assigning and not inventory.can_assign:
        raise refuse("inventory_not_allowed")
    data = inventory.data
    if data is None or not data.shown:
        raise refuse("inventory_not_shown")
    return inventory, data


def _inventory_failure(
    err: BamBuddyError, *, not_found: Literal["spool_not_found", "no_assignment"] = "spool_not_found", spool: int = 0
) -> HomeAssistantError:
    """BamBuddy's answer to an inventory write, in words: these routes need
    only optional permissions, so a refusal is no matter for the key's guard."""
    if isinstance(err, (BamBuddyAuthError, BamBuddyPermissionError)):
        return refuse("inventory_not_allowed")
    if isinstance(err, BamBuddyNotFoundError):
        return refuse("no_assignment") if not_found == "no_assignment" else refuse("spool_not_found", spool=str(spool))
    if isinstance(err, BamBuddyApiError) and err.status == 400 and "archived" in err.detail.lower():
        return refuse("spool_archived")
    if isinstance(err, BamBuddyConnectionError):
        # Timed out: a write may still have reached BamBuddy.
        return connection_error(err)
    return command_error(err)


async def _fresh_inventory(inventory: BamBuddyInventoryCoordinator) -> InventoryData:
    """The spools and their slots as BamBuddy has them now (Spoolman asked
    too); the entry's view follows."""
    try:
        fresh = await inventory.async_read_fresh()
    except (BamBuddyAuthError, BamBuddyPermissionError, BamBuddyNotFoundError) as err:
        raise refuse("inventory_not_shown") from err
    except BamBuddyError as err:
        raise _inventory_failure(err) from err
    if not fresh.shown:
        raise refuse("inventory_not_shown")
    return fresh


# A spool that does not fit the slot (`inventory.spool_fit`): its refusal.
_SPOOL_REFUSALS = {"not_for_ams": "spool_not_for_ams", "not_for_nozzle": "spool_not_for_nozzle", "not_for_printer": "spool_not_for_printer"}


async def _assign_spool(hass: HomeAssistant, call: ServiceCall) -> None:
    """An inventory spool into a slot: BamBuddy sets the slot from it (its
    material, colour, profile and K). A spool in another slot moves: that
    link goes first -- BamBuddy 1.2.5.7 would keep both; should BamBuddy then
    refuse the new one, the spool is in no slot. The spool is judged by a
    fresh read; one that read lacks (archived, deleted) BamBuddy refuses
    in its own words."""
    coordinator, ams, slot, tray = _place(hass, call.data[ATTR_ENTITY_ID])
    spool_id: int = call.data[ATTR_SPOOL_ID]
    inventory, _known = _inventory(coordinator, assigning=True)
    data = coordinator.data
    _online(coordinator)
    # The slot a running print feeds takes a spool too, as in BamBuddy: a wrong spool
    # noticed after the start is put right during the print.
    if data.changing_filament:
        raise refuse("filament_change", printer=coordinator.short_name)
    found = find_tray(data, tray)
    if found is not None and has_rfid(found[0]):
        raise refuse("rfid_spool")
    fresh = await _fresh_inventory(inventory)
    spool = fresh.spools.get(spool_id)
    fit = spool_fit(spool, _filament_slot(data, ams, slot)) if spool is not None else None
    elsewhere = fresh.places_of(spool_id, besides=(coordinator.printer_id, ams, slot))
    if spool is not None and spool.bambu_chip and elsewhere:
        # Its chip links it to the slot it is read in, and BamBuddy keeps a hand assignment beside that.
        raise refuse("spool_by_chip")
    printing = await _printing(coordinator, elsewhere)
    if printing:
        raise refuse("spool_printing", printer=printing[0])
    if fit in _SPOOL_REFUSALS:
        raise refuse(_SPOOL_REFUSALS[fit])
    printer_id = coordinator.printer_id

    async def assign() -> None:
        try:
            for row in elsewhere:
                # Gone since the read: nothing to take out.
                with contextlib.suppress(BamBuddyNotFoundError):
                    await inventory.client.unassign_spool(row.printer_id, row.ams_id, row.tray_id)
            await inventory.client.assign_spool(spool_id, printer_id, ams, slot, move=bool(elsewhere))
        except BamBuddyError as err:
            raise _inventory_failure(err, spool=spool_id) from err
        finally:
            await inventory.async_request_refresh()

    await async_run_command(coordinator, assign)


async def _unassign_spool(hass: HomeAssistant, call: ServiceCall) -> None:
    """A slot's link to its inventory spool goes; nothing is sent to the
    printer, so also during a print and while it is offline."""
    coordinator, ams, slot, _tray = _place(hass, call.data[ATTR_ENTITY_ID])
    inventory, known = _inventory(coordinator, assigning=True)
    printer_id = coordinator.printer_id
    if known.at(printer_id, ams, slot) is None:
        raise refuse("no_assignment")

    async def unassign() -> None:
        try:
            await inventory.client.unassign_spool(printer_id, ams, slot)
        except BamBuddyError as err:
            raise _inventory_failure(err, not_found="no_assignment") from err
        finally:
            await inventory.async_request_refresh()

    await async_run_command(coordinator, unassign, offline_ok=True)


async def _printing(coordinator: BamBuddyPrinterCoordinator, rows: list[Placed], read: dict[int, bool] | None = None) -> list[str]:
    """The names of the other printers among these slots' that print or pause a print:
    a print may switch to any of its slots, so a spool there is no spool to take.
    The entry's printers by what they last reported, the others by one read each;
    one that cannot be read locks nothing. `read` keeps the reads of one list."""
    read = {} if read is None else read
    watched = {other.printer_id: other.data for other in coordinator.config_entry.runtime_data.printers.values()}
    found: list[str] = []
    for printer_id in dict.fromkeys(row.printer_id for row in rows if row.printer_id != coordinator.printer_id):
        if printer_id in watched:
            busy = watched[printer_id].job_running
        elif printer_id in read:
            busy = read[printer_id]
        else:
            try:
                status = await coordinator.config_entry.runtime_data.client.get_status(printer_id)
            except BamBuddyError:
                status = {}
            busy = read[printer_id] = bool(status.get("connected")) and status.get("state") in JOB_STATES
        if busy:
            name = next(row.printer_name for row in rows if row.printer_id == printer_id)
            found.append(name or str(printer_id))
    return found


def _spool_answer(
    spool: Spool, here: tuple[int, int, int], fresh: InventoryData, slot: filaments.Slot, printing: list[str], known: dict[int, int]
) -> dict[str, Any]:
    """A spool of the list: where it sits (this slot, another, none; `also` its
    further slots -- BamBuddy can hold one in two) and whether it fits; a Bambu
    spool whose chip links it to another slot is none to assign, nor one in a
    slot of another printer that prints (`printing` its name)."""
    places = fresh.places_of(spool.id)
    others = [place_json(row, here[0], known) for row in fresh.places_of(spool.id, besides=here)]
    at_here = len(others) < len(places)
    place: dict[str, Any] | None = {"this_slot": True} if at_here else (others[0] if others else None)
    also = others if at_here else others[1:]
    attributes = spool.attributes()
    del attributes["label_weight"]
    fits = "by_chip" if spool.bambu_chip and others else "printing" if printing else spool_fit(spool, slot)
    return {**attributes, "type": printer_filament_type(spool.material).upper(), "place": place, "also": also, "fits": fits, **({"printing": printing[0]} if printing and fits == "printing" else {})}


async def _get_spools(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    """The spools of BamBuddy's inventory for a slot, read fresh: where each
    sits and whether it fits; the slot's own first, then by material, brand
    and colour name as BamBuddy lists them. The inventory's reads suffice
    (BamBuddy's Read Status toggle grants them); Manage Inventory is not needed."""
    coordinator, ams, slot, _tray = _place(hass, call.data[ATTR_ENTITY_ID])
    inventory, _known = _inventory(coordinator, assigning=False)
    fresh = await _fresh_inventory(inventory)
    here = (coordinator.printer_id, ams, slot)
    assigned = fresh.at(*here)
    target = _filament_slot(coordinator.data, ams, slot)
    order = sorted(
        fresh.spools.values(),
        key=lambda item: (
            item.id != (assigned.id if assigned else None),
            item.material.lower(),
            (item.brand or "").lower(),
            (item.color_name or "").lower(),
            item.id,
        ),
    )
    spools: list[Any] = []
    read: dict[int, bool] = {}
    known = external_counts(inventory)
    for item in order:
        elsewhere = fresh.places_of(item.id, besides=here)
        spools.append(_spool_answer(item, here, fresh, target, await _printing(coordinator, elsewhere, read), known))
    return {"assigned": assigned.id if assigned else None, "spools": spools}


def _online(coordinator: BamBuddyPrinterCoordinator) -> None:
    """Offline the printer's figures are stale: that is the reason to name."""
    if not coordinator.data.connected:
        raise refuse("printer_offline", printer=coordinator.short_name)


def _pause_first(coordinator: BamBuddyPrinterCoordinator) -> None:
    """A slot's tools wait for a running print and a filament change; a
    paused print allows them (a spool swapped by hand)."""
    data = coordinator.data
    if not data.connected:
        return
    if data.changing_filament:
        raise refuse("filament_change", printer=coordinator.short_name)
    if data.job_running and data.state != "PAUSE":
        raise refuse("slot_pause_first", printer=coordinator.short_name)


def _extruder(data: PrinterData, ams: int, slot: int) -> int | None:
    """The nozzle a slot feeds: 0 the right or only nozzle, 1 the left; an
    AMS unit's from its ams_extruder_map, the left external spool the left
    nozzle. None: a unit BamBuddy leaves out of the map -- one on the
    filament track switch reaches both nozzles."""
    if not data.is_dual_nozzle:
        return 0
    if ams == EXTERNAL_AMS:
        return 1 if slot == 0 else 0
    fed = unit_extruder(data, ams)
    return None if fed is None else int(fed)


def _filament_slot(data: PrinterData, ams: int, slot: int) -> filaments.Slot:
    """What Bambu Studio's offer for a slot depends on: the printer's model,
    the diameter and codes of the nozzles it feeds (both on the filament
    track switch), an AMS slot or an external spool, the AMS unit's type."""
    model = model_key(data.model) or None
    extruder = _extruder(data, ams, slot)
    extruders = frozenset({0, 1}) if extruder is None else frozenset({extruder})
    nozzles = data.status.get("nozzles") or []
    codes = {index: str(nozzles[index].get("nozzle_type") or "") for index in extruders if index < len(nozzles)}
    diameters = {index: filaments.diameter(model, nozzles[index].get("nozzle_diameter")) for index in extruders if index < len(nozzles)}
    if data.has_inputs:
        # An H3C: the tool the place feeds, not the one on the toolhead. The
        # TPU tool (TPU285) takes no AMS slot: a slot at its address is
        # offered as for a standard nozzle.
        tool = _rack_tool(data, ams, slot)
        code = str((tool or {}).get("nozzle_type") or "")
        codes = {0: code} if code and (ams == EXTERNAL_AMS or code[1:2].upper() != "T") else {}
    kind = studio_ams_type(_unit(data, ams)) if ams != EXTERNAL_AMS else None
    return filaments.Slot(model, filaments.diameter(model, _nozzle_diameter(data, ams, slot)), ams != EXTERNAL_AMS, extruders, codes, kind, diameters)


# The reasons `filaments.refusal` gives that are refusals of their own name.
_FILAMENT_REFUSALS = frozenset({"filament_not_for_ams", "filament_not_for_nozzle", "filament_not_left", "filament_not_right"})


def _refused_filament(why: str | None, filament: str, printer: str) -> ServiceValidationError:
    """The refusal of a filament Bambu Studio would not set here."""
    if why in _FILAMENT_REFUSALS:
        return refuse(why, filament=filament)
    return refuse("filament_not_offered", filament=filament, printer=printer)


def _rack_tool(data: PrinterData, ams: int, slot: int) -> dict[str, Any] | None:
    """The H3C's tool a place feeds, from its rack: AMS 3H slot k feeds the
    tool at address k, input v the one at 255 - v (Bambu Studio). None for
    every other printer."""
    if not data.has_inputs:
        return None
    if ams == EXTERNAL_AMS:
        address = 255 - input_global_id(slot)
    else:
        address = slot
    rack = [tool for tool in data.status.get("nozzle_rack") or [] if isinstance(tool, dict)]
    return next((tool for tool in rack if tool.get("addr_id") == address), None)


def _nozzle_diameter(data: PrinterData, ams: int, slot: int) -> str:
    """The diameter of the nozzle the slot feeds -- the printer keeps a K
    value per diameter; a unit on both nozzles takes the first's (both are
    alike as a rule). An H3C's place: its own tool's."""
    tool = _rack_tool(data, ams, slot)
    if tool is not None and tool.get("nozzle_diameter"):
        return str(tool["nozzle_diameter"])
    extruder = _extruder(data, ams, slot) or 0
    nozzles = data.status.get("nozzles") or []
    for index in (extruder, 0):
        if index < len(nozzles) and nozzles[index].get("nozzle_diameter"):
            return str(nozzles[index]["nozzle_diameter"])
    return "0.4"


# The profile a slot of a type the list lacks is taken for.
_GENERIC_PLA = "GFL99"


def _temperatures(tray: dict[str, Any], tray_type: str, listed: filaments.Filament | None) -> tuple[int, int]:
    """The slot's own nozzle range, else its profile's, else that of the
    profile its type stands for -- Generic PLA's for a type the list lacks."""
    low, high = tray.get("nozzle_temp_min"), tray.get("nozzle_temp_max")
    if isinstance(low, int) and isinstance(high, int) and 0 < low <= high:
        return low, high
    profile = listed or filaments.of_type(tray_type) or filaments.FILAMENTS[_GENERIC_PLA]
    return profile.temp_min, profile.temp_max


async def _start_drying(hass: HomeAssistant, call: ServiceCall) -> None:
    coordinator, unit = _ams(hass, call.data[ATTR_DEVICE_ID])
    data = coordinator.data
    found = _unit(data, unit)
    model = ams_model(found, data)
    if not can_dry(found, data):
        if model not in DRYING_MAX:
            raise refuse("cannot_dry")
        if data.status.get("drying_screen_only") or data.dries_on_screen_only():
            raise refuse("dry_on_screen", printer=coordinator.short_name)
        raise refuse("dry_firmware", printer=coordinator.short_name)
    _online(coordinator)
    # Past the guard the unit has a heater: its model is in the table.
    maximum = DRYING_MAX[model]
    # What BamBuddy would refuse, said before it is sent.
    if is_drying(found):
        raise refuse("already_drying")
    if data.changing_filament:
        raise refuse("filament_change", printer=coordinator.short_name)
    if call.data[ATTR_TEMPERATURE] > maximum:
        raise refuse("drying_too_hot", model=model, maximum=str(maximum))

    # The AMS 3H's zone names its filament; elsewhere BamBuddy picks it.
    filament = drying_filament(found) if model == "AMS 3H" else None
    zone = {"filament": filament} if filament else {}

    async def start() -> None:
        try:
            await coordinator.client.start_drying(coordinator.printer_id, unit, call.data[ATTR_TEMPERATURE], call.data[ATTR_DURATION], **zone)
        except BamBuddyApiError as err:
            # A countdown that stands still may still count as drying for the
            # printer: the way out is a stop. BamBuddy's other reasons
            # (power, the filament at the outlet) say what to do themselves.
            if err.status == 409 and found.get("dry_countdown_stalled") and err.detail == _ALREADY_DRYING:
                raise refuse("drying_parked") from err
            # Busy with a job: a firmware that cannot dry while it prints.
            if err.status == 409 and err.detail == _PRINTER_BUSY and coordinator.data.job_running:
                raise refuse("dry_while_printing", printer=coordinator.short_name) from err
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
        raise refuse("cannot_dry")
    _online(coordinator)
    # Nothing to stop (BamBuddy answers yes and does nothing); a parked
    # countdown may be stopped.
    if not drying_minutes(found):
        raise refuse("not_drying")
    # Started on its own screen, it stops there too (BamBuddy refuses it).
    if data.status.get("drying_screen_only"):
        raise refuse("dry_stop_on_screen", printer=coordinator.short_name)
    await async_run_command(coordinator, partial(coordinator.client.stop_drying, coordinator.printer_id, unit))


async def _get_print_objects(hass: HomeAssistant, call: ServiceCall) -> ServiceResponse:
    """A read: Read Status is enough."""
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID])
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
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID])
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
    """A task of the printer done: BamBuddy's count starts over. BamBuddy
    keeps it, the printer may be off."""
    coordinator = _printer(hass, call.data[ATTR_DEVICE_ID])
    task = call.data[ATTR_TASK_ID]
    # Any task BamBuddy listed, a disabled one too; before the first read the
    # task goes as given (BamBuddy marks the task of that ID, whichever
    # printer's).
    listed = coordinator.data.maintenance
    if listed is not None and task not in {item.get("id") for item in listed.get("maintenance_items") or [] if isinstance(item, dict)}:
        raise refuse("maintenance_task_unknown", printer=coordinator.short_name)
    try:
        await async_run_command(
            coordinator, partial(coordinator.client.perform_maintenance, task), offline_ok=True
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
        raise refuse("hms_not_current", code=call.data[ATTR_CODE])
    if action not in hms_answers(error):
        # Offered, but one of the answers that only steer Bambu's own screen.
        offered = error.get("actions")
        if isinstance(offered, list) and action in offered:
            raise refuse("hms_answer_screen_only")
        raise refuse("hms_answer_not_offered", code=call.data[ATTR_CODE])
    job = error.get("job_id")

    async def answer() -> None:
        try:
            await coordinator.client.execute_hms_action(coordinator.printer_id, hms_code(error), action, str(job) if job else None)
        except BamBuddyApiError as err:
            if err.status in (400, 502):
                # BamBuddy could not hand it to the printer, or the printer
                # did not acknowledge it.
                raise refuse("hms_answer_not_taken", printer=coordinator.short_name) from err
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
    "get_filaments": _get_filaments,
    "reset_slot": _reset_slot,
    "refresh_rfid": _refresh_rfid,
    "assign_spool": _assign_spool,
    "unassign_spool": _unassign_spool,
    "get_spools": _get_spools,
}
# The actions that answer (and only answer).
_RESPONSES = {"get_print_objects", "run_diagnostic", "get_k_profiles", "get_filaments", "get_spools"}


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
