import { EError } from "exceptional-errors"

import type { ErrorCapability, ErrorMetadata, ErrorOptions, ExceptionalError } from "./types.ts"

export class ExceptionalErrors implements ErrorCapability {
  static create(): ExceptionalErrors {
    return new ExceptionalErrors()
  }

  create<Meta extends ErrorMetadata = ErrorMetadata>(message: string): ExceptionalError<Meta>

  create(error: Error): ExceptionalError

  create<Meta extends ErrorMetadata = ErrorMetadata>(
    options: ErrorOptions<Meta>,
  ): ExceptionalError<Meta>

  create<Meta extends ErrorMetadata = ErrorMetadata>(
    messageOrErrorOrOptions: string | Error | ErrorOptions<Meta>,
  ): ExceptionalError<Meta> {
    if (typeof messageOrErrorOrOptions === "string") {
      return new EError<Meta, Error>(messageOrErrorOrOptions)
    }

    if (messageOrErrorOrOptions instanceof Error) {
      return new EError<ErrorMetadata, Error>(
        messageOrErrorOrOptions.message,
        messageOrErrorOrOptions,
      ) as ExceptionalError<Meta>
    }

    const { cause, metadata } = messageOrErrorOrOptions

    if (cause !== undefined) {
      return new EError<Meta, Error>(cause.message, {
        cause,
        ...(metadata === undefined ? {} : { info: metadata }),
      })
    }

    if (metadata !== undefined) {
      return new EError<Meta, Error>({ info: metadata })
    }

    return new EError<Meta, Error>()
  }

  from(error: unknown): ExceptionalError {
    if (error instanceof EError) {
      return error
    }

    if (error instanceof Error) {
      return this.create(error)
    }

    return this.create({
      metadata: {
        thrown: error,
      },
    })
  }
}
