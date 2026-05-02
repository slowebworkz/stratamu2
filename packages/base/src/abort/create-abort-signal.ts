import type { Milliseconds } from "../data"
import { normalizeTimeout } from "../data"
import { isObject } from "../utils"

export interface CreateAbortOptions {
  /** Timeout duration in milliseconds before automatic abort. */
  timeoutMs?: Milliseconds | null | undefined
}

interface AbortResources {
  controller: AbortController
  signal: AbortSignal
  timerId?: ReturnType<typeof setTimeout>
  cleanup?: () => void | Promise<void>
}

function hasUnref(timer: unknown): timer is { unref: () => void } {
  return isObject(timer) && typeof timer?.unref === "function"
}

/**
 * Creates an AbortController and its signal.
 */
function makeAbortResources(): AbortResources {
  const controller = new AbortController()
  return { controller, signal: controller.signal }
}

/**
 * Starts a timer that aborts after `timeoutMs`.
 * Any existing timer is cleared before starting a new one.
 */
function setAbortTimer(resources: AbortResources, timeoutMs: Milliseconds): void {
  clearAbortTimer(resources)

  const timer = setTimeout(() => {
    try {
      resources.controller.abort("timeout")
    } catch {
      /* ignore controller reentrancy errors */
    }
  }, timeoutMs)

  resources.timerId = timer

  // Node.js optimization: unref timer so it doesn't block process exit
  if (hasUnref(timer)) {
    try {
      timer.unref()
    } catch {
      /* ignore non-Node timers */
    }
  }
}

/**
 * Clears any existing timeout timer.
 */
function clearAbortTimer(resources: AbortResources): void {
  if (resources.timerId !== undefined) {
    clearTimeout(resources.timerId)
    resources.timerId = undefined
  }
}

const setNoopCleanup = (resources: AbortResources) => {
  resources.cleanup = () => {}
}

/**
 * Attaches an abort listener that triggers `onAbort` once,
 * and registers a cleanup handler.
 */
function attachAbortListener(resources: AbortResources, onAbort: () => void): void {
  const { signal } = resources

  if (signal.aborted) {
    // Already aborted: run soon but asynchronously.
    queueMicrotask(onAbort)
    setNoopCleanup(resources)
    return
  }

  signal.addEventListener("abort", onAbort)
  resources.cleanup = () => signal.removeEventListener("abort", onAbort)
}

/**
 * Builds the public-facing API for consumers.
 */
function buildPublicResult(resources: AbortResources) {
  return {
    signal: resources.signal,
    controller: resources.controller,

    /**
     * Clears any active timer and detaches abort listeners.
     */
    async clear(): Promise<void> {
      clearAbortTimer(resources)
      const c = resources.cleanup
      if (!c) return
      try {
        await c()
      } catch {
        /* swallow cleanup errors; best-effort API */
      }
    },
  }
}

/**
 * Creates an AbortController + AbortSignal pair that auto-aborts after an optional timeout.
 *
 * - Timeout is normalized via `normalizeTimeout`
 * - Works in Node, browsers, and edge runtimes
 * - Returns an object with `{ signal, controller, clear() }`
 */
export function createAbortSignal(options?: CreateAbortOptions) {
  const timeout = normalizeTimeout(options?.timeoutMs)
  const resources = makeAbortResources()

  if (timeout !== undefined) {
    setAbortTimer(resources, timeout)
  }

  attachAbortListener(resources, () => clearAbortTimer(resources))

  return buildPublicResult(resources)
}
