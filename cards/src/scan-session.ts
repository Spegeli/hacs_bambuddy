// A spool label's scan in the slot dialog: the camera, the app's scanner,
// a photo; and the dialog across a rebuilt dashboard: Home Assistant
// replaces the cards when the page comes back from the camera app, and the
// new card of the same printer takes the dialog on.
import type { ListedSpool } from "./actions";
import type { Dialog, DialogActions } from "./dialogs";
import type { FilamentDialog } from "./filament-dialog";
import { inventoryButtons, onInventory } from "./inventory-dialog";
import type { FilamentSession } from "./filament-session";
import type { Settings } from "./forms";
import { t } from "./i18n";
import { slotOf, type CardContext } from "./parts";
import { decodePhoto, scanFrames, scanInApp, scanWay, setTorch, startCamera, stopStream, torchOf, type AppScanEnd } from "./scan";
import type { CardConfig, Hass, PrinterRefs, View } from "./types";

/** The dialog without its scan: the list shows again. */
export function withoutScan(dialog: FilamentDialog): FilamentDialog {
  const { scan: _scan, ...rest } = dialog;
  return rest;
}

/** How long after the camera area offered a photo a replaced card hands its
 * dialog on, and how long the handed dialog waits for its new card. */
export const PHOTO_TRIP_MS = 5 * 60_000;
export const HANDOVER_MS = 30_000;
/** The page hidden this long before at most: the rebuild follows the return. */
export const HIDDEN_TRIP_MS = 60_000;

/** A slot dialog on its way from a card Home Assistant replaced to the new one. */
export interface Handover {
  from: ScanSession;
  printer: string;
  /** The page and the card's set-up it was handed from. */
  page: string;
  setup: string;
  dialog: FilamentDialog;
  view: View;
  at: number;
  card?: ScanSession;
  photo?: number | "no_code" | "not_label";
}
let handover: Handover | undefined;

/** The slot dialog on its way, if one is. */
export const pendingHandover = (): Handover | undefined => handover;

/** A card that leaves hands its dialog on; undefined: none is on its way any more. */
export function setHandover(next: Handover | undefined): void {
  handover = next;
}

/** Tests start without a dialog on its way. */
export function forgetHandoverForTests(): void {
  handover = undefined;
}

/** How long the camera's "no label" line stays after the last foreign code. */
export const FOREIGN_FOR_MS = 3_000;

/** What the scan needs of the card. */
export interface ScanHost {
  /** The card itself: on the page or not. */
  element: HTMLElement;
  hass: () => Hass | undefined;
  refs: () => PrinterRefs | undefined;
  config: () => CardConfig | undefined;
  settings: () => Settings;
  /** Home Assistant's preview, and the card editor: neither hands a dialog on. */
  preview: () => boolean;
  inEditor: () => boolean;
  /** The card's shadow root: Lit renders into one. */
  root: () => ShadowRoot;
  updateComplete: () => Promise<boolean>;
  focusAfterUpdate: (...selectors: string[]) => void;
  dialog: () => Dialog | undefined;
  setDialog: (dialog: Dialog) => void;
  view: () => View;
  setView: (view: View) => void;
  context: (hass: Hass, refs: PrinterRefs) => CardContext;
  /** Assign: the dialog's own button. */
  confirmDialog: () => void;
  /** The slot dialog's data: a dialog taken on asks anew. */
  filament: () => FilamentSession;
}

/** The scan's buttons, as the slot dialog calls them. */
type ScanActions = Pick<DialogActions, "startScan" | "closeScan" | "takePhoto" | "toggleTorch">;

export class ScanSession {
  /** A spool label's scan: the camera's stream, what reads its picture (and
   * from which video), the app's scanner; each scan's number, so a camera
   * that comes after its scan ended goes at once. */
  private scanStream?: MediaStream;
  private stopFrames?: () => void;
  private framesOn?: HTMLVideoElement;
  /** Ends the camera's "no label" line once no foreign code was seen for a while. */
  private foreignTimer?: ReturnType<typeof setTimeout>;
  private stopAppScan?: () => void;
  private scanRun = 0;
  /** When the camera area last offered a photo: the camera app may take the page away. */
  private photoAsked = 0;
  /** When the page was last hidden: the camera app's trip, before a rebuild. */
  hiddenAt = 0;

  constructor(private readonly host: ScanHost) {}

  /** Back on the page itself (a dashboard only moved it): its dialog is its
   * own. Else it may take on the slot dialog of a card Home Assistant just
   * replaced. */
  rejoin(): void {
    if (pendingHandover()?.from === this) setHandover(undefined);
    this.takeOver();
  }

  /** A phone's camera app freezes the page; back, Home Assistant reconnects
   * and rebuilds the dashboard with new cards: the next card of this
   * printer takes the slot dialog on, the photo read here included. */
  handOver(): void {
    const host = this.host;
    const open = host.dialog();
    const config = host.config();
    const printer = config?.printer;
    const trip = Date.now() - this.photoAsked < PHOTO_TRIP_MS && Date.now() - this.hiddenAt < HIDDEN_TRIP_MS;
    if (open?.kind === "filament" && printer && trip && !host.preview() && !host.inEditor()) {
      const dialog = open.scan?.way === "blocked" ? open : withoutScan(open);
      setHandover({ from: this, printer, page: location.pathname, setup: JSON.stringify(config), dialog, view: host.view(), at: Date.now() });
    }
  }

  /** The scan the slot dialog runs, while its inventory shows. */
  private runningScan(): FilamentDialog["scan"] {
    const dialog = this.host.dialog();
    const hass = this.host.hass();
    return dialog?.kind === "filament" && hass && onInventory(hass, dialog) ? dialog.scan : undefined;
  }

  /** The camera and the app's scanner follow the dialog: whatever ends the
   * scan -- a scan, Close camera, the dialog closed, the other tab, another
   * dialog -- ends them here, in one place. */
  followScan(): void {
    const scan = this.runningScan();
    // The slot left the inventory (a reload, the printer away): the scan
    // goes with it, or its camera area would stay with no picture.
    const open = this.host.dialog();
    if (!scan && open?.kind === "filament" && open.scan) this.host.setDialog(withoutScan(open));
    if (scan?.way !== "app") this.endAppScan();
    if (scan?.way !== "live") {
      this.endCamera();
      return;
    }
    const video = this.host.root().querySelector<HTMLVideoElement>("dialog .inv-camera video");
    if (!video || !this.scanStream) return;
    if (video.srcObject !== this.scanStream) {
      video.srcObject = this.scanStream;
      void video.play().catch(() => undefined);
    }
    if (this.framesOn !== video) {
      this.stopFrames?.();
      this.framesOn = video;
      this.stopFrames = scanFrames(video, (id) => this.applyScan(id), () => this.foreignSeen());
    }
  }

  /** A QR code that is no spool label is in the picture: the help line says
   * so until none was seen for FOREIGN_FOR_MS. */
  private foreignSeen(): void {
    const dialog = this.host.dialog();
    if (dialog?.kind !== "filament" || dialog.scan?.way !== "live") return;
    if (!dialog.scan.foreign) this.host.setDialog({ ...dialog, scan: { ...dialog.scan, foreign: true, foreignSaid: true } });
    clearTimeout(this.foreignTimer);
    this.foreignTimer = setTimeout(() => {
      this.foreignTimer = undefined;
      const now = this.host.dialog();
      if (now?.kind !== "filament" || !now.scan?.foreign) return;
      const { foreign: _foreign, ...scan } = now.scan;
      this.host.setDialog({ ...now, scan });
    }, FOREIGN_FOR_MS);
  }

  endCamera(): void {
    clearTimeout(this.foreignTimer);
    this.foreignTimer = undefined;
    this.stopFrames?.();
    this.stopFrames = undefined;
    this.framesOn = undefined;
    stopStream(this.scanStream);
    this.scanStream = undefined;
  }

  endAppScan(): void {
    const stop = this.stopAppScan;
    this.stopAppScan = undefined;
    stop?.();
  }

  private startScan(): void {
    const dialog = this.host.dialog();
    const hass = this.host.hass();
    if (dialog?.kind !== "filament" || !hass) return;
    const run = ++this.scanRun;
    const way = scanWay(hass);
    // The camera area as high as what it stands in for: the dialog keeps its size.
    const height = this.host.root().querySelector<HTMLElement>("dialog #inv-panel")?.offsetHeight || undefined;
    const { scanned: _scanned, scanUnknown: _unknown, ...rest } = dialog;
    if (way === "app") {
      this.host.setDialog({ ...rest, scan: { way: "app" } });
      const texts = {
        title: t(hass, "inv_scan_app_title"),
        description: t(hass, "inv_scan_help"),
        manual: t(hass, "inv_scan_manual"),
        notLabel: t(hass, "inv_scan_not_label"),
      };
      this.stopAppScan = scanInApp(hass, texts, (end) => this.appScanEnded(end));
      return;
    }
    if (way === "insecure") {
      this.photoAsked = Date.now();
      this.host.setDialog({ ...rest, scan: { way: "blocked", reason: "insecure", ...(height ? { height } : {}) } });
      this.host.focusAfterUpdate("dialog .inv-photo input");
      return;
    }
    this.host.setDialog({ ...rest, scan: { way: "live", ...(height ? { height } : {}) } });
    // The pressed button is gone with the list: the keyboard goes on in the camera area.
    this.host.focusAfterUpdate("dialog .inv-camera-close");
    void startCamera().then((found) => {
      const current = this.host.dialog();
      if (run !== this.scanRun || this.runningScan()?.way !== "live" || current?.kind !== "filament" || !current.scan) {
        if (typeof found !== "string") stopStream(found);
        return;
      }
      if (typeof found === "string") {
        this.photoAsked = Date.now();
        this.host.setDialog({ ...current, scan: { ...current.scan, way: "blocked", reason: found } });
        this.host.focusAfterUpdate("dialog .inv-photo input");
        return;
      }
      this.scanStream = found;
      this.host.setDialog({ ...current, scan: { ...current.scan, streaming: true, ...(torchOf(found) ? { torch: "off" as const } : {}) } });
    });
  }

  private appScanEnded(end: AppScanEnd): void {
    this.stopAppScan = undefined;
    const dialog = this.host.dialog();
    if (dialog?.kind !== "filament" || dialog.scan?.way !== "app") return;
    this.host.setDialog(withoutScan(dialog));
    if (end.kind === "spool") this.applyScan(end.id);
    else if (end.kind === "manual") this.host.focusAfterUpdate("dialog #inv-search");
  }

  /** A spool label read (variant B): the filters back to all, the search
   * names the spool, which is chosen where it fits. A number the list
   * lacks is said, the list left as it was. */
  private applyScan(id: number): void {
    const dialog = this.host.dialog();
    if (dialog?.kind !== "filament") return;
    const list = typeof dialog.spools === "object" ? dialog.spools : undefined;
    const spool = list?.spools.find((item) => item.id === id);
    const { scan: _scan, scanned: _scanned, scanUnknown: _unknown, chosenSpool: _chosen, ...rest } = dialog;
    if (!spool) {
      // A search an earlier scan set goes: it named that scan's spool. One
      // the user typed stays, as the filters do.
      const { search: _search, searchByScan: _byScan, ...kept } = rest;
      this.host.setDialog(rest.searchByScan ? { ...kept, scanUnknown: id } : { ...rest, scanUnknown: id });
      this.host.focusAfterUpdate("dialog .inv-scan");
      return;
    }
    const { vendorFilter: _vendor, materialFilter: _material, locationFilter: _location, ...open } = rest;
    this.host.setDialog({
      ...open,
      search: t(this.host.hass(), "inv_scan_search", { id }),
      searchByScan: true,
      scanned: id,
      ...(spool.fits === undefined ? { chosenSpool: id } : {}),
    });
    if (this.host.settings().assignScanned && this.assignsAtOnce(spool)) {
      this.host.confirmDialog();
      return;
    }
    void this.host.updateComplete().then(() => this.host.root().querySelector<HTMLElement>("dialog .inv-row")?.scrollIntoView?.({ block: "nearest" }));
    this.host.focusAfterUpdate('dialog .inv-row[aria-checked="true"]', "dialog .inv-scan");
  }

  /** Whether a scanned spool goes in without Assign (the option
   * assign_scanned_spool): Assign would take it, nothing warns, the slot is
   * not the one a running print feeds, and the spool sits in no other slot. */
  private assignsAtOnce(spool: ListedSpool): boolean {
    const dialog = this.host.dialog();
    const hass = this.host.hass();
    const refs = this.host.refs();
    if (dialog?.kind !== "filament" || !hass || !refs) return false;
    const ctx = this.host.context(hass, refs);
    const buttons = inventoryButtons(ctx, dialog);
    const elsewhere = (spool.place !== undefined && !spool.place.here) || spool.also.length > 0;
    return buttons.ready && !buttons.warn?.length && !(ctx.running && slotOf(hass, dialog.entityId).active) && !elsewhere;
  }

  private takePhoto(file: File): void {
    this.photoAsked = Date.now();
    void decodePhoto(file).then((found) => this.photoRead(found));
  }

  /** A photo read: its spool, or what it lacked. One this card read after
   * Home Assistant replaced it goes to the card that took its dialog on. */
  private photoRead(found: number | "no_code" | "not_label"): void {
    const left = pendingHandover();
    if (!this.host.element.isConnected && left?.from === this) {
      left.photo = found;
      if (left.card) {
        setHandover(undefined);
        left.card.photoRead(found);
      }
      return;
    }
    const dialog = this.host.dialog();
    if (dialog?.kind !== "filament" || dialog.scan?.way !== "blocked") return;
    if (typeof found === "number") this.applyScan(found);
    else this.host.setDialog({ ...dialog, scan: { ...dialog.scan, reason: found, tries: (dialog.scan.tries ?? 0) + 1 } });
  }

  /** The slot dialog of a card of this printer Home Assistant just replaced. */
  private takeOver(): void {
    const host = this.host;
    const left = pendingHandover();
    if (!left || left.card || left.from === this || host.dialog() || host.preview() || host.inEditor()) return;
    // The same card again: the same printer, set-up and page.
    const config = host.config();
    if (left.printer !== config?.printer || left.setup !== JSON.stringify(config) || left.page !== location.pathname) return;
    if (Date.now() - left.at > HANDOVER_MS) {
      setHandover(undefined);
      return;
    }
    left.card = this;
    // A fresh ask: what the old card was still waiting for answers it, not this one.
    const filament = host.filament();
    const ask = filament.nextAsk();
    const dialog: FilamentDialog = { ...left.dialog, ask };
    host.setDialog(dialog);
    host.setView(left.view);
    this.photoAsked = Date.now();
    // A second rebuild (a flapping connection) hands it on again.
    this.hiddenAt = Date.now();
    if (dialog.offer === "loading") void filament.loadOffer(dialog.entityId, ask);
    if (dialog.kprofiles === "loading") {
      void filament.loadKProfiles(dialog.entityId, ask);
      filament.armKSlow(dialog.entityId, ask);
    }
    if (dialog.spools === "loading") void filament.loadSpools(dialog.entityId, ask);
    const photo = left.photo;
    if (photo === undefined) return;
    setHandover(undefined);
    void host.updateComplete().then(() => this.photoRead(photo));
  }

  private toggleTorch(): void {
    const dialog = this.host.dialog();
    const track = this.scanStream ? torchOf(this.scanStream) : undefined;
    if (dialog?.kind !== "filament" || !dialog.scan?.torch || !track) return;
    const on = dialog.scan.torch === "off";
    void setTorch(track, on).then((done) => {
      const now = this.host.dialog();
      if (done && now?.kind === "filament" && now.scan?.torch) this.host.setDialog({ ...now, scan: { ...now.scan, torch: on ? "on" : "off" } });
    });
  }

  /** The scan's buttons in the slot dialog. */
  readonly actions: ScanActions = {
    startScan: () => this.startScan(),
    closeScan: () => {
      const dialog = this.host.dialog();
      if (dialog?.kind !== "filament") return;
      this.host.setDialog(withoutScan(dialog));
      this.host.focusAfterUpdate("dialog .inv-scan");
    },
    takePhoto: (file: File) => this.takePhoto(file),
    toggleTorch: () => this.toggleTorch(),
  };
}
