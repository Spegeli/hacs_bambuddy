"""BamBuddy's reduction of a spool's material to the type an AMS slot
carries ("PLA+", "PLA Meta", "Hyper PLA" -> "PLA"), ported from BamBuddy's
``backend/app/utils/filament_types.py`` (``printer_filament_type`` and its
tables; maziggy/bambuddy ``main`` 943f358, 2026-10-09, issue #2902): the
integration judges an inventory spool without a slicer profile by it, as
BamBuddy writes the spool's type into the slot. Comments are BamBuddy's.
"""

from __future__ import annotations

import re

# What a Bambu printer and the slicers accept in an AMS slot's ``tray_type``.
# A filled or foamed variant is a type of its own (PLA-AERO, PLA-GF); product
# lines ("PLA Matte", "PETG HF") are not types.
_PRINTER_TYPES: tuple[str, ...] = (
    # Order within a length matters for ties: "PLA/PHA" must read as PLA.
    "PLA-AERO",
    "ASA-AERO",
    "PAHT-CF",
    "PA12-CF",
    "PETG-CF",
    "PPS-CF",
    "PPS-GF",
    "PPA-CF",
    "PPA-GF",
    "PLA-CF",
    "PLA-GF",
    "PA6-CF",
    "PA6-GF",
    "ABS-GF",
    "ASA-CF",
    "ASA-GF",
    "PET-CF",
    "PC-ABS",
    "PA-CF",
    "PC-CF",
    "PP-CF",
    "PP-GF",
    "PE-CF",
    "PCTG",
    "PETG",
    "BVOH",
    "HIPS",
    "PEEK",
    "PLA",
    "PHA",
    "ABS",
    "ASA",
    "TPU",
    "PVA",
    "PPS",
    "EVA",
    "PEI",
    "PC",
    "PA",
    "PP",
    "PE",
)

# Names that are a material by another name. ``GENERIC_FILAMENT_IDS`` already
# points NYLON and PA at the same generic id, so they are the same thing to
# everything downstream of here.
_TYPE_ALIASES: dict[str, str] = {
    "NYLON": "PA",
}

_PRINTER_TYPE_SET = frozenset(_PRINTER_TYPES)

# Longest first, so "PLA-CF" is recognised before the "PLA" inside it. Sorted
# stably, so the declaration order above still decides same-length ties.
_TYPES_LONGEST_FIRST: tuple[str, ...] = tuple(sorted((*_PRINTER_TYPES, *_TYPE_ALIASES), key=len, reverse=True))

# Splits a material name into words while keeping "-" and "+" inside them:
# "PLA-CF" is one word, "PLA/PHA" is two, and the "+" of "PLA+" stays attached
# so the prefix rule below can see a non-letter after the type.
_WORDS = re.compile(r"[^A-Z0-9+\-]+")


def _word_names_type(word: str, candidate: str) -> bool:
    """Whether one word of a material name says "this is a ``candidate``"."""
    if word == candidate:
        return True
    # Two-letter types are too short to recognise inside a longer word. "PA" is
    # nylon and "Pastel" is not, and there is no reading of the rules below that
    # separates them -- so PA, PC, PE and PP are taken only as a word of their
    # own. A spool whose material really is bare nylon still says so.
    if len(candidate) < 3:
        return False
    # A prefix counts only when a non-letter follows it -- "PLA+" and "PETG-HS"
    # are the type, "PLASTIC" is a word that merely starts like one.
    if word.startswith(candidate) and not word[len(candidate)].isalpha():
        return True
    # A suffix needs no such guard: "HTPLA" and "rPETG" are how vendors write
    # their own PLA and PETG, and nothing else ends in a material name.
    return word.endswith(candidate)


def printer_filament_type(material: str | None) -> str:
    """Reduce a spool's material to the name an AMS slot can carry.

    Bambuddy lets a spool's material be anything -- typed by hand, synced from
    Spoolman, or picked from the colour catalogue, whose material column is the
    vendor's product line ("PLA+", "HTPLA", "PolyTerra PLA"). Every assignment
    path then wrote that string into the slot's ``tray_type``, and a slot whose
    type is "PLA+" satisfies nothing that asks for PLA: not the slicer, and not
    Bambuddy's own dispatch matcher, which compares the printer's reported
    ``tray_type`` to the 3MF's declared type as plain equality (issue #2902).

    Returns the material name unchanged when it cannot be placed. That is the
    important half of the contract -- an unrecognised material is left exactly
    as it arrives rather than guessed at, so this can only ever fix a slot that
    was already wrong.
    """
    text = (material or "").strip()
    if not text:
        return ""

    upper = text.upper()
    if upper in _PRINTER_TYPE_SET:
        return upper
    if upper in _TYPE_ALIASES:
        return _TYPE_ALIASES[upper]

    words = [w for w in _WORDS.split(upper) if w]

    # A hyphenated type written with a space is still that type. The table
    # spells it "PLA-AERO" because that is how the preset dropdown and the
    # slicers spell it, while a spool says "PLA Aero" and a preset name says
    # "Bambu PLA Aero" -- and the word rules below would find only the "PLA"
    # in those and hand back a slot that lies about what is loaded.
    #
    # Adjacent words only, and only when the join is a type exactly. The prefix
    # and suffix rules are deliberately not applied across a space: "Support
    # for PLA" would otherwise start reading as a type by its tail.
    for first, second in zip(words, words[1:], strict=False):
        joined = f"{first}-{second}"
        if joined in _PRINTER_TYPE_SET:
            return joined
        if joined in _TYPE_ALIASES:
            return _TYPE_ALIASES[joined]

    for candidate in _TYPES_LONGEST_FIRST:
        if any(_word_names_type(w, candidate) for w in words):
            return _TYPE_ALIASES.get(candidate, candidate)

    return text
