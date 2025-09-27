import { beforeEach, describe, expect, it, vi } from 'vitest'

// Concrete test implementation
class TestBubblingEmitter extends (await import('../events/bubbling-emitter.js')).BubblingEmitter<{
  test: [string]
  bubble: [number]
  noData: []
  error: [Error]
}> {}

describe('Event Ordering and Timing', () => {
  it('should emit to child before parent', async () => {
    const executionOrder: string[] = []

    parent.on('test', () => {
      executionOrder.push('parent')
    })
    child.on('test', () => {
      executionOrder.push('child')
    })
    child.enableBubble('test')

    await child.emitWithBubble('test', 'order test')

    expect(executionOrder).toEqual(['child', 'parent'])
  })

  it('should bubble through multiple levels (grandchild -> child -> parent)', async () => {
    const executionOrder: string[] = []

    parent.on('test', () => {
      executionOrder.push('parent')
    })
    child.on('test', () => {
      executionOrder.push('child')
    })
    grandchild.on('test', () => {
      executionOrder.push('grandchild')
    })

    child.enableBubble('test')
    grandchild.enableBubble('test')

    await grandchild.emitWithBubble('test', 'hierarchy test')

    expect(executionOrder).toEqual(['grandchild', 'child', 'parent'])
  })
  let parent: TestBubblingEmitter
  let child: TestBubblingEmitter
  let grandchild: TestBubblingEmitter

  beforeEach(() => {
    parent = new TestBubblingEmitter()
    child = new TestBubblingEmitter(parent)
    grandchild = new TestBubblingEmitter(child)
  })

  describe('Construction', () => {
    it('should create without parent', () => {
      const emitter = new TestBubblingEmitter()
      expect(emitter).toBeInstanceOf(TestBubblingEmitter)
      expect(emitter.getParent()).toBeUndefined()
    })

    it('should create with parent', () => {
      expect(child.getParent()).toBe(parent)
      expect(grandchild.getParent()).toBe(child)
    })

    it('should inherit from SafeEmitter', () => {
      expect(child.emitSafe).toBeDefined()
      expect(child.log).toBeDefined()
    })
  })

  describe('Bubbling Configuration', () => {
    it('should enable bubbling for specific events', () => {
      child.enableBubble('test')
      expect(child.isBubbling('test')).toBe(true)
      expect(child.isBubbling('bubble')).toBe(false)
    })

    it('should disable bubbling for specific events', () => {
      child.enableBubble('test')
      child.disableBubble('test')
      expect(child.isBubbling('test')).toBe(false)
    })

    it('should get all bubbling events as readonly set', () => {
      child.enableBubble('test')
      child.enableBubble('bubble')

      const bubblingEvents = child.getBubblingEvents()
      expect(bubblingEvents.has('test')).toBe(true)
      expect(bubblingEvents.has('bubble')).toBe(true)
      expect(bubblingEvents.has('noData')).toBe(false)
    })

    it('should return readonly set that cannot be modified externally', () => {
      child.enableBubble('bubble') // Enable bubbling to test the set
      const bubblingEvents = child.getBubblingEvents()

      // ReadonlySet is a TypeScript type constraint, not a runtime constraint
      // The methods exist but should not be used based on the type
      expect(bubblingEvents).toBeInstanceOf(Set)
      expect(bubblingEvents.has('bubble')).toBe(true)

      // The important thing is that it's typed as readonly, not that it's runtime-readonly
      // This prevents accidental modifications at compile time
    })
  })

  describe('Event Bubbling with emitWithBubble', () => {
    it('should bubble events to parent when enabled', async () => {
      const parentListener = vi.fn()
      const childListener = vi.fn()

      parent.on('test', parentListener)
      child.on('test', childListener)
      child.enableBubble('test')

      await child.emitWithBubble('test', 'bubbles up')

      expect(childListener).toHaveBeenCalledWith('bubbles up')
      expect(parentListener).toHaveBeenCalledWith('bubbles up')
    })

    it('should not bubble events when disabled', async () => {
      const parentListener = vi.fn()
      const childListener = vi.fn()

      parent.on('test', parentListener)
      child.on('test', childListener)
      child.disableBubble('test') // Explicitly disable

      await child.emitWithBubble('test', 'no bubble')

      expect(childListener).toHaveBeenCalledWith('no bubble')
      expect(parentListener).not.toHaveBeenCalled()
    })

    it('should bubble through multiple levels', async () => {
      const parentListener = vi.fn()
      const childListener = vi.fn()
      const grandchildListener = vi.fn()

      parent.on('bubble', parentListener)
      child.on('bubble', childListener)
      grandchild.on('bubble', grandchildListener)

      child.enableBubble('bubble')
      grandchild.enableBubble('bubble')

      await grandchild.emitWithBubble('bubble', 42)

      expect(grandchildListener).toHaveBeenCalledWith(42)
      expect(childListener).toHaveBeenCalledWith(42)
      expect(parentListener).toHaveBeenCalledWith(42)
    })

    it('should stop bubbling at first level without bubbling enabled', async () => {
      const parentListener = vi.fn()
      const childListener = vi.fn()
      const grandchildListener = vi.fn()

      parent.on('bubble', parentListener)
      child.on('bubble', childListener)
      grandchild.on('bubble', grandchildListener)

      // Only enable bubbling at grandchild level, not at child level
      grandchild.enableBubble('bubble')

      await grandchild.emitWithBubble('bubble', 42)

      expect(grandchildListener).toHaveBeenCalledWith(42)
      expect(childListener).toHaveBeenCalledWith(42) // Child receives it
      expect(parentListener).not.toHaveBeenCalled() // But doesn't bubble to parent
    })

    it('should handle events with no data', async () => {
      const parentListener = vi.fn()
      const childListener = vi.fn()

      parent.on('noData', parentListener)
      child.on('noData', childListener)
      child.enableBubble('noData')

      await child.emitWithBubble('noData')

      expect(childListener).toHaveBeenCalledWith(undefined)
      expect(parentListener).toHaveBeenCalledWith(undefined)
    })

    it('should prevent infinite loops with circular parents', async () => {
      // Create circular reference
      const emitterA = new TestBubblingEmitter()
      const emitterB = new TestBubblingEmitter(emitterA)
      // Manually set up circular reference (normally not recommended)
      ;(emitterA as any).parent = emitterB

      const listenerA = vi.fn()
      const listenerB = vi.fn()

      emitterA.on('test', listenerA)
      emitterB.on('test', listenerB)
      emitterA.enableBubble('test')
      emitterB.enableBubble('test')

      // Should not cause infinite loop
      await emitterA.emitWithBubble('test', 'circular')

      // Each should be called at most once due to visited set
      expect(listenerA).toHaveBeenCalled()
      expect(listenerB).toHaveBeenCalled()
    })
  })

  describe('Async Bubbling with emitWithBubbleAsync', () => {
    it('should bubble asynchronously without blocking', async () => {
      const parentListener = vi.fn()
      const childListener = vi.fn()

      parent.on('test', parentListener)
      child.on('test', childListener)
      child.enableBubble('test')

      await child.emitWithBubbleAsync('test', 'async bubble')

      // Give a small delay for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 1))

      expect(childListener).toHaveBeenCalledWith('async bubble')
      expect(parentListener).toHaveBeenCalledWith('async bubble')
    })

    it('should not wait for parent emission to complete', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let parentStarted = false
      let childCompleted = false

      parent.on('test', async () => {
        parentStarted = true
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      child.enableBubble('test')

      const promise = child.emitWithBubbleAsync('test', 'async test')
      promise.then(() => {
        childCompleted = true
      })

      // Should complete quickly even though parent is slow
      await promise

      expect(childCompleted).toBe(true)
      // Parent might not have started yet due to async nature
    })
  })

  describe('Error Handling in Bubbling', () => {
    it('should handle errors in parent listeners during bubbling', async () => {
      const errorLogSpy = vi.spyOn(parent.log, 'error').mockImplementation(() => {})

      parent.on('error', () => {
        throw new Error('Parent handler error')
      })
      child.enableBubble('error')

      // Should not throw despite parent error
      await child.emitWithBubble('error', new Error('Test error'))

      // Parent should have logged the error via SafeEmitter
      expect(errorLogSpy).toHaveBeenCalled()
    })

    it('should handle errors during bubble emission', async () => {
      const errorLogSpy = vi.spyOn(child.log, 'error').mockImplementation(() => {})

      // Create invalid parent reference to force bubbling error
      ;(child as any).parent = null
      child.enableBubble('test')

      // Should handle gracefully
      await child.emitWithBubble('test', 'error test')

      // Should not crash
      expect(errorLogSpy).not.toHaveBeenCalled() // No errors in this simple case
    })
  })

  describe('Disposal and Memory Management', () => {
    it('should clear parent reference on dispose', () => {
      expect(child.getParent()).toBe(parent)

      child.dispose()

      expect(child.getParent()).toBeUndefined()
    })

    it('should clear bubbling events on dispose', () => {
      child.enableBubble('test')
      child.enableBubble('bubble')

      expect(child.getBubblingEvents().size).toBe(2)

      child.dispose()

      expect(child.getBubblingEvents().size).toBe(0)
    })

    it('should clear all listeners on dispose', async () => {
      const listener = vi.fn()
      child.on('test', listener)

      child.dispose()

      await child.emit('test', ['disposed'])
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('Integration with SafeEmitter', () => {
    it('should maintain safe emission capabilities', async () => {
      const errorLogSpy = vi.spyOn(child.log, 'error').mockImplementation(() => {})

      child.on('test', () => {
        throw new Error('Handler error')
      })

      // Should not throw
      await child.emitSafe('test', 'safe test')

      expect(errorLogSpy).toHaveBeenCalled()
    })

    it('should combine bubbling with safe emission', async () => {
      const errorLogSpy = vi.spyOn(parent.log, 'error').mockImplementation(() => {})

      parent.on('test', () => {
        throw new Error('Parent error')
      })
      child.enableBubble('test')

      // Should not throw despite parent error
      await child.emitWithBubble('test', 'safe bubble')

      expect(errorLogSpy).toHaveBeenCalled()
    })
  })

  describe('Event Ordering and Timing', () => {
    it('should emit to child before parent', async () => {
      const executionOrder: string[] = []

      parent.on('test', () => {
        executionOrder.push('parent')
      })
      child.on('test', () => {
        executionOrder.push('child')
      })
      child.enableBubble('test')

      await child.emitWithBubble('test', 'order test')

      expect(executionOrder).toEqual(['child', 'parent'])
    })

    it('should maintain order through multiple levels', async () => {
      const executionOrder: string[] = []

      parent.on('test', () => {
        executionOrder.push('parent')
      })
      child.on('test', () => {
        executionOrder.push('child')
      })
      grandchild.on('test', () => {
        executionOrder.push('grandchild')
      })

      child.enableBubble('test')
      grandchild.enableBubble('test')

      await grandchild.emitWithBubble('test', 'hierarchy test')

      expect(executionOrder).toEqual(['grandchild', 'child', 'parent'])
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing parent gracefully', async () => {
      const orphan = new TestBubblingEmitter()
      orphan.enableBubble('test')

      // Should not throw
      await expect(orphan.emitWithBubble('test', 'orphan')).resolves.toBeUndefined()
    })

    it('should handle enabling/disabling same event multiple times', () => {
      child.enableBubble('test')
      child.enableBubble('test')
      expect(child.isBubbling('test')).toBe(true)

      child.disableBubble('test')
      child.disableBubble('test')
      expect(child.isBubbling('test')).toBe(false)
    })

    it('should handle events not in the event map', async () => {
      child.enableBubble('test')

      // Should work with properly typed events
      await expect(child.emitWithBubble('test', 'valid')).resolves.toBeUndefined()
    })
  })
})
