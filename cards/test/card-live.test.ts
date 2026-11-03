import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { ICONS } from "../src/icons";

import type { AmsRefs } from "../src/types";
import {
  a1mini,
  h2d,
  makeHass,
  mountCard,
  x1c,
  type FakeCard,
} from "./fixtures";
import { atRule, button, declarations, find, findAll, hasButton, press, root, settle, showView, styleText, text, update } from "./helpers";
import { cardFor, emulateFocusWithin, endFullscreens, fullCard, fullscreenApi, historyMark, keyPress, pageState, popoverApi, withoutFullscreenApi, withoutPopoverApi } from "./card-helpers";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("the live view", () => {
  const visibility = pageState;

  afterEach(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("starts on a tap on the picture and stops when closed", async () => {
    const { card, hass } = await cardFor("x1c");
    expect(find(card, "img.stream")).toBeNull();
    button(card, "Live view").click();
    await card.updateComplete;
    const stream = find<HTMLImageElement>(card, "img.stream");
    expect(stream?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=30");
    expect(hasButton(card, "Live view")).toBe(false);
    // The running stream keeps its address when the token rotates.
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "rotated", frame_rate: 30 }));
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=30");
    button(card, "Close the live view").click();
    expect(stream?.hasAttribute("src")).toBe(false);
    await card.updateComplete;
    expect(find(card, "img.stream")).toBeNull();
    expect(hasButton(card, "Live view")).toBe(true);
  });

  it("offers to try again when the stream breaks", async () => {
    const { card } = await cardFor("x1c");
    button(card, "Live view").click();
    await card.updateComplete;
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    expect(text(find(card, ".live.failed"))).toContain("The camera is not available.");
    await press(card, "Try again");
    expect(find(card, "img.stream")).not.toBeNull();
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    await press(card, "Close the live view");
    expect(find(card, ".live")).toBeNull();
  });

  it("tries again with the camera's token of that moment", async () => {
    const { card, hass } = await cardFor("x1c");
    button(card, "Live view").click();
    await card.updateComplete;
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    // Minutes later Home Assistant has rotated the token twice: the old one is refused.
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "rotated-twice", frame_rate: 30 }));
    await press(card, "Try again");
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=rotated-twice&fps=30");
  });

  it("ends a stream that a state ends, so that the browser stops loading it", async () => {
    const { card, hass } = await cardFor("x1c", { config: { camera: "always" } });
    const stream = find<HTMLImageElement>(card, "img.stream");
    expect(stream?.hasAttribute("src")).toBe(true);
    await update(card, hass.withState("camera.x1c_camera", "unavailable", {}));
    expect(find(card, "img.stream")).toBeNull();
    expect(stream?.hasAttribute("src")).toBe(false);
  });

  it("starts anew, not with the browser's finished picture, when the camera comes back", async () => {
    const { card, hass } = await cardFor("x1c", { config: { camera: "always" } });
    const first = find<HTMLImageElement>(card, "img.stream")?.getAttribute("src");
    await update(card, hass.withState("camera.x1c_camera", "unavailable", {}));
    expect(find(card, "img.stream")).toBeNull();
    // The same token, the same rate: the same address would show the
    // picture the browser kept of the ended stream, and ask for nothing.
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "token-x1c", frame_rate: 30 }));
    const again = find<HTMLImageElement>(card, "img.stream")?.getAttribute("src");
    expect(again).not.toBe(first);
    expect(again).toBe(`${first}&run=1`);
    // And once more: never an address the page loaded before.
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    button(card, "Try again").click();
    await card.updateComplete;
    expect(find(card, "img.stream")?.getAttribute("src")).toBe(`${first}&run=2`);
  });

  it("ends the old printer's stream when the card is set to another", async () => {
    const hass = makeHass({ devices: [...x1c(), ...h2d()] });
    const card = await mountCard(hass, { printer: "dev-x1c", camera: "always" });
    expect(find(card, "img.stream")?.getAttribute("src")).toContain("camera.x1c_camera");
    card.setConfig({ type: "custom:bambuddy-printer-card", printer: "dev-h2d", camera: "always" });
    await settle(card);
    expect(find(card, "img.stream")?.getAttribute("src") ?? "").not.toContain("camera.x1c_camera");
  });

  it("runs all the time with camera: always, and stops while the page is hidden", async () => {
    const { card } = await cardFor("x1c", { config: { camera: "always" } });
    expect(find(card, "img.stream")).not.toBeNull();
    expect(hasButton(card, "Close the live view")).toBe(false);
    expect(find(card, "button.live-hint")).toBeNull();
    visibility("hidden");
    await card.updateComplete;
    expect(find(card, "img.stream")).toBeNull();
    visibility("visible");
    await card.updateComplete;
    expect(find(card, "img.stream")).not.toBeNull();
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await card.updateComplete;
    expect(find(card, ".live.failed")).not.toBeNull();
    expect(hasButton(card, "Close the live view")).toBe(false);
  });

  it("stops a moment after the card leaves the page, and starts again with camera: always", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { card } = await cardFor("x1c", { config: { camera: "always" } });
    const stream = find<HTMLImageElement>(card, "img.stream");
    card.remove();
    // A dashboard may put it back at once (a masonry view laying out anew).
    expect(stream?.hasAttribute("src")).toBe(true);
    await vi.advanceTimersByTimeAsync(2100);
    expect(stream?.hasAttribute("src")).toBe(false);
    document.body.append(card);
    await card.updateComplete;
    expect(find(card, "img.stream")).not.toBeNull();
    const { card: tapped } = await cardFor("x1c");
    button(tapped, "Live view").click();
    await tapped.updateComplete;
    tapped.remove();
    await vi.advanceTimersByTimeAsync(2100);
    document.body.append(tapped);
    await tapped.updateComplete;
    expect(find(tapped, "img.stream")).toBeNull();
    vi.useRealTimers();
  });

  it("never runs with camera: off, in a preview, or without a camera that can stream", async () => {
    const { card } = await cardFor("x1c", { config: { camera: "off" } });
    expect(find(card, "button.live-hint")).toBeNull();
    expect(find(card, "img.stream")).toBeNull();
    const hass = makeHass({ devices: x1c() });
    const preview = document.createElement("bambuddy-printer-card") as FakeCard;
    preview.preview = true;
    preview.setConfig({ type: "custom:bambuddy-printer-card", printer: "dev-x1c", camera: "always" });
    preview.hass = hass;
    document.body.append(preview);
    await preview.updateComplete;
    expect(find(preview, "img.stream")).toBeNull();
    expect(find(preview, "button.live-hint")).toBeNull();
    const { card: noToken, hass: plain } = await cardFor("x1c", { config: { camera: "always" } });
    await update(noToken, plain.withState("camera.x1c_camera", "idle", { access_token: "" }));
    expect(find(noToken, "img.stream")).toBeNull();
    const { card: noCamera } = await cardFor("x1c", { config: { camera: "always" }, devices: x1c({ camera: false }) });
    expect(find(noCamera, "img.stream")).toBeNull();
    const { card: unavailable, hass: other } = await cardFor("x1c");
    await update(unavailable, other.withState("camera.x1c_camera", "unavailable"));
    expect(find(unavailable, "button.live-hint")).toBeNull();
  });

  it("measures its frame rate, and offers to change it where the camera gives more", async () => {
    const { card } = await cardFor("x1c", { config: { camera: "always" } });
    expect(text(find(card, ".live-fps"))).toBe("– fps");
    expect(hasButton(card, "Set the frame rate")).toBe(true);
    // A camera that gives only 5: nothing to set.
    const a1 = await cardFor("a1mini", { config: { camera: "always" } });
    expect(text(find(a1.card, ".live-fps"))).toBe("– fps");
    expect(hasButton(a1.card, "Set the frame rate")).toBe(false);
    // A view-only card sets nothing.
    const viewOnly = await cardFor("x1c", { config: { camera: "always", read_only: true } });
    expect(text(find(viewOnly.card, ".live-fps"))).toBe("– fps");
    expect(hasButton(viewOnly.card, "Set the frame rate")).toBe(false);
  });

  it("shows a dash until the integration has counted what arrives, never the rate asked for", async () => {
    const { card, hass } = await cardFor("x1c", { config: { camera: "always" } });
    const chip = (): Element | null => find(card, ".live-fps");
    expect(text(chip())).toBe("– fps");
    expect(chip()?.getAttribute("aria-label")).toBe("Measuring the frame rate");
    expect(chip()?.getAttribute("title")).toBe("Measuring the frame rate");
    const camera = hass.states["camera.x1c_camera"]?.attributes ?? {};
    await update(card, hass.withState("camera.x1c_camera", "idle", { ...camera, streamed_frame_rate: 13 }));
    expect(text(chip())).toBe("13 fps");
    expect(chip()?.getAttribute("title")).toBe("13 frames a second");
    // The stream over: the next one is measured anew.
    await update(card, hass.withState("camera.x1c_camera", "idle", camera));
    expect(text(chip())).toBe("– fps");
    const { card: german } = await cardFor("a1mini", { config: { camera: "always" }, language: "de" });
    expect(text(find(german, ".live-fps"))).toBe("– fps");
    expect(find(german, ".live-fps")?.getAttribute("aria-label")).toBe("Bildrate wird gemessen");
  });

  it("sets the frame rate in steps of 5 between 5 and the camera's most", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("x1c", { config: { camera: "always" } });
    button(card, "Set the frame rate").click();
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
    expect(text(find(card, "dialog h2"))).toBe("Camera frame rate");
    expect(find(card, "dialog output.step-value")?.getAttribute("aria-live")).toBe("polite");
    expect(text(find(card, "dialog .step-value [aria-hidden]"))).toBe("30 fps");
    expect(text(find(card, "dialog .step-value .sr-only"))).toBe("30 frames a second");
    expect(button(card, "5 more frames a second").disabled).toBe(true);
    expect(text(find(card, "dialog .hint"))).toContain("This camera gives up to 30 frames a second; you can set 5 to 30 in steps of 5.");
    for (let tap = 0; tap < 6; tap++) {
      button(card, "5 fewer frames a second").click();
      await vi.advanceTimersByTimeAsync(0);
      await card.updateComplete;
    }
    // Five taps reach 5; the sixth finds the button off -- and the focus
    // stays in the stepper, on its other end.
    expect(text(find(card, "dialog .step-value [aria-hidden]"))).toBe("5 fps");
    expect(button(card, "5 fewer frames a second").disabled).toBe(true);
    expect(hass.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls).toEqual([{ domain: "number", service: "set_value", data: { entity_id: "number.x1c_camera_frame_rate", value: 5 }, notifyOnError: false }]);
    vi.useRealTimers();
  });

  it("goes back up a step, and reads a number without its limits as 5 to its value", async () => {
    vi.useFakeTimers();
    const { card, hass } = await cardFor("x1c", { config: { camera: "always" } });
    const tap = async (name: string): Promise<void> => {
      button(card, name).click();
      await vi.advanceTimersByTimeAsync(0);
      await card.updateComplete;
    };
    await tap("Set the frame rate");
    await tap("5 fewer frames a second");
    await tap("5 more frames a second");
    expect(text(find(card, "dialog .step-value [aria-hidden]"))).toBe("30 fps");
    await vi.advanceTimersByTimeAsync(800);
    expect(hass.calls.at(-1)?.data).toEqual({ entity_id: "number.x1c_camera_frame_rate", value: 30 });
    vi.useRealTimers();
    // Limits missing (no state attributes): from 5, the most its value.
    const other = await cardFor("x1c", { config: { camera: "always" } });
    await update(other.card, other.hass.withState("number.x1c_camera_frame_rate", "20", {}));
    await press(other.card, "Set the frame rate");
    expect(text(find(other.card, "dialog .step-value [aria-hidden]"))).toBe("20 fps");
    expect(button(other.card, "5 more frames a second").disabled).toBe(true);
    expect(button(other.card, "5 fewer frames a second").disabled).toBe(false);
  });

  it("asks for no rate where the camera names none", async () => {
    const { card, hass } = await cardFor("x1c");
    await update(card, hass.withState("camera.x1c_camera", "idle", { access_token: "token-x1c" }));
    button(card, "Live view").click();
    await card.updateComplete;
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c");
    expect(text(find(card, ".live-fps"))).toBe("– fps");
  });

  it("keeps the keyboard in the stepper at its ends", async () => {
    const { card } = await cardFor("x1c", { config: { camera: "always" } });
    await press(card, "Set the frame rate");
    const more = button(card, "5 more frames a second");
    const fewer = button(card, "5 fewer frames a second");
    // At 30, + is off: tapping − to 25 and + back to 30 ends on +.
    fewer.focus();
    keyPress(fewer);
    fewer.click();
    await card.updateComplete;
    more.focus();
    keyPress(more);
    more.click();
    await card.updateComplete;
    await card.updateComplete;
    expect(more.disabled).toBe(true);
    expect(card.shadowRoot?.activeElement).toBe(fewer);
  });

  it("says what arrives in the chip; the dialog only sets the rate and says when it applies", async () => {
    const { card, hass } = await cardFor("x1c", { config: { camera: "always" } });
    const camera = hass.states["camera.x1c_camera"]?.attributes ?? {};
    // Someone else watches on BamBuddy's own page, at 8.
    await update(card, hass.withState("camera.x1c_camera", "idle", { ...camera, streamed_frame_rate: 8 }));
    expect(text(find(card, ".live-fps"))).toBe("8 fps");
    expect(find(card, ".live-fps")?.getAttribute("aria-label")).toBe("8 frames a second");
    await press(card, "Set the frame rate");
    expect(text(find(card, "dialog .hint"))).toBe(
      "This camera gives up to 30 frames a second; you can set 5 to 30 in steps of 5. It applies to this printer throughout Home Assistant – on every dashboard, phone and computer. While someone else watches – on BamBuddy's own page, say – BamBuddy may stay at their rate: yours applies from the next time the live view opens while nobody else watches. The chip in the live view shows what arrives.",
    );
    expect(find(card, "dialog .dlg-note")).toBeNull();
    // Minus, the rate and plus in the middle of the dialog; the text stays left.
    expect(find(card, "dialog .stepper")?.classList.contains("centered")).toBe(true);
    expect(hasButton(card, "Restart the live view")).toBe(false);
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=30");
    const { card: german } = await cardFor("x1c", { config: { camera: "always" }, language: "de" });
    await press(german, "Bildrate einstellen");
    expect(text(find(german, "dialog .hint"))).toBe(
      "Diese Kamera schafft bis zu 30 Bilder pro Sekunde; einstellbar sind 5 bis 30 in Schritten von 5. Die Bildrate gilt für diesen Drucker in ganz Home Assistant – in jedem Dashboard und auf jedem Handy oder Computer. Schaut gerade jemand anderes zu, etwa in BamBuddy selbst, kann BamBuddy bei dessen Bildrate bleiben – deine gilt dann ab dem nächsten Öffnen des Livebilds, wenn sonst niemand zuschaut. Der Chip im Livebild zeigt, was ankommt.",
    );
  });

  it("says a slow chamber image in tenths, in the user's language", async () => {
    // The A1's chamber image sends a frame every two seconds or so.
    const { card: german, hass: de } = await cardFor("a1mini", { config: { camera: "always" }, language: "de" });
    const camera = de.states["camera.a1_mini_camera"]?.attributes ?? {};
    await update(german, de.withState("camera.a1_mini_camera", "idle", { ...camera, streamed_frame_rate: 0.5 }));
    expect(text(find(german, ".live-fps"))).toBe("0,5 fps");
    expect(find(german, ".live-fps")?.getAttribute("aria-label")).toBe("0,5 Bilder pro Sekunde");
    const { card, hass } = await cardFor("a1mini", { config: { camera: "always" } });
    await update(card, hass.withState("camera.a1_mini_camera", "idle", { ...camera, streamed_frame_rate: 0.5 }));
    expect(text(find(card, ".live-fps"))).toBe("0.5 fps");
  });

  it("starts the stream anew at a new frame rate", async () => {
    const { card, hass } = await cardFor("x1c", { config: { camera: "always" } });
    const stream = find<HTMLImageElement>(card, "img.stream");
    expect(stream?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=30");
    const camera = hass.states["camera.x1c_camera"]?.attributes ?? {};
    await update(card, hass.withState("camera.x1c_camera", "idle", { ...camera, frame_rate: 15 }));
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=15");
    // Measured anew, not the rate asked for.
    expect(text(find(card, ".live-fps"))).toBe("– fps");
    // Anything else leaves the running stream alone.
    const now = hass.withState("camera.x1c_camera", "idle", { ...camera, frame_rate: 15, access_token: "rotated" });
    await update(card, now);
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.x1c_camera?token=token-x1c&fps=15");
  });

  it("can be started from the control view too", async () => {
    const { card } = await cardFor("a1mini");
    await showView(card, "Control");
    button(card, "Live view").click();
    await card.updateComplete;
    expect(find(card, "img.stream")?.getAttribute("src")).toBe("/api/camera_proxy_stream/camera.a1_mini_camera?token=token-a1_mini&fps=5");
    expect(hasButton(card, "Live view")).toBe(false);
  });

  it("keeps the keyboard's place: on its close button once open, on the button that opens it once closed", async () => {
    const { card } = await cardFor("x1c");
    button(card, "Live view").focus();
    button(card, "Live view").click();
    await settle(card);
    expect(root(card).activeElement).toBe(button(card, "Close the live view"));
    button(card, "Close the live view").click();
    await settle(card);
    expect(root(card).activeElement).toBe(button(card, "Live view"));
    expect(root(card).activeElement?.classList.contains("live-hint")).toBe(true);
    await showView(card, "Control");
    button(card, "Live view").click();
    await settle(card);
    button(card, "Close the live view").click();
    await settle(card);
    expect(root(card).activeElement).toBe(button(card, "Live view"));
    expect(root(card).activeElement?.closest(".step-row")).not.toBeNull();
    // Closed from a view without a camera button: the selected tab.
    button(card, "Live view").click();
    await settle(card);
    await showView(card, "Filament");
    button(card, "Close the live view").click();
    await settle(card);
    expect(find(card, ".live")).toBeNull();
    expect(root(card).activeElement).toBe(find(card, '[role=tab][aria-selected="true"]'));
  });
});

describe("the job's picture large", () => {
  const COVER = "/api/image_proxy/image.x1c_cover?token=cover-x1c";
  const big = (card: FakeCard): HTMLImageElement | null => find<HTMLImageElement>(card, ".big-cover img");
  const openCover = async (card: FakeCard): Promise<void> => {
    (find(card, "button.picture-open") as HTMLButtonElement).click();
    await settle(card);
  };
  const closeCover = async (card: FakeCard): Promise<void> => {
    button(card, "Close the job's picture").click();
    await settle(card);
  };

  it("shows the cover large on a tap, beside the small one, and closes it again", async () => {
    const { card } = await cardFor("x1c");
    await openCover(card);
    expect(big(card)?.getAttribute("src")).toBe(COVER);
    expect(find(card, "button.picture-open")).not.toBeNull();
    expect(find(card, "img.stream")).toBeNull();
    // Full screen is the live view's only.
    expect(find(card, ".big-cover .live-full")).toBeNull();
    await closeCover(card);
    expect(find(card, ".big-cover")).toBeNull();
    expect(find(card, ".live")).toBeNull();
  });

  it("goes back to the live view that ran before (On tap)", async () => {
    const { card } = await cardFor("x1c");
    button(card, "Live view").click();
    await settle(card);
    expect(find(card, "img.stream")).not.toBeNull();
    await openCover(card);
    expect(big(card)).not.toBeNull();
    expect(find(card, "img.stream")).toBeNull();
    expect(find(card, "button.live-hint")).not.toBeNull();
    await closeCover(card);
    expect(find(card, "img.stream")).not.toBeNull();
    expect(find(card, ".big-cover")).toBeNull();
  });

  it("closes everything with the live view's ✕, the cover does not come back (On tap)", async () => {
    const { card } = await cardFor("x1c");
    await openCover(card);
    button(card, "Live view").click();
    await settle(card);
    expect(find(card, "img.stream")).not.toBeNull();
    expect(find(card, ".big-cover")).toBeNull();
    button(card, "Close the live view").click();
    await settle(card);
    expect(find(card, ".live")).toBeNull();
    expect(find(card, ".big-cover")).toBeNull();
  });

  it("streams again after the cover in Always, by ✕, by the camera button or by a second tap", async () => {
    for (const back of ["close", "camera", "again"] as const) {
      const { card } = await cardFor("x1c", { config: { camera: "always" } });
      expect(find(card, "img.stream")).not.toBeNull();
      expect(find(card, "button.live-hint")).toBeNull();
      await openCover(card);
      expect(find(card, "img.stream")).toBeNull();
      expect(find(card, "button.live-hint")).not.toBeNull();
      if (back === "close") await closeCover(card);
      else if (back === "camera") {
        button(card, "Live view").click();
        await settle(card);
      } else await openCover(card);
      expect(find(card, "img.stream")).not.toBeNull();
      expect(find(card, ".big-cover")).toBeNull();
      expect(find(card, "button.live-hint")).toBeNull();
      card.remove();
    }
  });

  it("enlarges the cover without a camera in Never", async () => {
    const { card } = await cardFor("x1c", { config: { camera: "off" } });
    expect(find(card, "button.picture-open")).not.toBeNull();
    expect(find(card, "button.live-hint")).toBeNull();
    await openCover(card);
    expect(big(card)).not.toBeNull();
    expect(find(card, "button.live-hint")).toBeNull();
    await openCover(card);
    expect(find(card, ".big-cover")).toBeNull();
  });

  it("starts the live view only by the camera's button, also on the printer drawing", async () => {
    const { card } = await cardFor("x1c", { devices: x1c({ cover: false }) });
    expect(find(card, "button.picture-open")).toBeNull();
    // A tap on the drawing does nothing.
    (find(card, ".picture") as HTMLElement).click();
    await settle(card);
    expect(find(card, "img.stream")).toBeNull();
    expect(find(card, "button.picture")).toBeNull();
    (find(card, ".picture button.live-hint") as HTMLButtonElement).click();
    await settle(card);
    expect(find(card, "img.stream")).not.toBeNull();
    for (const camera of ["always", "off"]) {
      const { card: other } = await cardFor("x1c", { config: { camera }, devices: x1c({ cover: false }) });
      expect(find(other, "button.live-hint")).toBeNull();
      expect(find(other, "button.picture-open")).toBeNull();
      expect(find(other, "div.picture")).not.toBeNull();
    }
  });

  it("closes the large cover when the job goes", async () => {
    // Another print, On tap after the live view: the mode's default -- nothing.
    const { card, hass } = await cardFor("x1c");
    button(card, "Live view").click();
    await settle(card);
    await openCover(card);
    await update(card, hass.withState("sensor.x1c_current_print", "Another_plate.gcode.3mf"));
    expect(find(card, ".big-cover")).toBeNull();
    expect(find(card, ".live")).toBeNull();
    // Always, the picture breaks: the stream comes back.
    const { card: always } = await cardFor("x1c", { config: { camera: "always" } });
    await openCover(always);
    big(always)?.dispatchEvent(new Event("error"));
    await settle(always);
    expect(find(always, ".big-cover")).toBeNull();
    expect(find(always, "img.stream")).not.toBeNull();
    // Offline.
    const { card: off, hass: offHass } = await cardFor("x1c", { config: { camera: "off" } });
    await openCover(off);
    await update(off, offHass.withState("binary_sensor.x1c_online", "off"));
    expect(find(off, ".big-cover")).toBeNull();
  });

  it("keeps the camera's failure behind the large cover", async () => {
    const { card } = await cardFor("x1c", { config: { camera: "always" } });
    find(card, "img.stream")?.dispatchEvent(new Event("error"));
    await settle(card);
    expect(find(card, ".live.failed")).not.toBeNull();
    await openCover(card);
    expect(big(card)).not.toBeNull();
    expect(find(card, ".live.failed")).toBeNull();
    await closeCover(card);
    expect(find(card, ".live.failed")).not.toBeNull();
  });

  it("moves the keyboard to the large cover's ✕ and back to the small cover", async () => {
    const { card } = await cardFor("x1c");
    (find(card, "button.picture-open") as HTMLButtonElement).focus();
    await openCover(card);
    expect(root(card).activeElement).toBe(button(card, "Close the job's picture"));
    await closeCover(card);
    expect(root(card).activeElement).toBe(find(card, "button.picture-open"));
  });

  it("says in the small cover's tooltip what a click does", async () => {
    const { card } = await cardFor("x1c", { language: "de" });
    const small = (): Element | null => find(card, "button.picture-open");
    expect(small()?.getAttribute("title")).toBe("Vorschaubild groß anzeigen");
    await openCover(card);
    expect(small()?.getAttribute("title")).toBe("Vorschaubild schließen");
    // A screen reader keeps its name and hears the state.
    expect(small()?.getAttribute("aria-label")).toBe("Vorschaubild groß anzeigen");
    expect(small()?.getAttribute("aria-pressed")).toBe("true");
    await openCover(card);
    expect(small()?.getAttribute("title")).toBe("Vorschaubild groß anzeigen");
  });

  it("names the cover's buttons", async () => {
    const { card } = await cardFor("x1c", { language: "de" });
    expect(find(card, "button.picture-open")?.getAttribute("aria-label")).toBe("Vorschaubild groß anzeigen");
    expect(find(card, "button.live-hint")?.getAttribute("aria-label")).toBe("Livebild");
    await openCover(card);
    expect(find(card, ".cover-close")?.getAttribute("aria-label")).toBe("Vorschaubild schließen");
    expect(big(card)?.getAttribute("alt")).toBe("");
    const { card: en } = await cardFor("x1c");
    expect(find(en, "button.picture-open")?.getAttribute("aria-label")).toBe("Show the job's picture large");
  });

  it("is a plain picture in a preview", async () => {
    const hass = makeHass({ devices: x1c() });
    const preview = document.createElement("bambuddy-printer-card") as FakeCard;
    preview.preview = true;
    preview.setConfig({ type: "custom:bambuddy-printer-card", printer: "dev-x1c" });
    preview.hass = hass;
    document.body.append(preview);
    await preview.updateComplete;
    expect(find(preview, "button.picture-open")).toBeNull();
    expect(find(preview, "button.live-hint")).toBeNull();
    expect(find(preview, ".picture img.cover")).not.toBeNull();
  });

  it("starts the live view from the Control tab while the cover is large", async () => {
    const { card } = await cardFor("x1c");
    await openCover(card);
    await showView(card, "Control");
    (find(card, ".btn.live-btn") as HTMLButtonElement).click();
    await settle(card);
    expect(find(card, "img.stream")).not.toBeNull();
    expect(find(card, ".big-cover")).toBeNull();
  });

  it("forgets the large cover with a new configuration", async () => {
    const { card } = await cardFor("x1c", { config: { camera: "off" } });
    await openCover(card);
    card.setConfig({ type: "custom:bambuddy-printer-card", printer: "dev-x1c", camera: "off" });
    await settle(card);
    expect(find(card, ".big-cover")).toBeNull();
  });
});

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
    const right = /\.live-tags\s*\{[^}]*right:\s*(\d+)px/.exec(narrow);
    // The icon: 6 px from the edge, 36 px wide.
    expect(Number(right?.[1])).toBeGreaterThanOrEqual(46);
    expect(styleText()).toMatch(/\.live-full\s*\{[^}]*bottom:\s*6px;[^}]*right:\s*6px;/);
  });
});

describe("full screen in Home Assistant's Android app", () => {
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await endFullscreens();
    withoutFullscreenApi();
  });

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
    expect(button(card, "Exit full screen")).toBeTruthy();
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
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await endFullscreens();
    withoutFullscreenApi();
  });

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
    const full = /\.live\.full\s*\{([^}]*)\}/.exec(sheet)?.[1] ?? "";
    for (const rule of ["position: fixed", "inset: 0", "width: 100%", "height: 100%", "max-height: none", "margin: 0", "border: 0", "padding: 0", "border-radius: 0", "aspect-ratio: auto"]) {
      expect(full).toContain(rule);
    }
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
  afterEach(async () => {
    vi.useRealTimers();
    await endFullscreens();
    for (const dialog of document.body.querySelectorAll("dialog")) dialog.remove();
    withoutFullscreenApi();
    withoutPopoverApi();
  });

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
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
    await settle(card);
    expect(live().classList.contains("full")).toBe(true);
    // A dialog that is closed is no reason.
    dialog.removeAttribute("open");
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
    await settle(card);
    expect(live().classList.contains("full")).toBe(false);
  });
});

describe("back leaving the live view's full screen", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await endFullscreens();
    withoutFullscreenApi();
    withoutPopoverApi();
  });

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
  const visibility = pageState;
  const inFullscreen = (card: FakeCard): boolean => hasButton(card, "Exit full screen");

  afterEach(async () => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await endFullscreens();
    withoutFullscreenApi();
    withoutPopoverApi();
  });

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
    visibility("hidden");
    await settle(card);
    expect(inFullscreen(card)).toBe(false);
    visibility("visible");
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
    visibility("hidden");
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
    visibility("hidden");
    card.remove();
    // Visible again while the card is away: it hears nothing of it.
    visibility("visible");
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
    visibility("hidden");
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
