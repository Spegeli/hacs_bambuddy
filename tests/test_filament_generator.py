"""The generator that turns Bambu Studio's system profiles into the
integration's filament list, against a small checkout in the fixtures."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType
from typing import Any

import pytest

_SCRIPT = Path(__file__).parents[1] / ".github" / "scripts" / "bambu_filaments.py"
FIXTURE = Path(__file__).parent / "fixtures" / "bambu_studio"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("bambu_filaments", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


bambu_filaments = _load()
build = bambu_filaments.build
main = bambu_filaments.main


def test_the_first_preset_by_name_gives_setting_id_and_range() -> None:
    """As Bambu Studio sends it, whatever the printer: the first preset
    carrying the id ("@BBL A1" before "@BBL X1C", whose range differs)."""
    data = build(FIXTURE, "abc")
    assert data["filaments"]["GFA00"] == {
        "vendor": "Bambu Lab", "name": "Bambu PLA Basic", "type": "PLA",
        "setting_id": "GFSA00_04", "temp_min": 190, "temp_max": 240,
    }  # fmt: skip


def test_support_filaments_carry_studios_support_type() -> None:
    assert build(FIXTURE, "abc")["filaments"]["GFS02"]["type"] == "PLA-S"


def test_templates_are_no_filaments() -> None:
    assert set(build(FIXTURE, "abc")["filaments"]) == {"GFA00", "GFL99", "GFS02", "GFSNL03", "GFT01", "GFB00"}


def test_the_models_get_the_integrations_names_and_studios_diameters() -> None:
    printers = build(FIXTURE, "abc")["printers"]
    # Bambu Lab, Generic, SUNLU; PLA before the other types, then by name.
    assert printers["A1"]["0.4"]["ids"] == ["GFA00", "GFS02", "GFL99", "GFSNL03"]
    assert printers["A1 MINI"]["0.4"]["ids"] == ["GFL99"]
    assert printers["H2D"]["0.4"]["ids"] == ["GFB00", "GFT01"]
    assert set(printers) == {"A1", "A1 MINI", "X1C", "H2D"}


def test_a_two_nozzle_printer_names_the_nozzles_a_filament_is_not_for() -> None:
    """Its extruder map comes from the common file it inherits: the PET-CF
    prints only on extruder index 0 (the left one), the ABS is refused there."""
    h2d = build(FIXTURE, "abc")["printers"]["H2D"]["0.4"]
    assert h2d["not_on"] == {"0": ["GFT01"], "1": ["GFB00"]}


def test_a_one_nozzle_printer_has_no_nozzle_list() -> None:
    assert "not_on" not in build(FIXTURE, "abc")["printers"]["A1"]["0.4"]


def test_vendors_in_bambu_studios_order() -> None:
    assert build(FIXTURE, "abc")["vendors"] == ["Bambu Lab", "Generic", "SUNLU"]


def test_the_source_is_named() -> None:
    assert build(FIXTURE, "abc")["source"] == {
        "repository": "https://github.com/bambulab/BambuStudio", "commit": "abc",
        "profiles": "01.00.00.01", "licence": "AGPL-3.0",
    }  # fmt: skip


def test_corrections_apply(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bambu_filaments, "MODEL_CORRECTIONS", {"A1 MINI": {"remove": ["GFL99"], "add": ["GFA00"]}})
    assert build(FIXTURE, "abc")["printers"]["A1 MINI"]["0.4"]["ids"] == ["GFA00"]


def test_an_extra_filament_joins_the_list(monkeypatch: pytest.MonkeyPatch) -> None:
    extra = {"vendor": "Generic", "name": "Generic PLA Test", "type": "PLA", "setting_id": "GFSL00", "temp_min": 190, "temp_max": 230}
    monkeypatch.setattr(bambu_filaments, "EXTRA_FILAMENTS", {"GFZ00": extra})
    monkeypatch.setattr(bambu_filaments, "MODEL_CORRECTIONS", {"A1 MINI": {"add": ["GFZ00"]}})
    data = build(FIXTURE, "abc")
    assert data["filaments"]["GFZ00"] == extra
    assert data["printers"]["A1 MINI"]["0.4"]["ids"] == ["GFL99", "GFZ00"]


def test_a_changed_rule_stops_the_generator(tmp_path: Path) -> None:
    """The integration checks four of Bambu's prohibitions itself: a
    checkout where one of them reads otherwise is no list to ship."""
    checkout = tmp_path / "bs"
    for path in FIXTURE.rglob("*.json"):
        target = checkout / path.relative_to(FIXTURE)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    rules = checkout / "resources" / "printers" / "filaments_blacklist.json"
    data = json.loads(rules.read_text(encoding="utf-8"))
    data["blacklist"][0]["slot"] = "ext"
    rules.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(SystemExit, match="TPU"):
        build(checkout, "abc")


def test_main_writes_the_file(tmp_path: Path) -> None:
    out = tmp_path / "filaments.json"
    assert main([str(FIXTURE), "--commit", "abc", "--out", str(out)]) == 0
    text = out.read_bytes().decode("utf-8")
    assert json.loads(text) == build(FIXTURE, "abc")
    assert "\r\n" not in text and text.endswith("}\n")


def _copy(tmp_path: Path) -> Path:
    """A copy of the fixture checkout, to change."""
    import shutil

    shutil.copytree(FIXTURE, tmp_path / "bs")
    return tmp_path / "bs"


def test_a_prohibition_nobody_checks_stops_the_list(tmp_path: Path) -> None:
    """A prohibition Bambu adds: neither checked by the integration nor left
    out on purpose -- no list until someone decides."""
    checkout = _copy(tmp_path)
    path = checkout / "resources" / "printers" / "filaments_blacklist.json"
    blacklist = json.loads(path.read_text(encoding="utf-8"))
    blacklist["blacklist"].append({"name_suffix": "PLA Glow", "action": "prohibition", "slot": "ams", "description": "x"})
    path.write_text(json.dumps(blacklist), encoding="utf-8")

    with pytest.raises(SystemExit, match="PLA Glow"):
        build(checkout, "abc")


def test_a_prohibition_left_out_on_purpose_passes() -> None:
    """The fixture holds the P1 and X1 Carbon high-flow rule for PA6-GF:
    BamBuddy reports no flow for those nozzles."""
    assert build(FIXTURE, "abc")["printers"]


def test_a_printer_without_its_machine_preset_stops_the_list(tmp_path: Path) -> None:
    """A renamed machine file would drop that printer's nozzle rules unseen."""
    checkout = _copy(tmp_path)
    path = checkout / "resources" / "profiles" / "BBL.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["machine_list"] = [entry for entry in manifest["machine_list"] if entry["name"] != "Bambu Lab H2D 0.4 nozzle"]
    path.write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(SystemExit, match="Bambu Lab H2D 0.4 nozzle"):
        build(checkout, "abc")


def test_a_printer_named_otherwise_stops_the_list(tmp_path: Path) -> None:
    """A compatible printer the generator cannot read is no printer to drop."""
    checkout = _copy(tmp_path)
    path = checkout / "resources" / "profiles" / "BBL" / "filament" / "Generic PLA.json"
    preset = json.loads(path.read_text(encoding="utf-8"))
    preset["compatible_printers"] = [*preset["compatible_printers"], "Bambu Lab A1 (0.4 nozzle)"]
    path.write_text(json.dumps(preset), encoding="utf-8")

    with pytest.raises(SystemExit, match=r"Bambu Lab A1 \(0.4 nozzle\)"):
        build(checkout, "abc")


_SHA = "79df7ae309be398ed30c9f397c13c9911c2edc57"


def _fake_git(calls: list[tuple[tuple[str, ...], Path | None]]) -> Any:
    def git(*args: str, cwd: Path | None = None) -> str:
        calls.append((args, cwd))
        if args[0] == "clone":
            (Path(args[-1]) / ".git").mkdir(parents=True)
        if args == ("remote", "get-url", "origin"):
            return "https://github.com/bambulab/BambuStudio.git"
        return "f" * 40 if args == ("rev-parse", "HEAD") else ""

    return git


def test_fetch_makes_a_sparse_clone_of_bambu_studio(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Only the profiles and the printers' files, in Bambu Studio's own
    layout, without the rest of its history or files; the commit read from
    the clone."""
    calls: list[tuple[tuple[str, ...], Path | None]] = []
    monkeypatch.setattr(bambu_filaments, "_git", _fake_git(calls))
    target = tmp_path / ".bambu-studio"

    assert bambu_filaments.fetch(target, _SHA) == "f" * 40

    assert [args for args, _ in calls] == [
        ("clone", "--quiet", "--filter=blob:none", "--no-checkout", "--sparse", "--depth", "1",
         "https://github.com/bambulab/BambuStudio.git", str(target)),
        ("sparse-checkout", "set", "--cone", "resources/profiles/BBL", "resources/printers"),
        ("fetch", "--quiet", "--depth", "1", "--filter=blob:none", "origin", _SHA),
        ("-c", "advice.detachedHead=false", "checkout", "--quiet", "--force", "--detach", "FETCH_HEAD"),
        ("rev-parse", "HEAD"),
    ]  # fmt: skip
    assert all(cwd == target for _, cwd in calls[1:])


def test_fetch_brings_its_folder_up_to_date(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A second run fetches into the folder there is: Bambu Studio's newest
    state unless a ref is named."""
    calls: list[tuple[tuple[str, ...], Path | None]] = []
    monkeypatch.setattr(bambu_filaments, "_git", _fake_git(calls))
    target = tmp_path / ".bambu-studio"
    (target / ".git").mkdir(parents=True)

    bambu_filaments.fetch(target)

    assert [args[0] for args, _ in calls] == ["remote", "sparse-checkout", "fetch", "-c", "rev-parse"]
    assert calls[2][0][-1] == "HEAD"


def test_fetch_uses_no_folder_of_another_repository(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A .bambu-studio that is no clone of Bambu Studio: no list from it."""
    calls: list[tuple[tuple[str, ...], Path | None]] = []
    git = _fake_git(calls)
    monkeypatch.setattr(bambu_filaments, "_git", lambda *args, cwd=None: "https://example.com/other.git" if args[0] == "remote" else git(*args, cwd=cwd))
    target = tmp_path / ".bambu-studio"
    (target / ".git").mkdir(parents=True)

    with pytest.raises(SystemExit, match="no clone of Bambu Studio"):
        bambu_filaments.fetch(target)
    assert [args[0] for args, _ in calls] == []


def test_git_says_why_it_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    def run(*_args: Any, **_kwargs: Any) -> Any:
        raise bambu_filaments.subprocess.CalledProcessError(128, ["git", "fetch"], stderr="fatal: couldn't find remote ref v9\n")

    monkeypatch.setattr(bambu_filaments.subprocess, "run", run)
    with pytest.raises(SystemExit, match="couldn't find remote ref v9"):
        bambu_filaments._git("fetch", "origin", "v9")
    # Named by its command, not by an option before it.
    with pytest.raises(SystemExit, match="^git checkout failed"):
        bambu_filaments._git("-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD")


def test_fetch_writes_the_list_from_the_repositorys_own_folder(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """--fetch: into .bambu-studio at the repository's root, then the list
    from it, its commit named without a --commit by hand."""
    asked: list[tuple[Path, str]] = []

    def fetch(target: Path, ref: str = "HEAD") -> str:
        asked.append((target, ref))
        return "c" * 40

    assert Path(__file__).parents[1] / ".bambu-studio" == bambu_filaments.FETCH_DIR
    monkeypatch.setattr(bambu_filaments, "fetch", fetch)
    monkeypatch.setattr(bambu_filaments, "FETCH_DIR", FIXTURE)
    out = tmp_path / "filaments.json"

    assert main(["--fetch", "--ref", _SHA, "--out", str(out)]) == 0

    assert asked == [(FIXTURE, _SHA)]
    assert json.loads(out.read_text(encoding="utf-8"))["source"]["commit"] == "c" * 40


@pytest.mark.parametrize(
    "argv",
    [
        [],
        ["--fetch", str(FIXTURE)],
        [str(FIXTURE)],
        ["--fetch", "--commit", "abc"],
        [str(FIXTURE), "--commit", "abc", "--ref", "v1"],
        # git fetches a commit by its full id only.
        ["--fetch", "--ref", "79df7ae"],
    ],
)
def test_the_list_comes_from_a_fetch_or_a_checkout_with_its_commit(argv: list[str], monkeypatch: pytest.MonkeyPatch) -> None:
    def nothing(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("went on")

    monkeypatch.setattr(bambu_filaments, "fetch", nothing)
    monkeypatch.setattr(bambu_filaments, "build", nothing)
    with pytest.raises(SystemExit):
        main(argv)


def test_the_list_goes_into_the_repository_wherever_the_script_runs() -> None:
    assert Path(__file__).parents[1] / "custom_components" / "bambuddy" / "filaments.json" == bambu_filaments.OUT


def test_the_fetched_folder_is_never_committed() -> None:
    gitignore = (Path(__file__).parents[1] / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert "/.bambu-studio/" in gitignore
