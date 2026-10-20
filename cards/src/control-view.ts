// The control view: its sections in the user's order -- the heaters, the
// print options, moving the axes, homing and the extruder. Every move waits
// while a print is on the printer or the AMS changes filament; homing asks
// first. The card offers the view where the API key may control the printer
// -- with Hide controls as states only; an offline printer's tab shows the
// offline view instead (card.ts).
import { html, nothing, type TemplateResult } from "lit";

import { formatNumber, formatState, formatTemperature, fromCelsius, listedOptions, numericState, stateOf, temperatureUnit } from "./format";
import { detectionSection } from "./detection";
import { heatingSection } from "./heating";
import { type IconName } from "./icons";
import { t, type TextKey } from "./i18n";
import { actionButton, activeNozzleIndex, developerHint, hottestNozzle, note, NOZZLE_SIDES, radioKeys, radioLeave, radioStop, type CardContext } from "./parts";
import type { ControlSection, Heater, PrinterRefs } from "./types";

// 0.1 mm too, for fine steps of Z.
const STEPS = [0.1, 1, 10] as const;
export type Step = (typeof STEPS)[number];

/** The filament length one tap extrudes or retracts. */
const EXTRUDE_LENGTH = 10;

/** Below this, in °C, the printer refuses to extrude. */
const MIN_EXTRUDE_TEMPERATURE = 170;

/** The printers whose Z moves the nozzle, not the bed (bed slingers: the
 * A1, A1 mini and A2L). */
const NOZZLE_Z = /^A(1|2L)\b/i;

/** The hint for a cold nozzle that names the active one of two. */
const COLD_HINTS: TextKey[] = ["cold_nozzle_left", "cold_nozzle_right"];
/** The same, where the card shows no heating section to point to. */
const COLD_PLAIN: TextKey[] = ["cold_nozzle_left_plain", "cold_nozzle_right_plain"];

/** Left or right on a printer with two nozzles: the one that extrudes and
 * loads. The printer switches only without a print. */
function activeNozzle(ctx: CardContext, disabled: boolean): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  const state = stateOf(hass, refs.activeNozzle);
  if (!state) return nothing;
  const options = listedOptions(state, NOZZLE_SIDES, false);
  const pending = ctx.isPending("active_nozzle");
  const stop = radioStop(options, state.state);
  return html`<div class="nozzle-row">
    <span class="step-label">${t(hass, "active_nozzle")}</span>
    <div class="seg" role="radiogroup" aria-label=${t(hass, "active_nozzle")} @keydown=${radioKeys} @focusout=${radioLeave}>
      ${options.map(
        (option, index) => html`<button
          role="radio"
          aria-checked=${option === state.state ? "true" : "false"}
          tabindex=${index === stop ? 0 : -1}
          aria-disabled=${pending ? "true" : nothing}
          ?disabled=${disabled || state.state === "unavailable"}
          @click=${() => ctx.run("active_nozzle", "select", "select_option", { entity_id: refs.activeNozzle, option })}
        >
          ${formatState(hass, refs.activeNozzle, option)}
        </button>`,
      )}
    </div>
  </div>`;
}

/** The temperature sensor of the nozzle that extrudes: the active one of
 * two, else the hottest (the integration decides where it knows better). */
function extrudingNozzle(ctx: CardContext): string | undefined {
  const active = activeNozzleIndex(ctx);
  return active !== undefined ? (ctx.refs.nozzles[active] as Heater).sensor : hottestNozzle(ctx)?.sensor;
}

/** Moving: the active nozzle, the jog pad with its step, homing, Z
 * and the extruder. */
function motionSection(ctx: CardContext, step: Step, setStep: (step: Step) => void): TemplateResult {
  const { hass, refs } = ctx;
  const disabled = !ctx.online || ctx.busy || ctx.changing;
  const device = refs.deviceId;
  const signed = (value: number): string => `${value > 0 ? "+" : "−"}${formatNumber(hass, Math.abs(value), 1)}`;

  const jog = (axis: "x" | "y", direction: 1 | -1, iconName: IconName, area: string): TemplateResult => {
    const distance = direction * step;
    const key = `move_${axis}`;
    return actionButton({
      label: t(hass, "move", { axis: axis.toUpperCase(), distance: signed(distance) }),
      iconName,
      iconOnly: true,
      disabled,
      pending: ctx.isPending(key),
      className: `jog ${area}`,
      onClick: () => ctx.run(key, "bambuddy", "move_axis", { device_id: device, axis, distance }),
    });
  };
  // The A series moves the nozzle on Z, the others the bed; Z+ parts them.
  const nozzleMoves = NOZZLE_Z.test(refs.model);
  const bed = (direction: 1 | -1): TemplateResult =>
    actionButton({
      label: t(hass, direction > 0 ? "bed_away" : "bed_closer"),
      aria: nozzleMoves
        ? t(hass, direction > 0 ? "nozzle_away_aria" : "nozzle_closer_aria", { step: formatNumber(hass, step, 1) })
        : t(hass, direction > 0 ? "bed_away_aria" : "bed_closer_aria", { step: formatNumber(hass, step, 1) }),
      iconName: direction > 0 === nozzleMoves ? "up" : "down",
      disabled,
      pending: ctx.isPending("move_z"),
      className: "stack",
      onClick: () => ctx.run("move_z", "bambuddy", "move_axis", { device_id: device, axis: "z", distance: direction * step }),
    });

  const sensor = extrudingNozzle(ctx);
  const nozzle = numericState(hass, sensor);
  // In the sensor's unit: Home Assistant may show it in °F.
  const unit = temperatureUnit(hass, sensor);
  const minimum = fromCelsius(MIN_EXTRUDE_TEMPERATURE, unit);
  const cold = nozzle !== undefined && nozzle < minimum;
  // Of two nozzles, the hint names the one to heat.
  const side = activeNozzleIndex(ctx);
  const heating = ctx.settings.sections.includes("heating");
  const coldHint = side === undefined ? (heating ? "cold_nozzle" : "cold_nozzle_plain") : ((heating ? COLD_HINTS : COLD_PLAIN)[side] as TextKey);
  const extruder = (direction: 1 | -1): TemplateResult =>
    actionButton({
      label: t(hass, direction > 0 ? "extrude" : "retract"),
      aria: t(hass, direction > 0 ? "extrude_aria" : "retract_aria", { length: EXTRUDE_LENGTH }),
      iconName: direction > 0 ? "down" : "up",
      disabled: disabled || cold,
      pending: ctx.isPending("extrude"),
      className: "stack",
      onClick: () => ctx.run("extrude", "bambuddy", "extrude", { device_id: device, distance: direction * EXTRUDE_LENGTH }),
    });

  const home = actionButton({
    label: t(hass, "home"),
    aria: t(hass, "home_aria"),
    iconName: "home",
    iconOnly: true,
    // Filled only while it can be pressed: disabled, it looks like the arrows.
    kind: disabled ? "tonal" : "primary",
    disabled,
    pending: ctx.isPending("home"),
    className: "jog home",
    onClick: () =>
      ctx.confirm({
        title: t(hass, "home_title"),
        text: t(hass, "home_text"),
        confirm: t(hass, "home"),
        action: ["bambuddy", "home_axes", { device_id: device }],
        key: "home",
      }),
  });

  // A print or a filament change stops what moves (the heaters stay); a
  // change is a wait, said as a note.
  // The step applies to X, Y and Z; the extruder always moves 10 mm.
  return html`${ctx.online && ctx.busy ? note(t(hass, "busy_reason"), "warning") : ctx.changing ? note(t(hass, "changing_reason")) : nothing}
    ${activeNozzle(ctx, disabled)}
    <div class="control">
      <div class="step-row">
        <span class="step-label">${t(hass, "step")}</span>
        <div class="seg" role="radiogroup" aria-label=${t(hass, "step")} @keydown=${radioKeys} @focusout=${radioLeave}>
          ${STEPS.map(
            (value) => html`<button
              role="radio"
              aria-checked=${value === step ? "true" : "false"}
              tabindex=${value === step ? 0 : -1}
              @click=${() => setStep(value)}
            >
              ${formatNumber(hass, value, 1)} mm
            </button>`,
          )}
        </div>
        ${ctx.startLive ? actionButton({ label: t(hass, "live"), iconName: "video", iconOnly: true, className: "live-btn", onClick: ctx.startLive }) : nothing}
      </div>
      <div class="pad">
        ${jog("y", 1, "up", "n")}${jog("x", -1, "left", "w")}${home}${jog("x", 1, "right", "e")}${jog("y", -1, "down", "s")}
      </div>
      <div class="axis-col bed">
        <span class="axis-label">${t(hass, nozzleMoves ? "nozzle_height" : "bed_axis")}</span>
        ${nozzleMoves ? html`${bed(1)}${bed(-1)}` : html`${bed(-1)}${bed(1)}`}
      </div>
      <div class="axis-col ext">
        <span class="axis-label">${t(hass, "extruder")} · ${formatNumber(hass, EXTRUDE_LENGTH)} mm</span>
        <div class="ext-buttons">${extruder(-1)}${extruder(1)}</div>
      </div>
    </div>
    ${cold && !disabled ? note(t(hass, coldHint, { temperature: formatTemperature(hass, minimum, unit) })) : nothing}
    <p class="hint">${t(hass, "jog_note")}</p>`;
}

/** Whether a section has something to show: heating a heater whose target
 * the card can set, the print options a detection switch; moving always --
 * but with Hide controls (`viewOnly`), which shows states only. */
export function sectionShown(refs: PrinterRefs, name: ControlSection, viewOnly = false): boolean {
  if (name === "heating") return [...refs.nozzles, refs.bed, refs.chamber].some((heater) => heater.target !== undefined);
  if (name === "motion") return !viewOnly;
  return refs.detectors.length > 0;
}

export function controlView(ctx: CardContext, step: Step, setStep: (step: Step) => void): TemplateResult {
  const section = (name: ControlSection): TemplateResult | typeof nothing =>
    name === "heating" ? heatingSection(ctx) : name === "options" ? detectionSection(ctx) : ctx.viewOnly ? nothing : motionSection(ctx, step, setStep);
  return html`${developerHint(ctx)}${ctx.settings.sections.map(section)}`;
}
