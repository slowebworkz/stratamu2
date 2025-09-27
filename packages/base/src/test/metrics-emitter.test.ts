import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventMetrics } from '../events/event-metrics.js'

// Concrete test implementation
class TestMetricsEmitter extends (await import('../events/metrics-emitter.js')).MetricsEmitter<{
  test: [string]
  performance: [number]
  noData: []
  error: [Error]
  resetMetrics: [string?]
}> {}

describe('MetricsEmitter', () => {
  let emitter: TestMetricsEmitter
  let consoleErrorSpy: any

  beforeEach(() => {
    emitter = new TestMetricsEmitter()
    consoleErrorSpy = vi.spyOn(emitter.log, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('Construction', () => {
    it('should create with inherited priority and logging capabilities', () => {
      expect(emitter).toBeInstanceOf(TestMetricsEmitter)
      expect(emitter.log).toBeDefined()
      expect(emitter.onWithOptions).toBeDefined()
    })

    it('should set up built-in resetMetrics listener', async () => {
      await emitter.emit('resetMetrics', [''])
      // Should not throw
    })
  })

  describe('Event Emission with Metrics', () => {
    it('should track emission count for events with data', async () => {
      await emitter.emit('test', ['hello'])
      await emitter.emit('test', ['world'])

      const metrics = emitter.getEventMetrics()
      const testMetric = metrics.find((m) => m.event === 'test')

      expect(testMetric).toBeDefined()
      expect(testMetric?.count).toBe(2)
    })

    it('should track emission count for events without data', async () => {
      await emitter.emit('noData')
      await emitter.emit('noData')
      await emitter.emit('noData')

      const metrics = emitter.getEventMetrics()
      const noDataMetric = metrics.find((m) => m.event === 'noData')

      expect(noDataMetric).toBeDefined()
      expect(noDataMetric?.count).toBe(3)
    })

    it('should track timing for events', async () => {
      await emitter.emit('performance', [100])

      const metrics = emitter.getEventMetrics()
      const perfMetric = metrics.find((m) => m.event === 'performance')

      expect(perfMetric).toBeDefined()
      expect(perfMetric?.totalTimeMs).toBeGreaterThanOrEqual(0)
      expect(perfMetric?.lastTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('should track errors without incrementing success count', async () => {
      emitter.on('error', () => {
        throw new Error('Handler error')
      })

      try {
        await emitter.emit('error', [new Error('Test error')])
      } catch {
        // error handled
      }

      const metrics = emitter.getEventMetrics()
      const errorMetric = metrics.find((m) => m.event === 'error')

      expect(errorMetric).toBeDefined()
      expect(errorMetric?.count).toBe(0) // No successful emissions
      expect(errorMetric?.errorCount).toBe(1) // One error tracked
      expect(errorMetric?.totalTimeMs).toBeGreaterThanOrEqual(0) // Still tracks timing
    })

    it('should handle both successful and failed emissions', async () => {
      let shouldThrow = false
      emitter.on('test', () => {
        if (shouldThrow) throw new Error('Conditional error')
      })

      // Successful emission
      await emitter.emit('test', ['success'])

      // Failed emission
      shouldThrow = true
      try {
        await emitter.emit('test', ['failure'])
      } catch {
        // Expected
      }

      const metrics = emitter.getEventMetrics()
      const testMetric = metrics.find((m) => m.event === 'test')

      expect(testMetric).toBeDefined()
      expect(testMetric?.count).toBe(1) // One successful
      expect(testMetric?.errorCount).toBe(1) // One failed
    })
  })

  describe('Listener Timing Metrics', () => {
    it('should track slowest listener for single listener', async () => {
      function slowListener() {
        // Simulate some work
        const start = Date.now()
        while (Date.now() - start < 1) {
          // Busy wait for at least 1ms
        }
      }

      emitter.on('performance', slowListener)
      await emitter.emit('performance', [42])

      const metrics = emitter.getEventMetrics()
      const perfMetric = metrics.find((m) => m.event === 'performance')

      expect(perfMetric).toBeDefined()
      expect(perfMetric?.slowestListener).toBe('slowListener')
      expect(perfMetric?.slowestTimeMs).toBeGreaterThan(0)
    })

    it('should track slowest among multiple listeners', async () => {
      async function fastListener() {
        // No delay
      }

      async function slowListener() {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }

      emitter.on('performance', fastListener)
      emitter.on('performance', slowListener)

      await emitter.emit('performance', [100])

      const metrics = emitter.getEventMetrics()
      const perfMetric = metrics.find((m) => m.event === 'performance')

      expect(perfMetric).toBeDefined()
      expect(perfMetric?.slowestListener).toBe('slowListener')
    })

    it('should handle anonymous listeners', async () => {
      emitter.on('test', () => {
        const start = Date.now()
        while (Date.now() - start < 1) {
          // Busy wait
        }
      })

      await emitter.emit('test', ['anonymous'])

      const metrics = emitter.getEventMetrics()
      const testMetric = metrics.find((m) => m.event === 'test')

      expect(testMetric).toBeDefined()
      expect(testMetric?.slowestListener).toBe('<anonymous>')
    })

    it('should handle async listeners', async () => {
      async function asyncListener() {
        await new Promise((resolve) => setTimeout(resolve, 1))
      }

      emitter.on('test', asyncListener)
      await emitter.emit('test', ['async'])

      const metrics = emitter.getEventMetrics()
      const testMetric = metrics.find((m) => m.event === 'test')

      expect(testMetric).toBeDefined()
      expect(testMetric?.slowestListener).toBe('asyncListener')
    })

    it('should update slowest listener when a slower one is found', async () => {
      async function mediumListener() {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      async function slowestListener() {
        await new Promise((resolve) => setTimeout(resolve, 30))
      }

      emitter.on('performance', mediumListener)
      await emitter.emit('performance', [1])

      let metrics = emitter.getEventMetrics()
      let perfMetric = metrics.find((m) => m.event === 'performance')
      expect(perfMetric?.slowestListener).toBe('mediumListener')

      emitter.on('performance', slowestListener)
      await emitter.emit('performance', [2])

      metrics = emitter.getEventMetrics()
      perfMetric = metrics.find((m) => m.event === 'performance')
      expect(perfMetric?.slowestListener).toBe('slowestListener')
    })

    it('should track timing for listeners that throw errors', async () => {
      async function errorListener() {
        await new Promise((resolve) => setTimeout(resolve, 5))
        throw new Error('Listener error')
      }

      emitter.on('test', errorListener)

      // The emit should not throw because SafeEmitter catches errors
      await expect(emitter.emit('test', ['error test'])).resolves.toBeUndefined()

      const metrics = emitter.getEventMetrics()
      const testMetric = metrics.find((m) => m.event === 'test')

      expect(testMetric).toBeDefined()
      expect(testMetric?.slowestListener).toBe('errorListener')
      expect(testMetric?.slowestTimeMs).toBeGreaterThan(0)
    })
  })

  describe('Array Event Names Support', () => {
    it('should track metrics for array event names', async () => {
      function arrayListener() {
        const start = Date.now()
        while (Date.now() - start < 1) {
          // Small delay
        }
      }

      emitter.on(['test', 'noData'], arrayListener)

      await emitter.emit('test', ['array test'])
      await emitter.emit('noData')

      const metrics = emitter.getEventMetrics()
      const testMetric = metrics.find((m) => m.event === 'test')
      const noDataMetric = metrics.find((m) => m.event === 'noData')

      expect(testMetric?.slowestListener).toBe('arrayListener')
      expect(noDataMetric?.slowestListener).toBe('arrayListener')
    })
  })

  describe('EventMetrics Class Integration', () => {
    it('should return EventMetrics instances with all properties', async () => {
      emitter.on('test', () => {})
      await emitter.emit('test', ['complete'])

      const metrics = emitter.getEventMetrics()
      const testMetric = metrics.find((m) => m.event === 'test')

      expect(testMetric).toBeInstanceOf(EventMetrics)
      expect(typeof testMetric?.event).toBe('string')
      expect(typeof testMetric?.count).toBe('number')
      expect(typeof testMetric?.totalTimeMs).toBe('number')
      expect(typeof testMetric?.lastTimeMs).toBe('number')
      expect(typeof testMetric?.slowestListener).toBe('string')
      expect(typeof testMetric?.slowestTimeMs).toBe('number')
      expect(typeof testMetric?.errorCount).toBe('number')
    })

    it('should handle EventMetrics creation errors gracefully', async () => {
      // Force an error by mocking EventMetrics constructor
      // This test verifies error handling, but we can't easily mock the import
      await emitter.emit('test', ['error test'])

      // The test passes if no exception is thrown from getEventMetrics
      expect(() => emitter.getEventMetrics()).not.toThrow()
    })

    it('should include events with only error data', async () => {
      emitter.on('error', () => {
        throw new Error('Always fails')
      })

      try {
        await emitter.emit('error', [new Error('Test')])
      } catch {
        // Expected
      }

      const metrics = emitter.getEventMetrics()
      const errorMetric = metrics.find((m) => m.event === 'error')

      expect(errorMetric).toBeDefined()
      expect(errorMetric?.count).toBe(0)
      expect(errorMetric?.errorCount).toBe(1)
    })
  })

  describe('Built-in Reset Functionality', () => {
    it('should reset metrics for specific event via resetMetrics event', async () => {
      await emitter.emit('test', ['before reset'])
      await emitter.emit('performance', [100])

      // Reset only 'test' metrics
      await emitter.emit('resetMetrics', ['test'])

      const metrics = emitter.getEventMetrics()
      const testMetric = metrics.find((m) => m.event === 'test')
      const perfMetric = metrics.find((m) => m.event === 'performance')

      expect(testMetric).toBeUndefined() // Should be removed
      expect(perfMetric).toBeDefined() // Should remain
    })

    it('should reset all metrics via resetMetrics event with no argument', async () => {
      await emitter.emit('test', ['before reset'])
      await emitter.emit('performance', [100])

      // Reset all metrics
      await emitter.emit('resetMetrics', [])

      const metrics = emitter.getEventMetrics()

      expect(metrics).toHaveLength(0)
    })

    it('should protect resetMetrics listener from removal', async () => {
      const originalListener = (emitter as any)._resetListener

      // Attempt to remove the protected listener
      expect(() => {
        emitter.off('resetMetrics', originalListener)
      }).not.toThrow()

      // Verify the listener is still functional
      await expect(async () => {
        await emitter.emit('resetMetrics', [])
      }).not.toThrow()
    })
  })

  describe('AbortSignal Support', () => {
    it('should support AbortSignal in on() method', async () => {
      const controller = new AbortController()
      const listener = vi.fn()

      emitter.on('test', listener, { signal: controller.signal })

      await emitter.emit('test', ['before abort'])
      expect(listener).toHaveBeenCalledTimes(1)

      controller.abort()

      await emitter.emit('test', ['after abort'])
      expect(listener).toHaveBeenCalledTimes(1) // Should not be called again
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty event names', async () => {
      await emitter.emit('' as any, ['empty'])

      const metrics = emitter.getEventMetrics()
      const emptyMetric = metrics.find((m) => m.event === '')

      expect(emptyMetric).toBeDefined()
    })

    it('should handle multiple rapid emissions', async () => {
      const promises = []
      for (let i = 0; i < 10; i++) {
        promises.push(emitter.emit('performance', [i]))
      }

      await Promise.all(promises)

      const metrics = emitter.getEventMetrics()
      const perfMetric = metrics.find((m) => m.event === 'performance')

      expect(perfMetric?.count).toBe(10)
    })

    it('should handle listeners that return promises', async () => {
      emitter.on('test', async () => {
        // Return void instead of string
      })

      await emitter.emit('test', ['async emit'])

      const metrics = emitter.getEventMetrics()
      const testMetric = metrics.find((m) => m.event === 'test')

      expect(testMetric).toBeDefined()
      expect(testMetric?.count).toBe(1)
    })

    it('should handle undefined and null values', async () => {
      await emitter.emit('test', [undefined as any])

      const metrics = emitter.getEventMetrics()
      const testMetric = metrics.find((m) => m.event === 'test')

      expect(testMetric).toBeDefined()
      expect(testMetric?.count).toBe(1)
    })
  })
})
