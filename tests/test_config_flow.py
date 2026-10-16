"""Setting BamBuddy up, a new key, a new address, and adding or removing
printers."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from homeassistant.config_entries import SOURCE_USER, ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.bambuddy.api import (
    BamBuddyAuthError,
    BamBuddyConnectionError,
    BamBuddyNotFoundError,
    BamBuddyPermissionError,
)
from custom_components.bambuddy.config_flow import printer_name as flow_printer_name
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import (
    printer_entry,
    A1_MINI,
    API_KEY,
    H2D,
    P1S,
    URL,
    X1C,
    X1E,
    load_fixture,
    make_entry,
    printer_key,
    printer_name,
    printer_serial,
    printer_uid,
    setup_integration,
)

_INPUT = {"url": "bambuddy.local:8000/", "api_key": API_KEY, "verify_ssl": True}


async def _start(hass: HomeAssistant) -> dict[str, Any]:
    result: dict[str, Any] = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    return result


async def _submit(hass: HomeAssistant, flow_id: str, data: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = await hass.config_entries.flow.async_configure(flow_id, data)
    return result


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


@pytest.mark.parametrize(
    ("method", "failure", "error"),
    [
        ("get_version", BamBuddyConnectionError("refused"), "cannot_connect"),
        ("get_version", BamBuddyNotFoundError(404, "Not Found"), "not_bambuddy"),
        ("get_system_info", BamBuddyAuthError(401, "Authentication required"), "invalid_auth"),
        ("get_system_info", BamBuddyPermissionError(403, "API key does not have 'can_read_status' permission"), "missing_permission"),
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
    bambuddy_api.get_printers.side_effect = BamBuddyAuthError(401, "Authentication required")
    entry = make_entry(hass, X1C)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_ERROR
    [flow] = [flow for flow in hass.config_entries.flow.async_progress() if flow["context"]["source"] == "reauth"]
    bambuddy_api.get_printers.side_effect = None

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

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful"
    assert entry.state is ConfigEntryState.LOADED


async def test_reauthentication(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    result: dict[str, Any] = await entry.start_reauth_flow(hass)  # type: ignore[assignment]
    assert (result["step_id"], result["description_placeholders"]["url"]) == ("reauth_confirm", URL)
    bambuddy_api.get_system_info.side_effect = BamBuddyAuthError(401, "Authentication required")
    result = await _submit(hass, result["flow_id"], {"api_key": "bb_wrong"})
    assert result["errors"] == {"base": "invalid_auth"}

    bambuddy_api.get_system_info.side_effect = None
    result = await _submit(hass, result["flow_id"], {"api_key": "bb_new_key"})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reauth_successful")
    assert entry.data["api_key"] == "bb_new_key"


async def test_reconfiguration(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A new address: the entry keeps its printers and follows."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    assert result["step_id"] == "reconfigure"
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "not an address://"})
    assert result["errors"] == {"url": "invalid_url"}
    bambuddy_api.get_version.side_effect = BamBuddyConnectionError("refused")
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "https://bambuddy.example:443"})
    assert result["errors"] == {"base": "cannot_connect"}

    bambuddy_api.get_version.side_effect = None
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "https://bambuddy.example:443", "verify_ssl": False})
    # A new address asks which BamBuddy it is: the same, as its printers say.
    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "new_address")
    assert result["description_placeholders"] == {"url": "https://bambuddy.example:443", "kept": printer_name(X1C)}
    assert result["data_schema"]({}) == {"bambuddy": "same", "add_printers": []}
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reconfigure_successful")
    assert dict(entry.data) == {"url": "https://bambuddy.example:443", "api_key": API_KEY, "verify_ssl": False}
    assert entry.unique_id == "https://bambuddy.example:443"
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
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
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
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {"url": "not an address://", "api_key": "bb_new", "verify_ssl": True})
    assert result["errors"] == {"url": "invalid_url"}
    assert result["description_placeholders"]["example_url"] == "https://bambuddy.example.com"
    assert _suggested(result)["api_key"] == "bb_new"
    bambuddy_api.get_system_info.side_effect = BamBuddyAuthError(401, "Invalid API key")
    result = await _submit(hass, result["flow_id"], {"url": URL, "api_key": "bb_new", "verify_ssl": True})
    assert result["errors"] == {"base": "invalid_auth"}
    assert _suggested(result)["api_key"] == "bb_new"


async def test_the_stored_key_refused(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The field left empty and BamBuddy refusing the stored key: it says so."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.get_system_info.side_effect = BamBuddyAuthError(401, "Invalid API key")

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {"url": URL, "verify_ssl": True})

    assert result["errors"] == {"base": "stored_key_refused"}
    assert "api_key" not in _suggested(result)


async def test_the_stored_key_goes_only_to_a_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """At a new address with the field left empty: BamBuddy's version route
    answers first, without the key -- a mistyped address that is no BamBuddy
    never gets it. A BamBuddy there gets it, and the key stays."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.get_system_info.reset_mock()
    bambuddy_api.get_version.side_effect = BamBuddyNotFoundError(404, "Not Found")

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {"url": "http://192.0.2.98:8000", "verify_ssl": True})
    assert result["errors"] == {"base": "not_bambuddy"}
    bambuddy_api.get_system_info.assert_not_awaited()

    bambuddy_api.get_version.side_effect = None
    result = await _submit(hass, result["flow_id"], {"url": "http://192.0.2.99:8000", "verify_ssl": True})
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful"
    assert dict(entry.data) == {"url": "http://192.0.2.99:8000", "api_key": API_KEY, "verify_ssl": True}


async def test_reconfiguration_with_the_same_address(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Only the key changes."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "api_key": "bb_other"})

    assert result["reason"] == "reconfigure_successful"
    assert entry.data["api_key"] == "bb_other"


async def test_reconfiguration_to_another_entrys_address(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    entry = make_entry(hass, X1C)
    other = make_entry(hass, A1_MINI)
    hass.config_entries.async_update_entry(other, unique_id="http://other:8000")

    result: dict[str, Any] = await other.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": URL})

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "address_in_use")
    assert entry.unique_id == URL
    assert other.unique_id == "http://other:8000"


async def _options(hass: HomeAssistant, entry: Any, choice: str) -> dict[str, Any]:
    result: dict[str, Any] = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.MENU
    return await hass.config_entries.options.async_configure(result["flow_id"], {"next_step_id": choice})  # type: ignore[return-value]


async def test_adding_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    result = await _options(hass, entry, "add_printer")
    [field] = result["data_schema"].schema
    assert [option["value"] for option in result["data_schema"].schema[field].config["options"]] == ["2", "3", "4", "5"]
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"printers": ["3", "5"]})
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C, P1S, X1E]
    assert set(entry.runtime_data.printers) == {X1C, P1S, X1E}


async def test_adding_when_all_are_added(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C, A1_MINI, P1S, H2D, X1E)

    result = await _options(hass, entry, "add_printer")

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "all_printers_added")


async def test_adding_without_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entry is not loaded either: the flow asks BamBuddy itself."""
    entry = make_entry(hass, X1C)
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("refused")

    result = await _options(hass, entry, "add_printer")

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "cannot_connect")


async def test_removing_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C, A1_MINI)
    await setup_integration(hass, entry)

    result = await _options(hass, entry, "remove_printer")
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"printers": [str(A1_MINI)]})
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_without_printers_the_menu_only_adds(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)

    assert result["menu_options"] == ["add_printer"]


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
    assert labels == [printer_name(X1C), printer_name(A1_MINI)]


async def test_removing_starts_with_nothing_chosen(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A required multi-select without a default comes with its first
    option ticked: OK would remove that printer. Nothing chosen, nothing
    removed; the choices name BamBuddy's own printer names."""
    entry = make_entry(hass, X1C, A1_MINI)
    await setup_integration(hass, entry)

    result = await _options(hass, entry, "remove_printer")
    [field] = result["data_schema"].schema
    assert field.default() == []
    labels = [option["label"] for option in result["data_schema"].schema[field].config["options"]]
    assert labels == [printer_name(X1C), printer_name(A1_MINI)]
    result = await hass.config_entries.options.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "nothing_chosen")
    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C, A1_MINI]


async def test_adding_starts_with_nothing_chosen(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

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

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "other_bambuddy")
    assert result["data_schema"]({}) == {"bambuddy": "other", "remove_printers": [], "add_printers": []}
    result = await _submit(
        hass, result["flow_id"], {"bambuddy": "other", "remove_printers": [printer_key(X1C)], "add_printers": [str(P1S)]}
    )
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_other"
    assert entry.options["printers"] == [
        {"printer_id": P1S, "printer_name": printer_name(P1S).replace(printer_serial(P1S), f"OTHER{P1S}"), "serial_number": f"OTHER{P1S}"}
    ]
    assert entry.title == "My BamBuddy"


async def test_the_same_bambuddy_without_its_printers_yet(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A new BamBuddy, its printers not set up there yet: the entry keeps
    its printers, they wait under Repairs."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    bambuddy_api.get_printers.return_value = []

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    assert result["step_id"] == "other_bambuddy"
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same", "remove_printers": []})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_missing"
    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_another_bambuddy_starts_its_figures_afresh(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Its history and statistics go, their entity IDs stay: the new
    BamBuddy's figures do not continue the old one's."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    hass.config.components.add("recorder")
    purged = async_mock_service(hass, "recorder", "purge_entities")
    recorder = MagicMock()

    with patch("custom_components.bambuddy.config_flow.get_instance", return_value=recorder):
        result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
        result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
        result = await _submit(hass, result["flow_id"], {"bambuddy": "other"})
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

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    result = await _submit(hass, result["flow_id"], {"bambuddy": "other"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_other"
    assert purged == []


async def test_the_same_bambuddy_keeps_its_figures(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    hass.config.components.add("recorder")
    purged = async_mock_service(hass, "recorder", "purge_entities")

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful"
    assert purged == []


async def test_another_bambuddy_without_a_recorder(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Nothing recorded, nothing to forget."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    result = await _submit(hass, result["flow_id"], {"bambuddy": "other"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_other"


async def test_a_new_bambuddy_with_some_of_the_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Moved to a new BamBuddy that has one of the two: the move goes through,
    the found printer stays, the other is missing."""
    entry = make_entry(hass, X1C, A1_MINI)
    await setup_integration(hass, entry)
    printers = [printer for printer in load_fixture("printers.json") if printer["id"] != A1_MINI]
    bambuddy_api.get_printers.return_value = printers

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    assert result["step_id"] == "new_address"
    assert result["description_placeholders"]["kept"] == printer_name(X1C)
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_missing"
    assert result["description_placeholders"] == {"printers": printer_name(A1_MINI)}
    assert list(entry.runtime_data.printers) == [X1C]


async def test_a_new_address_removes_and_adds_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Printers missing there removed, with their devices; printers there
    added -- only those ticked, none at first."""
    entry = make_entry(hass, X1C, A1_MINI)
    await setup_integration(hass, entry)
    bambuddy_api.get_printers.return_value = [printer for printer in load_fixture("printers.json") if printer["id"] != A1_MINI]

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    assert result["data_schema"]({}) == {"bambuddy": "same", "remove_printers": [], "add_printers": []}
    result = await _submit(
        hass, result["flow_id"], {"bambuddy": "same", "remove_printers": [printer_key(A1_MINI)], "add_printers": [str(H2D)]}
    )
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful"
    assert entry.options["printers"] == [printer_entry(X1C), printer_entry(H2D)]
    identifiers = {identifier for device in dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id) for _, identifier in device.identifiers}
    assert not [identifier for identifier in identifiers if printer_key(A1_MINI) in identifier]
    assert sorted(entry.runtime_data.printers) == [X1C, H2D]


async def test_an_entry_without_printers_moves_freely(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass)
    await setup_integration(hass, entry)

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})

    assert result["step_id"] == "new_address_no_printers"
    assert result["description_placeholders"] == {"url": "http://192.0.2.99:8000"}



async def test_another_bambuddy_purges_before_clearing(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """States first, statistics after: a statistics run in between finds no
    old states to compile."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)
    hass.config.components.add("recorder")
    order: list[str] = []

    async def purge(call: ServiceCall) -> None:
        order.append("purge")

    hass.services.async_register("recorder", "purge_entities", purge)
    recorder = MagicMock()
    recorder.async_clear_statistics.side_effect = lambda *_: order.append("clear")

    with patch("custom_components.bambuddy.config_flow.get_instance", return_value=recorder):
        result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
        result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
        result = await _submit(hass, result["flow_id"], {"bambuddy": "other"})
        await hass.async_block_till_done()

    assert order == ["purge", "clear"]


async def test_a_move_names_the_printers_left_waiting(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Kept though missing: a repair each, and the result says so; removed:
    none."""
    entry = make_entry(hass, X1C, A1_MINI, P1S)
    await setup_integration(hass, entry)
    bambuddy_api.get_printers.return_value = [printer for printer in load_fixture("printers.json") if printer["id"] == X1C]

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    result = await _submit(hass, result["flow_id"], {"bambuddy": "other", "remove_printers": [printer_key(P1S)]})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_other_missing"
    assert result["description_placeholders"] == {"printers": printer_name(A1_MINI)}
    issues = ir.async_get(hass)
    assert issues.async_get_issue(DOMAIN, f"printer_missing_{entry.entry_id}_{printer_key(A1_MINI)}") is not None
    assert issues.async_get_issue(DOMAIN, f"printer_missing_{entry.entry_id}_{printer_key(P1S)}") is None


async def test_the_printers_as_they_were_when_the_address_was_entered(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """A printer removed in another tab between the two steps: the move
    still goes through, with the printers as they were."""
    entry = make_entry(hass, X1C, A1_MINI)
    await setup_integration(hass, entry)

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    hass.config_entries.async_update_entry(entry, options={"printers": [printer_entry(X1C)]})
    await hass.async_block_till_done()
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful"
    assert entry.options["printers"] == [printer_entry(X1C), printer_entry(A1_MINI)]


async def test_an_address_taken_while_choosing(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Another entry got the address between the two steps: nothing changes."""
    entry = make_entry(hass, X1C)
    await setup_integration(hass, entry)

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    other = make_entry(hass)
    hass.config_entries.async_update_entry(other, unique_id="http://192.0.2.99:8000")
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "address_in_use")
    assert entry.unique_id == URL


async def test_a_title_from_before_follows_in_any_case(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """1.x kept the host as typed: "BamBuddy (BamBuddy.local)" is still the
    title Home Assistant gave."""
    entry = make_entry(hass, X1C)
    hass.config_entries.async_update_entry(entry, title="BamBuddy (BamBuddy.local)")
    await setup_integration(hass, entry)

    result: dict[str, Any] = await entry.start_reconfigure_flow(hass)  # type: ignore[assignment]
    result = await _submit(hass, result["flow_id"], {**_INPUT, "url": "http://192.0.2.99:8000"})
    result = await _submit(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert entry.title == "BamBuddy (192.0.2.99)"
