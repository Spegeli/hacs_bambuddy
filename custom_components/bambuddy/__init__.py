"""BamBuddy Home Assistant Integration."""
from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import BamBuddyClient
from .const import (
    CONF_API_KEY,
    CONF_HOST,
    CONF_PORT,
    CONF_PRINTER_ID,
    CONF_PRINTER_NAME,
    DOMAIN,
)
from .coordinator import BamBuddyInstanceCoordinator, BamBuddyPrinterCoordinator

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SENSOR, Platform.BINARY_SENSOR, Platform.BUTTON, Platform.SELECT, Platform.SWITCH, Platform.CAMERA, Platform.IMAGE]


async def _async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up BamBuddy from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    session = async_get_clientsession(hass)
    client = BamBuddyClient(
        entry.data[CONF_HOST],
        entry.data[CONF_PORT],
        entry.data[CONF_API_KEY],
        session,
    )

    instance_coordinator = BamBuddyInstanceCoordinator(hass, client)
    await instance_coordinator.async_config_entry_first_refresh()

    printers: dict[int, dict] = {}
    for printer_conf in entry.options.get("printers", []):
        printer_id = printer_conf[CONF_PRINTER_ID]
        coordinator = BamBuddyPrinterCoordinator(hass, client, printer_id)
        await coordinator.async_config_entry_first_refresh()
        printers[printer_id] = {
            "coordinator": coordinator,
            "printer_id": printer_id,
            "printer_name": printer_conf.get(CONF_PRINTER_NAME, f"Printer {printer_id}"),
        }

    hass.data[DOMAIN][entry.entry_id] = {
        "coordinator": instance_coordinator,
        "client": client,
        "printers": printers,
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    return True


async def async_remove_config_entry_device(
    hass: HomeAssistant, config_entry: ConfigEntry, device_entry: dr.DeviceEntry
) -> bool:
    """Allow deleting a printer device from the UI."""
    for printer_id in hass.data[DOMAIN][config_entry.entry_id]["printers"]:
        if (DOMAIN, f"{config_entry.entry_id}_printer_{printer_id}") in device_entry.identifiers:
            new_printers = [
                p for p in config_entry.options.get("printers", [])
                if p[CONF_PRINTER_ID] != printer_id
            ]
            hass.config_entries.async_update_entry(
                config_entry,
                options={**config_entry.options, "printers": new_printers},
            )
            return True
    raise HomeAssistantError(
        translation_domain=DOMAIN,
        translation_key="cannot_delete_instance",
    )


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
