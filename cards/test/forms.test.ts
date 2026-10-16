import { afterEach, describe, expect, it } from "vitest";

import { configForm, validateConfig } from "../src/forms";
import { makeHass } from "./fixtures";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the configuration check", () => {
  it("accepts every option the card documents", () => {
    const config = {
      type: "custom:bambuddy-printer-card",
      printer: "dev-x1c",
      camera: "always",
      show_temperatures: false,
      show_fans: true,
      show_ams: false,
      show_controls: true,
    };
    expect(validateConfig(config)).toEqual(config);
  });

  it("ignores unknown keys and options left empty", () => {
    expect(validateConfig({ type: "custom:bambuddy-printer-card", camera: null, future: 1 })).toEqual({ type: "custom:bambuddy-printer-card", future: 1 });
  });

  it("refuses an invalid value with a reason Home Assistant shows", () => {
    expect(() => validateConfig({ camera: "sometimes" })).toThrowError("Invalid value for “camera”: \"sometimes\". Allowed: tap, always, off.");
    expect(() => validateConfig({ show_fans: "yes" })).toThrowError("Invalid value for “show_fans”: \"yes\". Allowed: true, false.");
    expect(() => validateConfig({ printer: 5 })).toThrowError("Invalid value for “printer”: 5. Allowed: the ID of a printer device.");
    expect(() => validateConfig(null)).toThrowError(/Invalid value for “type”/);
    expect(() => validateConfig([])).toThrowError(/Invalid value for “type”/);
    expect(() => validateConfig("x")).toThrowError(/Invalid value for “type”/);
  });

  it("gives the reason in Home Assistant's language", () => {
    const root = document.createElement("home-assistant") as HTMLElement & { hass?: unknown };
    root.hass = makeHass({ language: "de" });
    document.body.append(root);
    expect(() => validateConfig({ camera: "x" })).toThrowError("Ungültiger Wert für „camera“: \"x\". Erlaubt: tap, always, off.");
  });
});

describe("the visual editor", () => {
  it("offers BamBuddy's devices, the camera choices and the sections", () => {
    const form = configForm();
    expect(form.schema).toEqual([
      {
        name: "printer",
        required: true,
        selector: { device: { filter: { integration: "bambuddy" }, entity: { integration: "bambuddy", domain: "sensor", device_class: "enum" } } },
      },
      {
        name: "camera",
        default: "tap",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "tap", label: "Live view after a tap" },
              { value: "always", label: "Always live" },
              { value: "off", label: "Off" },
            ],
          },
        },
      },
      {
        name: "",
        type: "grid",
        schema: [
          { name: "show_temperatures", default: true, selector: { boolean: {} } },
          { name: "show_fans", default: true, selector: { boolean: {} } },
          { name: "show_ams", default: true, selector: { boolean: {} } },
          { name: "show_controls", default: true, selector: { boolean: {} } },
        ],
      },
    ]);
  });

  it("labels and explains its fields", () => {
    const form = configForm();
    expect(form.computeLabel({ name: "printer" })).toBe("Printer");
    expect(form.computeLabel({ name: "show_ams" })).toBe("AMS and filament");
    expect(form.computeLabel({ name: "" })).toBeUndefined();
    expect(form.computeHelper({ name: "printer" })).toBe("A printer of the BamBuddy integration, not an AMS unit.");
    expect(form.computeHelper({ name: "show_fans" })).toBeUndefined();
  });

  it("speaks Home Assistant's language", () => {
    const root = document.createElement("home-assistant") as HTMLElement & { hass?: unknown };
    root.hass = makeHass({ language: "de" });
    document.body.append(root);
    const form = configForm();
    expect(form.computeLabel({ name: "camera" })).toBe("Kamera");
    expect(JSON.stringify(form.schema)).toContain("Live-Ansicht nach Antippen");
  });

  it("hands a configuration it cannot show to the code editor", () => {
    const form = configForm();
    expect(() => form.assertConfig({ type: "custom:bambuddy-printer-card", camera: "never" })).toThrowError();
    expect(() => form.assertConfig({ type: "custom:bambuddy-printer-card", printer: "dev-x1c" })).not.toThrowError();
  });
});
