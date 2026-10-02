import { randomUUID } from "node:crypto"

import { Base } from "@stratamu/base"
import type { EventCapability, ExceptionalError } from "@stratamu/capabilities"
import { EmitteryEvents } from "@stratamu/capabilities"

import type { ExecutionOptions } from "../shared/lifecycle.ts"
import type { ManagedProcess, ProcessOutputOptions, StopOptions } from "./managed-process.ts"
import { createManagedProcess } from "./managed-process.ts"
import type { ProcessDefinition } from "./process-definition.ts"
import type { ProcessResult } from "./process-result.ts"

export interface StartOptions extends ExecutionOptions, ProcessOutputOptions {}
export type RunOptions = StartOptions

// A type alias, not an interface: EventCapability's EventMap constraint needs an index signature,
// which only a type alias has (see @stratamu/capabilities' own EventCapability doc comment).
export type ProcessManagerEvents = {
  "process.started": { id: string; pid: number }
  "process.stdout": { id: string; chunk: string }
  "process.stderr": { id: string; chunk: string }
  "process.exited": { id: string; exitCode: number | undefined; signal: NodeJS.Signals | undefined }
  "process.failed": { id: string; error: ExceptionalError }
  "process.stopped": { id: string }
  "process.killed": { id: string }
}

/**
 * Creates and tracks `ManagedProcess` instances. `run`/`start` are the two front doors onto the
 * same `ManagedProcess` lifecycle engine (see `managed-process.ts`) -- `run` awaits it to
 * completion, `start` hands back the live handle immediately.
 */
export class ChildProcessManager extends Base {
  readonly events: EventCapability<ProcessManagerEvents> =
    new EmitteryEvents<ProcessManagerEvents>()

  readonly #processes = new Map<string, ManagedProcess>()

  /** Starts `definition` and returns a live handle immediately -- nothing needs to be awaited
   * first; lifecycle unfolds through `process.state`/`process.settled` and this manager's
   * `events`. */
  start(definition: ProcessDefinition, options: StartOptions = {}): ManagedProcess {
    const id = randomUUID()
    const process = createManagedProcess(definition, {
      id,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      stopTimeoutMs: options.stopTimeoutMs,
      maxOutputBytes: options.maxOutputBytes,
      hooks: {
        onStarted: pid => void this.events.emit("process.started", { id, pid }),
        onStdout: chunk => void this.events.emit("process.stdout", { id, chunk }),
        onStderr: chunk => void this.events.emit("process.stderr", { id, chunk }),
        onExited: (exitCode, signal) =>
          void this.events.emit("process.exited", { id, exitCode, signal }),
        onFailed: error => void this.events.emit("process.failed", { id, error }),
        onStopped: () => void this.events.emit("process.stopped", { id }),
        onKilled: () => void this.events.emit("process.killed", { id }),
      },
    })

    this.#processes.set(id, process)
    void process.settled.finally(() => this.#processes.delete(id))

    return process
  }

  /** Starts `definition` and resolves with its final `ProcessResult` once it reaches a terminal
   * state -- never rejects for an expected outcome (a nonzero exit, a timeout, a cancellation); see
   * `ProcessResult`/`ProcessState`'s own documentation for what each state means. */
  async run(definition: ProcessDefinition, options: RunOptions = {}): Promise<ProcessResult> {
    return this.start(definition, options).settled
  }

  get(id: string): ManagedProcess | undefined {
    return this.#processes.get(id)
  }

  async stop(id: string, options?: StopOptions): Promise<void> {
    await this.#processes.get(id)?.stop(options)
  }

  /** Stops every currently tracked process. Safe to call more than once -- resolves trivially once
   * nothing is tracked. */
  async stopAll(options?: StopOptions): Promise<void> {
    await Promise.all([...this.#processes.values()].map(process => process.stop(options)))
  }
}
