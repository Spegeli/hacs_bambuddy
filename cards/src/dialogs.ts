// The card's dialogs: a confirmation before an action that cannot be taken
// back, the drying settings, the objects of a print to skip, a slot's
// material and colour, and what the head's chips and menu open -- the HMS
// messages, the firmware, the printer information. The safe choice comes
// first and has the focus; it says what stays as it is.
import { html, nothing, type TemplateResult } from "lit";

import type { KProfile, KProfiles, PrintObject } from "./actions";
import { formatFixed, formatTemperature, needsOutline, rgbOf } from "./format";
import { checkContent, type CheckDialog } from "./check";
import { canClearHms, firmwareContent, hmsAnswered, hmsContent, infoContent, storageContent } from "./header";
import { autoOffContent, powerContent } from "./power";
import { maintenanceContent, type MaintenanceDialog } from "./maintenance";
import { icon } from "./icons";
import { t, type TextKey } from "./i18n";
import { actionButton, dialogNote, slotOf, type CardContext, type Confirmation } from "./parts";
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

/** The generic materials the integration sets (Bambu's generic profiles),
 * each with its profile id and the type it gives the slot -- the K profiles
 * of the printer are matched by them. */
const GENERIC: readonly [string, string, string][] = [
  ["PLA", "GFL99", "PLA"],
  ["PLA Silk", "GFL96", "PLA"],
  ["PLA High Speed", "GFL95", "PLA"],
  ["PLA-CF", "GFL98", "PLA-CF"],
  ["PETG", "GFG99", "PETG"],
  ["PETG HF", "GFG96", "PETG"],
  ["PETG-CF", "GFG98", "PETG-CF"],
  ["PCTG", "GFG97", "PCTG"],
  ["ABS", "GFB99", "ABS"],
  ["ASA", "GFB98", "ASA"],
  ["PC", "GFC99", "PC"],
  ["PA", "GFN99", "PA"],
  ["PA-CF", "GFN98", "PA-CF"],
  ["PPA-CF", "GFN97", "PPA-CF"],
  ["PPA-GF", "GFN96", "PPA-GF"],
  ["TPU", "GFU99", "TPU"],
  ["TPU for AMS", "GFU98", "TPU"],
  ["PVA", "GFS99", "PVA"],
  ["HIPS", "GFS98", "HIPS"],
  ["BVOH", "GFS97", "BVOH"],
  ["PE", "GFP99", "PE"],
  ["PE-CF", "GFP98", "PE-CF"],
  ["PP", "GFP97", "PP"],
  ["PP-CF", "GFP96", "PP-CF"],
  ["PP-GF", "GFP95", "PP-GF"],
  ["EVA", "GFR99", "EVA"],
  ["PHA", "GFR98", "PHA"],
  ["PPS", "GFT97", "PPS"],
  ["PPS-CF", "GFT98", "PPS-CF"],
];
export const MATERIALS: readonly string[] = GENERIC.map(([name]) => name);

/** The K profile choice that keeps the slot's own. */
export const K_KEEP = "keep";

/** The printer's default K, where a slot has no profile of its own. */
const DEFAULT_K = 0.02;

/** The material choice that keeps the slot's own. */
export const KEEP = "keep";

/** Bambu's common basic colours, each with its name. */
const PALETTE: readonly { color: string; name: TextKey }[] = [
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
  /** A Bambu spool's chip describes it: the dialog offers only its tools. */
  rfid?: boolean;
  /** An AMS slot (the external spools have no chip reader). */
  ams?: boolean;
  /** A chip spool, as the strip names it: "PLA Basic · 77 %". */
  spool?: string;
  /** The slot feeds the printer now. */
  active?: boolean;
  /** The slot's material type, for matching its K profiles. */
  type?: string;
  /** The printer's K profiles for the slot, while asked "loading", or
   * "failed" when it did not list them. */
  kprofiles?: KProfiles | "loading" | "failed";
  /** The K profile chosen: K_KEEP, "-1" the default, or a profile's index. */
  kprofile?: string;
}

/** What the set_filament action is to change: only what differs from the
 * slot's. A colour as [r, g, b]. */
export function filamentChanges(dialog: FilamentDialog): { material?: string; color?: number[]; k_profile?: number } {
  const material = dialog.material !== undefined && dialog.material !== KEEP ? { material: dialog.material } : {};
  const color = dialog.color;
  const changed = color !== undefined && color !== dialog.current;
  // A K profile chosen that differs from the slot's -- a new material takes
  // the default otherwise, as on the printer's screen.
  const chosen = dialog.kprofile !== undefined && dialog.kprofile !== K_KEEP ? Number(dialog.kprofile) : undefined;
  const current = typeof dialog.kprofiles === "object" ? dialog.kprofiles.current : -1;
  const kChanged = chosen !== undefined && (chosen !== current || "material" in material) && !(chosen === -1 && "material" in material);
  return { ...material, ...(changed ? { color: rgbOf(color) } : {}), ...(kChanged ? { k_profile: chosen } : {}) };
}

/** The printer's first K profile for the material the dialog holds now:
 * a new material takes it, as BamBuddy's own dialog does; none: the
 * printer's default. */
export function matchingProfile(dialog: FilamentDialog): string | undefined {
  const state = dialog.kprofiles;
  if (typeof state !== "object") return undefined;
  const { id, type } = materialType(dialog);
  const found = state.profiles.find(
    (profile) => (id !== undefined && profile.filamentId === id) || (type !== "" && profile.name.toUpperCase().includes(type.toUpperCase())),
  );
  return found ? String(found.index) : undefined;
}

/** The material a slot will hold: the one chosen, else its own. */
function materialType(dialog: FilamentDialog): { type: string; id?: string; name: string } {
  const chosen = GENERIC.find(([name]) => name === dialog.material);
  if (chosen) return { name: chosen[0], id: chosen[1], type: chosen[2] };
  const type = dialog.type ?? "";
  return { name: type, type };
}

/** The printer information; `copied` while "Copied" shows. */
export interface InfoDialog {
  kind: "info";
  copied?: boolean;
}

/** Dialogs that show the printer's state as it is now: they follow it while open. */
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

export interface DialogActions {
  close: () => void;
  confirm: () => void;
  /** Starts the live view anew, at the rate set. */
  restartLive: () => void;
  /** The K profile chosen in the filament dialog. */
  setKProfile: (value: string) => void;
  /** The filament dialog's slot: cleared after a question, its chip read again. */
  resetSlot: () => void;
  refreshRfid: () => void;
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
  /** The maintenance task whose row asks "Mark as done?", or none. */
  confirmTask: (id: number | undefined) => void;
  markDone: (id: number) => void;
  /** Opens or folds a folded line of the connection check. */
  toggleFold: (which: "pass" | "skip") => void;
  /** Now, for the seconds a check runs. */
  now: () => number;
  /** Escape: closes the dialog, or first a question inside it. */
  cancel: (event: Event) => void;
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

/** The printer's K profiles for the slot: its default, those of the
 * material, the others -- as BamBuddy's own dialog offers them. */
function kField(hass: Hass, dialog: FilamentDialog, actions: DialogActions): TemplateResult {
  const state = dialog.kprofiles;
  const profiles = typeof state === "object" ? state.profiles : [];
  const current = typeof state === "object" ? state.current : -1;
  const keeping = dialog.material === KEEP;
  const { name, id, type } = materialType(dialog);
  const matches = (profile: KProfile): boolean =>
    (id !== undefined && profile.filamentId === id) || (type !== "" && profile.name.toUpperCase().includes(type.toUpperCase()));
  const matching = profiles.filter(matches);
  const others = profiles.filter((profile) => !matches(profile)).sort((a, b) => a.name.localeCompare(b.name));
  const label = (profile: KProfile): string => `${profile.name} (K ${formatFixed(hass, profile.k, 3)})`;
  const listed = keeping ? profiles.find((profile) => profile.index === current) : undefined;
  // The slot's own: by its name, by its number where the printer did not
  // list it, unnamed where the printer gave no list at all.
  const keepText = !keeping
    ? undefined
    : listed
      ? t(hass, "k_keep", { profile: label(listed) })
      : current >= 0
        ? t(hass, "k_keep_number", { index: current })
        : state === "failed"
          ? t(hass, "k_keep_plain")
          : undefined;
  const value = dialog.kprofile ?? (keepText ? K_KEEP : "-1");
  const other = others.some((profile) => String(profile.index) === value);
  const option = (profile: KProfile): TemplateResult =>
    html`<option value=${String(profile.index)} .selected=${value === String(profile.index)}>${label(profile)}</option>`;
  return html`<div class="field kfield">
      <label for="fil-k">${t(hass, "k_profile")}</label>
      <span class="select">
        <select id="fil-k" ?disabled=${state === "loading"} @change=${(event: Event) => actions.setKProfile((event.target as HTMLSelectElement).value)}>
          ${state === "loading"
            ? html`<option selected>${t(hass, "k_loading")}</option>`
            : html`${keepText ? html`<option value=${K_KEEP} .selected=${value === K_KEEP}>${keepText}</option>` : nothing}
                <option value="-1" .selected=${value === "-1"}>${t(hass, "k_default", { k: formatFixed(hass, DEFAULT_K, 3) })}</option>
                ${matching.length ? html`<optgroup label=${t(hass, "k_matching", { material: type || name })}>${matching.map(option)}</optgroup>` : nothing}
                ${others.length ? html`<optgroup label=${t(hass, "k_others")}>${others.map(option)}</optgroup>` : nothing}`}
        </select>
        ${icon("chevronDown")}
      </span>
      ${state === "failed"
        ? html`<span class="k-hint">${t(hass, "k_failed")}</span>`
        : typeof state === "object" && !profiles.length
          ? html`<span class="k-hint">${t(hass, "k_none")}</span>`
          : other
            ? html`<span class="k-hint">${t(hass, "k_other_note")}</span>`
            : nothing}
    </div>`;
}

/** What else a slot offers: its chip read again (AMS slots), reset. Both
 * wait for a running print -- drawn from the printer as it is now --; the
 * AMS reads a chip only with nothing loaded. */
function slotTools(ctx: CardContext, dialog: FilamentDialog, actions: DialogActions): TemplateResult {
  const { hass, refs } = ctx;
  const running = ctx.running;
  // The slots that hold filament now, by the names the dialogs give them.
  const loaded = [
    ...refs.ams.flatMap((unit) =>
      unit.slots.filter((entityId) => slotOf(hass, entityId).active).map((entityId) => t(hass, "slot_label", { slot: unit.slots.indexOf(entityId) + 1, unit: unit.name })),
    ),
    ...refs.externalSpools.filter((entityId) => slotOf(hass, entityId).active).map(() => t(hass, "external")),
  ];
  return html`<div class="slot-tools">
      ${dialog.ams ? actionButton({ label: t(hass, "rfid_read"), iconName: "sync", disabled: running || loaded.length > 0, onClick: actions.refreshRfid }) : nothing}
      ${actionButton({ label: t(hass, "slot_reset"), iconName: "restore", disabled: running, onClick: actions.resetSlot })}
    </div>
    ${running
      ? dialogNote(t(hass, "slot_tools_running"))
      : dialog.ams && loaded.length
        ? dialogNote(t(hass, "rfid_unload_hint", { slots: loaded.join(", ") }))
        : nothing}`;
}

function filamentContent(ctx: CardContext, dialog: FilamentDialog, actions: DialogActions): TemplateResult {
  const { hass } = ctx;
  if (dialog.rfid) {
    return html`<h2 id="dlg-title">${dialog.title}</h2>
      <p>${t(hass, "filament_rfid")}</p>
      ${dialog.spool ? html`<p class="rfid-spool">${dialog.spool}</p>` : nothing}
      ${slotTools(ctx, dialog, actions)}`;
  }
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
    ${kField(hass, dialog, actions)}
    ${dialogNote(t(hass, "filament_note"))}
    ${slotTools(ctx, dialog, actions)}`;
}

/** What the safe and the confirming button say; no confirming button
 * where there is nothing to confirm. `need` says what is missing while the
 * confirming button waits. */
function buttons(ctx: CardContext, dialog: Dialog): { keep: string; confirm?: string; danger: boolean; ready: boolean; need?: string; quiet?: boolean } {
  const { hass } = ctx;
  switch (dialog.kind) {
    case "confirm":
      return { keep: dialog.keep ?? t(hass, "cancel"), confirm: dialog.confirm, danger: dialog.danger === true, ready: true };
    case "drying":
      return { keep: t(hass, "cancel"), confirm: t(hass, "dry_start"), danger: false, ready: true };
    case "filament":
      // A Bambu spool: its tools only.
      if (dialog.rfid) return { keep: t(hass, "dismiss"), danger: false, ready: false };
      // A material where the slot has none, and a change.
      return {
        keep: t(hass, "cancel"),
        confirm: t(hass, "filament_set"),
        danger: false,
        ready: dialog.material !== undefined && Object.keys(filamentChanges(dialog)).length > 0,
        // A colour chosen for a slot without a material: it needs one too.
        ...(dialog.material === undefined && dialog.color !== undefined ? { need: t(hass, "filament_need_material") } : {}),
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
      if (!dialog.loading && (dialog.error || !dialog.objects.length)) return { keep: t(hass, "dismiss"), danger: true, ready: false };
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
      return cameraContent(ctx, actions);
    case "maintenance":
      return maintenanceContent(ctx, dialog, actions);
    case "check":
      return checkContent(ctx, dialog, actions, actions.now());
  }
}

/** The live view's frame rate (his word): from 5 to the camera's most, in
 * steps of 5; sent when the taps stop, the stream follows. */
function cameraContent(ctx: CardContext, actions: DialogActions): TemplateResult {
  const { hass, refs } = ctx;
  const number = refs.cameraFps as string;
  const attributes = hass.states[number]?.attributes ?? {};
  const figure = (value: unknown, fallback: number): number => (typeof value === "number" ? value : fallback);
  const set = ctx.targetOf(number);
  // Limits missing: from 5 to the value it has.
  const min = figure(attributes["min"], 5);
  const max = figure(attributes["max"], Math.max(min, set ?? min));
  const step = figure(attributes["step"], 5);
  const value = set ?? max;
  // What arrives, where it is not what the camera asks for.
  const camera = refs.camera ? hass.states[refs.camera]?.attributes : undefined;
  const asked = camera?.["frame_rate"];
  const arriving = camera?.["streamed_frame_rate"];
  const differs = typeof arriving === "number" && typeof asked === "number" && Math.abs(arriving - asked) > 2;
  return html`<h2 id="dlg-title">${t(hass, "fps_title")}</h2>
    <div class="stepper">
      ${actionButton({
        label: t(hass, "fps_lower", { step }),
        iconName: "minus",
        iconOnly: true,
        disabled: value <= min,
        onClick: () => ctx.stepTarget(number, Math.max(min, value - step)),
      })}
      <output class="step-value" aria-live="polite">
        <span aria-hidden="true">${t(hass, "fps_value", { fps: value })}</span><span class="sr-only">${t(hass, "fps_aria", { fps: value })}</span>
      </output>
      ${actionButton({
        label: t(hass, "fps_raise", { step }),
        iconName: "plus",
        iconOnly: true,
        disabled: value >= max,
        onClick: () => ctx.stepTarget(number, Math.min(max, value + step)),
      })}
    </div>
    <p class="hint">${t(hass, "fps_note", { max })}</p>
    ${differs
      ? html`${dialogNote(t(hass, "fps_arriving", { now: arriving }), "warning", "fps-arriving")}
          <button class="btn tonal fps-restart" @click=${actions.restartLive}>${icon("restore")}<span>${t(hass, "fps_restart")}</span></button>`
      : nothing}`;
}

/** The dialogs a press started on the backdrop of: kept on the element, as
 * the card may draw again between the press and the click. */
const pressedBeside = new WeakSet<EventTarget>();

/** The dialog; `notice`: "Sent" or an error, inside it while it is open --
 * the card behind a modal dialog is out of reach. */
export function dialogView(ctx: CardContext, dialog: Dialog, actions: DialogActions, notice: TemplateResult | typeof nothing = nothing): TemplateResult {
  const { keep, confirm, danger, ready, need, quiet } = buttons(ctx, dialog);
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
  const described = question ? (dialog.note ? "dlg-text dlg-note" : "dlg-text") : undefined;
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
        ${need ? html`<span class="dlg-need">${need}</span>` : nothing}
        <button class="btn plain safe" autofocus @click=${actions.close}>${keep}</button>
        ${confirm === undefined
          ? nothing
          : html`<button class="btn ${danger ? "danger" : quiet ? "tonal" : "primary"}" ?disabled=${!ready} @click=${actions.confirm}>${confirm}</button>`}
      </div>
    </div>
  </dialog>`;
}
