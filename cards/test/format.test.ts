import { describe, expect, it } from "vitest";

import {
  filamentColor,
  formatDuration,
  formatEndTime,
  formatNumber,
  formatPercent,
  formatState,
  formatTemperature,
  hasValue,
  needsOutline,
  numericState,
  toneOf,
} from "../src/format";
import { makeHass, x1c } from "./fixtures";

const NBSP = " ";

describe("numbers", () => {
  it("follow Home Assistant's number format setting", () => {
    const value = 1234.5;
    expect(formatNumber(makeHass({ numberFormat: "comma_decimal" }), value, 1)).toBe("1,234.5");
    expect(formatNumber(makeHass({ numberFormat: "decimal_comma" }), value, 1)).toBe("1.234,5");
    expect(formatNumber(makeHass({ numberFormat: "space_comma" }), value, 1)).toBe(`1${" "}234,5`);
    // Swiss grouping: an apostrophe, typographic in newer locale data.
    expect(formatNumber(makeHass({ numberFormat: "quote_decimal" }), value, 1)).toMatch(/^1['’]234\.5$/);
    expect(formatNumber(makeHass({ numberFormat: "none" }), value, 1)).toBe("1234.5");
    expect(formatNumber(makeHass({ numberFormat: "language", language: "de" }), value, 1)).toBe("1.234,5");
    expect(formatNumber(makeHass({ numberFormat: "system" }), 5)).toBe("5");
  });

  it("keep their unit on the same line", () => {
    const hass = makeHass();
    expect(formatTemperature(hass, 219.6)).toBe(`220${NBSP}°C`);
    expect(formatPercent(hass, 62)).toBe(`62${NBSP}%`);
  });
});

describe("durations", () => {
  it("read as minutes, hours, or days and hours", () => {
    const hass = makeHass();
    expect(formatDuration(hass, 42)).toBe("42 min");
    expect(formatDuration(hass, 120)).toBe("2 h");
    expect(formatDuration(hass, 83)).toBe("1 h 23 min");
    expect(formatDuration(hass, 1440 + 250)).toBe("1 d 4 h");
    expect(formatDuration(hass, -5)).toBe("0 min");
  });

  it("in German", () => {
    const hass = makeHass({ language: "de" });
    expect(formatDuration(hass, 83)).toBe("1 Std. 23 Min.");
    expect(formatDuration(hass, 3000)).toBe("2 T. 2 Std.");
  });
});

describe("end times", () => {
  const now = new Date("2026-10-16T08:00:00Z");

  it("show the time today, and the weekday on another day", () => {
    const hass = makeHass({ serverTimeZone: "Europe/Berlin" });
    expect(formatEndTime(hass, "2026-10-16T12:35:00+00:00", now)).toBe("14:35");
    expect(formatEndTime(hass, "2026-10-17T05:10:00+00:00", now)).toBe("Sat 07:10");
  });

  it("in the profile's time format", () => {
    const iso = "2026-10-16T12:35:00+00:00";
    expect(formatEndTime(makeHass({ timeFormat: "12" }), iso, now)).toBe("2:35 PM");
    expect(formatEndTime(makeHass({ timeFormat: "24", language: "en-US" }), iso, now)).toBe("14:35");
    expect(formatEndTime(makeHass({ timeFormat: "language", language: "en-US" }), iso, now)).toBe("2:35 PM");
    expect(formatEndTime(makeHass({ timeFormat: "language", language: "de" }), iso, now)).toBe("14:35");
    expect(formatEndTime(makeHass({ timeFormat: "system" }), iso, now)).toMatch(/^(14:35|2:35 PM)$/);
  });

  it("in the browser's time zone unless the profile asks for the server's", () => {
    const iso = "2026-10-16T12:35:00+00:00";
    const browser = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
    expect(formatEndTime(makeHass({ timeZone: "local", language: "en-GB" }), iso, now)).toBe(browser);
    expect(formatEndTime(makeHass({ timeZone: "server", serverTimeZone: "America/New_York" }), iso, now)).toBe("08:35");
  });

  it("show nothing for a value that is no time", () => {
    expect(formatEndTime(makeHass(), "unknown", now)).toBeUndefined();
  });

  it("use the current time by default", () => {
    expect(formatEndTime(makeHass(), new Date().toISOString())).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("entity states", () => {
  const hass = makeHass({ devices: x1c() }).withState("sensor.x1c_progress", "unavailable").withState("sensor.x1c_current_layer", " ");

  it("read as numbers where they are numbers", () => {
    expect(numericState(hass, "sensor.x1c_remaining_time")).toBe(83);
    expect(numericState(hass, "sensor.x1c_progress")).toBeUndefined();
    expect(numericState(hass, "sensor.x1c_current_layer")).toBeUndefined();
    expect(numericState(hass, "sensor.x1c_current_print")).toBeUndefined();
    expect(numericState(hass, "sensor.unknown")).toBeUndefined();
    expect(numericState(hass, undefined)).toBeUndefined();
  });

  it("have a value unless unavailable or unknown", () => {
    expect(hasValue(hass, "sensor.x1c_remaining_time")).toBe(true);
    expect(hasValue(hass, "sensor.x1c_progress")).toBe(false);
    expect(hasValue(hass, "sensor.missing")).toBe(false);
  });

  it("show as Home Assistant formats them, translated", () => {
    expect(formatState(hass, "sensor.x1c_print_status")).toBe("Printing");
    expect(formatState(hass, "select.x1c_print_speed", "ludicrous")).toBe("Ludicrous (166 %)");
    expect(formatState(hass, "sensor.x1c_progress")).toBeUndefined();
    expect(formatState(hass, "sensor.x1c_progress", "unknown")).toBe("unknown %");
    expect(formatState(hass, undefined)).toBeUndefined();
  });
});

describe("colours", () => {
  it("of a print status", () => {
    expect(["printing", "preparing", "slicing", "paused", "finished", "failed", "idle", "offline", "unknown", undefined].map(toneOf)).toEqual([
      "active",
      "active",
      "active",
      "paused",
      "done",
      "failed",
      "idle",
      "off",
      "off",
      "off",
    ]);
  });

  it("of a filament: #RRGGBB, also from #RRGGBBAA", () => {
    expect(filamentColor("#F4EE2A")).toBe("#F4EE2A");
    expect(filamentColor("#f4ee2aff")).toBe("#f4ee2a");
    expect(filamentColor("F4EE2A")).toBeUndefined();
    expect(filamentColor(null)).toBeUndefined();
    expect(filamentColor("#12")).toBeUndefined();
  });

  it("outline white and black filament", () => {
    expect(needsOutline("#FFFFFF")).toBe(true);
    expect(needsOutline("#000000")).toBe(true);
    expect(needsOutline("#1F79E5")).toBe(false);
    expect(needsOutline("#F4EE2A")).toBe(true);
    expect(needsOutline("#C12E1F")).toBe(false);
  });
});
