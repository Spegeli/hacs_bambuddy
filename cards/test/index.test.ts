import { describe, expect, it } from "vitest";

describe("the bundle's entry point", () => {
  it("loads", async () => {
    await expect(import("../src/index")).resolves.toBeDefined();
  });
});
