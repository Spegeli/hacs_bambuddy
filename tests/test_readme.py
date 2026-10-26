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


def test_the_switch_off_trigger_fires_once():
    """A state trigger on the switch-off's `phase` "to done" alone fires
    again at every reload of the entry while it is done (the restored state
    comes from one without attributes): the README's trigger names `from`."""
    assert "`phase` from `waiting` to `done`" in _README


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
    text = re.sub(r"```.*?```", "", _README, flags=re.DOTALL)
    sections = {_github_anchor(heading) for heading in re.findall(r"^#{1,6} (.+)$", text, re.MULTILINE)}
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
    says so, and none of the read-only advice is left."""
    readme = (_ROOT / "README.md").read_text(encoding="utf-8")
    assert "**Read Status**, **Control Printer** and **Manage Maintenance**" in readme
    assert "Check that you pasted all of it" in readme
    # The owner given the right back: the stored key checked again.
    assert "leave the dialog's field empty to check the stored key at once" in readme
    for gone in (
        "Unsure? Start with this alone",
        "any key works",
        "If the setup accepts any text as the key",
        "give the integration an API key without **Control Printer**",
        "There are no controls: no pause or stop",
        "with a key without **Control Printer**",
        "Without **Control Printer** on the API key",
        "`can_mark_done`",
        "Controls appear only when the API key has",
        "off at first",
        "starts unticked",
        "Copy it again from BamBuddy",
    ):
        assert gone not in readme, gone


def test_ams_entity_ids_name_the_unit() -> None:
    """AMS entity IDs carry the unit's model and serial; the AMS Lite's the
    printer's serial and its letter until BamBuddy reports its own (#3348),
    then a notice lists the renamed IDs."""
    readme = (_ROOT / "README.md").read_text(encoding="utf-8")
    assert "_ams_a_humidity" not in readme
    assert "sensor.ams_2_pro_19c06a000000001_humidity" in readme
    assert "sensor.ams_lite_0309da000000002_a_slot_1" in readme
    assert "maziggy/bambuddy/issues/3348" in readme
    assert "the plain entity IDs; otherwise they end in `_2`" in readme
    # Known limitations: the AMS Lite until BamBuddy reports its serial.
    assert "**AMS Lite without its serial number:**" in readme
    # The example names the unit by its device, which follows its place.
    assert "device_attr(trigger.entity_id, 'name')" in readme
    assert "an AMS Lite's, for now," in readme
    # A replacement AMS Lite without a serial stays the same device.
    assert "an AMS Lite stays the same device while BamBuddy reports no serial" in readme


_APP = "https://github.com/Spegeli/homeassistant-app-bambuddy"


def test_the_head_sends_date_version_users_to_the_upgrade_and_names_the_app() -> None:
    """No development warning any more: before the first section the README
    says it is the integration, not the BamBuddy app -- as the app's README
    says the other way round -- and sends users of a date version to the
    upgrade first (as hacs_bitpanda does)."""
    head = _README[: _README.index("## ✨ Features")]
    assert "[!WARNING]" not in head and "active development" not in head
    assert "This is the integration, not the app" in head and _APP in head
    assert "> [!IMPORTANT]" in head and "(#%EF%B8%8F-upgrading-from-a-date-version)" in head


def test_the_app_section_follows_the_requirements() -> None:
    """Where a reader without a BamBuddy server looks next: the app that runs
    it inside Home Assistant, and the address to enter for it -- named as the
    app's README names its section on the integration."""
    headings = re.findall(r"^## (.+)$", _README, re.MULTILINE)
    assert headings[headings.index("📋 Requirements") + 1] == "🧩 Home Assistant App"
    section = _README[_README.index("## 🧩 Home Assistant App") :]
    section = section[: section.index("\n## ", 1)]
    assert _APP in section and "`http://homeassistant.local:8000`" in section and "`localhost`" in section


_OWN_IMAGE = "https://raw.githubusercontent.com/Spegeli/hacs_bambuddy/main/"


def test_the_readmes_own_images_are_in_the_repository_with_a_text() -> None:
    """The README loads its own images from `main` (GitHub and HACS show it
    alike); they live under `.github/readme/` as in hacs_bitpanda: each
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



def test_the_readme_says_how_plugs_are_known() -> None:
    """A plug's entities belong to what it switches, its device to BamBuddy's plug (words as approved)."""
    assert (
        "Its entities belong to what it switches: a Tasmota by its IP address, a Home Assistant plug by its entity, an MQTT plug by "
        "its topic and the path BamBuddy reads there, a REST plug by the plug in BamBuddy. Pointed at another one in BamBuddy, the plug keeps its device and gets new "
        "entities — also for a Tasmota given a new IP address, which BamBuddy knows only by its address —; two plugs swapped in "
        "BamBuddy keep their devices and swap their entities, with their history. The switch-off after the print stays with its "
        "printer either way. Deleted in BamBuddy, or linked to no printer set up here, its device goes within a minute, and its "
        "entities with it — unless another plug switches the same device, which then takes them over. Entities that go keep their "
        "recorded history until the recorder purges it; their statistics are deleted once their entity ID has been unused for 10 days."
    ) in _README
    assert (
        "A smart plug's carry a short code made from what the plug switches — `switch.bambuddy_smart_plug_3f9a2c` (the plug "
        "itself), `sensor.bambuddy_smart_plug_3f9a2c_power`, `sensor.bambuddy_smart_plug_3f9a2c_energy_today` —: they stay when "
        "the plug is renamed or moved to another printer, and go with what it switches (see [Per smart plug](#per-smart-plug)); a "
        "second plug that switches the same device ends in `_2`."
    ) in _README
    assert (
        "and you can add those only it has. On another server the kept printers' smart plugs become new devices; a plug that uses "
        "the same Tasmota, Home Assistant entity or MQTT topic and path as before keeps its entity IDs and history."
    ) in _README
    assert "A smart plug's carry BamBuddy's number of the plug" not in _README


def test_the_readme_names_get_filaments() -> None:
    """Every response action has its row in the actions table."""
    row = next((line for line in _README.splitlines() if line.startswith("| `bambuddy.get_filaments` |")), None)
    assert row is not None
    assert row.count(" | ") == 2 and "`entity_id`" in row and "response only" in row


def test_the_readme_names_the_camera_modes_as_the_editor_does() -> None:
    """On a tap, always, never: the editor's three words."""
    assert "| `camera` | `tap`, `always`, `off` | `tap` | The live view: on a tap, always while the dashboard is open, or never (the job's picture then) |" in _README
