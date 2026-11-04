// The Status tab's AMS strip: its order, its heads, the model chip, the nozzle an AMS unit feeds.
import { describe, expect, it } from "vitest";

import "../src/index";
import {
  a1mini,
  amsDevice,
  h2d,
  x1c,
  type FakeCard,
  type FakeDevice,
} from "./fixtures";
import {
  atRule,
  cssRule,
  find,
  findAll,
  NBSP,
  settle,
  styleText,
  text,
} from "./helpers";
import { useCardPage } from "./card-helpers";
import { mount, withX1c } from "./feature-helpers";

useCardPage();

describe("the AMS strip's order", () => {
  const names = (scope: Element | null | undefined): string[] => [...(scope?.querySelectorAll(".ams-name") ?? [])].map((item) => text(item));

  it("puts the AMS units in a column, the AMS HT units and the external spools beside it", async () => {
    const { card } = await mount(h2d(), "dev-h2d");
    const strip = find(card, ".ams-strip");
    expect([...(strip?.children ?? [])].map((child) => child.classList[0])).toEqual(["sr-only", "ams-units", "ams-go"]);
    expect([...(find(card, ".ams-units")?.children ?? [])].map((child) => child.classList[0])).toEqual(["ams-column", "ams-fill"]);
    expect(names(find(card, ".ams-column"))).toEqual(["AMS A"]);
    expect(names(find(card, ".ams-fill"))).toEqual(["AMS HT A", "Ext"]);
    // With an AMS HT, each unit there is as wide as one: the rows fill evenly.
    expect(find(card, ".ams-fill")?.classList.contains("with-ht")).toBe(true);
  });

  it("keeps only the part a printer has", async () => {
    const noAms = await mount(h2d().filter((device) => device.id !== "dev-h2d-ams-0"), "dev-h2d");
    expect(find(noAms.card, ".ams-column")).toBeNull();
    expect(names(find(noAms.card, ".ams-fill"))).toEqual(["AMS HT A", "Ext"]);
    const onlyAms = await mount(x1c({ externalSpools: [] }), "dev-x1c");
    expect(find(onlyAms.card, ".ams-fill")).toBeNull();
    expect(names(find(onlyAms.card, ".ams-column"))).toEqual(["AMS A"]);
    // An external spool alone keeps its own width: it fits beside the column.
    const external = await mount(x1c(), "dev-x1c");
    expect(find(external.card, ".ams-fill")?.classList.contains("with-ht")).toBe(false);
  });

  it("fills the room beside the column, and goes below it where none is left", () => {
    const sheet = styleText();
    expect(sheet).toMatch(cssRule("\\.ams-units", "flex-wrap: wrap;"));
    expect(sheet).toMatch(cssRule("\\.ams-column", "flex-direction: column;"));
    // Its widest unit decides whether the fill fits beside the column.
    expect(sheet).toMatch(cssRule("\\.ams-fill", "flex: 1 1 0%;[^}]*min-width: min-content;[^}]*flex-wrap: wrap;"));
    // 24 px apart (the line in the middle), 36 px kept for the chevron: an
    // AMS HT fits beside an AMS from a card of about 334 px, below a 360 px
    // phone's 344.
    expect(sheet).toMatch(cssRule("\\.ams-units", "gap: 21px 24px;"));
    expect(sheet).toMatch(cssRule("\\.ams-strip", "padding: 10px 36px 10px 12px;"));
    // An AMS HT's head: its second line, the humidity (14 px + 4ch), 6 px,
    // the temperature (14 px + 4.5ch).
    expect(sheet).toMatch(cssRule("\\.ams-fill\\.with-ht \\.ams-head", "min-width: calc\\(34px \\+ 8\\.5ch\\);"));
  });

  it("sets the units apart: a line between the AMS units, a fading one beside the column, a line above what went below it", () => {
    const sheet = styleText();
    expect(sheet).toMatch(cssRule("\\.ams-column", "gap: 0;"));
    expect(sheet).toMatch(cssRule("\\.ams-column > \\.ams-group \\+ \\.ams-group", "border-top: 1px solid var\\(--bb-line\\);[^}]*margin-top: 10px;[^}]*padding-top: 10px;"));
    // Beside the column: a line in the middle of the gap, fading out at
    // both ends. Below it: a line in the middle of the row gap. The units'
    // box clips what lies left of or above it -- the line a fill does not
    // need where it starts a row or stands in the first -- but not a
    // spool's ring (2 px out, 2 px off).
    expect(sheet).toMatch(cssRule("\\.ams-units", "clip-path: inset\\(-6px -24px -24px -6px\\);"));
    expect(sheet).toMatch(
      cssRule("\\.ams-fill::before", "left: -12px;[^}]*width: 1px;[^}]*background: linear-gradient\\(to bottom, transparent, var\\(--bb-line\\) 25%, var\\(--bb-line\\) 75%, transparent\\);"),
    );
    expect(sheet).toMatch(cssRule("\\.ams-fill::after", "top: -11px;[^}]*height: 1px;[^}]*background: var\\(--bb-line\\);"));
    // Beside AMS units, the AMS HT units' rows as far apart as theirs, so
    // they stand level -- without a line.
    expect(sheet).toMatch(/\.ams-fill\.with-ht\s*\{\s*row-gap: 21px;\s*\}/);
    // The unit's name a size above the figures below it.
    expect(sheet).toMatch(cssRule("\\.ams-name", "font-size: 13px;"));
  });

  it("lets a head's lines wrap on a card under 200 px, clear of the chevron", () => {
    const tiny = atRule("@container (max-width: 200px)");
    expect(tiny).toMatch(cssRule("\\.ams-line,\\s*\\.ams-env", "height: auto;[^}]*flex-wrap: wrap;"));
    // No AMS HT's width there: the unit is as wide as the card has room.
    expect(tiny).toMatch(cssRule("\\.ams-fill\\.with-ht \\.ams-head", "min-width: 0;"));
  });

  it("keeps a unit's width when its humidity or temperature changes", () => {
    // Else a unit beside the column could go below it at 10 % and back at 9 %:
    // room for 99 % and 88 °C.
    const sheet = styleText();
    expect(sheet).toMatch(cssRule("\\.ams-env > span", "font-variant-numeric: tabular-nums;"));
    expect(sheet).toMatch(cssRule("\\.ams-hum", "min-width: calc\\(14px \\+ 4ch\\);"));
    expect(sheet).toMatch(cssRule("\\.ams-temp", "min-width: calc\\(14px \\+ 4\\.5ch\\);"));
  });
});

describe("the AMS model chip", () => {
  const heads = (card: FakeCard): string[][] =>
    findAll(card, ".unit-head").map((head) => [text(head.querySelector(".unit-name")), text(head.querySelector(".unit-model"))]);

  it("names the first AMS too where the printer has AMS units of two models", async () => {
    const devices = x1c();
    const printer = devices[0] as FakeDevice;
    devices.push(amsDevice({ printer, amsId: 1, model: "AMS 2 Pro", humidity: 12, slots: [{ name: "PLA Basic", type: "PLA", color: "#FFFFFF", trayId: 4 }] }));
    const { card } = await mount(devices, "dev-x1c", { start_view: "filament" });
    expect(heads(card)).toEqual([
      ["AMS A", "AMS"],
      ["AMS B", "AMS 2 Pro"],
      ["External spool", ""],
    ]);
  });

  it("leaves it out where all AMS units are of one model, and on an AMS HT", async () => {
    const devices = x1c();
    const printer = devices[0] as FakeDevice;
    devices.push(amsDevice({ printer, amsId: 1, model: "AMS", humidity: 12, slots: [{ name: "PLA Basic", type: "PLA", color: "#FFFFFF", trayId: 4 }] }));
    const same = await mount(devices, "dev-x1c", { start_view: "filament" });
    expect(heads(same.card)).toEqual([
      ["AMS A", ""],
      ["AMS B", ""],
      ["External spool", ""],
    ]);
    // An AMS HT beside an AMS 2 Pro: two models, but "AMS HT" says its own.
    const { card } = await mount(h2d(), "dev-h2d", { start_view: "filament" });
    expect(heads(card)).toEqual([
      ["AMS A", "AMS 2 Pro"],
      ["AMS HT A", ""],
      ["External spools", ""],
    ]);
  });
});

describe("the AMS strip's heads", () => {
  const head = (group: Element): (string | null)[] => [text(group.querySelector(".ams-line")), group.querySelector(".ams-env") ? text(group.querySelector(".ams-env")) : null];

  it("puts the name and the model on the first line, humidity and temperature on the second", async () => {
    const { card } = await mount(h2d(), "dev-h2d");
    expect(findAll(card, ".ams-strip .ams-group").map(head)).toEqual([
      // The nozzle each unit feeds, as L or R.
      ["AMS A AMS 2 Pro R", `14${NBSP}% 52${NBSP}°C`],
      ["AMS HT A L", `9${NBSP}% 30${NBSP}°C`],
      // Two external spools: their L and R stand where the second line would.
      ["Ext", null],
    ]);
  });

  it("keeps the second line where there is nothing to show, so a row's colours line up", async () => {
    const { card } = await mount(x1c(), "dev-x1c");
    expect(findAll(card, ".ams-strip .ams-group").map(head)).toEqual([
      ["AMS A", `21${NBSP}% 27${NBSP}°C`],
      ["Ext", ""],
    ]);
    const lite = await mount(a1mini(), "dev-a1mini");
    expect(findAll(lite.card, ".ams-strip .ams-group").map(head)).toEqual([
      ["AMS A AMS Lite", ""],
      ["Ext", ""],
    ]);
  });

  it("names the model as the filament view does: the first AMS too beside another model", async () => {
    const devices = x1c();
    const printer = devices[0] as FakeDevice;
    devices.push(amsDevice({ printer, amsId: 1, model: "AMS 2 Pro", humidity: 12, temperature: 26, slots: [{ name: "PLA Basic", type: "PLA", color: "#FFFFFF", trayId: 4 }] }));
    const { card } = await mount(devices, "dev-x1c");
    expect(findAll(card, ".ams-strip .ams-line").map(text)).toEqual(["AMS A AMS", "AMS B AMS 2 Pro", "Ext"]);
  });

  it("gives every line one height, so a row's colours stand level", () => {
    const sheet = styleText();
    expect(sheet).toMatch(cssRule("\\.ams-line,\\s*\\.ams-env", "height: 15px;"));
    // The L and R of two external spools: as high as the second line.
    expect(sheet).toMatch(cssRule("\\.slot-side", "height: 13px;[^}]*line-height: 13px;"));
    // The chip a shade darker than the strip it sits on.
    expect(sheet).toMatch(cssRule("\\.ams-strip \\.unit-model,\\s*\\.ams-strip \\.ams-nozzle", "background: var\\(--bb-tint-2\\);"));
  });
});

describe("the nozzle an AMS unit feeds", () => {
  it("is named beside the unit in the Filament tab, as L or R in the Status tab's strip, and in the load question", async () => {
    const { card } = await mount(h2d({ status: "idle", stage: "idle", hms: [] }), "dev-h2d", { start_view: "filament" });
    // Short, as in the strip: L or R, the full word for a screen reader.
    expect(findAll(card, ".unit-head .unit-nozzle > span[aria-hidden]").map(text)).toEqual(["R", "L"]);
    expect(findAll(card, ".unit-head .unit-nozzle .sr-only").map(text)).toEqual(["Right nozzle", "Left nozzle"]);

    const strip = await mount(h2d({ status: "idle", stage: "idle", hms: [] }), "dev-h2d");
    expect(findAll(strip.card, ".ams-line .ams-nozzle").map(text)).toEqual(["R", "L"]);
    expect(text(find(strip.card, "#ams-said"))).toContain("AMS A (AMS 2 Pro, right nozzle)");

    (findAll<HTMLButtonElement>(card, ".slot .btn").find((item) => text(item) === "Load") as HTMLButtonElement).click();
    await settle(card);
    expect(text(find(card, "dialog p"))).toContain("The printer heats the right nozzle");
  });

  it("is not there on a printer with one nozzle", async () => {
    const { card } = await withX1c({}, { start_view: "filament" });
    expect(find(card, ".unit-nozzle")).toBeNull();
    const strip = await withX1c({});
    expect(find(strip.card, ".ams-nozzle")).toBeNull();
  });
});
