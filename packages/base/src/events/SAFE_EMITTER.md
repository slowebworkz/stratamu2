# SafeEmitter (design & reference)

This document describes the `SafeEmitter` implementation in
`packages/base/src/events/safe-emitter.ts`.

## Summary

- Purpose: a type-safe, Emittery-backed event emitter that isolates listener errors, exposes
  internal diagnostics, and provides a small safety bookkeeping layer (error counts and safety
  logs).
- Ownership: `SafeEmitter` is the logical owner of safety-related state (error counts, safety logs
  and private control events). Logging concerns are deliberately kept out and implemented in
  `LoggedEmitter` which extends `SafeEmitter`.

## Public API

- on(event, listener) / once(event, listener) / off(event, listener)
  - Listener errors are caught and forwarded to `onListenerError` and the internal diagnostics bus.
- emit(event, payload) / emitSafe(event, payload)
  - `emitSafe` returns boolean success; `emit` preserves Throwing semantics (and bubbles
    AggregateError etc.).
- listenerCount(eventName?)
  - Returns counts delegated to the internal `Emittery` instance. Useful for extended emitters such
    as `FilteredPriorityEmitter` which maintain their own listener lists.

## Safety bookkeeping (new)

- Internal state (private):
  - `_errorCounts: Map<string, number>` — per-event error counters.
  - `_safetyLogs: Map<string, Array<{ timestamp, error, listener }>>` — per-event log entries.
  - `_safetyEnabled: boolean` — when false, recording is disabled.
- Private control events registered on the internal `_public` bus: `resetErrorCounts`,
  `clearSafetyLogs`, `enableSafeMode`.
- Public accessors:
  - `getErrorCount(eventName?)`, `getAllErrorCounts()`
  - `getSafetyLogs(eventName?)`
  - `resetErrorCounts(eventName?)`, `clearSafetyLogs(eventName?)`
  - `isSafetyEnabled()`, `setSafetyEnabled(enabled)`
- Integration hook for subclasses:
  - `protected recordListenerErrorFor(eventName, error, listenerName)` — call this from derived
    emitters that catch and aggregate errors (e.g., `FilteredPriorityEmitter`).

## Internal diagnostics

- `SafeEmitter` maintains a global internal bus (`SafeEmitter.global`) for process-level diagnostics
  and reports. Internal events like `INTERNAL_ON_LISTENER_ERROR` and `INTERNAL_ON_EMIT_ERROR` are
  emitted to this bus.

## Design rationale

- Keep safety bookkeeping in `SafeEmitter`. It is the right owner for these semantics; derived
  emitters should reuse the same bookkeeping rather than reimplementing it.
- Keep logging in `LoggedEmitter` to avoid coupling logging concerns to the safe-emission semantics.

## Refactor options (evaluated)

1. Keep everything in `SafeEmitter` (current):
   - Pros: single place of truth; simplest for now; tests already pass.
   - Cons: `SafeEmitter` grows larger.

2. Subclass split (RECOMMENDED, no mixin):
   - Create `SafeEmitter` (core minimal emitter) and `SafetyEmitter` (extends `SafeEmitter`) that
     owns bookkeeping and private control listeners. Then change `LoggedEmitter` to extend
     `SafetyEmitter`.
   - Pros: keeps `SafeEmitter` small and focused; no mixin; state and bookkeeping are grouped but
     still available to derivatives.
   - Cons: small migration: update imports/extends in `LoggedEmitter` and any other subclasses.

3. Module-level helper functions (utilities):
   - Extract functions for bookkeeping operations, but the class must still hold state. Helpers
     reduce duplication but don't reduce `SafeEmitter` size significantly.
   - Pros: easier refactor without inheritance changes.
   - Cons: bookkeeping state still lives in `SafeEmitter`; helpers add indirection and fewer
     object-oriented invariants.

## Recommendation

- Because you explicitly rejected mixins, the pragmatic choice is option (2): create a small
  `SafetyEmitter` subclass that implements bookkeeping and private control listeners; keep
  `SafeEmitter` as the minimal safe-emission core. Update `LoggedEmitter` to extend `SafetyEmitter`.

## Migration steps (concrete)

1. Create `safety-emitter.ts` in the same folder, move safety bookkeeping fields and methods (and
   public accessors) from `safe-emitter-3.ts` into `SafetyEmitter`.
2. Keep `safe-emitter-3.ts` as the minimal core implementing on/once/off/emit/emitSafe/listenerCount
   and error bubbling/reporting. `SafeEmitter` should still define
   `protected onListenerError/onEmitError` hooks used by `SafetyEmitter`.
3. Update `LoggedEmitter` to extend `SafetyEmitter` (not `SafeEmitter`).
4. Update tests and imports as necessary; run test suite.

## Small checklist for the refactor

- [ ] Add `SafetyEmitter` file and copy code.
- [ ] Remove bookkeeping from `SafeEmitter` (or keep as thin wrappers that delegate to SafetyEmitter
      if you want runtime compatibility during migration).
- [ ] Update `LoggedEmitter` extends clause.
- [ ] Run tests and adjust types.

## Tests to add / keep

- The tests added to `packages/base/src/test` cover bookkeeping behavior, private control events and
  integration with `FilteredPriorityEmitter`. Keep them after refactor. If you split into
  `SafetyEmitter`, ensure tests instantiate the appropriate concrete class or update Emitter
  subclasses to extend the new base.

## Performance and production notes

- Consider adding a per-event safety log cap (configurable) to avoid unbounded memory growth in
  long-lived servers.
- Consider exposing metrics hooks so the counts can feed Prometheus or other monitoring systems.

## Performance (Big‑O)

This section summarizes the time and space complexity for common operations in `SafeEmitter`,
`SafetyEmitter`, and `LoggedEmitter`. Let n = number of listeners for a given event, m = number of
distinct event names, E = total recorded safety log entries, and cap = per-event safety log cap.

- SafeEmitter
  - on(event, listener): Time O(1) amortized, Space O(1) per registration
  - off(event, listener): Time O(n) (listener removal typically scans the listeners array), Space
    O(1)
  - once(event, listener): Time O(1) to register; runtime cost O(1) per handler when fired
  - emit(event, payload) [serial]: Time O(n \* handlerCost), Space O(1) additional
  - listenerCount(...): Time O(1) per event, O(k) for k events

- SafetyEmitter (bookkeeping)
  - \_recordListenerError: incrementCount O(1); pushLog amortized O(1) but worst-case O(cap) due to
    array-shift trimming (current implementation). Space O(1) per recorded entry up to cap per
    event.
  - getErrorCount(event): O(1); getErrorCount() total: O(m)
  - getAllErrorCounts(): O(m) time and space
  - getSafetyLogs(event): O(cap) worst-case; getSafetyLogs() across all events: O(E)
  - reset/clear per-key: O(1); global clear: O(m)

- LoggedEmitter
  - constructor/setup: O(1) (small constant per log level)
  - log[level](...): O(1) wrapper + cost of logger serialization/IO (depends on payload size)
  - createChildLogger: O(1)

Hotspots & recommendations:

- Listener removal: Emittery removal is array-based and O(n); if removals are frequent and costly,
  consider an id/node-based removal strategy (linked list or id->node map) to achieve O(1) removals
  while preserving order.
- Safety log trimming: replace per-event arrays with a small circular buffer/ring buffer to make
  pushes and evictions O(1) and avoid repeated O(cap) shifts.
- Emission strategy: serial emission is deterministic but blocked by slow listeners. Consider
  offering a parallel or hybrid dispatch mode if lower tail latency for other listeners is
  important.

If you'd like, I can implement the ring buffer for `_safetyLogs` (low-risk), or change listener
removal semantics to be O(1) (higher impact). Tell me which you'd prefer and I will prepare a patch
with tests.

If you want, I can:

- Implement the `SafetyEmitter` subclass refactor (move bookkeeping out of `SafeEmitter` into
  `SafetyEmitter`) and update `LoggedEmitter` to extend it. I'll do it in a way that keeps tests
  green and uses small migration commits.
- Or I can extract module-level helpers instead if you prefer a gentler change.

---

Document created by automated repository assistant on 2025-10-08.

## Migration note (2025-10-09)

- The historical `SafetyEmitter` compatibility subclass that previously lived in `safe-emitter-3.ts`
  has been removed. The standalone bookkeeping engine now lives in `safety-emitter.ts` and
  `SafeEmitter` composes it internally.

- If your code previously did `class X extends SafetyEmitter<EM>`:
  - Prefer `class X extends SafeEmitter<EM>` and rely on the composed safety manager already present
    on `SafeEmitter` instances. `SafeEmitter` exposes compatibility proxy methods (getErrorCount,
    getSafetyLogs, etc.).
  - Alternatively, if you only need the bookkeeping helper, import the standalone `SafetyEmitter`
    from `./safety-emitter.js` and construct it with an internal public bus:
    `new SafetyEmitter(internalPublicBus(myEmitter), opts)`.

This change reduces duplication and clarifies ownership: `SafeEmitter` is the public-facing emitter
surface while `SafetyEmitter` is the composable safety manager. Tests were updated accordingly.
