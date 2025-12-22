import type { BaseClient } from "@/networking"
import type { Promisable, ValueOf } from "type-fest"
import type { FilterName } from "./index.ts"

/**
 * Shared types for the stratamu monorepo.
 *
 * These types are intended for use across all packages.
 */

export type OutputPipeline = (text: string) => Promisable<string>

/**
 * A function that transforms output text for a client, possibly chaining to the next filter.
 * Supports both synchronous and asynchronous (Promise) pipelines.
 * @param client The client instance.
 * @param text The text to filter.
 * @param next The next filter in the chain.
 */
export type OutputFilter = (
  client: BaseClient,
  text: string,
  next: OutputPipeline,
) => Promisable<string>

/**
 * A type representing any output filter function for any filter name.
 */
export type AnyFilter = ValueOf<Record<FilterName, OutputFilter>>
