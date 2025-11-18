import { describe, expect, it } from "vitest";
import { RingBuffer } from "../data/index.js";

describe("RingBuffer", () => {
  it("pushes and returns items in order", () => {
    const rb = new RingBuffer<number>(3);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    expect(rb.toArray()).toEqual([1, 2, 3]);
  });

  it("overwrites oldest when full", () => {
    const rb = new RingBuffer<number>(3);
    rb.pushMany([1, 2, 3, 4]);
    expect(rb.toArray()).toEqual([2, 3, 4]);
  });

  it("pushMany with batch larger than capacity keeps last N items", () => {
    const rb = new RingBuffer<number>(4);
    const batch = [1, 2, 3, 4, 5, 6];
    rb.pushMany(batch);
    expect(rb.toArray()).toEqual([3, 4, 5, 6]);
  });

  it("pushMany wraps correctly when end near buffer end", () => {
    const rb = new RingBuffer<number>(5);
    // fill some then set end near the end
    rb.pushMany([10, 20, 30]);
    // simulate state where end is near tail by pushing a couple more
    rb.push(40);
    // Now pushMany with small batch that wraps
    rb.pushMany([1, 2, 3]);
    // Expected sequence depends on previous pushes: result should be oldest->newest
    const arr = rb.toArray();
    // ensure array length <= capacity and contains recently pushed values
    expect(arr.length).toBeLessThanOrEqual(5);
    expect(arr.slice(-3)).toEqual([1, 2, 3]);
  });

  it("peekOldest and peekNewest work", () => {
    const rb = new RingBuffer<string>(2);
    expect(rb.peekOldest()).toBeUndefined();
    expect(rb.peekNewest()).toBeUndefined();
    rb.push("a");
    expect(rb.peekOldest()).toBe("a");
    expect(rb.peekNewest()).toBe("a");
    rb.push("b");
    expect(rb.peekOldest()).toBe("a");
    expect(rb.peekNewest()).toBe("b");
    rb.push("c");
    expect(rb.peekOldest()).toBe("b");
    expect(rb.peekNewest()).toBe("c");
  });

  it("iterator iterates oldest->newest", () => {
    const rb = new RingBuffer<number>(3);
    rb.pushMany([10, 20, 30, 40]);
    const arr = [...rb];
    expect(arr).toEqual([20, 30, 40]);
  });

  it("clear resets state", () => {
    const rb = new RingBuffer<number>(2);
    rb.pushMany([1, 2]);
    rb.clear();
    expect(rb.size).toBe(0);
    expect(rb.toArray()).toEqual([]);
  });

  it("popOldest, popNewest and drain behave correctly", () => {
    const rb = new RingBuffer<number>(4);
    rb.pushMany([1, 2, 3, 4]);
    expect(rb.popOldest()).toBe(1);
    expect(rb.toArray()).toEqual([2, 3, 4]);
    expect(rb.popNewest()).toBe(4);
    expect(rb.toArray()).toEqual([2, 3]);

    // drain remaining
    const drained = rb.drain();
    expect(drained).toEqual([2, 3]);
    expect(rb.size).toBe(0);

    // drain with max parameter
    rb.pushMany([5, 6, 7, 8]);
    const drained2 = rb.drain(2);
    expect(drained2).toEqual([5, 6]);
    expect(rb.toArray()).toEqual([7, 8]);
  });

  it("handles capacity of 1 correctly", () => {
    const buf = new RingBuffer<number>(1);
    buf.push(42);
    expect(buf.toArray()).toEqual([42]);
    buf.push(99);
    expect(buf.toArray()).toEqual([99]);
  });

  it("returns an empty array if no items were pushed", () => {
    const buf = new RingBuffer<number>(3);
    expect(buf.size).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it("supports partial fill before reaching capacity", () => {
    const buf = new RingBuffer<number>(5);
    buf.push(10);
    buf.push(20);
    expect(buf.size).toBe(2);
    expect(buf.toArray()).toEqual([10, 20]);
  });

  it("handles non-primitive items", () => {
    type Entry = { id: number; msg: string };
    const buf = new RingBuffer<Entry>(2);
    buf.push({ id: 1, msg: "a" });
    buf.push({ id: 2, msg: "b" });
    expect(buf.toArray()).toEqual([
      { id: 1, msg: "a" },
      { id: 2, msg: "b" },
    ]);
    buf.push({ id: 3, msg: "c" });
    expect(buf.toArray()).toEqual([
      { id: 2, msg: "b" },
      { id: 3, msg: "c" },
    ]);
  });

  it("pushMany accepts TypedArray (Uint8Array) fast-path", () => {
    const buf = new RingBuffer<number>(4);
    const ta = new Uint8Array([1, 2, 3, 4, 5]);
    // TypeScript typing requires a cast here for Iterable, but runtime should treat it as array-like
    buf.pushMany(ta as unknown as Iterable<number>);
    expect(buf.toArray()).toEqual([2, 3, 4, 5]);
  });
});
