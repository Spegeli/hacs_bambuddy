// The heating section of the control view: each heater's target with
// -5 / +5 steppers and "Off", and one "Cool down" for all. A tap changes
// the target shown at once; the card sends it when the taps stop (see
// card.ts, stepTarget), so a few taps are one command.
import { html, nothing, type TemplateResult } from "lit";

import { formatTemperature, numericState, stateOf } from "./format";
import { icon, type IconName } from "./icons";
import { t, type TextKey } from "./i18n";
import { actionButton, activeNozzleIndex, type CardContext } from "./parts";
import type { Heater } from "./types";

/** One tap on a stepper. */
export const TARGET_STEP = 5;

type HeaterKind = "nozzle" | "bed" | "chamber";

/** Where "+" starts from a heater that is off, and the highest target where
 * the number entity names none: BamBuddy's ranges. */
const START: Record<HeaterKind, number> = { nozzle: 220, bed: 55, chamber: 40 };
const MAX: Record<HeaterKind, number> = { nozzle: 320, bed: 140, chamber: 65 };

interface Row {
  label: string;
  kind: HeaterKind;
  target: string;
  sensor?: string;
  /** The active one of two nozzles: the one that extrudes. */
  active: boolean;
}

/** The heaters with a target the card can set, in the order of the tiles. */
function rows(ctx: CardContext): Row[] {
  const { hass, refs } = ctx;
  const nozzleLabels: TextKey[] = refs.dual ? ["nozzle_left", "nozzle_right"] : ["nozzle"];
  const active = activeNozzleIndex(ctx);
  const all: [string, Heater, HeaterKind, boolean][] = [
    ...refs.nozzles.map((nozzle, index): [string, Heater, HeaterKind, boolean] => [t(hass, nozzleLabels[index] as TextKey), nozzle, "nozzle", index === active]),
    [t(hass, "bed"), refs.bed, "bed", false],
    [t(hass, "chamber"), refs.chamber, "chamber", false],
  ];
  return all.flatMap(([label, heater, kind, isActive]) =>
    heater.target ? [{ label, kind, target: heater.target, active: isActive, ...(heater.sensor ? { sensor: heater.sensor } : {}) }] : [],
  );
}

/** A multiple of 5 for a target. */
const round5 = (value: number): number => Math.round(value / TARGET_STEP) * TARGET_STEP;

/** The nozzle's start: the middle of the active filament's range, else 220 °C. */
function nozzleStart(ctx: CardContext): number {
  const attributes = stateOf(ctx.hass, ctx.refs.activeFilament)?.attributes ?? {};
  const low = attributes["nozzle_temp_min"];
  const high = attributes["nozzle_temp_max"];
  return typeof low === "number" && typeof high === "number" && high >= low && low > 0 ? round5((low + high) / 2) : START.nozzle;
}

function heaterRow(ctx: CardContext, row: Row, options: { disabled: boolean; offered: boolean }): TemplateResult {
  const { hass } = ctx;
  const target = ctx.targetOf(row.target);
  const current = numericState(hass, row.sensor);
  const maxAttribute = stateOf(hass, row.target)?.attributes["max"];
  const max = typeof maxAttribute === "number" ? maxAttribute : MAX[row.kind];
  const off = target === undefined || target <= 0;
  const start = Math.min(max, row.kind === "nozzle" ? nozzleStart(ctx) : START[row.kind]);
  const raised = off ? start : Math.min(max, (target as number) + TARGET_STEP);
  const lowered = off ? 0 : Math.max(0, (target as number) - TARGET_STEP);
  const what = row.label;
  return html`<div class="heat-row">
    <div class="heat-name">
      <span class="heat-label"
        >${icon(row.kind as IconName)}<span class="heat-title"
          ><span class="heat-text">${row.label}</span> ${row.active ? html`<span class="heat-tag">${t(hass, "nozzle_active")}</span>` : nothing}</span
        ></span
      >
      <span class="heat-now">${current === undefined ? "—" : t(hass, "heat_now", { value: formatTemperature(hass, current) })}</span>
    </div>
    <div class="heat-set">
      ${actionButton({
        label: t(hass, "heat_lower", { what, step: TARGET_STEP }),
        iconName: "minus",
        iconOnly: true,
        disabled: options.disabled || off,
        onClick: () => ctx.stepTarget(row.target, lowered),
      })}
      <span class="heat-target ${off ? "off" : ""}">${target === undefined ? "—" : off ? t(hass, "heater_off") : formatTemperature(hass, target)}</span>
      ${actionButton({
        label: off ? t(hass, "heat_start", { what, value: formatTemperature(hass, start) }) : t(hass, "heat_raise", { what, step: TARGET_STEP }),
        iconName: "plus",
        iconOnly: true,
        disabled: options.disabled || (!off && (target as number) >= max),
        onClick: () => ctx.stepTarget(row.target, raised),
      })}
    </div>
    ${options.offered
      ? actionButton({
          label: t(hass, "heat_off", { what }),
          iconName: "power",
          iconOnly: true,
          kind: "plain",
          className: "heat-off",
          disabled: options.disabled || off || ctx.changing,
          onClick: () => ctx.setTargets([[row.target, 0]]),
        })
      : nothing}
  </div>`;
}

/** The section, where the printer has a target the card can set. */
export function heatingSection(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass } = ctx;
  const heaters = rows(ctx);
  if (!heaters.length) return nothing;
  const disabled = !ctx.online;
  // Off and Cool down would end a print: only without one. They wait
  // during a filament change, which cooling would break.
  const offered = !ctx.busy;
  const hot = heaters.filter((row) => (ctx.targetOf(row.target) ?? 0) > 0);
  return html`<section class="heating" aria-labelledby="heat-title">
    <div class="heat-head">
      <span class="section-label" id="heat-title">${icon("heat")}${t(hass, "heating")}</span>
      ${offered
        ? actionButton({
            label: t(hass, "cool_down"),
            iconName: "snow",
            kind: "plain",
            disabled: disabled || !hot.length || ctx.changing,
            onClick: () => ctx.setTargets(hot.map((row) => [row.target, 0])),
          })
        : nothing}
    </div>
    <div class="heat-rows">${heaters.map((row) => heaterRow(ctx, row, { disabled, offered }))}</div>
  </section>`;
}
