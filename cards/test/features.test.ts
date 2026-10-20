// The card's newer parts (2026-10-18): the chips for maintenance, door,
// storage and drying; the maintenance dialog; the connection check; the
// airduct mode and the AMS filament backup.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { findPrinter } from "../src/discovery";
import { configForm } from "../src/forms";
import { en } from "../src/translations/en";

const t_developer_off = en.developer_off;
import {
  a1mini,
  amsDevice,
  h2d,
  makeHass,
  MAINTENANCE_TASKS,
  maintenanceSpec,
  mountCard,
  offlineP1s,
  unreachable,
  x1c,
  type FakeCard,
  type FakeDevice,
  type FakeHass,
  type FakeHassOptions,
  type PrinterSpec,
} from "./fixtures";
import { atRule, button, find, findAll, hasButton, NBSP, settle, styleText, text, update } from "./helpers";

interface Mounted {
  card: FakeCard;
  hass: FakeHass;
}

async function mount(
  devices: FakeDevice[],
  printer: string,
  config: Record<string, unknown> = {},
  options: { language?: string; callService?: FakeHassOptions["callService"] } = {},
): Promise<Mounted> {
  const hass = makeHass({ devices, language: options.language ?? "en", ...(options.callService ? { callService: options.callService } : {}) });
  const card = await mountCard(hass, { printer, ...config });
  return { card, hass };
}

const withX1c = (overrides: Partial<PrinterSpec>, config: Record<string, unknown> = {}, language = "en"): Promise<Mounted> =>
  mount(x1c(overrides), "dev-x1c", config, { language });

const chips = (card: FakeCard): string[] => findAll(card, ".pills .pill").map(text);
const chip = (card: FakeCard, name: string): HTMLButtonElement => {
  const found = findAll<HTMLButtonElement>(card, ".pills .pill").find((item) => text(item) === name);
  if (!found) throw new Error(`no chip "${name}" in: ${chips(card).join(" | ")}`);
  return found;
};

/** An element's text as it shows: without what only a screen reader hears. */
const shown = (element: Element): string => {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll(".sr-only").forEach((hidden) => hidden.remove());
  return text(copy);
};

async function openMenu(card: FakeCard): Promise<string[]> {
  (find(card, ".menu-btn") as HTMLButtonElement).click();
  await card.updateComplete;
  return findAll(card, ".menu [role=menuitem]").map(text);
}

async function menuItem(card: FakeCard, name: string): Promise<HTMLButtonElement> {
  await openMenu(card);
  const found = findAll<HTMLButtonElement>(card, ".menu [role=menuitem]").find((item) => text(item) === name);
  if (!found) throw new Error(`no menu item "${name}"`);
  return found;
}

const opened = (card: FakeCard): string[] => {
  const ids: string[] = [];
  card.addEventListener("hass-more-info", (event) => ids.push((event as CustomEvent<{ entityId: string }>).detail.entityId));
  return ids;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("finding the new entities", () => {
  it("finds the door, the storage, maintenance, the airduct mode and the filament backup", () => {
    const hass = makeHass({
      devices: x1c({ door: "on", storage: "off", maintenance: maintenanceSpec(), airduct: "cooling", filamentBackup: "on" }),
    });
    const refs = findPrinter(hass, "dev-x1c");
    expect([refs?.door, refs?.storage, refs?.storageUsb, refs?.maintenance, refs?.airduct, refs?.filamentBackup]).toEqual([
      "binary_sensor.x1c_door",
      "binary_sensor.x1c_sd_card",
      false,
      "sensor.x1c_maintenance",
      "select.x1c_airduct_mode",
      "switch.x1c_ams_filament_backup",
    ]);
    // A USB drive on the H2 series.
    const usb = findPrinter(makeHass({ devices: h2d({ storage: "on", storageUsb: true }) }), "dev-h2d");
    expect([usb?.storage, usb?.storageUsb]).toEqual(["binary_sensor.h2d_usb_drive", true]);
  });
});

describe("the new chips", () => {
  const all = { door: "on" as const, storage: "off" as const, maintenance: maintenanceSpec() };

  it("are offered, not chosen: the default chips stay network, HMS, firmware", async () => {
    const { card } = await withX1c(all);
    expect(chips(card)).toEqual([`−52${NBSP}dBm`, "HMS OK", "Update 01.09.00.00"]);
  });

  it("show maintenance always: OK, or what is due -- red with an overdue task", async () => {
    const { card, hass } = await withX1c(all, { header_chips: ["maintenance"] });
    const due = chip(card, "3 due");
    expect([due.classList.contains("tone-err"), due.getAttribute("aria-label")]).toEqual([true, "3 due – maintenance: 2 overdue, 1 due soon"]);
    expect(due.getAttribute("aria-haspopup")).toBe("dialog");
    const soon = MAINTENANCE_TASKS.map((task) => ({ ...task, due: false }));
    await update(card, hass.withState("sensor.x1c_maintenance", "due_soon", { tasks: soon, due_count: 0, due_soon_count: 1, can_mark_done: true }));
    expect(chip(card, "1 due").classList.contains("tone-warn")).toBe(true);
    await update(card, hass.withState("sensor.x1c_maintenance", "ok", { tasks: [], due_count: 0, due_soon_count: 0, can_mark_done: true }));
    expect(chip(card, "Maintenance OK").classList.contains("tone-ok")).toBe(true);
    // No data: no chip.
    await update(card, hass.withState("sensor.x1c_maintenance", "unavailable", {}));
    expect(chips(card)).toEqual([]);
  });

  it("show maintenance also with the printer offline, not while BamBuddy gives no data", async () => {
    const offline = await withX1c({ ...all, online: false }, { header_chips: ["maintenance"] });
    expect(chips(offline.card)).toEqual(["3 due"]);
    const silent = await mount(unreachable(x1c(all)), "dev-x1c", { header_chips: ["maintenance"] });
    expect(chips(silent.card)).toEqual([]);
  });

  it("show the door only while it is open, as information", async () => {
    const { card, hass } = await withX1c(all, { header_chips: ["door"] });
    const ids = opened(card);
    const door = chip(card, "Door open");
    expect(door.classList.contains("tone-info")).toBe(true);
    door.click();
    expect(ids).toEqual(["binary_sensor.x1c_door"]);
    await update(card, hass.withState("binary_sensor.x1c_door", "off"));
    expect(chips(card)).toEqual([]);
    const offline = await withX1c({ ...all, online: false }, { header_chips: ["door"] });
    expect(chips(offline.card)).toEqual([]);
  });

  it("show missing storage as a warning that says why on a tap", async () => {
    const { card, hass } = await withX1c(all, { header_chips: ["storage"] });
    const missing = chip(card, "No SD card");
    expect(missing.classList.contains("tone-warn")).toBe(true);
    expect(missing.getAttribute("aria-haspopup")).toBe("dialog");
    missing.click();
    await card.updateComplete;
    expect(text(find(card, "dialog"))).toContain("Without an SD card BamBuddy cannot send prints to the printer");
    await update(card, hass.withState("binary_sensor.x1c_sd_card", "on"));
    expect(chips(card)).toEqual([]);
    // The open dialog follows: the card is in.
    expect(text(find(card, "dialog p"))).toBe("The SD card is in: BamBuddy can send prints again.");
    expect(text(find(card, "dialog h2"))).toBe("SD card");
    const usb = await mount(h2d({ storage: "off", storageUsb: true }), "dev-h2d", { header_chips: ["storage"] });
    expect(chips(usb.card)).toEqual(["No USB drive"]);
  });

  it("show drying as one chip, with the longest time left, for every unit that dries", async () => {
    const { card, hass } = await mount(h2d(), "dev-h2d", { header_chips: ["drying"] });
    expect(chips(card)).toEqual([`Drying 3${NBSP}h${NBSP}20${NBSP}min`]);
    const both = hass.withState("binary_sensor.dev-h2d_ams_128_drying", "on").withState("sensor.dev-h2d_ams_128_drying_remaining_time", "320");
    await update(card, both);
    const drying = chip(card, `2 AMS drying 5${NBSP}h${NBSP}20${NBSP}min`);
    // Its own class: not the Filament tab's drying row.
    expect([drying.classList.contains("dry-chip"), drying.classList.contains("drying")]).toEqual([true, false]);
    // Its countdown is not read out every minute; its name is what it shows.
    expect([drying.getAttribute("aria-label"), drying.getAttribute("title"), drying.getAttribute("aria-live")]).toEqual([
      null,
      `2 AMS units drying, all done in 5${NBSP}h${NBSP}20${NBSP}min`,
      "off",
    ]);
    drying.click();
    await card.updateComplete;
    expect(text(find(card, "[role=tab][aria-selected=true]"))).toBe("Filament");
    await update(card, both.withState("binary_sensor.dev-h2d_ams_0_drying", "off").withState("binary_sensor.dev-h2d_ams_128_drying", "off"));
    expect(chips(card)).toEqual([]);
  });

  it("open the drying unit's details without a Filament tab", async () => {
    const { card } = await mount(h2d(), "dev-h2d", { header_chips: ["drying"], show_filament_tab: false });
    const ids = opened(card);
    chip(card, `Drying 3${NBSP}h${NBSP}20${NBSP}min`).click();
    // The time it shows.
    expect(ids).toEqual(["sensor.dev-h2d_ams_0_drying_remaining_time"]);
  });

  it("say it in German", async () => {
    const { card } = await mount(h2d({ door: "on", storage: "off", storageUsb: true, maintenance: maintenanceSpec({ state: "ok", tasks: [] }) }), "dev-h2d", {
      header_chips: ["maintenance", "door", "storage", "drying"],
    }, { language: "de" });
    expect(chips(card)).toEqual(["Wartung OK", "Tür offen", "Kein USB-Stick", `Trocknet 3${NBSP}Std.${NBSP}20${NBSP}Min.`]);
  });

  it("never cut their text: a chip wider than the card wraps its words", () => {
    const pill = /\.pill\s*\{([^}]*)\}/.exec(styleText())?.[1] ?? "";
    expect(pill).toContain("white-space: normal");
    expect(pill).not.toContain("max-width");
    expect(pill).not.toContain("ellipsis");
  });
});

describe("the editor's chips", () => {
  const field = (schema: unknown[], name: string): Record<string, unknown> | undefined => {
    for (const item of schema as Record<string, unknown>[]) {
      if (item["name"] === name) return item;
      const inner = Array.isArray(item["schema"]) ? field(item["schema"] as unknown[], name) : undefined;
      if (inner) return inner;
    }
    return undefined;
  };

  it("offers the new chips and says when they appear", () => {
    const form = configForm(makeHass({ language: "en" }));
    const chipsField = field(form.schema as unknown[], "header_chips") as { selector: { select: { options: { value: string; label: string }[] } } };
    expect(chipsField.selector.select.options.map((option) => option.label)).toEqual([
      "Network",
      "HMS",
      "Firmware",
      "Maintenance",
      "Door",
      "SD card / USB drive",
      "Drying",
      "Power",
    ]);
    expect(form.computeHelper({ name: "header_chips" })).toBe(
      "The chips below the name. Drag a chip where you want it; × hides it. Door, SD card / USB drive and drying appear only while the door is open, the storage is missing or an AMS dries; Power only with a smart plug. An HMS error always shows.",
    );
  });
});

describe("the maintenance dialog", () => {
  async function openMaintenance(overrides: Partial<PrinterSpec> = {}, config: Record<string, unknown> = {}, language = "en"): Promise<Mounted> {
    const mounted = await withX1c({ maintenance: maintenanceSpec(), ...overrides }, { header_chips: ["maintenance"], ...config }, language);
    findAll<HTMLButtonElement>(mounted.card, ".pills .pill")[0]?.click();
    await mounted.card.updateComplete;
    return mounted;
  }
  const rows = (card: FakeCard): string[][] =>
    findAll(card, ".maint-row").map((row) => [text(row.querySelector(".maint-name")), text(row.querySelector(".maint-when"))]);

  it("lists the tasks overdue first, then due soon, then by what is left", async () => {
    const { card } = await openMaintenance();
    expect(text(find(card, "#dlg-title"))).toBe("Maintenance");
    expect(rows(card)).toEqual([
      ["Clean carbon rods", "Never marked as done"],
      ["Clean build plate", "12 h 30 min overdue"],
      ["Clean nozzle and hotend", "Due soon: in 4 h"],
      ["Check belt tension", "Due in 136 h"],
      ["Wipe the camera", "Due in 20 d"],
    ]);
    expect(findAll(card, ".maint-row").map((row) => row.className.split(" ").find((name) => name.startsWith("tone-")))).toEqual([
      "tone-err",
      "tone-err",
      "tone-warn",
      "tone-ok",
      "tone-ok",
    ]);
    expect(text(find(card, ".maint-foot"))).toBe("Print hours: 559 h You set up tasks and intervals in BamBuddy.");
  });

  it("marks a task done after a question in its row, and stays open", async () => {
    const { card, hass } = await openMaintenance();
    const row = (): Element => findAll(card, ".maint-row")[1] as Element;
    (row().querySelector("button") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(text(row().querySelector(".maint-confirm"))).toBe("Mark as done? The count starts over. Cancel Done");
    [...row().querySelectorAll<HTMLButtonElement>("button")].find((item) => text(item) === "Cancel")?.click();
    await card.updateComplete;
    expect(row().querySelector(".maint-confirm")).toBeNull();
    (row().querySelector("button") as HTMLButtonElement).click();
    await card.updateComplete;
    [...row().querySelectorAll<HTMLButtonElement>(".maint-confirm button")].find((item) => text(item) === "Done")?.click();
    await settle(card);
    expect(hass.calls.at(-1)).toMatchObject({ domain: "bambuddy", service: "mark_maintenance_done", data: { device_id: "dev-x1c", task_id: 11 } });
    expect(find(card, "dialog")).not.toBeNull();
  });

  it("marks tasks done without asking the key, and shows no buttons with Hide controls", async () => {
    // No permission to look up: the integration's key may mark tasks done.
    const open = await openMaintenance({});
    expect(findAll(open.card, ".maint-row button").length).toBeGreaterThan(0);
    const hidden = await openMaintenance({}, { read_only: true });
    expect(findAll(hidden.card, ".maint-row button")).toEqual([]);
    expect(text(find(hidden.card, "dialog"))).not.toContain("Manage Maintenance");
  });

  it("explains BamBuddy's count when no task was ever marked done", async () => {
    const fresh = MAINTENANCE_TASKS.map((task) => ({ ...task, last_done: null }));
    const { card } = await openMaintenance({ maintenance: maintenanceSpec({ tasks: fresh }) });
    expect(text(find(card, "dialog"))).toContain("BamBuddy counts from 0 h until a task has been marked done once. Mark what you have done already.");
  });

  it("opens from the menu too: the chip is no default", async () => {
    const { card } = await withX1c({ maintenance: maintenanceSpec() });
    (await menuItem(card, "Maintenance")).click();
    await card.updateComplete;
    expect(text(find(card, "#dlg-title"))).toBe("Maintenance");
    const without = await withX1c({});
    expect(await openMenu(without.card)).not.toContain("Maintenance");
  });

  it("names BamBuddy's tasks in German", async () => {
    const { card } = await openMaintenance({}, {}, "de");
    expect(rows(card).map(([name]) => name)).toEqual([
      "Carbonstangen reinigen",
      "Druckplatte reinigen",
      "Düse und Hotend reinigen",
      "Riemenspannung prüfen",
      "Wipe the camera",
    ]);
    expect(rows(card)[1]?.[1]).toBe("12 Std. 30 Min. überfällig");
  });
});

describe("checking the connection", () => {
  const RESULT = {
    overall: "problems",
    checks: [
      { id: "port_mqtt", status: "fail", params: {} },
      { id: "port_ftps", status: "warn", params: {} },
      { id: "port_rtsps", status: "warn", params: { port: 322, protocol: "RTSPS" } },
      { id: "network_mode", status: "pass", params: { mode: "host", runtime: "docker" } },
      { id: "subnet", status: "pass", params: { printer_ip: "192.168.1.50", host_ip: "192.168.1.10" } },
      { id: "external_storage", status: "skip", params: {} },
      { id: "mqtt_auth", status: "skip", params: {} },
      { id: "developer_mode", status: "skip", params: {} },
      { id: "printer_publishing", status: "skip", params: {} },
    ],
  };
  const answering = (result: unknown): FakeHassOptions["callService"] => async (call) =>
    call.service === "run_diagnostic" ? { response: result } : undefined;

  it("says what to do where a check fails on its own", async () => {
    const alone = { overall: "warnings", checks: [{ id: "port_mqtt", status: "pass", params: {} }, { id: "port_ftps", status: "warn", params: {} }] };
    const { card } = await mount(offlineP1s(), "dev-p1s", {}, { callService: answering(alone) });
    button(card, "Check connection").click();
    await settle(card);
    expect(findAll(card, ".check-item").map(shown)).toEqual(["File transfer (port 990) Not reachable: BamBuddy cannot send prints. Unblock port 990."]);
  });

  it("is offered in the offline view, not while BamBuddy gives no data", async () => {
    const { card } = await mount(offlineP1s(), "dev-p1s");
    expect(hasButton(card, "Check connection")).toBe(true);
    const silent = await mount(unreachable(offlineP1s()), "dev-p1s");
    expect(hasButton(silent.card, "Check connection")).toBe(false);
  });

  it("is in the menu always, and waits while BamBuddy gives no data", async () => {
    const { card } = await withX1c({});
    expect((await menuItem(card, "Check connection")).disabled).toBe(false);
    const silent = await mount(unreachable(x1c()), "dev-x1c");
    expect((await menuItem(silent.card, "Check connection")).disabled).toBe(true);
  });

  it("runs while the dialog says so, then gives the verdict and what to do", async () => {
    let answer: (value: unknown) => void = () => undefined;
    const { card, hass } = await mount(offlineP1s(), "dev-p1s", {}, {
      callService: async (call) => (call.service === "run_diagnostic" ? new Promise((resolve) => (answer = resolve)) : undefined),
    });
    button(card, "Check connection").click();
    await card.updateComplete;
    expect(text(find(card, "dialog"))).toContain("Checking the connection … 0 s");
    expect(text(find(card, "dialog"))).toContain("This usually takes a few seconds, at most half a minute.");
    expect(hass.calls.at(-1)).toMatchObject({ domain: "bambuddy", service: "run_diagnostic", data: { device_id: "dev-p1s" }, returnResponse: true });
    answer({ response: RESULT });
    await settle(card);
    expect(text(find(card, ".check-verdict"))).toBe("1 problem found.");
    expect(findAll(card, ".check-item").map(shown)).toEqual([
      "Control (port 8883) Not reachable. Is the printer on and still at the same IP address? Is a firewall blocking the port?",
      "File transfer (port 990) Not reachable: BamBuddy cannot send prints. Usually follows from the problem above.",
      "Camera (port 322) Not reachable: no live view. Printing still works. Usually follows from the problem above.",
    ]);
    expect(findAll(card, ".check-fold > button").map(text)).toEqual(["2 checks passed", "4 not checked"]);
    findAll<HTMLButtonElement>(card, ".check-fold > button")[1]?.click();
    await card.updateComplete;
    expect(text(findAll(card, ".check-fold")[1])).toContain("Files on external storage Not checked.");
    expect(text(findAll(card, ".check-fold")[1])).toContain("Credentials Not checked: port 8883 cannot be reached.");
  });

  it("checks again on a tap, and says when it could not run", async () => {
    let calls = 0;
    const failing = await mount(x1c(), "dev-x1c", {}, {
      callService: async (call) => {
        if (call.service !== "run_diagnostic") return undefined;
        calls += 1;
        if (calls === 1) return { response: { overall: "ok", checks: [{ id: "port_mqtt", status: "pass", params: {} }] } };
        throw { message: "BamBuddy did not answer" };
      },
    });
    (await menuItem(failing.card, "Check connection")).click();
    await settle(failing.card);
    expect(text(find(failing.card, ".check-verdict"))).toBe("No problems found.");
    button(failing.card, "Check again").click();
    await settle(failing.card);
    expect(calls).toBe(2);
    expect(text(find(failing.card, "dialog"))).toContain("The check could not run: BamBuddy did not answer");
  });

  it("counts what needs attention", async () => {
    const { card } = await mount(x1c(), "dev-x1c", {}, {
      callService: answering({ overall: "warnings", checks: [{ id: "network_mode", status: "warn", params: { mode: "bridge", runtime: "docker" } }] }),
    });
    (await menuItem(card, "Check connection")).click();
    await settle(card);
    expect(text(find(card, ".check-verdict"))).toBe("The printer should work, but 1 thing needs attention.");
    expect(text(find(card, ".check-item"))).toContain("Printer discovery needs host networking");
  });
});

describe("the airduct mode", () => {
  const heating = (card: FakeCard): Element | null => find(card, ".airduct");
  const radios = (card: FakeCard): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".airduct [role=radio]");

  it("switches between cooling and heating without a print, and says what each does", async () => {
    const { card, hass } = await withX1c({ airduct: "cooling", status: "idle", stage: "idle" }, { start_view: "control" });
    expect(radios(card).map((item) => [text(item), item.getAttribute("aria-checked")])).toEqual([
      ["Cooling", "true"],
      ["Heating", "false"],
    ]);
    expect(text(heating(card))).toContain(
      "Cooling draws in fresh air (PLA, TPU); Heating keeps the warmth in the chamber (ABS, ASA, PC, PA). The printer sets it itself at every print start.",
    );
    radios(card)[1]?.click();
    await settle(card);
    expect(hass.calls.at(-1)).toMatchObject({ domain: "select", service: "select_option", data: { entity_id: "select.x1c_airduct_mode", option: "heating" } });
  });

  it("waits during a print and during a filament change", async () => {
    const printing = await withX1c({ airduct: "heating" }, { start_view: "control" });
    expect(radios(printing.card).every((item) => item.disabled)).toBe(true);
    expect(text(heating(printing.card))).toContain("Can be changed once the print is done.");
    const changing = await withX1c({ airduct: "heating", status: "idle", stage: "idle", amsStatus: "feeding" }, { start_view: "control" });
    expect(radios(changing.card).every((item) => item.disabled)).toBe(true);
    expect(text(heating(changing.card))).toContain("Wait until the filament change is done.");
  });

  it("chooses nothing for a mode it does not know", async () => {
    const { card } = await withX1c({ airduct: "unknown", status: "idle", stage: "idle" }, { start_view: "control" });
    expect(radios(card).map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "false"]);
  });

  it("says the laser mode the printer set, and offers only cooling and heating", async () => {
    const { card, hass } = await withX1c({ airduct: "laser", status: "idle", stage: "idle" }, { start_view: "control" });
    expect(radios(card).map((item) => [text(item), item.getAttribute("aria-checked")])).toEqual([
      ["Cooling", "false"],
      ["Heating", "false"],
    ]);
    expect(text(heating(card))).toContain("Now in laser mode: the printer sets it for its laser module.");
    radios(card)[0]?.click();
    await settle(card);
    expect(hass.calls.at(-1)).toMatchObject({ domain: "select", service: "select_option", data: { option: "cooling" } });
  });

  it("shows the laser mode as text without controls", async () => {
    const { card } = await withX1c({ airduct: "laser", status: "idle", stage: "idle" }, { read_only: true, start_view: "control" }, "de");
    expect(text(find(card, ".airduct .det-state"))).toBe("Lasermodus");
    expect(find(card, ".airduct [role=radio]")).toBeNull();
  });

  it("is not there without the select", async () => {
    const { card } = await withX1c({}, { start_view: "control" });
    expect(heating(card)).toBeNull();
  });
});

describe("the AMS filament backup", () => {
  const row = (card: FakeCard): Element | null => find(card, ".backup");

  it("sits after the AMS units and before the external spool, with a switch", async () => {
    const { card, hass } = await withX1c({ filamentBackup: "on" }, { start_view: "filament" });
    const order = [...(find(card, ".body")?.children ?? [])].map((child) => child.className.split(" ")[0]).filter((name) => name === "unit" || name === "backup");
    expect(order).toEqual(["unit", "backup", "unit"]);
    expect(text(row(card))).toBe(
      "AMS filament backup When a spool runs out, the printer continues with a matching spool from the AMS: same brand, material and color.",
    );
    const toggle = find<HTMLButtonElement>(card, ".backup [role=switch]") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    toggle.click();
    await settle(card);
    expect(hass.calls.at(-1)).toMatchObject({ domain: "switch", service: "turn_off", data: { entity_id: "switch.x1c_ams_filament_backup" } });
  });

  it("says Unknown where BamBuddy cannot read it, and offers to turn it off or on", async () => {
    const { card, hass } = await withX1c({ filamentBackup: "unknown" }, { start_view: "filament" });
    expect(text(find(card, ".backup .det-state"))).toBe("Unknown");
    const choices = findAll<HTMLButtonElement>(card, ".backup .backup-set button");
    expect(choices.map(text)).toEqual(["Turn off", "Turn on"]);
    expect(text(row(card))).toContain("State unknown: BamBuddy does not report it for this printer.");
    choices[1]?.click();
    await settle(card);
    expect(hass.calls.at(-1)).toMatchObject({ domain: "switch", service: "turn_on", data: { entity_id: "switch.x1c_ams_filament_backup" } });
  });

  it("marks the choice on its way, and takes no second", async () => {
    let finish: () => void = () => undefined;
    const { card, hass } = await mount(x1c({ filamentBackup: "unknown" }), "dev-x1c", { start_view: "filament" }, {
      callService: () => new Promise((resolve) => (finish = () => resolve(undefined))),
    });
    const on = (): HTMLButtonElement => findAll<HTMLButtonElement>(card, ".backup .backup-set button")[1] as HTMLButtonElement;
    on().click();
    await card.updateComplete;
    expect([on().classList.contains("pending"), on().getAttribute("aria-busy"), on().getAttribute("aria-disabled")]).toEqual([true, "true", "true"]);
    on().click();
    await card.updateComplete;
    expect(hass.calls.filter((call) => call.domain === "switch")).toHaveLength(1);
    finish();
    await settle(card);
    expect(on().classList.contains("pending")).toBe(false);
  });

  it("shows the state as text with Hide controls", async () => {
    const { card } = await withX1c({ filamentBackup: "on" }, { start_view: "filament", read_only: true });
    expect(find(card, ".backup button")).toBeNull();
    expect(text(find(card, ".backup .det-state"))).toBe("On");
  });

  it("says which spools back up on a printer with two nozzles", async () => {
    const { card } = await mount(h2d({ filamentBackup: "off" }), "dev-h2d", { start_view: "filament" });
    expect(text(row(card))).toContain("With two nozzles, only spools on the same side.");
  });

  it("is not there on a printer without an AMS unit now (one was plugged in before)", async () => {
    const [printer] = x1c({ filamentBackup: "on" });
    const { card } = await mount([printer as FakeDevice], "dev-x1c", { start_view: "filament" });
    expect(find(card, ".unit")).not.toBeNull();
    expect(row(card)).toBeNull();
  });

  it("is not there without the switch", async () => {
    const { card } = await withX1c({ filamentBackup: "none" }, { start_view: "filament" });
    expect(row(card)).toBeNull();
  });
});

describe("the connection check's words, closer", () => {
  const check = async (checks: unknown[], overall?: string, language = "en"): Promise<FakeCard> => {
    const { card } = await mount(x1c(), "dev-x1c", {}, {
      language,
      callService: async (call) => (call.service === "run_diagnostic" ? { response: { ...(overall ? { overall } : {}), checks } } : undefined),
    });
    (await menuItem(card, language === "de" ? "Verbindung prüfen" : "Check connection")).click();
    await settle(card);
    return card;
  };
  const items = (card: FakeCard): string[] => findAll(card, ".check-item").map(shown);

  it("takes the most specific text there is for a reason", async () => {
    const card = await check([
      { id: "port_ftps", status: "warn", params: { reason: "no_tls" } },
      { id: "external_storage", status: "fail", params: { reason: "no_media" } },
      { id: "mqtt_auth", status: "fail", params: { reason: "auth_rejected" } },
      { id: "developer_mode", status: "fail", params: {} },
      { id: "subnet", status: "warn", params: { printer_ip: "10.0.0.5", host_ip: "192.168.1.2" } },
    ], "problems");
    const found = items(card);
    // Failures first, then the warnings, each in BamBuddy's order.
    expect(found.filter((_, index) => index !== 2)).toEqual([
      "Files on external storage No SD card or USB drive in the printer: prints cannot be sent. Insert one.",
      "Credentials The printer rejects the access code or serial number. Read the access code on its screen and enter it again in BamBuddy.",
      "File transfer (port 990) Port open, but the printer's file service hangs. Restart the printer.",
      "Subnet The printer (10.0.0.5) and BamBuddy (192.168.1.2) are on different subnets. This works only with routing between them.",
    ]);
    // The developer mode: the card's own advice, as on its Status tab.
    expect(found[2]).toBe(`Developer mode (LAN) ${t_developer_off}`);
    // A screen reader hears whether each is a failure or a warning.
    expect(findAll(card, ".check-item .sr-only").map(text)).toEqual(["Error:", "Error:", "Error:", "Warning:", "Warning:"]);
    expect(text(find(card, ".check-verdict"))).toBe("3 problems found.");
  });

  it("says why a check was not run, and names a check it does not know by its id", async () => {
    const card = await check([
      { id: "network_mode", status: "skip", params: { reason: "unknown", runtime: "docker" } },
      { id: "subnet", status: "skip", params: {} },
      { id: "external_storage", status: "skip", params: { reason: "unsupported_model" } },
      { id: "new_check", status: "warn", params: {} },
      { id: "odd_status", status: "maybe", params: null },
      { id: 7 },
      "nonsense",
      { id: "port_mqtt", status: "pass", params: {} },
    ]);
    // No verdict from BamBuddy: the card counts.
    expect(text(find(card, ".check-verdict"))).toBe("The printer should work, but 1 thing needs attention.");
    expect(items(card)).toEqual(["new_check"]);
    expect(findAll(card, ".check-fold > button").map(text)).toEqual(["1 check passed", "4 not checked"]);
    for (const fold of findAll<HTMLButtonElement>(card, ".check-fold > button")) fold.click();
    await card.updateComplete;
    expect(findAll(card, ".check-line").map(text)).toEqual([
      "Control (port 8883)",
      "Container network In a container (docker); its network mode could not be determined.",
      "Subnet Could not be determined.",
      "Files on external storage Cannot be set on the P1. Nothing to do.",
      "odd_status Not checked.",
    ]);
    // Folded again.
    findAll<HTMLButtonElement>(card, ".check-fold > button")[0]?.click();
    await card.updateComplete;
    expect(findAll(card, ".check-line")).toHaveLength(4);
  });

  it("counts in German, and in the plural", async () => {
    const warned = await check([
      { id: "port_rtsps", status: "warn", params: { port: 6000 } },
      { id: "network_mode", status: "warn", params: {} },
    ], "warnings", "de");
    expect(text(find(warned, ".check-verdict"))).toBe("Der Drucker sollte funktionieren, aber 2 Punkte brauchen Aufmerksamkeit.");
    expect(items(warned)[0]).toBe("Kamera (Port 6000) Nicht erreichbar: kein Livebild. Drucken geht trotzdem.");
  });

  it("counts the seconds while it runs, and drops an answer for a dialog closed meanwhile", async () => {
    let answer: (value: unknown) => void = () => undefined;
    const { card } = await mount(x1c(), "dev-x1c", {}, {
      callService: async (call) => (call.service === "run_diagnostic" ? new Promise((resolve) => (answer = resolve)) : undefined),
    });
    (await menuItem(card, "Check connection")).click();
    await card.updateComplete;
    vi.setSystemTime(new Date("2026-10-16T08:00:03Z"));
    (card as FakeCard & { requestUpdate: () => void }).requestUpdate();
    await card.updateComplete;
    expect(text(find(card, ".check-seconds"))).toBe("Checking the connection … 3 s");
    button(card, "Close").click();
    await card.updateComplete;
    answer({ response: { overall: "ok", checks: [] } });
    await settle(card);
    expect(find(card, "dialog")).toBeNull();
  });
});

describe("the maintenance dialog while BamBuddy does not answer", () => {
  it("says it has no data, not “No maintenance tasks.”", async () => {
    const { card, hass } = await withX1c({ maintenance: maintenanceSpec({ state: "ok", tasks: [] }) }, { header_chips: ["maintenance"] });
    chip(card, "Maintenance OK").click();
    await card.updateComplete;
    await update(card, hass.withState("sensor.x1c_print_status", "unavailable", {}).withState("sensor.x1c_maintenance", "unavailable", {}));
    expect(text(find(card, "dialog"))).toContain("No data from BamBuddy");
    expect(text(find(card, "dialog"))).not.toContain("No maintenance tasks.");
  });
});

describe("the maintenance dialog, closer", () => {
  it("leaves out what is no task, and says when there is none", async () => {
    const { card, hass } = await withX1c({ maintenance: maintenanceSpec({ state: "ok", tasks: [] }), printHours: undefined }, { header_chips: ["maintenance"] });
    chip(card, "Maintenance OK").click();
    await card.updateComplete;
    expect(text(find(card, "dialog"))).toContain("No maintenance tasks.");
    expect(text(find(card, ".maint-foot"))).toBe("You set up tasks and intervals in BamBuddy.");
    await update(
      card,
      hass.withState("sensor.x1c_maintenance", "due_soon", {
        tasks: [null, { name: "no id" }, { id: 3, name: "Custom", due_soon: true, unit: "days", interval: 0, left: 2, last_done: "2026-10-01T00:00:00+00:00" }],
      }),
    );
    // With its Done: the key may mark tasks done.
    expect(findAll(card, ".maint-row").map(text)).toEqual(["Custom Due soon: in 2 d Done"]);
    expect((find(card, ".maint-bar > span") as HTMLElement).getAttribute("style")).toBe("width: 100%");
    await update(card, hass.withState("sensor.x1c_maintenance", "ok", { tasks: "nonsense" }));
    expect(text(find(card, "dialog"))).toContain("No maintenance tasks.");
    await update(card, hass.withState("sensor.x1c_maintenance", "unknown", {}));
    expect(chips(card)).toEqual([]);
  });
});

describe("the maintenance dialog, the connection check and the backup's unknown state", () => {
  it("says why the container network and the printer's own checks were not run", async () => {
    const { card } = await mount(x1c(), "dev-x1c", {}, {
      callService: async (call) =>
        call.service === "run_diagnostic"
          ? {
              response: {
                overall: "ok",
                checks: [
                  { id: "network_mode", status: "skip", params: {} },
                  { id: "network_mode", status: "skip", params: { reason: "system_container", runtime: "lxc" } },
                  { id: "developer_mode", status: "skip", params: {} },
                  { id: "printer_publishing", status: "skip", params: {} },
                ],
              },
            }
          : undefined,
    });
    (await menuItem(card, "Check connection")).click();
    await settle(card);
    findAll<HTMLButtonElement>(card, ".check-fold > button")[0]?.click();
    await card.updateComplete;
    expect(findAll(card, ".check-line").map(text)).toEqual([
      "Container network Not in a container.",
      "Container network In a system container (lxc): not applicable.",
      "Developer mode (LAN) Not checked: needs a live connection to the printer.",
      "Status reports Not checked: needs a live connection to the printer.",
    ]);
  });

  it("shows a failed Done inside the maintenance dialog, and the task list stays", async () => {
    const { card } = await mount(x1c({ maintenance: maintenanceSpec() }), "dev-x1c", { header_chips: ["maintenance"] }, {
      callService: async (call) => {
        if (call.service === "mark_maintenance_done") throw { message: "BamBuddy refused" };
        return undefined;
      },
    });
    findAll<HTMLButtonElement>(card, ".pills .pill")[0]?.click();
    await card.updateComplete;
    (findAll(card, ".maint-row")[1]?.querySelector("button") as HTMLButtonElement).click();
    await card.updateComplete;
    [...(findAll(card, ".maint-row")[1]?.querySelectorAll<HTMLButtonElement>(".maint-confirm button") ?? [])].at(-1)?.click();
    await settle(card);
    expect(text(find(card, "dialog .dlg-error"))).toBe("BamBuddy refused");
    expect(findAll(card, ".maint-row")).toHaveLength(5);
  });

  it("keeps the focus with the task marked done when the list sorts anew", async () => {
    const { card, hass } = await withX1c({ maintenance: maintenanceSpec() }, { header_chips: ["maintenance"] });
    findAll<HTMLButtonElement>(card, ".pills .pill")[0]?.click();
    await card.updateComplete;
    const done = find<HTMLButtonElement>(card, '.maint-done[data-task="11"]') as HTMLButtonElement;
    const row = done.closest(".maint-row") as Element;
    done.click();
    await settle(card);
    [...row.querySelectorAll<HTMLButtonElement>(".maint-confirm button")].at(-1)?.click();
    await settle(card);
    expect((card.shadowRoot as ShadowRoot).activeElement?.getAttribute("data-task")).toBe("11");
    const tasks = MAINTENANCE_TASKS.map((task) => (task.id === 11 ? { ...task, due: false, left: 25, last_done: "2026-10-16T08:00:00+00:00" } : task));
    await update(card, hass.withState("sensor.x1c_maintenance", "overdue", { tasks, can_mark_done: true }));
    const active = (card.shadowRoot as ShadowRoot).activeElement;
    // Its own button, or none: never another task's.
    if (active?.classList.contains("maint-done")) expect(active.getAttribute("data-task")).toBe("11");
  });

  it("moves the focus to the question's Cancel, and back to the row's Done after it", async () => {
    const { card } = await withX1c({ maintenance: maintenanceSpec() }, { header_chips: ["maintenance"] });
    findAll<HTMLButtonElement>(card, ".pills .pill")[0]?.click();
    await card.updateComplete;
    const row = (): Element => findAll(card, ".maint-row")[2] as Element;
    (row().querySelector("button") as HTMLButtonElement).click();
    await settle(card);
    const active = (): Element | null => (card.shadowRoot as ShadowRoot).activeElement;
    expect(text(active())).toBe("Cancel");
    const group = row().querySelector(".maint-confirm") as HTMLElement;
    expect(group.getAttribute("aria-describedby")).toBe(group.querySelector("span")?.id);
    (active() as HTMLButtonElement).click();
    await settle(card);
    expect(active()).toBe(row().querySelector(".maint-done"));
  });

  it("links the unknown backup state to its choices", async () => {
    const { card } = await withX1c({ filamentBackup: "unknown" }, { start_view: "filament" });
    const group = find(card, ".backup .backup-set") as HTMLElement;
    expect(group.getAttribute("role")).toBe("group");
    const described = (group.getAttribute("aria-describedby") ?? "").split(" ").map((id) => text((card.shadowRoot as ShadowRoot).getElementById(id)));
    expect(described).toEqual([
      "When a spool runs out, the printer continues with a matching spool from the AMS: same brand, material and color.",
      "State unknown: BamBuddy does not report it for this printer. Switching it on or off still works.",
    ]);
  });

  it("counts the seconds again when the card comes back during a check", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
    const { card } = await mount(x1c(), "dev-x1c", {}, {
      callService: async (call) => (call.service === "run_diagnostic" ? new Promise(() => undefined) : undefined),
    });
    (await menuItem(card, "Check connection")).click();
    await card.updateComplete;
    card.remove();
    document.body.append(card);
    await card.updateComplete;
    // Two seconds later: the interval drew the card again on its own.
    vi.advanceTimersByTime(2000);
    await card.updateComplete;
    expect(text(find(card, ".check-seconds"))).toBe("Checking the connection … 2 s");
  });

  it("opens an open dialog modal again when the card comes back", async () => {
    const { card } = await mount(x1c(), "dev-x1c");
    (await menuItem(card, "Printer information")).click();
    await card.updateComplete;
    const modal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    try {
      card.remove();
      document.body.append(card);
      await card.updateComplete;
      expect(modal).toHaveBeenCalledTimes(1);
      expect(find(card, "dialog")?.hasAttribute("open")).toBe(true);
    } finally {
      modal.mockRestore();
    }
  });
});

describe("the dialogs' details", () => {
  it("keeps the focus in the dialog while it checks again, in one live region without the seconds", async () => {
    let answer: (value: unknown) => void = () => undefined;
    const { card } = await mount(x1c(), "dev-x1c", {}, {
      callService: async (call) => (call.service === "run_diagnostic" ? new Promise((resolve) => (answer = resolve)) : undefined),
    });
    (await menuItem(card, "Check connection")).click();
    await card.updateComplete;
    const region = find(card, ".check-status") as HTMLElement;
    expect(region.getAttribute("role")).toBe("status");
    expect(find(card, ".check-seconds")?.getAttribute("aria-hidden")).toBe("true");
    expect(text(find(card, ".check-status .sr-only"))).toBe("Checking the connection …");
    answer({ response: { overall: "ok", checks: [] } });
    await settle(card);
    // The same region tells the verdict.
    expect(find(card, ".check-status")).toBe(region);
    expect(text(region)).toBe("No problems found.");
    button(card, "Check again").click();
    await settle(card);
    expect((card.shadowRoot as ShadowRoot).activeElement).toBe(find(card, "dialog .btn.safe"));
  });

  it("colours the folded lines by their meaning", async () => {
    const { card } = await mount(x1c(), "dev-x1c", {}, {
      callService: async (call) =>
        call.service === "run_diagnostic"
          ? { response: { overall: "ok", checks: [{ id: "port_mqtt", status: "pass", params: {} }, { id: "subnet", status: "skip", params: {} }] } }
          : undefined,
    });
    (await menuItem(card, "Check connection")).click();
    await settle(card);
    expect(findAll(card, ".check-fold").map((fold) => fold.classList.contains("tone-ok") ? "ok" : fold.classList.contains("tone-neutral") ? "neutral" : "")).toEqual([
      "ok",
      "neutral",
    ]);
  });

  it("keeps the question's buttons together, and Escape cancels only the question", async () => {
    const { card } = await withX1c({ maintenance: maintenanceSpec() }, { header_chips: ["maintenance"] }, "de");
    findAll<HTMLButtonElement>(card, ".pills .pill")[0]?.click();
    await card.updateComplete;
    const row = (): Element => findAll(card, ".maint-row")[1] as Element;
    (row().querySelector("button") as HTMLButtonElement).click();
    await settle(card);
    expect([...row().querySelectorAll(".maint-confirm-actions button")].map(text)).toEqual(["Abbrechen", "Erledigt"]);
    const dialog = find(card, "dialog") as HTMLDialogElement;
    const escape = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(escape);
    await settle(card);
    expect(escape.defaultPrevented).toBe(true);
    expect(row().querySelector(".maint-confirm")).toBeNull();
    expect(find(card, "dialog")).not.toBeNull();
  });

  it("explains BamBuddy's count for a task never marked done among done ones", async () => {
    const { card } = await withX1c({ maintenance: maintenanceSpec() }, { header_chips: ["maintenance"] });
    findAll<HTMLButtonElement>(card, ".pills .pill")[0]?.click();
    await card.updateComplete;
    expect(text(find(card, "dialog"))).toContain("BamBuddy counts from 0 h until a task has been marked done once.");
  });

  it("puts the unknown backup choice on a line of its own", async () => {
    const { card } = await withX1c({ filamentBackup: "unknown" }, { start_view: "filament" });
    expect(find(card, ".backup .det-row")?.classList.contains("choosing")).toBe(true);
    const rule = /\.backup \.det-row\.choosing\s*\{([^}]*)\}/.exec(styleText())?.[1] ?? "";
    expect(rule).toContain("flex-wrap: wrap");
  });
});

describe("the AMS strip, the nozzle tags and the read-only views", () => {
  it("gives the focus back to the row's Done once the task is marked, or failed", async () => {
    for (const fails of [false, true]) {
      const { card } = await mount(x1c({ maintenance: maintenanceSpec() }), "dev-x1c", { header_chips: ["maintenance"] }, {
        callService: async (call) => {
          if (fails && call.service === "mark_maintenance_done") throw { message: "BamBuddy refused" };
          return undefined;
        },
      });
      findAll<HTMLButtonElement>(card, ".pills .pill")[0]?.click();
      await card.updateComplete;
      (find(card, '.maint-done[data-task="12"]') as HTMLButtonElement).click();
      await settle(card);
      [...(find(card, ".maint-confirm")?.querySelectorAll<HTMLButtonElement>("button") ?? [])].at(-1)?.click();
      await settle(card);
      await settle(card);
      expect((card.shadowRoot as ShadowRoot).activeElement, String(fails)).toBe(find(card, '.maint-done[data-task="12"]'));
    }
  });
});

describe("the tabs on a narrow card", () => {
  it("carry an icon each, and their name as a tooltip and for a screen reader", async () => {
    const { card } = await withX1c({});
    const tabs = findAll<HTMLButtonElement>(card, "[role=tab]");
    expect(tabs.map((tab) => [tab.querySelector(".tab-icon svg") !== null, text(tab.querySelector(".tab-text")), tab.getAttribute("title")])).toEqual([
      [true, "Status", "Status"],
      [true, "Control", "Control"],
      [true, "Filament", "Filament"],
    ]);
  });
});

describe("the narrow card at 168 px", () => {
  const rule = (selector: string, body: string): RegExp => new RegExp(`${selector}\\s*\\{[^}]*${body}`);

  it("keeps the step's three choices whole: on a line of their own from 280 px down", () => {
    const narrow = atRule("@container (max-width: 280px)");
    expect(narrow).toMatch(rule("\\.step-row", "flex-wrap: wrap;"));
    expect(narrow).toMatch(rule("\\.step-row \\.seg", "flex: 1 0 100%;"));
  });

  it("puts an AMS unit's colours two a row, so the fourth stays in its box", () => {
    const tiny = atRule("@container (max-width: 200px)");
    expect(tiny).toMatch(rule("\\.ams-slots", "display: grid;[^}]*grid-template-columns: repeat\\(2, auto\\);"));
    // A slot's sub line wraps rather than being cut (from 280 px down).
    expect(atRule("@container (max-width: 280px)")).toMatch(rule("\\.slot-sub", "white-space: normal;"));
  });

  it("gives each heater room above the line below it", () => {
    const half = atRule("@container (max-width: 280px)");
    expect(half).toMatch(rule("\\.heat-row", "padding-bottom: 8px;"));
    expect(half).toMatch(rule("\\.heat-row \\+ \\.heat-row", "padding-top: 6px;"));
  });

  it("marks the active nozzle in the Status tab only during a job; the Control tab always", async () => {
    // Idle, "active" says only where the next load or extrusion goes: the Control tab's business.
    const idle = await mount(h2d({ status: "idle", stage: "idle", hms: [] }), "dev-h2d");
    expect(findAll(idle.card, ".temps .temp").slice(0, 2).map((tile) => text(tile.querySelector(".temp-head")))).toEqual(["Left nozzle", "Right nozzle"]);
    const control = await mount(h2d({ status: "idle", stage: "idle", hms: [] }), "dev-h2d", { start_view: "control" });
    expect(text(find(control.card, ".heat-row .heat-label"))).toBe("Left nozzle active");
  });

  it("marks the active nozzle in the Status tab too", async () => {
    const { card } = await mount(h2d(), "dev-h2d");
    const tiles = findAll(card, ".temps .temp");
    expect(tiles.slice(0, 2).map((tile) => [text(tile.querySelector(".temp-head")), tile.getAttribute("aria-label")?.includes("active")])).toEqual([
      ["Left nozzle active", true],
      ["Right nozzle", false],
    ]);
    const german = await mount(h2d({ activeNozzle: "right" }), "dev-h2d", {}, { language: "de" });
    expect(findAll(german.card, ".temps .temp").slice(0, 2).map((tile) => text(tile.querySelector(".temp-head")))).toEqual(["Linke Düse", "Rechte Düse aktiv"]);
  });
});

describe("the temperature a unit dries at (where it fits)", () => {
  it("stands in the drying line, the time after it", async () => {
    const devices = h2d({ status: "idle", stage: "idle", hms: [] });
    const unit = devices.find((device) => device.model === "AMS 2 Pro") as FakeDevice;
    const drying = unit.entities.find((entity) => entity.key === "drying") as { attributes?: Record<string, unknown> };
    drying.attributes = { target_temperature: 65 };
    const { card } = await mount(devices, "dev-h2d", { start_view: "filament" }, { language: "de" });
    expect(text(find(card, ".drying span"))).toBe(`Trocknet bei 65${NBSP}°C · noch${NBSP}3${NBSP}Std.${NBSP}20${NBSP}Min.`);
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

describe("the drying chip on a narrow card", () => {
  it("puts its time, bold, on a line of its own rather than leave a separator hanging", async () => {
    const { card } = await mount(h2d(), "dev-h2d", { header_chips: ["drying"] });
    const chip = find(card, ".pills .dry-chip") as HTMLElement;
    expect([...(chip.querySelector(".dry-text")?.children ?? [])].map((part) => [part.className, text(part)])).toEqual([
      ["", "Drying"],
      ["dry-time", `3${NBSP}h${NBSP}20${NBSP}min`],
    ]);
    const sheet = styleText();
    expect(sheet).toMatch(/\.dry-chip \.dry-text\s*\{[^}]*flex-wrap: wrap;/);
    expect(sheet).toMatch(/\.dry-chip \.dry-text > span\s*\{[^}]*white-space: nowrap;/);
    expect(sheet).toMatch(/\.dry-chip \.dry-time\s*\{[^}]*font-weight: 700;/);
  });
});

describe("the 0-hour note where the card cannot mark tasks done", () => {
  const note = async (overrides: Partial<PrinterSpec>, config: Record<string, unknown>): Promise<string> => {
    const { card } = await withX1c({ maintenance: maintenanceSpec(), ...overrides }, { header_chips: ["maintenance"], ...config }, "de");
    findAll<HTMLButtonElement>(card, ".pills .pill")[0]?.click();
    await card.updateComplete;
    return text(find(card, "dialog .dlg-note"));
  };

  it("says where to mark them: here, or in BamBuddy with Hide controls", async () => {
    expect(await note({}, {})).toBe("BamBuddy zählt ab 0 Std., bis eine Aufgabe einmal als erledigt markiert ist. Markiere, was du schon gemacht hast.");
    expect(await note({}, { read_only: true })).toBe(
      "BamBuddy zählt ab 0 Std., bis eine Aufgabe einmal als erledigt markiert ist. Als erledigt markieren kannst du sie in BamBuddy – diese Karte blendet ihre Steuerelemente aus.",
    );
  });
});

describe("Hide controls shows states", () => {
  const hidden = { read_only: true };

  it("shows the chamber light's state, not a button", async () => {
    const { card } = await withX1c({}, hidden, "de");
    const light = find(card, ".head .light") as HTMLElement;
    expect([light.tagName, light.getAttribute("role"), light.getAttribute("aria-label"), light.classList.contains("on")]).toEqual([
      "SPAN",
      "img",
      "Kammerbeleuchtung: An",
      true,
    ]);
  });

  it("shows the fans without a tap -- their dialog sets their speed --, the hotend fan opens its sensor", async () => {
    const { card } = await withX1c({}, hidden);
    expect(findAll(card, ".fans span.fan").length).toBeGreaterThan(0);
    const buttons = findAll<HTMLButtonElement>(card, ".fans button");
    expect(buttons.map((item) => item.getAttribute("aria-label"))).toEqual([expect.stringMatching(/^Hotend fan/)]);
    const opened: string[] = [];
    card.addEventListener("hass-more-info", (event) => opened.push((event as CustomEvent<{ entityId: string }>).detail.entityId));
    buttons[0]?.click();
    expect(opened).toEqual(["sensor.x1c_hotend_fan"]);
  });

  it("shows the Control tab read-only: targets, print options and the airduct as text, no axes", async () => {
    const { card, hass } = await withX1c({ airduct: "heating", status: "idle", stage: "idle" }, { ...hidden, start_view: "control" }, "de");
    expect(find(card, ".heating button")).toBeNull();
    expect(findAll(card, ".heat-target").map(shown)).toEqual(["220 °C", "55 °C"].map((value) => value.replace(" ", "\u00a0")));
    expect(text(find(card, ".airduct .det-state"))).toBe("Heizen");
    expect(find(card, ".pad")).toBeNull();
    (find(card, ".det-head") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(find(card, ".detection [role=switch]")).toBeNull();
    expect(findAll(card, ".detection .det-state").map(text)).toEqual(["An", "An", "Aus"]);
    expect(hass.calls).toHaveLength(0);
  });

  it("keeps no Control tab where the key cannot control: nothing to show", async () => {
    const { card } = await mount(x1c({ control: false }), "dev-x1c", hidden);
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Filament"]);
  });
});


describe("the AMS strip's order", () => {
  const names = (scope: Element | null | undefined): string[] => [...(scope?.querySelectorAll(".ams-name") ?? [])].map((item) => text(item));
  const rule = (selector: string, body: string): RegExp => new RegExp(`${selector}\\s*\\{[^}]*${body}`);

  it("puts the AMS units in a column, the AMS HT units and the external spools beside it", async () => {
    const { card } = await mount(h2d(), "dev-h2d");
    const strip = find(card, ".ams-strip");
    expect([...(strip?.children ?? [])].map((child) => child.classList[0])).toEqual(["sr-only", "ams-column", "ams-fill", "ams-go"]);
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
    expect(sheet).toMatch(rule("\\.ams-strip", "flex-wrap: wrap;"));
    expect(sheet).toMatch(rule("\\.ams-column", "flex-direction: column;"));
    // Its widest unit decides whether the fill fits beside the column.
    expect(sheet).toMatch(rule("\\.ams-fill", "flex: 1 1 0%;[^}]*min-width: min-content;[^}]*flex-wrap: wrap;"));
    // 16 px apart, 36 px kept for the chevron: an AMS HT fits beside an AMS
    // from a card of about 326 px, well below a 360 px phone's 344.
    expect(sheet).toMatch(rule("\\.ams-strip", "gap: 8px 16px;[^}]*padding: 10px 36px 10px 12px;"));
    // An AMS HT's head: its second line, the humidity (14 px + 4ch), 6 px,
    // the temperature (14 px + 4.5ch).
    expect(sheet).toMatch(rule("\\.ams-fill\\.with-ht \\.ams-head", "min-width: calc\\(34px \\+ 8\\.5ch\\);"));
  });

  it("lets a head's lines wrap on a card under 200 px, clear of the chevron", () => {
    const tiny = atRule("@container (max-width: 200px)");
    expect(tiny).toMatch(rule("\\.ams-line,\\s*\\.ams-env", "height: auto;[^}]*flex-wrap: wrap;"));
    // No AMS HT's width there: the unit is as wide as the card has room.
    expect(tiny).toMatch(rule("\\.ams-fill\\.with-ht \\.ams-head", "min-width: 0;"));
  });

  it("keeps a unit's width when its humidity or temperature changes", () => {
    // Else a unit beside the column could go below it at 10 % and back at 9 %:
    // room for 99 % and 88 °C.
    const sheet = styleText();
    expect(sheet).toMatch(rule("\\.ams-env > span", "font-variant-numeric: tabular-nums;"));
    expect(sheet).toMatch(rule("\\.ams-hum", "min-width: calc\\(14px \\+ 4ch\\);"));
    expect(sheet).toMatch(rule("\\.ams-temp", "min-width: calc\\(14px \\+ 4\\.5ch\\);"));
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
  const rule = (selector: string, body: string): RegExp => new RegExp(`${selector}\\s*\\{[^}]*${body}`);

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
    expect(sheet).toMatch(rule("\\.ams-line,\\s*\\.ams-env", "height: 15px;"));
    // The L and R of two external spools: as high as the second line.
    expect(sheet).toMatch(rule("\\.slot-side", "height: 13px;[^}]*line-height: 13px;"));
    // The chip a shade darker than the strip it sits on.
    expect(sheet).toMatch(rule("\\.ams-strip \\.unit-model,\\s*\\.ams-strip \\.ams-nozzle", "background: var\\(--bb-tint-2\\);"));
  });
});

