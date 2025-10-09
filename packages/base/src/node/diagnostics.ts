import { getGlobalThis } from './global-this.js'

/**
 * Small diagnostics helper that prefers Node's `process.emitWarning`
 * for non-fatal diagnostics and falls back to `console.error` when
 * not available (browsers, restricted runtimes).
 */
export function emitDiagnosticWarning(message: string, err?: unknown): void {
  try {
    const g = getGlobalThis() as typeof globalThis
    const emitWarning = g?.process?.emitWarning

    if (typeof emitWarning === 'function') {
      const text =
        err instanceof Error
          ? `${message}: ${err.message}\n${err.stack ?? ''}`
          : err !== undefined
            ? `${message}: ${String(err)}`
            : message
      emitWarning(text)
    } else {
      console.error(message, err)
    }
  } catch {
    // never throw from diagnostics
  }
}
