// Maintenance as BamBuddy keeps it for the printer: its chip -- "OK", or
// how many tasks are due -- and its dialog, the tasks overdue first, each
// marked done after a question in its own row (the list stays open: a
// first visit often marks several). BamBuddy counts a task never marked
// done from 0 h: such a task says so instead of a huge number.
import { html, nothing, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";

import { formatDuration, formatNumber, formatState, hasValue, stateOf } from "./format";
import { icon } from "./icons";
import { t, type TextKey } from "./i18n";
import { dialogNote, noData, type CardContext } from "./parts";

/** A task as the integration's maintenance sensor lists it. */
export interface MaintenanceTask {
  id: number;
  name: string;
  due: boolean;
  dueSoon: boolean;
  unit: "hours" | "days";
  interval: number;
  /** Hours or days left; negative when overdue. */
  left: number;
  done: boolean;
}

export interface Maintenance {
  state: string;
  tasks: MaintenanceTask[];
  due: number;
  soon: number;
}

export interface MaintenanceDialog {
  kind: "maintenance";
  /** The task whose row asks "Mark as done?". */
  confirming?: number;
  /** The tasks being marked done now. */
  marking?: readonly number[];
  /** Why the last try failed: said in the dialog, which stays open. */
  error?: string;
  /** The task marked done last: said to a screen reader. */
  marked?: string;
}

/** BamBuddy's default tasks, which it names in English. */
const TASK_NAMES: Record<string, TextKey> = {
  "Clean Build Plate": "maint_task_clean_build_plate",
  "Clean Nozzle/Hotend": "maint_task_clean_nozzle",
  "Check Belt Tension": "maint_task_belt_tension",
  "Check PTFE Tube": "maint_task_ptfe_tube",
  "Clean Carbon Rods": "maint_task_clean_carbon_rods",
  "Lubricate Steel Rods": "maint_task_lubricate_steel_rods",
  "Clean Steel Rods": "maint_task_clean_steel_rods",
  "Lubricate Linear Rails": "maint_task_lubricate_rails",
  "Clean Linear Rails": "maint_task_clean_rails",
};

const number = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

function taskOf(item: unknown): MaintenanceTask | undefined {
  if (typeof item !== "object" || item === null) return undefined;
  const task = item as Record<string, unknown>;
  if (typeof task["id"] !== "number") return undefined;
  const due = task["due"] === true;
  return {
    id: task["id"],
    name: typeof task["name"] === "string" ? task["name"] : "",
    due,
    dueSoon: !due && task["due_soon"] === true,
    unit: task["unit"] === "days" ? "days" : "hours",
    interval: number(task["interval"]),
    left: number(task["left"]),
    done: typeof task["last_done"] === "string",
  };
}

/** The printer's maintenance, while BamBuddy reports it -- also with the
 * printer offline: BamBuddy keeps it. */
export function maintenanceOf(ctx: CardContext): Maintenance | undefined {
  const state = stateOf(ctx.hass, ctx.refs.maintenance);
  if (!state || ctx.unreachable || !hasValue(ctx.hass, ctx.refs.maintenance)) return undefined;
  const listed = state.attributes["tasks"];
  const tasks = (Array.isArray(listed) ? (listed as unknown[]) : []).map(taskOf).filter((task): task is MaintenanceTask => task !== undefined);
  return {
    state: state.state,
    tasks,
    due: tasks.filter((task) => task.due).length,
    soon: tasks.filter((task) => task.dueSoon).length,
  };
}

const toneOf = (task: MaintenanceTask): string => (task.due ? "err" : task.dueSoon ? "warn" : "ok");

/** The chip: "Maintenance OK", or how many tasks are due or due soon -- red
 * with one overdue, as BamBuddy's own. A tap opens the dialog. */
export function maintenancePill(ctx: CardContext, open: () => void): TemplateResult | typeof nothing {
  const { hass } = ctx;
  const maintenance = maintenanceOf(ctx);
  if (!maintenance) return nothing;
  const { due, soon } = maintenance;
  const count = due + soon;
  const tone = due > 0 ? "err" : soon > 0 ? "warn" : "ok";
  const label = count ? t(hass, "maint_due_aria", { n: count, overdue: due, soon }) : t(hass, "maint_ok_aria");
  return html`<button class="pill maintenance tone-${tone}" aria-label=${label} title=${label} aria-haspopup="dialog" @click=${open}>
    ${icon("wrench")}<span>${count ? t(hass, "maint_due", { n: count }) : t(hass, "maint_ok")}</span>
  </button>`;
}

/** What is left: days as the card writes durations; print hours -- they
 * count only while the printer prints -- in hours, never as days. */
function span(ctx: CardContext, task: MaintenanceTask, amount: number): string {
  const { hass } = ctx;
  const value = Math.abs(amount);
  if (task.unit === "days") return formatDuration(hass, value * 1440);
  return value < 24 ? formatDuration(hass, value * 60) : t(hass, "dur_h", { h: formatNumber(hass, Math.round(value)) });
}

function whenText(ctx: CardContext, task: MaintenanceTask): string {
  const { hass } = ctx;
  if (!task.done) return t(hass, "maint_never");
  if (task.due) return t(hass, "maint_overdue", { time: span(ctx, task, task.left) });
  if (task.dueSoon) return t(hass, "maint_soon", { time: span(ctx, task, task.left) });
  return t(hass, "maint_in", { time: span(ctx, task, task.left) });
}

/** Overdue first, then due soon, then by what is left -- days as hours. */
function ordered(tasks: MaintenanceTask[]): MaintenanceTask[] {
  const rank = (task: MaintenanceTask): number => (task.due ? 0 : task.dueSoon ? 1 : 2);
  const hours = (task: MaintenanceTask): number => task.left * (task.unit === "days" ? 24 : 1);
  return [...tasks].sort((a, b) => rank(a) - rank(b) || hours(a) - hours(b));
}

export interface MaintenanceActions {
  confirmTask: (id: number | undefined) => void;
  /** Marks the task done; its name as the row shows it, to say it afterwards. */
  markDone: (id: number, name: string) => void;
}

function taskRow(ctx: CardContext, task: MaintenanceTask, dialog: MaintenanceDialog, actions: MaintenanceActions, canMark: boolean): TemplateResult {
  const { hass } = ctx;
  // A task named like a property of every object (toString) is no text key.
  const key = Object.hasOwn(TASK_NAMES, task.name) ? TASK_NAMES[task.name] : undefined;
  const name = key ? t(hass, key) : task.name;
  const used = task.interval > 0 ? Math.min(1, Math.max(0, (task.interval - task.left) / task.interval)) : 1;
  const pending = dialog.marking?.includes(task.id) ?? false;
  const confirming = dialog.confirming === task.id;
  return html`<div class="maint-row tone-${toneOf(task)}">
    <div class="maint-text">
      <span class="maint-name">${name}</span>
      <span class="maint-when">${whenText(ctx, task)}</span>
      <span class="maint-bar" aria-hidden="true"><span style="width: ${Math.round(used * 100)}%"></span></span>
    </div>
    ${canMark && !confirming
      ? html`<button
          class="btn ${task.due || task.dueSoon ? "tonal" : "plain"} maint-done ${pending ? "pending" : ""}"
          data-task=${task.id}
          aria-label=${t(hass, "maint_done_aria", { task: name })}
          aria-busy=${pending ? "true" : "false"}
          ?disabled=${pending}
          @click=${() => actions.confirmTask(task.id)}
        >
          ${icon("check")}<span>${t(hass, "maint_done")}</span>
        </button>`
      : nothing}
    ${canMark && confirming
      ? html`<div class="maint-confirm" role="group" aria-label=${name} aria-describedby="maint-ask-${task.id}">
          <span id="maint-ask-${task.id}">${t(hass, "maint_confirm")}</span>
          <span class="maint-confirm-actions">
            <button class="btn plain" @click=${() => actions.confirmTask(undefined)}>${t(hass, "cancel")}</button>
            <button class="btn primary" @click=${() => actions.markDone(task.id, name)}>${t(hass, "maint_done")}</button>
          </span>
        </div>`
      : nothing}
  </div>`;
}

/** The dialog: the tasks, the printer's print hours, and where tasks and
 * intervals are set. "Done" on every task -- not with Hide controls, which
 * is a view, not a lock. */
export function maintenanceContent(ctx: CardContext, dialog: MaintenanceDialog, actions: MaintenanceActions): TemplateResult {
  const { hass, refs } = ctx;
  const maintenance = maintenanceOf(ctx);
  const tasks = ordered(maintenance?.tasks ?? []);
  const canMark = !ctx.settings.readOnly;
  const hours = stateOf(hass, refs.printHours);
  return html`<h2 id="dlg-title">${t(hass, "maint_title")}</h2>
    ${tasks.some((task) => !task.done) ? dialogNote(t(hass, canMark ? "maint_all_never" : "maint_all_never_hidden")) : nothing}
    ${tasks.length
      ? html`<div class="maint-list">${repeat(tasks, (task) => task.id, (task) => taskRow(ctx, task, dialog, actions, canMark))}</div>`
      : ctx.unreachable
        ? dialogNote(t(hass, noData(ctx)))
        : html`<p class="hms-empty">${t(hass, "maint_none")}</p>`}
    ${dialog.error ? html`<div class="dlg-error" role="alert">${icon("error")}<span>${dialog.error}</span></div>` : nothing}
    <p class="maint-said sr-only" role="status">${dialog.marked ? t(hass, "maint_marked", { task: dialog.marked }) : ""}</p>
    <p class="maint-foot">
      ${hours && hasValue(hass, refs.printHours)
        ? html`<span>${t(hass, "maint_hours", { hours: formatState(hass, refs.printHours, hours.state) ?? hours.state })}</span>`
        : nothing}
      <span>${t(hass, "maint_note")}</span>
    </p>`;
}
