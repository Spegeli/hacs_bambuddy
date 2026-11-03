// The card's ⋮ menu, and the keyboard's place: a control a press took away
// hands the focus on to the nearest one.
import { html, nothing, type TemplateResult } from "lit";

import type { Dialog } from "./dialogs";
import { stateOf } from "./format";
import { icon, type IconName } from "./icons";
import { t, type TextKey } from "./i18n";
import { maintenanceOf } from "./maintenance";
import { nextIndex, type CardContext } from "./parts";

/** How long after a key in the card its place is kept for the keyboard, in ms. */
const KEYBOARD_PLACE_FOR = 15_000;
/** The open menu's least room to the screen's edges, in px. */
const MENU_MARGIN = 8;

/** The groups a press may disable its own button in, nearest first: the
 * keyboard goes to the next button of the nearest one. */
const FOCUS_GROUPS = [".stepper", ".heat-set", ".heat-row", ".heating"];

/** What the menu needs of the card. */
export interface MenuHost {
  /** The card itself: on the page or not, the page's focus on it or not. */
  element: HTMLElement;
  /** The card's shadow root: Lit renders into one. */
  root: () => ShadowRoot;
  menuOpen: () => boolean;
  setMenuOpen: (open: boolean) => void;
  focusAfterUpdate: (...selectors: string[]) => void;
  /** The dialog about to open comes from the menu: closing it focuses the three dots. */
  markFromMenu: () => void;
  setDialog: (dialog: Dialog) => void;
  /** A command with this key is on its way. */
  pending: (key: string) => boolean;
  run: (key: string, domain: string, service: string, data: Record<string, unknown>) => Promise<boolean>;
  startCheck: () => Promise<void>;
}

export class CardMenu {
  /** The control the keyboard was on last, and when a key was last pressed
   * in the card: a keyboard user's place, kept when a press takes the
   * control away. */
  private focusedLast?: HTMLElement;
  private keyedAt = 0;

  constructor(private readonly host: MenuHost) {}

  /** Notes the keyboard's place: the card's first drawing calls it once. */
  listen(root: ShadowRoot): void {
    root.addEventListener("focusin", (event) => {
      const target = event.composedPath()[0];
      this.focusedLast = target instanceof HTMLElement ? target : undefined;
    });
    root.addEventListener("keydown", () => {
      this.keyedAt = Date.now();
    });
  }

  /** A tap anywhere but in the menu closes it. */
  readonly onPointerDown = (event: Event): void => {
    if (!this.host.menuOpen()) return;
    const menu = this.host.root().querySelector(".menu-wrap");
    if (menu && !event.composedPath().includes(menu)) this.host.setMenuOpen(false);
  };

  /** A press took the keyboard's control away -- a stepper's end, a
   * heater's off, the plate cleared, a load that starts a
   * filament change, an HMS answer that closes its dialog: the nearest
   * group's next button takes the focus, else the selected tab, else the
   * menu button. Only right after a key in the card, and only while the
   * focus is still on that control or fell to the page: a mouse's place,
   * or one elsewhere on the page, is not the card's to take. */
  keepKeyboardPlace(): void {
    const card = this.host.element;
    const root = this.host.root();
    // A card taken off the page has no keyboard place to keep.
    if (!card.isConnected) return;
    const last = this.focusedLast;
    if (!last || Date.now() - this.keyedAt > KEYBOARD_PLACE_FOR) return;
    const inside = root.activeElement;
    if (inside && inside !== last) return;
    // Nothing focused in the card: only where the focus fell to the page.
    const page = document.activeElement;
    if (!inside && page !== null && page !== document.body && page !== card) return;
    if (last.isConnected && !(last as HTMLButtonElement).disabled) {
      // Still there, but moved (a list sorted anew under it): a browser
      // blurs a node it moves. In an open dialog the page is out of reach,
      // so the focus can only have fallen there: it goes back.
      if (!inside && root.querySelector("dialog[open]")) last.focus();
      return;
    }
    this.focusedLast = undefined;
    const enabled = "button:not([disabled]), input:not([disabled])";
    const next = last.isConnected ? FOCUS_GROUPS.map((group) => last.closest(group)?.querySelector<HTMLElement>(enabled)).find(Boolean) : undefined;
    // Behind an open dialog the card is out of reach: its safe button then.
    const safe = root.querySelector<HTMLElement>("dialog[open] .dlg-actions .safe");
    (next ?? safe ?? root.querySelector<HTMLElement>('.tabs [aria-selected="true"]') ?? root.querySelector<HTMLElement>(".menu-btn"))?.focus();
  }

  /** An opened menu has the focus on its first item, as menus do. */
  opened(): void {
    this.placeMenu();
    this.menuItems()[0]?.focus();
  }

  /** The open menu on the screen: on a narrow card at the screen's left
   * edge it would open partly off it. `translate`, not `transform`: its
   * opening animation moves `transform`. */
  private placeMenu(): void {
    const menu = this.host.root().querySelector<HTMLElement>(".menu");
    if (!menu) return;
    menu.style.translate = "";
    const box = menu.getBoundingClientRect();
    if (!box.width) return;
    const shift = Math.max(MENU_MARGIN - box.left, 0) + Math.min(window.innerWidth - MENU_MARGIN - box.right, 0);
    menu.style.translate = shift ? `${shift}px 0` : "";
  }

  private menuItems(): HTMLButtonElement[] {
    return [...this.host.root().querySelectorAll<HTMLButtonElement>(".menu [role=menuitem]")];
  }

  private readonly toggleMenu = (): void => {
    this.host.setMenuOpen(!this.host.menuOpen());
  };

  focusMenuButton(): void {
    this.host.focusAfterUpdate(".menu-btn");
  }

  private closeMenu(focusTrigger: boolean): void {
    this.host.setMenuOpen(false);
    if (focusTrigger) this.focusMenuButton();
  }

  /** The arrow down on the three dots opens the menu, as on any menu button. */
  private readonly triggerKeys = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    this.host.setMenuOpen(true);
  };

  /** Up, down, Home and End move through the items; Escape closes and goes
   * back to the three dots, Tab closes and moves on. */
  private readonly menuKeys = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.closeMenu(true);
      return;
    }
    if (event.key === "Tab") {
      this.host.setMenuOpen(false);
      return;
    }
    const items = this.menuItems().filter((item) => !item.disabled);
    const index = items.indexOf(this.host.root().activeElement as HTMLButtonElement);
    const to = nextIndex(event.key, index, items.length, "vertical");
    if (to === undefined) return;
    event.preventDefault();
    items[to]?.focus();
  };

  /** Home Assistant's device page, the way its own frontend navigates. */
  private editDevice(deviceId: string): void {
    history.pushState(null, "", `/config/devices/device/${deviceId}`);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  /** The menu: the device page (for an administrator: the config panel is
   * theirs alone), the printer information, the maintenance list, a refresh
   * and the connection check. After an item the
   * focus is back on the three dots; a dialog takes it until it closes. */
  render(ctx: CardContext): TemplateResult {
    const { hass, refs } = ctx;
    const open = this.host.menuOpen();
    const item = (iconName: IconName, label: TextKey, action: () => void, disabled = false, opensDialog = false): TemplateResult =>
      html`<button
        role="menuitem"
        tabindex="-1"
        aria-haspopup=${opensDialog ? "dialog" : nothing}
        ?disabled=${disabled}
        @click=${() => {
          this.closeMenu(!opensDialog);
          if (opensDialog) this.host.markFromMenu();
          action();
        }}
      >
        ${icon(iconName)}<span>${t(hass, label)}</span>
      </button>`;
    const refresh = refs.refresh;
    return html`<span class="menu-wrap">
      <button
        class="icon-btn menu-btn"
        aria-label=${t(hass, "more")}
        title=${t(hass, "more")}
        aria-haspopup="menu"
        aria-expanded=${open ? "true" : "false"}
        aria-controls="bb-menu"
        @click=${this.toggleMenu}
        @keydown=${this.triggerKeys}
      >
        ${icon("dotsVertical")}
      </button>
      ${open
        ? html`<div class="menu" id="bb-menu" role="menu" aria-label=${t(hass, "more")} @keydown=${this.menuKeys}>
            ${hass.user?.is_admin ? item("openInNew", "menu_device_page", () => this.editDevice(refs.deviceId)) : nothing}
            ${item("infoOutline", "menu_info", () => this.host.setDialog({ kind: "info" }), false, true)}
            ${maintenanceOf(ctx) ? item("wrench", "menu_maintenance", () => this.host.setDialog({ kind: "maintenance" }), false, true) : nothing}
            ${refresh
              ? item(
                  "refresh",
                  "menu_refresh",
                  () => void this.host.run("refresh", "button", "press", { entity_id: refresh }),
                  stateOf(hass, refresh)?.state === "unavailable" || this.host.pending("refresh"),
                )
              : nothing}
            ${item("lan", "check_connection", () => void this.host.startCheck(), ctx.unreachable, true)}
          </div>`
        : nothing}
    </span>`;
  }
}
