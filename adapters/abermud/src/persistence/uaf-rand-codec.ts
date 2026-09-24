import type { AberMUDPersona } from "./persona.ts"

const NAME_FIELD_SIZE = 16
const LONG_FIELD_COUNT = 4 // score, strength, sex, level

/**
 * The binary ABI a `UafRandCodec` encodes/decodes against. AberMUD's own `struct uaf_being`
 * (`mud/newuaf.c` in the recovered source, github.com/DavidKinder/AberMUD2) --
 *
 *   char p_name[16];
 *   long p_score;
 *   long p_strength;
 *   long p_sex;
 *   long p_level;
 *
 * -- is written with a raw `fwrite(&x,sizeof(PERSONA),1,i)`, so its actual byte layout depends
 * on the compiling platform's `long` width and byte order, neither of which the struct
 * declaration alone specifies. This engine does not get to assume one true answer -- it names
 * the ABI it targets instead.
 */
export interface UafRandLayout {
  /** Bytes per `long` field: 8 for an LP64 target (ordinary x86-64 Linux, the platform the
   * recovered source's own repaired build actually runs on), 4 for a historical 32-bit (ILP32)
   * target. */
  readonly longBytes: 4 | 8
  readonly endian: "little" | "big"
}

/**
 * The layout used by the recovered source when built under an LP64 x86-64 Linux ABI -- `long`
 * is 8 bytes, little-endian. Verified, not assumed: `mud/makeuaf.c` was compiled and actually run
 * (x86_64, LP64, little-endian), and the numeric-field bytes of its output match this codec's
 * `encode()` for the same persona exactly (see `test/uaf-rand-codec.test.ts`'s reference-bytes
 * test). One caveat that same experiment surfaced: running `makeuaf` twice produced different
 * bytes *after* the name's NUL terminator -- `p_name`'s local `struct uaf_being` is never
 * zero-initialized in C, so whatever was already on the stack shows through there. This codec
 * deliberately zero-pads that region instead (see `UafRandCodec.encode`); nothing ever reads
 * past a name's first NUL, so this has no observable effect and is a strictly better default
 * than inheriting undefined memory.
 *
 * This is a statement about *that build*, on this machine, not about the original historical Unix
 * distribution: whether `long` was also 8 bytes on whatever platform AberMUD II first ran on
 * (most likely 32-bit, circa 1988-1990) is a separate, still-open question. A
 * `HISTORICAL_ILP32_*` layout (`longBytes: 4`) can sit alongside this one once that target is
 * actually established; see `UafRandLayout`.
 */
export const RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN: UafRandLayout = {
  longBytes: 8,
  endian: "little",
}

/** The size in bytes of one `uaf.rand` record under a given layout: the 16-byte name field plus
 * four `long` fields (score, strength, sex, level). 48 bytes under
 * `RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN`. */
export function uafRandRecordSize(layout: UafRandLayout): number {
  return NAME_FIELD_SIZE + layout.longBytes * LONG_FIELD_COUNT
}

/**
 * Encodes and decodes one `uaf.rand` record for a given `UafRandLayout`.
 *
 * A name only ever occupies the 16-byte field here: AberMUD's own game rule that a character
 * name is at most 10 characters (`validname()`) is not this codec's concern. A longer name that
 * still fits the 16-byte field encodes and decodes correctly regardless -- record representation
 * and game rule are different kinds of compatibility, and conflating them would let the 16-byte
 * field quietly become a 16-character name limit this adapter never actually decided on.
 */
export class UafRandCodec {
  readonly #layout: UafRandLayout

  constructor(layout: UafRandLayout = RECONSTRUCTED_X86_64_LP64_LITTLE_ENDIAN) {
    this.#layout = layout
  }

  get recordSize(): number {
    return uafRandRecordSize(this.#layout)
  }

  encode(persona: AberMUDPersona): Buffer {
    const { longBytes } = this.#layout
    const record = Buffer.alloc(this.recordSize)
    record.write(persona.name, 0, NAME_FIELD_SIZE, "ascii")
    this.#writeLong(record, NAME_FIELD_SIZE, persona.score)
    this.#writeLong(record, NAME_FIELD_SIZE + longBytes, persona.strength)
    this.#writeLong(record, NAME_FIELD_SIZE + longBytes * 2, persona.sex)
    this.#writeLong(record, NAME_FIELD_SIZE + longBytes * 3, persona.level)
    return record
  }

  decode(record: Buffer): AberMUDPersona {
    const { longBytes } = this.#layout
    const nameField = record.subarray(0, NAME_FIELD_SIZE)
    // A C string ends at its first NUL, not its last: strcpy/strcmp/lowercase in the source
    // never look past it, and (per this codec's own docblock) nothing guarantees the bytes past
    // it are zero. Truncate the same way, not just at a trailing run of NULs.
    const terminator = nameField.indexOf(0)
    const name = (terminator === -1 ? nameField : nameField.subarray(0, terminator)).toString(
      "ascii",
    )
    return {
      name,
      score: this.#readLong(record, NAME_FIELD_SIZE),
      strength: this.#readLong(record, NAME_FIELD_SIZE + longBytes),
      sex: this.#readLong(record, NAME_FIELD_SIZE + longBytes * 2),
      level: this.#readLong(record, NAME_FIELD_SIZE + longBytes * 3),
    }
  }

  #writeLong(record: Buffer, offset: number, value: number): void {
    const { longBytes, endian } = this.#layout
    if (longBytes === 4) {
      if (endian === "little") {
        record.writeInt32LE(value, offset)
      } else {
        record.writeInt32BE(value, offset)
      }
      return
    }
    const big = BigInt(value)
    if (endian === "little") {
      record.writeBigInt64LE(big, offset)
    } else {
      record.writeBigInt64BE(big, offset)
    }
  }

  /** Read back as a regular number: persona fields (score, strength, sex, level) never approach
   * the range where a 64-bit `long`'s extra precision would matter. */
  #readLong(record: Buffer, offset: number): number {
    const { longBytes, endian } = this.#layout
    if (longBytes === 4) {
      return endian === "little" ? record.readInt32LE(offset) : record.readInt32BE(offset)
    }
    const big = endian === "little" ? record.readBigInt64LE(offset) : record.readBigInt64BE(offset)
    return Number(big)
  }
}
