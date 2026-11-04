// The slot dialog's way of setting a filament: its model (what it holds,
// what Set changes), the vendor and filament fields, the colours, the K
// profile, the slot's tools and the nozzle that feeds the slot.
import { html, nothing, type TemplateResult } from "lit";
import { Directive, directive, type ChildPart } from "lit/directive.js";
import { keyed } from "lit/directives/keyed.js";

import type { FilamentOffer, KProfile, KProfiles, OfferedFilament, SpoolList } from "./actions";
import type { DialogActions } from "./dialogs";
import { formatFixed, formatNumber, needsOutline, rgbOf, stateOf } from "./format";
import { nozzleOf } from "./header";
import { icon } from "./icons";
import { t, type TextKey } from "./i18n";
import { actionButton, dialogNote, printerTitle, sideAt, sideName, slotOf, slotPlace, waitLine, type CardContext, type InventorySpool } from "./parts";
import type { CameraFailure } from "./scan";
import type { Hass } from "./types";

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
  /** The K profile chosen: KEEP, "-1" the default, or a profile's index. */
  kprofile?: string;
  /** Which way the slot is set: its filament, or a spool of BamBuddy's inventory. */
  tab?: "set" | "inventory";
  /** An empty slot, or a chip spool the running print feeds: only the inventory. */
  inventoryOnly?: boolean;
  /** The inventory's spools for the slot, while asked "loading", or
   * "failed" when the integration did not answer. */
  spools?: SpoolList | "loading" | "failed";
  /** The spool chosen in the list. */
  chosenSpool?: number;
  /** The list's filters: a brand (lower case), a material, a storage location; and a search. */
  vendorFilter?: string;
  materialFilter?: string;
  locationFilter?: string;
  search?: string;
  /** A scan of a spool label: in the app's own scanner, in the camera's
   * picture, or the camera area saying why there is no picture. `torch`
   * where the camera has a light. */
  scan?: {
    way: "app" | "live" | "blocked";
    reason?: ScanReason;
    torch?: "on" | "off";
    height?: number;
    streaming?: boolean;
    /** A QR code that is no label is in the picture; one was, earlier. */
    foreign?: boolean;
    foreignSaid?: boolean;
    /** How many photos ended without a spool: the same outcome is said again. */
    tries?: number;
  };
  /** The spool a scan found, as the line above the list names it. */
  scanned?: number;
  /** The number a scan found that the list lacks. */
  scanUnknown?: number;
  /** The search holds what a scan put there ("Nr. 42"), not what the user typed. */
  searchByScan?: boolean;
  /** The filters are unfolded below the search. */
  filtersOpen?: boolean;
}

/** The dialog without its scan: the list shows again. */
export function withoutScan(dialog: FilamentDialog): FilamentDialog {
  const { scan: _scan, ...rest } = dialog;
  return rest;
}

/** The pending key of a slot's filament change, as the Filament tab marks it. */
export const filamentKey = (entityId: string): string => `filament_${entityId}`;

/** Why the camera area shows no picture. */
export type ScanReason = CameraFailure | "insecure" | "no_code" | "not_label";

/** An offered filament by its id. */
const offered = (offer: FilamentOffer, id: string | undefined): OfferedFilament | undefined =>
  id === undefined ? undefined : offer.vendors.flatMap((vendor) => vendor.filaments).find((item) => item.id === id);

/** The vendor whose filaments hold the slot's own profile, where the offer has it. */
export function ownVendor(dialog: FilamentDialog): string | undefined {
  const offer = dialog.offer;
  if (typeof offer !== "object" || !offer.current) return undefined;
  return offer.vendors.find((vendor) => vendor.filaments.some((item) => item.id === offer.current))?.name;
}

/** The filament chosen from the offer, none while the slot's is kept. */
export function chosenFilament(dialog: FilamentDialog): OfferedFilament | undefined {
  const offer = dialog.offer;
  if (typeof offer !== "object" || dialog.filament === undefined || dialog.filament === KEEP) return undefined;
  return offered(offer, dialog.filament);
}

/** The slot keeps its filament: in the vendor field, or under its vendor. */
export const keeping = (dialog: FilamentDialog): boolean => dialog.vendor === KEEP || dialog.filament === KEEP;

/** Bambu Studio offers the slot no filament at all. */
export const noOffer = (dialog: FilamentDialog): boolean => typeof dialog.offer === "object" && dialog.offer.vendors.length === 0;

/** Nothing offered, or the offer did not arrive, and no filament to keep:
 * nothing can be set on the slot. */
export const nothingToSet = (dialog: FilamentDialog): boolean => (noOffer(dialog) || dialog.offer === "failed") && dialog.keep === undefined;

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
  return offered(offer, offer.current)?.name;
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
  const k = dialog.kprofile !== undefined && dialog.kprofile !== KEEP ? Number(dialog.kprofile) : undefined;
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
  const value = dialog.kprofile === KEEP && !keepText ? "-1" : (dialog.kprofile ?? (keepText ? KEEP : "-1"));
  // The kept profile stands at the top: not again in the group.
  const grouped = listed ? matching.filter((profile) => profile.index !== listed.index) : matching;
  // What the field says below itself: while asked, that it is asked; with
  // no profiles, whether the printer has none of its own or did not answer.
  const none = typeof state === "object" && !profiles.length ? state : undefined;
  const hint =
    state === "loading"
      ? waitLine(t(hass, dialog.kSlow ? "k_slow" : "k_loading"), dialog.kSlow ? "slow" : "")
      : none && !none.answered
        ? dialogNote(t(hass, "k_no_answer"), "warning")
        : none?.diameter !== undefined
          ? dialogNote(t(hass, "k_none_saved", { diameter: `${formatNumber(hass, none.diameter, 2)} mm` }))
          : html`<span class="k-hint">${t(hass, state === "failed" ? (dialog.ams ? "k_failed" : "k_failed_spool") : "k_unsure")}</span>`;
  const option = (profile: KProfile): TemplateResult =>
    html`<option value=${String(profile.index)} .selected=${value === String(profile.index)}>${label(profile)}</option>`;
  return html`<div class="field kfield">
      <label for="fil-k">${t(hass, "k_profile")}</label>
      <span class="k-about" id="k-about">${t(hass, "k_about")}</span>
      <span class="select">
        <select id="fil-k" aria-describedby="k-about k-hint" @change=${(event: Event) => actions.setKProfile((event.target as HTMLSelectElement).value)}>
          ${keepText ? html`<option value=${KEEP} .selected=${value === KEEP}>${keepText}</option>` : nothing}
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
export class SelectValue extends Directive {
  render(_value: string): typeof nothing {
    return nothing;
  }

  override update(part: ChildPart, [value]: [string]): typeof nothing {
    const select = part.parentNode;
    if (select instanceof HTMLSelectElement && select.value !== value) select.value = value;
    return nothing;
  }
}
export const selectValue = directive(SelectValue);

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
            ? html`<option value=${KEEP} .selected=${dialog.vendor === KEEP}>${t(hass, "profile_keep")}</option>`
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
      : nothing}</div>${keepVendor && ready && dialog.vendor === KEEP ? html`<p class="fil-keep">${keptProfile(hass, dialog, offer)}</p>` : nothing}</div>`;
}

/** What the kept profile is, where the offer lacks it: none set, one of the
 * user's own that the list does not know (the slot then reads as its
 * type), or a named one not offered for this slot. */
function keptProfile(hass: Hass, dialog: FilamentDialog, offer: FilamentOffer): string {
  const type = slotOf(hass, dialog.entityId).type;
  if (!offer.current) return t(hass, "profile_none", { type });
  const name = dialog.keep ?? "";
  if (!name || name.toLocaleLowerCase() === type.toLocaleLowerCase()) return t(hass, "profile_own", { type });
  return t(hass, "profile_current", { name });
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
export function nozzleLine(ctx: CardContext, dialog: FilamentDialog): TemplateResult | typeof nothing {
  const lines = slotNozzleLines(ctx, dialog.entityId);
  return lines.length ? html`<div class="nozzle-line">${lines.map((line) => html`<span>${icon("nozzle")}${line}</span>`)}</div>` : nothing;
}

/** The filament's way: the vendor and filament, the colour, the K profile;
 * a chip spool's or a slot without an offer's tools only. */
export function filamentBody(ctx: CardContext, dialog: FilamentDialog, actions: DialogActions, spool: InventorySpool | undefined): TemplateResult {
  const { hass } = ctx;
  if (dialog.rfid) {
    // The chip's name and the AMS's estimate -- unless the inventory's box above names the spool.
    return html`<p>${t(hass, spool ? "filament_rfid_linked" : "filament_rfid")}</p>
      ${dialog.spool && !spool ? html`<p class="rfid-spool">${dialog.spool}</p>` : nothing}
      ${slotTools(ctx, dialog, actions)}`;
  }
  // Nothing to set: why (nothing offered, or no list) and the slot's tools.
  if (nothingToSet(dialog)) {
    return html`${dialogNote(t(hass, dialog.offer === "failed" ? "offer_failed" : "offer_empty"))}
      ${slotTools(ctx, dialog, actions)}`;
  }
  const options = PALETTE.map((item) => ({ color: item.color, label: t(hass, item.name) }));
  const custom = dialog.custom ? { color: dialog.custom, label: t(hass, dialog.custom === dialog.current ? "color_current" : "color_chosen") } : undefined;
  // The chosen colour is the stop in the tab order, else the first.
  const stop = Math.max(0, [...options, ...(custom ? [custom] : [])].findIndex((item) => item.color === dialog.color));
  const picked = (event: Event): void => actions.pickColor((event.target as HTMLInputElement).value);
  return html`${spool ? dialogNote(t(hass, "inv_note_change")) : nothing}
    <div class="fil-head">
      <span class="fil-title">${t(hass, "profile_title")}</span>
      <span class="fil-help">${t(hass, "profile_help")}</span>
    </div>
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
    ${dialog.offer === "failed" ? dialogNote(t(hass, "offer_failed")) : nothing}
    ${slotTools(ctx, dialog, actions)}`;
}

/** The slot a running print feeds changes mid-print once anything is to be set. */
export function midPrint(ctx: CardContext, dialog: FilamentDialog): string | undefined {
  const slot = slotOf(ctx.hass, dialog.entityId);
  if (!ctx.running || !slot.active || Object.keys(filamentChanges(dialog)).length === 0) return undefined;
  return t(ctx.hass, "filament_mid_print", { printer: printerTitle(ctx) });
}

/** Each nozzle's diameter and type by its side, on a printer with two. */
function nozzleLines(ctx: CardContext): string[] {
  const { hass, refs } = ctx;
  return refs.nozzles
    .map((_, index) => {
      const parts = nozzleOf(ctx, index);
      return parts ? t(hass, "nozzle_side", { side: sideName(hass, index), nozzle: parts }) : parts;
    })
    .filter(Boolean);
}

/** The nozzle that feeds a slot, for its dialog: "Nozzle: 0.4 mm ·
 * Hardened steel"; on a printer with two the unit's side ("Left nozzle:
 * …") or an external spool's, and both where a unit may feed either (a
 * filament track switch). */
function slotNozzleLines(ctx: CardContext, entityId: string): string[] {
  const { hass, refs } = ctx;
  if (!refs.dual) {
    const parts = nozzleOf(ctx, 0);
    return parts ? [t(hass, "nozzle_side", { side: t(hass, "nozzle"), nozzle: parts })] : [];
  }
  // An external spool's side by its place -- known only while both are.
  if (refs.externalSpools.length !== 2 && refs.externalSpools.includes(entityId)) return nozzleLines(ctx);
  const spool = refs.externalSpools.indexOf(entityId);
  const attribute = stateOf(hass, entityId)?.attributes["nozzle"];
  const side = spool >= 0 ? spool : attribute === "left" ? 0 : attribute === "right" ? 1 : undefined;
  if (side === undefined) return nozzleLines(ctx);
  const parts = nozzleOf(ctx, side);
  return parts ? [t(hass, "nozzle_side", { side: t(hass, `nozzle_${sideAt(side)}`), nozzle: parts })] : [];
}
