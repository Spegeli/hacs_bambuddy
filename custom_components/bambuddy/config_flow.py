"""Setting BamBuddy up: its address and API key, then the printers; later a
new key (reauthentication), a new address (reconfiguration, with the
printers matched there), and adding or removing printers (Configure)."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from urllib.parse import urlsplit

import voluptuous as vol

from homeassistant.config_entries import ConfigEntryState, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.recorder import get_instance
from homeassistant.helpers.selector import (
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .api import (
    BamBuddyAuthError,
    BamBuddyClient,
    BamBuddyError,
    BamBuddyNotFoundError,
    BamBuddyPermissionError,
    normalise_url,
)
from .const import (
    CONF_API_KEY,
    CONF_PRINTER_ID,
    CONF_PRINTER_NAME,
    CONF_PRINTERS,
    CONF_SERIAL,
    CONF_URL,
    CONF_VERIFY_SSL,
    DOMAIN,
    MIN_BAMBUDDY_VERSION,
)
from .coordinator import BamBuddyConfigEntry
from .models import find_printers, printer_key, printer_name, stored_key, too_old

# Home Assistant 2026.10 types form schemas as probatio schemas; the voluptuous
# ones built here work the same from 2025.5 on, hence `type: ignore[arg-type]`
# where a form takes one.
_KEY = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))
_CONNECTION = vol.Schema(
    {
        vol.Required(CONF_URL): TextSelector(TextSelectorConfig(type=TextSelectorType.URL)),
        vol.Required(CONF_API_KEY): _KEY,
        vol.Required(CONF_VERIFY_SSL, default=True): bool,
    }
)
# The example of a domain in the address texts: hassfest refuses a URL in a
# string, so it comes in as a placeholder.
_EXAMPLE_URL = "https://bambuddy.example.com"
# Reconfiguring: the key is never shown -- anyone who may open the form would
# read it; left empty, it stays.
_RECONFIGURE = vol.Schema(
    {
        vol.Required(CONF_URL): TextSelector(TextSelectorConfig(type=TextSelectorType.URL)),
        vol.Optional(CONF_API_KEY): _KEY,
        vol.Required(CONF_VERIFY_SSL, default=True): bool,
    }
)


# The new address step: which BamBuddy it is, and the printers to remove
# and to add.
_KIND = "bambuddy"
_SAME, _OTHER = "same", "other"
_REMOVE = "remove_printers"
_ADD = "add_printers"


def _many(options: list[SelectOptionDict]) -> SelectSelector:
    return SelectSelector(SelectSelectorConfig(options=options, multiple=True))


def _choice(options: list[SelectOptionDict]) -> vol.Schema:
    """Printers to tick: none ticked at first -- a required multi-select
    without a default comes with its first option ticked."""
    return vol.Schema({vol.Optional(CONF_PRINTERS, default=[]): _many(options)})


def _stored(printer: dict[str, Any]) -> dict[str, Any]:
    """A printer as the entry stores it: BamBuddy's number for the API, the
    serial number to find it again when BamBuddy numbers its printers anew."""
    return {
        CONF_PRINTER_ID: printer["id"],
        CONF_PRINTER_NAME: printer_name(printer),
        CONF_SERIAL: str(printer.get("serial_number") or ""),
    }


def _printer_label(printer: dict[str, Any]) -> str:
    """The choice when adding or removing: the device name, BamBuddy's name
    first."""
    return printer_name(printer)


async def _validate(
    hass: HomeAssistant, url: str, api_key: str, verify_ssl: bool
) -> tuple[dict[str, str], dict[str, str], list[dict[str, Any]]]:
    """Errors and their placeholders, and BamBuddy's printers when there
    are none."""
    client = BamBuddyClient(url, api_key, async_get_clientsession(hass), verify_ssl=verify_ssl)
    try:
        version = await client.get_version()
        if too_old(version):
            return {"base": "too_old"}, {"version": version, "minimum": MIN_BAMBUDDY_VERSION}, []
        await client.get_system_info()
        return {}, {}, await client.get_printers()
    except BamBuddyAuthError:
        return {"base": "invalid_auth"}, {}, []
    except BamBuddyPermissionError:
        return {"base": "missing_permission"}, {}, []
    except BamBuddyNotFoundError:
        return {"base": "not_bambuddy"}, {"minimum": MIN_BAMBUDDY_VERSION}, []
    except BamBuddyError:
        return {"base": "cannot_connect"}, {}, []


def _title(url: str) -> str:
    return f"BamBuddy ({urlsplit(url).hostname or url})"


async def _async_forget_history(hass: HomeAssistant, entry: BamBuddyConfigEntry) -> None:
    """Another BamBuddy: the entities of the instance's device start afresh --
    their recorded states and statistics go, their entity IDs stay, so
    dashboards and automations keep working."""
    if "recorder" not in hass.config.components:
        return
    entities = er.async_get(hass)
    entity_ids = [
        entity.entity_id
        for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id)
        if (DOMAIN, entry.entry_id) in device.identifiers
        for entity in er.async_entries_for_device(entities, device.id, include_disabled_entities=True)
    ]
    # An entry never set up has none yet.
    if not entity_ids:
        return
    # States first: a statistics run in between then finds none to compile.
    await hass.services.async_call("recorder", "purge_entities", {"entity_id": entity_ids, "keep_days": 0}, blocking=True)
    get_instance(hass).async_clear_statistics(entity_ids)


def _normalised(user_input: dict[str, Any]) -> str | None:
    try:
        return normalise_url(user_input[CONF_URL])
    except ValueError:
        return None


class BamBuddyConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 2
    MINOR_VERSION = 2

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}
        self._printers: list[dict[str, Any]] = []
        # At a new address: the entry's printers as they were then, and
        # BamBuddy's printer for each (None: not there).
        self._stored: list[dict[str, Any]] = []
        self._found: list[dict[str, Any] | None] = []

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: BamBuddyConfigEntry) -> BamBuddyOptionsFlow:
        return BamBuddyOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        placeholders: dict[str, str] = {}
        if user_input is not None:
            url = _normalised(user_input)
            if url is None:
                errors[CONF_URL] = "invalid_url"
            else:
                await self.async_set_unique_id(url)
                self._abort_if_unique_id_configured()
                errors, placeholders, printers = await _validate(
                    self.hass, url, user_input[CONF_API_KEY], user_input[CONF_VERIFY_SSL]
                )
                if not errors:
                    self._data = {**user_input, CONF_URL: url}
                    self._printers = printers
                    if printers:
                        return await self.async_step_printers()
                    return self._create_entry([])
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(_CONNECTION, user_input),  # type: ignore[arg-type]
            errors=errors,
            description_placeholders={"example_url": _EXAMPLE_URL, **placeholders},
        )

    async def async_step_printers(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Which of BamBuddy's printers to add: all, unless the user says
        otherwise."""
        if user_input is not None:
            chosen = set(user_input[CONF_PRINTERS])
            return self._create_entry([printer for printer in self._printers if str(printer["id"]) in chosen])
        options = [SelectOptionDict(value=str(printer["id"]), label=_printer_label(printer)) for printer in self._printers]
        schema = vol.Schema(
            {
                vol.Optional(CONF_PRINTERS, default=[option["value"] for option in options]): SelectSelector(
                    SelectSelectorConfig(options=options, multiple=True)
                )
            }
        )
        return self.async_show_form(step_id="printers", data_schema=schema)  # type: ignore[arg-type]

    def _create_entry(self, printers: list[dict[str, Any]]) -> ConfigFlowResult:
        return self.async_create_entry(
            title=_title(self._data[CONF_URL]),
            data=self._data,
            options={
                CONF_PRINTERS: [_stored(printer) for printer in printers]
            },
        )

    def _update_entry(self, entry: BamBuddyConfigEntry, **changes: Any) -> None:
        """Store a new key or address and set the entry up with it. A loaded
        entry reloads through its update listener; one whose setup failed
        has none. (async_update_reload_and_abort would clash with the
        listener from Home Assistant 2026.12 on.)"""
        self.hass.config_entries.async_update_entry(entry, **changes)
        if entry.state is not ConfigEntryState.LOADED:
            self.hass.config_entries.async_schedule_reload(entry.entry_id)

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """BamBuddy refused the key: a new one for the same BamBuddy."""
        entry = self._get_reauth_entry()
        errors: dict[str, str] = {}
        placeholders = {"url": entry.data[CONF_URL]}
        if user_input is not None:
            errors, found, _ = await _validate(
                self.hass, entry.data[CONF_URL], user_input[CONF_API_KEY], entry.data.get(CONF_VERIFY_SSL, True)
            )
            placeholders.update(found)
            if not errors:
                self._update_entry(entry, data={**entry.data, CONF_API_KEY: user_input[CONF_API_KEY]})
                return self.async_abort(reason="reauth_successful")
        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema({vol.Required(CONF_API_KEY): _KEY}),  # type: ignore[arg-type]
            errors=errors,
            description_placeholders=placeholders,
        )

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """A new key or certificate check; a new address leads on to the
        printers found there."""
        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}
        placeholders: dict[str, str] = {}
        # A key just typed; the field left empty keeps the stored one.
        typed = str((user_input or {}).get(CONF_API_KEY) or "").strip()
        if user_input is not None:
            url = _normalised(user_input)
            api_key = typed or entry.data[CONF_API_KEY]
            if url is None:
                errors[CONF_URL] = "invalid_url"
            else:
                if self._address_in_use(entry, url):
                    return self.async_abort(reason="address_in_use")
                errors, placeholders, listed = await _validate(self.hass, url, api_key, user_input[CONF_VERIFY_SSL])
                if errors.get("base") == "invalid_auth" and not typed:
                    errors = {"base": "stored_key_refused"}
                if not errors:
                    self._data = {CONF_URL: url, CONF_API_KEY: api_key, CONF_VERIFY_SSL: user_input[CONF_VERIFY_SSL]}
                    if url == entry.unique_id:
                        self._update_entry(entry, data=self._data)
                        return self.async_abort(reason="reconfigure_successful")
                    self._printers = listed
                    self._stored = list(entry.options.get(CONF_PRINTERS, []))
                    self._found = find_printers(listed, self._stored)
                    return await self.async_step_new_address()
        # The stored key never shows; a key just typed stays after an error --
        # an empty field would keep the old one without a word.
        shown = {key: value for key, value in (user_input or entry.data).items() if key != CONF_API_KEY}
        if typed:
            shown[CONF_API_KEY] = typed
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self.add_suggested_values_to_schema(_RECONFIGURE, shown),  # type: ignore[arg-type]
            errors=errors,
            description_placeholders={"example_url": _EXAMPLE_URL, **placeholders},
        )

    def _address_in_use(self, entry: BamBuddyConfigEntry, url: str) -> bool:
        """Whether another entry has the address."""
        return url != entry.unique_id and any(
            other.unique_id == url
            for other in self._async_current_entries(include_ignore=False)
            if other.entry_id != entry.entry_id
        )

    async def async_step_new_address(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Which BamBuddy answers there -- the same at a new address, or
        another one -- and the printers: those found by their serial numbers
        stay, those not there may go, those only there may come."""
        entry = self._get_reconfigure_entry()
        stored = self._stored
        missing = [printer for printer, info in zip(stored, self._found, strict=True) if info is None]
        matched = {info["id"] for info in self._found if info is not None}
        new = [printer for printer in self._printers if printer["id"] not in matched]
        if user_input is not None:
            return await self._async_move(entry, user_input, stored, new)
        kept = [printer_name(info) for info in self._found if info is not None]
        # None of the entry's printers there speaks for another BamBuddy.
        other = bool(stored) and not kept
        schema: dict[Any, Any] = {
            vol.Required(_KIND, default=_OTHER if other else _SAME): SelectSelector(
                SelectSelectorConfig(options=[_SAME, _OTHER], translation_key=_KIND, mode=SelectSelectorMode.LIST)
            )
        }
        if missing:
            schema[vol.Optional(_REMOVE, default=[])] = _many(
                [SelectOptionDict(value=stored_key(printer), label=printer[CONF_PRINTER_NAME]) for printer in missing]
            )
        if new:
            schema[vol.Optional(_ADD, default=[])] = _many(
                [SelectOptionDict(value=str(printer["id"]), label=_printer_label(printer)) for printer in new]
            )
        if not stored:
            return self.async_show_form(
                step_id="new_address_no_printers",
                data_schema=vol.Schema(schema),  # type: ignore[arg-type]
                description_placeholders={"url": self._data[CONF_URL]},
            )
        return self.async_show_form(
            step_id="other_bambuddy" if other else "new_address",
            data_schema=vol.Schema(schema),  # type: ignore[arg-type]
            description_placeholders={"url": self._data[CONF_URL], "kept": ", ".join(kept)},
        )

    # The same step: with a warning (none of the entry's printers there), and
    # for an entry without printers.
    async_step_other_bambuddy = async_step_new_address
    async_step_new_address_no_printers = async_step_new_address

    async def _async_move(
        self,
        entry: BamBuddyConfigEntry,
        user_input: dict[str, Any],
        stored: list[dict[str, Any]],
        new: list[dict[str, Any]],
    ) -> ConfigFlowResult:
        if self._address_in_use(entry, self._data[CONF_URL]):
            return self.async_abort(reason="address_in_use")
        remove = set(user_input.get(_REMOVE, []))
        add = set(user_input.get(_ADD, []))
        printers: list[dict[str, Any]] = []
        waiting: list[str] = []
        for printer, info in zip(stored, self._found, strict=True):
            if info is not None:
                printers.append(_stored(info))
            elif stored_key(printer) not in remove:
                printers.append(printer)
                waiting.append(printer[CONF_PRINTER_NAME])
        printers += [_stored(printer) for printer in new if str(printer["id"]) in add]
        other = user_input[_KIND] == _OTHER
        if other:
            await _async_forget_history(self.hass, entry)
        url = self._data[CONF_URL]
        # A title the user gave stays; 1.x kept the host as typed.
        given = entry.title.casefold() != _title(entry.data[CONF_URL]).casefold()
        self._update_entry(
            entry,
            data=self._data,
            unique_id=url,
            title=entry.title if given else _title(url),
            options={**entry.options, CONF_PRINTERS: printers},
        )
        reason = "reconfigure_successful_other" if other else "reconfigure_successful"
        if waiting:
            return self.async_abort(reason=f"{reason}_missing", description_placeholders={"printers": ", ".join(waiting)})
        return self.async_abort(reason=reason)


class BamBuddyOptionsFlow(OptionsFlow):
    """Adding and removing printers (settled: an options flow, not
    sub-entries)."""

    def _client(self) -> BamBuddyClient:
        entry = self.config_entry
        if entry.state is ConfigEntryState.LOADED:
            client: BamBuddyClient = entry.runtime_data.client
            return client
        return BamBuddyClient(
            entry.data[CONF_URL],
            entry.data[CONF_API_KEY],
            async_get_clientsession(self.hass),
            verify_ssl=entry.data.get(CONF_VERIFY_SSL, True),
        )

    @property
    def _printers(self) -> list[dict[str, Any]]:
        return list(self.config_entry.options.get(CONF_PRINTERS, []))

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        menu = ["add_printer"]
        if self._printers:
            menu.append("remove_printer")
        return self.async_show_menu(step_id="init", menu_options=menu)

    async def async_step_add_printer(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        try:
            available = await self._client().get_printers()
        except BamBuddyError:
            return self.async_abort(reason="cannot_connect")
        added = {stored_key(printer) for printer in self._printers}
        new = {str(printer["id"]): printer for printer in available if printer_key(printer) not in added}
        if not new:
            return self.async_abort(reason="all_printers_added")
        if user_input is not None:
            chosen = [new[value] for value in user_input.get(CONF_PRINTERS, []) if value in new]
            if not chosen:
                return self.async_abort(reason="nothing_chosen")
            return self.async_create_entry(
                data={
                    **self.config_entry.options,
                    CONF_PRINTERS: self._printers
                    + [_stored(printer) for printer in chosen],
                }
            )
        options = [SelectOptionDict(value=value, label=_printer_label(printer)) for value, printer in new.items()]
        return self.async_show_form(step_id="add_printer", data_schema=_choice(options))  # type: ignore[arg-type]

    async def async_step_remove_printer(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            removed = set(user_input.get(CONF_PRINTERS, []))
            if not removed:
                return self.async_abort(reason="nothing_chosen")
            return self.async_create_entry(
                data={
                    **self.config_entry.options,
                    CONF_PRINTERS: [
                        printer for printer in self._printers if str(printer[CONF_PRINTER_ID]) not in removed
                    ],
                }
            )
        options = [
            SelectOptionDict(value=str(printer[CONF_PRINTER_ID]), label=self._label(printer)) for printer in self._printers
        ]
        return self.async_show_form(step_id="remove_printer", data_schema=_choice(options))  # type: ignore[arg-type]

    def _label(self, printer: dict[str, Any]) -> str:
        """BamBuddy's own name, while the entry knows it: two printers of a
        model differ only in their serials."""
        entry = self.config_entry
        if entry.state is ConfigEntryState.LOADED:
            coordinator = entry.runtime_data.printers.get(printer[CONF_PRINTER_ID])
            if coordinator is not None:
                return _printer_label(coordinator.info)
        return str(printer[CONF_PRINTER_NAME])
