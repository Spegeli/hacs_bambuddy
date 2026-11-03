// Scanning a BamBuddy spool label in the slot dialog's inventory tab (#24).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "../src/index";
import { forgetHandoverForTests } from "../src/card";
import { setDecoderForTests } from "../src/scan";
import {
  assign,
  geeetech,
  h2d,
  listed,
  makeHass,
  mountCard,
  withoutChip,
  x1c,
  type FakeCard,
  type FakeDevice,
  type FakeHass,
  type FakeHassOptions,
} from "./fixtures";
import { find, findAll, settle, showView, text } from "./helpers";

// --- The world: a slot, its spools, a camera ----------------------------------

const SLOT = "sensor.dev-x1c_ams_0_slot_3";

/** Six spools: the slot's own (1), free ones, one in another slot, one that does not fit. */
const SIX = [
  { id: 1, name: "Geeetech PLA Basic", material: "PLA", place: { this_slot: true } },
  { id: 2, name: "Bambu PLA Basic", material: "PLA", place: { printer_id: 1, printer_name: "Workshop", ams_id: 0, tray_id: 0, ams_label: null, same_printer: true } },
  { id: 3, name: "Polymaker PLA Matte", material: "PLA" },
  { id: 4, name: "Sunlu TPU 95A", material: "TPU", fits: "not_for_ams" },
  { id: 5, name: "eSUN PETG", material: "PETG" },
  { id: 6, name: "Elegoo PLA Plus", material: "PLA" },
].map(listed);

/** The slot without a chip, Geeetech's black spool assigned to it. */
const assignable = (devices: FakeDevice[], slot = SLOT): FakeDevice[] =>
  withoutChip(assign(devices, slot, geeetech({ color_name: "Black", rgba: "000000FF", remaining_g: 500, remaining_pct: 50, assigned_color: "000000FF" })), slot);

interface World {
  spools?: Record<string, unknown>[];
  app?: { fireMessage: ReturnType<typeof vi.fn> };
  config?: Record<string, unknown>;
  devices?: FakeDevice[];
  /** The Filament tab's row of the slot (0-3); the third by default. */
  row?: number;
  /** Holds the K profiles' answer back: the dialog keeps asking. */
  holdK?: boolean;
}

async function openScan(world: World = {}): Promise<FakeCard> {
  const spools = world.spools ?? SIX;
  const callService: FakeHassOptions["callService"] = async (call) => {
    if (call.service === "get_k_profiles" && world.holdK) await new Promise(() => undefined);
    return call.service === "get_spools" ? { response: { assigned: 1, spools } } : undefined;
  };
  const hass = makeHass({ devices: world.devices ?? assignable(x1c()), language: "de", callService });
  if (world.app) (hass as unknown as { auth: unknown }).auth = { external: { config: { hasBarCodeScanner: 1 }, fireMessage: world.app.fireMessage } };
  const card = await mountCard(hass, { printer: "dev-x1c", ...world.config });
  await showView(card, "Filament");
  (findAll(card, ".slot")[world.row ?? 2]?.querySelector(".btn.edit") as HTMLButtonElement).click();
  await settle(card);
  findAll<HTMLButtonElement>(card, "dialog [role=tab]").find((tab) => text(tab) === "Aus dem Inventar")?.click();
  await settle(card);
  await settle(card);
  // The filters fold behind their button; the tests here set them.
  find<HTMLButtonElement>(card, "dialog .inv-filter")?.click();
  await settle(card);
  return card;
}

const restores: Array<() => void> = [];
function define(target: object, key: string, value: unknown): void {
  const had = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
  restores.push(() => (had ? Object.defineProperty(target, key, had) : delete (target as Record<string, unknown>)[key]));
}

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
  getCapabilities: () => { torch?: boolean };
  applyConstraints: ReturnType<typeof vi.fn>;
}

/** A camera that gives a stream of one track; `torch` where it has a light. */
function camera(options: { torch?: boolean; error?: string } = {}): { tracks: FakeTrack[]; getUserMedia: ReturnType<typeof vi.fn> } {
  const tracks: FakeTrack[] = [];
  const getUserMedia = vi.fn(async () => {
    if (options.error) throw Object.assign(new Error(options.error), { name: options.error });
    const track: FakeTrack = { stop: vi.fn(), getCapabilities: () => ({ torch: options.torch === true }), applyConstraints: vi.fn(async () => undefined) };
    tracks.push(track);
    return Object.assign(Object.create(window.MediaStream.prototype), { getTracks: () => [track], getVideoTracks: () => [track] });
  });
  define(window, "isSecureContext", true);
  define(navigator, "mediaDevices", { getUserMedia });
  return { tracks, getUserMedia };
}

/** What the decoder reads from the next frames: nothing until `text` is set. */
const decoded: { text?: string } = {};

beforeEach(() => {
  decoded.text = undefined;
  setDecoderForTests({ decode: async () => decoded.text });
  define(HTMLMediaElement.prototype, "play", vi.fn(async () => undefined));
  define(HTMLVideoElement.prototype, "videoWidth", 640);
  define(HTMLVideoElement.prototype, "videoHeight", 480);
});

afterEach(() => {
  document.body.innerHTML = "";
  forgetHandoverForTests();
  while (restores.length) restores.pop()?.();
  setDecoderForTests(undefined);
  vi.unstubAllGlobals();
  delete window.externalBus;
});

const scanButton = (card: FakeCard): HTMLButtonElement | null => find<HTMLButtonElement>(card, "dialog .inv-search-row .inv-scan");
const rows = (card: FakeCard): HTMLElement[] => findAll(card, "dialog .inv-row");
const rowNames = (card: FakeCard): string[] => rows(card).map((row) => text(row.querySelector(".inv-name")));
const dialogButton = (card: FakeCard, name: string): HTMLButtonElement | undefined =>
  findAll<HTMLButtonElement>(card, "dialog button").find((item) => text(item) === name);
const search = (card: FakeCard): HTMLInputElement | null => find<HTMLInputElement>(card, "dialog #inv-search");

/** Waits for the camera's next frames (read every 200 ms). */
async function frames(card: FakeCard): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 260));
  await settle(card);
}

async function startScan(card: FakeCard): Promise<void> {
  scanButton(card)?.click();
  await settle(card);
  await settle(card);
}

// --- The button --------------------------------------------------------------

describe("the scan button", () => {
  it("stands beside the search from five spools on", async () => {
    const card = await openScan();
    const button = scanButton(card);
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("QR scannen");
    expect(button?.getAttribute("title")).toBe("QR scannen");
    expect(button?.previousElementSibling?.classList.contains("inv-filter")).toBe(true);

    const few = await openScan({ spools: SIX.slice(0, 4) });
    expect(scanButton(few)).toBeNull();
  });

  it("is locked while a filament change runs", async () => {
    const card = await openScan();
    expect(scanButton(card)?.disabled).toBe(false);
    card.hass = (card.hass as FakeHass).withState("sensor.x1c_ams_status", "feeding") as never;
    await settle(card);
    expect(scanButton(card)?.disabled).toBe(true);
  });
});

// --- The live camera -----------------------------------------------------------

describe("the live camera", () => {
  it("takes the place of the filters, the search and the list", async () => {
    camera();
    const card = await openScan();
    rows(card).find((row) => text(row.querySelector(".inv-name")) === "eSUN PETG")?.click();
    await settle(card);
    expect(dialogButton(card, "Zuweisen")?.disabled).toBe(false);
    await startScan(card);
    expect(find(card, "dialog .inv-filters")).toBeNull();
    expect(find(card, "dialog .inv-search-row")).toBeNull();
    expect(find(card, "dialog .inv-list")).toBeNull();
    const area = find(card, "dialog .inv-camera");
    expect(area?.querySelector("video")).not.toBeNull();
    expect(text(area?.querySelector(".inv-camera-help"))).toBe("Halte die Kamera auf das QR-Code-Etikett der Spule.");
    expect(text(find(card, "dialog .inv-say"))).toBe("Kamera an. Halte sie auf das Etikett der Spule.");
    expect(dialogButton(card, "Kamera schließen")).toBeDefined();
    expect(dialogButton(card, "Licht")).toBeUndefined();
    expect((find<HTMLVideoElement>(card, "dialog .inv-camera video")?.srcObject as unknown) instanceof window.MediaStream).toBe(true);
    // A hidden spool cannot be assigned.
    expect(dialogButton(card, "Zuweisen")?.disabled).toBe(true);
  });

  it("offers the light where the camera has one", async () => {
    const { tracks } = camera({ torch: true });
    const card = await openScan();
    await startScan(card);
    dialogButton(card, "Licht")?.click();
    await settle(card);
    expect(tracks[0]?.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    expect(dialogButton(card, "Licht")?.getAttribute("aria-pressed")).toBe("true");
    dialogButton(card, "Licht")?.click();
    await settle(card);
    expect(tracks[0]?.applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ torch: false }] });
    expect(dialogButton(card, "Licht")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("Kamera schließen brings everything back as it was and stops the camera", async () => {
    const { tracks } = camera();
    const card = await openScan();
    const material = find<HTMLSelectElement>(card, "dialog #inv-material") as HTMLSelectElement;
    material.value = "PETG";
    material.dispatchEvent(new Event("change"));
    await settle(card);
    await startScan(card);
    dialogButton(card, "Kamera schließen")?.click();
    await settle(card);
    expect(find(card, "dialog .inv-camera")).toBeNull();
    expect(find<HTMLSelectElement>(card, "dialog #inv-material")?.value).toBe("PETG");
    expect(rowNames(card)).toEqual(["eSUN PETG"]);
    expect(tracks[0]?.stop).toHaveBeenCalledTimes(1);
  });

  for (const [how, end] of [
    ["Abbrechen", async (card: FakeCard) => dialogButton(card, "Abbrechen")?.click()],
    ["Escape", async (card: FakeCard) => {
      const dialog = find(card, "dialog") as HTMLDialogElement;
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
      dialog.dispatchEvent(new Event("close"));
    }],
    ["the other tab", async (card: FakeCard) => findAll<HTMLButtonElement>(card, "dialog [role=tab]").find((tab) => text(tab) === "Filament einstellen")?.click()],
    ["the card leaving the page", async (card: FakeCard) => card.remove()],
  ] as const) {
    it(`the camera stops by ${how}`, async () => {
      const { tracks } = camera();
      const card = await openScan();
      await startScan(card);
      await end(card);
      await settle(card);
      expect(tracks[0]?.stop).toHaveBeenCalledTimes(1);
    });
  }

  it("a card back on the page shows the list, no camera", async () => {
    const { getUserMedia } = camera();
    const card = await openScan();
    await startScan(card);
    card.remove();
    document.body.append(card);
    await settle(card);
    expect(find(card, "dialog .inv-camera")).toBeNull();
    expect(find(card, "dialog .inv-list")).not.toBeNull();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("a camera that comes after the dialog went is stopped at once", async () => {
    const { tracks } = camera();
    const card = await openScan();
    scanButton(card)?.click();
    dialogButton(card, "Abbrechen")?.click();
    await settle(card);
    await settle(card);
    expect(tracks[0]?.stop).toHaveBeenCalledTimes(1);
  });

  for (const [error, reason] of [
    ["NotAllowedError", "Der Browser hat die Kamera nicht freigegeben. Nimm stattdessen ein Foto vom Etikett."],
    ["NotFoundError", "Keine Kamera gefunden. Nimm stattdessen ein Foto vom Etikett."],
    ["AbortError", "Die Kamera ließ sich nicht starten. Nimm stattdessen ein Foto vom Etikett."],
  ] as const) {
    it(`says why the camera did not start: ${error}`, async () => {
      camera({ error });
      const card = await openScan();
      await startScan(card);
      expect(text(find(card, "dialog .inv-camera-reason"))).toBe(reason);
      expect(find(card, 'dialog .inv-camera label.inv-photo input[type=file][accept="image/*"][capture=environment]')).not.toBeNull();
      expect(text(find(card, "dialog .inv-camera label.inv-photo"))).toBe("Foto aufnehmen");
      expect(dialogButton(card, "Kamera schließen")).toBeDefined();
    });
  }
});

// --- Over HTTP: a photo ----------------------------------------------------------

describe("a photo of the label", () => {
  async function insecure(): Promise<FakeCard> {
    define(window, "isSecureContext", false);
    const card = await openScan();
    await startScan(card);
    return card;
  }

  async function takePhoto(card: FakeCard): Promise<void> {
    const input = find<HTMLInputElement>(card, "dialog .inv-photo input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["x"], "label.jpg", { type: "image/jpeg" })], configurable: true });
    input.dispatchEvent(new Event("change"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle(card);
  }

  it("over HTTP the camera area explains and offers a photo", async () => {
    const card = await insecure();
    expect(text(find(card, "dialog .inv-camera-reason"))).toBe("Ohne HTTPS gibt der Browser die Kamera nicht frei. Nimm stattdessen ein Foto vom Etikett.");
    expect(find(card, "dialog .inv-camera video")).toBeNull();
    expect(find(card, "dialog .inv-list")).toBeNull();
    expect(dialogButton(card, "Kamera schließen")).toBeDefined();
  });

  it("a photo with a label chooses its spool", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 100, height: 100 })));
    decoded.text = "http://bambuddy:8000/inventory?spool=3";
    const card = await insecure();
    await takePhoto(card);
    expect(rowNames(card)).toEqual(["Polymaker PLA Matte"]);
    expect(text(find(card, "dialog .inv-scanned"))).toBe("Spule Nr. 3 gescannt");
  });

  it("a photo without a code, or with another code, says so", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 100, height: 100 })));
    const card = await insecure();
    await takePhoto(card);
    expect(text(find(card, "dialog .inv-camera-reason"))).toBe("Auf dem Bild war kein QR-Code zu erkennen.");
    expect(find(card, "dialog .inv-photo input")).not.toBeNull();
    decoded.text = "https://example.com";
    await takePhoto(card);
    expect(text(find(card, "dialog .inv-camera-reason"))).toBe("Kein BamBuddy-Spulenetikett");
  });

  it("no file chosen changes nothing", async () => {
    const card = await insecure();
    const input = find<HTMLInputElement>(card, "dialog .inv-photo input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [], configurable: true });
    input.dispatchEvent(new Event("change"));
    await settle(card);
    expect(text(find(card, "dialog .inv-camera-reason"))).toBe("Ohne HTTPS gibt der Browser die Kamera nicht frei. Nimm stattdessen ein Foto vom Etikett.");
  });
});

// --- After a scan -------------------------------------------------------------------

describe("after a scan", () => {
  async function scanned(id: string, before?: (card: FakeCard) => Promise<void>): Promise<FakeCard> {
    const { tracks } = camera();
    const card = await openScan();
    if (before) await before(card);
    await startScan(card);
    decoded.text = id;
    await frames(card);
    expect(tracks[0]?.stop).toHaveBeenCalledTimes(1);
    return card;
  }

  it("the filters go, the search names the spool, and it is chosen alone", async () => {
    const card = await scanned("http://192.168.178.23:8000/inventory?spool=3", async (card) => {
      const material = find<HTMLSelectElement>(card, "dialog #inv-material") as HTMLSelectElement;
      material.value = "PETG";
      material.dispatchEvent(new Event("change"));
      await settle(card);
    });
    expect(find(card, "dialog .inv-camera")).toBeNull();
    expect(find<HTMLSelectElement>(card, "dialog #inv-material")?.value).toBe("");
    expect(find<HTMLSelectElement>(card, "dialog #inv-vendor")?.value).toBe("");
    expect(search(card)?.value).toBe("Nr. 3");
    expect(rowNames(card)).toEqual(["Polymaker PLA Matte"]);
    expect(rows(card)[0]?.getAttribute("aria-checked")).toBe("true");
    const line = find(card, "dialog .inv-scanned");
    expect(text(line)).toBe("Spule Nr. 3 gescannt");
    expect(text(find(card, "dialog .inv-say"))).toBe("Spule Nr. 3 gescannt");
    expect(dialogButton(card, "Zuweisen")?.disabled).toBe(false);
  });

  it("a spool that does not fit is shown, not chosen", async () => {
    const card = await scanned("4");
    expect(rowNames(card)).toEqual(["Sunlu TPU 95A"]);
    expect(rows(card)[0]?.getAttribute("aria-checked")).toBe("false");
    expect(dialogButton(card, "Zuweisen")?.disabled).toBe(true);
  });

  it("the slot's own spool says so and assigns nothing", async () => {
    const card = await scanned("1");
    expect(text(rows(card)[0]?.querySelector(".inv-where"))).toBe("Zugewiesen: dieses Fach");
    expect(dialogButton(card, "Zuweisen")?.disabled).toBe(true);
  });

  it("a spool in another slot names where it is taken from", async () => {
    const card = await scanned("2");
    expect(rowNames(card)).toEqual(["Bambu PLA Basic"]);
    expect(text(card.shadowRoot?.querySelector("dialog .inv-panel"))).toContain("AMS A, Fach 1");
  });

  it("an unknown spool is said, the list untouched", async () => {
    const card = await scanned("99", async (card) => {
      const material = find<HTMLSelectElement>(card, "dialog #inv-material") as HTMLSelectElement;
      material.value = "PLA";
      material.dispatchEvent(new Event("change"));
      await settle(card);
    });
    expect(text(card.shadowRoot?.querySelector("dialog .inv-panel"))).toContain("BamBuddy hat keine Spule Nr. 99.");
    expect(find<HTMLSelectElement>(card, "dialog #inv-material")?.value).toBe("PLA");
    expect(search(card)?.value).toBe("");
    // The slot's own spool, chosen before, is chosen no more.
    expect(rows(card).some((row) => row.getAttribute("aria-checked") === "true")).toBe(false);
    expect(dialogButton(card, "Zuweisen")?.disabled).toBe(true);
  });

  it("the scanned line goes with the next search or filter", async () => {
    const card = await scanned("3");
    const input = search(card) as HTMLInputElement;
    input.value = "Nr. 5";
    input.dispatchEvent(new Event("input"));
    await settle(card);
    expect(find(card, "dialog .inv-scanned")).toBeNull();

    const again = await scanned("99");
    const material = find<HTMLSelectElement>(again, "dialog #inv-material") as HTMLSelectElement;
    material.value = "PETG";
    material.dispatchEvent(new Event("change"));
    await settle(again);
    expect(text(again.shadowRoot?.querySelector("dialog .inv-panel"))).not.toContain("Nr. 99");
  });

  it("a code that is no spool label keeps the camera looking", async () => {
    const { tracks } = camera();
    const card = await openScan();
    await startScan(card);
    decoded.text = "https://example.com/hello";
    await frames(card);
    expect(find(card, "dialog .inv-camera video")).not.toBeNull();
    expect(tracks[0]?.stop).not.toHaveBeenCalled();
    dialogButton(card, "Kamera schließen")?.click();
    await settle(card);
  });

  it("Zuweisen assigns the scanned spool", async () => {
    const card = await scanned("3");
    dialogButton(card, "Zuweisen")?.click();
    await settle(card);
    const calls = (card.hass as FakeHass).calls;
    expect(calls.filter((call) => call.service === "assign_spool").map((call) => call.data)).toEqual([{ entity_id: SLOT, spool_id: 3 }]);
  });
});

// --- In the Home Assistant app ----------------------------------------------------

describe("in the app", () => {
  const command = (name: string, payload: unknown) => ({ type: "command", id: 3, command: name, payload });

  async function inApp(): Promise<{ card: FakeCard; fireMessage: ReturnType<typeof vi.fn>; prev: ReturnType<typeof vi.fn> }> {
    const prev = vi.fn(() => true);
    window.externalBus = prev;
    const fireMessage = vi.fn();
    camera();
    const card = await openScan({ app: { fireMessage } });
    await startScan(card);
    return { card, fireMessage, prev };
  }

  it("the app's scanner opens with our texts, the dialog stays as it is", async () => {
    const { card, fireMessage } = await inApp();
    expect(fireMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "bar_code/scan",
      payload: { title: "Spule scannen", description: "Halte die Kamera auf das QR-Code-Etikett der Spule.", alternative_option_label: "Nummer eingeben" },
    }));
    expect(find(card, "dialog .inv-camera")).toBeNull();
    expect(find(card, "dialog .inv-list")).not.toBeNull();
  });

  it("a scanned label chooses its spool", async () => {
    const { card, fireMessage } = await inApp();
    window.externalBus?.(command("bar_code/scan_result", { rawValue: "http://h/inventory?spool=5", format: "qr_code" }));
    await settle(card);
    expect(rowNames(card)).toEqual(["eSUN PETG"]);
    expect(fireMessage).toHaveBeenLastCalledWith({ type: "bar_code/close" });
  });

  it("a wrong code is said in the app", async () => {
    const { fireMessage } = await inApp();
    window.externalBus?.(command("bar_code/scan_result", { rawValue: "hello", format: "qr_code" }));
    expect(fireMessage).toHaveBeenLastCalledWith({ type: "bar_code/notify", payload: { message: "Kein BamBuddy-Spulenetikett" } });
  });

  it("Nummer eingeben goes to the search", async () => {
    const { card } = await inApp();
    window.externalBus?.(command("bar_code/aborted", { reason: "alternative_options" }));
    await settle(card);
    await settle(card);
    expect(card.shadowRoot?.activeElement?.id).toBe("inv-search");
  });

  it("cancelled, the dialog is as it was", async () => {
    const { card, prev } = await inApp();
    window.externalBus?.(command("bar_code/aborted", { reason: "canceled" }));
    await settle(card);
    expect(rowNames(card)).toHaveLength(6);
    expect(window.externalBus).toBe(prev);
  });

  for (const [how, end] of [
    ["Abbrechen", async (card: FakeCard) => dialogButton(card, "Abbrechen")?.click()],
    ["the other tab", async (card: FakeCard) => findAll<HTMLButtonElement>(card, "dialog [role=tab]").find((tab) => text(tab) === "Filament einstellen")?.click()],
    ["the card leaving the page", async (card: FakeCard) => card.remove()],
  ] as const) {
    it(`the app's scanner closes by ${how}`, async () => {
      const { card, fireMessage, prev } = await inApp();
      await end(card);
      await settle(card);
      expect(fireMessage).toHaveBeenLastCalledWith({ type: "bar_code/close" });
      expect(window.externalBus).toBe(prev);
    });
  }
});

describe("the scan's edges", () => {
  it("the camera area keeps the height of what it stands in for", async () => {
    camera();
    const card = await openScan();
    define(HTMLElement.prototype, "offsetHeight", 312);
    await startScan(card);
    expect(find(card, "dialog .inv-camera")?.getAttribute("style")).toBe("min-height: min(312px, 60dvh)");
  });

  it("a light the camera refuses stays off", async () => {
    const { tracks } = camera({ torch: true });
    const card = await openScan();
    await startScan(card);
    tracks[0]?.applyConstraints.mockRejectedValueOnce(new Error("no"));
    dialogButton(card, "Licht")?.click();
    await settle(card);
    expect(dialogButton(card, "Licht")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("a photo read after the camera was closed changes nothing", async () => {
    define(window, "isSecureContext", false);
    let release: (value: unknown) => void = () => undefined;
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise((resolve) => (release = resolve))));
    decoded.text = "3";
    const card = await openScan();
    await startScan(card);
    const input = find<HTMLInputElement>(card, "dialog .inv-photo input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["x"], "label.jpg")], configurable: true });
    input.dispatchEvent(new Event("change"));
    dialogButton(card, "Kamera schließen")?.click();
    await settle(card);
    release({ width: 10, height: 10 });
    await settle(card);
    expect(find(card, "dialog .inv-scanned")).toBeNull();
    expect(rowNames(card)).toHaveLength(6);
  });
});

// --- The editor option: assign a scanned spool at once --------------------------

describe("assign_scanned_spool", () => {
  type Calls = { service: string; data?: Record<string, unknown> }[];
  const assigned = (card: FakeCard): unknown[] =>
    (card.hass as FakeHass).calls.filter((call) => call.service === "assign_spool").map((call) => call.data);

  async function scanWith(id: string, world: World = {}): Promise<FakeCard> {
    camera();
    const card = await openScan({ config: { assign_scanned_spool: true }, ...world });
    await startScan(card);
    decoded.text = id;
    await frames(card);
    await settle(card);
    return card;
  }

  it("a fitting spool is assigned at once and the dialog closes", async () => {
    const card = await scanWith("3");
    expect(assigned(card)).toEqual([{ entity_id: SLOT, spool_id: 3 }]);
    expect(find(card, "dialog")).toBeNull();
  });

  const ALSO = listed({ id: 7, name: "Prusament PLA Galaxy", material: "PLA", also: [{ printer_id: 1, printer_name: "Workshop", ams_id: 0, tray_id: 3, ams_label: null, same_printer: true }] });

  for (const [why, id, world] of [
    ["the spool sits in another slot", "2", {}],
    ["the spool sits in two slots", "7", { spools: [...SIX, ALSO] }],
    ["another material warns", "5", {}],
    ["the spool does not fit", "4", {}],
    ["the slot is the running print's", "3", { row: 1, devices: assignable(x1c(), "sensor.dev-x1c_ams_0_slot_2") }],
  ] as const) {
    it(`waits for Zuweisen where ${why}`, async () => {
      const card = await scanWith(id, world as World);
      expect(assigned(card)).toEqual([]);
      expect(find(card, "dialog")).not.toBeNull();
      expect(text(find(card, "dialog .inv-scanned"))).toBe(`Spule Nr. ${id} gescannt`);
    });
  }

  it("without the option it never assigns by itself", async () => {
    camera();
    const card = await openScan();
    await startScan(card);
    decoded.text = "3";
    await frames(card);
    expect(assigned(card)).toEqual([]);
    expect(find(card, "dialog")).not.toBeNull();
  });
});

// --- When the slot or the camera changes under the scan -----------------------------

describe("the scan while things change", () => {
  const active = (card: FakeCard): Element | null | undefined => card.shadowRoot?.activeElement;

  it("a slot that drops out of the inventory for a moment ends the scan", async () => {
    const { tracks } = camera();
    const card = await openScan();
    await startScan(card);
    const hass = card.hass as FakeHass;
    const before = hass.states[SLOT] as { state: string; attributes: Record<string, unknown> };
    card.hass = hass.withState(SLOT, before.state, { ...before.attributes, inventory_assignable: false }) as never;
    await settle(card);
    expect(tracks[0]?.stop).toHaveBeenCalledTimes(1);
    card.hass = (card.hass as FakeHass).withState(SLOT, before.state, before.attributes) as never;
    await settle(card);
    expect(find(card, "dialog .inv-camera")).toBeNull();
    expect(find(card, "dialog .inv-list")).not.toBeNull();
  });

  it("the keyboard's place follows the scan: the camera's buttons, back to the scan button, the chosen spool", async () => {
    camera();
    const card = await openScan();
    await startScan(card);
    expect(text(active(card))).toBe("Kamera schließen");
    dialogButton(card, "Kamera schließen")?.click();
    await settle(card);
    expect(active(card)?.classList.contains("inv-scan")).toBe(true);
    await startScan(card);
    decoded.text = "3";
    await frames(card);
    await settle(card);
    expect(active(card)?.getAttribute("aria-checked")).toBe("true");
    expect(text(active(card)?.querySelector(".inv-name"))).toBe("Polymaker PLA Matte");
  });

  it("over HTTP the photo's button takes the keyboard's place; an unknown spool gives it back to the scan button", async () => {
    define(window, "isSecureContext", false);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 10, height: 10 })));
    const card = await openScan();
    await startScan(card);
    expect(active(card)?.matches(".inv-photo input")).toBe(true);
    decoded.text = "999";
    const input = find<HTMLInputElement>(card, "dialog .inv-photo input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["x"], "label.jpg")], configurable: true });
    input.dispatchEvent(new Event("change"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle(card);
    expect(active(card)?.classList.contains("inv-scan")).toBe(true);
    expect(text(find(card, "dialog .inv-say"))).toBe("BamBuddy hat keine Spule Nr. 999.");
  });

  it("one live region says what the scan did, and it stays the same element", async () => {
    camera({ error: "NotAllowedError" });
    const card = await openScan();
    const region = find(card, "dialog .inv-say");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(text(region)).toBe("");
    await startScan(card);
    expect(find(card, "dialog .inv-say")).toBe(region);
    expect(text(region)).toBe("Der Browser hat die Kamera nicht freigegeben. Nimm stattdessen ein Foto vom Etikett.");
    expect(findAll(card, "dialog [aria-live]")).toHaveLength(1);
  });

  it("says the camera is on only once its picture comes", async () => {
    let give: (stream: unknown) => void = () => undefined;
    const track = { stop: vi.fn(), getCapabilities: () => ({}), applyConstraints: vi.fn() };
    define(window, "isSecureContext", true);
    define(navigator, "mediaDevices", { getUserMedia: () => new Promise((resolve) => (give = resolve)) });
    const card = await openScan();
    await startScan(card);
    expect(text(find(card, "dialog .inv-say"))).toBe("");
    give(Object.assign(Object.create(window.MediaStream.prototype), { getTracks: () => [track], getVideoTracks: () => [track] }));
    await settle(card);
    expect(text(find(card, "dialog .inv-say"))).toBe("Kamera an. Halte sie auf das Etikett der Spule.");
    dialogButton(card, "Kamera schließen")?.click();
    await settle(card);
  });

  it("the hidden choice's warnings go while the camera shows", async () => {
    camera();
    const card = await openScan();
    rows(card).find((row) => text(row.querySelector(".inv-name")) === "eSUN PETG")?.click();
    await settle(card);
    expect(findAll(card, "dialog .dlg-warn").length).toBeGreaterThan(0);
    await startScan(card);
    expect(findAll(card, "dialog .dlg-warn")).toHaveLength(0);
  });
});

// --- A phone's camera app takes the page away: Home Assistant rebuilds the dashboard ---

describe("the photo's trip to the camera app", () => {
  async function photoArea(world: World = {}): Promise<FakeCard> {
    define(window, "isSecureContext", false);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 10, height: 10 })));
    const card = await openScan(world);
    await startScan(card);
    return card;
  }

  async function choosePhoto(card: FakeCard): Promise<void> {
    const input = card.shadowRoot?.querySelector<HTMLInputElement>("dialog .inv-photo input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["x"], "label.jpg")], configurable: true });
    input.dispatchEvent(new Event("change"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  /** The camera app hides the page for a while. */
  function trip(): void {
    define(document, "visibilityState", "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    define(document, "visibilityState", "visible");
    document.dispatchEvent(new Event("visibilitychange"));
  }

  /** Home Assistant's reconnect after the trip: the dashboard's cards are new elements. */
  async function rebuilt(old: FakeCard, hidden = true, config: Record<string, unknown> = {}): Promise<FakeCard> {
    if (hidden) trip();
    old.remove();
    const card = await mountCard(old.hass as FakeHass, { printer: "dev-x1c", ...config });
    await settle(card);
    await settle(card);
    return card;
  }

  it("the new card takes on the slot dialog, and the photo read by the old one", async () => {
    const old = await photoArea();
    const card = await rebuilt(old);
    expect(find(card, "dialog[open] .inv-camera-reason")).not.toBeNull();
    expect(find(card, "[role=tab][aria-selected=true]")?.textContent).toContain("Filament");
    decoded.text = "3";
    await choosePhoto(old);
    await settle(card);
    expect(rowNames(card)).toEqual(["Polymaker PLA Matte"]);
    expect(text(find(card, "dialog .inv-scanned"))).toBe("Spule Nr. 3 gescannt");
  });

  it("a photo read before the rebuild comes along", async () => {
    const old = await photoArea();
    decoded.text = "5";
    await choosePhoto(old);
    await settle(old);
    const card = await rebuilt(old);
    expect(rowNames(card)).toEqual(["eSUN PETG"]);
    expect(text(find(card, "dialog .inv-scanned"))).toBe("Spule Nr. 5 gescannt");
  });

  it("only after a photo, only for a short while, and only for the same printer", async () => {
    camera();
    const plain = await openScan();
    const fresh = await rebuilt(plain);
    expect(find(fresh, "dialog")).toBeNull();

    // A page left with the dialog open, not hidden: nothing is handed on.
    const left = await photoArea();
    const back = await rebuilt(left, false);
    expect(find(back, "dialog")).toBeNull();

    const late = await photoArea();
    const now = Date.now();
    trip();
    late.remove();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 31_000);
    const after = await mountCard(late.hass as FakeHass, { printer: "dev-x1c" });
    await settle(after);
    expect(find(after, "dialog")).toBeNull();
    clock.mockRestore();

    const other = await photoArea();
    trip();
    other.remove();
    const elsewhere = await mountCard(makeHass({ devices: [...x1c(), ...h2d()], language: "de" }), { printer: "dev-h2d" });
    await settle(elsewhere);
    expect(find(elsewhere, "dialog")).toBeNull();
  });

  it("a photo read after the old card left and before the new one came still arrives", async () => {
    const old = await photoArea();
    trip();
    old.remove();
    decoded.text = "3";
    await choosePhoto(old);
    await settle(old);
    const card = await mountCard(old.hass as FakeHass, { printer: "dev-x1c" });
    await settle(card);
    await settle(card);
    expect(rowNames(card)).toEqual(["Polymaker PLA Matte"]);
  });

  it("a card that only moved keeps its dialog to itself", async () => {
    const card = await photoArea();
    trip();
    card.remove();
    document.body.append(card);
    await settle(card);
    const other = await mountCard(card.hass as FakeHass, { printer: "dev-x1c" });
    await settle(other);
    expect(find(other, "dialog")).toBeNull();
    expect(find(card, "dialog[open] .inv-camera")).not.toBeNull();
  });

  it("another page, another card set-up or the card editor takes nothing", async () => {
    const first = await photoArea();
    trip();
    first.remove();
    history.pushState(null, "", "/other-dashboard");
    const elsewhere = await mountCard(first.hass as FakeHass, { printer: "dev-x1c" });
    await settle(elsewhere);
    expect(find(elsewhere, "dialog")).toBeNull();
    history.pushState(null, "", "/");

    const second = await photoArea();
    const other = await rebuilt(second, true, { read_only: true });
    expect(find(other, "dialog")).toBeNull();
  });

  it("a second rebuild keeps the dialog", async () => {
    const old = await photoArea();
    const once = await rebuilt(old);
    const twice = await rebuilt(once, false);
    expect(find(twice, "dialog[open] .inv-camera-reason")).not.toBeNull();
  });

  it("the new card asks again what the old one was still waiting for", async () => {
    const old = await photoArea({ holdK: true });
    const asked = (card: FakeCard): number =>
      (card.hass as FakeHass).calls.filter((call) => call.service === "get_k_profiles").length;
    expect(asked(old)).toBe(1);
    const card = await rebuilt(old);
    expect(asked(card)).toBe(2);
  });
});

describe("a scan's search and the next scan", () => {
  async function scanOnce(card: FakeCard, text: string): Promise<void> {
    await startScan(card);
    decoded.text = text;
    await frames(card);
    await settle(card);
  }

  it("an unknown number takes away the search an earlier scan set", async () => {
    camera();
    const card = await openScan();
    await scanOnce(card, "4");
    expect(search(card)?.value).toBe("Nr. 4");
    await scanOnce(card, "999");
    expect(search(card)?.value).toBe("");
    expect(rowNames(card)).toHaveLength(6);
    expect(text(card.shadowRoot?.querySelector("dialog .inv-panel"))).toContain("BamBuddy hat keine Spule Nr. 999.");
  });

  it("a search the user typed stays", async () => {
    camera();
    const card = await openScan();
    await scanOnce(card, "4");
    const input = search(card) as HTMLInputElement;
    input.value = "PLA";
    input.dispatchEvent(new Event("input"));
    await settle(card);
    await scanOnce(card, "999");
    expect(search(card)?.value).toBe("PLA");
  });
});

describe("a foreign code before the live camera", () => {
  it("the help line says it is no label, then helps again", async () => {
    camera();
    const card = await openScan();
    await startScan(card);
    decoded.text = "https://example.com/manual";
    await frames(card);
    expect(text(find(card, "dialog .inv-camera-help"))).toBe("Kein BamBuddy-Spulenetikett");
    expect(text(find(card, "dialog .inv-say"))).toBe("Kein BamBuddy-Spulenetikett");
    decoded.text = undefined;
    await new Promise((resolve) => setTimeout(resolve, 3300));
    await settle(card);
    expect(text(find(card, "dialog .inv-camera-help"))).toBe("Halte die Kamera auf das QR-Code-Etikett der Spule.");
    decoded.text = "3";
    await frames(card);
    expect(rowNames(card)).toEqual(["Polymaker PLA Matte"]);
  });
});

describe("what screen readers hear, and the filter button's relation", () => {
  it("a second photo that fails the same is said again", async () => {
    define(window, "isSecureContext", false);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 10, height: 10 })));
    const card = await openScan();
    await startScan(card);
    const said: string[] = [];
    for (let photo = 0; photo < 2; photo += 1) {
      const input = find<HTMLInputElement>(card, "dialog .inv-photo input") as HTMLInputElement;
      Object.defineProperty(input, "files", { value: [new File(["x"], "label.jpg")], configurable: true });
      input.dispatchEvent(new Event("change"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await settle(card);
      said.push(find(card, "dialog .inv-say")?.textContent ?? "");
    }
    expect(said[0]?.replace(/\u200b/g, "")).toBe("Auf dem Bild war kein QR-Code zu erkennen.");
    expect(said[1]?.replace(/\u200b/g, "")).toBe("Auf dem Bild war kein QR-Code zu erkennen.");
    expect(said[0]).not.toBe(said[1]);
  });

  it("after a foreign code it does not say the camera is on again", async () => {
    camera();
    const card = await openScan();
    await startScan(card);
    decoded.text = "https://example.com";
    await frames(card);
    decoded.text = undefined;
    await new Promise((resolve) => setTimeout(resolve, 3300));
    await settle(card);
    expect(text(find(card, "dialog .inv-say"))).toBe("");
    dialogButton(card, "Kamera schließen")?.click();
    await settle(card);
  });

  it("names the filters it controls only while they show", async () => {
    camera();
    const card = await openScan();
    expect(find(card, "dialog .inv-filter")?.getAttribute("aria-controls")).toBe("inv-filters");
    find<HTMLButtonElement>(card, "dialog .inv-filter")?.click();
    await settle(card);
    expect(find(card, "dialog .inv-filter")?.hasAttribute("aria-controls")).toBe(false);
  });
});

describe("a dialog too tall for the screen", () => {
  it("scrolls as a whole once the list's least would not fit", async () => {
    camera();
    const card = await openScan();
    define(window, "innerHeight", 766);
    define(HTMLElement.prototype, "scrollHeight", 900);
    card.requestUpdate();
    await settle(card);
    expect(find(card, "dialog .dlg-body")?.classList.contains("inv-short")).toBe(true);
    define(HTMLElement.prototype, "scrollHeight", 400);
    card.requestUpdate();
    await settle(card);
    expect(find(card, "dialog .dlg-body")?.classList.contains("inv-short")).toBe(false);
  });
});
