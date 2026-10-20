// The printer's plug as BamBuddy picks it, a plug
// without a state, the offline Power block, the switch-off's texts; a slot's
// tools, its K field and the names of its buttons.
import { afterEach, describe, expect, it } from "vitest";

import "../src/index";
import { ICONS } from "../src/icons";
import { a1mini, h2d, makeHass, mountCard, offlineP1s, plugDevice, readOnlyX1c, x1c, type FakeCard, type FakeDevice, type FakeHassOptions, type PlugSpec } from "./fixtures";
import { button, find, findAll, NBSP, press, root, settle, showView, styleText, text } from "./helpers";

afterEach(() => {
  document.body.innerHTML = "";
});

const IDLE = { status: "idle", stage: "idle", progress: 0, nozzles: [[30, 0]] as [number, number][] };

function x1cPlugs(printer: Partial<Parameters<typeof x1c>[0]>, ...plugs: Omit<PlugSpec, "printer">[]): FakeDevice[] {
  const devices = x1c(printer);
  return [...devices, ...plugs.map((spec) => plugDevice({ printer: devices[0] as FakeDevice, ...spec }))];
}

async function mount(devices: FakeDevice[], printer: string, config: Record<string, unknown> = {}, options: Partial<FakeHassOptions> = {}): Promise<FakeCard> {
  return mountCard(makeHass({ devices, ...options }), { printer, ...config });
}

const rows = (card: FakeCard): string[] => findAll(card, ".power .p-row:not(.p-auto)").map(text);

describe("the printer's plug, as BamBuddy picks it", () => {
  it("is the plug the integration marks, not the first by name: its tag, its switch-off row", async () => {
    const card = await mount(
      x1cPlugs(IDLE, { id: 2, name: "Abluft", watts: 12, main: false }, { id: 1, name: "Tasmota Drucker", watts: 180, main: true, autoOff: { armed: true, phase: "idle" } }),
      "dev-x1c",
    );
    expect(rows(card).map((row) => row.split(" On")[0])).toEqual(["Tasmota Drucker Printer", "Abluft"]);
    // The switch-off row right under the printer's plug, armed as it is.
    const auto = find(card, ".power .p-auto") as HTMLElement;
    expect(text(auto.previousElementSibling)).toContain("Tasmota Drucker");
  });

  it("is the marked one in the offline view too", async () => {
    const devices = offlineP1s();
    const printer = devices[0] as FakeDevice;
    const card = await mount(
      [...devices, plugDevice({ printer, id: 2, name: "Abluft", state: "on", watts: 12, main: false }), plugDevice({ printer, id: 5, name: "Steckdose Garage", state: "off", main: true })],
      "dev-p1s",
    );
    expect(text(find(card, ".job-info"))).toBe("The printer is off: its plug “Steckdose Garage” is switched off.");
  });
});

describe("a printer that is offline", () => {
  it("keeps its other plugs in reach: an accessory's row and switch, not the printer's plug", async () => {
    const devices = offlineP1s();
    const printer = devices[0] as FakeDevice;
    const card = await mount(
      [...devices, plugDevice({ printer, id: 5, name: "Steckdose Garage", state: "off" }), plugDevice({ printer, id: 2, name: "Abluft", state: "on", watts: 30, powersPrinter: false })],
      "dev-p1s",
    );
    expect(rows(card)).toEqual([`Abluft On · 30${NBSP}W`]);
    expect(find(card, ".power [role=switch]")).not.toBeNull();
  });
});

describe("a plug that does not report its state", () => {
  const unknownPlug = (): FakeDevice[] => x1cPlugs(IDLE, { id: 3, name: "Tasmota", state: "unknown" });

  it("turns on without a question, asks before off, and names the plug on both", async () => {
    const hass = makeHass({ devices: unknownPlug() });
    const card = await mountCard(hass, { printer: "dev-x1c" });
    await press(card, "Turn on “Tasmota”");
    expect(hass.calls.at(-1)).toMatchObject({ domain: "switch", service: "turn_on", data: { entity_id: "switch.dev-x1c_plug_3" } });
    await press(card, "Turn off “Tasmota”");
    expect(text(find(card, "dialog h2"))).toBe("Switch the printer off?");
  });

  it("marks the press while it is sent, as every control does", async () => {
    let finish: (value: unknown) => void = () => undefined;
    const hass = makeHass({ devices: unknownPlug(), callService: () => new Promise((resolve) => (finish = resolve)) });
    const card = await mountCard(hass, { printer: "dev-x1c" });
    button(card, "Turn on “Tasmota”").click();
    await card.updateComplete;
    expect(button(card, "Turn on “Tasmota”").getAttribute("aria-busy")).toBe("true");
    finish(undefined);
    await settle(card);
  });
});

describe("the switch-off after the print", () => {
  it("says it switched the plug off while the integration says so: through a restart, not once the plug was on again", async () => {
    const off = (phase: string): FakeDevice[] => {
      const devices = offlineP1s();
      return [
        ...devices,
        // Written anew by a restart of Home Assistant the next morning.
        plugDevice({ printer: devices[0] as FakeDevice, id: 5, name: "Steckdose Garage", state: "off", lastChanged: "2026-10-17T03:00:00+00:00", autoOff: { armed: false, phase, since: "2026-10-16T12:07:00+00:00" } }),
      ];
    };
    const ours = await mount(off("done"), "dev-p1s");
    expect(text(find(ours, ".job-info"))).toContain("Switched off after the print");
    // Switched on again since (and off by hand): the integration went back to idle.
    const later = await mount(off("idle"), "dev-p1s");
    expect(text(find(later, ".job-info"))).not.toContain("Switched off after the print");
  });

  it("does not offer to set it here where the key cannot", async () => {
    const devices = readOnlyX1c();
    const card = await mount([...devices, plugDevice({ printer: devices[0] as FakeDevice, id: 3, name: "Tasmota", kind: "state", bambuddyAutoOff: true })], "dev-x1c");
    expect(text(find(card, ".power .p-auto"))).not.toContain("To set it here instead");
  });

  it("lowers its threshold in steps, down to the number's lowest", async () => {
    const hass = makeHass({ devices: x1cPlugs(IDLE, { id: 3, name: "Tasmota", autoOff: { armed: true, phase: "idle", temperature: 50 } }) });
    const card = await mountCard(hass, { printer: "dev-x1c" });
    (find(card, ".power .p-open") as HTMLButtonElement).click();
    await settle(card);
    // The stepper says what it changes.
    const group = find(card, "dialog .stepper") as HTMLElement;
    expect(group.getAttribute("role")).toBe("group");
    expect(text(root(card).getElementById(group.getAttribute("aria-labelledby") ?? ""))).toBe("Switch off once the nozzle is cooler than");
    await press(card, `Lower the switch-off temperature by 5${NBSP}°C`);
    await new Promise((resolve) => setTimeout(resolve, 900));
    await settle(card);
    expect(hass.calls.at(-1)).toMatchObject({ domain: "number", service: "set_value", data: { value: 45 } });
  });
});

describe("a slot's tools", () => {
  const idle = (): FakeDevice[] => {
    const all = x1c({ status: "idle", stage: "idle" });
    for (const entity of (all[1] as FakeDevice).entities) {
      if ("attributes" in entity && entity.attributes) entity.attributes = { ...entity.attributes, active: false };
    }
    return all;
  };
  const editRow = async (card: FakeCard, row: number): Promise<void> => {
    (findAll(card, ".slot")[row]?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
  };

  it("offers no reset for a slot nobody described: there is nothing to reset", async () => {
    const card = await mount(idle(), "dev-x1c");
    await showView(card, "Filament");
    await editRow(card, 3);
    expect(findAll(card, "dialog .btn").map(text)).not.toContain("Reset slot");
    await press(card, "Cancel");
    await editRow(card, 2);
    expect(findAll(card, "dialog .btn").map(text)).toContain("Reset slot");
  });

  it("names the external spool to unload before a chip is read, in both languages", async () => {
    const spool = { name: "TPU 95A HF", type: "TPU", color: "#FF6A13", remaining: null, trayId: 254, active: true };
    for (const [language, hint] of [
      ["en", "Unload the filament from the external spool first: the AMS reads a chip only while no filament is loaded."],
      ["de", "Entlade erst das Filament von der externen Spule: Das AMS liest einen Chip nur, solange kein Filament geladen ist."],
    ] as const) {
      const card = await mount(a1mini({ status: "idle", stage: "idle", externalSpools: [spool] }), "dev-a1mini", {}, { language });
      await showView(card, "Filament");
      await editRow(card, 0);
      expect(findAll(card, "dialog .dlg-note").map(text)).toContain(hint);
      card.remove();
    }
  });

  it("takes the printer's default as a change where the list did not come", async () => {
    const failing = async (call: { service: string }): Promise<unknown> => {
      if (call.service === "get_k_profiles") throw new Error("no answer");
      return undefined;
    };
    const hass = makeHass({ devices: idle(), callService: failing });
    const card = await mountCard(hass, { printer: "dev-x1c" });
    await showView(card, "Filament");
    await editRow(card, 2);
    const select = find<HTMLSelectElement>(card, "dialog select#fil-k") as HTMLSelectElement;
    select.value = "-1";
    select.dispatchEvent(new Event("change"));
    await settle(card);
    await press(card, "Set");
    expect(hass.calls.at(-1)).toMatchObject({ service: "set_filament", data: { k_profile: -1 } });
  });

  it("says why the printer may have listed no K profile", async () => {
    const none = async (call: { service: string }): Promise<unknown> =>
      call.service === "get_k_profiles" ? { response: { nozzle_diameter: "0.4", current: -1, profiles: [] } } : undefined;
    const card = await mount(idle(), "dev-x1c", {}, { callService: none });
    await showView(card, "Filament");
    await editRow(card, 2);
    expect(text(find(card, "dialog .k-hint"))).toBe(
      "The printer lists no K profile for this nozzle, or did not answer in time. To ask again, close the dialog and open it once more.",
    );
  });

  it("says spool, not slot, in an external spool's K field, and asks for a material with a K profile alone", async () => {
    const failing = async (call: { service: string }): Promise<unknown> => {
      if (call.service === "get_k_profiles") throw new Error("no answer");
      return undefined;
    };
    const spool = { name: "TPU 95A HF", type: "TPU", color: "#FF6A13", remaining: null, trayId: 254 };
    const card = await mount(a1mini({ status: "idle", stage: "idle", externalSpools: [spool] }), "dev-a1mini", {}, { callService: failing });
    await showView(card, "Filament");
    (findAll(card, ".slot").at(-1)?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
    expect(text(find(card, "dialog .k-hint"))).toBe("The printer did not list its K profiles: the spool keeps its own.");
    expect([...(find<HTMLSelectElement>(card, "dialog select#fil-k") as HTMLSelectElement).options].map((option) => option.text)[0]).toBe("Keep the spool's own");

    const blank = await mount(idle(), "dev-x1c", {}, { callService: failing });
    await showView(blank, "Filament");
    await editRow(blank, 3);
    const select = find<HTMLSelectElement>(blank, "dialog select#fil-k") as HTMLSelectElement;
    select.value = "-1";
    select.dispatchEvent(new Event("change"));
    await settle(blank);
    expect(text(find(blank, "dialog .dlg-need"))).toBe("Choose a material too.");
  });
});

describe("the names of a slot's and a unit's buttons", () => {
  it("say what they act on: load from a slot or a spool, dry or stop drying a unit", async () => {
    const card = await mount(h2d({ status: "idle", stage: "idle" }), "dev-h2d");
    await showView(card, "Filament");
    const names = findAll<HTMLButtonElement>(card, ".slot .btn, .drying .btn").map((item) => item.getAttribute("aria-label") ?? "");
    expect(names).toContain("Load from Slot 1 · AMS A");
    expect(names).toContain("Load from the left external spool");
    expect(names.some((name) => /^(Dry|Stop drying) AMS /.test(name))).toBe(true);
    const german = await mount(h2d({ status: "idle", stage: "idle" }), "dev-h2d", {}, { language: "de" });
    await showView(german, "Filament");
    expect(findAll<HTMLButtonElement>(german, ".slot .btn").map((item) => item.getAttribute("aria-label"))).toContain("Laden aus Fach 1 · AMS A");
  });

  it("a unit's head says what its figures are", async () => {
    const card = await mount(h2d({ status: "idle", stage: "idle" }), "dev-h2d");
    await showView(card, "Filament");
    const head = text(find(card, ".unit-head"));
    expect(head).toMatch(/humidity \d+\s%/);
  });
});

describe("narrow cards", () => {
  it("let a plug's buttons wrap inside its box", () => {
    expect(styleText()).toMatch(/\.p-set \.btn \{[^}]*max-width: 100%;[^}]*white-space: normal;/);
  });
});

describe("the backup's unknown state in German", () => {
  it("is a Zustand, as a plug's", async () => {
    const card = await mount(x1c({ filamentBackup: "unknown" }), "dev-x1c", {}, { language: "de" });
    await showView(card, "Filament");
    expect(text(root(card))).toContain("Zustand unbekannt: BamBuddy meldet ihn für diesen Drucker nicht.");
  });
});

describe("the plug, the cold-nozzle hint, the backup and the menu", () => {
  it("finds the printer's own plug in the chip's dialog while the printer is offline", async () => {
    const devices = offlineP1s();
    const card = await mount([...devices, plugDevice({ printer: devices[0] as FakeDevice, id: 5, name: "Power meter", kind: "state", watts: 156 })], "dev-p1s", { header_chips: ["power"] });
    (find(card, ".pill.power-chip") as HTMLButtonElement).click();
    await settle(card);
    expect(findAll(card, "dialog .power-box .p-row").map(text)).toEqual([`Power meter On · 156${NBSP}W Display only: BamBuddy cannot switch this plug.`]);
  });

  it("is not sent to a heating section the card does not show", async () => {
    const shown = await mount(x1c({ status: "idle", stage: "idle", nozzles: [[30, 0]] }), "dev-x1c");
    await showView(shown, "Control");
    expect(findAll(shown, ".note").map(text)).toContain(`To extrude, heat the nozzle to at least 170${NBSP}°C under Heating.`);
    const hidden = await mount(x1c({ status: "idle", stage: "idle", nozzles: [[30, 0]] }), "dev-x1c", { control_sections: ["motion", "options"] });
    await showView(hidden, "Control");
    expect(findAll(hidden, ".note").map(text)).toContain(`To extrude, the nozzle must be at least 170${NBSP}°C.`);
  });

  it("learns that the backup switches although its state is unknown", async () => {
    const card = await mount(x1c({ filamentBackup: "unknown" }), "dev-x1c");
    await showView(card, "Filament");
    expect(text(root(card))).toContain("State unknown: BamBuddy does not report it for this printer. Switching it on or off still works.");
  });

  it("is not told a menu entry edits when it opens the device page", async () => {
    const card = await mount(x1c(), "dev-x1c", {}, { admin: true } as never);
    (find(card, ".menu-btn") as HTMLButtonElement).click();
    await card.updateComplete;
    const first = findAll(card, ".menu [role=menuitem]")[0] as HTMLElement;
    expect(text(first)).toBe("Open device page");
    expect(first.querySelector(".icon path")?.getAttribute("d")).toBe(ICONS.openInNew);
  });
});

describe("the printer's own plug while the printer is offline", () => {
  it("stays in the Power block where the offline view says nothing of it: a plug without a state, an unreachable one", async () => {
    const devices = offlineP1s();
    const card = await mount([...devices, plugDevice({ printer: devices[0] as FakeDevice, id: 5, name: "REST Drucker", state: "unknown" })], "dev-p1s");
    expect(findAll(card, "button").some((item) => item.getAttribute("aria-label") === "Turn on “REST Drucker”")).toBe(true);
    const gone = offlineP1s();
    const unreachable = await mount([...gone, plugDevice({ printer: gone[0] as FakeDevice, id: 5, name: "Tasmota Drucker", state: "unavailable" })], "dev-p1s");
    expect(rows(unreachable).some((row) => row.startsWith("Tasmota Drucker"))).toBe(true);
  });

  it("leaves the Power block where the offline view has it: switched off", async () => {
    const devices = offlineP1s();
    const card = await mount([...devices, plugDevice({ printer: devices[0] as FakeDevice, id: 5, name: "Steckdose Garage", state: "off" })], "dev-p1s");
    expect(text(find(card, ".job-info"))).toContain("Steckdose Garage");
    expect(find(card, ".power")).toBeNull();
  });
});

describe("a plug's question comes back to its own button", () => {
  it("Keep it on brings the focus back to the plug's Turn off", async () => {
    const card = await mount(
      x1cPlugs(IDLE, { id: 3, name: "Tasmota", state: "unknown" }, { id: 4, name: "Abluft", state: "unknown", powersPrinter: false }),
      "dev-x1c",
      { header_chips: ["power"] },
    );
    (find(card, ".pill.power-chip") as HTMLButtonElement).click();
    await settle(card);
    const off = findAll<HTMLButtonElement>(card, "dialog button").find((item) => item.getAttribute("aria-label") === "Turn off “Abluft”") as HTMLButtonElement;
    off.focus();
    off.click();
    await settle(card);
    expect(text(find(card, "dialog h2"))).toContain("Abluft");
    button(card, "Keep it on").click();
    await settle(card);
    await settle(card);
    expect((root(card) as ShadowRoot).activeElement?.getAttribute("aria-label")).toBe("Turn off “Abluft”");
  });

  it("shows the toggle busy while the off its question sent runs", async () => {
    let finish: (value: unknown) => void = () => undefined;
    const card = await mount(x1cPlugs(IDLE, { id: 3, name: "Tasmota", state: "on" }), "dev-x1c", {}, { callService: () => new Promise((resolve) => (finish = resolve)) });
    (find(card, ".power [role=switch]") as HTMLButtonElement).click();
    await settle(card);
    button(card, "Switch off").click();
    await card.updateComplete;
    expect(find(card, ".power [role=switch]")?.getAttribute("aria-busy")).toBe("true");
    finish(undefined);
    await settle(card);
  });
});

/** The other slots not feeding: the one the test picks is. */
const inactive = (devices: FakeDevice[]): FakeDevice[] => {
  for (const device of devices.slice(1)) {
    for (const entity of device.entities) {
      if ("attributes" in entity && entity.attributes && "active" in entity.attributes) entity.attributes = { ...entity.attributes, active: false };
    }
  }
  return devices;
};

const PROFILES = {
  nozzle_diameter: "0.4",
  current: -1,
  profiles: [
    { index: 1, name: "Generic PLA", k_value: 0.02, filament_id: "GFL99", nozzle: null },
    { index: 2, name: "Generic PETG", k_value: 0.035, filament_id: "GFG99", nozzle: null },
  ],
};
const answering = async (call: { service: string }): Promise<unknown> => (call.service === "get_k_profiles" ? { response: PROFILES } : undefined);

async function chooseK(card: FakeCard, value: string): Promise<void> {
  const select = find<HTMLSelectElement>(card, "dialog select#fil-k") as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new Event("change"));
  await settle(card);
}

describe("each of a slot's texts", () => {
  it("names Dry and Stop drying by their unit", async () => {
    const card = await mount(h2d({ status: "idle", stage: "idle" }), "dev-h2d");
    await showView(card, "Filament");
    const names = findAll<HTMLButtonElement>(card, ".drying .btn").map((item) => item.getAttribute("aria-label"));
    expect(names).toContain("Stop drying AMS A");
    expect(names).toContain("Dry AMS HT A");
  });

  it("names the external spool to unload by its side on two nozzles", async () => {
    const devices = inactive(
      h2d({
        status: "idle",
        stage: "idle",
        externalSpools: [
          { name: "PETG HF", type: "PETG", color: "#0A0A0A", remaining: null, trayId: 254 },
          { name: "PLA Basic", type: "PLA", color: "#FFFFFF", remaining: null, trayId: 255, active: true },
        ],
      }),
    );
    const card = await mount(devices, "dev-h2d");
    await showView(card, "Filament");
    (findAll(card, ".slot")[0]?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
    expect(findAll(card, "dialog .dlg-note").map(text)).toContain(
      "Unload the filament from the right external spool first: the AMS reads a chip only while no filament is loaded.",
    );
  });

  it("keeps the other-material note until there is a material", async () => {
    const card = await mount(inactive(x1c({ status: "idle", stage: "idle" })), "dev-x1c", {}, { callService: answering });
    await showView(card, "Filament");
    (findAll(card, ".slot")[3]?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
    await chooseK(card, "2");
    expect(text(find(card, "dialog .k-hint"))).toBe("If unsure, leave this as it is.");
  });

  it("says spool in the external spool's other-material note", async () => {
    const card = await mount(a1mini({ status: "idle", stage: "idle" }), "dev-a1mini", {}, { callService: answering });
    await showView(card, "Filament");
    (findAll(card, ".slot").at(-1)?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
    await chooseK(card, "2");
    expect(text(find(card, "dialog .k-hint"))).toBe("A K profile of another material: BamBuddy then files the spool under that material.");
  });
});

describe("a view-only card's offline view", () => {
  it("offers nothing to switch", async () => {
    const devices = offlineP1s();
    const card = await mount([...devices, plugDevice({ printer: devices[0] as FakeDevice, id: 5, name: "Steckdose Garage", state: "off", watts: 0 })], "dev-p1s", { read_only: true });
    expect(text(find(card, ".job-info"))).toBe("The printer is off: its plug “Steckdose Garage” is switched off.");
    expect(findAll(card, ".offline-actions .btn").map(text)).toEqual([]);
  });
});
