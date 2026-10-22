"""BamBuddy's live connection: its WebSocket tells of every change of a
printer, and the integration reads that printer's status then -- at most
once per the entry's gap (`BamBuddyPrinterCoordinator.async_pushed`;
Configure -> Settings -> Live updates). The messages' own data is not
taken: it lacks fields the status has and differs in some. The poll
every 10 s goes on whatever the socket does."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from datetime import datetime
import json
import logging
import random
from typing import TYPE_CHECKING, Any, NamedTuple

import aiohttp

from homeassistant.core import CALLBACK_TYPE, HassJob, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.util import dt as dt_util

from .api import (
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyBadAnswerError,
    BamBuddyClient,
    BamBuddyError,
    BamBuddyNotJsonError,
)
from .const import CONF_LIVE_UPDATES, CONF_PUSH_GAP, LIVE_BACKOFF, LIVE_STEADY, LIVE_TEST_TIMEOUT, PUSH_GAP, PUSH_GAPS

if TYPE_CHECKING:
    from .coordinator import BamBuddyConfigEntry

_LOGGER = logging.getLogger(__name__)

# What tells of a change of a printer. BamBuddy sends more (archives,
# spools, its queue's toasts): none of it is the printer's state.
_PUSHES = frozenset({"printer_status", "print_start", "print_complete"})
# Code 1000: a close in order; none: the socket simply ended.
_ORDERLY = (None, 1000)


class LiveSettings(NamedTuple):
    """Configure -> Settings -> Live updates."""

    enabled: bool
    push_gap: int


def live_settings(options: Mapping[str, Any]) -> LiveSettings:
    """The entry's settings as Configure stores them; anything else -- the
    options edited by hand -- reads as the defaults (on, a second)."""
    enabled = options.get(CONF_LIVE_UPDATES, True)
    gap = options.get(CONF_PUSH_GAP, PUSH_GAP)
    return LiveSettings(
        enabled if isinstance(enabled, bool) else True,
        gap if type(gap) is int and gap in PUSH_GAPS else PUSH_GAP,
    )


def failure_kind(err: BaseException) -> str:
    """What failed, by kind -- for the diagnostics, the log and Configure's
    test. Never BamBuddy's own text, never an error's text of its own: it
    may carry the URL with the token. The order matters: the first two are
    API errors too."""
    if isinstance(err, BamBuddyBadAnswerError):
        return "no token in the answer"
    if isinstance(err, BamBuddyNotJsonError):
        # A page instead of BamBuddy's answer: a proxy's, say.
        return "not BamBuddy's answer"
    if isinstance(err, BamBuddyApiError):
        return f"HTTP {err.status}"
    if isinstance(err, BamBuddyError):
        # Its text names the request and the kind of failure, never the URL.
        return str(err)
    return type(err).__name__


async def async_test(client: BamBuddyClient) -> None:
    """Configure's test: a token and the socket's handshake, within ten
    seconds, then the socket closed at once. Raises what failed."""
    async with asyncio.timeout(LIVE_TEST_TIMEOUT):
        socket = await client.open_socket(await client.get_ws_token())
    await socket.close()


class BamBuddyLive:
    """One socket per entry. Between two attempts nothing runs but a timer;
    an attempt is a short task, and only an open socket keeps it running."""

    def __init__(self, hass: HomeAssistant, entry: BamBuddyConfigEntry, client: BamBuddyClient) -> None:
        self.hass = hass
        self.entry = entry
        self.client = client
        self._socket: aiohttp.ClientWebSocketResponse | None = None
        self._later: CALLBACK_TYPE | None = None
        self._stopped = False
        # Switched on in Configure (the setup applies the setting).
        self._enabled = False
        # The running attempt, and its number: an attempt that is not the
        # newest -- switched off and on again while it closed -- touches nothing.
        self._task: asyncio.Task[None] | None = None
        self._generation = 0
        # Attempts since the last steady connection: how long the next wait is.
        self._failures = 0
        # BamBuddy did not know the key at the last attempt: the key guard
        # heard of it. A token it keeps from a key whose owner may not
        # connect (403) is no fault of the key: the integration polls on.
        self._refused = False
        self._connected_since: datetime | None = None
        self._last_message: datetime | None = None
        self._messages = 0
        self._other_printers = 0
        self._ignored = 0
        self._connections = 0
        self._last_error: str | None = None

    @property
    def connected(self) -> bool:
        return self._socket is not None and not self._socket.closed

    @property
    def enabled(self) -> bool:
        return self._enabled

    @callback
    def async_set_enabled(self, enabled: bool) -> None:
        """Configure's switch. Off: the attempt's task is cancelled -- it
        closes its socket (two seconds at most) --, no further attempt. On:
        an attempt now, the waits from the start."""
        if enabled == self._enabled:
            return
        self._enabled = enabled
        self._cancel_later()
        if enabled:
            self._failures = 0
            self._async_attempt()
            return
        if self._task is not None:
            self._task.cancel()

    @callback
    def async_retry_now(self) -> None:
        """Configure's test just opened a socket: no waiting out the minute
        -- unless an attempt runs (or the connection is off: no attempt)."""
        if self._task is not None and not self._task.done():
            return
        self._cancel_later()
        self._failures = 0
        self._async_attempt()

    @callback
    def async_stop(self) -> None:
        """With the entry's unload: no further attempt. The open socket's
        task is cancelled with the entry and closes it (two seconds at most)."""
        self._stopped = True
        self._cancel_later()

    @callback
    def _cancel_later(self) -> None:
        if self._later:
            self._later()
            self._later = None

    def diagnostics(self) -> dict[str, Any]:
        """What the socket did -- no address, no token, no text of BamBuddy's."""
        return {
            "enabled": self._enabled,
            "connected": self.connected,
            "connected_since": self._connected_since.isoformat() if self._connected_since else None,
            "last_message": self._last_message.isoformat() if self._last_message else None,
            "messages": self._messages,
            "other_printers": self._other_printers,
            "ignored": self._ignored,
            "connections": self._connections,
            "last_error": self._last_error,
        }

    @callback
    def _async_attempt(self, _now: datetime | None = None) -> None:
        self._later = None
        if not self._enabled or self._stopped or self.hass.is_stopping:
            return
        self._generation += 1
        # The task starts at once (eagerly): it gets its number, never reads it.
        self._task = self.entry.async_create_background_task(
            self.hass, self._async_connect(self._generation), "bambuddy live connection"
        )

    async def _async_connect(self, generation: int) -> None:
        opened: float | None = None
        try:
            try:
                token = await self.client.get_ws_token()
            except BamBuddyAuthError as err:
                # BamBuddy does not know the key: the key guard checks it and
                # decides on a new one -- once, not at every attempt.
                if not self._refused:
                    self._refused = True
                    self.entry.runtime_data.key.async_read_refused(err)
                raise
            self._refused = False
            socket = await self.client.open_socket(token)
            opened = self.hass.loop.time()
            await self._async_read(socket)
        except Exception as err:  # noqa: BLE001 - nothing may leave the task: its text could carry the URL
            self._note_failure(failure_kind(err))
        finally:
            self._async_wait(opened, generation)

    async def _async_read(self, socket: aiohttp.ClientWebSocketResponse) -> None:
        self._socket = socket
        self._connections += 1
        self._connected_since = dt_util.utcnow()
        self._last_error = None
        _LOGGER.debug("Live connection to BamBuddy open")
        try:
            async for message in socket:
                # A heartbeat that found the socket dead.
                if message.type is aiohttp.WSMsgType.ERROR:
                    break
                self._async_handle(message)
        finally:
            # Switched off and on again meanwhile: the new socket stays.
            if self._socket is socket:
                self._socket = None
                self._connected_since = None
            await socket.close()
        code = socket.close_code
        self._note_failure("closed" if code in _ORDERLY else f"closed {code}")

    @callback
    def _async_handle(self, message: aiohttp.WSMessage) -> None:
        self._last_message = dt_util.utcnow()
        body: Any = None
        if message.type is aiohttp.WSMsgType.TEXT:
            try:
                body = json.loads(message.data)
            except ValueError:
                body = None
        printer_id = body.get("printer_id") if isinstance(body, dict) and body.get("type") in _PUSHES else None
        if not isinstance(printer_id, int) or isinstance(printer_id, bool):
            self._ignored += 1
            return
        # Every socket hears of every printer of the BamBuddy: only this
        # entry's are read -- through REST, which holds a key to its printers.
        coordinator = self.entry.runtime_data.printers.get(printer_id)
        if coordinator is None:
            self._other_printers += 1
            return
        self._messages += 1
        coordinator.async_pushed()

    @callback
    def _note_failure(self, kind: str) -> None:
        """What ended the attempt; the log says it when it changed, at DEBUG
        -- a proxy that does not pass WebSockets would say it every minute."""
        if kind != self._last_error:
            _LOGGER.debug("Live connection to BamBuddy: %s", kind)
        self._last_error = kind

    @callback
    def _async_wait(self, opened: float | None, generation: int) -> None:
        """The next attempt after 1, 2, 4 … s, at most a minute, each a
        little off (a BamBuddy back after a restart is not met by all its
        clients at once) -- after a connection that held a minute, after a
        second again. An attempt that is not the newest counts nothing."""
        if generation != self._generation or not self._enabled or self._stopped or self.hass.is_stopping:
            return
        if opened is not None and self.hass.loop.time() - opened >= LIVE_STEADY:
            self._failures = 0
        delay = LIVE_BACKOFF[min(self._failures, len(LIVE_BACKOFF) - 1)] * random.uniform(0.8, 1.2)
        self._failures += 1
        self._later = async_call_later(self.hass, delay, HassJob(self._async_attempt, cancel_on_shutdown=True))
