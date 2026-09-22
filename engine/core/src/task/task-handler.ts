import type { Task } from "@stratamu/task"

import type { TaskResult } from "./result.ts"
import type { TaskContext } from "./task-context.ts"

export type TaskHandler = (
  task: Task,
  context: TaskContext,
) => undefined | TaskResult | Promise<TaskResult | undefined>
