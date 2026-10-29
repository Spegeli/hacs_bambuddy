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
