// What the head's chips and the menu open about the printer: the HMS
// messages with their answers, the storage, the firmware and the printer
// information.
import { html, nothing, type TemplateResult } from "lit";

import { deviceName } from "./discovery";
import { formatState, hasValue, stateOf, textOrUndefined } from "./format";
import {
  answersOf,
  canClearHms,
  firmwareOf,
  HMS_ANSWERS,
  hmsAnswered,
  hmsCode,
  hmsOf,
  hoursText,
  networkOf,
  nozzleOf,
  SEVERITIES,
  severityOf,
  worstFirst,
  type HmsError,
} from "./header";
import { icon } from "./icons";
import { t, type TextKey } from "./i18n";
import { actionButton, connection, dialogNote, noData, sideAt, snack, stopQuestion, textAttribute, type CardContext } from "./parts";
import { hasTools, toolLines } from "./tools";

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
              return html`<div class="hms-item sev-${SEVERITIES[severity].tone}">
                ${icon(SEVERITIES[severity].icon)}
                <div class="hms-body">
                  ${description ? html`<span class="sr-only">${t(hass, `hms_${severity}`)}: </span>` : nothing}<span class="hms-text" id="hms-text-${index}">${description ?? t(hass, "hms_no_text", { severity: t(hass, `hms_${severity}`) })}</span>
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

const chip = (tone: string, text: string): TemplateResult => html`<span class="chip tone-${tone}">${text}</span>`;

/** "Nozzle: 0.4 mm · Hardened steel"; two nozzles: a line for each, its
 * side as the nozzle symbol with L or R (in full for a screen reader and
 * as the tooltip) -- the lines say how many. */
function nozzleRow(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  // The H3C's nine PrintTools.
  if (hasTools(ctx)) {
    const lines = toolLines(ctx);
    if (!lines.length) return nothing;
    return specRow(t(hass, "info_nozzles"), html`${lines.map((line) => html`<span>${line}</span> `)}`, nothing, "lines");
  }
  if (!refs.dual) {
    const parts = nozzleOf(ctx, 0);
    return parts ? specRow(t(hass, "info_nozzle"), parts) : nothing;
  }
  const lines = refs.nozzles.map((_, index) => [index, nozzleOf(ctx, index)] as const).filter(([, parts]) => parts);
  if (!lines.length) return nothing;
  return specRow(
    t(hass, "info_nozzles"),
    html`${lines.map(([index, parts]) => {
      const name = t(hass, `nozzle_${sideAt(index)}`);
      const short = t(hass, `side_${sideAt(index)}_short`);
      return html`<span
        ><span class="spec-side" title=${name}>${icon("nozzle")}<span aria-hidden="true">${short}:</span><span class="sr-only">${name}:</span></span>
        ${parts}</span
      > `;
    })}`,
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
  const hours = hoursText(ctx);
  const installed = firmwareOf(ctx)?.installed;
  // Which printer, what it has, what it does now, how it reaches Home Assistant.
  return html`<h2 id="dlg-title">${t(hass, "menu_info")}</h2>
    <div class="spec">
      ${bambuddyName ? specRow(t(hass, "info_name"), bambuddyName) : nothing}
      ${refs.model ? specRow(t(hass, "info_model"), refs.model) : nothing}
      ${serial ? specRow(t(hass, "info_serial"), serial, copyButton("copy_serial", serial)) : nothing}
      ${installed ? specRow(t(hass, "firmware"), installed) : nothing}
      ${nozzleRow(ctx)}
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
