"""Bambu Studio's filament profiles: what a slot is offered, and its names.

`filaments.json` holds Bambu Studio's system profiles (made by
.github/scripts/bambu_filaments.py): each filament's vendor, name, type,
setting id and nozzle range, and what Bambu Studio offers each printer per
nozzle diameter and nozzle. A slot without a chip is offered those for its
printer's model, the diameter of the nozzle that feeds it, and its kind
(an AMS slot or an external spool), less what Bambu Studio prohibits there.

Read once when the integration is imported (an executor job); nothing here
imports Home Assistant or the rest of the integration.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from functools import cache
import json
from pathlib import Path
import re
from typing import Any, Final

_DATA: Final[dict[str, Any]] = json.loads((Path(__file__).parent / "filaments.json").read_text(encoding="utf-8"))


@dataclass(frozen=True)
class Filament:
    """A Bambu Studio profile, as its slot dialog sends it."""

    id: str
    vendor: str
    name: str
    type: str
    setting_id: str
    temp_min: int
    temp_max: int


@dataclass(frozen=True)
class Slot:
    """What decides a slot's offer: the printer's model key (as
    `models.model_key` gives it), the nozzle diameter (`diameter`), an AMS
    slot or an external spool, the nozzles it feeds (0 the right or only
    one, 1 the left; both on the filament track switch) and their BamBuddy
    nozzle codes ("HS01")."""

    model: str | None
    diameter: str
    ams: bool
    extruders: frozenset[int]
    nozzle_types: Mapping[int, str]


FILAMENTS: Final[dict[str, Filament]] = {fid: Filament(id=fid, **entry) for fid, entry in _DATA["filaments"].items()}
VENDORS: Final[tuple[str, ...]] = tuple(_DATA["vendors"])
_PRINTERS: Final[dict[str, dict[str, dict[str, Any]]]] = _DATA["printers"]

# Bambu Studio's order within a vendor: these types first, then the others; ties by name.
_TYPE_ORDER = ("PLA", "PETG", "ABS", "TPU")


def _rank(item: Filament) -> tuple[int, int, bytes]:
    vendor = VENDORS.index(item.vendor) if item.vendor in VENDORS else len(VENDORS)
    kind = _TYPE_ORDER.index(item.type) if item.type in _TYPE_ORDER else len(_TYPE_ORDER)
    return vendor, kind, item.name.encode("utf-8")


# Bambu Studio's prohibitions the integration checks (its filament blacklist;
# the generator stops when they read otherwise there).
_TPU_HIGH_FLOW_TPUS = frozenset({"GFU04", "GFU03", "GFU01", "GFU00", "GFU99"})
_H2D = frozenset({"H2D", "H2D PRO"})
# A BamBuddy nozzle code ("HS01"): its second letter the flow, as Bambu Studio reads it.
_NOZZLE_CODE = re.compile(r"^[A-Z]([A-Z])\d{2}$")
_FLOW = {"S": "standard", "A": "standard", "X": "standard", "H": "high", "E": "high", "B": "e3d", "U": "tpu"}


def get(filament_id: str | None) -> Filament | None:
    """The profile with this id, None for one Bambu Studio does not have
    (a user's own, or BamBuddy's misreading of one)."""
    return FILAMENTS.get(filament_id) if filament_id else None


def label(filament_id: str | None) -> str | None:
    """A slot's name by its profile: Bambu Lab's without "Bambu", as a chip
    names the spool ("PLA Basic"), every other vendor's in full ("Generic
    PLA", "SUNLU PLA+")."""
    item = get(filament_id)
    if item is None:
        return None
    return item.name.removeprefix("Bambu ") if item.vendor == "Bambu Lab" else item.name


def field_name(item: Filament) -> str:
    """The name under its vendor: without the vendor's first word where it
    starts with it ("PLA Basic", "PLA", "PLA+"); Polymaker's lines keep
    theirs ("PolyTerra PLA")."""
    first = item.vendor.split(" ")[0] + " "
    return item.name.removeprefix(first)


def diameter(model: str | None, reported: str | None) -> str:
    """The nozzle diameter Bambu Studio offers a slot by: BamBuddy's, read as
    a number ("0.40" is "0.4"); 0.4 where there is none, and on the H2C, which
    changes nozzles from its rack."""
    if model == "H2C":
        return "0.4"
    try:
        value = float(str(reported))
    except ValueError:
        return "0.4"
    return f"{value:g}" if value > 0 else "0.4"


@cache
def _every_model(diameter: str) -> tuple[str, ...]:
    """Every model's filaments for a nozzle diameter, in Bambu Studio's
    order: what a printer of no known model is offered. Made once."""
    every = {fid for model in _PRINTERS.values() for fid in model.get(diameter, {}).get("ids", [])}
    return tuple(sorted(every, key=lambda fid: _rank(FILAMENTS[fid])))


def _offered_ids(slot: Slot) -> Sequence[str]:
    printer = _PRINTERS.get(slot.model) if slot.model else None
    if printer is not None:
        return tuple(printer.get(slot.diameter, {}).get("ids", []))
    return _every_model(slot.diameter)


def _not_on(slot: Slot) -> dict[str, list[str]]:
    printer = _PRINTERS.get(slot.model) if slot.model else None
    return dict(printer.get(slot.diameter, {}).get("not_on", {})) if printer else {}


def _flow(code: str | None) -> str | None:
    match = _NOZZLE_CODE.match(code or "")
    return _FLOW.get(match.group(1)) if match else None


def _nozzle_refuses(item: Filament, slot: Slot, extruder: int) -> bool:
    if slot.model not in _H2D:
        return False
    flow = _flow(slot.nozzle_types.get(extruder))
    if flow == "tpu" and item.id not in _TPU_HIGH_FLOW_TPUS:
        return True
    return item.name == "Bambu TPU 85A" and slot.diameter == "0.4" and flow in ("standard", "high")


def refusal(filament_id: str, slot: Slot) -> str | None:
    """Why Bambu Studio would not let a slot take a filament, as the key of
    the integration's refusal; None where it would."""
    item = get(filament_id)
    if item is None or filament_id not in _offered_ids(slot):
        return "filament_not_offered"
    if slot.ams and (item.type == "TPU" or (item.vendor == "Bambu Lab" and item.type == "PET-CF")):
        return "filament_not_for_ams"
    not_on = _not_on(slot)
    extruders = slot.extruders or frozenset({0})
    blocked = {
        extruder: "nozzle" if _nozzle_refuses(item, slot, extruder) else "side" if filament_id in not_on.get(str(extruder), []) else None
        for extruder in extruders
    }
    if not all(blocked.values()):
        return None
    if len(blocked) > 1:
        return "filament_not_for_nozzle"
    extruder, why = next(iter(blocked.items()))
    if why == "nozzle":
        return "filament_not_for_nozzle"
    return "filament_not_left" if extruder == 1 else "filament_not_right"


def of_type(tray_type: str) -> Filament | None:
    """The profile a slot's type stands for where its own is unknown: its
    first Generic in Bambu Studio's order ("Generic PLA" before "Generic PLA
    High Speed", "Generic TPU for AMS"), else the type's first; None for a
    type the list lacks."""
    kind = tray_type.upper()
    same = [item for item in FILAMENTS.values() if item.type.upper() == kind]
    if not same:
        return None
    return min(same, key=lambda item: (item.vendor != "Generic", _rank(item)))


def offer(slot: Slot) -> list[tuple[str, list[Filament]]]:
    """The slot's filaments by vendor, in Bambu Studio's order; a vendor with
    none left out."""
    by_vendor: dict[str, list[Filament]] = {}
    for fid in _offered_ids(slot):
        if refusal(fid, slot) is None:
            item = FILAMENTS[fid]
            by_vendor.setdefault(item.vendor, []).append(item)
    return [(vendor, by_vendor[vendor]) for vendor in VENDORS if vendor in by_vendor]
