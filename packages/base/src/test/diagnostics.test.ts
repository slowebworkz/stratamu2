import { afterEach, describe, expect, it, vi } from 'vitest'
import { emitDiagnosticWarning } from '../node/index.js'

describe('emitDiagnosticWarning', () => {
  const realProcess = (globalThis as any).process
  const realConsoleError = console.error

  afterEach(() => {
    // restore
    ;(globalThis as any).process = realProcess
    console.error = realConsoleError
    vi.restoreAllMocks()
  })

  it('calls process.emitWarning when available', () => {
    const emitWarning = vi.fn()
    ;(globalThis as any).process = { emitWarning }

    emitDiagnosticWarning('test message', new Error('boom'))

    expect(emitWarning).toHaveBeenCalled()
    const calledWith = (emitWarning as any).mock!.calls[0][0] as string
    expect(calledWith).toContain('test message')
    expect(calledWith).toContain('boom')
  })

  it('falls back to console.error when process.emitWarning is not present', () => {
    ;(globalThis as any).process = undefined
    const errSpy = vi.fn()
    console.error = errSpy

    emitDiagnosticWarning('fallback message', 'something')

    expect(errSpy).toHaveBeenCalledWith('fallback message', 'something')
  })
})
