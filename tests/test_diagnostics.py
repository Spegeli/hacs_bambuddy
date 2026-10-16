"""Diagnostics for bug reports: everything needed, no secret."""
from __future__ import annotations

import json
from types import SimpleNamespace

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr

from custom_components.bambuddy.diagnostics import async_get_config_entry_diagnostics, async_get_device_diagnostics

from tests.conftest import API_KEY, H2D, X1C, device_id, load_fixture, make_entry, printer_device, setup_integration


async def test_no_secret_reaches_the_diagnostics(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """With BamBuddy's authentication off, its printer list carries each
    printer's access code; an external camera's address may carry a login.
    The download goes into public bug reports (advisory GHSA-65xq-52pr-9c96)."""
    printers = load_fixture("printers.json")
    for printer in printers:
        printer.update(
            {
                "access_code": "AC31415926",
                "external_camera_url": "rtsp://admin:secret@192.0.2.50/live",
                "external_camera_snapshot_url": "http://admin:secret@192.0.2.50/snap.jpg",
            }
        )
    bambuddy_api.get_printers.return_value = printers
    entry = make_entry(hass, X1C, H2D)
    await setup_integration(hass, entry)

    diagnostics = await async_get_config_entry_diagnostics(hass, entry)
    dumped = json.dumps(diagnostics)

    for secret in (API_KEY, "AC31415926", "secret", "00M00A000000001", "0948AD000000004", "5F3C9A2B11223344"):
        assert secret not in dumped, secret
    assert diagnostics["bambuddy"] == {"version": "1.2.5.7", "printers": 3, "can_control": True}
    assert diagnostics["printers"]["1"]["status"]["state"] == "RUNNING"


async def test_a_printers_device_diagnostics(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C, H2D)
    await setup_integration(hass, entry)
    registry = dr.async_get(hass)
    printer = registry.async_get(device_id(hass, entry, printer_device(entry, H2D)))
    instance = registry.async_get(device_id(hass, entry, entry.entry_id))
    assert printer is not None and instance is not None

    assert (await async_get_device_diagnostics(hass, entry, printer))["info"]["model"] == "H2D"
    assert "printers" in await async_get_device_diagnostics(hass, entry, instance)
