export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const

/**
 * Redacted by default in every record, at any depth: tslog's `mask.keys` matches a key name
 * anywhere in the logged data, not just at specific paths -- simpler than (and a superset of)
 * the one-level-of-nesting `*.key` path list this needed to build for pino's path-based `redact`.
 */
export const SENSITIVE_KEYS = ["password", "token", "secret", "authorization"] as const
