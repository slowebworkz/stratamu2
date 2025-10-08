import { describe, expect, it, vi } from 'vitest'

const { SafeEmitter } = await import('../events/safe-emitter-new.js')

class TestSafeEmitter extends SafeEmitter<{ test: [string] }> { }

describe('SafeEmitter', () => {
  it('should call listener when event is emitted', async () => {
    const emitter = new TestSafeEmitter()
    const listener = vi.fn()
    emitter.on('test', listener)
    await emitter.emitSafe('test', 'hello')
    expect(listener).toHaveBeenCalledWith('hello')
  })
})
