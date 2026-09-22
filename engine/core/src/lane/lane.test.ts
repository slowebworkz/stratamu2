import { describe, expect, it } from "vitest"

import { Lane } from "./lane.ts"

describe("Lane", () => {
  it("has an id", () => {
    expect(new Lane("session-1").id).toBe("session-1")
  })

  it("lists its items in the order they were added", () => {
    const lane = new Lane<string>("l")
    lane.enqueue("a")
    lane.enqueue("b")
    lane.enqueue("c")

    expect([...lane.items()]).toEqual(["a", "b", "c"])
    expect(lane.size).toBe(3)
  })

  it("removes an item from anywhere, and reports whether it was there", () => {
    const lane = new Lane<string>("l")
    lane.enqueue("a")
    lane.enqueue("b")
    lane.enqueue("c")

    expect(lane.remove("b")).toBe(true)
    expect(lane.remove("b")).toBe(false)
    expect([...lane.items()]).toEqual(["a", "c"])
  })
})
