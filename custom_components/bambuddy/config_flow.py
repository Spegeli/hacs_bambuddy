"""Setting BamBuddy up: its address and API key, then the printers; later a
new key (reauthentication), a new address (reconfiguration, with the
printers matched there), and adding or removing printers (Configure)."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any, NamedTuple
from urllib.parse import urlsplit

import aiohttp
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
    AddressWithLoginError,
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyClient,
    BamBuddyConnectionError,
    BamBuddyError,
    BamBuddyNotFoundError,
    BamBuddyNotJsonError,
    BamBuddyPermissionError,
    normalise_url,
)
from .const import (
    CONF_API_KEY,
    CONF_PRINTER_NAME,
    CONF_PRINTERS,
    CONF_URL,
    CONF_VERIFY_SSL,
    DOMAIN,
    MIN_BAMBUDDY_VERSION,
)
from .coordinator import BamBuddyConfigEntry, create_client
from .key import async_check_key
from .models import find_printers, printer_key, printer_name, short_name, stored_key, stored_printer as _stored, too_old

def form_schema(fields: dict[Any, Any]) -> Any:
    """The schema of a form. Home Assistant 2026.10 types form schemas as
    probatio schemas; the voluptuous ones built here work the same from
    2025.5 on, hence `Any`: the one place that says so."""
    return vol.Schema(fields)


_KEY = TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD))
_CONNECTION = form_schema(
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
_RECONFIGURE = form_schema(
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
    """Printers to tick, each shown with its box -- with six or more options
    Home Assistant would draw a picker that names none of them."""
    return SelectSelector(SelectSelectorConfig(options=options, multiple=True, mode=SelectSelectorMode.LIST))


def _choice(options: list[SelectOptionDict]) -> Any:
    """Printers to tick: none ticked at first -- a required multi-select
    without a default comes with its first option ticked."""
    return form_schema({vol.Optional(CONF_PRINTERS, default=[]): _many(options)})


# The field left empty: what a check of the stored key found, said of it.
_STORED_ERRORS = {"invalid_auth": "stored_key_refused", "missing_scopes": "stored_key_scopes", "key_owner_inactive": "stored_key_owner"}


def _of_stored(errors: dict[str, str]) -> dict[str, str]:
    base = errors.get("base")
    return {"base": _STORED_ERRORS[base]} if base in _STORED_ERRORS else errors


class _Found(NamedTuple):
    """What an address and a key give: the errors and their placeholders, or
    BamBuddy's printers."""

    errors: dict[str, str]
    placeholders: dict[str, str]
    printers: list[dict[str, Any]]


# A web page answered, not BamBuddy's API: inside the flow only -- `_find`
# tries the address's parents, then says it is no BamBuddy.
_WEB_PAGE = "wrong_path"


async def _validate(hass: HomeAssistant, url: str, api_key: str, verify_ssl: bool) -> _Found:
    client = BamBuddyClient(url, api_key, async_get_clientsession(hass), verify_ssl=verify_ssl)
    # BamBuddy tells its version to anyone, never with an error.
    first = True
    # The key's check passed: a refusal after it is BamBuddy's own.
    checked = False
    try:
        version = await client.get_version()
        first = False
        if too_old(version):
            return _Found({"base": "too_old"}, {"version": version, "minimum": MIN_BAMBUDDY_VERSION}, [])
        # The key first: one with every scope the integration needs, whatever
        # BamBuddy's authentication setting.
        scopes = await client.check_key()
        if scopes.missing:
            return _Found({"base": "missing_scopes"}, scopes.marks(), [])
        checked = True
        try:
            # Its archive walk may be slow or fail: the integration runs
            # without its figures, so the flow does too.
            await client.get_system_info(patient=False)
        except (BamBuddyAuthError, BamBuddyPermissionError):
            raise
        except BamBuddyError:
            pass
        printers = await client.get_printers()
        return _Found({}, {}, printers)
    except (BamBuddyAuthError, BamBuddyPermissionError) as err:
        # BamBuddy asks no key for its version: a login in front of it does.
        if first:
            return _Found({"base": "error_not_bambuddy"}, {"error": str(err)}, [])
        if checked:
            return _Found({"base": "bambuddy_refused"}, {"error": err.detail}, [])
        # 401: BamBuddy does not know the key; 403: its owner is deactivated or gone.
        return _Found({"base": "invalid_auth" if isinstance(err, BamBuddyAuthError) else "key_owner_inactive"}, {}, [])
    except BamBuddyNotFoundError:
        return _Found({"base": "not_bambuddy"}, {"minimum": MIN_BAMBUDDY_VERSION}, [])
    except BamBuddyNotJsonError:
        return _Found({"base": _WEB_PAGE}, {}, [])
    except BamBuddyConnectionError as err:
        # A self-signed certificate: the switch below is the way. Another
        # TLS failure: https at a plain-HTTP port -- the switch would not help.
        if isinstance(err.__cause__, aiohttp.ClientConnectorCertificateError):
            return _Found({"base": "ssl_error"}, {}, [])
        if isinstance(err.__cause__, aiohttp.ClientSSLError):
            return _Found({"base": "not_https"}, {}, [])
        return _Found({"base": "cannot_connect"}, {}, [])
    except BamBuddyApiError as err:
        # A proxy without BamBuddy behind it answers 502-504: unreachable.
        if err.status in (502, 503, 504):
            return _Found({"base": "cannot_connect"}, {}, [])
        # An error to the first question: another server at the address.
        if first:
            return _Found({"base": "error_not_bambuddy"}, {"error": str(err)}, [])
        return _Found({"base": "bad_answer"}, {"error": str(err)}, [])


async def _find(hass: HomeAssistant, url: str, api_key: str, verify_ssl: bool, *, parents: bool = True) -> tuple[str, _Found]:
    """BamBuddy at the address -- or at one of its parents: an address
    copied from the browser often ends in a page's path (/printers,
    /settings), where BamBuddy's web page answers, not its API. Without
    `parents` (the stored address) only the address itself."""
    found = await _validate(hass, url, api_key, verify_ssl)
    tried = url
    while parents and found.errors.get("base") == _WEB_PAGE and urlsplit(tried).path:
        tried = tried.rsplit("/", 1)[0]
        parent = await _validate(hass, tried, api_key, verify_ssl)
        if parent.errors.get("base") != _WEB_PAGE:
            return tried, parent
    if found.errors.get("base") == _WEB_PAGE:
        # A web page down to the address's root is no BamBuddy.
        return url, _Found({"base": "not_bambuddy"}, {"minimum": MIN_BAMBUDDY_VERSION}, [])
    return url, found


def _short(name: str) -> str:
    """A stored device name without " (model / serial)": BamBuddy's name."""
    return name.rsplit(" (", 1)[0] if name.endswith(")") and " (" in name else name


def _bullets(names: list[str]) -> str:
    """Names as a Markdown list: a run-on sentence of fifteen is unreadable."""
    return "\n".join(f"- {name}" for name in names)


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


def _normalised(user_input: dict[str, Any]) -> tuple[str | None, str]:
    """The address in its one form, or the error to show for it."""
    try:
        return normalise_url(user_input[CONF_URL]), ""
    except AddressWithLoginError:
        return None, "url_with_login"
    except ValueError:
        return None, "invalid_url"


def _elsewhere(hass: HomeAssistant, entry_id: str | None) -> dict[str, str]:
    """The printers other BamBuddy entries hold -- the same BamBuddy at
    another address, say -- by key, with the entry's title: a printer has a
    device per entry, so one set up twice would come twice."""
    return {
        stored_key(printer): entry.title
        for entry in hass.config_entries.async_entries(DOMAIN)
        if entry.entry_id != entry_id
        for printer in entry.options.get(CONF_PRINTERS, [])
    }


def _in_use(printers: list[dict[str, Any]], elsewhere: dict[str, str]) -> dict[str, str]:
    """The placeholder that says where the printers are set up."""
    titles = sorted({elsewhere[printer_key(printer)] for printer in printers if printer_key(printer) in elsewhere})
    return {"entries": ", ".join(titles)}


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
        # The stored key's marks, where it is short (the reauth's text).
        self._stored_marks: dict[str, str] = {}

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: BamBuddyConfigEntry) -> BamBuddyOptionsFlow:
        return BamBuddyOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        placeholders: dict[str, str] = {}
        if user_input is not None:
            url, invalid = _normalised(user_input)
            # A key pasted with a space around it.
            api_key = str(user_input[CONF_API_KEY]).strip()
            if url is None:
                errors[CONF_URL] = invalid
            else:
                # A setup left open -- the tab closed -- blocks no new one;
                # Home Assistant ends it once this one makes the entry.
                await self.async_set_unique_id(url, raise_on_progress=False)
                self._abort_if_unique_id_configured()
                url, found = await _find(self.hass, url, api_key, user_input[CONF_VERIFY_SSL])
                errors, placeholders = found.errors, found.placeholders
                if not errors:
                    # Found at a parent of the address typed.
                    await self.async_set_unique_id(url, raise_on_progress=False)
                    self._abort_if_unique_id_configured()
                    self._data = {**user_input, CONF_URL: url, CONF_API_KEY: api_key}
                    elsewhere = _elsewhere(self.hass, None)
                    self._printers = [printer for printer in found.printers if printer_key(printer) not in elsewhere]
                    if self._printers:
                        return await self.async_step_printers()
                    if found.printers:
                        return self.async_abort(reason="printers_in_use", description_placeholders=_in_use(found.printers, elsewhere))
                    return self._create_entry([])
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(_CONNECTION, user_input),
            errors=errors,
            description_placeholders={"example_url": _EXAMPLE_URL, **placeholders},
        )

    async def async_step_printers(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Which of BamBuddy's printers to add: all, unless the user says
        otherwise."""
        if user_input is not None:
            chosen = set(user_input[CONF_PRINTERS])
            return self._create_entry([printer for printer in self._printers if str(printer["id"]) in chosen])
        options = [SelectOptionDict(value=str(printer["id"]), label=printer_name(printer)) for printer in self._printers]
        schema = form_schema({vol.Optional(CONF_PRINTERS, default=[option["value"] for option in options]): _many(options)})
        return self.async_show_form(step_id="printers", data_schema=schema)

    def _create_entry(self, printers: list[dict[str, Any]]) -> ConfigFlowResult:
        return self.async_create_entry(
            title=_title(self._data[CONF_URL]),
            data=self._data,
            options={
                CONF_PRINTERS: [_stored(printer) for printer in printers]
            },
            # BamBuddy has none yet: said, with where to add them later.
            description=None if self._printers else "no_printers",
        )

    def _update_entry(self, entry: BamBuddyConfigEntry, **changes: Any) -> None:
        """Store a new key or address and set the entry up with it. A loaded
        entry reloads through its update listener when something changed;
        one whose setup failed has none, and an unchanged one -- the same key
        entered again after BamBuddy refused it for a while -- would stay
        without data. (async_update_reload_and_abort would clash with the
        listener from Home Assistant 2026.12 on.)"""
        changed = self.hass.config_entries.async_update_entry(entry, **changes)
        if entry.state is not ConfigEntryState.LOADED or not changed:
            self.hass.config_entries.async_schedule_reload(entry.entry_id)

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        """Why a new key: the stored one checked -- it lacks scopes, its
        owner is gone, or BamBuddy does not accept it."""
        entry = self._get_reauth_entry()
        client = BamBuddyClient(entry.data[CONF_URL], entry.data[CONF_API_KEY], async_get_clientsession(self.hass), verify_ssl=entry.data.get(CONF_VERIFY_SSL, True))
        check = await async_check_key(client)
        if check.outcome == "short" and check.scopes is not None:
            self._stored_marks = {f"stored_{scope}": mark for scope, mark in check.scopes.marks().items()}
            return await self.async_step_reauth_scopes()
        if check.outcome == "owner":
            return await self.async_step_reauth_owner()
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """BamBuddy does not accept the stored key: a new one for the same BamBuddy."""
        return await self._async_reauth("reauth_confirm", user_input)

    async def async_step_reauth_scopes(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """The stored key lacks scopes: its marks, and a new key."""
        return await self._async_reauth("reauth_scopes", user_input)

    async def async_step_reauth_owner(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """The stored key's owner is deactivated or gone: a new key as an active user."""
        return await self._async_reauth("reauth_owner", user_input)

    async def _async_reauth(self, step_id: str, user_input: dict[str, Any] | None) -> ConfigFlowResult:
        entry = self._get_reauth_entry()
        errors: dict[str, str] = {}
        placeholders = {"url": entry.data[CONF_URL], **(self._stored_marks if step_id == "reauth_scopes" else {})}
        if user_input is not None:
            # Left empty: the stored key checked again -- its owner got the
            # right back in BamBuddy, and BamBuddy showed the key only once.
            typed = str(user_input.get(CONF_API_KEY) or "").strip()
            api_key = typed or entry.data[CONF_API_KEY]
            _, found = await _find(self.hass, entry.data[CONF_URL], api_key, entry.data.get(CONF_VERIFY_SSL, True), parents=False)
            errors = found.errors if typed else _of_stored(found.errors)
            placeholders.update(found.placeholders)
            if not errors:
                self._update_entry(entry, data={**entry.data, CONF_API_KEY: api_key})
                return self.async_abort(reason="reauth_successful")
        return self.async_show_form(
            step_id=step_id,
            data_schema=form_schema({vol.Optional(CONF_API_KEY): _KEY}),
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
            url, invalid = _normalised(user_input)
            api_key = typed or entry.data[CONF_API_KEY]
            if url is None:
                errors[CONF_URL] = invalid
            else:
                url, found = await _find(self.hass, url, api_key, user_input[CONF_VERIFY_SSL])
                errors, placeholders, listed = found.errors, found.placeholders, found.printers
                if not typed:
                    errors = _of_stored(errors)
                if self._address_in_use(entry, url):
                    errors = {CONF_URL: "address_in_use"}
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
            data_schema=self.add_suggested_values_to_schema(_RECONFIGURE, shown),
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
        kept = sorted((short_name(info) for info in self._found if info is not None), key=str.casefold)
        # None of the entry's printers there speaks for another BamBuddy.
        other = bool(stored) and not kept
        schema: dict[Any, Any] = {
            vol.Required(_KIND, default=_OTHER if other else _SAME): SelectSelector(
                SelectSelectorConfig(
                    options=[_SAME, _OTHER],
                    # Without printers: none keeps its history.
                    translation_key=_KIND if stored else f"{_KIND}_alone",
                    mode=SelectSelectorMode.LIST,
                )
            )
        }
        if missing:
            schema[vol.Optional(_REMOVE, default=[])] = _many(
                sorted(
                    (SelectOptionDict(value=stored_key(printer), label=printer[CONF_PRINTER_NAME]) for printer in missing),
                    key=lambda option: option["label"].casefold(),
                )
            )
        if new:
            schema[vol.Optional(_ADD, default=[])] = _many(
                [SelectOptionDict(value=str(printer["id"]), label=printer_name(printer)) for printer in new]
            )
        if not stored:
            step = "new_address_no_printers"
        elif not missing:
            # Every printer found there: no list of fifteen names.
            step = "new_address_all"
        else:
            step = "other_bambuddy" if other else "new_address"
        return self.async_show_form(
            step_id=step,
            data_schema=form_schema(schema),
            description_placeholders={"url": self._data[CONF_URL], **({"kept": _bullets(kept)} if stored and missing else {})},
        )

    # The same step: with a warning (none of the entry's printers there), for
    # every printer found there, and for an entry without printers.
    async_step_other_bambuddy = async_step_new_address
    async_step_new_address_all = async_step_new_address
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
                waiting.append(_short(printer[CONF_PRINTER_NAME]))
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
        return create_client(self.hass, entry)

    @property
    def _printers(self) -> list[dict[str, Any]]:
        return list(self.config_entry.options.get(CONF_PRINTERS, []))

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        menu = ["add_printer"]
        if self._printers:
            menu.append("remove_printer")
        return self.async_show_menu(step_id="init", menu_options=menu, description_placeholders=self._named())

    def _named(self) -> dict[str, str]:
        """The entry's name, for the texts: Home Assistant titles an ending
        dialog after the integration alone."""
        return {"name": self.config_entry.title}

    async def async_step_add_printer(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        try:
            available = await self._client().get_printers()
        except (BamBuddyAuthError, BamBuddyPermissionError):
            return self.async_abort(reason="key_refused", description_placeholders=self._named())
        except BamBuddyError:
            return self.async_abort(reason="cannot_connect", description_placeholders=self._named())
        if not available:
            return self.async_abort(reason="no_printers", description_placeholders=self._named())
        added = {stored_key(printer) for printer in self._printers}
        elsewhere = _elsewhere(self.hass, self.config_entry.entry_id)
        missing = [printer for printer in available if printer_key(printer) not in added]
        new = {str(printer["id"]): printer for printer in missing if printer_key(printer) not in elsewhere}
        if not new:
            if missing:
                return self.async_abort(reason="printers_in_use", description_placeholders=_in_use(missing, elsewhere))
            return self.async_abort(reason="all_printers_added", description_placeholders=self._named())
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
        options = [SelectOptionDict(value=value, label=printer_name(printer)) for value, printer in new.items()]
        return self.async_show_form(step_id="add_printer", data_schema=_choice(options), description_placeholders=self._named())

    async def async_step_remove_printer(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            removed = set(user_input.get(CONF_PRINTERS, []))
            if not removed:
                return self.async_abort(reason="nothing_chosen")
            return self.async_create_entry(
                data={
                    **self.config_entry.options,
                    CONF_PRINTERS: [printer for printer in self._printers if stored_key(printer) not in removed],
                }
            )
        # By serial, as everywhere: after BamBuddy renumbered, a printer it
        # no longer lists may share its number with one it lists.
        options = sorted(
            (SelectOptionDict(value=stored_key(printer), label=self._label(printer)) for printer in self._printers),
            key=lambda option: option["label"].casefold(),
        )
        return self.async_show_form(step_id="remove_printer", data_schema=_choice(options), description_placeholders=self._named())

    def _label(self, printer: dict[str, Any]) -> str:
        """BamBuddy's own name, while the entry knows it: two printers of a
        model differ only in their serials."""
        entry = self.config_entry
        if entry.state is ConfigEntryState.LOADED:
            key = stored_key(printer)
            for coordinator in entry.runtime_data.printers.values():
                if coordinator.key == key:
                    return str(coordinator.printer_name)
        return str(printer[CONF_PRINTER_NAME])
