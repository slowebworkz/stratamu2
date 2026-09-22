export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const

export const SENSITIVE_KEYS = ["password", "token", "secret", "authorization"] as const

export const DEFAULT_REDACT_PATHS: readonly string[] = SENSITIVE_KEYS.flatMap(key => [
  key,
  `*.${key}`,
])
