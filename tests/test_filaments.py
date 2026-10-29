"""What Bambu Studio offers a slot, and why it refuses a filament there."""
from __future__ import annotations

from dataclasses import replace

from custom_components.bambuddy import filaments
from custom_components.bambuddy.filaments import Slot, diameter, field_name, get, label, of_type, offer, refusal

A1 = Slot("A1", "0.4", ams=True, extruders=frozenset({0}), nozzle_types={0: "hardened_steel"})
H2D_RIGHT = Slot("H2D", "0.4", ams=False, extruders=frozenset({0}), nozzle_types={0: "HS01"})
H2D_LEFT = Slot("H2D", "0.4", ams=False, extruders=frozenset({1}), nozzle_types={1: "HS01"})


def _ids(slot: Slot) -> set[str]:
    return {item.id for _, items in offer(slot) for item in items}


def test_the_names() -> None:
    """Bambu Lab's without "Bambu", as a chip names a spool; every other vendor's in full."""
    assert (label("GFA00"), label("GFL99"), label("GFSNL03"), label("GFL01"), label("P4d64437"), label(None)) == (
        "PLA Basic", "Generic PLA", "SUNLU PLA+", "PolyTerra PLA", None, None)  # fmt: skip


def test_the_field_names_drop_the_vendor() -> None:
    names = [field_name(item) for item in (get("GFA00"), get("GFL99"), get("GFSNL03"), get("GFL01")) if item]
    assert names == ["PLA Basic", "PLA", "PLA+", "PolyTerra PLA"]


def test_the_a1_offers_six_vendors() -> None:
    assert [vendor for vendor, _ in offer(A1)] == ["Bambu Lab", "Generic", "Polymaker", "Overture", "SUNLU", "eSUN"]


def test_the_offer_keeps_bambu_studios_order() -> None:
    generic = dict(offer(A1))["Generic"]
    assert [item.name for item in generic[:3]] == ["Generic PLA", "Generic PLA High Speed", "Generic PLA Silk"]


def test_tpu_is_not_offered_for_an_ams_slot_but_for_the_spool() -> None:
    assert "GFU99" not in _ids(A1) and "GFU98" in _ids(A1)
    assert "GFU99" in _ids(replace(A1, ams=False))
    assert refusal("GFU99", A1) == "filament_not_for_ams"
    assert refusal("GFU98", A1) is None


def test_bambu_pet_cf_is_not_for_the_ams() -> None:
    h2d_ams = replace(H2D_LEFT, ams=True)
    assert refusal("GFT01", h2d_ams) == "filament_not_for_ams"
    assert refusal("GFT01", H2D_LEFT) is None


def test_the_a1_mini_has_no_generic_abs() -> None:
    assert refusal("GFB99", replace(A1, model="A1 MINI")) == "filament_not_offered"
    assert refusal("GFB99", replace(A1, ams=False)) is None


def test_the_h2ds_nozzles_refuse_what_bambu_studio_refuses() -> None:
    assert refusal("GFT01", H2D_RIGHT) == "filament_not_right"
    assert refusal("GFU99", H2D_LEFT) == "filament_not_left"
    assert refusal("GFT01", H2D_LEFT) is None


def test_an_ams_rule_comes_before_a_nozzle() -> None:
    """Generic TPU in an AMS slot that feeds the left nozzle, which takes no
    Generic TPU either: the AMS is what is said."""
    assert refusal("GFU99", replace(H2D_LEFT, ams=True)) == "filament_not_for_ams"


def test_the_tpu_high_flow_nozzle_takes_its_own_tpus_only() -> None:
    slot = replace(H2D_RIGHT, nozzle_types={0: "HU01"})
    assert refusal("GFU98", slot) == "filament_not_for_nozzle"
    assert refusal("GFU00", slot) is None


def test_tpu_85a_on_the_h2ds_04_nozzles() -> None:
    """Bambu TPU 85A: not with a 0.4 mm Standard (S, A, X) or High Flow (H, E)
    nozzle; the E3D high-flow nozzle (B) and other diameters take it."""
    for code in ("HS01", "HA01", "HX01", "HH01", "HE01"):
        assert refusal("GFU04", replace(H2D_RIGHT, nozzle_types={0: code})) == "filament_not_for_nozzle", code
    assert refusal("GFU04", replace(H2D_RIGHT, nozzle_types={0: "HB01"})) is None
    assert refusal("GFU04", replace(H2D_RIGHT, diameter="0.6")) is None


def test_an_ams_slot_on_the_tpu_high_flow_nozzle_has_nothing_left() -> None:
    assert offer(replace(H2D_RIGHT, ams=True, nozzle_types={0: "HU01"})) == []


def test_a_switch_slot_offers_what_either_nozzle_takes() -> None:
    switch = Slot("H2D", "0.4", ams=True, extruders=frozenset({0, 1}), nozzle_types={0: "HS01", 1: "HS01"})
    assert refusal("GFN06", switch) is None  # Bambu PPA-CF: not on the right nozzle, the left takes it
    assert refusal("GFN06", replace(switch, extruders=frozenset({0}))) == "filament_not_right"
    assert refusal("GFT01", switch) == "filament_not_for_ams"  # Bambu PET-CF: the AMS rule holds on the switch too
    # The right nozzle a TPU high-flow one: TPU for AMS goes through the left.
    high_flow = replace(switch, nozzle_types={0: "HU01", 1: "HS01"})
    assert refusal("GFU98", high_flow) is None
    assert refusal("GFU98", replace(high_flow, nozzle_types={0: "HU01", 1: "HU01"})) == "filament_not_for_nozzle"


def test_an_unknown_model_offers_every_filament() -> None:
    every = _ids(replace(A1, model=None, ams=False))
    assert len(every) == 100
    assert every == _ids(replace(A1, model="Z9", ams=False))


def test_every_model_s_filaments_are_gathered_once_per_diameter() -> None:
    """A printer of no known model is offered the union of every model's:
    made once, not again for each filament the offer checks."""
    unknown = replace(A1, model=None, ams=False)
    assert filaments._offered_ids(unknown) is filaments._offered_ids(replace(unknown, model="Z9"))


def test_a_diameter_the_model_lacks_offers_nothing() -> None:
    assert offer(replace(A1, diameter="1.2")) == []


def test_diameters_are_read_as_bambu_studio_does() -> None:
    assert [diameter("A1", value) for value in ("0.4", "0.40", "", None, "x", "0")] == ["0.4"] * 6
    assert diameter("A1", "0.2") == "0.2"
    # The H2C changes nozzles from its rack: Bambu Studio offers it the 0.4 set.
    assert diameter("H2C", "0.6") == "0.4"


def test_a_foreign_id_is_kept_as_it_is() -> None:
    """BamBuddy's GFNLS03, a user's own preset: no profile of Bambu Studio's."""
    assert get("GFNLS03") is None and label("GFNLS03") is None
    assert refusal("GFNLS03", A1) == "filament_not_offered"


def test_a_profile_the_printer_is_not_offered() -> None:
    """SUNLU PLA+ is Bambu Studio's, but not for the P2S."""
    p2s = replace(A1, model="P2S")
    assert refusal("GFSNL03", p2s) == "filament_not_offered"
    assert label("GFSNL03") == "SUNLU PLA+"
    assert [vendor for vendor, _ in offer(p2s)] == ["Bambu Lab", "Generic"]


def test_a_type_stands_for_its_generic_profile() -> None:
    """Where a slot's own profile is unknown, its type stands for one:
    the Generic profile named after it, another Generic of the type, else
    the type's first in Bambu Studio's order; a type the list lacks, none."""
    assert [of_type(kind).name for kind in ("PLA", "PETG", "TPU", "TPU-AMS", "tpu-ams")] == [  # type: ignore[union-attr]
        "Generic PLA",
        "Generic PETG",
        "Generic TPU",
        "Generic TPU for AMS",
        "Generic TPU for AMS",
    ]
    assert of_type("PLA-S") == get("GFS02")  # Bambu Support For PLA
    assert of_type("PA-S") == get("GFS03")
    assert of_type("") is None
    assert of_type("Wood") is None
