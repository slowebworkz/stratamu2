import { Base } from "@stratamu/base"
import type { Clock } from "@stratamu/clock"
import type { EngineState } from "@stratamu/engine-world"
import type { TaskId } from "@stratamu/primitives"
import { taskId, taskPriority } from "@stratamu/primitives"
import type { Task } from "@stratamu/task"
import type { WorkKind } from "@stratamu/work"

import type { ClockId } from "../clock/index.ts"
import { GLOBAL_LANE, Lane } from "../lane/index.ts"
import type { ExecutionPolicy, ReadyLane } from "../policy/index.ts"
import { oldestReady } from "../policy/index.ts"
import type { Schedule } from "../schedule/index.ts"
import { schedule } from "../schedule/index.ts"
import type {
  TaskAdmission,
  TaskHandle,
  TaskHandler,
  TaskOutcome,
  TaskReschedule,
  TaskSuspend,
} from "../task/index.ts"
import { isTaskReschedule, isTaskSuspend, TaskSequencer } from "../task/index.ts"
import { Timeline } from "../timeline/index.ts"
import type { TaskRecord } from "./record.ts"
import type { RuntimeOptions } from "./types.ts"

/**
 * What the runtime needs from a clock reading: a whole number in the clock's own units. Both an
 * `Instant` and a `Timestamp` provide it, so the runtime does not depend on either.
 */
type Reading = { readonly value: bigint }

/** A resolved `Schedule`: a clock, the timeline it names, and the safe-integer time it is due. */
type Due = {
  readonly clock: ClockId
  readonly timeline: Timeline<TaskRecord>
  readonly dueAt: number
}

/**
 * The execution substrate: the task registry, clocks, timelines, queues, task lifecycle and the
 * mechanics of running a task. It provides mechanisms and imposes no execution semantics of its
 * own. Which ready task runs next, and whether a task may run another inline, are decisions of
 * the `ExecutionPolicy` it is given.
 *
 * Admitting a task follows `@stratamu/submission -> @stratamu/task`: a `Submission` (carried on a
 * `TaskAdmission`) is admitted into a `Task`, which is then wrapped in a `TaskRecord` and given to
 * its `Schedule`, which decides whether it starts `ready` or `pending`.
 *
 * What the runtime does record are facts: the batch in which a task became ready and, for a task
 * that waited on a clock, when it was due. It does not order tasks from different clocks, because
 * the units of different clocks cannot be compared.
 *
 * A step is one task chosen by the policy, plus everything it runs inline with `context.run`.
 * Only one step runs at a time, so nothing else runs until its handler returns.
 *
 * The runtime is deterministic in the sense of docs/DETERMINISM.md: its part of that contract is
 * that the same submissions, cancellations, clock readings and policy give the same steps in the
 * same order. It never reads wall time or randomness and numbers tasks with counters.
 */
export class Runtime extends Base {
  readonly #policy: ExecutionPolicy
  readonly #engineState: EngineState | undefined
  readonly #handlers = new Map<WorkKind, TaskHandler>()
  readonly #clocks = new Map<ClockId, Clock<Reading>>()
  readonly #lastReading = new Map<ClockId, number>()
  readonly #timelines = new Map<ClockId, Timeline<TaskRecord>>()
  readonly #lanes = new Map<string, Lane<TaskRecord>>()
  readonly #live = new Map<TaskId, TaskRecord>()
  /** What the policy sees. Iterable more than once, unlike an iterator. */
  readonly #readyLanes: Iterable<ReadyLane> = {
    [Symbol.iterator]: () => this.#lanes.values(),
  }

  readonly #sequencer = new TaskSequencer()
  #nextBatch = 1
  #stepping = false

  constructor(options: RuntimeOptions = {}) {
    super()
    this.#policy = options.policy ?? oldestReady()
    this.#engineState = options.engineState
  }

  /** The number of tasks that have not finished, including the one running. */
  get pending(): number {
    return this.#live.size
  }

  /** Registers the one handler that executes tasks of `kind`. */
  handle(kind: WorkKind, handler: TaskHandler): void {
    if (this.#handlers.has(kind)) {
      throw this.errors.create(`A handler is already registered for task kind "${kind}"`)
    }
    this.#handlers.set(kind, handler)
  }

  /** Attaches a clock that schedules can refer to by `id`. */
  attachClock(id: ClockId, clock: Clock<Reading>): void {
    if (this.#clocks.has(id)) {
      throw this.errors.create(`Clock "${id}" is already attached`)
    }
    this.#clocks.set(id, clock)
    this.#timelines.set(id, new Timeline())
  }

  now(id: ClockId): number {
    return this.#read(id)
  }

  /**
   * Makes the tasks that have come due ready. Everything released by one call becomes ready in
   * the same batch, so nothing orders tasks released from different clocks.
   *
   * The runtime notices time passing whenever it is entered: on `submit`, `release` and `step`.
   */
  release(): void {
    let batch: number | undefined
    for (const id of this.#clocks.keys()) {
      const time = this.#read(id)
      const timeline = this.#timelines.get(id) as Timeline<TaskRecord>
      for (let record = timeline.takeDue(time); record; record = timeline.takeDue(time)) {
        batch ??= this.#nextBatch++
        record.execution.timeline = undefined
        this.#ready(record, batch)
      }
    }
  }

  /**
   * Submits a task for deferred execution: it becomes ready when `when` says so.
   *
   * `admission`'s `Submission` is admitted into a `Task`, wrapped in a `TaskRecord`, and then
   * handed to `when`, which decides whether it starts `ready` or `pending`.
   */
  submit(admission: TaskAdmission, when: Schedule = schedule.now): TaskHandle {
    // Tasks that came due before this call are ready before the new one is queued.
    this.release()
    // Resolve the schedule first so an invalid one consumes no task id.
    const due = this.#resolve(when)
    const task = this.#admit(admission)
    const record = this.#createRecord(task, admission)
    this.#live.set(record.task.id, record)

    if (due === undefined) {
      this.#ready(record, this.#nextBatch++)
    } else {
      this.#defer(record, due, "pending")
    }

    return {
      id: record.task.id,
      get state() {
        return record.state
      },
      settled: record.execution.settled,
      cancel: reason => this.#cancel(record, reason),
    }
  }

  /**
   * Wakes a waiting task, which becomes ready and runs again with the continuation it suspended
   * with. What a task waits for, and who wakes it, is the adapter's business: the runtime only
   * knows that it is waiting. Tasks woken by successive calls run in the order they were woken.
   */
  wake(id: TaskId): void {
    const record = this.#live.get(id)
    if (record === undefined) {
      throw this.errors.create(`Cannot wake task ${id}: it is unknown or has finished`)
    }
    if (record.state !== "waiting") {
      throw this.errors.create(`Cannot wake task ${id} while it is ${record.state}`)
    }

    // It is ready because it was woken, not because a clock reached a time.
    record.via = undefined
    this.#ready(record, this.#nextBatch++)
  }

  /** Cancels every unfinished task in a lane. Returns how many were cancelled. */
  cancelLane(lane: string, reason?: unknown): number {
    return this.#cancelWhere(record => record.lane === lane, reason)
  }

  /** Cancels every unfinished task carrying a tag. Returns how many were cancelled. */
  cancelTag(tag: string, reason?: unknown): number {
    return this.#cancelWhere(record => record.tags.includes(tag), reason)
  }

  /**
   * Executes one unit of work: releases what has come due, asks the policy which ready task runs
   * next, and runs it. Resolves `true` if a step ran, and `false` if nothing is ready or the
   * policy declined to run anything. This is the primitive a server loop is built from, because
   * the caller decides how many steps to take.
   */
  async step(): Promise<boolean> {
    if (this.#stepping) {
      throw this.errors.create("The runtime is already executing a step")
    }

    this.release()
    const record = this.#next()
    if (!record) {
      return false
    }

    this.#stepping = true
    try {
      await this.#execute(record, true)
    } finally {
      this.#stepping = false
    }
    return true
  }

  /**
   * Takes steps until none can be taken, and returns how many ran. It is a convenience for tests
   * and small programs, not a model of a server loop: work that keeps producing work never
   * finishes, so a server takes bounded steps and lets its policy set boundaries.
   */
  async drain(): Promise<number> {
    let steps = 0
    while (await this.step()) {
      steps++
    }
    return steps
  }

  /**
   * Takes up to `maxSteps` steps, stopping early once none can be taken, and returns how many
   * ran. Unlike `drain`, this always returns, even if a handler keeps producing more ready work:
   * it is `drain`'s bounded sibling, for a caller -- a transport driving the runtime after one
   * piece of input, say -- that needs a guarantee `drain` does not make. Nothing is lost by
   * stopping early: a task the bound left ready stays ready, for a later call to pick up, the
   * same as when the policy itself declines to run anything (see `step`).
   */
  async pump(maxSteps: number): Promise<number> {
    let steps = 0
    while (steps < maxSteps && (await this.step())) {
      steps++
    }
    return steps
  }

  /**
   * Reads a clock as a safe integer. A clock is trusted to move forward only, so a reading that
   * goes backwards is an error: a task scheduled on it would quietly be delayed. A wall clock can
   * do this when the system time is adjusted, which is why it is not for scheduling.
   */
  #read(id: ClockId): number {
    const clock = this.#clocks.get(id)
    if (!clock) {
      throw this.errors.create(`Unknown clock "${id}"`)
    }

    const value = clock.now().value
    const time = Number(value)
    if (!Number.isSafeInteger(time)) {
      throw new RangeError(`Clock "${id}" read ${value}, which is outside the safe integer range`)
    }

    const last = this.#lastReading.get(id)
    if (last !== undefined && time < last) {
      throw this.errors.create(`Clock "${id}" moved backwards, from ${last} to ${time}`)
    }
    this.#lastReading.set(id, time)
    return time
  }

  #resolve(when: Schedule): Due | undefined {
    if (when.kind === "now") {
      return undefined
    }

    const now = this.now(when.clock)
    const dueAt = when.kind === "after" ? now + when.delay : when.time
    if (!Number.isFinite(dueAt) || (when.kind === "after" && when.delay < 0)) {
      throw new RangeError(`Invalid schedule time for clock "${when.clock}"`)
    }

    // Due already: the task is ready now rather than waiting for the clock to move.
    if (dueAt <= now) {
      return undefined
    }
    return {
      clock: when.clock,
      timeline: this.#timelines.get(when.clock) as Timeline<TaskRecord>,
      dueAt,
    }
  }

  /**
   * Puts a record into the timeline a resolved `Schedule` names, as either `pending` (admission)
   * or `scheduled` (a running task rescheduling itself): the same temporal wait, reached from two
   * different points in a task's life. `release` picks either kind up identically once due.
   */
  #defer(record: TaskRecord, due: Due, state: "pending" | "scheduled"): void {
    record.state = state
    record.via = { clock: due.clock, dueAt: due.dueAt }
    record.execution.timeline = due.timeline
    due.timeline.insert(record, due.dueAt)
  }

  /**
   * Admits a `Submission` into a `Task`: the engine assigns it an identity, its place in creation
   * order, and a priority (the lowest, if none was given; the engine always decides one).
   */
  #admit(admission: TaskAdmission): Task {
    const sequence = this.#sequencer.allocate()
    return {
      id: taskId(`task-${sequence}`),
      work: admission.work,
      sequence,
      priority: admission.priority ?? taskPriority(0),
    }
  }

  #createRecord(
    task: Task,
    admission: TaskAdmission,
    inherited?: { signal: AbortSignal; depth: number },
  ): TaskRecord {
    const controller = inherited === undefined ? new AbortController() : undefined
    let settle: (outcome: TaskOutcome) => void = () => {}
    const settled = new Promise<TaskOutcome>(resolve => {
      settle = resolve
    })

    return {
      task,
      lane: admission.lane ?? GLOBAL_LANE,
      tags: [...(admission.tags ?? [])],
      state: "ready",
      batch: 0,
      via: undefined,
      continuation: undefined,
      execution: {
        controller,
        signal: inherited?.signal ?? (controller as AbortController).signal,
        settled,
        settle,
        depth: inherited?.depth ?? 0,
        timeline: undefined,
      },
    }
  }

  #ready(record: TaskRecord, batch: number): void {
    record.state = "ready"
    record.batch = batch

    let lane = this.#lanes.get(record.lane)
    if (!lane) {
      lane = new Lane(record.lane)
      this.#lanes.set(record.lane, lane)
    }
    lane.enqueue(record)
  }

  /** Removes and returns the ready task the policy chose. */
  #next(): TaskRecord | undefined {
    if (this.#lanes.size === 0) {
      return undefined
    }

    const id = this.#policy.next(this.#readyLanes)
    if (id === undefined) {
      return undefined
    }

    const record = this.#live.get(id)
    if (record?.state !== "ready") {
      throw this.errors.create(`The execution policy chose task ${id}, which is not ready`)
    }
    this.#lanes.get(record.lane)?.remove(record)
    this.#retireIfEmpty(record.lane)
    return record
  }

  #retireIfEmpty(laneId: string): void {
    if (this.#lanes.get(laneId)?.size === 0) {
      this.#lanes.delete(laneId)
    }
  }

  async #runInline(parent: TaskRecord, admission: TaskAdmission): Promise<TaskOutcome> {
    const depth = parent.execution.depth + 1
    if (this.#policy.allowInline?.({ parent: parent.task, admission, depth }) === false) {
      throw this.errors.create(
        `The execution policy does not allow running "${admission.work.kind}" inline`,
      )
    }

    const task = this.#admit(admission)
    const inline = this.#createRecord(task, admission, {
      signal: parent.execution.signal,
      depth,
    })
    return this.#execute(inline, false)
  }

  /**
   * Runs one step of a task. Resolves with its outcome, or with `undefined` if it suspended or
   * rescheduled itself, either of which only a task run by the scheduler may do.
   */
  async #execute(record: TaskRecord, canDefer: false): Promise<TaskOutcome>
  async #execute(record: TaskRecord, canDefer: true): Promise<TaskOutcome | undefined>
  async #execute(record: TaskRecord, canDefer: boolean): Promise<TaskOutcome | undefined> {
    record.state = "running"
    // Its ready ordering no longer applies once it is running, and a task that goes on to
    // suspend or reschedule must reach that state with no stale via or batch either.
    record.via = undefined
    record.batch = 0
    const continuation = record.continuation

    let outcome: TaskOutcome | undefined
    let suspended: TaskSuspend | undefined
    let rescheduled: TaskReschedule | undefined
    let due: Due | undefined
    try {
      const handler = this.#handlers.get(record.task.work.kind)
      if (!handler) {
        throw this.errors.create(
          `No handler is registered for task kind "${record.task.work.kind}"`,
        )
      }
      const result = await handler(record.task, {
        signal: record.execution.signal,
        continuation,
        world: this.#engineState?.world,
        sessions: this.#engineState?.sessions,
        run: admission => this.#runInline(record, admission),
      })
      if (isTaskSuspend(result)) {
        if (!canDefer) {
          throw this.errors.create("A task run inline cannot suspend")
        }
        suspended = result
      } else if (isTaskReschedule(result)) {
        if (!canDefer) {
          throw this.errors.create("A task run inline cannot reschedule")
        }
        // Resolved inside the same error boundary as the handler itself: an invalid
        // reschedule (a bad delay, an unknown clock) is this task's failure, not an
        // unhandled crash of the runtime.
        due = this.#resolve(result.schedule)
        rescheduled = result
      } else {
        outcome = { state: "completed" }
      }
    } catch (error) {
      outcome = { state: "failed", error }
      // A handler that stops because it was cancelled is not a failure.
      if (!record.execution.signal.aborted) {
        this.log.error({ err: error, task: record.task.work.kind }, "Task failed")
      }
    }

    if (record.execution.signal.aborted) {
      outcome = { state: "cancelled", reason: record.execution.signal.reason }
    }

    if (outcome === undefined) {
      if (rescheduled !== undefined) {
        record.continuation = rescheduled.continuation
        if (due === undefined) {
          this.#ready(record, this.#nextBatch++)
        } else {
          this.#defer(record, due, "scheduled")
        }
        return undefined
      }
      record.continuation = suspended?.continuation
      record.state = "waiting"
      return undefined
    }

    this.#finish(record, outcome)
    return outcome
  }

  #finish(record: TaskRecord, outcome: TaskOutcome): void {
    record.state = outcome.state
    record.via = undefined
    record.batch = 0
    this.#live.delete(record.task.id)
    record.execution.settle(outcome)
  }

  #cancel(record: TaskRecord, reason?: unknown): boolean {
    const cause = reason ?? AbortSignal.abort().reason
    const { execution } = record

    switch (record.state) {
      case "pending":
      case "scheduled":
        execution.timeline?.remove(record)
        execution.timeline = undefined
        record.via = undefined
        break
      case "ready":
        this.#lanes.get(record.lane)?.remove(record)
        this.#retireIfEmpty(record.lane)
        break
      case "waiting":
        // Nothing holds a waiting task, so there is nothing to remove it from.
        break
      case "running":
        if (execution.controller === undefined || execution.signal.aborted) {
          return false
        }
        // The step finishes on its own and then ends as cancelled.
        execution.controller.abort(cause)
        return true
      default:
        return false
    }

    this.#finish(record, { state: "cancelled", reason: cause })
    return true
  }

  #cancelWhere(matches: (record: TaskRecord) => boolean, reason: unknown): number {
    let cancelled = 0
    for (const record of [...this.#live.values()]) {
      if (matches(record) && this.#cancel(record, reason)) {
        cancelled++
      }
    }
    return cancelled
  }
}
