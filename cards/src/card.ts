// The BamBuddy printer card: one printer with its AMS units, in three
// views -- status, control, filament. It finds its entities itself (see
// discovery.ts) and draws again only when one of them changed: Home
// Assistant hands a card a new hass on every state change in the house.
import { html, LitElement, nothing, type CSSResultGroup, type PropertyValues, type TemplateResult } from "lit";

import { callAction, errorText } from "./actions";
import { controlView, sectionShown, type Step } from "./control-view";
import { dialogView, type Dialog, type DialogActions, type DryingField } from "./dialogs";
import { filamentChanges, filamentKey, withoutScan } from "./filament-dialog";
import { onInventory } from "./inventory-dialog";
import { findPrinter, hasControls, hasPrinterIdentifier, noDataSince, noPrinterData, notListed, printerDevices, printerOnline, printStatus, shownUnits } from "./discovery";
import { filamentView } from "./filament-view";
import { BUSY, FILAMENT_CHANGE, hasValue, RUNNING, stateOf, WITH_JOB } from "./format";
import { BamBuddyPrinterCardEditor, EDITOR_TAG, loadForm } from "./editor";
import { DEFAULTS, settingsOf, validateConfig, type Settings } from "./forms";
import { chips, subtitle, type DialogChip } from "./header";
import { icon, printerDrawing, type IconName } from "./icons";
import { rememberLocale, t, type TextKey } from "./i18n";
import { asOnline, connection, nextIndex, printerTitle, sample, sampleKey, slotOf, snack, type CardContext } from "./parts";
import { defineCard, defineElement } from "./register";
import { ScanSession } from "./scan-session";
import { DialogFlows } from "./card-dialogs";
import { Drafts } from "./drafts";
import { CardMenu } from "./menu";
import { LiveView, type Fullscreen } from "./live";
import { FilamentSession } from "./filament-session";
import { cardPlugs, starting } from "./power";
import { offlineJob, stateText, statusView } from "./status-view";
import { cardStyles } from "./styles";
import type { CardConfig, Hass, PrinterRefs, StatusBlock, View } from "./types";

const TAG = "bambuddy-printer-card";

/** Each tab's icon: on a card too narrow for the names it shows alone. */
const TAB_ICONS: Record<View, IconName> = { status: "infoOutline", control: "tune", filament: "palette" };

/** Home Assistant's dialog that edits a card, with its preview. */
const EDIT_DIALOG = "hui-dialog-edit-card";

/** Whether the card sits in Home Assistant's card editor: only its preview
 * shows examples. Home Assistant sets preview on a dashboard in edit mode
 * too, where the cards keep the size they will have. */
function inCardEditor(card: Element): boolean {
  for (let node: Node | null = card; node; node = node instanceof ShadowRoot ? node.host : node.parentNode) {
    if (node instanceof Element && node.localName === EDIT_DIALOG) return true;
  }
  return false;
}

// Print states of a printer the picker's preview would show without data.
const OFFLINE = ["offline", "unavailable", "unknown"];

/** The rows of 50 px each status block takes, for the masonry dashboard:
 * the head and the job take four. */
const BLOCK_ROWS: Record<StatusBlock, number> = { controls: 1, power: 2, temperatures: 2, ams: 2, fans: 1, speed: 1 };

/** The ID of the body, the panel the tabs show their view in. */
const PANEL = "bb-view";

/** How long an error stays in the card unless closed. */
const ERROR_TIMEOUT = 12_000;

/** How long "Sent" shows after a command went through. */
const SENT_TIMEOUT = 3_000;

// The redraw of a count while it runs (a plug starting, a connection check).
const TICK_MS = 1000;

/** How long the card waits for the printer's data before it says there is
 * none: Home Assistant starting or the entry reloading take seconds. */
const NO_DATA_WAIT_MS = 30_000;

/** An element to focus: a selector, or an element of the open dialog by an
 * attribute's value. */
type Target = string | { attribute: string; value: string };

export class BamBuddyPrinterCard extends LitElement {
  static override properties = {
    hass: { attribute: false },
    preview: { type: Boolean },
    config: { state: true },
    view: { state: true },
    liveWanted: { state: true },
    coverLarge: { state: true },
    fullscreen: { state: true },
    pageVisible: { state: true },
    streamFailed: { state: true },
    brokenCover: { state: true },
    pending: { state: true },
    error: { state: true },
    sent: { state: true },
    dialog: { state: true },
    menuOpen: { state: true },
    step: { state: true },
    optionsOpen: { state: true },
    amsOpen: { state: true },
  };

  static override styles: CSSResultGroup = cardStyles;

  hass?: Hass;
  /** Set by Home Assistant in the card editor's preview and on a dashboard
   * in edit mode: no live view then. */
  preview = false;
  protected config?: CardConfig;
  protected view: View = "status";
  protected liveWanted = false;
  /** The job's picture shows large where the live view opens. */
  protected coverLarge = false;
  /** The job the large picture belongs to: another one closes it. */
  private coverJob?: string;
  /** The job the external spools below fed, and those spools: they stay
   * shown till it ends, wherever the card hides the external spool. */
  private spoolJob?: string;
  private jobSpools: ReadonlySet<string> = new Set();
  /** Off, or the live view full screen: the browser's own, or the window
   * where the browser has none. */
  protected fullscreen: Fullscreen = "off";
  protected pageVisible = document.visibilityState !== "hidden";
  protected streamFailed = false;
  protected brokenCover?: string;
  protected pending: ReadonlySet<string> = new Set();
  protected error?: string;
  protected sent = false;
  protected dialog?: Dialog;
  protected menuOpen = false;
  /** 1 mm: a tap never moves Z far (the bed into the nozzle, or the nozzle into the bed). */
  protected step: Step = 1;
  /** The card's shadow root: Lit renders into one. */
  private get shadow(): ShadowRoot {
    return this.renderRoot as ShadowRoot;
  }

  /** The ⋮ menu, and the keyboard's place kept when a press takes its control away. */
  private readonly menu = new CardMenu({
    element: this,
    root: () => this.shadow,
    menuOpen: () => this.menuOpen,
    setMenuOpen: (open) => {
      this.menuOpen = open;
    },
    focusAfterUpdate: (...selectors) => this.focusAfterUpdate(...selectors),
    markFromMenu: () => {
      this.dialogFromMenu = true;
    },
    setDialog: (dialog) => {
      this.dialog = dialog;
    },
    pending: (key) => this.pending.has(key),
    run: (key, domain, service, data) => this.run(key, domain, service, data),
    startCheck: () => this.flows.startCheck(),
  });

  /** The slot dialog's data: its answers, each into the dialog of its own open. */
  private readonly filament = new FilamentSession({
    hass: () => this.hass as Hass,
    refs: () => this.refs,
    root: () => this.shadow,
    updateComplete: () => this.updateComplete,
    dialog: () => this.dialog,
    setDialog: (dialog) => {
      this.dialog = dialog;
    },
    dialogBack: () => this.dialogBack,
    setDialogBack: (dialog) => {
      this.dialogBack = dialog;
    },
    parkDialog: () => this.parkDialog(),
    dropSent: () => this.dropSent(),
    closeDialog: () => this.closeDialog(),
    run: (key, domain, service, data) => this.run(key, domain, service, data),
  });

  /** A spool label's scan, and the slot dialog handed to the next card of
   * the printer when Home Assistant rebuilds the dashboard. */
  private readonly scan = new ScanSession({
    element: this,
    hass: () => this.hass,
    refs: () => this.refs,
    config: () => this.config,
    settings: () => this.settings,
    preview: () => this.preview,
    inEditor: () => this.inEditor,
    root: () => this.shadow,
    updateComplete: () => this.updateComplete,
    focusAfterUpdate: (...selectors) => this.focusAfterUpdate(...selectors),
    dialog: () => this.dialog,
    setDialog: (dialog) => {
      this.dialog = dialog;
    },
    view: () => this.view,
    setView: (view) => {
      this.view = view;
    },
    context: (hass, refs) => this.context(hass, refs),
    confirmDialog: () => this.confirmDialog(),
    filament: () => this.filament,
  });

  /** The live view and its full screen. */
  private readonly live = new LiveView({
    element: this,
    root: () => this.shadow,
    hass: () => this.hass,
    refs: () => this.refs,
    settings: () => this.settings,
    preview: () => this.preview,
    coverLarge: () => this.coverLarge,
    closeCover: () => {
      this.closeCover();
    },
    liveWanted: () => this.liveWanted,
    setLiveWanted: (wanted) => {
      this.liveWanted = wanted;
    },
    fullscreen: () => this.fullscreen,
    setFullscreen: (mode) => {
      this.fullscreen = mode;
    },
    pageVisible: () => this.pageVisible,
    setPageVisible: (visible) => {
      this.pageVisible = visible;
    },
    streamFailed: () => this.streamFailed,
    setStreamFailed: (failed) => {
      this.streamFailed = failed;
    },
    focusAfterUpdate: (...selectors) => this.focusAfterUpdate(...selectors),
    noteHidden: () => this.scan.noteHidden(),
    openFps: () => {
      this.dialogBack = undefined;
      this.dialog = { kind: "camera" };
      this.dialogFromMenu = false;
    },
  });

  /** The dialogs' own flows (card-dialogs.ts): drying, skipping, the
   * maintenance tasks, the connection check, "Copied". */
  private readonly flows = new DialogFlows({
    hass: () => this.hass as Hass,
    refs: () => this.refs,
    dialog: () => this.dialog,
    setDialog: (dialog) => {
      this.dialog = dialog;
    },
    focusAfterUpdate: (...targets) => this.focusAfterUpdate(...targets),
    dropSent: () => this.dropSent(),
    requestUpdate: () => this.requestUpdate(),
  });

  /** Targets, switches and options tapped: shown before their entities report them. */
  private readonly drafts = new Drafts({
    hass: () => this.hass as Hass,
    pending: (key) => this.pending.has(key),
    run: (key, domain, service, data) => this.run(key, domain, service, data),
    update: () => this.requestUpdate(),
  });
  /** The print options: folded until opened, open while the card lives. */
  protected optionsOpen = false;
  /** AMS units folded or unfolded by a tap, by device ID: until the page
   * reloads or the configuration changes. The others follow ams_folding and
   * the unit count as they are now. */
  protected amsOpen: ReadonlyMap<string, boolean> = new Map();
  private settings: Settings = DEFAULTS;

  private refs?: PrinterRefs;
  private seenEntities?: Hass["entities"];
  private seenDevices?: Hass["devices"];
  private errorTimer?: ReturnType<typeof setTimeout>;
  private sentTimer?: ReturnType<typeof setTimeout>;
  /** Draws the count every second while the printer starts after its plug. */
  private startingTimer?: ReturnType<typeof setInterval>;
  /** Since when the printer has had no data, and the redraw at the wait's end. */
  private noDataFrom?: number;
  private noDataTimer?: ReturnType<typeof setTimeout>;
  /** In the card editor: its preview shows examples. */
  private inEditor = false;
  /** The open dialog came from the menu: closing it focuses the three dots. */
  private dialogFromMenu = false;
  /** The chip's plugs dialog, or the HMS messages, a question or the
   * switch-off's settings were opened from: they go back to it. */
  private dialogBack: Dialog | undefined = undefined;
  /** The button in that dialog that asked the question: a selector, or an
   * attribute and its value -- a name may hold any character, which no
   * selector need parse. */
  private asker: Target | undefined = undefined;

  /** A question, or a second dialog, opens over the open one: its Cancel
   * comes back to it, the keyboard's place on the button that asked --
   * `asker`, else the button focused now. */
  private parkDialog(asker?: string): void {
    this.dialogBack = this.dialog;
    if (asker) this.asker = asker;
    else this.rememberAsker();
    this.focusAfterUpdate("dialog .btn.safe");
  }

  /** Notes the dialog's button that is asking a question, to come back to. */
  private rememberAsker(): void {
    const active = this.shadow.activeElement;
    // An answer by its key (two messages may offer the same), else by its name.
    const answer = active?.getAttribute("data-answer");
    const label = active?.getAttribute("aria-label");
    this.asker = answer ? { attribute: "data-answer", value: answer } : label ? { attribute: "aria-label", value: label } : undefined;
  }

  /** The visual editor: Home Assistant's form with the card's fields, once
   * Home Assistant has loaded it. */
  static async getConfigElement(): Promise<HTMLElement> {
    await loadForm();
    return document.createElement(EDITOR_TAG);
  }

  /** A card added from the picker: the first BamBuddy printer that is
   * online -- its preview shows what the card can do -- else the first.
   * Nothing else: the editor shows the defaults, and a list left out shows
   * a block a later version adds. */
  static getStubConfig(hass?: Hass): Record<string, unknown> {
    if (!hass) return {};
    const printers = printerDevices(hass);
    const online = printers.find((device) => !OFFLINE.includes(printStatus(hass, device.id) ?? "unavailable"));
    const first = online ?? printers[0];
    return first ? { printer: first.id } : {};
  }

  setConfig(config: unknown): void {
    this.config = validateConfig(config);
    this.settings = settingsOf(this.config);
    this.view = this.settings.startView;
    this.amsOpen = new Map();
    this.liveWanted = false;
    this.closeCover();
    this.refs = undefined;
    this.noDataFrom = undefined;
    this.stopNoDataTimer();
    // The stream too: it may be another printer's now (the first config
    // comes before the card is drawn).
    if (this.live.hasStream) this.live.endLiveStream();
    this.streamFailed = false;
    // A dialog belongs to the printer it was opened for.
    this.dialog = undefined;
    this.dialogFromMenu = false;
    this.dialogBack = undefined;
  }

  getCardSize(): number {
    // The plugs' block only where the card shows a plug: the printer's own, or one BamBuddy shows on its card.
    const hass = this.hass;
    const plugs = hass ? cardPlugs(hass, this.refs?.plugs ?? []) : [];
    return this.settings.blocks.reduce((size, block) => size + (block === "power" && !plugs.length ? 0 : BLOCK_ROWS[block]), 4);
  }

  getGridOptions(): { columns: number; min_columns: number; rows: "auto" } {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  // --- Life cycle -----------------------------------------------------------

  override connectedCallback(): void {
    super.connectedCallback();
    // Back within the grace: the live view goes on (in the window, where the
    // move ended the browser's full screen).
    this.live.backOnPage();
    this.inEditor = inCardEditor(this);
    // Back on the page itself (a dashboard only moved it): its dialog is its own.
    this.scan.rejoin();
    window.addEventListener("resize", this.filament.onResize);
    // Back while waiting for the printer's data: the rest of the wait.
    this.armNoDataTimer();
    // Back while a check runs: its seconds count on.
    this.flows.resume();
    document.addEventListener("visibilitychange", this.live.onVisibility);
    document.addEventListener("pointerdown", this.menu.onPointerDown);
    this.requestUpdate();
  }

  override disconnectedCallback(): void {
    document.removeEventListener("visibilitychange", this.live.onVisibility);
    // Away, the page's visibility is read anew on the return.
    this.live.stopHiddenWait();
    document.removeEventListener("pointerdown", this.menu.onPointerDown);
    this.menuOpen = false;
    this.stopNoDataTimer();
    // Leaving the page ends the live view, after a grace where it runs.
    this.live.leavePage();
    // An error belongs to the moment it happened: none waits for the return.
    clearTimeout(this.errorTimer);
    this.followStarting(false);
    this.error = undefined;
    clearTimeout(this.sentTimer);
    this.sent = false;
    this.flows.stop();
    if (this.dialog?.kind === "info") this.dialog = { kind: "info" };
    // A phone's camera app freezes the page; back, Home Assistant reconnects
    // and rebuilds the dashboard with new cards: the next card of this
    // printer takes the slot dialog on, the photo read here included.
    this.scan.handOver();
    window.removeEventListener("resize", this.filament.onResize);
    // A live scan ends with the page: back, the list shows as it was. The
    // photo's area stays: its picker may still answer.
    if (this.dialog?.kind === "filament" && this.dialog.scan && this.dialog.scan.way !== "blocked") this.dialog = withoutScan(this.dialog);
    this.scan.endCamera();
    this.scan.endAppScan();
    // A target still being tapped is sent now, not lost.
    this.drafts.flush();
    // Out of the page a modal dialog leaves the top layer but stays open:
    // back, it would be drawn inline. Closed this way it fires no close, and
    // the next draw opens it modal again.
    this.renderRoot.querySelector("dialog")?.removeAttribute("open");
    super.disconnectedCallback();
  }

  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (changed.size !== 1 || !changed.has("hass")) return true;
    const previous = changed.get("hass") as Hass | undefined;
    const hass = this.hass;
    if (!previous || !hass || !this.refs) return true;
    // Home Assistant hands a new formatter over in an update of its own,
    // after a new language or registry: the states then read anew.
    if (
      previous.entities !== hass.entities ||
      previous.devices !== hass.devices ||
      previous.locale !== hass.locale ||
      previous.localize !== hass.localize ||
      previous.formatEntityState !== hass.formatEntityState ||
      previous.config !== hass.config ||
      previous.user !== hass.user
    ) {
      return true;
    }
    return this.refs.watched.some((entityId) => previous.states[entityId] !== hass.states[entityId]);
  }

  protected override willUpdate(changed: PropertyValues): void {
    const hass = this.hass;
    if (!hass || !this.config) return;
    rememberLocale(hass);
    if (!this.refs || changed.has("config") || hass.entities !== this.seenEntities || hass.devices !== this.seenDevices) {
      this.seenEntities = hass.entities;
      this.seenDevices = hass.devices;
      this.refs = findPrinter(hass, this.config.printer);
    }
    this.followJobSpools(hass);
    this.followNoData(hass);
    this.scan.dropLeftScan();
    // The large picture goes with its job, and offline: the mode's own
    // then -- nothing on tap, the live view always.
    if (this.coverLarge) {
      const refs = this.refs;
      const gone = !refs || this.preview || !printerOnline(hass, refs) || this.coverUrl(hass, refs) === undefined || this.jobOf(hass, refs) !== this.coverJob;
      if (gone) {
        this.closeCover();
        this.liveWanted = false;
      }
    }
    this.live.follow();
    this.drafts.follow(hass);
  }

  /** The wait for the printer's data: noted when it goes, over when it
   * comes back; a redraw at the wait's end. A printer BamBuddy no longer
   * lists waits for nothing: the server says why. */
  private followNoData(hass: Hass): void {
    const refs = this.refs;
    if (!refs || !noPrinterData(hass, refs) || notListed(hass, refs)) {
      this.noDataFrom = undefined;
      this.stopNoDataTimer();
      return;
    }
    this.noDataFrom ??= noDataSince(hass, refs, Date.now());
    this.armNoDataTimer();
  }

  private armNoDataTimer(): void {
    if (this.noDataTimer || this.noDataFrom === undefined || !this.isConnected) return;
    const left = this.noDataFrom + NO_DATA_WAIT_MS - Date.now();
    if (left <= 0) return;
    this.noDataTimer = setTimeout(() => {
      this.noDataTimer = undefined;
      this.requestUpdate();
    }, left);
  }

  private stopNoDataTimer(): void {
    clearTimeout(this.noDataTimer);
    this.noDataTimer = undefined;
  }

  /** The count's second hand: on while the printer starts, else off. */
  private followStarting(counting: boolean): void {
    if (counting && !this.startingTimer) this.startingTimer = setInterval(() => this.requestUpdate(), TICK_MS);
    if (!counting && this.startingTimer) {
      clearInterval(this.startingTimer);
      this.startingTimer = undefined;
    }
  }

  protected override firstUpdated(changed: PropertyValues): void {
    super.firstUpdated(changed);
    this.menu.listen(this.shadow);
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    this.menu.keepKeyboardPlace();
    // An opened menu has the focus on its first item, as menus do.
    if (changed.has("menuOpen") && this.menuOpen) this.menu.opened();
    const dialog = this.renderRoot.querySelector("dialog");
    if (dialog && !dialog.open && this.isConnected) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      // The safe choice has the focus: Enter never confirms by accident. Its
      // row stands last in the dialog: focused with scrolling, a long dialog
      // would open scrolled down -- it opens at its top.
      dialog.querySelector<HTMLElement>(".dlg-actions .safe")?.focus({ preventScroll: true });
      dialog.scrollTop = 0;
    }
    // The button row may wrap to two lines: what the keyboard reaches stays
    // above it. Measured open: a closed dialog lays out nothing.
    const foot = dialog?.open ? dialog.querySelector<HTMLElement>(".dlg-actions") : null;
    if (dialog && foot) dialog.style.scrollPaddingBottom = `${foot.offsetHeight + 12}px`;
    this.filament.fitList(dialog);
    this.scan.followScan();
    // The window's picture goes to the top layer once it is a popover.
    this.live.showWindow();
  }

  // --- Camera ---------------------------------------------------------------

  /** The job's picture while a job runs or has just ended, as it loaded;
   * none: the printer's drawing. */
  private coverUrl(hass: Hass, refs: PrinterRefs): string | undefined {
    const cover = stateOf(hass, refs.cover);
    const url = cover && hasValue(hass, refs.cover) ? cover.attributes["entity_picture"] : undefined;
    const status = printerOnline(hass, refs) ? (stateOf(hass, refs.status)?.state ?? "unknown") : "offline";
    return typeof url === "string" && url !== this.brokenCover && WITH_JOB.has(status) ? url : undefined;
  }

  /** Remembers the external spools the job on the printer fed from: a
   * two-nozzle print takes one in turns with an AMS, a run-out unloads it
   * in the pause -- the job still prints from it. Forgotten when it ends. */
  private followJobSpools(hass: Hass): void {
    const refs = this.refs;
    const job = refs && printerOnline(hass, refs) && BUSY.has(stateOf(hass, refs.status)?.state ?? "") ? (this.jobOf(hass, refs) ?? "") : undefined;
    if (job !== this.spoolJob) {
      this.spoolJob = job;
      this.jobSpools = new Set();
    }
    if (!refs || job === undefined) return;
    const fed = refs.externalSpools.filter((entityId) => !this.jobSpools.has(entityId) && slotOf(hass, entityId).active);
    if (fed.length) this.jobSpools = new Set([...this.jobSpools, ...fed]);
  }

  /** The job's name as the printer reports it: another one is another job. */
  private jobOf(hass: Hass, refs: PrinterRefs): string | undefined {
    return stateOf(hass, refs.job)?.state;
  }

  /** Focuses an element of the card once it is drawn: the first of the
   * targets that finds one. */
  private focusAfterUpdate(...targets: Target[]): void {
    void this.updateComplete.then(() => {
      for (const target of targets) {
        const element =
          typeof target === "string"
            ? this.renderRoot.querySelector<HTMLElement>(target)
            : [...this.renderRoot.querySelectorAll<HTMLElement>(`dialog [${target.attribute}]`)].find((candidate) => candidate.getAttribute(target.attribute) === target.value);
        if (element) return element.focus();
      }
    });
  }

  /** The job's picture small again, and no job it belongs to. */
  private closeCover(): void {
    this.coverLarge = false;
    this.coverJob = undefined;
  }

  /** Escape on the large picture, or on the small one while it is large:
   * small again, as its ✕ does. */
  private readonly coverKeys = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this.coverLarge) return;
    event.preventDefault();
    event.stopPropagation();
    this.toggleCover();
  };

  /** The job's picture large, or small again: the area then shows what it
   * showed before. */
  private readonly toggleCover = (): void => {
    if (this.coverLarge) {
      this.closeCover();
      this.focusAfterUpdate("button.picture-open");
      return;
    }
    this.coverLarge = true;
    this.coverJob = this.hass && this.refs ? this.jobOf(this.hass, this.refs) : undefined;
    this.focusAfterUpdate(".big-cover .cover-close");
  };

  private readonly setStep = (step: Step): void => {
    this.step = step;
  };

  // --- Actions --------------------------------------------------------------

  /** Sends an action once at a time per key; whether it went through. */
  private async run(key: string, domain: string, service: string, data: Record<string, unknown>): Promise<boolean> {
    const hass = this.hass;
    if (!hass || this.pending.has(key)) return false;
    const pressed = this.shadow.activeElement as HTMLButtonElement | null;
    this.pending = new Set([...this.pending, key]);
    if (pressed && this.dialog) {
      // In a dialog, a button its own command disables keeps no focus: the
      // dialog's safe button takes it.
      void this.updateComplete.then(() => {
        if (pressed.disabled) this.renderRoot.querySelector<HTMLElement>("dialog .btn.safe")?.focus();
      });
    }
    try {
      await callAction(hass, domain, service, data);
      this.showSent();
      // An answer to an HMS message: the message goes, so the dialog does.
      if (key.startsWith("hms_") && this.dialog?.kind === "hms") this.closeDialog();
      return true;
    } catch (error) {
      this.showError(await errorText(hass, error));
      return false;
    } finally {
      this.pending = new Set([...this.pending].filter((item) => item !== key));
    }
  }

  private showError(text: string): void {
    this.error = text;
    clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => {
      this.error = undefined;
    }, ERROR_TIMEOUT);
  }

  /** A short "Sent": the printer got the command. It ends an earlier
   * error, which no longer says what happens now. */
  private showSent(): void {
    this.closeError();
    this.sent = true;
    clearTimeout(this.sentTimer);
    this.sentTimer = setTimeout(() => {
      this.sent = false;
    }, SENT_TIMEOUT);
  }

  /** A question opens: an earlier "Sent" would read as its answer. */
  private dropSent(): void {
    clearTimeout(this.sentTimer);
    this.sent = false;
  }

  private readonly closeError = (): void => {
    clearTimeout(this.errorTimer);
    this.error = undefined;
  };

  private moreInfo(entityId: string | undefined): void {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId } }));
  }

  /** Ends the dialog. It closes before it goes: the browser then gives the
   * focus back to the button that opened it, where a dialog just removed
   * leaves it nowhere. One the menu opened gives it to the three dots. */
  private readonly closeDialog = (): void => {
    const back = this.dialogBack;
    this.dialogBack = undefined;
    if (back && this.dialog && this.dialog !== back) {
      // The dialog stays open, with what it was opened from -- the
      // keyboard's place on the button that asked.
      this.dialog = back;
      const asker = this.asker;
      this.asker = undefined;
      this.focusAfterUpdate(...(asker ? [asker] : []), "dialog .btn.safe");
      return;
    }
    const fromMenu = this.dialogFromMenu;
    this.flows.stopCheckTimer();
    this.dialog = undefined;
    this.dialogFromMenu = false;
    const element = this.renderRoot.querySelector("dialog");
    if (element?.open) element.close();
    if (fromMenu) this.menu.focusMenuButton();
  };

  private readonly confirmDialog = (): void => {
    const dialog = this.dialog;
    if (dialog?.kind === "check") {
      void this.flows.startCheck();
      return;
    }
    // A question from the filament dialog or the HMS messages ends it: the
    // slot changes, the message goes.
    if (this.dialogBack?.kind === "filament" || this.dialogBack?.kind === "hms") this.dialogBack = undefined;
    this.closeDialog();
    if (!dialog) return;
    if (dialog.kind === "confirm") {
      const [domain, service, data] = dialog.action;
      void this.run(dialog.key, domain, service, data);
    } else if (dialog.kind === "hms") {
      void this.run("clear_hms", "button", "press", { entity_id: this.refs?.clearHms });
    } else if (dialog.kind === "skip") {
      void this.run("skip", "bambuddy", "skip_objects", { device_id: this.refs?.deviceId, objects: dialog.chosen });
    } else if (dialog.kind === "filament" && onInventory(this.hass as Hass, dialog)) {
      if (dialog.chosenSpool !== undefined) {
        void this.run(filamentKey(dialog.entityId), "bambuddy", "assign_spool", { entity_id: dialog.entityId, spool_id: dialog.chosenSpool });
      }
    } else if (dialog.kind === "filament") {
      void this.run(filamentKey(dialog.entityId), "bambuddy", "set_filament", { entity_id: dialog.entityId, ...filamentChanges(dialog) });
    } else if (dialog.kind === "drying") {
      void this.run(`dry_${dialog.unit.deviceId}`, "bambuddy", "start_drying", {
        device_id: dialog.unit.deviceId,
        temperature: dialog.temperature,
        duration: dialog.duration,
      });
    }
  };

  private readonly dialogActions = {
    close: this.closeDialog,
    confirm: this.confirmDialog,
    setDrying: (field: DryingField, value: number) => this.flows.setDrying(field, value),
    toggleObject: (id: number) => this.flows.toggleObject(id),
    ...this.filament.actions,
    copy: (text: string) => void this.flows.copy(text),
    confirmTask: (id: number | undefined) => this.flows.confirmTask(id),
    cancel: (event: Event) => {
      if (this.dialogBack) {
        event.preventDefault();
        this.closeDialog();
        return;
      }
      if (this.dialog?.kind !== "maintenance" || this.dialog.confirming === undefined) return;
      event.preventDefault();
      this.flows.confirmTask(undefined);
    },
    markDone: (id: number, name: string) => void this.flows.markDone(id, name),
    ...this.scan.actions,
    toggleFold: (which: "pass" | "skip") => this.flows.toggleFold(which),
    now: () => Date.now(),
  } satisfies DialogActions;

  // --- Rendering ------------------------------------------------------------

  private context(hass: Hass, refs: PrinterRefs): CardContext {
    const online = printerOnline(hass, refs);
    const reported = stateOf(hass, refs.status)?.state ?? "unknown";
    const status = online ? reported : "offline";
    // The print status has a state even while the printer is offline: none
    // means the integration has no answer from BamBuddy at all.
    const unreachable = noPrinterData(hass, refs);
    // No data because BamBuddy no longer lists the printer: the
    // integration says so (it waits under Repairs).
    const missing = unreachable && notListed(hass, refs);
    const waiting = unreachable && !missing && this.noDataFrom !== undefined && Date.now() - this.noDataFrom < NO_DATA_WAIT_MS;
    const permitted = hasControls(refs);
    const settings = this.settings;
    const canControl = permitted && !settings.readOnly;
    const ams = shownUnits(hass, refs);
    const units = ams.length;
    return {
      hass,
      settings,
      refs,
      ams,
      status,
      online,
      unreachable,
      missing,
      waiting,
      busy: BUSY.has(status),
      running: RUNNING.has(status),
      changing: online && FILAMENT_CHANGE.has(stateOf(hass, refs.amsStatus)?.state ?? ""),
      canControl,
      viewOnly: settings.readOnly && permitted,
      examples: this.preview && this.inEditor,
      controlTab: settings.controlTab && permitted && settings.sections.some((section) => sectionShown(refs, section, settings.readOnly)),
      filamentTab: settings.filamentTab && (units > 0 || refs.externalSpools.length > 0),
      jobSpools: this.jobSpools,
      ...(this.live.liveOffered(online) ? { startLive: this.live.startLive } : {}),
      isPending: (key) => this.pending.has(key),
      run: (key, domain, service, data) => void this.run(key, domain, service, data),
      confirm: (confirmation) => {
        if (this.dialog?.kind === "power" || this.dialog?.kind === "hms") this.parkDialog();
        else this.dialogBack = undefined;
        this.dropSent();
        this.dialog = { kind: "confirm", ...confirmation };
      },
      dry: (unit) => this.flows.openDrying(unit),
      openFilament: (slot, title, inventoryOnly) => this.filament.openFilament(slot, title, inventoryOnly),
      skip: () => void this.flows.openSkip(),
      targetOf: (entityId) => this.drafts.targetOf(entityId),
      stepTarget: (entityId, value) => this.drafts.stepTarget(entityId, value),
      setTargets: (targets) => this.drafts.setTargets(targets),
      switchOn: (entityId) => this.drafts.switchOn(entityId),
      toggleSwitch: (entityId) => void this.drafts.toggleSwitch(entityId),
      chosenOption: (entityId) => this.drafts.chosenOption(entityId),
      selectOption: (entityId, option, key) => void this.drafts.selectOption(entityId, option, key),
      optionsOpen: this.optionsOpen,
      toggleOptions: () => {
        this.optionsOpen = !this.optionsOpen;
      },
      amsUnfolded: (unit) => this.amsOpen.get(unit.deviceId) ?? (settings.amsFolding === "open" || (settings.amsFolding === "auto" && units < 3)),
      toggleAms: (unit, open) => {
        this.amsOpen = new Map(this.amsOpen).set(unit.deviceId, open);
      },
      moreInfo: (entityId) => this.moreInfo(entityId),
      show: (view) => {
        this.view = view;
      },
      checkConnection: () => {
        this.dialogFromMenu = false;
        void this.flows.startCheck();
      },
      openAutoOff: () => {
        // The row that opened them: its label changes with the settings.
        if (this.dialog?.kind === "power") this.parkDialog("dialog .p-open");
        else this.dialogBack = undefined;
        this.dialog = { kind: "auto_off" };
        this.dialogFromMenu = false;
      },
    };
  }

  /** Status always; Control where the card may control the printer and a
   * chosen section has something to show; Filament where it has an AMS unit
   * or an external spool -- each unless switched off. */
  private views(ctx: CardContext): View[] {
    return ["status", ...(ctx.controlTab ? ["control" as const] : []), ...(ctx.filamentTab ? ["filament" as const] : [])];
  }

  private header(ctx: CardContext): TemplateResult {
    const { hass, refs } = ctx;
    const light = refs.light ? stateOf(hass, refs.light) : undefined;
    // What was tapped, until the light reports it (as a switch does).
    const lightOn = refs.light && light ? this.drafts.switchOn(refs.light) : false;
    // A printer without a chamber: its light is a light.
    const lightKey: TextKey = refs.plainLight ? "light_plain" : "light";
    const title = printerTitle(ctx);
    const subline = subtitle(ctx);
    const open = (chip: DialogChip): void => {
      this.dialog = { kind: chip };
      this.dialogFromMenu = false;
    };
    return html`<div class="head">
      <span class="dot ${ctx.online ? "on" : ""}" role="img" aria-label=${t(hass, connection(ctx))} title=${t(hass, connection(ctx))}></span>
      <div class="names">
        <div class="name" role="heading" aria-level="2" title=${title}>${title}</div>
        ${subline ? html`<div class="model">${subline}</div>` : nothing}
      </div>
      ${refs.light && ctx.canControl
        ? html`<button
            class="icon-btn light ${lightOn ? "on" : ""} ${this.pending.has("light") ? "pending" : ""}"
            aria-label=${t(hass, lightKey)}
            title=${t(hass, lightKey)}
            aria-pressed=${lightOn ? "true" : "false"}
            aria-busy=${this.pending.has("light") ? "true" : "false"}
            aria-disabled=${this.pending.has("light") ? "true" : nothing}
            ?disabled=${!ctx.online || light?.state === "unavailable"}
            @click=${() => void this.drafts.toggleSwitch(refs.light as string, "light", "light")}
          >
            ${icon(lightOn ? "lightOn" : "lightOff")}
          </button>`
        : refs.light && ctx.viewOnly
          ? html`<span
              class="icon-btn light state ${lightOn ? "on" : ""}"
              role="img"
              aria-label="${t(hass, lightKey)}: ${t(hass, lightOn ? "on" : "off")}"
              title="${t(hass, lightKey)}: ${t(hass, lightOn ? "on" : "off")}"
              >${icon(lightOn ? "lightOn" : "lightOff")}</span
            >`
          : nothing}
      ${this.menu.render(ctx)}
    </div>
    ${chips(ctx, open)}`;
  }

  /** The tabs; `shown` is the view drawn -- Status where the chosen one is
   * not there. The arrow keys, Home and End switch: a view sends nothing. */
  private tabs(views: View[], shown: View): TemplateResult | typeof nothing {
    if (views.length < 2) return nothing;
    const hass = this.hass as Hass;
    const select = (view: View): void => {
      this.view = view;
    };
    const keys = (event: KeyboardEvent): void => {
      const index = views.indexOf(shown);
      const to = nextIndex(event.key, index, views.length, "horizontal");
      if (to === undefined) return;
      event.preventDefault();
      select(views[to] as View);
      void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('.tabs [aria-selected="true"]')?.focus());
    };
    return html`<div class="tabs" role="tablist" aria-label=${t(hass, "aria_views")} @keydown=${keys}>
      ${views.map(
        (view) => html`<button
          role="tab"
          id="tab-${view}"
          aria-selected=${view === shown ? "true" : "false"}
          aria-controls=${PANEL}
          tabindex=${view === shown ? 0 : -1}
          title=${t(hass, `tab_${view}`)}
          @click=${() => select(view)}
        >
          <span class="tab-icon" aria-hidden="true">${icon(TAB_ICONS[view])}</span><span class="tab-text">${t(hass, `tab_${view}`)}</span>
        </button>`,
      )}
    </div>`;
  }

  /** The picture beside the job: its cover while there is a job, else the
   * drawing. A tap on the cover shows it large; the live view starts only
   * by the camera's own button in its corner, on the cover and the drawing
   * alike, where the camera can stream. */
  private picture(ctx: CardContext): TemplateResult {
    const { hass, refs } = ctx;
    const url = this.coverUrl(hass, refs);
    const content =
      url !== undefined
        ? html`<img
            class="cover"
            src=${url}
            alt=""
            @error=${() => {
              this.brokenCover = url;
            }}
          />`
        : printerDrawing();
    const enlarge = url !== undefined && !this.preview;
    if (!enlarge && !ctx.startLive) return html`<div class="picture ${ctx.online ? "" : "offline-pic"}">${content}</div>`;
    // The tooltip says what a click does; a screen reader keeps the name and hears the state.
    const opened = this.coverLarge;
    return html`<div class="picture">
      ${enlarge
        ? html`<button
            class="picture-open"
            aria-label=${t(hass, "cover_open")}
            title=${t(hass, opened ? "cover_close" : "cover_open")}
            aria-pressed=${opened ? "true" : "false"}
            @click=${this.toggleCover}
            @keydown=${this.coverKeys}
          >
            ${content}
          </button>`
        : content}
      ${ctx.startLive
        ? html`<button class="live-hint" aria-label=${t(hass, "live")} title=${t(hass, "live")} @click=${ctx.startLive}>${icon("video")}</button>`
        : nothing}
    </div>`;
  }

  private livePanel(): TemplateResult | typeof nothing {
    const hass = this.hass as Hass;
    const coverUrl = this.coverLarge && this.refs ? this.coverUrl(hass, this.refs) : undefined;
    if (coverUrl !== undefined) {
      return html`<div class="big-cover" @keydown=${this.coverKeys}>
        <img
          src=${coverUrl}
          alt=""
          @error=${() => {
            this.brokenCover = coverUrl;
          }}
        />
        <div class="live-tools">
          <button class="icon-btn cover-close" aria-label=${t(hass, "cover_close")} title=${t(hass, "cover_close")} @click=${this.toggleCover}>
            ${icon("close")}
          </button>
        </div>
      </div>`;
    }
    return this.live.panel();
  }

  private errorLine(): TemplateResult | typeof nothing {
    const hass = this.hass as Hass;
    if (!this.error) {
      // A slot without height that sticks to the screen's bottom: nothing
      // moves, and a tall card shows it where the eye is.
      return this.sent ? snack("sent-slot", t(hass, "sent")) : nothing;
    }
    return html`<div class="toast" role="alert">
      ${icon("error")}<span>${this.error}</span>
      <button class="icon-btn" aria-label=${t(hass, "error_dismiss")} title=${t(hass, "error_dismiss")} @click=${this.closeError}>${icon("close")}</button>
    </div>`;
  }

  protected override render(): TemplateResult | typeof nothing {
    const hass = this.hass;
    const config = this.config;
    if (!hass || !config) return nothing;
    const refs = this.refs;
    if (!refs) {
      const device = config.printer ? hass.devices[config.printer] : undefined;
      const reason: TextKey = !config.printer ? "no_printer" : !device ? "not_found" : hasPrinterIdentifier(device) ? "waiting_for_printer" : "not_a_printer";
      return html`<ha-card><div class="message">${t(hass, reason)}</div></ha-card>`;
    }
    const ctx = this.context(hass, refs);
    // The printer starts after its plug went on: the count runs.
    this.followStarting(starting(ctx) !== undefined);
    const views = this.views(ctx);
    const view = views.includes(this.view) ? this.view : "status";
    let body: TemplateResult;
    if (!ctx.online && view !== "status") {
      // Offline the Control and Filament tabs show nothing they hold: they
      // say it as the Status tab does -- in the editor's preview, examples.
      body = ctx.examples
        ? sample(ctx, sampleKey(ctx), view === "control" ? controlView(asOnline(ctx), this.step, this.setStep) : filamentView(asOnline(ctx)))
        : offlineJob(ctx, this.picture(ctx));
    } else if (view === "control") {
      body = controlView(ctx, this.step, this.setStep);
    } else if (view === "filament") body = filamentView(ctx);
    else body = statusView(ctx, this.picture(ctx));
    // With tabs, the body is the panel of the tab selected.
    const tabbed = views.length > 1;
    return html`<ha-card>
      <div class="card-status sr-only" role="status" aria-atomic="true">${printerTitle(ctx)}: ${ctx.online ? stateText(ctx, true) : t(hass, connection(ctx))}</div>
      ${this.header(ctx)}${this.tabs(views, view)}${this.livePanel()}
      <div
        class="body"
        role=${tabbed ? "tabpanel" : nothing}
        id=${tabbed ? PANEL : nothing}
        aria-labelledby=${tabbed ? `tab-${view}` : nothing}
      >
        ${body}
      </div>
      ${this.dialog ? dialogView(ctx, this.dialog, this.dialogActions, this.errorLine()) : this.errorLine()}
    </ha-card>`;
  }
}

// The editor first: Home Assistant asks for it once the card is defined.
defineElement(EDITOR_TAG, BamBuddyPrinterCardEditor);
defineCard(TAG, BamBuddyPrinterCard, {
  name: () => t(undefined, "picker_name"),
  description: () => t(undefined, "picker_description"),
});
