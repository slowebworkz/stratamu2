# Runtime Execution Policy: Who Steps the Runtime, and How Often

## Status

**Investigation only — nothing implemented.** `engine/core`'s README already lists this as deferred ("Not yet: ... the engine *lifecycle* (start/stop/run-loop sequencing) ... Phases and boundaries, fairness and budgets, and a policy that reads `priority`"), and this document does not revise that. It exists because a concrete composition — the Telnet login/game flow in `plugins/telnet/test` — ran into the gap directly: `runAberMUDLogin` calls `void engine.runtime.drain()` after every line, and `Runtime.drain()`'s own docstring says plainly that it is "not a model of a server loop."

Scope: whether `Runtime` needs a new capability at all to be driven safely by a real transport, and if so, the smallest one. Not in scope: an autonomous `Runtime.start()`/`stop()` loop, a wall-clock driver, or designing fairness/phases for a game family that doesn't need them yet. Those stay deferred, per the README.

## The problem, precisely

`Engine.receive` only parses input and submits `Work`; it does not run anything. Something has to call `Runtime.step()` (or `drain()`) afterward, and the transport composition currently reaches for `drain()`, which loops `step()` until it returns `false`. `drain()`'s own docstring: "work that keeps producing work never finishes, so a server takes bounded steps and lets its policy set boundaries." For a `LOOK` or `SAY` in AberMUD today, that's harmless — nothing reschedules itself, so `drain()` runs a handful of steps and returns. But the composition calling it has no way to know that in general; it works by accident of what AberMUD currently does, not by a guarantee `Runtime` gives it.

## What the substrate already provides

This is the important finding: **bounded execution needs no new mechanism.** `ExecutionPolicy.next()` already has exactly the contract a budget needs:

> Returning `undefined` runs nothing further for now, and the ready tasks stay ready. That is how a policy expresses a budget, a wait state or a boundary it will not cross.

And `Runtime.#next()` (`runtime.ts`) already treats "the policy declined" identically to "nothing is ready": both make `step()` return `false`, and neither one discards anything. A ready task the policy skipped stays in its lane, untouched, ready to be chosen on the *next* call to `step()` — including one from an entirely separate external event, arriving after the current `drain()` call has already returned. The mechanism for "run some, stop, pick up the rest later" is not missing. What's missing is anything that *uses* it for a budget.

Two smaller things confirmed while reading `runtime.ts`, `policy/types.ts` and `lane/`:

- `ExecutionPolicy` is set once, at `Runtime` construction (`options.policy ?? oldestReady()`), and is never swapped. A policy that wants a per-call budget needs its own way to know when one external call ends and the next begins — `Runtime` gives it no such signal today.
- `ReadyTask.batch` already distinguishes "became ready together" from "became ready later," which is a real, if partial, notion of round already recorded by the substrate for other reasons (ordering, not budgeting).

## Two different problems that look like one

The architecture document's undesigned list — "priority, fairness and execution budgets," "logical boundaries and phases" — is bigger than what this composition actually needs, and conflating them risks either overbuilding or stalling on the whole list before fixing the one real gap:

1. **"Don't let one call run forever."** This is what the Telnet composition needs today. AberMUD has no pulses, no phases, and (currently) no handler that reschedules itself — the risk is `drain()` in general, not anything AberMUD's own handlers do right now. Solving this needs only a bound on *how many steps one call takes*, which is a mechanism, not a policy: identical in kind to a caller looping `step()` itself a fixed number of times.
2. **Fairness and phases for a pulse- or tick-based game family** (Diku/Circle-style). Nothing in this repository is that family yet. Building fairness-under-budget or phase boundaries now would be designed against a game that doesn't exist here, which is exactly what the architecture document and `engine/core`'s README already say not to do ("Do not build game-specific schedulers into core, and stop adding scheduler features before the work model ... is defined" — from the architecture-roles decision this repo already recorded).

This document only addresses (1).

## Proposed next step

Add a bounded sibling to `drain()`:

```ts
/**
 * Takes up to `maxSteps` steps, stopping early if nothing more is ready or the policy declines.
 * Unlike `drain()`, always returns: a handler that keeps producing work cannot make this loop
 * forever. Ready work `drain()` would have kept running stays ready, unchanged, for a later call.
 */
async pump(maxSteps: number): Promise<number>
```

This is not a policy change and not a fairness decision — it bounds *how many `step()` calls happen*, exactly what a caller could already do by hand:

```ts
let steps = 0
while (steps < maxSteps && (await runtime.step())) {
  steps++
}
```

`pump` only exists to give that loop a name and a place, the same relationship `drain()` already has to calling `step()` in an unbounded loop. It needs no change to `ExecutionPolicy`, `Lane`, or anything about ordering. It does not touch `priority`, phases, or fairness between lanes — a budget that has to choose *fairly* among several sessions competing for the same bounded steps is squarely tomorrow's problem (2), not this one.

The Telnet composition would then read:

```ts
engine.receive({ session, raw })
void engine.runtime.pump(SOME_BOUND)
```

replacing the unbounded `drain()`. `SOME_BOUND` is itself a small open question — a constant is honest about how little is known yet about what a "step budget per line" should be, versus a config value that implies more design than exists.

## Open questions

1. **Is a bound even the right shape**, versus, say, a time budget (stop after N milliseconds of wall time)? A step count is simpler and keeps `Runtime` reading no wall clock, consistent with `DETERMINISM.md`; a time budget would need one, and reading wall time for scheduling is explicitly the thing `Runtime` avoids. Step count is recommended for that reason, not just simplicity.
2. **What bound.** Not answerable in the abstract; likely answered once `pump` exists and gets used, the same way ECHO taught `TelnetNegotiator` what it actually needed.
3. **Whether `pump` belongs on `Runtime` or one level up** (a small helper in `engine-core`'s `composition/`, next to `Engine`). Putting it on `Runtime` matches `step`/`drain` living there already; a composition-level helper would keep `Runtime` itself smaller. Leaning `Runtime`, for symmetry with `drain`, but not decided.
4. **Fairness and phases stay deferred**, explicitly, until an adapter that actually needs them (a pulse-driven game family) exists. Nothing here should be read as a first step toward that design.

## Next step

Implement `pump(maxSteps)` on `Runtime`, update `runAberMUDLogin` to call it instead of `drain()`, and re-run the Telnet vertical-slice test to confirm nothing about the observable behavior changes for AberMUD's own (non-rescheduling) handlers — the point of this change is what happens when a handler *does* reschedule itself, which nothing in this repository's tests currently exercises, and may be worth adding as its own test once `pump` exists.
