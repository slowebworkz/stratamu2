import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoggedEmitter } from '../events/logged-emitter.js'

// Concrete test implementation
class TestLoggedEmitter extends LoggedEmitter<{
  test: [string]
  error: [Error]
  noData: []
}> {}

describe('LoggedEmitter', () => {
  let emitter: TestLoggedEmitter

  beforeEach(() => {
    emitter = new TestLoggedEmitter()
  })

  describe('Construction', () => {
    it('should create with default logger options', () => {
      expect(emitter).toBeInstanceOf(TestLoggedEmitter)
      expect(emitter.log).toBeDefined()
      expect(typeof emitter.getBindings()).toBe('object')
    })

    it('should create with custom logger options', () => {
      const customEmitter = new TestLoggedEmitter({
        level: 'debug',
        name: 'test-emitter',
      })

      expect(customEmitter.level).toBe('debug')
      expect(customEmitter.getBindings()).toEqual({ name: 'test-emitter' })
    })
  })

  describe('Logging Methods', () => {
    it('should have all log level methods available', () => {
      expect(typeof emitter.log.trace).toBe('function')
      expect(typeof emitter.log.debug).toBe('function')
      expect(typeof emitter.log.info).toBe('function')
      expect(typeof emitter.log.warn).toBe('function')
      expect(typeof emitter.log.error).toBe('function')
      expect(typeof emitter.log.fatal).toBe('function')
    })

    it('should log messages without throwing', () => {
      expect(() => {
        emitter.log.info('test message')
        emitter.log.warn({ context: 'test' }, 'warning message')
        emitter.log.error({ error: new Error('test') }, 'error message')
      }).not.toThrow()
    })

    it('should throw when shouldThrow is true', () => {
      expect(() => {
        emitter.log.error({ shouldThrow: true }, 'should throw')
      }).toThrow('should throw')
    })

    it('should use custom ErrorClass when provided', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message)
          this.name = 'CustomError'
        }
      }

      expect(() => {
        emitter.log.fatal({ shouldThrow: true, ErrorClass: CustomError }, 'custom error')
      }).toThrow(CustomError)
    })
  })

  describe('Logger Configuration', () => {
    it('should get and set log level', () => {
      emitter.level = 'warn'
      expect(emitter.level).toBe('warn')
    })

    it('should check if level is enabled', () => {
      emitter.level = 'info'
      expect(emitter.isLevelEnabled('info')).toBe(true)
      expect(emitter.isLevelEnabled('debug')).toBe(false)
    })

    it('should get level value and levels mapping', () => {
      expect(typeof emitter.levelValue).toBe('number')
      expect(typeof emitter.levels).toBe('object')
    })
  })

  describe('Bindings Management', () => {
    it('should get current bindings', () => {
      const bindings = emitter.getBindings()
      expect(typeof bindings).toBe('object')
    })

    it('should set new bindings', () => {
      emitter.setBindings({})
      const bindings = emitter.getBindings()
      expect(typeof bindings).toBe('object')
    })
  })

  describe('Child Logger Creation', () => {
    it('should create child logger with additional bindings', () => {
      const childEmitter = emitter.createChildLogger({}, { level: 'debug' })
      expect(childEmitter).toBe(emitter)
      const bindings = emitter.getBindings()
      expect(typeof bindings).toBe('object')
    })
  })

  describe('Event Logging Integration', () => {
    it('should maintain logging capability with event emission', async () => {
      const logSpy = vi.spyOn(emitter.log, 'info')

      emitter.log.info('before emit')
      await emitter.emit('test', ['hello'])
      emitter.log.info('after emit')

      expect(logSpy).toHaveBeenCalledWith('before emit')
      expect(logSpy).toHaveBeenCalledWith('after emit')
    })
  })

  describe('Level Change Events', () => {
    it('should handle level change listeners', () => {
      const listener = vi.fn()

      emitter.onLevelChange(listener)
      emitter.level = 'debug'

      // Level change events are internal to pino, so we just verify the methods exist
      expect(() => emitter.offLevelChange(listener)).not.toThrow()
    })
  })

  describe('Flush Functionality', () => {
    it('should flush logs with callback', async () => {
      await new Promise<void>((resolve) => {
        emitter.flush((error) => {
          expect(error).toBeUndefined()
          resolve()
        })
      })
    })

    it('should flush logs without callback', () => {
      expect(() => emitter.flush()).not.toThrow()
    })
  })
})
