// The card's head: the printer's name in BamBuddy with its model, nozzle
// and print hours below, the chips the user chose (the network, the HMS
// messages, the firmware, maintenance, the door, the storage, drying, the
// power), a line under them while an HMS message matters, and what the
// dialogs the chips and the menu open read of the printer
// (printer-dialogs.ts draws them).
import { html, nothing, type TemplateResult } from "lit";

import { formatDuration, formatNumber, formatState, hasValue, minutesOf, numericState, stateOf, textOrUndefined } from "./format";
import { icon, type IconName } from "./icons";
import { t, type TextKey } from "./i18n";
import { maintenanceChip } from "./maintenance";
import { powerChip } from "./power";
import { compactWords, textAttribute, type CardContext } from "./parts";
import type { HassEntityState, HeaderChip } from "./types";

// --- Title ------------------------------------------------------------------

/** A nozzle's diameter as BamBuddy reports it: "0.4". */
const diameter = (ctx: CardContext, entityId: string | undefined): string | undefined => {
  const value = numericState(ctx.hass, entityId);
  return value === undefined ? undefined : formatNumber(ctx.hass, value, 2);
};

/** A nozzle's diameter and type: "0.4 mm · Hardened steel"; "" where neither is known. */
export function nozzleOf(ctx: CardContext, index: number): string {
  const { hass, refs } = ctx;
  const size = diameter(ctx, refs.nozzleDiameters[index]);
  const type = refs.nozzleTypes[index];
  return [size === undefined ? undefined : `${size} mm`, hasValue(hass, type) ? formatState(hass, type) : undefined].filter(Boolean).join(" · ");
}

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
export function hoursText(ctx: CardContext): string | undefined {
  const { hass, refs } = ctx;
  const hours = numericState(hass, refs.printHours);
  if (hours === undefined) return undefined;
  if (typeof hass.formatEntityState === "function") return hass.formatEntityState(stateOf(hass, refs.printHours) as HassEntityState);
  return t(hass, "dur_h", { h: formatNumber(hass, Math.round(hours)) });
}

/** The line below the title: model · nozzle · print hours, what is known. */
export const subtitle = (ctx: CardContext): string => [ctx.refs.model, nozzleText(ctx), hoursText(ctx)].filter(Boolean).join(" · ");

// --- HMS --------------------------------------------------------------------

export interface HmsError {
  code?: unknown;
  severity?: unknown;
  description?: unknown;
  /** What the printer's screen offers to answer it with, in Bambu's order. */
  actions?: unknown;
}

/** The answers the card names (the integration lists only those that send
 * the printer something). */
export const HMS_ANSWERS: Record<string, TextKey> = {
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
export function answersOf(error: HmsError): string[] {
  return Array.isArray(error.actions) ? error.actions.filter((action): action is string => typeof action === "string" && Object.hasOwn(HMS_ANSWERS, action)) : [];
}

/** Whether a message the dialog shows offers an answer the card sends. */
export function hmsAnswered(ctx: CardContext): boolean {
  return ctx.canControl && ctx.online && hmsOf(ctx).errors.some((error) => answersOf(error).length > 0);
}

type Severity = "error" | "warning" | "unknown" | "notice";

/** Each severity, the worst first: its icon, its colour in a message (an
 * unknown one warns) and its tone on a chip or the HMS line. */
export const SEVERITIES: Record<Severity, { icon: IconName; tone: string; chip: string }> = {
  error: { icon: "error", tone: "error", chip: "err" },
  warning: { icon: "warning", tone: "warning", chip: "warn" },
  unknown: { icon: "warning", tone: "warning", chip: "warn" },
  notice: { icon: "info", tone: "notice", chip: "info" },
};
const SEVERITY_ORDER = Object.keys(SEVERITIES) as Severity[];

/** An HMS code the way Bambu Lab writes it: 0300_0100_0001_0004. */
export function hmsCode(code: unknown): string {
  const text = typeof code === "string" ? code.replace(/^0x/i, "").toUpperCase() : "";
  return /^[0-9A-F]{8}([0-9A-F]{8})?$/.test(text) ? (text.match(/.{4}/g) as string[]).join("_") : text;
}

/** A severity the card colours: an unknown one counts as a warning. */
export const severityOf = (error: HmsError): Severity =>
  typeof error.severity === "string" && (SEVERITY_ORDER as string[]).includes(error.severity) ? (error.severity as Severity) : "unknown";

/** The messages, the worst first; alike ones in BamBuddy's order. */
export function worstFirst(errors: HmsError[]): HmsError[] {
  const rank = (error: HmsError): number => SEVERITY_ORDER.indexOf(severityOf(error));
  return [...errors].sort((a, b) => rank(a) - rank(b));
}

/** The printer's HMS messages, and how many it reports -- undefined where
 * it says nothing. */
export function hmsOf(ctx: CardContext): { count?: number; errors: HmsError[] } {
  const listed = stateOf(ctx.hass, ctx.refs.hms)?.attributes["errors"];
  const errors = (Array.isArray(listed) ? listed : []) as HmsError[];
  const count = numericState(ctx.hass, ctx.refs.hms) ?? (Array.isArray(listed) ? errors.length : undefined);
  return count === undefined ? { errors } : { count, errors };
}

/** Whether the HMS dialog offers to clear the messages. */
export const canClearHms = (ctx: CardContext): boolean => !!ctx.refs.clearHms && ctx.canControl && (hmsOf(ctx).count ?? 0) > 0;

// --- Chips ------------------------------------------------------------------

export type DialogChip = "hms" | "firmware" | "maintenance" | "storage" | "power";

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
export function networkOf(ctx: CardContext): Network | undefined {
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

function networkChip(ctx: CardContext): TemplateResult | typeof nothing {
  const network = networkOf(ctx);
  if (!network) return nothing;
  const content = html`${icon(network.iconName)}<span>${network.text}</span>`;
  // Its signal changes with every poll: the chip row announces the rest.
  return html`<button
    class="pill network tone-${network.tone}"
    aria-label=${network.aria ?? network.text}
    title=${network.aria ?? network.text}
    aria-live="off"
    @click=${() => ctx.moreInfo(network.entityId)}
  >
    ${content}
  </button>`;
}

function hmsChip(ctx: CardContext, open: (chip: DialogChip) => void): TemplateResult | typeof nothing {
  const { hass } = ctx;
  const { count, errors } = hmsOf(ctx);
  if (!ctx.online || count === undefined) return nothing;
  const worst = worstFirst(errors)[0];
  const tone = count > 0 ? SEVERITIES[worst ? severityOf(worst) : "unknown"].chip : "ok";
  const label = count > 1 ? t(hass, "hms_pill_aria", { count }) : count === 1 ? t(hass, "hms_pill_aria_one") : t(hass, "hms_pill_none");
  const words = ctx.settings.compactChips ? compactWords(count > 0 ? String(count) : t(hass, "chip_ok"), label) : html`<span>${count > 0 ? label : t(hass, "hms_ok")}</span>`;
  return html`<button class="pill hms tone-${tone}" aria-label=${label} title=${label} aria-haspopup="dialog" @click=${() => open("hms")}>
    ${icon(count > 0 ? "shieldAlert" : "shieldCheck")}${words}
  </button>`;
}

/** The printer's firmware: its installed version, and whether an update is out. */
export function firmwareOf(ctx: CardContext): { installed?: string; latest?: string; update: boolean; current: boolean } | undefined {
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

function firmwareChip(ctx: CardContext, open: (chip: DialogChip) => void): TemplateResult | typeof nothing {
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
  const text =
    firmware.update && firmware.latest
      ? ctx.settings.compactChips
        ? firmware.latest
        : t(hass, "firmware_update_chip", { version: firmware.latest })
      : (firmware.installed ?? t(hass, "firmware"));
  // The name starts with what the full chip shows (voice control, screen
  // readers); a compact chip's version is in it too.
  const label =
    firmware.update && firmware.latest && firmware.installed
      ? t(hass, "firmware_update_label", { latest: firmware.latest, version: firmware.installed })
      : firmware.installed
        ? t(hass, key, { version: firmware.installed })
        : firmware.update && firmware.latest
          ? t(hass, "firmware_update_chip", { version: firmware.latest })
          : text;
  return html`<button class="pill firmware tone-${tone}" aria-label=${label} title=${label} aria-haspopup="dialog" @click=${() => open("firmware")}>
    ${icon(iconName)}${ctx.settings.compactChips ? compactWords(text, label) : html`<span>${text}</span>`}
  </button>`;
}

/** States in which a print stopped: any HMS message may say why. */
const STOPPED = new Set(["paused", "failed"]);

/** One line under the chips while an HMS message matters: one of the error
 * severity, or any while the print is paused or failed. It says the worst
 * and how many more there are; a tap opens the HMS dialog. */
function hmsLine(ctx: CardContext, open: (chip: DialogChip) => void): TemplateResult | typeof nothing {
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
  return html`<button class="hms-line tone-${SEVERITIES[severity].chip}" title=${message} aria-haspopup="dialog" @click=${() => open("hms")}>
    ${icon(SEVERITIES[severity].icon)}<span class="hms-line-text">${message}</span>${more > 0
      ? html`<span class="hms-line-more">${t(hass, "hms_more", { n: more })}</span>`
      : nothing}<span class="hms-line-go">${icon("chevronRight")}</span>
  </button>`;
}

/** The door, only while it is open: no warning -- PLA wants it open, and
 * the printer's own warnings come as HMS messages. BamBuddy cannot tell a
 * closed door from one never reported: no "closed" chip. */
function doorChip(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  if (!ctx.online || stateOf(hass, refs.door)?.state !== "on") return nothing;
  const label = t(hass, "door_open");
  const compact = ctx.settings.compactChips;
  return html`<button class="pill door tone-info ${compact ? "icon-only" : ""}" aria-label=${label} title=${label} @click=${() => ctx.moreInfo(refs.door)}>
    ${icon("doorOpen")}${compact ? compactWords(undefined, label) : html`<span>${label}</span>`}
  </button>`;
}

/** The storage, only while it is missing: without it BamBuddy sends no
 * print. A tap says why. A faulty card counts as present (HMS tells). */
function storageChip(ctx: CardContext, open: (chip: DialogChip) => void): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  if (!ctx.online || stateOf(hass, refs.storage)?.state !== "off") return nothing;
  const label = t(hass, refs.storageUsb ? "storage_usb_chip_title" : "storage_sd_chip_title");
  const compact = ctx.settings.compactChips;
  return html`<button class="pill storage tone-warn ${compact ? "icon-only" : ""}" aria-label=${label} title=${label} aria-haspopup="dialog" @click=${() => open("storage")}>
    ${icon(refs.storageUsb ? "usb" : "sd")}${compact ? compactWords(undefined, label) : html`<span>${t(hass, refs.storageUsb ? "storage_usb" : "storage_sd")}</span>`}
  </button>`;
}

/** One chip while AMS units dry, however many: the longest time left --
 * when all are done. Its countdown is not read out every minute. A tap
 * opens the Filament tab, else the drying unit's details. */
function dryingChip(ctx: CardContext): TemplateResult | typeof nothing {
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
  const detail = time
    ? n > 1
      ? t(hass, "dry_chip_aria", { n, time })
      : t(hass, "dry_chip_unit_aria", { unit: first.name, time })
    : n > 1
      ? what
      : t(hass, "dry_chip_unit", { unit: first.name });
  // Compact: the time, how many units before it; without a time, what dries.
  const compact = ctx.settings.compactChips && time !== undefined;
  const label = compact ? (n > 1 ? t(hass, "dry_chip_many_short", { n }) : undefined) : what;
  const tap = (): void => (ctx.filamentTab ? ctx.show("filament") : ctx.moreInfo(first.dryingRemaining ?? first.drying));
  // What dries and its time, bold as a fan's value: on a narrow card the
  // time takes a line of its own, with no separator left hanging.
  return html`<button class="pill dry-chip tone-info" aria-label=${compact ? detail : nothing} title=${detail} aria-live="off" @click=${tap}>
    ${icon("heat")}<span class="dry-text">${label ? html`<span>${label}</span> ` : nothing}${time ? html`<span class="dry-time">${time}</span>` : nothing}</span>
  </button>`;
}

/** The chips under the title the user chose -- by default network, HMS,
 * firmware --, in their order, each where known; the row announces a
 * change, a new HMS message say. Door, storage and drying show only while
 * they matter. Below it the HMS line where a message matters, whatever the
 * chips. */
export function chips(ctx: CardContext, open: (chip: DialogChip) => void): TemplateResult | typeof nothing {
  const chips: Record<HeaderChip, () => TemplateResult | typeof nothing> = {
    network: () => networkChip(ctx),
    hms: () => hmsChip(ctx, open),
    firmware: () => firmwareChip(ctx, open),
    maintenance: () => maintenanceChip(ctx, () => open("maintenance")),
    door: () => doorChip(ctx),
    storage: () => storageChip(ctx, open),
    drying: () => dryingChip(ctx),
    power: () => powerChip(ctx, () => open("power")),
  };
  const items = ctx.settings.chips.map((name: HeaderChip) => chips[name]()).filter((item) => item !== nothing);
  return html`${items.length ? html`<div class="pills" aria-live="polite">${items}</div>` : nothing}${hmsLine(ctx, open)}`;
}
