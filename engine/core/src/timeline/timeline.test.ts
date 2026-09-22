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
    timeline.insert("a", 5)
    timeline.insert("b", 5)
    timeline.insert("c", 5)

    expect(takeAll(timeline, 5)).toEqual(["a", "b", "c"])
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
})
