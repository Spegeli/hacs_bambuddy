// The card's look: Home Assistant's theme variables only, each with a
// fallback, so themes and dark mode apply without code. Container queries
// switch between the narrow layout (a phone) and the wide one.
import { css } from "lit";

export const cardStyles = css`
  :host {
    container-type: inline-size;
    display: block;
    --bb-text: var(--primary-text-color, #212121);
    --bb-muted: var(--secondary-text-color, #727272);
    --bb-disabled: var(--disabled-text-color, #9e9e9e);
    --bb-accent: var(--primary-color, #03a9f4);
    /* The focus ring: the accent mixed with the text, 3:1 also on the light theme's tint. */
    --bb-ring: color-mix(in srgb, var(--bb-accent) 80%, var(--bb-text));
    --bb-on-accent: var(--text-primary-color, #fff);
    --bb-ok: var(--success-color, #43a047);
    --bb-warn: var(--warning-color, #ffa600);
    --bb-err: var(--error-color, #db4437);
    --bb-info: var(--info-color, #039be5);
    /* The disc of what sits on the camera's picture: a medium grey that
       reads apart from black and keeps a white glyph clear on a bright
       picture -- the same in the card and in full screen. */
    --bb-on-picture: rgba(72, 72, 72, 0.78);
    --bb-divider: var(--divider-color, rgba(0, 0, 0, 0.12));
    /* From the text colour itself: Home Assistant computes its rgb triple
       only from a theme's own hex value, not from one it names by a variable. */
    --bb-tint: color-mix(in srgb, var(--bb-text) 5%, transparent);
    --bb-tint-2: color-mix(in srgb, var(--bb-text) 9%, transparent);
    --bb-line: color-mix(in srgb, var(--bb-text) 16%, transparent);
    --bb-heat: var(--deep-orange-color, #ff6f22);
  }
  ha-card {
    display: block;
    position: relative;
    color: var(--bb-text);
    font-family: var(--ha-font-family-body, inherit);
    /* Where the chips and the HMS line start: the card's padding, as the
       tabs and the blocks below -- one left edge under the head. */
    --bb-inset: 16px;
  }
  .tone-active {
    --tone: var(--bb-accent);
  }
  .tone-paused {
    --tone: var(--bb-warn);
  }
  .tone-done {
    --tone: var(--bb-ok);
  }
  .tone-failed {
    --tone: var(--bb-err);
  }
  .tone-idle {
    --tone: var(--bb-muted);
  }
  .tone-off {
    --tone: var(--bb-disabled);
  }
  /* The head's chips: good, needs a look, a problem, to know, nothing to say. */
  .tone-ok {
    --tone: var(--bb-ok);
  }
  .tone-warn {
    --tone: var(--bb-warn);
  }
  .tone-err {
    --tone: var(--bb-err);
  }
  .tone-info {
    --tone: var(--bb-info);
  }
  .tone-neutral {
    --tone: var(--bb-muted);
  }
  .icon {
    width: 18px;
    height: 18px;
    fill: currentColor;
    flex: none;
  }
  button {
    font: inherit;
    color: inherit;
  }
  button:focus-visible {
    outline: 2px solid var(--bb-ring);
    outline-offset: 2px;
  }

  /* Header: online dot, name, light, menu; the chips below. */
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 10px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
    background: var(--bb-disabled);
  }
  .dot.on {
    background: var(--bb-ok);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--bb-ok) 22%, transparent);
  }
  .names {
    flex: 1;
    min-width: 0;
  }
  /* A long name wraps to a second line before it is cut. */
  .name {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 16px;
    font-weight: 500;
    line-height: 22px;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  /* Never cut: two nozzles and the hours take a second line on a narrow card. */
  .model {
    font-size: 12px;
    color: var(--bb-muted);
    line-height: 16px;
    overflow-wrap: anywhere;
  }
  /* Network, HMS, firmware: small chips that wrap; the icon carries the
     colour, the text stays readable. */
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: -2px var(--bb-inset) 10px;
  }
  .pill {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 26px;
    padding: 0 10px 0 8px;
    border: 0;
    border-radius: 13px;
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    /* Never cut: more chips take more rows, and a chip wider than a narrow
       card wraps its words. */
    white-space: normal;
    text-align: start;
    color: var(--bb-text);
    background: color-mix(in srgb, var(--tone) 13%, transparent);
    font-variant-numeric: tabular-nums;
  }
  button.pill {
    cursor: pointer;
  }
  button.pill:hover {
    background: color-mix(in srgb, var(--tone) 20%, transparent);
  }
  .pill .icon {
    width: 15px;
    height: 15px;
    color: var(--tone);
  }
  /* The drying chip: what dries, then its time in bold; where the row is
     too narrow, the time wraps whole onto a line of its own. */
  .dry-chip .dry-text {
    display: inline-flex;
    flex-wrap: wrap;
    column-gap: 5px;
  }
  .dry-chip .dry-text > span {
    white-space: nowrap;
  }
  .dry-chip .dry-time {
    font-weight: 700;
  }
  .pill.tone-neutral {
    background: var(--bb-tint);
  }
  .pill.tone-neutral .icon {
    color: var(--bb-muted);
  }
  button.pill.tone-neutral:hover {
    background: var(--bb-tint-2);
  }
  /* On a touch screen a chip takes a tap 32 px high: the 6 px between two
     rows are shared, nothing looks bigger. */
  @media (pointer: coarse) {
    button.pill::before {
      content: "";
      position: absolute;
      inset: -3px 0;
    }
  }
  /* The HMS line: the message that matters, in its severity's colour, cut
     to one line; a tap opens the messages. */
  .hms-line {
    display: flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    width: calc(100% - 2 * var(--bb-inset));
    min-height: 32px;
    margin: -4px var(--bb-inset) 10px;
    padding: 0 6px 0 8px;
    border: 0;
    border-radius: 8px;
    font-size: 13px;
    line-height: 18px;
    text-align: left;
    color: var(--bb-text);
    background: color-mix(in srgb, var(--tone) 13%, transparent);
    cursor: pointer;
  }
  .hms-line:hover {
    background: color-mix(in srgb, var(--tone) 20%, transparent);
  }
  .hms-line > .icon {
    width: 16px;
    height: 16px;
    color: var(--tone);
  }
  .hms-line-text {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .hms-line-more {
    flex: none;
    white-space: nowrap;
    color: var(--bb-muted);
  }
  .hms-line-go {
    display: inline-flex;
    flex: none;
    margin-left: auto;
    color: var(--bb-muted);
  }
  /* The menu: a small popover below the three dots. */
  .menu-wrap {
    position: relative;
    flex: none;
    margin-right: -6px;
  }
  .menu-btn[aria-expanded="true"] {
    background: var(--bb-tint-2);
  }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 3;
    min-width: 200px;
    max-width: min(280px, calc(100vw - 32px));
    padding: 6px 0;
    border-radius: 12px;
    background: var(--ha-card-background, var(--card-background-color, #fff));
    box-shadow:
      0 0 0 1px var(--bb-divider),
      0 8px 24px rgba(0, 0, 0, 0.2);
    animation: menu-in 0.12s ease-out;
  }
  .menu [role="menuitem"] {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 0 16px;
    border: 0;
    background: none;
    font-size: 14px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .menu [role="menuitem"] .icon {
    color: var(--bb-muted);
  }
  .menu [role="menuitem"]:hover {
    background: var(--bb-tint);
  }
  /* The keyboard's place: the card's ring, inside the item. */
  .menu [role="menuitem"]:focus-visible {
    background: var(--bb-tint);
    outline: 2px solid var(--bb-ring);
    outline-offset: -2px;
  }
  .menu [role="menuitem"]:disabled {
    cursor: default;
    opacity: 0.4;
  }
  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  .chip {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    color: color-mix(in srgb, var(--tone) 45%, var(--bb-text));
    background: color-mix(in srgb, var(--tone) 15%, transparent);
  }
  .chip.tone-off {
    --tone: var(--bb-muted);
  }
  .icon-btn {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    padding: 0;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--bb-tint);
    color: var(--bb-muted);
    cursor: pointer;
  }
  .icon-btn .icon {
    width: 20px;
    height: 20px;
  }
  /* With Hide controls: the light's state, nothing to tap. */
  span.icon-btn {
    cursor: default;
  }
  .icon-btn.light.on {
    color: var(--amber-color, #ffb300);
    background: color-mix(in srgb, var(--amber-color, #ffb300) 18%, transparent);
  }

  /* Views. */
  .tabs {
    display: flex;
    gap: 4px;
    margin: 0 16px 4px;
    padding: 3px;
    border-radius: 12px;
    background: var(--bb-tint);
  }
  .tabs button {
    flex: 1;
    border: 0;
    border-radius: 9px;
    padding: 6px 4px;
    background: none;
    color: var(--bb-muted);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  .tabs button[aria-selected="true"] {
    background: var(--ha-card-background, var(--card-background-color, #fff));
    color: var(--bb-text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
  }
  /* A tab's icon shows only on a card too narrow for its name. */
  .tabs .tab-icon {
    display: none;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 16px 16px;
  }
  .message {
    padding: 16px;
    color: var(--bb-muted);
  }

  /* Buttons. Their text mixes the accent with the text colour, as the
     state line does: 4.5:1 on their tints, light and dark. */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 14px;
    border: 0;
    border-radius: 18px;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    color: color-mix(in srgb, var(--bb-accent) 50%, var(--bb-text));
    background: color-mix(in srgb, var(--bb-accent) 14%, transparent);
    transition: opacity 0.15s;
  }
  .btn.primary {
    color: var(--bb-on-accent);
    background: var(--bb-accent);
  }
  .btn.danger {
    color: color-mix(in srgb, var(--bb-err) 70%, var(--bb-text));
    background: color-mix(in srgb, var(--bb-err) 13%, transparent);
  }
  .btn.plain {
    background: none;
    padding: 0 8px;
  }
  .btn:disabled {
    cursor: default;
    opacity: 0.4;
  }
  .btn.pending {
    opacity: 0.65;
    cursor: progress;
  }
  .icon-btn.pending {
    cursor: progress;
  }
  /* On its way: the icon turns into a small spinner. */
  .btn.pending > .icon,
  .icon-btn.pending > .icon {
    box-sizing: border-box;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .btn.pending > .icon path,
  .icon-btn.pending > .icon path {
    display: none;
  }
  .btn.icon-only {
    padding: 0;
    width: 36px;
  }

  /* The card editor's preview: parts with nothing to show now, as examples. */
  .sample {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sample-note {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--bb-muted);
  }
  .sample-note .icon {
    flex: none;
    width: 14px;
    height: 14px;
  }
  .sample-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    opacity: 0.55;
    pointer-events: none;
  }

  /* The offline view's actions: check the connection, the plug; on a
     narrow card the second goes below the first, a long label wraps. */
  .offline-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .offline-actions .btn {
    max-width: 100%;
    white-space: normal;
  }
  /* Keeping a P2S's chamber warm: off and on, each wide enough for its word. */
  .keep-warm .seg button {
    min-width: 52px;
    white-space: nowrap;
  }
  /* „Lüften“ under the heaters: its own head and row. */
  .vent-part {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 12px;
  }
  /* The AMS filament backup: a setting between the AMS units and the
     external spool. */
  .backup {
    border-top: 1px solid var(--bb-divider);
  }
  .backup + .unit {
    border-top: 1px solid var(--bb-divider);
    padding-top: 12px;
  }
  /* Unknown: the choice on a line of its own, outlined -- nothing chosen. */
  .backup .det-row.choosing {
    flex-wrap: wrap;
    padding-bottom: 8px;
  }
  .backup .det-row.choosing .det-text {
    flex: 1 1 0;
  }
  .backup .backup-set {
    flex: 1 0 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  /* The plugs: one tinted box, a row per plug -- icon, name and what it
     reports, its switch on the right --; the switch-off after the print
     indented under the printer's plug. */
  .power {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .power-box {
    display: flex;
    flex-direction: column;
    padding: 4px 12px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  .p-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 6px 0;
  }
  .power-box > .p-row:not(.p-auto) + .p-row:not(.p-auto),
  .power-box > .p-skip + .p-row,
  .power-box > .p-set + .p-row {
    border-top: 1px solid var(--bb-divider);
  }
  .p-icon {
    flex: none;
    display: inline-flex;
    color: var(--bb-muted);
  }
  .p-icon.on {
    color: var(--bb-warn);
  }
  .p-icon .icon {
    width: 20px;
    height: 20px;
  }
  .p-text {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  button.p-text {
    border: 0;
    padding: 0;
    margin: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  /* The switch-off's settings open from its text: a chevron says so. */
  .p-open {
    flex-direction: row;
    align-items: center;
    gap: 4px;
  }
  .p-open-text {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .p-chevron {
    flex: none;
    display: inline-flex;
    color: var(--bb-muted);
  }
  .p-chevron .icon {
    width: 18px;
    height: 18px;
  }
  .p-name {
    font-size: 14px;
    line-height: 18px;
    font-weight: 500;
    overflow-wrap: break-word;
  }
  .p-sub {
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
    overflow-wrap: break-word;
  }
  .p-sub b {
    color: var(--bb-text);
    font-weight: 600;
  }
  .p-row.warn .p-sub {
    color: color-mix(in srgb, var(--bb-warn) 55%, var(--bb-text));
  }
  .p-row.warn .p-icon {
    color: var(--bb-warn);
  }
  .p-auto {
    padding-left: 30px;
    min-height: 40px;
  }
  .p-auto .p-name {
    font-size: 13px;
  }
  .p-auto.waiting .p-name,
  .p-starting .p-name {
    color: color-mix(in srgb, var(--bb-accent) 55%, var(--bb-text));
  }
  .p-auto.waiting .p-icon {
    color: var(--bb-accent);
  }
  .p-skip,
  .p-set {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 0 8px 30px;
  }
  /* A long label wraps on a narrow card rather than leaving it. */
  .p-skip .btn,
  .p-set .btn {
    max-width: 100%;
    white-space: normal;
  }
  .p-starting {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .p-starting .check-spinner {
    margin-top: 2px;
  }
  /* The switch-off's dialog: its temperature, then when. */
  .dlg-label {
    margin: 12px 0 6px;
    font-size: 13px;
    color: var(--bb-muted);
  }
  .step-value {
    min-width: 64px;
    text-align: center;
    font-size: 18px;
    font-weight: 500;
  }
  /* Its choices may take two lines: never cut. */
  .seg.auto-off-when button {
    white-space: normal;
    overflow: visible;
  }
  /* The maintenance dialog: a task per row, its tone in its bar. */
  .maint-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .maint-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  .maint-text {
    flex: 1 1 150px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .maint-name {
    font-size: 14px;
    line-height: 20px;
    overflow-wrap: anywhere;
  }
  .maint-when {
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  .maint-row.tone-err .maint-when,
  .maint-row.tone-warn .maint-when {
    color: color-mix(in srgb, var(--tone) 70%, var(--bb-text));
  }
  .maint-bar {
    height: 4px;
    margin-top: 4px;
    border-radius: 2px;
    overflow: hidden;
    background: var(--bb-tint-2);
  }
  .maint-bar > span {
    display: block;
    height: 100%;
    background: var(--tone);
  }
  .maint-confirm {
    flex: 1 1 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    line-height: 18px;
  }
  .maint-confirm > span:first-child {
    flex: 1 1 150px;
  }
  .maint-confirm-actions {
    display: flex;
    flex: none;
    gap: 8px;
    margin-left: auto;
  }
  .maint-foot {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  /* The connection check: running, then the verdict, the problems, and
     folded what passed and what was not checked. */
  .check-running {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
  }
  .check-spinner {
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid var(--bb-tint-2);
    border-top-color: var(--bb-accent);
    animation: spin 0.9s linear infinite;
  }
  .check-verdict {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    background: color-mix(in srgb, var(--tone) 13%, transparent);
  }
  .check-verdict .icon {
    flex: none;
    color: var(--tone);
  }
  .check-title {
    font-weight: 500;
  }
  .check-detail {
    font-size: 13px;
    line-height: 18px;
  }
  .sev-ok {
    --sev: var(--bb-ok);
  }
  .sev-skip {
    --sev: var(--bb-muted);
  }
  .check-folded {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 0 4px 26px;
  }
  .check-line {
    display: flex;
    flex-direction: column;
    font-size: 13px;
    line-height: 18px;
  }
  .check-line .check-title {
    font-weight: 400;
  }
  .check-line .check-detail {
    color: var(--bb-muted);
  }
  .check-fold .section-label .icon {
    color: var(--tone);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* Notes and banners. */
  .note {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 13px;
    line-height: 18px;
    color: var(--bb-muted);
  }
  .note.warning {
    color: var(--bb-text);
  }
  .note.warning .icon {
    color: var(--bb-warn);
  }
  .hint {
    margin: 0;
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  /* The text keeps lines of 150 px at least -- beside its icon on a
     half-width card too --: else the button goes below it. */
  .callout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 18px;
    background: color-mix(in srgb, var(--bb-accent) 10%, transparent);
  }
  .callout .btn {
    margin: -4px -4px -4px 0;
    flex: none;
  }
  .callout > .icon {
    color: var(--bb-accent);
  }
  .callout > span {
    flex: 1 1 150px;
  }

  /* The job: picture, name, progress, times. */
  .job {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .picture {
    position: relative;
    flex: none;
    width: 96px;
    height: 96px;
    border-radius: 12px;
    border: 0;
    padding: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bb-tint);
    color: var(--bb-muted);
  }
  /* The job's picture: the whole tile shows it large, the camera has a
     button of its own in its corner. */
  .picture-open {
    width: 100%;
    height: 100%;
    border: 0;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    color: inherit;
    cursor: pointer;
  }
  .picture-open:focus-visible,
  button.live-hint:focus-visible {
    outline: 2px solid var(--bb-ring);
    outline-offset: -2px;
  }
  /* The job's picture large, where the live view opens. */
  .big-cover {
    position: relative;
    margin: 6px 16px 0;
    border-radius: 12px;
    overflow: hidden;
    background: var(--bb-tint);
    aspect-ratio: 16 / 9;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .big-cover img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .big-cover .icon-btn {
    background: var(--bb-on-picture);
    color: #fff;
  }
  .picture .cover {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .picture .drawing {
    width: 72%;
    height: 72%;
  }
  .live-hint {
    position: absolute;
    right: 6px;
    bottom: 6px;
    /* Large enough for a finger on a phone. */
    width: 30px;
    height: 30px;
    border: 0;
    padding: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
  }
  .live-hint .icon {
    width: 18px;
    height: 18px;
  }
  .drawing .d-body {
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    opacity: 0.55;
  }
  .drawing .d-window {
    fill: currentColor;
    opacity: 0.08;
  }
  .drawing .d-line {
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0.55;
  }
  .drawing .d-head {
    fill: currentColor;
    opacity: 0.7;
  }
  .drawing .d-part {
    fill: var(--bb-accent);
    opacity: 0.75;
  }
  .drawing .d-base {
    fill: currentColor;
    opacity: 0.3;
  }
  .offline-pic .drawing .d-part {
    fill: currentColor;
    opacity: 0.3;
  }
  .job-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .job-name {
    min-width: 0;
    font-size: 15px;
    font-weight: 500;
    line-height: 20px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    word-break: break-word;
  }
  /* A text in a state's colour mixes it with the text colour: the hue stays,
     and it reads at 4.5:1 on light and dark themes -- warning orange alone
     reaches 2:1 on white. An icon keeps the pure colour. */
  .pct {
    font-size: 22px;
    font-weight: 500;
    line-height: 24px;
    color: color-mix(in srgb, var(--tone) 55%, var(--bb-text));
    font-variant-numeric: tabular-nums;
  }
  /* The state line: icon and word in the state's colour; unknown in the
     muted text colour, readable unlike the disabled one. */
  .state {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    line-height: 18px;
    font-weight: 500;
    color: color-mix(in srgb, var(--tone) 55%, var(--bb-text));
    margin-top: -4px;
  }
  .state.tone-off {
    --tone: var(--bb-muted);
  }
  .state .icon {
    width: 16px;
    height: 16px;
    color: var(--tone);
  }
  /* The percentage beside the bar: the same place whatever the name's
     length, and no line above it wraps for it. */
  .bar-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .bar-row .bar {
    flex: 1;
    min-width: 0;
  }
  .bar {
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    background: color-mix(in srgb, var(--tone) 18%, transparent);
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: var(--tone);
    transition: width 0.6s ease;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    font-size: 12px;
    color: var(--bb-muted);
  }
  .meta span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .meta .icon {
    width: 14px;
    height: 14px;
  }

  /* The live view. */
  .live {
    position: relative;
    margin: 6px 16px 0;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
    aspect-ratio: 16 / 9;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .live img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .live-tags {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    gap: 6px;
  }
  .live-badge {
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: #fff;
    background: rgba(219, 68, 55, 0.92);
  }
  .live-fps {
    background: var(--bb-on-picture);
  }
  .live-tools {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    gap: 6px;
  }
  .live .icon-btn {
    background: var(--bb-on-picture);
    color: #fff;
  }
  .live-full {
    position: absolute;
    bottom: 6px;
    right: 6px;
  }
  /* Full screen -- the browser's own, or the window where it has none
     (above Home Assistant's header and sidebar). The whole screen, black,
     the picture fitted; the tools stay in the card. */
  .live.full {
    position: fixed;
    inset: 0;
    z-index: 7;
    width: 100%;
    height: 100%;
    max-height: none;
    margin: 0;
    border: 0;
    padding: 0;
    border-radius: 0;
    aspect-ratio: auto;
  }
  .live.full .live-tools {
    display: none;
  }
  .live.full .live-tags {
    top: max(12px, env(safe-area-inset-top));
    left: max(12px, env(safe-area-inset-left));
    right: auto;
    bottom: auto;
    gap: 9px;
  }
  /* Grown as the button grows (36 to 52 px). */
  .live.full .live-badge {
    padding: 3px 12px;
    border-radius: 14px;
    font-size: 16px;
  }
  .live.full .live-full {
    bottom: max(6px, env(safe-area-inset-bottom));
    right: max(6px, env(safe-area-inset-right));
    /* Large enough to find on a phone; the picture's grey disc. */
    width: 52px;
    height: 52px;
  }
  .live.full .live-full .icon {
    width: 30px;
    height: 30px;
  }
  /* Where the picture was while it is full screen. */
  .live-holder {
    margin: 6px 16px 0;
    aspect-ratio: 16 / 9;
  }
  .live.failed {
    flex-direction: column;
    gap: 8px;
    color: #fff;
    font-size: 13px;
    background: #222;
  }
  /* On the dark panel in every theme: white, not the theme's text colour. */
  .live.failed .btn {
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
  }

  /* Temperatures. */
  .temps {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .temps.n1,
  .temps.n2,
  .temps.n4,
  .temps.dual {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  /* As high as an AMS head's second line, which it stands in for. */
  .slot-side {
    font-size: 10px;
    font-weight: 600;
    color: var(--bb-muted);
    height: 13px;
    line-height: 13px;
  }
  .temp {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
    padding: 8px 10px;
    border: 0;
    border-radius: 10px;
    background: var(--bb-tint);
    text-align: left;
    cursor: pointer;
  }
  .temp-head {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--bb-muted);
    max-width: 100%;
    flex-wrap: wrap;
  }
  /* A name too long for a narrow tile wraps at its words, never cut. */
  .temp-head > span:not(.temp-tag) {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .temp-head .icon {
    width: 15px;
    height: 15px;
  }
  /* The active one of two nozzles, as the Control tab's tag. */
  .temp-head .temp-tag,
  .p-name .temp-tag {
    flex: none;
    overflow: visible;
    white-space: nowrap;
    font-size: 11px;
    line-height: 16px;
    font-weight: 500;
    padding: 0 6px;
    border-radius: 8px;
    color: color-mix(in srgb, var(--bb-accent) 50%, var(--bb-text));
    background: color-mix(in srgb, var(--bb-accent) 15%, transparent);
  }
  .temp-value {
    font-size: 18px;
    font-weight: 500;
    line-height: 22px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .temp-target {
    font-size: 12px;
    color: var(--bb-muted);
    white-space: nowrap;
  }
  .temp.heating .temp-head .icon {
    color: var(--bb-heat);
  }
  /* Text in a mix of the tone and the text colour, readable on the tint. */
  .temp.heating .temp-target {
    color: color-mix(in srgb, var(--bb-heat) 55%, var(--bb-text));
  }
  /* A ventilated chamber, in the ventilation's tone. */
  .temp.venting .temp-head .icon {
    color: var(--bb-accent);
  }
  .temp.venting .temp-target {
    color: color-mix(in srgb, var(--bb-accent) 55%, var(--bb-text));
  }

  /* Fans. */
  .fans {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .fan {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px 5px 8px;
    border: 0;
    border-radius: 16px;
    background: var(--bb-tint);
    font-size: 13px;
    cursor: pointer;
    color: var(--bb-muted);
  }
  .fan .icon {
    width: 16px;
    height: 16px;
  }
  span.fan {
    cursor: default;
  }
  .fan-label.full {
    display: none;
  }
  .fan-value {
    color: var(--bb-text);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .fan.on .icon {
    color: var(--bb-accent);
    animation: spin 1.6s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Filament: the strip on the status view. */
  .ams-strip {
    display: flex;
    align-items: stretch;
    padding: 10px 36px 10px 12px;
    border: 0;
    border-radius: 10px;
    background: var(--bb-tint);
    text-align: left;
    cursor: pointer;
    position: relative;
  }
  /* Without a filament view to open: no chevron to make room for. */
  div.ams-strip {
    padding-right: 12px;
    cursor: default;
  }
  /* The AMS units one below the other; the AMS HT units and the external
     spools beside them as long as the widest of them fits there, else
     below. */
  .ams-units {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 21px 24px;
    /* What lies left of or above the units: the line a fill does not need
       where it starts a row or stands in the first one -- but not a
       spool's ring (2 px out, 2 px off). */
    clip-path: inset(-6px -24px -24px -6px);
  }
  /* A line between two AMS units, with room on either side. */
  .ams-column {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .ams-column > .ams-group + .ams-group {
    border-top: 1px solid var(--bb-line);
    margin-top: 10px;
    padding-top: 10px;
  }
  .ams-fill {
    position: relative;
    display: flex;
    flex: 1 1 0%;
    min-width: min-content;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 8px 16px;
  }
  /* The AMS HT units' rows as far apart as the AMS units beside them --
     a line's room, without the line --, so they stand level. */
  .ams-fill.with-ht {
    row-gap: 21px;
  }
  /* Beside the column, a line in the middle of the gap that fades out at
     both ends; below it, a line as between the AMS units. */
  .ams-fill::before,
  .ams-fill::after {
    content: "";
    position: absolute;
  }
  .ams-fill::before {
    top: 0;
    bottom: 0;
    left: -12px;
    width: 1px;
    background: linear-gradient(to bottom, transparent, var(--bb-line) 25%, var(--bb-line) 75%, transparent);
  }
  .ams-fill::after {
    top: -11px;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--bb-line);
  }
  /* With an AMS HT there, each unit is as wide as one -- its second line:
     the humidity, 6 px, the temperature --, so the rows fill evenly: never
     one unit alone above two. An AMS HT then fits beside an AMS from a card
     of about 326 px: a 360 px phone keeps it there with 10 px to spare. */
  .ams-fill.with-ht .ams-head {
    min-width: calc(34px + 8.5ch);
  }
  .ams-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  /* Two lines of one height each -- the name and the model, the humidity
     and the temperature --, so a row's colours stand level. */
  .ams-head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    font-size: 12px;
    color: var(--bb-muted);
    white-space: nowrap;
  }
  .ams-line,
  .ams-env {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 15px;
  }
  /* The chip a shade darker than the strip it sits on; its text between
     the muted and the text colour, readable on it in both themes. */
  .ams-strip .unit-model,
  .ams-strip .ams-nozzle {
    font-size: 11px;
    line-height: 15px;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--bb-tint-2);
    color: color-mix(in srgb, var(--bb-muted) 50%, var(--bb-text));
  }
  /* A size above the figures below it, in its 15 px line. */
  .ams-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--bb-text);
    line-height: 15px;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  /* A name the user gave the unit in BamBuddy can be long: it wraps word
     by word rather than push the card wider -- a single long word where it
     must --, and its line grows for it; one line stays 15 px, level with
     the units beside it. */
  .ams-line {
    height: auto;
    min-height: 15px;
    flex-wrap: wrap;
    row-gap: 2px;
  }
  /* Room for "99 %" and "88 °C" (the icon, 1px, the figure): a unit keeps
     its width when they change, so it never jumps below the column at 10 %. */
  .ams-env > span {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    font-variant-numeric: tabular-nums;
  }
  .ams-hum {
    min-width: calc(14px + 4ch);
  }
  .ams-temp {
    min-width: calc(14px + 4.5ch);
  }
  .ams-env .icon {
    width: 13px;
    height: 13px;
  }
  .ams-slots {
    display: flex;
    gap: 8px;
  }
  .ams-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 30px;
  }
  .slot-type {
    font-size: 11px;
    line-height: 13px;
    color: var(--bb-muted);
    max-width: 44px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ams-go {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--bb-muted);
    display: flex;
  }
  /* A spool: its true colour as far as filament is left, the rest a
     neutral track; the outline lies over both. */
  .swatch {
    position: relative;
    display: block;
    width: 24px;
    height: 32px;
    border-radius: 7px;
    overflow: hidden;
    background: var(--bb-tint-2);
  }
  .swatch::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bb-text) 24%, transparent);
    pointer-events: none;
  }
  .swatch.outline::after {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bb-text) 50%, transparent);
  }
  .swatch .fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--fill);
    background: var(--c);
  }
  .swatch.partial .fill {
    box-shadow: 0 -1px 0 color-mix(in srgb, var(--bb-text) 40%, transparent);
  }
  .swatch.empty {
    background: none;
    border: 1.5px dashed var(--bb-line);
    box-sizing: border-box;
  }
  .swatch.empty::after,
  .swatch.empty .fill {
    display: none;
  }
  /* Contents unknown: the bare neutral spool, neither a colour nor empty. */
  .swatch.unknown .fill {
    display: none;
  }
  .swatch.active {
    outline: 2px solid var(--bb-ring);
    outline-offset: 2px;
  }
  .swatch.large {
    width: 30px;
    height: 40px;
    border-radius: 8px;
  }

  /* Controls on the status view. */
  .controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ctl-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .ctl-buttons .btn {
    flex: 1;
  }
  /* Skipping objects is the rarer choice: a plain button in its own row on
     a narrow card. */
  .ctl-buttons .btn.skip {
    flex-basis: 100%;
    min-height: 32px;
  }
  .speed {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  /* The speed as it is, with the controls hidden. */
  .speed-now {
    font-size: 13px;
    font-weight: 500;
  }
  .speed-label,
  .step-label,
  .axis-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--bb-muted);
  }
  .speed-label .icon {
    width: 15px;
    height: 15px;
  }
  .seg {
    display: flex;
    padding: 3px;
    gap: 2px;
    border-radius: 12px;
    background: var(--bb-tint);
  }
  .seg button {
    flex: 1;
    min-width: 0;
    border: 0;
    border-radius: 9px;
    padding: 6px 4px;
    background: none;
    color: var(--bb-muted);
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .seg button[aria-checked="true"] {
    color: color-mix(in srgb, var(--bb-accent) 50%, var(--bb-text));
    background: color-mix(in srgb, var(--bb-accent) 18%, transparent);
    font-weight: 500;
  }
  .seg button:disabled {
    cursor: default;
    opacity: 0.6;
  }
  /* The jog pad's step, locked with the arrows: drawn like them. */
  .step-row .seg button:disabled {
    opacity: 0.4;
  }
  /* A choice on its way: as disabled, and still where the keyboard is. */
  .seg button[aria-disabled="true"] {
    cursor: progress;
    opacity: 0.6;
  }
  /* The speeds: four in a row, two by two on a very narrow card. */
  .seg.speeds {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .seg.speeds button {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5px 2px;
    line-height: 17px;
  }
  .seg.speeds .opt,
  .seg.speeds .opt-sub {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* The percentage is small: in the option's colour, not paler. */
  .seg.speeds .opt-sub {
    font-size: 11px;
    line-height: 14px;
    font-weight: 400;
    opacity: 1;
    font-variant-numeric: tabular-nums;
  }

  /* Control view: its sections in the user's order; in moving, the step,
     the pad beside the bed, the extruder below them -- beside them where
     there is room. */
  .heating {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px 6px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  .heat-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 32px;
  }
  .section-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
  }
  .section-label .icon {
    width: 16px;
    height: 16px;
    color: var(--bb-heat);
  }
  .heat-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
  .heat-row + .heat-row {
    border-top: 1px solid var(--bb-divider);
  }
  .heat-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .heat-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
  }
  .heat-label span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The name itself is never cut ("Right nozzle" beside a thumb's 44 px
     Off): it wraps in whole words. */
  .heat-label .heat-text {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    overflow-wrap: break-word;
  }
  .heat-label .icon {
    width: 16px;
    height: 16px;
    color: var(--bb-muted);
  }
  /* A heater that is on, as the Status tab's tile. */
  .heat-name.on .heat-label .icon {
    color: var(--bb-heat);
  }
  /* Ventilation in its own tone: the head always, the row while it runs. */
  .vent-head .section-label .icon,
  .heat-name.vent.on .heat-label .icon {
    color: var(--bb-accent);
  }
  /* The name keeps its room: a tag that does not fit goes below it. */
  .heat-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 6px;
    row-gap: 2px;
    min-width: 0;
  }
  .heat-label .heat-tag {
    flex: none;
    overflow: visible;
    font-size: 11px;
    line-height: 16px;
    font-weight: 500;
    padding: 0 6px;
    border-radius: 8px;
    color: color-mix(in srgb, var(--bb-accent) 50%, var(--bb-text));
    background: color-mix(in srgb, var(--bb-accent) 15%, transparent);
  }
  .heat-now {
    font-size: 12px;
    color: var(--bb-muted);
    padding-left: 22px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* The fans the ventilation runs: two of them take a second line, never the stepper's room. */
  .heat-name.vent .heat-now {
    white-space: normal;
  }
  .heat-set {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  /* The steppers and the power symbol, and the place of one that cannot be used. */
  .heat-row .btn.icon-only {
    width: 34px;
    min-height: 34px;
    height: 34px;
  }
  .heat-row .heat-off-space {
    width: 34px;
    min-height: 34px;
    height: 34px;
  }
  .heat-target {
    min-width: 62px;
    text-align: center;
    font-size: 15px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .heat-target.off {
    color: var(--bb-muted);
    font-weight: 400;
  }
  .btn.heat-off {
    color: var(--bb-muted);
  }
  .btn.heat-off:not(:disabled):hover {
    color: var(--bb-text);
  }
  /* On in the tone of what it does. */
  .btn.heat-off.on.tone-heat {
    color: var(--bb-heat);
  }
  .btn.heat-off.on.tone-vent {
    color: var(--bb-accent);
  }
  /* The print options: folded under a head that says what is off; a row
     per detection, only its switch taps. */
  .detection {
    display: flex;
    flex-direction: column;
    padding: 4px 10px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  .det-head {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .det-head:focus-visible {
    border-radius: 6px;
  }
  .detection .section-label {
    flex: 1;
    min-height: 32px;
  }
  .det-summary {
    flex: none;
    font-size: 13px;
    color: var(--bb-muted);
  }
  .det-chevron {
    flex: none;
    display: inline-flex;
    color: var(--bb-muted);
    transition: transform 0.15s;
  }
  .det-chevron.open {
    transform: rotate(180deg);
  }
  .det-body {
    padding-bottom: 4px;
  }
  .detection .section-label .icon {
    color: var(--bb-accent);
  }
  .det-rows {
    display: flex;
    flex-direction: column;
  }
  .det-row {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 4px 0;
    font-size: 14px;
    line-height: 18px;
  }
  .det-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .det-sub {
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  /* The switch: a 48 x 36 target around the small track. */
  .det-switch {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    width: 48px;
    height: 36px;
    margin-right: -2px;
    padding: 0 2px;
    border: 0;
    border-radius: 18px;
    background: none;
    cursor: pointer;
  }
  .det-rows > .det-row + .det-row {
    border-top: 1px solid var(--bb-divider);
  }
  .det-name {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .toggle {
    position: relative;
    flex: none;
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--bb-muted) 60%, transparent);
    /* An edge, so the off track stands out from its box (3:1 and more). */
    box-shadow: inset 0 0 0 1px var(--bb-muted);
    transition: background 0.15s;
  }
  .toggle .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s;
  }
  .det-switch[aria-checked="true"] .toggle {
    background: var(--bb-accent);
    box-shadow: none;
  }
  .det-switch[aria-checked="true"] .knob {
    transform: translateX(16px);
  }
  .det-switch:disabled {
    cursor: default;
  }
  .det-switch:disabled .toggle {
    opacity: 0.4;
  }
  .det-switch[aria-disabled="true"] {
    cursor: progress;
  }
  .det-switch[aria-disabled="true"] .toggle {
    opacity: 0.4;
  }
  .det-state {
    flex: none;
    font-size: 13px;
    color: var(--bb-muted);
  }
  .detection .hint {
    margin-top: 4px;
  }
  .nozzle-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .nozzle-row .seg {
    flex: 1;
    max-width: 260px;
  }
  .control {
    display: grid;
    grid-template-columns: auto auto;
    grid-template-areas: "step step" "pad bed" "ext ext";
    justify-content: center;
    align-items: start;
    gap: 14px 18px;
  }
  .step-row {
    grid-area: step;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .step-row .seg {
    flex: 1;
  }
  .pad {
    grid-area: pad;
    display: grid;
    grid-template-columns: repeat(3, 52px);
    grid-template-rows: repeat(3, 52px);
    grid-template-areas: ". n ." "w h e" ". s .";
    gap: 6px;
  }
  .pad .btn {
    width: 52px;
    height: 52px;
    border-radius: 14px;
  }
  .pad .btn .icon {
    width: 22px;
    height: 22px;
  }
  .pad .n {
    grid-area: n;
  }
  .pad .w {
    grid-area: w;
  }
  .pad .home {
    grid-area: h;
  }
  .pad .e {
    grid-area: e;
  }
  .pad .s {
    grid-area: s;
  }
  .axis-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .axis-col.bed {
    grid-area: bed;
    height: 100%;
  }
  .axis-col.ext {
    grid-area: ext;
    align-items: stretch;
  }
  .ext-buttons {
    display: flex;
    gap: 8px;
  }
  .ext-buttons .btn {
    flex: 1;
  }
  .btn.stack {
    flex-direction: column;
    gap: 2px;
    width: 84px;
    flex: 1;
    min-height: 56px;
    padding: 6px 4px;
    border-radius: 14px;
    font-size: 12px;
    white-space: normal;
    line-height: 14px;
  }
  .btn.stack .icon {
    width: 20px;
    height: 20px;
  }
  .ext-buttons .btn.stack {
    flex-direction: row;
    gap: 6px;
    width: auto;
    min-height: 40px;
    font-size: 13px;
  }

  /* Filament view. */
  .unit {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .unit + .unit {
    border-top: 1px solid var(--bb-divider);
    padding-top: 12px;
  }
  .unit-head {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* An AMS unit's head folds and unfolds it: the whole row is the button. */
  button.unit-head {
    width: 100%;
    margin: -6px -8px;
    padding: 6px 8px;
    box-sizing: content-box;
    border: 0;
    border-radius: 8px;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  button.unit-head:hover {
    background: var(--bb-tint);
  }
  button.unit-head:focus-visible {
    outline: 2px solid var(--bb-ring);
    outline-offset: -2px;
  }
  .unit-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 10px;
    width: 100%;
  }
  .unit-fold {
    display: flex;
    color: var(--bb-muted);
    transition: transform 0.2s ease;
  }
  .unit.open .unit-fold {
    transform: rotate(180deg);
  }
  .unit-colors {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 2px;
  }
  .unit-name {
    font-weight: 500;
    font-size: 15px;
    /* A name from BamBuddy in one long word breaks rather than leave the card. */
    overflow-wrap: anywhere;
  }
  /* A unit's model, and on a two-nozzle printer the nozzle it feeds. */
  .unit-model,
  .unit-nozzle,
  .ams-nozzle {
    font-size: 12px;
    color: var(--bb-muted);
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  /* The figures and the chevron stay together: a wrap moves both. */
  .unit-end {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .unit-nozzle {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .unit-nozzle .icon {
    width: 14px;
    height: 14px;
  }
  .unit-env {
    display: flex;
    gap: 10px;
    font-size: 13px;
    color: var(--bb-muted);
  }
  .unit-env span {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .unit-env .icon {
    width: 15px;
    height: 15px;
  }
  .drying {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
    font-size: 13px;
    color: var(--bb-muted);
    min-height: 32px;
  }
  .drying > span {
    flex: 1 1 auto;
  }
  /* The text wraps beside its button before the button goes below it. */
  .drying > .drying-text {
    flex: 1 1 0;
    min-width: 8em;
  }
  .drying > .btn {
    margin-left: auto;
  }
  .drying.on {
    color: var(--bb-text);
  }
  .drying.on > .icon {
    color: var(--bb-heat);
  }
  /* No buttons where the printer dries from its own screen only: where
     instead, on a line of its own below the state. */
  .drying > .dry-where {
    flex: 1 0 100%;
    box-sizing: border-box;
    padding-left: 26px;
    color: var(--bb-muted);
    font-size: 12px;
  }
  /* One column no wider than the card: a slot's sub line never widens it. */
  .slots {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .slot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 6px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  .slot.active {
    background: color-mix(in srgb, var(--bb-accent) 10%, transparent);
  }
  .slot-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    padding: 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .slot-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  /* A long name takes two lines before it is cut. */
  .slot-name {
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
    overflow: hidden;
    overflow-wrap: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  /* Never cut: beside a pencil and a button on a narrow card it wraps. */
  .slot-sub {
    font-size: 12px;
    color: var(--bb-muted);
    overflow-wrap: break-word;
  }
  .slot-sub .in-use {
    font-weight: 500;
    color: color-mix(in srgb, var(--bb-accent) 55%, var(--bb-text));
  }
  .slot .btn {
    flex: none;
    min-height: 32px;
    padding: 0 12px;
    font-size: 13px;
  }
  /* Setting a spool's filament: a quiet pencil beside the main action. */
  .slot .btn.edit {
    width: 32px;
    padding: 0;
    color: var(--bb-muted);
  }
  .slot .btn.edit:not(:disabled):hover {
    color: var(--bb-text);
  }

  /* The error line. */
  /* It sticks to the bottom of the screen while the card's own bottom is
     further down: a tap far up a tall card still shows why it failed. */
  .toast {
    position: sticky;
    bottom: 12px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 16px 14px;
    padding: 8px 6px 8px 12px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 18px;
    color: var(--bb-text);
    background: linear-gradient(color-mix(in srgb, var(--bb-err) 16%, transparent), color-mix(in srgb, var(--bb-err) 16%, transparent)),
      var(--ha-card-background, var(--card-background-color, #fff));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }
  .toast > .icon {
    color: var(--bb-err);
  }
  .toast > span {
    flex: 1;
  }
  .toast .icon-btn {
    width: 30px;
    height: 30px;
    background: none;
  }

  /* Inside an open dialog the notices stand in its flow. */
  .dlg-body .toast {
    position: static;
    margin: 0;
    box-shadow: none;
  }
  .dlg-body .sent-slot {
    position: static;
    height: auto;
  }
  .dlg-body .sent {
    position: static;
    transform: none;
    width: fit-content;
    margin: 0 auto;
  }
  /* "Sent": a snackbar over the card's bottom, so nothing moves while it shows. */
  .sent-slot {
    position: sticky;
    bottom: 12px;
    z-index: 1;
    height: 0;
  }
  .sent {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px 4px 8px;
    border-radius: 14px;
    font-size: 13px;
    line-height: 18px;
    white-space: nowrap;
    pointer-events: none;
    /* Inverse, as a snackbar: it lies over the card, it is not part of it. */
    color: var(--ha-card-background, var(--card-background-color, #fff));
    background: var(--bb-text);
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.25);
    animation: sent-in 0.15s ease-out;
  }
  .sent .icon {
    width: 16px;
    height: 16px;
    color: var(--bb-ok);
  }
  @keyframes sent-in {
    from {
      opacity: 0;
    }
  }

  /* What the AMS is doing: a line in the job, a bar in the filament view. */
  .ams-activity {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: color-mix(in srgb, var(--bb-accent) 55%, var(--bb-text));
  }
  .ams-activity .icon,
  .activity .icon {
    width: 15px;
    height: 15px;
    color: var(--bb-accent);
    animation: spin 1.6s linear infinite;
  }
  .activity {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px 10px;
    border-radius: 10px;
    font-size: 13px;
    color: var(--bb-text);
    background: color-mix(in srgb, var(--bb-accent) 10%, transparent);
  }
  .activity-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: 30%;
    border-radius: 2px;
    background: var(--bb-accent);
    animation: slide 1.4s ease-in-out infinite;
  }
  @keyframes slide {
    from {
      left: -30%;
    }
    to {
      left: 100%;
    }
  }

  /* Dialogs: on the theme's dialog surface, with an edge and a darker
     backdrop, so that they stand out from a dark page too. */
  dialog {
    --bb-surface: var(--ha-dialog-surface-background, var(--mdc-theme-surface, var(--card-background-color, #fff)));
    /* Scrolled to, a control stays clear of the edge and of the button row
       at the foot (one row; the card sets it from the row's height). */
    scroll-padding-block: 12px 80px;
    border: 0;
    padding: 0;
    border-radius: 16px;
    /* As Home Assistant's dialogs: a width they want, never wider than the
       screen less a margin -- on a phone the screen less 16 px a side. */
    max-width: min(440px, calc(100vw - 32px));
    width: 100%;
    color: var(--bb-text);
    background: var(--bb-surface);
    box-shadow:
      0 0 0 1px var(--bb-divider),
      0 12px 40px rgba(0, 0, 0, 0.3);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.55);
  }
  /* A pop-up is never see-through, even where the theme makes its surface
     so -- the card behind would show: the theme's colour at full strength.
     A browser that cannot take a colour's alpha away keeps the theme's. */
  @supports (color: rgb(from red r g b / 1)) {
    dialog {
      --bb-surface: rgb(from var(--ha-dialog-surface-background, var(--mdc-theme-surface, var(--card-background-color, #fff))) r g b / 1);
    }
    .menu {
      background: rgb(from var(--ha-card-background, var(--card-background-color, #fff)) r g b / 1);
    }
  }
  .dlg-body {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
  }
  .dlg-body h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
    line-height: 24px;
  }
  .dlg-body p {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--bb-muted);
  }
  /* At the dialog's foot while it scrolls: the buttons stay in reach. */
  .dlg-actions {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    margin: 4px -20px -20px;
    padding: 12px 20px 20px;
    background: var(--bb-surface);
  }
  /* The theme's red, darkened: white on it reaches 4.5:1 (5.6:1 on Home
   * Assistant's own). */
  .dlg-actions .btn.danger {
    color: #fff;
    background: color-mix(in srgb, var(--bb-err) 85%, #000);
  }
  .dlg-actions .btn {
    max-width: 100%;
    white-space: normal;
  }
  .dlg-actions .btn.safe {
    color: var(--bb-text);
  }
  .dlg-body .dlg-suggested {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--bb-text);
  }
  .dlg-suggested .icon {
    flex: none;
    width: 16px;
    height: 16px;
    color: var(--bb-ok);
  }
  /* The spools disagree: a neutral note, it may take two lines. */
  .dlg-body .dlg-suggested.mixed {
    align-items: flex-start;
  }
  .dlg-suggested.mixed .icon {
    margin-top: 2px;
    color: var(--bb-muted);
  }
  .dlg-body .dlg-warn {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 13px;
    line-height: 18px;
    color: var(--bb-text);
  }
  .dlg-warn .icon {
    color: var(--bb-warn);
  }
  /* A note, not a warning. */
  .dlg-warn.info .icon {
    color: var(--bb-accent);
  }
  .dlg-error {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 14px;
    line-height: 20px;
    background: color-mix(in srgb, var(--bb-err) 12%, transparent);
  }
  .dlg-error .icon {
    color: var(--bb-err);
  }
  /* What the confirming button still waits for, beside it. */
  .dlg-actions .dlg-need {
    flex: 1;
    align-self: center;
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  /* The HMS messages: each in its severity -- error red, warning orange,
     notice blue. */
  .hms-item {
    --sev: var(--bb-warn);
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 14px;
    line-height: 20px;
    background: color-mix(in srgb, var(--sev) 12%, transparent);
  }
  .sev-error {
    --sev: var(--bb-err);
  }
  .sev-notice {
    --sev: var(--bb-info);
  }
  /* No scroll box of its own: the dialog scrolls as a whole (a touch
     screen shows no scrollbar, and a swipe would scroll the inner box). */
  .hms-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hms-item > .icon {
    color: var(--sev);
    margin-top: 1px;
  }
  .hms-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .hms-code {
    font-size: 11px;
    line-height: 16px;
    color: var(--bb-muted);
    font-family: var(--ha-font-family-code, monospace);
  }
  /* The filament dialog's slot tools: chip and reset, below a line. */
  .slot-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--bb-divider);
  }
  .slot-tools .btn {
    max-width: 100%;
    white-space: normal;
  }
  /* The K profile: label above, the select over the dialog's width -- a
     profile's name is long. */
  .field.kfield {
    flex-wrap: nowrap;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  .field.kfield .select {
    max-width: none;
  }
  /* Vendor and filament: beside their labels, in one column so the two
     selects line up, each over the rest of the row; on a dialog too narrow
     for the list's longest name and its "Keep" beside the widest label,
     under their labels at the dialog's width, as the colour and the K
     profile. */
  .fil-fields {
    container-type: inline-size;
  }
  .fil-grid {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 14px 12px;
  }
  .fil-grid > .field {
    display: contents;
  }
  .fil-grid .select {
    max-width: none;
  }
  @container (max-width: 329px) {
    .fil-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }
    .fil-grid > .field + .field label {
      margin-top: 8px;
    }
  }
  .rfid-spool {
    font-weight: 500;
  }
  .k-hint {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  /* A message's answers, as on the printer's screen; long ones wrap. */
  .hms-answers {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .hms-answers .btn {
    max-width: 100%;
    white-space: normal;
    text-align: start;
  }
  .hms-wiki {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    padding: 6px 0;
    font-size: 13px;
    color: color-mix(in srgb, var(--bb-accent) 55%, var(--bb-text));
    text-decoration: none;
  }
  .hms-wiki .icon {
    width: 16px;
    height: 16px;
  }
  /* A fact sheet: label left, value right, a copy button beside it. */
  .spec {
    display: flex;
    flex-direction: column;
    margin: -4px 0;
  }
  .spec-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 36px;
    padding: 3px 0;
    font-size: 14px;
    line-height: 20px;
  }
  .spec-row + .spec-row {
    border-top: 1px solid var(--bb-divider);
  }
  .spec-label {
    flex: none;
    max-width: 45%;
    color: var(--bb-muted);
  }
  .spec-value {
    flex: 1;
    min-width: 0;
    text-align: right;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
  .spec-value.lines {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .spec-sub {
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  .spec-value.update {
    color: color-mix(in srgb, var(--bb-warn) 55%, var(--bb-text));
    font-weight: 500;
  }
  .spec-value .chip {
    padding: 1px 9px;
    font-size: 12px;
  }
  .spec-row .copy {
    width: 32px;
    height: 32px;
    margin: -4px -6px -4px -6px;
    background: none;
  }
  .spec-row .copy .icon {
    width: 16px;
    height: 16px;
  }
  /* Release notes: Home Assistant's update dialog shows them. */
  .btn.release {
    align-self: flex-start;
  }
  .btn.release .icon {
    width: 16px;
    height: 16px;
  }
  /* "Copied", inside the dialog: the card's own snackbar lies behind it.
     Sticky above the button row, as the card's "Sent": in view while the
     dialog scrolls too; no gap of its own in the dialog's column. */
  .dlg-snack {
    position: sticky;
    bottom: 76px;
    height: 0;
    margin-top: -14px;
    /* Above the sticky button row (1). */
    z-index: 2;
  }
  /* Its pill a snackbar in the wrapper, not in the flow as a dialog's "Sent". */
  .dlg-body .dlg-snack .sent {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    margin: 0;
  }
  /* No scroll box of its own: the dialog scrolls as a whole. */
  .objects {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 -8px;
  }
  .obj {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 0 8px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
  }
  .obj:hover {
    background: var(--bb-tint);
  }
  .obj input {
    flex: none;
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--bb-err);
  }
  .obj-name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .obj.skipped {
    cursor: default;
    color: var(--bb-muted);
  }
  .obj.skipped:hover {
    background: none;
  }
  .obj.skipped .obj-name {
    text-decoration: line-through;
  }
  .obj-note {
    font-size: 12px;
  }
  .field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .field label {
    font-size: 14px;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .stepper.centered {
    justify-content: center;
  }
  .stepper input {
    width: 54px;
    padding: 6px 4px;
    border: 1px solid var(--bb-line);
    border-radius: 8px;
    font: inherit;
    font-size: 15px;
    text-align: center;
    color: var(--bb-text);
    background: none;
    -moz-appearance: textfield;
  }
  .stepper input::-webkit-inner-spin-button,
  .stepper input::-webkit-outer-spin-button {
    -webkit-appearance: none;
  }
  .stepper .unit-text {
    font-size: 13px;
    color: var(--bb-muted);
    min-width: 22px;
  }
  /* A note in a dialog: what else to know. */
  .dlg-body .dlg-note {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 13px;
    line-height: 18px;
    color: var(--bb-text);
  }
  .dlg-note .icon {
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 1px;
    color: var(--bb-info);
  }
  .dlg-note.warning .icon {
    color: var(--bb-warn);
  }
  /* The filament dialog: the material, then the colours. The select draws
     its own arrow, in the theme's colours. */
  .select {
    position: relative;
    flex: 1;
    min-width: 0;
    max-width: 200px;
    display: flex;
  }
  .select select {
    flex: 1;
    min-width: 0;
    appearance: none;
    padding: 7px 30px 7px 10px;
    border: 1px solid var(--bb-line);
    border-radius: 8px;
    font: inherit;
    font-size: 14px;
    color: var(--bb-text);
    background: var(--bb-surface);
    cursor: pointer;
    text-overflow: ellipsis;
  }
  /* The prompt to choose reads as one, not as a value. */
  .select select.unset {
    color: var(--bb-muted);
  }
  .select select:focus-visible {
    outline: 2px solid var(--bb-ring);
    outline-offset: 2px;
  }
  .select option {
    color: var(--bb-text);
    background: var(--bb-surface);
  }
  .select .icon {
    position: absolute;
    right: 7px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--bb-muted);
    pointer-events: none;
  }
  .colors {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .field-label {
    font-size: 14px;
  }
  .palette {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* Eight colours a row; the one outside the palette below them, in the
     same grid, beside "Other color". */
  .swatches,
  .other-row {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 8px;
  }
  /* A colour: outlined like a spool, so white and black show on every
     theme; the chosen one has a ring. */
  .pal {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--c);
    cursor: pointer;
  }
  .pal::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bb-text) 24%, transparent);
    pointer-events: none;
  }
  .pal.outline::after {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bb-text) 50%, transparent);
  }
  .pal[aria-checked="true"] {
    box-shadow:
      0 0 0 2px var(--bb-surface),
      0 0 0 4px var(--bb-accent);
  }
  .pal:focus-visible {
    outline-offset: 5px;
  }
  .other-row {
    align-items: center;
  }
  /* The browser's colour picker lies over the button and opens on a tap. */
  .other-color {
    position: relative;
    grid-column: 1 / -1;
    justify-self: start;
    cursor: pointer;
  }
  .other-row .pal + .other-color {
    grid-column: 2 / -1;
  }
  .other-color input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    cursor: pointer;
  }
  .other-color:focus-within {
    outline: 2px solid var(--bb-ring);
    outline-offset: 2px;
  }

  /* Wide: a bigger picture, the temperatures in one row, slots in two columns. */
  @container (min-width: 520px) {
    .picture {
      width: 132px;
      height: 132px;
    }
    .job-name {
      font-size: 16px;
    }
    .pct {
      font-size: 26px;
      line-height: 28px;
    }
    .temps.n2,
    .temps.n3,
    .temps.n4 {
      grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr));
    }
    .temps.n2 {
      --cols: 2;
    }
    .temps.n3 {
      --cols: 3;
    }
    .ctl-buttons .btn,
    .ctl-buttons .btn.skip {
      flex: none;
      min-width: 120px;
    }
    .ctl-buttons .btn.skip {
      min-height: 36px;
      margin-left: auto;
    }
    .fan-label.short {
      display: none;
    }
    .fan-label.full {
      display: inline;
    }
    .slots {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .live,
    .live-holder {
      max-height: 360px;
    }
    .control {
      grid-template-columns: auto auto auto;
      grid-template-areas: "step step step" "pad bed ext";
    }
    .axis-col.ext {
      height: 100%;
      align-items: center;
    }
    .ext-buttons {
      flex-direction: column;
      flex: 1;
    }
    .ext-buttons .btn.stack {
      flex-direction: column;
      width: 84px;
      font-size: 12px;
    }
  }
  /* Very wide: the heaters and the detections in two columns -- narrower,
     their names would not fit. */
  @container (min-width: 760px) {
    .det-rows {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 24px;
    }
    .det-rows > .det-row + .det-row {
      border-top: 0;
    }
    .det-rows > .det-row:nth-child(n + 3) {
      border-top: 1px solid var(--bb-divider);
    }
    .heat-rows {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 24px;
    }
    .heat-row + .heat-row {
      border-top: 0;
    }
    .heat-row:nth-child(n + 3) {
      border-top: 1px solid var(--bb-divider);
    }
  }

  /* Very narrow: less padding; the speed names and the step label get the room. */
  @container (max-width: 340px) {
    ha-card {
      --bb-inset: 12px;
    }
    .head {
      padding: 12px 12px 8px;
      gap: 8px;
    }
    .tabs {
      margin: 0 12px 4px;
    }
    .body {
      padding: 10px 12px 14px;
    }
    .picture {
      width: 80px;
      height: 80px;
    }
    .seg button {
      font-size: 12px;
      padding: 6px 2px;
    }
    .seg.speeds {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    /* The heaters' names keep their room: no icon, smaller steppers. */
    .heating {
      padding: 6px 8px 4px;
    }
    .heat-row {
      gap: 4px;
    }
    .heat-label .icon {
      display: none;
    }
    .heat-now {
      padding-left: 0;
    }
    .heat-row .btn.icon-only {
      width: 30px;
      height: 30px;
      min-height: 30px;
    }
    .heat-row .heat-off-space {
      width: 30px;
      height: 30px;
      min-height: 30px;
    }
    .heat-target {
      min-width: 54px;
      font-size: 14px;
    }
    .pad {
      grid-template-columns: repeat(3, 46px);
      grid-template-rows: repeat(3, 46px);
    }
    .pad .btn {
      width: 46px;
      height: 46px;
    }
    .btn.stack {
      width: 76px;
    }
  }

  /* A phone: a notice's button below its text, the notice's full width. */
  @container (max-width: 400px) {
    .callout .btn {
      flex: 1 0 100%;
      margin: 4px 0 0;
    }
  }

  /* A half-width card: the control view in one column -- the step, the pad,
     the bed, the extruder --, smaller pad buttons, a heater's name and
     temperature above its steppers, two temperature tiles a row. */
  @container (max-width: 280px) {
    /* The print controls at their own width, wrapping as wholes: no label on two lines beside another. */
    .ctl-buttons .btn {
      flex: 1 1 auto;
    }
    /* The plugs' rows: the text on its line, the switch or Run under it, at
       the end; the switch-off's row no longer indented. */
    .p-row {
      flex-wrap: wrap;
      row-gap: 4px;
    }
    .p-row .p-text {
      flex-basis: calc(100% - 30px);
    }
    .p-row > .btn,
    .p-row > .det-switch {
      margin-left: auto;
    }
    .p-auto,
    .p-set {
      padding-left: 0;
    }
    /* A slot's actions under its name, its sub line wrapping: "In use" in
       whole words. */
    .slot {
      flex-wrap: wrap;
    }
    .slot-main {
      flex: 1 0 100%;
    }
    .slot .btn:not(.edit) {
      flex: 1 0 auto;
    }
    .slot-sub {
      white-space: normal;
    }
    /* The step's three choices on a line of their own: "10 mm" never cut. */
    .step-row {
      flex-wrap: wrap;
    }
    .step-row .seg {
      order: 2;
      flex: 1 0 100%;
    }
    .step-row .live-btn {
      margin-left: auto;
    }
    .temps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    /* The steppers under the name: room before the line to the next heater. */
    .heat-row {
      grid-template-columns: minmax(0, 1fr) auto;
      padding-bottom: 8px;
    }
    .heat-row + .heat-row {
      padding-top: 6px;
    }
    /* The name and Off on a row, the steppers below with the whole width:
       beside a thumb's 44 px Off they would shrink under 24 px. */
    .heat-name {
      grid-column: 1;
      grid-row: 1;
    }
    .heat-row .heat-off {
      grid-column: 2;
      grid-row: 1;
    }
    .heat-row .heat-off-space {
      grid-column: 2;
      grid-row: 1;
    }
    .heat-set {
      grid-column: 1 / -1;
    }
    .heat-now {
      white-space: normal;
    }
    .heat-target {
      min-width: 44px;
    }
    .control {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "step" "pad" "bed" "ext";
      justify-content: stretch;
      justify-items: center;
    }
    .step-row,
    .axis-col.ext {
      justify-self: stretch;
    }
    .pad {
      grid-template-columns: repeat(3, 40px);
      grid-template-rows: repeat(3, 40px);
    }
    .pad .btn {
      width: 40px;
      height: 40px;
    }
    .axis-col.bed {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
      justify-self: stretch;
      height: auto;
    }
    .axis-col.bed .axis-label {
      flex-basis: 100%;
      justify-content: center;
    }
  }

  /* A narrow card (260 px and less, from a desktop's half width down):
     every action below its text at full width, the job's words below its
     picture. A narrow live view: the chips
     go to the bottom, clear of the gear and the close button (chips are
     never cut). */
  @container (max-width: 260px) {
    .live-tags {
      top: auto;
      bottom: 8px;
      /* Clear of the full-screen icon in the corner. */
      right: 46px;
      flex-wrap: wrap-reverse;
    }
    .job {
      flex-wrap: wrap;
      justify-content: center;
    }
    .job-info {
      flex: 1 0 100%;
    }
    .seg button {
      padding: 6px 2px;
      font-size: 12px;
      white-space: normal;
    }
    .ext-buttons {
      flex-direction: column;
    }
    .nozzle-row {
      flex-wrap: wrap;
    }
    .nozzle-row .seg {
      flex: 1 0 100%;
    }
    .ctl-buttons .btn,
    .drying > .btn {
      white-space: normal;
    }
    .det-head {
      flex-wrap: wrap;
      row-gap: 0;
    }
    .det-chevron {
      margin-left: auto;
    }
    .callout {
      padding: 8px 10px;
    }
    .callout > .icon {
      display: none;
    }
    .callout > span {
      flex-basis: 100%;
    }
    .callout .btn {
      padding: 6px 10px;
      white-space: normal;
    }
    /* The backup's "Unknown" under its text, the choice under it. */
    .backup .det-row.choosing .det-text {
      flex: 1 0 100%;
    }
  }

  /* A half-width card on a phone (under 200 px): the name on a row of its
     own in whole words with the chips and the HMS line under it, one
     temperature a row, the tabs as icons. */
  @container (max-width: 200px) {
    .head {
      flex-wrap: wrap;
      row-gap: 6px;
    }
    .names {
      flex: 1 0 100%;
      order: -1;
    }
    .name {
      overflow-wrap: break-word;
    }
    .head .dot {
      margin-right: auto;
    }
    .hms-line-more {
      display: none;
    }
    .tabs {
      margin: 0 8px 4px;
    }
    /* The names do not fit: the tabs show icons, the names stay for a
       screen reader and as a tooltip -- never broken mid-word. */
    .tabs button {
      position: relative;
      min-width: 0;
      display: flex;
      justify-content: center;
      padding: 6px 2px;
    }
    .tabs .tab-icon {
      display: inline-flex;
    }
    /* An AMS head's lines wrap rather than running into the chevron; no
       AMS HT's width here, the unit takes the room there is. */
    .ams-line,
    .ams-env {
      height: auto;
      flex-wrap: wrap;
      row-gap: 2px;
    }
    .ams-fill.with-ht .ams-head {
      min-width: 0;
    }
    /* An AMS unit's colours two a row: the fourth stays in its box. */
    .ams-slots {
      display: grid;
      grid-template-columns: repeat(2, auto);
      justify-content: start;
    }
    button.ams-strip {
      padding-right: 28px;
    }
    .tabs .tab-text {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .temps,
    .temps.n1,
    .temps.n2,
    .temps.n4,
    .temps.dual {
      grid-template-columns: minmax(0, 1fr);
    }
    .heat-head {
      flex-wrap: wrap;
    }
  }

  /* A thumb gets 44 px for the light, the menu and a heater's off button --
     after the narrow card's smaller steppers, so that it wins there too. */
  @media (pointer: coarse) {
    .head .icon-btn {
      width: 44px;
      height: 44px;
    }
    .heat-row .btn.heat-off {
      width: 44px;
      height: 44px;
      min-height: 44px;
    }
    .heat-row .heat-off-space {
      width: 44px;
      height: 44px;
      min-height: 44px;
    }
    /* With the 44 px buttons beside it the name gets its own row a little
       earlier, in whole words. */
    @container (max-width: 220px) {
      .head {
        flex-wrap: wrap;
        row-gap: 6px;
      }
      .names {
        flex: 1 0 100%;
        order: -1;
      }
      .name {
        overflow-wrap: break-word;
      }
      .head .dot {
        margin-right: auto;
      }
    }
  }

  /* Nothing moves for those who ask their system for less motion. */
  @media (prefers-reduced-motion: reduce) {
    .menu,
    .btn.pending > .icon,
    .icon-btn.pending > .icon,
    .fan.on .icon,
    .ams-activity .icon,
    .activity .icon,
    .activity-bar,
    .check-spinner,
    .sent {
      animation: none;
    }
    .bar span,
    .det-chevron,
    .toggle,
    .toggle .knob,
    .unit-fold {
      transition: none;
    }
  }
`;
