"""The inventory's actions: assign a spool to a slot, remove the assignment,
list the spools for a slot."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError

from custom_components.bambuddy.api import (
    BamBuddyApiError,
    BamBuddyConnectionError,
    BamBuddyNotFoundError,
    BamBuddyPermissionError,
)
from custom_components.bambuddy.const import DOMAIN

from tests.conftest import H2D, X1C, ams_uid, entity_id, load_fixture, printer_uid, set_up, state_at


def _extra(spool_id: int, **fields: Any) -> dict[str, Any]:
    return {**load_fixture("inventory_spools.json")[0], "id": spool_id, "note": None, "storage_location": None, **fields}


def with_inventory(bambuddy_api: SimpleNamespace, *extra: dict[str, Any]) -> None:
    """Spool 1 in the X1C's AMS A slot 3, spool 2 in slot 4 (empty), spool 3
    on the Desk (printer 99); `extra` spools in no slot."""
    bambuddy_api.get_spools.return_value = [*load_fixture("inventory_spools.json"), *extra]
    bambuddy_api.get_spool_assignments.return_value = load_fixture("inventory_assignments.json")


def idle(bambuddy_api: SimpleNamespace) -> None:
    """The X1C idle, nothing loaded."""
    bambuddy_api.statuses[X1C].update(state="IDLE", tray_now=255)


def _slot(hass: HomeAssistant, entry: Any, slot: int) -> str:
    return entity_id(hass, "sensor", ams_uid(entry, 0, f"slot_{slot}"))


async def _act(hass: HomeAssistant, action: str, **data: Any) -> Any:
    return await hass.services.async_call(DOMAIN, action, data, blocking=True, return_response=action == "get_spools")


def _calls(bambuddy_api: SimpleNamespace) -> list[tuple[Any, ...]]:
    """The writes in the order BamBuddy got them."""
    calls: list[tuple[Any, ...]] = []
    bambuddy_api.unassign_spool.side_effect = lambda *args: calls.append(("unassign", *args))
    bambuddy_api.assign_spool.side_effect = lambda *args, **kwargs: calls.append(("assign", *args, kwargs)) or {}
    return calls


async def test_a_spool_is_assigned_to_a_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A spool in no slot: assigned at once; the inventory and the printer are read again."""
    with_inventory(bambuddy_api, _extra(7, color_name="Red"))
    idle(bambuddy_api)
    entry = await set_up(hass, X1C)
    calls = _calls(bambuddy_api)
    reads = bambuddy_api.get_spool_assignments.await_count

    await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=7)

    assert calls == [("assign", 7, X1C, 0, 2, {"move": False})]
    # Once fresh before (where is the spool now?), once after.
    assert bambuddy_api.get_spool_assignments.await_count >= reads + 2


async def test_assigning_a_spool_from_another_slot_moves_it(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Spool 1 sits in slot 3: into the empty slot 4 it moves -- the old link
    goes first (BamBuddy 1.2.5.7 would keep both), then "move" for the newer line."""
    with_inventory(bambuddy_api)
    idle(bambuddy_api)
    entry = await set_up(hass, X1C)
    calls = _calls(bambuddy_api)

    await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 4), spool_id=1)

    assert calls == [("unassign", X1C, 0, 2), ("assign", 1, X1C, 0, 3, {"move": True})]


async def test_assigning_a_spool_from_another_printer_moves_it(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Spool 3 sits on the Desk, a printer this entry does not hold: it moves too."""
    with_inventory(bambuddy_api)
    idle(bambuddy_api)
    entry = await set_up(hass, X1C)
    calls = _calls(bambuddy_api)

    await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=3)

    assert calls == [("unassign", 99, 0, 0), ("assign", 3, X1C, 0, 2, {"move": True})]


async def test_a_move_whose_old_link_is_gone_goes_on(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_inventory(bambuddy_api)
    idle(bambuddy_api)
    entry = await set_up(hass, X1C)
    bambuddy_api.unassign_spool.side_effect = BamBuddyNotFoundError(404, "Assignment not found")

    await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 4), spool_id=1)

    bambuddy_api.assign_spool.assert_awaited_once_with(1, X1C, 0, 3, move=True)


async def test_the_external_spool_takes_a_spool(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_inventory(bambuddy_api, _extra(7))
    idle(bambuddy_api)
    entry = await set_up(hass, X1C)

    await _act(hass, "assign_spool", entity_id=entity_id(hass, "sensor", printer_uid(entry, "external_spool")), spool_id=7)

    bambuddy_api.assign_spool.assert_awaited_once_with(7, X1C, 255, 0, move=False)


async def test_a_paused_print_may_take_a_spool_in_its_slot(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_inventory(bambuddy_api, _extra(7))
    bambuddy_api.statuses[X1C].update(state="PAUSE", tray_now=2)
    entry = await set_up(hass, X1C)

    await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=7)

    bambuddy_api.assign_spool.assert_awaited_once()


@pytest.mark.parametrize(
    ("setup", "slot", "spool", "key"),
    [
        ("no_inventory_update", 3, 7, "inventory_not_allowed"),
        ("spoolman", 3, 7, "inventory_not_shown"),
        ("offline", 3, 7, "printer_offline"),
        ("filament_change", 3, 7, "filament_change"),
        ("printing_from_it", 3, 7, "slot_in_use"),
        ("idle", 1, 7, "rfid_spool"),
        ("idle", 3, 8, "spool_not_for_ams"),
    ],
)
async def test_an_assignment_is_refused(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, setup: str, slot: int, spool: int, key: str
) -> None:
    with_inventory(bambuddy_api, _extra(7), _extra(8, material="TPU 95A"))
    idle(bambuddy_api)
    status = bambuddy_api.statuses[X1C]
    if setup == "no_inventory_update":
        bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_control_no_inventory.json")
    elif setup == "spoolman":
        bambuddy_api.get_spoolman_status.return_value = {"enabled": True, "connected": True, "url": None}
    elif setup == "offline":
        status["connected"] = False
    elif setup == "filament_change":
        status["ams_status_main"] = 1
    elif setup == "printing_from_it":
        status.update(state="RUNNING", tray_now=2)
    entry = await set_up(hass, X1C)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "assign_spool", entity_id=_slot(hass, entry, slot), spool_id=spool)

    assert raised.value.translation_key == key
    bambuddy_api.assign_spool.assert_not_awaited()


async def test_a_spool_made_after_the_last_read_is_assigned(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The action reads BamBuddy's inventory fresh: a spool created a moment ago is
    found -- and judged -- by that read, not by the one of up to a minute before."""
    with_inventory(bambuddy_api)
    idle(bambuddy_api)
    entry = await set_up(hass, X1C)
    with_inventory(bambuddy_api, _extra(7), _extra(8, material="TPU 95A"))

    await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=7)
    bambuddy_api.assign_spool.assert_awaited_once_with(7, X1C, 0, 2, move=False)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=8)
    assert raised.value.translation_key == "spool_not_for_ams"


async def test_a_spool_bambuddy_does_not_list_goes_to_bambuddy(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Archived or deleted: BamBuddy says which (its 400 or 404), not the integration."""
    with_inventory(bambuddy_api)
    idle(bambuddy_api)
    entry = await set_up(hass, X1C)
    bambuddy_api.assign_spool.side_effect = BamBuddyApiError(400, "Cannot assign an archived spool")

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=42)

    assert raised.value.translation_key == "spool_archived"
    bambuddy_api.assign_spool.assert_awaited_once_with(42, X1C, 0, 2, move=False)


@pytest.mark.parametrize(
    ("error", "key"),
    [
        (BamBuddyApiError(400, "Cannot assign an archived spool"), "spool_archived"),
        (BamBuddyNotFoundError(404, "Spool not found"), "spool_not_found"),
        (BamBuddyPermissionError(403, "Permission denied"), "inventory_not_allowed"),
        (BamBuddyApiError(400, "Something else"), "command_failed"),
    ],
)
async def test_bambuddys_refusals_of_an_assignment(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, error: Exception, key: str
) -> None:
    """A spool archived or deleted since the last read, a key BamBuddy refuses:
    said as such, and never a reauthentication."""
    with_inventory(bambuddy_api, _extra(7))
    idle(bambuddy_api)
    entry = await set_up(hass, X1C)
    bambuddy_api.assign_spool.side_effect = error

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=7)

    assert raised.value.translation_key == key
    assert not hass.config_entries.flow.async_progress()


async def test_a_bambuddy_without_answer_says_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_inventory(bambuddy_api, _extra(7))
    idle(bambuddy_api)
    entry = await set_up(hass, X1C)
    bambuddy_api.assign_spool.side_effect = BamBuddyConnectionError("down")

    with pytest.raises(HomeAssistantError) as raised:
        await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=7)

    assert raised.value.translation_key == "cannot_connect"


@pytest.mark.parametrize("state", ["RUNNING", "offline"])
async def test_an_assignment_is_removed(hass: HomeAssistant, bambuddy_api: SimpleNamespace, state: str) -> None:
    """Only the link goes, nothing reaches the printer: also during a print and offline."""
    with_inventory(bambuddy_api)
    if state == "offline":
        bambuddy_api.statuses[X1C]["connected"] = False
    entry = await set_up(hass, X1C)

    await _act(hass, "unassign_spool", entity_id=_slot(hass, entry, 3))

    bambuddy_api.unassign_spool.assert_awaited_once_with(X1C, 0, 2)


@pytest.mark.parametrize(("slot", "gone"), [(2, False), (3, True)])
async def test_no_assignment_to_remove(hass: HomeAssistant, bambuddy_api: SimpleNamespace, slot: int, gone: bool) -> None:
    """A slot without a spool, or one whose link BamBuddy no longer has."""
    with_inventory(bambuddy_api)
    entry = await set_up(hass, X1C)
    if gone:
        bambuddy_api.unassign_spool.side_effect = BamBuddyNotFoundError(404, "Assignment not found")

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "unassign_spool", entity_id=_slot(hass, entry, slot))

    assert raised.value.translation_key == "no_assignment"


async def test_removing_needs_manage_inventory(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_inventory(bambuddy_api)
    bambuddy_api.get_auth_me.return_value = load_fixture("auth_me_control_no_inventory.json")
    entry = await set_up(hass, X1C)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "unassign_spool", entity_id=_slot(hass, entry, 3))

    assert raised.value.translation_key == "inventory_not_allowed"
    bambuddy_api.unassign_spool.assert_not_awaited()


async def test_a_slots_spool_list(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Fresh from BamBuddy: the slot's spool first, then BamBuddy's order
    (material, brand, colour); where each one sits and whether it fits."""
    with_inventory(bambuddy_api, _extra(7, brand="Acme", material="PETG", color_name="Blue"), _extra(8, material="TPU 95A"))
    entry = await set_up(hass, X1C)
    reads = bambuddy_api.get_spools.await_count

    answer = await _act(hass, "get_spools", entity_id=_slot(hass, entry, 3))

    assert bambuddy_api.get_spools.await_count == reads + 1
    assert answer["assigned"] == 1
    spools = answer["spools"]
    # The slot's own first; then by material ("PETG" before "PLA"), brand, colour name.
    assert [spool["id"] for spool in spools] == [1, 7, 2, 3, 8]
    by_id = {spool["id"]: spool for spool in spools}
    assert by_id[1]["place"] == {"this_slot": True}
    assert by_id[1]["name"] == "Geeetech PLA Basic"
    assert by_id[2]["place"] == {
        "printer_id": X1C,
        "printer_name": "Workshop",
        "ams_id": 0,
        "tray_id": 3,
        "ams_label": None,
        "same_printer": True,
    }
    assert by_id[3]["place"]["printer_name"] == "Desk"
    assert by_id[3]["place"]["same_printer"] is False
    assert by_id[7]["place"] is None
    assert by_id[8]["fits"] == "not_for_ams"
    assert by_id[1]["fits"] is None
    assert "note" not in spools[0]


async def test_a_chip_spool_in_another_slot_is_not_for_assigning(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy links a Bambu spool by its chip to the slot its chip is read in, and
    keeps a hand assignment beside that: one in another slot is listed as not for
    assigning and refused. One on the shelf -- for the external spool, say, which
    reads no chip -- is assigned as any other, as is a spool with an NFC tag of its own."""
    with_inventory(
        bambuddy_api,
        _extra(7, tag_uid="A1B2C3D4E5F60708", tray_uuid="0123456789ABCDEF0123456789ABCDEF"),
        _extra(8, tag_uid="04A2B3C4D5E680", tray_uuid=None),
    )
    idle(bambuddy_api)
    entry = await set_up(hass, X1C)

    answer = await _act(hass, "get_spools", entity_id=_slot(hass, entry, 3))
    fits = {spool["id"]: spool["fits"] for spool in answer["spools"]}
    # Spool 2 is a Bambu spool with its chip in slot 4.
    assert (fits[2], fits[7], fits[8]) == ("by_chip", None, None)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=2)
    assert raised.value.translation_key == "spool_by_chip"
    bambuddy_api.assign_spool.assert_not_awaited()

    await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=7)
    await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=8)
    assert [call.args[0] for call in bambuddy_api.assign_spool.await_args_list] == [7, 8]


async def test_a_spool_in_a_printing_printer_is_locked(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A spool in a slot of another printer that prints (or pauses a print) is locked: a
    print may switch to any of its slots. Listed with that printer's name, refused by
    assign_spool; a printer whose state cannot be read locks nothing."""
    with_inventory(bambuddy_api)
    idle(bambuddy_api)
    entry = await set_up(hass, X1C)
    # Spool 3 sits in the Desk (printer 99), which no entry here watches.
    bambuddy_api.statuses[99] = {"connected": True, "state": "PAUSE"}

    answer = await _act(hass, "get_spools", entity_id=_slot(hass, entry, 3))
    desk = next(item for item in answer["spools"] if item["id"] == 3)
    assert (desk["fits"], desk["printing"]) == ("printing", "Desk")

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=3)
    assert raised.value.translation_key == "spool_printing"
    assert raised.value.translation_placeholders == {"printer": "Desk"}
    bambuddy_api.assign_spool.assert_not_awaited()

    bambuddy_api.statuses[99] = {"connected": True, "state": "IDLE"}
    answer = await _act(hass, "get_spools", entity_id=_slot(hass, entry, 3))
    assert next(item for item in answer["spools"] if item["id"] == 3)["fits"] is None

    read = bambuddy_api.get_status.side_effect

    def desk_down(printer_id: int) -> Any:
        if printer_id == 99:
            raise BamBuddyConnectionError("down")
        return read(printer_id)

    bambuddy_api.get_status.side_effect = desk_down
    answer = await _act(hass, "get_spools", entity_id=_slot(hass, entry, 3))
    assert next(item for item in answer["spools"] if item["id"] == 3)["fits"] is None
    await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=3)
    bambuddy_api.assign_spool.assert_awaited()


async def test_a_spool_in_a_printing_printer_of_the_entry_is_locked(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A printer of the same entry is judged by what it last reported, without a read."""
    with_inventory(bambuddy_api)
    rows = load_fixture("inventory_assignments.json")
    for row in rows:
        if row["spool_id"] == 3:
            row.update(printer_id=H2D, printer_name="Studio")
    bambuddy_api.get_spool_assignments.return_value = rows
    idle(bambuddy_api)
    bambuddy_api.statuses[H2D].update(state="RUNNING", connected=True)
    entry = await set_up(hass, X1C, H2D)
    reads = bambuddy_api.get_status.await_count

    answer = await _act(hass, "get_spools", entity_id=_slot(hass, entry, 3))
    studio = next(item for item in answer["spools"] if item["id"] == 3)
    assert (studio["fits"], studio["printing"]) == ("printing", "Studio")
    assert bambuddy_api.get_status.await_count == reads


async def test_a_spool_in_two_slots_names_both(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """BamBuddy's own dialog can put a spool into a second slot (its "Show all spools"),
    and its chip can link it to another: the list names every place, the slot's sensor
    the other slots."""
    with_inventory(bambuddy_api)
    rows = load_fixture("inventory_assignments.json")
    spool = rows[0]["spool"]
    rows.append({**rows[0], "id": 9, "printer_id": 99, "printer_name": "Desk", "ams_id": 0, "tray_id": 1, "spool": spool})
    bambuddy_api.get_spool_assignments.return_value = rows
    entry = await set_up(hass, X1C)

    answer = await _act(hass, "get_spools", entity_id=_slot(hass, entry, 3))
    first = next(item for item in answer["spools"] if item["id"] == 1)
    assert first["place"] == {"this_slot": True}
    assert [(place["printer_name"], place["tray_id"]) for place in first["also"]] == [("Desk", 1)]

    also = state_at(hass, _slot(hass, entry, 3)).attributes["inventory_spool"]["also_assigned"]
    assert also == [{"printer_id": 99, "printer_name": "Desk", "ams_id": 0, "tray_id": 1, "ams_label": None, "same_printer": False}]


async def test_a_spool_list_while_the_printer_is_offline(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_inventory(bambuddy_api)
    bambuddy_api.statuses[X1C]["connected"] = False
    entry = await set_up(hass, X1C)

    answer = await _act(hass, "get_spools", entity_id=_slot(hass, entry, 2))

    assert answer["assigned"] is None
    assert len(answer["spools"]) == 3


@pytest.mark.parametrize(
    ("error", "key"),
    [(BamBuddyPermissionError(403, "Permission denied"), "inventory_not_shown"), (BamBuddyConnectionError("down"), "cannot_connect")],
)
async def test_a_spool_list_bambuddy_does_not_give(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, error: Exception, key: str
) -> None:
    with_inventory(bambuddy_api)
    entry = await set_up(hass, X1C)
    bambuddy_api.get_spools.side_effect = error

    with pytest.raises(HomeAssistantError) as raised:
        await _act(hass, "get_spools", entity_id=_slot(hass, entry, 3))

    assert raised.value.translation_key == key
    assert not hass.config_entries.flow.async_progress()


async def test_a_spool_list_after_spoolman_came_on(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The fresh read asks for Spoolman too: switched on since the last read, no list."""
    with_inventory(bambuddy_api)
    entry = await set_up(hass, X1C)
    bambuddy_api.get_spoolman_status.return_value = {"enabled": True, "connected": True, "url": None}

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "get_spools", entity_id=_slot(hass, entry, 3))

    assert raised.value.translation_key == "inventory_not_shown"
    assert entry.runtime_data.inventory.data.shown is False


async def test_an_assignment_without_answer_says_so(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Timed out: BamBuddy may have taken it -- no answer, not unreachable."""
    with_inventory(bambuddy_api, _extra(7))
    idle(bambuddy_api)
    entry = await set_up(hass, X1C)
    error = BamBuddyConnectionError("POST /inventory/assignments: TimeoutError")
    error.__cause__ = TimeoutError()
    bambuddy_api.assign_spool.side_effect = error

    with pytest.raises(HomeAssistantError) as raised:
        await _act(hass, "assign_spool", entity_id=_slot(hass, entry, 3), spool_id=7)

    assert raised.value.translation_key == "no_answer"


async def test_no_spool_list_with_spoolman(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_inventory(bambuddy_api)
    bambuddy_api.get_spoolman_status.return_value = {"enabled": True, "connected": True, "url": None}
    entry = await set_up(hass, X1C)

    with pytest.raises(ServiceValidationError) as raised:
        await _act(hass, "get_spools", entity_id=_slot(hass, entry, 3))

    assert raised.value.translation_key == "inventory_not_shown"
