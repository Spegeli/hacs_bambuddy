"""Config flow for BamBuddy integration."""
from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
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
)

_LOGGER = logging.getLogger(__name__)


class BamBuddyConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle BamBuddy config flow."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> BamBuddyOptionsFlow:
        """Return the options flow."""
        return BamBuddyOptionsFlow(config_entry)

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Add a BamBuddy instance."""
        errors: dict[str, str] = {}

        if user_input is not None:
            host = user_input[CONF_HOST]
            port = user_input[CONF_PORT]

            session = async_get_clientsession(self.hass)
            client = BamBuddyClient(host, port, user_input[CONF_API_KEY], session)

            try:
                await client.get_health()
                info = await client.get_system_info()
            except BamBuddyAuthError:
                errors["base"] = "invalid_auth"
            except BamBuddyApiError:
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(f"bambuddy_{host}_{port}")
                self._abort_if_unique_id_configured()

                return self.async_create_entry(
                    title=f"BamBuddy ({host})",
                    data={
                        **user_input,
                        "version": info.get("app", {}).get("version", "unknown"),
                    },
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_HOST): str,
                vol.Required(CONF_PORT, default=DEFAULT_PORT): int,
                vol.Required(CONF_API_KEY): str,
            }),
            errors=errors,
        )


class BamBuddyOptionsFlow(config_entries.OptionsFlow):
    """Handle BamBuddy options (add / remove printers)."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._printers: list[dict] = list(config_entry.options.get("printers", []))
        self._entry = config_entry

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Show menu."""
        menu_options = ["add_printer"]
        if self._printers:
            menu_options.append("remove_printer")
        return self.async_show_menu(step_id="init", menu_options=menu_options)

    # ── Add printer ────────────────────────────────────────────────────────

    async def async_step_add_printer(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Select a printer to add."""
        errors: dict[str, str] = {}

        session = async_get_clientsession(self.hass)
        client = BamBuddyClient(
            self._entry.data[CONF_HOST],
            self._entry.data[CONF_PORT],
            self._entry.data[CONF_API_KEY],
            session,
        )

        if user_input is not None:
            printer_id = user_input[CONF_PRINTER_ID]
            try:
                printer = await client.get_printer(printer_id)
            except BamBuddyApiError:
                errors["base"] = "cannot_connect"
            else:
                model = printer.get("model", f"Printer {printer_id}")
                serial = printer.get("serial_number")
                display_name = f"{model} ({serial})" if serial else model

                self._printers.append({
                    "printer_id": printer_id,
                    "printer_name": display_name,
                })
                return self.async_create_entry(title="", data={"printers": self._printers})

        try:
            printers = await client.get_printers()
        except BamBuddyApiError:
            return self.async_abort(reason="cannot_connect")

        existing_ids = {p["printer_id"] for p in self._printers}
        available = {}
        for p in printers:
            if p["id"] not in existing_ids:
                name = p.get("name", "")
                model = p.get("model", "")
                serial = p.get("serial_number", "")
                if name and name != model:
                    label = f"{name} ({model}) · {serial}" if serial else f"{name} ({model})"
                else:
                    label = f"{model} · {serial}" if serial else model
                available[p["id"]] = label

        if not available:
            return self.async_abort(reason="all_printers_added")

        return self.async_show_form(
            step_id="add_printer",
            data_schema=vol.Schema({
                vol.Required(CONF_PRINTER_ID): vol.In(available),
            }),
            errors=errors,
        )

    # ── Remove printer ─────────────────────────────────────────────────────

    async def async_step_remove_printer(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Select a printer to remove."""
        if user_input is not None:
            printer_id = user_input[CONF_PRINTER_ID]
            self._printers = [p for p in self._printers if p["printer_id"] != printer_id]
            return self.async_create_entry(title="", data={"printers": self._printers})

        current = {p["printer_id"]: p["printer_name"] for p in self._printers}
        return self.async_show_form(
            step_id="remove_printer",
            data_schema=vol.Schema({
                vol.Required(CONF_PRINTER_ID): vol.In(current),
            }),
        )
