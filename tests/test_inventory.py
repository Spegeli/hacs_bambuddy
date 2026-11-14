"""BamBuddy's spool inventory (#21): which spool sits in which slot, shown
with Read Status and assigned with Manage Inventory."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
import pytest
from homeassistant.core import HomeAssistant

from custom_components.bambuddy.api import BamBuddyConnectionError, BamBuddyPermissionError
from custom_components.bambuddy.inventory import BamBuddyInventoryCoordinator, Placed, Spool, external_counts, inventory_of, place_json, spool_of, spool_types
from custom_components.bambuddy.models import PrinterData
from custom_components.bambuddy.key import KeyGuard
from custom_components.bambuddy.inventory import INVENTORY_ATTRIBUTES
from custom_components.bambuddy.sensor import BamBuddyAmsSlotSensor, BamBuddyPrinterSensor

from tests.conftest import H2D, X1C, ams_uid, load_fixture, next_refresh, printer_uid, set_up, state_of
from tests.helpers import spool_row, with_inventory


async def _refresh(hass: HomeAssistant, inventory: BamBuddyInventoryCoordinator) -> None:
    await inventory.async_refresh()
    await hass.async_block_till_done()


async def test_rows_of_deleted_or_archived_spools_are_no_assignment(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """BamBuddy 1.2.5.7 keeps a deleted spool's row ("spool": null) and an
    archived spool in its slot: neither is a spool in the slot."""
    with_inventory(bambuddy_api)
    entry = await set_up(hass, X1C)
    data = entry.runtime_data.inventory.data

    assert data.shown
    assert data.at(X1C, 0, 1) is None
    assert data.at(X1C, 0, 0) is None
    assert 4 not in data.spools
    assert data.at(X1C, 0, 2) == data.spools[1]


async def test_rows_of_other_printers_are_kept_for_their_place(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A spool in a printer this entry does not hold still has its place (a move takes it from there)."""
    with_inventory(bambuddy_api)
    entry = await set_up(hass, X1C)

    [place] = entry.runtime_data.inventory.data.places_of(3)
    assert (place.printer_id, place.printer_name, place.ams_id, place.tray_id) == (99, "Desk", 0, 0)


async def test_spoolman_on_shows_nothing(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """With Spoolman BamBuddy keeps no slots of its own: the inventory is not shown, nothing more is read."""
    with_inventory(bambuddy_api)
    bambuddy_api.get_spoolman_status.return_value = {"enabled": True, "connected": True, "url": "http://spoolman:7912"}
    entry = await set_up(hass, X1C)

    assert entry.runtime_data.inventory.data.shown is False
    bambuddy_api.get_spool_assignments.assert_not_awaited()


async def test_a_refused_inventory_read_is_not_shown_and_starts_no_reauth(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace
) -> None:
    """The inventory needs only optional permissions: a refusal (an owner
    without inventory:read) never reaches the key guard."""
    bambuddy_api.get_spool_assignments.side_effect = BamBuddyPermissionError(
        403, "Permission denied", path="/api/v1/inventory/assignments"
    )
    with patch.object(KeyGuard, "async_read_refused") as refused:
        entry = await set_up(hass, X1C)

    assert entry.runtime_data.inventory.data.shown is False
    refused.assert_not_called()
    assert not hass.config_entries.flow.async_progress()


async def test_one_failed_read_keeps_the_last_data(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A read BamBuddy did not answer once keeps what was shown; a second in a row does not."""
    with_inventory(bambuddy_api)
    entry = await set_up(hass, X1C)
    inventory = entry.runtime_data.inventory

    bambuddy_api.get_spoolman_status.side_effect = BamBuddyConnectionError("down")
    await _refresh(hass, inventory)
    assert inventory.data.shown
    assert inventory.data.at(X1C, 0, 2) is not None

    await _refresh(hass, inventory)
    assert inventory.data.shown is False

    bambuddy_api.get_spoolman_status.side_effect = None
    await _refresh(hass, inventory)
    assert inventory.data.shown


@pytest.mark.parametrize(
    ("me", "spools", "assignable"),
    [
        ("auth_me_control.json", True, True),
        ("auth_me_control_no_inventory.json", True, False),
        ("auth_me_control.json", False, False),
    ],
)
async def test_assignable_needs_inventory_update_and_a_spool(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, me: str, spools: bool, assignable: bool
) -> None:
    bambuddy_api.get_auth_me.return_value = load_fixture(me)
    if spools:
        with_inventory(bambuddy_api)
    entry = await set_up(hass, X1C)

    assert entry.runtime_data.inventory.assignable is assignable


def _spool(**fields: Any) -> Spool:
    spool = spool_of(spool_row(**fields))
    assert spool is not None
    return spool


def test_the_spool_names_and_what_is_left() -> None:
    """As BamBuddy names a spool; what is left in whole grams and percent of the label weight."""
    spool = _spool()
    assert (spool.name, spool.remaining_g, spool.remaining_pct) == ("Geeetech PLA Basic", 886, 89)
    assert _spool(weight_used=1200).remaining_g == 0
    assert _spool(label_weight=0).remaining_pct is None
    assert _spool(brand=None, subtype="").name == "PLA"
    assert _spool(extra_colors="d4af37, b87333,").extra_colors == ("d4af37", "b87333")
    assert _spool().rfid is False
    assert _spool(tag_uid="A1B2").rfid is True


def test_the_types_a_slot_may_report_and_keep_the_spool() -> None:
    """BamBuddy keeps an assignment whose slot reports the spool's colour and a type its
    material or its slicer profile's name reduces to (_unlink_stale_assignments)."""
    assert spool_types(_spool()) == ["PLA"]
    assert spool_types(_spool(material="PETG", slicer_filament_name="Bambu PETG HF @BBL X1C")) == ["PETG"]
    assert spool_types(_spool(material="PLA", slicer_filament_name="Generic PETG")) == ["PETG", "PLA"]
    assert spool_types(_spool(material="")) == []


def test_the_spool_keeps_no_note() -> None:
    """The owner's note never leaves the coordinator."""
    assert "note" not in _spool().attributes()
    assert "opened in May" not in repr(_spool())


def _slot(hass: HomeAssistant, entry: Any, slot: int, printer_id: int = X1C) -> Any:
    return state_of(hass, "sensor", ams_uid(entry, 0, f"slot_{slot}", printer_id))


async def test_a_slot_names_its_inventory_spool(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """AMS A slot 3 (BamBuddy's tray 2) holds the Geeetech spool; a slot without one says only
    whether spools may be assigned."""
    with_inventory(bambuddy_api)
    entry = await set_up(hass, X1C)

    attributes = _slot(hass, entry, 3).attributes
    assert attributes["inventory_spool"] == {
        "id": 1,
        "name": "Geeetech PLA Basic",
        "brand": "Geeetech",
        "material": "PLA",
        "subtype": "Basic",
        "color_name": "Apple Green",
        "rgba": "B6D648FF",
        "extra_colors": [],
        "remaining_g": 886,
        "remaining_pct": 89,
        "label_weight": 1000,
        "storage_location": "Shelf 2",
        "rfid": False,
        "filament_diameter": 1.75,
        "also_assigned": [],
        "assigned_color": "B6D648FF",
        "assigned_type": "PLA",
        "spool_types": ["PLA"],
    }
    assert attributes["inventory_assignable"] is True
    assert "inventory_spool" not in _slot(hass, entry, 2).attributes
    assert _slot(hass, entry, 2).attributes["inventory_assignable"] is True


async def test_the_external_spool_names_its_inventory_spool(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """A two-nozzle printer's right external spool is BamBuddy's AMS 255, tray 1."""
    spools = load_fixture("inventory_spools.json")
    bambuddy_api.get_spools.return_value = spools
    bambuddy_api.get_spool_assignments.return_value = [
        {"id": 1, "spool_id": 3, "printer_id": H2D, "printer_name": "Studio", "ams_id": 255, "tray_id": 1, "spool": spools[2], "ams_label": None}
    ]
    entry = await set_up(hass, H2D)

    right = state_of(hass, "sensor", printer_uid(entry, "external_spool_2", H2D)).attributes
    left = state_of(hass, "sensor", printer_uid(entry, "external_spool", H2D)).attributes
    assert right["inventory_spool"]["name"] == "eSUN PLA Silk"
    assert right["inventory_spool"]["extra_colors"] == ["d4af37", "b87333"]
    assert "inventory_spool" not in left
    assert left["inventory_assignable"] is True


async def test_an_assignment_change_shows_without_a_printer_read(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """The inventory's own read is enough: no printer status needed."""
    entry = await set_up(hass, X1C)
    assert "inventory_spool" not in _slot(hass, entry, 3).attributes
    reads = bambuddy_api.get_status.await_count

    with_inventory(bambuddy_api)
    await _refresh(hass, entry.runtime_data.inventory)

    assert _slot(hass, entry, 3).attributes["inventory_spool"]["id"] == 1
    assert bambuddy_api.get_status.await_count == reads


async def test_the_inventory_is_read_once_a_minute(
    hass: HomeAssistant, bambuddy_api: SimpleNamespace, freezer: FrozenDateTimeFactory
) -> None:
    await set_up(hass, X1C)
    assert bambuddy_api.get_spool_assignments.await_count == 1

    await next_refresh(hass, freezer, 61)

    assert bambuddy_api.get_spool_assignments.await_count == 2


def test_inventory_attributes_are_not_recorded() -> None:
    """The spool changes with each print: kept out of the recorder."""
    names = set(INVENTORY_ATTRIBUTES)
    assert names == {"inventory_spool", "inventory_assignable"}
    assert names <= BamBuddyAmsSlotSensor._unrecorded_attributes
    assert names <= BamBuddyPrinterSensor._unrecorded_attributes


async def test_no_inventory_no_attributes(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    with_inventory(bambuddy_api)
    bambuddy_api.get_spoolman_status.return_value = {"enabled": True, "connected": True, "url": None}
    entry = await set_up(hass, X1C)

    attributes = _slot(hass, entry, 3).attributes
    assert "inventory_spool" not in attributes
    assert "inventory_assignable" not in attributes


def _placed(ams_id: int, tray_id: int, printer_model: str | None = None) -> Placed:
    return Placed(99, "Desk", ams_id, tray_id, None, 1, printer_model=printer_model)


@pytest.mark.parametrize(
    ("ams_id", "tray_id", "known", "model", "extra"),
    [
        # An H3C of this entry: each input by its tool (254 tool 2, 255 tool 1, 250 tool 6).
        (255, 0, {99: 9}, None, {"input": 2}),
        (255, 1, {99: 9}, None, {"input": 1}),
        (255, 5, {99: 9}, None, {"input": 6}),
        # Another BamBuddy printer: by the model BamBuddy 1.3.1 names.
        (255, 1, {}, "H3C", {"input": 1}),
        (255, 0, {}, "H2D", {"side": "left"}),
        (255, 0, {}, "P1S", {}),
        # No model: an input from tray 2 on, the right spool at tray 1, tray 0 untold.
        (255, 5, {}, None, {"input": 6}),
        (255, 1, {}, None, {"side": "right"}),
        (255, 0, {}, None, {}),
        # Two spools or one, as this entry's printer reports them.
        (255, 0, {99: 2}, None, {"side": "left"}),
        (255, 1, {99: 2}, None, {"side": "right"}),
        (255, 0, {99: 1}, "H2D", {}),
        # An AMS slot is named by its unit and slot alone.
        (0, 1, {99: 9}, "H3C", {}),
    ],
)
def test_a_place_names_an_input_or_a_side(
    ams_id: int, tray_id: int, known: dict[int, int], model: str | None, extra: dict[str, Any]
) -> None:
    """Another printer's external places: an H3C's input by its tool, a
    two-nozzle printer's spool by its side -- the card cannot tell them apart."""
    assert place_json(_placed(ams_id, tray_id, model), X1C, known) == {
        "printer_id": 99,
        "printer_name": "Desk",
        "ams_id": ams_id,
        "tray_id": tray_id,
        "ams_label": None,
        "same_printer": False,
        **extra,
    }


def test_an_assignment_row_keeps_bambuddys_printer_model() -> None:
    """BamBuddy 1.3.1 names the printer's model in an assignment row; 1.2.5.7 does not."""
    rows = load_fixture("inventory_assignments.json")
    with_model = inventory_of([], [{**rows[0], "printer_model": "H3C"}])
    without = inventory_of([], [rows[0]])
    assert with_model.placed[0].printer_model == "H3C"
    assert without.placed[0].printer_model is None


def _printer(printer_id: int, model: str | None, external_spools: int, dual: bool = False) -> SimpleNamespace:
    status: dict[str, Any] = {"vt_tray": [{"id": 254 + index} for index in range(external_spools)]}
    if dual:
        status["temperatures"] = {"nozzle": 20, "nozzle_2": 20}
    return SimpleNamespace(printer_id=printer_id, data=PrinterData({"model": model}, status))


def test_the_entrys_printers_count_their_external_places_by_model_first() -> None:
    """An H3C reporting fewer inputs for a moment (at its start) is still one
    with nine; a two-nozzle printer two; a printer without data none."""
    printers = {
        1: _printer(1, "H3C", 1),
        2: _printer(2, "H2D", 2, dual=True),
        3: _printer(3, "P1S", 1),
        4: SimpleNamespace(printer_id=4, data=None),
        5: _printer(5, None, 2, dual=True),
    }
    coordinator = SimpleNamespace(config_entry=SimpleNamespace(runtime_data=SimpleNamespace(printers=printers)))
    assert external_counts(coordinator) == {1: 9, 2: 2, 3: 1, 5: 2}  # type: ignore[arg-type]
