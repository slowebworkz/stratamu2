import { BaseError } from "@/errors"

/* ------------------------- Helpers ------------------------- */

const BLOCKED_MAP_METHODS = new Set(["set", "delete", "clear"])

function isBlockedMapMethod(prop: unknown): prop is string {
  return typeof prop === "string" && BLOCKED_MAP_METHODS.has(prop)
}

function createReadonlyMapError<K, V>(method: string, args: unknown[], map: Map<K, V>) {
  return new BaseError(`Attempted to call mutating method '${method}' on a readonly Map.`, {
    code: "READONLY_MAP_MUTATION_ATTEMPT",
    category: "logic",
    metadata: {
      method,
      arguments: args,
      mapSize: map.size,
      availableMethods: ["get", "has", "entries", "keys", "values", "forEach", "size"],
      suggestion: `Use a mutable Map if you need to call ${method}(), or create a new Map with the desired changes`,
    },
  })
}

/* ---------------------- Readonly Proxy ---------------------- */

/**
 * Creates a readonly proxy around a Map that prevents container mutations.
 *
 * Blocks: `set()`, `delete()`, `clear()`
 * Allows: `get()`, `has()`, `entries()`, `keys()`, `values()`, `forEach()`, `size`
 *
 * @param map - The Map to make readonly
 * @returns A readonly proxy of the Map
 */
export function makeReadonlyMap<K, V>(map: Map<K, V>): ReadonlyMap<K, V> {
  return new Proxy(map, {
    get(target, prop, receiver) {
      if (isBlockedMapMethod(prop)) {
        return (...args: unknown[]) => {
          throw createReadonlyMapError(prop, args, target)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as ReadonlyMap<K, V>
}
