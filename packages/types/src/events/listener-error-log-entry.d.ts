import type { ReadonlyDeep } from "type-fest"

export type ListenerErrorLogEntry = ReadonlyDeep<{
  timestamp: number
  error: unknown
  listener: string
}>
