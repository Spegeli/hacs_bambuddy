// The chips under the name (2026-10-27): every chip has a tooltip, HMS and
// maintenance say what they count, and compact chips (`compact_chips`) show
// icon and value only -- their tooltip and their name keep the full text.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { changedConfig, configForm, editorData, settingsOf, validateConfig } from "../src/forms";
import { h2d, makeHass, MAINTENANCE_TASKS, maintenanceSpec, mountCard, p1s, plugDevice, unreachable, x1c, type FakeCard, type FakeDevice, type FakeHass, type PlugSpec, type PrinterSpec } from "./fixtures";
import { find, findAll, NBSP, styleText, text, update } from "./helpers";

interface Mounted {
  card: FakeCard;
  hass: FakeHass;
}

async function mount(devices: FakeDevice[], printer: string, config: Record<string, unknown> = {}, language = "en"): Promise<Mounted> {
  const hass = makeHass({ devices, language });
  const card = await mountCard(hass, { printer, ...config });
  return { card, hass };
}

const ALL = { door: "on" as const, storage: "off" as const, maintenance: maintenanceSpec() };
const EVERY_CHIP = ["network", "hms", "firmware", "maintenance", "door", "storage", "drying", "power"];

const pill = (card: FakeCard, kind: string): HTMLElement => {
  const found = find(card, `.pills .pill.${kind}`) as HTMLElement | null;
  if (!found) throw new Error(`no ${kind} chip in: ${findAll(card, ".pills .pill").map(text).join(" | ")}`);
  return found;
};
const tooltip = (card: FakeCard, kind: string): string | null => pill(card, kind).getAttribute("title");
/** A chip's text as it shows: without what only a screen reader hears. */
const visible = (element: Element): string => {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll(".sr-only").forEach((hidden) => hidden.remove());
  return text(copy);
};
const spoken = (element: Element): string => text(element.querySelector(".sr-only"));
const named = (card: FakeCard, kind: string): string | null => pill(card, kind).getAttribute("aria-label");

/** The X1C and its plugs (the printer's own by default). */
function x1cWith(printer: Partial<PrinterSpec> = {}, ...plugs: Omit<PlugSpec, "printer">[]): FakeDevice[] {
  const devices = x1c(printer);
  const device = devices[0] as FakeDevice;
  const specs = plugs.length ? plugs : [{ id: 3, name: "Tasmota", watts: 182.4, today: 1.27 }];
  return [...devices, ...specs.map((spec) => plugDevice({ printer: device, ...spec }))];
}
const IDLE: Partial<PrinterSpec> = { status: "idle", stage: "idle", progress: 0, nozzles: [[30, 0]] };
const ACCESSORY = { id: 4, name: "Exhaust fan", powersPrinter: false, watts: 12 };

const TIME = `3${NBSP}h${NBSP}20${NBSP}min`;
const BOTH = `5${NBSP}h${NBSP}20${NBSP}min`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T14:10:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("every chip's tooltip", () => {
  it("names the network: Wi-Fi with its signal and how good it is, or LAN", async () => {
    const wifi = await mount(x1c(), "dev-x1c");
    expect(tooltip(wifi.card, "network")).toBe(`Network: Wi-Fi, −52${NBSP}dBm, good`);
    expect(tooltip(wifi.card, "network")).toBe(named(wifi.card, "network"));
    const lan = await mount(h2d(), "dev-h2d");
    expect(tooltip(lan.card, "network")).toBe("Network: LAN (wired)");
  });

  it("says the door is open, and why missing storage matters", async () => {
    const { card } = await mount(x1c(ALL), "dev-x1c", { header_chips: ["door", "storage"] });
    expect([tooltip(card, "door"), named(card, "door")]).toEqual(["Door open", "Door open"]);
    expect([tooltip(card, "storage"), named(card, "storage")]).toEqual([
      "No SD card – BamBuddy cannot send prints to the printer",
      "No SD card – BamBuddy cannot send prints to the printer",
    ]);
    const usb = await mount(h2d({ storage: "off", storageUsb: true }), "dev-h2d", { header_chips: ["storage"] });
    expect(tooltip(usb.card, "storage")).toBe("No USB drive – BamBuddy cannot send prints to the printer");
  });

  it("names the one drying unit and when it is done", async () => {
    const { card, hass } = await mount(h2d(), "dev-h2d", { header_chips: ["drying"] });
    expect(tooltip(card, "dry-chip")).toBe(`AMS A drying, done in ${TIME}`);
    await update(card, hass.withState("sensor.dev-h2d_ams_0_drying_remaining_time", "unknown"));
    expect(tooltip(card, "dry-chip")).toBe("AMS A drying");
  });

  it("splits maintenance into overdue and due soon, without a part of none", async () => {
    const { card, hass } = await mount(x1c(ALL), "dev-x1c", { header_chips: ["maintenance"] });
    expect(tooltip(card, "maintenance")).toBe("Maintenance: 3 due – 2 overdue, 1 due soon");
    const overdue = MAINTENANCE_TASKS.map((task) => ({ ...task, due_soon: false }));
    await update(card, hass.withState("sensor.x1c_maintenance", "overdue", { tasks: overdue, can_mark_done: true }));
    expect(tooltip(card, "maintenance")).toBe("Maintenance: 2 due – 2 overdue");
    const soon = MAINTENANCE_TASKS.map((task) => ({ ...task, due: false }));
    await update(card, hass.withState("sensor.x1c_maintenance", "due_soon", { tasks: soon, can_mark_done: true }));
    expect(tooltip(card, "maintenance")).toBe("Maintenance: 1 due soon");
  });

  it("says it in German", async () => {
    const { card } = await mount(x1c(ALL), "dev-x1c", { header_chips: ["network", "maintenance", "door", "storage"] }, "de");
    expect(tooltip(card, "network")).toBe(`Netzwerk: WLAN, −52${NBSP}dBm, gut`);
    expect(tooltip(card, "maintenance")).toBe("Wartung: 3 fällig – 2 überfällig, 1 bald fällig");
    expect(tooltip(card, "door")).toBe("Tür offen");
    expect(tooltip(card, "storage")).toBe("Keine SD-Karte – BamBuddy kann keine Drucke an den Drucker senden");
    const drying = await mount(h2d(), "dev-h2d", { header_chips: ["drying"] }, "de");
    expect(tooltip(drying.card, "dry-chip")).toMatch(/^AMS A trocknet, fertig in /);
  });
});

describe("tooltips beside the chips", () => {
  it("names the live view's frame rate", async () => {
    const { card } = await mount(x1c(), "dev-x1c", { camera: "always" });
    expect(find(card, ".live-fps")?.getAttribute("title")).toBe("Measuring the frame rate");
  });

  it("names humidity and temperature in the Status tab's AMS heads", async () => {
    const { card } = await mount(x1c(), "dev-x1c");
    expect([find(card, ".ams-hum")?.getAttribute("title"), find(card, ".ams-temp")?.getAttribute("title")]).toEqual(["Humidity", "Temperature"]);
    const de = await mount(x1c(), "dev-x1c", {}, "de");
    expect([find(de.card, ".ams-hum")?.getAttribute("title"), find(de.card, ".ams-temp")?.getAttribute("title")]).toEqual(["Feuchte", "Temperatur"]);
  });
});

describe("the full chips", () => {
  it("say HMS messages and maintenance in words", async () => {
    const garage = await mount(p1s(), "dev-p1s");
    expect(text(pill(garage.card, "hms"))).toBe("3 HMS messages");
    const one = await mount(x1c({ hms: [{ code: "0500040000030002", severity: "notice", description: null }] }), "dev-x1c");
    expect(text(pill(one.card, "hms"))).toBe("1 HMS message");
    const { card, hass } = await mount(x1c(ALL), "dev-x1c", { header_chips: ["maintenance"] });
    expect(text(pill(card, "maintenance"))).toBe("Maintenance: 3 due");
    const soon = MAINTENANCE_TASKS.map((task) => ({ ...task, due: false }));
    await update(card, hass.withState("sensor.x1c_maintenance", "due_soon", { tasks: soon, can_mark_done: true }));
    expect(text(pill(card, "maintenance"))).toBe("Maintenance: 1 due soon");
  });

  it("say it in German", async () => {
    const garage = await mount(p1s(), "dev-p1s", {}, "de");
    expect(text(pill(garage.card, "hms"))).toBe("3 HMS-Meldungen");
    const { card, hass } = await mount(x1c(ALL), "dev-x1c", { header_chips: ["maintenance"] }, "de");
    expect(text(pill(card, "maintenance"))).toBe("Wartung: 3 fällig");
    const soon = MAINTENANCE_TASKS.map((task) => ({ ...task, due: false }));
    await update(card, hass.withState("sensor.x1c_maintenance", "due_soon", { tasks: soon, can_mark_done: true }));
    expect(text(pill(card, "maintenance"))).toBe("Wartung: 1 bald fällig");
  });
});

describe("compact chips", () => {
  const compact = { compact_chips: true, header_chips: EVERY_CHIP };

  it("show icon and value: OK, counts, the new firmware, the network as it was", async () => {
    const { card } = await mount(x1c(ALL), "dev-x1c", compact);
    expect(visible(pill(card, "network"))).toBe(`−52${NBSP}dBm`);
    expect(visible(pill(card, "hms"))).toBe("OK");
    expect(visible(pill(card, "firmware"))).toBe("01.09.00.00");
    expect(visible(pill(card, "maintenance"))).toBe("3");
    const garage = await mount(p1s(), "dev-p1s", { compact_chips: true });
    expect(visible(pill(garage.card, "hms"))).toBe("3");
  });

  it("keep the full text as tooltip and name", async () => {
    const garage = await mount(p1s(), "dev-p1s", { compact_chips: true });
    expect([tooltip(garage.card, "hms"), named(garage.card, "hms")]).toEqual(["3 HMS messages", "3 HMS messages"]);
    const { card } = await mount(x1c(ALL), "dev-x1c", compact);
    expect(tooltip(card, "maintenance")).toBe("Maintenance: 3 due – 2 overdue, 1 due soon");
    expect(tooltip(card, "firmware")).toMatch(/^Update 01\.09\.00\.00 available, firmware .+ installed$/);
    expect(tooltip(card, "hms")).toBe("HMS OK – no messages");
  });

  it("show the door and missing storage as their icon alone", async () => {
    const { card } = await mount(x1c(ALL), "dev-x1c", compact);
    for (const kind of ["door", "storage"]) {
      expect(visible(pill(card, kind)), kind).toBe("");
      expect(pill(card, kind).querySelector(".icon"), kind).not.toBeNull();
    }
    expect(named(card, "door")).toBe("Door open");
    expect(named(card, "storage")).toBe("No SD card – BamBuddy cannot send prints to the printer");
  });

  it("show the drying time, with how many units dry", async () => {
    const { card, hass } = await mount(h2d(), "dev-h2d", { compact_chips: true, header_chips: ["drying"] });
    expect(visible(pill(card, "dry-chip"))).toBe(TIME);
    const both = hass.withState("binary_sensor.dev-h2d_ams_128_drying", "on").withState("sensor.dev-h2d_ams_128_drying_remaining_time", "320");
    await update(card, both);
    expect(visible(pill(card, "dry-chip"))).toBe(`2× ${BOTH}`);
    expect(tooltip(card, "dry-chip")).toBe(`2 AMS units drying, all done in ${BOTH}`);
    // Without a time: what dries.
    await update(card, both.withState("sensor.dev-h2d_ams_0_drying_remaining_time", "unknown").withState("sensor.dev-h2d_ams_128_drying_remaining_time", "unknown"));
    expect(visible(pill(card, "dry-chip"))).toBe("2 AMS drying");
  });

  it("show the plug's power or its state in a word", async () => {
    const chip = async (devices: FakeDevice[], language = "en"): Promise<[string, string | null]> => {
      const { card } = await mount(devices, "dev-x1c", { compact_chips: true, header_chips: ["power"] }, language);
      return [visible(pill(card, "power-chip")), tooltip(card, "power-chip")];
    };
    expect(await chip(x1cWith())).toEqual([`182${NBSP}W`, `182${NBSP}W – plug “Tasmota”`]);
    expect(await chip(x1cWith({}, { id: 3, name: "T", state: "off" }))).toEqual(["Off", "Power off – plug “T”"]);
    expect(await chip(x1cWith({}, { id: 3, name: "T", today: undefined, watts: undefined }))).toEqual(["On", "Power on – plug “T”"]);
    expect(await chip(x1cWith({}, { id: 3, name: "T", state: "unavailable" }))).toEqual(["Unreachable", "Plug unreachable – plug “T”"]);
    expect(await chip(x1cWith({}, { id: 7, name: "MQTT", kind: "state", state: "unknown" }))).toEqual(["Unknown", "Power unknown – plug “MQTT”"]);
    expect((await chip(x1cWith(IDLE, { id: 3, name: "T", watts: 6, autoOff: { armed: true, phase: "waiting" } })))[0]).toBe("Waiting");
    // An accessory's: its name in the tooltip.
    expect(await chip(x1cWith({}, ACCESSORY))).toEqual([`12${NBSP}W`, `Exhaust fan · 12${NBSP}W`]);
    expect(await chip(x1cWith({}, { ...ACCESSORY, state: "off" }))).toEqual(["Off", "Exhaust fan: Off"]);
    expect((await chip(x1cWith({}, { id: 3, name: "T", state: "unavailable" }), "de"))[0]).toBe("Nicht erreichbar");
    expect((await chip(x1cWith({}, { id: 3, name: "T", state: "off" }), "de"))[0]).toBe("Aus");
  });

  it("keep their colours", async () => {
    const full = await mount(x1c(ALL), "dev-x1c", { header_chips: EVERY_CHIP });
    const short = await mount(x1c(ALL), "dev-x1c", compact);
    const tones = (card: FakeCard): string[] => findAll(card, ".pills .pill").map((item) => [...item.classList].find((name) => name.startsWith("tone-")) ?? "");
    expect(tones(short.card)).toEqual(tones(full.card));
  });
});

describe("the compact chips' option", () => {
  it("is off unless the configuration says so, and written only when on", () => {
    const TYPE = "custom:bambuddy-printer-card";
    expect(settingsOf(validateConfig({ type: TYPE })).compactChips).toBe(false);
    expect(settingsOf(validateConfig({ type: TYPE, compact_chips: true })).compactChips).toBe(true);
    expect(() => validateConfig({ type: TYPE, compact_chips: "yes" })).toThrow(/compact_chips/);
    const shown = editorData({ type: TYPE });
    expect(shown["compact_chips"]).toBe(false);
    expect(changedConfig({ type: TYPE }, shown, { ...shown, compact_chips: true })).toEqual({ type: TYPE, compact_chips: true });
    expect(changedConfig({ type: TYPE, compact_chips: true }, { ...shown, compact_chips: true }, shown)).toEqual({ type: TYPE });
  });

  it("is a switch right below the chips, named and explained in both languages", () => {
    const form = configForm(makeHass({ language: "en" }));
    const general = (form.schema[1]?.["schema"] as { name: string; selector?: unknown }[]).map((field) => field.name);
    expect(general.slice(general.indexOf("header_chips"), general.indexOf("header_chips") + 2)).toEqual(["header_chips", "compact_chips"]);
    expect((form.schema[1]?.["schema"] as { name: string; selector?: unknown }[]).find((field) => field.name === "compact_chips")).toEqual({
      name: "compact_chips",
      selector: { boolean: {} },
    });
    expect(form.computeLabel({ name: "compact_chips" })).toBe("Compact chips");
    expect(form.computeHelper({ name: "compact_chips" })).toBe(
      "Short chip texts: icon and value, e.g. “OK” instead of “HMS OK”. The full text shows as a tooltip and is read out by screen readers.",
    );
    const de = configForm(makeHass({ language: "de" }));
    expect(de.computeLabel({ name: "compact_chips" })).toBe("Kompakte Chips");
    expect(de.computeHelper({ name: "compact_chips" })).toBe(
      "Kurze Texte in den Chips: Symbol und Wert, z. B. „OK“ statt „HMS OK“. Der volle Text steht im Tooltip und wird von Screenreadern vorgelesen.",
    );
  });
});


describe("compact chips in every state, with their full words for screen readers", () => {
  const compact = { compact_chips: true, header_chips: EVERY_CHIP };

  it("name the drying chip in full: one unit, several, none without a time", async () => {
    const { card, hass } = await mount(h2d(), "dev-h2d", { compact_chips: true, header_chips: ["drying"] });
    expect(named(card, "dry-chip")).toBe(`AMS A drying, done in ${TIME}`);
    const both = hass.withState("binary_sensor.dev-h2d_ams_128_drying", "on").withState("sensor.dev-h2d_ams_128_drying_remaining_time", "320");
    await update(card, both);
    expect(named(card, "dry-chip")).toBe(`2 AMS units drying, all done in ${BOTH}`);
    await update(card, hass.withState("sensor.dev-h2d_ams_0_drying_remaining_time", "unknown"));
    expect([text(pill(card, "dry-chip")), named(card, "dry-chip")]).toEqual(["Drying", null]);
  });

  it("give the chip row's announcements the full text", async () => {
    const { card } = await mount(x1c(ALL), "dev-x1c", compact);
    expect([visible(pill(card, "hms")), spoken(pill(card, "hms"))]).toEqual(["OK", "HMS OK – no messages"]);
    expect([visible(pill(card, "maintenance")), spoken(pill(card, "maintenance"))]).toEqual(["3", "Maintenance: 3 due – 2 overdue, 1 due soon"]);
    expect(visible(pill(card, "firmware"))).toBe("01.09.00.00");
    expect(spoken(pill(card, "firmware"))).toMatch(/^Update 01\.09\.00\.00 available, firmware .+ installed$/);
    expect([visible(pill(card, "door")), spoken(pill(card, "door"))]).toEqual(["", "Door open"]);
    expect([visible(pill(card, "storage")), spoken(pill(card, "storage"))]).toEqual(["", "No SD card – BamBuddy cannot send prints to the printer"]);
    // What shows is not read twice.
    expect(pill(card, "hms").querySelector("span:not(.sr-only)")?.getAttribute("aria-hidden")).toBe("true");
    // Full chips need none: what they show starts their name.
    const full = await mount(x1c(ALL), "dev-x1c", { header_chips: EVERY_CHIP });
    expect(find(full.card, ".pills .sr-only")).toBeNull();
  });

  it("centre the icon of an icon-only chip, and keep its tooltip", async () => {
    const { card } = await mount(x1c(ALL), "dev-x1c", compact);
    expect([pill(card, "door").classList.contains("icon-only"), pill(card, "storage").classList.contains("icon-only")]).toEqual([true, true]);
    expect([tooltip(card, "door"), tooltip(card, "storage")]).toEqual(["Door open", "No SD card – BamBuddy cannot send prints to the printer"]);
    expect(pill(card, "hms").classList.contains("icon-only")).toBe(false);
    expect(styleText()).toMatch(/\.pill\.icon-only\s*\{[^}]*padding: 0 9px;/);
  });

  it("show the firmware's version offline and when up to date, and keep Update in a bare update's name", async () => {
    const offline = await mount(x1c({ online: false }), "dev-x1c", { compact_chips: true });
    expect([visible(pill(offline.card, "firmware")), pill(offline.card, "firmware").classList.contains("tone-warn")]).toEqual(["01.09.00.00", true]);
    const current = await mount(h2d(), "dev-h2d", { compact_chips: true });
    expect(visible(pill(current.card, "firmware"))).toBe("01.02.00.00");
    const bare = await mount(x1c({ firmware: { installed: null, latest: "01.09.00.00", state: "on" } }), "dev-x1c", { compact_chips: true });
    expect([visible(pill(bare.card, "firmware")), named(bare.card, "firmware")]).toEqual(["01.09.00.00", "Update 01.09.00.00"]);
  });

  it("say maintenance OK, and power in German and without data from BamBuddy", async () => {
    const { card, hass } = await mount(x1c(ALL), "dev-x1c", { compact_chips: true, header_chips: ["maintenance"] });
    await update(card, hass.withState("sensor.x1c_maintenance", "ok", { tasks: [], can_mark_done: true }));
    expect(visible(pill(card, "maintenance"))).toBe("OK");
    const chip = async (devices: FakeDevice[], language = "de"): Promise<string> =>
      visible(pill((await mount(devices, "dev-x1c", { compact_chips: true, header_chips: ["power"] }, language)).card, "power-chip"));
    expect(await chip(x1cWith({}, { id: 3, name: "T", today: undefined, watts: undefined }))).toBe("An");
    expect(await chip(x1cWith(IDLE, { id: 3, name: "T", watts: 6, autoOff: { armed: true, phase: "waiting" } }))).toBe("Wartet");
    expect(await chip(x1cWith({}, { id: 7, name: "MQTT", kind: "state", state: "unknown" }))).toBe("Unbekannt");
    expect(await chip(x1cWith({}, { ...ACCESSORY, state: "off" }))).toBe("Aus");
    expect(await chip(x1cWith({}, { ...ACCESSORY, watts: undefined }))).toBe("An");
    expect(await chip(unreachable(x1cWith()), "en")).toBe("Unknown");
  });
});

