"""The print speed of a printer."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from homeassistant.const import STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from tests.conftest import PRINTER_ID, entity_id, load_fixture, printer_uid, setup_integration

_OPTIONS = ["Silent (50%)", "Standard (100%)", "Sport (124%)", "Ludicrous (166%)"]


def _with_level(level: int) -> dict[str, object]:
    return {**load_fixture("printer_status.json"), "speed_level": level}


@pytest.mark.parametrize(("level", "option"), enumerate(_OPTIONS, start=1))
async def test_the_print_speed_shows_bambuddys_level(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    level: int,
    option: str,
) -> None:
    """BamBuddy's `speed_level` 1 to 4, offered in that order."""
    bambuddy_api.get_printer_status.return_value = _with_level(level)

    await setup_integration(hass, config_entry)

    state = hass.states.get(entity_id(hass, "select", printer_uid(config_entry, "print_speed")))
    assert state.state == option
    assert state.attributes["options"] == _OPTIONS


async def test_an_unknown_level_shows_no_option(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    bambuddy_api.get_printer_status.return_value = _with_level(9)

    await setup_integration(hass, config_entry)

    state = hass.states.get(entity_id(hass, "select", printer_uid(config_entry, "print_speed")))
    assert state.state == STATE_UNKNOWN


async def test_choosing_a_speed_sends_its_level_then_refreshes(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    await setup_integration(hass, config_entry)
    refreshes = bambuddy_api.get_printer_status.await_count

    await hass.services.async_call(
        "select",
        "select_option",
        {
            "entity_id": entity_id(hass, "select", printer_uid(config_entry, "print_speed")),
            "option": "Sport (124%)",
        },
        blocking=True,
    )
    await hass.async_block_till_done()

    bambuddy_api.set_print_speed.assert_awaited_once_with(PRINTER_ID, 3)
    assert bambuddy_api.get_printer_status.await_count == refreshes + 1
