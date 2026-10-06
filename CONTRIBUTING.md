# Contributing

Thanks for your interest in improving this integration. This is a small personal project, so the process is deliberately light.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a security vulnerability** — privately, never as a public issue: see the [security policy](SECURITY.md).
- **Report a bug** — [open a bug report](https://github.com/Spegeli/hacs_bambuddy/issues/new?template=bug_report.yml). The versions of the integration, BamBuddy and Home Assistant, and a debug log, help most.
- **Suggest a feature** — [open a feature request](https://github.com/Spegeli/hacs_bambuddy/issues/new?template=feature_request.yml).
- **Improve translations** — corrections and new languages are welcome, see [Translations](#translations).
- **Submit a change** — see [Pull requests](#pull-requests).

Problems with BamBuddy itself — its web interface, its printer connection — belong to [BamBuddy's issue tracker](https://github.com/maziggy/bambuddy/issues).

## Branches

- **`main`** holds the released code. It changes only through the pull request from `dev` and through a release's version commit, and it merges only with a green **Validation result** (see [Continuous integration](#continuous-integration)).
- **`dev`** is where work comes together; betas are released from it.
- **Topic branches** start from `dev` and go back into it.

## Pull requests

1. Fork the repository and branch from `dev`.
2. Keep the change focused — one topic per pull request.
3. Write the commit messages as [Conventional Commits](https://www.conventionalcommits.org) — see [Commit messages](#commit-messages).
4. Open the pull request against `dev` and fill in the template.
5. Validate checks it automatically (see [Continuous integration](#continuous-integration)); it is merged once its **Validation summary** is green. A first-time contributor's run waits for the maintainer's approval, so run the tests and mypy yourself first (see [Tests and typing](#tests-and-typing)): you get the answer sooner.

**Do not bump the version in `manifest.json`.** The Create Release workflow sets it (see [Releases](#releases)).

## Development setup

No build step and no dependencies beyond Home Assistant itself.

1. Fork and clone the repository.
2. Copy `custom_components/bambuddy/` into your Home Assistant `config/custom_components/` directory — or symlink it, so edits apply without copying again.
3. Restart Home Assistant.
4. Add the integration: **Settings → Devices & services → Add integration → BamBuddy**.

You need a BamBuddy server and an API key (see the README's [Create an API key](README.md#create-an-api-key)). Test with BamBuddy's authentication on, so that the key's permissions apply, and with a key that has only **Read Status** unless you work on the print controls. **Try the print controls only on a printer that is not printing**: pause, stop and the other commands act on the real printer.

To see what the integration is doing, enable debug logging in `configuration.yaml`:

```yaml
logger:
  logs:
    custom_components.bambuddy: debug
```

### Tests and typing

Tests use `pytest-homeassistant-custom-component`, whose harness does not run on Windows. Each of its releases pins one Home Assistant release; the suite runs against the newest stable Home Assistant that has one, never a beta, as CI does (see [Continuous integration](#continuous-integration)). `python .github/scripts/ha_version.py` names that release and its package release, `--plugin` the package release alone. `tests/requirements.txt` pins mypy and the rest. Install mypy from that file too, never with a bare `pip install mypy`: another mypy release can report errors CI does not, or miss ones it does. The tests and mypy need Python 3.14; the integration itself must still run on 3.13 (see [Things that are easy to get wrong](#things-that-are-easy-to-get-wrong)). On Linux or macOS, with Python 3.14:

```bash
pip install -r tests/requirements.txt "pytest-homeassistant-custom-component==$(python .github/scripts/ha_version.py --plugin)"
python -m pytest tests/ -q --cov=custom_components.bambuddy --cov-report=term-missing
python -m mypy --strict
```

`pytest` runs the suite and reports the line coverage of each file, as CI does; there is no coverage gate yet. `mypy` checks the scripts in `.github/scripts` in strict mode, as `pyproject.toml` configures it; the integration joins once it is typed. The tests are not type-checked.

The same in Docker, on any system, with the Python version and the requirements CI uses; each run installs them afresh, which takes a few minutes. On Windows, run it from PowerShell: Git Bash rewrites the mount path.

```bash
docker run --rm -v "${PWD}:/workspace" -w /workspace python:3.14 sh -c 'pip install -q -r tests/requirements.txt "pytest-homeassistant-custom-component==$(python .github/scripts/ha_version.py --plugin)" && python -m pytest tests/ -q --cov=custom_components.bambuddy --cov-report=term-missing && python -m mypy --strict'
```

On the minimum Home Assistant in `hacs.json`, as CI's second test job runs it:

```bash
docker run --rm -v "${PWD}:/workspace" -w /workspace python:3.13 sh -c 'pip install -q -r tests/requirements-floor.txt && python -m pytest tests/ -q'
```

CI runs both (see [Continuous integration](#continuous-integration)): the suite must pass on both Home Assistant releases, and `mypy --strict` must report no error.

## Project layout

Everything lives in `custom_components/bambuddy/`:

| File | Responsibility |
|---|---|
| `__init__.py` | Setup and unload; one coordinator per printer added in the options; deleting a printer's device from its device page (the instance's device cannot be deleted) |
| `api.py` | `BamBuddyClient` — all HTTP calls to BamBuddy |
| `binary_sensor.py` | Printer binary sensors: online, SD card, HMS errors, wired network, developer mode |
| `brand/` | Icon and logo for Home Assistant's brands proxy |
| `button.py` | Printer buttons: pause, resume, stop, clear HMS errors, clear plate, refresh status |
| `camera.py` | MJPEG stream and snapshot through BamBuddy's camera proxy, with a stream token kept for 55 minutes |
| `config_flow.py` | Setup (host, port, API key) and the options (Configure): add and remove printers |
| `const.py` | Domain, config keys, default port, update interval, print speed modes |
| `coordinator.py` | The instance coordinator (`/health`, `/system/info`, `/archives/stats`) and one coordinator per printer (`/printers/{id}`, `/printers/{id}/status`) |
| `entity.py` | `BamBuddyPrinterEntityMixin` — the printer device's info, shared by every printer entity |
| `image.py` | The cover image of the current print job |
| `select.py` | Print speed |
| `sensor.py` | Instance and printer sensors |
| `strings.json`, `translations/` | UI strings, two languages (see [Translations](#translations)) |
| `switch.py` | Chamber light |

Both coordinators poll every 10 seconds.

## Things that are easy to get wrong

**`/health` lies outside `/api/v1` and needs no key.** Every other endpoint is under `/api/v1` and needs the `X-API-Key` header.

**BamBuddy's field names are not always the obvious ones.** The current layer is `layer_num`, not `current_layer`; `remaining_time` is in minutes; the print speed is `speed_level` (1 Silent, 2 Standard, 3 Sport, 4 Ludicrous); the auxiliary and chamber fans are `big_fan1_speed` and `big_fan2_speed`.

**Printers without a chamber sensor report `temperatures.chamber` as `null`** — the A1 Mini, for one. The Chamber Temperature sensor is created only when the printer reports a value at setup.

**Never set `model_id` on a device:** Home Assistant then shows the model twice. A printer's model reads `BamBuddy Printer (<model>)`.

**Permissions count only with BamBuddy's authentication on.** With it off, BamBuddy answers every request, so a missing permission shows only with authentication on. Test with it on: with a key that has only **Read Status**, the print controls must fail with 403.

**Home Assistant 2025.5 is the floor** (`homeassistant` in `hacs.json`), and only APIs that exist there may be used. Home Assistant 2025.5 runs on Python 3.13, so the integration must run on 3.13 too, although the tests and mypy run on 3.14: use no syntax and no standard-library API newer than 3.13 (such as `except A, B:` without parentheses), and keep `from __future__ import annotations` at the top of every module. 3.13 evaluates annotations as it defines a class or function, so without that line a name defined further down the module fails the import there, while 3.14 evaluates them only when asked. CI compiles the integration with Python 3.13, checks that every module keeps `from __future__ import annotations`, and runs the suite on 2025.5; what the tests do not reach is for review.

## Translations

The integration ships two languages under `translations/`: English (`en`) and German (`de`). Corrections and new languages by native speakers are welcome.

`strings.json` is the source of truth, and `translations/en.json` mirrors it exactly. **Changing a text means changing it in every translation file**: edit `strings.json`, copy it to `translations/en.json`, and change the same key in `translations/de.json` in the same pull request. A new key goes into every file.

Entity names are not translated yet: they are English, set in the code.

Which language a text is shown in depends on who writes it out:

- **Home Assistant's frontend**, in each user's profile language: the setup and options dialogs.
- **Home Assistant's backend**, in its system language: the integration's error messages (`exceptions`), such as the refusal to delete the BamBuddy instance's device.

Write the files as UTF-8 without a BOM, formatted like the others (`json.dumps(..., indent=2, ensure_ascii=False)`).

## Code style

Follow the [Home Assistant developer guidelines](https://developers.home-assistant.io/docs/development_guidelines). In short:

- Type hints on everything new.
- Docstrings on modules, classes and public functions.
- `async`/`await` for anything touching the network.
- Constants in `const.py`, not inline.

## Continuous integration

One workflow, **Validate** (`.github/workflows/validate.yml`), checks every change. The checks themselves live in three groups, each a workflow of its own, which a release runs as well: **Newest HA** (`.github/workflows/_validate_newest.yml`), **Minimum HA** (`_validate_minimum.yml`) and **Repository** (`_validate_repository.yml`). GitHub names each check after its group:

| Check | What it runs |
|---|---|
| Newest HA / Hassfest | Home Assistant's own checks of the integration (`hassfest`), as the Home Assistant release below |
| Newest HA / Tests | the suite on Python 3.14, as under [Tests and typing](#tests-and-typing); reports the line coverage, without a gate yet |
| Newest HA / Strict typing | `python -m mypy --strict` on Python 3.14 — the release scripts for now |
| Minimum HA / Python 3.13 | a compile of the integration with Python 3.13, the Python of the 2025.5 floor, and a check that every module keeps `from __future__ import annotations` |
| Minimum HA / Tests | the suite on Python 3.13 against the minimum release in `hacs.json` (`tests/requirements-floor.txt`), after a check that the installed release is that one |
| Repository / HACS validation | HACS's checks of the repository |
| Repository / Release script | a compile of `.github/scripts/release.py` with Python 3.12 — the release runs it on the runner's own Python — and a stable release planned from the whole history |

**Which Home Assistant.** Hassfest, the tests and mypy check against one release: the newest stable Home Assistant that `pytest-homeassistant-custom-component` has been released for, never a beta. Each of the three jobs finds it first with `.github/scripts/ha_version.py` and names it in its log. So a new stable release reaches CI without a change in this repository, and it can turn a run red although nothing changed here: then the integration needs an update for that release, before the next release goes out. The tests also run against the minimum Home Assistant release in `hacs.json` (`tests/requirements-floor.txt`): raise both together. That job can turn red without a change here as well: the dependencies of the minimum's packages are not all pinned. HACS validation depends on no Home Assistant release: it checks the repository against HACS's own rules.

When Validate runs:

- **A push to any branch but `main`** — all seven checks.
- **A pull request to `main` or `dev`** — all seven checks.
- **By hand** — all seven checks as well: Actions → Validate → Run workflow, on any branch.

Validate does not run on `main` itself: changes reach it only through a validated pull request, or as a release's version commit, validated just before. A newer push to the same branch, or a new commit in the same pull request, cancels the run it makes obsolete. A run started by hand and a push's run on the same branch cancel each other as well, whichever starts later cancelling the other: start one by hand only after the push's run has finished, or that run is cancelled and its Validation summary turns red.

One last check sums up each run: green when every check passed, red when one failed or the run was cancelled. A pull request to `main` calls it **Validation result**, the check `main` requires: a pull request to `main` merges only when it is green. Every other run — a pull request to `dev`, a push, a run by hand — calls it **Validation summary**: GitHub counts a required check by its name on a commit, so only the run that validates the merge into `main` may answer for it. A pull request to `dev` is merged once its Validation summary is green.

A pull request from a fork, to `dev` or to `main`, runs the same checks, with a read-only token and no secrets: Validate uses `pull_request`, never `pull_request_target`. A first-time contributor's run waits for the maintainer's approval. In your own fork, Validate works as it is: it needs no secrets.

## Commit messages

A release computes its version from the commit messages and writes its release notes from their subjects (see [Releases](#releases)), so a commit's type decides where the change shows up:

| Type | Release notes section |
|---|---|
| `feat` | ✨ New Features |
| `perf` | ⚡ Improvements |
| `fix` | 🐛 Bug Fixes |
| `refactor`, `style` | ♻️ Refactor & Code Quality |
| `docs` — user-facing documentation, the README | 📝 Documentation |
| `test`, `ci`, `build`, `chore` | not listed — unless breaking or scoped `security` (below) |

- **A change to CI, the tests or the release tooling alone is `ci:`, `test:`, `build:` or `chore:`** — also when it fixes or adds something there. **So is a change to the contributor documentation alone** — this file, the issue and pull request templates: `chore:`. `docs:` is for what the people who run the integration read, the README. The notes are for them: a `fix:` for a workflow would show up among their bug fixes, a `docs:` for this file among their documentation.
- A breaking change — a `!` after the type or the scope (`feat!:`, `fix(scope)!:`, `ci!:`), or a line that starts with `BREAKING CHANGE:` in the message body — makes the next version a major one on **any** type, `ci`, `test`, `build` and `chore` included, and is listed under 💥 Breaking Changes, and only there. So mark only what breaks an installation as breaking.
- The scope `security`, with any type — `chore` and `build` included — lists the change under 🔒 Security.
- Write the description for the people who run the integration, in the imperative: the notes print it with a capital first letter, the scope in bold before it — `fix(camera): renew …` becomes "**camera:** Renew …". Within a section, a description whose first word is `add` (or `adds`, `added`, `adding`) comes first, then everything else, then the forms of `fix`, then the forms of `remove`, `drop` and `delete`.

## Releases

The maintainer releases with the **Create Release** workflow (`.github/workflows/release.yml`); nobody bumps the version in `manifest.json` by hand. A release is one of two types, chosen under "Release type":

| | Stable (`stable`) | Pre-release (`prerelease`), a beta |
|---|---|---|
| Runs on | `main` | `dev` |
| Version and tag | `X.Y.Z`, tag `vX.Y.Z` | `X.Y.Z-beta.N`, tag `vX.Y.Z-beta.N` |
| Version commit | pushed to `main`, then tagged | only in its tag: `dev` stays as it is |
| GitHub release | published at once and marked latest — or a draft, when asked for | published at once, marked as a pre-release, never latest |
| HACS offers it | to everyone | only to installations that switched pre-releases on (see the README's [Beta versions](README.md#beta-versions)) |
| Release notes list | the changes since the previous stable release | the changes since the previous release of either type |

**Versions** follow [Semantic Versioning](https://semver.org). The next stable version is the last stable one plus a bump the commits since then call for (see [Commit messages](#commit-messages)): major when one of them is a breaking change, else minor when one is a `feat`, else patch. "Version bump" overrides that with major, minor or patch. A beta carries the stable version it leads to: after `2.0.0`, a `feat` on `dev` makes the betas `2.1.0-beta.1`, `2.1.0-beta.2`, and then the stable `2.1.0`. `manifest.json` gets the version without the `v`. A forced bump holds for its own run only — every run computes the version again. So force the same bump for every beta of a version and for its stable release: `major` for `3.0.0` and each of its betas. A later run on "auto" could plan `2.1.0`, which ranks below the `3.0.0` betas already out, so HACS offers it to none of their installations.

**From the date versions to 2.0.0.** The date versions (`2026.05.17` and older) are the 1.x line: until the first Semantic Versioning stable exists, the next version counts from `1.0.0`. That first one is `2.0.0`: release it — and any beta of it — with "Version bump" set to major, which "auto" would count as `1.1.0`. Its tag, once, is `v2.0.0_redesign`: HACS cannot read that tag as a version and compares it with the installed one as text, so every installation on a date version sees the update, while a plain `2.0.0` ranks below `2026.05.17`. `manifest.json` says `2.0.0` and the release is titled `v2.0.0`; later tags are plain again. An installation that skips `2.0.0` and stays on a date version sees no later update either. A beta of `2.0.0` ranks below the date versions as well, so HACS offers it to nobody, pre-releases switched on or not: install it by hand, with Redownload → "Need a different version?". The early tags `v0.0.1b1` and `v0.0.1b2` count as neither: the release script ignores them.

**Release notes** are generated from the commit subjects (see [Commit messages](#commit-messages)), in sections in this order, empty ones left out: 💥 Breaking Changes, ✨ New Features, ⚡ Improvements, 🐛 Bug Fixes, 🔒 Security, ♻️ Refactor & Code Quality, 📝 Documentation. For notes written by hand — `2.0.0`'s — tick "Create a stable release as a draft, to write its notes by hand": the draft carries the generated notes, to be replaced before it is published. A pre-release cannot be a draft: HACS does not see drafts. A draft's tag is pushed already, and it counts as released: it decides the next version, the notes' range and, for `2.0.0`, the one-time suffix. So to withdraw a draft, delete the draft **and its tag** before the next run. The version commit on `main` can stay: a next run with the same settings finds the version in `manifest.json` and commits nothing. With the tag kept, the next run stops with "Nothing to release"; once more was merged, it plans past the tag — for `2.0.0` a plain `v3.0.0` or `v2.0.1`, which no installation on a date version is offered.

To release: Actions → Create Release → Run workflow, on `main` for a stable release or on `dev` for a pre-release. Whenever something in the release path has changed since the last release — the workflow, the release script, the deploy key, `main`'s ruleset — tick "Dry run: validate, compute the version, tag and notes; push and publish nothing" first. The workflow

1. fails at once unless a stable release runs on `main`, and a pre-release on `dev` and not as a draft ("Check branch and type");
2. runs the complete validation: every check under [Continuous integration](#continuous-integration), in the same three groups ("Newest HA", "Minimum HA", "Repository");
3. computes the version, its tag and the release notes with `.github/scripts/release.py`, sets the version in `manifest.json`, stops unless the file then carries exactly that version, and commits it as `github-actions[bot]` (`chore: bump version to <version>`), on top of exactly the commit it validated ("Set version and tag");
4. pushes with the deploy key whose private key is the secret `RELEASE_DEPLOY_KEY`: a stable release pushes the commit to `main` — the one direct push `main`'s ruleset lets through — and then the tag; a pre-release pushes only the tag, which takes the commit along. The job that holds the key runs no third-party action, only `actions/checkout`, shell and the release script: a tampered action could read the key;
5. creates the GitHub release, titled `v<version>`, with the generated notes, in a job of its own that gets neither a checkout nor the key ("Publish release").

A dry run goes through steps 1–3, the commit staying in the runner: it shows the version, the tag, the previous release, the version commit and the notes, checks that the deploy key reaches the repository (when the secret is set), and stops — it pushes, tags and publishes nothing. It cannot tell whether the key may push past `main`'s ruleset; only a real release shows that.

When a release fails:

- **`main` refuses the push** (step 4): either `main` moved while the release ran — a pull request merged meanwhile, a state that was never validated — or the deploy key cannot push to `main`: it lacks write access, or it is missing from the ruleset's bypass list. Nothing is tagged or published. Fix the key or the ruleset if that was the cause, then start a **new** run (Actions → Create Release → Run workflow). "Re-run jobs" would repeat the failed run on its original commit, which `main` refuses again once it has moved. A new run right after a stable release finds nothing to release and stops at its plan (the last case below).
- **The secret `RELEASE_DEPLOY_KEY` is missing**: the release stops with an error before it commits anything.
- **The tag's push fails after `main` took the commit**: start a new run on `main` with the same settings — not "Re-run jobs", whose commit `main` now refuses. The new run computes the same version, finds it in `manifest.json` already and commits nothing, then tags and publishes.
- **Publishing fails after the tag was pushed** (step 5): the tag exists, without a release. Use **Re-run failed jobs**: only "Publish release" runs again, with the same tag, title and notes, because GitHub reuses the outputs of the jobs that succeeded. Never use **Re-run all jobs**, and do not start a new run: both stop at their plan with "Nothing to release" (below), and then only a release by hand is left; once more was merged, a new run releases the next version instead, and this tag stays without a release. If "Publish release" fails again, create the release from the tag by hand (Releases → Draft a new release → choose the tag), titled `v<version>`, marked as a pre-release for a beta, with the notes the "Set version and tag" job printed in its log.
- **The plan stops with "Nothing to release"** (step 3), before anything is committed: no commit came after the previous release — the same release was started a second time, "Re-run all jobs" came after its tag was pushed, or a new run came right after a stable release. If the previous release is published, there is nothing to do; if its tag has no GitHub release yet, create the release from the tag by hand, as under "Publishing fails" — or, for a draft you withdrew, delete the tag.

After a stable release, merge `main` into `dev`, so the version commit reaches `dev` too: `git switch dev`, `git pull`, `git merge origin/main`, `git push`. A pre-release leaves nothing to merge.

## After merging

- A change on `dev` reaches `main` with the next pull request from `dev`.
- Installations get it with the next release: a beta from `dev` brings it to those that switched pre-releases on (see the README's [Beta versions](README.md#beta-versions)), a stable release to everyone.

## License

Contributions are licensed under the repository's [MIT License](LICENSE).
