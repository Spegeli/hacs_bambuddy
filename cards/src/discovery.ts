// Finds the integration's entities through Home Assistant's registries:
// platform "bambuddy", the printer's device or one of its AMS units, the
// entity's domain and translation key. Never by entity ID, which users can
// rename. Each lookup reads the registries Home Assistant hands over at
// that moment, so entities and AMS units that come later are found too.
import {
  DETECTORS,
  type AmsRefs,
  type DetectorKey,
  type FanKey,
  type Hass,
  type HassDevice,
  type HassEntityRegistryEntry,
  type Heater,
  type PlugRefs,
  type PrinterRefs,
} from "./types";

export const PLATFORM = "bambuddy";

/** "sensor.x1c_progress" -> "sensor". */
const domainOf = (entityId: string): string => entityId.slice(0, entityId.indexOf("."));

// The integration's entities by device, per entity registry: Home Assistant
// hands a card a new hass on every state change in the house, and a new
// entity registry object only when the registry changed.
const searched = new WeakMap<Hass["entities"], Map<string, HassEntityRegistryEntry[]>>();

function entitiesByDevice(hass: Hass): Map<string, HassEntityRegistryEntry[]> {
  const known = searched.get(hass.entities);
  if (known) return known;
  const byDevice = new Map<string, HassEntityRegistryEntry[]>();
  for (const entry of Object.values(hass.entities)) {
    if (!entry || entry.platform !== PLATFORM || !entry.device_id) continue;
    const list = byDevice.get(entry.device_id) ?? [];
    list.push(entry);
    byDevice.set(entry.device_id, list);
  }
  searched.set(hass.entities, byDevice);
  return byDevice;
}

/** A device's entities by "domain.translation_key", each key with its
 * entity IDs (an AMS unit has one "sensor.ams_slot" per slot). */
function keyed(entries: readonly HassEntityRegistryEntry[]): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.translation_key) continue;
    const key = `${domainOf(entry.entity_id)}.${entry.translation_key}`;
    keys.set(key, [...(keys.get(key) ?? []), entry.entity_id]);
  }
  return keys;
}

const STATUS_KEY = "sensor.print_status";

/** A device's print status sensor: a printer has one, an AMS unit or the
 * BamBuddy instance has none. */
function statusEntity(hass: Hass, deviceId: string): string | undefined {
  return (entitiesByDevice(hass).get(deviceId) ?? []).find((entry) => entry.translation_key === "print_status" && domainOf(entry.entity_id) === "sensor")
    ?.entity_id;
}

/** Whether the device is a BamBuddy printer: one with a print status sensor. */
export const isPrinter = (hass: Hass, deviceId: string | null | undefined): boolean => !!deviceId && statusEntity(hass, deviceId) !== undefined;

/** The state of a printer's print status sensor. */
export function printStatus(hass: Hass, deviceId: string): string | undefined {
  const entityId = statusEntity(hass, deviceId);
  return entityId ? hass.states[entityId]?.state : undefined;
}

/** The BamBuddy printers, in the order of the device registry. */
export function printerDevices(hass: Hass): HassDevice[] {
  return Object.values(hass.devices).filter((device): device is HassDevice => !!device && isPrinter(hass, device.id));
}

export const deviceName = (device: HassDevice): string => device.name_by_user || device.name || "";

/** The part of a printer's device name before " (model / serial)": its
 * name in BamBuddy, which its AMS units are named after. */
function shortName(name: string | null | undefined): string | undefined {
  const cut = name ? name.lastIndexOf(" (") : -1;
  return cut > 0 ? (name as string).slice(0, cut) : undefined;
}

/** An AMS unit's name without its printer's and without its "(model /
 * serial)": "Workshop AMS A (AMS 2 Pro / 19C…)" -> "AMS A" (also the older
 * "X1C (01S…) AMS 1"). A name the user gave the unit stays whole. */
function amsName(unit: HassDevice, printer: HassDevice): string {
  const name = deviceName(unit);
  if (unit.name_by_user) return name;
  const prefix = [printer.name, printer.name_by_user, shortName(printer.name)].find(
    (printerName) => printerName && name.startsWith(`${printerName} `),
  );
  const own = prefix ? name.slice(prefix.length + 1) : name;
  return own.endsWith(")") ? (shortName(own) ?? own) : own;
}

/** A number attribute of an entity's state, if it has one. */
function numberAttribute(hass: Hass, entityId: string, name: string): number | undefined {
  const value = hass.states[entityId]?.attributes[name];
  return typeof value === "number" ? value : undefined;
}

/** Slots in the order of their `slot` attribute; a slot without one last. */
function bySlot(hass: Hass, slots: readonly string[]): string[] {
  const position = (entityId: string): number => numberAttribute(hass, entityId, "slot") ?? Number.MAX_SAFE_INTEGER;
  return [...slots].sort((a, b) => position(a) - position(b));
}

/** The lowest global tray ID of a unit's slots: AMS A before AMS B before
 * the AMS HT units, as BamBuddy numbers them. */
function unitOrder(hass: Hass, unit: AmsRefs): number {
  const ids = unit.slots.map((slot) => numberAttribute(hass, slot, "tray_id")).filter((id): id is number => id !== undefined);
  return ids.length ? Math.min(...ids) : Number.MAX_SAFE_INTEGER;
}

function findAms(hass: Hass, printer: HassDevice): AmsRefs[] {
  const byDevice = entitiesByDevice(hass);
  const units: AmsRefs[] = [];
  for (const device of Object.values(hass.devices)) {
    if (!device || device.via_device_id !== printer.id) continue;
    const keys = keyed(byDevice.get(device.id) ?? []);
    const slots = keys.get("sensor.ams_slot");
    if (!slots) continue;
    const one = (key: string): string | undefined => keys.get(key)?.[0];
    units.push({
      deviceId: device.id,
      name: amsName(device, printer),
      model: device.model ?? "",
      humidity: one("sensor.ams_humidity"),
      temperature: one("sensor.ams_temperature"),
      slots: bySlot(hass, slots),
      drying: one("binary_sensor.drying"),
      dryingRemaining: one("sensor.drying_remaining_time"),
    });
  }
  return units.sort((a, b) => unitOrder(hass, a) - unitOrder(hass, b) || a.name.localeCompare(b.name));
}

/** A plug's state attribute, from its switch, state or run button. */
export function plugAttribute(hass: Hass, plug: PlugRefs, name: string): unknown {
  const entityId = plug.power ?? plug.run;
  return entityId ? hass.states[entityId]?.attributes[name] : undefined;
}

/** The plugs under the printer -- devices with a plug's switch, state or run
 * button --, by name (the card puts the printer's own first). */
function findPlugs(hass: Hass, printer: HassDevice): PlugRefs[] {
  const byDevice = entitiesByDevice(hass);
  const plugs: PlugRefs[] = [];
  for (const device of Object.values(hass.devices)) {
    if (!device || device.via_device_id !== printer.id) continue;
    const keys = keyed(byDevice.get(device.id) ?? []);
    const one = (key: string): string | undefined => keys.get(key)?.[0];
    const switchEntity = one("switch.plug");
    const power = switchEntity ?? one("binary_sensor.plug");
    const run = one("button.plug_run");
    if (!power && !run) continue;
    plugs.push({
      deviceId: device.id,
      name: amsName(device, printer),
      ...(power ? { power } : {}),
      switchable: switchEntity !== undefined,
      ...(run ? { run } : {}),
      ...(one("sensor.plug_power") ? { watts: one("sensor.plug_power") } : {}),
      ...(one("sensor.plug_energy_today") ? { energyToday: one("sensor.plug_energy_today") } : {}),
      ...(one("switch.auto_off") ? { autoOff: one("switch.auto_off") } : {}),
      ...(one("switch.auto_off_every_print") ? { autoOffEveryPrint: one("switch.auto_off_every_print") } : {}),
      ...(one("number.auto_off_temperature") ? { autoOffTemperature: one("number.auto_off_temperature") } : {}),
      ...(one("button.auto_off_skip") ? { autoOffSkip: one("button.auto_off_skip") } : {}),
    });
  }
  // By name; the printer's own plug goes first where the card shows them
  // (`power.ts`, by the integration's `printer_main`).
  return plugs.sort((a, b) => a.name.localeCompare(b.name));
}

const FAN_KEYS: Record<string, FanKey> = {
  "fan.part_cooling_fan": "part",
  "fan.auxiliary_fan": "aux",
  "fan.chamber_fan": "chamber",
  "fan.exhaust_fan": "exhaust",
  "fan.left_auxiliary_fan": "left_aux",
};

/** The entities only a printer with two nozzles has. */
const DUAL_KEYS = [
  ...["left_", "right_"].flatMap((side) => [`sensor.${side}nozzle_temperature`, `number.${side}nozzle_target_temperature`, `sensor.${side}external_spool`]),
  "select.active_nozzle",
];

/** The printer's entities, or undefined when the device is no BamBuddy
 * printer (unknown, removed, an AMS unit, the BamBuddy instance). */
export function findPrinter(hass: Hass, deviceId: string | undefined): PrinterRefs | undefined {
  const device = deviceId ? hass.devices[deviceId] : undefined;
  if (!device) return undefined;
  const entries = entitiesByDevice(hass).get(device.id) ?? [];
  const keys = keyed(entries);
  const one = (key: string): string | undefined => keys.get(key)?.[0];
  const status = one(STATUS_KEY);
  if (!status) return undefined;
  // Two nozzles: any entity of a side says so -- the user may have disabled some.
  const dual = DUAL_KEYS.some((key) => keys.has(key));
  const sides = dual ? ["left_", "right_"] : [""];
  const nozzles: Heater[] = sides.map((side) => ({ sensor: one(`sensor.${side}nozzle_temperature`), target: one(`number.${side}nozzle_target_temperature`) }));
  const externalSpools = sides.map((side) => one(`sensor.${side}external_spool`));
  const fans = Object.entries(FAN_KEYS)
    .map(([key, fan]) => ({ key: fan, entityId: one(key) }))
    .filter((fan): fan is { key: FanKey; entityId: string } => fan.entityId !== undefined);
  const detectors = DETECTORS.map((key) => ({ key, entityId: one(`switch.${key}`) })).filter(
    (detector): detector is { key: DetectorKey; entityId: string } => detector.entityId !== undefined,
  );
  const online = one("binary_sensor.online");
  const ams = findAms(hass, device);
  const plugs = findPlugs(hass, device);
  // In the nozzles' order, a nozzle without the sensor keeps its place.
  const perNozzle = (key: string): (string | undefined)[] => sides.map((side) => one(`sensor.${side}${key}`));
  return {
    deviceId: device.id,
    name: deviceName(device),
    model: device.model ?? "",
    status,
    stage: one("sensor.print_stage"),
    progress: one("sensor.progress"),
    remaining: one("sensor.remaining_time"),
    endTime: one("sensor.end_time"),
    layer: one("sensor.current_layer"),
    totalLayers: one("sensor.total_layers"),
    job: one("sensor.current_print"),
    nozzles,
    dual,
    bed: { sensor: one("sensor.bed_temperature"), target: one("number.bed_target_temperature") },
    chamber: { sensor: one("sensor.chamber_temperature"), target: one("number.chamber_target_temperature") },
    hotendFan: one("sensor.hotend_fan"),
    hms: one("sensor.hms_errors"),
    activeFilament: one("sensor.active_filament"),
    externalSpools: externalSpools.filter((spool): spool is string => spool !== undefined),
    online,
    plateClearNeeded: one("binary_sensor.plate_clear_needed"),
    developerMode: one("binary_sensor.developer_mode"),
    amsStatus: one("sensor.ams_status"),
    activeNozzle: one("select.active_nozzle"),
    pause: one("button.pause"),
    resume: one("button.resume"),
    stop: one("button.stop"),
    plateCleared: one("button.plate_cleared"),
    clearHms: one("button.clear_hms_errors"),
    speed: one("select.print_speed"),
    fans,
    detectors,
    // A printer without a chamber has a plain light.
    light: one("light.chamber_light") ?? one("light.light"),
    plainLight: !one("light.chamber_light") && one("light.light") !== undefined,
    camera: one("camera.camera"),
    cameraFps: one("number.camera_frame_rate"),
    cover: one("image.cover"),
    refresh: one("button.refresh_status"),
    printHours: one("sensor.print_hours"),
    wifiSignal: one("sensor.wifi_signal"),
    wiredNetwork: one("binary_sensor.wired_network"),
    ipAddress: one("sensor.ip_address"),
    firmware: one("update.firmware"),
    door: one("binary_sensor.door"),
    storage: one("binary_sensor.sd_card") ?? one("binary_sensor.usb_drive"),
    storageUsb: !keys.has("binary_sensor.sd_card") && keys.has("binary_sensor.usb_drive"),
    maintenance: one("sensor.maintenance"),
    airduct: one("select.airduct_mode"),
    filamentBackup: one("switch.ams_filament_backup"),
    nozzleDiameters: perNozzle("nozzle_diameter"),
    nozzleTypes: perNozzle("nozzle_type"),
    ams,
    plugs,
    watched: [
      ...entries.map((entry) => entry.entity_id),
      ...[...ams, ...plugs].flatMap((part) => (entitiesByDevice(hass).get(part.deviceId) ?? []).map((entry) => entry.entity_id)),
    ],
  };
}

/** Whether the API key holds Control Printer: the integration makes its
 * controls only then. Any of them says so -- the user may have disabled
 * some, the Pause button say. */
export function hasControls(refs: PrinterRefs): boolean {
  const heaters = [...refs.nozzles, refs.bed, refs.chamber].map((heater) => heater.target);
  const controls = [
    refs.pause,
    refs.resume,
    refs.stop,
    refs.plateCleared,
    refs.clearHms,
    refs.light,
    refs.speed,
    refs.activeNozzle,
    refs.airduct,
    refs.filamentBackup,
    ...heaters,
  ];
  return controls.some((entityId) => entityId !== undefined) || refs.fans.length > 0 || refs.detectors.length > 0;
}

/** Whether the printer is online: its Online sensor where it has one, else
 * -- the user may have disabled the sensor -- its print status, neither
 * offline nor without an answer from BamBuddy. */
export function printerOnline(hass: Hass, refs: PrinterRefs): boolean {
  if (refs.online) return hass.states[refs.online]?.state === "on";
  const status = refs.status ? hass.states[refs.status]?.state : undefined;
  return status !== undefined && status !== "offline" && status !== "unavailable";
}

/** The AMS units the card shows now. A unit unplugged or plugged in
 * elsewhere has all its slots unavailable while the printer is online: it
 * is left out until a slot reports again. Offline, every unit stays, its
 * contents unknown. */
export function shownUnits(hass: Hass, refs: PrinterRefs): AmsRefs[] {
  return printerOnline(hass, refs)
    ? refs.ams.filter((unit) => unit.slots.some((slot) => hass.states[slot]?.state !== "unavailable"))
    : refs.ams;
}
