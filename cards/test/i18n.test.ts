import { afterEach, describe, expect, it } from "vitest";

import { languageOf, LANGUAGES, rememberLocale, t } from "../src/i18n";
import { en } from "../src/translations/en";
import { DETECTORS } from "../src/types";
import { INTEGRATION_NAMES, makeHass } from "./fixtures";

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

  it("name the print options and the fans as the integration does, in each of its languages", () => {
    // The card takes an entity whose registry name is one of these for not
    // renamed, and shows its own name for it in the viewer's language.
    const fans: [string, string][] = [
      ["part", "fan.part_cooling_fan"],
      ["aux", "fan.auxiliary_fan"],
      ["chamber", "fan.chamber_fan"],
      ["exhaust", "fan.exhaust_fan"],
      ["left_aux", "fan.left_auxiliary_fan"],
      ["hotend", "sensor.hotend_fan"],
    ];
    for (const language of ["en", "de"] as const) {
      const texts = LANGUAGES[language] as Record<string, string>;
      const integration = INTEGRATION_NAMES[language];
      for (const key of DETECTORS) expect(texts[`detection_${key}`], `${language} ${key}`).toBe(integration[`switch.${key}`]);
      for (const [card, entity] of fans) expect(texts[`fan_${card}_name`], `${language} ${card}`).toBe(integration[entity]);
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
