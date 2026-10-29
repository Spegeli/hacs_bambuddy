"""CONTRIBUTING.md: every link to one of its sections finds that section.

A section that moves keeps its anchor, one that is renamed loses it, and
a link to a lost anchor fails without a sound: GitHub opens the top of the
page. The links come from CONTRIBUTING.md itself; the README has none into
it yet.
"""
from __future__ import annotations

from pathlib import Path
import re

_ROOT = Path(__file__).parent.parent


def _anchor(heading: str) -> str:
    """The anchor GitHub gives a heading of plain words: lower case, a dash
    for each space, other punctuation dropped."""
    return re.sub(r"[^a-z0-9 -]", "", heading.lower()).replace(" ", "-")


def _sections() -> set[str]:
    text = (_ROOT / "CONTRIBUTING.md").read_text(encoding="utf-8")
    return {_anchor(heading) for heading in re.findall(r"^#{2,3} (.+)$", text, re.MULTILINE)}


def test_every_link_within_contributing_finds_its_section():
    text = (_ROOT / "CONTRIBUTING.md").read_text(encoding="utf-8")
    links = set(re.findall(r"\]\(#([^)]+)\)", text))
    assert links
    assert sorted(links - _sections()) == []


def test_contributing_says_a_short_key_is_refused() -> None:
    text = (_ROOT / "CONTRIBUTING.md").read_text(encoding="utf-8")
    assert "| `key.py` |" in text
    assert "a key lacking Read Status, Control Printer or Manage Maintenance is refused" in text
    assert "with a key that has only **Read Status**" not in text


def test_the_module_table_lists_every_module() -> None:
    """Each module of the integration has its row."""
    contributing = (_ROOT / "CONTRIBUTING.md").read_text(encoding="utf-8")
    # The first column of each row: one file, or several (`services.py`, `services.yaml`).
    named = {cell.strip(" `") for line in contributing.splitlines() if line.startswith("| `") for cell in line.split("|")[1].split(",")}
    modules = sorted(path.name for path in (_ROOT / "custom_components" / "bambuddy").glob("*.py"))
    assert [name for name in modules if name not in named] == []


def test_contributing_says_how_ams_entity_ids_are_made() -> None:
    contributing = (_ROOT / "CONTRIBUTING.md").read_text(encoding="utf-8")
    assert "`models.ams_object_id`" in contributing
