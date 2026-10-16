// The card's dialogs: a confirmation before an action that cannot be taken
// back, the drying settings, the objects of a print to skip, a slot's
// material and colour, and what the head's chips and menu open -- the HMS
// messages, the firmware, the printer information. The safe choice comes
// first and has the focus; it says what stays as it is.
import { html, nothing, type TemplateResult } from "lit";

import type { PrintObject } from "./actions";
import { formatTemperature, needsOutline } from "./format";
import { canClearHms, firmwareContent, hmsContent, infoContent } from "./header";
import { icon } from "./icons";
import { t, type TextKey } from "./i18n";
import type { CardContext, Confirmation } from "./parts";
import type { AmsRefs, Hass } from "./types";

/** Drying defaults and limits: BamBuddy's range; the AMS 2 Pro heats to 65 °C at most. */
export const DRYING = { temperature: 55, duration: 8, minTemperature: 45, maxTemperature: 85, maxTemperatureAms2Pro: 65, minDuration: 1, maxDuration: 24 };

export type DryingField = "temperature" | "duration";

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
  /** The loaded spools' temperatures, coolest first, where they differ;
   * else none. */
  differing: DryingSpool[];
}

export interface SkipDialog {
  kind: "skip";
  loading: boolean;
  objects: PrintObject[];
  /** The IDs ticked, in the order of the list. */
  chosen: number[];
  error?: string;
}

/** The generic materials the integration sets (Bambu's generic profiles). */
export const MATERIALS = ["PLA", "PLA Silk", "PLA-CF", "PETG", "PETG HF", "PETG-CF", "PCTG", "ABS", "ASA", "PC", "PA", "PA-CF", "TPU"] as const;

/** The material choice that keeps the slot's own. */
export const KEEP = "keep";

/** Bambu's common basic colours, each with its name. */
export const PALETTE: readonly { color: string; name: TextKey }[] = [
  { color: "#FFFFFF", name: "color_white" },
  { color: "#000000", name: "color_black" },
  { color: "#8E9089", name: "color_gray" },
  { color: "#A6A9AA", name: "color_silver" },
  { color: "#C12E1F", name: "color_red" },
  { color: "#FF6A13", name: "color_orange" },
  { color: "#F4EE2A", name: "color_yellow" },
  { color: "#00AE42", name: "color_green" },
  { color: "#00A6A0", name: "color_turquoise" },
  { color: "#0086D6", name: "color_cyan" },
  { color: "#0A2989", name: "color_blue" },
  { color: "#5E43B7", name: "color_purple" },
  { color: "#F55A74", name: "color_pink" },
  { color: "#9D432C", name: "color_brown" },
  { color: "#F7E6DE", name: "color_beige" },
  { color: "#E4BD68", name: "color_gold" },
];

export const inPalette = (color: string): boolean => PALETTE.some((item) => item.color === color);

export interface FilamentDialog {
  kind: "filament";
  /** The slot or external spool sensor. */
  entityId: string;
  title: string;
  /** The slot's filament, where it has a material: "Keep" offers it. */
  keep?: string;
  /** The slot's colour, "#RRGGBB". */
  current?: string;
  /** KEEP, a material, or none chosen yet. */
  material?: string;
  /** The colour chosen, "#RRGGBB". */
  color?: string;
  /** A colour outside the palette: the slot's own, or one picked. */
  custom?: string;
}

/** What the set_filament action is to change: only what differs from the
 * slot's. A colour as [r, g, b]. */
export function filamentChanges(dialog: FilamentDialog): { material?: string; color?: number[] } {
  const material = dialog.material !== undefined && dialog.material !== KEEP ? { material: dialog.material } : {};
  const color = dialog.color;
  const changed = color !== undefined && color !== dialog.current;
  return { ...material, ...(changed ? { color: [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16)) } : {}) };
}

/** The printer information; `copied` while "Copied" shows. */
export interface InfoDialog {
  kind: "info";
  copied?: boolean;
}

/** Dialogs that show the printer's state as it is now: they follow it while open. */
export type StateDialog = { kind: "hms" } | { kind: "firmware" } | InfoDialog;

export type Dialog = ({ kind: "confirm" } & Confirmation) | DryingDialog | SkipDialog | FilamentDialog | StateDialog;

export interface DialogActions {
  close: () => void;
  confirm: () => void;
  /** Takes a drying value; returns the one the dialog holds then. */
  setDrying: (field: DryingField, value: number) => number;
  toggleObject: (id: number) => void;
  setMaterial: (material: string) => void;
  /** A colour of the palette, or the one outside it. */
  setColor: (color: string) => void;
  /** A colour from the browser's colour picker, "#rrggbb". */
  pickColor: (color: string) => void;
  /** Copies a text, an IP address say, to the clipboard. */
  copy: (text: string) => void;
}

function stepper(
  hass: Hass,
  actions: DialogActions,
  options: { label: string; field: DryingField; value: number; unit: string; min: number; max: number; step: number },
): TemplateResult {
  const { label, field, value, unit, min, max, step } = options;
  const id = `dry-${field}`;
  return html`<div class="field">
    <label for=${id}>${label}</label>
    <div class="stepper">
      <button class="btn icon-only" aria-label=${t(hass, "decrease", { what: label })} ?disabled=${value <= min} @click=${() => actions.setDrying(field, value - step)}>
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
      <button class="btn icon-only" aria-label=${t(hass, "increase", { what: label })} ?disabled=${value >= max} @click=${() => actions.setDrying(field, value + step)}>
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
  return dialog.suggested ? html`<p class="dlg-suggested">${icon("check")}<span>${t(hass, "dry_suggested")}</span></p>` : nothing;
}

function dryingContent(hass: Hass, dialog: DryingDialog, actions: DialogActions): TemplateResult {
  return html`<h2 id="dlg-title">${t(hass, "dry_title", { unit: dialog.unit.name })}</h2>
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
  else if (dialog.error) body = html`<div class="dlg-error" role="alert">${icon("error")}<span>${dialog.error}</span></div>`;
  else if (!dialog.objects.length) body = html`<p>${t(hass, "skip_none_listed")}</p>`;
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

/** One colour of the palette: a radio, outlined like a spool. */
function colorOption(dialog: FilamentDialog, actions: DialogActions, color: string, label: string, focusable: boolean): TemplateResult {
  return html`<button
    class="pal ${needsOutline(color) ? "outline" : ""}"
    role="radio"
    aria-checked=${dialog.color === color ? "true" : "false"}
    aria-label=${label}
    title=${label}
    tabindex=${focusable ? 0 : -1}
    style="--c: ${color}"
    @click=${() => actions.setColor(color)}
  ></button>`;
}

/** The arrow keys move through the colours and choose one, as in any
 * group of radios; the tab key stops once, at the chosen colour. */
function paletteKeys(event: KeyboardEvent): void {
  const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
  const radios = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[role=radio]")];
  const index = radios.indexOf(event.target as HTMLElement);
  if (!delta || index < 0) return;
  event.preventDefault();
  const next = radios[(index + delta + radios.length) % radios.length] as HTMLElement;
  next.focus();
  next.click();
}

function filamentContent(hass: Hass, dialog: FilamentDialog, actions: DialogActions): TemplateResult {
  const options = PALETTE.map((item) => ({ color: item.color, label: t(hass, item.name) }));
  const custom = dialog.custom ? { color: dialog.custom, label: t(hass, dialog.custom === dialog.current ? "color_current" : "color_chosen") } : undefined;
  // The chosen colour is the stop in the tab order, else the first.
  const stop = Math.max(0, [...options, ...(custom ? [custom] : [])].findIndex((item) => item.color === dialog.color));
  const picked = (event: Event): void => actions.pickColor((event.target as HTMLInputElement).value);
  return html`<h2 id="dlg-title">${dialog.title}</h2>
    <div class="field">
      <label for="fil-material">${t(hass, "material")}</label>
      <span class="select">
        <select id="fil-material" class=${dialog.material === undefined ? "unset" : ""} @change=${(event: Event) => actions.setMaterial((event.target as HTMLSelectElement).value)}>
          ${dialog.keep === undefined
            ? html`<option value="" disabled .selected=${dialog.material === undefined}>${t(hass, "material_choose")}</option>`
            : html`<option value=${KEEP} .selected=${dialog.material === KEEP}>${t(hass, "material_keep", { name: dialog.keep })}</option>`}
          ${MATERIALS.map((material) => html`<option value=${material} .selected=${dialog.material === material}>${material}</option>`)}
        </select>
        ${icon("chevronDown")}
      </span>
    </div>
    <div class="colors">
      <span class="field-label">${t(hass, "color")}</span>
      <div class="palette" role="radiogroup" aria-label=${t(hass, "color")} @keydown=${paletteKeys}>
        <div class="swatches">${options.map((item, index) => colorOption(dialog, actions, item.color, item.label, index === stop))}</div>
        <div class="other-row">
          ${custom ? colorOption(dialog, actions, custom.color, custom.label, stop === options.length) : nothing}
          <label class="btn plain other-color"
            >${icon("palette")}<span>${t(hass, "color_other")}</span
            ><input type="color" .value=${(dialog.color ?? dialog.custom ?? "#FFFFFF").toLowerCase()} @input=${picked} @change=${picked}
          /></label>
        </div>
      </div>
    </div>
    <p class="dlg-note">${icon("info")}<span>${t(hass, "filament_note")}</span></p>`;
}

/** What the safe and the confirming button say; no confirming button
 * where there is nothing to confirm. `need` says what is missing while the
 * confirming button waits. */
function buttons(ctx: CardContext, dialog: Dialog): { keep: string; confirm?: string; danger: boolean; ready: boolean; need?: string } {
  const { hass } = ctx;
  switch (dialog.kind) {
    case "confirm":
      return { keep: dialog.keep ?? t(hass, "back"), confirm: dialog.confirm, danger: dialog.danger === true, ready: true };
    case "drying":
      return { keep: t(hass, "back"), confirm: t(hass, "dry_start"), danger: false, ready: true };
    case "filament":
      // A material where the slot has none, and a change.
      return {
        keep: t(hass, "back"),
        confirm: t(hass, "filament_set"),
        danger: false,
        ready: dialog.material !== undefined && Object.keys(filamentChanges(dialog)).length > 0,
        // A colour chosen for a slot without a material: it needs one too.
        ...(dialog.material === undefined && dialog.color !== undefined ? { need: t(hass, "filament_need_material") } : {}),
      };
    case "hms":
      return { keep: t(hass, "dismiss"), ...(canClearHms(ctx) ? { confirm: t(hass, "hms_clear") } : {}), danger: false, ready: true };
    case "firmware":
    case "info":
      return { keep: t(hass, "dismiss"), danger: false, ready: false };
    case "skip": {
      if (!dialog.loading && (dialog.error || !dialog.objects.length)) return { keep: t(hass, "dismiss"), danger: true, ready: false };
      const count = dialog.chosen.length;
      const confirm = count === 0 ? t(hass, "skip") : count === 1 ? t(hass, "skip_one") : t(hass, "skip_many", { count });
      return { keep: t(hass, "skip_keep"), confirm, danger: true, ready: count > 0 && !everyObject(dialog) };
    }
  }
}

function content(ctx: CardContext, dialog: Dialog, actions: DialogActions): TemplateResult {
  const { hass } = ctx;
  switch (dialog.kind) {
    case "confirm":
      return html`<h2 id="dlg-title">${dialog.title}</h2>
        <p>${dialog.text}</p>
        ${dialog.note ? html`<p class="dlg-note">${icon("info")}<span>${dialog.note}</span></p>` : nothing}`;
    case "drying":
      return dryingContent(hass, dialog, actions);
    case "filament":
      return filamentContent(hass, dialog, actions);
    case "skip":
      return skipContent(hass, dialog, actions);
    case "hms":
      return hmsContent(ctx);
    case "firmware":
      return firmwareContent(ctx, actions.close);
    case "info":
      return infoContent(ctx, dialog.copied === true, actions.copy);
  }
}

export function dialogView(ctx: CardContext, dialog: Dialog, actions: DialogActions): TemplateResult {
  const { keep, confirm, danger, ready, need } = buttons(ctx, dialog);
  // A tap on the backdrop -- the dialog element itself -- closes it.
  const backdrop = (event: Event): void => {
    if (event.target === event.currentTarget) actions.close();
  };
  return html`<dialog aria-labelledby="dlg-title" @close=${actions.close} @click=${backdrop}>
    <div class="dlg-body">
      ${content(ctx, dialog, actions)}
      <div class="dlg-actions">
        ${need ? html`<span class="dlg-need">${need}</span>` : nothing}
        <button class="btn plain safe" autofocus @click=${actions.close}>${keep}</button>
        ${confirm === undefined
          ? nothing
          : html`<button class="btn ${danger ? "danger" : "primary"}" ?disabled=${!ready} @click=${actions.confirm}>${confirm}</button>`}
      </div>
    </div>
  </dialog>`;
}
