import { beforeEach, describe, expect, it, vi } from 'vitest'

// Concrete test implementation
class TestFilteredPriorityEmitter extends (await import('../events/filtered-priority-emitter.js'))
  .FilteredPriorityEmitter<{
  test: [string]
  priority: [number]
  noData: []
  error: [Error]
}> {}

describe('FilteredPriorityEmitter', () => {
  let emitter: TestFilteredPriorityEmitter

  beforeEach(() => {
    emitter = new TestFilteredPriorityEmitter()
  })

  describe('Construction', () => {
    it('should create with inherited logging capabilities', () => {
      expect(emitter).toBeInstanceOf(TestFilteredPriorityEmitter)
      expect(emitter.log).toBeDefined()
      expect(emitter.onWithOptions).toBeDefined()
      expect(emitter.onceWithOptions).toBeDefined()
    })

    it('should inherit from LoggedEmitter', () => {
      expect(typeof emitter.emit).toBe('function')
      expect(emitter.log).toBeDefined()
    })
  })

  describe('Priority Listener Registration', () => {
    it('should register listeners with priority', async () => {
      const executionOrder: string[] = []

      emitter.onWithOptions(
        'priority',
        () => {
          executionOrder.push('low')
        },
        { priority: 1 as any },
      )

      emitter.onWithOptions(
        'priority',
        () => {
          executionOrder.push('high')
        },
        { priority: 10 as any },
      )

      emitter.onWithOptions(
        'priority',
        () => {
          executionOrder.push('medium')
        },
        { priority: 5 as any },
      )

      await emitter.emitWithPriority('priority', 42)

      expect(executionOrder).toEqual(['high', 'medium', 'low'])
    })

    it('should handle default priority (0)', async () => {
      const executionOrder: string[] = []

      emitter.onWithOptions('priority', () => {
        executionOrder.push('default')
      }) // No priority specified

      emitter.onWithOptions(
        'priority',
        () => {
          executionOrder.push('high')
        },
        { priority: 5 as any },
      )

      await emitter.emitWithPriority('priority', 42)

      expect(executionOrder).toEqual(['high', 'default'])
    })

    it('should handle negative priorities', async () => {
      const executionOrder: string[] = []

      emitter.onWithOptions(
        'priority',
        () => {
          executionOrder.push('negative')
        },
        { priority: -5 as any },
      )

      emitter.onWithOptions(
        'priority',
        () => {
          executionOrder.push('positive')
        },
        { priority: 1 as any },
      )

      await emitter.emitWithPriority('priority', 42)

      expect(executionOrder).toEqual(['positive', 'negative'])
    })

    it('should return unsubscribe function', async () => {
      const listener = vi.fn()

      const unsubscribe = emitter.onWithOptions('test', listener, { priority: 1 as any })

      await emitter.emitWithPriority('test', 'before')
      expect(listener).toHaveBeenCalledTimes(1)

      unsubscribe()

      await emitter.emitWithPriority('test', 'after')
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe('Filtered Listeners', () => {
    it('should filter listeners based on filter function', async () => {
      const filteredListener = vi.fn()
      const normalListener = vi.fn()

      emitter.onWithOptions('test', filteredListener, {
        priority: 1 as any,
        filter: (msg) => msg?.includes('important') ?? false,
      })

      emitter.onWithOptions('test', normalListener)

      await emitter.emitWithPriority('test', 'normal message')

      expect(filteredListener).not.toHaveBeenCalled()
      expect(normalListener).toHaveBeenCalledTimes(1)

      await emitter.emitWithPriority('test', 'important message')

      expect(filteredListener).toHaveBeenCalledTimes(1)
      expect(normalListener).toHaveBeenCalledTimes(2)
    })

    it('should combine priority and filtering', async () => {
      const executionOrder: string[] = []

      emitter.onWithOptions(
        'test',
        (msg) => {
          executionOrder.push(`high-filtered:${msg}`)
        },
        {
          priority: 10 as any,
          filter: (msg) => msg === 'special',
        },
      )

      emitter.onWithOptions(
        'test',
        (msg) => {
          executionOrder.push(`medium:${msg}`)
        },
        { priority: 5 as any },
      )

      emitter.onWithOptions(
        'test',
        (msg) => {
          executionOrder.push(`low-filtered:${msg}`)
        },
        {
          priority: 1 as any,
          filter: (msg) => msg === 'special',
        },
      )

      await emitter.emitWithPriority('test', 'normal')
      expect(executionOrder).toEqual(['medium:normal'])

      executionOrder.length = 0

      await emitter.emitWithPriority('test', 'special')
      expect(executionOrder).toEqual([
        'high-filtered:special',
        'medium:special',
        'low-filtered:special',
      ])
    })

    it('should handle complex filter conditions', async () => {
      const numberListener = vi.fn()

      emitter.onWithOptions('priority', numberListener, {
        filter: (num: number) => num > 10 && num < 100,
      })

      await emitter.emitWithPriority('priority', 5)
      expect(numberListener).not.toHaveBeenCalled()

      await emitter.emitWithPriority('priority', 50)
      expect(numberListener).toHaveBeenCalledTimes(1)

      await emitter.emitWithPriority('priority', 150)
      expect(numberListener).toHaveBeenCalledTimes(1)
    })
  })

  describe('Once Listeners with Options', () => {
    it('should register once listeners with priority', async () => {
      const executionOrder: string[] = []

      emitter.onceWithOptions(
        'test',
        () => {
          executionOrder.push('high')
        },
        { priority: 10 as any },
      )

      emitter.onceWithOptions(
        'test',
        () => {
          executionOrder.push('low')
        },
        { priority: 1 as any },
      )

      await emitter.emitWithPriority('test', 'first')
      expect(executionOrder).toEqual(['high', 'low'])

      // Second emission should not trigger once listeners
      executionOrder.length = 0
      await emitter.emitWithPriority('test', 'second')
      expect(executionOrder).toEqual([])
    })

    it('should register once listeners with filters', async () => {
      const filteredOnceListener = vi.fn()

      const unsubscribe = emitter.onceWithOptions('test', filteredOnceListener, {
        filter: (msg) => msg === 'trigger',
      })

      await emitter.emitWithPriority('test', 'normal')
      expect(filteredOnceListener).not.toHaveBeenCalled()

      await emitter.emitWithPriority('test', 'trigger')
      expect(filteredOnceListener).toHaveBeenCalledTimes(1)

      // Should not trigger again
      await emitter.emitWithPriority('test', 'trigger')
      expect(filteredOnceListener).toHaveBeenCalledTimes(1)
    })

    it('should return unsubscribe function for once listeners', async () => {
      const onceListener = vi.fn()

      const unsubscribe = emitter.onceWithOptions('test', onceListener, { priority: 5 as any })

      unsubscribe()

      await emitter.emitWithPriority('test', 'cancelled')
      expect(onceListener).not.toHaveBeenCalled()
    })

    it('should handle async once listeners', async () => {
      const asyncOnceListener = vi.fn(async ([msg]) => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return msg
      })

      emitter.onceWithOptions('test', asyncOnceListener, { priority: 5 as any })

      await emitter.emitWithPriority('test', 'async')
      expect(asyncOnceListener).toHaveBeenCalledWith('async')
    })
  })

  describe('Error Handling', () => {
    it('should catch and emit errors from priority listeners', async () => {
      const errorListener = vi.fn()
      emitter.on('error', errorListener)

      emitter.onWithOptions(
        'test',
        () => {
          throw new Error('Priority listener error')
        },
        { priority: 5 as any },
      )

      emitter.onWithOptions(
        'test',
        () => {
          throw new Error('Another priority error')
        },
        { priority: 3 as any },
      )

      await emitter.emitWithPriority('test', 'error trigger')

      expect(errorListener).toHaveBeenCalledWith([expect.any(Error), expect.any(Error)])
    })

    it('should continue execution after errors', async () => {
      const executionOrder: string[] = []

      emitter.onWithOptions(
        'test',
        () => {
          executionOrder.push('first')
          throw new Error('First error')
        },
        { priority: 10 as any },
      )

      emitter.onWithOptions(
        'test',
        () => {
          executionOrder.push('second')
        },
        { priority: 5 as any },
      )

      emitter.onWithOptions(
        'test',
        () => {
          executionOrder.push('third')
          throw new Error('Third error')
        },
        { priority: 1 as any },
      )

      await emitter.emitWithPriority('test', 'continue test')

      expect(executionOrder).toEqual(['first', 'second', 'third'])
    })

    it('should handle errors in filter functions', async () => {
      const listener = vi.fn()
      const errorListener = vi.fn()
      emitter.on('error', errorListener)

      emitter.onWithOptions('test', listener, {
        filter: () => {
          throw new Error('Filter error')
        },
      })

      await emitter.emitWithPriority('test', 'filter error test')

      // Listener should not be called due to filter error
      expect(listener).not.toHaveBeenCalled()
      // But the error should not be propagated (filter errors are silently caught)
    })
  })

  describe('Listener Management', () => {
    it('should clear all priority listeners', async () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      emitter.onWithOptions('test', listener1, { priority: 5 as any })
      emitter.onWithOptions('priority', listener2, { priority: 3 as any })

      await emitter.emitWithPriority('test', 'before clear')
      await emitter.emitWithPriority('priority', 42)

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)

      emitter.clearPriorityListeners()

      await emitter.emitWithPriority('test', 'after clear')
      await emitter.emitWithPriority('priority', 84)

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)
    })

    it('should clear priority listeners for specific event', async () => {
      const testListener = vi.fn()
      const priorityListener = vi.fn()

      emitter.onWithOptions('test', testListener, { priority: 5 as any })
      emitter.onWithOptions('priority', priorityListener, { priority: 3 as any })

      await emitter.emitWithPriority('test', 'before')
      await emitter.emitWithPriority('priority', 42)

      expect(testListener).toHaveBeenCalledTimes(1)
      expect(priorityListener).toHaveBeenCalledTimes(1)

      emitter.clearPriorityListeners('test')

      await emitter.emitWithPriority('test', 'after clear')
      await emitter.emitWithPriority('priority', 84)

      expect(testListener).toHaveBeenCalledTimes(1)
      expect(priorityListener).toHaveBeenCalledTimes(2) // Should still work
    })

    it('should count all listeners including priority and regular', async () => {
      emitter.on('test', () => {})
      emitter.on('test', () => {})
      emitter.onWithOptions('test', () => {}, { priority: 5 as any })
      emitter.onWithOptions('test', () => {}, { priority: 3 as any })

      const count = emitter.listenerCount('test')
      expect(count).toBe(4) // 2 regular + 2 priority
    })

    it('should count listeners for events with no listeners', () => {
      const count = emitter.listenerCount('noData')
      expect(count).toBe(0)
    })
  })

  describe('Integration with Regular Emittery', () => {
    it('should emit to both priority and regular listeners', async () => {
      const executionOrder: string[] = []

      emitter.on('test', (msg) => {
        executionOrder.push(`regular:${msg}`)
      })

      emitter.onWithOptions(
        'test',
        (msg) => {
          executionOrder.push(`priority:${msg}`)
        },
        { priority: 5 as any },
      )

      await emitter.emitWithPriority('test', 'mixed')

      expect(executionOrder).toEqual(['priority:mixed', 'regular:mixed'])
    })

    it('should maintain regular emittery functionality', async () => {
      const regularListener = vi.fn()

      emitter.on('test', regularListener)

      await emitter.emit('test', ['regular emit'])

      expect(regularListener).toHaveBeenCalledWith(['regular emit'])
    })
  })

  describe('LinkedList Integration', () => {
    it('should maintain sorted order with LinkedList', async () => {
      const executionOrder: string[] = []

      // Add in random order to test sorting
      emitter.onWithOptions(
        'test',
        () => {
          executionOrder.push('5')
        },
        { priority: 5 as any },
      )
      emitter.onWithOptions(
        'test',
        () => {
          executionOrder.push('10')
        },
        { priority: 10 as any },
      )
      emitter.onWithOptions(
        'test',
        () => {
          executionOrder.push('1')
        },
        { priority: 1 as any },
      )
      emitter.onWithOptions(
        'test',
        () => {
          executionOrder.push('7')
        },
        { priority: 7 as any },
      )

      await emitter.emitWithPriority('test', 'sort test')

      expect(executionOrder).toEqual(['10', '7', '5', '1'])
    })

    it('should handle many listeners efficiently', async () => {
      const listeners: (() => void)[] = []

      // Add 100 listeners with random priorities
      for (let i = 0; i < 100; i++) {
        const priority = Math.floor(Math.random() * 100)
        const listener = vi.fn()
        listeners.push(listener)

        emitter.onWithOptions('test', listener, { priority: priority as any })
      }

      const start = Date.now()
      await emitter.emitWithPriority('test', 'performance test')
      const end = Date.now()

      // Should complete reasonably quickly (less than 100ms for 100 listeners)
      expect(end - start).toBeLessThan(100)

      // All listeners should have been called
      listeners.forEach((listener) => {
        expect(listener).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty listener arrays', async () => {
      // Should not throw when no listeners are registered
      await expect(emitter.emitWithPriority('test', 'empty')).resolves.toBeUndefined()
    })

    it('should handle listeners with same priority', async () => {
      const executionOrder: string[] = []

      emitter.onWithOptions(
        'test',
        () => {
          executionOrder.push('first')
        },
        { priority: 5 as any },
      )
      emitter.onWithOptions(
        'test',
        () => {
          executionOrder.push('second')
        },
        { priority: 5 as any },
      )
      emitter.onWithOptions(
        'test',
        () => {
          executionOrder.push('third')
        },
        { priority: 5 as any },
      )

      await emitter.emitWithPriority('test', 'same priority')

      // Order should be maintained (insertion order for same priority)
      expect(executionOrder).toEqual(['first', 'second', 'third'])
    })

    it('should handle null and undefined in event args', async () => {
      const listener = vi.fn()

      emitter.onWithOptions('test', listener, {
        filter: (msg) => msg != null,
      })

      await emitter.emitWithPriority('test', null as any)
      expect(listener).not.toHaveBeenCalled()

      await emitter.emitWithPriority('test', 'valid')
      expect(listener).toHaveBeenCalledWith('valid')
    })

    it('should handle rapid emit cycles', async () => {
      const listener = vi.fn()

      emitter.onWithOptions('test', listener, { priority: 5 as any })

      const promises = []
      for (let i = 0; i < 50; i++) {
        promises.push(emitter.emitWithPriority('test', `rapid-${i}`))
      }

      await Promise.all(promises)

      expect(listener).toHaveBeenCalledTimes(50)
    })
  })
})
