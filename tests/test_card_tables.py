"""The tables the integration and the dashboard card both hold: alike.

The card offers what the integration's actions take -- HMS answers,
materials, drying, extrusion and switch-off limits. Each side keeps its own
copy (the card has no access to the integration's Python); these tests
fail the day one copy changes without the other.
"""
from __future__ import annotations

import json
from pathlib import Path
import re

import pytest
import voluptuous as vol
import yaml

from custom_components.bambuddy import auto_off, coordinator, models, plugs, services
from custom_components.bambuddy.models import DRYING_MAX, HMS_ANSWERS, MATERIALS

from tests.conftest import INTEGRATION

_CARD = Path(__file__).parent.parent / "cards" / "src"


def _card(name: str) -> str:
    """A card source without its comments."""
    return re.sub(r"/\*.*?\*/|//[^\n]*", "", (_CARD / name).read_text(encoding="utf-8"), flags=re.S)


def _constant(source: str, name: str) -> int:
    found = re.search(rf"\bconst {name} = (\d+);", source)
    assert found, name
    return int(found.group(1))


def test_the_same_hms_answers() -> None:
    """An answer the integration takes but the card lacks would never be offered."""
    block = re.search(r"const HMS_ANSWERS: Record<string, TextKey> = \{(.*?)\};", _card("header.ts"), re.S)
    assert block
    assert set(re.findall(r"^\s*([A-Z_]+):", block.group(1), re.M)) == set(HMS_ANSWERS)


def test_the_same_materials() -> None:
    """The card's list, the action's choices and the integration's table: the same materials, profiles
    and types, in one order."""
    block = re.search(r"const GENERIC: readonly \[string, string, string\]\[\] = \[(.*?)\];", _card("dialogs.ts"), re.S)
    assert block
    card = re.findall(r'\["([^"]+)", "([^"]+)", "([^"]+)"\]', block.group(1))
    assert card == [(name, material.profile, material.tray_type) for name, material in MATERIALS.items()]
    actions = yaml.safe_load((INTEGRATION / "services.yaml").read_text(encoding="utf-8"))
    assert actions["set_filament"]["fields"]["material"]["selector"]["select"]["options"] == list(MATERIALS)


def test_the_same_drying_limits() -> None:
    """The dialog offers no drying the action refuses, and refuses none it takes."""
    found = re.search(r"export const DRYING = \{(.*?)\};", _card("dialogs.ts"))
    assert found
    drying = {key: int(value) for key, value in re.findall(r"(\w+): (\d+)", found.group(1))}
    assert (drying["maxTemperatureAms2Pro"], drying["maxTemperature"]) == (DRYING_MAX["AMS 2 Pro"], DRYING_MAX["AMS HT"])
    schema = services.SCHEMAS["start_drying"]
    call = {"device_id": "x", "temperature": drying["minTemperature"], "duration": drying["minDuration"]}
    schema(call)
    schema({**call, "temperature": drying["maxTemperature"], "duration": drying["maxDuration"]})
    for field, value in (("temperature", drying["minTemperature"] - 1), ("temperature", drying["maxTemperature"] + 1),
                         ("duration", drying["minDuration"] - 1), ("duration", drying["maxDuration"] + 1)):  # fmt: skip
        with pytest.raises(vol.Invalid):
            schema({**call, field: value})


def test_the_same_extrusion_minimum() -> None:
    assert _constant(_card("control-view.ts"), "MIN_EXTRUDE_TEMPERATURE") == services.MIN_EXTRUDE_TEMPERATURE


def test_the_same_switch_off_temperatures() -> None:
    """The card's stepper stays inside the number entity's range."""
    power = _card("power.ts")
    assert (_constant(power, "DEFAULT_AUTO_OFF"), _constant(power, "AUTO_OFF_MIN"), _constant(power, "AUTO_OFF_MAX")) == (
        auto_off.DEFAULT_TEMPERATURE,
        auto_off.MIN_TEMPERATURE,
        auto_off.MAX_TEMPERATURE,
    )


_DOMAINS = "sensor|binary_sensor|switch|number|button|select|light|fan|camera|image|update"


def _set(source: str, name: str) -> set[str]:
    found = re.search(rf"\b{name}\b[^=]*= new Set(?:<\w+>)?\(\[(.*?)\]\)", source, re.S)
    assert found, name
    return set(re.findall(r'"([a-z_]+)"', found.group(1)))


def test_the_card_tells_a_printer_device_by_the_integrations_identifier() -> None:
    """Before its entities come, the card knows a printer by its device's
    identifier: an AMS unit's, a plug's or the instance's never pass."""
    found = re.search(r"const PRINTER_IDENTIFIER = /(.+)/;", _card("discovery.ts"))
    assert found
    pattern = re.compile(found.group(1))
    entry_id = "01JENTRY0000000000000000AB"
    assert pattern.match(coordinator.printer_identifier(entry_id, "00M00A000000001")[1])
    assert not pattern.match(coordinator.ams_identifier(entry_id, "00M00A000000001", "00600A3B0000001")[1])
    assert not pattern.match(plugs.plug_identifier(entry_id, 3)[1])
    assert not pattern.match(entry_id)


def test_the_card_looks_for_keys_the_integration_gives() -> None:
    """The card finds each entity by its domain and translation key:
    renamed on one side only, the card loses it."""
    texts = json.loads((INTEGRATION / "strings.json").read_text(encoding="utf-8"))
    given = {f"{platform}.{key}" for platform, entities in texts["entity"].items() for key in entities}
    wanted = set(re.findall(rf'"((?:{_DOMAINS})\.[a-z0-9_]+)"', _card("discovery.ts")))
    assert len(wanted) > 50
    assert sorted(wanted - given) == []


def test_the_card_knows_the_integrations_states() -> None:
    """The print statuses, AMS statuses and stages the card compares with
    are ones the integration gives."""
    union = re.search(r"export type PrintStatus = ([^;]+);", _card("types.ts"))
    assert union
    assert set(re.findall(r'"([a-z_]+)"', union.group(1))) == set(models.PRINT_STATUSES)
    for name in ("BUSY", "RUNNING", "WITH_JOB"):
        assert _set(_card("format.ts"), name) <= set(models.PRINT_STATUSES), name
    assert _set(_card("format.ts"), "FILAMENT_CHANGE") == {*models._CHANGE_STEPS.values(), "changing_filament"}
    assert _set(_card("filament-view.ts"), "FILAMENT_PAUSES") <= set(models.STAGE_OPTIONS)
    assert _set(_card("status-view.ts"), "PLAIN_STAGES") <= {*models.STAGE_OPTIONS, "unknown", "unavailable"}
