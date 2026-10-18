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
      // The message below says the same, in the server's language.
    }
  }
  return typeof failure.message === "string" && failure.message ? failure.message : t(hass, "error_generic");
}

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
}

/** The integration's get_k_profiles action, called for its response; an
 * answer without profiles is none. */
export async function kProfiles(hass: Hass, entityId: string): Promise<KProfiles> {
  const result = await hass.callService("bambuddy", "get_k_profiles", { entity_id: entityId }, undefined, false, true);
  const response = (result as { response?: { current?: unknown; profiles?: unknown } | null } | undefined)?.response;
  const listed = response?.profiles;
  return {
    current: typeof response?.current === "number" ? response.current : -1,
    profiles: (Array.isArray(listed) ? (listed as unknown[]) : [])
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && typeof (item as { index?: unknown }).index === "number")
      .map((item) => ({
        index: item["index"] as number,
        name: typeof item["name"] === "string" ? item["name"] : "",
        k: typeof item["k_value"] === "number" ? item["k_value"] : 0,
        filamentId: typeof item["filament_id"] === "string" ? item["filament_id"] : "",
      })),
  };
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
  const result = await hass.callService("bambuddy", "get_print_objects", { device_id: deviceId }, undefined, false, true);
  const response = (result as { response?: { objects?: unknown } | null } | undefined)?.response;
  const listed = response?.objects;
  return (Array.isArray(listed) ? (listed as unknown[]) : [])
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && typeof (item as { id?: unknown }).id === "number")
    .map((item) => ({ id: item["id"] as number, name: typeof item["name"] === "string" ? item["name"] : "", skipped: item["skipped"] === true }));
}
