// The heating and ventilation block of the control view: each heater's
// target with -5 / +5 steppers and its power symbol; on a printer with an
// airduct, the ventilation (the airduct on cooling
// and the fans that bring the air through) in 10 % steps, and on one without
// a chamber heater (the P2S) "keep warm" (the airduct on heating). A tap
// changes the value shown at once; the card sends it when the taps stop (see
// card.ts, stepTarget), so a few taps are one command. What does not go
// together locks the other (`locks`), never the way off.
import { html, nothing, type TemplateResult } from "lit";

import { formatPercent, formatTemperature, formatTemperatureOf, fromCelsius, listedOptions, numericState, stateOf, targetFloor, temperatureUnit } from "./format";
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

function heaterRow(ctx: CardContext, row: Row, options: { disabled: boolean; offered: boolean; locked: boolean }): TemplateResult {
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
        disabled: options.disabled || off || options.locked,
        onClick: () => ctx.stepTarget(row.target, lowered),
      })}
      ${heatTarget(ctx, row, target, true)}
      ${actionButton({
        label: off ? t(hass, "heat_start", { what, value: formatTemperature(hass, start, unit) }) : t(hass, "heat_raise", { what, step: TARGET_STEP, unit }),
        iconName: "plus",
        iconOnly: true,
        disabled: options.disabled || options.locked || (!off && (target as number) >= max),
        onClick: () => ctx.stepTarget(row.target, raised),
      })}
    </div>
    ${powerCell({
      label: off ? t(hass, "heat_start", { what, value: formatTemperature(hass, start, unit) }) : t(hass, "heat_off", { what }),
      on: !off,
      tone: "heat",
      // Locked, it keeps only the way off.
      usable: options.offered && (!options.locked || !off),
      // Switching off waits during a filament change, which cooling would break.
      disabled: options.disabled || (!off && ctx.changing),
      onClick: () => ctx.setTargets([[row.target, off ? start : floor]]),
    })}
  </div>`;
}

/** A row's power symbol: a switch, on in the tone of what it does (heat
 * orange, ventilation blue), off neutral. Where it cannot be used its place
 * stays, so the steppers of the block stand one under the other. */
export function powerCell(options: {
  label: string;
  on: boolean;
  tone: "heat" | "vent";
  usable: boolean;
  disabled: boolean;
  onClick: () => void;
}): TemplateResult {
  if (!options.usable) return html`<span class="heat-off-space" aria-hidden="true"></span>`;
  return actionButton({
    label: options.label,
    iconName: "power",
    iconOnly: true,
    kind: "plain",
    className: `heat-off tone-${options.tone}${options.on ? " on" : ""}`,
    disabled: options.disabled,
    onClick: options.onClick,
  });
}

/** Where the ventilation's „+“ starts, and its step: tens, as Bambu's apps
 * set the fans (the integration's VENT_START). */
const VENT_START = 60;
const VENT_STEP = 10;
const KEEP_WARM: readonly string[] = ["cooling", "heating"];

/** The fans the ventilation runs, as the row's subtitle. */
const VENT_FANS: Readonly<Record<string, TextKey>> = {
  exhaust: "vent_fans_exhaust",
  "right_aux exhaust": "vent_fans_right_aux_exhaust",
  aux: "vent_fans_aux",
  "aux exhaust": "vent_fans_aux_exhaust",
};

interface Locks {
  /** The chamber's row (or the P2S's keep-warm row) waits: why. */
  chamber?: TextKey;
  /** The ventilation waits: why. */
  vent?: TextKey;
  /** The ventilation goes, with something to know. */
  hint?: TextKey;
}

/** The airduct printer without a chamber heater BamBuddy reports (the P2S):
 * its chamber is kept warm by the airduct on heating. */
const keepsWarm = (ctx: CardContext): boolean => ctx.refs.airduct !== undefined && ctx.refs.chamber.target === undefined;

function fansOf(ctx: CardContext): string[] {
  const fans = stateOf(ctx.hass, ctx.refs.ventilation)?.attributes["fans"];
  return Array.isArray(fans) ? fans.filter((fan): fan is string => typeof fan === "string") : [];
}

/** What the chamber does besides a heater's target, as the printer reports
 * it: kept warm (the P2S's airduct on heating) or ventilated at a speed --
 * for the Status tab's chamber tile. */
export function chamberActivity(ctx: CardContext): { kind: "warm" } | { kind: "vent"; percent: number } | undefined {
  const { hass, refs } = ctx;
  if (keepsWarm(ctx) && stateOf(hass, refs.airduct)?.state === "heating") return { kind: "warm" };
  const vent = stateOf(hass, refs.ventilation);
  const percent = vent?.attributes["percentage"];
  return vent?.state === "on" && typeof percent === "number" && percent > 0 ? { kind: "vent", percent } : undefined;
}

/** What locks what: the chamber heated locks the ventilation, the
 * ventilation the chamber; a print or a filament change keeps the mode it
 * set. A locked part that is on keeps its way off. */
export function locks(ctx: CardContext): Locks {
  const { hass, refs } = ctx;
  const airduct = stateOf(hass, refs.airduct)?.state;
  const warm = keepsWarm(ctx);
  if (ctx.busy) {
    if (airduct === "cooling") {
      return { ...(warm ? {} : { chamber: "chamber_cooling_print" as const }), hint: fansOf(ctx).length > 1 ? "vent_print_cooling_two" : "vent_print_cooling" };
    }
    if (airduct === "heating") return { vent: "vent_heating_print" };
    if (airduct === "laser") return { vent: "airduct_laser_now" };
    return {};
  }
  if (ctx.changing) {
    return { ...(airduct === "cooling" && !warm ? { chamber: "changing_reason" as const } : {}), ...(airduct !== "cooling" ? { vent: "changing_reason" as const } : {}) };
  }
  // On while the tap or the printer's report says so: the other part waits
  // until the printer reports this one off, as the integration does.
  const target = refs.chamber.target;
  const heats = warm
    ? airduct === "heating"
    : target !== undefined && Math.max(ctx.targetOf(target) ?? 0, numericState(hass, target) ?? 0) > targetFloor(hass, target);
  const vent = refs.ventilation;
  const reported = vent !== undefined && stateOf(hass, vent)?.state === "on";
  const ventilated = airduct === "cooling" && vent !== undefined && ((ctx.targetOf(vent) ?? 0) > 0 || reported);
  return {
    ...(heats ? { vent: warm ? ("vent_keep_warm" as const) : ("vent_chamber_heats" as const) } : {}),
    ...(ventilated ? { chamber: warm ? ("keep_warm_vent_on" as const) : ("chamber_vent_on" as const) } : {}),
    // Left over from a laser job: a tap leaves it, and says so beforehand.
    ...(airduct === "laser" && !heats ? { hint: "airduct_laser_idle" as const } : {}),
  };
}

/** The P2S's chamber row under „Heizen“: off or on -- the airduct on cooling
 * or on heating, which keeps the warmth in. The printer sets it at every
 * print start; it changes only without a print and a filament change. */
function keepWarmRow(ctx: CardContext, lock: Locks): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  const state = stateOf(hass, refs.airduct);
  if (!state || !keepsWarm(ctx)) return nothing;
  const on = state.state === "heating";
  const label = t(hass, "chamber");
  const name = html`<div class="heat-name ${on ? "on" : ""}">
    <span class="heat-label">${icon("chamber")}<span class="heat-title"><span class="heat-text">${label}</span></span></span>
    <span class="heat-now">${t(hass, "keep_warm")}</span>
  </div>`;
  if (ctx.viewOnly) {
    return html`<div class="heat-row view keep-warm">${name}<span class="heat-target ${on ? "" : "off"}">${t(hass, on ? "on" : "heater_off")}</span></div>`;
  }
  const options = listedOptions(state, KEEP_WARM, false).filter((option) => KEEP_WARM.includes(option));
  const waiting = !ctx.online || ctx.busy || ctx.changing || state.state === "unavailable";
  // Locked by the ventilation, it keeps only the way off.
  const blocked = (option: string): boolean => waiting || (lock.chamber !== undefined && option === "heating");
  // The keyboard comes in on an option it can choose.
  const chosen = radioStop(options, state.state);
  const stop = blocked(options[chosen] ?? "") ? Math.max(0, options.findIndex((option) => !blocked(option))) : chosen;
  const pending = ctx.isPending("airduct");
  const group = `${label}, ${t(hass, "keep_warm")}`;
  return html`<div class="heat-row keep-warm">
    ${name}
    <div class="seg" role="radiogroup" aria-label=${group} @keydown=${radioKeys} @focusout=${radioLeave}>
      ${options.map(
        (option, index) => html`<button
          role="radio"
          aria-checked=${option === state.state ? "true" : "false"}
          tabindex=${index === stop ? 0 : -1}
          aria-disabled=${pending ? "true" : nothing}
          ?disabled=${blocked(option)}
          @click=${() => ctx.run("airduct", "select", "select_option", { entity_id: refs.airduct, option })}
        >
          ${t(hass, option === "heating" ? "on" : "heater_off")}
        </button>`,
      )}
    </div>
    <span class="heat-off-space" aria-hidden="true"></span>
  </div>`;
}

/** The note under the heaters: why the chamber (or keep-warm) row waits. */
function chamberNote(ctx: CardContext, lock: Locks): TemplateResult | typeof nothing {
  if (ctx.viewOnly) return nothing;
  if (keepsWarm(ctx) && stateOf(ctx.hass, ctx.refs.airduct)) {
    const reason: TextKey | undefined = ctx.busy ? "airduct_busy" : ctx.changing ? "changing_reason" : lock.chamber;
    return reason ? note(t(ctx.hass, reason)) : nothing;
  }
  return lock.chamber && ctx.refs.chamber.target ? note(t(ctx.hass, lock.chamber)) : nothing;
}

/** „Lüften“: the chamber's ventilation -- off, or the airduct on cooling with
 * its fans at a speed in tens; locked where `locks` says, never its way off. */
function ventilationPart(ctx: CardContext, lock: Locks): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  const entity = refs.ventilation;
  if (!entity) return nothing;
  const state = stateOf(hass, entity);
  const available = state !== undefined && state.state !== "unavailable" && state.state !== "unknown";
  const value = available ? ctx.targetOf(entity) : undefined;
  const on = (value ?? 0) > 0;
  const subtitle = VENT_FANS[fansOf(ctx).join(" ")];
  const label = t(hass, "chamber");
  const shown = value === undefined ? "—" : on ? formatPercent(hass, value) : t(hass, "heater_off");
  const name = html`<div class="heat-name vent ${on ? "on" : ""}">
    <span class="heat-label">${icon("fan")}<span class="heat-title"><span class="heat-text">${label}</span></span></span>
    <span class="heat-now">${subtitle ? t(hass, subtitle) : nothing}</span>
  </div>`;
  const said = html`<span class="sr-only">${t(hass, "vent_said")} </span>`;
  const head = html`<div class="heat-head vent-head">
    <span class="section-label" id="vent-title">${icon("fan")}${t(hass, "ventilation")}</span>
  </div>`;
  if (ctx.viewOnly) {
    return html`<div class="vent-part" role="group" aria-labelledby="vent-title">
      ${head}
      <div class="heat-rows"><div class="heat-row view">${name}<span class="heat-target ${on ? "" : "off"}">${said}${shown}</span></div></div>
    </div>`;
  }
  const locked = lock.vent !== undefined;
  const disabled = !ctx.online || !available;
  const current = value ?? 0;
  const startText = formatPercent(hass, VENT_START);
  const why = available ? (lock.vent ?? lock.hint) : undefined;
  return html`<div class="vent-part" role="group" aria-labelledby="vent-title">
    ${head}
    <div class="heat-rows">
      <div class="heat-row">
        ${name}
        <div class="heat-set">
          ${actionButton({
            label: t(hass, "vent_lower", { step: VENT_STEP }),
            iconName: "minus",
            iconOnly: true,
            disabled: disabled || locked || !on,
            onClick: () => ctx.stepTarget(entity, Math.max(0, current - VENT_STEP)),
          })}
          <output class="heat-target ${on ? "" : "off"}" aria-live="polite">${said}${shown}</output>
          ${actionButton({
            label: on ? t(hass, "vent_raise", { step: VENT_STEP }) : t(hass, "vent_start", { value: startText }),
            iconName: "plus",
            iconOnly: true,
            disabled: disabled || locked || current >= 100,
            onClick: () => ctx.stepTarget(entity, on ? Math.min(100, current + VENT_STEP) : VENT_START),
          })}
        </div>
        ${powerCell({
          label: on ? t(hass, "vent_off") : t(hass, "vent_start", { value: startText }),
          on,
          tone: "vent",
          usable: !locked || on,
          disabled,
          onClick: () => ctx.setTargets([[entity, on ? 0 : VENT_START]]),
        })}
      </div>
    </div>
    ${why ? note(t(hass, why)) : nothing}
  </div>`;
}

/** The section, where the printer has a target the card can set. */
export function heatingSection(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  const heaters = rows(ctx);
  if (!heaters.length) return nothing;
  const disabled = !ctx.online;
  // A heater's off would end a print: only without one -- but the
  // chamber's, which ends none (the job may set it again). It waits during a
  // filament change, which cooling would break.
  const offered = !ctx.busy && !ctx.viewOnly;
  const offFor = (row: Row): boolean => (offered || (row.kind === "chamber" && !ctx.viewOnly));
  const airduct = refs.airduct !== undefined || refs.ventilation !== undefined;
  const lock = airduct ? locks(ctx) : {};
  return html`<section class="heating" aria-labelledby="heat-title">
    <div class="heat-head">
      <span class="section-label" id="heat-title">${icon("heat")}${t(hass, "heating")}</span>
    </div>
    <div class="heat-rows">
      ${heaters.map((row) =>
        ctx.viewOnly ? heaterState(ctx, row) : heaterRow(ctx, row, { disabled, offered: offFor(row), locked: row.kind === "chamber" && lock.chamber !== undefined }),
      )}${keepWarmRow(ctx, lock)}
    </div>
    ${chamberNote(ctx, lock)}${ventilationPart(ctx, lock)}${airduct ? html`<p class="hint">${t(hass, "heat_vent_hint")}</p>` : nothing}
  </section>`;
}
