"""What the integration reads from BamBuddy's printer status, independent of
Home Assistant's entities: print status and stage, the AMS units and their
slots, and what each printer model has."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from awesomeversion import AwesomeVersion, AwesomeVersionException

from .const import CONF_PRINTER_ID, CONF_SERIAL, MIN_BAMBUDDY_VERSION

# The print status sensor's states. BamBuddy passes the firmware's
# gcode_state on and adds "unknown"; a printer it cannot reach is "offline".
PRINT_STATUSES = [
    "idle",
    "preparing",
    "slicing",
    "printing",
    "paused",
    "finished",
    "failed",
    "offline",
    "unknown",
]
_STATUS_BY_STATE = {
    "IDLE": "idle",
    "PREPARE": "preparing",
    "SLICING": "slicing",
    "RUNNING": "printing",
    "PAUSE": "paused",
    "FINISH": "finished",
    "FAILED": "failed",
    "unknown": "unknown",
}
# A job is under way: the printer must not be moved by hand.
JOB_STATES = frozenset({"PREPARE", "SLICING", "RUNNING", "PAUSE"})
# A job can be paused or stopped.
PAUSABLE_STATES = frozenset({"PREPARE", "SLICING", "RUNNING"})
STOPPABLE_STATES = JOB_STATES

# BamBuddy's stage numbers (Bambu Studio's DeviceManager) with our slugs.
STAGES: dict[int, str] = {
    0: "printing",
    1: "auto_bed_leveling",
    2: "heatbed_preheating",
    3: "vibration_compensation",
    4: "changing_filament",
    5: "m400_pause",
    6: "paused_filament_runout",
    7: "heating_nozzle",
    8: "calibrating_dynamic_flow",
    9: "scanning_bed_surface",
    10: "inspecting_first_layer",
    11: "identifying_build_plate",
    12: "calibrating_micro_lidar",
    13: "homing_toolhead",
    14: "cleaning_nozzle_tip",
    15: "checking_extruder_temperature",
    16: "paused_by_user",
    17: "paused_front_cover",
    18: "calibrating_lidar",
    19: "calibrating_flow_ratio",
    20: "paused_nozzle_temperature",
    21: "paused_bed_temperature",
    22: "unloading_filament",
    23: "paused_step_loss",
    24: "loading_filament",
    25: "motor_noise_cancellation",
    26: "paused_ams_offline",
    27: "paused_hotend_fan",
    28: "paused_chamber_temperature",
    29: "cooling_chamber",
    30: "paused_by_gcode",
    31: "motor_noise_showoff",
    32: "paused_nozzle_clumping",
    33: "paused_cutter",
    34: "paused_first_layer",
    35: "paused_nozzle_clog",
    36: "measuring_motion_precision",
    37: "enhancing_motion_precision",
    38: "measuring_motion_accuracy",
    39: "calibrating_nozzle_offset",
    40: "high_temperature_bed_leveling",
    41: "checking_quick_release_lever",
    42: "checking_door_and_cover",
    43: "calibrating_laser",
    44: "checking_platform",
    45: "confirming_birdseye_camera",
    46: "calibrating_birdseye_camera",
    47: "bed_leveling_phase_1",
    48: "bed_leveling_phase_2",
    49: "heating_chamber",
    50: "cooling_heatbed",
    51: "printing_calibration_lines",
    52: "checking_material",
    53: "calibrating_live_view_camera",
    54: "waiting_for_heatbed",
    55: "checking_material_position",
    56: "calibrating_cutting_module",
    57: "measuring_surface",
    58: "thermal_preconditioning",
    59: "homing_blade_holder",
    60: "calibrating_camera_offset",
    61: "calibrating_blade_holder",
    62: "testing_hotend_change",
    63: "waiting_for_chamber",
    64: "preparing_hotend",
    65: "calibrating_clumping_detection",
    66: "purifying_chamber_air",
    74: "preparing",
    77: "preparing_ams",
}
# Names BamBuddy derives without a stage number, at the start of a print.
_DERIVED_STAGES = {
    "Heating heatbed": "heating_heatbed",
    "Heating nozzle": "heating_nozzle",
    "Preparing": "preparing",
}
STAGE_OPTIONS = sorted({"idle", *STAGES.values(), *_DERIVED_STAGES.values()})

# Model strings as BamBuddy stores them (upper case here) and the codes it
# keeps for printers its discovery did not name.
_A1_FAMILY = frozenset({"A1", "A1 MINI", "A2L", "N1", "N2S", "N9", "A11", "A12", "A04"})
_DOOR = frozenset(
    {
        "X1", "X1C", "X1E", "X2D", "P2S", "H2D", "H2D PRO", "H2C", "H2S",
        "BL-P001", "BL-P002", "BL-P003", "C13", "N6", "N7", "O1D", "O1E", "O2D", "O1C", "O1C2", "O1S",
    }
)  # fmt: skip
_AIRDUCT = frozenset(
    {"P2S", "X2D", "H2C", "H2D", "H2D PRO", "H2S", "N6", "N7", "O1C", "O1C2", "O1D", "O1E", "O2D", "O1S"}
)
_ETHERNET = frozenset(
    {
        "X1C", "X1E", "X2D", "P1S", "P2S", "H2D", "H2D PRO", "H2C", "H2S",
        "BL-P001", "BL-P003", "C12", "C13", "N6", "N7", "O1D", "O1E", "O2D", "O1C", "O1C2", "O1S",
    }
)  # fmt: skip
_NO_SD_CARD = frozenset({"A1", "A1 MINI", "N1", "N2S", "A11", "A12", "A04"})
# "Exhaust fan" is Bambu's name for the chamber fan of these.
_EXHAUST_FAN = frozenset({"P2S", "X2D", "N6", "N7"})

# Tray ids BamBuddy uses for the external spool holder(s).
EXTERNAL_LEFT = 254
EXTERNAL_RIGHT = 255
NOTHING_LOADED = 255


def too_old(version: str) -> bool:
    """Whether a BamBuddy version is older than the integration supports; a
    version that is no number (a development build) passes."""
    try:
        return AwesomeVersion(version) < AwesomeVersion(MIN_BAMBUDDY_VERSION)
    except AwesomeVersionException:
        return False


# The AI detection each model has, after Bambu Studio's printer files
# (support_ai_monitoring, support_first_layer_inspect,
# support_build_plate_marker_detect) and the detectors the printers report
# (print.fun bits 42-45). BamBuddy passes none of this on, and reads a
# detector a printer lacks as on.
_X1_SERIES = frozenset({"X1", "X1C", "X1E", "BL-P001", "BL-P002", "C13"})
_H2D = frozenset({"H2D", "O1D"})
_SINGLE_DETECTORS = frozenset(
    {"P2S", "X2D", "H2D PRO", "H2S", "H2C", "N6", "N7", "O1E", "O2D", "O1S", "O1C", "O1C2"}
)
_AIR_PRINTING = frozenset({"H2D PRO", "H2C", "O1E", "O2D", "O1C", "O1C2"})
# Before it, the H2D had the X1's single AI monitoring switch.
_H2D_SINGLE_DETECTORS = "01.01.02.08"


def _model_key(model: str | None) -> str:
    return (model or "").strip().upper()


@dataclass(frozen=True)
class PrinterData:
    """A printer as BamBuddy describes it (`info`, read at setup) and its
    live status."""

    info: dict[str, Any]
    status: dict[str, Any]
    # BamBuddy's count of the hours the printer printed; None before it is read.
    hours: float | None = None

    @property
    def connected(self) -> bool:
        return bool(self.status.get("connected"))

    @property
    def state(self) -> str | None:
        state = self.status.get("state")
        return state if isinstance(state, str) else None

    @property
    def model(self) -> str:
        return str(self.info.get("model") or "")

    @property
    def temperatures(self) -> dict[str, Any]:
        return self.status.get("temperatures") or {}

    @property
    def is_dual_nozzle(self) -> bool:
        """Two hotends: BamBuddy reports a second nozzle temperature, or
        counted two nozzles."""
        return "nozzle_2" in self.temperatures or self.info.get("nozzle_count") == 2

    @property
    def job_running(self) -> bool:
        """A job is under way (also while paused): moving the printer by
        hand would go into the print."""
        return self.connected and self.state in JOB_STATES

    @property
    def changing_filament(self) -> bool:
        """The AMS loads or unloads filament: another move or filament
        command would collide with it."""
        return self.status.get("ams_status_main") == 1

    @property
    def ams_units(self) -> list[dict[str, Any]]:
        return [unit for unit in self.status.get("ams") or [] if isinstance(unit, dict)]

    @property
    def external_spools(self) -> list[dict[str, Any]]:
        return [tray for tray in self.status.get("vt_tray") or [] if isinstance(tray, dict)]

    # An unknown model gets only what every printer has: fans or an SD card
    # an A1 lacks would stay behind unavailable once the model is known.
    def has_aux_fans(self) -> bool:
        model = _model_key(self.model)
        return bool(model) and model not in _A1_FAMILY

    def has_door(self) -> bool:
        return _model_key(self.model) in _DOOR

    def has_airduct(self) -> bool:
        return _model_key(self.model) in _AIRDUCT

    def has_ethernet(self) -> bool:
        return _model_key(self.model) in _ETHERNET

    def has_sd_card(self) -> bool:
        model = _model_key(self.model)
        return bool(model) and model not in _NO_SD_CARD

    def has_exhaust_fan(self) -> bool:
        return _model_key(self.model) in _EXHAUST_FAN

    def is_a1_family(self) -> bool:
        return _model_key(self.model) in _A1_FAMILY


def _older(firmware: Any, version: str) -> bool:
    """Whether a printer's firmware is older than `version`; unknown is not."""
    try:
        return bool(firmware) and AwesomeVersion(str(firmware)) < AwesomeVersion(version)
    except AwesomeVersionException:
        return False


def bambuddy_name(printer: dict[str, Any]) -> str | None:
    """The printer's name in BamBuddy, trimmed; None without one."""
    return str(printer.get("name") or "").strip() or None


def printer_name(printer: dict[str, Any]) -> str:
    """The device name: the printer's name in BamBuddy, then model and
    serial -- five A1 tell apart by the names their owner gave them. Without
    a name in BamBuddy, model and serial; a printer BamBuddy has no model
    for yet goes by its name or its number."""
    name = bambuddy_name(printer)
    model = str(printer.get("model") or "").strip()
    serial = str(printer.get("serial_number") or "").strip()
    if name:
        details = " / ".join(part for part in (model, serial) if part)
        return f"{name} ({details})" if details else name
    base = model or f"Printer {printer['id']}"
    return f"{base} ({serial})" if serial else base


def short_name(printer: dict[str, Any]) -> str:
    """The printer's name in BamBuddy, else its model: what its AMS units
    are named after."""
    return bambuddy_name(printer) or str(printer.get("model") or f"Printer {printer['id']}")


def printer_key(printer: dict[str, Any]) -> str:
    """What the integration knows a printer by: its serial number -- it
    stays when BamBuddy numbers its printers anew (another BamBuddy, a
    restored database); BamBuddy's number only for a printer without one."""
    serial = str(printer.get("serial_number") or "").strip()
    return serial or f"id{printer['id']}"


def stored_key(printer: dict[str, Any]) -> str:
    """The key of a printer as the entry's options store it."""
    return printer_key({"id": printer[CONF_PRINTER_ID], "serial_number": printer.get(CONF_SERIAL)})


def find_printers(listed: list[dict[str, Any]], stored: list[dict[str, Any]]) -> list[dict[str, Any] | None]:
    """BamBuddy's printer for each stored one: by serial number first, then
    by BamBuddy's number for those stored without a serial, among the
    printers no serial claimed -- two stored printers never become one."""
    taken: set[int] = set()
    found: list[dict[str, Any] | None] = []
    for printer in stored:
        serial = printer.get(CONF_SERIAL)
        info = next((item for item in listed if serial and str(item.get("serial_number") or "") == serial), None)
        if info is not None:
            taken.add(id(info))
        found.append(info)
    for index, printer in enumerate(stored):
        if printer.get(CONF_SERIAL) or found[index] is not None:
            continue
        info = next(
            (item for item in listed if item.get("id") == printer[CONF_PRINTER_ID] and id(item) not in taken), None
        )
        if info is not None:
            taken.add(id(info))
        found[index] = info
    return found


def ams_key(unit: dict[str, Any]) -> str:
    """What the integration knows an AMS unit by: its serial number, so a
    unit keeps its device and entities wherever it is plugged in; its place
    only for a unit BamBuddy reports no serial for."""
    serial = str(unit.get("serial_number") or "").strip()
    return serial or str(unit.get("id", 0))


def ams_label(unit_id: int) -> str:
    """An AMS unit's place, lettered as Bambu Lab and BamBuddy do: AMS A-D,
    AMS HT A-H."""
    kind = "AMS HT" if unit_id >= 128 else "AMS"
    return f"{kind} {chr(ord('A') + ams_number(unit_id) - 1)}"


def ams_name(printer: dict[str, Any], unit_id: int, model: str, serial: str | None) -> str:
    """An AMS unit's device name: after its printer's BamBuddy name, so it
    sorts right under the printer, then its place, model and serial."""
    details = " / ".join(part for part in (model, serial) if part)
    base = f"{short_name(printer)} {ams_label(unit_id)}"
    return f"{base} ({details})" if details else base


def detectors(data: PrinterData) -> list[str]:
    """The AI detectors of the printer, as BamBuddy's print options name
    them. An H2D of unknown firmware counts as a current one."""
    model = _model_key(data.model)
    firmware = data.status.get("firmware_version")
    old_h2d = model in _H2D and _older(firmware, _H2D_SINGLE_DETECTORS)
    single = model in _SINGLE_DETECTORS or (model in _H2D and not old_h2d)
    found = []
    if model in _X1_SERIES or old_h2d:
        found.append("printing_monitor")
    if model in _X1_SERIES:
        found.append("first_layer_inspector")
    if model in _X1_SERIES | _A1_FAMILY | _SINGLE_DETECTORS | _H2D:
        found.append("buildplate_marker_detector")
    if single:
        found += ["spaghetti_detector", "pileup_detector", "clump_detector"]
    if model in _AIR_PRINTING or (model in _H2D and not old_h2d):
        found.append("airprint_detector")
    return found


def plate_position_only(data: PrinterData) -> bool:
    """Whether the build plate detection checks the plate's position only
    (the X1 and A series), not its type too -- Bambu Studio names the two
    apart."""
    return _model_key(data.model) in _X1_SERIES | _A1_FAMILY


def print_status(data: PrinterData) -> str | None:
    """The print status sensor's state; None for a state BamBuddy has not
    told us about yet."""
    if not data.connected:
        return "offline"
    return _STATUS_BY_STATE.get(data.state or "")


def print_stage(status: dict[str, Any]) -> str | None:
    """The stage of the print: BamBuddy names none while idle; a stage
    number we do not know yet is unknown."""
    name = status.get("stg_cur_name")
    if name is None:
        return "idle"
    stage = status.get("stg_cur")
    if isinstance(stage, int) and stage in STAGES:
        return STAGES[stage]
    return _DERIVED_STAGES.get(str(name))


# What the AMS is doing (BamBuddy's ams_status_main and, during a filament
# change, ams_status_sub).
AMS_STATUSES = [
    "idle",
    "heating",
    "feeding",
    "retracting",
    "verifying",
    "purging",
    "changing_filament",
    "reading_rfid",
    "assist",
    "calibrating",
]
_CHANGE_STEPS = {2: "heating", 3: "feeding", 4: "retracting", 6: "verifying", 7: "purging"}
_AMS_MAIN = {0: "idle", 2: "reading_rfid", 3: "assist", 4: "calibrating"}


def ams_status(status: dict[str, Any]) -> str | None:
    main = status.get("ams_status_main")
    if main == 1:
        return _CHANGE_STEPS.get(status.get("ams_status_sub"), "changing_filament")  # type: ignore[arg-type]
    return _AMS_MAIN.get(main)  # type: ignore[arg-type]


_NOZZLE_MATERIALS = {"00": "stainless_steel", "01": "hardened_steel", "05": "tungsten_carbide"}


def nozzle_type(code: str) -> str:
    """The nozzle's material: written out by most printers; the H2 series
    reports a code -- its second letter the flow (H or E high flow, U the
    TPU high-flow nozzle, which names no material), its last two digits the
    material (00 stainless steel, 01 hardened steel, 05 tungsten carbide)."""
    for material in _NOZZLE_MATERIALS.values():
        if material.split("_")[0] in code:
            return material
    if len(code) >= 4 and code[1].upper() == "U":
        return "tpu_high_flow"
    if len(code) >= 4 and code[2:4] in _NOZZLE_MATERIALS:
        return _NOZZLE_MATERIALS[code[2:4]] + ("_high_flow" if code[1].upper() in "HE" else "")
    return code


def ams_model(unit: dict[str, Any], printer: PrinterData) -> str:
    """The kind of AMS: BamBuddy's module type, the AMS HT's ids, else an
    A1-family printer's AMS Lite."""
    module = unit.get("module_type") or ""
    unit_id = unit.get("id", 0)
    if module == "n3s" or (isinstance(unit_id, int) and unit_id >= 128):
        return "AMS HT"
    if module == "n3f":
        return "AMS 2 Pro"
    if module == "ams":
        return "AMS"
    return "AMS Lite" if printer.is_a1_family() else "AMS"


# The AMS units with a heater; BamBuddy's `supports_drying` tells whether the
# printer's firmware lets it dry remotely.
DRYING_AMS_MODELS = frozenset({"AMS 2 Pro", "AMS HT"})


def can_dry(unit: dict[str, Any], printer: PrinterData) -> bool:
    return bool(printer.status.get("supports_drying")) and ams_model(unit, printer) in DRYING_AMS_MODELS


def ams_number(unit_id: int) -> int:
    """The unit's place among its kind, from 1: AMS 1-4, AMS HT 1-8, an
    A2L's AMS Lite (BamBuddy's id 6) as 1."""
    if unit_id >= 128:
        return unit_id - 127
    if unit_id == 6:
        return 1
    return unit_id + 1


def tray_id(unit_id: int, slot: int) -> int:
    """BamBuddy's global id of an AMS slot, as `tray_now` and ams/load use
    it: 0-15 for AMS units 0-3, 24-27 for an A2L's AMS Lite, the unit id for
    an AMS HT."""
    if unit_id >= 128:
        return unit_id
    if unit_id == 6:
        return 24 + slot
    return unit_id * 4 + slot


def _color(tray: dict[str, Any]) -> str | None:
    color = str(tray.get("tray_color") or "")
    return f"#{color[:6].upper()}" if len(color) >= 6 else None


def tray_empty(tray: dict[str, Any]) -> bool:
    """No spool, or one nobody told the printer about. BamBuddy's `exists`
    where it reports one: the AMS HT says state 9 (empty) for a loaded tray."""
    if tray.get("exists") is False:
        return True
    return not (tray.get("tray_type") or tray.get("tray_sub_brands"))


def tray_label(tray: dict[str, Any]) -> str:
    """The filament's name: its product ("PLA Basic"), else its material."""
    return str(tray.get("tray_sub_brands") or tray.get("tray_type") or "")


def slot_state(tray: dict[str, Any]) -> str:
    return "empty" if tray_empty(tray) else tray_label(tray)


def slot_attributes(tray: dict[str, Any], slot: int, global_id: int, active_tray: int | None) -> dict[str, Any]:
    """What a slot sensor tells besides its state, for automations and the
    dashboard card."""
    empty = tray_empty(tray)
    remain = tray.get("remain")
    return {
        "slot": slot,
        "color": None if empty else _color(tray),
        "type": None if empty else tray.get("tray_type") or None,
        "name": None if empty else tray_label(tray) or None,
        # BamBuddy says -1 without an RFID estimate; the external spools
        # always report 0.
        "remaining": remain
        if isinstance(remain, int) and remain >= 0 and not empty and global_id not in (EXTERNAL_LEFT, EXTERNAL_RIGHT)
        else None,
        "active": global_id == active_tray,
        "empty": empty,
        "tray_id": global_id,
        "nozzle_temp_min": None if empty else tray.get("nozzle_temp_min"),
        "nozzle_temp_max": None if empty else tray.get("nozzle_temp_max"),
        # The spool's own drying recommendation (°C, hours), from its RFID.
        "drying_temp": None if empty else tray.get("drying_temp"),
        "drying_time": None if empty else tray.get("drying_time"),
        # A Bambu spool's chip describes it: nobody sets its filament by hand.
        "rfid": has_rfid(tray),
        # A spool sits there, described or not (BamBuddy's `exists`; the
        # external spools always count).
        "present": tray.get("exists") is not False,
    }


def has_rfid(tray: dict[str, Any]) -> bool:
    """BamBuddy names a spool's chip (null without one)."""
    return bool(tray.get("tray_uuid") or tray.get("tag_uid"))


@dataclass(frozen=True)
class Material:
    """A material as Bambu's generic profile describes it."""

    tray_type: str
    profile: str
    temp_min: int
    temp_max: int


# The materials a slot can be set to: Bambu's generic profiles, with the
# nozzle ranges of BamBuddy's own table (utils/filament_ids.py); PLA Silk,
# PETG HF and PCTG, which it lacks, take their base material's.
MATERIALS: dict[str, Material] = {
    "PLA": Material("PLA", "GFL99", 190, 230),
    "PLA Silk": Material("PLA", "GFL96", 190, 230),
    "PLA-CF": Material("PLA-CF", "GFL98", 210, 240),
    "PETG": Material("PETG", "GFG99", 220, 260),
    "PETG HF": Material("PETG", "GFG96", 220, 260),
    "PETG-CF": Material("PETG-CF", "GFG98", 240, 270),
    "PCTG": Material("PCTG", "GFG97", 220, 260),
    "ABS": Material("ABS", "GFB99", 240, 270),
    "ASA": Material("ASA", "GFB98", 240, 270),
    "PC": Material("PC", "GFC99", 250, 280),
    "PA": Material("PA", "GFN99", 260, 290),
    "PA-CF": Material("PA-CF", "GFN98", 270, 300),
    "TPU": Material("TPU", "GFU99", 200, 240),
}


def active_tray(status: dict[str, Any]) -> int | None:
    """The global id of the loaded slot, None with nothing loaded."""
    tray_now = status.get("tray_now")
    if not isinstance(tray_now, int) or tray_now == NOTHING_LOADED:
        return None
    return tray_now


def find_tray(data: PrinterData, global_id: int) -> tuple[dict[str, Any], int] | None:
    """The tray with BamBuddy's global id, and its 1-based slot number."""
    for unit in data.ams_units:
        unit_id = int(unit.get("id", 0))
        for tray in unit.get("tray") or []:
            slot = int(tray.get("id", 0))
            if tray_id(unit_id, slot) == global_id:
                return tray, slot + 1
    for index, tray in enumerate(data.external_spools):
        if tray.get("id") == global_id:
            return tray, index + 1
    return None
