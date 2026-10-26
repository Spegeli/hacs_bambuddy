import { afterEach, describe, expect, it } from "vitest";

import { changedConfig, configForm, DEFAULTS, editorData, settingsOf, startViewNote, validateConfig } from "../src/forms";
import { de } from "../src/translations/de";
import { en } from "../src/translations/en";
import type { HeaderChip } from "../src/types";
import { makeHass } from "./fixtures";

afterEach(() => {
  document.body.innerHTML = "";
});

const TYPE = "custom:bambuddy-printer-card";

describe("the configuration check", () => {
  it("accepts every option the card documents", () => {
    const config = {
      type: TYPE,
      printer: "dev-x1c",
      camera: "always",
      status_blocks: ["fans", "controls"],
      header_chips: ["hms"],
      start_view: "filament",
      show_control_tab: false,
      control_sections: ["motion", "heating"],
      read_only: true,
      show_filament_tab: false,
      ams_folding: "folded",
    };
    expect(validateConfig(config)).toEqual(config);
  });

  it("reads camera: off as off: YAML makes it false", () => {
    expect(validateConfig({ type: TYPE, camera: false }).camera).toBe("off");
    expect(() => validateConfig({ type: TYPE, camera: true })).toThrowError(/Invalid value for “camera”: true/);
  });

  it("ignores unknown keys and options left empty", () => {
    expect(validateConfig({ type: TYPE, camera: null, future: 1 })).toEqual({ type: TYPE, future: 1 });
  });

  it("drops a value a list names twice, and keeps an empty list", () => {
    expect(validateConfig({ type: TYPE, status_blocks: ["fans", "ams", "fans"] })).toEqual({ type: TYPE, status_blocks: ["fans", "ams"] });
    expect(validateConfig({ type: TYPE, header_chips: [] })).toEqual({ type: TYPE, header_chips: [] });
  });

  it("refuses an invalid value with a reason Home Assistant shows", () => {
    expect(() => validateConfig({ camera: "sometimes" })).toThrowError("Invalid value for “camera”: \"sometimes\". Allowed: tap, always, off.");
    expect(() => validateConfig({ read_only: "yes" })).toThrowError("Invalid value for “read_only”: \"yes\". Allowed: true, false.");
    expect(() => validateConfig({ printer: 5 })).toThrowError("Invalid value for “printer”: 5. Allowed: the ID of a printer device.");
    expect(() => validateConfig({ status_blocks: ["fans", "camera"] })).toThrowError(
      "Invalid value for “status_blocks”: [\"fans\",\"camera\"]. Allowed: a list of controls, power, temperatures, ams, fans, speed.",
    );
    expect(() => validateConfig({ header_chips: "hms" })).toThrowError("Invalid value for “header_chips”: \"hms\". Allowed: a list of network, hms, firmware, maintenance, door, storage, drying, power.");
    expect(() => validateConfig({ control_sections: [1] })).toThrowError(/Allowed: a list of heating, options, motion\./);
    expect(() => validateConfig({ start_view: "camera" })).toThrowError("Invalid value for “start_view”: \"camera\". Allowed: status, control, filament.");
    expect(() => validateConfig({ ams_folding: true })).toThrowError("Invalid value for “ams_folding”: true. Allowed: auto, folded, open.");
    expect(() => validateConfig(null)).toThrowError(/Invalid value for “type”/);
    expect(() => validateConfig([])).toThrowError(/Invalid value for “type”/);
    expect(() => validateConfig("x")).toThrowError(/Invalid value for “type”/);
  });

  it("gives the reason in Home Assistant's language", () => {
    const root = document.createElement("home-assistant") as HTMLElement & { hass?: unknown };
    root.hass = makeHass({ language: "de" });
    document.body.append(root);
    expect(() => validateConfig({ camera: "x" })).toThrowError("Ungültiger Wert für „camera“: \"x\". Erlaubt: tap, always, off.");
    expect(() => validateConfig({ status_blocks: ["x"] })).toThrowError(/Erlaubt: eine Liste aus controls, power, temperatures, ams, fans, speed\./);
  });
});

describe("the settings", () => {
  it("fill in what the configuration leaves out", () => {
    expect(settingsOf({ type: TYPE })).toEqual({
      camera: "tap",
      blocks: ["controls", "power", "temperatures", "ams", "fans", "speed"],
      chips: ["network", "hms", "firmware"],
      startView: "status",
      controlTab: true,
      sections: ["heating", "options", "motion"],
      readOnly: false,
      filamentTab: true,
      amsFolding: "auto",
      showAutoOff: true,
    });
    expect(DEFAULTS.blocks).toEqual(["controls", "power", "temperatures", "ams", "fans", "speed"]);
  });

  it("take what the configuration says, an empty list included", () => {
    const settings = settingsOf({ type: TYPE, camera: "off", status_blocks: [], header_chips: ["firmware"], read_only: true, ams_folding: "open" });
    expect(settings.camera).toBe("off");
    expect(settings.blocks).toEqual([]);
    expect(settings.chips).toEqual(["firmware"]);
    expect(settings.readOnly).toBe(true);
    expect(settings.amsFolding).toBe("open");
  });

});

describe("what the editor shows and writes", () => {
  it("shows every option's default where the configuration has none", () => {
    expect(editorData({ type: TYPE, printer: "dev-x1c", camera: "off", header_chips: [] })).toEqual({
      type: TYPE,
      printer: "dev-x1c",
      camera: "off",
      status_blocks: ["controls", "power", "temperatures", "ams", "fans", "speed"],
      header_chips: [],
      start_view: "status",
      show_control_tab: true,
      control_sections: ["heating", "options", "motion"],
      read_only: false,
      show_filament_tab: true,
      ams_folding: "auto",
      show_auto_off: true,
    });
    // A copy each time: a saved card never shares the defaults' lists.
    expect(editorData({ type: TYPE })["status_blocks"]).not.toBe(DEFAULTS.blocks);
  });

  it("writes only what the user changed: a list left out stays out until the user edits it", () => {
    const config = { type: TYPE, printer: "dev-x1c", grid_options: { columns: 6 } };
    const shown = editorData(config);
    // A chip hidden: the list is written as the editor shows it now.
    expect(changedConfig(config, shown, { ...shown, header_chips: ["network", "firmware"] })).toEqual({ ...config, header_chips: ["network", "firmware"] });
    expect(changedConfig(config, shown, { ...shown, read_only: true })).toEqual({ ...config, read_only: true });
    // An option emptied goes; the keys the editor does not know stay.
    expect(changedConfig(config, shown, { ...shown, printer: undefined })).toEqual({ type: TYPE, grid_options: { columns: 6 } });
    // Nothing changed: nothing written.
    expect(changedConfig(config, shown, { ...shown })).toEqual(config);
  });

  it("leaves out an option the user set back to its default: undo is undo", () => {
    const config = { type: TYPE, printer: "dev-x1c", header_chips: ["network", "hms"] as HeaderChip[], camera: "off" as const };
    const shown = editorData(config);
    expect(changedConfig(config, shown, { ...shown, header_chips: ["network", "hms", "firmware"] })).toEqual({ type: TYPE, printer: "dev-x1c", camera: "off" });
    expect(changedConfig(config, shown, { ...shown, camera: "tap" })).toEqual({ type: TYPE, printer: "dev-x1c", header_chips: ["network", "hms"] });
    // The default in another order is no default.
    expect(changedConfig(config, shown, { ...shown, header_chips: ["hms", "network", "firmware"] })).toMatchObject({ header_chips: ["hms", "network", "firmware"] });
  });

  it("writes a list emptied to its last chip as an empty list: a card with the job alone", () => {
    const config = { type: TYPE, printer: "dev-x1c" };
    const shown = editorData(config);
    expect(changedConfig(config, shown, { ...shown, status_blocks: [] })).toEqual({ ...config, status_blocks: [] });
    expect(settingsOf(validateConfig({ ...config, status_blocks: [] })).blocks).toEqual([]);
  });

  it("leaves the configuration Home Assistant froze as it was", () => {
    const config = Object.freeze({ type: TYPE, printer: "dev-x1c", header_chips: Object.freeze(["hms"]) as ["hms"] });
    const shown = editorData(config);
    const next = changedConfig(config, shown, { ...shown, read_only: true });
    expect(next).toEqual({ ...config, read_only: true });
    expect(config).toEqual({ type: TYPE, printer: "dev-x1c", header_chips: ["hms"] });
  });

  it("fills in a default for every field of the form", () => {
    const flat = (fields: readonly Record<string, unknown>[]): string[] =>
      fields.flatMap((field) => (Array.isArray(field["schema"]) ? flat(field["schema"] as Record<string, unknown>[]) : [field["name"] as string]));
    const fields = flat(configForm().schema).filter((name) => name !== "printer");
    // An option the form shows without a default would show an empty field.
    expect(Object.keys(editorData({ type: TYPE })).filter((name) => name !== "type").sort()).toEqual([...fields].sort());
  });
});

describe("the start tab's note", () => {
  it("says when the chosen tab is hidden: the card opens on Status", () => {
    const shown = (config: Record<string, unknown>): Record<string, unknown> => editorData({ type: TYPE, ...config });
    expect(startViewNote(undefined, shown({ start_view: "control", show_control_tab: false }))).toBe(
      "Warning: the “Control” tab is hidden. The card opens on “Status”.",
    );
    expect(startViewNote(makeHass({ language: "de" }), shown({ start_view: "filament", show_filament_tab: false }))).toBe(
      "Achtung: Der Tab „Filament“ ist ausgeblendet. Die Karte öffnet mit „Status“.",
    );
    // A tab that shows, or Status: nothing to say.
    expect(startViewNote(undefined, shown({ start_view: "control" }))).toBeUndefined();
    expect(startViewNote(undefined, shown({ start_view: "control", show_filament_tab: false }))).toBeUndefined();
    expect(startViewNote(undefined, shown({ show_control_tab: false }))).toBeUndefined();
    // No section of the Control tab, or Hide controls with only the axes
    // (they go then): no Control tab either. Hide controls alone keeps it.
    const hidden = "Warning: the “Control” tab is hidden. The card opens on “Status”.";
    expect(startViewNote(undefined, shown({ start_view: "control", read_only: true }))).toBeUndefined();
    expect(startViewNote(undefined, shown({ start_view: "control", read_only: true, control_sections: ["motion"] }))).toBe(hidden);
    expect(startViewNote(undefined, shown({ start_view: "control", control_sections: [] }))).toBe(hidden);
  });
});

describe("the visual editor", () => {
  it("shows the printer, then four folded groups that keep the keys flat", () => {
    const form = configForm();
    expect(form.schema.map((field) => [field.name, field["type"], field["title"]])).toEqual([
      ["printer", undefined, undefined],
      ["", "expandable", "General"],
      ["", "expandable", "Status"],
      ["", "expandable", "Control"],
      ["", "expandable", "Filament"],
    ]);
    expect(form.schema[0]).toEqual({
      name: "printer",
      required: true,
      selector: { device: { filter: { integration: "bambuddy" }, entity: { integration: "bambuddy", domain: "sensor", device_class: "enum" } } },
    });
    const names = (index: number): unknown[] => (form.schema[index]?.["schema"] as { name: string }[]).map((field) => field.name);
    // General: what works in every tab.
    expect(names(1)).toEqual(["start_view", "camera", "header_chips", "read_only"]);
    expect(names(2)).toEqual(["status_blocks", "show_auto_off"]);
    expect(names(3)).toEqual(["show_control_tab", "control_sections"]);
    expect(names(4)).toEqual(["show_filament_tab", "ams_folding"]);
  });

  it("lets the blocks, the chips and the control sections be ordered by dragging", () => {
    const form = configForm();
    const field = (name: string): Record<string, unknown> =>
      form.schema.flatMap((group) => (group["schema"] as Record<string, unknown>[] | undefined) ?? []).find((item) => item["name"] === name) as Record<string, unknown>;
    expect(field("status_blocks")).toEqual({
      name: "status_blocks",
      selector: {
        select: {
          multiple: true,
          reorder: true,
          options: [
            { value: "controls", label: "Print controls" },
            { value: "power", label: "Power" },
            { value: "temperatures", label: "Temperatures" },
            { value: "ams", label: "AMS and filament" },
            { value: "fans", label: "Fans" },
            { value: "speed", label: "Print speed" },
          ],
        },
      },
    });
    expect(field("control_sections")["selector"]).toEqual({
      select: {
        multiple: true,
        reorder: true,
        options: [
          { value: "heating", label: "Heating and ventilation" },
          { value: "options", label: "Print options" },
          { value: "motion", label: "Axes and extruder" },
        ],
      },
    });
    // Home Assistant draws a list of fewer than six options without reorder
    // as checkboxes, which a label that says "Add chip" does not fit.
    expect(field("header_chips")["selector"]).toEqual({
      select: {
        multiple: true,
        reorder: true,
        options: [
          { value: "network", label: "Network" },
          { value: "hms", label: "HMS" },
          { value: "firmware", label: "Firmware" },
          { value: "maintenance", label: "Maintenance" },
          { value: "door", label: "Door" },
          { value: "storage", label: "SD card / USB drive" },
          { value: "drying", label: "Drying" },
          { value: "power", label: "Power" },
        ],
      },
    });
    // A dropdown with a default has no × to empty it: it is required.
    expect(field("start_view")).toEqual({
      name: "start_view",
      required: true,
      selector: {
        select: {
          mode: "dropdown",
          options: [
            { value: "status", label: "Status" },
            { value: "control", label: "Control" },
            { value: "filament", label: "Filament" },
          ],
        },
      },
    });
    expect(field("camera")["required"]).toBe(true);
    expect(field("ams_folding")["required"]).toBe(true);
    expect(field("camera")["selector"]).toEqual({
      select: {
        mode: "dropdown",
        options: [
          { value: "tap", label: "On tap" },
          { value: "always", label: "Always" },
          { value: "off", label: "Never" },
        ],
      },
    });
    expect(field("ams_folding")["selector"]).toEqual({
      select: {
        mode: "dropdown",
        options: [
          { value: "auto", label: "Automatic (folded from 3)" },
          { value: "folded", label: "Folded" },
          { value: "open", label: "Unfolded" },
        ],
      },
    });
    // The switches show their value: the editor hands every default over.
    expect(field("show_control_tab")).toEqual({ name: "show_control_tab", selector: { boolean: {} } });
    expect(field("read_only")).toEqual({ name: "read_only", selector: { boolean: {} } });
    expect(field("show_filament_tab")).toEqual({ name: "show_filament_tab", selector: { boolean: {} } });
  });

  it("labels and explains its fields", () => {
    const form = configForm();
    expect(form.computeLabel({ name: "printer" })).toBe("Printer");
    expect(form.computeLabel({ name: "status_blocks" })).toBe("Add section");
    expect(form.computeLabel({ name: "read_only" })).toBe("Hide controls");
    expect(form.computeLabel({ name: "" })).toBeUndefined();
    expect(form.computeHelper({ name: "printer" })).toBe("A printer of the BamBuddy integration, not an AMS unit.");
    // Each list's help says first which list it is.
    expect(form.computeHelper({ name: "status_blocks" })).toBe(
      "The sections of the “Status” tab below the print job. Drag a section where you want it; × hides it. Print controls and print speed show only during a print, Power only when BamBuddy links a plug to the printer.",
    );
    expect(form.computeHelper({ name: "start_view" })).toBeUndefined();
    expect(form.computeLabel({ name: "header_chips" })).toBe("Add chip");
    expect(form.computeHelper({ name: "header_chips" })).toBe(
      "The chips below the name. Drag a chip where you want it; × hides it. Door, SD card / USB drive and drying appear only while the door is open, the storage is missing or an AMS dries; Power only with a smart plug. An HMS error always shows.",
    );
    expect(form.computeHelper({ name: "control_sections" })).toBe("The sections of the “Control” tab. Drag a section where you want it; × hides it.");
    expect(form.computeHelper({ name: "read_only" })).toBe(
      "Shows the printer only: the light, heating, ventilation and the print options as states, without buttons; the print and filament buttons, drying, the plugs' switches, and the axes and extruder go. No lock: actions, automations and the device page still control it.",
    );
  });

  it("speaks Home Assistant's language", () => {
    const root = document.createElement("home-assistant") as HTMLElement & { hass?: unknown };
    root.hass = makeHass({ language: "de" });
    document.body.append(root);
    const form = configForm();
    expect(form.computeLabel({ name: "camera" })).toBe("Livebild");
    expect(form.computeLabel({ name: "ams_folding" })).toBe("AMS-Einheiten");
    expect(form.computeLabel({ name: "header_chips" })).toBe("Chip hinzufügen");
    expect(form.computeLabel({ name: "read_only" })).toBe("Steuerelemente ausblenden");
    expect(form.computeHelper({ name: "header_chips" })).toBe(
      "Die Chips unter dem Namen. Ziehe einen Chip an die gewünschte Stelle; × blendet ihn aus. Tür, SD-Karte / USB-Stick und Trocknen erscheinen nur, wenn die Tür offen ist, der Speicher fehlt oder ein AMS trocknet; Strom nur mit einer Steckdose. Eine HMS-Fehlermeldung zeigt die Karte immer.",
    );
    expect(form.computeHelper({ name: "control_sections" })).toBe("Die Bereiche im Tab „Steuerung“. Ziehe einen Bereich an die gewünschte Stelle; × blendet ihn aus.");
    expect(form.computeHelper({ name: "read_only" })).toBe(
      "Zeigt den Drucker nur an: Licht, Heizen, Lüften und Druckoptionen als Zustand, ohne Knöpfe; Druck- und Filamentknöpfe, Trocknen, die Schalter der Steckdosen sowie Achsen und Extruder fallen weg. Keine Sperre: Aktionen, Automationen und die Geräteseite steuern ihn weiter.",
    );
    expect(form.computeHelper({ name: "status_blocks" })).toBe(
      "Die Bereiche im Tab „Status“ unter dem Druckauftrag. Ziehe einen Bereich an die gewünschte Stelle; × blendet ihn aus. Drucksteuerung und Druckgeschwindigkeit erscheinen nur während eines Drucks, Strom nur, wenn BamBuddy dem Drucker eine Steckdose zuordnet.",
    );
    // Each toggle's text says what it does.
    expect(form.computeHelper({ name: "show_control_tab" })).toBe("Blendet den Tab mit Heizen und Lüften, Druckoptionen, Achsen und Extruder ein oder aus.");
    expect(form.computeHelper({ name: "show_filament_tab" })).toBe(
      "Blendet den Tab mit den AMS-Einheiten und der externen Spule ein oder aus – zum Laden, Entladen, Festlegen und Trocknen des Filaments.",
    );
    expect(form.computeLabel({ name: "show_auto_off" })).toBe("Zeile „Nach dem Druck ausschalten“");
    expect(form.computeHelper({ name: "show_auto_off" })).toBe(
      "Blendet im Bereich „Strom“ und im Dialog des Strom-Chips die Zeile unter der Steckdose des Druckers ein oder aus. Mit ihr lässt sich wählen, ob sich der Drucker nach dem Druck von selbst ausschaltet. Ist die Zeile ausgeblendet, schaltet er trotzdem aus, wenn es so eingestellt ist.",
    );
    expect(JSON.stringify(form.schema)).toContain("Automatisch (ab 3 eingeklappt)");
    expect(form.schema[1]?.["title"]).toBe("Allgemein");
    expect(form.schema[3]?.["title"]).toBe("Steuerung");
    expect(JSON.stringify(form.schema)).toContain("Nach Antippen");
    expect(JSON.stringify(form.schema)).toContain('{"value":"always","label":"Immer"}');
    expect(form.computeLabel({ name: "camera" })).toBe("Livebild");
    expect(form.computeHelper({ name: "camera" })).toBe(
      "Nach Antippen: Ein Tipp aufs Kamera-Symbol am Bild startet es. Immer: Es läuft, solange das Dashboard offen ist, und braucht dauernd Bandbreite. Nie: nur das Bild des Druckauftrags.",
    );
    expect(JSON.stringify(form.schema)).toContain("Drucksteuerung");
    // Given a hass, its language.
    expect(configForm(makeHass({ language: "en" })).computeLabel({ name: "camera" })).toBe("Live view");
    expect(configForm(makeHass({ language: "en" })).computeHelper({ name: "camera" })).toBe(
      "On tap: a tap on the camera symbol on the picture starts it. Always: it runs while the dashboard is open, using bandwidth all the time. Never: only the job's picture.",
    );
  });
});

describe("every field of the editor", () => {
  // Each field by its own label and help: a swapped or wrong text shows here.
  const FIELDS = {
    printer: ["editor_printer", "editor_printer_help"],
    camera: ["editor_camera", "editor_camera_help"],
    status_blocks: ["editor_blocks", "editor_blocks_help"],
    header_chips: ["editor_chips", "editor_chips_help"],
    start_view: ["editor_start_view", undefined],
    show_control_tab: ["editor_control_tab", "editor_control_tab_help"],
    control_sections: ["editor_sections", "editor_sections_help"],
    read_only: ["editor_read_only", "editor_read_only_help"],
    show_filament_tab: ["editor_filament_tab", "editor_filament_tab_help"],
    ams_folding: ["editor_ams_folding", "editor_ams_folding_help"],
    show_auto_off: ["editor_show_auto_off", "editor_show_auto_off_help"],
  } as const;

  it("has its own label and help, in English", () => {
    const form = configForm();
    for (const [name, [label, help]] of Object.entries(FIELDS)) {
      expect(form.computeLabel({ name }), name).toBe(en[label]);
      expect(form.computeHelper({ name }), name).toBe(help ? en[help] : undefined);
    }
    expect(new Set(Object.values(FIELDS).map(([label]) => en[label])).size).toBe(10);
  });

  it("has its German label", () => {
    const root = document.createElement("home-assistant") as HTMLElement & { hass?: unknown };
    root.hass = makeHass({ language: "de" });
    document.body.append(root);
    const form = configForm();
    for (const [name, [label]] of Object.entries(FIELDS)) expect(form.computeLabel({ name }), name).toBe(de[label]);
  });
});
