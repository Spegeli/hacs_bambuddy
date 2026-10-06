"""Setting the entry up and down, the coordinators, the devices."""
from __future__ import annotations

from collections import Counter
from datetime import timedelta
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed
from pytest_homeassistant_custom_component.typing import WebSocketGenerator

from custom_components.bambuddy.api import BamBuddyApiError
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import (
    HOST,
    PRINTER_ID,
    PRINTER_NAME,
    entity_id,
    instance_uid,
    load_fixture,
    printer_uid,
    setup_integration,
)

_STRINGS = json.loads(
    (Path(__file__).parent.parent / "custom_components" / "bambuddy" / "strings.json").read_text(
        encoding="utf-8"
    )
)
_PRINTERS = {printer["id"]: printer for printer in load_fixture("printers.json")}
_SECOND = {"printer_id": 2, "printer_name": "A1 mini (0309CA000000002)"}


def _platforms(hass: HomeAssistant, entry: MockConfigEntry) -> Counter[str]:
    """How many entities of each platform the entry has registered."""
    return Counter(
        registered.domain
        for registered in er.async_entries_for_config_entry(er.async_get(hass), entry.entry_id)
    )


def _device(hass: HomeAssistant, entry: MockConfigEntry, identifier: str) -> dr.DeviceEntry:
    """The entry's device with `identifier`, found among the entry's devices:
    newer Home Assistant releases deprecate looking a device up by its
    identifiers alone, and 2025.5 has no other way."""
    [device] = [
        device
        for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id)
        if (DOMAIN, identifier) in device.identifiers
    ]
    return device


def _printer_device(hass: HomeAssistant, entry: MockConfigEntry, printer_id: int) -> dr.DeviceEntry:
    return _device(hass, entry, f"{entry.entry_id}_printer_{printer_id}")


def _instance_device(hass: HomeAssistant, entry: MockConfigEntry) -> dr.DeviceEntry:
    return _device(hass, entry, entry.entry_id)


def _add_second_printer(
    hass: HomeAssistant, entry: MockConfigEntry, bambuddy_api: SimpleNamespace
) -> None:
    """Printer 2 in Configure as well, and BamBuddy answering for it."""
    bambuddy_api.get_printer.side_effect = lambda printer_id: _PRINTERS[printer_id]
    hass.config_entries.async_update_entry(
        entry, options={"printers": [*entry.options["printers"], _SECOND]}
    )


async def _wait(hass: HomeAssistant, freezer: FrozenDateTimeFactory, seconds: int) -> None:
    freezer.tick(timedelta(seconds=seconds))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()


async def _next_refresh(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    """Past the coordinators' next refresh. Home Assistant puts a
    coordinator's refreshes on whole seconds plus an offset of its own under
    half a second: the next one comes 9 to 10.5 seconds after the last."""
    await _wait(hass, freezer, 11)


async def _remove_through_the_device_page(
    hass: HomeAssistant, hass_ws_client: WebSocketGenerator, entry: MockConfigEntry, device: dr.DeviceEntry
) -> dict[str, Any]:
    """What "Delete" on a device page sends -- on the frontend of Home
    Assistant 2025.5, this integration's floor.

    Newer versions renamed the command `config/device_registry/remove`,
    which takes the `device_id` alone, and log the old name as a deprecated
    alias that Home Assistant 2027.9 removes. With a test image from 2027.9
    on, the device-page tests fail with an unknown command until this sends
    the new one.
    """
    assert await async_setup_component(hass, "config", {})
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "config/device_registry/remove_config_entry",
            "config_entry_id": entry.entry_id,
            "device_id": device.id,
        }
    )
    response: dict[str, Any] = await client.receive_json()
    return response


async def test_setup_creates_every_entity(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    """13 sensors of the instance; per printer 23 sensors (the chamber one
    because it reports a chamber temperature), 5 binary sensors, 6 buttons,
    the print speed, the chamber light, the camera and the cover."""
    await setup_integration(hass, config_entry)

    assert _platforms(hass, config_entry) == {
        "sensor": 36,
        "binary_sensor": 5,
        "button": 6,
        "select": 1,
        "switch": 1,
        "camera": 1,
        "image": 1,
    }


@pytest.mark.parametrize("failing", ["get_health", "get_printer_status"])
async def test_a_failed_first_refresh_retries_the_setup(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry, failing: str
) -> None:
    getattr(bambuddy_api, failing).side_effect = BamBuddyApiError("down")

    assert not await hass.config_entries.async_setup(config_entry.entry_id)
    await hass.async_block_till_done()

    assert config_entry.state is ConfigEntryState.SETUP_RETRY


async def test_unloading_the_entry(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    await setup_integration(hass, config_entry)
    status = entity_id(hass, "sensor", printer_uid(config_entry, "status"))

    assert await hass.config_entries.async_unload(config_entry.entry_id)
    await hass.async_block_till_done()

    assert config_entry.state is ConfigEntryState.NOT_LOADED
    assert hass.states.get(status).state == STATE_UNAVAILABLE


async def test_the_coordinators_refresh_every_ten_seconds(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    freezer: FrozenDateTimeFactory,
) -> None:
    """Neither after 5 seconds, nor twice in 11 (see _next_refresh)."""
    await setup_integration(hass, config_entry)
    before = (bambuddy_api.get_health.await_count, bambuddy_api.get_printer_status.await_count)

    await _wait(hass, freezer, 5)
    assert (bambuddy_api.get_health.await_count, bambuddy_api.get_printer_status.await_count) == before

    await _wait(hass, freezer, 6)
    assert (bambuddy_api.get_health.await_count, bambuddy_api.get_printer_status.await_count) == (
        before[0] + 1,
        before[1] + 1,
    )


async def test_a_failed_refresh_makes_the_printer_unavailable_until_the_next_good_one(
    hass: HomeAssistant,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
    freezer: FrozenDateTimeFactory,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A printer BamBuddy cannot reach: its entities unavailable, the
    instance's not, and the log says so in one line, without a traceback."""
    await setup_integration(hass, config_entry)
    status = entity_id(hass, "sensor", printer_uid(config_entry, "status"))
    version = entity_id(hass, "sensor", instance_uid(config_entry, "version"))

    bambuddy_api.get_printer_status.side_effect = BamBuddyApiError("down")
    await _next_refresh(hass, freezer)
    assert hass.states.get(status).state == STATE_UNAVAILABLE
    assert hass.states.get(version).state == "0.2.4.5"
    assert "Unexpected error" not in caplog.text

    bambuddy_api.get_printer_status.side_effect = None
    await _next_refresh(hass, freezer)
    assert hass.states.get(status).state == "RUNNING"


async def test_a_change_in_configure_reloads_the_entry(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    await setup_integration(hass, config_entry)

    _add_second_printer(hass, config_entry, bambuddy_api)
    await hass.async_block_till_done()

    second = entity_id(hass, "sensor", printer_uid(config_entry, "status", 2))
    assert hass.states.get(second).state == "RUNNING"


async def test_two_printers_get_their_own_devices_and_entities(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    _add_second_printer(hass, config_entry, bambuddy_api)
    await setup_integration(hass, config_entry)

    assert _printer_device(hass, config_entry, 1).serial_number == "00M00A000000001"
    assert _printer_device(hass, config_entry, 2).serial_number == "0309CA000000002"
    assert _platforms(hass, config_entry) == {
        "sensor": 13 + 2 * 23,
        "binary_sensor": 10,
        "button": 12,
        "select": 2,
        "switch": 2,
        "camera": 2,
        "image": 2,
    }


async def test_the_instance_device(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    await setup_integration(hass, config_entry)

    device = _instance_device(hass, config_entry)
    assert (device.name, device.manufacturer, device.model, device.configuration_url) == (
        f"BamBuddy ({HOST})",
        "BamBuddy",
        "BamBuddy Instance",
        f"http://{HOST}:8000",
    )


async def test_the_printer_device(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    """The model once, as "BamBuddy Printer (<model>)": with `model_id` set
    too, Home Assistant would show it twice."""
    await setup_integration(hass, config_entry)

    device = _printer_device(hass, config_entry, PRINTER_ID)
    assert (
        device.name,
        device.manufacturer,
        device.model,
        device.model_id,
        device.serial_number,
        device.sw_version,
        device.via_device_id,
        device.configuration_url,
    ) == (
        PRINTER_NAME,
        "BamBuddy",
        "BamBuddy Printer (X1C)",
        None,
        "00M00A000000001",
        "01.08.02.00",
        _instance_device(hass, config_entry).id,
        f"http://{HOST}:8000",
    )


async def test_a_printer_without_a_model_is_a_bambuddy_printer(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, config_entry: MockConfigEntry
) -> None:
    bambuddy_api.get_printer.return_value = {**load_fixture("printer.json"), "model": None}

    await setup_integration(hass, config_entry)

    assert _printer_device(hass, config_entry, PRINTER_ID).model == "BamBuddy Printer"


async def test_removing_a_printer_device_drops_it_from_the_options(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
) -> None:
    """The other printer keeps its device and its entities."""
    _add_second_printer(hass, config_entry, bambuddy_api)
    await setup_integration(hass, config_entry)
    device = _printer_device(hass, config_entry, PRINTER_ID)

    response = await _remove_through_the_device_page(hass, hass_ws_client, config_entry, device)
    await hass.async_block_till_done()

    assert response["success"]
    assert config_entry.options["printers"] == [_SECOND]
    assert dr.async_get(hass).async_get(device.id) is None
    second = entity_id(hass, "sensor", printer_uid(config_entry, "status", 2))
    assert hass.states.get(second).state == "RUNNING"


async def test_the_instance_device_cannot_be_removed(
    hass: HomeAssistant,
    hass_ws_client: WebSocketGenerator,
    bambuddy_api: SimpleNamespace,
    config_entry: MockConfigEntry,
) -> None:
    """Removing it would leave the entry without its instance: the dialog
    says how to remove the whole entry instead."""
    await setup_integration(hass, config_entry)
    device = _instance_device(hass, config_entry)

    response = await _remove_through_the_device_page(hass, hass_ws_client, config_entry, device)

    assert not response["success"]
    assert response["error"]["translation_key"] == "cannot_delete_instance"
    # Home Assistant drops the final period of an exception's message.
    assert (
        response["error"]["message"]
        == _STRINGS["exceptions"]["cannot_delete_instance"]["message"].rstrip(".")
    )
    assert config_entry.options["printers"] == [{"printer_id": 1, "printer_name": PRINTER_NAME}]
    assert dr.async_get(hass).async_get(device.id) is not None
