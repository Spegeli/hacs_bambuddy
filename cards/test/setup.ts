import { afterAll } from "vitest";

// Home Assistant's app element: the card defines itself once it is there
// (register.ts, whenRegistryReady), as in a loaded frontend.
customElements.define("home-assistant", class extends HTMLElement {});

// A timer still pending when a file's tests end fires after the file's page
// is gone ("window is not defined"), whenever tearing it down takes longer
// than the timer -- as with coverage on a slow runner. A card taken off the
// page keeps its live view for a grace, in case a dashboard puts it back:
// the file waits until every real timer has fired or been cleared. A faked
// timer never reaches these; the clock is the real one even while a test
// fakes performance.
const pending = new Map<unknown, number>();
const realSet = globalThis.setTimeout;
const realClear = globalThis.clearTimeout;
const clock = performance.now.bind(performance);
const LONGEST_WAIT_MS = 10_000;

globalThis.setTimeout = ((handler: (...args: unknown[]) => void, delay = 0, ...args: unknown[]) => {
  const timer = realSet(() => {
    pending.delete(timer);
    handler(...args);
  }, delay);
  pending.set(timer, clock() + delay);
  return timer;
}) as typeof setTimeout;

globalThis.clearTimeout = ((timer?: Parameters<typeof clearTimeout>[0]) => {
  pending.delete(timer);
  realClear(timer);
}) as typeof clearTimeout;

afterAll(async () => {
  const left = Math.max(0, ...pending.values()) - clock();
  if (left > 0) await new Promise((resolve) => realSet(resolve, Math.min(left + 50, LONGEST_WAIT_MS)));
});
