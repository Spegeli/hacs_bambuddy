import { describe, expect, it } from "vitest";

import "../src/index";

import { DRYING } from "../src/dialogs";
import { ICONS } from "../src/icons";

import {
  a1mini,
  amsDevice,
  changeEntities,
  h2d,
  IDLE_H2D,
  keepEntities,
  offlineP1s,
  x1c,
  type FakeCard,
  type FakeDevice,
} from "./fixtures";
import { button, declarations, find, findAll, hasButton, moreInfoIds, NBSP, press, shownText, showView, styleText, text, update } from "./helpers";
import { cardFor, confirmDialog, loadButtons, previewOf, useCardPage, withX1c } from "./card-helpers";

useCardPage();

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
    expect(text(find(card, "dialog h2"))).toBe("Load PLA Basic from Slot 1 · AMS\u00a0A?");
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
    // Still by place, not by name: AMS\u00a0A's place before the AMS HT's.
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
    const { card: dual } = await cardFor("h2d", { printer: IDLE_H2D });
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
    const { card, hass } = await cardFor("offline", { devices });
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
    const { card, hass } = await cardFor("h2d", { printer: IDLE_H2D });
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
    const { card, hass } = await cardFor("h2d", { printer: IDLE_H2D });
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
      const { card, hass } = await cardFor("h2d", { language, printer: IDLE_H2D });
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
    const { card, hass } = await cardFor("h2d", { printer: IDLE_H2D });
    await update(card, hass.withState("binary_sensor.dev-h2d_ams_0_drying", "unavailable").withState("binary_sensor.dev-h2d_ams_128_drying", "unknown"));
    await showView(card, "Filament");
    expect(findAll(card, ".drying > span").map(text)).toEqual(["—", "—"]);
  });

  it("dries an AMS 2 Pro at 65 °C at most", async () => {
    const { card, hass } = await cardFor("h2d", { printer: IDLE_H2D });
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
    const devices = changeEntities(h2d(IDLE_H2D), (entity) => entity.key === "drying", (entity) => ({ ...entity.attributes, remote_start: false }));
    const { card } = await cardFor("h2d", { config: { start_view: "filament" }, devices });
    const rows = findAll(card, ".drying");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.flatMap((row) => [...row.querySelectorAll("button")])).toHaveLength(0);
    expect(text(rows[0] ?? null)).toContain("Start and stop it on the printer's screen.");
    // Without control nothing is offered, so nothing needs a word.
    const { card: shown } = await cardFor("h2d", { config: { start_view: "filament", read_only: true }, devices });
    expect(findAll(shown, ".dry-where")).toHaveLength(0);
    // An integration before the attribute: the buttons, as before.
    const { card: older } = await cardFor("h2d", { config: { start_view: "filament" }, printer: IDLE_H2D });
    expect(hasButton(older, "Stop drying")).toBe(true);
  });

  it("asks before it stops drying, also without a time left, and in German", async () => {
    const { card, hass } = await cardFor("h2d", { config: { start_view: "filament" }, printer: IDLE_H2D });
    await update(card, hass.withState("sensor.dev-h2d_ams_0_drying_remaining_time", "0"));
    await press(card, "Stop drying");
    expect(text(find(card, "dialog p"))).toBe("AMS A will stop drying.");
    await press(card, "Keep drying");
    expect(find(card, "dialog")).toBeNull();
    expect(hass.calls).toHaveLength(0);
    const { card: german } = await cardFor("h2d", { config: { start_view: "filament" }, language: "de", printer: IDLE_H2D });
    expect(text(find(german, ".drying"))).toBe(`Trocknet · noch${NBSP}3${NBSP}Std.${NBSP}20${NBSP}Min. Trocknen stoppen`);
    await press(german, "Trocknen stoppen");
    expect(text(find(german, "dialog h2"))).toBe("Trocknen stoppen?");
    expect(text(find(german, "dialog p"))).toBe(`AMS A trocknet noch 3${NBSP}Std.${NBSP}20${NBSP}Min. lang.`);
    expect(text(find(german, "dialog .safe"))).toBe("Weiter trocknen");
  });

  it("waits with loading while a print runs: it asks to pause first", async () => {
    for (const status of ["printing", "preparing", "slicing"]) {
      const { card } = await cardFor("h2d", { printer: { status, stage: "printing", hms: [] } });
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
    expect(text(find(card, "dialog h2"))).toBe("Load PLA Basic from Slot 1 · AMS\u00a0A?");
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
    expect(text(find(card, ".job .job-info"))).toBe("The printer is offline. Check that it is turned on and connected to BamBuddy.");
    const preview = await previewOf("offline", { start_view: "filament", ams_folding: "folded" });
    // Folded as the option says; the external spool unknown.
    expect(findAll<HTMLButtonElement>(preview, "button.unit-head").map((head) => head.getAttribute("aria-expanded"))).toEqual(["false"]);
    expect(findAll(preview, ".slot-main").map((item) => item.getAttribute("aria-label"))).toEqual(["Unknown – External spool"]);
    expect(findAll(preview, ".slot .swatch").map((item) => item.classList.contains("unknown"))).toEqual([true]);
    const german = await previewOf("offline", { start_view: "filament", ams_folding: "open" }, "de");
    // The example follows the option: unfolded, its slots unknown too.
    expect(findAll(german, ".slot-main").map((item) => item.getAttribute("aria-label"))).toEqual(["Unbekannt – Fach 1 · AMS\u00a0A", "Unbekannt – Externe Spule"]);
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
    expect(slots[1]?.getAttribute("aria-label")).toBe(`PLA Matte · In use · 45${NBSP}% – Slot 2 · AMS\u00a0A`);
  });

  it("opens a slot's more-info dialog", async () => {
    const { card } = await cardFor("a1mini");
    await showView(card, "Filament");
    const opened = moreInfoIds(card);
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

describe("what the AMS is doing", () => {
  it("shows in the status and the filament view while it is not idle", async () => {
    const { card, hass } = await cardFor("a1mini", { printer: { amsStatus: "feeding" } });
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
    const { card, hass } = await cardFor("a1mini", { printer: { amsStatus: "assist" } });
    expect(find(card, ".ams-activity")).toBeNull();
    await showView(card, "Filament");
    expect(find(card, ".activity")).toBeNull();
    // A filament change during it still shows.
    await update(card, hass.withState("sensor.a1_mini_ams_status", "feeding"));
    expect(shownText(find(card, ".activity"))).toBe("AMS: Feeding filament");
  });

  it("says it in German, and nothing while the printer is offline or without the sensor", async () => {
    const { card } = await cardFor("a1mini", { language: "de", printer: { amsStatus: "changing_filament" } });
    expect(shownText(find(card, ".ams-activity"))).toBe("AMS: Filamentwechsel");
    const devices = offlineP1s();
    const status = (devices[0] as FakeDevice).entities.find((entity) => entity.key === "ams_status") as { state: string };
    status.state = "feeding";
    const { card: offline } = await cardFor("offline", { devices });
    expect(find(offline, ".ams-activity")).toBeNull();
    const [printer] = a1mini({ amsStatus: "feeding" }) as [FakeDevice];
    const { card: none } = await cardFor("a1mini", { devices: [keepEntities(printer, (entity) => entity.key !== "ams_status")] });
    expect(find(none, ".ams-activity")).toBeNull();
  });
});

describe("a filament change", () => {
  const CHANGING = ["heating", "feeding", "retracting", "verifying", "purging", "changing_filament"];
  const WAIT = "Wait until the filament change is done.";

  it("waits with loading, moving and the nozzle choice; heating stays, cooling waits", async () => {
    for (const state of CHANGING) {
      const { card } = await cardFor("h2d", { printer: { ...IDLE_H2D, amsStatus: state } });
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
      const { card } = await cardFor("h2d", { printer: { ...IDLE_H2D, amsStatus: state } });
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
    const { card, hass } = await cardFor("h2d", { printer: { amsStatus: "feeding" } });
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
    const { card } = await cardFor("h2d", { language: "de", printer: { ...IDLE_H2D, amsStatus: "purging" } });
    await showView(card, "Filament");
    expect(text(find(card, ".note"))).toBe("Warte, bis der Filamentwechsel fertig ist.");
    await showView(card, "Steuerung");
    expect(text(find(card, ".note"))).toBe("Warte, bis der Filamentwechsel fertig ist.");
    const { card: paused } = await cardFor("h2d", { config: { start_view: "filament" }, language: "de", printer: { amsStatus: "purging" } });
    expect(text(find(paused, ".note"))).toBe("Warte, bis der Filamentwechsel fertig ist, dann setze den Druck fort.");
    const { card: printing } = await cardFor("x1c", { language: "de" });
    await showView(printing, "Steuerung");
    expect(text(find(printing, ".note.warning"))).toBe("Bewegen und Extrudieren sind möglich, sobald der Druck fertig ist.");
    await showView(printing, "Filament");
    expect(text(find(printing, ".note.warning"))).toBe("Pausiere den Druck, um das Filament zu wechseln.");
  });
});
