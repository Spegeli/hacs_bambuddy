"""The integration's own timers end when Home Assistant stops."""
from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant

from custom_components.bambuddy.timers import async_call_later_until_stop
from tests.conftest import X1C, next_refresh, set_up
from tests.helpers import with_plugs


async def test_a_timer_runs_when_due(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    fired: list[datetime] = []
    async_call_later_until_stop(hass, 2, fired.append)
    await next_refresh(hass, freezer, 3)
    assert len(fired) == 1


async def test_a_timer_ends_when_home_assistant_stops(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    """Home Assistant closes its web session while it stops: a read after that fails."""
    fired: list[datetime] = []
    async_call_later_until_stop(hass, 2, fired.append)
    hass._cancel_cancellable_timers()  # noqa: SLF001 -- the first stage of async_stop
    await next_refresh(hass, freezer, 3)
    assert fired == []


async def test_a_cancelled_timer_never_runs(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    fired: list[datetime] = []
    async_call_later_until_stop(hass, 2, fired.append)()
    await next_refresh(hass, freezer, 3)
    assert fired == []


async def test_the_reads_after_a_command_end_when_home_assistant_stops(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C)
    printer = entry.runtime_data.printers[X1C]
    plugs = entry.runtime_data.plugs
    statuses, plug_reads = bambuddy_api.get_status.await_count, bambuddy_api.get_plug_status.await_count

    printer.async_refresh_soon()
    plugs.async_refresh_soon()
    hass._cancel_cancellable_timers()  # noqa: SLF001 -- the first stage of async_stop
    await next_refresh(hass, freezer, 5)

    assert bambuddy_api.get_status.await_count == statuses
    assert bambuddy_api.get_plug_status.await_count == plug_reads
