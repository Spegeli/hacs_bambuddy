"""The integration's filament list, made from Bambu Studio's system profiles.

Bambu Studio (https://github.com/bambulab/BambuStudio, AGPL-3.0) ships a
profile per filament, printer and nozzle. This script reads them and writes
the facts the integration needs -- each filament's id, vendor, name, type,
setting id and nozzle range, and which filaments Bambu Studio offers each
printer per nozzle diameter and nozzle -- to
custom_components/bambuddy/filaments.json. From the repository's root:

    python .github/scripts/bambu_filaments.py --fetch [--ref <commit or tag>]

fetches only the files it reads (resources/profiles/BBL, resources/printers)
into .bambu-studio/ in Bambu Studio's own layout -- a sparse clone, ignored
by git, brought up to date on the next run -- and names the commit it read
(--ref takes a commit's full id or a tag). A checkout of your own works too:
<checkout> --commit <sha>. The list goes into the repository wherever the
script runs.

It follows what Bambu Studio's slot dialog does: a filament's setting id and
range are those of the first preset carrying its id by name, whatever the
printer (PresetBundle::get_filament_by_filament_id); a printer is offered the
filaments whose presets name it in compatible_printers; a two-nozzle printer
refuses a filament on a nozzle its preset marks as not printable there
(DevFilaBlackList.cpp check_filaments_printable). No list is written while
Bambu's filament blacklist holds a prohibition the integration neither checks
(CHECKED_RULES, as they read here) nor leaves out on purpose (IGNORED_RULES),
while a filament names a printer in a form the script cannot read, or one
with no machine preset of that name.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any

REPOSITORY = "https://github.com/bambulab/BambuStudio"
LICENCE = "AGPL-3.0"
_ROOT = Path(__file__).resolve().parents[2]
OUT = _ROOT / "custom_components" / "bambuddy" / "filaments.json"
# Where --fetch keeps its sparse clone: the repository's root, ignored by git.
FETCH_DIR = _ROOT / ".bambu-studio"
# git fetches a commit by its full id only.
_SHORT_ID = re.compile(r"^[0-9a-f]{4,39}$")
# What the generator reads of Bambu Studio (git's cone mode adds the files
# beside them: resources/profiles/BBL.json among them).
FETCH_PATHS = ("resources/profiles/BBL", "resources/printers")

# Bambu Studio's slot dialog lists these vendors first, then the others by name.
FIRST_VENDORS = ("Bambu Lab", "Generic", "Polymaker")
# And within a vendor these types first (FilamentSelectDialog.cpp), then the others; ties by name.
TYPE_ORDER = ("PLA", "PETG", "ABS", "TPU")
# Bambu Studio's printer names that are not the integration's model keys in capitals.
MODEL_KEYS = {"A1 mini": "A1 MINI", "X1 Carbon": "X1C", "H2D Pro": "H2D PRO"}
_PRINTER = re.compile(r"^Bambu Lab (?P<model>.+) (?P<diameter>\d+(?:\.\d+)?) nozzle$")

# Filaments a printer's own list holds otherwise than Bambu Studio's, per
# model key ("remove"/"add" filament ids, every nozzle diameter of the model).
MODEL_CORRECTIONS: dict[str, dict[str, list[str]]] = {}
# Filaments Bambu Studio lacks, by id, with every field of an entry.
EXTRA_FILAMENTS: dict[str, dict[str, Any]] = {}

# The prohibitions of resources/printers/filaments_blacklist.json the
# integration checks (custom_components/bambuddy/filaments.py), without their
# texts.
CHECKED_RULES: dict[str, dict[str, Any]] = {
    "TPU in the AMS": {"type": "TPU", "action": "prohibition", "slot": "ams"},
    "Bambu PET-CF in the AMS": {"vendor": "Bambu Lab", "type": "PET-CF", "action": "prohibition", "slot": "ams"},
    "the H2D's TPU high-flow nozzle": {
        "white_fila_ids": ["GFU04", "GFU03", "GFU01", "GFU00", "GFU99"],
        "nozzle_flows": ["TPU High Flow"],
        "model_id": ["O1D", "O1E"],
        "action": "prohibition",
    },
    "Bambu TPU 85A on the H2D's 0.4 nozzles": {
        "name_suffix": "Bambu TPU 85A",
        "nozzle_flows": ["Standard", "High Flow"],
        "nozzle_diameters": [0.4],
        "model_id": ["O1D", "O1E"],
        "action": "prohibition",
    },
}

# The blacklist's other prohibitions, left out on purpose: why, then the rule.
IGNORED_RULES: dict[str, dict[str, Any]] = {
    f"{name} on a P1 or X1 Carbon high-flow nozzle (BamBuddy reports no flow for their nozzles)": {
        **match, "nozzle_flows": ["High Flow"], "model_id": ["C11", "C12", "BL-P001"], "action": "prohibition",
    }
    for name, match in (
        ("PA6-GF", {"name_suffix": "PA6-GF"}),
        ("PPS-CF", {"type": "PPS-CF"}),
        ("PLA Aero", {"type": "PLA-Aero"}),
        ("ASA Aero", {"type": "ASA-Aero"}),
        ("TPU 85A", {"name_suffix": "TPU 85A"}),
        ("TPU 90A", {"name_suffix": "TPU 90A"}),
    )
}
IGNORED_RULES["TPU with automatic flow calibration on the H2D (a print setting, not a slot's)"] = {
    "type": "TPU", "action": "prohibition", "calib_mode": "auto_pa", "model_id": ["O1D", "O1E"],
}


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _presets(root: Path, section: str) -> dict[str, dict[str, Any]]:
    """Every preset of a BBL.json list (filament_list, machine_list) by name."""
    profiles = root / "resources" / "profiles"
    manifest = _read(profiles / "BBL.json")
    return {entry["name"]: _read(profiles / "BBL" / entry["sub_path"]) for entry in manifest[section]}


def _resolved(presets: dict[str, dict[str, Any]], name: str) -> dict[str, Any]:
    """A preset with its parents' keys under its own (the inherits chain)."""
    chain: list[dict[str, Any]] = []
    seen: set[str] = set()
    current: str | None = name
    while current and current in presets and current not in seen:
        seen.add(current)
        chain.append(presets[current])
        parent = presets[current].get("inherits")
        current = parent if isinstance(parent, str) else None
    merged: dict[str, Any] = {}
    for preset in reversed(chain):
        merged.update(preset)
    return merged


def _first(value: Any) -> Any:
    return value[0] if isinstance(value, list) and value else value


def _int(value: Any) -> int | None:
    try:
        return int(str(_first(value)))
    except (TypeError, ValueError):
        return None


def _type(preset: dict[str, Any]) -> str:
    """The type Bambu Studio sends (DynamicPrintConfig::get_filament_type):
    a support filament's PLA and PA as PLA-S and PA-S."""
    kind = str(_first(preset.get("filament_type")) or "")
    if str(_first(preset.get("filament_is_support"))) == "1":
        if preset.get("filament_id") == "GFS00" or kind == "PLA":
            return "PLA-S"
        if preset.get("filament_id") == "GFS01" or kind == "PA":
            return "PA-S"
    return kind


def _check_rules(root: Path) -> None:
    """Stops when a prohibition the integration checks reads otherwise, and
    on a prohibition it neither checks nor leaves out on purpose."""
    rules = _read(root / "resources" / "printers" / "filaments_blacklist.json").get("blacklist") or []
    found = [{key: value for key, value in rule.items() if key not in ("description", "wiki")} for rule in rules]
    for name, rule in CHECKED_RULES.items():
        if rule not in found:
            raise SystemExit(f"Bambu's filament blacklist no longer holds the rule for {name}: check filaments.py")
    known = [*CHECKED_RULES.values(), *IGNORED_RULES.values()]
    for rule in found:
        if rule.get("action") == "prohibition" and rule not in known:
            raise SystemExit(
                f"Bambu's filament blacklist has a prohibition the integration neither checks nor leaves out: {rule}; "
                "check it in filaments.py and CHECKED_RULES, or name it in IGNORED_RULES with the reason"
            )


def _vendors(filaments: dict[str, dict[str, Any]]) -> list[str]:
    present = {entry["vendor"] for entry in filaments.values()}
    first = [vendor for vendor in FIRST_VENDORS if vendor in present]
    return first + sorted(present - set(first), key=lambda vendor: vendor.encode("utf-8"))


def build(root: Path, commit: str) -> dict[str, Any]:
    """The list, as filaments.json holds it."""
    _check_rules(root)
    version = str(_read(root / "resources" / "profiles" / "BBL.json").get("version") or "")
    raw = _presets(root, "filament_list")
    presets = {name: _resolved(raw, name) for name in raw}
    usable = {
        name: preset
        for name, preset in presets.items()
        if preset.get("instantiation") == "true"
        and preset.get("filament_id")
        and preset.get("compatible_printers")
        and preset.get("setting_id")
    }
    by_name = sorted(usable, key=lambda name: name.encode("utf-8"))

    filaments: dict[str, dict[str, Any]] = {}
    for name in by_name:
        preset = usable[name]
        fid = str(preset["filament_id"])
        if fid in filaments:
            continue
        filaments[fid] = {
            "vendor": str(_first(preset.get("filament_vendor")) or ""),
            "name": name.split(" @")[0],
            "type": _type(preset),
            "setting_id": str(preset["setting_id"]),
            "temp_min": _int(preset.get("nozzle_temperature_range_low")),
            "temp_max": _int(preset.get("nozzle_temperature_range_high")),
        }
    filaments.update(EXTRA_FILAMENTS)

    # Per printer and diameter: the first preset carrying each id (its printable bits).
    offered: dict[tuple[str, str], dict[str, dict[str, Any]]] = {}
    for name in by_name:
        preset = usable[name]
        for printer in preset["compatible_printers"]:
            match = _PRINTER.match(str(printer))
            if not match:
                raise SystemExit(f"{name} names a printer the generator cannot read: {printer!r}")
            offered.setdefault((match["model"], match["diameter"]), {}).setdefault(str(preset["filament_id"]), preset)

    machines_raw = _presets(root, "machine_list")
    for model, diameter in offered:
        if f"Bambu Lab {model} {diameter} nozzle" not in machines_raw:
            raise SystemExit(f"Bambu Studio has no machine preset Bambu Lab {model} {diameter} nozzle: its nozzle rules would go unseen")
    vendors = _vendors(filaments)

    def order(fid: str) -> tuple[int, int, bytes]:
        entry = filaments[fid]
        vendor = vendors.index(entry["vendor"]) if entry["vendor"] in vendors else len(vendors)
        kind = TYPE_ORDER.index(entry["type"]) if entry["type"] in TYPE_ORDER else len(TYPE_ORDER)
        return vendor, kind, str(entry["name"]).encode("utf-8")

    printers: dict[str, dict[str, Any]] = {}
    for (model, diameter), ids in offered.items():
        key = MODEL_KEYS.get(model, model.upper())
        nozzle: dict[str, Any] = {"ids": sorted(ids, key=order)}
        machine = _resolved(machines_raw, f"Bambu Lab {model} {diameter} nozzle")
        extruders = [str(item) for item in machine.get("physical_extruder_map") or []]
        if len(extruders) > 1:
            not_on: dict[str, list[str]] = {}
            for fid, preset in ids.items():
                printable = _int(preset.get("filament_printable"))
                levels = _int(preset.get("filament_extruder_compatibility")) or 0
                for index, physical in enumerate(extruders):
                    refused = (printable is not None and not (printable >> index) & 1) or (levels >> (3 * index)) & 7 == 1
                    if refused:
                        not_on.setdefault(physical, []).append(fid)
            if not_on:
                nozzle["not_on"] = {physical: sorted(found, key=order) for physical, found in sorted(not_on.items())}
        printers.setdefault(key, {})[diameter] = nozzle

    for key, change in MODEL_CORRECTIONS.items():
        for nozzle in printers.get(key, {}).values():
            kept = [fid for fid in nozzle["ids"] if fid not in change.get("remove", [])]
            kept += [fid for fid in change.get("add", []) if fid not in kept and fid in filaments]
            nozzle["ids"] = sorted(kept, key=order)

    return {
        "source": {"repository": REPOSITORY, "commit": commit, "profiles": version, "licence": LICENCE},
        "vendors": vendors,
        "filaments": filaments,
        "printers": printers,
    }


def _git(*args: str, cwd: Path | None = None) -> str:
    try:
        return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()
    except subprocess.CalledProcessError as err:
        # Named by its command, past the options before it ("-c name=value").
        command = next((arg for index, arg in enumerate(args) if not arg.startswith("-") and (index == 0 or args[index - 1] != "-c")), "")
        raise SystemExit(f"git {command} failed: {(err.stderr or err.stdout or '').strip()}") from None


def fetch(target: Path, ref: str = "HEAD") -> str:
    """Bambu Studio's files the generator reads, at a commit, tag or its
    newest state, into a sparse clone at target (made on the first run); the
    commit it holds then."""
    if not (target / ".git").exists():
        _git("clone", "--quiet", "--filter=blob:none", "--no-checkout", "--sparse", "--depth", "1", f"{REPOSITORY}.git", str(target))
    elif _git("remote", "get-url", "origin", cwd=target).removesuffix(".git").rstrip("/") != REPOSITORY:
        raise SystemExit(f"{target} is no clone of Bambu Studio: remove it, and the next run makes one")
    _git("sparse-checkout", "set", "--cone", *FETCH_PATHS, cwd=target)
    _git("fetch", "--quiet", "--depth", "1", "--filter=blob:none", "origin", ref, cwd=target)
    # By force: a file changed by hand in the folder goes back to Bambu Studio's.
    _git("-c", "advice.detachedHead=false", "checkout", "--quiet", "--force", "--detach", "FETCH_HEAD", cwd=target)
    return _git("rev-parse", "HEAD", cwd=target)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Make the integration's filament list from Bambu Studio's profiles.")
    parser.add_argument("checkout", type=Path, nargs="?", help="a Bambu Studio checkout of your own (with --commit)")
    parser.add_argument("--commit", help="that checkout's commit, named in the list")
    parser.add_argument("--fetch", action="store_true", help=f"fetch what the list needs into {FETCH_DIR.name}/ instead")
    parser.add_argument("--ref", help="with --fetch: a commit's full id or a tag (default: the newest state)")
    parser.add_argument("--out", type=Path, default=OUT, help="where to write the list (default: the integration's filaments.json)")
    args = parser.parse_args(argv)
    if args.fetch == (args.checkout is not None) or (args.checkout is not None and not args.commit):
        parser.error("give --fetch, or a checkout with its --commit")
    if args.fetch and args.commit:
        parser.error("--fetch names the commit it reads: leave out --commit")
    if args.ref and not args.fetch:
        parser.error("--ref goes with --fetch")
    if args.ref and _SHORT_ID.match(args.ref):
        parser.error("--ref takes a commit's full id (40 characters) or a tag")
    if args.fetch:
        root, commit = FETCH_DIR, fetch(FETCH_DIR, args.ref or "HEAD")
    else:
        root, commit = args.checkout, args.commit
    data = build(root, commit)
    args.out.write_text(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
