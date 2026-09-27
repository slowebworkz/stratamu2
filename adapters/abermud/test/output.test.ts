import { entityId } from "@stratamu/primitives"
import { describe, expect, it } from "vitest"

import { renderRoom } from "../src/output.ts"

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
