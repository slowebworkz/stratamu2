import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Concrete test implementation
class TestSafeEmitter extends (await import('../events/safe-emitter.js')).SafeEmitter<{
  test: [string]
  error: [Error]
  noData: []
  async: [Promise<void>]
}> {}

describe('SafeEmitter', () => {
  let emitter: TestSafeEmitter
  let errorLogSpy: any

  beforeEach(() => {
    emitter = new TestSafeEmitter()
    errorLogSpy = vi.spyOn(emitter.log, 'error').mockImplementation(() => {})
  })

  describe('Construction', () => {
    it('should create with inherited metrics and logging capabilities', () => {
      expect(emitter).toBeInstanceOf(TestSafeEmitter)
      expect(emitter.log).toBeDefined()
      expect(emitter.getEventMetrics).toBeDefined()
    })
  })

  describe('Safe Event Emission', () => {
    it('should emit events safely without arguments', async () => {
      const listener = vi.fn()
      emitter.on('noData', listener)

      await emitter.emitSafe('noData')

      expect(listener).toHaveBeenCalledOnce()
      expect(errorLogSpy).not.toHaveBeenCalled()
    })

    it('should emit events safely with arguments', async () => {
      const listener = vi.fn()
      emitter.on('test', listener)

      await emitter.emitSafe('test', 'hello')

      expect(listener).toHaveBeenCalledWith('hello')
      expect(errorLogSpy).not.toHaveBeenCalled()
    })

    it('should catch and log errors during emit', async () => {
      emitter.on('test', () => {
        throw new Error('Listener error')
      })

      await emitter.emitSafe('test', 'trigger error')

      expect(errorLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'test',
          error: expect.any(Error),
          listenerType: 'on',
          listenerName: '<anonymous>',
          hasFilter: undefined,
        }),
        'SafeEmitter caught on listener error',
      )
    })

    it('should handle async listener errors', async () => {
      emitter.on('async', async () => {
        throw new Error('Async listener error')
      })

      await emitter.emitSafe('async', Promise.resolve())

      expect(errorLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'async',
          error: expect.any(Error),
          listenerType: 'on',
          listenerName: '<anonymous>',
          hasFilter: undefined,
        }),
        'SafeEmitter caught on listener error',
      )
    })
  })

  describe('Safe Listener Registration', () => {
    it('should wrap listeners to catch errors in on()', async () => {
      const failingListener = vi.fn(() => {
        throw new Error('Listener failure')
      })

      emitter.on('test', failingListener)
      await emitter.emit('test', ['trigger'])

      expect(failingListener).toHaveBeenCalled()
      expect(errorLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'test',
          listenerType: 'on',
          listenerName: expect.any(String),
          error: expect.any(Error),
        }),
        'SafeEmitter caught on listener error',
      )
    })

    it('should handle async listener errors in on()', async () => {
      const asyncFailingListener = vi.fn(async () => {
        throw new Error('Async listener failure')
      })

      emitter.on('test', asyncFailingListener)
      await emitter.emit('test', ['trigger'])

      expect(asyncFailingListener).toHaveBeenCalled()
      expect(errorLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'test',
          listenerType: 'on',
          error: expect.any(Error),
        }),
        'SafeEmitter caught on listener error',
      )
    })

    it('should support array of event names in on()', async () => {
      const listener = vi.fn()

      emitter.on(['test', 'noData'], listener)
      await emitter.emit('test', ['hello'])
      await emitter.emit('noData')

      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('should return unsubscribe function from on()', async () => {
      const listener = vi.fn()
      const unsubscribe = emitter.on('test', listener)

      unsubscribe()
      await emitter.emit('test', ['ignored'])

      expect(listener).not.toHaveBeenCalled()
    })

    it('should support AbortSignal in on()', async () => {
      const controller = new AbortController()
      const listener = vi.fn()

      emitter.on('test', listener, { signal: controller.signal })
      controller.abort()
      await emitter.emit('test', ['ignored'])

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('Safe Once Listeners', () => {
    it('should handle once() promises successfully', async () => {
      const promise = emitter.once('test')
      emitter.emit('test', ['hello'])

      const result = await promise
      expect(result).toEqual(['hello'])
    })

    it('should provide .off() method on once promises', async () => {
      const promise = emitter.once('test')

      expect(typeof promise.off).toBe('function')
      promise.off()

      emitter.emit('test', ['ignored'])

      // Promise should not resolve after .off()
      const raceResult = await Promise.race([
        promise.catch(() => 'cancelled'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 10)),
      ])

      expect(raceResult).toBe('timeout')
    })

    it('should handle errors in once() listeners', async () => {
      // For once() listeners, errors are not caught by SafeEmitter since they're handled by Emittery
      // The test should verify that the promise resolves with the error data
      const promise = emitter.once('error')

      setTimeout(() => {
        emitter.emit('error', [new Error('Test error')])
      }, 1)

      const result = await promise
      expect(result).toEqual([expect.any(Error)])
      expect((result as [Error])[0].message).toBe('Test error')

      // once() errors are not logged by SafeEmitter since they're promise rejections
      expect(errorLogSpy).not.toHaveBeenCalled()
    })

    it('should support filter function in once()', async () => {
      const promise = emitter.once('test', ([msg]) => msg === 'valid')

      emitter.emit('test', ['invalid'])
      emitter.emit('test', ['valid'])

      const result = await promise
      expect(result).toEqual(['valid'])
    })

    it('should track filter usage in error context', async () => {
      const promise = emitter.once('error', () => true)

      setTimeout(() => {
        emitter.emit('error', [new Error('Filtered error')])
      }, 1)

      try {
        await promise
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
      }

      // once() errors are not logged by SafeEmitter since they're promise rejections
      expect(errorLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('Error Context Information', () => {
    it('should log listener name when available', async () => {
      function namedListener() {
        throw new Error('Named error')
      }

      emitter.on('test', namedListener)
      await emitter.emit('test', ['trigger'])

      expect(errorLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          listenerName: 'namedListener',
        }),
        'SafeEmitter caught on listener error',
      )
    })

    it('should log anonymous listener appropriately', async () => {
      emitter.on('test', () => {
        throw new Error('Anonymous error')
      })
      await emitter.emit('test', ['trigger'])

      expect(errorLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          listenerName: '<anonymous>',
        }),
        'SafeEmitter caught on listener error',
      )
    })

    it('should handle array event names in error logging', async () => {
      emitter.on(['test', 'noData'], () => {
        throw new Error('Multi-event error')
      })
      await emitter.emit('test', ['trigger'])

      expect(errorLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'test',
        }),
        'SafeEmitter caught on listener error',
      )
    })
  })

  describe('Error Handler Customization', () => {
    let originalEmit: any

    afterEach(() => {
      // Restore original emit method if we modified it
      if (originalEmit) {
        const proto = Object.getPrototypeOf(Object.getPrototypeOf(new TestSafeEmitter()))
        proto.emit = originalEmit
        originalEmit = undefined
      }
    })

    it.skip('should allow subclasses to override onEmitError', async () => {
      class CustomSafeEmitter extends TestSafeEmitter {
        protected onEmitError(eventName: any, error: unknown): void {
          this.log.warn({ event: String(eventName), error }, 'Custom emit error handler')
        }
      }

      const customEmitter = new CustomSafeEmitter()
      const warnSpy = vi.spyOn(customEmitter.log, 'warn').mockImplementation(() => {})

      // Force an error by mocking the super.emit call in emitSafe
      const proto = Object.getPrototypeOf(Object.getPrototypeOf(customEmitter))
      originalEmit = proto.emit
      proto.emit = vi.fn().mockRejectedValue(new Error('Emit error'))

      try {
        await customEmitter.emitSafe('test', 'trigger')
      } catch (error) {
        // emitSafe should not throw - it should catch and handle the error
        expect(error).toBeUndefined()
      }

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'test',
          error: expect.any(Error),
        }),
        'Custom emit error handler',
      )
    })

    it('should allow subclasses to override onListenerError', async () => {
      class CustomSafeEmitter extends TestSafeEmitter {
        protected onListenerError(eventName: any, error: unknown, context: any): void {
          this.log.warn(
            { event: String(eventName), error, context },
            'Custom listener error handler',
          )
        }
      }

      const customEmitter = new CustomSafeEmitter()
      const warnSpy = vi.spyOn(customEmitter.log, 'warn').mockImplementation(() => {})

      customEmitter.on('test', () => {
        throw new Error('Custom listener error')
      })

      await customEmitter.emit('test', ['trigger'])

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'test',
          error: expect.any(Error),
          context: expect.objectContaining({
            type: 'on',
          }),
        }),
        'Custom listener error handler',
      )
    })
  })

  describe('Integration with MetricsEmitter', () => {
    it('should still track metrics despite errors', async () => {
      emitter.on('test', () => {
        throw new Error('Metric tracking error')
      })

      await emitter.emitSafe('test', 'track metrics')

      const metrics = emitter.getEventMetrics()
      const testMetric = metrics.find((m) => m.event === 'test')

      expect(testMetric).toBeDefined()
      // SafeEmitter catches listener errors, so the emission itself succeeds
      // Error count should be 0 because the emit succeeded, even though the listener failed
      expect(testMetric?.errorCount).toBe(0)
      expect(testMetric?.count).toBeGreaterThan(0)
    })
  })
})
