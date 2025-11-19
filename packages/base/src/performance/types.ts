import type { LiteralUnion, Tagged } from "type-fest"

export type TimeInMs = Tagged<number, "TimeInMs">

export type Count = Tagged<number, "Count">

export type ErrorCount = Tagged<number, "ErrorCount">

export type ListenerName = LiteralUnion<"<anonymous>", string>
