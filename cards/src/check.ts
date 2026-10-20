// The connection check: BamBuddy probes the printer's ports and its MQTT
// connection (the integration's run_diagnostic action) and answers with ids
// and states, no texts -- the card words each in the viewer's language.
// The dialog leads with the verdict and what is wrong, each with what to
// do; what passed and what was not checked fold into a line each.
import { html, nothing, type TemplateResult } from "lit";

import { entriesOf, responseOf } from "./actions";
import { icon, type IconName } from "./icons";
import { LANGUAGES, languageOf, t, type TextKey } from "./i18n";
import type { CardContext } from "./parts";
import type { Hass } from "./types";

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface Check {
  id: string;
  status: CheckStatus;
  params: Record<string, unknown>;
}

export interface CheckResult {
  overall: string;
  checks: Check[];
}

export interface CheckDialog {
  kind: "check";
  running: boolean;
  /** When the check started, for the seconds shown while it runs. */
  started: number;
  result?: CheckResult;
  error?: string;
  /** The folded lines shown open: passed, not checked. */
  open?: readonly ("pass" | "skip")[];
}

const STATUSES: readonly CheckStatus[] = ["pass", "fail", "warn", "skip"];

/** BamBuddy's connection check of the printer, as the integration answers. */
export async function runCheck(hass: Hass, deviceId: string): Promise<CheckResult> {
  const response = await responseOf(hass, "run_diagnostic", { device_id: deviceId });
  const checks = entriesOf(response["checks"], "id", "string").map((item) => ({
    id: item["id"] as string,
    status: STATUSES.includes(item["status"] as CheckStatus) ? (item["status"] as CheckStatus) : "skip",
    params: typeof item["params"] === "object" && item["params"] !== null ? (item["params"] as Record<string, unknown>) : {},
  }));
  return { overall: typeof response["overall"] === "string" ? response["overall"] : "ok", checks };
}

/** A text the card has, by a key built from BamBuddy's ids. */
function text(hass: Hass, key: string, vars: Record<string, string | number> = {}): string | undefined {
  return key in LANGUAGES[languageOf(hass)] ? t(hass, key as TextKey, vars) : undefined;
}

const vars = (check: Check): Record<string, string | number> =>
  Object.fromEntries(Object.entries(check.params).filter((entry): entry is [string, string | number] => ["string", "number"].includes(typeof entry[1])));

/** A check's title: its own words, else BamBuddy's id. */
const title = (hass: Hass, check: Check): string => text(hass, `check_${check.id}`, vars(check)) ?? check.id;

/** What a check found, and what to do: the most specific text there is. A
 * check not run says why where BamBuddy tells -- else only that it was not
 * run: a cause BamBuddy did not name would send the user the wrong way. A
 * text's remedy (its key with `_fix`) where asked: not for a check that
 * follows from another problem. */
function detail(hass: Hass, check: Check, withFix = false): string | undefined {
  const reason = typeof check.params["reason"] === "string" ? check.params["reason"] : undefined;
  if (check.id === "developer_mode" && check.status === "fail") return t(hass, "developer_off");
  const specific = reason ? `check_${check.id}_${check.status}_${reason}` : undefined;
  const key = specific && text(hass, specific) !== undefined ? specific : `check_${check.id}_${check.status}`;
  const own = text(hass, key, vars(check));
  const fix = withFix ? text(hass, `${key}_fix`, vars(check)) : undefined;
  return own ? [own, fix].filter(Boolean).join(" ") : check.status === "skip" ? t(hass, "check_skip") : undefined;
}

const ICONS: Record<CheckStatus, IconName> = { pass: "check", fail: "error", warn: "warning", skip: "minus" };
const SEVERITY: Record<CheckStatus, string> = { pass: "ok", fail: "error", warn: "warning", skip: "skip" };

function item(ctx: CardContext, check: Check, follows: boolean): TemplateResult {
  const { hass } = ctx;
  const about = detail(hass, check, !follows);
  const said = check.status === "fail" ? "hms_error" : check.status === "warn" ? "hms_warning" : undefined;
  return html`<div class="check-item hms-item sev-${SEVERITY[check.status]}">
    ${icon(ICONS[check.status])}
    <div class="hms-body">
      ${said ? html`<span class="sr-only">${t(hass, said)}: </span>` : nothing}<span class="check-title">${title(hass, check)}</span>
      ${about ? html`<span class="check-detail">${about}</span>` : nothing}
      ${follows ? html`<span class="check-detail">${t(hass, "check_follows")}</span>` : nothing}
    </div>
  </div>`;
}

/** The verdict: BamBuddy's, with how many things need attention. */
function verdict(hass: Hass, result: CheckResult): { tone: string; text: string } {
  const fails = result.checks.filter((check) => check.status === "fail").length;
  const warns = result.checks.filter((check) => check.status === "warn").length;
  if (result.overall === "problems" || fails > 0) {
    const n = Math.max(1, fails);
    return { tone: "err", text: n === 1 ? t(hass, "check_problems_one") : t(hass, "check_problems", { n }) };
  }
  if (result.overall === "warnings" || warns > 0) {
    const n = Math.max(1, warns);
    return { tone: "warn", text: n === 1 ? t(hass, "check_warnings_one") : t(hass, "check_warnings", { n }) };
  }
  return { tone: "ok", text: t(hass, "check_ok") };
}

export interface CheckActions {
  toggleFold: (which: "pass" | "skip") => void;
}

function fold(ctx: CardContext, which: "pass" | "skip", checks: Check[], dialog: CheckDialog, actions: CheckActions): TemplateResult | typeof nothing {
  const { hass } = ctx;
  if (!checks.length) return nothing;
  const open = dialog.open?.includes(which) ?? false;
  const n = checks.length;
  const label = which === "pass" ? (n === 1 ? t(hass, "check_passed_one") : t(hass, "check_passed", { n })) : t(hass, "check_skipped", { n });
  return html`<div class="check-fold ${which === "pass" ? "tone-ok" : "tone-neutral"}">
    <button class="det-head" aria-expanded=${open ? "true" : "false"} @click=${() => actions.toggleFold(which)}>
      <span class="section-label">${icon(which === "pass" ? "check" : "minus")}${label}</span>
      <span class="det-chevron ${open ? "open" : ""}" aria-hidden="true">${icon("chevronDown")}</span>
    </button>
    ${open
      ? html`<div class="check-folded">
          ${checks.map(
            (check) => html`<div class="check-line">
              <span class="check-title">${title(hass, check)}</span>
              ${which === "skip" ? html`<span class="check-detail">${detail(hass, check)}</span>` : nothing}
            </div>`,
          )}
        </div>`
      : nothing}
  </div>`;
}

/** The state: running, failed, or the verdict -- in one live region that
 * stays in place, so a screen reader hears the verdict once; the seconds
 * are not read out. */
function state(ctx: CardContext, dialog: CheckDialog, now: number): TemplateResult {
  const { hass } = ctx;
  if (dialog.running) {
    const seconds = Math.max(0, Math.floor((now - dialog.started) / 1000));
    return html`<div class="check-running">
        <span class="check-spinner" aria-hidden="true"></span>
        <span class="check-seconds" aria-hidden="true">${t(hass, "check_running", { s: seconds })}</span>
        <span class="sr-only">${t(hass, "check_running_sr")}</span>
      </div>
      <p class="hint">${t(hass, "check_running_hint")}</p>`;
  }
  if (dialog.error || !dialog.result) {
    return html`<div class="dlg-error">${icon("error")}<span>${t(hass, "check_error", { error: dialog.error ?? "" })}</span></div>`;
  }
  const found = verdict(hass, dialog.result);
  return html`<div class="check-verdict tone-${found.tone}">${icon(found.tone === "ok" ? "check" : found.tone === "warn" ? "warning" : "error")}<span>${found.text}</span></div>`;
}

export function checkContent(ctx: CardContext, dialog: CheckDialog, actions: CheckActions, now: number): TemplateResult {
  const { hass } = ctx;
  const checks = !dialog.running && dialog.result ? dialog.result.checks : [];
  const mqttFailed = checks.some((check) => check.id === "port_mqtt" && check.status === "fail");
  // Failures before warnings, each kind in BamBuddy's order.
  const problems = checks
    .filter((check) => check.status === "fail" || check.status === "warn")
    .sort((a, b) => Number(b.status === "fail") - Number(a.status === "fail"));
  return html`<h2 id="dlg-title">${t(hass, "check_connection")}</h2>
    <div class="check-status" role="status">${state(ctx, dialog, now)}</div>
    ${problems.length
      ? html`<div class="hms-list check-list">
          ${problems.map((check) => item(ctx, check, mqttFailed && check.id !== "port_mqtt" && check.id.startsWith("port_")))}
        </div>`
      : nothing}
    ${fold(ctx, "pass", checks.filter((check) => check.status === "pass"), dialog, actions)}
    ${fold(ctx, "skip", checks.filter((check) => check.status === "skip"), dialog, actions)}`;
}
