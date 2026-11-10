// Scanning a BamBuddy spool label's QR code: reading the code and finding the
// spool's number in it. The label holds "<BamBuddy's address>/inventory?spool=<id>"
// (BamBuddy's labels.py), the address with or without a scheme.

import jsQR from "jsqr";

/*! jsQR 1.4.0 (https://github.com/cozmo/jsQR), Apache License 2.0: its text in jsqr-LICENSE.txt beside the card's bundle, and at https://www.apache.org/licenses/LICENSE-2.0 */
import type { Hass } from "./types";

/** The spool's number on a BamBuddy label, or none. Spoolman's forms are no BamBuddy label. */
export function parseSpoolQr(text: string): number | undefined {
  const raw = text.trim();
  if (/^\d+$/.test(raw)) return positive(raw);
  if (/^web\+spoolman:/i.test(raw)) return undefined;
  let value: string | null | undefined;
  try {
    value = new URL(raw).searchParams.get("spool");
  } catch {
    value = undefined;
  }
  // An address without a scheme, or the number after a "#", reads no parameter.
  value ??= /(?:[?&]|\b)spool=(\d+)(?=$|[&#])/.exec(raw)?.[1];
  return value != null && /^\d+$/.test(value) ? positive(value) : undefined;
}

function positive(digits: string): number | undefined {
  const id = Number(digits);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/** How a scan goes: the app's own scanner, the browser's camera, or a photo (no HTTPS). */
export type ScanWay = "app" | "live" | "insecure";

export function scanWay(hass: Hass): ScanWay {
  if (hass.auth?.external?.config?.hasBarCodeScanner) return "app";
  return window.isSecureContext ? "live" : "insecure";
}

// --- Decoding ------------------------------------------------------------------

export interface QrDecoder {
  /** The first QR code's text in the picture, or none; `hard` for a photo: tries harder. */
  decode(source: CanvasImageSource, width: number, height: number, hard: boolean): Promise<string | undefined>;
}

interface Detector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

interface DetectorClass {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats?(): Promise<string[]>;
}

/** The browser's own reader, where it reads QR codes (Chrome, Edge, Safari 17+). */
async function browserDetector(): Promise<Detector | undefined> {
  const Detector = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (!Detector) return undefined;
  try {
    const formats = await Detector.getSupportedFormats?.();
    if (formats && !formats.includes("qr_code")) return undefined;
    return new Detector({ formats: ["qr_code"] });
  } catch {
    return undefined;
  }
}

function readWithJsQR(canvas: HTMLCanvasElement, source: CanvasImageSource, width: number, height: number, hard: boolean): string | undefined {
  // Set only when it changes: setting a canvas's size clears and reallocates it.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(source, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  return jsQR(image.data, width, height, { inversionAttempts: hard ? "attemptBoth" : "dontInvert" })?.data ?? undefined;
}

/** The browser's detector where it works, else jsQR -- as BamBuddy's own scanner. */
export function defaultDecoder(): QrDecoder {
  let detector: Promise<Detector | undefined> | undefined;
  // One canvas for every frame: five a second where jsQR reads them.
  let canvas: HTMLCanvasElement | undefined;
  return {
    async decode(source, width, height, hard) {
      detector ??= browserDetector();
      const found = await detector;
      if (found) {
        try {
          const codes = await found.detect(source);
          if (codes[0]?.rawValue) return codes[0].rawValue;
          if (!hard) return undefined;
        } catch {
          // Some builds offer the detector but cannot run it.
          detector = Promise.resolve(undefined);
        }
      }
      canvas ??= document.createElement("canvas");
      return readWithJsQR(canvas, source, width, height, hard);
    },
  };
}

let decoder: QrDecoder | undefined;

/** The decoder the scans use; tests put their own in. */
export function setDecoderForTests(next: QrDecoder | undefined): void {
  decoder = next;
}

export function currentDecoder(): QrDecoder {
  return (decoder ??= defaultDecoder());
}

// --- The companion app's scanner -----------------------------------------------
// The apps scan natively and answer through the frontend's external bus
// (window.externalBus): bar_code/scan_result and bar_code/aborted, as Home
// Assistant's own QR scanner reads them. The frontend answers every command
// itself, so the card hands each message on and only listens.

export type AppScanEnd = { kind: "spool"; id: number } | { kind: "cancelled" } | { kind: "manual" };

export interface AppScanTexts {
  title: string;
  description: string;
  manual: string;
  notLabel: string;
}

interface BusCommand {
  type?: string;
  command?: string;
  payload?: { rawValue?: string; format?: string; reason?: string };
}

let stopRunning: (() => void) | undefined;

/** Starts the app's scanner; the function it returns ends it (and is safe to call twice). */
export function scanInApp(hass: Hass, texts: AppScanTexts, done: (end: AppScanEnd) => void): () => void {
  stopRunning?.();
  const external = hass.auth?.external;
  if (!external) return () => undefined;
  const previous = window.externalBus;
  let open = true;
  const stop = (): void => {
    if (!open) return;
    open = false;
    if (stopRunning === stop) stopRunning = undefined;
    if (window.externalBus === wrapper) window.externalBus = previous;
    external.fireMessage({ type: "bar_code/close" });
  };
  const handle = (message: BusCommand): void => {
    if (message.type !== "command") return;
    if (message.command === "bar_code/scan_result") {
      const id = message.payload?.format === "qr_code" ? parseSpoolQr(message.payload.rawValue ?? "") : undefined;
      if (id === undefined) {
        external.fireMessage({ type: "bar_code/notify", payload: { message: texts.notLabel } });
        return;
      }
      stop();
      done({ kind: "spool", id });
    } else if (message.command === "bar_code/aborted") {
      stop();
      done(message.payload?.reason === "alternative_options" ? { kind: "manual" } : { kind: "cancelled" });
    }
  };
  const wrapper = (message: unknown): unknown => {
    const answer = previous?.(message);
    if (open && message && typeof message === "object") handle(message as BusCommand);
    return answer;
  };
  window.externalBus = wrapper;
  stopRunning = stop;
  external.fireMessage({
    id: 1e9 + Math.floor(Math.random() * 1e9),
    type: "bar_code/scan",
    payload: { title: texts.title, description: texts.description, alternative_option_label: texts.manual },
  });
  return stop;
}

// --- The browser's camera, and a photo ----------------------------------------

/** Why the camera did not start: refused, none there, or anything else. */
export type CameraFailure = "denied" | "none" | "failed";

/** The back camera's stream, or why there is none. */
export async function startCamera(): Promise<MediaStream | CameraFailure> {
  const media = navigator.mediaDevices as MediaDevices | undefined;
  if (!media?.getUserMedia) return "none";
  try {
    return await media.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name;
    return name === "NotAllowedError" ? "denied" : name === "NotFoundError" ? "none" : "failed";
  }
}

export function stopStream(stream: MediaStream | undefined): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

/** The video track with a light, where the camera has one. */
export function torchOf(stream: MediaStream): MediaStreamTrack | undefined {
  return stream.getVideoTracks().find((track) => (track.getCapabilities?.() as { torch?: boolean } | undefined)?.torch === true);
}

/** Switches the camera's light; false where the camera refused. */
export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  try {
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    return true;
  } catch {
    return false;
  }
}

/** About five frames a second; a frame is read at most this many pixels long. */
const FRAME_GAP_MS = 200;
const FRAME_MAX = 960;
/** The sizes a photo is read at, the long side in pixels, largest first. */
const PHOTO_SIZES = [1600, 1200, 800, 600];

function fitted(width: number, height: number, most: number): [number, number] {
  const scale = Math.min(1, most / Math.max(width, height));
  return [Math.round(width * scale), Math.round(height * scale)];
}

/** Reads the camera's picture until a spool label shows; a code that is no
 * label is reported and the reading goes on. The function it returns stops it. */
export function scanFrames(video: HTMLVideoElement, found: (id: number) => void, foreign?: () => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const look = async (): Promise<void> => {
    timer = undefined;
    if (video.videoWidth && video.videoHeight) {
      const [width, height] = fitted(video.videoWidth, video.videoHeight, FRAME_MAX);
      const text = await currentDecoder().decode(video, width, height, false).catch(() => undefined);
      if (stopped) return;
      const id = text === undefined ? undefined : parseSpoolQr(text);
      if (id !== undefined) {
        stopped = true;
        found(id);
        return;
      }
      if (text !== undefined) foreign?.();
    }
    timer = setTimeout(() => void look(), FRAME_GAP_MS);
  };
  timer = setTimeout(() => void look(), FRAME_GAP_MS);
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
}

/** The spool on a photo of its label, or what the photo lacked. */
export async function decodePhoto(file: Blob): Promise<number | "no_code" | "not_label"> {
  let picture: ImageBitmap;
  try {
    picture = await createImageBitmap(file, { imageOrientation: "from-image" }).catch((error: unknown) => {
      // An engine that knows no "from-image" (Chrome < 111, older Safari)
      // refuses the option itself; it turns the picture by its EXIF anyway.
      if (error instanceof TypeError) return createImageBitmap(file);
      throw error;
    });
  } catch {
    // Not a picture the browser can read.
    return "no_code";
  }
  // A phone's photo is large, and one of a screen carries a fine pattern
  // that a plain downscale turns into noise: the photo is scaled down
  // smoothly, and smaller sizes are tried until one reads.
  let seen = false;
  let tried = 0;
  // One canvas for every size, given back at the end: a phone's browser
  // limits the memory of all canvases together.
  const canvas = document.createElement("canvas");
  const done = (result: number | "no_code" | "not_label"): number | "no_code" | "not_label" => {
    picture.close?.();
    canvas.width = 0;
    canvas.height = 0;
    return result;
  };
  for (const most of PHOTO_SIZES) {
    const [width, height] = fitted(picture.width, picture.height, most);
    if (width === tried) continue;
    tried = width;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context) {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(picture, 0, 0, width, height);
    }
    const text = await currentDecoder()
      .decode(context ? canvas : picture, width, height, true)
      .catch(() => undefined);
    if (text === undefined) continue;
    const id = parseSpoolQr(text);
    if (id !== undefined) return done(id);
    seen = true;
  }
  return done(seen ? "not_label" : "no_code");
}
