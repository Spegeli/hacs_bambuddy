"""The key's required scopes cover every call the integration makes: a new
call to BamBuddy must name its permission here, and the permission must be
one the required toggles grant -- else a key that passes the check would
still be refused by BamBuddy."""
from __future__ import annotations

import inspect
import re

from custom_components.bambuddy.api import BamBuddyClient
from custom_components.bambuddy.const import REQUIRED_SCOPES

# Each client method that sends the key, and the permission its route needs
# (BamBuddy's routes, read at 943f358: `RequirePermissionIfAuthEnabled(...)`).
PERMISSION_OF = {
    "get_printers": "printers:read",
    "get_printer": "printers:read",
    "get_status": "printers:read",
    "get_runtime": "printers:read",
    "get_ams_labels": "printers:read",
    "get_diagnostic": "printers:read",
    "get_print_objects": "printers:read",
    "get_cover": "printers:read",
    "refresh_status": "printers:read",
    "get_kprofiles": "kprofiles:read",
    "get_stream_token": "camera:view",
    "stop_camera": "camera:view",
    "get_statistics": "stats:read",
    "get_system_info": "system:read",
    "get_update_check": "system:read",
    "get_firmware_updates": "firmware:read",
    "get_smart_plugs": "smart_plugs:read",
    "get_plug_status": "smart_plugs:read",
    "get_maintenance": "maintenance:read",
    "control_plug": "smart_plugs:control",
    "perform_maintenance": "maintenance:update",
    "clear_plate": "printers:clear_plate",
    "refresh_rfid": "printers:ams_rfid",
    **{
        name: "printers:control"
        for name in (
            "pause", "resume", "stop", "skip_objects", "set_print_speed", "set_chamber_light", "clear_hms",
            "execute_hms_action", "set_nozzle_temperature", "set_bed_temperature", "set_chamber_temperature",
            "set_fan_speed", "set_airduct_mode", "select_extruder", "set_print_option", "set_ams_backup",
            "load_filament", "unload_filament", "start_drying", "stop_drying", "configure_slot", "reset_slot",
            "home_axes", "jog_xy", "jog_z", "jog_extruder",
        )
    },
}
# Without the key, or answering anyone: the version, the authentication
# setting, the key check itself; the camera's picture and stream take the
# stream token.
PUBLIC = {"get_version", "get_auth_status", "get_auth_me", "check_key", "get_snapshot", "open_stream", "stream_url"}
# Calls the integration does without: refused, it reads as it always did.
# The live connection's token (`websocket:connect`, Read Status -- narrowed
# to what the key's owner may do, so not every Read Status key gets it).
OPTIONAL = {"get_ws_token": "websocket:connect"}


def test_every_call_needs_a_listed_permission() -> None:
    granted = set().union(*REQUIRED_SCOPES.values())
    assert {name: permission for name, permission in PERMISSION_OF.items() if permission not in granted} == {}


def test_every_call_to_bambuddy_is_listed() -> None:
    """A method that reaches BamBuddy through the client's request helpers
    is either listed with its permission or needs no key."""
    calling = {
        name
        for name, member in inspect.getmembers(BamBuddyClient, inspect.iscoroutinefunction)
        if not name.startswith("_") and re.search(r"self\._(request|object|list|command)\(", inspect.getsource(member))
    }
    assert calling - set(PERMISSION_OF) - PUBLIC - set(OPTIONAL) == set()
    assert set(PERMISSION_OF) - calling == set()
