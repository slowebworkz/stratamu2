# SafeEmitter: Design and Purpose

## Overview

`SafeEmitter` is a type-safe, robust event emitter class built on top of the
[Emittery](https://github.com/sindresorhus/emittery) library. It is designed to provide a flexible,
maintainable, and error-resilient event system for TypeScript projects, especially those requiring
both global and per-instance event handling, strong typing, and optional safety features.

## Key Features

- **Type Safety:** Uses a generic `EventMap` (extending `BaseEventMap`) to ensure event names and
  payloads are type-checked at compile time.
- **Per-Instance and Global Events:** Supports both per-instance event buses and a static/global
  event bus for cross-cutting events.
- **Wrapper Methods:** Provides wrapper methods (`on`, `once`, `off`, `emit`) that delegate to the
  underlying `Emittery` instance, enforcing type safety and allowing for future extension.
- **Private/Internal Events (Advanced):** Some versions add support for private/internal events,
  used for internal state management, error tracking, or safety toggling.
- **Error Handling (Advanced):** Advanced versions wrap listeners in try/catch, log errors, and emit
  special error events to avoid crashing the process on listener failure.
- **Logging (Advanced):** Integration with logging libraries (e.g., `pino`) for structured event and
  error logging.

## Why Not Just Use Emittery?

While `Emittery` is a powerful and type-safe event emitter, `SafeEmitter` adds:

- Stronger typing via your own `BaseEventMap` pattern
- Optional global/static event bus
- Optional error handling and logging
- Optional private/internal event system

This makes `SafeEmitter` suitable for complex applications (e.g., game engines, servers) where event
safety, observability, and internal state management are critical.

## Scaffolding New Versions

When creating a new version of `SafeEmitter`, consider:

1. **Type Safety:**
   - Always use a generic `EventMap` extending your project's `BaseEventMap`.
   - Ensure all event methods (`on`, `once`, `off`, `emit`) are strongly typed.

2. **Event Buses:**
   - Provide both per-instance and static/global event buses if needed.
   - Use `Emittery` as the underlying implementation.

3. **API Surface:**
   - Expose wrapper methods for all core event operations.
   - Optionally add support for private/internal events.

4. **Private/Internal Events:**
   - Define a set of private/internal event names and their payloads. These are not exposed to
     external consumers.
   - Extend the event map type so that internal events are available to the emitter, but not to
     public consumers.
   - Use a naming convention (e.g., prefix or symbol keys) to distinguish private events.
   - Only allow internal methods to emit or listen to these events (do not expose public methods for
     them).

### Private/Internal Events in Existing Implementations

#### `safe-emitter.ts`

This version defines a set of private events for internal operations and safety management:

```ts
type SafeEmitterPrivateEvents = {
  resetErrorCounts: [eventName?: string]
  clearSafetyLogs: [eventName?: string]
  enableSafeMode: [enabled: boolean]
}
```

These are combined with the public event map:

```ts
type SafeEmitterEvents<T extends BaseEventMap> = T & SafeEmitterPrivateEvents
```

The class sets up listeners for these private events internally and exposes no public API for them.
They are used for:

- Resetting error counts (`resetErrorCounts`)
- Clearing safety logs (`clearSafetyLogs`)
- Enabling/disabling safety mode (`enableSafeMode`)

#### `safe-emitter-new.ts`

This version uses internal event keys (e.g., `INTERNAL_ON_EMIT_ERROR`, `INTERNAL_ON_LISTENER_ERROR`)
for error handling and tracking. These are not exposed to the public API and are only used by
internal methods for:

- Emitting and handling listener errors
- Emitting and handling emit errors

The internal event map is merged with the public event map for internal use, but only protected
methods can emit or listen to these events.

#### General Pattern

- Private/internal events are defined in a separate type or with symbol keys.
- They are combined with the public event map for internal use.
- Only internal/protected methods interact with these events.
- Public consumers cannot subscribe to or emit these events.

This approach keeps internal event handling robust and encapsulated, as recommended in this guide.

4. **Error Handling (Optional):**
   - Wrap listener calls in try/catch.
   - Emit error events or log errors as appropriate.
   - Provide hooks for custom error handling.

5. **Logging (Optional):**
   - Integrate with a logger for event and error tracking.

6. **Documentation:**
   - Document the purpose, features, and usage of each version.
   - Note any differences from the base `Emittery` API.

## Example: Minimal SafeEmitter

```ts
import Emittery from 'emittery'
import type { BaseEventMap } from '@repo/types'

export class SafeEmitter<EventMap extends BaseEventMap<any> = BaseEventMap> {
  static global = new Emittery()
  private readonly _public = new Emittery<EventMap>()

  on<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void) {
    return this._public.on(event, listener)
  }

  once<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void) {
    return this._public.once(event).then(listener)
  }

  off<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void) {
    return this._public.off(event, listener)
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]) {
    return this._public.emit(event, data)
  }
}
```

## Example: Advanced SafeEmitter (Features to Consider)

- Error tracking and safety logs
- Private/internal event system
- Integration with logging libraries
- Metrics or analytics hooks

## Conclusion

`SafeEmitter` is a flexible foundation for building event-driven systems with strong type safety and
optional advanced features. Use the minimal version for simple needs, and scaffold new versions with
additional capabilities as your application's requirements grow.
