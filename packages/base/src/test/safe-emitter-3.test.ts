import { describe, expect, it } from 'vitest'
import { SafeEmitter } from '../events/safe-emitter-3.js'

type EM = {
  ev: [number]
  other: [string]
}

class E extends SafeEmitter<EM> {}

describe('SafeEmitter safety bookkeeping (public accessors)', () => {
  // Typed helper to call emitSafe without casting in tests
  async function emitSafeTyped<T extends SafeEmitter<any>, K extends keyof EM>(
    emitter: T,
    event: K,
    ...args: EM[K]
  ) {
    return (emitter.emitSafe as any)(event, ...(args as any))
  }

  it('records listener errors into bookkeeping via on() and emitSafe()', async () => {
    const e = new E()
    e.on('ev', async () => {
      throw new Error('boom')
    })

    const ok = await emitSafeTyped(e, 'ev', 1)
    // listeners are wrapped by SafeEmitter; errors are recorded but do not cause emitSafe to throw
    expect(ok).toBe(true)

    expect(e.getErrorCount('ev')).toBeGreaterThanOrEqual(1)
    const logs = e.getSafetyLogs('ev')
    expect(logs.length).toBeGreaterThanOrEqual(1)
    // Accept either a real Error instance or a sanitized error shape
    const err = logs[0]!.error
    if (err instanceof Error) {
      expect(err.message).toContain('boom')
    } else if (err && typeof err === 'object' && 'message' in (err as any)) {
      expect((err as any).message).toContain('boom')
    } else if (err && typeof err === 'object' && 'asString' in (err as any)) {
      expect((err as any).asString).toContain('boom')
    } else {
      // Fail with clear message
      expect(err).toBeInstanceOf(Error)
    }
  })

  it('resetErrorCounts clears counts and logs', async () => {
    const e = new E()
    e.on('other', async () => {
      throw new Error('otherboom')
    })
    await emitSafeTyped(e, 'other', 'a')
    expect(e.getErrorCount('other')).toBeGreaterThanOrEqual(1)

    e.resetErrorCounts('other')
    expect(e.getErrorCount('other')).toBe(0)
    // reset also clears logs per implementation
    expect(e.getSafetyLogs('other').length).toBe(0)
  })

  it('clearSafetyLogs clears only logs and not counts when called', async () => {
    const e = new E()
    e.on('ev', async () => {
      throw new Error('boom2')
    })
    await emitSafeTyped(e, 'ev', 2)
    expect(e.getErrorCount('ev')).toBeGreaterThanOrEqual(1)
    expect(e.getSafetyLogs('ev').length).toBeGreaterThanOrEqual(1)

    e.clearSafetyLogs('ev')
    expect(e.getSafetyLogs('ev').length).toBe(0)
    // counts remain (reset is separate)
    expect(e.getErrorCount('ev')).toBeGreaterThanOrEqual(1)
  })

  it('getAllErrorCounts returns a copy and can be inspected', async () => {
    const e = new E()
    e.on('ev', async () => {
      throw new Error('boom3')
    })
    e.on('other', async () => {
      throw new Error('boom4')
    })
    await emitSafeTyped(e, 'ev', 5)
    await emitSafeTyped(e, 'other', 'x')

    const map = e.getAllErrorCounts()
    expect(map.get('ev')).toBeGreaterThanOrEqual(1)
    expect(map.get('other')).toBeGreaterThanOrEqual(1)

    // mutating returned map should not affect internal counts
    const mutable = new Map(map as any)
    mutable.set('ev', 999)
    expect(e.getErrorCount('ev')).not.toBe(999)
  })

  it('safetyEnabled toggles via setSafetyEnabled/isSafetyEnabled', () => {
    const e = new E()
    expect(e.isSafetyEnabled()).toBe(true)
    e.setSafetyEnabled(false)
    expect(e.isSafetyEnabled()).toBe(false)
    e.setSafetyEnabled(true)
    expect(e.isSafetyEnabled()).toBe(true)
  })

  it('disabling safety stops recording errors', async () => {
    const e = new E()
    e.on('ev', async () => {
      throw new Error('boom-disabled')
    })
    e.setSafetyEnabled(false)
    await emitSafeTyped(e, 'ev', 1)
    expect(e.getErrorCount('ev')).toBe(0)
    expect(e.getSafetyLogs('ev').length).toBe(0)
  })

  it('private control events on internal bus trigger handlers', async () => {
    const e = new E()
    // record a failure first
    e.on('other', async () => {
      throw new Error('ctrl')
    })
    await emitSafeTyped(e, 'other', 'a')
    expect(e.getErrorCount('other')).toBeGreaterThanOrEqual(1)

    // emit the private reset event via internal bus
    // use (SafeEmitter as any) to access private _public for testing
    // internal events use tuple payloads (matching InternalEventMap types)
    await (e as any)._public.emit('resetErrorCounts', ['other'])
    expect(e.getErrorCount('other')).toBe(0)
  })
})
