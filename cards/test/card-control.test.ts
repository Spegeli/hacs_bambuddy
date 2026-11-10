import { describe, expect, it, vi } from "vitest";

import "../src/index";
import { ICONS } from "../src/icons";
import { a1mini, IDLE_H2D, keepEntities, x1c, type FakeCard, type FakeDevice } from "./fixtures";
import { button, declarations, find, findAll, hasButton, NBSP, press, root, settle, shownText, showView, styleText, text, update } from "./helpers";
import { cardFor, confirmDialog, keyPress, previewOf, useCardPage, withX1c } from "./card-helpers";

useCardPage();

describe("the views", () => {
  it("switch with the tabs, also by the arrow keys", async () => {
    const { card } = await cardFor("x1c");
    const tabs = (): HTMLElement[] => findAll(card, "[role=tab]");
    expect(tabs().map(text)).toEqual(["Status", "Control", "Filament"]);
    expect(tabs().map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    find(card, ".tabs")?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await card.updateComplete;
    await card.updateComplete;
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Filament");
    expect(root(card).activeElement?.textContent?.trim()).toBe("Filament");
    find(card, ".tabs")?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await card.updateComplete;
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Status");
    find(card, ".tabs")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await card.updateComplete;
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Status");
    await showView(card, "Control");
    expect(find(card, ".pad")).not.toBeNull();
  });

  it("tie the view to its tab, and go to the first and the last tab with Home and End", async () => {
    const { card } = await cardFor("x1c");
    const tabs = (): HTMLElement[] => findAll(card, "[role=tab]");
    const panel = (): HTMLElement | null => find(card, ".body");
    const keyOnTabs = async (name: string): Promise<void> => {
      find(card, ".tabs")?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
      await card.updateComplete;
      await card.updateComplete;
    };
    expect(panel()?.getAttribute("role")).toBe("tabpanel");
    expect(panel()?.id).not.toBe("");
    expect(tabs().map((tab) => tab.getAttribute("aria-controls"))).toEqual([panel()?.id, panel()?.id, panel()?.id]);
    expect(new Set(tabs().map((tab) => tab.id)).size).toBe(3);
    expect(panel()?.getAttribute("aria-labelledby")).toBe(tabs()[0]?.id);
    await keyOnTabs("End");
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Filament");
    expect(root(card).activeElement).toBe(tabs()[2]);
    expect(panel()?.getAttribute("aria-labelledby")).toBe(tabs()[2]?.id);
    await keyOnTabs("Home");
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Status");
    expect(root(card).activeElement).toBe(tabs()[0]);
    // One view: no tabs, and no tab panel.
    const { card: single } = await cardFor("x1c", { config: { show_control_tab: false, show_filament_tab: false } });
    expect(find(single, ".body")?.hasAttribute("role")).toBe(false);
  });

  it("go back to the status view with a new configuration or a view that went away", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Filament");
    card.setConfig({ type: "custom:bambuddy-printer-card", printer: "dev-x1c" });
    await card.updateComplete;
    expect(text(find(card, '[role=tab][aria-selected="true"]'))).toBe("Status");
    await showView(card, "Filament");
    // The AMS unit and the external spool are gone.
    const [printer] = x1c() as [FakeDevice];
    await update(card, hass.withDevices([keepEntities(printer, (entity) => entity.key !== "external_spool")]));
    expect(find(card, ".job")).not.toBeNull();
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Control"]);
  });
});

describe("the groups of choices: speed, active nozzle, step", () => {
  /** A key pressed on the card's focused element. */
  const key = (card: FakeCard, name: string): void => {
    keyPress(root(card).activeElement as Element, name);
  };

  it("stop the tab key at the chosen option, and move the focus by the arrow keys without choosing", async () => {
    const { card, hass } = await cardFor("x1c");
    const speeds = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".speed [role=radio]");
    const focused = (): number => speeds().indexOf(root(card).activeElement as HTMLButtonElement);
    expect(speeds().map((item) => item.getAttribute("tabindex"))).toEqual(["-1", "0", "-1", "-1"]);
    speeds()[1]?.focus();
    const moves: [string, number][] = [
      ["ArrowRight", 2],
      ["ArrowDown", 3],
      ["ArrowRight", 0],
      ["ArrowLeft", 3],
      ["ArrowUp", 2],
      ["Home", 0],
      ["End", 3],
      ["a", 3],
    ];
    for (const [name, index] of moves) {
      key(card, name);
      expect(focused(), name).toBe(index);
    }
    // Moving chooses nothing: a choice sends a command.
    expect(hass.calls).toEqual([]);
    expect(speeds().map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "true", "false", "false"]);
    // Space or Enter -- a click -- chooses.
    key(card, "ArrowLeft");
    speeds()[2]?.click();
    await settle(card);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "select.x1c_print_speed", option: "sport" });
  });

  it("move the tab key's stop with the focus, and give it back to the chosen option once the focus leaves the group", async () => {
    const { card } = await cardFor("x1c");
    const speeds = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".speed [role=radio]");
    const stops = (): (string | null)[] => speeds().map((item) => item.getAttribute("tabindex"));
    speeds()[1]?.focus();
    key(card, "ArrowLeft");
    // Tab leaves the group from where the focus is: that is the only stop.
    expect(stops()).toEqual(["0", "-1", "-1", "-1"]);
    // Within the group the stop stays where the focus went.
    speeds()[0]?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: speeds()[3] ?? null }));
    expect(stops()).toEqual(["0", "-1", "-1", "-1"]);
    // Out of the group: back on the chosen option, where Tab comes in again.
    speeds()[0]?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: null }));
    expect(stops()).toEqual(["-1", "0", "-1", "-1"]);
  });

  it("work alike for the active nozzle and the step; the first option is the stop where none is chosen", async () => {
    const { card, hass } = await cardFor("h2d", { printer: IDLE_H2D });
    await showView(card, "Control");
    const sides = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".nozzle-row [role=radio]");
    const steps = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".step-row [role=radio]");
    expect(sides().map((item) => item.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    // 1 mm, the first step, is the chosen one.
    expect(steps().map((item) => item.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    sides()[0]?.focus();
    key(card, "ArrowRight");
    expect(root(card).activeElement).toBe(sides()[1]);
    steps()[0]?.focus();
    key(card, "End");
    await card.updateComplete;
    expect(root(card).activeElement).toBe(steps()[2]);
    expect(steps().map((item) => item.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(steps().map((item) => item.getAttribute("tabindex"))).toEqual(["-1", "-1", "0"]);
    steps()[2]?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true, relatedTarget: null }));
    expect(steps().map((item) => item.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(hass.calls).toEqual([]);
    await update(card, hass.withState("select.h2d_active_nozzle", "standby", { options: ["left", "right"] }));
    expect(sides().map((item) => item.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    await update(card, hass.withState("select.h2d_active_nozzle", "right", { options: ["left", "right"] }));
    expect(sides().map((item) => item.getAttribute("tabindex"))).toEqual(["-1", "0"]);
  });
});

describe("the control view", () => {
  it("says how to move safely, in words a beginner knows", async () => {
    const { card } = await cardFor("a1mini", { config: { start_view: "control" } });
    expect(text(find(card, ".control + .hint, .hint:last-child"))).toBe(
      "Tap the house first so the printer knows where it is. When you move it with the arrows, it does not stop at the edges of its build space: a large step can hit the end. Near an edge, choose a small step.",
    );
    const { card: german } = await cardFor("a1mini", { config: { start_view: "control" }, language: "de" });
    expect(findAll(german, ".hint").map(text)).toContain(
      "Tippe zuerst auf das Haus, damit der Drucker seine Position kennt. Beim Bewegen mit den Pfeilen stoppt er nicht am Rand des Bauraums: Ein großer Schritt kann anschlagen. Wähle in der Nähe des Rands einen kleinen Schritt.",
    );
  });

  it("names Z by what moves: the nozzle on the A series, the bed elsewhere", async () => {
    const column = (card: FakeCard): [string, string | null | undefined][] =>
      findAll(card, ".axis-col.bed .btn").map((item) => [item.getAttribute("aria-label") ?? "", item.querySelector(".icon path")?.getAttribute("d")]);
    const { card: a1 } = await cardFor("a1mini");
    await showView(a1, "Control");
    expect(text(find(a1, ".axis-col.bed .axis-label"))).toBe("Nozzle height");
    // Up on top: the nozzle rises away from the bed.
    expect(column(a1)).toEqual([
      ["Move the nozzle 1 mm away from the bed", ICONS.up],
      ["Move the nozzle 1 mm closer to the bed", ICONS.down],
    ]);
    const { card: x1 } = await cardFor("x1c", { printer: { status: "idle", stage: "idle", progress: 0 } });
    await showView(x1, "Control");
    expect(text(find(x1, ".axis-col.bed .axis-label"))).toBe("Bed");
    expect(column(x1)).toEqual([
      ["Move the bed 1 mm closer to the nozzle", ICONS.up],
      ["Move the bed 1 mm away from the nozzle", ICONS.down],
    ]);
  });

  it("moves the axes by 1 mm unless 10 or 50 mm is chosen", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    // As BamBuddy's own: 50 mm to get the head or the bed out of the way.
    expect(findAll(card, ".step-row [role=radio]").map((item) => `${text(item)}: ${item.getAttribute("aria-checked")}`)).toEqual([
      "1 mm: true",
      "10 mm: false",
      "50 mm: false",
    ]);
    const moves: [string, Record<string, unknown>][] = [
      ["Move Y by +1 mm", { axis: "y", distance: 1 }],
      ["Move X by −1 mm", { axis: "x", distance: -1 }],
      ["Move X by +1 mm", { axis: "x", distance: 1 }],
      ["Move Y by −1 mm", { axis: "y", distance: -1 }],
      ["Move the nozzle 1 mm closer to the bed", { axis: "z", distance: -1 }],
      ["Move the nozzle 1 mm away from the bed", { axis: "z", distance: 1 }],
    ];
    for (const [name, data] of moves) {
      await press(card, name);
      expect(hass.calls.at(-1), name).toEqual({ domain: "bambuddy", service: "move_axis", data: { device_id: "dev-a1mini", ...data }, notifyOnError: false });
    }
    await press(card, "50 mm");
    await press(card, "Move the nozzle 50 mm away from the bed");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", axis: "z", distance: 50 });
    await press(card, "Move Y by +50 mm");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", axis: "y", distance: 50 });
    await press(card, "10 mm");
    expect(findAll(card, ".step-row [role=radio]").map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    await press(card, "Move X by +10 mm");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", axis: "x", distance: 10 });
    await press(card, "Move the nozzle 10 mm closer to the bed");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", axis: "z", distance: -10 });
  });

  it("locks the step choice while a print runs or is paused, not the camera", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await press(card, "50 mm");
    const steps = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".step-row [role=radio]");
    expect(steps().map((item) => item.disabled)).toEqual([false, false, false]);
    for (const status of ["printing", "paused"]) {
      await update(card, hass.withState("sensor.a1_mini_print_status", status));
      expect(steps().map((item) => item.disabled), status).toEqual([true, true, true]);
      // The chosen step stays marked.
      expect(steps().map((item) => item.getAttribute("aria-checked")), status).toEqual(["false", "false", "true"]);
      const camera = find<HTMLButtonElement>(card, ".btn.live-btn");
      expect(camera, status).not.toBeNull();
      expect(camera?.disabled, status).toBe(false);
    }
    await update(card, hass.withState("sensor.a1_mini_print_status", "idle"));
    expect(steps().map((item) => item.disabled)).toEqual([false, false, false]);
    // Drawn as the arrows are while locked.
    expect(declarations(".step-row .seg button:disabled", styleText())).toContain("opacity: 0.4");
    // It applies again afterwards.
    await press(card, "Move X by +50 mm");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", axis: "x", distance: 50 });
  });

  it("keeps the step chosen as the tab stop after a lock the focus left", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await press(card, "50 mm");
    const steps = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".step-row [role=radio]");
    steps()[2]?.focus();
    await update(card, hass.withState("sensor.a1_mini_print_status", "printing"));
    // The focus leaves the locked group, then the print ends.
    find(card, ".step-row .seg")?.dispatchEvent(new FocusEvent("focusout", { relatedTarget: null }));
    await update(card, hass.withState("sensor.a1_mini_print_status", "idle"));
    expect(steps().map((item) => item.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("asks before it homes the axes", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    expect(button(card, "Home all axes").classList.contains("primary")).toBe(true);
    await press(card, "Home all axes");
    expect(text(find(card, "dialog h2"))).toBe("Home all axes?");
    expect(text(find(card, "dialog p"))).toBe("The toolhead moves to its home position; remove anything from the plate first.");
    expect(findAll(card, "dialog .dlg-actions .btn").map(text)).toEqual(["Cancel", "Home"]);
    expect(find(card, "dialog .btn.danger")).toBeNull();
    await confirmDialog(card);
    expect(hass.calls).toEqual([{ domain: "bambuddy", service: "home_axes", data: { device_id: "dev-a1mini" }, notifyOnError: false }]);
  });

  it("extrudes and retracts 10 mm only with a hot nozzle", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    expect(button(card, "Extrude 10 mm of filament").disabled).toBe(true);
    expect(text(find(card, ".note"))).toBe(`To extrude, heat the nozzle to at least 170${NBSP}°C under Heating.`);
    await update(card, hass.withState("sensor.a1_mini_nozzle_temperature", "215"));
    expect(find(card, ".note")).toBeNull();
    await press(card, "Extrude 10 mm of filament");
    expect(hass.calls.at(-1)?.data).toEqual({ device_id: "dev-a1mini", distance: 10 });
    await press(card, "Retract 10 mm of filament");
    expect(hass.calls.at(-1)).toMatchObject({ service: "extrude", data: { device_id: "dev-a1mini", distance: -10 } });
    // Without a temperature the integration decides.
    await update(card, hass.withState("sensor.a1_mini_nozzle_temperature", "unknown"));
    expect(button(card, "Extrude 10 mm of filament").disabled).toBe(false);
  });

  it("waits while a print is on the printer", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Control");
    expect(text(find(card, ".note.warning"))).toBe("Moving and extruding are possible once the print is done.");
    // Below the heaters and the detections, which stay: the note is about what moves.
    expect(find(card, ".heating")?.nextElementSibling?.classList.contains("detection")).toBe(true);
    expect(find(card, ".detection")?.nextElementSibling?.classList.contains("note")).toBe(true);
    const moving = findAll<HTMLButtonElement>(card, ".pad button, .axis-col button");
    expect(moving.length).toBe(9);
    expect(moving.every((item) => item.disabled)).toBe(true);
    // Home looks as disabled as the arrows: no filled, primary look.
    expect(button(card, "Home all axes").classList.contains("primary")).toBe(false);
    // A hot nozzle changes nothing: the reason stays the print.
    expect(findAll(card, ".note")).toHaveLength(1);
    expect(hass.calls).toEqual([]);
  });

  it("says the printer is offline as the status tab does; the preview shows it as an example, not to be tapped", async () => {
    const { card } = await cardFor("offline");
    await showView(card, "Control");
    expect(find(card, ".pad")).toBeNull();
    expect(find(card, ".heating")).toBeNull();
    expect(text(find(card, ".job .job-info"))).toBe("The printer is offline. Check that it is turned on and connected to BamBuddy.");
    // With the picture, as the Status tab's offline view.
    expect(find(card, ".job .picture")).not.toBeNull();
    const preview = await previewOf("offline", { start_view: "control" });
    expect(find(preview, ".sample-body[inert] .pad")).not.toBeNull();
  });

  it("is not there while the printer has no control entities", async () => {
    const { card } = await cardFor("readOnly");
    expect(findAll(card, "[role=tab]").map(text)).toEqual(["Status", "Filament"]);
    await expect(showView(card, "Control")).rejects.toThrowError(/no tab "Control"/);
    expect(find(card, ".note")).toBeNull();
    expect(find(card, ".pad")).toBeNull();
  });
});

describe("the fans", () => {
  it("leave out a fan Home Assistant only restored: the integration no longer creates it", async () => {
    const { card, hass } = await withX1c({}, { status_blocks: ["fans"] });
    const before = findAll(card, ".fans .fan").length;
    const fan = Object.keys(hass.states).find((entityId) => entityId.startsWith("fan.") && entityId.includes("chamber")) as string;
    await update(card, hass.withState(fan, "unavailable", { restored: true, friendly_name: "Chamber fan" }));
    expect(findAll(card, ".fans .fan")).toHaveLength(before - 1);
  });
});

describe("the heating section", () => {
  it("is no button of its own: each heater has its power symbol", async () => {
    const { card } = await cardFor("x1c", { config: { start_view: "control" }, printer: { status: "idle", stage: "idle" } });
    expect(hasButton(card, "Heating off")).toBe(false);
    expect(find(card, ".heat-head .btn")).toBeNull();
    expect(findAll(card, ".heat-row .heat-off").every((item) => item.querySelector("path")?.getAttribute("d") === ICONS.power)).toBe(true);
    const { card: german } = await cardFor("x1c", { config: { start_view: "control" }, language: "de", printer: { status: "idle", stage: "idle" } });
    expect(hasButton(german, "Heizen aus")).toBe(false);
  });

  it("marks the row of a heater that is on, from the tap on", async () => {
    vi.useFakeTimers();
    const { card } = await withX1c({ status: "idle", stage: "idle", progress: 0, nozzles: [[30, 0]], bed: [31, 40] });
    await showView(card, "Control");
    expect(findAll(card, ".heat-name.on .heat-text").map(text)).toEqual(["Bed"]);
    // With the target it shows, before the printer reports it.
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
    expect(findAll(card, ".heat-name.on .heat-text").map(text)).toEqual(["Nozzle", "Bed"]);
  });

  /** A tap while every timer is fake: the card's own updates still run. */
  async function tap(card: FakeCard, name: string): Promise<void> {
    button(card, name).click();
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
  }
  const targets = (card: FakeCard): string[] => findAll(card, ".heat-target").map(shownText);
  const setValue = (entityId: string, value: number) => ({ domain: "number", service: "set_value", data: { entity_id: entityId, value }, notifyOnError: false });
  const NOZZLE = "number.a1_mini_nozzle_target_temperature";

  it("keeps the keyboard in the section when a press disables its own button", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await update(card, hass.withState(NOZZLE, "5"));
    button(card, `Nozzle 5${NBSP}°C cooler`).focus();
    keyPress(button(card, `Nozzle 5${NBSP}°C cooler`));
    await tap(card, `Nozzle 5${NBSP}°C cooler`);
    expect(root(card).activeElement).toBe(button(card, `Nozzle: heat to 220${NBSP}°C`));

    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
    button(card, "Nozzle: turn off").focus();
    keyPress(button(card, "Nozzle: turn off"));
    await tap(card, "Nozzle: turn off");
    // The power symbol stays usable: it heats now, and keeps the focus.
    const power = root(card).activeElement;
    expect([power?.classList.contains("heat-off"), power?.getAttribute("aria-label")]).toEqual([true, `Nozzle: heat to 220${NBSP}°C`]);
  });

  it("takes no focus back once it went elsewhere, nor a mouse's", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await update(card, hass.withState(NOZZLE, "5"));
    // The keyboard was on "-", then moved on to a field elsewhere on the page.
    button(card, `Nozzle 5${NBSP}°C cooler`).focus();
    keyPress(button(card, `Nozzle 5${NBSP}°C cooler`));
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    await update(card, hass.withState(NOZZLE, "0"));
    expect(document.activeElement).toBe(field);
    // A mouse: no key in the card.
    const { card: mouse, hass: other } = await cardFor("a1mini");
    await showView(mouse, "Control");
    await update(mouse, other.withState(NOZZLE, "5"));
    vi.advanceTimersByTime(20_000);
    button(mouse, `Nozzle 5${NBSP}°C cooler`).focus();
    await update(mouse, other.withState(NOZZLE, "0"));
    expect(root(mouse).activeElement).not.toBe(button(mouse, `Nozzle: heat to 220${NBSP}°C`));
  });

  it("keeps the keyboard's place inside Home Assistant's shadow roots too", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    // In a dashboard the page's focus is the outermost host, not the card.
    const host = document.createElement("div");
    document.body.append(host);
    host.attachShadow({ mode: "open" }).append(card);
    await showView(card, "Control");
    await update(card, hass.withState(NOZZLE, "5"));
    button(card, `Nozzle 5${NBSP}°C cooler`).focus();
    keyPress(button(card, `Nozzle 5${NBSP}°C cooler`));
    await tap(card, `Nozzle 5${NBSP}°C cooler`);
    expect(root(card).activeElement).toBe(button(card, `Nozzle: heat to 220${NBSP}°C`));
  });

  it("leaves the focus where the keyboard moved it on inside the card", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await update(card, hass.withState(NOZZLE, "5"));
    button(card, `Nozzle 5${NBSP}°C cooler`).focus();
    keyPress(button(card, `Nozzle 5${NBSP}°C cooler`));
    const status = button(card, "Status");
    status.focus();
    await update(card, hass.withState(NOZZLE, "0"));
    expect(root(card).activeElement).toBe(status);
  });

  it("keeps no place for a card taken off the page", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await update(card, hass.withState(NOZZLE, "5"));
    button(card, `Nozzle 5${NBSP}°C cooler`).focus();
    keyPress(button(card, `Nozzle 5${NBSP}°C cooler`));
    card.remove();
    // A late redraw of the removed card (a toast's timer) must not reach into a page it left.
    const focused = vi.spyOn(HTMLElement.prototype, "focus");
    await update(card, hass.withState(NOZZLE, "0"));
    expect(focused).not.toHaveBeenCalled();
  });

  it("preheats with one tap and sends a few taps as one target", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    expect(findAll(card, ".heat-row").map((row) => text(row.querySelector(".heat-label")))).toEqual(["Nozzle", "Bed"]);
    expect(targets(card)).toEqual(["Off", "Off"]);
    expect(findAll(card, ".heat-now").map(text)).toEqual([`Now 27${NBSP}°C`, `Now 25${NBSP}°C`]);
    // Nothing switches every heater off at once: each has its own power symbol.
    expect(hasButton(card, "Heating off")).toBe(false);
    // Off, their power symbols switch them on, as + does.
    expect(findAll<HTMLButtonElement>(card, ".heat-row .heat-off").map((item) => [item.getAttribute("aria-label"), item.disabled])).toEqual([
      [`Nozzle: heat to 220${NBSP}°C`, false],
      [`Bed: heat to 55${NBSP}°C`, false],
    ]);
    expect(button(card, `Nozzle 5${NBSP}°C cooler`).disabled).toBe(true);
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
    expect(targets(card)).toEqual([`220${NBSP}°C`, "Off"]);
    expect(hass.calls).toEqual([]);
    await tap(card, `Nozzle 5${NBSP}°C hotter`);
    await tap(card, `Nozzle 5${NBSP}°C hotter`);
    expect(targets(card)[0]).toBe(`230${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(799);
    expect(hass.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(hass.calls).toEqual([setValue(NOZZLE, 230)]);
    // Shown until the entity reports a new target.
    await update(card, hass.withState("sensor.a1_mini_nozzle_temperature", "40"));
    expect(targets(card)[0]).toBe(`230${NBSP}°C`);
    const reported = hass.withState(NOZZLE, "230");
    await update(card, reported);
    expect(targets(card)[0]).toBe(`230${NBSP}°C`);
    await update(card, reported.withState(NOZZLE, "200"));
    expect(targets(card)[0]).toBe(`200${NBSP}°C`);
  });

  it("starts the nozzle in the middle of the active filament's range", async () => {
    const { card, hass } = await cardFor("a1mini");
    await update(card, hass.withState("sensor.a1_mini_active_filament", "PLA Basic", { nozzle_temp_min: 190, nozzle_temp_max: 230 }));
    await showView(card, "Control");
    expect(hasButton(card, `Nozzle: heat to 210${NBSP}°C`)).toBe(true);
    await update(card, hass.withState("sensor.a1_mini_active_filament", "PLA Basic", { nozzle_temp_min: 230, nozzle_temp_max: 190 }));
    expect(hasButton(card, `Nozzle: heat to 220${NBSP}°C`)).toBe(true);
    // Never above what the number allows.
    await update(card, hass.withState(NOZZLE, "0", { max: 200 }));
    expect(hasButton(card, `Nozzle: heat to 200${NBSP}°C`)).toBe(true);
  });

  it("takes a filament's range only when it is a real one: both ends numbers, the top not below the bottom, the bottom above zero", async () => {
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    const start = async (attributes: Record<string, unknown>): Promise<boolean[]> => {
      await update(card, hass.withState("sensor.a1_mini_active_filament", "PLA Basic", attributes));
      return [hasButton(card, `Nozzle: heat to 220${NBSP}°C`), hasButton(card, `Nozzle: heat to 200${NBSP}°C`)];
    };
    // A range of one temperature is a range.
    expect(await start({ nozzle_temp_min: 200, nozzle_temp_max: 200 })).toEqual([false, true]);
    // Without a bottom above zero, or an end that is no number, the card does not guess.
    expect(await start({ nozzle_temp_min: 0, nozzle_temp_max: 400 })).toEqual([true, false]);
    expect(await start({ nozzle_temp_max: 300 })).toEqual([true, false]);
    expect(await start({ nozzle_temp_min: 100 })).toEqual([true, false]);
    expect(await start({ nozzle_temp_min: "100", nozzle_temp_max: 300 })).toEqual([true, false]);
    expect(await start({ nozzle_temp_min: 100, nozzle_temp_max: "300" })).toEqual([true, false]);
    expect(await start({ nozzle_temp_min: 100, nozzle_temp_max: 300 })).toEqual([false, true]);
  });

  it("stops at the number's highest target and turns a heater off below 5 °C", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("h2d", { printer: IDLE_H2D });
    await showView(card, "Control");
    expect(findAll(card, ".heat-row").map((row) => text(row.querySelector(".heat-label .heat-text")))).toEqual(["Left nozzle", "Right nozzle", "Bed", "Chamber"]);
    expect(targets(card)).toEqual([`250${NBSP}°C`, "Off", `90${NBSP}°C`, `45${NBSP}°C`]);
    await update(card, hass.withState("number.h2d_left_nozzle_target_temperature", "255", { max: 255 }).withState("number.h2d_bed_target_temperature", "5"));
    expect(button(card, `Left nozzle 5${NBSP}°C hotter`).disabled).toBe(true);
    await tap(card, `Bed 5${NBSP}°C cooler`);
    expect(targets(card)[2]).toBe("Off");
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls.at(-1)).toEqual(setValue("number.h2d_bed_target_temperature", 0));
  });

  it("turns a heater off only without a print", async () => {
    const { card, hass } = await withX1c({ status: "idle", nozzles: [[200, 220]], bed: [50, 55] });
    await showView(card, "Control");
    await press(card, "Nozzle: turn off");
    expect(hass.calls).toEqual([setValue("number.x1c_nozzle_target_temperature", 0)]);
    expect(targets(card)).toEqual(["Off", `55${NBSP}°C`]);
    // While printing: the steppers stay, an off would end the print.
    const { card: printing } = await cardFor("x1c");
    await showView(printing, "Control");
    expect(findAll(printing, ".heat-off")).toHaveLength(0);
    expect(button(printing, `Nozzle 5${NBSP}°C hotter`).disabled).toBe(false);
  });

  it("offers Off for the chamber during a print: turning it off ends none", async () => {
    const { card } = await cardFor("h2d", { config: { start_view: "control" } });
    const offs = findAll<HTMLButtonElement>(card, ".heat-off");
    expect(offs.map((item) => item.getAttribute("aria-label"))).toEqual(["Chamber: turn off"]);
    expect(offs[0]?.disabled).toBe(false);
    expect(hasButton(card, "Heating off")).toBe(false);
  });

  it("shows unknown values in the offline preview's example, and is left out without targets", async () => {
    const card = await previewOf("offline", { start_view: "control" });
    expect(find(card, ".sample-body[inert] .heating")).not.toBeNull();
    expect(findAll(card, ".heat-now").map(text)).toEqual(["—", "—"]);
    expect(targets(card)).toEqual(["—", "—"]);
    const [printer] = a1mini() as [FakeDevice];
    const bare = keepEntities(printer, (entity) => !entity.entityId.startsWith("number."));
    const { card: noTargets } = await cardFor("a1mini", { devices: [bare] });
    await showView(noTargets, "Control");
    expect(find(noTargets, ".heating")).toBeNull();
  });

  it("forgets a target that fails, and says why", async () => {
    vi.useFakeTimers();
    const { card } = await cardFor("a1mini", { callService: async () => Promise.reject({ message: "Printer offline" }) });
    await showView(card, "Control");
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(800);
    await card.updateComplete;
    expect(text(find(card, ".toast"))).toBe("Printer offline");
    // Its × says what it closes.
    expect(find(card, ".toast .icon-btn")?.getAttribute("aria-label")).toBe("Dismiss the error");
    expect(targets(card)[0]).toBe("Off");
  });

  it("keeps the taps made while a target that fails was on its way", async () => {
    vi.useFakeTimers();
    let fail: (reason: unknown) => void = () => undefined;
    let first = true;
    const { card, hass } = await cardFor("a1mini", { callService: () => {
        if (!first) return Promise.resolve();
        first = false;
        return new Promise<void>((_resolve, reject) => (fail = reject));
      } });
    await showView(card, "Control");
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(800);
    await tap(card, `Nozzle 5${NBSP}°C hotter`);
    fail({ message: "Printer offline" });
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
    expect(targets(card)[0]).toBe(`225${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls.map((call) => call.data?.["value"])).toEqual([220, 225]);
  });

  it("shows a sent target at most 10 s while the entity keeps the old one", async () => {
    vi.useFakeTimers();
    const { card } = await cardFor("a1mini");
    await showView(card, "Control");
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(800 + 9_999);
    await card.updateComplete;
    expect(targets(card)[0]).toBe(`220${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(1);
    await card.updateComplete;
    expect(targets(card)[0]).toBe("Off");
  });

  it("sends a target still being tapped when the card goes", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("a1mini");
    await showView(card, "Control");
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
    card.remove();
    await vi.advanceTimersByTimeAsync(0);
    expect(hass.calls).toEqual([setValue(NOZZLE, 220)]);
  });

  it("sends a heater's next target after its previous one went through", async () => {
    vi.useFakeTimers();
    let finish: () => void = () => undefined;
    const { card, hass } = await cardFor("a1mini", { callService: () => new Promise<void>((resolve) => (finish = resolve)) });
    await showView(card, "Control");
    await tap(card, `Nozzle: heat to 220${NBSP}°C`);
    await vi.advanceTimersByTimeAsync(800);
    await tap(card, `Nozzle 5${NBSP}°C hotter`);
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls.map((call) => call.data?.["value"])).toEqual([220]);
    finish();
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls.map((call) => call.data?.["value"])).toEqual([220, 225]);
  });

  it("says it in German", async () => {
    const { card } = await cardFor("a1mini", { language: "de" });
    await showView(card, "Steuerung");
    expect(text(find(card, ".section-label"))).toBe("Heizen");
    expect(hasButton(card, "Heizen aus")).toBe(false);
    expect(hasButton(card, `Düse auf 220${NBSP}°C heizen`)).toBe(true);
    // Off, the power symbols heat, as + does.
    expect(findAll(card, ".heat-row .heat-off").map((item) => item.getAttribute("aria-label"))).toEqual([`Düse auf 220${NBSP}°C heizen`, `Bett auf 55${NBSP}°C heizen`]);
    expect(findAll(card, ".heat-now").map(text)).toEqual([`Jetzt 27${NBSP}°C`, `Jetzt 25${NBSP}°C`]);
  });
});

describe("the print options", () => {
  const toggles = (card: FakeCard): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".detection [role=switch]");
  /** A switch's name: its label, the row's text beside it. */
  const name = (item: HTMLElement): string => item.getAttribute("aria-label") ?? "";
  const states = (card: FakeCard): string[] => toggles(card).map((item) => `${name(item)}: ${item.getAttribute("aria-checked")}`);
  const toggle = (card: FakeCard, label: string): HTMLButtonElement => toggles(card).find((item) => name(item) === label) as HTMLButtonElement;
  const PLATE = "switch.x1c_build_plate_position_detection";
  /** Folded at first: the head opens them. */
  const head = (card: FakeCard): HTMLButtonElement => find<HTMLButtonElement>(card, ".det-head") as HTMLButtonElement;
  const unfold = async (card: FakeCard): Promise<void> => {
    if (head(card)?.getAttribute("aria-expanded") !== "true") head(card)?.click();
    await card.updateComplete;
  };

  it("names the sensitivity only where a detection has one", async () => {
    // The A series: the build plate's position alone, on or off.
    const { card } = await cardFor("a1mini");
    await showView(card, "Control");
    await unfold(card);
    expect(text(find(card, ".detection .hint"))).toBe(
      "On: the printer pauses the print when the detection triggers. A detection turned off stays off for later prints too.",
    );
    const { card: german } = await cardFor("a1mini", { language: "de" });
    await showView(german, "Steuerung");
    await unfold(german);
    expect(text(find(german, ".detection .hint"))).toBe(
      "An: Der Drucker pausiert den Druck, wenn die Erkennung anschlägt. Eine ausgeschaltete Erkennung bleibt aus, auch bei den nächsten Drucken.",
    );
    // The first layer's inspection has none either.
    const { card: plain } = await cardFor("x1c", { printer: { detectors: [{ key: "first_layer_inspection", on: true }, { key: "build_plate_position_detection", on: true }] } });
    await showView(plain, "Control");
    await unfold(plain);
    expect(text(find(plain, ".detection .hint"))).not.toContain("Sensitivity");
  });

  it("lists the printer's detections and switches them during a print", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Control");
    await unfold(card);
    expect(text(find(card, ".detection .section-label"))).toBe("Print options");
    // Right after the heaters.
    expect(find(card, ".heating")?.nextElementSibling?.classList.contains("detection")).toBe(true);
    expect(states(card)).toEqual(["AI print monitoring: true", "First layer inspection: true", "Build plate position detection: false"]);
    expect(toggles(card).every((item) => !item.disabled)).toBe(true);
    expect(text(find(card, ".detection .hint"))).toBe(
      "On: the printer pauses the print when the detection triggers. Sensitivity as set on the printer. A detection turned off stays off for later prints too.",
    );
    // Only the switch taps: the row is a line to read with its name beside it.
    const row = toggle(card, "Build plate position detection").closest(".det-row") as HTMLElement;
    expect(row.tagName).toBe("DIV");
    expect(text(row.querySelector(".det-name"))).toBe("Build plate position detection");
    row.click();
    (row.querySelector(".det-name") as HTMLElement).click();
    await settle(card);
    expect(hass.calls).toHaveLength(0);
    // The X1's monitoring says what it watches for.
    const monitoring = toggle(card, "AI print monitoring");
    const sub = monitoring.closest(".det-row")?.querySelector(".det-sub");
    expect(text(sub)).toBe("Spaghetti and purge chute pile-ups");
    expect(monitoring.getAttribute("aria-describedby")).toBe(sub?.id);
    expect(findAll(card, ".detection .det-sub")).toHaveLength(1);
    await press(card, "Build plate position detection");
    expect(hass.calls.at(-1)).toEqual({ domain: "switch", service: "turn_on", data: { entity_id: PLATE }, notifyOnError: false });
    expect(toggle(card, "Build plate position detection").getAttribute("aria-checked")).toBe("true");
    expect(text(find(card, ".sent"))).toBe("Sent");
    await press(card, "AI print monitoring");
    expect(hass.calls.at(-1)).toEqual({ domain: "switch", service: "turn_off", data: { entity_id: "switch.x1c_ai_monitoring" }, notifyOnError: false });
    expect(toggle(card, "AI print monitoring").getAttribute("aria-checked")).toBe("false");
  });

  it("is folded at first and says how many are on", async () => {
    const { card } = await cardFor("x1c");
    await showView(card, "Control");
    expect(head(card).getAttribute("aria-expanded")).toBe("false");
    // Folded, nothing to point at.
    expect(head(card).hasAttribute("aria-controls")).toBe(false);
    // Said by the exception: what is off.
    expect(text(head(card))).toBe("Print options 1 off");
    // One is off: said, not warned -- switching one off is a choice.
    expect(find(card, ".det-summary")?.classList.contains("warn")).toBe(false);
    expect(toggles(card)).toHaveLength(0);
    expect(find(card, ".detection .hint")).toBeNull();
    head(card).click();
    await card.updateComplete;
    expect(head(card).getAttribute("aria-expanded")).toBe("true");
    expect(head(card).getAttribute("aria-controls")).toBe(find(card, ".det-body")?.id);
    expect(toggles(card)).toHaveLength(3);
    // Open while the card lives, also in another view and back.
    await showView(card, "Status");
    await showView(card, "Control");
    expect(toggles(card)).toHaveLength(3);
    head(card).click();
    await card.updateComplete;
    expect(toggles(card)).toHaveLength(0);
    // All on: a plain count.
    const { card: all } = await withX1c({ detectors: [{ key: "ai_monitoring", on: true }, { key: "first_layer_inspection", on: true }] });
    await showView(all, "Control");
    expect(text(find(all, ".det-summary"))).toBe("All on");
    expect(find(all, ".det-summary")?.classList.contains("warn")).toBe(false);
    const { card: none } = await withX1c({ detectors: [{ key: "ai_monitoring", on: false }, { key: "first_layer_inspection", on: false }] });
    await showView(none, "Control");
    expect(text(find(none, ".det-summary"))).toBe("All off");
    expect(find(none, ".det-summary")?.classList.contains("warn")).toBe(false);
    const { card: german } = await cardFor("x1c", { language: "de" });
    await showView(german, "Steuerung");
    expect(text(head(german))).toBe("Druckoptionen 1 aus");
    const { card: germanAll } = await cardFor("x1c", { language: "de", printer: { detectors: [{ key: "ai_monitoring", on: true }] } });
    await showView(germanAll, "Steuerung");
    // One detection: its own state.
    expect(text(find(germanAll, ".det-summary"))).toBe("An");
    const { card: germanNone } = await cardFor("x1c", { language: "de", printer: { detectors: [{ key: "ai_monitoring", on: false }] } });
    await showView(germanNone, "Steuerung");
    expect(text(find(germanNone, ".det-summary"))).toBe("Aus");
  });

  it("counts only the switches with a state", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Control");
    await update(card, hass.withState(PLATE, "unknown"));
    expect(text(find(card, ".det-summary"))).toBe("All on");
    // None with a state: the head without a summary.
    const { card: none, hass: noneHass } = await withX1c({ detectors: [{ key: "ai_monitoring", on: true }] });
    await showView(none, "Control");
    await update(none, noneHass.withState("switch.x1c_ai_monitoring", "unavailable"));
    expect(find(none, ".det-head")).not.toBeNull();
    expect(find(none, ".det-summary")).toBeNull();
  });

  it("shows a new state at once until the switch reports it", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Control");
    await unfold(card);
    toggle(card, "Build plate position detection").click();
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
    const plate = (): string | null => toggle(card, "Build plate position detection").getAttribute("aria-checked");
    expect(plate()).toBe("true");
    // Another entity changed: the switch still says off.
    await update(card, hass.withState("sensor.x1c_progress", "63"));
    expect(plate()).toBe("true");
    const reported = hass.withState(PLATE, "on");
    await update(card, reported);
    expect(plate()).toBe("true");
    // From now on the switch's own state.
    await update(card, reported.withState(PLATE, "off"));
    expect(plate()).toBe("false");
    // A switch that never reports goes back to its state after 10 s.
    toggle(card, "Build plate position detection").click();
    await vi.advanceTimersByTimeAsync(9_999);
    await card.updateComplete;
    expect(plate()).toBe("true");
    await vi.advanceTimersByTimeAsync(1);
    await card.updateComplete;
    expect(plate()).toBe("false");
  });

  it("goes back at once when the command fails, and says why", async () => {
    const { card } = await cardFor("x1c", { callService: async () => Promise.reject({ message: "Printer offline" }) });
    await showView(card, "Control");
    await unfold(card);
    await press(card, "Build plate position detection");
    expect(toggle(card, "Build plate position detection").getAttribute("aria-checked")).toBe("false");
    expect(text(find(card, ".toast"))).toBe("Printer offline");
  });

  it("is sent once while it is on its way", async () => {
    let finish: () => void = () => undefined;
    const { card, hass } = await cardFor("x1c", { callService: () => new Promise<void>((resolve) => (finish = resolve)) });
    await showView(card, "Control");
    await unfold(card);
    await press(card, "Build plate position detection");
    // Marked, not disabled: the keyboard keeps its place.
    expect(toggle(card, "Build plate position detection").disabled).toBe(false);
    expect(toggle(card, "Build plate position detection").getAttribute("aria-disabled")).toBe("true");
    expect(toggle(card, "Build plate position detection").getAttribute("aria-busy")).toBe("true");
    toggle(card, "Build plate position detection").click();
    expect(hass.calls).toHaveLength(1);
    finish();
    await settle(card);
    expect(toggle(card, "Build plate position detection").disabled).toBe(false);
  });

  it("shows only the detections the model has", async () => {
    const { card } = await cardFor("h2d");
    await showView(card, "Control");
    await unfold(card);
    expect(states(card)).toEqual([
      "Build plate detection: true",
      "Spaghetti detection: true",
      "Purge chute pile-up detection: false",
      "Nozzle clumping detection: true",
      "Air printing detection: false",
    ]);
    // Paused: they still switch.
    expect(toggles(card).every((item) => !item.disabled)).toBe(true);
    const { card: mini } = await cardFor("a1mini");
    await showView(mini, "Control");
    await unfold(mini);
    expect(states(mini)).toEqual(["Build plate position detection: true"]);
    // Monitoring on a printer outside the X1 series: no line about what it watches.
    const { card: other } = await cardFor("h2d", { printer: { detectors: [{ key: "ai_monitoring", on: true }] } });
    await showView(other, "Control");
    await unfold(other);
    expect(states(other)).toEqual(["AI print monitoring: true"]);
    expect(find(other, ".detection .det-sub")).toBeNull();
    const { card: none } = await withX1c({ detectors: [] });
    await showView(none, "Control");
    await unfold(none);
    expect(find(none, ".detection")).toBeNull();
  });

  it("names each in the viewer's language, not the server's, unless the user renamed it", async () => {
    const { card } = await cardFor("a1mini", { printer: { renamed: { build_plate_position_detection: "Plate check" } } });
    await showView(card, "Control");
    await unfold(card);
    // The device is "Desk A1 mini": the friendly name without it.
    expect(toggles(card).map(name)).toEqual(["Plate check"]);
    expect(text(find(card, ".det-name"))).toBe("Plate check");
    // A German server names the entities in German; the viewer reads English.
    const { card: english } = await cardFor("h2d", { printer: { serverLanguage: "de" } });
    await showView(english, "Control");
    await unfold(english);
    expect(toggles(english).map(name)).toEqual([
      "Build plate detection",
      "Spaghetti detection",
      "Purge chute pile-up detection",
      "Nozzle clumping detection",
      "Air printing detection",
    ]);
    const { card: german } = await cardFor("h2d", { language: "de" });
    await showView(german, "Steuerung");
    await unfold(german);
    expect(toggles(german).map(name)).toEqual([
      "Druckplattenerkennung",
      "Spaghetti-Erkennung",
      "Auswurfschacht-Überwachung",
      "Erkennung von Düsenverklumpung",
      "Druck-ins-Leere-Erkennung",
    ]);
    const { card: x1 } = await cardFor("x1c", { language: "de" });
    await showView(x1, "Steuerung");
    await unfold(x1);
    expect(toggles(x1).map(name).slice(0, 2)).toEqual(["KI-Drucküberwachung", "Inspektion der ersten Schicht"]);
    expect(text(find(x1, ".detection .section-label"))).toBe("Druckoptionen");
    expect(text(find(x1, ".detection .hint"))).toBe(
      "An: Der Drucker pausiert den Druck, wenn die Erkennung anschlägt. Empfindlichkeit wie am Drucker eingestellt. Eine ausgeschaltete Erkennung bleibt aus, auch bei den nächsten Drucken.",
    );
    expect(text(find(x1, ".detection .det-sub"))).toBe("Spaghetti und Stau im Auswurfschacht");
    const { card: x1English } = await cardFor("x1c", { printer: { serverLanguage: "de" } });
    await showView(x1English, "Control");
    await unfold(x1English);
    expect(toggles(x1English).map(name)).toEqual(["AI print monitoring", "First layer inspection", "Build plate position detection"]);
  });

  it("shows a switch without a state as unknown, never as off", async () => {
    const { card, hass } = await cardFor("x1c");
    await showView(card, "Control");
    await unfold(card);
    await update(card, hass.withState(PLATE, "unavailable").withState("switch.x1c_ai_monitoring", "unknown"));
    expect(states(card)).toEqual(["First layer inspection: true"]);
    // A row to read, not a switch to tap.
    const unknown = findAll(card, ".detection .det-row.unknown");
    expect(unknown.map((row) => [text(row.querySelector(".det-name")), text(row.querySelector(".det-state"))])).toEqual([
      ["AI print monitoring", "Unknown"],
      ["Build plate position detection", "Unknown"],
    ]);
    expect(unknown.every((row) => row.tagName === "DIV" && !row.hasAttribute("role"))).toBe(true);
    // In the order of the detections.
    expect(findAll(card, ".detection .det-row").map((row) => text(row.querySelector(".det-name")))).toEqual([
      "AI print monitoring",
      "First layer inspection",
      "Build plate position detection",
    ]);
    const { card: german, hass: germanHass } = await cardFor("x1c", { language: "de" });
    await showView(german, "Steuerung");
    await unfold(german);
    await update(
      german,
      germanHass.withState(PLATE, "unknown").withState("switch.x1c_ai_monitoring", "unknown").withState("switch.x1c_first_layer_inspection", "unknown"),
    );
    expect(findAll(german, ".detection .det-state").map(text)).toEqual(["Unbekannt", "Unbekannt", "Unbekannt"]);
  });

  it("is not there while the printer is offline: the tab says so", async () => {
    const { card } = await withX1c({ online: false });
    await showView(card, "Control");
    expect(find(card, ".detection")).toBeNull();
    expect(find(card, ".job .job-info")).not.toBeNull();
  });
});

describe("the active nozzle", () => {
  it("switches between left and right without a print", async () => {
    const { card, hass } = await cardFor("h2d", { printer: IDLE_H2D });
    await showView(card, "Control");
    const sides = (): HTMLButtonElement[] => findAll<HTMLButtonElement>(card, ".nozzle-row [role=radio]");
    expect(text(find(card, ".nozzle-row .step-label"))).toBe("Active nozzle");
    expect(sides().map((item) => `${text(item)}: ${item.getAttribute("aria-checked")}`)).toEqual(["Left: true", "Right: false"]);
    await press(card, "Right");
    expect(hass.calls.at(-1)).toEqual({ domain: "select", service: "select_option", data: { entity_id: "select.h2d_active_nozzle", option: "right" }, notifyOnError: false });
    await update(card, hass.withState("select.h2d_active_nozzle", "standby", { options: [] }));
    expect(sides().map(text)).toEqual(["Left", "Right"]);
    await update(card, hass.withState("select.h2d_active_nozzle", "unavailable"));
    expect(sides().every((item) => item.disabled)).toBe(true);
    const { card: single } = await cardFor("a1mini");
    await showView(single, "Control");
    expect(find(single, ".nozzle-row")).toBeNull();
  });

  it("waits while a print is on the printer", async () => {
    const { card } = await cardFor("h2d");
    await showView(card, "Control");
    expect(findAll<HTMLButtonElement>(card, ".nozzle-row [role=radio]").every((item) => item.disabled)).toBe(true);
  });

  it("decides whether the nozzle is hot enough to extrude, and names it", async () => {
    const { card, hass } = await cardFor("h2d", { printer: IDLE_H2D });
    await showView(card, "Control");
    expect(button(card, "Extrude 10 mm of filament").disabled).toBe(false);
    expect(find(card, ".note")).toBeNull();
    // The right nozzle is at 31 °C.
    let next = hass.withState("select.h2d_active_nozzle", "right");
    await update(card, next);
    expect(button(card, "Extrude 10 mm of filament").disabled).toBe(true);
    expect(text(find(card, ".note"))).toBe(`To extrude, heat the right nozzle (active) to at least 170${NBSP}°C under Heating.`);
    next = next.withState("sensor.h2d_left_nozzle_temperature", "120").withState("select.h2d_active_nozzle", "left");
    await update(card, next);
    expect(text(find(card, ".note"))).toBe(`To extrude, heat the left nozzle (active) to at least 170${NBSP}°C under Heating.`);
    // Which one is active is not known: the hottest decides, and the hint names none.
    await update(card, next.withState("select.h2d_active_nozzle", "unknown"));
    expect(text(find(card, ".note"))).toBe(`To extrude, heat the nozzle to at least 170${NBSP}°C under Heating.`);
  });

  it("is tagged in the heating section while a job runs, as in the Status tab", async () => {
    const { card, hass } = await cardFor("h2d", { printer: { status: "printing", hms: [] } });
    await showView(card, "Control");
    const tags = (): (string | null)[] => findAll(card, ".heat-row").map((row) => (row.querySelector(".heat-tag") ? text(row.querySelector(".heat-tag")) : null));
    expect(tags()).toEqual(["active", null, null, null]);
    expect(text(find(card, ".heat-row .heat-label"))).toBe("Left nozzle active");
    // Where the name and the tag do not fit on one line, the tag goes below.
    expect(find(card, ".heat-row .heat-title .heat-tag")).not.toBeNull();
    const css = styleText();
    expect(declarations(".heat-title", css)).toContain("flex-wrap: wrap");
    await update(card, hass.withState("select.h2d_active_nozzle", "right"));
    expect(tags()).toEqual([null, "active", null, null]);
    await update(card, hass.withState("select.h2d_active_nozzle", "unavailable"));
    expect(tags()).toEqual([null, null, null, null]);
    // Idle, "active" beside Off would read as on: the select below says which one.
    const { card: idle } = await cardFor("h2d", { printer: IDLE_H2D });
    await showView(idle, "Control");
    expect(find(idle, ".heat-tag")).toBeNull();
    const { card: single } = await cardFor("a1mini");
    await showView(single, "Control");
    expect(find(single, ".heat-tag")).toBeNull();
  });

  it("says it in German", async () => {
    const { card, hass } = await cardFor("h2d", { language: "de", printer: IDLE_H2D });
    await showView(card, "Steuerung");
    expect(text(find(card, ".nozzle-row .step-label"))).toBe("Aktive Düse");
    expect(findAll(card, ".nozzle-row [role=radio]").map(text)).toEqual(["Links", "Rechts"]);
    const { card: printing } = await cardFor("h2d", { language: "de", printer: { status: "printing", hms: [] } });
    await showView(printing, "Steuerung");
    expect(text(find(printing, ".heat-tag"))).toBe("aktiv");
    const right = hass.withState("select.h2d_active_nozzle", "right");
    await update(card, right);
    expect(text(find(card, ".note"))).toBe(`Zum Extrudieren heize die rechte Düse (aktiv) unter „Heizen“ auf mindestens 170${NBSP}°C.`);
    // Back to the left nozzle, whose sensor reads 120 °C now.
    await update(card, right.withState("select.h2d_active_nozzle", "left").withState("sensor.h2d_left_nozzle_temperature", "120"));
    expect(text(find(card, ".note"))).toBe(`Zum Extrudieren heize die linke Düse (aktiv) unter „Heizen“ auf mindestens 170${NBSP}°C.`);
  });
});
