"""Polling BamBuddy: one coordinator per printer for its live status, one for
the instance's figures, one for the update checks (the smart plugs' is in
`plug_coordinator`)."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
import hashlib
import logging
from typing import TYPE_CHECKING, Any, TypeVar

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import (
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyClient,
    BamBuddyConnectionError,
    BamBuddyError,
    BamBuddyNotFoundError,
    BamBuddyPermissionError,
    timed_out,
)
from .const import (
    AMS_SERIAL_WAIT,
    CONF_API_KEY,
    CONF_PRINTER_NAME,
    CONF_PRINTERS,
    CONF_URL,
    CONF_VERIFY_SSL,
    DOMAIN,
    INSTANCE_INTERVAL,
    MAINTENANCE_INTERVAL,
    PRINTER_INTERVAL,
    PUSH_GAP,
    REFRESH_AFTER_COMMAND,
    REFRESH_AFTER_COMMAND_AGAIN,
    RELOADS_PER_RUN,
    MINUTELY_INTERVAL,
    SYSTEM_INTERVAL,
    UPDATE_INTERVAL,
    UPDATE_RETRY_INTERVAL,
)
from .models import (
    CAMERA_MIN_FPS,
    JOB_STATES,
    ChamberSent,
    PrinterData,
    ams_key,
    ams_model,
    ams_name,
    ams_serial,
    ams_type_by_place,
    camera_max_fps,
    find_printers,
    model_key,
    part_id,
    printer_key,
    printer_name,
    short_name,
    stored_key,
)
from .timers import async_call_later_until_stop

if TYPE_CHECKING:
    from .auto_off import AutoOff
    from .inventory import BamBuddyInventoryCoordinator
    from .key import KeyGuard
    from .live import BamBuddyLive
    from .plug_coordinator import BamBuddyPlugCoordinator

_LOGGER = logging.getLogger(__name__)

_T = TypeVar("_T")
_E = TypeVar("_E", bound=HomeAssistantError)

type BamBuddyConfigEntry = ConfigEntry[BamBuddyData]


def failure(err: BamBuddyError, kind: type[_E]) -> _E:
    """What went wrong, for the user: BamBuddy did not answer in time,
    cannot be reached, or answered with an error."""
    if isinstance(err, BamBuddyConnectionError) and timed_out(err):
        return kind(translation_domain=DOMAIN, translation_key="update_timeout", translation_placeholders={"error": str(err)})
    if isinstance(err, BamBuddyConnectionError):
        return kind(translation_domain=DOMAIN, translation_key="update_failed", translation_placeholders={"error": str(err)})
    return kind(translation_domain=DOMAIN, translation_key="bad_answer", translation_placeholders={"error": str(err)})


async def fetch(call: Awaitable[_T], *, entry: BamBuddyConfigEntry | None = None, kind: type[HomeAssistantError] = UpdateFailed) -> _T:
    """A read for a coordinator: any failure marks the data unavailable
    until the next poll (`kind`). A refused one (401, 403) goes to the
    entry's key guard, which checks the key -- the guard alone starts a
    reauthentication, so a 401 BamBuddy answers for a moment, or a route it
    refuses despite every scope, asks for no new key; a 401 says so only
    once the guard confirmed it. During the setup (`entry` not loaded yet)
    the setup's own check ran a moment before. A read that works tells the
    guard too: a key it stands refused on may be fine again."""
    runtime: BamBuddyData | None = getattr(entry, "runtime_data", None) if entry is not None else None
    try:
        answer = await call
    except (BamBuddyAuthError, BamBuddyPermissionError) as err:
        if runtime is not None:
            runtime.key.async_read_refused(err)
        if isinstance(err, BamBuddyAuthError):
            # A doubt until the guard confirmed it a minute later.
            key = "auth_failed" if runtime is not None and runtime.key.refused else "key_doubted"
            raise kind(translation_domain=DOMAIN, translation_key=key) from err
        raise kind(translation_domain=DOMAIN, translation_key="bambuddy_refused", translation_placeholders={"error": err.detail}) from err
    except BamBuddyError as err:
        raise failure(err, kind) from err
    if runtime is not None:
        runtime.key.async_read_worked()
    return answer


@callback
def async_schedule_reload(hass: HomeAssistant, entry: BamBuddyConfigEntry) -> None:
    """One reload for the entry, however many parts of it ask for one."""
    runtime: BamBuddyData | None = getattr(entry, "runtime_data", None)
    if runtime is not None:
        if runtime.reloading:
            return
        runtime.reloading = True
    hass.config_entries.async_schedule_reload(entry.entry_id)


def _issue_part(key: str) -> str:
    """A printer in an issue's ID: Home Assistant writes the IDs of the
    domain's issues into every diagnostics download -- not its serial number
    (the issue's data keeps the key)."""
    return hashlib.sha256(key.encode()).hexdigest()[:12]


def _missing_prefix(entry_id: str) -> str:
    return f"printer_missing_{entry_id}_"


def _names_prefix(entry_id: str) -> str:
    return f"names_from_bambuddy_{entry_id}_"


def _renames_prefix(entry_id: str) -> str:
    return f"ams_ids_renamed_{entry_id}_"


def issue_prefixes(entry_id: str) -> tuple[str, str, str]:
    """The beginnings of an entry's "printer missing", names and renamed
    AMS entity IDs notices."""
    return _missing_prefix(entry_id), _names_prefix(entry_id), _renames_prefix(entry_id)


def _run_counts(hass: HomeAssistant, name: str) -> dict[tuple[str, ...], int]:
    """A count kept for this run: how often each (entry, printer[, AMS serial])
    was held for a reload ("ams_holds"), or reloaded for a chamber BamBuddy
    reported late ("chamber_reloads")."""
    counts: dict[tuple[str, ...], int] = hass.data.setdefault(DOMAIN, {}).setdefault(name, {})
    return counts


def names_issue(entry_id: str, key: str) -> str:
    """The notice that a printer's names come from BamBuddy: one per printer."""
    return f"{_names_prefix(entry_id)}{_issue_part(key)}"


def renames_issue(entry_id: str, key: str) -> str:
    """The notice of a printer's AMS entity IDs that followed their unit's serial."""
    return f"{_renames_prefix(entry_id)}{_issue_part(key)}"


def missing_issue(entry_id: str, key: str) -> str:
    """By the printer's key: BamBuddy's numbers may change under it."""
    return f"{_missing_prefix(entry_id)}{_issue_part(key)}"


@callback
def async_raise_missing_issue(hass: HomeAssistant, entry_id: str, key: str, name: str) -> None:
    """BamBuddy no longer has a printer this entry shows: a repair issue
    tells the user to remove it here as well."""
    ir.async_create_issue(
        hass,
        DOMAIN,
        missing_issue(entry_id, key),
        is_fixable=True,
        severity=ir.IssueSeverity.WARNING,
        translation_key="printer_missing",
        translation_placeholders={"printer": name},
        data={"entry_id": entry_id, "key": key},
    )


def create_client(hass: HomeAssistant, entry: BamBuddyConfigEntry) -> BamBuddyClient:
    """The client for an entry's BamBuddy, with its key and certificate check."""
    return BamBuddyClient(
        entry.data[CONF_URL],
        entry.data[CONF_API_KEY],
        async_get_clientsession(hass),
        verify_ssl=entry.data.get(CONF_VERIFY_SSL, True),
    )


@callback
def async_remove_printer(hass: HomeAssistant, entry: BamBuddyConfigEntry, printer: dict[str, Any]) -> None:
    """A stored printer out of the entry's options; the entry reloads."""
    printers: list[dict[str, Any]] = entry.options.get(CONF_PRINTERS, [])
    hass.config_entries.async_update_entry(
        entry, options={**entry.options, CONF_PRINTERS: [other for other in printers if other is not printer]}
    )


def printer_identifier(entry_id: str, key: str) -> tuple[str, str]:
    """A printer device's identifier, by the printer's key (its serial)."""
    return (DOMAIN, f"{entry_id}_printer_{key}")


def ams_identifier(entry_id: str, printer: str, unit: str) -> tuple[str, str]:
    """An AMS unit's device identifier, by its printer's key and its own."""
    return (DOMAIN, f"{entry_id}_printer_{printer}_ams_{unit}")


def ams_identifier_prefix(entry_id: str, printer: str) -> str:
    """What every AMS unit's identifier of the printer starts with."""
    return ams_identifier(entry_id, printer, "")[1]


def _type_known(data: PrinterData, unit: dict[str, Any]) -> bool:
    """Whether an AMS unit's type can be trusted: BamBuddy read the versions,
    the unit reports it, or its id tells it."""
    return bool(data.status.get("firmware_version") or unit.get("module_type") or ams_type_by_place(unit))


def find_device(hass: HomeAssistant, entry_id: str, identifier: tuple[str, str]) -> dr.DeviceEntry | None:
    """The entry's device with this identifier (async_get_device by
    identifiers is deprecated from Home Assistant 2026.8 on)."""
    return next(
        (
            device
            for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry_id)
            if identifier in device.identifiers
        ),
        None,
    )


def stored_name(hass: HomeAssistant, entry_id: str, printer: dict[str, Any]) -> str:
    """A stored printer's name: its device's of now -- BamBuddy may have
    renamed it since --, else the stored one."""
    device = find_device(hass, entry_id, printer_identifier(entry_id, stored_key(printer)))
    return device.name if device is not None and device.name else str(printer[CONF_PRINTER_NAME])


class BamBuddyPrinterCoordinator(DataUpdateCoordinator[PrinterData]):
    """One printer's status, every 10 seconds; once a minute its AMS units'
    names and BamBuddy's details of it (its name, address, a model entered
    since, and whether the number still is this printer); every ten minutes
    and after a print its maintenance tasks and print hours."""

    config_entry: BamBuddyConfigEntry

    def __init__(
        self,
        hass: HomeAssistant,
        entry: BamBuddyConfigEntry,
        client: BamBuddyClient,
        info: dict[str, Any],
    ) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            # The log names it as the user knows it, not by BamBuddy's number.
            name=f"{DOMAIN} {short_name(info)}",
            update_interval=PRINTER_INTERVAL,
        )
        self.client = client
        self.info = info
        self.printer_id: int = info["id"]
        # The unique IDs of the entities this setup built for the printer,
        # and whether its model changed since the last: then the entities
        # the model no longer has leave the registry.
        self.created: set[str] = set()
        # What the chamber was just told, for its locks.
        self.chamber_sent = ChamberSent(lambda: dt_util.utcnow().timestamp())
        self.model_changed = False
        # What the device and the entities are known by: the serial number.
        self.key = printer_key(info)
        # The names given in Home Assistant that went back to BamBuddy's --
        # those an earlier setup reset too: the notice keeps listing them.
        issue = ir.async_get(hass).async_get_issue(DOMAIN, names_issue(entry.entry_id, self.key))
        given = (issue.translation_placeholders or {}).get("given") if issue else None
        self._given: list[str] = given.split("\n- ") if given else []
        self._firmware: str | None = None
        self._refresh_later: CALLBACK_TYPE | None = None
        self._hours: float | None = None
        # Since when each AMS place waits: for its unit's serial number, or
        # with the serial for the unit's type.
        self._waiting_since: dict[int, float] = {}
        # Serials of AMS units this coordinator holds for a reload (`rekey_source`).
        self._held: set[str] = set()
        # The printer's K profiles per nozzle diameter, when last listed.
        self.kprofiles: dict[str, tuple[float, list[dict[str, Any]]]] = {}
        # The camera's frame rate the user chose; None: its most.
        self.camera_fps: int | None = None
        # The fan kits BamBuddy reported at setup (`PrinterData.fan_kits`).
        self._kits_at_setup: frozenset[str] = frozenset()
        self._chamber_at_setup: frozenset[str] = frozenset()
        self._minutely_read = -MINUTELY_INTERVAL
        # The AMS units' names in BamBuddy by place; None until read in this run.
        self.ams_labels: dict[int, str] | None = None
        self._maintenance: dict[str, Any] | None = None
        self._maintenance_read = -MAINTENANCE_INTERVAL
        # A print ended: its hours count -- read the tasks again.
        self._maintenance_due = False
        # Counts the reads after marking a task done: an older read answering
        # later is dropped.
        self._maintenance_generation = 0
        # Renamed in BamBuddy: the devices follow at the next draw of data.
        self._names_due = False
        # BamBuddy had not reached the printer at setup: its parts come with
        # the first full status, through one reload.
        self._blank_at_setup = False
        # BamBuddy lists another printer under this number now: nothing
        # passes until the reload finds this one again by its serial.
        self.replaced = False
        # Commands sent so far: a poll during which one went out may bring
        # the state from before it.
        self._commands = 0
        self._again_later: CALLBACK_TYPE | None = None
        # Reads on a push of BamBuddy's live connection: how far apart (the
        # entry's setting), when the last began, whether one runs, whether
        # another is wanted, the timer for it.
        self._push_gap: float = PUSH_GAP
        self._push_started = float("-inf")
        self._push_running = False
        self._push_pending = False
        self._push_later: CALLBACK_TYPE | None = None
        self._shut_down = False
        self._reading = asyncio.Lock()

    def note_command(self) -> None:
        """A command goes out now: a poll already under way may answer with
        the state from before it, and a toggle would jump back."""
        self._commands += 1

    async def _async_update_data(self) -> PrinterData:
        # One read at a time, in the order they began: a read that started
        # later applies later. Home Assistant 2025.5 runs a coordinator's
        # refreshes side by side -- a poll that answered before a change
        # could otherwise undo the push read that brought it.
        async with self._reading:
            return await self._async_read_printer()

    async def _async_read_printer(self) -> PrinterData:
        if self.replaced:
            raise self._replaced_error()
        commands = self._commands
        try:
            # The minute's reads and the maintenance beside the status, not
            # after it: a slow one delays this refresh by no more than its own read.
            status, read, _ = await asyncio.gather(self._read_status(), self._read_minutely(), self._read_maintenance())
        except UpdateFailed as err:
            # Gone from BamBuddy's list: the entry reloads now and its repair
            # tells -- no error to log, the last values stand until then.
            if isinstance(err.__cause__, BamBuddyNotFoundError) and await self._look_up() and self.data is not None:
                return self.data
            raise
        # Another name under this number: renamed in BamBuddy, or another
        # printer -- ask now, not at the next minute.
        named = status.get("name")
        if not read and self.data is not None and isinstance(named, str) and named.strip() and named != self.info.get("name"):
            await self._read_details()
            self._names_due = True
        if self.replaced:
            raise self._replaced_error()
        if self.data is not None and self.data.state in JOB_STATES and status.get("state") not in JOB_STATES:
            self._maintenance_due = True
        if commands != self._commands and self.data is not None:
            # From before the command: the read soon after it tells.
            return self.data
        data = PrinterData(self.info, status, self._hours, self._maintenance)
        if self.data is None:
            self._blank_at_setup = data.blank
            self._kits_at_setup = data.fan_kits()
            self._chamber_at_setup = data.chamber_parts()
        elif self._blank_at_setup and not data.blank:
            self._blank_at_setup = False
            self._schedule_reload()
        elif not data.fan_kits() <= self._kits_at_setup:
            # A fan kit BamBuddy learnt of after the setup: its fan comes with one reload.
            self._kits_at_setup = data.fan_kits()
            self._schedule_reload()
        elif not data.chamber_parts() <= self._chamber_at_setup:
            self._chamber_at_setup = data.chamber_parts()
            self._reload_for_chamber()
        self._follow_serials(data)
        self._follow_firmware(data)
        if read or self._names_due:
            self._names_due = False
            self.async_name_devices(data)
        return data

    def _follow_serials(self, data: PrinterData) -> None:
        now = self.hass.loop.time()
        # BamBuddy reads the AMS serials and types with the printer's
        # firmware version (get_version): with the version there, a unit
        # without a serial will not get one (BamBuddy drops the AMS Lite's,
        # maziggy/bambuddy#3348). Before it, a unit waits for its serial,
        # and for its type -- BamBuddy may take the serial from the unit's
        # report first, and the model goes into its entity IDs for good --
        # unless its id tells the type (an AMS HT; place 6, the A2L's Lite).
        versions_read = bool(data.status.get("firmware_version"))
        waiting = {part_id(unit) for unit in data.ams_units if not versions_read and not (ams_serial(unit) and _type_known(data, unit))}
        self._waiting_since = {place: self._waiting_since.get(place, now) for place in waiting}

    def rekey_source(self, unit: dict[str, Any], *, holding: bool = False) -> dr.DeviceEntry | None:
        """The device of the unit's place that this unit, now with a serial,
        is: the setup moves it to the serial, so the unit keeps its device
        and history. None where it is no such unit: no serial, a device for
        the serial already (the unit came back), a place device that holds
        a serial, another model at the place, a type still unknown (a
        guessed model must not merge two units) -- or, for a hold
        (`holding`), three reloads in this run that did not settle it."""
        serial = ams_serial(unit)
        if serial is None:
            return None
        if not _type_known(self.data, unit):
            return None
        entry_id = self.config_entry.entry_id
        if find_device(self.hass, entry_id, self.ams_identifier(serial)) is not None:
            return None
        device = find_device(self.hass, entry_id, self.ams_identifier(str(part_id(unit))))
        if device is None or device.serial_number:
            return None
        model = ams_model(unit, self.data)
        # BamBuddy names no model for the printer: its AMS Lite was "AMS" by
        # its place, a guess where it reports no firmware (a real AMS does).
        guessed = not self.info.get("model") and device.model == "AMS" and not device.sw_version
        if device.model != model and not (guessed and model == "AMS Lite"):
            return None
        holds = _run_counts(self.hass, "ams_holds")
        if holding and serial not in self._held and holds.get((entry_id, self.key, serial), 0) >= RELOADS_PER_RUN:
            _LOGGER.warning(
                "The AMS unit %s of %s got its serial number, but %s reloads did not move it to it: it gets its entities as a new device",
                serial,
                self.short_name,
                RELOADS_PER_RUN,
            )
            return None
        return device

    def ams_unit_ready(self, unit: dict[str, Any]) -> bool:
        """Whether an AMS unit can get its entities: with its serial number,
        or after waiting a minute for one -- right after BamBuddy connects
        it reports a unit without, and a unit known by its place first and
        by its serial a moment later would be two devices. A unit known by
        its place that now reports its serial waits for the entry's reload:
        the next setup moves its device and entities to the serial."""
        place = part_id(unit)
        serial = ams_serial(unit)
        since = self._waiting_since.get(place)
        if since is not None and self.hass.loop.time() - since < AMS_SERIAL_WAIT:
            # Waiting for its serial, or with it for its type. A unit known
            # before -- by its serial, or without one by its place -- has
            # nothing to wait for.
            return find_device(self.hass, self.config_entry.entry_id, self.ams_identifier(serial or str(place))) is not None
        if serial is not None and self.rekey_source(unit, holding=True) is not None:
            if serial not in self._held:
                # Counted once a run, however often the platforms ask.
                self._held.add(serial)
                holds = _run_counts(self.hass, "ams_holds")
                key = (self.config_entry.entry_id, self.key, serial)
                holds[key] = holds.get(key, 0) + 1
                _LOGGER.debug("The AMS unit %s of %s got its serial number: the entry reloads", serial, self.short_name)
                self._schedule_reload()
            return False
        return True

    @property
    def printer_name(self) -> str:
        """The device name, after the printer's name in BamBuddy."""
        return printer_name(self.info)

    @property
    def short_name(self) -> str:
        """The printer's name in BamBuddy, else its model: for texts and the
        log, which name no serial (the diagnostics leave it out)."""
        return short_name(self.info)

    @property
    def frame_rate(self) -> int:
        """The camera's frame rate: the one chosen, where the camera gives
        it, else its most."""
        most = camera_max_fps(self.info)
        chosen = self.camera_fps
        return chosen if chosen is not None and CAMERA_MIN_FPS <= chosen <= most else most

    @property
    def identifier(self) -> tuple[str, str]:
        """The printer device's identifier."""
        return printer_identifier(self.config_entry.entry_id, self.key)

    def ams_identifier(self, unit_key: str) -> tuple[str, str]:
        """The identifier of the device of the printer's AMS unit `unit_key`."""
        return ams_identifier(self.config_entry.entry_id, self.key, unit_key)

    def ams_identifier_prefix(self) -> str:
        """What the identifiers of all the printer's AMS unit devices begin with."""
        return ams_identifier_prefix(self.config_entry.entry_id, self.key)

    def entity_unique_id(self, key: str) -> str:
        """What the printer's entity `key` is known by: the entry, the
        printer's serial number and the key."""
        return f"{self.config_entry.entry_id}_p{self.key}_{key}"

    async def _read_status(self) -> dict[str, Any]:
        # A method of its own: the request comes into being only when its
        # task runs, so a reload cutting the refresh short leaves none behind.
        return await fetch(self.client.get_status(self.printer_id), entry=self.config_entry)

    async def _read_minutely(self) -> bool:
        """Its AMS units' names in BamBuddy and its details (`_read_details`:
        the printer's name among them), once a minute -- True then; without
        them the status goes on and each keeps its last value."""
        now = self.hass.loop.time()
        if now - self._minutely_read < MINUTELY_INTERVAL:
            return False
        self._minutely_read = now
        await self._read_ams_labels()
        # Not at setup: it has just read BamBuddy's printer list.
        if self.data is not None:
            await self._read_details()
        return True

    async def _read_ams_labels(self) -> None:
        """The names the user gave the AMS units in BamBuddy. A failed read
        keeps the last; until one succeeds in this run, `ams_labels` stays
        None and the units' devices keep the names they have."""
        try:
            self.ams_labels = await self.client.get_ams_labels(self.printer_id)
        except BamBuddyError as err:
            _LOGGER.debug("No AMS names for %s: %s", self.short_name, err)

    async def _read_maintenance(self) -> None:
        """The printer's maintenance tasks and its print hours (BamBuddy's
        runtime counter plus its offset, `total_print_hours`, in 1.2.5.7 and
        1.3.0 alike -- 1.3.0 has no `runtime-debug`), every ten minutes and
        after a print: a read can write to BamBuddy's database. A failed
        read keeps the last; an answer without hours keeps the last hours."""
        now = self.hass.loop.time()
        if not self._maintenance_due and now - self._maintenance_read < MAINTENANCE_INTERVAL:
            return
        self._maintenance_due = False
        self._maintenance_read = now
        generation = self._maintenance_generation
        try:
            maintenance = await self.client.get_maintenance(self.printer_id)
        except BamBuddyError as err:
            _LOGGER.debug("No maintenance for %s: %s", self.short_name, err)
            return
        if generation == self._maintenance_generation:
            self._maintenance = maintenance
            hours = maintenance.get("total_print_hours")
            if isinstance(hours, int | float) and not isinstance(hours, bool):
                self._hours = float(hours)

    async def async_reread_maintenance(self) -> None:
        """The tasks now, after one was marked done. Only they change: the
        printer's status -- failed or not -- stays as last read."""
        self._maintenance_generation += 1
        self._maintenance_due = True
        await self._read_maintenance()
        if self.data is not None:
            self.data = replace(self.data, hours=self._hours, maintenance=self._maintenance)
            self.async_update_listeners()

    async def _read_details(self) -> None:
        """BamBuddy's details of the printer under its number. Is it still
        this printer? SQLite gives a new printer the number of a deleted
        newest one, a restored database numbers anew -- commands would reach
        another printer. Then its address, and a model: a printer added in
        BamBuddy without one (it comes from the add dialog or the network
        discovery) gets it once someone enters it there; the entry reloads,
        and the device, its name and the model's entities follow."""
        try:
            info = await self.client.get_printer(self.printer_id)
        except BamBuddyError as err:
            _LOGGER.debug("No printer details for %s: %s", self.short_name, err)
            return
        serial = str(info.get("serial_number") or "").strip()
        known = str(self.info.get("serial_number") or "").strip()
        if serial and known and serial != known:
            _LOGGER.debug("BamBuddy lists another printer under the number of %s", self.short_name)
            self.replaced = True
            self._schedule_reload()
            return
        model = str(info.get("model") or "").strip()
        # A model that comes later, or another one (corrected in BamBuddy): the device and the model's
        # entities follow with one reload.
        new_model = bool(model) and model_key(model) != model_key(self.info.get("model"))
        had_rate_setting = camera_max_fps(self.info) > CAMERA_MIN_FPS
        # Kept at once: a refresh before the reload neither asks nor reloads again.
        name = str(info.get("name") or "").strip()
        self.info = {
            **self.info,
            "ip_address": info.get("ip_address"),
            **({"model": model} if model else {}),
            # Renamed in BamBuddy: the status says so at once, the name follows.
            **({"name": name} if name else {}),
            # A camera BamBuddy takes from elsewhere, switched on or off: its
            # most frames a second follow (never logged: its address).
            "external_camera_enabled": info.get("external_camera_enabled"),
            "external_camera_url": info.get("external_camera_url"),
        }
        # The frame rate setting comes or goes with a reload, as a model's entities.
        if new_model or had_rate_setting != (camera_max_fps(self.info) > CAMERA_MIN_FPS):
            self._schedule_reload()

    async def _look_up(self) -> bool:
        """BamBuddy has no printer under this number: deleted, or numbered
        anew (a restored database). Its list tells: the reload finds the
        printer by its serial, or raises the issue and looks for it once a
        minute, as at setup -- now, not at the next restart. Still listed
        under this number, or no list: the next poll asks again. True when
        the reload is on its way."""
        try:
            listed = await self.client.get_printers()
        except BamBuddyError as err:
            _LOGGER.debug("No printer list after a 404 for %s: %s", self.short_name, err)
            return False
        stored: list[dict[str, Any]] = self.config_entry.options.get(CONF_PRINTERS, [])
        found = dict(zip((stored_key(printer) for printer in stored), find_printers(listed, stored), strict=True))
        info = found.get(self.key)
        if info is None or info.get("id") != self.printer_id:
            _LOGGER.debug("BamBuddy no longer lists %s under its number: the entry reloads", self.short_name)
            self._schedule_reload()
            return True
        return False

    def _replaced_error(self) -> UpdateFailed:
        return UpdateFailed(
            translation_domain=DOMAIN, translation_key="printer_replaced", translation_placeholders={"printer": self.short_name}
        )

    def _schedule_reload(self) -> None:
        async_schedule_reload(self.hass, self.config_entry)

    def _reload_for_chamber(self) -> None:
        """BamBuddy reports a chamber temperature or heater the setup had not: BamBuddy was updated
        (1.3 gives the H2D Pro and the X1E theirs, maziggy/bambuddy#3335), or the printer had not
        reported at setup. Their entities come with one reload, at most `RELOADS_PER_RUN` a run."""
        reloads = _run_counts(self.hass, "chamber_reloads")
        key = (self.config_entry.entry_id, self.key)
        if reloads.get(key, 0) >= RELOADS_PER_RUN:
            return
        reloads[key] = reloads.get(key, 0) + 1
        _LOGGER.debug("BamBuddy reports a chamber for %s that the setup had not: the entry reloads", self.short_name)
        self._schedule_reload()

    @callback
    def async_name_devices(self, data: PrinterData) -> None:
        """BamBuddy's name is the one: the printer's and its
        AMS units' device names follow it, and a name given in Home
        Assistant goes back to it. An AMS device stands for its unit (by
        its serial): its letter follows the place it is plugged in now, its
        model and firmware what it reports; an unplugged one keeps what was
        known."""
        self.name = f"{DOMAIN} {self.short_name}"
        registry = dr.async_get(self.hass)
        entry_id = self.config_entry.entry_id
        printer = self.identifier
        units = self.ams_identifier_prefix()
        reported = {ams_key(unit): unit for unit in data.ams_units}
        for device in dr.async_entries_for_config_entry(registry, entry_id):
            details: dict[str, str | None] = {}
            if printer in device.identifiers:
                details["name"] = self.printer_name
            else:
                unit_key = next(
                    (key.removeprefix(units) for domain, key in device.identifiers if domain == DOMAIN and key.startswith(units)),
                    None,
                )
                if unit_key is None:
                    continue
                unit = reported.get(unit_key)
                if unit is not None:
                    model = ams_model(unit, data)
                    details["model"] = model
                    details["serial_number"] = unit.get("serial_number") or None
                    details["sw_version"] = unit.get("sw_ver") or None
                    # Its name in BamBuddy, else the letter of the place it is
                    # plugged in now -- once the names are read in this run.
                    if self.ams_labels is not None:
                        place = part_id(unit)
                        details["name"] = ams_name(self.info, place, model, details["serial_number"], self.ams_labels.get(place))
            changed = {key: value for key, value in details.items() if getattr(device, key) != value}
            if device.name_by_user is not None:
                self._tell_names_come_from_bambuddy(device.name_by_user)
            elif printer in device.identifiers and "name" in changed and self._given:
                # Renamed in BamBuddy: the notice's title follows.
                self._tell_names_come_from_bambuddy()
            if changed or device.name_by_user is not None:
                registry.async_update_device(device.id, name_by_user=None, **changed)  # type: ignore[arg-type]

    @callback
    def _tell_names_come_from_bambuddy(self, given: str | None = None) -> None:
        """A name given in Home Assistant went back to BamBuddy's: say why,
        once -- in Repairs, where the user can dismiss it for good. One
        notice per printer, naming every name that went back (the printer's
        and its AMS units'), under the printer's name of now."""
        if given is not None and given not in self._given:
            self._given.append(given)
        ir.async_create_issue(
            self.hass,
            DOMAIN,
            names_issue(self.config_entry.entry_id, self.key),
            is_fixable=False,
            is_persistent=False,
            severity=ir.IssueSeverity.WARNING,
            translation_key="names_from_bambuddy",
            # A list in the text: one name a line.
            translation_placeholders={"given": "\n- ".join(self._given), "name": self.printer_name},
        )

    def _follow_firmware(self, data: PrinterData) -> None:
        """Home Assistant reads a device's details when its first entity is
        added; a firmware update afterwards reaches the device page here."""
        firmware = data.status.get("firmware_version")
        if not firmware or firmware == self._firmware:
            return
        self._firmware = firmware
        device = find_device(self.hass, self.config_entry.entry_id, self.identifier)
        if device is not None and device.sw_version != firmware:
            dr.async_get(self.hass).async_update_device(device.id, sw_version=firmware)

    async def async_wait_for(self, check: Callable[[PrinterData], bool], timeout: float, interval: float) -> bool:
        """Read the status every `interval` until `check` holds or `timeout`
        has passed (the first read after one interval: the printer reports a
        command a moment after BamBuddy passed it on); whether it held."""
        waited = 0.0
        while waited < timeout:
            await asyncio.sleep(interval)
            waited += interval
            await self.async_refresh()
            if self.data is not None and check(self.data):
                return True
        return False

    @callback
    def async_refresh_soon(self) -> None:
        """Read the status again shortly after a command, and once more a
        little later: BamBuddy answers as soon as it passed the command on,
        the printer reports back later -- and BamBuddy's live connection
        tells of some results never. A new command starts both anew."""
        self._cancel_command_reads()
        self._refresh_later = async_call_later_until_stop(self.hass, REFRESH_AFTER_COMMAND, self._async_refresh_now)
        self._again_later = async_call_later_until_stop(self.hass, REFRESH_AFTER_COMMAND_AGAIN, self._async_refresh_again)

    async def _async_refresh_now(self, _now: datetime) -> None:
        self._refresh_later = None
        # Not async_request_refresh: its debouncer waits ten seconds after
        # the last refresh -- a second command would show that late.
        await self.async_refresh()

    async def _async_refresh_again(self, _now: datetime) -> None:
        self._again_later = None
        await self.async_refresh()

    @callback
    def _cancel_command_reads(self) -> None:
        for cancel in (self._refresh_later, self._again_later):
            if cancel:
                cancel()
        self._refresh_later = self._again_later = None

    @callback
    def async_pushed(self) -> None:
        """BamBuddy's live connection tells of a change of the printer: read
        it now -- at most once per `push_gap`; what comes meanwhile is read
        once after. Never a read cut short: its entities would go unavailable."""
        runtime = getattr(self.config_entry, "runtime_data", None)
        if self._shut_down or self.hass.is_stopping or self.replaced or (runtime is not None and runtime.reloading):
            return
        self._push_pending = True
        self._async_push_next()

    @callback
    def _async_push_next(self) -> None:
        # Home Assistant stops: it cancelled the background tasks before it
        # said so -- a read or a timer started now would outlive them.
        if not self._push_pending or self._push_running or self._push_later is not None or self._shut_down or self.hass.is_stopping:
            return
        wait = self._push_started + self._push_gap - self.hass.loop.time()
        if wait > 0:
            self._push_later = async_call_later_until_stop(self.hass, wait, self._async_push_due)
            return
        self._push_pending = False
        self._push_running = True
        self._push_started = self.hass.loop.time()
        # A task of its own, never inside a refresh (the coordinator's lock
        # is not re-entrant); the entry ends it with its unload.
        self.config_entry.async_create_background_task(self.hass, self._async_push_read(), f"{self.name} push read")

    @property
    def push_gap(self) -> float:
        return self._push_gap

    @push_gap.setter
    def push_gap(self, seconds: float) -> None:
        """Configure's new gap: a read that waits takes it at once."""
        self._push_gap = seconds
        if self._push_later is not None:
            self._push_later()
            self._push_later = None
            self._async_push_next()

    @callback
    def _async_push_due(self, _now: datetime) -> None:
        self._push_later = None
        self._async_push_next()

    async def _async_push_read(self) -> None:
        try:
            await self.async_refresh()
        finally:
            self._push_running = False
            self._async_push_next()

    async def async_shutdown(self) -> None:
        self._shut_down = True
        self._cancel_command_reads()
        if self._push_later:
            self._push_later()
            self._push_later = None
        await super().async_shutdown()


class _BamBuddyCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """A coordinator of BamBuddy's own: its name and interval."""

    config_entry: BamBuddyConfigEntry

    def __init__(
        self, hass: HomeAssistant, entry: BamBuddyConfigEntry, client: BamBuddyClient, name: str, interval: timedelta
    ) -> None:
        super().__init__(hass, _LOGGER, config_entry=entry, name=f"{DOMAIN} {name}", update_interval=interval)
        self.client = client


class BamBuddyInstanceCoordinator(_BamBuddyCoordinator):
    """BamBuddy's own figures: the print statistics every minute; version,
    printers online and disk every five -- for them BamBuddy walks through
    its whole archive. A new version shows on its device."""

    def __init__(self, hass: HomeAssistant, entry: BamBuddyConfigEntry, client: BamBuddyClient) -> None:
        super().__init__(hass, entry, client, "instance", INSTANCE_INTERVAL)
        self._system: dict[str, Any] = {}
        self._system_read: float | None = None
        # The setup's read: the printers wait for it.
        self._at_setup = True

    async def _async_update_data(self) -> dict[str, Any]:
        at_setup, self._at_setup = self._at_setup, False
        now = self.hass.loop.time()
        if self._system_read is None or now - self._system_read >= SYSTEM_INTERVAL.total_seconds():
            self._system_read = now
            try:
                # At setup the printers wait for it: 10 s there, 30 s later.
                self._system = await fetch(self.client.get_system_info(patient=not at_setup), entry=self.config_entry)
                self._follow_version(self._system)
            except UpdateFailed as err:
                # Its archive walk is BamBuddy's slowest answer: the last one
                # stands -- none yet: its figures stay unknown until the next
                # read --, and the statistics still come.
                _LOGGER.debug("BamBuddy's system information failed (%s); its figures wait for the next read", err)
        try:
            stats = await fetch(self.client.get_statistics(patient=not at_setup), entry=self.config_entry)
        except UpdateFailed as err:
            cause = err.__cause__
            if not at_setup and (
                isinstance(cause, BamBuddyApiError) or (isinstance(cause, BamBuddyConnectionError) and timed_out(cause))
            ):
                # BamBuddy took the request but did not finish it (it asks
                # every smart plug in turn): the last statistics stand --
                # none yet: they stay unknown.
                _LOGGER.debug("BamBuddy's statistics failed (%s); the last ones stand", err)
                stats = self.data["stats"] if self.data is not None else {}
            else:
                raise
        return {"system": self._system, "stats": stats}

    def _follow_version(self, system: dict[str, Any]) -> None:
        version = (system.get("app") or {}).get("version")
        registry = dr.async_get(self.hass)
        device = find_device(self.hass, self.config_entry.entry_id, (DOMAIN, self.config_entry.entry_id))
        if version and device is not None and device.sw_version != version:
            registry.async_update_device(device.id, sw_version=version)


class BamBuddyUpdateCoordinator(_BamBuddyCoordinator):
    """New versions of BamBuddy and of the printers' firmware, every six
    hours: each check makes BamBuddy ask GitHub and Bambu Lab. Each check
    on its own: one that fails keeps its last answer (none yet: its
    entities are unavailable) and is asked again after a quarter of an
    hour; both failing without an answer fail the refresh."""

    def __init__(self, hass: HomeAssistant, entry: BamBuddyConfigEntry, client: BamBuddyClient) -> None:
        super().__init__(hass, entry, client, "updates", UPDATE_INTERVAL)
        self._answers: dict[str, dict[str, Any]] = {}

    async def _async_update_data(self) -> dict[str, Any]:
        failed: UpdateFailed | None = None
        for key, read in (("bambuddy", self.client.get_update_check), ("firmware", self.client.get_firmware_updates)):
            try:
                self._answers[key] = await fetch(read(), entry=self.config_entry)
            except UpdateFailed as err:
                _LOGGER.debug("BamBuddy's %s check failed (%s); asked again in %s", key, err, UPDATE_RETRY_INTERVAL)
                failed = err
        self.update_interval = UPDATE_INTERVAL if failed is None else UPDATE_RETRY_INTERVAL
        if failed is not None and not self._answers:
            raise failed
        firmware = self._answers.get("firmware")
        return {
            "bambuddy": self._answers.get("bambuddy"),
            "firmware": None
            if firmware is None
            else {
                update["printer_id"]: update
                for update in firmware.get("updates") or []
                if isinstance(update, dict) and "printer_id" in update
            },
        }


@dataclass
class BamBuddyData:
    """What a loaded entry keeps: the client, the coordinators and the key's
    guard (the key has every scope the integration needs: the setup
    refuses any other)."""

    client: BamBuddyClient
    instance: BamBuddyInstanceCoordinator
    updates: BamBuddyUpdateCoordinator
    printers: dict[int, BamBuddyPrinterCoordinator]
    # The smart plugs of the printers.
    plugs: BamBuddyPlugCoordinator
    # BamBuddy's spool inventory: which spool sits in which slot.
    inventory: BamBuddyInventoryCoordinator
    key: KeyGuard
    # BamBuddy's authentication on or off (None: it did not say), for the diagnostics.
    auth_enabled: bool | None
    # BamBuddy's live connection (switched on after the platforms, as
    # Configure's settings say).
    live: BamBuddyLive
    # What a reload of the entry depends on, as the setup took it: a change
    # of anything else -- Configure's settings -- is taken in place.
    basis: tuple[Any, ...]
    # The switch-offs after the print, by plug.
    auto_offs: dict[int, AutoOff] = field(default_factory=dict)
    # A reload of the entry is on its way (`async_schedule_reload`): nothing starts a second one.
    reloading: bool = False
    # The devices of the printers BamBuddy does not list (each waits under
    # Repairs), for the card: it tells them from a BamBuddy without answer.
    missing: list[str] = field(default_factory=list)
