import { describe, expect, it } from 'vitest'
import { FilteredPriorityEmitter } from '../events/filtered-priority-emitter-3.js'

type EM = {
  test: [number]
}

class E extends FilteredPriorityEmitter<EM> {}

describe('FilteredPriorityEmitter integration with SafeEmitter bookkeeping', () => {
  it('records priority-listener errors into SafeEmitter error counts and logs', async () => {
    const e = new E()
    // add a priority listener that throws
    e.onWithOptions(
      'test',
      async () => {
        throw new Error('priority fail')
      },
      { priority: 10 as any },
    )

    // sanity checks before
    expect(e.getErrorCount('test')).toBe(0)
    expect(e.getSafetyLogs('test').length).toBe(0)

    await e.emitWithPriority('test', 1)

    // after emitting, the priority listener's error should be recorded
    expect(e.getErrorCount('test')).toBeGreaterThanOrEqual(1)
    const logs = e.getSafetyLogs('test')
    expect(logs.length).toBeGreaterThanOrEqual(1)
    expect(logs[0]).toBeDefined()
    const err = logs[0]!.error
    if (err instanceof Error) {
      expect(err.message).toContain('priority fail')
    } else if (err && typeof err === 'object' && 'message' in (err as any)) {
      expect((err as any).message).toContain('priority fail')
    } else if (err && typeof err === 'object' && 'asString' in (err as any)) {
      expect((err as any).asString).toContain('priority fail')
    } else {
      expect(err).toBeInstanceOf(Error)
    }
  })
})
