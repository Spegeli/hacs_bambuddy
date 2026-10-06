"""The sensors: the instance's figures and each printer's status."""
from __future__ import annotations

from types import SimpleNamespace

from homeassistant.const import STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from tests.conftest import entity_id, load_fixture, printer_uid, setup_integration


def _sensors(hass: HomeAssistant, entry: MockConfigEntry) -> int:
    """How many sensors the entry has registered."""
    return sum(
        registered.domain == "sensor"
        for registered in er.async_entries_for_config_entry(er.async_get(hass), entry.entry_id)
    )


async def test_an_offline_printer_keeps_every_sensor(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    """BamBuddy holds no live state for a printer that is off: its status
    comes with every field at its default, the temperatures null. The
    sensors stay -- but the chamber one, as on every setup without a
    chamber value -- and show no temperature."""
    bambuddy_api.get_printer_status.return_value = load_fixture("printer_status_offline.json")

    await setup_integration(hass, config_entry)

    assert _sensors(hass, config_entry) == 35
    for key in ("nozzle_temp", "nozzle_target", "bed_temp", "bed_target"):
        state = hass.states.get(entity_id(hass, "sensor", printer_uid(config_entry, key)))
        assert state.state == STATE_UNKNOWN, key
