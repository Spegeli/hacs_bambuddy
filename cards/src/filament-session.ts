// The slot dialog's data: what it opens with, the answers it waits for
// (Bambu Studio's offer, the K profiles, the inventory's spools), each into
// the dialog of its own open, and what its fields change.
import { filamentOffer, kProfiles, spoolList } from "./actions";
import type { Dialog, DialogActions } from "./dialogs";
import { filamentKey, inPalette, KEEP, matchingProfile, ownVendor, withoutScan, type FilamentDialog } from "./filament-dialog";
import { formatPercent, stateOf } from "./format";
import { t } from "./i18n";
import type { Slot } from "./parts";
import type { Hass, PrinterRefs } from "./types";

/** The slot dialog's K field says the printer is slow after this long:
 * BamBuddy asks it again then (its 5 s per try). */
const K_SLOW_MS = 5000;

/** The room a dialog leaves on the screen, above and below (styles: 100dvh - 48px). */
const DIALOG_MARGIN = 48;

/** What the slot dialog's data needs of the card. */
export interface FilamentHost {
  hass: () => Hass;
  refs: () => PrinterRefs | undefined;
  /** The card's shadow root: Lit renders into one. */
  root: () => ShadowRoot;
  updateComplete: () => Promise<boolean>;
  dialog: () => Dialog | undefined;
  setDialog: (dialog: Dialog) => void;
  /** The dialog a question parked: Cancel comes back to it. */
  dialogBack: () => Dialog | undefined;
  setDialogBack: (dialog: Dialog) => void;
  /** A question opens over the open dialog: Cancel comes back to it. */
  parkDialog: () => void;
  /** A question opens: an earlier "Sent" would read as its answer. */
  dropSent: () => void;
  closeDialog: () => void;
  run: (key: string, domain: string, service: string, data: Record<string, unknown>) => Promise<boolean>;
}

/** The slot dialog's fields and its inventory tab, as the dialog calls them. */
type FilamentActions = Pick<
  DialogActions,
  | "setVendor"
  | "setFilament"
  | "setKProfile"
  | "resetSlot"
  | "refreshRfid"
  | "setColor"
  | "pickColor"
  | "setTab"
  | "chooseSpool"
  | "filterSpools"
  | "searchSpools"
  | "toggleFilters"
  | "unassign"
>;

export class FilamentSession {
  private kSlowTimer?: ReturnType<typeof setTimeout>;
  /** The slot dialog's opens, counted: each its own answers. */
  private asks = 0;

  constructor(private readonly host: FilamentHost) {}

  /** A new ask: what an earlier open still waits for answers that one, not this. */
  nextAsk(): number {
    return ++this.asks;
  }

  /** The dialog that sets a slot's filament: its own kept where it has
   * one, its colour chosen -- also one outside the palette. */
  openFilament(slot: Slot, title: string, inventoryOnly = false): void {
    const hass = this.host.hass();
    const refs = this.host.refs() as PrinterRefs;
    // A slot with a filament always has a name: its state at least.
    const keep = slot.type ? slot.name : undefined;
    const current = slot.color?.toUpperCase();
    const opened: FilamentDialog = {
      kind: "filament",
      entityId: slot.entityId,
      title,
      ...(keep ? { keep, vendor: KEEP } : {}),
      ...(current ? { current, color: current, ...(inPalette(current) ? {} : { custom: current }) } : {}),
      rfid: slot.rfid,
      ...(slot.empty ? { empty: true } : {}),
      ams: !refs.externalSpools.includes(slot.entityId),
      active: slot.active,
      ...(slot.rfid ? { spool: [slot.name, slot.remaining === undefined ? "" : formatPercent(hass, slot.remaining)].filter(Boolean).join(" · ") } : {}),
      ...(slot.rfid || inventoryOnly ? {} : { kprofiles: "loading" as const, offer: "loading" as const }),
      ...(inventoryOnly ? { inventoryOnly: true, tab: "inventory" as const } : {}),
      ask: this.nextAsk(),
    };
    this.host.setDialog(opened);
    clearTimeout(this.kSlowTimer);
    if (inventoryOnly && slot.assignable) this.startSpools(opened);
    if (!slot.rfid && !inventoryOnly) {
      const ask = opened.ask as number;
      void this.loadOffer(slot.entityId, ask);
      void this.loadKProfiles(slot.entityId, ask);
      this.armKSlow(slot.entityId, ask);
    }
  }

  /** The K field says the printer is slow once K_SLOW_MS passed without its profiles. */
  armKSlow(entityId: string, ask: number): void {
    clearTimeout(this.kSlowTimer);
    this.kSlowTimer = setTimeout(() => this.markKSlow(entityId, ask), K_SLOW_MS);
  }

  /** The inventory's spools for the slot dialog's slot, asked once per open. */
  private startSpools(dialog: FilamentDialog): void {
    const ask = dialog.ask as number;
    const open = this.host.dialog();
    if (this.isAsk(open, dialog.entityId, ask)) this.host.setDialog({ ...open, spools: "loading" });
    void this.loadSpools(dialog.entityId, ask);
  }

  async loadSpools(entityId: string, ask: number): Promise<void> {
    // Asked once more on its own, as BamBuddy's own page does: a moment's
    // hiccup then never shows.
    let found: FilamentDialog["spools"] = "failed";
    for (let attempt = 0; attempt < 2 && found === "failed"; attempt += 1) {
      try {
        found = (await spoolList(this.host.hass(), entityId)) ?? "failed";
      } catch {
        found = "failed";
      }
    }
    const placed = (open: FilamentDialog): FilamentDialog => {
      const list = typeof found === "object" ? found : undefined;
      const chosen = open.chosenSpool ?? list?.assigned;
      return { ...open, spools: found, ...(chosen !== undefined ? { chosenSpool: chosen } : {}) };
    };
    // Also into the dialog a question parked meanwhile.
    if (this.placeAnswer(entityId, ask, placed)) {
      // The slot's own spool in the list's view: it may sit far down.
      void this.host
        .updateComplete()
        .then(() => this.host.root().querySelector<HTMLElement>('dialog .inv-row[aria-checked="true"]')?.scrollIntoView?.({ block: "nearest" }));
    }
  }

  /** The printer has not answered for a while: the K field says BamBuddy
   * asks again -- also in a dialog a question parked meanwhile. */
  private markKSlow(entityId: string, ask: number): void {
    const slow = (open: FilamentDialog): FilamentDialog => (open.kprofiles === "loading" ? { ...open, kSlow: true } : open);
    this.placeAnswer(entityId, ask, slow);
  }

  /** The slot dialog of this open: a late answer to an earlier one stays out. */
  private isAsk(dialog: Dialog | undefined, entityId: string, ask: number): dialog is FilamentDialog {
    return dialog?.kind === "filament" && dialog.entityId === entityId && dialog.ask === ask;
  }

  /** An answer for this open goes into its dialog where it shows, and into
   * the one a question parked; whether the dialog shown took it. */
  private placeAnswer(entityId: string, ask: number, change: (open: FilamentDialog) => FilamentDialog): boolean {
    const dialog = this.host.dialog();
    const shown = this.isAsk(dialog, entityId, ask);
    if (shown) this.host.setDialog(change(dialog));
    const back = this.host.dialogBack();
    if (this.isAsk(back, entityId, ask)) this.host.setDialogBack(change(back));
    return shown;
  }

  /** What Bambu Studio offers the open filament dialog's slot: the slot's
   * own profile placed under its vendor once it comes. */
  async loadOffer(entityId: string, ask: number): Promise<void> {
    let found: FilamentDialog["offer"];
    try {
      found = (await filamentOffer(this.host.hass(), entityId)) ?? "failed";
    } catch {
      found = "failed";
    }
    const placed = (open: FilamentDialog): FilamentDialog => {
      const next = { ...open, offer: found };
      const own = ownVendor(next);
      return open.vendor === KEEP && own !== undefined ? { ...next, vendor: own, filament: KEEP } : next;
    };
    // Also into the dialog a question parked meanwhile (reset, then Cancel).
    this.placeAnswer(entityId, ask, placed);
  }

  /** The printer's K profiles for the open filament dialog's slot: none
   * where the printer gives none, or the call fails. */
  async loadKProfiles(entityId: string, ask: number): Promise<void> {
    let found: FilamentDialog["kprofiles"];
    try {
      found = await kProfiles(this.host.hass(), entityId);
    } catch {
      found = "failed";
    }
    // A new filament chosen while the list came takes its first matching
    // profile now, as it would have then.
    const listed = (open: FilamentDialog): FilamentDialog => {
      const next = { ...open, kprofiles: found };
      return open.filament !== undefined && open.filament !== KEEP && open.kprofile === undefined ? { ...next, kprofile: matchingProfile(next) } : next;
    };
    // Also into the dialog a question parked meanwhile (reset, then Cancel).
    this.placeAnswer(entityId, ask, listed);
  }

  /** The filament dialog's slot cleared, after a question that comes back
   * to the dialog on Cancel. */
  private resetSlot(): void {
    const dialog = this.host.dialog();
    if (dialog?.kind !== "filament") return;
    const hass = this.host.hass();
    this.host.parkDialog();
    this.host.dropSent();
    // The slot a paused print feeds from: said.
    const status = stateOf(hass, (this.host.refs() as PrinterRefs).status)?.state;
    const external = !dialog.ams;
    // An external spool is no slot.
    const text = t(hass, external ? "reset_text_spool" : "reset_text");
    const inUse = t(hass, external ? "reset_in_use_spool" : "reset_in_use");
    this.host.setDialog({
      kind: "confirm",
      title: t(hass, external ? "reset_title_spool" : "reset_title"),
      text: dialog.active && status === "paused" ? `${text} ${inUse}` : text,
      confirm: t(hass, "reset_confirm"),
      danger: true,
      action: ["bambuddy", "reset_slot", { entity_id: dialog.entityId }],
      key: `reset_${dialog.entityId}`,
    });
  }

  /** The AMS reads the filament dialog's spool's chip again. */
  private refreshRfid(): void {
    const dialog = this.host.dialog();
    if (dialog?.kind !== "filament") return;
    this.host.closeDialog();
    void this.host.run(`rfid_${dialog.entityId}`, "bambuddy", "refresh_rfid", { entity_id: dialog.entityId });
  }

  /** Changes the open filament dialog. */
  private editFilament(change: Partial<FilamentDialog>): void {
    this.host.setDialog({ ...(this.host.dialog() as FilamentDialog), ...change });
  }

  /** A colour from the picker: one of the palette's checks its swatch,
   * another becomes the colour outside it. */
  private pickColor(value: string): void {
    const color = value.toUpperCase();
    this.editFilament({ color, ...(inPalette(color) ? {} : { custom: color }) });
  }

  readonly onResize = (): void => {
    if (this.host.dialog()?.kind === "filament") this.fitList(this.host.root().querySelector("dialog"));
  };

  /** The inventory's list takes the room the dialog leaves, down to its
   * least. Where what stands around it leaves less (notes, warnings, the
   * filters open, a small screen), the dialog scrolls as a whole instead:
   * else the list's end would sit under the button row, out of reach. */
  fitList(dialog: HTMLDialogElement | null): void {
    const body = dialog?.querySelector<HTMLElement>(".dlg-body");
    const list = body?.querySelector<HTMLElement>(".inv-list");
    if (!body) return;
    if (!list) {
      body.classList.remove("inv-short");
      return;
    }
    if (!body.classList.contains("inv-short")) {
      // The list at its least, and the panel around it squeezed below what it
      // holds: what it holds would run under the button row.
      const panel = list.closest<HTMLElement>(".inv-panel");
      if (panel && panel.scrollHeight > panel.clientHeight + 1) body.classList.add("inv-short");
      return;
    }
    // Scrolling as a whole, the body is as tall as what it holds: back once
    // that fits with the list at its least.
    const least = parseFloat(getComputedStyle(list).minHeight) || 0;
    if (body.scrollHeight - list.offsetHeight + least <= window.innerHeight - DIALOG_MARGIN) body.classList.remove("inv-short");
  }

  /** The slot dialog's fields and its inventory tab. */
  readonly actions: FilamentActions = {
    // Another vendor: its filament still to choose -- the slot's own again
    // under the slot's vendor; the K profile goes back to the slot's.
    setVendor: (vendor: string) => {
      const dialog = this.host.dialog() as FilamentDialog;
      const own = vendor !== KEEP && dialog.keep !== undefined && ownVendor(dialog) === vendor;
      this.editFilament({ vendor, filament: own ? KEEP : undefined, kprofile: undefined });
    },
    // A new filament takes its first K profile, else the printer's default,
    // as Bambu Studio offers them; back to the slot's own, its K profile stays.
    setFilament: (filament: string) => {
      const dialog = { ...(this.host.dialog() as FilamentDialog), filament };
      this.editFilament({ filament, kprofile: filament === KEEP ? undefined : matchingProfile(dialog) });
    },
    setKProfile: (kprofile: string) => this.editFilament({ kprofile }),
    resetSlot: () => this.resetSlot(),
    refreshRfid: () => this.refreshRfid(),
    setColor: (color: string) => this.editFilament({ color }),
    pickColor: (color: string) => this.pickColor(color),
    setTab: (tab: "set" | "inventory") => {
      const dialog = this.host.dialog();
      if (dialog?.kind !== "filament" || dialog.tab === tab) return;
      this.host.setDialog({ ...withoutScan(dialog), tab });
      if (tab === "inventory" && dialog.spools === undefined) this.startSpools(dialog);
    },
    chooseSpool: (id: number) => {
      const dialog = this.host.dialog();
      if (dialog?.kind === "filament") this.host.setDialog({ ...dialog, chosenSpool: id });
    },
    filterSpools: (field: "vendor" | "material" | "location", value: string) => {
      const dialog = this.host.dialog();
      if (dialog?.kind !== "filament") return;
      const { vendorFilter: _vendor, materialFilter: _material, locationFilter: _location, scanned: _scanned, scanUnknown: _unknown, ...rest } = dialog;
      const vendorFilter = field === "vendor" ? value : dialog.vendorFilter;
      const materialFilter = field === "material" ? value : dialog.materialFilter;
      const locationFilter = field === "location" ? value : dialog.locationFilter;
      this.host.setDialog({
        ...rest,
        ...(vendorFilter ? { vendorFilter } : {}),
        ...(materialFilter ? { materialFilter } : {}),
        ...(locationFilter ? { locationFilter } : {}),
      });
    },
    searchSpools: (text: string) => {
      const dialog = this.host.dialog();
      if (dialog?.kind !== "filament") return;
      const { scanned: _scanned, scanUnknown: _unknown, searchByScan: _byScan, ...rest } = dialog;
      this.host.setDialog({ ...rest, search: text });
    },
    toggleFilters: () => {
      const dialog = this.host.dialog();
      if (dialog?.kind === "filament") this.host.setDialog({ ...dialog, filtersOpen: !dialog.filtersOpen });
    },
    unassign: () => {
      const dialog = this.host.dialog();
      if (dialog?.kind !== "filament") return;
      this.host.closeDialog();
      void this.host.run(filamentKey(dialog.entityId), "bambuddy", "unassign_spool", { entity_id: dialog.entityId });
    },
  };
}
