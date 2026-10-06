"""The chamber light of a printer."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from homeassistant.const import STATE_OFF, STATE_ON
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from tests.conftest import PRINTER_ID, entity_id, load_fixture, printer_uid, setup_integration


@pytest.mark.parametrize(("light", "state"), [(True, STATE_ON), (False, STATE_OFF)])
async def test_the_chamber_light_shows_bambuddys_state(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    light: bool,
    state: str,
) -> None:
    bambuddy_api.get_printer_status.return_value = {
        **load_fixture("printer_status.json"),
        "chamber_light": light,
    }

    await setup_integration(hass, config_entry)

    switch = entity_id(hass, "switch", printer_uid(config_entry, "chamber_light"))
    assert hass.states.get(switch).state == state


@pytest.mark.parametrize(("service", "on"), [("turn_on", True), ("turn_off", False)])
async def test_switching_the_chamber_light(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    service: str,
    on: bool,
) -> None:
    """The client is asked to switch the light, then the status follows.
    How the client sends that to BamBuddy waits for the review of the
    chamber light pull requests."""
    await setup_integration(hass, config_entry)
    refreshes = bambuddy_api.get_printer_status.await_count

    await hass.services.async_call(
        "switch",
        service,
        {"entity_id": entity_id(hass, "switch", printer_uid(config_entry, "chamber_light"))},
        blocking=True,
    )
    await hass.async_block_till_done()

    bambuddy_api.set_chamber_light.assert_awaited_once_with(PRINTER_ID, on)
    assert bambuddy_api.get_printer_status.await_count == refreshes + 1
