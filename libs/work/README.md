# @stratamu/work

`Work`: what operation is being requested, and what input that operation needs.

**Status:** small and tested. Private and unpublished. Depends on [`@stratamu/primitives`](../primitives) for the namespaced-kind guard. Nothing depends on it yet.

## What exists

- `Work<K, I>`: `{ readonly kind: K; readonly input: I }`. It says nothing about time, queues or lifecycle. The engine makes a task from it, and that is where those live.
- `work(kind, input)`: creates a `Work`, checking its kind at run time. The result is frozen, but only shallowly: `input` itself is not.
- `WorkKind`: a dotted name owned by whoever defines it, such as `mush.command`, `moo.program` or `diku.combat`. `isWorkKind` is the guard, for data that has not been checked, such as a kind read back from storage. `workKind` checks a kind at run time and returns it with its literal type intact, so a malformed one fails when the module that declares it loads.

## Rules

- **Adapters own the kinds.** This package defines no kinds and knows nothing about MUSH, MOO, Diku or any other game. An adapter defines its own union:
  ```ts
  type MushWork = Work<"mush.command", MushCommand> | Work<"mush.trigger", MushTrigger>
  ```
- **Kinds are namespaced,** so a MUSH `command` and a Diku `command` cannot collide in a handler registry.
- **`WorkKind` is a template-literal type, not a brand:** `` `${string}.${string}` ``. A literal kind keeps its exact type, so a union of `Work` values narrows on `kind`. A brand would erase the literal and break that. The type checks at compile time that a kind has a namespace, and it cannot check the rest of the pattern, such as lower case, so the guard and `work()` check that at run time.
- **`Work` is structural,** so a plain `{ kind, input }` object is assignable to it without going through `work()`. Anything that accepts `Work` from outside, such as the runtime, should check the kind with `isWorkKind` itself.
- **The pattern lives in `@stratamu/primitives`,** as `isNamespacedKind`, which `isWorkKind` calls. That pattern must not have a `g` or `y` flag, because `RegExp.test` would then keep state between calls and alternate between matching and not matching. A test here checks that repeated calls give the same answer.

## Not yet

- An `isWork` guard for a whole stored `Work`.
