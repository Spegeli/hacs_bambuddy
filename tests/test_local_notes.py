"""No tracked file points into the local design notes.

Specs, plans, their ledgers and the API research stay on the maintainer's
machine: git ignores docs/, .superpowers/ and umbau/. A reader of the
repository cannot open them, so a pointer into them -- a path, a section of
a spec, a ruling, a review finding -- leads nowhere. Comments point to what
the repository holds instead: CONTRIBUTING.md, the README, an issue.
"""
from pathlib import Path
import re
import subprocess

_ROOT = Path(__file__).parent.parent

_POINTERS = re.compile(
    # A path into a folder git ignores. Not part of a longer path or a URL:
    # https://hacs.xyz/docs/ is no local folder.
    r"(?<![\w./-])(?:docs|\.superpowers|umbau)/"
    # A section, paragraph or decision of a spec: "spec section 12",
    # "spec §3.1", "spec 12.4", "spec D12" -- also across a line break and
    # the comment sign that starts the next line.
    r"|\bspecs?\s+(?:#\s*)?(?:section\b|§|\d|D\d)"
    r"|§\s*\d"
    r"|\bthe spec\b"
    # A ruling or a review finding: "ruling R9", "review Important 3".
    r"|\bruling\s+R?\d"
    r"|\breview\s+(?:#\s*)?(?:critical|important|minor)\b",
    re.IGNORECASE,
)


def _tracked_files() -> list[str]:
    listing = subprocess.run(
        ["git", "ls-files", "-z"], cwd=_ROOT, check=True, capture_output=True, encoding="utf-8"
    ).stdout
    return [name for name in listing.split("\0") if name]


def test_no_tracked_file_points_into_the_local_design_notes():
    # .gitignore names the folders by design; this module names the pointers.
    skipped = {".gitignore", Path(__file__).relative_to(_ROOT).as_posix()}
    found = []
    for name in _tracked_files():
        if name in skipped:
            continue
        try:
            text = (_ROOT / name).read_text(encoding="utf-8")
        except UnicodeDecodeError:  # an image
            continue
        for pointer in _POINTERS.finditer(text):
            line = text.count("\n", 0, pointer.start()) + 1
            found.append(f"{name}:{line}: {pointer.group(0)!r}")
    assert found == []
