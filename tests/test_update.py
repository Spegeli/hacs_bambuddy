"""The update entities: BamBuddy's own releases and each printer's firmware,
shown, never installed."""
from __future__ import annotations

from types import SimpleNamespace

from homeassistant.components.update import ATTR_INSTALLED_VERSION, ATTR_LATEST_VERSION, ATTR_RELEASE_URL
from homeassistant.const import STATE_OFF, STATE_ON, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.bambuddy.api import BamBuddyConnectionError

from tests.conftest import (
    A1_MINI,
    X1C,
    entity_id,
    instance_uid,
    make_entry,
    printer_uid,
    setup_integration,
    state_of,
)


async def test_a_new_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    state = state_of(hass, "update", instance_uid(entry, "bambuddy_update"))
    assert state.state == STATE_ON
    assert (state.attributes[ATTR_INSTALLED_VERSION], state.attributes[ATTR_LATEST_VERSION]) == ("1.2.5.7", "1.2.6")
    assert state.attributes[ATTR_RELEASE_URL].endswith("/v1.2.6")


async def test_firmware(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The X1C has new firmware; for the A1 Mini BamBuddy knows nothing
    newer than what it runs."""
    entry = make_entry(hass, X1C, A1_MINI)
    await setup_integration(hass, entry)

    x1c = state_of(hass, "update", printer_uid(entry, "firmware"))
    assert (x1c.state, x1c.attributes[ATTR_LATEST_VERSION]) == (STATE_ON, "01.09.02.00")
    a1 = state_of(hass, "update", printer_uid(entry, "firmware", A1_MINI))
    assert a1.state == STATE_UNKNOWN
    assert a1.attributes[ATTR_INSTALLED_VERSION] == bambuddy_api.statuses[A1_MINI]["firmware_version"]


async def test_bambuddys_checks_off(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    bambuddy_api.get_update_check.return_value = {
        "update_available": False,
        "current_version": "1.2.5.7",
        "latest_version": "1.2.5.7",
        "message": "Up to date",
    }
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    assert state_of(hass, "update", instance_uid(entry, "bambuddy_update")).state == STATE_OFF


async def test_failed_checks_cost_only_the_update_entities(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    bambuddy_api.get_firmware_updates.side_effect = BamBuddyConnectionError("refused")
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    assert state_of(hass, "update", instance_uid(entry, "bambuddy_update")).state == "unavailable"
    assert state_of(hass, "sensor", printer_uid(entry, "status")).state == "printing"


async def test_the_release_notes(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, hass_ws_client: WebSocketGenerator
) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
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
