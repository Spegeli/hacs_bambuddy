import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { ICONS } from "../src/icons";

import type { AmsRefs } from "../src/types";
import {
  a1mini,
  amsDevice,
  h2d,
  instanceDevice,
  makeHass,
  missingFromBamBuddy,
  mountCard,
  offlineP1s,
  p1s,
  readOnlyX1c,
  unreachable,
  x1c,
  type FakeCard,
  type FakeDevice,
  type FakeHass,
  type FakeHassOptions,
} from "./fixtures";
import { button, cardText, declarations, find, findAll, hasButton, NBSP, press, root, settle, showView, styleText, text, update } from "./helpers";
import { cardFor, confirmDialog, tapBeside, withX1c } from "./card-helpers";

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

  it("puts the percentage beside the progress bar, the name across the whole width", async () => {
    const { card } = await cardFor("x1c");
    // The name stands alone on its line.
    expect(find(card, ".job-info > .job-name")).not.toBeNull();
    expect(find(card, ".job-top")).toBeNull();
    const row = find(card, ".bar-row");
    expect([...(row?.children ?? [])].map((child) => child.className.split(" ")[0])).toEqual(["bar", "pct"]);
    expect(text(row?.querySelector(".pct"))).toBe(`62${NBSP}%`);
    // A screen reader hears the progress once: the bar says it, the figure beside it is for the eye.
    expect(row?.querySelector(".pct")?.getAttribute("aria-hidden")).toBe("true");
    expect(row?.querySelector(".bar")?.getAttribute("aria-valuetext")).toBe(`62${NBSP}%`);
    const css = styleText();
    expect(declarations(".bar-row", css)).toEqual(expect.arrayContaining(["display: flex", "align-items: center"]));
    expect(declarations(".bar-row .bar", css)).toContain("flex: 1");
  });

  it("breaks a file name after an underscore or a hyphen, never after a period", async () => {
    const { card } = await cardFor("x1c", { devices: x1c({ job: "Gear-set_v2_0.4mm" }) });
    const name = find(card, ".job-name");
    expect(text(name)).toBe("Gear-set_v2_0.4mm");
    expect(name?.getAttribute("title")).toBe("Gear-set_v2_0.4mm");
    // A break opportunity after each "-" and "_", none after the ".".
    const parts = [...(name?.childNodes ?? [])].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent).map((node) => node.textContent);
    expect(parts).toEqual(["Gear-", "set_", "v2_", "0.4mm"]);
    expect(name?.querySelectorAll("wbr")).toHaveLength(3);
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
    const { card } = await cardFor("a1mini", { devices: a1mini({ serverLanguage: "de" }) });
    expect(findAll(card, ".fan .fan-label.full").map(text)).toEqual(["Part cooling fan", "Hotend fan"]);
    expect(findAll(card, ".fan").map((fan) => fan.getAttribute("aria-label"))).toEqual(["Part cooling fan: Off", "Hotend fan: Off"]);
    const { card: german } = await cardFor("a1mini", { language: "de" });
    expect(findAll(german, ".fan .fan-label.full").map(text)).toEqual(["Bauteillüfter", "Hotend-Lüfter"]);
    // A name the user gave in Home Assistant stays, without the printer's
    // name in front, whatever the viewer's language.
    const { card: renamed } = await cardFor("a1mini", { language: "de", devices: a1mini({ renamed: { part_cooling_fan: "Blower" } }) });
    expect(findAll(renamed, ".fan .fan-label.full").map(text)).toEqual(["Blower", "Hotend-Lüfter"]);
    expect(find(renamed, ".fan")?.getAttribute("title")).toBe("Blower");
    const { card: full } = await cardFor("a1mini", { devices: a1mini({ renamed: { part_cooling_fan: "Desk A1 mini Blower" } }) });
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
    const { card } = await cardFor("x1c", { language: "de", devices: x1c({ fans }) });
    // Short as the others: beside "Kammer" and "Abluft" in the
    // fans' row "Bauteil" reads as a fan; the full name stays for screen readers.
    expect(findAll(card, ".fan .fan-label.short").map(text)).toEqual(["Bauteil", "Abluft", "Linker Zusatz", "Rechter Zusatz", "Hotend"]);
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
    const { card } = await cardFor("x1c", { devices: [printer, ams] });
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
    const { card: german } = await cardFor("h2d", { language: "de" });
    expect(find(german, "button.ams-strip")?.getAttribute("aria-label")).toBe("AMS und Filament – Filament-Ansicht öffnen");
    expect(text(find(german, "#ams-said"))).toBe(
      `AMS A (AMS 2 Pro, rechte Düse), Feuchte 14${NBSP}%, Temperatur 52${NBSP}°C: PLA Basic · 92${NBSP}%, PLA Basic · 61${NBSP}% · In Gebrauch, PLA Silk+ · 12${NBSP}%, Support for PLA · 70${NBSP}%. ` +
        `AMS HT A (linke Düse), Feuchte 9${NBSP}%, Temperatur 30${NBSP}°C: PA6-CF · 55${NBSP}%. Externe Spulen: Links: PETG HF, Rechts: Nicht festgelegt`,
    );
    // Without the Filament tab the strip is no button: a named group that says the same.
    const { card: noTab } = await cardFor("x1c", { config: { show_filament_tab: false } });
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

  describe("the tapped speed shows until the printer reports", () => {
    const SPEED = "select.x1c_print_speed";
    const checked = (card: FakeCard): (string | null)[] => findAll(card, ".speed [role=radio]").map((item) => item.getAttribute("aria-checked"));
    const stop = (card: FakeCard): number => findAll(card, ".speed [role=radio]").findIndex((item) => item.getAttribute("tabindex") === "0");

    it("shows the tapped choice at once, its tab stop with it", async () => {
      const { card, hass } = await cardFor("x1c");
      await press(card, "Sport (124 %)");
      expect(hass.states[SPEED]?.state).toBe("standard");
      expect(checked(card)).toEqual(["false", "false", "true", "false"]);
      expect(stop(card)).toBe(2);
    });

    it("ends at the printer's report: the tapped choice, or another", async () => {
      const { card, hass } = await cardFor("x1c");
      await press(card, "Sport (124 %)");
      await update(card, hass.withState(SPEED, "sport"));
      expect(checked(card)).toEqual(["false", "false", "true", "false"]);
      await update(card, (card.hass as FakeHass).withState(SPEED, "silent"));
      expect(checked(card)).toEqual(["true", "false", "false", "false"]);
    });

    it("ends at a report of an option it did not tap", async () => {
      const { card, hass } = await cardFor("x1c");
      await press(card, "Sport (124 %)");
      // The printer kept another speed: that one shows, not the tap.
      await update(card, hass.withState(SPEED, "silent"));
      expect(checked(card)).toEqual(["true", "false", "false", "false"]);
    });

    it("ends while the speed is unavailable", async () => {
      const { card, hass } = await cardFor("x1c");
      await press(card, "Sport (124 %)");
      await update(card, hass.withState(SPEED, "unavailable"));
      expect(checked(card)).toEqual(["false", "false", "false", "false"]);
    });

    it("ends after a while without a report", async () => {
      const { card } = await cardFor("x1c");
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      button(card, "Sport (124 %)").click();
      await vi.advanceTimersByTimeAsync(0);
      expect(checked(card)).toEqual(["false", "false", "true", "false"]);
      await vi.advanceTimersByTimeAsync(10_500);
      await card.updateComplete;
      expect(checked(card)).toEqual(["false", "true", "false", "false"]);
    });

    it("ends at once when the command fails", async () => {
      const { card } = await cardFor("x1c", { callService: async (call) => {
          if (call.service === "select_option") throw new Error("BamBuddy did not answer");
        } });
      await press(card, "Sport (124 %)");
      await card.updateComplete;
      expect(checked(card)).toEqual(["false", "true", "false", "false"]);
    });

    it("takes no second tap while the first is sent", async () => {
      let release: () => void = () => {};
      const { card, hass } = await cardFor("x1c", { callService: (call) => (call.service === "select_option" ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()) });
      await press(card, "Sport (124 %)");
      await press(card, "Silent (50 %)");
      expect(checked(card)).toEqual(["false", "false", "true", "false"]);
      release();
      await card.updateComplete;
      expect(hass.calls.filter((call) => call.service === "select_option")).toHaveLength(1);
    });
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
    const { card } = await cardFor("x1c", { language: "de" });
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

  it("opens a dialog at its top, the safe button focused without scrolling to it", async () => {
    // The button row stands last in the dialog: focusing it would scroll a long dialog down.
    const scrolled: number[] = [];
    const original = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement): void {
      original.call(this);
      this.scrollTop = 251;
    };
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    try {
      const { card } = await cardFor("x1c");
      await press(card, "Stop print");
      const dialog = find<HTMLDialogElement>(card, "dialog") as HTMLDialogElement;
      scrolled.push(dialog.scrollTop);
      const safe = find(card, "dialog .dlg-actions .safe");
      expect(focus.mock.contexts.at(-1)).toBe(safe);
      expect(focus.mock.calls.at(-1)?.[0]).toEqual({ preventScroll: true });
      expect(scrolled).toEqual([0]);
    } finally {
      HTMLDialogElement.prototype.showModal = original;
      focus.mockRestore();
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
    const { card } = await cardFor("a1mini", { devices: a1mini({ status: "paused" }) });
    const controls = find(card, ".controls") as HTMLElement;
    expect(text(controls.firstElementChild)).toBe(NOTE);
    expect(controls.firstElementChild?.classList.contains("warning")).toBe(true);
    // Something in use: no note; and not while printing.
    const { card: loaded } = await withX1c({ status: "paused" });
    expect(cardText(loaded)).not.toContain(NOTE);
    const { card: printing } = await cardFor("a1mini");
    expect(cardText(printing)).not.toContain(NOTE);
    // The integration names the loaded filament, though no slot says so.
    const { card: named, hass } = await cardFor("a1mini", { devices: a1mini({ status: "paused" }) });
    await update(named, hass.withState("sensor.a1_mini_active_filament", "PLA Basic"));
    expect(cardText(named)).not.toContain(NOTE);
    // Two nozzles: what "nothing loaded" means there is not clear.
    const devices = h2d();
    for (const device of devices) for (const entity of device.entities) if (entity.attributes?.["active"] === true) entity.attributes["active"] = false;
    const { card: dual } = await cardFor("h2d", { devices });
    expect(cardText(dual)).not.toContain(NOTE);
    const { card: german } = await cardFor("a1mini", { language: "de", devices: a1mini({ status: "paused" }) });
    expect(cardText(german)).toContain("Kein Filament geladen. Lade eines im Tab „Filament“, bevor du fortsetzt.");
    // Without the Filament tab, the note names none.
    const { card: noTab } = await cardFor("a1mini", { config: { show_filament_tab: false }, devices: a1mini({ status: "paused" }) });
    expect(text(find(noTab, ".controls .note"))).toBe("No filament loaded. Load one before resuming.");
    const { card: keinTab } = await cardFor("a1mini", { config: { show_filament_tab: false }, language: "de", devices: a1mini({ status: "paused" }) });
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
    const { card } = await cardFor("x1c", { devices });
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
    const { card } = await cardFor("offline");
    // The warning is the state: no line besides it.
    expect(find(card, ".state")).toBeNull();
    expect(find(card, ".dot")?.classList.contains("on")).toBe(false);
    expect(text(find(card, ".job-info"))).toBe("The printer is offline. Check that it is switched on and connected to BamBuddy.");
    expect(find(card, ".temps")).toBeNull();
    expect(find(card, ".fans")).toBeNull();
    expect(find(card, ".ams-strip")).toBeNull();
    expect(find(card, ".controls")).toBeNull();
    expect(find(card, "button.live-hint")).toBeNull();
    expect(find(card, ".picture.offline-pic")).not.toBeNull();
    expect(button(card, "Chamber light").disabled).toBe(true);
  });

  it("knows BamBuddy gives no data also where the user disabled the Online sensor", async () => {
    const withoutOnline = (devices: FakeDevice[]): FakeDevice[] =>
      devices.map((device) => ({ ...device, entities: device.entities.filter((entity) => entity.key !== "online") }));
    const { card } = await cardFor("x1c", { devices: withoutOnline(unreachable(x1c())) });
    expect(find(card, ".dot")?.classList.contains("on")).toBe(false);
    expect(find(card, ".dot")?.getAttribute("aria-label")).toBe("No data from BamBuddy");
    // An unplugged unit leaves the strip as it does with the sensor.
    const [printer, ams] = x1c() as [FakeDevice, FakeDevice];
    const unplugged = { ...ams, entities: ams.entities.map((entity) => ({ ...entity, state: "unavailable", attributes: {} })) };
    const { card: strip } = await cardFor("x1c", { devices: withoutOnline([printer, unplugged]) });
    expect(findAll(strip, ".ams-strip .ams-name").map(text)).toEqual(["Ext"]);
  });

  it("says BamBuddy cannot be reached where the integration has no answer at all, not that the printer is offline", async () => {
    const { card, hass } = await cardFor("x1c", { devices: unreachable(x1c()) });
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
    const { card: german } = await cardFor("x1c", { devices: unreachable(x1c()), language: "de" });
    expect(text(find(german, ".job-info"))).toBe("Keine Daten von BamBuddy. Prüfe, ob BamBuddy läuft, und unter Einstellungen → Geräte & Dienste, ob BamBuddy einen neuen API-Schlüssel braucht.");
    expect(find(german, ".dot")?.getAttribute("aria-label")).toBe("Keine Daten von BamBuddy");
    // Someone who may not open the settings is not sent there.
    const { card: user } = await cardFor("x1c", { devices: unreachable(x1c()), admin: false });
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
    const { card, hass } = await cardFor("x1c", { devices });
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
    const { card: german } = await cardFor("x1c", { devices, language: "de" });
    expect(text(find(german, ".job-info"))).toBe(
      "BamBuddy führt diesen Drucker nicht mehr. Unter Einstellungen → Reparaturen kannst du ihn entfernen; führt BamBuddy ihn wieder, erscheint er hier von selbst.",
    );
    expect(find(german, ".dot")?.getAttribute("aria-label")).toBe("Nicht mehr in BamBuddy");
    // Someone who may not open the settings is not sent there.
    const { card: user } = await cardFor("x1c", { devices, admin: false });
    expect(text(find(user, ".job-info"))).toBe("BamBuddy no longer lists this printer. Once BamBuddy lists it again, it comes back here by itself.");
    // BamBuddy down since: the printer still waits -- as the list says.
    const { card: stopped } = await cardFor("x1c", { devices: linked(missingFromBamBuddy(x1c()), naming(["dev-x1c"], "off")) });
    expect(text(find(stopped, ".job-info"))).toBe(message);
    // While the entry sets up, its printers' states are still the restored
    // ones and the sensor names none of them: no data, not "missing".
    const { card: setting } = await cardFor("x1c", { devices: linked(missingFromBamBuddy(x1c()), naming([])) });
    expect(text(find(setting, ".job-info"))).toContain("No data from BamBuddy");
    // The entry not loaded: BamBuddy's sensor is restored too -- as before.
    const { card: unloaded } = await cardFor("x1c", { devices: missingFromBamBuddy(linked(x1c(), instanceDevice)) });
    expect(text(find(unloaded, ".job-info"))).toContain("No data from BamBuddy");
  });

  it("knows a printer is offline from its print status where it has no Online sensor", async () => {
    const [printer, ams] = offlineP1s() as [FakeDevice, FakeDevice];
    const devices = [{ ...printer, entities: printer.entities.filter((entity) => entity.key !== "online") }, ams];
    const { card } = await cardFor("offline", { devices });
    expect(text(find(card, ".job-info"))).toContain("The printer is offline.");
    const online = x1c()[0] as FakeDevice;
    const { card: other } = await cardFor("x1c", { devices: [{ ...online, entities: online.entities.filter((entity) => entity.key !== "online") }] });
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
    const { card: idle } = await cardFor("readOnly", { devices: readOnlyX1c({ status: "idle", plateClearNeeded: true }) });
    expect(find(idle, ".controls")).toBeNull();
    expect(findAll(idle, ".note")).toHaveLength(0);
    expect(hasButton(idle, "Plate cleared")).toBe(false);
    // Home Assistant cannot confirm it with this key: only BamBuddy can.
    expect(text(find(idle, ".callout"))).toBe("Take the print off the plate. BamBuddy starts the next queued print only once that is confirmed in BamBuddy.");
  });

  it("knows the key may control from any of its controls: the user may have disabled one", async () => {
    const [printer, ams] = x1c() as [FakeDevice, FakeDevice];
    const noPause = { ...printer, entities: printer.entities.filter((entity) => entity.key !== "pause") };
    const { card } = await cardFor("x1c", { devices: [noPause, ams] });
    expect(cardText(card)).not.toContain("Controls need an API key");
    expect(hasButton(card, "Pause print")).toBe(false);
    expect(hasButton(card, "Stop print")).toBe(true);
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Control", "Filament"]);
    // Only the light left: still a key that may control.
    const onlyLight = { ...printer, entities: printer.entities.filter((entity) => !/^(button|select|number|fan|switch)\./.test(entity.entityId) || entity.key === "refresh_status") };
    const { card: light } = await cardFor("x1c", { devices: [onlyLight, ams] });
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
    const { card } = await cardFor("readOnly", { devices: [bare] });
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
    const { card } = await cardFor("x1c", { callService: answering([{ id: 11, name: "Lamp shade", skipped: false }]) });
    await press(card, "Skip objects");
    expect(find(card, "dialog .obj input")).toBeNull();
    expect(text(find(card, "dialog"))).toContain("This print has only one object. To leave it out, stop the print.");
    // Nothing to choose: one way out, and a note, not a warning.
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);
    expect(find(card, "dialog .dlg-warn.info .icon path")?.getAttribute("d")).toBe(ICONS.info);
    expect(styleText()).toMatch(/\.dlg-warn\.info \.icon\s*\{\s*color: var\(--bb-accent\);/);
  });

  it("lists the objects, the skipped ones struck through, and skips the chosen ones after asking", async () => {
    const { card, hass } = await cardFor("x1c", { callService: answering() });
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
    const { card } = await cardFor("x1c", { callService: answering(), devices: [...x1c(), ...h2d()] });
    await press(card, "Skip objects");
    expect(find(card, "dialog")).not.toBeNull();
    card.setConfig({ type: "custom:bambuddy-printer-card", printer: "dev-h2d" });
    await card.updateComplete;
    expect(find(card, "dialog")).toBeNull();
  });

  it("never skips every object: stopping the print does that", async () => {
    const { card } = await cardFor("x1c", { callService: answering() });
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
    const { card: german } = await cardFor("x1c", { language: "de",
      callService: answering([
        { id: 1, name: "Benchy", skipped: false },
        { id: 2, name: "Clip", skipped: false },
      ]) });
    await press(german, "Objekte überspringen");
    for (const box of findAll<HTMLInputElement>(german, "dialog .obj input")) {
      box.click();
      await german.updateComplete;
    }
    expect(text(find(german, "dialog .dlg-warn"))).toBe("Um alle Objekte zu überspringen, stoppe stattdessen den Druck.");
    expect(findAll<HTMLButtonElement>(german, "dialog .dlg-actions .btn")[1]?.disabled).toBe(true);
  });

  it("skips nothing with the safe choice", async () => {
    const { card, hass } = await cardFor("h2d", { callService: answering() });
    await press(card, "Skip objects");
    findAll<HTMLInputElement>(card, "dialog .obj input")[0]?.click();
    await press(card, "Cancel");
    expect(find(card, "dialog")).toBeNull();
    expect(hass.calls.map((call) => call.service)).toEqual(["get_print_objects"]);
  });

  it("shows that it is loading, and why it cannot list them", async () => {
    let answer: (value: unknown) => void = () => undefined;
    let fail: (reason: unknown) => void = () => undefined;
    const { card } = await cardFor("x1c", { callService: () =>
        new Promise((resolve, reject) => {
          answer = resolve;
          fail = reject;
        }) });
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
    const { card } = await cardFor("x1c", { callService: () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }) });
    await press(card, "Skip objects");
    await press(card, "Cancel");
    fail({ message: "Too late." });
    await settle(card);
    expect(find(card, "dialog")).toBeNull();
    expect(find(card, ".toast")).toBeNull();
  });

  it("says when BamBuddy lists no objects", async () => {
    const { card } = await cardFor("x1c", { callService: answering([]) });
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
    const { card } = await cardFor("x1c", { language: "de", callService: answering() });
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
    const { card } = await cardFor("x1c", { language: "de", devices: x1c({ developerMode: "off" }) });
    expect(text(find(card, ".note.warning"))).toBe(
      "Der Drucker nimmt keine Befehle an: Sein Entwicklermodus (LAN) ist aus. Schalte ihn am Display des Druckers unter Einstellungen → Netzwerk (oder WLAN) ein: erst „LAN Only Mode“, dann „Developer Mode“. Trage danach den neuen Zugangscode in BamBuddy ein.",
    );
  });

  it("says nothing while it is on or unknown, offline, without the sensor or without controls", async () => {
    for (const developerMode of ["on", "unknown", "none"] as const) {
      const { card } = await withX1c({ developerMode });
      expect(cardText(card), developerMode).not.toContain(HINT);
    }
    const { card: offline } = await cardFor("offline", { devices: offlineP1s() });
    expect(cardText(offline)).not.toContain(HINT);
    const { card: readOnly } = await cardFor("readOnly", { devices: readOnlyX1c({ developerMode: "off" }) });
    expect(cardText(readOnly)).not.toContain(HINT);
    const { card: plain } = await withX1c({ developerMode: "off" }, { read_only: true });
    expect(cardText(plain)).not.toContain(HINT);
  });
});

describe("the external spool's switch", () => {
  const SPOOL = { name: "PLA Basic", type: "PLA", color: "#FFFFFF", remaining: null, trayId: 254 };
  const stripNames = (card: FakeCard): string[] => findAll(card, ".ams-group .ams-name").map(text);
  const unitNames = (card: FakeCard): string[] => findAll(card, ".unit .unit-name").map(text);

  it("hides the external spool on a printer with an AMS", async () => {
    const { card } = await cardFor("x1c", { config: { show_external_spool: false }, devices: x1c({ externalSpools: [SPOOL] }) });
    expect(stripNames(card)).not.toContain("Ext");
    await showView(card, "Filament");
    expect(unitNames(card)).not.toContain("External spool");
    // On by default.
    const { card: shown } = await cardFor("x1c", { devices: x1c({ externalSpools: [SPOOL] }) });
    expect(stripNames(shown)).toContain("Ext");
  });

  it("shows the spool the printer feeds from all the same", async () => {
    const { card } = await cardFor("x1c", { config: { show_external_spool: false }, devices: x1c({ externalSpools: [{ ...SPOOL, active: true }] }) });
    expect(stripNames(card)).toContain("Ext");
    await showView(card, "Filament");
    expect(unitNames(card)).toContain("External spool");
    const external = findAll(card, "section.unit").find((unit) => text(unit.querySelector(".unit-name")) === "External spool");
    expect([...(external?.querySelectorAll("button") ?? [])].map(text)).toContain("Unload");
  });

  it("keeps a spool the job fed from till the job ends", async () => {
    // A two-nozzle print takes the external spool in turns with an AMS, a
    // run-out unloads it in the pause: the job still prints from it.
    const left = { ...SPOOL, name: "Matte Left", trayId: 254 };
    const right = { ...SPOOL, name: "PETG HF", type: "PETG", trayId: 255, active: true };
    const { card, hass } = await cardFor("h2d", { config: { show_external_spool: false }, devices: h2d({ status: "paused", externalSpools: [left, right] }) });
    const sides = (): string[] => findAll(card, ".ams-strip .slot-side").map(text);
    expect(sides()).toEqual(["R"]);
    const spool = "sensor.h2d_right_external_spool";
    const resting = hass.withState(spool, "PETG HF", { ...hass.states[spool]?.attributes, active: false });
    await update(card, resting);
    expect(sides()).toEqual(["R"]);
    await update(card, resting.withState("sensor.h2d_print_status", "printing"));
    expect(sides()).toEqual(["R"]);
    // The job over: hidden again.
    await update(card, resting.withState("sensor.h2d_print_status", "finished"));
    expect(sides()).toEqual([]);
  });

  it("keeps the external spool on a printer without an AMS", async () => {
    const devices = x1c({ externalSpools: [SPOOL] }).filter((device) => device.id === "dev-x1c");
    const { card } = await cardFor("x1c", { config: { show_external_spool: false }, devices });
    expect(stripNames(card)).toContain("Ext");
  });

  it("keeps the side of the one external spool it shows", async () => {
    const left = { ...SPOOL, name: "Matte Left", trayId: 254 };
    const right = { ...SPOOL, name: "PETG HF", type: "PETG", trayId: 255, active: true };
    const { card } = await cardFor("h2d", { config: { show_external_spool: false }, devices: h2d({ externalSpools: [left, right] }) });
    expect(cardText(card)).not.toContain("Matte Left");
    // The Status strip's side too: R, from both spools, not "the first shown".
    expect(findAll(card, ".ams-strip .slot-side").map(text)).toEqual(["R"]);
    await showView(card, "Filament");
    // One spool shown: no plural over it, its side kept.
    const external = findAll(card, "section.unit").find((unit) => text(unit.querySelector(".unit-name")) === "External spool");
    const slots = [...(external?.querySelectorAll(".slot") ?? [])].map(text);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toContain("PETG HF");
    expect(slots[0]).toContain("Right");
    expect(cardText(card)).not.toContain("Matte Left");
  });
});
