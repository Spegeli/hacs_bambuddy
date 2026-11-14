// The H3C and its AMS 3H: nine slots, a drying zone of two of them, one
// external input without a load (BamBuddy cannot load from it), heating
// without ventilation.
import { describe, expect, it } from "vitest";

import "../src/index";
import { globalTray, inputTool, unitName } from "../src/inventory-dialog";

import { H3C_INPUTS, h3c, makeHass, mountCard, x1c, type ToolSpec } from "./fixtures";
import { declarations, find, findAll, NBSP, showView, styleText, text } from "./helpers";
import { confirmDialog, useCardPage } from "./card-helpers";
import { menuItem } from "./feature-helpers";

useCardPage();

async function h3cCard(zone: number[] | null = [6, 8], language = "en") {
  const hass = makeHass({ devices: h3c({}, zone), language });
  const card = await mountCard(hass, { printer: "dev-h3c" });
  return { card, hass };
}

describe("the H3C's AMS 3H", () => {
  it("shows its nine colours in the Status tab, in rows of five", async () => {
    const { card } = await h3cCard();
    const slots = find(card, ".ams-column .ams-slots");
    expect(slots?.classList.contains("nine")).toBe(true);
    expect(findAll(card, ".ams-column .ams-slot")).toHaveLength(9);
    // No input numbers on the AMS 3H's own slots.
    expect(findAll(card, ".ams-column .slot-side")).toHaveLength(0);
    // Five a row (5 + 4); on a narrow card three a row, where four-slot units go two.
    expect(declarations(".ams-slots.nine")).toEqual(expect.arrayContaining(["display: grid", "grid-template-columns: repeat(5, auto)"]));
    expect(declarations(".ams-slots.nine")).toContain("grid-template-columns: repeat(3, auto)");
  });

  it("names its drying zone beside the drying row", async () => {
    const { card } = await h3cCard();
    await showView(card, "Filament");
    expect(text(find(card, ".unit .drying"))).toBe("Not drying · Slots 6 and 8 Dry");
  });

  it("names no zone while BamBuddy reports none", async () => {
    const { card } = await h3cCard(null);
    await showView(card, "Filament");
    expect(text(find(card, ".unit .drying"))).toBe("Not drying Dry");
  });

  it("names its zone in German", async () => {
    const { card } = await h3cCard([6, 8], "de");
    await showView(card, "Filament");
    expect(text(find(card, ".unit .drying .drying-text"))).toBe("Trocknet nicht · Fächer 6 und 8");
  });

  it("sets the drying dialog from the zone's spools alone", async () => {
    const { card } = await h3cCard();
    await showView(card, "Filament");
    findAll<HTMLButtonElement>(card, ".drying .btn")[0]?.click();
    await card.updateComplete;
    // The zone holds the PETG (65 °C, 8 h); the other slots' PLA (50 °C, 12 h) is not dried.
    expect(find<HTMLInputElement>(card, "#dry-temperature")?.value).toBe("65");
    expect(find<HTMLInputElement>(card, "#dry-duration")?.value).toBe("8");
  });

  it("names the zone under the drying dialog's title", async () => {
    const { card } = await h3cCard([6, 8], "de");
    await showView(card, "Filament");
    findAll<HTMLButtonElement>(card, ".drying .btn")[0]?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Filament in AMS 3H trocknen");
    expect(text(find(card, "dialog .dry-zone"))).toBe("Fächer 6 und 8");
    // A screen reader hears the zone with the title.
    expect(find(card, "dialog")?.getAttribute("aria-describedby")).toBe("dlg-zone");
    expect(find(card, "dialog .dry-zone")?.id).toBe("dlg-zone");
  });

  it("names a zone of one slot under the drying dialog's title", async () => {
    const { card } = await h3cCard([6]);
    await showView(card, "Filament");
    findAll<HTMLButtonElement>(card, ".drying .btn")[0]?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog .dry-zone"))).toBe("Slot 6");
  });

  it("names no zone in the drying dialog while BamBuddy reports none", async () => {
    const { card } = await h3cCard(null);
    await showView(card, "Filament");
    findAll<HTMLButtonElement>(card, ".drying .btn")[0]?.click();
    await card.updateComplete;
    expect(find(card, "dialog h2")).not.toBeNull();
    expect(find(card, "dialog .dry-zone")).toBeNull();
    expect(find(card, "dialog")?.hasAttribute("aria-describedby")).toBe(false);
  });

  it("shows no external inputs beside the AMS 3H, whatever they still hold", async () => {
    // With the AMS 3H connected again the inputs keep what they held before.
    const hass = makeHass({ devices: [...h3c({ externalSpools: H3C_INPUTS })] });
    const card = await mountCard(hass, { printer: "dev-h3c" });
    expect(findAll(card, ".ams-fill")).toHaveLength(0);
    await showView(card, "Filament");
    expect(findAll(card, ".unit .slots")).toHaveLength(1);
  });

  it("shows no external inputs while they stand empty", async () => {
    const { card } = await h3cCard();
    expect(findAll(card, ".ams-fill")).toHaveLength(0);
    await showView(card, "Filament");
    expect(findAll(card, ".unit .slots")).toHaveLength(1);
  });
});

describe("the H3C's external inputs", () => {
  async function inputsCard(language = "en") {
    const hass = makeHass({ devices: h3c({}, null, false), language });
    const card = await mountCard(hass, { printer: "dev-h3c" });
    return { card, hass };
  }

  it("numbers an input by its tool, also with others disabled", async () => {
    // Only External 1 and External 5: their numbers, and no left and right.
    const devices = h3c({}, null, false).map((device) => ({
      ...device,
      entities: device.entities.filter((entity) => !/_external_[2346789]$/.test(entity.entityId)),
    }));
    const card = await mountCard(makeHass({ devices }), { printer: "dev-h3c" });
    expect(findAll(card, ".ams-fill .slot-side").map(text)).toEqual(["1", "5"]);
    await showView(card, "Filament");
    expect(findAll(card, ".unit .slots .btn.edit").map((edit) => edit.getAttribute("aria-label"))).toEqual(["Edit External 1", "Edit External 5"]);
  });

  it("shows the inputs that hold a spool, by their tool's number", async () => {
    const { card } = await inputsCard();
    expect(findAll(card, ".ams-fill .slot-side").map(text)).toEqual(["1", "2", "5", "9"]);
  });

  it("names each input in the Filament tab and offers no load", async () => {
    const { card } = await inputsCard("de");
    await showView(card, "Filament");
    const rows = findAll(card, ".unit .slots .slot");
    expect(rows).toHaveLength(4);
    // Each row names its input.
    expect(rows.map((row) => text(row.querySelector(".slot-sub")))).toEqual(["Extern 1", "Extern 2", "Extern 5", "Extern 9"]);
    expect(findAll(card, ".unit .slots .btn").map(text)).not.toContain("Laden");
    const edit = find<HTMLButtonElement>(card, ".unit .slots .btn.edit");
    expect(edit?.getAttribute("aria-label")).toBe("Extern 1 bearbeiten");
    edit?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Filament von Extern 1");
  });

  it("heats and ventilates its chamber as the H2 series do", async () => {
    const { card } = await h3cCard();
    await showView(card, "Control");
    expect(find(card, ".vent-part")).not.toBeNull();
  });
});

describe("BamBuddy's places in the inventory", () => {
  it("numbers and names the AMS 3H's slots", () => {
    expect([globalTray(32, 0), globalTray(32, 8), globalTray(128, 0), globalTray(6, 1), globalTray(1, 2)]).toEqual([28, 36, 128, 25, 6]);
    expect([unitName(32), unitName(0), unitName(129), unitName(6)]).toEqual(["AMS 3H", `AMS${NBSP}A`, `AMS${NBSP}HT${NBSP}B`, "AMS Lite"]);
    // An H3C's inputs: BamBuddy's slots 0, 1, 2 and 8 are tools 2, 1, 9 and 3.
    expect([inputTool(0), inputTool(1), inputTool(2), inputTool(8)]).toEqual([2, 1, 9, 3]);
  });
});

describe("the H3C's PrintTools", () => {
  const tools = (change: (tool: ToolSpec, number: number) => ToolSpec | null): (ToolSpec | null)[] =>
    [3.8, 1.2, 0.6, 0, 1.2, 0, 0.3, 0, 0.9].map((hours, index) =>
      change({ hours, hasFilament: index !== 7, fedBy: "ams", ...(index === 7 ? { code: "HT01", flow: "tpu_285", filament: 2.85 } : {}) }, index + 1),
    );
  async function toolsCard(options: { tools?: (ToolSpec | null)[]; mountedTool?: number; status?: string } = {}) {
    const hass = makeHass({
      devices: h3c({ ...(options.tools ? { tools: options.tools } : {}), ...(options.mountedTool ? { mountedTool: options.mountedTool } : {}), ...(options.status ? { status: options.status } : {}) }),
      language: "de",
    });
    const card = await mountCard(hass, { printer: "dev-h3c" });
    return { card, hass };
  }
  const tile = (card: Parameters<typeof find>[0], number: number): HTMLElement | null => find(card, `.tool-tile[data-tool="${number}"]`);
  const slotAction = (row: Element | undefined): string => text(row?.querySelector(".btn:not(.edit)") ?? null) || text(row?.querySelector(".slot-hint") ?? null);

  it("shows nine tiles above the AMS, nowhere else", async () => {
    const { card } = await toolsCard();
    const sections = findAll(card, ".tools, .ams-strip");
    expect(sections.map((section) => section.className.split(" ")[0])).toEqual(["tools", "ams-strip"]);
    expect(findAll(card, ".tool-tile").map((each) => text(each))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(text(find(card, ".tools-head"))).toBe("Druckwerkzeuge");
    const other = await mountCard(makeHass({ devices: x1c() }), { printer: "dev-x1c" });
    expect(find(other, ".tools")).toBeNull();
  });

  it("outlines the tool on the toolhead and says it only in its tooltip", async () => {
    const { card } = await toolsCard({ mountedTool: 3 });
    expect(findAll(card, ".tool-tile.on-head").map((each) => each.getAttribute("data-tool"))).toEqual(["3"]);
    expect(tile(card, 3)?.getAttribute("title")).toBe(`Druckwerkzeug 3 · 0,4${NBSP}mm · Gehärteter Stahl · 1,75${NBSP}mm · 0,6${NBSP}h gedruckt · am Druckkopf`);
    expect(tile(card, 8)?.getAttribute("title")).toBe(`Druckwerkzeug 8 · 0,4${NBSP}mm · Gehärteter Stahl · 2,85${NBSP}mm · 0${NBSP}h gedruckt · kein Filament`);
    expect(text(find(card, ".tools"))).not.toContain("am Druckkopf");
  });

  it("colours a tile by its slot, else by the rack, else dashed", async () => {
    const { card } = await toolsCard({
      tools: tools((tool, number) => (number === 8 ? { ...tool, hasFilament: true, color: "FF00FFFF" } : number === 6 ? { ...tool, hasFilament: false, color: "FFFF00FF" } : tool)),
    });
    const dot = (number: number): HTMLElement | null => tile(card, number)?.querySelector<HTMLElement>(".tool-dot") ?? null;
    expect(dot(1)?.getAttribute("style")).toContain("#FF6A13");
    // Slot 8 reads empty, the tool holds TPU from the bypass feed: the rack's colour.
    expect(dot(8)?.getAttribute("style")).toContain("#FF00FF");
    // Slot 6 holds a spool: its colour, whatever the tool reported before.
    expect(dot(6)?.getAttribute("style")).toContain("#00AE42");
  });

  it("dashes a tool that holds no filament where its slot is empty", async () => {
    const { card } = await toolsCard({ tools: tools((tool, number) => (number === 8 ? { ...tool, color: "FFFF00FF" } : tool)) });
    expect(tile(card, 8)?.querySelector(".tool-dot")?.classList.contains("empty")).toBe(true);
  });

  it("shows a place the rack does not report as a dash", async () => {
    const { card } = await toolsCard({ tools: tools((tool, number) => (number === 4 ? null : tool)) });
    const missing = find(card, ".tool-tile.missing");
    expect(text(missing)).toBe("Druckwerkzeug 4 · nicht gemeldet–4");
    expect(missing?.tagName).toBe("SPAN");
  });

  it("opens a tool's dialog: what it is, never a setting", async () => {
    const { card } = await toolsCard({ mountedTool: 1 });
    tile(card, 1)?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Druckwerkzeug 1");
    expect(findAll(card, "dialog .spec-row").map(text)).toEqual([
      `Düse0,4${NBSP}mm · Gehärteter Stahl`,
      `Filamentdurchmesser1,75${NBSP}mm`,
      "Gespeist vonAMS 3H, Fach 1",
      `Druckzeit3,8${NBSP}h`,
      "Am DruckkopfJa",
    ]);
    expect(findAll(card, "dialog .dlg-actions button").map(text)).toEqual(["Schließen"]);
    find<HTMLButtonElement>(card, "dialog .btn.safe")?.click();
    await card.updateComplete;
    tile(card, 8)?.click();
    await card.updateComplete;
    expect(findAll(card, "dialog .spec-row").map(text)).toContain(`Filamentdurchmesser2,85${NBSP}mm (TPU)`);
    expect(findAll(card, "dialog .spec-row").map(text)).toContain(`Druckzeit0${NBSP}h`);
  });

  it("names the input that feeds a tool without an AMS", async () => {
    const card = await mountCard(makeHass({ devices: h3c({}, null, false), language: "de" }), { printer: "dev-h3c" });
    tile(card, 2)?.click();
    await card.updateComplete;
    expect(findAll(card, "dialog .spec-row").map(text)).toContain("Gespeist vonExtern 2");
  });

  it("unloads each slot's own tool, and sends the slot", async () => {
    const { card, hass } = await toolsCard();
    await showView(card, "Filament");
    const actions = findAll(card, ".unit .slot").map(slotAction);
    expect(actions).toEqual([
      ...Array<string>(7).fill("Entladen"),
      "TPU lädst du am Drucker über die Durchführung: Filament → Fach 8 → „Load External“.",
      "Entladen",
    ]);
    findAll(card, ".unit .slot")[2]?.querySelector<HTMLButtonElement>(".btn:not(.edit)")?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Filament entladen?");
    expect(text(find(card, "dialog #dlg-text"))).toBe("Der Drucker holt Druckwerkzeug 3, heizt es auf und schneidet das Filament ab. Danach ziehst du es oben am AMS von Hand heraus.");
    await confirmDialog(card);
    expect(hass.calls.at(-1)).toMatchObject({ service: "unload_filament", data: { entity_id: expect.stringContaining("slot_3") } });
  });

  it("loads a slot whose tool holds nothing, and offers nothing on an empty slot", async () => {
    const { card } = await toolsCard({ tools: tools((tool, number) => (number === 2 ? { ...tool, hasFilament: false } : tool)) });
    await showView(card, "Filament");
    expect(slotAction(findAll(card, ".unit .slot")[1])).toBe("Laden");
    const other = await toolsCard({ tools: tools((tool, number) => (number === 8 ? { code: "HS01", hasFilament: true, hours: 0 } : tool)) });
    await showView(other.card, "Filament");
    // Slot 8 reads empty: no button, also with the tool's bit still set.
    expect(findAll(other.card, ".unit .slot")[7]?.querySelector(".btn:not(.edit)")).toBeNull();
  });

  it("unloads nothing per slot while a print is on", async () => {
    const { card } = await toolsCard({ status: "paused" });
    await showView(card, "Filament");
    const actions = findAll(card, ".unit .slot").map((row) => text(row.querySelector(".btn:not(.edit)") ?? null));
    // No slot is in use here: none unloads its tool and none loads while the print waits.
    expect(actions.filter(Boolean)).toEqual([]);
  });
});

describe("the H3C's nozzles in words", () => {
  async function deCard(overrides: Parameters<typeof h3c>[0] = {}) {
    const hass = makeHass({ devices: h3c(overrides), language: "de" });
    return mountCard(hass, { printer: "dev-h3c" });
  }
  const third = (tools: (ToolSpec | null)[]): (ToolSpec | null)[] =>
    tools.map((tool, index) => (index === 2 && tool ? { ...tool, diameter: 0.6, flow: "high_flow" } : tool));
  const nine = (): (ToolSpec | null)[] => [3.8, 1.2, 0.6, 0, 1.2, 0, 0.3, 0, 0.9].map((hours) => ({ hours, hasFilament: true }));

  it("names a slot's own PrintTool in its dialog, with the nozzle symbol", async () => {
    const card = await deCard({ tools: third(nine()) });
    await showView(card, "Filament");
    findAll(card, ".unit .slot")[2]?.querySelector<HTMLButtonElement>(".btn.edit")?.click();
    await card.updateComplete;
    const line = find(card, "dialog .nozzle-line span");
    expect(text(line)).toBe(`Druckwerkzeug 3: 0,6${NBSP}mm · High Flow · Gehärteter Stahl · 1,75${NBSP}mm`);
    expect(line?.querySelector(".icon")).not.toBeNull();
  });

  it("lists the nine nozzles one by one where they differ", async () => {
    const card = await deCard();
    (await menuItem(card, "Druckerinformationen")).click();
    await card.updateComplete;
    const row = findAll(card, "dialog .spec-row").find((each) => text(each).startsWith("Düsen"));
    expect([...(row?.querySelectorAll(".spec-value > span") ?? [])].map((span) => text(span))).toEqual([
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => `${n}: 0,4${NBSP}mm · Gehärteter Stahl · 1,75${NBSP}mm`),
      `8: 0,4${NBSP}mm · Gehärteter Stahl · 2,85${NBSP}mm`,
      `9: 0,4${NBSP}mm · Gehärteter Stahl · 1,75${NBSP}mm`,
    ]);
  });

  it("names nine alike nozzles in one line, and only places the rack reports", async () => {
    const alike = await deCard({ tools: nine() });
    (await menuItem(alike, "Druckerinformationen")).click();
    await alike.updateComplete;
    expect(text(findAll(alike, "dialog .spec-row").find((each) => text(each).startsWith("Düsen")) ?? null)).toBe(`Düsen 9 × 0,4${NBSP}mm · Gehärteter Stahl · 1,75${NBSP}mm`);
    const partial = await deCard({ tools: nine().map((tool, index) => (index === 4 ? null : tool)) });
    (await menuItem(partial, "Druckerinformationen")).click();
    await partial.updateComplete;
    const lines = [...(findAll(partial, "dialog .spec-row").find((each) => text(each).startsWith("Düsen"))?.querySelectorAll(".spec-value > span") ?? [])].map((span) => text(span));
    expect(lines).toHaveLength(8);
    expect(lines[4]?.startsWith("6: ")).toBe(true);
  });

  it("leaves the nozzle out of its subtitle", async () => {
    const card = await deCard();
    expect(text(find(card, ".head .model"))).toBe("H3C · 12 h");
  });

  it("puts the AMS 3H's nine colours in one row where the card has room", () => {
    expect(styleText()).toMatch(/@container \(min-width: 388px\) \{\s*\.ams-slots\.nine \{\s*grid-template-columns: repeat\(9, auto\);\s*column-gap: 6px;/);
  });

  it("names the block it heats in under Heating and ventilation", async () => {
    const card = await deCard({ nozzles: [[25, 0]] });
    await showView(card, "Steuerung");
    expect(text(find(card, ".note"))).toBe(`Zum Extrudieren heize die Düse unter „Heizen und Lüften“ auf mindestens 170${NBSP}°C.`);
  });
});

describe("the H3C's PrintTools on narrow cards and for screen readers", () => {
  it("puts the tiles in rows of five and four on a narrow card", () => {
    expect(styleText()).toMatch(/@container \(max-width: 260px\) \{[^@]*\.tool-tiles \{\s*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/);
  });

  it("colours a tile by its own input with another input's sensor disabled", async () => {
    // Without an AMS: tool 5 is fed by External 5, also with External 2 gone.
    const devices = h3c({}, null, false).map((device) => ({
      ...device,
      entities: device.entities.filter((entity) => !/_external_2$/.test(entity.entityId)),
    }));
    const card = await mountCard(makeHass({ devices }), { printer: "dev-h3c" });
    const style = find(card, '.tool-tile[data-tool="5"] .tool-dot')?.getAttribute("style") ?? "";
    const input = H3C_INPUTS[4];
    expect(style).toContain(String(input?.color));
  });

  it("tells a screen reader a place the printer does not report", async () => {
    const tools = [3.8, 1.2, 0.6, 0, 1.2, 0, 0.3, 0, 0.9].map((hours, index) => (index === 3 ? null : { hours, hasFilament: true }));
    const card = await mountCard(makeHass({ devices: h3c({ tools }), language: "de" }), { printer: "dev-h3c" });
    const missing = find(card, ".tool-tile.missing");
    expect(missing?.getAttribute("title")).toBe("Druckwerkzeug 4 · nicht gemeldet");
    expect(text(missing?.querySelector(".sr-only") ?? null)).toBe("Druckwerkzeug 4 · nicht gemeldet");
  });
});

describe("the 2.85 mm tool's slot shows its input", () => {
  // TPU through slot 8's bypass feed: the printer reports it on External 8 (input 248).
  const inputs = H3C_INPUTS.map((input) =>
    input.trayId === 248 ? { name: "Generic TPU (2.85mm)", type: "TPU", color: "#FF00FF", remaining: null, trayId: 248 } : { trayId: input.trayId },
  );
  async function tpuCard() {
    const card = await mountCard(makeHass({ devices: h3c({ externalSpools: inputs }), language: "de" }), { printer: "dev-h3c" });
    return card;
  }

  it("shows the input's spool in slot 8's row and edits it there", async () => {
    const card = await tpuCard();
    await showView(card, "Filament");
    const row = findAll(card, ".unit .slot")[7];
    expect(text(row?.querySelector(".slot-name") ?? null)).toBe("Generic TPU (2.85mm)");
    expect(text(row?.querySelector(".slot-hint") ?? null)).toBe("TPU lädst du am Drucker über die Durchführung: Filament → Fach 8 → „Load External“.");
    row?.querySelector<HTMLButtonElement>(".btn.edit")?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Filament von Fach 8 · AMS 3H");
    expect(text(find(card, "dialog .nozzle-line span"))).toBe(`Druckwerkzeug 8: 0,4${NBSP}mm · Gehärteter Stahl · 2,85${NBSP}mm`);
    // Still no Extern section beside the AMS 3H.
    expect(findAll(card, ".unit")).toHaveLength(1);
  });

  it("colours slot 8 in the Status strip and tile 8 by the input", async () => {
    const card = await tpuCard();
    const swatches = findAll(card, ".ams-column .ams-slot .swatch");
    expect(swatches[7]?.getAttribute("style")).toContain("#FF00FF");
    expect(find(card, '.tool-tile[data-tool="8"] .tool-dot')?.getAttribute("style")).toContain("#FF00FF");
  });
});
