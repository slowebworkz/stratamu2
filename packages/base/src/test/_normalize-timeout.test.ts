import { describe, expect, it } from "vitest";
import { normalizeTimeout } from "../data/index.js";

describe("normalizeTimeout", () => {
  it("parses integers and string numbers", () => {
    expect(normalizeTimeout(100)).toBe(100);
    expect(normalizeTimeout("200")).toBe(200);
  });

  it("rejects fractional values less than 1", () => {
    expect(normalizeTimeout(0.5)).toBeUndefined();
    expect(normalizeTimeout("0.9")).toBeUndefined();
  });

  it("floors fractional >= 1", () => {
    expect(normalizeTimeout(1.9)).toBe(1);
  });

  it("returns undefined for invalid inputs", () => {
    expect(normalizeTimeout(null)).toBeUndefined();
    expect(normalizeTimeout(undefined)).toBeUndefined();
    expect(normalizeTimeout(Number.NaN)).toBeUndefined();
    expect(normalizeTimeout("foo")).toBeUndefined();
  });
});
