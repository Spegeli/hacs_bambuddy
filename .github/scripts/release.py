"""Compute the next release version and its release notes.

`release.yml`'s key job (the one holding `RELEASE_DEPLOY_KEY`, so it runs no
third-party action -- see CONTRIBUTING.md, "Releases") calls this script
through the shell, never imports it:

    python3 .github/scripts/release.py plan --type stable --bump auto --for-release
    python3 .github/scripts/release.py notes --from v2.0.0_redesign --to HEAD

`plan` reads the current checkout's tags and commit log and prints
`version`, `tag` and `previous` as `key=value` lines for `$GITHUB_OUTPUT`;
`--for-release`, which only the release passes, makes it refuse a plan the
release must not publish (see `plan`). `notes` prints the Markdown release
notes for a commit range. Both are thin wrappers around the pure functions
below (CONTRIBUTING.md, "Releases").

Standard library only, and 3.12-compatible: `actions/setup-python` is
GitHub's own action, but the key job goes without it -- the release allows
that job only `actions/checkout` and shell (CONTRIBUTING.md, "Releases") --
so this runs on the
Python `ubuntu-24.04` ships, 3.12. `_validate_repository.yml`'s "Release
script" job compiles and runs it there on every change.
"""
from __future__ import annotations

import argparse
from collections.abc import Sequence
from dataclasses import dataclass
import io
import re
import subprocess
import sys
from typing import Literal

Bump = Literal["major", "minor", "patch"]
ReleaseType = Literal["stable", "prerelease"]


@dataclass(frozen=True, order=True)
class Version:
    """A SemVer MAJOR.MINOR.PATCH. `order=True` sorts field by field, which
    is exactly SemVer precedence for three released (non-pre-release)
    numbers."""

    major: int
    minor: int
    patch: int

    def __str__(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}"


# --------------------------------------------------------------------------
# Tag parsing.
#
# Three kinds of tag, tried in this order, each returning None when a tag
# is not its kind:
#   - legacy date tags (v2026.05.17; the pattern also takes a same-day
#     suffix, v2026.05.17-1, and a date without the "v"): this project's
#     versioning before Semantic Versioning, now the 1.x line.
#   - stable SemVer tags (v2.0.0, and the one-time v2.0.0_redesign).
#   - pre-release SemVer tags (v2.1.0-beta.2).
# A legacy tag is checked first because its numbers would otherwise also
# match the stable pattern (v2026.06.04 -> major 2026, minor 6, patch 4):
# a date tag must never become a SemVer base, since a bump from it would
# compute nonsense like 2026.7.0 instead of 1.1.0.
# --------------------------------------------------------------------------

_LEGACY_TAG_RE = re.compile(
    r"^v?(?P<year>\d{4})\.(?P<month>\d{1,2})\.(?P<day>\d{1,2})(?:-(?P<seq>\d+))?$"
)
_STABLE_TAG_RE = re.compile(r"^v(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)(?:_redesign)?$")
_PRERELEASE_TAG_RE = re.compile(
    r"^v(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)-beta\.(?P<n>\d+)$"
)


def parse_legacy_tag(tag: str) -> tuple[int, int, int, int] | None:
    """(year, month, day, same-day sequence number) for a legacy CalVer
    release tag, or None. The day and month accept one or two digits, so a
    date tag written without zero-padding (v2026.5.1) is never misread as
    SemVer 2026.5.1 by the stable-tag-shaped regex."""
    match = _LEGACY_TAG_RE.match(tag)
    if match is None:
        return None
    seq = match["seq"]
    return (int(match["year"]), int(match["month"]), int(match["day"]), int(seq) if seq else 0)


def parse_stable_tag(tag: str) -> Version | None:
    """The version of a stable release tag ("v2.0.0", or the one-time
    "v2.0.0_redesign" -- see `stable_tag`), or None. Tried only once
    `parse_legacy_tag` has ruled the tag out as a date."""
    if parse_legacy_tag(tag) is not None:
        return None
    match = _STABLE_TAG_RE.match(tag)
    if match is None:
        return None
    return Version(int(match["major"]), int(match["minor"]), int(match["patch"]))


def parse_prerelease_tag(tag: str) -> tuple[Version, int] | None:
    """(target stable version, beta number) for a pre-release tag such as
    "v2.1.0-beta.2", or None. No legacy tag ever has a "-beta." suffix, so
    there is no date-vs-SemVer ambiguity to resolve here."""
    match = _PRERELEASE_TAG_RE.match(tag)
    if match is None:
        return None
    version = Version(int(match["major"]), int(match["minor"]), int(match["patch"]))
    return version, int(match["n"])


# The 1.x line's base: every legacy date tag predates SemVer and, per
# `parse_legacy_tag`, never contributes a version number -- the first bump
# computed with no SemVer stable tag yet always starts here.
LEGACY_BASE = Version(1, 0, 0)


def latest_stable_version(tags: Sequence[str]) -> Version | None:
    """The highest stable SemVer tag among `tags`, or None if none exists
    yet (only legacy date tags, or no tags at all)."""
    versions = [version for tag in tags if (version := parse_stable_tag(tag)) is not None]
    return max(versions) if versions else None


# --------------------------------------------------------------------------
# The bump, and applying it.
# --------------------------------------------------------------------------


def apply_bump(base: Version, bump: Bump) -> Version:
    """`base` incremented by one SemVer bump; the parts below the bumped
    one reset to zero."""
    if bump == "major":
        return Version(base.major + 1, 0, 0)
    if bump == "minor":
        return Version(base.major, base.minor + 1, 0)
    return Version(base.major, base.minor, base.patch + 1)


def compute_bump(commits: Sequence[Commit], override: str) -> Bump:
    """The SemVer bump: `override` wins when it names one; otherwise
    ("auto") it comes from the Conventional Commits: any breaking commit
    makes it major, else any `feat` makes it minor, else patch (spec
    12.4)."""
    if override == "major":
        return "major"
    if override == "minor":
        return "minor"
    if override == "patch":
        return "patch"
    if any(commit.breaking for commit in commits):
        return "major"
    if any(commit.type == "feat" for commit in commits):
        return "minor"
    return "patch"


def next_stable_version(tags: Sequence[str], bump: Bump) -> Version:
    """The next stable version: the latest stable SemVer tag -- or, before
    one exists, `LEGACY_BASE` -- plus `bump`."""
    base = latest_stable_version(tags) or LEGACY_BASE
    return apply_bump(base, bump)


def next_prerelease_version(tags: Sequence[str], bump: Bump) -> tuple[Version, int]:
    """The pre-release version: the same target stable version
    `next_stable_version` would compute for the same `tags` and `bump` (a
    pre-release never changes what stable it leads to), and the next beta
    number for that target -- one more than the *highest* existing
    "v<target>-beta.*" number, not simply how many exist: with beta.1 and
    beta.3 present (beta.2 perhaps deleted), the next beta must be beta.4,
    never the already-existing beta.3 again. The
    two agree whenever there is no gap."""
    target = next_stable_version(tags, bump)
    existing_numbers = [
        parsed[1]
        for tag in tags
        if (parsed := parse_prerelease_tag(tag)) is not None and parsed[0] == target
    ]
    return target, max(existing_numbers, default=0) + 1


def stable_tag(version: Version, tags: Sequence[str]) -> str:
    """The tag for a stable release. While no stable SemVer tag exists yet,
    the very first one carries the one-time "_redesign" suffix: HACS
    cannot classify "v2.0.0_redesign" as a version and falls back to a text
    comparison, which shows the update to every installation still on a
    legacy date tag. Every later stable tag is plain."""
    if latest_stable_version(tags) is None:
        return f"v{version}_redesign"
    return f"v{version}"


def prerelease_tag(version: Version, n: int) -> str:
    """The tag for a pre-release -- always plain, even for the very first
    one: HACS only ever offers a pre-release to installations that opted in
    (HACS's per-repository "Pre-release" switch), so there is no legacy
    audience to redirect with a text-comparison suffix."""
    return f"v{version}-beta.{n}"


def _semver_sort_key(
    version: Version, is_prerelease: bool, n: int
) -> tuple[int, int, int, int, int]:
    """Sorts tags the way HACS/AwesomeVersion compares them (the verified
    ordering): a stable X.Y.Z outranks every "-beta.N" of that same
    X.Y.Z, and among pre-releases the higher N wins."""
    return (
        version.major,
        version.minor,
        version.patch,
        0 if is_prerelease else 1,
        n if is_prerelease else 0,
    )


def previous_ref(tags: Sequence[str], release_type: ReleaseType) -> str | None:
    """The tag a release's notes -- and, for a stable release, its version
    bump -- start after.

    Stable: the newest stable tag (a "_redesign"-suffixed one still counts
    as one), or, before any SemVer stable exists, the newest legacy date
    tag. Pre-release: the newest tag of either SemVer kind, or -- before
    any SemVer tag exists at all -- the same fallback as stable: a legacy
    date tag is itself a 1.x stable, so it counts as "either type" too
    (a stable release's own range closes this same gap with "the newest
    date tag"). Only a repository with no tags of any kind
    has no previous tag, and its notes cover the whole history.
    """
    stable = [(tag, version) for tag in tags if (version := parse_stable_tag(tag)) is not None]
    if release_type == "stable":
        if stable:
            return max(stable, key=lambda pair: pair[1])[0]
        legacy = [(tag, key) for tag in tags if (key := parse_legacy_tag(tag)) is not None]
        if not legacy:
            return None
        return max(legacy, key=lambda pair: pair[1])[0]

    prerelease = [
        (tag, parsed) for tag in tags if (parsed := parse_prerelease_tag(tag)) is not None
    ]
    candidates = [(tag, _semver_sort_key(version, False, 0)) for tag, version in stable] + [
        (tag, _semver_sort_key(version, True, n)) for tag, (version, n) in prerelease
    ]
    if not candidates:
        return previous_ref(tags, "stable")
    return max(candidates, key=lambda pair: pair[1])[0]


# --------------------------------------------------------------------------
# Conventional Commits parsing and the release notes.
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class RawCommit:
    """One commit as `git log` reports it, before Conventional Commits
    parsing: just enough to parse a header and look for a footer."""

    subject: str
    body: str


@dataclass(frozen=True)
class Commit:
    """One commit's Conventional Commits header, parsed."""

    type: str
    scope: str | None
    breaking: bool
    description: str


_HEADER_RE = re.compile(
    r"^(?P<type>[A-Za-z]+)(?:\((?P<scope>[^()]+)\))?(?P<breaking>!)?:[ \t]*(?P<description>\S.*)$"
)

# The Conventional Commits footer, anchored to the start of a line: a
# mid-sentence mention -- "This is not a BREAKING CHANGE: ...", or a docs
# commit explaining the convention itself -- must never be mistaken for
# the real thing. Not anchored to the end: a Co-Authored-By: trailer can
# follow the footer in its own paragraph. "BREAKING-CHANGE" is
# Conventional Commits' own hyphenated synonym.
_BREAKING_FOOTER_RE = re.compile(r"^BREAKING[ -]CHANGE: ", re.MULTILINE)


def parse_commit(raw: RawCommit) -> Commit | None:
    """Parse one Conventional Commit header (+ body, for a BREAKING CHANGE
    footer). Returns None for anything that does not match the
    "type(scope)!: description" shape at all -- a merge commit's subject
    ("Merge pull request #7 ...", "Merge branch 'dev' into ...") has no
    colon-delimited header, so this alone keeps merges out of the release
    notes without a special case for them."""
    match = _HEADER_RE.match(raw.subject.strip())
    if match is None:
        return None
    breaking = match["breaking"] is not None or _BREAKING_FOOTER_RE.search(raw.body) is not None
    return Commit(
        type=match["type"].lower(),
        scope=match["scope"],
        breaking=breaking,
        description=match["description"].strip(),
    )


# The global section order: heading "### <emoji> <name>". A
# section with nothing to say is left out of the notes entirely.
_SECTIONS: tuple[tuple[str, str], ...] = (
    ("\U0001F4A5", "Breaking Changes"),
    ("✨", "New Features"),
    ("⚡", "Improvements"),
    ("\U0001F41B", "Bug Fixes"),
    ("\U0001F512", "Security"),
    ("♻️", "Refactor & Code Quality"),
    ("\U0001F4DD", "Documentation"),
)

# Internal to the project, not to the people running it: left out of the
# notes -- unless breaking or scoped `security` (see `_section_for`). This
# is also what leaves out the release's own "chore: bump version to ..."
# commit -- no special case needed for it.
_EXCLUDED_TYPES = frozenset({"test", "ci", "chore", "build"})


def _section_for(commit: Commit) -> str | None:
    """Which section (by name, from `_SECTIONS`) `commit` belongs in, or
    None to leave it out of the notes entirely.

    In this order:
    - A breaking commit of any type -- `ci`, `test`, `build` and `chore`
      included -- is filed under Breaking Changes, and only there: it makes
      the next version major (`compute_bump`), so the notes must say why.
    - A commit scoped `security`, in any case and of any type, is filed
      under Security instead of where its type would put it.
    - Only then are the excluded types left out.
    """
    if commit.breaking:
        return "Breaking Changes"
    if commit.scope is not None and commit.scope.lower() == "security":
        return "Security"
    if commit.type in _EXCLUDED_TYPES:
        return None
    if commit.type == "feat":
        return "New Features"
    if commit.type == "perf":
        return "Improvements"
    if commit.type == "fix":
        return "Bug Fixes"
    if commit.type in ("refactor", "style"):
        return "Refactor & Code Quality"
    if commit.type == "docs":
        return "Documentation"
    return None


# The first words that rank an item, as whole words in any of
# their forms -- a prefix would rank "address" as added and "dropdown" as
# removed.
_ADDED_WORDS = frozenset({"add", "adds", "added", "adding"})
_FIXED_WORDS = frozenset({"fix", "fixes", "fixed", "fixing"})
_REMOVED_WORDS = frozenset(
    {
        "remove", "removes", "removed", "removing",
        "drop", "drops", "dropped", "dropping",
        "delete", "deletes", "deleted", "deleting",
    }
)


def _item_rank(description: str) -> int:
    """Where one item sorts within its section, by the description's first
    word: Added, then everything else (Moved / Optimized /
    Changed), then Fixed, then Removed. Equal ranks keep the order they
    were given in -- `build_notes` sorts with Python's stable sort."""
    words = description.split(maxsplit=1)
    word = words[0].lower() if words else ""
    if word in _ADDED_WORDS:
        return 0
    if word in _FIXED_WORDS:
        return 2
    if word in _REMOVED_WORDS:
        return 3
    return 1


def _render_item(commit: Commit) -> str:
    """One bullet line: the description with a capital first letter (the
    rest is left exactly as written), the scope in bold ahead of it when
    there is one."""
    description = commit.description
    if description:
        description = description[0].upper() + description[1:]
    if commit.scope:
        return f"- **{commit.scope}:** {description}"
    return f"- {description}"


def build_notes(commits: Sequence[RawCommit]) -> str:
    """The Markdown release notes for `commits` (oldest first: the order
    `list_commits` gives them in, and the order kept inside a section).
    Sections follow the global order in `_SECTIONS`, empty ones omitted; a
    commit that fails to parse as a Conventional Commit -- a merge's
    subject has no header to parse -- is silently left out, the same as
    one of an excluded type that is neither breaking nor scoped `security`
    (`_section_for`)."""
    by_section: dict[str, list[Commit]] = {name: [] for _, name in _SECTIONS}
    for raw in commits:
        commit = parse_commit(raw)
        if commit is None:
            continue
        section = _section_for(commit)
        if section is None:
            continue
        by_section[section].append(commit)

    blocks = []
    for emoji, name in _SECTIONS:
        items = by_section[name]
        if not items:
            continue
        ordered = sorted(items, key=lambda commit: _item_rank(commit.description))
        body = "\n".join(_render_item(commit) for commit in ordered)
        blocks.append(f"### {emoji} {name}\n\n{body}")

    return "\n\n".join(blocks) if blocks else "No user-facing changes."


# --------------------------------------------------------------------------
# Git, and the two subcommands.
# --------------------------------------------------------------------------

_FIELD_SEP = "\x1f"  # ASCII unit separator: never appears in a commit message.
_RECORD_SEP = "\x1e"  # ASCII record separator.


class ReleaseError(Exception):
    """A state of the checkout the script refuses to plan or write notes
    from; `main` prints it and exits 1."""


def _run_git(args: Sequence[str]) -> str:
    """`git <args>` in the current checkout; what it prints. Always an
    argument list, never a shell string, so a ref or tag name is never open
    to shell syntax. Only the output is captured: git's own error -- a
    "fatal:" line naming the bad revision -- goes straight to the log,
    where the CalledProcessError would show just an exit status. The output
    is read as UTF-8, which git writes, not in the locale's encoding --
    cp1252 on Windows, ASCII under a bare C locale; a stray invalid byte
    in an old commit becomes U+FFFD rather than stop a release."""
    result = subprocess.run(
        ["git", *args], check=True, stdout=subprocess.PIPE, encoding="utf-8", errors="replace"
    )
    return result.stdout


def is_shallow_clone() -> bool:
    """Whether the current checkout is a shallow clone -- what
    actions/checkout gives without `fetch-depth: 0`."""
    return _run_git(["rev-parse", "--is-shallow-repository"]).strip() == "true"


def _require_the_whole_history() -> None:
    """A shallow clone has no tags and a cut history: the plan would come
    out plausible and wrong (1.0.1, v1.0.1_redesign), the notes short. So
    plan and notes refuse it."""
    if is_shallow_clone():
        raise ReleaseError(
            "the checkout is a shallow clone, without the tags and the history "
            "the version and the notes come from. Check it out with fetch-depth: 0 "
            "(actions/checkout), or run: git fetch --unshallow --tags"
        )


def git_tags() -> list[str]:
    """Every tag in the current checkout, in `git tag --list`'s own
    order."""
    return [line for line in _run_git(["tag", "--list"]).splitlines() if line]


def list_commits(from_ref: str, to_ref: str) -> list[RawCommit]:
    """Every non-merge commit reachable from `to_ref` -- all of it when
    `from_ref` is empty, otherwise only `from_ref..to_ref` -- oldest
    first."""
    range_arg = f"{from_ref}..{to_ref}" if from_ref else to_ref
    output = _run_git(
        [
            "log",
            "--no-merges",
            "--reverse",
            "--encoding=UTF-8",
            f"--pretty=format:%s{_FIELD_SEP}%b{_RECORD_SEP}",
            range_arg,
        ]
    )
    commits = []
    for record in output.split(_RECORD_SEP):
        record = record.strip("\n")
        if not record:
            continue
        subject, _, body = record.partition(_FIELD_SEP)
        commits.append(RawCommit(subject=subject.strip(), body=body.strip()))
    return commits


def _refuse_what_a_release_must_not_publish(
    tags: Sequence[str], previous: str, bump: Bump, version: str
) -> None:
    """Raise a ReleaseError for a plan a release must not publish:

    - No commit since `previous` -- merges aside, as in the notes: a second
      start, "Re-run all jobs" after the tag was pushed, a new run right
      after a stable release. It would publish the same changes again as
      the next beta, or an empty stable. With no previous release at all,
      the range is the whole history, which is never empty.
    - Any bump but major while no SemVer stable exists: "auto" would make
      the redesign 1.1.0, under the one-time tag v1.1.0_redesign, and spend
      the suffix. The first SemVer stable is 2.0.0, a major bump, and so are
      its betas, 2.0.0-beta.N.
    """
    if not list_commits(previous, "HEAD"):
        raise ReleaseError(
            f"Nothing to release: no commit since {previous}. If {previous} was released"
            " a moment ago, there is nothing to do; if it has no GitHub release yet, create"
            " it by hand from the tag, or delete the tag if you withdrew its draft (see"
            " Releases in CONTRIBUTING.md)."
        )
    if latest_stable_version(tags) is None and bump != "major":
        raise ReleaseError(
            "No Semantic Versioning release exists yet: the first one, 2.0.0 (tag"
            " v2.0.0_redesign), and every beta of it need 'Version bump' set to major;"
            f" this run planned {version}."
        )


def plan(
    release_type: ReleaseType, bump_override: str, *, for_release: bool = False
) -> dict[str, str]:
    """The next version, its tag, and the tag its notes start after.

    The bump always looks at commits since the latest *stable* tag (a
    pre-release is computed the same way, with the same bump, as a
    stable) -- never since the latest pre-release -- so a version target
    stays put across however many betas lead up to it.

    `for_release` (--for-release, which release.yml's plan step passes)
    refuses what a release must not publish
    (`_refuse_what_a_release_must_not_publish`). Validate's release-script
    job plans without it, and must pass: on dev right after main is merged
    back there is no commit since the stable's tag, and before the first
    SemVer stable "auto" plans 1.1.0.
    """
    _require_the_whole_history()
    tags = git_tags()
    stable_base = previous_ref(tags, "stable")
    commits = [
        commit
        for raw in list_commits(stable_base or "", "HEAD")
        if (commit := parse_commit(raw)) is not None
    ]
    bump = compute_bump(commits, bump_override)

    if release_type == "stable":
        version = next_stable_version(tags, bump)
        tag = stable_tag(version, tags)
        version_str = str(version)
    else:
        target, n = next_prerelease_version(tags, bump)
        tag = prerelease_tag(target, n)
        version_str = f"{target}-beta.{n}"

    previous = previous_ref(tags, release_type) or ""
    if for_release:
        _refuse_what_a_release_must_not_publish(tags, previous, bump, version_str)
    return {"version": version_str, "tag": tag, "previous": previous}


def notes_command(from_ref: str, to_ref: str) -> str:
    """The Markdown release notes for the commit range `from_ref..to_ref`
    (or all of `to_ref`'s history when `from_ref` is empty)."""
    _require_the_whole_history()
    return build_notes(list_commits(from_ref, to_ref))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Compute the next release version and its release notes."
    )
    subcommands = parser.add_subparsers(dest="command", required=True)

    plan_parser = subcommands.add_parser(
        "plan", help="Print the next version, tag and previous tag as key=value lines."
    )
    plan_parser.add_argument("--type", choices=["stable", "prerelease"], required=True)
    plan_parser.add_argument("--bump", choices=["auto", "major", "minor", "patch"], default="auto")
    plan_parser.add_argument(
        "--for-release",
        action="store_true",
        help="Refuse a plan a release must not publish: no commit since the previous "
        "release, or a first Semantic Versioning release that is not a major.",
    )

    notes_parser = subcommands.add_parser(
        "notes", help="Print the Markdown release notes for a commit range."
    )
    notes_parser.add_argument("--from", dest="from_ref", default="")
    notes_parser.add_argument("--to", dest="to_ref", required=True)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    # The notes carry emoji and whatever the commit subjects hold, which a
    # locale that is not UTF-8 -- Windows' cp1252, a bare C locale -- cannot
    # write. So stdout writes UTF-8 whatever the host.
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8")
    args = _build_parser().parse_args(argv)
    try:
        if args.command == "plan":
            result = plan(args.type, args.bump, for_release=args.for_release)
            for key, value in result.items():
                print(f"{key}={value}")
        else:
            print(notes_command(args.from_ref, args.to_ref))
    except ReleaseError as error:
        print(f"release.py: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
