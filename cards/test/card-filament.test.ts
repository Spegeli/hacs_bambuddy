import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";

import { DRYING } from "../src/dialogs";
import { ICONS } from "../src/icons";

import type { AmsRefs } from "../src/types";
import { a1mini, amsDevice, h2d, idleX1c, OFFER, offerFor, offlineP1s, x1c, type FakeCard, type FakeDevice } from "./fixtures";
import { button, declarations, find, findAll, hasButton, NBSP, press, root, settle, shownText, showView, styleText, text, update } from "./helpers";
import { cardFor, confirmDialog, loadButtons, previewOf, withX1c } from "./card-helpers";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
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

  it("names a labelled unit as BamBuddy does, with its model chip", async () => {
    // Named in BamBuddy: the integration names the device "<printer> <name> (<model> / <serial>)".
    const named: Record<string, string> = {
      "dev-h2d-ams-0": "Studio Silk (AMS 2 Pro / 19C06A000000001)",
      "dev-h2d-ams-128": "Studio Dryer (AMS HT / 19F06A000000002)",
    };
    const devices = h2d().map((device) => (named[device.id] ? { ...device, name: named[device.id] as string } : device));
    const { card } = await cardFor("h2d", { devices });
    const heads = (selector: string): string[][] =>
      findAll(card, selector).map((head) => [text(head.querySelector(".ams-name, .unit-name")), text(head.querySelector(".unit-model"))]);
    // Still by place, not by name: AMS A's place before the AMS HT's.
    expect(findAll(card, ".ams-name").map(text)).toEqual(["Silk", "Dryer", "Ext"]);
    await showView(card, "Filament");
    expect(heads(".unit-head")).toEqual([
      ["Silk", "AMS 2 Pro"],
      ["Dryer", "AMS HT"],
      ["External spools", ""],
    ]);
  });

  it("lets a long name from BamBuddy wrap in the Status strip, not push the card wider", () => {
    // The line grows for it; one line stays 15 px, as the humidity's below.
    const css = styleText();
    expect(declarations(".ams-line", css)).toEqual(expect.arrayContaining(["height: auto", "min-height: 15px", "flex-wrap: wrap"]));
    // A single long word ("Filamenttrocknungsstation") breaks where it must: it
    // never holds the column wider than the card, in either tab.
    expect(declarations(".ams-name", css)).toEqual(expect.arrayContaining(["line-height: 15px", "white-space: normal", "overflow-wrap: anywhere"]));
    expect(declarations(".unit-name", css)).toContain("overflow-wrap: anywhere");
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
    const { card: dual } = await cardFor("h2d", { devices: h2d({ status: "idle", hms: [] }) });
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
    const { card, hass } = await cardFor("x1c", { config: { printer: printer.id }, devices });
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
    const { card } = await cardFor("x1c", { devices: [printer as FakeDevice, classic] });
    await showView(card, "Filament");
    expect(findAll(card, ".drying")).toEqual([]);
  });

  it("dries an AMS that can, with temperature and duration asked first", async () => {
    const { card, hass } = await cardFor("h2d", { devices: h2d({ status: "idle", hms: [] }) });
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
    const { card, hass } = await cardFor("h2d", { devices: h2d({ status: "idle", hms: [] }) });
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
      const { card, hass } = await cardFor("h2d", { language, devices: h2d({ status: "idle", hms: [] }) });
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
    const { card, hass } = await cardFor("h2d", { devices: h2d({ status: "idle", hms: [] }) });
    await update(card, hass.withState("binary_sensor.dev-h2d_ams_0_drying", "unavailable").withState("binary_sensor.dev-h2d_ams_128_drying", "unknown"));
    await showView(card, "Filament");
    expect(findAll(card, ".drying > span").map(text)).toEqual(["—", "—"]);
  });

  it("dries an AMS 2 Pro at 65 °C at most", async () => {
    const { card, hass } = await cardFor("h2d", { devices: h2d({ status: "idle", hms: [] }) });
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
    const { card } = await cardFor("h2d", { config: { start_view: "filament" }, devices });
    const rows = findAll(card, ".drying");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.flatMap((row) => [...row.querySelectorAll("button")])).toHaveLength(0);
    expect(text(rows[0] ?? null)).toContain("Start and stop it on the printer's screen.");
    // Without control nothing is offered, so nothing needs a word.
    const { card: shown } = await cardFor("h2d", { config: { start_view: "filament", read_only: true }, devices });
    expect(findAll(shown, ".dry-where")).toHaveLength(0);
    // An integration before the attribute: the buttons, as before.
    const { card: older } = await cardFor("h2d", { config: { start_view: "filament" }, devices: h2d({ status: "idle", hms: [] }) });
    expect(hasButton(older, "Stop drying")).toBe(true);
  });

  it("asks before it stops drying, also without a time left, and in German", async () => {
    const { card, hass } = await cardFor("h2d", { config: { start_view: "filament" }, devices: h2d({ status: "idle", hms: [] }) });
    await update(card, hass.withState("sensor.dev-h2d_ams_0_drying_remaining_time", "0"));
    await press(card, "Stop drying");
    expect(text(find(card, "dialog p"))).toBe("AMS A will stop drying.");
    await press(card, "Keep drying");
    expect(find(card, "dialog")).toBeNull();
    expect(hass.calls).toHaveLength(0);
    const { card: german } = await cardFor("h2d", { config: { start_view: "filament" }, language: "de", devices: h2d({ status: "idle", hms: [] }) });
    expect(text(find(german, ".drying"))).toBe(`Trocknet · noch${NBSP}3${NBSP}Std.${NBSP}20${NBSP}Min. Trocknen stoppen`);
    await press(german, "Trocknen stoppen");
    expect(text(find(german, "dialog h2"))).toBe("Trocknen stoppen?");
    expect(text(find(german, "dialog p"))).toBe(`AMS A trocknet noch 3${NBSP}Std.${NBSP}20${NBSP}Min. lang.`);
    expect(text(find(german, "dialog .safe"))).toBe("Weiter trocknen");
  });

  it("waits with loading while a print runs: it asks to pause first", async () => {
    for (const status of ["printing", "preparing", "slicing"]) {
      const { card } = await cardFor("h2d", { devices: h2d({ status, stage: "printing", hms: [] }) });
      await showView(card, "Filament");
      expect(findAll(card, ".note.warning").map(text), status).toEqual(["Pause the print to change the filament."]);
      expect(loadButtons(card).every((item) => item.disabled), status).toBe(true);
      // No load button for the AMS HT.
      expect(loadButtons(card).map(text), status).toEqual(["Load", "Unload", "Load", "Load", "Load"]);
    }
    const { card: german } = await cardFor("x1c", { language: "de" });
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
    const { card } = await cardFor("h2d", { language: "de" });
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
    const { card } = await cardFor("offline");
    await showView(card, "Filament");
    expect(find(card, ".unit")).toBeNull();
    expect(text(find(card, ".job .job-info"))).toBe("The printer is offline. Check that it is switched on and connected to BamBuddy.");
    const preview = await previewOf("offline", { start_view: "filament", ams_folding: "folded" });
    // Folded as the option says; the external spool unknown.
    expect(findAll<HTMLButtonElement>(preview, "button.unit-head").map((head) => head.getAttribute("aria-expanded"))).toEqual(["false"]);
    expect(findAll(preview, ".slot-main").map((item) => item.getAttribute("aria-label"))).toEqual(["Unknown – External spool"]);
    expect(findAll(preview, ".slot .swatch").map((item) => item.classList.contains("unknown"))).toEqual([true]);
    const german = await previewOf("offline", { start_view: "filament", ams_folding: "open" }, "de");
    // The example follows the option: unfolded, its slots unknown too.
    expect(findAll(german, ".slot-main").map((item) => item.getAttribute("aria-label"))).toEqual(["Unbekannt – Fach 1 · AMS A", "Unbekannt – Externe Spule"]);
  });

  it("shows the filament without controls where the printer has none, or with the controls hidden", async () => {
    const { card } = await cardFor("readOnly");
    await showView(card, "Filament");
    // No note about the key: the integration's key always may control.
    expect(find(card, ".note.info")).toBeNull();
    expect(findAll(card, ".slot .btn")).toHaveLength(0);
    const { card: plain } = await cardFor("h2d", { config: { read_only: true } });
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

  it("offers the slot a running print feeds from -- but a chip spool's, whose tools wait for the print", async () => {
    const devices = (status: string): FakeDevice[] => {
      const all = x1c({ status });
      const slot = (all[1] as FakeDevice).entities.find((entity) => entity.entityId === SLOT_3) as { attributes: Record<string, unknown> };
      slot.attributes = { ...slot.attributes, active: true };
      return all;
    };
    for (const status of ["printing", "preparing", "slicing"]) {
      const { card } = await cardFor("x1c", { devices: devices(status) });
      await showView(card, "Filament");
      // Slot 2 a chip spool the print feeds; slot 3 one without a chip: set mid-print.
      expect(editable(card), status).toEqual([true, false, true, true, true]);
    }
    const { card: paused } = await cardFor("x1c", { devices: devices("paused") });
    await showView(paused, "Filament");
    expect(editable(paused)).toEqual([true, true, true, true, true]);
  });

  it("waits during a filament change, and is not offered offline or without control", async () => {
    const { card } = await withX1c({ status: "idle", amsStatus: "feeding" });
    await showView(card, "Filament");
    expect(findAll<HTMLButtonElement>(card, ".slot .btn.edit").map((item) => item.disabled)).toEqual([true, true, true, true, true]);
    const { card: offline } = await cardFor("offline");
    await showView(offline, "Filament");
    expect(findAll(offline, ".slot .btn.edit")).toHaveLength(0);
    const { card: readOnly } = await cardFor("readOnly");
    await showView(readOnly, "Filament");
    expect(findAll(readOnly, ".slot .btn.edit")).toHaveLength(0);
    const { card: plain } = await cardFor("x1c", { config: { read_only: true } });
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
    expect(text(find(card, "dialog .fil-head .fil-title"))).toBe("Slot profile");
    expect(text(find(card, "dialog .fil-head .fil-help"))).toBe("The profiles Bambu Studio comes with, for this printer, its nozzle and this slot. Your own profiles are not here; set those on the printer or in BamBuddy.");
    expect(text(find(card, "dialog"))).not.toContain("For spools without a chip");
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

  it("says what the kept profile is where the offer lacks it: none set, or a named one not offered here", async () => {
    const { card } = await cardFor("x1c", { callService: answering({ ...OFFER }) });
    await showView(card, "Filament");
    await edit(card, 2);
    expect(texts(vendors(card))[0]).toBe("Keep the current profile");
    expect(text(find(card, "dialog .fil-keep"))).toBe("No profile set (PLA).");

    const { card: named, hass } = await cardFor("x1c", { callService: answering({ ...OFFER, current: "GFL96" }) });
    const state = hass.states[SLOT_3] as { state: string; attributes: Record<string, unknown> };
    named.hass = hass.withState(SLOT_3, "Generic PLA Silk", { ...state.attributes, name: "Generic PLA Silk" });
    await settle(named);
    await showView(named, "Filament");
    await edit(named, 2);
    expect(text(find(named, "dialog .fil-keep"))).toBe("Current profile: Generic PLA Silk.");
  });

  it("keeps a profile the offer lacks in the vendor field", async () => {
    const { card, hass } = await cardFor("x1c", { callService: answering({ ...OFFER, current: "P4d64437" }) });
    await showView(card, "Filament");
    await edit(card, 2);
    expect(texts(vendors(card))).toEqual(["Keep the current profile", "Bambu Lab", "Generic", "SUNLU"]);
    expect(vendors(card).value).toBe("keep");
    expect(filaments(card)).toBeNull();
    // What the kept profile is: one of the user's own, the slot's type in brackets.
    expect(text(find(card, "dialog .fil-keep"))).toBe("A profile of your own that Bambu Studio's list does not know (PLA).");
    // A vendor: its filaments, none of them the slot's -- and the line about the kept profile goes.
    await vendor(card, "Generic");
    expect(find(card, "dialog .fil-keep")).toBeNull();
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
    expect(declarations(".fil-fields", sheet)).toContain("container-type: inline-size");
    expect(declarations(".fil-grid", sheet)).toContain("grid-template-columns: max-content minmax(0, 1fr)");
    // Beside, a select takes the rest of the row: the 200 px of the other selects would cut a long name.
    expect(declarations(".fil-grid .select", sheet)).toContain("max-width: none");
    // Under its label below the width the longest name with its "Keep" needs beside the widest label.
    expect(sheet).toMatch(/@container \(max-width: 329px\)\s*\{\s*\.fil-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
  });

  it("says so where Bambu Studio offers the slot nothing", async () => {
    const { card, hass } = await cardFor("x1c", { callService: answering({ vendors: [] }) });
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
    const { card: blank } = await cardFor("x1c", { callService: answering({ vendors: [] }) });
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
    const { card } = await cardFor("x1c", { callService: slow });
    await showView(card, "Filament");
    await edit(card, 2);
    expect(vendors(card).disabled).toBe(true);
    expect(texts(vendors(card))).toEqual(["Keep the current profile"]);
    answer({ response: offerFor(SLOT_3) });
    await settle(card);
    expect(vendors(card).disabled).toBe(false);
    expect(vendors(card).value).toBe("Generic");
    // No answer at all: the slot's own, nothing else to choose.
    const failing = async (call: { service: string }): Promise<unknown> => {
      if (call.service === "get_filaments") throw new Error("no answer");
      return undefined;
    };
    const { card: failed } = await cardFor("x1c", { callService: failing });
    await showView(failed, "Filament");
    await edit(failed, 2);
    expect(texts(vendors(failed))).toEqual(["Keep the current profile"]);
    expect(vendors(failed).disabled).toBe(true);
    expect(findAll(failed, "dialog .dlg-note").map(text)).toContain("The filament list did not arrive. To ask again, close the dialog and open it once more.");
    expect(findAll(failed, "dialog .dlg-note").map(text)).not.toContain("For spools without a chip. You can choose what Bambu Studio offers for this printer, its nozzle and this slot. Other profiles can be set on the printer or in BamBuddy.");
    // The colour can still change.
    expect(swatches(failed).length).toBeGreaterThan(0);
    await press(failed, "Cancel");
    // An answer without vendors is none either; on a slot without a filament nothing can be set:
    // the note and the slot's tools only.
    const { card: empty } = await cardFor("x1c", { callService: answering({}) });
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
    const { card } = await cardFor("x1c", { callService: async (call) => (call.service === "set_filament" ? Promise.reject(refused) : undefined) });
    await showView(card, "Filament");
    await edit(card, 3);
    await vendor(card, "Generic");
    await filament(card, "GFL99");
    await confirmDialog(card);
    expect(text(find(card, ".toast"))).toBe("This slot is empty.");
  });

  it("says it in German", async () => {
    const { card } = await cardFor("x1c", { language: "de" });
    await showView(card, "Filament");
    expect(findAll(card, ".slot .btn.edit").map((item) => item.getAttribute("aria-label"))).toEqual([
      "Fach 1 · AMS A bearbeiten",
      "Fach 3 · AMS A bearbeiten",
      "Fach 4 · AMS A bearbeiten",
      "Externe Spule bearbeiten",
    ]);
    const { card: spools } = await cardFor("h2d", { language: "de" });
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
    expect(text(find(card, "dialog .fil-head .fil-title"))).toBe("Profil des Fachs");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Abbrechen", "Übernehmen"]);
    await press(card, "Abbrechen");
    await edit(card, 3);
    expect(texts(vendors(card))[0]).toBe("Wählen …");
    await pick(card, "Schwarz");
    expect(text(find(card, "dialog .dlg-need"))).toBe("Wähle noch ein Filament.");
    await press(card, "Abbrechen");
    await edit(card, 4);
    expect(text(find(card, "dialog h2"))).toBe("Filament der externen Spule");
    const { card: dual } = await cardFor("h2d", { language: "de" });
    await showView(dual, "Filament");
    await edit(dual, 5);
    expect(text(find(dual, "dialog h2"))).toBe("Filament der linken externen Spule");
    const { card: green } = await cardFor("a1mini", { language: "de" });
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
    const { card } = await cardFor("x1c", { callService: async () => (fail ? Promise.reject({ message: "Printer offline" }) : undefined) });
    await press(card, "Pause print");
    expect(text(find(card, ".toast"))).toBe("Printer offline");
    expect(find(card, ".sent")).toBeNull();
    fail = false;
    await press(card, "Pause print");
    expect(find(card, ".toast")).toBeNull();
    expect(text(find(card, ".sent"))).toBe("Sent");
  });

  it("says it in German, and forgets it when the card goes", async () => {
    const { card } = await cardFor("x1c", { language: "de" });
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
    const { card } = await cardFor("x1c", { config: { start_view: "control" }, devices: x1c({ status: "idle", stage: "idle" }) });
    expect(hasButton(card, "Heating off")).toBe(false);
    expect(find(card, ".heat-head .btn")).toBeNull();
    expect(findAll(card, ".heat-row .heat-off").every((item) => item.querySelector("path")?.getAttribute("d") === ICONS.power)).toBe(true);
    const { card: german } = await cardFor("x1c", { config: { start_view: "control" }, language: "de", devices: x1c({ status: "idle", stage: "idle" }) });
    expect(hasButton(german, "Heizen aus")).toBe(false);
  });
});

describe("what the AMS is doing", () => {
  it("shows in the status and the filament view while it is not idle", async () => {
    const { card, hass } = await cardFor("a1mini", { devices: a1mini({ amsStatus: "feeding" }) });
    expect(shownText(find(card, ".job-info .ams-activity"))).toBe("AMS: Feeding filament");
    expect(text(find(card, ".job-info .ams-activity .sr-only"))).toBe("Desk:");
    await showView(card, "Filament");
    expect(shownText(find(card, ".activity"))).toBe("AMS: Feeding filament");
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
    const { card, hass } = await cardFor("a1mini", { devices: a1mini({ amsStatus: "assist" }) });
    expect(find(card, ".ams-activity")).toBeNull();
    await showView(card, "Filament");
    expect(find(card, ".activity")).toBeNull();
    // A filament change during it still shows.
    await update(card, hass.withState("sensor.a1_mini_ams_status", "feeding"));
    expect(shownText(find(card, ".activity"))).toBe("AMS: Feeding filament");
  });

  it("says it in German, and nothing while the printer is offline or without the sensor", async () => {
    const { card } = await cardFor("a1mini", { language: "de", devices: a1mini({ amsStatus: "changing_filament" }) });
    expect(shownText(find(card, ".ams-activity"))).toBe("AMS: Filamentwechsel");
    const devices = offlineP1s();
    const status = (devices[0] as FakeDevice).entities.find((entity) => entity.key === "ams_status") as { state: string };
    status.state = "feeding";
    const { card: offline } = await cardFor("offline", { devices });
    expect(find(offline, ".ams-activity")).toBeNull();
    const [printer] = a1mini({ amsStatus: "feeding" }) as [FakeDevice];
    const { card: none } = await cardFor("a1mini", { devices: [{ ...printer, entities: printer.entities.filter((entity) => entity.key !== "ams_status") }] });
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
    const { card } = await cardFor("h2d", { devices: h2d({ externalSpools: [left, right] }) });
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
    const { card } = await cardFor("a1mini", { devices: a1mini({ status: "paused", externalSpools: [spool] }) });
    await showView(card, "Filament");
    (findAll(card, ".slot").at(-1)?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
    await press(card, "Reset spool");
    expect(text(find(card, "dialog p"))).toBe("Its material and color are cleared. The paused print takes its filament from this spool.");

    // Printing from the AMS (the spool in use has no pencil while it feeds).
    const { card: printing } = await cardFor("a1mini", { devices: a1mini({ status: "printing", externalSpools: [{ ...spool, active: false }] }) });
    await showView(printing, "Filament");
    (findAll(printing, ".slot").at(-1)?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(printing);
    expect(findAll(printing, "dialog .dlg-note").map(text)).toContain("Pause the print first to reset the spool.");
  });

  it("offers the printer's own K profiles of the slot's filament", async () => {
    const { card, hass } = await cardFor("x1c", { devices: idleX1c(), callService: answering });
    await showView(card, "Filament");
    await editRow(card, 2);

    expect(hass.calls.find((call) => call.service === "get_k_profiles")).toMatchObject({ domain: "bambuddy", data: { entity_id: SLOT_3 }, returnResponse: true });
    expect(text(find(card, "dialog label[for=fil-k]"))).toBe("K profile (flow dynamics)");
    // What the field holds, once, between its label and the select.
    const about = find(card, "dialog .kfield .k-about");
    expect(text(about)).toBe("The printer's default and the K profiles saved on the printer for this filament.");
    expect(about?.nextElementSibling?.classList.contains("select")).toBe(true);
    expect(find(card, "dialog select#fil-k")?.getAttribute("aria-describedby")).toBe("k-about k-hint");
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

  it("says when the printer has no K profile of its own, and leaves the advice out without a diameter", async () => {
    const none = async (call: { service: string }): Promise<unknown> =>
      call.service === "get_k_profiles" ? { response: { nozzle_diameter: 0.4, current: -1, profiles: [], answered: true } } : undefined;
    const { card } = await cardFor("x1c", { devices: idleX1c(), callService: none });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect([...kSelect(card).options].map((option) => option.text)).toEqual(["Printer's default (K 0.020)"]);
    expect(text(find(card, "dialog #k-hint"))).toBe(
      `No K profiles of your own are saved on the printer for the 0.4${NBSP}mm nozzle diameter. Profiles of your own, for example from the flow dynamics calibration in Bambu Studio or from BamBuddy, show here. Until then the printer uses its default.`,
    );
    // An answer that names no diameter: nothing to say about it.
    const { card: bare } = await cardFor("x1c", { devices: idleX1c() });
    await showView(bare, "Filament");
    await editRow(bare, 2);
    expect(text(find(bare, "dialog #k-hint"))).toBe("If unsure, leave this as it is.");
  });

  it("lets the AMS read a Bambu spool's chip again, once no filament is loaded", async () => {
    const loaded = await cardFor("x1c", { devices: x1c({ status: "idle", stage: "idle" }) });
    await showView(loaded.card, "Filament");
    await editRow(loaded.card, 0);
    expect(text(find(loaded.card, "dialog p"))).toBe("A Bambu Lab spool with a chip: the AMS reads its material and color from the chip.");
    expect(find(loaded.card, "dialog select")).toBeNull();
    expect((button(loaded.card, "Read the chip again") as HTMLButtonElement).disabled).toBe(true);
    // Which filament to unload.
    expect(findAll(loaded.card, "dialog .dlg-note").map(text)).toContain(
      "Re-reading the chip works only while no filament is loaded. Filament from Slot 2 · AMS A is loaded now: unload it first.",
    );
    expect(text(find(loaded.card, "dialog .rfid-spool"))).toBe(`PLA Basic · 80${NBSP}%`);
    expect(findAll(loaded.card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);

    const { card, hass } = await cardFor("x1c", { devices: idleX1c() });
    await showView(card, "Filament");
    await editRow(card, 0);
    await press(card, "Read the chip again");
    expect(hass.calls.at(-1)).toMatchObject({ domain: "bambuddy", service: "refresh_rfid", data: { entity_id: SLOT_1 } });
    expect(find(card, "dialog")).toBeNull();
  });

  it("resets a slot after a question, and goes back on Cancel", async () => {
    const { card, hass } = await cardFor("x1c", { devices: idleX1c() });
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
    const { card } = await cardFor("x1c", { callService: answering });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect((button(card, "Reset slot") as HTMLButtonElement).disabled).toBe(true);
    expect(findAll(card, "dialog .dlg-note").map(text)).toContain("Pause the print first to reset the slot or read its chip again.");
    // Paused: reset works; the chip waits for the filament to be unloaded.
    const { card: paused } = await cardFor("x1c", { devices: x1c({ status: "paused" }), callService: answering });
    await showView(paused, "Filament");
    await editRow(paused, 2);
    expect((button(paused, "Reset slot") as HTMLButtonElement).disabled).toBe(false);
    expect((button(paused, "Read the chip again") as HTMLButtonElement).disabled).toBe(true);
  });

  it("follows the printer while open: a print that starts disables the tools", async () => {
    const { card, hass } = await cardFor("x1c", { devices: idleX1c() });
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
    const { card, hass } = await cardFor("x1c", { devices: idleX1c(), callService: answering });
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
    const { card } = await cardFor("x1c", { devices: idleX1c(), callService: answering });
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
    const { card, hass } = await cardFor("x1c", { devices: idleX1c(), callService: own });
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
    const { card } = await cardFor("x1c", { devices: idleX1c(), callService: slow });
    await showView(card, "Filament");
    await editRow(card, 2);
    await pickFilament(card, "GFG99");
    answer({ response: PROFILES });
    await settle(card);
    expect(kSelect(card).value).toBe("2");
  });

  it("numbers a slot by its own number, also when another slot's sensor is disabled", async () => {
    const devices = idleX1c();
    const ams = devices[1] as FakeDevice;
    ams.entities = ams.entities.filter((entity) => entity.entityId !== "sensor.dev-x1c_ams_0_slot_2");
    const { card } = await cardFor("x1c", { devices });
    await showView(card, "Filament");
    await editRow(card, 1);
    expect(text(find(card, "dialog h2"))).toBe("Filament of Slot 3 · AMS A");
  });

  it("says when the printer did not list its K profiles, and keeps the slot's own", async () => {
    const failing = async (call: { service: string }): Promise<unknown> => {
      if (call.service === "get_k_profiles") throw new Error("no answer");
      return undefined;
    };
    const { card } = await cardFor("x1c", { devices: idleX1c(), callService: failing });
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
    const all = idleX1c();
    for (const entity of (all[1] as FakeDevice).entities) {
      if (entity.entityId === SLOT_3 && "attributes" in entity && entity.attributes) entity.attributes = { ...entity.attributes, name: "Generic PLA" };
    }
    return all;
  };
  const kOptions = (card: FakeCard): string[] => [...kSelect(card).options].map((option) => option.text);
  const kGroups = (card: FakeCard): string[] => [...kSelect(card).querySelectorAll("optgroup")].map((group) => group.label);

  it("names the K group as the Filament field does, kept or chosen", async () => {
    const { card } = await cardFor("x1c", { devices: named(), callService: ownK(3) });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect([...(find<HTMLSelectElement>(card, "dialog select#fil-filament")?.options ?? [])][0]?.text).toBe("Keep Generic PLA");
    expect(kGroups(card)).toEqual(["Matching PLA"]);
    await pickFilament(card, "GFL99");
    expect(kGroups(card)).toEqual(["Matching PLA"]);
  });

  it("lists the kept K profile once, at the top", async () => {
    const { card } = await cardFor("x1c", { devices: named(), callService: ownK(3) });
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
    const { card } = await cardFor("x1c", { devices: named(), callService: answer });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect(kOptions(card)).toEqual(["Keep Unfiled (K 0.030)", "Printer's default (K 0.020)"]);
    expect(kGroups(card)).toEqual([]);
  });

  it("lists the slot's own filament's K profiles where the offer does not come", async () => {
    const failing = (): never => {
      throw new Error("no answer");
    };
    const { card } = await cardFor("x1c", { devices: named(), callService: ownK(3, failing) });
    await showView(card, "Filament");
    await editRow(card, 2);
    // Filed under the filament of the slot's own profile (Grey PLA matte: GFL99).
    expect(kOptions(card)).toEqual(["Keep Grey PLA matte (K 0.018)", "Printer's default (K 0.020)", "Generic PLA (K 0.020)"]);
    expect(kGroups(card)).toEqual(["Matching Generic PLA"]);
  });

  it("names a profile of the slot the printer did not list", async () => {
    const own = async (call: { service: string }): Promise<unknown> => (call.service === "get_k_profiles" ? { response: { ...PROFILES, current: 7 } } : undefined);
    const { card } = await cardFor("x1c", { devices: idleX1c(), callService: own });
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
      const { card } = await cardFor("h2d", { devices: h2d({ status: "idle", hms: [], amsStatus: state }) });
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
      const { card } = await cardFor("h2d", { devices: h2d({ status: "idle", hms: [], amsStatus: state }) });
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
    const { card, hass } = await cardFor("h2d", { devices: h2d({ amsStatus: "feeding" }) });
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
    const { card } = await cardFor("h2d", { language: "de", devices: h2d({ status: "idle", hms: [], amsStatus: "purging" }) });
    await showView(card, "Filament");
    expect(text(find(card, ".note"))).toBe("Warte, bis der Filamentwechsel fertig ist.");
    await showView(card, "Steuerung");
    expect(text(find(card, ".note"))).toBe("Warte, bis der Filamentwechsel fertig ist.");
    const { card: paused } = await cardFor("h2d", { config: { start_view: "filament" }, language: "de", devices: h2d({ amsStatus: "purging" }) });
    expect(text(find(paused, ".note"))).toBe("Warte, bis der Filamentwechsel fertig ist, dann setze den Druck fort.");
    const { card: printing } = await cardFor("x1c", { language: "de" });
    await showView(printing, "Steuerung");
    expect(text(find(printing, ".note.warning"))).toBe("Bewegen und Extrudieren sind möglich, sobald der Druck fertig ist.");
    await showView(printing, "Filament");
    expect(text(find(printing, ".note.warning"))).toBe("Pausiere den Druck, um das Filament zu wechseln.");
  });
});
