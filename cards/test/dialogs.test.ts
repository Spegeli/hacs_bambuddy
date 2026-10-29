// The dialogs: the keyboard's place, a state that changes while one is
// open, narrow phones, names that start with what a chip shows.
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { h2d, makeHass, maintenanceSpec, mountCard, p1s, plugDevice, x1c, type FakeCard, type FakeDevice, type FakeHass, type ServiceCall } from "./fixtures";
import { button, find, findAll, root, settle, styleText, text, update } from "./helpers";

afterEach(() => {
  document.body.innerHTML = "";
});

/** A key pressed on an element of the card: the keyboard is there. */
const keyPress = (element: Element, key = "Enter"): boolean => element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));

/** The X1C finished, its plug waiting to switch it off. */
function waitingX1c(): FakeDevice[] {
  const devices = x1c({ status: "finished", stage: "idle", nozzles: [[142, 0]] });
  return [...devices, plugDevice({ printer: devices[0] as FakeDevice, id: 3, name: "Tasmota", watts: 182, autoOff: { armed: true, phase: "waiting", since: "2026-10-18T14:05:00+00:00" } })];
}

describe("a control in a dialog that goes after its own press", () => {
  it("leaves the keyboard on the dialog's safe button, not on the page (the skip of the switch-off)", async () => {
    const hass = makeHass({ devices: waitingX1c() });
    const card = await mountCard(hass, { printer: "dev-x1c", header_chips: ["power"] });
    (find(card, ".pill.power-chip") as HTMLButtonElement).click();
    await card.updateComplete;
    const skip = button(card, "Don't switch off this time");
    skip.focus();
    keyPress(skip);
    skip.click();
    await settle(card);
    expect(hass.calls.at(-1)).toMatchObject({ domain: "button", service: "press" });
    // The integration: this print stays on -- the button goes.
    const id = "switch.dev-x1c_plug_3_auto_off";
    await update(card, hass.withState(id, "on", { ...hass.states[id]?.attributes, phase: "skipped" }).withState("button.dev-x1c_plug_3_auto_off_skip", "unavailable", {}));
    await settle(card);
    expect(find(card, "dialog .p-skip")).toBeNull();
    expect(root(card).activeElement).toBe(find(card, "dialog .dlg-actions .btn.safe"));
  });
});

describe("the switch-off's settings opened from the power dialog", () => {
  it("take the focus to their safe button, and give it back to the row that opened them", async () => {
    const hass = makeHass({ devices: waitingX1c() });
    const card = await mountCard(hass, { printer: "dev-x1c", header_chips: ["power"] });
    (find(card, ".pill.power-chip") as HTMLButtonElement).click();
    await card.updateComplete;
    const row = find(card, "dialog .p-open") as HTMLButtonElement;
    row.focus();
    keyPress(row);
    row.click();
    await settle(card);
    expect(text(find(card, "dialog h2"))).toBe("Switch off after the print");
    expect(root(card).activeElement).toBe(find(card, "dialog .dlg-actions .btn.safe"));
    (find(card, "dialog .dlg-actions .btn.safe") as HTMLButtonElement).click();
    await settle(card);
    expect(text(find(card, "dialog h2"))).toBe("Power");
    expect(root(card).activeElement).toBe(find(card, "dialog .p-open"));
  });
});

describe("the HMS dialog while the printer goes offline", () => {
  it("says the printer is offline, not that there are no messages", async () => {
    const errors = [{ code: "0700_2000_0002_0012", severity: "error", description: "AMS A Slot 2 filament has run out.", actions: ["FILAMENT_LOAD_RESUME"] }];
    const hass = makeHass({ devices: p1s({ status: "paused", stage: "paused_by_user", hms: errors as never }) });
    const card = await mountCard(hass, { printer: "dev-p1s" });
    (find(card, ".pill.hms") as HTMLButtonElement).click();
    await card.updateComplete;
    expect(text(find(card, "dialog"))).toContain("AMS A Slot 2 filament has run out.");
    // Offline: Home Assistant writes the HMS sensor unavailable, without its attributes.
    const offline = hass
      .withState("sensor.p1s_print_status", "offline", hass.states["sensor.p1s_print_status"]?.attributes)
      .withState("binary_sensor.p1s_online", "off")
      .withState("sensor.p1s_hms_errors", "unavailable", {});
    await update(card, offline);
    expect(text(find(card, "dialog"))).not.toContain("No messages");
    expect(text(find(card, "dialog"))).toContain("The printer is offline.");
  });
});

describe("a dialog's buttons on a narrow phone", () => {
  it("wrap instead of pushing the safe one out of the dialog; the drying steppers wrap below their label", () => {
    const sheet = styleText();
    expect(sheet).toMatch(/\.dlg-actions\s*\{[^}]*flex-wrap: wrap;/);
    expect(sheet).toMatch(/\.field\s*\{[^}]*flex-wrap: wrap;/);
  });
});

describe("the chips' names start with what they show", () => {
  it("HMS and power", async () => {
    const devices = x1c({ status: "idle", stage: "idle" });
    const hass = makeHass({ devices: [...devices, plugDevice({ printer: devices[0] as FakeDevice, id: 3, name: "Tasmota", state: "off" })] });
    const card = await mountCard(hass, { printer: "dev-x1c", header_chips: ["hms", "power"] });
    for (const chip of findAll(card, ".pills > button")) {
      const shown = text(chip).replace(/ /g, " ").toLowerCase();
      const name = (chip.getAttribute("aria-label") ?? "").replace(/ /g, " ").toLowerCase();
      expect(name.startsWith(shown), `"${name}" for "${shown}"`).toBe(true);
    }
  });
});

describe("the check's problems and the HMS messages on a phone", () => {
  it("are not capped in a box of their own that scrolls inside the scrolling dialog; the buttons stay in reach", () => {
    const sheet = styleText();
    expect(sheet).not.toMatch(/\.hms-list\s*\{[^}]*max-height/);
    expect(sheet).toMatch(/\.dlg-actions\s*\{[^}]*position: sticky;/);
  });
});

describe("maintenance marked in one row while another asks", () => {
  it("says the first one failed, and keeps its Done waiting while it runs", async () => {
    let fail: (error: unknown) => void = () => undefined;
    const callService = (call: ServiceCall): Promise<unknown> =>
      call.service === "mark_maintenance_done" && call.data?.["task_id"] === 11 ? new Promise((_, reject) => (fail = reject)) : Promise.resolve(undefined);
    const hass: FakeHass = makeHass({ devices: x1c({ maintenance: maintenanceSpec() }), callService });
    const card: FakeCard = await mountCard(hass, { printer: "dev-x1c", header_chips: ["maintenance"] });
    (find(card, ".pill.maintenance") as HTMLButtonElement).click();
    await card.updateComplete;
    // Clean Build Plate (11): asked, confirmed; its call runs.
    (find(card, 'dialog .maint-done[data-task="11"]') as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, "dialog .maint-confirm .btn.primary") as HTMLButtonElement).click();
    await card.updateComplete;
    // Meanwhile another row asks.
    (find(card, 'dialog .maint-done[data-task="12"]') as HTMLButtonElement).click();
    await card.updateComplete;
    expect((find(card, 'dialog .maint-done[data-task="11"]') as HTMLButtonElement).getAttribute("aria-busy")).toBe("true");
    fail(new Error("BamBuddy refused it"));
    await settle(card);
    expect(text(find(card, "dialog"))).toContain("BamBuddy refused it");
  });

  it("keeps the first one waiting when the second is confirmed too, and says how the first ended", async () => {
    let fail: (error: unknown) => void = () => undefined;
    const callService = (call: ServiceCall): Promise<unknown> =>
      call.service === "mark_maintenance_done" && call.data?.["task_id"] === 11 ? new Promise((_, reject) => (fail = reject)) : Promise.resolve(undefined);
    const hass: FakeHass = makeHass({ devices: x1c({ maintenance: maintenanceSpec() }), callService });
    const card: FakeCard = await mountCard(hass, { printer: "dev-x1c", header_chips: ["maintenance"] });
    (find(card, ".pill.maintenance") as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, 'dialog .maint-done[data-task="11"]') as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, "dialog .maint-confirm .btn.primary") as HTMLButtonElement).click();
    await card.updateComplete;
    // Another row, asked and confirmed while the first call runs.
    (find(card, 'dialog .maint-done[data-task="12"]') as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, "dialog .maint-confirm .btn.primary") as HTMLButtonElement).click();
    await settle(card);
    expect(find(card, 'dialog .maint-done[data-task="11"]')?.getAttribute("aria-busy")).toBe("true");
    fail(new Error("BamBuddy refused it"));
    await settle(card);
    expect(text(find(card, "dialog"))).toContain("BamBuddy refused it");
  });

  it("keeps another row's open question, and its focus, when an answer arrives", async () => {
    let done: (value: unknown) => void = () => undefined;
    const callService = (call: ServiceCall): Promise<unknown> =>
      call.service === "mark_maintenance_done" && call.data?.["task_id"] === 11 ? new Promise((resolve) => (done = resolve)) : Promise.resolve(undefined);
    const hass: FakeHass = makeHass({ devices: x1c({ maintenance: maintenanceSpec() }), callService });
    const card: FakeCard = await mountCard(hass, { printer: "dev-x1c", header_chips: ["maintenance"] });
    (find(card, ".pill.maintenance") as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, 'dialog .maint-done[data-task="11"]') as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, "dialog .maint-confirm .btn.primary") as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, 'dialog .maint-done[data-task="12"]') as HTMLButtonElement).click();
    await settle(card);
    expect(root(card).activeElement).toBe(find(card, "dialog .maint-confirm .btn.plain"));
    done(undefined);
    await settle(card);
    expect(find(card, "dialog .maint-confirm")).not.toBeNull();
    expect(root(card).activeElement).toBe(find(card, "dialog .maint-confirm .btn.plain"));
  });

  it("asks without an earlier Sent, which would read as marked already", async () => {
    const hass: FakeHass = makeHass({ devices: x1c({ maintenance: maintenanceSpec() }) });
    const card: FakeCard = await mountCard(hass, { printer: "dev-x1c", header_chips: ["maintenance"] });
    (find(card, ".pill.maintenance") as HTMLButtonElement).click();
    await card.updateComplete;
    (card as unknown as { sent: boolean }).sent = true;
    await card.updateComplete;
    expect(find(card, "dialog .sent")).not.toBeNull();
    (find(card, 'dialog .maint-done[data-task="11"]') as HTMLButtonElement).click();
    await settle(card);
    expect(find(card, "dialog .maint-confirm")).not.toBeNull();
    expect(find(card, "dialog .sent")).toBeNull();
  });
});

describe("the slot reset's question", () => {
  it("drops an earlier Sent", async () => {
    const hass = makeHass({ devices: x1c({ status: "idle", stage: "idle" }) });
    const card = await mountCard(hass, { printer: "dev-x1c" });
    for (const tab of findAll<HTMLButtonElement>(card, ".tabs [role=tab]")) if (text(tab) === "Filament") tab.click();
    await card.updateComplete;
    const pencil = findAll<HTMLButtonElement>(card, "button").find((item) => (item.getAttribute("aria-label") ?? "").startsWith("Edit")) as HTMLButtonElement;
    pencil.click();
    await settle(card);
    (card as unknown as { sent: boolean }).sent = true;
    await card.updateComplete;
    expect(find(card, "dialog .sent")).not.toBeNull();
    button(card, "Reset slot").click();
    await settle(card);
    expect(text(find(card, "dialog h2"))).toBe("Reset the slot?");
    expect(find(card, "dialog .sent")).toBeNull();
  });
});

describe("the radio groups of keeping warm and of the switch-off", () => {
  const leave = (card: FakeCard): boolean =>
    root(card).activeElement?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: null })) ?? false;

  it("give the stop back to the chosen option once the focus leaves the group: keeping warm", async () => {
    const card = await mountCard(makeHass({ devices: x1c({ status: "idle", stage: "idle", airduct: "cooling" }) }), { printer: "dev-x1c" });
    for (const tab of findAll<HTMLButtonElement>(card, ".tabs [role=tab]")) if (text(tab) === "Control") tab.click();
    await card.updateComplete;
    const radios = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".keep-warm [role=radio]");
    expect(radios().map((radio) => radio.tabIndex)).toEqual([0, -1]);
    radios()[0]?.focus();
    keyPress(radios()[0] as HTMLButtonElement, "ArrowRight");
    expect(radios().map((radio) => radio.tabIndex)).toEqual([-1, 0]);
    leave(card);
    expect(radios().map((radio) => radio.tabIndex)).toEqual([0, -1]);
  });

  it("the same for the switch-off's choice", async () => {
    const devices = x1c({ status: "finished", stage: "idle", nozzles: [[142, 0]] });
    const hass = makeHass({ devices: [...devices, plugDevice({ printer: devices[0] as FakeDevice, id: 3, name: "Tasmota", watts: 182, autoOff: { armed: true, phase: "waiting", since: "2026-10-18T14:05:00+00:00" } })] });
    const card = await mountCard(hass, { printer: "dev-x1c", header_chips: ["power"] });
    (find(card, ".pill.power-chip") as HTMLButtonElement).click();
    await card.updateComplete;
    (find(card, "dialog .p-open") as HTMLButtonElement).click();
    await settle(card);
    const radios = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, "dialog [role=radio]");
    const chosen = radios().findIndex((radio) => radio.getAttribute("aria-checked") === "true");
    const stops = radios().map((_, index) => (index === chosen ? 0 : -1));
    radios()[chosen]?.focus();
    keyPress(radios()[chosen] as HTMLButtonElement, "ArrowRight");
    expect(radios().map((radio) => radio.tabIndex)).not.toEqual(stops);
    leave(card);
    expect(radios().map((radio) => radio.tabIndex)).toEqual(stops);
  });
});

describe("a chip's name for one message, and the USB drive's dialog", () => {
  it("names one HMS message in the singular, in English and German", async () => {
    const one = [{ code: "0700_2000_0002_0012", severity: "warning", description: "One.", actions: [] }];
    for (const [language, name] of [["en", "1 HMS message"], ["de", "1 HMS-Meldung"]] as const) {
      const card = await mountCard(makeHass({ devices: p1s({ status: "paused", stage: "paused_by_user", hms: one as never }), language }), { printer: "dev-p1s" });
      expect(find(card, ".pill.hms")?.getAttribute("aria-label")).toBe(name);
      card.remove();
    }
  });

  it("says the USB drive is in once it is", async () => {
    const hass = makeHass({ devices: h2d({ storage: "off", storageUsb: true }) });
    const card = await mountCard(hass, { printer: "dev-h2d", header_chips: ["storage"] });
    (find(card, ".pill.storage") as HTMLButtonElement).click();
    await card.updateComplete;
    const usb = Object.keys(hass.states).find((id) => id.endsWith("_usb_drive")) as string;
    await update(card, hass.withState(usb, "on"));
    expect(text(find(card, "dialog p"))).toBe("The USB drive is in: BamBuddy can send prints again.");
  });
});

describe("a control in an open dialog that moves while it has the keyboard", () => {
  it("gets the focus back once the focus fell to the page (a task marked done sorts down the list)", async () => {
    const hass: FakeHass = makeHass({ devices: x1c({ maintenance: maintenanceSpec() }) });
    const card: FakeCard = await mountCard(hass, { printer: "dev-x1c", header_chips: ["maintenance"] });
    (find(card, ".pill.maintenance") as HTMLButtonElement).click();
    await card.updateComplete;
    const done = find(card, 'dialog .maint-done[data-task="11"]') as HTMLButtonElement;
    done.focus();
    keyPress(done);
    // A browser blurs a focused button its list moves: the focus falls to the page.
    done.blur();
    await update(card, hass.withState("sensor.x1c_bed_temperature", "31"));
    expect(root(card).activeElement).toBe(find(card, 'dialog .maint-done[data-task="11"]'));
  });

  it("leaves the focus alone where no dialog is open", async () => {
    const hass: FakeHass = makeHass({ devices: x1c() });
    const card: FakeCard = await mountCard(hass, { printer: "dev-x1c" });
    const pause = button(card, "Pause print");
    pause.focus();
    keyPress(pause);
    pause.blur();
    await update(card, hass.withState("sensor.x1c_bed_temperature", "31"));
    expect(root(card).activeElement).toBeNull();
  });
});

describe("a dialog that scrolls", () => {
  it("keeps what the keyboard reaches clear of its edge and of its button row", async () => {
    expect(styleText()).toMatch(/dialog \{[^}]*scroll-padding-block: 12px 80px;/);
    // As a browser measures: a closed <dialog> lays out nothing.
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("dlg-actions") && (this.closest("dialog") as HTMLDialogElement | null)?.open ? 116 : 0;
    });
    try {
      const hass = makeHass({ devices: x1c() });
      const card = await mountCard(hass, { printer: "dev-x1c" });
      (find(card, ".menu-btn") as HTMLButtonElement).click();
      await card.updateComplete;
      findAll<HTMLButtonElement>(card, ".menu [role=menuitem]")[1]?.click();
      await card.updateComplete;
      // A row of buttons that wrapped to two lines: the room it takes, and a gap -- from the first open on.
      expect((find(card, "dialog") as HTMLDialogElement).open).toBe(true);
      expect((find(card, "dialog") as HTMLElement).style.scrollPaddingBottom).toBe("128px");
    } finally {
      height.mockRestore();
    }
  });
});

describe("the lists and notes of a dialog that scrolls", () => {
  it("scroll with the dialog, not in a box of their own: maintenance and the objects to skip", () => {
    expect(styleText()).not.toMatch(/\.(maint-list|objects)\s*\{[^}]*max-height/);
  });

  it("show the copy's note above the sticky button row, also while the dialog scrolls", () => {
    // Sticky, as the card's own "Sent": at the end of a long dialog it would lie out of sight.
    expect(styleText()).toMatch(/\.dlg-snack \{[^}]*position: sticky;[^}]*bottom: 76px;[^}]*margin-top: -14px;[^}]*z-index: 2;/);
    // The pill a snackbar in its wrapper, not in the dialog's flow as a dialog's "Sent" is.
    expect(styleText()).toMatch(/\.dlg-body \.dlg-snack \.sent \{[^}]*position: absolute;[^}]*bottom: 10px;[^}]*transform: translateX\(-50%\);/);
  });
});

describe("the keyboard's place in the menu", () => {
  it("shows the card's ring, not only a faint tint", () => {
    expect(styleText()).toMatch(/\.menu \[role="menuitem"\]:focus-visible \{[^}]*outline: 2px solid var\(--bb-ring\);[^}]*outline-offset: -2px;/);
  });
});

describe("a temperature tile's name on a narrow card", () => {
  it("wraps at its words instead of being cut", () => {
    const rule = /\.temp-head > span:not\(\.temp-tag\) \{([^}]*)\}/.exec(styleText())?.[1] ?? "";
    expect(rule).toContain("overflow-wrap: anywhere;");
    expect(rule).not.toContain("ellipsis");
  });
});

describe("a card taken off the page with a dialog open", () => {
  it("opens no dialog while it is off the page", async () => {
    const hass = makeHass({ devices: x1c() });
    const card = await mountCard(hass, { printer: "dev-x1c" });
    (find(card, ".menu-btn") as HTMLButtonElement).click();
    await card.updateComplete;
    findAll<HTMLButtonElement>(card, ".menu [role=menuitem]")[1]?.click();
    await card.updateComplete;
    const calls: boolean[] = [];
    const original = HTMLDialogElement.prototype.showModal;
    const spy = vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
      calls.push(this.isConnected);
      original.call(this);
    });
    try {
      card.remove();
      await settle(card);
      expect(calls).toEqual([]);
      document.body.append(card);
      await settle(card);
      expect(calls).toEqual([true]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the frame rate's setting", () => {
  it("offers its gear only while the setting is there: not for one left behind, unavailable", async () => {
    const base = makeHass({ devices: x1c() });
    const number = Object.keys(base.states).find((id) => id.startsWith("number.") && id.endsWith("camera_frame_rate")) as string;
    const card = await mountCard(base, { printer: "dev-x1c", camera: "always" });
    expect(find(card, ".live-fps-open")).not.toBeNull();
    const gone = await mountCard(base.withState(number, "unavailable", { ...base.states[number]?.attributes }), { printer: "dev-x1c", camera: "always" });
    expect(find(gone, ".live-fps-open")).toBeNull();
  });
});

describe("a maintenance task named like a property of every object", () => {
  it("opens the dialog with its own name: toString is no text key", async () => {
    const task = { id: 9, name: "toString", due: false, due_soon: false, unit: "hours" as const, interval: 100, left: 40, last_done: null };
    const card = await mountCard(makeHass({ devices: x1c({ maintenance: maintenanceSpec({ tasks: [task] }) }) }), { printer: "dev-x1c", header_chips: ["maintenance"] });
    (find(card, ".pill.maintenance") as HTMLButtonElement).click();
    await settle(card);
    expect(text(find(card, "dialog"))).toContain("toString");
  });
});
