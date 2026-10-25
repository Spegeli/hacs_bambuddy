// The smart plugs BamBuddy links to a printer (2026-10-18): the block
// "Power" in the Status tab, switching with a question before every off,
// our switch-off after the print, the offline view with the printer's plug
// off, and the optional chip.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { findPrinter } from "../src/discovery";
import { configForm } from "../src/forms";

import { h2d, makeHass, mountCard, offlineP1s, plugDevice, unreachable, x1c, type FakeCard, type FakeDevice, type FakeHass, type PlugSpec, type PrinterSpec } from "./fixtures";
import { atRule, find, findAll, NBSP, styleText, text, update } from "./helpers";

const NOW = new Date("2026-10-18T14:10:00Z");

interface Mounted {
  card: FakeCard;
  hass: FakeHass;
}

async function mount(devices: FakeDevice[], printer: string, config: Record<string, unknown> = {}, language = "en"): Promise<Mounted> {
  const hass = makeHass({ devices, language });
  const card = await mountCard(hass, { printer, ...config });
  return { card, hass };
}

/** The X1C -- printing, unless its overrides say otherwise -- and
 * the plugs given (the printer's own, by default). */
function x1cWith(printer: Partial<PrinterSpec> = {}, ...plugs: Omit<PlugSpec, "printer">[]): FakeDevice[] {
  const devices = x1c(printer);
  const device = devices[0] as FakeDevice;
  const specs = plugs.length ? plugs : [{ id: 3, name: "Tasmota – FA3F19", watts: 182.4, today: 1.27 }];
  return [...devices, ...specs.map((spec) => plugDevice({ printer: device, ...spec }))];
}

const IDLE: Partial<PrinterSpec> = { status: "idle", stage: "idle", progress: 0, nozzles: [[30, 0]] };
const ACCESSORY = { id: 4, name: "Shelly – Abluftfilter", powersPrinter: false, watts: 12 };
const PLUG = "switch.dev-x1c_plug_3";

const rows = (card: FakeCard): string[] => findAll(card, ".power .p-row:not(.p-auto)").map((row) => text(row));
const sub = (card: FakeCard, index = 0): string => text(findAll(card, ".power .p-row:not(.p-auto) .p-sub")[index]);
const toggle = (card: FakeCard, index = 0): HTMLButtonElement => findAll<HTMLButtonElement>(card, ".power .p-row:not(.p-auto) [role=switch]")[index] as HTMLButtonElement;
const dialogTitle = (card: FakeCard): string => text(find(card, "dialog h2"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("finding a printer's plugs", () => {
  it("finds them under the printer, by name, named without the printer", () => {
    const hass = makeHass({ devices: x1cWith({}, { id: 3, name: "Tasmota – FA3F19" }, ACCESSORY) });
    const refs = findPrinter(hass, "dev-x1c");

    expect(refs?.plugs.map((plug) => [plug.name, plug.switchable])).toEqual([
      ["Shelly – Abluftfilter", true],
      ["Tasmota – FA3F19", true],
    ]);
    expect(refs?.plugs[1]?.autoOff).toBeUndefined();
    // "(Smart Plug)" goes, brackets of the plug's own name stay.
    const own = findPrinter(makeHass({ devices: x1cWith({}, { id: 3, name: "Lüfter (Keller)" }) }), "dev-x1c");
    expect(own?.plugs.map((plug) => plug.name)).toEqual(["Lüfter (Keller)"]);
    expect(refs?.watched).toContain(PLUG);
  });
});

describe("the block Power", () => {
  it("sits right under the print controls, one row per plug", async () => {
    const { card } = await mount(x1cWith({}, { id: 3, name: "Tasmota – FA3F19", watts: 182.4, today: 1.27 }, ACCESSORY), "dev-x1c");
    const parts = findAll(card, ".body > *").map((element) => element.classList[0]);

    expect(parts.slice(0, 3)).toEqual(["job", "controls", "power"]);
    expect(rows(card)).toEqual([`Tasmota – FA3F19 Printer On · 182${NBSP}W · today 1.27${NBSP}kWh`, `Shelly – Abluftfilter On · 12${NBSP}W`]);
  });

  it("puts the printer's plug first once it says so, also when it did not at first", async () => {
    // Right after a restart a plug's state may come without its attributes.
    const hass = makeHass({ devices: x1cWith({}, ACCESSORY, { id: 3, name: "Tasmota – FA3F19" }) });
    const attributes = hass.states[PLUG]?.attributes ?? {};
    const early = hass.withState(PLUG, "unavailable", {});
    const card = await mountCard(early, { printer: "dev-x1c" });
    await update(card, early.withState(PLUG, "on", attributes));

    expect(rows(card).map((row) => row.split(" ")[0])).toEqual(["Tasmota", "Shelly"]);
  });

  it("names the printer's own plug, also when it is the only one", async () => {
    const { card } = await mount(x1cWith(), "dev-x1c");
    expect(rows(card)).toEqual([`Tasmota – FA3F19 Printer On · 182${NBSP}W · today 1.27${NBSP}kWh`]);
    // One that only measures has no switch-off under it: the name says it all the same.
    const meter = await mount(x1cWith({}, { id: 7, name: "MQTT meter", kind: "state", watts: 150 }), "dev-x1c");
    expect(rows(meter.card)).toEqual([`MQTT meter Printer On · 150${NBSP}W Display only: BamBuddy cannot switch this plug.`]);
    // An accessory alone is not the printer's.
    const accessory = await mount(x1cWith({}, ACCESSORY), "dev-x1c");
    expect(rows(accessory.card)).toEqual([`Shelly – Abluftfilter On · 12${NBSP}W`]);
  });

  it("shows only the figures a plug reports, from 1000 W in kW", async () => {
    const { card } = await mount(x1cWith({}, { id: 3, name: "Garage", state: "off" }, { ...ACCESSORY, watts: 1234 }), "dev-x1c");
    expect(sub(card, 0)).toBe("Off");
    expect(sub(card, 1)).toBe(`On · 1.2${NBSP}kW`);
    const german = await mount(x1cWith({}, { ...ACCESSORY, watts: 1234 }), "dev-x1c", {}, "de");
    expect(sub(german.card)).toBe(`An · 1,2${NBSP}kW`);
  });

  it("always shows the printer's own plug, and leaves out another BamBuddy does not show on the printer card", async () => {
    // BamBuddy's "show on the printer card" (Home Assistant plugs only) hides
    // accessories and a second plug that powers the printer, never its own.
    const own = await mount(
      x1cWith({}, { id: 3, name: "Tasmota", onCard: false, main: true }, { id: 5, name: "Second", onCard: false, main: false }, { ...ACCESSORY, onCard: false }),
      "dev-x1c",
      { status_blocks: ["power"] },
    );
    expect(rows(own.card).map((row) => row.split(" ")[0])).toEqual(["Tasmota"]);
    expect(own.card.getCardSize()).toBeGreaterThan(4);
    // Without the integration's choice (right after a restart): the first that powers the printer.
    const early = await mount(x1cWith({}, { id: 3, name: "Tasmota", onCard: false }, { id: 5, name: "Workshop", onCard: false }), "dev-x1c");
    expect(rows(early.card).map((row) => row.split(" ")[0])).toEqual(["Tasmota"]);
    const accessory = await mount(x1cWith({}, { ...ACCESSORY, onCard: false }), "dev-x1c", { status_blocks: ["power"] });
    expect(find(accessory.card, ".power")).toBeNull();
    expect(accessory.card.getCardSize()).toBe(4);
    const none = await mount(x1c(), "dev-x1c");
    expect(find(none.card, ".power")).toBeNull();
  });

  it("switches on without asking", async () => {
    const { card, hass } = await mount(x1cWith(IDLE, { id: 3, name: "Tasmota – FA3F19", state: "off" }), "dev-x1c");
    toggle(card).click();
    await card.updateComplete;

    expect(hass.calls.at(-1)).toMatchObject({ domain: "switch", service: "turn_on", data: { entity_id: PLUG } });
    expect(find(card, "dialog")).toBeNull();
  });

  it("asks before the printer's plug goes off, and says what follows", async () => {
    const { card, hass } = await mount(x1cWith(IDLE), "dev-x1c");
    toggle(card).click();
    await card.updateComplete;

    expect(dialogTitle(card)).toBe("Switch the printer off?");
    expect(text(find(card, "dialog p"))).toContain("“Tasmota – FA3F19” cuts the power");
    (find(card, "dialog .btn.primary, dialog .btn.danger") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(hass.calls.at(-1)).toMatchObject({ domain: "switch", service: "turn_off", data: { entity_id: PLUG } });
  });

  it("asks before an accessory goes off too", async () => {
    const { card } = await mount(x1cWith(IDLE, { id: 3, name: "Tasmota – FA3F19" }, ACCESSORY), "dev-x1c");
    toggle(card, 1).click();
    await card.updateComplete;

    expect(dialogTitle(card)).toBe("Switch “Shelly – Abluftfilter” off?");
  });

  it("warns in red during a print: off ends it", async () => {
    const { card } = await mount(x1cWith(), "dev-x1c");
    toggle(card).click();
    await card.updateComplete;

    expect(dialogTitle(card)).toBe("Cancel the print and switch off?");
    expect(text(find(card, "dialog p"))).toContain("“Benchy_0.2mm_PLA” is at 62");
    expect(find(card, "dialog .btn.danger")).not.toBeNull();
    expect(text(find(card, "dialog .btn.safe"))).toBe("Keep it on");
  });

  it("names the hot nozzle of two", async () => {
    const devices = h2d({ status: "idle", stage: "idle", progress: 0, nozzles: [[26, 0], [61, 0]], hms: [] });
    const plug = plugDevice({ printer: devices[0] as FakeDevice, id: 3, name: "Tasmota – FA3F19", watts: 9 });
    const { card } = await mount([...devices, plug], "dev-h2d");
    toggle(card).click();
    await card.updateComplete;

    expect(text(find(card, "dialog .dlg-note"))).toBe(`The right nozzle is still at 61${NBSP}°C: without power, its fan stops too.`);
  });

  it("notes a hot nozzle", async () => {
    const { card } = await mount(x1cWith({ ...IDLE, nozzles: [[180, 0]] }), "dev-x1c");
    toggle(card).click();
    await card.updateComplete;

    expect(text(find(card, "dialog .dlg-note"))).toContain(`180${NBSP}°C`);
  });

  it("says when BamBuddy cannot reach a plug, and offers nothing then", async () => {
    const { card } = await mount(x1cWith({}, { id: 3, name: "Tasmota – FA3F19", state: "unavailable", watts: 0 }), "dev-x1c");

    expect(sub(card)).toBe("Not reachable: BamBuddy gets no answer from the plug.");
    expect(findAll(card, ".power [role=switch]")).toHaveLength(0);
  });

  it("offers off and on where the plug does not report its state", async () => {
    const { card } = await mount(x1cWith(IDLE, { id: 3, name: "REST", state: "unknown" }), "dev-x1c");

    expect(findAll(card, ".power .p-set button").map(text)).toEqual(["Turn off", "Turn on"]);
  });

  it("runs a script, and shows a plug BamBuddy only watches", async () => {
    const { card, hass } = await mount(
      x1cWith({}, { id: 6, name: "Licht an", kind: "script", powersPrinter: false }, { id: 7, name: "MQTT meter", kind: "state", powersPrinter: false, watts: 150 }),
      "dev-x1c",
    );
    expect(rows(card)).toEqual(["Licht an Script in Home Assistant Run", `MQTT meter On · 150${NBSP}W Display only: BamBuddy cannot switch this plug.`]);
    expect(find(card, ".power .btn")?.getAttribute("aria-label")).toBe("Run “Licht an”");

    (findAll<HTMLButtonElement>(card, ".power .btn").find((item) => text(item) === "Run") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(hass.calls.at(-1)).toMatchObject({ domain: "button", service: "press", data: { entity_id: "button.dev-x1c_plug_6_run" } });
  });

  it("leaves the switch-off out while the plug cannot be reached, unless it is on", async () => {
    // Nothing to switch, nothing to set -- but one that is on says it waits for the plug.
    const away = await mount(x1cWith(IDLE, { id: 3, name: "T", state: "unavailable", autoOff: { armed: false } }), "dev-x1c");
    expect(find(away.card, ".power .p-auto")).toBeNull();
    const waiting = await mount(
      x1cWith({ ...IDLE, status: "finished" }, { id: 3, name: "T", state: "unavailable", autoOff: { armed: true, phase: "waiting", waitingFor: "plug" } }),
      "dev-x1c",
    );
    expect(text(find(waiting.card, ".power .p-auto"))).toContain("Waits until the plug answers.");
  });

  it("shows only states with Hide controls", async () => {
    const { card } = await mount(x1cWith({}, { id: 3, name: "Tasmota – FA3F19", autoOff: { armed: true, everyPrint: true } }), "dev-x1c", { read_only: true });

    expect(findAll(card, ".power button")).toHaveLength(0);
    // Its line says it: no "On" beside it to read as the printer's state.
    expect(text(find(card, ".power .p-auto"))).toBe(`Switch off after the print After every print, once the nozzle is below 50${NBSP}°C.`);
    expect(find(card, ".power .p-auto .det-state")).toBeNull();
  });
});

describe("switching off after the print", () => {
  const armed = (autoOff: PlugSpec["autoOff"], printer: Partial<PrinterSpec> = IDLE): FakeDevice[] =>
    x1cWith(printer, { id: 3, name: "Tasmota – FA3F19", watts: 6, autoOff });
  const autoRow = (card: FakeCard): string => text(find(card, ".power .p-auto"));

  it("says when it will switch off", async () => {
    const every = await mount(armed({ armed: true, everyPrint: true }), "dev-x1c");
    expect(autoRow(every.card)).toBe(`Switch off after the print After every print, once the nozzle is below 50${NBSP}°C.`);
    const next = await mount(armed({ armed: true, temperature: 45 }), "dev-x1c");
    expect(autoRow(next.card)).toBe(`Switch off after the print After the next print, once the nozzle is below 45${NBSP}°C.`);
    const off = await mount(armed({ armed: false }), "dev-x1c");
    expect(autoRow(off.card)).toBe("Switch off after the print The printer stays on after the print.");
  });

  it("shows the wait, with the nozzle now, and lets this print go", async () => {
    const { card, hass } = await mount(armed({ armed: true, phase: "waiting", since: "2026-10-18T14:05:00+00:00" }, { ...IDLE, status: "finished", nozzles: [[142, 0]] }), "dev-x1c");

    expect(autoRow(card)).toContain("Waiting to switch off");
    expect(autoRow(card)).toContain(`now 142${NBSP}°C`);
    (findAll<HTMLButtonElement>(card, ".power .p-skip .btn").find((item) => text(item) === "Don't switch off this time") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(hass.calls.at(-1)).toMatchObject({ domain: "button", service: "press", data: { entity_id: "button.dev-x1c_plug_3_auto_off_skip" } });
  });

  it("tells a failed print, a wait given up, and BamBuddy's own auto off", async () => {
    const failed = await mount(armed({ armed: true, everyPrint: true, phase: "failed_print" }), "dev-x1c");
    expect(autoRow(failed.card)).toContain("Print stopped or failed – the printer stays on this time.");
    const gave = await mount(armed({ armed: true, phase: "gave_up" }), "dev-x1c");
    expect(autoRow(gave.card)).toContain("Not switched off:");
    const bambuddy = await mount(
      x1cWith(IDLE, { id: 3, name: "Tasmota – FA3F19", bambuddyAutoOff: true, autoOff: { armed: false } }),
      "dev-x1c",
    );
    expect(autoRow(bambuddy.card)).toContain("BamBuddy already switches this plug off after the print (Auto Off). To set it here instead, turn Auto Off off in BamBuddy.");
    expect(find(bambuddy.card, ".power .p-auto [role=switch]")).toBeNull();
    // A view-only card sets nothing: no "set it here".
    const view = await mount(
      x1cWith(IDLE, { id: 3, name: "Tasmota – FA3F19", bambuddyAutoOff: true, autoOff: { armed: false } }),
      "dev-x1c",
      { read_only: true },
    );
    expect(autoRow(view.card)).toContain("BamBuddy already switches this plug off after the print (Auto Off).");
    expect(autoRow(view.card)).not.toContain("To set it here");
  });

  it("is a toggle, and its settings open from its text", async () => {
    const { card, hass } = await mount(armed({ armed: false }), "dev-x1c");
    (find(card, ".power .p-auto [role=switch]") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(hass.calls.at(-1)).toMatchObject({ domain: "switch", service: "turn_on", data: { entity_id: "switch.dev-x1c_plug_3_auto_off" } });

    (find(card, ".power .p-auto .p-open") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(dialogTitle(card)).toBe("Switch off after the print");
    expect(text(find(card, "dialog .stepper .step-value"))).toBe(`50${NBSP}°C`);
    const choices = findAll<HTMLButtonElement>(card, "dialog [role=radio]");
    // The one-shot first, and the default.
    expect(choices.map((item) => [text(item), item.getAttribute("aria-checked")])).toEqual([
      ["Only after the next print", "true"],
      ["After every print", "false"],
    ]);
    choices[1]?.click();
    await card.updateComplete;
    expect(hass.calls.at(-1)).toMatchObject({ domain: "switch", service: "turn_on", data: { entity_id: "switch.dev-x1c_plug_3_auto_off_every_print" } });
  });

  it("can be left out of the card", async () => {
    const { card } = await mount(armed({ armed: true }), "dev-x1c", { show_auto_off: false });
    expect(find(card, ".power .p-auto")).toBeNull();
    expect(find(card, ".power")).not.toBeNull();
  });
});

describe("a printer whose plug is off", () => {
  const off = (plug: Omit<PlugSpec, "printer" | "id" | "name">): FakeDevice[] => {
    const devices = offlineP1s();
    return [...devices, plugDevice({ printer: devices[0] as FakeDevice, id: 5, name: "Steckdose Garage", ...plug })];
  };

  it("says so and switches it on, instead of checking the connection", async () => {
    const { card, hass } = await mount(off({ state: "off", watts: 0 }), "dev-p1s");

    expect(text(find(card, ".job-info"))).toBe("The printer is off: its plug “Steckdose Garage” is switched off.");
    const buttons = findAll<HTMLButtonElement>(card, ".offline-actions .btn").map(text);
    expect(buttons).toEqual(["Switch the printer on"]);
    findAll<HTMLButtonElement>(card, ".offline-actions .btn")[0]?.click();
    await card.updateComplete;
    expect(hass.calls.at(-1)).toMatchObject({ domain: "switch", service: "turn_on", data: { entity_id: "switch.dev-p1s_plug_5" } });
  });

  it("says when our switch-off turned it off", async () => {
    const { card } = await mount(off({ state: "off", autoOff: { armed: true, phase: "done", since: "2026-10-18T12:07:00+00:00" } }), "dev-p1s");
    expect(text(find(card, ".job-info"))).toContain("Switched off after the print at 14:07.");
  });

  it("counts while the printer starts", async () => {
    const { card } = await mount(off({ state: "on", watts: 14, onSince: "2026-10-18T14:09:18Z" }), "dev-p1s");

    expect(text(find(card, ".job-info"))).toContain("Printer starting … 0:42");
    expect(text(find(card, ".job-info"))).toContain(`Plug on · 14${NBSP}W`);
  });

  it("tells what is wrong when it does not come back", async () => {
    const drawing = await mount(off({ state: "on", watts: 6, onSince: "2026-10-18T13:00:00Z" }), "dev-p1s");
    expect(text(find(drawing.card, ".job-info"))).toContain(`The plug delivers power (6${NBSP}W), but BamBuddy cannot reach the printer.`);
    // Off and on again: the plug off, after its question.
    expect(findAll(drawing.card, ".offline-actions .btn").map(text)).toEqual(["Check connection", "Switch the plug off"]);
    findAll<HTMLButtonElement>(drawing.card, ".offline-actions .btn")[1]?.click();
    await drawing.card.updateComplete;
    expect(dialogTitle(drawing.card)).toBe("Switch the printer off?");
    const zero = await mount(off({ state: "on", watts: 0, lastChanged: "2026-10-18T13:00:00Z" }), "dev-p1s");
    expect(text(find(zero.card, ".job-info"))).toContain("The plug shows 0 W: is the printer's own power switch off?");
  });
});

describe("the chip Power", () => {
  const chip = (card: FakeCard): string => text(find(card, ".pills .pill.power-chip"));

  it("shows the power, off, a wait and an unreachable plug", async () => {
    expect(chip((await mount(x1cWith(), "dev-x1c", { header_chips: ["power"] })).card)).toBe(`182${NBSP}W`);
    expect(chip((await mount(x1cWith({}, { id: 3, name: "T", state: "off" }), "dev-x1c", { header_chips: ["power"] })).card)).toBe("Power off");
    expect(
      chip((await mount(x1cWith(IDLE, { id: 3, name: "T", watts: 6, autoOff: { armed: true, phase: "waiting" } }), "dev-x1c", { header_chips: ["power"] })).card),
    ).toBe("Waiting to switch off");
    expect(chip((await mount(x1cWith({}, { id: 3, name: "T", state: "unavailable" }), "dev-x1c", { header_chips: ["power"] })).card)).toBe("Plug unreachable");
  });

  it("blames no plug while BamBuddy does not answer", async () => {
    const { card } = await mount(unreachable(x1cWith()), "dev-x1c", { header_chips: ["power"] });
    expect(chip(card)).toBe("Power unknown");
    const pill = find(card, ".pills .pill.power-chip") as HTMLButtonElement;
    expect(pill.getAttribute("aria-label")).toBe("Power unknown – No data from BamBuddy");
    expect(pill.getAttribute("aria-haspopup")).toBe("dialog");
    expect(pill.classList.contains("tone-neutral")).toBe(true);
    pill.click();
    await card.updateComplete;
    const row = find(card, "dialog .p-row") as HTMLElement;
    expect(text(row.querySelector(".p-sub"))).toBe("No data from BamBuddy");
    expect(row.classList.contains("warn")).toBe(false);
  });

  it("names an accessory plug on the chip: its draw is not the printer's", async () => {
    expect(chip((await mount(x1cWith({}, ACCESSORY), "dev-x1c", { header_chips: ["power"] })).card)).toBe(`Shelly – Abluftfilter · 12${NBSP}W`);
    expect(chip((await mount(x1cWith({}, { ...ACCESSORY, state: "off" }), "dev-x1c", { header_chips: ["power"] })).card)).toBe("Shelly – Abluftfilter: Off");
  });

  it("is laid out as a chip, not as the Power block", async () => {
    // The block's class lays its children out in a column: the chip's icon
    // stood above its text.
    const { card } = await mount(x1cWith(), "dev-x1c", { header_chips: ["power"] });
    expect(find(card, ".pills .pill.power-chip")).not.toBeNull();
    expect(findAll(card, ".power").map((element) => element.tagName)).toEqual(["SECTION"]);
  });

  it("opens the plugs in a dialog", async () => {
    const { card } = await mount(x1cWith(), "dev-x1c", { header_chips: ["power"] });
    (find(card, ".pills .pill.power-chip") as HTMLButtonElement).click();
    await card.updateComplete;

    expect(dialogTitle(card)).toBe("Power");
    expect(findAll(card, "dialog .p-row").map((row) => text(row))[0]).toContain("Tasmota – FA3F19");
  });
});

describe("the editor", () => {
  it("offers the block, the chip and the auto-off row", () => {
    const form = configForm();
    const names = JSON.stringify(form.schema);

    expect(names).toContain('"value":"power"');
    expect(names).toContain('"name":"show_auto_off"');
    // Each toggle's text says what it does.
    expect(form.computeLabel({ name: "show_auto_off" })).toBe("“Switch off after the print” row");
    expect(form.computeHelper({ name: "show_auto_off" })).toBe(
      "Shows or hides the row under the printer's plug in the Power section and the Power chip's dialog. In it you choose whether the printer switches itself off after the print. With the row hidden, it still switches off if set to.",
    );
    expect(form.computeHelper({ name: "status_blocks" })).toContain("Power only when BamBuddy links a plug to the printer.");
  });
});


describe("a plug's state and the switch-off's row", () => {
  it("says Unknown where a plug does not report its state, in its row and its chip", async () => {
    const { card } = await mount(x1cWith({}, { id: 7, name: "MQTT meter", kind: "state", state: "unknown", watts: 150 }), "dev-x1c", { header_chips: ["power"] });
    expect(sub(card)).toContain(`Unknown · 150${NBSP}W`);
    expect(text(find(card, ".pills .pill.power-chip"))).toBe("Power unknown");
  });

  it("does not read the chip's watts out with every change", async () => {
    const { card } = await mount(x1cWith(), "dev-x1c", { header_chips: ["power"] });
    expect(find(card, ".pills .pill.power-chip")?.getAttribute("aria-live")).toBe("off");
  });

  it("counts only after the integration saw the plug go on, not after any change", async () => {
    const devices = offlineP1s();
    const plug = plugDevice({ printer: devices[0] as FakeDevice, id: 5, name: "Steckdose Garage", state: "on", watts: 6, lastChanged: "2026-10-18T14:09:18Z" });
    const { card } = await mount([...devices, plug], "dev-p1s");
    expect(text(find(card, ".job-info"))).not.toContain("Printer starting");
  });

  it("says what a wait waits for, and when it switches", async () => {
    const waitingFor = async (why: string): Promise<string> => {
      const { card } = await mount(
        x1cWith({ ...IDLE, status: "finished" }, { id: 3, name: "Tasmota – FA3F19", watts: 6, autoOff: { armed: true, phase: "waiting", waitingFor: why } }),
        "dev-x1c",
      );
      return text(find(card, ".power .p-auto"));
    };
    expect(await waitingFor("drying")).toContain("Waits until the AMS has finished drying.");
    expect(await waitingFor("filament")).toContain("Waits until the AMS has changed the filament.");
    expect(await waitingFor("heating")).toContain("Waits: a target temperature is set on the printer.");
    expect(await waitingFor("printer")).toContain("Waits until BamBuddy reaches the printer again.");
    expect(await waitingFor("plug")).toContain("Waits until the plug answers.");
    const { card } = await mount(
      x1cWith({ ...IDLE, status: "finished" }, { id: 3, name: "Tasmota – FA3F19", watts: 6, autoOff: { armed: true, phase: "waiting", switching: true } }),
      "dev-x1c",
    );
    expect(text(find(card, ".power .p-auto"))).toContain("Switching off …");
    expect(find(card, ".power .p-skip")).toBeNull();
  });

  it("opens the settings as a dialog", async () => {
    const { card } = await mount(x1cWith(IDLE, { id: 3, name: "Tasmota – FA3F19", watts: 6, autoOff: { armed: true } }), "dev-x1c");
    expect(find(card, ".power .p-open")?.getAttribute("aria-haspopup")).toBe("dialog");
  });
});

describe("the plug's questions and its chip", () => {
  const offline = (plug: Omit<PlugSpec, "printer" | "id" | "name">): FakeDevice[] => {
    const devices = offlineP1s();
    return [...devices, plugDevice({ printer: devices[0] as FakeDevice, id: 5, name: "Steckdose Garage", onSince: "2026-10-18T13:00:00Z", ...plug })];
  };
  const askOffline = async (plug: Omit<PlugSpec, "printer" | "id" | "name">): Promise<FakeCard> => {
    const { card } = await mount(offline(plug), "dev-p1s");
    (findAll<HTMLButtonElement>(card, ".offline-actions .btn").find((item) => text(item) === "Switch the plug off") as HTMLButtonElement).click();
    await card.updateComplete;
    return card;
  };

  it("asks in red before an offline printer drawing print power goes off: BamBuddy cannot tell whether it prints", async () => {
    const printing = await askOffline({ state: "on", watts: 182 });
    expect(text(find(printing, "dialog p"))).toBe(
      `BamBuddy cannot reach the printer and does not know whether it is printing. The plug delivers 182${NBSP}W – a running print would stop without power.`,
    );
    expect(find(printing, "dialog .btn.danger")).not.toBeNull();
    const idle = await askOffline({ state: "on", watts: 8 });
    expect(find(idle, "dialog .btn.danger")).toBeNull();
    expect(text(find(idle, "dialog p"))).toBe(
      `BamBuddy cannot reach the printer. The plug delivers 8${NBSP}W – about what an idle printer draws, so it is most likely not printing.`,
    );
    const unknown = await askOffline({ state: "on" });
    expect(text(find(unknown, "dialog p"))).toBe("BamBuddy cannot reach the printer and does not know whether it is printing. A running print would stop without power.");
    expect(find(unknown, "dialog .btn.danger")).not.toBeNull();
  });

  it("keeps a plug on with “Keep it on”, an accessory too", async () => {
    const { card } = await mount(x1cWith(IDLE, { id: 3, name: "Tasmota – FA3F19" }, ACCESSORY), "dev-x1c");
    toggle(card, 1).click();
    await card.updateComplete;
    expect(text(find(card, "dialog .btn.safe"))).toBe("Keep it on");
    expect(text(find(card, "dialog p"))).toBe("Everything plugged into it loses power.");
  });

  it("warns with the warning sign, and has the question read out whole", async () => {
    const { card } = await mount(x1cWith(), "dev-x1c");
    toggle(card).click();
    await card.updateComplete;
    const dialog = find(card, "dialog") as HTMLElement;
    expect(find(card, "dialog .dlg-note")?.classList.contains("warning")).toBe(true);
    expect(dialog.getAttribute("aria-describedby")).toBe("dlg-text dlg-note");
    expect(dialog.getAttribute("role")).toBe("alertdialog");
    const hot = await mount(x1cWith({ ...IDLE, nozzles: [[180, 0]] }), "dev-x1c");
    toggle(hot.card).click();
    await hot.card.updateComplete;
    expect(find(hot.card, "dialog .dlg-note")?.classList.contains("warning")).toBe(true);
    expect(find(hot.card, "dialog")?.getAttribute("role")).toBeNull();
  });

  it("names the chip for a screen reader, says Power on without figures, and is grey while the printer is offline", async () => {
    const chipOf = (card: FakeCard): HTMLElement => find(card, ".pills .pill.power-chip") as HTMLElement;
    const watts = await mount(x1cWith(), "dev-x1c", { header_chips: ["power"] });
    expect(chipOf(watts.card).getAttribute("aria-label")).toBe(`182${NBSP}W – plug “Tasmota – FA3F19”`);
    const bare = await mount(x1cWith({}, { id: 3, name: "Kids room", today: undefined }), "dev-x1c", { header_chips: ["power"] });
    expect(text(chipOf(bare.card))).toBe("Power on");
    const unknown = await mount(x1cWith({}, { id: 7, name: "MQTT", kind: "state", state: "unknown" }), "dev-x1c", { header_chips: ["power"] });
    expect(text(chipOf(unknown.card))).toBe("Power unknown");
    const away = await mount(offline({ state: "on", watts: 182 }), "dev-p1s", { header_chips: ["power"] });
    expect(chipOf(away.card).classList.contains("tone-neutral")).toBe(true);
    const script = await mount(x1cWith({}, { id: 6, name: "Licht an", kind: "script", powersPrinter: false }), "dev-x1c", { header_chips: ["power"] });
    expect(find(script.card, ".pills .pill.power-chip")).toBeNull();
  });

  it("goes back to the chip's dialog after a question asked from it", async () => {
    const { card, hass } = await mount(x1cWith(IDLE), "dev-x1c", { header_chips: ["power"] });
    (find(card, ".pills .pill.power-chip") as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, "dialog .p-row [role=switch]") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(dialogTitle(card)).toBe("Switch the printer off?");

    // Escape in the question: back, the dialog stays open.
    const escape = new Event("cancel", { cancelable: true });
    find(card, "dialog")?.dispatchEvent(escape);
    await card.updateComplete;
    expect(escape.defaultPrevented).toBe(true);
    expect(dialogTitle(card)).toBe("Power");

    (find(card, "dialog .p-row [role=switch]") as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, "dialog .btn.safe") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(dialogTitle(card)).toBe("Power");

    (find(card, "dialog .p-row [role=switch]") as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, "dialog .btn.primary") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(hass.calls.at(-1)).toMatchObject({ domain: "switch", service: "turn_off", data: { entity_id: PLUG } });
    expect(dialogTitle(card)).toBe("Power");
  });

  it("says a stopped print too, and drops “this time” where the next print was the one", async () => {
    const every = await mount(x1cWith(IDLE, { id: 3, name: "T", watts: 6, autoOff: { armed: true, everyPrint: true, phase: "failed_print" } }), "dev-x1c");
    expect(text(find(every.card, ".power .p-auto"))).toContain("Print stopped or failed – the printer stays on this time.");
    const next = await mount(x1cWith(IDLE, { id: 3, name: "T", watts: 6, autoOff: { armed: false, everyPrint: false, phase: "failed_print" } }), "dev-x1c");
    expect(text(find(next.card, ".power .p-auto"))).toContain("Print stopped or failed – the printer stays on.");
  });

  it("names the printer when this print is let go", async () => {
    const { card } = await mount(x1cWith(IDLE, { id: 3, name: "T", watts: 6, autoOff: { armed: true, everyPrint: true, phase: "skipped" } }), "dev-x1c");
    expect(text(find(card, ".power .p-auto"))).toContain("The printer stays on this time; it switches off again after the next print.");
  });

  it("shows a chevron where the settings open", async () => {
    const { card } = await mount(x1cWith(IDLE, { id: 3, name: "T", watts: 6, autoOff: { armed: true } }), "dev-x1c");
    expect(find(card, ".power .p-open .p-chevron")).not.toBeNull();
  });

  it("lets the offline actions wrap, a long label too, Run go under its name on a narrow card, and the model line wrap", () => {
    const css = styleText();
    expect(/\.offline-actions\s*\{[^}]*flex-wrap:\s*wrap[^}]*gap:\s*8px/.exec(css)).not.toBeNull();
    expect(/\.offline-actions \.btn\s*\{[^}]*white-space:\s*normal/.exec(css)).not.toBeNull();
    // Under 280 px every plug row wraps: its switch or Run under the text.
    expect(atRule("@container (max-width: 280px)")).toMatch(/(^|[}\s])\.p-row\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(/\.p-skip \.btn,\s*\.p-set \.btn\s*\{[^}]*white-space:\s*normal/.exec(css)).not.toBeNull();
    expect(/\.model\s*\{[^}]*\}/.exec(css)?.[0]).not.toContain("ellipsis");
  });
});
