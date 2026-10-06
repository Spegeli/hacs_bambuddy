"""The sensors: the instance's figures and each printer's status."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from homeassistant.const import STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.bambuddy.const import DOMAIN

from tests.conftest import (
    entity_id,
    instance_uid,
    load_fixture,
    printer_uid,
    setup_integration,
)


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


@pytest.mark.parametrize(
    ("key", "state"),
    [
        ("version", "0.2.4.5"),
        ("health_status", "healthy"),
        ("uptime", "25.0"),
        ("total_prints", "40"),
        ("successful_prints", "36"),
        ("failed_prints", "3"),
        ("total_print_time", "123.4"),
        ("total_filament_used", "2345.6"),
        ("archive_count", "42"),
        ("printers_total", "2"),
        ("printers_connected", "1"),
        ("disk_free", "50.0"),
        ("disk_percent_used", "37.5"),
    ],
)
async def test_the_instance_sensors_show_bambuddys_figures(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    key: str,
    state: str,
) -> None:
    """The uptime in hours from BamBuddy's seconds, the free disk space in
    GB from its bytes; the rest as BamBuddy sends it."""
    await setup_integration(hass, config_entry)

    assert hass.states.get(entity_id(hass, "sensor", instance_uid(config_entry, key))).state == state


@pytest.mark.parametrize(
    ("key", "state"),
    [
        ("status", "RUNNING"),
        ("current_print", "benchy.3mf"),
        ("progress", "42.0"),
        ("remaining_time", "37"),
        ("current_layer", "120"),
        ("total_layers", "250"),
        ("nozzle_temp", "218.5"),
        ("nozzle_target", "220.0"),
        ("bed_temp", "59.5"),
        ("bed_target", "60.0"),
        ("chamber_temp", "32.0"),
        ("subtask_name", "Benchy"),
        ("gcode_file", "/data/Metadata/plate_1.gcode"),
        ("cooling_fan_speed", "100"),
        ("aux_fan_speed", "50"),
        ("chamber_fan_speed", "30"),
        ("heatbreak_fan_speed", "90"),
        ("printable_objects_count", "3"),
        ("ip_address", "192.0.2.10"),
        ("firmware_version", "01.08.02.00"),
        ("wifi_signal", "-48"),
        ("model", "X1C"),
    ],
)
async def test_the_printer_sensors_show_the_status(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    key: str,
    state: str,
) -> None:
    """Each sensor from its own field of BamBuddy's answer -- the current
    layer from `layer_num`, the auxiliary and chamber fans from
    `big_fan1_speed` and `big_fan2_speed`."""
    await setup_integration(hass, config_entry)

    assert hass.states.get(entity_id(hass, "sensor", printer_uid(config_entry, key))).state == state


async def test_the_current_print_falls_back_to_the_subtask(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    bambuddy_api.get_printer_status.return_value = {
        **load_fixture("printer_status.json"),
        "current_print": None,
    }

    await setup_integration(hass, config_entry)

    current = entity_id(hass, "sensor", printer_uid(config_entry, "current_print"))
    assert hass.states.get(current).state == "Benchy"


async def test_the_chamber_sensor_exists_only_with_a_chamber_value(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    """A printer without a chamber sensor (the A1 mini) reports none."""
    status = load_fixture("printer_status.json")
    del status["temperatures"]["chamber"]
    bambuddy_api.get_printer_status.return_value = status

    await setup_integration(hass, config_entry)

    assert _sensors(hass, config_entry) == 35
    registry = er.async_get(hass)
    chamber = printer_uid(config_entry, "chamber_temp")
    assert registry.async_get_entity_id("sensor", DOMAIN, chamber) is None
