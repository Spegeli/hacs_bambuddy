// The control view: the heaters, the AI detections, moving the axes, homing
// and the extruder. Every move waits while a print is on the printer, the
// AMS changes filament or the printer is offline; homing asks first.
import { html, nothing, type TemplateResult } from "lit";

import { formatNumber, formatState, numericState, stateOf } from "./format";
import { detectionSection } from "./detection";
import { heatingSection } from "./heating";
import { type IconName } from "./icons";
import { t, type TextKey } from "./i18n";
import { actionButton, activeNozzleIndex, developerHint, note, NOZZLE_SIDES, type CardContext } from "./parts";
import type { Heater } from "./types";

export const STEPS = [1, 10] as const;
export type Step = (typeof STEPS)[number];

/** The filament length one tap extrudes or retracts. */
export const EXTRUDE_LENGTH = 10;

/** Below this, the printer refuses to extrude. */
const MIN_EXTRUDE_TEMPERATURE = 170;

/** The hint for a cold nozzle that names the active one of two. */
const COLD_HINTS: TextKey[] = ["cold_nozzle_left", "cold_nozzle_right"];

/** Left or right on a printer with two nozzles: the one that extrudes and
 * loads. The printer switches only without a print. */
function activeNozzle(ctx: CardContext, disabled: boolean): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  const state = stateOf(hass, refs.activeNozzle);
  if (!state) return nothing;
  const listed = state.attributes["options"];
  const options = Array.isArray(listed) && listed.length && listed.every((option) => typeof option === "string") ? (listed as string[]) : NOZZLE_SIDES;
  const pending = ctx.isPending("active_nozzle");
  return html`<div class="nozzle-row">
    <span class="step-label">${t(hass, "active_nozzle")}</span>
    <div class="seg" role="radiogroup" aria-label=${t(hass, "active_nozzle")}>
      ${options.map(
        (option) => html`<button
          role="radio"
          aria-checked=${option === state.state ? "true" : "false"}
          ?disabled=${disabled || pending || state.state === "unavailable"}
          @click=${() => ctx.run("active_nozzle", "select", "select_option", { entity_id: refs.activeNozzle, option })}
        >
          ${formatState(hass, refs.activeNozzle, option)}
        </button>`,
      )}
    </div>
  </div>`;
}

/** The temperature of the nozzle that extrudes: the active one of two, else
 * the hottest (the integration decides where it knows better). */
function extrudingNozzle(ctx: CardContext): number | undefined {
  const { hass, refs } = ctx;
  const active = activeNozzleIndex(ctx);
  if (active !== undefined) return numericState(hass, (refs.nozzles[active] as Heater).sensor);
  const temperatures = refs.nozzles.map((nozzle) => numericState(hass, nozzle.sensor)).filter((value): value is number => value !== undefined);
  return temperatures.length ? Math.max(...temperatures) : undefined;
}

export function controlView(ctx: CardContext, step: Step, setStep: (step: Step) => void): TemplateResult {
  const { hass, refs } = ctx;
  if (!ctx.canControl) return note(t(hass, "read_only"));
  const disabled = !ctx.online || ctx.busy || ctx.changing;
  const device = refs.deviceId;
  const signed = (value: number): string => `${value > 0 ? "+" : "−"}${formatNumber(hass, Math.abs(value))}`;

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
  const bed = (direction: 1 | -1): TemplateResult =>
    actionButton({
      label: t(hass, direction > 0 ? "bed_away" : "bed_closer"),
      aria: t(hass, direction > 0 ? "bed_away_aria" : "bed_closer_aria", { step }),
      iconName: direction > 0 ? "down" : "up",
      disabled,
      pending: ctx.isPending("move_z"),
      className: "stack",
      onClick: () => ctx.run("move_z", "bambuddy", "move_axis", { device_id: device, axis: "z", distance: direction * step }),
    });

  const nozzle = extrudingNozzle(ctx);
  const cold = nozzle !== undefined && nozzle < MIN_EXTRUDE_TEMPERATURE;
  // Of two nozzles, the hint names the one to heat.
  const side = activeNozzleIndex(ctx);
  const coldHint = side === undefined ? "cold_nozzle" : (COLD_HINTS[side] as TextKey);
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

  // Offline stops everything; a print or a filament change stops what
  // moves (the heaters stay).
  // The step applies to X, Y and the bed; the extruder always moves 10 mm.
  return html`${developerHint(ctx)}${ctx.online ? nothing : note(t(hass, "offline_reason"), "warning")} ${heatingSection(ctx)} ${detectionSection(ctx)}
    ${ctx.online && ctx.busy ? note(t(hass, "busy_reason"), "warning") : ctx.changing ? note(t(hass, "changing_reason"), "warning") : nothing}
    ${activeNozzle(ctx, disabled)}
    <div class="control">
      <div class="step-row">
        <span class="step-label">${t(hass, "step")}</span>
        <div class="seg" role="radiogroup" aria-label=${t(hass, "step")}>
          ${STEPS.map(
            (value) => html`<button role="radio" aria-checked=${value === step ? "true" : "false"} @click=${() => setStep(value)}>
              ${formatNumber(hass, value)} mm
            </button>`,
          )}
        </div>
        ${ctx.startLive ? actionButton({ label: t(hass, "live"), iconName: "video", iconOnly: true, onClick: ctx.startLive }) : nothing}
      </div>
      <div class="pad">
        ${jog("y", 1, "up", "n")}${jog("x", -1, "left", "w")}${home}${jog("x", 1, "right", "e")}${jog("y", -1, "down", "s")}
      </div>
      <div class="axis-col bed">
        <span class="axis-label">${t(hass, "bed_axis")}</span>
        ${bed(-1)}${bed(1)}
      </div>
      <div class="axis-col ext">
        <span class="axis-label">${t(hass, "extruder")} · ${formatNumber(hass, EXTRUDE_LENGTH)} mm</span>
        <div class="ext-buttons">${extruder(-1)}${extruder(1)}</div>
      </div>
    </div>
    ${cold && !disabled ? note(t(hass, coldHint)) : nothing}
    <p class="hint">${t(hass, "jog_note")}</p>`;
}
