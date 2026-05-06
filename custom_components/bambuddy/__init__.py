"""BamBuddy Home Assistant Integration."""
from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import BamBuddyClient
from .const import (
    CONF_API_KEY,
    CONF_HOST,
    CONF_PORT,
    CONF_PRINTER_ID,
    DOMAIN,
    ENTRY_TYPE_INSTANCE,
    ENTRY_TYPE_PRINTER,
)
from .coordinator import BamBuddyInstanceCoordinator, BamBuddyPrinterCoordinator

_LOGGER = logging.getLogger(__name__)

PLATFORMS_INSTANCE = [Platform.SENSOR]
PLATFORMS_PRINTER = [Platform.SENSOR, Platform.BUTTON, Platform.SELECT]


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

    entry_type = entry.data.get("entry_type")

    if entry_type == ENTRY_TYPE_INSTANCE:
        coordinator = BamBuddyInstanceCoordinator(hass, client)
        await coordinator.async_config_entry_first_refresh()
        hass.data[DOMAIN][entry.entry_id] = {
            "coordinator": coordinator,
            "client": client,
            "entry_type": ENTRY_TYPE_INSTANCE,
        }
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS_INSTANCE)

    elif entry_type == ENTRY_TYPE_PRINTER:
        printer_id = entry.data[CONF_PRINTER_ID]
        coordinator = BamBuddyPrinterCoordinator(hass, client, printer_id)
        await coordinator.async_config_entry_first_refresh()
        hass.data[DOMAIN][entry.entry_id] = {
            "coordinator": coordinator,
            "client": client,
            "entry_type": ENTRY_TYPE_PRINTER,
            "printer_id": printer_id,
        }
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS_PRINTER)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    entry_type = entry.data.get("entry_type")

    if entry_type == ENTRY_TYPE_INSTANCE:
        platforms = PLATFORMS_INSTANCE
    else:
        platforms = PLATFORMS_PRINTER

    unload_ok = await hass.config_entries.async_unload_platforms(entry, platforms)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)

    return unload_ok
