# Events (SafeEmitter & SafetyEmitter)

This folder contains the type-safe Emittery-based emitters used across the repo. Key pieces:

- `SafeEmitter` — the public, type-safe emitter surface. It composes the standalone safety manager
  and exposes safety accessors.
- `SafetyEmitter` — the standalone safety bookkeeping manager (error counts, bounded safety logs).
  Intended to be composed by `SafeEmitter` or used in test harnesses.

Usage (typical)

```ts
import { SafeEmitter } from '@repo/base'

class MyEmitter extends SafeEmitter<{ hello: [string] }> {}

const e = new MyEmitter()

// `SafeEmitter` composes a `SafetyEmitter` and exposes safety helpers
e.on('hello', async (name) => {
  throw new Error('boom')
})
await e.emitSafe('hello', 'world')
console.log(e.getErrorCount('hello'))
```

Advanced / test harness

```ts
import { SafetyEmitter } from './safety-emitter.js'
import { internalPublicBus } from './events-types.js'

// When constructing a standalone manager for tests, provide an internal public
// bus created from your emitter under test:
const manager = new SafetyEmitter(internalPublicBus(myEmitter), { safetyLogCap: 50 })
```

Migration note

- The historical compatibility subclass named `SafetyEmitter` that extended `SafeEmitter` has been
  removed. If you previously extended that class, change your code to extend `SafeEmitter` instead.
  `SafeEmitter` continues to expose the public safety accessors and composes the standalone manager.
