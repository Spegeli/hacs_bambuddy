"""The dashboard card: served by the integration, added to every dashboard,
once per run, and never at the entities' expense."""
from __future__ import annotations

from pathlib import Path
import re
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from homeassistant.core import HomeAssistant

from custom_components.bambuddy import cards
from custom_components.bambuddy.cards import CARD_FILE, CARD_URL, async_register_card, card_digest

from tests.conftest import X1C, set_up


def _frontend(hass: HomeAssistant) -> Mock:
    """A Home Assistant with its frontend loaded: the test environment has
    no frontend package."""
    hass.config.components.add("frontend")
    http = Mock()
    http.async_register_static_paths = AsyncMock()
    hass.http = http
    return http


async def test_the_card_is_served_and_added(hass: HomeAssistant, tmp_path: Path) -> None:
    http = _frontend(hass)
    bundle = tmp_path / "bambuddy-card.js"
    bundle.write_text("customElements.define('bambuddy-printer-card', class {});", encoding="utf-8")

    with patch.object(cards, "CARD_FILE", bundle), patch.object(cards, "add_extra_js_url") as add:
        await async_register_card(hass)

    [[configs], _] = http.async_register_static_paths.call_args
    assert (configs[0].url_path, configs[0].path, configs[0].cache_headers) == (CARD_URL, str(bundle), True)
    add.assert_called_once_with(hass, f"{CARD_URL}?v={card_digest(bundle)}")


def test_the_digest_follows_the_content(tmp_path: Path) -> None:
    """A browser holding an older bundle loads the new one after an update."""
    bundle = tmp_path / "card.js"
    bundle.write_text("one", encoding="utf-8")
    first = card_digest(bundle)
    bundle.write_text("two", encoding="utf-8")

    assert card_digest(bundle) != first
    assert len(first) == 12


async def test_a_missing_bundle_costs_only_the_card(
    hass: HomeAssistant, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    _frontend(hass)

    with patch.object(cards, "CARD_FILE", tmp_path / "missing.js"), patch.object(cards, "add_extra_js_url") as add:
        await async_register_card(hass)

    add.assert_not_called()
    assert "The dashboard card is not available" in caplog.text


async def test_the_card_is_registered_once(hass: HomeAssistant, bambuddy_api: SimpleNamespace) -> None:
    """Entries and reloads come and go; the integration's setup runs once."""
    with patch.object(cards, "async_register_card", AsyncMock()) as register, patch(
        "custom_components.bambuddy.async_register_card", register
    ):
        entry = await set_up(hass, X1C)
        await hass.config_entries.async_reload(entry.entry_id)
        await hass.async_block_till_done()

    register.assert_awaited_once()


def test_the_bundle_ships_inside_the_integration() -> None:
    """HACS installs only custom_components/bambuddy."""
    assert CARD_FILE.parent.parent.name == "bambuddy"
    assert CARD_FILE.name == "bambuddy-card.js"


def test_the_readme_documents_what_the_bundle_takes() -> None:
    """The README's card options are the options the card reads, and the
    card's documentation link finds the README's section: both are an
    interface for the users' dashboards."""
    readme = (Path(__file__).parent.parent / "README.md").read_text(encoding="utf-8")
    section = readme.split("## 🃏 Dashboard card", 1)[1].split("\n## ", 1)[0]
    options = re.findall(r"^\| `(\w+)` \|", section, flags=re.MULTILINE)
    bundle = CARD_FILE.read_text(encoding="utf-8")

    forms = (Path(__file__).parent.parent / "cards" / "src" / "forms.ts").read_text(encoding="utf-8")
    declared = re.search(r"const OPTIONS: Record<string, Validator> = \{(.*?)\n\};", forms, flags=re.DOTALL)
    assert declared
    assert options == re.findall(r"^  (\w+):", declared.group(1), flags=re.MULTILINE)
    assert len(options) == 13
    for option in options:
        assert option in bundle, option
    assert "bambuddy-printer-card" in bundle
    assert "custom:bambuddy-printer-card" in section
    assert "#-dashboard-card" in bundle
