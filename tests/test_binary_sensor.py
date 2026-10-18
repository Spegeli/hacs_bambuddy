"""The binary sensors: BamBuddy's connection, each printer's connection,
door, plate and the AMS units drying."""
from __future__ import annotations

from types import SimpleNamespace

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.const import STATE_OFF, STATE_ON, STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant

from custom_components.bambuddy.api import BamBuddyConnectionError

from tests.conftest import (
    A1_MINI,
    H2D,
    X1C,
    ams_uid,
    instance_uid,
    next_refresh,
    no_entity,
    printer_uid,
    set_up,
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


async def test_a_stalled_countdown_is_no_drying(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = await set_up(hass, H2D)
    bambuddy_api.statuses[H2D]["ams"][1]["dry_countdown_stalled"] = True

    await next_refresh(hass, freezer)

    assert state_of(hass, "binary_sensor", ams_uid(entry, 128, "drying", H2D)).state == STATE_OFF


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
    """On a cable the Wi-Fi signal is empty; this sensor tells why."""
    entry = await set_up(hass, X1C)
    bambuddy_api.statuses[X1C]["wired_network"] = True

    await next_refresh(hass, freezer)

    assert state_of(hass, "binary_sensor", printer_uid(entry, "wired_network")).state == STATE_ON
