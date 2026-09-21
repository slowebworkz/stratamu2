import { Base } from "@stratamu/base"
import type { TaskSequence } from "@stratamu/primitives"

export class TaskSequencer extends Base {
  #nextSequence = 0

  next(): TaskSequence {
    if (this.#nextSequence === Number.MAX_SAFE_INTEGER) {
      throw new RangeError("Task sequence exhausted")
    }

    return this.#nextSequence++ as TaskSequence
  }
}
