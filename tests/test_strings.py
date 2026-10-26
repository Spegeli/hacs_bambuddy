"""The string files: structurally identical, BOM-free, and every translation
true to its English original in what it must carry over unchanged."""
from __future__ import annotations

import json
import re
from typing import Any

from tests.conftest import INTEGRATION, placeholders

# Every language file under translations/, found the way the integration
# itself finds them (language.async_shipped_languages): a new one is guarded by
# every test below as soon as it exists.
_LANGUAGES = sorted(path.stem for path in (INTEGRATION / "translations").glob("*.json"))
_FILES = ("strings.json", *(f"translations/{language}.json" for language in _LANGUAGES))


def _load(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((INTEGRATION / name).read_text(encoding="utf-8"))
    return data


def _paths(node: Any, prefix: str = "") -> set[str]:
    if not isinstance(node, dict):
        return set()
    out: set[str] = set()
    for key, value in node.items():
        out.add(prefix + key)
        out |= _paths(value, f"{prefix}{key}.")
    return out


def _texts(node: Any, prefix: str = "") -> dict[str, str]:
    """Every string of a strings file, by its dotted key."""
    if isinstance(node, str):
        return {prefix[:-1]: node}
    out: dict[str, str] = {}
    for key, value in node.items():
        out |= _texts(value, f"{prefix}{key}.")
    return out


def test_the_shipped_languages():
    assert _LANGUAGES == ["de", "en"]


def test_string_files_have_no_bom():
    for name in _FILES:
        assert not (INTEGRATION / name).read_bytes().startswith(b"\xef\xbb\xbf"), name


def test_string_files_share_one_structure():
    reference = _paths(_load("strings.json"))
    for name in _FILES:
        structure = _paths(_load(name))
        assert structure == reference, (
            name, sorted(reference - structure), sorted(structure - reference)
        )


def test_every_string_has_the_placeholders_of_its_english_original():
    """Home Assistant discards a translated string whose placeholders differ
    from the English one and shows English instead; and a value only appears
    where its placeholder is."""
    english = _texts(_load("strings.json"))
    for name in _FILES:
        for key, text in _texts(_load(name)).items():
            assert placeholders(text) == placeholders(english[key]), (name, key)


def test_the_switch_summary_names_its_button():
    """It says which button applies the switch: by the button's own label."""
    for name in _FILES:
        steps = _load(name)["config"]["step"]
        for step in ("confirm_same", "confirm_other"):
            assert steps[step]["submit"] in steps[step]["description"], (name, step)


def test_no_apostrophe_directly_precedes_a_placeholder():
    """The frontend formats strings as ICU messages, where an apostrophe right
    before a brace opens literal text: "l'{asset}" would show "{asset}"
    itself and swallow the text up to the next apostrophe. Easily written in
    French or Italian -- write around it."""
    for name in _FILES:
        for key, text in _texts(_load(name)).items():
            assert "'{" not in text, (name, key)


_LINK_TARGET = re.compile(r"\]\(([^)]*)\)")


def test_every_link_keeps_its_english_target():
    english = _texts(_load("strings.json"))
    for name in _FILES:
        for key, text in _texts(_load(name)).items():
            assert _LINK_TARGET.findall(text) == _LINK_TARGET.findall(english[key]), (
                name, key
            )


# hassfest's pattern for a URL in a text (script/hassfest/translations.py,
# RE_URL, in 2026.9): it refuses a strings file that has one. A link target
# comes in as a placeholder the code fills in.
_URL = re.compile(
    r"(((ftp|ftps|scp|http|https|mqtt|mqtts|socket|socks5):\/\/|www\.)"
    r"[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?)",
    re.IGNORECASE,
)


def test_no_string_contains_a_url():
    for name in _FILES:
        for key, text in _texts(_load(name)).items():
            assert not _URL.search(text), (name, key)


def test_no_language_is_an_untranslated_copy_of_english():
    """Codes, product names and a few loanwords ("Port", "BamBuddy") may
    read the same in every language. A sentence never does, and most
    strings must differ."""
    english = _texts(_load("strings.json"))
    for language in _LANGUAGES:
        if language == "en":
            continue
        texts = _texts(_load(f"translations/{language}.json"))
        same = sorted(key for key, text in texts.items() if text == english[key])
        sentences = [key for key in same if len(english[key].split()) >= 4]
        assert sentences == [], (language, sentences)
        assert len(same) * 5 <= len(texts), (language, same)


def test_english_translation_is_the_strings_file():
    strings = _load("strings.json")
    english = _load("translations/en.json")
    assert strings == english


# The ways the modules name an exception's text: an error raised with
# translation_domain=DOMAIN and its key, an action's refusal
# (services._refuse), and a command's refusal (entity.async_run_command).
_RAISED = (
    re.compile(r'translation_domain=DOMAIN,\s*translation_key="([a-z0-9_]+)"'),
    re.compile(r'refuse\(\s*"([a-z0-9_]+)"'),
    re.compile(r'refusal(?::\s*str\s*)?=\s*"([a-z0-9_]+)"'),
    # The key guard's answer to a refused request (key._error).
    re.compile(r'_error\(\s*"([a-z0-9_]+)"'),
    # A button's refusal by the printer's state: both of its texts.
    re.compile(r'refusal_fn=lambda data: "([a-z0-9_]+)" if [^\n]* else "([a-z0-9_]+)"'),
)


def test_every_exception_text_is_one_the_code_raises():
    """An exception the code raises without a text shows its bare key; a
    text no code raises is dead."""
    raised = {
        key
        for module in INTEGRATION.glob("*.py")
        for pattern in _RAISED
        for found in pattern.findall(module.read_text(encoding="utf-8"))
        for key in ((found,) if isinstance(found, str) else found)
    }
    assert raised
    assert raised == set(_load("strings.json")["exceptions"])


def test_every_error_the_flows_set_has_a_text() -> None:
    """A key without a text shows raw in the form."""
    source = (INTEGRATION / "config_flow.py").read_text(encoding="utf-8")
    errors = set(re.findall(r'\{"base": "(\w+)"\}', source)) | set(re.findall(r'\{CONF_URL: "(\w+)"\}', source))
    reasons = set(re.findall(r'async_abort\(reason="(\w+)"', source))
    strings = _load("strings.json")
    assert errors and reasons
    assert errors <= set(strings["config"]["error"]), errors - set(strings["config"]["error"])
    known = set(strings["config"]["abort"]) | set(strings["options"]["abort"])
    assert reasons <= known, reasons - known


def test_configure_is_named_as_every_supported_version_shows_it():
    """Home Assistant 2025.5 shows "Configure" as a button with its name;
    only later versions draw a gear: the texts name it, never the gear."""
    for name in _FILES:
        for key, text in _texts(_load(name)).items():
            assert not re.search(r"\bgear\b|Zahnrad", text), (name, key)
    readme = (INTEGRATION.parent.parent / "README.md").read_text(encoding="utf-8")
    assert "choose **Configure** (⚙)" not in readme


# The switch to another server says what becomes of the kept printers' plugs (words as approved).
_PLUGS_ON_ANOTHER_SERVER = {
    "en": (
        "The printers under “Kept” keep theirs.",
        "**Smart plugs** of the printers under “Kept” come from the new server, each as a new device: an area or name you gave a "
        "plug device starts afresh. A plug that uses the same Tasmota, Home Assistant entity or MQTT topic as before keeps its entity "
        "IDs and history; the others get new ones. Plugs the new server does not have for them are removed.",
        "**Kept:**",
    ),
    "de": (
        "Der Verlauf der Drucker unter „Behalten“ bleibt.",
        "**Steckdosen** der Drucker unter „Behalten“ kommen vom neuen Server, jede als neues Gerät: Bereich und Name, die du "
        "einem Steckdosen-Gerät gegeben hast, beginnen neu. Eine Steckdose, die dieselbe Tasmota, Home-Assistant-Entität oder "
        "dasselbe MQTT-Topic nutzt wie bisher, behält ihre Entitäts-IDs und ihren Verlauf; die anderen bekommen neue. "
        "Steckdosen, die der neue Server für sie nicht hat, werden entfernt.",
        "**Behalten:**",
    ),
}


def test_the_switch_to_another_server_names_the_plugs() -> None:
    """A paragraph of its own, after the server's history and before the lists."""
    for name, language in (("strings.json", "en"), ("translations/en.json", "en"), ("translations/de.json", "de")):
        before, paragraph, after = _PLUGS_ON_ANOTHER_SERVER[language]
        description = _load(name)["config"]["step"]["confirm_other"]["description"]
        assert f"{before}\n\n{paragraph}\n\n{after}" in description, name
        assert paragraph not in _load(name)["config"]["step"]["confirm_same"]["description"], name


_NAMES_LAST = {
    "en": "Rename the printer or its AMS units in BamBuddy instead: Home Assistant follows within a minute (an AMS unit without a name of its own in BamBuddy is named after its printer and its place).",
    "de": "Benenne den Drucker oder seine AMS-Einheiten stattdessen in BamBuddy um: Home Assistant übernimmt die Namen innerhalb einer Minute (eine AMS-Einheit ohne eigenen Namen in BamBuddy heißt nach ihrem Drucker und ihrem Platz).",
}


def test_the_names_notice_names_the_ams_units_too() -> None:
    """An AMS unit is named in BamBuddy too: the notice says where."""
    for name, language in (("strings.json", "en"), ("translations/en.json", "en"), ("translations/de.json", "de")):
        description = _load(name)["issues"]["names_from_bambuddy"]["description"]
        assert description.endswith("\n\n" + _NAMES_LAST[language]), name
