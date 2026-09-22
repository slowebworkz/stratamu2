import type { Work } from "@stratamu/work"

export interface Submission<W extends Work = Work> {
  readonly work: W
}
