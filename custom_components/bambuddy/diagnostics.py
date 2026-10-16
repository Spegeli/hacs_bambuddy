"""Diagnostics for bug reports: what BamBuddy reports about the instance and
each printer -- without the API key, the printers' access codes, camera
addresses or serial numbers."""
from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr

from .const import CONF_API_KEY, CONF_PRINTER_NAME
from .coordinator import BamBuddyConfigEntry, BamBuddyPrinterCoordinator, printer_identifier

TO_REDACT = {
    CONF_API_KEY,
    CONF_PRINTER_NAME,  # "<BamBuddy name> (<model> / <serial>)"
    "access_code",
    "external_camera_url",
    "external_camera_snapshot_url",
    "serial_number",
    "tag_uid",
    "tray_uuid",
    "token",
}


def _printer(coordinator: BamBuddyPrinterCoordinator) -> dict[str, Any]:
    return {
        "info": async_redact_data(coordinator.info, TO_REDACT),
        "status": async_redact_data(coordinator.data.status, TO_REDACT),
        "last_update_success": coordinator.last_update_success,
    }


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: BamBuddyConfigEntry) -> dict[str, Any]:
    runtime = entry.runtime_data
    system = runtime.instance.data["system"]
    return {
        "entry": {
            "version": entry.version,
            "data": async_redact_data(dict(entry.data), TO_REDACT),
            "options": async_redact_data(dict(entry.options), TO_REDACT),
        },
        "bambuddy": {
            "version": (system.get("app") or {}).get("version"),
            "printers": system.get("printers", {}).get("total"),
            "can_control": runtime.can_control,
        },
        "printers": {str(printer_id): _printer(coordinator) for printer_id, coordinator in runtime.printers.items()},
    }


async def async_get_device_diagnostics(
    hass: HomeAssistant, entry: BamBuddyConfigEntry, device: dr.DeviceEntry
) -> dict[str, Any]:
    """One printer's part; the whole entry's for its other devices."""
    for coordinator in entry.runtime_data.printers.values():
        if printer_identifier(entry.entry_id, coordinator.key) in device.identifiers:
            return _printer(coordinator)
    return await async_get_config_entry_diagnostics(hass, entry)
