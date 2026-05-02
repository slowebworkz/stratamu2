import { DEV_MODE } from "@/env"
import { getGlobalThis } from "@/node"
import { isObject } from "@/utils"
import { EError } from "exceptional-errors"

import type {
  BaseErrorMetadataCopy,
  BaseErrorOptions,
  ErrorCategory,
  ErrorCauseType,
  MetadataObject,
  SerializedError,
} from "@/errors"
import type { JsonObject } from "type-fest"

const global = getGlobalThis()

// Type for constructor functions used in stack trace capture
type ErrorConstructorType = new (...args: unknown[]) => unknown

export class BaseError<
  Meta extends MetadataObject = MetadataObject,
  Cause extends ErrorCauseType = ErrorCauseType,
> extends EError<Meta, Error> {
  public override name = "BaseError"
  public readonly code?: string
  public readonly category?: ErrorCategory
  public readonly metadata?: Meta

  constructor(message: string)
  constructor(options: BaseErrorOptions<Cause, Meta>)
  constructor(message: string, options: BaseErrorOptions<Cause, Meta>)
  constructor(
    messageOrOptions: string | BaseErrorOptions<Cause, Meta>,
    maybeOptions?: BaseErrorOptions<Cause, Meta>,
  ) {
    const { message, cause, metadata } = BaseError.normalizeConstructorInput(
      messageOrOptions,
      maybeOptions,
    )

    if (DEV_MODE) {
      const err = new Error(message ?? "BaseError")
      if (cause) (err as Error & { cause?: Error }).cause = BaseError.ensureErrorCause(cause)
      throw err
    }

    super(
      BaseError.constructOptions(message, cause, metadata) as ConstructorParameters<
        typeof EError
      >[0],
    )

    if (new.target.name) this.name = new.target.name

    BaseError.captureErrorStackTrace(this, this.constructor as ErrorConstructorType)
  }

  /* ------------------- Chain Navigation ------------------- */

  public findInChain<T extends BaseError<Meta, Cause>>(predicate: (error: T) => boolean): T | null {
    let current: BaseError<Meta, Cause> | undefined = this
    while (current) {
      if (predicate(current as T)) return current as T
      if (current instanceof BaseError) {
        current = current.cause as BaseError<Meta, Cause> | undefined
      } else break
    }
    return null
  }

  public findAllInChain<T extends BaseError<Meta, Cause>>(predicate: (error: T) => boolean): T[] {
    const matches: T[] = []
    let current: BaseError<Meta, Cause> | undefined = this
    while (current) {
      if (predicate(current as T)) matches.push(current as T)
      if (current instanceof BaseError) {
        current = current.cause as BaseError<Meta, Cause> | undefined
      } else break
    }
    return matches
  }

  public findByType<T extends BaseError<Meta, Cause>>(
    errorClass: new (...args: any[]) => T,
  ): T | null {
    return this.findInChain(error => error instanceof errorClass)
  }

  /* ------------------- Convenience Methods ------------------- */

  public findByCode(code: string) {
    return this.findInChain(error => error.code === code)
  }

  public findByCategory(category: ErrorCategory) {
    return this.findInChain(error => error.category === category)
  }

  public hasCode(code: string) {
    return !!this.findByCode(code)
  }

  public hasCategory(category: ErrorCategory) {
    return !!this.findByCategory(category)
  }

  /* ------------------- Getters ------------------- */

  public get rootCause(): Cause {
    let current = this.cause
    let root = current
    while (current) {
      root = current
      if (current instanceof BaseError) current = current.cause
      else break
    }
    return root as Cause
  }

  public get immediateCause(): Cause {
    return this.cause
  }

  public get chainLength(): number {
    return super.getCauses().length
  }

  public get chainNames(): string[] {
    return super.getCauses().map(e => e.name)
  }

  /* ------------------- Serialization ------------------- */

  public serialize(): SerializedError {
    const serialized: SerializedError = {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      metadata: this.metadata as JsonObject | undefined,
      stack: this.stack,
    }

    if (this.cause) serialized.cause = BaseError.serializeErrorCause(this.cause)
    return serialized
  }

  /* ------------------- Public Static Methods ------------------- */

  public static is<E extends BaseError<any, any>>(
    this: new (
      ...args: any[]
    ) => E,
    error: unknown,
  ): error is E {
    return error instanceof this
  }

  /* ------------------- Private Static Methods ------------------- */

  private static wrap<T, E extends BaseError<any, any>>(
    this: new (
      message: string,
      options?: BaseErrorOptions<any, any>,
    ) => E,
    innerFn: () => T,
    innerMessage: string,
    outerMessage: string,
  ): T {
    try {
      try {
        return innerFn()
      } catch (innerErr) {
        throw new this(innerMessage, {
          cause: innerErr instanceof Error ? innerErr : undefined,
          ...BaseError.copyErrorMetadata(innerErr),
        })
      }
    } catch (outerErr) {
      throw new this(outerMessage, {
        cause: outerErr instanceof Error ? outerErr : undefined,
        ...BaseError.copyErrorMetadata(outerErr),
      })
    }
  }

  private static async wrapAsync<T, E extends BaseError<any, any>>(
    this: new (
      message: string,
      options?: BaseErrorOptions<any, any>,
    ) => E,
    innerFn: () => Promise<T>,
    innerMessage: string,
    outerMessage: string,
  ): Promise<T> {
    try {
      try {
        return await innerFn()
      } catch (innerErr) {
        throw new this(innerMessage, {
          cause: innerErr instanceof Error ? innerErr : undefined,
          ...BaseError.copyErrorMetadata(innerErr),
        })
      }
    } catch (outerErr) {
      throw new this(outerMessage, {
        cause: outerErr instanceof Error ? outerErr : undefined,
        ...BaseError.copyErrorMetadata(outerErr),
      })
    }
  }

  private static normalizeConstructorInput<M extends MetadataObject, C extends ErrorCauseType>(
    messageOrOptions: string | BaseErrorOptions<C, M>,
    maybeOptions?: BaseErrorOptions<C, M>,
  ): {
    message?: string
    cause?: C
    metadata?: M
  } {
    if (typeof messageOrOptions === "string") {
      return {
        message: messageOrOptions,
        cause: maybeOptions?.cause,
        metadata: maybeOptions?.metadata,
      }
    }
    return {
      message: undefined,
      cause: messageOrOptions.cause,
      metadata: messageOrOptions.metadata,
    }
  }

  private static constructOptions<M extends MetadataObject, C extends ErrorCauseType>(
    message?: string,
    cause?: C,
    metadata?: M,
  ): ConstructorParameters<typeof EError>[0] | undefined {
    const normalizedCause = cause ? BaseError.ensureErrorCause(cause) : undefined
    if (message !== undefined) {
      if (normalizedCause && metadata) return { cause: normalizedCause, info: metadata, message }
      if (normalizedCause) return { cause: normalizedCause, message }
      if (metadata) return { info: metadata, message }
      return message
    }
    if (normalizedCause && metadata) return { cause: normalizedCause, info: metadata }
    if (normalizedCause) return { cause: normalizedCause }
    if (metadata) return { info: metadata }
    return undefined
  }

  private static ensureErrorCause(cause: unknown): Error {
    return cause instanceof Error ? cause : new Error(String(cause))
  }

  private static captureErrorStackTrace(
    targetObject: object,
    constructorOpt?: ErrorConstructorType,
  ): void {
    const ErrorClass = global.Error as typeof Error & {
      captureStackTrace?: (targetObject: object, constructorOpt?: ErrorConstructorType) => void
    }
    if (typeof ErrorClass.captureStackTrace === "function") {
      ErrorClass.captureStackTrace(targetObject, constructorOpt)
    }
  }

  private static deepCloneMetadata<T extends MetadataObject>(metadata: T): T {
    try {
      if (typeof structuredClone === "function") {
        return structuredClone(metadata)
      }
      return JSON.parse(JSON.stringify(metadata)) as T
    } catch {
      return { ...metadata } as T
    }
  }

  private static copyErrorMetadata(sourceError: unknown): BaseErrorMetadataCopy {
    if (!sourceError || !isObject(sourceError)) {
      return {}
    }

    if (sourceError instanceof BaseError) {
      return {
        code: sourceError.code,
        category: sourceError.category,
        metadata: sourceError.metadata
          ? BaseError.deepCloneMetadata(sourceError.metadata)
          : undefined,
      }
    }

    if (sourceError instanceof Error) {
      const err = sourceError as Error & Partial<Pick<BaseError, "code" | "category" | "metadata">>
      return {
        code: err.code,
        category: err.category,
        metadata: err.metadata ? BaseError.deepCloneMetadata(err.metadata) : undefined,
      }
    }

    return {}
  }

  private static serializeErrorCause(
    cause: unknown,
  ): SerializedError | { name: string; message: string; stack?: string } | string {
    if (cause instanceof BaseError) {
      return cause.serialize()
    }
    if (cause instanceof Error) {
      // Preserve critical Error fields for non-BaseError Error instances
      return {
        name: cause.name,
        message: cause.message,
        stack: cause.stack,
      }
    }
    return String(cause)
  }
}

// Test the different constructor overloads
const error1 = new BaseError("test error")
const error2 = new BaseError("test with cause", {
  cause: new Error("root cause"),
  metadata: { userId: 123 },
})
const error3 = new BaseError({
  cause: new TypeError("type error"),
  metadata: { action: "validation" },
})
