"""Polling BamBuddy: one coordinator per printer for its live status, one for
the instance's figures, one for the update checks."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable
from dataclasses import dataclass
from datetime import datetime
import logging
from typing import Any, TypeVar

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import BamBuddyAuthError, BamBuddyClient, BamBuddyError, BamBuddyNotFoundError, BamBuddyPermissionError
from .const import (
    AMS_SERIAL_WAIT,
    DOMAIN,
    INSTANCE_INTERVAL,
    PRINTER_INTERVAL,
    REFRESH_AFTER_COMMAND,
    RUNTIME_INTERVAL,
    UPDATE_INTERVAL,
)
from .models import PrinterData, ams_key, ams_model, ams_name, printer_key, printer_name

_LOGGER = logging.getLogger(__name__)

_T = TypeVar("_T")

type BamBuddyConfigEntry = ConfigEntry[BamBuddyData]


async def _fetch(call: Awaitable[_T]) -> _T:
    """A read for a coordinator: a refused key starts a reauthentication,
    anything else marks the data unavailable until the next poll."""
    try:
        return await call
    except (BamBuddyAuthError, BamBuddyPermissionError) as err:
        raise ConfigEntryAuthFailed(translation_domain=DOMAIN, translation_key="auth_failed") from err
    except BamBuddyError as err:
        raise UpdateFailed(
            translation_domain=DOMAIN,
            translation_key="update_failed",
            translation_placeholders={"error": str(err)},
        ) from err


def missing_issue(entry_id: str, key: str) -> str:
    """By the printer's key: BamBuddy's numbers may change under it."""
    return f"printer_missing_{entry_id}_{key}"


@callback
def async_raise_missing_issue(hass: HomeAssistant, entry_id: str, key: str, printer_name: str) -> None:
    """BamBuddy no longer has a printer this entry shows: a repair issue
    tells the user to remove it here as well."""
    ir.async_create_issue(
        hass,
        DOMAIN,
        missing_issue(entry_id, key),
        is_fixable=True,
        severity=ir.IssueSeverity.WARNING,
        translation_key="printer_missing",
        translation_placeholders={"printer": printer_name},
        data={"entry_id": entry_id, "key": key},
    )


def printer_identifier(entry_id: str, key: str) -> tuple[str, str]:
    """A printer device's identifier, by the printer's key (its serial)."""
    return (DOMAIN, f"{entry_id}_printer_{key}")


class BamBuddyPrinterCoordinator(DataUpdateCoordinator[PrinterData]):
    """One printer's status, every 10 seconds. What BamBuddy knows about the
    printer itself (model, serial, address) comes once, at setup."""

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
        self._hours_read = -RUNTIME_INTERVAL

    async def _async_update_data(self) -> PrinterData:
        try:
            # The runtime counter once a minute, beside the status: it must
            # not delay the status, nor the read after a command.
            status, read = await asyncio.gather(self._read_status(), self._read_hours())
        except UpdateFailed as err:
            if isinstance(err.__cause__, BamBuddyNotFoundError):
                # Deleted in BamBuddy: tell the user now, not at the next restart.
                async_raise_missing_issue(self.hass, self.config_entry.entry_id, self.key, self.printer_name)
            raise
        data = PrinterData(self.info, status, self._hours)
        self._follow_serials(data)
        self._follow_firmware(data)
        if read:
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
        entry_id = self.config_entry.entry_id
        identifier = (DOMAIN, f"{printer_identifier(entry_id, self.key)[1]}_ams_{place}")
        return any(
            identifier in device.identifiers
            for device in dr.async_entries_for_config_entry(dr.async_get(self.hass), entry_id)
        )

    @property
    def printer_name(self) -> str:
        """The device name, after the printer's name in BamBuddy."""
        return printer_name(self.info)

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
        name = runtime.get("printer_name")
        if isinstance(name, str) and name.strip() and name != self.info.get("name"):
            self.info = {**self.info, "name": name}
        # Not at setup: it has just read BamBuddy's printer list.
        if self.data is not None and not str(self.info.get("model") or "").strip():
            await self._ask_for_model()
        return True

    async def _ask_for_model(self) -> None:
        """A printer added in BamBuddy without a model (BamBuddy does not
        detect it: it comes from the add dialog or the network discovery) is
        asked again with the runtime counter. Once someone enters it there,
        the entry reloads: the device, its name and the model's entities
        follow."""
        try:
            info = await self.client.get_printer(self.printer_id)
        except BamBuddyError as err:
            _LOGGER.debug("No printer details for %s: %s", self.printer_name, err)
            return
        model = str(info.get("model") or "").strip()
        if model:
            # Kept at once: a refresh before the reload neither asks nor reloads again.
            self.info = {**self.info, "model": model}
            # One reload for the entry, however many printers found theirs.
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
        Assistant goes back to it. An AMS device stands for its place (AMS
        A, B …): a unit swapped in there brings its own model, serial and
        firmware; an unplugged one keeps what was known."""
        registry = dr.async_get(self.hass)
        entry_id = self.config_entry.entry_id
        printer = printer_identifier(entry_id, self.key)
        units = f"{entry_id}_printer_{self.key}_ams_"
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
            if changed or device.name_by_user is not None:
                registry.async_update_device(device.id, name_by_user=None, **changed)  # type: ignore[arg-type]

    def _follow_firmware(self, data: PrinterData) -> None:
        """Home Assistant reads a device's details when its first entity is
        added; a firmware update afterwards reaches the device page here."""
        firmware = data.status.get("firmware_version")
        if not firmware or firmware == self._firmware:
            return
        self._firmware = firmware
        registry = dr.async_get(self.hass)
        identifier = printer_identifier(self.config_entry.entry_id, self.key)
        for device in dr.async_entries_for_config_entry(registry, self.config_entry.entry_id):
            if identifier in device.identifiers and device.sw_version != firmware:
                registry.async_update_device(device.id, sw_version=firmware)

    @callback
    def async_refresh_soon(self) -> None:
        """Read the status again shortly after a command: BamBuddy answers as
        soon as it passed the command on, the printer reports back later."""
        if self._refresh_later:
            self._refresh_later()
        self._refresh_later = async_call_later(self.hass, REFRESH_AFTER_COMMAND, self._async_refresh_now)

    async def _async_refresh_now(self, _now: datetime) -> None:
        self._refresh_later = None
        await self.async_request_refresh()

    async def async_shutdown(self) -> None:
        if self._refresh_later:
            self._refresh_later()
            self._refresh_later = None
        await super().async_shutdown()


class BamBuddyInstanceCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """BamBuddy's own figures: version, printers online, disk, the print
    statistics. Every minute: the system information costs BamBuddy a
    tenth of a second of CPU and a walk through its archive."""

    config_entry: BamBuddyConfigEntry

    def __init__(self, hass: HomeAssistant, entry: BamBuddyConfigEntry, client: BamBuddyClient) -> None:
        super().__init__(
            hass, _LOGGER, config_entry=entry, name=f"{DOMAIN} instance", update_interval=INSTANCE_INTERVAL
        )
        self.client = client

    async def _async_update_data(self) -> dict[str, Any]:
        return {
            "system": await _fetch(self.client.get_system_info()),
            "stats": await _fetch(self.client.get_statistics()),
        }


class BamBuddyUpdateCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """New versions of BamBuddy and of the printers' firmware, every six
    hours: each check makes BamBuddy ask GitHub and Bambu Lab."""

    config_entry: BamBuddyConfigEntry

    def __init__(self, hass: HomeAssistant, entry: BamBuddyConfigEntry, client: BamBuddyClient) -> None:
        super().__init__(
            hass, _LOGGER, config_entry=entry, name=f"{DOMAIN} updates", update_interval=UPDATE_INTERVAL
        )
        self.client = client

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


@dataclass
class BamBuddyData:
    """What a loaded entry keeps: the client, the coordinators, and whether
    the key may control printers."""

    client: BamBuddyClient
    instance: BamBuddyInstanceCoordinator
    updates: BamBuddyUpdateCoordinator
    printers: dict[int, BamBuddyPrinterCoordinator]
    can_control: bool
    # A printer found its model: the reload that brings it is on its way.
    reloading: bool = False
