// The helpers features, maintenance-check and ams-strip tests share: a mounted card, its chips, its menu.
import type { FakeCard } from "./fixtures";
import { find, findAll, text } from "./helpers";

export const chips = (card: FakeCard): string[] => findAll(card, ".pills .pill").map(text);

export const chip = (card: FakeCard, name: string): HTMLButtonElement => {
  const found = findAll<HTMLButtonElement>(card, ".pills .pill").find((item) => text(item) === name);
  if (!found) throw new Error(`no chip "${name}" in: ${chips(card).join(" | ")}`);
  return found;
};

export async function openMenu(card: FakeCard): Promise<string[]> {
  (find(card, ".menu-btn") as HTMLButtonElement).click();
  await card.updateComplete;
  return findAll(card, ".menu [role=menuitem]").map(text);
}

export async function menuItem(card: FakeCard, name: string): Promise<HTMLButtonElement> {
  await openMenu(card);
  const found = findAll<HTMLButtonElement>(card, ".menu [role=menuitem]").find((item) => text(item) === name);
  if (!found) throw new Error(`no menu item "${name}"`);
  return found;
}
