
import { describe, it, expect, vi, beforeEach } from 'vitest'

class TestSafeEmitter extends (await import('../events/safe-emitter-new.js')).SafeEmitter<{
  test: [string]
  error: [Error]
  noData: []
  async: [Promise<void>]
}> { }

describe('SafeEmitter (new)', () => {
  let emitter: TestSafeEmitter

  beforeEach(() => {
    emitter = new TestSafeEmitter()
  })

  it('should emit events safely without arguments', async () => {
    const listener = vi.fn()
    emitter.on('noData', listener)
    await emitter.emitSafe('noData')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('should emit events safely with arguments', async () => {
    const listener = vi.fn()
    emitter.on('test', listener)
    await emitter.emitSafe('test', 'hello')
    expect(listener).toHaveBeenCalledWith('hello')
  })

  it('should catch errors in listeners', async () => {
    const errorListener = vi.fn(() => { throw new Error('fail') })
    emitter.on('test', errorListener)
    await emitter.emitSafe('test', 'fail')
    expect(errorListener).toHaveBeenCalled()
    // No log property, but error event can be checked if needed
  })

  it('should handle async listener errors', async () => {
    const errorListener = vi.fn(async () => { throw new Error('fail') })
    emitter.on('test', errorListener)
    await emitter.emitSafe('test', 'fail')
    expect(errorListener).toHaveBeenCalled()
  })

  it('should support array of event names in on()', async () => {
    const listener = vi.fn()
    emitter.on(['test', 'noData'], listener)
    await emitter.emitSafe('test', 'hello')
    await emitter.emitSafe('noData')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('should return unsubscribe function from on()', async () => {
    const listener = vi.fn()
    const unsubscribe = emitter.on('test', listener)
    unsubscribe()
    await emitter.emitSafe('test', 'ignored')
    expect(listener).not.toHaveBeenCalled()
  })

  it('should support AbortSignal in on()', async () => {
    const controller = new AbortController()
    const listener = vi.fn()
    emitter.on('test', listener, { signal: controller.signal })
    controller.abort()
    await emitter.emitSafe('test', 'ignored')
    expect(listener).not.toHaveBeenCalled()
  })

  it('should handle once() promises successfully', async () => {
    const promise = emitter.once('test')
    emitter.emitSafe('test', 'hello')
    const result = await promise
    expect(result).toEqual('hello')
  })

  it('should provide .off() method on once promises', async () => {
    const promise = emitter.once('test')
    expect(typeof promise.off).toBe('function')
    promise.off()
    emitter.emitSafe('test', 'ignored')
    // Promise should not resolve after .off()
    const raceResult = await Promise.race([
      promise.catch(() => 'cancelled'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 10)),
    ])
    expect(raceResult).toBe('timeout')
  })

  it('should support filter function in once()', async () => {
    const promise = emitter.once('test', (msg) => msg[0] === 'valid')
    emitter.emitSafe('test', 'invalid')
    emitter.emitSafe('test', ['invalid'])
    emitter.emitSafe('test', ['valid'])
    const result = await promise
    expect(result).toEqual(['valid'])
  })
})
