// The H3C and its AMS 3H: nine slots, a drying zone of two of them, one
// external input without a load (BamBuddy cannot load from it), heating
// without ventilation.
import { describe, expect, it } from "vitest";

import "../src/index";
import { globalTray, inputTool, unitName } from "../src/inventory-dialog";

import { H3C_INPUTS, h3c, makeHass, mountCard } from "./fixtures";
import { declarations, find, findAll, NBSP, showView, text } from "./helpers";
import { useCardPage } from "./card-helpers";

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
