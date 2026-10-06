"""The README: its links within itself, and its badges in step with what
they show."""
from __future__ import annotations

import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import quote

_ROOT = Path(__file__).parent.parent
_README = (_ROOT / "README.md").read_text(encoding="utf-8")


# --- Links within the README ----------------------------------------------------


def _github_anchor(heading: str) -> str:
    """The anchor GitHub gives `heading`, as a link writes it: lower case;
    letters, digits, marks, "_", "-" and spaces kept, a space becoming a
    dash; everything else -- punctuation, an emoji -- dropped. The emoji's
    invisible variation selector is a mark, so "⬆️ Upgrading" keeps it, and
    a link writes it percent-encoded: "%EF%B8%8F-upgrading"."""
    kept = "".join(
        char for char in heading.strip().lower()
        if char in " -_" or unicodedata.category(char)[0] in "LMN"
    )
    return quote(kept.replace(" ", "-"), safe="-_")


def test_every_link_within_the_readme_finds_its_section():
    """A renamed heading breaks every link to it without a warning on
    GitHub: the requirements link the API key section, the license the
    disclaimer."""
    text = re.sub(r"```.*?```", "", _README, flags=re.DOTALL)
    sections = {
        _github_anchor(heading) for heading in re.findall(r"^#{1,6} (.+)$", text, re.MULTILINE)
    }
    links = set(re.findall(r"\]\(#([^)\s]+)\)", text))
    assert {"create-an-api-key", "%EF%B8%8F-disclaimer"} <= links
    assert sorted(links - sections) == []


# --- The badges under the title --------------------------------------------------


def test_the_home_assistant_badge_names_the_minimum_version_of_hacs_json():
    """The badge says which Home Assistant the integration needs; hacs.json
    states it for HACS. A new minimum turns this red until the badge
    follows."""
    minimum = json.loads((_ROOT / "hacs.json").read_text(encoding="utf-8"))["homeassistant"]
    major, minor, *_ = minimum.split(".")
    assert f"https://img.shields.io/badge/Home%20Assistant-{major}.{minor}%2B-" in _README


def test_the_license_badge_names_the_license_of_the_license_file_and_opens_it():
    """The badge says which license the LICENSE file grants, and links to
    that file."""
    granted = (_ROOT / "LICENSE").read_text(encoding="utf-8").split(" License", 1)[0]
    assert granted == "MIT"
    assert (
        f'<a href="LICENSE"><img src="https://img.shields.io/badge/license-{granted}-yellow" '
        f'alt="License: {granted}"></a>'
    ) in _README


def test_the_release_badge_opens_the_release_it_shows():
    """The badge shows the newest stable release -- pre-releases left out,
    as include_prereleases is not set -- and GitHub's /releases/latest
    forwards to that same release, whichever it is."""
    [(link, badge)] = re.findall(
        r'<a href="([^"]*)"><img src="(https://img\.shields\.io/github/v/release/[^"]*)"', _README
    )
    assert link == "https://github.com/Spegeli/hacs_bambuddy/releases/latest"
    assert "include_prereleases" not in badge
