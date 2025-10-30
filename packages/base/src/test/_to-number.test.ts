import { describe, expect, it } from 'vitest'
import { toNumber } from '../data/index.js'

describe('toNumber', () => {
  it('converts numeric input', () => {
    expect(toNumber(123)).toBe(123)
    expect(toNumber('456')).toBe(456)
    expect(toNumber('  7.5 ')).toBe(7.5)
  })

  it('returns undefined for nullish or empty strings', () => {
    expect(toNumber(null)).toBeUndefined()
    expect(toNumber(undefined)).toBeUndefined()
    expect(toNumber('')).toBeUndefined()
    expect(toNumber('   ')).toBeUndefined()
  })

  it('returns undefined for non-finite', () => {
    expect(toNumber(NaN)).toBeUndefined()
    expect(toNumber(Infinity)).toBeUndefined()
    expect(toNumber('-Infinity')).toBeUndefined()
  })
})
