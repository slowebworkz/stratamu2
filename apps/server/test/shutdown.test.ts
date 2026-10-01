import type { LineServer } from "@stratamu/plugin-telnet"
import type { Mock } from "vitest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { RuntimeDriver } from "../src/runtime-driver.ts"
import { createShutdown, type ShutdownLog } from "../src/shutdown.ts"
import { fakeConnection } from "./fixtures/fake-connection.ts"

function fakeServer(): LineServer & { resolveStopAccepting(): void } {
  let resolve: (() => void) | undefined
  const stopped = new Promise<void>(res => {
    resolve = () => res()
  })
  return {
    listen: () => Promise.reject(new Error("not used")),
    close: () => Promise.reject(new Error("not used")),
    stopAccepting: vi.fn(() => stopped),
    resolveStopAccepting: () => resolve?.(),
  }
}

function fakeDriver(stopImpl?: () => Promise<void>): RuntimeDriver {
  return {
    start: vi.fn(),
    stop: vi.fn(stopImpl ?? (() => Promise.resolve())),
  }
}

describe("createShutdown", () => {
  let quietLog: ShutdownLog & { log: Mock; warn: Mock }

  beforeEach(() => {
    quietLog = { log: vi.fn(), warn: vi.fn() }
  })

  it("stops accepting before stopping the driver, and stops the driver before closing connections", async () => {
    const calls: string[] = []
    const server = fakeServer()
    server.stopAccepting = vi.fn(() => {
      calls.push("stopAccepting")
      return Promise.resolve()
    })
    const driver = fakeDriver(async () => {
      calls.push("driver.stop")
    })
    const connection = fakeConnection()
    connection.close = () => {
      calls.push("connection.close")
    }

    const shutdown = createShutdown({
      server,
      driver,
      connections: new Set([connection]),
      log: quietLog,
    })
    await shutdown()

    expect(calls).toEqual(["stopAccepting", "driver.stop", "connection.close"])
  })

  it("writes a notice to each connection before closing it", async () => {
    const server = fakeServer()
    server.resolveStopAccepting()
    const connection = fakeConnection()
    const order: string[] = []
    const originalClose = connection.close
    connection.close = () => {
      order.push("close")
      originalClose()
    }
    const originalWrite = connection.write
    connection.write = text => {
      order.push("write")
      originalWrite(text)
    }

    const shutdown = createShutdown({
      server,
      driver: fakeDriver(),
      connections: new Set([connection]),
      log: quietLog,
    })
    await shutdown()

    expect(order).toEqual(["write", "close"])
    expect(connection.output).toHaveLength(1)
    expect(connection.closeCalls).toBe(1)
  })

  it("only runs once even if called more than once", async () => {
    const server = fakeServer()
    server.resolveStopAccepting()
    const shutdown = createShutdown({
      server,
      driver: fakeDriver(),
      connections: new Set(),
      log: quietLog,
    })

    await Promise.all([shutdown(), shutdown()])
    expect(server.stopAccepting).toHaveBeenCalledTimes(1)
  })

  describe("with fake timers", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("times out and warns instead of hanging when a connection never closes", async () => {
      const server = fakeServer() // never resolves stopAccepting -- simulates a stuck connection
      const shutdown = createShutdown({
        server,
        driver: fakeDriver(),
        connections: new Set([fakeConnection()]),
        drainTimeoutMs: 1000,
        log: quietLog,
      })

      const done = shutdown()
      await vi.advanceTimersByTimeAsync(1000)
      await done

      expect(quietLog.warn).toHaveBeenCalledWith(
        expect.stringContaining("Shutdown timed out after 1000ms"),
      )
    })

    it("does not warn when every connection closes before the timeout", async () => {
      const server = fakeServer()
      server.resolveStopAccepting()
      const shutdown = createShutdown({
        server,
        driver: fakeDriver(),
        connections: new Set([fakeConnection()]),
        drainTimeoutMs: 1000,
        log: quietLog,
      })

      const done = shutdown()
      await vi.advanceTimersByTimeAsync(1000)
      await done

      expect(quietLog.warn).not.toHaveBeenCalled()
    })
  })
})
