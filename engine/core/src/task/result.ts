import { isNonNullObject } from "@stratamu/guards"

import type { Schedule } from "../schedule/index.ts"

/**
 * What a handler asks to happen next, other than finishing. A handler that returns nothing has
 * completed.
 *
 * `suspend` takes the task out of running and into `waiting`. The runtime holds the optional
 * continuation, which is opaque data the adapter defines, and gives it back when the task is
 * woken and runs again. Core stores no reason for the wait: what a task is waiting for, and who
 * wakes it, belongs to the adapter or domain system.
 */
export interface TaskSuspend {
  readonly next: "suspend"
  readonly continuation?: unknown
}

/**
 * Takes the task out of running and into `scheduled`, asking to become eligible again at a
 * temporal point the handler chooses. Reuses `Schedule`: both answer "when should this task next
 * become eligible", differing only in who is asking and when. `Schedule` at admission is a
 * one-time decision by whoever submitted the task; here it is the task's own choice, made from
 * inside its own step. The continuation works exactly as it does for `suspend`: opaque, adapter-
 * defined, handed back once when the task runs again. Recurring work is not a separate concept:
 * a handler that returns `reschedule` every time it runs is recurring work.
 */
export interface TaskReschedule {
  readonly next: "reschedule"
  readonly schedule: Schedule
  readonly continuation?: unknown
}

export type TaskResult = TaskSuspend | TaskReschedule

export function suspend(continuation?: unknown): TaskSuspend {
  return { next: "suspend", continuation }
}

export function reschedule(schedule: Schedule, continuation?: unknown): TaskReschedule {
  return { next: "reschedule", schedule, continuation }
}

/** Whether `result` is a plain object whose `next` property is `value`. */
function hasNext(result: unknown, value: TaskResult["next"]): boolean {
  return isNonNullObject(result) && "next" in result && result.next === value
}

export function isTaskSuspend(result: unknown): result is TaskSuspend {
  return hasNext(result, "suspend")
}

export function isTaskReschedule(result: unknown): result is TaskReschedule {
  return hasNext(result, "reschedule")
}
