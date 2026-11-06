// The card's newer parts (2026-10-18): the chips for maintenance, door,
// storage and drying; the maintenance dialog; the connection check; the
// airduct mode and the AMS filament backup.
import { describe, expect, it, vi } from "vitest";

import "../src/index";
import { findPrinter } from "../src/discovery";
import {
  h2d,
  MAINTENANCE_TASKS,
  maintenanceSpec,
  makeHass,
  mountFor,
  unreachable,
  x1c,
  type FakeCard,
  type FakeDevice,
} from "./fixtures";
import { atRule, button, cssRule, declarations, find, findAll, moreInfoIds, NBSP, root, settle, shownText, styleText, text, update } from "./helpers";
import { useCardPage, withX1c } from "./card-helpers";
import { chip, chips, menuItem } from "./feature-helpers";

useCardPage();

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
    const due = chip(card, "Maintenance: 3 due");
    expect([due.classList.contains("tone-err"), due.getAttribute("aria-label")]).toEqual([true, "Maintenance: 3 due – 2 overdue, 1 due soon"]);
    expect(due.getAttribute("aria-haspopup")).toBe("dialog");
    const soon = MAINTENANCE_TASKS.map((task) => ({ ...task, due: false }));
    await update(card, hass.withState("sensor.x1c_maintenance", "due_soon", { tasks: soon, due_count: 0, due_soon_count: 1, can_mark_done: true }));
    expect(chip(card, "Maintenance: 1 due soon").classList.contains("tone-warn")).toBe(true);
    await update(card, hass.withState("sensor.x1c_maintenance", "ok", { tasks: [], due_count: 0, due_soon_count: 0, can_mark_done: true }));
    expect(chip(card, "Maintenance OK").classList.contains("tone-ok")).toBe(true);
    // No data: no chip.
    await update(card, hass.withState("sensor.x1c_maintenance", "unavailable", {}));
    expect(chips(card)).toEqual([]);
  });

  it("show maintenance also with the printer offline, not while BamBuddy gives no data", async () => {
    const offline = await withX1c({ ...all, online: false }, { header_chips: ["maintenance"] });
    expect(chips(offline.card)).toEqual(["Maintenance: 3 due"]);
    const silent = await mountFor(unreachable(x1c(all)), "dev-x1c", { header_chips: ["maintenance"] });
    expect(chips(silent.card)).toEqual([]);
  });

  it("show the door only while it is open, as information", async () => {
    const { card, hass } = await withX1c(all, { header_chips: ["door"] });
    const ids = moreInfoIds(card);
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
    const usb = await mountFor(h2d({ storage: "off", storageUsb: true }), "dev-h2d", { header_chips: ["storage"] });
    expect(chips(usb.card)).toEqual(["No USB drive"]);
  });

  it("show drying as one chip, with the longest time left, for every unit that dries", async () => {
    const { card, hass } = await mountFor(h2d(), "dev-h2d", { header_chips: ["drying"] });
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
    const { card } = await mountFor(h2d(), "dev-h2d", { header_chips: ["drying"], show_filament_tab: false });
    const ids = moreInfoIds(card);
    chip(card, `Drying 3${NBSP}h${NBSP}20${NBSP}min`).click();
    // The time it shows.
    expect(ids).toEqual(["sensor.dev-h2d_ams_0_drying_remaining_time"]);
  });

  it("say it in German", async () => {
    const { card } = await mountFor(h2d({ door: "on", storage: "off", storageUsb: true, maintenance: maintenanceSpec({ state: "ok", tasks: [] }) }), "dev-h2d", {
      header_chips: ["maintenance", "door", "storage", "drying"],
    }, { language: "de" });
    expect(chips(card)).toEqual(["Wartung OK", "Tür offen", "Kein USB-Stick", `Trocknet 3${NBSP}Std.${NBSP}20${NBSP}Min.`]);
  });

  it("never cut their text: a chip wider than the card wraps its words", () => {
    const pill = declarations(".pill");
    expect(pill).toContain("white-space: normal");
    expect(pill.filter((declaration) => declaration.startsWith("max-width") || declaration.includes("ellipsis"))).toEqual([]);
  });
});

describe("keeping the chamber warm (an airduct printer without a chamber heater, the P2S)", () => {
  // The X1C's fixture with an airduct select and no chamber target: as a P2S.
  const row = (card: FakeCard): Element | null => find(card, ".keep-warm");
  const radios = (card: FakeCard): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".keep-warm [role=radio]");
  const section = (card: FakeCard): Element | null => find(card, ".heating");

  it("switches keeping warm off and on without a print, under Heating, and says what heating and ventilation do", async () => {
    const { card, hass } = await withX1c({ airduct: "cooling", status: "idle", stage: "idle" }, { start_view: "control" });
    expect(text(row(card)?.querySelector(".heat-name") ?? null)).toBe("Chamber Keep warm");
    expect(radios(card).map((item) => [text(item), item.getAttribute("aria-checked")])).toEqual([
      ["Off", "true"],
      ["On", "false"],
    ]);
    expect(find(card, ".airduct")).toBeNull();
    expect(text(section(card))).toContain(
      "Heating keeps the warmth in the chamber (ABS, ASA, PC, PA), ventilation draws fresh air in (PLA, TPU). The printer sets this itself at every print start.",
    );
    radios(card)[1]?.click();
    await settle(card);
    expect(hass.calls.at(-1)).toMatchObject({ domain: "select", service: "select_option", data: { entity_id: "select.x1c_airduct_mode", option: "heating" } });
  });

  it("keeps the warmth on out of reach while the chamber is ventilated, and says how", async () => {
    const ventilated = { airduct: "cooling", status: "idle", stage: "idle", ventilation: { percent: 60, fans: ["aux"] } };
    const { card } = await withX1c(ventilated, { start_view: "control" });
    // Only on waits: a lock never takes the way off.
    expect(radios(card).map((item) => [text(item), item.disabled])).toEqual([
      ["Off", false],
      ["On", true],
    ]);
    expect(text(section(card))).toContain("While the chamber is ventilated, it cannot be kept warm. First turn off the chamber under Ventilation below.");
    const german = await withX1c(ventilated, { start_view: "control" }, "de");
    expect(text(section(german.card))).toContain("Solange die Kammer gelüftet wird, lässt sie sich nicht warm halten. Schalte zuerst unten unter „Lüften“ die Kammer aus.");
    // The keyboard comes in on the choice it has.
    expect(radios(card).map((item) => item.getAttribute("tabindex"))).toEqual(["0", "-1"]);
  });

  it("waits during a print and during a filament change", async () => {
    const printing = await withX1c({ airduct: "heating" }, { start_view: "control" });
    expect(radios(printing.card).every((item) => item.disabled)).toBe(true);
    expect(text(section(printing.card))).toContain("Can be changed once the print is done.");
    const changing = await withX1c({ airduct: "heating", status: "idle", stage: "idle", amsStatus: "feeding" }, { start_view: "control" });
    expect(radios(changing.card).every((item) => item.disabled)).toBe(true);
    expect(text(section(changing.card))).toContain("Wait until the filament change is done.");
  });

  it("chooses nothing for a mode it does not know", async () => {
    const { card } = await withX1c({ airduct: "unknown", status: "idle", stage: "idle" }, { start_view: "control" });
    expect(radios(card).map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "false"]);
  });

  it("shows keeping warm as text without controls", async () => {
    const { card } = await withX1c({ airduct: "heating", status: "idle", stage: "idle" }, { read_only: true, start_view: "control" }, "de");
    expect(text(find(card, ".keep-warm .heat-target"))).toBe("An");
    expect(find(card, ".keep-warm [role=radio]")).toBeNull();
  });

  it("is not there without the select", async () => {
    const { card } = await withX1c({}, { start_view: "control" });
    expect(row(card)).toBeNull();
    expect(text(section(card))).not.toContain("ventilation draws fresh air in");
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
    const { card, hass } = await mountFor(x1c({ filamentBackup: "unknown" }), "dev-x1c", { start_view: "filament" }, {
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
    const { card } = await mountFor(h2d({ filamentBackup: "off" }), "dev-h2d", { start_view: "filament" });
    expect(text(row(card))).toContain("With two nozzles, only spools on the same side.");
  });

  it("is not there on a printer without an AMS unit now (one was plugged in before)", async () => {
    const [printer] = x1c({ filamentBackup: "on" });
    const { card } = await mountFor([printer as FakeDevice], "dev-x1c", { start_view: "filament" });
    expect(find(card, ".unit")).not.toBeNull();
    expect(row(card)).toBeNull();
  });

  it("is not there without the switch", async () => {
    const { card } = await withX1c({ filamentBackup: "none" }, { start_view: "filament" });
    expect(row(card)).toBeNull();
  });
});

describe("the maintenance dialog, the connection check and the backup's unknown state", () => {
  it("says why the container network and the printer's own checks were not run", async () => {
    const { card } = await mountFor(x1c(), "dev-x1c", {}, {
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
    const { card } = await mountFor(x1c({ maintenance: maintenanceSpec() }), "dev-x1c", { header_chips: ["maintenance"] }, {
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
    expect(root(card).activeElement?.getAttribute("data-task")).toBe("11");
    const tasks = MAINTENANCE_TASKS.map((task) => (task.id === 11 ? { ...task, due: false, left: 25, last_done: "2026-10-16T08:00:00+00:00" } : task));
    await update(card, hass.withState("sensor.x1c_maintenance", "overdue", { tasks, can_mark_done: true }));
    const active = root(card).activeElement;
    // Its own button, or none (the focus fell to the page; dialogs.test.ts
    // pins how it comes back): never another task's.
    expect(active === null || active.getAttribute("data-task") === "11").toBe(true);
  });

  it("moves the focus to the question's Cancel, and back to the row's Done after it", async () => {
    const { card } = await withX1c({ maintenance: maintenanceSpec() }, { header_chips: ["maintenance"] });
    findAll<HTMLButtonElement>(card, ".pills .pill")[0]?.click();
    await card.updateComplete;
    const row = (): Element => findAll(card, ".maint-row")[2] as Element;
    (row().querySelector("button") as HTMLButtonElement).click();
    await settle(card);
    const active = (): Element | null => root(card).activeElement;
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
    const described = (group.getAttribute("aria-describedby") ?? "").split(" ").map((id) => text(root(card).getElementById(id)));
    expect(described).toEqual([
      "When a spool runs out, the printer continues with a matching spool from the AMS: same brand, material and color.",
      "State unknown: BamBuddy does not report it for this printer. Turning it on or off still works.",
    ]);
  });

  it("counts the seconds again when the card comes back during a check", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
    const { card } = await mountFor(x1c(), "dev-x1c", {}, {
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
    const { card } = await mountFor(x1c(), "dev-x1c");
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
    const { card } = await mountFor(x1c(), "dev-x1c", {}, {
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
    expect(root(card).activeElement).toBe(find(card, "dialog .btn.safe"));
  });

  it("says a failed check as an alert, as the other dialogs' errors", async () => {
    const { card } = await mountFor(x1c(), "dev-x1c", {}, {
      callService: async (call) => {
        if (call.service === "run_diagnostic") throw { message: "BamBuddy refused" };
        return undefined;
      },
    });
    (await menuItem(card, "Check connection")).click();
    await settle(card);
    expect(find(card, "dialog .check-status .dlg-error")?.getAttribute("role")).toBe("alert");
  });

  it("colours the folded lines by their meaning", async () => {
    const { card } = await mountFor(x1c(), "dev-x1c", {}, {
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
    expect(declarations(".backup .det-row.choosing")).toContain("flex-wrap: wrap");
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

  it("keeps the step's three choices whole: on a line of their own from 280 px down", () => {
    const narrow = atRule("@container (max-width: 280px)");
    expect(declarations(".step-row", narrow)).toContain("flex-wrap: wrap");
    expect(declarations(".step-row .seg", narrow)).toContain("flex: 1 0 100%");
  });

  it("puts an AMS unit's colours two a row, so the fourth stays in its box", () => {
    const tiny = atRule("@container (max-width: 200px)");
    expect(tiny).toMatch(cssRule("\\.ams-slots", "display: grid;[^}]*grid-template-columns: repeat\\(2, auto\\);"));
    // A slot's sub line wraps rather than being cut (from 280 px down).
    expect(declarations(".slot-sub", atRule("@container (max-width: 280px)"))).toContain("white-space: normal");
  });

  it("gives each heater room above the line below it", () => {
    const half = atRule("@container (max-width: 280px)");
    expect(declarations(".heat-row", half)).toContain("padding-bottom: 8px");
    expect(declarations(".heat-row + .heat-row", half)).toContain("padding-top: 6px");
  });

  it("marks the active nozzle only during a job, in the Status tab and the Control tab", async () => {
    // Idle, "active" beside Off would read as on: the Control tab's select says which one is chosen.
    const idle = await mountFor(h2d({ status: "idle", stage: "idle", hms: [] }), "dev-h2d");
    expect(findAll(idle.card, ".temps .temp").slice(0, 2).map((tile) => text(tile.querySelector(".temp-head")))).toEqual(["Left nozzle", "Right nozzle"]);
    const control = await mountFor(h2d({ status: "idle", stage: "idle", hms: [] }), "dev-h2d", { start_view: "control" });
    expect(text(find(control.card, ".heat-row .heat-label"))).toBe("Left nozzle");
    const printing = await mountFor(h2d(), "dev-h2d", { start_view: "control" });
    expect(text(find(printing.card, ".heat-row .heat-label"))).toBe("Left nozzle active");
  });

  it("marks the active nozzle in the Status tab too", async () => {
    const { card } = await mountFor(h2d(), "dev-h2d");
    const tiles = findAll(card, ".temps .temp");
    expect(tiles.slice(0, 2).map((tile) => [text(tile.querySelector(".temp-head")), tile.getAttribute("aria-label")?.includes("active")])).toEqual([
      ["Left nozzle active", true],
      ["Right nozzle", false],
    ]);
    const german = await mountFor(h2d({ activeNozzle: "right" }), "dev-h2d", {}, { language: "de" });
    expect(findAll(german.card, ".temps .temp").slice(0, 2).map((tile) => text(tile.querySelector(".temp-head")))).toEqual(["Linke Düse", "Rechte Düse aktiv"]);
  });
});

describe("the temperature a unit dries at (where it fits)", () => {
  it("stands in the drying line, the time after it", async () => {
    const devices = h2d({ status: "idle", stage: "idle", hms: [] });
    const unit = devices.find((device) => device.model === "AMS 2 Pro") as FakeDevice;
    const drying = unit.entities.find((entity) => entity.key === "drying") as { attributes?: Record<string, unknown> };
    drying.attributes = { target_temperature: 65 };
    const { card } = await mountFor(devices, "dev-h2d", { start_view: "filament" }, { language: "de" });
    expect(text(find(card, ".drying span"))).toBe(`Trocknet bei 65${NBSP}°C · noch${NBSP}3${NBSP}Std.${NBSP}20${NBSP}Min.`);
  });
});

describe("the drying chip on a narrow card", () => {
  it("puts its time, bold, on a line of its own rather than leave a separator hanging", async () => {
    const { card } = await mountFor(h2d(), "dev-h2d", { header_chips: ["drying"] });
    const chip = find(card, ".pills .dry-chip") as HTMLElement;
    expect([...(chip.querySelector(".dry-text")?.children ?? [])].map((part) => [part.className, text(part)])).toEqual([
      ["", "Drying"],
      ["dry-time", `3${NBSP}h${NBSP}20${NBSP}min`],
    ]);
    const sheet = styleText();
    expect(declarations(".dry-chip .dry-text", sheet)).toContain("flex-wrap: wrap");
    expect(declarations(".dry-chip .dry-text > span", sheet)).toContain("white-space: nowrap");
    expect(declarations(".dry-chip .dry-time", sheet)).toContain("font-weight: 700");
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
    expect(buttons.map((item) => text(item.querySelector(".fan-label.full")))).toEqual([expect.stringMatching(/^Hotend fan/)]);
    const opened = moreInfoIds(card);
    buttons[0]?.click();
    expect(opened).toEqual(["sensor.x1c_hotend_fan"]);
  });

  it("shows the Control tab read-only: targets, print options and keeping warm as text, no axes", async () => {
    const { card, hass } = await withX1c({ airduct: "heating", status: "idle", stage: "idle" }, { ...hidden, start_view: "control" }, "de");
    expect(find(card, ".heating button")).toBeNull();
    expect(findAll(card, ".heat-target").map(shownText)).toEqual(["220 °C", "55 °C", "An"].map((value) => value.replace(" ", "\u00a0")));
    expect(find(card, ".pad")).toBeNull();
    (find(card, ".det-head") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(find(card, ".detection [role=switch]")).toBeNull();
    expect(findAll(card, ".detection .det-state").map(text)).toEqual(["An", "An", "Aus"]);
    expect(hass.calls).toHaveLength(0);
  });

  it("keeps no Control tab where the key cannot control: nothing to show", async () => {
    const { card } = await mountFor(x1c({ control: false }), "dev-x1c", hidden);
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Filament"]);
  });
});

