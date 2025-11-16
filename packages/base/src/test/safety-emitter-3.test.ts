import { internalPublicBus } from '@/events'
import type { BaseEventMap } from '@repo/types'
import Emittery from 'emittery'
import { describe, expect, it } from 'vitest'
import { SafetyEmitter } from '../events/safety-emitter.js'

type EM = {
  ev: [number]
  other: [string]
  obj: [{ a: number }]
}

// We'll construct the SafetyEmitter standalone by providing an internal bus
// (the same shape used by SafeEmitter) so we can exercise the private
// control events as if it were composed.

describe('SafetyEmitter (standalone) thorough tests', () => {
  it('records counts and logs for multiple events and sums correctly', () => {
    const bus = typedInternalBus<EM>()
    const s = new SafetyEmitter<EM>(bus.bus, { safetyLogCap: 5 })

    // record for multiple events
    s.recordListenerErrorFor('ev', new Error('e1'), 'l1')
    s.recordListenerErrorFor('ev', new Error('e2'), 'l2')
    s.recordListenerErrorFor('other', new Error('o1'), 'l3')

    expect(s.getErrorCount('ev')).toBe(2)
    expect(s.getErrorCount('other')).toBe(1)
    expect(s.getErrorCount()).toBe(3)

    const all = s.getAllErrorCounts()
    expect(all.get('ev')).toBe(2)
    expect(all.get('other')).toBe(1)
  })

  it('respects safetyLogCap and per-event overrides', () => {
    const bus = typedInternalBus<EM>()
    const perEventCap: Partial<Record<Extract<keyof EM, string>, number>> = { ev: 1 }
    const s = new SafetyEmitter<EM>(bus.bus, { safetyLogCap: 2, perEventCap })
    s.recordListenerErrorFor('ev', new Error('a'))
    s.recordListenerErrorFor('ev', new Error('b'))
    s.recordListenerErrorFor('ev', new Error('c'))

    // per-event cap overrides should limit 'ev' to 1
    expect(s.getSafetyLogForEvent('ev').length).toBe(1)

    // global cap applies to other events
    s.recordListenerErrorFor('other', new Error('x'))
    s.recordListenerErrorFor('other', new Error('y'))
    s.recordListenerErrorFor('other', new Error('z'))
    expect(s.getSafetyLogForEvent('other').length).toBe(2)
  })

  it('getSafetyLogForEvent supports limit and newestFirst', () => {
    const bus = typedInternalBus<EM>()
    const s = new SafetyEmitter<EM>(bus.bus, { safetyLogCap: 10 })
    for (let i = 1; i <= 5; i++) s.recordListenerErrorFor('ev', new Error(`n${i}`))

    const last2 = s.getSafetyLogForEvent('ev', { limit: 2 })
    expect(last2.length).toBe(2)
    expect((last2[0]!.error as Error).message).toContain('n4') // oldest->newest slice

    const last2Newest = s.getSafetyLogForEvent('ev', { limit: 2, newestFirst: true })
    expect((last2Newest[0]!.error as Error).message).toContain('n5')
  })

  it('getSafetyLogIterator streams in the correct order', () => {
    const bus = typedInternalBus<EM>()
    const s = new SafetyEmitter<EM>(bus.bus, { safetyLogCap: 10 })
    for (let i = 1; i <= 3; i++) s.recordListenerErrorFor('ev', new Error(`it${i}`))

    const arr = Array.from(s.getSafetyLogIterator('ev'))
    expect(arr.length).toBe(3)
    expect((arr[0]!.error as Error).message).toContain('it1')
  })

  it('sanitizes non-Error values when sanitizeErrors=true', () => {
    const bus = typedInternalBus<EM>()
    const s = new SafetyEmitter<EM>(bus.bus, { sanitizeErrors: true })
    s.recordListenerErrorFor('obj', { a: 1 })
    const logs = s.getSafetyLogForEvent('obj')
    expect(logs.length).toBeGreaterThanOrEqual(1)
    const err = logs[0]!.error as unknown
    // When sanitizeErrors is true we expect a shape with `asString`.
    expect((err as { asString?: string }).asString).toBeDefined()
  })

  it('resetErrorCounts and clearSafetyLogs behave correctly via public methods', () => {
    const bus = typedInternalBus<EM>()
    const s = new SafetyEmitter<EM>(bus.bus, { safetyLogCap: 3 })
    s.recordListenerErrorFor('ev', new Error('r1'))
    s.recordListenerErrorFor('ev', new Error('r2'))
    s.recordListenerErrorFor('other', new Error('r3'))

    s.resetErrorCounts('ev')
    expect(s.getErrorCount('ev')).toBe(0)
    expect(s.getSafetyLogSize('ev')).toBe(0)
    // other unaffected
    expect(s.getErrorCount('other')).toBe(1)

    s.clearSafetyLogs()
    expect(s.getSafetyLogSize()).toBe(0)
    // counts remain unless reset
    expect(s.getErrorCount('other')).toBe(1)
  })

  it('responds to internal control events on provided bus', async () => {
    const bus = typedInternalBus<EM>()
    const s = new SafetyEmitter<EM>(bus.bus, { safetyLogCap: 3 })
    s.recordListenerErrorFor('ev', new Error('c1'))
    expect(s.getErrorCount('ev')).toBeGreaterThanOrEqual(1)

    // use the provided internal bus to trigger control listeners
    await bus.raw.emit('resetErrorCounts', ['ev'])
    expect(s.getErrorCount('ev')).toBe(0)

    s.recordListenerErrorFor('ev', new Error('c2'))
    expect(s.getSafetyLogSize('ev')).toBeGreaterThanOrEqual(1)
    await bus.raw.emit('clearSafetyLogs', ['ev'])
    expect(s.getSafetyLogSize('ev')).toBe(0)

    // toggle enableSafeMode: when disabled, recording should not change counts
    const before = s.getErrorCount('ev')
    await bus.raw.emit('enableSafeMode', [false])
    s.recordListenerErrorFor('ev', new Error('ignored'))
    expect(s.getErrorCount('ev')).toBe(before)
    await bus.raw.emit('enableSafeMode', [true])
    s.recordListenerErrorFor('ev', new Error('again'))
    expect(s.getErrorCount('ev')).toBeGreaterThan(before)
  })

  it('getSafetyLogs aggregates across events when no eventName provided', () => {
    const bus = typedInternalBus<EM>()
    const s = new SafetyEmitter<EM>(bus.bus, { safetyLogCap: 5 })
    s.recordListenerErrorFor('ev', new Error('a'))
    s.recordListenerErrorFor('other', new Error('b'))
    const all = s.getSafetyLogs()
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it('getAllErrorCounts returns a shallow copy', () => {
    const bus = typedInternalBus<EM>()
    const s = new SafetyEmitter<EM>(bus.bus)
    s.recordListenerErrorFor('ev', new Error('c'))
    const m = new Map(s.getAllErrorCounts())
    m.set('ev', 999)
    expect(s.getErrorCount('ev')).not.toBe(999)
  })
})

// Small helper: create a typed internal public bus using `internalPublicBus`.
function typedInternalBus<EventMap extends BaseEventMap<unknown[]>>() {
  // create a fake object with a _public Emittery instance and wrap it
  // with the helper to obtain the correctly-typed view.
  const raw: any = new Emittery()
  const self: any = { _public: raw }
  const bus = internalPublicBus<EventMap>(self)
  return { bus, raw }
}
