// The helpers the header and menu tests share: a chip, its icon, the minus sign, a dialog's rows.
import type { FakeCard } from "./fixtures";
import { find, findAll, text } from "./helpers";

/** The status chips under the title, by their kind. */
export const pill = (card: FakeCard, kind: "network" | "hms" | "firmware"): HTMLElement | null => find(card, `.pills .pill.${kind}`);

export const iconOf = (element: Element | null): string | null | undefined => element?.querySelector(".icon path")?.getAttribute("d");

export const MINUS = "−";

/** The open dialog's rows: label and value. */
export const rows = (card: FakeCard): [string, string][] => findAll(card, "dialog .spec-row").map((row) => [text(row.querySelector(".spec-label")), text(row.querySelector(".spec-value"))]);
