"""The key guard: the running entry's API key checked every ten minutes and
when BamBuddy refuses a request -- the only place that starts a
reauthentication while the entry runs. A 401 is confirmed a minute later
(BamBuddy also answers 401 when its key lookup fails for a moment); an
unreachable BamBuddy never asks for a new key."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import timedelta
import logging
from types import SimpleNamespace
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import UpdateFailed
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.bambuddy.api import (
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyBadAnswerError,
    BamBuddyClient,
    BamBuddyConnectionError,
    BamBuddyPermissionError,
)
from custom_components.bambuddy.api import KeyScopes
from custom_components.bambuddy.const import MANAGE_INVENTORY
from custom_components.bambuddy.coordinator import fetch
from custom_components.bambuddy.key import KeyCheck, KeyGuard

from tests.conftest import API_KEY, URL, load_fixture, make_entry, next_refresh
from tests.helpers import home_assistant_stops, reauth_flows

PAUSE = "POST /printers/1/print/pause"


def _guard(hass: HomeAssistant, entry: MockConfigEntry) -> KeyGuard:
    """Started, as the setup starts it: its timers end with the entry."""
    client = BamBuddyClient(URL, API_KEY, async_get_clientsession(hass))
    guard = KeyGuard(hass, entry, client, KeyCheck(dt_util.utcnow(), "ok"))
    guard.async_start()
    return guard


@pytest.fixture
async def entry(hass: HomeAssistant) -> AsyncIterator[MockConfigEntry]:
    entry = make_entry(hass)
    yield entry
    # As an unload: the guard's timers end.
    await entry._async_process_on_unload(hass)


async def test_the_check_runs_every_ten_minutes(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    guard = _guard(hass, entry)

    await next_refresh(hass, freezer, 601)
    await next_refresh(hass, freezer, 601)

    assert bambuddy_api.get_auth_me.await_count == 2
    assert guard.last.outcome == "ok"
    assert reauth_flows(hass) == []


async def test_the_check_stops_with_home_assistant(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """Home Assistant closes its web session while it stops: a check after
    that failed with "Session is closed" in the log. The first thing its
    stop does is cancel the timers marked for it."""
    _guard(hass, entry)

    home_assistant_stops(hass)
    await next_refresh(hass, freezer, 601)

    bambuddy_api.get_auth_me.assert_not_awaited()


async def test_a_check_asked_for_soon_stops_with_home_assistant(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """A refused read asks for a check in a few seconds: a stop before then
    leaves it unasked."""
    guard = _guard(hass, entry)
    guard.async_check_soon()

    home_assistant_stops(hass)
    await next_refresh(hass, freezer, 10)

    bambuddy_api.get_auth_me.assert_not_awaited()


async def test_a_retry_stops_with_home_assistant(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy unreachable: the check is tried again a minute later -- not
    after Home Assistant began to stop."""
    bambuddy_api.get_auth_me.side_effect = BamBuddyConnectionError("down")
    guard = _guard(hass, entry)
    await guard.async_check()
    assert bambuddy_api.get_auth_me.await_count == 1

    home_assistant_stops(hass)
    await next_refresh(hass, freezer, 61)

    assert bambuddy_api.get_auth_me.await_count == 1


async def test_a_short_key_starts_the_reauth(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, caplog: pytest.LogCaptureFixture
) -> None:
    """BamBuddy's create dialog leaves Control Printer off."""
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_default.json")
    guard = _guard(hass, entry)

    with caplog.at_level(logging.WARNING):
        check = await guard.async_check()
    await hass.async_block_till_done()

    assert check.outcome == "short"
    assert check.scopes is not None and check.scopes.marks()["control_printer"] == "✗"
    assert len(reauth_flows(hass)) == 1
    assert "control_printer" in caplog.text and API_KEY not in caplog.text


async def test_a_deactivated_owner_starts_the_reauth(hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry) -> None:
    bambuddy_api.get_auth_me.side_effect = BamBuddyPermissionError(403, "API key owner is deactivated or no longer exists", "GET /auth/me")
    guard = _guard(hass, entry)

    assert (await guard.async_check()).outcome == "owner"
    await hass.async_block_till_done()
    assert len(reauth_flows(hass)) == 1


async def test_a_lone_401_is_confirmed_first(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """A 401 then the full key a minute later: BamBuddy's lookup failed for a
    moment -- no reauth."""
    bambuddy_api.get_auth_me.side_effect = [BamBuddyAuthError(401, "Authentication required", "GET /auth/me"), load_fixture("auth_me_control.json")]
    guard = _guard(hass, entry)

    assert (await guard.async_check()).outcome == "unknown"
    await hass.async_block_till_done()
    assert reauth_flows(hass) == []
    await next_refresh(hass, freezer, 61)

    assert bambuddy_api.get_auth_me.await_count == 2
    assert guard.last.outcome == "ok"
    assert reauth_flows(hass) == []


async def test_a_confirmed_401_starts_the_reauth(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required", "GET /auth/me")
    guard = _guard(hass, entry)

    await guard.async_check()
    await next_refresh(hass, freezer, 61)

    # Two checks; the reauth dialog asks once more why a new key is needed.
    assert bambuddy_api.get_auth_me.await_count == 3
    assert len(reauth_flows(hass)) == 1


@pytest.mark.parametrize(
    "error",
    [
        BamBuddyConnectionError("GET /auth/me: ClientConnectorError"),
        BamBuddyApiError(502, "Bad Gateway", "GET /auth/me"),
        BamBuddyBadAnswerError(200, "No permissions in the answer", "GET /auth/me"),
    ],
)
async def test_unreachable_changes_nothing_and_retries(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory, error: Exception
) -> None:
    """BamBuddy stopped, the network down, a proxy without BamBuddy: no new
    key would help -- asked again a minute later."""
    bambuddy_api.get_auth_me.side_effect = [error, load_fixture("auth_me_control.json")]
    guard = _guard(hass, entry)

    assert (await guard.async_check()).outcome == "unreachable"
    await hass.async_block_till_done()
    assert reauth_flows(hass) == []
    await next_refresh(hass, freezer, 61)

    assert bambuddy_api.get_auth_me.await_count == 2
    assert guard.last.outcome == "ok"
    assert reauth_flows(hass) == []


async def test_an_unanswered_check_keeps_what_the_key_may_assign(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry
) -> None:
    """Manage Inventory as the last answered check said: one check without an
    answer takes nothing away; a check that answers without it does."""
    bambuddy_api.get_auth_me.side_effect = [
        load_fixture("auth_me_control.json"),
        BamBuddyConnectionError("down"),
        load_fixture("auth_me_read.json"),
        # The reauthentication the last check starts asks once more.
        load_fixture("auth_me_read.json"),
    ]
    guard = _guard(hass, entry)
    assert guard.can_assign_spools is False  # the setup's check said nothing of it

    await guard.async_check()
    assert guard.can_assign_spools is True
    await guard.async_check()
    assert guard.last.outcome == "unreachable"
    assert guard.can_assign_spools is True
    await guard.async_check()
    assert guard.can_assign_spools is False
    # The key now lacks a permission: the reauthentication runs to its form within the test.
    await hass.async_block_till_done()
    assert len(reauth_flows(hass)) == 1
    assert bambuddy_api.get_auth_me.await_count == 4


async def test_the_checks_end_with_the_entry(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    bambuddy_api.get_auth_me.side_effect = BamBuddyConnectionError("GET /auth/me: ClientConnectorError")
    guard = _guard(hass, entry)
    await guard.async_check()

    await entry._async_process_on_unload(hass)
    await next_refresh(hass, freezer, 601)

    assert bambuddy_api.get_auth_me.await_count == 1


async def test_one_check_at_a_time(hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry) -> None:
    """Callers while a check runs get its result."""
    answered = asyncio.Event()

    async def slow() -> dict[str, Any]:
        await answered.wait()
        return load_fixture("auth_me_control.json")

    bambuddy_api.get_auth_me.side_effect = slow
    guard = _guard(hass, entry)
    first = hass.async_create_task(guard.async_check())
    second = hass.async_create_task(guard.async_check())
    await asyncio.sleep(0)
    answered.set()

    assert ((await first).outcome, (await second).outcome) == ("ok", "ok")
    assert bambuddy_api.get_auth_me.await_count == 1


async def test_check_soon_is_debounced(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """Many refused reads at once ask for one check."""
    guard = _guard(hass, entry)

    for _ in range(5):
        guard.async_check_soon()
    await next_refresh(hass, freezer, 6)

    assert bambuddy_api.get_auth_me.await_count == 1


@pytest.mark.parametrize(
    ("answer", "key", "placeholders", "reauths"),
    [
        (load_fixture("auth_me_default.json"), "key_scopes_missing", {"read_status": "✓", "control_printer": "✗", "manage_maintenance": "✓"}, 1),
        (BamBuddyPermissionError(403, "API key owner is deactivated or no longer exists", "GET /auth/me"), "key_owner_inactive", None, 1),
        # A first 401: doubted -- checked again within a minute, no reauth yet.
        (BamBuddyAuthError(401, "Authentication required", "GET /auth/me"), "key_doubted", None, 0),
        (load_fixture("auth_me_control.json"), "bambuddy_refused", {"error": "Not allowed here"}, 0),
        # BamBuddy answered the request: its refusal is what to say.
        (BamBuddyConnectionError("GET /auth/me: TimeoutError"), "bambuddy_refused", {"error": "Not allowed here"}, 0),
    ],
)
async def test_a_refusal_says_why(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    entry: MockConfigEntry,
    answer: Any,
    key: str,
    placeholders: dict[str, str] | None,
    reauths: int,
) -> None:
    """A route's refusal: the check says whether the key is the cause."""
    if isinstance(answer, Exception):
        bambuddy_api.get_auth_me.side_effect = answer
    else:
        bambuddy_api.get_auth_me.return_value = answer
    guard = _guard(hass, entry)

    error = await guard.async_refused(BamBuddyPermissionError(403, "Not allowed here", PAUSE))
    # The reauth the guard starts runs in the background: it ends here,
    # while BamBuddy's answers are still the test's.
    await hass.async_block_till_done()

    assert error.translation_domain == "bambuddy"
    assert error.translation_key == key
    assert error.translation_placeholders == placeholders
    assert len(reauth_flows(hass)) == reauths


async def test_a_refusal_with_a_full_key_is_warned_once_per_route(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, caplog: pytest.LogCaptureFixture
) -> None:
    """BamBuddy refusing a route the table says the key may use: no reauth
    (a new key would be refused alike), a warning naming the route."""
    guard = _guard(hass, entry)

    with caplog.at_level(logging.WARNING):
        await guard.async_refused(BamBuddyPermissionError(403, "Not allowed here", PAUSE))
        await guard.async_refused(BamBuddyPermissionError(403, "Not allowed here", PAUSE))
    await hass.async_block_till_done()

    assert caplog.text.count(PAUSE) == 1
    assert reauth_flows(hass) == []


async def test_a_confirmed_401_is_said_as_such(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """A minute after the first 401, another: the key is gone."""
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required", "GET /auth/me")
    guard = _guard(hass, entry)
    await guard.async_check()
    await next_refresh(hass, freezer, 61)

    error = await guard.async_refused(BamBuddyAuthError(401, "Authentication required", PAUSE))

    assert error.translation_key == "auth_failed"


async def test_a_soon_check_during_the_doubt_starts_no_reauth(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """Failed reads ask for checks within seconds; a 401 still counts as
    confirmed only a minute after the first."""
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required", "GET /auth/me")
    guard = _guard(hass, entry)
    await guard.async_check()

    guard.async_check_soon()
    await next_refresh(hass, freezer, 6)
    await guard.async_refused(BamBuddyAuthError(401, "Authentication required", PAUSE))
    await hass.async_block_till_done()
    assert reauth_flows(hass) == []

    await next_refresh(hass, freezer, 55)
    assert len(reauth_flows(hass)) == 1


async def test_a_check_finishing_after_unload_does_nothing(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """A reload while a check runs: the old guard's answer arms no timer and
    starts no reauth on the entry, which has a new guard by then."""
    answered = asyncio.Event()

    async def slow() -> dict[str, Any]:
        await answered.wait()
        raise BamBuddyAuthError(401, "Authentication required", "GET /auth/me")

    bambuddy_api.get_auth_me.side_effect = slow
    guard = _guard(hass, entry)
    running = hass.async_create_task(guard.async_check())
    await asyncio.sleep(0)
    await entry._async_process_on_unload(hass)
    answered.set()
    await running
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required", "GET /auth/me")
    await next_refresh(hass, freezer, 61)
    guard.async_check_soon()
    await next_refresh(hass, freezer, 6)

    assert bambuddy_api.get_auth_me.await_count == 1
    assert reauth_flows(hass) == []


async def test_an_ok_check_ends_the_reauth(hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry) -> None:
    """The owner got the right back in BamBuddy: the reauth asked for goes
    with its repair -- the stored key works again."""
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_default.json")
    guard = _guard(hass, entry)
    await guard.async_check()
    await hass.async_block_till_done()
    assert len(reauth_flows(hass)) == 1

    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_control.json")
    await guard.async_check()
    await hass.async_block_till_done()

    assert reauth_flows(hass) == []


async def _confirmed_401(hass: HomeAssistant, bambuddy_api: SimpleNamespace, guard: KeyGuard, freezer: FrozenDateTimeFactory) -> None:
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required", "GET /auth/me")
    await guard.async_check()
    await next_refresh(hass, freezer, 61)
    assert guard.refused


async def test_a_read_that_works_after_a_refusal_checks_the_key(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy back after an outage that looked like a 401: the repair goes
    about five seconds later, though the last check is under a minute old."""
    guard = _guard(hass, entry)
    await _confirmed_401(hass, bambuddy_api, guard, freezer)
    await next_refresh(hass, freezer, 10)
    bambuddy_api.get_auth_me.side_effect = None
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_control.json")

    async def read() -> str:
        return "answer"

    assert await fetch(read(), entry=SimpleNamespace(runtime_data=SimpleNamespace(key=guard))) == "answer"
    await next_refresh(hass, freezer, 6)

    assert not guard.refused
    assert reauth_flows(hass) == []


async def test_reads_that_work_ask_at_most_once_a_minute(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """Reads answer, the key's own check keeps saying 401: no storm."""
    guard = _guard(hass, entry)
    await _confirmed_401(hass, bambuddy_api, guard, freezer)
    await hass.async_block_till_done()
    checks = bambuddy_api.get_auth_me.await_count

    for _ in range(5):
        guard.async_read_worked()
        await next_refresh(hass, freezer, 10)
    assert bambuddy_api.get_auth_me.await_count == checks + 1

    await next_refresh(hass, freezer, 15)
    guard.async_read_worked()
    await next_refresh(hass, freezer, 6)
    assert bambuddy_api.get_auth_me.await_count == checks + 2


async def test_a_read_that_works_during_a_check_still_asks_after_it(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """A check under way can arm no other: the next read asks, not a minute later."""
    guard = _guard(hass, entry)
    await _confirmed_401(hass, bambuddy_api, guard, freezer)
    await hass.async_block_till_done()
    checks = bambuddy_api.get_auth_me.await_count

    async with guard._lock:
        guard.async_read_worked()
    guard.async_read_worked()
    await next_refresh(hass, freezer, 6)

    assert bambuddy_api.get_auth_me.await_count == checks + 1


async def test_a_read_that_works_checks_nothing_while_the_key_is_fine(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    guard = _guard(hass, entry)

    guard.async_read_worked()
    await next_refresh(hass, freezer, 6)

    bambuddy_api.get_auth_me.assert_not_awaited()


async def test_a_lasting_read_refusal_checks_once_a_minute(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory, caplog: pytest.LogCaptureFixture
) -> None:
    """A route BamBuddy refuses at every poll although the key has every
    scope: the route named once, the key checked at most once a minute."""
    guard = _guard(hass, entry)
    refused = BamBuddyPermissionError(403, "API key does not have access to printer 1", "GET /printers/1/status")

    with caplog.at_level(logging.WARNING):
        for _ in range(5):
            guard.async_read_refused(refused)
            await next_refresh(hass, freezer, 10)
    # One check, which finds the key fine: the route named once.
    assert bambuddy_api.get_auth_me.await_count == 1
    assert caplog.text.count("GET /printers/1/status") == 1
    assert reauth_flows(hass) == []

    await next_refresh(hass, freezer, 20)
    guard.async_read_refused(refused)
    await next_refresh(hass, freezer, 6)
    assert bambuddy_api.get_auth_me.await_count == 2


async def test_the_ten_minute_check_drops_no_soon_check(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """A check soon due when the interval's comes: one check, not two."""
    guard = _guard(hass, entry)
    await next_refresh(hass, freezer, 597)
    guard.async_check_soon()
    await next_refresh(hass, freezer, 4)
    await next_refresh(hass, freezer, 5)

    assert bambuddy_api.get_auth_me.await_count == 1


async def test_a_refused_read_says_the_key_is_doubted_until_confirmed(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """A read's 401 is a doubt until a check a minute later confirms it:
    only then does the coordinator's error send the user to a new key."""
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required", "GET /auth/me")
    guard = _guard(hass, entry)
    entry.runtime_data = SimpleNamespace(key=guard)

    async def refused() -> None:
        raise BamBuddyAuthError(401, "Authentication required", "GET /printers/1/status")

    with pytest.raises(UpdateFailed) as first:
        await fetch(refused(), entry=entry)  # type: ignore[arg-type]
    assert first.value.translation_key == "key_doubted"

    await next_refresh(hass, freezer, 6)
    await next_refresh(hass, freezer, 61)
    assert len(reauth_flows(hass)) == 1
    with pytest.raises(UpdateFailed) as later:
        await fetch(refused(), entry=entry)  # type: ignore[arg-type]
    assert later.value.translation_key == "auth_failed"


@pytest.mark.parametrize(
    ("answer", "outcome"),
    [
        (BamBuddyPermissionError(403, "API key owner is deactivated or no longer exists", "GET /auth/me"), "owner"),
        (BamBuddyConnectionError("GET /auth/me: ClientConnectorError"), "unreachable"),
    ],
)
async def test_every_check_says_when_it_was_made(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, answer: Exception, outcome: str
) -> None:
    bambuddy_api.get_auth_me.side_effect = answer
    guard = _guard(hass, entry)

    check = await guard.async_check()

    assert check.outcome == outcome
    assert abs(check.at - dt_util.utcnow()) < timedelta(seconds=5)
    assert guard.last is check


async def test_what_the_setup_found_is_not_said_again(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, caplog: pytest.LogCaptureFixture
) -> None:
    """The setup refused a short key already: the same finding later is no news in the log."""
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_default.json")
    client = BamBuddyClient(URL, API_KEY, async_get_clientsession(hass))
    guard = KeyGuard(hass, entry, client, KeyCheck(dt_util.utcnow(), "short"))
    guard.async_start()

    with caplog.at_level(logging.WARNING):
        await guard.async_check()
    await hass.async_block_till_done()

    assert "lacks permissions" not in caplog.text


async def test_what_the_setups_check_said_about_inventory_holds_until_a_check_answers(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry
) -> None:
    client = BamBuddyClient(URL, API_KEY, async_get_clientsession(hass))
    first = KeyCheck(dt_util.utcnow(), "ok", KeyScopes({}, frozenset({MANAGE_INVENTORY})))
    guard = KeyGuard(hass, entry, client, first)
    guard.async_start()
    assert guard.can_assign_spools is True

    bambuddy_api.get_auth_me.side_effect = BamBuddyConnectionError("down")
    await guard.async_check()
    assert guard.can_assign_spools is True


async def test_an_unloaded_guard_warns_of_nothing(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, entry: MockConfigEntry, caplog: pytest.LogCaptureFixture
) -> None:
    """A check finishing after the unload names no refused route: the entry has a new guard."""
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_control.json")
    guard = _guard(hass, entry)
    guard.async_read_refused(BamBuddyPermissionError(403, "Not allowed here", PAUSE))
    await entry._async_process_on_unload(hass)

    with caplog.at_level(logging.WARNING):
        check = await guard.async_check()

    assert check.outcome == "ok"
    assert PAUSE not in caplog.text
