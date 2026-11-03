// The filament view: every AMS unit with its slots, humidity, temperature
// and drying, and the external spools. A unit folds to its head, its
// colours and its drying: from three units on, or as the user chose; a tap
// folds or unfolds it. Loading and unloading ask first and wait while a
// print runs or the AMS changes filament; a paused print lets the filament
// be changed by hand. An offline printer's tab shows the offline view
// instead (card.ts).
import { html, nothing, type TemplateResult } from "lit";

import { formatDuration, formatPercent, formatTemperature, formatTemperatureOf, hasValue, minutesOf, numericState, stateOf } from "./format";
import { icon } from "./icons";
import { t, type TextKey } from "./i18n";
import { actionButton, AMS_2_PRO, AMS_HT, amsActivity, callout, developerHint, emptyText, inventoryLine, note, printerTitle, resumeButton, shownExternalSpools, sideName, slotOf, slotPlace, stateWord, swatch, switchButton, unitModel, unitNozzle, type CardContext, type Slot } from "./parts";
import type { AmsRefs } from "./types";

/** The texts of a printer's one external spool, and of its left and its
 * right one where it has two: the slot dialog's title, the load question,
 * the load button, the place, the pencil. */
interface SpoolTexts {
  title: TextKey;
  load: TextKey;
  loadName: TextKey;
  place: TextKey;
  edit: TextKey;
}
const ONE_SPOOL: SpoolTexts = {
  title: "filament_title_external",
  load: "load_title_external",
  loadName: "load_from_external",
  place: "external",
  edit: "edit_external",
};
const SIDE_SPOOLS: readonly [SpoolTexts & { nozzle: "left" }, SpoolTexts & { nozzle: "right" }] = [
  { title: "filament_title_left", load: "load_title_left", loadName: "load_from_left", place: "external_left_place", edit: "edit_external_left", nozzle: "left" },
  { title: "filament_title_right", load: "load_title_right", loadName: "load_from_right", place: "external_right_place", edit: "edit_external_right", nozzle: "right" },
];

/** A pencil beside every filled slot: a spool without a chip
 * gets its material, colour and K profile set by hand, a Bambu spool its
 * chip read again or the slot reset. The slot a running print feeds from is
 * set too (mid-print, as in BamBuddy) -- but a chip spool's. An empty slot,
 * and a chip spool the print feeds, get one for their inventory spool:
 * shown, or to assign. */
function editButton(ctx: CardContext, slot: Slot, title: string, label: string): TemplateResult | typeof nothing {
  const inventoryOnly = !slot.present || (ctx.running && slot.active && slot.rfid);
  // There, a chip spool (BamBuddy links it itself), or no inventory spool to show nor to assign: no pencil.
  const nothingToOffer = slot.rfid || (!slot.inventory && !slot.assignable);
  if (!ctx.canControl || !ctx.online || (inventoryOnly && nothingToOffer)) return nothing;
  return actionButton({
    label,
    iconName: "pencil",
    iconOnly: true,
    kind: "plain",
    className: "edit",
    disabled: ctx.changing,
    pending: ctx.isPending(`filament_${slot.entityId}`),
    onClick: () => ctx.openFilament(slot, title, inventoryOnly),
  });
}

function slotRow(
  ctx: CardContext,
  slot: Slot,
  options: {
    canAct: boolean;
    canLoad: boolean;
    /** The title of the slot's dialog. */
    dialogTitle: string;
    side?: string;
    editLabel?: string;
    nozzle?: "left" | "right";
    /** The load question, with the slot's place where it has one. */
    loadTitle: (filament: string) => string;
    /** The load button's name: what it loads from. */
    loadName: string;
    /** Where the slot is, for the names of its buttons: "Slot 1 · AMS A". */
    place: string;
  },
): TemplateResult {
  const { hass, refs } = ctx;
  const title = slot.unknown ? "—" : slot.empty ? emptyText(hass, slot) : slot.name || slot.type;
  // The material where the name does not say it: "Support for PLA" names
  // PLA-S, "Generic PETG" says PETG.
  const named = slot.name.toLowerCase().includes(slot.type.toLowerCase());
  // On the line below the name, so that a phone has room for the name.
  const inUse = slot.active ? html`<span class="in-use">${t(hass, "in_use")}</span>` : undefined;
  const spool = slot.inventory;
  // With an inventory spool: its name, then what is left of it (its name
  // says the material); an empty slot waits for it.
  const details = spool
    ? slot.empty
      ? []
      : [options.side ?? "", inventoryLine(hass, spool)].filter(Boolean)
    : [
        options.side ?? "",
        slot.empty || !slot.name || named ? "" : slot.type,
        slot.empty || slot.remaining === undefined ? "" : formatPercent(hass, slot.remaining),
      ].filter(Boolean);
  const waiting = spool && slot.empty ? t(hass, "inv_waiting") : undefined;
  // An inventory spool's line keeps each dot with what stands before it.
  const joint = spool ? "\u00a0· " : " · ";
  // In a paused print the change happens in the middle of it.
  const pauseHint = ctx.status === "paused" ? { note: t(hass, "paused_change") } : {};
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
          text: t(hass, options.nozzle ? (options.nozzle === "left" ? "unload_text_left" : "unload_text_right") : "unload_text"),
          confirm: t(hass, "unload"),
          ...pauseHint,
          action: ["bambuddy", "unload_filament", { device_id: refs.deviceId }],
          key: "unload",
        }),
    });
  } else if (ctx.canControl && !slot.empty && !slot.unknown && options.canLoad) {
    action = actionButton({
      label: t(hass, "load"),
      aria: options.loadName,
      iconName: "load",
      disabled: !options.canAct,
      pending: ctx.isPending(`load_${slot.entityId}`),
      onClick: () =>
        ctx.confirm({
          title: options.loadTitle(title),
          // Two nozzles: which one it goes into.
          text: t(hass, options.nozzle ? (options.nozzle === "left" ? "load_text_left" : "load_text_right") : "load_text"),
          confirm: t(hass, "load"),
          ...pauseHint,
          action: ["bambuddy", "load_filament", { entity_id: slot.entityId }],
          key: `load_${slot.entityId}`,
        }),
    });
  }
  // What the button shows names it: the filament, in use, what is left.
  // Unknown, it shows a dash, which says nothing.
  return html`<div class="slot ${slot.active ? "active" : ""}">
    <button
      class="slot-main"
      aria-label=${t(hass, "slot_named", {
        shown: [
          slot.unknown ? t(hass, "unknown") : title,
          ...(spool ? [spool.name] : []),
          ...(waiting ? [waiting] : []),
          ...(slot.active ? [t(hass, "in_use")] : []),
          ...details,
        ].join(" · "),
        place: options.place,
      })}
      @click=${() => ctx.moreInfo(slot.entityId)}
    >
      ${swatch(slot, "large")}
      <span class="slot-text">
        <span class="slot-name">${title}</span>
        ${spool ? html`<span class="slot-sub">${spool.name}</span>` : nothing}
        ${waiting ? html`<span class="slot-sub">${waiting}</span>` : nothing}
        ${details.length || inUse
          ? html`<span class="slot-sub">${inUse}${inUse && details.length ? joint : ""}${details.join(joint)}</span>`
          : nothing}
      </span>
    </button>
    ${editButton(ctx, slot, options.dialogTitle, options.editLabel ?? t(hass, "set_filament"))} ${action}
  </div>`;
}

const DRYING_MODELS = [AMS_2_PRO, AMS_HT];

function dryingRow(ctx: CardContext, unit: AmsRefs): TemplateResult | typeof nothing {
  const { hass } = ctx;
  // Only the AMS 2 Pro and the AMS HT have a heater.
  if (!unit.drying || !DRYING_MODELS.includes(unit.model)) return nothing;
  const drying = stateOf(hass, unit.drying);
  const on = drying?.state === "on";
  const left = minutesOf(hass, unit.dryingRemaining);
  // The time stays on one line: "3 h 20 min" never breaks inside.
  const time = left ? formatDuration(hass, left).replace(/ /g, "\u00a0") : undefined;
  // The temperature it dries at, where the integration knows it.
  const target = drying?.attributes["target_temperature"];
  const at = on && typeof target === "number" && target > 0 ? formatTemperature(hass, target) : undefined;
  // Without a state -- the printer offline, say -- whether it dries is not known.
  const text = !hasValue(hass, unit.drying)
    ? "—"
    : on
      ? at
        ? time
          ? t(hass, "drying_at", { temperature: at, time })
          : t(hass, "drying_now_at", { temperature: at })
        : time
          ? t(hass, "drying", { time })
          : t(hass, "drying_now")
      : t(hass, "not_drying");
  const key = `dry_${unit.deviceId}`;
  // Where the printer dries only from its own screen (a P1S), or its
  // firmware does not let BamBuddy start it: no buttons, a word where.
  const remote = drying?.attributes["remote_start"] !== false;
  // Stopping asks first, as starting does: the time left is lost.
  const stop = (): void =>
    ctx.confirm({
      title: t(hass, "dry_stop_title"),
      text: time ? t(hass, "dry_stop_text", { unit: unit.name, time }) : t(hass, "dry_stop_now", { unit: unit.name }),
      confirm: t(hass, "dry_stop"),
      keep: t(hass, "dry_keep"),
      action: ["bambuddy", "stop_drying", { device_id: unit.deviceId }],
      key,
    });
  return html`<div class="drying ${on ? "on" : ""}">
    ${icon("heat")}<span class="drying-text">${text}</span>
    ${ctx.canControl && !remote ? html`<span class="dry-where">${t(hass, "dry_at_printer")}</span>` : nothing}
    ${ctx.canControl && remote
      ? actionButton({
          kind: "plain",
          // A start waits for a filament change (the integration refuses it); a stop does not.
          disabled: !ctx.online || (!on && ctx.changing),
          pending: ctx.isPending(key),
          ...(on
            ? { label: t(hass, "dry_stop"), aria: t(hass, "dry_stop_named", { unit: unit.name }), iconName: "stop", onClick: stop }
            : { label: t(hass, "dry"), aria: t(hass, "dry_named", { unit: unit.name }), iconName: "heat", onClick: () => ctx.dry(unit) }),
        })
      : nothing}
  </div>`;
}

/** A unit: its head -- a button that folds and unfolds it --, folded its
 * colours below the head, the drying row, unfolded its slots. */
function unitSection(ctx: CardContext, unit: AmsRefs, canAct: boolean): TemplateResult {
  const { hass } = ctx;
  const humidity = numericState(hass, unit.humidity);
  const temperature = numericState(hass, unit.temperature);
  const ht = unit.model === AMS_HT;
  const model = unitModel(ctx.ams, unit);
  const nozzle = unitNozzle(hass, unit);
  const open = ctx.amsUnfolded(unit);
  const slotsId = `slots-${unit.deviceId}`;
  return html`<section class="unit ${open ? "open" : "folded"}">
    <button
      class="unit-head"
      aria-expanded=${open ? "true" : "false"}
      aria-controls=${open ? slotsId : nothing}
      @click=${() => ctx.toggleAms(unit, !open)}
    >
      <span class="unit-title">
        <span class="unit-name">${unit.name}</span>
        ${model ? html`<span class="unit-model">${model}</span>` : nothing}
        ${nozzle
          ? html`<span class="unit-nozzle" title=${t(hass, nozzle === "left" ? "nozzle_left" : "nozzle_right")}
              >${icon("nozzle")}<span aria-hidden="true">${t(hass, nozzle === "left" ? "side_left_short" : "side_right_short")}</span
              ><span class="sr-only">${t(hass, nozzle === "left" ? "nozzle_left" : "nozzle_right")}</span></span
            >`
          : nothing}
        <span class="unit-end">
        <span class="unit-env">
          ${humidity !== undefined
            ? html`<span title=${t(hass, "humidity")}
                ><span class="sr-only">${t(hass, "strip_humidity", { humidity: formatPercent(hass, humidity) })}</span
                ><span aria-hidden="true">${icon("humidity")}${formatPercent(hass, humidity)}</span></span
              >`
            : nothing}
          ${temperature !== undefined
            ? html`<span title=${t(hass, "temperature")}
                ><span class="sr-only">${t(hass, "strip_temperature", { temperature: formatTemperatureOf(hass, unit.temperature, temperature) })}</span
                ><span aria-hidden="true">${icon("chamber")}${formatTemperatureOf(hass, unit.temperature, temperature)}</span></span
              >`
            : nothing}
        </span>
        <span class="unit-fold">${icon("chevronDown")}</span>
        </span>
      </span>
      ${open ? nothing : html`<span class="unit-colors">${unit.slots.map((entityId) => swatch(slotOf(hass, entityId)))}</span>`}
    </button>
    ${dryingRow(ctx, unit)}
    ${open
      ? html`<div class="slots" id=${slotsId} role="region" aria-label=${unit.name}>
            ${unit.slots.map((entityId, index) => {
              const place = slotPlace(hass, unit, entityId, index);
              return slotRow(ctx, slotOf(hass, entityId), {
                canAct,
                canLoad: !ht,
                dialogTitle: t(hass, "filament_title", { slot: place }),
                loadTitle: (filament) => t(hass, "load_title_from", { filament, place }),
                loadName: t(hass, "load_from", { place }),
                place,
                editLabel: t(hass, "edit_slot", { slot: place }),
                ...(nozzle ? { nozzle } : {}),
              });
            })}
          </div>
          ${ht && ctx.canControl ? html`<p class="hint">${t(hass, "ht_load")}</p>` : nothing}`
      : nothing}
  </section>`;
}

/** The pauses for the filament: by the user, at a run-out, by the
 * G-code. Any other "paused_*" stage is one the printer took itself for a
 * fault (a clog, a fan, a temperature): its message comes first. A stage
 * outside "paused_*" (`m400_pause`) is no fault either. */
const FILAMENT_PAUSES = new Set(["paused_by_user", "paused_filament_runout", "paused_by_gcode"]);

/** A paused print: the filament can be changed now, and resumed from here.
 * Not during a change: the view says to wait. */
function pausedNote(ctx: CardContext): TemplateResult | typeof nothing {
  if (!ctx.online || ctx.status !== "paused" || !ctx.canControl || ctx.changing) return nothing;
  const stage = stateOf(ctx.hass, ctx.refs.stage)?.state;
  const fault = !!stage?.startsWith("paused_") && !FILAMENT_PAUSES.has(stage);
  return callout(t(ctx.hass, fault ? "filament_paused_fault" : "filament_paused"), ctx.refs.resume ? resumeButton(ctx) : nothing);
}

/** The AMS filament backup, after the AMS units -- the external spool
 * takes no part, so it goes with the last unit unplugged. A switch; while
 * BamBuddy cannot read it (the A1 and P1 series before BamBuddy 1.3.0), Off
 * and On with neither chosen, each still switching; with Hide controls, the
 * state in words. */
function backupRow(ctx: CardContext): TemplateResult | typeof nothing {
  const { hass, refs } = ctx;
  const entityId = refs.filamentBackup;
  const state = stateOf(hass, entityId);
  if (!entityId || !state || !ctx.ams.length) return nothing;
  const label = t(hass, "backup");
  const known = state.state === "on" || state.state === "off";
  const lines = html`<span class="det-text">
    <span class="det-name">${label}</span>
    <span class="det-sub" id="backup-sub">${t(hass, "backup_sub")}</span>
    ${refs.dual ? html`<span class="det-sub">${t(hass, "backup_dual")}</span>` : nothing}
    ${known ? nothing : html`<span class="det-sub" id="backup-unknown">${t(hass, "backup_unknown")}</span>`}
  </span>`;
  const pending = ctx.isPending(`switch_${entityId}`);
  const disabled = !ctx.online || state.state === "unavailable";
  let control: TemplateResult;
  if (!ctx.canControl) {
    control = html`<span class="det-state">${stateWord(hass, state.state)}</span>`;
  } else if (known) {
    const on = ctx.switchOn(entityId);
    control = switchButton({ label, on, pending, onClick: () => ctx.toggleSwitch(entityId), describedBy: "backup-sub", disabled });
  } else {
    // Unknown, as it is; the two actions below set it -- then BamBuddy knows it.
    control = html`<span class="det-state">${t(hass, "unknown")}</span>
      <div class="backup-set" role="group" aria-label=${label} aria-describedby="backup-sub backup-unknown">
        ${(["off", "on"] as const).map(
          (option) => html`<button
            class="btn tonal ${pending ? "pending" : ""}"
            ?disabled=${disabled}
            aria-busy=${pending ? "true" : "false"}
            aria-disabled=${pending ? "true" : nothing}
            @click=${pending ? nothing : () => ctx.run(`switch_${entityId}`, "switch", option === "on" ? "turn_on" : "turn_off", { entity_id: entityId })}
          >
            ${t(hass, option === "on" ? "backup_turn_on" : "backup_turn_off")}
          </button>`,
        )}
      </div>`;
  }
  const choosing = ctx.canControl && !known;
  return html`<section class="backup"><div class="det-row ${choosing ? "choosing" : ""}">${lines}${control}</div></section>`;
}

/** The filament view; the card offers it only where the printer reports an
 * AMS unit or an external spool. */
export function filamentView(ctx: CardContext): TemplateResult {
  const { hass, refs } = ctx;
  // A change under way is a wait, not a problem; in a paused print the
  // resume comes after it.
  const reason: [TextKey, "info" | "warning"] | undefined = !ctx.canControl || !ctx.online
    ? undefined
    : ctx.running
        ? ["filament_pause", "warning"]
        : ctx.changing
          ? [ctx.status === "paused" ? "changing_paused" : "changing_reason", "info"]
          : undefined;
  const canAct = ctx.canControl && ctx.online && !ctx.running && !ctx.changing;
  const twoSpools = refs.externalSpools.length === 2;
  // The sides from all spools, what shows from those shown.
  const spools = shownExternalSpools(ctx);
  const activity = amsActivity(ctx);
  return html`${developerHint(ctx)}${reason ? note(t(hass, reason[0]), reason[1]) : nothing}${pausedNote(ctx)}
    ${activity
      ? html`<div class="activity" role="status">
          ${icon("sync")}<span class="sr-only">${printerTitle(ctx)}: </span><span>${activity}</span><span class="activity-bar" aria-hidden="true"></span>
        </div>`
      : nothing}
    ${ctx.ams.map((unit) => unitSection(ctx, unit, canAct))}
    ${backupRow(ctx)}
    ${spools.length
      ? html`<section class="unit">
          <div class="unit-head"><span class="unit-name">${t(hass, spools.length > 1 ? "externals" : "external")}</span></div>
          <div class="slots">
            ${spools.map((entityId) => {
              const index = refs.externalSpools.indexOf(entityId);
              const side = twoSpools ? SIDE_SPOOLS[index === 0 ? 0 : 1] : undefined;
              const texts = side ?? ONE_SPOOL;
              return slotRow(ctx, slotOf(hass, entityId), {
                canAct,
                canLoad: true,
                dialogTitle: t(hass, texts.title),
                loadTitle: (filament) => t(hass, texts.load, { filament }),
                loadName: t(hass, texts.loadName),
                place: t(hass, texts.place),
                editLabel: t(hass, texts.edit),
                ...(side ? { nozzle: side.nozzle } : {}),
                ...(side ? { side: sideName(hass, index) } : {}),
              });
            })}
          </div>
        </section>`
      : nothing}`;
}
