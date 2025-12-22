import type { PartialDeep, Simplify } from "type-fest"
/**
 * A union type of all filter names.
 */
export type FilterName =
  | "ansi"
  | "pueblo"
  | "mxp"
  | "msdp"
  | "utf8"

/**
 * Capabilities supported by a client, keyed by filter name and extensible for custom keys.
 */
export type ClientCapabilities = Simplify<
  PartialDeep<Record<FilterName, boolean>> & {
    [key: string]: unknown
  }
>
