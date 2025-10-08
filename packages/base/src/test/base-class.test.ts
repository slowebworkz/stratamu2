it('should expose SafeEmitter public methods and properties', () => {
  const instance = new TestClass()
  // SafeEmitter public API (from Emittery)
  expect(typeof instance.on).toBe('function')
  expect(typeof instance.off).toBe('function')
  expect(typeof instance.emit).toBe('function')
  expect(typeof instance.once).toBe('function')
})
import type { BaseEventMap } from '@repo/types'
import { describe, expect, it, vi } from 'vitest'
import { BaseClass } from '../base-class.js'

// Example event map for testing
interface TestEvents extends BaseEventMap<any> {
  foo: [string]
  bar: [number]
}

// Concrete test class
class TestClass extends BaseClass<TestEvents> {
  // Expose public event API for testing
  public on = super.on
  public emit = super.emit
}

describe('BaseClass', () => {
  it('should instantiate a subclass without error', () => {
    const instance = new TestClass()
    expect(instance).toBeInstanceOf(TestClass)
  })

  it('should emit and listen to events', async () => {
    const instance = new TestClass()
    const handler = vi.fn()
    instance.on('foo', (data: [string]) => {
      handler(data[0])
    })
    await instance.emit('foo', ['hello'])
    expect(handler).toHaveBeenCalledWith('hello')
  })

  it('should support multiple event types', async () => {
    const instance = new TestClass()
    const fooHandler = vi.fn()
    const barHandler = vi.fn()
    instance.on('foo', (data: [string]) => {
      fooHandler(data[0])
    })
    instance.on('bar', (data: [number]) => {
      barHandler(data[0])
    })
    await instance.emit('foo', ['abc'])
    await instance.emit('bar', [42])
    expect(fooHandler).toHaveBeenCalledWith('abc')
    expect(barHandler).toHaveBeenCalledWith(42)
  })

  it('should expose LoggedEmitter logging and config methods', () => {
    const instance = new TestClass()
    expect(instance.log).toBeDefined()
    expect(typeof instance.log.info).toBe('function')
    expect(typeof instance.level).toBe('string')
    expect(typeof instance.isLevelEnabled).toBe('function')
    expect(typeof instance.levelValue).toBe('number')
    expect(typeof instance.levels).toBe('object')
    expect(typeof instance.getBindings).toBe('function')
    expect(typeof instance.setBindings).toBe('function')
    expect(typeof instance.createChildLogger).toBe('function')
    expect(typeof instance.flush).toBe('function')
    expect(typeof instance.onLevelChange).toBe('function')
    expect(typeof instance.offLevelChange).toBe('function')
  })
})
