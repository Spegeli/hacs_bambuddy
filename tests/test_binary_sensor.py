"""The binary sensors: BamBuddy's connection, each printer's connection,
door, plate and the AMS units drying."""
from __future__ import annotations

import json
from types import SimpleNamespace

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.const import STATE_OFF, STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from custom_components.bambuddy.api import BamBuddyConnectionError
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import (
    A1_MINI,
    H2D,
    INTEGRATION,
    X1C,
    ams_uid,
    instance_uid,
    load_fixture,
    make_entry,
    next_refresh,
    no_entity,
    printer_uid,
    set_up,
    setup_integration,
    state_of,
)


@pytest.mark.parametrize(
    ("key", "state"),
    [
        ("connected", STATE_ON),
        ("door", STATE_OFF),
        ("awaiting_plate_clear", STATE_OFF),
        ("sdcard", STATE_ON),
        ("developer_mode", STATE_ON),
    ],
)
async def test_the_x1c(hass: HomeAssistant, bambuddy_api: SimpleNamespace, key: str, state: str) -> None:
    entry = await set_up(hass, X1C)

    assert state_of(hass, "binary_sensor", printer_uid(entry, key)).state == state


async def test_the_plate_waiting_to_be_cleared(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C].update({"state": "FINISH", "awaiting_plate_clear": True})

    await next_refresh(hass, freezer)

    state = state_of(hass, "binary_sensor", printer_uid(entry, "awaiting_plate_clear"))
    assert (state.state, state.attributes["friendly_name"]) == (STATE_ON, "Workshop (X1C / 00M00A000000001) Build plate")
    # A problem: BamBuddy's queue starts no print until the plate is clear.
    assert state.attributes["device_class"] == "problem"


async def test_an_a1_mini_has_no_door_but_a_microsd_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, A1_MINI)

    for key in ("door", "wired_network"):
        assert no_entity(hass, "binary_sensor", printer_uid(entry, key, A1_MINI)), key
    card = state_of(hass, "binary_sensor", printer_uid(entry, "sdcard", A1_MINI))
    assert (card.state, card.attributes["friendly_name"].endswith("SD card")) == (STATE_OFF, True)


async def test_the_h2d_stores_on_a_usb_drive(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The H2 series, the P2S and the X2D have no SD slot: BamBuddy's flag
    tells a USB drive there."""
    entry = await set_up(hass, H2D)

    drive = state_of(hass, "binary_sensor", printer_uid(entry, "sdcard", H2D))
    assert (drive.state, drive.attributes["friendly_name"].endswith("USB drive")) == (STATE_ON, True)


async def test_an_ams_unit_drying(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy's REST status leaves the drying phase at 0: the minutes left
    tell."""
    entry = await set_up(hass, H2D)

    assert state_of(hass, "binary_sensor", ams_uid(entry, 128, "drying", H2D)).state == STATE_ON
    assert state_of(hass, "binary_sensor", ams_uid(entry, 0, "drying", H2D)).state == STATE_OFF


async def test_a_wired_network_sensor_left_from_1x_goes_where_there_is_no_port(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """1.x gave every printer a Wired network sensor; only the X1E and the H2D Pro have a port."""
    printers = load_fixture("printers.json")
    for printer in printers:
        if printer["id"] == X1C:
            printer["model"] = "X1E"
    bambuddy_api.get_printers.return_value = printers
    entry = make_entry(hass, X1C, A1_MINI)
    registry = er.async_get(hass)
    for printer in (X1C, A1_MINI):
        registry.async_get_or_create("binary_sensor", DOMAIN, printer_uid(entry, "wired_network", printer), config_entry=entry)

    await setup_integration(hass, entry)

    assert registry.async_get_entity_id("binary_sensor", DOMAIN, printer_uid(entry, "wired_network", X1C)) is not None
    assert registry.async_get_entity_id("binary_sensor", DOMAIN, printer_uid(entry, "wired_network", A1_MINI)) is None


async def test_a_stalled_countdown_is_no_drying(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, H2D)
    bambuddy_api.statuses[H2D]["ams"][1]["dry_countdown_stalled"] = True

    await next_refresh(hass, freezer)

    assert state_of(hass, "binary_sensor", ams_uid(entry, 128, "drying", H2D)).state == STATE_OFF
    # A timer that does not count down leaves no time to wait for.
    assert state_of(hass, "sensor", ams_uid(entry, 128, "drying_remaining_time", H2D)).state == STATE_UNKNOWN


def test_the_drying_sensor_says_drying_not_running() -> None:
    """Home Assistant's words for its device class read "Außer Betrieb" in German -- out of service."""
    for name, on, off in (("strings.json", "Drying", "Not drying"), ("translations/de.json", "Trocknet", "Trocknet nicht")):
        texts = json.loads((INTEGRATION / name).read_text(encoding="utf-8"))
        assert texts["entity"]["binary_sensor"]["drying"]["state"] == {"on": on, "off": off}, name


async def test_bambuddy_unreachable_is_told_not_hidden(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The connection sensor stays available when BamBuddy stops answering,
    so that an automation can react."""
    entry = await set_up(hass, X1C)
    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == STATE_ON
    for read in (bambuddy_api.get_system_info, bambuddy_api.get_statistics):
        read.side_effect = BamBuddyConnectionError("refused")

    freezer.tick(61)
    await next_refresh(hass, freezer)

    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == STATE_OFF
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == STATE_UNAVAILABLE


async def test_the_sd_card_is_plugged_in(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Presence would read "home" or "away"."""
    entry = await set_up(hass, X1C)

    assert state_of(hass, "binary_sensor", printer_uid(entry, "sdcard")).attributes["device_class"] == "plug"


async def test_a_wired_printer_says_so(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """On a cable the Wi-Fi signal is empty; this sensor tells why. Only the X1E and the H2D Pro have a
    port (Bambu's spec pages): an H2D has no such sensor."""
    printers = load_fixture("printers.json")
    for printer in printers:
        if printer["id"] == X1C:
            printer["model"] = "X1E"
    bambuddy_api.get_printers.return_value = printers
    entry = await set_up(hass, X1C, H2D)
    bambuddy_api.statuses[X1C]["wired_network"] = True

    await next_refresh(hass, freezer)

    assert state_of(hass, "binary_sensor", printer_uid(entry, "wired_network")).state == STATE_ON
    assert no_entity(hass, "binary_sensor", printer_uid(entry, "wired_network", H2D))
