// Home Assistant shows temperatures and durations in the unit the user
// chose: °F with US customary units, hours where a sensor's unit was set
// so. The card reads each entity in its own unit and turns its own Celsius
// figures (a start, a limit) into it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { a1mini, h2d, makeHass, mountCard, plugDevice, x1c, type FakeDevice } from "./fixtures";
import { button, find, findAll, hasButton, NBSP, shownText, showView, text, update } from "./helpers";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

const toF = (celsius: number): number => Math.round(celsius * 1.8 + 32);

/** The devices as Home Assistant shows them with US customary units: every
 * temperature sensor and number in °F, the numbers' limits too. */
function fahrenheit(devices: FakeDevice[]): FakeDevice[] {
  return devices.map((device) => ({
    ...device,
    entities: device.entities.map((entity) => {
      const number = /target_temperature$|auto_off_temperature$/.test(entity.key);
      if (!number && !/(nozzle_temperature|bed_temperature|chamber_temperature|ams_temperature)$/.test(entity.key)) return entity;
      const celsius = Number(entity.state);
      const attributes = { ...(entity.attributes ?? {}), unit_of_measurement: "°F" };
      if (number) {
        const limits = entity.key === "auto_off_temperature" ? [30, 100] : [0, entity.key.startsWith("bed") ? 140 : entity.key.startsWith("chamber") ? 65 : 320];
        Object.assign(attributes, { min: toF(limits[0] as number), max: toF(limits[1] as number) });
      }
      return { ...entity, state: Number.isFinite(celsius) ? String(toF(celsius)) : entity.state, attributes };
    }),
  }));
}

const NOZZLE = "number.a1_mini_nozzle_target_temperature";

describe("a Home Assistant in °F", () => {
  it("says the temperatures in °F, an off heater as off", async () => {
    const hass = makeHass({ devices: fahrenheit(a1mini({ nozzles: [[200, 0]] })) });
    const card = await mountCard(hass, { printer: "dev-a1mini" });

    const tile = find(card, ".temp") as Element;
    expect(text(tile.querySelector(".temp-value"))).toBe(`392${NBSP}°F`);
    expect(text(tile.querySelector(".temp-target"))).toBe("Off");
  });

  it("heats in °F: a cold nozzle to 220 °C, steps of 5 °F, off at the lowest value", async () => {
    vi.useFakeTimers();
    const hass = makeHass({ devices: fahrenheit(a1mini()) });
    const card = await mountCard(hass, { printer: "dev-a1mini" });
    await showView(card, "Control");

    expect(shownText(find(card, ".heat-row .heat-target"))).toBe("Off");
    expect(button(card, `Nozzle 5${NBSP}°F cooler`).disabled).toBe(true);
    button(card, `Nozzle: heat to 428${NBSP}°F`).click();
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: NOZZLE, value: 428 });

    await update(card, hass.withState(NOZZLE, "428", { unit_of_measurement: "°F", min: 32, max: 608 }));
    expect(shownText(find(card, ".heat-row .heat-target"))).toBe(`428${NBSP}°F`);
    button(card, "Nozzle: turn off").click();
    await card.updateComplete;
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: NOZZLE, value: 32 });
  });

  it("switches a hot heater to its lowest value from its power symbol", async () => {
    const hass = makeHass({ devices: fahrenheit(a1mini({ nozzles: [[200, 220]], bed: [50, 55] })) });
    const card = await mountCard(hass, { printer: "dev-a1mini" });
    await showView(card, "Control");
    button(card, "Bed: turn off").click();
    await card.updateComplete;
    expect(hass.calls.map((call) => call.data)).toEqual([{ entity_id: "number.a1_mini_bed_target_temperature", value: 32 }]);
  });

  it("says a tile's target in °F", async () => {
    const hass = makeHass({ devices: fahrenheit(a1mini({ nozzles: [[200, 220]] })) });
    const card = await mountCard(hass, { printer: "dev-a1mini" });

    expect(text(find(card, ".temp .temp-target"))).toBe(`Target 428${NBSP}°F`);
  });

  it("marks a tile as on by its target alone, also in °F", async () => {
    // After a switch to °F Home Assistant keeps registered sensors in their unit: the target in °F, the reading in °C.
    const devices = a1mini({ nozzles: [[220, 220]] });
    const hass = makeHass({ devices });
    const card = await mountCard(hass, { printer: "dev-a1mini" });
    await update(card, hass.withState(NOZZLE, "428", { unit_of_measurement: "°F", min: 32, max: 608 }));
    expect(find(card, ".temp")?.classList.contains("heating")).toBe(true);
    // Off in °F is the number's minimum, 32 °F.
    await update(card, hass.withState(NOZZLE, "32", { unit_of_measurement: "°F", min: 32, max: 608 }));
    expect(find(card, ".temp")?.classList.contains("heating")).toBe(false);
  });

  it("lets no nozzle below 170 °C extrude, and says so in °F", async () => {
    const hass = makeHass({ devices: fahrenheit(a1mini({ nozzles: [[80, 0]] })) });
    const card = await mountCard(hass, { printer: "dev-a1mini" });
    await showView(card, "Control");

    expect(button(card, "Extrude 10 mm of filament").disabled).toBe(true);
    expect(findAll(card, ".note").map(text)).toContain(`To extrude, heat the nozzle to at least 338${NBSP}°F under Heating.`);
  });

  it("says an AMS unit's temperature in °F", async () => {
    const hass = makeHass({ devices: fahrenheit(x1c()) });
    const card = await mountCard(hass, { printer: "dev-x1c" });

    expect(text(find(card, ".ams-temp"))).toMatch(/°F$/);
  });

  it("warns of a hot nozzle and sets the switch-off threshold in °F", async () => {
    vi.useFakeTimers();
    const devices = x1c({ status: "idle", stage: "idle", progress: 0, nozzles: [[60, 0]] });
    const plug = plugDevice({ printer: devices[0] as FakeDevice, id: 3, name: "Tasmota", watts: 8, autoOff: { armed: true } });
    const hass = makeHass({ devices: fahrenheit([...devices, plug]) });
    const card = await mountCard(hass, { printer: "dev-x1c" });

    // 60 °C (140 °F) is above the 50 °C a nozzle cools to before its fan may stop.
    findAll<HTMLButtonElement>(card, ".power .p-row:not(.p-auto) [role=switch]")[0]?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog .dlg-note"))).toContain(`140${NBSP}°F`);
    find<HTMLButtonElement>(card, "dialog .btn.safe")?.click();
    await card.updateComplete;

    find<HTMLButtonElement>(card, ".power .p-auto .p-open")?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog .stepper .step-value"))).toBe(`122${NBSP}°F`);
    button(card, `Raise the switch-off temperature by 5${NBSP}°F`).click();
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "number.dev-x1c_plug_3_auto_off_temperature", value: 127 });
  });

  it("notes no hot nozzle at 40 °C (104 °F), and keeps the threshold at its lowest", async () => {
    vi.useFakeTimers();
    const devices = x1c({ status: "idle", stage: "idle", progress: 0, nozzles: [[40, 0]] });
    const plug = plugDevice({ printer: devices[0] as FakeDevice, id: 3, name: "Tasmota", watts: 8, autoOff: { armed: true } });
    const hass = makeHass({ devices: fahrenheit([...devices, plug]) });
    const card = await mountCard(hass, { printer: "dev-x1c" });
    findAll<HTMLButtonElement>(card, ".power .p-row:not(.p-auto) [role=switch]")[0]?.click();
    await card.updateComplete;
    expect(find(card, "dialog .dlg-note")).toBeNull();
    find<HTMLButtonElement>(card, "dialog .btn.safe")?.click();
    await card.updateComplete;

    await update(card, hass.withState("number.dev-x1c_plug_3_auto_off_temperature", "86", { unit_of_measurement: "°F", min: 86, max: 212 }));
    find<HTMLButtonElement>(card, ".power .p-auto .p-open")?.click();
    await card.updateComplete;
    expect(button(card, `Lower the switch-off temperature by 5${NBSP}°F`).disabled).toBe(true);
  });
});

describe("the times in the unit the user chose", () => {
  it("reads a remaining time set to hours", async () => {
    const hass = makeHass({ devices: x1c() });
    const card = await mountCard(hass, { printer: "dev-x1c" });
    await update(card, hass.withState("sensor.x1c_remaining_time", "1.38", { unit_of_measurement: "h", device_class: "duration" }));

    expect(findAll(card, ".meta span").map(text)).toContain("1 h 23 min left");
  });
});

describe("the drying time in the unit the user chose", () => {
  it("reads it in the chip and in the drying row", async () => {
    const hass = makeHass({ devices: h2d() });
    const card = await mountCard(hass, { printer: "dev-h2d", header_chips: ["network", "hms", "firmware", "drying"] });
    const remaining = Object.keys(hass.states).find((id) => id.endsWith("_drying_remaining_time") && hass.states[id]?.state === "200") as string;
    await update(card, hass.withState(remaining, "3.5", { unit_of_measurement: "h", device_class: "duration" }));
    expect(findAll(card, ".pill").map(text).join(" | ")).toContain(`3${NBSP}h${NBSP}30${NBSP}min`);

    await showView(card, "Filament");
    expect(findAll(card, ".drying.on .drying-text").map(text).join(" | ")).toContain(`3${NBSP}h${NBSP}30${NBSP}min`);
  });
});

describe("two nozzles", () => {
  it("starts the nozzle that does not feed the active filament at 220 °C", async () => {
    const hass = makeHass({ devices: h2d({ status: "idle", stage: "idle", activeNozzle: "right", nozzles: [[30, 0], [280, 280]], hms: [] }) });
    const card = await mountCard(hass, { printer: "dev-h2d" });
    await update(card, hass.withState("sensor.h2d_active_filament", "PA6-CF", { nozzle_temp_min: 260, nozzle_temp_max: 300 }));
    await showView(card, "Control");

    expect(hasButton(card, `Left nozzle: heat to 220${NBSP}°C`)).toBe(true);
  });
});

describe("the heater steppers", () => {
  it("announce the target a tap set", async () => {
    const hass = makeHass({ devices: a1mini() });
    const card = await mountCard(hass, { printer: "dev-a1mini" });
    await showView(card, "Control");

    const target = find(card, ".heat-row .heat-target") as Element;
    expect([target.tagName, target.getAttribute("aria-live")]).toEqual(["OUTPUT", "polite"]);
  });
});
