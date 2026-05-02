import { RingBuffer } from "@/data"
import type {
  SafetyEmitterOptions,
  SafetyLogEntry,
  SafetyManagerEventMap,
  SanitizedError,
} from "@/events"
import { DEFAULT_SAFETY_LOG_CAP, normalizeEventKeyForMap } from "@/events"
import { emitDiagnosticWarning } from "@/node"
import type { BaseEventMap, EventKey } from "@repo/types"
import Emittery from "emittery"
import type { JsonValue } from "type-fest"
import { SafetyManagerErrorCounts } from "./index.ts"

export class SafetyManager<
  EventMap extends BaseEventMap,
  SafetyKey extends EventKey<EventMap> = EventKey<EventMap>,
> {
  /* ------------------- Private Storage ------------------- */

  private readonly _errorCounts: SafetyManagerErrorCounts<EventMap, SafetyKey>
  private readonly _safetyLogs = new Map<SafetyKey, RingBuffer<SafetyLogEntry>>()
  private readonly _emitter: Emittery<SafetyManagerEventMap<EventMap>>

  /* ------------------- Private Options ------------------- */

  private readonly _safetyLogCap: NonNullable<SafetyEmitterOptions["safetyLogCap"]>
  private readonly _sanitizeErrors: boolean
  private readonly _perEventCaps?: Partial<Record<SafetyKey, number>>
  private _safetyEnabled: boolean

  /* --------------------- Constructor --------------------- */

  constructor(opts: SafetyEmitterOptions<EventMap> = {}) {
    const {
      safetyLogCap = DEFAULT_SAFETY_LOG_CAP,
      sanitizeErrors = false,
      perEventCap,
      enabled = true,
    } = opts

    this._safetyLogCap = safetyLogCap
    this._sanitizeErrors = !!sanitizeErrors
    this._perEventCaps = perEventCap
    this._safetyEnabled = enabled

    this._errorCounts = new SafetyManagerErrorCounts<EventMap, SafetyKey>()

    this._emitter = new Emittery<SafetyManagerEventMap<EventMap>>()
  }

  /* ------------------ Public Accessors ------------------- */

  public recordListenerErrorFor<E extends SafetyKey>(
    event: E,
    error: unknown,
    listenerName?: string,
  ): void {
    if (!this._safetyEnabled) return
    try {
      this._recordListenerErrorEntry(event, error, listenerName)
    } catch (err) {
      emitDiagnosticWarning("[SafetyManager] Failed to record listener error", err)
    }
  }

  public getErrorCount<E extends SafetyKey>(event: E): number {
    const key = normalizeEventKeyForMap(event) as SafetyKey | undefined
    if (!key) return 0
    return this._errorCounts.get(key)
  }

  public getAllErrorCounts(): ReadonlyMap<SafetyKey, number> {
    return this._errorCounts.getAll()
  }

  /* ------------------- Private helpers ------------------- */

  private _recordListenerErrorEntry<E extends SafetyKey>(
    event: E,
    error: unknown,
    listenerName?: string,
  ): void {
    const key = normalizeEventKeyForMap(event) as SafetyKey

    this._errorCounts.increment(key)

    const storedError = this._sanitizeErrors ? SafetyManager.sanitizeError(error) : error
    const entry: SafetyLogEntry = {
      timestamp: Date.now(),
      error: storedError,
      listener: listenerName ?? "unknown",
    }

    const cap = this._perEventCaps?.[key] ?? this._safetyLogCap
    let buf = this._safetyLogs.get(key)

    if (!buf) {
      buf = new RingBuffer<SafetyLogEntry>(cap)
      this._safetyLogs.set(key, buf)
    }

    buf.push(entry)
  }

  /* -------------- Private Static Helpers ----------------- */

  private static sanitizeError(e: unknown): SanitizedError {
    if (e instanceof Error) {
      const { name, message, stack } = e
      return {
        kind: "Error",
        name,
        message,
        stackSnippet: stack?.split("\n").slice(0, 3).join("\n"),
      }
    }
    try {
      return { kind: "Json", value: JSON.parse(JSON.stringify(e)) as JsonValue }
    } catch {
      return { kind: "String", value: String(e) }
    }
  }
}
