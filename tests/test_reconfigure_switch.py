"""Reconfigure to another address: what stays, what goes, and the question before it."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.bambuddy.api import BamBuddyConnectionError
from custom_components.bambuddy.const import DOMAIN
from custom_components.bambuddy.coordinator import missing_issue

from tests.conftest import (
    A1_MINI,
    H2D,
    P1S,
    URL,
    X1C,
    X1E,
    entity_id,
    instance_uid,
    load_fixture,
    make_entry,
    printer_entry,
    printer_key,
    printer_name,
    printer_serial,
    printer_uid,
    printers_but,
    printers_only,
    set_up,
    setup_integration,
    try_set_up,
)
from tests.helpers import NEW_URL, devices_by_identifier, flow_at_new_address, flow_submit, flow_switch


async def test_moving_to_another_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """None of the entry's printers at the new address: a warning, and
    another BamBuddy preselected -- the old printer sold, a new one there."""
    entry = make_entry(hass, X1C)
    hass.config_entries.async_update_entry(entry, title="My BamBuddy")
    await setup_integration(hass, entry)
    printers = [{**printer, "serial_number": f"OTHER{printer['id']}"} for printer in load_fixture("printers.json")]
    bambuddy_api.get_printers.return_value = printers

    result = await flow_at_new_address(hass, entry)
    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "other_bambuddy")
    assert result["data_schema"]({}) == {"bambuddy": "other", "add_printers": []}
    result = await flow_switch(hass, result["flow_id"], {"bambuddy": "other", "add_printers": [str(P1S)]})
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

    result = await flow_at_new_address(hass, entry)
    assert result["step_id"] == "other_bambuddy"
    assert result["description_placeholders"] == {"url": NEW_URL, "missing": f"- {printer_name(X1C)}"}
    result = await flow_switch(hass, result["flow_id"], {"bambuddy": "same"})
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
        result = await flow_at_new_address(hass, entry)
        result = await flow_switch(hass, result["flow_id"], {"bambuddy": "other"})
        await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_other"
    total = entity_id(hass, "sensor", instance_uid(entry, "total_prints"))
    status = entity_id(hass, "sensor", printer_uid(entry, "status"))
    assert len(purged) == 1 and purged[0].data["keep_days"] == 0
    assert total in purged[0].data["entity_id"] and status not in purged[0].data["entity_id"]
    (cleared,), _ = recorder.async_clear_statistics.call_args
    assert sorted(cleared) == sorted(purged[0].data["entity_id"])
    assert er.async_get(hass).async_get(total) is not None


async def test_an_entry_never_set_up_has_no_figures_to_forget(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    bambuddy_api.get_printers.side_effect = BamBuddyConnectionError("refused")
    entry = await try_set_up(hass, X1C)
    assert entry.state is ConfigEntryState.SETUP_RETRY
    bambuddy_api.get_printers.side_effect = None
    hass.config.components.add("recorder")
    purged = async_mock_service(hass, "recorder", "purge_entities")

    result = await flow_at_new_address(hass, entry)
    result = await flow_switch(hass, result["flow_id"], {"bambuddy": "other"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_other"
    assert purged == []


async def test_the_same_bambuddy_keeps_its_figures(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C)
    hass.config.components.add("recorder")
    purged = async_mock_service(hass, "recorder", "purge_entities")

    result = await flow_at_new_address(hass, entry)
    result = await flow_switch(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert purged == []


async def test_another_bambuddy_without_a_recorder(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Nothing recorded, nothing to forget."""
    entry = await set_up(hass, X1C)

    result = await flow_at_new_address(hass, entry)
    result = await flow_switch(hass, result["flow_id"], {"bambuddy": "other"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_other"


async def test_a_new_bambuddy_with_some_of_the_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Moved to a new BamBuddy that has one of the two: the move goes through,
    the found printer stays, the other goes."""
    entry = await set_up(hass, X1C, A1_MINI)
    printers = printers_but(A1_MINI)
    bambuddy_api.get_printers.return_value = printers

    result = await flow_at_new_address(hass, entry)
    assert result["step_id"] == "new_address"
    assert result["description_placeholders"]["kept"] == f"- {printer_name(X1C)}"
    result = await flow_switch(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert entry.options["printers"] == [printer_entry(X1C)]
    assert list(entry.runtime_data.printers) == [X1C]


async def test_a_new_address_removes_and_adds_printers(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Printers missing there go, with their devices; printers there are
    added -- only those ticked, none at first."""
    entry = await set_up(hass, X1C, A1_MINI)
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)

    result = await flow_at_new_address(hass, entry)
    assert result["data_schema"]({}) == {"bambuddy": "same", "add_printers": []}
    result = await flow_switch(hass, result["flow_id"], {"bambuddy": "same", "add_printers": [str(H2D)]})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert entry.options["printers"] == [printer_entry(X1C), printer_entry(H2D)]
    identifiers = set(devices_by_identifier(hass, entry))
    assert not [identifier for identifier in identifiers if printer_key(A1_MINI) in identifier]
    assert sorted(entry.runtime_data.printers) == [X1C, H2D]


async def test_a_switch_shows_what_stays_and_goes_and_asks_before_it_changes_anything(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """The printers the new address lacks go with the switch -- named, not
    to be ticked; the user adds the new ones. A last step shows the address,
    what stays, goes and comes; nothing changes before "Switch"."""
    entry = await set_up(hass, X1C, P1S, A1_MINI)
    bambuddy_api.get_printers.return_value = printers_only(X1C, H2D, X1E)

    result = await flow_at_new_address(hass, entry)
    assert result["step_id"] == "new_address"
    assert result["description_placeholders"] == {
        "url": NEW_URL,
        "kept": f"- {printer_name(X1C)}",
        # By name, not as stored.
        "missing": f"- {printer_name(A1_MINI)}\n- {printer_name(P1S)}",
    }
    assert result["data_schema"]({}) == {"bambuddy": "same", "add_printers": []}
    # It lists printers that go: its button must not read as doing it.
    assert result["last_step"] is False
    result = await flow_submit(hass, result["flow_id"], {"bambuddy": "same", "add_printers": [str(X1E), str(H2D)]})

    assert (result["type"], result["step_id"]) == (FlowResultType.FORM, "confirm_same")
    assert result["description_placeholders"] == {
        "url": NEW_URL,
        "kept": f"- {printer_name(X1C)}",
        "removed": f"- {printer_name(A1_MINI)}\n- {printer_name(P1S)}",
        "added": f"- {printer_name(X1E)}\n- {printer_name(H2D)}",
    }
    # Nothing changed yet.
    assert (entry.unique_id, len(entry.options["printers"])) == (URL, 3)
    result = await flow_submit(hass, result["flow_id"], {})
    await hass.async_block_till_done()

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reconfigure_successful_moved")
    assert entry.unique_id == NEW_URL
    # Stored in BamBuddy's order, as at setup.
    assert entry.options["printers"] == [printer_entry(X1C), printer_entry(H2D), printer_entry(X1E)]
    identifiers = set(devices_by_identifier(hass, entry))
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
        result = await flow_at_new_address(hass, entry)
        result = await flow_submit(hass, result["flow_id"], {"bambuddy": "other"})
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

    result = await flow_at_new_address(hass, entry)

    assert result["step_id"] == "new_address_no_printers"
    assert result["description_placeholders"] == {"url": NEW_URL}
    result = await flow_submit(hass, result["flow_id"], {"bambuddy": "same", "add_printers": [str(X1C)]})
    assert result["description_placeholders"] == {"url": NEW_URL, "kept": "–", "removed": "–", "added": f"- {printer_name(X1C)}"}
    result = await flow_submit(hass, result["flow_id"], {})
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
        result = await flow_at_new_address(hass, entry)
        result = await flow_switch(hass, result["flow_id"], {"bambuddy": "other"})
        await hass.async_block_till_done()

    assert order == ["purge", "clear"]


async def test_a_printer_removed_in_another_tab_stays_removed(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Removed through Configure between the two steps: the summary and the
    switch go by the entry as it is then."""
    entry = await set_up(hass, X1C, A1_MINI)

    result = await flow_at_new_address(hass, entry)
    hass.config_entries.async_update_entry(entry, options={"printers": [printer_entry(X1C)]})
    await hass.async_block_till_done()
    result = await flow_submit(hass, result["flow_id"], {"bambuddy": "same"})
    assert result["description_placeholders"]["kept"] == f"- {printer_name(X1C)}"
    result = await flow_submit(hass, result["flow_id"], {})
    await hass.async_block_till_done()

    assert result["reason"] == "reconfigure_successful_moved"
    assert entry.options["printers"] == [printer_entry(X1C)]


async def test_the_summary_follows_printers_added_in_another_tab(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Added through Configure before "Switch": it shows in the summary --
    and a change after the summary was shown shows it again, so "Switch"
    never does what the summary did not say."""
    entry = await set_up(hass, X1C, A1_MINI)
    bambuddy_api.get_printers.return_value = printers_only(X1C, P1S)

    result = await flow_at_new_address(hass, entry)
    hass.config_entries.async_update_entry(entry, options={"printers": [printer_entry(X1C), printer_entry(A1_MINI), printer_entry(P1S)]})
    await hass.async_block_till_done()
    result = await flow_submit(hass, result["flow_id"], {"bambuddy": "same"})
    assert result["description_placeholders"] == {
        "url": NEW_URL,
        "kept": f"- {printer_name(P1S)}\n- {printer_name(X1C)}",
        "removed": f"- {printer_name(A1_MINI)}",
        "added": "–",
    }
    # The first summary: nothing to explain.
    assert not result["errors"]
    hass.config_entries.async_update_entry(entry, options={"printers": [printer_entry(X1C), printer_entry(P1S)]})
    await hass.async_block_till_done()
    result = await flow_submit(hass, result["flow_id"], {})
    assert (result["step_id"], result["description_placeholders"]["removed"]) == ("confirm_same", "–")
    # Shown again, it says why: the click did not switch.
    assert result["errors"] == {"base": "printers_changed"}
    result = await flow_submit(hass, result["flow_id"], {})
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

    result = await flow_at_new_address(hass, entry)
    assert result["description_placeholders"]["missing"] == "- Bench (A1 Mini / 0309DA000000002)"
    result = await flow_submit(hass, result["flow_id"], {"bambuddy": "same"})
    assert result["description_placeholders"]["removed"] == "- Bench (A1 Mini / 0309DA000000002)"


@pytest.mark.parametrize("open_step", ["new_address_all", "confirm_same"])
async def test_an_entry_deleted_before_the_switch(hass: HomeAssistant, bambuddy_api: SimpleNamespace, open_step: str) -> None:
    """Deleted in another tab while the server question or the summary was
    open: an ending that says so, not "Unknown error" and a traceback."""
    entry = await set_up(hass, X1C)

    result = await flow_at_new_address(hass, entry)
    if open_step == "confirm_same":
        result = await flow_submit(hass, result["flow_id"], {"bambuddy": "same"})
    assert result["step_id"] == open_step
    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()
    result = await flow_submit(hass, result["flow_id"], {"bambuddy": "same"} if open_step == "new_address_all" else {})

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "reconfigure_entry_gone")


async def test_an_address_taken_while_choosing(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Another entry got the address before "Switch": nothing changes."""
    entry = await set_up(hass, X1C)

    result = await flow_at_new_address(hass, entry)
    other = make_entry(hass)
    hass.config_entries.async_update_entry(other, unique_id=NEW_URL)
    result = await flow_switch(hass, result["flow_id"], {"bambuddy": "same"})

    assert (result["type"], result["reason"]) == (FlowResultType.ABORT, "address_in_use")
    assert result["description_placeholders"] == {"entry": other.title}
    assert entry.unique_id == URL


async def test_a_title_from_before_follows_in_any_case(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """1.x kept the host as typed: "BamBuddy (BamBuddy.local)" is still the
    title Home Assistant gave."""
    entry = make_entry(hass, X1C)
    hass.config_entries.async_update_entry(entry, title="BamBuddy (BamBuddy.local)")
    await setup_integration(hass, entry)

    result = await flow_at_new_address(hass, entry)
    result = await flow_switch(hass, result["flow_id"], {"bambuddy": "same"})
    await hass.async_block_till_done()

    assert entry.title == "BamBuddy (192.0.2.99)"


async def test_the_printers_kept_at_a_new_address_by_name(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    entry = await set_up(hass, X1C, H2D, A1_MINI)
    bambuddy_api.get_printers.return_value = printers_but(A1_MINI)

    result = await flow_at_new_address(hass, entry)

    assert result["step_id"] == "new_address"
    # Model and serial too: two printers of one name differ in them.
    assert result["description_placeholders"]["kept"] == f"- {printer_name(H2D)}\n- {printer_name(X1C)}"
