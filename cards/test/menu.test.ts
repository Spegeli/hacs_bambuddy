// The ⋮ menu and the printer information.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { ICONS } from "../src/icons";
import type { Hass } from "../src/types";
import { instanceDevice, keepEntities, makeHass, mountCard, unreachable, x1c, type FakeCard, type FakeDevice } from "./fixtures";
import { cardFor, useCardPage } from "./card-helpers";
import {
  button,
  find,
  findAll,
  NBSP,
  press,
  root,
  settle,
  shownText,
  text,
  update,
} from "./helpers";
import { iconOf, MINUS, pill, rows } from "./header-helpers";

/** The open dialog's rows: label and value. */

/** The lines of a two-nozzle printer's nozzle row in the printer information. */
const nozzleLinesOf = (card: FakeCard, label: string): Element[] => {
  const row = findAll(card, "dialog .spec-row").find((item) => text(item.querySelector(".spec-label")) === label);
  return [...(row?.querySelectorAll(".spec-value > span") ?? [])];
};

useCardPage();

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
    // The items that open a dialog say so.
    expect(items(card).map((item) => item.getAttribute("aria-haspopup"))).toEqual([null, "dialog", null, "dialog"]);
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
    // Tab and Shift+Tab close it too and go back to the three dots: the next
    // Tab goes on to the chips, not past the tabs.
    await key(card, "Tab");
    expect(find(card, "[role=menu]")).toBeNull();
    expect(root(card).activeElement).toBe(trigger(card));
    await open(card);
    items(card)[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, composed: true }));
    await settle(card);
    expect(find(card, "[role=menu]")).toBeNull();
    expect(root(card).activeElement).toBe(trigger(card));
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
    const { card: bare } = await cardFor("x1c", { devices: [keepEntities(printer, (entity) => entity.key !== "refresh_status")] });
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

  it("names no control mode: the key always controls", async () => {
    const { card } = await cardFor("readOnly", { config: { read_only: true } });
    await open(card);
    await press(card, "Printer information");
    expect(Object.keys(Object.fromEntries(rows(card)))).not.toContain("Control");
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
    // Which printer, what it has, what it does, how it is connected (his order, 2026-10-22).
    expect(rows(card)).toEqual([
      ["Name in BamBuddy", "Workshop"],
      ["Model", "X1C"],
      ["Serial number", "00M09A350100123"],
      ["Firmware", "01.08.02.00"],
      ["Nozzle", `0.4${NBSP}mm · Hardened steel`],
      ["Print hours", "559 h"],
      ["Status", "Online"],
      ["Print status", "Printing"],
      ["Network", `Wi-Fi · ${MINUS}52${NBSP}dBm`],
      ["IP address", "192.168.1.42"],
      ["Developer mode", "On"],
    ]);
    expect(find(card, "dialog .spec-value .chip.tone-ok")).not.toBeNull();
    expect(findAll(card, "dialog .copy").map((item) => item.getAttribute("aria-label"))).toEqual(["Copy serial number", "Copy IP address"]);
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Close"]);
  });

  it("names the BamBuddy server the printer comes from", async () => {
    // The same printer may sit in two BamBuddy servers, both set up.
    const [printer, ams] = x1c() as [FakeDevice, FakeDevice];
    const { card } = await cardFor("x1c", { devices: [{ ...printer, via: instanceDevice.id }, ams, instanceDevice] });
    await openInfo(card);
    // Last: the way from the printer to Home Assistant ends there.
    expect(rows(card).at(-1)).toEqual(["BamBuddy server", "BamBuddy (192.168.1.5)"]);
    const { card: renamed } = await cardFor("x1c", { devices: [{ ...printer, via: instanceDevice.id }, ams, { ...instanceDevice, nameByUser: "Garage" }] });
    await openInfo(renamed);
    expect(Object.fromEntries(rows(renamed))["BamBuddy server"]).toBe("Garage");
  });

  it("leaves out a nozzle it knows nothing of, and the row where it knows neither", async () => {
    const { card, hass } = await cardFor("h2d");
    const blank = ["left_nozzle_diameter", "left_nozzle_type"].reduce((state, key) => state.withState(`sensor.h2d_${key}`, "unknown"), hass);
    await update(card, blank);
    await openInfo(card);
    expect(nozzleLinesOf(card, "Nozzles").map(shownText)).toEqual([`R: 0.4${NBSP}mm · Stainless steel, high flow`]);
    const { card: none, hass: other } = await cardFor("h2d");
    const nothingKnown = ["left_nozzle_diameter", "left_nozzle_type", "right_nozzle_diameter", "right_nozzle_type"].reduce(
      (state, key) => state.withState(`sensor.h2d_${key}`, "unknown"),
      other,
    );
    await update(none, nothingKnown);
    await openInfo(none);
    expect(Object.fromEntries(rows(none))["Nozzles"]).toBeUndefined();
  });

  it("names both nozzles of a dual-nozzle printer and a printer on Ethernet", async () => {
    const { card } = await cardFor("h2d");
    await openInfo(card);
    const shown = Object.fromEntries(rows(card));
    expect(shown["Network"]).toBe("LAN (wired)");
    // Each line names its side by the nozzle symbol and L or R; a screen
    // reader and the tooltip say it in full.
    const nozzles = nozzleLinesOf(card, "Nozzles");
    expect(nozzles.map(shownText)).toEqual([`L: 0.4${NBSP}mm · Hardened steel`, `R: 0.4${NBSP}mm · Stainless steel, high flow`]);
    expect(nozzles.map((line) => line.querySelector(".spec-side")?.getAttribute("title"))).toEqual(["Left nozzle", "Right nozzle"]);
    expect(nozzles.map((line) => text(line.querySelector(".spec-side .sr-only")))).toEqual(["Left nozzle:", "Right nozzle:"]);
    expect(nozzles.map((line) => line.querySelectorAll(".spec-side svg.icon").length)).toEqual([1, 1]);
    // Its IP address sensor is off, as Home Assistant creates it.
    expect(shown["IP address"]).toBeUndefined();
    const { card: plain } = await cardFor("a1mini", { printer: { nozzleTypes: [], developerMode: "off" } });
    await openInfo(plain);
    const other = Object.fromEntries(rows(plain));
    expect(other["Nozzle"]).toBe(`0.4${NBSP}mm`);
    // Off, with why it matters.
    expect(other["Developer mode"]).toBe("Off The printer takes no commands.");
    expect(text(find(plain, "dialog .spec-value .spec-sub"))).toBe("The printer takes no commands.");
    expect(other["Firmware"]).toBeUndefined();
  });

  it("leaves out what it does not know while the printer is offline", async () => {
    const { card } = await cardFor("offline");
    await openInfo(card);
    expect(rows(card)).toEqual([
      ["Model", "P1S"],
      ["Print hours", "2,411 h"],
      ["Status", "Offline"],
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
      "Name in BamBuddy",
      "Modell",
      "Seriennummer",
      "Firmware",
      "Düsen",
      "Druckstunden",
      "Status",
      "Druckstatus",
      "Netzwerk",
      "Entwicklermodus",
    ]);
    const shown = Object.fromEntries(rows(card));
    expect(shown["Entwicklermodus"]).toBe("An");
    expect(nozzleLinesOf(card, "Düsen").map(shownText)).toEqual([`L: 0,4${NBSP}mm · Gehärteter Stahl`, `R: 0,4${NBSP}mm · Edelstahl, High Flow`]);
    expect(nozzleLinesOf(card, "Düsen").map((line) => text(line.querySelector(".spec-side .sr-only")))).toEqual(["Linke Düse:", "Rechte Düse:"]);
    expect(shown["Druckstunden"]).toBe("1.203 h");
    expect(findAll(card, "dialog .copy").map((item) => item.getAttribute("aria-label"))).toEqual(["Seriennummer kopieren"]);
    await press(card, "Seriennummer kopieren");
    expect(text(find(card, "dialog .sent"))).toBe("Kopiert");
    const { card: wifi } = await cardFor("x1c", { language: "de" });
    (find(wifi, ".menu-btn") as HTMLButtonElement).click();
    await settle(wifi);
    await press(wifi, "Druckerinformationen");
    expect(Object.fromEntries(rows(wifi))["Netzwerk"]).toBe(`WLAN · ${MINUS}52${NBSP}dBm`);
    expect(Object.fromEntries(rows(wifi))["Düse"]).toBe(`0,4${NBSP}mm · Gehärteter Stahl`);
    const { card: off } = await cardFor("a1mini", { language: "de", printer: { developerMode: "off" } });
    (find(off, ".menu-btn") as HTMLButtonElement).click();
    await settle(off);
    await press(off, "Druckerinformationen");
    expect(Object.fromEntries(rows(off))["Entwicklermodus"]).toBe("Aus Der Drucker nimmt keine Befehle an.");
  });
});
