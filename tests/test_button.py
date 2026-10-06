"""The print controls and the other buttons of a printer."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from tests.conftest import PRINTER_ID, entity_id, printer_uid, setup_integration

_ACTIONS = {
    "pause": "pause_print",
    "resume": "resume_print",
    "stop": "stop_print",
    "clear_hms": "clear_hms_errors",
    "clear_plate": "clear_plate",
    "refresh_status": "refresh_printer_status",
}


@pytest.mark.parametrize(("key", "method"), _ACTIONS.items())
async def test_each_button_sends_its_action_then_refreshes(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    key: str,
    method: str,
) -> None:
    """Its own request and no other, then the printer's status at once."""
    await setup_integration(hass, config_entry)
    refreshes = bambuddy_api.get_printer_status.await_count

    await hass.services.async_call(
        "button",
        "press",
        {"entity_id": entity_id(hass, "button", printer_uid(config_entry, key))},
        blocking=True,
    )
    await hass.async_block_till_done()

    getattr(bambuddy_api, method).assert_awaited_once_with(PRINTER_ID)
    assert [name for name in _ACTIONS.values() if getattr(bambuddy_api, name).await_count] == [
        method
    ]
    assert bambuddy_api.get_printer_status.await_count == refreshes + 1
