"""Setting BamBuddy up, a new key, a new address, and adding or removing
printers."""
from __future__ import annotations

import asyncio
import importlib
import json
import re
import ssl
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import aiohttp
import pytest
from homeassistant.config_entries import SOURCE_USER, ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.selector import BooleanSelector
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

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
from custom_components.bambuddy.const import DOMAIN
from custom_components.bambuddy.coordinator import missing_issue

from tests.conftest import (
    INTEGRATION,
    A1_MINI,
    API_KEY,
    H2D,
    P1S,
    URL,
    WS_TOKEN,
    X1C,
    X1E,
    load_fixture,
    make_entry,
    printer_entry,
    printer_info,
    printer_key,
    printer_name,
    printer_serial,
    printer_uid,
    printers_but,
    set_up,
    setup_integration,
)
from tests.test_live import FakeSocket, _settle

_INPUT = {"url": "bambuddy.local:8000/", "api_key": API_KEY, "verify_ssl": True}


async def _start(hass: HomeAssistant) -> dict[str, Any]:
    result: dict[str, Any] = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    return result


async def _reconfigure(hass: HomeAssistant, entry: MockConfigEntry) -> dict[str, Any]:
    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    return result


async def _submit(hass: HomeAssistant, flow_id: str, data: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = await hass.config_entries.flow.async_configure(flow_id, data)
    return result


async def _switch(hass: HomeAssistant, flow_id: str, answer: dict[str, Any]) -> dict[str, Any]:
    """A new address's second step answered, then its summary confirmed."""
    result = await _submit(hass, flow_id, answer)
    assert result["step_id"] in ("confirm_same", "confirm_other"), result
    return await _submit(hass, flow_id, {})


async def test_setting_up_with_all_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The address as the user typed it, then every printer, preselected."""
    result = await _start(hass)
    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "user")
    assert result["description_placeholders"] == {"example_url": "https://bambuddy.example.com"}

    result = await _submit(hass, result["flow_id"], _INPUT)
    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "printers")

    result = await _submit(hass, result["flow_id"], {"printers": ["1", "4"]})

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
    result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)

    [field] = result["data_schema"].schema
    assert field.default() == ["1", "2", "3", "4", "5"]


async def test_a_bambuddy_without_printers_needs_no_choice(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    bambuddy_api.get_printers.return_value = []

    result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)

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
    result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)
    assert (result["type"], result["errors"]) == (FlowResultType.FORM, {"base": error})

    getattr(bambuddy_api, method).side_effect = None
    result = await _submit(hass, result["flow_id"], _INPUT)

    assert result["step_id"] == "printers"


@pytest.mark.parametrize("version", ["0.2.4.9", "1.2.5.6"])
async def test_a_bambuddy_too_old(hass: HomeAssistant, bambuddy_api: SimpleNamespace, version: str) -> None:
    """Before 1.2.5.7 BamBuddy told every API key it held every permission:
    a read-only key would get controls that only fail."""
    bambuddy_api.get_version.return_value = version

    result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)

    assert result["errors"] == {"base": "too_old"}
    assert result["description_placeholders"] == {"example_url": "https://bambuddy.example.com", "version": version, "minimum": "1.2.5.7"}


@pytest.mark.parametrize("version", ["1.2.6b1", "not a version"])
async def test_a_version_that_is_no_number_passes(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, version: str
) -> None:
    """A beta, or a version we cannot read: BamBuddy answered, the key
    decides."""
    bambuddy_api.get_version.return_value = version

    result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)

    assert result["step_id"] == "printers"


async def test_an_invalid_address(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    result = await _submit(hass, (await _start(hass))["flow_id"], {**_INPUT, "url": "ftp://bambuddy"})

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
        result = await _submit(hass, (await _start(hass))["flow_id"], {**_INPUT, "url": typed})
    result = await _submit(hass, result["flow_id"], {"printers": [str(X1C)]})

    assert (result["type"], result["data"]["url"]) == (FlowResultType.CREATE_ENTRY, URL)
    assert result["result"].unique_id == URL
    assert calls[-1] == URL


async def test_a_web_page_that_is_no_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """HTML at the address's start: not a BamBuddy, or one too old."""
    bambuddy_api.get_version.side_effect = BamBuddyNotJsonError(200, "The answer is not JSON")

    result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)

    assert result["errors"] == {"base": "not_bambuddy"}


async def test_an_address_with_a_login(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    result = await _submit(hass, (await _start(hass))["flow_id"], {**_INPUT, "url": "http://admin:secret@bambuddy.local:8000"})

    assert result["errors"] == {"url": "url_with_login"}
    bambuddy_api.get_version.assert_not_awaited()


async def test_a_certificate_that_cannot_be_verified(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A self-signed certificate: the error points to the switch below."""
    refused = BamBuddyConnectionError("GET /updates/version: ClientConnectorCertificateError")
    refused.__cause__ = aiohttp.ClientConnectorCertificateError(MagicMock(), ssl.SSLCertVerificationError("self-signed certificate"))
    bambuddy_api.get_version.side_effect = refused

    result = await _submit(hass, (await _start(hass))["flow_id"], {**_INPUT, "url": "https://bambuddy.local"})

    assert result["errors"] == {"base": "ssl_error"}


async def test_https_at_a_plain_http_port(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """TLS against plain HTTP is no certificate problem: turning the check
    off would not help."""
    refused = BamBuddyConnectionError("GET /updates/version: ClientConnectorSSLError")
    refused.__cause__ = aiohttp.ClientConnectorSSLError(MagicMock(), ssl.SSLError("wrong version number"))
    bambuddy_api.get_version.side_effect = refused

    result = await _submit(hass, (await _start(hass))["flow_id"], {**_INPUT, "url": "https://bambuddy.local:8000"})

    assert result["errors"] == {"base": "not_https"}


async def test_an_error_at_the_first_question_asks_whether_it_is_bambuddy(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """BamBuddy answers its version to anyone, never with an error: another
    server at the address does."""
    bambuddy_api.get_version.side_effect = BamBuddyApiError(418, "HTTP 418")

    result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)

    assert result["errors"] == {"base": "error_not_bambuddy"}
    assert result["description_placeholders"]["error"] == "HTTP 418"


@pytest.mark.parametrize("flow", ["setup", "reauth"])
async def test_a_slow_system_information_does_not_block_the_flow(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, flow: str
) -> None:
    """BamBuddy walks its whole archive for it: a slow or failing answer
    leaves its figures unknown for a while -- the integration runs without
    them, so the flow does too. A refused key still says so."""
    timeout = BamBuddyConnectionError("GET /system/info: TimeoutError")
    timeout.__cause__ = TimeoutError()
    if flow == "setup":
        bambuddy_api.get_system_info.side_effect = timeout
        result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)
        assert result["step_id"] == "printers"
    else:
        entry = await set_up(hass, X1C)
        bambuddy_api.get_system_info.side_effect = timeout
        result = await entry.start_reauth_flow(hass)  # type: ignore[assignment]
        result = await _submit(hass, result["flow_id"], {"api_key": API_KEY})
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

    result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)

    assert result["errors"] == {"base": "error_not_bambuddy"}


@pytest.mark.parametrize(("status", "error"), [(500, "bad_answer"), (502, "cannot_connect")])
async def test_an_error_bambuddy_answers_with(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, status: int, error: str
) -> None:
    """An error from BamBuddy itself is no "does not answer"; a proxy's
    502-504 without BamBuddy behind it is."""
    bambuddy_api.get_printers.side_effect = BamBuddyApiError(status, "Internal Server Error")

    result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)

    assert result["errors"] == {"base": error}


async def test_a_key_pasted_with_spaces(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    result = await _submit(hass, (await _start(hass))["flow_id"], {**_INPUT, "api_key": f"  {API_KEY}\t"})
    result = await _submit(hass, result["flow_id"], {"printers": [str(X1C)]})

    assert result["data"]["api_key"] == API_KEY


async def test_the_same_bambuddy_at_another_address_sets_up_no_printer_twice(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """Its host name typed once, its IP now: every printer is set up already -- said, with where."""
    make_entry(hass, X1C, A1_MINI, P1S, H2D, X1E)

    result = await _submit(hass, (await _start(hass))["flow_id"], {**_INPUT, "url": "http://192.168.1.20:8000"})

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "printers_in_use")
    assert result["description_placeholders"] == {"entries": "BamBuddy (bambuddy.local)"}


async def test_printers_another_entry_holds_are_not_offered(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A device per printer and entry: one held already would come twice,
    under the same name. The step says where the others are."""
    other = make_entry(hass, X1C, H2D)

    result = await _submit(hass, (await _start(hass))["flow_id"], {**_INPUT, "url": "http://192.168.1.20:8000"})

    [field] = result["data_schema"].schema
    assert field.default() == ["2", "3", "5"]
    assert (result["step_id"], result["description_placeholders"]) == ("printers_some_elsewhere", {"entries": other.title})
    result = await _submit(hass, result["flow_id"], {"printers": ["2"]})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["options"]["printers"] == [printer_entry(A1_MINI)]


@pytest.mark.parametrize("typed", ["http://bambuddy.local:8000", "HTTP://BamBuddy.local:8000/", "bambuddy.local:8000/api/v1"])
async def test_duplicate_url_variants_abort(hass: HomeAssistant, bambuddy_api: SimpleNamespace, typed: str) -> None:
    make_entry(hass, X1C)

    result = await _submit(hass, (await _start(hass))["flow_id"], {**_INPUT, "url": typed})

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
    entry = make_entry(hass, X1C)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_ERROR
    [flow] = [flow for flow in hass.config_entries.flow.async_progress() if flow["context"]["source"] == "reauth"]
    bambuddy_api.get_auth_me.side_effect = None

    result = await _submit(hass, flow["flow_id"], {"api_key": "bb_new_key"})
    await hass.async_block_till_done()

    assert result["reason"] == "reauth_successful"
    assert entry.state is ConfigEntryState.LOADED


async def test_a_new_address_brings_a_failed_entry_back(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy moved: the entry waits for it at the old address."""
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("refused")
    entry = make_entry(hass, X1C)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_RETRY
    bambuddy_api.get_printers.side_effect = None

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    result = await _switch(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert entry.state is ConfigEntryState.LOADED


async def test_reauthentication(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    result: dict[str, Any] = await entry.start_reauth_flow(hass)  # type: ignore[assignment]
    assert (result["step_id"], result["description_placeholders"]["url"]) == ("reauth_confirm", URL)
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required")
    result = await _submit(hass, result["flow_id"], {"api_key": "bb_wrong"})
    assert result["errors"] == {"base": "invalid_auth"}

    bambuddy_api.get_auth_me.side_effect = None
    result = await _submit(hass, result["flow_id"], {"api_key": "bb_new_key"})
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

    result: dict[str, Any] = await entry.start_reauth_flow(hass)  # type: ignore[assignment]
    with patch.object(hass.config_entries, "async_schedule_reload") as reload:
        result = await _submit(hass, result["flow_id"], {"api_key": entry.data["api_key"]})

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reauth_successful")
    reload.assert_called_once_with(entry.entry_id)


async def test_reconfiguration(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A new address: the entry keeps its printers and follows."""
    entry = await set_up(hass, X1C)

    result = await _reconfigure(hass, entry)
    assert result["step_id"] == "reconfigure"
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "not an address://"})
    assert result["errors"] == {"url": "invalid_url"}
    bambuddy_api.get_version.side_effect = BamBuddyConnectionError("refused")
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "https://bambuddy.example"})
    assert result["errors"] == {"base": "cannot_connect"}

    bambuddy_api.get_version.side_effect = None
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "https://bambuddy.example", "verify_ssl": False})
    # A new address asks which BamBuddy it is: the same, as its printers say
    # -- every one found there, so no list of them.
    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "new_address_all")
    assert result["description_placeholders"] == {"url": "https://bambuddy.example"}
    assert result["data_schema"]({}) == {"bambuddy": "same", "add_printers": []}
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})
    assert (result["step_id"], result["description_placeholders"]) == (
        "confirm_same",
        {"url": "https://bambuddy.example", "kept": f"- {printer_name(X1C)}", "removed": "–", "added": "–"},
    )
    result = await _submit(hass, result["flow_id"], {})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reconfigure_successful_moved")
    assert dict(entry.data) == {"url": "https://bambuddy.example", "api_key": API_KEY, "verify_ssl": False}
    assert entry.unique_id == "https://bambuddy.example"
    assert entry.options["printers"] == [printer_entry(X1C)]
    # The title follows the address; one the user gave would stay.
    assert entry.title == "BamBuddy (bambuddy.example)"


def _suggested(result: dict[str, Any]) -> dict[str, Any]:
    """The values a form shows pre-filled."""
    return {
        str(key): (key.description or {}).get("suggested_value")
        for key in result["data_schema"].schema
        if (key.description or {}).get("suggested_value") is not None
    }


async def test_reconfiguration_never_shows_the_key(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Anyone who may open Reconfigure would read it: the field stays
    empty, empty keeps the key -- also when the form comes back with an
    error."""
    entry = await set_up(hass, X1C)

    result = await _reconfigure(hass, entry)
    assert _suggested(result) == {"url": URL, "verify_ssl": True}
    # A domain as an example too, filled in: hassfest refuses a URL in a string.
    assert result["description_placeholders"] == {"example_url": "https://bambuddy.example.com"}
    assert result["data_schema"]({"url": URL, "verify_ssl": True}) == {"url": URL, "verify_ssl": True}
    result = await _submit(hass, result["flow_id"], {"url": "not an address://", "verify_ssl": True})
    assert "api_key" not in _suggested(result)
    result = await _submit(hass, result["flow_id"], {"url": URL, "api_key": "  ", "verify_ssl": False})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful"
    assert dict(entry.data) == {"url": URL, "api_key": API_KEY, "verify_ssl": False}


async def test_a_new_key_survives_an_error(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A key just typed stays in the field when the form comes back -- an
    empty field would then keep the old key without a word. The stored key
    never shows."""
    entry = await set_up(hass, X1C)

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {"url": "not an address://", "api_key": "bb_new", "verify_ssl": True})
    assert result["errors"] == {"url": "invalid_url"}
    assert result["description_placeholders"]["example_url"] == "https://bambuddy.example.com"
    assert _suggested(result)["api_key"] == "bb_new"
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Invalid API key")
    result = await _submit(hass, result["flow_id"], {"url": URL, "api_key": "bb_new", "verify_ssl": True})
    assert result["errors"] == {"base": "invalid_auth"}
    assert _suggested(result)["api_key"] == "bb_new"


async def test_the_stored_key_refused(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The field left empty and BamBuddy refusing the stored key: it says so."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Invalid API key")

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {"url": URL, "verify_ssl": True})

    assert result["errors"] == {"base": "stored_key_refused"}
    assert "api_key" not in _suggested(result)


async def test_the_stored_key_refused_at_a_new_address(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Another BamBuddy there, most likely: it does not take the stored key --
    not "no longer"."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Invalid API key")

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {"url": "http://192.0.2.99:8000", "verify_ssl": True})

    assert result["errors"] == {"base": "stored_key_refused_at_address"}
    assert "api_key" not in _suggested(result)


async def test_the_stored_key_goes_only_to_a_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """At a new address with the field left empty: BamBuddy's version route
    answers first, without the key -- a mistyped address that is no BamBuddy
    never gets it. A BamBuddy there gets it, and the key stays."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_system_info.reset_mock()
    bambuddy_api.get_version.side_effect = BamBuddyNotFoundError(404, "Not Found")

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {"url": "http://192.0.2.98:8000", "verify_ssl": True})
    assert result["errors"] == {"base": "not_bambuddy"}
    bambuddy_api.get_system_info.assert_not_awaited()

    bambuddy_api.get_version.side_effect = None
    result = await _submit(hass, result["flow_id"], {"url": "http://192.0.2.99:8000", "verify_ssl": True})
    result = await _switch(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert dict(entry.data) == {"url": "http://192.0.2.99:8000", "api_key": API_KEY, "verify_ssl": True}


async def test_reconfiguration_with_the_same_address(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Only the key changes."""
    entry = await set_up(hass, X1C)

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "api_key": "bb_other"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful"
    assert entry.data["api_key"] == "bb_other"


@pytest.mark.parametrize(
    ("source", "steps", "reason"),
    [
        ("reconfigure", [{**_INPUT, "api_key": "bb_other"}], "reconfigure_successful"),
        ("reconfigure", [{**_INPUT, "url": "http://192.0.2.99:8000"}, {"bambuddy": "same"}, {}], "reconfigure_successful_moved"),
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
        result = await _reconfigure(hass, entry) if source == "reconfigure" else await entry.start_reauth_flow(hass)
        for step in steps:
            result = await _submit(hass, result["flow_id"], step)
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

    result = await _reconfigure(hass, other)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": URL})

    # A field error: the user can correct the address.
    assert (result["type"], result["errors"]) == (FlowResultType.FORM, {"url": "address_in_use"})
    assert result["description_placeholders"]["entry"] == entry.title
    assert entry.unique_id == URL
    assert other.unique_id == "http://other:8000"


# Configure's menus: the printers' steps under Manage printers, the live
# updates under Settings.
_UNDER = {"add_printer": "printers", "remove_printer": "printers", "live_updates": "settings"}


async def _options(hass: HomeAssistant, entry: Any, choice: str) -> dict[str, Any]:
    """Configure opened and its menus walked down to `choice`."""
    result: dict[str, Any] = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.MENU
    if choice in _UNDER:
        result = await hass.config_entries.options.async_configure(result["flow_id"], {"next_step_id": _UNDER[choice]})  # type: ignore[assignment]
        assert result["type"] is FlowResultType.MENU
    return await hass.config_entries.options.async_configure(result["flow_id"], {"next_step_id": choice})  # type: ignore[return-value]


async def test_adding_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    result = await _options(hass, entry, "add_printer")
    [field] = result["data_schema"].schema
    assert [option["value"] for option in result["data_schema"].schema[field].config["options"]] == ["2", "3", "4", "5"]
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"printers": ["3", "5"]})
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C, P1S, X1E]
    assert set(entry.runtime_data.printers) == {X1C, P1S, X1E}


def _other_entry(hass: HomeAssistant, *printer_ids: int, host: str = "192.168.1.20") -> MockConfigEntry:
    """Another BamBuddy entry -- the same BamBuddy at its IP -- holding these printers."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title=f"BamBuddy ({host})",
        data={"url": f"http://{host}:8000", "api_key": API_KEY, "verify_ssl": True},
        options={"printers": [printer_entry(printer_id) for printer_id in printer_ids]},
        unique_id=f"http://{host}:8000",
        version=2,
        minor_version=2,
    )
    entry.add_to_hass(hass)
    return entry


async def test_adding_printers_another_entry_holds(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Not offered; when only those are left, said with where."""
    entry = await set_up(hass, X1C)
    _other_entry(hass, A1_MINI, P1S)

    result = await _options(hass, entry, "add_printer")
    [field] = result["data_schema"].schema
    assert [option["value"] for option in result["data_schema"].schema[field].config["options"]] == ["4", "5"]
    assert result["step_id"] == "add_printer_some_elsewhere"
    assert result["description_placeholders"] == {"name": entry.title, "entries": "BamBuddy (192.168.1.20)"}
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"printers": ["4"]})
    await hass.async_block_till_done()
    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C, H2D]

    # A third entry: both named, by title.
    _other_entry(hass, X1E, host="192.168.1.21")
    result = await _options(hass, entry, "add_printer")
    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "printers_in_use")
    assert result["description_placeholders"] == {"entries": "BamBuddy (192.168.1.20), BamBuddy (192.168.1.21)"}


async def test_adding_when_all_are_added(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C, A1_MINI, P1S, H2D, X1E)

    result = await _options(hass, entry, "add_printer")

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "all_printers_added")
    assert result["description_placeholders"] == {"name": entry.title}


async def test_adding_when_bambuddy_has_none(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """None to add because BamBuddy has none: not "all are added"."""
    entry = make_entry(hass)
    bambuddy_api.get_printers.return_value = []

    result = await _options(hass, entry, "add_printer")

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "no_printers")
    assert result["description_placeholders"] == {"name": entry.title}


async def test_adding_without_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entry is not loaded either: the flow asks BamBuddy itself."""
    entry = make_entry(hass, X1C)
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("refused")

    result = await _options(hass, entry, "add_printer")

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "cannot_connect")
    assert result["description_placeholders"] == {"name": entry.title}


async def test_removing_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C, A1_MINI)

    result = await _options(hass, entry, "remove_printer")
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"printers": [printer_key(A1_MINI)]})
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_removing_one_of_two_printers_with_one_number(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A restored BamBuddy numbers the A1 Mini 1, the X1C's old number; the
    X1C waits for BamBuddy to list it again. Each printer is its own choice,
    named as it is: ticking one removes that one."""
    entry = make_entry(hass, A1_MINI, X1C)
    a1_mini = printer_info(A1_MINI)
    bambuddy_api.get_printers.return_value = [{**a1_mini, "id": X1C}]
    bambuddy_api.statuses[X1C] = load_fixture("status_a1mini.json")
    await setup_integration(hass, entry)
    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C, X1C]

    result = await _options(hass, entry, "remove_printer")
    [field] = result["data_schema"].schema
    options = result["data_schema"].schema[field].config["options"]
    assert [option["value"] for option in options] == [printer_key(A1_MINI), printer_key(X1C)]
    assert [option["label"] for option in options] == [printer_name(A1_MINI), printer_name(X1C)]
    await hass.config_entries.options.async_configure(result["flow_id"], {"printers": [printer_key(X1C)]})
    await hass.async_block_till_done()

    assert [printer["serial_number"] for printer in entry.options["printers"]] == [a1_mini["serial_number"]]


@pytest.mark.parametrize("printers", [(), (X1C,)])
async def test_configure_opens_with_printers_and_settings(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, printers: tuple[int, ...]
) -> None:
    entry = make_entry(hass, *printers)

    result = await hass.config_entries.options.async_init(entry.entry_id)

    assert (result["type"], result["step_id"], result["menu_options"]) == (FlowResultType.MENU, "init", ["printers", "settings"])
    assert result["description_placeholders"] == {"name": entry.title}


async def test_without_printers_the_menu_only_adds(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass)

    result = await _options(hass, entry, "printers")

    assert (result["step_id"], result["menu_options"]) == ("printers", ["add_printer"])


async def test_with_printers_the_menu_adds_and_removes(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C)

    result = await _options(hass, entry, "printers")

    assert (result["menu_options"], result["description_placeholders"]) == (["add_printer", "remove_printer"], {"name": entry.title})


async def test_settings_offer_the_live_updates(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C)

    result = await _options(hass, entry, "settings")

    assert (result["step_id"], result["menu_options"]) == ("settings", ["live_updates"])
    assert result["description_placeholders"] == {"name": entry.title}


async def test_the_printer_choice_labels(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Each printer as its device will be named: BamBuddy's own name first
    tells printers of one model apart."""
    result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)

    [field] = result["data_schema"].schema
    labels = [option["label"] for option in result["data_schema"].schema[field].config["options"]]
    assert labels[:2] == [printer_name(X1C), printer_name(A1_MINI)]


async def test_removing_without_a_connection_names_the_stored_printers(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """While the entry waits for BamBuddy, it knows only the names it stored."""
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("refused")
    entry = make_entry(hass, X1C, A1_MINI)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_RETRY

    result = await _options(hass, entry, "remove_printer")
    [field] = result["data_schema"].schema

    labels = [option["label"] for option in result["data_schema"].schema[field].config["options"]]
    # By name: Desk before Workshop.
    assert labels == [printer_name(A1_MINI), printer_name(X1C)]


async def test_removing_starts_with_nothing_chosen(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A required multi-select without a default comes with its first
    option ticked: OK would remove that printer. Nothing chosen, nothing
    removed; the choices name BamBuddy's own printer names."""
    entry = await set_up(hass, X1C, A1_MINI)

    result = await _options(hass, entry, "remove_printer")
    [field] = result["data_schema"].schema
    assert field.default() == []
    labels = [option["label"] for option in result["data_schema"].schema[field].config["options"]]
    # By name: Desk before Workshop.
    assert labels == [printer_name(A1_MINI), printer_name(X1C)]
    result = await hass.config_entries.options.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "nothing_chosen")
    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C, A1_MINI]


async def test_adding_starts_with_nothing_chosen(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    result = await _options(hass, entry, "add_printer")
    [field] = result["data_schema"].schema
    assert field.default() == []
    result = await hass.config_entries.options.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "nothing_chosen")
    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C]


async def test_moving_to_another_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """None of the entry's printers at the new address: a warning, and
    another BamBuddy preselected -- the old printer sold, a new one there."""
    entry = make_entry(hass, X1C)
    hass.config_entries.async_update_entry(entry, title="My BamBuddy")
    await setup_integration(hass, entry)
    printers = [{**printer, "serial_number": f"OTHER{printer['id']}"} for printer in load_fixture("printers.json")]
    bambuddy_api.get_printers.return_value = printers

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "other_bambuddy")
    assert result["data_schema"]({}) == {"bambuddy": "other", "add_printers": []}
    result = await _switch(hass, result["flow_id"], {"bambuddy": "other", "add_printers": [str(P1S)]})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_other"
    assert entry.options["printers"] == [
        {"printer_id": P1S, "printer_name": printer_name(P1S).replace(printer_serial(P1S), f"OTHER{P1S}"), "serial_number": f"OTHER{P1S}"}
    ]
    assert entry.title == "My BamBuddy"


async def test_the_same_bambuddy_without_its_printers_yet(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The same BamBuddy, its printers not set up there yet: they go with
    the switch all the same -- the summary said so; Configure → Add printers
    brings them back once they are there."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_printers.return_value = []

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    assert result["step_id"] == "other_bambuddy"
    assert result["description_placeholders"] == {"url": "http://192.0.2.99:8000", "missing": f"- {printer_name(X1C)}"}
    result = await _switch(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert entry.options["printers"] == []


async def test_another_bambuddy_starts_its_figures_afresh(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Its history and statistics go, their entity IDs stay: the new
    BamBuddy's figures do not continue the old one's."""
    entry = await set_up(hass, X1C)
    hass.config.components.add("recorder")
    purged = async_mock_service(hass, "recorder", "purge_entities")
    recorder = MagicMock()

    with patch("custom_components.bambuddy.config_flow.get_instance", return_value=recorder):
        result = await _reconfigure(hass, entry)
        result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
        result = await _switch(hass, result["flow_id"], {"bambuddy": "other"})
        await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_other"
    registry = er.async_get(hass)
    total = registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_total_prints")
    status = registry.async_get_entity_id("sensor", DOMAIN, printer_uid(entry, "status"))
    assert total is not None and status is not None
    assert len(purged) == 1 and purged[0].data["keep_days"] == 0
    assert total in purged[0].data["entity_id"] and status not in purged[0].data["entity_id"]
    (cleared,), _ = recorder.async_clear_statistics.call_args
    assert sorted(cleared) == sorted(purged[0].data["entity_id"])
    assert registry.async_get(total) is not None


async def test_an_entry_never_set_up_has_no_figures_to_forget(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("refused")
    entry = make_entry(hass, X1C)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_RETRY
    bambuddy_api.get_printers.side_effect = None
    hass.config.components.add("recorder")
    purged = async_mock_service(hass, "recorder", "purge_entities")

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    result = await _switch(hass, result["flow_id"], {"bambuddy": "other"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_other"
    assert purged == []


async def test_the_same_bambuddy_keeps_its_figures(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    hass.config.components.add("recorder")
    purged = async_mock_service(hass, "recorder", "purge_entities")

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    result = await _switch(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert purged == []


async def test_another_bambuddy_without_a_recorder(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Nothing recorded, nothing to forget."""
    entry = await set_up(hass, X1C)

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    result = await _switch(hass, result["flow_id"], {"bambuddy": "other"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_other"


async def test_a_new_bambuddy_with_some_of_the_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Moved to a new BamBuddy that has one of the two: the move goes through,
    the found printer stays, the other goes."""
    entry = await set_up(hass, X1C, A1_MINI)
    printers = printers_but(A1_MINI)
    bambuddy_api.get_printers.return_value = printers

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    assert result["step_id"] == "new_address"
    assert result["description_placeholders"]["kept"] == f"- {printer_name(X1C)}"
    result = await _switch(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert entry.options["printers"] == [printer_entry(X1C)]
    assert list(entry.runtime_data.printers) == [X1C]


async def test_a_new_address_removes_and_adds_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Printers missing there go, with their devices; printers there are
    added -- only those ticked, none at first."""
    entry = await set_up(hass, X1C, A1_MINI)
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    assert result["data_schema"]({}) == {"bambuddy": "same", "add_printers": []}
    result = await _switch(hass, result["flow_id"], {"bambuddy": "same", "add_printers": [str(H2D)]})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert entry.options["printers"] == [printer_entry(X1C), printer_entry(H2D)]
    identifiers = {identifier for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id) for _, identifier in device.identifiers}
    assert not [identifier for identifier in identifiers if printer_key(A1_MINI) in identifier]
    assert sorted(entry.runtime_data.printers) == [X1C, H2D]


async def test_a_switch_shows_what_stays_and_goes_and_asks_before_it_changes_anything(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """The printers the new address lacks go with the switch -- named, not
    to be ticked; the user adds the new ones. A last step shows the address,
    what stays, goes and comes; nothing changes before "Switch"."""
    entry = await set_up(hass, X1C, P1S, A1_MINI)
    bambuddy_api.get_printers.return_value = [printer for printer in load_fixture("printers.json") if printer["id"] in (X1C, H2D, X1E)]

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    assert result["step_id"] == "new_address"
    assert result["description_placeholders"] == {
        "url": "http://192.0.2.99:8000",
        "kept": f"- {printer_name(X1C)}",
        # By name, not as stored.
        "missing": f"- {printer_name(A1_MINI)}\n- {printer_name(P1S)}",
    }
    assert result["data_schema"]({}) == {"bambuddy": "same", "add_printers": []}
    # It lists printers that go: its button must not read as doing it.
    assert result["last_step"] is False
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same", "add_printers": [str(X1E), str(H2D)]})

    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "confirm_same")
    assert result["description_placeholders"] == {
        "url": "http://192.0.2.99:8000",
        "kept": f"- {printer_name(X1C)}",
        "removed": f"- {printer_name(A1_MINI)}\n- {printer_name(P1S)}",
        "added": f"- {printer_name(X1E)}\n- {printer_name(H2D)}",
    }
    # Nothing changed yet.
    assert (entry.unique_id, len(entry.options["printers"])) == (URL, 3)
    result = await _submit(hass, result["flow_id"], {})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reconfigure_successful_moved")
    assert entry.unique_id == "http://192.0.2.99:8000"
    # Stored in BamBuddy's order, as at setup.
    assert entry.options["printers"] == [printer_entry(X1C), printer_entry(H2D), printer_entry(X1E)]
    identifiers = {identifier for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id) for _, identifier in device.identifiers}
    assert not [identifier for identifier in identifiers if printer_key(A1_MINI) in identifier or printer_key(P1S) in identifier]
    # Gone, not waiting: no repair for them.
    issues = ir.async_get(hass)
    assert issues.async_get_issue(DOMAIN, missing_issue(entry.entry_id, printer_key(A1_MINI))) is None


async def test_closing_the_last_step_changes_nothing(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A mistyped address seen in the summary: the dialog closed, the entry
    is as it was -- the BamBuddy device's history too, which "another
    BamBuddy server" deletes only with "Switch"."""
    entry = await set_up(hass, X1C, A1_MINI)
    data = dict(entry.data)
    bambuddy_api.get_printers.return_value = [{**printer, "serial_number": f"OTHER{printer['id']}"} for printer in load_fixture("printers.json")]
    hass.config.components.add("recorder")
    purged = async_mock_service(hass, "recorder", "purge_entities")
    recorder = MagicMock()

    with patch("custom_components.bambuddy.config_flow.get_instance", return_value=recorder):
        result = await _reconfigure(hass, entry)
        result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
        result = await _submit(hass, result["flow_id"], {"bambuddy": "other"})
        assert result["step_id"] == "confirm_other"
        # None kept, none added: a dash, not an empty heading.
        assert (result["description_placeholders"]["kept"], result["description_placeholders"]["added"]) == ("–", "–")
        hass.config_entries.flow.async_abort(result["flow_id"])
        await hass.async_block_till_done()

    assert purged == []
    recorder.async_clear_statistics.assert_not_called()
    assert (entry.unique_id, dict(entry.data)) == (URL, data)
    assert entry.options["printers"] == [printer_entry(X1C), printer_entry(A1_MINI)]
    assert set(entry.runtime_data.printers) == {X1C, A1_MINI}


async def test_an_entry_without_printers_moves_freely(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass)

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})

    assert result["step_id"] == "new_address_no_printers"
    assert result["description_placeholders"] == {"url": "http://192.0.2.99:8000"}
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same", "add_printers": [str(X1C)]})
    assert result["description_placeholders"] == {"url": "http://192.0.2.99:8000", "kept": "–", "removed": "–", "added": f"- {printer_name(X1C)}"}
    result = await _submit(hass, result["flow_id"], {})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_another_bambuddy_purges_before_clearing(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """States first, statistics after: a statistics run in between finds no
    old states to compile."""
    entry = await set_up(hass, X1C)
    hass.config.components.add("recorder")
    order: list[str] = []

    async def purge(call: ServiceCall) -> None:
        order.append("purge")

    hass.services.async_register("recorder", "purge_entities", purge)
    recorder = MagicMock()
    recorder.async_clear_statistics.side_effect = lambda *_: order.append("clear")

    with patch("custom_components.bambuddy.config_flow.get_instance", return_value=recorder):
        result = await _reconfigure(hass, entry)
        result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
        result = await _switch(hass, result["flow_id"], {"bambuddy": "other"})
        await hass.async_block_till_done()

    assert order == ["purge", "clear"]


async def test_a_printer_removed_in_another_tab_stays_removed(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Removed through Configure between the two steps: the summary and the
    switch go by the entry as it is then."""
    entry = await set_up(hass, X1C, A1_MINI)

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    hass.config_entries.async_update_entry(entry, options={"printers": [printer_entry(X1C)]})
    await hass.async_block_till_done()
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})
    assert result["description_placeholders"]["kept"] == f"- {printer_name(X1C)}"
    result = await _submit(hass, result["flow_id"], {})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_the_summary_follows_printers_added_in_another_tab(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Added through Configure before "Switch": it shows in the summary --
    and a change after the summary was shown shows it again, so "Switch"
    never does what the summary did not say."""
    entry = await set_up(hass, X1C, A1_MINI)
    bambuddy_api.get_printers.return_value = [printer for printer in load_fixture("printers.json") if printer["id"] in (X1C, P1S)]

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    hass.config_entries.async_update_entry(entry, options={"printers": [printer_entry(X1C), printer_entry(A1_MINI), printer_entry(P1S)]})
    await hass.async_block_till_done()
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})
    assert result["description_placeholders"] == {
        "url": "http://192.0.2.99:8000",
        "kept": f"- {printer_name(P1S)}\n- {printer_name(X1C)}",
        "removed": f"- {printer_name(A1_MINI)}",
        "added": "–",
    }
    # The first summary: nothing to explain.
    assert not result["errors"]
    hass.config_entries.async_update_entry(entry, options={"printers": [printer_entry(X1C), printer_entry(P1S)]})
    await hass.async_block_till_done()
    result = await _submit(hass, result["flow_id"], {})
    assert (result["step_id"], result["description_placeholders"]["removed"]) == ("confirm_same", "–")
    # Shown again, it says why: the click did not switch.
    assert result["errors"] == {"base": "printers_changed"}
    result = await _submit(hass, result["flow_id"], {})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert entry.options["printers"] == [printer_entry(X1C), printer_entry(P1S)]


async def test_the_printers_that_go_by_their_names_of_now(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The device follows BamBuddy's name within a minute, the stored name
    only at the next setup: the summary names a printer as its device does."""
    entry = await set_up(hass, X1C, A1_MINI)
    devices = dr.async_get(hass)
    device = next(device for device in dr.async_entries_for_config_entry(devices, entry.entry_id) if device.name == printer_name(A1_MINI))
    devices.async_update_device(device.id, name="Bench (A1 Mini / 0309DA000000002)")
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    assert result["description_placeholders"]["missing"] == "- Bench (A1 Mini / 0309DA000000002)"
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})
    assert result["description_placeholders"]["removed"] == "- Bench (A1 Mini / 0309DA000000002)"


@pytest.mark.parametrize("open_step", ["new_address_all", "confirm_same"])
async def test_an_entry_deleted_before_the_switch(hass: HomeAssistant, bambuddy_api: SimpleNamespace, open_step: str) -> None:
    """Deleted in another tab while the server question or the summary was
    open: an ending that says so, not "Unknown error" and a traceback."""
    entry = await set_up(hass, X1C)

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    if open_step == "confirm_same":
        result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})
    assert result["step_id"] == open_step
    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"} if open_step == "new_address_all" else {})

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reconfigure_entry_gone")


async def test_an_address_taken_while_choosing(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Another entry got the address before "Switch": nothing changes."""
    entry = await set_up(hass, X1C)

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    other = make_entry(hass)
    hass.config_entries.async_update_entry(other, unique_id="http://192.0.2.99:8000")
    result = await _switch(hass, result["flow_id"], {"bambuddy": "same"})

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "address_in_use")
    assert result["description_placeholders"] == {"entry": other.title}
    assert entry.unique_id == URL


async def test_a_title_from_before_follows_in_any_case(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """1.x kept the host as typed: "BamBuddy (BamBuddy.local)" is still the
    title Home Assistant gave."""
    entry = make_entry(hass, X1C)
    hass.config_entries.async_update_entry(entry, title="BamBuddy (BamBuddy.local)")
    await setup_integration(hass, entry)

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    result = await _switch(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert entry.title == "BamBuddy (192.0.2.99)"


async def test_reauthentication_at_an_address_that_answers_a_web_page(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """A login proxy, or a proxy's page while BamBuddy restarts: the stored
    address is kept, and the form says it is no BamBuddy there now."""
    entry = await set_up(hass, X1C)
    result: dict[str, Any] = await entry.start_reauth_flow(hass)  # type: ignore[assignment]
    bambuddy_api.get_version.side_effect = BamBuddyNotJsonError(200, "The answer is not JSON")

    result = await _submit(hass, result["flow_id"], {"api_key": API_KEY})

    assert result["errors"] == {"base": "not_bambuddy"}


async def test_adding_printers_with_a_refused_key_says_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Waiting does not mend a key BamBuddy refuses."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_printers.side_effect = BamBuddyAuthError(401, "Invalid API key")

    result = await _options(hass, entry, "add_printer")

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "key_refused")
    assert result["description_placeholders"] == {"name": entry.title}



async def test_a_setup_left_open_blocks_no_new_one(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The browser tab closed during a setup: its flow stays, and Home Assistant lists no user flow to end
    it. A new setup for the address goes through; the one left ends with it."""
    left = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)
    assert left["step_id"] == "printers"

    result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)
    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "printers")
    result = await _submit(hass, result["flow_id"], {"printers": ["1"]})
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert [flow["flow_id"] for flow in hass.config_entries.flow.async_progress()] == []


async def test_the_printers_to_remove_by_name(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """In the order of their names, as when they were added -- not in the order they came."""
    entry = await set_up(hass, X1C, A1_MINI, H2D)

    result = await _options(hass, entry, "remove_printer")
    [field] = result["data_schema"].schema
    labels = [option["label"] for option in result["data_schema"].schema[field].config["options"]]
    assert labels == sorted(labels, key=str.casefold)
    assert labels[0].startswith("Desk")


async def test_the_printers_kept_at_a_new_address_by_name(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C, H2D, A1_MINI)
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})

    assert result["step_id"] == "new_address"
    # Model and serial too: two printers of one name differ in them.
    assert result["description_placeholders"]["kept"] == f"- {printer_name(H2D)}\n- {printer_name(X1C)}"


async def test_an_entry_without_printers_has_its_own_labels(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Its "Another BamBuddy" names no printers keeping their history; the labels say what each choice
    does, under the choice it belongs to."""
    entry = await set_up(hass)

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})

    assert result["step_id"] == "new_address_no_printers"
    field = next(key for key in result["data_schema"].schema if key == "bambuddy")
    assert result["data_schema"].schema[field].config["translation_key"] == "bambuddy_alone"


async def test_configure_names_the_entry_it_belongs_to(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Its menu and both steps say which BamBuddy, by the entry's name --
    renamed in Home Assistant, by that name. The dialog's title cannot: Home
    Assistant names an ending dialog after the integration."""
    entry = await set_up(hass, X1C, A1_MINI)
    hass.config_entries.async_update_entry(entry, title="Werkstatt")

    menu: dict[str, Any] = await hass.config_entries.options.async_init(entry.entry_id)
    assert (menu["type"], menu["description_placeholders"]) == (FlowResultType.MENU, {"name": "Werkstatt"})
    for submenu in ("printers", "settings"):
        menu = await _options(hass, entry, submenu)
        assert (menu["type"], menu["description_placeholders"]) == (FlowResultType.MENU, {"name": "Werkstatt"})
    for step in ("add_printer", "remove_printer"):
        result = await _options(hass, entry, step)
        assert (result["type"], result["step_id"], result["description_placeholders"]) == (FlowResultType.FORM, step, {"name": "Werkstatt"})


def test_configure_says_the_entrys_name_and_the_key_help_names_all_three() -> None:
    """The names in Configure; the key's help names the three permissions
    the integration needs, the sign-in-again steps walk through a new key."""
    for language in ("en", "de"):
        texts = json.loads((INTEGRATION / "translations" / f"{language}.json").read_text(encoding="utf-8"))
        options = texts["options"]
        for menu in ("init", "printers", "settings"):
            assert "{name}" not in options["step"][menu]["title"], (language, menu)
        for step in ("init", "printers", "settings", "add_printer", "remove_printer"):
            assert "{name}" in options["step"][step]["description"], (language, step)
        for reason in ("cannot_connect", "no_printers", "all_printers_added", "key_refused"):
            assert "{name}" in options["abort"][reason], (language, reason)
        steps = texts["config"]["step"]
        three = {"en": "all three permissions", "de": "alle drei Berechtigungen"}[language]
        for step in ("user", "reconfigure"):
            assert three in steps[step]["data_description"]["api_key"].replace("allen drei", "alle drei"), (language, step)
        create = {"en": "\u201cCreate Key\u201d", "de": "\u201eSchl\u00fcssel erstellen\u201c"}[language]
        for step in ("reauth_confirm", "reauth_scopes", "reauth_owner"):
            assert "BamBuddy" in steps[step]["title"], (language, step)
            assert create in steps[step]["description"] and "{url}" in steps[step]["description"], (language, step)
            # Its field: left empty, the stored key is checked again.
            assert steps[step]["data_description"]["api_key"], (language, step)
        assert "\n\n1. " in steps["reauth_confirm"]["description"] and "\n3. " in steps["reauth_scopes"]["description"]


@pytest.mark.parametrize(
    ("fixture", "marks"),
    [
        ("auth_me_default.json", {"read_status": "\u2713", "control_printer": "\u2717", "manage_maintenance": "\u2713"}),
        ("auth_me_read.json", {"read_status": "\u2713", "control_printer": "\u2717", "manage_maintenance": "\u2717"}),
        ("auth_me_viewer.json", {"read_status": "\u2713", "control_printer": "\u2717", "manage_maintenance": "\u2717"}),
        # BamBuddy knows the key: not an invalid one, three marks.
        ("auth_me_other.json", {"read_status": "\u2717", "control_printer": "\u2717", "manage_maintenance": "\u2717"}),
    ],
)
async def test_setup_shows_each_missing_scope(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, fixture: str, marks: dict[str, str]
) -> None:
    bambuddy_api.get_auth_me.return_value = load_fixture(fixture)

    result = await _submit(hass, (await _start(hass))["flow_id"], _INPUT)

    assert (result["errors"], {key: result["description_placeholders"][key] for key in marks}) == ({"base": "missing_scopes"}, marks)
    bambuddy_api.get_printers.assert_not_awaited()


async def test_any_text_is_no_key_with_authentication_off(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy without authentication answers every read, but its key check
    knows the key: a text that is none is refused."""
    bambuddy_api.get_auth_status.return_value = {"auth_enabled": False, "requires_setup": False}
    bambuddy_api.get_auth_me.side_effect = BamBuddyAuthError(401, "Authentication required")

    result = await _submit(hass, (await _start(hass))["flow_id"], {**_INPUT, "api_key": "anything"})

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

    result: dict[str, Any] = await entry.start_reauth_flow(hass)  # type: ignore[assignment]

    assert result["step_id"] == step
    if step == "reauth_scopes":
        assert result["description_placeholders"]["stored_control_printer"] == "\u2717"
    bambuddy_api.get_auth_me.side_effect = None
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_control.json")
    result = await _submit(hass, result["flow_id"], {"api_key": "bb_full_key"})
    await hass.async_block_till_done()
    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reauth_successful")
    assert entry.data["api_key"] == "bb_full_key"


async def test_reauth_names_a_typed_short_key(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A new key that lacks a scope: its own marks, the stored key's stay in the text."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_default.json")
    result: dict[str, Any] = await entry.start_reauth_flow(hass)  # type: ignore[assignment]
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_other.json")

    result = await _submit(hass, result["flow_id"], {"api_key": "bb_other"})

    assert result["errors"] == {"base": "missing_scopes"}
    placeholders = result["description_placeholders"]
    assert (placeholders["read_status"], placeholders["stored_read_status"]) == ("\u2717", "\u2713")


async def test_reconfigure_keeps_no_short_key(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The field left empty and the stored key short: said as the stored one;
    a typed short key: its own marks."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_default.json")

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {"url": URL, "verify_ssl": True})
    assert result["errors"] == {"base": "stored_key_scopes"}
    assert result["description_placeholders"]["control_printer"] == "\u2717"

    result = await _submit(hass, result["flow_id"], {"url": URL, "api_key": "bb_default", "verify_ssl": True})
    assert result["errors"] == {"base": "missing_scopes"}


async def test_reauth_checks_the_stored_key_again_with_an_empty_field(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The owner got the right back in BamBuddy, the stored key was shown
    once: an empty field checks it again."""
    entry = await set_up(hass, X1C)
    stored = entry.data["api_key"]
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_default.json")
    result: dict[str, Any] = await entry.start_reauth_flow(hass)  # type: ignore[assignment]
    assert result["step_id"] == "reauth_scopes"

    result = await _submit(hass, result["flow_id"], {})
    assert result["errors"] == {"base": "stored_key_scopes"}

    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_control.json")
    result = await _submit(hass, result["flow_id"], {})
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
    texts = json.loads((INTEGRATION / "translations" / f"{language}.json").read_text(encoding="utf-8"))
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

    result = await _reconfigure(hass, entry)
    result = await _submit(hass, result["flow_id"], {"url": URL, "verify_ssl": True})

    assert result["errors"] == {"base": "stored_key_owner"}


async def test_reauth_says_the_stored_keys_owner_is_gone(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    bambuddy_api.get_auth_me.side_effect = BamBuddyPermissionError(403, "API key owner is deactivated or no longer exists")
    result: dict[str, Any] = await entry.start_reauth_flow(hass)  # type: ignore[assignment]
    assert result["step_id"] == "reauth_owner"

    result = await _submit(hass, result["flow_id"], {})

    assert result["errors"] == {"base": "stored_key_owner"}


# --- Configure -> Settings -> Live updates ------------------------------------


async def _save(hass: HomeAssistant, result: dict[str, Any], live_updates: bool = True, push_gap: str = "1") -> dict[str, Any]:
    return await hass.config_entries.options.async_configure(  # type: ignore[return-value]
        result["flow_id"], {"live_updates": live_updates, "push_gap": push_gap}
    )


async def test_live_updates_say_an_open_connection(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entry's own socket is open: no second one for the test."""
    entry = await set_up(hass, X1C)
    bambuddy_api.open_socket.side_effect = None
    bambuddy_api.open_socket.return_value = FakeSocket()
    entry.runtime_data.live.async_retry_now()
    await _settle(hass)
    assert entry.runtime_data.live.connected
    tokens = bambuddy_api.get_ws_token.await_count

    result = await _options(hass, entry, "live_updates")

    assert (result["type"], result["step_id"], result["errors"]) == (FlowResultType.FORM, "live_updates", None)
    assert bambuddy_api.get_ws_token.await_count == tokens
    assert (await _save(hass, result))["type"] is FlowResultType.CREATE_ENTRY


async def test_live_updates_test_a_connection_that_is_not_open(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entry's connection waits for its next attempt: the page opens a
    socket of its own and closes it -- and wakes the connection, which
    opens its socket at once instead of waiting out its minute."""
    entry = await set_up(hass, X1C)
    live = entry.runtime_data.live
    tested, kept = FakeSocket(), FakeSocket()
    bambuddy_api.open_socket.side_effect = [tested, kept]

    result = await _options(hass, entry, "live_updates")

    assert (result["type"], result["step_id"], result["errors"]) == (FlowResultType.FORM, "live_updates_tested", None)
    assert tested.closes == 1
    await _settle(hass)
    assert live.connected
    assert live._socket is kept
    assert (await _save(hass, result))["type"] is FlowResultType.CREATE_ENTRY


@pytest.mark.parametrize(
    ("call", "error", "key", "kind"),
    [
        # The code alone: what it means is not sure from here.
        ("open_socket", BamBuddyNotFoundError(404, "HTTP 404", "GET /ws"), "live_failed", "HTTP 404"),
        ("open_socket", BamBuddyPermissionError(403, "HTTP 403", "GET /ws"), "live_failed", "HTTP 403"),
        ("get_ws_token", BamBuddyPermissionError(403, "API key lacks websocket:connect", "POST /auth/ws-token"), "live_failed", "HTTP 403"),
        ("open_socket", BamBuddyConnectionError("WebSocket: ClientConnectorError"), "live_failed", "WebSocket: ClientConnectorError"),
        ("get_ws_token", BamBuddyAuthError(401, "Invalid API key", "POST /auth/ws-token"), "live_failed", "HTTP 401"),
        ("get_ws_token", BamBuddyConnectionError("POST /auth/ws-token: HTTP 404"), "live_failed", "POST /auth/ws-token: HTTP 404"),
    ],
)
async def test_live_updates_name_what_failed(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, call: str, error: Exception, key: str, kind: str
) -> None:
    """A proxy that does not pass WebSockets, a refusal, anything else by
    its kind -- the settings can be saved all the same."""
    entry = await set_up(hass, X1C)
    waiting = entry.runtime_data.live._later
    assert waiting is not None
    getattr(bambuddy_api, call).side_effect = error

    result = await _options(hass, entry, "live_updates")

    assert (result["type"], result["step_id"], result["errors"]) == (FlowResultType.FORM, "live_updates_failed", {"base": key})
    assert result["description_placeholders"] == {"error": kind}
    # A test that failed leaves the entry's connection waiting as it was.
    await _settle(hass)
    assert entry.runtime_data.live._later is waiting
    assert (await _save(hass, result, live_updates=False))["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["live_updates"] is False


async def test_live_updates_give_up_after_ten_seconds(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A proxy that swallows the request: the page shows after the limit."""
    entry = await set_up(hass, X1C)
    waiting = entry.runtime_data.live._later

    async def never(*_: Any) -> str:
        await asyncio.Event().wait()
        return WS_TOKEN

    bambuddy_api.get_ws_token.side_effect = never
    with patch("custom_components.bambuddy.live.LIVE_TEST_TIMEOUT", 0.05):
        result = await _options(hass, entry, "live_updates")

    # A line of its own: no answer within the limit.
    assert (result["step_id"], result["errors"]) == ("live_updates_failed", {"base": "live_timeout"})
    assert result["description_placeholders"] == {"error": "TimeoutError"}
    await _settle(hass)
    assert entry.runtime_data.live._later is waiting
    assert (await _save(hass, result))["type"] is FlowResultType.CREATE_ENTRY


async def test_live_updates_while_switched_off_still_test(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Off: the page tests all the same; the entry stays without a socket."""
    entry = make_entry(hass, X1C, live_updates=False)
    await setup_integration(hass, entry)
    socket = FakeSocket()
    bambuddy_api.open_socket.side_effect = None
    bambuddy_api.open_socket.return_value = socket

    result = await _options(hass, entry, "live_updates")

    assert result["step_id"] == "live_updates_tested"
    assert socket.closes == 1
    await _settle(hass)
    assert bambuddy_api.get_ws_token.await_count == 1
    assert not entry.runtime_data.live.connected
    assert (await _save(hass, result, live_updates=False))["type"] is FlowResultType.CREATE_ENTRY


async def test_live_updates_on_an_entry_that_did_not_load(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entry waits for BamBuddy: the page tests with a client of its
    own; what is saved there the next setup takes."""
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("refused")
    entry = make_entry(hass, X1C)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_RETRY
    socket = FakeSocket()
    bambuddy_api.open_socket.side_effect = None
    bambuddy_api.open_socket.return_value = socket

    result = await _options(hass, entry, "live_updates")
    assert (result["step_id"], socket.closes) == ("live_updates_tested", 1)
    result = await _save(hass, result, live_updates=False, push_gap="5")
    assert result["type"] is FlowResultType.CREATE_ENTRY

    bambuddy_api.get_printers.side_effect = None
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    assert not entry.runtime_data.live.enabled
    assert entry.runtime_data.printers[X1C].push_gap == 5


async def test_live_updates_show_the_stored_settings(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C, live_updates=False, push_gap=5)

    result = await _options(hass, entry, "live_updates")

    schema = result["data_schema"].schema
    assert {str(key): key.default() for key in schema} == {"live_updates": False, "push_gap": "5"}
    gap = next(value for key, value in schema.items() if str(key) == "push_gap")
    assert (gap.config["options"], gap.config["translation_key"], gap.config["mode"]) == (["1", "2", "5"], "push_gap", "list")
    # A switch, whose help Home Assistant writes as large as the gap's (a
    # checkbox's in 10 px).
    assert isinstance(next(value for key, value in schema.items() if str(key) == "live_updates"), BooleanSelector)
    assert (await _save(hass, result, live_updates=False, push_gap="5"))["type"] is FlowResultType.CREATE_ENTRY


async def test_saving_live_updates_keeps_the_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Saved: the printers stay, the gap is a number, the running entry
    takes both at once."""
    entry = await set_up(hass, X1C, A1_MINI)
    before = dict(entry.options)
    runtime = entry.runtime_data

    result = await _save(hass, await _options(hass, entry, "live_updates"), live_updates=False, push_gap="2")
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options == {**before, "live_updates": False, "push_gap": 2}
    assert entry.runtime_data is runtime
    assert {printer.push_gap for printer in runtime.printers.values()} == {2}
    assert not runtime.live.enabled
