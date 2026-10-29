// What a screen reader hears, in English and light: what
// each control is named, what a live region says, the focus ring's colour,
// the print controls on a narrow card.
import { afterEach, describe, expect, it } from "vitest";

import "../src/index";
import { h2d, makeHass, maintenanceSpec, mountCard, offlineP1s, readOnlyX1c, unreachable, x1c, type FakeDevice } from "./fixtures";
import { atRule, button, find, findAll, NBSP, press, settle, showView, styleText, text, update } from "./helpers";

afterEach(() => {
  document.body.innerHTML = "";
});

const nameOf = (element: Element): string => element.getAttribute("aria-label") ?? text(element);

describe("the Filament tab's buttons", () => {
  it("never share a name in one view: each slot says its place", async () => {
    const card = await mountCard(makeHass({ devices: h2d({ status: "idle", stage: "idle" }) }), { printer: "dev-h2d" });
    await showView(card, "Filament");
    const names = findAll<HTMLButtonElement>(card, ".body button").map(nameOf);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
    expect(names.some((name) => / – Slot 1 · AMS A$/.test(name))).toBe(true);
  });

  it("let Dry wait for a filament change; Stop drying does not", async () => {
    const card = await mountCard(makeHass({ devices: h2d({ status: "idle", stage: "idle", amsStatus: "feeding" }) }), { printer: "dev-h2d" });
    await showView(card, "Filament");
    const dry = findAll<HTMLButtonElement>(card, ".drying .btn");
    const stop = dry.filter((item) => text(item) === "Stop drying");
    const start = dry.filter((item) => text(item) === "Dry");
    expect(start.length).toBeGreaterThan(0);
    expect(start.every((item) => item.disabled)).toBe(true);
    expect(stop.every((item) => !item.disabled)).toBe(true);
  });
});

describe("the AMS strip on the Status tab", () => {
  it("is named by what it is and where it goes; what it shows is its description", async () => {
    const card = await mountCard(makeHass({ devices: x1c() }), { printer: "dev-x1c" });
    const strip = find(card, "button.ams-strip") as HTMLButtonElement;
    expect(strip.getAttribute("aria-label")).toBe("AMS and filament – Open the filament view");
    const described = find(card, `#${strip.getAttribute("aria-describedby")}`);
    expect(text(described)).toContain("PLA Basic");
  });
});

describe("what a screen reader hears change", () => {
  it("names the printer in the state and the AMS activity, and says when it goes offline", async () => {
    const hass = makeHass({ devices: x1c() });
    const card = await mountCard(hass, { printer: "dev-x1c" });
    const live = (): string => text(find(card, ".card-status"));
    expect(find(card, ".card-status")?.getAttribute("role")).toBe("status");
    expect(live()).toBe("Workshop: Printing");
    await update(card, hass.withState("binary_sensor.x1c_online", "off"));
    expect(live()).toBe("Workshop: Offline");
  });

  it("names a heater's target with what it heats, also where it cannot be set", async () => {
    const card = await mountCard(makeHass({ devices: x1c({ status: "idle", stage: "idle" }) }), { printer: "dev-x1c" });
    await showView(card, "Control");
    expect(findAll(card, ".heat-target").map(text).some((said) => said.startsWith("Bed target: "))).toBe(true);
    const view = await mountCard(makeHass({ devices: x1c({ status: "idle", stage: "idle" }) }), { printer: "dev-x1c", read_only: true });
    await showView(view, "Control");
    expect(findAll(view, ".heat-target").map(text).some((said) => said.startsWith("Bed target: "))).toBe(true);
  });
});

describe("dialogs, said whole", () => {
  it("the drying fields say their unit", async () => {
    const card = await mountCard(makeHass({ devices: h2d({ status: "idle", stage: "idle" }) }), { printer: "dev-h2d" });
    await showView(card, "Filament");
    (findAll<HTMLButtonElement>(card, ".drying .btn").find((item) => text(item) === "Dry") as HTMLButtonElement).click();
    await settle(card);
    expect(findAll(card, "dialog .field label").map(text)).toEqual(["Temperature (°C)", "Duration (hours)"]);
  });

  it("the K profile's hint describes its select, and is said when it changes", async () => {
    const devices = x1c({ status: "idle", stage: "idle" });
    for (const entity of (devices[1] as FakeDevice).entities) {
      if ("attributes" in entity && entity.attributes) entity.attributes = { ...entity.attributes, active: false };
    }
    const card = await mountCard(makeHass({ devices }), { printer: "dev-x1c" });
    await showView(card, "Filament");
    (findAll(card, ".slot")[2]?.querySelector(".btn.edit") as HTMLButtonElement).click();
    await settle(card);
    const select = find(card, "dialog select#fil-k") as HTMLSelectElement;
    const hint = find(card, `#${select.getAttribute("aria-describedby")}`) as HTMLElement;
    expect(hint.classList.contains("k-hint-box")).toBe(true);
    expect(hint.getAttribute("aria-live")).toBe("polite");
  });

  it("marking a maintenance task done is said", async () => {
    const hass = makeHass({ devices: x1c({ maintenance: maintenanceSpec() }) });
    const card = await mountCard(hass, { printer: "dev-x1c", header_chips: ["maintenance"] });
    (find(card, ".pill.maintenance") as HTMLButtonElement).click();
    await card.updateComplete;
    const status = (): string => text(find(card, "dialog .maint-said"));
    expect(status()).toBe("");
    (find(card, 'dialog .maint-done[data-task="11"]') as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, "dialog .maint-confirm .btn.primary") as HTMLButtonElement).click();
    await settle(card);
    expect(find(card, "dialog .maint-said")?.getAttribute("role")).toBe("status");
    expect(status()).toMatch(/^“.+” marked as done\.$/);
  });

  it("the switch-off's steppers say what they change", async () => {
    const devices = x1c({ status: "idle", stage: "idle" });
    const { plugDevice } = await import("./fixtures");
    const card = await mountCard(makeHass({ devices: [...devices, plugDevice({ printer: devices[0] as FakeDevice, id: 3, name: "Tasmota", autoOff: { armed: true, phase: "idle", temperature: 50 } })] }), {
      printer: "dev-x1c",
    });
    (find(card, ".power .p-open") as HTMLButtonElement).click();
    await settle(card);
    expect(button(card, `Lower the switch-off temperature by 5${NBSP}°C`)).toBeTruthy();
    expect(button(card, `Raise the switch-off temperature by 5${NBSP}°C`)).toBeTruthy();
  });
});

describe("a task marked done", () => {
  it.each([
    ["de", "Druckplatte reinigen", "„Druckplatte reinigen“ als erledigt markiert."],
    ["en", "Clean build plate", "“Clean build plate” marked as done."],
  ])("is said by the name its row shows, in %s", async (language, shown, said) => {
    const hass = makeHass({ language, devices: x1c({ maintenance: maintenanceSpec() }) });
    const card = await mountCard(hass, { printer: "dev-x1c", header_chips: ["maintenance"] });
    (find(card, ".pill.maintenance") as HTMLButtonElement).click();
    await card.updateComplete;
    const done = find(card, 'dialog .maint-done[data-task="11"]') as HTMLButtonElement;
    expect(text(done.closest(".maint-row") as HTMLElement)).toContain(shown);
    done.click();
    await card.updateComplete;
    (find(card, "dialog .maint-confirm .btn.primary") as HTMLButtonElement).click();
    await settle(card);
    expect(text(find(card, "dialog .maint-said"))).toBe(said);
  });
});

describe("the jog pad", () => {
  it("names its centre by what it does", async () => {
    const card = await mountCard(makeHass({ devices: x1c({ status: "idle", stage: "idle" }) }), { printer: "dev-x1c" });
    await showView(card, "Control");
    expect(find(card, ".jog.home")?.getAttribute("aria-label")).toBe("Home all axes");
    await press(card, "Home all axes");
    expect(text(find(card, "dialog h2"))).toBe("Home all axes?");
  });
});

describe("the styles", () => {
  it("draw the focus ring in the card's mix of accent and text: 3:1 on the light theme's tint", () => {
    const css = styleText();
    expect(css).toMatch(/--bb-ring: color-mix\(in srgb, var\(--bb-accent\) 80%, var\(--bb-text\)\);/);
    expect(css).not.toMatch(/outline: 2px solid var\(--bb-accent\)/);
  });

  it("let the print controls wrap as wholes on a narrow card", () => {
    expect(atRule("@container (max-width: 280px)")).toMatch(/\.ctl-buttons \.btn \{[^}]*flex: 1 1 auto;/);
  });
});

describe("an offline printer's view", () => {
  it("still has the live line, saying offline", async () => {
    const card = await mountCard(makeHass({ devices: offlineP1s() }), { printer: "dev-p1s" });
    expect(text(find(card, ".card-status"))).toMatch(/: Offline$/);
    const readOnly = await mountCard(makeHass({ devices: readOnlyX1c() }), { printer: "dev-x1c" });
    expect(find(readOnly, ".card-status")).not.toBeNull();
  });
});

describe("what the live lines and hints say", () => {
  it("says no answer from BamBuddy as such", async () => {
    const card = await mountCard(makeHass({ devices: unreachable(x1c()) }), { printer: "dev-x1c" });
    expect(text(find(card, ".card-status"))).toMatch(/: No data from BamBuddy$/);
  });

  it("names the printer in the Filament tab's AMS line", async () => {
    const card = await mountCard(makeHass({ devices: h2d({ status: "idle", stage: "idle", amsStatus: "feeding" }) }), { printer: "dev-h2d" });
    await showView(card, "Filament");
    expect(text(find(card, ".activity .sr-only"))).toBe("Studio:");
  });

  it("points nowhere in the two-nozzle cold hint without a heating section", async () => {
    const card = await mountCard(makeHass({ devices: h2d({ status: "idle", stage: "idle", nozzles: [[30, 0], [30, 0]] }) }), {
      printer: "dev-h2d",
      control_sections: ["motion", "options"],
    });
    await showView(card, "Control");
    expect(findAll(card, ".note").map(text).some((note) => /^To extrude, the (left|right) nozzle \(active\) must be at least /.test(note))).toBe(true);
  });
});
