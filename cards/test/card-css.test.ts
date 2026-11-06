// The card's style sheet: texts in a state's colour, the dialogs, the layout of a narrow card and on a touch screen.
import { describe, expect, it } from "vitest";

import "../src/index";
import { atRule, declarations, ownRule, styleText } from "./helpers";
import { useCardPage } from "./card-helpers";

useCardPage();

describe("texts in a state's colour, the plugs' too", () => {
  it("mix the tone with the text colour; the icons keep the pure tone", () => {
    const sheet = styleText();
    expect(declarations(".p-row.warn .p-sub", sheet)).toContain("color: color-mix(in srgb, var(--bb-warn) 55%, var(--bb-text))");
    expect(declarations(".p-row.warn .p-icon", sheet)).toContain("color: var(--bb-warn)");
    expect(sheet).toMatch(/\.p-auto\.waiting \.p-name,\s*\.p-starting \.p-name\s*\{[^}]*color: color-mix\(in srgb, var\(--bb-accent\) 55%, var\(--bb-text\)\);/);
    expect(declarations(".p-auto.waiting .p-icon", sheet)).toContain("color: var(--bb-accent)");
    expect(declarations(".hms-wiki", sheet)).toContain("color: color-mix(in srgb, var(--bb-accent) 55%, var(--bb-text))");
  });
});

describe("texts in a state's colour", () => {
  const mixed = (tone: string): string => `color: color-mix\\(in srgb, var\\(${tone}\\) 55%, var\\(--bb-text\\)\\)`;

  it("mix the colour with the text colour; the icons keep the colour", () => {
    const sheet = styleText();
    const rules: [string, string][] = [
      ["\\.state", "--tone"],
      ["\\.pct", "--tone"],
      ["\\.slot-sub \\.in-use", "--bb-accent"],
      ["\\.ams-activity", "--bb-accent"],
      ["\\.spec-value\\.update", "--bb-warn"],
    ];
    // The rule of the selector itself: after a rule or a comment.
    for (const [selector, tone] of rules) expect(sheet, selector).toMatch(ownRule(selector, mixed(tone)));
    expect(declarations(".state .icon", sheet)).toContain("color: var(--tone)");
    expect(sheet).toMatch(/\.ams-activity \.icon,\s*\.activity \.icon\s*\{[^}]*color: var\(--bb-accent\)/);
  });

  // Home Assistant's default colours: of the 2025.5 floor -- the card's
  // fallbacks -- and of today's frontend (20260930), light and dark.
  const THEMES = [
    { name: "2025.5 light", text: "#212121", muted: "#727272", background: "#ffffff", accent: "#03a9f4" },
    { name: "2025.5 dark", text: "#e1e1e1", muted: "#9b9b9b", background: "#1c1c1c", accent: "#03a9f4" },
    { name: "2026.10 light", text: "#141414", muted: "#5e5e5e", background: "#ffffff", accent: "#009ac7" },
    { name: "2026.10 dark", text: "#e1e1e1", muted: "#9b9b9b", background: "#1c1c1c", accent: "#009ac7" },
  ];
  const ERROR = "#db4437";
  type Rgb = number[];
  const rgb = (hex: string): Rgb => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  const luminance = (channels: Rgb): number => {
    const [r, g, b] = channels.map((value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: Rgb, b: Rgb): number => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (light + 0.05) / (dark + 0.05);
  };
  /** color-mix in srgb mixes the channels as they are written; a colour
   * mixed with transparent is that colour at the share as its opacity. */
  const mix = (a: Rgb, b: Rgb, share: number): Rgb => a.map((value, index) => share * value + (1 - share) * (b[index] as number));
  /** The share of a rule's color-mix: `property: color-mix(in srgb, var(--x) N%, ...)`. */
  const share = (selector: string, property: string, variable: string): number => {
    const found = ownRule(selector, `${property}: color-mix\\(in srgb, var\\(${variable}\\) (\\d+)%`).exec(styleText());
    expect(found, `${selector} ${property}`).not.toBeNull();
    return Number(found?.[2]) / 100;
  };

  it("reach 4.5:1 with Home Assistant's default colours, light and dark", () => {
    const state = share("\\.state", "color", "--tone");
    for (const theme of THEMES) {
      // Accent and info, warning, success, error, the muted text.
      for (const tone of [theme.accent, "#039be5", "#ffa600", "#43a047", ERROR, theme.muted]) {
        expect(contrast(mix(rgb(tone), rgb(theme.text), state), rgb(theme.background)), `${tone} in ${theme.name}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("color the buttons' and the chosen options' texts the same way: 4.5:1 on their tints", () => {
    const sheet = styleText();
    const tonal = share("\\.btn", "color", "--bb-accent");
    const tonalTint = share("\\.btn", "background", "--bb-accent");
    const danger = share("\\.btn\\.danger", "color", "--bb-err");
    const dangerTint = share("\\.btn\\.danger", "background", "--bb-err");
    const chosen = share('\\.seg button\\[aria-checked="true"\\]', "color", "--bb-accent");
    const chosenTint = share('\\.seg button\\[aria-checked="true"\\]', "background", "--bb-accent");
    const tag = share("\\.heat-label \\.heat-tag", "color", "--bb-accent");
    const tagTint = share("\\.heat-label \\.heat-tag", "background", "--bb-accent");
    const chip = share("\\.chip", "color", "--tone");
    const chipTint = share("\\.chip", "background", "--tone");
    // The question's red button: the theme's red, darkened for its white text.
    const filled = share("\\.dlg-actions \\.btn\\.danger", "background", "--bb-err");
    expect(declarations(".dlg-actions .btn.danger", sheet)).toContain("color: #fff");
    // A text button has no tint of its own: the tonal button's colour.
    expect(sheet).toMatch(/\.btn\.plain\s*\{\s*background: none;\s*padding: 0 8px;\s*\}/);
    // The camera's panel is dark in every theme: its button stays white.
    expect(declarations(".live.failed .btn", sheet)).toContain("color: #fff");
    // The speeds' percentages read as their names do.
    expect(declarations(".seg.speeds .opt-sub", sheet)).toContain("opacity: 1");
    for (const theme of THEMES) {
      const [text, background, accent, muted] = [rgb(theme.text), rgb(theme.background), rgb(theme.accent), rgb(theme.muted)];
      // The segments and the heating section lie on a 5 % tint of the text colour.
      const tint = mix(text, background, 0.05);
      const pairs: [string, Rgb, Rgb][] = [
        ["tonal button", mix(accent, text, tonal), mix(accent, background, tonalTint)],
        ["text button", mix(accent, text, tonal), background],
        ["text button on a tint", mix(accent, text, tonal), tint],
        ["danger button", mix(rgb(ERROR), text, danger), mix(rgb(ERROR), background, dangerTint)],
        ["filled danger button", [255, 255, 255], mix(rgb(ERROR), [0, 0, 0], filled)],
        ["chosen option", mix(accent, text, chosen), mix(accent, tint, chosenTint)],
        ["active nozzle tag", mix(accent, text, tag), mix(accent, tint, tagTint)],
        ...["#43a047", "#ffa600", ERROR, theme.muted].map((tone): [string, Rgb, Rgb] => [`chip ${tone}`, mix(rgb(tone), text, chip), mix(rgb(tone), background, chipTint)]),
      ];
      // 2025.5's own secondary text reaches 4.4:1 on such a tint; today's 5.9:1.
      if (!theme.name.startsWith("2025.5 light")) pairs.push(["speed percentage", muted, tint]);
      for (const [name, foreground, behind] of pairs) expect(contrast(foreground, behind), `${name} in ${theme.name}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the dialogs", () => {
  it("stand out from the page in a dark theme: the theme's dialog surface, an edge, a darker backdrop", () => {
    const sheet = styleText();
    expect(sheet).toMatch(/(^|[}/])\s*dialog\s*\{[^}]*--bb-surface: var\(--ha-dialog-surface-background, var\(--mdc-theme-surface, var\(--card-background-color, #fff\)\)\);[^}]*background: var\(--bb-surface\);/);
    expect(sheet).toMatch(/(^|[}/])\s*dialog\s*\{[^}]*box-shadow:\s*0 0 0 1px var\(--bb-divider\),/);
    expect(declarations("dialog::backdrop", sheet)).toContain("background: rgba(0, 0, 0, 0.55)");
    // What lies on the dialog takes its surface, not the card's.
    expect(declarations(".select select", sheet)).toContain("background: var(--bb-surface)");
    expect(sheet).toMatch(/\.pal\[aria-checked="true"\]\s*\{[^}]*0 0 0 2px var\(--bb-surface\),/);
  });

  it("take up to 440 px, and the screen less 16 px a side where it is narrower: every dialog alike", () => {
    const sheet = styleText();
    expect(sheet).toMatch(/(^|[}/])\s*dialog\s*\{[^}]*max-width: min\(440px, calc\(100vw - 32px\)\);[^}]*width: 100%;/);
    // One rule for all of them: no dialog keeps a width of its own (the
    // menu is no dialog: it takes its items' width).
    const rules = [...sheet.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]*)\{([^{}]*)\}/g)].map(([, selector, body]): [string, string] => [selector?.trim() ?? "", body ?? ""]);
    const widths = rules.filter(([selector, body]) => /^dialog(\b|[.[:])/.test(selector) && !selector.includes("::backdrop") && /max-width/.test(body));
    expect(widths.map(([selector]) => selector)).toEqual(["dialog"]);
  });

  it("the tints and lines come from the theme's text colour itself, not from its rgb triple", () => {
    // Home Assistant computes --rgb-primary-text-color only from a theme's
    // own hex value: a theme naming its text colour by a variable keeps the
    // light default, dark grey under white text.
    const sheet = styleText();
    expect(sheet).not.toContain("--rgb-primary-text-color");
    expect(sheet).toMatch(/--bb-tint: color-mix\(in srgb, var\(--bb-text\) 5%, transparent\);/);
    expect(sheet).toMatch(/--bb-tint-2: color-mix\(in srgb, var\(--bb-text\) 9%, transparent\);/);
    expect(sheet).toMatch(/--bb-line: color-mix\(in srgb, var\(--bb-text\) 16%, transparent\);/);
  });

  it("and the menu are never see-through: the theme's colour at full strength, where the browser can take its alpha away", () => {
    const sheet = styleText();
    expect(sheet).toMatch(
      /@supports \(color: rgb\(from red r g b \/ 1\)\)\s*\{\s*dialog\s*\{[^}]*--bb-surface: rgb\(from var\(--ha-dialog-surface-background, var\(--mdc-theme-surface, var\(--card-background-color, #fff\)\)\) r g b \/ 1\);\s*\}\s*\.menu\s*\{[^}]*background: rgb\(from var\(--ha-card-background, var\(--card-background-color, #fff\)\) r g b \/ 1\);/,
    );
  });
});

describe("the layout of a narrow card and on a touch screen", () => {
  it("puts a notice's button below its text where both do not fit side by side", () => {
    const sheet = styleText();
    expect(declarations(".callout", sheet)).toContain("flex-wrap: wrap");
    // The text stays beside its icon on a half-width card too.
    expect(declarations(".callout > span", sheet)).toContain("flex: 1 1 150px");
    // On a phone, the button takes the notice's full width below the text.
    expect(atRule("@container (max-width: 400px)")).toMatch(ownRule("\\.callout \\.btn", "flex: 1 0 100%;[^}]*margin: 4px 0 0;"));
  });

  it("keeps the strip's chips readable in both themes", () => {
    // In a selector list with the model chip.
    expect(declarations(".ams-strip .ams-nozzle", styleText())).toEqual(expect.arrayContaining(["background: var(--bb-tint-2)", "color: color-mix(in srgb, var(--bb-muted) 50%, var(--bb-text))"]));
  });

  it("keeps the control view within a half-width card", () => {
    const sheet = styleText();
    const narrow = atRule("@container (max-width: 280px)");
    // One column: the step, the pad, the bed, the extruder.
    expect(narrow).toMatch(ownRule("\\.control", 'grid-template-areas: "step" "pad" "bed" "ext";'));
    expect(narrow).toMatch(ownRule("\\.pad", "grid-template-columns: repeat\\(3, 40px\\);[^}]*grid-template-rows: repeat\\(3, 40px\\);"));
    expect(narrow).toMatch(ownRule("\\.pad \\.btn", "width: 40px;[^}]*height: 40px;"));
    expect(declarations(".axis-col.bed", narrow)).toContain("flex-direction: row");
    // A heater's name and Off on a row, its steppers below with the whole
    // width: beside a thumb's 44 px Off they would shrink under 24 px.
    expect(narrow).toMatch(ownRule("\\.heat-name", "grid-column: 1;[^}]*grid-row: 1;"));
    expect(narrow).toMatch(ownRule("\\.heat-row \\.heat-off", "grid-column: 2;[^}]*grid-row: 1;"));
    // The place of a power symbol that cannot be used, beside it.
    expect(narrow).toMatch(ownRule("\\.heat-row \\.heat-off-space", "grid-column: 2;[^}]*grid-row: 1;"));
    expect(declarations(".heat-set", narrow)).toContain("grid-column: 1 / -1");
    expect(declarations(".heat-target", narrow)).toContain("min-width: 44px");
    // A heater's name wraps in whole words, never cut ("Right nozzle").
    expect(sheet).toMatch(ownRule("\\.heat-label \\.heat-text", "white-space: normal;[^}]*overflow: visible;[^}]*overflow-wrap: break-word;"));
    // A heating tile's target in the readable mix, its icon in the pure tone.
    expect(declarations(".temp.heating .temp-head .icon", sheet)).toContain("color: var(--bb-heat)");
    // A heater that is on, in the Control tab: its icon in the same tone.
    expect(declarations(".heat-name.on .heat-label .icon", sheet)).toContain("color: var(--bb-heat)");
    expect(declarations(".temp.heating .temp-target", sheet)).toContain("color: color-mix(in srgb, var(--bb-heat) 55%, var(--bb-text))");
    // Two temperature tiles a row.
    expect(declarations(".temps", narrow)).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    // After the step below 340 px, so that it wins.
    expect(sheet.indexOf("@container (max-width: 280px)")).toBeGreaterThan(sheet.indexOf("@container (max-width: 340px)"));
  });

  it("lets the drying row wrap: the state keeps its words, the hint a line of its own, the button at the right", () => {
    const sheet = styleText();
    expect(sheet).toMatch(ownRule("\\.drying", "display: flex;[^}]*flex-wrap: wrap;"));
    expect(declarations(".drying > span", sheet)).toContain("flex: 1 1 auto");
    expect(declarations(".drying > .btn", sheet)).toContain("margin-left: auto");
    expect(declarations(".drying > .dry-where", sheet)).toContain("flex: 1 0 100%");
    // A slot's sub line never widens the card.
    expect(declarations(".slots", sheet)).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("keeps every action within a half-width card on a phone (under 200 px)", () => {
    const tiny = atRule("@container (max-width: 200px)");
    // From 280 px down a slot's buttons below its name; from 260 px a
    // notice's button below its text, the job's words below its picture.
    const half = atRule("@container (max-width: 280px)");
    expect(declarations(".slot", half)).toContain("flex-wrap: wrap");
    expect(declarations(".slot-main", half)).toContain("flex: 1 0 100%");
    // The switch-off's row no longer indented beside the wrapped plug rows.
    expect(half).toMatch(ownRule("\\.p-auto,\\s*\\.p-set", "padding-left: 0;"));
    const narrow = atRule("@container (max-width: 260px)");
    // The backup's "Unknown" under its text.
    expect(declarations(".backup .det-row.choosing .det-text", narrow)).toContain("flex: 1 0 100%");
    expect(declarations(".callout .btn", narrow)).toContain("white-space: normal");
    expect(declarations(".callout > .icon", narrow)).toContain("display: none");
    // The name on a row of its own, whole words; the HMS line keeps its text.
    expect(declarations(".head", tiny)).toContain("flex-wrap: wrap");
    expect(tiny).toMatch(ownRule("\\.names", "flex: 1 0 100%;[^}]*order: -1;"));
    // The dot left, the light and the menu right, the chips under the name.
    expect(declarations(".head .dot", tiny)).toContain("margin-right: auto");
    // The job's words below its picture; one temperature a row.
    expect(declarations(".job", narrow)).toContain("flex-wrap: wrap");
    expect(declarations(".job-info", narrow)).toContain("flex: 1 0 100%");
    expect(tiny).toMatch(ownRule("\\.temps,\\s*\\.temps\\.n1,\\s*\\.temps\\.n2,\\s*\\.temps\\.n4,\\s*\\.temps\\.dual", "grid-template-columns: minmax\\(0, 1fr\\);"));
    // Controls and their labels wrap rather than leave the card.
    expect(narrow).toMatch(ownRule("\\.ctl-buttons \\.btn,\\s*\\.drying > \\.btn", "white-space: normal;"));
    expect(declarations(".nozzle-row", narrow)).toContain("flex-wrap: wrap");
    expect(declarations(".det-head", narrow)).toContain("flex-wrap: wrap");
    expect(declarations(".ext-buttons", narrow)).toContain("flex-direction: column");
    // The tabs as icons: their names, too long here, only for a screen
    // reader -- never cut or broken mid-word.
    expect(declarations(".tabs .tab-icon", tiny)).toContain("display: inline-flex");
    expect(tiny).toMatch(ownRule("\\.tabs \\.tab-text", "position: absolute;[^}]*clip: rect\\(0 0 0 0\\);"));
    expect(declarations(".tabs .tab-icon")).toContain("display: none");
    expect(tiny).not.toMatch(ownRule("\\.tabs button", "text-overflow: ellipsis;"));
    expect(declarations(".name", tiny)).toContain("overflow-wrap: break-word");
    expect(declarations(".hms-line-more", tiny)).toContain("display: none");
    const sheet = styleText();
    expect(sheet.indexOf("@container (max-width: 200px)")).toBeGreaterThan(sheet.indexOf("@container (max-width: 280px)"));
  });

  it("gives a thumb 44 px for the light, the menu and a heater's off button", () => {
    const touch = atRule("@media (pointer: coarse)");
    expect(touch).toMatch(ownRule("\\.head \\.icon-btn", "width: 44px;[^}]*height: 44px;"));
    expect(touch).toMatch(ownRule("\\.heat-row \\.btn\\.heat-off", "width: 44px;[^}]*height: 44px;[^}]*min-height: 44px;"));
    expect(touch).toMatch(ownRule("\\.heat-row \\.heat-off-space", "width: 44px;[^}]*height: 44px;"));
    // After the narrow card's smaller steppers, so that it wins there too.
    const sheet = styleText();
    expect(sheet.lastIndexOf("@media (pointer: coarse)")).toBeGreaterThan(sheet.indexOf("@container (max-width: 280px)"));
    // Beside them the name takes its own row from 220 px down, in whole words.
    expect(sheet.slice(sheet.lastIndexOf("@media (pointer: coarse)"))).toMatch(
      /@container \(max-width: 220px\)\s*\{[^@]*\.names\s*\{[^}]*flex: 1 0 100%;[^}]*order: -1;/,
    );
  });
});

describe("a switch that is off", () => {
  it("has an edge in the muted colour, 3:1 and more against its box; on, the accent alone", () => {
    const sheet = styleText();
    expect(declarations(".toggle", sheet)).toContain("box-shadow: inset 0 0 0 1px var(--bb-muted)");
    expect(declarations(".det-switch[aria-checked=\"true\"] .toggle", sheet)).toContain("box-shadow: none");
  });
});

describe("the inventory's filters on a narrow phone", () => {
  it("keep each select to its column: a select takes its longest option's width by itself", () => {
    expect(declarations(".inv-filters .select")).toContain("width: 100%");
  });
});
