"""The update entities: BamBuddy's own releases and each printer's firmware,
shown, never installed."""
from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace

from freezegun.api import FrozenDateTimeFactory

from homeassistant.components.update import ATTR_INSTALLED_VERSION, ATTR_LATEST_VERSION, ATTR_RELEASE_URL
from homeassistant.const import STATE_OFF, STATE_ON, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import async_fire_time_changed
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.bambuddy.api import BamBuddyConnectionError

from tests.conftest import (
    A1_MINI,
    X1C,
    entity_id,
    instance_uid,
    next_refresh,
    printer_uid,
    set_up,
    state_of,
)


async def test_a_new_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    state = state_of(hass, "update", instance_uid(entry, "bambuddy_update"))
    assert state.state == STATE_ON
    assert (state.attributes[ATTR_INSTALLED_VERSION], state.attributes[ATTR_LATEST_VERSION]) == ("1.2.5.7", "1.2.6")
    assert state.attributes[ATTR_RELEASE_URL].endswith("/v1.2.6")


async def test_firmware(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The X1C has new firmware; for the A1 Mini BamBuddy knows nothing
    newer than what it runs."""
    entry = await set_up(hass, X1C, A1_MINI)

    x1c = state_of(hass, "update", printer_uid(entry, "firmware"))
    assert (x1c.state, x1c.attributes[ATTR_LATEST_VERSION]) == (STATE_ON, "01.09.02.00")
    a1 = state_of(hass, "update", printer_uid(entry, "firmware", A1_MINI))
    assert a1.state == STATE_UNKNOWN
    assert a1.attributes[ATTR_INSTALLED_VERSION] == bambuddy_api.statuses[A1_MINI]["firmware_version"]


async def test_a_firmware_the_printer_installed_is_no_update_any_more(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The printer reports its new firmware with its next status: the
    update entity follows at once, not with BamBuddy's next check hours
    later."""
    entry = await set_up(hass, X1C)
    firmware = state_of(hass, "update", printer_uid(entry, "firmware"))
    assert firmware.state == STATE_ON
    latest = firmware.attributes[ATTR_LATEST_VERSION]

    bambuddy_api.statuses[X1C]["firmware_version"] = latest
    await next_refresh(hass, freezer)

    firmware = state_of(hass, "update", printer_uid(entry, "firmware"))
    assert (firmware.state, firmware.attributes[ATTR_INSTALLED_VERSION]) == (STATE_OFF, latest)
    bambuddy_api.get_firmware_updates.assert_awaited_once()


async def test_bambuddys_checks_off(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    bambuddy_api.get_update_check.return_value = {
        "update_available": False,
        "current_version": "1.2.5.7",
        "latest_version": "1.2.5.7",
        "message": "Up to date",
    }
    entry = await set_up(hass, X1C)

    assert state_of(hass, "update", instance_uid(entry, "bambuddy_update")).state == STATE_OFF


async def test_failed_checks_cost_only_the_update_entities(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    bambuddy_api.get_firmware_updates.side_effect = BamBuddyConnectionError("refused")
    bambuddy_api.get_update_check.side_effect = BamBuddyConnectionError("refused")
    entry = await set_up(hass, X1C)

    assert state_of(hass, "update", instance_uid(entry, "bambuddy_update")).state == "unavailable"
    assert state_of(hass, "update", printer_uid(entry, "firmware")).state == "unavailable"
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"


async def test_one_failed_check_leaves_the_other(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The firmware check timing out at Bambu Lab's pages: BamBuddy's own release still shows."""
    bambuddy_api.get_firmware_updates.side_effect = BamBuddyConnectionError("timed out")
    entry = await set_up(hass, X1C)

    assert state_of(hass, "update", instance_uid(entry, "bambuddy_update")).state == STATE_ON
    assert state_of(hass, "update", printer_uid(entry, "firmware")).state == "unavailable"


async def test_a_failed_check_keeps_its_last_answer_and_comes_again_sooner(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """A check that fails later keeps what it last said; it is asked again after a quarter of an hour,
    not six hours, and back on its six hours once it answers."""
    entry = await set_up(hass, X1C)
    firmware = bambuddy_api.get_firmware_updates.return_value
    bambuddy_api.get_firmware_updates.side_effect = BamBuddyConnectionError("timed out")

    freezer.tick(timedelta(hours=6, minutes=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert state_of(hass, "update", printer_uid(entry, "firmware")).state == STATE_ON
    assert state_of(hass, "update", instance_uid(entry, "bambuddy_update")).state == STATE_ON
    assert bambuddy_api.get_firmware_updates.await_count == 2

    bambuddy_api.get_firmware_updates.side_effect = None
    bambuddy_api.get_firmware_updates.return_value = {**firmware, "updates": []}
    freezer.tick(timedelta(minutes=16))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert bambuddy_api.get_firmware_updates.await_count == 3
    assert state_of(hass, "update", printer_uid(entry, "firmware")).state == STATE_UNKNOWN

    freezer.tick(timedelta(minutes=16))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert bambuddy_api.get_firmware_updates.await_count == 3


async def test_the_release_notes(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    entry = await set_up(hass, X1C)
    assert await async_setup_component(hass, "update", {})
    client = await hass_ws_client(hass)

    notes = {}
    for key, unique_id in (
        ("bambuddy", instance_uid(entry, "bambuddy_update")),
        ("firmware", printer_uid(entry, "firmware")),
    ):
        await client.send_json_auto_id({"type": "update/release_notes", "entity_id": entity_id(hass, "update", unique_id)})
        notes[key] = (await client.receive_json())["result"]

    assert notes == {"bambuddy": "Printer access per group.", "firmware": "Improved first layer inspection."}



async def test_the_updates_say_what_they_update(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Home Assistant's list of updates shows the title beside the device: BamBuddy's own, a printer's firmware."""
    entry = await set_up(hass, X1C)

    assert state_of(hass, "update", instance_uid(entry, "bambuddy_update")).attributes["title"] == "BamBuddy"
    assert state_of(hass, "update", printer_uid(entry, "firmware")).attributes["title"] == "Firmware"
