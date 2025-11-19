import { BaseError } from "@/errors"
import { getGlobalThis } from "./index.ts"

/**
 * Small diagnostics helper that prefers Node's `process.emitWarning`
 * for non-fatal diagnostics and falls back to `console.error` when
 * not available (browsers, restricted runtimes).
 */
export async function emitDiagnosticWarning(message: string, err?: unknown): Promise<string> {
  try {
    const g = getGlobalThis() as typeof globalThis
    const emitWarning = g?.process?.emitWarning

    let text: string
    if (BaseError.is(err)) {
      text = `${message}: ${err.toString()}`
    } else if (err instanceof Error) {
      text = `${message}: ${err.message}\n${err.stack ?? ""}`
    } else if (err !== undefined) {
      text = `${message}: ${String(err)}`
    } else {
      text = message
    }

    if (typeof emitWarning === "function") {
      emitWarning(text)
    }
    // Always return the formatted text for external logging
    return text
  } catch {
    // never throw from diagnostics
    return message
  }
}
