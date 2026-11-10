// The slot dialog's way From the inventory: its tabs, the spool assigned,
// the list of BamBuddy's spools with its filters and search, the label
// scan's camera area, and what Assign says before it changes the slot.
import { html, nothing, type TemplateResult } from "lit";

import type { ListedSpool, SpoolList, SpoolPlace } from "./actions";
import type { DialogActions, DialogButtons } from "./dialogs";
import { chosenFilament, selectValue, type FilamentDialog, type ScanReason } from "./filament-dialog";
import { numberAttribute, rgbOf } from "./format";
import { icon } from "./icons";
import { t, type TextKey } from "./i18n";
import { AMS_HT, AMS_LITE, dialogNote, nextIndex, printerTitle, radioLeave, slotOf, spoolDot, spoolLine, waitLine, warnings, type CardContext, type InventorySpool, type Slot, unitLetterTogether } from "./parts";
import type { Hass } from "./types";

const TABS = ["set", "inventory"] as const;

/** The slot dialog shows the inventory's way: an empty slot's or a busy
 * one's, or its tab -- not a chip spool's, and the tab only while spools may
 * be assigned (its content and its buttons ask the same). */
export function onInventory(hass: Hass, dialog: FilamentDialog): boolean {
  if (dialog.rfid) return false;
  return dialog.inventoryOnly === true || (dialog.tab === "inventory" && slotOf(hass, dialog.entityId).assignable);
}

/** The switch between the slot's filament and the inventory: tabs, moved
 * by the arrow keys -- it changes what the dialog shows, it sets nothing. */
export function inventoryTabs(hass: Hass, dialog: FilamentDialog, actions: DialogActions): TemplateResult {
  const chosen = dialog.tab ?? "set";
  const keys = (event: KeyboardEvent): void => {
    const at = TABS.indexOf(chosen);
    const next = nextIndex(event.key, at, TABS.length, "both");
    if (next === undefined) return;
    event.preventDefault();
    const tab = TABS[next] as (typeof TABS)[number];
    const list = (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[role=tab]");
    list[TABS.indexOf(tab)]?.focus();
    actions.setTab(tab);
  };
  return html`<div class="seg inv-switch" role="tablist" aria-label=${t(hass, "inv_tabs")} @keydown=${keys}>
    ${TABS.map(
      (tab) =>
        html`<button
          type="button"
          role="tab"
          id="inv-tab-${tab}"
          aria-controls=${tab === chosen && tab === "inventory" ? "inv-panel" : nothing}
          aria-selected=${tab === chosen ? "true" : "false"}
          tabindex=${tab === chosen ? 0 : -1}
          @click=${() => actions.setTab(tab)}
        >
          ${t(hass, tab === "set" ? "inv_tab_set" : "inv_tab_inventory")}
        </button>`,
    )}
  </div>`;
}

/** The slot's spool from BamBuddy's inventory, whatever the key may; a
 * warning where it is assigned to other slots too. */
export function inventoryCard(ctx: CardContext, spool: InventorySpool, unassign?: () => void): TemplateResult {
  const { hass } = ctx;
  return html`<div class="inv-card">
    <span class="inv-from">${t(hass, "inv_from")}</span>
    <span class="inv-spool">${spoolDot(spool)}<span class="inv-name">${spool.name}</span></span>
    <span class="inv-line">${spoolLine(hass, spool)}</span>
    ${spool.storage ? html`<span class="inv-line">${t(hass, "inv_stored", { location: spool.storage })}</span>` : nothing}
    ${spool.alsoAssigned.map(
      (place) => html`<span class="inv-also">${icon("warning")}<span>${t(hass, "inv_also", { where: place.here ? "" : whereOf(ctx, place).at })}</span></span>`,
    )}
    ${unassign ? html`<button class="inv-unassign" @click=${unassign}>${t(hass, "inv_unassign")}</button>` : nothing}
  </div>`;
}

/** The inventory tab's panel while its list loads or failed. */
const invPanel = (content: TemplateResult): TemplateResult => html`<div id="inv-panel" role="tabpanel" aria-labelledby="inv-tab-inventory">${content}</div>`;

/** Why a scan read no spool, in words. */
const scanReasonText = (hass: Hass, scan: { reason?: ScanReason }): string => t(hass, `inv_scan_${scan.reason ?? "failed"}`);

/** Filters and the search show from this many spools on. */
const SEARCH_FROM = 5;

/** BamBuddy's AMS letters: unit 0-3 AMS A-D, 128-135 AMS HT A-H, 6 the AMS Lite. */
function unitName(amsId: number): string {
  if (amsId === 6) return AMS_LITE;
  // A no-break space: "AMS A" never breaks across lines.
  return amsId >= 128 ? `AMS\u00a0HT\u00a0${String.fromCharCode(65 + amsId - 128)}` : `AMS\u00a0${String.fromCharCode(65 + amsId)}`;
}

/** BamBuddy's global id of a slot, as the slot sensors carry it. */
const globalTray = (amsId: number, trayId: number): number => (amsId >= 128 ? amsId : amsId === 6 ? 24 + trayId : amsId * 4 + trayId);

interface Where {
  /** The list's line: "Zugewiesen: AMS A, Fach 1". */
  line: string;
  /** The place alone: "AMS A, Fach 1", "Desk, AMS A, Fach 1". */
  at: string;
  /** The move's note: "AMS A, Fach 1", "dem Drucker Desk, …". */
  from: string;
}

/** Where a spool of the list sits, in the card's words. */
function whereOf(ctx: CardContext, place: Exclude<SpoolPlace, { here: true }>): Where {
  const { hass, refs } = ctx;
  if (place.samePrinter) {
    if (place.amsId === 255) {
      const sides = refs.externalSpools.length > 1;
      const side = !sides ? "" : place.trayId === 1 ? "_right" : "_left";
      return { line: t(hass, `inv_ext${side}`), at: t(hass, `inv_other_ext${side}`), from: t(hass, `inv_from_ext${side}`) };
    }
    // The unit's name as the card shows it, its slot by the sensor's number.
    const tray = globalTray(place.amsId, place.trayId);
    let unit = place.amsLabel ?? unitName(place.amsId);
    let slot: number | undefined = place.amsId >= 128 ? undefined : place.trayId + 1;
    for (const ams of refs.ams) {
      for (const entityId of ams.slots) {
        if (hass.states[entityId]?.attributes["tray_id"] !== tray) continue;
        unit = place.amsLabel ?? unitLetterTogether(ams.name);
        slot = ams.model === AMS_HT ? undefined : (numberAttribute(hass, entityId, "slot") ?? slot);
      }
    }
    const short = slot === undefined ? unit : t(hass, "inv_other_slot", { unit, slot });
    return { line: slot === undefined ? t(hass, "inv_in_unit", { unit }) : t(hass, "inv_in_slot", { unit, slot }), at: short, from: short };
  }
  // Another printer: BamBuddy's names of its units; its external spools
  // only where the place says the right one.
  const unit = place.amsLabel ?? unitName(place.amsId);
  const at =
    place.amsId === 255
      ? t(hass, place.trayId === 1 ? "inv_other_ext_right" : "inv_other_ext")
      : place.amsId >= 128
        ? unit
        : t(hass, "inv_other_slot", { unit, slot: place.trayId + 1 });
  return {
    line: t(hass, "inv_other", { printer: place.printerName, where: at }),
    at: t(hass, "inv_at_printer", { printer: place.printerName, where: at }),
    from: t(hass, "inv_from_printer", { printer: place.printerName, where: at }),
  };
}

/** Why a spool of the list is greyed out. */
const WHY_NOT: Record<NonNullable<ListedSpool["fits"]>, TextKey> = {
  not_for_ams: "inv_not_ams",
  not_for_nozzle: "inv_not_nozzle",
  not_for_printer: "inv_not_printer",
  by_chip: "inv_by_chip",
  printing: "inv_printing",
};

/** A spool's place line: here, elsewhere, and why it does not fit. "Here"
 * is the slot sensor's spool -- BamBuddy may link or drop one while the
 * list is open; the list's own "this slot" is then the past. */
function placeLine(ctx: CardContext, spool: ListedSpool, assigned: number | undefined): TemplateResult {
  const { hass } = ctx;
  const place = spool.place;
  const here = spool.id === assigned;
  // Its storage location on a line of its own, whether it sits in a slot or not (BamBuddy keeps it).
  const stored = spool.storage ? html`<span class="inv-where stored">${t(hass, "inv_stored", { location: spool.storage })}</span>` : nothing;
  const line = html`${stored}${
    here
      ? html`<span class="inv-where here">${t(hass, "inv_here")}</span>`
      : place && !place.here
        ? html`<span class="inv-where elsewhere">${whereOf(ctx, place).line}</span>`
        : nothing
  }`;
  // Its further slots: BamBuddy can hold a spool in two.
  const more = spool.also.map((other) => (other.here ? nothing : html`<span class="inv-where elsewhere">${whereOf(ctx, other).line}</span>`));
  if (!spool.fits) return html`${line}${more}`;
  const why = WHY_NOT[spool.fits];
  return html`${line}${more}<span class="inv-where off">${t(hass, why, { printer: spool.printing ?? "" })}</span>`;
}

/** The brands of the spools, those that differ only in case as one, in the
 * spelling most spools carry (ties: the first). */
function vendorsOf(spools: ListedSpool[]): [key: string, shown: string][] {
  const counts = new Map<string, Map<string, number>>();
  for (const spool of spools) {
    if (!spool.brand) continue;
    const key = spool.brand.toLocaleLowerCase();
    const spellings = counts.get(key) ?? new Map<string, number>();
    spellings.set(spool.brand, (spellings.get(spool.brand) ?? 0) + 1);
    counts.set(key, spellings);
  }
  return [...counts.entries()]
    .map(([key, spellings]): [string, string] => [key, [...spellings.entries()].reduce((best, item) => (item[1] > best[1] ? item : best))[0]])
    .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: "base" }));
}

/** Whether a spool matches the search, word by word: every word somewhere
 * in its name, brand, material, colour or storage -- in any order, part of
 * a word too; a word of digits its spool number ("5", "Nr. 5", "#5"). */
function matches(spool: ListedSpool, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter((word) => word && !/^(?:nr|no)\.?$/.test(word));
  const text = [spool.name, spool.brand, spool.material, spool.colorName ?? "", spool.storage ?? ""].join(" ").toLocaleLowerCase();
  return words
    .map((word) => word.replace(/^(?:(?:nr|no)\.|#)(?=\d)/, ""))
    .every((word) => (/^\d+$/.test(word) ? spool.id === Number(word) : text.includes(word)));
}

type Facet = "vendor" | "material" | "location";
const FACETS: readonly Facet[] = ["vendor", "material", "location"];
const FACET_OF: Record<Facet, (spool: ListedSpool) => string> = {
  vendor: (spool) => spool.brand.toLocaleLowerCase(),
  material: (spool) => spool.material,
  location: (spool) => spool.storage ?? "",
};

interface Filters {
  chosen: Record<Facet, string>;
  vendors: [key: string, shown: string][];
  materials: string[];
  locations: string[];
}

/** The filters narrow each other: each offers what the spools the others
 * leave have; a choice the others no longer leave (the inventory changed
 * meanwhile) counts as all. The search narrows none of them: the lists
 * would jump while typing. A vendor keeps the spelling most of all its
 * spools carry. */
function filtersOf(dialog: FilamentDialog, list: SpoolList): Filters {
  const wanted: Record<Facet, string> = { vendor: dialog.vendorFilter ?? "", material: dialog.materialFilter ?? "", location: dialog.locationFilter ?? "" };
  const passes = (spool: ListedSpool, chosen: Record<Facet, string>, skip: Facet): boolean =>
    FACETS.every((facet) => facet === skip || !chosen[facet] || FACET_OF[facet](spool) === chosen[facet]);
  const offered = (chosen: Record<Facet, string>, facet: Facet): Set<string> =>
    new Set(list.spools.filter((spool) => passes(spool, chosen, facet)).map(FACET_OF[facet]).filter(Boolean));
  const chosen = { ...wanted };
  for (const facet of FACETS) if (chosen[facet] && !offered(wanted, facet).has(chosen[facet])) chosen[facet] = "";
  const sorted = (values: Set<string>): string[] => [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
  const vendors = offered(chosen, "vendor");
  return {
    chosen,
    vendors: vendorsOf(list.spools).filter(([key]) => vendors.has(key)),
    materials: sorted(offered(chosen, "material")),
    locations: sorted(offered(chosen, "location")),
  };
}

/** One of the inventory's filters: its label, "all" and its choices
 * (value, shown); the location's takes the whole row. */
function filterSelect(
  hass: Hass,
  facet: Facet,
  label: TextKey,
  options: readonly (readonly [string, string])[],
  chosen: string,
  wide: boolean,
  actions: DialogActions,
): TemplateResult {
  return html`<label class="field${wide ? " inv-wide" : ""}"
    ><span class="field-label">${t(hass, label)}</span>
    <span class="select"
      ><select id="inv-${facet}" @change=${(event: Event) => actions.filterSpools(facet, (event.target as HTMLSelectElement).value)}>
        <option value="" .selected=${!chosen}>${t(hass, "inv_all")}</option>
        ${options.map(([key, name]) => html`<option value=${key} .selected=${chosen === key}>${name}</option>`)}
        ${selectValue(chosen)}
      </select>
      ${icon("chevronDown")}</span
    ></label
  >`;
}

/** The spools the filters and the search leave, by material, the slot's own first in its group. */
function shownSpools(dialog: FilamentDialog, list: SpoolList, assigned: number | undefined, filters: Filters): [material: string, spools: ListedSpool[]][] {
  const left = list.spools.filter(
    (spool) =>
      FACETS.every((facet) => !filters.chosen[facet] || FACET_OF[facet](spool) === filters.chosen[facet]) && matches(spool, dialog.search ?? ""),
  );
  const groups = new Map<string, ListedSpool[]>();
  for (const spool of left) groups.set(spool.material, [...(groups.get(spool.material) ?? []), spool]);
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
    .map(([material, spools]): [string, ListedSpool[]] => [material, [...spools].sort((a, b) => Number(b.id === assigned) - Number(a.id === assigned))]);
}

/** Why the chosen spool cannot be assigned now: a filament change under
 * way. The slot a running print feeds takes one too, as in BamBuddy. */
function slotBusy(ctx: CardContext): string | undefined {
  const printer = printerTitle(ctx);
  return ctx.changing ? t(ctx.hass, "inv_busy_change", { printer }) : undefined;
}

/** The list's keys: the arrows choose the next spool that fits, Home and End
 * the first and the last; Tab leaves from the chosen one. */
function spoolKeys(actions: DialogActions): (event: KeyboardEvent) => void {
  return (event) => {
    const group = event.currentTarget as HTMLElement;
    const rows = [...group.querySelectorAll<HTMLElement>(".inv-row:not([aria-disabled=true])")];
    const at = rows.indexOf(event.target as HTMLElement);
    const index = at >= 0 ? at : rows.findIndex((row) => row.getAttribute("aria-checked") === "true");
    const to = nextIndex(event.key, index, rows.length, "both");
    if (index < 0 || to === undefined || rows.length === 0) return;
    event.preventDefault();
    const next = rows[to] as HTMLElement;
    next.focus();
    actions.chooseSpool(Number(next.dataset["spool"]));
  };
}

function spoolRow(ctx: CardContext, dialog: FilamentDialog, actions: DialogActions, spool: ListedSpool, stop: boolean, assigned: number | undefined): TemplateResult {
  const { hass } = ctx;
  const chosen = dialog.chosenSpool === spool.id;
  const off = spool.fits !== undefined;
  const choose = (): void => {
    if (!off) actions.chooseSpool(spool.id);
  };
  const press = (event: KeyboardEvent): void => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    choose();
  };
  return html`<div
    class="inv-row ${chosen ? "chosen" : ""}"
    role="radio"
    data-spool=${spool.id}
    aria-checked=${chosen ? "true" : "false"}
    aria-disabled=${off ? "true" : "false"}
    tabindex=${off ? nothing : stop ? 0 : -1}
    @click=${choose}
    @keydown=${press}
  >
    ${spoolDot(spool)}
    <span class="inv-row-text">
      <span class="inv-name">${spool.name}</span>
      <span class="inv-line">${spoolLine(hass, spool)}</span>
      ${placeLine(ctx, spool, assigned)}
    </span>
  </div>`;
}

/** The camera area of a scan, in the place of the filters, the search and
 * the list: the camera's picture, or why there is none and a photo instead. */
function cameraArea(hass: Hass, dialog: FilamentDialog, actions: DialogActions): TemplateResult {
  const scan = dialog.scan as NonNullable<FilamentDialog["scan"]>;
  const photo = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // The same photo again is a new choice.
    input.value = "";
    if (file) actions.takePhoto(file);
  };
  return html`<div class="inv-camera" style=${scan.height ? `min-height: min(${scan.height}px, 60dvh)` : ""}>
    ${scan.way === "live"
      ? html`<div class="inv-camera-view">
            <video playsinline muted autoplay .muted=${true}></video>
            <div class="inv-camera-frame" aria-hidden="true"></div>
          </div>
          <p class="inv-camera-help">${t(hass, scan.foreign ? "inv_scan_not_label" : "inv_scan_help")}</p>`
      : html`<div class="inv-camera-blocked">
          <p class="inv-camera-reason">${scanReasonText(hass, scan)}</p>
          <label class="btn tonal inv-photo"
            >${icon("camera")}<span>${t(hass, "inv_scan_photo")}</span
            ><input type="file" accept="image/*" capture="environment" @change=${photo}
          /></label>
        </div>`}
    <div class="inv-camera-actions">
      ${scan.torch
        ? html`<button class="btn plain" aria-pressed=${scan.torch === "on" ? "true" : "false"} @click=${actions.toggleTorch}>
            ${icon("flashlight")}<span>${t(hass, "inv_scan_torch")}</span>
          </button>`
        : nothing}
      <button class="btn tonal inv-camera-close" @click=${actions.closeScan}>${t(hass, "inv_scan_close")}</button>
    </div>
  </div>`;
}

/** Whether the camera area stands in the list's place. */
const cameraOpen = (dialog: FilamentDialog): boolean => dialog.scan !== undefined && dialog.scan.way !== "app";

/** What the inventory's one live region says: the camera on (once its
 * picture comes), why it is not, the spool a scan found or the number it
 * lacks, what a search found. One region that stays: one put in with its
 * text is often not read. */
function listSays(hass: Hass, dialog: FilamentDialog, shown: number): string {
  const scan = dialog.scan;
  if (scan?.way === "live") {
    if (scan.foreign) return t(hass, "inv_scan_not_label");
    return scan.streaming && !scan.foreignSaid ? t(hass, "inv_scan_on") : "";
  }
  // A zero-width space every other photo: the same text again is read again.
  if (scan?.way === "blocked") return scanReasonText(hass, scan) + ((scan.tries ?? 0) % 2 ? "\u200b" : "");
  if (dialog.scanned !== undefined) return t(hass, "inv_scan_done", { id: dialog.scanned });
  if (dialog.scanUnknown !== undefined) return t(hass, "inv_scan_unknown", { id: dialog.scanUnknown });
  if (!dialog.listSaid) return "";
  if (shown === 0) return t(hass, "inv_no_hit");
  return shown === 1 ? t(hass, "inv_found_one") : t(hass, "inv_found", { count: shown });
}

/** The spools of the inventory for the slot: filters, a search, the list
 * in a box that scrolls on its own (the one such box of the card's dialogs:
 * the head and the buttons stay in reach), and its notes. */
export function inventoryContent(ctx: CardContext, dialog: FilamentDialog, actions: DialogActions, slot: Slot): TemplateResult {
  const { hass } = ctx;
  const list = dialog.spools;
  if (list === undefined || list === "loading") {
    return invPanel(waitLine(t(hass, "inv_loading"), "inv-wait"));
  }
  if (list === "failed") {
    return invPanel(dialogNote(t(hass, "inv_failed"), "warning"));
  }
  const assigned = slot.inventory?.id;
  const searchable = list.spools.length >= SEARCH_FROM;
  const filters = filtersOf(dialog, list);
  /** How many filters are set: the folded button shows it. */
  const set = Object.values(filters.chosen).filter(Boolean).length;
  const groups = shownSpools(dialog, list, assigned, filters);
  const shown = groups.flatMap(([, spools]) => spools);
  const choosable = shown.filter((spool) => spool.fits === undefined);
  const stop = choosable.find((spool) => spool.id === dialog.chosenSpool)?.id ?? choosable[0]?.id;
  const chosen = list.spools.find((spool) => spool.id === dialog.chosenSpool);
  const elsewhere = chosen && chosen.id !== assigned && chosen.place && !chosen.place.here ? whereOf(ctx, chosen.place).from : undefined;
  // Named here: TypeScript keeps the narrowing of list in the inner listContent only so.
  const all = list.spools;
  return html`<div id="inv-panel" role="tabpanel" aria-labelledby="inv-tab-inventory" class="inv-panel">
    <p class="sr-only inv-say" aria-live="polite">${listSays(hass, dialog, shown.length)}</p>
    ${cameraOpen(dialog) ? cameraArea(hass, dialog, actions) : listContent()}
  </div>`;

  function listContent(): TemplateResult {
    return html`${searchable
      ? html`<div class="inv-search-row">
            <span class="inv-search-box">
              <span class="inv-search-icon" aria-hidden="true">${icon("magnify")}</span>
              <input
                id="inv-search"
                class="inv-search"
                type="search"
                aria-label=${t(hass, "inv_search")}
                placeholder=${t(hass, "inv_search")}
                .value=${dialog.search ?? ""}
                @input=${(event: Event) => actions.searchSpools((event.target as HTMLInputElement).value)}
              />
            </span>
            <button
              class="inv-filter ${dialog.filtersOpen ? "on" : ""}"
              aria-label=${set ? t(hass, "inv_filter_set", { count: set }) : t(hass, "inv_filter")}
              title=${t(hass, "inv_filter")}
              aria-expanded=${dialog.filtersOpen ? "true" : "false"}
              aria-controls=${dialog.filtersOpen ? "inv-filters" : nothing}
              @click=${actions.toggleFilters}
            >
              ${icon("tune")}${set ? html`<span class="inv-filter-count" aria-hidden="true">${set}</span>` : nothing}
            </button>
            <button
              class="inv-scan"
              aria-label=${t(hass, "inv_scan")}
              title=${t(hass, "inv_scan")}
              ?disabled=${ctx.changing}
              @click=${actions.startScan}
            >
              ${icon("qrcodeScan")}
            </button>
          </div>
          ${dialog.filtersOpen ? html`<div class="inv-filters" id="inv-filters">
            ${filterSelect(hass, "vendor", "inv_vendor", filters.vendors, filters.chosen.vendor, false, actions)}
            ${filterSelect(hass, "material", "inv_material", filters.materials.map((material) => [material, material]), filters.chosen.material, false, actions)}
            ${all.some((spool) => spool.storage)
              ? filterSelect(hass, "location", "inv_location", filters.locations.map((location) => [location, location]), filters.chosen.location, true, actions)
              : nothing}
          </div>` : nothing}`
      : nothing}
    ${dialog.scanned !== undefined
      ? html`<p class="inv-scanned">${icon("check")}<span>${t(hass, "inv_scan_done", { id: dialog.scanned })}</span></p>`
      : nothing}
    ${dialog.scanUnknown !== undefined ? dialogNote(t(hass, "inv_scan_unknown", { id: dialog.scanUnknown }), "warning") : nothing}
    ${shown.length
      ? html`<div
          class="inv-list ${shown.length > 3 ? "many" : ""}"
          role="radiogroup"
          aria-label=${t(hass, "inv_choose")}
          @keydown=${spoolKeys(actions)}
          @focusout=${radioLeave}
        >
          ${groups.map(
            ([material, spools]) =>
              html`<div class="inv-group" aria-hidden="true">${material}</div>
                ${spools.map((spool) => spoolRow(ctx, dialog, actions, spool, spool.id === stop, assigned))}`,
          )}
        </div>`
      : dialogNote(t(hass, "inv_no_hit"))}
    ${elsewhere ? dialogNote(t(hass, "inv_takes_from", { where: elsewhere })) : nothing}
    ${slot.empty ? dialogNote(t(hass, "inv_empty_slot")) : nothing}`;
  }
}

/** The warning that Set ends the slot's spool assignment. BamBuddy keeps
 * it while the slot reports the colour and type it matched it with, or the
 * spool's own colour with one of its types (colours within 50 of each
 * other, as its colors_similar); a spool assigned to an empty slot sets the
 * slot itself. */
export function assignmentEndsWarning(ctx: CardContext, dialog: FilamentDialog): string | undefined {
  const slot = slotOf(ctx.hass, dialog.entityId);
  const spool = slot.inventory;
  const chosen = chosenFilament(dialog);
  const changed = (dialog.color !== undefined && dialog.color !== dialog.current) || chosen !== undefined;
  if (!spool || !spool.assignedType || !changed) return undefined;
  const colour = dialog.color ?? dialog.current ?? "";
  const type = (chosen?.type ?? slot.type).toUpperCase();
  const keeps =
    (similarColors(colour, spool.assignedColor) && type === spool.assignedType.toUpperCase()) ||
    (similarColors(colour, spool.rgba ?? "FFFFFFFF") && spool.spoolTypes.includes(type));
  return keeps ? undefined : t(ctx.hass, "inv_warn_change", { name: spool.name });
}

/** BamBuddy's colors_similar: RGB at most 50 apart, alpha ignored. */
function similarColors(a: string, b: string): boolean {
  // "#RRGGBB" or "RRGGBBAA": its first six digits.
  const rgb = (hex: string): number[] | undefined => {
    const digits = hex.replace(/^#/, "");
    return /^[0-9a-f]{6}/i.test(digits) ? rgbOf(`#${digits.slice(0, 6)}`) : undefined;
  };
  const [x, y] = [rgb(a), rgb(b)];
  if (!x || !y) return false;
  const [r1 = 0, g1 = 0, b1 = 0] = x;
  const [r2 = 0, g2 = 0, b2 = 0] = y;
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2) <= 50;
}

/** The inventory's buttons: Assign once another spool is chosen (and the
 * slot may take it now), Remove assignment where the slot has one. */
export function inventoryButtons(ctx: CardContext, dialog: FilamentDialog): DialogButtons {
  const { hass } = ctx;
  const slot = slotOf(hass, dialog.entityId);
  if (!slot.assignable) return { keep: t(hass, "dismiss"), danger: false, ready: false };
  const list = typeof dialog.spools === "object" ? dialog.spools : undefined;
  // The sensor's spool: BamBuddy may link or drop one while the list is open.
  const assigned = slot.inventory?.id;
  const chosen = list?.spools.find((spool) => spool.id === dialog.chosenSpool);
  // While the camera shows, the list is hidden: nothing it hides is
  // assigned, and nothing is said of a choice out of sight.
  if (cameraOpen(dialog)) {
    return { keep: t(hass, "cancel"), confirm: t(hass, "inv_assign"), danger: false, ready: false };
  }
  const busy = slotBusy(ctx);
  const ready = chosen !== undefined && chosen.id !== assigned && chosen.fits === undefined && busy === undefined;
  return {
    keep: t(hass, "cancel"),
    confirm: t(hass, "inv_assign"),
    danger: false,
    ready,
    ...(busy && chosen !== undefined && chosen.id !== assigned ? { need: busy } : {}),
    ...(chosen !== undefined && chosen.id !== assigned ? warnings(otherMaterialWarning(ctx, slot, chosen) ?? printingSlot(ctx, slot)) : {}),
  };
}

/** Another material than the slot's: assigning sets the slot to it -- in a
 * running print, mid-print. Compared by the type BamBuddy reduces it to; an
 * empty slot is set from whatever comes. */
function otherMaterialWarning(ctx: CardContext, slot: Slot, spool: ListedSpool): string | undefined {
  const current = slot.type.toUpperCase();
  if (slot.empty || !current || !spool.type) return undefined;
  const same = current === spool.type || current.startsWith(`${spool.type}-`);
  if (same) return undefined;
  const values = { material: spool.type, slot: slot.type, printer: printerTitle(ctx) };
  return t(ctx.hass, ctx.running && slot.active ? "inv_warn_material_printing" : "inv_warn_material", values);
}

/** The slot a running print feeds: any spool assigned there changes it
 * mid-print -- its colour and profile, where the material stays. */
function printingSlot(ctx: CardContext, slot: Slot): string | undefined {
  if (!ctx.running || !slot.active || slot.empty) return undefined;
  return t(ctx.hass, "inv_warn_printing", { printer: printerTitle(ctx) });
}
