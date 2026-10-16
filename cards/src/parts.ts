// Pieces the views are built from, and what they need from the card: its
// hass and entities, its state, and its actions. A tap opens Home
// Assistant's more-info dialog where the card sets nothing itself; every
// tappable piece is a button, so it works by keyboard.
import { html, nothing, type TemplateResult } from "lit";

import { filamentColor, formatPercent, formatState, hasValue, needsOutline, stateOf } from "./format";
import { icon, type IconName } from "./icons";
import { t } from "./i18n";
import type { AmsRefs, CardConfig, Hass, HassEntityState, PrinterRefs, View } from "./types";

export interface Confirmation {
  title: string;
  text: string;
  confirm: string;
  /** The safe button's label: what stays as it is. "Back" when left out. */
  keep?: string;
  /** A line below the text: what else to know. */
  note?: string;
  danger?: boolean;
  /** The action the confirmation sends: domain, service, data. */
  action: [string, string, Record<string, unknown>];
  key: string;
}

/** What a view needs from the card. */
export interface CardContext {
  hass: Hass;
  config: CardConfig;
  refs: PrinterRefs;
  status: string;
  online: boolean;
  /** A print job is on the printer: moving waits. */
  busy: boolean;
  /** A print runs, not paused: loading and unloading wait too. */
  running: boolean;
  /** The AMS changes filament: moving, loading, unloading and cooling wait. */
  changing: boolean;
  /** The card offers controls: the API key may control the printer (the
   * integration made a Pause button) and show_controls is not off. */
  canControl: boolean;
  /** The card would offer controls, but the API key lacks Control Printer. */
  keyLacksControl: boolean;
  /** Starts the live view; undefined while the camera cannot stream on a tap. */
  startLive?: () => void;
  isPending: (key: string) => boolean;
  run: (key: string, domain: string, service: string, data: Record<string, unknown>) => void;
  confirm: (confirmation: Confirmation) => void;
  dry: (unit: AmsRefs) => void;
  /** Opens the dialog that sets a slot's material and colour, titled so. */
  setFilament: (slot: Slot, title: string) => void;
  /** Opens the list of the running print's objects to skip some. */
  skip: () => void;
  /** A heater's target as the card shows it: the one being set, else its state. */
  targetOf: (entityId: string) => number | undefined;
  /** Sets a heater's target once the taps stop. */
  stepTarget: (entityId: string, value: number) => void;
  /** Sets targets at once: Off, Cool down. */
  setTargets: (targets: [string, number][]) => void;
  /** A switch as the card shows it: the state just set, else its own. */
  switchOn: (entityId: string) => boolean;
  /** Turns a switch on or off; the new state shows at once. */
  toggleSwitch: (entityId: string) => void;
  /** The print options are open: folded at first. */
  optionsOpen: boolean;
  toggleOptions: () => void;
  moreInfo: (entityId: string | undefined) => void;
  show: (view: View) => void;
}

/** A button with an icon and, unless `iconOnly`, its label. */
export function actionButton(options: {
  label: string;
  iconName: IconName;
  onClick: () => void;
  kind?: "primary" | "danger" | "plain" | "tonal";
  disabled?: boolean;
  pending?: boolean;
  iconOnly?: boolean;
  aria?: string;
  className?: string;
}): TemplateResult {
  const { label, iconName, onClick, kind = "tonal", disabled = false, pending = false, iconOnly = false, aria, className = "" } = options;
  return html`<button
    class="btn ${kind} ${iconOnly ? "icon-only" : ""} ${pending ? "pending" : ""} ${className}"
    ?disabled=${disabled || pending}
    aria-busy=${pending ? "true" : "false"}
    aria-label=${aria ?? label}
    title=${aria ?? label}
    @click=${onClick}
  >
    ${icon(iconName)}${iconOnly ? nothing : html`<span>${label}</span>`}
  </button>`;
}

/** A one-line note: why something is not available, or a hint. */
export function note(text: string, kind: "info" | "warning" = "info"): TemplateResult {
  return html`<div class="note ${kind}">${icon(kind === "info" ? "info" : "warning")}<span>${text}</span></div>`;
}

/** The most common reason why every command "does nothing": with developer
 * LAN mode off, BamBuddy takes commands and the printer ignores them. Only
 * "off" says so; an unknown mode (some printers never report it) does not. */
export function developerHint(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  if (!ctx.canControl || !ctx.online || stateOf(hass, refs.developerMode)?.state !== "off") return nothing;
  return note(t(hass, "developer_off"), "warning");
}

/** An entity's name as Home Assistant shows it, without the printer's name
 * in front: "Part cooling fan", or what the user renamed it to. */
export function entityName(ctx: CardContext, entityId: string, fallback: string): string {
  const friendly = stateOf(ctx.hass, entityId)?.attributes["friendly_name"];
  if (typeof friendly !== "string") return fallback;
  const prefix = `${ctx.refs.name} `;
  return (friendly.startsWith(prefix) ? friendly.slice(prefix.length) : friendly).trim() || fallback;
}

export const NOZZLE_SIDES = ["left", "right"];

/** Which of two nozzles extrudes and loads -- 0 left, 1 right --, where the
 * printer says. */
export function activeNozzleIndex(ctx: CardContext): number | undefined {
  const side = NOZZLE_SIDES.indexOf(stateOf(ctx.hass, ctx.refs.activeNozzle)?.state ?? "");
  return ctx.refs.dual && side >= 0 ? side : undefined;
}

/** AMS states that need no line: it rests, or nothing is known. */
const AMS_RESTING = new Set(["idle", "unknown", "unavailable", ""]);

/** What the AMS does right now -- "AMS: Feeding" -- while it is not idle:
 * a filament change takes minutes, and this says it is under way. */
export function amsActivity(ctx: CardContext): string | undefined {
  const { hass, refs } = ctx;
  const state = stateOf(hass, refs.amsStatus)?.state;
  if (!ctx.online || state === undefined || AMS_RESTING.has(state)) return undefined;
  return t(hass, "ams_activity", { state: formatState(hass, refs.amsStatus) as string });
}

export interface Slot {
  entityId: string;
  name: string;
  type: string;
  color?: string;
  remaining?: number;
  active: boolean;
  empty: boolean;
  /** Home Assistant has no state for it: the printer is offline, say. */
  unknown: boolean;
  /** A Bambu spool's chip describes it: nobody sets its filament by hand. */
  rfid: boolean;
  /** A spool sits there, described or not. */
  present: boolean;
}

/** A slot sensor's filament: state = its name or "empty"; the attributes
 * say the rest (the integration's slot attributes). Without a state the
 * contents are unknown, not empty. */
export function slotOf(hass: Hass, entityId: string): Slot {
  const state = stateOf(hass, entityId);
  const unknown = !hasValue(hass, entityId);
  const attributes = unknown ? {} : (state as HassEntityState).attributes;
  const text = (value: unknown): string => (typeof value === "string" ? value : "");
  const remaining = attributes["remaining"];
  const empty = !unknown && (attributes["empty"] === true || state?.state === "empty");
  return {
    entityId,
    name: empty || unknown ? "" : text(attributes["name"]) || (state?.state ?? ""),
    type: text(attributes["type"]),
    color: filamentColor(attributes["color"]),
    ...(typeof remaining === "number" && remaining >= 0 ? { remaining } : {}),
    active: attributes["active"] === true,
    empty,
    unknown,
    rfid: attributes["rfid"] === true,
    present: attributes["present"] === true,
  };
}

/** A filament's colour as a little spool: the true colour fills it as far
 * as filament is left (full while unknown), the rest stays neutral; a thin
 * outline keeps black and white visible on every theme. An empty slot is
 * dashed, one whose contents are unknown is the bare neutral spool, the
 * slot in use has a ring. */
export function swatch(slot: Slot, size: "small" | "large" = "small"): TemplateResult {
  const color = slot.color ?? "var(--bb-muted)";
  const fill = slot.remaining ?? 100;
  const outline = slot.color !== undefined && needsOutline(slot.color);
  const partial = !slot.empty && fill < 100;
  return html`<span
    class="swatch ${size} ${slot.empty ? "empty" : ""} ${slot.unknown ? "unknown" : ""} ${slot.active ? "active" : ""} ${outline ? "outline" : ""} ${partial ? "partial" : ""}"
    style="--c: ${color}; --fill: ${Math.max(6, Math.min(100, fill))}%"
    aria-hidden="true"
    ><span class="fill"></span
  ></span>`;
}

/** What an empty slot reads: a spool sits there that nobody described
 * yet -- every external spool before it is set --, or there is none. */
export const emptyText = (hass: Hass, slot: Slot): string => t(hass, slot.present ? "not_set" : "empty");

/** The slot's label: what the strip shows below a swatch. */
export function slotTitle(hass: Hass, slot: Slot): string {
  if (slot.unknown) return t(hass, "unknown");
  if (slot.empty) return emptyText(hass, slot);
  const left = slot.remaining === undefined ? "" : ` · ${formatPercent(hass, slot.remaining)}`;
  return `${slot.name || slot.type}${left}`;
}

