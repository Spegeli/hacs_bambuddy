"""The schema of a form, for the config flow and the repairs alike."""
from __future__ import annotations

from typing import Any

import voluptuous as vol


def form_schema(fields: dict[Any, Any]) -> Any:
    """The schema of a form. Home Assistant 2026.10 types form schemas as
    probatio schemas; the voluptuous ones built here work the same from
    2025.5 on, hence `Any`: the one place that says so."""
    return vol.Schema(fields)
