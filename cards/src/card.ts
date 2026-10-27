// The BamBuddy printer card: one printer with its AMS units, in three
// views -- status, control, filament. It finds its entities itself (see
// discovery.ts) and draws again only when one of them changed: Home
// Assistant hands a card a new hass on every state change in the house.
import { html, LitElement, nothing, type CSSResultGroup, type PropertyValues, type TemplateResult } from "lit";

import { callAction, errorText, filamentOffer, kProfiles, printObjects } from "./actions";
import { controlView, sectionShown, type Step } from "./control-view";
import { dialogView, DRYING, filamentChanges, inPalette, KEEP, matchingProfile, ownVendor, type Dialog, type DryingField, type DryingSpool, type FilamentDialog } from "./dialogs";
import { findPrinter, hasControls, isPrinterDevice, notListed, printerDevices, printerOnline, printStatus, shownUnits } from "./discovery";
import { filamentView } from "./filament-view";
import { BUSY, FILAMENT_CHANGE, formatNumber, formatPercent, hasValue, numericState, RUNNING, stateOf, textOrUndefined, WITH_JOB } from "./format";
import { BamBuddyPrinterCardEditor, EDITOR_TAG, loadForm } from "./editor";
import { DEFAULTS, settingsOf, validateConfig, type Settings } from "./forms";
import { runCheck, type CheckDialog } from "./check";
import { pills, printerTitle, subtitle, type Pill } from "./header";
import { maintenanceOf } from "./maintenance";
import { icon, printerDrawing, type IconName } from "./icons";
import { rememberLocale, t, type TextKey } from "./i18n";
import { asOnline, connection, sample, sampleKey, slotOf, snack, type CardContext, type Slot } from "./parts";
import { defineCard, defineElement } from "./register";
import { cardPlugs, starting } from "./power";
import { offlineJob, stateText, statusView } from "./status-view";
import { cardStyles } from "./styles";
import type { AmsRefs, CardConfig, Hass, HassEntityState, PrinterRefs, StatusBlock, View } from "./types";

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

/** A target is sent this long after the last tap on its stepper. */
const TARGET_DELAY = 800;

/** How long a sent target shows at most while its entity still reports the
 * old one: BamBuddy reports back within a poll or two. */
const TARGET_HOLD = 10_000;

/** A target the card shows before its entity does: being tapped, or sent
 * while the entity still reported `sentFrom`. A switch's or the light's:
 * the state tapped last, until the entity reports it. */
interface Draft {
  value: number;
  sentFrom?: string;
  wish?: "on" | "off";
  /** The entity reported something else than `sentFrom` since. */
  moved?: boolean;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** A fan entity: stepped by its percentage, not a number's state. */
const isFan = (entityId: string): boolean => entityId.startsWith("fan.");

/** How long after a key in the card its place is kept for the keyboard, in ms. */
const KEYBOARD_PLACE_FOR = 15_000;
/** The open menu's least room to the screen's edges, in px. */
const MENU_MARGIN = 8;

/** The groups a press may disable its own button in, nearest first: the
 * keyboard goes to the next button of the nearest one. */
const FOCUS_GROUPS = [".stepper", ".heat-set", ".heat-row", ".heating"];
/** How long the browser may take to grant full screen before the window
 * stands in. */
const FULLSCREEN_WAIT_MS = 1500;
/** Hidden this long while the browser is asked for full screen, the page is
 * hidden for good: Home Assistant's Android app hides it for up to a tenth
 * of a second while it brings the picture into full screen. */
const PAGE_HIDDEN_GRACE_MS = 1000;
/** Each full screen's history entry, told apart from another card's and
 * from one an earlier page load left: history outlives a reload. */
let fullscreenEntries = 0;
const FULLSCREEN_PAGE = Date.now().toString(36);
/** A card taken off the page keeps its live view this long: a dashboard
 * may put it back (a masonry view laying its columns out anew appends each
 * card once it has measured it). */
const LIVE_GRACE_MS = 2000;

/** The slot dialog's K field says the printer is slow after this long:
 * BamBuddy asks it again then (its 5 s per try). */
const K_SLOW_MS = 5000;

/** A key pressed in an open dialog: the dialog's, not full screen's. */
const inOpenDialog = (event: Event): boolean => event.composedPath().some((node) => node instanceof HTMLDialogElement && node.open);

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
    drafts: { state: true },
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
  protected fullscreen: "off" | "native" | "window" = "off";
  /** The window's top layer is shown: the popover to hide on leaving. */
  private popoverShown = false;
  /** Each request for full screen, so an answer that comes after the
   * picture was left again does nothing. */
  private fullscreenAsk = 0;
  private fullscreenWait?: ReturnType<typeof setTimeout>;
  /** The browser is asked and has not answered yet. */
  private fullscreenAsking = false;
  /** The history entry this full screen pushed: back leaves full screen,
   * not the dashboard. */
  private fullscreenEntry = "";
  /** Off the page with a live view: it ends when this runs out. */
  private liveGrace?: ReturnType<typeof setTimeout>;
  protected pageVisible = document.visibilityState !== "hidden";
  private hiddenWait?: ReturnType<typeof setTimeout>;
  protected streamFailed = false;
  protected brokenCover?: string;
  protected pending: ReadonlySet<string> = new Set();
  protected error?: string;
  protected sent = false;
  protected dialog?: Dialog;
  protected menuOpen = false;
  /** 1 mm: a tap never moves Z far (the bed into the nozzle, or the nozzle into the bed). */
  protected step: Step = 1;
  protected drafts: ReadonlyMap<string, Draft> = new Map();
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
  private streamSrc?: string;
  /** The frame rate the running stream asked for. */
  private streamFps?: number;
  /** The stream addresses this page loaded: started again at one of them,
   * the browser would show the picture it kept of the ended stream and ask
   * for nothing. A count makes such an address new (Home Assistant ignores
   * it). */
  private readonly streamsLoaded = new Set<string>();
  private streamRun = 0;
  /** The control the keyboard was on last, and when a key was last pressed
   * in the card: a keyboard user's place, kept when a press takes the
   * control away. */
  private focusedLast?: HTMLElement;
  private keyedAt = 0;
  private errorTimer?: ReturnType<typeof setTimeout>;
  private sentTimer?: ReturnType<typeof setTimeout>;
  private copiedTimer?: ReturnType<typeof setTimeout>;
  private kSlowTimer?: ReturnType<typeof setTimeout>;
  /** The slot dialog's opens, counted: each its own answers. */
  private asks = 0;
  private readonly draftTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private attached = false;
  /** Draws the seconds of a connection check while it runs. */
  private checkTimer?: ReturnType<typeof setInterval>;
  /** Draws the count every second while the printer starts after its plug. */
  private startingTimer?: ReturnType<typeof setInterval>;
  /** In the card editor: its preview shows examples. */
  private inEditor = false;
  /** The open dialog came from the menu: closing it focuses the three dots. */
  private dialogFromMenu = false;
  /** The chip's plugs dialog, or the HMS messages, a question or the
   * switch-off's settings were opened from: they go back to it. */
  private dialogBack: Dialog | undefined = undefined;
  /** The selector of the button in that dialog that asked the question. */
  private asker: string | undefined = undefined;

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
    const active = (this.renderRoot as ShadowRoot).activeElement;
    // An answer by its key (two messages may offer the same), else by its name.
    const answer = active?.getAttribute("data-answer");
    const label = active?.getAttribute("aria-label");
    const quoted = (value: string): string => value.replace(/["\\]/g, "\\$&");
    this.asker = answer ? `dialog [data-answer="${quoted(answer)}"]` : label ? `dialog [aria-label="${quoted(label)}"]` : undefined;
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
    const printers = hass ? printerDevices(hass) : [];
    const online = printers.find((device) => hass && !OFFLINE.includes(printStatus(hass, device.id) ?? "unavailable"));
    const first = online ?? printers[0];
    return first ? { printer: first.id } : {};
  }

  setConfig(config: unknown): void {
    this.config = validateConfig(config);
    this.settings = settingsOf(this.config);
    this.view = this.settings.startView;
    this.amsOpen = new Map();
    this.liveWanted = false;
    this.coverLarge = false;
    this.coverJob = undefined;
    this.refs = undefined;
    // The stream too: it may be another printer's now (the first config
    // comes before the card is drawn).
    if (this.streamSrc !== undefined) this.stopStream();
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

  /** Off the page for good: the live view ends. */
  private endLiveAway(): void {
    this.liveGrace = undefined;
    this.attached = false;
    this.leaveFullscreen();
    this.stopStream();
    this.liveWanted = false;
  }

  /** Hidden, the stream stops -- and full screen with it. While the browser
   * is asked for full screen only after a moment: taken out at once, the
   * picture would leave the page before the Android app's full screen shows
   * it, and the browser refuses it. Otherwise at once: a phone may run no
   * timer on a hidden page. */
  private readonly onVisibility = (): void => {
    this.stopHiddenWait();
    if (document.visibilityState !== "hidden") {
      this.pageVisible = true;
      return;
    }
    if (!this.fullscreenAsking) {
      this.pageHidden();
      return;
    }
    this.hiddenWait = setTimeout(() => {
      this.hiddenWait = undefined;
      this.pageHidden();
    }, PAGE_HIDDEN_GRACE_MS);
  };

  private pageHidden(): void {
    this.pageVisible = false;
    this.stopStream();
  }

  private stopHiddenWait(): void {
    clearTimeout(this.hiddenWait);
    this.hiddenWait = undefined;
  }

  /** A tap anywhere but in the menu closes it. */
  private readonly onPointerDown = (event: Event): void => {
    if (!this.menuOpen) return;
    const menu = this.renderRoot.querySelector(".menu-wrap");
    if (menu && !event.composedPath().includes(menu)) this.menuOpen = false;
  };

  override connectedCallback(): void {
    super.connectedCallback();
    // Back within the grace: the live view goes on (in the window, where the
    // move ended the browser's full screen).
    clearTimeout(this.liveGrace);
    this.liveGrace = undefined;
    this.pageVisible = document.visibilityState !== "hidden";
    this.attached = true;
    this.inEditor = inCardEditor(this);
    // Back while a check runs: its seconds count on.
    if (this.dialog?.kind === "check" && this.dialog.running) this.startCheckTimer();
    document.addEventListener("visibilitychange", this.onVisibility);
    document.addEventListener("pointerdown", this.onPointerDown);
    this.requestUpdate();
  }

  override disconnectedCallback(): void {
    document.removeEventListener("visibilitychange", this.onVisibility);
    // Away, the page's visibility is read anew on the return.
    this.stopHiddenWait();
    document.removeEventListener("pointerdown", this.onPointerDown);
    this.menuOpen = false;
    // Leaving the page took the picture out of the top layer, and out of
    // the browser's full screen -- which says so only a frame later, maybe
    // after a dashboard put the card back: the window stands in now.
    this.popoverShown = false;
    if (this.fullscreen === "native") this.fullscreen = "window";
    if (this.streamSrc || this.liveWanted || this.fullscreen !== "off") {
      // A dashboard may put the card back at once: the live view waits.
      clearTimeout(this.liveGrace);
      this.liveGrace = setTimeout(() => this.endLiveAway(), LIVE_GRACE_MS);
    } else {
      this.endLiveAway();
    }
    // An error belongs to the moment it happened: none waits for the return.
    clearTimeout(this.errorTimer);
    this.followStarting(false);
    this.error = undefined;
    clearTimeout(this.sentTimer);
    this.sent = false;
    clearTimeout(this.copiedTimer);
    this.stopCheckTimer();
    if (this.dialog?.kind === "info") this.dialog = { kind: "info" };
    // A target still being tapped is sent now, not lost.
    for (const [entityId, draft] of this.drafts) if (draft.sentFrom === undefined) void this.sendTarget(entityId);
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
    // The large picture goes with its job, and offline: the mode's own
    // then -- nothing on tap, the live view always.
    if (this.coverLarge) {
      const refs = this.refs;
      const gone = !refs || this.preview || !printerOnline(hass, refs) || this.coverUrl(hass, refs) === undefined || this.jobOf(hass, refs) !== this.coverJob;
      if (gone) {
        this.coverLarge = false;
        this.coverJob = undefined;
        this.liveWanted = false;
      }
    }
    // Full screen ends with the stream (a new frame rate only restarts it):
    // the camera gone, the live view closed, the page hidden, a broken stream.
    if ((this.fullscreen !== "off" || this.fullscreenAsking) && !this.streaming()) this.leaveFullscreen();
    // A stream a state ends goes as one that is closed: its image still
    // holds the address here, and the browser would keep loading it.
    if (!this.streaming()) {
      if (this.streamSrc) this.stopStream();
    } else {
      // A new frame rate: the stream starts anew to ask for it.
      const rate = this.frameRate();
      if (this.streamSrc && rate !== undefined && rate !== this.streamFps) this.stopStream();
      if (!this.streamSrc) {
        this.streamFps = rate;
        const url = this.streamUrl();
        this.streamSrc = this.streamsLoaded.has(url) ? `${url}&run=${++this.streamRun}` : url;
        this.streamsLoaded.add(url);
      }
    }
    // A sent target goes once its entity reports a new state; a toggle once
    // it reports what was tapped last -- after it moved: a second tap may
    // wish the state it still shows --, or leaves on and off.
    for (const [entityId, draft] of this.drafts) {
      const state = hass.states[entityId]?.state;
      if (draft.wish) draft.moved ||= state !== draft.sentFrom;
      const done = draft.wish
        ? (state !== "on" && state !== "off") || (state === draft.wish && draft.moved === true)
        : draft.sentFrom !== undefined && this.draftMark(entityId) !== draft.sentFrom;
      if (done) this.dropDraft(entityId);
    }
  }

  /** The count's second hand: on while the printer starts, else off. */
  private followStarting(counting: boolean): void {
    if (counting && !this.startingTimer) this.startingTimer = setInterval(() => this.requestUpdate(), 1000);
    if (!counting && this.startingTimer) {
      clearInterval(this.startingTimer);
      this.startingTimer = undefined;
    }
  }

  protected override firstUpdated(changed: PropertyValues): void {
    super.firstUpdated(changed);
    this.renderRoot.addEventListener("focusin", (event) => {
      const target = event.composedPath()[0];
      this.focusedLast = target instanceof HTMLElement ? target : undefined;
    });
    this.renderRoot.addEventListener("keydown", () => {
      this.keyedAt = Date.now();
    });
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    this.keepKeyboardPlace();
    // An opened menu has the focus on its first item, as menus do.
    if (changed.has("menuOpen") && this.menuOpen) {
      this.placeMenu();
      this.menuItems()[0]?.focus();
    }
    const dialog = this.renderRoot.querySelector("dialog");
    if (dialog && !dialog.open && this.isConnected) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      // The safe choice has the focus: Enter never confirms by accident.
      dialog.querySelector<HTMLElement>(".dlg-actions .safe")?.focus();
    }
    // The button row may wrap to two lines: what the keyboard reaches stays
    // above it. Measured open: a closed dialog lays out nothing.
    const foot = dialog?.open ? dialog.querySelector<HTMLElement>(".dlg-actions") : null;
    if (dialog && foot) dialog.style.scrollPaddingBottom = `${foot.offsetHeight + 12}px`;
    // The window's picture goes to the top layer once it is a popover.
    const live = this.liveElement();
    if (this.fullscreen === "window" && !this.popoverShown && live?.hasAttribute("popover")) {
      try {
        live.showPopover();
        this.popoverShown = true;
      } catch {
        // Its own layer covers the window all the same.
      }
    }
  }

  /** A press took the keyboard's control away -- a stepper's end, a
   * heater's off, the plate cleared, a load that starts a
   * filament change, an HMS answer that closes its dialog: the nearest
   * group's next button takes the focus, else the selected tab, else the
   * menu button. Only right after a key in the card, and only while the
   * focus is still on that control or fell to the page: a mouse's place,
   * or one elsewhere on the page, is not the card's to take. */
  private keepKeyboardPlace(): void {
    // A card taken off the page has no keyboard place to keep.
    if (!this.isConnected) return;
    const last = this.focusedLast;
    if (!last || Date.now() - this.keyedAt > KEYBOARD_PLACE_FOR) return;
    const inside = (this.renderRoot as ShadowRoot).activeElement;
    if (inside && inside !== last) return;
    // Nothing focused in the card: only where the focus fell to the page.
    const page = document.activeElement;
    if (!inside && page !== null && page !== document.body && page !== this) return;
    if (last.isConnected && !(last as HTMLButtonElement).disabled) {
      // Still there, but moved (a list sorted anew under it): a browser
      // blurs a node it moves. In an open dialog the page is out of reach,
      // so the focus can only have fallen there: it goes back.
      if (!inside && this.renderRoot.querySelector("dialog[open]")) last.focus();
      return;
    }
    this.focusedLast = undefined;
    const enabled = "button:not([disabled]), input:not([disabled])";
    const next = last.isConnected ? FOCUS_GROUPS.map((group) => last.closest(group)?.querySelector<HTMLElement>(enabled)).find(Boolean) : undefined;
    // Behind an open dialog the card is out of reach: its safe button then.
    const safe = this.renderRoot.querySelector<HTMLElement>("dialog[open] .dlg-actions .safe");
    (next ?? safe ?? this.renderRoot.querySelector<HTMLElement>('.tabs [aria-selected="true"]') ?? this.renderRoot.querySelector<HTMLElement>(".menu-btn"))?.focus();
  }

  /** The open menu on the screen: on a narrow card at the screen's left
   * edge it would open partly off it. `translate`, not `transform`: its
   * opening animation moves `transform`. */
  private placeMenu(): void {
    const menu = this.renderRoot.querySelector<HTMLElement>(".menu");
    if (!menu) return;
    menu.style.translate = "";
    const box = menu.getBoundingClientRect();
    if (!box.width) return;
    const shift = Math.max(MENU_MARGIN - box.left, 0) + Math.min(window.innerWidth - MENU_MARGIN - box.right, 0);
    menu.style.translate = shift ? `${shift}px 0` : "";
  }

  // --- Camera ---------------------------------------------------------------

  /** The camera's stream token, while the camera can stream. */
  private cameraToken(): string | undefined {
    const camera = this.refs?.camera;
    if (!this.hass || !camera || !hasValue(this.hass, camera)) return undefined;
    return textOrUndefined(stateOf(this.hass, camera)?.attributes["access_token"]);
  }

  /** Whether the live stream runs now. Not after it broke: "Try again"
   * starts it anew, with the token of that moment. */
  private streaming(): boolean {
    if (this.settings.camera === "off" || this.coverLarge || this.preview || !this.attached || !this.pageVisible || this.streamFailed) return false;
    if (!this.refs || !this.cameraToken()) return false;
    return this.settings.camera === "always" || this.liveWanted;
  }

  /** The frames a second the camera's streams ask for; `arriving`: the
   * ones that arrive while a stream runs. */
  private frameRate(arriving = false): number | undefined {
    const rate = this.refs?.camera ? stateOf(this.hass as Hass, this.refs.camera)?.attributes[arriving ? "streamed_frame_rate" : "frame_rate"] : undefined;
    return typeof rate === "number" ? rate : undefined;
  }

  /** The live stream through Home Assistant's camera proxy. It is read when
   * the stream starts and kept while it runs: the token rotates, the
   * running stream does not need a new one. The rate is for the browser:
   * a new one is a new address, and the image loads anew. */
  private streamUrl(): string {
    const rate = this.streamFps === undefined ? "" : `&fps=${this.streamFps}`;
    return `/api/camera_proxy_stream/${this.refs?.camera}?token=${encodeURIComponent(this.cameraToken() ?? "")}${rate}`;
  }

  /** Ends a running stream at once; dropping the image alone can leave the
   * browser loading it. */
  private stopStream(): void {
    for (const image of this.renderRoot.querySelectorAll("img.stream")) image.removeAttribute("src");
    this.streamSrc = undefined;
  }

  /** Whether a tap can start the live view now: where it does not show --
   * on tap until it is opened, always while the large picture stands in
   * its place. */
  private liveOffered(online: boolean): boolean {
    const camera = this.settings.camera;
    if (camera === "off" || !online || this.preview || this.cameraToken() === undefined) return false;
    return this.coverLarge || (camera === "tap" && !this.liveWanted);
  }

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
   * selectors that finds one. */
  private focusAfterUpdate(...selectors: string[]): void {
    void this.updateComplete.then(() => {
      for (const selector of selectors) {
        const element = this.renderRoot.querySelector<HTMLElement>(selector);
        if (element) return element.focus();
      }
    });
  }

  /** The keyboard's place goes with the live view: to its close button. */
  private readonly startLive = (): void => {
    this.streamFailed = false;
    this.coverLarge = false;
    this.coverJob = undefined;
    if (this.settings.camera === "tap") this.liveWanted = true;
    this.focusAfterUpdate(".live .live-close", ".live .live-full");
  };

  /** The job's picture large, or small again: the area then shows what it
   * showed before. */
  private readonly toggleCover = (): void => {
    if (this.coverLarge) {
      this.coverLarge = false;
      this.coverJob = undefined;
      this.focusAfterUpdate("button.picture-open");
      return;
    }
    this.coverLarge = true;
    this.coverJob = this.hass && this.refs ? this.jobOf(this.hass, this.refs) : undefined;
    this.focusAfterUpdate(".big-cover .cover-close");
  };

  /** Closed, the place goes back to the button that opens it: the picture,
   * or the control view's camera button -- in the filament view, which has
   * none, to its tab. */
  private readonly closeLive = (): void => {
    this.stopStream();
    this.liveWanted = false;
    this.streamFailed = false;
    this.focusAfterUpdate("button.live-hint", ".btn.live-btn", '.tabs [aria-selected="true"]');
  };

  private liveElement(): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(".live");
  }

  /** Whether the browser shows this card's picture full screen. Seen from
   * the card's own shadow root: the document sees only the outermost shadow
   * host, Home Assistant's own element. */
  private ownFullscreen(): boolean {
    const live = this.liveElement();
    return live !== null && (this.renderRoot as ShadowRoot).fullscreenElement === live;
  }

  /** The full-screen icon: in, or out again. The browser's full screen is
   * asked for within the click -- Firefox and Safari allow it only right
   * after one. The same element grows: no second stream. */
  private readonly toggleFullscreen = (): void => {
    if (this.fullscreen !== "off") {
      this.leaveFullscreen();
      return;
    }
    const live = this.liveElement();
    if (!live || this.fullscreenAsking) return;
    this.followFullscreen(true);
    const ask = ++this.fullscreenAsk;
    if (document.fullscreenEnabled && typeof live.requestFullscreen === "function") {
      let asked: Promise<void> | undefined;
      try {
        asked = live.requestFullscreen();
      } catch {
        asked = undefined;
      }
      if (asked && typeof asked.then === "function") {
        this.fullscreenAsking = true;
        // Neither granted nor refused in time: the window stands in.
        this.fullscreenWait = setTimeout(() => this.useWindow(ask), FULLSCREEN_WAIT_MS);
        asked.then(
          () => {
            clearTimeout(this.fullscreenWait);
            this.fullscreenAsking = false;
            // Granted after the window stood in, or after the picture was
            // left again: not wanted.
            if (this.fullscreen === "window" || ask !== this.fullscreenAsk) document.exitFullscreen().catch(() => undefined);
          },
          () => {
            clearTimeout(this.fullscreenWait);
            this.fullscreenAsking = false;
            this.useWindow(ask);
          },
        );
        return;
      }
    }
    this.useWindow(ask);
  };

  /** Where the browser has no full screen for the picture (an iPhone), or
   * refuses it: the picture fills the window. */
  private useWindow(ask: number): void {
    if (ask !== this.fullscreenAsk) return;
    this.fullscreenAsking = false;
    // Taken off the page meanwhile: no window to fill, no history entry.
    if (this.fullscreen === "off" && this.isConnected) this.enterMode("window");
  }

  /** In full screen: an entry in the history of its own -- back (a gesture,
   * the mouse's button, Alt+Left) leaves full screen, not the dashboard. It
   * carries no address: Home Assistant's router and dialogs read none of it. */
  private enterMode(mode: "native" | "window"): void {
    this.fullscreen = mode;
    this.fullscreenEntry = `${FULLSCREEN_PAGE}-${++fullscreenEntries}`;
    history.pushState({ bambuddyFullscreen: this.fullscreenEntry }, "");
    window.addEventListener("popstate", this.onPopState);
    this.focusAfterUpdate(".live .live-full");
  }

  /** Back went past this full screen's entry. One that lands on it -- a
   * dialog's entry above it gone -- keeps full screen. */
  private readonly onPopState = (): void => {
    if (this.ownEntryIsCurrent()) return;
    this.leaveFullscreen(true);
  };

  private ownEntryIsCurrent(): boolean {
    return (history.state as { bambuddyFullscreen?: string } | null)?.bambuddyFullscreen === this.fullscreenEntry;
  }

  /** The browser's full screen came or went: by the card, Esc, or the
   * system's back. */
  private readonly onFullscreenChange = (): void => {
    if (this.ownFullscreen()) {
      if (this.fullscreen === "off") this.enterMode("native");
      return;
    }
    if (this.fullscreen === "native") this.leaveFullscreen();
  };

  /** In full screen nothing behind the picture is reachable: Tab stays on
   * its icon. */
  private readonly onFullscreenKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      // The browser's full screen has its own Esc; one that closes a dialog
      // is the dialog's.
      if (this.fullscreen !== "window" || inOpenDialog(event)) return;
      this.leaveFullscreen();
      return;
    }
    if (event.key !== "Tab" || this.fullscreen === "off" || inOpenDialog(event)) return;
    event.preventDefault();
    this.renderRoot.querySelector<HTMLElement>(".live .live-full")?.focus();
  };

  /** Listens while the live view is full screen (or on its way), and no longer. */
  private followFullscreen(on: boolean): void {
    if (on) {
      document.addEventListener("fullscreenchange", this.onFullscreenChange);
      document.addEventListener("keydown", this.onFullscreenKey);
    } else {
      document.removeEventListener("fullscreenchange", this.onFullscreenChange);
      document.removeEventListener("keydown", this.onFullscreenKey);
    }
  }

  /** `fromHistory`: back took the entry already. */
  private leaveFullscreen(fromHistory = false): void {
    window.removeEventListener("popstate", this.onPopState);
    // Its entry goes too -- only while it is the current one: another (a
    // dialog's, a page's) is not the card's to take.
    if (!fromHistory && this.fullscreen !== "off" && this.ownEntryIsCurrent()) history.back();
    this.fullscreen = "off";
    this.fullscreenAsk += 1;
    this.fullscreenAsking = false;
    clearTimeout(this.fullscreenWait);
    this.followFullscreen(false);
    if (this.popoverShown) {
      this.popoverShown = false;
      try {
        this.liveElement()?.hidePopover();
      } catch {
        // Gone from the top layer already.
      }
    }
    if (this.ownFullscreen()) document.exitFullscreen().catch(() => undefined);
    // The focus goes back to the card's icon only from inside the picture:
    // one elsewhere is not the card's to take.
    if (this.liveElement()?.matches(":focus-within")) {
      this.focusAfterUpdate(".live .live-full", ".live.failed .btn", "button.live-hint", '.tabs [aria-selected="true"]');
    }
  }

  private readonly streamBroke = (): void => {
    this.stopStream();
    this.streamFailed = true;
  };

  private readonly setStep = (step: Step): void => {
    this.step = step;
  };

  private readonly retryLive = (): void => {
    this.streamFailed = false;
  };

  // --- Actions --------------------------------------------------------------

  /** Sends an action once at a time per key; whether it went through. */
  private async run(key: string, domain: string, service: string, data: Record<string, unknown>): Promise<boolean> {
    const hass = this.hass;
    if (!hass || this.pending.has(key)) return false;
    const pressed = (this.renderRoot as ShadowRoot).activeElement as HTMLButtonElement | null;
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

  // --- Heater targets -------------------------------------------------------

  private targetOf(entityId: string): number | undefined {
    return this.drafts.get(entityId)?.value ?? this.reported(entityId);
  }

  /** A heater's target, or a fan's percentage (0 while it is off). */
  private reported(entityId: string): number | undefined {
    const hass = this.hass as Hass;
    if (!isFan(entityId)) return numericState(hass, entityId);
    const state = hass.states[entityId];
    if (!state || state.state === "unavailable" || state.state === "unknown") return undefined;
    const percentage = state.attributes["percentage"];
    return typeof percentage === "number" ? percentage : 0;
  }

  /** What tells that an entity reported anew: a fan's percentage (its state
   * stays "on" between speeds), else its state. */
  private draftMark(entityId: string): string {
    const state = (this.hass as Hass).states[entityId];
    return isFan(entityId) ? String(state?.attributes["percentage"] ?? 0) : (state?.state ?? "");
  }

  private setDraft(entityId: string, draft: Draft): void {
    this.drafts = new Map([...this.drafts, [entityId, draft]]);
  }

  private dropDraft(entityId: string): void {
    clearTimeout(this.draftTimers.get(entityId));
    this.draftTimers.delete(entityId);
    const next = new Map(this.drafts);
    next.delete(entityId);
    this.drafts = next;
  }

  private later(entityId: string, delay: number, then: () => void): void {
    clearTimeout(this.draftTimers.get(entityId));
    this.draftTimers.set(entityId, setTimeout(then, delay));
  }

  /** A tap on a stepper: shown at once, sent when the taps stop. */
  private stepTarget(entityId: string, value: number): void {
    this.setDraft(entityId, { value });
    this.later(entityId, TARGET_DELAY, () => void this.sendTarget(entityId));
  }

  private async sendTarget(entityId: string): Promise<void> {
    const draft = this.drafts.get(entityId) as Draft;
    const key = `target_${entityId}`;
    // The previous target of this heater is still on its way: this one follows.
    if (this.pending.has(key)) {
      this.later(entityId, TARGET_DELAY, () => void this.sendTarget(entityId));
      return;
    }
    this.setDraft(entityId, { value: draft.value, sentFrom: this.draftMark(entityId) });
    this.later(entityId, TARGET_HOLD, () => this.dropDraft(entityId));
    const sent = isFan(entityId)
      ? await this.run(key, "fan", "set_percentage", { entity_id: entityId, percentage: draft.value })
      : await this.run(key, "number", "set_value", { entity_id: entityId, value: draft.value });
    // A tap made while this target was on its way is kept and sent.
    if (!sent && this.drafts.get(entityId)?.sentFrom !== undefined) this.dropDraft(entityId);
  }

  // --- Switches -------------------------------------------------------------

  /** A switch that has a state, as the card shows it. */
  private switchOn(entityId: string): boolean {
    const draft = this.drafts.get(entityId);
    return draft ? draft.value === 1 : (stateOf(this.hass as Hass, entityId) as HassEntityState).state === "on";
  }

  /** A tap on a switch -- or the chamber light: the new state shows until
   * the entity reports one, 10 s at most; a command that fails shows the
   * old one again. */
  private async toggleSwitch(entityId: string, domain = "switch", key = `switch_${entityId}`): Promise<void> {
    // A tap while the last one is sent: nothing (it would flip the draft back).
    if (this.pending.has(key)) return;
    const on = !this.switchOn(entityId);
    const from = (stateOf(this.hass as Hass, entityId) as HassEntityState).state;
    this.setDraft(entityId, { value: on ? 1 : 0, sentFrom: from, wish: on ? "on" : "off" });
    this.later(entityId, TARGET_HOLD, () => this.dropDraft(entityId));
    const sent = await this.run(key, domain, on ? "turn_on" : "turn_off", { entity_id: entityId });
    if (!sent) this.dropDraft(entityId);
  }

  /** A power symbol's on or off: sent at once. */
  private setTargets(targets: [string, number][]): void {
    for (const [entityId, value] of targets) {
      this.setDraft(entityId, { value });
      void this.sendTarget(entityId);
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

  /** The drying dialog, set to what the loaded spools recommend: the
   * gentlest temperature among them -- hotter can soften a spool -- and the
   * longest time, within the unit's limits; else 55 °C for 8 h. Where the
   * spools want different temperatures, the dialog names them. */
  private openDrying(unit: AmsRefs): void {
    const hass = this.hass as Hass;
    const maxTemperature = unit.model === "AMS 2 Pro" ? DRYING.maxTemperatureAms2Pro : DRYING.maxTemperature;
    const loaded = unit.slots.map((entityId) => slotOf(hass, entityId)).filter((slot) => !slot.empty && !slot.unknown);
    const recommended = (slot: Slot, name: string): number | undefined => {
      const value = (stateOf(hass, slot.entityId) as HassEntityState).attributes[name];
      return typeof value === "number" && value > 0 ? Math.round(value) : undefined;
    };
    // Each material and temperature once, the coolest first.
    const spools = new Map<string, DryingSpool>();
    for (const slot of loaded) {
      const temperature = recommended(slot, "drying_temp");
      const material = slot.type || slot.name;
      if (temperature !== undefined) spools.set(`${material} ${temperature}`, { material, temperature });
    }
    const listed = [...spools.values()].sort((a, b) => a.temperature - b.temperature);
    const temperatures = listed.map((spool) => spool.temperature);
    const durations = loaded.map((slot) => recommended(slot, "drying_time")).filter((value): value is number => value !== undefined);
    this.dialog = {
      kind: "drying",
      unit,
      temperature: clamp(temperatures[0] ?? DRYING.temperature, DRYING.minTemperature, maxTemperature),
      duration: clamp(durations.length ? Math.max(...durations) : DRYING.duration, DRYING.minDuration, DRYING.maxDuration),
      maxTemperature,
      suggested: temperatures.length > 0 || durations.length > 0,
      ...(listed.length ? { suggestedFor: [...new Set(listed.map((spool) => spool.material))].join(", ") } : {}),
      differing: new Set(temperatures).size > 1 ? listed : [],
    };
  }

  /** Opens the list of the print's objects; it fills when the integration
   * answers. An answer for a dialog closed meanwhile is dropped. */
  private async openSkip(): Promise<void> {
    const hass = this.hass as Hass;
    const deviceId = (this.refs as PrinterRefs).deviceId;
    const opened: Dialog = { kind: "skip", loading: true, objects: [], chosen: [] };
    this.dialog = opened;
    let next: Dialog;
    try {
      next = { ...opened, loading: false, objects: await printObjects(hass, deviceId) };
    } catch (error) {
      const reason = await errorText(hass, error);
      next = { ...opened, loading: false, error: reason };
    }
    if (this.dialog === opened) this.dialog = next;
  }

  private toggleObject(id: number): void {
    const dialog = this.dialog;
    if (dialog?.kind !== "skip") return;
    const chosen = dialog.chosen.includes(id) ? dialog.chosen.filter((item) => item !== id) : [...dialog.chosen, id];
    // In the order of the list, as the printer reads it.
    const order = dialog.objects.map((item) => item.id);
    this.dialog = { ...dialog, chosen: chosen.sort((a, b) => order.indexOf(a) - order.indexOf(b)) };
  }

  /** The dialog that sets a slot's filament: its own kept where it has
   * one, its colour chosen -- also one outside the palette. */
  private openFilament(slot: Slot, title: string): void {
    const hass = this.hass as Hass;
    const refs = this.refs as PrinterRefs;
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
      ...(slot.rfid ? {} : { kprofiles: "loading" as const, offer: "loading" as const }),
      ask: ++this.asks,
    };
    this.dialog = opened;
    clearTimeout(this.kSlowTimer);
    if (!slot.rfid) {
      const ask = opened.ask as number;
      void this.loadOffer(slot.entityId, ask);
      void this.loadKProfiles(slot.entityId, ask);
      this.kSlowTimer = setTimeout(() => this.markKSlow(slot.entityId, ask), K_SLOW_MS);
    }
  }

  /** The printer has not answered for a while: the K field says BamBuddy
   * asks again -- also in a dialog a question parked meanwhile. */
  private markKSlow(entityId: string, ask: number): void {
    const slow = (open: FilamentDialog): FilamentDialog => (open.kprofiles === "loading" ? { ...open, kSlow: true } : open);
    const dialog = this.dialog;
    if (this.isAsk(dialog, entityId, ask)) this.dialog = slow(dialog);
    const back = this.dialogBack;
    if (this.isAsk(back, entityId, ask)) this.dialogBack = slow(back);
  }

  /** The slot dialog of this open: a late answer to an earlier one stays out. */
  private isAsk(dialog: Dialog | undefined, entityId: string, ask: number): dialog is FilamentDialog {
    return dialog?.kind === "filament" && dialog.entityId === entityId && dialog.ask === ask;
  }

  /** What Bambu Studio offers the open filament dialog's slot: the slot's
   * own profile placed under its vendor once it comes. */
  private async loadOffer(entityId: string, ask: number): Promise<void> {
    let found: FilamentDialog["offer"];
    try {
      found = (await filamentOffer(this.hass as Hass, entityId)) ?? "failed";
    } catch {
      found = "failed";
    }
    const placed = (open: FilamentDialog): FilamentDialog => {
      const next = { ...open, offer: found };
      const own = ownVendor(next);
      return open.vendor === KEEP && own !== undefined ? { ...next, vendor: own, filament: KEEP } : next;
    };
    // Also into the dialog a question parked meanwhile (reset, then Cancel).
    const dialog = this.dialog;
    if (this.isAsk(dialog, entityId, ask)) this.dialog = placed(dialog);
    const back = this.dialogBack;
    if (this.isAsk(back, entityId, ask)) this.dialogBack = placed(back);
  }

  /** The printer's K profiles for the open filament dialog's slot: none
   * where the printer gives none, or the call fails. */
  private async loadKProfiles(entityId: string, ask: number): Promise<void> {
    let found: FilamentDialog["kprofiles"];
    try {
      found = await kProfiles(this.hass as Hass, entityId);
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
    const dialog = this.dialog;
    if (this.isAsk(dialog, entityId, ask)) this.dialog = listed(dialog);
    const back = this.dialogBack;
    if (this.isAsk(back, entityId, ask)) this.dialogBack = listed(back);
  }

  /** The filament dialog's slot cleared, after a question that comes back
   * to the dialog on Cancel. */
  private resetSlot(): void {
    const dialog = this.dialog;
    if (dialog?.kind !== "filament") return;
    const hass = this.hass as Hass;
    this.parkDialog();
    this.dropSent();
    // The slot a paused print feeds from: said.
    const status = stateOf(hass, (this.refs as PrinterRefs).status)?.state;
    const external = !dialog.ams;
    // An external spool is no slot.
    const text = t(hass, external ? "reset_text_spool" : "reset_text");
    const inUse = t(hass, external ? "reset_in_use_spool" : "reset_in_use");
    this.dialog = {
      kind: "confirm",
      title: t(hass, external ? "reset_title_spool" : "reset_title"),
      text: dialog.active && status === "paused" ? `${text} ${inUse}` : text,
      confirm: t(hass, "reset_confirm"),
      danger: true,
      action: ["bambuddy", "reset_slot", { entity_id: dialog.entityId }],
      key: `reset_${dialog.entityId}`,
    };
  }

  /** The AMS reads the filament dialog's spool's chip again. */
  private refreshRfid(): void {
    const dialog = this.dialog;
    if (dialog?.kind !== "filament") return;
    this.closeDialog();
    void this.run(`rfid_${dialog.entityId}`, "bambuddy", "refresh_rfid", { entity_id: dialog.entityId });
  }

  /** Changes the open filament dialog. */
  private editFilament(change: Partial<FilamentDialog>): void {
    this.dialog = { ...(this.dialog as FilamentDialog), ...change };
  }

  /** A colour from the picker: one of the palette's checks its swatch,
   * another becomes the colour outside it. */
  private pickColor(value: string): void {
    const color = value.toUpperCase();
    this.editFilament({ color, ...(inPalette(color) ? {} : { custom: color }) });
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
    this.stopCheckTimer();
    this.dialog = undefined;
    this.dialogFromMenu = false;
    const element = this.renderRoot.querySelector("dialog");
    if (element?.open) element.close();
    if (fromMenu) this.focusMenuButton();
  };

  /** Copies a text; "Copied" shows in the printer information for a moment.
   * A browser that refuses says nothing: the text is still there to select. */
  private async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    if (this.dialog?.kind !== "info") return;
    this.dialog = { ...this.dialog, copied: true };
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => {
      if (this.dialog?.kind === "info") this.dialog = { kind: "info" };
    }, SENT_TIMEOUT);
  }

  private readonly confirmDialog = (): void => {
    const dialog = this.dialog;
    if (dialog?.kind === "check") {
      void this.runCheck();
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
    } else if (dialog.kind === "filament") {
      void this.run(`filament_${dialog.entityId}`, "bambuddy", "set_filament", { entity_id: dialog.entityId, ...filamentChanges(dialog) });
    } else if (dialog.kind === "drying") {
      void this.run(`dry_${dialog.unit.deviceId}`, "bambuddy", "start_drying", {
        device_id: dialog.unit.deviceId,
        temperature: dialog.temperature,
        duration: dialog.duration,
      });
    }
  };

  /** Takes a drying value, clamped; an invalid one keeps the last. */
  private setDrying(field: DryingField, value: number): number {
    const dialog = this.dialog as Extract<Dialog, { kind: "drying" }>;
    if (!Number.isFinite(value)) return dialog[field];
    const next =
      field === "temperature"
        ? clamp(Math.round(value), DRYING.minTemperature, dialog.maxTemperature)
        : clamp(Math.round(value), DRYING.minDuration, DRYING.maxDuration);
    this.dialog = { ...dialog, [field]: next };
    return next;
  }

  private readonly dialogActions = {
    close: this.closeDialog,
    confirm: this.confirmDialog,
    setDrying: (field: DryingField, value: number) => this.setDrying(field, value),
    toggleObject: (id: number) => this.toggleObject(id),
    // Another vendor: its filament still to choose -- the slot's own again
    // under the slot's vendor; the K profile goes back to the slot's.
    setVendor: (vendor: string) => {
      const dialog = this.dialog as FilamentDialog;
      const own = vendor !== KEEP && dialog.keep !== undefined && ownVendor(dialog) === vendor;
      this.editFilament({ vendor, filament: own ? KEEP : undefined, kprofile: undefined });
    },
    // A new filament takes its first K profile, else the printer's default,
    // as Bambu Studio offers them; back to the slot's own, its K profile stays.
    setFilament: (filament: string) => {
      const dialog = { ...(this.dialog as FilamentDialog), filament };
      this.editFilament({ filament, kprofile: filament === KEEP ? undefined : matchingProfile(dialog) });
    },
    setKProfile: (kprofile: string) => this.editFilament({ kprofile }),
    resetSlot: () => this.resetSlot(),
    refreshRfid: () => this.refreshRfid(),
    setColor: (color: string) => this.editFilament({ color }),
    pickColor: (color: string) => this.pickColor(color),
    copy: (text: string) => void this.copy(text),
    confirmTask: (id: number | undefined) => this.confirmTask(id),
    cancel: (event: Event) => {
      if (this.dialogBack) {
        event.preventDefault();
        this.closeDialog();
        return;
      }
      if (this.dialog?.kind !== "maintenance" || this.dialog.confirming === undefined) return;
      event.preventDefault();
      this.confirmTask(undefined);
    },
    markDone: (id: number, name: string) => void this.markDone(id, name),
    toggleFold: (which: "pass" | "skip") => {
      const dialog = this.dialog;
      if (dialog?.kind !== "check") return;
      const open = dialog.open ?? [];
      this.dialog = { ...dialog, open: open.includes(which) ? open.filter((item) => item !== which) : [...open, which] };
    },
    now: () => Date.now(),
  };

  /** Asks in a task's row whether to mark it done, or takes the question
   * back. The focus goes with it: to its Cancel, then back to the row's Done. */
  private confirmTask(id: number | undefined): void {
    const dialog = this.dialog;
    if (dialog?.kind !== "maintenance") return;
    // A task being marked meanwhile keeps waiting, and says how it ended.
    const marking = dialog.marking !== undefined ? { marking: dialog.marking } : {};
    this.dialog = id === undefined ? { kind: "maintenance", ...marking } : { kind: "maintenance", ...marking, confirming: id };
    if (id !== undefined) {
      this.dropSent();
      this.focusAfterUpdate(".maint-confirm .btn.plain");
    } else if (dialog.confirming !== undefined) this.focusAfterUpdate(`.maint-done[data-task="${dialog.confirming}"]`);
  }

  /** Marks a maintenance task done. The dialog stays open -- a first visit
   * often marks several --, so a failure is said in it, not under it. */
  private async markDone(id: number, name: string): Promise<void> {
    const hass = this.hass as Hass;
    // Another task may be marked meanwhile: each waits for its own answer.
    const before = this.dialog?.kind === "maintenance" ? (this.dialog.marking ?? []) : [];
    this.dialog = { kind: "maintenance", marking: [...before, id] };
    let error: string | undefined;
    try {
      await callAction(hass, "bambuddy", "mark_maintenance_done", { device_id: this.refs?.deviceId, task_id: id });
    } catch (caught) {
      error = await errorText(hass, caught);
    }
    if (this.dialog?.kind !== "maintenance" || !this.dialog.marking?.includes(id)) return;
    const asking = this.dialog.confirming;
    const others = this.dialog.marking.filter((other) => other !== id);
    // A failure of another task, said meanwhile, stays said.
    const said = error ?? this.dialog.error;
    this.dialog = {
      kind: "maintenance",
      ...(others.length ? { marking: others } : {}),
      ...(asking === undefined ? {} : { confirming: asking }),
      ...(said === undefined ? {} : { error: said }),
      // Marked: said to a screen reader by the name the row shows.
      ...(error === undefined ? { marked: name } : {}),
    };
    if (asking !== undefined) return;
    // Its Done waited, disabled; the focus goes back to it now.
    this.focusAfterUpdate(`.maint-done[data-task="${id}"]`, "dialog .btn.safe");
  }

  /** Runs BamBuddy's connection check; the dialog counts the seconds until
   * it answers. An answer for a dialog closed or run again meanwhile is
   * dropped. */
  private async runCheck(): Promise<void> {
    const hass = this.hass as Hass;
    const deviceId = (this.refs as PrinterRefs).deviceId;
    const opened: CheckDialog = { kind: "check", running: true, started: Date.now() };
    this.dialog = opened;
    this.startCheckTimer();
    // "Check again" goes while it runs: the focus stays in the dialog.
    this.focusAfterUpdate("dialog .btn.safe");
    let next: CheckDialog;
    try {
      next = { ...opened, running: false, result: await runCheck(hass, deviceId) };
    } catch (error) {
      next = { ...opened, running: false, error: await errorText(hass, error) };
    }
    if (this.dialog !== opened) return;
    this.stopCheckTimer();
    this.dialog = next;
  }

  private startCheckTimer(): void {
    this.stopCheckTimer();
    this.checkTimer = setInterval(() => this.requestUpdate(), 1000);
  }

  private stopCheckTimer(): void {
    clearInterval(this.checkTimer);
    this.checkTimer = undefined;
  }

  // --- Menu -------------------------------------------------------------------

  private menuItems(): HTMLButtonElement[] {
    return [...this.renderRoot.querySelectorAll<HTMLButtonElement>(".menu [role=menuitem]")];
  }

  private readonly toggleMenu = (): void => {
    this.menuOpen = !this.menuOpen;
  };

  private focusMenuButton(): void {
    this.focusAfterUpdate(".menu-btn");
  }

  private closeMenu(focusTrigger: boolean): void {
    this.menuOpen = false;
    if (focusTrigger) this.focusMenuButton();
  }

  /** The arrow down on the three dots opens the menu, as on any menu button. */
  private readonly triggerKeys = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    this.menuOpen = true;
  };

  /** Up, down, Home and End move through the items; Escape closes and goes
   * back to the three dots, Tab closes and moves on. */
  private readonly menuKeys = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu(true);
      return;
    }
    if (event.key === "Tab") {
      this.menuOpen = false;
      return;
    }
    const items = this.menuItems().filter((item) => !item.disabled);
    const index = items.indexOf((this.renderRoot as ShadowRoot).activeElement as HTMLButtonElement);
    const moves: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    items[((moves[event.key] as number) + items.length) % items.length]?.focus();
  };

  /** Home Assistant's device page, the way its own frontend navigates. */
  private editDevice(deviceId: string): void {
    history.pushState(null, "", `/config/devices/device/${deviceId}`);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  /** The menu: the device page (for an administrator: the config panel is
   * theirs alone), the printer information, the maintenance list, a refresh
   * and the connection check. After an item the
   * focus is back on the three dots; a dialog takes it until it closes. */
  private menu(ctx: CardContext): TemplateResult {
    const { hass, refs } = ctx;
    const item = (iconName: IconName, label: TextKey, action: () => void, disabled = false, opensDialog = false): TemplateResult =>
      html`<button
        role="menuitem"
        tabindex="-1"
        aria-haspopup=${opensDialog ? "dialog" : nothing}
        ?disabled=${disabled}
        @click=${() => {
          this.closeMenu(!opensDialog);
          if (opensDialog) this.dialogFromMenu = true;
          action();
        }}
      >
        ${icon(iconName)}<span>${t(hass, label)}</span>
      </button>`;
    const refresh = refs.refresh;
    return html`<span class="menu-wrap">
      <button
        class="icon-btn menu-btn"
        aria-label=${t(hass, "more")}
        title=${t(hass, "more")}
        aria-haspopup="menu"
        aria-expanded=${this.menuOpen ? "true" : "false"}
        aria-controls="bb-menu"
        @click=${this.toggleMenu}
        @keydown=${this.triggerKeys}
      >
        ${icon("dotsVertical")}
      </button>
      ${this.menuOpen
        ? html`<div class="menu" id="bb-menu" role="menu" aria-label=${t(hass, "more")} @keydown=${this.menuKeys}>
            ${hass.user?.is_admin ? item("openInNew", "menu_device_page", () => this.editDevice(refs.deviceId)) : nothing}
            ${item("infoOutline", "menu_info", () => { this.dialog = { kind: "info" }; }, false, true)}
            ${maintenanceOf(ctx) ? item("wrench", "menu_maintenance", () => { this.dialog = { kind: "maintenance" }; }, false, true) : nothing}
            ${refresh
              ? item(
                  "refresh",
                  "menu_refresh",
                  () => void this.run("refresh", "button", "press", { entity_id: refresh }),
                  stateOf(hass, refresh)?.state === "unavailable" || this.pending.has("refresh"),
                )
              : nothing}
            ${item("lan", "check_connection", () => void this.runCheck(), ctx.unreachable, true)}
          </div>`
        : nothing}
    </span>`;
  }

  // --- Rendering ------------------------------------------------------------

  private context(hass: Hass, refs: PrinterRefs): CardContext {
    const online = printerOnline(hass, refs);
    const reported = stateOf(hass, refs.status)?.state ?? "unknown";
    const status = online ? reported : "offline";
    // The print status has a state even while the printer is offline: none
    // means the integration has no answer from BamBuddy at all.
    const unreachable = reported === "unavailable";
    // No data because BamBuddy no longer lists the printer: the
    // integration says so (it waits under Repairs).
    const missing = unreachable && notListed(hass, refs);
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
      busy: BUSY.has(status),
      running: RUNNING.has(status),
      changing: online && FILAMENT_CHANGE.has(stateOf(hass, refs.amsStatus)?.state ?? ""),
      canControl,
      viewOnly: settings.readOnly && permitted,
      examples: this.preview && this.inEditor,
      controlTab: settings.controlTab && permitted && settings.sections.some((section) => sectionShown(refs, section, settings.readOnly)),
      filamentTab: settings.filamentTab && (units > 0 || refs.externalSpools.length > 0),
      jobSpools: this.jobSpools,
      ...(this.liveOffered(online) ? { startLive: this.startLive } : {}),
      isPending: (key) => this.pending.has(key),
      run: (key, domain, service, data) => void this.run(key, domain, service, data),
      confirm: (confirmation) => {
        if (this.dialog?.kind === "power" || this.dialog?.kind === "hms") this.parkDialog();
        else this.dialogBack = undefined;
        this.dropSent();
        this.dialog = { kind: "confirm", ...confirmation };
      },
      dry: (unit) => this.openDrying(unit),
      setFilament: (slot, title) => this.openFilament(slot, title),
      skip: () => void this.openSkip(),
      targetOf: (entityId) => this.targetOf(entityId),
      stepTarget: (entityId, value) => this.stepTarget(entityId, value),
      setTargets: (targets) => this.setTargets(targets),
      switchOn: (entityId) => this.switchOn(entityId),
      toggleSwitch: (entityId) => void this.toggleSwitch(entityId),
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
        void this.runCheck();
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
    const lightOn = refs.light && light ? this.switchOn(refs.light) : false;
    // A printer without a chamber: its light is a light.
    const lightKey: TextKey = refs.plainLight ? "light_plain" : "light";
    const title = printerTitle(ctx);
    const subline = subtitle(ctx);
    const open = (pill: Pill): void => {
      this.dialog = { kind: pill };
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
            @click=${() => void this.toggleSwitch(refs.light as string, "light", "light")}
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
      ${this.menu(ctx)}
    </div>
    ${pills(ctx, open)}`;
  }

  /** The tabs; `shown` is the view drawn -- Status where the chosen one is
   * not there. The arrow keys, Home and End switch: a view sends nothing. */
  private tabs(views: View[], shown: View): TemplateResult | typeof nothing {
    if (views.length < 2) return nothing;
    const hass = this.hass as Hass;
    const select = (view: View): void => {
      this.view = view;
    };
    const step = (event: KeyboardEvent): void => {
      const index = views.indexOf(shown);
      const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: views.length - 1 };
      if (!(event.key in moves)) return;
      event.preventDefault();
      select(views[((moves[event.key] as number) + views.length) % views.length] as View);
      void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('.tabs [aria-selected="true"]')?.focus());
    };
    return html`<div class="tabs" role="tablist" aria-label=${t(hass, "aria_views")} @keydown=${step}>
      ${views.map(
        (view) => html`<button
          role="tab"
          id="tab-${view}"
          aria-selected=${view === shown ? "true" : "false"}
          aria-controls=${PANEL}
          tabindex=${view === shown ? 0 : -1}
          title=${t(hass, `tab_${view}` as TextKey)}
          @click=${() => select(view)}
        >
          <span class="tab-icon" aria-hidden="true">${icon(TAB_ICONS[view])}</span><span class="tab-text">${t(hass, `tab_${view}` as TextKey)}</span>
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
      return html`<div class="big-cover">
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
    const closable = this.settings.camera === "tap";
    const close = closable
      ? html`<button class="icon-btn live-close" aria-label=${t(hass, "live_stop")} title=${t(hass, "live_stop")} @click=${this.closeLive}>
          ${icon("close")}
        </button>`
      : nothing;
    if (this.streamFailed && (this.liveWanted || this.settings.camera === "always")) {
      return html`<div class="live failed" role="status">
        ${icon("videoOff")}<span>${t(hass, "camera_failed")}</span>
        <button class="btn" @click=${this.retryLive}>${t(hass, "retry")}</button>
        <div class="live-tools">${close}</div>
      </div>`;
    }
    if (!this.streamSrc) return nothing;
    // A setting of Home Assistant's, not the printer's; not in a view-only
    // card. It is always available: unavailable, it is one the camera no
    // longer has.
    const fpsNumber = this.refs?.cameraFps;
    const fpsState = fpsNumber ? hass.states[fpsNumber] : undefined;
    const settings =
      fpsState && fpsState.state !== "unavailable" && !this.settings.readOnly
        ? html`<button
            class="icon-btn live-fps-open"
            aria-label=${t(hass, "fps_open")}
            title=${t(hass, "fps_open")}
            aria-haspopup="dialog"
            @click=${() => {
              this.dialogBack = undefined;
              this.dialog = { kind: "camera" };
              this.dialogFromMenu = false;
            }}
          >
            ${icon("cog")}
          </button>`
        : nothing;
    // What arrives once the integration has counted it, else what was asked.
    const rate = this.frameRate(true) ?? this.streamFps;
    // Tenths below 1 (a slow chamber image), in the user's language.
    const fps = rate === undefined ? undefined : formatNumber(hass, rate, 1);
    const full = this.fullscreen !== "off";
    const fullLabel = t(hass, full ? "fullscreen_close" : "fullscreen_open");
    // Full screen takes the picture out of the card: the holder keeps its
    // place, so the page behind does not jump.
    // The window's picture goes to the top layer where the browser has one.
    const popover = this.fullscreen === "window" && typeof HTMLElement.prototype.showPopover === "function" ? "manual" : nothing;
    return html`${full ? html`<div class="live-holder"></div>` : nothing}<div class="live ${full ? "full" : ""}" popover=${popover}>
      <img class="stream" src=${this.streamSrc} alt=${t(hass, "live")} @error=${this.streamBroke} />
      <div class="live-tags">
        <span class="live-badge">${t(hass, "live_badge")}</span>
        ${fps === undefined
          ? nothing
          : html`<span class="live-badge live-fps" role="img" aria-label=${t(hass, "fps_aria", { fps })} title=${t(hass, "fps_aria", { fps })}
              >${t(hass, "fps_value", { fps })}</span
            >`}
      </div>
      <div class="live-tools">${settings}${close}</div>
      <button class="icon-btn live-full" aria-label=${fullLabel} title=${fullLabel} @click=${this.toggleFullscreen}>
        ${icon(full ? "fullscreenExit" : "fullscreen")}
      </button>
    </div>`;
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
      const reason: TextKey = !config.printer ? "no_printer" : !device ? "not_found" : isPrinterDevice(device) ? "waiting_for_printer" : "not_a_printer";
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
