import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/index";

import {
  h2d,
  makeHass,
  mountCard,
  x1c,
  type FakeCard,
} from "./fixtures";
import { button, find, hasButton, press, root, settle, showView, text, update } from "./helpers";
import { cardFor, keyPress, mountPreview, pageState, useCardPage } from "./card-helpers";

useCardPage();

describe("the live view", () => {

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
    pageState("hidden");
    await card.updateComplete;
    expect(find(card, "img.stream")).toBeNull();
    pageState("visible");
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
  });

  it("never runs with camera: off, in a preview, or without a camera that can stream", async () => {
    const { card } = await cardFor("x1c", { config: { camera: "off" } });
    expect(find(card, "button.live-hint")).toBeNull();
    expect(find(card, "img.stream")).toBeNull();
    const preview = await mountPreview("x1c", { camera: "always" });
    expect(find(preview, "img.stream")).toBeNull();
    expect(find(preview, "button.live-hint")).toBeNull();
    const { card: noToken, hass: plain } = await cardFor("x1c", { config: { camera: "always" } });
    await update(noToken, plain.withState("camera.x1c_camera", "idle", { access_token: "" }));
    expect(find(noToken, "img.stream")).toBeNull();
    const { card: noCamera } = await cardFor("x1c", { config: { camera: "always" }, printer: { camera: false } });
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
    const { card } = await cardFor("x1c", { printer: { cover: false } });
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
      const { card: other } = await cardFor("x1c", { config: { camera }, printer: { cover: false } });
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

  it("closes the large cover on Escape, the keyboard back on the small cover", async () => {
    const { card } = await cardFor("x1c");
    (find(card, "button.picture-open") as HTMLButtonElement).focus();
    await openCover(card);
    const close = button(card, "Close the job's picture");
    close.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
    await settle(card);
    expect(big(card)).toBeNull();
    expect(root(card).activeElement).toBe(find(card, "button.picture-open"));
    // Escape on the small cover while the large one shows does the same.
    await openCover(card);
    (find(card, "button.picture-open") as HTMLButtonElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }));
    await settle(card);
    expect(big(card)).toBeNull();
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
    const preview = await mountPreview("x1c");
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

