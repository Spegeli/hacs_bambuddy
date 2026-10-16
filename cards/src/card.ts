// The BamBuddy printer card: one printer with its AMS units, in three
// views -- status, control, filament. It finds its entities itself (see
// discovery.ts) and draws again only when one of them changed: Home
// Assistant hands a card a new hass on every state change in the house.
import { html, LitElement, nothing, type CSSResultGroup, type PropertyValues, type TemplateResult } from "lit";

import { callAction, errorText, printObjects } from "./actions";
import { controlView, type Step } from "./control-view";
import { dialogView, DRYING, filamentChanges, inPalette, KEEP, type Dialog, type DryingField, type DryingSpool, type FilamentDialog } from "./dialogs";
import { findPrinter, printerDevices, printStatus } from "./discovery";
import { filamentView } from "./filament-view";
import { BUSY, FILAMENT_CHANGE, formatState, hasValue, numericState, RUNNING, stateOf, toneOf, WITH_JOB } from "./format";
import { configForm, validateConfig } from "./forms";
import { pills, printerTitle, subtitle, type Pill } from "./header";
import { icon, printerDrawing, type IconName } from "./icons";
import { rememberLocale, t, type TextKey } from "./i18n";
import { slotOf, type CardContext, type Slot } from "./parts";
import { defineCard } from "./register";
import { statusView } from "./status-view";
import { cardStyles } from "./styles";
import type { AmsRefs, CameraMode, CardConfig, Hass, HassEntityState, PrinterRefs, View } from "./types";

export const TAG = "bambuddy-printer-card";

// Print states of a printer the picker's preview would show without data.
const OFFLINE = ["offline", "unavailable", "unknown"];

export { DRYING };

/** How long an error stays in the card unless closed. */
const ERROR_TIMEOUT = 12_000;

/** How long "Sent" shows after a command went through. */
export const SENT_TIMEOUT = 3_000;

/** A target is sent this long after the last tap on its stepper. */
export const TARGET_DELAY = 800;

/** How long a sent target shows at most while its entity still reports the
 * old one: BamBuddy reports back within a poll or two. */
export const TARGET_HOLD = 10_000;

/** A target the card shows before its entity does: being tapped, or sent
 * while the entity still reported `sentFrom`. */
interface Draft {
  value: number;
  sentFrom?: string;
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
  };

  static override styles: CSSResultGroup = cardStyles;

  hass?: Hass;
  /** Set by Home Assistant in the card picker and the editor. */
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

  private refs?: PrinterRefs;
  private seenEntities?: Hass["entities"];
  private seenDevices?: Hass["devices"];
  private streamSrc?: string;
  private errorTimer?: ReturnType<typeof setTimeout>;
  private sentTimer?: ReturnType<typeof setTimeout>;
  private copiedTimer?: ReturnType<typeof setTimeout>;
  private readonly draftTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private attached = false;
  /** The open dialog came from the menu: closing it focuses the three dots. */
  private dialogFromMenu = false;

  static getConfigForm(): ReturnType<typeof configForm> {
    return configForm();
  }

  /** A card added from the picker: the first BamBuddy printer that is
   * online -- its preview shows what the card can do -- else the first. */
  static getStubConfig(hass?: Hass): Record<string, unknown> {
    const printers = hass ? printerDevices(hass) : [];
    const online = printers.find((device) => hass && !OFFLINE.includes(printStatus(hass, device.id) ?? "unavailable"));
    const first = online ?? printers[0];
    return { ...(first ? { printer: first.id } : {}), camera: "tap" };
  }

  setConfig(config: unknown): void {
    this.config = validateConfig(config);
    this.view = "status";
    this.liveWanted = false;
    this.refs = undefined;
    // A dialog belongs to the printer it was opened for.
    this.dialog = undefined;
    this.dialogFromMenu = false;
  }

  getCardSize(): number {
    const config = this.config;
    let size = 4;
    if (config?.show_temperatures !== false) size += 2;
    if (config?.show_fans !== false) size += 1;
    if (config?.show_ams !== false) size += 2;
    if (config?.show_controls !== false) size += 2;
    return size;
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
    this.error = undefined;
    clearTimeout(this.sentTimer);
    this.sent = false;
    clearTimeout(this.copiedTimer);
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
    if (
      previous.entities !== hass.entities ||
      previous.devices !== hass.devices ||
      previous.locale !== hass.locale ||
      previous.localize !== hass.localize
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
    if (!this.streaming()) this.streamSrc = undefined;
    else this.streamSrc ??= this.streamUrl();
    // A sent target goes once its entity reports a new state.
    for (const [entityId, draft] of this.drafts) {
      if (draft.sentFrom !== undefined && hass.states[entityId]?.state !== draft.sentFrom) this.dropDraft(entityId);
    }
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
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

  private get cameraMode(): CameraMode {
    return this.config?.camera ?? "tap";
  }

  /** The camera's stream token, while the camera can stream. */
  private cameraToken(): string | undefined {
    const camera = this.refs?.camera;
    if (!this.hass || !camera || !hasValue(this.hass, camera)) return undefined;
    const token = stateOf(this.hass, camera)?.attributes["access_token"];
    return typeof token === "string" && token ? token : undefined;
  }

  private streaming(): boolean {
    if (this.cameraMode === "off" || this.preview || !this.attached || !this.pageVisible) return false;
    if (!this.refs || !this.cameraToken()) return false;
    return this.cameraMode === "always" || this.liveWanted;
  }

  /** The live stream through Home Assistant's camera proxy. It is read when
   * the stream starts and kept while it runs: the token rotates, the
   * running stream does not need a new one. */
  private streamUrl(): string {
    return `/api/camera_proxy_stream/${this.refs?.camera}?token=${encodeURIComponent(this.cameraToken() ?? "")}`;
  }

  /** Ends a running stream at once; dropping the image alone can leave the
   * browser loading it. */
  private stopStream(): void {
    for (const image of this.renderRoot.querySelectorAll("img.stream")) image.removeAttribute("src");
    this.streamSrc = undefined;
  }

  /** Whether a tap can start the live view now. */
  private canStartLive(online: boolean): boolean {
    return this.cameraMode === "tap" && online && !this.preview && !this.liveWanted && this.cameraToken() !== undefined;
  }

  private readonly startLive = (): void => {
    this.streamFailed = false;
    this.liveWanted = true;
  };

  private readonly closeLive = (): void => {
    this.stopStream();
    this.liveWanted = false;
    this.streamFailed = false;
  };

  private readonly streamBroke = (): void => {
    this.stopStream();
    this.streamFailed = true;
  };

  private readonly retryLive = (): void => {
    this.streamFailed = false;
  };

  // --- Actions --------------------------------------------------------------

  /** Sends an action once at a time per key; whether it went through. */
  private async run(key: string, domain: string, service: string, data: Record<string, unknown>): Promise<boolean> {
    const hass = this.hass;
    if (!hass || this.pending.has(key)) return false;
    this.pending = new Set([...this.pending, key]);
    try {
      await callAction(hass, domain, service, data);
      this.showSent();
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

  /** A tap on a switch: the new state shows until the entity reports one,
   * 10 s at most; a command that fails shows the old one again. */
  private async toggleSwitch(entityId: string): Promise<void> {
    const on = !this.switchOn(entityId);
    this.setDraft(entityId, { value: on ? 1 : 0, sentFrom: (stateOf(this.hass as Hass, entityId) as HassEntityState).state });
    this.later(entityId, TARGET_HOLD, () => this.dropDraft(entityId));
    const sent = await this.run(`switch_${entityId}`, "switch", on ? "turn_on" : "turn_off", { entity_id: entityId });
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
    // A slot with a material always has a name: its state at least.
    const keep = slot.type ? slot.name : undefined;
    const current = slot.color?.toUpperCase();
    this.dialog = {
      kind: "filament",
      entityId: slot.entityId,
      title,
      ...(keep ? { keep, material: KEEP } : {}),
      ...(current ? { current, color: current, ...(inPalette(current) ? {} : { custom: current }) } : {}),
    };
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

  /** Ends the dialog; one the menu opened gives the focus back to the three dots. */
  private endDialog(): void {
    this.dialog = undefined;
    if (!this.dialogFromMenu) return;
    this.dialogFromMenu = false;
    this.focusMenuButton();
  }

  private readonly closeDialog = (): void => {
    this.endDialog();
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
    this.endDialog();
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
    setMaterial: (material: string) => this.editFilament({ material }),
    setColor: (color: string) => this.editFilament({ color }),
    pickColor: (color: string) => this.pickColor(color),
    copy: (text: string) => void this.copy(text),
  };

  // --- Menu -------------------------------------------------------------------

  private menuItems(): HTMLButtonElement[] {
    return [...this.renderRoot.querySelectorAll<HTMLButtonElement>(".menu [role=menuitem]")];
  }

  private readonly toggleMenu = (): void => {
    this.menuOpen = !this.menuOpen;
  };

  private focusMenuButton(): void {
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>(".menu-btn")?.focus());
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
            ${refresh
              ? item(
                  "refresh",
                  "menu_refresh",
                  () => void this.run("refresh", "button", "press", { entity_id: refresh }),
                  stateOf(hass, refresh)?.state === "unavailable" || this.pending.has("refresh"),
                )
              : nothing}
          </div>`
        : nothing}
    </span>`;
  }

  // --- Rendering ------------------------------------------------------------

  private context(hass: Hass, config: CardConfig, refs: PrinterRefs): CardContext {
    const online = refs.online ? stateOf(hass, refs.online)?.state === "on" : stateOf(hass, refs.status)?.state !== "offline";
    const reported = stateOf(hass, refs.status)?.state ?? "unknown";
    const status = online ? reported : "offline";
    const permitted = refs.pause !== undefined;
    const controls = config.show_controls !== false;
    return {
      hass,
      config,
      refs,
      status,
      online,
      busy: BUSY.has(status),
      running: RUNNING.has(status),
      changing: online && FILAMENT_CHANGE.has(stateOf(hass, refs.amsStatus)?.state ?? ""),
      canControl: permitted && controls,
      keyLacksControl: controls && !permitted,
      ...(this.canStartLive(online) ? { startLive: this.startLive } : {}),
      isPending: (key) => this.pending.has(key),
      run: (key, domain, service, data) => void this.run(key, domain, service, data),
      confirm: (confirmation) => {
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
      moreInfo: (entityId) => this.moreInfo(entityId),
      show: (view) => {
        this.view = view;
      },
    };
  }

  private views(refs: PrinterRefs): View[] {
    const config = this.config as CardConfig;
    const views: View[] = ["status"];
    if (config.show_controls !== false) views.push("control");
    if (config.show_ams !== false && (refs.ams.length || refs.externalSpools.length)) views.push("filament");
    return views;
  }

  private header(ctx: CardContext): TemplateResult {
    const { hass, refs, status } = ctx;
    const light = refs.light ? stateOf(hass, refs.light) : undefined;
    const lightOn = light?.state === "on";
    const title = printerTitle(ctx);
    const subline = subtitle(ctx);
    const open = (pill: Pill): void => {
      this.dialog = { kind: pill };
      this.dialogFromMenu = false;
    };
    return html`<div class="head">
      <span class="dot ${ctx.online ? "on" : ""}" role="img" aria-label=${t(hass, ctx.online ? "online" : "offline")} title=${t(hass, ctx.online ? "online" : "offline")}></span>
      <div class="names">
        <div class="name" title=${title}>${title}</div>
        ${subline ? html`<div class="model">${subline}</div>` : nothing}
      </div>
      <span class="chip tone-${toneOf(status)}">${formatState(hass, refs.status, status) ?? status}</span>
      ${refs.light && ctx.canControl
        ? html`<button
            class="icon-btn light ${lightOn ? "on" : ""}"
            aria-label=${t(hass, "light")}
            title=${t(hass, "light")}
            aria-pressed=${lightOn ? "true" : "false"}
            ?disabled=${!ctx.online || light?.state === "unavailable" || this.pending.has("light")}
            @click=${() => void this.run("light", "light", "toggle", { entity_id: refs.light })}
          >
            ${icon(lightOn ? "lightOn" : "lightOff")}
          </button>`
        : nothing}
      ${this.menu(ctx)}
    </div>
    ${pills(ctx, open)}`;
  }

  private tabs(views: View[]): TemplateResult | typeof nothing {
    if (views.length < 2) return nothing;
    const hass = this.hass as Hass;
    const select = (view: View): void => {
      this.view = view;
    };
    const step = (event: KeyboardEvent): void => {
      const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      const next = (views.indexOf(this.view) + delta + views.length) % views.length;
      select(views[next] as View);
      void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('.tabs [aria-selected="true"]')?.focus());
    };
    return html`<div class="tabs" role="tablist" aria-label=${t(hass, "aria_views")} @keydown=${step}>
      ${views.map(
        (view) => html`<button
          role="tab"
          aria-selected=${view === this.view ? "true" : "false"}
          tabindex=${view === this.view ? 0 : -1}
          @click=${() => select(view)}
        >
          ${t(hass, `tab_${view}` as TextKey)}
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
    const closable = this.cameraMode === "tap";
    const close = closable
      ? html`<button class="icon-btn" aria-label=${t(hass, "live_stop")} title=${t(hass, "live_stop")} @click=${this.closeLive}>${icon("close")}</button>`
      : nothing;
    if (this.streamFailed && (this.liveWanted || this.cameraMode === "always")) {
      return html`<div class="live failed" role="status">
        ${icon("videoOff")}<span>${t(hass, "camera_failed")}</span>
        <button class="btn" @click=${this.retryLive}>${t(hass, "retry")}</button>${close}
      </div>`;
    }
    if (!this.streamSrc) return nothing;
    return html`<div class="live">
      <img class="stream" src=${this.streamSrc} alt=${t(hass, "live")} @error=${this.streamBroke} />
      <span class="live-badge">${t(hass, "live_badge")}</span>${close}
    </div>`;
  }

  private errorLine(): TemplateResult | typeof nothing {
    const hass = this.hass as Hass;
    if (!this.error) {
      // A slot without height that sticks to the screen's bottom: nothing
      // moves, and a tall card shows it where the eye is.
      return this.sent ? html`<div class="sent-slot"><div class="sent" role="status">${icon("check")}<span>${t(hass, "sent")}</span></div></div>` : nothing;
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
    const ctx = this.context(hass, config, refs);
    const views = this.views(refs);
    const view = views.includes(this.view) ? this.view : "status";
    let body: TemplateResult;
    if (view === "control") {
      body = controlView(ctx, this.step, (step) => {
        this.step = step;
      });
    } else if (view === "filament") body = filamentView(ctx);
    else body = statusView(ctx, this.picture(ctx));
    return html`<ha-card>
      ${this.header(ctx)}${this.tabs(views)}${this.livePanel()}
      <div class="body">${body}</div>
      ${this.errorLine()}${this.dialog ? dialogView(ctx, this.dialog, this.dialogActions) : nothing}
    </ha-card>`;
  }
}

defineCard(TAG, BamBuddyPrinterCard, {
  name: () => t(undefined, "picker_name"),
  description: () => t(undefined, "picker_description"),
});
