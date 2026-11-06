// Configuration: what setConfig accepts, the settings the card draws from
// it -- each option its default where the configuration has none --, and
// what the visual editor (editor.ts) shows and writes back.
import { t, type TextKey } from "./i18n";
import {
  AMS_FOLDING,
  CAMERA_MODES,
  CONTROL_SECTIONS,
  DEFAULT_CHIPS,
  HEADER_CHIPS,
  STATUS_BLOCKS,
  VIEWS,
  type AmsFolding,
  type CameraMode,
  type CardConfig,
  type ControlSection,
  type Hass,
  type HeaderChip,
  type StatusBlock,
  type View,
} from "./types";

// --- Check ------------------------------------------------------------------

interface Validator {
  /** The allowed values, in the language a card remembered. */
  allowed: () => string;
  check: (value: unknown) => boolean;
}

const oneOf = (values: readonly string[]): Validator => ({
  allowed: () => values.join(", "),
  check: (value) => typeof value === "string" && values.includes(value),
});

const listOf = (values: readonly string[]): Validator => ({
  allowed: () => t(undefined, "allowed_list", { values: values.join(", ") }),
  check: (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && values.includes(item)),
});

const flag: Validator = { allowed: () => "true, false", check: (value) => typeof value === "boolean" };

const OPTIONS = {
  printer: { allowed: () => t(undefined, "allowed_device"), check: (value) => typeof value === "string" },
  camera: oneOf(CAMERA_MODES),
  status_blocks: listOf(STATUS_BLOCKS),
  header_chips: listOf(HEADER_CHIPS),
  compact_chips: flag,
  start_view: oneOf(VIEWS),
  show_control_tab: flag,
  control_sections: listOf(CONTROL_SECTIONS),
  read_only: flag,
  show_filament_tab: flag,
  ams_folding: oneOf(AMS_FOLDING),
  show_external_spool: flag,
  assign_scanned_spool: flag,
  show_auto_off: flag,
} satisfies Record<string, Validator>;

type OptionKey = keyof typeof OPTIONS;

/** The configuration, checked option by option; an invalid value throws
 * with a reason Home Assistant shows on its error card. Unknown keys are
 * ignored; an option left empty in YAML (null) counts as not set; a value a
 * list names twice counts once; `camera: off`, which YAML reads as false,
 * is off. */
export function validateConfig(config: unknown): CardConfig {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(t(undefined, "invalid_option", { option: "type", value: JSON.stringify(config), allowed: "custom:bambuddy-printer-card" }));
  }
  const given = Object.fromEntries(
    Object.entries(config)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => [key, Array.isArray(value) ? [...new Set(value)] : key === "camera" && value === false ? "off" : value]),
  );
  for (const [key, validator] of Object.entries(OPTIONS)) {
    const value = given[key];
    if (value !== undefined && !validator.check(value)) {
      throw new Error(t(undefined, "invalid_option", { option: key, value: JSON.stringify(value), allowed: validator.allowed() }));
    }
  }
  return given as unknown as CardConfig;
}

// --- Settings ---------------------------------------------------------------

/** What the card draws from: every option, its default filled in. */
export interface Settings {
  camera: CameraMode;
  blocks: readonly StatusBlock[];
  chips: readonly HeaderChip[];
  startView: View;
  controlTab: boolean;
  sections: readonly ControlSection[];
  readOnly: boolean;
  filamentTab: boolean;
  amsFolding: AmsFolding;
  externalSpool: boolean;
  /** A scanned spool label assigns its spool at once, where nothing speaks against it. */
  assignScanned: boolean;
  showAutoOff: boolean;
  compactChips: boolean;
}

export const DEFAULTS: Settings = {
  camera: "tap",
  blocks: STATUS_BLOCKS,
  chips: DEFAULT_CHIPS,
  startView: "status",
  controlTab: true,
  sections: CONTROL_SECTIONS,
  readOnly: false,
  filamentTab: true,
  amsFolding: "auto",
  externalSpool: true,
  assignScanned: false,
  showAutoOff: true,
  compactChips: false,
};

/** Each setting's option key in the card's configuration. */
const KEYS: { readonly [S in keyof Settings]: keyof CardConfig } = {
  camera: "camera",
  blocks: "status_blocks",
  chips: "header_chips",
  startView: "start_view",
  controlTab: "show_control_tab",
  sections: "control_sections",
  readOnly: "read_only",
  filamentTab: "show_filament_tab",
  amsFolding: "ams_folding",
  externalSpool: "show_external_spool",
  assignScanned: "assign_scanned_spool",
  showAutoOff: "show_auto_off",
  compactChips: "compact_chips",
};
const SETTINGS = Object.keys(KEYS) as (keyof Settings)[];

export const settingsOf = (config: CardConfig): Settings =>
  Object.fromEntries(SETTINGS.map((setting) => [setting, config[KEYS[setting]] ?? DEFAULTS[setting]])) as unknown as Settings;

// --- Editor -----------------------------------------------------------------

/** Every option's default, by its key. */
const DEFAULT_DATA: Readonly<Record<string, unknown>> = Object.fromEntries(SETTINGS.map((setting) => [KEYS[setting], DEFAULTS[setting]]));

/** What the editor shows: every option's default where the configuration
 * has none, so its lists and dropdowns show what the card shows. Copies:
 * a saved card never shares the defaults' lists. */
export const editorData = (config: CardConfig): Record<string, unknown> => ({
  ...Object.fromEntries(Object.entries(DEFAULT_DATA).map(([key, value]) => [key, Array.isArray(value) ? [...(value as unknown[])] : value])),
  ...config,
});

/** The configuration after a change in the editor: an option whose value
 * now differs from what the editor showed takes it -- one emptied, or set
 * back to its default, goes --, all else stays as it was. A list the
 * configuration leaves out stays out until the user edits it: a block a
 * later version adds then shows too. */
export function changedConfig(config: Record<string, unknown>, shown: Record<string, unknown>, value: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  for (const key of new Set([...Object.keys(shown), ...Object.keys(value)])) {
    if (JSON.stringify(value[key]) === JSON.stringify(shown[key])) continue;
    if (value[key] === undefined || (key in DEFAULT_DATA && JSON.stringify(value[key]) === JSON.stringify(DEFAULT_DATA[key]))) delete next[key];
    else next[key] = value[key];
  }
  return next;
}

interface FormField {
  name: string;
  [key: string]: unknown;
}

const LABELS: Record<OptionKey, TextKey> = {
  printer: "editor_printer",
  camera: "editor_camera",
  status_blocks: "editor_blocks",
  header_chips: "editor_chips",
  start_view: "editor_start_view",
  show_control_tab: "editor_control_tab",
  control_sections: "editor_sections",
  read_only: "editor_read_only",
  show_filament_tab: "editor_filament_tab",
  ams_folding: "editor_ams_folding",
  show_external_spool: "editor_external_spool",
  assign_scanned_spool: "editor_assign_scanned",
  show_auto_off: "editor_show_auto_off",
  compact_chips: "editor_compact_chips",
};

/** Every option but the start tab: its help follows the tabs (`startViewNote`). */
const HELPERS: Record<Exclude<OptionKey, "start_view">, TextKey> = {
  printer: "editor_printer_help",
  camera: "editor_camera_help",
  status_blocks: "editor_blocks_help",
  header_chips: "editor_chips_help",
  show_control_tab: "editor_control_tab_help",
  control_sections: "editor_sections_help",
  read_only: "editor_read_only_help",
  show_filament_tab: "editor_filament_tab_help",
  ams_folding: "editor_ams_folding_help",
  show_external_spool: "editor_external_spool_help",
  assign_scanned_spool: "editor_assign_scanned_help",
  show_auto_off: "editor_show_auto_off_help",
  compact_chips: "editor_compact_chips_help",
};

/** The start tab's help while the editor's options hide the chosen tab:
 * the card then opens on Status. The Control tab goes with its switch,
 * without a section, and with Hide controls when only the axes are left. Every tab stays to choose --
 * switched on again, the choice is still there. */
export function startViewNote(hass: Hass | undefined, data: Record<string, unknown>): string | undefined {
  const view = data["start_view"];
  const sections = data["control_sections"];
  // Hide controls drops the axes: a Control tab of them alone goes.
  const motionOnly = Array.isArray(sections) && sections.every((section) => section === "motion");
  const controlHidden = data["show_control_tab"] === false || (Array.isArray(sections) && !sections.length) || (data["read_only"] === true && motionOnly);
  const hidden = (view === "control" && controlHidden) || (view === "filament" && data["show_filament_tab"] === false);
  return hidden ? t(hass, "editor_start_hidden", { tab: t(hass, `tab_${view}` as TextKey) }) : undefined;
}

/** A select's options, each labelled by its text key `<prefix>_<value>`. */
const options = (hass: Hass | undefined, prefix: string, values: readonly string[]): { value: string; label: string }[] =>
  values.map((value) => ({ value, label: t(hass, `${prefix}_${value}` as TextKey) }));

/** A dropdown with a default: required, so it has no × that empties it. */
const dropdown = (hass: Hass | undefined, name: string, prefix: string, values: readonly string[]): FormField => ({
  name,
  required: true,
  selector: { select: { mode: "dropdown", options: options(hass, prefix, values) } },
});

/** A list the user orders: Home Assistant draws its chip picker, with an
 * add button, handles to drag and a × on each -- without `reorder`, a list
 * of fewer than six options as checkboxes. */
const list = (hass: Hass | undefined, name: string, prefix: string, values: readonly string[]): FormField => ({
  name,
  selector: { select: { multiple: true, reorder: true, options: options(hass, prefix, values) } },
});

const toggle = (name: string): FormField => ({ name, selector: { boolean: {} } });

/** A folded group; its fields keep their own keys (a group without a name). */
const group = (hass: Hass | undefined, title: TextKey, iconName: string, schema: FormField[]): FormField => ({
  name: "",
  type: "expandable",
  title: t(hass, title),
  icon: iconName,
  schema,
});

export interface ConfigForm {
  schema: FormField[];
  computeLabel: (field: { name: string }) => string | undefined;
  computeHelper: (field: { name: string }) => string | undefined;
}

/** The fields of the card's editor (editor.ts), in the language of `hass`
 * -- else Home Assistant's --: the printer, then the groups General, Status,
 * Control and Filament, folded. The device picker offers the printers only: the
 * devices of the integration with an enum sensor (the print status) -- an
 * AMS unit and the BamBuddy instance have none. A printer chosen in YAML is
 * checked all the same. */
export function configForm(hass?: Hass): ConfigForm {
  return {
    schema: [
      {
        name: "printer",
        required: true,
        selector: { device: { filter: { integration: "bambuddy" }, entity: { integration: "bambuddy", domain: "sensor", device_class: "enum" } } },
      },
      // What works in every tab, then each tab's own.
      group(hass, "editor_group_general", "mdi:cog-outline", [
        dropdown(hass, "start_view", "tab", VIEWS),
        dropdown(hass, "camera", "camera", CAMERA_MODES),
        list(hass, "header_chips", "chip", HEADER_CHIPS),
        toggle("compact_chips"),
        toggle("read_only"),
      ]),
      group(hass, "editor_group_status", "mdi:printer-3d", [list(hass, "status_blocks", "block", STATUS_BLOCKS), toggle("show_auto_off")]),
      group(hass, "editor_group_control", "mdi:gamepad-round-outline", [toggle("show_control_tab"), list(hass, "control_sections", "section", CONTROL_SECTIONS)]),
      group(hass, "editor_group_filament", "mdi:printer-3d-nozzle", [toggle("show_filament_tab"), dropdown(hass, "ams_folding", "folding", AMS_FOLDING), toggle("show_external_spool"), toggle("assign_scanned_spool")]),
    ],
    computeLabel: (field) => (field.name in LABELS ? t(hass, LABELS[field.name as OptionKey]) : undefined),
    computeHelper: (field) => (field.name in HELPERS ? t(hass, HELPERS[field.name as keyof typeof HELPERS]) : undefined),
  };
}
