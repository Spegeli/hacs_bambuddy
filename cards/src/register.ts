// Defines the card's element and lists it in the dashboard's card picker,
// with a preview and, from Home Assistant 2026.6 on, as a suggestion for
// the entities of a BamBuddy printer and its AMS units. A module loaded
// twice defines nothing twice.
import { isPrinter, PLATFORM } from "./discovery";
import type { Hass } from "./types";

// Home Assistant's frontend (2025.5 on) replaces window.customElements with a
// registry of its own once its app has loaded, and it loads that app and this
// module side by side: an element defined in the browser's registry before
// the swap stays unknown to the frontend ("Custom element doesn't exist").
const LOADED_WITH = window.customElements;
const READY_TIMEOUT = 10_000;

/** The registry to define in: the one Home Assistant put in place, or the
 * current one once its app element is defined there; after ten seconds the
 * current one in any case. */
export function whenRegistryReady(
  current: () => CustomElementRegistry = () => window.customElements,
  loadedWith: CustomElementRegistry = LOADED_WITH,
  timeout = READY_TIMEOUT,
): Promise<CustomElementRegistry> {
  const started = Date.now();
  return new Promise((resolve) => {
    const check = (): void => {
      const registry = current();
      if (registry !== loadedWith || registry.get("home-assistant") || Date.now() - started >= timeout) resolve(registry);
      else setTimeout(check, 50);
    };
    check();
  });
}

export const DOCS_URL = "https://github.com/Spegeli/hacs_bambuddy#-dashboard-card";

export interface CardInfo {
  /** Read each time the card picker opens: in the language of that moment. */
  name: () => string;
  description: () => string;
}

interface Suggestion {
  config: { type: string; printer: string; camera: string };
}

interface PickerEntry {
  type: string;
  name: string;
  description: string;
  preview: boolean;
  documentationURL: string;
  getEntitySuggestion: (hass: Hass, entityId: string) => Suggestion | null;
}

/** The card for an entity of a BamBuddy printer, or of one of its AMS
 * units; null for any other entity. */
export function suggestCard(hass: Hass, entityId: string, tag: string): Suggestion | null {
  const entry = hass.entities[entityId];
  if (!entry || entry.platform !== PLATFORM || !entry.device_id) return null;
  const device = hass.devices[entry.device_id];
  const printer = isPrinter(hass, entry.device_id) ? entry.device_id : device?.via_device_id;
  if (!printer || !isPrinter(hass, printer)) return null;
  return { config: { type: `custom:${tag}`, printer, camera: "tap" } };
}

export function defineCard(tag: string, element: CustomElementConstructor, info: CardInfo): void {
  void whenRegistryReady().then((registry) => {
    if (!registry.get(tag)) registry.define(tag, element);
  });
  const picker = window as Window & { customCards?: PickerEntry[] };
  picker.customCards ??= [];
  if (picker.customCards.some((entry) => entry.type === tag)) return;
  picker.customCards.push({
    type: tag,
    get name() {
      return info.name();
    },
    get description() {
      return info.description();
    },
    preview: true,
    documentationURL: DOCS_URL,
    getEntitySuggestion: (hass: Hass, entityId: string) => suggestCard(hass, entityId, tag),
  });
}
