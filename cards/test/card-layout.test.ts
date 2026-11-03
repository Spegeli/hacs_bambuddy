import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { BamBuddyPrinterCard } from "../src/card";
import { HEADER_CHIPS, type AmsRefs } from "../src/types";
import {
  a1mini,
  amsDevice,
  h2d,
  instanceDevice,
  makeHass,
  mountCard,
  offlineP1s,
  p1s,
  plugDevice,
  readOnlyX1c,
  unreachable,
  x1c,
  type FakeCard,
  type FakeDevice,
  type FakeHass,
} from "./fixtures";
import { atRule, button, declarations, find, findAll, hasButton, NBSP, press, root, settle, showView, styleText, text, update } from "./helpers";
import { cardFor, loadButtons, previewOf, PRINTERS, samples, withX1c } from "./card-helpers";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("a failed action", () => {
  const offline = { code: "home_assistant_error", message: "Printer offline", translation_domain: "bambuddy", translation_key: "printer_offline" };

  it("shows why in the card until closed", async () => {
    const { card } = await cardFor("x1c", { callService: async () => Promise.reject(offline) });
    await press(card, "Pause print");
    expect(text(find(card, ".toast"))).toBe("Printer offline");
    expect(find(card, ".toast")?.getAttribute("role")).toBe("alert");
    await press(card, "Dismiss the error");
    expect(find(card, ".toast")).toBeNull();
  });

  it("goes away by itself after a while", async () => {
    vi.useFakeTimers();
    const { card } = await cardFor("x1c", { callService: async () => Promise.reject(offline) });
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
    const { card, hass } = await cardFor("x1c", { callService: () => new Promise<void>((resolve) => (finish = resolve)) });
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
    const { card, hass } = await cardFor("a1mini", { devices: [a1mini()[0] as FakeDevice] });
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
    const { card } = await cardFor("x1c", { language: "de" });
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
    const { card } = await cardFor("x1c", { config: { status_blocks: ["fans", "temperatures", "speed"] } });
    expect(parts(card)).toEqual(["job", "fans", "temps", "speed"]);
    expect(hasButton(card, "Pause print")).toBe(false);
    // The speed is a block of its own: pause and stop without it.
    const { card: controls } = await cardFor("x1c", { config: { status_blocks: ["controls"] } });
    expect(parts(controls)).toEqual(["job", "controls"]);
    expect(find(controls, ".speed")).toBeNull();
    expect(hasButton(controls, "Stop print")).toBe(true);
  });

  it("keeps the job and its state however few blocks are left", async () => {
    const { card } = await cardFor("x1c", { config: { status_blocks: [] } });
    expect(parts(card)).toEqual(["job"]);
    expect(text(find(card, ".state"))).toBe("Printing");
  });

  /** A chip's kind, by the class that names it. */
  const chipKind = (pill: Element): string | undefined => [...pill.classList].find((name) => (HEADER_CHIPS as readonly string[]).includes(name));

  it("shows only the chips the user chose, in their order, and an HMS error whatever they are", async () => {
    const { card } = await cardFor("x1c", { config: { header_chips: ["firmware"] } });
    expect(findAll(card, ".pill").map((pill) => chipKind(pill))).toEqual(["firmware"]);
    const { card: ordered } = await cardFor("p1s");
    expect(findAll(ordered, ".pill").map((pill) => chipKind(pill))).toEqual(["network", "hms", "firmware"]);
    const { card: reordered } = await cardFor("p1s", { config: { header_chips: ["firmware", "hms", "network"] } });
    expect(findAll(reordered, ".pill").map((pill) => chipKind(pill))).toEqual(["firmware", "hms", "network"]);
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
    const { card: printing } = await cardFor("x1c", { config: { read_only: true } });
    expect(find(printing, ".controls")).toBeNull();
    // The speed as it is, without choices.
    expect(find(printing, ".speeds")).toBeNull();
    expect(find(printing, ".speed-now")).not.toBeNull();
  });

  it("leaves the tabs out the user switches off", async () => {
    const { card } = await cardFor("x1c", { config: { show_control_tab: false } });
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Filament"]);
    const { card: noFilament } = await cardFor("x1c", { config: { show_filament_tab: false } });
    expect(findAll(noFilament, "[role=tab]").map(text)).toEqual(["Status", "Control"]);
    // The colours stay, but lead nowhere: no button, no chevron.
    expect(find(noFilament, "div.ams-strip")).not.toBeNull();
    expect(find(noFilament, "button.ams-strip")).toBeNull();
    expect(find(noFilament, ".ams-go")).toBeNull();
    const { card: statusOnly } = await cardFor("x1c", { config: { show_control_tab: false, show_filament_tab: false } });
    expect(find(statusOnly, ".tabs")).toBeNull();
  });

  it("has no control view without sections, nor without control entities", async () => {
    const { card } = await cardFor("x1c", { config: { control_sections: [] } });
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Filament"]);
    const { card: readOnly } = await cardFor("readOnly");
    expect(findAll(readOnly, "[role=tab]").map(text)).toEqual(["Status", "Filament"]);
  });

  it("has no control view where the chosen sections have nothing to show", async () => {
    const tabs = (card: FakeCard): string[] => findAll(card, "[role=tab]").map(text);
    // A P1S has no detection switches: the print options alone show nothing.
    const { card } = await cardFor("p1s", { config: { control_sections: ["options"] } });
    expect(tabs(card)).toEqual(["Status", "Filament"]);
    const { card: heating } = await cardFor("p1s", { config: { control_sections: ["options", "heating"] } });
    expect(tabs(heating)).toEqual(["Status", "Control", "Filament"]);
    // Heating needs a target to set; the user may have disabled them.
    const [printer] = p1s() as [FakeDevice];
    const noTargets = { ...printer, entities: printer.entities.filter((entity) => !entity.entityId.startsWith("number.")) };
    const { card: cold } = await cardFor("offline", { config: { control_sections: ["heating", "options"] }, devices: [noTargets] });
    expect(tabs(cold)).toEqual(["Status", "Filament"]);
    // Moving is always there.
    const { card: moving } = await cardFor("offline", { config: { control_sections: ["options", "motion"] }, devices: [noTargets] });
    expect(tabs(moving)).toEqual(["Status", "Control", "Filament"]);
  });

  it("opens on the tab the user chose, where the card has it", async () => {
    const { card } = await cardFor("x1c", { config: { start_view: "filament" } });
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Filament");
    expect(find(card, ".unit")).not.toBeNull();
    // Hide controls with only the axes: no Control tab, so Status.
    const { card: control } = await cardFor("x1c", { config: { start_view: "control", read_only: true, control_sections: ["motion"] } });
    expect(text(find(control, '[role=tab][aria-selected="true"]'))).toBe("Status");
  });

  it("orders the control view's sections as the user chose", async () => {
    const { card } = await cardFor("x1c", { config: { start_view: "control", control_sections: ["motion", "heating"] } });
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
    const { card } = await cardFor("h2d", { config: { start_view: "filament" } });
    expect(heads(card).map((head) => head.getAttribute("aria-expanded"))).toEqual(["true", "true"]);
    expect(findAll(card, ".unit .slots")).toHaveLength(3);
  });

  it("folds from three units on: the head, the colours with the one in use, the drying", async () => {
    const { card } = await cardFor("x1c", { config: { start_view: "filament" }, devices: threeUnits() });
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
    const { card } = await cardFor("x1c", { config: { start_view: "filament" }, devices: threeUnits() });
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
    const { card } = await cardFor("h2d", { config: { start_view: "filament", ams_folding: "folded" } });
    expect(heads(card).map((head) => head.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
    heads(card)[0]?.click();
    await card.updateComplete;
    expect(heads(card)[0]?.getAttribute("aria-expanded")).toBe("true");
    card.setConfig({ type: "custom:bambuddy-printer-card", printer: "dev-h2d", start_view: "filament", ams_folding: "folded" });
    await card.updateComplete;
    expect(heads(card)[0]?.getAttribute("aria-expanded")).toBe("false");
    const { card: open } = await cardFor("x1c", { config: { start_view: "filament", ams_folding: "open" }, devices: threeUnits() });
    expect(findAll(open, ".unit.open")).toHaveLength(3);
  });

  it("offers to resume a paused print where the filament is changed", async () => {
    const { card, hass } = await cardFor("h2d", { config: { start_view: "filament" } });
    expect(text(find(card, ".callout"))).toContain("Print paused: you can change the filament now.");
    await press(card, "Resume print");
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "button.h2d_resume" });
    const { card: readOnly } = await cardFor("h2d", { config: { start_view: "filament", read_only: true } });
    expect(find(readOnly, ".callout")).toBeNull();
    const { card: printing } = await cardFor("x1c", { config: { start_view: "filament" } });
    expect(find(printing, ".callout")).toBeNull();
  });

  it("sends the user to the printer's message first where the printer paused the print itself", async () => {
    const { card, hass } = await cardFor("h2d", { config: { start_view: "filament" } });
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
    expect(declarations(".p-row.warn .p-sub", sheet)).toContain("color: color-mix(in srgb, var(--bb-warn) 55%, var(--bb-text))");
    expect(declarations(".p-row.warn .p-icon", sheet)).toContain("color: var(--bb-warn)");
    expect(sheet).toMatch(/\.p-auto\.waiting \.p-name,\s*\.p-starting \.p-name\s*\{[^}]*color: color-mix\(in srgb, var\(--bb-accent\) 55%, var\(--bb-text\)\);/);
    expect(declarations(".p-auto.waiting .p-icon", sheet)).toContain("color: var(--bb-accent)");
    expect(declarations(".hms-wiki", sheet)).toContain("color: color-mix(in srgb, var(--bb-accent) 55%, var(--bb-text))");
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
    expect(declarations(".state .icon", sheet)).toContain("color: var(--tone)");
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
    expect(declarations(".dlg-actions .btn.danger", sheet)).toContain("color: #fff");
    // A text button has no tint of its own: the tonal button's colour.
    expect(sheet).toMatch(/\.btn\.plain\s*\{\s*background: none;\s*padding: 0 8px;\s*\}/);
    // The camera's panel is dark in every theme: its button stays white.
    expect(declarations(".live.failed .btn", sheet)).toContain("color: #fff");
    // The speeds' percentages read as their names do.
    expect(declarations(".seg.speeds .opt-sub", sheet)).toContain("opacity: 1");
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
    expect(declarations(".icon-btn.pending", sheet)).toContain("cursor: progress");
    // The head's round buttons too: the light.
    expect(sheet).toMatch(/\.btn\.pending > \.icon,\s*\.icon-btn\.pending > \.icon\s*\{[^}]*border: 2px solid currentColor;[^}]*border-right-color: transparent;[^}]*border-radius: 50%;[^}]*animation: spin/);
    expect(sheet).toMatch(/\.btn\.pending > \.icon path,\s*\.icon-btn\.pending > \.icon path\s*\{[^}]*display: none;/);
    expect(atRule("@media (prefers-reduced-motion: reduce)")).toMatch(/\.btn\.pending > \.icon,\s*\.icon-btn\.pending > \.icon/);
  });

  it("is marked on its button while it runs", async () => {
    let finish: () => void = () => undefined;
    const { card } = await cardFor("x1c", { callService: () => new Promise((resolve) => (finish = () => resolve(undefined))) });
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
    const { card, hass } = await cardFor("x1c", { callService: () => new Promise((resolve) => (finish = () => resolve(undefined))) });
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
    const { card, hass } = await cardFor("x1c", { callService: () => new Promise((resolve) => (finish = () => resolve(undefined))) });
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
    expect(declarations("dialog::backdrop", sheet)).toContain("background: rgba(0, 0, 0, 0.55)");
    // What lies on the dialog takes its surface, not the card's.
    expect(declarations(".select select", sheet)).toContain("background: var(--bb-surface)");
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
    expect(declarations(".ams-strip .ams-nozzle", styleText())).toEqual(expect.arrayContaining(["background: var(--bb-tint-2)", "color: color-mix(in srgb, var(--bb-muted) 50%, var(--bb-text))"]));
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
    const card = await previewOf("offline");
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
    const german = await previewOf("offline", { status_blocks: ["fans"] }, "de");
    expect(samples(german)).toEqual(["Beispiel – erscheint, sobald der Drucker online ist"]);
  });

  it("shows no examples on the dashboard, also while it is edited", async () => {
    const { card } = await cardFor("a1mini");
    expect(find(card, ".sample")).toBeNull();
    // Home Assistant sets preview on every card of a dashboard in edit mode:
    // the cards keep the size they will have.
    const edited: FakeCard[] = [];
    for (const name of ["a1mini", "offline"] as const) {
      const [make, printer] = PRINTERS[name];
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
    const { card } = await cardFor("offline");
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
    const temps = await previewOf("offline", { status_blocks: ["temperatures"] }, "en", bare);
    expect(samples(temps)).toEqual([]);
  });

  it("says BamBuddy, not the printer, while BamBuddy gives no data", async () => {
    const card = await previewOf("x1c", { status_blocks: ["temperatures"] }, "en", unreachable(x1c()));
    expect(samples(card)).toEqual(["Example – shown once BamBuddy answers"]);
    const german = await previewOf("x1c", { start_view: "control" }, "de", unreachable(x1c()));
    expect(samples(german)).toEqual(["Beispiel – erscheint, sobald BamBuddy antwortet"]);
  });

  it("puts examples in a row that show at the same time under one note", async () => {
    const card = await previewOf("offline", { status_blocks: ["temperatures", "fans", "controls", "speed", "ams"] });
    expect(samples(card)).toEqual(["Example – shown once the printer is online", "Example – shown during a print", "Example – shown once the printer is online"]);
    const [first, print] = findAll(card, ".sample .sample-body");
    expect([...(first?.children ?? [])].map((child) => child.className.split(" ")[0])).toEqual(["temps", "fans"]);
    expect([...(print?.children ?? [])].map((child) => child.className.split(" ")[0])).toEqual(["controls", "speed"]);
    // A section that shows now ends the row.
    const idle = await previewOf("a1mini", { status_blocks: ["controls", "temperatures", "speed"] });
    expect(samples(idle)).toEqual(["Example – shown during a print", "Example – shown during a print"]);
  });

  it("fades the example and lets no tap through", () => {
    expect(declarations(".sample-body", styleText())).toEqual(expect.arrayContaining(["opacity: 0.55", "pointer-events: none"]));
  });
});

describe("an offline printer's tabs, closer", () => {
  it("say no data from BamBuddy where it gives none, in every tab", async () => {
    const { card } = await cardFor("x1c", { devices: unreachable(x1c()) });
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
    const card = await previewOf("offline", { status_blocks: ["power"] }, "en", [
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
    expect(declarations(".toggle", sheet)).toContain("box-shadow: inset 0 0 0 1px var(--bb-muted)");
    expect(declarations(".det-switch[aria-checked=\"true\"] .toggle", sheet)).toContain("box-shadow: none");
  });
});
