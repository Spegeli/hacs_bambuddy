// What the card shares: the subset of Home Assistant's frontend object it
// reads, its configuration, and the integration's entities as it finds them.

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

// --- Configuration (option keys are an interface: never renamed) -----------

export type CameraMode = "tap" | "always" | "off";
export const CAMERA_MODES: readonly CameraMode[] = ["tap", "always", "off"];

export const SECTIONS = ["show_temperatures", "show_fans", "show_ams", "show_controls"] as const;
export type Section = (typeof SECTIONS)[number];

export interface CardConfig {
  type: string;
  /** The printer's device ID. */
  printer?: string;
  camera?: CameraMode;
  show_temperatures?: boolean;
  show_fans?: boolean;
  show_ams?: boolean;
  show_controls?: boolean;
}

// --- The printer as the card finds it ---------------------------------------

/** The print status sensor's states (the integration's enum). */
export type PrintStatus = "idle" | "preparing" | "slicing" | "printing" | "paused" | "finished" | "failed" | "offline" | "unknown";

export type FanKey = "part" | "aux" | "chamber" | "exhaust" | "left_aux";

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
  /** "AMS 1", "AMS HT 1": the device's name without the printer's. */
  name: string;
  /** AMS, AMS 2 Pro, AMS HT or AMS Lite. */
  model: string;
  humidity?: string;
  temperature?: string;
  slots: string[];
  drying?: string;
  dryingRemaining?: string;
}

/** A printer's entities, by entity ID. */
export interface PrinterRefs {
  deviceId: string;
  name: string;
  model: string;
  status: string;
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
  camera?: string;
  cover?: string;
  /** Asks BamBuddy for the printer's status now; with every API key. */
  refresh?: string;
  printHours?: string;
  wifiSignal?: string;
  /** On while the printer is on Ethernet. */
  wiredNetwork?: string;
  /** Off by default in Home Assistant: often missing. */
  ipAddress?: string;
  /** The printer's firmware update entity. */
  firmware?: string;
  /** Per nozzle -- the only one, or left and right --, where it has one. */
  nozzleDiameters: (string | undefined)[];
  nozzleTypes: (string | undefined)[];
  ams: AmsRefs[];
  /** Every entity of the printer and its AMS units: their changes redraw the card. */
  watched: string[];
}

export type View = "status" | "control" | "filament";
