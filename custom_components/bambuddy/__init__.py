"""The BamBuddy integration: Bambu Lab printers through a BamBuddy server."""
from __future__ import annotations

import asyncio
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
from homeassistant.util import dt as dt_util

from .api import (
    BamBuddyAuthError,
    BamBuddyBadAnswerError,
    BamBuddyClient,
    BamBuddyError,
    BamBuddyNotFoundError,
    BamBuddyPermissionError,
    normalise_url,
)
from .auto_off import ENTITIES as AUTO_OFF_ENTITIES, gets_auto_off
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
    async_schedule_reload,
    create_client,
    failure,
    fetch,
    find_device,
    issue_prefixes,
    missing_issue,
    names_issue,
    printer_identifier,
)
from .entity import instance_device_info, printer_device_info
from .key import KeyCheck, KeyGuard
from .models import ams_key, display_model, find_printers, model_changed, stored_key, stored_printer, too_old
from .plugs import plug_identifier
from . import renames
from .rekey import async_rekey_ams_units
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
    first = await _async_check_key(client)
    auth_enabled = await _async_auth_enabled(client)
    listed = await fetch(client.get_printers(), kind=ConfigEntryNotReady)

    # BamBuddy's figures and its update checks (they ask GitHub and Bambu
    # Lab through BamBuddy): when they fail, only their entities wait.
    instance = BamBuddyInstanceCoordinator(hass, entry, client)
    updates = BamBuddyUpdateCoordinator(hass, entry, client)
    devices = dr.async_get(hass)
    devices.async_get_or_create(config_entry_id=entry.entry_id, **instance_device_info(entry, version))
    # Beside the printers' first reads, not before them: the statistics wait
    # for BamBuddy's plugs.
    figures = asyncio.ensure_future(instance.async_refresh())
    try:
        printers, absent = await _async_read_printers(hass, entry, client, listed)
        # Configure may save while this setup runs, before its listener.
        taken = dict(entry.options)
        # The printers' smart plugs: when BamBuddy cannot list them, only
        # their entities wait.
        plugs = BamBuddyPlugCoordinator(hass, entry, client, printers)
        await asyncio.gather(figures, plugs.async_refresh())
    except BaseException:
        figures.cancel()
        raise
    # Before the platforms: AMS units that now report their serial move to
    # it; the renamed IDs go into the store at once, then its notices. The
    # store is read first: a list that cannot be kept moves nothing.
    stored = entry.options.get(CONF_PRINTERS, [])
    await renames.async_keep(hass, entry.entry_id, {stored_key(printer) for printer in stored})
    renamed = async_rekey_ams_units(hass, entry, printers)
    grown = {key for key, pairs in renamed.items() if await renames.async_add(hass, entry.entry_id, key, pairs)}
    names = {stored_key(printer): _device_name(hass, entry, printer) for printer in absent}
    names.update({coordinator.key: coordinator.printer_name for coordinator in printers.values()})
    noticed = await renames.async_raise(hass, entry, names, grown)
    missing = {missing_issue(entry.entry_id, stored_key(printer)) for printer in absent}
    # A removed printer's names notice goes; a stored one's stays until Home Assistant restarts.
    named = {names_issue(entry.entry_id, stored_key(printer)) for printer in stored}
    _delete_issues(hass, entry, keep=missing | named | noticed)
    _remove_stale_devices(hass, entry, set(plugs.data or {}) if plugs.last_update_success else None)
    if plugs.last_update_success:
        _remove_spare_switch_offs(hass, entry, plugs)

    entry.runtime_data = BamBuddyData(
        client,
        instance,
        updates,
        printers,
        plugs,
        key=KeyGuard(hass, entry, client, first),
        auth_enabled=auth_enabled,
        missing=[
            device.id
            for printer in absent
            if (device := find_device(hass, entry.entry_id, printer_identifier(entry.entry_id, stored_key(printer)))) is not None
        ],
    )
    # The update checks ask GitHub and Bambu Lab through BamBuddy, up to a
    # minute each: the setup does not wait for them, their entities do.
    entry.async_create_background_task(hass, updates.async_refresh(), "bambuddy update checks")
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.runtime_data.key.async_start()
    _remove_what_the_model_lacks(hass, entry, printers)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    if entry.options != taken:
        # Saved in Configure while this setup ran: it reloads once for it.
        async_schedule_reload(hass, entry)
    if absent:
        # Cancelled as Home Assistant stops: its web session closes then.
        entry.async_on_unload(
            async_track_time_interval(hass, partial(_async_look_for, hass, entry, absent), MISSING_INTERVAL, cancel_on_shutdown=True)
        )
    return True


async def _async_read_printers(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, client: BamBuddyClient, listed: list[dict[str, Any]]
) -> tuple[dict[int, BamBuddyPrinterCoordinator], list[dict[str, Any]]]:
    """The stored printers BamBuddy lists, each read once, with their
    devices; and those it does not list (as stored), with a repair issue."""
    devices = dr.async_get(hass)
    printers: dict[int, BamBuddyPrinterCoordinator] = {}
    absent: list[dict[str, Any]] = []
    stored: list[dict[str, Any]] = entry.options.get(CONF_PRINTERS, [])
    current: list[dict[str, Any]] = []
    for printer, info in zip(stored, find_printers(listed, stored), strict=True):
        if info is None:
            # By the name its device has now: BamBuddy may have renamed it since
            # the last start. Stored under it, the repair's dialog and the
            # actions' refusals say it too.
            device = find_device(hass, entry.entry_id, printer_identifier(entry.entry_id, stored_key(printer)))
            name = device.name if device is not None and device.name else printer[CONF_PRINTER_NAME]
            current.append({**printer, CONF_PRINTER_NAME: name})
            absent.append(printer)
            async_raise_missing_issue(hass, entry.entry_id, stored_key(printer), name)
            continue
        # BamBuddy may number its printers anew, and rename them; the serial stays.
        current.append(stored_printer(info))
        coordinator = BamBuddyPrinterCoordinator(hass, entry, client, info)
        await coordinator.async_config_entry_first_refresh()
        # Corrected in BamBuddy since the last setup (a model that comes for
        # a printer without one only adds).
        device = find_device(hass, entry.entry_id, coordinator.identifier)
        coordinator.model_changed = model_changed(device.model if device else None, info.get("model"))
        details = printer_device_info(hass, coordinator)
        if coordinator.model_changed and device is not None:
            # The new model reaches the device with its entities
            # (_remove_what_the_model_lacks): a setup that fails before
            # it, or meets the printer blank, sees the change again.
            details["model"] = device.model
        devices.async_get_or_create(config_entry_id=entry.entry_id, **details)
        printers[info["id"]] = coordinator
    if current != stored:
        # Before the update listener: no reload for it.
        hass.config_entries.async_update_entry(entry, options={**entry.options, CONF_PRINTERS: current})
    return printers, absent


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
        async_schedule_reload(hass, entry)


def _remove_what_the_model_lacks(hass: HomeAssistant, entry: ConfigEntry, printers: dict[int, BamBuddyPrinterCoordinator]) -> None:
    """A printer's model corrected in BamBuddy (a P1S that is an A1): its
    entities the new model lacks would stay as entities no longer provided.
    Only after a model change -- a printer offline at the setup reports less
    and keeps its entities -- and only with the printer's report: BamBuddy
    reconnects a printer it edited, and a blank one waits for the setup
    after its first report (its reload). Never an AMS unit's entities or the
    left auxiliary fan, which come with later reports. The device takes the
    new model once its entities followed."""
    registry = er.async_get(hass)
    devices = dr.async_get(hass)
    for printer in printers.values():
        if not printer.model_changed or printer.data.blank:
            continue
        prefix = printer.entity_unique_id("")
        for entity in er.async_entries_for_config_entry(registry, entry.entry_id):
            key = entity.unique_id.removeprefix(prefix)
            if key != entity.unique_id and not key.startswith(("ams", "left_aux_fan")) and entity.unique_id not in printer.created:
                registry.async_remove(entity.entity_id)
        if (device := find_device(hass, entry.entry_id, printer.identifier)) is not None:
            devices.async_update_device(device.id, model=display_model(printer.info.get("model")) or None)


def _remove_spare_switch_offs(hass: HomeAssistant, entry: ConfigEntry, plugs: BamBuddyPlugCoordinator) -> None:
    """A plug that no longer gets the switch-off after the print -- another
    became the printer's own in BamBuddy, or it no longer powers the
    printer -- loses its entities: they would stay as entities no longer
    provided."""
    registry = er.async_get(hass)
    for plug in (plugs.data or {}).values():
        if gets_auto_off(plugs, plug):
            continue
        for domain, key in AUTO_OFF_ENTITIES:
            if entity_id := registry.async_get_entity_id(domain, DOMAIN, f"{entry.entry_id}_plug{plug.id}_{key}"):
                registry.async_remove(entity_id)


def _device_name(hass: HomeAssistant, entry: ConfigEntry, printer: dict[str, Any]) -> str:
    """A stored printer's name: its device's of now, else the stored one."""
    device = find_device(hass, entry.entry_id, printer_identifier(entry.entry_id, stored_key(printer)))
    return device.name if device is not None and device.name else str(printer[CONF_PRINTER_NAME])


def _delete_issues(hass: HomeAssistant, entry: ConfigEntry, keep: set[str] | None = None) -> None:
    """The entry's "printer missing", names and renamed AMS entity IDs
    notices, but those still true."""
    prefixes = issue_prefixes(entry.entry_id)
    for domain, issue_id in list(ir.async_get(hass).issues):
        if domain == DOMAIN and issue_id.startswith(prefixes) and issue_id not in (keep or set()):
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


# A 401 at setup is asked again this much later: BamBuddy also answers 401
# when its key lookup fails for a moment.
_KEY_AGAIN = 1.0


async def _async_check_key(client: BamBuddyClient) -> KeyCheck:
    """The key at setup: one with every scope the integration needs (also
    with BamBuddy's authentication off), else Home Assistant asks for a new
    one; no answer: tried again later."""
    for attempt in range(2):
        try:
            scopes = await client.check_key()
        except BamBuddyAuthError as err:
            if attempt == 0:
                await asyncio.sleep(_KEY_AGAIN)
                continue
            raise ConfigEntryAuthFailed(translation_domain=DOMAIN, translation_key="auth_failed") from err
        except BamBuddyPermissionError as err:
            raise ConfigEntryAuthFailed(translation_domain=DOMAIN, translation_key="key_owner_inactive") from err
        except BamBuddyBadAnswerError as err:
            # A BamBuddy that renamed the field: an error, not a retry for ever.
            raise ConfigEntryError(translation_domain=DOMAIN, translation_key="key_check_unreadable") from err
        except BamBuddyError as err:
            raise failure(err, ConfigEntryNotReady) from err
        if scopes.missing:
            raise ConfigEntryAuthFailed(
                translation_domain=DOMAIN, translation_key="key_scopes_missing", translation_placeholders=scopes.marks()
            )
        return KeyCheck(dt_util.utcnow(), "ok", scopes)
    raise AssertionError("unreachable")


async def _async_auth_enabled(client: BamBuddyClient) -> bool | None:
    """Whether BamBuddy's authentication is on, for the diagnostics."""
    try:
        return bool((await client.get_auth_status()).get("auth_enabled"))
    except BamBuddyError:
        return None


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: BamBuddyConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    _delete_issues(hass, entry)
    await renames.async_clear(hass, entry.entry_id)


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
    if runtime is None:
        return True
    if any(runtime.plugs.identifier(plug_id) in device.identifiers for plug_id in runtime.plugs.data or {}):
        raise HomeAssistantError(translation_domain=DOMAIN, translation_key="cannot_delete_plug")
    for coordinator in runtime.printers.values():
        for unit in coordinator.data.ams_units:
            if coordinator.ams_identifier(ams_key(unit)) in device.identifiers:
                raise HomeAssistantError(translation_domain=DOMAIN, translation_key="cannot_delete_ams")
    return True
