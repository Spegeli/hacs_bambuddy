// The card's dialogs: a confirmation before an action that cannot be taken
// back, the drying settings, the objects of a print to skip, a slot's
// filament and colour, and what the head's chips and menu open -- the HMS
// messages, the firmware, the storage, the printer information, the plugs'
// power and the switch-off after the print, the camera's frame rate,
// maintenance, the connection check. The safe choice comes first and has
// the focus; it says what stays as it is.
import { html, nothing, type TemplateResult } from "lit";
import { Directive, directive, type ChildPart } from "lit/directive.js";
import { keyed } from "lit/directives/keyed.js";

import type { FilamentOffer, KProfile, KProfiles, OfferedFilament, PrintObject } from "./actions";
import { formatFixed, formatNumber, formatTemperature, needsOutline, rgbOf } from "./format";
import { checkContent, type CheckDialog } from "./check";
import { canClearHms, firmwareContent, hmsAnswered, hmsContent, infoContent, slotNozzleLines, storageContent } from "./header";
import { autoOffContent, powerContent } from "./power";
import { maintenanceContent, type MaintenanceDialog } from "./maintenance";
import { icon } from "./icons";
import { t, type TextKey } from "./i18n";
import { actionButton, dialogNote, slotOf, slotPlace, stepControl, type CardContext, type Confirmation } from "./parts";
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
}

export interface SkipDialog {
  kind: "skip";
  loading: boolean;
  objects: PrintObject[];
  /** The IDs ticked, in the order of the list. */
  chosen: number[];
  error?: string;
}

/** The K profile choice that keeps the slot's own. */
const K_KEEP = "keep";

/** The printer's default K, where a slot has no profile of its own. */
const DEFAULT_K = 0.02;

/** The vendor or filament choice that keeps the slot's own. */
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
  /** The slot's filament, where it has one: "Keep" offers it. */
  keep?: string;
  /** The slot's colour, "#RRGGBB". */
  current?: string;
  /** KEEP (the slot's filament, its profile outside the offer or not
   * placed yet), a vendor of the offer, or none chosen yet. */
  vendor?: string;
  /** KEEP (the slot's own, under its vendor), a profile id, or none chosen yet. */
  filament?: string;
  /** What Bambu Studio offers the slot, while asked "loading", or "failed"
   * when the integration did not answer. */
  offer?: FilamentOffer | "loading" | "failed";
  /** The colour chosen, "#RRGGBB". */
  color?: string;
  /** A colour outside the palette: the slot's own, or one picked. */
  custom?: string;
  /** A Bambu spool's chip describes it: the dialog offers only its tools. */
  rfid?: boolean;
  /** Nothing describes the spool ("Not set"): there is nothing to reset. */
  empty?: boolean;
  /** An AMS slot (the external spools have no chip reader). */
  ams?: boolean;
  /** A chip spool, as the strip names it: "PLA Basic · 77 %". */
  spool?: string;
  /** The slot feeds the printer now. */
  active?: boolean;
  /** The printer's K profiles for the slot, while asked "loading", or
   * "failed" when it did not list them. */
  kprofiles?: KProfiles | "loading" | "failed";
  /** The printer has not answered for 5 s: BamBuddy asks again. */
  kSlow?: boolean;
  /** This open of the dialog: answers to an earlier one go elsewhere. */
  ask?: number;
  /** The K profile chosen: K_KEEP, "-1" the default, or a profile's index. */
  kprofile?: string;
}

/** The vendor whose filaments hold the slot's own profile, where the offer has it. */
export function ownVendor(dialog: FilamentDialog): string | undefined {
  const offer = dialog.offer;
  if (typeof offer !== "object" || !offer.current) return undefined;
  return offer.vendors.find((vendor) => vendor.filaments.some((item) => item.id === offer.current))?.name;
}

/** The filament chosen from the offer, none while the slot's is kept. */
function chosenFilament(dialog: FilamentDialog): OfferedFilament | undefined {
  const offer = dialog.offer;
  if (typeof offer !== "object" || dialog.filament === undefined || dialog.filament === KEEP) return undefined;
  return offer.vendors.flatMap((vendor) => vendor.filaments).find((item) => item.id === dialog.filament);
}

/** The slot keeps its filament: in the vendor field, or under its vendor. */
const keeping = (dialog: FilamentDialog): boolean => dialog.vendor === KEEP || dialog.filament === KEEP;

/** Bambu Studio offers the slot no filament at all. */
const noOffer = (dialog: FilamentDialog): boolean => typeof dialog.offer === "object" && dialog.offer.vendors.length === 0;

/** Nothing offered, or the offer did not arrive, and no filament to keep:
 * nothing can be set on the slot. */
const nothingToSet = (dialog: FilamentDialog): boolean => (noOffer(dialog) || dialog.offer === "failed") && dialog.keep === undefined;

/** The profile the K profiles are matched by: the chosen one, else the slot's
 * own -- without an offer, the filament its own K profile is filed under. */
function profileId(dialog: FilamentDialog): string | undefined {
  const chosen = chosenFilament(dialog);
  if (chosen) return chosen.id;
  if (!keeping(dialog)) return undefined;
  if (typeof dialog.offer === "object") return dialog.offer.current;
  const k = dialog.kprofiles;
  // A profile filed under no filament matches none.
  return typeof k === "object" ? k.profiles.find((profile) => profile.index === k.current)?.filamentId || undefined : undefined;
}

/** The kept filament as the Filament field names it (no vendor), where the offer has it. */
function keptName(dialog: FilamentDialog): string | undefined {
  const offer = dialog.offer;
  if (typeof offer !== "object" || !offer.current) return undefined;
  return offer.vendors.flatMap((vendor) => vendor.filaments).find((item) => item.id === offer.current)?.name;
}

/** What the set_filament action is to change: only what differs from the
 * slot's. A colour as [r, g, b]. */
export function filamentChanges(dialog: FilamentDialog): { filament?: string; color?: number[]; k_profile?: number } {
  const chosen = chosenFilament(dialog);
  const filament = chosen ? { filament: chosen.id } : {};
  const color = dialog.color;
  const changed = color !== undefined && color !== dialog.current;
  // A K profile chosen that differs from the slot's -- a new filament takes
  // the default otherwise, as on the printer's screen.
  const k = dialog.kprofile !== undefined && dialog.kprofile !== K_KEEP ? Number(dialog.kprofile) : undefined;
  // Not listed, the slot's own profile is not known: the default chosen is a change.
  const current = typeof dialog.kprofiles === "object" ? dialog.kprofiles.current : undefined;
  const kChanged = k !== undefined && (chosen ? k !== -1 : k !== current);
  return { ...filament, ...(changed ? { color: rgbOf(color) } : {}), ...(kChanged ? { k_profile: k } : {}) };
}

/** The printer's first K profile filed under the filament the dialog holds
 * now: a new filament takes it, as Bambu Studio offers them; none: the
 * printer's default. */
export function matchingProfile(dialog: FilamentDialog): string | undefined {
  const state = dialog.kprofiles;
  const id = chosenFilament(dialog)?.id;
  if (typeof state !== "object" || id === undefined) return undefined;
  const found = state.profiles.find((profile) => profile.filamentId === id);
  return found ? String(found.index) : undefined;
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

export interface DialogActions {
  close: () => void;
  confirm: () => void;
  /** The K profile chosen in the filament dialog. */
  setKProfile: (value: string) => void;
  /** The filament dialog's slot: cleared after a question, its chip read again. */
  resetSlot: () => void;
  refreshRfid: () => void;
  /** Takes a drying value; returns the one the dialog holds then. */
  setDrying: (field: DryingField, value: number) => number;
  toggleObject: (id: number) => void;
  /** The filament dialog's vendor, then its filament (KEEP: the slot's own). */
  setVendor: (vendor: string) => void;
  setFilament: (filament: string) => void;
  /** A colour of the palette, or the one outside it. */
  setColor: (color: string) => void;
  /** A colour from the browser's colour picker, "#rrggbb". */
  pickColor: (color: string) => void;
  /** Copies a text, an IP address say, to the clipboard. */
  copy: (text: string) => void;
  /** The maintenance task whose row asks "Mark as done?", or none. */
  confirmTask: (id: number | undefined) => void;
  markDone: (id: number, name: string) => void;
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

/** The printer's K profiles for the slot: its default, the slot's own,
 * and those filed under the filament -- as Bambu Studio offers them. */
function kField(hass: Hass, dialog: FilamentDialog, actions: DialogActions): TemplateResult {
  const state = dialog.kprofiles;
  const profiles = typeof state === "object" ? state.profiles : [];
  const current = typeof state === "object" ? state.current : -1;
  const kept = keeping(dialog) && chosenFilament(dialog) === undefined;
  const id = profileId(dialog);
  const matching = id === undefined ? [] : profiles.filter((profile) => profile.filamentId === id);
  // As the Filament field names it, kept or chosen; the slot's own name where the offer lacks it.
  const name = chosenFilament(dialog)?.name ?? keptName(dialog) ?? dialog.keep ?? "";
  const label = (profile: KProfile): string => `${profile.name} (K ${formatFixed(hass, profile.k, 3)})`;
  const listed = kept ? profiles.find((profile) => profile.index === current) : undefined;
  // The slot's own: by its name, by its number where the printer did not
  // list it, unnamed where the printer gave no list at all.
  const keepText = !kept
    ? undefined
    : listed
      ? t(hass, "k_keep", { profile: label(listed) })
      : current >= 0
        ? t(hass, "k_keep_number", { index: current })
        : state === "failed" || state === "loading"
          ? t(hass, dialog.ams ? "k_keep_plain" : "k_keep_plain_spool")
          : undefined;
  // The slot's own chosen while asked, gone with the answer (it has none): the default it is.
  const value = dialog.kprofile === K_KEEP && !keepText ? "-1" : (dialog.kprofile ?? (keepText ? K_KEEP : "-1"));
  // The kept profile stands at the top: not again in the group.
  const grouped = listed ? matching.filter((profile) => profile.index !== listed.index) : matching;
  // What the field says below itself: while asked, that it is asked; with
  // no profiles, whether the printer has none of its own or did not answer.
  const none = typeof state === "object" && !profiles.length ? state : undefined;
  const hint =
    state === "loading"
      ? html`<div class="k-wait ${dialog.kSlow ? "slow" : ""}"><span class="check-spinner" aria-hidden="true"></span><span>${t(hass, dialog.kSlow ? "k_slow" : "k_loading")}</span></div>`
      : none && !none.answered
        ? dialogNote(t(hass, "k_no_answer"), "warning")
        : none?.diameter !== undefined
          ? dialogNote(t(hass, "k_none_saved", { diameter: `${formatNumber(hass, none.diameter, 2)} mm` }))
          : html`<span class="k-hint">${t(hass, state === "failed" ? (dialog.ams ? "k_failed" : "k_failed_spool") : "k_unsure")}</span>`;
  const option = (profile: KProfile): TemplateResult =>
    html`<option value=${String(profile.index)} .selected=${value === String(profile.index)}>${label(profile)}</option>`;
  return html`<div class="field kfield">
      <label for="fil-k">${t(hass, "k_profile")}</label>
      <span class="select">
        <select id="fil-k" aria-describedby="k-hint" @change=${(event: Event) => actions.setKProfile((event.target as HTMLSelectElement).value)}>
          ${keepText ? html`<option value=${K_KEEP} .selected=${value === K_KEEP}>${keepText}</option>` : nothing}
          <option value="-1" .selected=${value === "-1"}>${t(hass, "k_default", { k: formatFixed(hass, DEFAULT_K, 3) })}</option>
          ${grouped.length ? html`<optgroup label=${t(hass, "k_matching", { material: name })}>${grouped.map(option)}</optgroup>` : nothing}
          ${selectValue(value)}
        </select>
        ${icon("chevronDown")}
      </span>
      <div class="k-hint-box" id="k-hint" aria-live="polite">${hint}</div>
    </div>`;
}

/** Sets the select it stands in to a value, after the options before it. */
class SelectValue extends Directive {
  render(_value: string): typeof nothing {
    return nothing;
  }

  override update(part: ChildPart, [value]: [string]): typeof nothing {
    const select = part.parentNode;
    if (select instanceof HTMLSelectElement && select.value !== value) select.value = value;
    return nothing;
  }
}
const selectValue = directive(SelectValue);

/** Vendor, then filament, as on the printer's screen: what Bambu Studio
 * offers the slot. The slot's own profile is kept under its vendor, or in
 * the vendor field where the offer lacks it (a user's own, an unknown id). */
function filamentFields(hass: Hass, dialog: FilamentDialog, actions: DialogActions): TemplateResult {
  const offer = dialog.offer;
  if (typeof offer === "object" && offer.vendors.length === 0) return dialogNote(t(hass, "offer_empty"));
  const vendors = typeof offer === "object" ? offer.vendors : [];
  const own = ownVendor(dialog);
  // The slot's filament in the vendor field: its profile is not in the offer (or the offer not here).
  const keepVendor = dialog.keep !== undefined && own === undefined;
  const ready = typeof offer === "object";
  const vendor = vendors.find((item) => item.name === dialog.vendor);
  const pick = (event: Event): string => (event.target as HTMLSelectElement).value;
  // A select whose options change is made anew, and its value set after its
  // options (`selectValue`): an inserted option does not always take its
  // "selected".
  return html`<div class="fil-fields"><div class="fil-grid"><div class="field">
      <label for="fil-vendor">${t(hass, "vendor")}</label>
      <span class="select">
        ${keyed(
          ready ? "offer" : String(offer),
          html`<select id="fil-vendor" class=${dialog.vendor === undefined ? "unset" : ""} ?disabled=${!ready} @change=${(event: Event) => actions.setVendor(pick(event))}>
          ${keepVendor
            ? html`<option value=${KEEP} .selected=${dialog.vendor === KEEP}>${t(hass, "material_keep", { name: dialog.keep ?? "" })}</option>`
            : html`<option value="" disabled .selected=${dialog.vendor === undefined}>${t(hass, "material_choose")}</option>`}
          ${vendors.map((item) => html`<option value=${item.name} .selected=${dialog.vendor === item.name}>${item.name}</option>`)}
          ${selectValue(dialog.vendor ?? "")}
        </select>`,
        )}
        ${icon("chevronDown")}
      </span>
    </div>
    ${vendor
      ? html`<div class="field">
          <label for="fil-filament">${t(hass, "filament_field")}</label>
          <span class="select">
            ${keyed(
              vendor.name,
              html`<select id="fil-filament" class=${dialog.filament === undefined ? "unset" : ""} @change=${(event: Event) => actions.setFilament(pick(event))}>
              ${dialog.keep !== undefined && own === vendor.name
                ? html`<option value=${KEEP} .selected=${dialog.filament === KEEP}>${t(hass, "material_keep", { name: dialog.keep })}</option>`
                : html`<option value="" disabled .selected=${dialog.filament === undefined}>${t(hass, "material_choose")}</option>`}
              ${vendor.filaments.map((item) => html`<option value=${item.id} .selected=${dialog.filament === item.id}>${item.name}</option>`)}
              ${selectValue(dialog.filament ?? "")}
            </select>`,
            )}
            ${icon("chevronDown")}
          </span>
        </div>`
      : nothing}</div></div>`;
}

/** What else a slot offers: its chip read again (AMS slots), reset. Both
 * wait for a running print -- drawn from the printer as it is now --; the
 * AMS reads a chip only with nothing loaded. */
function slotTools(ctx: CardContext, dialog: FilamentDialog, actions: DialogActions): TemplateResult {
  const { hass, refs } = ctx;
  const running = ctx.running;
  const external = !dialog.ams;
  // What feeds the printer now -- one slot or spool at most --, as the
  // dialogs name it: the AMS reads a chip only once it is unloaded.
  const slot = refs.ams.flatMap((unit) => unit.slots.flatMap((entityId, index) => (slotOf(hass, entityId).active ? [slotPlace(hass, unit, entityId, index)] : [])))[0];
  const spool = refs.externalSpools.findIndex((entityId) => slotOf(hass, entityId).active);
  const unloadFirst = slot
    ? t(hass, "rfid_unload_hint", { slots: slot })
    : spool < 0
      ? undefined
      : t(hass, refs.externalSpools.length > 1 ? (spool === 0 ? "rfid_unload_hint_left" : "rfid_unload_hint_right") : "rfid_unload_hint_external");
  return html`<div class="slot-tools">
      ${dialog.ams ? actionButton({ label: t(hass, "rfid_read"), iconName: "sync", disabled: running || unloadFirst !== undefined, onClick: actions.refreshRfid }) : nothing}
      ${dialog.empty
        ? nothing
        : actionButton({ label: t(hass, external ? "spool_reset" : "slot_reset"), iconName: "restore", disabled: running, onClick: actions.resetSlot })}
    </div>
    ${running
      ? dialogNote(t(hass, external ? "spool_tools_running" : "slot_tools_running"))
      : dialog.ams && unloadFirst
        ? dialogNote(unloadFirst)
        : nothing}`;
}

/** The nozzle that feeds the slot, under the dialog's title: its side on a
 * printer with two, its diameter and type -- what the offer and the K
 * profiles go by. */
function nozzleLine(ctx: CardContext, dialog: FilamentDialog): TemplateResult | typeof nothing {
  const lines = slotNozzleLines(ctx, dialog.entityId);
  return lines.length ? html`<div class="nozzle-line">${lines.map((line) => html`<span>${icon("nozzle")}${line}</span>`)}</div>` : nothing;
}

function filamentContent(ctx: CardContext, dialog: FilamentDialog, actions: DialogActions): TemplateResult {
  const { hass } = ctx;
  if (dialog.rfid) {
    return html`<h2 id="dlg-title">${dialog.title}</h2>
      ${nozzleLine(ctx, dialog)}
      <p>${t(hass, "filament_rfid")}</p>
      ${dialog.spool ? html`<p class="rfid-spool">${dialog.spool}</p>` : nothing}
      ${slotTools(ctx, dialog, actions)}`;
  }
  // Nothing to set: why (nothing offered, or no list) and the slot's tools.
  if (nothingToSet(dialog)) {
    return html`<h2 id="dlg-title">${dialog.title}</h2>
      ${nozzleLine(ctx, dialog)}
      ${dialogNote(t(hass, dialog.offer === "failed" ? "offer_failed" : "offer_empty"))}
      ${slotTools(ctx, dialog, actions)}`;
  }
  const options = PALETTE.map((item) => ({ color: item.color, label: t(hass, item.name) }));
  const custom = dialog.custom ? { color: dialog.custom, label: t(hass, dialog.custom === dialog.current ? "color_current" : "color_chosen") } : undefined;
  // The chosen colour is the stop in the tab order, else the first.
  const stop = Math.max(0, [...options, ...(custom ? [custom] : [])].findIndex((item) => item.color === dialog.color));
  const picked = (event: Event): void => actions.pickColor((event.target as HTMLInputElement).value);
  return html`<h2 id="dlg-title">${dialog.title}</h2>
    ${nozzleLine(ctx, dialog)}
    ${filamentFields(hass, dialog, actions)}
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
    ${noOffer(dialog) ? nothing : dialogNote(t(hass, dialog.offer === "failed" ? "offer_failed" : "filament_note"))}
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
      // A Bambu spool, or nothing to set: its tools only.
      if (dialog.rfid || nothingToSet(dialog)) return { keep: t(hass, "dismiss"), danger: false, ready: false };
      // A filament -- the slot's kept, or one chosen -- and a change.
      return {
        keep: t(hass, "cancel"),
        confirm: t(hass, "filament_set"),
        danger: false,
        ready: (keeping(dialog) || chosenFilament(dialog) !== undefined) && Object.keys(filamentChanges(dialog)).length > 0,
        // A vendor without its filament, or a colour or K profile for a slot without one: it needs one
        // too -- where Bambu Studio offers one.
        ...(!noOffer(dialog) && !keeping(dialog) && chosenFilament(dialog) === undefined && (dialog.vendor !== undefined || dialog.color !== undefined || dialog.kprofile !== undefined)
          ? { need: t(hass, "filament_need_filament") }
          : {}),
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
  const attributes = hass.states[number]?.attributes ?? {};
  const figure = (value: unknown, fallback: number): number => (typeof value === "number" ? value : fallback);
  const set = ctx.targetOf(number);
  // Limits missing: from 5 to the value it has.
  const min = figure(attributes["min"], 5);
  const max = figure(attributes["max"], Math.max(min, set ?? min));
  const step = figure(attributes["step"], 5);
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
