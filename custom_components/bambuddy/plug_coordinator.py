"""The smart plugs' coordinator: the plugs BamBuddy links to the printers
set up here, their list and each one's state."""
from __future__ import annotations

import asyncio
from datetime import datetime
import logging
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .api import BamBuddyClient, BamBuddyError
from .const import DOMAIN, PLUG_INTERVAL, PLUG_LIST_INTERVAL, REFRESH_AFTER_PLUG
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator, async_schedule_reload, fetch, find_device
from .models import short_name
from .plug_identity import PlugIdentity, device_identifier, entity_unique_id, identities, known_from_registry
from .plugs import ENERGY_FIELDS, Plug, main_of, plug_device_name
from .timers import async_call_later_until_stop

_LOGGER = logging.getLogger(__name__)


class BamBuddyPlugCoordinator(DataUpdateCoordinator[dict[int, Plug]]):
    """The smart plugs BamBuddy links to the printers set up here: its list
    once a minute, each plug's state every 15 s. A refused list goes to the
    key guard, as every read; a plug that does not answer is unknown, the
    others go on."""

    config_entry: BamBuddyConfigEntry

    def __init__(
        self,
        hass: HomeAssistant,
        entry: BamBuddyConfigEntry,
        client: BamBuddyClient,
        printers: dict[int, BamBuddyPrinterCoordinator],
        secret: bytes,
    ) -> None:
        super().__init__(hass, _LOGGER, config_entry=entry, name=f"{DOMAIN} plugs", update_interval=PLUG_INTERVAL)
        self.client = client
        self.printers = printers
        self._secret = secret
        # The linked plugs as the integration knows them: what they switch
        # (their entities) and their BamBuddy record (their device).
        self.identities: dict[int, PlugIdentity] = {}
        # What the entities were built from: the setup's identities (None:
        # its list read failed), and those of plugs added later.
        self.built: dict[int, PlugIdentity] | None = None
        self._planned = False
        self._listed: list[dict[str, Any]] = []
        self._listed_at: float | None = None
        # The figures each plug has reported once: only those get a sensor.
        self._seen: dict[int, set[str]] = {}
        # What each linked plug is: a change (moved to another printer, no
        # longer powering it, another kind) reloads the entry.
        self._roles: dict[int, tuple[int | None, bool, str, bool]] | None = None
        # Since when a plug is on, once it went from off to on: the card
        # counts while the printer starts.
        self._on_since: dict[int, datetime] = {}
        self._commands = 0
        self._refresh_later: CALLBACK_TYPE | None = None

    def note_command(self) -> None:
        """A switch goes out now: a read already under way may bring the
        state from before it."""
        self._commands += 1

    async def _async_update_data(self) -> dict[int, Plug]:
        commands = self._commands
        now = self.hass.loop.time()
        # Half a read's slack: the reads come a little more than 15 seconds
        # apart, so the third of them is due -- within a minute.
        if self._listed_at is None or now - self._listed_at >= PLUG_LIST_INTERVAL - PLUG_INTERVAL.total_seconds() / 2:
            self._listed = await self._read_list()
            self._listed_at = now
            self._follow_identities_of(self._listed)
            self._follow_names()
            self._follow_identities()
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

    @callback
    def async_built(self, identities: dict[int, PlugIdentity] | None) -> None:
        """The setup's identities, which its entities are built from."""
        self.built = identities
        self._planned = True

    def note_built(self, plug_id: int) -> None:
        """A plug linked while the entry runs got its entities: its changes
        reload from now on, as a plug the setup built."""
        identity = self.identities.get(plug_id)
        if self.built is not None and identity is not None:
            self.built.setdefault(plug_id, identity)

    def _follow_identities(self) -> None:
        """What a built plug switches changed, it was created anew, it
        ranks otherwise among plugs that switch the same, it is gone, or its
        role changed: one reload builds it anew. A setup that could not read
        the list built nothing: the first list read reloads it."""
        changed = self._roles_changed()
        if self._planned:
            if self.built is None:
                changed = True
            else:
                changed = changed or any(
                    (now := self.identities.get(plug_id)) is None or not now.same_as(built) for plug_id, built in self.built.items()
                )
        if changed:
            _LOGGER.debug("A smart plug changed what it switches, its record, its printer or its role in BamBuddy: the entry reloads")
            async_schedule_reload(self.hass, self.config_entry)

    def _roles_changed(self) -> bool:
        """A plug moved to another printer in BamBuddy, no longer powering
        it, of another kind, no longer or now the printer's own, or deleted
        there: its device, its card and its switch-off after the print follow
        through one reload (a deleted one's device goes then)."""
        listed = [Plug(info) for info in self._listed]
        roles: dict[int, tuple[int | None, bool, str, bool]] = {
            plug.id: (plug.printer_id, plug.powers_printer, plug.kind, main_of(listed, plug.printer_id) == plug.id)
            for plug in listed
            if plug.printer_id in self.printers or plug.id in (self._roles or {})
        }
        changed = self._roles is not None and (
            any(self._roles.get(plug_id, role) != role for plug_id, role in roles.items())
            or any(plug_id not in roles for plug_id in self._roles)
        )
        self._roles = roles
        return changed

    async def _read_list(self) -> list[dict[str, Any]]:
        return await fetch(self.client.get_smart_plugs(), entry=self.config_entry)

    async def _read_status(self, plug_id: int, patient: bool) -> dict[str, Any] | None:
        try:
            return await self.client.get_plug_status(plug_id, patient=patient)
        except BamBuddyError as err:
            _LOGGER.debug("No status of smart plug %s: %s", plug_id, err)
            return None

    def reported(self, plug_id: int, field: str) -> bool:
        """Whether the plug has reported this figure once."""
        return field in self._seen.get(plug_id, set())

    def _follow_identities_of(self, listed: list[dict[str, Any]]) -> None:
        """The linked plugs' identities, from what was known of them: the
        last read's, else the registry's (a part an answer lacks keeps it)."""
        known = known_from_registry(self.hass, self.config_entry.entry_id)
        known.update({plug_id: identity.known() for plug_id, identity in self.identities.items()})
        linked = [info for info in listed if info.get("printer_id") in self.printers]
        self.identities = identities(self._secret, linked, known)

    def identity(self, plug_id: int) -> PlugIdentity | None:
        return self.identities.get(plug_id)

    def identifier(self, plug_id: int) -> tuple[str, str] | None:
        """A linked plug's device identifier: its BamBuddy record."""
        identity = self.identities.get(plug_id)
        return device_identifier(self.config_entry.entry_id, identity) if identity else None

    def entity_unique_id(self, plug_id: int, key: str) -> str | None:
        """A linked plug's entity's unique ID: what it switches."""
        identity = self.identities.get(plug_id)
        return entity_unique_id(self.config_entry.entry_id, identity, key) if identity else None

    def main_plug(self, printer_id: int | None) -> int | None:
        """The printer's own plug: BamBuddy's choice among the plugs that
        power it (`Plug.main_rank`); None where none does."""
        return main_of((self.data or {}).values(), printer_id)

    def printer_of(self, plug: Plug) -> BamBuddyPrinterCoordinator | None:
        """The coordinator of the printer set up here that the plug belongs to."""
        return self.printers.get(plug.printer_id or -1)

    def device_name(self, plug: Plug) -> str:
        printer = self.printer_of(plug)
        return plug_device_name(short_name(printer.info), plug) if printer else plug.name

    def _follow_names(self) -> None:
        """Renamed in BamBuddy -- the plug or its printer -- or another type
        (still a switch, so no reload): the device follows."""
        registry = dr.async_get(self.hass)
        for info in self._listed:
            plug = Plug(info)
            identifier = self.identifier(plug.id)
            if identifier is None:
                # Linked to no printer set up here: no device.
                continue
            device = find_device(self.hass, self.config_entry.entry_id, identifier)
            name = self.device_name(plug)
            if device is not None and (device.name, device.model) != (name, plug.model):
                registry.async_update_device(device.id, name=name, model=plug.model)

    @callback
    def async_refresh_soon(self) -> None:
        """Read the plugs again shortly after a switch."""
        if self._refresh_later:
            self._refresh_later()
        self._refresh_later = async_call_later_until_stop(self.hass, REFRESH_AFTER_PLUG, self._async_refresh_now)

    async def _async_refresh_now(self, _now: datetime) -> None:
        self._refresh_later = None
        await self.async_refresh()

    async def async_shutdown(self) -> None:
        if self._refresh_later:
            self._refresh_later()
            self._refresh_later = None
        await super().async_shutdown()
