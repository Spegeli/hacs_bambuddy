// BamBuddy's spool inventory in the card (#21): a slot's assigned spool in
// the Filament tab and the Status strip.
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { ICONS } from "../src/icons";
import { en } from "../src/translations/en";
import {
  assign,
  changeEntities,
  geeetech,
  h2d,
  listed,
  makeHass,
  mountCard,
  mountFor,
  withoutChip,
  x1c,
  type FakeCard,
  type FakeDevice,
  type FakeHass,
  type FakeHassOptions,
} from "./fixtures";
import { atRule, chooseOption, declarations, editSlot, find, findAll, NBSP, root, settle, showView, styleText, text } from "./helpers";
import { keyPress } from "./card-helpers";

afterEach(() => {
  document.body.innerHTML = "";
});

const GEEETECH = geeetech();

const X1C_SLOT_3 = "sensor.dev-x1c_ams_0_slot_3";
const X1C_SLOT_4 = "sensor.dev-x1c_ams_0_slot_4";

/** Slot 4 reports no spool for now (BamBuddy's present: false). */
const absent = (devices: FakeDevice[]): FakeDevice[] => changeEntities(devices, (entity) => entity.entityId === X1C_SLOT_4, (entity) => ({ ...entity.attributes, present: false }));

const mount = async (devices: FakeDevice[], printer: string, options: Partial<FakeHassOptions> = {}): Promise<FakeCard> =>
  (await mountFor(devices, printer, {}, { language: "de", ...options })).card;

const subLines = (row: Element | null | undefined): string[] => [...(row?.querySelectorAll(".slot-sub") ?? [])].map(text);

/** The Filament tab's row of a slot, by its sensor (the button opens it). */
function rowOf(card: FakeCard, name: string): Element | undefined {
  return findAll(card, ".slot").find((row) => text(row.querySelector(".slot-name")) === name);
}

describe("a slot's inventory spool", () => {
  it("names the inventory spool below the slot's name, then what is left", async () => {
    const devices = assign(x1c(), X1C_SLOT_3, GEEETECH);
    const card = await mount(devices, "dev-x1c");
    await showView(card, "Filament");

    const row = findAll(card, ".slot")[2];
    expect(text(row?.querySelector(".slot-name"))).toBe("PLA");
    expect(subLines(row)).toEqual(["Geeetech PLA Basic", `89${NBSP}%${NBSP}·${NBSP}886${NBSP}g`]);
  });

  it("says In Gebrauch before what is left of the active spool", async () => {
    const devices = assign(x1c(), "sensor.dev-x1c_ams_0_slot_2", { ...GEEETECH, rfid: true });
    const card = await mount(devices, "dev-x1c");
    await showView(card, "Filament");

    expect(subLines(findAll(card, ".slot")[1])).toEqual(["Geeetech PLA Basic", `In Gebrauch${NBSP}· 89${NBSP}%${NBSP}·${NBSP}886${NBSP}g`]);
  });

  it("names the side of a two-nozzle printer's external spool", async () => {
    const devices = assign(h2d(), "sensor.h2d_right_external_spool", { ...GEEETECH, id: 4 });
    // The right external spool is empty in the fixture: give it a spool.
    for (const entity of devices[0]?.entities ?? []) {
      if (entity.entityId === "sensor.h2d_right_external_spool") {
        entity.state = "PLA";
        entity.attributes = { ...entity.attributes, name: "PLA", type: "PLA", empty: false, color: "#FFFFFF" };
      }
    }
    const card = await mount(devices, "dev-h2d");
    await showView(card, "Filament");

    const row = findAll(card, ".slot").find((item) => subLines(item)[0] === "Geeetech PLA Basic");
    expect(subLines(row)).toEqual(["Geeetech PLA Basic", `Rechts${NBSP}· 89${NBSP}%${NBSP}·${NBSP}886${NBSP}g`]);
  });

  it("fills the swatch from the inventory", async () => {
    const devices = assign(x1c(), X1C_SLOT_3, GEEETECH);
    const card = await mount(devices, "dev-x1c");
    await showView(card, "Filament");

    const swatch = findAll(card, ".slot")[2]?.querySelector<HTMLElement>(".swatch");
    expect(swatch?.getAttribute("style")).toContain("--fill: 89%");
    expect(swatch?.classList.contains("partial")).toBe(true);
  });

  it("an empty slot waits for its spool", async () => {
    const devices = assign(x1c(), X1C_SLOT_4, GEEETECH);
    absent(devices);
    const card = await mount(devices, "dev-x1c");

    const strip = findAll(card, ".ams-slot")[3];
    expect(strip?.getAttribute("title")).toBe("Leer · Geeetech PLA Basic wartet");
    // The strip keeps the slot empty.
    expect(strip?.querySelector(".swatch")?.classList.contains("empty")).toBe(true);
    await showView(card, "Filament");
    const row = findAll(card, ".slot")[3];
    expect(text(row?.querySelector(".slot-name"))).toBe("Leer");
    expect(subLines(row)).toEqual(["Geeetech PLA Basic", "Wartet auf die Spule"]);
  });

  it("the strip's title names the spool", async () => {
    const devices = assign(x1c(), X1C_SLOT_3, GEEETECH);
    const card = await mount(devices, "dev-x1c");

    expect(findAll(card, ".ams-slot")[2]?.getAttribute("title")).toBe(`Geeetech PLA Basic · 89${NBSP}%${NBSP}·${NBSP}886${NBSP}g`);
  });

  it("a slot without an inventory spool is as today", async () => {
    const devices = assign(x1c(), X1C_SLOT_3, null);
    const card = await mount(devices, "dev-x1c");
    expect(findAll(card, ".ams-slot")[2]?.getAttribute("title")).toBe("PLA");
    await showView(card, "Filament");

    expect(subLines(findAll(card, ".slot")[2])).toEqual([]);
    expect(find(card, ".slot")).not.toBeNull();
    expect(rowOf(card, "PLA")).toBeDefined();
  });

  it("reads the grams with the locale's grouping", async () => {
    const devices = assign(x1c(), X1C_SLOT_3, { ...GEEETECH, remaining_g: 2386, label_weight: 3000, remaining_pct: 80 });
    const card = await mount(devices, "dev-x1c", { language: "en" });
    await showView(card, "Filament");

    expect(subLines(findAll(card, ".slot")[2])).toEqual(["Geeetech PLA Basic", `80${NBSP}%${NBSP}·${NBSP}2,386${NBSP}g`]);
  });
});


async function openSlot3(spool: Record<string, unknown> | null, assignable: boolean, slot = 2): Promise<FakeCard> {
  const entity = [X1C_SLOT_3.replace("slot_3", "slot_1"), "sensor.dev-x1c_ams_0_slot_2", X1C_SLOT_3, X1C_SLOT_4][slot] as string;
  const devices = assign(x1c(), entity, spool, assignable);
  const card = await mount(devices, "dev-x1c");
  await showView(card, "Filament");
  await editSlot(card, slot);
  return card;
}

const tabs = (card: FakeCard): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, "dialog [role=tablist] [role=tab]");

describe("the slot dialog and the inventory", () => {
  it("shows the switch only where assigning is offered", async () => {
    const card = await openSlot3(GEEETECH, true);
    expect(tabs(card).map(text)).toEqual(["Filament einstellen", "Aus dem Inventar"]);
    expect(tabs(card).map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false"]);

    const plain = await openSlot3(GEEETECH, false);
    expect(findAll(plain, "dialog [role=tablist]")).toHaveLength(0);
  });

  it("the switch moves with the arrow keys", async () => {
    const card = await openSlot3(GEEETECH, true);
    const key = async (name: string): Promise<void> => {
      (find(card, "dialog [role=tab][aria-selected=true]") as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
      await settle(card);
    };
    await key("ArrowRight");
    expect(text(find(card, "dialog [role=tab][aria-selected=true]"))).toBe("Aus dem Inventar");
    expect(text(root(card).activeElement)).toBe("Aus dem Inventar");
    await key("ArrowLeft");
    expect(text(find(card, "dialog [role=tab][aria-selected=true]"))).toBe("Filament einstellen");
    await key("End");
    expect(text(find(card, "dialog [role=tab][aria-selected=true]"))).toBe("Aus dem Inventar");
    await key("Home");
    expect(text(find(card, "dialog [role=tab][aria-selected=true]"))).toBe("Filament einstellen");
  });

  it("names the inventory spool above the fields whatever the key", async () => {
    for (const assignable of [true, false]) {
      const card = await openSlot3(GEEETECH, assignable);
      const box = find(card, "dialog .inv-card");
      expect(text(box?.querySelector(".inv-from"))).toBe("Zugewiesene Spule aus dem Inventar");
      expect(text(box?.querySelector(".inv-name"))).toBe("Geeetech PLA Basic");
      expect(text(box?.querySelector(".inv-line"))).toBe(`Apple Green · 886${NBSP}g (89${NBSP}%) · Nr. 1`);
    }
    const stored = await openSlot3({ ...GEEETECH, storage_location: "Regal A2" }, true);
    // Its location on a line of its own.
    expect(findAll(stored, "dialog .inv-card .inv-line").map(text)).toEqual([`Apple Green · 886${NBSP}g (89${NBSP}%) · Nr. 1`, "Lagerort: Regal A2"]);
  });

  it("a chip spool's box is any assigned spool's; the sentence below says the chip linked it", async () => {
    const card = await openSlot3({ ...GEEETECH, rfid: true }, true, 0);
    expect(text(find(card, "dialog .inv-card .inv-from"))).toBe("Zugewiesene Spule aus dem Inventar");
    expect(findAll(card, "dialog [role=tablist]")).toHaveLength(0);
    expect(text(find(card, "dialog .inv-card")?.nextElementSibling)).toBe(
      "Eine Bambu-Lab-Spule mit Chip: Das AMS liest Material und Farbe vom Chip, und BamBuddy hat sie darüber der Spule oben zugewiesen.",
    );
    // Without a spool of the inventory: the chip alone.
    const plain = await openSlot3(null, true, 0);
    expect(text(find(plain, "dialog .rfid-spool")?.previousElementSibling)).toBe("Eine Bambu-Lab-Spule mit Chip: Material und Farbe liest das AMS vom Chip.");
  });

  it("a chip spool's own line goes where the inventory's box names the spool", async () => {
    const linked = await openSlot3({ ...GEEETECH, rfid: true }, true, 0);
    expect(find(linked, "dialog .inv-card")).not.toBeNull();
    expect(find(linked, "dialog .rfid-spool")).toBeNull();
    const plain = await openSlot3(null, true, 0);
    expect(text(find(plain, "dialog .rfid-spool"))).toBe(`PLA Basic · 80${NBSP}%`);
  });

  it("the note on changing colour or type stands under the box", async () => {
    const note = "Eine andere Farbe oder ein anderer Typ (z. B. PETG statt PLA) hebt die Zuweisung der Spule auf.";
    const card = await openSlot3(GEEETECH, true);
    const box = find(card, "dialog .inv-card");
    expect(text(box?.nextElementSibling)).toBe(note);
    expect(text(find(await openSlot3(null, true), "dialog"))).not.toContain(note);
    expect(text(find(await openSlot3({ ...GEEETECH, rfid: true }, true, 0), "dialog"))).not.toContain(note);
  });

  it("names the slot's profile above vendor and filament, and the note at the foot goes", async () => {
    const card = await openSlot3(GEEETECH, true);
    const head = find(card, "dialog .fil-head");
    expect(text(head?.querySelector(".fil-title"))).toBe("Profil des Fachs");
    expect(text(head?.querySelector(".fil-help"))).toBe(
      "Die Profile, die Bambu Studio mitbringt, passend zu diesem Drucker, seiner Düse und diesem Fach. Eigene Profile sind nicht dabei; die setzt du am Drucker oder in BamBuddy.",
    );
    expect(head?.compareDocumentPosition(find(card, "dialog select#fil-vendor") as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(text(find(card, "dialog"))).not.toContain("Für Spulen ohne Chip");
    // Without a spool too.
    expect(text(find(await openSlot3(null, true), "dialog .fil-head .fil-title"))).toBe("Profil des Fachs");
  });

  it("warns above the buttons only where a colour or type change ends the assignment", async () => {
    const warning = (card: FakeCard): string => text(find(card, "dialog .dlg-actions .dlg-warn"));
    const swatch = async (card: FakeCard, name: string): Promise<void> => {
      (findAll<HTMLButtonElement>(card, "dialog [role=radiogroup] [role=radio]").find((item) => item.getAttribute("aria-label") === name) as HTMLButtonElement).click();
      await settle(card);
    };
    const other = async (card: FakeCard, value: string): Promise<void> => {
      const input = find<HTMLInputElement>(card, "dialog input[type=color]") as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event("input"));
      await settle(card);
    };
    const card = await openSlot3(GEEETECH, true);
    expect(find(card, "dialog .dlg-warn")).toBeNull();
    // Another vendor's PLA in the same colour: the assignment stays.
    await chooseOption(card, "#fil-vendor", "Bambu Lab");
    await chooseOption(card, "#fil-filament", "GFA00");
    expect(find(card, "dialog .dlg-warn")).toBeNull();
    // PETG: another type.
    await chooseOption(card, "#fil-filament", "GFG02");
    expect(warning(card)).toBe("Übernehmen hebt die Zuweisung von Geeetech PLA Basic auf.");
    // Back to PLA, then another colour.
    await chooseOption(card, "#fil-filament", "GFA00");
    expect(find(card, "dialog .dlg-warn")).toBeNull();
    await swatch(card, "Schwarz");
    expect(warning(card)).toBe("Übernehmen hebt die Zuweisung von Geeetech PLA Basic auf.");
    // Its own full-width line before the buttons.
    expect(find(card, "dialog .dlg-actions")?.firstElementChild?.classList.contains("dlg-warn")).toBe(true);
    // Near the colour BamBuddy matched it with (distance at most 50): it stays.
    await other(card, "#F0F0F0");
    expect(find(card, "dialog .dlg-warn")).toBeNull();
    // The spool's own colour and type keep it too, whatever the slot held.
    await other(card, "#B6D648");
    expect(find(card, "dialog .dlg-warn")).toBeNull();
    // Assigned while the slot was empty: BamBuddy sets the slot from the spool, nothing ends.
    const waiting = await openSlot3({ ...GEEETECH, assigned_color: "", assigned_type: "" }, true);
    await swatch(waiting, "Schwarz");
    expect(find(waiting, "dialog .dlg-warn")).toBeNull();
    // No spool: nothing to end.
    const plain = await openSlot3(null, true);
    await swatch(plain, "Schwarz");
    expect(find(plain, "dialog .dlg-warn")).toBeNull();
  });

  it("the selects stay as BamBuddy set the slot", async () => {
    const card = await openSlot3(GEEETECH, true);
    const vendor = find<HTMLSelectElement>(card, "dialog select#fil-vendor");
    const filament = find<HTMLSelectElement>(card, "dialog select#fil-filament");
    expect(vendor?.selectedOptions[0]?.text).toBe("Generic");
    expect(filament?.selectedOptions[0]?.text).toBe("PLA behalten");
  });
});

describe("the pencil of an empty or busy slot", () => {
  const pencils = (card: FakeCard): boolean[] => findAll(card, ".slot").map((row) => row.querySelector(".btn.edit") !== null);

  it("an empty slot offers the inventory where it may be assigned or holds a spool", async () => {
    for (const [spool, assignable, shown] of [
      [null, false, false],
      [null, true, true],
      [GEEETECH, false, true],
    ] as const) {
      const devices = assign(x1c(), X1C_SLOT_4, spool, assignable);
      absent(devices);
      const card = await mount(devices, "dev-x1c");
      await showView(card, "Filament");
      expect(pencils(card)[3]).toBe(shown);
    }
  });

  it("an empty slot's dialog is the inventory alone, without the switch", async () => {
    const devices = assign(x1c(), X1C_SLOT_4, GEEETECH, true);
    absent(devices);
    const card = await mount(devices, "dev-x1c");
    await showView(card, "Filament");
    await editSlot(card, 3);

    expect(findAll(card, "dialog [role=tablist]")).toHaveLength(0);
    expect(find(card, "dialog .inv-card")).not.toBeNull();
    expect(find(card, "dialog select#fil-vendor")).toBeNull();
  });

  it("the slot the running print feeds is set too, with a warning that it changes mid-print", async () => {
    const devices = withoutChip(assign(x1c(), "sensor.dev-x1c_ams_0_slot_2", GEEETECH, true));
    const card = await mount(devices, "dev-x1c");
    await showView(card, "Filament");
    expect(pencils(card)[1]).toBe(true);
    await editSlot(card, 1);
    expect(tabs(card).map(text)).toEqual(["Filament einstellen", "Aus dem Inventar"]);
    expect(find(card, "dialog select#fil-vendor")).not.toBeNull();
    // Its tools wait for the print.
    expect(findAll<HTMLButtonElement>(card, "dialog .slot-tools .btn").every((button) => button.disabled)).toBe(true);
    expect(find(card, "dialog .dlg-warn")).toBeNull();
    // Another colour: it changes mid-print, and ends the spool's assignment.
    (findAll<HTMLButtonElement>(card, "dialog [role=radiogroup] [role=radio]").find((item) => item.getAttribute("aria-label") === "Schwarz") as HTMLButtonElement).click();
    await settle(card);
    expect(findAll(card, "dialog .dlg-actions .dlg-warn").map(text)).toEqual([
      "Workshop druckt gerade aus diesem Fach. Übernehmen stellt es mitten im Druck um.",
      "Übernehmen hebt die Zuweisung von Geeetech PLA Basic auf.",
    ]);

    // Without the inventory too: its filament can be set.
    const plain = await mount(withoutChip(assign(x1c(), "sensor.dev-x1c_ams_0_slot_2", null, false)), "dev-x1c");
    await showView(plain, "Filament");
    expect(pencils(plain)[1]).toBe(true);
  });
});

// --- The inventory tab -------------------------------------------------------

const FOUR = [
  { id: 1, name: "Geeetech PLA Basic", material: "PLA", color_name: "Apple Green", rgba: "B6D648FF", remaining_g: 886, remaining_pct: 89, place: { this_slot: true } },
  { id: 2, name: "Bambu PLA Basic", material: "PLA", place: { printer_id: 1, printer_name: "Workshop", ams_id: 0, tray_id: 0, ams_label: null, same_printer: true } },
  { id: 3, name: "eSUN PETG", material: "PETG", place: { printer_id: 99, printer_name: "Desk", ams_id: 0, tray_id: 1, ams_label: null, same_printer: false } },
  { id: 4, name: "Sunlu TPU 95A", material: "TPU", fits: "not_for_ams" },
].map(listed);

interface Hold {
  release?: () => void;
}

/** The card's hass answers get_spools with `spools`; `hold` keeps the
 * answer back until released. */
function spoolAnswer(spools: Record<string, unknown>[], assigned: number | null = 1, hold?: Hold): FakeHassOptions["callService"] {
  return async (call) => {
    if (call.service !== "get_spools") return undefined;
    if (hold) await new Promise<void>((resolve) => (hold.release = resolve));
    return { response: { assigned, spools } };
  };
}

interface OpenOptions {
  /** Leaves the filters folded, as the tab opens. */
  folded?: boolean;
  assigned?: number | null;
  slot?: number;
  spool?: Record<string, unknown> | null;
  hold?: Hold;
  devices?: FakeDevice[];
}

const SLOTS = ["sensor.dev-x1c_ams_0_slot_1", "sensor.dev-x1c_ams_0_slot_2", "sensor.dev-x1c_ams_0_slot_3", "sensor.dev-x1c_ams_0_slot_4"];

async function openInventory(spools = FOUR, options: OpenOptions = {}): Promise<FakeCard> {
  const slot = options.slot ?? 2;
  const devices = options.devices ?? assign(x1c(), SLOTS[slot] as string, options.spool === undefined ? GEEETECH : options.spool, true);
  const card = await mount(devices, "dev-x1c", { callService: spoolAnswer(spools, options.assigned === undefined ? 1 : options.assigned, options.hold) });
  await showView(card, "Filament");
  await editSlot(card, slot);
  const tab = tabs(card).find((item) => text(item) === "Aus dem Inventar");
  if (tab) {
    tab.click();
    await settle(card);
  }
  await settle(card);
  // The filters fold behind their button: the tests of the filters open them.
  const filters = find<HTMLButtonElement>(card, "dialog .inv-filter");
  if (filters && !options.folded) {
    filters.click();
    await settle(card);
  }
  return card;
}

type Calls = { service: string; data?: Record<string, unknown>; returnResponse?: boolean }[];
const callsOf = (card: FakeCard): Calls => (card.hass as FakeHass).calls;
const rows = (card: FakeCard): HTMLElement[] => findAll(card, "dialog .inv-row");
const rowName = (row: Element): string => text(row.querySelector(".inv-name"));
const where = (row: Element | undefined): string => text(row?.querySelector(".inv-where"));
const rowNamed = (card: FakeCard, name: string): HTMLElement => rows(card).find((row) => rowName(row) === name) as HTMLElement;
const dialogButton = (card: FakeCard, name: string): HTMLButtonElement | undefined =>
  findAll<HTMLButtonElement>(card, "dialog .dlg-actions .btn, dialog .inv-card .inv-unassign").find((item) => text(item) === name);

describe("the inventory tab", () => {
  it("reads the spools when the tab opens", async () => {
    const hold: Hold = {};
    const card = await openInventory(FOUR, { hold });
    expect(find(card, "dialog .inv-wait")).not.toBeNull();
    hold.release?.();
    await settle(card);
    await settle(card);

    const asked = callsOf(card).filter((call) => call.service === "get_spools");
    expect(asked).toHaveLength(1);
    expect(asked[0]?.returnResponse).toBe(true);
    expect(find(card, "dialog .inv-wait")).toBeNull();
    expect(find(card, 'dialog [role=radiogroup][aria-label="Spule wählen"]')).not.toBeNull();
  });

  it("groups by material, the slot's spool first", async () => {
    const card = await openInventory();
    // BamBuddy's material order; the slot's spool first in its group.
    expect(findAll(card, "dialog .inv-group").map(text)).toEqual(["PETG", "PLA", "TPU"]);
    expect(rows(card).map(rowName)).toEqual(["eSUN PETG", "Geeetech PLA Basic", "Bambu PLA Basic", "Sunlu TPU 95A"]);
    const first = rows(card)[1] as HTMLElement;
    expect(first.getAttribute("aria-checked")).toBe("true");
    expect(where(first)).toBe("Zugewiesen: dieses Fach");
    expect(first.querySelector(".inv-where")?.classList.contains("here")).toBe(true);
  });

  it("names other places", async () => {
    const place = (ams_id: number, tray_id: number, extra: Record<string, unknown> = {}) => ({ printer_id: 1, printer_name: "Workshop", ams_id, tray_id, ams_label: null, same_printer: true, ...extra });
    const other = (ams_id: number, tray_id: number) => ({ ...place(ams_id, tray_id), printer_id: 99, printer_name: "Desk", same_printer: false });
    const spools = [
      { id: 11, name: "A", material: "PLA", place: place(0, 0) },
      { id: 12, name: "B", material: "PLA", place: place(0, 1, { ams_label: "Werkstatt Silk" }) },
      { id: 13, name: "C", material: "PLA", place: place(255, 0) },
      { id: 14, name: "D", material: "PLA", place: other(0, 1) },
      { id: 15, name: "E", material: "PLA", place: { ...other(255, 1), side: "right" } },
      { id: 16, name: "F", material: "PLA", place: other(128, 0) },
      { id: 17, name: "G", material: "PLA", place: other(6, 1) },
      { id: 18, name: "H", material: "PLA", place: other(255, 0) },
    ].map(listed);
    const card = await openInventory(spools, { assigned: null, spool: null });
    expect(rows(card).map(where)).toEqual([
      "Zugewiesen: AMS\u00a0A, Fach 1",
      "Zugewiesen: Werkstatt Silk, Fach 2",
      "Zugewiesen: externe Spule",
      "Zugewiesen: Desk, AMS\u00a0A, Fach 2",
      "Zugewiesen: Desk, externe Spule (rechts)",
      "Zugewiesen: Desk, AMS\u00a0HT\u00a0A",
      "Zugewiesen: Desk, AMS Lite, Fach 2",
      "Zugewiesen: Desk, externe Spule",
    ]);
    expect(rows(card).every((row) => row.querySelector(".inv-where")?.classList.contains("elsewhere"))).toBe(true);
  });

  it("names another printer's inputs and external spools as the integration tells them", async () => {
    const other = (tray_id: number, extra: Record<string, unknown> = {}) => ({ printer_id: 99, printer_name: "Desk", ams_id: 255, tray_id, ams_label: null, same_printer: false, ...extra });
    const spools = [
      { id: 11, name: "A", material: "PLA", place: other(1, { input: 1 }) },
      { id: 12, name: "B", material: "PLA", place: other(5, { input: 6 }) },
      { id: 13, name: "C", material: "PLA", place: other(0, { side: "left" }) },
      { id: 14, name: "D", material: "PLA", place: other(1, { side: "right" }) },
      { id: 15, name: "E", material: "PLA", place: other(0) },
    ].map(listed);
    const card = await openInventory(spools, { assigned: null, spool: null });
    expect(rows(card).map(where)).toEqual([
      "Zugewiesen: Desk, Extern 1",
      "Zugewiesen: Desk, Extern 6",
      "Zugewiesen: Desk, externe Spule (links)",
      "Zugewiesen: Desk, externe Spule (rechts)",
      "Zugewiesen: Desk, externe Spule",
    ]);
    rows(card)[1]?.click();
    await settle(card);
    expect(text(find(card, "dialog"))).toContain("Zuweisen nimmt die Spule aus dem Drucker Desk, Extern 6.");
  });

  it("the box names another printer's input", async () => {
    const also = [{ printer_id: 99, printer_name: "Desk", ams_id: 255, tray_id: 5, ams_label: null, same_printer: false, input: 6 }];
    const card = await openSlot3({ ...GEEETECH, also_assigned: also }, true);
    expect(findAll(card, "dialog .inv-card .inv-also").map(text)).toEqual(["Auch zugewiesen: Desk, Extern 6"]);
  });

  it("names the external spools of a two-nozzle printer by side", async () => {
    const place = (tray_id: number) => ({ printer_id: 4, printer_name: "Studio", ams_id: 255, tray_id, ams_label: null, same_printer: true });
    const devices = assign(h2d(), "sensor.h2d_left_external_spool", null, true);
    const spools = [listed({ id: 21, name: "A", material: "PLA", place: place(0) }), listed({ id: 22, name: "B", material: "PLA", place: place(1) })];
    const card = await mountCard(makeHass({ devices, language: "de", callService: spoolAnswer(spools, null) }), { printer: "dev-h2d" });
    await showView(card, "Filament");
    const row = findAll(card, ".slot").find((item) => text(item.querySelector(".slot-name")) === "PETG HF");
    (row?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
    tabs(card)[1]?.click();
    await settle(card);
    await settle(card);
    expect(rows(card).map(where)).toEqual(["Zugewiesen: externe Spule (links)", "Zugewiesen: externe Spule (rechts)"]);
  });

  it("greys out what does not fit", async () => {
    const card = await openInventory();
    const tpu = rows(card).find((row) => rowName(row) === "Sunlu TPU 95A") as HTMLElement;
    expect(tpu.getAttribute("aria-disabled")).toBe("true");
    expect(where(tpu)).toBe("Nicht für das AMS");
    expect(tpu.querySelector(".inv-where")?.classList.contains("off")).toBe(true);
    tpu.click();
    await settle(card);
    expect(tpu.getAttribute("aria-checked")).toBe("false");
  });

  it("names every slot a spool is assigned to", async () => {
    const desk = { printer_id: 99, printer_name: "Desk", ams_id: 0, tray_id: 1, ams_label: null, same_printer: false };
    const spools = FOUR.map((spool) => (spool["id"] === 1 ? { ...spool, also: [desk] } : spool["id"] === 2 ? { ...spool, also: [{ ...desk, tray_id: 2 }] } : spool));
    const card = await openInventory(spools);
    expect([...rowNamed(card, "Geeetech PLA Basic").querySelectorAll(".inv-where")].map(text)).toEqual(["Zugewiesen: dieses Fach", "Zugewiesen: Desk, AMS\u00a0A, Fach 2"]);
    expect([...rowNamed(card, "Bambu PLA Basic").querySelectorAll(".inv-where")].map(text)).toEqual(["Zugewiesen: AMS\u00a0A, Fach 1", "Zugewiesen: Desk, AMS\u00a0A, Fach 3"]);
  });

  it("the box warns of the spool's other slots", async () => {
    const also = [{ printer_id: 99, printer_name: "Desk", ams_id: 0, tray_id: 1, ams_label: null, same_printer: false }];
    const card = await openSlot3({ ...GEEETECH, also_assigned: also }, true);
    expect(findAll(card, "dialog .inv-card .inv-also").map(text)).toEqual(["Auch zugewiesen: Desk, AMS\u00a0A, Fach 2"]);
    const single = await openSlot3(GEEETECH, true);
    expect(find(single, "dialog .inv-card .inv-also")).toBeNull();
  });

  it("greys out a spool BamBuddy links by its chip", async () => {
    const card = await openInventory([...FOUR, listed({ id: 9, name: "Bambu Lab ABS", material: "ABS", fits: "by_chip", place: { printer_id: 1, printer_name: "Workshop", ams_id: 0, tray_id: 0, ams_label: null, same_printer: true } })]);
    const row = rowNamed(card, "Bambu Lab ABS");
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect([...row.querySelectorAll(".inv-where")].map(text)).toEqual(["Zugewiesen: AMS\u00a0A, Fach 1", "Per Chip mit seinem Fach verknüpft"]);
  });

  it("locks a spool in a slot of another printer that prints", async () => {
    const card = await openInventory([...FOUR, listed({ id: 9, name: "eSUN PLA+", material: "PLA", fits: "printing", printing: "Desk", place: { printer_id: 99, printer_name: "Desk", ams_id: 0, tray_id: 2, ams_label: null, same_printer: false } })]);
    const row = rowNamed(card, "eSUN PLA+");
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(text(row.querySelector(".inv-where.off"))).toBe("Gesperrt, solange Desk druckt.");
  });

  it("filters and search from five spools", async () => {
    const few = await openInventory();
    expect(find(few, "dialog #inv-vendor")).toBeNull();
    expect(find(few, "dialog #inv-search")).toBeNull();

    const more = [5, 6, 7, 8, 9, 10, 11].map((id) =>
      listed({ id, name: "Geeetech PLA", brand: id % 2 || id === 11 ? "Geeetech" : "GEEETECH", material: "PLA", color_name: id === 5 ? "Grün" : "Black" }),
    );
    const card = await openInventory([...FOUR, ...more]);
    const vendor = find<HTMLSelectElement>(card, "dialog #inv-vendor") as HTMLSelectElement;
    const material = find<HTMLSelectElement>(card, "dialog #inv-material") as HTMLSelectElement;
    expect([...vendor.options].map((option) => option.text)).toEqual(["Alle", "Bambu", "eSUN", "Geeetech", "Sunlu"]);
    expect([...material.options].map((option) => option.text)).toEqual(["Alle", "PETG", "PLA", "TPU"]);

    await chooseOption(card, "#inv-material", "PETG");
    expect(rows(card).map(rowName)).toEqual(["eSUN PETG"]);
    await chooseOption(card, "#inv-material", "");
    await chooseOption(card, "#inv-vendor", "geeetech");
    expect(rows(card).map((row) => Number(row.dataset["spool"]))).toEqual([1, 5, 6, 7, 8, 9, 10, 11]);
    await chooseOption(card, "#inv-vendor", "");

    const search = find<HTMLInputElement>(card, "dialog #inv-search") as HTMLInputElement;
    for (const [query, ids] of [
      ["grün", [5]],
      ["Nr. 5", [5]],
      ["5", [5]],
      ["xyz", []],
    ] as const) {
      search.value = query;
      search.dispatchEvent(new Event("input"));
      await settle(card);
      expect(rows(card).map((row) => Number(row.dataset["spool"]))).toEqual(ids);
    }
    expect(text(find(card, "dialog"))).toContain("Keine Spule passt zur Suche.");
  });

  it("the split dot of a multicolour spool", async () => {
    const card = await openInventory([listed({ id: 1, name: "Rainbow", material: "PLA", rgba: "FF0000FF", extra_colors: ["00FF00", "0000FF"], place: { this_slot: true } })]);
    const dot = rows(card)[0]?.querySelector(".spool-dot");
    expect(dot?.getAttribute("data-colors")).toBe("3");
    expect(dot?.getAttribute("style")).toContain("conic-gradient");
  });

  it("notes the move and the empty slot", async () => {
    const card = await openInventory();
    rowNamed(card, "Bambu PLA Basic").click();
    await settle(card);
    expect(text(find(card, "dialog"))).toContain("Zuweisen nimmt die Spule aus AMS\u00a0A, Fach 1.");
    (rows(card).find((row) => rowName(row) === "eSUN PETG") as HTMLElement).click();
    await settle(card);
    expect(text(find(card, "dialog"))).toContain("Zuweisen nimmt die Spule aus dem Drucker Desk, AMS\u00a0A, Fach 2.");

    const devices = assign(x1c(), X1C_SLOT_4, null, true);
    absent(devices);
    const empty = await openInventory(FOUR, { slot: 3, devices, assigned: null });
    expect(text(find(empty, "dialog"))).toContain("Das Fach ist leer. BamBuddy stellt es ein, sobald die Spule drin ist.");
  });

  it("assigns and removes", async () => {
    const card = await openInventory();
    expect(dialogButton(card, "Zuweisen")?.disabled).toBe(true);
    rowNamed(card, "Bambu PLA Basic").click();
    await settle(card);
    expect(dialogButton(card, "Zuweisen")?.disabled).toBe(false);
    dialogButton(card, "Zuweisen")?.click();
    await settle(card);
    expect(callsOf(card).find((call) => call.service === "assign_spool")?.data).toEqual({ entity_id: X1C_SLOT_3, spool_id: 2 });
    expect(find(card, "dialog")).toBeNull();

    const again = await openInventory();
    dialogButton(again, "Zuweisung aufheben")?.click();
    await settle(again);
    expect(callsOf(again).find((call) => call.service === "unassign_spool")?.data).toEqual({ entity_id: X1C_SLOT_3 });

    const none = await openInventory(
      FOUR.map((spool) => ({ ...spool, place: null })),
      { assigned: null, spool: null },
    );
    expect(dialogButton(none, "Zuweisung aufheben")).toBeUndefined();
  });

  it("lets the slot a running print feeds take a spool, as BamBuddy does", async () => {
    const card = await openInventory(FOUR, { slot: 1, assigned: null, devices: withoutChip(assign(x1c(), "sensor.dev-x1c_ams_0_slot_2", null, true)) });
    rowNamed(card, "Bambu PLA Basic").click();
    await settle(card);
    expect(dialogButton(card, "Zuweisen")?.disabled).toBe(false);
    expect(find(card, "dialog .dlg-need")).toBeNull();
    // The same material: the spool's colour and profile still change mid-print.
    expect(findAll(card, "dialog .dlg-actions .dlg-warn").map(text)).toEqual([
      "Workshop druckt gerade aus diesem Fach. Zuweisen stellt es mitten im Druck um.",
    ]);
    // Another material: it switches mid-print -- that line alone.
    rowNamed(card, "eSUN PETG").click();
    await settle(card);
    expect(dialogButton(card, "Zuweisen")?.disabled).toBe(false);
    expect(findAll(card, "dialog .dlg-actions .dlg-warn").map(text)).toEqual([
      "Workshop druckt gerade aus diesem Fach (PLA). Zuweisen stellt es mitten im Druck auf PETG um.",
    ]);
  });

  it("warns of no mid-print change for the slot's own spool", async () => {
    const card = await openInventory(FOUR, { slot: 1, devices: withoutChip(assign(x1c(), "sensor.dev-x1c_ams_0_slot_2", GEEETECH, true)) });
    rowNamed(card, "Geeetech PLA Basic").click();
    await settle(card);
    expect(find(card, "dialog .dlg-warn")).toBeNull();
  });

  it("warns of no mid-print change where no print feeds the slot", async () => {
    const card = await openInventory(FOUR, { slot: 1, assigned: null, devices: withoutChip(assign(x1c({ status: "paused", stage: "paused_by_user" }), "sensor.dev-x1c_ams_0_slot_2", null, true)) });
    rowNamed(card, "Bambu PLA Basic").click();
    await settle(card);
    expect(find(card, "dialog .dlg-warn")).toBeNull();
  });

  /** The X1C with its slot 4 empty and open to assigning. */
  const emptySlot4 = (): FakeDevice[] => {
    const devices = assign(x1c(), X1C_SLOT_4, null, true);
    for (const entity of devices.flatMap((device) => device.entities)) {
      if (entity.entityId === X1C_SLOT_4) {
        entity.state = "empty";
        entity.attributes = { ...entity.attributes, empty: true, present: false, type: "", name: "" };
      }
    }
    return devices;
  };

  it("warns where the spool's material differs from the slot's", async () => {
    const spools = [...FOUR, listed({ id: 9, name: "Sunlu PLA+", material: "PLA+", type: "PLA" })];
    const card = await openInventory(spools, { assigned: null });
    rowNamed(card, "eSUN PETG").click();
    await settle(card);
    expect(text(find(card, "dialog .dlg-actions .dlg-warn"))).toBe("Die Spule ist PETG, das Fach ist auf PLA eingestellt. Zuweisen stellt das Fach auf PETG um.");
    // PLA+ is PLA to BamBuddy: no warning.
    rowNamed(card, "Sunlu PLA+").click();
    await settle(card);
    expect(find(card, "dialog .dlg-warn")).toBeNull();
    // A spool whose type the integration did not name: nothing to compare.
    const untyped = await openInventory([...FOUR, listed({ id: 9, name: "Mystery", material: "PETG", type: "" })], { assigned: null });
    rowNamed(untyped, "Mystery").click();
    await settle(untyped);
    expect(find(untyped, "dialog .dlg-warn")).toBeNull();
    // A TPU spool in a slot set to TPU for AMS ("TPU-AMS"): the same type.
    const tpu = assign(x1c(), X1C_SLOT_3, null, true);
    for (const entity of tpu.flatMap((device) => device.entities)) {
      if (entity.entityId === X1C_SLOT_3) entity.attributes = { ...entity.attributes, type: "TPU-AMS" };
    }
    const tpuCard = await openInventory([...FOUR, listed({ id: 9, name: "Overture TPU", material: "TPU" })], { assigned: null, devices: tpu });
    rowNamed(tpuCard, "Overture TPU").click();
    await settle(tpuCard);
    expect(find(tpuCard, "dialog .dlg-warn")).toBeNull();
    // An empty slot is set from whatever comes.
    const empty = await openInventory(FOUR, { slot: 3, assigned: null, devices: emptySlot4() });
    rowNamed(empty, "eSUN PETG").click();
    await settle(empty);
    expect(find(empty, "dialog .dlg-warn")).toBeNull();
  });

  it("moves the chosen spool with the arrow keys, past the ones that do not fit", async () => {
    const card = await openInventory();
    const key = async (name: string): Promise<void> => {
      (find(card, "dialog .inv-row[aria-checked=true]") as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
      await settle(card);
    };
    const chosen = (): string => rowName(find(card, "dialog .inv-row[aria-checked=true]") as HTMLElement);
    await key("ArrowDown");
    expect(chosen()).toBe("Bambu PLA Basic");
    // The TPU does not fit: the arrows pass it.
    await key("ArrowDown");
    expect(chosen()).toBe("eSUN PETG");
    await key("ArrowUp");
    expect(chosen()).toBe("Bambu PLA Basic");
    await key("Home");
    expect(chosen()).toBe("eSUN PETG");
    await key("End");
    expect(chosen()).toBe("Bambu PLA Basic");
  });

  it("drops a spool list that answers after the dialog closed", async () => {
    const hold: Hold = {};
    const card = await openInventory(FOUR, { hold });
    (find(card, "dialog .btn.safe") as HTMLButtonElement).click();
    await settle(card);
    await editSlot(card, 2);
    const late = hold.release;
    late?.();
    await settle(card);
    // The answer to the closed dialog stays out of the new one: its own
    // list is asked when its tab opens.
    tabs(card)[1]?.click();
    await settle(card);
    expect(rows(card)).toHaveLength(0);
    expect(find(card, "dialog .inv-wait")).not.toBeNull();
    expect(callsOf(card).filter((call) => call.service === "get_spools")).toHaveLength(2);
  });

  it("says when the inventory could not be read", async () => {
    const devices = assign(x1c(), X1C_SLOT_3, GEEETECH, true);
    const card = await mount(devices, "dev-x1c", {
      callService: async (call) => {
        if (call.service === "get_spools") throw new Error("nope");
        return undefined;
      },
    });
    await showView(card, "Filament");
    await editSlot(card, 2);
    tabs(card)[1]?.click();
    await settle(card);
    await settle(card);
    expect(text(find(card, "dialog"))).toContain("Das Inventar ließ sich nicht lesen. Um neu zu fragen, schließe den Dialog und öffne ihn noch einmal.");
    // Asked twice: once more on its own, as BamBuddy's own page does.
    expect(callsOf(card).filter((call) => call.service === "get_spools")).toHaveLength(2);
  });

  it("asks once more on its own when the list does not come", async () => {
    let calls = 0;
    const devices = assign(x1c(), X1C_SLOT_3, GEEETECH, true);
    const card = await mount(devices, "dev-x1c", {
      callService: async (call) => {
        if (call.service !== "get_spools") return undefined;
        calls += 1;
        if (calls === 1) throw new Error("nope");
        return { response: { assigned: 1, spools: FOUR } };
      },
    });
    await showView(card, "Filament");
    await editSlot(card, 2);
    tabs(card)[1]?.click();
    await settle(card);
    await settle(card);
    expect(calls).toBe(2);
    expect(text(find(card, "dialog"))).not.toContain("ließ sich nicht lesen");
    expect(rows(card).map(rowName)).toContain("eSUN PETG");
  });

  it("only the inventory tab's list scrolls on its own", () => {
    const css = styleText();
    expect(css).toMatch(/\.inv-list\s*\{[^}]*overflow-y:\s*auto/);
    const scrolling = [...css.matchAll(/([^{}]+)\{[^}]*overflow-y:\s*auto[^}]*\}/g)].map((match) => (match[1] as string).trim());
    expect(scrolling.filter((selector) => /dialog|\.dlg|\.inv/.test(selector))).toEqual([".inv-list"]);
  });
});

describe("the inventory tab follows the slot", () => {
  it("drops „In diesem Fach“ when BamBuddy unlinks the spool meanwhile, and names a spool linked meanwhile", async () => {
    const card = await openInventory();
    expect(where(rowNamed(card, "Geeetech PLA Basic"))).toBe("Zugewiesen: dieses Fach");
    const state = (card.hass as FakeHass).states[X1C_SLOT_3] as { state: string; attributes: Record<string, unknown> };
    const { inventory_spool: _gone, ...rest } = state.attributes;
    card.hass = (card.hass as FakeHass).withState(X1C_SLOT_3, state.state, rest);
    await settle(card);

    expect(where(rowNamed(card, "Geeetech PLA Basic"))).toBe("");
    expect(dialogButton(card, "Zuweisung aufheben")).toBeUndefined();
    rowNamed(card, "Geeetech PLA Basic").click();
    await settle(card);
    expect(dialogButton(card, "Zuweisen")?.disabled).toBe(false);

    card.hass = (card.hass as FakeHass).withState(X1C_SLOT_3, state.state, { ...rest, inventory_spool: { ...GEEETECH, id: 2, name: "Bambu PLA Basic" } });
    await settle(card);
    expect(where(rowNamed(card, "Bambu PLA Basic"))).toBe("Zugewiesen: dieses Fach");
    expect(dialogButton(card, "Zuweisung aufheben")).toBeDefined();
  });

  it("names the slot's own spool where it is, and why it does not fit", async () => {
    const spools = FOUR.map((spool) => (spool["id"] === 4 ? { ...spool, place: { this_slot: true } } : spool["id"] === 1 ? { ...spool, place: null } : spool));
    const card = await openInventory(spools, { assigned: 4, spool: { ...GEEETECH, id: 4, name: "Sunlu TPU 95A" } });
    const row = rowNamed(card, "Sunlu TPU 95A");
    expect([...row.querySelectorAll(".inv-where")].map(text)).toEqual(["Zugewiesen: dieses Fach", "Nicht für das AMS"]);
  });

  it("a row that does not fit takes no focus", async () => {
    const card = await openInventory();
    expect(rowNamed(card, "Sunlu TPU 95A").hasAttribute("tabindex")).toBe(false);
  });
});

describe("a chip spool and the inventory", () => {
  it("the slot a running print feeds from a chip spool has no pencil", async () => {
    const devices = assign(x1c(), "sensor.dev-x1c_ams_0_slot_2", { ...GEEETECH, rfid: true }, true);
    const card = await mount(devices, "dev-x1c");
    await showView(card, "Filament");
    expect(findAll(card, ".slot")[1]?.querySelector(".btn.edit")).toBeNull();
  });

  it("a spool BamBuddy linked by hand to a slot without a chip is no chip spool", async () => {
    const card = await openSlot3({ ...GEEETECH, rfid: true }, true);
    expect(text(find(card, "dialog .inv-card .inv-from"))).toBe("Zugewiesene Spule aus dem Inventar");
  });
});

describe("the filters, the search and the list's details", () => {
  it("draws the filters as the card's selects", async () => {
    const more = [5, 6, 7, 8, 9].map((id) => listed({ id, name: "Geeetech PLA", material: "PLA" }));
    const card = await openInventory([...FOUR, ...more]);
    for (const id of ["inv-vendor", "inv-material"]) {
      const select = find(card, `dialog #${id}`);
      expect(select?.parentElement?.classList.contains("select")).toBe(true);
      expect(select?.parentElement?.querySelector(".icon")).not.toBeNull();
    }
  });

  it("the filters narrow each other: a vendor its materials, a material its vendors; the search neither", async () => {
    const more = [
      listed({ id: 5, name: "Geeetech PLA", brand: "Geeetech", material: "PLA" }),
      listed({ id: 6, name: "Geeetech PETG", brand: "Geeetech", material: "PETG" }),
      listed({ id: 7, name: "eSUN ePLA", brand: "eSUN", material: "ePLA" }),
    ];
    const card = await openInventory([...FOUR, ...more]);
    const options = (id: string): string[] => [...(find<HTMLSelectElement>(card, `dialog #${id}`) as HTMLSelectElement).options].map((option) => option.text);
    expect(options("inv-material")).toEqual(["Alle", "ePLA", "PETG", "PLA", "TPU"]);

    await chooseOption(card, "#inv-vendor", "geeetech");
    expect(options("inv-material")).toEqual(["Alle", "PETG", "PLA"]);
    expect(options("inv-vendor")).toEqual(["Alle", "Bambu", "eSUN", "Geeetech", "Sunlu"]);

    await chooseOption(card, "#inv-vendor", "");
    await chooseOption(card, "#inv-material", "PETG");
    expect(options("inv-vendor")).toEqual(["Alle", "eSUN", "Geeetech"]);

    const search = find<HTMLInputElement>(card, "dialog #inv-search") as HTMLInputElement;
    search.value = "zzz";
    search.dispatchEvent(new Event("input"));
    await settle(card);
    expect(options("inv-vendor")).toEqual(["Alle", "eSUN", "Geeetech"]);
  });

  it("a vendor keeps the spelling most of its spools carry, whatever the material", async () => {
    const more = [
      listed({ id: 5, name: "Geeetech PLA", brand: "Geeetech", material: "PLA" }),
      listed({ id: 6, name: "Geeetech PLA", brand: "Geeetech", material: "PLA" }),
      listed({ id: 7, name: "GEEETECH PETG", brand: "GEEETECH", material: "PETG" }),
    ];
    const card = await openInventory([...FOUR, ...more]);
    await chooseOption(card, "#inv-material", "PETG");
    expect([...(find<HTMLSelectElement>(card, "dialog #inv-vendor") as HTMLSelectElement).options].map((option) => option.text)).toEqual(["Alle", "eSUN", "Geeetech"]);
  });

  it("a filter the other no longer leaves goes back to Alle", async () => {
    const more = [listed({ id: 5, name: "Geeetech PLA", brand: "Geeetech", material: "PLA" }), listed({ id: 7, name: "eSUN ePLA", brand: "eSUN", material: "ePLA" })];
    const card = await openInventory([...FOUR, ...more]);
    await chooseOption(card, "#inv-vendor", "geeetech");
    // The inventory changed meanwhile: the material chosen before has none of this vendor.
    const material = find<HTMLSelectElement>(card, "dialog #inv-material") as HTMLSelectElement;
    expect([...material.options].map((option) => option.value)).not.toContain("ePLA");
    expect(rows(card).map(rowName)).toEqual(["Geeetech PLA Basic", "Geeetech PLA"]);
  });

  it("searches word by word: every word somewhere, in any order and part of a word", async () => {
    const more = [
      listed({ id: 5, name: "GEEETECH PETG Basic", brand: "GEEETECH", material: "PETG", color_name: "Apple Green" }),
      listed({ id: 6, name: "GEEETECH PETG Basic", brand: "GEEETECH", material: "PETG", color_name: "Black" }),
      listed({ id: 7, name: "Bambu Lab PLA Basic", brand: "Bambu Lab", material: "PLA", color_name: "Jade White" }),
      listed({ id: 8, name: "Sunlu TPU 95A", brand: "Sunlu", material: "TPU", color_name: "Red" }),
      listed({ id: 9, name: "Geeetech PLA", brand: "Geeetech", material: "PLA", color_name: "Green", storage_location: "Regal A2" }),
    ];
    const card = await openInventory([...FOUR, ...more], { assigned: null, spool: null });
    const search = find<HTMLInputElement>(card, "dialog #inv-search") as HTMLInputElement;
    for (const [query, ids] of [
      ["Geeetech basic", [1, 5, 6]],
      ["Geeetech green", [1, 5, 9]],
      ["basic green petg", [5]],
      ["gree", [1, 5, 9]],
      ["95a", [4, 8]],
      ["regal a2", [9]],
      ["Nr. 7", [7]],
      ["Nr.7", [7]],
      ["7", [7]],
      ["geeetech 7", []],
    ] as const) {
      search.value = query;
      search.dispatchEvent(new Event("input"));
      await settle(card);
      expect(rows(card).map((row) => Number(row.dataset["spool"])).sort((a, b) => a - b), query).toEqual([...ids]);
    }
  });

  it("keeps a spool and a half of the list at least", () => {
    expect(styleText()).toMatch(/\.inv-list\.many\s*\{[^}]*min-height:\s*min\(140px, 30dvh\)/);
  });

  it("puts each filter's label above its select", () => {
    expect(styleText()).toMatch(/\.inv-filters \.field\s*\{[^}]*flex-direction:\s*column/);
  });

  it("on a short screen lets the dialog scroll as a whole, the list keeping a cap of its own", () => {
    const short = atRule("@media (max-height: 560px)");
    expect(short).toMatch(/\.dlg-body:has\(\.inv-list\)\s*\{[^}]*max-height:\s*none/);
    expect(short).toMatch(/\.inv-list\s*\{[^}]*max-height:\s*max\(180px, 45dvh\)/);
    // And where the card finds the list's least would not fit, the same.
    expect(styleText()).toMatch(/\.dlg-body\.inv-short:has\(\.inv-list\)\s*\{[^}]*max-height:\s*none/);
    expect(styleText()).toMatch(/\.dlg-body\.inv-short \.inv-list\s*\{[^}]*max-height:\s*max\(180px, 45dvh\)/);
  });

  it("keeps the dot with what stands before it, so that no line ends in it", async () => {
    const devices = assign(x1c(), "sensor.dev-x1c_ams_0_slot_2", { ...GEEETECH, rfid: true });
    const card = await mount(devices, "dev-x1c");
    await showView(card, "Filament");
    const line = (findAll(card, ".slot")[1]?.querySelectorAll(".slot-sub")[1]?.textContent ?? "").trim();
    expect(line).toBe(`In Gebrauch${NBSP}· 89${NBSP}%${NBSP}·${NBSP}886${NBSP}g`);
  });

  it("scrolls the slot's own spool into the list's view", async () => {
    const seen: string[] = [];
    const real = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      seen.push(this.querySelector(".inv-name")?.textContent ?? "");
    };
    try {
      await openInventory();
    } finally {
      Element.prototype.scrollIntoView = real;
    }
    expect(seen).toContain("Geeetech PLA Basic");
  });

  it("writes color as the card does", () => {
    expect(en.inv_note_change).toBe("Another color or another type (PETG instead of PLA, say) ends the spool's assignment.");
    expect(en.inv_search).toBe("Name, color, location, no.");
  });
});

describe("the list after a new search or filter", () => {
  const MANY = Array.from({ length: 8 }, (_, index) => listed({ id: index + 1, name: `Spule ${index + 1}`, material: index ? "PLA" : "PETG" }));
  const box = (card: FakeCard): HTMLElement => find<HTMLElement>(card, "dialog .inv-list") as HTMLElement;
  const said = (card: FakeCard): string => text(find(card, "dialog .inv-say"));
  const type = async (card: FakeCard, query: string): Promise<void> => {
    const search = find<HTMLInputElement>(card, "dialog #inv-search") as HTMLInputElement;
    search.value = query;
    search.dispatchEvent(new Event("input"));
    await card.updateComplete;
    await Promise.resolve();
  };
  const later = async (card: FakeCard, ms: number): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms);
    await card.updateComplete;
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("goes to its top on a new search", async () => {
    const card = await openInventory(MANY);
    box(card).scrollTop = 300;
    await type(card, "Spule");
    expect(box(card).scrollTop).toBe(0);
  });

  it("goes to its top on a new filter", async () => {
    const card = await openInventory(MANY);
    box(card).scrollTop = 300;
    await chooseOption(card, "#inv-material", "PLA");
    expect(box(card).scrollTop).toBe(0);
  });

  it("says what it found a second after the last change", async () => {
    const card = await openInventory(MANY);
    vi.useFakeTimers();
    await type(card, "Spule");
    expect(said(card)).toBe("");
    await later(card, 900);
    await type(card, "PLA");
    await later(card, 900);
    expect(said(card)).toBe("");
    await later(card, 100);
    expect(said(card)).toBe("7 Spulen gefunden.");

    await type(card, "PETG");
    expect(said(card)).toBe("");
    await later(card, 1000);
    expect(said(card)).toBe("1 Spule gefunden.");

    await type(card, "xyz");
    await later(card, 1000);
    expect(said(card)).toBe("Keine Spule passt zur Suche.");
  });

  it("leaves no timer behind a dialog closed in the meantime", async () => {
    const card = await openInventory(MANY);
    vi.useFakeTimers();
    await type(card, "Spule");
    dialogButton(card, "Abbrechen")?.click();
    await card.updateComplete;
    expect(vi.getTimerCount()).toBe(0);
    expect(find(card, "dialog[open]")).toBeNull();
  });

  it("says nothing of a search into another slot's dialog opened within its second", async () => {
    const devices = assign(assign(x1c(), SLOTS[2] as string, GEEETECH), SLOTS[3] as string, null);
    const card = await openInventory(MANY, { devices });
    vi.useFakeTimers();
    await type(card, "Spule");
    await later(card, 500);
    // The other slot's dialog comes while the search's second still runs.
    (findAll(card, ".slot")[3]?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await card.updateComplete;
    tabs(card).find((item) => text(item) === "Aus dem Inventar")?.click();
    await later(card, 100);
    expect(text(find(card, "dialog h2"))).toContain("Fach 4");
    expect(rows(card)).toHaveLength(MANY.length);
    await later(card, 900);
    expect(said(card)).toBe("");
    // Its own search says what it found.
    await type(card, "PETG");
    await later(card, 1000);
    expect(said(card)).toBe("1 Spule gefunden.");
  });

  it("takes #84 as the spool's number, #abc as text", async () => {
    const card = await openInventory([...MANY, listed({ id: 84, name: "Nummer", material: "PLA" }), listed({ id: 85, name: "Farbe #abc", material: "PLA" })]);
    await type(card, "#84");
    await settle(card);
    expect(rows(card).map(rowName)).toEqual(["Nummer"]);
    await type(card, "#abc");
    await settle(card);
    expect(rows(card).map(rowName)).toEqual(["Farbe #abc"]);
  });
});

describe("the switch's tabs", () => {
  it("carry aria-selected only, and point at a panel that is there", async () => {
    const card = await openSlot3(GEEETECH, true);
    for (const tab of tabs(card)) expect(tab.hasAttribute("aria-checked")).toBe(false);
    expect(tabs(card)[0]?.hasAttribute("aria-controls")).toBe(false);
    tabs(card)[1]?.click();
    await settle(card);
    await settle(card);
    const controls = tabs(card)[1]?.getAttribute("aria-controls") as string;
    expect(find(card, `dialog #${controls}`)?.getAttribute("aria-labelledby")).toBe("inv-tab-inventory");
  });
});

describe("storage locations", () => {
  const SHELVES = [
    { id: 1, name: "Geeetech PLA Basic", material: "PLA", place: { this_slot: true }, storage_location: "Regal A" },
    { id: 2, name: "Bambu PLA Basic", material: "PLA", place: { printer_id: 1, printer_name: "Workshop", ams_id: 0, tray_id: 0, ams_label: null, same_printer: true }, storage_location: "Regal B" },
    { id: 3, name: "eSUN PETG", material: "PETG", storage_location: "Regal A" },
    { id: 4, name: "Sunlu PLA", material: "PLA", storage_location: "Trockenbox" },
    { id: 5, name: "Polymaker PLA", material: "PLA" },
    { id: 6, name: "Elegoo PETG", material: "PETG", storage_location: "Keller" },
  ].map(listed);
  const options = (card: FakeCard, id: string): string[] => [...(find<HTMLSelectElement>(card, `dialog #${id}`) as HTMLSelectElement).options].map((option) => option.text);

  it("a spool in no slot names its location as its place; the line above leaves it out", async () => {
    const card = await openInventory(SHELVES);
    const shelf = rowNamed(card, "eSUN PETG");
    expect(where(shelf)).toBe("Lagerort: Regal A");
    expect(shelf.querySelector(".inv-where")?.classList.contains("stored")).toBe(true);
    expect(text(shelf.querySelector(".inv-line"))).not.toContain("Regal A");
    expect(where(rowNamed(card, "Polymaker PLA"))).toBe("");
  });

  it("a spool in a slot names its location on a line of its own above its slot: BamBuddy keeps it", async () => {
    const card = await openInventory(SHELVES);
    const places = (name: string): string[] => [...rowNamed(card, name).querySelectorAll(".inv-where")].map(text);
    expect(text(rowNamed(card, "Bambu PLA Basic").querySelector(".inv-line"))).not.toContain("Regal B");
    expect(places("Bambu PLA Basic")).toEqual(["Lagerort: Regal B", "Zugewiesen: AMS\u00a0A, Fach 1"]);
    expect(places("Geeetech PLA Basic")).toEqual(["Lagerort: Regal A", "Zugewiesen: dieses Fach"]);
  });

  it("filters by location, narrowed with the others", async () => {
    const card = await openInventory(SHELVES);
    expect(options(card, "inv-location")).toEqual(["Alle", "Keller", "Regal A", "Regal B", "Trockenbox"]);
    await chooseOption(card, "#inv-location", "Regal A");
    expect(rows(card).map(rowName)).toEqual(["eSUN PETG", "Geeetech PLA Basic"]);
    expect(options(card, "inv-material")).toEqual(["Alle", "PETG", "PLA"]);
    await chooseOption(card, "#inv-material", "PLA");
    expect(rows(card).map(rowName)).toEqual(["Geeetech PLA Basic"]);
    await chooseOption(card, "#inv-location", "");
    expect(options(card, "inv-location")).toEqual(["Alle", "Regal A", "Regal B", "Trockenbox"]);
  });

  it("no location filter where no spool has a location", async () => {
    const card = await openInventory([...FOUR, listed({ id: 9, name: "Geeetech PLA", material: "PLA" })]);
    expect(find(card, "dialog #inv-vendor")).not.toBeNull();
    expect(find(card, "dialog #inv-location")).toBeNull();
  });

  it("the location field takes the whole row below the two others", () => {
    expect(styleText()).toMatch(/\.inv-filters \.field\.inv-wide\s*\{[^}]*grid-column:\s*1 \/ -1/);
  });
});

describe("the spool list by keyboard", () => {
  const LOCKED = [
    listed({ id: 31, name: "AAA chip ABS", material: "ABS", fits: "by_chip", place: { printer_id: 1, printer_name: "Workshop", ams_id: 0, tray_id: 0, ams_label: null, same_printer: true } }),
    listed({ id: 32, name: "AAB printing ABS", material: "ABS", fits: "printing", printing: "Desk", place: { printer_id: 99, printer_name: "Desk", ams_id: 0, tray_id: 2, ams_label: null, same_printer: false } }),
  ];
  it("comes back on a spool that can be chosen after the focus left the list", async () => {
    const card = await openInventory([...LOCKED, ...FOUR], { assigned: null });
    const all = rows(card);
    expect(all[0]?.getAttribute("aria-disabled")).toBe("true");
    const list = find(card, "dialog .inv-list") as HTMLElement;
    list.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: document.body }));
    const stop = all.find((row) => row.tabIndex === 0) as HTMLElement;
    expect(stop.getAttribute("aria-disabled")).toBe("false");
    for (const row of all.filter((item) => item.getAttribute("aria-disabled") === "true")) expect(row.tabIndex).toBe(-1);
    // From there the arrows move on.
    stop.focus();
    keyPress(stop, "ArrowDown");
    await settle(card);
    expect(root(card).activeElement).not.toBe(stop);
    expect((root(card).activeElement as HTMLElement).getAttribute("aria-disabled")).toBe("false");
  });

  it("falls back to the first spool when every spool is locked", async () => {
    const card = await openInventory(LOCKED, { assigned: null });
    const list = find(card, "dialog .inv-list") as HTMLElement;
    list.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: document.body }));
    expect(rows(card).map((row) => row.tabIndex)).toEqual([0, -1]);
  });
});

describe("room for the spool list", () => {
  const FIVE = [...FOUR, listed({ id: 5, name: "Polymaker PLA Matte", material: "PLA" })];

  it("marks the search field with a magnifier and names what it searches", async () => {
    const card = await openInventory(FIVE, { folded: true });
    const field = find(card, "dialog .inv-search-row .inv-search-box") as HTMLElement;
    const glass = field.querySelector(".inv-search-icon");
    expect(glass?.getAttribute("aria-hidden")).toBe("true");
    expect(glass?.querySelector("path")?.getAttribute("d")).toBe(ICONS.magnify);
    const search = field.querySelector("input") as HTMLInputElement;
    expect(search.placeholder).toBe("Name, Farbe, Ort, Nr.");
    expect(search.getAttribute("aria-label")).toBe("Name, Farbe, Ort, Nr.");
    // The text starts after the magnifier, which stays out of the taps' way.
    expect(declarations(".inv-search-box .inv-search", styleText())).toContain("padding-inline-start: 36px");
    expect(declarations(".inv-search-icon", styleText())).toEqual(expect.arrayContaining(["position: absolute", "pointer-events: none"]));
  });

  it("folds the filters behind a button beside the search", async () => {
    const card = await openInventory(FIVE, { folded: true });
    expect(find(card, "dialog .inv-filters")).toBeNull();
    const button = find<HTMLButtonElement>(card, "dialog .inv-search-row .inv-filter") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Filter");
    expect(button.getAttribute("title")).toBe("Filter");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.nextElementSibling?.classList.contains("inv-scan")).toBe(true);
    expect(button.previousElementSibling?.querySelector("input")?.id).toBe("inv-search");

    button.click();
    await settle(card);
    const filters = find(card, "dialog .inv-filters");
    expect(filters).not.toBeNull();
    expect(filters?.previousElementSibling?.classList.contains("inv-search-row")).toBe(true);
    expect(find(card, "dialog .inv-filter")?.getAttribute("aria-expanded")).toBe("true");
    expect(find(card, "dialog .inv-filter")?.getAttribute("aria-controls")).toBe(filters?.id);

    find<HTMLButtonElement>(card, "dialog .inv-filter")?.click();
    await settle(card);
    expect(find(card, "dialog .inv-filters")).toBeNull();
  });

  it("counts the filters set on the folded button", async () => {
    const card = await openInventory(FIVE);
    await chooseOption(card, "#inv-material", "PLA");
    find<HTMLButtonElement>(card, "dialog .inv-filter")?.click();
    await settle(card);
    const button = find(card, "dialog .inv-filter");
    expect(text(button?.querySelector(".inv-filter-count"))).toBe("1");
    expect(button?.getAttribute("aria-label")).toBe("Filter, 1 gesetzt");
    expect(rows(card).map(rowName)).toEqual(["Geeetech PLA Basic", "Bambu PLA Basic", "Polymaker PLA Matte"]);
  });

  it("puts „Zuweisung aufheben“ into the assigned spool's box, the buttons in one row", async () => {
    const card = await openInventory();
    const unassign = find(card, "dialog .inv-card .inv-unassign");
    expect(text(unassign)).toBe("Zuweisung aufheben");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Abbrechen", "Zuweisen"]);
    (unassign as HTMLButtonElement).click();
    await settle(card);
    expect(callsOf(card).find((call) => call.service === "unassign_spool")?.data).toEqual({ entity_id: X1C_SLOT_3 });
  });

  it("leaves the box of the filament tab without it", async () => {
    const card = await openSlot3(GEEETECH, true);
    expect(find(card, "dialog .inv-card")).not.toBeNull();
    expect(find(card, "dialog .inv-unassign")).toBeNull();
  });
});

describe("the inventory's styles", () => {
  it("take the card's accent tokens, each with its fallback", () => {
    const css = styleText();
    const lines = css.split("\n").filter((line) => !/^\s*--bb-(accent|on-accent):/.test(line));
    expect(lines.filter((line) => /var\(--primary-color\)|var\(--text-primary-color/.test(line))).toEqual([]);
  });
});
