import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { findPrinter } from "../src/discovery";
import { subtitle } from "../src/header";
import { ICONS } from "../src/icons";
import type { CardContext } from "../src/parts";
import type { Hass, PrinterRefs } from "../src/types";
import {
  a1mini,
  h2d,
  instanceDevice,
  makeHass,
  mountCard,
  offlineP1s,
  p1s,
  readOnlyX1c,
  unreachable,
  x1c,
  type FakeCard,
  type FakeDevice,
  type FakeHass,
  type FakeHassOptions,
  type PrinterSpec,
} from "./fixtures";
import { button, find, findAll, hasButton, NBSP, press, root, settle, styleText, text, update } from "./helpers";

const PRINTERS = {
  x1c: [x1c, "dev-x1c"],
  h2d: [h2d, "dev-h2d"],
  a1mini: [a1mini, "dev-a1mini"],
  p1s: [p1s, "dev-p1s"],
  offline: [offlineP1s, "dev-p1s"],
  readOnly: [readOnlyX1c, "dev-x1c"],
} as const;

type Name = keyof typeof PRINTERS;

async function cardFor(
  name: Name,
  options: {
    language?: string;
    devices?: FakeDevice[];
    config?: Record<string, unknown>;
    admin?: boolean;
    callService?: FakeHassOptions["callService"];
  } = {},
): Promise<{ card: FakeCard; hass: FakeHass }> {
  const [devices, printer] = PRINTERS[name];
  const hass = makeHass({
    devices: options.devices ?? (devices as () => FakeDevice[])(),
    language: options.language ?? "en",
    ...(options.admin === undefined ? {} : { admin: options.admin }),
    ...(options.callService ? { callService: options.callService } : {}),
  });
  const card = await mountCard(hass, { printer, ...(options.config ?? {}) });
  return { card, hass };
}

const withX1c = (overrides: Partial<PrinterSpec>) => cardFor("x1c", { devices: x1c(overrides) });

/** The status chips under the title, by their kind. */
const pill = (card: FakeCard, kind: "network" | "hms" | "firmware"): HTMLElement | null => find(card, `.pills .pill.${kind}`);
const toneOf = (element: Element | null): string | undefined => [...(element?.classList ?? [])].find((name) => name.startsWith("tone-"));
const iconOf = (element: Element | null): string | null | undefined => element?.querySelector(".icon path")?.getAttribute("d");

/** The open dialog's rows: label and value. */
const rows = (card: FakeCard): [string, string][] => findAll(card, "dialog .spec-row").map((row) => [text(row.querySelector(".spec-label")), text(row.querySelector(".spec-value"))]);

const MINUS = "−";

const css = styleText;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("the title", () => {
  it("is the printer's name in BamBuddy, with its model, nozzle and print hours below", async () => {
    const { card } = await cardFor("x1c");
    expect(text(find(card, ".name"))).toBe("Workshop");
    expect(text(find(card, ".model"))).toBe(`X1C · 0.4${NBSP}mm · 559 h`);
    // The rest of the head: the dot, the light, the menu -- the state is
    // the job's line, no chip beside the light.
    expect(find(card, ".dot")?.classList.contains("on")).toBe(true);
    expect(find(card, ".head .chip")).toBeNull();
    expect(hasButton(card, "Chamber light")).toBe(true);
    const { card: desk } = await cardFor("a1mini");
    // BamBuddy's name comes first, also where the device was renamed.
    expect(text(find(desk, ".name"))).toBe("Desk");
    expect(text(find(desk, ".model"))).toBe(`A1 Mini · 0.4${NBSP}mm · 87 h`);
  });

  it("falls back to the device's name, the user's first, without the model and serial after BamBuddy's name", async () => {
    // Without a name in BamBuddy, the serial tells the printer apart: it stays.
    const { card } = await cardFor("offline");
    expect(text(find(card, ".name"))).toBe("P1S (01P00A400000999)");
    // Offline: the nozzle is unknown, the print hours are BamBuddy's.
    expect(text(find(card, ".model"))).toBe("P1S · 2,411 h");
    const { card: renamed } = await cardFor("a1mini", { devices: a1mini({ bambuddyName: null }) });
    expect(text(find(renamed, ".name"))).toBe("Desk A1 mini");
    const { card: empty, hass } = await cardFor("x1c");
    await update(empty, hass.withState("sensor.x1c_print_status", "printing", { bambuddy_name: "" }));
    expect(text(find(empty, ".name"))).toBe("Workshop");
    // A name of the user's own with brackets stays as it is.
    const [printer, ams] = x1c({ bambuddyName: null }) as [FakeDevice, FakeDevice];
    const { card: own } = await cardFor("x1c", { devices: [{ ...printer, nameByUser: "Workshop (left)" }, ams] });
    expect(text(find(own, ".name"))).toBe("Workshop (left)");
  });

  it("names both nozzles of a dual-nozzle printer once where they are alike", async () => {
    const { card } = await cardFor("h2d");
    expect(text(find(card, ".model"))).toBe(`H2D · 0.4${NBSP}mm · 1,203 h`);
    const { card: mixed } = await cardFor("h2d", { devices: h2d({ nozzleDiameters: [0.4, 0.6] }), language: "de" });
    // Two sizes say which side is which.
    expect(text(find(mixed, ".model"))).toBe(`H2D · L 0,4 / R 0,6${NBSP}mm · 1.203 h`);
  });

  it("shows the print hours as Home Assistant formats them, in the unit the user chose", async () => {
    const { card, hass } = await cardFor("x1c");
    await update(card, hass.withState("sensor.x1c_print_hours", "23.31", { unit_of_measurement: "d", device_class: "duration" }));
    expect(text(find(card, ".model"))).toBe(`X1C · 0.4${NBSP}mm · 23 d`);
    // Without Home Assistant's formatting: rounded, in hours.
    const plain = makeHass({ devices: x1c() });
    const bare = { ...plain, formatEntityState: undefined } as unknown as Hass;
    const ctx = { hass: bare, refs: findPrinter(plain, "dev-x1c") as PrinterRefs } as CardContext;
    expect(subtitle(ctx)).toBe(`X1C · 0.4${NBSP}mm · 559 h`);
  });

  it("is a heading, for those who move through a page by its headings", async () => {
    const { card } = await cardFor("x1c");
    expect(find(card, ".name")?.getAttribute("role")).toBe("heading");
    expect(find(card, ".name")?.getAttribute("aria-level")).toBe("2");
  });

  it("may wrap a long name to two lines before it is cut", () => {
    expect(css()).toMatch(/\.name\s*\{[^}]*-webkit-line-clamp: 2/);
    expect(css()).not.toMatch(/\.name\s*\{[^}]*white-space: nowrap/);
  });

  it("leaves out what it does not know", async () => {
    const [printer] = x1c() as [FakeDevice];
    const bare = { ...printer, model: "", entities: printer.entities.filter((entity) => !/nozzle_diameter|print_hours/.test(entity.key)) };
    const { card } = await cardFor("x1c", { devices: [bare] });
    expect(find(card, ".model")).toBeNull();
    const { card: noHours } = await cardFor("x1c", { devices: [{ ...printer, entities: printer.entities.filter((entity) => entity.key !== "print_hours") }] });
    expect(text(find(noHours, ".model"))).toBe(`X1C · 0.4${NBSP}mm`);
  });
});

describe("the head's chips", () => {
  it("show the Wi-Fi signal in the colour of its strength", async () => {
    const { card } = await cardFor("x1c");
    const network = pill(card, "network");
    expect(text(network)).toBe(`${MINUS}52${NBSP}dBm`);
    // Named as the LAN chip is: "Network: LAN (wired)".
    // The colour's word too, for a screen reader.
    expect(network?.getAttribute("aria-label")).toBe(`Network: Wi-Fi, ${MINUS}52${NBSP}dBm, good`);
    expect(toneOf(network)).toBe("tone-ok");
    expect(iconOf(network)).toBe(ICONS.wifi);
    // −67 dBm and better is good, as Wi-Fi is commonly judged; down to
    // −75 dBm fair, below weak. A signal near −60 dBm no longer flips.
    for (const [dbm, tone, word] of [
      [-60, "tone-ok", "good"],
      [-63, "tone-ok", "good"],
      [-67, "tone-ok", "good"],
      [-68, "tone-warn", "fair"],
      [-75, "tone-warn", "fair"],
      [-76, "tone-err", "weak"],
    ] as const) {
      const { card: other } = await withX1c({ wifi: dbm });
      expect(toneOf(pill(other, "network")), String(dbm)).toBe(tone);
      expect(pill(other, "network")?.getAttribute("aria-label"), String(dbm)).toMatch(new RegExp(`, ${word}$`));
    }
  });

  it("show LAN for a printer on Ethernet, green like a good Wi-Fi signal, and nothing for one BamBuddy cannot reach", async () => {
    const { card } = await cardFor("h2d");
    expect(text(pill(card, "network"))).toBe("LAN");
    expect(pill(card, "network")?.getAttribute("aria-label")).toBe("Network: LAN (wired)");
    expect(iconOf(pill(card, "network"))).toBe(ICONS.ethernet);
    expect(toneOf(pill(card, "network"))).toBe("tone-ok");
    // The dot and the job say Offline already.
    const { card: offline } = await cardFor("offline");
    expect(pill(offline, "network")).toBeNull();
  });

  it("leave the network out where it is unknown", async () => {
    const { card, hass } = await cardFor("x1c");
    await update(card, hass.withState("sensor.x1c_wifi_signal", "unknown"));
    expect(pill(card, "network")).toBeNull();
  });

  it("open the network sensor's more-info dialog", async () => {
    const opened: string[] = [];
    for (const name of ["x1c", "h2d"] as const) {
      const { card } = await cardFor(name);
      card.addEventListener("hass-more-info", (event) => opened.push((event as CustomEvent<{ entityId: string }>).detail.entityId));
      pill(card, "network")?.click();
    }
    expect(opened).toEqual(["sensor.x1c_wifi_signal", "binary_sensor.h2d_wired_network"]);
  });

  it("say OK without HMS messages, else how many there are in the colour of the worst", async () => {
    const { card } = await cardFor("x1c");
    expect(text(pill(card, "hms"))).toBe("HMS OK");
    expect(pill(card, "hms")?.getAttribute("aria-label")).toBe("HMS messages: none");
    expect(toneOf(pill(card, "hms"))).toBe("tone-ok");
    expect(iconOf(pill(card, "hms"))).toBe(ICONS.shieldCheck);
    const { card: garage } = await cardFor("p1s");
    expect(text(pill(garage, "hms"))).toBe("3 HMS");
    expect(pill(garage, "hms")?.getAttribute("aria-label")).toBe("HMS messages: 3");
    expect(toneOf(pill(garage, "hms"))).toBe("tone-err");
    expect(iconOf(pill(garage, "hms"))).toBe(ICONS.shieldAlert);
    const { card: studio } = await cardFor("h2d");
    expect(toneOf(pill(studio, "hms"))).toBe("tone-warn");
    const { card: notice } = await withX1c({ hms: [{ code: "0500040000030002", severity: "notice", description: null }] });
    expect(toneOf(pill(notice, "hms"))).toBe("tone-info");
    const { card: odd } = await withX1c({ hms: [{ code: "1", severity: "fatal", description: null }] });
    expect(toneOf(pill(odd, "hms"))).toBe("tone-warn");
  });

  it("announce a change politely, but not the Wi-Fi signal's", async () => {
    const { card } = await cardFor("x1c");
    expect(find(card, ".pills")?.getAttribute("aria-live")).toBe("polite");
    expect(pill(card, "network")?.getAttribute("aria-live")).toBe("off");
  });

  it("line up with the tabs and the blocks below, also on a very narrow card", () => {
    // The card's padding: 16 px, 12 px below 340 px -- one left edge under the head.
    expect(css()).toMatch(/ha-card\s*\{[^}]*--bb-inset: 16px/);
    expect(css()).toMatch(/@container \(max-width: 340px\)\s*\{[^@]*ha-card\s*\{[^}]*--bb-inset: 12px/);
    // On both sides, as the tabs and the blocks below.
    expect(css()).toMatch(/\.pills\s*\{[^}]*margin: -2px var\(--bb-inset\) 10px/);
    expect(css()).toMatch(/\.hms-line\s*\{[^}]*margin: -4px var\(--bb-inset\) 10px/);
    expect(css()).toMatch(/\.hms-line\s*\{[^}]*width: calc\(100% - 2 \* var\(--bb-inset\)\)/);
  });

  it("are easy to hit on a touch screen without looking bigger", () => {
    expect(css()).toMatch(/@media \(pointer: coarse\)\s*\{[^}]*button\.pill::before\s*\{[^}]*inset: -3px 0/);
  });

  it("leave HMS out offline or without the sensor", async () => {
    const { card } = await cardFor("offline");
    expect(pill(card, "hms")).toBeNull();
    const [printer] = x1c() as [FakeDevice];
    const { card: bare } = await cardFor("x1c", { devices: [{ ...printer, entities: printer.entities.filter((entity) => entity.key !== "hms_errors") }] });
    expect(pill(bare, "hms")).toBeNull();
  });

  it("show the installed firmware: orange with an update, green without, neutral when unknown", async () => {
    const { card } = await cardFor("x1c");
    expect(text(pill(card, "firmware"))).toBe("01.08.02.00");
    expect(pill(card, "firmware")?.getAttribute("aria-label")).toBe("Firmware 01.08.02.00: update available");
    expect(toneOf(pill(card, "firmware"))).toBe("tone-warn");
    expect(iconOf(pill(card, "firmware"))).toBe(ICONS.download);
    const { card: studio } = await cardFor("h2d");
    expect(pill(studio, "firmware")?.getAttribute("aria-label")).toBe("Firmware 01.02.00.00: up to date");
    expect(toneOf(pill(studio, "firmware"))).toBe("tone-ok");
    expect(iconOf(pill(studio, "firmware"))).toBe(ICONS.check);
    const { card: garage } = await cardFor("p1s");
    expect(text(pill(garage, "firmware"))).toBe("01.07.00.00");
    expect(pill(garage, "firmware")?.getAttribute("aria-label")).toBe("Firmware 01.07.00.00");
    expect(toneOf(pill(garage, "firmware"))).toBe("tone-neutral");
    expect(iconOf(pill(garage, "firmware"))).toBe(ICONS.memory);
    // Offline the printer confirms nothing: no green tick; a known update stays orange.
    const current = { installed: "01.09.01.00", latest: "01.09.01.00", state: "off" };
    const { card: offline } = await cardFor("x1c", { devices: x1c({ online: false, firmware: current }) });
    expect(toneOf(pill(offline, "firmware"))).toBe("tone-neutral");
    expect(iconOf(pill(offline, "firmware"))).toBe(ICONS.memory);
    expect(pill(offline, "firmware")?.getAttribute("aria-label")).toBe("Firmware 01.09.01.00 (printer offline)");
    const { card: behind } = await cardFor("x1c", { devices: x1c({ online: false }) });
    expect(toneOf(pill(behind, "firmware"))).toBe("tone-warn");
    // No version, no update known: no chip; no update entity: none either.
    const { card: none } = await withX1c({ firmware: { installed: null, latest: null } });
    expect(pill(none, "firmware")).toBeNull();
    const { card: missing } = await cardFor("a1mini");
    expect(pill(missing, "firmware")).toBeNull();
    // An update known, the installed version not: the chip says Firmware.
    const { card: anonymous } = await withX1c({ firmware: { installed: null, latest: "01.09.00.00", state: "on" } });
    expect(text(pill(anonymous, "firmware"))).toBe("Firmware");
  });

  it("are no longer an HMS banner in the status view", async () => {
    const { card } = await cardFor("p1s");
    expect(find(card, ".body .hms")).toBeNull();
    expect(hasButton(card, "Clear HMS errors")).toBe(false);
  });

  it("say it in German", async () => {
    const { card } = await cardFor("x1c", { language: "de" });
    expect(pill(card, "network")?.getAttribute("aria-label")).toBe(`Netzwerk: WLAN, ${MINUS}52${NBSP}dBm, gut`);
    expect(pill(card, "hms")?.getAttribute("aria-label")).toBe("HMS-Meldungen: keine");
    expect(text(pill(card, "hms"))).toBe("HMS OK");
    expect(pill(card, "firmware")?.getAttribute("aria-label")).toBe("Firmware 01.08.02.00: Update verfügbar");
    const { card: studio } = await cardFor("h2d", { language: "de" });
    expect(pill(studio, "firmware")?.getAttribute("aria-label")).toBe("Firmware 01.02.00.00: aktuell");
  });
});

describe("the HMS line", () => {
  const line = (card: FakeCard): HTMLButtonElement | null => find<HTMLButtonElement>(card, "button.hms-line");
  const error = { code: "0300010000010001", severity: "error", description: "The heatbed temperature is abnormal." };
  const warning = { code: "0300120000020001", severity: "warning", description: "The front cover of the toolhead fell off." };
  const notice = { code: "0500040000030002", severity: "notice", description: null };

  it("shows the worst message of an error, and how many more there are", async () => {
    const { card } = await cardFor("p1s");
    expect(text(line(card)?.querySelector(".hms-line-text"))).toBe("The nozzle temperature is abnormal; the heater may be short-circuited.");
    expect(text(line(card)?.querySelector(".hms-line-more"))).toBe("+2 more");
    expect(toneOf(line(card))).toBe("tone-err");
    expect(iconOf(line(card))).toBe(ICONS.error);
    // Right under the chips.
    expect(find(card, ".pills")?.nextElementSibling).toBe(line(card));
    line(card)?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Printer messages (HMS)");
    const { card: one } = await withX1c({ hms: [error] });
    expect(text(line(one))).toBe("The heatbed temperature is abnormal.");
    expect(line(one)?.querySelector(".hms-line-more")).toBeNull();
  });

  it("says nothing of warnings and notices while the printer prints", async () => {
    const { card } = await withX1c({ hms: [warning, notice] });
    expect(line(card)).toBeNull();
    const { card: clear } = await cardFor("x1c");
    expect(line(clear)).toBeNull();
    const { card: offline } = await cardFor("offline");
    expect(line(offline)).toBeNull();
  });

  it("says why a paused or failed print stopped, in the colour of the worst message", async () => {
    const { card } = await cardFor("h2d");
    expect(text(line(card))).toBe("The build plate marker was not detected. Check that the plate is placed correctly.");
    expect(toneOf(line(card))).toBe("tone-warn");
    // Without a description, its severity.
    const { card: failed, hass } = await withX1c({ status: "failed", hms: [notice] });
    expect(text(line(failed))).toBe("Notice");
    expect(toneOf(line(failed))).toBe("tone-info");
    // A count without the list.
    await update(failed, hass.withState("sensor.x1c_hms_errors", "2", {}));
    expect(text(line(failed))).toBe("HMS errors: 2");
    // Paused without a message: nothing to say.
    const { card: paused } = await cardFor("h2d", { devices: h2d({ hms: [] }) });
    expect(line(paused)).toBeNull();
  });

  it("is one line at most", () => {
    expect(css()).toMatch(/\.hms-line-text\s*\{[^}]*text-overflow: ellipsis/);
    expect(css()).toMatch(/\.hms-line-text\s*\{[^}]*white-space: nowrap/);
  });

  it("says it in German", async () => {
    const { card } = await cardFor("p1s", { language: "de" });
    expect(text(line(card)?.querySelector(".hms-line-more"))).toBe("+2 weitere");
    const { card: failed } = await cardFor("x1c", { language: "de", devices: x1c({ status: "failed", hms: [notice] }) });
    expect(text(line(failed))).toBe("Hinweis");
  });
});

describe("the HMS dialog", () => {
  it("lists every message with its severity and code, the worst first, and clears them", async () => {
    const { card, hass } = await cardFor("p1s");
    pill(card, "hms")?.click();
    await card.updateComplete;
    // "HMS" says nothing to a beginner: whose messages they are.
    expect(text(find(card, "dialog h2"))).toBe("Printer messages (HMS)");
    const items = findAll(card, "dialog .hms-item");
    expect(items.map((item) => [...item.classList].find((name) => name.startsWith("sev-")))).toEqual(["sev-error", "sev-warning", "sev-notice"]);
    expect(items.map((item) => iconOf(item))).toEqual([ICONS.error, ICONS.warning, ICONS.info]);
    expect(findAll(card, "dialog .hms-text").map(text)).toEqual([
      "The nozzle temperature is abnormal; the heater may be short-circuited.",
      "The front cover of the toolhead fell off.",
      "Notice: BamBuddy has no text for this code.",
    ]);
    expect(findAll(card, "dialog .hms-code").map(text)).toEqual(["0300_0100_0001_0001", "0300_1200_0002_0001", "0500_0400_0003_0002"]);
    // Clearing does not fix the problem: said where it is offered.
    expect(findAll(card, "dialog .dlg-note").map(text)).toEqual(["Clearing only removes the message: errors the printer still sees come back."]);
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close", "Clear HMS errors"]);
    expect(root(card).activeElement).toBe(find(card, "dialog .btn.safe"));
    await press(card, "Clear HMS errors");
    expect(hass.calls.at(-1)).toMatchObject({ domain: "button", service: "press", data: { entity_id: "button.p1s_clear_hms_errors" } });
    expect(find(card, "dialog")).toBeNull();
    expect(text(find(card, ".sent"))).toBe("Sent");
  });

  it("answers a message as the printer's screen would; stopping asks first and comes back", async () => {
    const { card, hass } = await cardFor("p1s");
    const answerable = {
      code: "0700_2000_0002_0012",
      severity: "warning",
      description: "The filament of AMS slot 2 has run out.",
      actions: ["RESUME_PRINTING", "STOP_PRINTING"],
    };
    await update(card, hass.withState("sensor.p1s_hms_errors", "1", { errors: [answerable] }));
    pill(card, "hms")?.click();
    await card.updateComplete;

    expect(findAll(card, "dialog .hms-item .hms-answers .btn").map(text)).toEqual(["Resume printing", "Stop printing"]);
    // Each answer names the message it answers.
    const described = find(card, "dialog .hms-answers .btn")?.getAttribute("aria-describedby") ?? "";
    expect(text(find(card, `dialog #${described}`))).toBe("The filament of AMS slot 2 has run out.");
    expect(find(card, "dialog a.hms-wiki")?.getAttribute("href")).toBe("https://wiki.bambulab.com/en/hms/home");
    await press(card, "Resume printing");
    expect(hass.calls.at(-1)).toMatchObject({
      domain: "bambuddy",
      service: "answer_hms",
      data: { device_id: "dev-p1s", code: "0700_2000_0002_0012", action: "RESUME_PRINTING" },
    });
    // The message is answered: the dialog ends (review U11).
    expect(find(card, "dialog")).toBeNull();
    pill(card, "hms")?.click();
    await card.updateComplete;

    // A tap focuses the button it lands on.
    button(card, "Stop printing").focus();
    await press(card, "Stop printing");
    expect(text(find(card, "dialog h2"))).toBe("Stop the print?");
    expect(find(card, "dialog .btn.danger")).not.toBeNull();
    await press(card, "Cancel");
    expect(text(find(card, "dialog h2"))).toBe("Printer messages (HMS)");
    // The keyboard's place: back on the button that asked.
    expect(root(card).activeElement?.getAttribute("aria-label")).toBe("Stop printing");
    await press(card, "Stop printing");
    (find(card, "dialog .btn.danger") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(hass.calls.at(-1)).toMatchObject({ domain: "bambuddy", service: "answer_hms", data: { action: "STOP_PRINTING" } });
  });

  it("puts the answers first: the focus in a question, a failure inside the dialog, Clear quiet, the note", async () => {
    const answerable = { code: "0700_2000_0002_0012", severity: "warning", description: "Leer.", actions: ["FILAMENT_LOAD_RESUME", "STOP_PRINTING"] };
    const failing = async (call: { service: string }): Promise<unknown> => {
      if (call.service === "answer_hms") throw new Error("Failed to execute HMS action");
      return undefined;
    };
    const { card, hass } = await cardFor("p1s", { callService: failing });
    await update(card, hass.withState("sensor.p1s_hms_errors", "1", { errors: [answerable] }).withState("sensor.p1s_print_status", "paused"));
    pill(card, "hms")?.click();
    await card.updateComplete;
    // Clearing does not answer the printer: the answers stand out (review U13).
    expect(find(card, "dialog .dlg-actions .btn.tonal")?.textContent?.trim()).toBe("Clear HMS errors");
    expect(findAll(card, "dialog .dlg-note").map(text)).toContain("Check the print, then answer here as on the printer's screen.");
    // The question takes the focus to its safe button (review U1).
    button(card, "Stop printing").focus();
    await press(card, "Stop printing");
    expect(text(root(card).activeElement as Element)).toBe("Cancel");
    await press(card, "Cancel");
    // A failed answer says so inside the dialog (review U4).
    await press(card, "Filament loaded, resume");
    expect(text(find(card, "dialog .dlg-body .toast"))).toContain("Failed to execute HMS action");
    expect(find(card, "ha-card > .toast")).toBeNull();
  });

  it("offers no answer where the card only shows, and names them in German", async () => {
    const errors = [{ code: "0700_2000_0002_0012", severity: "warning", description: "Leer.", actions: ["FILAMENT_LOAD_RESUME"] }];
    const shown = await cardFor("p1s", { config: { read_only: true } });
    await update(shown.card, shown.hass.withState("sensor.p1s_hms_errors", "1", { errors }));
    pill(shown.card, "hms")?.click();
    await shown.card.updateComplete;
    expect(find(shown.card, "dialog .hms-answers")).toBeNull();
    const german = await cardFor("p1s", { language: "de" });
    await update(german.card, german.hass.withState("sensor.p1s_hms_errors", "1", { errors }));
    pill(german.card, "hms")?.click();
    await german.card.updateComplete;
    expect(findAll(german.card, "dialog .hms-answers .btn").map(text)).toEqual(["Filament geladen, fortsetzen"]);
  });

  it("follows the messages while it is open, and says when there are none", async () => {
    const { card, hass } = await cardFor("x1c");
    pill(card, "hms")?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog .hms-empty"))).toBe("No messages");
    // Nothing to clear.
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);
    expect(find(card, "dialog .dlg-note")).toBeNull();
    await update(card, hass.withState("sensor.x1c_hms_errors", "1", { errors: [{ code: "0x0300010000010001", severity: "error", description: "Hot." }] }));
    expect(findAll(card, "dialog .hms-text").map(text)).toEqual(["Hot."]);
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close", "Clear HMS errors"]);
    // A code BamBuddy shortened, an unknown severity, a code that is no text.
    await update(card, hass.withState("sensor.x1c_hms_errors", "2", { errors: [{ code: "0500400E", severity: "fatal", description: "" }, { code: 5 }] }));
    expect(findAll(card, "dialog .hms-text").map(text)).toEqual(Array(2).fill("HMS message: BamBuddy has no text for this code."));
    expect(findAll(card, "dialog .hms-code").map(text)).toEqual(["0500_400E"]);
    expect(findAll(card, "dialog .hms-item").map((item) => item.classList.contains("sev-warning"))).toEqual([true, true]);
    // A count without the list.
    await update(card, hass.withState("sensor.x1c_hms_errors", "2", {}));
    expect(text(find(card, "dialog .hms-empty"))).toBe("HMS errors: 2");
    await press(card, "Close");
    expect(find(card, "dialog")).toBeNull();
  });

  it("says what to do next while a message holds the print paused", async () => {
    const { card } = await cardFor("h2d");
    pill(card, "hms")?.click();
    await card.updateComplete;
    expect(findAll(card, "dialog .dlg-note").map(text)).toEqual([
      "Check the print, then resume or stop it.",
      "Clearing only removes the message: errors the printer still sees come back.",
    ]);
    // Without control, only the next step.
    const { card: readOnly } = await cardFor("h2d", { devices: h2d({ control: false }) });
    pill(readOnly, "hms")?.click();
    await readOnly.updateComplete;
    // ... at the printer or in BamBuddy: the card offers neither then.
    expect(findAll(readOnly, "dialog .dlg-note").map(text)).toEqual(["Check the print, then resume or stop it at the printer or in BamBuddy."]);
    // Controls hidden on such a key: Home Assistant has no button either.
    const { card: both } = await cardFor("h2d", { devices: h2d({ control: false }), config: { read_only: true } });
    pill(both, "hms")?.click();
    await both.updateComplete;
    expect(findAll(both, "dialog .dlg-note").map(text)).toEqual(["Check the print, then resume or stop it at the printer or in BamBuddy."]);
    // Controls hidden: Home Assistant can too.
    const { card: display } = await cardFor("h2d", { config: { read_only: true } });
    pill(display, "hms")?.click();
    await display.updateComplete;
    expect(findAll(display, "dialog .dlg-note").map(text)).toEqual([
      "Check the print, then resume or stop it at the printer, in BamBuddy or in Home Assistant.",
    ]);
    const { card: german } = await cardFor("h2d", { language: "de" });
    pill(german, "hms")?.click();
    await german.updateComplete;
    expect(text(find(german, "dialog h2"))).toBe("Meldungen des Druckers (HMS)");
    expect(findAll(german, "dialog .dlg-note").map(text)).toEqual([
      "Prüfe den Druck. Danach: Druck fortsetzen oder stoppen.",
      "Löschen entfernt nur die Meldung: Fehler, die der Drucker weiter sieht, meldet er erneut.",
    ]);
  });

  it("offers no clearing without Control Printer or with the controls hidden", async () => {
    const { card } = await cardFor("readOnly", { devices: readOnlyX1c({ hms: [{ code: "1", severity: "error", description: "x" }] }) });
    pill(card, "hms")?.click();
    await card.updateComplete;
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);
    expect(find(card, "dialog .dlg-note")).toBeNull();
    const { card: plain } = await cardFor("p1s", { config: { read_only: true } });
    pill(plain, "hms")?.click();
    await plain.updateComplete;
    expect(findAll(plain, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);
  });

  it("says it in German", async () => {
    const { card } = await cardFor("p1s", { language: "de" });
    pill(card, "hms")?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Meldungen des Druckers (HMS)");
    expect(findAll(card, "dialog .hms-text").map(text).at(-1)).toBe("Hinweis: BamBuddy hat keinen Text zu diesem Code.");
    expect(text(find(card, "dialog .dlg-note"))).toBe("Löschen entfernt nur die Meldung: Fehler, die der Drucker weiter sieht, meldet er erneut.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Schließen", "HMS-Fehler löschen"]);
    const { card: none } = await cardFor("x1c", { language: "de" });
    pill(none, "hms")?.click();
    await none.updateComplete;
    expect(text(find(none, "dialog .hms-empty"))).toBe("Keine Meldungen");
  });
});

describe("the firmware dialog", () => {
  it("shows the installed and the available version, and opens the release notes", async () => {
    const { card } = await cardFor("x1c");
    const opened: string[] = [];
    card.addEventListener("hass-more-info", (event) => opened.push((event as CustomEvent<{ entityId: string }>).detail.entityId));
    pill(card, "firmware")?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Firmware");
    expect(rows(card)).toEqual([
      ["Installed", "01.08.02.00"],
      ["Available", "01.09.00.00"],
    ]);
    expect(find(card, "dialog .spec-row:nth-child(2) .spec-value")?.classList.contains("update")).toBe(true);
    expect(find(card, "dialog a")).toBeNull();
    expect(text(find(card, "dialog .dlg-note"))).toBe("Install updates on the printer, in Bambu Handy or in BamBuddy.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);
    // Home Assistant's update dialog shows the release notes: the card's closes.
    await press(card, "Release notes");
    expect(opened).toEqual(["update.x1c_firmware"]);
    expect(find(card, "dialog")).toBeNull();
  });

  it("leaves out what it does not know", async () => {
    const { card } = await cardFor("h2d");
    pill(card, "firmware")?.click();
    await card.updateComplete;
    expect(rows(card)).toEqual([
      ["Installed", "01.02.00.00"],
      ["Latest", "01.02.00.00"],
    ]);
    expect(find(card, "dialog .spec-value.update")).toBeNull();
    // Up to date: no release notes to read.
    expect(hasButton(card, "Release notes")).toBe(false);
    const { card: garage } = await cardFor("p1s");
    pill(garage, "firmware")?.click();
    await garage.updateComplete;
    expect(rows(garage)).toEqual([["Installed", "01.07.00.00"]]);
  });

  it("says it in German", async () => {
    const { card } = await cardFor("x1c", { language: "de" });
    pill(card, "firmware")?.click();
    await card.updateComplete;
    expect(rows(card).map(([label]) => label)).toEqual(["Installiert", "Verfügbar"]);
    expect(hasButton(card, "Versionshinweise")).toBe(true);
    expect(text(find(card, "dialog .dlg-note"))).toBe("Installiere Updates am Drucker, in Bambu Handy oder in BamBuddy.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Schließen"]);
    const { card: studio } = await cardFor("h2d", { language: "de" });
    pill(studio, "firmware")?.click();
    await studio.updateComplete;
    expect(rows(studio).map(([label]) => label)).toEqual(["Installiert", "Neueste"]);
  });
});

describe("the menu", () => {
  const trigger = (card: FakeCard): HTMLButtonElement => find<HTMLButtonElement>(card, ".menu-btn") as HTMLButtonElement;
  const items = (card: FakeCard): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, "[role=menu] [role=menuitem]");
  const open = async (card: FakeCard): Promise<void> => {
    trigger(card).click();
    await settle(card);
  };
  const key = async (card: FakeCard, name: string, target?: Element | null): Promise<void> => {
    (target ?? (root(card).activeElement as HTMLElement)).dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, composed: true }));
    await settle(card);
  };

  it("opens below the three dots, after the light, with the focus on its first item", async () => {
    const { card } = await cardFor("x1c");
    const dots = trigger(card);
    expect(dots.getAttribute("aria-label")).toBe("More options");
    expect(dots.getAttribute("aria-haspopup")).toBe("menu");
    expect(dots.getAttribute("aria-expanded")).toBe("false");
    expect(iconOf(dots)).toBe(ICONS.dotsVertical);
    // The last thing in the head.
    expect(find(card, ".head")?.lastElementChild?.contains(dots)).toBe(true);
    expect(find(card, "[role=menu]")).toBeNull();
    await open(card);
    expect(dots.getAttribute("aria-expanded")).toBe("true");
    expect(items(card).map(text)).toEqual(["Open device page", "Printer information", "Refresh status", "Check connection"]);
    expect(root(card).activeElement).toBe(items(card)[0]);
    await open(card);
    expect(find(card, "[role=menu]")).toBeNull();
  });

  it("moves with the arrow keys and closes on Escape, Tab and a tap beside it", async () => {
    const { card } = await cardFor("x1c");
    await open(card);
    await key(card, "ArrowDown");
    expect(root(card).activeElement).toBe(items(card)[1]);
    await key(card, "ArrowUp");
    await key(card, "ArrowUp");
    expect(root(card).activeElement).toBe(items(card).at(-1));
    await key(card, "Home");
    expect(root(card).activeElement).toBe(items(card)[0]);
    await key(card, "End");
    expect(root(card).activeElement).toBe(items(card).at(-1));
    await key(card, "x");
    expect(root(card).activeElement).toBe(items(card).at(-1));
    await key(card, "Escape");
    expect(find(card, "[role=menu]")).toBeNull();
    expect(root(card).activeElement).toBe(trigger(card));
    await open(card);
    await key(card, "Tab");
    expect(find(card, "[role=menu]")).toBeNull();
    await open(card);
    // A tap in the menu itself keeps it; one anywhere else closes it.
    find(card, "[role=menu]")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }));
    await settle(card);
    expect(find(card, "[role=menu]")).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }));
    await settle(card);
    expect(find(card, "[role=menu]")).toBeNull();
    // Closed, the page's taps are not the card's business.
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }));
    // The arrow down on the dots opens it too.
    await key(card, "ArrowDown", trigger(card));
    expect(root(card).activeElement).toBe(items(card)[0]);
    expect(find(card, "[role=menu]")).not.toBeNull();
  });

  it("offers the device page only to an administrator", async () => {
    const { card } = await cardFor("x1c", { admin: false });
    await open(card);
    expect(items(card).map(text)).toEqual(["Printer information", "Refresh status", "Check connection"]);
    expect(root(card).activeElement).toBe(items(card)[0]);
    // A hass without a user says nothing about it either.
    const hass = makeHass({ devices: x1c() });
    delete (hass as Partial<Hass>).user;
    const nobody = await mountCard(hass, { printer: "dev-x1c" });
    await open(nobody);
    expect(items(nobody).map(text)).toEqual(["Printer information", "Refresh status", "Check connection"]);
  });

  it("gives the focus back to the three dots after an item, and after the dialog it opened", async () => {
    const { card } = await cardFor("readOnly");
    await open(card);
    await press(card, "Refresh status");
    expect(root(card).activeElement).toBe(trigger(card));
    await open(card);
    await press(card, "Printer information");
    expect(root(card).activeElement).toBe(find(card, "dialog .btn.safe"));
    await press(card, "Close");
    expect(find(card, "dialog")).toBeNull();
    expect(root(card).activeElement).toBe(trigger(card));
    // The dialog's own close -- Escape -- does the same.
    await open(card);
    await press(card, "Printer information");
    find(card, "dialog")?.dispatchEvent(new Event("close"));
    await settle(card);
    expect(root(card).activeElement).toBe(trigger(card));
    // A dialog a chip opened leaves the focus where it was.
    trigger(card).blur();
    pill(card, "hms")?.click();
    await settle(card);
    await press(card, "Close");
    expect(root(card).activeElement).not.toBe(trigger(card));
  });

  it("opens Home Assistant's device page", async () => {
    const { card } = await cardFor("x1c");
    const changes: unknown[] = [];
    const listener = (event: Event): void => {
      changes.push((event as CustomEvent).detail);
    };
    window.addEventListener("location-changed", listener);
    try {
      await open(card);
      await press(card, "Open device page");
      expect(window.location.pathname).toBe("/config/devices/device/dev-x1c");
      expect(changes).toEqual([{ replace: false }]);
      expect(find(card, "[role=menu]")).toBeNull();
    } finally {
      window.removeEventListener("location-changed", listener);
      history.pushState(null, "", "/");
    }
  });

  it("refreshes the status, also without Control Printer, and waits while the printer is offline", async () => {
    const { card, hass } = await cardFor("readOnly");
    await open(card);
    await press(card, "Refresh status");
    expect(hass.calls.at(-1)).toMatchObject({ domain: "button", service: "press", data: { entity_id: "button.x1c_refresh_status" } });
    expect(find(card, "[role=menu]")).toBeNull();
    expect(text(find(card, ".sent"))).toBe("Sent");
    const { card: offline } = await cardFor("offline");
    await open(offline);
    expect(button(offline, "Refresh status").disabled).toBe(true);
    // A printer without the button: the item is left out.
    const [printer] = x1c() as [FakeDevice];
    const { card: bare } = await cardFor("x1c", { devices: [{ ...printer, entities: printer.entities.filter((entity) => entity.key !== "refresh_status") }] });
    await open(bare);
    expect(items(bare).map(text)).toEqual(["Open device page", "Printer information", "Check connection"]);
  });

  it("says in the printer information that BamBuddy cannot be reached, with no print status", async () => {
    // The firmware comes from BamBuddy's update check: it may still answer.
    const firmware = (x1c() as [FakeDevice])[0].entities.find((entity) => entity.key === "firmware");
    const devices = unreachable(x1c()).map((device) => ({
      ...device,
      entities: device.entities.map((entity) => (entity.key === "firmware" && firmware ? { ...firmware, state: "off" } : entity)),
    }));
    const { card } = await cardFor("x1c", { devices });
    await open(card);
    await press(card, "Printer information");
    const shown = Object.fromEntries(rows(card));
    expect(shown["Status"]).toBe("No data from BamBuddy");
    expect(find(card, "dialog .spec-value .chip")?.classList.contains("tone-warn")).toBe(true);
    expect(shown["Print status"]).toBeUndefined();
    // The firmware chip says it too.
    expect(pill(card, "firmware")?.getAttribute("aria-label")).toMatch(/^Firmware .+ \(no data from BamBuddy\)$/);
  });

  it("says the key may only read, also with the controls hidden", async () => {
    const { card } = await cardFor("readOnly", { config: { read_only: true } });
    await open(card);
    await press(card, "Printer information");
    expect(Object.fromEntries(rows(card))["Control"]).toBe("Read only (API key without “Control Printer”)");
  });

  it("closes when the card leaves the page", async () => {
    const { card } = await cardFor("x1c");
    await open(card);
    card.remove();
    document.body.append(card);
    await settle(card);
    expect(find(card, "[role=menu]")).toBeNull();
  });

  it("says it in German", async () => {
    const { card } = await cardFor("x1c", { language: "de" });
    expect(trigger(card).getAttribute("aria-label")).toBe("Weitere Optionen");
    await open(card);
    expect(items(card).map(text)).toEqual(["Geräteseite öffnen", "Druckerinformationen", "Status aktualisieren", "Verbindung prüfen"]);
  });
});

describe("the printer information", () => {
  const openInfo = async (card: FakeCard): Promise<void> => {
    (find(card, ".menu-btn") as HTMLButtonElement).click();
    await settle(card);
    await press(card, "Printer information");
  };
  let clipboard: { writeText: ReturnType<typeof vi.fn> } | undefined;

  beforeEach(() => {
    clipboard = { writeText: vi.fn(async () => undefined) };
    Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  });

  it("lists what the card knows about the printer", async () => {
    const { card } = await cardFor("x1c");
    await openInfo(card);
    expect(text(find(card, "dialog h2"))).toBe("Printer information");
    expect(rows(card)).toEqual([
      ["Model", "X1C"],
      ["Name in BamBuddy", "Workshop"],
      ["Status", "Online"],
      ["Print status", "Printing"],
      ["IP address", "192.168.1.42"],
      ["Serial number", "00M09A350100123"],
      ["Network", `Wi-Fi · ${MINUS}52${NBSP}dBm`],
      ["Firmware", "01.08.02.00"],
      ["Developer mode", "On"],
      ["Nozzles", `1 nozzle · 0.4${NBSP}mm · Hardened steel`],
      ["Print hours", "559 h"],
    ]);
    expect(find(card, "dialog .spec-value .chip.tone-ok")).not.toBeNull();
    expect(findAll(card, "dialog .copy").map((item) => item.getAttribute("aria-label"))).toEqual(["Copy IP address", "Copy serial number"]);
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);
  });

  it("names the BamBuddy server the printer comes from", async () => {
    // The same printer may sit in two BamBuddy servers, both set up.
    const [printer, ams] = x1c() as [FakeDevice, FakeDevice];
    const { card } = await cardFor("x1c", { devices: [{ ...printer, via: instanceDevice.id }, ams, instanceDevice] });
    await openInfo(card);
    expect(rows(card).slice(1, 3)).toEqual([
      ["Name in BamBuddy", "Workshop"],
      ["BamBuddy server", "BamBuddy (192.168.1.5)"],
    ]);
    const { card: renamed } = await cardFor("x1c", { devices: [{ ...printer, via: instanceDevice.id }, ams, { ...instanceDevice, nameByUser: "Garage" }] });
    await openInfo(renamed);
    expect(Object.fromEntries(rows(renamed))["BamBuddy server"]).toBe("Garage");
  });

  it("names both nozzles of a dual-nozzle printer and a printer on Ethernet", async () => {
    const { card } = await cardFor("h2d");
    await openInfo(card);
    const shown = Object.fromEntries(rows(card));
    expect(shown["Network"]).toBe("LAN (wired)");
    expect(shown["Nozzles"]).toBe(`2 nozzles Left: 0.4${NBSP}mm · Hardened steel Right: 0.4${NBSP}mm · Stainless steel, high flow`);
    // Its IP address sensor is off, as Home Assistant creates it.
    expect(shown["IP address"]).toBeUndefined();
    const { card: plain } = await cardFor("a1mini", { devices: a1mini({ nozzleTypes: [], developerMode: "off" }) });
    await openInfo(plain);
    const other = Object.fromEntries(rows(plain));
    expect(other["Nozzles"]).toBe(`1 nozzle · 0.4${NBSP}mm`);
    // Off, with why it matters.
    expect(other["Developer mode"]).toBe("Off Commands may be ignored.");
    expect(text(find(plain, "dialog .spec-value .spec-sub"))).toBe("Commands may be ignored.");
    expect(other["Firmware"]).toBeUndefined();
  });

  it("leaves out what it does not know while the printer is offline", async () => {
    const { card } = await cardFor("offline");
    await openInfo(card);
    expect(rows(card)).toEqual([
      ["Model", "P1S"],
      ["Status", "Offline"],
      ["Print status", "Offline"],
      ["Print hours", "2,411 h"],
    ]);
    expect(find(card, "dialog .spec-value .chip.tone-off")).not.toBeNull();
    // No serial number in the registry: nothing to copy.
    expect(findAll(card, "dialog .copy")).toHaveLength(0);
  });

  it("copies the IP address and the serial number", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { card } = await cardFor("x1c");
    await openInfo(card);
    await press(card, "Copy IP address");
    expect(clipboard?.writeText).toHaveBeenLastCalledWith("192.168.1.42");
    expect(text(find(card, "dialog .sent"))).toBe("Copied");
    await press(card, "Copy serial number");
    expect(clipboard?.writeText).toHaveBeenLastCalledWith("00M09A350100123");
    await vi.advanceTimersByTimeAsync(3_000);
    await card.updateComplete;
    expect(find(card, "dialog .sent")).toBeNull();
    // Closed meanwhile: the timer finds no dialog to change.
    await press(card, "Copy IP address");
    await press(card, "Close");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(find(card, "dialog")).toBeNull();
  });

  it("leaves no timer behind when the card leaves the page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { card } = await cardFor("x1c");
    await openInfo(card);
    await press(card, "Copy IP address");
    expect(vi.getTimerCount()).toBe(1);
    card.remove();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("says nothing when copying fails, and offers no copying without a clipboard", async () => {
    clipboard?.writeText.mockRejectedValueOnce(new Error("denied"));
    const { card } = await cardFor("x1c");
    await openInfo(card);
    await press(card, "Copy IP address");
    expect(find(card, "dialog .sent")).toBeNull();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const { card: bare } = await cardFor("x1c");
    await openInfo(bare);
    expect(findAll(bare, "dialog .copy")).toHaveLength(0);
  });

  it("says it in German", async () => {
    const { card } = await cardFor("h2d", { language: "de" });
    (find(card, ".menu-btn") as HTMLButtonElement).click();
    await settle(card);
    await press(card, "Druckerinformationen");
    expect(text(find(card, "dialog h2"))).toBe("Druckerinformationen");
    expect(rows(card).map(([label]) => label)).toEqual([
      "Modell",
      "Name in BamBuddy",
      "Status",
      "Druckstatus",
      "Seriennummer",
      "Netzwerk",
      "Firmware",
      "Entwicklermodus",
      "Düsen",
      "Druckstunden",
    ]);
    const shown = Object.fromEntries(rows(card));
    expect(shown["Entwicklermodus"]).toBe("An");
    expect(shown["Düsen"]).toBe(`2 Düsen Links: 0,4${NBSP}mm · Gehärteter Stahl Rechts: 0,4${NBSP}mm · Edelstahl, High Flow`);
    expect(shown["Druckstunden"]).toBe("1.203 h");
    expect(findAll(card, "dialog .copy").map((item) => item.getAttribute("aria-label"))).toEqual(["Seriennummer kopieren"]);
    await press(card, "Seriennummer kopieren");
    expect(text(find(card, "dialog .sent"))).toBe("Kopiert");
    const { card: wifi } = await cardFor("x1c", { language: "de" });
    (find(wifi, ".menu-btn") as HTMLButtonElement).click();
    await settle(wifi);
    await press(wifi, "Druckerinformationen");
    expect(Object.fromEntries(rows(wifi))["Netzwerk"]).toBe(`WLAN · ${MINUS}52${NBSP}dBm`);
    expect(Object.fromEntries(rows(wifi))["Düsen"]).toBe(`1 Düse · 0,4${NBSP}mm · Gehärteter Stahl`);
    const { card: off } = await cardFor("a1mini", { language: "de", devices: a1mini({ developerMode: "off" }) });
    (find(off, ".menu-btn") as HTMLButtonElement).click();
    await settle(off);
    await press(off, "Druckerinformationen");
    expect(Object.fromEntries(rows(off))["Entwicklermodus"]).toBe("Aus Befehle werden möglicherweise ignoriert.");
    // BamBuddy's German pages name the permission „Drucker steuern“.
    const { card: reading } = await cardFor("readOnly", { language: "de" });
    (find(reading, ".menu-btn") as HTMLButtonElement).click();
    await settle(reading);
    await press(reading, "Druckerinformationen");
    expect(Object.fromEntries(rows(reading))["Steuern"]).toBe("Nur lesen (API-Schlüssel ohne „Drucker steuern“)");
  });
});
