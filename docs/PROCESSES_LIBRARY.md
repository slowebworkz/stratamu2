# `@stratamu/processes` Implementation Plan

Status: Proposed, not yet implemented. This is a working plan, not a changelog — sections and
phases below describe intent until the corresponding code actually exists, the same discipline
[Game Engine Architecture](./GAME_ENGINE_ARCHITECTURE.md) and
[Development Server](./DEVELOPMENT_SERVER.md) use for their own plans.

## 1. Purpose

Create a reusable StrataMU2 library for executing work outside the authoritative game runtime.

The library will support:

1. **Worker threads** for CPU-intensive JavaScript/TypeScript work.
2. **Child processes** for isolated or external workloads, including programs written in Rust, Go, C/C++, Python, or other languages.

The library is infrastructure. It should not know anything about MUDs, MUSHes, MOOs, MUCKs, MUXes, rooms, players, combat, or game entities.

The game engine and plugins may consume the library through explicitly granted capabilities.

## 2. Architectural goals

### Primary goals

#### Keep the authoritative game runtime single-owner

Workers and child processes should calculate or perform work, but they should not directly mutate the authoritative game world.

The preferred model is:

```text
Game Runtime
     │
     │ request
     ▼
Execution Service
     │
     ├── Worker Thread
     │
     └── Child Process
     │
     ▼
Result
     │
     ▼
Game Runtime
     │
     └── validate + apply
```

#### Provide strong lifecycle management

The library should handle:

- starting
- running
- completion
- failure
- cancellation
- timeouts
- termination
- shutdown
- unexpected exit
- diagnostics

#### Support both short-lived jobs and long-lived services

Examples:

```text
One-shot worker
    pathfinding request
    → result
    → worker becomes available

Long-running process
    Rust map server
    → communicate for hours
    → graceful shutdown
```

#### Keep language-independent processes language-independent

The process manager should not care whether an executable is Rust, Go, C, Python, Zig, etc.

It should communicate through a defined process protocol.

## 3. Non-goals for the first version

Do not build these initially:

- a distributed job scheduler
- a cluster manager
- a generic microservice framework
- automatic horizontal scaling
- container orchestration
- a persistent job database
- a generalized RPC framework
- automatic process discovery
- unrestricted plugin process spawning
- shared mutable world state between threads
- a universal abstraction pretending Workers and child processes are identical

Those can be added later if an actual use case emerges.

## 4. Package structure

Start narrower than the vocabulary in the rest of this document might suggest. The repository
already has `@stratamu/capabilities` for small contracts/adapters and `@stratamu/task`/
`@stratamu/work` for execution-related concepts (an admitted, immutable execution instance; what
operation is requested and its input) — this package's own lifecycle types must not duplicate what
those already own. Where the two overlap is exactly the kind of boundary question to resolve while
writing the first real module, not to guess at here.

```text
libs/
  processes/
    src/
      index.ts

      workers/
        worker-pool.ts
        worker-task.ts
        worker-runtime.ts

      children/
        child-process-manager.ts
        managed-process.ts
        process-definition.ts

      shared/
        errors.ts
        lifecycle.ts

    package.json
    tsconfig.json
    tsconfig.build.json
    README.md
```

`workers/` and `children/` are separate, sibling modules with their own contracts from the start —
not a unified "execution" abstraction both implement. A worker pool and a managed child process
share only a small vocabulary (execution state, cancellation, lifecycle errors — `shared/`); forcing
them through one interface to look symmetrical would hide the real differences between an
in-process V8 isolate and an OS process boundary, for no actual benefit yet.

Package name:

```text
@stratamu/processes
```

Do not split this into multiple packages yet, and do not introduce a host-neutral abstraction
purely for theoretical portability: StrataMU2 is a Node.js application today, and `@stratamu/processes`
is Node infrastructure, full stop. Keep the *game engine* decoupled from this package by injecting
it as a service where needed (§20) — that is a different, already-justified seam from "could this
package itself run somewhere other than Node," which nothing currently requires.

### Important design decisions

| Decision | Recommendation |
|---|---|
| Package | `@stratamu/processes` |
| Runtime | Node.js; this is a Node infrastructure package |
| Worker threads | A bounded pool for CPU-intensive JS/TS jobs |
| Child processes | Managed one-shot commands and long-running services |
| Communication | Worker messaging for threads; JSON Lines over stdio as the first cross-language protocol |
| Cancellation | `AbortSignal` in public APIs, with explicit termination semantics |
| Shutdown | One manager-level shutdown operation, integrated with server shutdown |
| Game-state access | Workers return results; the authoritative runtime validates and applies them |
| Plugin access | Explicitly granted capabilities, not unrestricted spawning |

### Relationship to `apps/server/src/dev-server.ts`

`dev-server.ts` (the `pnpm dev:server`/`dev:server:kill`/`dev:server:restart` runner; see
[Development Server](./DEVELOPMENT_SERVER.md)) stays exactly what it is: a small application
utility that manages one OS process for local development, with its own narrow contract
(`start`/`kill`/`restart`, a PID file, `SIGINT` then `SIGKILL`). It does not move into this library.
Its real value to this proposal is the lifecycle lessons it already paid for firsthand — startup
errors (`spawn`'s `"error"` event), exit-code propagation, signal delivery and escalation, timeout
handling, idempotent shutdown, and the PID-file ownership races its own review surfaced (see
[Development Server](./DEVELOPMENT_SERVER.md)) — which directly inform
`children/child-process-manager.ts`'s design (§10-§14) rather than being copied from it. A reusable
process manager needs a different contract than a single hardcoded dev-server runner (multiple
managed processes, process *definitions* instead of one fixed executable, a messaging protocol) --
reimplemented with those lessons already learned, not inherited as code.

## 5. Common execution concepts

Both mechanisms should share a small vocabulary.

### Execution state

Something approximately like:

```ts
export type ExecutionState =
  | "starting"
  | "running"
  | "stopping"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed-out";
```

The exact state model should be refined during implementation.

### Execution identity

Every running operation should have an identifier.

```ts
type ExecutionId = string;
```

This makes logging, diagnostics, cancellation, and correlation much easier.

### Cancellation

Both execution mechanisms should accept `AbortSignal`.

```ts
interface ExecutionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
```

Cancellation should be a first-class lifecycle operation rather than an afterthought.

### Failure

Define explicit library errors for:

- startup failure
- execution failure
- timeout
- cancellation
- protocol failure
- unexpected termination

Do not make callers interpret arbitrary Node exceptions to determine what happened.

## 6. Worker-thread subsystem

### Purpose

Worker threads are for CPU-bound JavaScript/TypeScript work that would otherwise block the Node event loop.

Potential StrataMU uses:

- pathfinding
- large world searches
- procedural generation
- expensive text processing
- indexing
- geometry
- large graph operations
- simulation calculations
- data transformations

### Worker model

Use a pool rather than creating a new Worker for every job.

Conceptually:

```text
WorkerPool
   │
   ├── Worker 1
   ├── Worker 2
   ├── Worker 3
   └── Worker N
```

Jobs enter a queue when all workers are busy.

The initial implementation should have:

- configurable worker count
- FIFO queue
- bounded queue
- job timeout
- cancellation
- worker failure detection
- worker replacement
- graceful shutdown

### Worker API

Aim for something along these lines:

```ts
interface WorkerPool {
  submit<TInput, TOutput>(
    task: WorkerTask<TInput, TOutput>,
    input: TInput,
    options?: ExecutionOptions,
  ): Promise<TOutput>;

  shutdown(options?: ShutdownOptions): Promise<void>;
}
```

The exact API may change after implementing one real job.

## 7. Worker task model

Do not serialize arbitrary functions and send them to workers.

Instead, workers should execute registered task modules.

Conceptually:

```ts
interface WorkerTask<TInput, TOutput> {
  readonly name: string;
  readonly execute: (
    input: TInput,
  ) => TOutput | Promise<TOutput>;
}
```

However, because the actual worker executes in another isolate, the public representation may eventually need to become:

```ts
interface WorkerTaskDefinition {
  readonly id: string;
  readonly module: URL;
}
```

The worker loads the module and executes the known operation.

This makes tasks:

- testable
- typed
- discoverable
- versionable
- independent of closures
- compatible with worker isolation

## 8. Worker communication

Use Node's worker messaging mechanism internally.

Initial transport:

```text
structured clone
```

Later, optimize particular workloads with:

```text
Transferable
ArrayBuffer
SharedArrayBuffer
```

Do not prematurely optimize the message protocol.

The first important benchmark is whether real StrataMU workloads actually need zero-copy transport.

## 9. Worker isolation rules

Workers may:

- perform calculations
- read supplied input
- produce results
- use explicitly permitted resources

Workers must not:

- mutate engine entities
- call game commands
- directly alter the authoritative world
- hold references to live game objects

Instead:

```text
snapshot → worker → result → authoritative runtime
```

This is especially important for deterministic simulation.

## 10. Child-process subsystem

### Purpose

Child processes are for work that benefits from a process boundary.

Examples:

- Rust utilities
- Go utilities
- C/C++ utilities
- Python tools
- external services
- legacy MUD utilities
- map rendering
- image generation
- large import/export operations
- specialized databases or indexes
- long-running integrations

Use Node's process spawning facilities internally.

The default should be equivalent to:

```text
spawn(executable, args)
```

rather than invoking a shell.

## 11. Two child-process modes

The initial API should recognize two common cases.

### One-shot process

```text
start
  ↓
do work
  ↓
exit
```

Examples:

```text
generate-map
convert-world
build-index
compress-database
```

API concept:

```ts
const result = await processes.run({
  executable: "...",
  args: [...],
});
```

### Managed service process

```text
start
  ↓
running
  ↓
messages
  ↓
messages
  ↓
stop
```

Examples:

```text
Rust pathfinding service
Go web integration service
Discord bridge
legacy utility daemon
```

API concept:

```ts
const service = await processes.start({
  executable: "...",
  args: [...],
});
```

The distinction should exist in the API rather than making every caller implement lifecycle management itself.

## 12. Child-process protocol

For cross-language integration, establish a simple protocol.

Initial recommendation:

```text
JSON Lines over stdin/stdout
```

For example:

```json
{"id":"42","operation":"pathfind","from":100,"to":918}
```

Response:

```json
{"id":"42","ok":true,"result":{"path":[100,101,105,918]}}
```

Diagnostics go to:

```text
stderr
```

This gives Rust and Go programs an extremely simple integration point.

It is also easy to test manually:

```bash
echo '{"id":"42","operation":"..."}' | ./utility
```

Do not make JSON Lines mandatory for every conceivable process. Make it the first supported protocol.

Later protocols could include:

```text
binary framed messages
MessagePack
CBOR
protobuf
Unix domain sockets
TCP
```

Only add another protocol when an actual workload requires it.

## 13. Process lifecycle API

A managed child process should expose something like:

```ts
interface ManagedProcess {
  readonly id: string;
  readonly pid: number | undefined;
  readonly state: ProcessState;

  send(message: unknown): Promise<void>;

  stop(options?: StopOptions): Promise<void>;

  kill(): Promise<void>;
}
```

The manager:

```ts
interface ProcessManager {
  start(
    definition: ProcessDefinition,
    options?: StartOptions,
  ): Promise<ManagedProcess>;

  run(
    definition: ProcessDefinition,
    options?: RunOptions,
  ): Promise<ProcessResult>;

  get(id: string): ManagedProcess | undefined;

  stop(id: string, options?: StopOptions): Promise<void>;

  stopAll(options?: StopOptions): Promise<void>;
}
```

This should remain intentionally small until real callers exist.

## 14. Process definitions

Separate configuration from runtime state.

```ts
interface ProcessDefinition {
  readonly id: string;
  readonly executable: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
}
```

Later:

```text
restartPolicy
healthCheck
startupTimeout
shutdownTimeout
protocol
```

should be added only when there is a concrete need.

## 15. Security model

This is important because the library could eventually be reachable through plugins or game scripts.

The library itself should never assume that arbitrary game input is safe to turn into a command.

Rules:

### No shell by default

Never implicitly construct:

```text
sh -c <user input>
```

### Registered definitions

Prefer:

```text
process definition:
    world-generator
```

over:

```text
run arbitrary executable
```

### Capability-controlled access

A plugin should receive permission to use a specific process capability.

Conceptually:

```text
Plugin
   │
   ▼
Process Capability
   │
   └── world-generator
```

rather than:

```text
Plugin
   │
   └── spawn("/anything")
```

### Bounded resources

Eventually support:

- maximum concurrent executions
- timeout
- output limits
- queue limits
- restart limits
- memory/CPU policy where practical

## 16. Shutdown behavior

`@stratamu/processes` needs a clean integration with the server's existing graceful shutdown.

Shutdown sequence:

```text
Server shutdown
      │
      ▼
stop accepting work
      │
      ▼
stop new worker jobs
      │
      ▼
cancel queued jobs
      │
      ▼
finish/cancel active worker jobs
      │
      ▼
gracefully stop managed child processes
      │
      ▼
escalate if necessary
      │
      ▼
engine shutdown complete
```

The library should expose a single:

```ts
await processes.shutdown(...)
```

operation.

It should be safe to call shutdown more than once.

## 17. Observability

The package should integrate with the existing StrataMU logging/event infrastructure rather than inventing another logging system.

Useful events include:

```text
worker.started
worker.completed
worker.failed
worker.timedOut
worker.cancelled

process.started
process.exited
process.failed
process.stopped
process.killed
process.protocolError
```

Every event should carry the execution/process ID.

This will make debugging background work much easier.

## 18. Testing strategy

Testing is a major part of this package.

### Worker tests

Test:

- simple successful job
- multiple queued jobs
- concurrent jobs
- worker reuse
- worker crash
- worker replacement
- cancellation
- timeout
- queue saturation
- shutdown with queued jobs
- shutdown with running jobs

### Process tests

Test:

- successful executable
- startup failure
- non-zero exit
- signal termination
- timeout
- cancellation
- stdout
- stderr
- protocol errors
- unexpected child termination
- graceful shutdown
- forced shutdown
- repeated shutdown
- multiple managed processes

### Cross-language integration test

Eventually add a tiny test executable.

Prefer something deterministic and easy to build.

For example:

```text
test-fixtures/
  process-echo/
```

A tiny Node process is sufficient for the first tests.

Later, add a Rust fixture once cross-language integration becomes part of the package's supported contract.

## 19. Initial real-world use cases

Do not integrate the package everywhere immediately.

Use one representative example from each execution model.

### Worker example

Create a test or development implementation of:

```text
WorldQuery
```

or:

```text
Pathfinding
```

to validate:

- task submission
- queueing
- worker lifecycle
- structured results
- cancellation

### Child-process example

Create a small utility process:

```text
tools/process-fixture
```

that supports:

```text
request → response
```

This validates:

- process startup
- stdin/stdout protocol
- exit handling
- graceful shutdown
- cross-process messaging

Only after those work should the server or a game plugin consume them.

## 20. Integration into StrataMU2

After the library is stable:

```text
apps/server
    │
    └── constructs ProcessServices
```

The runtime/application layer owns the actual implementation.

Then expose capabilities to components that need them:

```text
Server
   │
   ├── Engine
   ├── Adapter
   ├── Plugins
   │
   └── Process capability
```

The core engine should not acquire a global singleton.

Prefer dependency injection or an explicit runtime/service context.

## 21. Future possibilities

Once the base package is working, several higher-level systems become possible.

### Computational services

```text
PathfindingService
WorldSearchService
GenerationService
TextAnalysisService
```

These can internally select:

```text
worker thread
```

or:

```text
child process
```

without the game-facing API necessarily changing.

### Native acceleration

A particularly expensive operation could eventually move from:

```text
TypeScript Worker
```

to:

```text
Rust child process
```

or later:

```text
Rust N-API native module
```

without changing the conceptual service exposed to the game.

### External language ecosystem

A StrataMU2 utility could eventually be implemented in:

```text
Rust
Go
C
C++
Python
Zig
```

and remain usable through the same managed-process infrastructure.

## 22. Implementation order

Do not implement every feature this document describes before using the library. Build and test
the two mechanisms (worker pool, child-process manager) separately, then validate each against one
representative real use case before adding the next piece. Child-process management comes before
the worker pool, deliberately out of this document's own §6-§9/§10-§14 presentation order: the
existing `dev-server.ts` runner (§4's "Relationship to `apps/server/src/dev-server.ts`") already
paid for a working set of child-process lifecycle requirements firsthand, and is the more useful
thing to generalize from first.

### Phase 0 — Finish the existing runner's own edge cases

Not part of this package, but a prerequisite for using it as a reliable source of lifecycle
lessons: fix `dev-server.ts`'s startup-placeholder and PID-file-cleanup ownership races, and make
`restart()` respect a failed `kill()` rather than proceeding into a `start()` that will predictably
fail. Tracked in [Development Server](./DEVELOPMENT_SERVER.md), not here.

### Phase 1 — Package skeleton

Create `libs/processes` (§4's structure) with package metadata, exports, documentation, and tests,
using this repository's existing conventions (`@stratamu/typescript-config`, `@stratamu/eslint`,
the same `tsconfig.json`/`tsconfig.build.json` split and `vitest` setup every other package uses).

Deliverable: `@stratamu/processes` builds and tests cleanly, with nothing in it yet.

### Phase 2 — Child-process management

Implement `children/child-process-manager.ts`, `managed-process.ts`, `process-definition.ts`:
process definitions, `spawn` (no shell by default, §15), managed process state, stdout/stderr
handling, exit/error handling (including the `"error"` event gap `dev-server.ts`'s own review
caught), graceful shutdown with forced-termination escalation, and timeouts.

Deliverable: a reliable external-process manager, tested against real child processes the same way
`apps/server/test/dev-server.test.ts` already does.

### Phase 3 — Worker pool

Implement `workers/worker-pool.ts`, `worker-task.ts`, `worker-runtime.ts`: bounded concurrency, a
bounded FIFO queue, task dispatch to registered task modules (§7 — no serializing arbitrary
closures), worker failure detection and replacement, cancellation via `AbortSignal`, timeouts, and
graceful shutdown.

Deliverable: a production-quality CPU job pool.

### Phase 4 — Cross-language fixture

Add a tiny, deterministic test executable (a Node script is enough to start) speaking the first
documented protocol (§12, JSON Lines over stdio). A Rust or Go utility can follow once the process
contract is stable — do not build the Rust fixture before the contract it would exercise is settled.

Deliverable: a request/response round trip against a real child process, documented well enough
that an external-language utility could implement the other side from the doc alone.

### Phase 5 — Server shutdown integration

Construct the process services in `apps/server` and integrate them into its existing graceful
shutdown (`shutdown.ts`): reject new worker/child-process work once shutdown has begun, and ensure
managed child processes are stopped within the server's own overall shutdown deadline rather than
on an independent timeout that could outlive it. Do not yet expose unrestricted access to plugins.

Deliverable: the server owns one process-services instance, and shutting it down shuts these down
too, within the same bounded time.

### Phase 6 — First real workload

Choose exactly one: a read-only world query or pathfinding operation is a good first worker use
case, because it exercises CPU-bound worker execution while keeping world *mutation* on the main
runtime (§9, §23) -- the result comes back and the authoritative runtime decides what to do with it,
nothing in the worker ever touches live game state directly.

Deliverable: a real engine feature uses the worker pool without coupling world mutation to the
worker. A first external-language utility (§21's "External language ecosystem") stays a later,
separate step once this workload and the child-process contract have both proven themselves.

## 23. Final architectural rule

The most important rule for the package should be:

> **Workers and child processes may compute, transform, communicate, and perform isolated work; the authoritative game runtime owns game-state mutation.**

That gives StrataMU2 a very useful division:

```text
                    STRATAMU2
                        │
              Authoritative Runtime
                        │
             ┌──────────┴──────────┐
             │                     │
       Worker Threads        Child Processes
             │                     │
       CPU-bound JS/TS       External Programs
             │                     │
       pathfinding           Rust / Go / C
       world queries         Python / etc.
       generation            integrations
       simulations           services
```

The first implementation should stay small. The objective is not to build a general-purpose distributed-computing framework; it is to establish a reliable execution boundary that StrataMU2 can grow around.
