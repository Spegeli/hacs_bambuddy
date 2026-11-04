// The card's live view: the camera's stream through Home Assistant's
// proxy, and the picture full screen -- the browser's own, or the window
// where the browser has none.
import { html, nothing, type TemplateResult } from "lit";

import { formatNumber, hasValue, stateOf, textOrUndefined } from "./format";
import type { Settings } from "./forms";
import { icon } from "./icons";
import { t } from "./i18n";
import type { Hass, PrinterRefs } from "./types";

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

/** A key pressed in an open dialog: the dialog's, not full screen's. */
const inOpenDialog = (event: Event): boolean => event.composedPath().some((node) => node instanceof HTMLDialogElement && node.open);

/** Off, or the live view full screen: the browser's own, or the window
 * where the browser has none. */
export type Fullscreen = "off" | "native" | "window";

/** What the live view needs of the card. Its reactive state stays the
 * card's: a change draws the card again. */
export interface LiveHost {
  /** The card itself: on the page or not. */
  element: HTMLElement;
  /** The card's shadow root: Lit renders into one. */
  root: () => ShadowRoot;
  hass: () => Hass | undefined;
  refs: () => PrinterRefs | undefined;
  settings: () => Settings;
  /** Home Assistant's preview: no live view then. */
  preview: () => boolean;
  /** The job's picture shows large where the live view opens. */
  coverLarge: () => boolean;
  /** The large picture closes, its job forgotten: the live view takes its place. */
  closeCover: () => void;
  liveWanted: () => boolean;
  setLiveWanted: (wanted: boolean) => void;
  fullscreen: () => Fullscreen;
  setFullscreen: (mode: Fullscreen) => void;
  pageVisible: () => boolean;
  setPageVisible: (visible: boolean) => void;
  streamFailed: () => boolean;
  setStreamFailed: (failed: boolean) => void;
  focusAfterUpdate: (...selectors: string[]) => void;
  /** The page was hidden: the camera app may have taken it. */
  noteHidden: () => void;
  /** Opens the frame rate's dialog. */
  openFps: () => void;
}

export class LiveView {
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
  private hiddenWait?: ReturnType<typeof setTimeout>;
  /** The running stream's address; none while no stream runs. */
  private streamSrc?: string;

  /** A live picture's address is set: a stream may be open. */
  get hasStream(): boolean {
    return this.streamSrc !== undefined;
  }
  /** The frame rate the running stream asked for. */
  private streamFps?: number;
  /** The stream addresses this page loaded: started again at one of them,
   * the browser would show the picture it kept of the ended stream and ask
   * for nothing. A count makes such an address new (Home Assistant ignores
   * it). */
  private readonly streamsLoaded = new Set<string>();
  private streamRun = 0;
  /** The live view may stream: the card is on the page, or within the grace after it left. */
  private liveAllowed = false;

  constructor(private readonly host: LiveHost) {}

  /** Back within the grace: the live view goes on (in the window, where the
   * move ended the browser's full screen). */
  backOnPage(): void {
    clearTimeout(this.liveGrace);
    this.liveGrace = undefined;
    this.host.setPageVisible(document.visibilityState !== "hidden");
    this.liveAllowed = true;
  }

  /** Leaving the page took the picture out of the top layer, and out of
   * the browser's full screen -- which says so only a frame later, maybe
   * after a dashboard put the card back: the window stands in now. */
  leavePage(): void {
    this.popoverShown = false;
    if (this.host.fullscreen() === "native") this.host.setFullscreen("window");
    if (this.streamSrc || this.host.liveWanted() || this.host.fullscreen() !== "off") {
      // A dashboard may put the card back at once: the live view waits.
      clearTimeout(this.liveGrace);
      this.liveGrace = setTimeout(() => this.endLiveAway(), LIVE_GRACE_MS);
    } else {
      this.endLiveAway();
    }
  }

  /** Off the page for good: the live view ends. */
  private endLiveAway(): void {
    this.liveGrace = undefined;
    this.liveAllowed = false;
    this.leaveFullscreen();
    this.endLiveStream();
    this.host.setLiveWanted(false);
  }

  /** Hidden, the stream stops -- and full screen with it. While the browser
   * is asked for full screen only after a moment: taken out at once, the
   * picture would leave the page before the Android app's full screen shows
   * it, and the browser refuses it. Otherwise at once: a phone may run no
   * timer on a hidden page. */
  readonly onVisibility = (): void => {
    this.stopHiddenWait();
    if (document.visibilityState !== "hidden") {
      this.host.setPageVisible(true);
      return;
    }
    this.host.noteHidden();
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
    this.host.setPageVisible(false);
    this.endLiveStream();
  }

  stopHiddenWait(): void {
    clearTimeout(this.hiddenWait);
    this.hiddenWait = undefined;
  }

  /** Before each drawing: the stream follows what the card shows. */
  follow(): void {
    // Full screen ends with the stream (a new frame rate only restarts it):
    // the camera gone, the live view closed, the page hidden, a broken stream.
    if ((this.host.fullscreen() !== "off" || this.fullscreenAsking) && !this.streaming()) this.leaveFullscreen();
    // A stream a state ends goes as one that is closed: its image still
    // holds the address here, and the browser would keep loading it.
    if (!this.streaming()) {
      if (this.streamSrc) this.endLiveStream();
    } else {
      // A new frame rate: the stream starts anew to ask for it.
      const rate = this.frameRate();
      if (this.streamSrc && rate !== undefined && rate !== this.streamFps) this.endLiveStream();
      if (!this.streamSrc) {
        this.streamFps = rate;
        const url = this.streamUrl();
        this.streamSrc = this.streamsLoaded.has(url) ? `${url}&run=${++this.streamRun}` : url;
        this.streamsLoaded.add(url);
      }
    }
  }

  /** After each drawing: the window's picture goes to the top layer once it is a popover. */
  showWindow(): void {
    const live = this.liveElement();
    if (this.host.fullscreen() === "window" && !this.popoverShown && live?.hasAttribute("popover")) {
      try {
        live.showPopover();
        this.popoverShown = true;
      } catch {
        // Its own layer covers the window all the same.
      }
    }
  }

  /** The camera's stream token, while the camera can stream. */
  private cameraToken(): string | undefined {
    const hass = this.host.hass();
    const camera = this.host.refs()?.camera;
    if (!hass || !camera || !hasValue(hass, camera)) return undefined;
    return textOrUndefined(stateOf(hass, camera)?.attributes["access_token"]);
  }

  /** Whether the live stream runs now. Not after it broke: "Try again"
   * starts it anew, with the token of that moment. */
  private streaming(): boolean {
    const host = this.host;
    const settings = host.settings();
    if (settings.camera === "off" || host.coverLarge() || host.preview() || !this.liveAllowed || !host.pageVisible() || host.streamFailed()) return false;
    if (!host.refs() || !this.cameraToken()) return false;
    return settings.camera === "always" || host.liveWanted();
  }

  /** The frames a second the camera's streams ask for; `arriving`: the
   * ones that arrive while a stream runs. */
  private frameRate(arriving = false): number | undefined {
    const refs = this.host.refs();
    const rate = refs?.camera ? stateOf(this.host.hass() as Hass, refs.camera)?.attributes[arriving ? "streamed_frame_rate" : "frame_rate"] : undefined;
    return typeof rate === "number" ? rate : undefined;
  }

  /** The live stream through Home Assistant's camera proxy. It is read when
   * the stream starts and kept while it runs: the token rotates, the
   * running stream does not need a new one. The rate is for the browser:
   * a new one is a new address, and the image loads anew. */
  private streamUrl(): string {
    const rate = this.streamFps === undefined ? "" : `&fps=${this.streamFps}`;
    return `/api/camera_proxy_stream/${this.host.refs()?.camera}?token=${encodeURIComponent(this.cameraToken() ?? "")}${rate}`;
  }

  /** Ends a running stream at once; dropping the image alone can leave the
   * browser loading it. */
  endLiveStream(): void {
    for (const image of this.host.root().querySelectorAll("img.stream")) image.removeAttribute("src");
    this.streamSrc = undefined;
  }

  /** Whether a tap can start the live view now: where it does not show --
   * on tap until it is opened, always while the large picture stands in
   * its place. */
  liveOffered(online: boolean): boolean {
    const camera = this.host.settings().camera;
    if (camera === "off" || !online || this.host.preview() || this.cameraToken() === undefined) return false;
    return this.host.coverLarge() || (camera === "tap" && !this.host.liveWanted());
  }

  /** The keyboard's place goes with the live view: to its close button. */
  readonly startLive = (): void => {
    this.host.setStreamFailed(false);
    this.host.closeCover();
    if (this.host.settings().camera === "tap") this.host.setLiveWanted(true);
    this.host.focusAfterUpdate(".live .live-close", ".live .live-full");
  };

  /** Closed, the place goes back to the button that opens it: the picture,
   * or the control view's camera button -- in the filament view, which has
   * none, to its tab. */
  private readonly closeLive = (): void => {
    this.endLiveStream();
    this.host.setLiveWanted(false);
    this.host.setStreamFailed(false);
    this.host.focusAfterUpdate("button.live-hint", ".btn.live-btn", '.tabs [aria-selected="true"]');
  };

  private liveElement(): HTMLElement | null {
    return this.host.root().querySelector<HTMLElement>(".live");
  }

  /** Whether the browser shows this card's picture full screen. Seen from
   * the card's own shadow root: the document sees only the outermost shadow
   * host, Home Assistant's own element. */
  private ownFullscreen(): boolean {
    const live = this.liveElement();
    return live !== null && this.host.root().fullscreenElement === live;
  }

  /** The full-screen icon: in, or out again. The browser's full screen is
   * asked for within the click -- Firefox and Safari allow it only right
   * after one. The same element grows: no second stream. */
  private readonly toggleFullscreen = (): void => {
    if (this.host.fullscreen() !== "off") {
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
            if (this.host.fullscreen() === "window" || ask !== this.fullscreenAsk) document.exitFullscreen().catch(() => undefined);
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
    if (this.host.fullscreen() === "off" && this.host.element.isConnected) this.enterMode("window");
  }

  /** In full screen: an entry in the history of its own -- back (a gesture,
   * the mouse's button, Alt+Left) leaves full screen, not the dashboard. It
   * carries no address: Home Assistant's router and dialogs read none of it. */
  private enterMode(mode: "native" | "window"): void {
    this.host.setFullscreen(mode);
    this.fullscreenEntry = `${FULLSCREEN_PAGE}-${++fullscreenEntries}`;
    history.pushState({ bambuddyFullscreen: this.fullscreenEntry }, "");
    window.addEventListener("popstate", this.onPopState);
    this.host.focusAfterUpdate(".live .live-full");
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
      if (this.host.fullscreen() === "off") this.enterMode("native");
      return;
    }
    if (this.host.fullscreen() === "native") this.leaveFullscreen();
  };

  /** In full screen nothing behind the picture is reachable: Tab stays on
   * its icon. */
  private readonly onFullscreenKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      // The browser's full screen has its own Esc; one that closes a dialog
      // is the dialog's.
      if (this.host.fullscreen() !== "window" || inOpenDialog(event)) return;
      this.leaveFullscreen();
      return;
    }
    if (event.key !== "Tab" || this.host.fullscreen() === "off" || inOpenDialog(event)) return;
    event.preventDefault();
    this.host.root().querySelector<HTMLElement>(".live .live-full")?.focus();
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
    if (!fromHistory && this.host.fullscreen() !== "off" && this.ownEntryIsCurrent()) history.back();
    this.host.setFullscreen("off");
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
      this.host.focusAfterUpdate(".live .live-full", ".live.failed .btn", "button.live-hint", '.tabs [aria-selected="true"]');
    }
  }

  private readonly streamBroke = (): void => {
    this.endLiveStream();
    this.host.setStreamFailed(true);
  };

  private readonly retryLive = (): void => {
    this.host.setStreamFailed(false);
  };

  /** The live view: the stream with its tools, or what broke it. */
  panel(): TemplateResult | typeof nothing {
    const host = this.host;
    const hass = host.hass() as Hass;
    const settings = host.settings();
    const closable = settings.camera === "tap";
    const close = closable
      ? html`<button class="icon-btn live-close" aria-label=${t(hass, "live_stop")} title=${t(hass, "live_stop")} @click=${this.closeLive}>
          ${icon("close")}
        </button>`
      : nothing;
    if (host.streamFailed() && (host.liveWanted() || settings.camera === "always")) {
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
    const fpsNumber = host.refs()?.cameraFps;
    const fpsState = fpsNumber ? hass.states[fpsNumber] : undefined;
    const fpsOpen =
      fpsState && fpsState.state !== "unavailable" && !settings.readOnly
        ? html`<button
            class="icon-btn live-fps-open"
            aria-label=${t(hass, "fps_open")}
            title=${t(hass, "fps_open")}
            aria-haspopup="dialog"
            @click=${() => host.openFps()}
          >
            ${icon("cog")}
          </button>`
        : nothing;
    // What arrives, once the integration has counted it; a dash until then.
    const rate = this.frameRate(true);
    // Tenths below 1 (a slow chamber image), in the user's language.
    const fps = rate === undefined ? undefined : formatNumber(hass, rate, 1);
    const fpsLabel = fps === undefined ? t(hass, "fps_measuring") : t(hass, "fps_aria", { fps });
    const mode = host.fullscreen();
    const full = mode !== "off";
    const fullLabel = t(hass, full ? "fullscreen_close" : "fullscreen_open");
    // Full screen takes the picture out of the card: the holder keeps its
    // place, so the page behind does not jump.
    // The window's picture goes to the top layer where the browser has one.
    const popover = mode === "window" && typeof HTMLElement.prototype.showPopover === "function" ? "manual" : nothing;
    return html`${full ? html`<div class="live-holder"></div>` : nothing}<div class="live ${full ? "full" : ""}" popover=${popover}>
      <img class="stream" src=${this.streamSrc} alt=${t(hass, "live")} @error=${this.streamBroke} />
      <div class="live-tags">
        <span class="live-badge">${t(hass, "live_badge")}</span>
        <span class="live-badge live-fps" role="img" aria-label=${fpsLabel} title=${fpsLabel}>${t(hass, "fps_value", { fps: fps ?? "–" })}</span>
      </div>
      <div class="live-tools">${fpsOpen}${close}</div>
      <button class="icon-btn live-full" aria-label=${fullLabel} title=${fullLabel} @click=${this.toggleFullscreen}>
        ${icon(full ? "fullscreenExit" : "fullscreen")}
      </button>
    </div>`;
  }
}
