// What the card shares: the subset of Home Assistant's frontend object it
// reads (and some fields its tests set), its configuration, and the
// integration's entities as it finds them.

export interface HassEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

export interface HassEntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  platform: string;
  translation_key?: string | null;
  /** The user's name for the entity, else the integration's own -- in the
   * server's language. */
  name?: string | null;
  hidden?: boolean;
}

export interface HassDevice {
  id: string;
  model?: string | null;
  name?: string | null;
  name_by_user?: string | null;
  via_device_id?: string | null;
  manufacturer?: string | null;
  serial_number?: string | null;
  /** The integration's (domain, id) pairs for the device. */
  identifiers?: [string, string][];
}

export interface HassLocale {
  language: string;
  number_format: string;
  /** "language", "system", "12" or "24". */
  time_format?: string;
  /** "local" (the browser's) or "server". */
  time_zone?: string;
}

export type LocalizeFunc = (key: string, values?: Record<string, unknown>) => string;

/** What a rejected action call carries: Home Assistant's websocket error,
 * with the integration's translation key where it raised one. */
export interface ActionError {
  code?: string;
  message?: string;
  translation_domain?: string;
  translation_key?: string;
  translation_placeholders?: Record<string, string>;
}

export interface Hass {
  states: Record<string, HassEntityState | undefined>;
  entities: Record<string, HassEntityRegistryEntry | undefined>;
  devices: Record<string, HassDevice | undefined>;
  locale: HassLocale;
  config?: { time_zone?: string };
  /** The signed-in user; only an administrator may open the config panel. */
  user?: { is_admin: boolean };
  language: string;
  formatEntityState: (stateObj: HassEntityState, state?: string) => string;
  localize: LocalizeFunc;
  loadBackendTranslation: (category: string, integration?: string) => Promise<LocalizeFunc>;
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
    notifyOnError?: boolean,
    returnResponse?: boolean,
  ) => Promise<unknown>;
}

// --- Configuration (option keys and values are an interface: never renamed) --

export type CameraMode = "tap" | "always" | "off";
export const CAMERA_MODES: readonly CameraMode[] = ["tap", "always", "off"];

/** The status view's blocks below the job, in their default order: the
 * print controls first, so Stop is in reach during a print; the plugs right
 * after them -- after a print the switch-off waits there. */
export const STATUS_BLOCKS = ["controls", "power", "temperatures", "ams", "fans", "speed"] as const;
export type StatusBlock = (typeof STATUS_BLOCKS)[number];

/** The chips under the printer's name: every one the editor offers. */
export const HEADER_CHIPS = ["network", "hms", "firmware", "maintenance", "door", "storage", "drying", "power"] as const;
export type HeaderChip = (typeof HEADER_CHIPS)[number];

/** The chips a card shows unless the user chose: the others are offered. */
export const DEFAULT_CHIPS: readonly HeaderChip[] = ["network", "hms", "firmware"];

/** The control view's sections, in their default order. */
export const CONTROL_SECTIONS = ["heating", "options", "motion"] as const;
export type ControlSection = (typeof CONTROL_SECTIONS)[number];

export const VIEWS = ["status", "control", "filament"] as const;
export type View = (typeof VIEWS)[number];

/** How the filament view shows an AMS unit at first: folded from three
 * units on, folded, or with its slots. */
export const AMS_FOLDING = ["auto", "folded", "open"] as const;
export type AmsFolding = (typeof AMS_FOLDING)[number];

export interface CardConfig {
  type: string;
  /** The printer's device ID. */
  printer?: string;
  camera?: CameraMode;
  status_blocks?: StatusBlock[];
  header_chips?: HeaderChip[];
  start_view?: View;
  show_control_tab?: boolean;
  control_sections?: ControlSection[];
  read_only?: boolean;
  show_filament_tab?: boolean;
  ams_folding?: AmsFolding;
  show_external_spool?: boolean;
  /** The chips under the name with icon and value only. */
  compact_chips?: boolean;
  /** The row of the switch-off after the print under the printer's plug. */
  show_auto_off?: boolean;
}

// --- The printer as the card finds it ---------------------------------------

/** The print status sensor's states (the integration's enum). */
export type PrintStatus = "idle" | "preparing" | "slicing" | "printing" | "paused" | "finished" | "failed" | "offline" | "unknown";

export type FanKey = "part" | "aux" | "chamber" | "exhaust" | "left_aux" | "right_aux";

/** The print options' switches, by translation key, in the order the card
 * lists them. The build plate's: position only (X1 and A series) or type and
 * position, named apart as Bambu Studio does. */
export const DETECTORS = [
  "ai_monitoring",
  "first_layer_inspection",
  "build_plate_detection",
  "build_plate_position_detection",
  "spaghetti_detection",
  "pileup_detection",
  "clumping_detection",
  "air_printing_detection",
] as const;
export type DetectorKey = (typeof DETECTORS)[number];

/** A heater: its temperature sensor and its target number, each by entity ID. */
export interface Heater {
  sensor?: string;
  target?: string;
}

/** An AMS unit's entities, by entity ID; slots in slot order. */
export interface AmsRefs {
  deviceId: string;
  /** "AMS A", "AMS HT A": the device's name without the printer's. */
  name: string;
  /** AMS, AMS 2 Pro, AMS HT or AMS Lite. */
  model: string;
  humidity?: string;
  temperature?: string;
  slots: string[];
  drying?: string;
  dryingRemaining?: string;
}

/** A smart plug BamBuddy links to the printer, its entities by entity ID. */
export interface PlugRefs {
  deviceId: string;
  /** The plug's name: its device's without the printer's. */
  name: string;
  /** Its switch, or -- a plug BamBuddy only watches, a key that may not
   * switch plugs -- its state. */
  power?: string;
  /** `power` is a switch. */
  switchable: boolean;
  /** A Home Assistant script BamBuddy keeps as a plug: it runs. */
  run?: string;
  watts?: string;
  energyToday?: string;
  /** Our switch-off after the print: the plug powers the printer. */
  autoOff?: string;
  autoOffEveryPrint?: string;
  autoOffTemperature?: string;
  autoOffSkip?: string;
}

/** A printer's entities, by entity ID. */
export interface PrinterRefs {
  deviceId: string;
  name: string;
  model: string;
  status: string;
  /** The BamBuddy instance's Connection sensor: it names the printers
   * BamBuddy does not list. */
  server?: string;
  stage?: string;
  progress?: string;
  remaining?: string;
  endTime?: string;
  layer?: string;
  totalLayers?: string;
  job?: string;
  /** One nozzle, or the left and the right one of a dual-nozzle printer. */
  nozzles: Heater[];
  dual: boolean;
  bed: Heater;
  chamber: Heater;
  hotendFan?: string;
  hms?: string;
  activeFilament?: string;
  /** One external spool, or the left and the right one. */
  externalSpools: string[];
  online?: string;
  plateClearNeeded?: string;
  /** On when the printer takes commands over the LAN (developer mode). */
  developerMode?: string;
  /** What the AMS does right now: idle, feeding, purging, ... */
  amsStatus?: string;
  /** Left or right, on a printer with two nozzles. */
  activeNozzle?: string;
  pause?: string;
  resume?: string;
  stop?: string;
  plateCleared?: string;
  clearHms?: string;
  speed?: string;
  fans: { key: FanKey; entityId: string }[];
  /** The AI detection switches the model has. */
  detectors: { key: DetectorKey; entityId: string }[];
  light?: string;
  /** The integration names it a light, not a chamber light: a printer without a chamber. */
  plainLight?: boolean;
  camera?: string;
  /** The live view's frame rate, where the camera gives more than 5. */
  cameraFps?: string;
  cover?: string;
  /** Asks BamBuddy for the printer's status now; with every API key. */
  refresh?: string;
  printHours?: string;
  wifiSignal?: string;
  /** On while the printer is on Ethernet. */
  wiredNetwork?: string;
  /** The printer's address as BamBuddy knows it: a diagnostic sensor. */
  ipAddress?: string;
  /** The printer's firmware update entity. */
  firmware?: string;
  /** On while the door is open (printers with a door sensor). */
  door?: string;
  /** On while the printer has its storage: an SD card, or a USB drive. */
  storage?: string;
  /** The storage is a USB drive (P2S, X2D, H2 series), not an SD card. */
  storageUsb: boolean;
  /** BamBuddy's maintenance of the printer: state and tasks. */
  maintenance?: string;
  /** The airduct mode: cooling or heating (P2S, X2D, H2 series); laser while the printer has set it for its laser module. */
  airduct?: string;
  /** The ventilation fan of a printer with an airduct: the airduct on cooling and its fans (attribute `fans`). */
  ventilation?: string;
  /** The AMS filament backup switch: with an AMS unit. */
  filamentBackup?: string;
  /** Per nozzle -- the only one, or left and right --, where it has one. */
  nozzleDiameters: (string | undefined)[];
  nozzleTypes: (string | undefined)[];
  /** Every AMS unit of the printer, also one unplugged now (see shownUnits). */
  ams: AmsRefs[];
  /** Its smart plugs, by name (the card puts the printer's own first). */
  plugs: PlugRefs[];
  /** Every entity of the printer and its AMS units: their changes redraw the card. */
  watched: string[];
}

