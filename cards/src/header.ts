// The card's head and what it opens: the printer's name in BamBuddy with
// its model, nozzle and print hours below, chips for the network, the HMS
// messages and the firmware, a line under them while an HMS message
// matters, and the contents of the dialogs the chips and the menu open --
// the HMS messages, the firmware, the printer information.
import { html, nothing, type TemplateResult } from "lit";

import { deviceName } from "./discovery";
import { formatNumber, formatState, hasValue, numericState, stateOf } from "./format";
import { icon, type IconName } from "./icons";
import { t, type TextKey } from "./i18n";
import type { CardContext } from "./parts";
import type { HassEntityState } from "./types";

// --- Title ------------------------------------------------------------------

/** A text attribute, where it has one. */
function textAttribute(ctx: CardContext, entityId: string | undefined, name: string): string | undefined {
  const value = stateOf(ctx.hass, entityId)?.attributes[name];
  return typeof value === "string" && value ? value : undefined;
}

/** The printer's name in BamBuddy, else its device's. */
export const printerTitle = (ctx: CardContext): string => textAttribute(ctx, ctx.refs.status, "bambuddy_name") ?? ctx.refs.name;

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
  return `${t(hass, "side_left_short")} ${left ?? "—"} / ${t(hass, "side_right_short")} ${right ?? "—"} mm`;
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
}

const SEVERITY_ORDER = ["error", "warning", "unknown", "notice"];

/** An HMS code the way Bambu Lab writes it: 0300_0100_0001_0004. */
export function hmsCode(code: unknown): string {
  const text = typeof code === "string" ? code.replace(/^0x/i, "").toUpperCase() : "";
  return /^[0-9A-F]{8}([0-9A-F]{8})?$/.test(text) ? (text.match(/.{4}/g) as string[]).join("_") : text;
}

/** A severity the card colours: an unknown one counts as a warning. */
const severityOf = (error: HmsError): string =>
  typeof error.severity === "string" && SEVERITY_ORDER.includes(error.severity) ? error.severity : "unknown";

const SEVERITY_ICONS: Record<string, IconName> = { error: "error", warning: "warning", unknown: "warning", notice: "info" };

/** The colour of a severity: error red, warning orange, notice blue. */
const severityTone = (severity: string): string => (severity === "unknown" ? "warning" : severity);

/** A chip's or the HMS line's tone for a severity. */
const SEVERITY_CHIP_TONES: Record<string, string> = { error: "err", warning: "warn", notice: "info" };

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

export type Pill = "hms" | "firmware";

/** The tone of a Wi-Fi signal: good from -60 dBm, fair to -75 dBm, else weak. */
const signalTone = (dbm: number): string => (dbm >= -60 ? "ok" : dbm >= -75 ? "warn" : "err");

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

/** How the printer is connected: on Ethernet, or its Wi-Fi signal; none
 * while it is offline -- the status chip says so. */
function networkOf(ctx: CardContext): Network | undefined {
  const { hass, refs } = ctx;
  if (!ctx.online) return undefined;
  if (stateOf(hass, refs.wiredNetwork)?.state === "on") return { tone: "neutral", iconName: "ethernet", text: t(hass, "lan"), entityId: refs.wiredNetwork };
  const dbm = numericState(hass, refs.wifiSignal);
  if (dbm === undefined) return undefined;
  const text = signalText(ctx, dbm);
  return { tone: signalTone(dbm), iconName: "wifi", text, aria: t(hass, "wifi_signal", { value: text }), entityId: refs.wifiSignal };
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
  const tone = count > 0 ? (SEVERITY_CHIP_TONES[severityTone(worst ? severityOf(worst) : "unknown")] as string) : "ok";
  const label = count > 0 ? t(hass, "hms_pill_aria", { count }) : t(hass, "hms_pill_none");
  return html`<button class="pill hms tone-${tone}" aria-label=${label} title=${label} @click=${() => open("hms")}>
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
      ? ["neutral", "memory", "firmware_offline"]
      : firmware.current
        ? ["ok", "check", "firmware_current"]
        : ["neutral", "memory", "firmware_version"];
  const text = firmware.installed ?? t(hass, "firmware");
  const label = firmware.installed ? t(hass, key, { version: firmware.installed }) : text;
  return html`<button class="pill firmware tone-${tone}" aria-label=${label} title=${label} @click=${() => open("firmware")}>
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
  const description = typeof worst?.description === "string" && worst.description ? worst.description : undefined;
  const message = worst ? (description ?? t(hass, `hms_${severity}` as TextKey)) : t(hass, "hms_count", { count });
  const more = sorted.length - 1;
  return html`<button class="hms-line tone-${SEVERITY_CHIP_TONES[severityTone(severity)]}" title=${message} @click=${() => open("hms")}>
    ${icon(SEVERITY_ICONS[severity] as IconName)}<span class="hms-line-text">${message}</span>${more > 0
      ? html`<span class="hms-line-more">${t(hass, "hms_more", { n: more })}</span>`
      : nothing}<span class="hms-line-go">${icon("chevronRight")}</span>
  </button>`;
}

/** The chips under the title: network, HMS, firmware -- each where known;
 * the row announces a change, a new HMS message say. Below it the HMS line
 * where a message matters. */
export function pills(ctx: CardContext, open: (pill: Pill) => void): TemplateResult | typeof nothing {
  const items = [networkPill(ctx), hmsPill(ctx, open), firmwarePill(ctx, open)].filter((item) => item !== nothing);
  return items.length ? html`<div class="pills" aria-live="polite">${items}</div>${hmsLine(ctx, open)}` : nothing;
}

// --- Dialogs ----------------------------------------------------------------

export function hmsContent(ctx: CardContext): TemplateResult {
  const { hass } = ctx;
  const { count = 0, errors } = hmsOf(ctx);
  const sorted = worstFirst(errors);
  const list = sorted.length
    ? html`<div class="hms-list">
        ${sorted.map((error) => {
          const severity = severityOf(error);
          const code = hmsCode(error.code);
          const description = typeof error.description === "string" && error.description ? error.description : undefined;
          return html`<div class="hms-item sev-${severityTone(severity)}">
            ${icon(SEVERITY_ICONS[severity] as IconName)}
            <div class="hms-body">
              <span class="hms-text">${description ?? t(hass, `hms_${severity}` as TextKey)}</span>
              ${code ? html`<span class="hms-code">${code}</span>` : nothing}
            </div>
          </div>`;
        })}
      </div>`
    : html`<p class="hms-empty">${count > 0 ? t(hass, "hms_count", { count }) : t(hass, "hms_none")}</p>`;
  return html`<h2 id="dlg-title">${t(hass, "hms_title")}</h2>
    ${list}
    ${canClearHms(ctx) ? html`<p class="dlg-note">${icon("info")}<span>${t(hass, "hms_clear_note")}</span></p>` : nothing}`;
}

/** A row of a dialog's facts: its label, its value, a copy button. */
function specRow(label: string, value: TemplateResult | string, extra: TemplateResult | typeof nothing = nothing, valueClass = ""): TemplateResult {
  return html`<div class="spec-row">
    <span class="spec-label">${label}</span>
    <span class="spec-value ${valueClass}">${value}</span>
    ${extra}
  </div>`;
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
    <p class="dlg-note">${icon("info")}<span>${t(hass, "firmware_note")}</span></p>`;
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
      return parts && refs.dual ? t(hass, "nozzle_side", { side: t(hass, index === 0 ? "left" : "right"), nozzle: parts }) : parts;
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
  const network = ctx.online ? networkOf(ctx) : undefined;
  const developer = hasValue(hass, refs.developerMode) ? stateOf(hass, refs.developerMode)?.state === "on" : undefined;
  const nozzles = nozzleLines(ctx);
  const hours = hoursText(ctx);
  const installed = firmwareOf(ctx)?.installed;
  return html`<h2 id="dlg-title">${t(hass, "menu_info")}</h2>
    <div class="spec">
      ${refs.model ? specRow(t(hass, "info_model"), refs.model) : nothing}
      ${bambuddyName ? specRow(t(hass, "info_name"), bambuddyName) : nothing}
      ${server && deviceName(server) ? specRow(t(hass, "info_server"), deviceName(server)) : nothing}
      ${specRow(t(hass, "info_status"), ctx.online ? chip("ok", t(hass, "online")) : chip("off", t(hass, "offline")))}
      ${specRow(t(hass, "info_print_status"), formatState(hass, refs.status, ctx.status) ?? ctx.status)}
      ${ip ? specRow(t(hass, "info_ip"), ip, copyButton("copy_ip", ip)) : nothing}
      ${serial ? specRow(t(hass, "info_serial"), serial, copyButton("copy_serial", serial)) : nothing}
      ${network ? specRow(t(hass, "info_network"), network.iconName === "wifi" ? `${t(hass, "wifi")} · ${network.text}` : network.text) : nothing}
      ${installed ? specRow(t(hass, "firmware"), installed) : nothing}
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
      ${nozzleRow(ctx, nozzles)}
      ${hours ? specRow(t(hass, "info_hours"), hours) : nothing}
    </div>
    ${copied ? html`<div class="dlg-snack"><div class="sent" role="status">${icon("check")}<span>${t(hass, "copied")}</span></div></div>` : nothing}`;
}
