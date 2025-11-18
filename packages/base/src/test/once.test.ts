import { describe, expect, it } from "vitest";
import { SafeEmitter } from "../events/safe-emitter-3.js";

describe("SafeEmitter once() cancellation and error handling", () => {
  it("attaches .off and allows cancellation", async () => {
    class E extends SafeEmitter<{ evt: [string] }> {}
    const e = new E();
    let called = false;
    const p = (e.once as any)("evt", async () => {
      called = true;
      return "ok";
    }) as any;
    expect(typeof p.off).toBe("function");
    // calling off should prevent the listener from being invoked
    p.off();
    await (e.emit as any)("evt", "payload");
    // allow microtasks to run
    await new Promise((r) => setTimeout(r, 0));
    expect(called).toBe(false);
  });

  it("supports AbortSignal via options", async () => {
    class E2 extends SafeEmitter<{ evt: [string] }> {}
    const e = new E2();
    const controller = new AbortController();
    let called = false;
    const p = (e.once as any)(
      "evt",
      async () => {
        called = true;
        return "ok";
      },
      { signal: controller.signal },
    ) as any;
    expect(typeof p.off).toBe("function");
    controller.abort();
    await (e.emit as any)("evt", "payload");
    await new Promise((r) => setTimeout(r, 0));
    expect(called).toBe(false);
  });

  it("reports listener errors but still resolves with payload", async () => {
    let reported = false;
    // Small subclass to intercept onListenerError
    class MyEmitter extends SafeEmitter<{ evt: [string] }> {
      protected onListenerError(eventName: any, error: unknown) {
        reported = true;
        super.onListenerError(eventName, error, { type: "once" });
      }
    }
    const e = new MyEmitter();
    const p = (e.once as any)("evt", () => {
      throw new Error("boom");
    }) as Promise<string>;
    // emit and await
    void (e.emit as any)("evt", "payload");
    const result = await p;
    expect(result).toBe("payload");
    expect(reported).toBe(true);
  });
});
