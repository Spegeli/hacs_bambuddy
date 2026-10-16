import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { BamBuddyPrinterCard, DRYING } from "../src/card";
import { ICONS } from "../src/icons";
import { cardStyles } from "../src/styles";
import {
  a1mini,
  amsDevice,
  h2d,
  instanceDevice,
  makeHass,
  mountCard,
  offlineP1s,
  readOnlyX1c,
  x1c,
  type FakeCard,
  type FakeDevice,
  type FakeHass,
  type FakeHassOptions,
  type PrinterSpec,
} from "./fixtures";
import { button, cardText, find, findAll, hasButton, NBSP, press, root, settle, text, update } from "./helpers";

/** The load and unload buttons of the filament view's slots. */
const loadButtons = (card: FakeCard): HTMLButtonElement[] =>
  findAll<HTMLButtonElement>(card, ".slot .btn").filter((item) => ["Load", "Unload", "Laden", "Entladen"].includes(text(item)));

/** Confirms the open dialog with its own button, the last one. */
async function confirmDialog(card: FakeCard): Promise<void> {
  findAll<HTMLButtonElement>(card, "dialog button").at(-1)?.click();
  await settle(card);
}

async function showView(card: FakeCard, tab: "Status" | "Control" | "Filament" | "Steuerung"): Promise<void> {
  const found = findAll(card, "[role=tab]").find((item) => text(item) === tab);
  found?.click();
  await card.updateComplete;
}

const PRINTERS: Record<string, [() => FakeDevice[], string]> = {
  x1c: [x1c, "dev-x1c"],
  h2d: [h2d, "dev-h2d"],
  a1mini: [a1mini, "dev-a1mini"],
  p1s: [offlineP1s, "dev-p1s"],
  readOnly: [readOnlyX1c, "dev-x1c"],
};

async function cardFor(
  name: keyof typeof PRINTERS,
  config: Record<string, unknown> = {},
  options: { language?: string; devices?: FakeDevice[]; callService?: FakeHassOptions["callService"] } = {},
): Promise<{ card: FakeCard; hass: FakeHass }> {
  const [devices, printer] = PRINTERS[name] as [() => FakeDevice[], string];
  const hass = makeHass({
    devices: options.devices ?? devices(),
    language: options.language ?? "en",
    ...(options.callService ? { callService: options.callService } : {}),
  });
  const card = await mountCard(hass, { printer, ...config });
  return { card, hass };
}

const withX1c = async (overrides: Partial<PrinterSpec>, config: Record<string, unknown> = {}) => cardFor("x1c", config, { devices: x1c(overrides) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("a card without a printer to show", () => {
  it("draws nothing before it has its configuration and hass", async () => {
    const card = document.createElement("bambuddy-printer-card") as FakeCard;
    document.body.append(card);
    await card.updateComplete;
    expect(find(card, "ha-card")).toBeNull();
    card.setConfig({ type: "custom:bambuddy-printer-card" });
    await card.updateComplete;
    expect(find(card, "ha-card")).toBeNull();
  });

  it("asks for a printer, and explains a removed one or a device that is no printer", async () => {
    const hass = makeHass({ devices: [...x1c(), instanceDevice] });
    const messages: [Record<string, unknown>, string][] = [
      [{}, "Choose a printer in the card's settings."],
      [{ printer: "dev-gone" }, "This printer is no longer available. Choose another one in the card's settings."],
      [{ printer: "dev-x1c-ams-0" }, "This device is not a BamBuddy printer. Choose the printer itself, not an AMS unit."],
      [{ printer: "dev-instance" }, "This device is not a BamBuddy printer. Choose the printer itself, not an AMS unit."],
    ];
    for (const [config, message] of messages) {
      const card = await mountCard(hass, config);
      expect(cardText(card)).toBe(message);
    }
  });

  it("refuses an invalid option", () => {
    const card = document.createElement("bambuddy-printer-card") as FakeCard;
    expect(() => card.setConfig({ type: "custom:bambuddy-printer-card", camera: "never" })).toThrowError(/Invalid value for “camera”/);
  });
});

describe("the status view", () => {
  it("shows what an X1C prints, how far it is and when it ends", async () => {
    const { card } = await cardFor("x1c");
    expect(text(find(card, ".name"))).toBe("Workshop");
    expect(text(find(card, ".chip"))).toBe("Printing");
    expect(find(card, ".chip")?.classList.contains("tone-active")).toBe(true);
    expect(find(card, ".dot")?.classList.contains("on")).toBe(true);
    expect(find(card, ".dot")?.getAttribute("aria-label")).toBe("Online");
    expect(text(find(card, ".job-name"))).toBe("Benchy_0.2mm_PLA");
    expect(text(find(card, ".pct"))).toBe(`62${NBSP}%`);
    expect(find(card, ".stage")).toBeNull();
    expect(find(card, ".bar")?.getAttribute("aria-valuenow")).toBe("62");
    expect(find(card, ".bar span")?.getAttribute("style")).toContain("width: 62%");
    expect(findAll(card, ".meta span").map(text)).toEqual(["Layer 123 / 250", "1 h 23 min left", "Ends 14:35"]);
  });

  it("shows the temperatures with their targets and the fans", async () => {
    const { card } = await cardFor("x1c");
    expect(findAll(card, ".temp").map(text)).toEqual([
      `Nozzle 220${NBSP}°C Target 220${NBSP}°C`,
      `Bed 55${NBSP}°C Target 55${NBSP}°C`,
      `Chamber 38${NBSP}°C`,
    ]);
    expect(find(card, ".temps")?.classList.contains("n3")).toBe(true);
    // Short names that start like the entities' names; the entity's own
    // name (without the printer's) shows where there is room, and names it.
    expect(findAll(card, ".fan").map((fan) => `${text(fan.querySelector(".fan-label.short"))}: ${text(fan.querySelector(".fan-value"))}`)).toEqual([
      `Part cooling: 100${NBSP}%`,
      `Auxiliary: 40${NBSP}%`,
      `Chamber: 30${NBSP}%`,
      `Hotend: 100${NBSP}%`,
    ]);
    expect(findAll(card, ".fan .fan-label.full").map(text)).toEqual(["Part cooling fan", "Auxiliary fan", "Chamber fan", "Hotend fan"]);
    expect(findAll(card, ".fan").map((fan) => fan.getAttribute("aria-label"))).toEqual([
      `Part cooling fan: 100${NBSP}%`,
      `Auxiliary fan: 40${NBSP}%`,
      `Chamber fan: 30${NBSP}%`,
      `Hotend fan: 100${NBSP}%`,
    ]);
    expect(findAll(card, ".fan").map((fan) => fan.getAttribute("title"))).toEqual(["Part cooling fan", "Auxiliary fan", "Chamber fan", "Hotend fan"]);
    expect(findAll(card, ".fan.on")).toHaveLength(4);
  });

  it("names a fan by its entity: renamed by the user, or by the printer's own name", async () => {
    const { card, hass } = await cardFor("a1mini");
    // The device is "Desk A1 mini": the fan's friendly name starts with it.
    expect(text(find(card, ".fan .fan-label.full"))).toBe("Part cooling fan");
    await update(card, hass.withState("fan.a1_mini_part_cooling_fan", "off", { percentage: 0, friendly_name: "Blower" }));
    expect(text(find(card, ".fan .fan-label.full"))).toBe("Blower");
    await update(card, hass.withState("fan.a1_mini_part_cooling_fan", "off", { percentage: 0 }));
    expect(text(find(card, ".fan .fan-label.full"))).toBe("Part cooling fan");
    const { card: german } = await cardFor("a1mini", {}, { language: "de" });
    expect(findAll(german, ".fan .fan-label.short").map(text)).toEqual(["Bauteil", "Hotend"]);
    // The hotend fan's sensor has no friendly name here: the card's own.
    expect(findAll(german, ".fan .fan-label.full").map(text)).toEqual(["Part cooling fan", "Hotend-Lüfter"]);
  });

  it("names the left auxiliary fan side first in German, as the entity does", async () => {
    const { card, hass } = await cardFor("h2d", {}, { language: "de" });
    expect(findAll(card, ".fan .fan-label.short").map(text)).toContain("Linker Zusatz");
    await update(card, hass.withState("fan.h2d_left_auxiliary_fan", "off", { percentage: 0 }));
    expect(findAll(card, ".fan .fan-label.full").map(text)).toContain("Linker Zusatzlüfter");
  });

  it("shows the loaded filament: colour, material, the slot in use and the AMS humidity", async () => {
    const { card } = await cardFor("x1c");
    expect(findAll(card, ".ams-name").map(text)).toEqual(["AMS A", "Ext"]);
    expect(text(find(card, ".ams-hum"))).toBe(`21${NBSP}%`);
    expect(findAll(card, ".slot-type").map(text)).toEqual(["PLA", "PLA", "PLA", "–", "–"]);
    const swatches = findAll(card, ".ams-strip .swatch");
    expect(swatches.map((swatch) => swatch.getAttribute("style"))).toEqual([
      "--c: #F4EE2A; --fill: 80%",
      "--c: #1F79E5; --fill: 45%",
      "--c: #FFFFFF; --fill: 100%",
      "--c: var(--bb-muted); --fill: 100%",
      "--c: var(--bb-muted); --fill: 100%",
    ]);
    expect(swatches.map((swatch) => [...swatch.classList].filter((name) => name !== "swatch" && name !== "small"))).toEqual([
      ["outline", "partial"],
      ["active", "partial"],
      ["outline"],
      ["empty"],
      ["empty"],
    ]);
    expect(findAll(card, ".ams-slot").map((slot) => slot.getAttribute("title"))).toEqual([
      `PLA Basic · 80${NBSP}%`,
      `PLA Matte · 45${NBSP}%`,
      "PLA",
      "Not set",
      "Not set",
    ]);
    // A slot without a spool is empty.
    const { card: lite, hass } = await cardFor("a1mini");
    await update(lite, hass.withState("sensor.dev-a1mini_ams_0_slot_4", "empty", { slot: 4, empty: true, present: false, active: false }));
    expect(findAll(lite, ".ams-slot")[3]?.getAttribute("title")).toBe("Empty");
  });

  it("fills an external spool whose rest BamBuddy does not know", async () => {
    // BamBuddy reports 0 % for every external spool; the integration says unknown.
    const { card } = await cardFor("a1mini");
    const external = findAll(card, ".ams-strip .swatch").at(-1);
    expect(external?.getAttribute("style")).toBe("--c: #FF6A13; --fill: 100%");
    expect(external?.classList.contains("partial")).toBe(false);
    await showView(card, "Filament");
    const large = findAll(card, ".slot .swatch").at(-1);
    expect(large?.getAttribute("style")).toBe("--c: #FF6A13; --fill: 100%");
    expect(large?.classList.contains("partial")).toBe(false);
    expect(text(findAll(card, ".slot-main").at(-1))).toBe("TPU 95A HF");
  });

  it("keeps a spool's colour true and outlines every swatch", async () => {
    const css = (Array.isArray(cardStyles) ? cardStyles : [cardStyles]).map((sheet) => (sheet as { cssText: string }).cssText).join("");
    // The empty part is neutral, never a pale tint of the filament: a black
    // spool stays black, also at 5 % left.
    expect(css).not.toMatch(/color-mix\(in srgb, var\(--c\)/);
    // A thin outline over every swatch, stronger for very light and dark ones.
    expect(css).toMatch(/\.swatch::after\s*\{[^}]*box-shadow: inset 0 0 0 1px/);
    expect(css).toMatch(/\.swatch\.outline::after\s*\{/);
    const { card } = await cardFor("a1mini");
    const black = findAll(card, ".ams-strip .swatch")[0];
    expect(black?.getAttribute("style")).toBe("--c: #000000; --fill: 100%");
    expect(black?.classList.contains("outline")).toBe(true);
    expect(black?.classList.contains("partial")).toBe(false);
    expect(findAll(card, ".ams-strip .swatch")[1]?.classList.contains("partial")).toBe(true);
  });

  it("shows a slot it cannot read as unknown, not as empty", async () => {
    const { card, hass } = await cardFor("x1c");
    await update(card, hass.withState("sensor.dev-x1c_ams_0_slot_1", "unavailable", {}));
    expect(findAll(card, ".slot-type").map(text)).toEqual(["—", "PLA", "PLA", "–", "–"]);
    const unknown = findAll(card, ".ams-strip .swatch")[0];
    expect(unknown?.classList.contains("unknown")).toBe(true);
    expect(unknown?.classList.contains("empty")).toBe(false);
    expect(findAll(card, ".ams-slot")[0]?.getAttribute("title")).toBe("Unknown");
  });

  it("opens the filament view from the strip", async () => {
    const { card } = await cardFor("x1c");
    button(card, "Open the filament view").click();
    await card.updateComplete;
    expect(find(card, '[role=tab][aria-selected="true"]')?.textContent?.trim()).toBe("Filament");
  });

  it("offers pause, stop and the print speed while printing", async () => {
    const { card, hass } = await cardFor("x1c");
    expect(hasButton(card, "Resume print")).toBe(false);
    await press(card, "Pause print");
    expect(hass.calls.at(-1)).toMatchObject({ domain: "button", service: "press", data: { entity_id: "button.x1c_pause" } });
    expect(text(find(card, ".speed-label"))).toBe("Print speed");
    const speeds = findAll(card, ".speed [role=radio]");
    // Short names that fit a phone; the percentage below, the whole text as the name.
    expect(speeds.map((item) => text(item.querySelector(".opt")))).toEqual(["Silent", "Standard", "Sport", "Ludicrous"]);
    expect(speeds.map((item) => text(item.querySelector(".opt-sub")))).toEqual(["50 %", "100 %", "124 %", "166 %"]);
    expect(speeds.map((item) => item.getAttribute("aria-label"))).toEqual(["Silent (50 %)", "Standard (100 %)", "Sport (124 %)", "Ludicrous (166 %)"]);
    expect(speeds.map((item) => item.getAttribute("title"))).toEqual(["Silent (50 %)", "Standard (100 %)", "Sport (124 %)", "Ludicrous (166 %)"]);
    expect(speeds.map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "true", "false", "false"]);
    await press(card, "Sport (124 %)");
    expect(hass.calls.at(-1)).toMatchObject({ domain: "select", service: "select_option", data: { entity_id: "select.x1c_print_speed", option: "sport" } });
  });

  it("offers the speeds BamBuddy lists, or the four it knows", async () => {
    const { card, hass } = await cardFor("x1c");
    await update(card, hass.withState("select.x1c_print_speed", "standard", { options: ["standard", "turbo"] }));
    expect(findAll(card, ".speed [role=radio]").map(text)).toEqual(["Standard 100 %", "turbo"]);
    expect(findAll(card, ".speed .opt-sub")).toHaveLength(1);
    await update(card, hass.withState("select.x1c_print_speed", "standard", { options: [1, 2] }));
    expect(findAll(card, ".speed [role=radio]")).toHaveLength(4);
    await update(card, hass.withState("select.x1c_print_speed", "unavailable", {}));
    expect(findAll<HTMLButtonElement>(card, ".speed [role=radio]").every((item) => item.disabled)).toBe(true);
  });

  it("asks before it stops a print: keep printing is the safe choice and has the focus", async () => {
    const { card, hass } = await cardFor("x1c");
    await press(card, "Stop print");
    const dialog = find<HTMLDialogElement>(card, "dialog");
    expect(dialog?.open).toBe(true);
    expect(text(find(card, "dialog h2"))).toBe("Stop the print?");
    expect(text(find(card, "dialog p"))).toBe("The print cannot be resumed.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Keep printing", "Stop print"]);
    expect(find(card, "dialog .btn.danger")?.textContent?.trim()).toBe("Stop print");
    expect(root(card).activeElement).toBe(find(card, "dialog .btn.safe"));
    await press(card, "Keep printing");
    expect(find(card, "dialog")).toBeNull();
    expect(hass.calls).toEqual([]);
    await press(card, "Stop print");
    await confirmDialog(card);
    expect(hass.calls).toEqual([{ domain: "button", service: "press", data: { entity_id: "button.x1c_stop" }, notifyOnError: false }]);
    expect(find(card, "dialog")).toBeNull();
  });

  it("asks in German with words that cannot be mixed up", async () => {
    const { card } = await cardFor("x1c", {}, { language: "de" });
    await press(card, "Druck stoppen");
    expect(text(find(card, "dialog h2"))).toBe("Druck stoppen?");
    expect(text(find(card, "dialog p"))).toBe("Der Druck lässt sich danach nicht fortsetzen.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Weiterdrucken", "Druck stoppen"]);
  });

  it("closes a dialog on a tap beside it and on Escape", async () => {
    const { card, hass } = await cardFor("x1c");
    await press(card, "Stop print");
    find(card, "dialog .dlg-body")?.click();
    await card.updateComplete;
    expect(find(card, "dialog")).not.toBeNull();
    find(card, "dialog")?.click();
    await card.updateComplete;
    expect(find(card, "dialog")).toBeNull();
    await press(card, "Stop print");
    find<HTMLDialogElement>(card, "dialog")?.close();
    await card.updateComplete;
    expect(find(card, "dialog")).toBeNull();
    expect(hass.calls).toEqual([]);
  });

  it("opens a dialog where the browser has no modal dialogs", async () => {
    const original = HTMLDialogElement.prototype.showModal;
    // @ts-expect-error -- a browser without showModal
    delete HTMLDialogElement.prototype.showModal;
    try {
      const { card } = await cardFor("x1c");
      await press(card, "Stop print");
      expect(find(card, "dialog")?.hasAttribute("open")).toBe(true);
    } finally {
      HTMLDialogElement.prototype.showModal = original;
    }
  });

  it("offers resume for a paused print, with the stage", async () => {
    const { card, hass } = await cardFor("h2d");
    expect(text(find(card, ".chip"))).toBe("Paused");
    expect(find(card, ".chip")?.classList.contains("tone-paused")).toBe(true);
    expect(text(find(card, ".stage"))).toBe("Paused by the user");
    expect(hasButton(card, "Pause print")).toBe(false);
    await press(card, "Resume print");
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "button.h2d_resume" });
  });

  it("says before resuming that a single nozzle has no filament loaded", async () => {
    const NOTE = "No filament loaded. Load one in the Filament tab before resuming.";
    // The A1 mini paused, nothing in use: neither a slot nor its spool holder.
    const { card } = await cardFor("a1mini", {}, { devices: a1mini({ status: "paused" }) });
    const controls = find(card, ".controls") as HTMLElement;
    expect(text(controls.firstElementChild)).toBe(NOTE);
    expect(controls.firstElementChild?.classList.contains("warning")).toBe(true);
    // Something in use: no note; and not while printing.
    const { card: loaded } = await withX1c({ status: "paused" });
    expect(cardText(loaded)).not.toContain(NOTE);
    const { card: printing } = await cardFor("a1mini");
    expect(cardText(printing)).not.toContain(NOTE);
    // The integration names the loaded filament, though no slot says so.
    const { card: named, hass } = await cardFor("a1mini", {}, { devices: a1mini({ status: "paused" }) });
    await update(named, hass.withState("sensor.a1_mini_active_filament", "PLA Basic"));
    expect(cardText(named)).not.toContain(NOTE);
    // Two nozzles: what "nothing loaded" means there is not clear.
    const devices = h2d();
    for (const device of devices) for (const entity of device.entities) if (entity.attributes?.["active"] === true) entity.attributes["active"] = false;
    const { card: dual } = await cardFor("h2d", {}, { devices });
    expect(cardText(dual)).not.toContain(NOTE);
    const { card: german } = await cardFor("a1mini", {}, { language: "de", devices: a1mini({ status: "paused" }) });
    expect(cardText(german)).toContain("Kein Filament geladen. Lade eines im Tab „Filament“, bevor du fortsetzt.");
  });

  it("shows both nozzles of a dual-nozzle printer and its heated chamber", async () => {
    const { card } = await cardFor("h2d");
    expect(findAll(card, ".temp-head").map(text)).toEqual(["Left nozzle", "Right nozzle", "Bed", "Chamber"]);
    expect(findAll(card, ".temp-target").map(text)).toEqual([`Target 250${NBSP}°C`, "Off", `Target 90${NBSP}°C`, `Target 45${NBSP}°C`]);
    expect(find(card, ".temps")?.classList.contains("n4")).toBe(true);
    expect(findAll(card, ".fan").map((fan) => text(fan.querySelector(".fan-label.short")))).toEqual(["Part cooling", "Auxiliary", "Chamber", "Left auxiliary", "Hotend"]);
    expect(findAll(card, ".ams-name").map(text)).toEqual(["AMS A", "AMS HT A", "Ext"]);
    // The two external spools say their side; the temperatures sit two by two.
    expect(findAll(card, ".ams-strip .slot-side").map(text)).toEqual(["L", "R"]);
    expect(find(card, ".temps")?.classList.contains("dual")).toBe(true);
  });

  it("marks a heater that is still heating up", async () => {
    const { card } = await withX1c({ status: "preparing", stage: "heating_nozzle", progress: 0, layer: 0, nozzles: [[143, 220]] });
    expect(text(find(card, ".stage"))).toBe("Heating nozzle");
    expect(findAll(card, ".temp.heating").map((tile) => text(tile.querySelector(".temp-head")))).toEqual(["Nozzle"]);
    // No layer before the first one.
    expect(findAll(card, ".meta span").map(text)).toEqual(["1 h 23 min left", "Ends 14:35"]);
  });

  it("asks to clear the plate after a print, and says so", async () => {
    const { card, hass } = await withX1c({ status: "finished", stage: "idle", progress: 97, remaining: 0, plateClearNeeded: true });
    expect(text(find(card, ".callout"))).toContain("Clear the build plate, then confirm.");
    expect(text(find(card, ".pct"))).toBe(`100${NBSP}%`);
    expect(find(card, ".bar")?.classList.contains("tone-done")).toBe(true);
    expect(findAll(card, ".meta span").map(text)).toEqual(["Layer 123 / 250"]);
    expect(find(card, ".controls")).toBeNull();
    await press(card, "Plate cleared");
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "button.x1c_plate_cleared" });
  });

  it("shows an idle printer", async () => {
    const { card } = await cardFor("a1mini");
    expect(text(find(card, ".name"))).toBe("Desk");
    expect(text(find(card, ".chip"))).toBe("Idle");
    expect(text(find(card, ".job-name"))).toBe("No print running");
    expect(find(card, ".bar")).toBeNull();
    expect(find(card, ".meta")).toBeNull();
    expect(find(card, ".controls")).toBeNull();
    expect(find(card, ".picture .drawing")).not.toBeNull();
    expect(findAll(card, ".temp-target").map(text)).toEqual(["Off", "Off"]);
    expect(findAll(card, ".fan").map((fan) => text(fan.querySelector(".fan-value")))).toEqual(["Off", "Off"]);
  });

  it("says when the printer is offline, and shows nothing stale", async () => {
    const { card } = await cardFor("p1s");
    expect(text(find(card, ".chip"))).toBe("Offline");
    expect(find(card, ".chip")?.classList.contains("tone-off")).toBe(true);
    expect(find(card, ".dot")?.classList.contains("on")).toBe(false);
    expect(text(find(card, ".job-info"))).toBe("The printer is offline. Check that it is switched on and connected to BamBuddy.");
    expect(find(card, ".temps")).toBeNull();
    expect(find(card, ".fans")).toBeNull();
    expect(find(card, ".ams-strip")).toBeNull();
    expect(find(card, ".controls")).toBeNull();
    expect(find(card, "button.picture")).toBeNull();
    expect(find(card, ".picture.offline-pic")).not.toBeNull();
    expect(button(card, "Chamber light").disabled).toBe(true);
  });

  it("knows a printer is offline from its print status where it has no Online sensor", async () => {
    const [printer, ams] = offlineP1s() as [FakeDevice, FakeDevice];
    const devices = [{ ...printer, entities: printer.entities.filter((entity) => entity.key !== "online") }, ams];
    const { card } = await cardFor("p1s", {}, { devices });
    expect(text(find(card, ".chip"))).toBe("Offline");
    const online = x1c()[0] as FakeDevice;
    const { card: other } = await cardFor("x1c", {}, { devices: [{ ...online, entities: online.entities.filter((entity) => entity.key !== "online") }] });
    expect(text(find(other, ".chip"))).toBe("Printing");
  });

  it("shows the status itself where Home Assistant has no state for it", async () => {
    const hass = makeHass({ devices: x1c() });
    delete (hass.states as Record<string, unknown>)["sensor.x1c_print_status"];
    const card = await mountCard(hass, { printer: "dev-x1c" });
    expect(text(find(card, ".chip"))).toBe("unknown");
  });

  it("explains, while printing, that a key without Control Printer cannot control", async () => {
    const { card } = await cardFor("readOnly");
    expect(text(find(card, ".note"))).toBe("Controls need an API key with “Control Printer” in BamBuddy.");
    expect(hasButton(card, "Pause print")).toBe(false);
    expect(hasButton(card, "Chamber light")).toBe(false);
    expect(findAll(card, ".temp-target")).toHaveLength(0);
    expect(findAll(card, ".fan").map((fan) => text(fan.querySelector(".fan-label.short")))).toEqual(["Hotend"]);
    const { card: idle } = await cardFor("readOnly", {}, { devices: readOnlyX1c({ status: "idle", plateClearNeeded: true }) });
    expect(find(idle, ".controls")).toBeNull();
    expect(findAll(idle, ".note")).toHaveLength(0);
    expect(hasButton(idle, "Plate cleared")).toBe(false);
  });

  it("leaves out the parts the configuration turns off", async () => {
    const { card } = await cardFor("x1c", { show_temperatures: false, show_fans: false, show_ams: false, show_controls: false });
    expect(find(card, ".temps")).toBeNull();
    expect(find(card, ".fans")).toBeNull();
    expect(find(card, ".ams-strip")).toBeNull();
    expect(find(card, ".controls")).toBeNull();
    expect(find(card, ".tabs")).toBeNull();
    expect(hasButton(card, "Chamber light")).toBe(false);
    const { card: plate } = await withX1c({ status: "finished", plateClearNeeded: true }, { show_controls: false });
    expect(find(plate, ".callout")).not.toBeNull();
    expect(hasButton(plate, "Plate cleared")).toBe(false);
    // Offline the warning comes first, the plate after it.
    const { card: offline } = await withX1c({ online: false, plateClearNeeded: true });
    expect(find(offline, ".job")?.nextElementSibling?.classList.contains("callout")).toBe(true);
  });

  it("shows the parts it has no values for as such", async () => {
    const { card, hass } = await cardFor("x1c");
    let next = hass.withState("sensor.x1c_bed_temperature", "unavailable").withState("fan.x1c_auxiliary_fan", "unavailable");
    next = next.withState("fan.x1c_part_cooling_fan", "on", {}).withState("sensor.x1c_progress", "unknown").withState("sensor.x1c_end_time", "soon");
    await update(card, next);
    expect(findAll(card, ".temp-value").map(text)).toEqual([`220${NBSP}°C`, "—", `38${NBSP}°C`]);
    expect(findAll(card, ".fan").map((fan) => text(fan.querySelector(".fan-value")))).toEqual([`100${NBSP}%`, "—", `30${NBSP}%`, `100${NBSP}%`]);
    expect(find(card, ".bar")).toBeNull();
    expect(findAll(card, ".meta span").map(text)).toEqual(["Layer 123 / 250", "1 h 23 min left"]);
    await update(card, next.withState("sensor.x1c_current_print", "Plate_1.gcode.3mf").withState("sensor.x1c_print_stage", "unknown"));
    expect(text(find(card, ".job-name"))).toBe("Plate_1");
    expect(find(card, ".stage")).toBeNull();
  });

  it("leaves out the temperatures and fans a printer does not report", async () => {
    const [printer] = readOnlyX1c() as [FakeDevice];
    const bare = { ...printer, entities: printer.entities.filter((entity) => !/temperature|hotend_fan|external_spool/.test(entity.key)) };
    const { card } = await cardFor("readOnly", {}, { devices: [bare] });
    expect(find(card, ".temps")).toBeNull();
    expect(find(card, ".fans")).toBeNull();
    expect(find(card, ".ams-strip")).toBeNull();
    expect(find(card, ".tabs [role=tab]:nth-child(3)")).toBeNull();
  });

  it("opens the more-info dialog of a target, a sensor and a fan", async () => {
    const { card } = await cardFor("x1c");
    const opened: string[] = [];
    card.addEventListener("hass-more-info", (event) => opened.push((event as CustomEvent<{ entityId: string }>).detail.entityId));
    for (const tile of findAll(card, ".temp")) tile.click();
    findAll(card, ".fan")[0]?.click();
    expect(opened).toEqual(["number.x1c_nozzle_target_temperature", "number.x1c_bed_target_temperature", "sensor.x1c_chamber_temperature", "fan.x1c_part_cooling_fan"]);
  });

  it("switches the chamber light", async () => {
    const { card, hass } = await cardFor("x1c");
    expect(button(card, "Chamber light").getAttribute("aria-pressed")).toBe("true");
    await press(card, "Chamber light");
    expect(hass.calls.at(-1)).toMatchObject({ domain: "light", service: "toggle", data: { entity_id: "light.x1c_chamber_light" } });
    const { card: dark } = await cardFor("a1mini");
    expect(button(dark, "Chamber light").getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the cover of the job, and the drawing without one", async () => {
    const { card, hass } = await cardFor("x1c");
    const cover = find<HTMLImageElement>(card, "img.cover");
    expect(cover?.getAttribute("src")).toBe("/api/image_proxy/image.x1c_cover?token=cover-x1c");
    cover?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    expect(find(card, "img.cover")).toBeNull();
    expect(find(card, ".picture .drawing")).not.toBeNull();
    // A new cover arrives with a new address.
    await update(card, hass.withState("image.x1c_cover", "2026-10-16T09:00:00+00:00", { entity_picture: "/api/image_proxy/image.x1c_cover?token=new" }));
    expect(find(card, "img.cover")).not.toBeNull();
    await update(card, hass.withState("image.x1c_cover", "unknown"));
    expect(find(card, "img.cover")).toBeNull();
    const { card: idle } = await cardFor("a1mini");
    expect(find(idle, "img.cover")).toBeNull();
  });
});

describe("skipping objects", () => {
  const OBJECTS = [
    { id: 11, name: "Benchy", skipped: false },
    { id: 12, name: "Calibration cube", skipped: true },
    { id: 13, name: "", skipped: false },
    { id: 14, name: "Clip", skipped: false },
  ];
  const answering =
    (objects: unknown = OBJECTS): FakeHassOptions["callService"] =>
    async (call) =>
      call.service === "get_print_objects" ? { response: { objects } } : undefined;

  it("lists the objects, the skipped ones struck through, and skips the chosen ones after asking", async () => {
    const { card, hass } = await cardFor("x1c", {}, { callService: answering() });
    await press(card, "Skip objects");
    expect(hass.calls[0]).toEqual({ domain: "bambuddy", service: "get_print_objects", data: { device_id: "dev-x1c" }, notifyOnError: false, returnResponse: true });
    expect(text(find(card, "dialog h2"))).toBe("Skip objects");
    expect(findAll(card, "dialog .obj").map(text)).toEqual(["Benchy", "Calibration cube Skipped", "Object 13", "Clip"]);
    const boxes = findAll<HTMLInputElement>(card, "dialog .obj input");
    expect(boxes.map((box) => [box.checked, box.disabled])).toEqual([
      [false, false],
      [false, true],
      [false, false],
      [false, false],
    ]);
    expect(findAll(card, "dialog .obj.skipped").map((item) => text(item.querySelector(".obj-name")))).toEqual(["Calibration cube"]);
    expect(text(find(card, "dialog .dlg-warn"))).toBe("Skipped objects cannot be printed again in this job.");
    const actions = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, "dialog .dlg-actions .btn");
    expect(actions().map(text)).toEqual(["Skip none", "Skip objects"]);
    expect(actions()[1]?.disabled).toBe(true);
    expect(actions()[1]?.classList.contains("danger")).toBe(true);
    expect(root(card).activeElement).toBe(actions()[0]);
    boxes[0]?.click();
    await card.updateComplete;
    expect(text(actions()[1])).toBe("Skip 1 object");
    boxes[3]?.click();
    await card.updateComplete;
    expect(text(actions()[1])).toBe("Skip 2 objects");
    boxes[0]?.click();
    await card.updateComplete;
    expect(text(actions()[1])).toBe("Skip 1 object");
    boxes[0]?.click();
    await card.updateComplete;
    expect(text(actions()[1])).toBe("Skip 2 objects");
    await confirmDialog(card);
    // In the order of the list, not of the taps.
    expect(hass.calls.at(-1)).toEqual({ domain: "bambuddy", service: "skip_objects", data: { device_id: "dev-x1c", objects: [11, 14] }, notifyOnError: false });
    expect(find(card, "dialog")).toBeNull();
  });

  it("closes when the card is set to another printer: the list was the old one's", async () => {
    const { card } = await cardFor("x1c", {}, { callService: answering(), devices: [...x1c(), ...h2d()] });
    await press(card, "Skip objects");
    expect(find(card, "dialog")).not.toBeNull();
    card.setConfig({ type: "custom:bambuddy-printer-card", printer: "dev-h2d" });
    await card.updateComplete;
    expect(find(card, "dialog")).toBeNull();
  });

  it("never skips every object: stopping the print does that", async () => {
    const { card } = await cardFor("x1c", {}, { callService: answering() });
    await press(card, "Skip objects");
    const boxes = findAll<HTMLInputElement>(card, "dialog .obj input");
    const confirm = (): HTMLButtonElement => findAll<HTMLButtonElement>(card, "dialog .dlg-actions .btn")[1] as HTMLButtonElement;
    const tick = async (index: number): Promise<void> => {
      boxes[index]?.click();
      await card.updateComplete;
    };
    await tick(0);
    await tick(2);
    expect(confirm().disabled).toBe(false);
    // With the one already skipped, these are all four.
    await tick(3);
    expect(text(confirm())).toBe("Skip 3 objects");
    expect(confirm().disabled).toBe(true);
    expect(text(find(card, "dialog .dlg-warn"))).toBe("To skip every object, stop the print instead.");
    await tick(2);
    expect(confirm().disabled).toBe(false);
    expect(text(find(card, "dialog .dlg-warn"))).toBe("Skipped objects cannot be printed again in this job.");
    const { card: german } = await cardFor("x1c", {}, { language: "de", callService: answering([{ id: 1, name: "Benchy", skipped: false }]) });
    await press(german, "Objekte überspringen");
    findAll<HTMLInputElement>(german, "dialog .obj input")[0]?.click();
    await german.updateComplete;
    expect(text(find(german, "dialog .dlg-warn"))).toBe("Um alle Objekte zu überspringen, stoppe stattdessen den Druck.");
    expect(findAll<HTMLButtonElement>(german, "dialog .dlg-actions .btn")[1]?.disabled).toBe(true);
  });

  it("skips nothing with the safe choice", async () => {
    const { card, hass } = await cardFor("h2d", {}, { callService: answering() });
    await press(card, "Skip objects");
    findAll<HTMLInputElement>(card, "dialog .obj input")[0]?.click();
    await press(card, "Skip none");
    expect(find(card, "dialog")).toBeNull();
    expect(hass.calls.map((call) => call.service)).toEqual(["get_print_objects"]);
  });

  it("shows that it is loading, and why it cannot list them", async () => {
    let answer: (value: unknown) => void = () => undefined;
    let fail: (reason: unknown) => void = () => undefined;
    const { card } = await cardFor("x1c", {}, {
      callService: () =>
        new Promise((resolve, reject) => {
          answer = resolve;
          fail = reject;
        }),
    });
    await press(card, "Skip objects");
    expect(text(find(card, "dialog [role=status]"))).toBe("Loading the objects …");
    expect(findAll<HTMLButtonElement>(card, "dialog .dlg-actions .btn")[1]?.disabled).toBe(true);
    fail({ message: "BamBuddy cannot read the print job." });
    await settle(card);
    expect(text(find(card, "dialog .dlg-error"))).toBe("BamBuddy cannot read the print job.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);
    await press(card, "Close");
    expect(find(card, "dialog")).toBeNull();
    // An answer for a dialog closed meanwhile opens nothing.
    await press(card, "Skip objects");
    await press(card, "Skip none");
    answer({ response: { objects: OBJECTS } });
    await settle(card);
    expect(find(card, "dialog")).toBeNull();
  });

  it("forgets a failure that comes after the dialog was closed", async () => {
    let fail: (reason: unknown) => void = () => undefined;
    const { card } = await cardFor("x1c", {}, {
      callService: () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    });
    await press(card, "Skip objects");
    await press(card, "Skip none");
    fail({ message: "Too late." });
    await settle(card);
    expect(find(card, "dialog")).toBeNull();
    expect(find(card, ".toast")).toBeNull();
  });

  it("says when BamBuddy lists no objects", async () => {
    const { card } = await cardFor("x1c", {}, { callService: answering([]) });
    await press(card, "Skip objects");
    expect(text(find(card, "dialog .dlg-body p"))).toBe("BamBuddy lists no objects for this print.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);
  });

  it("is offered only while a print runs or is paused, with Control Printer", async () => {
    for (const status of ["idle", "preparing", "finished"]) {
      const { card } = await withX1c({ status });
      expect(hasButton(card, "Skip objects"), status).toBe(false);
    }
    const { card: paused } = await cardFor("h2d");
    expect(hasButton(paused, "Skip objects")).toBe(true);
    const { card: readOnly } = await cardFor("readOnly");
    expect(hasButton(readOnly, "Skip objects")).toBe(false);
  });

  it("says it in German", async () => {
    const { card } = await cardFor("x1c", {}, { language: "de", callService: answering() });
    await press(card, "Objekte überspringen");
    expect(text(find(card, "dialog h2"))).toBe("Objekte überspringen");
    expect(text(find(card, "dialog .dlg-warn"))).toBe("Übersprungene Objekte werden in diesem Druck nicht mehr gedruckt.");
    expect(findAll(card, "dialog .obj").map(text)).toEqual(["Benchy", "Calibration cube Übersprungen", "Objekt 13", "Clip"]);
    const boxes = findAll<HTMLInputElement>(card, "dialog .obj input");
    boxes[0]?.click();
    await card.updateComplete;
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Nichts überspringen", "1 Objekt überspringen"]);
    boxes[2]?.click();
    await card.updateComplete;
    expect(text(findAll(card, "dialog .dlg-actions .btn")[1])).toBe("2 Objekte überspringen");
  });
});

describe("a printer whose developer mode is off", () => {
  const HINT = "Developer LAN mode is off: the printer ignores commands.";

  it("says so beside the controls of every view", async () => {
    const { card } = await withX1c({ developerMode: "off", status: "idle" });
    expect(findAll(card, ".note.warning").map(text)).toEqual([HINT]);
    await showView(card, "Control");
    expect(text(find(card, ".note.warning"))).toBe(HINT);
    await showView(card, "Filament");
    expect(findAll(card, ".note.warning").map(text)).toEqual([HINT]);
    const { card: printing } = await withX1c({ developerMode: "off" });
    const notes = findAll(printing, ".note.warning");
    expect(notes.map(text)).toEqual([HINT]);
    // Right before the pause and stop buttons.
    expect(notes[0]?.nextElementSibling?.classList.contains("controls")).toBe(true);
  });

  it("says it in German", async () => {
    const { card } = await cardFor("x1c", {}, { language: "de", devices: x1c({ developerMode: "off" }) });
    expect(text(find(card, ".note.warning"))).toBe("Der Entwicklermodus (LAN) ist aus: Der Drucker ignoriert Befehle.");
  });

  it("says nothing while it is on or unknown, offline, without the sensor or without controls", async () => {
    for (const developerMode of ["on", "unknown", "none"] as const) {
      const { card } = await withX1c({ developerMode });
      expect(cardText(card), developerMode).not.toContain(HINT);
    }
    const { card: offline } = await cardFor("p1s", {}, { devices: offlineP1s() });
    expect(cardText(offline)).not.toContain(HINT);
    const { card: readOnly } = await cardFor("readOnly", {}, { devices: readOnlyX1c({ developerMode: "off" }) });
    expect(cardText(readOnly)).not.toContain(HINT);
    const { card: plain } = await withX1c({ developerMode: "off" }, { show_controls: false });
    expect(cardText(plain)).not.toContain(HINT);
  });
});

describe("the live view", () => {
  const visibility = (state: "visible" | "hidden"): void => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  afterEach(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("starts on a tap on the picture and stops when closed", async () => {
    const { card, hass } = await cardFor("x1c");
    expect(find(card, "img.stream")).toBeNull();
    button(card, "Live view").click();
    await card.updateComplete;
    const stream = find<HTMLImageElement>(card, "img.stream");
    expect(stream?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c");
    expect(hasButton(card, "Live view")).toBe(false);
    // The running stream keeps its address when the token rotates.
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "rotated" }));
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c");
    button(card, "Close the live view").click();
    expect(stream?.hasAttribute("src")).toBe(false);
    await card.updateComplete;
    expect(find(card, "img.stream")).toBeNull();
    expect(hasButton(card, "Live view")).toBe(true);
  });

  it("offers to try again when the stream breaks", async () => {
    const { card } = await cardFor("x1c");
    button(card, "Live view").click();
    await card.updateComplete;
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    expect(text(find(card, ".live.failed"))).toContain("The camera is not available.");
    await press(card, "Try again");
    expect(find(card, "img.stream")).not.toBeNull();
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    await press(card, "Close the live view");
    expect(find(card, ".live")).toBeNull();
  });

  it("runs all the time with camera: always, and stops while the page is hidden", async () => {
    const { card } = await cardFor("x1c", { camera: "always" });
    expect(find(card, "img.stream")).not.toBeNull();
    expect(hasButton(card, "Close the live view")).toBe(false);
    expect(find(card, "button.picture")).toBeNull();
    visibility("hidden");
    await card.updateComplete;
    expect(find(card, "img.stream")).toBeNull();
    visibility("visible");
    await card.updateComplete;
    expect(find(card, "img.stream")).not.toBeNull();
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    expect(find(card, ".live.failed")).not.toBeNull();
    expect(hasButton(card, "Close the live view")).toBe(false);
  });

  it("stops when the card leaves the page, and starts again with camera: always", async () => {
    const { card } = await cardFor("x1c", { camera: "always" });
    const stream = find<HTMLImageElement>(card, "img.stream");
    card.remove();
    expect(stream?.hasAttribute("src")).toBe(false);
    document.body.append(card);
    await card.updateComplete;
    expect(find(card, "img.stream")).not.toBeNull();
    const { card: tapped } = await cardFor("x1c");
    button(tapped, "Live view").click();
    await tapped.updateComplete;
    tapped.remove();
    document.body.append(tapped);
    await tapped.updateComplete;
    expect(find(tapped, "img.stream")).toBeNull();
  });

  it("never runs with camera: off, in a preview, or without a camera that can stream", async () => {
    const { card } = await cardFor("x1c", { camera: "off" });
    expect(find(card, "button.picture")).toBeNull();
    expect(find(card, "img.stream")).toBeNull();
    const hass = makeHass({ devices: x1c() });
    const preview = document.createElement("bambuddy-printer-card") as FakeCard;
    preview.preview = true;
    preview.setConfig({ type: "custom:bambuddy-printer-card", printer: "dev-x1c", camera: "always" });
    preview.hass = hass;
    document.body.append(preview);
    await preview.updateComplete;
    expect(find(preview, "img.stream")).toBeNull();
    expect(find(preview, "button.picture")).toBeNull();
    const { card: noToken, hass: plain } = await cardFor("x1c", { camera: "always" });
    await update(noToken, plain.withState("camera.x1c_camera", "idle", { access_token: "" }));
    expect(find(noToken, "img.stream")).toBeNull();
    const { card: noCamera } = await cardFor("x1c", { camera: "always" }, { devices: x1c({ camera: false }) });
    expect(find(noCamera, "img.stream")).toBeNull();
    const { card: unavailable, hass: other } = await cardFor("x1c");
    await update(unavailable, other.withState("camera.x1c_camera", "unavailable"));
    expect(find(unavailable, "button.picture")).toBeNull();
  });

  it("can be started from the control view too", async () => {
    const { card } = await cardFor("a1mini");
    await showView(card, "Control");
    button(card, "Live view").click();
    await card.updateComplete;
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.a1_mini_camera?token=token-a1_mini");
    expect(hasButton(card, "Live view")).toBe(false);
  });
});

describe("the views", () => {
  it("switch with the tabs, also by the arrow keys", async () => {
    const { card } = await cardFor("x1c");
    const tabs = (): HTMLElement[] => findAll(card, "[role=tab]");
    expect(tabs().map(text)).toEqual(["Status", "Control", "Filament"]);
    expect(tabs().map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    find(card, ".tabs")?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await card.updateComplete;
    await card.updateComplete;
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Filament");
    expect(root(card).activeElement?.textContent?.trim()).toBe("Filament");
    find(card, ".tabs")?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await card.updateComplete;
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Status");
    find(card, ".tabs")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await card.updateComplete;
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Status");
    await showView(card, "Control");
    expect(find(card, ".pad")).not.toBeNull();
  });

  it("go back to the status view with a new configuration or a view that went away", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Filament");
    card.setConfig({ type: "custom:bambuddy-printer-card", printer: "dev-x1c" });
    await card.updateComplete;
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Status");
    await showView(card, "Filament");
    // The AMS unit and the external spool are gone.
    const [printer] = x1c() as [FakeDevice];
    await update(card, hass.withDevices([{ ...printer, entities: printer.entities.filter((entity) => entity.key !== "external_spool") }]));
    expect(find(card, ".job")).not.toBeNull();
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Control"]);
  });
});

describe("the control view", () => {
  it("moves the axes by 1 mm unless 10 mm is chosen", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    expect(findAll(card, ".step-row [role=radio]").map((item) => `${text(item)}: ${item.getAttribute("aria-checked")}`)).toEqual(["1 mm: true", "10 mm: false"]);
    const moves: [string, Record<string, unknown>][] = [
      ["Move Y by +1 mm", { axis: "y", distance: 1 }],
      ["Move X by −1 mm", { axis: "x", distance: -1 }],
      ["Move X by +1 mm", { axis: "x", distance: 1 }],
      ["Move Y by −1 mm", { axis: "y", distance: -1 }],
      ["Move the bed 1 mm closer to the nozzle", { axis: "z", distance: -1 }],
      ["Move the bed 1 mm away from the nozzle", { axis: "z", distance: 1 }],
    ];
    for (const [name, data] of moves) {
      await press(card, name);
      expect(hass.calls.at(-1), name).toEqual({ domain: "bambuddy", service: "move_axis", data: { device_id: "dev-a1mini", ...data }, notifyOnError: false });
    }
    await press(card, "10 mm");
    expect(findAll(card, ".step-row [role=radio]").map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    await press(card, "Move X by +10 mm");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", axis: "x", distance: 10 });
    await press(card, "Move the bed 10 mm closer to the nozzle");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", axis: "z", distance: -10 });
  });

  it("asks before it homes the axes", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    expect(button(card, "Home").classList.contains("primary")).toBe(true);
    await press(card, "Home");
    expect(text(find(card, "dialog h2"))).toBe("Home all axes?");
    expect(text(find(card, "dialog p"))).toBe("The toolhead moves to its home position; remove anything from the plate first.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Back", "Home"]);
    expect(find(card, "dialog .btn.danger")).toBeNull();
    await confirmDialog(card);
    expect(hass.calls).toEqual([{ domain: "bambuddy", service: "home_axes", data: { device_id: "dev-a1mini" }, notifyOnError: false }]);
  });

  it("extrudes and retracts 10 mm only with a hot nozzle", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    expect(button(card, "Extrude 10 mm of filament").disabled).toBe(true);
    expect(text(find(card, ".note"))).toBe(`To extrude, heat the nozzle to at least 170${NBSP}°C under Heating.`);
    await update(card, hass.withState("sensor.a1_mini_nozzle_temperature", "215"));
    expect(find(card, ".note")).toBeNull();
    await press(card, "Extrude 10 mm of filament");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", distance: 10 });
    await press(card, "Retract 10 mm of filament");
    expect(hass.calls.at(-1)).toMatchObject({ service: "extrude", data: { device_id: "dev-a1mini", distance: -10 } });
    // Without a temperature the integration decides.
    await update(card, hass.withState("sensor.a1_mini_nozzle_temperature", "unknown"));
    expect(button(card, "Extrude 10 mm of filament").disabled).toBe(false);
  });

  it("waits while a print is on the printer", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Control");
    expect(text(find(card, ".note.warning"))).toBe("Moving and extruding are possible once the print is done.");
    // Below the heaters and the detections, which stay: the note is about what moves.
    expect(find(card, ".heating")?.nextElementSibling?.classList.contains("detection")).toBe(true);
    expect(find(card, ".detection")?.nextElementSibling?.classList.contains("note")).toBe(true);
    const moving = findAll<HTMLButtonElement>(card, ".pad button, .axis-col button");
    expect(moving.length).toBe(9);
    expect(moving.every((item) => item.disabled)).toBe(true);
    // Home looks as disabled as the arrows: no filled, primary look.
    expect(button(card, "Home").classList.contains("primary")).toBe(false);
    // A hot nozzle changes nothing: the reason stays the print.
    expect(findAll(card, ".note")).toHaveLength(1);
    expect(hass.calls).toEqual([]);
  });

  it("waits while the printer is offline", async () => {
    const { card } = await cardFor("p1s");
    await showView(card, "Control");
    expect(text(find(card, ".note.warning"))).toBe("The printer is offline.");
    expect(findAll<HTMLButtonElement>(card, ".pad button").every((item) => item.disabled)).toBe(true);
  });

  it("explains that a key without Control Printer cannot control", async () => {
    const { card } = await cardFor("readOnly");
    await showView(card, "Control");
    expect(cardText(card)).toContain("Controls need an API key with “Control Printer” in BamBuddy.");
    expect(find(card, ".pad")).toBeNull();
  });
});

describe("the heating section", () => {
  /** A tap while every timer is fake: the card's own updates still run. */
  async function tap(card: FakeCard, name: string): Promise<void> {
    button(card, name).click();
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  }
  const targets = (card: FakeCard): string[] => findAll(card, ".heat-target").map(text);
  const setValue = (entityId: string, value: number) => ({ domain: "number", service: "set_value", data: { entity_id: entityId, value }, notifyOnError: false });
  const NOZZLE = "number.a1_mini_nozzle_target_temperature";

  it("preheats with one tap and sends a few taps as one target", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    expect(findAll(card, ".heat-row").map((row) => text(row.querySelector(".heat-label")))).toEqual(["Nozzle", "Bed"]);
    expect(targets(card)).toEqual(["Off", "Off"]);
    expect(findAll(card, ".heat-now").map(text)).toEqual([`Now 27${NBSP}°C`, `Now 25${NBSP}°C`]);
    expect(button(card, "Cool down").disabled).toBe(true);
    expect(findAll<HTMLButtonElement>(card, ".heat-off").every((item) => item.disabled)).toBe(true);
    expect(button(card, `Nozzle 5${NBSP}°C cooler`).disabled).toBe(true);
    await tap(card, `Heat Nozzle to 220${NBSP}°C`);
    expect(targets(card)).toEqual([`220${NBSP}°C`, "Off"]);
    expect(hass.calls).toEqual([]);
    await tap(card, `Nozzle 5${NBSP}°C hotter`);
    await tap(card, `Nozzle 5${NBSP}°C hotter`);
    expect(targets(card)[0]).toBe(`230${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(799);
    expect(hass.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(hass.calls).toEqual([setValue(NOZZLE, 230)]);
    // Shown until the entity reports a new target.
    await update(card, hass.withState("sensor.a1_mini_nozzle_temperature", "40"));
    expect(targets(card)[0]).toBe(`230${NBSP}°C`);
    const reported = hass.withState(NOZZLE, "230");
    await update(card, reported);
    expect(targets(card)[0]).toBe(`230${NBSP}°C`);
    await update(card, reported.withState(NOZZLE, "200"));
    expect(targets(card)[0]).toBe(`200${NBSP}°C`);
  });

  it("starts the nozzle in the middle of the active filament's range", async () => {
    const { card, hass } = await cardFor("a1mini");
    await update(card, hass.withState("sensor.a1_mini_active_filament", "PLA Basic", { nozzle_temp_min: 190, nozzle_temp_max: 230 }));
    await showView(card, "Control");
    expect(hasButton(card, `Heat Nozzle to 210${NBSP}°C`)).toBe(true);
    await update(card, hass.withState("sensor.a1_mini_active_filament", "PLA Basic", { nozzle_temp_min: 230, nozzle_temp_max: 190 }));
    expect(hasButton(card, `Heat Nozzle to 220${NBSP}°C`)).toBe(true);
    // Never above what the number allows.
    await update(card, hass.withState(NOZZLE, "0", { max: 200 }));
    expect(hasButton(card, `Heat Nozzle to 200${NBSP}°C`)).toBe(true);
  });

  it("stops at the number's highest target and turns a heater off below 5 °C", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [] }) });
    await showView(card, "Control");
    expect(findAll(card, ".heat-row").map((row) => text(row.querySelector(".heat-label .heat-text")))).toEqual(["Left nozzle", "Right nozzle", "Bed", "Chamber"]);
    expect(targets(card)).toEqual([`250${NBSP}°C`, "Off", `90${NBSP}°C`, `45${NBSP}°C`]);
    await update(card, hass.withState("number.h2d_left_nozzle_target_temperature", "255", { max: 255 }).withState("number.h2d_bed_target_temperature", "5"));
    expect(button(card, `Left nozzle 5${NBSP}°C hotter`).disabled).toBe(true);
    await tap(card, `Bed 5${NBSP}°C cooler`);
    expect(targets(card)[2]).toBe("Off");
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls.at(-1)).toEqual(setValue("number.h2d_bed_target_temperature", 0));
  });

  it("turns one heater off, or all at once, only without a print", async () => {
    const { card, hass } = await withX1c({ status: "idle", nozzles: [[200, 220]], bed: [50, 55] });
    await showView(card, "Control");
    await press(card, "Turn Nozzle off");
    expect(hass.calls).toEqual([setValue("number.x1c_nozzle_target_temperature", 0)]);
    expect(targets(card)).toEqual(["Off", `55${NBSP}°C`]);
    const { card: other, hass: otherHass } = await withX1c({ status: "idle", nozzles: [[200, 220]], bed: [50, 55] });
    await showView(other, "Control");
    await press(other, "Cool down");
    expect(otherHass.calls).toEqual([setValue("number.x1c_nozzle_target_temperature", 0), setValue("number.x1c_bed_target_temperature", 0)]);
    expect(targets(other)).toEqual(["Off", "Off"]);
    expect(button(other, "Cool down").disabled).toBe(true);
    // While printing: the steppers stay, Off and Cool down would end the print.
    const { card: printing } = await cardFor("x1c");
    await showView(printing, "Control");
    expect(hasButton(printing, "Cool down")).toBe(false);
    expect(findAll(printing, ".heat-off")).toHaveLength(0);
    expect(button(printing, `Nozzle 5${NBSP}°C hotter`).disabled).toBe(false);
  });

  it("waits while the printer is offline, and is left out without targets", async () => {
    const { card } = await cardFor("p1s");
    await showView(card, "Control");
    expect(findAll<HTMLButtonElement>(card, ".heating button").every((item) => item.disabled)).toBe(true);
    expect(findAll(card, ".heat-now").map(text)).toEqual(["—", "—"]);
    expect(targets(card)).toEqual(["—", "—"]);
    const [printer] = a1mini() as [FakeDevice];
    const bare = { ...printer, entities: printer.entities.filter((entity) => !entity.entityId.startsWith("number.")) };
    const { card: noTargets } = await cardFor("a1mini", {}, { devices: [bare] });
    await showView(noTargets, "Control");
    expect(find(noTargets, ".heating")).toBeNull();
  });

  it("forgets a target that fails, and says why", async () => {
    vi.useFakeTimers();
    const { card } = await cardFor("a1mini", {}, { callService: async () => Promise.reject({ message: "Printer offline" }) });
    await showView(card, "Control");
    await tap(card, `Heat Nozzle to 220${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(800);
    await card.updateComplete;
    expect(text(find(card, ".toast"))).toBe("Printer offline");
    expect(targets(card)[0]).toBe("Off");
  });

  it("keeps the taps made while a target that fails was on its way", async () => {
    vi.useFakeTimers();
    let fail: (reason: unknown) => void = () => undefined;
    let first = true;
    const { card, hass } = await cardFor("a1mini", {}, {
      callService: () => {
        if (!first) return Promise.resolve();
        first = false;
        return new Promise<void>((_resolve, reject) => (fail = reject));
      },
    });
    await showView(card, "Control");
    await tap(card, `Heat Nozzle to 220${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(800);
    await tap(card, `Nozzle 5${NBSP}°C hotter`);
    fail({ message: "Printer offline" });
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
    expect(targets(card)[0]).toBe(`225${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls.map((call) => call.data?.["value"])).toEqual([220, 225]);
  });

  it("shows a sent target at most 10 s while the entity keeps the old one", async () => {
    vi.useFakeTimers();
    const { card } = await cardFor("a1mini");
    await showView(card, "Control");
    await tap(card, `Heat Nozzle to 220${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(800 + 9_999);
    await card.updateComplete;
    expect(targets(card)[0]).toBe(`220${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(1);
    await card.updateComplete;
    expect(targets(card)[0]).toBe("Off");
  });

  it("sends a target still being tapped when the card goes", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await tap(card, `Heat Nozzle to 220${NBSP}°C`);
    card.remove();
    await vi.advanceTimersByTimeAsync(0);
    expect(hass.calls).toEqual([setValue(NOZZLE, 220)]);
  });

  it("sends a heater's next target after its previous one went through", async () => {
    vi.useFakeTimers();
    let finish: () => void = () => undefined;
    const { card, hass } = await cardFor("a1mini", {}, { callService: () => new Promise<void>((resolve) => (finish = resolve)) });
    await showView(card, "Control");
    await tap(card, `Heat Nozzle to 220${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(800);
    await tap(card, `Nozzle 5${NBSP}°C hotter`);
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls.map((call) => call.data?.["value"])).toEqual([220]);
    finish();
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls.map((call) => call.data?.["value"])).toEqual([220, 225]);
  });

  it("says it in German", async () => {
    const { card } = await cardFor("a1mini", {}, { language: "de" });
    await showView(card, "Steuerung");
    expect(text(find(card, ".section-label"))).toBe("Heizen");
    expect(hasButton(card, "Abkühlen")).toBe(true);
    expect(hasButton(card, `Düse auf 220${NBSP}°C heizen`)).toBe(true);
    expect(hasButton(card, "Bett ausschalten")).toBe(true);
    expect(findAll(card, ".heat-now").map(text)).toEqual([`Jetzt 27${NBSP}°C`, `Jetzt 25${NBSP}°C`]);
  });
});

describe("the print options", () => {
  const toggles = (card: FakeCard): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".detection [role=switch]");
  /** A switch's name: its label, the row's text beside it. */
  const name = (item: HTMLElement): string => item.getAttribute("aria-label") ?? "";
  const states = (card: FakeCard): string[] => toggles(card).map((item) => `${name(item)}: ${item.getAttribute("aria-checked")}`);
  const toggle = (card: FakeCard, label: string): HTMLButtonElement => toggles(card).find((item) => name(item) === label) as HTMLButtonElement;
  const PLATE = "switch.x1c_build_plate_position_detection";
  /** Folded at first: the head opens them. */
  const head = (card: FakeCard): HTMLButtonElement => find<HTMLButtonElement>(card, ".det-head") as HTMLButtonElement;
  const unfold = async (card: FakeCard): Promise<void> => {
    if (head(card)?.getAttribute("aria-expanded") !== "true") head(card)?.click();
    await card.updateComplete;
  };

  it("lists the printer's detections and switches them during a print", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Control");
    await unfold(card);
    expect(text(find(card, ".detection .section-label"))).toBe("Print options");
    // Right after the heaters.
    expect(find(card, ".heating")?.nextElementSibling?.classList.contains("detection")).toBe(true);
    expect(states(card)).toEqual(["AI print monitoring: true", "First layer inspection: true", "Build plate position detection: false"]);
    expect(toggles(card).every((item) => !item.disabled)).toBe(true);
    expect(text(find(card, ".detection .hint"))).toBe(
      "On: the printer pauses the print when it sees the problem. Sensitivity as set on the printer. A detection switched off stays off for later prints too.",
    );
    // Only the switch taps: the row is a line to read with its name beside it.
    const row = toggle(card, "Build plate position detection").closest(".det-row") as HTMLElement;
    expect(row.tagName).toBe("DIV");
    expect(text(row.querySelector(".det-name"))).toBe("Build plate position detection");
    row.click();
    (row.querySelector(".det-name") as HTMLElement).click();
    await settle(card);
    expect(hass.calls).toHaveLength(0);
    // The X1's monitoring says what it watches for.
    const monitoring = toggle(card, "AI print monitoring");
    const sub = monitoring.closest(".det-row")?.querySelector(".det-sub");
    expect(text(sub)).toBe("Spaghetti and purge chute pile-ups");
    expect(monitoring.getAttribute("aria-describedby")).toBe(sub?.id);
    expect(findAll(card, ".detection .det-sub")).toHaveLength(1);
    await press(card, "Build plate position detection");
    expect(hass.calls.at(-1)).toEqual({ domain: "switch", service: "turn_on", data: { entity_id: PLATE }, notifyOnError: false });
    expect(toggle(card, "Build plate position detection").getAttribute("aria-checked")).toBe("true");
    expect(text(find(card, ".sent"))).toBe("Sent");
    await press(card, "AI print monitoring");
    expect(hass.calls.at(-1)).toEqual({ domain: "switch", service: "turn_off", data: { entity_id: "switch.x1c_ai_monitoring" }, notifyOnError: false });
    expect(toggle(card, "AI print monitoring").getAttribute("aria-checked")).toBe("false");
  });


  it("is folded at first and says how many are on", async () => {
    const { card } = await cardFor("x1c");
    await showView(card, "Control");
    expect(head(card).getAttribute("aria-expanded")).toBe("false");
    // Folded, nothing to point at.
    expect(head(card).hasAttribute("aria-controls")).toBe(false);
    // Said by the exception: what is off.
    expect(text(head(card))).toBe("Print options 1 off");
    // One is off: the count warns.
    expect(find(card, ".det-summary")?.classList.contains("warn")).toBe(true);
    expect(toggles(card)).toHaveLength(0);
    expect(find(card, ".detection .hint")).toBeNull();
    head(card).click();
    await card.updateComplete;
    expect(head(card).getAttribute("aria-expanded")).toBe("true");
    expect(head(card).getAttribute("aria-controls")).toBe(find(card, ".det-body")?.id);
    expect(toggles(card)).toHaveLength(3);
    // Open while the card lives, also in another view and back.
    await showView(card, "Status");
    await showView(card, "Control");
    expect(toggles(card)).toHaveLength(3);
    head(card).click();
    await card.updateComplete;
    expect(toggles(card)).toHaveLength(0);
    // All on: a plain count.
    const { card: all } = await withX1c({ detectors: [{ key: "ai_monitoring", on: true }, { key: "first_layer_inspection", on: true }] });
    await showView(all, "Control");
    expect(text(find(all, ".det-summary"))).toBe("All on");
    expect(find(all, ".det-summary")?.classList.contains("warn")).toBe(false);
    const { card: none } = await withX1c({ detectors: [{ key: "ai_monitoring", on: false }, { key: "first_layer_inspection", on: false }] });
    await showView(none, "Control");
    expect(text(find(none, ".det-summary"))).toBe("All off");
    expect(find(none, ".det-summary")?.classList.contains("warn")).toBe(true);
    const { card: german } = await cardFor("x1c", {}, { language: "de" });
    await showView(german, "Steuerung");
    expect(text(head(german))).toBe("Druckoptionen 1 aus");
    const { card: germanAll } = await cardFor("x1c", {}, { language: "de", devices: x1c({ detectors: [{ key: "ai_monitoring", on: true }] }) });
    await showView(germanAll, "Steuerung");
    expect(text(find(germanAll, ".det-summary"))).toBe("Alle an");
    const { card: germanNone } = await cardFor("x1c", {}, { language: "de", devices: x1c({ detectors: [{ key: "ai_monitoring", on: false }] }) });
    await showView(germanNone, "Steuerung");
    expect(text(find(germanNone, ".det-summary"))).toBe("Alle aus");
  });

  it("counts only the switches with a state", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Control");
    await update(card, hass.withState(PLATE, "unknown"));
    expect(text(find(card, ".det-summary"))).toBe("All on");
    const { card: offline } = await cardFor("p1s", {}, { devices: offlineP1s().map((device, index) => (index ? device : { ...device, entities: [...device.entities, { entityId: "switch.p1s_ai_monitoring", key: "ai_monitoring", state: "unavailable" }] })) });
    await showView(offline, "Control");
    expect(find(offline, ".det-head")).not.toBeNull();
    expect(find(offline, ".det-summary")).toBeNull();
  });

  it("shows a new state at once until the switch reports it", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Control");
    await unfold(card);
    toggle(card, "Build plate position detection").click();
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
    const plate = (): string | null => toggle(card, "Build plate position detection").getAttribute("aria-checked");
    expect(plate()).toBe("true");
    // Another entity changed: the switch still says off.
    await update(card, hass.withState("sensor.x1c_progress", "63"));
    expect(plate()).toBe("true");
    const reported = hass.withState(PLATE, "on");
    await update(card, reported);
    expect(plate()).toBe("true");
    // From now on the switch's own state.
    await update(card, reported.withState(PLATE, "off"));
    expect(plate()).toBe("false");
    // A switch that never reports goes back to its state after 10 s.
    toggle(card, "Build plate position detection").click();
    await vi.advanceTimersByTimeAsync(9_999);
    await card.updateComplete;
    expect(plate()).toBe("true");
    await vi.advanceTimersByTimeAsync(1);
    await card.updateComplete;
    expect(plate()).toBe("false");
  });

  it("goes back at once when the command fails, and says why", async () => {
    const { card } = await cardFor("x1c", {}, { callService: async () => Promise.reject({ message: "Printer offline" }) });
    await showView(card, "Control");
    await unfold(card);
    await press(card, "Build plate position detection");
    expect(toggle(card, "Build plate position detection").getAttribute("aria-checked")).toBe("false");
    expect(text(find(card, ".toast"))).toBe("Printer offline");
  });

  it("is sent once while it is on its way", async () => {
    let finish: () => void = () => undefined;
    const { card, hass } = await cardFor("x1c", {}, { callService: () => new Promise<void>((resolve) => (finish = resolve)) });
    await showView(card, "Control");
    await unfold(card);
    await press(card, "Build plate position detection");
    expect(toggle(card, "Build plate position detection").disabled).toBe(true);
    expect(toggle(card, "Build plate position detection").getAttribute("aria-busy")).toBe("true");
    toggle(card, "Build plate position detection").click();
    expect(hass.calls).toHaveLength(1);
    finish();
    await settle(card);
    expect(toggle(card, "Build plate position detection").disabled).toBe(false);
  });

  it("shows only the detections the model has", async () => {
    const { card } = await cardFor("h2d");
    await showView(card, "Control");
    await unfold(card);
    expect(states(card)).toEqual([
      "Build plate detection: true",
      "Spaghetti detection: true",
      "Purge chute pile-up detection: false",
      "Nozzle clumping detection: true",
      "Air printing detection: false",
    ]);
    // Paused: they still switch.
    expect(toggles(card).every((item) => !item.disabled)).toBe(true);
    const { card: mini } = await cardFor("a1mini");
    await showView(mini, "Control");
    await unfold(mini);
    expect(states(mini)).toEqual(["Build plate position detection: true"]);
    // Monitoring on a printer outside the X1 series: no line about what it watches.
    const { card: other } = await cardFor("h2d", {}, { devices: h2d({ detectors: [{ key: "ai_monitoring", on: true }] }) });
    await showView(other, "Control");
    await unfold(other);
    expect(states(other)).toEqual(["AI print monitoring: true"]);
    expect(find(other, ".detection .det-sub")).toBeNull();
    const { card: none } = await withX1c({ detectors: [] });
    await showView(none, "Control");
    await unfold(none);
    expect(find(none, ".detection")).toBeNull();
    const { card: readOnly } = await cardFor("readOnly");
    await showView(readOnly, "Control");
    await unfold(readOnly);
    expect(find(readOnly, ".detection")).toBeNull();
  });

  it("names each by its entity, or by the card's own name for it", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await unfold(card);
    // The device is "Desk A1 mini": the switch's friendly name starts with it.
    expect(toggles(card).map(name)).toEqual(["Build plate position detection"]);
    await update(card, hass.withState("switch.a1_mini_build_plate_position_detection", "on", { friendly_name: "Plate check" }));
    expect(toggles(card).map(name)).toEqual(["Plate check"]);
    const { card: german, hass: germanHass } = await cardFor("h2d", {}, { language: "de" });
    await showView(german, "Steuerung");
    await unfold(german);
    let next = germanHass;
    for (const key of ["build_plate_detection", "spaghetti_detection", "pileup_detection", "clumping_detection", "air_printing_detection"]) {
      next = next.withState(`switch.h2d_${key}`, "off", {});
    }
    await update(german, next);
    expect(toggles(german).map(name)).toEqual([
      "Druckplattenerkennung",
      "Spaghetti-Erkennung",
      "Auswurfschacht-Überwachung",
      "Erkennung von Düsenklumpen",
      "Druck-ins-Leere-Erkennung",
    ]);
    const { card: x1, hass: x1Hass } = await cardFor("x1c", {}, { language: "de" });
    await showView(x1, "Steuerung");
    await unfold(x1);
    await update(x1, x1Hass.withState("switch.x1c_ai_monitoring", "on", {}).withState("switch.x1c_first_layer_inspection", "on", {}));
    expect(toggles(x1).map(name).slice(0, 2)).toEqual(["KI-Drucküberwachung", "Inspektion der ersten Schicht"]);
    expect(text(find(x1, ".detection .section-label"))).toBe("Druckoptionen");
    expect(text(find(x1, ".detection .hint"))).toBe(
      "An: Der Drucker pausiert den Druck, wenn er das Problem erkennt. Empfindlichkeit wie am Drucker eingestellt. Eine ausgeschaltete Erkennung bleibt aus, auch bei den nächsten Drucken.",
    );
    expect(text(find(x1, ".detection .det-sub"))).toBe("Spaghetti und Stau im Auswurfschacht");
    const { card: english, hass: englishHass } = await cardFor("x1c");
    await showView(english, "Control");
    await unfold(english);
    await update(english, englishHass.withState("switch.x1c_ai_monitoring", "on", {}).withState("switch.x1c_first_layer_inspection", "on", {}).withState(PLATE, "on", {}));
    expect(toggles(english).map(name)).toEqual(["AI print monitoring", "First layer inspection", "Build plate position detection"]);
  });

  it("shows a switch without a state as unknown, never as off", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Control");
    await unfold(card);
    await update(card, hass.withState(PLATE, "unavailable").withState("switch.x1c_ai_monitoring", "unknown"));
    expect(states(card)).toEqual(["First layer inspection: true"]);
    // A row to read, not a switch to tap.
    const unknown = findAll(card, ".detection .det-row.unknown");
    expect(unknown.map((row) => [text(row.querySelector(".det-name")), text(row.querySelector(".det-state"))])).toEqual([
      ["AI print monitoring", "Unknown"],
      ["Build plate position detection", "Unknown"],
    ]);
    expect(unknown.every((row) => row.tagName === "DIV" && !row.hasAttribute("role"))).toBe(true);
    // In the order of the detections.
    expect(findAll(card, ".detection .det-row").map((row) => text(row.querySelector(".det-name")))).toEqual([
      "AI print monitoring",
      "First layer inspection",
      "Build plate position detection",
    ]);
    const { card: german } = await cardFor("x1c", {}, { language: "de", devices: x1c({ online: false }) });
    await showView(german, "Steuerung");
    await unfold(german);
    expect(findAll(german, ".detection .det-state").map(text)).toEqual(["Unbekannt", "Unbekannt", "Unbekannt"]);
  });

  it("waits while the printer is offline", async () => {
    // Offline, the switches have no state; one that still has one waits.
    const { card, hass } = await withX1c({ online: false });
    await showView(card, "Control");
    await unfold(card);
    expect(toggles(card)).toHaveLength(0);
    expect(findAll(card, ".detection .det-row.unknown")).toHaveLength(3);
    await update(card, hass.withState(PLATE, "on"));
    expect(states(card)).toEqual(["Build plate position detection: true"]);
    expect(toggle(card, "Build plate position detection").disabled).toBe(true);
  });
});

describe("the active nozzle", () => {
  it("switches between left and right without a print", async () => {
    const { card, hass } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [] }) });
    await showView(card, "Control");
    const sides = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".nozzle-row [role=radio]");
    expect(text(find(card, ".nozzle-row .step-label"))).toBe("Active nozzle");
    expect(sides().map((item) => `${text(item)}: ${item.getAttribute("aria-checked")}`)).toEqual(["Left: true", "Right: false"]);
    await press(card, "Right");
    expect(hass.calls.at(-1)).toEqual({ domain: "select", service: "select_option", data: { entity_id: "select.h2d_active_nozzle", option: "right" }, notifyOnError: false });
    await update(card, hass.withState("select.h2d_active_nozzle", "standby", { options: [] }));
    expect(sides().map(text)).toEqual(["Left", "Right"]);
    await update(card, hass.withState("select.h2d_active_nozzle", "unavailable"));
    expect(sides().every((item) => item.disabled)).toBe(true);
    const { card: single } = await cardFor("a1mini");
    await showView(single, "Control");
    expect(find(single, ".nozzle-row")).toBeNull();
  });

  it("waits while a print is on the printer", async () => {
    const { card } = await cardFor("h2d");
    await showView(card, "Control");
    expect(findAll<HTMLButtonElement>(card, ".nozzle-row [role=radio]").every((item) => item.disabled)).toBe(true);
  });

  it("decides whether the nozzle is hot enough to extrude, and names it", async () => {
    const { card, hass } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [] }) });
    await showView(card, "Control");
    expect(button(card, "Extrude 10 mm of filament").disabled).toBe(false);
    expect(find(card, ".note")).toBeNull();
    // The right nozzle is at 31 °C.
    let next = hass.withState("select.h2d_active_nozzle", "right");
    await update(card, next);
    expect(button(card, "Extrude 10 mm of filament").disabled).toBe(true);
    expect(text(find(card, ".note"))).toBe(`To extrude, heat the right nozzle (active) to at least 170${NBSP}°C under Heating.`);
    next = next.withState("sensor.h2d_left_nozzle_temperature", "120").withState("select.h2d_active_nozzle", "left");
    await update(card, next);
    expect(text(find(card, ".note"))).toBe(`To extrude, heat the left nozzle (active) to at least 170${NBSP}°C under Heating.`);
    // Which one is active is not known: the hottest decides, and the hint names none.
    await update(card, next.withState("select.h2d_active_nozzle", "unknown"));
    expect(text(find(card, ".note"))).toBe(`To extrude, heat the nozzle to at least 170${NBSP}°C under Heating.`);
  });

  it("is tagged in the heating section", async () => {
    const { card, hass } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [] }) });
    await showView(card, "Control");
    const tags = (): (string | null)[] => findAll(card, ".heat-row").map((row) => (row.querySelector(".heat-tag") ? text(row.querySelector(".heat-tag")) : null));
    expect(tags()).toEqual(["active", null, null, null]);
    expect(text(find(card, ".heat-row .heat-label"))).toBe("Left nozzle active");
    // Where the name and the tag do not fit on one line, the tag goes below.
    expect(find(card, ".heat-row .heat-title .heat-tag")).not.toBeNull();
    const css = (Array.isArray(cardStyles) ? cardStyles : [cardStyles]).map((sheet) => (sheet as { cssText: string }).cssText).join("");
    expect(css).toMatch(/\.heat-title\s*\{[^}]*flex-wrap: wrap/);
    await update(card, hass.withState("select.h2d_active_nozzle", "right"));
    expect(tags()).toEqual([null, "active", null, null]);
    await update(card, hass.withState("select.h2d_active_nozzle", "unavailable"));
    expect(tags()).toEqual([null, null, null, null]);
    const { card: single } = await cardFor("a1mini");
    await showView(single, "Control");
    expect(find(single, ".heat-tag")).toBeNull();
  });

  it("says it in German", async () => {
    const { card, hass } = await cardFor("h2d", {}, { language: "de", devices: h2d({ status: "idle", hms: [] }) });
    await showView(card, "Steuerung");
    expect(text(find(card, ".nozzle-row .step-label"))).toBe("Aktive Düse");
    expect(findAll(card, ".nozzle-row [role=radio]").map(text)).toEqual(["Links", "Rechts"]);
    expect(text(find(card, ".heat-tag"))).toBe("aktiv");
    await update(card, hass.withState("select.h2d_active_nozzle", "right"));
    expect(text(find(card, ".note"))).toBe(`Zum Extrudieren die rechte Düse (aktiv) unter „Heizen“ auf mindestens 170${NBSP}°C heizen.`);
    await update(card, hass.withState("sensor.h2d_left_nozzle_temperature", "120"));
    expect(text(find(card, ".note"))).toBe(`Zum Extrudieren die linke Düse (aktiv) unter „Heizen“ auf mindestens 170${NBSP}°C heizen.`);
  });
});

describe("the filament view", () => {
  it("loads a filament after asking, and unloads the one in use", async () => {
    const { card, hass } = await withX1c({ status: "idle" });
    await showView(card, "Filament");
    expect(findAll(card, ".unit-name").map(text)).toEqual(["AMS A", "External spool"]);
    // "AMS A" says its model already.
    expect(find(card, ".unit-model")).toBeNull();
    expect(text(find(card, ".unit-env"))).toBe(`21${NBSP}% 27${NBSP}°C`);
    // The material only where the name does not say it already.
    expect(findAll(card, ".slot-main").map(text)).toEqual([`PLA Basic 80${NBSP}%`, `PLA Matte In use · 45${NBSP}%`, "PLA", "Not set", "Not set"]);
    expect(loadButtons(card).map(text)).toEqual(["Load", "Unload", "Load"]);
    // "In use" on the line below the name: on a phone the name keeps the room.
    expect(text(find(card, ".slot.active .slot-sub"))).toBe(`In use · 45${NBSP}%`);
    expect(find(card, ".slot.active .slot-sub .in-use")).not.toBeNull();
    expect(findAll(card, ".slot .in-use")).toHaveLength(1);
    loadButtons(card)[0]?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Load PLA Basic?");
    await confirmDialog(card);
    expect(hass.calls.at(-1)).toEqual({ domain: "bambuddy", service: "load_filament", data: { entity_id: "sensor.dev-x1c_ams_0_slot_1" }, notifyOnError: false });
    await press(card, "Unload");
    expect(text(find(card, "dialog h2"))).toBe("Unload the filament?");
    await confirmDialog(card);
    expect(hass.calls.at(-1)).toMatchObject({ service: "unload_filament", data: { device_id: "dev-x1c" } });
  });

  it("names a unit's model only where its name does not", async () => {
    const { card } = await cardFor("h2d");
    await showView(card, "Filament");
    // The AMS 2 Pro "AMS A" needs it; "AMS HT A" does not.
    expect(findAll(card, ".unit-head").map((head) => [text(head.querySelector(".unit-name")), text(head.querySelector(".unit-model"))])).toEqual([
      ["AMS A", "AMS 2 Pro"],
      ["AMS HT A", ""],
      ["External spools", ""],
    ]);
  });

  it("loads from an external spool, named by its side on a dual-nozzle printer", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Filament");
    const external = findAll(card, ".unit").at(-1) as HTMLElement;
    expect(text(external.querySelector(".slot-main"))).toBe("TPU 95A HF");
    ([...external.querySelectorAll<HTMLButtonElement>(".slot .btn")].find((item) => text(item) === "Load") as HTMLButtonElement).click();
    await card.updateComplete;
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "sensor.a1_mini_external_spool" });
    const { card: dual } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [] }) });
    await showView(dual, "Filament");
    const spools = findAll(dual, ".unit").at(-1) as HTMLElement;
    expect(text(spools.querySelector(".unit-name"))).toBe("External spools");
    expect([...spools.querySelectorAll(".slot-sub")].map(text)).toEqual(["Left", "Right"]);
    expect([...spools.querySelectorAll(".slot-name")].map(text)).toEqual(["PETG HF", "Not set"]);
  });

  it("lets the plate be cleared with the printer off", async () => {
    // A finished print, the printer switched off: BamBuddy's queue still
    // waits, and BamBuddy takes the plate as cleared without the printer.
    const devices = offlineP1s();
    const printer = devices[0] as FakeDevice;
    const plate = printer.entities.find((entity) => entity.key === "plate_clear_needed");
    if (plate) plate.state = "on";
    const { card, hass } = await cardFor("x1c", { printer: printer.id }, { devices });
    await press(card, "Plate cleared");
    expect(hass.calls.at(-1)).toMatchObject({ domain: "button", service: "press" });
  });

  it("offers no drying for an AMS without a heater", async () => {
    // A classic AMS: Home Assistant may still hold drying entities from an
    // older version of the integration.
    const [printer] = x1c();
    const classic = amsDevice({
      printer: printer as FakeDevice,
      amsId: 0,
      model: "AMS",
      slots: [{ name: "PLA Basic", type: "PLA", color: "#888888", trayId: 0 }],
      drying: { on: false, remaining: 0 },
    });
    const { card } = await cardFor("x1c", {}, { devices: [printer as FakeDevice, classic] });
    await showView(card, "Filament");
    expect(findAll(card, ".drying")).toEqual([]);
  });

  it("dries an AMS that can, with temperature and duration asked first", async () => {
    const { card, hass } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [] }) });
    await showView(card, "Filament");
    const [pro, ht] = findAll(card, ".drying");
    expect(text(pro)).toBe("Drying · 3 h 20 min left Stop drying");
    expect(text(ht)).toBe("Not drying Dry");
    await press(card, "Stop drying");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-h2d-ams-0" });
    expect(hass.calls.at(-1)?.service).toBe("stop_drying");
    await press(card, "Dry");
    expect(text(find(card, "dialog h2"))).toBe("Dry the filament in AMS HT A");
    const temperature = find<HTMLInputElement>(card, "#dry-temperature");
    const duration = find<HTMLInputElement>(card, "#dry-duration");
    // The PA6-CF spool's own recommendation.
    expect([temperature?.value, duration?.value]).toEqual(["80", "10"]);
    expect(text(find(card, "dialog .dlg-suggested"))).toBe("Suggested for the loaded filament.");
    expect(find(card, "dialog .dlg-suggested path")?.getAttribute("d")).toBe(ICONS.check);
    expect(text(find(card, "dialog .dlg-range"))).toBe(`45${NBSP}°C – 85${NBSP}°C · 1–24 h`);
    await press(card, "More Temperature");
    await press(card, "Less Duration");
    expect([find<HTMLInputElement>(card, "#dry-temperature")?.value, find<HTMLInputElement>(card, "#dry-duration")?.value]).toEqual(["85", "9"]);
    const input = find<HTMLInputElement>(card, "#dry-temperature") as HTMLInputElement;
    input.value = "120";
    input.dispatchEvent(new Event("change"));
    await card.updateComplete;
    expect(find<HTMLInputElement>(card, "#dry-temperature")?.value).toBe("85");
    expect(button(card, "More Temperature").disabled).toBe(true);
    input.value = "abc";
    input.dispatchEvent(new Event("change"));
    await card.updateComplete;
    expect(find<HTMLInputElement>(card, "#dry-temperature")?.value).toBe("85");
    const hours = find<HTMLInputElement>(card, "#dry-duration") as HTMLInputElement;
    hours.value = "0";
    hours.dispatchEvent(new Event("change"));
    await card.updateComplete;
    expect(button(card, "Less Duration").disabled).toBe(true);
    await press(card, "Start drying");
    expect(hass.calls.at(-1)).toEqual({
      domain: "bambuddy",
      service: "start_drying",
      data: { device_id: "dev-h2d-ams-128", temperature: 85, duration: 1 },
      notifyOnError: false,
    });
    expect(text(find(card, ".unit .hint"))).toBe("Load filament from the AMS HT on the printer's screen.");
  });

  it("starts drying at the gentlest of the loaded spools' temperatures and the longest time, within the unit's limit", async () => {
    const { card, hass } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [] }) });
    let next = hass.withState("binary_sensor.dev-h2d_ams_0_drying", "off");
    await update(card, next);
    await showView(card, "Filament");
    const open = async (): Promise<[string | undefined, string | undefined, string]> => {
      findAll<HTMLButtonElement>(card, ".drying .btn")[0]?.click();
      await card.updateComplete;
      const values: [string | undefined, string | undefined, string] = [
        find<HTMLInputElement>(card, "#dry-temperature")?.value,
        find<HTMLInputElement>(card, "#dry-duration")?.value,
        text(find(card, "dialog .dlg-suggested")),
      ];
      await press(card, "Back");
      return values;
    };
    // Three PLA spools at 55 °C / 8 h; the support spool has none.
    expect(await open()).toEqual(["55", "8", "Suggested for the loaded filament."]);
    // A PA spool at 80 °C / 12.4 h: the PLA's temperature, the PA's time.
    // A spool without a type is named by its filament.
    const slot = (n: number): string => `sensor.dev-h2d_ams_0_slot_${n}`;
    const attributes = (n: number): Record<string, unknown> => ({ ...(next.states[slot(n)]?.attributes ?? {}) });
    next = next.withState(slot(4), "PA", { ...attributes(4), type: null, name: "PA", drying_temp: 80, drying_time: 12.4 });
    await update(card, next);
    expect(await open()).toEqual(["55", "12", `Set for the gentlest spool: PLA${NBSP}55${NBSP}°C · PA${NBSP}80${NBSP}°C`]);
    // Spools that all want more than the unit can: the AMS 2 Pro stops at 65 °C.
    for (const n of [1, 2, 3]) next = next.withState(slot(n), "PA", { ...attributes(n), type: "PA", drying_temp: 80 });
    await update(card, next);
    expect(await open()).toEqual(["65", "12", "Suggested for the loaded filament."]);
    // An empty slot's values do not count, nor do odd ones; nothing left: the defaults.
    next = next.withState(slot(4), "empty", { ...attributes(4), empty: true, drying_temp: 80, drying_time: 12 });
    for (const n of [1, 2, 3]) next = next.withState(slot(n), "PLA Basic", { ...attributes(n), drying_temp: null, drying_time: "long" });
    await update(card, next);
    expect(await open()).toEqual([String(DRYING.temperature), String(DRYING.duration), ""]);
    findAll<HTMLButtonElement>(card, ".drying .btn")[0]?.click();
    await card.updateComplete;
    expect(find(card, "dialog .dlg-suggested")).toBeNull();
  });

  it("names each material's temperature where the loaded spools differ", async () => {
    const open = async (language: string, temperature: number): Promise<FakeCard> => {
      const { card, hass } = await cardFor("h2d", {}, { language, devices: h2d({ status: "idle", hms: [] }) });
      const slot = "sensor.dev-h2d_ams_0_slot_4";
      const petg = { ...hass.states[slot]?.attributes, name: "PETG HF", type: "PETG", drying_temp: temperature, drying_time: 8 };
      await update(card, hass.withState("binary_sensor.dev-h2d_ams_0_drying", "off").withState(slot, "PETG HF", petg));
      await showView(card, "Filament");
      findAll<HTMLButtonElement>(card, ".drying .btn")[0]?.click();
      await card.updateComplete;
      return card;
    };
    // The AMS 2 Pro: three PLA spools at 55 °C and a PETG one at 65 °C. A
    // material keeps its temperature on its line.
    const card = await open("en", 65);
    expect(find<HTMLInputElement>(card, "#dry-temperature")?.value).toBe("55");
    expect(text(find(card, "dialog .dlg-suggested"))).toBe(`Set for the gentlest spool: PLA${NBSP}55${NBSP}°C · PETG${NBSP}65${NBSP}°C`);
    expect(find(card, "dialog .dlg-suggested path")?.getAttribute("d")).toBe(ICONS.info);
    const german = await open("de", 65);
    expect(text(find(german, "dialog .dlg-suggested"))).toBe(`Für die empfindlichste Spule eingestellt: PLA${NBSP}55${NBSP}°C · PETG${NBSP}65${NBSP}°C`);
    // Different materials that agree: nothing to name.
    const agreeing = await open("en", 55);
    expect(text(find(agreeing, "dialog .dlg-suggested"))).toBe("Suggested for the loaded filament.");
    expect(find(agreeing, "dialog .dlg-suggested path")?.getAttribute("d")).toBe(ICONS.check);
  });

  it("dries an AMS 2 Pro at 65 °C at most", async () => {
    const { card, hass } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [] }) });
    await update(card, hass.withState("binary_sensor.dev-h2d_ams_0_drying", "off"));
    await showView(card, "Filament");
    findAll<HTMLButtonElement>(card, ".drying .btn")[0]?.click();
    await card.updateComplete;
    expect(find<HTMLInputElement>(card, "#dry-temperature")?.max).toBe("65");
    await press(card, "Back");
    expect(find(card, "dialog")).toBeNull();
    // Drying without a time left yet.
    await update(card, hass.withState("sensor.dev-h2d_ams_0_drying_remaining_time", "0"));
    expect(text(findAll(card, ".drying")[0])).toBe("Drying Stop drying");
  });

  it("waits with loading while a print runs: it asks to pause first", async () => {
    for (const status of ["printing", "preparing", "slicing"]) {
      const { card } = await cardFor("h2d", {}, { devices: h2d({ status, stage: "printing", hms: [] }) });
      await showView(card, "Filament");
      expect(findAll(card, ".note.warning").map(text), status).toEqual(["Pause the print to change the filament."]);
      expect(loadButtons(card).every((item) => item.disabled), status).toBe(true);
      // No load button for the AMS HT.
      expect(loadButtons(card).map(text), status).toEqual(["Load", "Unload", "Load", "Load", "Load"]);
    }
    const { card: german } = await cardFor("x1c", {}, { language: "de" });
    await showView(german, "Filament");
    expect(text(find(german, ".note.warning"))).toBe("Pausiere den Druck, um das Filament zu wechseln.");
  });

  it("loads and unloads in a paused print, and says the print stays paused", async () => {
    const { card, hass } = await cardFor("h2d");
    await showView(card, "Filament");
    expect(find(card, ".note")).toBeNull();
    expect(loadButtons(card).map((item) => `${text(item)}: ${item.disabled}`)).toEqual(["Load: false", "Unload: false", "Load: false", "Load: false", "Load: false"]);
    loadButtons(card)[0]?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Load PLA Basic?");
    expect(text(find(card, "dialog p"))).toBe("The printer heats the nozzle, unloads the current filament and loads this one. This takes a few minutes.");
    expect(text(find(card, "dialog .dlg-note"))).toBe("The print stays paused. Resume it once the new filament is in.");
    await confirmDialog(card);
    expect(hass.calls.at(-1)).toEqual({ domain: "bambuddy", service: "load_filament", data: { entity_id: "sensor.dev-h2d_ams_0_slot_1" }, notifyOnError: false });
    await press(card, "Unload");
    expect(text(find(card, "dialog h2"))).toBe("Unload the filament?");
    expect(text(find(card, "dialog .dlg-note"))).toBe("The print stays paused. Resume it once the new filament is in.");
    await confirmDialog(card);
    expect(hass.calls.at(-1)).toMatchObject({ service: "unload_filament", data: { device_id: "dev-h2d" } });
    // Without a print, the dialogs say nothing about one.
    const { card: idle } = await withX1c({ status: "idle" });
    await showView(idle, "Filament");
    await press(idle, "Unload");
    expect(find(idle, "dialog .dlg-note")).toBeNull();
    await press(idle, "Back");
    await press(idle, "Load");
    expect(find(idle, "dialog .dlg-note")).toBeNull();
  });

  it("says in German that the print stays paused", async () => {
    const { card } = await cardFor("h2d", {}, { language: "de" });
    await showView(card, "Filament");
    await press(card, "Entladen");
    expect(text(find(card, "dialog .dlg-note"))).toBe("Der Druck bleibt pausiert. Setze ihn fort, wenn das neue Filament drin ist.");
  });

  it("still waits with moving, extruding and the nozzle choice in a paused print", async () => {
    const { card } = await cardFor("h2d");
    await showView(card, "Control");
    expect(findAll(card, ".note.warning").map(text)).toEqual(["Moving and extruding are possible once the print is done."]);
    expect(findAll<HTMLButtonElement>(card, ".pad button, .axis-col button, .nozzle-row button").every((item) => item.disabled)).toBe(true);
  });

  it("waits while the printer is offline, and knows no slot's contents then", async () => {
    const { card } = await cardFor("p1s");
    await showView(card, "Filament");
    expect(findAll(card, ".note").map(text)).toEqual(["Contents unknown while the printer is offline."]);
    expect(findAll(card, ".slot-main").map(text)).toEqual(["—", "—"]);
    expect(findAll(card, ".slot-main").map((item) => item.getAttribute("aria-label"))).toEqual(["Unknown", "Unknown"]);
    const swatches = findAll(card, ".slot .swatch");
    expect(swatches.map((item) => [item.classList.contains("unknown"), item.classList.contains("empty")])).toEqual([
      [true, false],
      [true, false],
    ]);
    expect(findAll(card, ".slot .btn")).toHaveLength(0);
    // Also without controls: the line is about what the view shows.
    const { card: plain } = await cardFor("p1s", { show_controls: false });
    await showView(plain, "Filament");
    expect(findAll(plain, ".note").map(text)).toEqual(["Contents unknown while the printer is offline."]);
    const { card: german } = await cardFor("p1s", {}, { language: "de" });
    await showView(german, "Filament");
    expect(findAll(german, ".note").map(text)).toEqual(["Inhalt unbekannt, solange der Drucker offline ist."]);
    expect(findAll(german, ".slot-main").map((item) => item.getAttribute("aria-label"))).toEqual(["Unbekannt", "Unbekannt"]);
  });

  it("shows the filament without controls for a read-only key or with show_controls off", async () => {
    const { card } = await cardFor("readOnly");
    await showView(card, "Filament");
    expect(find(card, ".note.info")).not.toBeNull();
    expect(findAll(card, ".slot .btn")).toHaveLength(0);
    const { card: plain } = await cardFor("h2d", { show_controls: false });
    await showView(plain, "Filament");
    expect(find(plain, ".note")).toBeNull();
    expect(findAll(plain, ".slot .btn, .drying .btn")).toHaveLength(0);
    expect(find(plain, ".unit .hint")).toBeNull();
  });

  it("opens a slot's more-info dialog", async () => {
    const { card } = await cardFor("a1mini");
    await showView(card, "Filament");
    const opened: string[] = [];
    card.addEventListener("hass-more-info", (event) => opened.push((event as CustomEvent<{ entityId: string }>).detail.entityId));
    findAll(card, ".slot-main")[1]?.click();
    expect(opened).toEqual(["sensor.dev-a1mini_ams_0_slot_2"]);
  });

  it("reads a slot without attributes by its state", async () => {
    const { card, hass } = await cardFor("a1mini");
    await update(card, hass.withState("sensor.dev-a1mini_ams_0_slot_1", "Mystery", {}).withState("sensor.dev-a1mini_ams_0_slot_2", "unavailable", {}));
    await showView(card, "Filament");
    expect(findAll(card, ".slot-main").slice(0, 2).map(text)).toEqual(["Mystery", "—"]);
  });
});

describe("setting a slot's filament", () => {
  const MATERIALS = ["PLA", "PLA Silk", "PLA-CF", "PETG", "PETG HF", "PETG-CF", "PCTG", "ABS", "ASA", "PC", "PA", "PA-CF", "TPU"];
  const COLORS = ["White", "Black", "Gray", "Silver", "Red", "Orange", "Yellow", "Green", "Turquoise", "Cyan", "Blue", "Purple", "Pink", "Brown", "Beige", "Gold"];
  const SLOT_3 = "sensor.dev-x1c_ams_0_slot_3";

  /** Whether each slot row of the filament view offers "Set filament". */
  const editable = (card: FakeCard): boolean[] => findAll(card, ".slot").map((row) => row.querySelector(".btn.edit") !== null);
  const edit = async (card: FakeCard, row: number): Promise<void> => {
    (findAll(card, ".slot")[row]?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await card.updateComplete;
  };
  const material = (card: FakeCard): HTMLSelectElement => find<HTMLSelectElement>(card, "dialog select") as HTMLSelectElement;
  const choose = async (card: FakeCard, value: string): Promise<void> => {
    material(card).value = value;
    material(card).dispatchEvent(new Event("change"));
    await card.updateComplete;
  };
  const swatches = (card: FakeCard): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, "dialog [role=radiogroup] [role=radio]");
  const checked = (card: FakeCard): string[] => swatches(card).filter((item) => item.getAttribute("aria-checked") === "true").map((item) => item.getAttribute("aria-label") ?? "");
  const pick = async (card: FakeCard, name: string): Promise<void> => {
    (swatches(card).find((item) => item.getAttribute("aria-label") === name) as HTMLButtonElement).click();
    await card.updateComplete;
  };
  const other = async (card: FakeCard, value: string, event = "input"): Promise<void> => {
    const input = find<HTMLInputElement>(card, "dialog input[type=color]") as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event(event));
    await card.updateComplete;
  };
  const setButton = (card: FakeCard): HTMLButtonElement => findAll<HTMLButtonElement>(card, "dialog .dlg-actions .btn").at(-1) as HTMLButtonElement;

  it("is offered for a spool without a chip, never for a Bambu spool's or an empty slot", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Filament");
    // A Bambu spool, the one printing, the PLA without a chip, a spool nobody
    // described yet, the external spool.
    expect(editable(card)).toEqual([false, false, true, true, true]);
    const edits = findAll<HTMLButtonElement>(card, ".slot .btn.edit");
    expect(edits.every((item) => !item.disabled && text(item) === "")).toBe(true);
    // The external spool's names its spool.
    expect(edits.map((item) => item.title)).toEqual(["Set filament", "Set filament", "Set filament of the external spool"]);
    // Nothing in the slot, or no word on it.
    const slot4 = "sensor.dev-x1c_ams_0_slot_4";
    await update(card, hass.withState(slot4, "empty", { ...hass.states[slot4]?.attributes, present: false }).withState(SLOT_3, "PLA", {}));
    expect(editable(card)).toEqual([false, false, false, false, true]);
  });

  it("leaves out the slot a running print feeds from, and offers it while paused", async () => {
    const devices = (status: string): FakeDevice[] => {
      const all = x1c({ status });
      const slot = (all[1] as FakeDevice).entities.find((entity) => entity.entityId === SLOT_3) as { attributes: Record<string, unknown> };
      slot.attributes = { ...slot.attributes, active: true };
      return all;
    };
    for (const status of ["printing", "preparing", "slicing"]) {
      const { card } = await cardFor("x1c", {}, { devices: devices(status) });
      await showView(card, "Filament");
      expect(editable(card), status).toEqual([false, false, false, true, true]);
    }
    const { card: paused } = await cardFor("x1c", {}, { devices: devices("paused") });
    await showView(paused, "Filament");
    expect(editable(paused)).toEqual([false, false, true, true, true]);
  });

  it("waits during a filament change, and is not offered offline or without control", async () => {
    const { card } = await withX1c({ status: "idle", amsStatus: "feeding" });
    await showView(card, "Filament");
    expect(findAll<HTMLButtonElement>(card, ".slot .btn.edit").map((item) => item.disabled)).toEqual([true, true, true]);
    const { card: offline } = await cardFor("p1s");
    await showView(offline, "Filament");
    expect(findAll(offline, ".slot .btn.edit")).toHaveLength(0);
    const { card: readOnly } = await cardFor("readOnly");
    await showView(readOnly, "Filament");
    expect(findAll(readOnly, ".slot .btn.edit")).toHaveLength(0);
    const { card: plain } = await cardFor("x1c", { show_controls: false });
    await showView(plain, "Filament");
    expect(findAll(plain, ".slot .btn.edit")).toHaveLength(0);
  });

  it("keeps the slot's material, offers the 13 generic ones, and preselects its colour", async () => {
    const { card } = await cardFor("x1c");
    await showView(card, "Filament");
    await edit(card, 2);
    expect(text(find(card, "dialog h2"))).toBe("Filament of Slot 3 · AMS A");
    expect(text(find(card, "dialog label[for=fil-material]"))).toBe("Material");
    expect([...material(card).options].map((option) => option.text)).toEqual(["Keep PLA", ...MATERIALS]);
    expect(material(card).value).toBe("keep");
    expect(material(card).classList.contains("unset")).toBe(false);
    expect(find(card, "dialog [role=radiogroup]")?.getAttribute("aria-label")).toBe("Color");
    expect(swatches(card).map((item) => item.getAttribute("aria-label"))).toEqual(COLORS);
    expect(swatches(card).map((item) => item.getAttribute("style"))).toContain("--c: #C12E1F");
    expect(checked(card)).toEqual(["White"]);
    // White and black keep the outline that makes them visible on every theme.
    expect(swatches(card).filter((item) => item.classList.contains("outline")).map((item) => item.getAttribute("aria-label"))).toEqual(["White", "Black", "Yellow", "Beige"]);
    expect(text(find(card, "dialog .other-color"))).toBe("Other color …");
    expect(text(find(card, "dialog .dlg-note"))).toBe("For spools without a chip. A new material uses Bambu's generic profile and the default K value.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Back", "Set"]);
    expect(root(card).activeElement).toBe(find(card, "dialog .btn.safe"));
    // Nothing changed yet.
    expect(setButton(card).disabled).toBe(true);
    expect(setButton(card).classList.contains("primary")).toBe(true);
  });

  it("sends only what changed: the colour, the material, or both", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Filament");
    await edit(card, 2);
    await pick(card, "Red");
    expect(checked(card)).toEqual(["Red"]);
    expect(setButton(card).disabled).toBe(false);
    // Back to the slot's own colour: nothing to send.
    await pick(card, "White");
    expect(setButton(card).disabled).toBe(true);
    await pick(card, "Red");
    await confirmDialog(card);
    expect(hass.calls.at(-1)).toEqual({ domain: "bambuddy", service: "set_filament", data: { entity_id: SLOT_3, color: [193, 46, 31] }, notifyOnError: false });
    expect(text(find(card, ".sent"))).toBe("Sent");
    await edit(card, 2);
    await choose(card, "PETG HF");
    expect(setButton(card).disabled).toBe(false);
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: SLOT_3, material: "PETG HF" });
    await edit(card, 2);
    await choose(card, "PLA");
    await pick(card, "Gold");
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: SLOT_3, material: "PLA", color: [228, 189, 104] });
    // Keep again: nothing changed.
    await edit(card, 2);
    await choose(card, "TPU");
    await choose(card, "keep");
    expect(setButton(card).disabled).toBe(true);
    await press(card, "Back");
    expect(find(card, "dialog")).toBeNull();
    expect(hass.calls).toHaveLength(3);
  });

  it("asks for a material where the slot has none yet", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Filament");
    await edit(card, 3);
    expect(text(find(card, "dialog h2"))).toBe("Filament of Slot 4 · AMS A");
    const options = [...material(card).options];
    expect(options.map((option) => option.text)).toEqual(["Choose …", ...MATERIALS]);
    expect(options[0]?.disabled).toBe(true);
    expect(material(card).value).toBe("");
    // The prompt reads as one, not as a value.
    expect(material(card).classList.contains("unset")).toBe(true);
    // No colour to preselect; a colour alone is not enough, and it says so.
    expect(checked(card)).toEqual([]);
    expect(swatches(card)[0]?.getAttribute("tabindex")).toBe("0");
    expect(find(card, "dialog .dlg-need")).toBeNull();
    await pick(card, "Black");
    expect(setButton(card).disabled).toBe(true);
    expect(text(find(card, "dialog .dlg-actions .dlg-need"))).toBe("Choose a material too.");
    await choose(card, "PETG-CF");
    expect(find(card, "dialog .dlg-need")).toBeNull();
    expect(material(card).classList.contains("unset")).toBe(false);
    expect(setButton(card).disabled).toBe(false);
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "sensor.dev-x1c_ams_0_slot_4", material: "PETG-CF", color: [0, 0, 0] });
  });

  it("shows a colour outside the palette and takes any other", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Filament");
    await edit(card, 2);
    expect(text(find(card, "dialog h2"))).toBe("Filament of Slot 3 · AMS A");
    expect([...material(card).options][0]?.text).toBe("Keep PETG");
    // The slot's own green, checked, after the palette's.
    expect(checked(card)).toEqual(["Current color"]);
    const current = swatches(card).find((item) => item.getAttribute("aria-label") === "Current color");
    expect(current?.getAttribute("style")).toBe("--c: #7BC65B");
    expect(current?.getAttribute("tabindex")).toBe("0");
    expect(find<HTMLInputElement>(card, "dialog input[type=color]")?.value).toBe("#7bc65b");
    await other(card, "#123456");
    expect(checked(card)).toEqual(["Chosen color"]);
    expect(swatches(card).find((item) => item.getAttribute("aria-label") === "Chosen color")?.getAttribute("style")).toBe("--c: #123456");
    expect(setButton(card).disabled).toBe(false);
    // A palette colour from the picker checks its swatch.
    await other(card, "#ff6a13", "change");
    expect(checked(card)).toEqual(["Orange"]);
    await pick(card, "Chosen color");
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "sensor.dev-a1mini_ams_0_slot_3", color: [18, 52, 86] });
    // The picker on the slot's own colour: nothing changed.
    await edit(card, 2);
    await other(card, "#7bc65b");
    expect(checked(card)).toEqual(["Current color"]);
    expect(setButton(card).disabled).toBe(true);
  });

  it("names the external spools, and sets theirs", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Filament");
    await edit(card, 4);
    expect(text(find(card, "dialog h2"))).toBe("Filament of the external spool");
    expect([...material(card).options][0]?.text).toBe("Keep TPU 95A HF");
    expect(checked(card)).toEqual(["Orange"]);
    await choose(card, "TPU");
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "sensor.a1_mini_external_spool", material: "TPU" });
    const { card: dual } = await cardFor("h2d");
    await showView(dual, "Filament");
    const spools = findAll(dual, ".unit").at(-1) as HTMLElement;
    const titles: string[] = [];
    for (const button of spools.querySelectorAll<HTMLButtonElement>(".btn.edit")) {
      button.click();
      await dual.updateComplete;
      titles.push(text(find(dual, "dialog h2")));
      await press(dual, "Back");
    }
    expect(titles).toEqual(["Filament of the left external spool", "Filament of the right external spool"]);
    expect([...spools.querySelectorAll(".btn.edit")].map((item) => item.getAttribute("aria-label"))).toEqual([
      "Set filament of the left external spool",
      "Set filament of the right external spool",
    ]);
  });

  it("moves through the colours with the arrow keys", async () => {
    const { card } = await cardFor("x1c");
    await showView(card, "Filament");
    await edit(card, 2);
    const key = async (name: string): Promise<void> => {
      (root(card).activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
      await card.updateComplete;
    };
    // One stop in the tab order: the checked colour.
    expect(swatches(card).map((item) => item.getAttribute("tabindex")).filter((value) => value === "0")).toHaveLength(1);
    const white = swatches(card)[0] as HTMLButtonElement;
    expect(white.getAttribute("tabindex")).toBe("0");
    white.focus();
    await key("ArrowRight");
    expect(checked(card)).toEqual(["Black"]);
    expect(root(card).activeElement?.getAttribute("aria-label")).toBe("Black");
    expect(swatches(card)[1]?.getAttribute("tabindex")).toBe("0");
    await key("ArrowDown");
    expect(checked(card)).toEqual(["Gray"]);
    await key("ArrowUp");
    await key("ArrowLeft");
    expect(checked(card)).toEqual(["White"]);
    // Round the end.
    await key("ArrowLeft");
    expect(checked(card)).toEqual(["Gold"]);
    await key("ArrowRight");
    expect(checked(card)).toEqual(["White"]);
    await key("Enter");
    expect(checked(card)).toEqual(["White"]);
    // Keys in the colour picker's field are the browser's.
    find(card, "dialog input[type=color]")?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await card.updateComplete;
    expect(checked(card)).toEqual(["White"]);
  });

  it("says why it failed", async () => {
    const refused = { message: "This slot is empty.", translation_domain: "bambuddy", translation_key: "slot_empty" };
    const { card } = await cardFor("x1c", {}, { callService: async () => Promise.reject(refused) });
    await showView(card, "Filament");
    await edit(card, 3);
    await choose(card, "PLA");
    await confirmDialog(card);
    expect(text(find(card, ".toast"))).toBe("This slot is empty.");
  });

  it("says it in German", async () => {
    const { card } = await cardFor("x1c", {}, { language: "de" });
    await showView(card, "Filament");
    expect(findAll(card, ".slot .btn.edit").map((item) => item.getAttribute("aria-label"))).toEqual([
      "Filament festlegen",
      "Filament festlegen",
      "Filament der externen Spule festlegen",
    ]);
    const { card: spools } = await cardFor("h2d", {}, { language: "de" });
    await showView(spools, "Filament");
    expect(findAll(spools, ".unit:last-of-type .btn.edit").map((item) => item.getAttribute("aria-label"))).toEqual([
      "Filament der linken externen Spule festlegen",
      "Filament der rechten externen Spule festlegen",
    ]);
    expect(findAll(card, ".slot-name").map(text).slice(3)).toEqual(["Nicht festgelegt", "Nicht festgelegt"]);
    await edit(card, 2);
    expect(text(find(card, "dialog h2"))).toBe("Filament von Fach 3 · AMS A");
    expect([...material(card).options][0]?.text).toBe("PLA behalten");
    expect(find(card, "dialog [role=radiogroup]")?.getAttribute("aria-label")).toBe("Farbe");
    expect(swatches(card).map((item) => item.getAttribute("aria-label"))).toEqual([
      "Weiß", "Schwarz", "Grau", "Silber", "Rot", "Orange", "Gelb", "Grün", "Türkis", "Cyan", "Blau", "Lila", "Pink", "Braun", "Beige", "Gold",
    ]);
    expect(text(find(card, "dialog .other-color"))).toBe("Andere Farbe …");
    // "Standard-K-Wert" never breaks at its hyphens.
    expect(text(find(card, "dialog .dlg-note"))).toBe("Für Spulen ohne Chip. Ein neues Material nutzt das generische Profil von Bambu und den Standard‑K‑Wert.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Zurück", "Übernehmen"]);
    await press(card, "Zurück");
    await edit(card, 3);
    expect([...material(card).options][0]?.text).toBe("Wählen …");
    await pick(card, "Schwarz");
    expect(text(find(card, "dialog .dlg-need"))).toBe("Wähle noch ein Material.");
    await press(card, "Zurück");
    await edit(card, 4);
    expect(text(find(card, "dialog h2"))).toBe("Filament der externen Spule");
    const { card: dual } = await cardFor("h2d", {}, { language: "de" });
    await showView(dual, "Filament");
    await edit(dual, 5);
    expect(text(find(dual, "dialog h2"))).toBe("Filament der linken externen Spule");
    const { card: green } = await cardFor("a1mini", {}, { language: "de" });
    await showView(green, "Filament");
    await edit(green, 2);
    expect(checked(green)).toEqual(["Aktuelle Farbe"]);
    await other(green, "#123456");
    expect(checked(green)).toEqual(["Gewählte Farbe"]);
  });
});

describe("a command that went through", () => {
  it("says so for 3 s", async () => {
    vi.useFakeTimers();
    const { card } = await cardFor("x1c");
    expect(find(card, ".sent")).toBeNull();
    button(card, "Pause print").click();
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
    expect(text(find(card, ".sent"))).toBe("Sent");
    expect(find(card, ".sent")?.getAttribute("role")).toBe("status");
    await vi.advanceTimersByTimeAsync(2_999);
    await card.updateComplete;
    expect(find(card, ".sent")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await card.updateComplete;
    expect(find(card, ".sent")).toBeNull();
  });

  it("replaces an earlier error, and is not shown for a failure", async () => {
    let fail = true;
    const { card } = await cardFor("x1c", {}, { callService: async () => (fail ? Promise.reject({ message: "Printer offline" }) : undefined) });
    await press(card, "Pause print");
    expect(text(find(card, ".toast"))).toBe("Printer offline");
    expect(find(card, ".sent")).toBeNull();
    fail = false;
    await press(card, "Pause print");
    expect(find(card, ".toast")).toBeNull();
    expect(text(find(card, ".sent"))).toBe("Sent");
  });

  it("says it in German, and forgets it when the card goes", async () => {
    const { card } = await cardFor("x1c", {}, { language: "de" });
    await press(card, "Druck pausieren");
    expect(text(find(card, ".sent"))).toBe("Gesendet");
    card.remove();
    document.body.append(card);
    await card.updateComplete;
    expect(find(card, ".sent")).toBeNull();
  });
});

describe("what the AMS is doing", () => {
  it("shows in the status and the filament view while it is not idle", async () => {
    const { card, hass } = await cardFor("a1mini", {}, { devices: a1mini({ amsStatus: "feeding" }) });
    expect(text(find(card, ".job-info .ams-activity"))).toBe("AMS: Feeding");
    await showView(card, "Filament");
    expect(text(find(card, ".activity"))).toBe("AMS: Feeding");
    expect(find(card, ".activity")?.getAttribute("role")).toBe("status");
    for (const state of ["idle", "unknown", "unavailable"]) {
      await update(card, hass.withState("sensor.a1_mini_ams_status", state));
      expect(find(card, ".activity"), state).toBeNull();
    }
    await showView(card, "Status");
    expect(find(card, ".ams-activity")).toBeNull();
  });

  it("says it in German, and nothing while the printer is offline or without the sensor", async () => {
    const { card } = await cardFor("a1mini", {}, { language: "de", devices: a1mini({ amsStatus: "changing_filament" }) });
    expect(text(find(card, ".ams-activity"))).toBe("AMS: Wechselt Filament");
    const devices = offlineP1s();
    const status = (devices[0] as FakeDevice).entities.find((entity) => entity.key === "ams_status") as { state: string };
    status.state = "feeding";
    const { card: offline } = await cardFor("p1s", {}, { devices });
    expect(find(offline, ".ams-activity")).toBeNull();
    const [printer] = a1mini({ amsStatus: "feeding" }) as [FakeDevice];
    const { card: none } = await cardFor("a1mini", {}, { devices: [{ ...printer, entities: printer.entities.filter((entity) => entity.key !== "ams_status") }] });
    expect(find(none, ".ams-activity")).toBeNull();
  });
});

describe("a filament change", () => {
  const CHANGING = ["heating", "feeding", "retracting", "verifying", "purging", "changing_filament"];
  const WAIT = "Wait until the filament change is done.";

  it("waits with loading, moving and the nozzle choice; heating stays, cooling waits", async () => {
    for (const state of CHANGING) {
      const { card } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [], amsStatus: state }) });
      await showView(card, "Filament");
      expect(findAll(card, ".note.warning").map(text), state).toEqual([WAIT]);
      const loading = findAll<HTMLButtonElement>(card, ".slot .btn");
      expect(loading.length, state).toBeGreaterThan(0);
      expect(loading.every((item) => item.disabled), state).toBe(true);
      await showView(card, "Control");
      expect(findAll(card, ".note.warning").map(text), state).toEqual([WAIT]);
      expect(find(card, ".detection")?.nextElementSibling?.classList.contains("note"), state).toBe(true);
      expect(findAll<HTMLButtonElement>(card, ".pad button, .axis-col button, .nozzle-row button").every((item) => item.disabled), state).toBe(true);
      expect(button(card, `Left nozzle 5${NBSP}°C hotter`).disabled, state).toBe(false);
      expect(button(card, `Bed 5${NBSP}°C cooler`).disabled, state).toBe(false);
      // Cooling would break the change.
      expect(button(card, "Cool down").disabled, state).toBe(true);
      expect(findAll<HTMLButtonElement>(card, ".heat-off").every((item) => item.disabled), state).toBe(true);
    }
  });

  it("locks nothing while the AMS reads, assists or calibrates", async () => {
    for (const state of ["reading_rfid", "assist", "calibrating", "idle"]) {
      const { card } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [], amsStatus: state }) });
      await showView(card, "Filament");
      expect(find(card, ".note"), state).toBeNull();
      expect(findAll<HTMLButtonElement>(card, ".slot .btn").every((item) => !item.disabled), state).toBe(true);
      await showView(card, "Control");
      expect(find(card, ".note"), state).toBeNull();
      expect(findAll<HTMLButtonElement>(card, ".pad button, .nozzle-row button").every((item) => !item.disabled), state).toBe(true);
      expect(button(card, "Cool down").disabled, state).toBe(false);
    }
  });

  it("says a print is the reason while one is on the printer", async () => {
    const { card } = await withX1c({ amsStatus: "feeding" });
    await showView(card, "Control");
    expect(findAll(card, ".note.warning").map(text)).toEqual(["Moving and extruding are possible once the print is done."]);
    await showView(card, "Filament");
    expect(findAll(card, ".note.warning").map(text)).toEqual(["Pause the print to change the filament."]);
  });

  it("says it in German", async () => {
    const { card } = await cardFor("h2d", {}, { language: "de", devices: h2d({ status: "idle", hms: [], amsStatus: "purging" }) });
    await showView(card, "Filament");
    expect(text(find(card, ".note.warning"))).toBe("Warte, bis der Filamentwechsel fertig ist.");
    await showView(card, "Steuerung");
    expect(text(find(card, ".note.warning"))).toBe("Warte, bis der Filamentwechsel fertig ist.");
    const { card: printing } = await cardFor("x1c", {}, { language: "de" });
    await showView(printing, "Steuerung");
    expect(text(find(printing, ".note.warning"))).toBe("Bewegen und Extrudieren sind möglich, sobald der Druck fertig ist.");
    await showView(printing, "Filament");
    expect(text(find(printing, ".note.warning"))).toBe("Pausiere den Druck, um das Filament zu wechseln.");
  });
});

describe("a failed action", () => {
  const offline = { code: "home_assistant_error", message: "Printer offline", translation_domain: "bambuddy", translation_key: "printer_offline" };

  it("shows why in the card until closed", async () => {
    const { card } = await cardFor("x1c", {}, { callService: async () => Promise.reject(offline) });
    await press(card, "Pause print");
    expect(text(find(card, ".toast"))).toBe("Printer offline");
    expect(find(card, ".toast")?.getAttribute("role")).toBe("alert");
    await press(card, "Close");
    expect(find(card, ".toast")).toBeNull();
  });

  it("goes away by itself after a while", async () => {
    vi.useFakeTimers();
    const { card } = await cardFor("x1c", {}, { callService: async () => Promise.reject(offline) });
    button(card, "Pause print").click();
    await vi.advanceTimersByTimeAsync(10);
    await card.updateComplete;
    expect(find(card, ".toast")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(12_000);
    await card.updateComplete;
    expect(find(card, ".toast")).toBeNull();
  });

  it("is sent once however often it is tapped while it runs", async () => {
    let finish: () => void = () => undefined;
    const { card, hass } = await cardFor("x1c", {}, { callService: () => new Promise<void>((resolve) => (finish = resolve)) });
    button(card, "Pause print").click();
    await card.updateComplete;
    expect(button(card, "Pause print").getAttribute("aria-busy")).toBe("true");
    button(card, "Pause print").click();
    expect(hass.calls).toHaveLength(1);
    finish();
    await settle(card);
    expect(button(card, "Pause print").getAttribute("aria-busy")).toBe("false");
  });
});

describe("drawing again", () => {
  it("only when one of the card's own entities changed", async () => {
    const { card, hass } = await cardFor("x1c");
    const render = vi.spyOn(card as unknown as { render: () => unknown }, "render");
    await update(card, hass.withState("sensor.somewhere_else", "1"));
    expect(render).not.toHaveBeenCalled();
    await update(card, hass.withState("sensor.x1c_progress", "63"));
    expect(render).toHaveBeenCalledTimes(1);
    expect(text(find(card, ".pct"))).toBe(`63${NBSP}%`);
    await update(card, hass.withState("sensor.dev-x1c_ams_0_humidity", "30"));
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("with new registries, finding new AMS units", async () => {
    const { card, hass } = await cardFor("a1mini", {}, { devices: [a1mini()[0] as FakeDevice] });
    expect(find(card, ".ams-group")).not.toBeNull();
    expect(findAll(card, ".ams-name").map(text)).toEqual(["Ext"]);
    await update(card, hass.withDevices(a1mini()));
    expect(findAll(card, ".ams-name").map(text)).toEqual(["AMS A", "Ext"]);
  });

  it("in a new language", async () => {
    const { card, hass } = await cardFor("x1c");
    await update(card, { ...hass, locale: { ...hass.locale, language: "de" }, language: "de" } as FakeHass);
    expect(text(find(card, ".job-name"))).toBe("Benchy_0.2mm_PLA");
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Steuerung", "Filament"]);
  });
});

describe("in German", () => {
  it("says it all in German", async () => {
    const { card } = await cardFor("x1c", {}, { language: "de" });
    expect(text(find(card, ".chip"))).toBe("Druckt");
    expect(findAll(card, ".meta span").map(text)).toEqual(["Schicht 123 / 250", "noch 1 Std. 23 Min.", "Ende 14:35"]);
    expect(findAll(card, ".ctl-buttons .btn").map(text)).toEqual(["Druck pausieren", "Druck stoppen", "Objekte überspringen"]);
    expect(text(find(card, ".speed-label"))).toBe("Druckgeschwindigkeit");
    expect(findAll(card, ".speed .opt").map(text)).toEqual(["Leise", "Standard", "Sport", "Ludicrous"]);
  });
});

describe("the card as Home Assistant uses it", () => {
  it("sizes itself for the masonry and the sections dashboards", async () => {
    const { card } = await cardFor("x1c");
    expect(card.getCardSize()).toBe(11);
    expect(card.getGridOptions()).toEqual({ columns: 12, min_columns: 6, rows: "auto" });
    card.setConfig({ type: "custom:bambuddy-printer-card", show_temperatures: false, show_fans: false, show_ams: false, show_controls: false });
    expect(card.getCardSize()).toBe(4);
    const fresh = document.createElement("bambuddy-printer-card") as FakeCard;
    expect(fresh.getCardSize()).toBe(11);
  });

  it("starts from the picker with the first printer", () => {
    expect(BamBuddyPrinterCard.getStubConfig(makeHass({ devices: [instanceDevice, ...a1mini(), ...x1c()] }))).toEqual({ printer: "dev-a1mini", camera: "tap" });
    // The preview shows a printer that is online, if there is one.
    expect(BamBuddyPrinterCard.getStubConfig(makeHass({ devices: [...offlineP1s(), ...x1c()] }))).toEqual({ printer: "dev-x1c", camera: "tap" });
    expect(BamBuddyPrinterCard.getStubConfig(makeHass({ devices: offlineP1s() }))).toEqual({ printer: "dev-p1s", camera: "tap" });
    expect(BamBuddyPrinterCard.getStubConfig(makeHass())).toEqual({ camera: "tap" });
    expect(BamBuddyPrinterCard.getStubConfig()).toEqual({ camera: "tap" });
  });

  it("describes its editor", () => {
    const form = BamBuddyPrinterCard.getConfigForm();
    expect(form.schema.map((field) => field.name)).toEqual(["printer", "camera", ""]);
  });
});
