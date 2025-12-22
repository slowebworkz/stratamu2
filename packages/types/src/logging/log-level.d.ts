export const LOGGER_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const

export type LogLevel = (typeof LOGGER_LEVELS)[number]

export type LogLevelWithSilent = LogLevel | "silent"
