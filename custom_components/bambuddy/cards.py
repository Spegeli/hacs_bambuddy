"""The dashboard card: one built module, served by the integration and added
to every dashboard.

HACS installs only this folder, so the bundle built from cards/ ships in
frontend/ (CONTRIBUTING.md, "Dashboard card"). Its URL carries a hash of
the file's content: a browser that still holds an older bundle loads the new
one after an update instead of failing on "Custom element doesn't exist". A
module added while a dashboard is open appears there after a browser reload;
Home Assistant writes the list into the page when it loads.
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
# Defined in components.http at 2025.5; at 2026.10 in components.http.server,
# and still offered here without being re-exported, which mypy flags;
# helpers.http has none. Only this path works on every release from the
# minimum on.
from homeassistant.components.http import StaticPathConfig  # type: ignore[attr-defined]
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

CARD_FILE = Path(__file__).parent / "frontend" / "bambuddy-card.js"
CARD_URL = "/bambuddy_static/bambuddy-card.js"


def card_digest(path: Path) -> str:
    """The first 12 hex digits of the SHA-256 of the file's bytes."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


async def async_register_card(hass: HomeAssistant) -> None:
    """Serve the bundle and add it to every dashboard. Called once per run,
    from async_setup, however many entries are set up or reloaded. A failure
    costs the card only: the entities set up all the same. So does a Home
    Assistant without its frontend, an after-dependency: set up before the
    integration when it is configured at all."""
    if "frontend" not in hass.config.components:
        _LOGGER.warning("The dashboard card is not available: Home Assistant's frontend is not loaded")
        return
    try:
        digest = await hass.async_add_executor_job(card_digest, CARD_FILE)
        await hass.http.async_register_static_paths([StaticPathConfig(CARD_URL, str(CARD_FILE), True)])
    except Exception as err:  # noqa: BLE001 - the card is extra; the entities are not
        _LOGGER.warning("The dashboard card is not available: %s", err)
        return
    add_extra_js_url(hass, f"{CARD_URL}?v={digest}")
