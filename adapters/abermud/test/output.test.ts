import { entityId } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import { refusal, renderRefusal, renderRoom } from "../src/output.ts"

describe("renderRoom", () => {
  it("renders a room with nobody else in it", () => {
    expect(
      renderRoom({ kind: "room", name: "Here", description: "A small starting room.", occupants: [] }),
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
