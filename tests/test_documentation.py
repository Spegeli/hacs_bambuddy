"""The user documentation: the pages under documentation/ and the short README
that leads to them. What a reader follows must lead somewhere, and what the
integration offers must stand where the reader looks it up."""
from __future__ import annotations

from collections import Counter
import json
from pathlib import Path
import re
from urllib.parse import quote, unquote

import yaml

from tests.helpers import DOCS, _github_anchor, all_pages, page

_ROOT = Path(__file__).parent.parent
_README = (_ROOT / "README.md").read_text(encoding="utf-8")
_INTEGRATION = _ROOT / "custom_components" / "bambuddy"

_OVERVIEW = "README.md"
_TOPICS = (
    "actions.md",
    "ams-and-filament.md",
    "automations.md",
    "chamber.md",
    "configuration.md",
    "dashboard-card.md",
    "entities.md",
    "glossary.md",
    "how-it-works.md",
    "printers.md",
    "smart-plugs.md",
    "spool-inventory.md",
    "troubleshooting.md",
    "updating.md",
)
_BACK_LINK = "[← Documentation](README.md)"

# Entity names no page writes as they stand, and why.
_NAMED_TOGETHER = {
    "Slot {slot}": "a placeholder: one row names a unit's slots, as many as it has",
    # One row names an H3C's nine inputs: "External 1 … 9".
    **{f"External {tool}": "one row names an H3C's nine inputs" for tool in range(2, 10)},
}


def _pages() -> dict[str, str]:
    """Every page: a test that walks them proves nothing while one is missing."""
    pages = all_pages()
    assert sorted(pages) == sorted((_OVERVIEW, *_TOPICS))
    return pages


def _without_blocks(text: str) -> str:
    """Markdown without its code blocks: a YAML comment is no heading."""
    return re.sub(r"```.*?```", "", text, flags=re.DOTALL)


def _prose(text: str) -> str:
    """Markdown without any code: a link shown as an example leads nowhere."""
    return re.sub(r"`[^`\n]*`", "", _without_blocks(text))


def _anchors(text: str) -> set[str]:
    """The anchors of a text's headings. A link inside a heading counts by
    its words, and GitHub numbers a heading that comes again: -1, -2."""
    seen: Counter[str] = Counter()
    anchors = set()
    for heading in re.findall(r"^#{1,6} (.+)$", _without_blocks(text), re.MULTILINE):
        anchor = _github_anchor(re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", heading))
        anchors.add(f"{anchor}-{seen[anchor]}" if seen[anchor] else anchor)
        seen[anchor] += 1
    return anchors


def _links(text: str) -> list[str]:
    """Where a text's Markdown links and HTML attributes lead."""
    prose = _prose(text)
    return re.findall(r"\]\(([^)\s]+)", prose) + re.findall(r'(?:href|src)="([^"]+)"', prose)


def _is_address(link: str) -> bool:
    """A link with a scheme: it leaves the repository."""
    return re.match(r"[a-z][a-z0-9+.-]*:", link) is not None


def _dead_end(source: Path, link: str) -> str | None:
    """What is wrong with a link from the file `source`: a file that is not
    there, or a section its target lacks; None for a link that leads there."""
    path, _, anchor = link.partition("#")
    target = (source.parent / path).resolve() if path else source
    if not target.exists():
        return f"{source.name}: {link}: no such file"
    if anchor and quote(unquote(anchor), safe="-_") not in _anchors(target.read_text(encoding="utf-8")):
        return f"{source.name}: {link}: no such section"
    return None


# --- The pages -------------------------------------------------------------------


def test_the_pages_exist() -> None:
    """The overview and the fourteen pages it lists."""
    assert sorted(path.name for path in DOCS.glob("*.md")) == sorted((_OVERVIEW, *_TOPICS))


def test_every_page_has_its_title_purpose_and_back_link() -> None:
    """A reader who lands on a page from a search sees at once what it is,
    what it is for and the way to the overview. The title is the file name's
    words, so a link's target can be told from the page."""
    pages = _pages()
    assert pages[_OVERVIEW].startswith("# ")
    assert _BACK_LINK not in pages[_OVERVIEW]
    for name in _TOPICS:
        title, gap, purpose, other_gap, back = pages[name].splitlines()[:5]
        assert title.removeprefix("# ").lower() == name.removesuffix(".md").replace("-", " "), name
        assert title.startswith("# ") and not gap and not other_gap, name
        assert purpose and not purpose.startswith(("#", "[", "|", "-")), name
        assert back == _BACK_LINK, name


def test_no_fold_in_the_pages() -> None:
    """The pages exist so that nothing needs hiding, and a browser's search
    does not find what a closed fold holds."""
    assert [name for name, text in _pages().items() if "<details" in text] == []


def test_every_page_ends_with_its_see_also() -> None:
    """One page end everywhere: a section of at most three links, and nothing
    after it."""
    for name, text in _pages().items():
        assert "**See also:**" not in text, name
        body, _, end = text.rpartition("\n## See also\n\n")
        assert body, name
        lines = end.splitlines()
        assert 1 <= len(lines) <= 3, name
        assert all(line.startswith("- [") for line in lines), (name, lines)


def test_the_contents_line_has_one_name() -> None:
    """A long page opens with its sections, under one name on every page."""
    assert [name for name, text in _pages().items() if "**Contents:**" in text] == []


def test_every_relative_link_and_anchor_in_the_pages_exists() -> None:
    """A renamed heading breaks every link to it without a warning on
    GitHub, and the pages link each other all the time."""
    dead = [
        _dead_end(DOCS / name, link)
        for name, text in _pages().items()
        for link in _links(text)
        if not _is_address(link)
    ]
    assert [problem for problem in dead if problem] == []


def test_the_pages_images_exist_and_have_alt_texts() -> None:
    """A page's picture is a file of the repository, by a relative path, and
    says in words what it shows."""
    for name, text in _pages().items():
        prose = _prose(text)
        pictures = re.findall(r"!\[([^\]]*)\]\(([^)\s]+)", prose)
        for tag in re.findall(r"<img ([^>]*)>", prose):
            source = re.search(r'src="([^"]*)"', tag)
            alt = re.search(r'alt="([^"]*)"', tag)
            pictures.append((alt.group(1) if alt else "", source.group(1) if source else ""))
        for alt, source in pictures:
            assert alt.strip(), (name, source)
            assert (DOCS / source).is_file(), (name, source)


def test_every_action_has_its_heading() -> None:
    """Each action of services.yaml has its section to link to, and no
    section names an action that is gone."""
    actions = yaml.safe_load((_INTEGRATION / "services.yaml").read_text(encoding="utf-8"))
    headings = re.findall(r"^### `bambuddy\.(\w+)`$", _without_blocks(page("actions.md")), re.MULTILINE)
    assert sorted(headings) == sorted(actions)


def test_every_entity_name_stands_in_the_entities_page() -> None:
    """A reader looks an entity up by the name on the screen, so the page
    writes every name out, also those a model has alone: which model has
    which is told in printers.md."""
    strings = json.loads((_INTEGRATION / "strings.json").read_text(encoding="utf-8"))
    names = {
        entity["name"]
        for platform in strings["entity"].values()
        for entity in platform.values()
        if "name" in entity
    }
    assert set(_NAMED_TOGETHER) <= names
    text = page("entities.md")
    assert sorted(name for name in names - set(_NAMED_TOGETHER) if name not in text) == []


# --- What the pages took over from the README -------------------------------------


def test_the_switch_off_trigger_fires_once() -> None:
    """A state trigger on the switch-off's `phase` "to done" alone fires
    again at every reload of the entry while it is done (the restored state
    comes from one without attributes): the page's trigger names `from`."""
    assert "`phase` from `waiting` to `done`" in page("smart-plugs.md")


def test_the_read_only_advice_stays_gone() -> None:
    """A key lacking a permission is refused, so nothing may tell of a
    read-only mode, of any key that works, or of the forms before: AMS IDs by
    place, plug IDs by BamBuddy's number."""
    texts = {"README.md (root)": _README, **_pages()}
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
        "_ams_a_humidity",
        "A smart plug's carry BamBuddy's number of the plug",
    ):
        assert [name for name, text in texts.items() if gone in text] == [], gone


def test_a_refused_key_is_explained() -> None:
    """What to check first where a key is refused, and the owner given the
    right back: the stored key checked again."""
    assert "Check that you pasted all of it" in page("troubleshooting.md")
    assert "leave the dialog's field empty to check the stored key at once" in page("configuration.md")


def test_ams_entity_ids_name_the_unit() -> None:
    """AMS entity IDs carry the unit's model and serial; the AMS Lite's the
    printer's serial and its letter until BamBuddy reports its own (#3348),
    then a notice lists the renamed IDs."""
    entities, filament = page("entities.md"), page("ams-and-filament.md")
    assert "sensor.ams_2_pro_19c06a000000001_humidity" in entities
    assert "| AMS Lite, for now | `ams_lite_<printer serial>_<letter>_<key>` | `sensor.ams_lite_0309da000000002_a_slot_1` |" in entities
    assert "maziggy/bambuddy/issues/3348" in entities
    assert "the plain entity IDs; otherwise they end in `_2`" in filament
    # A replacement AMS Lite without a serial stays the same device.
    assert "an AMS Lite stays the same device while BamBuddy reports no serial" in filament
    # Known limitations: the AMS Lite until BamBuddy reports its serial.
    limitations = page("troubleshooting.md")
    assert "**AMS Lite without its serial number:**" in limitations
    assert "maziggy/bambuddy/issues/3348" in limitations
    # The example names the unit by its device, which follows its place.
    assert "device_attr(trigger.entity_id, 'name')" in page("automations.md")
    assert "sensor.ams_2_pro_19c06a000000001_humidity" in page("automations.md")


def test_the_pages_say_how_plugs_are_known() -> None:
    """A plug's entities belong to what it switches, its device to BamBuddy's plug."""
    plugs = page("smart-plugs.md")
    for line in (
        "Its entities belong to what it switches:",
        "| Tasmota | Its IP address |",
        "| Home Assistant | Its entity |",
        "| MQTT | Its topic and the path BamBuddy reads there |",
        "| REST | The plug in BamBuddy |",
        "**A Tasmota plug is known by its IP address,** the only thing BamBuddy knows it by. If that address changes, for example through DHCP, "
        "the plug gets new entities and entity IDs, and its device stays. So give it a fixed address.",
        "- **Pointed at another device:** the plug keeps its device and gets new entities.",
        "- **Two plugs swapped:** they keep their devices and swap their entities, with their history.",
        "- **Deleted, or linked to no printer set up here:** its device goes within a minute, and its entities with it, unless "
        "another plug switches the same device. That plug then takes them over.",
        "The switch-off after the print stays with its printer either way.",
        "Entities that go keep their recorded history until the recorder purges it. Their statistics are deleted once their "
        "entity ID has been unused for 10 days.",
    ):
        assert line in plugs, line
    entities = page("entities.md")
    for line in (
        "| Smart plug itself | `bambuddy_smart_plug_<code>` | `switch.bambuddy_smart_plug_3f9a2c` |",
        "| Smart plug's other entities | `bambuddy_smart_plug_<code>_<key>` | `sensor.bambuddy_smart_plug_3f9a2c_power` |",
        "- **A smart plug's** code is made from what the plug switches. Its IDs stay when the plug is renamed or moved to another "
        "printer, and go with what it switches ([Smart plugs](#smart-plugs)).",
        "- **A Tasmota plug's** code comes from its IP address: if that changes, the plug gets new entities and entity IDs.",
        "- **A second plug** that switches the same device ends in `_2`.",
    ):
        assert line in entities, line
    configuration = page("configuration.md")
    for line in (
        "| Smart plugs of the kept printers | Stay | Become new devices, see below |",
        "- A plug that uses the same Tasmota, Home Assistant entity or MQTT topic and path as before keeps its entity IDs and history.",
    ):
        assert line in configuration, line


def test_a_date_version_is_told_the_one_way_up() -> None:
    """The Marketplace compares versions: `v2.1.0` ranks below a date, and
    only `v2.0.0_redesign`, which it cannot compare, is offered. Once a newer
    stable is out, a date version gets no update and has to pick one."""
    updating = page("updating.md")
    assert "`v2.1.0` compares below `2026.05.17`" in updating
    assert "**Install another version** is the one way" in updating
    assert "(https://www.home-assistant.io/integrations/marketplace/)" in updating
    assert "in our test" not in updating


def _action_rows() -> dict[str, str]:
    text = page("actions.md")
    return {line.split(" | ")[0]: line for line in text.splitlines() if line.startswith("| `bambuddy.")}


def test_every_response_action_has_its_row() -> None:
    """A response action says so in its row of the summary table: a reader
    has to ask for the response."""
    rows = _action_rows()
    for action in ("get_filaments", "get_spools"):
        row = rows[f"| `bambuddy.{action}`"]
        assert row.count(" | ") == 2 and "`entity_id`" in row and "response only" in row, action


def test_the_inventory_actions_have_their_rows() -> None:
    """The spool inventory's three actions, and the attributes they go with."""
    rows = _action_rows()
    for action in ("assign_spool", "unassign_spool", "get_spools"):
        assert f"| `bambuddy.{action}`" in rows, action
    assert "`spool_id`" in rows["| `bambuddy.assign_spool`"]
    assert "`inventory_spool`" in page("entities.md") and "`inventory_assignable`" in page("entities.md")


def test_the_card_page_names_the_camera_modes_as_the_editor_does() -> None:
    """On a tap of its camera button, always, never: the editor's three words."""
    assert (
        "| `camera` | `tap`, `always`, `off` | `tap` | The live view: on a tap of its camera button, always while the dashboard "
        "is open, or never (the job's cover image then) |"
    ) in page("dashboard-card.md")


# --- The README ------------------------------------------------------------------


def test_the_four_anchors_stay() -> None:
    """Links out of our reach lead here: released cards to the card's
    section, the live forum and Reddit posts to the upgrade, released issue
    forms to the troubleshooting and the API key."""
    assert {
        "-dashboard-card",
        "%EF%B8%8F-upgrading-from-a-date-version",
        "-troubleshooting",
        "create-an-api-key",
    } <= _anchors(_README)


def test_the_readmes_links_to_pages_exist() -> None:
    """The Marketplace shows the README away from the repository, so it
    links absolutely, to `main`. Each such address finds its file and its
    section here, and the README leads to the pages."""
    links = _links(_README)
    assert [link for link in links if not link.startswith("#") and not _is_address(link)] == []
    pages = [
        link.removeprefix("https://github.com/Spegeli/hacs_bambuddy/blob/main/")
        for link in links
        if link.startswith("https://github.com/Spegeli/hacs_bambuddy/blob/main/")
    ]
    assert len([link for link in pages if link.startswith("documentation/")]) >= 10
    dead = [_dead_end(_ROOT / "README.md", link) for link in pages]
    assert [problem for problem in dead if problem] == []


def test_the_readme_stays_short() -> None:
    """A reader skims: the README tells what the integration does and how to
    start, and the pages tell the rest."""
    assert len(_README.split()) <= 2300


def test_the_contributor_texts_link_to_what_exists() -> None:
    """CONTRIBUTING sends beta testers to the updating page and contributors
    to the API key: a link that leads nowhere fails without a sound."""
    source = _ROOT / "CONTRIBUTING.md"
    links = [
        link
        for link in _links(source.read_text(encoding="utf-8"))
        if link.startswith(("documentation/", "README.md"))
    ]
    assert "documentation/updating.md#beta-versions" in links
    dead = [_dead_end(source, link) for link in links]
    assert [problem for problem in dead if problem] == []


def test_bambuddy_1_3_0_is_named_as_released() -> None:
    """BamBuddy 1.3.0 is a stable release since 2026-11-07: no page waits for
    its betas any more."""
    for name, text in {"README.md (root)": _README, **_pages()}.items():
        assert "1.3.0 betas" not in text, name
        assert not re.search(r"BamBuddy 1\.3(?![.\d])", text), name


def test_the_switch_off_entities_carry_the_printers_ids() -> None:
    """The switch-off after the print belongs to the printer: its entity IDs
    are the printer's form, not the plug's."""
    entities = page("entities.md")
    assert "| Switch-off after the print | `<model>_<serial>_<key>`, as the printer's | `switch.x1c_00m00a000000001_auto_off` |" in entities
