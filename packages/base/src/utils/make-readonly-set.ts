import { BaseError } from "@/errors"

const BLOCKED_METHODS = new Set(["add", "delete", "clear"])

function isBlockedMethod(prop: string) {
  return BLOCKED_METHODS.has(prop)
}

function createReadonlySetError<T>(method: string, args: unknown[], set: Set<T>) {
  return new BaseError(`Attempted to call mutating method '${method}' on a readonly Set.`, {
    code: "READONLY_SET_MUTATION_ATTEMPT",
    category: "logic",
    metadata: {
      method,
      arguments: args,
      setSize: set.size,
      availableMethods: ["has", "values", "keys", "entries", "forEach", "size"],
      suggestion: `Use a mutable Set if you need to call ${method}(), or create a new Set with the desired changes`,
    },
  })
}

/**
 * Creates a readonly proxy around a Set that prevents container mutations.
 *
 * **What it blocks:**
 * - Method calls: `add()`, `delete()`, `clear()`
 *
 * **What it DOESN'T block:**
 * - Object property mutations: If the Set contains objects, those objects can still be mutated
 * - Indirect access: Spreading, iteration, and other read operations work normally
 * - Prototype bypasses: `Set.prototype.add.call(s, value)` can bypass the proxy
 *
 * This implements shallow immutability matching TypeScript's `ReadonlySet<T>` semantics.
 *
 * **Performance:**
 * - Every property access goes through the Proxy, adding small overhead
 * - Usually negligible unless used in hot paths with frequent operations
 *
 * **Type Safety:**
 * - The `ReadonlySet<T>` cast provides compile-time immutability checking
 * - TypeScript cannot enforce immutability at runtime - only the Proxy prevents mutations
 *
 * @example
 * ```typescript
 * const obj = { value: 1 };
 * const s = makeReadonlySet(new Set([obj]));
 *
 * // ❌ These throw errors
 * // s.add(2);
 * // s.delete(obj);
 * // s.clear();
 *
 * // ✅ These work
 * obj.value = 42; // Mutates object inside the set
 * const arr = [...s]; // Creates array copy
 * ```
 *
 * @param set - The Set to make readonly
 * @returns A readonly proxy of the Set
 */
export function makeReadonlySet<T>(set: Set<T>): ReadonlySet<T> {
  return new Proxy(set, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && isBlockedMethod(prop)) {
        return (...args: unknown[]) => {
          throw createReadonlySetError(prop, args, target)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as ReadonlySet<T>
}
