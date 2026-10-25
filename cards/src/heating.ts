// The heating section of the control view: each heater's target with
// -5 / +5 steppers and "Off", and one "Heating off" for all. A tap changes
// the target shown at once; the card sends it when the taps stop (see
// card.ts, stepTarget), so a few taps are one command.
import { html, nothing, type TemplateResult } from "lit";

import { formatTemperature, formatTemperatureOf, fromCelsius, listedOptions, numericState, stateOf, targetFloor, temperatureUnit } from "./format";
import { icon, type IconName } from "./icons";
import { t, type TextKey } from "./i18n";
import { actionButton, activeNozzleIndex, heaters, note, radioKeys, radioLeave, radioStop, type CardContext, type HeaterKind } from "./parts";

/** One tap on a stepper. */
const TARGET_STEP = 5;

/** Where "+" starts from a heater that is off, and the highest target where
 * the number entity names none: BamBuddy's ranges, in °C. Home Assistant
 * shows the targets in the user's unit (°F with US customary units): the
 * card turns these into it, and a step is 5 of that unit. */
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

/** The heaters with a target the card can set, in the order of the tiles.
 * The nozzle that prints is tagged during a job, as in the Status tab:
 * idle, "active" beside Off would read as on -- the select below says
 * which one is chosen. */
function rows(ctx: CardContext): Row[] {
  const active = ctx.busy ? activeNozzleIndex(ctx) : undefined;
  return heaters(ctx).flatMap(({ label, heater, kind, index }) =>
    heater.target
      ? [{ label, kind, target: heater.target, active: kind === "nozzle" && index === active, ...(heater.sensor ? { sensor: heater.sensor } : {}) }]
      : [],
  );
}

/** A multiple of 5 for a target. */
const round5 = (value: number): number => Math.round(value / TARGET_STEP) * TARGET_STEP;

/** The nozzle's start in °C: the middle of the active filament's range,
 * else 220 °C. The other of two nozzles holds another filament the card
 * does not know: 220 °C. */
function nozzleStart(ctx: CardContext, row: Row): number {
  if (ctx.refs.nozzles.length > 1 && !row.active) return START.nozzle;
  const attributes = stateOf(ctx.hass, ctx.refs.activeFilament)?.attributes ?? {};
  const low = attributes["nozzle_temp_min"];
  const high = attributes["nozzle_temp_max"];
  return typeof low === "number" && typeof high === "number" && high >= low && low > 0 ? round5((low + high) / 2) : START.nozzle;
}

/** A heater's name, its tag as the active nozzle, and what it reads now;
 * `on`, its icon in the heat tone, as the Status tab's tile. */
function heatName(ctx: CardContext, row: Row, on: boolean): TemplateResult {
  const { hass } = ctx;
  const current = numericState(hass, row.sensor);
  return html`<div class="heat-name ${on ? "on" : ""}">
    <span class="heat-label"
      >${icon(row.kind as IconName)}<span class="heat-title"
        ><span class="heat-text">${row.label}</span> ${row.active ? html`<span class="heat-tag">${t(hass, "nozzle_active")}</span>` : nothing}</span
      ></span
    >
    <span class="heat-now"
      >${current === undefined ? "—" : t(hass, "heat_now", { value: formatTemperatureOf(hass, row.sensor, current) })}</span
    >
  </div>`;
}

/** A heater's target: off, a temperature, or a dash without one. Where it
 * is set, it says each new target to a screen reader. */
function heatTarget(ctx: CardContext, row: Row, target: number | undefined, live = false): TemplateResult {
  const { hass } = ctx;
  const off = target === undefined || target <= targetFloor(hass, row.target);
  const text = target === undefined ? "—" : off ? t(hass, "heater_off") : formatTemperatureOf(hass, row.target, target);
  // Said with what it heats: "Bed target: 60 °C".
  const said = html`<span class="sr-only">${t(hass, "heat_target_said", { what: row.label })} </span>`;
  return live
    ? html`<output class="heat-target ${off ? "off" : ""}" aria-live="polite">${said}${text}</output>`
    : html`<span class="heat-target ${off ? "off" : ""}">${said}${text}</span>`;
}

/** A heater's target as text, with Hide controls: nothing to set. */
function heaterState(ctx: CardContext, row: Row): TemplateResult {
  const target = numericState(ctx.hass, row.target);
  const on = target !== undefined && target > targetFloor(ctx.hass, row.target);
  return html`<div class="heat-row view">${heatName(ctx, row, on)} ${heatTarget(ctx, row, target)}</div>`;
}

function heaterRow(ctx: CardContext, row: Row, options: { disabled: boolean; offered: boolean }): TemplateResult {
  const { hass } = ctx;
  const target = ctx.targetOf(row.target);
  const unit = temperatureUnit(hass, row.target);
  const floor = targetFloor(hass, row.target);
  const maxAttribute = stateOf(hass, row.target)?.attributes["max"];
  const max = typeof maxAttribute === "number" ? maxAttribute : fromCelsius(MAX[row.kind], unit);
  const off = target === undefined || target <= floor;
  const start = Math.min(max, fromCelsius(row.kind === "nozzle" ? nozzleStart(ctx, row) : START[row.kind], unit));
  const raised = off ? start : Math.min(max, (target as number) + TARGET_STEP);
  const lowered = off ? floor : Math.max(floor, (target as number) - TARGET_STEP);
  const what = row.label;
  // The target shown, a tap's included: the icon goes with the number.
  return html`<div class="heat-row">
    ${heatName(ctx, row, !off)}
    <div class="heat-set">
      ${actionButton({
        label: t(hass, "heat_lower", { what, step: TARGET_STEP, unit }),
        iconName: "minus",
        iconOnly: true,
        disabled: options.disabled || off,
        onClick: () => ctx.stepTarget(row.target, lowered),
      })}
      ${heatTarget(ctx, row, target, true)}
      ${actionButton({
        label: off ? t(hass, "heat_start", { what, value: formatTemperature(hass, start, unit) }) : t(hass, "heat_raise", { what, step: TARGET_STEP, unit }),
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
          onClick: () => ctx.setTargets([[row.target, floor]]),
        })
      : nothing}
  </div>`;
}

const AIRDUCT_MODES: readonly string[] = ["cooling", "heating"];
const AIRDUCT_TEXTS: Readonly<Record<string, TextKey>> = { cooling: "airduct_cooling", heating: "airduct_heating", laser: "airduct_laser" };

/** The airduct (P2S, X2D, H2 series): fresh air in, or the chamber's warmth
 * kept. Words only: the power icon would mean "Off" beside it. The printer
 * sets it at every print start; it changes only without a print and a
 * filament change. Its laser mode (H2 series with the laser module) comes
 * from the printer: said, never offered; another mode chooses nothing. */
function airductRow(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  const state = stateOf(hass, refs.airduct);
  if (!state) return nothing;
  // The chamber heats: the printer keeps the airduct on heating, and
  // cooling waits until the chamber is off (the integration refuses it).
  const chamber = refs.chamber.target;
  const chamberHeats = chamber !== undefined && (numericState(hass, chamber) ?? 0) > targetFloor(hass, chamber);
  if (ctx.viewOnly) {
    return html`<div class="airduct">
      <div class="nozzle-row">
        <span class="step-label">${t(hass, "airduct")}</span>
        <span class="det-state">${t(hass, AIRDUCT_TEXTS[state.state] ?? "unknown")}</span>
      </div>
      ${chamberHeats ? note(t(hass, "airduct_chamber_heats_view")) : nothing}
      <p class="hint">${t(hass, "airduct_hint")}</p>
    </div>`;
  }
  const options = listedOptions(state, AIRDUCT_MODES, false).filter((option) => AIRDUCT_MODES.includes(option));
  const blocked = (option: string): boolean => option === "cooling" && chamberHeats;
  // The keyboard comes in on an option it can choose.
  const chosen = radioStop(options, state.state);
  const stop = blocked(options[chosen] ?? "") ? Math.max(0, options.findIndex((option) => !blocked(option))) : chosen;
  const pending = ctx.isPending("airduct");
  const waiting = ctx.busy ? "airduct_busy" : ctx.changing ? "changing_reason" : undefined;
  const label = t(hass, "airduct");
  return html`<div class="airduct">
    <div class="nozzle-row">
      <span class="step-label">${label}</span>
      <div class="seg" role="radiogroup" aria-label=${label} @keydown=${radioKeys} @focusout=${radioLeave}>
        ${options.map(
          (option, index) => html`<button
            role="radio"
            aria-checked=${option === state.state ? "true" : "false"}
            tabindex=${index === stop ? 0 : -1}
            aria-disabled=${pending ? "true" : nothing}
            ?disabled=${!ctx.online || waiting !== undefined || state.state === "unavailable" || blocked(option)}
            @click=${() => ctx.run("airduct", "select", "select_option", { entity_id: refs.airduct, option })}
          >
            ${t(hass, AIRDUCT_TEXTS[option] as TextKey)}
          </button>`,
        )}
      </div>
    </div>
    ${state.state === "laser" ? note(t(hass, "airduct_laser_now")) : nothing}
    ${waiting ? note(t(hass, waiting)) : chamberHeats ? note(t(hass, "airduct_chamber_heats")) : nothing}
    <p class="hint">${t(hass, "airduct_hint")}</p>
  </div>`;
}

/** The section, where the printer has a target the card can set. */
export function heatingSection(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass } = ctx;
  const heaters = rows(ctx);
  if (!heaters.length) return nothing;
  const disabled = !ctx.online;
  // Off and Heating off would end a print: only without one -- but the
  // chamber's Off, which ends none (the job may set it again). They wait
  // during a filament change, which cooling would break.
  const offered = !ctx.busy && !ctx.viewOnly;
  const offFor = (row: Row): boolean => (offered || (row.kind === "chamber" && !ctx.viewOnly));
  const hot = heaters.filter((row) => (ctx.targetOf(row.target) ?? 0) > targetFloor(hass, row.target));
  return html`<section class="heating" aria-labelledby="heat-title">
    <div class="heat-head">
      <span class="section-label" id="heat-title">${icon("heat")}${t(hass, "heating")}</span>
      ${offered
        ? actionButton({
            label: t(hass, "heating_off"),
            iconName: "power",
            kind: "plain",
            // Each heater's own off switch, for all: it only switches off.
            className: "heat-off",
            disabled: disabled || !hot.length || ctx.changing,
            onClick: () => ctx.setTargets(hot.map((row) => [row.target, targetFloor(hass, row.target)])),
          })
        : nothing}
    </div>
    <div class="heat-rows">${heaters.map((row) => (ctx.viewOnly ? heaterState(ctx, row) : heaterRow(ctx, row, { disabled, offered: offFor(row) })))}</div>
    ${airductRow(ctx)}
  </section>`;
}
