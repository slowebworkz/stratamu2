import { describe, expect, it, vi } from "vitest";
import { SafeEmitter } from "../events/safe-emitter-3.js";

type EM = {
  foo: [number];
  bar: [string];
};

class E extends SafeEmitter<EM> {}

describe("SafeEmitter.getEventMetrics", () => {
  it("returns listener counts and safety stats", async () => {
    const e = new E();
    const listener = vi.fn();
    e.on("foo", listener);
    const metrics = e.getEventMetrics();
    expect(metrics.listenerCounts.total).toBeGreaterThanOrEqual(0);
    // per-event count should be present for tracked events
    expect(typeof metrics.listenerCounts.foo).toBe("number");
    expect(metrics.safety.capacity).toBeGreaterThanOrEqual(0);
    expect(typeof metrics.safety.enabled).toBe("boolean");
  });
});
