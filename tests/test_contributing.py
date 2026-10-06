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
