"""The security policy: a vulnerability is reported privately.

GitHub's form for a private report is the one way in. The policy, the
contributor guide and the issue chooser all lead to it, none of them to a
public issue.
"""
from __future__ import annotations

from pathlib import Path

import yaml

_ROOT = Path(__file__).parent.parent
_PRIVATE_REPORT = "https://github.com/Spegeli/hacs_bambuddy/security/advisories/new"


def _read(name: str) -> str:
    return (_ROOT / name).read_text(encoding="utf-8")


def test_the_security_policy_sends_reports_to_the_private_form():
    policy = _read("SECURITY.md")
    assert f"({_PRIVATE_REPORT})" in policy
    assert "/issues" not in policy


def test_contributing_points_to_the_security_policy():
    assert "(SECURITY.md)" in _read("CONTRIBUTING.md")


def test_the_issue_chooser_offers_the_private_report():
    """GitHub's chooser showed no way to report a vulnerability privately,
    although private vulnerability reporting is enabled: a contact link
    offers it."""
    config = yaml.safe_load(_read(".github/ISSUE_TEMPLATE/config.yml"))
    assert _PRIVATE_REPORT in [link["url"] for link in config["contact_links"]]
