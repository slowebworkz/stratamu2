import { describe, expect, it } from "vitest";
import { getGlobalThis } from "../node/index.js";

describe("getGlobalThis", () => {
  it("returns an object with globalThis properties", () => {
    const g = getGlobalThis();
    // basic sanity: it should have setTimeout in Node/browser
    expect(typeof (g as any).setTimeout).toBe("function");
  });
});
