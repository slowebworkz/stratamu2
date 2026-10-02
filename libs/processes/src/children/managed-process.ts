import type { ChildProcess } from "node:child_process"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"

import { Base } from "@stratamu/base"
import type { ExceptionalError } from "@stratamu/capabilities"

import type { ExecutionOptions, ProcessState } from "../shared/lifecycle.ts"
import type { ProcessDefinition } from "./process-definition.ts"
import type { ProcessResult } from "./process-result.ts"

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024
const DEFAULT_STOP_TIMEOUT_MS = 5000

export interface ProcessOutputOptions {
  readonly maxOutputBytes?: number
}

/** Lifecycle callbacks a `ChildProcessManager` wires up to re-emit on its own shared event bus --
 * not part of the public `ManagedProcess` surface, since a bare `createManagedProcess` caller has
 * no bus to forward to. */
export interface ManagedProcessHooks {
  onStarted?: (pid: number) => void
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
  onExited?: (exitCode: number | undefined, signal: NodeJS.Signals | undefined) => void
  onFailed?: (error: ExceptionalError) => void
  onStopped?: () => void
  onKilled?: () => void
}

export interface ManagedProcessOptions extends ExecutionOptions, ProcessOutputOptions {
  readonly hooks?: ManagedProcessHooks
  /** The instance id to use instead of generating one. Lets a caller (`ChildProcessManager`) know
   * the id up front, before this process's own lifecycle events can fire. */
  readonly id?: string
}

export interface StopOptions {
  readonly signal?: NodeJS.Signals
  readonly timeoutMs?: number
}

/**
 * A single spawned child process and its lifecycle: state, exit status, captured output, and
 * graceful-then-forced termination. `ChildProcessManager.run`/`start` are thin wrappers over this
 * -- it is the one place lifecycle logic lives.
 */
export interface ManagedProcess {
  readonly id: string
  readonly definition: ProcessDefinition
  readonly pid: number | undefined
  readonly state: ProcessState
  readonly exitCode: number | undefined
  readonly signal: NodeJS.Signals | undefined
  /** Resolves once the process has reached a terminal state. */
  readonly settled: Promise<ProcessResult>
  /** Raw stdin write. Returns `false` if stdin isn't currently writable (not yet spawned, or
   * already closed) rather than throwing -- a caller that wants to know why inspects `state`. */
  write(data: string): boolean
  /** Sends `signal` (default `SIGTERM`), waits up to `timeoutMs` (default 5000ms) for the process
   * to exit, then escalates to `SIGKILL` with one more wait if it hasn't. Resolves once that
   * sequence completes, whether or not the process actually died -- a timeout can only attempt
   * forced termination, not guarantee it. */
  stop(options?: StopOptions): Promise<void>
  /** Sends `SIGKILL` immediately, with no grace period. */
  kill(): Promise<void>
}

/** Accumulates stream chunks up to `maxBytes`, after which further chunks are dropped and
 * `truncated` is set -- bounds the buffered result string without affecting what's still
 * delivered live to a streaming consumer. */
class BoundedOutputBuffer {
  readonly #chunks: Buffer[] = []
  #bytes = 0
  #truncated = false

  constructor(private readonly maxBytes: number) {}

  append(chunk: Buffer): void {
    if (this.#truncated) {
      return
    }
    const remaining = this.maxBytes - this.#bytes
    if (remaining <= 0) {
      this.#truncated = true
      return
    }
    if (chunk.length > remaining) {
      this.#chunks.push(chunk.subarray(0, remaining))
      this.#bytes += remaining
      this.#truncated = true
      return
    }
    this.#chunks.push(chunk)
    this.#bytes += chunk.length
  }

  get value(): string {
    return Buffer.concat(this.#chunks).toString("utf8")
  }

  get truncated(): boolean {
    return this.#truncated
  }
}

const TERMINAL_STATES: ReadonlySet<ProcessState> = new Set([
  "completed",
  "failed",
  "cancelled",
  "timed-out",
])

class ManagedProcessImpl extends Base implements ManagedProcess {
  readonly id: string
  readonly definition: ProcessDefinition
  readonly settled: Promise<ProcessResult>

  readonly #child: ChildProcess
  readonly #hooks: ManagedProcessHooks
  readonly #stdout: BoundedOutputBuffer
  readonly #stderr: BoundedOutputBuffer
  #state: ProcessState = "starting"
  #exitCode: number | undefined
  #signal: NodeJS.Signals | undefined
  #pendingReason: "cancelled" | "timed-out" | undefined
  #settled = false
  #settle: (result: ProcessResult) => void = () => {}
  #timeoutHandle: NodeJS.Timeout | undefined
  readonly #stopTimeoutMs: number
  /** The single in-flight termination sequence, shared by `stop`, `kill`, and `#terminate` --
   * whichever one is first establishes it, and every other concurrent call awaits the same
   * sequence instead of re-entering it or racing signals against each other. */
  #terminationPromise: Promise<void> | undefined
  readonly #signalRef: AbortSignal | undefined
  #abortListener: (() => void) | undefined

  constructor(definition: ProcessDefinition, options: ManagedProcessOptions = {}) {
    super()
    this.id = options.id ?? randomUUID()
    this.definition = definition
    this.#hooks = options.hooks ?? {}
    this.#stopTimeoutMs = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS
    this.#stdout = new BoundedOutputBuffer(options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES)
    this.#stderr = new BoundedOutputBuffer(options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES)

    this.settled = new Promise<ProcessResult>(resolve => {
      this.#settle = resolve
    })

    this.#child = spawn(definition.executable, definition.args ?? [], {
      cwd: definition.cwd,
      env: definition.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    })

    this.#child.stdout?.on("data", (chunk: Buffer) => {
      this.#stdout.append(chunk)
      this.#hooks.onStdout?.(chunk.toString("utf8"))
    })
    this.#child.stderr?.on("data", (chunk: Buffer) => {
      this.#stderr.append(chunk)
      this.#hooks.onStderr?.(chunk.toString("utf8"))
    })

    this.#child.on("spawn", () => {
      this.#state = "running"
      if (this.#child.pid !== undefined) {
        this.#hooks.onStarted?.(this.#child.pid)
      }
    })
    this.#child.on("exit", (code, signal) => this.#handleExit(code, signal))
    // Node emits "error" instead of -- or, in some Node versions, in addition to -- "exit" when
    // spawning fails outright. Without a listener here, an unhandled "error" throws and `settled`
    // would never resolve -- the exact gap apps/server/src/dev-server.ts's own review caught.
    this.#child.on("error", error => this.#handleSpawnError(error))

    this.#signalRef = options.signal
    if (options.signal?.aborted) {
      void this.#terminate("cancelled")
    } else if (options.signal) {
      this.#abortListener = () => void this.#terminate("cancelled")
      options.signal.addEventListener("abort", this.#abortListener, { once: true })
    }
    if (options.timeoutMs !== undefined) {
      this.#timeoutHandle = setTimeout(() => void this.#terminate("timed-out"), options.timeoutMs)
    }
  }

  get pid(): number | undefined {
    return this.#child.pid
  }

  get state(): ProcessState {
    return this.#state
  }

  get exitCode(): number | undefined {
    return this.#exitCode
  }

  get signal(): NodeJS.Signals | undefined {
    return this.#signal
  }

  write(data: string): boolean {
    const stdin = this.#child.stdin
    if (stdin === null || !stdin.writable) {
      return false
    }
    return stdin.write(data)
  }

  async stop(options: StopOptions = {}): Promise<void> {
    const initiated = await this.#beginTermination(undefined, () =>
      this.#escalate(options.signal ?? "SIGTERM", options.timeoutMs ?? this.#stopTimeoutMs),
    )
    if (initiated) {
      this.#hooks.onStopped?.()
    }
  }

  async kill(): Promise<void> {
    const initiated = await this.#beginTermination(undefined, async () => {
      await this.#signalAndWait("SIGKILL", this.#stopTimeoutMs)
    })
    if (initiated) {
      this.#hooks.onKilled?.()
    }
  }

  /** The caller-visible reason this process is ending because the library itself decided to end
   * it (a timeout or an external `AbortSignal`) rather than because someone explicitly called
   * `stop`/`kill`. Uses the same graceful-then-escalate path as an explicit `stop`, so the child
   * still gets a chance to clean up. */
  async #terminate(reason: "cancelled" | "timed-out"): Promise<void> {
    await this.#beginTermination(reason, () => this.#escalate("SIGTERM", this.#stopTimeoutMs))
  }

  /** Runs `run` as the one in-flight termination sequence for this process. `reason`, if given, is
   * established as the primary termination reason only by whichever call gets here first -- a
   * second, concurrent call (a timeout racing an abort, say) just awaits the same sequence rather
   * than overwriting the reason or re-entering escalation and signaling the child twice. Returns
   * whether this call actually initiated termination, as opposed to finding the process already
   * terminal or another termination already in flight -- callers use this to avoid reporting an
   * action (`onStopped`/`onKilled`) that didn't happen. */
  async #beginTermination(
    reason: "cancelled" | "timed-out" | undefined,
    run: () => Promise<void>,
  ): Promise<boolean> {
    if (this.#isTerminal()) {
      return false
    }
    if (this.#terminationPromise) {
      await this.#terminationPromise
      return false
    }
    if (reason !== undefined) {
      this.#pendingReason = reason
    }
    this.#state = "stopping"
    this.#terminationPromise = run()
    await this.#terminationPromise
    return true
  }

  async #escalate(signal: NodeJS.Signals, timeoutMs: number): Promise<void> {
    const exited = await this.#signalAndWait(signal, timeoutMs)
    if (!exited && !this.#isTerminal()) {
      await this.#signalAndWait("SIGKILL", timeoutMs)
    }
  }

  async #signalAndWait(signal: NodeJS.Signals, timeoutMs: number): Promise<boolean> {
    if (this.#isTerminal()) {
      return true
    }
    this.#child.kill(signal)
    return this.#raceExit(timeoutMs)
  }

  #raceExit(timeoutMs: number): Promise<boolean> {
    if (this.#isTerminal()) {
      return Promise.resolve(true)
    }
    return new Promise(resolve => {
      const onExit = (): void => {
        clearTimeout(timer)
        resolve(true)
      }
      const timer = setTimeout(() => {
        this.#child.off("exit", onExit)
        resolve(false)
      }, timeoutMs)
      this.#child.once("exit", onExit)
    })
  }

  #isTerminal(): boolean {
    return TERMINAL_STATES.has(this.#state)
  }

  /** Removes the abort listener on every terminal path, not just an actual abort (which already
   * removes itself via `{ once: true }`) -- otherwise a process that exits normally while its
   * caller's `AbortSignal` is still alive leaks the listener closure, and this instance with it,
   * for as long as that signal is referenced elsewhere. */
  #detachAbortListener(): void {
    if (this.#abortListener !== undefined) {
      this.#signalRef?.removeEventListener("abort", this.#abortListener)
      this.#abortListener = undefined
    }
  }

  #handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.#settled) {
      return
    }
    this.#settled = true
    clearTimeout(this.#timeoutHandle)
    this.#detachAbortListener()
    this.#exitCode = code ?? undefined
    this.#signal = signal ?? undefined
    const state: ProcessResult["state"] = this.#pendingReason ?? "completed"
    this.#state = state
    this.#hooks.onExited?.(this.#exitCode, this.#signal)
    this.#settle(this.#result(state))
  }

  #handleSpawnError(error: Error): void {
    if (this.#settled) {
      return
    }
    this.#settled = true
    clearTimeout(this.#timeoutHandle)
    this.#detachAbortListener()
    this.#state = "failed"
    const exceptional = this.errors.from(error)
    this.#hooks.onFailed?.(exceptional)
    this.#settle(this.#result("failed", exceptional))
  }

  #result(state: ProcessResult["state"], error?: ExceptionalError): ProcessResult {
    return {
      id: this.id,
      state,
      exitCode: this.#exitCode,
      signal: this.#signal,
      stdout: this.#stdout.value,
      stderr: this.#stderr.value,
      stdoutTruncated: this.#stdout.truncated,
      stderrTruncated: this.#stderr.truncated,
      ...(error !== undefined ? { error } : {}),
    }
  }
}

export function createManagedProcess(
  definition: ProcessDefinition,
  options?: ManagedProcessOptions,
): ManagedProcess {
  return new ManagedProcessImpl(definition, options)
}
