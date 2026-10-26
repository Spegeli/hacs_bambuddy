import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { BamBuddyPrinterCard } from "../src/card";
import { DRYING } from "../src/dialogs";
import { ICONS } from "../src/icons";
import { unitModel } from "../src/parts";
import type { AmsRefs } from "../src/types";
import {
  a1mini,
  amsDevice,
  h2d,
  instanceDevice,
  makeHass,
  missingFromBamBuddy,
  mountCard,
  OFFER,
  offerFor,
  offlineP1s,
  p1s,
  plugDevice,
  readOnlyX1c,
  unreachable,
  x1c,
  type FakeCard,
  type FakeDevice,
  type FakeHass,
  type FakeHassOptions,
  type PrinterSpec,
} from "./fixtures";
import { atRule, button, cardText, find, findAll, hasButton, NBSP, press, root, settle, shownText, showView, styleText, text, update } from "./helpers";

/** The load and unload buttons of the filament view's slots. */
const loadButtons = (card: FakeCard): HTMLButtonElement[] =>
  findAll<HTMLButtonElement>(card, ".slot .btn").filter((item) => ["Load", "Unload", "Laden", "Entladen"].includes(text(item)));

/** Confirms the open dialog with its own button, the last one. */
async function confirmDialog(card: FakeCard): Promise<void> {
  findAll<HTMLButtonElement>(card, "dialog button").at(-1)?.click();
  await settle(card);
}

/** A tap on the backdrop: pressed and let go on the dialog element itself. */
function tapBeside(card: FakeCard): void {
  const dialog = find(card, "dialog") as HTMLElement;
  dialog.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }));
  dialog.click();
}

const PRINTERS: Record<string, [() => FakeDevice[], string]> = {
  x1c: [x1c, "dev-x1c"],
  h2d: [h2d, "dev-h2d"],
  a1mini: [a1mini, "dev-a1mini"],
  p1s: [offlineP1s, "dev-p1s"],
  readOnly: [readOnlyX1c, "dev-x1c"],
};

/** A key pressed on an element of the card: the keyboard is there. */
const keyPress = (element: Element): boolean => element.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true }));

async function cardFor(
  name: keyof typeof PRINTERS,
  config: Record<string, unknown> = {},
  options: { language?: string; devices?: FakeDevice[]; callService?: FakeHassOptions["callService"]; admin?: boolean } = {},
): Promise<{ card: FakeCard; hass: FakeHass }> {
  const [devices, printer] = PRINTERS[name] as [() => FakeDevice[], string];
  const hass = makeHass({
    devices: options.devices ?? devices(),
    language: options.language ?? "en",
    ...(options.callService ? { callService: options.callService } : {}),
    ...(options.admin === undefined ? {} : { admin: options.admin }),
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
      // Most often it is the same printer, set up anew: chosen again.
      [{ printer: "dev-gone" }, "This printer is no longer available. In the card's settings, choose it again – or another one."],
      [{ printer: "dev-x1c-ams-0" }, "This device is not a BamBuddy printer. Choose a printer, not an AMS unit, a smart plug or the BamBuddy server."],
      [{ printer: "dev-instance" }, "This device is not a BamBuddy printer. Choose a printer, not an AMS unit, a smart plug or the BamBuddy server."],
    ];
    for (const [config, message] of messages) {
      const card = await mountCard(hass, config);
      expect(cardText(card)).toBe(message);
    }
  });

  it("waits for a printer whose device is back before its entities", async () => {
    // Added again (Configure, a switch back): Home Assistant restores the
    // device at the start of the setup, its entities come seconds later --
    // no reason to send the user to another device.
    const coming: FakeDevice = {
      id: "dev-coming",
      name: "Kids A1 (A1 / 039ED4500600444)",
      model: "A1",
      identifiers: [["bambuddy", "01JENTRY0000000000000000AB_printer_039ED4500600444"]],
      entities: [],
    };
    const unit: FakeDevice = {
      id: "dev-unit",
      name: "Kids A1 AMS A (AMS / 00600A0000000001)",
      model: "AMS",
      identifiers: [["bambuddy", "01JENTRY0000000000000000AB_printer_039ED4500600444_ams_00600A0000000001"]],
      entities: [],
    };
    const german = makeHass({ devices: [coming], language: "de" });
    expect(cardText(await mountCard(german, { printer: "dev-coming" }))).toBe("Warte auf die Daten des Druckers …");
    const hass = makeHass({ devices: [...x1c(), coming, unit] });
    expect(cardText(await mountCard(hass, { printer: "dev-coming" }))).toBe("Waiting for the printer's data …");
    expect(cardText(await mountCard(hass, { printer: "dev-unit" }))).toBe(
      "This device is not a BamBuddy printer. Choose a printer, not an AMS unit, a smart plug or the BamBuddy server.",
    );
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
    // The state is a line of the job, announced when it changes; the head
    // has no chip for it.
    expect(text(find(card, ".state"))).toBe("Printing");
    expect(find(card, ".state")?.classList.contains("tone-active")).toBe(true);
    // Announced by the card's own live line, with the printer's name.
    expect(find(card, ".card-status")?.getAttribute("role")).toBe("status");
    expect(text(find(card, ".card-status"))).toBe("Workshop: Printing");
    expect(find(card, ".state svg path")?.getAttribute("d")).toBe(ICONS.play);
    expect(find(card, ".head .chip")).toBeNull();
    expect(find(card, ".dot")?.classList.contains("on")).toBe(true);
    expect(find(card, ".dot")?.getAttribute("aria-label")).toBe("Online");
    expect(text(find(card, ".job-name"))).toBe("Benchy_0.2mm_PLA");
    expect(text(find(card, ".pct"))).toBe(`62${NBSP}%`);
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

  it("names the fans in the viewer's language, not the server's, unless the user renamed one", async () => {
    // Home Assistant names the entities in the server's language, German
    // here; the viewer reads English.
    const { card } = await cardFor("a1mini", {}, { devices: a1mini({ serverLanguage: "de" }) });
    expect(findAll(card, ".fan .fan-label.full").map(text)).toEqual(["Part cooling fan", "Hotend fan"]);
    expect(findAll(card, ".fan").map((fan) => fan.getAttribute("aria-label"))).toEqual(["Part cooling fan: Off", "Hotend fan: Off"]);
    const { card: german } = await cardFor("a1mini", {}, { language: "de" });
    expect(findAll(german, ".fan .fan-label.full").map(text)).toEqual(["Teilekühlungslüfter", "Hotend-Lüfter"]);
    // A name the user gave in Home Assistant stays, without the printer's
    // name in front, whatever the viewer's language.
    const { card: renamed } = await cardFor("a1mini", {}, { language: "de", devices: a1mini({ renamed: { part_cooling_fan: "Blower" } }) });
    expect(findAll(renamed, ".fan .fan-label.full").map(text)).toEqual(["Blower", "Hotend-Lüfter"]);
    expect(find(renamed, ".fan")?.getAttribute("title")).toBe("Blower");
    const { card: full } = await cardFor("a1mini", {}, { devices: a1mini({ renamed: { part_cooling_fan: "Desk A1 mini Blower" } }) });
    expect(text(find(full, ".fan .fan-label.full"))).toBe("Blower");
  });

  it("names the auxiliary fans side first in German, as the entities do", async () => {
    // The X2D's fan 2 is its left one, fan 10 its right one.
    const fans = [
      { key: "part_cooling_fan", percent: 0 },
      { key: "exhaust_fan", percent: 0 },
      { key: "left_auxiliary_fan", percent: 0 },
      { key: "right_auxiliary_fan", percent: 30 },
    ];
    const { card } = await cardFor("x1c", {}, { language: "de", devices: x1c({ fans }) });
    // "Bauteil" alone read as "component off".
    expect(findAll(card, ".fan .fan-label.short").map(text)).toEqual(["Teilekühlung", "Abluft", "Linker Zusatz", "Rechter Zusatz", "Hotend"]);
    expect(findAll(card, ".fan .fan-label.full").map(text)).toEqual(expect.arrayContaining(["Linker Zusatzlüfter", "Rechter Zusatzlüfter"]));
  });

  it("shows the loaded filament: colour, material, the slot in use and the AMS humidity", async () => {
    const { card } = await cardFor("x1c");
    expect(findAll(card, ".ams-name").map(text)).toEqual(["AMS A", "Ext"]);
    // "Ext" is short: its tooltip says it in full.
    expect(findAll(card, ".ams-name").at(-1)?.getAttribute("title")).toBe("External spool");
    expect(text(find(card, ".ams-hum"))).toBe(`21${NBSP}%`);
    // Slot 4 holds a spool nobody described: "?". The external holder,
    // whose spool BamBuddy never reports, is empty: "–".
    expect(findAll(card, ".slot-type").map(text)).toEqual(["PLA", "PLA", "PLA", "?", "–"]);
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

  it("tells a spool nobody described from an empty slot", async () => {
    const [printer] = x1c() as [FakeDevice];
    const ams = amsDevice({ printer, amsId: 0, model: "AMS", slots: [{ trayId: 0 }, { trayId: 1, present: true }, { name: "PLA Basic", type: "PLA", color: "#FFFFFF", trayId: 2 }] });
    const { card } = await cardFor("x1c", {}, { devices: [printer, ams] });
    expect(findAll(card, ".ams-group")[0]?.querySelectorAll(".slot-type").length).toBe(3);
    expect([...(findAll(card, ".ams-group")[0]?.querySelectorAll(".slot-type") ?? [])].map(text)).toEqual(["–", "?", "PLA"]);
    expect(findAll(card, ".ams-slot").map((slot) => slot.getAttribute("title")).slice(0, 2)).toEqual(["Empty", "Not set"]);
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
    const css = styleText();
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
    expect(findAll(card, ".slot-type").map(text)).toEqual(["—", "PLA", "PLA", "?", "–"]);
    const unknown = findAll(card, ".ams-strip .swatch")[0];
    expect(unknown?.classList.contains("unknown")).toBe(true);
    expect(unknown?.classList.contains("empty")).toBe(false);
    expect(findAll(card, ".ams-slot")[0]?.getAttribute("title")).toBe("Unknown");
  });

  it("opens the filament view from the strip", async () => {
    const { card } = await cardFor("x1c");
    (find(card, "button.ams-strip") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(find(card, '[role=tab][aria-selected="true"]')?.textContent?.trim()).toBe("Filament");
  });

  it("says what the strip shows to a screen reader, and where a tap on it goes", async () => {
    const { card } = await cardFor("x1c");
    const button = find(card, "button.ams-strip") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("AMS and filament – Open the filament view");
    expect(text(find(card, `#${button.getAttribute("aria-describedby")}`))).toBe(
      `AMS A, humidity 21${NBSP}%, temperature 27${NBSP}°C: PLA Basic · 80${NBSP}%, PLA Matte · 45${NBSP}% · In use, PLA, Not set. External spool: Not set`,
    );
    const { card: german } = await cardFor("h2d", {}, { language: "de" });
    expect(find(german, "button.ams-strip")?.getAttribute("aria-label")).toBe("AMS und Filament – Filament-Ansicht öffnen");
    expect(text(find(german, "#ams-said"))).toBe(
      `AMS A (AMS 2 Pro, rechte Düse), Feuchte 14${NBSP}%, Temperatur 52${NBSP}°C: PLA Basic · 92${NBSP}%, PLA Basic · 61${NBSP}% · In Gebrauch, PLA Silk+ · 12${NBSP}%, Support for PLA · 70${NBSP}%. ` +
        `AMS HT A (linke Düse), Feuchte 9${NBSP}%, Temperatur 30${NBSP}°C: PA6-CF · 55${NBSP}%. Externe Spulen: Links: PETG HF, Rechts: Nicht festgelegt`,
    );
    // Without the Filament tab the strip is no button: a named group that says the same.
    const { card: noTab } = await cardFor("x1c", { show_filament_tab: false });
    const strip = find(noTab, "div.ams-strip") as Element;
    expect([strip.getAttribute("role"), strip.getAttribute("aria-label")]).toEqual(["group", "AMS and filament"]);
    expect(text(strip.querySelector(".sr-only"))).toBe(
      `AMS A, humidity 21${NBSP}%, temperature 27${NBSP}°C: PLA Basic · 80${NBSP}%, PLA Matte · 45${NBSP}% · In use, PLA, Not set. External spool: Not set`,
    );
    expect(strip.querySelector(".ams-column")?.getAttribute("aria-hidden")).toBe("true");
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
    tapBeside(card);
    await card.updateComplete;
    expect(find(card, "dialog")).toBeNull();
    await press(card, "Stop print");
    find<HTMLDialogElement>(card, "dialog")?.close();
    await card.updateComplete;
    expect(find(card, "dialog")).toBeNull();
    expect(hass.calls).toEqual([]);
  });

  it("stays open when a drag that starts in it ends beside it: selecting a text, say", async () => {
    const { card } = await cardFor("x1c");
    await press(card, "Stop print");
    const dialog = find(card, "dialog") as HTMLElement;
    find(card, "dialog p")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }));
    // The click of such a drag goes to the dialog itself.
    dialog.click();
    await card.updateComplete;
    expect(find(card, "dialog")).not.toBeNull();
    tapBeside(card);
    await card.updateComplete;
    expect(find(card, "dialog")).toBeNull();
  });

  it("closes itself before it goes, so that the browser gives the focus back to the button that opened it", async () => {
    const { card } = await cardFor("x1c");
    // Whether each dialog was still on the page when it closed.
    const attached: boolean[] = [];
    const close = HTMLDialogElement.prototype.close;
    const spy = vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement, value?: string) {
      attached.push(this.isConnected);
      close.call(this, value);
    });
    try {
      await press(card, "Stop print");
      await press(card, "Keep printing");
      await press(card, "Stop print");
      await confirmDialog(card);
      expect(find(card, "dialog")).toBeNull();
      expect(attached).toEqual([true, true]);
    } finally {
      spy.mockRestore();
    }
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
    // The stage says more than "Paused": it is the state line.
    expect(text(find(card, ".state"))).toBe("Paused by the user");
    expect(find(card, ".state")?.classList.contains("tone-paused")).toBe(true);
    expect(find(card, ".state svg path")?.getAttribute("d")).toBe(ICONS.pause);
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
    // Without the Filament tab, the note names none.
    const { card: noTab } = await cardFor("a1mini", { show_filament_tab: false }, { devices: a1mini({ status: "paused" }) });
    expect(text(find(noTab, ".controls .note"))).toBe("No filament loaded. Load one before resuming.");
    const { card: keinTab } = await cardFor("a1mini", { show_filament_tab: false }, { language: "de", devices: a1mini({ status: "paused" }) });
    expect(text(find(keinTab, ".controls .note"))).toBe("Kein Filament geladen. Lade eines, bevor du fortsetzt.");
  });

  it("shows both nozzles of a dual-nozzle printer and its heated chamber", async () => {
    const { card } = await cardFor("h2d");
    // The active nozzle says so, as in the Control tab.
    expect(findAll(card, ".temp-head").map(text)).toEqual(["Left nozzle active", "Right nozzle", "Bed", "Chamber"]);
    expect(findAll(card, ".temp-target").map(text)).toEqual([`Target 250${NBSP}°C`, "Off", `Target 90${NBSP}°C`, `Target 45${NBSP}°C`]);
    expect(find(card, ".temps")?.classList.contains("n4")).toBe(true);
    expect(findAll(card, ".fan").map((fan) => text(fan.querySelector(".fan-label.short")))).toEqual(["Part cooling", "Auxiliary", "Exhaust", "Hotend"]);
    expect(findAll(card, ".ams-name").map(text)).toEqual(["AMS A", "AMS HT A", "Ext"]);
    // The two external spools say their side; the temperatures sit two by two.
    expect(findAll(card, ".ams-strip .slot-side").map(text)).toEqual(["L", "R"]);
    expect(find(card, ".temps")?.classList.contains("dual")).toBe(true);
  });

  it("marks every heater that is on, also once it holds its target", async () => {
    const { card } = await withX1c({ status: "preparing", stage: "heating_nozzle", progress: 0, layer: 0, nozzles: [[143, 220]], bed: [55, 55] });
    expect(text(find(card, ".state"))).toBe("Heating nozzle");
    expect(findAll(card, ".temp.heating").map((tile) => text(tile.querySelector(".temp-head")))).toEqual(["Nozzle", "Bed"]);
    // No layer before the first one.
    expect(findAll(card, ".meta span").map(text)).toEqual(["1 h 23 min left", "Ends 14:35"]);
    // A heater switched off is not marked, however warm it still is.
    const off = await withX1c({ status: "idle", stage: "idle", progress: 0, nozzles: [[180, 0]], bed: [31, 40] });
    expect(findAll(off.card, ".temp.heating").map((tile) => text(tile.querySelector(".temp-head")))).toEqual(["Bed"]);
  });

  it("asks to clear the plate after a print, and says so", async () => {
    const { card, hass } = await withX1c({ status: "finished", stage: "idle", progress: 97, remaining: 0, plateClearNeeded: true });
    expect(text(find(card, ".callout"))).toBe(
      "Take the print off the plate, then tap “Plate cleared”. BamBuddy starts the next queued print only after that. Plate cleared",
    );
    expect(text(find(card, ".pct"))).toBe(`100${NBSP}%`);
    expect(find(card, ".bar")?.classList.contains("tone-done")).toBe(true);
    expect(findAll(card, ".meta span").map(text)).toEqual(["Layer 123 / 250"]);
    expect(find(card, ".controls")).toBeNull();
    await press(card, "Plate cleared");
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "button.x1c_plate_cleared" });
  });

  it("shows how far a stopped or failed print got by its layers, with no percentage", async () => {
    // The firmware resets the progress to 0 % on a stop: the layers tell.
    const { card } = await withX1c({ status: "failed", stage: "idle", progress: 0, layer: 122, totalLayers: 250, plateClearNeeded: true });
    expect(text(find(card, ".state"))).toBe("Failed");
    expect(find(card, ".pct")).toBeNull();
    expect(find(card, ".bar")).toBeNull();
    expect(findAll(card, ".meta span").map(text)).toEqual(["Layer 122 / 250"]);
    expect(text(find(card, ".job-name"))).toBe("Benchy_0.2mm_PLA");
  });

  it("keeps Failed on the state line while the printer loads filament after the print", async () => {
    const { card } = await withX1c({ status: "failed", stage: "changing_filament", progress: 0, layer: 122, totalLayers: 250, plateClearNeeded: true });
    expect(text(find(card, ".state"))).toBe("Failed");
    const finished = await withX1c({ status: "finished", stage: "changing_filament", progress: 100, remaining: 0 });
    expect(text(find(finished.card, ".state"))).toBe("Finished");
  });

  it("names a printer's light a light where the integration says it has no chamber", async () => {
    const devices = x1c();
    for (const device of devices) {
      for (const entity of device.entities) {
        if (entity.key === "chamber_light") {
          entity.key = "light";
          entity.entityId = entity.entityId.replace("chamber_light", "light");
        }
      }
    }
    const { card } = await cardFor("x1c", {}, { devices });
    expect(hasButton(card, "Light")).toBe(true);
    expect(hasButton(card, "Chamber light")).toBe(false);
  });

  it("shows an idle printer", async () => {
    const { card } = await cardFor("a1mini");
    expect(text(find(card, ".name"))).toBe("Desk");
    expect(text(find(card, ".state"))).toBe("Idle");
    expect(find(card, ".state")?.classList.contains("tone-idle")).toBe(true);
    // Ready, neither switched off nor done: no power symbol, no tick.
    expect(find(card, ".state svg path")?.getAttribute("d")).toBe(ICONS.ready);
    expect(ICONS.ready).not.toBe(ICONS.power);
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
    // The warning is the state: no line besides it.
    expect(find(card, ".state")).toBeNull();
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

  it("knows BamBuddy gives no data also where the user disabled the Online sensor", async () => {
    const withoutOnline = (devices: FakeDevice[]): FakeDevice[] =>
      devices.map((device) => ({ ...device, entities: device.entities.filter((entity) => entity.key !== "online") }));
    const { card } = await cardFor("x1c", {}, { devices: withoutOnline(unreachable(x1c())) });
    expect(find(card, ".dot")?.classList.contains("on")).toBe(false);
    expect(find(card, ".dot")?.getAttribute("aria-label")).toBe("No data from BamBuddy");
    // An unplugged unit leaves the strip as it does with the sensor.
    const [printer, ams] = x1c() as [FakeDevice, FakeDevice];
    const unplugged = { ...ams, entities: ams.entities.map((entity) => ({ ...entity, state: "unavailable", attributes: {} })) };
    const { card: strip } = await cardFor("x1c", {}, { devices: withoutOnline([printer, unplugged]) });
    expect(findAll(strip, ".ams-strip .ams-name").map(text)).toEqual(["Ext"]);
  });

  it("says BamBuddy cannot be reached where the integration has no answer at all, not that the printer is offline", async () => {
    const { card, hass } = await cardFor("x1c", {}, { devices: unreachable(x1c()) });
    // BamBuddy stopped, or refusing the key: the card cannot tell.
    const message = "No data from BamBuddy. Check that BamBuddy is running, and under Settings → Devices & services whether it asks for a new API key.";
    expect(find(card, ".state")).toBeNull();
    expect(find(card, ".dot")?.classList.contains("on")).toBe(false);
    // The dot says it too: the printer may be printing fine.
    expect(find(card, ".dot")?.getAttribute("aria-label")).toBe("No data from BamBuddy");
    expect(text(find(card, ".job-info"))).toBe(message);
    expect(cardText(card)).not.toContain("The printer is offline");
    // BamBuddy's name is gone with the state: the device's name without
    // the model and serial the integration adds to it.
    expect(text(find(card, ".name"))).toBe("Workshop");
    await showView(card, "Control");
    expect(findAll(card, ".note").map(text)).toEqual([message]);
    await showView(card, "Filament");
    expect(findAll(card, ".note").map(text)).toEqual([message]);
    // Once BamBuddy answers again, the printer's own state is back.
    await update(card, hass.withDevices(x1c()));
    await showView(card, "Status");
    expect(text(find(card, ".state"))).toBe("Printing");
    const { card: german } = await cardFor("x1c", {}, { devices: unreachable(x1c()), language: "de" });
    expect(text(find(german, ".job-info"))).toBe("Keine Daten von BamBuddy. Prüfe, ob BamBuddy läuft, und unter Einstellungen → Geräte & Dienste, ob BamBuddy einen neuen API-Schlüssel braucht.");
    expect(find(german, ".dot")?.getAttribute("aria-label")).toBe("Keine Daten von BamBuddy");
    // Someone who may not open the settings is not sent there.
    const { card: user } = await cardFor("x1c", {}, { devices: unreachable(x1c()), admin: false });
    expect(text(find(user, ".job-info"))).toBe("No data from BamBuddy. Check that BamBuddy is running; an administrator may need to enter a new API key.");
  });

  it("says BamBuddy no longer lists a printer where the integration names it so", async () => {
    // After a move to another BamBuddy, or a printer deleted there: the
    // entry is loaded, the printer's entities are only what Home Assistant
    // restored, and BamBuddy's Connection sensor names the printer -- not a
    // key to check.
    const linked = (devices: FakeDevice[], server: FakeDevice): FakeDevice[] => [
      ...devices.map((device) => (device.via ? device : { ...device, via: server.id })),
      server,
    ];
    const naming = (missing: string[], state = "on"): FakeDevice => ({
      ...instanceDevice,
      entities: instanceDevice.entities.map((entity) => ({ ...entity, state, attributes: { missing_printers: missing } })),
    });
    const devices = linked(missingFromBamBuddy(x1c()), naming(["dev-x1c"]));
    const message = "BamBuddy no longer lists this printer. You can remove it under Settings → Repairs; once BamBuddy lists it again, it comes back here by itself.";
    const { card, hass } = await cardFor("x1c", {}, { devices });
    expect(text(find(card, ".job-info"))).toBe(message);
    expect(find(card, ".dot")?.getAttribute("aria-label")).toBe("No longer in BamBuddy");
    await showView(card, "Control");
    expect(findAll(card, ".note").map(text)).toEqual([message]);
    await showView(card, "Status");
    // The sensor's own change shows at once, either way: a card open while
    // the entry reloads sees the printer's entities written before it.
    await update(card, hass.withState("binary_sensor.bambuddy_connection", "on", { missing_printers: [] }));
    expect(text(find(card, ".job-info"))).toContain("No data from BamBuddy");
    await update(card, hass.withState("binary_sensor.bambuddy_connection", "on", { missing_printers: ["dev-x1c"] }));
    expect(text(find(card, ".job-info"))).toBe(message);
    const { card: german } = await cardFor("x1c", {}, { devices, language: "de" });
    expect(text(find(german, ".job-info"))).toBe(
      "BamBuddy führt diesen Drucker nicht mehr. Unter Einstellungen → Reparaturen kannst du ihn entfernen; führt BamBuddy ihn wieder, erscheint er hier von selbst.",
    );
    expect(find(german, ".dot")?.getAttribute("aria-label")).toBe("Nicht mehr in BamBuddy");
    // Someone who may not open the settings is not sent there.
    const { card: user } = await cardFor("x1c", {}, { devices, admin: false });
    expect(text(find(user, ".job-info"))).toBe("BamBuddy no longer lists this printer. Once BamBuddy lists it again, it comes back here by itself.");
    // BamBuddy down since: the printer still waits -- as the list says.
    const { card: stopped } = await cardFor("x1c", {}, { devices: linked(missingFromBamBuddy(x1c()), naming(["dev-x1c"], "off")) });
    expect(text(find(stopped, ".job-info"))).toBe(message);
    // While the entry sets up, its printers' states are still the restored
    // ones and the sensor names none of them: no data, not "missing".
    const { card: setting } = await cardFor("x1c", {}, { devices: linked(missingFromBamBuddy(x1c()), naming([])) });
    expect(text(find(setting, ".job-info"))).toContain("No data from BamBuddy");
    // The entry not loaded: BamBuddy's sensor is restored too -- as before.
    const { card: unloaded } = await cardFor("x1c", {}, { devices: missingFromBamBuddy(linked(x1c(), instanceDevice)) });
    expect(text(find(unloaded, ".job-info"))).toContain("No data from BamBuddy");
  });

  it("knows a printer is offline from its print status where it has no Online sensor", async () => {
    const [printer, ams] = offlineP1s() as [FakeDevice, FakeDevice];
    const devices = [{ ...printer, entities: printer.entities.filter((entity) => entity.key !== "online") }, ams];
    const { card } = await cardFor("p1s", {}, { devices });
    expect(text(find(card, ".job-info"))).toContain("The printer is offline.");
    const online = x1c()[0] as FakeDevice;
    const { card: other } = await cardFor("x1c", {}, { devices: [{ ...online, entities: online.entities.filter((entity) => entity.key !== "online") }] });
    expect(text(find(other, ".state"))).toBe("Printing");
  });

  it("shows the status itself where Home Assistant has no state for it", async () => {
    const hass = makeHass({ devices: x1c() });
    delete (hass.states as Record<string, unknown>)["sensor.x1c_print_status"];
    const card = await mountCard(hass, { printer: "dev-x1c" });
    expect(text(find(card, ".state"))).toBe("unknown");
    // Unknown is said in the muted text colour, not the disabled one.
    expect(find(card, ".state")?.classList.contains("tone-off")).toBe(true);
    expect(find(card, ".state svg path")?.getAttribute("d")).toBe(ICONS.infoOutline);
  });

  it("shows nothing to press while the printer has no control entities, and no note about the key", async () => {
    // The integration accepts only a key that may control: missing controls
    // are entities Home Assistant has not created (yet), not the key.
    const { card } = await cardFor("readOnly");
    expect(find(card, ".note")).toBeNull();
    expect(hasButton(card, "Pause print")).toBe(false);
    expect(hasButton(card, "Chamber light")).toBe(false);
    expect(findAll(card, ".temp-target")).toHaveLength(0);
    expect(findAll(card, ".fan").map((fan) => text(fan.querySelector(".fan-label.short")))).toEqual(["Hotend"]);
    const { card: idle } = await cardFor("readOnly", {}, { devices: readOnlyX1c({ status: "idle", plateClearNeeded: true }) });
    expect(find(idle, ".controls")).toBeNull();
    expect(findAll(idle, ".note")).toHaveLength(0);
    expect(hasButton(idle, "Plate cleared")).toBe(false);
    // Home Assistant cannot confirm it with this key: only BamBuddy can.
    expect(text(find(idle, ".callout"))).toBe("Take the print off the plate. BamBuddy starts the next queued print only once that is confirmed in BamBuddy.");
  });

  it("knows the key may control from any of its controls: the user may have disabled one", async () => {
    const [printer, ams] = x1c() as [FakeDevice, FakeDevice];
    const noPause = { ...printer, entities: printer.entities.filter((entity) => entity.key !== "pause") };
    const { card } = await cardFor("x1c", {}, { devices: [noPause, ams] });
    expect(cardText(card)).not.toContain("Controls need an API key");
    expect(hasButton(card, "Pause print")).toBe(false);
    expect(hasButton(card, "Stop print")).toBe(true);
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Control", "Filament"]);
    // Only the light left: still a key that may control.
    const onlyLight = { ...printer, entities: printer.entities.filter((entity) => !/^(button|select|number|fan|switch)\./.test(entity.entityId) || entity.key === "refresh_status") };
    const { card: light } = await cardFor("x1c", {}, { devices: [onlyLight, ams] });
    expect(hasButton(light, "Chamber light")).toBe(true);
    expect(cardText(light)).not.toContain("Controls need an API key");
  });

  it("puts the plate notice after the offline warning and its connection check", async () => {
    const { card: offline } = await withX1c({ online: false, plateClearNeeded: true });
    expect(find(offline, ".job")?.nextElementSibling?.classList.contains("offline-actions")).toBe(true);
    expect(find(offline, ".offline-actions")?.nextElementSibling?.classList.contains("callout")).toBe(true);
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
    // A stage without a name: the state line says the status, not "unknown".
    expect(text(find(card, ".state"))).toBe("Printing");
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

  it("switches the chamber light to the opposite of what it shows, never by a toggle", async () => {
    const { card, hass } = await cardFor("x1c");
    expect(button(card, "Chamber light").getAttribute("aria-pressed")).toBe("true");
    await press(card, "Chamber light");
    expect(hass.calls.at(-1)).toMatchObject({ domain: "light", service: "turn_off", data: { entity_id: "light.x1c_chamber_light" } });
    // The bulb shows the new state at once, before the light reports: a
    // second tap acts on what it shows -- back on.
    expect(button(card, "Chamber light").getAttribute("aria-pressed")).toBe("false");
    await press(card, "Chamber light");
    expect(hass.calls.at(-1)?.service).toBe("turn_on");
    expect(button(card, "Chamber light").getAttribute("aria-pressed")).toBe("true");
    // The first command's report does not end the second tap's wish ...
    await update(card, hass.withState("light.x1c_chamber_light", "off"));
    expect(button(card, "Chamber light").getAttribute("aria-pressed")).toBe("true");
    // ... the light reporting it does: what it says counts again.
    await update(card, hass.withState("light.x1c_chamber_light", "on"));
    await update(card, hass.withState("light.x1c_chamber_light", "off"));
    expect(button(card, "Chamber light").getAttribute("aria-pressed")).toBe("false");
    const { card: dark, hass: darkHass } = await cardFor("a1mini");
    expect(button(dark, "Chamber light").getAttribute("aria-pressed")).toBe("false");
    await press(dark, "Chamber light");
    expect(darkHass.calls.at(-1)).toMatchObject({ domain: "light", service: "turn_on", data: { entity_id: "light.a1_mini_chamber_light" } });
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

  it("says at once that a print of one object can only be stopped", async () => {
    const { card } = await cardFor("x1c", {}, { callService: answering([{ id: 11, name: "Lamp shade", skipped: false }]) });
    await press(card, "Skip objects");
    expect(find(card, "dialog .obj input")).toBeNull();
    expect(text(find(card, "dialog"))).toContain("This print has only one object. To leave it out, stop the print.");
    // Nothing to choose: one way out, and a note, not a warning.
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);
    expect(find(card, "dialog .dlg-warn.info .icon path")?.getAttribute("d")).toBe(ICONS.info);
    expect(styleText()).toMatch(/\.dlg-warn\.info \.icon\s*\{\s*color: var\(--bb-accent\);/);
  });

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
    expect(actions().map(text)).toEqual(["Cancel", "Skip objects"]);
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
    const { card: german } = await cardFor("x1c", {}, {
      language: "de",
      callService: answering([
        { id: 1, name: "Benchy", skipped: false },
        { id: 2, name: "Clip", skipped: false },
      ]),
    });
    await press(german, "Objekte überspringen");
    for (const box of findAll<HTMLInputElement>(german, "dialog .obj input")) {
      box.click();
      await german.updateComplete;
    }
    expect(text(find(german, "dialog .dlg-warn"))).toBe("Um alle Objekte zu überspringen, stoppe stattdessen den Druck.");
    expect(findAll<HTMLButtonElement>(german, "dialog .dlg-actions .btn")[1]?.disabled).toBe(true);
  });

  it("skips nothing with the safe choice", async () => {
    const { card, hass } = await cardFor("h2d", {}, { callService: answering() });
    await press(card, "Skip objects");
    findAll<HTMLInputElement>(card, "dialog .obj input")[0]?.click();
    await press(card, "Cancel");
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
    await press(card, "Cancel");
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
    await press(card, "Cancel");
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
    expect(text(find(card, "dialog .dlg-warn"))).toBe("Übersprungene Objekte werden in diesem Druck nicht mehr gedruckt. Das lässt sich nicht rückgängig machen.");
    expect(findAll(card, "dialog .obj").map(text)).toEqual(["Benchy", "Calibration cube Übersprungen", "Objekt 13", "Clip"]);
    const boxes = findAll<HTMLInputElement>(card, "dialog .obj input");
    boxes[0]?.click();
    await card.updateComplete;
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Abbrechen", "1 Objekt überspringen"]);
    boxes[2]?.click();
    await card.updateComplete;
    expect(text(findAll(card, "dialog .dlg-actions .btn")[1])).toBe("2 Objekte überspringen");
  });
});

describe("a printer whose developer mode is off", () => {
  const HINT =
    "The printer takes no commands: its developer LAN mode is off. Turn it on at the printer's screen under Settings → Network (or WLAN): first “LAN Only Mode”, then “Developer Mode”. Then enter the new access code in BamBuddy.";

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
    expect(text(find(card, ".note.warning"))).toBe(
      "Der Drucker nimmt keine Befehle an: Sein Entwicklermodus (LAN) ist aus. Schalte ihn am Display des Druckers unter Einstellungen → Netzwerk (oder WLAN) ein: erst „LAN Only Mode“, dann „Developer Mode“. Trage danach den neuen Zugangscode in BamBuddy ein.",
    );
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
    const { card: plain } = await withX1c({ developerMode: "off" }, { read_only: true });
    expect(cardText(plain)).not.toContain(HINT);
  });
});

describe("the live view", () => {
  const visibility = pageState;

  afterEach(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("starts on a tap on the picture and stops when closed", async () => {
    const { card, hass } = await cardFor("x1c");
    expect(find(card, "img.stream")).toBeNull();
    button(card, "Live view").click();
    await card.updateComplete;
    const stream = find<HTMLImageElement>(card, "img.stream");
    expect(stream?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=30");
    expect(hasButton(card, "Live view")).toBe(false);
    // The running stream keeps its address when the token rotates.
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "rotated", frame_rate: 30 }));
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=30");
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

  it("tries again with the camera's token of that moment", async () => {
    const { card, hass } = await cardFor("x1c");
    button(card, "Live view").click();
    await card.updateComplete;
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    // Minutes later Home Assistant has rotated the token twice: the old one is refused.
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "rotated-twice", frame_rate: 30 }));
    await press(card, "Try again");
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=rotated-twice&fps=30");
  });

  it("ends a stream that a state ends, so that the browser stops loading it", async () => {
    const { card, hass } = await cardFor("x1c", { camera: "always" });
    const stream = find<HTMLImageElement>(card, "img.stream");
    expect(stream?.hasAttribute("src")).toBe(true);
    await update(card, hass.withState("camera.x1c_camera", "unavailable", {}));
    expect(find(card, "img.stream")).toBeNull();
    expect(stream?.hasAttribute("src")).toBe(false);
  });

  it("starts anew, not with the browser's finished picture, when the camera comes back", async () => {
    const { card, hass } = await cardFor("x1c", { camera: "always" });
    const first = find<HTMLImageElement>(card, "img.stream")?.getAttribute("src");
    await update(card, hass.withState("camera.x1c_camera", "unavailable", {}));
    expect(find(card, "img.stream")).toBeNull();
    // The same token, the same rate: the same address would show the
    // picture the browser kept of the ended stream, and ask for nothing.
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "token-x1c", frame_rate: 30 }));
    const again = find<HTMLImageElement>(card, "img.stream")?.getAttribute("src");
    expect(again).not.toBe(first);
    expect(again).toBe(`${first}&run=1`);
    // And once more: never an address the page loaded before.
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    button(card, "Try again").click();
    await card.updateComplete;
    expect(find(card, "img.stream")?.getAttribute("src")).toBe(`${first}&run=2`);
  });

  it("ends the old printer's stream when the card is set to another", async () => {
    const hass = makeHass({ devices: [...x1c(), ...h2d()] });
    const card = await mountCard(hass, { printer: "dev-x1c", camera: "always" });
    expect(find(card, "img.stream")?.getAttribute("src")).toContain("camera.x1c_camera");
    card.setConfig({ type: "custom:bambuddy-printer-card", printer: "dev-h2d", camera: "always" });
    await settle(card);
    expect(find(card, "img.stream")?.getAttribute("src") ?? "").not.toContain("camera.x1c_camera");
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

  it("stops a moment after the card leaves the page, and starts again with camera: always", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { card } = await cardFor("x1c", { camera: "always" });
    const stream = find<HTMLImageElement>(card, "img.stream");
    card.remove();
    // A dashboard may put it back at once (a masonry view laying out anew).
    expect(stream?.hasAttribute("src")).toBe(true);
    await vi.advanceTimersByTimeAsync(2100);
    expect(stream?.hasAttribute("src")).toBe(false);
    document.body.append(card);
    await card.updateComplete;
    expect(find(card, "img.stream")).not.toBeNull();
    const { card: tapped } = await cardFor("x1c");
    button(tapped, "Live view").click();
    await tapped.updateComplete;
    tapped.remove();
    await vi.advanceTimersByTimeAsync(2100);
    document.body.append(tapped);
    await tapped.updateComplete;
    expect(find(tapped, "img.stream")).toBeNull();
    vi.useRealTimers();
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

  it("names its frame rate, and offers to change it where the camera gives more", async () => {
    const { card } = await cardFor("x1c", { camera: "always" });
    expect(text(find(card, ".live-fps"))).toBe("30 fps");
    expect(find(card, ".live-fps")?.getAttribute("aria-label")).toBe("30 frames a second");
    expect(hasButton(card, "Set the frame rate")).toBe(true);
    // A camera that gives only 5: its rate, nothing to set.
    const a1 = await cardFor("a1mini", { camera: "always" });
    expect(text(find(a1.card, ".live-fps"))).toBe("5 fps");
    expect(hasButton(a1.card, "Set the frame rate")).toBe(false);
    // A view-only card sets nothing.
    const viewOnly = await cardFor("x1c", { camera: "always", read_only: true });
    expect(text(find(viewOnly.card, ".live-fps"))).toBe("30 fps");
    expect(hasButton(viewOnly.card, "Set the frame rate")).toBe(false);
  });

  it("sets the frame rate in steps of 5 between 5 and the camera's most", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("x1c", { camera: "always" });
    button(card, "Set the frame rate").click();
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Camera frame rate");
    expect(find(card, "dialog output.step-value")?.getAttribute("aria-live")).toBe("polite");
    expect(text(find(card, "dialog .step-value [aria-hidden]"))).toBe("30 fps");
    expect(text(find(card, "dialog .step-value .sr-only"))).toBe("30 frames a second");
    expect(button(card, "5 more frames a second").disabled).toBe(true);
    expect(text(find(card, "dialog .hint"))).toContain("This camera gives up to 30 frames a second; you can set 5 to 30 in steps of 5.");
    for (let tap = 0; tap < 6; tap++) {
      button(card, "5 fewer frames a second").click();
      await vi.advanceTimersByTimeAsync(0);
      await card.updateComplete;
    }
    // Five taps reach 5; the sixth finds the button off -- and the focus
    // stays in the stepper, on its other end.
    expect(text(find(card, "dialog .step-value [aria-hidden]"))).toBe("5 fps");
    expect(button(card, "5 fewer frames a second").disabled).toBe(true);
    expect(hass.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls).toEqual([{ domain: "number", service: "set_value", data: { entity_id: "number.x1c_camera_frame_rate", value: 5 }, notifyOnError: false }]);
    vi.useRealTimers();
  });

  it("goes back up a step, and reads a number without its limits as 5 to its value", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("x1c", { camera: "always" });
    const tap = async (name: string): Promise<void> => {
      button(card, name).click();
      await vi.advanceTimersByTimeAsync(0);
      await card.updateComplete;
    };
    await tap("Set the frame rate");
    await tap("5 fewer frames a second");
    await tap("5 more frames a second");
    expect(text(find(card, "dialog .step-value [aria-hidden]"))).toBe("30 fps");
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "number.x1c_camera_frame_rate", value: 30 });
    vi.useRealTimers();
    // Limits missing (no state attributes): from 5, the most its value.
    const other = await cardFor("x1c", { camera: "always" });
    await update(other.card, other.hass.withState("number.x1c_camera_frame_rate", "20", {}));
    await press(other.card, "Set the frame rate");
    expect(text(find(other.card, "dialog .step-value [aria-hidden]"))).toBe("20 fps");
    expect(button(other.card, "5 more frames a second").disabled).toBe(true);
    expect(button(other.card, "5 fewer frames a second").disabled).toBe(false);
  });

  it("asks for no rate where the camera names none", async () => {
    const { card, hass } = await cardFor("x1c");
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "token-x1c" }));
    button(card, "Live view").click();
    await card.updateComplete;
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c");
    expect(find(card, ".live-fps")).toBeNull();
  });

  it("keeps the keyboard in the stepper at its ends", async () => {
    const { card } = await cardFor("x1c", { camera: "always" });
    await press(card, "Set the frame rate");
    const more = button(card, "5 more frames a second");
    const fewer = button(card, "5 fewer frames a second");
    // At 30, + is off: tapping − to 25 and + back to 30 ends on +.
    fewer.focus();
    keyPress(fewer);
    fewer.click();
    await card.updateComplete;
    more.focus();
    keyPress(more);
    more.click();
    await card.updateComplete;
    await card.updateComplete;
    expect(more.disabled).toBe(true);
    expect(card.shadowRoot?.activeElement).toBe(fewer);
  });

  it("says what arrives in the chip; the dialog only sets the rate and says when it applies", async () => {
    const { card, hass } = await cardFor("x1c", { camera: "always" });
    const camera = hass.states["camera.x1c_camera"]?.attributes ?? {};
    // Someone else watches on BamBuddy's own page, at 8.
    await update(card, hass.withState("camera.x1c_camera", "idle", { ...camera, streamed_frame_rate: 8 }));
    expect(text(find(card, ".live-fps"))).toBe("8 fps");
    expect(find(card, ".live-fps")?.getAttribute("aria-label")).toBe("8 frames a second");
    await press(card, "Set the frame rate");
    expect(text(find(card, "dialog .hint"))).toBe(
      "This camera gives up to 30 frames a second; you can set 5 to 30 in steps of 5. It applies to this printer throughout Home Assistant – on every dashboard, phone and computer. While someone else watches – on BamBuddy's own page, say – BamBuddy may stay at their rate: yours applies from the next time the live view opens while nobody else watches. The chip in the live view shows what arrives.",
    );
    expect(find(card, "dialog .dlg-note")).toBeNull();
    // Minus, the rate and plus in the middle of the dialog; the text stays left.
    expect(find(card, "dialog .stepper")?.classList.contains("centered")).toBe(true);
    expect(hasButton(card, "Restart the live view")).toBe(false);
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=30");
    const { card: german } = await cardFor("x1c", { camera: "always" }, { language: "de" });
    await press(german, "Bildrate einstellen");
    expect(text(find(german, "dialog .hint"))).toBe(
      "Diese Kamera schafft bis zu 30 Bilder pro Sekunde; einstellbar sind 5 bis 30 in Schritten von 5. Die Bildrate gilt für diesen Drucker in ganz Home Assistant – in jedem Dashboard und auf jedem Handy oder Computer. Schaut gerade jemand anderes zu, etwa in BamBuddy selbst, kann BamBuddy bei dessen Bildrate bleiben – deine gilt dann ab dem nächsten Öffnen des Livebilds, wenn sonst niemand zuschaut. Der Chip im Livebild zeigt, was ankommt.",
    );
  });

  it("says a slow chamber image in tenths, in the user's language", async () => {
    // The A1's chamber image sends a frame every two seconds or so.
    const { card: german, hass: de } = await cardFor("a1mini", { camera: "always" }, { language: "de" });
    const camera = de.states["camera.a1_mini_camera"]?.attributes ?? {};
    await update(german, de.withState("camera.a1_mini_camera", "idle", { ...camera, streamed_frame_rate: 0.5 }));
    expect(text(find(german, ".live-fps"))).toBe("0,5 fps");
    expect(find(german, ".live-fps")?.getAttribute("aria-label")).toBe("0,5 Bilder pro Sekunde");
    const { card, hass } = await cardFor("a1mini", { camera: "always" });
    await update(card, hass.withState("camera.a1_mini_camera", "idle", { ...camera, streamed_frame_rate: 0.5 }));
    expect(text(find(card, ".live-fps"))).toBe("0.5 fps");
  });

  it("starts the stream anew at a new frame rate", async () => {
    const { card, hass } = await cardFor("x1c", { camera: "always" });
    const stream = find<HTMLImageElement>(card, "img.stream");
    expect(stream?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=30");
    const camera = hass.states["camera.x1c_camera"]?.attributes ?? {};
    await update(card, hass.withState("camera.x1c_camera", "idle", { ...camera, frame_rate: 15 }));
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=15");
    expect(text(find(card, ".live-fps"))).toBe("15 fps");
    // Anything else leaves the running stream alone.
    const now = hass.withState("camera.x1c_camera", "idle", { ...camera, frame_rate: 15, access_token: "rotated" });
    await update(card, now);
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=15");
  });

  it("can be started from the control view too", async () => {
    const { card } = await cardFor("a1mini");
    await showView(card, "Control");
    button(card, "Live view").click();
    await card.updateComplete;
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.a1_mini_camera?token=token-a1_mini&fps=5");
    expect(hasButton(card, "Live view")).toBe(false);
  });

  it("keeps the keyboard's place: on its close button once open, on the button that opens it once closed", async () => {
    const { card } = await cardFor("x1c");
    button(card, "Live view").focus();
    button(card, "Live view").click();
    await settle(card);
    expect(root(card).activeElement).toBe(button(card, "Close the live view"));
    button(card, "Close the live view").click();
    await settle(card);
    expect(root(card).activeElement).toBe(button(card, "Live view"));
    expect(root(card).activeElement?.classList.contains("picture")).toBe(true);
    await showView(card, "Control");
    button(card, "Live view").click();
    await settle(card);
    button(card, "Close the live view").click();
    await settle(card);
    expect(root(card).activeElement).toBe(button(card, "Live view"));
    expect(root(card).activeElement?.closest(".step-row")).not.toBeNull();
    // Closed from a view without a camera button: the selected tab.
    button(card, "Live view").click();
    await settle(card);
    await showView(card, "Filament");
    button(card, "Close the live view").click();
    await settle(card);
    expect(find(card, ".live")).toBeNull();
    expect(root(card).activeElement).toBe(find(card, '[role=tab][aria-selected="true"]'));
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

  it("tie the view to its tab, and go to the first and the last tab with Home and End", async () => {
    const { card } = await cardFor("x1c");
    const tabs = (): HTMLElement[] => findAll(card, "[role=tab]");
    const panel = (): HTMLElement | null => find(card, ".body");
    const keyOnTabs = async (name: string): Promise<void> => {
      find(card, ".tabs")?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
      await card.updateComplete;
      await card.updateComplete;
    };
    expect(panel()?.getAttribute("role")).toBe("tabpanel");
    expect(panel()?.id).not.toBe("");
    expect(tabs().map((tab) => tab.getAttribute("aria-controls"))).toEqual([panel()?.id, panel()?.id, panel()?.id]);
    expect(new Set(tabs().map((tab) => tab.id)).size).toBe(3);
    expect(panel()?.getAttribute("aria-labelledby")).toBe(tabs()[0]?.id);
    await keyOnTabs("End");
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Filament");
    expect(root(card).activeElement).toBe(tabs()[2]);
    expect(panel()?.getAttribute("aria-labelledby")).toBe(tabs()[2]?.id);
    await keyOnTabs("Home");
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Status");
    expect(root(card).activeElement).toBe(tabs()[0]);
    // One view: no tabs, and no tab panel.
    const { card: single } = await cardFor("x1c", { show_control_tab: false, show_filament_tab: false });
    expect(find(single, ".body")?.hasAttribute("role")).toBe(false);
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

describe("the groups of choices: speed, active nozzle, step", () => {
  /** A key pressed on the card's focused element. */
  const key = (card: FakeCard, name: string): void => {
    root(card).activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, composed: true }));
  };

  it("stop the tab key at the chosen option, and move the focus by the arrow keys without choosing", async () => {
    const { card, hass } = await cardFor("x1c");
    const speeds = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".speed [role=radio]");
    const focused = (): number => speeds().indexOf(root(card).activeElement as HTMLButtonElement);
    expect(speeds().map((item) => item.getAttribute("tabindex"))).toEqual(["-1", "0", "-1", "-1"]);
    speeds()[1]?.focus();
    const moves: [string, number][] = [
      ["ArrowRight", 2],
      ["ArrowDown", 3],
      ["ArrowRight", 0],
      ["ArrowLeft", 3],
      ["ArrowUp", 2],
      ["Home", 0],
      ["End", 3],
      ["a", 3],
    ];
    for (const [name, index] of moves) {
      key(card, name);
      expect(focused(), name).toBe(index);
    }
    // Moving chooses nothing: a choice sends a command.
    expect(hass.calls).toEqual([]);
    expect(speeds().map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "true", "false", "false"]);
    // Space or Enter -- a click -- chooses.
    key(card, "ArrowLeft");
    speeds()[2]?.click();
    await settle(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "select.x1c_print_speed", option: "sport" });
  });

  it("move the tab key's stop with the focus, and give it back to the chosen option once the focus leaves the group", async () => {
    const { card } = await cardFor("x1c");
    const speeds = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".speed [role=radio]");
    const stops = (): (string | null)[] => speeds().map((item) => item.getAttribute("tabindex"));
    speeds()[1]?.focus();
    key(card, "ArrowLeft");
    // Tab leaves the group from where the focus is: that is the only stop.
    expect(stops()).toEqual(["0", "-1", "-1", "-1"]);
    // Within the group the stop stays where the focus went.
    speeds()[0]?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: speeds()[3] ?? null }));
    expect(stops()).toEqual(["0", "-1", "-1", "-1"]);
    // Out of the group: back on the chosen option, where Tab comes in again.
    speeds()[0]?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: null }));
    expect(stops()).toEqual(["-1", "0", "-1", "-1"]);
  });

  it("work alike for the active nozzle and the step; the first option is the stop where none is chosen", async () => {
    const { card, hass } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [] }) });
    await showView(card, "Control");
    const sides = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".nozzle-row [role=radio]");
    const steps = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".step-row [role=radio]");
    expect(sides().map((item) => item.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    expect(steps().map((item) => item.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    sides()[0]?.focus();
    key(card, "ArrowRight");
    expect(root(card).activeElement).toBe(sides()[1]);
    steps()[1]?.focus();
    key(card, "End");
    await card.updateComplete;
    expect(root(card).activeElement).toBe(steps()[2]);
    expect(steps().map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(steps().map((item) => item.getAttribute("tabindex"))).toEqual(["-1", "-1", "0"]);
    steps()[2]?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: null }));
    expect(steps().map((item) => item.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(hass.calls).toEqual([]);
    await update(card, hass.withState("select.h2d_active_nozzle", "standby", { options: ["left", "right"] }));
    expect(sides().map((item) => item.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    await update(card, hass.withState("select.h2d_active_nozzle", "right", { options: ["left", "right"] }));
    expect(sides().map((item) => item.getAttribute("tabindex"))).toEqual(["-1", "0"]);
  });
});

describe("the control view", () => {
  it("says how to move safely, in words a beginner knows", async () => {
    const { card } = await cardFor("a1mini", { start_view: "control" });
    expect(text(find(card, ".control + .hint, .hint:last-child"))).toBe(
      "Tap the house first so the printer knows where it is. It does not stop at the edges – move in small steps.",
    );
    const { card: german } = await cardFor("a1mini", { start_view: "control" }, { language: "de" });
    expect(findAll(german, ".hint").map(text)).toContain("Tippe zuerst auf das Haus, damit der Drucker seine Position kennt. Er stoppt nicht am Rand – fahre in kleinen Schritten.");
  });

  it("names Z by what moves: the nozzle on the A series, the bed elsewhere", async () => {
    const column = (card: FakeCard): [string, string | null | undefined][] =>
      findAll(card, ".axis-col.bed .btn").map((item) => [item.getAttribute("aria-label") ?? "", item.querySelector(".icon path")?.getAttribute("d")]);
    const { card: a1 } = await cardFor("a1mini");
    await showView(a1, "Control");
    expect(text(find(a1, ".axis-col.bed .axis-label"))).toBe("Nozzle height");
    // Up on top: the nozzle rises away from the bed.
    expect(column(a1)).toEqual([
      ["Move the nozzle 1 mm away from the bed", ICONS.up],
      ["Move the nozzle 1 mm closer to the bed", ICONS.down],
    ]);
    const { card: x1 } = await cardFor("x1c", {}, { devices: x1c({ status: "idle", stage: "idle", progress: 0 }) });
    await showView(x1, "Control");
    expect(text(find(x1, ".axis-col.bed .axis-label"))).toBe("Bed");
    expect(column(x1)).toEqual([
      ["Move the bed 1 mm closer to the nozzle", ICONS.up],
      ["Move the bed 1 mm away from the nozzle", ICONS.down],
    ]);
  });

  it("moves the axes by 1 mm unless 0.1 or 10 mm is chosen", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    // 0.1 mm too, for the bed's fine steps.
    expect(findAll(card, ".step-row [role=radio]").map((item) => `${text(item)}: ${item.getAttribute("aria-checked")}`)).toEqual([
      "0.1 mm: false",
      "1 mm: true",
      "10 mm: false",
    ]);
    const moves: [string, Record<string, unknown>][] = [
      ["Move Y by +1 mm", { axis: "y", distance: 1 }],
      ["Move X by −1 mm", { axis: "x", distance: -1 }],
      ["Move X by +1 mm", { axis: "x", distance: 1 }],
      ["Move Y by −1 mm", { axis: "y", distance: -1 }],
      ["Move the nozzle 1 mm closer to the bed", { axis: "z", distance: -1 }],
      ["Move the nozzle 1 mm away from the bed", { axis: "z", distance: 1 }],
    ];
    for (const [name, data] of moves) {
      await press(card, name);
      expect(hass.calls.at(-1), name).toEqual({ domain: "bambuddy", service: "move_axis", data: { device_id: "dev-a1mini", ...data }, notifyOnError: false });
    }
    await press(card, "0.1 mm");
    await press(card, "Move the nozzle 0.1 mm closer to the bed");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", axis: "z", distance: -0.1 });
    await press(card, "Move Y by +0.1 mm");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", axis: "y", distance: 0.1 });
    await press(card, "10 mm");
    expect(findAll(card, ".step-row [role=radio]").map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
    await press(card, "Move X by +10 mm");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", axis: "x", distance: 10 });
    await press(card, "Move the nozzle 10 mm closer to the bed");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", axis: "z", distance: -10 });
  });

  it("locks the step choice while a print runs or is paused, not the camera", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await press(card, "10 mm");
    const steps = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".step-row [role=radio]");
    expect(steps().map((item) => item.disabled)).toEqual([false, false, false]);
    for (const status of ["printing", "paused"]) {
      await update(card, hass.withState("sensor.a1_mini_print_status", status));
      expect(steps().map((item) => item.disabled), status).toEqual([true, true, true]);
      // The chosen step stays marked.
      expect(steps().map((item) => item.getAttribute("aria-checked")), status).toEqual(["false", "false", "true"]);
      const camera = find<HTMLButtonElement>(card, ".btn.live-btn");
      expect(camera, status).not.toBeNull();
      expect(camera?.disabled, status).toBe(false);
    }
    await update(card, hass.withState("sensor.a1_mini_print_status", "idle"));
    expect(steps().map((item) => item.disabled)).toEqual([false, false, false]);
    // Drawn as the arrows are while locked.
    expect(styleText()).toMatch(/\.step-row \.seg button:disabled\s*\{[^}]*opacity: 0\.4;/);
    // It applies again afterwards.
    await press(card, "Move X by +10 mm");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", axis: "x", distance: 10 });
  });

  it("keeps the step chosen as the tab stop after a lock the focus left", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await press(card, "10 mm");
    const steps = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".step-row [role=radio]");
    steps()[2]?.focus();
    await update(card, hass.withState("sensor.a1_mini_print_status", "printing"));
    // The focus leaves the locked group, then the print ends.
    find(card, ".step-row .seg")?.dispatchEvent(new FocusEvent("focusout", { relatedTarget: null }));
    await update(card, hass.withState("sensor.a1_mini_print_status", "idle"));
    expect(steps().map((item) => item.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("asks before it homes the axes", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    expect(button(card, "Home all axes").classList.contains("primary")).toBe(true);
    await press(card, "Home all axes");
    expect(text(find(card, "dialog h2"))).toBe("Home all axes?");
    expect(text(find(card, "dialog p"))).toBe("The toolhead moves to its home position; remove anything from the plate first.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Cancel", "Home"]);
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
    expect(button(card, "Home all axes").classList.contains("primary")).toBe(false);
    // A hot nozzle changes nothing: the reason stays the print.
    expect(findAll(card, ".note")).toHaveLength(1);
    expect(hass.calls).toEqual([]);
  });

  it("says the printer is offline as the status tab does; the preview shows it as an example, not to be tapped", async () => {
    const { card } = await cardFor("p1s");
    await showView(card, "Control");
    expect(find(card, ".pad")).toBeNull();
    expect(text(find(card, ".job .job-info"))).toBe("The printer is offline. Check that it is switched on and connected to BamBuddy.");
    const preview = await previewOf("p1s", { start_view: "control" });
    expect(find(preview, ".sample-body[inert] .pad")).not.toBeNull();
  });

  it("is not there while the printer has no control entities", async () => {
    const { card } = await cardFor("readOnly");
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Filament"]);
    await expect(showView(card, "Control")).rejects.toThrowError(/no tab "Control"/);
    expect(find(card, ".note")).toBeNull();
    expect(find(card, ".pad")).toBeNull();
  });
});

describe("an AMS unit's model chip", () => {
  it("is left out where the unit's name is its model", () => {
    const lite = { name: "AMS Lite", model: "AMS Lite" } as AmsRefs;
    const ams = { name: "AMS A", model: "AMS" } as AmsRefs;
    expect(unitModel([ams, lite], lite)).toBeUndefined();
    expect(unitModel([ams, lite], ams)).toBe("AMS");
  });
});

describe("the fans", () => {
  it("leave out a fan Home Assistant only restored: the integration no longer creates it", async () => {
    const { card, hass } = await withX1c({}, { status_blocks: ["fans"] });
    const before = findAll(card, ".fans .fan").length;
    const fan = Object.keys(hass.states).find((entityId) => entityId.startsWith("fan.") && entityId.includes("chamber")) as string;
    await update(card, hass.withState(fan, "unavailable", { restored: true, friendly_name: "Chamber fan" }));
    expect(findAll(card, ".fans .fan")).toHaveLength(before - 1);
  });
});

describe("the heating section", () => {
  it("marks the row of a heater that is on, from the tap on", async () => {
    vi.useFakeTimers();
    const { card } = await withX1c({ status: "idle", stage: "idle", progress: 0, nozzles: [[30, 0]], bed: [31, 40] });
    await showView(card, "Control");
    expect(findAll(card, ".heat-name.on .heat-text").map(text)).toEqual(["Bed"]);
    // With the target it shows, before the printer reports it.
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
    expect(findAll(card, ".heat-name.on .heat-text").map(text)).toEqual(["Nozzle", "Bed"]);
  });

  /** A tap while every timer is fake: the card's own updates still run. */
  async function tap(card: FakeCard, name: string): Promise<void> {
    button(card, name).click();
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  }
  const targets = (card: FakeCard): string[] => findAll(card, ".heat-target").map(shownText);
  const setValue = (entityId: string, value: number) => ({ domain: "number", service: "set_value", data: { entity_id: entityId, value }, notifyOnError: false });
  const NOZZLE = "number.a1_mini_nozzle_target_temperature";

  it("keeps the keyboard in the section when a press disables its own button", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await update(card, hass.withState(NOZZLE, "5"));
    button(card, `Nozzle 5${NBSP}°C cooler`).focus();
    keyPress(button(card, `Nozzle 5${NBSP}°C cooler`));
    await tap(card, `Nozzle 5${NBSP}°C cooler`);
    expect(root(card).activeElement).toBe(button(card, `Nozzle: heat to 220${NBSP}°C`));

    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
    button(card, "Nozzle: turn off").focus();
    keyPress(button(card, "Nozzle: turn off"));
    await tap(card, "Nozzle: turn off");
    // The power symbol stays usable: it heats now, and keeps the focus.
    const power = root(card).activeElement;
    expect([power?.classList.contains("heat-off"), power?.getAttribute("aria-label")]).toEqual([true, `Nozzle: heat to 220${NBSP}°C`]);
  });

  it("takes no focus back once it went elsewhere, nor a mouse's", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await update(card, hass.withState(NOZZLE, "5"));
    // The keyboard was on "-", then moved on to a field elsewhere on the page.
    button(card, `Nozzle 5${NBSP}°C cooler`).focus();
    keyPress(button(card, `Nozzle 5${NBSP}°C cooler`));
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    await update(card, hass.withState(NOZZLE, "0"));
    expect(document.activeElement).toBe(field);
    // A mouse: no key in the card.
    const { card: mouse, hass: other } = await cardFor("a1mini");
    await showView(mouse, "Control");
    await update(mouse, other.withState(NOZZLE, "5"));
    vi.advanceTimersByTime(20_000);
    button(mouse, `Nozzle 5${NBSP}°C cooler`).focus();
    await update(mouse, other.withState(NOZZLE, "0"));
    expect(root(mouse).activeElement).not.toBe(button(mouse, `Nozzle: heat to 220${NBSP}°C`));
  });

  it("keeps the keyboard's place inside Home Assistant's shadow roots too", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    // In a dashboard the page's focus is the outermost host, not the card.
    const host = document.createElement("div");
    document.body.append(host);
    host.attachShadow({ mode: "open" }).append(card);
    await showView(card, "Control");
    await update(card, hass.withState(NOZZLE, "5"));
    button(card, `Nozzle 5${NBSP}°C cooler`).focus();
    keyPress(button(card, `Nozzle 5${NBSP}°C cooler`));
    await tap(card, `Nozzle 5${NBSP}°C cooler`);
    expect(root(card).activeElement).toBe(button(card, `Nozzle: heat to 220${NBSP}°C`));
  });

  it("leaves the focus where the keyboard moved it on inside the card", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await update(card, hass.withState(NOZZLE, "5"));
    button(card, `Nozzle 5${NBSP}°C cooler`).focus();
    keyPress(button(card, `Nozzle 5${NBSP}°C cooler`));
    const status = button(card, "Status");
    status.focus();
    await update(card, hass.withState(NOZZLE, "0"));
    expect(root(card).activeElement).toBe(status);
  });

  it("keeps no place for a card taken off the page", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await update(card, hass.withState(NOZZLE, "5"));
    button(card, `Nozzle 5${NBSP}°C cooler`).focus();
    keyPress(button(card, `Nozzle 5${NBSP}°C cooler`));
    card.remove();
    // A late redraw of the removed card (a toast's timer) must not reach into a page it left.
    const focused = vi.spyOn(HTMLElement.prototype, "focus");
    await update(card, hass.withState(NOZZLE, "0"));
    expect(focused).not.toHaveBeenCalled();
  });

  it("preheats with one tap and sends a few taps as one target", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    expect(findAll(card, ".heat-row").map((row) => text(row.querySelector(".heat-label")))).toEqual(["Nozzle", "Bed"]);
    expect(targets(card)).toEqual(["Off", "Off"]);
    expect(findAll(card, ".heat-now").map(text)).toEqual([`Now 27${NBSP}°C`, `Now 25${NBSP}°C`]);
    // Nothing switches every heater off at once: each has its own power symbol.
    expect(hasButton(card, "Heating off")).toBe(false);
    // Off, their power symbols switch them on, as + does.
    expect(findAll<HTMLButtonElement>(card, ".heat-row .heat-off").map((item) => [item.getAttribute("aria-label"), item.disabled])).toEqual([
      [`Nozzle: heat to 220${NBSP}°C`, false],
      [`Bed: heat to 55${NBSP}°C`, false],
    ]);
    expect(button(card, `Nozzle 5${NBSP}°C cooler`).disabled).toBe(true);
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
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
    expect(hasButton(card, `Nozzle: heat to 210${NBSP}°C`)).toBe(true);
    await update(card, hass.withState("sensor.a1_mini_active_filament", "PLA Basic", { nozzle_temp_min: 230, nozzle_temp_max: 190 }));
    expect(hasButton(card, `Nozzle: heat to 220${NBSP}°C`)).toBe(true);
    // Never above what the number allows.
    await update(card, hass.withState(NOZZLE, "0", { max: 200 }));
    expect(hasButton(card, `Nozzle: heat to 200${NBSP}°C`)).toBe(true);
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

  it("turns a heater off only without a print", async () => {
    const { card, hass } = await withX1c({ status: "idle", nozzles: [[200, 220]], bed: [50, 55] });
    await showView(card, "Control");
    await press(card, "Nozzle: turn off");
    expect(hass.calls).toEqual([setValue("number.x1c_nozzle_target_temperature", 0)]);
    expect(targets(card)).toEqual(["Off", `55${NBSP}°C`]);
    // While printing: the steppers stay, an off would end the print.
    const { card: printing } = await cardFor("x1c");
    await showView(printing, "Control");
    expect(findAll(printing, ".heat-off")).toHaveLength(0);
    expect(button(printing, `Nozzle 5${NBSP}°C hotter`).disabled).toBe(false);
  });

  it("offers Off for the chamber during a print: turning it off ends none", async () => {
    const { card } = await cardFor("h2d", { start_view: "control" });
    const offs = findAll<HTMLButtonElement>(card, ".heat-off");
    expect(offs.map((item) => item.getAttribute("aria-label"))).toEqual(["Chamber: turn off"]);
    expect(offs[0]?.disabled).toBe(false);
    expect(hasButton(card, "Heating off")).toBe(false);
  });

  it("shows unknown values in the offline preview's example, and is left out without targets", async () => {
    const card = await previewOf("p1s", { start_view: "control" });
    expect(find(card, ".sample-body[inert] .heating")).not.toBeNull();
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
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(800);
    await card.updateComplete;
    expect(text(find(card, ".toast"))).toBe("Printer offline");
    // Its × says what it closes.
    expect(find(card, ".toast .icon-btn")?.getAttribute("aria-label")).toBe("Dismiss the error");
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
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
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
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
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
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
    card.remove();
    await vi.advanceTimersByTimeAsync(0);
    expect(hass.calls).toEqual([setValue(NOZZLE, 220)]);
  });

  it("sends a heater's next target after its previous one went through", async () => {
    vi.useFakeTimers();
    let finish: () => void = () => undefined;
    const { card, hass } = await cardFor("a1mini", {}, { callService: () => new Promise<void>((resolve) => (finish = resolve)) });
    await showView(card, "Control");
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
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
    expect(hasButton(card, "Heizen aus")).toBe(false);
    expect(hasButton(card, `Düse auf 220${NBSP}°C heizen`)).toBe(true);
    // Off, the power symbols heat, as + does.
    expect(findAll(card, ".heat-row .heat-off").map((item) => item.getAttribute("aria-label"))).toEqual([`Düse auf 220${NBSP}°C heizen`, `Bett auf 55${NBSP}°C heizen`]);
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
      "On: the printer pauses the print when the detection triggers. Sensitivity as set on the printer. A detection switched off stays off for later prints too.",
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
    // One is off: said, not warned -- switching one off is a choice.
    expect(find(card, ".det-summary")?.classList.contains("warn")).toBe(false);
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
    expect(find(none, ".det-summary")?.classList.contains("warn")).toBe(false);
    const { card: german } = await cardFor("x1c", {}, { language: "de" });
    await showView(german, "Steuerung");
    expect(text(head(german))).toBe("Druckoptionen 1 aus");
    const { card: germanAll } = await cardFor("x1c", {}, { language: "de", devices: x1c({ detectors: [{ key: "ai_monitoring", on: true }] }) });
    await showView(germanAll, "Steuerung");
    // One detection: its own state.
    expect(text(find(germanAll, ".det-summary"))).toBe("An");
    const { card: germanNone } = await cardFor("x1c", {}, { language: "de", devices: x1c({ detectors: [{ key: "ai_monitoring", on: false }] }) });
    await showView(germanNone, "Steuerung");
    expect(text(find(germanNone, ".det-summary"))).toBe("Aus");
  });

  it("counts only the switches with a state", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Control");
    await update(card, hass.withState(PLATE, "unknown"));
    expect(text(find(card, ".det-summary"))).toBe("All on");
    // None with a state: the head without a summary.
    const { card: none, hass: noneHass } = await withX1c({ detectors: [{ key: "ai_monitoring", on: true }] });
    await showView(none, "Control");
    await update(none, noneHass.withState("switch.x1c_ai_monitoring", "unavailable"));
    expect(find(none, ".det-head")).not.toBeNull();
    expect(find(none, ".det-summary")).toBeNull();
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
    // Marked, not disabled: the keyboard keeps its place.
    expect(toggle(card, "Build plate position detection").disabled).toBe(false);
    expect(toggle(card, "Build plate position detection").getAttribute("aria-disabled")).toBe("true");
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
  });

  it("names each in the viewer's language, not the server's, unless the user renamed it", async () => {
    const { card } = await cardFor("a1mini", {}, { devices: a1mini({ renamed: { build_plate_position_detection: "Plate check" } }) });
    await showView(card, "Control");
    await unfold(card);
    // The device is "Desk A1 mini": the friendly name without it.
    expect(toggles(card).map(name)).toEqual(["Plate check"]);
    expect(text(find(card, ".det-name"))).toBe("Plate check");
    // A German server names the entities in German; the viewer reads English.
    const { card: english } = await cardFor("h2d", {}, { devices: h2d({ serverLanguage: "de" }) });
    await showView(english, "Control");
    await unfold(english);
    expect(toggles(english).map(name)).toEqual([
      "Build plate detection",
      "Spaghetti detection",
      "Purge chute pile-up detection",
      "Nozzle clumping detection",
      "Air printing detection",
    ]);
    const { card: german } = await cardFor("h2d", {}, { language: "de" });
    await showView(german, "Steuerung");
    await unfold(german);
    expect(toggles(german).map(name)).toEqual([
      "Druckplattenerkennung",
      "Spaghetti-Erkennung",
      "Auswurfschacht-Überwachung",
      "Erkennung von Düsenklumpen",
      "Druck-ins-Leere-Erkennung",
    ]);
    const { card: x1 } = await cardFor("x1c", {}, { language: "de" });
    await showView(x1, "Steuerung");
    await unfold(x1);
    expect(toggles(x1).map(name).slice(0, 2)).toEqual(["KI-Drucküberwachung", "Inspektion der ersten Schicht"]);
    expect(text(find(x1, ".detection .section-label"))).toBe("Druckoptionen");
    expect(text(find(x1, ".detection .hint"))).toBe(
      "An: Der Drucker pausiert den Druck, wenn die Erkennung anschlägt. Empfindlichkeit wie am Drucker eingestellt. Eine ausgeschaltete Erkennung bleibt aus, auch bei den nächsten Drucken.",
    );
    expect(text(find(x1, ".detection .det-sub"))).toBe("Spaghetti und Stau im Auswurfschacht");
    const { card: x1English } = await cardFor("x1c", {}, { devices: x1c({ serverLanguage: "de" }) });
    await showView(x1English, "Control");
    await unfold(x1English);
    expect(toggles(x1English).map(name)).toEqual(["AI print monitoring", "First layer inspection", "Build plate position detection"]);
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
    const { card: german, hass: germanHass } = await cardFor("x1c", {}, { language: "de" });
    await showView(german, "Steuerung");
    await unfold(german);
    await update(
      german,
      germanHass.withState(PLATE, "unknown").withState("switch.x1c_ai_monitoring", "unknown").withState("switch.x1c_first_layer_inspection", "unknown"),
    );
    expect(findAll(german, ".detection .det-state").map(text)).toEqual(["Unbekannt", "Unbekannt", "Unbekannt"]);
  });

  it("is not there while the printer is offline: the tab says so", async () => {
    const { card } = await withX1c({ online: false });
    await showView(card, "Control");
    expect(find(card, ".detection")).toBeNull();
    expect(find(card, ".job .job-info")).not.toBeNull();
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

  it("is tagged in the heating section while a job runs, as in the Status tab", async () => {
    const { card, hass } = await cardFor("h2d", {}, { devices: h2d({ status: "printing", hms: [] }) });
    await showView(card, "Control");
    const tags = (): (string | null)[] => findAll(card, ".heat-row").map((row) => (row.querySelector(".heat-tag") ? text(row.querySelector(".heat-tag")) : null));
    expect(tags()).toEqual(["active", null, null, null]);
    expect(text(find(card, ".heat-row .heat-label"))).toBe("Left nozzle active");
    // Where the name and the tag do not fit on one line, the tag goes below.
    expect(find(card, ".heat-row .heat-title .heat-tag")).not.toBeNull();
    const css = styleText();
    expect(css).toMatch(/\.heat-title\s*\{[^}]*flex-wrap: wrap/);
    await update(card, hass.withState("select.h2d_active_nozzle", "right"));
    expect(tags()).toEqual([null, "active", null, null]);
    await update(card, hass.withState("select.h2d_active_nozzle", "unavailable"));
    expect(tags()).toEqual([null, null, null, null]);
    // Idle, "active" beside Off would read as on: the select below says which one.
    const { card: idle } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [] }) });
    await showView(idle, "Control");
    expect(find(idle, ".heat-tag")).toBeNull();
    const { card: single } = await cardFor("a1mini");
    await showView(single, "Control");
    expect(find(single, ".heat-tag")).toBeNull();
  });

  it("says it in German", async () => {
    const { card, hass } = await cardFor("h2d", {}, { language: "de", devices: h2d({ status: "idle", hms: [] }) });
    await showView(card, "Steuerung");
    expect(text(find(card, ".nozzle-row .step-label"))).toBe("Aktive Düse");
    expect(findAll(card, ".nozzle-row [role=radio]").map(text)).toEqual(["Links", "Rechts"]);
    const { card: printing } = await cardFor("h2d", {}, { language: "de", devices: h2d({ status: "printing", hms: [] }) });
    await showView(printing, "Steuerung");
    expect(text(find(printing, ".heat-tag"))).toBe("aktiv");
    await update(card, hass.withState("select.h2d_active_nozzle", "right"));
    expect(text(find(card, ".note"))).toBe(`Zum Extrudieren heize die rechte Düse (aktiv) unter „Heizen“ auf mindestens 170${NBSP}°C.`);
    await update(card, hass.withState("sensor.h2d_left_nozzle_temperature", "120"));
    expect(text(find(card, ".note"))).toBe(`Zum Extrudieren heize die linke Düse (aktiv) unter „Heizen“ auf mindestens 170${NBSP}°C.`);
  });
});

describe("the filament view", () => {
  it("loads a filament after asking, and unloads the one in use", async () => {
    const { card, hass } = await withX1c({ status: "idle" });
    await showView(card, "Filament");
    expect(findAll(card, ".unit-name").map(text)).toEqual(["AMS A", "External spool"]);
    // "AMS A" says its model already.
    expect(find(card, ".unit-model")).toBeNull();
    // What shows, and what a screen reader hears.
    expect(findAll(card, ".unit-env > span > span[aria-hidden=true]").map(text).join(" ")).toBe(`21${NBSP}% 27${NBSP}°C`);
    expect(findAll(card, ".unit-env .sr-only").map(text)).toEqual([`humidity 21${NBSP}%`, `temperature 27${NBSP}°C`]);
    // The material only where the name does not say it already.
    expect(findAll(card, ".slot-main").map(text)).toEqual([`PLA Basic 80${NBSP}%`, `PLA Matte In use · 45${NBSP}%`, "PLA", "Not set", "Not set"]);
    expect(loadButtons(card).map(text)).toEqual(["Load", "Unload", "Load"]);
    // "In use" on the line below the name: on a phone the name keeps the room.
    expect(text(find(card, ".slot.active .slot-sub"))).toBe(`In use · 45${NBSP}%`);
    expect(find(card, ".slot.active .slot-sub .in-use")).not.toBeNull();
    expect(findAll(card, ".slot .in-use")).toHaveLength(1);
    loadButtons(card)[0]?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Load PLA Basic from Slot 1 · AMS A?");
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
    // The time on one line: no break inside "3 h 20 min".
    expect(text(pro)).toBe(`Drying · 3${NBSP}h${NBSP}20${NBSP}min${NBSP}left Stop drying`);
    expect(text(ht)).toBe("Not drying Dry");
    // Stopping asks first, as starting does, and says how long is left.
    await press(card, "Stop drying");
    expect(hass.calls).toHaveLength(0);
    expect(text(find(card, "dialog h2"))).toBe("Stop drying?");
    expect(text(find(card, "dialog p"))).toBe(`AMS A has 3${NBSP}h${NBSP}20${NBSP}min of drying left.`);
    expect(text(find(card, "dialog .safe"))).toBe("Keep drying");
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-h2d-ams-0" });
    expect(hass.calls.at(-1)?.service).toBe("stop_drying");
    await press(card, "Dry");
    expect(text(find(card, "dialog h2"))).toBe("Dry the filament in AMS HT A");
    const temperature = find<HTMLInputElement>(card, "#dry-temperature");
    const duration = find<HTMLInputElement>(card, "#dry-duration");
    // The PA6-CF spool's own recommendation.
    expect([temperature?.value, duration?.value]).toEqual(["80", "10"]);
    // The steppers say what they change.
    expect(findAll(card, "dialog .stepper .btn").map((item) => item.getAttribute("aria-label"))).toEqual([
      "Lower the temperature",
      "Raise the temperature",
      "Shorten the drying",
      "Lengthen the drying",
    ]);
    expect(text(find(card, "dialog .dlg-suggested"))).toBe("Suggested for the loaded filament: PA6-CF.");
    expect(find(card, "dialog .dlg-suggested path")?.getAttribute("d")).toBe(ICONS.check);
    expect(text(find(card, "dialog .dlg-range"))).toBe(`45${NBSP}°C – 85${NBSP}°C · 1–24 h`);
    await press(card, "Raise the temperature");
    await press(card, "Shorten the drying");
    expect([find<HTMLInputElement>(card, "#dry-temperature")?.value, find<HTMLInputElement>(card, "#dry-duration")?.value]).toEqual(["85", "9"]);
    const input = find<HTMLInputElement>(card, "#dry-temperature") as HTMLInputElement;
    input.value = "120";
    input.dispatchEvent(new Event("change"));
    await card.updateComplete;
    expect(find<HTMLInputElement>(card, "#dry-temperature")?.value).toBe("85");
    expect(button(card, "Raise the temperature").disabled).toBe(true);
    input.value = "abc";
    input.dispatchEvent(new Event("change"));
    await card.updateComplete;
    expect(find<HTMLInputElement>(card, "#dry-temperature")?.value).toBe("85");
    const hours = find<HTMLInputElement>(card, "#dry-duration") as HTMLInputElement;
    hours.value = "0";
    hours.dispatchEvent(new Event("change"));
    await card.updateComplete;
    expect(button(card, "Shorten the drying").disabled).toBe(true);
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
      await press(card, "Cancel");
      return values;
    };
    // Three PLA spools at 55 °C / 8 h; the support spool has none.
    expect(await open()).toEqual(["55", "8", "Suggested for the loaded filament: PLA."]);
    // A PA spool at 80 °C / 12.4 h: the PLA's temperature, the PA's time.
    // A spool without a type is named by its filament.
    const slot = (n: number): string => `sensor.dev-h2d_ams_0_slot_${n}`;
    const attributes = (n: number): Record<string, unknown> => ({ ...(next.states[slot(n)]?.attributes ?? {}) });
    next = next.withState(slot(4), "PA", { ...attributes(4), type: null, name: "PA", drying_temp: 80, drying_time: 12.4 });
    await update(card, next);
    expect(await open()).toEqual(["55", "12", `Set for the most heat-sensitive spool: PLA${NBSP}55${NBSP}°C · PA${NBSP}80${NBSP}°C`]);
    // Spools that all want more than the unit can: the AMS 2 Pro stops at 65 °C.
    for (const n of [1, 2, 3]) next = next.withState(slot(n), "PA", { ...attributes(n), type: "PA", drying_temp: 80 });
    await update(card, next);
    expect(await open()).toEqual(["65", "12", "Suggested for the loaded filament: PA."]);
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
    expect(text(find(card, "dialog .dlg-suggested"))).toBe(`Set for the most heat-sensitive spool: PLA${NBSP}55${NBSP}°C · PETG${NBSP}65${NBSP}°C`);
    expect(find(card, "dialog .dlg-suggested path")?.getAttribute("d")).toBe(ICONS.info);
    const german = await open("de", 65);
    expect(text(find(german, "dialog .dlg-suggested"))).toBe(`Für die empfindlichste Spule eingestellt: PLA${NBSP}55${NBSP}°C · PETG${NBSP}65${NBSP}°C`);
    // Different materials that agree: nothing to name.
    const agreeing = await open("en", 55);
    expect(text(find(agreeing, "dialog .dlg-suggested"))).toBe("Suggested for the loaded filament: PLA, PETG.");
    expect(find(agreeing, "dialog .dlg-suggested path")?.getAttribute("d")).toBe(ICONS.check);
  });

  it("says no drying state while its sensor has none", async () => {
    const { card, hass } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [] }) });
    await update(card, hass.withState("binary_sensor.dev-h2d_ams_0_drying", "unavailable").withState("binary_sensor.dev-h2d_ams_128_drying", "unknown"));
    await showView(card, "Filament");
    expect(findAll(card, ".drying > span").map(text)).toEqual(["—", "—"]);
  });

  it("dries an AMS 2 Pro at 65 °C at most", async () => {
    const { card, hass } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [] }) });
    await update(card, hass.withState("binary_sensor.dev-h2d_ams_0_drying", "off"));
    await showView(card, "Filament");
    findAll<HTMLButtonElement>(card, ".drying .btn")[0]?.click();
    await card.updateComplete;
    expect(find<HTMLInputElement>(card, "#dry-temperature")?.max).toBe("65");
    await press(card, "Cancel");
    expect(find(card, "dialog")).toBeNull();
    // Drying without a time left yet.
    await update(card, hass.withState("sensor.dev-h2d_ams_0_drying_remaining_time", "0"));
    expect(text(findAll(card, ".drying")[0])).toBe("Drying Stop drying");
  });

  it("offers no drying where the printer starts it only from its own screen, and says so", async () => {
    const devices = h2d({ status: "idle", hms: [] }).map((device) => ({
      ...device,
      entities: device.entities.map((entity) => (entity.key === "drying" ? { ...entity, attributes: { ...entity.attributes, remote_start: false } } : entity)),
    }));
    const { card } = await cardFor("h2d", { start_view: "filament" }, { devices });
    const rows = findAll(card, ".drying");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.flatMap((row) => [...row.querySelectorAll("button")])).toHaveLength(0);
    expect(text(rows[0] ?? null)).toContain("Start and stop it on the printer's screen.");
    // Without control nothing is offered, so nothing needs a word.
    const { card: shown } = await cardFor("h2d", { start_view: "filament", read_only: true }, { devices });
    expect(findAll(shown, ".dry-where")).toHaveLength(0);
    // An integration before the attribute: the buttons, as before.
    const { card: older } = await cardFor("h2d", { start_view: "filament" }, { devices: h2d({ status: "idle", hms: [] }) });
    expect(hasButton(older, "Stop drying")).toBe(true);
  });

  it("asks before it stops drying, also without a time left, and in German", async () => {
    const { card, hass } = await cardFor("h2d", { start_view: "filament" }, { devices: h2d({ status: "idle", hms: [] }) });
    await update(card, hass.withState("sensor.dev-h2d_ams_0_drying_remaining_time", "0"));
    await press(card, "Stop drying");
    expect(text(find(card, "dialog p"))).toBe("AMS A will stop drying.");
    await press(card, "Keep drying");
    expect(find(card, "dialog")).toBeNull();
    expect(hass.calls).toHaveLength(0);
    const { card: german } = await cardFor("h2d", { start_view: "filament" }, { language: "de", devices: h2d({ status: "idle", hms: [] }) });
    expect(text(find(german, ".drying"))).toBe(`Trocknet · noch${NBSP}3${NBSP}Std.${NBSP}20${NBSP}Min. Trocknen stoppen`);
    await press(german, "Trocknen stoppen");
    expect(text(find(german, "dialog h2"))).toBe("Trocknen stoppen?");
    expect(text(find(german, "dialog p"))).toBe(`AMS A trocknet noch 3${NBSP}Std.${NBSP}20${NBSP}Min. lang.`);
    expect(text(find(german, "dialog .safe"))).toBe("Weiter trocknen");
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
    expect(text(find(card, "dialog h2"))).toBe("Load PLA Basic from Slot 1 · AMS A?");
    // The nozzle named in the sentence.
    expect(text(find(card, "dialog p"))).toBe("The printer heats the right nozzle, unloads its filament and loads this one. This takes a few minutes.");
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
    await press(idle, "Cancel");
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

  it("says the printer is offline as the status tab does; the preview shows unknown slots as an example", async () => {
    const { card } = await cardFor("p1s");
    await showView(card, "Filament");
    expect(find(card, ".unit")).toBeNull();
    expect(text(find(card, ".job .job-info"))).toBe("The printer is offline. Check that it is switched on and connected to BamBuddy.");
    const preview = await previewOf("p1s", { start_view: "filament", ams_folding: "folded" });
    // Folded as the option says; the external spool unknown.
    expect(findAll<HTMLButtonElement>(preview, "button.unit-head").map((head) => head.getAttribute("aria-expanded"))).toEqual(["false"]);
    expect(findAll(preview, ".slot-main").map((item) => item.getAttribute("aria-label"))).toEqual(["Unknown – External spool"]);
    expect(findAll(preview, ".slot .swatch").map((item) => item.classList.contains("unknown"))).toEqual([true]);
    const german = await previewOf("p1s", { start_view: "filament", ams_folding: "open" }, "de");
    // The example follows the option: unfolded, its slots unknown too.
    expect(findAll(german, ".slot-main").map((item) => item.getAttribute("aria-label"))).toEqual(["Unbekannt – Fach 1 · AMS A", "Unbekannt – Externe Spule"]);
  });

  it("shows the filament without controls where the printer has none, or with the controls hidden", async () => {
    const { card } = await cardFor("readOnly");
    await showView(card, "Filament");
    // No note about the key: the integration's key always may control.
    expect(find(card, ".note.info")).toBeNull();
    expect(findAll(card, ".slot .btn")).toHaveLength(0);
    const { card: plain } = await cardFor("h2d", { read_only: true });
    await showView(plain, "Filament");
    expect(find(plain, ".note")).toBeNull();
    expect(findAll(plain, ".slot .btn, .drying .btn")).toHaveLength(0);
    expect(find(plain, ".unit .hint")).toBeNull();
  });

  it("names a slot's button by all it shows: the filament, in use, what is left", async () => {
    const { card } = await withX1c({ status: "idle" });
    await showView(card, "Filament");
    const slots = findAll(card, ".slot-main");
    expect(text(slots[1])).toBe(`PLA Matte In use · 45${NBSP}%`);
    // Its name: what it shows, and where it is.
    expect(slots[1]?.getAttribute("aria-label")).toBe(`PLA Matte · In use · 45${NBSP}% – Slot 2 · AMS A`);
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
  const COLORS = ["White", "Black", "Gray", "Silver", "Red", "Orange", "Yellow", "Green", "Turquoise", "Cyan", "Blue", "Purple", "Pink", "Brown", "Beige", "Gold"];
  const SLOT_3 = "sensor.dev-x1c_ams_0_slot_3";

  /** Whether each slot row of the filament view offers "Set filament". */
  const editable = (card: FakeCard): boolean[] => findAll(card, ".slot").map((row) => row.querySelector(".btn.edit") !== null);
  const edit = async (card: FakeCard, row: number): Promise<void> => {
    (findAll(card, ".slot")[row]?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
  };
  const vendors = (card: FakeCard): HTMLSelectElement => find<HTMLSelectElement>(card, "dialog select#fil-vendor") as HTMLSelectElement;
  const filaments = (card: FakeCard): HTMLSelectElement | null => find<HTMLSelectElement>(card, "dialog select#fil-filament");
  const texts = (select: HTMLSelectElement | null): string[] => [...(select?.options ?? [])].map((option) => option.text);
  const choose = async (card: FakeCard, select: HTMLSelectElement | null, value: string): Promise<void> => {
    (select as HTMLSelectElement).value = value;
    (select as HTMLSelectElement).dispatchEvent(new Event("change"));
    await card.updateComplete;
  };
  const vendor = async (card: FakeCard, value: string): Promise<void> => choose(card, vendors(card), value);
  const filament = async (card: FakeCard, value: string): Promise<void> => choose(card, filaments(card), value);
  const answering = (offer: unknown) => async (call: { service: string }): Promise<unknown> => (call.service === "get_filaments" ? { response: offer } : undefined);
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

  it("is offered for every filled slot -- a Bambu spool's too --, never for an empty one", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Filament");
    // A Bambu spool, the one printing, the PLA without a chip, a spool nobody
    // described yet, the external spool.
    expect(editable(card)).toEqual([true, false, true, true, true]);
    const edits = findAll<HTMLButtonElement>(card, ".slot .btn.edit");
    expect(edits.every((item) => !item.disabled && text(item) === "")).toBe(true);
    // The Bambu spool's edits the slot; the external spool's names its spool.
    // One label for one control, naming its slot.
    expect(edits.map((item) => item.title)).toEqual(["Edit Slot 1 · AMS A", "Edit Slot 3 · AMS A", "Edit Slot 4 · AMS A", "Edit the external spool"]);
    // Nothing in the slot, or no word on it.
    const slot4 = "sensor.dev-x1c_ams_0_slot_4";
    await update(card, hass.withState(slot4, "empty", { ...hass.states[slot4]?.attributes, present: false }).withState(SLOT_3, "PLA", {}));
    expect(editable(card)).toEqual([true, false, false, false, true]);
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
      expect(editable(card), status).toEqual([true, false, false, true, true]);
    }
    const { card: paused } = await cardFor("x1c", {}, { devices: devices("paused") });
    await showView(paused, "Filament");
    expect(editable(paused)).toEqual([true, true, true, true, true]);
  });

  it("waits during a filament change, and is not offered offline or without control", async () => {
    const { card } = await withX1c({ status: "idle", amsStatus: "feeding" });
    await showView(card, "Filament");
    expect(findAll<HTMLButtonElement>(card, ".slot .btn.edit").map((item) => item.disabled)).toEqual([true, true, true, true, true]);
    const { card: offline } = await cardFor("p1s");
    await showView(offline, "Filament");
    expect(findAll(offline, ".slot .btn.edit")).toHaveLength(0);
    const { card: readOnly } = await cardFor("readOnly");
    await showView(readOnly, "Filament");
    expect(findAll(readOnly, ".slot .btn.edit")).toHaveLength(0);
    const { card: plain } = await cardFor("x1c", { read_only: true });
    await showView(plain, "Filament");
    expect(findAll(plain, ".slot .btn.edit")).toHaveLength(0);
  });

  it("keeps the slot's filament under its vendor, offers Bambu Studio's, and preselects its colour", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Filament");
    await edit(card, 2);
    expect(hass.calls.find((call) => call.service === "get_filaments")).toMatchObject({ domain: "bambuddy", data: { entity_id: SLOT_3 }, returnResponse: true });
    expect(text(find(card, "dialog h2"))).toBe("Filament of Slot 3 · AMS A");
    expect(text(find(card, "dialog label[for=fil-vendor]"))).toBe("Vendor");
    expect(texts(vendors(card))).toEqual(["Choose …", "Bambu Lab", "Generic", "SUNLU"]);
    expect(vendors(card).value).toBe("Generic");
    expect(text(find(card, "dialog label[for=fil-filament]"))).toBe("Filament");
    expect(texts(filaments(card))).toEqual(["Keep PLA", "PLA", "PETG", "PETG HF", "TPU for AMS", "PVA"]);
    expect(filaments(card)?.value).toBe("keep");
    expect(filaments(card)?.classList.contains("unset")).toBe(false);
    expect(find(card, "dialog [role=radiogroup]")?.getAttribute("aria-label")).toBe("Color");
    expect(swatches(card).map((item) => item.getAttribute("aria-label"))).toEqual(COLORS);
    expect(swatches(card).map((item) => item.getAttribute("style"))).toContain("--c: #C12E1F");
    expect(checked(card)).toEqual(["White"]);
    // White and black keep the outline that makes them visible on every theme.
    expect(swatches(card).filter((item) => item.classList.contains("outline")).map((item) => item.getAttribute("aria-label"))).toEqual(["White", "Black", "Yellow", "Beige"]);
    expect(text(find(card, "dialog .other-color"))).toBe("Other color …");
    expect(text(find(card, "dialog .dlg-note"))).toBe("For spools without a chip. You can choose what Bambu Studio offers for this printer, its nozzle and this slot. Other profiles can be set on the printer or in BamBuddy.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Cancel", "Set"]);
    expect(root(card).activeElement).toBe(find(card, "dialog .btn.safe"));
    // Nothing changed yet.
    expect(setButton(card).disabled).toBe(true);
    expect(setButton(card).classList.contains("primary")).toBe(true);
  });

  it("sends only what changed: the colour, the filament, or both", async () => {
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
    await filament(card, "GFG96");
    expect(setButton(card).disabled).toBe(false);
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: SLOT_3, filament: "GFG96" });
    // Another vendor: its filament still to choose.
    await edit(card, 2);
    await vendor(card, "SUNLU");
    expect(texts(filaments(card))).toEqual(["Choose …", "PLA+"]);
    expect(filaments(card)?.value).toBe("");
    expect(setButton(card).disabled).toBe(true);
    expect(text(find(card, "dialog .dlg-actions .dlg-need"))).toBe("Choose a filament too.");
    await filament(card, "GFSNL03");
    await pick(card, "Gold");
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: SLOT_3, filament: "GFSNL03", color: [228, 189, 104] });
    // Keep again, and back to the slot's own vendor: nothing changed.
    await edit(card, 2);
    await filament(card, "GFU98");
    await filament(card, "keep");
    expect(setButton(card).disabled).toBe(true);
    await vendor(card, "Bambu Lab");
    await vendor(card, "Generic");
    expect(filaments(card)?.value).toBe("keep");
    expect(setButton(card).disabled).toBe(true);
    await press(card, "Cancel");
    expect(find(card, "dialog")).toBeNull();
    expect(hass.calls.filter((call) => call.service === "set_filament")).toHaveLength(3);
  });

  it("asks for a filament where the slot has none yet", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Filament");
    await edit(card, 3);
    expect(text(find(card, "dialog h2"))).toBe("Filament of Slot 4 · AMS A");
    const options = [...vendors(card).options];
    expect(options.map((option) => option.text)).toEqual(["Choose …", "Bambu Lab", "Generic", "SUNLU"]);
    expect(options[0]?.disabled).toBe(true);
    expect(vendors(card).value).toBe("");
    // The prompt reads as one, not as a value.
    expect(vendors(card).classList.contains("unset")).toBe(true);
    expect(filaments(card)).toBeNull();
    // No colour to preselect; a colour alone is not enough, and it says so.
    expect(checked(card)).toEqual([]);
    expect(swatches(card)[0]?.getAttribute("tabindex")).toBe("0");
    expect(find(card, "dialog .dlg-need")).toBeNull();
    await pick(card, "Black");
    expect(setButton(card).disabled).toBe(true);
    expect(text(find(card, "dialog .dlg-actions .dlg-need"))).toBe("Choose a filament too.");
    await vendor(card, "Generic");
    expect(texts(filaments(card))[0]).toBe("Choose …");
    expect(text(find(card, "dialog .dlg-actions .dlg-need"))).toBe("Choose a filament too.");
    await filament(card, "GFG99");
    expect(find(card, "dialog .dlg-need")).toBeNull();
    expect(vendors(card).classList.contains("unset")).toBe(false);
    expect(setButton(card).disabled).toBe(false);
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "sensor.dev-x1c_ams_0_slot_4", filament: "GFG99", color: [0, 0, 0] });
  });

  it("keeps a profile the offer lacks in the vendor field", async () => {
    const { card, hass } = await cardFor("x1c", {}, { callService: answering({ ...OFFER, current: "P4d64437" }) });
    await showView(card, "Filament");
    await edit(card, 2);
    expect(texts(vendors(card))).toEqual(["Keep PLA", "Bambu Lab", "Generic", "SUNLU"]);
    expect(vendors(card).value).toBe("keep");
    expect(filaments(card)).toBeNull();
    // A vendor: its filaments, none of them the slot's.
    await vendor(card, "Generic");
    expect(texts(filaments(card))[0]).toBe("Choose …");
    await vendor(card, "keep");
    expect(filaments(card)).toBeNull();
    expect(setButton(card).disabled).toBe(true);
    await pick(card, "Red");
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: SLOT_3, color: [193, 46, 31] });
  });

  it("sets vendor and filament beside their labels in one column, under them on a dialog too narrow", async () => {
    const { card } = await cardFor("x1c");
    await showView(card, "Filament");
    await edit(card, 2);
    const grid = find(card, "dialog .fil-fields > .fil-grid");
    expect([...(grid?.querySelectorAll("label, select") ?? [])].map((item) => item.getAttribute("for") ?? item.id)).toEqual([
      "fil-vendor",
      "fil-vendor",
      "fil-filament",
      "fil-filament",
    ]);
    const sheet = styleText();
    expect(sheet).toMatch(/\.fil-fields\s*\{[^}]*container-type: inline-size;/);
    expect(sheet).toMatch(/\.fil-grid\s*\{[^}]*grid-template-columns: max-content minmax\(0, 1fr\);/);
    // Beside, a select takes the rest of the row: the 200 px of the other selects would cut a long name.
    expect(sheet).toMatch(/\.fil-grid \.select\s*\{[^}]*max-width: none;/);
    // Under its label below the width the longest name with its "Keep" needs beside the widest label.
    expect(sheet).toMatch(/@container \(max-width: 329px\)\s*\{\s*\.fil-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
  });

  it("says so where Bambu Studio offers the slot nothing", async () => {
    const { card, hass } = await cardFor("x1c", {}, { callService: answering({ vendors: [] }) });
    await showView(card, "Filament");
    await edit(card, 2);
    expect(vendors(card)).toBeNull();
    expect(findAll(card, "dialog .dlg-note").map(text)).toContain("Bambu Studio offers no filament for this slot with the nozzle that feeds it. A profile can be set on the printer or in BamBuddy.");
    // No promise of a new filament beside it.
    expect(findAll(card, "dialog .dlg-note").map(text)).not.toContain("For spools without a chip. You can choose what Bambu Studio offers for this printer, its nozzle and this slot. Other profiles can be set on the printer or in BamBuddy.");
    // The slot's own filament stays; its colour can change.
    await pick(card, "Red");
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: SLOT_3, color: [193, 46, 31] });
    // A slot without a filament: nothing can be set there -- the note and the slot's tools only.
    const { card: blank } = await cardFor("x1c", {}, { callService: answering({ vendors: [] }) });
    await showView(blank, "Filament");
    await edit(blank, 3);
    expect(findAll(blank, "dialog .dlg-note").map(text)).toContain("Bambu Studio offers no filament for this slot with the nozzle that feeds it. A profile can be set on the printer or in BamBuddy.");
    expect(swatches(blank)).toEqual([]);
    expect(find(blank, "dialog select#fil-k")).toBeNull();
    // The slot's tools stay (an unset slot has nothing to reset).
    expect(button(blank, "Read the chip again")).not.toBeNull();
    expect(findAll(blank, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);
    expect(find(blank, "dialog .dlg-actions .dlg-need")).toBeNull();
  });

  it("waits for the offer, and keeps the slot's filament where none comes", async () => {
    let answer: (value: unknown) => void = () => undefined;
    const slow = async (call: { service: string }): Promise<unknown> => (call.service === "get_filaments" ? new Promise((resolve) => (answer = resolve)) : undefined);
    const { card } = await cardFor("x1c", {}, { callService: slow });
    await showView(card, "Filament");
    await edit(card, 2);
    expect(vendors(card).disabled).toBe(true);
    expect(texts(vendors(card))).toEqual(["Keep PLA"]);
    answer({ response: offerFor(SLOT_3) });
    await settle(card);
    expect(vendors(card).disabled).toBe(false);
    expect(vendors(card).value).toBe("Generic");
    // No answer at all: the slot's own, nothing else to choose.
    const failing = async (call: { service: string }): Promise<unknown> => {
      if (call.service === "get_filaments") throw new Error("no answer");
      return undefined;
    };
    const { card: failed } = await cardFor("x1c", {}, { callService: failing });
    await showView(failed, "Filament");
    await edit(failed, 2);
    expect(texts(vendors(failed))).toEqual(["Keep PLA"]);
    expect(vendors(failed).disabled).toBe(true);
    expect(findAll(failed, "dialog .dlg-note").map(text)).toContain("The filament list did not arrive. To ask again, close the dialog and open it once more.");
    expect(findAll(failed, "dialog .dlg-note").map(text)).not.toContain("For spools without a chip. You can choose what Bambu Studio offers for this printer, its nozzle and this slot. Other profiles can be set on the printer or in BamBuddy.");
    // The colour can still change.
    expect(swatches(failed).length).toBeGreaterThan(0);
    await press(failed, "Cancel");
    // An answer without vendors is none either; on a slot without a filament nothing can be set:
    // the note and the slot's tools only.
    const { card: empty } = await cardFor("x1c", {}, { callService: answering({}) });
    await showView(empty, "Filament");
    await edit(empty, 3);
    expect(findAll(empty, "dialog .dlg-note").map(text)).toContain("The filament list did not arrive. To ask again, close the dialog and open it once more.");
    expect(vendors(empty)).toBeNull();
    expect(swatches(empty)).toEqual([]);
    expect(find(empty, "dialog select#fil-k")).toBeNull();
    expect(findAll(empty, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);
  });

  it("shows a colour outside the palette and takes any other", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Filament");
    await edit(card, 2);
    expect(text(find(card, "dialog h2"))).toBe("Filament of Slot 3 · AMS A");
    expect(texts(filaments(card))[0]).toBe("Keep PETG");
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
    expect(vendors(card).value).toBe("Bambu Lab");
    expect(texts(filaments(card))[0]).toBe("Keep TPU 95A HF");
    expect(checked(card)).toEqual(["Orange"]);
    await vendor(card, "Generic");
    await filament(card, "GFU98");
    await confirmDialog(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "sensor.a1_mini_external_spool", filament: "GFU98" });
    const { card: dual } = await cardFor("h2d");
    await showView(dual, "Filament");
    const spools = findAll(dual, ".unit").at(-1) as HTMLElement;
    const titles: string[] = [];
    for (const button of spools.querySelectorAll<HTMLButtonElement>(".btn.edit")) {
      button.click();
      await dual.updateComplete;
      titles.push(text(find(dual, "dialog h2")));
      await press(dual, "Cancel");
    }
    expect(titles).toEqual(["Filament of the left external spool", "Filament of the right external spool"]);
    expect([...spools.querySelectorAll(".btn.edit")].map((item) => item.getAttribute("aria-label"))).toEqual([
      "Edit the left external spool",
      "Edit the right external spool",
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
    const { card } = await cardFor("x1c", {}, { callService: async (call) => (call.service === "set_filament" ? Promise.reject(refused) : undefined) });
    await showView(card, "Filament");
    await edit(card, 3);
    await vendor(card, "Generic");
    await filament(card, "GFL99");
    await confirmDialog(card);
    expect(text(find(card, ".toast"))).toBe("This slot is empty.");
  });

  it("says it in German", async () => {
    const { card } = await cardFor("x1c", {}, { language: "de" });
    await showView(card, "Filament");
    expect(findAll(card, ".slot .btn.edit").map((item) => item.getAttribute("aria-label"))).toEqual([
      "Fach 1 · AMS A bearbeiten",
      "Fach 3 · AMS A bearbeiten",
      "Fach 4 · AMS A bearbeiten",
      "Externe Spule bearbeiten",
    ]);
    const { card: spools } = await cardFor("h2d", {}, { language: "de" });
    await showView(spools, "Filament");
    expect(findAll(spools, ".unit:last-of-type .btn.edit").map((item) => item.getAttribute("aria-label"))).toEqual([
      "Linke externe Spule bearbeiten",
      "Rechte externe Spule bearbeiten",
    ]);
    expect(findAll(card, ".slot-name").map(text).slice(3)).toEqual(["Nicht festgelegt", "Nicht festgelegt"]);
    await edit(card, 2);
    expect(text(find(card, "dialog h2"))).toBe("Filament von Fach 3 · AMS A");
    expect(text(find(card, "dialog label[for=fil-vendor]"))).toBe("Hersteller");
    expect(texts(filaments(card))[0]).toBe("PLA behalten");
    expect(find(card, "dialog [role=radiogroup]")?.getAttribute("aria-label")).toBe("Farbe");
    expect(swatches(card).map((item) => item.getAttribute("aria-label"))).toEqual([
      "Weiß", "Schwarz", "Grau", "Silber", "Rot", "Orange", "Gelb", "Grün", "Türkis", "Cyan", "Blau", "Lila", "Pink", "Braun", "Beige", "Gold",
    ]);
    expect(text(find(card, "dialog .other-color"))).toBe("Andere Farbe …");
    expect(text(find(card, "dialog .dlg-note"))).toBe("Für Spulen ohne Chip. Zur Wahl steht, was Bambu Studio für diesen Drucker, seine Düse und dieses Fach anbietet. Andere Profile kannst du am Drucker oder in BamBuddy setzen.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Abbrechen", "Übernehmen"]);
    await press(card, "Abbrechen");
    await edit(card, 3);
    expect(texts(vendors(card))[0]).toBe("Wählen …");
    await pick(card, "Schwarz");
    expect(text(find(card, "dialog .dlg-need"))).toBe("Wähle noch ein Filament.");
    await press(card, "Abbrechen");
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

  it("is not carried into a question that opens right after: it would read as that question's answer", async () => {
    vi.useFakeTimers();
    const { card } = await cardFor("x1c");
    button(card, "Pause print").click();
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
    expect(text(find(card, ".sent"))).toBe("Sent");
    button(card, "Stop print").click();
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Stop the print?");
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

describe("switching every heater off", () => {
  it("is no button of its own: each heater has its power symbol", async () => {
    const { card } = await cardFor("x1c", { start_view: "control" }, { devices: x1c({ status: "idle", stage: "idle" }) });
    expect(hasButton(card, "Heating off")).toBe(false);
    expect(find(card, ".heat-head .btn")).toBeNull();
    expect(findAll(card, ".heat-row .heat-off").every((item) => item.querySelector("path")?.getAttribute("d") === ICONS.power)).toBe(true);
    const { card: german } = await cardFor("x1c", { start_view: "control" }, { language: "de", devices: x1c({ status: "idle", stage: "idle" }) });
    expect(hasButton(german, "Heizen aus")).toBe(false);
  });
});

describe("what the AMS is doing", () => {
  it("shows in the status and the filament view while it is not idle", async () => {
    const { card, hass } = await cardFor("a1mini", {}, { devices: a1mini({ amsStatus: "feeding" }) });
    expect(shownText(find(card, ".job-info .ams-activity"))).toBe("AMS: Feeding");
    expect(text(find(card, ".job-info .ams-activity .sr-only"))).toBe("Desk:");
    await showView(card, "Filament");
    expect(shownText(find(card, ".activity"))).toBe("AMS: Feeding");
    expect(find(card, ".activity")?.getAttribute("role")).toBe("status");
    for (const state of ["idle", "unknown", "unavailable"]) {
      await update(card, hass.withState("sensor.a1_mini_ams_status", state));
      expect(find(card, ".activity"), state).toBeNull();
    }
    await showView(card, "Status");
    expect(find(card, ".ams-activity")).toBeNull();
  });

  it("says nothing while the AMS only assists the print", async () => {
    // "assist" is the AMS's state through every print it feeds -- no
    // activity to show: a line with a spinner would stand there for hours.
    const { card, hass } = await cardFor("a1mini", {}, { devices: a1mini({ amsStatus: "assist" }) });
    expect(find(card, ".ams-activity")).toBeNull();
    await showView(card, "Filament");
    expect(find(card, ".activity")).toBeNull();
    // A filament change during it still shows.
    await update(card, hass.withState("sensor.a1_mini_ams_status", "feeding"));
    expect(shownText(find(card, ".activity"))).toBe("AMS: Feeding");
  });

  it("says it in German, and nothing while the printer is offline or without the sensor", async () => {
    const { card } = await cardFor("a1mini", {}, { language: "de", devices: a1mini({ amsStatus: "changing_filament" }) });
    expect(shownText(find(card, ".ams-activity"))).toBe("AMS: Wechselt Filament");
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

describe("a slot's tools: K profile, chip, reset", () => {
  const SLOT_1 = "sensor.dev-x1c_ams_0_slot_1";
  const SLOT_3 = "sensor.dev-x1c_ams_0_slot_3";
  const PROFILES = {
    nozzle_diameter: "0.4",
    current: -1,
    profiles: [
      { index: 1, name: "Generic PLA", k_value: 0.02, filament_id: "GFL99", nozzle: null },
      { index: 2, name: "Generic PETG", k_value: 0.035, filament_id: "GFG99", nozzle: null },
      { index: 3, name: "Grey PLA matte", k_value: 0.018, filament_id: "GFL99", nozzle: null },
    ],
  };
  const answering = async (call: { service: string }): Promise<unknown> => (call.service === "get_k_profiles" ? { response: PROFILES } : undefined);
  const editRow = async (card: FakeCard, row: number): Promise<void> => {
    (findAll(card, ".slot")[row]?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
  };
  const idle = (): FakeDevice[] => {
    const all = x1c({ status: "idle", stage: "idle" });
    for (const entity of (all[1] as FakeDevice).entities) {
      if ("attributes" in entity && entity.attributes) entity.attributes = { ...entity.attributes, active: false };
    }
    return all;
  };
  const kSelect = (card: FakeCard): HTMLSelectElement => find<HTMLSelectElement>(card, "dialog select#fil-k") as HTMLSelectElement;

  it("resets an external spool as a spool, and loads it from the external spool", async () => {
    const { card } = await cardFor("a1mini");
    await showView(card, "Filament");
    const external = findAll(card, ".slot").at(-1) as Element;
    (external.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
    await press(card, "Reset spool");
    expect(text(find(card, "dialog h2"))).toBe("Reset the spool?");
    expect(text(find(card, "dialog p"))).toBe("Its material and color are cleared.");
    // Back in the spool's dialog; it closes.
    await press(card, "Cancel");
    await press(card, "Cancel");
    ([...external.querySelectorAll<HTMLButtonElement>(".btn")].find((item) => text(item) === "Load") as HTMLButtonElement).click();
    await settle(card);
    expect(text(find(card, "dialog h2"))).toBe("Load TPU 95A HF from the external spool?");
  });

  it("names the side of the external spool it loads from on a printer with two", async () => {
    const left = { name: "PETG HF", type: "PETG", color: "#0A0A0A", remaining: null, trayId: 254 };
    const right = { name: "PLA Basic", type: "PLA", color: "#FFFFFF", remaining: null, trayId: 255 };
    const { card } = await cardFor("h2d", {}, { devices: h2d({ externalSpools: [left, right] }) });
    await showView(card, "Filament");
    const titles: string[] = [];
    for (const slot of findAll(card, ".slot").slice(-2)) {
      ([...slot.querySelectorAll<HTMLButtonElement>(".btn")].find((item) => text(item) === "Load") as HTMLButtonElement).click();
      await settle(card);
      titles.push(text(find(card, "dialog h2")));
      await press(card, "Cancel");
    }
    expect(titles).toEqual(["Load PETG HF from the left external spool?", "Load PLA Basic from the right external spool?"]);
  });

  it("warns that a paused print feeds from the external spool, and names the spool while printing", async () => {
    const spool = { name: "TPU 95A HF", type: "TPU", color: "#FF6A13", remaining: null, trayId: 254, active: true };
    const { card } = await cardFor("a1mini", {}, { devices: a1mini({ status: "paused", externalSpools: [spool] }) });
    await showView(card, "Filament");
    (findAll(card, ".slot").at(-1)?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
    await press(card, "Reset spool");
    expect(text(find(card, "dialog p"))).toBe("Its material and color are cleared. The paused print takes its filament from this spool.");

    // Printing from the AMS (the spool in use has no pencil while it feeds).
    const { card: printing } = await cardFor("a1mini", {}, { devices: a1mini({ status: "printing", externalSpools: [{ ...spool, active: false }] }) });
    await showView(printing, "Filament");
    (findAll(printing, ".slot").at(-1)?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(printing);
    expect(findAll(printing, "dialog .dlg-note").map(text)).toContain("Pause the print first to reset the spool.");
  });

  it("offers the printer's own K profiles of the slot's filament", async () => {
    const { card, hass } = await cardFor("x1c", {}, { devices: idle(), callService: answering });
    await showView(card, "Filament");
    await editRow(card, 2);

    expect(hass.calls.find((call) => call.service === "get_k_profiles")).toMatchObject({ domain: "bambuddy", data: { entity_id: SLOT_3 }, returnResponse: true });
    expect(text(find(card, "dialog label[for=fil-k]"))).toBe("K profile (flow dynamics)");
    // Nothing to warn of: what to do when unsure.
    expect(text(find(card, "dialog .k-hint"))).toBe("If unsure, leave this as it is.");
    // Only those filed under its filament (Generic PLA), as Bambu Studio offers them.
    expect([...kSelect(card).querySelectorAll("optgroup")].map((group) => group.label)).toEqual(["Matching PLA"]);
    expect([...kSelect(card).options].map((option) => option.text)).toEqual([
      "Printer's default (K 0.020)",
      "Generic PLA (K 0.020)",
      "Grey PLA matte (K 0.018)",
    ]);
    kSelect(card).value = "3";
    kSelect(card).dispatchEvent(new Event("change"));
    await card.updateComplete;
    const set = findAll<HTMLButtonElement>(card, "dialog .dlg-actions .btn").at(-1) as HTMLButtonElement;
    expect(set.disabled).toBe(false);
    set.click();
    await settle(card);
    expect(hass.calls.at(-1)).toMatchObject({ domain: "bambuddy", service: "set_filament", data: { entity_id: SLOT_3, k_profile: 3 } });
  });

  it("says when the printer reports no K profile", async () => {
    const { card } = await cardFor("x1c", {}, { devices: idle() });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect([...kSelect(card).options].map((option) => option.text)).toEqual(["Printer's default (K 0.020)"]);
    expect(text(find(card, "dialog .k-hint"))).toBe(
      "The printer lists no K profile for this nozzle, or did not answer in time. To ask again, close the dialog and open it once more.",
    );
  });

  it("lets the AMS read a Bambu spool's chip again, once no filament is loaded", async () => {
    const loaded = await cardFor("x1c", {}, { devices: x1c({ status: "idle", stage: "idle" }) });
    await showView(loaded.card, "Filament");
    await editRow(loaded.card, 0);
    expect(text(find(loaded.card, "dialog p"))).toBe("A Bambu Lab spool with a chip: the AMS reads its material and color from the chip.");
    expect(find(loaded.card, "dialog select")).toBeNull();
    expect((button(loaded.card, "Read the chip again") as HTMLButtonElement).disabled).toBe(true);
    // Which filament to unload.
    expect(findAll(loaded.card, "dialog .dlg-note").map(text)).toContain(
      "Unload the filament from Slot 2 · AMS A first: the AMS reads a chip only while no filament is loaded.",
    );
    expect(text(find(loaded.card, "dialog .rfid-spool"))).toBe(`PLA Basic · 80${NBSP}%`);
    expect(findAll(loaded.card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);

    const { card, hass } = await cardFor("x1c", {}, { devices: idle() });
    await showView(card, "Filament");
    await editRow(card, 0);
    await press(card, "Read the chip again");
    expect(hass.calls.at(-1)).toMatchObject({ domain: "bambuddy", service: "refresh_rfid", data: { entity_id: SLOT_1 } });
    expect(find(card, "dialog")).toBeNull();
  });

  it("resets a slot after a question, and goes back on Cancel", async () => {
    const { card, hass } = await cardFor("x1c", {}, { devices: idle() });
    await showView(card, "Filament");
    await editRow(card, 2);
    await press(card, "Reset slot");
    expect(text(find(card, "dialog h2"))).toBe("Reset the slot?");
    expect(text(find(card, "dialog p"))).toBe("Its material and color are cleared. A spool with a chip shows again once the AMS reads the chip.");
    await press(card, "Cancel");
    expect(text(find(card, "dialog h2"))).toBe("Filament of Slot 3 · AMS A");
    await press(card, "Reset slot");
    (find(card, "dialog .btn.danger") as HTMLButtonElement).click();
    await settle(card);
    expect(hass.calls.at(-1)).toMatchObject({ domain: "bambuddy", service: "reset_slot", data: { entity_id: SLOT_3 } });
    expect(find(card, "dialog")).toBeNull();
  });

  it("keeps the tools for a pause, not for a running print", async () => {
    const { card } = await cardFor("x1c", {}, { callService: answering });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect((button(card, "Reset slot") as HTMLButtonElement).disabled).toBe(true);
    expect(findAll(card, "dialog .dlg-note").map(text)).toContain("Pause the print first to reset the slot or read its chip again.");
    // Paused: reset works; the chip waits for the filament to be unloaded.
    const { card: paused } = await cardFor("x1c", {}, { devices: x1c({ status: "paused" }), callService: answering });
    await showView(paused, "Filament");
    await editRow(paused, 2);
    expect((button(paused, "Reset slot") as HTMLButtonElement).disabled).toBe(false);
    expect((button(paused, "Read the chip again") as HTMLButtonElement).disabled).toBe(true);
  });

  it("follows the printer while open: a print that starts disables the tools", async () => {
    const { card, hass } = await cardFor("x1c", {}, { devices: idle() });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect((button(card, "Reset slot") as HTMLButtonElement).disabled).toBe(false);
    await update(card, hass.withState("sensor.x1c_print_status", "printing"));
    expect((button(card, "Reset slot") as HTMLButtonElement).disabled).toBe(true);
  });

  const pickFilament = async (card: FakeCard, id: string): Promise<void> => {
    const select = find<HTMLSelectElement>(card, "dialog select#fil-filament") as HTMLSelectElement;
    select.value = id;
    select.dispatchEvent(new Event("change"));
    await card.updateComplete;
  };

  it("takes the new filament's first K profile, as Bambu Studio offers them", async () => {
    const { card, hass } = await cardFor("x1c", {}, { devices: idle(), callService: answering });
    await showView(card, "Filament");
    await editRow(card, 2);
    kSelect(card).value = "1";
    kSelect(card).dispatchEvent(new Event("change"));
    await card.updateComplete;
    await pickFilament(card, "GFG99");
    // The PLA profile chosen goes; Generic PETG's own comes, and only it.
    expect(kSelect(card).value).toBe("2");
    expect([...kSelect(card).options].map((option) => option.text)).toEqual(["Printer's default (K 0.020)", "Generic PETG (K 0.035)"]);
    (findAll<HTMLButtonElement>(card, "dialog .dlg-actions .btn").at(-1) as HTMLButtonElement).click();
    await settle(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: SLOT_3, filament: "GFG99", k_profile: 2 });
    // A filament without a profile: the printer's default.
    await editRow(card, 2);
    await pickFilament(card, "GFS99");
    expect(kSelect(card).value).toBe("-1");
  });

  it("never takes another filament's K profile, whatever its name says", async () => {
    const { card } = await cardFor("x1c", {}, { devices: idle(), callService: answering });
    await showView(card, "Filament");
    await editRow(card, 2);
    const vendorSelect = find<HTMLSelectElement>(card, "dialog select#fil-vendor") as HTMLSelectElement;
    vendorSelect.value = "Bambu Lab";
    vendorSelect.dispatchEvent(new Event("change"));
    await card.updateComplete;
    // Bambu PLA Basic: no profile filed under it; "Generic PLA" is no match.
    await pickFilament(card, "GFA00");
    expect(kSelect(card).value).toBe("-1");
    expect([...kSelect(card).options].map((option) => option.text)).toEqual(["Printer's default (K 0.020)"]);
  });

  it("keeps the slot's own K profile when the filament goes back to Keep", async () => {
    const own = async (call: { service: string }): Promise<unknown> => (call.service === "get_k_profiles" ? { response: { ...PROFILES, current: 3 } } : undefined);
    const { card, hass } = await cardFor("x1c", {}, { devices: idle(), callService: own });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect(kSelect(card).value).toBe("keep");
    await pickFilament(card, "GFG99");
    expect(kSelect(card).value).toBe("2");
    await pickFilament(card, "keep");
    expect(kSelect(card).value).toBe("keep");
    expect((findAll<HTMLButtonElement>(card, "dialog .dlg-actions .btn").at(-1) as HTMLButtonElement).disabled).toBe(true);
    expect(hass.calls.filter((call) => call.service === "set_filament")).toEqual([]);
  });

  it("gives a filament chosen before the K profiles came its first matching one", async () => {
    let answer: (value: unknown) => void = () => undefined;
    const slow = async (call: { service: string }): Promise<unknown> => (call.service === "get_k_profiles" ? new Promise((resolve) => (answer = resolve)) : undefined);
    const { card } = await cardFor("x1c", {}, { devices: idle(), callService: slow });
    await showView(card, "Filament");
    await editRow(card, 2);
    await pickFilament(card, "GFG99");
    answer({ response: PROFILES });
    await settle(card);
    expect(kSelect(card).value).toBe("2");
  });

  it("numbers a slot by its own number, also when another slot's sensor is disabled", async () => {
    const devices = idle();
    const ams = devices[1] as FakeDevice;
    ams.entities = ams.entities.filter((entity) => entity.entityId !== "sensor.dev-x1c_ams_0_slot_2");
    const { card } = await cardFor("x1c", {}, { devices });
    await showView(card, "Filament");
    await editRow(card, 1);
    expect(text(find(card, "dialog h2"))).toBe("Filament of Slot 3 · AMS A");
  });

  it("says when the printer did not list its K profiles, and keeps the slot's own", async () => {
    const failing = async (call: { service: string }): Promise<unknown> => {
      if (call.service === "get_k_profiles") throw new Error("no answer");
      return undefined;
    };
    const { card } = await cardFor("x1c", {}, { devices: idle(), callService: failing });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect([...kSelect(card).options].map((option) => option.text)).toEqual(["Keep the slot's own", "Printer's default (K 0.020)"]);
    expect(kSelect(card).value).toBe("keep");
    expect(text(find(card, "dialog .k-hint"))).toBe("The printer did not list its K profiles: the slot keeps its own.");
  });

  const ownK = (current: number, filaments?: () => never) => async (call: { service: string }): Promise<unknown> => {
    if (call.service === "get_k_profiles") return { response: { ...PROFILES, current } };
    if (call.service === "get_filaments" && filaments) filaments();
    return undefined;
  };
  // The slot named as the integration names it (its Bambu Studio profile).
  const named = (): FakeDevice[] => {
    const all = idle();
    for (const entity of (all[1] as FakeDevice).entities) {
      if (entity.entityId === SLOT_3 && "attributes" in entity && entity.attributes) entity.attributes = { ...entity.attributes, name: "Generic PLA" };
    }
    return all;
  };
  const kOptions = (card: FakeCard): string[] => [...kSelect(card).options].map((option) => option.text);
  const kGroups = (card: FakeCard): string[] => [...kSelect(card).querySelectorAll("optgroup")].map((group) => group.label);

  it("names the K group as the Filament field does, kept or chosen", async () => {
    const { card } = await cardFor("x1c", {}, { devices: named(), callService: ownK(3) });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect([...(find<HTMLSelectElement>(card, "dialog select#fil-filament")?.options ?? [])][0]?.text).toBe("Keep Generic PLA");
    expect(kGroups(card)).toEqual(["Matching PLA"]);
    await pickFilament(card, "GFL99");
    expect(kGroups(card)).toEqual(["Matching PLA"]);
  });

  it("lists the kept K profile once, at the top", async () => {
    const { card } = await cardFor("x1c", {}, { devices: named(), callService: ownK(3) });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect(kOptions(card)).toEqual(["Keep Grey PLA matte (K 0.018)", "Printer's default (K 0.020)", "Generic PLA (K 0.020)"]);
    // Chosen anew, the filament has no kept profile: each of its own in the group.
    await pickFilament(card, "GFL99");
    expect(kOptions(card)).toEqual(["Printer's default (K 0.020)", "Generic PLA (K 0.020)", "Grey PLA matte (K 0.018)"]);
  });

  it("matches no K profile by a current one filed under no filament", async () => {
    const unfiled = {
      ...PROFILES,
      current: 4,
      profiles: [
        ...PROFILES.profiles,
        { index: 4, name: "Unfiled", k_value: 0.03, filament_id: "", nozzle: null },
        { index: 5, name: "Unfiled too", k_value: 0.04, filament_id: "", nozzle: null },
      ],
    };
    const answer = async (call: { service: string }): Promise<unknown> => {
      if (call.service === "get_k_profiles") return { response: unfiled };
      if (call.service === "get_filaments") throw new Error("no answer");
      return undefined;
    };
    const { card } = await cardFor("x1c", {}, { devices: named(), callService: answer });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect(kOptions(card)).toEqual(["Keep Unfiled (K 0.030)", "Printer's default (K 0.020)"]);
    expect(kGroups(card)).toEqual([]);
  });

  it("lists the slot's own filament's K profiles where the offer does not come", async () => {
    const failing = (): never => {
      throw new Error("no answer");
    };
    const { card } = await cardFor("x1c", {}, { devices: named(), callService: ownK(3, failing) });
    await showView(card, "Filament");
    await editRow(card, 2);
    // Filed under the filament of the slot's own profile (Grey PLA matte: GFL99).
    expect(kOptions(card)).toEqual(["Keep Grey PLA matte (K 0.018)", "Printer's default (K 0.020)", "Generic PLA (K 0.020)"]);
    expect(kGroups(card)).toEqual(["Matching Generic PLA"]);
  });

  it("names a profile of the slot the printer did not list", async () => {
    const own = async (call: { service: string }): Promise<unknown> => (call.service === "get_k_profiles" ? { response: { ...PROFILES, current: 7 } } : undefined);
    const { card } = await cardFor("x1c", {}, { devices: idle(), callService: own });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect([...kSelect(card).options].map((option) => option.text)[0]).toBe("Keep K profile no. 7");
    expect(text(find(card, "dialog .k-hint"))).toBe("If unsure, leave this as it is.");
  });
});

describe("a filament change", () => {
  const CHANGING = ["heating", "feeding", "retracting", "verifying", "purging", "changing_filament"];
  const WAIT = "Wait until the filament change is done.";

  it("waits with loading, moving and the nozzle choice; heating stays, cooling waits", async () => {
    for (const state of CHANGING) {
      const { card } = await cardFor("h2d", {}, { devices: h2d({ status: "idle", hms: [], amsStatus: state }) });
      await showView(card, "Filament");
      // Waiting is normal during a change: a note, no warning.
      expect(findAll(card, ".note").map(text), state).toEqual([WAIT]);
      expect(find(card, ".note.info"), state).not.toBeNull();
      const loading = findAll<HTMLButtonElement>(card, ".slot .btn");
      expect(loading.length, state).toBeGreaterThan(0);
      expect(loading.every((item) => item.disabled), state).toBe(true);
      await showView(card, "Control");
      expect(findAll(card, ".note").map(text), state).toEqual([WAIT]);
      expect(find(card, ".note.info"), state).not.toBeNull();
      expect(find(card, ".detection")?.nextElementSibling?.classList.contains("note"), state).toBe(true);
      expect(findAll<HTMLButtonElement>(card, ".pad button, .axis-col button, .nozzle-row button").every((item) => item.disabled), state).toBe(true);
      expect(button(card, `Left nozzle 5${NBSP}°C hotter`).disabled, state).toBe(false);
      expect(button(card, `Bed 5${NBSP}°C cooler`).disabled, state).toBe(false);
      // Cooling would break the change: switching off waits; the right nozzle is off: its power symbol heats, as + does.
      const powers = findAll<HTMLButtonElement>(card, ".heat-off").filter((item) => !item.getAttribute("aria-label")?.includes("heat to"));
      expect(powers.length, state).toBeGreaterThan(0);
      expect(powers.every((item) => item.disabled), state).toBe(true);
      expect(button(card, `Right nozzle: heat to 220${NBSP}°C`).disabled, state).toBe(false);
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
      expect(findAll<HTMLButtonElement>(card, ".heat-row .heat-off").every((item) => !item.disabled), state).toBe(true);
    }
  });

  it("lets a paused print resume only once the change is done, and says so in one note", async () => {
    const { card, hass } = await cardFor("h2d", {}, { devices: h2d({ amsStatus: "feeding" }) });
    const resume = (): HTMLButtonElement => button(card, "Resume print");
    expect(resume().disabled).toBe(true);
    expect(findAll(card, ".controls .note").map(text)).toEqual(["Wait until the filament change is done, then resume."]);
    await showView(card, "Filament");
    // No "you can change the filament now" beside the wait, no Resume.
    expect(find(card, ".callout")).toBeNull();
    expect(hasButton(card, "Resume print")).toBe(false);
    expect(findAll(card, ".note").map(text)).toEqual(["Wait until the filament change is done, then resume."]);
    expect(find(card, ".note.info")).not.toBeNull();
    // The change is done: the print can resume from here again.
    await update(card, hass.withState("sensor.h2d_ams_status", "idle"));
    expect(text(find(card, ".callout"))).toContain("Print paused: you can change the filament now.");
    expect(resume().disabled).toBe(false);
    await showView(card, "Status");
    expect(resume().disabled).toBe(false);
    expect(find(card, ".controls .note")).toBeNull();
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
    expect(text(find(card, ".note"))).toBe("Warte, bis der Filamentwechsel fertig ist.");
    await showView(card, "Steuerung");
    expect(text(find(card, ".note"))).toBe("Warte, bis der Filamentwechsel fertig ist.");
    const { card: paused } = await cardFor("h2d", { start_view: "filament" }, { language: "de", devices: h2d({ amsStatus: "purging" }) });
    expect(text(find(paused, ".note"))).toBe("Warte, bis der Filamentwechsel fertig ist, dann setze den Druck fort.");
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
    await press(card, "Dismiss the error");
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

  it("with an AMS unit plugged in again or unplugged, though the registries stay as they were", async () => {
    const [printer, ams] = x1c() as [FakeDevice, FakeDevice];
    const gone = amsDevice({ printer, amsId: 1, model: "AMS", slots: [{ name: "PLA Basic", type: "PLA", color: "#FF0000", trayId: 4 }], online: false });
    const hass = makeHass({ devices: [printer, ams, gone] });
    const card = await mountCard(hass, { printer: "dev-x1c" });
    // Unplugged: every slot of the unit unavailable while the printer is online.
    expect(findAll(card, ".ams-name").map(text)).toEqual(["AMS A", "Ext"]);
    // Plugged in again: its slot reports a filament.
    const back = hass.withState("sensor.dev-x1c_ams_1_slot_1", "PLA Basic", { slot: 1, tray_id: 4, type: "PLA", name: "PLA Basic", color: "#FF0000" });
    await update(card, back);
    expect(findAll(card, ".ams-name").map(text)).toEqual(["AMS A", "AMS B", "Ext"]);
    // The first unit unplugged while it is shown.
    let next = back;
    for (const slot of [1, 2, 3, 4]) next = next.withState(`sensor.dev-x1c_ams_0_slot_${slot}`, "unavailable", {});
    await update(card, next);
    expect(findAll(card, ".ams-name").map(text)).toEqual(["AMS B", "Ext"]);
  });

  it("with Home Assistant's translating formatter, its server's time zone and the user, each of which can come alone", async () => {
    const hass = makeHass({ devices: x1c() });
    // Home Assistant's first formatter, before the entity translations: the raw state.
    const raw: FakeHass = { ...hass, formatEntityState: (stateObj, state) => state ?? stateObj.state };
    const card = await mountCard(raw, { printer: "dev-x1c" });
    expect(text(find(card, ".state"))).toBe("printing");
    let next: FakeHass = { ...raw, formatEntityState: hass.formatEntityState };
    await update(card, next);
    expect(text(find(card, ".state"))).toBe("Printing");
    // The end time in the server's time zone.
    expect(findAll(card, ".meta span").map(text)).toContain("Ends 14:35");
    next = { ...next, config: { time_zone: "UTC" } };
    await update(card, next);
    expect(findAll(card, ".meta span").map(text)).toContain("Ends 12:35");
    // The device page is an administrator's.
    (find(card, ".menu-btn") as HTMLButtonElement).click();
    await settle(card);
    expect(hasButton(card, "Open device page")).toBe(true);
    await update(card, { ...next, user: { is_admin: false } });
    expect(hasButton(card, "Open device page")).toBe(false);
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
    expect(text(find(card, ".state"))).toBe("Druckt");
    expect(findAll(card, ".meta span").map(text)).toEqual(["Schicht 123 / 250", "noch 1 Std. 23 Min.", "Ende 14:35"]);
    expect(findAll(card, ".ctl-buttons .btn").map(text)).toEqual(["Druck pausieren", "Druck stoppen", "Objekte überspringen"]);
    expect(text(find(card, ".speed-label"))).toBe("Druckgeschwindigkeit");
    expect(findAll(card, ".speed .opt").map(text)).toEqual(["Leise", "Standard", "Sport", "Ludicrous"]);
  });
});

describe("the card the user composes", () => {
  /** The status view's parts below the head, by their first class. */
  const parts = (card: FakeCard): string[] => findAll(card, ".body > *").map((element) => element.classList[0] as string);

  it("shows the blocks in the default order: the print controls right under the job", async () => {
    const { card } = await cardFor("x1c");
    expect(parts(card)).toEqual(["job", "controls", "temps", "ams-strip", "fans", "speed"]);
  });

  it("shows the blocks in the user's order, and only those", async () => {
    const { card } = await cardFor("x1c", { status_blocks: ["fans", "temperatures", "speed"] });
    expect(parts(card)).toEqual(["job", "fans", "temps", "speed"]);
    expect(hasButton(card, "Pause print")).toBe(false);
    // The speed is a block of its own: pause and stop without it.
    const { card: controls } = await cardFor("x1c", { status_blocks: ["controls"] });
    expect(parts(controls)).toEqual(["job", "controls"]);
    expect(find(controls, ".speed")).toBeNull();
    expect(hasButton(controls, "Stop print")).toBe(true);
  });

  it("keeps the job and its state however few blocks are left", async () => {
    const { card } = await cardFor("x1c", { status_blocks: [] });
    expect(parts(card)).toEqual(["job"]);
    expect(text(find(card, ".state"))).toBe("Printing");
  });

  it("shows only the chips the user chose, in their order, and an HMS error whatever they are", async () => {
    const { card } = await cardFor("x1c", { header_chips: ["firmware"] });
    expect(findAll(card, ".pill").map((pill) => pill.classList[1])).toEqual(["firmware"]);
    const { card: ordered } = await cardFor("p1s", {}, { devices: p1s() });
    expect(findAll(ordered, ".pill").map((pill) => pill.classList[1])).toEqual(["network", "hms", "firmware"]);
    const { card: reordered } = await cardFor("p1s", { header_chips: ["firmware", "hms", "network"] }, { devices: p1s() });
    expect(findAll(reordered, ".pill").map((pill) => pill.classList[1])).toEqual(["firmware", "hms", "network"]);
    // The HMS line stays below the chips.
    expect(find(reordered, ".pills")?.nextElementSibling?.classList.contains("hms-line")).toBe(true);
    const error = { code: "0300_0100_0001_0004", severity: "error", description: "The nozzle is clogged." };
    const { card: none } = await withX1c({ hms: [error] }, { header_chips: [] });
    expect(find(none, ".pills")).toBeNull();
    expect(text(find(none, ".hms-line"))).toContain("The nozzle is clogged.");
  });

  it("asks for the plate only while no job runs: BamBuddy may not have reset it yet", async () => {
    const { card } = await withX1c({ status: "printing", plateClearNeeded: true });
    expect(find(card, ".callout")).toBeNull();
  });

  it("shows the print speed with the controls hidden, without choices", async () => {
    const { card } = await withX1c({ status: "printing" }, { read_only: true });
    expect(find(card, ".speeds")).toBeNull();
    expect(text(find(card, ".speed"))).toBe("Print speed Standard (100 %)");
  });

  it("hides the controls: no button that acts, no note about the key", async () => {
    const { card, hass } = await withX1c({ status: "finished", plateClearNeeded: true }, { read_only: true });
    expect(hasButton(card, "Chamber light")).toBe(false);
    expect(hasButton(card, "Plate cleared")).toBe(false);
    // No "tap here" without the button.
    expect(text(find(card, ".callout"))).toBe(
      "Take the print off the plate. BamBuddy starts the next queued print only once that is confirmed: in BamBuddy, or with “Plate cleared” in Home Assistant.",
    );
    // The Control tab shows its states, read-only.
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Control", "Filament"]);
    expect(findAll(card, ".note")).toHaveLength(0);
    // A temperature opens its sensor -- not its target, which could be set there.
    const opened: string[] = [];
    card.addEventListener("hass-more-info", (event) => opened.push((event as CustomEvent<{ entityId: string }>).detail.entityId));
    findAll<HTMLButtonElement>(card, ".temp")[0]?.click();
    expect(opened).toEqual(["sensor.x1c_nozzle_temperature"]);
    await showView(card, "Filament");
    expect(loadButtons(card)).toHaveLength(0);
    expect(hass.calls).toHaveLength(0);
    const { card: printing } = await cardFor("x1c", { read_only: true });
    expect(find(printing, ".controls")).toBeNull();
    // The speed as it is, without choices.
    expect(find(printing, ".speeds")).toBeNull();
    expect(find(printing, ".speed-now")).not.toBeNull();
  });

  it("leaves the tabs out the user switches off", async () => {
    const { card } = await cardFor("x1c", { show_control_tab: false });
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Filament"]);
    const { card: noFilament } = await cardFor("x1c", { show_filament_tab: false });
    expect(findAll(noFilament, "[role=tab]").map(text)).toEqual(["Status", "Control"]);
    // The colours stay, but lead nowhere: no button, no chevron.
    expect(find(noFilament, "div.ams-strip")).not.toBeNull();
    expect(find(noFilament, "button.ams-strip")).toBeNull();
    expect(find(noFilament, ".ams-go")).toBeNull();
    const { card: statusOnly } = await cardFor("x1c", { show_control_tab: false, show_filament_tab: false });
    expect(find(statusOnly, ".tabs")).toBeNull();
  });

  it("has no control view without sections, nor without control entities", async () => {
    const { card } = await cardFor("x1c", { control_sections: [] });
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Filament"]);
    const { card: readOnly } = await cardFor("readOnly");
    expect(findAll(readOnly, "[role=tab]").map(text)).toEqual(["Status", "Filament"]);
  });

  it("has no control view where the chosen sections have nothing to show", async () => {
    const tabs = (card: FakeCard): string[] => findAll(card, "[role=tab]").map(text);
    // A P1S has no detection switches: the print options alone show nothing.
    const { card } = await cardFor("p1s", { control_sections: ["options"] }, { devices: p1s() });
    expect(tabs(card)).toEqual(["Status", "Filament"]);
    const { card: heating } = await cardFor("p1s", { control_sections: ["options", "heating"] }, { devices: p1s() });
    expect(tabs(heating)).toEqual(["Status", "Control", "Filament"]);
    // Heating needs a target to set; the user may have disabled them.
    const [printer] = p1s() as [FakeDevice];
    const noTargets = { ...printer, entities: printer.entities.filter((entity) => !entity.entityId.startsWith("number.")) };
    const { card: cold } = await cardFor("p1s", { control_sections: ["heating", "options"] }, { devices: [noTargets] });
    expect(tabs(cold)).toEqual(["Status", "Filament"]);
    // Moving is always there.
    const { card: moving } = await cardFor("p1s", { control_sections: ["options", "motion"] }, { devices: [noTargets] });
    expect(tabs(moving)).toEqual(["Status", "Control", "Filament"]);
  });

  it("opens on the tab the user chose, where the card has it", async () => {
    const { card } = await cardFor("x1c", { start_view: "filament" });
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Filament");
    expect(find(card, ".unit")).not.toBeNull();
    // Hide controls with only the axes: no Control tab, so Status.
    const { card: control } = await cardFor("x1c", { start_view: "control", read_only: true, control_sections: ["motion"] });
    expect(text(find(control, '[role=tab][aria-selected="true"]'))).toBe("Status");
  });

  it("orders the control view's sections as the user chose", async () => {
    const { card } = await cardFor("x1c", { start_view: "control", control_sections: ["motion", "heating"] });
    const order = findAll(card, ".body > *")
      .map((element) => element.classList[0])
      .filter((name) => name === "heating" || name === "control" || name === "detection");
    expect(order).toEqual(["control", "heating"]);
    expect(find(card, ".detection")).toBeNull();
  });
});

describe("folding the AMS units", () => {
  /** Three AMS units on the X1C: its AMS and two AMS 2 Pro, the first of
   * them feeding. */
  const threeUnits = (): FakeDevice[] => {
    const [printer, ams] = x1c() as [FakeDevice, FakeDevice];
    const pro = (amsId: number, active = false): FakeDevice =>
      amsDevice({
        printer,
        amsId,
        model: "AMS 2 Pro",
        humidity: 18,
        temperature: 26,
        slots: [
          { name: "PETG HF", type: "PETG", color: "#1A2B8C", remaining: 76, trayId: amsId * 4, active },
          { name: "PLA Basic", type: "PLA", color: "#000000", remaining: 52, trayId: amsId * 4 + 1 },
        ],
        drying: { on: false, remaining: 0 },
      });
    return [printer, ams, pro(1, true), pro(2)];
  };
  const heads = (card: FakeCard): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, "button.unit-head");

  it("shows the slots of one or two units at once", async () => {
    const { card } = await cardFor("h2d", { start_view: "filament" });
    expect(heads(card).map((head) => head.getAttribute("aria-expanded"))).toEqual(["true", "true"]);
    expect(findAll(card, ".unit .slots")).toHaveLength(3);
  });

  it("folds from three units on: the head, the colours with the one in use, the drying", async () => {
    const { card } = await cardFor("x1c", { start_view: "filament" }, { devices: threeUnits() });
    expect(heads(card).map((head) => head.getAttribute("aria-expanded"))).toEqual(["false", "false", "false"]);
    expect(findAll(card, ".unit-colors")).toHaveLength(3);
    expect(findAll(card, ".unit")[1]?.querySelectorAll(".unit-colors .swatch.active")).toHaveLength(1);
    // Drying stays a tap away, outside the head's button.
    expect(findAll(card, ".unit .drying .btn").map(text)).toEqual(["Dry", "Dry"]);
    expect(find(card, ".unit-head .btn")).toBeNull();
    // External spools never fold: their slots are the only ones shown.
    expect(findAll(card, ".unit .slots")).toHaveLength(1);
  });

  it("unfolds and folds a unit with a tap, the others as they were", async () => {
    const { card } = await cardFor("x1c", { start_view: "filament" }, { devices: threeUnits() });
    heads(card)[1]?.click();
    await card.updateComplete;
    expect(heads(card).map((head) => head.getAttribute("aria-expanded"))).toEqual(["false", "true", "false"]);
    const region = find(card, ".unit.open .slots");
    expect(region?.getAttribute("role")).toBe("region");
    expect(region?.getAttribute("aria-label")).toBe("AMS B");
    expect(heads(card)[1]?.getAttribute("aria-controls")).toBe(region?.id);
    expect(heads(card)[0]?.hasAttribute("aria-controls")).toBe(false);
    heads(card)[1]?.click();
    await card.updateComplete;
    expect(findAll(card, ".unit.open")).toHaveLength(0);
  });

  it("follows the user's choice, and forgets the taps when the configuration changes", async () => {
    const { card } = await cardFor("h2d", { start_view: "filament", ams_folding: "folded" });
    expect(heads(card).map((head) => head.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
    heads(card)[0]?.click();
    await card.updateComplete;
    expect(heads(card)[0]?.getAttribute("aria-expanded")).toBe("true");
    card.setConfig({ type: "custom:bambuddy-printer-card", printer: "dev-h2d", start_view: "filament", ams_folding: "folded" });
    await card.updateComplete;
    expect(heads(card)[0]?.getAttribute("aria-expanded")).toBe("false");
    const { card: open } = await cardFor("x1c", { start_view: "filament", ams_folding: "open" }, { devices: threeUnits() });
    expect(findAll(open, ".unit.open")).toHaveLength(3);
  });

  it("offers to resume a paused print where the filament is changed", async () => {
    const { card, hass } = await cardFor("h2d", { start_view: "filament" });
    expect(text(find(card, ".callout"))).toContain("Print paused: you can change the filament now.");
    await press(card, "Resume print");
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "button.h2d_resume" });
    const { card: readOnly } = await cardFor("h2d", { start_view: "filament", read_only: true });
    expect(find(readOnly, ".callout")).toBeNull();
    const { card: printing } = await cardFor("x1c", { start_view: "filament" });
    expect(find(printing, ".callout")).toBeNull();
  });

  it("sends the user to the printer's message first where the printer paused the print itself", async () => {
    const { card, hass } = await cardFor("h2d", { start_view: "filament" });
    await update(card, hass.withState("sensor.h2d_print_stage", "paused_nozzle_clog", {}));
    const note = text(find(card, ".callout"));
    expect(note).toContain("The printer paused the print: deal with its message first. You can change the filament here, then resume.");
    expect(note).not.toContain("you can change the filament now");
    expect(hasButton(card, "Resume print")).toBe(true);
    // A run-out and a G-code pause are pauses for the filament; a stage
    // outside "paused_*" is no fault either.
    for (const stage of ["paused_filament_runout", "paused_by_gcode", "paused_by_user", "m400_pause"]) {
      await update(card, hass.withState("sensor.h2d_print_stage", stage, {}));
      expect(text(find(card, ".callout"))).toContain("Print paused: you can change the filament now.");
    }
  });
});

describe("texts in a state's colour, the plugs' too", () => {
  it("mix the tone with the text colour; the icons keep the pure tone", () => {
    const sheet = styleText();
    expect(sheet).toMatch(/\.p-row\.warn \.p-sub\s*\{[^}]*color: color-mix\(in srgb, var\(--bb-warn\) 55%, var\(--bb-text\)\);/);
    expect(sheet).toMatch(/\.p-row\.warn \.p-icon\s*\{[^}]*color: var\(--bb-warn\);/);
    expect(sheet).toMatch(/\.p-auto\.waiting \.p-name,\s*\.p-starting \.p-name\s*\{[^}]*color: color-mix\(in srgb, var\(--bb-accent\) 55%, var\(--bb-text\)\);/);
    expect(sheet).toMatch(/\.p-auto\.waiting \.p-icon\s*\{[^}]*color: var\(--bb-accent\);/);
    expect(sheet).toMatch(/\.hms-wiki\s*\{[^}]*color: color-mix\(in srgb, var\(--bb-accent\) 55%, var\(--bb-text\)\);/);
  });
});

describe("texts in a state's colour", () => {
  const css = styleText;
  const mixed = (tone: string): string => `color: color-mix\\(in srgb, var\\(${tone}\\) 55%, var\\(--bb-text\\)\\)`;

  it("mix the colour with the text colour; the icons keep the colour", () => {
    const sheet = css();
    const rules: [string, string][] = [
      ["\\.state", "--tone"],
      ["\\.pct", "--tone"],
      ["\\.slot-sub \\.in-use", "--bb-accent"],
      ["\\.ams-activity", "--bb-accent"],
      ["\\.spec-value\\.update", "--bb-warn"],
    ];
    // The rule of the selector itself: after a rule or a comment.
    for (const [selector, tone] of rules) expect(sheet, selector).toMatch(new RegExp(`(^|[}/])\\s*${selector}\\s*\\{[^}]*${mixed(tone)}`));
    expect(sheet).toMatch(/\.state \.icon\s*\{[^}]*color: var\(--tone\)/);
    expect(sheet).toMatch(/\.ams-activity \.icon,\s*\.activity \.icon\s*\{[^}]*color: var\(--bb-accent\)/);
  });

  // Home Assistant's default colours: of the 2025.5 floor -- the card's
  // fallbacks -- and of today's frontend (20260930), light and dark.
  const THEMES = [
    { name: "2025.5 light", text: "#212121", muted: "#727272", background: "#ffffff", accent: "#03a9f4" },
    { name: "2025.5 dark", text: "#e1e1e1", muted: "#9b9b9b", background: "#1c1c1c", accent: "#03a9f4" },
    { name: "2026.10 light", text: "#141414", muted: "#5e5e5e", background: "#ffffff", accent: "#009ac7" },
    { name: "2026.10 dark", text: "#e1e1e1", muted: "#9b9b9b", background: "#1c1c1c", accent: "#009ac7" },
  ];
  const ERROR = "#db4437";
  type Rgb = number[];
  const rgb = (hex: string): Rgb => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  const luminance = (channels: Rgb): number => {
    const [r, g, b] = channels.map((value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: Rgb, b: Rgb): number => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (light + 0.05) / (dark + 0.05);
  };
  /** color-mix in srgb mixes the channels as they are written; a colour
   * mixed with transparent is that colour at the share as its opacity. */
  const mix = (a: Rgb, b: Rgb, share: number): Rgb => a.map((value, index) => share * value + (1 - share) * (b[index] as number));
  /** The share of a rule's color-mix: `property: color-mix(in srgb, var(--x) N%, ...)`. */
  const share = (selector: string, property: string, variable: string): number => {
    const found = new RegExp(`(^|[}/])\\s*${selector}\\s*\\{[^}]*${property}: color-mix\\(in srgb, var\\(${variable}\\) (\\d+)%`).exec(css());
    expect(found, `${selector} ${property}`).not.toBeNull();
    return Number(found?.[2]) / 100;
  };

  it("reach 4.5:1 with Home Assistant's default colours, light and dark", () => {
    const state = share("\\.state", "color", "--tone");
    for (const theme of THEMES) {
      // Accent and info, warning, success, error, the muted text.
      for (const tone of [theme.accent, "#039be5", "#ffa600", "#43a047", ERROR, theme.muted]) {
        expect(contrast(mix(rgb(tone), rgb(theme.text), state), rgb(theme.background)), `${tone} in ${theme.name}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("color the buttons' and the chosen options' texts the same way: 4.5:1 on their tints", () => {
    const sheet = css();
    const tonal = share("\\.btn", "color", "--bb-accent");
    const tonalTint = share("\\.btn", "background", "--bb-accent");
    const danger = share("\\.btn\\.danger", "color", "--bb-err");
    const dangerTint = share("\\.btn\\.danger", "background", "--bb-err");
    const chosen = share('\\.seg button\\[aria-checked="true"\\]', "color", "--bb-accent");
    const chosenTint = share('\\.seg button\\[aria-checked="true"\\]', "background", "--bb-accent");
    const tag = share("\\.heat-label \\.heat-tag", "color", "--bb-accent");
    const tagTint = share("\\.heat-label \\.heat-tag", "background", "--bb-accent");
    const chip = share("\\.chip", "color", "--tone");
    const chipTint = share("\\.chip", "background", "--tone");
    // The question's red button: the theme's red, darkened for its white text.
    const filled = share("\\.dlg-actions \\.btn\\.danger", "background", "--bb-err");
    expect(sheet).toMatch(/\.dlg-actions \.btn\.danger\s*\{[^}]*color: #fff;/);
    // A text button has no tint of its own: the tonal button's colour.
    expect(sheet).toMatch(/\.btn\.plain\s*\{\s*background: none;\s*padding: 0 8px;\s*\}/);
    // The camera's panel is dark in every theme: its button stays white.
    expect(sheet).toMatch(/\.live\.failed \.btn\s*\{[^}]*color: #fff;/);
    // The speeds' percentages read as their names do.
    expect(sheet).toMatch(/\.seg\.speeds \.opt-sub\s*\{[^}]*opacity: 1;/);
    for (const theme of THEMES) {
      const [text, background, accent, muted] = [rgb(theme.text), rgb(theme.background), rgb(theme.accent), rgb(theme.muted)];
      // The segments and the heating section lie on a 5 % tint of the text colour.
      const tint = mix(text, background, 0.05);
      const pairs: [string, Rgb, Rgb][] = [
        ["tonal button", mix(accent, text, tonal), mix(accent, background, tonalTint)],
        ["text button", mix(accent, text, tonal), background],
        ["text button on a tint", mix(accent, text, tonal), tint],
        ["danger button", mix(rgb(ERROR), text, danger), mix(rgb(ERROR), background, dangerTint)],
        ["filled danger button", [255, 255, 255], mix(rgb(ERROR), [0, 0, 0], filled)],
        ["chosen option", mix(accent, text, chosen), mix(accent, tint, chosenTint)],
        ["active nozzle tag", mix(accent, text, tag), mix(accent, tint, tagTint)],
        ...["#43a047", "#ffa600", ERROR, theme.muted].map((tone): [string, Rgb, Rgb] => [`chip ${tone}`, mix(rgb(tone), text, chip), mix(rgb(tone), background, chipTint)]),
      ];
      // 2025.5's own secondary text reaches 4.4:1 on such a tint; today's 5.9:1.
      if (!theme.name.startsWith("2025.5 light")) pairs.push(["speed percentage", muted, tint]);
      for (const [name, foreground, behind] of pairs) expect(contrast(foreground, behind), `${name} in ${theme.name}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the menu on a narrow card at the screen's left edge", () => {
  it("is moved onto the screen", async () => {
    const { card } = await cardFor("x1c");
    const box = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return (this.classList.contains("menu") ? { left: -30, right: 170, width: 200, top: 0, bottom: 100, height: 100 } : { left: 0, right: 0, width: 0, top: 0, bottom: 0, height: 0 }) as DOMRect;
    });
    try {
      (find(card, ".menu-btn") as HTMLButtonElement).click();
      await card.updateComplete;
      expect((find(card, ".menu") as HTMLElement).style.translate).toBe("38px 0");
    } finally {
      box.mockRestore();
    }
    // Where it fits, it stays.
    (find(card, ".menu-btn") as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, ".menu-btn") as HTMLButtonElement).click();
    await card.updateComplete;
    expect((find(card, ".menu") as HTMLElement).style.translate).toBe("");
  });
});

describe("a press that takes its own control away", () => {
  it("leaves the keyboard on the selected tab, not on the page", async () => {
    const { card, hass } = await withX1c({ status: "finished", stage: "idle", progress: 100, remaining: 0, plateClearNeeded: true });
    const plate = button(card, "Plate cleared");
    plate.focus();
    plate.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }));
    plate.click();
    await settle(card);
    await update(card, hass.withState("binary_sensor.x1c_plate_clear_needed", "off"));
    await card.updateComplete;
    expect(root(card).activeElement).toBe(find(card, '.tabs [aria-selected="true"]'));
  });

  it("moves no focus for a mouse: no key was pressed in the card", async () => {
    const { card, hass } = await withX1c({ status: "finished", stage: "idle", progress: 100, remaining: 0, plateClearNeeded: true });
    button(card, "Plate cleared").focus();
    button(card, "Plate cleared").click();
    await settle(card);
    await update(card, hass.withState("binary_sensor.x1c_plate_clear_needed", "off"));
    await card.updateComplete;
    expect(root(card).activeElement).not.toBe(find(card, '.tabs [aria-selected="true"]'));
  });
});

describe("a command on its way", () => {
  it("turns its button's icon into a small spinner, still for those who ask for less motion", () => {
    const sheet = styleText();
    expect(sheet).toMatch(/\.icon-btn\.pending\s*\{[^}]*cursor: progress;/);
    // The head's round buttons too: the light.
    expect(sheet).toMatch(/\.btn\.pending > \.icon,\s*\.icon-btn\.pending > \.icon\s*\{[^}]*border: 2px solid currentColor;[^}]*border-right-color: transparent;[^}]*border-radius: 50%;[^}]*animation: spin/);
    expect(sheet).toMatch(/\.btn\.pending > \.icon path,\s*\.icon-btn\.pending > \.icon path\s*\{[^}]*display: none;/);
    expect(atRule("@media (prefers-reduced-motion: reduce)")).toMatch(/\.btn\.pending > \.icon,\s*\.icon-btn\.pending > \.icon/);
  });

  it("is marked on its button while it runs", async () => {
    let finish: () => void = () => undefined;
    const { card } = await cardFor("x1c", {}, { callService: () => new Promise((resolve) => (finish = () => resolve(undefined))) });
    button(card, "Pause print").click();
    await card.updateComplete;
    expect(button(card, "Pause print").classList.contains("pending")).toBe(true);
    expect(button(card, "Pause print").getAttribute("aria-busy")).toBe("true");
    finish();
    await settle(card);
    expect(button(card, "Pause print").classList.contains("pending")).toBe(false);
    button(card, "Chamber light").click();
    await card.updateComplete;
    expect(button(card, "Chamber light").classList.contains("pending")).toBe(true);
    expect(button(card, "Chamber light").getAttribute("aria-busy")).toBe("true");
    finish();
    await settle(card);
    expect(button(card, "Chamber light").classList.contains("pending")).toBe(false);
  });

  it("keeps the keyboard on its button, which takes no second press meanwhile", async () => {
    let finish: () => void = () => undefined;
    const { card, hass } = await cardFor("x1c", {}, { callService: () => new Promise((resolve) => (finish = () => resolve(undefined))) });
    button(card, "Pause print").focus();
    button(card, "Pause print").click();
    await card.updateComplete;
    const pause = button(card, "Pause print");
    expect([pause.disabled, pause.getAttribute("aria-disabled")]).toEqual([false, "true"]);
    expect(root(card).activeElement).toBe(pause);
    pause.click();
    await card.updateComplete;
    expect(hass.calls).toHaveLength(1);
    finish();
    await settle(card);
    expect(button(card, "Pause print").getAttribute("aria-disabled")).toBeNull();

    // A switch: a second tap meanwhile flips nothing.
    button(card, "Chamber light").focus();
    button(card, "Chamber light").click();
    await card.updateComplete;
    const light = button(card, "Chamber light");
    expect([light.disabled, light.getAttribute("aria-disabled"), root(card).activeElement === light]).toEqual([false, "true", true]);
    const shown = light.classList.contains("on");
    light.click();
    await card.updateComplete;
    expect(hass.calls.filter((call) => call.domain === "light")).toHaveLength(1);
    expect(button(card, "Chamber light").classList.contains("on")).toBe(shown);
    finish();
    await settle(card);
  });

  it("keeps a radio group usable by keyboard while a choice is sent", async () => {
    let finish: () => void = () => undefined;
    const { card, hass } = await cardFor("x1c", {}, { callService: () => new Promise((resolve) => (finish = () => resolve(undefined))) });
    const speeds = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".speed [role=radio]");
    speeds()[2]?.focus();
    speeds()[2]?.click();
    await card.updateComplete;
    expect(speeds().map((item) => [item.disabled, item.getAttribute("aria-disabled")])).toEqual([
      [false, "true"],
      [false, "true"],
      [false, "true"],
      [false, "true"],
    ]);
    expect(root(card).activeElement).toBe(speeds()[2]);
    speeds()[3]?.click();
    await card.updateComplete;
    expect(hass.calls.filter((call) => call.domain === "select")).toHaveLength(1);
    finish();
    await settle(card);
  });
});

describe("the dialogs", () => {
  it("stand out from the page in a dark theme: the theme's dialog surface, an edge, a darker backdrop", () => {
    const sheet = styleText();
    expect(sheet).toMatch(/(^|[}/])\s*dialog\s*\{[^}]*--bb-surface: var\(--ha-dialog-surface-background, var\(--mdc-theme-surface, var\(--card-background-color, #fff\)\)\);[^}]*background: var\(--bb-surface\);/);
    expect(sheet).toMatch(/(^|[}/])\s*dialog\s*\{[^}]*box-shadow:\s*0 0 0 1px var\(--bb-divider\),/);
    expect(sheet).toMatch(/dialog::backdrop\s*\{[^}]*background: rgba\(0, 0, 0, 0\.55\);/);
    // What lies on the dialog takes its surface, not the card's.
    expect(sheet).toMatch(/\.select select\s*\{[^}]*background: var\(--bb-surface\);/);
    expect(sheet).toMatch(/\.pal\[aria-checked="true"\]\s*\{[^}]*0 0 0 2px var\(--bb-surface\),/);
  });

  it("take up to 440 px, and the screen less 16 px a side where it is narrower: every dialog alike", () => {
    const sheet = styleText();
    expect(sheet).toMatch(/(^|[}/])\s*dialog\s*\{[^}]*max-width: min\(440px, calc\(100vw - 32px\)\);[^}]*width: 100%;/);
    // One rule for all of them: no dialog keeps a width of its own (the
    // menu is no dialog: it takes its items' width).
    const rules = [...sheet.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]*)\{([^{}]*)\}/g)].map(([, selector, body]): [string, string] => [selector?.trim() ?? "", body ?? ""]);
    const widths = rules.filter(([selector, body]) => /^dialog(\b|[.[:])/.test(selector) && !selector.includes("::backdrop") && /max-width/.test(body));
    expect(widths.map(([selector]) => selector)).toEqual(["dialog"]);
  });

  it("the tints and lines come from the theme's text colour itself, not from its rgb triple", () => {
    // Home Assistant computes --rgb-primary-text-color only from a theme's
    // own hex value: a theme naming its text colour by a variable keeps the
    // light default, dark grey under white text.
    const sheet = styleText();
    expect(sheet).not.toContain("--rgb-primary-text-color");
    expect(sheet).toMatch(/--bb-tint: color-mix\(in srgb, var\(--bb-text\) 5%, transparent\);/);
    expect(sheet).toMatch(/--bb-tint-2: color-mix\(in srgb, var\(--bb-text\) 9%, transparent\);/);
    expect(sheet).toMatch(/--bb-line: color-mix\(in srgb, var\(--bb-text\) 16%, transparent\);/);
  });

  it("and the menu are never see-through: the theme's colour at full strength, where the browser can take its alpha away", () => {
    const sheet = styleText();
    expect(sheet).toMatch(
      /@supports \(color: rgb\(from red r g b \/ 1\)\)\s*\{\s*dialog\s*\{[^}]*--bb-surface: rgb\(from var\(--ha-dialog-surface-background, var\(--mdc-theme-surface, var\(--card-background-color, #fff\)\)\) r g b \/ 1\);\s*\}\s*\.menu\s*\{[^}]*background: rgb\(from var\(--ha-card-background, var\(--card-background-color, #fff\)\) r g b \/ 1\);/,
    );
  });
});

describe("the layout of a narrow card and on a touch screen", () => {
  /** A rule of a style sheet's part: its selector right after a rule or the start. */
  const rule = (selector: string, declarations: string): RegExp =>
    new RegExp(`(^|[}/])\\s*${selector}\\s*\\{[^}]*${declarations}`);

  it("puts a notice's button below its text where both do not fit side by side", () => {
    const sheet = styleText();
    expect(sheet).toMatch(rule("\\.callout", "flex-wrap: wrap;"));
    // The text stays beside its icon on a half-width card too.
    expect(sheet).toMatch(rule("\\.callout > span", "flex: 1 1 150px;"));
    // On a phone, the button takes the notice's full width below the text.
    expect(atRule("@container (max-width: 400px)")).toMatch(rule("\\.callout \\.btn", "flex: 1 0 100%;[^}]*margin: 4px 0 0;"));
  });

  it("keeps the strip's chips readable in both themes", () => {
    // In a selector list with the model chip.
    expect(styleText()).toMatch(/\.ams-strip \.ams-nozzle\s*\{[^}]*background: var\(--bb-tint-2\);[^}]*color: color-mix\(in srgb, var\(--bb-muted\) 50%, var\(--bb-text\)\);/);
  });

  it("keeps the control view within a half-width card", () => {
    const sheet = styleText();
    const narrow = atRule("@container (max-width: 280px)");
    // One column: the step, the pad, the bed, the extruder.
    expect(narrow).toMatch(rule("\\.control", 'grid-template-areas: "step" "pad" "bed" "ext";'));
    expect(narrow).toMatch(rule("\\.pad", "grid-template-columns: repeat\\(3, 40px\\);[^}]*grid-template-rows: repeat\\(3, 40px\\);"));
    expect(narrow).toMatch(rule("\\.pad \\.btn", "width: 40px;[^}]*height: 40px;"));
    expect(narrow).toMatch(rule("\\.axis-col\\.bed", "flex-direction: row;"));
    // A heater's name and Off on a row, its steppers below with the whole
    // width: beside a thumb's 44 px Off they would shrink under 24 px.
    expect(narrow).toMatch(rule("\\.heat-name", "grid-column: 1;[^}]*grid-row: 1;"));
    expect(narrow).toMatch(rule("\\.heat-row \\.heat-off", "grid-column: 2;[^}]*grid-row: 1;"));
    // The place of a power symbol that cannot be used, beside it.
    expect(narrow).toMatch(rule("\\.heat-row \\.heat-off-space", "grid-column: 2;[^}]*grid-row: 1;"));
    expect(narrow).toMatch(rule("\\.heat-set", "grid-column: 1 / -1;"));
    expect(narrow).toMatch(rule("\\.heat-target", "min-width: 44px;"));
    // A heater's name wraps in whole words, never cut ("Right nozzle").
    expect(sheet).toMatch(rule("\\.heat-label \\.heat-text", "white-space: normal;[^}]*overflow: visible;[^}]*overflow-wrap: break-word;"));
    // A heating tile's target in the readable mix, its icon in the pure tone.
    expect(sheet).toMatch(rule("\\.temp\\.heating \\.temp-head \\.icon", "color: var\\(--bb-heat\\);"));
    // A heater that is on, in the Control tab: its icon in the same tone.
    expect(sheet).toMatch(rule("\\.heat-name\\.on \\.heat-label \\.icon", "color: var\\(--bb-heat\\);"));
    expect(sheet).toMatch(rule("\\.temp\\.heating \\.temp-target", "color: color-mix\\(in srgb, var\\(--bb-heat\\) 55%, var\\(--bb-text\\)\\);"));
    // Two temperature tiles a row.
    expect(narrow).toMatch(rule("\\.temps", "grid-template-columns: repeat\\(2, minmax\\(0, 1fr\\)\\);"));
    // After the step below 340 px, so that it wins.
    expect(sheet.indexOf("@container (max-width: 280px)")).toBeGreaterThan(sheet.indexOf("@container (max-width: 340px)"));
  });

  it("lets the drying row wrap: the state keeps its words, the hint a line of its own, the button at the right", () => {
    const sheet = styleText();
    expect(sheet).toMatch(rule("\\.drying", "display: flex;[^}]*flex-wrap: wrap;"));
    expect(sheet).toMatch(rule("\\.drying > span", "flex: 1 1 auto;"));
    expect(sheet).toMatch(rule("\\.drying > \\.btn", "margin-left: auto;"));
    expect(sheet).toMatch(rule("\\.drying > \\.dry-where", "flex: 1 0 100%;"));
    // A slot's sub line never widens the card.
    expect(sheet).toMatch(rule("\\.slots", "grid-template-columns: minmax\\(0, 1fr\\);"));
  });

  it("keeps every action within a half-width card on a phone (under 200 px)", () => {
    const tiny = atRule("@container (max-width: 200px)");
    // From 280 px down a slot's buttons below its name; from 260 px a
    // notice's button below its text, the job's words below its picture.
    const half = atRule("@container (max-width: 280px)");
    expect(half).toMatch(rule("\\.slot", "flex-wrap: wrap;"));
    expect(half).toMatch(rule("\\.slot-main", "flex: 1 0 100%;"));
    // The switch-off's row no longer indented beside the wrapped plug rows.
    expect(half).toMatch(rule("\\.p-auto,\\s*\\.p-set", "padding-left: 0;"));
    const narrow = atRule("@container (max-width: 260px)");
    // The backup's "Unknown" under its text.
    expect(narrow).toMatch(rule("\\.backup \\.det-row\\.choosing \\.det-text", "flex: 1 0 100%;"));
    expect(narrow).toMatch(rule("\\.callout \\.btn", "white-space: normal;"));
    expect(narrow).toMatch(rule("\\.callout > \\.icon", "display: none;"));
    // The name on a row of its own, whole words; the HMS line keeps its text.
    expect(tiny).toMatch(rule("\\.head", "flex-wrap: wrap;"));
    expect(tiny).toMatch(rule("\\.names", "flex: 1 0 100%;[^}]*order: -1;"));
    // The dot left, the light and the menu right, the chips under the name.
    expect(tiny).toMatch(rule("\\.head \\.dot", "margin-right: auto;"));
    // The job's words below its picture; one temperature a row.
    expect(narrow).toMatch(rule("\\.job", "flex-wrap: wrap;"));
    expect(narrow).toMatch(rule("\\.job-info", "flex: 1 0 100%;"));
    expect(tiny).toMatch(rule("\\.temps,\\s*\\.temps\\.n1,\\s*\\.temps\\.n2,\\s*\\.temps\\.n4,\\s*\\.temps\\.dual", "grid-template-columns: minmax\\(0, 1fr\\);"));
    // Controls and their labels wrap rather than leave the card.
    expect(narrow).toMatch(rule("\\.ctl-buttons \\.btn,\\s*\\.drying > \\.btn", "white-space: normal;"));
    expect(narrow).toMatch(rule("\\.nozzle-row", "flex-wrap: wrap;"));
    expect(narrow).toMatch(rule("\\.det-head", "flex-wrap: wrap;"));
    expect(narrow).toMatch(rule("\\.ext-buttons", "flex-direction: column;"));
    // The tabs as icons: their names, too long here, only for a screen
    // reader -- never cut or broken mid-word.
    expect(tiny).toMatch(rule("\\.tabs \\.tab-icon", "display: inline-flex;"));
    expect(tiny).toMatch(rule("\\.tabs \\.tab-text", "position: absolute;[^}]*clip: rect\\(0 0 0 0\\);"));
    expect(styleText()).toMatch(rule("\\.tabs \\.tab-icon", "display: none;"));
    expect(tiny).not.toMatch(rule("\\.tabs button", "text-overflow: ellipsis;"));
    expect(tiny).toMatch(rule("\\.name", "overflow-wrap: break-word;"));
    expect(tiny).toMatch(rule("\\.hms-line-more", "display: none;"));
    const sheet = styleText();
    expect(sheet.indexOf("@container (max-width: 200px)")).toBeGreaterThan(sheet.indexOf("@container (max-width: 280px)"));
  });

  it("gives a thumb 44 px for the light, the menu and a heater's off button", () => {
    const touch = atRule("@media (pointer: coarse)");
    expect(touch).toMatch(rule("\\.head \\.icon-btn", "width: 44px;[^}]*height: 44px;"));
    expect(touch).toMatch(rule("\\.heat-row \\.btn\\.heat-off", "width: 44px;[^}]*height: 44px;[^}]*min-height: 44px;"));
    expect(touch).toMatch(rule("\\.heat-row \\.heat-off-space", "width: 44px;[^}]*height: 44px;"));
    // After the narrow card's smaller steppers, so that it wins there too.
    const sheet = styleText();
    expect(sheet.lastIndexOf("@media (pointer: coarse)")).toBeGreaterThan(sheet.indexOf("@container (max-width: 280px)"));
    // Beside them the name takes its own row from 220 px down, in whole words.
    expect(sheet.slice(sheet.lastIndexOf("@media (pointer: coarse)"))).toMatch(
      /@container \(max-width: 220px\)\s*\{[^@]*\.names\s*\{[^}]*flex: 1 0 100%;[^}]*order: -1;/,
    );
  });
});

describe("the card as Home Assistant uses it", () => {
  it("sizes itself for the masonry and the sections dashboards", async () => {
    const { card } = await cardFor("x1c");
    expect(card.getCardSize()).toBe(11);
    expect(card.getGridOptions()).toEqual({ columns: 12, min_columns: 6, rows: "auto" });
    // The job and the head; each block adds its rows.
    card.setConfig({ type: "custom:bambuddy-printer-card", status_blocks: [] });
    expect(card.getCardSize()).toBe(4);
    card.setConfig({ type: "custom:bambuddy-printer-card", status_blocks: ["temperatures", "fans"] });
    expect(card.getCardSize()).toBe(7);
    const fresh = document.createElement("bambuddy-printer-card") as FakeCard;
    expect(fresh.getCardSize()).toBe(11);
  });

  it("starts from the picker with the first printer and nothing else: the editor shows the defaults", () => {
    expect(BamBuddyPrinterCard.getStubConfig(makeHass({ devices: [instanceDevice, ...a1mini(), ...x1c()] }))).toEqual({ printer: "dev-a1mini" });
    // The preview shows a printer that is online, if there is one.
    expect(BamBuddyPrinterCard.getStubConfig(makeHass({ devices: [...offlineP1s(), ...x1c()] }))).toEqual({ printer: "dev-x1c" });
    expect(BamBuddyPrinterCard.getStubConfig(makeHass({ devices: offlineP1s() }))).toEqual({ printer: "dev-p1s" });
    expect(BamBuddyPrinterCard.getStubConfig(makeHass())).toEqual({});
    expect(BamBuddyPrinterCard.getStubConfig()).toEqual({});
  });

  it("has its own editor, so Home Assistant's form is not described twice", () => {
    expect("getConfigForm" in BamBuddyPrinterCard).toBe(false);
    expect(typeof BamBuddyPrinterCard.getConfigElement).toBe("function");
  });
});

/** The card as Home Assistant's card editor shows it: in its dialog. */
async function previewOf(
  name: keyof typeof PRINTERS,
  config: Record<string, unknown> = {},
  language = "en",
  devices?: FakeDevice[],
): Promise<FakeCard> {
  const [make, printer] = PRINTERS[name] as [() => FakeDevice[], string];
  const card = document.createElement("bambuddy-printer-card") as FakeCard;
  card.preview = true;
  card.setConfig({ type: "custom:bambuddy-printer-card", printer, ...config });
  card.hass = makeHass({ devices: devices ?? make(), language });
  const dialog = document.createElement("hui-dialog-edit-card");
  dialog.attachShadow({ mode: "open" }).append(card);
  document.body.append(dialog);
  await card.updateComplete;
  return card;
}

const samples = (card: FakeCard): string[] => findAll(card, ".sample .sample-note").map(text);

describe("the preview in the editor", () => {
  it("shows every chosen section, one with nothing to show now as an example, in its place", async () => {
    // Idle: no print controls, no print speed -- as examples, where the list puts them.
    const card = await previewOf("a1mini", { status_blocks: ["speed", "temperatures", "controls"] });
    expect(samples(card)).toEqual(["Example – shown during a print", "Example – shown during a print"]);
    const body = [...(find(card, ".body")?.children ?? [])].map((child) => child.className.split(" ")[0]);
    expect(body).toEqual(["job", "sample", "temps", "sample"]);
    // The real elements, not to be tapped.
    const [speed, controls] = findAll(card, ".sample");
    expect(speed?.querySelector(".sample-body")?.hasAttribute("inert")).toBe(true);
    expect(speed?.querySelector(".speeds")).not.toBeNull();
    expect([...(controls?.querySelectorAll(".btn") ?? [])].map(text)).toEqual(["Pause print", "Stop print", "Skip objects"]);
    // In German.
    const german = await previewOf("a1mini", { status_blocks: ["controls"] }, "de");
    expect(samples(german)).toEqual(["Beispiel – erscheint während eines Drucks"]);
  });

  it("shows the sections of an offline printer as examples, with what it would show", async () => {
    const card = await previewOf("p1s");
    // The print's own sections show during a print; the others, in a row,
    // share one note.
    expect(samples(card)).toEqual(["Example – shown during a print", "Example – shown once the printer is online", "Example – shown during a print"]);
    expect([...(find(card, ".body")?.children ?? [])].map((child) => child.className.split(" ")[0])).toEqual(["job", "offline-actions", "sample", "sample", "sample"]);
    expect(findAll(card, ".sample .temps")).toHaveLength(1);
    expect(findAll(card, ".sample .ams-strip")).toHaveLength(1);
    // The Control and the Filament tab: their examples too.
    await showView(card, "Control");
    expect(samples(card)).toEqual(["Example – shown once the printer is online"]);
    expect(find(card, ".sample .heating")).not.toBeNull();
    await showView(card, "Filament");
    expect(samples(card)).toEqual(["Example – shown once the printer is online"]);
    expect(find(card, ".sample .unit")).not.toBeNull();
    const german = await previewOf("p1s", { status_blocks: ["fans"] }, "de");
    expect(samples(german)).toEqual(["Beispiel – erscheint, sobald der Drucker online ist"]);
  });

  it("shows no examples on the dashboard, also while it is edited", async () => {
    const { card } = await cardFor("a1mini");
    expect(find(card, ".sample")).toBeNull();
    // Home Assistant sets preview on every card of a dashboard in edit mode:
    // the cards keep the size they will have.
    const edited: FakeCard[] = [];
    for (const name of ["a1mini", "p1s"] as const) {
      const [make, printer] = PRINTERS[name] as [() => FakeDevice[], string];
      const card = document.createElement("bambuddy-printer-card") as FakeCard;
      card.preview = true;
      card.setConfig({ type: "custom:bambuddy-printer-card", printer, start_view: "control" });
      card.hass = makeHass({ devices: make() });
      document.body.append(card);
      await card.updateComplete;
      expect(find(card, ".sample"), name).toBeNull();
      edited.push(card);
    }
    // The offline printer's Control tab as on the dashboard.
    expect(text(find(edited[1] as FakeCard, ".job .job-info"))).toBe("The printer is offline. Check that it is switched on and connected to BamBuddy.");
  });
});

describe("an offline printer's tabs", () => {
  it("say it as the status tab does, with the picture, instead of controls and slots that show nothing", async () => {
    const { card } = await cardFor("p1s");
    const offline = "The printer is offline. Check that it is switched on and connected to BamBuddy.";
    expect(text(find(card, ".job .job-info"))).toBe(offline);
    await showView(card, "Control");
    expect(text(find(card, ".job .job-info"))).toBe(offline);
    expect(find(card, ".job .picture")).not.toBeNull();
    expect(find(card, ".heating")).toBeNull();
    expect(find(card, ".pad")).toBeNull();
    await showView(card, "Filament");
    expect(text(find(card, ".job .job-info"))).toBe(offline);
    expect(find(card, ".unit")).toBeNull();
  });
});

describe("the preview's examples, closer", () => {
  it("shows a warning that holds now outside the example: developer LAN mode off", async () => {
    const card = await previewOf("x1c", { status_blocks: ["controls"] }, "en", x1c({ developerMode: "off", status: "idle" }));
    const hint = findAll(card, ".note.warning").filter((item) => item.textContent?.includes("developer LAN mode is off"));
    expect(hint).toHaveLength(1);
    expect(hint[0]?.closest(".sample")).toBeNull();
    expect(samples(card)).toEqual(["Example – shown during a print"]);
  });

  it("gives an example of what a section shows at all, and none of an empty one", async () => {
    // A key without Control Printer still has the hotend fan.
    const fans = await previewOf("readOnly", { status_blocks: ["fans"] }, "en", readOnlyX1c({ online: false }));
    expect(find(fans, ".sample .fans")).not.toBeNull();
    // Hide controls: no print controls to show, no example of them.
    const hidden = await previewOf("a1mini", { status_blocks: ["controls"], read_only: true });
    expect(samples(hidden)).toEqual([]);
    // No temperature to show: no example with an empty box.
    const bare = offlineP1s().map((device) => ({ ...device, entities: device.entities.filter((entity) => !/temperature/.test(entity.key)) }));
    const temps = await previewOf("p1s", { status_blocks: ["temperatures"] }, "en", bare);
    expect(samples(temps)).toEqual([]);
  });

  it("says BamBuddy, not the printer, while BamBuddy gives no data", async () => {
    const card = await previewOf("x1c", { status_blocks: ["temperatures"] }, "en", unreachable(x1c()));
    expect(samples(card)).toEqual(["Example – shown once BamBuddy answers"]);
    const german = await previewOf("x1c", { start_view: "control" }, "de", unreachable(x1c()));
    expect(samples(german)).toEqual(["Beispiel – erscheint, sobald BamBuddy antwortet"]);
  });

  it("puts examples in a row that show at the same time under one note", async () => {
    const card = await previewOf("p1s", { status_blocks: ["temperatures", "fans", "controls", "speed", "ams"] });
    expect(samples(card)).toEqual(["Example – shown once the printer is online", "Example – shown during a print", "Example – shown once the printer is online"]);
    const [first, print] = findAll(card, ".sample .sample-body");
    expect([...(first?.children ?? [])].map((child) => child.className.split(" ")[0])).toEqual(["temps", "fans"]);
    expect([...(print?.children ?? [])].map((child) => child.className.split(" ")[0])).toEqual(["controls", "speed"]);
    // A section that shows now ends the row.
    const idle = await previewOf("a1mini", { status_blocks: ["controls", "temperatures", "speed"] });
    expect(samples(idle)).toEqual(["Example – shown during a print", "Example – shown during a print"]);
  });

  it("fades the example and lets no tap through", () => {
    expect(styleText()).toMatch(/\.sample-body\s*\{[^}]*opacity: 0\.55;[^}]*pointer-events: none;/);
  });
});

describe("an offline printer's tabs, closer", () => {
  it("say no data from BamBuddy where it gives none, in every tab", async () => {
    const { card } = await cardFor("x1c", {}, { devices: unreachable(x1c()) });
    for (const tab of ["Control", "Filament"] as const) {
      await showView(card, tab);
      expect(text(find(card, ".job .job-info")), tab).toContain("No data from BamBuddy");
    }
  });
});

describe("the editor's preview of an offline printer's Power block", () => {
  it("shows it as it is: the plugs the card shows now are no example", async () => {
    const devices = offlineP1s();
    const printer = devices[0] as FakeDevice;
    const card = await previewOf("p1s", { status_blocks: ["power"] }, "en", [
      ...devices,
      plugDevice({ printer, id: 5, name: "Steckdose Garage", state: "off" }),
      plugDevice({ printer, id: 2, name: "Abluft", state: "on", watts: 30, powersPrinter: false }),
    ]);
    expect(samples(card)).toEqual([]);
    expect(findAll(card, ".power .p-row").map(text)).toEqual([`Abluft On · 30${NBSP}W`]);
  });
});

describe("a switch that is off", () => {
  it("has an edge in the muted colour, 3:1 and more against its box; on, the accent alone", () => {
    const sheet = styleText();
    expect(sheet).toMatch(/\.toggle\s*\{[^}]*box-shadow: inset 0 0 0 1px var\(--bb-muted\);/);
    expect(sheet).toMatch(/\.det-switch\[aria-checked="true"\] \.toggle\s*\{[^}]*box-shadow: none;/);
  });
});

describe("the live view in full screen", () => {
  it("shows the full-screen icon on a running stream", async () => {
    const { card } = await cardFor("x1c");
    expect(hasButton(card, "Full screen")).toBe(false);
    button(card, "Live view").click();
    await card.updateComplete;
    const full = button(card, "Full screen");
    // Beside the tags, not among the tools that full screen hides.
    expect(full.closest(".live")).not.toBeNull();
    expect(full.closest(".live-tools")).toBeNull();
    expect(full.getAttribute("title")).toBe("Full screen");
    expect(full.querySelector("svg path")?.getAttribute("d")).toBe(ICONS.fullscreen);
    const always = await cardFor("x1c", { camera: "always" });
    expect(hasButton(always.card, "Full screen")).toBe(true);
    // A view, not a control: the view-only card has it too.
    const viewOnly = await cardFor("x1c", { camera: "always", read_only: true });
    expect(hasButton(viewOnly.card, "Full screen")).toBe(true);
    const german = await cardFor("x1c", { camera: "always" }, { language: "de" });
    expect(hasButton(german.card, "Vollbild")).toBe(true);
  });

  it("offers no full screen without a stream", async () => {
    const { card } = await cardFor("x1c", { camera: "always" });
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    expect(find(card, ".live.failed")).not.toBeNull();
    expect(hasButton(card, "Full screen")).toBe(false);
    const off = await cardFor("x1c", { camera: "off" });
    expect(hasButton(off.card, "Full screen")).toBe(false);
  });

  it("keeps a narrow card's chips clear of the full-screen icon", () => {
    const narrow = atRule("@container (max-width: 260px)");
    const right = /\.live-tags\s*\{[^}]*right:\s*(\d+)px/.exec(narrow);
    // The icon: 6 px from the edge, 36 px wide.
    expect(Number(right?.[1])).toBeGreaterThanOrEqual(46);
    expect(styleText()).toMatch(/\.live-full\s*\{[^}]*bottom:\s*6px;[^}]*right:\s*6px;/);
  });
});

/** The browser's Fullscreen API, which happy-dom lacks: entering makes the
 * card (the shadow host) the document's full-screen element, as browsers do. */
/** happy-dom's own shadow-root getter, put back after each test. */
const shadowFullscreen = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "fullscreenElement");

function fullscreenApi(answer: "take" | "refuse" | "throw" | "nothing" | "hang" | "app" = "take") {
  let element: Element | null = null;
  const change = (): boolean => document.dispatchEvent(new Event("fullscreenchange"));
  // As browsers retarget it: the document sees the outermost shadow host
  // (Home Assistant's own element), each shadow root its own level.
  const retarget = (root: Document | ShadowRoot): Element | null => {
    let node: Element | null = element;
    while (node) {
      const nodeRoot = node.getRootNode();
      if (nodeRoot === root) return node;
      node = nodeRoot instanceof ShadowRoot ? nodeRoot.host : null;
    }
    return null;
  };
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => retarget(document) });
  Object.defineProperty(ShadowRoot.prototype, "fullscreenElement", {
    configurable: true,
    get(this: ShadowRoot): Element | null {
      return retarget(this);
    },
  });
  /** As Home Assistant's Android app (2026.8, seen in its WebView): right
   * after the request the page is hidden for 30-100 ms while the app shows
   * its full screen view; Blink grants the request in that time only if the
   * element is still on the page, and tells of the change after the page is
   * visible again. */
  const appFullscreen = (target: Element): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      setTimeout(() => pageState("hidden"), 10);
      setTimeout(() => {
        if (!target.isConnected) {
          pageState("visible");
          reject(new TypeError("Element is not connected"));
          return;
        }
        element = target;
        resolve();
        setTimeout(() => {
          pageState("visible");
          change();
        }, 10);
      }, 25);
    });
  const request = vi.fn(function (this: Element): Promise<void> | undefined {
    if (answer === "throw") throw new TypeError("not allowed");
    if (answer === "nothing") return undefined;
    if (answer === "refuse") return Promise.reject(new TypeError("not allowed"));
    if (answer === "hang") return new Promise<void>(() => undefined);
    if (answer === "app") return appFullscreen(this);
    element = this;
    change();
    return Promise.resolve();
  });
  Object.defineProperty(Element.prototype, "requestFullscreen", { configurable: true, value: request });
  const exit = vi.fn((): Promise<void> => {
    element = null;
    change();
    return Promise.resolve();
  });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
  return {
    request,
    exit,
    /** The browser leaves full screen by itself: Esc, the system's back, or
     * its element taken off the page -- the event comes a frame later
     * (`announce` false: not yet). */
    leave: (announce = true): void => {
      element = null;
      if (announce) change();
    },
    announce: (): boolean => change(),
    /** The browser grants a request it was still deciding. */
    take: (target: Element): void => {
      element = target;
      change();
    },
  };
}

/** The page hidden or shown, as a browser tells it. */
function pageState(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

function withoutFullscreenApi(): void {
  if (shadowFullscreen) Object.defineProperty(ShadowRoot.prototype, "fullscreenElement", shadowFullscreen);
  else Reflect.deleteProperty(ShadowRoot.prototype, "fullscreenElement");
  Reflect.deleteProperty(document, "fullscreenEnabled");
  Reflect.deleteProperty(document, "fullscreenElement");
  Reflect.deleteProperty(document, "exitFullscreen");
  Reflect.deleteProperty(Element.prototype, "requestFullscreen");
}

/** happy-dom applies no :focus-within across a shadow root; browsers do. */
function emulateFocusWithin(card: FakeCard): void {
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string): boolean {
    if (selector !== ":focus-within") return matches.call(this, selector);
    const active = root(card).activeElement;
    return active !== null && this.contains(active);
  });
}

async function fullCard(config: Record<string, unknown> = { camera: "always" }) {
  const found = await cardFor("x1c", config);
  return { ...found, live: () => find(found.card, ".live") as HTMLElement };
}

describe("full screen in Home Assistant's Android app", () => {
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await endFullscreens();
    withoutFullscreenApi();
  });

  it("goes full screen with one tap, though the app hides the page for a moment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fullscreenApi("app");
    const { card, live } = await fullCard();
    const stream = find<HTMLImageElement>(card, "img.stream");
    const src = stream?.getAttribute("src");
    button(card, "Full screen").click();
    await vi.advanceTimersByTimeAsync(50);
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    expect(button(card, "Exit full screen")).toBeTruthy();
    // The same stream: the moment hidden ended nothing.
    expect(find(card, "img.stream")).toBe(stream);
    expect(stream?.getAttribute("src")).toBe(src);
  });

  it("leaves the app's full screen with one tap", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = fullscreenApi("app");
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await vi.advanceTimersByTimeAsync(50);
    await settle(card);
    button(card, "Exit full screen").click();
    await settle(card);
    expect(api.exit).toHaveBeenCalledTimes(1);
    expect(live().classList.contains("full")).toBe(false);
  });
});

describe("the live view in the browser's full screen", () => {
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await endFullscreens();
    withoutFullscreenApi();
  });

  it("asks the browser for full screen in the click itself", async () => {
    const api = fullscreenApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    // Within the click: Firefox and Safari allow it only right after one.
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request.mock.contexts[0]).toBe(live());
  });

  it("follows the browser into and out of full screen", async () => {
    const api = fullscreenApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    const exit = button(card, "Exit full screen");
    expect(exit.querySelector("svg path")?.getAttribute("d")).toBe(ICONS.fullscreenExit);
    expect(root(card).activeElement).toBe(exit);
    api.leave();
    await settle(card);
    expect(live().classList.contains("full")).toBe(false);
    expect(root(card).activeElement).toBe(button(card, "Full screen"));
    // Its own button leaves too.
    button(card, "Full screen").click();
    await settle(card);
    button(card, "Exit full screen").click();
    await settle(card);
    expect(api.exit).toHaveBeenCalledTimes(1);
    expect(live().classList.contains("full")).toBe(false);
  });

  it("keeps one stream", async () => {
    fullscreenApi();
    const { card } = await fullCard();
    const stream = find<HTMLImageElement>(card, "img.stream");
    const src = stream?.getAttribute("src");
    button(card, "Full screen").click();
    await settle(card);
    expect(find(card, "img.stream")).toBe(stream);
    expect(findAll(card, "img.stream")).toHaveLength(1);
    button(card, "Exit full screen").click();
    await settle(card);
    expect(find(card, "img.stream")).toBe(stream);
    expect(stream?.getAttribute("src")).toBe(src);
  });

  it("stays full screen through a new frame rate", async () => {
    fullscreenApi();
    const { card, hass, live } = await fullCard();
    const stream = find<HTMLImageElement>(card, "img.stream");
    button(card, "Full screen").click();
    await settle(card);
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "token-x1c", frame_rate: 15 }));
    expect(find(card, "img.stream")).toBe(stream);
    expect(stream?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=15");
    expect(live().classList.contains("full")).toBe(true);
  });

  it("keeps the card's height while the picture is full screen", async () => {
    fullscreenApi();
    const { card } = await fullCard();
    expect(find(card, ".live-holder")).toBeNull();
    button(card, "Full screen").click();
    await settle(card);
    expect(find(card, ".live-holder")).not.toBeNull();
    expect(findAll(card, ".live")).toHaveLength(1);
    button(card, "Exit full screen").click();
    await settle(card);
    expect(find(card, ".live-holder")).toBeNull();
  });

  it("leaves the focus where it is when full screen ends with the focus elsewhere", async () => {
    const api = fullscreenApi();
    const { card } = await fullCard();
    emulateFocusWithin(card);
    button(card, "Full screen").click();
    await settle(card);
    const menu = find<HTMLButtonElement>(card, ".menu-btn");
    menu?.focus();
    api.leave();
    await settle(card);
    expect(root(card).activeElement).toBe(menu);
  });

  it("keeps Tab on the exit icon in full screen", async () => {
    fullscreenApi();
    const { card } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    const exit = button(card, "Exit full screen");
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true, cancelable: true });
    exit.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(root(card).activeElement).toBe(exit);
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, composed: true, cancelable: true });
    exit.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    // Not full screen: Tab is the page's.
    button(card, "Exit full screen").click();
    await settle(card);
    const free = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true, cancelable: true });
    button(card, "Full screen").dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
  });

  it("recognises its full screen deep in Home Assistant's shadow trees", async () => {
    const api = fullscreenApi();
    const { card, live } = await fullCard();
    // Home Assistant holds the card several shadow roots deep.
    const outer = document.createElement("div");
    document.body.append(outer);
    const inner = document.createElement("div");
    outer.attachShadow({ mode: "open" }).append(inner);
    inner.append(card);
    await settle(card);
    button(card, "Full screen").click();
    await settle(card);
    expect(document.fullscreenElement).toBe(outer);
    expect(live().classList.contains("full")).toBe(true);
    expect(historyMark()).toEqual(expect.any(String));
    button(card, "Exit full screen").click();
    await settle(card);
    expect(api.exit).toHaveBeenCalledTimes(1);
    outer.remove();
  });

  it("marks its history entry so that none of an earlier page load holds back", async () => {
    fullscreenApi();
    const { card } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    // History outlives a reload; a count alone would start again at 1.
    expect(historyMark()).toEqual(expect.stringMatching(/^[a-z0-9]+-\d+$/));
  });

  it("leaves Tab alone while the browser decides and in a dialog over full screen", async () => {
    const api = fullscreenApi("hang");
    let grant: (() => void) | undefined;
    api.request.mockImplementationOnce(() => new Promise<void>((resolve) => (grant = resolve)));
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    const waiting = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true, cancelable: true });
    button(card, "Full screen").dispatchEvent(waiting);
    expect(waiting.defaultPrevented).toBe(false);
    api.take(live());
    grant?.();
    await settle(card);
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const field = document.createElement("button");
    dialog.append(field);
    document.body.append(dialog);
    const inDialog = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true, cancelable: true });
    field.dispatchEvent(inDialog);
    expect(inDialog.defaultPrevented).toBe(false);
    dialog.remove();
  });

  it("gives the focus to Try again when the stream breaks in full screen", async () => {
    fullscreenApi();
    const { card } = await fullCard();
    emulateFocusWithin(card);
    button(card, "Full screen").click();
    await settle(card);
    expect(root(card).activeElement).toBe(button(card, "Exit full screen"));
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await settle(card);
    expect(root(card).activeElement).toBe(button(card, "Try again"));
  });

  it("swallows a browser that fails to leave", async () => {
    const api = fullscreenApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    const refused = Promise.reject(new TypeError("not in full screen"));
    const handled = vi.spyOn(refused, "catch");
    api.exit.mockImplementationOnce(() => refused);
    button(card, "Exit full screen").click();
    await settle(card);
    expect(handled).toHaveBeenCalled();
    expect(live().classList.contains("full")).toBe(false);
  });

  it("fills the whole screen, without the card's tools", () => {
    const sheet = styleText();
    const full = /\.live\.full\s*\{([^}]*)\}/.exec(sheet)?.[1] ?? "";
    for (const rule of ["position: fixed", "inset: 0", "width: 100%", "height: 100%", "max-height: none", "margin: 0", "border: 0", "padding: 0", "border-radius: 0", "aspect-ratio: auto"]) {
      expect(full).toContain(rule);
    }
    expect(sheet).toMatch(/\.live\.full \.live-tools\s*\{[^}]*display: none;/);
    expect(sheet).toMatch(/\.live\.full \.live-tags\s*\{[^}]*top: max\(12px, env\(safe-area-inset-top\)\);/);
    expect(sheet).toMatch(/\.live\.full \.live-full\s*\{[^}]*bottom: max\(6px, env\(safe-area-inset-bottom\)\);[^}]*right: max\(6px, env\(safe-area-inset-right\)\);/);
    // Large enough to find on a phone, on the grey disc that shows on black and on a bright picture.
    expect(sheet).toMatch(/\.live\.full \.live-full\s*\{[^}]*width: 52px;[^}]*height: 52px;/);
    expect(sheet).toMatch(/\.live\.full \.live-full \.icon\s*\{[^}]*width: 30px;[^}]*height: 30px;/);
  });
});

describe("the live view's overlay", () => {
  it("puts every button on the picture and the fps chip on one grey disc", () => {
    const sheet = styleText();
    // Dark enough for the fps chip's text on a bright picture (about 4.9 : 1 on white).
    expect(sheet).toMatch(/--bb-on-picture:\s*rgba\(72, 72, 72, 0\.78\);/);
    expect(sheet).toMatch(/\.live \.icon-btn\s*\{[^}]*background: var\(--bb-on-picture\)/);
    expect(sheet).toMatch(/\.live-fps\s*\{[^}]*background: var\(--bb-on-picture\)/);
    // Full screen keeps the same disc: no light one of its own.
    expect(sheet).not.toMatch(/rgba\(255, 255, 255, 0\.18\)/);
    // Live stays red.
    expect(sheet).toMatch(/\.live-badge\s*\{[^}]*background: rgba\(219, 68, 55, 0\.92\)/);
  });

  it("grows Live and fps in full screen as it grows its button", () => {
    const sheet = styleText();
    expect(sheet).toMatch(/\.live\.full \.live-badge\s*\{[^}]*font-size: 16px/);
    expect(sheet).toMatch(/\.live\.full \.live-tags\s*\{[^}]*gap: 9px/);
  });
});

/** The top layer's popover, which happy-dom lacks. */
function popoverApi(showThrows = false) {
  const shown = vi.fn(function (this: HTMLElement): void {
    if (showThrows) throw new DOMException("not a popover", "NotSupportedError");
  });
  const hidden = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "showPopover", { configurable: true, value: shown });
  Object.defineProperty(HTMLElement.prototype, "hidePopover", { configurable: true, value: hidden });
  return { shown, hidden };
}

function withoutPopoverApi(): void {
  Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
  Reflect.deleteProperty(HTMLElement.prototype, "hidePopover");
}

describe("the live view filling the window", () => {
  afterEach(async () => {
    vi.useRealTimers();
    await endFullscreens();
    for (const dialog of document.body.querySelectorAll("dialog")) dialog.remove();
    withoutFullscreenApi();
    withoutPopoverApi();
  });

  it("fills the window where the browser has no full screen", async () => {
    const popover = popoverApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    // The top layer: no ancestor's filter or transform can hold it in.
    expect(live().getAttribute("popover")).toBe("manual");
    expect(popover.shown.mock.contexts[0]).toBe(live());
    expect(root(card).activeElement).toBe(button(card, "Exit full screen"));
    button(card, "Exit full screen").click();
    await settle(card);
    expect(popover.hidden.mock.contexts[0]).toBe(live());
    expect(live().hasAttribute("popover")).toBe(false);
    expect(live().classList.contains("full")).toBe(false);
  });

  it("covers the window with its own layer where the top layer is missing too", async () => {
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    expect(live().hasAttribute("popover")).toBe(false);
    // A popover that refuses: the layer covers the window all the same.
    popoverApi(true);
    button(card, "Exit full screen").click();
    await settle(card);
    button(card, "Full screen").click();
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
  });

  it.each(["refuse", "throw", "nothing"] as const)("falls back to the window when the browser's full screen does not come (%s)", async (answer) => {
    popoverApi();
    fullscreenApi(answer);
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    expect(live().getAttribute("popover")).toBe("manual");
  });

  it("falls back to the window when the browser neither takes nor refuses, and stays there", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    const api = fullscreenApi("hang");
    let late: (() => void) | undefined;
    api.request.mockImplementationOnce(() => new Promise<void>((resolve) => (late = resolve)));
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(live().hasAttribute("popover")).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    await settle(card);
    expect(live().getAttribute("popover")).toBe("manual");
    // Full screen after all: one mode -- the browser's is undone.
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => card });
    late?.();
    await settle(card);
    expect(api.exit).toHaveBeenCalledTimes(1);
    expect(live().getAttribute("popover")).toBe("manual");
  });

  it("leaves a late full screen the card no longer wants", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    const api = fullscreenApi("hang");
    let late: (() => void) | undefined;
    api.request.mockImplementationOnce(() => new Promise<void>((resolve) => (late = resolve)));
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await vi.advanceTimersByTimeAsync(1600);
    await settle(card);
    button(card, "Exit full screen").click();
    await settle(card);
    // The browser says yes after all: the card wants none any more.
    api.take(live());
    late?.();
    await settle(card);
    expect(api.exit).toHaveBeenCalledTimes(1);
    expect(live().classList.contains("full")).toBe(false);
  });

  it("asks once while the browser decides", async () => {
    popoverApi();
    const api = fullscreenApi("hang");
    const { card } = await fullCard();
    button(card, "Full screen").click();
    button(card, "Full screen").click();
    await settle(card);
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it("fills no window for a card taken off the page while the browser decides", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const popover = popoverApi();
    fullscreenApi("hang");
    const { card } = await fullCard();
    const mark = historyMark();
    button(card, "Full screen").click();
    card.remove();
    await vi.advanceTimersByTimeAsync(1600);
    expect(popover.shown).not.toHaveBeenCalled();
    expect(historyMark()).toBe(mark);
  });

  it("leaves the window on Esc", async () => {
    popoverApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle(card);
    expect(live().classList.contains("full")).toBe(false);
  });

  it("ignores an Esc that closes a dialog", async () => {
    popoverApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    // A dialog that is closed is no reason.
    dialog.removeAttribute("open");
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
    await settle(card);
    expect(live().classList.contains("full")).toBe(false);
  });
});

/** Ends full screen on every card a test left in it, then takes the cards off. */
async function endFullscreens(): Promise<void> {
  for (const card of document.body.querySelectorAll<FakeCard>("bambuddy-printer-card")) {
    if (hasButton(card, "Exit full screen")) {
      button(card, "Exit full screen").click();
      await settle(card);
    }
    card.remove();
  }
}

const historyMark = (): unknown => (history.state as { bambuddyFullscreen?: unknown } | null)?.bambuddyFullscreen;

describe("back leaving the live view's full screen", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await endFullscreens();
    withoutFullscreenApi();
    withoutPopoverApi();
  });

  it.each(["native", "window"] as const)("leaves full screen on back, not the dashboard (%s)", async (mode) => {
    const api = mode === "native" ? fullscreenApi() : undefined;
    if (mode === "window") popoverApi();
    const { card, live } = await fullCard();
    const href = location.href;
    button(card, "Full screen").click();
    await settle(card);
    expect(historyMark()).toEqual(expect.any(String));
    expect(location.href).toBe(href);
    history.back();
    await settle(card);
    expect(live().classList.contains("full")).toBe(false);
    expect(location.href).toBe(href);
    if (api) expect(api.exit).toHaveBeenCalledTimes(1);
  });

  it("takes its entry back when it is left otherwise", async () => {
    popoverApi();
    const { card } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    const mine = historyMark();
    const back = vi.spyOn(history, "back");
    button(card, "Exit full screen").click();
    await settle(card);
    expect(back).toHaveBeenCalledTimes(1);
    expect(historyMark()).not.toBe(mine);
  });

  it("leaves another's entry alone", async () => {
    popoverApi();
    const { card } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    // A dialog of Home Assistant's opened over it, with its own entry.
    history.pushState({ dialog: "more-info" }, "");
    const back = vi.spyOn(history, "back");
    button(card, "Exit full screen").click();
    await settle(card);
    expect(back).not.toHaveBeenCalled();
    expect(history.state).toEqual({ dialog: "more-info" });
  });

  it("stays full screen when an entry above its own goes", async () => {
    popoverApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    history.pushState({ dialog: "more-info" }, "");
    history.back();
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
  });

  it("two cards keep their own entries", async () => {
    popoverApi();
    const first = await fullCard();
    const second = await fullCard();
    button(first.card, "Full screen").click();
    await settle(first.card);
    button(second.card, "Full screen").click();
    await settle(second.card);
    history.back();
    await settle(first.card);
    await settle(second.card);
    expect(second.live().classList.contains("full")).toBe(false);
    expect(first.live().classList.contains("full")).toBe(true);
  });
});

describe("full screen ending by itself, and a card moved on the dashboard", () => {
  const visibility = pageState;
  const inFullscreen = (card: FakeCard): boolean => hasButton(card, "Exit full screen");

  afterEach(async () => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await endFullscreens();
    withoutFullscreenApi();
    withoutPopoverApi();
  });

  it("leaves full screen when the camera goes", async () => {
    popoverApi();
    const { card, hass } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    const mine = historyMark();
    await update(card, hass.withState("camera.x1c_camera", "unavailable", {}));
    expect(inFullscreen(card)).toBe(false);
    expect(find(card, ".live-holder")).toBeNull();
    await settle(card);
    expect(historyMark()).not.toBe(mine);
  });

  it("leaves full screen when the page is hidden", async () => {
    popoverApi();
    const { card } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    visibility("hidden");
    await settle(card);
    expect(inFullscreen(card)).toBe(false);
    visibility("visible");
    await settle(card);
    // The stream comes back, in the card.
    expect(find(card, "img.stream")).not.toBeNull();
    expect(inFullscreen(card)).toBe(false);
  });

  it("leaves the browser's full screen when the stream breaks", async () => {
    const api = fullscreenApi();
    const { card } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    const mine = historyMark();
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await settle(card);
    expect(find(card, ".live.failed")).not.toBeNull();
    expect(api.exit).toHaveBeenCalledTimes(1);
    expect(historyMark()).not.toBe(mine);
  });

  it("does not come back when the stream ended while the browser decided", async () => {
    popoverApi();
    const api = fullscreenApi("hang");
    let refuse: ((reason: unknown) => void) | undefined;
    api.request.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => (refuse = reject)));
    const { card, hass } = await fullCard();
    button(card, "Full screen").click();
    await update(card, hass.withState("camera.x1c_camera", "unavailable", {}));
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "token-x1c", frame_rate: 30 }));
    refuse?.(new TypeError("too late"));
    await settle(card);
    expect(find(card, "img.stream")).not.toBeNull();
    expect(inFullscreen(card)).toBe(false);
  });

  it("keeps the live view of a card moved within the grace, in the window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const popover = popoverApi();
    const { card, hass, live } = await fullCard();
    const stream = find<HTMLImageElement>(card, "img.stream");
    const src = stream?.getAttribute("src");
    button(card, "Full screen").click();
    await settle(card);
    card.remove();
    // An update while it is away stops nothing.
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "rotated", frame_rate: 30 }));
    await vi.advanceTimersByTimeAsync(500);
    document.body.append(card);
    await settle(card);
    expect(find(card, "img.stream")).toBe(stream);
    expect(stream?.getAttribute("src")).toBe(src);
    expect(live().classList.contains("full")).toBe(true);
    // Back in the top layer: leaving the page took it out.
    expect(popover.shown).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(stream?.getAttribute("src")).toBe(src);
  });

  it("goes on in the window when a move ended the browser's full screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    const api = fullscreenApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    card.remove();
    // The browser ends full screen when its element leaves the page.
    api.leave();
    await vi.advanceTimersByTimeAsync(300);
    document.body.append(card);
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    expect(live().getAttribute("popover")).toBe("manual");
    expect(historyMark()).toEqual(expect.any(String));
  });

  it("ends the stream and the request when the page stays hidden while the browser decides", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    fullscreenApi("hang");
    const { card } = await fullCard();
    button(card, "Full screen").click();
    visibility("hidden");
    await settle(card);
    // A moment only, it might be the Android app bringing up its full screen.
    expect(find(card, "img.stream")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    await settle(card);
    expect(find(card, "img.stream")).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    await settle(card);
    // The browser's answer never came, and the window does not stand in.
    expect(inFullscreen(card)).toBe(false);
  });

  it("keeps the stream of a card moved while the page was hidden for a moment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    fullscreenApi("hang");
    const { card } = await fullCard();
    const stream = find<HTMLImageElement>(card, "img.stream");
    const src = stream?.getAttribute("src");
    button(card, "Full screen").click();
    visibility("hidden");
    card.remove();
    // Visible again while the card is away: it hears nothing of it.
    visibility("visible");
    await vi.advanceTimersByTimeAsync(1200);
    document.body.append(card);
    await settle(card);
    expect(find(card, "img.stream")).toBe(stream);
    expect(stream?.getAttribute("src")).toBe(src);
  });

  it("reads the page's visibility again when it comes back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { card } = await fullCard();
    card.remove();
    // Hidden while the card was away, its listener with it.
    visibility("hidden");
    await vi.advanceTimersByTimeAsync(300);
    document.body.append(card);
    await settle(card);
    expect(find(card, "img.stream")).toBeNull();
  });

  it("goes on in the window when the browser tells of the end only after the return", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    const api = fullscreenApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    card.remove();
    // Leaving the page ended the browser's full screen; it says so a frame later.
    api.leave(false);
    document.body.append(card);
    api.announce();
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    expect(live().getAttribute("popover")).toBe("manual");
  });

  it("tears down a card that stays away", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    const { card } = await fullCard({});
    button(card, "Live view").click();
    await settle(card);
    const stream = find<HTMLImageElement>(card, "img.stream");
    button(card, "Full screen").click();
    await settle(card);
    const mine = historyMark();
    card.remove();
    await vi.advanceTimersByTimeAsync(1900);
    expect(stream?.hasAttribute("src")).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(stream?.hasAttribute("src")).toBe(false);
    await settle(card);
    expect(historyMark()).not.toBe(mine);
    document.body.append(card);
    await settle(card);
    expect(find(card, "img.stream")).toBeNull();
    expect(inFullscreen(card)).toBe(false);
  });
});
