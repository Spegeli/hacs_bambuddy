// The slot dialog's K field while the printer is asked and after its
// answer (2026-10-27): choosable from the start, a spinner while asked,
// orange after 5 s, a note for no profiles of its own, a warning for no
// answer; and the nozzle that feeds the slot under the dialog's title.
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { a1mini, h2d, makeHass, mountCard, x1c, type FakeCard, type FakeDevice, type FakeHassOptions } from "./fixtures";
import { find, findAll, NBSP, press, settle, showView, styleText, text } from "./helpers";

const PROFILES = {
  nozzle_diameter: 0.4,
  current: 3,
  answered: true,
  profiles: [
    { index: 1, name: "Generic PLA", k_value: 0.02, filament_id: "GFL99", nozzle: null },
    { index: 3, name: "Grey PLA matte", k_value: 0.018, filament_id: "GFL99", nozzle: null },
  ],
};
const NONE = { nozzle_diameter: 0.4, current: -1, profiles: [], answered: true };
const SILENT = { nozzle_diameter: 0.4, current: -1, profiles: [], answered: false };

/** The X1C idle: every slot may be set. */
const idle = (): FakeDevice[] => {
  const all = x1c({ status: "idle", stage: "idle" });
  for (const entity of (all[1] as FakeDevice).entities) {
    if ("attributes" in entity && entity.attributes) entity.attributes = { ...entity.attributes, active: false };
  }
  return all;
};

async function mount(devices: FakeDevice[], printer: string, options: Partial<FakeHassOptions> = {}): Promise<FakeCard> {
  return mountCard(makeHass({ devices, ...options }), { printer });
}

const answering =
  (response: unknown) =>
  async (call: { service: string }): Promise<unknown> =>
    call.service === "get_k_profiles" ? { response } : undefined;

/** The answer held back until the test lets it go. */
function holding(): { callService: FakeHassOptions["callService"]; answer: (response: unknown) => void } {
  let release: (value: unknown) => void = () => undefined;
  return {
    callService: async (call: { service: string }) => (call.service === "get_k_profiles" ? new Promise((resolve) => (release = resolve)) : undefined),
    answer: (response) => release({ response }),
  };
}

const editRow = async (card: FakeCard, row: number): Promise<void> => {
  (findAll(card, ".slot")[row]?.querySelector(".btn.edit") as HTMLButtonElement).click();
  await settle(card);
};
const kSelect = (card: FakeCard): HTMLSelectElement => find<HTMLSelectElement>(card, "dialog select#fil-k") as HTMLSelectElement;
const options = (card: FakeCard): string[] => [...kSelect(card).options].map((option) => option.text);
const hint = (card: FakeCard): Element | null => find(card, "dialog #k-hint");

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("the K field while the printer is asked", () => {
  it("can be chosen at once: the slot's own or the printer's default, beside a spinner", async () => {
    const held = holding();
    const card = await mount(idle(), "dev-x1c", { callService: held.callService });
    await showView(card, "Filament");
    await editRow(card, 2);

    expect(kSelect(card).disabled).toBe(false);
    expect(options(card)).toEqual(["Keep the slot's own", "Printer's default (K 0.020)"]);
    expect(kSelect(card).value).toBe("keep");
    expect(text(hint(card))).toBe("Asking the printer for its K profiles …");
    expect(find(card, "dialog #k-hint .check-spinner")).not.toBeNull();
    // Nothing to choose from yet: no advice on choosing.
    expect(text(find(card, "dialog .kfield"))).not.toContain("If unsure");

    held.answer(PROFILES);
    await settle(card);
    expect(options(card)).toEqual(["Keep Grey PLA matte (K 0.018)", "Printer's default (K 0.020)", "Generic PLA (K 0.020)"]);
    expect(text(hint(card))).toBe("If unsure, leave this as it is.");
    expect(find(card, "dialog #k-hint .check-spinner")).toBeNull();
  });

  it("keeps what was chosen while it asked", async () => {
    const held = holding();
    const card = await mount(idle(), "dev-x1c", { callService: held.callService });
    await showView(card, "Filament");
    await editRow(card, 2);
    kSelect(card).value = "-1";
    kSelect(card).dispatchEvent(new Event("change"));
    await card.updateComplete;

    held.answer(PROFILES);
    await settle(card);
    expect(kSelect(card).value).toBe("-1");
  });

  it("says after 5 seconds, in orange, that BamBuddy asks up to three times", async () => {
    const held = holding();
    const card = await mount(idle(), "dev-x1c", { callService: held.callService });
    await showView(card, "Filament");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    (findAll(card, ".slot")[2]?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(4900);
    await card.updateComplete;
    expect(find(card, "dialog #k-hint .k-wait.slow")).toBeNull();

    await vi.advanceTimersByTimeAsync(200);
    await card.updateComplete;
    expect(find(card, "dialog #k-hint .k-wait.slow")).not.toBeNull();
    expect(text(hint(card))).toBe("The printer does not answer at once. BamBuddy asks up to three times, which takes about 16 seconds at most.");
    expect(find(card, "dialog #k-hint .check-spinner")).not.toBeNull();
  });
});

describe("the K field after the answer", () => {
  it("says, as information, that the printer has no profiles of its own for its nozzle diameter", async () => {
    const card = await mount(idle(), "dev-x1c", { callService: answering(NONE) });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect(find(card, "dialog #k-hint .dlg-note.info")).not.toBeNull();
    expect(text(hint(card))).toBe(
      `No K profiles of your own are saved on the printer for the 0.4${NBSP}mm nozzle diameter. Profiles of your own, for example from the flow dynamics calibration in Bambu Studio or from BamBuddy, show here. Until then the printer uses its default.`,
    );
    const de = await mountCard(makeHass({ devices: idle(), language: "de", callService: answering({ ...NONE, nozzle_diameter: 0.6 }) }), { printer: "dev-x1c" });
    await showView(de, "Filament");
    await editRow(de, 2);
    expect(text(hint(de))).toBe(
      `Auf dem Drucker sind für den Düsendurchmesser 0,6${NBSP}mm keine eigenen K-Profile gespeichert. Eigene Profile, etwa aus der Flussdynamik-Kalibrierung in Bambu Studio oder aus BamBuddy, erscheinen hier. Bis dahin nimmt der Drucker seinen Standard.`,
    );
  });

  it("warns when the printer did not answer, and how to ask again", async () => {
    const card = await mount(idle(), "dev-x1c", { callService: answering(SILENT) });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect(find(card, "dialog #k-hint .dlg-note.warning")).not.toBeNull();
    expect(text(hint(card))).toBe("The printer did not answer in time. To ask again, close the dialog and open it once more.");
    const de = await mountCard(makeHass({ devices: idle(), language: "de", callService: answering(SILENT) }), { printer: "dev-x1c" });
    await showView(de, "Filament");
    await editRow(de, 2);
    expect(text(hint(de))).toBe("Der Drucker hat nicht rechtzeitig geantwortet. Um neu zu fragen, schließe den Dialog und öffne ihn noch einmal.");
  });
});

describe("the nozzle under the slot dialog's title", () => {
  const line = (card: FakeCard): string[] => findAll(card, "dialog .nozzle-line > span").map(text);

  it("names the one nozzle of a printer with one: diameter and type", async () => {
    const card = await mount(idle(), "dev-x1c", { callService: answering(PROFILES) });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect(line(card)).toEqual([`Nozzle: 0.4${NBSP}mm · Hardened steel`]);
    expect(find(card, "dialog .nozzle-line .icon")).not.toBeNull();
    // Also in a chip spool's dialog.
    const chip = await mount(idle(), "dev-x1c");
    await showView(chip, "Filament");
    await editRow(chip, 0);
    expect(line(chip)).toEqual([`Nozzle: 0.4${NBSP}mm · Hardened steel`]);
  });

  it("names the side of a printer with two: the unit's nozzle, an external spool's side", async () => {
    const left = { name: "PETG HF", type: "PETG", color: "#0A0A0A", remaining: null, trayId: 254 };
    const right = { name: "PLA Basic", type: "PLA", color: "#FFFFFF", remaining: null, trayId: 255 };
    const card = await mount(h2d({ status: "idle", stage: "idle", externalSpools: [left, right] }), "dev-h2d", { callService: answering(PROFILES) });
    await showView(card, "Filament");
    const slots = findAll(card, ".slot");
    const lines: string[][] = [];
    for (const index of [0, 1, slots.length - 2, slots.length - 1]) {
      const pencil = slots[index]?.querySelector(".btn.edit") as HTMLButtonElement | null;
      if (!pencil) continue;
      pencil.click();
      await settle(card);
      lines.push(line(card));
      (findAll<HTMLButtonElement>(card, "dialog .dlg-actions .btn").find((item) => ["Cancel", "Close"].includes(text(item))) as HTMLButtonElement).click();
      await settle(card);
    }
    expect(lines).toContainEqual([`Left nozzle: 0.4${NBSP}mm · Hardened steel`]);
    expect(lines).toContainEqual([`Right nozzle: 0.4${NBSP}mm · Stainless steel, high flow`]);
    expect(lines.at(-2)).toEqual([`Left nozzle: 0.4${NBSP}mm · Hardened steel`]);
    expect(lines.at(-1)).toEqual([`Right nozzle: 0.4${NBSP}mm · Stainless steel, high flow`]);
  });

  it("names both nozzles where a unit may feed either, and only the diameter where the type is not known", async () => {
    const devices = h2d({ status: "idle", stage: "idle" });
    for (const device of devices) {
      for (const entity of device.entities) {
        if ("attributes" in entity && entity.attributes && "nozzle" in entity.attributes) {
          const { nozzle: _side, ...rest } = entity.attributes as Record<string, unknown>;
          entity.attributes = rest;
        }
      }
    }
    const card = await mount(devices, "dev-h2d", { callService: answering(PROFILES) });
    await showView(card, "Filament");
    await editRow(card, 0);
    expect(line(card)).toEqual([`Left: 0.4${NBSP}mm · Hardened steel`, `Right: 0.4${NBSP}mm · Stainless steel, high flow`]);

    const bare = await mount(a1mini({ status: "idle", stage: "idle", nozzleTypes: [] }), "dev-a1mini", { callService: answering(PROFILES) });
    await showView(bare, "Filament");
    await editRow(bare, 0);
    expect(line(bare)).toEqual([`Nozzle: 0.4${NBSP}mm`]);
  });

  it("says it in German", async () => {
    const card = await mountCard(makeHass({ devices: h2d({ status: "idle", stage: "idle" }), language: "de", callService: answering(PROFILES) }), { printer: "dev-h2d" });
    await showView(card, "Filament");
    await editRow(card, 0);
    expect(line(card)[0]).toMatch(/^(Linke|Rechte) Düse: 0,4 mm · /);
  });
});

describe("the K field, every path", () => {
  const slow = (card: FakeCard): boolean => find(card, "dialog #k-hint .k-wait.slow") !== null;
  const open = async (card: FakeCard): Promise<void> => {
    (findAll(card, ".slot")[2]?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  };
  const cancel = async (card: FakeCard): Promise<void> => {
    (findAll<HTMLButtonElement>(card, "dialog .dlg-actions .btn").find((item) => text(item) === "Cancel") as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  };

  it("writes its orange as the card's other warnings: readable on a light dialog", () => {
    expect(styleText()).toMatch(/\.k-wait\.slow\s*\{[^}]*color: color-mix\(in srgb, var\(--bb-warn\) 55%, var\(--bb-text\)\);/);
  });

  it("turns orange 5 s after this open, not an earlier one's, also after the card was put back", async () => {
    const held = holding();
    const card = await mount(idle(), "dev-x1c", { callService: held.callService });
    await showView(card, "Filament");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await open(card);
    await vi.advanceTimersByTimeAsync(3000);
    await cancel(card);
    await open(card);
    await vi.advanceTimersByTimeAsync(2500);
    await card.updateComplete;
    expect(slow(card)).toBe(false);
    // A dashboard laying out its columns anew takes the card off and puts it back.
    const parent = card.parentElement as HTMLElement;
    card.remove();
    parent.append(card);
    await vi.advanceTimersByTimeAsync(2600);
    await card.updateComplete;
    expect(slow(card)).toBe(true);
  });

  it("turns orange in a dialog a question parked meanwhile", async () => {
    const held = holding();
    const card = await mount(idle(), "dev-x1c", { callService: held.callService });
    await showView(card, "Filament");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await open(card);
    (findAll<HTMLButtonElement>(card, "dialog .btn").find((item) => text(item) === "Reset slot") as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(5100);
    await cancel(card);
    expect(slow(card)).toBe(true);
  });

  it("keeps the answer of this open, not a late one of an earlier open", async () => {
    const answers: ((value: unknown) => void)[] = [];
    const callService = async (call: { service: string }) => (call.service === "get_k_profiles" ? new Promise((resolve) => answers.push(resolve)) : undefined);
    const card = await mount(idle(), "dev-x1c", { callService });
    await showView(card, "Filament");
    await editRow(card, 2);
    (findAll<HTMLButtonElement>(card, "dialog .dlg-actions .btn").find((item) => text(item) === "Cancel") as HTMLButtonElement).click();
    await settle(card);
    await editRow(card, 2);
    answers[1]?.({ response: PROFILES });
    await settle(card);
    answers[0]?.({ response: SILENT });
    await settle(card);
    expect(options(card)).toEqual(["Keep Grey PLA matte (K 0.018)", "Printer's default (K 0.020)", "Generic PLA (K 0.020)"]);
    expect(text(hint(card))).toBe("If unsure, leave this as it is.");
  });

  it("falls back to the default where the slot's own, chosen while asked, turns out to be none", async () => {
    const held = holding();
    const card = await mount(idle(), "dev-x1c", { callService: held.callService });
    await showView(card, "Filament");
    await editRow(card, 2);
    kSelect(card).value = "keep";
    kSelect(card).dispatchEvent(new Event("change"));
    await card.updateComplete;
    held.answer({ ...PROFILES, current: -1 });
    await settle(card);
    expect(options(card)).toEqual(["Printer's default (K 0.020)", "Generic PLA (K 0.020)", "Grey PLA matte (K 0.018)"]);
    expect(kSelect(card).value).toBe("-1");
  });

  it("sets the printer's default chosen while it asked", async () => {
    const held = holding();
    const hass = makeHass({ devices: idle(), callService: held.callService });
    const card = await mountCard(hass, { printer: "dev-x1c" });
    await showView(card, "Filament");
    await editRow(card, 2);
    kSelect(card).value = "-1";
    kSelect(card).dispatchEvent(new Event("change"));
    await card.updateComplete;
    await press(card, "Set");
    expect(hass.calls.at(-1)).toMatchObject({ service: "set_filament", data: { k_profile: -1 } });
  });

  it("says its waiting in German", async () => {
    const held = holding();
    const card = await mountCard(makeHass({ devices: idle(), language: "de", callService: held.callService }), { printer: "dev-x1c" });
    await showView(card, "Filament");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await open(card);
    expect(text(hint(card))).toBe("Der Drucker wird nach seinen K-Profilen gefragt …");
    await vi.advanceTimersByTimeAsync(5100);
    await card.updateComplete;
    expect(text(hint(card))).toBe("Der Drucker antwortet nicht sofort. BamBuddy fragt bis zu dreimal nach, das dauert höchstens etwa 16 Sekunden.");
  });
});

describe("the nozzle line, every side", () => {
  const line = (card: FakeCard): string[] => findAll(card, "dialog .nozzle-line > span").map(text);

  it("names an AMS unit's own side: the AMS 2 Pro feeds the right nozzle, the AMS HT the left", async () => {
    const card = await mount(h2d({ status: "idle", stage: "idle" }), "dev-h2d", { callService: answering(PROFILES) });
    await showView(card, "Filament");
    await editRow(card, 0);
    expect(line(card)).toEqual([`Right nozzle: 0.4${NBSP}mm · Stainless steel, high flow`]);
    const de = await mountCard(makeHass({ devices: h2d({ status: "idle", stage: "idle" }), language: "de", callService: answering(PROFILES) }), { printer: "dev-h2d" });
    await showView(de, "Filament");
    await editRow(de, 0);
    expect(line(de)).toEqual([`Rechte Düse: 0,4${NBSP}mm · Edelstahl, High Flow`]);
  });

  it("names both nozzles for an external spool whose other sensor is gone: its side is not known", async () => {
    const right = { name: "PLA Basic", type: "PLA", color: "#FFFFFF", remaining: null, trayId: 255 };
    const left = { name: "PETG HF", type: "PETG", color: "#0A0A0A", remaining: null, trayId: 254 };
    const devices = h2d({ status: "idle", stage: "idle", externalSpools: [left, right] });
    const printer = devices[0] as FakeDevice;
    printer.entities = printer.entities.filter((entity) => entity.entityId !== "sensor.h2d_left_external_spool");
    const card = await mount(devices, "dev-h2d", { callService: answering(PROFILES) });
    await showView(card, "Filament");
    (findAll(card, ".slot").at(-1)?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
    expect(line(card)).toEqual([`Left: 0.4${NBSP}mm · Hardened steel`, `Right: 0.4${NBSP}mm · Stainless steel, high flow`]);
  });
});

describe("the slot dialog's layout", () => {
  it("keeps two lines for the waiting note, so the dialog does not move when it turns orange", () => {
    expect(styleText()).toMatch(/\.k-wait\s*\{[^}]*min-height: 36px;/);
  });

  it("puts a wrapped nozzle line's icon at its first line, as the notes do", () => {
    expect(styleText()).toMatch(/\.nozzle-line > span\s*\{[^}]*align-items: flex-start;/);
    expect(styleText()).toMatch(/\.nozzle-line \.icon\s*\{[^}]*margin-top: 1px;/);
  });

  it("breaks a title word longer than the dialog", () => {
    expect(styleText()).toMatch(/\.dlg-body h2\s*\{[^}]*overflow-wrap: anywhere;/);
  });
});

