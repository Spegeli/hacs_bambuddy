// The print options of the control view: a switch for each detection the
// printer has. On, the printer pauses the print when it sees the problem;
// they switch during a print too -- that is when a false alarm happens.
// Folded at first, its head says what is off ("All on", "1 off", "All
// off"), so one switched off shows without opening it. Only the switch
// itself taps, so a scroll over the list never switches one; a tap shows
// the new state at once (see card.ts, toggleSwitch).
import { html, nothing, type TemplateResult } from "lit";

import { hasValue } from "./format";
import { icon } from "./icons";
import { t, type TextKey } from "./i18n";
import { entityName, type CardContext } from "./parts";
import type { DetectorKey } from "./types";

/** What a detection watches for, where its name does not say: the X1
 * series' monitoring covers spaghetti and the purge chute. */
function subLine(ctx: CardContext, key: DetectorKey): string | undefined {
  return key === "ai_monitoring" && /^X1/i.test(ctx.refs.model) ? t(ctx.hass, "detection_ai_monitoring_x1") : undefined;
}

function detectionRow(ctx: CardContext, key: DetectorKey, entityId: string): TemplateResult {
  const { hass } = ctx;
  const label = entityName(ctx, entityId, `detection_${key}` as TextKey);
  const sub = subLine(ctx, key);
  const subId = `det-sub-${key}`;
  const text = html`<span class="det-text">
    <span class="det-name">${label}</span>
    ${sub ? html`<span class="det-sub" id=${subId}>${sub}</span>` : nothing}
  </span>`;
  // Without a state the switch is neither on nor off: a line to read.
  if (!hasValue(hass, entityId)) return html`<div class="det-row unknown">${text}<span class="det-state">${t(hass, "unknown")}</span></div>`;
  const on = ctx.switchOn(entityId);
  // Hide controls: its state in words, nothing to switch.
  if (ctx.viewOnly) return html`<div class="det-row">${text}<span class="det-state">${t(hass, on ? "on" : "off")}</span></div>`;
  const pending = ctx.isPending(`switch_${entityId}`);
  return html`<div class="det-row">
    ${text}
    <button
      class="det-switch"
      role="switch"
      aria-label=${label}
      aria-describedby=${sub ? subId : nothing}
      aria-checked=${on ? "true" : "false"}
      aria-busy=${pending ? "true" : "false"}
      aria-disabled=${pending ? "true" : nothing}
      ?disabled=${!ctx.online}
      @click=${() => ctx.toggleSwitch(entityId)}
    >
      <span class="toggle" aria-hidden="true"><span class="knob"></span></span>
    </button>
  </div>`;
}

/** The section, where the printer has a detection switch. */
export function detectionSection(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  if (!refs.detectors.length) return nothing;
  // Only switches with a state count: an unknown one is neither on nor off.
  const known = refs.detectors.filter(({ entityId }) => hasValue(hass, entityId));
  const off = known.filter(({ entityId }) => !ctx.switchOn(entityId)).length;
  // One detection (the A1 series) says its own state.
  const summary =
    known.length === 1
      ? t(hass, off ? "off" : "on")
      : off === 0
        ? t(hass, "detection_all_on")
        : off === known.length
          ? t(hass, "detection_all_off")
          : t(hass, "detection_off", { off });
  const open = ctx.optionsOpen;
  return html`<section class="detection">
    <button class="det-head" aria-expanded=${open ? "true" : "false"} aria-controls=${open ? "det-body" : nothing} @click=${() => ctx.toggleOptions()}>
      <span class="section-label" id="det-title">${icon("eye")}${t(hass, "detection")}</span>
      ${known.length
        ? html`<span class="det-summary">${summary}</span>`
        : nothing}
      <span class="det-chevron ${open ? "open" : ""}" aria-hidden="true">${icon("chevronDown")}</span>
    </button>
    ${open
      ? html`<div class="det-body" id="det-body" role="region" aria-labelledby="det-title">
          <div class="det-rows">${refs.detectors.map(({ key, entityId }) => detectionRow(ctx, key, entityId))}</div>
          <p class="hint">${t(hass, "detection_hint")}</p>
        </div>`
      : nothing}
  </section>`;
}
