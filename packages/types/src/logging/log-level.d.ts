export type LogLevel =
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace"

export type LogLevelWithSilent = LogLevel | "silent"
