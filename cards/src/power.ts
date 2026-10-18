// The smart plugs BamBuddy links to the printer (2026-10-18): the block
// "Power" in the Status tab -- one row per plug, the printer's own first,
// its figures only where it reports them, a question before every off
// (his decision) --, our switch-off after the print under the printer's
// plug, the offline view of a printer whose plug is off, and the chip.
// Plugs are set up in BamBuddy, not here: the card switches them only.
import { html, nothing, type TemplateResult } from "lit";

import { plugAttribute } from "./discovery";
import { formatEndTime, formatEnergy, formatPercent, formatPower, formatState, formatTemperature, numericState, stateOf } from "./format";
import { icon } from "./icons";
import { t, type TextKey } from "./i18n";
import { actionButton, heaters, note, radioKeys, radioStop, type CardContext, type Confirmation } from "./parts";
import type { PlugRefs } from "./types";

/** Our switch-off after the print waits at most so long after the plug went
 * on before the card stops counting: BamBuddy reconnects in 30 to 90 s. */
const STARTING_FOR = 180_000;
/** The default of our switch-off after the print (his decision). */
const DEFAULT_AUTO_OFF = 50;
/** A tap on the switch-off's stepper. */
const AUTO_OFF_STEP = 5;
const AUTO_OFF_MIN = 30;
const AUTO_OFF_MAX = 100;
/** Above it, an offline printer's plug may well feed a print. */
const IDLE_POWER = 50;

const powersPrinter = (ctx: CardContext, plug: PlugRefs): boolean => plugAttribute(ctx.hass, plug, "powers_printer") === true;
const bambuddyAutoOff = (ctx: CardContext, plug: PlugRefs): boolean => plugAttribute(ctx.hass, plug, "bambuddy_auto_off") === true;

/** The plugs the card shows: those BamBuddy shows on its own printer card,
 * the printer's own plug first, the others by name. */
export const shownPlugs = (ctx: CardContext): PlugRefs[] => {
  const main = (plug: PlugRefs): number => Number(plug.power !== undefined && powersPrinter(ctx, plug));
  return ctx.refs.plugs.filter((plug) => plugAttribute(ctx.hass, plug, "on_printer_card") !== false).sort((a, b) => main(b) - main(a));
};

/** The shown plug that powers the printer. */
export const printerPlug = (ctx: CardContext): PlugRefs | undefined => shownPlugs(ctx).find((plug) => plug.power && powersPrinter(ctx, plug));

/** A plug's state: on, off, unknown (it does not say), unavailable. */
const plugState = (ctx: CardContext, plug: PlugRefs): string => stateOf(ctx.hass, plug.power ?? plug.run)?.state ?? "unavailable";

/** The plugs may be switched from the card: their switches exist (the key
 * may switch plugs), and the card does not only show. */
const canSwitch = (ctx: CardContext): boolean => !ctx.settings.readOnly;

/** The hottest nozzle now. */
function hottestNozzle(ctx: CardContext): number | undefined {
  const values = heaters(ctx)
    .filter(({ kind }) => kind === "nozzle")
    .map(({ heater }) => numericState(ctx.hass, heater.sensor))
    .filter((value): value is number => value !== undefined);
  return values.length ? Math.max(...values) : undefined;
}

/** The switch-off after the print as its switch reports it. */
/** What a wait waits for, in the card's words (the nozzle: its temperature). */
const WAITING: Record<string, TextKey> = {
  drying: "auto_off_waiting_drying",
  filament: "auto_off_waiting_filament",
  heating: "auto_off_waiting_heating",
  printer: "auto_off_waiting_printer",
  plug: "auto_off_waiting_plug",
};

function autoOffOf(
  ctx: CardContext,
  plug: PlugRefs,
): { armed: boolean; phase: string; since?: string; temperature: number; every: boolean; waitingFor?: string; switching: boolean } | undefined {
  const state = stateOf(ctx.hass, plug.autoOff);
  if (!state) return undefined;
  const attributes = state.attributes;
  const temperature = typeof attributes["temperature"] === "number" ? attributes["temperature"] : (numericState(ctx.hass, plug.autoOffTemperature) ?? DEFAULT_AUTO_OFF);
  return {
    armed: state.state === "on",
    phase: typeof attributes["phase"] === "string" ? attributes["phase"] : "idle",
    ...(typeof attributes["since"] === "string" ? { since: attributes["since"] } : {}),
    temperature,
    // Only after the next print unless said otherwise (his word, the integration's default).
    every: attributes["every_print"] === true,
    ...(typeof attributes["waiting_for"] === "string" ? { waitingFor: attributes["waiting_for"] } : {}),
    switching: attributes["switching"] === true,
  };
}

const waiting = (ctx: CardContext, plug: PlugRefs | undefined): boolean => !!plug && autoOffOf(ctx, plug)?.phase === "waiting";

// --- Switching ----------------------------------------------------------------

/** The question before a plug goes off (his decision: every plug). The
 * printer's: in red during a job -- it ends the print --, and offline, where
 * BamBuddy cannot say whether it prints, unless the plug draws as little as
 * an idle printer; else what follows, and a hot nozzle; an accessory's: what
 * hangs on it. */
function offQuestion(ctx: CardContext, plug: PlugRefs): Confirmation {
  const { hass, refs } = ctx;
  const entityId = plug.power as string;
  const action: [string, string, Record<string, unknown>] = ["switch", "turn_off", { entity_id: entityId }];
  const key = `plug_${entityId}`;
  const confirm = t(hass, "plug_off_confirm");
  const keep = t(hass, "plug_off_keep");
  if (!powersPrinter(ctx, plug)) return { title: t(hass, "plug_off_title", { plug: plug.name }), text: t(hass, "plug_off_text"), confirm, keep, action, key };
  if (ctx.online && ctx.busy) {
    const raw = formatState(hass, refs.job);
    const job = raw ? raw.replace(/(\.gcode)?\.(3mf|gcode)$/i, "") || raw : undefined;
    const progress = numericState(hass, refs.progress);
    return {
      title: t(hass, "plug_off_title_print"),
      text: job && progress !== undefined ? t(hass, "plug_off_text_print", { job, progress: formatPercent(hass, progress) }) : t(hass, "plug_off_text_print_plain"),
      note: t(hass, "plug_off_print_note"),
      noteTone: "warning",
      confirm,
      keep,
      danger: true,
      action,
      key,
    };
  }
  if (!ctx.online) {
    const watts = numericState(hass, plug.watts);
    return {
      title: t(hass, "plug_off_title_printer"),
      text: watts === undefined ? t(hass, "plug_off_text_offline_plain") : t(hass, "plug_off_text_offline", { power: formatPower(hass, watts) }),
      confirm,
      keep,
      danger: watts === undefined || watts > IDLE_POWER,
      action,
      key,
    };
  }
  const nozzle = hottestNozzle(ctx);
  const hot = nozzle !== undefined && nozzle >= DEFAULT_AUTO_OFF;
  return {
    title: t(hass, "plug_off_title_printer"),
    text: t(hass, "plug_off_text_printer", { plug: plug.name }),
    ...(hot ? { note: t(hass, "plug_off_hot", { temperature: formatTemperature(hass, nozzle) }), noteTone: "warning" as const } : {}),
    confirm,
    keep,
    action,
    key,
  };
}

/** On at once; off after the question. */
function switchPlug(ctx: CardContext, plug: PlugRefs, on: boolean): void {
  if (on) ctx.toggleSwitch(plug.power as string);
  else ctx.confirm(offQuestion(ctx, plug));
}

function toggleButton(ctx: CardContext, entityId: string, label: string, onClick: () => void): TemplateResult {
  const on = ctx.switchOn(entityId);
  const pending = ctx.isPending(`switch_${entityId}`) || ctx.isPending(`plug_${entityId}`);
  return html`<button
    class="det-switch"
    role="switch"
    aria-label=${label}
    aria-checked=${on ? "true" : "false"}
    aria-busy=${pending ? "true" : "false"}
    ?disabled=${pending}
    @click=${onClick}
  >
    <span class="toggle" aria-hidden="true"><span class="knob"></span></span>
  </button>`;
}

// --- The rows -----------------------------------------------------------------

/** "On · 182 W · today 1.27 kWh": the state, then what the plug reports. */
function figures(ctx: CardContext, plug: PlugRefs, state: string): TemplateResult {
  const { hass } = ctx;
  const watts = numericState(hass, plug.watts);
  const today = numericState(hass, plug.energyToday);
  const parts: TemplateResult[] = [html`${t(hass, state === "on" ? "on" : state === "off" ? "off" : "unknown")}`];
  if (watts !== undefined) parts.push(html`<b>${formatPower(hass, watts)}</b>`);
  if (today !== undefined) parts.push(html`${t(hass, "plug_today", { energy: formatEnergy(hass, today) })}`);
  return html`${parts.map((part, index) => (index ? html` · ${part}` : part))}`;
}

function plugRow(ctx: CardContext, plug: PlugRefs, tagged: boolean): TemplateResult {
  const { hass } = ctx;
  const state = plugState(ctx, plug);
  const script = !plug.power && plug.run !== undefined;
  let sub: TemplateResult | string;
  let control: TemplateResult | typeof nothing = nothing;
  let below: TemplateResult | typeof nothing = nothing;
  let hint: string | undefined;
  let tone = "";
  if (script) {
    sub = t(hass, "plug_script");
    if (canSwitch(ctx) && state !== "unavailable") {
      const key = `run_${plug.run}`;
      control = actionButton({
        label: t(hass, "plug_run"),
        aria: t(hass, "plug_run_named", { plug: plug.name }),
        iconName: "play",
        pending: ctx.isPending(key),
        onClick: () => ctx.run(key, "button", "press", { entity_id: plug.run }),
      });
    }
  } else if (state === "unavailable") {
    sub = t(hass, "plug_unreachable");
    tone = "warn";
  } else if (state === "unknown" && plug.switchable) {
    sub = t(hass, "plug_unknown");
    if (canSwitch(ctx)) {
      below = html`<div class="p-set" role="group" aria-label=${plug.name}>
        ${([false, true] as const).map(
          (on) => html`<button class="btn tonal" @click=${() => switchPlug(ctx, plug, on)}>${t(hass, on ? "backup_turn_on" : "backup_turn_off")}</button>`,
        )}
      </div>`;
    }
  } else {
    sub = figures(ctx, plug, state);
    if (plug.switchable && canSwitch(ctx)) control = toggleButton(ctx, plug.power as string, plug.name, () => switchPlug(ctx, plug, !ctx.switchOn(plug.power as string)));
    else if (plugAttribute(hass, plug, "plug_type") === "mqtt") hint = t(hass, "plug_monitor");
  }
  const on = state === "on";
  return html`<div class="p-row ${tone} ${script ? "p-script" : ""}">
      <span class="p-icon ${on ? "on" : ""}" aria-hidden="true">${icon(script ? "script" : on || state === "unknown" ? "plug" : "plugOff")}</span>
      <span class="p-text">
        <span class="p-name">${plug.name}${tagged ? html` <span class="temp-tag">${t(hass, "plug_printer_tag")}</span>` : nothing}</span>
        <span class="p-sub">${sub}</span>
        ${hint ? html`<span class="p-sub">${hint}</span>` : nothing}
      </span>
      ${control}
    </div>
    ${below}`;
}

/** Under the printer's plug: ours, or BamBuddy's own auto off as a note. */
function autoOffRow(ctx: CardContext, plug: PlugRefs): TemplateResult | typeof nothing {
  const { hass } = ctx;
  if (!ctx.settings.showAutoOff || !powersPrinter(ctx, plug)) return nothing;
  const auto = autoOffOf(ctx, plug);
  const bambuddy = bambuddyAutoOff(ctx, plug);
  if (!auto && !bambuddy) return nothing;
  // A plug BamBuddy cannot reach switches nothing: the row only where it is
  // on -- it waits for the plug then (his word).
  if (plugState(ctx, plug) === "unavailable" && !auto?.armed) return nothing;
  const temperature = formatTemperature(hass, auto?.temperature ?? DEFAULT_AUTO_OFF);
  const pending = auto?.phase === "waiting" && !bambuddy;
  const title = pending ? t(hass, "auto_off_waiting_title") : t(hass, "auto_off_title");
  let sub: string;
  if (bambuddy) sub = t(hass, "auto_off_bambuddy");
  else if (pending) {
    const now = hottestNozzle(ctx);
    const why = auto?.waitingFor;
    sub = auto?.switching
      ? t(hass, "auto_off_switching")
      : why && why !== "nozzle" && WAITING[why]
        ? t(hass, WAITING[why] as TextKey)
        : t(hass, "auto_off_waiting", { temperature, now: now === undefined ? "—" : formatTemperature(hass, now) });
  } else if (auto?.phase === "failed_print") sub = t(hass, auto.every ? "auto_off_failed" : "auto_off_failed_next");
  else if (auto?.phase === "gave_up") sub = t(hass, "auto_off_gave_up");
  else if (auto?.phase === "skipped" && auto.armed) sub = t(hass, "auto_off_skipped");
  else if (auto?.armed) sub = t(hass, auto.every ? "auto_off_every" : "auto_off_next", { temperature });
  else sub = t(hass, "auto_off_disarmed");
  const settable = canSwitch(ctx) && !bambuddy && !!plug.autoOff;
  const text = html`<span class="p-name">${title}</span>
    <span class="p-sub">${sub}</span>`;
  // Shown only, its line says it all: no state word beside it.
  const control = settable ? toggleButton(ctx, plug.autoOff as string, t(hass, "auto_off_title"), () => ctx.toggleSwitch(plug.autoOff as string)) : nothing;
  const skip = pending && settable && !auto?.switching && plug.autoOffSkip && stateOf(hass, plug.autoOffSkip)?.state !== "unavailable"
    ? actionButton({
        label: t(hass, "auto_off_skip"),
        iconName: "timerOff",
        pending: ctx.isPending(`skip_${plug.autoOffSkip}`),
        onClick: () => ctx.run(`skip_${plug.autoOffSkip}`, "button", "press", { entity_id: plug.autoOffSkip }),
      })
    : nothing;
  return html`<div class="p-row p-auto ${pending ? "waiting" : ""}">
      <span class="p-icon" aria-hidden="true">${icon(auto?.armed || bambuddy ? "timer" : "timerOff")}</span>
      ${settable && plug.autoOffTemperature
        ? html`<button class="p-text p-open" aria-label="${title}: ${sub}" aria-haspopup="dialog" @click=${() => ctx.openDialog("auto_off")}>
            <span class="p-open-text">${text}</span><span class="p-chevron" aria-hidden="true">${icon("chevronRight")}</span>
          </button>`
        : html`<span class="p-text">${text}</span>`}
      ${control}
    </div>
    ${skip === nothing ? nothing : html`<div class="p-skip">${skip}</div>`}`;
}

/** The plugs' rows, the printer's first with its switch-off under it. */
function plugRows(ctx: CardContext): TemplateResult[] {
  const plugs = shownPlugs(ctx);
  const main = printerPlug(ctx);
  return plugs.map((plug) => html`${plugRow(ctx, plug, plugs.length > 1 && plug === main)}${plug === main ? autoOffRow(ctx, plug) : nothing}`);
}

/** The block "Power", where the printer has a plug BamBuddy shows. */
export function powerSection(ctx: CardContext): TemplateResult | typeof nothing {
  if (!shownPlugs(ctx).length) return nothing;
  return html`<section class="power" aria-labelledby="power-title">
    <div class="speed-label" id="power-title">${icon("bolt")}<span>${t(ctx.hass, "power_title")}</span></div>
    <div class="power-box">${plugRows(ctx)}</div>
  </section>`;
}

// --- Dialogs ------------------------------------------------------------------

/** The chip's dialog: the plugs' rows. */
export function powerContent(ctx: CardContext): TemplateResult {
  return html`<h2 id="dlg-title">${t(ctx.hass, "power_title")}</h2>
    <div class="power-box">${plugRows(ctx)}</div>`;
}

/** The switch-off after the print: its temperature and when. */
export function autoOffContent(ctx: CardContext): TemplateResult {
  const { hass } = ctx;
  const plug = printerPlug(ctx);
  const auto = plug ? autoOffOf(ctx, plug) : undefined;
  const number = plug?.autoOffTemperature;
  const value = (number ? ctx.targetOf(number) : undefined) ?? auto?.temperature ?? DEFAULT_AUTO_OFF;
  const every = auto?.every ?? false;
  // The one-shot first, and the default (his word).
  const choices = [false, true] as const;
  const choose = (choice: boolean): void => {
    if (plug?.autoOffEveryPrint && choice !== every) {
      ctx.run(`every_${plug.autoOffEveryPrint}`, "switch", choice ? "turn_on" : "turn_off", { entity_id: plug.autoOffEveryPrint });
    }
  };
  return html`<h2 id="dlg-title">${t(hass, "auto_off_title")}</h2>
    <p class="dlg-label">${t(hass, "auto_off_temperature")}</p>
    <div class="stepper">
      ${actionButton({
        label: t(hass, "auto_off_lower", { step: AUTO_OFF_STEP }),
        iconName: "minus",
        iconOnly: true,
        disabled: !number || value <= AUTO_OFF_MIN,
        onClick: () => number && ctx.stepTarget(number, Math.max(AUTO_OFF_MIN, value - AUTO_OFF_STEP)),
      })}
      <output class="step-value" aria-live="polite">${formatTemperature(hass, value)}</output>
      ${actionButton({
        label: t(hass, "auto_off_raise", { step: AUTO_OFF_STEP }),
        iconName: "plus",
        iconOnly: true,
        disabled: !number || value >= AUTO_OFF_MAX,
        onClick: () => number && ctx.stepTarget(number, Math.min(AUTO_OFF_MAX, value + AUTO_OFF_STEP)),
      })}
    </div>
    <p class="dlg-label" id="auto-off-when">${t(hass, "auto_off_when")}</p>
    <div class="seg auto-off-when" role="radiogroup" aria-labelledby="auto-off-when" @keydown=${radioKeys}>
      ${choices.map(
        (choice, index) => html`<button
          class="seg-btn ${choice === every ? "on" : ""}"
          role="radio"
          aria-checked=${choice === every ? "true" : "false"}
          tabindex=${index === radioStop(choices, every) ? "0" : "-1"}
          @click=${() => choose(choice)}
        >
          ${t(hass, choice ? "auto_off_every_choice" : "auto_off_next_choice")}
        </button>`,
      )}
    </div>
    <p class="hint">${t(hass, "auto_off_dialog_note")}</p>`;
}

// --- The chip -----------------------------------------------------------------

/** The chip: the printer's plug, else the first that switches -- a script
 * says nothing of the power. Green while power flows to an online printer. */
export function powerPill(ctx: CardContext, open: () => void): TemplateResult | typeof nothing {
  const { hass } = ctx;
  const plug = printerPlug(ctx) ?? shownPlugs(ctx).find((item) => item.power);
  if (!plug) return nothing;
  const state = plugState(ctx, plug);
  const watts = numericState(hass, plug.watts);
  const power = watts !== undefined ? formatPower(hass, watts) : undefined;
  const [tone, iconName, label, said] =
    state === "unavailable"
      ? (["warn", "plugOff", t(hass, "chip_power_unreachable"), t(hass, "chip_power_unreachable")] as const)
      : state === "off"
        ? (["neutral", "plugOff", t(hass, "chip_power_off"), t(hass, "off")] as const)
        : state !== "on"
          ? (["neutral", "plug", t(hass, "chip_power_unknown"), t(hass, "unknown")] as const)
          : waiting(ctx, plug)
            ? (["info", "timer", t(hass, "auto_off_waiting_title"), t(hass, "auto_off_waiting_title")] as const)
            : ([ctx.online ? "ok" : "neutral", "bolt", power ?? t(hass, "chip_power_on"), power ? `${t(hass, "on")}, ${power}` : t(hass, "on")] as const);
  const aria = t(hass, "chip_power_aria", { plug: plug.name, state: said });
  // Its watts change with every read: not read out each time (as the drying chip's countdown).
  return html`<button class="pill power-chip tone-${tone}" aria-label=${aria} title=${aria} aria-live="off" @click=${open}>${icon(iconName)}<span>${label}</span></button>`;
}

// --- The offline view ---------------------------------------------------------

/** "0:42": minutes and seconds since the plug went on. */
const clock = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** How long ago the printer's plug went on while the printer is still
 * offline, while the card counts; undefined otherwise. */
export function starting(ctx: CardContext, now = Date.now()): number | undefined {
  const plug = printerPlug(ctx);
  if (ctx.online || ctx.unreachable || !plug || plugState(ctx, plug) !== "on") return undefined;
  // Off to on as the integration saw it: not a restart, not a plug that answers again.
  const changed = plugAttribute(ctx.hass, plug, "on_since");
  const since = typeof changed === "string" ? now - new Date(changed).getTime() : Number.NaN;
  return since >= 0 && since < STARTING_FOR ? since : undefined;
}

/** The offline view of a printer with a plug that powers it: off -- say so,
 * and switch it on --, just switched on -- count --, on for long -- what
 * is wrong. Undefined where the plug tells nothing. */
export function offlinePower(ctx: CardContext): { info: TemplateResult; actions?: TemplateResult } | undefined {
  const { hass } = ctx;
  const plug = printerPlug(ctx);
  if (ctx.online || ctx.unreachable || !plug) return undefined;
  const state = plugState(ctx, plug);
  const watts = numericState(hass, plug.watts);
  if (state === "off") {
    const auto = autoOffOf(ctx, plug);
    const done = auto?.phase === "done" && auto.since ? formatEndTime(hass, auto.since) : undefined;
    const key = `plug_${plug.power}`;
    return {
      info: html`${note(t(hass, "offline_plug_off", { plug: plug.name }), "info")}${done ? html`<p class="hint">${t(hass, "auto_off_done_at", { time: done })}</p>` : nothing}`,
      ...(plug.switchable && canSwitch(ctx)
        ? {
            actions: html`<div class="offline-actions">
              ${actionButton({
                label: t(hass, "power_on"),
                iconName: "power",
                kind: "primary",
                pending: ctx.isPending(key),
                onClick: () => ctx.run(key, "switch", "turn_on", { entity_id: plug.power }),
              })}
            </div>`,
          }
        : { actions: html`` }),
    };
  }
  if (state !== "on") return undefined;
  const since = starting(ctx);
  if (since !== undefined) {
    return {
      info: html`<div class="p-starting">
        <span class="check-spinner" aria-hidden="true"></span>
        <span class="p-text">
          <span class="p-name">${t(hass, "power_starting", { time: clock(since) })}</span>
          <span class="p-sub">${t(hass, "power_starting_text")}</span>
          ${watts !== undefined ? html`<span class="p-sub">${t(hass, "power_plug_on", { power: formatPower(hass, watts) })}</span>` : nothing}
        </span>
      </div>`,
      actions: html``,
    };
  }
  const hint =
    watts === undefined
      ? nothing
      : html`<p class="hint">${watts > 0 ? t(hass, "offline_plug_on_power", { power: formatPower(hass, watts) }) : t(hass, "offline_plug_on_zero")}</p>`;
  if (hint === nothing && !(plug.switchable && canSwitch(ctx))) return undefined;
  return {
    info: html`${note(t(hass, "offline_text"), "warning")}${hint}`,
    // Off and on again: what helps a printer BamBuddy cannot reach.
    actions: html`<div class="offline-actions">
      ${actionButton({ label: t(hass, "check_connection"), iconName: "lan", onClick: ctx.checkConnection })}
      ${plug.switchable && canSwitch(ctx)
        ? actionButton({ label: t(hass, "power_off_plug"), iconName: "power", onClick: () => switchPlug(ctx, plug, false) })
        : nothing}
    </div>`,
  };
}
