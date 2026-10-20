// The main view: what the printer is doing at a glance -- the job with its
// picture, state, progress and times, always on top; below it the blocks
// the user chose, in their order: the controls a running print needs, the
// smart plugs' power, temperatures, the loaded filament, fans, the print
// speed. The HMS messages are the head's chip.
import { html, nothing, type TemplateResult } from "lit";

import {
  BUSY,
  formatDuration,
  formatEndTime,
  formatPercent,
  formatState,
  formatTemperature,
  formatTemperatureOf,
  minutesOf,
  targetFloor,
  temperatureUnit,
  toCelsius,
  jobName,
  listedOptions,
  numericState,
  stateOf,
  toneOf,
  WITH_JOB,
} from "./format";
import { icon, type IconName } from "./icons";
import { t, type TextKey } from "./i18n";
import {
  actionButton,
  activeNozzleIndex,
  AMS_HT,
  amsActivity,
  asOnline,
  callout,
  developerHint,
  entityName,
  heaters,
  note,
  offlineText,
  radioKeys,
  radioLeave,
  radioStop,
  resumeButton,
  sample,
  sampleKey,
  sideName,
  slotOf,
  slotTitle,
  stopQuestion,
  swatch,
  unitModel,
  unitNozzle,
  type CardContext,
  type Slot,
} from "./parts";
import { offlinePower, powerSection } from "./power";
import { printerTitle } from "./header";
import type { Heater, StatusBlock } from "./types";

/** The plate to clear before BamBuddy starts the next queued print; the
 * button that confirms it where the card may control the printer -- else
 * the text says where it can be confirmed: in BamBuddy alone where Home
 * Assistant has no button for it. */
function plateCallout(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  // Not while a job runs: BamBuddy may not have reset its flag yet.
  if (stateOf(hass, refs.plateClearNeeded)?.state !== "on" || BUSY.has(ctx.status)) return nothing;
  if (!refs.plateCleared) return callout(t(hass, "plate_text_bambuddy"));
  if (!ctx.canControl) return callout(t(hass, "plate_text_read"));
  return callout(
    t(hass, "plate_text"),
    actionButton({
      label: t(hass, "plate_cleared"),
      iconName: "check",
      kind: "primary",
      pending: ctx.isPending("plate"),
      onClick: () => ctx.run("plate", "button", "press", { entity_id: refs.plateCleared }),
    }),
  );
}

/** Stages that say no more than the print status: the state line says that. */
const PLAIN_STAGES = new Set(["idle", "printing", "unknown", "unavailable"]);

/** Each print status's icon on the state line: never colour alone. Idle
 * is ready, not switched off: no power symbol. */
const STATE_ICONS: Record<string, IconName> = {
  idle: "ready",
  preparing: "timer",
  slicing: "timer",
  printing: "play",
  paused: "pause",
  finished: "check",
  failed: "error",
};

/** The state line under the job's name: the stage where it says more than
 * the print status ("Heating the bed", "Paused: filament ran out"), else
 * the status. It replaces a chip in the head: it stays with the job, which
 * the user cannot hide, and is announced when it changes. */
export function stateText(ctx: CardContext, withJob: boolean): string {
  const { hass, refs, status } = ctx;
  const stage = stateOf(hass, refs.stage)?.state;
  // After the print the job stays Finished or Failed: loading filament then
  // is the next print's -- the AMS line says it.
  const ended = status === "finished" || status === "failed";
  return (withJob && !ended && stage && !PLAIN_STAGES.has(stage) ? formatState(hass, refs.stage) : formatState(hass, refs.status, status)) ?? status;
}

function stateLine(ctx: CardContext, withJob: boolean): TemplateResult {
  const { status } = ctx;
  return html`<div class="state tone-${toneOf(status)}">${icon(STATE_ICONS[status] ?? "infoOutline")}<span>${stateText(ctx, withJob)}</span></div>`;
}

/** The printer offline, or no data from BamBuddy: its picture and why --
 * in every tab, which has nothing to show then. Offline, BamBuddy can
 * check the connection to it; without BamBuddy's data, nothing can. */
export function offlineJob(ctx: CardContext, picture: TemplateResult): TemplateResult {
  // The printer's plug says more: off (switch it on), starting, or on.
  const power = offlinePower(ctx);
  if (power) return html`<div class="job">${picture}<div class="job-info">${power.info}</div></div>${power.actions}`;
  const check = html`<div class="offline-actions">${actionButton({ label: t(ctx.hass, "check_connection"), iconName: "lan", onClick: ctx.checkConnection })}</div>`;
  return html`<div class="job">${picture}<div class="job-info">${note(offlineText(ctx, "offline_text"), "warning")}</div></div>
    ${ctx.unreachable ? nothing : check}`;
}

function jobBlock(ctx: CardContext, picture: TemplateResult): TemplateResult {
  const { hass, refs, status } = ctx;
  const tone = toneOf(status);
  if (!ctx.online) return offlineJob(ctx, picture);
  const withJob = WITH_JOB.has(status);
  const raw = withJob ? formatState(hass, refs.job) : undefined;
  const job = raw === undefined ? undefined : jobName(raw);
  const progress = status === "finished" ? 100 : numericState(hass, refs.progress);
  const meta: [IconName, string][] = [];
  const layer = numericState(hass, refs.layer);
  const total = numericState(hass, refs.totalLayers);
  if (withJob && layer && total) meta.push(["layers", t(hass, "layer", { current: layer, total })]);
  const remaining = minutesOf(hass, refs.remaining);
  if (BUSY.has(status) && remaining) meta.push(["timer", t(hass, "remaining", { time: formatDuration(hass, remaining) })]);
  const end = stateOf(hass, refs.endTime)?.state;
  const endText = BUSY.has(status) && end ? formatEndTime(hass, end) : undefined;
  if (endText) meta.push(["clock", t(hass, "ends", { time: endText })]);
  // A failed print shows how far it got by its layers: the firmware resets
  // the progress to 0 % when a print is stopped.
  const showBar = withJob && status !== "failed" && progress !== undefined;
  const activity = amsActivity(ctx);
  return html`<div class="job">
    ${picture}
    <div class="job-info">
      <div class="job-top">
        <span class="job-name" title=${job ?? ""}>${job ?? t(hass, "no_job")}</span>
        ${showBar ? html`<span class="pct tone-${tone}">${formatPercent(hass, progress)}</span>` : nothing}
      </div>
      ${stateLine(ctx, withJob)}
      ${activity
        ? html`<div class="ams-activity" role="status">${icon("sync")}<span class="sr-only">${printerTitle(ctx)}: </span><span>${activity}</span></div>`
        : nothing}
      ${showBar
        ? html`<div
            class="bar tone-${tone}"
            role="progressbar"
            aria-label=${t(hass, "progress")}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow=${progress}
          >
            <span style="width: ${Math.max(0, Math.min(100, progress))}%"></span>
          </div>`
        : nothing}
      ${meta.length ? html`<div class="meta">${meta.map(([name, text]) => html`<span>${icon(name)}${text}</span>`)}</div>` : nothing}
    </div>
  </div>`;
}

/** A temperature: the active one of two nozzles says so during a job. */
function temperatureTile(ctx: CardContext, label: string, heater: Heater, iconName: IconName, active = false): TemplateResult {
  const { hass } = ctx;
  const current = numericState(hass, heater.sensor);
  const target = numericState(hass, heater.target);
  // Each in its entity's unit: Home Assistant may show them in °F.
  const on = target !== undefined && target > targetFloor(hass, heater.target);
  // 3 °C, compared in one unit.
  const heating =
    on &&
    current !== undefined &&
    toCelsius(target as number, temperatureUnit(hass, heater.target)) - toCelsius(current, temperatureUnit(hass, heater.sensor)) > 3;
  const value = current === undefined ? "—" : formatTemperatureOf(hass, heater.sensor, current);
  const targetText =
    target === undefined
      ? undefined
      : on
        ? t(hass, "target", { value: formatTemperatureOf(hass, heater.target, target) })
        : t(hass, "heater_off");
  return html`<button
    class="temp ${heating ? "heating" : ""}"
    aria-label=${[active ? `${label} ${t(hass, "nozzle_active")}` : label, value, targetText].filter(Boolean).join(", ")}
    @click=${() => ctx.moreInfo(ctx.viewOnly ? heater.sensor : (heater.target ?? heater.sensor))}
  >
    <span class="temp-head"
      >${icon(heating ? "heat" : iconName)}<span>${label}</span> ${active ? html`<span class="temp-tag">${t(hass, "nozzle_active")}</span>` : nothing}</span
    >
    <span class="temp-value">${value}</span>
    ${targetText ? html`<span class="temp-target">${targetText}</span>` : nothing}
  </button>`;
}

function temperatures(ctx: CardContext): TemplateResult | typeof nothing {
  const shown = heaters(ctx).filter(({ heater }) => heater.sensor || heater.target);
  if (!shown.length) return nothing;
  // Two nozzles: "Rechte Düse" needs the room of two columns on a phone.
  // The one that prints, during a job; idle, the Control tab says which one
  // a load or an extrusion goes to.
  const active = ctx.busy ? activeNozzleIndex(ctx) : undefined;
  return html`<div class="temps n${shown.length} ${ctx.refs.dual ? "dual" : ""}">
    ${shown.map(({ label, heater, kind, index }) => temperatureTile(ctx, label, heater, kind, kind === "nozzle" && index === active))}
  </div>`;
}

/** A fan's speed in percent: 0 when off, unknown while unavailable. */
function fanPercent(ctx: CardContext, entityId: string): number | undefined {
  const state = stateOf(ctx.hass, entityId);
  if (!state || (state.state !== "on" && state.state !== "off")) return undefined;
  const percentage = state.attributes["percentage"];
  return state.state === "off" ? 0 : typeof percentage === "number" ? percentage : 100;
}

function fans(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  // A fan Home Assistant only restored: the integration no longer creates it.
  const items: [key: string, entityId: string, percent: number | undefined][] = refs.fans
    .filter((fan) => stateOf(hass, fan.entityId)?.attributes["restored"] !== true)
    .map((fan) => [fan.key, fan.entityId, fanPercent(ctx, fan.entityId)]);
  if (refs.hotendFan) items.push(["hotend", refs.hotendFan, numericState(hass, refs.hotendFan)]);
  if (!items.length) return nothing;
  // A short name on a narrow card, the entity's own where there is room;
  // both start alike, and the entity's names the chip.
  return html`<div class="fans" role="group" aria-label=${t(hass, "fans")}>
    ${items.map(([key, entityId, percent]) => {
      const short = t(hass, `fan_${key}` as TextKey);
      const full = entityName(ctx, entityId, `fan_${key}_name` as TextKey);
      const value = percent === undefined ? "—" : percent > 0 ? formatPercent(hass, percent) : t(hass, "fan_off");
      const content = html`${icon("fan")}<span class="fan-label short">${short}</span><span class="fan-label full">${full}</span><span class="fan-value">${value}</span>`;
      // Hide controls: no tap -- the fan's dialog sets its speed. The hotend
      // fan is a sensor: its dialog shows its history and sets nothing.
      return ctx.viewOnly && key !== "hotend"
        ? html`<span class="fan ${percent ? "on" : ""}" role="img" aria-label="${full}: ${value}" title=${full}>${content}</span>`
        : html`<button class="fan ${percent ? "on" : ""}" aria-label="${full}: ${value}" title=${full} @click=${() => ctx.moreInfo(entityId)}>
            ${content}
          </button>`;
    })}
  </div>`;
}

/** What the strip says below a swatch: the material; "?" for a spool
 * nobody described, "–" for an empty slot -- an external holder, whose spool
 * BamBuddy never reports, too --, "—" while it is not known. */
const slotType = (slot: Slot, external: boolean): string =>
  slot.unknown ? "—" : slot.empty ? (slot.present && !external ? "?" : "–") : slot.type || "?";

/** The AMS colours; a tap opens the filament view where the card has one.
 * The AMS units with four slots stand in a column, one below the other; the
 * AMS HT units and the external spools fill the room beside it, and go
 * below it where none is left -- each unit has its place on every printer.
 * Each head has two lines, the name and the model, then the humidity and
 * the temperature -- kept empty where there are none, and taken by the L
 * and R of two external spools --, so a row's colours stand level. */
function amsStrip(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  const dual = refs.externalSpools.length === 2;
  const groups = [
    ...ctx.ams.map((unit) => {
      const model = unitModel(ctx.ams, unit);
      const nozzle = unitNozzle(hass, unit);
      const extras = [model, nozzle ? t(hass, nozzle === "left" ? "strip_nozzle_left" : "strip_nozzle_right") : undefined].filter(Boolean);
      return {
        name: unit.name,
        spoken: extras.length ? `${unit.name} (${extras.join(", ")})` : unit.name,
        model,
        nozzle,
        humidity: numericState(hass, unit.humidity),
        temperature: numericState(hass, unit.temperature),
        temperatureUnit: temperatureUnit(hass, unit.temperature),
        slots: unit.slots,
        fill: unit.model === AMS_HT,
        ht: unit.model === AMS_HT,
        sides: false,
      };
    }),
    ...(refs.externalSpools.length
      ? [
          {
            name: t(hass, "external_short"),
            spoken: t(hass, dual ? "externals" : "external"),
            model: undefined,
            nozzle: undefined,
            humidity: undefined,
            temperature: undefined,
            slots: refs.externalSpools,
            fill: true,
            ht: false,
            sides: dual,
          },
        ]
      : []),
  ];
  if (!groups.length) return nothing;
  const column = groups.filter((group) => !group.fill);
  const fill = groups.filter((group) => group.fill);
  // Two external spools: left and right, in that order.
  const sides = dual ? [t(hass, "side_left_short"), t(hass, "side_right_short")] : [];
  const sideOf = (entityId: string): string | undefined => sides[refs.externalSpools.indexOf(entityId)];
  // A screen reader hears what the strip shows -- each slot as its title
  // says it, the one in use named -- and where a tap goes.
  const spoken = (entityId: string): string => {
    const slot = slotOf(hass, entityId);
    const side = dual ? refs.externalSpools.indexOf(entityId) : -1;
    return `${side >= 0 ? `${sideName(hass, side)}: ` : ""}${slotTitle(hass, slot)}${slot.active ? ` · ${t(hass, "in_use")}` : ""}`;
  };
  const said = [...column, ...fill].map((group) =>
    t(hass, "strip_unit", {
      name: [
        group.spoken,
        ...(group.humidity === undefined ? [] : [t(hass, "strip_humidity", { humidity: formatPercent(hass, group.humidity) })]),
        ...(group.temperature === undefined ? [] : [t(hass, "strip_temperature", { temperature: formatTemperature(hass, group.temperature, group.temperatureUnit) })]),
      ].join(", "),
      slots: group.slots.map(spoken).join(", "),
    }),
  );
  const unit = (group: (typeof groups)[number]): TemplateResult => html`<span class="ams-group">
        <span class="ams-head">
          <span class="ams-line">
            <span class="ams-name" title=${group.spoken}>${group.name}</span>
            ${group.model ? html`<span class="unit-model">${group.model}</span>` : nothing}
            ${group.nozzle
              ? html`<span class="ams-nozzle" aria-hidden="true" title=${t(hass, group.nozzle === "left" ? "nozzle_left" : "nozzle_right")}
                  >${t(hass, group.nozzle === "left" ? "side_left_short" : "side_right_short")}</span
                >`
              : nothing}
          </span>
          ${group.sides
            ? nothing
            : html`<span class="ams-env">
                ${group.humidity !== undefined ? html`<span class="ams-hum">${icon("humidity")}${formatPercent(hass, group.humidity)}</span>` : nothing}
                ${group.temperature !== undefined
                  ? html`<span class="ams-temp">${icon("chamber")}${formatTemperature(hass, group.temperature, group.temperatureUnit)}</span>`
                  : nothing}
              </span>`}
        </span>
        <span class="ams-slots">
          ${group.slots.map((entityId) => {
            const slot = slotOf(hass, entityId);
            const side = sideOf(entityId);
            return html`<span class="ams-slot" title=${side ? `${side} · ${slotTitle(hass, slot)}` : slotTitle(hass, slot)}
              >${side ? html`<span class="slot-side">${side}</span>` : nothing}${swatch(slot)}<span class="slot-type"
                >${slotType(slot, refs.externalSpools.includes(entityId))}</span
              ></span
            >`;
          })}
        </span>
      </span>`;
  // Shown, not read: the description (the button) or the screen-reader
  // text (the group) says it whole.
  const content = html`${column.length ? html`<span class="ams-column" aria-hidden="true">${column.map(unit)}</span>` : nothing}${fill.length
    ? html`<span class="ams-fill ${fill.some((group) => group.ht) ? "with-ht" : ""}" aria-hidden="true">${fill.map(unit)}</span>`
    : nothing}`;
  // Named by what it is and where it goes; what it shows is its description,
  // which a screen reader says after the name and lets the user skip.
  return ctx.filamentTab
    ? html`<button class="ams-strip" aria-label=${`${t(hass, "block_ams")} – ${t(hass, "open_filament")}`} aria-describedby="ams-said" @click=${() => ctx.show("filament")}>
        <span class="sr-only" id="ams-said">${said.join(". ")}</span>${content}<span class="ams-go">${icon("chevronRight")}</span>
      </button>`
    : html`<div class="ams-strip" role="group" aria-label=${t(hass, "block_ams")}><span class="sr-only">${said.join(". ")}</span>${content}</div>`;
}

const SPEEDS = ["silent", "standard", "sport", "ludicrous"];

/** "Silent (50 %)" -> "Silent" and "50 %": the name fits a phone, the
 * percentage goes below it. */
function speedParts(text: string): [name: string, detail?: string] {
  const match = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(text);
  return match ? [match[1] as string, match[2] as string] : [text];
}

/** The print speed while a job is on the printer: to choose where the card
 * may control it, else as it is. */
function speedControl(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs, status } = ctx;
  const state = stateOf(hass, refs.speed);
  if (!state || !ctx.online || !BUSY.has(status)) return nothing;
  if (!ctx.canControl) {
    return html`<div class="speed">
      <span class="speed-label">${icon("speed")}${t(hass, "speed")}</span>
      <span class="speed-now">${formatState(hass, refs.speed, state.state) ?? state.state}</span>
    </div>`;
  }
  const options = listedOptions(state, SPEEDS, true);
  const pending = ctx.isPending("speed");
  const stop = radioStop(options, state.state);
  return html`<div class="speed">
    <span class="speed-label">${icon("speed")}${t(hass, "speed")}</span>
    <div class="seg speeds" role="radiogroup" aria-label=${t(hass, "speed")} @keydown=${radioKeys} @focusout=${radioLeave}>
      ${options.map((option, index) => {
        const full = formatState(hass, refs.speed, option) as string;
        const [name, detail] = speedParts(full);
        return html`<button
          role="radio"
          aria-checked=${option === state.state ? "true" : "false"}
          tabindex=${index === stop ? 0 : -1}
          aria-label=${full}
          title=${full}
          aria-disabled=${pending ? "true" : nothing}
          ?disabled=${state.state === "unavailable"}
          @click=${() => ctx.run("speed", "select", "select_option", { entity_id: refs.speed, option })}
        >
          <span class="opt">${name}</span> ${detail ? html`<span class="opt-sub">${detail}</span>` : nothing}
        </button>`;
      })}
    </div>
  </div>`;
}

/** Whether a printer with one nozzle has no filament loaded: no slot or
 * spool in use, and the integration names none. Two nozzles are left out:
 * which one would be meant is not clear. */
function nothingLoaded(ctx: CardContext): boolean {
  const { hass, refs } = ctx;
  if (refs.dual || stateOf(hass, refs.activeFilament)?.state !== "none") return false;
  const slots = [...ctx.ams.flatMap((unit) => unit.slots), ...refs.externalSpools];
  return !slots.some((entityId) => slotOf(hass, entityId).active);
}

function controls(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs, status } = ctx;
  if (!ctx.online || !BUSY.has(status)) return nothing;
  // Hide controls shows nothing; a key without Control Printer says so.
  if (!ctx.canControl) return ctx.keyLacksControl ? note(t(hass, "read_only")) : nothing;
  const paused = status === "paused";
  const buttons = [
    paused
      ? refs.resume
        ? resumeButton(ctx)
        : nothing
      : refs.pause
        ? actionButton({
            label: t(hass, "pause"),
            iconName: "pause",
            pending: ctx.isPending("pause"),
            onClick: () => ctx.run("pause", "button", "press", { entity_id: refs.pause }),
          })
        : nothing,
    refs.stop
      ? actionButton({
          label: t(hass, "stop"),
          iconName: "stop",
          kind: "danger",
          pending: ctx.isPending("stop"),
          onClick: () => ctx.confirm(stopQuestion(hass, ["button", "press", { entity_id: refs.stop }], "stop")),
        })
      : nothing,
    status === "printing" || paused
      ? actionButton({
          label: t(hass, "skip"),
          iconName: "skip",
          kind: "plain",
          pending: ctx.isPending("skip"),
          className: "skip",
          onClick: ctx.skip,
        })
      : nothing,
  ];
  // Resuming without filament prints nothing: say so above the button --
  // and where to load it, where the card has the tab. During a filament
  // change, Resume waits for it: that is said instead.
  const above =
    paused && refs.resume
      ? ctx.changing
        ? note(t(hass, "changing_paused"))
        : nothingLoaded(ctx)
          ? note(t(hass, ctx.filamentTab ? "paused_empty" : "paused_empty_no_tab"), "warning")
          : nothing
      : nothing;
  return html`<div class="controls">${above}<div class="ctl-buttons">${buttons}</div></div>`;
}

/** A block of the status view; offline only the plugs draw -- the
 * printer's own where the offline view says nothing of it --; without an
 * answer from BamBuddy nothing. */
function block(ctx: CardContext, name: StatusBlock): TemplateResult | typeof nothing {
  if (name === "controls") return html`${developerHint(ctx)}${controls(ctx)}`;
  if (name === "power") return ctx.unreachable ? nothing : powerSection(ctx);
  if (!ctx.online) return nothing;
  if (name === "temperatures") return temperatures(ctx);
  if (name === "fans") return fans(ctx);
  if (name === "ams") return amsStrip(ctx);
  return speedControl(ctx);
}

/** Whether a section shows now: the plugs whenever their block draws (also
 * offline), the controls and the speed while a job is on the printer, the
 * others while it is online. */
const sectionShowsNow = (ctx: CardContext, name: StatusBlock): boolean =>
  name === "power" ? block(ctx, name) !== nothing : ctx.online && (name === "controls" || name === "speed" ? ctx.busy : true);

/** The sections in the card editor's preview: each as it is, or -- with
 * nothing to show now -- as an example of it during a print; none of a
 * section that shows nothing even then (controls hidden, no AMS). Examples
 * in a row that show at the same time share one note. The developer hint
 * holds now: it stays outside the examples. */
function previewSections(ctx: CardContext): Array<TemplateResult | typeof nothing> {
  const printing: CardContext = { ...asOnline(ctx), status: "printing", busy: true, running: true, changing: false };
  const parts: Array<TemplateResult | typeof nothing> = [];
  let key: TextKey | undefined;
  let examples: TemplateResult[] = [];
  const close = (): void => {
    if (key) parts.push(sample(ctx, key, examples));
    key = undefined;
    examples = [];
  };
  for (const name of ctx.settings.blocks) {
    if (sectionShowsNow(ctx, name)) {
      close();
      parts.push(block(ctx, name));
      continue;
    }
    const hint = name === "controls" ? developerHint(ctx) : nothing;
    if (hint !== nothing) {
      close();
      parts.push(hint);
    }
    const example = name === "controls" ? controls(printing) : block(printing, name);
    if (example === nothing) continue;
    // The print's own sections show during a print, the others once the printer is online.
    const when = sampleKey(ctx, name === "controls" || name === "speed");
    if (when !== key) close();
    key = when;
    examples.push(example);
  }
  close();
  return parts;
}

export function statusView(ctx: CardContext, picture: TemplateResult): TemplateResult {
  const live = ctx.online;
  // Offline the warning comes first: the plate waits behind it.
  return html`${live ? plateCallout(ctx) : nothing}${jobBlock(ctx, picture)}${live ? nothing : plateCallout(ctx)}
  ${ctx.examples ? previewSections(ctx) : ctx.settings.blocks.map((name) => block(ctx, name))}`;
}
