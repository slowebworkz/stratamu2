import { entityId } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import {
  refusal,
  renderDropped,
  renderInventory,
  renderOutput,
  renderRefusal,
  renderRoom,
  renderSpeech,
  renderTaken,
} from "../src/output.ts"

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
    expect(renderRefusal(refusal("get-what"))).toBe("Get what ?")
    expect(renderRefusal(refusal("drop-what"))).toBe("Drop what ?")
    expect(renderRefusal(refusal("not-here"))).toBe("That is not here.")
    expect(renderRefusal(refusal("not-takeable"))).toBe("You can't take that!")
    expect(renderRefusal(refusal("not-carrying"))).toBe("You are not carrying that.")
  })
})

describe("renderTaken", () => {
  it("gives the actor no detail, verbatim AberMUD II wording", () => {
    expect(
      renderTaken({ kind: "taken", perspective: "actor", actor: "alice", item: "sword" }),
    ).toBe("Ok...")
  })

  it("names the actor and item to everyone else", () => {
    expect(
      renderTaken({ kind: "taken", perspective: "observer", actor: "alice", item: "sword" }),
    ).toBe("alice takes the sword")
  })
})

describe("renderDropped", () => {
  it("gives the actor no detail, verbatim AberMUD II wording", () => {
    expect(
      renderDropped({ kind: "dropped", perspective: "actor", actor: "alice", item: "sword" }),
    ).toBe("OK..")
  })

  it("names the actor and item to everyone else, with the trailing blank line the source has", () => {
    expect(
      renderDropped({ kind: "dropped", perspective: "observer", actor: "alice", item: "sword" }),
    ).toBe("alice drops the sword.\n")
  })
})

describe("renderInventory", () => {
  it("lists carried items", () => {
    expect(renderInventory({ kind: "inventory", items: ["sword", "shield"] })).toBe(
      "You are carrying\nsword shield",
    )
  })

  it("says Nothing when carrying nothing", () => {
    expect(renderInventory({ kind: "inventory", items: [] })).toBe("You are carrying\nNothing")
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
