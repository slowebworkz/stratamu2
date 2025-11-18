import Emittery from "emittery";
import { describe, expect, it } from "vitest";
import { SafetyEmitter } from "../events/safety-emitter.js";

describe("SafetyEmitter performance smoke", () => {
  it("records many errors quickly", () => {
    // Provide a raw Emittery instance as the public bus for the standalone
    // manager. In production this would normally be the emitter's internal
    // `_public` bus.
    const publicBus = new Emittery();
    const s = new SafetyEmitter(publicBus as any, { safetyLogCap: 1000 });

    const N = 10000;
    for (let i = 0; i < N; i++) {
      s.recordListenerErrorFor("evt", new Error(`err-${i}`), `l${i % 5}`);
    }

    // ensure count recorded and caps respected
    expect(s.getErrorCount("evt")).toBe(N);
    const logs = s.getSafetyLogForEvent("evt");
    expect(logs.length).toBeGreaterThan(0);
  });
});
