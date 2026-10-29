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


def test_the_bug_form_asks_whether_bambuddys_authentication_is_on() -> None:
    """The key's permissions are no question any more: the integration takes
    only a key with all three."""
    fields = _fields("bug_report.yml")
    assert "key_permissions" not in fields
    auth = fields["bambuddy_auth"]
    assert auth["type"] == "dropdown"
    assert auth["attributes"]["label"] == "Authentication in BamBuddy"
    assert auth["attributes"]["options"] == ["On", "Off", "Not sure"]


def test_questions_go_to_the_integrations_forum_thread() -> None:
    """A "How do I …?" is no bug: the chooser sends it to the integration's
    own thread in the Home Assistant Community Forum, before the general
    forum (as hacs_bitpanda does)."""
    links = yaml.safe_load((_FORMS / "config.yml").read_text(encoding="utf-8"))["contact_links"]
    urls = [link["url"] for link in links]
    thread = "https://community.home-assistant.io/t/1029750"
    assert thread in urls
    assert urls.index(thread) < urls.index("https://community.home-assistant.io")
    question = next(link for link in links if link["url"] == thread)
    assert question["name"] == "Questions about this integration"
