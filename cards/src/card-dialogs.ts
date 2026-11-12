// The dialogs' own flows: drying set to the loaded spools, the print's
// objects to skip, the maintenance tasks marked done, the connection check
// and its seconds, "Copied" in the printer information. The dialog stack --
// what a question parks, Close and Confirm -- stays the card's.
import { callAction, errorText, printObjects } from "./actions";
import { runCheck, type CheckDialog } from "./check";
import { DRYING, type Dialog, type DryingField, type DryingSpool } from "./dialogs";
import { stateOf } from "./format";
import { AMS_2_PRO, dryingZone, slotOf, type Slot } from "./parts";
import type { AmsRefs, Hass, HassEntityState, PrinterRefs } from "./types";

/** How long "Copied" shows. */
const COPIED_MS = 3_000;
/** The redraw of a count while it runs (a plug starting, a connection check). */
export const TICK_MS = 1000;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** What the flows need of the card. */
export interface FlowsHost {
  hass: () => Hass;
  refs: () => PrinterRefs | undefined;
  dialog: () => Dialog | undefined;
  setDialog: (dialog: Dialog) => void;
  focusAfterUpdate: (...targets: string[]) => void;
  /** A question opens: an earlier "Sent" would read as its answer. */
  dropSent: () => void;
  requestUpdate: () => void;
}

export class DialogFlows {
  private copiedTimer?: ReturnType<typeof setTimeout>;
  /** Draws the seconds of a connection check while it runs. */
  private checkTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly host: FlowsHost) {}

  /** Back on the page while a check runs: its seconds count on. */
  resume(): void {
    const dialog = this.host.dialog();
    if (dialog?.kind === "check" && dialog.running) this.startCheckTimer();
  }

  /** Off the page: no tick, no "Copied" to take back -- it goes with the
   * printer information it showed in. */
  stop(): void {
    clearTimeout(this.copiedTimer);
    this.stopCheckTimer();
    if (this.host.dialog()?.kind === "info") this.host.setDialog({ kind: "info" });
  }

  /** Opens or folds a folded line of the connection check. */
  toggleFold(which: "pass" | "skip"): void {
    const dialog = this.host.dialog();
    if (dialog?.kind !== "check") return;
    const open = dialog.open ?? [];
    this.host.setDialog({ ...dialog, open: open.includes(which) ? open.filter((item) => item !== which) : [...open, which] });
  }

  /** The drying dialog, set to what the loaded spools recommend: the
   * gentlest temperature among them -- hotter can soften a spool -- and the
   * longest time, within the unit's limits; else 55 °C for 8 h. Where the
   * spools want different temperatures, the dialog names them. */
  openDrying(unit: AmsRefs): void {
    const hass = this.host.hass();
    const zoneText = dryingZone(hass, unit.drying);
    const maxTemperature = unit.model === AMS_2_PRO ? DRYING.maxTemperatureAms2Pro : DRYING.maxTemperature;
    // The AMS 3H dries only its zone: two of its slots, numbered from 1.
    const zone = unit.drying ? stateOf(hass, unit.drying)?.attributes["zone_slots"] : undefined;
    const dried = Array.isArray(zone) ? unit.slots.filter((_, index) => zone.includes(index + 1)) : unit.slots;
    const loaded = dried.map((entityId) => slotOf(hass, entityId)).filter((slot) => !slot.empty && !slot.unknown);
    const recommended = (slot: Slot, name: string): number | undefined => {
      const value = (stateOf(hass, slot.entityId) as HassEntityState).attributes[name];
      return typeof value === "number" && value > 0 ? Math.round(value) : undefined;
    };
    // Each material and temperature once, the coolest first.
    const spools = new Map<string, DryingSpool>();
    for (const slot of loaded) {
      const temperature = recommended(slot, "drying_temp");
      const material = slot.type || slot.name;
      if (temperature !== undefined) spools.set(`${material} ${temperature}`, { material, temperature });
    }
    const listed = [...spools.values()].sort((a, b) => a.temperature - b.temperature);
    const temperatures = listed.map((spool) => spool.temperature);
    const durations = loaded.map((slot) => recommended(slot, "drying_time")).filter((value): value is number => value !== undefined);
    this.host.setDialog({
      kind: "drying",
      unit,
      temperature: clamp(temperatures[0] ?? DRYING.temperature, DRYING.minTemperature, maxTemperature),
      duration: clamp(durations.length ? Math.max(...durations) : DRYING.duration, DRYING.minDuration, DRYING.maxDuration),
      maxTemperature,
      suggested: temperatures.length > 0 || durations.length > 0,
      ...(listed.length ? { suggestedFor: [...new Set(listed.map((spool) => spool.material))].join(", ") } : {}),
      differing: new Set(temperatures).size > 1 ? listed : [],
      ...(zoneText ? { zone: zoneText } : {}),
    });
  }

  /** Takes a drying value, clamped; an invalid one keeps the last. */
  setDrying(field: DryingField, value: number): number {
    const dialog = this.host.dialog() as Extract<Dialog, { kind: "drying" }>;
    if (!Number.isFinite(value)) return dialog[field];
    const next =
      field === "temperature"
        ? clamp(Math.round(value), DRYING.minTemperature, dialog.maxTemperature)
        : clamp(Math.round(value), DRYING.minDuration, DRYING.maxDuration);
    this.host.setDialog({ ...dialog, [field]: next });
    return next;
  }

  /** Opens the list of the print's objects; it fills when the integration
   * answers. An answer for a dialog closed meanwhile is dropped. */
  async openSkip(): Promise<void> {
    const hass = this.host.hass();
    const deviceId = (this.host.refs() as PrinterRefs).deviceId;
    const opened: Dialog = { kind: "skip", loading: true, objects: [], chosen: [] };
    this.host.setDialog(opened);
    let next: Dialog;
    try {
      next = { ...opened, loading: false, objects: await printObjects(hass, deviceId) };
    } catch (error) {
      const reason = await errorText(hass, error);
      next = { ...opened, loading: false, error: reason };
    }
    if (this.host.dialog() === opened) this.host.setDialog(next);
  }

  toggleObject(id: number): void {
    const dialog = this.host.dialog();
    if (dialog?.kind !== "skip") return;
    const chosen = dialog.chosen.includes(id) ? dialog.chosen.filter((item) => item !== id) : [...dialog.chosen, id];
    // In the order of the list, as the printer reads it.
    const order = dialog.objects.map((item) => item.id);
    this.host.setDialog({ ...dialog, chosen: chosen.sort((a, b) => order.indexOf(a) - order.indexOf(b)) });
  }

  /** Asks in a task's row whether to mark it done, or takes the question
   * back. The focus goes with it: to its Cancel, then back to the row's Done. */
  confirmTask(id: number | undefined): void {
    const dialog = this.host.dialog();
    if (dialog?.kind !== "maintenance") return;
    // A task being marked meanwhile keeps waiting, and says how it ended.
    const marking = dialog.marking !== undefined ? { marking: dialog.marking } : {};
    this.host.setDialog(id === undefined ? { kind: "maintenance", ...marking } : { kind: "maintenance", ...marking, confirming: id });
    if (id !== undefined) {
      this.host.dropSent();
      this.host.focusAfterUpdate(".maint-confirm .btn.plain");
    } else if (dialog.confirming !== undefined) this.host.focusAfterUpdate(`.maint-done[data-task="${dialog.confirming}"]`);
  }

  /** Marks a maintenance task done. The dialog stays open -- a first visit
   * often marks several --, so a failure is said in it, not under it. */
  async markDone(id: number, name: string): Promise<void> {
    const hass = this.host.hass();
    // Another task may be marked meanwhile: each waits for its own answer.
    const opened = this.host.dialog();
    const before = opened?.kind === "maintenance" ? (opened.marking ?? []) : [];
    this.host.setDialog({ kind: "maintenance", marking: [...before, id] });
    let error: string | undefined;
    try {
      await callAction(hass, "bambuddy", "mark_maintenance_done", { device_id: this.host.refs()?.deviceId, task_id: id });
    } catch (caught) {
      error = await errorText(hass, caught);
    }
    const now = this.host.dialog();
    if (now?.kind !== "maintenance" || !now.marking?.includes(id)) return;
    const asking = now.confirming;
    const others = now.marking.filter((other) => other !== id);
    // A failure of another task, said meanwhile, stays said.
    const said = error ?? now.error;
    this.host.setDialog({
      kind: "maintenance",
      ...(others.length ? { marking: others } : {}),
      ...(asking === undefined ? {} : { confirming: asking }),
      ...(said === undefined ? {} : { error: said }),
      // Marked: said to a screen reader by the name the row shows.
      ...(error === undefined ? { marked: name } : {}),
    });
    if (asking !== undefined) return;
    // Its Done waited, disabled; the focus goes back to it now.
    this.host.focusAfterUpdate(`.maint-done[data-task="${id}"]`, "dialog .btn.safe");
  }

  /** Runs BamBuddy's connection check; the dialog counts the seconds until
   * it answers. An answer for a dialog closed or run again meanwhile is
   * dropped. */
  async startCheck(): Promise<void> {
    const hass = this.host.hass();
    const deviceId = (this.host.refs() as PrinterRefs).deviceId;
    const opened: CheckDialog = { kind: "check", running: true, started: Date.now() };
    this.host.setDialog(opened);
    this.startCheckTimer();
    // "Check again" goes while it runs: the focus stays in the dialog.
    this.host.focusAfterUpdate("dialog .btn.safe");
    let next: CheckDialog;
    try {
      next = { ...opened, running: false, result: await runCheck(hass, deviceId) };
    } catch (error) {
      next = { ...opened, running: false, error: await errorText(hass, error) };
    }
    if (this.host.dialog() !== opened) return;
    this.stopCheckTimer();
    this.host.setDialog(next);
  }

  private startCheckTimer(): void {
    this.stopCheckTimer();
    this.checkTimer = setInterval(() => this.host.requestUpdate(), TICK_MS);
  }

  stopCheckTimer(): void {
    clearInterval(this.checkTimer);
    this.checkTimer = undefined;
  }

  /** Copies a text; "Copied" shows in the printer information for a moment.
   * A browser that refuses says nothing: the text is still there to select. */
  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    const dialog = this.host.dialog();
    if (dialog?.kind !== "info") return;
    this.host.setDialog({ ...dialog, copied: true });
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => {
      if (this.host.dialog()?.kind === "info") this.host.setDialog({ kind: "info" });
    }, COPIED_MS);
  }
}
