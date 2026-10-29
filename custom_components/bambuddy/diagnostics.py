"""Diagnostics for bug reports: what BamBuddy reports about the instance,
each printer and its smart plugs -- without the API key, BamBuddy's
address, the printers' network addresses, access codes, camera addresses or
serial numbers, and without a plug's address, login, URLs, headers or Home
Assistant entities."""
from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr

from .const import CONF_API_KEY, CONF_PRINTER_NAME, CONF_URL
from .coordinator import BamBuddyConfigEntry, BamBuddyData, BamBuddyPrinterCoordinator
from .live import live_settings
from .plugs import Plug

TO_REDACT = {
    CONF_API_KEY,
    # Addresses: a domain may name its owner, and the report is public.
    CONF_URL,
    "ip_address",
    CONF_PRINTER_NAME,  # "<BamBuddy name> (<model> / <serial>)"
    "access_code",
    "external_camera_url",
    "external_camera_snapshot_url",
    "serial_number",
    "tag_uid",
    "tray_uuid",
    "token",
}


# A plug's fields a bug report may show: what the integration reads, its
# automation settings, multipliers. Every other field -- its address and
# login, REST URLs, bodies and headers, Home Assistant and MQTT names, and
# whatever a later BamBuddy adds -- is redacted.
_PLUG_FIELDS = {
    "id",
    "created_at",
    "name",
    "plug_type",
    "printer_id",
    "controls_printer_power",
    "enabled",
    "auto_on",
    "auto_off",
    "auto_off_persistent",
    "off_delay_mode",
    "off_delay_minutes",
    "off_temp_threshold",
    "auto_off_after_drying",
    "off_delay_after_drying_minutes",
    "power_alert_enabled",
    "schedule_enabled",
    "show_in_switchbar",
    "show_on_printer_card",
    "last_state",
    "last_checked",
    "auto_off_executed",
}


def _plug(runtime: BamBuddyData, plug: Plug) -> dict[str, Any]:
    info = {
        key: value if key in _PLUG_FIELDS or key.endswith("multiplier") or value is None else "**REDACTED**"
        for key, value in plug.info.items()
    }
    auto_off = runtime.auto_offs.get(plug.id)
    # How the plug is known: never what it switches, its key or the secret.
    identity = runtime.plugs.identity(plug.id)
    return {
        "info": info,
        "status": plug.status,
        "identity": None
        if identity is None
        else {
            "digest": identity.digest,
            "record_known": identity.epoch is not None,
            "known_by": identity.known_by,
            "rank": identity.rank,
        },
        "auto_off": None
        if auto_off is None
        else {
            "armed": auto_off.armed,
            "every_print": auto_off.every_print,
            "threshold": auto_off.threshold,
            "phase": auto_off.phase,
            "waiting_for": auto_off.waiting_for,
        },
    }


def _printer(coordinator: BamBuddyPrinterCoordinator) -> dict[str, Any]:
    return {
        "info": async_redact_data(coordinator.info, TO_REDACT),
        "status": async_redact_data(coordinator.data.status, TO_REDACT),
        "last_update_success": coordinator.last_update_success,
    }


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: BamBuddyConfigEntry) -> dict[str, Any]:
    stored = {
        "entry": {
            "version": entry.version,
            "state": entry.state.value,
            "data": async_redact_data(dict(entry.data), TO_REDACT),
            "options": async_redact_data(dict(entry.options), TO_REDACT),
        },
    }
    # Not loaded -- BamBuddy cannot be reached, or the key is refused: the
    # entry is all there is, and what the bug report needs first.
    runtime: BamBuddyData | None = getattr(entry, "runtime_data", None)
    if runtime is None:
        return stored
    system = (runtime.instance.data or {}).get("system") or {}
    return {
        **stored,
        "bambuddy": {
            "version": (system.get("app") or {}).get("version"),
            "printers": (system.get("printers") or {}).get("total"),
        },
        "key": {
            "marks": runtime.key.last.scopes.marks() if runtime.key.last.scopes is not None else None,
            "last_check": runtime.key.last.at.isoformat(),
            "outcome": runtime.key.last.outcome,
            "auth_enabled": runtime.auth_enabled,
        },
        # BamBuddy's live connection: whether changes come at once.
        "live": {**runtime.live.diagnostics(), "push_gap": live_settings(entry.options).push_gap},
        "printers": {str(printer_id): _printer(coordinator) for printer_id, coordinator in runtime.printers.items()},
        "plugs": {str(plug_id): _plug(runtime, plug) for plug_id, plug in (runtime.plugs.data or {}).items()},
    }


async def async_get_device_diagnostics(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, device: dr.DeviceEntry
) -> dict[str, Any]:
    """One printer's part, or one smart plug's; the whole entry's for its
    other devices -- and for every device of an entry that did not load."""
    runtime: BamBuddyData | None = getattr(entry, "runtime_data", None)
    if runtime is not None:
        for coordinator in runtime.printers.values():
            if coordinator.identifier in device.identifiers:
                return _printer(coordinator)
        for plug in (runtime.plugs.data or {}).values():
            if runtime.plugs.identifier(plug.id) in device.identifiers:
                return _plug(runtime, plug)
    return await async_get_config_entry_diagnostics(hass, entry)
