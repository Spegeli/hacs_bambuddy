// The card's visual editor with a stand-in for Home Assistant's form: an
// element that takes the same properties and fires value-changed. The tests
// run in order -- the first two before the form is defined.
import { afterEach, describe, expect, it } from "vitest";

import "../src/index";
import { BamBuddyPrinterCard } from "../src/card";
import { EDITOR_TAG, loadForm } from "../src/editor";
import { configForm, editorData } from "../src/forms";
import { makeHass, x1c } from "./fixtures";
import { text } from "./helpers";

interface FormField {
  name: string;
  [key: string]: unknown;
}

/** Home Assistant's ha-form, as far as the editor uses it. */
class FormStandIn extends HTMLElement {
  hass?: unknown;
  data?: Record<string, unknown>;
  schema?: FormField[];
  computeLabel?: (field: FormField) => string | undefined;
  computeHelper?: (field: FormField) => string | undefined;

  /** The user changes a field: the form hands all its data over. */
  change(name: string, value: unknown): void {
    this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: { ...this.data, [name]: value } }, bubbles: true, composed: true }));
  }
}

interface Editor extends HTMLElement {
  hass?: unknown;
  setConfig(config: unknown): void;
  updateComplete: Promise<boolean>;
}

const TYPE = "custom:bambuddy-printer-card";

async function mountEditor(config: Record<string, unknown>, language = "en"): Promise<Editor> {
  await customElements.whenDefined(EDITOR_TAG);
  const editor = document.createElement(EDITOR_TAG) as Editor;
  editor.setConfig({ type: TYPE, ...config });
  editor.hass = makeHass({ devices: x1c(), language });
  document.body.append(editor);
  await editor.updateComplete;
  return editor;
}

const formOf = (editor: Editor): FormStandIn => editor.shadowRoot?.querySelector("ha-form") as FormStandIn;

afterEach(() => {
  document.body.innerHTML = "";
  delete (window as { loadCardHelpers?: unknown }).loadCardHelpers;
});

describe("the visual editor before Home Assistant's form is there", () => {
  it("says to use the code editor when the form does not load in time", async () => {
    await expect(loadForm(20)).resolves.toBe(false);
    // Card helpers that fail change nothing.
    (window as { loadCardHelpers?: unknown }).loadCardHelpers = async () => {
      throw new Error("no helpers");
    };
    await expect(loadForm(20)).resolves.toBe(false);
    const editor = await mountEditor({ printer: "dev-x1c" });
    expect(formOf(editor)).toBeNull();
    expect(text(editor.shadowRoot)).toBe("The visual editor did not load. Edit the card in the code editor (“Show code editor”).");
    const german = await mountEditor({ printer: "dev-x1c" }, "de");
    expect(text(german.shadowRoot)).toBe("Der visuelle Editor wurde nicht geladen. Bearbeite die Karte im Code-Editor („Code-Editor anzeigen“).");
  });

  it("has Home Assistant load its form the way its own cards do, and draws it once it is there", async () => {
    const editor = await mountEditor({ printer: "dev-x1c" });
    const created: unknown[] = [];
    // The card helpers make a button card, whose editor brings the form.
    (window as { loadCardHelpers?: unknown }).loadCardHelpers = async () => ({
      createCardElement: (config: unknown) => {
        created.push(config);
        return {
          constructor: {
            getConfigElement: async () => {
              customElements.define("ha-form", FormStandIn);
            },
          },
        };
      },
    });
    await expect(loadForm()).resolves.toBe(true);
    expect(created).toEqual([{ type: "button" }]);
    await editor.updateComplete;
    expect(formOf(editor)).not.toBeNull();
  });
});

describe("the visual editor", () => {
  it("is what the card hands Home Assistant, once the form is there", async () => {
    await expect(loadForm()).resolves.toBe(true);
    const editor = (await BamBuddyPrinterCard.getConfigElement()) as Editor;
    expect(editor.localName).toBe(EDITOR_TAG);
  });

  it("shows Home Assistant's form with the card's fields, every option's default filled in", async () => {
    const editor = await mountEditor({ printer: "dev-x1c", camera: "off" });
    const form = formOf(editor);
    expect(form.data).toEqual(editorData({ type: TYPE, printer: "dev-x1c", camera: "off" }));
    expect(form.data?.["header_chips"]).toEqual(["network", "hms", "firmware"]);
    expect(form.schema).toEqual(configForm().schema);
    expect(form.computeLabel?.({ name: "header_chips" })).toBe("Add chip");
    expect(form.computeHelper?.({ name: "printer" })).toBe("A printer of the BamBuddy integration, not an AMS unit.");
    expect(form.hass).toBe(editor.hass);
  });

  it("speaks the user's language", async () => {
    const editor = await mountEditor({ printer: "dev-x1c" }, "de");
    expect(formOf(editor).computeLabel?.({ name: "header_chips" })).toBe("Chip hinzufügen");
    expect(formOf(editor).schema?.[1]?.["title"]).toBe("Allgemein");
    expect(formOf(editor).schema?.[2]?.["title"]).toBe("Status");
    expect(formOf(editor).schema?.[3]?.["title"]).toBe("Steuerung");
  });

  it("follows the user's language when it changes after the first draw", async () => {
    const editor = await mountEditor({ printer: "dev-x1c" });
    expect(formOf(editor).computeLabel?.({ name: "header_chips" })).toBe("Add chip");
    editor.hass = makeHass({ devices: x1c(), language: "de" });
    await editor.updateComplete;
    expect(formOf(editor).computeLabel?.({ name: "header_chips" })).toBe("Chip hinzufügen");
  });

  it("writes back only what the user changed", async () => {
    const editor = await mountEditor({ printer: "dev-x1c", camera: null, grid_options: { columns: 6 } });
    const changes: unknown[] = [];
    editor.addEventListener("config-changed", (event) => changes.push((event as CustomEvent<{ config: unknown }>).detail.config));
    // Hiding one chip hides that one: the list is written as shown.
    formOf(editor).change("header_chips", ["network", "firmware"]);
    expect(changes.at(-1)).toEqual({ type: TYPE, printer: "dev-x1c", camera: null, grid_options: { columns: 6 }, header_chips: ["network", "firmware"] });
    await editor.updateComplete;
    // The form shows the change, and the next one builds on it.
    expect(formOf(editor).data?.["header_chips"]).toEqual(["network", "firmware"]);
    formOf(editor).change("read_only", true);
    expect(changes.at(-1)).toEqual({ type: TYPE, printer: "dev-x1c", camera: null, grid_options: { columns: 6 }, header_chips: ["network", "firmware"], read_only: true });
  });

  it("keeps every tab to choose to open on, and says below it when the chosen one is hidden", async () => {
    const editor = await mountEditor({ printer: "dev-x1c", start_view: "control" });
    const form = formOf(editor);
    expect(form.computeHelper?.({ name: "start_view" })).toBeUndefined();
    // The Control tab switched off: the choice stays, its help warns.
    form.change("show_control_tab", false);
    await editor.updateComplete;
    expect(formOf(editor).data?.["start_view"]).toBe("control");
    expect(formOf(editor).computeHelper?.({ name: "start_view" })).toBe("Warning: the “Control” tab is hidden. The card opens on “Status”.");
    // Switched on again: the warning goes, the choice is still there.
    formOf(editor).change("show_control_tab", true);
    await editor.updateComplete;
    expect(formOf(editor).computeHelper?.({ name: "start_view" })).toBeUndefined();
    expect(formOf(editor).data?.["start_view"]).toBe("control");
    // The other fields keep their help.
    expect(formOf(editor).computeHelper?.({ name: "camera" })).toBe(configForm().computeHelper({ name: "camera" }));
  });

  it("hands a configuration it cannot show to the code editor, with the reason", async () => {
    await customElements.whenDefined(EDITOR_TAG);
    const editor = document.createElement(EDITOR_TAG) as Editor;
    expect(() => editor.setConfig({ type: TYPE, camera: "never" })).toThrowError(/Invalid value for “camera”/);
  });

  it("draws nothing before it has its configuration", async () => {
    await customElements.whenDefined(EDITOR_TAG);
    const editor = document.createElement(EDITOR_TAG) as Editor;
    document.body.append(editor);
    await editor.updateComplete;
    expect(editor.shadowRoot?.querySelector("ha-form, p")).toBeNull();
  });
});
