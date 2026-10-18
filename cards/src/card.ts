// The BamBuddy printer card: one printer with its AMS units, in three
// views -- status, control, filament. It finds its entities itself (see
// discovery.ts) and draws again only when one of them changed: Home
// Assistant hands a card a new hass on every state change in the house.
import { html, LitElement, nothing, type CSSResultGroup, type PropertyValues, type TemplateResult } from "lit";

import { callAction, errorText, kProfiles, printObjects } from "./actions";
import { controlView, sectionShown, type Step } from "./control-view";
import { dialogView, DRYING, filamentChanges, inPalette, KEEP, matchingProfile, type Dialog, type DryingField, type DryingSpool, type FilamentDialog } from "./dialogs";
import { findPrinter, hasControls, plugAttribute, printerDevices, printerOnline, printStatus, shownUnits } from "./discovery";
import { filamentView } from "./filament-view";
import { BUSY, FILAMENT_CHANGE, formatPercent, hasValue, numericState, RUNNING, stateOf, textOrUndefined, WITH_JOB } from "./format";
import { BamBuddyPrinterCardEditor, EDITOR_TAG, loadForm } from "./editor";
import { DEFAULTS, settingsOf, validateConfig, type Settings } from "./forms";
import { runCheck, type CheckDialog } from "./check";
import { pills, printerTitle, subtitle, type Pill } from "./header";
import { maintenanceOf, type MaintenanceDialog } from "./maintenance";
import { icon, printerDrawing, type IconName } from "./icons";
import { rememberLocale, t, type TextKey } from "./i18n";
import { asOnline, connection, sample, sampleKey, slotOf, snack, type CardContext, type Slot } from "./parts";
import { defineCard, defineElement } from "./register";
import { starting } from "./power";
import { offlineJob, statusView } from "./status-view";
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

export class BamBuddyPrinterCard extends LitElement {
  static override properties = {
    hass: { attribute: false },
    preview: { type: Boolean },
    config: { state: true },
    view: { state: true },
    liveWanted: { state: true },
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
  protected pageVisible = document.visibilityState !== "hidden";
  protected streamFailed = false;
  protected brokenCover?: string;
  protected pending: ReadonlySet<string> = new Set();
  protected error?: string;
  protected sent = false;
  protected dialog?: Dialog;
  protected menuOpen = false;
  /** 1 mm: a tap never moves the bed far into the nozzle. */
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
  /** Restarts of the live view: each a new address, so the image loads anew. */
  private streamRun = 0;
  /** The stepper button that has the focus: at its limit it is disabled,
   * and the focus goes to the stepper's other end. */
  private steppedFrom?: HTMLButtonElement;
  private errorTimer?: ReturnType<typeof setTimeout>;
  private sentTimer?: ReturnType<typeof setTimeout>;
  private copiedTimer?: ReturnType<typeof setTimeout>;
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

  /** Notes the dialog's button that is asking a question, to come back to. */
  private rememberAsker(): void {
    const label = (this.renderRoot as ShadowRoot).activeElement?.getAttribute("aria-label");
    this.asker = label ? `dialog [aria-label="${label.replace(/["\\]/g, "\\$&")}"]` : undefined;
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
    this.refs = undefined;
    // A dialog belongs to the printer it was opened for.
    this.dialog = undefined;
    this.dialogFromMenu = false;
    this.dialogBack = undefined;
  }

  getCardSize(): number {
    // The plugs' block only where the printer has a plug BamBuddy shows on its card.
    const hass = this.hass;
    const plugs = hass ? (this.refs?.plugs ?? []).filter((plug) => plugAttribute(hass, plug, "on_printer_card") !== false) : [];
    return this.settings.blocks.reduce((size, block) => size + (block === "power" && !plugs.length ? 0 : BLOCK_ROWS[block]), 4);
  }

  getGridOptions(): { columns: number; min_columns: number; rows: "auto" } {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  // --- Life cycle -----------------------------------------------------------

  private readonly onVisibility = (): void => {
    this.pageVisible = document.visibilityState !== "hidden";
    if (!this.pageVisible) this.stopStream();
  };

  /** A tap anywhere but in the menu closes it. */
  private readonly onPointerDown = (event: Event): void => {
    if (!this.menuOpen) return;
    const menu = this.renderRoot.querySelector(".menu-wrap");
    if (menu && !event.composedPath().includes(menu)) this.menuOpen = false;
  };

  override connectedCallback(): void {
    super.connectedCallback();
    this.attached = true;
    this.inEditor = inCardEditor(this);
    // Back while a check runs: its seconds count on.
    if (this.dialog?.kind === "check" && this.dialog.running) this.startCheckTimer();
    document.addEventListener("visibilitychange", this.onVisibility);
    document.addEventListener("pointerdown", this.onPointerDown);
    this.requestUpdate();
  }

  override disconnectedCallback(): void {
    this.attached = false;
    document.removeEventListener("visibilitychange", this.onVisibility);
    document.removeEventListener("pointerdown", this.onPointerDown);
    this.menuOpen = false;
    this.stopStream();
    this.liveWanted = false;
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
    // A stream a state ends goes as one that is closed: its image still
    // holds the address here, and the browser would keep loading it.
    if (!this.streaming()) {
      if (this.streamSrc) this.stopStream();
    } else {
      // A new frame rate: the stream starts anew to ask for it.
      const rate = this.frameRate();
      if (this.streamSrc && rate !== undefined && rate !== this.streamFps) this.stopStream();
      if (!this.streamSrc) {
        this.streamFps = this.frameRate();
        this.streamSrc = this.streamUrl();
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
        : draft.sentFrom !== undefined && state !== draft.sentFrom;
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
      this.steppedFrom = target instanceof HTMLButtonElement && target.closest(".stepper") ? target : undefined;
    });
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    // A stepper's end reached: the keyboard keeps its place in the stepper.
    const stepped = this.steppedFrom;
    if (stepped?.disabled && stepped.isConnected) {
      stepped.closest(".stepper")?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled])")?.focus();
    }
    // An opened menu has the focus on its first item, as menus do.
    if (changed.has("menuOpen") && this.menuOpen) this.menuItems()[0]?.focus();
    const dialog = this.renderRoot.querySelector("dialog");
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      // The safe choice has the focus: Enter never confirms by accident.
      dialog.querySelector<HTMLElement>(".dlg-actions .safe")?.focus();
    }
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
    if (this.settings.camera === "off" || this.preview || !this.attached || !this.pageVisible || this.streamFailed) return false;
    if (!this.refs || !this.cameraToken()) return false;
    return this.settings.camera === "always" || this.liveWanted;
  }

  /** The frames a second the camera's streams ask for; `arriving`: the
   * ones that arrive while a stream runs. */
  private frameRate(arriving = false): number | undefined {
    const rate = this.refs?.camera ? stateOf(this.hass as Hass, this.refs.camera)?.attributes[arriving ? "streamed_frame_rate" : "frame_rate"] : undefined;
    return typeof rate === "number" ? rate : undefined;
  }

  /** Starts the live view anew: the integration then asks BamBuddy to
   * begin its camera connection at the rate set. */
  private readonly restartLive = (): void => {
    this.stopStream();
    this.streamRun += 1;
    this.requestUpdate();
  };

  /** The live stream through Home Assistant's camera proxy. It is read when
   * the stream starts and kept while it runs: the token rotates, the
   * running stream does not need a new one. The rate is for the browser:
   * a new one is a new address, and the image loads anew. */
  private streamUrl(): string {
    const rate = this.streamFps === undefined ? "" : `&fps=${this.streamFps}`;
    const run = this.streamRun ? `&run=${this.streamRun}` : "";
    return `/api/camera_proxy_stream/${this.refs?.camera}?token=${encodeURIComponent(this.cameraToken() ?? "")}${rate}${run}`;
  }

  /** Ends a running stream at once; dropping the image alone can leave the
   * browser loading it. */
  private stopStream(): void {
    for (const image of this.renderRoot.querySelectorAll("img.stream")) image.removeAttribute("src");
    this.streamSrc = undefined;
  }

  /** Whether a tap can start the live view now. */
  private canStartLive(online: boolean): boolean {
    return this.settings.camera === "tap" && online && !this.preview && !this.liveWanted && this.cameraToken() !== undefined;
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
    this.liveWanted = true;
    this.focusAfterUpdate(".live .live-close");
  };

  /** Closed, the place goes back to the button that opens it: the picture,
   * or the control view's camera button -- in the filament view, which has
   * none, to its tab. */
  private readonly closeLive = (): void => {
    this.stopStream();
    this.liveWanted = false;
    this.streamFailed = false;
    this.focusAfterUpdate("button.picture", ".btn.live-btn", '.tabs [aria-selected="true"]');
  };

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
    return this.drafts.get(entityId)?.value ?? numericState(this.hass as Hass, entityId);
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
    const hass = this.hass as Hass;
    const draft = this.drafts.get(entityId) as Draft;
    const key = `target_${entityId}`;
    // The previous target of this heater is still on its way: this one follows.
    if (this.pending.has(key)) {
      this.later(entityId, TARGET_DELAY, () => void this.sendTarget(entityId));
      return;
    }
    this.setDraft(entityId, { value: draft.value, sentFrom: hass.states[entityId]?.state ?? "" });
    this.later(entityId, TARGET_HOLD, () => this.dropDraft(entityId));
    const sent = await this.run(key, "number", "set_value", { entity_id: entityId, value: draft.value });
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
    const on = !this.switchOn(entityId);
    const from = (stateOf(this.hass as Hass, entityId) as HassEntityState).state;
    this.setDraft(entityId, { value: on ? 1 : 0, sentFrom: from, wish: on ? "on" : "off" });
    this.later(entityId, TARGET_HOLD, () => this.dropDraft(entityId));
    const sent = await this.run(key, domain, on ? "turn_on" : "turn_off", { entity_id: entityId });
    if (!sent) this.dropDraft(entityId);
  }

  /** Off and Cool down: sent at once. */
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

  /** The dialog that sets a slot's filament: its material kept where it
   * has one, its colour chosen -- also one outside the palette. */
  private openFilament(slot: Slot, title: string): void {
    const hass = this.hass as Hass;
    const refs = this.refs as PrinterRefs;
    // A slot with a material always has a name: its state at least.
    const keep = slot.type ? slot.name : undefined;
    const current = slot.color?.toUpperCase();
    const opened: FilamentDialog = {
      kind: "filament",
      entityId: slot.entityId,
      title,
      ...(keep ? { keep, material: KEEP } : {}),
      ...(current ? { current, color: current, ...(inPalette(current) ? {} : { custom: current }) } : {}),
      rfid: slot.rfid,
      ams: !refs.externalSpools.includes(slot.entityId),
      active: slot.active,
      ...(slot.rfid ? { spool: [slot.name, slot.remaining === undefined ? "" : formatPercent(hass, slot.remaining)].filter(Boolean).join(" · ") } : {}),
      type: slot.type,
      ...(slot.rfid ? {} : { kprofiles: "loading" as const }),
    };
    this.dialog = opened;
    if (!slot.rfid) void this.loadKProfiles(slot.entityId);
  }

  /** The printer's K profiles for the open filament dialog's slot: none
   * where the printer gives none, or the call fails. */
  private async loadKProfiles(entityId: string): Promise<void> {
    let found: FilamentDialog["kprofiles"];
    try {
      found = await kProfiles(this.hass as Hass, entityId);
    } catch {
      found = "failed";
    }
    // Also into the dialog a question parked meanwhile (reset, then Cancel).
    const dialog = this.dialog;
    if (dialog?.kind === "filament" && dialog.entityId === entityId) this.dialog = { ...dialog, kprofiles: found };
    const back = this.dialogBack;
    if (back?.kind === "filament" && back.entityId === entityId) this.dialogBack = { ...back, kprofiles: found };
  }

  /** The filament dialog's slot cleared, after a question that comes back
   * to the dialog on Cancel. */
  private resetSlot(): void {
    const dialog = this.dialog;
    if (dialog?.kind !== "filament") return;
    const hass = this.hass as Hass;
    this.dialogBack = dialog;
    this.rememberAsker();
    this.focusAfterUpdate("dialog .btn.safe");
    // The slot a paused print feeds from: said (U21).
    const status = stateOf(hass, (this.refs as PrinterRefs).status)?.state;
    this.dialog = {
      kind: "confirm",
      title: t(hass, "reset_title"),
      text: dialog.active && status === "paused" ? `${t(hass, "reset_text")} ${t(hass, "reset_in_use")}` : t(hass, "reset_text"),
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
    restartLive: this.restartLive,
    setDrying: (field: DryingField, value: number) => this.setDrying(field, value),
    toggleObject: (id: number) => this.toggleObject(id),
    // A new material takes its first matching K profile, else the
    // printer's default, as BamBuddy's own dialog does.
    setMaterial: (material: string) => {
      const dialog = { ...(this.dialog as FilamentDialog), material };
      this.editFilament({ material, kprofile: matchingProfile(dialog) });
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
    markDone: (id: number) => void this.markDone(id),
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
    this.dialog = id === undefined ? { kind: "maintenance" } : { kind: "maintenance", confirming: id };
    if (id !== undefined) this.focusAfterUpdate(".maint-confirm .btn.plain");
    else if (dialog.confirming !== undefined) this.focusAfterUpdate(`.maint-done[data-task="${dialog.confirming}"]`);
  }

  /** Marks a maintenance task done. The dialog stays open -- a first visit
   * often marks several --, so a failure is said in it, not under it. */
  private async markDone(id: number): Promise<void> {
    const hass = this.hass as Hass;
    this.dialog = { kind: "maintenance", marking: id };
    let next: MaintenanceDialog;
    try {
      await callAction(hass, "bambuddy", "mark_maintenance_done", { device_id: this.refs?.deviceId, task_id: id });
      next = { kind: "maintenance" };
    } catch (error) {
      next = { kind: "maintenance", error: await errorText(hass, error) };
    }
    if (this.dialog?.kind !== "maintenance" || this.dialog.marking !== id) return;
    this.dialog = next;
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
   * theirs alone), the printer information, a refresh. After an item the
   * focus is back on the three dots; a dialog takes it until it closes. */
  private menu(ctx: CardContext): TemplateResult {
    const { hass, refs } = ctx;
    const item = (iconName: IconName, label: TextKey, action: () => void, disabled = false, opensDialog = false): TemplateResult =>
      html`<button
        role="menuitem"
        tabindex="-1"
        ?disabled=${disabled}
        @click=${() => {
          this.closeMenu(!opensDialog);
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
            ${hass.user?.is_admin ? item("pencil", "menu_device_page", () => this.editDevice(refs.deviceId)) : nothing}
            ${item(
              "infoOutline",
              "menu_info",
              () => {
                this.dialog = { kind: "info" };
                this.dialogFromMenu = true;
              },
              false,
              true,
            )}
            ${maintenanceOf(ctx)
              ? item(
                  "wrench",
                  "menu_maintenance",
                  () => {
                    this.dialog = { kind: "maintenance" };
                    this.dialogFromMenu = true;
                  },
                  false,
                  true,
                )
              : nothing}
            ${refresh
              ? item(
                  "refresh",
                  "menu_refresh",
                  () => void this.run("refresh", "button", "press", { entity_id: refresh }),
                  stateOf(hass, refresh)?.state === "unavailable" || this.pending.has("refresh"),
                )
              : nothing}
            ${item(
              "lan",
              "check_connection",
              () => {
                this.dialogFromMenu = true;
                void this.runCheck();
              },
              ctx.unreachable,
              true,
            )}
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
      busy: BUSY.has(status),
      running: RUNNING.has(status),
      changing: online && FILAMENT_CHANGE.has(stateOf(hass, refs.amsStatus)?.state ?? ""),
      canControl,
      keyLacksControl: !settings.readOnly && !permitted,
      viewOnly: settings.readOnly && permitted,
      examples: this.preview && this.inEditor,
      controlTab: settings.controlTab && permitted && settings.sections.some((section) => sectionShown(refs, section, settings.readOnly)),
      filamentTab: settings.filamentTab && (units > 0 || refs.externalSpools.length > 0),
      ...(this.canStartLive(online) ? { startLive: this.startLive } : {}),
      isPending: (key) => this.pending.has(key),
      run: (key, domain, service, data) => void this.run(key, domain, service, data),
      confirm: (confirmation) => {
        this.dialogBack = this.dialog?.kind === "power" || this.dialog?.kind === "hms" ? this.dialog : undefined;
        if (this.dialogBack) {
          this.rememberAsker();
          // The open dialog's content changes: its focus with it.
          this.focusAfterUpdate("dialog .btn.safe");
        }
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
      openDialog: (kind) => {
        this.dialogBack = this.dialog?.kind === "power" ? this.dialog : undefined;
        this.dialog = { kind };
        this.dialogFromMenu = false;
      },
    };
  }

  /** Status always; Control where the card may control the printer; Filament
   * where it has an AMS unit or an external spool -- each unless switched off. */
  private views(ctx: CardContext): View[] {
    return ["status", ...(ctx.controlTab ? ["control" as const] : []), ...(ctx.filamentTab ? ["filament" as const] : [])];
  }

  private header(ctx: CardContext): TemplateResult {
    const { hass, refs } = ctx;
    const light = refs.light ? stateOf(hass, refs.light) : undefined;
    // What was tapped, until the light reports it (as a switch does).
    const lightOn = refs.light && light ? this.switchOn(refs.light) : false;
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
            aria-label=${t(hass, "light")}
            title=${t(hass, "light")}
            aria-pressed=${lightOn ? "true" : "false"}
            aria-busy=${this.pending.has("light") ? "true" : "false"}
            ?disabled=${!ctx.online || light?.state === "unavailable" || this.pending.has("light")}
            @click=${() => void this.toggleSwitch(refs.light as string, "light", "light")}
          >
            ${icon(lightOn ? "lightOn" : "lightOff")}
          </button>`
        : refs.light && ctx.viewOnly
          ? html`<span
              class="icon-btn light state ${lightOn ? "on" : ""}"
              role="img"
              aria-label="${t(hass, "light")}: ${t(hass, lightOn ? "on" : "off")}"
              title="${t(hass, "light")}: ${t(hass, lightOn ? "on" : "off")}"
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
   * drawing; a tap starts the live view where the camera can stream. */
  private picture(ctx: CardContext): TemplateResult {
    const { hass, refs, status } = ctx;
    const cover = stateOf(hass, refs.cover);
    const url = cover && hasValue(hass, refs.cover) ? cover.attributes["entity_picture"] : undefined;
    const showCover = typeof url === "string" && url !== this.brokenCover && WITH_JOB.has(status);
    const content = showCover
      ? html`<img
          class="cover"
          src=${url}
          alt=""
          @error=${() => {
            this.brokenCover = url;
          }}
        />`
      : printerDrawing();
    if (ctx.startLive) {
      return html`<button class="picture" aria-label=${t(hass, "live")} title=${t(hass, "live")} @click=${this.startLive}>
        ${content}<span class="live-hint">${icon("video")}</span>
      </button>`;
    }
    return html`<div class="picture ${ctx.online ? "" : "offline-pic"}">${content}</div>`;
  }

  private livePanel(): TemplateResult | typeof nothing {
    const hass = this.hass as Hass;
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
    // A setting of Home Assistant's, not the printer's; not in a view-only card.
    const fpsNumber = this.refs?.cameraFps;
    const settings =
      fpsNumber && hass.states[fpsNumber] && !this.settings.readOnly
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
    const fps = this.frameRate(true) ?? this.streamFps;
    return html`<div class="live">
      <img class="stream" src=${this.streamSrc} alt=${t(hass, "live")} @error=${this.streamBroke} />
      <div class="live-tags">
        <span class="live-badge">${t(hass, "live_badge")}</span>
        ${fps === undefined
          ? nothing
          : html`<span class="live-badge live-fps" role="img" aria-label=${t(hass, "fps_aria", { fps })}>${t(hass, "fps_value", { fps })}</span>`}
      </div>
      <div class="live-tools">${settings}${close}</div>
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
      <button class="icon-btn" aria-label=${t(hass, "dismiss")} title=${t(hass, "dismiss")} @click=${this.closeError}>${icon("close")}</button>
    </div>`;
  }

  protected override render(): TemplateResult | typeof nothing {
    const hass = this.hass;
    const config = this.config;
    if (!hass || !config) return nothing;
    const refs = this.refs;
    if (!refs) {
      const reason: TextKey = !config.printer ? "no_printer" : hass.devices[config.printer] ? "not_a_printer" : "not_found";
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
