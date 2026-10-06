"""Unit tests for `.github/scripts/release.py` -- the version and release
notes computation the release workflow's key job calls (CONTRIBUTING.md
"Releases"). Imported by path: `.github/scripts` is not a
package (there is no `scripts/__init__.py`), so a normal `import` cannot
reach it.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import subprocess
import sys
from types import ModuleType

import pytest

_SCRIPT = Path(__file__).parents[1] / ".github" / "scripts" / "release.py"


def _load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("release_script", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    # The script's `from __future__ import annotations` leaves its dataclass
    # annotations as strings, and dataclasses reads those through the
    # class's module in sys.modules (to tell a ClassVar). A module loaded
    # from a path is not registered there by itself, so without this
    # exec_module raises an AttributeError -- on 3.12 as on 3.14.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


release = _load_script()

Version = release.Version
RawCommit = release.RawCommit
Commit = release.Commit
parse_commit = release.parse_commit
compute_bump = release.compute_bump
next_stable_version = release.next_stable_version
next_prerelease_version = release.next_prerelease_version
stable_tag = release.stable_tag
prerelease_tag = release.prerelease_tag
previous_ref = release.previous_ref
build_notes = release.build_notes
parse_legacy_tag = release.parse_legacy_tag
parse_stable_tag = release.parse_stable_tag
parse_prerelease_tag = release.parse_prerelease_tag

# A stand-in tag list once the redesign's own transition tag exists, used by
# several scenarios below.
_AFTER_REDESIGN = ["v2026.05.17", "v2026.06.04", "v2.0.0_redesign"]


@pytest.fixture(autouse=True)
def _a_complete_history(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    """plan and notes refuse a shallow clone, which they ask git about. The
    tests that stub git get a checkout with its whole history; those on a
    real repository (the `repository` fixture) let git answer."""
    if "repository" not in request.fixturenames:
        monkeypatch.setattr(release, "is_shallow_clone", lambda: False)


# --------------------------------------------------------------------------
# parse_commit -- Conventional Commits header + BREAKING CHANGE footer
# --------------------------------------------------------------------------

def test_parse_commit_reads_type_and_description():
    commit = parse_commit(RawCommit(subject="feat: add multi-currency support", body=""))
    assert commit == Commit(
        type="feat", scope=None, breaking=False, description="add multi-currency support"
    )


def test_parse_commit_reads_the_scope():
    commit = parse_commit(RawCommit(subject="fix(sensors): correct balance rounding", body=""))
    assert commit == Commit(
        type="fix", scope="sensors", breaking=False, description="correct balance rounding"
    )


def test_parse_commit_reads_breaking_from_the_bang():
    commit = parse_commit(RawCommit(subject="feat!: drop the legacy sensor", body=""))
    assert commit is not None and commit.breaking is True

    scoped = parse_commit(RawCommit(subject="feat(api)!: drop v1 endpoints", body=""))
    assert scoped == Commit(
        type="feat", scope="api", breaking=True, description="drop v1 endpoints"
    )


def test_parse_commit_reads_breaking_from_the_footer():
    commit = parse_commit(
        RawCommit(
            subject="fix: adjust rounding",
            body="Fixes drift in totals.\n\nBREAKING CHANGE: changes the stored units.",
        )
    )
    assert commit is not None and commit.breaking is True


def test_parse_commit_footer_detects_the_breaking_change_synonym():
    """Conventional Commits allows BREAKING-CHANGE: as a synonym for
    BREAKING CHANGE:."""
    commit = parse_commit(
        RawCommit(
            subject="feat: add a bulk endpoint",
            body="BREAKING-CHANGE: removes the old one.",
        )
    )
    assert commit is not None and commit.breaking is True


def test_parse_commit_footer_is_detected_before_a_trailing_paragraph():
    """Every commit in this repository ends with a Co-Authored-By: trailer
    in its own paragraph, which can follow the footer -- detection must
    not stop at the last paragraph."""
    commit = parse_commit(
        RawCommit(
            subject="feat: drop the legacy sensor",
            body=(
                "BREAKING CHANGE: removes it entirely.\n\n"
                "Co-Authored-By: Someone <someone@example.com>"
            ),
        )
    )
    assert commit is not None and commit.breaking is True


def test_parse_commit_ignores_a_mid_line_breaking_change_mention():
    """Only a footer -- BREAKING CHANGE: at the start of a line -- makes a
    commit breaking; a reference to the concept elsewhere in the body, as
    a docs commit describing this very convention might write, must not."""
    commit = parse_commit(
        RawCommit(
            subject="docs: describe the release process",
            body="See the BREAKING CHANGE: convention in the docs for the policy.",
        )
    )
    assert commit is not None and commit.breaking is False


def test_parse_commit_ignores_a_negated_breaking_change_mention():
    commit = parse_commit(
        RawCommit(
            subject="fix: adjust rounding",
            body="This is not a BREAKING CHANGE: the option stays.",
        )
    )
    assert commit is not None and commit.breaking is False


def test_parse_commit_type_is_case_insensitive():
    commit = parse_commit(RawCommit(subject="Feat: add x", body=""))
    assert commit is not None and commit.type == "feat"


def test_parse_commit_rejects_a_merge_commit_subject():
    """A merge's subject has no "type: description" shape at all, which is
    what keeps merges out of the release notes without a special case."""
    assert parse_commit(RawCommit(subject="Merge pull request #42 from foo/bar", body="")) is None
    assert parse_commit(RawCommit(subject="Merge branch 'dev' into redesign", body="")) is None


def test_parse_commit_rejects_prose_without_a_conventional_header():
    assert parse_commit(RawCommit(subject="oops forgot a file", body="")) is None


# --------------------------------------------------------------------------
# compute_bump
# --------------------------------------------------------------------------

def _commit(type_: str, breaking: bool = False, description: str = "x") -> Commit:
    return Commit(type=type_, scope=None, breaking=breaking, description=description)


def test_compute_bump_override_wins_over_the_commits():
    commits = [_commit("feat")]
    assert compute_bump(commits, "patch") == "patch"
    assert compute_bump(commits, "major") == "major"
    assert compute_bump([], "minor") == "minor"


def test_compute_bump_auto_is_major_when_any_commit_is_breaking():
    commits = [_commit("fix"), _commit("feat", breaking=True)]
    assert compute_bump(commits, "auto") == "major"


def test_compute_bump_auto_is_minor_for_a_feat_without_breaking():
    commits = [_commit("fix"), _commit("feat")]
    assert compute_bump(commits, "auto") == "minor"


def test_compute_bump_auto_is_patch_otherwise():
    assert compute_bump([_commit("fix"), _commit("docs")], "auto") == "patch"
    assert compute_bump([], "auto") == "patch"


def test_compute_bump_auto_is_major_for_a_breaking_commit_of_any_type():
    """A `!` or a footer is the author's own breaking signal, whatever the
    type -- a CI or tooling change included."""
    assert compute_bump([_commit("fix"), _commit("ci", breaking=True)], "auto") == "major"
    assert compute_bump([_commit("chore", breaking=True)], "auto") == "major"


# --------------------------------------------------------------------------
# Tag parsing -- legacy date tags are never a SemVer base
# --------------------------------------------------------------------------

def test_parse_legacy_tag_reads_date_and_sequence():
    assert parse_legacy_tag("v2026.06.04") == (2026, 6, 4, 0)
    assert parse_legacy_tag("v2026.09.28-1") == (2026, 9, 28, 1)
    # One tag from before the "v" convention: still legacy.
    assert parse_legacy_tag("2025.10.06") == (2025, 10, 6, 0)
    # Two real tags in this repository's history with a single-digit day --
    # must still classify as legacy, never leak into parse_stable_tag as a
    # syntactically-valid but wrong SemVer (2026.5.1).
    assert parse_legacy_tag("v2026.05.1") == (2026, 5, 1, 0)
    assert parse_legacy_tag("v2.0.0") is None


def test_parse_stable_tag_never_reads_a_legacy_date_as_semver():
    """v2026.06.04 must never become a SemVer base (it would
    otherwise compute a minor bump as 2026.7.0)."""
    assert parse_stable_tag("v2026.06.04") is None
    assert parse_stable_tag("v2026.09.28-1") is None
    assert parse_stable_tag("v2026.05.1") is None


def test_parse_stable_tag_reads_plain_and_suffixed_tags():
    assert parse_stable_tag("v2.0.0") == Version(2, 0, 0)
    assert parse_stable_tag("v2.0.0_redesign") == Version(2, 0, 0)
    assert parse_stable_tag("v2.1.0-beta.1") is None


def test_parse_prerelease_tag_reads_target_and_beta_number():
    assert parse_prerelease_tag("v2.1.0-beta.2") == (Version(2, 1, 0), 2)
    assert parse_prerelease_tag("v2.0.0_redesign") is None
    assert parse_prerelease_tag("v2026.06.04") is None


# --------------------------------------------------------------------------
# next_stable_version -- worked examples
# --------------------------------------------------------------------------

def test_next_stable_version_bases_on_1_0_0_with_legacy_tags_only():
    legacy = ["v2026.05.17", "v2026.06.04"]
    assert next_stable_version(legacy, "minor") == Version(1, 1, 0)
    assert next_stable_version(legacy, "major") == Version(2, 0, 0)


def test_next_stable_version_never_bases_on_a_legacy_date():
    """A single legacy tag whose numbers look like a plausible SemVer
    (v2026.09.28-1) must still bump from 1.0.0, not from 2026.9.28."""
    assert next_stable_version(["v2026.09.28-1"], "patch") == Version(1, 0, 1)


def test_next_stable_version_bumps_the_latest_stable_tag():
    assert next_stable_version(_AFTER_REDESIGN, "patch") == Version(2, 0, 1)
    assert next_stable_version(_AFTER_REDESIGN, "minor") == Version(2, 1, 0)
    assert next_stable_version(_AFTER_REDESIGN, "major") == Version(3, 0, 0)


def test_next_stable_version_picks_the_highest_stable_tag():
    tags = [*_AFTER_REDESIGN, "v2.1.0"]
    assert next_stable_version(tags, "patch") == Version(2, 1, 1)


# --------------------------------------------------------------------------
# stable_tag -- the one-time "_redesign" suffix
# --------------------------------------------------------------------------

def test_stable_tag_suffixes_the_first_semver_stable_only():
    legacy = ["v2026.05.17", "v2026.06.04"]
    assert stable_tag(Version(2, 0, 0), legacy) == "v2.0.0_redesign"


def test_stable_tag_is_plain_once_a_stable_tag_exists():
    assert stable_tag(Version(2, 0, 1), _AFTER_REDESIGN) == "v2.0.1"
    assert stable_tag(Version(2, 1, 0), _AFTER_REDESIGN) == "v2.1.0"


# --------------------------------------------------------------------------
# next_prerelease_version / prerelease_tag -- betas target the next stable
# --------------------------------------------------------------------------

def test_prerelease_targets_1_x_successor_with_legacy_tags_only():
    legacy = ["v2026.05.17", "v2026.06.04"]
    assert next_prerelease_version(legacy, "major") == (Version(2, 0, 0), 1)
    assert prerelease_tag(Version(2, 0, 0), 1) == "v2.0.0-beta.1"


def test_prerelease_numbering_counts_existing_betas_of_the_same_target():
    tags = [*_AFTER_REDESIGN, "v2.1.0-beta.1", "v2.1.0-beta.2"]
    assert next_prerelease_version(tags, "minor") == (Version(2, 1, 0), 3)
    assert prerelease_tag(Version(2, 1, 0), 3) == "v2.1.0-beta.3"


def test_prerelease_after_a_stable_targets_the_next_stable():
    tags = [*_AFTER_REDESIGN, "v2.1.0"]
    assert next_prerelease_version(tags, "patch") == (Version(2, 1, 1), 1)
    assert prerelease_tag(Version(2, 1, 1), 1) == "v2.1.1-beta.1"


def test_prerelease_numbering_ignores_betas_of_a_different_target():
    """Existing betas that target a different stable (2.1.0) must not
    affect the count for this one (3.0.0, from a major bump) -- otherwise
    a stray 2.1.0-beta.* would push 3.0.0's own numbering ahead. Review
    Important 3 (named risk 2)."""
    tags = ["v2.0.0_redesign", "v2.1.0-beta.1", "v2.1.0-beta.2"]
    assert next_prerelease_version(tags, "major") == (Version(3, 0, 0), 1)


def test_prerelease_numbering_never_reuses_a_tag_after_a_gap():
    """N = 1 + the *highest* existing beta number of the target, not 1 +
    how many exist: with beta.1 and beta.3 present (beta.2 perhaps
    deleted), the next beta must be beta.4, never the already-existing
    beta.3 again."""
    tags = [*_AFTER_REDESIGN, "v2.1.0-beta.1", "v2.1.0-beta.3"]
    assert next_prerelease_version(tags, "minor") == (Version(2, 1, 0), 4)


# --------------------------------------------------------------------------
# previous_ref -- the tag notes (and a stable bump) start after
# --------------------------------------------------------------------------

def test_previous_ref_stable_falls_back_to_the_newest_legacy_tag():
    legacy = ["v2026.05.17", "v2026.06.04", "v2026.05.1"]
    assert previous_ref(legacy, "stable") == "v2026.06.04"


def test_previous_ref_stable_counts_a_suffixed_tag():
    tags = ["v2026.05.17", "v2026.06.04", "v2.0.0_redesign"]
    assert previous_ref(tags, "stable") == "v2.0.0_redesign"


def test_previous_ref_stable_picks_the_highest_stable_tag():
    tags = [*_AFTER_REDESIGN, "v2.1.0"]
    assert previous_ref(tags, "stable") == "v2.1.0"


def test_previous_ref_stable_with_no_tags_at_all_is_none():
    assert previous_ref([], "stable") is None


def test_previous_ref_prerelease_is_the_newest_of_either_semver_kind():
    # A pre-release of the next stable outranks the current stable (spec
    # 12.4's verified ordering: 2.1.0-beta.1 > 2.0.0).
    assert previous_ref(["v2.0.0_redesign", "v2.1.0-beta.1"], "prerelease") == "v2.1.0-beta.1"
    # A published stable outranks a pre-release of that same version.
    assert previous_ref(["v2.1.0-beta.1", "v2.1.0"], "prerelease") == "v2.1.0"
    # The higher beta number wins among pre-releases of the same target.
    assert (
        previous_ref(["v2.1.0-beta.1", "v2.1.0-beta.2"], "prerelease") == "v2.1.0-beta.2"
    )


def test_previous_ref_prerelease_falls_back_to_the_newest_legacy_tag():
    """A pre-release cut before any SemVer tag exists still has a previous
    tag: a legacy date tag is itself a 1.x stable, so it counts as "either
    type" too -- a stable release's own range closes this same gap with
    "the newest date tag"."""
    assert previous_ref(["v2026.05.17", "v2026.06.04"], "prerelease") == "v2026.06.04"


def test_previous_ref_prerelease_with_no_tags_at_all_is_none():
    """Only a repository with no tags of any kind has no previous tag."""
    assert previous_ref([], "prerelease") is None


# --------------------------------------------------------------------------
# Ordering is by version, not by `git tag --list`'s (lexical) order:
# v2.10.0 sorts before v2.9.0 in `git tag --list`.
# --------------------------------------------------------------------------

def test_stable_ordering_is_numeric_not_tag_list_order():
    tags = ["v2.0.0_redesign", "v2.10.0", "v2.9.0"]
    assert next_stable_version(tags, "patch") == Version(2, 10, 1)
    assert previous_ref(tags, "stable") == "v2.10.0"


def test_prerelease_previous_ref_ordering_is_numeric_not_tag_list_order():
    tags = ["v2.10.0-beta.10", "v2.10.0-beta.9"]
    assert previous_ref(tags, "prerelease") == "v2.10.0-beta.10"


# --------------------------------------------------------------------------
# build_notes -- sections, item order, and what never gets listed
# --------------------------------------------------------------------------

def test_build_notes_with_nothing_to_list():
    assert build_notes([]) == "No user-facing changes."


def test_build_notes_excludes_internal_types_merges_and_the_version_commit():
    """test/ci/chore/build, merge commits and the release's own "chore:
    bump version to ..." commit are not listed -- unless a tooling commit
    is breaking or has the security scope (tested below)."""
    commits = [
        RawCommit(subject="test: add a regression test", body=""),
        RawCommit(subject="ci: cache pip downloads", body=""),
        RawCommit(subject="build: bump the pinned image", body=""),
        RawCommit(subject="chore: bump version to 2.0.1", body=""),
        RawCommit(subject="Merge pull request #7 from foo/bar", body=""),
    ]
    assert build_notes(commits) == "No user-facing changes."


def test_build_notes_renders_a_scoped_and_an_unscoped_item():
    commits = [
        RawCommit(subject="feat: add multi-currency support", body=""),
        RawCommit(subject="fix(sensors): correct balance rounding", body=""),
    ]
    notes = build_notes(commits)
    assert "### ✨ New Features\n\n- Add multi-currency support" in notes
    assert "### \U0001F41B Bug Fixes\n\n- **sensors:** Correct balance rounding" in notes


def test_build_notes_maps_every_type_and_scope_to_its_section():
    commits = [
        RawCommit(subject="perf: speed up the wallet coordinator", body=""),
        RawCommit(subject="fix(security): patch a token leak", body=""),
        RawCommit(subject="refactor: split the api client", body=""),
        RawCommit(subject="style: reformat the sensor module", body=""),
        RawCommit(subject="docs: describe the new sensors", body=""),
    ]
    notes = build_notes(commits)
    assert "### ⚡ Improvements\n\n- Speed up the wallet coordinator" in notes
    # scope=security wins over the fix type -- listed only under Security.
    assert "### \U0001F512 Security\n\n- **security:** Patch a token leak" in notes
    assert "### \U0001F41B Bug Fixes" not in notes
    assert "Refactor & Code Quality\n\n- Split the api client\n- Reformat the sensor module" in notes
    assert "### \U0001F4DD Documentation\n\n- Describe the new sensors" in notes


def test_build_notes_files_a_breaking_commit_only_under_breaking_changes():
    commits = [RawCommit(subject="feat!: drop the legacy sensor", body="")]
    notes = build_notes(commits)
    assert notes == "### \U0001F4A5 Breaking Changes\n\n- Drop the legacy sensor"
    assert "New Features" not in notes


def test_build_notes_footer_breaking_change_also_files_under_breaking_only():
    commits = [
        RawCommit(
            subject="fix: adjust rounding",
            body="BREAKING CHANGE: changes the stored units.",
        )
    ]
    notes = build_notes(commits)
    assert notes == "### \U0001F4A5 Breaking Changes\n\n- Adjust rounding"
    assert "Bug Fixes" not in notes


def test_build_notes_lists_a_breaking_commit_of_any_type():
    """A breaking commit is listed under Breaking Changes
    whatever its type -- also ci, test, build and chore, which are left out
    otherwise: it makes the next version major, so the notes must say why."""
    commits = [
        RawCommit(subject="ci!: require the release runner's Python 3.12", body=""),
        RawCommit(subject="test: add a regression test", body=""),
        RawCommit(
            subject="chore: rework the release tags",
            body="Moves them.\n\nBREAKING CHANGE: older tags are gone.",
        ),
    ]
    assert build_notes(commits) == (
        "### \U0001F4A5 Breaking Changes\n\n"
        "- Require the release runner's Python 3.12\n"
        "- Rework the release tags"
    )


def test_build_notes_lists_the_security_scope_of_any_type():
    """Scope security, any type -- a chore or build
    change to security is listed too, under Security."""
    commits = [
        RawCommit(subject="chore(security): rotate the pinned action digests", body=""),
        RawCommit(subject="build(security): pin the test image by digest", body=""),
        RawCommit(subject="chore: tidy the scripts", body=""),
    ]
    assert build_notes(commits) == (
        "### \U0001F512 Security\n\n"
        "- **security:** Rotate the pinned action digests\n"
        "- **security:** Pin the test image by digest"
    )


def test_build_notes_reads_the_security_scope_in_any_case():
    """The type is read case-insensitively, and so is the security scope:
    Fix(Security) is a security fix. The scope is printed as written."""
    commits = [RawCommit(subject="Fix(Security): patch a token leak", body="")]
    assert build_notes(commits) == (
        "### \U0001F512 Security\n\n- **Security:** Patch a token leak"
    )


def test_build_notes_lists_a_breaking_security_commit_only_as_breaking():
    """Both rules apply; a commit is never listed twice, and
    breaking comes first."""
    commits = [RawCommit(subject="fix(security)!: drop the old token format", body="")]
    assert build_notes(commits) == (
        "### \U0001F4A5 Breaking Changes\n\n- **security:** Drop the old token format"
    )


def test_build_notes_orders_sections_in_the_global_order_and_omits_empty_ones():
    commits = [
        RawCommit(subject="docs: update the readme", body=""),
        RawCommit(subject="feat: add a new sensor", body=""),
        RawCommit(subject="fix: correct a typo", body=""),
    ]
    notes = build_notes(commits)
    # New Features, then Bug Fixes, then Documentation -- Breaking Changes,
    # Improvements, Security and Refactor & Code Quality are all empty and
    # must not appear at all.
    assert notes == (
        "### ✨ New Features\n\n- Add a new sensor"
        "\n\n### \U0001F41B Bug Fixes\n\n- Correct a typo"
        "\n\n### \U0001F4DD Documentation\n\n- Update the readme"
    )


def test_build_notes_item_order_is_added_changed_fixed_removed():
    commits = [
        RawCommit(subject="feat: fix the onboarding hint wording", body=""),
        RawCommit(subject="feat: add a portfolio sensor", body=""),
        RawCommit(subject="feat: streamline the config flow", body=""),
        RawCommit(subject="feat: remove the deprecated icon option", body=""),
        RawCommit(subject="feat: drop the legacy fallback path", body=""),
        RawCommit(subject="feat: delete the temporary cache file", body=""),
        RawCommit(subject="feat: add a second sensor", body=""),
    ]
    notes = build_notes(commits)
    assert notes == (
        "### ✨ New Features\n\n"
        "- Add a portfolio sensor\n"
        "- Add a second sensor\n"
        "- Streamline the config flow\n"
        "- Fix the onboarding hint wording\n"
        "- Remove the deprecated icon option\n"
        "- Drop the legacy fallback path\n"
        "- Delete the temporary cache file"
    )


def test_build_notes_ranks_items_by_whole_words():
    """The rank comes from the description's first word as a whole word,
    in any of its forms and any case -- never from a prefix: "address" is
    no "add", "dropdown" no "drop", and "removal", a noun, no "remove"."""
    commits = [
        RawCommit(subject="feat: dropdown for the currency", body=""),
        RawCommit(subject="feat: removes the old flag", body=""),
        RawCommit(subject="feat: fixed the header", body=""),
        RawCommit(subject="feat: address the review findings", body=""),
        RawCommit(subject="feat: adding a sensor", body=""),
        RawCommit(subject="feat: removal of the icon option", body=""),
        RawCommit(subject="feat: deleted the cache", body=""),
        RawCommit(subject="feat: Adds a group", body=""),
    ]
    assert build_notes(commits) == (
        "### ✨ New Features\n\n"
        "- Adding a sensor\n"
        "- Adds a group\n"
        "- Dropdown for the currency\n"
        "- Address the review findings\n"
        "- Removal of the icon option\n"
        "- Fixed the header\n"
        "- Removes the old flag\n"
        "- Deleted the cache"
    )


def test_build_notes_pins_the_global_section_order_and_exact_emojis():
    """One commit per section, deliberately scrambled on input, so the
    output order can only come from `_SECTIONS` itself -- catches a
    swapped pair of headings, Breaking Changes moved out of first place,
    or the Refactor & Code Quality emoji losing its U+FE0F variation
    selector."""
    commits = [
        RawCommit(subject="docs: expand the FAQ", body=""),
        RawCommit(subject="style: reformat the config flow", body=""),
        RawCommit(subject="fix(security): patch a token leak", body=""),
        RawCommit(subject="fix: correct rounding", body=""),
        RawCommit(subject="perf: speed up polling", body=""),
        RawCommit(subject="feat: add a currency selector", body=""),
        RawCommit(subject="feat!: drop the legacy sensor", body=""),
    ]
    assert build_notes(commits) == (
        "### \U0001F4A5 Breaking Changes\n\n- Drop the legacy sensor"
        "\n\n### ✨ New Features\n\n- Add a currency selector"
        "\n\n### ⚡ Improvements\n\n- Speed up polling"
        "\n\n### \U0001F41B Bug Fixes\n\n- Correct rounding"
        "\n\n### \U0001F512 Security\n\n- **security:** Patch a token leak"
        "\n\n### ♻️ Refactor & Code Quality\n\n- Reformat the config flow"
        "\n\n### \U0001F4DD Documentation\n\n- Expand the FAQ"
    )


# --------------------------------------------------------------------------
# plan() / notes_command() -- the CLI's orchestration, git calls stubbed out
# --------------------------------------------------------------------------

def test_plan_stable_from_legacy_tags_only(monkeypatch):
    monkeypatch.setattr(release, "git_tags", lambda: ["v2026.05.17", "v2026.06.04"])
    monkeypatch.setattr(release, "list_commits", lambda from_ref, to_ref: [])
    assert release.plan("stable", "major") == {
        "version": "2.0.0",
        "tag": "v2.0.0_redesign",
        "previous": "v2026.06.04",
    }


def test_plan_prerelease_with_only_date_tags_falls_back_to_the_newest_one(monkeypatch):
    """The real repository's first beta, cut before v2.0.0_redesign
    exists: previous must be the newest date tag, not empty -- an empty
    previous would republish everything already shipped under
    v2026.05.29 and v2026.06.04 as if it were new."""
    monkeypatch.setattr(release, "git_tags", lambda: ["v2026.05.17", "v2026.06.04"])
    monkeypatch.setattr(release, "list_commits", lambda from_ref, to_ref: [])
    assert release.plan("prerelease", "major") == {
        "version": "2.0.0-beta.1",
        "tag": "v2.0.0-beta.1",
        "previous": "v2026.06.04",
    }


def test_plan_prerelease_targets_the_next_stable(monkeypatch):
    monkeypatch.setattr(
        release, "git_tags", lambda: ["v2.0.0_redesign", "v2.1.0-beta.1"]
    )
    monkeypatch.setattr(
        release,
        "list_commits",
        lambda from_ref, to_ref: [RawCommit(subject="feat: add y", body="")],
    )
    assert release.plan("prerelease", "auto") == {
        "version": "2.1.0-beta.2",
        "tag": "v2.1.0-beta.2",
        "previous": "v2.1.0-beta.1",
    }


def test_plan_bump_auto_reads_commits_since_the_latest_stable_tag(monkeypatch):
    """The bump always looks at commits since the latest *stable* tag, even
    for a pre-release -- so a beta's version target stays put across
    several betas regardless of what the previous *pre-release* tag was."""
    seen_ranges = []

    def fake_list_commits(from_ref: str, to_ref: str):
        seen_ranges.append((from_ref, to_ref))
        return [RawCommit(subject="feat: add y", body="")]

    monkeypatch.setattr(
        release, "git_tags", lambda: ["v2.0.0_redesign", "v2.1.0-beta.1"]
    )
    monkeypatch.setattr(release, "list_commits", fake_list_commits)
    release.plan("prerelease", "auto")
    assert seen_ranges == [("v2.0.0_redesign", "HEAD")]


def test_notes_command_delegates_to_build_notes(monkeypatch):
    commits = [RawCommit(subject="feat: add z", body="")]
    monkeypatch.setattr(release, "list_commits", lambda from_ref, to_ref: commits)
    assert release.notes_command("v1.0.0", "HEAD") == build_notes(commits)


# --------------------------------------------------------------------------
# main() -- the exact $GITHUB_OUTPUT and Markdown text printed
# --------------------------------------------------------------------------

def test_main_plan_prints_key_value_lines(monkeypatch, capsys):
    monkeypatch.setattr(release, "git_tags", lambda: ["v2026.06.04"])
    monkeypatch.setattr(release, "list_commits", lambda from_ref, to_ref: [])
    exit_code = release.main(["plan", "--type", "stable", "--bump", "major"])
    assert exit_code == 0
    assert capsys.readouterr().out == "version=2.0.0\ntag=v2.0.0_redesign\nprevious=v2026.06.04\n"


def test_main_notes_prints_markdown(monkeypatch, capsys):
    monkeypatch.setattr(
        release,
        "list_commits",
        lambda from_ref, to_ref: [RawCommit(subject="feat: add a", body="")],
    )
    exit_code = release.main(["notes", "--from", "", "--to", "HEAD"])
    assert exit_code == 0
    assert capsys.readouterr().out == "### ✨ New Features\n\n- Add a\n"


# --------------------------------------------------------------------------
# The git layer, on real repositories in tmp_path
# --------------------------------------------------------------------------

def _git_env() -> dict[str, str]:
    """The environment for git: the test process's, less git's own
    variables -- a hook's GIT_DIR would send git to this repository -- and
    without the user's or the system's git configuration."""
    inherited = {name: value for name, value in os.environ.items() if not name.startswith("GIT_")}
    return {**inherited, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}


def _git(repository: Path, *args: str, second: int = 0) -> str:
    """Run git in `repository` as a test author, its clock at `second`
    seconds past noon: commits made within one real second still keep the
    order the test gives them."""
    date = f"2026-09-27T12:00:{second:02d}+00:00"
    author = {"NAME": "Test", "EMAIL": "test@example.invalid", "DATE": date}
    env = {
        **_git_env(),
        **{f"GIT_{role}_{key}": value for role in ("AUTHOR", "COMMITTER") for key, value in author.items()},
    }
    return subprocess.run(
        ["git", *args], cwd=repository, env=env, check=True, capture_output=True, encoding="utf-8"
    ).stdout.strip()


def _git_commit(repository: Path, message: str, second: int) -> None:
    _git(repository, "commit", "--quiet", "--allow-empty", "--message", message, second=second)


@pytest.fixture
def repository(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """An empty repository on main, as the current directory -- where the
    script's git layer runs git -- with git's own variables and the user's
    configuration out of the way."""
    path = tmp_path / "repository"
    _git(tmp_path, "init", "--quiet", "--initial-branch=main", str(path))
    for name in [name for name in os.environ if name.startswith("GIT_")]:
        monkeypatch.delenv(name)
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", os.devnull)
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    monkeypatch.chdir(path)
    return path


def test_the_git_layer_reads_a_real_repository(repository):
    """git_tags and list_commits against a real history: a body of several
    lines comes through whole, a merge commit never does, the range starts
    after the tag it names -- or covers everything when `from` is empty --
    and the commits come oldest first. The notes and the plan follow from
    them."""
    _git_commit(repository, "feat: add the first feature", second=1)
    _git(repository, "tag", "v2026.06.04")
    _git(repository, "switch", "--quiet", "--create", "topic")
    topic_body = "First line of the body.\nSecond line.\n\nBREAKING CHANGE: the topic moved."
    _git_commit(repository, f"fix: repair the topic\n\n{topic_body}", second=2)
    _git(repository, "switch", "--quiet", "main")
    _git_commit(repository, "docs: describe the first feature", second=3)
    _git(repository, "merge", "--quiet", "--no-ff", "--no-edit", "topic", second=4)
    _git_commit(repository, "feat: add a second feature", second=5)
    _git(repository, "tag", "v2.0.0_redesign")
    _git_commit(repository, "fix: correct the second feature", second=6)

    assert release.git_tags() == ["v2.0.0_redesign", "v2026.06.04"]
    everything = [
        RawCommit(subject="feat: add the first feature", body=""),
        RawCommit(subject="fix: repair the topic", body=topic_body),
        RawCommit(subject="docs: describe the first feature", body=""),
        RawCommit(subject="feat: add a second feature", body=""),
        RawCommit(subject="fix: correct the second feature", body=""),
    ]
    assert release.list_commits("", "HEAD") == everything
    assert release.list_commits("v2026.06.04", "HEAD") == everything[1:]
    assert release.list_commits("v2.0.0_redesign", "HEAD") == everything[4:]
    assert release.notes_command("v2026.06.04", "HEAD") == (
        "### \U0001F4A5 Breaking Changes\n\n- Repair the topic"
        "\n\n### ✨ New Features\n\n- Add a second feature"
        "\n\n### \U0001F41B Bug Fixes\n\n- Correct the second feature"
        "\n\n### \U0001F4DD Documentation\n\n- Describe the first feature"
    )
    assert release.plan("stable", "auto") == {
        "version": "2.0.1",
        "tag": "v2.0.1",
        "previous": "v2.0.0_redesign",
    }


def test_plan_and_notes_refuse_a_shallow_clone(monkeypatch, capsys):
    """A shallow clone -- what actions/checkout gives without fetch-depth:
    0 -- has no tags and a cut history, and the plan would still look
    plausible (1.0.1, v1.0.1_redesign) while being wrong. So plan and notes
    refuse it, and say why and what to do."""
    monkeypatch.setattr(release, "is_shallow_clone", lambda: True)
    monkeypatch.setattr(release, "git_tags", lambda: [])
    monkeypatch.setattr(release, "list_commits", lambda from_ref, to_ref: [])
    with pytest.raises(release.ReleaseError, match="shallow"):
        release.plan("stable", "major")
    with pytest.raises(release.ReleaseError, match="shallow"):
        release.notes_command("", "HEAD")
    for argv in (
        ["plan", "--type", "stable", "--bump", "major"],
        ["notes", "--from", "", "--to", "HEAD"],
    ):
        assert release.main(argv) == 1
        printed = capsys.readouterr()
        assert printed.out == ""
        assert "shallow" in printed.err
        assert "fetch-depth: 0" in printed.err


def test_git_says_whether_a_clone_is_shallow(repository, tmp_path, monkeypatch):
    """A clone with --depth 1 is shallow, the repository it came from is
    not -- and a plan in the shallow one is refused."""
    _git_commit(repository, "feat: add one", second=1)
    _git_commit(repository, "feat: add two", second=2)
    assert release.is_shallow_clone() is False
    clone = tmp_path / "shallow"
    _git(tmp_path, "clone", "--quiet", "--depth", "1", repository.as_uri(), str(clone))
    monkeypatch.chdir(clone)
    assert release.is_shallow_clone() is True
    with pytest.raises(release.ReleaseError, match="shallow"):
        release.plan("stable", "auto")


def test_a_git_failure_leaves_gits_own_message_in_the_log(repository):
    """git's own error -- here the unknown revision of a tag that does not
    exist -- reaches the log, rather than only an exit status 128 behind a
    traceback."""
    _git_commit(repository, "feat: add one", second=1)
    failed = subprocess.run(
        [sys.executable, str(_SCRIPT), "notes", "--from", "no-such-tag", "--to", "HEAD"],
        cwd=repository,
        env=_git_env(),
        capture_output=True,
        encoding="utf-8",
        check=False,
    )
    assert failed.returncode != 0
    assert "fatal:" in failed.stderr


def test_the_notes_are_utf_8_whatever_the_locale(repository):
    """The runner's locale is UTF-8; a maintainer's machine may not be --
    Windows reads and writes cp1252. So git's output is read as UTF-8, and
    the notes are written as UTF-8, regardless: here under the C locale
    with Python's UTF-8 mode off, where both would otherwise be ASCII.
    Final review 2 m5."""
    _git_commit(repository, "docs: explain the Größe of a wallet ✨", second=1)
    env = {
        name: value
        for name, value in _git_env().items()
        if not name.startswith(("LC_", "LANG", "PYTHON"))
    }
    env.update(LANG="C", LC_ALL="C", PYTHONUTF8="0", PYTHONCOERCECLOCALE="0")
    written = subprocess.run(
        [sys.executable, str(_SCRIPT), "notes", "--from", "", "--to", "HEAD"],
        cwd=repository,
        env=env,
        capture_output=True,
        check=False,
    )
    assert written.returncode == 0, written.stderr.decode("utf-8", "replace")
    assert written.stdout.decode("utf-8") == (
        "### \U0001F4DD Documentation\n\n- Explain the Größe of a wallet ✨\n"
    )


def test_a_byte_that_is_not_utf_8_does_not_stop_a_release(repository, tmp_path):
    """git commit turns a Latin-1 message into UTF-8 itself, but a commit
    object from elsewhere -- an import, a conversion -- can still carry a
    stray byte. It becomes U+FFFD in the notes instead of failing the
    release."""
    empty_tree = _git(repository, "write-tree")
    person = b"Test <test@example.invalid> 1790000000 +0000"
    commit_object = tmp_path / "commit"
    commit_object.write_bytes(
        b"tree " + empty_tree.encode() + b"\nauthor " + person + b"\ncommitter " + person
        + b"\n\ndocs: describe the caf\xe9 menu\n"
    )
    commit = _git(repository, "hash-object", "-t", "commit", "-w", str(commit_object))
    _git(repository, "update-ref", "refs/heads/main", commit)
    assert release.notes_command("", "HEAD") == (
        "### \U0001F4DD Documentation\n\n- Describe the caf� menu"
    )


# --------------------------------------------------------------------------
# What a release refuses: plan(..., for_release=True), the --for-release
# that release.yml's plan step passes and Validate's job does not -- on real
# repositories
# --------------------------------------------------------------------------

def _nothing_to_release(previous: str) -> str:
    """The refusal of a release with no commit since `previous`."""
    return (
        f"Nothing to release: no commit since {previous}. If {previous} was released"
        " a moment ago, there is nothing to do; if it has no GitHub release yet, create"
        " it by hand from the tag, or delete the tag if you withdrew its draft (see"
        " Releases in CONTRIBUTING.md)."
    )


def _not_a_major(planned: str) -> str:
    """The refusal of a first SemVer release, or a beta of it, that is not
    a major."""
    return (
        "No Semantic Versioning release exists yet: the first one, 2.0.0 (tag"
        " v2.0.0_redesign), and every beta of it need 'Version bump' set to major;"
        f" this run planned {planned}."
    )


def test_a_release_refuses_a_beta_with_no_commit_since_the_last_one(repository):
    """A beta's version commit lives only in its tag, on top of the commit
    it was released from. A pre-release started twice, or "Re-run all jobs"
    after its tag was pushed, runs on that same commit: nothing came after
    the tag, and it would publish the same changes again as the next beta,
    which HACS offers every installation that takes betas. With a commit
    since, the next beta goes out."""
    _git_commit(repository, "feat!: rework the integration", second=1)
    _git(repository, "tag", "v2.0.0_redesign")
    _git_commit(repository, "feat: add a sensor", second=2)
    _git(repository, "switch", "--quiet", "--detach")
    _git_commit(repository, "chore: bump version to 2.1.0-beta.1", second=3)
    _git(repository, "tag", "v2.1.0-beta.1")
    _git(repository, "switch", "--quiet", "main")

    with pytest.raises(release.ReleaseError) as refused:
        release.plan("prerelease", "auto", for_release=True)
    assert str(refused.value) == _nothing_to_release("v2.1.0-beta.1")

    _git_commit(repository, "fix: correct the sensor", second=4)
    assert release.plan("prerelease", "auto", for_release=True) == {
        "version": "2.1.0-beta.2",
        "tag": "v2.1.0-beta.2",
        "previous": "v2.1.0-beta.1",
    }


def test_a_release_refuses_a_stable_with_no_commit_since_the_last_one(repository):
    """A new run right after a stable release, on main, runs on the tagged
    version commit; a stable release started twice, or "Re-run all jobs"
    after its tag was pushed, on the commit that version commit went on top
    of. Neither has a commit since the tag, whatever the bump: each would
    publish an empty next version."""
    _git_commit(repository, "feat!: rework the integration", second=1)
    _git(repository, "tag", "v2.0.0_redesign")
    _git_commit(repository, "feat: add a sensor", second=2)
    _git_commit(repository, "chore: bump version to 2.1.0", second=3)
    _git(repository, "tag", "v2.1.0")

    with pytest.raises(release.ReleaseError) as refused:
        release.plan("stable", "auto", for_release=True)
    assert str(refused.value) == _nothing_to_release("v2.1.0")

    _git(repository, "switch", "--quiet", "--detach", "HEAD~1")
    with pytest.raises(release.ReleaseError) as refused:
        release.plan("stable", "patch", for_release=True)
    assert str(refused.value) == _nothing_to_release("v2.1.0")


@pytest.mark.parametrize("bump", ["auto", "major"])
def test_a_release_refuses_a_second_start_of_the_first_semver_beta(repository, bump):
    """2.0.0-beta.1, the next release, came from the date versions with
    "Version bump" forced to major. Started a second time, on the same
    commit, it has nothing to release -- and says so first, whatever the
    bump: "auto" is not told to set major for a release it must not make.
    With a commit since, the next beta goes out."""
    _git_commit(repository, "feat: add the first feature", second=1)
    _git(repository, "tag", "v2026.06.04")
    _git_commit(repository, "feat: add the redesign", second=2)
    _git(repository, "switch", "--quiet", "--detach")
    _git_commit(repository, "chore: bump version to 2.0.0-beta.1", second=3)
    _git(repository, "tag", "v2.0.0-beta.1")
    _git(repository, "switch", "--quiet", "main")

    with pytest.raises(release.ReleaseError) as refused:
        release.plan("prerelease", bump, for_release=True)
    assert str(refused.value) == _nothing_to_release("v2.0.0-beta.1")

    _git_commit(repository, "fix: correct the redesign", second=4)
    assert release.plan("prerelease", "major", for_release=True) == {
        "version": "2.0.0-beta.2",
        "tag": "v2.0.0-beta.2",
        "previous": "v2.0.0-beta.1",
    }


@pytest.mark.parametrize(
    ("previous", "change", "bump", "planned"),
    [
        ("v2.0.0_redesign", "feat: add a sensor", "auto",
         {"version": "2.1.0", "tag": "v2.1.0", "previous": "v2.0.0_redesign"}),
        ("v2026.06.04", "feat: add the redesign", "major",
         {"version": "2.0.0", "tag": "v2.0.0_redesign", "previous": "v2026.06.04"}),
    ],
    ids=["a_later_stable", "the_first_semver_stable"],
)
def test_the_recovery_run_plans_the_release_main_holds_without_its_tag(
    repository, previous, change, bump, planned
):
    """A stable's version commit reached main, its tag did not. The way out
    is a new run on main with the same settings (CONTRIBUTING.md,
    "Releases"): it has the change and the version commit since the
    previous release, so it plans the same version -- the empty-release
    guard does not stop it -- then commits nothing, tags and publishes."""
    _git_commit(repository, "feat!: rework the integration", second=1)
    _git(repository, "tag", previous)
    _git_commit(repository, change, second=2)
    _git_commit(repository, f"chore: bump version to {planned['version']}", second=3)

    assert release.plan("stable", bump, for_release=True) == planned


def test_validate_plans_where_a_release_finds_nothing_to_release(repository, capsys):
    """Validate's "Repository / Release script" job plans a stable release
    of whatever it checks: on dev right after main is merged back, that is
    the stable's own version commit, with no commit since its tag. The job
    passes no --for-release, so the plan goes through and the check stays
    green; with the flag, as the release passes it, the same plan is
    refused."""
    _git_commit(repository, "feat!: rework the integration", second=1)
    _git(repository, "tag", "v2.0.0_redesign")
    _git_commit(repository, "feat: add a sensor", second=2)
    _git_commit(repository, "chore: bump version to 2.1.0", second=3)
    _git(repository, "tag", "v2.1.0")

    assert release.main(["plan", "--type", "stable", "--bump", "auto"]) == 0
    assert capsys.readouterr().out == "version=2.1.1\ntag=v2.1.1\nprevious=v2.1.0\n"
    assert release.main(["plan", "--type", "stable", "--bump", "auto", "--for-release"]) == 1
    printed = capsys.readouterr()
    assert printed.out == ""
    assert printed.err == f"release.py: {_nothing_to_release('v2.1.0')}\n"


@pytest.mark.parametrize(
    ("release_type", "bump", "planned"),
    [
        ("stable", "auto", "1.1.0"),
        ("stable", "minor", "1.1.0"),
        ("stable", "patch", "1.0.1"),
        ("prerelease", "auto", "1.1.0-beta.1"),
        ("prerelease", "minor", "1.1.0-beta.1"),
        ("prerelease", "patch", "1.0.1-beta.1"),
    ],
)
def test_a_release_refuses_a_first_semver_release_that_is_not_a_major(
    repository, release_type, bump, planned
):
    """Until the first SemVer stable exists, a version counts on from the
    date versions' 1.0.0: without a breaking commit, "auto" plans 1.1.0,
    tagged v1.1.0_redesign -- which HACS offers every installation on a date
    version, and the one-time suffix is spent. So a release insists on a
    major, for the first stable and for every beta of it. Validate's plan,
    without the flag, goes through as before."""
    _git_commit(repository, "feat: add the first feature", second=1)
    _git(repository, "tag", "v2026.06.04")
    _git_commit(repository, "feat: add the redesign", second=2)

    assert release.plan(release_type, bump)["version"] == planned
    with pytest.raises(release.ReleaseError) as refused:
        release.plan(release_type, bump, for_release=True)
    assert str(refused.value) == _not_a_major(planned)


def test_a_release_plans_the_first_semver_release_as_a_major(repository):
    """Forced to major -- or on "auto" once a breaking commit came after the
    date versions -- the first release is 2.0.0, tagged v2.0.0_redesign, and
    a beta of it 2.0.0-beta.1."""
    _git_commit(repository, "feat: add the first feature", second=1)
    _git(repository, "tag", "v2026.06.04")
    _git_commit(repository, "feat: add the redesign", second=2)
    stable = {"version": "2.0.0", "tag": "v2.0.0_redesign", "previous": "v2026.06.04"}
    beta = {"version": "2.0.0-beta.1", "tag": "v2.0.0-beta.1", "previous": "v2026.06.04"}
    assert release.plan("stable", "major", for_release=True) == stable
    assert release.plan("prerelease", "major", for_release=True) == beta

    _git_commit(repository, "refactor!: rework the sensors", second=3)
    assert release.plan("stable", "auto", for_release=True) == stable
    assert release.plan("prerelease", "auto", for_release=True) == beta


def test_a_release_after_the_first_semver_stable_takes_any_bump(repository):
    """Once a SemVer stable exists, a minor release, or a beta of one, goes
    out."""
    _git_commit(repository, "feat: add the first feature", second=1)
    _git(repository, "tag", "v2026.06.04")
    _git_commit(repository, "feat!: rework the integration", second=2)
    _git(repository, "tag", "v2.0.0_redesign")
    _git_commit(repository, "fix: correct a sensor", second=3)
    assert release.plan("stable", "minor", for_release=True) == {
        "version": "2.1.0",
        "tag": "v2.1.0",
        "previous": "v2.0.0_redesign",
    }
    assert release.plan("prerelease", "minor", for_release=True) == {
        "version": "2.1.0-beta.1",
        "tag": "v2.1.0-beta.1",
        "previous": "v2.0.0_redesign",
    }
