"""Edge cases of BamBuddy's answers and of the user's moves, found in
reviews: a printer BamBuddy has not heard from, drying refused by its
cause, a reused printer number, reads that are no commands."""
from __future__ import annotations

import copy
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import issue_registry as ir

from custom_components.bambuddy.api import BamBuddyConnectionError
from custom_components.bambuddy.const import DOMAIN
from custom_components.bambuddy.diagnostics import async_get_device_diagnostics

from tests.conftest import (
    API_KEY,
    H2D,
    P1S,
    X1C,
    ams_device,
    device_id,
    entity_id,
    load_fixture,
    next_refresh,
    no_entity,
    printer_device,
    printer_uid,
    set_up,
)


def _client_never_reached(printer_id: int) -> dict[str, Any]:
    """BamBuddy 1.2.5.7 just restarted, the printer off: init_printer_connections
    made an MQTT client for every active printer, so get_status answers from a
    PrinterState that never got a message -- connected False, state "unknown",
    temperatures {} (an empty dict, not None), print options at their
    defaults, supports_chamber_heater from the model."""
    status = load_fixture("status_never.json")
    status.update(
        {
            "id": printer_id,
            "state": "unknown",
            "progress": 0.0,
            "remaining_time": 0,
            "layer_num": 0,
            "total_layers": 0,
            "temperatures": {},
            "print_options": copy.deepcopy(load_fixture("status_h2d.json")["print_options"]),
            "supports_chamber_heater": True,
        }
    )
    return status


@pytest.mark.parametrize("never", ["no client", "client never heard from"])
async def test_a_printer_off_at_bambuddys_restart_completes_itself(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, never: str
) -> None:
    """BamBuddy restarted while the printer was off: it answers with its
    defaults -- temperatures null without a client, empty with one that has
    not heard from the printer. The first full status reloads the entry once."""
    if never == "no client":
        status = load_fixture("status_never.json")
        status["id"] = H2D
    else:
        status = _client_never_reached(H2D)
    bambuddy_api.statuses[H2D] = status
    entry = await set_up(hass, H2D)
    keys = (("sensor", "chamber_temp"), ("switch", "ams_filament_backup"))
    assert all(no_entity(hass, domain, printer_uid(entry, key, H2D)) for domain, key in keys)

    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        bambuddy_api.statuses[H2D] = load_fixture("status_h2d.json")
        for _ in range(3):
            await next_refresh(hass, freezer)

    reload.assert_called_once_with(entry.entry_id)


@pytest.mark.parametrize(
    ("screen_only", "key"),
    [(True, "dry_on_screen"), (False, "dry_firmware")],
)
async def test_drying_refused_by_its_cause(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, screen_only: bool, key: str
) -> None:
    """An AMS 2 Pro on a P1S dries only from the printer's screen; on old
    firmware not from here at all. The unit can dry: the refusal says why
    not now."""
    status = bambuddy_api.statuses[P1S]
    status["ams"][0]["module_type"] = "n3f"
    status["supports_drying"] = False
    status["drying_screen_only"] = screen_only
    entry = await set_up(hass, P1S)

    with pytest.raises(ServiceValidationError) as raised:
        await hass.services.async_call(
            DOMAIN,
            "start_drying",
            {"device_id": device_id(hass, entry, ams_device(entry, P1S, 0)), "temperature": 55, "duration": 8},
            blocking=True,
        )

    assert raised.value.translation_key == key


async def test_resume_on_a_running_print_says_it_is_not_paused(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """An AMS change during a running print: waiting would not help."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["ams_status_main"] = 1
    await next_refresh(hass, freezer)

    with pytest.raises(ServiceValidationError) as raised:
        await hass.services.async_call(
            "button", "press", {"entity_id": entity_id(hass, "button", printer_uid(entry, "resume"))}, blocking=True
        )

    assert raised.value.translation_key == "not_paused"


async def test_reading_the_objects_is_no_command(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A read keeps a poll under way: it brings nothing new to wait for."""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    before = coordinator._commands

    await hass.services.async_call(
        DOMAIN,
        "get_print_objects",
        {"device_id": device_id(hass, entry, printer_device(entry, X1C))},
        blocking=True,
        return_response=True,
    )

    assert coordinator._commands == before


async def test_a_command_tells_the_coordinator(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Every command through a light, a button or an action marks the
    moment: a status read under way then keeps the state from before it
    (test_init's test_a_poll_from_before_a_command_does_not_undo_it)."""
    entry = await set_up(hass, X1C)
    coordinator = entry.runtime_data.printers[X1C]
    before = coordinator._commands

    await hass.services.async_call(
        "light", "turn_off", {"entity_id": entity_id(hass, "light", printer_uid(entry, "chamber_light"))}, blocking=True
    )

    assert coordinator._commands == before + 1


async def test_the_names_notice_goes_with_its_entry(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    printer = dr.async_get(hass).async_get(device_id(hass, entry, printer_device(entry, X1C)))
    assert printer is not None
    dr.async_get(hass).async_update_device(printer.id, name_by_user="Mine")
    for _ in range(6):
        await next_refresh(hass, freezer)
    issue_id = f"names_from_bambuddy_{entry.entry_id}"
    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is not None

    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()

    assert ir.async_get(hass).async_get_issue(DOMAIN, issue_id) is None


async def test_device_diagnostics_of_an_entry_that_did_not_load(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entry's part then, without a secret."""
    entry = await set_up(hass, X1C)
    device = dr.async_get(hass).async_get(device_id(hass, entry, printer_device(entry, X1C)))
    assert device is not None
    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()

    diagnostics = await async_get_device_diagnostics(hass, entry, device)

    assert diagnostics["entry"]["state"] == "not_loaded"
    assert API_KEY not in str(diagnostics)


async def test_the_replaced_refusal_names_this_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The newcomer's name never becomes this printer's: the serial is
    checked first."""
    entry = await set_up(hass, X1C)
    a1_mini = next(printer for printer in load_fixture("printers.json") if printer["id"] == 2)
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = {**a1_mini, "id": X1C}
    bambuddy_api.get_runtime.return_value = {"total_hours": 3.0, "printer_name": a1_mini["name"]}
    bambuddy_api.statuses[X1C] = load_fixture("status_a1mini.json")

    with patch.object(hass.config_entries, "async_schedule_reload"):
        for _ in range(6):
            await next_refresh(hass, freezer)
        device = dr.async_get(hass).async_get(device_id(hass, entry, printer_device(entry, X1C)))
        assert device is not None
        with pytest.raises(ServiceValidationError) as raised:
            await hass.services.async_call(DOMAIN, "home_axes", {"device_id": device.id}, blocking=True)

    assert raised.value.translation_placeholders == {"printer": "Workshop"}


async def test_another_name_under_the_number_is_checked_at_once(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Renumbered just after a minute read: the status names another
    printer, so its details are read in the same refresh -- no command
    reaches the newcomer."""
    entry = await set_up(hass, X1C)
    a1_mini = next(printer for printer in load_fixture("printers.json") if printer["id"] == 2)
    for _ in range(6):
        await next_refresh(hass, freezer)
    bambuddy_api.get_printer.side_effect = None
    bambuddy_api.get_printer.return_value = {**a1_mini, "id": X1C}
    bambuddy_api.statuses[X1C] = {**load_fixture("status_a1mini.json"), "name": a1_mini["name"]}
    with patch.object(hass.config_entries, "async_schedule_reload"):
        await next_refresh(hass, freezer)
        device = dr.async_get(hass).async_get(device_id(hass, entry, printer_device(entry, X1C)))
        assert device is not None
        with pytest.raises(ServiceValidationError):
            await hass.services.async_call(DOMAIN, "home_axes", {"device_id": device.id}, blocking=True)

    bambuddy_api.home_axes.assert_not_awaited()


async def test_a_command_bambuddy_does_not_answer_in_time(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    timeout = BamBuddyConnectionError("POST /printers/1/print/pause: TimeoutError")
    timeout.__cause__ = TimeoutError()
    bambuddy_api.pause.side_effect = timeout

    with pytest.raises(HomeAssistantError) as raised:
        await hass.services.async_call(
            "button", "press", {"entity_id": entity_id(hass, "button", printer_uid(entry, "pause"))}, blocking=True
        )

    assert raised.value.translation_key == "no_answer"


async def test_bambuddys_system_information_may_fail_once(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """Its archive walk is BamBuddy's slowest answer: the last one stands,
    the statistics still come, BamBuddy still reads as connected."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_system_info.side_effect = BamBuddyConnectionError("GET /system/info: TimeoutError")
    bambuddy_api.get_statistics.return_value = {**load_fixture("archives_stats.json"), "total_prints": 900}

    for _ in range(30):
        await next_refresh(hass, freezer)

    assert entry.runtime_data.instance.last_update_success
    assert entry.runtime_data.instance.data["stats"]["total_prints"] == 900
