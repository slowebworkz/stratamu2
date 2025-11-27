import type { ERROR_CATEGORIES } from "@/errors"
import type { BaseError } from "@/errors"
// ============================================================================
// IMPORTS
// ============================================================================
import type { JsonObject, LiteralUnion, Simplify } from "type-fest"

// ============================================================================
// CORE ERROR TYPES
// ============================================================================

/**
 * Fundamental error type definitions
 */
export type ErrorType = typeof globalThis.Error
export type ErrorInstanceType = InstanceType<ErrorType>
export type ErrorCauseType = ErrorInstanceType | undefined
export type ErrorMessageType = ErrorInstanceType["message"]
export type ErrorConstructor = new (...args: unknown[]) => Error

/**
 * Constructor type for BaseError classes
 */
export type BaseErrorConstructor<
  Cause extends ErrorCauseType = ErrorCauseType,
  Meta extends MetadataObject = MetadataObject,
> = new (message: string, options?: BaseErrorOptions<Cause, Meta>) => BaseError<Meta, Cause>

// ============================================================================
// ERROR CATEGORIZATION & METADATA
// ============================================================================

/**
 * Error category type with autocomplete support for predefined categories
 */
export type ErrorCategory = LiteralUnion<
  (typeof ERROR_CATEGORIES)[keyof typeof ERROR_CATEGORIES],
  string
>

/**
 * Flexible metadata type that ensures JSON serializable while being less restrictive
 */
export type MetadataObject = Record<string, unknown>

/**
 * Options passed to BaseError constructor
 */
export interface BaseErrorOptions<
  Cause extends ErrorCauseType = ErrorCauseType,
  Meta extends MetadataObject = MetadataObject,
> {
  cause?: Cause
  code?: string
  category?: ErrorCategory
  metadata?: Meta
}

// ============================================================================
// ERROR SERIALIZATION
// ============================================================================

/**
 * Serialized error format for JSON storage/transmission
 *
 * The cause field can be:
 * - SerializedError: For BaseError instances (recursive serialization)
 * - SerializedErrorLike: For regular Error instances (preserves name, message, stack)
 * - string: For non-Error values
 */
export interface SerializedError {
  name: string
  message: string
  code?: string
  category?: ErrorCategory
  metadata?: JsonObject
  cause?: SerializedError | SerializedErrorLike | string
  stack?: string
}

/**
 * Serialized format for regular Error instances (non-BaseError)
 * Preserves critical Error fields: name, message, and stack
 */
export interface SerializedErrorLike {
  name: string
  message: string
  stack?: string
}

/**
 * Marker interface for BaseError instances that have unresolved serialized cause data.
 * This preserves the cause chain information when reconstructing from JSON,
 * allowing consumers to implement their own cause resolution logic.
 */
export interface UnresolvedSerializedCause {
  _unresolvedSerializedCause?: SerializedError | SerializedErrorLike | string
}

// ============================================================================
// DOMAIN-SPECIFIC METADATA INTERFACES
// ============================================================================

/**
 * Database-specific error context information
 */
export interface DatabaseErrorContext {
  /** Database operation type (SELECT, INSERT, UPDATE, DELETE, etc.) */
  operation?: string
  /** Table or collection name */
  table?: string
  /** Database name */
  database?: string
  /** Connection string or host (sanitized) */
  host?: string
  /** Database driver/client type */
  driver?: string
  /** Query execution time in milliseconds */
  executionTimeMs?: number
  /** Number of affected rows */
  affectedRows?: number
  /** SQL error code (if applicable) */
  sqlCode?: string | number
  /** SQL state (if applicable) */
  sqlState?: string
}

/**
 * Database error options interface
 */
export interface DatabaseErrorOptions<Cause extends ErrorCauseType>
  extends BaseErrorOptions<Cause> {
  /** Database-specific context information */
  dbContext?: DatabaseErrorContext
}

/**
 * Database-specific error metadata (legacy interface - prefer DatabaseErrorContext)
 */
export interface DatabaseErrorMetadata {
  query?: string
  params?: unknown[]
  connectionId?: string
  retryable?: boolean
}

// ============================================================================
// GAME ENGINE METADATA INTERFACES
// ============================================================================

/**
 * Game state error metadata for world/room/object state issues
 */
export interface GameStateErrorMetadata {
  roomId?: string | number
  objectId?: string | number
  playerId?: string | number
  worldArea?: string
  stateType?: "room" | "object" | "player" | "world"
}

/**
 * Player action error metadata for command processing failures
 */
export interface PlayerActionErrorMetadata {
  playerId: string | number
  command?: string
  targetId?: string | number
  targetType?: "player" | "object" | "room" | "npc"
  actionType?: "movement" | "interaction" | "communication" | "combat"
  currentRoom?: string | number
}

/**
 * Game rules error metadata for rule violations and logic errors
 */
export interface GameRulesErrorMetadata {
  ruleType?: "combat" | "movement" | "interaction" | "magic" | "economy"
  violatedRule?: string
  playerId?: string | number
  contextData?: Record<string, unknown>
}

/**
 * Scripting error metadata for in-game script execution failures
 */
export interface ScriptingErrorMetadata {
  scriptId?: string
  scriptType?: "trigger" | "command" | "event" | "timer" | "area"
  lineNumber?: number
  functionName?: string
  variables?: Record<string, unknown>
}

/**
 * Combat system error metadata for battle-related failures
 */
export interface CombatErrorMetadata {
  attacker?: string | number
  defender?: string | number
  weaponId?: string | number
  spellId?: string | number
  damageType?: string
  combatRound?: number
}

/**
 * Communication error metadata for messaging and protocol failures
 */
export interface CommunicationErrorMetadata {
  protocol?: "telnet" | "websocket" | "mud-protocol"
  channelId?: string
  senderId?: string | number
  recipientId?: string | number
  messageType?: "tell" | "channel" | "broadcast" | "ooc"
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Type for copying metadata properties from BaseError instances
 */
export type BaseErrorMetadataCopy = Simplify<
  Pick<BaseErrorOptions<ErrorCauseType, MetadataObject>, "code" | "category" | "metadata">
>
