import { describe, expect, it } from "vitest"

import { LineBuffer } from "../src/line-buffer.ts"

describe("LineBuffer", () => {
  it("returns a line once its terminator arrives", () => {
    const buffer = new LineBuffer()
    expect(buffer.push("look\n")).toEqual(["look"])
  })

  it("accepts CRLF and strips the CR", () => {
    expect(new LineBuffer().push("look\r\n")).toEqual(["look"])
  })

  it("returns several lines from one chunk", () => {
    expect(new LineBuffer().push("look\nnorth\r\nsay hi\n")).toEqual(["look", "north", "say hi"])
  })

  it("holds an unfinished line until it is completed", () => {
    const buffer = new LineBuffer()
    expect(buffer.push("lo")).toEqual([])
    expect(buffer.push("ok")).toEqual([])
    expect(buffer.push("\n")).toEqual(["look"])
  })

  it("handles a CRLF split across chunks", () => {
    const buffer = new LineBuffer()
    expect(buffer.push("look\r")).toEqual([])
    expect(buffer.push("\nnorth\n")).toEqual(["look", "north"])
  })

  it("keeps empty lines", () => {
    expect(new LineBuffer().push("\n\r\n")).toEqual(["", ""])
  })
})
