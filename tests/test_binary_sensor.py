"""The binary sensors: BamBuddy's connection, each printer's connection,
door, plate and the AMS units drying."""
from __future__ import annotations

from types import SimpleNamespace

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.const import STATE_OFF, STATE_ON, STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from custom_components.bambuddy.api import BamBuddyConnectionError
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import (
    A1_MINI,
    H2D,
    X1C,
    ams_uid,
    instance_uid,
    make_entry,
    next_refresh,
    printer_uid,
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
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    assert state_of(hass, "binary_sensor", printer_uid(entry, key)).state == state


async def test_the_plate_waiting_to_be_cleared(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[X1C].update({"state": "FINISH", "awaiting_plate_clear": True})

    await next_refresh(hass, freezer)

    state = state_of(hass, "binary_sensor", printer_uid(entry, "awaiting_plate_clear"))
    assert (state.state, state.attributes["friendly_name"]) == (STATE_ON, "Workshop (X1C / 00M00A000000001) Build plate")
    # A problem: BamBuddy's queue starts no print until the plate is clear.
    assert state.attributes["device_class"] == "problem"


async def test_an_a1_mini_has_no_door_and_no_sd_card(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, A1_MINI)
    await setup_integration(hass, entry)
    registry = er.async_get(hass)

    for key in ("door", "sdcard", "wired_network"):
        assert registry.async_get_entity_id("binary_sensor", DOMAIN, printer_uid(entry, key, A1_MINI)) is None, key


async def test_an_ams_unit_drying(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy's REST status leaves the drying phase at 0: the minutes left
    tell."""
    entry = make_entry(hass, H2D)
    await setup_integration(hass, entry)

    assert state_of(hass, "binary_sensor", ams_uid(entry, 128, "drying", H2D)).state == STATE_ON
    assert state_of(hass, "binary_sensor", ams_uid(entry, 0, "drying", H2D)).state == STATE_OFF


async def test_a_stalled_countdown_is_no_drying(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    entry = make_entry(hass, H2D)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[H2D]["ams"][1]["dry_countdown_stalled"] = True

    await next_refresh(hass, freezer)

    assert state_of(hass, "binary_sensor", ams_uid(entry, 128, "drying", H2D)).state == STATE_OFF


async def test_bambuddy_unreachable_is_told_not_hidden(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """The connection sensor stays available when BamBuddy stops answering,
    so that an automation can react."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == STATE_ON
    bambuddy_api.get_system_info.side_effect = BamBuddyConnectionError("refused")

    freezer.tick(61)
    await next_refresh(hass, freezer)

    assert state_of(hass, "binary_sensor", instance_uid(entry, "connected")).state == STATE_OFF
    assert state_of(hass, "sensor", instance_uid(entry, "total_prints")).state == STATE_UNAVAILABLE


async def test_the_sd_card_is_plugged_in(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Presence would read "home" or "away"."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    assert state_of(hass, "binary_sensor", printer_uid(entry, "sdcard")).attributes["device_class"] == "plug"


async def test_a_wired_printer_says_so(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    """On a cable the Wi-Fi signal is empty; this sensor tells why."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.statuses[X1C]["wired_network"] = True

    await next_refresh(hass, freezer)

    assert state_of(hass, "binary_sensor", printer_uid(entry, "wired_network")).state == STATE_ON
