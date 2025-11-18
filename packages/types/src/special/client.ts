import type { PartialDeep, Simplify } from "type-fest";

/**
 * All supported output filter names.
 */
export const FILTER_NAMES = ["ansi", "pueblo", "mxp", "msdp", "utf8"] as const;

/**
 * A union type of all filter names.
 */
export type FilterName = (typeof FILTER_NAMES)[number];

/**
 * Capabilities supported by a client, keyed by filter name and extensible for custom keys.
 */
export type ClientCapabilities = Simplify<
  PartialDeep<Record<FilterName, boolean>> & {
    [key: string]: unknown;
  }
>;
