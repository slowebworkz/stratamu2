import type { EError } from "exceptional-errors"

export type ErrorMetadata = Record<string, unknown>

export interface ErrorOptions<Meta extends ErrorMetadata = ErrorMetadata> {
  cause?: Error
  metadata?: Meta
}

export type ExceptionalError<Meta extends ErrorMetadata = ErrorMetadata> = EError<Meta, Error>

export interface ErrorCapability {
  create<Meta extends ErrorMetadata = ErrorMetadata>(message: string): ExceptionalError<Meta>

  create(error: Error): ExceptionalError

  create<Meta extends ErrorMetadata = ErrorMetadata>(
    options: ErrorOptions<Meta>,
  ): ExceptionalError<Meta>

  from(error: unknown): ExceptionalError
}
