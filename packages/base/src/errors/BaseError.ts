import { getGlobalThis } from "@/node"

const global = getGlobalThis()

export type ErrorType = typeof global.Error
export type ErrorInstanceType = InstanceType<ErrorType>
export type ErrorCauseType = ErrorInstanceType["cause"]
export type ErrorMessageType = ErrorInstanceType["message"]

/**
 * Standard error categories for consistent error classification
 */
export const ErrorCategories = {
  VALIDATION: "validation",
  AUTHENTICATION: "authentication",
  AUTHORIZATION: "authorization",
  NETWORK: "network",
  DATABASE: "database",
  FILE_SYSTEM: "file-system",
  CONFIGURATION: "configuration",
  BUSINESS_LOGIC: "business-logic",
  EXTERNAL_SERVICE: "external-service",
  TIMEOUT: "timeout",
  RATE_LIMIT: "rate-limit",
  RESOURCE_EXHAUSTED: "resource-exhausted",
  INTERNAL: "internal",
  UNKNOWN: "unknown",
} as const

export type ErrorCategory = (typeof ErrorCategories)[keyof typeof ErrorCategories]

export interface DatabaseErrorMetadata extends Record<string, unknown> {
  query?: string
  params?: unknown[]
  connectionId?: string
  retryable?: boolean
}

// Options passed to Error constructor
export interface BaseErrorOptions<Cause extends ErrorCauseType = unknown> {
  cause?: Cause
  code?: string
  category?: string
  metadata?: Record<string, unknown>
}

export interface SerializedError {
  name: string
  message: string
  code?: string
  category?: string
  metadata?: Record<string, unknown>
  cause?: SerializedError | string
  stack?: string
}

export class BaseError<Cause extends ErrorCauseType = unknown> extends global.Error {
  public override name = "BaseError"
  public override cause?: Cause
  public readonly code?: string
  public readonly category?: string
  public readonly metadata?: DatabaseErrorMetadata

  constructor(message: ErrorMessageType, options?: BaseErrorOptions<Cause>) {
    super(message, options)

    Object.setPrototypeOf(this, new.target.prototype)

    this.name = new.target.name

    // Safe captureStackTrace check for Node, Bun, etc.
    const ErrorConstructor = global.Error as typeof Error & {
      captureStackTrace?: (
        targetObject: object,
        constructorOpt?: new (...args: unknown[]) => unknown,
      ) => void
    }
    if (typeof ErrorConstructor.captureStackTrace === "function") {
      ErrorConstructor.captureStackTrace(this, this.constructor)
    }

    this.cause = options?.cause as Cause
    this.code = options?.code
    this.category = options?.category
    this.metadata = options?.metadata ? { ...options.metadata } : undefined
  }

  toString(): string {
    return formatErrorCause(this.name, this.message, this.cause)
  }

  static is<E extends BaseError<unknown>>(
    this: new (
      message: string,
      options?: BaseErrorOptions<unknown>,
    ) => E,
    error: unknown,
  ): error is E {
    return error instanceof this
  }

  static wrap<T, E extends BaseError<unknown>>(
    this: new (
      message: string,
      options?: BaseErrorOptions<unknown>,
    ) => E,
    innerFn: () => T,
    innerMessage: string,
    outerMessage: string,
  ): T {
    try {
      try {
        return innerFn()
      } catch (innerErr) {
        throw new this(innerMessage, { cause: innerErr })
      }
    } catch (outerErr) {
      throw new this(outerMessage, { cause: outerErr })
    }
  }

  static async wrapAsync<T, E extends BaseError<unknown>>(
    this: new (
      message: string,
      options?: BaseErrorOptions<unknown>,
    ) => E,
    innerFn: () => Promise<T>,
    innerMessage: string,
    outerMessage: string,
  ): Promise<T> {
    try {
      try {
        return await innerFn()
      } catch (innerErr) {
        throw new this(innerMessage, { cause: innerErr })
      }
    } catch (outerErr) {
      throw new this(outerMessage, { cause: outerErr })
    }
  }

  /**
   * Wrap an async function with timeout handling
   */
  static async withTimeout<T, E extends BaseError<unknown>>(
    this: new (
      message: string,
      options?: BaseErrorOptions<unknown>,
    ) => E,
    asyncFn: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage?: string,
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new this(timeoutMessage || `Operation timed out after ${timeoutMs}ms`, {
            code: "TIMEOUT",
            category: ErrorCategories.TIMEOUT,
          }),
        )
      }, timeoutMs)
    })

    return Promise.race([asyncFn(), timeoutPromise])
  }

  /**
   * Wrap an async function with retry logic
   */
  static async withRetry<T, E extends BaseError<unknown>>(
    this: new (
      message: string,
      options?: BaseErrorOptions<unknown>,
    ) => E,
    asyncFn: () => Promise<T>,
    options: {
      maxAttempts: number
      retryDelayMs?: number
      shouldRetry?: (error: unknown) => boolean
      onRetry?: (attempt: number, error: unknown) => void
    },
  ): Promise<T> {
    const { maxAttempts, retryDelayMs = 1000, shouldRetry, onRetry } = options
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await asyncFn()
      } catch (error) {
        lastError = error

        if (attempt === maxAttempts || (shouldRetry && !shouldRetry(error))) {
          throw new this(`Failed after ${attempt} attempts`, {
            cause: error,
            code: "RETRY_EXHAUSTED",
            category: ErrorCategories.INTERNAL,
          })
        }

        onRetry?.(attempt, error)

        if (retryDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs))
        }
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new this("Retry logic failed unexpectedly", {
      cause: lastError,
      code: "RETRY_LOGIC_ERROR",
      category: ErrorCategories.INTERNAL,
    })
  }

  get rootCause(): unknown {
    const visited = new Set<BaseError<unknown>>()
    let cause: unknown = this.cause

    while (cause instanceof BaseError) {
      if (visited.has(cause)) return `[Circular Reference: ${cause.name}]`
      visited.add(cause)
      if (!cause.cause) break
      cause = cause.cause
    }

    return cause
  }

  toJSON(): SerializedError {
    return this._serializeErrorChain(new Set())
  }

  private _serializeErrorChain(visited: Set<BaseError<unknown>>): SerializedError {
    if (visited.has(this)) {
      return {
        name: this.name,
        message: "[Circular Reference]",
        code: this.code,
        category: this.category,
      }
    }

    visited.add(this)

    const serialized: SerializedError = {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      metadata: this.metadata,
      stack: this.stack,
    }

    if (this.cause instanceof BaseError) {
      serialized.cause = this.cause._serializeErrorChain(visited)
    } else if (this.cause !== undefined) {
      serialized.cause = String(this.cause)
    }

    return serialized
  }

  static fromJSON(data: SerializedError): BaseError<unknown> {
    const error = new BaseError(data.message, {
      code: data.code,
      category: data.category,
      metadata: data.metadata,
    })

    if (data.name && data.name !== "BaseError") {
      console.warn(
        `BaseError.fromJSON(): Reconstructing '${data.name}' as 'BaseError'. Use ErrorRegistry.fromJSON() for subclass recreation.`,
      )
    }

    if (data.cause && typeof data.cause === "object") {
      error.cause = BaseError.fromJSON(data.cause)
    } else if (data.cause) {
      error.cause = data.cause
    }

    return error
  }

  /**
   * Find the first error in the chain that matches the given predicate
   */
  findInChain(predicate: (error: BaseError<unknown>) => boolean): BaseError<unknown> | null {
    const visited = new Set<BaseError<unknown>>()
    let current: BaseError<unknown> | unknown = this

    while (current instanceof BaseError) {
      if (visited.has(current)) return null // Circular reference
      visited.add(current)

      if (predicate(current)) return current
      current = current.cause
    }

    return null
  }

  /**
   * Find all errors in the chain that match the given predicate
   */
  findAllInChain(predicate: (error: BaseError<unknown>) => boolean): BaseError<unknown>[] {
    const visited = new Set<BaseError<unknown>>()
    const matches: BaseError<unknown>[] = []
    let current: BaseError<unknown> | unknown = this

    while (current instanceof BaseError) {
      if (visited.has(current)) break // Circular reference
      visited.add(current)

      if (predicate(current)) matches.push(current)
      current = current.cause
    }

    return matches
  }

  /**
   * Find error by category in the chain
   */
  findByCategory(category: string): BaseError<unknown> | null {
    return this.findInChain(error => error.category === category)
  }

  /**
   * Find error by code in the chain
   */
  findByCode(code: string): BaseError<unknown> | null {
    return this.findInChain(error => error.code === code)
  }

  /**
   * Find error by type (constructor) in the chain
   */
  findByType<T extends BaseError<unknown>>(errorClass: new (...args: unknown[]) => T): T | null {
    const found = this.findInChain(error => error instanceof errorClass)
    return found as T | null
  }

  /**
   * Check if the error chain contains an error with the given category
   */
  hasCategory(category: string): boolean {
    return this.findByCategory(category) !== null
  }

  /**
   * Check if the error chain contains an error with the given code
   */
  hasCode(code: string): boolean {
    return this.findByCode(code) !== null
  }

  /**
   * Check if the error chain contains an error of the given type
   */
  hasType<T extends BaseError<unknown>>(errorClass: new (...args: unknown[]) => T): boolean {
    return this.findByType(errorClass) !== null
  }

  /**
   * Get the length of the error chain
   */
  get chainLength(): number {
    const visited = new Set<BaseError<unknown>>()
    let length = 0
    let current: BaseError<unknown> | unknown = this

    while (current instanceof BaseError) {
      if (visited.has(current)) break // Circular reference
      visited.add(current)
      length++
      current = current.cause
    }

    return length
  }

  /**
   * Get all error names in the chain as an array
   */
  get chainNames(): string[] {
    const visited = new Set<BaseError<unknown>>()
    const names: string[] = []
    let current: BaseError<unknown> | unknown = this

    while (current instanceof BaseError) {
      if (visited.has(current)) break // Circular reference
      visited.add(current)
      names.push(current.name)
      current = current.cause
    }

    return names
  }
}

/**
 * ErrorRegistry — Proper subclass reconstruction
 */
export namespace ErrorRegistry {
  type ErrorConstructor = new (
    message: string,
    options?: BaseErrorOptions<unknown>,
  ) => BaseError<unknown>

  const registry = new Map<string, ErrorConstructor>()

  export function register<T extends BaseError<unknown>>(
    errorClass: new (message: string, options?: BaseErrorOptions<unknown>) => T,
  ): void {
    const instance = new errorClass("temp")
    registry.set(instance.name, errorClass as ErrorConstructor)
  }

  export function fromJSON(data: SerializedError): BaseError<unknown> {
    const ErrorClass = registry.get(data.name) ?? BaseError

    const error = new ErrorClass(data.message, {
      code: data.code,
      category: data.category,
      metadata: data.metadata,
    })

    if (data.cause && typeof data.cause === "object") {
      error.cause = ErrorRegistry.fromJSON(data.cause)
    } else if (data.cause) {
      error.cause = data.cause
    }

    return error
  }

  export function isRegistered(name: string): boolean {
    return registry.has(name)
  }

  export function getRegisteredNames(): string[] {
    return [...registry.keys()]
  }

  export function clear(): void {
    registry.clear()
  }
}

// Auto-register BaseError
ErrorRegistry.register(BaseError)

/**
 * Format cause chains for toString()
 */
function formatErrorCause<T extends ErrorCauseType>(
  name: string,
  message: string,
  cause: InstanceType<ErrorType> | T,
  depth = 0,
): string {
  const base = `${name}: ${message}`

  if (!cause) return base

  const indent = "  ".repeat(depth)
  const prefix = depth === 0 ? "\nCaused by: " : `\n${indent}Caused by: `

  if (cause instanceof global.Error) {
    const nested = (cause as Error & { cause?: unknown }).cause
    const info = `${cause.name}: ${cause.message}`

    const nestedStr = nested ? formatErrorCause(cause.name, cause.message, nested, depth + 1) : ""

    return depth === 0 ? `${base}${prefix}${info}${nestedStr}` : `${prefix}${info}${nestedStr}`
  }

  try {
    const causeStr = typeof cause === "string" ? cause : JSON.stringify(cause)
    return `${base}${prefix}${causeStr}`
  } catch {
    return `${base}${prefix}${String(cause)}`
  }
}
