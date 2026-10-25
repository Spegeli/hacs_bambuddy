"""What the integration reads from BamBuddy's printer status, independent of
Home Assistant's entities: print status and stage, the AMS units and their
slots, and what each printer model has."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from awesomeversion import AwesomeVersion, AwesomeVersionException
from homeassistant.util import slugify

from . import filaments
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
    # A printer starting up: no job yet.
    "INIT": "idle",
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
# A print on the bed: running or paused (objects can be skipped).
PRINTING_STATES = frozenset({"RUNNING", "PAUSE"})
# A job that ended: the plate waits to be cleared.
ENDED_STATES = frozenset({"FINISH", "FAILED"})

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

# BamBuddy may store a printer under its model code (utils/printer_models.py PRINTER_MODEL_ID_MAP; BL-P003
# from its discovery): device names and models say the model, and it has the model's capabilities.
_MODEL_NAMES = {
    "BL-P001": "X1C", "BL-P002": "X1", "BL-P003": "X1E", "C13": "X1E", "C11": "P1P", "C12": "P1S", "N7": "P2S",
    "N6": "X2D", "N9": "A2L", "A11": "A1", "A12": "A1 Mini", "N1": "A1 Mini", "N2S": "A1", "A04": "A1 Mini",
    "O1D": "H2D", "O1E": "H2D Pro", "O2D": "H2D Pro", "O1C": "H2C", "O1C2": "H2C", "O1S": "H2S",
}  # fmt: skip
_CANONICAL = {code: name.upper() for code, name in _MODEL_NAMES.items()}

# The models by their names in upper case (`model_key` maps a code to its model).
_A1_FAMILY = frozenset({"A1", "A1 MINI", "A2L"})
_DOOR = frozenset({"X1", "X1C", "X1E", "X2D", "P2S", "H2D", "H2D PRO", "H2C", "H2S"})
_AIRDUCT = frozenset({"P2S", "X2D", "H2C", "H2D", "H2D PRO", "H2S"})
# An Ethernet port: only the X1E and the H2D Pro (Bambu's spec pages and FAQs, 2026-10-19). BamBuddy's own
# list holds more models; a printer without a port never reports a cable.
_ETHERNET = frozenset({"X1E", "H2D PRO"})
# No SD slot but a USB port (and internal storage): BamBuddy's SD card flag
# tells a USB drive.
_USB_DRIVE = frozenset({"P2S", "X2D", "H2C", "H2D", "H2D PRO", "H2S"})
# "Exhaust fan" is Bambu's name for fan 3 of these (Bambu Studio's default; the H2 wiki's
# „Bauraumabluftlüfter“); on the P2S it is the External Exhaust Fan kit, there only when BamBuddy
# reports it (`exhaust_fan_present`: airduct part 3, bambu_mqtt.py).
_EXHAUST_FAN = frozenset({"P2S", "X2D", "H2C", "H2D", "H2D PRO", "H2S"})
_EXHAUST_KIT = frozenset({"P2S"})
# Fan 2 is the left auxiliary fan and fan 10 the right one here; the P2S has them the other way
# round (Bambu Studio's N6.json and N7.json; BamBuddy calls fan 10 "left" on both, #3373).
_SWAPPED_AUX = frozenset({"X2D"})
# Fans the stock printer lacks -- the X1 an auxiliary fan, the P1P that and a chamber fan (Bambu's pages);
# kits add them and BamBuddy cannot tell: offered, disabled at first.
_NO_STOCK_AUX_FAN = frozenset({"X1", "P1P"})
_NO_STOCK_CHAMBER_FAN = frozenset({"P1P"})
# Open frames: no chamber around the print.
_OPEN_FRAME = _A1_FAMILY | {"P1P"}
# The A1 and the A1 mini dry an AMS 2 Pro / AMS HT from their screen only
# (Bambu's drying guide); BamBuddy files them as unsupported.
_SCREEN_DRYING = frozenset({"A1", "A1 MINI"})
# The most each model's nozzle and bed heat to (Bambu Studio's printer
# profiles, Bambu's spec pages). The X1 and X1C bed: 110 °C on 220 V, 120 °C
# on 110 V -- the higher, so no printer is refused what it reaches.
_HEATER_MAX: dict[str, dict[str, int]] = {
    "nozzle": {
        **dict.fromkeys(("A1", "A1 MINI", "A2L", "P1P", "P1S", "P2S", "X1", "X1C", "X2D"), 300),
        "X1E": 320,
        **dict.fromkeys(("H2D", "H2D PRO", "H2C", "H2S"), 350),
    },
    "bed": {
        **dict.fromkeys(("A1 MINI", "A2L"), 80),
        **dict.fromkeys(("A1", "P1P", "P1S"), 100),
        **dict.fromkeys(("X1E", "P2S"), 110),
        **dict.fromkeys(("X1", "X1C", "X2D", "H2D", "H2D PRO", "H2C", "H2S"), 120),
    },
}

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
_X1_SERIES = frozenset({"X1", "X1C", "X1E"})
_H2D = frozenset({"H2D"})
_SINGLE_DETECTORS = frozenset({"P2S", "X2D", "H2D PRO", "H2S", "H2C"})
_AIR_PRINTING = frozenset({"H2D PRO", "H2C"})
# Before it, the H2D had the X1's single AI monitoring switch.
_H2D_SINGLE_DETECTORS = "01.01.02.08"


def model_key(model: str | None) -> str:
    """A model as the integration compares it: trimmed, in capitals, a code
    as its model."""
    key = (model or "").strip().upper()
    return _CANONICAL.get(key, key)


@dataclass(frozen=True)
class VentFan:
    """A fan that ventilates the chamber: its name for the card, BamBuddy's
    name in fan-speed, and its status field."""

    name: str
    fan: str
    field: str


_VENT_AUX = VentFan("aux", "aux", "big_fan1_speed")
_VENT_RIGHT_AUX = VentFan("right_aux", "aux2", "left_aux_fan_speed")
_VENT_EXHAUST = VentFan("exhaust", "chamber", "big_fan2_speed")


def ventilation_fans(data: PrinterData) -> tuple[VentFan, ...]:
    """The fans that bring the air through the chamber in cooling mode
    (Bambu's wiki, Studio's printer files): the H2 series' exhaust fan, the
    X2D's right auxiliary fan (once BamBuddy reports it) and exhaust fan,
    the P2S's auxiliary fan and, with the kit, its exhaust fan."""
    if not data.has_airduct():
        return ()
    if model_key(data.model) in _EXHAUST_KIT:
        return (_VENT_AUX, _VENT_EXHAUST) if data.status.get("exhaust_fan_present") else (_VENT_AUX,)
    if data.swapped_aux_fans():
        right = (_VENT_RIGHT_AUX,) if data.status.get(_VENT_RIGHT_AUX.field) is not None else ()
        return (*right, _VENT_EXHAUST)
    return (_VENT_EXHAUST,)


def _speed(data: PrinterData, fan: VentFan) -> int:
    value = data.status.get(fan.field)
    return round_ten(value) if isinstance(value, int | float) and not isinstance(value, bool) else 0


def ventilation_speed(data: PrinterData) -> int:
    """The fastest ventilation fan, in tens."""
    return max((_speed(data, fan) for fan in ventilation_fans(data)), default=0)


def ventilating(data: PrinterData) -> bool:
    """The airduct on cooling and a ventilation fan running."""
    return data.status.get("airduct_mode") == 0 and ventilation_speed(data) > 0


def chamber_heats(data: PrinterData) -> bool:
    """The chamber is heated: a target above 0 where BamBuddy reports a
    heater, else (the P2S) the airduct on heating, which keeps the warmth."""
    if data.status.get("supports_chamber_heater"):
        target = data.temperatures.get("chamber_target")
        return isinstance(target, int | float) and not isinstance(target, bool) and target > 0
    return data.has_airduct() and data.status.get("airduct_mode") == 1


def round_ten(value: float) -> int:
    """A fan's speed to the nearest ten, half up, within 0-100: the printer
    reports its fans in fifteenths, BamBuddy makes percent of them (level 7
    is 47 %, 8 is 53 %), and Bambu's apps set and show tens."""
    return int(min(100.0, max(0.0, value)) / 10 + 0.5) * 10


def heater_max(model: str | None, heater: str) -> int | None:
    """The most a model's `heater` ("nozzle", "bed") heats to; None for a
    model the table does not know."""
    return _HEATER_MAX.get(heater, {}).get(model_key(model))


# 1.x named a printer's device model "BamBuddy Printer (<model>)", without one "BamBuddy Printer".
_1X_MODEL = re.compile(r"BamBuddy Printer(?: \((?P<model>.*)\))?")


def model_changed(stored: str | None, model: str | None) -> bool:
    """Whether BamBuddy's model is another than the one the device has: a
    model corrected in BamBuddy. A model that comes for a printer without
    one only adds; 1.x's words for the same model are no change."""
    if stored and (old := _1X_MODEL.fullmatch(stored)):
        stored = old.group("model")
    return bool(stored) and model_key(stored) != model_key(model)


def display_model(model: str | None) -> str:
    """The model to show: a code as its model, anything else as BamBuddy stores it (trimmed)."""
    text = str(model or "").strip()
    return _MODEL_NAMES.get(text.upper(), text)


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

    # An unknown model gets only what every printer has: fans an A1 lacks
    # would stay behind unavailable once the model is known, and the
    # storage sensor would bear the wrong name (SD card or USB drive).
    def has_aux_fans(self) -> bool:
        model = model_key(self.model)
        return bool(model) and model not in _A1_FAMILY

    def enclosed(self) -> bool:
        """A chamber around the print: all but the open frames (the A1
        series, the P1P); a printer of unknown model counts as enclosed."""
        model = model_key(self.model)
        return not model or model not in _OPEN_FRAME

    def has_door(self) -> bool:
        return model_key(self.model) in _DOOR

    def has_airduct(self) -> bool:
        return model_key(self.model) in _AIRDUCT

    def has_ethernet(self) -> bool:
        return model_key(self.model) in _ETHERNET

    @property
    def wired(self) -> bool:
        """On a cable: BamBuddy's flag (-90 dBm on the models of its list), where the printer has a port."""
        return self.has_ethernet() and bool(self.status.get("wired_network"))

    def has_sd_card(self) -> bool:
        """Every printer has a slot for its storage: microSD, or USB."""
        return bool(model_key(self.model))

    def stores_on_usb(self) -> bool:
        return model_key(self.model) in _USB_DRIVE

    def has_chamber_fan(self) -> bool:
        """A chamber fan Bambu calls so (on the P2S, the X2D and the H2 series it is the exhaust fan)."""
        return self.has_aux_fans() and model_key(self.model) not in _EXHAUST_FAN

    def has_exhaust_fan(self) -> bool:
        model = model_key(self.model)
        if model in _EXHAUST_KIT:
            return bool(self.status.get("exhaust_fan_present"))
        return model in _EXHAUST_FAN

    def swapped_aux_fans(self) -> bool:
        """Fan 2 is the left auxiliary fan, fan 10 the right one (the X2D)."""
        return model_key(self.model) in _SWAPPED_AUX

    def fan_kits(self) -> frozenset[str]:
        """The fans BamBuddy learns of from the printer's airduct report -- the P2S's exhaust fan kit,
        a left auxiliary fan: a moment after it connects."""
        kits = set()
        if model_key(self.model) in _EXHAUST_KIT and self.status.get("exhaust_fan_present"):
            kits.add("exhaust")
        if self.status.get("left_aux_fan_speed") is not None:
            kits.add("left_aux")
        return frozenset(kits)

    def stock_aux_fan(self) -> bool:
        return self.has_aux_fans() and model_key(self.model) not in _NO_STOCK_AUX_FAN

    def stock_chamber_fan(self) -> bool:
        return self.has_chamber_fan() and model_key(self.model) not in _NO_STOCK_CHAMBER_FAN

    def is_a1_family(self) -> bool:
        return model_key(self.model) in _A1_FAMILY

    def dries_on_screen_only(self) -> bool:
        return model_key(self.model) in _SCREEN_DRYING


def bambuddy_name(printer: dict[str, Any]) -> str | None:
    """The printer's name in BamBuddy, trimmed; None without one."""
    return str(printer.get("name") or "").strip() or None


def printer_name(printer: dict[str, Any]) -> str:
    """The device name: the printer's name in BamBuddy, then model and
    serial -- five A1 tell apart by the names their owner gave them. Without
    a name in BamBuddy, model and serial; a printer BamBuddy has no model
    for yet goes by its name or its number."""
    name = bambuddy_name(printer)
    model = display_model(printer.get("model"))
    serial = str(printer.get("serial_number") or "").strip()
    if name:
        details = " / ".join(part for part in (model, serial) if part)
        return f"{name} ({details})" if details else name
    base = short_name(printer)
    return f"{base} ({serial})" if serial else base


def short_name(printer: dict[str, Any]) -> str:
    """The printer's name in BamBuddy, else its model: what its AMS units
    are named after."""
    return bambuddy_name(printer) or display_model(printer.get("model")) or f"Printer {printer['id']}"


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


def ams_serial(unit: dict[str, Any]) -> str | None:
    """The serial number BamBuddy reports for an AMS unit, if any."""
    return str(unit.get("serial_number") or "").strip() or None


def ams_key(unit: dict[str, Any]) -> str:
    """What the integration knows an AMS unit by: its serial number, so a
    unit keeps its device and entities wherever it is plugged in; its place
    only for a unit BamBuddy reports no serial for."""
    return ams_serial(unit) or str(unit.get("id", 0))


def ams_type_by_place(unit: dict[str, Any]) -> bool:
    """Whether a unit's place tells its type without BamBuddy's module type:
    an AMS HT (ids 128-135), the A2L's AMS Lite (place 6)."""
    unit_id = unit.get("id", 0)
    return isinstance(unit_id, int) and (unit_id >= 128 or unit_id == 6)


def ams_label(unit_id: int) -> str:
    """An AMS unit's place, lettered as Bambu Lab and BamBuddy do: AMS A-D,
    AMS HT A-H; an A2L's AMS Lite (unit 6) "AMS Lite", without a letter
    (BamBuddy's amsHelpers.ts): an AMS at place 0 is AMS A beside it."""
    if unit_id == 6:
        return "AMS Lite"
    kind = "AMS HT" if unit_id >= 128 else "AMS"
    return f"{kind} {chr(ord('A') + ams_number(unit_id) - 1)}"


# The kinds of AMS unit, as `ams_model` names them.
AMS_MODELS = ("AMS", "AMS 2 Pro", "AMS HT", "AMS Lite")


def ams_letter(unit_id: int) -> str | None:
    """A place's letter as on the printer (`ams_label`), in small: a-d, AMS
    HT a-h; none for the A2L's AMS Lite."""
    return None if unit_id == 6 else chr(ord("a") + ams_number(unit_id) - 1)


def ams_object_id(model: str, printer_key: str, unit_id: int, serial: str | None, key: str) -> str:
    """An AMS entity's object ID: what stays for the unit -- its model and
    serial number. Without a serial (BamBuddy drops the AMS Lite's,
    maziggy/bambuddy#3348) the printer's key and the place's letter stand
    in, until the unit is known by its serial."""
    if serial:
        return slugify(f"{model} {serial} {key}")
    letter = ams_letter(unit_id)
    return slugify(" ".join([model, printer_key, *([letter] if letter else []), key]))


def ams_name(printer: dict[str, Any], unit_id: int, model: str, serial: str | None) -> str:
    """An AMS unit's device name: after its printer's BamBuddy name, so it
    sorts right under the printer, then its place, model and serial."""
    label = ams_label(unit_id)
    # A label that is the model already says it once.
    details = " / ".join(part for part in (model, serial) if part and part != label)
    base = f"{short_name(printer)} {label}"
    return f"{base} ({details})" if details else base


def detectors(data: PrinterData) -> list[str]:
    """The AI detectors of the printer, as BamBuddy's print options name
    them. An H2D of unknown firmware counts as a current one."""
    model = model_key(data.model)
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
    return model_key(data.model) in _X1_SERIES | _A1_FAMILY


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
    stage = status.get("stg_cur")
    # Stage 0 is "Printing": the A series and the P1 report it while idle
    # too (BamBuddy clears it for the A1, A1 mini and P1 only).
    if stage == 0 and status.get("state") not in PRINTING_STATES:
        name = None
    if name is None:
        return None if status.get("state") in JOB_STATES else "idle"
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
    """The kind of AMS: BamBuddy's module type, the AMS HT's ids, place 6
    (only ever the A2L's AMS Lite); without a type, an AMS Lite only where
    one can be -- the A1 and A1 mini at place 0, the A2L at 6 (an A1's AMS
    through the hub is never mixed with an AMS Lite)."""
    module = unit.get("module_type") or ""
    unit_id = unit.get("id", 0)
    if module == "n3s" or (isinstance(unit_id, int) and unit_id >= 128):
        return "AMS HT"
    if module == "n3f":
        return "AMS 2 Pro"
    if module == "ams":
        return "AMS"
    # BamBuddy's type once it reads the AMS Lite's version (maziggy/bambuddy#3348).
    if module == "ams_f1" or unit_id == 6:
        return "AMS Lite"
    return "AMS Lite" if unit_id == 0 and model_key(printer.model) in {"A1", "A1 MINI"} else "AMS"


# The AMS units with a heater, and the hottest each dries at (Bambu Lab's
# specifications); BamBuddy's `supports_drying` tells whether the printer's
# firmware lets it dry remotely.
DRYING_MAX = {"AMS 2 Pro": 65, "AMS HT": 85}


def drying_minutes(unit: dict[str, Any]) -> int:
    """The minutes of drying BamBuddy reports for the unit, 0 when it reports none."""
    minutes = unit.get("dry_time")
    return minutes if isinstance(minutes, int) and minutes > 0 else 0


def is_drying(unit: dict[str, Any]) -> bool:
    """The unit dries: minutes left, and not a countdown that stands still."""
    return drying_minutes(unit) > 0 and not unit.get("dry_countdown_stalled")


def has_heater(unit: dict[str, Any], printer: PrinterData) -> bool:
    """Whether the unit dries: it reports its drying, whoever started it."""
    return ams_model(unit, printer) in DRYING_MAX


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
    """No spool, or one nobody told the printer about: the printer names no
    filament (the AMS HT says state 9, empty, for a loaded tray). BamBuddy's
    `exists` does not decide it: BamBuddy sets it only from a report with the
    presence bits and clears the filament with it, so a filament named after
    it is newer -- a spool put in and described -- as BamBuddy's card reads it."""
    return not (tray.get("tray_type") or tray.get("tray_sub_brands"))


def spool_present(tray: dict[str, Any]) -> bool:
    """A spool sits there, described or not: a filament named, else
    BamBuddy's `exists` (the external spools, without one, always count)."""
    return not tray_empty(tray) or tray.get("exists") is not False


def tray_label(tray: dict[str, Any]) -> str:
    """The filament's name: a chip's product ("PLA Matte"); else its Bambu
    Studio profile's ("PLA Basic", "Generic PLA", "SUNLU PLA+" -- the
    printer reports no name for a slot set by hand); else what BamBuddy
    reports, the material at last."""
    if not has_rfid(tray):
        named = filaments.label(tray.get("tray_info_idx"))
        if named:
            return named
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
        # The AMS estimates it only for a Bambu spool with its chip: without
        # one it says -1, 0 or -- the A1's AMS Lite -- 100. The external
        # spools always report 0.
        "remaining": remain
        if isinstance(remain, int)
        and remain >= 0
        and not empty
        and has_chip_ids(tray)
        and global_id not in (EXTERNAL_LEFT, EXTERNAL_RIGHT)
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
        "present": spool_present(tray),
    }


def has_rfid(tray: dict[str, Any]) -> bool:
    """BamBuddy names a spool's chip (null without one)."""
    return bool(tray.get("tray_uuid") or tray.get("tag_uid"))


def has_chip_ids(tray: dict[str, Any]) -> bool:
    """Both ids of a Bambu spool's chip: the chip's own and the spool's."""
    return bool(tray.get("tray_uuid") and tray.get("tag_uid"))


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
    # In capitals first: a leading 0X goes as a 0x does (the action's code too).
    return str(error.get("full_code") or error.get("code") or "").upper().removeprefix("0X")


def active_tray(data: PrinterData) -> int | None:
    """The global id of the loaded slot, None with nothing loaded. A
    two-nozzle printer's 254 is "an external spool" (BamBuddy reads both
    holders so): the active nozzle tells which -- the left one feeds from
    the left spool (254), the right one from the right (255), as
    BamBuddy's printer card reads it."""
    tray_now = data.status.get("tray_now")
    if not isinstance(tray_now, int) or tray_now == NOTHING_LOADED:
        return None
    if data.is_dual_nozzle and tray_now == EXTERNAL_LEFT:
        return EXTERNAL_LEFT if data.status.get("active_extruder") == 1 else EXTERNAL_RIGHT
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
