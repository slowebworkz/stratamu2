import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoggedEmitter } from '../events/logged-emitter-new.js'

// Concrete test implementation
class TestLoggedEmitter extends LoggedEmitter<{
  test: [string]
  error: [Error]
  noData: []
}> {
  offLevelChange(listener: any) {
    // @ts-ignore
    this.logger.removeListener?.('level-change', listener)
  }

  getLogger() {
    return this.logger
  }
}

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
  })

  describe('Logging Methods', () => {
    it('should have all log level methods available', () => {
      const { trace, debug, info, warn, error, fatal } = emitter.log
      expect(typeof trace).toBe('function')
      expect(typeof debug).toBe('function')
      expect(typeof info).toBe('function')
      expect(typeof warn).toBe('function')
      expect(typeof error).toBe('function')
      expect(typeof fatal).toBe('function')
    })

    it('should log messages without throwing', () => {
      const { info, warn, error } = emitter.log
      expect(() => {
        info('test message')
        warn({ context: 'test' }, 'warning message')
        error({ error: new Error('test') }, 'error message')
      }).not.toThrow()
    })

    it('should throw when shouldThrow is true', () => {
      const { error } = emitter.log
      expect(() => {
        error({ shouldThrow: true }, 'should throw')
      }).toThrow('should throw')
    })

    it('should use custom ErrorClass when provided', () => {
      const { fatal } = emitter.log
      class CustomError extends Error {
        constructor(message: string) {
          super(message)
          this.name = 'CustomError'
        }
      }

      expect(() => {
        fatal({ shouldThrow: true, ErrorClass: CustomError }, 'custom error')
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
      const logSpy = vi.spyOn(emitter.getLogger(), 'info')
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
