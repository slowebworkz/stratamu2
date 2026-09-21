import { getEventListeners } from "node:events"

import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest"

import type { LoggingCapability } from "../logging/types.ts"
import { EmitteryEvents } from "./emittery-events.ts"
import type { EventCapability, EventPayload } from "./types.ts"

type Events = {
  greet: string
  count: number
  ping: undefined
}

type WorldEvents = {
  moved: { id: string }
  started: undefined
}

interface InterfaceEvents {
  moved: { id: string }
}

interface LogRecord {
  level: number
  msg?: string
  component?: string
  [key: string]: unknown
}

async function loadFresh() {
  vi.resetModules()

  const records: LogRecord[] = []
  const destination = {
    write(chunk: string) {
      records.push(JSON.parse(chunk) as LogRecord)
    },
  }

  const { PinoLogger } = await import("../logging/pino-logger.ts")
  const createReal = PinoLogger.create.bind(PinoLogger)
  const create = vi
    .spyOn(PinoLogger, "create")
    .mockImplementation(() => createReal({ level: "trace" }, destination))

  const { EmitteryEvents } = await import("./emittery-events.ts")

  class Named extends EmitteryEvents<Events> {
    get exposed(): LoggingCapability {
      return this.log
    }
  }

  class OtherNamed extends EmitteryEvents<Events> {
    get exposed(): LoggingCapability {
      return this.log
    }
  }

  return { EmitteryEvents, create, records, Named, OtherNamed }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("EventPayload", () => {
  it("resolves to the payload type of each event", () => {
    expectTypeOf<EventPayload<Events, "greet">>().toEqualTypeOf<string>()
    expectTypeOf<EventPayload<Events, "count">>().toEqualTypeOf<number>()
    expectTypeOf<EventPayload<Events, "ping">>().toEqualTypeOf<undefined>()
  })

  it("resolves object and dataless payloads", () => {
    expectTypeOf<EventPayload<WorldEvents, "moved">>().toEqualTypeOf<{ id: string }>()
    expectTypeOf<EventPayload<WorldEvents, "started">>().toEqualTypeOf<undefined>()
  })

  it("requires the event map to be a type alias: an interface does not satisfy EventMap", () => {
    // @ts-expect-error an interface has no index signature, so it does not satisfy EventMap
    const rejected: EventCapability<InterfaceEvents> | undefined = undefined

    expect(rejected).toBeUndefined()
  })

  it("rejects an event name that the map does not declare", () => {
    // @ts-expect-error "nope" is not an event of Events
    expectTypeOf<EventPayload<Events, "nope">>().toBeNever()
  })
})

describe("EmitteryEvents", () => {
  it("delivers object payloads and dataless events", async () => {
    const events: EventCapability<WorldEvents> = new EmitteryEvents<WorldEvents>()
    const listener = vi.fn()

    events.on("moved", listener)
    await events.emit("moved", { id: "room-1" })
    await events.emit("started")

    expect(listener).toHaveBeenCalledExactlyOnceWith({ id: "room-1" })
  })

  it("delivers asynchronously: listeners have not run when emit() returns", async () => {
    const events = new EmitteryEvents<Events>()
    const listener = vi.fn()

    events.on("greet", listener)
    const pending = events.emit("greet", "later")

    expect(listener).not.toHaveBeenCalled()
    await pending
    expect(listener).toHaveBeenCalledExactlyOnceWith("later")
  })

  it("delivers the emitted data to a listener", async () => {
    const events = new EmitteryEvents<Events>()
    const listener = vi.fn()

    events.on("greet", listener)
    await events.emit("greet", "world")

    expect(listener).toHaveBeenCalledExactlyOnceWith("world")
  })

  it("emits an event that carries no data without an argument", async () => {
    const events = new EmitteryEvents<Events>()
    const listener = vi.fn()

    events.on("ping", listener)
    await events.emit("ping")

    expect(listener).toHaveBeenCalledExactlyOnceWith(undefined)
  })

  it("resolves once() with the data of the first matching event", async () => {
    const events = new EmitteryEvents<Events>()

    const next = events.once("count", { predicate: value => value > 1 })
    await events.emit("count", 1)
    await events.emit("count", 2)

    await expect(next).resolves.toBe(2)
  })

  it("stops delivering after off()", async () => {
    const events = new EmitteryEvents<Events>()
    const listener = vi.fn()

    events.on("greet", listener)
    events.off("greet", listener)
    await events.emit("greet", "ignored")

    expect(listener).not.toHaveBeenCalled()
  })

  it("stops delivering after the returned unsubscribe function is called", async () => {
    const events = new EmitteryEvents<Events>()
    const listener = vi.fn()

    const unsubscribe = events.on("greet", listener)
    unsubscribe()
    await events.emit("greet", "ignored")

    expect(listener).not.toHaveBeenCalled()
  })

  it("registers the same listener only once", async () => {
    const events = new EmitteryEvents<Events>()
    const listener = vi.fn()

    events.on("greet", listener)
    events.on("greet", listener)
    await events.emit("greet", "once")

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("keeps a listener removable after an earlier unsubscribe is called twice", async () => {
    const events = new EmitteryEvents<Events>()
    const first = vi.fn()
    const second = vi.fn()

    const unsubscribeFirst = events.on("count", first)
    unsubscribeFirst()
    events.on("count", second)
    unsubscribeFirst()
    events.off("count", second)
    await events.emit("count", 1)

    expect(second).not.toHaveBeenCalled()
  })

  it("rejects emit() when a listener throws, but still runs the other listeners", async () => {
    const events = new EmitteryEvents<Events>()
    const survivor = vi.fn()

    events.on("greet", () => {
      throw new Error("boom")
    })
    events.on("greet", survivor)

    await expect(events.emit("greet", "hello")).rejects.toThrow("One or more listeners threw")
    expect(survivor).toHaveBeenCalledExactlyOnceWith("hello")
  })
})

describe("EmitteryEvents abort signals", () => {
  it("stops delivering after the signal aborts", async () => {
    const events = new EmitteryEvents<Events>()
    const listener = vi.fn()
    const controller = new AbortController()

    events.on("greet", listener, { signal: controller.signal })
    controller.abort()
    await events.emit("greet", "ignored")

    expect(listener).not.toHaveBeenCalled()
  })

  it("lets the same listener be registered again after an abort", async () => {
    const events = new EmitteryEvents<Events>()
    const listener = vi.fn()
    const controller = new AbortController()

    events.on("greet", listener, { signal: controller.signal })
    controller.abort()
    events.on("greet", listener)
    await events.emit("greet", "again")

    expect(listener).toHaveBeenCalledExactlyOnceWith("again")
  })

  it("does not register a listener whose signal is already aborted", async () => {
    const events = new EmitteryEvents<Events>()
    const listener = vi.fn()

    const unsubscribe = events.on("greet", listener, { signal: AbortSignal.abort() })
    await events.emit("greet", "ignored")

    expect(listener).not.toHaveBeenCalled()
    expect(() => unsubscribe()).not.toThrow()
  })

  it("keeps a later registration alive when an earlier unsubscribe runs after the abort", async () => {
    const events = new EmitteryEvents<Events>()
    const listener = vi.fn()
    const controller = new AbortController()

    const unsubscribeFirst = events.on("greet", listener, { signal: controller.signal })
    controller.abort()
    events.on("greet", listener)
    unsubscribeFirst()
    await events.emit("greet", "still here")

    expect(listener).toHaveBeenCalledExactlyOnceWith("still here")
  })

  it("treats one listener as one subscription, so an abort also removes a registration made without a signal", async () => {
    const events = new EmitteryEvents<Events>()
    const listener = vi.fn()
    const controller = new AbortController()

    events.on("greet", listener, { signal: controller.signal })
    events.on("greet", listener)
    controller.abort()
    await events.emit("greet", "ignored")

    expect(listener).not.toHaveBeenCalled()
  })

  it("leaves no abort listener on the signal after unsubscribing or aborting", () => {
    const events = new EmitteryEvents<Events>()
    const unsubscribed = new AbortController()
    const aborted = new AbortController()

    events.on("greet", () => {}, { signal: unsubscribed.signal })()
    events.on("greet", () => {}, { signal: aborted.signal })
    aborted.abort()

    expect(getEventListeners(unsubscribed.signal, "abort")).toHaveLength(0)
    expect(getEventListeners(aborted.signal, "abort")).toHaveLength(0)
  })
})

async function rejectionOf(promise: Promise<unknown>): Promise<DOMException> {
  try {
    await promise
  } catch (error) {
    return error as DOMException
  }

  throw new Error("expected the promise to reject")
}

// Cancelling through a signal is Emittery's own behavior. Rejecting on off() is the adapter's.
describe("EmitteryEvents once() lifecycle", () => {
  it("rejects with an AbortError when the signal is already aborted, and off() stays callable", async () => {
    const events = new EmitteryEvents<Events>()

    const result = events.once("greet", { signal: AbortSignal.abort() })

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
    expect(() => result.off()).not.toThrow()
  })

  it("rejects with the signal's own reason when the signal is already aborted", async () => {
    const controller = new AbortController()
    const reason = new Error("cancelled")
    controller.abort(reason)

    const events = new EmitteryEvents<Events>()
    const next = events.once("count", { signal: controller.signal })

    await expect(next).rejects.toBe(reason)
  })

  it("rejects with an AbortError when the signal aborts before the event arrives", async () => {
    const events = new EmitteryEvents<Events>()
    const controller = new AbortController()

    const result = events.once("greet", { signal: controller.signal })
    controller.abort()

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
  })

  it("rejects with an AbortError after off(), even when the event is emitted later", async () => {
    const events = new EmitteryEvents<Events>()

    const result = events.once("greet")
    result.off()
    await events.emit("greet", "late")

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
  })

  it("rejects with a DOMException when off() is called", async () => {
    const events = new EmitteryEvents<Events>()
    const next = events.once("count")

    next.off()

    await expect(next).rejects.toBeInstanceOf(DOMException)
  })

  it("leaves no abort listener on the signal after off(), after resolving, or after an abort", async () => {
    const events = new EmitteryEvents<Events>()
    const cancelled = new AbortController()
    const resolved = new AbortController()
    const aborted = new AbortController()

    const viaOff = events.once("count", { signal: cancelled.signal })
    viaOff.off()
    const viaEvent = events.once("greet", { signal: resolved.signal })
    await events.emit("greet", "arrived")
    const viaAbort = events.once("ping", { signal: aborted.signal })
    aborted.abort()

    await Promise.allSettled([viaOff, viaEvent, viaAbort])

    expect(getEventListeners(cancelled.signal, "abort")).toHaveLength(0)
    expect(getEventListeners(resolved.signal, "abort")).toHaveLength(0)
    expect(getEventListeners(aborted.signal, "abort")).toHaveLength(0)
  })

  it("keeps the resolved value when off() is called after the event arrived", async () => {
    const events = new EmitteryEvents<Events>()

    const result = events.once("greet")
    await events.emit("greet", "hello")
    result.off()
    result.off()

    await expect(result).resolves.toBe("hello")
  })

  it("does not report an unhandled rejection when off() is called and the promise is dropped", async () => {
    const events = new EmitteryEvents<Events>()

    events.once("greet").off()
    await new Promise(resolve => setTimeout(resolve, 10))

    await expect(events.emit("greet", "nobody listening")).resolves.toBeUndefined()
  })

  it("rejects with the same error whether it is cancelled with off() or with a signal", async () => {
    const events = new EmitteryEvents<Events>()
    const controller = new AbortController()

    const viaOff = events.once("greet")
    viaOff.off()
    const viaSignal = events.once("greet", { signal: controller.signal })
    controller.abort()

    const [offError, signalError] = await Promise.all([rejectionOf(viaOff), rejectionOf(viaSignal)])

    expect(offError).toBeInstanceOf(DOMException)
    expect(offError).toMatchObject({
      name: signalError.name,
      code: signalError.code,
      message: signalError.message,
    })
  })

  it("rejects with the signal's own reason when it was aborted with one", async () => {
    const events = new EmitteryEvents<Events>()
    const controller = new AbortController()
    const reason = new Error("stop waiting")

    const result = events.once("greet", { signal: controller.signal })
    controller.abort(reason)

    await expect(result).rejects.toBe(reason)
  })

  it("treats a second off() as a no-op and keeps the first rejection", async () => {
    const events = new EmitteryEvents<Events>()

    const result = events.once("greet")
    result.off()
    result.off()

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
  })

  it("keeps the signal's reason when off() is called after the abort", async () => {
    const events = new EmitteryEvents<Events>()
    const controller = new AbortController()
    const reason = new Error("aborted first")

    const result = events.once("greet", { signal: controller.signal })
    controller.abort(reason)
    result.off()

    await expect(result).rejects.toBe(reason)
  })

  it("keeps the AbortError from off() when the signal aborts afterwards", async () => {
    const events = new EmitteryEvents<Events>()
    const controller = new AbortController()

    const result = events.once("greet", { signal: controller.signal })
    result.off()
    controller.abort(new Error("too late"))

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
  })

  it("does not let an emit after cancellation resolve the promise", async () => {
    const events = new EmitteryEvents<Events>()

    const result = events.once("greet")
    result.off()
    await events.emit("greet", "too late")

    await expect(result).rejects.toMatchObject({ name: "AbortError" })
  })
})

describe("EmitteryEvents logging", () => {
  it("creates no logger while the bus is used without touching log", async () => {
    const { EmitteryEvents, create, records } = await loadFresh()
    const events = new EmitteryEvents<Events>()

    events.on("greet", () => {})
    await events.emit("greet", "hello")

    expect(create).not.toHaveBeenCalled()
    expect(records).toEqual([])
  })

  it("creates the root logger on first access and only once across instances", async () => {
    const { create, Named, OtherNamed } = await loadFresh()

    const logs = [new Named().exposed, new Named().exposed, new OtherNamed().exposed]

    expect(logs.every(log => log !== undefined)).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("gives each instance its own child logger, all under the one root", async () => {
    const { create, Named, OtherNamed } = await loadFresh()

    const first = new Named().exposed
    const second = new Named().exposed
    const other = new OtherNamed().exposed

    expect(second).not.toBe(first)
    expect(other).not.toBe(first)
    expect(other).not.toBe(second)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("binds the class name as the component on every record", async () => {
    const { records, Named, OtherNamed } = await loadFresh()

    new Named().exposed.info("from named")
    new OtherNamed().exposed.info("from other")

    expect(records).toMatchObject([
      { component: "Named", msg: "from named" },
      { component: "OtherNamed", msg: "from other" },
    ])
  })

  it("falls back to a readable component for an anonymous subclass", async () => {
    const { EmitteryEvents, records } = await loadFresh()
    const anonymous = new (class extends EmitteryEvents<Events> {
      get exposed(): LoggingCapability {
        return this.log
      }
    })()

    anonymous.exposed.info("from an anonymous class")

    expect(records[0]?.component).toBe("anonymous")
  })

  it("reuses the same child on every access from one instance", async () => {
    const { Named } = await loadFresh()
    const named = new Named()

    expect(named.exposed).toBe(named.exposed)
  })

  it("keeps implementation state private", async () => {
    const { Named } = await loadFresh()
    const named = new Named()

    expect(named.exposed).toBeDefined()

    expect(Reflect.ownKeys(named)).toEqual([])
  })

  it("is protected at compile time", async () => {
    const { EmitteryEvents } = await loadFresh()

    // @ts-expect-error log is protected, so it cannot be read from outside the class
    expect(new EmitteryEvents().log).toBeDefined()
  })
})
