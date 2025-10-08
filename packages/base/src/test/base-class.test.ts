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
})
