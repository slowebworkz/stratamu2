import isPlainObject from "is-plain-object"
import type { JsonValue, Jsonifiable, LiteralUnion, PartialDeep, Simplify } from "type-fest"

/** Type for function label in _handleFunction */
export type FunctionLabel = LiteralUnion<"anonymous" | "named", string>

// Types for error serialization and formatting helpers
export type SerializedError = Simplify<
  Pick<Error, "name" | "message"> & PartialDeep<Pick<Error, "stack">>
>

/** Callback for payload and formatted value (sync or async) */
export type FormatPayloadCallback<T = unknown, R = void> = (payload: T, formatted: JsonValue) => R

export interface FormatPayloadOptions<T = unknown> {
  onSpecialCase?: FormatPayloadCallback<T, void>
  onSpecialCaseAsync?: FormatPayloadCallback<T, Promise<void>>
}

// Internal helper return types
export type MaybeSerializedError = SerializedError | undefined
export type MaybeJsonValue = JsonValue | undefined

/** Supported input types for formatting payloads */
export type FormatPayloadInput =
  | Jsonifiable
  | Error
  | ((...args: unknown[]) => unknown)
  | symbol
  | bigint
  | undefined

/** Function signature for _formatPayloadInternal and safeFormatPayload */
export type FormatPayloadFunction<T extends FormatPayloadInput = FormatPayloadInput> = (
  payload: T,
  options?: FormatPayloadOptions<T>,
) => Promise<JsonValue>

export async function safeFormatPayload<
  T extends Jsonifiable | Error | ((...args: unknown[]) => unknown) | symbol | bigint | undefined,
>(payload: T, options?: FormatPayloadOptions<T>): Promise<JsonValue> {
  const formatted = _formatPayloadInternal(payload)

  // Run optional synchronous callback
  options?.onSpecialCase?.(payload, formatted)

  // Run optional asynchronous callback
  if (options?.onSpecialCaseAsync) {
    await options.onSpecialCaseAsync(payload, formatted)
  }

  return formatted
}

function _formatPayloadInternal<
  T extends Jsonifiable | Error | ((...args: unknown[]) => unknown) | symbol | bigint | undefined,
>(payload: T): JsonValue {
  const err = _isError(payload)
  if (err) return err

  if (_isPlainObjectOrArray(payload)) return _tryStringify(payload as Jsonifiable)

  const bigOrSym = _handleBigIntOrSymbol(payload)
  if (bigOrSym) return bigOrSym

  const undef = _handleUndefined(payload)
  if (undef) return undef

  const fn = _handleFunction(payload)
  if (fn) return fn

  try {
    return payload as JsonValue
  } catch {
    return String(payload) as unknown as JsonValue
  }
}

function _isError(payload: unknown): MaybeSerializedError {
  return serializeError(payload) ?? undefined
}

function _isPlainObjectOrArray(payload: unknown): payload is Record<string, unknown> | unknown[] {
  return isPlainObject(payload) || Array.isArray(payload)
}

function _tryStringify(payload: Jsonifiable): JsonValue {
  try {
    return JSON.parse(JSON.stringify(payload))
  } catch {
    return null
  }
}

function _handleBigIntOrSymbol(payload: unknown): MaybeJsonValue {
  if (typeof payload === "bigint" || typeof payload === "symbol") {
    return payload.toString() as JsonValue
  }
  return undefined
}

function _handleUndefined(payload: unknown): MaybeJsonValue {
  if (typeof payload === "undefined") {
    return null as JsonValue
  }
  return undefined
}

function _handleFunction(payload: unknown): MaybeJsonValue {
  if (typeof payload === "function") {
    const fn = payload as (...args: unknown[]) => unknown
    const label: FunctionLabel = (fn as { name?: string }).name || "anonymous"
    return `[Function: ${label}]` as JsonValue
  }
  return undefined
}

/** Serialize an Error object to a plain object with name, message, and stack. Returns null if input is not an Error. */
export function serializeError(err: unknown): SerializedError | null {
  if (err instanceof Error) {
    const { name, message, stack } = err
    return Object.freeze({ name, message, stack })
  }
  return null
}
