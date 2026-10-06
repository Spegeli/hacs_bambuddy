"""The issue forms ask for what a report needs.

GitHub reads the forms from `main` only: a change here reaches reporters
with the next stable release.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

_FORMS = Path(__file__).parent.parent / ".github" / "ISSUE_TEMPLATE"


def _fields(form: str) -> dict[str, dict[str, Any]]:
    """A form's fields by id, in the form's order."""
    body = yaml.safe_load((_FORMS / form).read_text(encoding="utf-8"))["body"]
    return {field["id"]: field for field in body if "id" in field}


def test_the_bug_report_asks_for_the_three_versions():
    """Which integration, which Home Assistant, which BamBuddy: without all
    three a report cannot be reproduced -- BamBuddy's API changes between
    its releases."""
    fields = _fields("bug_report.yml")
    for version in ("integration_version", "ha_version", "bambuddy_version"):
        assert fields[version]["validations"]["required"] is True, version
