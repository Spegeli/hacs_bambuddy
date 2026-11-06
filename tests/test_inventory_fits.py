"""Does an inventory spool fit a slot: Bambu Studio's list, and BamBuddy's
reduction of a vendor's material name where the spool names no profile."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

from custom_components.bambuddy import filaments
from custom_components.bambuddy.filament_types import printer_filament_type
from custom_components.bambuddy.inventory import Spool, spool_fit, spool_of

from tests.helpers import spool_row


X1C_AMS = filaments.Slot("X1C", "0.4", True, frozenset({0}), {0: "HS00"})
X1C_EXTERNAL = filaments.Slot("X1C", "0.4", False, frozenset({0}), {0: "HS00"})
# An H2D's right nozzle with a TPU high-flow nozzle fitted.
H2D_TPU_NOZZLE = filaments.Slot("H2D", "0.4", False, frozenset({0}), {0: "HU00"})


def _spool(**fields: Any) -> Spool:
    spool = spool_of(spool_row(**{"slicer_filament": None, **fields}))
    assert spool is not None
    return spool


@pytest.mark.parametrize(
    ("material", "reduced"),
    [
        ("PLA+", "PLA"),
        ("PLA Meta", "PLA"),
        ("Hyper PLA", "PLA"),
        ("ePLA", "PLA"),
        ("HTPLA", "PLA"),
        ("PETG-HS", "PETG"),
        ("TPU 95A", "TPU"),
        ("Easy PA", "PA"),
        ("PLA Matte", "PLA"),
        ("PLA Aero", "PLA-AERO"),
        ("Nylon", "PA"),
        ("PLASTIC", "PLASTIC"),
        ("Pastel", "Pastel"),
        ("Unobtainium", "Unobtainium"),
        ("  ", ""),
        (None, ""),
    ],
)
def test_vendor_materials_are_reduced_as_bambuddy_does(material: str | None, reduced: str) -> None:
    assert printer_filament_type(material) == reduced


def test_a_setting_id_is_read_as_its_filament() -> None:
    """BamBuddy may keep a preset's setting id: "GFSL99" is Generic PLA (GFL99)."""
    with patch.object(filaments, "refusal", wraps=filaments.refusal) as refusal:
        assert spool_fit(_spool(slicer_filament="GFSL99"), X1C_AMS) is None
    assert refusal.call_args.args[0] == "GFL99"


def test_a_versioned_setting_id_is_read_as_its_filament() -> None:
    with patch.object(filaments, "refusal", wraps=filaments.refusal) as refusal:
        spool_fit(_spool(slicer_filament="GFSA00_02"), X1C_AMS)
    assert refusal.call_args.args[0] == "GFA00"


def test_a_filament_id_is_judged_as_given() -> None:
    with patch.object(filaments, "refusal", wraps=filaments.refusal) as refusal:
        spool_fit(_spool(slicer_filament="GFA00", material="PETG"), X1C_AMS)
    assert refusal.call_args.args[0] == "GFA00"


def test_an_id_the_list_lacks_fits() -> None:
    """Only ids Bambu Studio's list knows are judged: an unknown GF id fits."""
    assert spool_fit(_spool(slicer_filament="GFZ42", material="TPU"), X1C_AMS) is None


def test_a_material_nobody_knows_fits() -> None:
    assert spool_fit(_spool(material="Unobtainium"), X1C_AMS) is None


def test_a_tpu_spool_is_not_for_the_ams() -> None:
    assert spool_fit(_spool(material="TPU 95A"), X1C_AMS) == "not_for_ams"
    assert spool_fit(_spool(material="TPU 95A"), X1C_EXTERNAL) is None


@pytest.mark.parametrize(("material", "subtype"), [("TPU-AMS", None), ("TPU", "for AMS")])
def test_a_tpu_for_the_ams_fits_the_ams(material: str, subtype: str | None) -> None:
    """Bambu's TPU for AMS (GFU98) is the one TPU the AMS takes."""
    with patch.object(filaments, "refusal", wraps=filaments.refusal) as refusal:
        assert spool_fit(_spool(material=material, subtype=subtype), X1C_AMS) is None
    assert refusal.call_args.args[0] == "GFU98"


def test_a_pla_spool_is_not_for_a_tpu_nozzle() -> None:
    """The H2D's TPU high-flow nozzle takes only Bambu Studio's TPUs."""
    assert spool_fit(_spool(material="PLA"), H2D_TPU_NOZZLE) == "not_for_nozzle"


@pytest.mark.parametrize(
    ("why", "fit"),
    [
        ("filament_not_for_ams", "not_for_ams"),
        ("filament_not_for_nozzle", "not_for_nozzle"),
        ("filament_not_left", "not_for_nozzle"),
        ("filament_not_right", "not_for_nozzle"),
        ("filament_not_offered", "not_for_printer"),
        (None, None),
    ],
)
def test_the_refusals_read_as_a_fit(why: str | None, fit: str | None) -> None:
    with patch.object(filaments, "refusal", return_value=why):
        assert spool_fit(_spool(material="PLA"), X1C_AMS) == fit
