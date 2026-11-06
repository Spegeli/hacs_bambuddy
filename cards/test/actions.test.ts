import { describe, expect, it } from "vitest";

import { callAction, errorText, printObjects, spoolList } from "../src/actions";
import { makeHass } from "./fixtures";

describe("calling an action", () => {
  it("leaves the failure for the card to show", async () => {
    const hass = makeHass();
    await callAction(hass, "button", "press", { entity_id: "button.x1c_pause" });
    expect(hass.calls).toEqual([{ domain: "button", service: "press", data: { entity_id: "button.x1c_pause" }, notifyOnError: false }]);
  });
});

describe("why an action failed", () => {
  const hass = makeHass({
    language: "de",
    translations: { "component.bambuddy.exceptions.printer_busy.message": "Der Drucker druckt gerade ({state})." },
  });

  it("is the integration's own text, translated, with its placeholders", async () => {
    const error = { message: "The printer is printing", translation_domain: "bambuddy", translation_key: "printer_busy", translation_placeholders: { state: "printing" } };
    expect(await errorText(hass, error)).toBe("Der Drucker druckt gerade (printing).");
  });

  it("is Home Assistant's message where the integration's text is missing or cannot load", async () => {
    expect(await errorText(hass, { message: "Not found", translation_domain: "bambuddy", translation_key: "other" })).toBe("Not found");
    const broken = makeHass();
    broken.loadBackendTranslation = async () => {
      throw new Error("connection lost");
    };
    expect(await errorText(broken, { message: "Timeout", translation_domain: "bambuddy", translation_key: "x" })).toBe("Timeout");
    expect(await errorText(hass, new Error("Plain"))).toBe("Plain");
  });

  it("asks the backend for the integration's exceptions, and only where both domain and key are given", async () => {
    const loaded: unknown[][] = [];
    const watched = makeHass({ translations: { "component.bambuddy.exceptions.printer_busy.message": "Busy" } });
    const load = watched.loadBackendTranslation;
    watched.loadBackendTranslation = async (...args: Parameters<typeof load>) => {
      loaded.push(args);
      return load(...args);
    };
    expect(await errorText(watched, { translation_domain: "bambuddy", translation_key: "printer_busy" })).toBe("Busy");
    expect(loaded).toEqual([["exceptions", "bambuddy"]]);
    expect(await errorText(watched, { message: "Only a domain", translation_domain: "bambuddy" })).toBe("Only a domain");
    expect(await errorText(watched, { message: "Only a key", translation_key: "printer_busy" })).toBe("Only a key");
    expect(loaded).toHaveLength(1);
  });

  it("is a general text where the message is no text", async () => {
    expect(await errorText(makeHass(), { message: 42 })).toBe("That did not work. Try again in a moment.");
  });

  it("is a general text where there is nothing else", async () => {
    expect(await errorText(hass, { translation_domain: "bambuddy", translation_key: "other" })).toBe("Das hat nicht geklappt. Versuche es gleich noch einmal.");
    expect(await errorText(makeHass(), "nope")).toBe("That did not work. Try again in a moment.");
    expect(await errorText(makeHass(), null)).toBe("That did not work. Try again in a moment.");
    expect(await errorText(makeHass(), { message: "" })).toBe("That did not work. Try again in a moment.");
  });
});

describe("the objects of a running print", () => {
  it("come from the integration's action, in its order", async () => {
    const hass = makeHass({
      callService: async () => ({
        response: {
          objects: [
            { id: 7, name: "Benchy", skipped: false },
            { id: 3, name: "", skipped: true },
            { id: "x", name: "No ID" },
            { id: 9, name: 5 },
            null,
          ],
        },
      }),
    });
    expect(await printObjects(hass, "dev-x1c")).toEqual([
      { id: 7, name: "Benchy", skipped: false },
      { id: 3, name: "", skipped: true },
      { id: 9, name: "", skipped: false },
    ]);
    expect(hass.calls).toEqual([{ domain: "bambuddy", service: "get_print_objects", data: { device_id: "dev-x1c" }, notifyOnError: false, returnResponse: true }]);
  });

  it("are none where the answer holds no list", async () => {
    for (const answer of [undefined, {}, { response: null }, { response: { objects: "many" } }]) {
      expect(await printObjects(makeHass({ callService: async () => answer }), "dev-x1c")).toEqual([]);
    }
  });
});

describe("the inventory's spools for a slot", () => {
  it("keep what the answer names and leave out what it lacks or mistypes", async () => {
    const hass = makeHass({
      callService: async () => ({
        response: {
          assigned: "one",
          spools: [
            {
              id: 4,
              name: "",
              brand: null,
              material: 3,
              extra_colors: "nope",
              remaining_g: "lots",
              remaining_pct: null,
              place: { printer_id: 2, ams_id: 0, tray_id: 1, ams_label: "", same_printer: true },
              fits: "unknown",
              printing: "",
              type: "",
            },
            { id: "x", name: "No ID" },
          ],
        },
      }),
    });
    expect(await spoolList(hass, "sensor.slot")).toEqual({
      spools: [
        {
          id: 4,
          name: "4",
          brand: "",
          material: "",
          extraColors: [],
          remainingG: 0,
          rfid: false,
          place: { here: false, printerId: 2, printerName: "2", amsId: 0, trayId: 1, samePrinter: true },
          also: [],
        },
      ],
    });
  });

  it("are none where the answer holds no list", async () => {
    expect(await spoolList(makeHass({ callService: async () => ({ response: { spools: "many" } }) }), "sensor.slot")).toBeUndefined();
  });
});
