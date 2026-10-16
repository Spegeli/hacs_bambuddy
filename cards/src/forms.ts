// Configuration: what setConfig accepts, and the visual editor -- Home
// Assistant's own form, described by getConfigForm. Toggles and the camera
// show their default where the configuration has none, and nothing is
// saved for them.
import { t, type TextKey } from "./i18n";
import { CAMERA_MODES, SECTIONS, type CardConfig } from "./types";

interface Validator {
  /** The allowed values, in the language a card remembered. */
  allowed: () => string;
  check: (value: unknown) => boolean;
}

const OPTIONS: Record<string, Validator> = {
  printer: { allowed: () => t(undefined, "allowed_device"), check: (value) => typeof value === "string" },
  camera: { allowed: () => CAMERA_MODES.join(", "), check: (value) => typeof value === "string" && (CAMERA_MODES as readonly string[]).includes(value) },
  ...Object.fromEntries(SECTIONS.map((name) => [name, { allowed: () => "true, false", check: (value: unknown) => typeof value === "boolean" }])),
};

/** The configuration, checked option by option; an invalid value throws
 * with a reason Home Assistant shows on its error card. Unknown keys are
 * ignored; an option left empty in YAML (null) counts as not set. */
export function validateConfig(config: unknown): CardConfig {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(t(undefined, "invalid_option", { option: "type", value: JSON.stringify(config), allowed: "custom:bambuddy-printer-card" }));
  }
  const given = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== null));
  for (const [key, validator] of Object.entries(OPTIONS)) {
    const value = given[key];
    if (value !== undefined && !validator.check(value)) {
      throw new Error(t(undefined, "invalid_option", { option: key, value: JSON.stringify(value), allowed: validator.allowed() }));
    }
  }
  return given as unknown as CardConfig;
}

export interface FormField {
  name: string;
  [key: string]: unknown;
}

const LABELS: Record<string, TextKey> = {
  printer: "editor_printer",
  camera: "editor_camera",
  show_temperatures: "show_temperatures",
  show_fans: "show_fans",
  show_ams: "show_ams",
  show_controls: "show_controls",
};

const HELPERS: Record<string, TextKey> = {
  printer: "editor_printer_help",
  camera: "editor_camera_help",
};

/** The editor Home Assistant draws for the card (getConfigForm). The
 * device picker offers the printers only: the devices of the integration
 * with an enum sensor (the print status) -- an AMS unit and the BamBuddy
 * instance have none. A printer chosen in YAML is checked all the same. */
export function configForm(): {
  schema: FormField[];
  computeLabel: (field: { name: string }) => string | undefined;
  computeHelper: (field: { name: string }) => string | undefined;
  assertConfig: (config: unknown) => void;
} {
  return {
    schema: [
      {
        name: "printer",
        required: true,
        selector: { device: { filter: { integration: "bambuddy" }, entity: { integration: "bambuddy", domain: "sensor", device_class: "enum" } } },
      },
      {
        name: "camera",
        default: "tap",
        selector: {
          select: {
            mode: "dropdown",
            options: CAMERA_MODES.map((mode) => ({ value: mode, label: t(undefined, `camera_${mode}` as TextKey) })),
          },
        },
      },
      {
        name: "",
        type: "grid",
        schema: SECTIONS.map((name) => ({ name, default: true, selector: { boolean: {} } })),
      },
    ],
    computeLabel: (field) => (field.name in LABELS ? t(undefined, LABELS[field.name] as TextKey) : undefined),
    computeHelper: (field) => (field.name in HELPERS ? t(undefined, HELPERS[field.name] as TextKey) : undefined),
    assertConfig: (config) => {
      validateConfig(config);
    },
  };
}
