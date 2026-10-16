// What the card's tests do with a mounted card: find its parts, read its
// text, press its buttons and hand it a new hass.
import type { FakeCard, FakeHass } from "./fixtures";

export const NBSP = " ";

export const root = (card: FakeCard): ShadowRoot => card.shadowRoot as ShadowRoot;
export const find = <T extends Element = HTMLElement>(card: FakeCard, selector: string): T | null => root(card).querySelector<T>(selector);
export const findAll = <T extends Element = HTMLElement>(card: FakeCard, selector: string): T[] => [...root(card).querySelectorAll<T>(selector)];
// Collapses the template's white space, but keeps the no-break spaces
// before units that the card writes on purpose.
export const text = (element: Element | ShadowRoot | null | undefined): string => (element?.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
export const cardText = (card: FakeCard): string => text(root(card));

/** The button with this accessible name or text. */
export function button(card: FakeCard, name: string): HTMLButtonElement {
  const found = findAll<HTMLButtonElement>(card, "button").find((item) => item.getAttribute("aria-label") === name || text(item) === name);
  if (!found) throw new Error(`no button "${name}" in: ${cardText(card)}`);
  return found;
}

export const hasButton = (card: FakeCard, name: string): boolean =>
  findAll<HTMLButtonElement>(card, "button").some((item) => item.getAttribute("aria-label") === name || text(item) === name);

/** Lets an action's promise and the update after it finish. */
export async function settle(card: FakeCard): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await card.updateComplete;
  }
}

export async function press(card: FakeCard, name: string): Promise<void> {
  button(card, name).click();
  await settle(card);
}

export async function update(card: FakeCard, hass: FakeHass): Promise<void> {
  card.hass = hass;
  await card.updateComplete;
}
