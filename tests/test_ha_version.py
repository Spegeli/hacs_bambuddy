"""Unit tests for `.github/scripts/ha_version.py` -- which Home Assistant
release CI tests, types and runs hassfest against: the newest stable one
that pytest-homeassistant-custom-component has been released for
(CONTRIBUTING.md, "Continuous integration"). Imported by path, like the
release script: `.github/scripts` is not a package.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
from types import ModuleType

import pytest

_SCRIPT = Path(__file__).parents[1] / ".github" / "scripts" / "ha_version.py"


def _load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("ha_version_script", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ha_version = _load_script()


def test_the_newest_stable_release_wins_over_newer_betas():
    pins = {"0.13.368": "2026.10.0b1", "0.13.367": "2026.9.4", "0.13.366": "2026.9.3"}
    assert ha_version.newest_stable(list(pins), pins.get) == ("2026.9.4", "0.13.367")


def test_a_new_monthly_release_wins_over_a_later_patch_of_the_month_before():
    pins = {"0.13.371": "2026.9.5", "0.13.370": "2026.10.0", "0.13.369": "2026.10.0b9"}
    assert ha_version.newest_stable(list(pins), pins.get) == ("2026.10.0", "0.13.370")


def test_release_candidates_and_dev_builds_never_count():
    pins = {
        "0.13.380": "2026.11.0rc1",
        "0.13.379": "2026.11.0.dev20261020",
        "0.13.378": "2026.10.2",
    }
    assert ha_version.newest_stable(list(pins), pins.get) == ("2026.10.2", "0.13.378")


def test_versions_sort_by_number_not_by_text():
    pins = {"0.13.99": "2026.1.0", "0.13.100": "2026.2.0"}
    assert ha_version.newest_stable(list(pins), pins.get) == ("2026.2.0", "0.13.100")


def test_two_package_releases_for_one_home_assistant_take_the_newer():
    pins = {"0.13.367": "2026.9.4", "0.13.368": "2026.9.4"}
    assert ha_version.newest_stable(list(pins), pins.get) == ("2026.9.4", "0.13.368")


def test_a_package_release_without_a_pin_is_passed_over():
    pins = {"0.13.368": None, "0.13.367": "2026.9.4"}
    assert ha_version.newest_stable(list(pins), pins.get) == ("2026.9.4", "0.13.367")


def test_only_the_newest_candidates_are_read():
    """Each candidate costs a request; the package has hundreds of releases."""
    releases = [f"0.13.{number}" for number in range(300, 340)]
    read: list[str] = []

    def pin_of(release: str) -> str:
        read.append(release)
        return "2026.9.4"

    ha_version.newest_stable(releases, pin_of)
    assert sorted(read, key=ha_version.version_key) == releases[-ha_version.CANDIDATES:]


def test_no_stable_release_among_the_candidates_stops_with_a_message():
    pins = {"0.13.2": "2026.10.0b1"}
    with pytest.raises(SystemExit, match="No stable Home Assistant"):
        ha_version.newest_stable(list(pins), pins.get)


def test_the_pin_is_read_from_the_requirements():
    requires = ["pytest==9.0.3", "homeassistant==2026.9.4", "sqlalchemy==2.0.43"]
    assert ha_version.pinned_home_assistant(requires) == "2026.9.4"
    assert ha_version.pinned_home_assistant(["pytest==9.0.3"]) is None
    assert ha_version.pinned_home_assistant(["homeassistant-stubs==2026.9.4"]) is None


def test_the_releases_leave_out_yanked_empty_and_unusual_versions(monkeypatch):
    listing = {
        "releases": {
            "0.13.367": [{"yanked": False}],
            "0.13.366": [{"yanked": True}],
            "0.13.365": [],
            "0.13.364rc1": [{"yanked": False}],
        }
    }
    monkeypatch.setattr(ha_version, "_get", lambda url: listing)
    assert ha_version._releases() == ["0.13.367"]


def test_a_package_release_names_its_pin_through_its_requirements(monkeypatch):
    answers = {
        "0.13.367": {"info": {"requires_dist": ["homeassistant==2026.9.4"]}},
        "0.13.1": {"info": {"requires_dist": None}},
    }
    monkeypatch.setattr(ha_version, "_get", lambda url: answers[url.rsplit("/", 2)[-2]])
    assert ha_version._pin_of("0.13.367") == "2026.9.4"
    assert ha_version._pin_of("0.13.1") is None


def test_the_output_names_both_as_github_actions_reads_them(monkeypatch, capsys):
    monkeypatch.setattr(ha_version, "_releases", lambda: ["0.13.367"])
    monkeypatch.setattr(ha_version, "_pin_of", {"0.13.367": "2026.9.4"}.get)
    assert ha_version.main([]) == 0
    output = capsys.readouterr()
    assert output.out == "home_assistant=2026.9.4\nplugin=0.13.367\n"
    assert "2026.9.4" in output.err
    assert ha_version.main(["--plugin"]) == 0
    assert capsys.readouterr().out == "0.13.367\n"
