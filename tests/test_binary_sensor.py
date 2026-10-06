"""The binary sensors of a printer."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from homeassistant.const import STATE_OFF, STATE_ON, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from tests.conftest import entity_id, load_fixture, printer_uid, setup_integration

# The binary sensors that show a field of BamBuddy's status as it is.
_FIELDS = ("connected", "sdcard", "wired_network", "developer_mode")

# One active fault as BamBuddy lists it in `hms_errors` (HMSErrorResponse in
# backend/app/schemas/printer.py); the values are invented.
_HMS_ERROR = {
    "code": "0C00_0300",
    "attr": 201326592,
    "module": 12,
    "severity": 2,
    "actions": [],
    "job_id": None,
    "full_code": "0C00030000020001",
    "description": None,
}


def _state(hass: HomeAssistant, entry: MockConfigEntry, key: str) -> str:
    return hass.states.get(entity_id(hass, "binary_sensor", printer_uid(entry, key))).state


@pytest.mark.parametrize("on", [True, False])
@pytest.mark.parametrize("key", _FIELDS)
async def test_each_binary_sensor_shows_its_own_field(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    key: str,
    on: bool,
) -> None:
    """Its field one way, every other field the other way: a sensor that
    read a neighbour's field would show the opposite."""
    status = load_fixture("printer_status.json")
    status.update({field: not on for field in _FIELDS})
    status[key] = on
    bambuddy_api.get_printer_status.return_value = status

    await setup_integration(hass, config_entry)

    assert _state(hass, config_entry, key) == (STATE_ON if on else STATE_OFF)


@pytest.mark.parametrize(("errors", "state"), [([], STATE_OFF), ([_HMS_ERROR], STATE_ON)])
async def test_the_hms_sensor_is_on_while_a_fault_is_active(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    errors: list[dict[str, object]],
    state: str,
) -> None:
    bambuddy_api.get_printer_status.return_value = {
        **load_fixture("printer_status.json"),
        "hms_errors": errors,
    }

    await setup_integration(hass, config_entry)

    assert _state(hass, config_entry, "hms_errors") == state


async def test_an_offline_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    """A printer BamBuddy holds no live state for: not online, no SD card,
    and whether developer mode is on is unknown."""
    bambuddy_api.get_printer_status.return_value = load_fixture("printer_status_offline.json")

    await setup_integration(hass, config_entry)

    assert _state(hass, config_entry, "connected") == STATE_OFF
    assert _state(hass, config_entry, "sdcard") == STATE_OFF
    assert _state(hass, config_entry, "developer_mode") == STATE_UNKNOWN
