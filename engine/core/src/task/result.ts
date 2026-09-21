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

export type TaskResult = TaskSuspend

export function suspend(continuation?: unknown): TaskSuspend {
  return { next: "suspend", continuation }
}

export function isTaskSuspend(result: unknown): result is TaskSuspend {
  return (
    typeof result === "object" && result !== null && "next" in result && result.next === "suspend"
  )
}
