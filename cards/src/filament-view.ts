// The filament view: every AMS unit with its slots, humidity, temperature
// and drying, and the external spools. Loading and unloading ask first and
// wait while a print runs or the AMS changes filament; a paused print lets
// the filament be changed by hand. While the printer is offline, no slot's
// contents are known.
import { html, nothing, type TemplateResult } from "lit";

import { formatDuration, formatPercent, formatTemperature, numericState, stateOf } from "./format";
import { icon } from "./icons";
import { t, type TextKey } from "./i18n";
import { actionButton, amsActivity, developerHint, emptyText, note, slotOf, swatch, type CardContext, type Slot } from "./parts";
import type { AmsRefs } from "./types";

const AMS_HT = "AMS HT";

/** The set-filament dialog's titles for the left and the right external spool. */
const EXTERNAL_TITLES: TextKey[] = ["filament_title_left", "filament_title_right"];

/** The pencils of the left and the right external spool: each names its spool. */
const EXTERNAL_EDITS: TextKey[] = ["set_filament_left", "set_filament_right"];

/** A pencil beside a spool without a chip: its material and colour are
 * set by hand. Never for the slot a running print feeds from. */
function editButton(ctx: CardContext, slot: Slot, title: string, label: string): TemplateResult | typeof nothing {
  if (!ctx.canControl || !ctx.online || !slot.present || slot.rfid || (ctx.running && slot.active)) return nothing;
  return actionButton({
    label,
    iconName: "pencil",
    iconOnly: true,
    kind: "plain",
    className: "edit",
    disabled: ctx.changing,
    pending: ctx.isPending(`filament_${slot.entityId}`),
    onClick: () => ctx.setFilament(slot, title),
  });
}

function slotRow(
  ctx: CardContext,
  slot: Slot,
  options: { canAct: boolean; canLoad: boolean; title: string; side?: string; editLabel?: string },
): TemplateResult {
  const { hass, refs } = ctx;
  const title = slot.unknown ? "—" : slot.empty ? emptyText(hass, slot) : slot.name || slot.type;
  // The material where the name does not say it: "Support for PLA" names
  // PLA-S, "Generic PETG" says PETG.
  const named = slot.name.toLowerCase().includes(slot.type.toLowerCase());
  // On the line below the name, so that a phone has room for the name.
  const inUse = slot.active ? html`<span class="in-use">${t(hass, "in_use")}</span>` : undefined;
  const details = [
    options.side ?? "",
    slot.empty || !slot.name || named ? "" : slot.type,
    slot.empty || slot.remaining === undefined ? "" : formatPercent(hass, slot.remaining),
  ].filter(Boolean);
  // In a paused print the change happens in the middle of it.
  const note = ctx.status === "paused" ? { note: t(hass, "paused_change") } : {};
  let action: TemplateResult | typeof nothing = nothing;
  if (ctx.canControl && slot.active) {
    action = actionButton({
      label: t(hass, "unload"),
      iconName: "unload",
      disabled: !options.canAct,
      pending: ctx.isPending("unload"),
      onClick: () =>
        ctx.confirm({
          title: t(hass, "unload_title"),
          text: t(hass, "unload_text"),
          confirm: t(hass, "unload"),
          ...note,
          action: ["bambuddy", "unload_filament", { device_id: refs.deviceId }],
          key: "unload",
        }),
    });
  } else if (ctx.canControl && !slot.empty && !slot.unknown && options.canLoad) {
    action = actionButton({
      label: t(hass, "load"),
      iconName: "load",
      disabled: !options.canAct,
      pending: ctx.isPending(`load_${slot.entityId}`),
      onClick: () =>
        ctx.confirm({
          title: t(hass, "load_title", { filament: title }),
          text: t(hass, "load_text"),
          confirm: t(hass, "load"),
          ...note,
          action: ["bambuddy", "load_filament", { entity_id: slot.entityId }],
          key: `load_${slot.entityId}`,
        }),
    });
  }
  return html`<div class="slot ${slot.active ? "active" : ""}">
    <button class="slot-main" aria-label=${slot.unknown ? t(hass, "unknown") : title} @click=${() => ctx.moreInfo(slot.entityId)}>
      ${swatch(slot, "large")}
      <span class="slot-text">
        <span class="slot-name">${title}</span>
        ${details.length || inUse
          ? html`<span class="slot-sub">${inUse}${inUse && details.length ? " · " : ""}${details.join(" · ")}</span>`
          : nothing}
      </span>
    </button>
    ${editButton(ctx, slot, options.title, options.editLabel ?? t(hass, "set_filament"))} ${action}
  </div>`;
}

const DRYING_MODELS = ["AMS 2 Pro", "AMS HT"];

function dryingRow(ctx: CardContext, unit: AmsRefs): TemplateResult | typeof nothing {
  const { hass } = ctx;
  // Only the AMS 2 Pro and the AMS HT have a heater.
  if (!unit.drying || !DRYING_MODELS.includes(unit.model)) return nothing;
  const on = stateOf(hass, unit.drying)?.state === "on";
  const left = numericState(hass, unit.dryingRemaining);
  const text = on ? (left ? t(hass, "drying", { time: formatDuration(hass, left) }) : t(hass, "drying_now")) : t(hass, "not_drying");
  const key = `dry_${unit.deviceId}`;
  return html`<div class="drying ${on ? "on" : ""}">
    ${icon("heat")}<span>${text}</span>
    ${ctx.canControl
      ? on
        ? actionButton({
            label: t(hass, "dry_stop"),
            iconName: "stop",
            kind: "plain",
            disabled: !ctx.online,
            pending: ctx.isPending(key),
            onClick: () => ctx.run(key, "bambuddy", "stop_drying", { device_id: unit.deviceId }),
          })
        : actionButton({
            label: t(hass, "dry"),
            iconName: "heat",
            kind: "plain",
            disabled: !ctx.online,
            pending: ctx.isPending(key),
            onClick: () => ctx.dry(unit),
          })
      : nothing}
  </div>`;
}

function unitSection(ctx: CardContext, unit: AmsRefs, canAct: boolean): TemplateResult {
  const { hass } = ctx;
  const humidity = numericState(hass, unit.humidity);
  const temperature = numericState(hass, unit.temperature);
  const ht = unit.model === AMS_HT;
  return html`<section class="unit">
    <div class="unit-head">
      <span class="unit-name">${unit.name}</span>
      ${unit.model && !unit.name.includes(unit.model) ? html`<span class="unit-model">${unit.model}</span>` : nothing}
      <span class="unit-env">
        ${humidity !== undefined ? html`<span title=${t(hass, "humidity")}>${icon("humidity")}${formatPercent(hass, humidity)}</span>` : nothing}
        ${temperature !== undefined ? html`<span title=${t(hass, "temperature")}>${icon("chamber")}${formatTemperature(hass, temperature)}</span>` : nothing}
      </span>
    </div>
    ${dryingRow(ctx, unit)}
    <div class="slots">
      ${unit.slots.map((entityId, index) =>
        slotRow(ctx, slotOf(hass, entityId), {
          canAct,
          canLoad: !ht,
          title: t(hass, "filament_title", { slot: t(hass, "slot_label", { slot: index + 1, unit: unit.name }) }),
        }),
      )}
    </div>
    ${ht && ctx.canControl ? html`<p class="hint">${t(hass, "ht_load")}</p>` : nothing}
  </section>`;
}

/** The filament view; the card offers it only where the printer reports an
 * AMS unit or an external spool. */
export function filamentView(ctx: CardContext): TemplateResult {
  const { hass, refs } = ctx;
  // Offline, the line about the contents says it all.
  const reason = ctx.keyLacksControl
    ? t(hass, "read_only")
    : !ctx.canControl || !ctx.online
      ? undefined
      : ctx.running
        ? t(hass, "filament_pause")
        : ctx.changing
          ? t(hass, "changing_reason")
          : undefined;
  const canAct = ctx.canControl && ctx.online && !ctx.running && !ctx.changing;
  const dual = refs.externalSpools.length > 1;
  const activity = amsActivity(ctx);
  return html`${developerHint(ctx)}${reason ? note(reason, ctx.keyLacksControl ? "info" : "warning") : nothing}
    ${ctx.online ? nothing : note(t(hass, "filament_offline"), "warning")}
    ${activity ? html`<div class="activity" role="status">${icon("sync")}<span>${activity}</span><span class="activity-bar" aria-hidden="true"></span></div>` : nothing}
    ${refs.ams.map((unit) => unitSection(ctx, unit, canAct))}
    ${refs.externalSpools.length
      ? html`<section class="unit">
          <div class="unit-head"><span class="unit-name">${t(hass, dual ? "externals" : "external")}</span></div>
          <div class="slots">
            ${refs.externalSpools.map((entityId, index) =>
              slotRow(ctx, slotOf(hass, entityId), {
                canAct,
                canLoad: true,
                title: t(hass, (dual ? EXTERNAL_TITLES[index] : "filament_title_external") as TextKey),
                editLabel: t(hass, (dual ? EXTERNAL_EDITS[index] : "set_filament_external") as TextKey),
                ...(dual ? { side: t(hass, index === 0 ? "left" : "right") } : {}),
              }),
            )}
          </div>
        </section>`
      : nothing}`;
}
