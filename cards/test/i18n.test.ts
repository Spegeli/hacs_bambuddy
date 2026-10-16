import { afterEach, describe, expect, it } from "vitest";

import { languageOf, LANGUAGES, rememberLocale, t } from "../src/i18n";
import { en } from "../src/translations/en";
import { makeHass } from "./fixtures";

afterEach(() => {
  document.body.innerHTML = "";
  rememberLocale(makeHass({ language: "en" }));
});

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string).sort();

describe("the card's texts", () => {
  it("exist in every language with English's keys and placeholders", () => {
    for (const [language, texts] of Object.entries(LANGUAGES)) {
      expect(Object.keys(texts).sort(), language).toEqual(Object.keys(en).sort());
      for (const [key, text] of Object.entries(texts)) {
        expect(placeholders(text), `${language}.${key}`).toEqual(placeholders(en[key as keyof typeof en]));
        expect(text.trim(), `${language}.${key}`).not.toBe("");
      }
    }
  });

  it("fill in their placeholders and leave unknown ones", () => {
    const hass = makeHass();
    expect(t(hass, "layer", { current: 3, total: 9 })).toBe("Layer 3 / 9");
    expect(t(hass, "layer", { current: 3 })).toBe("Layer 3 / {total}");
  });

  it("follow the profile's language, its base for a regional one, else English", () => {
    expect(languageOf(makeHass({ language: "de" }))).toBe("de");
    expect(languageOf(makeHass({ language: "de-CH" }))).toBe("de");
    expect(languageOf(makeHass({ language: "pt_BR" }))).toBe("en");
    expect(t(makeHass({ language: "de" }), "tab_control")).toBe("Steuerung");
  });

  it("without hass: Home Assistant's language from the page, else the one a card saw last", () => {
    expect(languageOf()).toBe("en");
    rememberLocale(makeHass({ language: "de" }));
    expect(languageOf()).toBe("de");
    const root = document.createElement("home-assistant") as HTMLElement & { hass?: unknown };
    document.body.append(root);
    expect(languageOf()).toBe("de");
    root.hass = makeHass({ language: "en" });
    expect(languageOf()).toBe("en");
  });
});
