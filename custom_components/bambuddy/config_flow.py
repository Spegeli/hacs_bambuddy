"""Config flow for BamBuddy integration."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import BamBuddyClient, BamBuddyApiError, BamBuddyAuthError
from .const import (
    CONF_API_KEY,
    CONF_HOST,
    CONF_PORT,
    CONF_PRINTER_ID,
    CONF_PRINTER_NAME,
    DEFAULT_PORT,
    DOMAIN,
    ENTRY_TYPE_INSTANCE,
    ENTRY_TYPE_PRINTER,
)

_LOGGER = logging.getLogger(__name__)


class BamBuddyConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle BamBuddy config flow."""

    VERSION = 1

    def __init__(self) -> None:
        self._instance_data: dict = {}
        self._available_printers: list[dict] = []

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Choose what to add."""
        return self.async_show_menu(
            step_id="user",
            menu_options=["add_instance", "add_printer"],
        )

    # ── BamBuddy Instance ──────────────────────────────────────────────────

    async def async_step_add_instance(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            _LOGGER.debug(
                "Trying to connect to BamBuddy at %s:%s",
                user_input[CONF_HOST],
                user_input[CONF_PORT],
            )
            session = async_get_clientsession(self.hass)
            client = BamBuddyClient(
                user_input[CONF_HOST],
                user_input[CONF_PORT],
                user_input[CONF_API_KEY],
                session,
            )
            try:
                info = await client.get_system_info()
                _LOGGER.debug("BamBuddy system info: %s", info)
                await client.get_health()
            except BamBuddyAuthError as err:
                _LOGGER.error("BamBuddy auth error: %s", err)
                errors["base"] = "invalid_auth"
            except BamBuddyApiError as err:
                _LOGGER.error("BamBuddy connection error: %s", err)
                errors["base"] = "cannot_connect"
            else:
                unique_id = f"bambuddy_{user_input[CONF_HOST]}_{user_input[CONF_PORT]}"
                await self.async_set_unique_id(unique_id)
                self._abort_if_unique_id_configured()

                return self.async_create_entry(
                    title=f"BamBuddy ({user_input[CONF_HOST]})",
                    data={
                        **user_input,
                        "entry_type": ENTRY_TYPE_INSTANCE,
                        "version": info.get("version", "unknown"),
                    },
                )

        return self.async_show_form(
            step_id="add_instance",
            data_schema=vol.Schema({
                vol.Required(CONF_HOST): str,
                vol.Required(CONF_PORT, default=DEFAULT_PORT): int,
                vol.Required(CONF_API_KEY): str,
            }),
            errors=errors,
        )

    # ── Printer ────────────────────────────────────────────────────────────

    async def async_step_add_printer(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        errors: dict[str, str] = {}

        # Find existing instance entries to get connection details
        instance_entries = [
            e for e in self.hass.config_entries.async_entries(DOMAIN)
            if e.data.get("entry_type") == ENTRY_TYPE_INSTANCE
        ]

        if not instance_entries:
            return self.async_abort(reason="no_instance")

        # Use first instance (could be extended to support multiple)
        instance = instance_entries[0]
        session = async_get_clientsession(self.hass)
        client = BamBuddyClient(
            instance.data[CONF_HOST],
            instance.data[CONF_PORT],
            instance.data[CONF_API_KEY],
            session,
        )

        if user_input is not None:
            printer_id = user_input[CONF_PRINTER_ID]

            # Check if already added
            existing_printer_ids = [
                e.data.get(CONF_PRINTER_ID)
                for e in self.hass.config_entries.async_entries(DOMAIN)
                if e.data.get("entry_type") == ENTRY_TYPE_PRINTER
            ]
            if printer_id in existing_printer_ids:
                errors["base"] = "printer_already_added"
            else:
                try:
                    printer = await client.get_printer(printer_id)
                    _LOGGER.debug("Got printer info: %s", printer)
                except BamBuddyApiError as err:
                    _LOGGER.error("Error fetching printer %s: %s", printer_id, err)
                    errors["base"] = "cannot_connect"
                else:
                    unique_id = f"bambuddy_printer_{printer_id}"
                    await self.async_set_unique_id(unique_id)
                    self._abort_if_unique_id_configured()

                    return self.async_create_entry(
                        title=f"BamBuddy Printer: {printer.get('name', f'Printer {printer_id}')}",
                        data={
                            CONF_HOST: instance.data[CONF_HOST],
                            CONF_PORT: instance.data[CONF_PORT],
                            CONF_API_KEY: instance.data[CONF_API_KEY],
                            CONF_PRINTER_ID: printer_id,
                            CONF_PRINTER_NAME: printer.get("name", f"Printer {printer_id}"),
                            "entry_type": ENTRY_TYPE_PRINTER,
                        },
                    )

        # Fetch available printers for dropdown
        try:
            printers = await client.get_printers()
            _LOGGER.debug("Available printers: %s", printers)
        except BamBuddyApiError as err:
            _LOGGER.error("Cannot fetch printers: %s", err)
            return self.async_abort(reason="cannot_connect")

        existing_ids = [
            e.data.get(CONF_PRINTER_ID)
            for e in self.hass.config_entries.async_entries(DOMAIN)
            if e.data.get("entry_type") == ENTRY_TYPE_PRINTER
        ]
        available = {
            p["id"]: p["name"]
            for p in printers
            if p["id"] not in existing_ids
        }

        if not available:
            return self.async_abort(reason="all_printers_added")

        return self.async_show_form(
            step_id="add_printer",
            data_schema=vol.Schema({
                vol.Required(CONF_PRINTER_ID): vol.In(available),
            }),
            errors=errors,
        )
