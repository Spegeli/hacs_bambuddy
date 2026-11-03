// The helpers the card's test files share (they were card.test.ts's own).
import { it, vi } from "vitest";
import type { AmsRefs } from "../src/types";
import {
  a1mini,
  h2d,
  makeHass,
  mountFor,
  offlineP1s,
  p1s,
  readOnlyX1c,
  x1c,
  type FakeCard,
  type FakeDevice,
  type FakeHass,
  type FakeHassOptions,
  type PrinterSpec,
} from "./fixtures";
import { button, find, findAll, hasButton, root, settle, text } from "./helpers";

/** The load and unload buttons of the filament view's slots. */
export const loadButtons = (card: FakeCard): HTMLButtonElement[] =>
  findAll<HTMLButtonElement>(card, ".slot .btn").filter((item) => ["Load", "Unload", "Laden", "Entladen"].includes(text(item)));

/** Confirms the open dialog with its own button, the last one. */
export async function confirmDialog(card: FakeCard): Promise<void> {
  findAll<HTMLButtonElement>(card, "dialog button").at(-1)?.click();
  await settle(card);
}

/** A tap on the backdrop: pressed and let go on the dialog element itself. */
export function tapBeside(card: FakeCard): void {
  const dialog = find(card, "dialog") as HTMLElement;
  dialog.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, composed: true }));
  dialog.click();
}

/** The fixtures' printers by a short name, each with its device id. */
export const PRINTERS = {
  x1c: [x1c, "dev-x1c"],
  h2d: [h2d, "dev-h2d"],
  a1mini: [a1mini, "dev-a1mini"],
  p1s: [p1s, "dev-p1s"],
  offline: [offlineP1s, "dev-p1s"],
  readOnly: [readOnlyX1c, "dev-x1c"],
} as const satisfies Record<string, readonly [() => FakeDevice[], string]>;

/** A key pressed on an element of the card: the keyboard is there. */
export const keyPress = (element: Element): boolean => element.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true }));

/** One of the fixtures' printers on a card: its own devices unless others
 * are given, the card's options in `config`. */
export async function cardFor(
  name: keyof typeof PRINTERS,
  options: { config?: Record<string, unknown>; devices?: FakeDevice[] } & Partial<Pick<FakeHassOptions, "language" | "admin" | "callService">> = {},
): Promise<{ card: FakeCard; hass: FakeHass }> {
  const [devices, printer] = PRINTERS[name];
  const { config = {}, devices: given, ...hass } = options;
  return mountFor(given ?? devices(), printer, config, hass);
}

export const withX1c = async (overrides: Partial<PrinterSpec>, config: Record<string, unknown> = {}) => cardFor("x1c", { config, devices: x1c(overrides) });

/** The card as Home Assistant's card editor shows it: in its dialog. */
export async function previewOf(
  name: keyof typeof PRINTERS,
  config: Record<string, unknown> = {},
  language = "en",
  devices?: FakeDevice[],
): Promise<FakeCard> {
  const [make, printer] = PRINTERS[name];
  const card = document.createElement("bambuddy-printer-card") as FakeCard;
  card.preview = true;
  card.setConfig({ type: "custom:bambuddy-printer-card", printer, ...config });
  card.hass = makeHass({ devices: devices ?? make(), language });
  const dialog = document.createElement("hui-dialog-edit-card");
  dialog.attachShadow({ mode: "open" }).append(card);
  document.body.append(dialog);
  await card.updateComplete;
  return card;
}

export const samples = (card: FakeCard): string[] => findAll(card, ".sample .sample-note").map(text);

/** happy-dom's own shadow-root getter, put back after each test. */
export const shadowFullscreen = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "fullscreenElement");

/** The browser's Fullscreen API, which happy-dom lacks: entering makes the
 * card (the shadow host) the document's full-screen element, as browsers do. */
export function fullscreenApi(answer: "take" | "refuse" | "throw" | "nothing" | "hang" | "app" = "take") {
  let element: Element | null = null;
  const change = (): boolean => document.dispatchEvent(new Event("fullscreenchange"));
  // As browsers retarget it: the document sees the outermost shadow host
  // (Home Assistant's own element), each shadow root its own level.
  const retarget = (root: Document | ShadowRoot): Element | null => {
    let node: Element | null = element;
    while (node) {
      const nodeRoot = node.getRootNode();
      if (nodeRoot === root) return node;
      node = nodeRoot instanceof ShadowRoot ? nodeRoot.host : null;
    }
    return null;
  };
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => retarget(document) });
  Object.defineProperty(ShadowRoot.prototype, "fullscreenElement", {
    configurable: true,
    get(this: ShadowRoot): Element | null {
      return retarget(this);
    },
  });
  /** As Home Assistant's Android app (2026.8, seen in its WebView): right
   * after the request the page is hidden for 30-100 ms while the app shows
   * its full screen view; Blink grants the request in that time only if the
   * element is still on the page, and tells of the change after the page is
   * visible again. */
  const appFullscreen = (target: Element): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      setTimeout(() => pageState("hidden"), 10);
      setTimeout(() => {
        if (!target.isConnected) {
          pageState("visible");
          reject(new TypeError("Element is not connected"));
          return;
        }
        element = target;
        resolve();
        setTimeout(() => {
          pageState("visible");
          change();
        }, 10);
      }, 25);
    });
  const request = vi.fn(function (this: Element): Promise<void> | undefined {
    if (answer === "throw") throw new TypeError("not allowed");
    if (answer === "nothing") return undefined;
    if (answer === "refuse") return Promise.reject(new TypeError("not allowed"));
    if (answer === "hang") return new Promise<void>(() => undefined);
    if (answer === "app") return appFullscreen(this);
    element = this;
    change();
    return Promise.resolve();
  });
  Object.defineProperty(Element.prototype, "requestFullscreen", { configurable: true, value: request });
  const exit = vi.fn((): Promise<void> => {
    element = null;
    change();
    return Promise.resolve();
  });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
  return {
    request,
    exit,
    /** The browser leaves full screen by itself: Esc, the system's back, or
     * its element taken off the page -- the event comes a frame later
     * (`announce` false: not yet). */
    leave: (announce = true): void => {
      element = null;
      if (announce) change();
    },
    announce: (): boolean => change(),
    /** The browser grants a request it was still deciding. */
    take: (target: Element): void => {
      element = target;
      change();
    },
  };
}

/** The page hidden or shown, as a browser tells it. */
export function pageState(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

export function withoutFullscreenApi(): void {
  if (shadowFullscreen) Object.defineProperty(ShadowRoot.prototype, "fullscreenElement", shadowFullscreen);
  else Reflect.deleteProperty(ShadowRoot.prototype, "fullscreenElement");
  Reflect.deleteProperty(document, "fullscreenEnabled");
  Reflect.deleteProperty(document, "fullscreenElement");
  Reflect.deleteProperty(document, "exitFullscreen");
  Reflect.deleteProperty(Element.prototype, "requestFullscreen");
}

/** happy-dom applies no :focus-within across a shadow root; browsers do. */
export function emulateFocusWithin(card: FakeCard): void {
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string): boolean {
    if (selector !== ":focus-within") return matches.call(this, selector);
    const active = root(card).activeElement;
    return active !== null && this.contains(active);
  });
}

export async function fullCard(config: Record<string, unknown> = { camera: "always" }) {
  const found = await cardFor("x1c", { config });
  return { ...found, live: () => find(found.card, ".live") as HTMLElement };
}

/** The top layer's popover, which happy-dom lacks. */
export function popoverApi(showThrows = false) {
  const shown = vi.fn(function (this: HTMLElement): void {
    if (showThrows) throw new DOMException("not a popover", "NotSupportedError");
  });
  const hidden = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "showPopover", { configurable: true, value: shown });
  Object.defineProperty(HTMLElement.prototype, "hidePopover", { configurable: true, value: hidden });
  return { shown, hidden };
}

export function withoutPopoverApi(): void {
  Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
  Reflect.deleteProperty(HTMLElement.prototype, "hidePopover");
}

/** Ends full screen on every card a test left in it, then takes the cards off. */
export async function endFullscreens(): Promise<void> {
  for (const card of document.body.querySelectorAll<FakeCard>("bambuddy-printer-card")) {
    if (hasButton(card, "Exit full screen")) {
      button(card, "Exit full screen").click();
      await settle(card);
    }
    card.remove();
  }
}

export const historyMark = (): unknown => (history.state as { bambuddyFullscreen?: unknown } | null)?.bambuddyFullscreen;
