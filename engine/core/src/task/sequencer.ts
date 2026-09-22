import type { TaskSequence } from "@stratamu/primitives"
import { taskSequence } from "@stratamu/primitives"

/**
 * Hands out task sequences in order, starting from zero. Each `Runtime` has its own sequencer, so
 * two runtimes number their tasks independently and a run's sequences are reproducible from the
 * order `allocate` was called in.
 */
export class TaskSequencer {
  #nextSequence = 0

  allocate(): TaskSequence {
    if (this.#nextSequence === Number.MAX_SAFE_INTEGER) {
      throw new RangeError("Task sequence exhausted")
    }

    return taskSequence(this.#nextSequence++)
  }
}
