import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DestroyableEmitter } from '../events/destroyable-emitter.js'

// Concrete test implementation
class TestDestroyableEmitter extends DestroyableEmitter<{
  test: [string]
  lifecycle: [string]
  noData: []
  error: [Error]
}> {}

describe('DestroyableEmitter', () => {
  let emitter: TestDestroyableEmitter
  let parent: TestDestroyableEmitter

  beforeEach(() => {
    parent = new TestDestroyableEmitter()
    emitter = new TestDestroyableEmitter(parent)
  })

  describe('Construction', () => {
    it('should create with inherited bubbling capabilities', () => {
      expect(emitter).toBeInstanceOf(TestDestroyableEmitter)
      expect(emitter.enableBubble).toBeDefined()
      expect(emitter.getParent()).toBe(parent)
    })

    it('should create without parent', () => {
      const standalone = new TestDestroyableEmitter()
      expect(standalone.getParent()).toBeUndefined()
    })

    it('should inherit from BubblingEmitter', () => {
      expect(emitter.emitWithBubble).toBeDefined()
      expect(emitter.emitSafe).toBeDefined()
      expect(emitter.log).toBeDefined()
    })
  })

  describe('Listener Management', () => {
    it('should remove all listeners with unsubscribeAll', async () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()
      const listener3 = vi.fn()

      emitter.on('test', listener1)
      emitter.on('lifecycle', listener2)
      emitter.on('noData', listener3)

      // Verify listeners are active
      await emitter.emit('test', ['before'])
      await emitter.emit('lifecycle', ['before'])
      await emitter.emit('noData')

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)
      expect(listener3).toHaveBeenCalledTimes(1)

      // Clear all listeners
      emitter.unsubscribeAll()

      // Listeners should not be called anymore
      await emitter.emit('test', ['after'])
      await emitter.emit('lifecycle', ['after'])
      await emitter.emit('noData')

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)
      expect(listener3).toHaveBeenCalledTimes(1)
    })

    it('should clear priority listeners with unsubscribeAll', async () => {
      const priorityListener = vi.fn()

      emitter.onWithOptions('test', priorityListener, { priority: 10 as any })

      await emitter.emitWithPriority('test', 'before clear')
      expect(priorityListener).toHaveBeenCalledTimes(1)

      emitter.unsubscribeAll()

      await emitter.emitWithPriority('test', 'after clear')
      expect(priorityListener).toHaveBeenCalledTimes(1)
    })

    it('should clear once listeners with unsubscribeAll', async () => {
      const onceListener = vi.fn()

      emitter.once('test').then(onceListener)

      emitter.unsubscribeAll()

      await emitter.emit('test', ['after clear'])

      // Give time for any potential async execution
      await new Promise((resolve) => setTimeout(resolve, 1))

      expect(onceListener).not.toHaveBeenCalled()
    })
  })

  describe('Destruction Process', () => {
    it('should clear all listeners on destroy', async () => {
      const listener = vi.fn()

      emitter.on('test', listener)

      await emitter.emit('test', ['before destroy'])
      expect(listener).toHaveBeenCalledTimes(1)

      emitter.destroy()

      await emitter.emit('test', ['after destroy'])
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('should clear parent reference on destroy', () => {
      expect(emitter.getParent()).toBe(parent)

      emitter.destroy()

      expect(emitter.getParent()).toBeUndefined()
    })

    it('should clear bubbling events on destroy', () => {
      emitter.enableBubble('test')
      emitter.enableBubble('lifecycle')

      expect(emitter.isBubbling('test')).toBe(true)
      expect(emitter.isBubbling('lifecycle')).toBe(true)

      emitter.destroy()

      expect(emitter.isBubbling('test')).toBe(false)
      expect(emitter.isBubbling('lifecycle')).toBe(false)
    })

    it('should flush logger on destroy', () => {
      const flushSpy = vi.spyOn((emitter as any).logger, 'flush')

      emitter.destroy()

      expect(flushSpy).toHaveBeenCalled()
    })

    it('should handle destroy when logger.flush is undefined', () => {
      // Mock logger without flush method
      const originalLogger = (emitter as any).logger
      ;(emitter as any).logger = { ...originalLogger, flush: undefined }

      // Should not throw
      expect(() => emitter.destroy()).not.toThrow()
    })

    it('should be safe to call destroy multiple times', () => {
      const flushSpy = vi.spyOn((emitter as any).logger, 'flush')

      emitter.destroy()
      emitter.destroy()
      emitter.destroy()

      // Flush might be called multiple times, but should not throw
      expect(() => emitter.destroy()).not.toThrow()
    })
  })

  describe('Integration with BubblingEmitter', () => {
    it('should stop bubbling after destruction', async () => {
      const parentListener = vi.fn()
      const childListener = vi.fn()

      parent.on('test', parentListener)
      emitter.on('test', childListener)
      emitter.enableBubble('test')

      // Before destruction - should bubble
      await emitter.emitWithBubble('test', 'before destroy')

      expect(childListener).toHaveBeenCalledTimes(1)
      expect(parentListener).toHaveBeenCalledTimes(1)

      // Destroy the emitter
      emitter.destroy()

      // After destruction - should not bubble or emit locally
      await emitter.emitWithBubble('test', 'after destroy')

      expect(childListener).toHaveBeenCalledTimes(1)
      expect(parentListener).toHaveBeenCalledTimes(1)
    })

    it('should use dispose method inherited from BubblingEmitter', () => {
      const disposeSpy = vi.spyOn(emitter, 'dispose')

      emitter.destroy()

      expect(disposeSpy).toHaveBeenCalled()
    })
  })

  describe('Lifecycle Events', () => {
    it('should emit events normally before destruction', async () => {
      const lifecycleListener = vi.fn()

      emitter.on('lifecycle', lifecycleListener)

      await emitter.emit('lifecycle', ['created'])
      await emitter.emit('lifecycle', ['running'])

      expect(lifecycleListener).toHaveBeenCalledTimes(2)
      expect(lifecycleListener).toHaveBeenCalledWith(['created'])
      expect(lifecycleListener).toHaveBeenCalledWith(['running'])
    })

    it('should not emit events after destruction', async () => {
      const lifecycleListener = vi.fn()

      emitter.on('lifecycle', lifecycleListener)

      await emitter.emit('lifecycle', ['before'])

      emitter.destroy()

      await emitter.emit('lifecycle', ['after'])

      expect(lifecycleListener).toHaveBeenCalledTimes(1)
      expect(lifecycleListener).toHaveBeenCalledWith(['before'])
    })
  })

  describe('Error Handling During Destruction', () => {
    it('should handle logger flush errors gracefully', () => {
      // Mock logger flush to throw error
      vi.spyOn((emitter as any).logger, 'flush').mockImplementation(() => {
        throw new Error('Flush error')
      })

      // Should not throw despite logger error
      expect(() => emitter.destroy()).not.toThrow()
    })

    it('should handle dispose errors gracefully', () => {
      // Mock dispose to throw error
      vi.spyOn(emitter, 'dispose').mockImplementation(() => {
        throw new Error('Dispose error')
      })

      // Should still try to flush logger despite dispose error
      const flushSpy = vi.spyOn((emitter as any).logger, 'flush')

      expect(() => emitter.destroy()).not.toThrow()
      expect(flushSpy).toHaveBeenCalled()
    })

    it('should handle errors in unsubscribeAll', () => {
      // Mock clearListeners to throw error
      vi.spyOn(emitter, 'clearListeners').mockImplementation(() => {
        throw new Error('Clear listeners error')
      })

      // Should not throw
      expect(() => emitter.unsubscribeAll()).not.toThrow()
    })
  })

  describe('Memory Management', () => {
    it('should prevent memory leaks by clearing references', () => {
      const weakRef = new WeakRef(parent)

      emitter.destroy()

      // Parent reference should be cleared
      expect(emitter.getParent()).toBeUndefined()

      // Force garbage collection test would require more complex setup
      // This test verifies the reference is explicitly cleared
    })

    it('should clear bubbling event set to free memory', () => {
      emitter.enableBubble('test')
      emitter.enableBubble('lifecycle')
      emitter.enableBubble('noData')

      const bubblingEvents = emitter.getBubblingEvents()
      expect(bubblingEvents.size).toBe(3)

      emitter.destroy()

      const bubblingEventsAfter = emitter.getBubblingEvents()
      expect(bubblingEventsAfter.size).toBe(0)
    })
  })

  describe('Inheritance and Extensibility', () => {
    it('should support custom destruction logic in subclasses', () => {
      class CustomDestroyableEmitter extends TestDestroyableEmitter {
        private _customCleanup = vi.fn()

        destroy(): void {
          this._customCleanup()
          super.destroy()
        }

        get customCleanup() {
          return this._customCleanup
        }
      }

      const custom = new CustomDestroyableEmitter()
      custom.destroy()

      expect(custom.customCleanup).toHaveBeenCalled()
      expect(custom.getParent()).toBeUndefined()
    })

    it('should maintain proper prototype chain', () => {
      expect(emitter).toBeInstanceOf(TestDestroyableEmitter)
      expect(emitter).toBeInstanceOf(DestroyableEmitter)

      // Should have methods from all parent classes
      expect(typeof emitter.destroy).toBe('function')
      expect(typeof emitter.dispose).toBe('function')
      expect(typeof emitter.enableBubble).toBe('function')
      expect(typeof emitter.emitSafe).toBe('function')
      expect(typeof emitter.emit).toBe('function')
    })
  })

  describe('Edge Cases and Robustness', () => {
    it('should handle destruction of emitter with no listeners', () => {
      const empty = new TestDestroyableEmitter()

      // Should not throw
      expect(() => empty.destroy()).not.toThrow()
      expect(empty.getParent()).toBeUndefined()
    })

    it('should handle destruction of emitter with parent but no bubbling', () => {
      const child = new TestDestroyableEmitter(parent)

      // No bubbling enabled, just destroy
      expect(() => child.destroy()).not.toThrow()
      expect(child.getParent()).toBeUndefined()
    })

    it('should handle async listeners during destruction', async () => {
      const asyncListener = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50)) // Increased delay
      })

      emitter.on('test', asyncListener)

      // Start async emission
      const emitPromise = emitter.emit('test', ['async'])

      // Add a small delay to ensure emission starts before destruction
      await new Promise((resolve) => setTimeout(resolve, 1))

      // Destroy immediately after emission has started
      emitter.destroy()

      // Wait for emission to complete
      await emitPromise

      expect(asyncListener).toHaveBeenCalled()

      // Further emissions should not work
      await emitter.emit('test', ['after destroy'])
      expect(asyncListener).toHaveBeenCalledTimes(1)
    })

    it('should handle rapid destroy/emit cycles', async () => {
      for (let i = 0; i < 10; i++) {
        const testEmitter = new TestDestroyableEmitter()
        const listener = vi.fn()

        testEmitter.on('test', listener)
        await testEmitter.emit('test', [`test${i}`])
        testEmitter.destroy()

        expect(listener).toHaveBeenCalledTimes(1)
      }
    })
  })
})
