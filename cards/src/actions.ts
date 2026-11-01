// Calls to Home Assistant's actions, and the reason one failed in the
// viewer's language: the integration's own text where it raised one.
import { t } from "./i18n";
import type { ActionError, Hass } from "./types";

/** Calls an action; the card shows a failure itself, so Home Assistant's
 * own notification stays off. */
export async function callAction(hass: Hass, domain: string, service: string, data: Record<string, unknown>): Promise<void> {
  await hass.callService(domain, service, data, undefined, false);
}

/** Why an action failed: the integration's translated message, else Home
 * Assistant's text, else a general one. */
export async function errorText(hass: Hass, error: unknown): Promise<string> {
  const failure = (typeof error === "object" && error !== null ? error : {}) as ActionError;
  const domain = failure.translation_domain;
  const key = failure.translation_key;
  if (domain && key) {
    try {
      const localize = await hass.loadBackendTranslation("exceptions", domain);
      const text = localize(`component.${domain}.exceptions.${key}.message`, failure.translation_placeholders ?? {});
      if (text) return text;
    } catch {
      // The message below says the same, in English: Home Assistant's backend builds it so.
    }
  }
  return typeof failure.message === "string" && failure.message ? failure.message : t(hass, "error_generic");
}

/** The response of an action that answers (a read), else an empty one. */
export async function responseOf(hass: Hass, service: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = (await hass.callService("bambuddy", service, data, undefined, false, true)) as { response?: Record<string, unknown> | null } | undefined;
  return result?.response ?? {};
}

/** The objects of a list in a response that have the field `key` of type
 * `kind`; whatever else it holds is left out. */
export const entriesOf = (list: unknown, key: string, kind: "number" | "string"): Record<string, unknown>[] =>
  (Array.isArray(list) ? (list as unknown[]) : []).filter(
    (item): item is Record<string, unknown> => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>)[key] === kind,
  );

/** One of the printer's own K calibrations, as the integration lists it. */
export interface KProfile {
  index: number;
  name: string;
  k: number;
  filamentId: string;
}

/** A slot's K profiles: the printer's for the nozzle that feeds it, and
 * the slot's own (-1: the printer's default). */
export interface KProfiles {
  current: number;
  profiles: KProfile[];
  /** With no profiles: the printer has none of its own (true) or did not
   * answer (false) -- the integration tells them apart by BamBuddy's time. */
  answered: boolean;
  /** The nozzle diameter the printer was asked for: 0.4. */
  diameter?: number;
}

/** The integration's get_k_profiles action, called for its response; an
 * answer without profiles is none. */
export async function kProfiles(hass: Hass, entityId: string): Promise<KProfiles> {
  const response = await responseOf(hass, "get_k_profiles", { entity_id: entityId });
  const diameter = Number(response["nozzle_diameter"]);
  return {
    current: typeof response["current"] === "number" ? response["current"] : -1,
    answered: response["answered"] !== false,
    ...(Number.isFinite(diameter) && diameter > 0 ? { diameter } : {}),
    profiles: entriesOf(response["profiles"], "index", "number").map((item) => ({
      index: item["index"] as number,
      name: typeof item["name"] === "string" ? item["name"] : "",
      k: typeof item["k_value"] === "number" ? item["k_value"] : 0,
      filamentId: typeof item["filament_id"] === "string" ? item["filament_id"] : "",
    })),
  };
}

/** A filament Bambu Studio offers a slot: its profile id, its name under
 * its vendor ("PLA Basic"), its type. */
export interface OfferedFilament {
  id: string;
  name: string;
  type: string;
}

/** What Bambu Studio offers a slot, by vendor in its order, and the
 * slot's own profile. */
export interface FilamentOffer {
  current?: string;
  vendors: { name: string; filaments: OfferedFilament[] }[];
}

/** The integration's get_filaments action, called for its response; an
 * answer without vendors is none (an empty list of vendors is an offer:
 * nothing for this slot). */
export async function filamentOffer(hass: Hass, entityId: string): Promise<FilamentOffer | undefined> {
  const response = await responseOf(hass, "get_filaments", { entity_id: entityId });
  if (!Array.isArray(response["vendors"])) return undefined;
  const vendors = entriesOf(response["vendors"], "name", "string").map((vendor) => ({
    name: vendor["name"] as string,
    filaments: entriesOf(vendor["filaments"], "id", "string").map((item) => ({
      id: item["id"] as string,
      name: typeof item["name"] === "string" ? item["name"] : (item["id"] as string),
      type: typeof item["type"] === "string" ? item["type"] : "",
    })),
  }));
  return { ...(typeof response["current"] === "string" ? { current: response["current"] } : {}), vendors };
}

/** Where a spool of the list sits: this slot, another slot (of this
 * printer or another of the BamBuddy), or none. */
export type SpoolPlace =
  | { here: true }
  | { here: false; printerId: number; printerName: string; amsId: number; trayId: number; amsLabel?: string; samePrinter: boolean };

/** A spool of BamBuddy's inventory, as get_spools lists it for a slot. */
export interface ListedSpool {
  id: number;
  name: string;
  brand: string;
  material: string;
  colorName?: string;
  rgba?: string;
  extraColors: string[];
  remainingG: number;
  remainingPct?: number;
  storage?: string;
  rfid: boolean;
  place?: SpoolPlace;
  /** Its further slots: BamBuddy can hold a spool in two. */
  also: SpoolPlace[];
  /** Why the slot cannot take it; none where it can. */
  /** BamBuddy links a Bambu spool by its chip itself ("by_chip"); a spool
   * in a slot of another printer that prints is locked ("printing"). */
  fits?: "not_for_ams" | "not_for_nozzle" | "not_for_printer" | "by_chip" | "printing";
  /** The printer that prints, for "printing". */
  printing?: string;
  /** The type a slot takes for it, as BamBuddy reduces its material ("PLA+" -> PLA). */
  type?: string;
}

export interface SpoolList {
  /** The spool assigned to the slot. */
  assigned?: number;
  spools: ListedSpool[];
}

const FITS = new Set(["not_for_ams", "not_for_nozzle", "not_for_printer", "by_chip", "printing"]);

export function placeOf(value: unknown): SpoolPlace | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const place = value as Record<string, unknown>;
  if (place["this_slot"] === true) return { here: true };
  const { printer_id: printerId, ams_id: amsId, tray_id: trayId } = place;
  if (typeof printerId !== "number" || typeof amsId !== "number" || typeof trayId !== "number") return undefined;
  return {
    here: false,
    printerId,
    printerName: typeof place["printer_name"] === "string" ? place["printer_name"] : String(printerId),
    amsId,
    trayId,
    ...(typeof place["ams_label"] === "string" && place["ams_label"] ? { amsLabel: place["ams_label"] } : {}),
    samePrinter: place["same_printer"] === true,
  };
}

/** A list of slots a spool is assigned to besides this one. */
export const placesOf = (value: unknown): SpoolPlace[] =>
  (Array.isArray(value) ? value : []).map(placeOf).filter((place): place is SpoolPlace => place !== undefined && !place.here);

/** The integration's get_spools action, called for its response: the
 * inventory's spools for a slot. An answer without a list is none. */
export async function spoolList(hass: Hass, entityId: string): Promise<SpoolList | undefined> {
  const response = await responseOf(hass, "get_spools", { entity_id: entityId });
  if (!Array.isArray(response["spools"])) return undefined;
  const text = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);
  const spools = entriesOf(response["spools"], "id", "number").map((item): ListedSpool => {
    const place = placeOf(item["place"]);
    const fits = item["fits"];
    const pct = item["remaining_pct"];
    const grams = item["remaining_g"];
    return {
      id: item["id"] as number,
      name: text(item["name"]) ?? String(item["id"]),
      brand: text(item["brand"]) ?? "",
      material: text(item["material"]) ?? "",
      ...(text(item["color_name"]) ? { colorName: text(item["color_name"]) } : {}),
      ...(text(item["rgba"]) ? { rgba: text(item["rgba"]) } : {}),
      extraColors: Array.isArray(item["extra_colors"]) ? item["extra_colors"].filter((color): color is string => typeof color === "string") : [],
      remainingG: typeof grams === "number" ? grams : 0,
      ...(typeof pct === "number" ? { remainingPct: pct } : {}),
      ...(text(item["storage_location"]) ? { storage: text(item["storage_location"]) } : {}),
      rfid: item["rfid"] === true,
      ...(place ? { place } : {}),
      also: placesOf(item["also"]),
      ...(typeof fits === "string" && FITS.has(fits) ? { fits: fits as ListedSpool["fits"] } : {}),
      ...(text(item["printing"]) ? { printing: text(item["printing"]) } : {}),
      ...(text(item["type"]) ? { type: text(item["type"]) } : {}),
    };
  });
  const assigned = response["assigned"];
  return { ...(typeof assigned === "number" ? { assigned } : {}), spools };
}

/** An object of the running print, as the integration lists it. */
export interface PrintObject {
  id: number;
  name: string;
  skipped: boolean;
}

/** The objects of the running print: the integration's get_print_objects
 * action, called for its response. */
export async function printObjects(hass: Hass, deviceId: string): Promise<PrintObject[]> {
  const response = await responseOf(hass, "get_print_objects", { device_id: deviceId });
  return entriesOf(response["objects"], "id", "number").map((item) => ({
    id: item["id"] as number,
    name: typeof item["name"] === "string" ? item["name"] : "",
    skipped: item["skipped"] === true,
  }));
}
