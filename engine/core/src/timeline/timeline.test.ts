import { describe, expect, it } from "vitest"

import { Timeline } from "./timeline.ts"

function takeAll(timeline: Timeline<string>, now: number): string[] {
  const taken: string[] = []
  for (let item = timeline.takeDue(now); item; item = timeline.takeDue(now)) {
    taken.push(item)
  }
  return taken
}

describe("Timeline", () => {
  it("returns items in due order", () => {
    const timeline = new Timeline<string>()
    timeline.insert("late", 20)
    timeline.insert("early", 10)
    timeline.insert("first", 0)

    expect(takeAll(timeline, 20)).toEqual(["first", "early", "late"])
  })

  it("keeps items due at the same time in insertion order", () => {
    const timeline = new Timeline<string>()
    // Enough items that a heap's natural pop order, with no tiebreaker, would not coincide with
    // insertion order by chance: verified separately that as few as three does not expose this.
    const letters = "abcdefghijklmnop".split("")
    for (const letter of letters) {
      timeline.insert(letter, 5)
    }

    expect(takeAll(timeline, 5)).toEqual(letters)
  })

  it("holds back items that are not yet due", () => {
    const timeline = new Timeline<string>()
    timeline.insert("later", 10)

    expect(timeline.takeDue(9)).toBeUndefined()
    expect(timeline.nextDueAt()).toBe(10)
    expect(timeline.takeDue(10)).toBe("later")
    expect(timeline.nextDueAt()).toBeUndefined()
  })

  it("removes an item, and reports whether it was there", () => {
    const timeline = new Timeline<string>()
    timeline.insert("a", 1)
    timeline.insert("b", 2)

    expect(timeline.remove("a")).toBe(true)
    expect(timeline.remove("a")).toBe(false)
    expect(timeline.size).toBe(1)
    expect(takeAll(timeline, 9)).toEqual(["b"])
  })

  it("reflects a removal in size immediately, before the item would otherwise be looked at", () => {
    const timeline = new Timeline<string>()
    timeline.insert("first", 1)
    timeline.insert("last", 9)

    // "last" sits behind "first" and is never peeked at by this call, but size must already
    // be accurate: it cannot depend on the removed entry having been discarded from the heap.
    expect(timeline.remove("last")).toBe(true)

    expect(timeline.size).toBe(1)
  })

  it("skips a removed item even when it was the earliest, revealing the next one", () => {
    const timeline = new Timeline<string>()
    timeline.insert("first", 1)
    timeline.insert("second", 2)
    timeline.remove("first")

    expect(timeline.nextDueAt()).toBe(2)
    expect(timeline.takeDue(2)).toBe("second")
  })

  it("empties out correctly when every item is removed rather than taken", () => {
    const timeline = new Timeline<string>()
    timeline.insert("a", 1)
    timeline.insert("b", 2)
    timeline.insert("c", 3)

    timeline.remove("a")
    timeline.remove("b")
    timeline.remove("c")

    expect(timeline.size).toBe(0)
    expect(timeline.nextDueAt()).toBeUndefined()
    expect(timeline.takeDue(999)).toBeUndefined()
  })
})
