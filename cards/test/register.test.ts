import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { defineCard, DOCS_URL, suggestCard, whenRegistryReady } from "../src/register";
import { a1mini, h2d, instanceDevice, makeHass, x1c } from "./fixtures";

/** A registry as Home Assistant's frontend replaces window.customElements
 * with: its own map, nothing of the browser's. */
function fakeRegistry(defined: string[] = []): CustomElementRegistry {
  const names = new Set(defined);
  return { get: (name: string) => (names.has(name) ? class extends HTMLElement {} : undefined) } as unknown as CustomElementRegistry;
}

interface PickerEntry {
  type: string;
  name: string;
  description: string;
  preview: boolean;
  documentationURL: string;
  getEntitySuggestion: (hass: unknown, entityId: string) => unknown;
}

const picker = (): PickerEntry[] => (window as unknown as { customCards: PickerEntry[] }).customCards;

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("whenRegistryReady", () => {
  it("is ready at once where Home Assistant's app is already defined", async () => {
    const registry = fakeRegistry(["home-assistant"]);
    await expect(whenRegistryReady(() => registry, registry)).resolves.toBe(registry);
  });

  it("waits for the registry Home Assistant puts in place after the module loaded", async () => {
    vi.useFakeTimers();
    const loadedWith = fakeRegistry();
    let current = loadedWith;
    let ready: CustomElementRegistry | undefined;
    void whenRegistryReady(() => current, loadedWith).then((registry) => {
      ready = registry;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(ready).toBeUndefined();
    const replaced = fakeRegistry();
    current = replaced;
    await vi.advanceTimersByTimeAsync(100);
    expect(ready).toBe(replaced);
  });

  it("gives up waiting after ten seconds", async () => {
    vi.useFakeTimers();
    const loadedWith = fakeRegistry();
    let ready: CustomElementRegistry | undefined;
    void whenRegistryReady(() => loadedWith, loadedWith).then((registry) => {
      ready = registry;
    });
    await vi.advanceTimersByTimeAsync(9_900);
    expect(ready).toBeUndefined();
    await vi.advanceTimersByTimeAsync(200);
    expect(ready).toBe(loadedWith);
  });
});

describe("the card picker", () => {
  it("lists the card once, with a preview and its documentation", () => {
    const entries = picker().filter((entry) => entry.type === "bambuddy-printer-card");
    expect(entries).toHaveLength(1);
    expect(customElements.get("bambuddy-printer-card")).toBeDefined();
    expect(entries[0]?.preview).toBe(true);
    expect(entries[0]?.documentationURL).toBe(DOCS_URL);
    expect(DOCS_URL).toBe("https://github.com/Spegeli/hacs_bambuddy#-dashboard-card");
  });

  it("names and describes the card in Home Assistant's language", () => {
    const entry = picker().find((item) => item.type === "bambuddy-printer-card") as PickerEntry;
    expect(entry.name).toBe("BamBuddy printer");
    expect(entry.description).toBe("Shows and controls a printer from BamBuddy: progress, camera, temperatures, filament and moving the axes.");
    const root = document.createElement("home-assistant") as HTMLElement & { hass?: unknown };
    root.hass = makeHass({ language: "de-AT" });
    document.body.append(root);
    expect(entry.name).toBe("BamBuddy-Drucker");
    expect(entry.description).toBe("Zeigt und steuert einen Drucker aus BamBuddy: Fortschritt, Kamera, Temperaturen, Filament und Achsen bewegen.");
  });

  it("defines nothing twice when the module loads twice", async () => {
    const before = picker().length;
    defineCard("bambuddy-printer-card", class extends HTMLElement {}, { name: () => "x", description: () => "y" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(picker()).toHaveLength(before);
  });
});

describe("suggestions for an entity (Home Assistant 2026.6 on)", () => {
  const hass = makeHass({
    devices: [...x1c(), ...a1mini(), instanceDevice],
    foreign: [{ entityId: "sensor.outside", key: "temperature", state: "12" }],
  });
  // Home Assistant adds a suggested card as it is: the printer, as a card
  // from the picker; the editor shows the defaults.
  const config = (printer: string) => ({ config: { type: "custom:bambuddy-printer-card", printer } });

  it("suggests the card for a printer's entities", () => {
    expect(suggestCard(hass, "sensor.x1c_progress", "bambuddy-printer-card")).toEqual(config("dev-x1c"));
    const entry = picker().find((item) => item.type === "bambuddy-printer-card") as PickerEntry;
    expect(entry.getEntitySuggestion(hass, "camera.a1_mini_camera")).toEqual(config("dev-a1mini"));
  });

  it("suggests the card of the printer for an AMS unit's entities", () => {
    expect(suggestCard(hass, "sensor.dev-x1c_ams_0_humidity", "bambuddy-printer-card")).toEqual(config("dev-x1c"));
  });

  it("suggests nothing for other entities", () => {
    expect(suggestCard(hass, "sensor.outside", "bambuddy-printer-card")).toBeNull();
    expect(suggestCard(hass, "sensor.unknown", "bambuddy-printer-card")).toBeNull();
    expect(suggestCard(hass, "binary_sensor.bambuddy", "bambuddy-printer-card")).toBeNull();
    // An AMS unit whose printer is gone.
    const orphan = makeHass({ devices: [h2d()[1] as (typeof instanceDevice)] });
    expect(suggestCard(orphan, "sensor.dev-h2d_ams_128_slot_1", "bambuddy-printer-card")).toBeNull();
  });
});
