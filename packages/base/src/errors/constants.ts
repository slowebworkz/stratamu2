import type { ReadonlyDeep } from "type-fest"

/**
 * Standard error categories for consistent error classification
 * Includes MUD/MUSH-specific categories for game development
 */
export const ERROR_CATEGORIES: ReadonlyDeep<{
  // Core System Categories
  VALIDATION: "validation"
  AUTHENTICATION: "authentication"
  AUTHORIZATION: "authorization"
  NETWORK: "network"
  DATABASE: "database"
  FILE_SYSTEM: "file-system"
  CONFIGURATION: "configuration"
  TIMEOUT: "timeout"
  RATE_LIMIT: "rate-limit"
  RESOURCE_EXHAUSTED: "resource-exhausted"
  INTERNAL: "internal"
  UNKNOWN: "unknown"

  // Game-Specific Categories
  GAME_STATE: "game-state" // World state, room, object state errors
  PLAYER_ACTION: "player-action" // Invalid player commands, movement, actions
  GAME_RULES: "game-rules" // Rule violations, game logic constraints
  WORLD_BUILDING: "world-building" // Area creation, room linking, object creation
  SCRIPTING: "scripting" // MUD code execution, trigger failures
  ECONOMY: "economy" // Currency, trading, resource management
  SOCIAL: "social" // Channels, tells, mail, bulletin boards
  COMBAT: "combat" // Fighting system, damage, death
  MAGIC: "magic" // Spell casting, magic system
  PERMISSIONS: "permissions" // Builder rights, immortal commands, access levels
  PERSISTENCE: "persistence" // Player save/load, world persistence
  COMMUNICATION: "communication" // Inter-mud communication, OOB protocols
  TELNET: "telnet" // Telnet protocol, MCCP, color codes
  WEBSOCKET: "websocket" // WebSocket connections for web clients

  // Legacy categories (kept for compatibility)
  BUSINESS_LOGIC: "business-logic" // Deprecated: use GAME_RULES instead
  EXTERNAL_SERVICE: "external-service"
}> = {
  // Core System Categories
  VALIDATION: "validation",
  AUTHENTICATION: "authentication",
  AUTHORIZATION: "authorization",
  NETWORK: "network",
  DATABASE: "database",
  FILE_SYSTEM: "file-system",
  CONFIGURATION: "configuration",
  TIMEOUT: "timeout",
  RATE_LIMIT: "rate-limit",
  RESOURCE_EXHAUSTED: "resource-exhausted",
  INTERNAL: "internal",
  UNKNOWN: "unknown",

  // Game-Specific Categories
  GAME_STATE: "game-state",
  PLAYER_ACTION: "player-action",
  GAME_RULES: "game-rules",
  WORLD_BUILDING: "world-building",
  SCRIPTING: "scripting",
  ECONOMY: "economy",
  SOCIAL: "social",
  COMBAT: "combat",
  MAGIC: "magic",
  PERMISSIONS: "permissions",
  PERSISTENCE: "persistence",
  COMMUNICATION: "communication",
  TELNET: "telnet",
  WEBSOCKET: "websocket",

  // Legacy categories
  BUSINESS_LOGIC: "business-logic",
  EXTERNAL_SERVICE: "external-service",
} as const

/**
 * SQL error codes that are considered retryable
 * Includes vendor-specific error codes and SQLSTATE codes
 */
export const RETRYABLE_SQL_CODES: ReadonlyDeep<(string | number)[]> = [
  // Connection issues
  2002,
  2003,
  2006,
  2013, // MySQL connection errors
  "08001",
  "08003",
  "08006", // SQL state connection errors
  // Timeout errors
  1205,
  1213, // MySQL lock timeouts
  "40001", // SQL state serialization failure
] as const
