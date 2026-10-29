"""Packaging facts: the manifest leaves Home Assistant's own requirements to
Home Assistant."""
from __future__ import annotations

import importlib.metadata
import json
from pathlib import Path
from typing import Any

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

_ROOT = Path(__file__).parent.parent


def _json(path: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((_ROOT / path).read_text(encoding="utf-8"))
    return data


def test_manifest_requires_nothing_home_assistant_ships_itself():
    """Home Assistant installs a custom integration's requirements into its
    own environment, so one that Home Assistant depends on itself could
    clash with the version it needs: hassfest refuses it from 2026.10 on.
    aiohttp, which api.py uses, comes with every Home Assistant."""
    manifest = _json("custom_components/bambuddy/manifest.json")
    ships = {
        canonicalize_name(Requirement(requirement).name)
        for requirement in importlib.metadata.requires("homeassistant") or []
    }
    assert ships
    assert [
        requirement
        for requirement in manifest["requirements"]
        if canonicalize_name(Requirement(requirement).name) in ships
    ] == []


def test_the_manifest_says_push() -> None:
    """Most of what users see comes by BamBuddy's live connection now: Home
    Assistant shows the integration as pushed to, not polling."""
    assert _json("custom_components/bambuddy/manifest.json")["iot_class"] == "local_push"
