"""The README: its links within itself, its badges in step with what they
show, and its shape. What moved to the pages is pinned in
tests/test_documentation.py."""
from __future__ import annotations

import json
from pathlib import Path
import re

from tests.helpers import _github_anchor

_ROOT = Path(__file__).parent.parent
_README = (_ROOT / "README.md").read_text(encoding="utf-8")
# The README without its code blocks.
_PROSE = re.sub(r"```.*?```", "", _README, flags=re.DOTALL)
_HEADINGS = re.findall(r"^## (.+)$", _README, re.MULTILINE)


# --- Links within the README ----------------------------------------------------


def test_the_readme_reads_right_in_the_marketplace():
    """The Marketplace shows the whole README, the HACS and manual steps
    too: Home Assistant 2026.11 has no markers that leave a part out, and a
    link to a section of the page does not jump there. So no such link, no
    marker, and no word that points at a place on the page: a section is
    named in words, a page linked by its full address."""
    assert re.findall(r"\]\(#[^)\s]*\)|href=\"#", _PROSE) == []
    assert "ha-marketplace:" not in _README
    for pointer in ("button above", "at the top", "further down", "Click"):
        assert pointer not in _PROSE, pointer
    assert "**Create an API key** under Configuration" in _PROSE


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
    that file -- by its full address: the Marketplace shows the README away
    from the repository."""
    granted = (_ROOT / "LICENSE").read_text(encoding="utf-8").split(" License", 1)[0]
    assert granted == "MIT"
    assert (
        f'<a href="https://github.com/Spegeli/hacs_bambuddy/blob/main/LICENSE">'
        f'<img src="https://img.shields.io/badge/license-{granted}-yellow" '
        f'alt="License: {granted}"></a>'
    ) in _README


def test_every_badge_under_the_title_says_what_it_shows():
    """A badge is a picture: its text is what a screen reader reads and
    what shows where the picture does not load."""
    badges = re.findall(r'<img src="https://img\.shields\.io/[^"]*"([^>]*)>', _README)
    assert len(badges) == 4
    assert all(re.search(r'alt="[^"]+"', rest) for rest in badges), badges


def test_the_release_badge_opens_the_release_it_shows():
    """The badge shows the newest stable release -- pre-releases left out,
    as include_prereleases is not set -- and GitHub's /releases/latest
    forwards to that same release, whichever it is."""
    [(link, badge)] = re.findall(
        r'<a href="([^"]*)"><img src="(https://img\.shields\.io/github/v/release/[^"]*)"', _README
    )
    assert link == "https://github.com/Spegeli/hacs_bambuddy/releases/latest"
    assert "include_prereleases" not in badge


def test_every_mention_of_the_floor_names_the_minimum_of_hacs_json():
    """The floor is raised in one go: hacs.json, the README's requirements,
    CONTRIBUTING and the pull request template say the same."""
    minimum = json.loads((_ROOT / "hacs.json").read_text(encoding="utf-8"))["homeassistant"]
    floor = ".".join(minimum.split(".")[:2])
    contributing = (_ROOT / "CONTRIBUTING.md").read_text(encoding="utf-8")
    template = (_ROOT / ".github" / "pull_request_template.md").read_text(encoding="utf-8")
    assert f"Home Assistant **{floor}** or newer" in _README
    assert f"**Home Assistant {floor} is the floor**" in contributing
    assert f"the Python of the {floor} floor" in contributing
    assert f"exist in {floor}, the supported floor" in template


def test_the_issue_forms_link_to_sections_of_the_readme():
    """The bug form's first checkbox and the chooser's contact link send the
    user into the README: a renamed heading would break them unseen."""
    sections = {_github_anchor(heading) for heading in re.findall(r"^#{1,6} (.+)$", _PROSE, re.MULTILINE)}
    links = {
        link
        for form in sorted((_ROOT / ".github" / "ISSUE_TEMPLATE").glob("*.yml"))
        for link in re.findall(r"github\.com/Spegeli/hacs_bambuddy#([^)\s\"']+)", form.read_text(encoding="utf-8"))
    }
    assert {"-troubleshooting", "create-an-api-key"} <= links
    assert sorted(links - sections) == []


def test_the_key_needs_all_three_permissions() -> None:
    """The integration refuses a key lacking Read Status, Control Printer or
    Manage Maintenance -- also with BamBuddy's authentication off: the README
    says so, and tells what to check first. The read-only advice that must
    not come back: tests/test_documentation.py."""
    assert "**Read Status**, **Control Printer** and **Manage Maintenance**" in _README
    assert "Check that you pasted all of it" in _README


_APP = "https://github.com/Spegeli/homeassistant-app-bambuddy"


def test_the_head_sends_date_version_users_to_the_upgrade_and_names_the_app() -> None:
    """No development warning any more: before the first section the README
    says it is the integration, not the BamBuddy app -- as the app's README
    says the other way round -- and sends users of a date version to the
    upgrade first (as hacs_bitpanda does), by the page's full address: a link
    to a section does nothing in the Marketplace."""
    head = _README[: _README.index("## ✨ Features")]
    assert "[!WARNING]" not in head and "active development" not in head
    assert "This is the integration, not the app" in head and _APP in head
    assert "> [!IMPORTANT]" in head and "/blob/main/documentation/updating.md#upgrading-from-a-date-version)" in head


def test_the_head_links_where_people_ask_and_talk() -> None:
    """Under the badges, one line to the integration's thread in the Home
    Assistant forum -- the thread the issue chooser sends questions to -- and
    to its post on r/BambuLab. Ideas and bugs belong to GitHub's forms, so the
    line names questions and discussion only."""
    head = _README[: _README.index("## ✨ Features")]
    chooser = (_ROOT / ".github" / "ISSUE_TEMPLATE" / "config.yml").read_text(encoding="utf-8")
    forum = re.search(r"name: Questions about this integration\n\s+url: (\S+)", chooser)
    assert forum
    start = head.index("💬 Questions and discussion:")
    line = head[start:].split("\n", 1)[0]
    assert f'<a href="{forum.group(1)}">Home Assistant forum</a>' in line
    assert '<a href="https://www.reddit.com/r/BambuLab/comments/1xim2qw/' in line
    assert line.endswith(">r/BambuLab on Reddit</a>")
    assert head.index('alt="Home Assistant 2025.5+"') < start < head.index("A custom <a href=")


def test_the_app_section_follows_the_requirements() -> None:
    """Where a reader without a BamBuddy server looks next: the app that runs
    it inside Home Assistant, and the address to enter for it -- named as the
    app's README names its section on the integration."""
    assert _HEADINGS[_HEADINGS.index("📋 Requirements") + 1] == "🧩 Home Assistant App"
    section = _README[_README.index("## 🧩 Home Assistant App") :]
    section = section[: section.index("\n## ", 1)]
    assert _APP in section and "`http://homeassistant.local:8000`" in section and "`localhost`" in section


def _section(heading: str) -> str:
    start = _README.index(f"\n## {heading}\n")
    return _README[start : _README.index("\n## ", start + 1)]


def test_the_pictures_come_right_after_the_features() -> None:
    """Many decide by the pictures whether to install: the card's four
    pictures stand right after the features, and the card's own section
    points up to them instead of showing them again."""
    assert _HEADINGS[:3] == ["✨ Features", "📸 Screenshots", "📋 Requirements"]
    assert _section("📸 Screenshots").count("/.github/readme/cards/") == 4
    card = _section("🃏 Dashboard card")
    assert "<img " not in card and "**Screenshots**" in card
    # Pictures side by side that stack on a phone: no layout table.
    assert "<table" not in _README


def test_the_card_and_the_examples_come_before_the_reference() -> None:
    """What a new user wants first -- the card, then what to automate --
    before the way to look things up: the pages, then the help."""
    order = [
        "⚙️ Configuration",
        "🃏 Dashboard card",
        "🤖 Automation examples",
        "📚 Documentation",
        "🔧 Troubleshooting",
        "⬆️ Upgrading from a date version",
    ]
    assert [_HEADINGS.index(heading) for heading in order] == sorted(_HEADINGS.index(heading) for heading in order)


def test_the_marketplace_comes_before_hacs_and_hacs_folds() -> None:
    """Home Assistant 2026.11 replaced HACS with the Marketplace, and the
    floor is older: its steps first, under the name people know, then the
    one fold, closed at first, with the HACS steps and their button. A blank
    line after the summary lets GitHub and Home Assistant render what is
    inside."""
    section = _section("📦 Installation")
    folds = re.findall(r"<details>\n<summary>([^<]+)</summary>\n\n(.*?)\n\n</details>", _README, re.DOTALL)
    assert _README.count("<details") == len(folds) == 1 and "<details open" not in _README
    [(summary, body)] = folds
    assert summary == "Home Assistant before 2026.11: HACS" and body in section
    assert "my.home-assistant.io/redirect/hacs_repository/" in body
    assert "**Custom repositories**" in body
    assert section.index("### Marketplace (formerly HACS)") < section.index("<details>")
    assert section.index("</details>") < section.index("### Manual installation")
    assert "my.home-assistant.io/redirect/marketplace_repository/" in _README[: _README.index("<details>")]
    assert "`Spegeli/hacs_bambuddy`" in section and "**Add from link**" in section


def test_a_reader_without_a_github_connection_is_told_it_comes() -> None:
    """The Marketplace asks for a GitHub connection before it adds a
    repository: without a word on it the steps seem to stall there."""
    assert "needs a GitHub connection" in _section("📦 Installation")


def test_the_first_steps_say_what_the_screen_shows() -> None:
    """What a beginner met on a real 2026.11: the field's name and what it
    takes, where the repository then stands, the second Install, the step
    after the printers, and the offer to uninstall with the entry."""
    section = _section("📦 Installation")
    assert section.index("**Create an API key**") < section.index("### Marketplace (formerly HACS)")
    for words in ("**GitHub link**", "or the full address", "**Available**", "search for it", "You install this at your own risk"):
        assert words in section, words
    assert "**Name and assign**" in _README and "**Skip and finish**" in _README
    removal = _section("🗑️ Removal")
    assert "**Also uninstall BamBuddy?**" in removal and "`purge_keep_days`" in removal
    assert "/blob/main/documentation/glossary.md)" in _section("✨ Features")


def test_updates_and_betas_lead_to_the_page() -> None:
    """One line on updates; the rest stands on its page."""
    section = _section("📦 Installation").split("### Updates and betas", 1)[1]
    assert "**Settings → Updates**" in section
    assert "/blob/main/documentation/updating.md)" in section


_OWN_IMAGE ="https://raw.githubusercontent.com/Spegeli/hacs_bambuddy/main/"


def test_the_readmes_own_images_are_in_the_repository_with_a_text() -> None:
    """The README loads its own images from `main` (GitHub, the Marketplace
    and HACS show it alike); they live under `.github/readme/` as in hacs_bitpanda: each
    address finds its file, and each image says in words what it shows."""
    own = [tag for tag in re.findall(r"<img ([^>]*)>", _README) if _OWN_IMAGE in tag]
    paths = [re.search(r'src="([^"]*)"', tag).group(1).removeprefix(_OWN_IMAGE) for tag in own]  # type: ignore[union-attr]
    assert paths == [
        ".github/readme/logo.png",
        ".github/readme/cards/status.png",
        ".github/readme/cards/two-nozzle.png",
        ".github/readme/cards/control.png",
        ".github/readme/cards/filament.png",
    ]
    for path in paths:
        assert (_ROOT / path).is_file(), path
    for tag in own:
        alt = re.search(r'alt="([^"]*)"', tag)
        assert alt and alt.group(1).strip(), tag
    assert not (_ROOT / "logo.png").exists()


def test_the_readme_names_manage_inventory_as_optional() -> None:
    """Manage Inventory is no permission the integration needs. Requirements
    say so, and under "Create an API key" it stands in a list of its own after
    the required ones, which more optional permissions can join: what it adds,
    and that everything else works without it."""
    assert "**Manage Inventory** is optional" in _section("📋 Requirements")
    section = _README.split("### Create an API key", 1)[1].split("\n### ", 1)[0]
    required, optional = section.split("**Optional:**", 1)
    assert "**Required**" in required
    for permission in ("Read Status", "Control Printer", "Manage Maintenance"):
        assert f"- **{permission}**:" in required, permission
    assert "- **Manage Inventory**:" in optional and "Manage Inventory" not in required
    assert "without it" in optional
