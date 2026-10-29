"""A printer BamBuddy no longer has: the repair removes it here too, with
its AMS units, its smart plugs and their entities. AMS entity IDs that
followed their unit's serial: the repair lists them until the user
confirms."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from homeassistant.components.repairs import RepairsFlow
from homeassistant.core import HomeAssistant

if TYPE_CHECKING:
    # Home Assistant 2025.5, the floor, has no such name; only mypy reads it.
    from homeassistant.components.repairs import RepairsFlowResult

from . import renames
from .config_flow import form_schema
from .const import CONF_PRINTER_NAME, CONF_PRINTERS
from .coordinator import async_remove_printer, find_device, printer_identifier, renames_issue
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
            # Which entry: two may show the same printer.
            description_placeholders={"printer": printer[CONF_PRINTER_NAME], "entry": entry.title},
        )


class ConfirmAmsRenames(RepairsFlow):
    """Lists the renamed IDs; "Done" clears the list, and the notice goes."""

    def __init__(self, entry_id: str, key: str) -> None:
        self._entry_id = entry_id
        self._key = key

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> RepairsFlowResult:
        return await self.async_step_confirm()

    async def async_step_confirm(self, user_input: dict[str, Any] | None = None) -> RepairsFlowResult:
        pairs = await renames.async_get(self.hass, self._entry_id, self._key)
        if not pairs:
            return self.async_abort(reason="already_confirmed")
        if user_input is not None:
            await renames.async_clear(self.hass, self._entry_id, self._key)
            return self.async_create_entry(data={})
        device = find_device(self.hass, self._entry_id, printer_identifier(self._entry_id, self._key))
        return self.async_show_form(
            step_id="confirm",
            data_schema=form_schema({}),
            description_placeholders={
                "name": (device.name if device is not None else None) or self._key,
                # A list in the text: one pair a line.
                "renamed": "\n- ".join(f"`{old}` → `{new}`" for old, new in pairs),
            },
        )


async def async_create_fix_flow(hass: HomeAssistant, issue_id: str, data: dict[str, Any] | None) -> RepairsFlow:
    data = data or {}
    entry_id, key = str(data.get("entry_id")), str(data.get("key"))
    if issue_id == renames_issue(entry_id, key):
        return ConfirmAmsRenames(entry_id, key)
    return RemoveMissingPrinter(entry_id, key)
