// A fake Home Assistant for the card's tests: registries and states the way
// the integration creates them, built from a few lines per printer.
import type { Hass, HassDevice, HassEntityRegistryEntry, HassEntityState, LocalizeFunc } from "../src/types";
import integrationDe from "../../custom_components/bambuddy/translations/de.json";
import integrationEn from "../../custom_components/bambuddy/translations/en.json";

type EntityTexts = Record<string, Record<string, { name?: string }>>;

/** The integration's entity names, by "platform.translation_key", in each
 * of its languages: what Home Assistant's entity registry holds for an
 * entity the user did not rename -- in the server's language. */
export const INTEGRATION_NAMES = Object.fromEntries(
  Object.entries({ en: integrationEn, de: integrationDe }).map(([language, texts]) => [
    language,
    Object.fromEntries(
      Object.entries((texts as { entity: EntityTexts }).entity).flatMap(([platform, entities]) =>
        Object.entries(entities).map(([key, entity]) => [`${platform}.${key}`, entity.name ?? ""]),
      ),
    ),
  ]),
) as Record<"en" | "de", Record<string, string>>;

export interface FakeEntity {
  entityId: string;
  key: string;
  state: string;
  attributes?: Record<string, unknown>;
  /** The entity registry's name: the user's, else the integration's own. */
  name?: string;
  platform?: string;
  /** The display precision Home Assistant formats a number with. */
  precision?: number;
  /** When the state last changed (ISO), as Home Assistant reports it. */
  lastChanged?: string;
}

export interface FakeDevice {
  id: string;
  name: string;
  model: string;
  nameByUser?: string;
  via?: string;
  /** The serial number Home Assistant's device registry holds. */
  serial?: string;
  /** The device registry's identifiers, as (domain, id) pairs. */
  identifiers?: [string, string][];
  entities: FakeEntity[];
}

export interface ServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown> | undefined;
  notifyOnError: boolean | undefined;
  returnResponse?: boolean | undefined;
}

/** What the integration's get_filaments answers in these tests: a few of
 * Bambu Studio's profiles for an X1 Carbon, by vendor. */
export const OFFER = {
  vendors: [
    {
      name: "Bambu Lab",
      filaments: [
        { id: "GFA00", name: "PLA Basic", type: "PLA" },
        { id: "GFA01", name: "PLA Matte", type: "PLA" },
        { id: "GFG02", name: "PETG HF", type: "PETG" },
        { id: "GFU03", name: "TPU 95A HF", type: "TPU" },
      ],
    },
    {
      name: "Generic",
      filaments: [
        { id: "GFL99", name: "PLA", type: "PLA" },
        { id: "GFG99", name: "PETG", type: "PETG" },
        { id: "GFG96", name: "PETG HF", type: "PETG" },
        { id: "GFU98", name: "TPU for AMS", type: "TPU-AMS" },
        { id: "GFS99", name: "PVA", type: "PVA" },
      ],
    },
    { name: "SUNLU", filaments: [{ id: "GFSNL03", name: "PLA+", type: "PLA" }] },
  ],
};

/** The fixtures' slots by their profile, as get_filaments names it. */
export const SLOT_PROFILES: Record<string, string> = {
  "sensor.dev-x1c_ams_0_slot_3": "GFL99",
  "sensor.dev-a1mini_ams_0_slot_3": "GFG99",
  "sensor.a1_mini_external_spool": "GFU03",
};

/** get_filaments' answer for a slot: the offer, and its profile where the fixtures name one. */
export const offerFor = (entityId: unknown): Record<string, unknown> => {
  const current = typeof entityId === "string" ? SLOT_PROFILES[entityId] : undefined;
  return { ...OFFER, ...(current ? { current } : {}) };
};

export interface FakeHassOptions {
  devices?: FakeDevice[];
  /** Entities of other integrations, or without a device. */
  foreign?: FakeEntity[];
  language?: string;
  numberFormat?: string;
  timeFormat?: string;
  timeZone?: string;
  serverTimeZone?: string;
  /** Backend translations by key, for loadBackendTranslation and localize. */
  translations?: Record<string, string>;
  /** The user is an administrator; true when left out. */
  admin?: boolean;
  /** Answers an action call; resolves when left out -- get_filaments with
   * the fixtures' offer where it answers nothing. */
  callService?: (call: ServiceCall) => Promise<unknown>;
}

export type FakeHass = Hass & {
  /** A new hass object with one state replaced, as Home Assistant hands a
   * card after a state change: unchanged states keep their identity. */
  withState(entityId: string, state: string, attributes?: Record<string, unknown>): FakeHass;
  /** A new hass object whose registries changed: new identities. */
  withDevices(devices: FakeDevice[]): FakeHass;
  calls: ServiceCall[];
};

// The integration's state translations, as formatEntityState shows them.
const STATE_TEXTS: Record<string, Record<string, string>> = {
  en: {
    "print_status.idle": "Idle",
    "print_status.preparing": "Preparing",
    "print_status.slicing": "Slicing",
    "print_status.printing": "Printing",
    "print_status.paused": "Paused",
    "print_status.finished": "Finished",
    "print_status.failed": "Failed",
    "print_status.offline": "Offline",
    "print_status.unknown": "Unknown",
    "print_stage.idle": "Idle",
    "print_stage.printing": "Printing",
    "print_stage.heating_nozzle": "Heating nozzle",
    "print_stage.auto_bed_leveling": "Auto bed leveling",
    "print_stage.paused_by_user": "Paused by the user",
    "print_speed.silent": "Silent (50 %)",
    "print_speed.standard": "Standard (100 %)",
    "print_speed.sport": "Sport (124 %)",
    "print_speed.ludicrous": "Ludicrous (166 %)",
    "active_nozzle.left": "Left",
    "active_nozzle.right": "Right",
    "ams_status.idle": "Idle",
    "ams_status.heating": "Heating",
    "ams_status.feeding": "Feeding",
    "ams_status.purging": "Purging",
    "ams_status.changing_filament": "Changing filament",
    "nozzle_type.hardened_steel": "Hardened steel",
    "nozzle_type.stainless_steel": "Stainless steel",
    "left_nozzle_type.hardened_steel": "Hardened steel",
    "right_nozzle_type.stainless_steel_high_flow": "Stainless steel, high flow",
  },
  de: {
    "print_status.idle": "Bereit",
    "print_status.preparing": "Vorbereitung",
    "print_status.slicing": "Slicen",
    "print_status.printing": "Druckt",
    "print_status.paused": "Pausiert",
    "print_status.finished": "Fertig",
    "print_status.failed": "Fehlgeschlagen",
    "print_status.offline": "Offline",
    "print_status.unknown": "Unbekannt",
    "print_stage.idle": "Bereit",
    "print_stage.printing": "Druckt",
    "print_stage.heating_nozzle": "Düse heizt auf",
    "print_stage.auto_bed_leveling": "Automatische Bettnivellierung",
    "print_stage.paused_by_user": "Vom Benutzer pausiert",
    "print_speed.silent": "Leise (50 %)",
    "print_speed.standard": "Standard (100 %)",
    "print_speed.sport": "Sport (124 %)",
    "print_speed.ludicrous": "Ludicrous (166 %)",
    "active_nozzle.left": "Links",
    "active_nozzle.right": "Rechts",
    "ams_status.idle": "Bereit",
    "ams_status.heating": "Heizt",
    "ams_status.feeding": "Fördert",
    "ams_status.purging": "Spült",
    "ams_status.changing_filament": "Wechselt Filament",
    "nozzle_type.hardened_steel": "Gehärteter Stahl",
    "nozzle_type.stainless_steel": "Edelstahl",
    "left_nozzle_type.hardened_steel": "Gehärteter Stahl",
    "right_nozzle_type.stainless_steel_high_flow": "Edelstahl, High Flow",
  },
};

function stateOf(entity: FakeEntity): HassEntityState {
  return {
    entity_id: entity.entityId,
    state: entity.state,
    attributes: { ...(entity.attributes ?? {}) },
    ...(entity.lastChanged ? { last_changed: entity.lastChanged } : {}),
  };
}

export function makeHass(options: FakeHassOptions = {}): FakeHass {
  const language = options.language ?? "en";
  const locale = {
    language,
    number_format: options.numberFormat ?? "language",
    time_format: options.timeFormat ?? "24",
    time_zone: options.timeZone ?? "server",
  };
  const config = { time_zone: options.serverTimeZone ?? "Europe/Berlin" };
  // Home Assistant keeps the user object while states change.
  const user = { is_admin: options.admin ?? true };
  const translations = options.translations ?? {};
  const calls: ServiceCall[] = [];

  const registries = (devices: FakeDevice[]) => {
    const states: Record<string, HassEntityState> = {};
    const entities: Record<string, HassEntityRegistryEntry> = {};
    const deviceRegistry: Record<string, HassDevice> = {};
    for (const device of devices) {
      deviceRegistry[device.id] = {
        id: device.id,
        name: device.name,
        name_by_user: device.nameByUser ?? null,
        model: device.model,
        manufacturer: "Bambu Lab",
        via_device_id: device.via ?? null,
        serial_number: device.serial ?? null,
        identifiers: device.identifiers ?? [],
      };
      for (const entity of device.entities) {
        if (entity.precision !== undefined) precisions.set(entity.entityId, entity.precision);
        entities[entity.entityId] = {
          entity_id: entity.entityId,
          device_id: device.id,
          platform: entity.platform ?? "bambuddy",
          translation_key: entity.key,
          ...(entity.name === undefined ? {} : { name: entity.name }),
        };
        states[entity.entityId] = stateOf(entity);
      }
    }
    for (const entity of options.foreign ?? []) {
      entities[entity.entityId] = { entity_id: entity.entityId, device_id: null, platform: entity.platform ?? "other", translation_key: entity.key };
      states[entity.entityId] = stateOf(entity);
    }
    return { states, entities, devices: deviceRegistry };
  };

  // A number with a display precision as Home Assistant formats it: rounded,
  // in the language's digits, the unit after a space.
  const formatEntityState = (stateObj: HassEntityState, state?: string): string => {
    const value = state ?? stateObj.state;
    const key = keys.get(stateObj.entity_id);
    const text = key ? STATE_TEXTS[language]?.[`${key}.${value}`] : undefined;
    if (text) return text;
    const digits = precisions.get(stateObj.entity_id);
    const number = digits === undefined || !Number.isFinite(Number(value)) ? value : new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(Number(value));
    const unit = stateObj.attributes["unit_of_measurement"];
    return unit === undefined ? number : `${number} ${String(unit)}`;
  };
  const localize: LocalizeFunc = (key, values = {}) =>
    (translations[key] ?? "").replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole));
  const loadBackendTranslation = async (): Promise<LocalizeFunc> => localize;
  const callService = async (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    _target?: Record<string, unknown>,
    notifyOnError?: boolean,
    returnResponse?: boolean,
  ): Promise<unknown> => {
    const call = { domain, service, data, notifyOnError, ...(returnResponse === undefined ? {} : { returnResponse }) };
    calls.push(call);
    const answer = options.callService ? await options.callService(call) : undefined;
    if (answer === undefined && service === "get_filaments" && returnResponse) return { response: offerFor(data?.["entity_id"]) };
    return answer;
  };

  const keys = new Map<string, string>();
  const precisions = new Map<string, number>();
  const build = (registry: ReturnType<typeof registries>, current: Record<string, HassEntityState>): FakeHass => {
    for (const entry of Object.values(registry.entities)) keys.set(entry.entity_id, entry.translation_key ?? "");
    return {
      states: current,
      entities: registry.entities,
      devices: registry.devices,
      language,
      locale,
      config,
      user,
      formatEntityState,
      localize,
      loadBackendTranslation,
      callService,
      calls,
      withState(entityId, state, attributes) {
        const previous = current[entityId];
        return build(registry, { ...current, [entityId]: { entity_id: entityId, state, attributes: attributes ?? previous?.attributes ?? {} } });
      },
      withDevices(devices) {
        const next = registries(devices);
        return build(next, next.states);
      },
    };
  };
  const first = registries(options.devices ?? []);
  return build(first, first.states);
}

// --- The integration's devices -------------------------------------------------

export interface SlotSpec {
  name?: string;
  type?: string;
  color?: string | null;
  remaining?: number | null;
  active?: boolean;
  trayId: number;
  /** The spool's own drying recommendation: °C and hours. */
  drying?: [temperature: number, hours: number];
  /** A chip describes the spool: an AMS slot's spool unless false; never
   * an external one (its holder reads no chip). */
  rfid?: boolean;
  /** A spool sits in the AMS slot, described or not; unless it is empty
   * when left out. External spools always count. */
  present?: boolean;
}

function slotAttributes(spec: SlotSpec, slot: number, external = false): Record<string, unknown> {
  const empty = !spec.name && !spec.type;
  return {
    slot,
    color: empty ? null : (spec.color ?? null),
    type: spec.type ?? null,
    name: spec.name ?? null,
    remaining: spec.remaining ?? null,
    active: spec.active ?? false,
    empty,
    tray_id: spec.trayId,
    nozzle_temp_min: empty ? null : 190,
    nozzle_temp_max: empty ? null : 240,
    drying_temp: spec.drying?.[0] ?? null,
    drying_time: spec.drying?.[1] ?? null,
    rfid: spec.rfid ?? (!empty && !external),
    present: external || (spec.present ?? !empty),
  };
}

const slotState = (spec: SlotSpec): string => spec.name ?? spec.type ?? "empty";

export type Pair = [current: number, target?: number];

export interface PrinterSpec {
  id: string;
  slug: string;
  name: string;
  model: string;
  nameByUser?: string;
  status: string;
  stage?: string;
  progress?: number;
  remaining?: number;
  endTime?: string;
  layer?: number;
  totalLayers?: number;
  job?: string;
  /** One nozzle, or left and right. */
  nozzles: Pair[];
  bed: Pair;
  chamber?: Pair;
  hotendFan?: number;
  hms?: { code: string; severity: string; description: string | null }[];
  online?: boolean;
  plateClearNeeded?: boolean;
  /** The developer mode sensor: on (default), off, unknown, or none. */
  developerMode?: "on" | "off" | "unknown" | "none";
  /** The AMS status sensor's state; idle when left out. */
  amsStatus?: string;
  /** The active nozzle of a dual-nozzle printer; left when left out. */
  activeNozzle?: string;
  /** The API key holds Control Printer: buttons, numbers, fans, light, select. */
  control?: boolean;
  speed?: string;
  fans?: { key: string; percent: number }[];
  /** The integration's ventilation fan (printers with an airduct): its
   * percentage in tens, the fans it runs (`aux`, `right_aux`, `exhaust`),
   * unavailable as with the printer offline. */
  ventilation?: { percent: number; fans: string[]; available?: boolean };
  light?: boolean;
  camera?: boolean;
  cover?: boolean;
  externalSpools: SlotSpec[];
  /** The AI detection switches the model has, with control: on or off. */
  detectors?: { key: string; on: boolean }[];
  /** The printer's name in BamBuddy: the print status's `bambuddy_name`. */
  bambuddyName?: string | null;
  serial?: string;
  printHours?: number;
  /** The IP address sensor, which Home Assistant leaves disabled unless the user enables it. */
  ipAddress?: string;
  /** On Ethernet: the Wi-Fi signal then has no value. */
  wired?: boolean;
  /** The Wi-Fi signal in dBm; -52 when left out. */
  wifi?: number;
  /** One diameter (mm) per nozzle; 0.4 each when left out. */
  nozzleDiameters?: number[];
  /** One type per nozzle, as the integration's state; none when left out. */
  nozzleTypes?: string[];
  /** The firmware update entity; none when left out. */
  firmware?: { installed: string | null; latest: string | null; state?: string };
  /** The server's language: the entity names Home Assistant gave; English when left out. */
  serverLanguage?: "en" | "de";
  /** Names the user gave entities in Home Assistant, by translation key. */
  renamed?: Record<string, string>;
  /** The door sensor: on (open) or off; none when left out. */
  door?: "on" | "off";
  /** The storage sensor: on (present) or off; none when left out. */
  storage?: "on" | "off";
  /** The storage is a USB drive (P2S, X2D, H2 series), not an SD card. */
  storageUsb?: boolean;
  /** The maintenance sensor; none when left out. */
  maintenance?: MaintenanceSpec | "unavailable";
  /** The airduct mode select's state, with control; none when left out. */
  airduct?: string;
  /** The AMS filament backup switch, with control: on (when left out), off, unknown, or none. */
  filamentBackup?: "on" | "off" | "unknown" | "none";
}

/** A maintenance task as the integration's sensor lists it. */
export interface MaintenanceTask {
  id: number;
  name: string;
  due: boolean;
  due_soon: boolean;
  unit: "hours" | "days";
  interval: number;
  left: number;
  last_done: string | null;
}

export interface MaintenanceSpec {
  state: "ok" | "due_soon" | "overdue";
  tasks: MaintenanceTask[];
}

/** Five tasks of an X1C: one overdue, one due soon, one never done (and
 * overdue), two fine -- one counted in days. */
export const MAINTENANCE_TASKS: MaintenanceTask[] = [
  { id: 13, name: "Check Belt Tension", due: false, due_soon: false, unit: "hours", interval: 200, left: 136, last_done: "2026-08-15T12:00:00+00:00" },
  { id: 11, name: "Clean Build Plate", due: true, due_soon: false, unit: "hours", interval: 25, left: -12.5, last_done: "2026-09-20T10:00:00+00:00" },
  { id: 12, name: "Clean Nozzle/Hotend", due: false, due_soon: true, unit: "hours", interval: 100, left: 4, last_done: "2026-09-01T08:30:00+00:00" },
  { id: 14, name: "Clean Carbon Rods", due: true, due_soon: false, unit: "hours", interval: 100, left: -459.5, last_done: null },
  { id: 15, name: "Wipe the camera", due: false, due_soon: false, unit: "days", interval: 30, left: 20, last_done: "2026-10-07T09:00:00+00:00" },
];

export const maintenanceSpec = (overrides: Partial<MaintenanceSpec> = {}): MaintenanceSpec => ({
  state: "overdue",
  tasks: MAINTENANCE_TASKS,
  ...overrides,
});

/** A printer's device with the entities the integration creates for it. */
export function printerDevice(spec: PrinterSpec): FakeDevice {
  const p = spec.slug;
  const online = spec.online ?? true;
  // An entity's registry name and its friendly name, which Home Assistant
  // puts after the device's: the user's where the user renamed it, else the
  // integration's in the server's language.
  const named = (platform: string, key: string): { name: string; friendly_name: string } => {
    const name = spec.renamed?.[key] ?? INTEGRATION_NAMES[spec.serverLanguage ?? "en"][`${platform}.${key}`] ?? key;
    return { name, friendly_name: `${spec.nameByUser ?? spec.name} ${name}` };
  };
  // An offline printer's entities are unavailable, but for its print status
  // ("offline") and its Online sensor.
  const value = (state: string): string => (online ? state : "unavailable");
  const entities: FakeEntity[] = [
    {
      entityId: `sensor.${p}_print_status`,
      key: "print_status",
      state: online ? spec.status : "offline",
      attributes: { device_class: "enum", bambuddy_name: spec.bambuddyName ?? null },
    },
    { entityId: `sensor.${p}_print_stage`, key: "print_stage", state: value(spec.stage ?? "idle") },
    { entityId: `sensor.${p}_progress`, key: "progress", state: value(String(spec.progress ?? 0)), attributes: { unit_of_measurement: "%" } },
    { entityId: `sensor.${p}_remaining_time`, key: "remaining_time", state: value(String(spec.remaining ?? 0)), attributes: { unit_of_measurement: "min" } },
    { entityId: `sensor.${p}_end_time`, key: "end_time", state: value(spec.endTime ?? "unknown") },
    { entityId: `sensor.${p}_current_layer`, key: "current_layer", state: value(String(spec.layer ?? 0)) },
    { entityId: `sensor.${p}_total_layers`, key: "total_layers", state: value(String(spec.totalLayers ?? 0)) },
    { entityId: `sensor.${p}_current_print`, key: "current_print", state: value(spec.job ?? "unknown") },
    { entityId: `sensor.${p}_bed_temperature`, key: "bed_temperature", state: value(String(spec.bed[0])), attributes: { unit_of_measurement: "°C" } },
    {
      entityId: `sensor.${p}_hotend_fan`,
      key: "hotend_fan",
      name: named("sensor", "hotend_fan").name,
      state: value(String(spec.hotendFan ?? 0)),
      attributes: { unit_of_measurement: "%", friendly_name: named("sensor", "hotend_fan").friendly_name },
    },
    {
      entityId: `sensor.${p}_hms_errors`,
      key: "hms_errors",
      state: value(String(spec.hms?.length ?? 0)),
      attributes: { errors: spec.hms ?? [] },
    },
    // BamBuddy reports no Wi-Fi signal for a printer on Ethernet.
    {
      entityId: `sensor.${p}_wifi_signal`,
      key: "wifi_signal",
      state: value(spec.wired ? "unknown" : String(spec.wifi ?? -52)),
      attributes: { unit_of_measurement: "dBm" },
    },
    { entityId: `binary_sensor.${p}_wired_network`, key: "wired_network", state: value(spec.wired ? "on" : "off") },
    { entityId: `binary_sensor.${p}_online`, key: "online", state: online ? "on" : "off" },
    // Available while the printer is offline: BamBuddy keeps the gate.
    { entityId: `binary_sensor.${p}_plate_clear_needed`, key: "plate_clear_needed", state: spec.plateClearNeeded ? "on" : "off" },
    { entityId: `button.${p}_refresh_status`, key: "refresh_status", state: value("unknown") },
    { entityId: `sensor.${p}_ams_status`, key: "ams_status", state: value(spec.amsStatus ?? "idle"), attributes: { device_class: "enum" } },
  ];
  if (spec.printHours !== undefined) {
    // Available while the printer is offline: BamBuddy keeps the count.
    entities.push({
      entityId: `sensor.${p}_print_hours`,
      key: "print_hours",
      state: String(spec.printHours),
      attributes: { unit_of_measurement: "h", device_class: "duration" },
      precision: 0,
    });
  }
  if (spec.ipAddress !== undefined) {
    entities.push({ entityId: `sensor.${p}_ip_address`, key: "ip_address", state: value(spec.ipAddress) });
  }
  if (spec.firmware) {
    const { installed, latest, state } = spec.firmware;
    entities.push({
      entityId: `update.${p}_firmware`,
      key: "firmware",
      state: state ?? (installed && latest ? (installed === latest ? "off" : "on") : "unknown"),
      // The integration's firmware entity: release notes, no release URL.
      attributes: { installed_version: installed, latest_version: latest, supported_features: 16 },
    });
  }
  if (spec.door !== undefined) {
    entities.push({ entityId: `binary_sensor.${p}_door`, key: "door", state: value(spec.door), attributes: { device_class: "door" } });
  }
  if (spec.storage !== undefined) {
    const key = spec.storageUsb ? "usb_drive" : "sd_card";
    entities.push({ entityId: `binary_sensor.${p}_${key}`, key, state: value(spec.storage) });
  }
  if (spec.maintenance !== undefined) {
    // Available while the printer is offline: BamBuddy keeps it.
    const maintenance = spec.maintenance;
    entities.push(
      maintenance === "unavailable"
        ? { entityId: `sensor.${p}_maintenance`, key: "maintenance", state: "unavailable" }
        : {
            entityId: `sensor.${p}_maintenance`,
            key: "maintenance",
            state: maintenance.state,
            attributes: {
              device_class: "enum",
              tasks: maintenance.tasks,
              due_count: maintenance.tasks.filter((task) => task.due).length,
              due_soon_count: maintenance.tasks.filter((task) => task.due_soon).length,
            },
          },
    );
  }
  if (spec.developerMode !== "none") {
    entities.push({ entityId: `binary_sensor.${p}_developer_mode`, key: "developer_mode", state: value(spec.developerMode ?? "on") });
  }
  const dual = spec.nozzles.length > 1;
  const sides = dual ? ["left_", "right_"] : [""];
  spec.nozzles.forEach(([current], index) => {
    const side = sides[index] as string;
    entities.push({ entityId: `sensor.${p}_${side}nozzle_temperature`, key: `${side}nozzle_temperature`, state: value(String(current)), attributes: { unit_of_measurement: "°C" } });
  });
  spec.nozzles.forEach((_, index) => {
    const side = sides[index] as string;
    const diameter = spec.nozzleDiameters?.[index] ?? 0.4;
    entities.push({
      entityId: `sensor.${p}_${side}nozzle_diameter`,
      key: `${side}nozzle_diameter`,
      state: value(String(diameter)),
      attributes: { unit_of_measurement: "mm" },
    });
    const type = spec.nozzleTypes?.[index];
    if (type !== undefined) entities.push({ entityId: `sensor.${p}_${side}nozzle_type`, key: `${side}nozzle_type`, state: value(type) });
  });
  if (spec.chamber) {
    entities.push({ entityId: `sensor.${p}_chamber_temperature`, key: "chamber_temperature", state: value(String(spec.chamber[0])), attributes: { unit_of_measurement: "°C" } });
  }
  const spools = dual ? ["left_external_spool", "right_external_spool"] : ["external_spool"];
  spec.externalSpools.forEach((spool, index) => {
    const key = spools[index] as string;
    entities.push({ entityId: `sensor.${p}_${key}`, key, state: value(slotState(spool)), attributes: slotAttributes(spool, 1, true) });
  });
  const active = spec.externalSpools.find((spool) => spool.active);
  entities.push({ entityId: `sensor.${p}_active_filament`, key: "active_filament", state: value(active ? slotState(active) : "none") });
  if (spec.camera !== false) {
    // BamBuddy's rule: the RTSP models up to 30 frames a second, the A1 and P1 series 5.
    const most = /^(X1|X2|H2|P2)/.test(spec.model.toUpperCase()) ? 30 : 5;
    entities.push({
      entityId: `camera.${p}_camera`,
      key: "camera",
      state: value("idle"),
      attributes: { access_token: `token-${p}`, entity_picture: `/api/camera_proxy/camera.${p}_camera?token=token-${p}`, frame_rate: most },
    });
    if (most > 5) {
      entities.push({
        entityId: `number.${p}_camera_frame_rate`,
        key: "camera_frame_rate",
        state: String(most),
        attributes: { min: 5, max: most, step: 5, unit_of_measurement: "fps" },
      });
    }
  }
  if (spec.cover !== false) {
    entities.push({
      entityId: `image.${p}_cover`,
      key: "cover",
      state: value(spec.job ? "2026-10-16T08:00:00+00:00" : "unknown"),
      attributes: { entity_picture: `/api/image_proxy/image.${p}_cover?token=cover-${p}` },
    });
  }
  if (spec.control) {
    entities.push(
      { entityId: `button.${p}_pause`, key: "pause", state: value("unknown") },
      { entityId: `button.${p}_resume`, key: "resume", state: value("unknown") },
      { entityId: `button.${p}_stop`, key: "stop", state: value("unknown") },
      { entityId: `button.${p}_plate_cleared`, key: "plate_cleared", state: "unknown" },
      { entityId: `button.${p}_clear_hms_errors`, key: "clear_hms_errors", state: value("unknown") },
      {
        entityId: `select.${p}_print_speed`,
        key: "print_speed",
        state: value(spec.speed ?? "standard"),
        attributes: { options: ["silent", "standard", "sport", "ludicrous"] },
      },
      { entityId: `number.${p}_bed_target_temperature`, key: "bed_target_temperature", state: value(String(spec.bed[1] ?? 0)) },
    );
    if (spec.airduct !== undefined) {
      entities.push({ entityId: `select.${p}_airduct_mode`, key: "airduct_mode", state: value(spec.airduct), // The laser mode is listed while the printer is in it (the integration's select).
        attributes: { options: spec.airduct === "laser" ? ["cooling", "heating", "laser"] : ["cooling", "heating"] } });
    }

    spec.nozzles.forEach(([, target], index) => {
      const side = sides[index] as string;
      entities.push({ entityId: `number.${p}_${side}nozzle_target_temperature`, key: `${side}nozzle_target_temperature`, state: value(String(target ?? 0)) });
    });
    if (spec.chamber && spec.chamber[1] !== undefined) {
      entities.push({ entityId: `number.${p}_chamber_target_temperature`, key: "chamber_target_temperature", state: value(String(spec.chamber[1])) });
    }
    for (const fan of spec.fans ?? []) {
      const { name, friendly_name } = named("fan", fan.key);
      entities.push({
        entityId: `fan.${p}_${fan.key}`,
        key: fan.key,
        name,
        state: value(fan.percent > 0 ? "on" : "off"),
        attributes: { percentage: fan.percent, friendly_name },
      });
    }
    if (spec.ventilation) {
      const { percent, fans, available = true } = spec.ventilation;
      // Its fans are a capability attribute: kept while it is unavailable.
      entities.push({
        entityId: `fan.${p}_ventilation`,
        key: "ventilation",
        state: available ? value(percent > 0 ? "on" : "off") : "unavailable",
        attributes: available ? { percentage: percent, percentage_step: 10, fans } : { fans },
      });
    }
    entities.push(
      { entityId: `light.${p}_chamber_light`, key: "chamber_light", state: value(spec.light ? "on" : "off") },
    );
    if (spec.filamentBackup !== "none") {
      const backup = spec.filamentBackup ?? "on";
      entities.push({
        entityId: `switch.${p}_ams_filament_backup`,
        key: "ams_filament_backup",
        state: value(backup),
        attributes: backup === "unknown" ? { assumed_state: true } : {},
      });
    }
    for (const detector of spec.detectors ?? []) {
      const { name, friendly_name } = named("switch", detector.key);
      entities.push({
        entityId: `switch.${p}_${detector.key}`,
        key: detector.key,
        name,
        state: value(detector.on ? "on" : "off"),
        attributes: { friendly_name },
      });
    }
    if (dual) {
      entities.push({ entityId: `select.${p}_active_nozzle`, key: "active_nozzle", state: value(spec.activeNozzle ?? "left"), attributes: { options: ["left", "right"] } });
    }
  }
  return {
    id: spec.id,
    name: spec.name,
    model: spec.model,
    ...(spec.nameByUser ? { nameByUser: spec.nameByUser } : {}),
    ...(spec.serial ? { serial: spec.serial } : {}),
    entities,
  };
}

export interface AmsSpec {
  printer: FakeDevice;
  /** BamBuddy's unit ID: 0-3, 128-135 for the AMS HT. */
  amsId: number;
  model: string;
  humidity?: number;
  temperature?: number;
  slots: SlotSpec[];
  /** Drying is offered: true while it runs, with its minutes left. */
  drying?: { on: boolean; remaining: number; target?: number };
  online?: boolean;
  /** On a two-nozzle printer: the nozzle the unit feeds (its slots say it). */
  nozzle?: "left" | "right";
  /** Its name in BamBuddy: the integration names the unit by it, not by its place. */
  label?: string;
}

export function amsDevice(spec: AmsSpec): FakeDevice {
  const ht = spec.amsId >= 128;
  // Lettered as the integration names the unit: AMS A-D, AMS HT A-H.
  const label = `${ht ? "AMS HT" : "AMS"} ${String.fromCharCode(65 + (ht ? spec.amsId - 128 : spec.amsId))}`;
  const p = `${spec.printer.id}_ams_${spec.amsId}`;
  const value = (state: string): string => (spec.online === false ? "unavailable" : state);
  const entities: FakeEntity[] = spec.slots.map((slot, index) => ({
    entityId: `sensor.${p}_slot_${index + 1}`,
    key: "ams_slot",
    state: value(slotState(slot)),
    attributes: { ...slotAttributes(slot, index + 1), ...(spec.nozzle ? { nozzle: spec.nozzle } : {}) },
  }));
  if (spec.humidity !== undefined) {
    entities.push({ entityId: `sensor.${p}_humidity`, key: "ams_humidity", state: value(String(spec.humidity)), attributes: { unit_of_measurement: "%" } });
  }
  if (spec.temperature !== undefined) {
    entities.push({ entityId: `sensor.${p}_temperature`, key: "ams_temperature", state: value(String(spec.temperature)), attributes: { unit_of_measurement: "°C" } });
  }
  if (spec.drying) {
    entities.push(
      {
        entityId: `binary_sensor.${p}_drying`,
        key: "drying",
        state: value(spec.drying.on ? "on" : "off"),
        attributes: { target_temperature: spec.drying.target ?? null },
      },
      { entityId: `sensor.${p}_drying_remaining_time`, key: "drying_remaining_time", state: value(String(spec.drying.remaining)), attributes: { unit_of_measurement: "min" } },
    );
  }
  // The integration names a unit after the printer's BamBuddy name: the part
  // of the device name before " (model / serial)".
  const cut = spec.printer.name.lastIndexOf(" (");
  const short = cut > 0 ? spec.printer.name.slice(0, cut) : spec.printer.name;
  return { id: `${spec.printer.id}-ams-${spec.amsId}`, name: `${short} ${spec.label ?? label} (${spec.model})`, model: spec.model, via: spec.printer.id, entities };
}

// --- The printers the tests and the screenshots use ---------------------------

export const END_TIME = "2026-10-16T12:35:00+00:00";

/** An X1 Carbon printing from its AMS (slot 2), with a camera, a cover and
 * three AI detections. */
export function x1c(overrides: Partial<PrinterSpec> = {}): FakeDevice[] {
  const printer = printerDevice({
    id: "dev-x1c",
    slug: "x1c",
    name: "Workshop (X1C / 00M09A350100123)",
    bambuddyName: "Workshop",
    serial: "00M09A350100123",
    model: "X1C",
    printHours: 559.4,
    ipAddress: "192.168.1.42",
    wifi: -52,
    nozzleTypes: ["hardened_steel"],
    firmware: { installed: "01.08.02.00", latest: "01.09.00.00" },
    status: "printing",
    stage: "printing",
    progress: 62,
    remaining: 83,
    endTime: END_TIME,
    layer: 123,
    totalLayers: 250,
    job: "Benchy_0.2mm_PLA.3mf",
    nozzles: [[219.6, 220]],
    bed: [55.2, 55],
    chamber: [38],
    hotendFan: 100,
    control: true,
    speed: "standard",
    fans: [
      { key: "part_cooling_fan", percent: 100 },
      { key: "auxiliary_fan", percent: 40 },
      { key: "chamber_fan", percent: 30 },
    ],
    light: true,
    externalSpools: [{ trayId: 254 }],
    detectors: [
      { key: "ai_monitoring", on: true },
      { key: "first_layer_inspection", on: true },
      { key: "build_plate_position_detection", on: false },
    ],
    ...overrides,
  });
  // Two Bambu spools, a white PLA without a chip set on the printer, and a
  // spool in slot 4 that nobody described yet.
  const ams = amsDevice({
    printer,
    amsId: 0,
    model: "AMS",
    humidity: 21,
    temperature: 27.4,
    slots: [
      { name: "PLA Basic", type: "PLA", color: "#F4EE2A", remaining: 80, trayId: 0, drying: [55, 8] },
      { name: "PLA Matte", type: "PLA", color: "#1F79E5", remaining: 45, active: true, trayId: 1, drying: [55, 8] },
      { name: "PLA", type: "PLA", color: "#FFFFFF", remaining: null, trayId: 2, rfid: false },
      { trayId: 3, present: true },
    ],
    online: overrides.online,
  });
  return [printer, ams];
}

/** An H2D with two nozzles, paused by its user, with an AMS 2 Pro that is
 * drying and an AMS HT; both external spools; five AI detections. */
export function h2d(overrides: Partial<PrinterSpec> = {}): FakeDevice[] {
  const printer = printerDevice({
    id: "dev-h2d",
    slug: "h2d",
    name: "Studio (H2D / 0948AD123400456)",
    bambuddyName: "Studio",
    serial: "0948AD123400456",
    model: "H2D",
    printHours: 1203,
    wired: true,
    nozzleTypes: ["hardened_steel", "stainless_steel_high_flow"],
    firmware: { installed: "01.02.00.00", latest: "01.02.00.00" },
    status: "paused",
    stage: "paused_by_user",
    progress: 37,
    remaining: 214,
    endTime: "2026-10-17T05:10:00+00:00",
    layer: 58,
    totalLayers: 410,
    job: "Gridfinity baseplate 6x4",
    nozzles: [
      [250.3, 250],
      [31, 0],
    ],
    bed: [90.1, 90],
    chamber: [44.5, 45],
    hotendFan: 100,
    hms: [{ code: "0C0003000002000C", severity: "warning", description: "The build plate marker was not detected. Check that the plate is placed correctly." }],
    control: true,
    speed: "sport",
    fans: [
      { key: "part_cooling_fan", percent: 0 },
      { key: "auxiliary_fan", percent: 60 },
      // The H2 series' fan 3 is its exhaust fan.
      { key: "exhaust_fan", percent: 20 },
    ],
    light: false,
    externalSpools: [
      { name: "PETG HF", type: "PETG", color: "#0A0A0A", remaining: null, trayId: 254 },
      { trayId: 255 },
    ],
    detectors: [
      { key: "build_plate_detection", on: true },
      { key: "spaghetti_detection", on: true },
      { key: "pileup_detection", on: false },
      { key: "clumping_detection", on: true },
      { key: "air_printing_detection", on: false },
    ],
    ...overrides,
  });
  const ams2 = amsDevice({
    printer,
    amsId: 0,
    model: "AMS 2 Pro",
    nozzle: "right",
    humidity: 14,
    temperature: 51.5,
    drying: { on: true, remaining: 200 },
    slots: [
      { name: "PLA Basic", type: "PLA", color: "#E8E8E8", remaining: 92, trayId: 0, drying: [55, 8] },
      { name: "PLA Basic", type: "PLA", color: "#C12E1F", remaining: 61, active: true, trayId: 1, drying: [55, 8] },
      { name: "PLA Silk+", type: "PLA", color: "#D4AF37", remaining: 12, trayId: 2, drying: [55, 8] },
      { name: "Support for PLA", type: "PLA-S", color: "#F0F0E6", remaining: 70, trayId: 3 },
    ],
  });
  const ht = amsDevice({
    printer,
    amsId: 128,
    model: "AMS HT",
    nozzle: "left",
    humidity: 9,
    temperature: 30,
    drying: { on: false, remaining: 0 },
    slots: [{ name: "PA6-CF", type: "PA6-CF", color: "#2B2B2B", remaining: 55, trayId: 512, drying: [80, 10] }],
  });
  return [printer, ht, ams2];
}

/** An A1 mini, idle, with an AMS lite and a spool on its holder; it
 * detects the build plate. */
export function a1mini(overrides: Partial<PrinterSpec> = {}): FakeDevice[] {
  const printer = printerDevice({
    id: "dev-a1mini",
    slug: "a1_mini",
    name: "Desk (A1 Mini / 0309DA471800789)",
    nameByUser: "Desk A1 mini",
    bambuddyName: "Desk",
    serial: "0309DA471800789",
    model: "A1 Mini",
    printHours: 87,
    wifi: -68,
    nozzleTypes: ["stainless_steel"],
    status: "idle",
    stage: "idle",
    nozzles: [[27, 0]],
    bed: [24.8, 0],
    hotendFan: 0,
    control: true,
    speed: "standard",
    fans: [{ key: "part_cooling_fan", percent: 0 }],
    light: false,
    externalSpools: [{ name: "TPU 95A HF", type: "TPU", color: "#FF6A13", remaining: null, trayId: 254 }],
    detectors: [{ key: "build_plate_position_detection", on: true }],
    ...overrides,
  });
  // Slot 3: a PETG spool without a chip, its colour set on the printer.
  const lite = amsDevice({
    printer,
    amsId: 0,
    model: "AMS Lite",
    slots: [
      { name: "PLA Basic", type: "PLA", color: "#000000", remaining: 100, trayId: 0 },
      { name: "PLA Basic", type: "PLA", color: "#FFFFFF", remaining: 33, trayId: 1 },
      { name: "PETG", type: "PETG", color: "#7BC65B", remaining: null, trayId: 2, rfid: false },
      { name: "PLA Basic", type: "PLA", color: "#FF8FB7", remaining: 5, trayId: 3 },
    ],
  });
  return [printer, lite];
}

/** A P1S printing with a weak Wi-Fi signal and HMS messages of every
 * severity, its firmware state unknown; no AMS, no AI detection. */
export function p1s(overrides: Partial<PrinterSpec> = {}): FakeDevice[] {
  const printer = printerDevice({
    id: "dev-p1s",
    slug: "p1s",
    name: "Garage (P1S / 01P00A400000999)",
    bambuddyName: "Garage",
    serial: "01P00A400000999",
    model: "P1S",
    status: "printing",
    stage: "printing",
    progress: 12,
    remaining: 260,
    endTime: END_TIME,
    layer: 9,
    totalLayers: 180,
    job: "Phone stand",
    nozzles: [[220, 220]],
    bed: [65, 65],
    hotendFan: 100,
    printHours: 2410.6,
    wifi: -81,
    control: true,
    fans: [{ key: "part_cooling_fan", percent: 80 }],
    light: true,
    hms: [
      { code: "0300120000020001", severity: "warning", description: "The front cover of the toolhead fell off." },
      { code: "0300010000010001", severity: "error", description: "The nozzle temperature is abnormal; the heater may be short-circuited." },
      { code: "0500040000030002", severity: "notice", description: null },
    ],
    firmware: { installed: "01.07.00.00", latest: null, state: "unknown" },
    externalSpools: [{ name: "PLA Basic", type: "PLA", color: "#FFFFFF", remaining: null, active: true, trayId: 254 }],
    ...overrides,
  });
  return [printer];
}

/** A P1S BamBuddy cannot reach: its entities unavailable; BamBuddy knows
 * no name for it. */
export function offlineP1s(): FakeDevice[] {
  const printer = printerDevice({
    id: "dev-p1s",
    slug: "p1s",
    name: "P1S (01P00A400000999)",
    model: "P1S",
    printHours: 2410.6,
    wifi: -81,
    status: "printing",
    online: false,
    nozzles: [[0, 0]],
    bed: [0, 0],
    chamber: [0],
    control: true,
    fans: [{ key: "part_cooling_fan", percent: 0 }],
    externalSpools: [{ trayId: 254 }],
  });
  const ams = amsDevice({ printer, amsId: 0, model: "AMS", humidity: 30, slots: [{ name: "PLA Basic", type: "PLA", color: "#888888", trayId: 0 }], online: false });
  return [printer, ams];
}

/** The devices while BamBuddy does not answer: the integration's poll
 * fails, and every entity of the printer and its AMS units is unavailable,
 * the print status and the Online sensor too, without their attributes. */
export const unreachable = (devices: FakeDevice[]): FakeDevice[] =>
  devices.map((device) => ({ ...device, entities: device.entities.map((entity) => ({ ...entity, state: "unavailable", attributes: {} })) }));

/** The devices whose entities the integration does not set up -- a printer
 * BamBuddy no longer lists, or every device of an entry not loaded: Home
 * Assistant writes each registered entity unavailable, marked restored. */
export const missingFromBamBuddy = (devices: FakeDevice[]): FakeDevice[] =>
  devices.map((device) => ({ ...device, entities: device.entities.map((entity) => ({ ...entity, state: "unavailable", attributes: { restored: true } })) }));

/** The X1C without its control entities: Home Assistant has not created
 * them (yet) -- the integration's key always may control. */
export const readOnlyX1c = (overrides: Partial<PrinterSpec> = {}): FakeDevice[] => x1c({ control: false, ...overrides });

/** The BamBuddy instance's device: no printer; its Connection sensor on. */
export const instanceDevice: FakeDevice = {
  id: "dev-instance",
  name: "BamBuddy (192.168.1.5)",
  model: "BamBuddy",
  entities: [{ entityId: "binary_sensor.bambuddy_connection", key: "bambuddy_online", state: "on" }],
};

export interface FakeCard extends HTMLElement {
  hass?: FakeHass;
  preview?: boolean;
  setConfig(config: unknown): void;
  getCardSize(): number;
  getGridOptions(): Record<string, unknown>;
  updateComplete: Promise<boolean>;
}

/** The card as a dashboard creates it: element, configuration, hass. */
export async function mountCard(hass: FakeHass, config: Record<string, unknown>): Promise<FakeCard> {
  const card = document.createElement("bambuddy-printer-card") as FakeCard;
  card.setConfig({ type: "custom:bambuddy-printer-card", ...config });
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

// --- Smart plugs ----------------------------------------------------------------

export interface PlugSpec {
  printer: FakeDevice;
  /** BamBuddy's number of the plug. */
  id: number;
  name: string;
  /** A switch; its state only (MQTT, or a key that may not switch); a script. */
  kind?: "switch" | "state" | "script";
  /** "on", "off", "unknown" (a REST plug without status), "unavailable". */
  state?: string;
  powersPrinter?: boolean;
  /** BamBuddy's choice of the printer's own plug (the integration's
   * `printer_main`); left out, the attribute is not there. */
  main?: boolean;
  onCard?: boolean;
  bambuddyAutoOff?: boolean;
  watts?: number;
  today?: number;
  lastChanged?: string;
  /** When the integration saw the plug go from off to on. */
  onSince?: string;
  /** Our switch-off after the print, where the plug powers the printer. */
  autoOff?: { armed: boolean; phase?: string; since?: string; temperature?: number; everyPrint?: boolean; waitingFor?: string; switching?: boolean };
}

export function plugDevice(spec: PlugSpec): FakeDevice {
  const p = `${spec.printer.id}_plug_${spec.id}`;
  const attributes = {
    powers_printer: spec.powersPrinter ?? true,
    ...(spec.main === undefined ? {} : { printer_main: spec.main }),
    on_printer_card: spec.onCard ?? true,
    bambuddy_auto_off: spec.bambuddyAutoOff ?? false,
    plug_type: spec.kind === "script" ? "homeassistant" : spec.kind === "state" ? "mqtt" : "tasmota",
    on_since: spec.onSince ?? null,
  };
  const state = spec.state ?? "on";
  const kind = spec.kind ?? "switch";
  const entities: FakeEntity[] = [
    kind === "script"
      ? { entityId: `button.${p}_run`, key: "plug_run", state: state === "unavailable" ? "unavailable" : "unknown", attributes }
      : {
          entityId: `${kind === "switch" ? "switch" : "binary_sensor"}.${p}`,
          key: "plug",
          state,
          attributes: { ...attributes, ...(state === "unknown" ? { assumed_state: true } : {}) },
          ...(spec.lastChanged ? { lastChanged: spec.lastChanged } : {}),
        },
  ];
  const figure = (value: number | undefined): string => (state === "unavailable" ? "unavailable" : String(value));
  if (spec.watts !== undefined) {
    entities.push({ entityId: `sensor.${p}_power`, key: "plug_power", state: figure(spec.watts), attributes: { unit_of_measurement: "W" } });
  }
  if (spec.today !== undefined) {
    entities.push({ entityId: `sensor.${p}_energy_today`, key: "plug_energy_today", state: figure(spec.today), attributes: { unit_of_measurement: "kWh" } });
  }
  if (spec.autoOff) {
    const auto = spec.autoOff;
    entities.push(
      {
        entityId: `switch.${p}_auto_off`,
        key: "auto_off",
        state: auto.armed ? "on" : "off",
        attributes: {
          phase: auto.phase ?? "idle",
          since: auto.since ?? null,
          temperature: auto.temperature ?? 50,
          every_print: auto.everyPrint ?? false,
          waiting_for: auto.waitingFor ?? null,
          switching: auto.switching ?? false,
        },
      },
      { entityId: `switch.${p}_auto_off_every_print`, key: "auto_off_every_print", state: auto.everyPrint ? "on" : "off" },
      {
        entityId: `number.${p}_auto_off_temperature`,
        key: "auto_off_temperature",
        state: String(auto.temperature ?? 50),
        attributes: { min: 30, max: 100, step: 1, unit_of_measurement: "°C" },
      },
      { entityId: `button.${p}_auto_off_skip`, key: "auto_off_skip", state: auto.phase === "waiting" ? "unknown" : "unavailable" },
    );
  }
  const cut = spec.printer.name.lastIndexOf(" (");
  const short = cut > 0 ? spec.printer.name.slice(0, cut) : spec.printer.name;
  return { id: `${spec.printer.id}-plug-${spec.id}`, name: `${short} ${spec.name} (Smart Plug)`, model: "Tasmota", via: spec.printer.id, entities };
}

