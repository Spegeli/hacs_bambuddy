"""BamBuddy's own figures: its statistics and system information, read
beside the printers and never holding them up."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant

from custom_components.bambuddy.api import (
    BamBuddyApiError,
    BamBuddyConnectionError,
    BamBuddyPermissionError,
)

from tests.conftest import (
    X1C,
    instance_uid,
    load_fixture,
    make_entry,
    next_refresh,
    past_polls,
    past_the_minute,
    printer_uid,
    set_up,
    state_of,
)
from tests.helpers import devices_by_identifier, reauth_flows, timed_out


async def test_bambuddys_figures_do_not_hold_up_the_printers(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy's statistics fail: its figures wait for the next minute,
    the printers do not."""
    bambuddy_api.get_statistics.side_effect = BamBuddyConnectionError("timeout")
    entry = await set_up(hass, X1C)

    assert entry.state is ConfigEntryState.LOADED
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == STATE_UNAVAILABLE
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"
    assert devices_by_identifier(hass, entry)[entry.entry_id].sw_version == "1.2.5.7"

    bambuddy_api.get_statistics.side_effect = None
    await past_the_minute(hass, freezer)
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == "812"


async def test_bambuddy_answers_without_its_system_information(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its archive walk may not finish in time at setup: BamBuddy still reads
    as online and its statistics come; the figures of the system information
    stay unknown until its next read."""
    bambuddy_api.get_system_info.side_effect = BamBuddyConnectionError("GET /system/info: TimeoutError")
    entry = await set_up(hass, X1C)

    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == STATE_ON
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == "812"
    assert state_of(hass, "sensor", instance_uid(entry, "printers_connected")).state == STATE_UNKNOWN

    bambuddy_api.get_system_info.side_effect = None
    await past_polls(hass, freezer, 30)
    assert state_of(hass, "sensor", instance_uid(entry, "printers_connected")).state == "2"


async def test_setup_waits_for_the_system_information_only_briefly(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The printers come after it at setup: there it gets 10 s, later 30 s."""
    await set_up(hass, X1C)
    assert bambuddy_api.get_system_info.await_args.kwargs == {"patient": False}

    await past_polls(hass, freezer, 30)

    assert bambuddy_api.get_system_info.await_args.kwargs == {"patient": True}


async def test_the_system_information_is_read_every_five_minutes(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """For it BamBuddy walks through its whole archive; the statistics come
    every minute. A new BamBuddy version shows on its device with it."""
    entry = await set_up(hass, X1C)
    system = load_fixture("system_info.json")
    bambuddy_api.get_system_info.return_value = {**system, "app": {**system["app"], "version": "1.2.6"}}

    await past_polls(hass, freezer, 27)
    assert bambuddy_api.get_system_info.await_count == 1
    await past_polls(hass, freezer, 3)

    assert bambuddy_api.get_system_info.await_count == 2
    assert bambuddy_api.get_statistics.await_count >= 5
    assert devices_by_identifier(hass, entry)[entry.entry_id].sw_version == "1.2.6"


async def test_setup_reads_the_printers_beside_bambuddys_figures(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy's statistics wait for its plugs, the update checks for GitHub and Bambu Lab: the printers'
    first reads do not wait for them."""
    events: list[str] = []
    statistics = bambuddy_api.get_statistics.return_value
    read = bambuddy_api.get_status.side_effect
    # The statistics answer only once a status was asked: the order is forced, not timed.
    asked = asyncio.Event()

    async def slow_statistics(**_: Any) -> dict:
        events.append("statistics asked")
        await asyncio.wait_for(asked.wait(), 5)
        events.append("statistics answered")
        return statistics

    def status(printer_id: int) -> dict:
        events.append("status asked")
        asked.set()
        return read(printer_id)

    bambuddy_api.get_statistics.side_effect = slow_statistics
    bambuddy_api.get_status.side_effect = status
    entry = await set_up(hass, X1C)

    assert entry.state is ConfigEntryState.LOADED
    assert events.index("status asked") < events.index("statistics answered")


async def test_statistics_the_key_may_not_read_leave_bambuddy_connected(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy refuses its statistics although the key has every scope:
    only they are unknown -- BamBuddy answers, its system figures stay, and
    no new key is asked for."""
    bambuddy_api.get_statistics.side_effect = BamBuddyPermissionError(403, "API key owner does not have 'stats:read' permission")
    entry = await set_up(hass, X1C)
    await next_refresh(hass, freezer, 61)

    assert reauth_flows(hass) == []

    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == "on"
    assert state_of(hass, "sensor", instance_uid(entry, "disk_free")).state not in ("unavailable", "unknown")
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == "unknown"


@pytest.mark.parametrize("failure", ["timeout", "server error"])
async def test_statistics_bambuddy_took_but_did_not_finish_keep_it_connected(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, failure: str
) -> None:
    """BamBuddy's statistics ask every smart plug for its energy, one after another (up to 10 s
    each): one unreachable plug makes them slow. BamBuddy answers -- the last figures stand."""
    entry = await set_up(hass, X1C)
    if failure == "timeout":
        error: Exception = timed_out("GET /archives/stats")
    else:
        error = BamBuddyApiError(500, "Internal Server Error")
    bambuddy_api.get_statistics.side_effect = error
    calls = bambuddy_api.get_statistics.await_count

    await past_the_minute(hass, freezer)

    assert bambuddy_api.get_statistics.await_count > calls
    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == STATE_ON
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == "812"


async def test_statistics_slow_since_the_start_leave_bambuddy_connected_after_it(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A plug does not answer while Home Assistant starts: the setup's read fails in its 10 s; the
    reads after it get their 30 s and, failing too, keep BamBuddy connected (figures unknown)."""
    error = timed_out("GET /archives/stats")
    bambuddy_api.get_statistics.side_effect = error
    entry = await set_up(hass, X1C)
    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == "off"

    await past_the_minute(hass, freezer)

    assert bambuddy_api.get_statistics.await_args.kwargs == {"patient": True}
    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == STATE_ON
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == STATE_UNKNOWN


async def test_statistics_of_a_bambuddy_that_cannot_be_reached_say_so(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.get_statistics.side_effect = BamBuddyConnectionError("GET /archives/stats: Cannot connect to host")

    await past_the_minute(hass, freezer)

    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == "off"


async def test_the_statistics_wait_only_briefly_at_setup(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The printers' setup waits for them: 10 s there, 30 s later."""
    await set_up(hass, X1C)
    assert bambuddy_api.get_statistics.await_args.kwargs == {"patient": False}

    await past_the_minute(hass, freezer)

    assert bambuddy_api.get_statistics.await_args.kwargs == {"patient": True}


async def test_the_setup_does_not_wait_for_the_update_checks(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """They ask GitHub and Bambu Lab through BamBuddy, up to a minute each: the printers come first, the
    update entities once a check answers."""
    answer = asyncio.Event()
    firmware = bambuddy_api.get_firmware_updates.return_value

    async def slow_firmware() -> dict:
        await answer.wait()
        return firmware

    bambuddy_api.get_firmware_updates.side_effect = slow_firmware
    entry = make_entry(hass, X1C)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    assert entry.state is ConfigEntryState.LOADED
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"
    assert state_of(hass, "update", printer_uid(entry, "firmware")).state == "unavailable"
    answer.set()
    await hass.async_block_till_done(wait_background_tasks=True)
    assert state_of(hass, "update", printer_uid(entry, "firmware")).state == "on"


async def test_bambuddys_system_information_may_fail_once(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its archive walk is BamBuddy's slowest answer: the last one stands,
    the statistics still come, BamBuddy still reads as connected."""
    entry = await set_up(hass, X1C)
    free = state_of(hass, "sensor", instance_uid(entry, "disk_free")).state
    bambuddy_api.get_system_info.side_effect = BamBuddyConnectionError("GET /system/info: TimeoutError")
    bambuddy_api.get_statistics.return_value = {**load_fixture("archives_stats.json"), "total_prints": 900}

    await past_polls(hass, freezer, 30)

    assert bambuddy_api.get_system_info.await_count == 2
    assert entry.runtime_data.instance.last_update_success
    assert entry.runtime_data.instance.data["stats"]["total_prints"] == 900
    assert state_of(hass, "sensor", instance_uid(entry, "printers_connected")).state == "2"
    assert state_of(hass, "sensor", instance_uid(entry, "disk_free")).state == free
