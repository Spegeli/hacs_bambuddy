"""The H3C's PrintTools, read from BamBuddy's nozzle rack."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from custom_components.bambuddy.models import (
    NozzleParts,
    PrinterData,
    has_tool_rack,
    mounted_tool,
    nozzle_parts,
    tool_is_tpu_285,
    tools,
)

# Racks from the beta tester's H3C (BamBuddy 1.3.2b1), serials left out.
RACKS: dict[str, list[dict[str, Any]]] = json.loads((Path(__file__).parent / "fixtures" / "h3c_racks.json").read_text(encoding="utf-8"))


def _h3c(rack: list[dict[str, Any]] | None, model: str = "H3C") -> PrinterData:
    status: dict[str, Any] = {"connected": True}
    if rack is not None:
        status["nozzle_rack"] = rack
    return PrinterData(info={"model": model}, status=status)


@pytest.mark.parametrize(
    ("code", "diameter", "expected"),
    [
        ("HS01", "0.4", NozzleParts("0.4", "standard", "hardened_steel", "1.75")),
        ("HH01", "0.6", NozzleParts("0.6", "high_flow", "hardened_steel", "1.75")),
        ("HE00", "0.4", NozzleParts("0.4", "high_flow", "stainless_steel", "1.75")),
        ("HU01", "0.4", NozzleParts("0.4", "tpu_high_flow", "hardened_steel", "1.75")),
        ("HT01", "0.4", NozzleParts("0.4", "tpu_285", "hardened_steel", "2.85")),
        ("HS05", 0.2, NozzleParts("0.2", "standard", "tungsten_carbide", "1.75")),
        ("HS01-0.4", None, NozzleParts("0.4", "standard", "hardened_steel", "1.75")),
    ],
)
def test_nozzle_parts_reads_flow_material_and_size(code: str, diameter: Any, expected: NozzleParts) -> None:
    assert nozzle_parts(code, diameter) == expected


@pytest.mark.parametrize("code", [None, "", "x", "hardened_steel"])
def test_nozzle_parts_none_for_what_is_no_code(code: str | None) -> None:
    assert nozzle_parts(code) is None


def test_tools_reads_the_idle_rack() -> None:
    data = _h3c(RACKS["idle"])
    found = tools(data)
    assert sorted(found) == list(range(1, 10))
    assert [number for number, tool in sorted(found.items()) if tool.has_filament] == [1, 2, 5, 6, 9]
    assert not any(tool.on_toolhead for tool in found.values())
    assert mounted_tool(data) == 0
    assert found[8].parts.filament_mm == "2.85"
    assert found[1].print_time_s == RACKS["idle"][0]["print_time_s"]
    # Black filament is a colour; an empty tool reports none.
    assert found[5].filament_color == "000000FF"
    assert found[3].filament_color is None


def test_tools_reads_a_tool_change() -> None:
    data = _h3c(RACKS["change"])
    assert mounted_tool(data) == 2
    assert tools(data)[2].on_toolhead


def test_tools_reads_the_status_bits() -> None:
    """Empty tools report 1, filled ones 161 and the mounted one 49."""
    data = _h3c(RACKS["returned"])
    found = tools(data)
    assert mounted_tool(data) == 9
    assert found[9].has_filament
    assert [number for number, tool in sorted(found.items()) if not tool.has_filament] == [3, 4, 6, 7, 8]


def test_tools_ignores_null_and_duplicate_places() -> None:
    rack = copy.deepcopy(RACKS["idle"])
    rack[1]["addr_id"] = None
    duplicate = {**rack[2], "nozzle_diameter": "0.8"}
    rack.append(duplicate)
    rack.append({**rack[3], "addr_id": 12})
    found = tools(_h3c(rack))
    assert 2 not in found
    assert found[3].parts.diameter == rack[2]["nozzle_diameter"]
    assert sorted(found) == [1, 3, 4, 5, 6, 7, 8, 9]


def test_mounted_tool_none_without_rack() -> None:
    assert mounted_tool(_h3c(None)) is None
    assert tools(_h3c(None)) == {}


def test_tool_is_tpu_285_by_code_not_place() -> None:
    rack = copy.deepcopy(RACKS["idle"])
    for entry in rack:
        entry["nozzle_type"] = "HT01" if entry["addr_id"] == 2 else "HS01"
    data = _h3c(rack)
    assert tool_is_tpu_285(data, 3)
    assert not tool_is_tpu_285(data, 8)
    assert not tool_is_tpu_285(data, 10)


def test_has_tool_rack_by_model() -> None:
    assert has_tool_rack(_h3c(None))
    assert not has_tool_rack(_h3c(RACKS["idle"], model="H2C"))
    assert not has_tool_rack(_h3c(None, model="X1C"))
