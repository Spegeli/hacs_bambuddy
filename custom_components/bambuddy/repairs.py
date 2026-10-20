"""A printer BamBuddy no longer has: the repair removes it here too, with
its AMS units, its smart plugs and their entities."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from homeassistant.components.repairs import RepairsFlow
from homeassistant.core import HomeAssistant

if TYPE_CHECKING:
    # Home Assistant 2025.5, the floor, has no such name; only mypy reads it.
    from homeassistant.components.repairs import RepairsFlowResult

from .config_flow import form_schema
from .const import CONF_PRINTER_NAME, CONF_PRINTERS
from .coordinator import async_remove_printer
from .models import stored_key


class RemoveMissingPrinter(RepairsFlow):
    """Asks once, then drops the printer from the entry; the reload that
    follows removes its devices."""

    def __init__(self, entry_id: str, key: str) -> None:
        self._entry_id = entry_id
        self._key = key

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> RepairsFlowResult:
        return await self.async_step_confirm()

    async def async_step_confirm(self, user_input: dict[str, Any] | None = None) -> RepairsFlowResult:
        entry = self.hass.config_entries.async_get_entry(self._entry_id)
        printers: list[dict[str, Any]] = entry.options.get(CONF_PRINTERS, []) if entry else []
        printer = next((item for item in printers if stored_key(item) == self._key), None)
        if entry is None or printer is None:
            return self.async_abort(reason="already_removed")
        if user_input is not None:
            async_remove_printer(self.hass, entry, printer)
            return self.async_create_entry(data={})
        return self.async_show_form(
            step_id="confirm",
            data_schema=form_schema({}),
            description_placeholders={"printer": printer[CONF_PRINTER_NAME]},
        )


async def async_create_fix_flow(hass: HomeAssistant, issue_id: str, data: dict[str, Any] | None) -> RepairsFlow:
    data = data or {}
    return RemoveMissingPrinter(str(data.get("entry_id")), str(data.get("key")))
