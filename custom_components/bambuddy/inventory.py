"""BamBuddy's spool inventory: which of its spools sits in which slot (#21).

One coordinator per entry reads BamBuddy's spools, their slots and whether
Spoolman keeps the spools instead, once a minute and at once on BamBuddy's
live events. Every read here needs an optional permission only (Read Status
in BamBuddy, but none of the integration's required scopes): a refused read
makes the inventory "not shown" -- it never reaches the key guard, never
starts a reauth.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import logging
import re
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Literal

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.debounce import Debouncer
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from . import filaments
from .api import BamBuddyClient, BamBuddyError
from .const import DOMAIN, INVENTORY_INTERVAL, INVENTORY_PUSH_COOLDOWN
from .filament_types import printer_filament_type
from .models import EXTERNAL_AMS, INPUT_TOOLS, external_count, input_global_id, input_tool, is_int, is_number

if TYPE_CHECKING:
    from .coordinator import BamBuddyConfigEntry
    from .key import KeyCheck

_LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class Spool:
    """A spool of BamBuddy's inventory, as far as Home Assistant shows it
    (its owner's note stays out)."""

    id: int
    brand: str | None
    material: str
    subtype: str | None
    color_name: str | None
    rgba: str | None
    extra_colors: tuple[str, ...]
    label_weight: int
    weight_used: float
    storage_location: str | None
    slicer_filament: str | None
    rfid: bool
    # The slicer profile's name: BamBuddy reads a type from it too.
    slicer_filament_name: str | None = None
    # Bambu's own chip (its tray_uuid): BamBuddy links the spool wherever the AMS reads it.
    bambu_chip: bool = False

    @property
    def name(self) -> str:
        """As BamBuddy names it: brand, material, subtype ("Geeetech PLA Basic")."""
        return " ".join(part for part in (self.brand, self.material, self.subtype) if part)

    @property
    def remaining_g(self) -> int:
        return max(0, round(self.label_weight - self.weight_used))

    @property
    def remaining_pct(self) -> int | None:
        return round(self.remaining_g * 100 / self.label_weight) if self.label_weight > 0 else None

    def attributes(self) -> dict[str, Any]:
        """For a slot's sensor and the card."""
        return {
            "id": self.id,
            "name": self.name,
            "brand": self.brand,
            "material": self.material,
            "subtype": self.subtype,
            "color_name": self.color_name,
            "rgba": self.rgba,
            "extra_colors": list(self.extra_colors),
            "remaining_g": self.remaining_g,
            "remaining_pct": self.remaining_pct,
            "label_weight": self.label_weight,
            "storage_location": self.storage_location,
            "rfid": self.rfid,
        }


@dataclass(frozen=True)
class Placed:
    """A spool in a slot: on any printer of the BamBuddy, this entry's or not."""

    printer_id: int
    printer_name: str | None
    ams_id: int
    tray_id: int
    ams_label: str | None
    spool_id: int
    # What the slot reported when BamBuddy last matched it to the spool (its fingerprint).
    color: str = ""
    type: str = ""
    # The printer's model, as BamBuddy 1.3.1 names it in the row (1.2.5.7: none).
    printer_model: str | None = None

    @property
    def slot(self) -> tuple[int, int, int]:
        """The slot: printer, AMS and tray as BamBuddy numbers them."""
        return self.printer_id, self.ams_id, self.tray_id


@dataclass(frozen=True)
class InventoryData:
    """What the last good read found. `shown`: Spoolman off and the slots readable."""

    shown: bool
    spools: dict[int, Spool] = field(default_factory=dict)
    placed: list[Placed] = field(default_factory=list)

    def row_at(self, slot: tuple[int, int, int]) -> Placed | None:
        """The assignment of a slot (printer, AMS, tray), if any."""
        return next((row for row in self.placed if row.slot == slot), None)

    def at(self, printer_id: int, ams_id: int, tray_id: int) -> Spool | None:
        row = self.row_at((printer_id, ams_id, tray_id))
        return None if row is None else self.spools.get(row.spool_id)

    def places_of(self, spool_id: int, besides: tuple[int, int, int] | None = None) -> list[Placed]:
        """Where a spool sits -- BamBuddy 1.2.5.7 may hold one in two slots --,
        but in the slot `besides`."""
        return [row for row in self.placed if row.spool_id == spool_id and row.slot != besides]


NOT_SHOWN = InventoryData(shown=False)


def _text(value: Any) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def spool_of(row: Any) -> Spool | None:
    """A SpoolResponse, or None for anything that is not a live spool (an
    archived one: BamBuddy 1.2.5.7 keeps those in their slots)."""
    if not isinstance(row, dict) or not is_int(row.get("id")):
        return None
    if row.get("archived_at"):
        return None
    extra = row.get("extra_colors")
    colors = tuple(part.strip() for part in extra.split(",") if part.strip()) if isinstance(extra, str) else ()
    label = row.get("label_weight")
    used = row.get("weight_used")
    return Spool(
        id=row["id"],
        brand=_text(row.get("brand")),
        material=_text(row.get("material")) or "",
        subtype=_text(row.get("subtype")),
        color_name=_text(row.get("color_name")),
        rgba=_text(row.get("rgba")),
        extra_colors=colors,
        label_weight=label if is_int(label) else 0,
        weight_used=float(used) if is_number(used) else 0.0,
        storage_location=_text(row.get("storage_location")),
        slicer_filament=_text(row.get("slicer_filament")),
        rfid=bool(row.get("tag_uid") or row.get("tray_uuid")),
        slicer_filament_name=_text(row.get("slicer_filament_name")),
        bambu_chip=bool(_text(row.get("tray_uuid"))) and str(row.get("tray_uuid")).strip("0") != "",
    )


def _int(value: Any) -> int | None:
    return value if is_int(value) else None


def inventory_of(spools: list[Any], assignments: list[Any]) -> InventoryData:
    """The spools by id and every slot that holds one -- rows of a deleted
    spool (BamBuddy 1.2.5.7 keeps them: "spool": null) or an archived one left
    out; rows of every printer kept (a spool's place, and what a move takes)."""
    found = {spool.id: spool for spool in map(spool_of, spools) if spool is not None}
    placed: list[Placed] = []
    for row in assignments:
        if not isinstance(row, dict):
            continue
        spool = spool_of(row.get("spool"))
        numbers = [_int(row.get(key)) for key in ("printer_id", "ams_id", "tray_id")]
        if spool is None or any(number is None for number in numbers):
            continue
        found.setdefault(spool.id, spool)
        printer_id, ams_id, tray_id = (number for number in numbers if number is not None)
        placed.append(
            Placed(
                printer_id,
                _text(row.get("printer_name")),
                ams_id,
                tray_id,
                _text(row.get("ams_label")),
                spool.id,
                _text(row.get("fingerprint_color")) or "",
                _text(row.get("fingerprint_type")) or "",
                _text(row.get("printer_model")),
            )
        )
    return InventoryData(shown=True, spools=found, placed=placed)


class BamBuddyInventoryCoordinator(DataUpdateCoordinator[InventoryData]):
    """The entry's view of BamBuddy's spool inventory."""

    config_entry: BamBuddyConfigEntry

    def __init__(self, hass: HomeAssistant, entry: BamBuddyConfigEntry, client: BamBuddyClient, first: KeyCheck) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=f"{DOMAIN} inventory",
            update_interval=INVENTORY_INTERVAL,
            request_refresh_debouncer=Debouncer(hass, _LOGGER, cooldown=INVENTORY_PUSH_COOLDOWN, immediate=True),
            always_update=False,
        )
        self.client = client
        # Until the entry runs, the setup's check says what the key may.
        self._first_can_assign = first.scopes.can_assign_spools if first.scopes is not None else False
        # Reads that failed in a row: the first keeps the last data.
        self._failures = 0
        self._shut_down = False

    @property
    def can_assign(self) -> bool:
        """The key has Manage Inventory (the last answered check)."""
        runtime = getattr(self.config_entry, "runtime_data", None)
        return runtime.key.can_assign_spools if runtime is not None else self._first_can_assign

    @property
    def assignable(self) -> bool:
        """Spools may be assigned from Home Assistant: shown, the key may, and a spool to give."""
        data = self.data
        return data is not None and data.shown and bool(data.spools) and self.can_assign

    async def _read(self) -> InventoryData:
        """BamBuddy's inventory now; BamBuddy's errors as they come."""
        spoolman = await self.client.get_spoolman_status()
        if isinstance(spoolman, dict) and spoolman.get("enabled") is True:
            # Spoolman keeps the spools: BamBuddy no longer keeps its own slots up.
            return NOT_SHOWN
        assignments, spools = await asyncio.gather(self.client.get_spool_assignments(), self.client.get_spools())
        return inventory_of(spools, assignments)

    async def async_read_fresh(self) -> InventoryData:
        """A read for an action, outside the minute's: the entry's view takes
        it at once; BamBuddy's errors go to the caller."""
        fresh = await self._read()
        self._failures = 0
        self.async_set_updated_data(fresh)
        return fresh

    async def _async_update_data(self) -> InventoryData:
        try:
            fresh = await self._read()
        except BamBuddyError as err:
            # A refused read too (a key whose owner may not read the inventory):
            # the inventory is not shown, nothing more.
            self._failures += 1
            _LOGGER.debug("The spool inventory could not be read: %s", err)
            if self._failures == 1 and self.data is not None:
                return self.data
            return NOT_SHOWN
        self._failures = 0
        return fresh

    @callback
    def async_pushed(self) -> None:
        """BamBuddy told of a spool or a slot's spool: read soon (debounced)."""
        runtime = getattr(self.config_entry, "runtime_data", None)
        if self._shut_down or self.hass.is_stopping or (runtime is not None and runtime.reloading):
            return
        self.config_entry.async_create_background_task(self.hass, self.async_request_refresh(), f"{self.name} push read")

    async def async_shutdown(self) -> None:
        self._shut_down = True
        await super().async_shutdown()


type Fit = Literal["not_for_ams", "not_for_nozzle", "not_for_printer"]

_FITS: dict[str, Fit] = {
    "filament_not_for_ams": "not_for_ams",
    "filament_not_for_nozzle": "not_for_nozzle",
    "filament_not_left": "not_for_nozzle",
    "filament_not_right": "not_for_nozzle",
    "filament_not_offered": "not_for_printer",
}
# A setting id's version ("GFSA00_04"), and a Bambu Studio id ("GFA00", "GFSL99").
_VERSION = re.compile(r"_\d+$")
_STUDIO_ID = re.compile(r"^GF[A-Z0-9]+(?:_\d+)?$")


def _by_setting_id(setting_id: str) -> str | None:
    """The filament a setting id names: exactly, else by the id without its
    version -- where two share it, the one whose own id has none."""
    found = [item for item in filaments.FILAMENTS.values() if item.setting_id == setting_id]
    if not found:
        bare = _VERSION.sub("", setting_id)
        found = [item for item in filaments.FILAMENTS.values() if _VERSION.sub("", item.setting_id) == bare]
        found.sort(key=lambda item: item.setting_id != bare)
    return found[0].id if found else None


def _filament_of(spool: Spool) -> str | None:
    """The Bambu Studio filament a spool stands for: its slicer profile where
    the list knows it, else its material as BamBuddy writes it into a slot;
    None where nothing says (it then fits)."""
    given = spool.slicer_filament
    if given and _STUDIO_ID.match(given):
        if filaments.get(given) is not None:
            return given
        # A setting id (GFS…), or an id the list lacks: judged only if known.
        return _by_setting_id(given)
    words = f"{spool.material} {spool.subtype or ''}".upper()
    if spool.material.upper() == "TPU-AMS" or "FOR AMS" in words:
        kind = "TPU-AMS"
    else:
        kind = printer_filament_type(spool.material)
    item = filaments.of_type(kind) if kind else None
    return item.id if item is not None else None


def spool_fit(spool: Spool, slot: filaments.Slot) -> Fit | None:
    """Why Bambu Studio would not let the slot take the spool (None: it would)."""
    filament_id = _filament_of(spool)
    if filament_id is None:
        return None
    why = filaments.refusal(filament_id, slot)
    return _FITS.get(why) if why is not None else None


# The slot attributes from BamBuddy's inventory: kept out of the recorder.
_ASSIGNABLE = "inventory_assignable"
_SPOOL = "inventory_spool"
INVENTORY_ATTRIBUTES = (_SPOOL, _ASSIGNABLE)


def inventory_attributes(coordinator: BamBuddyInventoryCoordinator, printer_id: int, ams_id: int, tray_id: int) -> dict[str, Any]:
    """A slot's sensor attributes: nothing while the inventory is not shown;
    else whether spools may be assigned, and the slot's spool if it has one."""
    data = coordinator.data
    if data is None or not data.shown:
        return {}
    attributes: dict[str, Any] = {_ASSIGNABLE: coordinator.assignable}
    row = data.row_at((printer_id, ams_id, tray_id))
    if row is not None and (spool := data.spools.get(row.spool_id)) is not None:
        # The spool's other slots: BamBuddy can hold one in two (its "Show all spools",
        # a chip read in another printer).
        also = [place_json(other, printer_id, external_counts(coordinator)) for other in data.places_of(spool.id, besides=row.slot)]
        attributes[_SPOOL] = {
            **spool.attributes(),
            "also_assigned": also,
            # What keeps the assignment when the slot is set anew: the colour and type BamBuddy
            # matched it with, or the spool's colour with a type of the spool.
            "assigned_color": row.color,
            "assigned_type": row.type,
            "spool_types": spool_types(spool),
        }
    return attributes


def spool_types(spool: Spool) -> list[str]:
    """The slot types that match the spool for BamBuddy: its material's, its slicer profile name's."""
    names = (spool.material, spool.slicer_filament_name)
    return sorted({printer_filament_type(name).upper() for name in names if name} - {""})


def place_json(row: Placed, here: int, known: Mapping[int, int] | None = None) -> dict[str, Any]:
    """A slot a spool is assigned to, as the attributes and the actions name
    it; `here`, the printer asking: whether it is that printer's. An external
    place names an H3C's input by its tool (`input`) or a two-nozzle printer's
    spool by its side (`side`): by the count of external places of this
    entry's printer (`known`), else of the model BamBuddy names, else by the
    tray -- an input from tray 2 on, the right spool at tray 1."""
    place: dict[str, Any] = {
        "printer_id": row.printer_id,
        "printer_name": row.printer_name,
        "ams_id": row.ams_id,
        "tray_id": row.tray_id,
        "ams_label": row.ams_label,
        "same_printer": row.printer_id == here,
    }
    if row.ams_id != EXTERNAL_AMS:
        return place
    count = (known or {}).get(row.printer_id) or external_count(row.printer_model)
    if count is None:
        count = len(INPUT_TOOLS) if row.tray_id >= 2 else 2 if row.tray_id == 1 else 1
    if count > 2:
        place["input"] = input_tool(input_global_id(row.tray_id))
    elif count == 2:
        place["side"] = "right" if row.tray_id == 1 else "left"
    return place


def external_counts(coordinator: BamBuddyInventoryCoordinator) -> dict[int, int]:
    """How many external places each printer of the entry has: by its model
    (an H3C reporting fewer inputs at its start still has nine), else as it
    reports them -- nine inputs, two spools or one."""
    counts: dict[int, int] = {}
    for printer in coordinator.config_entry.runtime_data.printers.values():
        data = printer.data
        if data is not None:
            reported = len(INPUT_TOOLS) if data.has_inputs else 2 if data.is_dual_nozzle else 1
            counts[printer.printer_id] = external_count(data.model) or reported
    return counts


def diagnostics(coordinator: BamBuddyInventoryCoordinator) -> dict[str, Any]:
    """Counts and numbers only: a spool's names and its owner's note stay out."""
    data = coordinator.data or NOT_SHOWN
    return {
        "shown": data.shown,
        "assignable": coordinator.assignable,
        "spools": len(data.spools),
        "assignments": [
            {"printer": row.printer_id, "ams_id": row.ams_id, "tray_id": row.tray_id, "spool_id": row.spool_id}
            for row in data.placed
        ],
    }
