import { describe, expect, it } from "vitest"

import { exits, look, move, say, tell } from "../src/commands/index.ts"
import { parseAberMUD } from "../src/parser.ts"
import { testSession } from "./fixtures/session.ts"

describe("parseAberMUD", () => {
  const session = testSession("session-1", "alice")

  it("parses LOOK, and its L abbreviation", () => {
    expect(parseAberMUD({ session, raw: "look" })).toEqual([{ kind: look, input: { session } }])
    expect(parseAberMUD({ session, raw: "l" })).toEqual([{ kind: look, input: { session } }])
  })

  it("parses EXITS, and its EX abbreviation", () => {
    expect(parseAberMUD({ session, raw: "exits" })).toEqual([{ kind: exits, input: { session } }])
    expect(parseAberMUD({ session, raw: "ex" })).toEqual([{ kind: exits, input: { session } }])
  })

  it("parses every movement direction and its single-letter alias", () => {
    const directions: ReadonlyArray<[string, string]> = [
      ["north", "north"],
      ["n", "north"],
      ["south", "south"],
      ["s", "south"],
      ["east", "east"],
      ["e", "east"],
      ["west", "west"],
      ["w", "west"],
      ["up", "up"],
      ["u", "up"],
      ["down", "down"],
      ["d", "down"],
    ]
    for (const [raw, direction] of directions) {
      expect(parseAberMUD({ session, raw })).toEqual([
        { kind: move, input: { session, direction } },
      ])
    }
  })

  it("parses GO <direction> and JUMP <direction>", () => {
    expect(parseAberMUD({ session, raw: "go north" })).toEqual([
      { kind: move, input: { session, direction: "north" } },
    ])
    expect(parseAberMUD({ session, raw: "jump north" })).toEqual([
      { kind: move, input: { session, direction: "north" } },
    ])
  })

  it("parses SAY <message>", () => {
    expect(parseAberMUD({ session, raw: "say hello there" })).toEqual([
      { kind: say, input: { session, message: "hello there" } },
    ])
  })

  it("parses TELL <target> <message>", () => {
    expect(parseAberMUD({ session, raw: "tell bob hello there" })).toEqual([
      { kind: tell, input: { session, target: "bob", message: "hello there" } },
    ])
  })

  it("produces no Work for TELL with no message", () => {
    expect(parseAberMUD({ session, raw: "tell bob" })).toEqual([])
  })

  it("produces no Work for input the grammar does not recognize", () => {
    expect(parseAberMUD({ session, raw: "xyzzy" })).toEqual([])
  })
})
