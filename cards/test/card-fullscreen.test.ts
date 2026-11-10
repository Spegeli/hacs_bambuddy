// The live view in full screen: the browser's, Home Assistant's Android app's, the window filled; back, and its end.
import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { ICONS } from "../src/icons";

import {
  type FakeCard,
} from "./fixtures";
import { atRule, button, declarations, find, findAll, hasButton, root, settle, styleText, update } from "./helpers";
import { cardFor, emulateFocusWithin, fullCard, fullscreenApi, historyMark, keyPress, leaveFullscreenWorld, pageState, popoverApi, useCardPage } from "./card-helpers";

useCardPage();

describe("the live view in full screen", () => {
  it("shows the full-screen icon on a running stream", async () => {
    const { card } = await cardFor("x1c");
    expect(hasButton(card, "Full screen")).toBe(false);
    button(card, "Live view").click();
    await card.updateComplete;
    const full = button(card, "Full screen");
    // Beside the tags, not among the tools that full screen hides.
    expect(full.closest(".live")).not.toBeNull();
    expect(full.closest(".live-tools")).toBeNull();
    expect(full.getAttribute("title")).toBe("Full screen");
    expect(full.querySelector("svg path")?.getAttribute("d")).toBe(ICONS.fullscreen);
    const always = await cardFor("x1c", { config: { camera: "always" } });
    expect(hasButton(always.card, "Full screen")).toBe(true);
    // A view, not a control: the view-only card has it too.
    const viewOnly = await cardFor("x1c", { config: { camera: "always", read_only: true } });
    expect(hasButton(viewOnly.card, "Full screen")).toBe(true);
    const german = await cardFor("x1c", { config: { camera: "always" }, language: "de" });
    expect(hasButton(german.card, "Vollbild")).toBe(true);
  });

  it("offers no full screen without a stream", async () => {
    const { card } = await cardFor("x1c", { config: { camera: "always" } });
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    expect(find(card, ".live.failed")).not.toBeNull();
    expect(hasButton(card, "Full screen")).toBe(false);
    const off = await cardFor("x1c", { config: { camera: "off" } });
    expect(hasButton(off.card, "Full screen")).toBe(false);
  });

  it("keeps a narrow card's chips clear of the full-screen icon", () => {
    const narrow = atRule("@container (max-width: 260px)");
    const right = declarations(".live-tags", narrow).find((item) => item.startsWith("right: "));
    // The icon: 6 px from the edge, 36 px wide.
    expect(parseInt(right?.slice(7) ?? "", 10)).toBeGreaterThanOrEqual(46);
    expect(declarations(".live-full")).toEqual(expect.arrayContaining(["bottom: 6px", "right: 6px"]));
  });
});

describe("full screen in Home Assistant's Android app", () => {
  afterEach(leaveFullscreenWorld);

  it("goes full screen with one tap, though the app hides the page for a moment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fullscreenApi("app");
    const { card, live } = await fullCard();
    const stream = find<HTMLImageElement>(card, "img.stream");
    const src = stream?.getAttribute("src");
    button(card, "Full screen").click();
    await vi.advanceTimersByTimeAsync(50);
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    expect(hasButton(card, "Exit full screen")).toBe(true);
    // The same stream: the moment hidden ended nothing.
    expect(find(card, "img.stream")).toBe(stream);
    expect(stream?.getAttribute("src")).toBe(src);
  });

  it("leaves the app's full screen with one tap", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = fullscreenApi("app");
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await vi.advanceTimersByTimeAsync(50);
    await settle(card);
    button(card, "Exit full screen").click();
    await settle(card);
    expect(api.exit).toHaveBeenCalledTimes(1);
    expect(live().classList.contains("full")).toBe(false);
  });
});

describe("the live view in the browser's full screen", () => {
  afterEach(leaveFullscreenWorld);

  it("asks the browser for full screen in the click itself", async () => {
    const api = fullscreenApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    // Within the click: Firefox and Safari allow it only right after one.
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request.mock.contexts[0]).toBe(live());
  });

  it("follows the browser into and out of full screen", async () => {
    const api = fullscreenApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    const exit = button(card, "Exit full screen");
    expect(exit.querySelector("svg path")?.getAttribute("d")).toBe(ICONS.fullscreenExit);
    expect(root(card).activeElement).toBe(exit);
    api.leave();
    await settle(card);
    expect(live().classList.contains("full")).toBe(false);
    expect(root(card).activeElement).toBe(button(card, "Full screen"));
    // Its own button leaves too.
    button(card, "Full screen").click();
    await settle(card);
    button(card, "Exit full screen").click();
    await settle(card);
    expect(api.exit).toHaveBeenCalledTimes(1);
    expect(live().classList.contains("full")).toBe(false);
  });

  it("keeps one stream", async () => {
    fullscreenApi();
    const { card } = await fullCard();
    const stream = find<HTMLImageElement>(card, "img.stream");
    const src = stream?.getAttribute("src");
    button(card, "Full screen").click();
    await settle(card);
    expect(find(card, "img.stream")).toBe(stream);
    expect(findAll(card, "img.stream")).toHaveLength(1);
    button(card, "Exit full screen").click();
    await settle(card);
    expect(find(card, "img.stream")).toBe(stream);
    expect(stream?.getAttribute("src")).toBe(src);
  });

  it("stays full screen through a new frame rate", async () => {
    fullscreenApi();
    const { card, hass, live } = await fullCard();
    const stream = find<HTMLImageElement>(card, "img.stream");
    button(card, "Full screen").click();
    await settle(card);
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "token-x1c", frame_rate: 15 }));
    expect(find(card, "img.stream")).toBe(stream);
    expect(stream?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=15");
    expect(live().classList.contains("full")).toBe(true);
  });

  it("keeps the card's height while the picture is full screen", async () => {
    fullscreenApi();
    const { card } = await fullCard();
    expect(find(card, ".live-holder")).toBeNull();
    button(card, "Full screen").click();
    await settle(card);
    expect(find(card, ".live-holder")).not.toBeNull();
    expect(findAll(card, ".live")).toHaveLength(1);
    button(card, "Exit full screen").click();
    await settle(card);
    expect(find(card, ".live-holder")).toBeNull();
  });

  it("leaves the focus where it is when full screen ends with the focus elsewhere", async () => {
    const api = fullscreenApi();
    const { card } = await fullCard();
    emulateFocusWithin(card);
    button(card, "Full screen").click();
    await settle(card);
    const menu = find<HTMLButtonElement>(card, ".menu-btn");
    menu?.focus();
    api.leave();
    await settle(card);
    expect(root(card).activeElement).toBe(menu);
  });

  it("keeps Tab on the exit icon in full screen", async () => {
    fullscreenApi();
    const { card } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    const exit = button(card, "Exit full screen");
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true, cancelable: true });
    exit.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(root(card).activeElement).toBe(exit);
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, composed: true, cancelable: true });
    exit.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    // Not full screen: Tab is the page's.
    button(card, "Exit full screen").click();
    await settle(card);
    const free = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true, cancelable: true });
    button(card, "Full screen").dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
  });

  it("recognises its full screen deep in Home Assistant's shadow trees", async () => {
    const api = fullscreenApi();
    const { card, live } = await fullCard();
    // Home Assistant holds the card several shadow roots deep.
    const outer = document.createElement("div");
    document.body.append(outer);
    const inner = document.createElement("div");
    outer.attachShadow({ mode: "open" }).append(inner);
    inner.append(card);
    await settle(card);
    button(card, "Full screen").click();
    await settle(card);
    expect(document.fullscreenElement).toBe(outer);
    expect(live().classList.contains("full")).toBe(true);
    expect(historyMark()).toEqual(expect.any(String));
    button(card, "Exit full screen").click();
    await settle(card);
    expect(api.exit).toHaveBeenCalledTimes(1);
    outer.remove();
  });

  it("marks its history entry so that none of an earlier page load holds back", async () => {
    fullscreenApi();
    const { card } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    // History outlives a reload; a count alone would start again at 1.
    expect(historyMark()).toEqual(expect.stringMatching(/^[a-z0-9]+-\d+$/));
  });

  it("leaves Tab alone while the browser decides and in a dialog over full screen", async () => {
    const api = fullscreenApi("hang");
    let grant: (() => void) | undefined;
    api.request.mockImplementationOnce(() => new Promise<void>((resolve) => (grant = resolve)));
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    const waiting = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true, cancelable: true });
    button(card, "Full screen").dispatchEvent(waiting);
    expect(waiting.defaultPrevented).toBe(false);
    api.take(live());
    grant?.();
    await settle(card);
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const field = document.createElement("button");
    dialog.append(field);
    document.body.append(dialog);
    const inDialog = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true, cancelable: true });
    field.dispatchEvent(inDialog);
    expect(inDialog.defaultPrevented).toBe(false);
    dialog.remove();
  });

  it("gives the focus to Try again when the stream breaks in full screen", async () => {
    fullscreenApi();
    const { card } = await fullCard();
    emulateFocusWithin(card);
    button(card, "Full screen").click();
    await settle(card);
    expect(root(card).activeElement).toBe(button(card, "Exit full screen"));
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await settle(card);
    expect(root(card).activeElement).toBe(button(card, "Try again"));
  });

  it("swallows a browser that fails to leave", async () => {
    const api = fullscreenApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    const refused = Promise.reject(new TypeError("not in full screen"));
    const handled = vi.spyOn(refused, "catch");
    api.exit.mockImplementationOnce(() => refused);
    button(card, "Exit full screen").click();
    await settle(card);
    expect(handled).toHaveBeenCalled();
    expect(live().classList.contains("full")).toBe(false);
  });

  it("fills the whole screen, without the card's tools", () => {
    const sheet = styleText();
    expect(declarations(".live.full", sheet)).toEqual(
      expect.arrayContaining(["position: fixed", "inset: 0", "width: 100%", "height: 100%", "max-height: none", "margin: 0", "border: 0", "padding: 0", "border-radius: 0", "aspect-ratio: auto"]),
    );
    expect(declarations(".live.full .live-tools", sheet)).toContain("display: none");
    expect(declarations(".live.full .live-tags", sheet)).toContain("top: max(12px, env(safe-area-inset-top))");
    expect(declarations(".live.full .live-full", sheet)).toEqual(expect.arrayContaining(["bottom: max(6px, env(safe-area-inset-bottom))", "right: max(6px, env(safe-area-inset-right))"]));
    // Large enough to find on a phone, on the grey disc that shows on black and on a bright picture.
    expect(declarations(".live.full .live-full", sheet)).toEqual(expect.arrayContaining(["width: 52px", "height: 52px"]));
    expect(declarations(".live.full .live-full .icon", sheet)).toEqual(expect.arrayContaining(["width: 30px", "height: 30px"]));
  });
});

describe("the live view's overlay", () => {
  it("puts every button on the picture and the fps chip on one grey disc", () => {
    const sheet = styleText();
    // Dark enough for the fps chip's text on a bright picture (about 4.9 : 1 on white).
    expect(sheet).toMatch(/--bb-on-picture:\s*rgba\(72, 72, 72, 0\.78\);/);
    expect(declarations(".live .icon-btn", sheet)).toContain("background: var(--bb-on-picture)");
    expect(declarations(".live-fps", sheet)).toContain("background: var(--bb-on-picture)");
    // Full screen keeps the same disc: no light one of its own.
    expect(sheet).not.toMatch(/rgba\(255, 255, 255, 0\.18\)/);
    // Live stays red.
    expect(declarations(".live-badge", sheet)).toContain("background: rgba(219, 68, 55, 0.92)");
  });

  it("grows Live and fps in full screen as it grows its button", () => {
    const sheet = styleText();
    expect(declarations(".live.full .live-badge", sheet)).toContain("font-size: 16px");
    expect(declarations(".live.full .live-tags", sheet)).toContain("gap: 9px");
  });
});

describe("the live view filling the window", () => {
  afterEach(leaveFullscreenWorld);

  it("fills the window where the browser has no full screen", async () => {
    const popover = popoverApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    // The top layer: no ancestor's filter or transform can hold it in.
    expect(live().getAttribute("popover")).toBe("manual");
    expect(popover.shown.mock.contexts[0]).toBe(live());
    expect(root(card).activeElement).toBe(button(card, "Exit full screen"));
    button(card, "Exit full screen").click();
    await settle(card);
    expect(popover.hidden.mock.contexts[0]).toBe(live());
    expect(live().hasAttribute("popover")).toBe(false);
    expect(live().classList.contains("full")).toBe(false);
  });

  it("covers the window with its own layer where the top layer is missing too", async () => {
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    expect(live().hasAttribute("popover")).toBe(false);
    // A popover that refuses: the layer covers the window all the same.
    popoverApi(true);
    button(card, "Exit full screen").click();
    await settle(card);
    button(card, "Full screen").click();
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
  });

  it.each(["refuse", "throw", "nothing"] as const)("falls back to the window when the browser's full screen does not come (%s)", async (answer) => {
    popoverApi();
    fullscreenApi(answer);
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    expect(live().getAttribute("popover")).toBe("manual");
  });

  it("falls back to the window when the browser neither takes nor refuses, and stays there", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    const api = fullscreenApi("hang");
    let late: (() => void) | undefined;
    api.request.mockImplementationOnce(() => new Promise<void>((resolve) => (late = resolve)));
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await vi.advanceTimersByTimeAsync(1000);
    expect(live().hasAttribute("popover")).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    await settle(card);
    expect(live().getAttribute("popover")).toBe("manual");
    // Full screen after all: one mode -- the browser's is undone.
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => card });
    late?.();
    await settle(card);
    expect(api.exit).toHaveBeenCalledTimes(1);
    expect(live().getAttribute("popover")).toBe("manual");
  });

  it("leaves a late full screen the card no longer wants", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    const api = fullscreenApi("hang");
    let late: (() => void) | undefined;
    api.request.mockImplementationOnce(() => new Promise<void>((resolve) => (late = resolve)));
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await vi.advanceTimersByTimeAsync(1600);
    await settle(card);
    button(card, "Exit full screen").click();
    await settle(card);
    // The browser says yes after all: the card wants none any more.
    api.take(live());
    late?.();
    await settle(card);
    expect(api.exit).toHaveBeenCalledTimes(1);
    expect(live().classList.contains("full")).toBe(false);
  });

  it("asks once while the browser decides", async () => {
    popoverApi();
    const api = fullscreenApi("hang");
    const { card } = await fullCard();
    button(card, "Full screen").click();
    button(card, "Full screen").click();
    await settle(card);
    expect(api.request).toHaveBeenCalledTimes(1);
  });

  it("fills no window for a card taken off the page while the browser decides", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const popover = popoverApi();
    fullscreenApi("hang");
    const { card } = await fullCard();
    const mark = historyMark();
    button(card, "Full screen").click();
    card.remove();
    await vi.advanceTimersByTimeAsync(1600);
    expect(popover.shown).not.toHaveBeenCalled();
    expect(historyMark()).toBe(mark);
  });

  it("leaves the window on Esc", async () => {
    popoverApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle(card);
    expect(live().classList.contains("full")).toBe(false);
  });

  it("ignores an Esc that closes a dialog", async () => {
    popoverApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    keyPress(dialog, "Escape");
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    // A dialog that is closed is no reason.
    dialog.removeAttribute("open");
    keyPress(dialog, "Escape");
    await settle(card);
    expect(live().classList.contains("full")).toBe(false);
  });
});

describe("back leaving the live view's full screen", () => {
  afterEach(leaveFullscreenWorld);

  it.each(["native", "window"] as const)("leaves full screen on back, not the dashboard (%s)", async (mode) => {
    const api = mode === "native" ? fullscreenApi() : undefined;
    if (mode === "window") popoverApi();
    const { card, live } = await fullCard();
    const href = location.href;
    button(card, "Full screen").click();
    await settle(card);
    expect(historyMark()).toEqual(expect.any(String));
    expect(location.href).toBe(href);
    history.back();
    await settle(card);
    expect(live().classList.contains("full")).toBe(false);
    expect(location.href).toBe(href);
    if (api) expect(api.exit).toHaveBeenCalledTimes(1);
  });

  it("takes its entry back when it is left otherwise", async () => {
    popoverApi();
    const { card } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    const mine = historyMark();
    const back = vi.spyOn(history, "back");
    button(card, "Exit full screen").click();
    await settle(card);
    expect(back).toHaveBeenCalledTimes(1);
    expect(historyMark()).not.toBe(mine);
  });

  it("leaves another's entry alone", async () => {
    popoverApi();
    const { card } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    // A dialog of Home Assistant's opened over it, with its own entry.
    history.pushState({ dialog: "more-info" }, "");
    const back = vi.spyOn(history, "back");
    button(card, "Exit full screen").click();
    await settle(card);
    expect(back).not.toHaveBeenCalled();
    expect(history.state).toEqual({ dialog: "more-info" });
  });

  it("stays full screen when an entry above its own goes", async () => {
    popoverApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    history.pushState({ dialog: "more-info" }, "");
    history.back();
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
  });

  it("two cards keep their own entries", async () => {
    popoverApi();
    const first = await fullCard();
    const second = await fullCard();
    button(first.card, "Full screen").click();
    await settle(first.card);
    button(second.card, "Full screen").click();
    await settle(second.card);
    history.back();
    await settle(first.card);
    await settle(second.card);
    expect(second.live().classList.contains("full")).toBe(false);
    expect(first.live().classList.contains("full")).toBe(true);
  });
});

describe("full screen ending by itself, and a card moved on the dashboard", () => {
  const inFullscreen = (card: FakeCard): boolean => hasButton(card, "Exit full screen");

  afterEach(leaveFullscreenWorld);

  it("leaves full screen when the camera goes", async () => {
    popoverApi();
    const { card, hass } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    const mine = historyMark();
    await update(card, hass.withState("camera.x1c_camera", "unavailable", {}));
    expect(inFullscreen(card)).toBe(false);
    expect(find(card, ".live-holder")).toBeNull();
    await settle(card);
    expect(historyMark()).not.toBe(mine);
  });

  it("leaves full screen when the page is hidden", async () => {
    popoverApi();
    const { card } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    pageState("hidden");
    await settle(card);
    expect(inFullscreen(card)).toBe(false);
    pageState("visible");
    await settle(card);
    // The stream comes back, in the card.
    expect(find(card, "img.stream")).not.toBeNull();
    expect(inFullscreen(card)).toBe(false);
  });

  it("leaves the browser's full screen when the stream breaks", async () => {
    const api = fullscreenApi();
    const { card } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    const mine = historyMark();
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await settle(card);
    expect(find(card, ".live.failed")).not.toBeNull();
    expect(api.exit).toHaveBeenCalledTimes(1);
    expect(historyMark()).not.toBe(mine);
  });

  it("does not come back when the stream ended while the browser decided", async () => {
    popoverApi();
    const api = fullscreenApi("hang");
    let refuse: ((reason: unknown) => void) | undefined;
    api.request.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => (refuse = reject)));
    const { card, hass } = await fullCard();
    button(card, "Full screen").click();
    await update(card, hass.withState("camera.x1c_camera", "unavailable", {}));
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "token-x1c", frame_rate: 30 }));
    refuse?.(new TypeError("too late"));
    await settle(card);
    expect(find(card, "img.stream")).not.toBeNull();
    expect(inFullscreen(card)).toBe(false);
  });

  it("keeps the live view of a card moved within the grace, in the window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const popover = popoverApi();
    const { card, hass, live } = await fullCard();
    const stream = find<HTMLImageElement>(card, "img.stream");
    const src = stream?.getAttribute("src");
    button(card, "Full screen").click();
    await settle(card);
    card.remove();
    // An update while it is away stops nothing.
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "rotated", frame_rate: 30 }));
    await vi.advanceTimersByTimeAsync(500);
    document.body.append(card);
    await settle(card);
    expect(find(card, "img.stream")).toBe(stream);
    expect(stream?.getAttribute("src")).toBe(src);
    expect(live().classList.contains("full")).toBe(true);
    // Back in the top layer: leaving the page took it out.
    expect(popover.shown).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(stream?.getAttribute("src")).toBe(src);
  });

  it("goes on in the window when a move ended the browser's full screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    const api = fullscreenApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    card.remove();
    // The browser ends full screen when its element leaves the page.
    api.leave();
    await vi.advanceTimersByTimeAsync(300);
    document.body.append(card);
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    expect(live().getAttribute("popover")).toBe("manual");
    expect(historyMark()).toEqual(expect.any(String));
  });

  it("ends the stream and the request when the page stays hidden while the browser decides", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    fullscreenApi("hang");
    const { card } = await fullCard();
    button(card, "Full screen").click();
    pageState("hidden");
    await settle(card);
    // A moment only, it might be the Android app bringing up its full screen.
    expect(find(card, "img.stream")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    await settle(card);
    expect(find(card, "img.stream")).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    await settle(card);
    // The browser's answer never came, and the window does not stand in.
    expect(inFullscreen(card)).toBe(false);
  });

  it("keeps the stream of a card moved while the page was hidden for a moment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    fullscreenApi("hang");
    const { card } = await fullCard();
    const stream = find<HTMLImageElement>(card, "img.stream");
    const src = stream?.getAttribute("src");
    button(card, "Full screen").click();
    pageState("hidden");
    card.remove();
    // Visible again while the card is away: it hears nothing of it.
    pageState("visible");
    await vi.advanceTimersByTimeAsync(1200);
    document.body.append(card);
    await settle(card);
    expect(find(card, "img.stream")).toBe(stream);
    expect(stream?.getAttribute("src")).toBe(src);
  });

  it("reads the page's visibility again when it comes back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { card } = await fullCard();
    card.remove();
    // Hidden while the card was away, its listener with it.
    pageState("hidden");
    await vi.advanceTimersByTimeAsync(300);
    document.body.append(card);
    await settle(card);
    expect(find(card, "img.stream")).toBeNull();
  });

  it("goes on in the window when the browser tells of the end only after the return", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    const api = fullscreenApi();
    const { card, live } = await fullCard();
    button(card, "Full screen").click();
    await settle(card);
    card.remove();
    // Leaving the page ended the browser's full screen; it says so a frame later.
    api.leave(false);
    document.body.append(card);
    api.announce();
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    expect(live().getAttribute("popover")).toBe("manual");
  });

  it("tears down a card that stays away", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    popoverApi();
    const { card } = await fullCard({});
    button(card, "Live view").click();
    await settle(card);
    const stream = find<HTMLImageElement>(card, "img.stream");
    button(card, "Full screen").click();
    await settle(card);
    const mine = historyMark();
    card.remove();
    await vi.advanceTimersByTimeAsync(1900);
    expect(stream?.hasAttribute("src")).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(stream?.hasAttribute("src")).toBe(false);
    await settle(card);
    expect(historyMark()).not.toBe(mine);
    document.body.append(card);
    await settle(card);
    expect(find(card, "img.stream")).toBeNull();
    expect(inFullscreen(card)).toBe(false);
  });
});
