"""What the integration reads from BamBuddy's printer status, independent of
Home Assistant's entities: print status and stage, the AMS units and their
slots, and what each printer model has."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from awesomeversion import AwesomeVersion, AwesomeVersionException

from .const import CONF_PRINTER_ID, CONF_PRINTER_NAME, CONF_SERIAL, MIN_BAMBUDDY_VERSION

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
# A job under way, not paused: it can be paused, and its end can be told
# (a paused one ends whenever it is resumed). Every job can be stopped.
ACTIVE_STATES = frozenset({"PREPARE", "SLICING", "RUNNING"})

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
# No SD slot but a USB port (and internal storage): BamBuddy's SD card flag
# tells a USB drive.
_USB_DRIVE = frozenset(
    {"P2S", "X2D", "H2C", "H2D", "H2D PRO", "H2S", "N6", "N7", "O1C", "O1C2", "O1D", "O1E", "O2D", "O1S"}
)
# "Exhaust fan" is Bambu's name for the chamber fan of these.
_EXHAUST_FAN = frozenset({"P2S", "X2D", "N6", "N7"})

# Tray ids BamBuddy uses for the external spool holder(s).
EXTERNAL_LEFT = 254
EXTERNAL_RIGHT = 255
NOTHING_LOADED = 255


def maintenance_state(data: PrinterData) -> str | None:
    """Overdue when a task is due, due soon in a task's last tenth, else
    ok -- BamBuddy's enabled tasks; None before they are read."""
    if data.maintenance is None:
        return None
    tasks = data.maintenance_tasks
    if any(task.get("is_due") for task in tasks):
        return "overdue"
    if any(task.get("is_warning") for task in tasks):
        return "due_soon"
    return "ok"


def maintenance_task(task: dict[str, Any]) -> dict[str, Any]:
    """A task for the sensor's attributes: what is left (negative when
    overdue) in hours, or days for a task BamBuddy counts in days."""
    days = task.get("interval_type") == "days"
    left = task.get("days_until_due") if days else task.get("hours_until_due")
    due = bool(task.get("is_due"))
    return {
        "id": task.get("id"),
        "name": task.get("maintenance_type_name"),
        "due": due,
        "due_soon": bool(task.get("is_warning")) and not due,
        "unit": "days" if days else "hours",
        "interval": task.get("interval_hours"),
        "left": round(left, 1) if isinstance(left, float) else left,
        "last_done": _utc(task.get("last_performed_at")),
    }


def _utc(value: Any) -> str | None:
    """BamBuddy's time (UTC, without its zone) with its zone; None for a
    task never done."""
    if not isinstance(value, str) or not value:
        return None
    try:
        moment = datetime.fromisoformat(value)
    except ValueError:
        return None
    return (moment if moment.tzinfo else moment.replace(tzinfo=UTC)).isoformat()


def too_old(version: str) -> bool:
    """Whether a BamBuddy version is older than the integration supports; a
    version that is no number (a development build) passes."""
    return _older(version, MIN_BAMBUDDY_VERSION)


def _older(found: Any, version: str) -> bool:
    """Whether a version (BamBuddy's, a printer's firmware) is older than
    `version`; unknown or no number is not."""
    try:
        return bool(found) and AwesomeVersion(str(found)) < AwesomeVersion(version)
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


# The camera's frame rate, as BamBuddy streams it (services/camera.py
# supports_rtsp, routes/camera.py camera_stream): the RTSP models up to 30
# frames a second, the chamber image of the A1 and P1 series -- and a model
# BamBuddy does not know -- up to 5, a camera it takes from elsewhere up to 15.
CAMERA_MIN_FPS = 5
CAMERA_FPS_STEP = 5
_RTSP_PREFIXES = ("X1", "X2", "H2", "P2")
_RTSP_CODES = frozenset({"BL-P001", "C13", "N6", "O1D", "O1C", "O1C2", "O1S", "O1E", "O2D", "N7"})


def camera_is_external(info: dict[str, Any]) -> bool:
    """Whether BamBuddy streams a camera it takes from elsewhere -- to each
    viewer on its own, not through one shared connection."""
    return bool(info.get("external_camera_enabled") and info.get("external_camera_url"))


def camera_max_fps(info: dict[str, Any]) -> int:
    """The most frames a second BamBuddy streams of a printer's camera."""
    if camera_is_external(info):
        return 15
    # As BamBuddy compares: in capitals, not stripped.
    model = str(info.get("model") or "").upper()
    return 30 if model.startswith(_RTSP_PREFIXES) or model in _RTSP_CODES else 5


@dataclass(frozen=True)
class PrinterData:
    """A printer as BamBuddy describes it (`info`, read at setup) and its
    live status."""

    info: dict[str, Any]
    status: dict[str, Any]
    # BamBuddy's count of the hours the printer printed; None before it is read.
    hours: float | None = None
    # BamBuddy's maintenance tasks of the printer; None before they are read.
    maintenance: dict[str, Any] | None = None

    @property
    def maintenance_tasks(self) -> list[dict[str, Any]]:
        """The enabled tasks: BamBuddy counts only those."""
        items = (self.maintenance or {}).get("maintenance_items") or []
        return [item for item in items if isinstance(item, dict) and item.get("enabled", True)]

    @property
    def connected(self) -> bool:
        return bool(self.status.get("connected"))

    @property
    def blank(self) -> bool:
        """BamBuddy has no status of its own for the printer -- it has not
        reached it since it started -- and answers with its defaults: no
        chamber, no AMS backup, none of what the printer has. Without a
        connection object its temperatures are null, with one that never
        heard from the printer empty."""
        return not self.connected and not self.status.get("temperatures")

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
        """Every printer has a slot for its storage: microSD, or USB."""
        return bool(_model_key(self.model))

    def stores_on_usb(self) -> bool:
        return _model_key(self.model) in _USB_DRIVE

    def has_exhaust_fan(self) -> bool:
        return _model_key(self.model) in _EXHAUST_FAN

    def is_a1_family(self) -> bool:
        return _model_key(self.model) in _A1_FAMILY


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


def stored_printer(printer: dict[str, Any]) -> dict[str, Any]:
    """A printer as the entry stores it: BamBuddy's number for the API, the
    serial number to find it again when BamBuddy numbers its printers anew."""
    return {
        CONF_PRINTER_ID: printer["id"],
        CONF_PRINTER_NAME: printer_name(printer),
        CONF_SERIAL: str(printer.get("serial_number") or ""),
    }


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
    """The stage of the print: BamBuddy names none while idle -- nor in a
    moment of a job, which is no idle printer; a stage number we do not know
    yet is unknown."""
    name = status.get("stg_cur_name")
    if name is None:
        return None if status.get("state") in JOB_STATES else "idle"
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


def has_heater(unit: dict[str, Any], printer: PrinterData) -> bool:
    """Whether the unit dries: it reports its drying, whoever started it."""
    return ams_model(unit, printer) in DRYING_AMS_MODELS


def can_dry(unit: dict[str, Any], printer: PrinterData) -> bool:
    """Whether Home Assistant may start its drying: not where the printer
    dries only from its own screen, nor on firmware too old for it."""
    return bool(printer.status.get("supports_drying")) and has_heater(unit, printer)


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


# The answers to an HMS message that send the printer something (BamBuddy's
# hms_actions.py): Bambu's catalogue also names buttons of its own screen
# -- the assistant, the live view, "load", "cancel", "close" -- that send
# nothing (BamBuddy then waits in vain for the printer).
HMS_ANSWERS = frozenset(
    {
        "RESUME_PRINTING",
        "RESUME_PRINTING_DEFECTS",
        "RESUME_PRINTING_PROBELM_SOLVED",
        "PROBLEM_SOLVED_RESUME",
        "FILAMENT_LOAD_RESUME",
        "PROCEED",
        "DBL_CHECK_RESUME",
        "STOP_PRINTING",
        "IGNORE_RESUME",
        "IGNORE_NO_REMINDER_NEXT_TIME",
        "DONT_REMIND_NEXT_TIME",
        "NO_REMINDER_NEXT_TIME",
        "FILAMENT_EXTRUDED",
        "DBL_CHECK_DONE",
        "RETRY_FILAMENT_EXTRUDED",
        "CONTINUE",
        "RETRY_PROBLEM_SOLVED",
        "DBL_CHECK_RETRY",
        "ABORT",
        "OK_BUTTON",
        "DBL_CHECK_OK",
        "REFRESH_NOZZLE",
        "TURN_OFF_FIRE_ALARM",
        "STOP_DRYING",
        "DISABLE_PURIFICATION",
    }
)


def hms_answers(error: dict[str, Any]) -> list[str]:
    """The answers the printer offers for a message, in Bambu's order."""
    actions = error.get("actions")
    return [action for action in actions if action in HMS_ANSWERS] if isinstance(actions, list) else []


def hms_code(error: dict[str, Any]) -> str:
    """A message's full code, as the printer and BamBuddy take it back."""
    return str(error.get("full_code") or error.get("code") or "").removeprefix("0x").upper()


# The materials a slot or an external spool can be set to: Bambu's generic
# profiles (BamBuddy's list of them), with Bambu Studio's nozzle ranges of
# each profile (his word, 2026-10-18: the more, the better).
MATERIALS: dict[str, Material] = {
    "PLA": Material("PLA", "GFL99", 190, 240),
    "PLA Silk": Material("PLA", "GFL96", 190, 240),
    "PLA High Speed": Material("PLA", "GFL95", 190, 240),
    "PLA-CF": Material("PLA-CF", "GFL98", 190, 240),
    "PETG": Material("PETG", "GFG99", 220, 270),
    "PETG HF": Material("PETG", "GFG96", 220, 270),
    "PETG-CF": Material("PETG-CF", "GFG98", 240, 270),
    "PCTG": Material("PCTG", "GFG97", 240, 270),
    "ABS": Material("ABS", "GFB99", 240, 280),
    "ASA": Material("ASA", "GFB98", 240, 280),
    "PC": Material("PC", "GFC99", 260, 290),
    "PA": Material("PA", "GFN99", 240, 280),
    "PA-CF": Material("PA-CF", "GFN98", 260, 300),
    "PPA-CF": Material("PPA-CF", "GFN97", 280, 320),
    "PPA-GF": Material("PPA-GF", "GFN96", 280, 320),
    "TPU": Material("TPU", "GFU99", 200, 250),
    "TPU for AMS": Material("TPU", "GFU98", 200, 250),
    "PVA": Material("PVA", "GFS99", 190, 240),
    "HIPS": Material("HIPS", "GFS98", 220, 270),
    "BVOH": Material("BVOH", "GFS97", 190, 240),
    "PE": Material("PE", "GFP99", 175, 220),
    "PE-CF": Material("PE-CF", "GFP98", 175, 220),
    "PP": Material("PP", "GFP97", 220, 250),
    "PP-CF": Material("PP-CF", "GFP96", 220, 250),
    "PP-GF": Material("PP-GF", "GFP95", 220, 250),
    "EVA": Material("EVA", "GFR99", 175, 220),
    "PHA": Material("PHA", "GFR98", 190, 240),
    "PPS": Material("PPS", "GFT97", 300, 340),
    "PPS-CF": Material("PPS-CF", "GFT98", 310, 340),
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
