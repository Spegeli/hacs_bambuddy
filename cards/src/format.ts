// Numbers, temperatures, durations and times as the viewer reads them:
// Home Assistant's number format, time format and time zone settings.
import { t } from "./i18n";
import type { Hass, HassEntityState, PrintStatus } from "./types";

const MISSING = new Set(["unavailable", "unknown"]);

export const stateOf = (hass: Hass, entityId: string | undefined): HassEntityState | undefined =>
  entityId ? hass.states[entityId] : undefined;

/** Whether the entity has a state to show. */
export function hasValue(hass: Hass, entityId: string | undefined): boolean {
  const state = stateOf(hass, entityId);
  return !!state && !MISSING.has(state.state);
}

/** The entity's state as a number, if it is one. */
export function numericState(hass: Hass, entityId: string | undefined): number | undefined {
  const state = stateOf(hass, entityId);
  if (!state || state.state.trim() === "") return undefined;
  const value = Number(state.state);
  return Number.isFinite(value) ? value : undefined;
}

/** The entity's state as Home Assistant shows it, translated; undefined
 * when there is none. `state` formats another state of the same entity:
 * an option of a select. */
export function formatState(hass: Hass, entityId: string | undefined, state?: string): string | undefined {
  const stateObj = stateOf(hass, entityId);
  if (!stateObj || (state === undefined && MISSING.has(stateObj.state))) return undefined;
  return state === undefined ? hass.formatEntityState(stateObj) : hass.formatEntityState(stateObj, state);
}

// Home Assistant's number_format setting, as its own frontend reads it.
function numberLocale(hass: Hass): string | undefined {
  switch (hass.locale.number_format) {
    case "comma_decimal":
      return "en-US";
    case "decimal_comma":
      return "de";
    case "space_comma":
      return "fr";
    case "quote_decimal":
      return "de-CH";
    case "system":
      return undefined;
    default:
      return hass.locale.language;
  }
}

export function formatNumber(hass: Hass, value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(numberLocale(hass), {
    maximumFractionDigits,
    useGrouping: hass.locale.number_format !== "none",
  }).format(value);
}

export const formatTemperature = (hass: Hass, value: number): string => `${formatNumber(hass, value)}\u00a0°C`;

export const formatPercent = (hass: Hass, value: number): string => `${formatNumber(hass, value)}\u00a0%`;

/** Minutes as "42 min", "2 h", "1 h 23 min", "1 d 4 h". */
export function formatDuration(hass: Hass, minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const rest = total % 60;
  if (days > 0) return t(hass, "dur_dh", { d: days, h: hours });
  if (hours === 0) return t(hass, "dur_min", { m: rest });
  return rest === 0 ? t(hass, "dur_h", { h: hours }) : t(hass, "dur_hm", { h: hours, m: rest });
}

/** Whether times read with AM/PM: the profile's time format, else what the
 * language (or the browser, for "system") uses. */
function hour12(hass: Hass): boolean | undefined {
  switch (hass.locale.time_format) {
    case "12":
      return true;
    case "24":
      return false;
    case "system":
      return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12;
    default:
      return undefined;
  }
}

/** The time zone times are shown in: the server's when the profile says
 * so, else the browser's. */
function timeZone(hass: Hass): string | undefined {
  return hass.locale.time_zone === "server" ? hass.config?.time_zone : undefined;
}

/** A point in time as "14:35", or "Tue 09:10" when it is not today. */
export function formatEndTime(hass: Hass, iso: string, now: Date = new Date()): string | undefined {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return undefined;
  const zone = timeZone(hass);
  const language = hass.locale.language;
  const day = (date: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: zone, dateStyle: "short" }).format(date);
  const sameDay = day(when) === day(now);
  return new Intl.DateTimeFormat(language, {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12: hour12(hass),
    ...(sameDay ? {} : { weekday: "short" }),
  }).format(when);
}

// --- Print status ---------------------------------------------------------

/** States while a print job is on the printer: jogging waits. */
export const BUSY: ReadonlySet<string> = new Set<PrintStatus>(["printing", "paused", "preparing", "slicing"]);

/** States while a print runs, not paused: loading waits too. */
export const RUNNING: ReadonlySet<string> = new Set<PrintStatus>(["printing", "preparing", "slicing"]);

/** AMS states of a filament change: loading, moving and cooling wait. Not
 * reading, assisting or calibrating -- an AMS stuck there must not lock the
 * user out. */
export const FILAMENT_CHANGE: ReadonlySet<string> = new Set(["heating", "feeding", "retracting", "verifying", "purging", "changing_filament"]);

/** States that show the job's progress and cover. */
export const WITH_JOB: ReadonlySet<string> = new Set<PrintStatus>(["printing", "paused", "preparing", "slicing", "finished", "failed"]);

export type Tone = "active" | "paused" | "done" | "failed" | "idle" | "off";

/** The colour family of a print status. */
export function toneOf(status: string | undefined): Tone {
  switch (status) {
    case "printing":
    case "preparing":
    case "slicing":
      return "active";
    case "paused":
      return "paused";
    case "finished":
      return "done";
    case "failed":
      return "failed";
    case "idle":
      return "idle";
    default:
      return "off";
  }
}

// --- Filament -------------------------------------------------------------

/** A colour the card can paint: "#RRGGBB" (or the integration's
 * "#RRGGBBAA"), else undefined. */
export function filamentColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value) ? value.slice(0, 7) : undefined;
}

/** A colour's relative brightness, 0 (black) to 1 (white). */
function brightness(color: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Whether a colour is so light or so dark that it needs a clear outline:
 * white on a light card, black on a dark one. */
export function needsOutline(color: string): boolean {
  const value = brightness(color);
  return value > 0.85 || value < 0.12;
}
