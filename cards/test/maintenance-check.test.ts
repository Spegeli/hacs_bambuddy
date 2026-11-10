// The maintenance dialog and the connection check.
import { describe, expect, it, vi } from "vitest";

import "../src/index";
import { en } from "../src/translations/en";
import {
  MAINTENANCE_TASKS,
  maintenanceSpec,
  mountFor,
  offlineP1s,
  unreachable,
  x1c,
  type FakeCard,
  type FakeHassOptions,
  type Mounted,
  type PrinterSpec,
} from "./fixtures";
import {
  button,
  find,
  findAll,
  hasButton,
  root,
  settle,
  shownText,
  text,
  update,
} from "./helpers";
import { pastTheWait, useCardPage, withX1c } from "./card-helpers";
import { chip, chips, menuItem, openMenu } from "./feature-helpers";

useCardPage();

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
    const { card } = await mountFor(offlineP1s(), "dev-p1s", {}, { callService: answering(alone) });
    button(card, "Check connection").click();
    await settle(card);
    expect(findAll(card, ".check-item").map(shownText)).toEqual(["File transfer (port 990) Not reachable: BamBuddy cannot send prints. Unblock port 990."]);
  });

  it("is offered in the offline view, not while BamBuddy gives no data", async () => {
    const { card } = await mountFor(offlineP1s(), "dev-p1s");
    expect(hasButton(card, "Check connection")).toBe(true);
    const silent = await mountFor(unreachable(offlineP1s()), "dev-p1s");
    expect(hasButton(silent.card, "Check connection")).toBe(false);
  });

  it("is in the menu always, and waits while BamBuddy gives no data", async () => {
    const { card } = await withX1c({});
    expect((await menuItem(card, "Check connection")).disabled).toBe(false);
    const silent = await mountFor(unreachable(x1c()), "dev-x1c");
    expect((await menuItem(silent.card, "Check connection")).disabled).toBe(true);
  });

  it("runs while the dialog says so, then gives the verdict and what to do", async () => {
    let answer: (value: unknown) => void = () => undefined;
    const { card, hass } = await mountFor(offlineP1s(), "dev-p1s", {}, {
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
    expect(findAll(card, ".check-item").map(shownText)).toEqual([
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
    const failing = await mountFor(x1c(), "dev-x1c", {}, {
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
    const { card } = await mountFor(x1c(), "dev-x1c", {}, {
      callService: answering({ overall: "warnings", checks: [{ id: "network_mode", status: "warn", params: { mode: "bridge", runtime: "docker" } }] }),
    });
    (await menuItem(card, "Check connection")).click();
    await settle(card);
    expect(text(find(card, ".check-verdict"))).toBe("The printer should work, but 1 thing needs attention.");
    expect(text(find(card, ".check-item"))).toContain("Printer discovery needs host networking");
  });
});

describe("the connection check's words, closer", () => {
  const check = async (checks: unknown[], overall?: string, language = "en"): Promise<FakeCard> => {
    const { card } = await mountFor(x1c(), "dev-x1c", {}, {
      language,
      callService: async (call) => (call.service === "run_diagnostic" ? { response: { ...(overall ? { overall } : {}), checks } } : undefined),
    });
    (await menuItem(card, language === "de" ? "Verbindung prüfen" : "Check connection")).click();
    await settle(card);
    return card;
  };
  const items = (card: FakeCard): string[] => findAll(card, ".check-item").map(shownText);

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
    expect(found[2]).toBe(`Developer mode (LAN) ${en.developer_off}`);
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
    const { card } = await mountFor(x1c(), "dev-x1c", {}, {
      callService: async (call) => (call.service === "run_diagnostic" ? new Promise((resolve) => (answer = resolve)) : undefined),
    });
    (await menuItem(card, "Check connection")).click();
    await card.updateComplete;
    vi.setSystemTime(new Date("2026-10-16T08:00:03Z"));
    card.requestUpdate();
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
    await pastTheWait(card);
    expect(text(find(card, "dialog"))).toContain("No data from BamBuddy");
    expect(text(find(card, "dialog"))).not.toContain("No maintenance tasks.");
  });
});

describe("the maintenance dialog's focus once a task is marked", () => {
  it("gives the focus back to the row's Done once the task is marked, or failed", async () => {
    for (const fails of [false, true]) {
      const { card } = await mountFor(x1c({ maintenance: maintenanceSpec() }), "dev-x1c", { header_chips: ["maintenance"] }, {
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
      expect(root(card).activeElement, String(fails)).toBe(find(card, '.maint-done[data-task="12"]'));
    }
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
