"""The shipped filament list, as Bambu Studio's profiles of 2026-10-13 hold
it (and as the printers' own screens and his A1 showed it)."""
from __future__ import annotations

from collections import Counter
import json
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).parents[1]
DATA: dict[str, Any] = json.loads((ROOT / "custom_components" / "bambuddy" / "filaments.json").read_text(encoding="utf-8"))


def test_one_hundred_filaments_from_six_vendors() -> None:
    vendors = Counter(item["vendor"] for item in DATA["filaments"].values())
    assert vendors == {"Bambu Lab": 49, "Generic": 29, "Polymaker": 12, "SUNLU": 7, "Overture": 2, "eSUN": 1}
    assert DATA["vendors"] == ["Bambu Lab", "Generic", "Polymaker", "Overture", "SUNLU", "eSUN"]


def test_what_bambu_studio_sends() -> None:
    filaments = DATA["filaments"]
    assert filaments["GFA00"]["setting_id"] == "GFSA00_04"
    # Set from Bambu Studio on his A1: GFSNL08, PETG, 230-280 °C.
    assert filaments["GFSNL08"] == {"vendor": "SUNLU", "name": "SUNLU PETG", "type": "PETG",
                                    "setting_id": "GFSNLS08_02", "temp_min": 230, "temp_max": 280}  # fmt: skip
    # Set on his A1's own screen: TPU-AMS, 200-250 °C.
    assert (filaments["GFU98"]["type"], filaments["GFU98"]["temp_min"], filaments["GFU98"]["temp_max"]) == ("TPU-AMS", 200, 250)
    assert filaments["GFS99"]["setting_id"] == "GFSS99"
    assert filaments["GFG96"]["setting_id"] == "GFSG96_04"


@pytest.mark.parametrize(("model", "count"), [("A1", 86), ("A1 MINI", 62), ("P1S", 96), ("X1C", 96), ("H2S", 84), ("H2C", 77)])
def test_the_offer_per_model_at_04(model: str, count: int) -> None:
    assert len(DATA["printers"][model]["0.4"]["ids"]) == count


def test_every_model_bambu_studio_knows() -> None:
    assert set(DATA["printers"]) == {"A1", "A1 MINI", "A2L", "P1P", "P1S", "P2S", "X1", "X1C", "X1E", "X2D", "H2D", "H2D PRO", "H2C", "H2S"}


def test_the_a1_mini_has_no_abs_and_the_p2s_two_vendors() -> None:
    assert "GFB99" not in DATA["printers"]["A1 MINI"]["0.4"]["ids"]
    assert {DATA["filaments"][i]["vendor"] for i in DATA["printers"]["P2S"]["0.4"]["ids"]} == {"Bambu Lab", "Generic"}


def test_the_h2ds_nozzles() -> None:
    """Right: no PET-CF, PPA-CF, PPS-CF; left: no TPU 85A and Generic TPU."""
    # In the offer's order: Bambu PET-CF, PPA-CF, PPS-CF, then Generic PPA-CF.
    assert DATA["printers"]["H2D"]["0.4"]["not_on"] == {"0": ["GFT01", "GFN06", "GFT02", "GFN97"], "1": ["GFU04", "GFU99"]}


def test_bambu_studios_order() -> None:
    """PLA, PETG, ABS and TPU first, the other types after them (PLA Aero is
    "PLA-AERO"), ties by name."""
    ids = DATA["printers"]["A1"]["0.4"]["ids"]
    bambu = [DATA["filaments"][i] for i in ids if DATA["filaments"][i]["vendor"] == "Bambu Lab"]
    ranks = [("PLA", "PETG", "ABS", "TPU").index(item["type"]) if item["type"] in ("PLA", "PETG", "ABS", "TPU") else 4 for item in bambu]
    assert ranks == sorted(ranks)
    first = [item["name"] for item, rank in zip(bambu, ranks, strict=True) if rank == 0]
    assert first == sorted(first, key=lambda name: name.encode("utf-8")) and first[0] == "Bambu PLA Basic"


def test_the_source() -> None:
    assert DATA["source"] == {"repository": "https://github.com/bambulab/BambuStudio",
                              "commit": "79df7ae309be398ed30c9f397c13c9911c2edc57",
                              "profiles": "02.08.00.09", "licence": "AGPL-3.0"}  # fmt: skip
