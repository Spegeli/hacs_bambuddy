"""Find the Home Assistant release CI checks against.

`_validate_newest.yml` runs the tests, mypy --strict and hassfest against one
Home Assistant release: the newest stable one that
pytest-homeassistant-custom-component has been released for. A beta, a
release candidate or a dev build never counts. The package pins Home
Assistant exactly (`homeassistant==2026.9.4`), so its newest releases name
the newest Home Assistant releases, and a new stable release reaches CI
without a change in this repository (CONTRIBUTING.md, "Continuous
integration"):

    python3 .github/scripts/ha_version.py           # key=value lines for $GITHUB_OUTPUT
    python3 .github/scripts/ha_version.py --plugin  # the package version alone

It reads PyPI's JSON API and prints `home_assistant` and `plugin` (the
package version) as `key=value` lines, and what it found on stderr, for the
run's log.

Standard library only, and 3.12-compatible, like the release script: the
hassfest job runs it on the runner's own Python.
"""
from __future__ import annotations

import argparse
from collections.abc import Callable, Sequence
import json
import re
import sys
from typing import Any
import urllib.request

PACKAGE = "pytest-homeassistant-custom-component"
_PYPI = "https://pypi.org/pypi"

# How many of the package's newest releases are read, one request each. Home
# Assistant ships a monthly release, its patches and up to ten betas a month,
# so these always include the newest stable release -- and a later patch of
# the month before, which must not win over it.
CANDIDATES = 20

# A stable Home Assistant release: year, month, patch. Betas (2026.10.0b1),
# release candidates and dev builds (2026.11.0.dev20261020) do not match.
_STABLE = re.compile(r"\d{4}\.\d{1,2}\.\d+")
# A release of the package, as its versions are spelled: numbers and dots.
_RELEASE = re.compile(r"\d+(?:\.\d+)*")
_PIN = re.compile(r"homeassistant\s*==\s*([^\s;,]+)", re.IGNORECASE)


def version_key(version: str) -> tuple[int, ...]:
    """Sort key of a version made of numbers and dots: 0.13.100 after 0.13.99."""
    return tuple(int(part) for part in version.split("."))


def pinned_home_assistant(requires: Sequence[str]) -> str | None:
    """The Home Assistant release a package release pins, from its
    requirements; None without a pin."""
    for requirement in requires:
        match = _PIN.fullmatch(requirement.strip())
        if match is not None:
            return match.group(1)
    return None


def newest_stable(
    releases: Sequence[str], pin_of: Callable[[str], str | None]
) -> tuple[str, str]:
    """(Home Assistant, package release) for the newest stable Home Assistant
    among the package's CANDIDATES newest releases.

    `pin_of` names the Home Assistant release a package release pins. Of two
    package releases for one Home Assistant release, the newer counts.
    """
    found = []
    for release in sorted(releases, key=version_key, reverse=True)[:CANDIDATES]:
        pinned = pin_of(release)
        if pinned is not None and _STABLE.fullmatch(pinned):
            found.append((version_key(pinned), version_key(release), pinned, release))
    if not found:
        raise SystemExit(
            f"No stable Home Assistant among the {CANDIDATES} newest releases of {PACKAGE}"
        )
    *_, home_assistant, release = max(found)
    return home_assistant, release


def _get(url: str) -> Any:
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.load(response)


def _releases() -> list[str]:
    """The package's releases: each with a file that is not yanked."""
    listing = _get(f"{_PYPI}/{PACKAGE}/json")
    return [
        release
        for release, files in listing["releases"].items()
        if _RELEASE.fullmatch(release) and any(not file.get("yanked") for file in files)
    ]


def _pin_of(release: str) -> str | None:
    info = _get(f"{_PYPI}/{PACKAGE}/{release}/json")["info"]
    return pinned_home_assistant(info.get("requires_dist") or [])


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--plugin", action="store_true", help=f"print the {PACKAGE} release alone"
    )
    args = parser.parse_args(argv)
    home_assistant, release = newest_stable(_releases(), _pin_of)
    if args.plugin:
        print(release)
    else:
        print(f"home_assistant={home_assistant}")
        print(f"plugin={release}")
    print(
        f"Newest stable Home Assistant with a {PACKAGE} release: "
        f"{home_assistant} ({PACKAGE} {release})",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
