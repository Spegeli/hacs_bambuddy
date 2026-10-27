// Heating and ventilating the chamber in the Control tab: the ventilation
// fan stepped as a heater is, the power symbol as a switch, „Lüften“ beside
// „Heizen“ with the locks between them, the P2S's keep-warm row.
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { findPrinter } from "../src/discovery";
import { ICONS } from "../src/icons";
import { button, find, findAll, NBSP, styleText } from "./helpers";
import { h2d, makeHass, mountCard, x1c, type FakeCard, type FakeHass } from "./fixtures";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

type Stepper = { stepTarget: (entityId: string, value: number) => void; targetOf: (entityId: string) => number | undefined };
const internals = (card: FakeCard): Stepper => card as unknown as Stepper;
const VENT = "fan.h2d_ventilation";
const sent = (hass: FakeHass): unknown[] => hass.calls.filter((call) => call.domain === "fan").map((call) => [call.service, call.data]);

async function ventCard(percent: number, fans = ["exhaust"]): Promise<{ card: FakeCard; hass: FakeHass }> {
  const hass = makeHass({ devices: h2d({ status: "idle", stage: "idle", ventilation: { percent, fans } }) });
  const card = await mountCard(hass, { printer: "dev-h2d", start_view: "control" });
  return { card, hass };
}

describe("the card steps a fan as it steps a heater", () => {
  it("finds the ventilation fan", () => {
    const refs = findPrinter(makeHass({ devices: h2d({ ventilation: { percent: 0, fans: ["exhaust"] } }) }), "dev-h2d");
    expect(refs?.ventilation).toBe(VENT);
    expect(findPrinter(makeHass({ devices: h2d() }), "dev-h2d")?.ventilation).toBeUndefined();
  });

  it("reads a fan that is off as 0", async () => {
    const { card } = await ventCard(0);
    expect(internals(card).targetOf(VENT)).toBe(0);
  });

  it("steps a fan's percentage and sends it once the taps stop", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { card, hass } = await ventCard(60);
    internals(card).stepTarget(VENT, 70);
    internals(card).stepTarget(VENT, 80);
    expect(internals(card).targetOf(VENT)).toBe(80);
    expect(sent(hass)).toEqual([]);
    await vi.advanceTimersByTimeAsync(900);
    expect(sent(hass)).toEqual([["set_percentage", { entity_id: VENT, percentage: 80 }]]);
  });

  it("lets the printer's report replace a fan's draft at once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { card, hass } = await ventCard(60);
    internals(card).stepTarget(VENT, 70);
    await vi.advanceTimersByTimeAsync(900);
    // The fan stays "on": its percentage tells the report.
    card.hass = hass.withState(VENT, "on", { percentage: 70, fans: ["exhaust"] });
    await card.updateComplete;
    card.hass = (card.hass as FakeHass).withState(VENT, "on", { percentage: 60, fans: ["exhaust"] });
    await card.updateComplete;
    expect(internals(card).targetOf(VENT)).toBe(60);
  });
});

const setValue = (entityId: string, value: number): unknown => ({ domain: "number", service: "set_value", data: { entity_id: entityId, value }, notifyOnError: false });

describe("the power symbol is a switch, and its place stays", () => {
  it("switches a heater on from its power symbol with the start of +", async () => {
    const hass = makeHass({ devices: x1c({ status: "idle", stage: "idle", nozzles: [[27, 0]], bed: [25, 0] }) });
    const card = await mountCard(hass, { printer: "dev-x1c", start_view: "control" });
    const powers = findAll<HTMLButtonElement>(card, ".heat-row .heat-off");
    expect(powers.map((item) => item.getAttribute("aria-label"))).toEqual([`Nozzle: heat to 220${NBSP}°C`, `Bed: heat to 55${NBSP}°C`]);
    expect(powers.every((item) => !item.disabled)).toBe(true);
    powers[1]?.click();
    await card.updateComplete;
    expect(hass.calls).toEqual([setValue("number.x1c_bed_target_temperature", 55)]);
  });

  it("colours the power symbol by state", async () => {
    const hass = makeHass({ devices: x1c({ status: "idle", stage: "idle", nozzles: [[200, 220]], bed: [25, 0] }) });
    const card = await mountCard(hass, { printer: "dev-x1c", start_view: "control" });
    const [nozzle, bed] = findAll<HTMLButtonElement>(card, ".heat-row .heat-off");
    expect([nozzle?.classList.contains("on"), nozzle?.classList.contains("tone-heat"), nozzle?.getAttribute("aria-label")]).toEqual([true, true, "Nozzle: turn off"]);
    expect([bed?.classList.contains("on"), bed?.disabled]).toEqual([false, false]);
  });

  it("keeps the place of a power symbol that cannot be used", async () => {
    // Printing: the nozzles and the bed have no off; the chamber has.
    const hass = makeHass({ devices: h2d({ status: "printing", stage: "printing" }) });
    const card = await mountCard(hass, { printer: "dev-h2d", start_view: "control" });
    const rows = findAll(card, ".heat-row");
    expect(rows.map((row) => row.children.length)).toEqual([3, 3, 3, 3]);
    expect(rows.map((row) => (row.querySelector("button.heat-off") ? "power" : row.querySelector(".heat-off-space") ? "space" : "none"))).toEqual(["space", "space", "space", "power"]);
    expect(button(card, "Chamber: turn off").disabled).toBe(false);
  });
});

describe("heating and ventilation in one block", () => {
  type Spec = Parameters<typeof h2d>[0];
  async function block(spec: Spec, options: { language?: string; read_only?: boolean; printer?: "h2d" | "x1c" } = {}): Promise<{ card: FakeCard; hass: FakeHass }> {
    const printer = options.printer ?? "h2d";
    const devices = printer === "h2d" ? h2d({ status: "idle", stage: "idle", ...spec }) : x1c({ status: "idle", stage: "idle", ...spec });
    const hass = makeHass({ devices, ...(options.language ? { language: options.language } : {}) });
    const card = await mountCard(hass, { printer: `dev-${printer}`, start_view: "control", ...(options.read_only ? { read_only: true } : {}) });
    return { card, hass };
  }
  const part = (card: FakeCard): Element | null => card.shadowRoot?.querySelector(".vent-part") ?? null;
  const ventRow = (card: FakeCard): Element | null => part(card)?.querySelector(".heat-row") ?? null;
  const chamberRow = (card: FakeCard): Element | undefined =>
    findAll(card, ".heating > .heat-rows .heat-row").find((row) => row.querySelector(".heat-text")?.textContent === "Kammer");
  const words = (element: Element | null | undefined): string => (element?.textContent ?? "").replace(/\s+/g, " ").trim();
  const notes = (card: FakeCard): string[] => findAll(card, ".heating .note").map((item) => words(item));
  const buttonsOf = (row: Element | null | undefined): HTMLButtonElement[] => [...(row?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
  const H2D_VENT = { airduct: "cooling", chamber: [33, 0] as [number, number], ventilation: { percent: 0, fans: ["exhaust"] } };

  it("1: offers ventilation on an idle H2D with nothing on, from 60 %", async () => {
    const { card, hass } = await block(H2D_VENT, { language: "de" });
    expect(words(part(card)?.querySelector(".section-label"))).toBe("Lüften");
    expect(words(ventRow(card)?.querySelector(".heat-name"))).toBe("Kammer Abluftlüfter");
    expect(words(ventRow(card)?.querySelector(".heat-target"))).toBe("Lüften, Stufe: Aus");
    const [lower, raise, power] = buttonsOf(ventRow(card));
    expect([lower?.disabled, raise?.disabled, power?.disabled, power?.getAttribute("aria-label")]).toEqual([true, false, false, `Mit 60${NBSP}% lüften`]);
    expect(notes(card)).toEqual([]);
    power?.click();
    await card.updateComplete;
    expect(sent(hass)).toEqual([["set_percentage", { entity_id: VENT, percentage: 60 }]]);
  });

  it("starts + at 60 % too", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { card, hass } = await block(H2D_VENT, { language: "de" });
    const raise = buttonsOf(ventRow(card))[1];
    expect(raise?.getAttribute("aria-label")).toBe(`Mit 60${NBSP}% lüften`);
    raise?.click();
    await vi.advanceTimersByTimeAsync(900);
    expect(sent(hass)).toEqual([["set_percentage", { entity_id: VENT, percentage: 60 }]]);
  });

  it("2: locks ventilation while the chamber heats, and says how", async () => {
    const { card } = await block({ ...H2D_VENT, chamber: [39, 50] }, { language: "de" });
    expect(buttonsOf(ventRow(card)).every((item) => item.disabled)).toBe(true);
    expect(ventRow(card)?.querySelector(".heat-off-space")).not.toBeNull();
    expect(notes(card)).toEqual(["Solange die Kammer heizt, lässt sie sich nicht lüften. Schalte zuerst oben unter „Heizen“ die Kammer aus."]);
  });

  it("3: ventilating at 60 % locks the chamber; + steps by 10, and − at 10 % switches it off", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { card, hass } = await block({ ...H2D_VENT, ventilation: { percent: 60, fans: ["exhaust"] } }, { language: "de" });
    // (`words` reads a no-break space as a space.)
    expect(words(ventRow(card)?.querySelector(".heat-target"))).toBe("Lüften, Stufe: 60 %");
    const power = ventRow(card)?.querySelector<HTMLButtonElement>(".heat-off");
    expect([power?.classList.contains("on"), power?.classList.contains("tone-vent"), power?.getAttribute("aria-label")]).toEqual([true, true, "Lüften ausschalten"]);
    expect(chamberRow(card)?.querySelector(".heat-off-space")).not.toBeNull();
    expect(buttonsOf(chamberRow(card)).every((item) => item.disabled)).toBe(true);
    expect(notes(card)).toEqual(["Solange die Kammer gelüftet wird, lässt sie sich nicht heizen. Schalte zuerst unten unter „Lüften“ die Kammer aus."]);
    const raise = buttonsOf(ventRow(card))[1];
    expect(raise?.getAttribute("aria-label")).toBe(`Lüften 10${NBSP}% mehr`);
    raise?.click();
    await vi.advanceTimersByTimeAsync(900);
    expect(sent(hass)).toEqual([["set_percentage", { entity_id: VENT, percentage: 70 }]]);
    const low = await block({ ...H2D_VENT, ventilation: { percent: 10, fans: ["exhaust"] } });
    buttonsOf(ventRow(low.card))[0]?.click();
    await vi.advanceTimersByTimeAsync(900);
    expect(sent(low.hass)).toEqual([["set_percentage", { entity_id: VENT, percentage: 0 }]]);
  });

  it("4: in a cooling print the chamber waits, the ventilation goes, off too", async () => {
    const printing = { ...H2D_VENT, status: "printing", stage: "printing", ventilation: { percent: 30, fans: ["exhaust"] } };
    const { card, hass } = await block(printing, { language: "de" });
    expect(buttonsOf(chamberRow(card)).every((item) => item.disabled)).toBe(true);
    expect(notes(card)).toEqual([
      "Der Drucker druckt im Kühlmodus: Die Kammer lässt sich erst nach dem Druck heizen.",
      "Während des Drucks regelt der Drucker diesen Lüfter auch selbst und kann die Stufe wieder ändern.",
    ]);
    const power = ventRow(card)?.querySelector<HTMLButtonElement>(".heat-off");
    expect(power?.disabled).toBe(false);
    power?.click();
    await card.updateComplete;
    expect(sent(hass)).toEqual([["set_percentage", { entity_id: VENT, percentage: 0 }]]);
    const x2d = await block({ ...printing, ventilation: { percent: 30, fans: ["right_aux", "exhaust"] } }, { language: "de" });
    expect(words(ventRow(x2d.card)?.querySelector(".heat-now"))).toBe("Rechter Zusatzlüfter und Abluftlüfter");
    expect(notes(x2d.card)[1]).toBe("Während des Drucks regelt der Drucker diese Lüfter auch selbst und kann die Stufe wieder ändern.");
  });

  it("5: in a heating print the chamber goes, the ventilation waits", async () => {
    const { card } = await block({ ...H2D_VENT, airduct: "heating", chamber: [44, 45], status: "printing", stage: "printing" }, { language: "de" });
    expect(chamberRow(card)?.querySelector<HTMLButtonElement>(".heat-off")?.disabled).toBe(false);
    expect(buttonsOf(ventRow(card)).every((item) => item.disabled)).toBe(true);
    expect(notes(card)).toEqual(["Der Drucker druckt im Heizmodus: Lüften geht erst nach dem Druck."]);
  });

  const P2S = { airduct: "cooling", ventilation: { percent: 0, fans: ["aux"] } };

  it("6: keeps a P2S's chamber warm under Heating, and ventilates with its auxiliary fan", async () => {
    const { card } = await block(P2S, { language: "de", printer: "x1c" });
    expect(words(find(card, ".keep-warm .heat-name"))).toBe("Kammer Wärme halten");
    expect(findAll(card, ".keep-warm [role=radio]").map((item) => words(item))).toEqual(["Aus", "An"]);
    expect(find(card, ".airduct")).toBeNull();
    expect(words(ventRow(card)?.querySelector(".heat-now"))).toBe("Zusatzlüfter");
    const kit = await block({ ...P2S, ventilation: { percent: 0, fans: ["aux", "exhaust"] } }, { language: "de", printer: "x1c" });
    expect(words(ventRow(kit.card)?.querySelector(".heat-now"))).toBe("Zusatzlüfter und Abluftlüfter");
  });

  it("7: keeping warm locks the P2S's ventilation", async () => {
    const { card } = await block({ ...P2S, airduct: "heating" }, { language: "de", printer: "x1c" });
    expect(buttonsOf(ventRow(card)).every((item) => item.disabled)).toBe(true);
    expect(notes(card)).toEqual(["Solange die Kammer warm gehalten wird, lässt sie sich nicht lüften. Schalte zuerst oben unter „Heizen“ die Kammer aus."]);
  });

  it("8: ventilating locks keeping warm on, not off", async () => {
    const { card } = await block({ ...P2S, ventilation: { percent: 60, fans: ["aux"] } }, { language: "de", printer: "x1c" });
    expect(findAll<HTMLButtonElement>(card, ".keep-warm [role=radio]").map((item) => item.disabled)).toEqual([false, true]);
    expect(notes(card)).toEqual(["Solange die Kammer gelüftet wird, lässt sie sich nicht warm halten. Schalte zuerst unten unter „Lüften“ die Kammer aus."]);
  });

  it("leaves a way off when heating and ventilation are both on", async () => {
    // A target below 40 °C set on the printer leaves it in cooling, where it may run its fan.
    const { card, hass } = await block({ ...H2D_VENT, chamber: [33, 35], ventilation: { percent: 40, fans: ["exhaust"] } }, { language: "de" });
    expect(notes(card)).toHaveLength(2);
    const chamberPower = chamberRow(card)?.querySelector<HTMLButtonElement>(".heat-off");
    const ventPower = ventRow(card)?.querySelector<HTMLButtonElement>(".heat-off");
    expect([chamberPower?.disabled, ventPower?.disabled]).toEqual([false, false]);
    expect(buttonsOf(chamberRow(card)).filter((item) => !item.classList.contains("heat-off")).every((item) => item.disabled)).toBe(true);
    expect(buttonsOf(ventRow(card)).filter((item) => !item.classList.contains("heat-off")).every((item) => item.disabled)).toBe(true);
    chamberPower?.click();
    ventPower?.click();
    await card.updateComplete;
    expect(hass.calls.map((call) => [call.domain, call.service, call.data])).toEqual([
      ["number", "set_value", { entity_id: "number.h2d_chamber_target_temperature", value: 0 }],
      ["fan", "set_percentage", { entity_id: VENT, percentage: 0 }],
    ]);
  });

  it("keeps the other part locked until the printer reports the first one off", async () => {
    // The chamber's off is sent at once, but the printer reports it a second or more later:
    // till then the integration still refuses ventilation.
    const { card, hass } = await block({ ...H2D_VENT, chamber: [39, 50] }, { language: "de" });
    chamberRow(card)?.querySelector<HTMLButtonElement>(".heat-off")?.click();
    await card.updateComplete;
    expect(words(chamberRow(card)?.querySelector(".heat-target"))).toBe("Kammer, Ziel: Aus");
    expect(buttonsOf(ventRow(card)).every((item) => item.disabled)).toBe(true);
    expect(notes(card)).toEqual(["Solange die Kammer heizt, lässt sie sich nicht lüften. Schalte zuerst oben unter „Heizen“ die Kammer aus."]);
    card.hass = hass.withState("number.h2d_chamber_target_temperature", "0");
    await card.updateComplete;
    expect(buttonsOf(ventRow(card))[1]?.disabled).toBe(false);
    expect(notes(card)).toEqual([]);
    // The other way round: the ventilation's off, then the chamber.
    const vent = await block({ ...H2D_VENT, ventilation: { percent: 60, fans: ["exhaust"] } }, { language: "de" });
    ventRow(vent.card)?.querySelector<HTMLButtonElement>(".heat-off")?.click();
    await vent.card.updateComplete;
    expect(buttonsOf(chamberRow(vent.card)).filter((item) => !item.classList.contains("heat-off")).every((item) => item.disabled)).toBe(true);
    vent.card.hass = vent.hass.withState(VENT, "off", { percentage: 0, fans: ["exhaust"] });
    await vent.card.updateComplete;
    expect(buttonsOf(chamberRow(vent.card)).some((item) => !item.disabled)).toBe(true);
  });

  it("disables everything of the ventilation row while its entity is unavailable, also with nothing locked", async () => {
    const { card } = await block({ ...H2D_VENT, ventilation: { percent: 0, fans: ["exhaust"], available: false } }, { language: "de" });
    const [lower, raise, power] = buttonsOf(ventRow(card));
    expect([lower?.disabled, raise?.disabled, power?.classList.contains("heat-off"), power?.disabled]).toEqual([true, true, true, true]);
  });

  it("disables the ventilation row while its entity is unavailable", async () => {
    const { card } = await block({ ...H2D_VENT, ventilation: { percent: 0, fans: ["exhaust"], available: false }, chamber: [39, 50] }, { language: "de" });
    expect(words(ventRow(card)?.querySelector(".heat-target"))).toBe("Lüften, Stufe: —");
    expect(words(ventRow(card)?.querySelector(".heat-now"))).toBe("Abluftlüfter");
    expect(buttonsOf(ventRow(card)).every((item) => item.disabled)).toBe(true);
    expect(notes(card)).toEqual([]);
  });

  it("shows heating and ventilation as text in a view-only card", async () => {
    const { card } = await block({ ...H2D_VENT, chamber: [39, 50] }, { language: "de", read_only: true });
    expect(find(card, ".heating button")).toBeNull();
    expect(words(ventRow(card)?.querySelector(".heat-target"))).toBe("Lüften, Stufe: Aus");
    expect(notes(card)).toEqual([]);
    expect(words(find(card, ".heating .hint"))).toContain("Lüften holt Frischluft hinein (PLA, TPU).");
  });

  it("says the laser mode under Ventilation: outside a job what a tap does, in a job that it waits", async () => {
    const { card } = await block({ ...H2D_VENT, airduct: "laser" }, { language: "de" });
    expect(notes(card)).toEqual(["Der Drucker steht noch im Lasermodus (für sein Lasermodul). Lüften stellt auf Kühlen um."]);
    expect(buttonsOf(ventRow(card))[1]?.disabled).toBe(false);
    const english = await block({ ...H2D_VENT, airduct: "laser" });
    expect(notes(english.card)).toEqual(["The printer is still in laser mode (for its laser module). Ventilating switches it to cooling."]);
    const job = await block({ ...H2D_VENT, airduct: "laser", status: "printing", stage: "printing" }, { language: "de" });
    expect(buttonsOf(ventRow(job.card)).every((item) => item.disabled)).toBe(true);
    expect(notes(job.card)).toEqual(["Gerade im Lasermodus: Den stellt der Drucker für sein Lasermodul ein."]);
  });

  it("says the heated chamber, not the laser mode, while the chamber heats in laser mode", async () => {
    const { card } = await block({ ...H2D_VENT, airduct: "laser", chamber: [39, 50] }, { language: "de" });
    expect(notes(card)).toEqual(["Solange die Kammer heizt, lässt sie sich nicht lüften. Schalte zuerst oben unter „Heizen“ die Kammer aus."]);
    expect(buttonsOf(ventRow(card)).every((item) => item.disabled)).toBe(true);
  });

  it("waits for a filament change where the mode would change", async () => {
    const { card } = await block({ ...H2D_VENT, airduct: "heating", amsStatus: "feeding" }, { language: "de" });
    expect(buttonsOf(ventRow(card)).every((item) => item.disabled)).toBe(true);
    const cooling = await block({ ...H2D_VENT, amsStatus: "feeding" }, { language: "de" });
    expect(buttonsOf(ventRow(cooling.card))[1]?.disabled).toBe(false);
    expect(buttonsOf(chamberRow(cooling.card)).filter((item) => !item.classList.contains("heat-off")).every((item) => item.disabled)).toBe(true);
  });

  it("wraps the ventilation's subtitle: the X2D's „Rechter Zusatzlüfter und Abluftlüfter“ ran under the stepper", () => {
    expect(styleText()).toMatch(/\.heat-name\.vent \.heat-now\s*\{[^}]*white-space: normal;/);
  });

  it("gives the keep-warm choices room for their words (a German „Aus“ was cut from 300 px)", () => {
    expect(styleText()).toMatch(/\.keep-warm \.seg button\s*\{[^}]*min-width: 52px;[^}]*white-space: nowrap;/);
  });

  it("has no ventilation part without the ventilation fan", async () => {
    const { card } = await block({ chamber: [33, 0] });
    expect(part(card)).toBeNull();
    expect(find(card, ".heating .hint")).toBeNull();
  });
});

describe("the chamber tile in the Status tab says what the chamber does", () => {
  type Spec = Parameters<typeof h2d>[0];
  async function tile(spec: Spec, printer: "h2d" | "x1c" = "h2d", language = "de"): Promise<Element | undefined> {
    const devices = printer === "h2d" ? h2d({ status: "idle", stage: "idle", ...spec }) : x1c({ status: "idle", stage: "idle", ...spec });
    const card = await mountCard(makeHass({ devices, language }), { printer: `dev-${printer}`, start_view: "status" });
    return findAll(card, ".temp").find((item) => /Kammer|Chamber/.test(item.querySelector(".temp-head")?.textContent ?? ""));
  }
  const line = (item: Element | undefined): string => (item?.querySelector(".temp-target")?.textContent ?? "").replace(/\s+/g, " ").trim();
  const iconPath = (item: Element | undefined): string | null | undefined => item?.querySelector(".temp-head path")?.getAttribute("d");

  it("heats: the target in the heat tone, as before", async () => {
    const item = await tile({ airduct: "heating", chamber: [39, 50], ventilation: { percent: 0, fans: ["exhaust"] } });
    expect([line(item), item?.classList.contains("heating"), item?.classList.contains("venting")]).toEqual(["Ziel 50 °C", true, false]);
  });

  it("is ventilated: „Lüften“ and the speed in the ventilation's tone, with the fan", async () => {
    const item = await tile({ airduct: "cooling", chamber: [43, 0], status: "printing", stage: "printing", ventilation: { percent: 30, fans: ["exhaust"] } });
    expect([line(item), item?.classList.contains("venting"), item?.classList.contains("heating")]).toEqual(["Lüften 30 %", true, false]);
    expect(iconPath(item)).toBe(ICONS.fan);
    expect(item?.getAttribute("aria-label")).toContain("Lüften 30");
    const english = await tile({ airduct: "cooling", chamber: [43, 0], ventilation: { percent: 60, fans: ["exhaust"] } }, "h2d", "en");
    expect(line(english)).toBe("Ventilation 60 %");
  });

  it("does neither: „Aus“", async () => {
    const item = await tile({ airduct: "cooling", chamber: [33, 0], ventilation: { percent: 0, fans: ["exhaust"] } });
    expect([line(item), item?.classList.contains("venting"), item?.classList.contains("heating")]).toEqual(["Aus", false, false]);
  });

  it("on the P2S: keeping warm, ventilated, or off", async () => {
    const warm = await tile({ airduct: "heating", ventilation: { percent: 0, fans: ["aux"] } }, "x1c");
    expect([line(warm), warm?.classList.contains("heating"), iconPath(warm)]).toEqual(["Wärme halten", true, ICONS.heat]);
    const vented = await tile({ airduct: "cooling", ventilation: { percent: 60, fans: ["aux"] } }, "x1c");
    expect([line(vented), vented?.classList.contains("venting")]).toEqual(["Lüften 60 %", true]);
    const off = await tile({ airduct: "cooling", ventilation: { percent: 0, fans: ["aux"] } }, "x1c");
    expect(line(off)).toBe("Aus");
  });

  it("opens what it shows: the ventilation while ventilated, else the target, the sensor where there is none or the card only shows", async () => {
    async function opened(spec: Spec, printer: "h2d" | "x1c" = "h2d", config: Record<string, unknown> = {}): Promise<string[]> {
      const devices = printer === "h2d" ? h2d({ status: "idle", stage: "idle", ...spec }) : x1c({ status: "idle", stage: "idle", ...spec });
      const card = await mountCard(makeHass({ devices, language: "de" }), { printer: `dev-${printer}`, start_view: "status", ...config });
      const seen: string[] = [];
      card.addEventListener("hass-more-info", (event) => seen.push((event as CustomEvent<{ entityId: string }>).detail.entityId));
      (findAll(card, ".temp").find((item) => /Kammer/.test(item.querySelector(".temp-head")?.textContent ?? "")) as HTMLButtonElement | undefined)?.click();
      return seen;
    }
    const vented = { airduct: "cooling", chamber: [43, 0] as [number, number], ventilation: { percent: 60, fans: ["exhaust"] } };
    expect(await opened(vented)).toEqual([VENT]);
    expect(await opened({ ...vented, chamber: [39, 50], ventilation: { percent: 0, fans: ["exhaust"] } })).toEqual(["number.h2d_chamber_target_temperature"]);
    expect(await opened({ ...vented, ventilation: { percent: 0, fans: ["exhaust"] } })).toEqual(["number.h2d_chamber_target_temperature"]);
    expect(await opened(vented, "h2d", { read_only: true })).toEqual(["sensor.h2d_chamber_temperature"]);
    // The P2S has no chamber target: its sensor, kept warm or not.
    expect(await opened({ airduct: "heating", ventilation: { percent: 0, fans: ["aux"] } }, "x1c")).toEqual(["sensor.x1c_chamber_temperature"]);
  });

  it("stays as it was on a printer without an airduct", async () => {
    const item = await tile({}, "x1c");
    expect(line(item)).toBe("");
    expect(item?.classList.contains("venting")).toBe(false);
  });
});

describe("the ventilation's explanation", () => {
  it("keeps half a line from what stands above it, as under the extruder", () => {
    expect(styleText()).toMatch(/\.heating > \.hint\s*\{[^}]*margin-top: 8px;/);
  });
});
