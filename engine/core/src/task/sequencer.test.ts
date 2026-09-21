import { describe, expect, it } from "vitest"

import { TaskSequencer } from "./sequencer.ts"

describe("TaskSequencer", () => {
  it("starts at zero", () => {
    const sequencer = new TaskSequencer()

    expect(sequencer.next()).toBe(0)
  })

  it("returns monotonically increasing sequences", () => {
    const sequencer = new TaskSequencer()

    expect(sequencer.next()).toBe(0)
    expect(sequencer.next()).toBe(1)
    expect(sequencer.next()).toBe(2)
  })

  it("returns independent sequences for each instance", () => {
    const first = new TaskSequencer()
    const second = new TaskSequencer()

    expect(first.next()).toBe(0)
    expect(first.next()).toBe(1)

    expect(second.next()).toBe(0)
    expect(second.next()).toBe(1)
  })
})
