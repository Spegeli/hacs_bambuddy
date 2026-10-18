"""Polling BamBuddy: one coordinator per printer for its live status, one for
the instance's figures, one for the update checks."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
import logging
from typing import TYPE_CHECKING, Any, TypeVar

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryAuthFailed, HomeAssistantError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import (
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
    CONF_PRINTERS,
    CONF_URL,
    CONF_VERIFY_SSL,
    DOMAIN,
    INSTANCE_INTERVAL,
    MAINTENANCE_INTERVAL,
    PLUG_INTERVAL,
    PLUG_LIST_INTERVAL,
    PRINTER_INTERVAL,
    REFRESH_AFTER_COMMAND,
    REFRESH_AFTER_PLUG,
    RUNTIME_INTERVAL,
    SYSTEM_INTERVAL,
    UPDATE_INTERVAL,
)
from .models import (
    CAMERA_MIN_FPS,
    JOB_STATES,
    PrinterData,
    ams_key,
    ams_model,
    ams_name,
    camera_max_fps,
    printer_key,
    printer_name,
    short_name,
)
from .plugs import ENERGY_FIELDS, Plug, plug_device_name, plug_identifier, sort_plugs

if TYPE_CHECKING:
    from .auto_off import AutoOff

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


async def _fetch(call: Awaitable[_T]) -> _T:
    """A read for a coordinator: a refused key starts a reauthentication,
    anything else marks the data unavailable until the next poll."""
    try:
        return await call
    except (BamBuddyAuthError, BamBuddyPermissionError) as err:
        raise ConfigEntryAuthFailed(translation_domain=DOMAIN, translation_key="auth_failed") from err
    except BamBuddyError as err:
        raise failure(err, UpdateFailed) from err


def missing_issue(entry_id: str, key: str) -> str:
    """By the printer's key: BamBuddy's numbers may change under it."""
    return f"printer_missing_{entry_id}_{key}"


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


class BamBuddyPrinterCoordinator(DataUpdateCoordinator[PrinterData]):
    """One printer's status, every 10 seconds; once a minute its print hours,
    its name in BamBuddy and BamBuddy's details of it (address, a model
    entered since, and whether the number still is this printer)."""

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
            name=f"{DOMAIN} printer {info['id']}",
            update_interval=PRINTER_INTERVAL,
        )
        self.client = client
        self.info = info
        self.printer_id: int = info["id"]
        # What the device and the entities are known by: the serial number.
        self.key = printer_key(info)
        self._firmware: str | None = None
        self._refresh_later: CALLBACK_TYPE | None = None
        self._hours: float | None = None
        # Since when each AMS place reports a unit without a serial number.
        self._unserialised: dict[int, float] = {}
        # The printer's K profiles per nozzle diameter, when last listed.
        self.kprofiles: dict[str, tuple[float, list[dict[str, Any]]]] = {}
        # The camera's frame rate the user chose; None: its most.
        self.camera_fps: int | None = None
        self._hours_read = -RUNTIME_INTERVAL
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

    def note_command(self) -> None:
        """A command goes out now: a poll already under way may answer with
        the state from before it, and a toggle would jump back."""
        self._commands += 1

    async def _async_update_data(self) -> PrinterData:
        if self.replaced:
            raise self._replaced_error()
        commands = self._commands
        try:
            # The runtime counter once a minute, beside the status: it must
            # not delay the status, nor the read after a command.
            status, read, _ = await asyncio.gather(self._read_status(), self._read_hours(), self._read_maintenance())
        except UpdateFailed as err:
            if isinstance(err.__cause__, BamBuddyNotFoundError):
                # Deleted in BamBuddy: tell the user now, not at the next restart.
                async_raise_missing_issue(self.hass, self.config_entry.entry_id, self.key, self.printer_name)
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
        elif self._blank_at_setup and not data.blank:
            self._blank_at_setup = False
            self._schedule_reload()
        self._follow_serials(data)
        self._follow_firmware(data)
        if read or self._names_due:
            self._names_due = False
            self.async_name_devices(data)
        return data

    def _follow_serials(self, data: PrinterData) -> None:
        now = self.hass.loop.time()
        waiting = {int(unit.get("id", 0)) for unit in data.ams_units if not str(unit.get("serial_number") or "").strip()}
        self._unserialised = {place: self._unserialised.get(place, now) for place in waiting}

    def ams_unit_ready(self, unit: dict[str, Any]) -> bool:
        """Whether an AMS unit can get its entities: with its serial number,
        or after waiting a minute for one -- right after BamBuddy connects
        it reports a unit without, and a unit known by its place first and
        by its serial a moment later would be two devices."""
        place = int(unit.get("id", 0))
        since = self._unserialised.get(place)
        if since is None or self.hass.loop.time() - since >= AMS_SERIAL_WAIT:
            return True
        # A unit known by its place before has no serial to wait for.
        return find_device(self.hass, self.config_entry.entry_id, self.ams_identifier(str(place))) is not None

    @property
    def printer_name(self) -> str:
        """The device name, after the printer's name in BamBuddy."""
        return printer_name(self.info)

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

    async def _read_status(self) -> dict[str, Any]:
        # A method of its own: the request comes into being only when its
        # task runs, so a reload cutting the refresh short leaves none behind.
        return await _fetch(self.client.get_status(self.printer_id))

    async def _read_hours(self) -> bool:
        """The print hours and the printer's name in BamBuddy, once a
        minute -- True then; without them the status goes on and both keep
        their last value."""
        now = self.hass.loop.time()
        if now - self._hours_read < RUNTIME_INTERVAL:
            return False
        self._hours_read = now
        try:
            runtime = await self.client.get_runtime(self.printer_id)
        except BamBuddyError as err:
            _LOGGER.debug("No runtime counter for %s: %s", self.printer_name, err)
            runtime = {}
        hours = runtime.get("total_hours")
        if isinstance(hours, int | float):
            self._hours = float(hours)
        # Not at setup: it has just read BamBuddy's printer list. First:
        # still this printer? Only then its name.
        if self.data is not None:
            await self._read_details()
        name = runtime.get("printer_name")
        if not self.replaced and isinstance(name, str) and name.strip() and name != self.info.get("name"):
            self.info = {**self.info, "name": name}
        return True

    async def _read_maintenance(self) -> None:
        """The printer's maintenance tasks, every ten minutes and after a
        print: a read can write to BamBuddy's database. A failed read keeps
        the last."""
        now = self.hass.loop.time()
        if not self._maintenance_due and now - self._maintenance_read < MAINTENANCE_INTERVAL:
            return
        self._maintenance_due = False
        self._maintenance_read = now
        generation = self._maintenance_generation
        try:
            maintenance = await self.client.get_maintenance(self.printer_id)
        except BamBuddyError as err:
            _LOGGER.debug("No maintenance for %s: %s", self.printer_name, err)
            return
        if generation == self._maintenance_generation:
            self._maintenance = maintenance

    async def async_reread_maintenance(self) -> None:
        """The tasks now, after one was marked done. Only they change: the
        printer's status -- failed or not -- stays as last read."""
        self._maintenance_generation += 1
        self._maintenance_due = True
        await self._read_maintenance()
        if self.data is not None:
            self.data = replace(self.data, maintenance=self._maintenance)
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
            _LOGGER.debug("No printer details for %s: %s", self.printer_name, err)
            return
        serial = str(info.get("serial_number") or "").strip()
        known = str(self.info.get("serial_number") or "").strip()
        if serial and known and serial != known:
            _LOGGER.debug("BamBuddy lists another printer under the number of %s", self.printer_name)
            self.replaced = True
            self._schedule_reload()
            return
        model = str(info.get("model") or "").strip()
        new_model = bool(model) and not str(self.info.get("model") or "").strip()
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

    def _replaced_error(self) -> UpdateFailed:
        return UpdateFailed(
            translation_domain=DOMAIN, translation_key="printer_replaced", translation_placeholders={"printer": short_name(self.info)}
        )

    def _schedule_reload(self) -> None:
        """One reload for the entry, however many printers ask for it."""
        runtime: BamBuddyData | None = getattr(self.config_entry, "runtime_data", None)
        if runtime is not None:
            if runtime.reloading:
                return
            runtime.reloading = True
        self.hass.config_entries.async_schedule_reload(self.config_entry.entry_id)

    @callback
    def async_name_devices(self, data: PrinterData) -> None:
        """BamBuddy's name is the one (his decision): the printer's and its
        AMS units' device names follow it, and a name given in Home
        Assistant goes back to it. An AMS device stands for its unit (by
        its serial): its letter follows the place it is plugged in now, its
        model and firmware what it reports; an unplugged one keeps what was
        known."""
        registry = dr.async_get(self.hass)
        entry_id = self.config_entry.entry_id
        printer = self.identifier
        units = self.ams_identifier("")[1]
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
                    # The letter follows the place it is plugged in now.
                    details["name"] = ams_name(self.info, int(unit.get("id", 0)), model, details["serial_number"])
            changed = {key: value for key, value in details.items() if getattr(device, key) != value}
            if device.name_by_user is not None:
                self._tell_names_come_from_bambuddy(device.name_by_user, str(details.get("name") or device.name))
            if changed or device.name_by_user is not None:
                registry.async_update_device(device.id, name_by_user=None, **changed)  # type: ignore[arg-type]

    @callback
    def _tell_names_come_from_bambuddy(self, given: str, name: str) -> None:
        """A name given in Home Assistant went back to BamBuddy's (his
        decision): say why, once -- in Repairs, where the user can dismiss
        it for good."""
        ir.async_create_issue(
            self.hass,
            DOMAIN,
            f"names_from_bambuddy_{self.config_entry.entry_id}",
            is_fixable=False,
            is_persistent=False,
            severity=ir.IssueSeverity.WARNING,
            translation_key="names_from_bambuddy",
            translation_placeholders={"given": given, "name": name},
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

    @callback
    def async_refresh_soon(self) -> None:
        """Read the status again shortly after a command: BamBuddy answers as
        soon as it passed the command on, the printer reports back later."""
        if self._refresh_later:
            self._refresh_later()
        self._refresh_later = async_call_later(self.hass, REFRESH_AFTER_COMMAND, self._async_refresh_now)

    async def _async_refresh_now(self, _now: datetime) -> None:
        self._refresh_later = None
        # Not async_request_refresh: its debouncer waits ten seconds after
        # the last refresh -- a second command would show that late.
        await self.async_refresh()

    async def async_shutdown(self) -> None:
        if self._refresh_later:
            self._refresh_later()
            self._refresh_later = None
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

    async def _async_update_data(self) -> dict[str, Any]:
        now = self.hass.loop.time()
        if self._system_read is None or now - self._system_read >= SYSTEM_INTERVAL.total_seconds():
            self._system_read = now
            try:
                # At setup the printers wait for it: 10 s there, 30 s later.
                self._system = await _fetch(self.client.get_system_info(patient=self.data is not None))
                self._follow_version(self._system)
            except UpdateFailed as err:
                # Its archive walk is BamBuddy's slowest answer: the last one
                # stands -- none yet: its figures stay unknown until the next
                # read --, and the statistics still come.
                _LOGGER.debug("BamBuddy's system information failed (%s); its figures wait for the next read", err)
        return {"system": self._system, "stats": await _fetch(self.client.get_statistics())}

    def _follow_version(self, system: dict[str, Any]) -> None:
        version = (system.get("app") or {}).get("version")
        registry = dr.async_get(self.hass)
        device = find_device(self.hass, self.config_entry.entry_id, (DOMAIN, self.config_entry.entry_id))
        if version and device is not None and device.sw_version != version:
            registry.async_update_device(device.id, sw_version=version)


class BamBuddyUpdateCoordinator(_BamBuddyCoordinator):
    """New versions of BamBuddy and of the printers' firmware, every six
    hours: each check makes BamBuddy ask GitHub and Bambu Lab."""

    def __init__(self, hass: HomeAssistant, entry: BamBuddyConfigEntry, client: BamBuddyClient) -> None:
        super().__init__(hass, entry, client, "updates", UPDATE_INTERVAL)

    async def _async_update_data(self) -> dict[str, Any]:
        firmware = await _fetch(self.client.get_firmware_updates())
        return {
            "bambuddy": await _fetch(self.client.get_update_check()),
            "firmware": {
                update["printer_id"]: update
                for update in firmware.get("updates") or []
                if isinstance(update, dict) and "printer_id" in update
            },
        }


class BamBuddyPlugCoordinator(DataUpdateCoordinator[dict[int, Plug]]):
    """The smart plugs BamBuddy links to the printers set up here: its list
    once a minute, each plug's state every 15 s. A key that may not read
    plugs sees none -- no reauthentication for it; a plug that does not
    answer is unknown, the others go on."""

    config_entry: BamBuddyConfigEntry

    def __init__(
        self,
        hass: HomeAssistant,
        entry: BamBuddyConfigEntry,
        client: BamBuddyClient,
        printers: dict[int, BamBuddyPrinterCoordinator],
    ) -> None:
        super().__init__(hass, _LOGGER, config_entry=entry, name=f"{DOMAIN} plugs", update_interval=PLUG_INTERVAL)
        self.client = client
        self.printers = printers
        self._listed: list[dict[str, Any]] = []
        self._listed_at: float | None = None
        # The figures each plug has reported once: only those get a sensor.
        self._seen: dict[int, set[str]] = {}
        # What each linked plug is: a change (moved to another printer, no
        # longer powering it, another kind) reloads the entry.
        self._roles: dict[int, tuple[int | None, bool, str]] | None = None
        # Since when a plug is on, once it went from off to on: the card
        # counts while the printer starts.
        self._on_since: dict[int, datetime] = {}
        self._commands = 0
        self._refresh_later: CALLBACK_TYPE | None = None
        # Whether the key may read BamBuddy's plug list.
        self.readable = True

    def note_command(self) -> None:
        """A switch goes out now: a read already under way may bring the
        state from before it."""
        self._commands += 1

    async def _async_update_data(self) -> dict[int, Plug]:
        commands = self._commands
        now = self.hass.loop.time()
        if self._listed_at is None or now - self._listed_at >= PLUG_LIST_INTERVAL:
            listed = await self._read_list()
            # A key that may not read the list sees none -- which is no
            # list that lost its plugs.
            self.readable = listed is not None
            self._listed = listed or []
            self._listed_at = now
            self._follow_names()
            if listed is not None:
                self._follow_roles()
        linked = [info for info in self._listed if info.get("printer_id") in self.printers]
        # Home Assistant's start waits for the first read: 5 s per plug then.
        patient = self.data is not None
        statuses = await asyncio.gather(*(self._read_status(int(info["id"]), patient) for info in linked))
        if commands != self._commands and self.data is not None:
            # From before the switch: the read soon after it tells.
            return self.data
        plugs = {int(info["id"]): Plug(info, status) for info, status in zip(linked, statuses, strict=True)}
        for plug in plugs.values():
            self._seen.setdefault(plug.id, set()).update(field for field in ENERGY_FIELDS if plug.figure(field) is not None)
            self._follow_power(plug)
        return plugs

    def _follow_power(self, plug: Plug) -> None:
        before = self.data.get(plug.id) if self.data else None
        if plug.state is True and before is not None and before.state is False:
            self._on_since[plug.id] = dt_util.utcnow()
        elif plug.state is False:
            self._on_since.pop(plug.id, None)

    @callback
    def async_switched(self, plug_id: int, on: bool) -> None:
        """BamBuddy took a switch: the plug's new state shows at once -- off,
        BamBuddy marks its printer offline at once too --, the read soon after
        confirms it. A script runs and stays as it is."""
        plug = (self.data or {}).get(plug_id)
        if plug is None or plug.kind != "switch":
            return
        # The plug's reading, not a printer's status.
        reading: dict[str, Any] = {**(plug.status or {}), "reachable": True, "state": "ON" if on else "OFF"}
        energy = reading.get("energy")
        if not on and isinstance(energy, dict) and energy.get("power") is not None:
            # Off draws nothing.
            reading["energy"] = {**energy, "power": 0.0}
        switched = Plug(plug.info, reading)
        self._follow_power(switched)
        self.async_set_updated_data({**(self.data or {}), plug_id: switched})

    def on_since(self, plug_id: int) -> datetime | None:
        """When the plug went from off to on, while it stays on."""
        return self._on_since.get(plug_id)

    def _follow_roles(self) -> None:
        """A plug moved to another printer in BamBuddy, no longer powering
        it, of another kind, or deleted there: its device, its card and its
        switch-off after the print follow through one reload (a deleted
        one's device goes then, his word)."""
        roles: dict[int, tuple[int | None, bool, str]] = {
            plug.id: (plug.printer_id, plug.powers_printer, plug.kind)
            for plug in map(Plug, self._listed)
            if plug.printer_id in self.printers or plug.id in (self._roles or {})
        }
        changed = self._roles is not None and (
            any(self._roles.get(plug_id, role) != role for plug_id, role in roles.items())
            or any(plug_id not in roles for plug_id in self._roles)
        )
        self._roles = roles
        if changed:
            _LOGGER.debug("A smart plug changed its printer or role in BamBuddy, or was deleted there: the entry reloads")
            runtime: BamBuddyData | None = getattr(self.config_entry, "runtime_data", None)
            if runtime is not None and runtime.reloading:
                return
            if runtime is not None:
                runtime.reloading = True
            self.hass.config_entries.async_schedule_reload(self.config_entry.entry_id)

    async def _read_list(self) -> list[dict[str, Any]] | None:
        try:
            listed = await self.client.get_smart_plugs()
        except BamBuddyPermissionError:
            _LOGGER.debug("The API key may not read BamBuddy's smart plugs")
            return None
        except BamBuddyAuthError as err:
            raise ConfigEntryAuthFailed(translation_domain=DOMAIN, translation_key="auth_failed") from err
        except BamBuddyError as err:
            raise failure(err, UpdateFailed) from err
        return [info for info in listed if isinstance(info, dict) and isinstance(info.get("id"), int)]

    async def _read_status(self, plug_id: int, patient: bool) -> dict[str, Any] | None:
        try:
            return await self.client.get_plug_status(plug_id, patient=patient)
        except BamBuddyError as err:
            _LOGGER.debug("No status of smart plug %s: %s", plug_id, err)
            return None

    def plugs_of(self, printer_id: int) -> list[Plug]:
        """A printer's plugs: the one that powers it first, then by name."""
        return sort_plugs([plug for plug in (self.data or {}).values() if plug.printer_id == printer_id])

    def reported(self, plug_id: int, field: str) -> bool:
        """Whether the plug has reported this figure once."""
        return field in self._seen.get(plug_id, set())

    def identifier(self, plug_id: int) -> tuple[str, str]:
        return plug_identifier(self.config_entry.entry_id, plug_id)

    def device_name(self, plug: Plug) -> str:
        printer = self.printers.get(plug.printer_id or -1)
        return plug_device_name(short_name(printer.info), plug) if printer else plug.name

    def _follow_names(self) -> None:
        """Renamed in BamBuddy -- the plug or its printer: the device follows."""
        registry = dr.async_get(self.hass)
        for info in self._listed:
            plug = Plug(info)
            device = find_device(self.hass, self.config_entry.entry_id, self.identifier(plug.id))
            name = self.device_name(plug)
            if device is not None and device.name != name:
                registry.async_update_device(device.id, name=name)

    @callback
    def async_refresh_soon(self) -> None:
        """Read the plugs again shortly after a switch."""
        if self._refresh_later:
            self._refresh_later()
        self._refresh_later = async_call_later(self.hass, REFRESH_AFTER_PLUG, self._async_refresh_now)

    async def _async_refresh_now(self, _now: datetime) -> None:
        self._refresh_later = None
        await self.async_refresh()

    async def async_shutdown(self) -> None:
        if self._refresh_later:
            self._refresh_later()
            self._refresh_later = None
        await super().async_shutdown()


@dataclass
class BamBuddyData:
    """What a loaded entry keeps: the client, the coordinators, and whether
    the key may control printers."""

    client: BamBuddyClient
    instance: BamBuddyInstanceCoordinator
    updates: BamBuddyUpdateCoordinator
    printers: dict[int, BamBuddyPrinterCoordinator]
    can_control: bool
    # The key may mark maintenance done ("Manage Maintenance").
    can_manage_maintenance: bool = False
    # The smart plugs of the printers; the key may switch them.
    plugs: BamBuddyPlugCoordinator | None = None
    can_control_plugs: bool = False
    # The switch-offs after the print, by plug.
    auto_offs: dict[int, AutoOff] = field(default_factory=dict)
    # A printer found its model: the reload that brings it is on its way.
    reloading: bool = False
