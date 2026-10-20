"""The running entry's API key: checked every ten minutes and whenever
BamBuddy refuses a request, and the only place that starts a
reauthentication while the entry runs. A 401 counts only once a check a
minute or more after the first says so too -- BamBuddy also answers 401
when its key lookup fails for a moment -- and an unreachable BamBuddy never
asks for a new key. A check that finds the key fine again ends the
reauthentication asked for."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
import logging
from typing import TYPE_CHECKING, Literal

from homeassistant.config_entries import SOURCE_REAUTH
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_call_later, async_track_time_interval
from homeassistant.util import dt as dt_util

from .api import BamBuddyApiError, BamBuddyAuthError, BamBuddyClient, BamBuddyError, BamBuddyPermissionError, KeyScopes
from .const import DOMAIN, KEY_CHECK_INTERVAL, KEY_RETRY_DELAY

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry

_LOGGER = logging.getLogger(__name__)

# ok: every scope; unknown: BamBuddy does not know the key (401); owner: its
# owner is deactivated or gone (403); short: a scope missing; unreachable: no
# answer, a gateway's or BamBuddy's error, or an answer without permissions.
type KeyOutcome = Literal["ok", "unknown", "owner", "short", "unreachable"]

# A refused read asks for a check this soon: many reads fail together.
_SOON = 5.0


@dataclass(frozen=True)
class KeyCheck:
    """One check of the key: when, what it found, and the scopes BamBuddy
    reported (None without an answer)."""

    at: datetime
    outcome: KeyOutcome
    scopes: KeyScopes | None = None


async def async_check_key(client: BamBuddyClient) -> KeyCheck:
    """The key checked once, as an outcome."""
    try:
        scopes = await client.check_key()
    except BamBuddyAuthError:
        return KeyCheck(dt_util.utcnow(), "unknown")
    except BamBuddyPermissionError:
        return KeyCheck(dt_util.utcnow(), "owner")
    except BamBuddyError as err:
        _LOGGER.debug("The API key's check got no answer: %s", err)
        return KeyCheck(dt_util.utcnow(), "unreachable")
    return KeyCheck(dt_util.utcnow(), "short" if scopes.missing else "ok", scopes)


class KeyGuard:
    """The entry's key while it runs. `first`: the setup's check."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: BamBuddyClient, first: KeyCheck) -> None:
        self.hass = hass
        self.entry = entry
        self.client = client
        self.last = first
        self._lock = asyncio.Lock()
        self._retry: CALLBACK_TYPE | None = None
        self._soon: CALLBACK_TYPE | None = None
        # Unloaded: a check still running then acts on nothing -- the entry
        # has a new guard, with its own key, by then.
        self._active = True
        # The first 401 of a run of them, waiting for a check a minute later.
        self._doubted_at: datetime | None = None
        # The outcome last said in the log: a lasting one is said once.
        self._said: KeyOutcome = first.outcome
        # Routes BamBuddy refused although the key has every scope.
        self._warned: set[str] = set()
        # Reads refused since the last check, by route: named once it finds the key fine.
        self._refused_reads: dict[str, BamBuddyApiError] = {}

    @callback
    def async_start(self) -> None:
        """The check every ten minutes, for as long as the entry is loaded."""
        self.entry.async_on_unload(async_track_time_interval(self.hass, self._async_due, KEY_CHECK_INTERVAL))
        self.entry.async_on_unload(self._stop)

    @property
    def refused(self) -> bool:
        """BamBuddy's 401 confirmed: the key is gone, a new one asked for."""
        return self._said == "unknown"

    async def async_check(self) -> KeyCheck:
        """Check the key now -- or, while a check runs, await its result --
        and act on what it finds."""
        if self._lock.locked():
            async with self._lock:
                return self.last
        async with self._lock:
            if self._soon is not None:
                # This check is it.
                self._soon()
                self._soon = None
            refused, self._refused_reads = self._refused_reads, {}
            check = await async_check_key(self.client)
            self.last = check
            self._act(check)
            if check.outcome == "ok" and self._active:
                for err in refused.values():
                    self._warn(err)
            return check

    @callback
    def async_check_soon(self) -> None:
        """A check within a few seconds: BamBuddy refused a request."""
        if self._active and self._soon is None and not self._lock.locked():
            self._soon = async_call_later(self.hass, _SOON, self._async_soon)

    @callback
    def async_read_refused(self, err: BamBuddyApiError) -> None:
        """A read BamBuddy refused (401, 403): the key checked soon, unless a
        check under a minute old already answered it -- a read every few
        seconds would otherwise check the key as often. A 403 whose check
        finds the key fine names its route (once): BamBuddy refuses it for
        another reason."""
        if not self._active:
            return
        fresh = dt_util.utcnow() - self.last.at < KEY_RETRY_DELAY
        if isinstance(err, BamBuddyAuthError):
            # Doubted: its check a minute later is set; confirmed: the reauth is open.
            known = self._doubted_at is not None or (self.refused and fresh)
        else:
            known = fresh and (self.last.outcome in ("short", "owner") or (self.last.outcome == "ok" and err.path in self._warned))
        if known:
            return
        if not isinstance(err, BamBuddyAuthError):
            self._refused_reads[err.path] = err
        self.async_check_soon()

    async def async_refused(self, err: BamBuddyApiError) -> HomeAssistantError:
        """What to tell the user when BamBuddy refused a request (401 or
        403): the key checked says whether it is the cause."""
        check = await self.async_check()
        if check.outcome == "short" and check.scopes is not None:
            return _error("key_scopes_missing", check.scopes.marks())
        if check.outcome == "owner":
            return _error("key_owner_inactive")
        if check.outcome == "unknown":
            # Still doubted: checked again within a minute, no reauth yet.
            return _error("key_doubted" if self._doubted_at is not None else "auth_failed")
        if check.outcome == "ok":
            self._warn(err)
        # Fine, or no answer to the check: BamBuddy's own refusal is what to say.
        return _error("bambuddy_refused", {"error": err.detail})

    async def _async_due(self, _now: datetime) -> None:
        await self.async_check()

    async def _async_soon(self, _now: datetime) -> None:
        self._soon = None
        await self.async_check()

    async def _async_retry(self, _now: datetime) -> None:
        self._retry = None
        await self.async_check()

    @callback
    def _act(self, check: KeyCheck) -> None:
        if not self._active:
            return
        outcome = check.outcome
        if outcome == "unreachable":
            self._later(KEY_RETRY_DELAY)
            return
        if outcome == "unknown" and self._said != "unknown":
            # Not confirmed yet (a confirmed one holds until a check finds the key).
            if self._doubted_at is None:
                self._doubted_at = check.at
            waited = check.at - self._doubted_at
            if waited < KEY_RETRY_DELAY:
                # Confirmed only by a check a minute or more after the first.
                self._later(KEY_RETRY_DELAY - waited)
                return
        self._doubted_at = None
        self._cancel_retry()
        if outcome == "ok":
            if self._said != "ok":
                self._said = outcome
                self._end_reauth()
            return
        if outcome != self._said:
            self._said = outcome
            missing = ", ".join(check.scopes.missing) if check.scopes is not None else ""
            _LOGGER.warning(
                "The API key %s; Home Assistant asks for a new one",
                {
                    "unknown": "is not accepted by BamBuddy (checked twice, a minute apart)",
                    "owner": "belongs to a user BamBuddy deactivated or deleted",
                    "short": f"lacks permissions the integration needs: {missing}",
                }[outcome],
            )
        # Again at every check while it holds: Home Assistant ignores it
        # while the reauthentication is open.
        self.entry.async_start_reauth(self.hass)

    @callback
    def _end_reauth(self) -> None:
        """The key works again (its owner got the right back, a 401 that
        passed): the reauthentication asked for goes, with its repair."""
        flows = self.hass.config_entries.flow.async_progress_by_handler(
            DOMAIN, match_context={"entry_id": self.entry.entry_id, "source": SOURCE_REAUTH}
        )
        for flow in flows:
            self.hass.config_entries.flow.async_abort(flow["flow_id"])

    @callback
    def _warn(self, err: BamBuddyApiError) -> None:
        if err.path not in self._warned:
            self._warned.add(err.path)
            _LOGGER.warning(
                "BamBuddy refused %s (%s) although the API key has every permission the integration needs",
                err.path or "a request",
                err.detail,
            )

    @callback
    def _later(self, delay: timedelta) -> None:
        if self._active and self._retry is None:
            self._retry = async_call_later(self.hass, delay, self._async_retry)

    @callback
    def _cancel_retry(self) -> None:
        if self._retry is not None:
            self._retry()
            self._retry = None

    @callback
    def _stop(self) -> None:
        self._active = False
        self._cancel_retry()
        if self._soon is not None:
            self._soon()
            self._soon = None


def _error(key: str, placeholders: dict[str, str] | None = None) -> HomeAssistantError:
    return HomeAssistantError(translation_domain=DOMAIN, translation_key=key, translation_placeholders=placeholders)
