import { entityId } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import { refusal, renderRefusal, renderOutput, renderRoom, renderSpeech } from "../src/output.ts"

describe("renderRoom", () => {
  it("renders a room with nobody else in it", () => {
    expect(
      renderRoom({
        kind: "room",
        name: "Here",
        description: "A small starting room.",
        occupants: [],
      }),
    ).toBe("Here\nA small starting room.")
  })

  it("renders who else is there", () => {
    expect(
      renderRoom({
        kind: "room",
        name: "There",
        description: "A room further along.",
        occupants: [entityId("bob-player"), entityId("goblin")],
      }),
    ).toBe("There\nA room further along.\nAlso here: bob-player, goblin.")
  })
})

describe("renderRefusal", () => {
  it("words every reason", () => {
    expect(renderRefusal(refusal("not-controlling"))).toBe("you are not controlling a character")
    expect(renderRefusal(refusal("nowhere"))).toBe("you are nowhere")
    expect(renderRefusal(refusal("no-exit"))).toBe("you can't go that way")
    expect(renderRefusal(refusal("target-absent", "bob"))).toBe("bob is not here")
    expect(renderRefusal(refusal("save-unavailable"))).toBe("saving is not available")
    expect(renderRefusal(refusal("nothing-to-save"))).toBe("you have no status to save")
  })
})

describe("renderSpeech", () => {
  const base = { kind: "speech", speaker: "alice", text: "hi" } as const

  it("words say from either side", () => {
    expect(renderSpeech({ ...base, channel: "say", perspective: "speaker" })).toBe('You say, "hi"')
    expect(renderSpeech({ ...base, channel: "say", perspective: "listener" })).toBe(
      'alice says, "hi"',
    )
  })

  it("words tell from either side", () => {
    expect(
      renderSpeech({ ...base, channel: "tell", perspective: "speaker", addressee: "bob" }),
    ).toBe('You tell bob, "hi"')
    expect(renderSpeech({ ...base, channel: "tell", perspective: "listener" })).toBe(
      'alice tells you, "hi"',
    )
  })
})

describe("renderOutput", () => {
  it("words exits, players and saves", () => {
    expect(renderOutput({ kind: "exits", directions: ["north", "east"] })).toBe(
      "obvious exits: north, east",
    )
    expect(renderOutput({ kind: "exits", directions: [] })).toBe("there are no obvious exits")
    expect(renderOutput({ kind: "players", names: ["alice", "bob"] })).toBe("online: alice, bob")
    expect(renderOutput({ kind: "players", names: [] })).toBe("no one else is online")
    expect(renderOutput({ kind: "saved", name: "alice" })).toBe("Saving alice")
  })

  it("dispatches every variant to its own wording", () => {
    expect(renderOutput(refusal("nowhere"))).toBe("you are nowhere")
    expect(
      renderOutput({
        kind: "speech",
        channel: "say",
        perspective: "speaker",
        speaker: "a",
        text: "x",
      }),
    ).toBe('You say, "x"')
    expect(renderOutput({ kind: "room", name: "Here", description: "Small.", occupants: [] })).toBe(
      "Here\nSmall.",
    )
  })
})
