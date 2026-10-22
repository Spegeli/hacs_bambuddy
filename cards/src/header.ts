// The card's head and what it opens: the printer's name in BamBuddy with
// its model, nozzle and print hours below, the chips the user chose (the
// network, the HMS messages, the firmware, maintenance, the door, the
// storage, drying, the power), a line under them while an HMS message
// matters, and the contents of the dialogs the chips and the menu open --
// the HMS messages, the firmware, the storage, the printer information.
import { html, nothing, type TemplateResult } from "lit";

import { deviceName } from "./discovery";
import { formatDuration, formatNumber, formatState, hasValue, minutesOf, numericState, stateOf, textOrUndefined } from "./format";
import { icon, type IconName } from "./icons";
import { t, type TextKey } from "./i18n";
import { maintenancePill } from "./maintenance";
import { powerPill } from "./power";
import { actionButton, connection, dialogNote, noData, sideName, snack, stopQuestion, type CardContext } from "./parts";
import type { HassEntityState, HeaderChip } from "./types";

// --- Title ------------------------------------------------------------------

/** A text attribute, where it has one. */
const textAttribute = (ctx: CardContext, entityId: string | undefined, name: string): string | undefined =>
  textOrUndefined(stateOf(ctx.hass, entityId)?.attributes[name]);

/** A device name without the " (model / serial)" the integration puts
 * after BamBuddy's name: "Workshop (X1C / 00M…)" -> "Workshop". A name
 * without BamBuddy's, "P1S (01P…)", stays whole: its serial tells it apart. */
const withoutModel = (name: string): string => /^(.+) \([^()]* \/ [^()]*\)$/.exec(name)?.[1] ?? name;

/** The printer's name in BamBuddy, else its device's -- the name the user
 * knows, also while BamBuddy does not answer and its name is gone. */
export const printerTitle = (ctx: CardContext): string => textAttribute(ctx, ctx.refs.status, "bambuddy_name") ?? withoutModel(ctx.refs.name);

/** A nozzle's diameter as BamBuddy reports it: "0.4". */
const diameter = (ctx: CardContext, entityId: string | undefined): string | undefined => {
  const value = numericState(ctx.hass, entityId);
  return value === undefined ? undefined : formatNumber(ctx.hass, value, 2);
};

/** "0.4 mm", or "L 0.4 / R 0.6 mm" where two nozzles differ. */
function nozzleText(ctx: CardContext): string | undefined {
  const { hass, refs } = ctx;
  const sizes = refs.nozzleDiameters.map((entityId) => diameter(ctx, entityId));
  const known = sizes.filter((value): value is string => value !== undefined);
  if (!known.length) return undefined;
  if (new Set(known).size === 1) return `${known[0]} mm`;
  // Two sizes: which side is which (the nozzles in the order left, right).
  const [left, right] = sizes;
  // No break inside a value: "L 0,6", "R 0,4 mm".
  return `${t(hass, "side_left_short")} ${left ?? "—"} / ${t(hass, "side_right_short")} ${right ?? "—"} mm`;
}

/** The print hours as Home Assistant shows them -- in the unit the user
 * chose for the sensor --; without its formatting rounded: "559 h". */
function hoursText(ctx: CardContext): string | undefined {
  const { hass, refs } = ctx;
  const hours = numericState(hass, refs.printHours);
  if (hours === undefined) return undefined;
  if (typeof hass.formatEntityState === "function") return hass.formatEntityState(stateOf(hass, refs.printHours) as HassEntityState);
  return t(hass, "dur_h", { h: formatNumber(hass, Math.round(hours)) });
}

/** The line below the title: model · nozzle · print hours, what is known. */
export const subtitle = (ctx: CardContext): string => [ctx.refs.model, nozzleText(ctx), hoursText(ctx)].filter(Boolean).join(" · ");

// --- HMS --------------------------------------------------------------------

interface HmsError {
  code?: unknown;
  severity?: unknown;
  description?: unknown;
  /** What the printer's screen offers to answer it with, in Bambu's order. */
  actions?: unknown;
}

/** The answers the card names (the integration lists only those that send
 * the printer something). */
const HMS_ANSWERS: Record<string, TextKey> = {
  RESUME_PRINTING: "hms_answer_resume_printing",
  RESUME_PRINTING_DEFECTS: "hms_answer_resume_printing_defects",
  RESUME_PRINTING_PROBELM_SOLVED: "hms_answer_resume_printing_probelm_solved",
  PROBLEM_SOLVED_RESUME: "hms_answer_problem_solved_resume",
  FILAMENT_LOAD_RESUME: "hms_answer_filament_load_resume",
  PROCEED: "hms_answer_proceed",
  DBL_CHECK_RESUME: "hms_answer_dbl_check_resume",
  STOP_PRINTING: "hms_answer_stop_printing",
  IGNORE_RESUME: "hms_answer_ignore_resume",
  IGNORE_NO_REMINDER_NEXT_TIME: "hms_answer_ignore_no_reminder_next_time",
  DONT_REMIND_NEXT_TIME: "hms_answer_dont_remind_next_time",
  NO_REMINDER_NEXT_TIME: "hms_answer_no_reminder_next_time",
  FILAMENT_EXTRUDED: "hms_answer_filament_extruded",
  DBL_CHECK_DONE: "hms_answer_dbl_check_done",
  RETRY_FILAMENT_EXTRUDED: "hms_answer_retry_filament_extruded",
  CONTINUE: "hms_answer_continue",
  RETRY_PROBLEM_SOLVED: "hms_answer_retry_problem_solved",
  DBL_CHECK_RETRY: "hms_answer_dbl_check_retry",
  ABORT: "hms_answer_abort",
  OK_BUTTON: "hms_answer_ok_button",
  DBL_CHECK_OK: "hms_answer_dbl_check_ok",
  REFRESH_NOZZLE: "hms_answer_refresh_nozzle",
  TURN_OFF_FIRE_ALARM: "hms_answer_turn_off_fire_alarm",
  STOP_DRYING: "hms_answer_stop_drying",
  DISABLE_PURIFICATION: "hms_answer_disable_purification",
};

/** The answers of a message the card sends. */
function answersOf(error: HmsError): string[] {
  return Array.isArray(error.actions) ? error.actions.filter((action): action is string => typeof action === "string" && Object.hasOwn(HMS_ANSWERS, action)) : [];
}

/** Whether a message the dialog shows offers an answer the card sends. */
export function hmsAnswered(ctx: CardContext): boolean {
  return ctx.canControl && ctx.online && hmsOf(ctx).errors.some((error) => answersOf(error).length > 0);
}

/** Bambu Lab's wiki on HMS messages: BamBuddy links every message there
 * (a page per code would need Bambu's own table). */
const HMS_WIKI = "https://wiki.bambulab.com/en/hms/home";

/** A message's answers, as buttons; stopping the print asks first, as the
 * card's own stop does. */
function hmsAnswers(ctx: CardContext, error: HmsError, textId: string): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  const actions = answersOf(error);
  if (!actions.length || !ctx.canControl || !ctx.online || typeof error.code !== "string") return nothing;
  const code = error.code;
  return html`<div class="hms-answers">
    ${actions.map((action) => {
      const key = `hms_${code}_${action}`;
      const label = t(hass, HMS_ANSWERS[action] as TextKey);
      const data = { device_id: refs.deviceId, code, action };
      const stop = action === "STOP_PRINTING";
      return actionButton({
        label,
        iconName: stop ? "stop" : "check",
        kind: stop ? "danger" : "tonal",
        pending: ctx.isPending(key),
        describedBy: textId,
        // Two messages may offer the same answer: the question comes back to this one.
        answer: key,
        onClick: () => (stop ? ctx.confirm(stopQuestion(hass, ["bambuddy", "answer_hms", data], key)) : ctx.run(key, "bambuddy", "answer_hms", data)),
      });
    })}
  </div>`;
}

const SEVERITY_ORDER = ["error", "warning", "unknown", "notice"];

/** An HMS code the way Bambu Lab writes it: 0300_0100_0001_0004. */
function hmsCode(code: unknown): string {
  const text = typeof code === "string" ? code.replace(/^0x/i, "").toUpperCase() : "";
  return /^[0-9A-F]{8}([0-9A-F]{8})?$/.test(text) ? (text.match(/.{4}/g) as string[]).join("_") : text;
}

/** A severity the card colours: an unknown one counts as a warning. */
const severityOf = (error: HmsError): string =>
  typeof error.severity === "string" && SEVERITY_ORDER.includes(error.severity) ? error.severity : "unknown";

const SEVERITY_ICONS: Record<string, IconName> = { error: "error", warning: "warning", unknown: "warning", notice: "info" };

/** The colour of a severity: error red, warning orange, notice blue. */
const severityTone = (severity: string): string => (severity === "unknown" ? "warning" : severity);

/** A chip's or the HMS line's tone for a severity; an unknown one warns. */
const CHIP_TONES: Record<string, string> = { error: "err", warning: "warn", unknown: "warn", notice: "info" };

/** The messages, the worst first; alike ones in BamBuddy's order. */
function worstFirst(errors: HmsError[]): HmsError[] {
  const rank = (error: HmsError): number => SEVERITY_ORDER.indexOf(severityOf(error));
  return [...errors].sort((a, b) => rank(a) - rank(b));
}

/** The printer's HMS messages, and how many it reports -- undefined where
 * it says nothing. */
function hmsOf(ctx: CardContext): { count?: number; errors: HmsError[] } {
  const listed = stateOf(ctx.hass, ctx.refs.hms)?.attributes["errors"];
  const errors = (Array.isArray(listed) ? listed : []) as HmsError[];
  const count = numericState(ctx.hass, ctx.refs.hms) ?? (Array.isArray(listed) ? errors.length : undefined);
  return count === undefined ? { errors } : { count, errors };
}

/** Whether the HMS dialog offers to clear the messages. */
export const canClearHms = (ctx: CardContext): boolean => !!ctx.refs.clearHms && ctx.canControl && (hmsOf(ctx).count ?? 0) > 0;

// --- Chips ------------------------------------------------------------------

export type Pill = "hms" | "firmware" | "maintenance" | "storage" | "power";

/** The tone of a Wi-Fi signal as Wi-Fi is commonly judged: good from
 * -67 dBm, fair to -75 dBm, else weak. A signal that wavers near -60 dBm,
 * as most do, keeps its colour. */
const signalTone = (dbm: number): string => (dbm >= -67 ? "ok" : dbm >= -75 ? "warn" : "err");

/** A signal as "−52 dBm", with a true minus. */
const signalText = (ctx: CardContext, dbm: number): string => `${formatNumber(ctx.hass, dbm).replace(/^-/, "−")} dBm`;

interface Network {
  tone: string;
  iconName: IconName;
  text: string;
  aria?: string;
  /** The sensor its more-info dialog shows. */
  entityId: string | undefined;
}

/** How the printer is connected: on Ethernet -- green, as a good Wi-Fi
 * signal --, or its Wi-Fi signal; none while it is offline -- the dot and
 * the job say so. */
function networkOf(ctx: CardContext): Network | undefined {
  const { hass, refs } = ctx;
  if (!ctx.online) return undefined;
  if (stateOf(hass, refs.wiredNetwork)?.state === "on") {
    return { tone: "ok", iconName: "ethernet", text: t(hass, "lan"), aria: t(hass, "lan_aria"), entityId: refs.wiredNetwork };
  }
  const dbm = numericState(hass, refs.wifiSignal);
  if (dbm === undefined) return undefined;
  const text = signalText(ctx, dbm);
  const tone = signalTone(dbm);
  // The colour's word too, for a screen reader.
  const quality = t(hass, tone === "ok" ? "wifi_good" : tone === "warn" ? "wifi_fair" : "wifi_weak");
  return { tone, iconName: "wifi", text, aria: t(hass, "wifi_signal", { value: text, quality }), entityId: refs.wifiSignal };
}

function networkPill(ctx: CardContext): TemplateResult | typeof nothing {
  const network = networkOf(ctx);
  if (!network) return nothing;
  const content = html`${icon(network.iconName)}<span>${network.text}</span>`;
  // Its signal changes with every poll: the chip row announces the rest.
  return html`<button
    class="pill network tone-${network.tone}"
    aria-label=${network.aria ?? network.text}
    aria-live="off"
    @click=${() => ctx.moreInfo(network.entityId)}
  >
    ${content}
  </button>`;
}

function hmsPill(ctx: CardContext, open: (pill: Pill) => void): TemplateResult | typeof nothing {
  const { hass } = ctx;
  const { count, errors } = hmsOf(ctx);
  if (!ctx.online || count === undefined) return nothing;
  const worst = worstFirst(errors)[0];
  const tone = count > 0 ? (CHIP_TONES[worst ? severityOf(worst) : "unknown"] as string) : "ok";
  const label = count > 1 ? t(hass, "hms_pill_aria", { count }) : count === 1 ? t(hass, "hms_pill_aria_one") : t(hass, "hms_pill_none");
  return html`<button class="pill hms tone-${tone}" aria-label=${label} title=${label} aria-haspopup="dialog" @click=${() => open("hms")}>
    ${icon(count > 0 ? "shieldAlert" : "shieldCheck")}<span>${count > 0 ? t(hass, "hms_pill", { count }) : t(hass, "hms_ok")}</span>
  </button>`;
}

/** The printer's firmware: its installed version, and whether an update is out. */
function firmwareOf(ctx: CardContext): { installed?: string; latest?: string; update: boolean; current: boolean } | undefined {
  const { refs } = ctx;
  const state = stateOf(ctx.hass, refs.firmware);
  if (!state) return undefined;
  const installed = textAttribute(ctx, refs.firmware, "installed_version");
  const latest = textAttribute(ctx, refs.firmware, "latest_version");
  return {
    ...(installed ? { installed } : {}),
    ...(latest ? { latest } : {}),
    update: state.state === "on",
    current: state.state === "off",
  };
}

function firmwarePill(ctx: CardContext, open: (pill: Pill) => void): TemplateResult | typeof nothing {
  const { hass } = ctx;
  const firmware = firmwareOf(ctx);
  if (!firmware || (!firmware.installed && !firmware.update)) return nothing;
  // Offline the printer confirms nothing: no green tick.
  const [tone, iconName, key]: [string, IconName, TextKey] = firmware.update
    ? ["warn", "download", "firmware_update"]
    : !ctx.online && firmware.installed
      ? ["neutral", "memory", ctx.unreachable ? "firmware_unreachable" : "firmware_offline"]
      : firmware.current
        ? ["ok", "check", "firmware_current"]
        : ["neutral", "memory", "firmware_version"];
  // An update says so on the chip, with the version it brings.
  const text = firmware.update && firmware.latest ? t(hass, "firmware_update_chip", { version: firmware.latest }) : (firmware.installed ?? t(hass, "firmware"));
  // The name starts with what the chip shows (voice control, screen readers).
  const label =
    firmware.update && firmware.latest && firmware.installed
      ? t(hass, "firmware_update_label", { latest: firmware.latest, version: firmware.installed })
      : firmware.installed
        ? t(hass, key, { version: firmware.installed })
        : text;
  return html`<button class="pill firmware tone-${tone}" aria-label=${label} title=${label} aria-haspopup="dialog" @click=${() => open("firmware")}>
    ${icon(iconName)}<span>${text}</span>
  </button>`;
}

/** States in which a print stopped: any HMS message may say why. */
const STOPPED = new Set(["paused", "failed"]);

/** One line under the chips while an HMS message matters: one of the error
 * severity, or any while the print is paused or failed. It says the worst
 * and how many more there are; a tap opens the HMS dialog. */
function hmsLine(ctx: CardContext, open: (pill: Pill) => void): TemplateResult | typeof nothing {
  const { hass } = ctx;
  const { count, errors } = hmsOf(ctx);
  if (!ctx.online || !count) return nothing;
  const sorted = worstFirst(errors);
  const worst = sorted[0];
  const severity = worst ? severityOf(worst) : "unknown";
  if (severity !== "error" && !STOPPED.has(ctx.status)) return nothing;
  const description = textOrUndefined(worst?.description);
  const message = worst ? (description ?? t(hass, `hms_${severity}` as TextKey)) : t(hass, "hms_count", { count });
  const more = sorted.length - 1;
  return html`<button class="hms-line tone-${CHIP_TONES[severity]}" title=${message} aria-haspopup="dialog" @click=${() => open("hms")}>
    ${icon(SEVERITY_ICONS[severity] as IconName)}<span class="hms-line-text">${message}</span>${more > 0
      ? html`<span class="hms-line-more">${t(hass, "hms_more", { n: more })}</span>`
      : nothing}<span class="hms-line-go">${icon("chevronRight")}</span>
  </button>`;
}

/** The door, only while it is open: no warning -- PLA wants it open, and
 * the printer's own warnings come as HMS messages. BamBuddy cannot tell a
 * closed door from one never reported: no "closed" chip. */
function doorPill(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  if (!ctx.online || stateOf(hass, refs.door)?.state !== "on") return nothing;
  return html`<button class="pill door tone-info" @click=${() => ctx.moreInfo(refs.door)}>${icon("doorOpen")}<span>${t(hass, "door_open")}</span></button>`;
}

/** The storage, only while it is missing: without it BamBuddy sends no
 * print. A tap says why. A faulty card counts as present (HMS tells). */
function storagePill(ctx: CardContext, open: (pill: Pill) => void): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  if (!ctx.online || stateOf(hass, refs.storage)?.state !== "off") return nothing;
  return html`<button class="pill storage tone-warn" aria-haspopup="dialog" @click=${() => open("storage")}>
    ${icon(refs.storageUsb ? "usb" : "sd")}<span>${t(hass, refs.storageUsb ? "storage_usb" : "storage_sd")}</span>
  </button>`;
}

/** One chip while AMS units dry, however many: the longest time left --
 * when all are done. Its countdown is not read out every minute. A tap
 * opens the Filament tab, else the drying unit's details. */
function dryingPill(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass } = ctx;
  if (!ctx.online) return nothing;
  const drying = ctx.ams.filter((unit) => unit.drying && stateOf(hass, unit.drying)?.state === "on");
  const first = drying[0];
  if (!first) return nothing;
  const times = drying.map((unit) => minutesOf(hass, unit.dryingRemaining)).filter((value): value is number => value !== undefined && value > 0);
  // Number and unit stay together when the chip wraps.
  const time = times.length ? formatDuration(hass, Math.max(...times)).replace(/ /g, "\u00a0") : undefined;
  const n = drying.length;
  const what = n === 1 ? t(hass, "dry_chip_one_bare") : t(hass, "dry_chip_many_bare", { n });
  const detail = n > 1 && time ? t(hass, "dry_chip_aria", { n, time }) : undefined;
  const tap = (): void => (ctx.filamentTab ? ctx.show("filament") : ctx.moreInfo(first.dryingRemaining ?? first.drying));
  // What dries and its time, bold as a fan's value: on a narrow card the
  // time takes a line of its own, with no separator left hanging.
  return html`<button class="pill dry-chip tone-info" title=${detail ?? (time ? `${what} ${time}` : what)} aria-live="off" @click=${tap}>
    ${icon("heat")}<span class="dry-text"><span>${what}</span> ${time ? html`<span class="dry-time">${time}</span>` : nothing}</span>
  </button>`;
}

/** The chips under the title the user chose -- by default network, HMS,
 * firmware --, in their order, each where known; the row announces a
 * change, a new HMS message say. Door, storage and drying show only while
 * they matter. Below it the HMS line where a message matters, whatever the
 * chips. */
export function pills(ctx: CardContext, open: (pill: Pill) => void): TemplateResult | typeof nothing {
  const chips: Record<HeaderChip, () => TemplateResult | typeof nothing> = {
    network: () => networkPill(ctx),
    hms: () => hmsPill(ctx, open),
    firmware: () => firmwarePill(ctx, open),
    maintenance: () => maintenancePill(ctx, () => open("maintenance")),
    door: () => doorPill(ctx),
    storage: () => storagePill(ctx, open),
    drying: () => dryingPill(ctx),
    power: () => powerPill(ctx, () => open("power")),
  };
  const items = ctx.settings.chips.map((name: HeaderChip) => chips[name]()).filter((item) => item !== nothing);
  return html`${items.length ? html`<div class="pills" aria-live="polite">${items}</div>` : nothing}${hmsLine(ctx, open)}`;
}

// --- Dialogs ----------------------------------------------------------------

export function hmsContent(ctx: CardContext): TemplateResult {
  const { hass } = ctx;
  const { count = 0, errors } = hmsOf(ctx);
  const sorted = worstFirst(errors);
  // No answer from BamBuddy: no messages known, none to deny.
  const list =
    ctx.unreachable || !ctx.online
      ? dialogNote(t(hass, ctx.unreachable ? noData(ctx) : "offline_text"))
      : sorted.length
        ? html`<div class="hms-list">
            ${sorted.map((error, index) => {
              const severity = severityOf(error);
              const code = hmsCode(error.code);
              const description = textOrUndefined(error.description);
              return html`<div class="hms-item sev-${severityTone(severity)}">
                ${icon(SEVERITY_ICONS[severity] as IconName)}
                <div class="hms-body">
                  ${description ? html`<span class="sr-only">${t(hass, `hms_${severity}` as TextKey)}: </span>` : nothing}<span class="hms-text" id="hms-text-${index}">${description ?? t(hass, "hms_no_text", { severity: t(hass, `hms_${severity}` as TextKey) })}</span>
                  ${code ? html`<span class="hms-code">${code}</span>` : nothing}
                  ${hmsAnswers(ctx, error, `hms-text-${index}`)}
                </div>
              </div>`;
            })}
          </div>`
        : html`<p class="hms-empty">${count > 0 ? t(hass, "hms_count", { count }) : t(hass, "hms_none_dialog")}</p>`;
  // While a message holds the print paused: what to do next -- and where,
  // when the card offers neither: Home Assistant too with the controls hidden.
  // Clearing, where offered, does not fix what the printer sees.
  const where: TextKey = hmsAnswered(ctx)
    ? "hms_next_answers"
    : ctx.canControl
      ? "hms_next"
      : ctx.refs.resume || ctx.refs.stop
        ? "hms_next_read"
        : "hms_next_elsewhere";
  const next = ctx.status === "paused" && count > 0 ? dialogNote(t(hass, where)) : nothing;
  return html`<h2 id="dlg-title">${t(hass, "hms_title")}</h2>
    ${list}
    ${sorted.length ? html`<a class="hms-wiki" href=${HMS_WIKI} target="_blank" rel="noopener noreferrer">${icon("openInNew")}<span>${t(hass, "hms_wiki")}</span></a>` : nothing}
    ${next}${canClearHms(ctx) ? dialogNote(t(hass, "hms_clear_note")) : nothing}`;
}

/** A row of a dialog's facts: its label, its value, a copy button. */
function specRow(label: string, value: TemplateResult | string, extra: TemplateResult | typeof nothing = nothing, valueClass = ""): TemplateResult {
  return html`<div class="spec-row">
    <span class="spec-label">${label}</span>
    <span class="spec-value ${valueClass}">${value}</span>
    ${extra}
  </div>`;
}

/** Why the storage matters: the chip's dialog. */
export function storageContent(ctx: CardContext): TemplateResult {
  const { hass, refs } = ctx;
  // It follows the storage while open: inserted, it says so.
  const present = stateOf(hass, refs.storage)?.state === "on";
  const text = refs.storageUsb ? (present ? "storage_usb_in" : "storage_usb_text") : present ? "storage_sd_in" : "storage_sd_text";
  const title = refs.storageUsb ? (present ? "storage_usb_title_in" : "storage_usb") : present ? "storage_sd_title_in" : "storage_sd";
  return html`<h2 id="dlg-title">${t(hass, title)}</h2>
    <p>${t(hass, text)}</p>`;
}

/** The firmware dialog. With an update, its release notes are a tap away
 * in Home Assistant's own update dialog; `close` closes the card's first. */
export function firmwareContent(ctx: CardContext, close: () => void): TemplateResult {
  const { hass } = ctx;
  const firmware = firmwareOf(ctx) ?? { update: false, current: false };
  const notes = (): void => {
    close();
    ctx.moreInfo(ctx.refs.firmware);
  };
  return html`<h2 id="dlg-title">${t(hass, "firmware")}</h2>
    <div class="spec">
      ${firmware.installed ? specRow(t(hass, "firmware_installed"), firmware.installed) : nothing}
      ${firmware.latest
        ? specRow(t(hass, firmware.update ? "firmware_available" : "firmware_latest"), firmware.latest, nothing, firmware.update ? "update" : "")
        : nothing}
    </div>
    ${firmware.update ? html`<button class="btn release" @click=${notes}>${icon("openInNew")}<span>${t(hass, "firmware_notes")}</span></button>` : nothing}
    ${dialogNote(t(hass, "firmware_note"))}`;
}

/** Whether the browser lets the card copy text. */
const canCopy = (): boolean => typeof navigator.clipboard?.writeText === "function";

/** Each nozzle's diameter and type: "0.4 mm · Hardened steel". */
function nozzleLines(ctx: CardContext): string[] {
  const { hass, refs } = ctx;
  return refs.nozzles
    .map((_, index) => {
      const size = diameter(ctx, refs.nozzleDiameters[index]);
      const type = refs.nozzleTypes[index];
      const parts = [size === undefined ? undefined : `${size} mm`, hasValue(hass, type) ? formatState(hass, type) : undefined].filter(Boolean).join(" · ");
      return parts && refs.dual ? t(hass, "nozzle_side", { side: sideName(hass, index), nozzle: parts }) : parts;
    })
    .filter(Boolean);
}

const chip = (tone: string, text: string): TemplateResult => html`<span class="chip tone-${tone}">${text}</span>`;

/** "1 nozzle · 0.4 mm · Hardened steel"; two nozzles: "2 nozzles" with a
 * line for each side. */
function nozzleRow(ctx: CardContext, lines: string[]): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  if (!lines.length) return nothing;
  const count = refs.nozzles.length;
  const counted = count === 1 ? t(hass, "nozzle_count_one") : t(hass, "nozzle_count", { count });
  if (!refs.dual) return specRow(t(hass, "info_nozzles"), [counted, ...lines].join(" · "));
  return specRow(
    t(hass, "info_nozzles"),
    html`<span>${counted}</span>
      ${lines.map((line) => html`<span class="spec-sub">${line}</span> `)}`,
    nothing,
    "lines",
  );
}

export function infoContent(ctx: CardContext, copied: boolean, copy: (text: string) => void): TemplateResult {
  const { hass, refs } = ctx;
  const copyButton = (label: TextKey, value: string): TemplateResult | typeof nothing =>
    canCopy()
      ? html`<button class="icon-btn copy" aria-label=${t(hass, label)} title=${t(hass, label)} @click=${() => copy(value)}>${icon("copy")}</button>`
      : nothing;
  const bambuddyName = textAttribute(ctx, refs.status, "bambuddy_name");
  const ip = hasValue(hass, refs.ipAddress) ? stateOf(hass, refs.ipAddress)?.state : undefined;
  const device = hass.devices[refs.deviceId];
  const serial = device?.serial_number || undefined;
  // The BamBuddy server the printer comes from: the same printer may sit in two.
  const server = device?.via_device_id ? hass.devices[device.via_device_id] : undefined;
  const network = networkOf(ctx);
  const developer = hasValue(hass, refs.developerMode) ? stateOf(hass, refs.developerMode)?.state === "on" : undefined;
  const nozzles = nozzleLines(ctx);
  const hours = hoursText(ctx);
  const installed = firmwareOf(ctx)?.installed;
  // Which printer, what it has, what it does now, how it reaches Home Assistant.
  return html`<h2 id="dlg-title">${t(hass, "menu_info")}</h2>
    <div class="spec">
      ${bambuddyName ? specRow(t(hass, "info_name"), bambuddyName) : nothing}
      ${refs.model ? specRow(t(hass, "info_model"), refs.model) : nothing}
      ${serial ? specRow(t(hass, "info_serial"), serial, copyButton("copy_serial", serial)) : nothing}
      ${installed ? specRow(t(hass, "firmware"), installed) : nothing}
      ${nozzleRow(ctx, nozzles)}
      ${hours ? specRow(t(hass, "info_hours"), hours) : nothing}
      ${specRow(t(hass, "info_status"), chip(ctx.online ? "ok" : ctx.unreachable ? "warn" : "off", t(hass, connection(ctx))))}
      ${ctx.online ? specRow(t(hass, "info_print_status"), formatState(hass, refs.status, ctx.status) ?? ctx.status) : nothing}
      ${network ? specRow(t(hass, "info_network"), network.iconName === "wifi" ? `${t(hass, "wifi")} · ${network.text}` : t(hass, "lan_wired")) : nothing}
      ${ip ? specRow(t(hass, "info_ip"), ip, copyButton("copy_ip", ip)) : nothing}
      ${developer === undefined
        ? nothing
        : developer
          ? specRow(t(hass, "info_developer"), chip("ok", t(hass, "info_on")))
          : specRow(
              t(hass, "info_developer"),
              html`${chip("warn", t(hass, "info_off"))} <span class="spec-sub">${t(hass, "info_developer_note")}</span>`,
              nothing,
              "lines",
            )}
      ${server && deviceName(server) ? specRow(t(hass, "info_server"), deviceName(server)) : nothing}
    </div>
    ${copied ? snack("dlg-snack", t(hass, "copied")) : nothing}`;
}
