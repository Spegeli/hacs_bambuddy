// The main view: what the printer is doing at a glance -- the job with its
// picture, progress and times, temperatures, fans, the loaded filament, and
// the controls a running print needs. The HMS messages are the head's chip.
import { html, nothing, type TemplateResult } from "lit";

import {
  BUSY,
  formatDuration,
  formatEndTime,
  formatPercent,
  formatState,
  formatTemperature,
  numericState,
  stateOf,
  toneOf,
  WITH_JOB,
} from "./format";
import { icon, type IconName } from "./icons";
import { t, type TextKey } from "./i18n";
import { actionButton, amsActivity, developerHint, entityName, note, slotOf, slotTitle, swatch, type CardContext } from "./parts";
import type { Heater } from "./types";

function plateCallout(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  if (stateOf(hass, refs.plateClearNeeded)?.state !== "on") return nothing;
  return html`<div class="callout">
    ${icon("info")}<span>${t(hass, "plate_text")}</span>
    ${refs.plateCleared && ctx.canControl
      ? actionButton({
          label: t(hass, "plate_cleared"),
          iconName: "check",
          kind: "primary",
          pending: ctx.isPending("plate"),
          onClick: () => ctx.run("plate", "button", "press", { entity_id: refs.plateCleared }),
        })
      : nothing}
  </div>`;
}

/** A job's name without the file's extension: "Benchy.gcode.3mf" -> "Benchy". */
export const jobName = (name: string): string => name.replace(/(\.gcode)?\.(3mf|gcode)$/i, "") || name;

/** Stages the status chip already says: no line of their own. */
const PLAIN_STAGES = new Set(["idle", "printing", "unknown", "unavailable"]);

function jobBlock(ctx: CardContext, picture: TemplateResult): TemplateResult {
  const { hass, refs, status } = ctx;
  const tone = toneOf(status);
  if (!ctx.online) {
    return html`<div class="job">${picture}<div class="job-info">${note(t(hass, "offline_text"), "warning")}</div></div>`;
  }
  const withJob = WITH_JOB.has(status);
  const raw = withJob ? formatState(hass, refs.job) : undefined;
  const job = raw === undefined ? undefined : jobName(raw);
  const progress = status === "finished" ? 100 : numericState(hass, refs.progress);
  const stage = stateOf(hass, refs.stage)?.state;
  const stageText = withJob && stage && !PLAIN_STAGES.has(stage) ? formatState(hass, refs.stage) : undefined;
  const meta: [IconName, string][] = [];
  const layer = numericState(hass, refs.layer);
  const total = numericState(hass, refs.totalLayers);
  if (withJob && layer && total) meta.push(["layers", t(hass, "layer", { current: layer, total })]);
  const remaining = numericState(hass, refs.remaining);
  if (BUSY.has(status) && remaining) meta.push(["timer", t(hass, "remaining", { time: formatDuration(hass, remaining) })]);
  const end = stateOf(hass, refs.endTime)?.state;
  const endText = BUSY.has(status) && end ? formatEndTime(hass, end) : undefined;
  if (endText) meta.push(["clock", t(hass, "ends", { time: endText })]);
  const showBar = withJob && progress !== undefined;
  const activity = amsActivity(ctx);
  return html`<div class="job">
    ${picture}
    <div class="job-info">
      <div class="job-top">
        <span class="job-name" title=${job ?? ""}>${job ?? t(hass, "no_job")}</span>
        ${showBar ? html`<span class="pct tone-${tone}">${formatPercent(hass, progress)}</span>` : nothing}
      </div>
      ${stageText ? html`<div class="stage">${stageText}</div>` : nothing}
      ${activity ? html`<div class="ams-activity" role="status">${icon("sync")}<span>${activity}</span></div>` : nothing}
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

function temperatureTile(ctx: CardContext, label: string, heater: Heater, iconName: IconName): TemplateResult {
  const { hass } = ctx;
  const current = numericState(hass, heater.sensor);
  const target = numericState(hass, heater.target);
  const heating = target !== undefined && target > 0 && current !== undefined && target - current > 3;
  const value = current === undefined ? "—" : formatTemperature(hass, current);
  const targetText = target === undefined ? undefined : target > 0 ? t(hass, "target", { value: formatTemperature(hass, target) }) : t(hass, "heater_off");
  return html`<button
    class="temp ${heating ? "heating" : ""}"
    aria-label=${[label, value, targetText].filter(Boolean).join(", ")}
    @click=${() => ctx.moreInfo(heater.target ?? heater.sensor)}
  >
    <span class="temp-head">${icon(heating ? "heat" : iconName)}<span>${label}</span></span>
    <span class="temp-value">${value}</span>
    ${targetText ? html`<span class="temp-target">${targetText}</span>` : nothing}
  </button>`;
}

function temperatures(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  const nozzleLabels: TextKey[] = refs.dual ? ["nozzle_left", "nozzle_right"] : ["nozzle"];
  const heaters: [string, Heater, IconName][] = [
    ...refs.nozzles.map((nozzle, index): [string, Heater, IconName] => [t(hass, nozzleLabels[index] as TextKey), nozzle, "nozzle"]),
    [t(hass, "bed"), refs.bed, "bed"],
    [t(hass, "chamber"), refs.chamber, "chamber"],
  ];
  const shown = heaters.filter(([, heater]) => heater.sensor || heater.target);
  if (!shown.length) return nothing;
  // Two nozzles: "Rechte Düse" needs the room of two columns on a phone.
  return html`<div class="temps n${shown.length} ${refs.dual ? "dual" : ""}">${shown.map(([label, heater, name]) => temperatureTile(ctx, label, heater, name))}</div>`;
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
  const items: [key: string, entityId: string, percent: number | undefined][] = refs.fans.map((fan) => [fan.key, fan.entityId, fanPercent(ctx, fan.entityId)]);
  if (refs.hotendFan) items.push(["hotend", refs.hotendFan, numericState(hass, refs.hotendFan)]);
  if (!items.length) return nothing;
  // A short name on a narrow card, the entity's own where there is room;
  // both start alike, and the entity's names the chip.
  return html`<div class="fans" role="group" aria-label=${t(hass, "fans")}>
    ${items.map(([key, entityId, percent]) => {
      const short = t(hass, `fan_${key}` as TextKey);
      const full = entityName(ctx, entityId, t(hass, `fan_${key}_name` as TextKey));
      const value = percent === undefined ? "—" : percent > 0 ? formatPercent(hass, percent) : t(hass, "fan_off");
      return html`<button class="fan ${percent ? "on" : ""}" aria-label="${full}: ${value}" title=${full} @click=${() => ctx.moreInfo(entityId)}>
        ${icon("fan")}<span class="fan-label short">${short}</span><span class="fan-label full">${full}</span><span class="fan-value">${value}</span>
      </button>`;
    })}
  </div>`;
}

function amsStrip(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  const groups = [
    ...refs.ams.map((unit) => ({ name: unit.name, humidity: numericState(hass, unit.humidity), slots: unit.slots })),
    ...(refs.externalSpools.length ? [{ name: t(hass, "external_short"), humidity: undefined, slots: refs.externalSpools }] : []),
  ];
  if (!groups.length) return nothing;
  // Two external spools: left and right, in that order.
  const sides = refs.externalSpools.length === 2 ? [t(hass, "side_left_short"), t(hass, "side_right_short")] : [];
  const sideOf = (entityId: string): string | undefined => sides[refs.externalSpools.indexOf(entityId)];
  return html`<button class="ams-strip" aria-label=${t(hass, "open_filament")} @click=${() => ctx.show("filament")}>
    ${groups.map(
      (group) => html`<span class="ams-group">
        <span class="ams-head"
          ><span class="ams-name">${group.name}</span>${group.humidity !== undefined
            ? html`<span class="ams-hum">${icon("humidity")}${formatPercent(hass, group.humidity)}</span>`
            : nothing}</span
        >
        <span class="ams-slots">
          ${group.slots.map((entityId) => {
            const slot = slotOf(hass, entityId);
            const side = sideOf(entityId);
            return html`<span class="ams-slot" title=${side ? `${side} · ${slotTitle(hass, slot)}` : slotTitle(hass, slot)}
              >${side ? html`<span class="slot-side">${side}</span>` : nothing}${swatch(slot)}<span class="slot-type"
                >${slot.unknown ? "—" : slot.empty ? "–" : slot.type || "?"}</span
              ></span
            >`;
          })}
        </span>
      </span>`,
    )}
    <span class="ams-go">${icon("chevronRight")}</span>
  </button>`;
}

const SPEEDS = ["silent", "standard", "sport", "ludicrous"];

/** "Silent (50 %)" -> "Silent" and "50 %": the name fits a phone, the
 * percentage goes below it. */
function speedParts(text: string): [name: string, detail?: string] {
  const match = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(text);
  return match ? [match[1] as string, match[2] as string] : [text];
}

function speedControl(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  const state = stateOf(hass, refs.speed);
  if (!state) return nothing;
  const listed = state.attributes["options"];
  const options = Array.isArray(listed) && listed.every((option) => typeof option === "string") ? (listed as string[]) : SPEEDS;
  const pending = ctx.isPending("speed");
  return html`<div class="speed">
    <span class="speed-label">${icon("speed")}${t(hass, "speed")}</span>
    <div class="seg speeds" role="radiogroup" aria-label=${t(hass, "speed")}>
      ${options.map((option) => {
        const full = formatState(hass, refs.speed, option) as string;
        const [name, detail] = speedParts(full);
        return html`<button
          role="radio"
          aria-checked=${option === state.state ? "true" : "false"}
          aria-label=${full}
          title=${full}
          ?disabled=${pending || state.state === "unavailable"}
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
  const slots = [...refs.ams.flatMap((unit) => unit.slots), ...refs.externalSpools];
  return !slots.some((entityId) => slotOf(hass, entityId).active);
}

function controls(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs, status } = ctx;
  if (!ctx.online || !BUSY.has(status)) return nothing;
  // Only called with controls shown: no permission means the key lacks it.
  if (!ctx.canControl) return note(t(hass, "read_only"));
  const paused = status === "paused";
  const buttons = [
    paused && refs.resume
      ? actionButton({
          label: t(hass, "resume"),
          iconName: "play",
          kind: "primary",
          pending: ctx.isPending("resume"),
          onClick: () => ctx.run("resume", "button", "press", { entity_id: refs.resume }),
        })
      : nothing,
    !paused && refs.pause
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
          onClick: () =>
            ctx.confirm({
              title: t(hass, "stop_title"),
              text: t(hass, "stop_text"),
              confirm: t(hass, "stop_confirm"),
              keep: t(hass, "stop_keep"),
              danger: true,
              action: ["button", "press", { entity_id: refs.stop }],
              key: "stop",
            }),
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
  // Resuming without filament prints nothing: say so above the button.
  const empty = paused && refs.resume && nothingLoaded(ctx) ? note(t(hass, "paused_empty"), "warning") : nothing;
  return html`<div class="controls">${empty}<div class="ctl-buttons">${buttons}</div>${speedControl(ctx)}</div>`;
}

export function statusView(ctx: CardContext, picture: TemplateResult): TemplateResult {
  const { config } = ctx;
  const live = ctx.online;
  // Offline the warning comes first: the plate waits behind it.
  return html`${live ? plateCallout(ctx) : nothing}${jobBlock(ctx, picture)}${live ? nothing : plateCallout(ctx)}
  ${live && config.show_temperatures !== false ? temperatures(ctx) : nothing}
  ${live && config.show_fans !== false ? fans(ctx) : nothing}
  ${live && config.show_ams !== false ? amsStrip(ctx) : nothing}
  ${config.show_controls !== false ? html`${developerHint(ctx)}${controls(ctx)}` : nothing}`;
}
