"""BamBuddy's live connection: a push of a printer's change reads that
printer at once, at most once a second."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
import copy
import json
import logging
from types import SimpleNamespace
from typing import Any
from unittest.mock import PropertyMock, patch

import aiohttp
from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.bambuddy.api import (
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyBadAnswerError,
    BamBuddyConnectionError,
    BamBuddyNotFoundError,
    BamBuddyNotJsonError,
    BamBuddyPermissionError,
)
from custom_components.bambuddy.key import KeyGuard
from custom_components.bambuddy.live import async_test, failure_kind, live_settings

from tests.conftest import (
    A1_MINI,
    H2D,
    P1S,
    WS_TOKEN,
    X1C,
    X1E,
    make_entry,
    next_refresh,
    printer_uid,
    set_up,
    setup_integration,
    state_of,
)


def _reads(bambuddy_api: SimpleNamespace, printer_id: int) -> int:
    """How often the printer's status was read."""
    return sum(1 for call in bambuddy_api.get_status.await_args_list if call.args == (printer_id,))


def _held_back(bambuddy_api: SimpleNamespace) -> asyncio.Event:
    """The status reads wait for the event: a read under way."""
    release = asyncio.Event()
    answer = bambuddy_api.get_status.side_effect

    async def slow(printer_id: int) -> dict[str, Any]:
        await release.wait()
        return answer(printer_id)  # type: ignore[no-any-return]

    bambuddy_api.get_status.side_effect = slow
    return release


async def _later(hass: HomeAssistant, freezer: FrozenDateTimeFactory, seconds: float) -> None:
    freezer.tick(seconds)
    async_fire_time_changed(hass)
    await hass.async_block_till_done(wait_background_tasks=True)


# --- A push reads the printer ---------------------------------------------------


async def test_a_push_reads_the_printer_at_once(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The light went off on the printer: BamBuddy tells, and the light
    shows off -- not at the next poll."""
    entry = await set_up(hass, X1C)
    before = _reads(bambuddy_api, X1C)
    bambuddy_api.statuses[X1C]["chamber_light"] = False

    entry.runtime_data.printers[X1C].async_pushed()
    await hass.async_block_till_done(wait_background_tasks=True)

    assert _reads(bambuddy_api, X1C) == before + 1
    assert state_of(hass, "light", printer_uid(entry, "chamber_light")).state == "off"


async def test_a_flood_of_pushes_reads_once_a_second(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A heating printer tells of every degree: one read now, one a second
    later for all that came meanwhile, none more -- for each printer alike."""
    printers = (X1C, A1_MINI, P1S, H2D, X1E)
    entry = await set_up(hass, *printers)
    before = {printer: _reads(bambuddy_api, printer) for printer in printers}

    for _ in range(10):
        for printer in printers:
            entry.runtime_data.printers[printer].async_pushed()
    await hass.async_block_till_done(wait_background_tasks=True)
    assert {printer: _reads(bambuddy_api, printer) - before[printer] for printer in printers} == dict.fromkeys(printers, 1)

    await _later(hass, freezer, 1.0)
    assert {printer: _reads(bambuddy_api, printer) - before[printer] for printer in printers} == dict.fromkeys(printers, 2)

    await _later(hass, freezer, 5.0)
    assert {printer: _reads(bambuddy_api, printer) - before[printer] for printer in printers} == dict.fromkeys(printers, 2)


async def test_a_push_during_a_read_reads_once_more_after_it(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """What BamBuddy tells while a read is under way comes with one read
    after it; the read under way is never cut short (its entities would
    go unavailable)."""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    before = _reads(bambuddy_api, X1C)
    release = _held_back(bambuddy_api)

    coordinator.async_pushed()
    await hass.async_block_till_done()
    coordinator.async_pushed()
    coordinator.async_pushed()
    freezer.tick(2)
    release.set()
    await hass.async_block_till_done(wait_background_tasks=True)

    assert _reads(bambuddy_api, X1C) == before + 2
    assert coordinator.last_update_success


@pytest.mark.parametrize("why", ["shut down", "stopping", "replaced", "reloading"])
async def test_a_push_starts_nothing_when_the_printer_is_on_its_way_out(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, why: str
) -> None:
    """Shut down, Home Assistant stopping, another printer under the number,
    the entry about to reload: no read, no task, no timer."""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    before = _reads(bambuddy_api, X1C)
    with (
        patch.object(entry, "async_create_background_task") as started,
        patch.object(type(hass), "is_stopping", new_callable=PropertyMock, return_value=why == "stopping"),
    ):
        if why == "shut down":
            await coordinator.async_shutdown()
        coordinator.replaced = why == "replaced"
        entry.runtime_data.reloading = why == "reloading"
        coordinator.async_pushed()
        await hass.async_block_till_done()

        started.assert_not_called()
        assert coordinator._push_later is None
    coordinator.replaced = entry.runtime_data.reloading = False
    assert _reads(bambuddy_api, X1C) == before


async def test_no_read_starts_once_home_assistant_stops(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Home Assistant stops: it cancels the background tasks, the push read
    among them, before it says it stops. The read wanted meanwhile starts
    no task and no timer after it -- nobody would end them."""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    _held_back(bambuddy_api)
    coordinator.async_pushed()
    await hass.async_block_till_done()
    # Another change while the read is under way: one more read is wanted.
    coordinator.async_pushed()
    before = _reads(bambuddy_api, X1C)
    reads = [task for task in entry._background_tasks if task.get_name().endswith("push read")]
    assert len(reads) == 1

    with (
        patch.object(entry, "async_create_background_task") as started,
        patch.object(type(hass), "is_stopping", new_callable=PropertyMock, return_value=True),
    ):
        reads[0].cancel()
        await asyncio.gather(*reads, return_exceptions=True)
        started.assert_not_called()
        assert coordinator._push_later is None
    assert _reads(bambuddy_api, X1C) == before


async def test_reads_of_a_printer_take_turns(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A poll under way answered before the light went off; BamBuddy tells
    of the change, and the push read waits for the poll -- the newer state
    is the one that stays. (Home Assistant 2025.5 runs a coordinator's
    refreshes side by side.)"""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    light = printer_uid(entry, "chamber_light")
    stale = copy.deepcopy(bambuddy_api.statuses[X1C])
    answer = bambuddy_api.get_status.side_effect
    release = asyncio.Event()
    first = True

    async def poll_then_push(printer_id: int) -> dict[str, Any]:
        nonlocal first
        if first:
            first = False
            await release.wait()
            return stale
        return answer(printer_id)  # type: ignore[no-any-return]

    bambuddy_api.get_status.side_effect = poll_then_push
    poll = hass.async_create_task(coordinator.async_refresh())
    # Not async_block_till_done: it would wait for the poll held back.
    for _ in range(5):
        await asyncio.sleep(0)
    bambuddy_api.statuses[X1C]["chamber_light"] = False
    coordinator.async_pushed()
    for _ in range(5):
        await asyncio.sleep(0)
    release.set()
    await poll
    await hass.async_block_till_done(wait_background_tasks=True)

    assert state_of(hass, "light", light).state == "off"


async def test_a_push_during_a_command_keeps_the_command_guard(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A read that a command overtook answers with the state from before
    it: the light the command switched does not jump back."""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    bambuddy_api.statuses[X1C]["chamber_light"] = False
    await coordinator.async_refresh()
    light = printer_uid(entry, "chamber_light")
    assert state_of(hass, "light", light).state == "off"
    stale = copy.deepcopy(bambuddy_api.statuses[X1C])
    stale["chamber_light"] = True
    release = asyncio.Event()

    async def old_answer(printer_id: int) -> dict[str, Any]:
        await release.wait()
        return stale

    bambuddy_api.get_status.side_effect = old_answer
    coordinator.async_pushed()
    await hass.async_block_till_done()
    coordinator.note_command()
    release.set()
    await hass.async_block_till_done(wait_background_tasks=True)

    assert state_of(hass, "light", light).state == "off"


# --- The live connection -----------------------------------------------------------


class FakeSocket:
    """aiohttp's client socket as far as the live connection reads it: a
    message, or the end (a close code; 1006 after a heartbeat failure)."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[aiohttp.WSMessage] = asyncio.Queue()
        self.closed = False
        self.close_code: int | None = None
        self.closes = 0

    def push(self, body: Any) -> None:
        text = body if isinstance(body, str) else json.dumps(body)
        self._queue.put_nowait(aiohttp.WSMessage(aiohttp.WSMsgType.TEXT, text, None))

    def send(self, kind: aiohttp.WSMsgType, data: Any = None) -> None:
        self._queue.put_nowait(aiohttp.WSMessage(kind, data, None))

    def end(self, code: int = 1000) -> None:
        self.send(aiohttp.WSMsgType.CLOSE, code)

    def __aiter__(self) -> FakeSocket:
        return self

    async def __anext__(self) -> aiohttp.WSMessage:
        message = await self._queue.get()
        if message.type is aiohttp.WSMsgType.CLOSE:
            self.closed, self.close_code = True, message.data
            raise StopAsyncIteration
        if message.type is aiohttp.WSMsgType.ERROR:
            self.closed, self.close_code = True, 1006
        return message

    async def close(self) -> bool:
        self.closes += 1
        self.closed = True
        return True


async def _settle(hass: HomeAssistant) -> None:
    """Lets the connection's task run while its socket stays open -- no
    wait for background tasks: an open socket's never ends."""
    for _ in range(20):
        await hass.async_block_till_done()
        await asyncio.sleep(0)


async def _later_open(hass: HomeAssistant, freezer: FrozenDateTimeFactory, seconds: float) -> None:
    """Past the next attempt, whose socket stays open."""
    freezer.tick(seconds)
    async_fire_time_changed(hass)
    await _settle(hass)


async def _connected(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, *printers: int
) -> tuple[MockConfigEntry, FakeSocket]:
    """An entry whose live connection is open: the setup's attempt finds no
    socket (the tests' default), the next one -- a second later -- this one."""
    entry = await set_up(hass, *(printers or (X1C,)))
    socket = FakeSocket()
    bambuddy_api.open_socket.side_effect = None
    bambuddy_api.open_socket.return_value = socket
    await _later_open(hass, freezer, 1.3)
    return entry, socket


@pytest.fixture
def steady_waits() -> Iterator[None]:
    """The waits between attempts without their jitter."""
    with patch("custom_components.bambuddy.live.random.uniform", return_value=1.0):
        yield


async def test_the_live_connection_takes_a_token_and_connects(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    entry, socket = await _connected(hass, bambuddy_api, freezer)
    live = entry.runtime_data.live

    bambuddy_api.open_socket.assert_awaited_with(WS_TOKEN)
    assert live.connected
    assert live.diagnostics()["connections"] == 1

    socket.end()
    await hass.async_block_till_done(wait_background_tasks=True)
    assert not live.connected


async def test_a_status_push_reads_that_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    """A change of a printer of this entry reads it; another printer's, a
    message of another kind and anything unreadable are counted, nothing more."""
    entry, socket = await _connected(hass, bambuddy_api, freezer)
    before = _reads(bambuddy_api, X1C)

    socket.push({"type": "printer_status", "printer_id": X1C, "data": {}})
    socket.push({"type": "printer_status", "printer_id": 99, "data": {}})
    for unread in ({"type": "archive_created", "data": {"id": 3}}, "not json", ["a list"], {"type": "printer_status", "printer_id": True}):
        socket.push(unread)
    socket.send(aiohttp.WSMsgType.BINARY, b"\x00")
    socket.end()
    await hass.async_block_till_done(wait_background_tasks=True)

    assert _reads(bambuddy_api, X1C) == before + 1
    live = entry.runtime_data.live.diagnostics()
    assert (live["messages"], live["other_printers"], live["ignored"]) == (1, 1, 5)
    assert live["last_message"] is not None

    # The end of a print reads it too -- at once, not at the next poll
    # (the next socket two seconds later: the waits grow).
    socket = FakeSocket()
    bambuddy_api.open_socket.return_value = socket
    await _later_open(hass, freezer, 2.3)
    socket.push({"type": "print_complete", "printer_id": X1C, "data": {"status": "completed"}})
    socket.end()
    await hass.async_block_till_done(wait_background_tasks=True)
    assert _reads(bambuddy_api, X1C) == before + 2


async def test_a_closed_socket_reconnects_with_a_new_token(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    """BamBuddy closed it (4401: the key changed) or aiohttp's heartbeat
    found it dead: a new token, a new socket -- no new key asked for."""
    entry, socket = await _connected(hass, bambuddy_api, freezer)
    tokens = bambuddy_api.get_ws_token.await_count

    socket.end(4401)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert entry.runtime_data.live.diagnostics()["last_error"] == "closed 4401"

    socket = FakeSocket()
    bambuddy_api.open_socket.return_value = socket
    await _later_open(hass, freezer, 2.3)
    assert bambuddy_api.get_ws_token.await_count == tokens + 1
    assert entry.runtime_data.live.connected

    socket.send(aiohttp.WSMsgType.ERROR, aiohttp.ServerTimeoutError())
    await hass.async_block_till_done(wait_background_tasks=True)
    assert entry.runtime_data.live.diagnostics()["last_error"] == "closed 1006"
    assert not entry.runtime_data.live.connected
    assert hass.config_entries.flow.async_progress() == []


async def test_the_waits_grow_and_settle(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    """No socket: the next attempt after 1, 2, 4 … s, at most 60; after a
    connection that held a minute, after a second again -- one that held
    only a few seconds lets them grow on."""
    await set_up(hass, X1C)
    attempts = bambuddy_api.get_ws_token.await_count

    for wait in (1, 2, 4, 8, 16, 32, 60, 60):
        await _later(hass, freezer, wait - 0.8)
        assert bambuddy_api.get_ws_token.await_count == attempts, wait
        await _later(hass, freezer, 0.9)
        attempts += 1
        assert bambuddy_api.get_ws_token.await_count == attempts, wait

    # A connection of a minute and more: then a second's wait again.
    socket = FakeSocket()
    bambuddy_api.open_socket.side_effect = None
    bambuddy_api.open_socket.return_value = socket
    await _later_open(hass, freezer, 60.2)
    attempts += 1
    await _later_open(hass, freezer, 61)
    bambuddy_api.open_socket.side_effect = BamBuddyConnectionError("WebSocket: refused")
    socket.end()
    await hass.async_block_till_done(wait_background_tasks=True)
    await _later(hass, freezer, 1.1)
    assert bambuddy_api.get_ws_token.await_count == attempts + 1
    attempts += 1

    # A connection of a few seconds: the waits go on growing.
    socket = FakeSocket()
    bambuddy_api.open_socket.side_effect = None
    bambuddy_api.open_socket.return_value = socket
    await _later_open(hass, freezer, 2.1)
    attempts += 1
    await _later_open(hass, freezer, 5)
    bambuddy_api.open_socket.side_effect = BamBuddyConnectionError("WebSocket: refused")
    socket.end()
    await hass.async_block_till_done(wait_background_tasks=True)
    await _later(hass, freezer, 3.0)
    assert bambuddy_api.get_ws_token.await_count == attempts
    await _later(hass, freezer, 1.2)
    assert bambuddy_api.get_ws_token.await_count == attempts + 1


@pytest.mark.parametrize(
    ("error", "kind"),
    [
        (BamBuddyNotFoundError(404, "HTTP 404", "GET /ws"), "HTTP 404"),
        (BamBuddyPermissionError(403, "HTTP 403", "GET /ws"), "HTTP 403"),
    ],
)
async def test_a_socket_the_proxy_refuses_retries_quietly(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    freezer: FrozenDateTimeFactory,
    caplog: pytest.LogCaptureFixture,
    steady_waits: None,
    error: BamBuddyApiError,
    kind: str,
) -> None:
    """A proxy that does not pass WebSockets (404), or one that refuses them
    (403): the poll carries on, the key stays as it is, the log says it once."""
    caplog.set_level(logging.DEBUG, logger="custom_components.bambuddy.live")
    bambuddy_api.open_socket.side_effect = error
    with patch.object(KeyGuard, "async_read_refused") as refused:
        entry = await set_up(hass, X1C)
        reads = _reads(bambuddy_api, X1C)
        for wait in (1.1, 2.1, 4.1):
            await _later(hass, freezer, wait)
        await next_refresh(hass, freezer)

    assert entry.runtime_data.live.diagnostics()["last_error"] == kind
    refused.assert_not_called()
    assert _reads(bambuddy_api, X1C) > reads
    assert caplog.text.count(kind) == 1


async def test_an_unknown_key_asks_the_key_guard_once(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    """BamBuddy does not know the key (401): the guard checks it and decides
    on a new one -- once, not at every attempt. A token BamBuddy keeps from
    a key whose owner may not connect (403) is no fault of the key: the
    integration reads as it always did, the guard hears nothing."""
    bambuddy_api.get_ws_token.side_effect = BamBuddyAuthError(401, "Invalid API key", "POST /auth/ws-token")
    with patch.object(KeyGuard, "async_read_refused") as refused:
        entry = await set_up(hass, X1C)
        for wait in (1.1, 2.1):
            await _later(hass, freezer, wait)
        assert refused.call_count == 1
        bambuddy_api.get_ws_token.side_effect = BamBuddyPermissionError(403, "nope", "POST /auth/ws-token")
        for wait in (4.1, 8.1):
            await _later(hass, freezer, wait)
        assert refused.call_count == 1
    bambuddy_api.open_socket.assert_not_awaited()
    assert entry.runtime_data.live.diagnostics()["last_error"] == "HTTP 403"


async def test_unload_ends_the_socket(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    entry, socket = await _connected(hass, bambuddy_api, freezer)
    tokens = bambuddy_api.get_ws_token.await_count

    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    # An attempt after the unload would fail at once, not hang on a socket.
    bambuddy_api.open_socket.side_effect = BamBuddyConnectionError("WebSocket: refused")

    assert socket.closes >= 1
    await _later(hass, freezer, 120)
    assert bambuddy_api.get_ws_token.await_count == tokens


async def test_no_attempt_once_home_assistant_stops(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    entry, socket = await _connected(hass, bambuddy_api, freezer)
    live = entry.runtime_data.live
    tokens = bambuddy_api.get_ws_token.await_count

    with patch.object(type(hass), "is_stopping", new_callable=PropertyMock, return_value=True):
        socket.end(1001)
        await hass.async_block_till_done(wait_background_tasks=True)
        # No timer either: nobody would cancel it any more.
        assert live._later is None
        await _later(hass, freezer, 120)
        assert bambuddy_api.get_ws_token.await_count == tokens


async def test_no_attempt_starts_while_home_assistant_stops(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, steady_waits: None
) -> None:
    entry = await set_up(hass, X1C)
    tokens = bambuddy_api.get_ws_token.await_count

    with patch.object(type(hass), "is_stopping", new_callable=PropertyMock, return_value=True):
        entry.runtime_data.live._async_attempt()
        await hass.async_block_till_done()

    assert bambuddy_api.get_ws_token.await_count == tokens


async def test_an_unforeseen_failure_stays_in_the_connection(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    freezer: FrozenDateTimeFactory,
    caplog: pytest.LogCaptureFixture,
    steady_waits: None,
) -> None:
    """Nothing leaves the connection's task -- Home Assistant would log its
    text, and an error's text may carry the URL with the token: only its
    kind is kept, and the next attempt comes."""
    caplog.set_level(logging.DEBUG)
    bambuddy_api.open_socket.side_effect = ValueError(f"http://bambuddy.local/api/v1/ws?token={WS_TOKEN}")
    entry = await set_up(hass, X1C)
    tokens = bambuddy_api.get_ws_token.await_count

    await _later(hass, freezer, 1.1)

    assert entry.runtime_data.live.diagnostics()["last_error"] == "ValueError"
    assert bambuddy_api.get_ws_token.await_count == tokens + 1
    assert WS_TOKEN not in caplog.text


@pytest.mark.parametrize(
    ("error", "kind"),
    [
        (BamBuddyBadAnswerError(200, "No token in the answer", "POST /auth/ws-token"), "no token in the answer"),
        (BamBuddyNotJsonError(200, "The answer is not JSON"), "not BamBuddy's answer"),
    ],
)
async def test_a_token_answer_that_is_none_says_so(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, error: BamBuddyApiError, kind: str
) -> None:
    """Not an HTTP error: a proxy's page, or an answer without the token."""
    bambuddy_api.get_ws_token.side_effect = error
    entry = await set_up(hass, X1C)

    assert entry.runtime_data.live.diagnostics()["last_error"] == kind
    bambuddy_api.open_socket.assert_not_awaited()


# --- The gap between two pushed reads -------------------------------------------


async def test_a_wider_gap_spaces_the_pushed_reads(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Every 5 seconds at most: the first push reads at once, what comes in
    the five seconds after is read once at their end."""
    entry = await set_up(hass, X1C)
    printer = entry.runtime_data.printers[X1C]
    printer.push_gap = 5
    before = _reads(bambuddy_api, X1C)

    printer.async_pushed()
    await hass.async_block_till_done(wait_background_tasks=True)
    assert _reads(bambuddy_api, X1C) == before + 1
    for seconds in (1, 2):
        printer.async_pushed()
        await _later(hass, freezer, seconds)
        assert _reads(bambuddy_api, X1C) == before + 1
    await _later(hass, freezer, 2.1)
    assert _reads(bambuddy_api, X1C) == before + 2


async def test_a_new_gap_rearms_a_waiting_read(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A read that waits takes the new gap at once, either way."""
    entry = await set_up(hass, X1C)
    printer = entry.runtime_data.printers[X1C]
    printer.push_gap = 5
    printer.async_pushed()
    await hass.async_block_till_done(wait_background_tasks=True)
    before = _reads(bambuddy_api, X1C)

    printer.async_pushed()
    printer.push_gap = 1
    await _later(hass, freezer, 1.1)
    assert _reads(bambuddy_api, X1C) == before + 1

    printer.async_pushed()
    printer.push_gap = 5
    await _later(hass, freezer, 1.1)
    assert _reads(bambuddy_api, X1C) == before + 1
    await _later(hass, freezer, 4.0)
    assert _reads(bambuddy_api, X1C) == before + 2


# --- Configure's settings at work -----------------------------------------------


@pytest.mark.parametrize(
    ("stored", "enabled", "gap"),
    [
        ({}, True, 1),
        ({"live_updates": False, "push_gap": 2}, False, 2),
        ({"live_updates": True, "push_gap": 5}, True, 5),
        # Edited by hand: only what Configure stores counts.
        ({"push_gap": 3}, True, 1),
        ({"push_gap": "5"}, True, 1),
        ({"push_gap": 5.0}, True, 1),
        ({"push_gap": True}, True, 1),
        ({"live_updates": "no"}, True, 1),
    ],
)
def test_the_stored_settings_are_read_with_care(stored: dict[str, Any], enabled: bool, gap: int) -> None:
    assert live_settings({"printers": [], **stored}) == (enabled, gap)


async def test_live_updates_off_at_setup_open_nothing(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = make_entry(hass, X1C, live_updates=False)
    await setup_integration(hass, entry)

    await _later(hass, freezer, 120)

    bambuddy_api.get_ws_token.assert_not_awaited()
    assert entry.runtime_data.live.diagnostics()["enabled"] is False


async def test_saving_live_updates_off_ends_the_socket_without_a_reload(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    entry, socket = await _connected(hass, bambuddy_api, freezer)
    runtime = entry.runtime_data

    with patch.object(hass.config_entries, "async_reload") as reload:
        hass.config_entries.async_update_entry(entry, options={**entry.options, "live_updates": False})
        await hass.async_block_till_done(wait_background_tasks=True)

    reload.assert_not_called()
    assert entry.runtime_data is runtime
    assert socket.closes == 1
    assert not runtime.live.connected


async def test_saving_live_updates_on_connects_at_once(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C, live_updates=False)
    await setup_integration(hass, entry)
    runtime = entry.runtime_data
    bambuddy_api.open_socket.side_effect = None
    bambuddy_api.open_socket.return_value = FakeSocket()

    hass.config_entries.async_update_entry(entry, options={**entry.options, "live_updates": True})
    await _settle(hass)

    assert entry.runtime_data is runtime
    assert runtime.live.connected


async def test_saving_a_gap_reaches_every_printer(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C, A1_MINI)
    runtime = entry.runtime_data

    with patch.object(hass.config_entries, "async_reload") as reload:
        hass.config_entries.async_update_entry(entry, options={**entry.options, "push_gap": 5})
        await hass.async_block_till_done(wait_background_tasks=True)

    reload.assert_not_called()
    assert entry.runtime_data is runtime
    assert {printer.push_gap for printer in runtime.printers.values()} == {5}


async def test_two_quick_saves_end_in_the_last_state(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    """Off and on again in two saves without a pause: two listener runs,
    one socket in the end."""
    entry, socket = await _connected(hass, bambuddy_api, freezer)
    second = FakeSocket()
    bambuddy_api.open_socket.return_value = second

    hass.config_entries.async_update_entry(entry, options={**entry.options, "live_updates": False})
    hass.config_entries.async_update_entry(entry, options={**entry.options, "live_updates": True})
    await _settle(hass)

    live = entry.runtime_data.live
    assert socket.closes == 1
    assert live.connected
    assert live._socket is second


# --- Switched off and on; a test of the connection ------------------------------


@pytest.mark.parametrize(
    ("error", "kind"),
    [
        (BamBuddyBadAnswerError(200, "No token in the answer", "POST /auth/ws-token"), "no token in the answer"),
        (BamBuddyNotJsonError(200, "The answer is not JSON"), "not BamBuddy's answer"),
        (BamBuddyNotFoundError(404, "HTTP 404", "GET /ws"), "HTTP 404"),
        (BamBuddyPermissionError(403, "API key lacks websocket:connect", "POST /auth/ws-token"), "HTTP 403"),
        (BamBuddyAuthError(401, "Invalid API key", "POST /auth/ws-token"), "HTTP 401"),
        (BamBuddyConnectionError("WebSocket: ClientConnectorError"), "WebSocket: ClientConnectorError"),
        (TimeoutError(), "TimeoutError"),
        (ValueError(f"http://bambuddy.local/api/v1/ws?token={WS_TOKEN}"), "ValueError"),
    ],
)
def test_failure_kinds_name_no_address(error: BaseException, kind: str) -> None:
    """What failed, by kind: BamBuddy's own text and an error's text (it may
    carry the URL with the token) never come through."""
    assert failure_kind(error) == kind


class SlowCloseSocket(FakeSocket):
    """A socket whose close takes its time: aiohttp waits up to two seconds
    for BamBuddy's answer to it."""

    def __init__(self) -> None:
        super().__init__()
        self.release = asyncio.Event()

    async def close(self) -> bool:
        self.closes += 1
        await self.release.wait()
        self.closed = True
        return True


def _tokens(bambuddy_api: SimpleNamespace) -> int:
    return int(bambuddy_api.get_ws_token.await_count)


async def test_switching_off_ends_the_socket_and_every_attempt(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    entry, socket = await _connected(hass, bambuddy_api, freezer)
    live = entry.runtime_data.live
    tokens = _tokens(bambuddy_api)

    live.async_set_enabled(False)
    await hass.async_block_till_done(wait_background_tasks=True)

    assert socket.closes == 1
    assert not live.connected
    assert live._later is None
    assert live.diagnostics()["enabled"] is False
    await _later(hass, freezer, 120)
    assert _tokens(bambuddy_api) == tokens


async def test_switching_on_again_connects_at_once(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    entry, _socket = await _connected(hass, bambuddy_api, freezer)
    live = entry.runtime_data.live
    live.async_set_enabled(False)
    await hass.async_block_till_done(wait_background_tasks=True)
    tokens = _tokens(bambuddy_api)
    second = FakeSocket()
    bambuddy_api.open_socket.return_value = second

    live.async_set_enabled(True)
    await _settle(hass)

    assert _tokens(bambuddy_api) == tokens + 1
    assert live.connected
    assert live.diagnostics()["enabled"] is True


async def test_switching_on_twice_makes_one_attempt(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    entry, _socket = await _connected(hass, bambuddy_api, freezer)
    tokens = _tokens(bambuddy_api)

    entry.runtime_data.live.async_set_enabled(True)
    await _settle(hass)

    assert _tokens(bambuddy_api) == tokens


async def test_off_and_on_within_the_close_leave_one_socket(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    """Switched off, and on again while the old socket still closes: the
    old attempt touches nothing once it ends -- the new socket stays the
    one, no second attempt waits, and no failure is counted for it."""
    entry = await set_up(hass, X1C)
    first = SlowCloseSocket()
    bambuddy_api.open_socket.side_effect = None
    bambuddy_api.open_socket.return_value = first
    await _later_open(hass, freezer, 1.3)
    live = entry.runtime_data.live
    assert live.connected

    second = FakeSocket()
    bambuddy_api.open_socket.return_value = second
    # Two saves in a row: the new socket opens before the old task ends.
    live.async_set_enabled(False)
    live.async_set_enabled(True)
    await _settle(hass)
    assert first.closes == 1
    first.release.set()
    await _settle(hass)

    assert live.connected
    assert live._socket is second
    assert live._later is None
    assert live.diagnostics()["connections"] == 2
    # The waits started over with the switch: once this socket ends, the
    # next attempt comes after a second.
    tokens = _tokens(bambuddy_api)
    bambuddy_api.open_socket.side_effect = BamBuddyConnectionError("WebSocket: refused")
    second.end()
    await hass.async_block_till_done(wait_background_tasks=True)
    await _later(hass, freezer, 1.1)
    assert _tokens(bambuddy_api) == tokens + 1


@pytest.mark.parametrize("stage", ["get_ws_token", "open_socket"])
async def test_off_during_an_attempt_leaves_nothing(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None, stage: str
) -> None:
    """Switched off while it waits for the token or the handshake: the
    attempt ends, no next one is planned."""
    entry = await set_up(hass, X1C)
    live = entry.runtime_data.live
    held = asyncio.Event()

    async def waiting(*_: Any) -> Any:
        await held.wait()

    getattr(bambuddy_api, stage).side_effect = waiting
    live.async_retry_now()
    await _settle(hass)
    tokens = _tokens(bambuddy_api)

    live.async_set_enabled(False)
    await _settle(hass)

    assert live._task is not None and live._task.done()
    assert live._later is None
    await _later(hass, freezer, 120)
    assert _tokens(bambuddy_api) == tokens


async def test_off_then_unload_leaves_no_task(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    entry, _socket = await _connected(hass, bambuddy_api, freezer)
    live = entry.runtime_data.live

    live.async_set_enabled(False)
    await _settle(hass)
    assert live._task is not None and live._task.done()

    async with asyncio.timeout(5):
        assert await hass.config_entries.async_unload(entry.entry_id)
        await hass.async_block_till_done(wait_background_tasks=True)


async def test_retry_now_connects_a_waiting_connection(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, steady_waits: None
) -> None:
    """The connection waits for its next attempt (up to a minute): a test
    that just opened a socket wakes it -- not while one runs, not when off."""
    entry = await set_up(hass, X1C)
    live = entry.runtime_data.live
    assert live._later is not None
    socket = FakeSocket()
    bambuddy_api.open_socket.side_effect = None
    bambuddy_api.open_socket.return_value = socket

    live.async_retry_now()
    await _settle(hass)
    assert live.connected
    tokens = _tokens(bambuddy_api)
    live.async_retry_now()
    await _settle(hass)
    assert _tokens(bambuddy_api) == tokens

    live.async_set_enabled(False)
    await _settle(hass)
    live.async_retry_now()
    await _settle(hass)
    assert _tokens(bambuddy_api) == tokens
    assert not live.connected


async def test_the_one_off_test_closes_its_socket(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Configure's test opens the socket and closes it at once; a BamBuddy
    that does not answer ends it at the limit."""
    entry = await set_up(hass, X1C)
    client = entry.runtime_data.client
    socket = FakeSocket()
    bambuddy_api.open_socket.side_effect = None
    bambuddy_api.open_socket.return_value = socket

    await async_test(client)
    assert socket.closes == 1

    async def never(*_: Any) -> str:
        await asyncio.Event().wait()
        return WS_TOKEN

    bambuddy_api.get_ws_token.side_effect = never
    with patch("custom_components.bambuddy.live.LIVE_TEST_TIMEOUT", 0.05), pytest.raises(TimeoutError):
        await async_test(client)
