"""The BamBuddy integration: Bambu Lab printers through a BamBuddy server."""
from __future__ import annotations

from datetime import datetime
from functools import partial
import logging
import re
from typing import Any

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryAuthFailed, ConfigEntryError, ConfigEntryNotReady, HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.typing import ConfigType

from .api import (
    BamBuddyAuthError,
    BamBuddyError,
    BamBuddyNotFoundError,
    BamBuddyPermissionError,
    normalise_url,
)
from .cards import async_register_card
from .const import (
    CONF_API_KEY,
    CONF_PRINTER_ID,
    CONF_PRINTER_NAME,
    CONF_PRINTERS,
    CONF_SERIAL,
    CONF_URL,
    CONF_VERIFY_SSL,
    DOMAIN,
    MIN_BAMBUDDY_VERSION,
    MISSING_INTERVAL,
)
from .coordinator import (
    BamBuddyConfigEntry,
    BamBuddyData,
    BamBuddyInstanceCoordinator,
    BamBuddyPlugCoordinator,
    BamBuddyPrinterCoordinator,
    BamBuddyUpdateCoordinator,
    async_raise_missing_issue,
    async_remove_printer,
    create_client,
    failure,
    missing_issue,
    printer_identifier,
)
from .entity import instance_device_info, printer_device_info
from .models import ams_key, find_printers, stored_key, stored_printer, too_old
from .plugs import plug_identifier
from .services import async_setup_services

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

PLATFORMS = [
    Platform.BINARY_SENSOR,
    Platform.BUTTON,
    Platform.CAMERA,
    Platform.FAN,
    Platform.IMAGE,
    Platform.LIGHT,
    Platform.NUMBER,
    Platform.SELECT,
    Platform.SENSOR,
    Platform.SWITCH,
    Platform.UPDATE,
]

# Entities of 1.x that 2.0 merged or replaced (domain, key), removed from
# the entity registry by the migration to entry version 2.
_DROPPED_ENTITIES = {
    ("sensor", "version"),
    ("sensor", "health_status"),
    ("sensor", "uptime"),
    ("sensor", "archive_count"),
    ("sensor", "subtask_name"),
    ("sensor", "gcode_file"),
    ("sensor", "model"),
    ("sensor", "firmware_version"),
    ("sensor", "nozzle_target"),
    ("sensor", "bed_target"),
    ("sensor", "cooling_fan_speed"),
    ("sensor", "aux_fan_speed"),
    ("sensor", "chamber_fan_speed"),
    ("binary_sensor", "hms_errors"),
    ("switch", "chamber_light"),
}
_PRINTER_KEY = re.compile(r"p\d+_(.+)")


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """The actions and the dashboard card: once per run, for every entry."""
    async_setup_services(hass)
    await async_register_card(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: BamBuddyConfigEntry) -> bool:
    client = create_client(hass, entry)
    try:
        version = await client.get_version()
    except BamBuddyNotFoundError:
        version = "0"  # older than BamBuddy's public version route
    except BamBuddyError as err:
        raise failure(err, ConfigEntryNotReady) from err
    if too_old(version):
        raise ConfigEntryError(
            translation_domain=DOMAIN,
            translation_key="bambuddy_too_old",
            translation_placeholders={"version": version, "minimum": MIN_BAMBUDDY_VERSION},
        )
    try:
        listed = await client.get_printers()
        granted = await client.permissions()
        can_control = granted.control
        if not can_control:
            _remove_control_entities(hass, entry)
        if not granted.plugs:
            _remove_control_entities(hass, entry, plugs=True)
    except (BamBuddyAuthError, BamBuddyPermissionError) as err:
        raise ConfigEntryAuthFailed(translation_domain=DOMAIN, translation_key="auth_failed") from err
    except BamBuddyError as err:
        raise failure(err, ConfigEntryNotReady) from err

    # BamBuddy's figures and its update checks (they ask GitHub and Bambu
    # Lab through BamBuddy): when they fail, only their entities wait.
    instance = BamBuddyInstanceCoordinator(hass, entry, client)
    updates = BamBuddyUpdateCoordinator(hass, entry, client)
    devices = dr.async_get(hass)
    devices.async_get_or_create(config_entry_id=entry.entry_id, **instance_device_info(entry, version))
    await instance.async_refresh()
    await updates.async_refresh()

    printers: dict[int, BamBuddyPrinterCoordinator] = {}
    missing: set[str] = set()
    stored: list[dict[str, Any]] = entry.options.get(CONF_PRINTERS, [])
    current: list[dict[str, Any]] = []
    found = find_printers(listed, stored)
    for printer, info in zip(stored, found, strict=True):
        if info is None:
            current.append(printer)
            missing.add(missing_issue(entry.entry_id, stored_key(printer)))
            async_raise_missing_issue(hass, entry.entry_id, stored_key(printer), printer[CONF_PRINTER_NAME])
            continue
        # BamBuddy may number its printers anew, and rename them; the serial stays.
        current.append(stored_printer(info))
        coordinator = BamBuddyPrinterCoordinator(hass, entry, client, info)
        await coordinator.async_config_entry_first_refresh()
        devices.async_get_or_create(config_entry_id=entry.entry_id, **printer_device_info(hass, coordinator))
        printers[info["id"]] = coordinator
    if current != stored:
        # Before the update listener: no reload for it.
        hass.config_entries.async_update_entry(entry, options={**entry.options, CONF_PRINTERS: current})
    # The printers' smart plugs: when BamBuddy cannot list them, only their
    # entities wait.
    plugs = BamBuddyPlugCoordinator(hass, entry, client, printers)
    await plugs.async_refresh()
    _delete_issues(hass, entry, keep=missing)
    _remove_stale_devices(hass, entry, set(plugs.data or {}) if plugs.last_update_success and plugs.readable else None)
    if granted.plugs:
        _remove_plug_states(hass, entry, plugs)

    entry.runtime_data = BamBuddyData(
        client, instance, updates, printers, can_control, granted.maintenance, plugs=plugs, can_control_plugs=granted.plugs
    )
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    absent = [printer for printer, info in zip(stored, found, strict=True) if info is None]
    if absent:
        entry.async_on_unload(
            async_track_time_interval(hass, partial(_async_look_for, hass, entry, absent), MISSING_INTERVAL)
        )
    return True


async def _async_look_for(hass: HomeAssistant, entry: BamBuddyConfigEntry, absent: list[dict[str, Any]], _now: datetime) -> None:
    """Printers BamBuddy no longer listed: once it lists one again, by its
    serial, the entry reloads -- it is back with its devices, entities and
    history, and its issue goes. Matched among all the entry's printers, as
    at setup: a printer without a serial is not taken for another's number."""
    runtime = entry.runtime_data
    if runtime.reloading:
        return
    try:
        listed = await runtime.client.get_printers()
    except BamBuddyError as err:
        _LOGGER.debug("Looking for the printers BamBuddy no longer lists failed: %s", err)
        return
    # The entry may have reloaded or gone meanwhile.
    if entry.state is not ConfigEntryState.LOADED or entry.runtime_data is not runtime or runtime.reloading:
        return
    stored: list[dict[str, Any]] = entry.options.get(CONF_PRINTERS, [])
    missing = {stored_key(printer) for printer in absent}
    if any(info is not None and stored_key(printer) in missing for printer, info in zip(stored, find_printers(listed, stored), strict=True)):
        _LOGGER.debug("BamBuddy lists a missing printer again: the entry reloads")
        runtime.reloading = True
        hass.config_entries.async_schedule_reload(entry.entry_id)


def _remove_plug_states(hass: HomeAssistant, entry: ConfigEntry, plugs: BamBuddyPlugCoordinator) -> None:
    """A key that may switch plugs again: the states shown instead of their
    switches go (an MQTT plug's stays -- BamBuddy only watches it)."""
    registry = er.async_get(hass)
    for plug in (plugs.data or {}).values():
        if plug.kind == "monitor":
            continue
        entity_id = registry.async_get_entity_id("binary_sensor", DOMAIN, f"{entry.entry_id}_plug{plug.id}_power")
        if entity_id:
            registry.async_remove(entity_id)


def _delete_issues(hass: HomeAssistant, entry: ConfigEntry, keep: set[str] | None = None) -> None:
    """The entry's "printer missing" issues, but those still true."""
    prefix = missing_issue(entry.entry_id, "")
    for domain, issue_id in list(ir.async_get(hass).issues):
        if domain == DOMAIN and issue_id.startswith(prefix) and issue_id not in (keep or set()):
            ir.async_delete_issue(hass, DOMAIN, issue_id)


def _remove_stale_devices(hass: HomeAssistant, entry: ConfigEntry, plugs: set[int] | None) -> None:
    """Devices of printers no longer added (and their AMS units) go, and of
    plugs BamBuddy no longer links to them -- `plugs` None: the list could
    not be read, every plug keeps its device."""
    configured = {
        printer_identifier(entry.entry_id, stored_key(printer))[1] for printer in entry.options.get(CONF_PRINTERS, [])
    }
    registry = dr.async_get(hass)
    plug_prefix = plug_identifier(entry.entry_id, 0)[1].removesuffix("0")
    for device in dr.async_entries_for_config_entry(registry, entry.entry_id):
        names = {identifier for domain, identifier in device.identifiers if domain == DOMAIN}
        if entry.entry_id in names:
            continue
        plug = next((name.removeprefix(plug_prefix) for name in names if name.startswith(plug_prefix)), None)
        if plug is not None:
            if plugs is not None and not (plug.isdigit() and int(plug) in plugs):
                registry.async_remove_device(device.id)
            continue
        if not any(name == printer or name.startswith(f"{printer}_ams_") for name in names for printer in configured):
            registry.async_remove_device(device.id)


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: BamBuddyConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


# The platforms that only control; of the buttons, all but refreshing.
_CONTROL_DOMAINS = frozenset({"fan", "light", "number", "select", "switch"})
# Home Assistant's own settings among them, with any key: the camera's frame rate.
_SETTINGS = ("_camera_fps",)


@callback
def _remove_control_entities(hass: HomeAssistant, entry: BamBuddyConfigEntry, *, plugs: bool = False) -> None:
    """A key that may no longer control printers -- or, `plugs`, switch
    smart plugs: its controls would stay as entities no longer provided.
    They come back, with their entity IDs, with a key that may (on Home
    Assistant 2025.x without their names, areas and hidden state; 2026
    keeps those for a deleted entity). The plugs' controls follow their
    own permission."""
    registry = er.async_get(hass)
    plug_prefix = f"{entry.entry_id}_plug"
    for entity in er.async_entries_for_config_entry(registry, entry.entry_id):
        if entity.unique_id.startswith(plug_prefix) != plugs:
            continue
        if entity.unique_id.endswith(_SETTINGS):
            continue
        if entity.domain in _CONTROL_DOMAINS or (entity.domain == "button" and not entity.unique_id.endswith("_refresh_status")):
            registry.async_remove(entity.entity_id)


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    _delete_issues(hass, entry)
    ir.async_delete_issue(hass, DOMAIN, f"names_from_bambuddy_{entry.entry_id}")


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Version 1 (host and port) to 2 (a URL); 1.x's merged entities leave
    the registry. 2.1 to 2.2: printers and AMS units known by their serial
    numbers. A newer version than this code knows is refused (newer Home
    Assistant releases refuse it before they ask; 2025.5 asks)."""
    if entry.version > 2:
        return False
    if entry.version == 1:
        url = normalise_url(f"http://{entry.data['host']}:{entry.data['port']}")
        _remove_dropped_entities(hass, entry)
        hass.config_entries.async_update_entry(
            entry,
            data={CONF_URL: url, CONF_API_KEY: entry.data[CONF_API_KEY], CONF_VERIFY_SSL: True},
            unique_id=url,
            version=2,
            minor_version=1,
        )
        _LOGGER.info("Migrated the BamBuddy entry to version 2")
    if entry.minor_version < 2:
        printers = _key_by_serial(hass, entry)
        hass.config_entries.async_update_entry(entry, options={**entry.options, CONF_PRINTERS: printers}, minor_version=2)
        _LOGGER.info("Migrated the BamBuddy entry to version 2.2")
    return True


def _key_by_serial(hass: HomeAssistant, entry: ConfigEntry) -> list[dict[str, Any]]:
    """Devices and entities known by BamBuddy's printer number get the
    serial numbers the device registry holds -- their entity IDs, and so
    their history, stay. A printer never set up keeps its number until its
    setup finds the serial."""
    devices = dr.async_get(hass)
    own = {
        identifier: device
        for device in dr.async_entries_for_config_entry(devices, entry.entry_id)
        for domain, identifier in device.identifiers
        if domain == DOMAIN
    }
    renames: list[tuple[str, str]] = []
    printers: list[dict[str, Any]] = []
    for printer in entry.options.get(CONF_PRINTERS, []):
        number = printer[CONF_PRINTER_ID]
        old = f"{entry.entry_id}_printer_{number}"
        device = own.get(old)
        serial = (device.serial_number or "") if device else ""
        printers.append({**printer, CONF_SERIAL: serial})
        if device is None:
            continue
        key = serial or f"id{number}"
        new = f"{entry.entry_id}_printer_{key}"
        devices.async_update_device(device.id, new_identifiers={(DOMAIN, new)})
        taken: set[str] = set()
        for identifier, unit in own.items():
            if identifier.startswith(f"{old}_ams_"):
                place = identifier.removeprefix(f"{old}_ams_")
                unit_key = unit.serial_number or place
                if unit_key in taken:
                    # One unit seen at two places under 2.1: the second keeps its place.
                    unit_key = place
                taken.add(unit_key)
                devices.async_update_device(unit.id, new_identifiers={(DOMAIN, f"{new}_ams_{unit_key}")})
                renames.append((f"{entry.entry_id}_p{number}_ams{place}_", f"{entry.entry_id}_p{key}_ams{unit_key}_"))
        # After the printer's AMS units: their IDs start the same way.
        renames.append((f"{entry.entry_id}_p{number}_", f"{entry.entry_id}_p{key}_"))
    entities = er.async_get(hass)
    for entity in er.async_entries_for_config_entry(entities, entry.entry_id):
        for old_prefix, new_prefix in renames:
            if entity.unique_id.startswith(old_prefix):
                entities.async_update_entity(
                    entity.entity_id, new_unique_id=new_prefix + entity.unique_id.removeprefix(old_prefix)
                )
                break
    return printers


def _remove_dropped_entities(hass: HomeAssistant, entry: ConfigEntry) -> None:
    registry = er.async_get(hass)
    for entity in er.async_entries_for_config_entry(registry, entry.entry_id):
        key = (entity.unique_id or "").removeprefix(f"{entry.entry_id}_")
        if match := _PRINTER_KEY.fullmatch(key):
            key = match.group(1)
        if (entity.domain, key) in _DROPPED_ENTITIES:
            registry.async_remove(entity.entity_id)


async def async_remove_config_entry_device(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, device: dr.DeviceEntry
) -> bool:
    """Deleting a printer's device removes the printer; an AMS unit's device
    goes when its printer no longer reports it; the instance stays."""
    if (DOMAIN, entry.entry_id) in device.identifiers:
        raise HomeAssistantError(translation_domain=DOMAIN, translation_key="cannot_delete_instance")
    printers: list[dict[str, Any]] = entry.options.get(CONF_PRINTERS, [])
    for printer in printers:
        if printer_identifier(entry.entry_id, stored_key(printer)) in device.identifiers:
            async_remove_printer(hass, entry, printer)
            return True
    # Not loaded (BamBuddy cannot be reached): nothing reports a unit.
    runtime: BamBuddyData | None = getattr(entry, "runtime_data", None)
    plugs = runtime.plugs if runtime else None
    for plug_id in (plugs.data or {}) if plugs else ():
        if plugs is not None and plugs.identifier(plug_id) in device.identifiers:
            raise HomeAssistantError(translation_domain=DOMAIN, translation_key="cannot_delete_plug")
    for coordinator in runtime.printers.values() if runtime else ():
        for unit in coordinator.data.ams_units:
            if coordinator.ams_identifier(ams_key(unit)) in device.identifiers:
                raise HomeAssistantError(translation_domain=DOMAIN, translation_key="cannot_delete_ams")
    return True
