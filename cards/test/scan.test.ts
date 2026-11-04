import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("jsqr", () => ({ default: vi.fn(() => null) }));

import jsQR from "jsqr";
import { currentDecoder, decodePhoto, defaultDecoder, parseSpoolQr, scanFrames, scanInApp, scanWay, setDecoderForTests, setTorch, startCamera, stopStream, torchOf } from "../src/scan";
import type { Hass } from "../src/types";
import { defineFor, restoreDefined } from "./helpers";

const jsqr = vi.mocked(jsQR);

/** A canvas 2D context good enough for jsQR's input. */
function fakeContext(): void {
  defineFor(HTMLCanvasElement.prototype, "getContext", function (this: HTMLCanvasElement) {
    return {
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    };
  });
}

afterEach(() => {
  restoreDefined();
  vi.unstubAllGlobals();
  jsqr.mockReset();
  jsqr.mockReturnValue(null);
});

const hassWith = (auth: unknown): Hass => ({ auth }) as unknown as Hass;

describe("parseSpoolQr", () => {
  it("reads BamBuddy's label forms", () => {
    expect(parseSpoolQr("http://192.168.178.23:8000/inventory?spool=42")).toBe(42);
    expect(parseSpoolQr("https://bb.example/inventory?spool=7&x=1")).toBe(7);
    expect(parseSpoolQr("bambuddy.local:8000/inventory?spool=9")).toBe(9);
    expect(parseSpoolQr("192.168.178.23:8000/inventory?spool=42")).toBe(42);
    expect(parseSpoolQr("  12  ")).toBe(12);
    expect(parseSpoolQr("/#/inventory?spool=5")).toBe(5);
  });

  it("refuses what is no BamBuddy spool label", () => {
    for (const text of ["web+spoolman:s-3", "http://sm/spool/show/3", "spool=0", "spool=-2", "0", "abc", "", "http://x/inventory?spool=4a", "x?spool=4a"]) {
      expect(parseSpoolQr(text), text).toBeUndefined();
    }
  });
});

describe("scanWay", () => {
  it("chooses the app's scanner, else the camera, else none", () => {
    expect(scanWay(hassWith({ external: { config: { hasBarCodeScanner: 1 }, fireMessage: vi.fn() } }))).toBe("app");
    defineFor(window, "isSecureContext", true);
    expect(scanWay(hassWith({ external: { config: {}, fireMessage: vi.fn() } }))).toBe("live");
    expect(scanWay(hassWith(undefined))).toBe("live");
    defineFor(window, "isSecureContext", false);
    expect(scanWay(hassWith({}))).toBe("insecure");
  });
});

describe("defaultDecoder", () => {
  const video = document.createElement("video");

  it("decodes with the browser's detector where it reads QR codes", async () => {
    const detect = vi.fn(async () => [{ rawValue: "x" }]);
    vi.stubGlobal("BarcodeDetector", Object.assign(vi.fn(function () { return { detect }; }), { getSupportedFormats: async () => ["qr_code", "ean_13"] }));
    expect(await defaultDecoder().decode(video, 10, 10, false)).toBe("x");
    expect(jsqr).not.toHaveBeenCalled();
  });

  it("takes jsQR where the detector reads no QR codes, or cannot be made", async () => {
    fakeContext();
    jsqr.mockReturnValue({ data: "y" } as never);
    vi.stubGlobal("BarcodeDetector", Object.assign(vi.fn(), { getSupportedFormats: async () => ["ean_13"] }));
    expect(await defaultDecoder().decode(video, 10, 10, false)).toBe("y");
    vi.stubGlobal("BarcodeDetector", Object.assign(vi.fn(function () { throw new TypeError("no"); }), { getSupportedFormats: async () => ["qr_code"] }));
    expect(await defaultDecoder().decode(video, 10, 10, false)).toBe("y");
    vi.stubGlobal("BarcodeDetector", undefined);
    expect(await defaultDecoder().decode(video, 4, 3, true)).toBe("y");
    expect(jsqr).toHaveBeenLastCalledWith(expect.any(Uint8ClampedArray), 4, 3, { inversionAttempts: "attemptBoth" });
    expect(jsqr.mock.calls[0]?.[3]).toEqual({ inversionAttempts: "dontInvert" });
  });

  it("leaves the detector for good once it fails", async () => {
    fakeContext();
    jsqr.mockReturnValue({ data: "z" } as never);
    const detect = vi.fn(async () => { throw new DOMException("no", "NotSupportedError"); });
    vi.stubGlobal("BarcodeDetector", Object.assign(vi.fn(function () { return { detect }; }), { getSupportedFormats: async () => ["qr_code"] }));
    const decoder = defaultDecoder();
    expect(await decoder.decode(video, 10, 10, false)).toBe("z");
    expect(await decoder.decode(video, 10, 10, false)).toBe("z");
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it("tries jsQR after an empty detector result only on a photo", async () => {
    fakeContext();
    jsqr.mockReturnValue({ data: "w" } as never);
    const detect = vi.fn(async () => []);
    vi.stubGlobal("BarcodeDetector", Object.assign(vi.fn(function () { return { detect }; }), { getSupportedFormats: async () => ["qr_code"] }));
    const decoder = defaultDecoder();
    expect(await decoder.decode(video, 10, 10, false)).toBeUndefined();
    expect(await decoder.decode(video, 10, 10, true)).toBe("w");
  });

  it("reads nothing where the canvas has no 2D context", async () => {
    defineFor(HTMLCanvasElement.prototype, "getContext", () => null);
    vi.stubGlobal("BarcodeDetector", undefined);
    expect(await defaultDecoder().decode(video, 10, 10, false)).toBeUndefined();
    expect(jsqr).not.toHaveBeenCalled();
  });
});

describe("scanInApp", () => {
  const TEXTS = { title: "T", description: "D", manual: "M", notLabel: "N" };

  function app() {
    const prev = vi.fn((_message: unknown) => true);
    window.externalBus = prev;
    const fireMessage = vi.fn();
    const hass = hassWith({ external: { config: { hasBarCodeScanner: 1 }, fireMessage } });
    const done = vi.fn();
    return { prev, fireMessage, hass, done };
  }
  const command = (name: string, payload: unknown) => ({ type: "command", id: 7, command: name, payload });

  afterEach(() => {
    delete window.externalBus;
  });

  it("asks the app for a scan with our texts", () => {
    const { fireMessage, hass, done } = app();
    scanInApp(hass, TEXTS, done);
    expect(fireMessage).toHaveBeenCalledTimes(1);
    const sent = fireMessage.mock.calls[0]?.[0] as { id: number };
    expect(sent).toEqual({ id: sent.id, type: "bar_code/scan", payload: { title: "T", description: "D", alternative_option_label: "M" } });
    expect(sent.id).toBeGreaterThanOrEqual(1e9);
  });

  it("a spool label ends the scan", () => {
    const { prev, fireMessage, hass, done } = app();
    scanInApp(hass, TEXTS, done);
    const message = command("bar_code/scan_result", { rawValue: "http://h/inventory?spool=42", format: "qr_code" });
    expect(window.externalBus?.(message)).toBe(true);
    expect(done).toHaveBeenCalledWith({ kind: "spool", id: 42 });
    expect(fireMessage).toHaveBeenLastCalledWith({ type: "bar_code/close" });
    expect(prev).toHaveBeenCalledWith(message);
    expect(window.externalBus).toBe(prev);
  });

  it("a wrong code keeps scanning", () => {
    const { fireMessage, hass, done } = app();
    scanInApp(hass, TEXTS, done);
    const wrapper = window.externalBus;
    window.externalBus?.(command("bar_code/scan_result", { rawValue: "http://h/inventory?spool=42", format: "code_128" }));
    window.externalBus?.(command("bar_code/scan_result", { rawValue: "hello", format: "qr_code" }));
    expect(fireMessage.mock.calls.slice(1)).toEqual([
      [{ type: "bar_code/notify", payload: { message: "N" } }],
      [{ type: "bar_code/notify", payload: { message: "N" } }],
    ]);
    expect(done).not.toHaveBeenCalled();
    expect(window.externalBus).toBe(wrapper);
  });

  it("cancelled and manual", () => {
    const first = app();
    scanInApp(first.hass, TEXTS, first.done);
    window.externalBus?.(command("bar_code/aborted", { reason: "canceled" }));
    expect(first.done).toHaveBeenCalledWith({ kind: "cancelled" });
    expect(window.externalBus).toBe(first.prev);
    const second = app();
    scanInApp(second.hass, TEXTS, second.done);
    window.externalBus?.(command("bar_code/aborted", { reason: "alternative_options" }));
    expect(second.done).toHaveBeenCalledWith({ kind: "manual" });
    expect(window.externalBus).toBe(second.prev);
  });

  it("stop sends close and restores", () => {
    const { prev, fireMessage, hass, done } = app();
    const stop = scanInApp(hass, TEXTS, done);
    stop();
    expect(fireMessage).toHaveBeenLastCalledWith({ type: "bar_code/close" });
    expect(window.externalBus).toBe(prev);
    stop();
    expect(fireMessage).toHaveBeenCalledTimes(2);
    expect(done).not.toHaveBeenCalled();
  });

  it("leaves a bus the frontend replaced meanwhile", () => {
    const { hass, done } = app();
    const stop = scanInApp(hass, TEXTS, done);
    const other = vi.fn();
    window.externalBus = other;
    stop();
    expect(window.externalBus).toBe(other);
  });

  it("hands on a command that is not ours and does not act on it", () => {
    const { prev, hass, done } = app();
    scanInApp(hass, TEXTS, done);
    const message = command("kiosk_mode/set", { enable: true });
    window.externalBus?.(message);
    expect(prev).toHaveBeenCalledWith(message);
    expect(done).not.toHaveBeenCalled();
  });

  it("a second scan stops the first, so the bus is wrapped once", () => {
    const { prev, fireMessage, hass } = app();
    const first = vi.fn();
    const second = vi.fn();
    scanInApp(hass, TEXTS, first);
    scanInApp(hass, TEXTS, second);
    window.externalBus?.(command("bar_code/scan_result", { rawValue: "5", format: "qr_code" }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ kind: "spool", id: 5 });
    expect(prev).toHaveBeenCalledTimes(1);
    expect(window.externalBus).toBe(prev);
    expect(fireMessage.mock.calls.filter(([m]) => (m as { type: string }).type === "bar_code/scan")).toHaveLength(2);
  });

  it("does nothing outside the app", () => {
    const done = vi.fn();
    const stop = scanInApp(hassWith(undefined), TEXTS, done);
    expect(window.externalBus).toBeUndefined();
    stop();
    expect(done).not.toHaveBeenCalled();
  });
});

describe("the camera and the photo", () => {
  const track = (torch?: boolean) => ({
    stop: vi.fn(),
    kind: "video",
    getCapabilities: torch === undefined ? undefined : () => ({ torch }),
    applyConstraints: vi.fn(async () => undefined),
  });
  const streamOf = (...tracks: ReturnType<typeof track>[]) =>
    ({ getTracks: () => tracks, getVideoTracks: () => tracks }) as unknown as MediaStream;

  afterEach(() => {
    setDecoderForTests(undefined);
    vi.useRealTimers();
  });

  it("asks for the back camera without sound", async () => {
    const stream = streamOf(track());
    const getUserMedia = vi.fn(async () => stream);
    defineFor(navigator, "mediaDevices", { getUserMedia });
    expect(await startCamera()).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: "environment" } }, audio: false });
  });

  it("maps camera errors", async () => {
    const failing = (error: unknown) => defineFor(navigator, "mediaDevices", { getUserMedia: async () => { throw error; } });
    failing({ name: "NotAllowedError" });
    expect(await startCamera()).toBe("denied");
    failing({ name: "NotFoundError" });
    expect(await startCamera()).toBe("none");
    failing({ name: "OverconstrainedError" });
    expect(await startCamera()).toBe("failed");
    failing(new TypeError("x"));
    expect(await startCamera()).toBe("failed");
    defineFor(navigator, "mediaDevices", undefined);
    expect(await startCamera()).toBe("none");
  });

  it("stops every track", () => {
    const one = track();
    const two = track();
    stopStream(streamOf(one, two));
    stopStream(undefined);
    expect(one.stop).toHaveBeenCalledTimes(1);
    expect(two.stop).toHaveBeenCalledTimes(1);
  });

  it("offers the torch only where the camera has one", async () => {
    expect(torchOf(streamOf(track()))).toBeUndefined();
    expect(torchOf(streamOf(track(false)))).toBeUndefined();
    const lit = track(true);
    expect(torchOf(streamOf(track(false), lit))).toBe(lit);
    expect(await setTorch(lit as unknown as MediaStreamTrack, true)).toBe(true);
    expect(lit.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    lit.applyConstraints.mockRejectedValueOnce(new Error("no"));
    expect(await setTorch(lit as unknown as MediaStreamTrack, false)).toBe(false);
  });

  it("finds a spool in the frames and stops looking", async () => {
    vi.useFakeTimers();
    const answers = ["x", undefined, "http://h/inventory?spool=3", "4"];
    const decode = vi.fn(async () => answers.shift());
    setDecoderForTests({ decode });
    const video = { videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;
    const found = vi.fn();
    scanFrames(video, found);
    await vi.advanceTimersByTimeAsync(2000);
    expect(found).toHaveBeenCalledTimes(1);
    expect(found).toHaveBeenCalledWith(3);
    expect(decode).toHaveBeenCalledTimes(3);
    expect(decode).toHaveBeenCalledWith(video, 960, 540, false);
  });

  it("waits for a picture and stops when told", async () => {
    vi.useFakeTimers();
    const decode = vi.fn(async () => undefined);
    setDecoderForTests({ decode });
    const video = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;
    const stop = scanFrames(video, vi.fn());
    await vi.advanceTimersByTimeAsync(600);
    expect(decode).not.toHaveBeenCalled();
    Object.assign(video, { videoWidth: 640, videoHeight: 480 });
    await vi.advanceTimersByTimeAsync(250);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledWith(video, 640, 480, false);
    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never runs two decodes at once and drops one finished after the stop", async () => {
    vi.useFakeTimers();
    let release: (text: string) => void = () => undefined;
    const decode = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    setDecoderForTests({ decode });
    const found = vi.fn();
    const stop = scanFrames({ videoWidth: 100, videoHeight: 100 } as HTMLVideoElement, found);
    await vi.advanceTimersByTimeAsync(2000);
    expect(decode).toHaveBeenCalledTimes(1);
    stop();
    release("9");
    await vi.advanceTimersByTimeAsync(500);
    expect(found).not.toHaveBeenCalled();
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("decodes a photo, scaled and turned upright", async () => {
    const close = vi.fn();
    const createImageBitmap = vi.fn(async () => ({ width: 4000, height: 3000, close }));
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const decode = vi.fn(async () => "http://h/inventory?spool=12");
    setDecoderForTests({ decode });
    const file = new Blob(["x"]);
    expect(await decodePhoto(file)).toBe(12);
    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(decode).toHaveBeenCalledWith(expect.objectContaining({ width: 4000 }), 1600, 1200, true);
    expect(close).toHaveBeenCalled();
  });

  it("says what a photo lacked", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 800, height: 600 })));
    const decode = vi.fn(async (): Promise<string | undefined> => undefined);
    setDecoderForTests({ decode });
    expect(await decodePhoto(new Blob(["x"]))).toBe("no_code");
    expect(decode).toHaveBeenCalledWith(expect.anything(), 800, 600, true);
    decode.mockResolvedValueOnce("hello");
    expect(await decodePhoto(new Blob(["x"]))).toBe("not_label");
    decode.mockRejectedValueOnce(new Error("broken"));
    expect(await decodePhoto(new Blob(["x"]))).toBe("no_code");
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new DOMException("bad", "InvalidStateError"); }));
    expect(await decodePhoto(new Blob(["x"]))).toBe("no_code");
  });

  it("the default decoder is made once and can be replaced", () => {
    setDecoderForTests(undefined);
    const first = currentDecoder();
    expect(currentDecoder()).toBe(first);
    const other = { detect: async () => [] } as unknown as Parameters<typeof setDecoderForTests>[0];
    setDecoderForTests(other);
    expect(currentDecoder()).toBe(other);
    setDecoderForTests(undefined);
  });
});

describe("odd messages and empty pictures", () => {
  afterEach(() => {
    delete window.externalBus;
  });

  it("acts only on commands, and reads a missing payload as nothing", () => {
    const prev = vi.fn((_message: unknown) => "answered");
    window.externalBus = prev;
    const fireMessage = vi.fn();
    const done = vi.fn();
    scanInApp(hassWith({ external: { config: { hasBarCodeScanner: 1 }, fireMessage } }), { title: "", description: "", manual: "", notLabel: "N" }, done);
    expect(window.externalBus?.({ type: "result", id: 1, command: "bar_code/aborted" })).toBe("answered");
    window.externalBus?.("not an object");
    window.externalBus?.(null);
    expect(done).not.toHaveBeenCalled();
    window.externalBus?.({ type: "command", command: "bar_code/scan_result" });
    expect(fireMessage).toHaveBeenLastCalledWith({ type: "bar_code/notify", payload: { message: "N" } });
    window.externalBus?.({ type: "command", command: "bar_code/aborted" });
    expect(done).toHaveBeenCalledWith({ kind: "cancelled" });
    expect(prev).toHaveBeenCalledTimes(5);
  });

  it("works without a bus before it", () => {
    const done = vi.fn();
    scanInApp(hassWith({ external: { config: { hasBarCodeScanner: 1 }, fireMessage: vi.fn() } }), { title: "", description: "", manual: "", notLabel: "" }, done);
    window.externalBus?.({ type: "command", command: "bar_code/scan_result", payload: { rawValue: "8", format: "qr_code" } });
    expect(done).toHaveBeenCalledWith({ kind: "spool", id: 8 });
    expect(window.externalBus).toBeUndefined();
  });

  it("jsQR that finds nothing reads nothing", async () => {
    fakeContext();
    vi.stubGlobal("BarcodeDetector", undefined);
    expect(await defaultDecoder().decode(document.createElement("canvas"), 5, 5, true)).toBeUndefined();
    expect(jsqr).toHaveBeenCalledTimes(1);
  });
});

describe("a photo on older or smaller devices", () => {
  afterEach(() => setDecoderForTests(undefined));

  it("an engine that knows no imageOrientation reads the photo all the same", async () => {
    const createImageBitmap = vi.fn(async (_file: Blob, options?: unknown) => {
      if (options) throw new TypeError("The provided value 'from-image' is not a valid enum value");
      return { width: 100, height: 100 };
    });
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    setDecoderForTests({ decode: async () => "5" });
    expect(await decodePhoto(new Blob(["x"]))).toBe(5);
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
  });

  it("both readers get the photo scaled down", async () => {
    fakeContext();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
    // The canvas is given back afterwards: its size is read while it is read.
    let seen: unknown[] = [];
    const decode = vi.fn(async (source: CanvasImageSource) => {
      seen = [source instanceof HTMLCanvasElement, (source as HTMLCanvasElement).width, (source as HTMLCanvasElement).height];
      return "7";
    });
    setDecoderForTests({ decode });
    expect(await decodePhoto(new Blob(["x"]))).toBe(7);
    expect(seen).toEqual([true, 1600, 1200]);
  });
});

describe("a phone's photo of a screen", () => {
  afterEach(() => setDecoderForTests(undefined));

  it("tries smaller sizes, smoothed, until one reads", async () => {
    const contexts: Array<{ imageSmoothingQuality?: string; imageSmoothingEnabled?: boolean }> = [];
    defineFor(HTMLCanvasElement.prototype, "getContext", function () {
      const context: { drawImage: unknown; getImageData: unknown; imageSmoothingQuality?: string; imageSmoothingEnabled?: boolean } = { drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) };
      contexts.push(context);
      return context;
    });
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3072, height: 4096, close: vi.fn() })));
    const decode = vi.fn(async (_source: CanvasImageSource, width: number, _height: number, _hard: boolean) => (width === 600 ? "134" : undefined));
    setDecoderForTests({ decode });
    expect(await decodePhoto(new Blob(["x"]))).toBe(134);
    expect(decode.mock.calls.map(([, width, height]) => [width, height])).toEqual([
      [1200, 1600],
      [900, 1200],
      [600, 800],
    ]);
    expect(contexts.every((context) => context.imageSmoothingQuality === "high" && context.imageSmoothingEnabled === true)).toBe(true);
  });

  it("stops at the first size that reads", async () => {
    fakeContext();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3072, height: 4096 })));
    const decode = vi.fn(async () => "7");
    setDecoderForTests({ decode });
    expect(await decodePhoto(new Blob(["x"]))).toBe(7);
    expect(decode).toHaveBeenCalledTimes(1);
  });
});

describe("a foreign code in the frames", () => {
  afterEach(() => {
    setDecoderForTests(undefined);
    vi.useRealTimers();
  });

  it("is reported, and the frames go on until a label shows", async () => {
    vi.useFakeTimers();
    const answers = ["https://example.com", "hello", "5"];
    setDecoderForTests({ decode: async () => answers.shift() });
    const found = vi.fn();
    const foreign = vi.fn();
    scanFrames({ videoWidth: 100, videoHeight: 100 } as HTMLVideoElement, found, foreign);
    await vi.advanceTimersByTimeAsync(1000);
    expect(foreign).toHaveBeenCalledTimes(2);
    expect(found).toHaveBeenCalledWith(5);
  });
});

describe("a photo's canvas", () => {
  afterEach(() => setDecoderForTests(undefined));

  it("is one for every size, and given back at the end", async () => {
    fakeContext();
    const made: HTMLCanvasElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((name: string) => {
      const element = create(name);
      if (name === "canvas") made.push(element as HTMLCanvasElement);
      return element;
    }) as typeof document.createElement);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3072, height: 4096 })));
    setDecoderForTests({ decode: async () => undefined });
    expect(await decodePhoto(new Blob(["x"]))).toBe("no_code");
    expect(made).toHaveLength(1);
    expect([made[0]?.width, made[0]?.height]).toEqual([0, 0]);
    vi.restoreAllMocks();
  });
});
