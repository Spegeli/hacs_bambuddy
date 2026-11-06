"""Configure: adding and removing printers, the live update settings."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers.selector import BooleanSelector
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.bambuddy.api import (
    BamBuddyAuthError,
    BamBuddyConnectionError,
    BamBuddyNotFoundError,
    BamBuddyPermissionError,
)

from tests.conftest import (
    A1_MINI,
    H2D,
    P1S,
    X1C,
    X1E,
    load_fixture,
    make_entry,
    printer_entry,
    printer_info,
    printer_key,
    printer_name,
    set_up,
    setup_integration,
    try_set_up,
    translations,
)
from tests.helpers import (
    FakeSocket,
    field_choices,
    field_defaults,
    flow_at_new_address,
    flow_first_step,
    never_answers,
    open_options,
    reload_entry,
    settle,
    socket_ready,
)


def _other_entry(hass: HomeAssistant, *printer_ids: int, host: str = "192.168.1.20") -> MockConfigEntry:
    """Another BamBuddy entry -- the same BamBuddy at its IP -- holding these printers."""
    return make_entry(hass, *printer_ids, url=f"http://{host}:8000", title=f"BamBuddy ({host})")


# Configure's menus: the printers' steps under Manage printers, the live
# updates under Settings.
async def test_adding_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    result = await open_options(hass, entry, "add_printer")
    assert field_choices(result) == ["2", "3", "4", "5"]
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"printers": ["3", "5"]})
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C, P1S, X1E]
    assert set(entry.runtime_data.printers) == {X1C, P1S, X1E}


async def test_adding_printers_another_entry_holds(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Not offered; when only those are left, said with where."""
    entry = await set_up(hass, X1C)
    _other_entry(hass, A1_MINI, P1S)

    result = await open_options(hass, entry, "add_printer")
    assert field_choices(result) == ["4", "5"]
    assert result["step_id"] == "add_printer_some_elsewhere"
    assert result["description_placeholders"] == {"name": entry.title, "entries": "BamBuddy (192.168.1.20)"}
    result = await hass.config_entries.options.async_configure(result["flow_id"], {"printers": ["4"]})
    await hass.async_block_till_done()
    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C, H2D]

    # A third entry: both named, by title.
    _other_entry(hass, X1E, host="192.168.1.21")
    result = await open_options(hass, entry, "add_printer")
    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "printers_in_use")
    assert result["description_placeholders"] == {"entries": "BamBuddy (192.168.1.20), BamBuddy (192.168.1.21)"}


async def test_adding_when_all_are_added(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C, A1_MINI, P1S, H2D, X1E)

    result = await open_options(hass, entry, "add_printer")

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "all_printers_added")
    assert result["description_placeholders"] == {"name": entry.title}


async def test_adding_when_bambuddy_has_none(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """None to add because BamBuddy has none: not "all are added"."""
    entry = make_entry(hass)
    bambuddy_api.get_printers.return_value = []

    result = await open_options(hass, entry, "add_printer")

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "no_printers")
    assert result["description_placeholders"] == {"name": entry.title}


async def test_adding_without_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entry is not loaded either: the flow asks BamBuddy itself."""
    entry = make_entry(hass, X1C)
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("refused")

    result = await open_options(hass, entry, "add_printer")

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "cannot_connect")
    assert result["description_placeholders"] == {"name": entry.title}


async def test_removing_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C, A1_MINI)

    result = await open_options(hass, entry, "remove_printer")
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

    result = await open_options(hass, entry, "remove_printer")
    assert field_choices(result) == [printer_key(A1_MINI), printer_key(X1C)]
    assert field_choices(result, "label") == [printer_name(A1_MINI), printer_name(X1C)]
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

    result = await open_options(hass, entry, "printers")

    assert (result["step_id"], result["menu_options"]) == ("printers", ["add_printer"])


async def test_with_printers_the_menu_adds_and_removes(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C)

    result = await open_options(hass, entry, "printers")

    assert (result["menu_options"], result["description_placeholders"]) == (["add_printer", "remove_printer"], {"name": entry.title})


async def test_settings_offer_the_live_updates(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C)

    result = await open_options(hass, entry, "settings")

    assert (result["step_id"], result["menu_options"]) == ("settings", ["live_updates"])
    assert result["description_placeholders"] == {"name": entry.title}


async def test_the_printer_choice_labels(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Each printer as its device will be named: BamBuddy's own name first
    tells printers of one model apart."""
    result = await flow_first_step(hass)

    labels = field_choices(result, "label")
    assert labels[:2] == [printer_name(X1C), printer_name(A1_MINI)]


async def test_removing_without_a_connection_names_the_stored_printers(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """While the entry waits for BamBuddy, it knows only the names it stored."""
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("refused")
    entry = await try_set_up(hass, X1C, A1_MINI)
    assert entry.state is ConfigEntryState.SETUP_RETRY

    result = await open_options(hass, entry, "remove_printer")

    labels = field_choices(result, "label")
    # By name: Desk before Workshop.
    assert labels == [printer_name(A1_MINI), printer_name(X1C)]


async def test_removing_starts_with_nothing_chosen(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A required multi-select without a default comes with its first
    option ticked: OK would remove that printer. Nothing chosen, nothing
    removed; the choices name BamBuddy's own printer names."""
    entry = await set_up(hass, X1C, A1_MINI)

    result = await open_options(hass, entry, "remove_printer")
    assert field_defaults(result) == {"printers": []}
    labels = field_choices(result, "label")
    # By name: Desk before Workshop.
    assert labels == [printer_name(A1_MINI), printer_name(X1C)]
    result = await hass.config_entries.options.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "nothing_chosen")
    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C, A1_MINI]


async def test_adding_starts_with_nothing_chosen(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)

    result = await open_options(hass, entry, "add_printer")
    assert field_defaults(result) == {"printers": []}
    result = await hass.config_entries.options.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "nothing_chosen")
    assert [printer["printer_id"] for printer in entry.options["printers"]] == [X1C]


async def test_adding_printers_with_a_refused_key_says_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Waiting does not mend a key BamBuddy refuses."""
    entry = await set_up(hass, X1C)
    bambuddy_api.get_printers.side_effect = BamBuddyAuthError(401, "Invalid API key")

    result = await open_options(hass, entry, "add_printer")

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "key_refused")
    assert result["description_placeholders"] == {"name": entry.title}


async def test_the_printers_to_remove_by_name(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """In the order of their names, as when they were added -- not in the order they came."""
    entry = await set_up(hass, X1C, A1_MINI, H2D)

    result = await open_options(hass, entry, "remove_printer")
    labels = field_choices(result, "label")
    assert labels == sorted(labels, key=str.casefold)
    assert labels[0].startswith("Desk")


async def test_an_entry_without_printers_has_its_own_labels(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Its "Another BamBuddy" names no printers keeping their history; the labels say what each choice
    does, under the choice it belongs to."""
    entry = await set_up(hass)

    result = await flow_at_new_address(hass, entry)

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
        menu = await open_options(hass, entry, submenu)
        assert (menu["type"], menu["description_placeholders"]) == (FlowResultType.MENU, {"name": "Werkstatt"})
    for step in ("add_printer", "remove_printer"):
        result = await open_options(hass, entry, step)
        assert (result["type"], result["step_id"], result["description_placeholders"]) == (FlowResultType.FORM, step, {"name": "Werkstatt"})


def test_configure_says_the_entrys_name_and_the_key_help_names_all_three() -> None:
    """The names in Configure; the key's help names the three permissions
    the integration needs, the sign-in-again steps walk through a new key."""
    for language in ("en", "de"):
        texts = translations(language)
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


async def _save(hass: HomeAssistant, result: dict[str, Any], live_updates: bool = True, push_gap: str = "1") -> dict[str, Any]:
    return await hass.config_entries.options.async_configure(  # type: ignore[return-value]
        result["flow_id"], {"live_updates": live_updates, "push_gap": push_gap}
    )


async def test_live_updates_say_an_open_connection(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entry's own socket is open: no second one for the test."""
    entry = await set_up(hass, X1C)
    socket_ready(bambuddy_api)
    entry.runtime_data.live.async_retry_now()
    await settle(hass)
    assert entry.runtime_data.live.connected
    tokens = bambuddy_api.get_ws_token.await_count

    result = await open_options(hass, entry, "live_updates")

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

    result = await open_options(hass, entry, "live_updates")

    assert (result["type"], result["step_id"], result["errors"]) == (FlowResultType.FORM, "live_updates_tested", None)
    assert tested.closes == 1
    await settle(hass)
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

    result = await open_options(hass, entry, "live_updates")

    assert (result["type"], result["step_id"], result["errors"]) == (FlowResultType.FORM, "live_updates_failed", {"base": key})
    assert result["description_placeholders"] == {"error": kind}
    # A test that failed leaves the entry's connection waiting as it was.
    await settle(hass)
    assert entry.runtime_data.live._later is waiting
    assert (await _save(hass, result, live_updates=False))["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["live_updates"] is False


async def test_live_updates_give_up_after_ten_seconds(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A proxy that swallows the request: the page shows after the limit."""
    entry = await set_up(hass, X1C)
    waiting = entry.runtime_data.live._later

    bambuddy_api.get_ws_token.side_effect = never_answers
    with patch("custom_components.bambuddy.live.LIVE_TEST_TIMEOUT", 0.05):
        result = await open_options(hass, entry, "live_updates")

    # A line of its own: no answer within the limit.
    assert (result["step_id"], result["errors"]) == ("live_updates_failed", {"base": "live_timeout"})
    assert result["description_placeholders"] == {"error": "TimeoutError"}
    await settle(hass)
    assert entry.runtime_data.live._later is waiting
    assert (await _save(hass, result))["type"] is FlowResultType.CREATE_ENTRY


async def test_live_updates_while_switched_off_still_test(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Off: the page tests all the same; the entry stays without a socket."""
    entry = make_entry(hass, X1C, live_updates=False)
    await setup_integration(hass, entry)
    socket = socket_ready(bambuddy_api)

    result = await open_options(hass, entry, "live_updates")

    assert result["step_id"] == "live_updates_tested"
    assert socket.closes == 1
    await settle(hass)
    assert bambuddy_api.get_ws_token.await_count == 1
    assert not entry.runtime_data.live.connected
    assert (await _save(hass, result, live_updates=False))["type"] is FlowResultType.CREATE_ENTRY


async def test_live_updates_on_an_entry_that_did_not_load(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The entry waits for BamBuddy: the page tests with a client of its
    own; what is saved there the next setup takes."""
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("refused")
    entry = await try_set_up(hass, X1C)
    assert entry.state is ConfigEntryState.SETUP_RETRY
    socket = socket_ready(bambuddy_api)

    result = await open_options(hass, entry, "live_updates")
    assert (result["step_id"], socket.closes) == ("live_updates_tested", 1)
    result = await _save(hass, result, live_updates=False, push_gap="5")
    assert result["type"] is FlowResultType.CREATE_ENTRY

    bambuddy_api.get_printers.side_effect = None
    await reload_entry(hass, entry.entry_id)
    assert entry.state is ConfigEntryState.LOADED
    assert not entry.runtime_data.live.enabled
    assert entry.runtime_data.printers[X1C].push_gap == 5


async def test_live_updates_show_the_stored_settings(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = make_entry(hass, X1C, live_updates=False, push_gap=5)

    result = await open_options(hass, entry, "live_updates")

    schema = result["data_schema"].schema
    assert field_defaults(result) == {"live_updates": False, "push_gap": "5"}
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

    result = await _save(hass, await open_options(hass, entry, "live_updates"), live_updates=False, push_gap="2")
    await hass.async_block_till_done()

    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options == {**before, "live_updates": False, "push_gap": 2}
    assert entry.runtime_data is runtime
    assert {printer.push_gap for printer in runtime.printers.values()} == {2}
    assert not runtime.live.enabled
