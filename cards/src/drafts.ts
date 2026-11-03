// Targets, switches and options the card shows before their entities report
// them: a stepper's taps (sent once they stop), a switch or the light, the
// print speed. Each ends once its entity reports, or after a while.
import { numericState, stateOf } from "./format";
import type { Hass, HassEntityState } from "./types";

/** A target is sent this long after the last tap on its stepper. */
const TARGET_DELAY = 800;

/** How long a sent target shows at most while its entity still reports the
 * old one: BamBuddy reports back within a poll or two. */
export const TARGET_HOLD = 10_000;

/** A target the card shows before its entity does: being tapped, or sent
 * while the entity still reported `sentFrom`. A switch's or the light's:
 * the state tapped last, until the entity reports it; a select's (the print
 * speed): the option tapped, until the entity reports any. */
interface Draft {
  value: number;
  sentFrom?: string;
  wish?: string;
  /** The entity reported something else than `sentFrom` since. */
  moved?: boolean;
}

const isFan = (entityId: string): boolean => entityId.startsWith("fan.");

/** What the drafts need of the card. */
export interface DraftHost {
  hass: () => Hass | undefined;
  /** A command with this key is on its way. */
  pending: (key: string) => boolean;
  /** Sends a command; false where it did not go through. */
  run: (key: string, domain: string, service: string, data: Record<string, unknown>) => Promise<boolean>;
  /** Draws the card again. */
  update: () => void;
}

export class Drafts {
  private map: ReadonlyMap<string, Draft> = new Map();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly host: DraftHost) {}

  /** A target still being tapped is sent now, not lost: the card leaves the page. */
  flush(): void {
    for (const [entityId, draft] of this.map) if (draft.sentFrom === undefined) void this.sendTarget(entityId);
  }

  /** Before each drawing: the drafts their entities answered go. */
  follow(hass: Hass): void {
    // A sent target goes once its entity reports a new state; a toggle once
    // it reports what was tapped last -- after it moved: a second tap may
    // wish the state it still shows --, or leaves on and off.
    // A select's goes at any new report (the printer may keep another option), or once it is unavailable.
    for (const [entityId, draft] of this.map) {
      const state = hass.states[entityId]?.state;
      if (draft.wish) draft.moved ||= state !== draft.sentFrom;
      const done = entityId.startsWith("select.")
        ? state === undefined || state === "unavailable" || state === "unknown" || draft.moved === true
        : draft.wish
          ? (state !== "on" && state !== "off") || (state === draft.wish && draft.moved === true)
          : draft.sentFrom !== undefined && this.draftMark(entityId) !== draft.sentFrom;
      if (done) this.dropDraft(entityId);
    }
  }

  targetOf(entityId: string): number | undefined {
    return this.map.get(entityId)?.value ?? this.reported(entityId);
  }

  /** A heater's target, or a fan's percentage (0 while it is off). */
  private reported(entityId: string): number | undefined {
    const hass = this.host.hass() as Hass;
    if (!isFan(entityId)) return numericState(hass, entityId);
    const state = hass.states[entityId];
    if (!state || state.state === "unavailable" || state.state === "unknown") return undefined;
    const percentage = state.attributes["percentage"];
    return typeof percentage === "number" ? percentage : 0;
  }

  /** What tells that an entity reported anew: a fan's percentage (its state
   * stays "on" between speeds), else its state. */
  private draftMark(entityId: string): string {
    const state = (this.host.hass() as Hass).states[entityId];
    return isFan(entityId) ? String(state?.attributes["percentage"] ?? 0) : (state?.state ?? "");
  }

  private setDraft(entityId: string, draft: Draft): void {
    this.map = new Map([...this.map, [entityId, draft]]);
    this.host.update();
  }

  private dropDraft(entityId: string): void {
    clearTimeout(this.timers.get(entityId));
    this.timers.delete(entityId);
    const next = new Map(this.map);
    next.delete(entityId);
    this.map = next;
    this.host.update();
  }

  private later(entityId: string, delay: number, then: () => void): void {
    clearTimeout(this.timers.get(entityId));
    this.timers.set(entityId, setTimeout(then, delay));
  }

  /** A tap on a stepper: shown at once, sent when the taps stop. */
  stepTarget(entityId: string, value: number): void {
    this.setDraft(entityId, { value });
    this.later(entityId, TARGET_DELAY, () => void this.sendTarget(entityId));
  }

  private async sendTarget(entityId: string): Promise<void> {
    const draft = this.map.get(entityId) as Draft;
    const key = `target_${entityId}`;
    // The previous target of this heater is still on its way: this one follows.
    if (this.host.pending(key)) {
      this.later(entityId, TARGET_DELAY, () => void this.sendTarget(entityId));
      return;
    }
    this.setDraft(entityId, { value: draft.value, sentFrom: this.draftMark(entityId) });
    this.later(entityId, TARGET_HOLD, () => this.dropDraft(entityId));
    const sent = isFan(entityId)
      ? await this.host.run(key, "fan", "set_percentage", { entity_id: entityId, percentage: draft.value })
      : await this.host.run(key, "number", "set_value", { entity_id: entityId, value: draft.value });
    // A tap made while this target was on its way is kept and sent.
    if (!sent && this.map.get(entityId)?.sentFrom !== undefined) this.dropDraft(entityId);
  }

  /** A switch that has a state, as the card shows it. */
  switchOn(entityId: string): boolean {
    const draft = this.map.get(entityId);
    return draft ? draft.value === 1 : (stateOf(this.host.hass() as Hass, entityId) as HassEntityState).state === "on";
  }

  /** A tap on a switch -- or the chamber light: the new state shows until
   * the entity reports one, 10 s at most; a command that fails shows the
   * old one again. */
  async toggleSwitch(entityId: string, domain = "switch", key = `switch_${entityId}`): Promise<void> {
    // A tap while the last one is sent: nothing (it would flip the draft back).
    if (this.host.pending(key)) return;
    const on = !this.switchOn(entityId);
    const from = (stateOf(this.host.hass() as Hass, entityId) as HassEntityState).state;
    this.setDraft(entityId, { value: on ? 1 : 0, sentFrom: from, wish: on ? "on" : "off" });
    this.later(entityId, TARGET_HOLD, () => this.dropDraft(entityId));
    const sent = await this.host.run(key, domain, on ? "turn_on" : "turn_off", { entity_id: entityId });
    if (!sent) this.dropDraft(entityId);
  }

  /** A select's option as the card shows it: the one just tapped, else its own. */
  chosenOption(entityId: string): string | undefined {
    return this.map.get(entityId)?.wish ?? stateOf(this.host.hass() as Hass, entityId)?.state;
  }

  /** A tap on a select's option (the print speed): it shows at once, until
   * the entity reports, 10 s at most; a command that fails shows the old
   * one again. */
  async selectOption(entityId: string, option: string, key: string): Promise<void> {
    // A tap while the last one is sent: nothing (it would change the draft under it).
    if (this.host.pending(key)) return;
    const from = stateOf(this.host.hass() as Hass, entityId)?.state;
    this.setDraft(entityId, { value: 0, ...(from === undefined ? {} : { sentFrom: from }), wish: option });
    this.later(entityId, TARGET_HOLD, () => this.dropDraft(entityId));
    const sent = await this.host.run(key, "select", "select_option", { entity_id: entityId, option });
    if (!sent) this.dropDraft(entityId);
  }

  /** A power symbol's on or off: sent at once. */
  setTargets(targets: [string, number][]): void {
    for (const [entityId, value] of targets) {
      this.setDraft(entityId, { value });
      void this.sendTarget(entityId);
    }
  }
}
