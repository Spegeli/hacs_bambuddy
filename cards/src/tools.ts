/**
 * The H3C's nine PrintTools: each a sensor of the integration (its print
 * time, its nozzle and what feeds it as attributes), the one on the
 * toolhead a sensor of its own. The Status block shows them as tiles, a
 * tile opens a dialog of the tool; the Filament tab's AMS 3H slots unload
 * their own tool.
 */
import { html, nothing, type TemplateResult } from "lit";

import { formatNumber, minutesOf, needsOutline, stateOf } from "./format";
import { t } from "./i18n";
import { AMS_3H, inputNumber, slotOf, type CardContext } from "./parts";
import type { AmsRefs, Hass } from "./types";

export interface ToolInfo {
  number: number;
  entityId: string;
  /** The rack reports the place: its nozzle is known. */
  known: boolean;
  diameter?: number;
  flow?: string;
  material?: string;
  /** 1.75 or 2.85. */
  filament?: number;
  hasFilament: boolean;
  onToolhead: boolean;
  /** The print time in hours; undefined while unknown. */
  hours?: number;
  /** The rack's filament colour, "RRGGBBAA". */
  color?: string;
  fedBy?: "ams" | "external";
}

export const TOOL_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Whether the printer has the tool rack (the H3C): any tool sensor. */
export const hasTools = (ctx: CardContext): boolean => ctx.refs.tools.some((entityId) => entityId !== undefined);

export function toolInfo(ctx: CardContext, number: number): ToolInfo | undefined {
  const entityId = ctx.refs.tools[number - 1];
  if (!entityId) return undefined;
  const attributes = stateOf(ctx.hass, entityId)?.attributes ?? {};
  const text = (name: string): string | undefined => (typeof attributes[name] === "string" ? (attributes[name] as string) : undefined);
  const figure = (name: string): number | undefined => (typeof attributes[name] === "number" ? (attributes[name] as number) : undefined);
  const minutes = minutesOf(ctx.hass, entityId);
  const fedBy = text("fed_by");
  return {
    number,
    entityId,
    known: text("nozzle_code") !== undefined,
    ...(figure("nozzle_diameter") === undefined ? {} : { diameter: figure("nozzle_diameter") as number }),
    ...(text("nozzle_flow") ? { flow: text("nozzle_flow") as string } : {}),
    ...(text("nozzle_material") ? { material: text("nozzle_material") as string } : {}),
    ...(figure("filament_diameter") === undefined ? {} : { filament: figure("filament_diameter") as number }),
    hasFilament: attributes["has_filament"] === true,
    onToolhead: attributes["on_toolhead"] === true,
    ...(minutes === undefined ? {} : { hours: minutes / 60 }),
    ...(text("filament_color") ? { color: text("filament_color") as string } : {}),
    ...(fedBy === "ams" || fedBy === "external" ? { fedBy } : {}),
  };
}

/** A tool for 2.85 mm TPU: loaded at the printer through the bypass feed. */
export const isTpu285 = (tool: ToolInfo | undefined): boolean => tool?.flow === "tpu_285";

/** "0,4 mm · High Flow · Gehärteter Stahl": what the nozzle is. */
export function nozzleWords(hass: Hass, tool: ToolInfo): string {
  const flow = tool.flow === "high_flow" ? t(hass, "tool_high_flow") : tool.flow === "tpu_high_flow" ? t(hass, "tool_tpu_high_flow") : undefined;
  return [
    tool.diameter === undefined ? undefined : `${formatNumber(hass, tool.diameter, 2)} mm`,
    flow,
    tool.material ? t(hass, `tool_${tool.material}` as "tool_hardened_steel") : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "1,75 mm", the filament the tool takes. */
export const filamentSize = (hass: Hass, tool: ToolInfo): string | undefined =>
  tool.filament === undefined ? undefined : `${formatNumber(hass, tool.filament, 2)} mm`;

/** "0,4 mm · Gehärteter Stahl · 1,75 mm": the nozzle and the filament size. */
export const toolLine = (hass: Hass, tool: ToolInfo): string => [nozzleWords(hass, tool), filamentSize(hass, tool)].filter(Boolean).join(" · ");

/** "3,8 h": hours with one decimal, a whole number without it. */
export const toolHours = (hass: Hass, hours: number): string => `${formatNumber(hass, hours, 1)} h`;

/** A tool's external input; by its number: a disabled input leaves no gap in the list. */
const inputOf = (ctx: CardContext, number: number): string | undefined =>
  ctx.refs.inputs ? ctx.refs.externalSpools.find((entityId) => inputNumber(ctx.hass, entityId) === number) : undefined;

/** The place that feeds a tool: its AMS 3H slot while the AMS is reported, else its input. */
function feedOf(ctx: CardContext, tool: ToolInfo): string | undefined {
  const unit = ctx.ams.find((ams) => ams.model === AMS_3H);
  if (tool.fedBy !== "external" && unit) return spoolPlace(ctx, unit, tool.number - 1);
  return inputOf(ctx, tool.number);
}

/** Where the spool of an AMS 3H slot's tool is reported: the slot -- but
 * the 2.85 mm TPU tool's spool goes through the slot's bypass feed, and the
 * printer reports it on the tool's external input. */
export function spoolPlace(ctx: CardContext, unit: AmsRefs, index: number): string {
  const slot = unit.slots[index] as string;
  if (unit.model !== AMS_3H || !isTpu285(toolInfo(ctx, index + 1))) return slot;
  return inputOf(ctx, index + 1) ?? slot;
}

/** A tile's colour: the filament of the place that feeds it; where that
 * reads empty while the tool holds filament (TPU through the bypass feed),
 * the rack's; none while the tool holds none. */
function tileColor(ctx: CardContext, tool: ToolInfo): string | undefined {
  const feed = feedOf(ctx, tool);
  const slot = feed ? slotOf(ctx.hass, feed) : undefined;
  if (slot && !slot.empty && slot.color) return slot.color;
  return tool.hasFilament && tool.color ? `#${tool.color.slice(0, 6)}` : undefined;
}

/** "Druckwerkzeug 3 · 0,4 mm · Gehärteter Stahl · 1,75 mm · 1,2 h gedruckt · am Druckkopf". */
function tileText(hass: Hass, tool: ToolInfo): string {
  return [
    t(hass, "tool_name", { n: tool.number }),
    toolLine(hass, tool),
    tool.hours === undefined ? undefined : t(hass, "tool_printed", { hours: toolHours(hass, tool.hours) }),
    tool.onToolhead ? t(hass, "tool_on_head_short") : undefined,
    tool.hasFilament ? undefined : t(hass, "tool_no_filament"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The Status block: the nine tools in a row, the one on the toolhead outlined. */
export function toolsBlock(ctx: CardContext): TemplateResult | typeof nothing {
  if (!hasTools(ctx)) return nothing;
  const { hass } = ctx;
  const tiles = TOOL_NUMBERS.map((number) => {
    const tool = toolInfo(ctx, number);
    if (!tool?.known) {
      const said = t(hass, "tool_missing", { n: number });
      return html`<span class="tool-tile missing" title=${said}
        ><span class="sr-only">${said}</span><span class="tool-dot none" aria-hidden="true">–</span><span class="tool-number" aria-hidden="true">${number}</span></span
      >`;
    }
    const color = tileColor(ctx, tool);
    const said = tileText(hass, tool);
    return html`<button
      class="tool-tile ${tool.onToolhead ? "on-head" : ""}"
      title=${said}
      aria-label=${said}
      aria-haspopup="dialog"
      data-tool=${number}
      @click=${() => ctx.openTool(number)}
    >
      <span
        class="tool-dot ${color ? "" : "empty"} ${color && needsOutline(color) ? "outlined" : ""}"
        style=${color ? `background:${color}` : ""}
        aria-hidden="true"
      ></span
      ><span class="tool-number" aria-hidden="true">${number}</span>
    </button>`;
  });
  return html`<section class="tools" aria-labelledby="tools-title">
    <div class="tools-head"><span class="section-label" id="tools-title">${t(hass, "block_tools")}</span></div>
    <div class="tool-tiles">${tiles}</div>
  </section>`;
}

/** The tool's dialog: what it is, never a setting. */
export function toolContent(ctx: CardContext, number: number): TemplateResult {
  const { hass } = ctx;
  const tool = toolInfo(ctx, number);
  const row = (label: string, value: string | undefined): TemplateResult | typeof nothing =>
    value ? html`<div class="spec-row"><span class="spec-label">${label}</span><span class="spec-value">${value}</span></div>` : nothing;
  const size = tool ? filamentSize(hass, tool) : undefined;
  const fed = tool?.fedBy === "external" || !ctx.ams.some((unit) => unit.model === AMS_3H) ? t(hass, "input_place", { number }) : t(hass, "tool_fed_ams", { n: number });
  return html`<h2 id="dlg-title">${t(hass, "tool_name", { n: number })}</h2>
    <div class="spec">
      ${tool ? row(t(hass, "info_nozzle"), nozzleWords(hass, tool) || undefined) : nothing}
      ${row(t(hass, "tool_filament_size"), size ? (isTpu285(tool) ? t(hass, "tool_size_tpu", { size }) : size) : undefined)}
      ${row(t(hass, "tool_fed_by"), fed)}
      ${row(t(hass, "tool_print_time"), tool?.hours === undefined ? undefined : toolHours(hass, tool.hours))}
      ${tool ? row(t(hass, "tool_on_head"), t(hass, tool.onToolhead ? "yes" : "no")) : nothing}
    </div>`;
}

/** The tool an AMS 3H slot or an input feeds; undefined for any other slot or printer. */
export function slotTool(ctx: CardContext, entityId: string): ToolInfo | undefined {
  if (!hasTools(ctx)) return undefined;
  const unit = ctx.ams.find((ams) => ams.model === AMS_3H && ams.slots.includes(entityId));
  if (unit) return toolInfo(ctx, unit.slots.indexOf(entityId) + 1);
  const number = ctx.refs.inputs && ctx.refs.externalSpools.includes(entityId) ? inputNumber(ctx.hass, entityId) : undefined;
  return number === undefined ? undefined : toolInfo(ctx, number);
}

/** The printer information's nozzle row on the H3C: one line where all
 * nine are alike, else a line per place the rack reports. */
export function toolLines(ctx: CardContext): string[] {
  const known = TOOL_NUMBERS.map((number) => toolInfo(ctx, number)).filter((tool): tool is ToolInfo => tool?.known === true);
  const lines = known.map((tool) => toolLine(ctx.hass, tool));
  if (known.length === TOOL_NUMBERS.length && new Set(lines).size === 1) return [t(ctx.hass, "tool_count", { count: known.length, line: lines[0] as string })];
  return known.map((tool, index) => `${tool.number}: ${lines[index]}`);
}

