"""Maintenance as BamBuddy keeps it, each printer its own: a sensor with
the tasks, read every ten minutes and after a print, and marking a task
done."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.bambuddy.api import BamBuddyApiError, BamBuddyConnectionError, BamBuddyPermissionError
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import (
    X1C,
    device_id,
    load_fixture,
    next_refresh,
    printer_device,
    printer_uid,
    set_up,
    state_of,
)



def _maintenance(hass: HomeAssistant, entry: Any) -> Any:
    return state_of(hass, "sensor", printer_uid(entry, "maintenance"))


async def _mark_done(hass: HomeAssistant, entry: Any, task: int) -> None:
    await hass.services.async_call(
        DOMAIN,
        "mark_maintenance_done",
        {"device_id": device_id(hass, entry, printer_device(entry, X1C)), "task_id": task},
        blocking=True,
    )


async def test_the_maintenance_of_a_printer(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Overdue when a task is due; its enabled tasks as BamBuddy counts them,
    each with what is left (negative: overdue) -- hours, or days."""
    entry = await set_up(hass, X1C)

    state = _maintenance(hass, entry)
    assert state.state == "overdue"
    assert state.attributes["friendly_name"].endswith("Maintenance")
    assert (state.attributes["due_count"], state.attributes["due_soon_count"]) == (2, 1)
    assert "can_mark_done" not in state.attributes
    tasks = state.attributes["tasks"]
    assert [task["id"] for task in tasks] == [11, 12, 13, 14, 15]
    assert tasks[0] == {
        "id": 11,
        "name": "Clean Build Plate",
        "due": True,
        "due_soon": False,
        "unit": "hours",
        "interval": 25.0,
        "left": -12.5,
        "last_done": "2026-09-20T10:00:00+00:00",
    }
    assert (tasks[3]["last_done"], tasks[4]["unit"], tasks[4]["left"]) == (None, "days", 20)
    bambuddy_api.get_maintenance.assert_awaited_once_with(X1C)


@pytest.mark.parametrize(
    ("due", "soon", "expected"),
    [(False, True, "due_soon"), (False, False, "ok")],
)
async def test_due_soon_and_all_done(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, due: bool, soon: bool, expected: str
) -> None:
    entry = await set_up(hass, X1C)
    for task in bambuddy_api.maintenance[X1C]["maintenance_items"]:
        task.update({"is_due": due, "is_warning": soon and task["id"] == 12})

    freezer.tick(600)
    await next_refresh(hass, freezer)

    assert _maintenance(hass, entry).state == expected


async def test_read_every_ten_minutes_and_after_a_print(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Each read writes to BamBuddy's database: not with every status."""
    await set_up(hass, X1C)
    await next_refresh(hass, freezer)
    assert bambuddy_api.get_maintenance.await_count == 1

    # The print ends: its hours count now.
    bambuddy_api.statuses[X1C]["state"] = "FINISH"
    await next_refresh(hass, freezer)
    await next_refresh(hass, freezer)
    assert bambuddy_api.get_maintenance.await_count == 2

    freezer.tick(600)
    await next_refresh(hass, freezer)
    assert bambuddy_api.get_maintenance.await_count == 3


async def test_a_failed_read_keeps_what_was_read(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.get_maintenance.side_effect = BamBuddyConnectionError("refused")

    freezer.tick(600)
    await next_refresh(hass, freezer)

    assert _maintenance(hass, entry).state == "overdue"


async def test_unavailable_until_read(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The printer's status goes on without it."""
    read = bambuddy_api.get_maintenance.side_effect
    bambuddy_api.get_maintenance.side_effect = BamBuddyConnectionError("refused")
    entry = await set_up(hass, X1C)
    assert _maintenance(hass, entry).state == STATE_UNAVAILABLE

    bambuddy_api.get_maintenance.side_effect = read
    freezer.tick(600)
    await next_refresh(hass, freezer)

    assert _maintenance(hass, entry).state == "overdue"


async def test_known_while_the_printer_is_offline(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """BamBuddy keeps it, not the printer."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C] = load_fixture("status_offline.json")

    await next_refresh(hass, freezer)

    assert _maintenance(hass, entry).state == "overdue"


async def test_marking_a_task_done(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The tasks are read again at once -- also with the printer offline:
    BamBuddy keeps them."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C] = load_fixture("status_offline.json")
    await next_refresh(hass, freezer)
    bambuddy_api.maintenance[X1C]["maintenance_items"][0].update({"is_due": False, "hours_until_due": 25.0})
    bambuddy_api.maintenance[X1C]["due_count"] = 1

    await _mark_done(hass, entry, 11)

    bambuddy_api.perform_maintenance.assert_awaited_once_with(11)
    assert _maintenance(hass, entry).attributes["due_count"] == 1


async def test_marking_done_a_task_the_printer_lacks(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    with pytest.raises(ServiceValidationError) as raised:
        await _mark_done(hass, entry, 99)

    assert raised.value.translation_key == "maintenance_task_unknown"
    bambuddy_api.perform_maintenance.assert_not_awaited()


async def test_bambuddy_refusing_to_mark_done(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.perform_maintenance.side_effect = BamBuddyConnectionError("refused")

    with pytest.raises(HomeAssistantError):
        await _mark_done(hass, entry, 11)


async def test_marking_done_does_not_hide_a_failing_status(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The tasks are read again; the printer's failed status read stands."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_status.side_effect = BamBuddyApiError(500, "Internal Server Error")
    await next_refresh(hass, freezer)
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == STATE_UNAVAILABLE

    await _mark_done(hass, entry, 11)

    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == STATE_UNAVAILABLE


async def test_no_answer_while_marking_done(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A command BamBuddy may have carried out: said so, and the tasks are
    read again to tell."""
    entry = await set_up(hass, X1C)
    timeout = BamBuddyConnectionError("POST /maintenance/items/11/perform: TimeoutError")
    timeout.__cause__ = TimeoutError()
    bambuddy_api.perform_maintenance.side_effect = timeout

    with pytest.raises(HomeAssistantError) as raised:
        await _mark_done(hass, entry, 11)

    assert raised.value.translation_key == "no_answer"
    assert bambuddy_api.get_maintenance.await_count == 2


async def test_an_older_read_never_overwrites_the_one_after_marking_done(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A poll's read that started before the task was marked done may answer
    after the read that followed it: it is dropped."""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    gate = asyncio.Event()
    fresh = {**load_fixture("maintenance_x1c.json"), "maintenance_items": []}
    stale = load_fixture("maintenance_x1c.json")
    calls = 0

    async def read(printer_id: int) -> dict[str, Any]:
        nonlocal calls
        calls += 1
        if calls == 1:
            await gate.wait()
            return stale
        return fresh

    bambuddy_api.get_maintenance.side_effect = read
    freezer.tick(600)
    poll = hass.async_create_task(coordinator.async_refresh())
    for _ in range(5):
        await asyncio.sleep(0)

    await _mark_done(hass, entry, 11)
    gate.set()
    await poll
    # And the status read the command asks for shortly after.
    freezer.tick(2)
    async_fire_time_changed(hass)
    await hass.async_block_till_done()

    assert _maintenance(hass, entry).attributes["tasks"] == []


async def test_marking_done_a_disabled_task_or_before_the_first_read(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy marks a disabled task done as well; without a read yet, it
    decides itself."""
    read = bambuddy_api.get_maintenance.side_effect
    bambuddy_api.get_maintenance.side_effect = BamBuddyConnectionError("refused")
    entry = await set_up(hass, X1C)

    await _mark_done(hass, entry, 11)
    bambuddy_api.get_maintenance.side_effect = read
    await _mark_done(hass, entry, 16)

    assert [call.args for call in bambuddy_api.perform_maintenance.await_args_list] == [(11,), (16,)]


async def test_marking_maintenance_refused_asks_the_guard(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The key's owner lost Manage Maintenance: the refusal names the
    missing scopes, and Home Assistant asks for a new key."""
    entry = await set_up(hass, X1C)
    bambuddy_api.perform_maintenance.side_effect = BamBuddyPermissionError(403, "no", "POST /maintenance/items/11/perform")
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_viewer.json")

    with pytest.raises(HomeAssistantError) as raised:
        await _mark_done(hass, entry, 11)
    await hass.async_block_till_done()

    assert raised.value.translation_key == "key_scopes_missing"
    assert [flow["context"]["source"] for flow in hass.config_entries.flow.async_progress()] == ["reauth"]
