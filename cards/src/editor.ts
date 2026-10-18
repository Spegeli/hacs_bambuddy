// The card's visual editor: Home Assistant's own form (ha-form) with the
// card's fields (forms.ts), filled with what applies -- each option's
// default where the configuration has none --, so its lists and dropdowns
// show what the card shows. It writes back only what the user changed: a
// list the YAML leaves out stays out until the user edits it.
import { css, html, LitElement, nothing, type TemplateResult } from "lit";

import { changedConfig, configForm, editorData, startViewNote, validateConfig, type ConfigForm } from "./forms";
import { languageOf, t } from "./i18n";
import type { Hass } from "./types";

export const EDITOR_TAG = "bambuddy-printer-card-editor";

/** Home Assistant's form element. */
const FORM = "ha-form";

/** How long the editor waits for Home Assistant to load its form. */
const FORM_TIMEOUT = 5_000;

interface CardHelpers {
  createCardElement: (config: Record<string, unknown>) => unknown;
}

/** Makes Home Assistant load its form where nothing has yet: a custom
 * card's editor may be the first one opened, and Home Assistant loads the
 * form with its own editors only. Its button card's editor brings it (2025.5
 * on), so the card helpers make a button card and ask for that editor, as
 * custom cards commonly do. Whether the form is there, at the latest after
 * `timeout` ms. */
export async function loadForm(timeout = FORM_TIMEOUT): Promise<boolean> {
  const registry = window.customElements;
  if (registry.get(FORM)) return true;
  const load = async (): Promise<void> => {
    const helpers = await (window as { loadCardHelpers?: () => Promise<CardHelpers> }).loadCardHelpers?.();
    const card = (await helpers?.createCardElement({ type: "button" })) as { constructor?: { getConfigElement?: () => unknown } } | undefined;
    await card?.constructor?.getConfigElement?.();
  };
  // Without the form the editor says to use the code editor, which works.
  load().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeout);
  });
  const found = await Promise.race([registry.whenDefined(FORM).then(() => true), late]);
  clearTimeout(timer);
  return found;
}

export class BamBuddyPrinterCardEditor extends LitElement {
  static override properties = {
    hass: { attribute: false },
    shown: { state: true },
    formReady: { state: true },
  };

  static override styles = css`
    .unavailable {
      margin: 0;
      padding: 8px 0;
      color: var(--secondary-text-color);
    }
  `;

  hass?: Hass;
  /** What the editor shows: the configuration with every default. */
  protected shown?: Record<string, unknown>;
  protected formReady = window.customElements.get(FORM) !== undefined;
  /** The configuration as Home Assistant handed it over: written back with
   * the user's changes only. */
  private config?: Record<string, unknown>;
  private form?: { language: string; form: ConfigForm };

  /** A configuration the editor cannot show throws: Home Assistant then
   * opens the code editor and shows the reason. */
  setConfig(config: unknown): void {
    this.shown = editorData(validateConfig(config));
    this.config = config as Record<string, unknown>;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // The form may come later, loaded by something else.
    if (!this.formReady) void window.customElements.whenDefined(FORM).then(() => (this.formReady = true));
  }

  /** The fields in the user's language, made once per language. */
  private fields(): ConfigForm {
    const language = languageOf(this.hass);
    if (this.form?.language !== language) this.form = { language, form: configForm(this.hass) };
    return this.form.form;
  }

  /** The fields' help -- the start tab's says when the chosen tab is hidden.
   * Read at each draw: a switch in another group changes it. */
  private readonly helper = (field: { name: string }): string | undefined =>
    (field.name === "start_view" ? startViewNote(this.hass, this.shown ?? {}) : undefined) ?? this.fields().computeHelper(field);

  private readonly changed = (event: Event): void => {
    const value = (event as CustomEvent<{ value: Record<string, unknown> }>).detail.value;
    const config = changedConfig(this.config as Record<string, unknown>, this.shown as Record<string, unknown>, value);
    this.setConfig(config);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  };

  protected override render(): TemplateResult | typeof nothing {
    if (!this.shown) return nothing;
    if (!this.formReady) return html`<p class="unavailable">${t(this.hass, "editor_unavailable")}</p>`;
    const { schema, computeLabel } = this.fields();
    return html`<ha-form
      .hass=${this.hass}
      .data=${this.shown}
      .schema=${schema}
      .computeLabel=${computeLabel}
      .computeHelper=${this.helper}
      @value-changed=${this.changed}
    ></ha-form>`;
  }
}
