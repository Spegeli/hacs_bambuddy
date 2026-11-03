// The roving focus's keys, one helper for the menu, the tabs and the groups.
import { describe, expect, it } from "vitest";

import { nextIndex } from "../src/parts";

describe("a roving focus's next place", () => {
  it("moves along its axes and wraps around", () => {
    expect(nextIndex("ArrowDown", 2, 3, "vertical")).toBe(0);
    expect(nextIndex("ArrowUp", 0, 3, "vertical")).toBe(2);
    expect(nextIndex("ArrowRight", 1, 3, "horizontal")).toBe(2);
    expect(nextIndex("ArrowLeft", 0, 3, "horizontal")).toBe(2);
    expect(nextIndex("ArrowDown", 0, 3, "both")).toBe(1);
    expect(nextIndex("ArrowLeft", 1, 3, "both")).toBe(0);
    expect([nextIndex("Home", 2, 3, "both"), nextIndex("End", 0, 3, "both")]).toEqual([0, 2]);
  });

  it("leaves the other axis and other keys alone", () => {
    expect(nextIndex("ArrowRight", 0, 3, "vertical")).toBeUndefined();
    expect(nextIndex("ArrowDown", 0, 3, "horizontal")).toBeUndefined();
    expect(nextIndex("Enter", 0, 3, "both")).toBeUndefined();
  });

  it("starts from nothing focused as the menu did", () => {
    expect(nextIndex("ArrowDown", -1, 3, "vertical")).toBe(0);
    expect(nextIndex("ArrowUp", -1, 3, "vertical")).toBe(1);
  });
});
