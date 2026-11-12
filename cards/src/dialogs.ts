// The card's dialogs: one element for every dialog, with its button row
// -- the safe choice comes first and has the focus; it says what stays as
// it is -- and the smaller ones: a confirmation before an action that
// cannot be taken back, the drying settings, the objects of a print to
// skip, the camera's frame rate. The slot's dialog (filament-dialog.ts,
// inventory-dialog.ts), the printer's (printer-dialogs.ts), the plugs',
// maintenance and the connection check have modules of their own.
import { html, nothing, type TemplateResult } from "lit";

import type { PrintObject } from "./actions";
import { formatTemperature, numberAttribute } from "./format";
import { checkContent, type CheckActions, type CheckDialog } from "./check";
import { chosenFilament, filamentBody, filamentChanges, keeping, midPrint, noOffer, nothingToSet, nozzleLine, type FilamentDialog } from "./filament-dialog";
import { canClearHms, hmsAnswered } from "./header";
import { assignmentEndsWarning, inventoryButtons, inventoryCard, inventoryContent, inventoryTabs, onInventory } from "./inventory-dialog";
import { autoOffContent, powerContent } from "./power";
import { firmwareContent, hmsContent, infoContent, storageContent } from "./printer-dialogs";
import { maintenanceContent, type MaintenanceActions, type MaintenanceDialog } from "./maintenance";
import { icon } from "./icons";
import { t, type TextKey } from "./i18n";
import { dialogError, dialogNote, slotOf, stepControl, warnings, type CardContext, type Confirmation } from "./parts";
import type { AmsRefs, Hass } from "./types";

/** Drying defaults and limits: BamBuddy's range; the AMS 2 Pro heats to 65 °C at most. */
export const DRYING = { temperature: 55, duration: 8, minTemperature: 45, maxTemperature: 85, maxTemperatureAms2Pro: 65, minDuration: 1, maxDuration: 24 };

export type DryingField = "temperature" | "duration";

/** The drying steppers' names: lower, raise. */
const STEPPER_NAMES: Record<DryingField, [TextKey, TextKey]> = {
  temperature: ["dry_temperature_lower", "dry_temperature_raise"],
  duration: ["dry_duration_lower", "dry_duration_raise"],
};

/** A loaded spool's material and the temperature it asks to be dried at. */
export interface DryingSpool {
  material: string;
  temperature: number;
}

export interface DryingDialog {
  kind: "drying";
  unit: AmsRefs;
  temperature: number;
  duration: number;
  maxTemperature: number;
  /** The values come from the loaded spools' own recommendation. */
  suggested: boolean;
  /** The loaded materials the suggestion is for, where known. */
  suggestedFor?: string;
  /** The loaded spools' temperatures, coolest first, where they differ;
   * else none. */
  differing: DryingSpool[];
  /** The slots an AMS 3H dries ("Slots 6 and 8"); none for every other AMS. */
  zone?: string;
}

export interface SkipDialog {
  kind: "skip";
  loading: boolean;
  objects: PrintObject[];
  /** The IDs ticked, in the order of the list. */
  chosen: number[];
  error?: string;
}

/** The printer information; `copied` while "Copied" shows. */
export interface InfoDialog {
  kind: "info";
  copied?: boolean;
}

/** Dialogs that show the printer's state as it is now: they follow it while open (the storage's too). */
export type StateDialog =
  | { kind: "hms" }
  | { kind: "firmware" }
  | { kind: "storage" }
  | { kind: "power" }
  | { kind: "auto_off" }
  | { kind: "camera" }
  | InfoDialog
  | MaintenanceDialog;

export type Dialog = ({ kind: "confirm" } & Confirmation) | DryingDialog | SkipDialog | FilamentDialog | StateDialog | CheckDialog;

export type { CheckDialog, MaintenanceDialog };

/** What the dialogs call: the card's own (card.ts, card-dialogs.ts), then
 * the slot dialog's (filament-session.ts), then the label scan's (scan-session.ts); the
 * maintenance and check dialogs' own members come with their types. */
export interface DialogActions extends MaintenanceActions, CheckActions {
  // The card's.
  close: () => void;
  confirm: () => void;
  /** Takes a drying value; returns the one the dialog holds then. */
  setDrying: (field: DryingField, value: number) => number;
  toggleObject: (id: number) => void;
  /** Copies a text, an IP address say, to the clipboard. */
  copy: (text: string) => void;
  /** Now, for the seconds a check runs. */
  now: () => number;
  /** Escape: closes the dialog, or first a question inside it. */
  cancel: (event: Event) => void;
  // The slot dialog's.
  /** The K profile chosen in the filament dialog. */
  setKProfile: (value: string) => void;
  /** The filament dialog's slot: cleared after a question, its chip read again. */
  resetSlot: () => void;
  refreshRfid: () => void;
  /** The filament dialog's vendor, then its filament (KEEP: the slot's own). */
  setVendor: (vendor: string) => void;
  setFilament: (filament: string) => void;
  /** A colour of the palette, or the one outside it. */
  setColor: (color: string) => void;
  /** A colour from the browser's colour picker, "#rrggbb". */
  pickColor: (color: string) => void;
  /** The slot dialog's way: its filament, or a spool of the inventory. */
  setTab: (tab: "set" | "inventory") => void;
  /** The inventory's list: a spool chosen, a filter set, a search typed. */
  chooseSpool: (id: number) => void;
  filterSpools: (field: "vendor" | "material" | "location", value: string) => void;
  searchSpools: (text: string) => void;
  /** The filters below the search, folded and unfolded. */
  toggleFilters: () => void;
  /** Removes the slot's assignment. */
  unassign: () => void;
  // The label scan's: started, the camera closed, a photo taken, the light switched.
  startScan: () => void;
  closeScan: () => void;
  takePhoto: (file: File) => void;
  toggleTorch: () => void;
}

function stepper(
  hass: Hass,
  actions: DialogActions,
  options: { label: string; field: DryingField; value: number; unit: string; min: number; max: number; step: number },
): TemplateResult {
  const { label, field, value, unit, min, max, step } = options;
  const id = `dry-${field}`;
  // The unit said with the label: "Duration (hours)".
  const spoken = field === "duration" ? t(hass, "hours_long") : unit;
  return html`<div class="field">
    <label for=${id}>${label}<span class="sr-only"> (${spoken})</span></label>
    <div class="stepper">
      <button class="btn icon-only" aria-label=${t(hass, STEPPER_NAMES[field][0])} ?disabled=${value <= min} @click=${() => actions.setDrying(field, value - step)}>
        ${icon("minus")}
      </button>
      <input
        id=${id}
        type="number"
        inputmode="numeric"
        min=${min}
        max=${max}
        .value=${String(value)}
        @change=${(event: Event) => {
          // The field shows the value taken -- clamped, or the last valid
          // one -- also where that value did not change.
          const input = event.target as HTMLInputElement;
          input.value = String(actions.setDrying(field, input.value.trim() === "" ? Number.NaN : Number(input.value)));
        }}
      />
      <span class="unit-text">${unit}</span>
      <button class="btn icon-only" aria-label=${t(hass, STEPPER_NAMES[field][1])} ?disabled=${value >= max} @click=${() => actions.setDrying(field, value + step)}>
        ${icon("plus")}
      </button>
    </div>
  </div>`;
}

/** Where the values come from: the loaded spools, which may disagree. */
function dryingSource(hass: Hass, dialog: DryingDialog): TemplateResult | typeof nothing {
  if (dialog.differing.length) {
    // A material keeps its temperature on its line.
    const spools = dialog.differing.map((spool) => `${spool.material} ${formatTemperature(hass, spool.temperature)}`).join(" · ");
    return html`<p class="dlg-suggested mixed">${icon("info")}<span>${t(hass, "dry_mixed", { spools })}</span></p>`;
  }
  if (!dialog.suggested) return nothing;
  const text = dialog.suggestedFor ? t(hass, "dry_suggested_for", { filaments: dialog.suggestedFor }) : t(hass, "dry_suggested");
  return html`<p class="dlg-suggested">${icon("check")}<span>${text}</span></p>`;
}

function dryingContent(hass: Hass, dialog: DryingDialog, actions: DialogActions): TemplateResult {
  return html`<h2 id="dlg-title">${t(hass, "dry_title", { unit: dialog.unit.name })}</h2>
    ${dialog.zone ? html`<div class="dry-zone" id="dlg-zone">${dialog.zone}</div>` : nothing}
    ${stepper(hass, actions, {
      label: t(hass, "dry_temperature"),
      field: "temperature",
      value: dialog.temperature,
      unit: "°C",
      min: DRYING.minTemperature,
      max: dialog.maxTemperature,
      step: 5,
    })}
    ${stepper(hass, actions, {
      label: t(hass, "dry_duration"),
      field: "duration",
      value: dialog.duration,
      unit: t(hass, "hours"),
      min: DRYING.minDuration,
      max: DRYING.maxDuration,
      step: 1,
    })}
    ${dryingSource(hass, dialog)}
    <p class="dlg-range">
      ${formatTemperature(hass, DRYING.minTemperature)} – ${formatTemperature(hass, dialog.maxTemperature)} · ${DRYING.minDuration}–${DRYING.maxDuration}
      ${t(hass, "hours")}
    </p>`;
}

/** Whether the ticked objects and the skipped ones are all of the print's:
 * that ends the print without the stop dialog, so the card refuses it. */
const everyObject = (dialog: SkipDialog): boolean =>
  dialog.chosen.length > 0 && dialog.objects.every((item) => item.skipped || dialog.chosen.includes(item.id));

function skipContent(hass: Hass, dialog: SkipDialog, actions: DialogActions): TemplateResult {
  let body: TemplateResult;
  if (dialog.loading) body = html`<p role="status">${t(hass, "skip_loading")}</p>`;
  else if (dialog.error) body = dialogError(dialog.error);
  else if (!dialog.objects.length) body = html`<p>${t(hass, "skip_none_listed")}</p>`;
  // One object: skipping it is stopping the print -- nothing to tick.
  else if (dialog.objects.length === 1) body = html`<p class="dlg-warn info">${icon("info")}<span>${t(hass, "skip_single")}</span></p>`;
  else {
    body = html`<div class="objects" role="group" aria-labelledby="dlg-title">
        ${dialog.objects.map(
          (item) => html`<label class="obj ${item.skipped ? "skipped" : ""}">
            <input
              type="checkbox"
              .checked=${dialog.chosen.includes(item.id)}
              ?disabled=${item.skipped}
              @change=${() => actions.toggleObject(item.id)}
            />
            <span class="obj-name">${item.name || t(hass, "skip_object", { id: item.id })}</span>
            ${item.skipped ? html`<span class="obj-note">${t(hass, "skip_skipped")}</span>` : nothing}
          </label>`,
        )}
      </div>
      <p class="dlg-warn">${icon("warning")}<span>${t(hass, everyObject(dialog) ? "skip_all" : "skip_text")}</span></p>`;
  }
  return html`<h2 id="dlg-title">${t(hass, "skip")}</h2>
    ${body}`;
}

function filamentContent(ctx: CardContext, dialog: FilamentDialog, actions: DialogActions): TemplateResult {
  const { hass } = ctx;
  // Read at every render: BamBuddy may link or drop the spool meanwhile.
  const slot = slotOf(hass, dialog.entityId);
  const spool = slot.inventory;
  const inventory = onInventory(hass, dialog);
  const switcher = slot.assignable && !dialog.rfid && !dialog.inventoryOnly ? inventoryTabs(hass, dialog, actions) : nothing;
  // One head for every way, so that the switch keeps its place and its focus.
  return html`<h2 id="dlg-title">${dialog.title}</h2>
    ${nozzleLine(ctx, dialog)} ${switcher} ${spool ? inventoryCard(ctx, spool, inventory && slot.assignable ? actions.unassign : undefined) : nothing}
    ${inventory ? (slot.assignable ? inventoryContent(ctx, dialog, actions, slot) : nothing) : filamentBody(ctx, dialog, actions, spool)}`;
}

/** A dialog's button row: what keeps, what confirms, and the notes above it. */
export interface DialogButtons {
  keep: string;
  confirm?: string;
  danger: boolean;
  ready: boolean;
  need?: string;
  quiet?: boolean;
  warn?: string[];
}

/** What the safe and the confirming button say; no confirming button
 * where there is nothing to confirm. `need` says what is missing while the
 * confirming button waits. */
function buttons(ctx: CardContext, dialog: Dialog): DialogButtons {
  const { hass } = ctx;
  switch (dialog.kind) {
    case "confirm":
      return { keep: dialog.keep ?? t(hass, "cancel"), confirm: dialog.confirm, danger: dialog.danger === true, ready: true };
    case "drying":
      return { keep: t(hass, "cancel"), confirm: t(hass, "dry_start"), danger: false, ready: true };
    case "filament":
      // The inventory's way: the spools (`inventoryButtons`).
      if (onInventory(ctx.hass, dialog)) return inventoryButtons(ctx, dialog);
      // A Bambu spool, or nothing to set: its tools only.
      if (dialog.rfid || nothingToSet(dialog)) return { keep: t(hass, "dismiss"), danger: false, ready: false };
      // A filament -- the slot's kept, or one chosen -- and a change.
      const chosen = chosenFilament(dialog);
      const keeps = keeping(dialog);
      return {
        keep: t(hass, "cancel"),
        confirm: t(hass, "filament_set"),
        danger: false,
        ready: (keeps || chosen !== undefined) && Object.keys(filamentChanges(dialog)).length > 0,
        // A vendor without its filament, or a colour or K profile for a slot without one: it needs one
        // too -- where Bambu Studio offers one.
        ...(!noOffer(dialog) && !keeps && chosen === undefined && (dialog.vendor !== undefined || dialog.color !== undefined || dialog.kprofile !== undefined)
          ? { need: t(hass, "filament_need_filament") }
          : {}),
        ...warnings(midPrint(ctx, dialog), assignmentEndsWarning(ctx, dialog)),
      };
    case "hms":
      return { keep: t(hass, "dismiss"), ...(canClearHms(ctx) ? { confirm: t(hass, "hms_clear") } : {}), danger: false, ready: true, quiet: hmsAnswered(ctx) };
    case "firmware":
    case "info":
    case "storage":
    case "maintenance":
    case "power":
    case "auto_off":
    case "camera":
      return { keep: t(hass, "dismiss"), danger: false, ready: false };
    case "check":
      return { keep: t(hass, "dismiss"), ...(dialog.running ? {} : { confirm: t(hass, "check_again") }), danger: false, ready: !dialog.running };
    case "skip": {
      // Nothing to choose: one way out.
      if (!dialog.loading && (dialog.error || dialog.objects.length <= 1)) return { keep: t(hass, "dismiss"), danger: true, ready: false };
      const count = dialog.chosen.length;
      const confirm = count === 0 ? t(hass, "skip") : count === 1 ? t(hass, "skip_one") : t(hass, "skip_many", { count });
      return { keep: t(hass, "cancel"), confirm, danger: true, ready: count > 0 && !everyObject(dialog) };
    }
  }
}

function content(ctx: CardContext, dialog: Dialog, actions: DialogActions): TemplateResult {
  const { hass } = ctx;
  switch (dialog.kind) {
    case "confirm":
      return html`<h2 id="dlg-title">${dialog.title}</h2>
        <p id="dlg-text">${dialog.text}</p>
        ${dialog.note ? dialogNote(dialog.note, dialog.noteTone, "dlg-note") : nothing}`;
    case "drying":
      return dryingContent(hass, dialog, actions);
    case "filament":
      return filamentContent(ctx, dialog, actions);
    case "skip":
      return skipContent(hass, dialog, actions);
    case "hms":
      return hmsContent(ctx);
    case "firmware":
      return firmwareContent(ctx, actions.close);
    case "info":
      return infoContent(ctx, dialog.copied === true, actions.copy);
    case "storage":
      return storageContent(ctx);
    case "power":
      return powerContent(ctx);
    case "auto_off":
      return autoOffContent(ctx);
    case "camera":
      return cameraContent(ctx);
    case "maintenance":
      return maintenanceContent(ctx, dialog, actions);
    case "check":
      return checkContent(ctx, dialog, actions, actions.now());
  }
}

/** The live view's frame rate: from 5 to the camera's most, in
 * steps of 5; sent when the taps stop, the stream follows. */
function cameraContent(ctx: CardContext): TemplateResult {
  const { hass, refs } = ctx;
  const number = refs.cameraFps as string;
  const set = ctx.targetOf(number);
  // Limits missing: from 5 to the value it has.
  const min = numberAttribute(hass, number, "min") ?? 5;
  const max = numberAttribute(hass, number, "max") ?? Math.max(min, set ?? min);
  const step = numberAttribute(hass, number, "step") ?? 5;
  const value = set ?? max;
  return html`<h2 id="dlg-title">${t(hass, "fps_title")}</h2>
    ${stepControl({
      centered: true,
      lower: { label: t(hass, "fps_lower", { step }), disabled: value <= min, onClick: () => ctx.stepTarget(number, Math.max(min, value - step)) },
      raise: { label: t(hass, "fps_raise", { step }), disabled: value >= max, onClick: () => ctx.stepTarget(number, Math.min(max, value + step)) },
      value: html`<span aria-hidden="true">${t(hass, "fps_value", { fps: value })}</span><span class="sr-only">${t(hass, "fps_aria", { fps: value })}</span>`,
    })}
    <p class="hint">${t(hass, "fps_note", { min, max, step })}</p>`;
}

/** The dialogs a press started on the backdrop of: kept on the element, as
 * the card may draw again between the press and the click. */
const pressedBeside = new WeakSet<EventTarget>();

/** The dialog; `notice`: "Sent" or an error, inside it while it is open --
 * the card behind a modal dialog is out of reach. */
export function dialogView(ctx: CardContext, dialog: Dialog, actions: DialogActions, notice: TemplateResult | typeof nothing = nothing): TemplateResult {
  const { keep, confirm, danger, ready, need, quiet, warn } = buttons(ctx, dialog);
  // A tap on the backdrop -- the dialog element itself -- closes it. Only
  // one pressed there too: a drag from a field out of the dialog, selecting
  // its text, ends with a click on the backdrop as well.
  const press = (event: Event): void => {
    const element = event.currentTarget as EventTarget;
    if (event.target === element) pressedBeside.add(element);
    else pressedBeside.delete(element);
  };
  const backdrop = (event: Event): void => {
    const element = event.currentTarget as EventTarget;
    const pressed = pressedBeside.delete(element);
    if (pressed && event.target === element) actions.close();
  };
  // A question is read out whole; one that ends something is an alert.
  const question = dialog.kind === "confirm";
  // The AMS 3H's drying zone belongs to the title: read with it.
  const described = question ? (dialog.note ? "dlg-text dlg-note" : "dlg-text") : dialog.kind === "drying" && dialog.zone ? "dlg-zone" : undefined;
  return html`<dialog
    role=${question && danger ? "alertdialog" : nothing}
    aria-labelledby="dlg-title"
    aria-describedby=${described ?? nothing}
    @cancel=${actions.cancel}
    @close=${actions.close}
    @pointerdown=${press}
    @click=${backdrop}
  >
    <div class="dlg-body">
      ${content(ctx, dialog, actions)}
      ${notice}
      <div class="dlg-actions">
        ${(warn ?? []).map((line) => html`<span class="dlg-warn">${icon("warning")}<span>${line}</span></span>`)}
        ${need ? html`<span class="dlg-need">${need}</span>` : nothing}
        <button class="btn plain safe" autofocus @click=${actions.close}>${keep}</button>
        ${confirm === undefined
          ? nothing
          : html`<button class="btn ${danger ? "danger" : quiet ? "tonal" : "primary"}" ?disabled=${!ready} @click=${actions.confirm}>${confirm}</button>`}
      </div>
    </div>
  </dialog>`;
}
