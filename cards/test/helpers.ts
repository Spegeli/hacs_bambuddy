// What the card's tests do with a mounted card: find its parts, read its
// text, press its buttons and hand it a new hass.
import { cardStyles } from "../src/styles";
import type { FakeCard, FakeHass } from "./fixtures";

/** The card's style sheet as one text. */
export const styleText = (): string => (Array.isArray(cardStyles) ? cardStyles : [cardStyles]).map((sheet) => (sheet as { cssText: string }).cssText).join("");

export const NBSP = " ";

/** The rules inside every at-rule of the style sheet with this head --
 * "@container (max-width: 280px)" --, one after the other; "" where none. */
export function atRule(head: string): string {
  const sheet = styleText();
  const blocks: string[] = [];
  for (let start = sheet.indexOf(`${head} {`); start >= 0; start = sheet.indexOf(`${head} {`, start + 1)) {
    const open = sheet.indexOf("{", start);
    let depth = 0;
    for (let index = open; index < sheet.length; index += 1) {
      if (sheet[index] === "{") depth += 1;
      else if (sheet[index] === "}" && --depth === 0) {
        blocks.push(sheet.slice(open + 1, index));
        break;
      }
    }
  }
  return blocks.join("\n");
}

export const root = (card: FakeCard): ShadowRoot => card.shadowRoot as ShadowRoot;
export const find = <T extends Element = HTMLElement>(card: FakeCard, selector: string): T | null => root(card).querySelector<T>(selector);
export const findAll = <T extends Element = HTMLElement>(card: FakeCard, selector: string): T[] => [...root(card).querySelectorAll<T>(selector)];
// Collapses the template's white space, but keeps the no-break spaces
// before units that the card writes on purpose.
export const text = (element: Element | ShadowRoot | null | undefined): string => (element?.textContent ?? "").replace(/[ \t\r\n]+/g, " ").trim();
export const cardText = (card: FakeCard): string => text(root(card));

/** An element's text as it shows: without what only a screen reader hears. */
export const shownText = (element: Element | null | undefined): string => {
  if (!element) return "";
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll(".sr-only").forEach((hidden) => hidden.remove());
  return text(copy);
};

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

/** Opens a view by its tab; a card without the tab fails the test. */
export async function showView(card: FakeCard, tab: string): Promise<void> {
  const found = findAll(card, "[role=tab]").find((item) => text(item) === tab);
  if (!found) throw new Error(`no tab "${tab}" in: ${cardText(card)}`);
  found.click();
  await card.updateComplete;
}

export async function press(card: FakeCard, name: string): Promise<void> {
  button(card, name).click();
  await settle(card);
}

export async function update(card: FakeCard, hass: FakeHass): Promise<void> {
  card.hass = hass;
  await card.updateComplete;
}
