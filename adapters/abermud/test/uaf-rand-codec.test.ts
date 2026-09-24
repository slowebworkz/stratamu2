import { describe, expect, it } from "vitest"

import {
  RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN,
  UafRandCodec,
  uafRandRecordSize,
} from "../src/persistence/uaf-rand-codec.ts"

/** A fresh `mud/makeuaf.c` run produces one "Debugger" record with these exact field values --
 * a grounded fixture from the recovered source, not arbitrary test data. (Whether every
 * historical installation's `install2.sh` actually ran `makeuaf.c` this same way is a separate,
 * broader claim this doesn't make.) */
const DEBUGGER_PERSONA = { name: "Debugger", score: 0, strength: 100, sex: 0, level: 10033 }

describe("UafRandCodec", () => {
  describe("under the reference (LP64) layout", () => {
    const codec = new UafRandCodec(RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN)

    it("round-trips the Debugger persona from a fresh makeuaf.c run", () => {
      expect(codec.decode(codec.encode(DEBUGGER_PERSONA))).toEqual(DEBUGGER_PERSONA)
    })

    it("round-trips negative long fields", () => {
      const persona = { name: "bob", score: -5, strength: 10, sex: 1, level: 1 }

      expect(codec.decode(codec.encode(persona))).toEqual(persona)
    })

    it("encodes to 48 bytes: 16-byte name + four 8-byte longs", () => {
      const record = codec.encode({ name: "alice", score: 0, strength: 0, sex: 0, level: 1 })

      expect(record).toHaveLength(48)
      expect(record).toHaveLength(uafRandRecordSize(RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN))
    })
  })

  describe("under a 32-bit layout", () => {
    const codec = new UafRandCodec({ longBytes: 4, endian: "little" })

    it("round-trips a persona", () => {
      const persona = { name: "alice", score: 1200, strength: 14, sex: 0, level: 3 }

      expect(codec.decode(codec.encode(persona))).toEqual(persona)
    })

    it("encodes to 32 bytes: 16-byte name + four 4-byte longs", () => {
      const record = codec.encode({ name: "alice", score: 0, strength: 0, sex: 0, level: 1 })

      expect(record).toHaveLength(32)
    })
  })

  describe("under a big-endian layout", () => {
    const codec = new UafRandCodec({ longBytes: 4, endian: "big" })

    it("round-trips a persona", () => {
      const persona = { name: "alice", score: 1200, strength: 14, sex: 0, level: 3 }

      expect(codec.decode(codec.encode(persona))).toEqual(persona)
    })
  })

  describe("name field", () => {
    const codec = new UafRandCodec(RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN)

    it("null-pads a name shorter than the 16-byte field", () => {
      const record = codec.encode({ name: "al", score: 0, strength: 0, sex: 0, level: 1 })

      expect(record.subarray(0, 16).toString("ascii").replace(/\0+$/, "")).toBe("al")
      expect(record[2]).toBe(0)
      expect(record[15]).toBe(0)
    })

    it("truncates a name longer than the 16-byte field", () => {
      const record = codec.encode({
        name: "a-name-longer-than-sixteen-bytes",
        score: 0,
        strength: 0,
        sex: 0,
        level: 1,
      })

      expect(record.subarray(0, 16).toString("ascii")).toBe("a-name-longer-th")
    })

    it("does not enforce AberMUD's own 10-character game rule -- that is validname()'s job, not the codec's", () => {
      // 11-15 characters fits the 16-byte field even though `validname()` would reject it as a
      // character name. The codec is a data-format concern only.
      const persona = {
        name: "elevenchars",
        score: 0,
        strength: 0,
        sex: 0,
        level: 1,
      }

      expect(codec.decode(codec.encode(persona))).toEqual(persona)
    })

    it("decodes to the first NUL, not the last -- real bytes past it are not guaranteed zero", () => {
      // Genuine captured bytes: running mud/makeuaf.c's compiled output twice produced different
      // garbage after "Debugger"'s NUL terminator both times (struct uaf_being is a local,
      // never zero-initialized in C). This is one of those two real captures, not a synthetic
      // example -- a decoder that stops only at a *trailing* run of NULs, rather than the first
      // NUL, would incorrectly read this name as "Debugger\0\b!\xBB\xF7\x7F" instead of
      // "Debugger".
      const record = Buffer.from(
        "4465627567676572000821bbf77f00000000000000000000640000000000000000000000000000003127000000000000",
        "hex",
      )

      expect(codec.decode(record).name).toBe("Debugger")
    })
  })

  describe("against real compiled reference bytes", () => {
    const codec = new UafRandCodec(RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN)

    /**
     * Not derived from this codec, and not hand-computed from the struct layout either:
     * `mud/makeuaf.c` (github.com/DavidKinder/AberMUD2) was compiled and run for real
     * (`gcc -o makeuaf makeuaf.c && ./makeuaf > uaf.rand`, on x86_64, LP64, little-endian), and
     * these are its actual output bytes -- genuine reference data, not this codec re-deriving
     * itself. Comparing byte-for-byte against a real compiled binary is a stronger claim than
     * "this is a faithful implementation of the format we inferred from the C struct": it is
     * confirmation that the inference was right, for this one ABI.
     *
     * One deliberate substitution: running `makeuaf` twice produced *different* bytes after the
     * name's NUL terminator (positions 9-15) -- `struct uaf_being x` is a local, never
     * zero-initialized in C, so whatever was already on the stack showed through. Those 7 bytes
     * below are zeroed instead of the genuine (non-deterministic) captured bytes, matching what
     * this codec's own `encode()` deliberately produces; the numeric fields (bytes 16-47) are the
     * real captured bytes, unchanged, and are identical between the two captured runs.
     */
    const DEBUGGER_REFERENCE_BYTES = Buffer.from(
      "446562756767657200000000000000000000000000000000640000000000000000000000000000003127000000000000",
      "hex",
    )

    it("decodes real compiled reference bytes to the Debugger persona", () => {
      expect(codec.decode(DEBUGGER_REFERENCE_BYTES)).toEqual(DEBUGGER_PERSONA)
    })

    it("encodes the Debugger persona to those same reference bytes", () => {
      expect(codec.encode(DEBUGGER_PERSONA)).toEqual(DEBUGGER_REFERENCE_BYTES)
    })
  })
})
