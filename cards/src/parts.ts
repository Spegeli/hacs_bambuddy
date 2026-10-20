// Pieces the views are built from, and what they need from the card: its
// hass and entities, its state, and its actions. A tap opens Home
// Assistant's more-info dialog where the card sets nothing itself; every
// tappable piece is a button, so it works by keyboard.
import { html, nothing, type TemplateResult } from "lit";

import { filamentColor, formatPercent, formatState, hasValue, needsOutline, numericState, stateOf } from "./format";
import { icon, type IconName } from "./icons";
import { LANGUAGES, t, type TextKey } from "./i18n";
import type { Settings } from "./forms";
import type { AmsRefs, Hass, HassEntityState, Heater, PrinterRefs, View } from "./types";

export interface Confirmation {
  title: string;
  text: string;
  confirm: string;
  /** The safe button's label: what stays as it is. "Cancel" when left out. */
  keep?: string;
  /** A line below the text: what else to know. */
  note?: string;
  /** A warning rather than a tip. */
  noteTone?: "info" | "warning";
  danger?: boolean;
  /** The action the confirmation sends: domain, service, data. */
  action: [string, string, Record<string, unknown>];
  key: string;
}

/** The question before a print is stopped -- the card's Stop and the HMS
 * answer that does it ask alike; the safe button keeps the print. */
export const stopQuestion = (hass: Hass, action: Confirmation["action"], key: string): Confirmation => ({
  title: t(hass, "stop_title"),
  text: t(hass, "stop_text"),
  confirm: t(hass, "stop_confirm"),
  keep: t(hass, "stop_keep"),
  danger: true,
  action,
  key,
});

/** What a view needs from the card. */
export interface CardContext {
  hass: Hass;
  /** The configuration with its defaults filled in. */
  settings: Settings;
  refs: PrinterRefs;
  /** The AMS units shown now: without one unplugged while the printer is online. */
  ams: AmsRefs[];
  status: string;
  online: boolean;
  /** No data from BamBuddy -- it does not answer, or refuses the key: the
   * printer may be fine, its state is unknown. */
  unreachable: boolean;
  /** A print job is on the printer: moving waits. */
  busy: boolean;
  /** A print runs, not paused: loading and unloading wait too. */
  running: boolean;
  /** The AMS changes filament: moving, loading, unloading and cooling wait. */
  changing: boolean;
  /** The card offers controls: the API key may control the printer (the
   * integration made its controls) and the card does not hide them. */
  canControl: boolean;
  /** The card would offer controls, but the API key lacks Control Printer. */
  keyLacksControl: boolean;
  /** Hide controls with a key that may control: the controls' states show,
   * as text, and nothing can be set from the card. */
  viewOnly: boolean;
  /** The card editor's preview shows the card: a part with nothing to
   * show now shows an example. */
  examples: boolean;
  /** The card has a control view: it may control, the tab is not off, and
   * a section the user chose has something to show. */
  controlTab: boolean;
  /** The card has a filament view: the printer has an AMS unit or an
   * external spool, and the tab is not off. */
  filamentTab: boolean;
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
  /** Whether an AMS unit shows its slots in the filament view. */
  amsUnfolded: (unit: AmsRefs) => boolean;
  toggleAms: (unit: AmsRefs, open: boolean) => void;
  moreInfo: (entityId: string | undefined) => void;
  show: (view: View) => void;
  /** Opens the connection check, which runs at once. */
  checkConnection: () => void;
  /** Opens the switch-off's settings; opened from the plugs dialog, they go back to it. */
  openAutoOff: () => void;
}

/** A button with an icon and, unless `iconOnly`, its label. While its
 * command runs it is marked, not disabled -- a disabled button drops the
 * keyboard's focus to the page -- and takes no press. */
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
  /** The element that says more about what the button does. */
  describedBy?: string;
  /** Which of several alike buttons this is: a question comes back to it. */
  answer?: string;
}): TemplateResult {
  const { label, iconName, onClick, kind = "tonal", disabled = false, pending = false, iconOnly = false, aria, className = "", describedBy, answer } = options;
  return html`<button
    class="btn ${kind} ${iconOnly ? "icon-only" : ""} ${pending ? "pending" : ""} ${className}"
    ?disabled=${disabled}
    aria-disabled=${pending ? "true" : nothing}
    aria-busy=${pending ? "true" : "false"}
    aria-label=${aria ?? label}
    aria-describedby=${describedBy ?? nothing}
    data-answer=${answer ?? nothing}
    title=${aria ?? label}
    @click=${pending ? nothing : onClick}
  >
    ${icon(iconName)}${iconOnly ? nothing : html`<span>${label}</span>`}
  </button>`;
}

/** The arrow keys, Home and End move the focus through a group of radios
 * and choose nothing: in the card a choice sends a command. Space or Enter
 * -- a click -- chooses. */
export function radioKeys(event: KeyboardEvent): void {
  const radios = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[role=radio]")];
  const index = radios.indexOf(event.target as HTMLElement);
  const moves: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: radios.length - 1 };
  if (index < 0 || !(event.key in moves)) return;
  event.preventDefault();
  const next = radios[((moves[event.key] as number) + radios.length) % radios.length];
  // Tab leaves the group from where the focus is.
  for (const radio of radios) radio.tabIndex = radio === next ? 0 : -1;
  next?.focus();
}

/** A group of radios the focus leaves: Tab comes back in on the chosen
 * option, else the first (the stop `radioKeys` moved goes back). */
export function radioLeave(event: FocusEvent): void {
  const group = event.currentTarget as HTMLElement;
  if (event.relatedTarget instanceof Node && group.contains(event.relatedTarget)) return;
  const radios = [...group.querySelectorAll<HTMLElement>("[role=radio]")];
  const chosen = radios.find((radio) => radio.getAttribute("aria-checked") === "true") ?? radios[0];
  for (const radio of radios) radio.tabIndex = radio === chosen ? 0 : -1;
}

/** The option of a group of radios the tab key stops at: the chosen one,
 * else the first. */
export const radioStop = <T>(options: readonly T[], chosen: T): number => Math.max(0, options.indexOf(chosen));

/** Why the card shows no printer state: BamBuddy does not answer, or the
 * printer is offline -- `offline` says that in the view's words. */
export const offlineText = (ctx: CardContext, offline: TextKey): string =>
  t(ctx.hass, ctx.unreachable ? (ctx.hass.user?.is_admin === false ? "unreachable_text_user" : "unreachable_text") : offline);

/** The connection in a word: the printer online, BamBuddy not answering,
 * or the printer offline. */
export const connection = (ctx: CardContext): TextKey => (ctx.online ? "online" : ctx.unreachable ? "unreachable_short" : "offline");

/** The context as if the printer were online: for the preview's examples. */
export const asOnline = (ctx: CardContext): CardContext => ({ ...ctx, online: true, unreachable: false });

/** When an example shows: during a print -- the print's own parts, or
 * any with the printer online --, once the printer is online, or once
 * BamBuddy answers. */
export const sampleKey = (ctx: CardContext, printOnly = false): TextKey =>
  printOnly || ctx.online ? "sample_job" : ctx.unreachable ? "sample_unreachable" : "sample_offline";

/** In the card editor's preview: parts with nothing to show now, as they
 * would look -- faded, not to be tapped, with a word on when they show. */
export function sample(ctx: CardContext, key: TextKey, body: TemplateResult | typeof nothing | readonly TemplateResult[]): TemplateResult {
  return html`<div class="sample">
    <span class="sample-note">${icon("info")}<span>${t(ctx.hass, key)}</span></span>
    <div class="sample-body" inert>${body}</div>
  </div>`;
}

/** A one-line note: why something is not available, or a hint. */
export function note(text: string, kind: "info" | "warning" = "info"): TemplateResult {
  return html`<div class="note ${kind}">${icon(kind === "info" ? "info" : "warning")}<span>${text}</span></div>`;
}

/** A notice with what to do about it beside it: the build plate to clear,
 * the filament to change in a paused print. */
export function callout(text: string, action: TemplateResult | typeof nothing = nothing): TemplateResult {
  return html`<div class="callout">${icon("info")}<span>${text}</span>${action}</div>`;
}

/** A note in a dialog: what else to know. */
export const dialogNote = (text: string, tone: "info" | "warning" = "info", id?: string): TemplateResult =>
  html`<p class="dlg-note ${tone}" id=${id ?? nothing}>${icon(tone)}<span>${text}</span></p>`;

/** A short confirmation over the card or a dialog -- "Sent", "Copied" --
 * in the wrapper that places it. */
export const snack = (wrapperClass: string, text: string): TemplateResult =>
  html`<div class=${wrapperClass}><div class="sent" role="status">${icon("check")}<span>${text}</span></div></div>`;

/** "Resume print": with the print controls, and where the filament of a
 * paused print is changed. It waits while the AMS changes filament: the
 * printer would resume in the middle of it. */
export function resumeButton(ctx: CardContext): TemplateResult {
  return actionButton({
    label: t(ctx.hass, "resume"),
    iconName: "play",
    kind: "primary",
    disabled: ctx.changing,
    pending: ctx.isPending("resume"),
    onClick: () => ctx.run("resume", "button", "press", { entity_id: ctx.refs.resume }),
  });
}

export type HeaterKind = "nozzle" | "bed" | "chamber";

/** The heaters in the order the card shows them -- the nozzles, left before
 * right, the bed, the chamber --, each with its label; `index` counts the
 * nozzles. */
export function heaters(ctx: CardContext): { label: string; heater: Heater; kind: HeaterKind; index: number }[] {
  const { hass, refs } = ctx;
  const nozzleLabels: TextKey[] = refs.dual ? ["nozzle_left", "nozzle_right"] : ["nozzle"];
  return [
    ...refs.nozzles.map((heater, index) => ({ label: t(hass, nozzleLabels[index] as TextKey), heater, kind: "nozzle" as const, index })),
    { label: t(hass, "bed"), heater: refs.bed, kind: "bed", index: 0 },
    { label: t(hass, "chamber"), heater: refs.chamber, kind: "chamber", index: 0 },
  ];
}

/** A dialog's "− value +": its two buttons, and the value said to a screen
 * reader as it changes. */
export function stepControl(options: {
  lower: { label: string; disabled: boolean; onClick: () => void };
  raise: { label: string; disabled: boolean; onClick: () => void };
  value: TemplateResult | string;
  /** The element that names what the stepper changes: a group then. */
  labelledBy?: string;
}): TemplateResult {
  const { lower, raise, value, labelledBy } = options;
  return html`<div class="stepper" role=${labelledBy ? "group" : nothing} aria-labelledby=${labelledBy ?? nothing}>
    ${actionButton({ ...lower, iconName: "minus", iconOnly: true })}
    <output class="step-value" aria-live="polite">${value}</output>
    ${actionButton({ ...raise, iconName: "plus", iconOnly: true })}
  </div>`;
}

/** The nozzle that reads hottest now: its temperature sensor, its figure
 * and its place (of two, 0 left). */
export function hottestNozzle(ctx: CardContext): { sensor: string; value: number; index: number } | undefined {
  return ctx.refs.nozzles
    .flatMap(({ sensor }, index) => {
      const value = numericState(ctx.hass, sensor);
      return sensor && value !== undefined ? [{ sensor, value, index }] : [];
    })
    .sort((a, b) => b.value - a.value)[0];
}

/** The most common reason why every command "does nothing": with developer
 * LAN mode off, BamBuddy takes commands and the printer ignores them. Only
 * "off" says so; an unknown mode (some printers never report it) does not. */
export function developerHint(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  if (!ctx.canControl || !ctx.online || stateOf(hass, refs.developerMode)?.state !== "off") return nothing;
  return note(t(hass, "developer_off"), "warning");
}

/** An entity's name in the card: the card's own text for it, in the
 * viewer's language -- Home Assistant names entities in the server's --,
 * unless the user renamed the entity; then their name, without the
 * printer's name in front where they typed it. The entity registry holds the
 * integration's own name where the user gave none: the card's text for it
 * in one of its languages, which are the integration's. */
export function entityName(ctx: CardContext, entityId: string, key: TextKey): string {
  const registered = ctx.hass.entities[entityId]?.name;
  if (!registered || Object.values(LANGUAGES).some((texts) => texts[key] === registered)) return t(ctx.hass, key);
  const prefix = `${ctx.refs.name} `;
  const rest = registered.startsWith(prefix) ? registered.slice(prefix.length).trim() : "";
  return rest || registered;
}

export const NOZZLE_SIDES = ["left", "right"];

/** "Left" for the first of two, "Right" for the second. */
export const sideName = (hass: Hass, index: number): string => t(hass, index === 0 ? "left" : "right");

export const AMS_HT = "AMS HT";

/** The model a unit's chip names: where its name does not say it, and on
 * every AMS where the printer has AMS units of two models -- "AMS A" beside
 * "AMS B" (AMS 2 Pro) says it is the first AMS. "AMS HT A" says its own. */
export function unitModel(ams: AmsRefs[], unit: AmsRefs): string | undefined {
  // An A2L's AMS Lite is named so: its name says it.
  if (!unit.model || unit.name === unit.model) return undefined;
  const models = new Set(ams.filter((item) => item.model && item.model !== AMS_HT).map((item) => item.model));
  return !unit.name.includes(unit.model) || (models.size > 1 && unit.model !== AMS_HT) ? unit.model : undefined;
}

/** The nozzle an AMS unit feeds on a two-nozzle printer, as its slots
 * say (the integration's `nozzle`); none on a printer with one. */
export function unitNozzle(hass: Hass, unit: AmsRefs): "left" | "right" | undefined {
  const value = stateOf(hass, unit.slots[0])?.attributes["nozzle"];
  return value === "left" || value === "right" ? value : undefined;
}

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

/** A slot's number in its unit: its own (the sensor's `slot`), the place
 * in the list only without one -- a slot whose sensor is disabled is not
 * in the list. */
function slotNumber(hass: Hass, entityId: string, index: number): number {
  const slot = stateOf(hass, entityId)?.attributes["slot"];
  return typeof slot === "number" && Number.isInteger(slot) && slot > 0 ? slot : index + 1;
}

/** A slot's place by the names the dialogs and questions give it: "Slot 2 · AMS A". */
export const slotPlace = (hass: Hass, unit: AmsRefs, entityId: string, index: number): string =>
  t(hass, "slot_label", { slot: slotNumber(hass, entityId, index), unit: unit.name });

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

