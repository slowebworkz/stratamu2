import { describe, expect, it } from "vitest"

import { Timestamp } from "./timestamp.ts"

// The limits of a JavaScript Date, in milliseconds from the Unix epoch.
const DATE_MAX = 8_640_000_000_000_000n
const DATE_MIN = -DATE_MAX

describe("Timestamp.toDate", () => {
  it("converts a timestamp to the same instant", () => {
    expect(Timestamp.fromMilliseconds(0n).toDate().getTime()).toBe(0)
    expect(Timestamp.fromMilliseconds(1_700_000_000_000n).toDate().toISOString()).toBe(
      "2023-11-14T22:13:20.000Z",
    )
    expect(Timestamp.fromMilliseconds(-1000n).toDate().toISOString()).toBe(
      "1969-12-31T23:59:59.000Z",
    )
  })

  it("round-trips through a Date", () => {
    const date = new Date("2026-09-20T12:34:56.789Z")

    expect(Timestamp.fromDate(date).toDate().getTime()).toBe(date.getTime())
  })

  it("accepts the limits of the Date range", () => {
    expect(Timestamp.fromMilliseconds(DATE_MAX).toDate().getTime()).toBe(Number(DATE_MAX))
    expect(Timestamp.fromMilliseconds(DATE_MIN).toDate().getTime()).toBe(Number(DATE_MIN))
  })

  it("throws just outside the Date range instead of returning an Invalid Date", () => {
    // Both are safe integers, so the range check is what has to catch them.
    expect(() => Timestamp.fromMilliseconds(DATE_MAX + 1n).toDate()).toThrow(RangeError)
    expect(() => Timestamp.fromMilliseconds(DATE_MIN - 1n).toDate()).toThrow(RangeError)
  })

  it("throws for a value too large for a number at all", () => {
    expect(() => Timestamp.fromMilliseconds(2n ** 70n).toDate()).toThrow(RangeError)
  })

  it("makes toISOString throw the same way", () => {
    expect(() => Timestamp.fromMilliseconds(DATE_MAX + 1n).toISOString()).toThrow(RangeError)
  })
})

describe("Timestamp construction", () => {
  it("accepts a whole number of milliseconds", () => {
    expect(Timestamp.fromNumber(1500).milliseconds).toBe(1500n)
  })

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])("rejects %s", value => {
    expect(() => Timestamp.fromNumber(value)).toThrow(RangeError)
  })

  it("rejects an invalid Date", () => {
    expect(() => Timestamp.fromDate(new Date(Number.NaN))).toThrow(RangeError)
  })
})

describe("Timestamp values", () => {
  it("compares by value", () => {
    const a = Timestamp.fromMilliseconds(1n)
    const b = Timestamp.fromMilliseconds(2n)

    expect(a.compare(b)).toBe(-1)
    expect(b.compare(a)).toBe(1)
    expect(a.compare(Timestamp.fromMilliseconds(1n))).toBe(0)
    expect(a.isBefore(b)).toBe(true)
    expect(b.isAfter(a)).toBe(true)
    expect(a.equals(Timestamp.fromMilliseconds(1n))).toBe(true)
  })

  it("adds and subtracts milliseconds", () => {
    const start = Timestamp.fromMilliseconds(1000n)

    expect(start.add(5000n).milliseconds).toBe(6000n)
    expect(start.subtract(1000n).milliseconds).toBe(0n)
  })

  it("serialises as a string of milliseconds", () => {
    expect(JSON.stringify({ at: Timestamp.fromMilliseconds(1000n) })).toBe('{"at":"1000"}')
  })
})
