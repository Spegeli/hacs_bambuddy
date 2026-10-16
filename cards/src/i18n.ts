// The card's texts in the viewer's language: the language of their Home
// Assistant profile, its base language for a regional one (de-AT -> de),
// English for any other. Entity states (print status, stage, speed) come
// translated from the integration through Home Assistant.
import { de } from "./translations/de";
import { en, type Texts } from "./translations/en";
import type { Hass } from "./types";

export type TextKey = keyof typeof en;

export const LANGUAGES = { en, de } satisfies Record<string, Texts>;
type Language = keyof typeof LANGUAGES;

const isLanguage = (code: string): code is Language => code in LANGUAGES;

// The card picker, the editor's form and a configuration check get no
// hass: they speak Home Assistant's language from the page's root element,
// else the language a card saw last (rememberLocale).
let remembered: Language = "en";

const baseLanguage = (language: string): Language => {
  const base = language.toLowerCase().replace(/[-_].*$/, "");
  return isLanguage(base) ? base : "en";
};

export function languageOf(hass?: Hass): Language {
  const root = hass ?? (document.querySelector("home-assistant") as { hass?: Hass } | null)?.hass;
  return root ? baseLanguage(root.locale.language) : remembered;
}

export function rememberLocale(hass: Hass): void {
  remembered = languageOf(hass);
}

export function t(hass: Hass | undefined, key: TextKey, vars: Record<string, string | number> = {}): string {
  return LANGUAGES[languageOf(hass)][key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
