import type { WorkKind } from "./work-kind.ts"
import { workKind } from "./work-kind.ts"

/**
 * What operation is being requested, and what input that operation needs. It says nothing about
 * time, queues or lifecycle: those belong to the task the engine makes from it.
 *
 * Adapters define their own unions, which narrow on `kind`:
 *
 *     type MushWork = Work<"mush.command", MushCommand> | Work<"mush.trigger", MushTrigger>
 */
export interface Work<K extends WorkKind = WorkKind, I = unknown> {
  readonly kind: K
  readonly input: I
}

/**
 * Creates a Work, checking its kind at run time. The result is frozen, but only shallowly: the
 * `input` object itself is not.
 */
export function work<const K extends WorkKind, I>(kind: K, input: I): Work<K, I> {
  return Object.freeze({
    kind: workKind(kind),
    input,
  })
}
