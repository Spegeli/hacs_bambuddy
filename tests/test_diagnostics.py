"""Diagnostics for bug reports: everything needed, no secret."""
from __future__ import annotations

import inspect
import json
from types import SimpleNamespace

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.components import diagnostics as ha_diagnostics
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.typing import ClientSessionGenerator

from custom_components.bambuddy.api import BamBuddyConnectionError
from custom_components.bambuddy.diagnostics import async_get_config_entry_diagnostics, async_get_device_diagnostics

from tests.conftest import (
    A1_MINI,
    API_KEY,
    H2D,
    P1S,
    WS_TOKEN,
    X1C,
    device_id,
    load_fixture,
    make_entry,
    past_the_minute,
    printer_device_id,
    printer_info,
    printer_serial,
    printers_but,
    set_up,
    setup_integration,
    try_set_up,
)
from tests.helpers import with_inventory, with_plugs


async def test_no_secret_reaches_the_diagnostics(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """With BamBuddy's authentication off, its printer list carries each
    printer's access code; an external camera's address may carry a login.
    The download goes into public bug reports."""
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
    entry = await set_up(hass, X1C, H2D)

    diagnostics = await async_get_config_entry_diagnostics(hass, entry)
    dumped = json.dumps(diagnostics)

    # The key, the access code, the camera login, serial numbers, a chip's id, a spool's UUID.
    for secret in (API_KEY, "AC31415926", "secret", "00M00A000000001", "0948AD000000004", "5F3C9A2B11223344", "7C2E4A9B1D0F4E5A8B3C6D7E8F901234"):
        assert secret not in dumped, secret
    # Nor BamBuddy's address -- a domain may name its owner -- or the printers' network addresses.
    for address in ("bambuddy.local", "192.0.2.11", "192.0.2.14"):
        assert address not in dumped, address
    assert diagnostics["bambuddy"] == {"version": "1.2.5.7", "printers": 3}
    # The key's last check: what BamBuddy says it may do, and whether its authentication is on.
    key = diagnostics["key"]
    assert (key["marks"], key["outcome"], key["auth_enabled"]) == (
        {"read_status": "✓", "control_printer": "✓", "manage_maintenance": "✓"},
        "ok",
        True,
    )
    assert key["last_check"]
    assert diagnostics["printers"]["1"]["status"]["state"] == "RUNNING"


async def test_no_wled_address_reaches_the_diagnostics(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy 1.3.1 names a printer's WLED controller by its address."""
    wled = {"wled_config": {"enabled": True, "base_url": "http://192.0.2.60"}}
    bambuddy_api.get_printers.return_value = [{**printer, **wled} for printer in load_fixture("printers.json")]
    bambuddy_api.get_printer.side_effect = lambda printer_id: {**printer_info(printer_id), **wled}
    entry = await set_up(hass, X1C)

    dumped = json.dumps(await async_get_config_entry_diagnostics(hass, entry))

    assert "192.0.2.60" not in dumped
    assert '"enabled": true' in dumped


async def test_no_job_name_reaches_the_diagnostics(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A file's name is the user's own words too; the printer's name stays."""
    bambuddy_api.statuses[X1C].update(subtask_name="Secret_Bracket", gcode_file="/data/Secret_Bracket.gcode", current_print="Secret_Bracket")
    entry = await set_up(hass, X1C)

    diagnostics = await async_get_config_entry_diagnostics(hass, entry)

    status = diagnostics["printers"]["1"]["status"]
    assert {status[field] for field in ("subtask_name", "gcode_file", "current_print")} == {"**REDACTED**"}
    assert status["name"] != "**REDACTED**"
    assert "Secret_Bracket" not in json.dumps(diagnostics)


async def test_no_place_or_plug_name_reaches_the_diagnostics(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A printer's location is the user's own text (a room, an address), a
    plug's device name the switch's or the Home Assistant entity's name: the
    download goes into public bug reports."""
    printers = load_fixture("printers.json")
    for printer in printers:
        printer["location"] = "Cellar room 3"
    bambuddy_api.get_printers.return_value = printers
    with_plugs(bambuddy_api)
    entry = await set_up(hass, X1C, P1S, H2D)

    diagnostics = await async_get_config_entry_diagnostics(hass, entry)
    dumped = json.dumps(diagnostics)

    for private in ("Cellar room 3", "Garage printer", "Printer light"):
        assert private not in dumped, private
    # The plug's status keeps what a bug report needs.
    status = diagnostics["plugs"]["5"]["status"]
    assert (status["device_name"], status["state"]) == ("**REDACTED**", load_fixture("plug_statuses.json")["5"]["state"])


async def test_a_printers_device_diagnostics(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C, H2D)
    registry = dr.async_get(hass)
    printer = registry.async_get(printer_device_id(hass, entry, H2D))
    instance = registry.async_get(device_id(hass, entry, entry.entry_id))
    assert printer is not None and instance is not None

    assert (await async_get_device_diagnostics(hass, entry, printer))["info"]["model"] == "H2D"
    assert "printers" in await async_get_device_diagnostics(hass, entry, instance)


async def test_the_diagnostics_tell_the_live_connection(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Whether BamBuddy's live connection is open and what it brought: a
    bug report about late changes needs it. No token, no address."""
    entry = await set_up(hass, X1C)

    diagnostics = await async_get_config_entry_diagnostics(hass, entry)

    assert diagnostics["live"] == {
        "enabled": True,
        "connected": False,
        "connected_since": None,
        "last_message": None,
        "messages": 0,
        "other_printers": 0,
        "ignored": 0,
        "connections": 0,
        # The tests' client has no socket.
        "last_error": "WebSocket: no socket in tests",
        "push_gap": 1,
    }
    assert WS_TOKEN not in json.dumps(diagnostics)


async def test_the_diagnostics_tell_the_inventory(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Whether the inventory is shown and which spool sits where -- by numbers:
    no spool name, no owner's note."""
    with_inventory(bambuddy_api)
    entry = await set_up(hass, X1C)

    diagnostics = await async_get_config_entry_diagnostics(hass, entry)

    assert diagnostics["inventory"] == {
        "shown": True,
        "assignable": True,
        "spools": 3,
        "assignments": [
            {"printer": 1, "ams_id": 0, "tray_id": 2, "spool_id": 1},
            {"printer": 1, "ams_id": 0, "tray_id": 3, "spool_id": 2},
            {"printer": 99, "ams_id": 0, "tray_id": 0, "spool_id": 3},
        ],
    }
    text = json.dumps(diagnostics)
    assert "opened in May" not in text
    assert "Geeetech" not in text


async def test_the_diagnostics_tell_configures_settings(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Switched off in Configure, a read every 5 seconds at most."""
    entry = make_entry(hass, X1C, live_updates=False, push_gap=5)
    await setup_integration(hass, entry)

    live = (await async_get_config_entry_diagnostics(hass, entry))["live"]

    assert (live["enabled"], live["push_gap"], live["connections"], live["last_error"]) == (False, 5, 0, None)


async def test_the_diagnostics_of_an_entry_that_did_not_load(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The bug report form asks for this download -- most needed when the
    setup fails: the entry, its state, no secret."""
    bambuddy_api.get_version.side_effect = BamBuddyConnectionError("refused")
    entry = await try_set_up(hass, X1C)
    assert entry.state is ConfigEntryState.SETUP_RETRY

    diagnostics = await async_get_config_entry_diagnostics(hass, entry)

    assert diagnostics["entry"]["state"] == "setup_retry"
    assert diagnostics["entry"]["options"]["printers"][0]["printer_id"] == X1C
    assert API_KEY not in json.dumps(diagnostics)
    assert "printers" not in diagnostics


@pytest.mark.skipif(
    "issues" not in inspect.getsource(ha_diagnostics), reason="this Home Assistant adds no repair issues to a download"
)
async def test_the_download_names_no_serial_through_the_repairs(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory, hass_client: ClientSessionGenerator
) -> None:
    """Home Assistant adds the domain's repair issues to every download: their IDs carry no serial."""
    entry = make_entry(hass, X1C, A1_MINI)
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)
    await setup_integration(hass, entry)
    dr.async_get(hass).async_update_device(printer_device_id(hass, entry), name_by_user="My printer")
    await past_the_minute(hass, freezer)
    assert await async_setup_component(hass, "diagnostics", {})
    client = await hass_client()

    response = await client.get(f"/api/diagnostics/config_entry/{entry.entry_id}")
    body = await response.text()

    assert response.status == 200
    assert printer_serial(X1C) not in body
    assert printer_serial(A1_MINI) not in body


async def test_device_diagnostics_of_an_entry_that_did_not_load(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entry's part then, without a secret."""
    entry = await set_up(hass, X1C)
    device = dr.async_get(hass).async_get(printer_device_id(hass, entry))
    assert device is not None
    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()

    diagnostics = await async_get_device_diagnostics(hass, entry, device)

    assert diagnostics["entry"]["state"] == "not_loaded"
    assert API_KEY not in str(diagnostics)
