"""Setting BamBuddy up, a new key and a new address."""
from __future__ import annotations

import importlib
import json
import re
import ssl
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import aiohttp
import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.bambuddy.api import (
    BamBuddyApiError,
    BamBuddyAuthError,
    BamBuddyClient,
    BamBuddyConnectionError,
    BamBuddyNotFoundError,
    BamBuddyNotJsonError,
    BamBuddyPermissionError,
)
from custom_components.bambuddy.config_flow import printer_name as flow_printer_name

from tests.conftest import (
    A1_MINI,
    API_KEY,
    H2D,
    P1S,
    SHORT_KEYS,
    URL,
    X1C,
    X1E,
    load_fixture,
    make_entry,
    printer_entry,
    printer_name,
    set_up,
    translations,
    try_set_up,
)
from tests.helpers import (
    FLOW_INPUT,
    NEW_URL,
    field_defaults,
    flow_at_new_address,
    flow_first_step,
    flow_reconfigure,
    flow_start,
    flow_submit,
    flow_switch,
    reauth_flows,
    timed_out,
)


async def _reauth(hass: HomeAssistant, entry: MockConfigEntry) -> dict[str, Any]:
    result: dict[str, Any] = await entry.start_reauth_flow(hass)  # type: ignore[assignment]
    return result


def _suggested(result: dict[str, Any]) -> dict[str, Any]:
    """The values a form shows pre-filled."""
    return {
        str(key): (key.description or {}).get("suggested_value")
        for key in result["data_schema"].schema
        if (key.description or {}).get("suggested_value") is not None
    }


async def test_setting_up_with_all_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The address as the user typed it, then every printer, preselected."""
    result = await flow_start(hass)
    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "user")
    assert result["description_placeholders"] == {"example_url": "https://bambuddy.example.com"}

    result = await flow_submit(hass, result["flow_id"], FLOW_INPUT)
    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "printers")

    result = await flow_submit(hass, result["flow_id"], {"printers": ["1", "4"]})

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "BamBuddy (bambuddy.local)"
    assert result["data"] == {"url": URL, "api_key": API_KEY, "verify_ssl": True}
    assert result["options"] == {
        "printers": [
            printer_entry(X1C),
            printer_entry(H2D),
        ]
    }
    assert result["result"].unique_id == URL


async def test_the_printers_step_preselects_all(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    result = await flow_first_step(hass)

    assert field_defaults(result) == {"printers": ["1", "2", "3", "4", "5"]}


async def test_a_bambuddy_without_printers_needs_no_choice(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    bambuddy_api.get_printers.return_value = []

    result = await flow_first_step(hass)

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["options"] == {"printers": []}
    # Said, with where to add them later.
    assert result["description"] == "no_printers"


@pytest.mark.parametrize(
    ("method", "failure", "error"),
    [
        ("get_version", BamBuddyConnectionError("refused"), "cannot_connect"),
        ("get_version", BamBuddyNotFoundError(404, "Not Found"), "not_bambuddy"),
        ("get_auth_me", BamBuddyAuthError(401, "Authentication required"), "invalid_auth"),
        ("get_auth_me", BamBuddyPermissionError(403, "API key owner is deactivated or no longer exists"), "key_owner_inactive"),
        # The key's check passed: BamBuddy refusing a read is its own refusal.
        ("get_system_info", BamBuddyAuthError(401, "Authentication required"), "bambuddy_refused"),
        ("get_printers", BamBuddyPermissionError(403, "Not allowed"), "bambuddy_refused"),
    ],
)
async def test_errors_and_recovery(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, method: str, failure: Exception, error: str
) -> None:
    """Each problem says what to check, and the form takes a second try."""
    getattr(bambuddy_api, method).side_effect = failure
    result = await flow_first_step(hass)
    assert (result["type"], result["errors"]) == (FlowResultType.FORM, {"base": error})

    getattr(bambuddy_api, method).side_effect = None
    result = await flow_submit(hass, result["flow_id"], FLOW_INPUT)

    assert result["step_id"] == "printers"


@pytest.mark.parametrize("version", ["0.2.4.9", "1.2.5.6"])
async def test_a_bambuddy_too_old(hass: HomeAssistant, bambuddy_api: SimpleNamespace, version: str) -> None:
    """Before 1.2.5.7 BamBuddy told every API key it held every permission:
    a read-only key would get controls that only fail."""
    bambuddy_api.get_version.return_value = version

    result = await flow_first_step(hass)

    assert result["errors"] == {"base": "too_old"}
    assert result["description_placeholders"] == {"example_url": "https://bambuddy.example.com", "version": version, "minimum": "1.2.5.7"}


@pytest.mark.parametrize("version", ["1.2.6b1", "not a version"])
async def test_a_version_that_is_no_number_passes(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, version: str
) -> None:
    """A beta, or a version we cannot read: BamBuddy answered, the key
    decides."""
    bambuddy_api.get_version.return_value = version

    result = await flow_first_step(hass)

    assert result["step_id"] == "printers"


async def test_an_invalid_address(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    result = await flow_first_step(hass, {**FLOW_INPUT, "url": "ftp://bambuddy"})

    assert result["errors"] == {"url": "invalid_url"}
    bambuddy_api.get_version.assert_not_awaited()


@pytest.mark.parametrize("typed", ["http://bambuddy.local:8000/printers", "bambuddy.local:8000/settings/api-keys"])
async def test_an_address_copied_with_a_page(hass: HomeAssistant, bambuddy_api: SimpleNamespace, typed: str) -> None:
    """Copied from the browser while BamBuddy shows a page: its web page
    answers there, not its API. BamBuddy is found at the address's start."""
    calls: list[str] = []

    async def version(self: BamBuddyClient) -> str:
        calls.append(self.url)
        if self.url != URL:
            raise BamBuddyNotJsonError(200, "The answer is not JSON")
        return "1.2.5.7"

    with patch.object(BamBuddyClient, "get_version", version):
        result = await flow_first_step(hass, {**FLOW_INPUT, "url": typed})
    result = await flow_submit(hass, result["flow_id"], {"printers": [str(X1C)]})

    assert (result["type"], result["data"]["url"]) == (FlowResultType.CREATE_ENTRY, URL)
    assert result["result"].unique_id == URL
    assert calls[-1] == URL


async def test_a_web_page_that_is_no_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """HTML at the address's start: not a BamBuddy, or one too old."""
    bambuddy_api.get_version.side_effect = BamBuddyNotJsonError(200, "The answer is not JSON")

    result = await flow_first_step(hass)

    assert result["errors"] == {"base": "not_bambuddy"}


async def test_an_address_with_a_login(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    result = await flow_first_step(hass, {**FLOW_INPUT, "url": "http://admin:secret@bambuddy.local:8000"})

    assert result["errors"] == {"url": "url_with_login"}
    bambuddy_api.get_version.assert_not_awaited()


async def test_a_certificate_that_cannot_be_verified(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A self-signed certificate: the error points to the switch below."""
    refused = BamBuddyConnectionError("GET /updates/version: ClientConnectorCertificateError")
    refused.__cause__ = aiohttp.ClientConnectorCertificateError(MagicMock(), ssl.SSLCertVerificationError("self-signed certificate"))
    bambuddy_api.get_version.side_effect = refused

    result = await flow_first_step(hass, {**FLOW_INPUT, "url": "https://bambuddy.local"})

    assert result["errors"] == {"base": "ssl_error"}


async def test_https_at_a_plain_http_port(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """TLS against plain HTTP is no certificate problem: turning the check
    off would not help."""
    refused = BamBuddyConnectionError("GET /updates/version: ClientConnectorSSLError")
    refused.__cause__ = aiohttp.ClientConnectorSSLError(MagicMock(), ssl.SSLError("wrong version number"))
    bambuddy_api.get_version.side_effect = refused

    result = await flow_first_step(hass, {**FLOW_INPUT, "url": "https://bambuddy.local:8000"})

    assert result["errors"] == {"base": "not_https"}


async def test_an_error_at_the_first_question_asks_whether_it_is_bambuddy(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """BamBuddy answers its version to anyone, never with an error: another
    server at the address does."""
    bambuddy_api.get_version.side_effect = BamBuddyApiError(418, "HTTP 418")

    result = await flow_first_step(hass)

    assert result["errors"] == {"base": "error_not_bambuddy"}
    assert result["description_placeholders"]["error"] == "HTTP 418"


@pytest.mark.parametrize("flow", ["setup", "reauth"])
async def test_a_slow_system_information_does_not_block_the_flow(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, flow: str
) -> None:
    """BamBuddy walks its whole archive for it: a slow or failing answer
    leaves its figures unknown for a while -- the integration runs without
    them, so the flow does too. A refused key still says so."""
    timeout = timed_out("GET /system/info")
    if flow == "setup":
        bambuddy_api.get_system_info.side_effect = timeout
        result = await flow_first_step(hass)
        assert result["step_id"] == "printers"
    else:
        entry = await set_up(hass, X1C)
        bambuddy_api.get_system_info.side_effect = timeout
        result = await _reauth(hass, entry)
        result = await flow_submit(hass, result["flow_id"], {"api_key": API_KEY})
        await hass.async_block_till_done()
        assert result["reason"] == "reauth_successful"
    # At the flow's pace: no 30 s wait for the archive walk.
    assert bambuddy_api.get_system_info.await_args.kwargs == {"patient": False}


@pytest.mark.parametrize("failure", [BamBuddyAuthError(401, "Unauthorized"), BamBuddyPermissionError(403, "Forbidden")])
async def test_a_login_in_front_of_bambuddy_is_no_key_problem(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, failure: Exception
) -> None:
    """BamBuddy asks no key for its version: a 401 or 403 there comes from
    something in front of it."""
    bambuddy_api.get_version.side_effect = failure

    result = await flow_first_step(hass)

    assert result["errors"] == {"base": "error_not_bambuddy"}


@pytest.mark.parametrize(("status", "error"), [(500, "bad_answer"), (502, "cannot_connect")])
async def test_an_error_bambuddy_answers_with(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, status: int, error: str
) -> None:
    """An error from BamBuddy itself is no "does not answer"; a proxy's
    502-504 without BamBuddy behind it is."""
    bambuddy_api.get_printers.side_effect = BamBuddyApiError(status, "Internal Server Error")

    result = await flow_first_step(hass)

    assert result["errors"] == {"base": error}


async def test_a_key_pasted_with_spaces(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    result = await flow_first_step(hass, {**FLOW_INPUT, "api_key": f"  {API_KEY}\t"})
    result = await flow_submit(hass, result["flow_id"], {"printers": [str(X1C)]})

    assert result["data"]["api_key"] == API_KEY


async def test_the_same_bambuddy_at_another_address_sets_up_no_printer_twice(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """Its host name typed once, its IP now: every printer is set up already -- said, with where."""
    make_entry(hass, X1C, A1_MINI, P1S, H2D, X1E)

    result = await flow_first_step(hass, {**FLOW_INPUT, "url": "http://192.168.1.20:8000"})

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "printers_in_use")
    assert result["description_placeholders"] == {"entries": "BamBuddy (bambuddy.local)"}


async def test_printers_another_entry_holds_are_not_offered(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A device per printer and entry: one held already would come twice,
    under the same name. The step says where the others are."""
    other = make_entry(hass, X1C, H2D)

    result = await flow_first_step(hass, {**FLOW_INPUT, "url": "http://192.168.1.20:8000"})

    assert field_defaults(result) == {"printers": ["2", "3", "5"]}
    assert (result["step_id"], result["description_placeholders"]) == ("printers_some_elsewhere", {"entries": other.title})
    result = await flow_submit(hass, result["flow_id"], {"printers": ["2"]})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["options"]["printers"] == [printer_entry(A1_MINI)]


@pytest.mark.parametrize("typed", ["http://bambuddy.local:8000", "HTTP://BamBuddy.local:8000/", "bambuddy.local:8000/api/v1"])
async def test_duplicate_url_variants_abort(hass: HomeAssistant, bambuddy_api: SimpleNamespace, typed: str) -> None:
    make_entry(hass, X1C)

    result = await flow_first_step(hass, {**FLOW_INPUT, "url": typed})

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "already_configured")


@pytest.mark.parametrize(
    ("printer", "name"),
    [
        ({"id": 7, "model": "P1S", "serial_number": "01P00A000000007", "name": "Garage"}, "Garage (P1S / 01P00A000000007)"),
        ({"id": 7, "model": "P1S", "serial_number": "01P00A000000007", "name": ""}, "P1S (01P00A000000007)"),
        # #13: a printer BamBuddy has no model for yet.
        ({"id": 7, "model": None, "serial_number": "01P00A000000007", "name": "Garage"}, "Garage (01P00A000000007)"),
        ({"id": 7, "model": None, "serial_number": "", "name": ""}, "Printer 7"),
    ],
)
def test_the_printer_names(printer: dict[str, Any], name: str) -> None:
    assert flow_printer_name(printer) == name


async def test_a_new_key_brings_a_failed_entry_back(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy refused the key at setup: the entry failed and has no update
    listener. The new key must set it up, not only report success."""
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required")
    entry = await try_set_up(hass, X1C)
    assert entry.state is ConfigEntryState.SETUP_ERROR
    [flow] = reauth_flows(hass)
    bambuddy_api.get_auth_me.side_effect = None

    result = await flow_submit(hass, flow["flow_id"], {"api_key": "bb_new_key"})
    await hass.async_block_till_done()

    assert result["reason"] == "reauth_successful"
    assert entry.state is ConfigEntryState.LOADED


async def test_a_new_address_brings_a_failed_entry_back(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy moved: the entry waits for it at the old address."""
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("refused")
    entry = await try_set_up(hass, X1C)
    assert entry.state is ConfigEntryState.SETUP_RETRY
    bambuddy_api.get_printers.side_effect = None

    result = await flow_at_new_address(hass, entry)
    result = await flow_switch(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert entry.state is ConfigEntryState.LOADED


async def test_reauthentication(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    result = await _reauth(hass, entry)
    assert (result["step_id"], result["description_placeholders"]["url"]) == ("reauth_confirm", URL)
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required")
    result = await flow_submit(hass, result["flow_id"], {"api_key": "bb_wrong"})
    assert result["errors"] == {"base": "invalid_auth"}

    bambuddy_api.get_auth_me.side_effect = None
    result = await flow_submit(hass, result["flow_id"], {"api_key": "bb_new_key"})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reauth_successful")
    assert entry.data["api_key"] == "bb_new_key"


async def test_reauthentication_with_the_same_key_brings_the_entry_back(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """BamBuddy refused the key for a while -- the key was off there, say --
    and the user enters it again: nothing in the entry changes, yet it must
    load again; after a refused key Home Assistant polls no more."""
    entry = await set_up(hass, X1C)

    result = await _reauth(hass, entry)
    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        result = await flow_submit(hass, result["flow_id"], {"api_key": entry.data["api_key"]})

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reauth_successful")
    reload.assert_called_once_with(entry.entry_id)


async def test_reconfiguration(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A new address: the entry keeps its printers and follows."""
    entry = await set_up(hass, X1C)

    result = await flow_reconfigure(hass, entry)
    assert result["step_id"] == "reconfigure"
    result = await flow_submit(hass, result["flow_id"], {**FLOW_INPUT, "url": "not an address://"})
    assert result["errors"] == {"url": "invalid_url"}
    bambuddy_api.get_version.side_effect = BamBuddyConnectionError("refused")
    result = await flow_submit(hass, result["flow_id"], {**FLOW_INPUT, "url": "https://bambuddy.example"})
    assert result["errors"] == {"base": "cannot_connect"}

    bambuddy_api.get_version.side_effect = None
    result = await flow_submit(hass, result["flow_id"], {**FLOW_INPUT, "url": "https://bambuddy.example", "verify_ssl": False})
    # A new address asks which BamBuddy it is: the same, as its printers say
    # -- every one found there, so no list of them.
    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "new_address_all")
    assert result["description_placeholders"] == {"url": "https://bambuddy.example"}
    assert result["data_schema"]({}) == {"bambuddy": "same", "add_printers": []}
    result = await flow_submit(hass, result["flow_id"], {"bambuddy": "same"})
    assert (result["step_id"], result["description_placeholders"]) == (
        "confirm_same",
        {"url": "https://bambuddy.example", "kept": f"- {printer_name(X1C)}", "removed": "–", "added": "–"},
    )
    result = await flow_submit(hass, result["flow_id"], {})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reconfigure_successful_moved")
    assert dict(entry.data) == {"url": "https://bambuddy.example", "api_key": API_KEY, "verify_ssl": False}
    assert entry.unique_id == "https://bambuddy.example"
    assert entry.options["printers"] == [printer_entry(X1C)]
    # The title follows the address; one the user gave would stay.
    assert entry.title == "BamBuddy (bambuddy.example)"


async def test_reconfiguration_never_shows_the_key(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Anyone who may open Reconfigure would read it: the field stays
    empty, empty keeps the key -- also when the form comes back with an
    error."""
    entry = await set_up(hass, X1C)

    result = await flow_reconfigure(hass, entry)
    assert _suggested(result) == {"url": URL, "verify_ssl": True}
    # A domain as an example too, filled in: hassfest refuses a URL in a string.
    assert result["description_placeholders"] == {"example_url": "https://bambuddy.example.com"}
    assert result["data_schema"]({"url": URL, "verify_ssl": True}) == {"url": URL, "verify_ssl": True}
    result = await flow_submit(hass, result["flow_id"], {"url": "not an address://", "verify_ssl": True})
    assert "api_key" not in _suggested(result)
    result = await flow_submit(hass, result["flow_id"], {"url": URL, "api_key": "  ", "verify_ssl": False})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful"
    assert dict(entry.data) == {"url": URL, "api_key": API_KEY, "verify_ssl": False}


async def test_a_new_key_survives_an_error(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A key just typed stays in the field when the form comes back -- an
    empty field would then keep the old key without a word. The stored key
    never shows."""
    entry = await set_up(hass, X1C)

    result = await flow_reconfigure(hass, entry)
    result = await flow_submit(hass, result["flow_id"], {"url": "not an address://", "api_key": "bb_new", "verify_ssl": True})
    assert result["errors"] == {"url": "invalid_url"}
    assert result["description_placeholders"]["example_url"] == "https://bambuddy.example.com"
    assert _suggested(result)["api_key"] == "bb_new"
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Invalid API key")
    result = await flow_submit(hass, result["flow_id"], {"url": URL, "api_key": "bb_new", "verify_ssl": True})
    assert result["errors"] == {"base": "invalid_auth"}
    assert _suggested(result)["api_key"] == "bb_new"


async def test_the_stored_key_refused(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The field left empty and BamBuddy refusing the stored key: it says so."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Invalid API key")

    result = await flow_reconfigure(hass, entry)
    result = await flow_submit(hass, result["flow_id"], {"url": URL, "verify_ssl": True})

    assert result["errors"] == {"base": "stored_key_refused"}
    assert "api_key" not in _suggested(result)


async def test_the_stored_key_refused_at_a_new_address(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Another BamBuddy there, most likely: it does not take the stored key --
    not "no longer"."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Invalid API key")

    result = await flow_reconfigure(hass, entry)
    result = await flow_submit(hass, result["flow_id"], {"url": NEW_URL, "verify_ssl": True})

    assert result["errors"] == {"base": "stored_key_refused_at_address"}
    assert "api_key" not in _suggested(result)


async def test_the_stored_key_goes_only_to_a_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """At a new address with the field left empty: BamBuddy's version route
    answers first, without the key -- a mistyped address that is no BamBuddy
    never gets it. A BamBuddy there gets it, and the key stays."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_system_info.reset_mock()
    bambuddy_api.get_version.side_effect = BamBuddyNotFoundError(404, "Not Found")

    result = await flow_reconfigure(hass, entry)
    result = await flow_submit(hass, result["flow_id"], {"url": "http://192.0.2.98:8000", "verify_ssl": True})
    assert result["errors"] == {"base": "not_bambuddy"}
    bambuddy_api.get_system_info.assert_not_awaited()

    bambuddy_api.get_version.side_effect = None
    result = await flow_submit(hass, result["flow_id"], {"url": NEW_URL, "verify_ssl": True})
    result = await flow_switch(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert dict(entry.data) == {"url": NEW_URL, "api_key": API_KEY, "verify_ssl": True}


async def test_reconfiguration_with_the_same_address(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Only the key changes."""
    entry = await set_up(hass, X1C)

    result = await flow_reconfigure(hass, entry)
    result = await flow_submit(hass, result["flow_id"], {**FLOW_INPUT, "api_key": "bb_other"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful"
    assert entry.data["api_key"] == "bb_other"


@pytest.mark.parametrize(
    ("source", "steps", "reason"),
    [
        ("reconfigure", [{**FLOW_INPUT, "api_key": "bb_other"}], "reconfigure_successful"),
        ("reconfigure", [{**FLOW_INPUT, "url": NEW_URL}, {"bambuddy": "same"}, {}], "reconfigure_successful_moved"),
        ("reauth", [{"api_key": "bb_new_key"}], "reauth_successful"),
    ],
    ids=["new key", "new address", "sign in again"],
)
async def test_a_change_sets_the_entry_up_once(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, source: str, steps: list[dict[str, Any]], reason: str
) -> None:
    """The update listener starts unloading the entry at once: a reload of
    our own on top set it up twice -- twice the reads, an unavailable gap
    more in every entity's history."""
    entry = await set_up(hass, X1C)
    module = importlib.import_module("custom_components.bambuddy")

    with patch.object(module, "async_setup_entry", wraps=module.async_setup_entry) as setup:
        result = await flow_reconfigure(hass, entry) if source == "reconfigure" else await _reauth(hass, entry)
        for step in steps:
            result = await flow_submit(hass, result["flow_id"], step)
        await hass.async_block_till_done()

    assert result["reason"] == reason
    assert entry.state is ConfigEntryState.LOADED
    assert setup.await_count == 1


async def test_reconfiguration_to_another_entrys_address(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    entry = make_entry(hass, X1C)
    other = make_entry(hass, A1_MINI)
    hass.config_entries.async_update_entry(other, unique_id="http://other:8000")

    result = await flow_reconfigure(hass, other)
    result = await flow_submit(hass, result["flow_id"], {**FLOW_INPUT, "url": URL})

    # A field error: the user can correct the address.
    assert (result["type"], result["errors"]) == (FlowResultType.FORM, {"url": "address_in_use"})
    assert result["description_placeholders"]["entry"] == entry.title
    assert entry.unique_id == URL
    assert other.unique_id == "http://other:8000"


async def test_reauthentication_at_an_address_that_answers_a_web_page(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """A login proxy, or a proxy's page while BamBuddy restarts: the stored
    address is kept, and the form says it is no BamBuddy there now."""
    entry = await set_up(hass, X1C)
    result = await _reauth(hass, entry)
    bambuddy_api.get_version.side_effect = BamBuddyNotJsonError(200, "The answer is not JSON")

    result = await flow_submit(hass, result["flow_id"], {"api_key": API_KEY})

    assert result["errors"] == {"base": "not_bambuddy"}


async def test_a_setup_left_open_blocks_no_new_one(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The browser tab closed during a setup: its flow stays, and Home Assistant lists no user flow to end
    it. A new setup for the address goes through; the one left ends with it."""
    left = await flow_first_step(hass)
    assert left["step_id"] == "printers"

    result = await flow_first_step(hass)
    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "printers")
    result = await flow_submit(hass, result["flow_id"], {"printers": ["1"]})
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert [flow["flow_id"] for flow in hass.config_entries.flow.async_progress()] == []


@pytest.mark.parametrize(("fixture", "marks"), SHORT_KEYS)
async def test_setup_shows_each_missing_scope(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, fixture: str, marks: dict[str, str]
) -> None:
    bambuddy_api.get_auth_me.return_value = load_fixture(fixture)

    result = await flow_first_step(hass)

    assert (result["errors"], {key: result["description_placeholders"][key] for key in marks}) == ({"base": "missing_scopes"}, marks)
    bambuddy_api.get_printers.assert_not_awaited()


async def test_any_text_is_no_key_with_authentication_off(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy without authentication answers every read, but its key check
    knows the key: a text that is none is refused."""
    bambuddy_api.get_auth_status.return_value = {"auth_enabled": False, "requires_setup": False}
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required")

    result = await flow_first_step(hass, {**FLOW_INPUT, "api_key": "anything"})

    assert result["errors"] == {"base": "invalid_auth"}


@pytest.mark.parametrize(
    ("stored", "step"),
    [
        (load_fixture("auth_me_default.json"), "reauth_scopes"),
        (BamBuddyPermissionError(403, "API key owner is deactivated or no longer exists"), "reauth_owner"),
        (BamBuddyAuthError(401, "Authentication required"), "reauth_confirm"),
        (BamBuddyConnectionError("refused"), "reauth_confirm"),
    ],
)
async def test_reauth_shows_why(hass: HomeAssistant, bambuddy_api: SimpleNamespace, stored: Any, step: str) -> None:
    """The stored key checked at the start: the dialog says why a new key
    is needed; a full key typed in any of them ends it."""
    entry = await set_up(hass, X1C)
    if isinstance(stored, Exception):
        bambuddy_api.get_auth_me.side_effect = stored
    else:
        bambuddy_api.get_auth_me.return_value = stored

    result = await _reauth(hass, entry)

    assert result["step_id"] == step
    if step == "reauth_scopes":
        assert result["description_placeholders"]["stored_control_printer"] == "\u2717"
    bambuddy_api.get_auth_me.side_effect = None
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_control.json")
    result = await flow_submit(hass, result["flow_id"], {"api_key": "bb_full_key"})
    await hass.async_block_till_done()
    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reauth_successful")
    assert entry.data["api_key"] == "bb_full_key"


async def test_reauth_names_a_typed_short_key(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A new key that lacks a scope: its own marks, the stored key's stay in the text."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_default.json")
    result = await _reauth(hass, entry)
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_other.json")

    result = await flow_submit(hass, result["flow_id"], {"api_key": "bb_other"})

    assert result["errors"] == {"base": "missing_scopes"}
    placeholders = result["description_placeholders"]
    assert (placeholders["read_status"], placeholders["stored_read_status"]) == ("\u2717", "\u2713")


async def test_reconfigure_keeps_no_short_key(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The field left empty and the stored key short: said as the stored one;
    a typed short key: its own marks."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_default.json")

    result = await flow_reconfigure(hass, entry)
    result = await flow_submit(hass, result["flow_id"], {"url": URL, "verify_ssl": True})
    assert result["errors"] == {"base": "stored_key_scopes"}
    assert result["description_placeholders"]["control_printer"] == "\u2717"

    result = await flow_submit(hass, result["flow_id"], {"url": URL, "api_key": "bb_default", "verify_ssl": True})
    assert result["errors"] == {"base": "missing_scopes"}


async def test_reauth_checks_the_stored_key_again_with_an_empty_field(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The owner got the right back in BamBuddy, the stored key was shown
    once: an empty field checks it again."""
    entry = await set_up(hass, X1C)
    stored = entry.data["api_key"]
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_default.json")
    result = await _reauth(hass, entry)
    assert result["step_id"] == "reauth_scopes"

    result = await flow_submit(hass, result["flow_id"], {})
    assert result["errors"] == {"base": "stored_key_scopes"}

    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_control.json")
    result = await flow_submit(hass, result["flow_id"], {})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reauth_successful")
    assert entry.data["api_key"] == stored
    assert entry.state is ConfigEntryState.LOADED


_KEY_WORDS = {
    "en": {
        "entered": "The API key you entered lacks permissions",
        "owner_fix": "give them that right, or create the key as a user who has it",
        "repairs": "under Settings \u2192 Repairs",
        "pasted": "Check that you pasted all of it",
        "three": "Read Status, Control Printer and Manage Maintenance",
        # What BamBuddy ticks at first may change: no text says it.
        "gone": ("off at first", "starts unticked", "Open the BamBuddy integration", "Copy it again", "although the box is ticked"),
    },
    "de": {
        "entered": "Dem eingegebenen API-Schl\u00fcssel fehlen Berechtigungen",
        "owner_fix": "Gib ihm das Recht, oder erstelle den Schl\u00fcssel als Benutzer, der es hat",
        "repairs": "unter Einstellungen \u2192 Reparaturen",
        "pasted": "Pr\u00fcfe, ob du ihn vollst\u00e4ndig eingef\u00fcgt hast",
        "three": "\u201eStatus lesen\u201c, \u201eDrucker steuern\u201c und \u201eWartung verwalten\u201c",
        "gone": ("zun\u00e4chst aus", "anfangs nicht angehakt", "\u00d6ffne die BamBuddy-Integration", "Kopiere ihn erneut", "trotz gesetztem H\u00e4kchen"),
    },
}


@pytest.mark.parametrize("language", ["en", "de"])
def test_the_key_texts_say_what_to_do(language: str) -> None:
    """The three permissions named, never what BamBuddy ticks at first (that
    may change); a short key says it is the one entered, and what a ✗ on a
    ticked permission means and asks for; the stored key's marks one below
    the other; a refused key: pasted in full?; where a new key goes; the
    owner's texts name the three."""
    words = _KEY_WORDS[language]
    texts = translations(language)
    steps, errors, exceptions = texts["config"]["step"], texts["config"]["error"], texts["exceptions"]

    assert words["three"] in steps["user"]["data_description"]["api_key"]
    for step in ("reauth_confirm", "reauth_scopes", "reauth_owner"):
        assert words["three"] in steps[step]["description"], step
        assert "\n\n1. " in steps[step]["description"], step
    assert errors["missing_scopes"].startswith(words["entered"])
    for text in (errors["missing_scopes"], steps["reauth_scopes"]["description"]):
        assert words["owner_fix"] in text
    for scope in ("read_status", "control_printer", "manage_maintenance"):
        assert re.search(rf"\n- [^\n]+ \{{stored_{scope}\}}\n", steps["reauth_scopes"]["description"]), scope
    assert words["pasted"] in errors["invalid_auth"]
    for name in ("auth_failed", "key_scopes_missing", "key_owner_inactive"):
        assert words["repairs"] in exceptions[name]["message"], name
    for text in (errors["key_owner_inactive"], exceptions["key_owner_inactive"]["message"], steps["reauth_owner"]["description"]):
        assert words["three"] in text
    assert errors["stored_key_owner"]
    everything = json.dumps(texts, ensure_ascii=False)
    for gone in words["gone"]:
        assert gone not in everything, gone


async def test_reconfigure_says_the_stored_keys_owner_is_gone(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The field left empty and the stored key's owner gone: said of the
    stored key, not of "this key"."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_auth_me.side_effect = BamBuddyPermissionError(403, "API key owner is deactivated or no longer exists")

    result = await flow_reconfigure(hass, entry)
    result = await flow_submit(hass, result["flow_id"], {"url": URL, "verify_ssl": True})

    assert result["errors"] == {"base": "stored_key_owner"}


async def test_reauth_says_the_stored_keys_owner_is_gone(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.get_auth_me.side_effect = BamBuddyPermissionError(403, "API key owner is deactivated or no longer exists")
    result = await _reauth(hass, entry)
    assert result["step_id"] == "reauth_owner"

    result = await flow_submit(hass, result["flow_id"], {})

    assert result["errors"] == {"base": "stored_key_owner"}
