import type { BaseEventMap, EventKey } from "@repo/types"
import Emittery from "emittery"
import { SafetyManagerErrorCounts } from "./index.ts"
import type { JsonValue, Simplify } from "type-fest"
import { DEFAULT_SAFETY_LOG_CAP, ENABLE_SAFE_MODE } from "../../constants/index.ts"
import { RingBuffer } from "@repo/base"

export type PerEventCap<EventMap extends BaseEventMap = BaseEventMap> = Simplify<
  Partial<Record<EventKey<EventMap>, number>>
>

export type SafetyEmitterOptions<EventMap extends BaseEventMap = BaseEventMap> = Readonly<{
  safetyLogCap?: number
  sanitizeErrors?: boolean
  enabled?: boolean
  perEventCap?: PerEventCap<EventMap>
}>

export type SafetyManagerEventMap<EventMap extends BaseEventMap> = Simplify<{
  [ENABLE_SAFE_MODE]: [eventName: EventKey<EventMap> | "*", enabled: boolean]
  // Add more internal events here as needed, e.g.:
  // resetErrorCounts: [eventName?: EmitterEventKey<EventMap>]
  // clearSafetyLogs: [eventName?: EmitterEventKey<EventMap>]
}>

export type SafetyLogEntry = {
  timestamp: number
  error: unknown
  listener: string
}

/**
 * Sanitized error shapes. Either a trimmed Error-like shape, a stringified representation, or any JSON-friendly value.
 */
export type SanitizedError =
  | Readonly<{
    kind: "Error"
    name: string
    message: string
    stackSnippet?: string
  }>
  | Readonly<{ kind: "String"; value: string }>
  | Readonly<{ kind: "Json"; value: Exclude<JsonValue, undefined> }>

export class SafetyManager<
  EventMap extends BaseEventMap,
  SafetyKey extends EventKey<EventMap> = EventKey<EventMap>,
> {
  /* -------------- 🛑 Private Options ---------------------- */

  private readonly _safetyLogCap: NonNullable<SafetyEmitterOptions["safetyLogCap"]>
  private readonly _sanitizeErrors: boolean
  private readonly _perEventCaps?: Partial<Record<SafetyKey, number>>
  private _safetyEnabled: boolean

  /* -------------- 🔒 Private Storage ---------------------- */

  private readonly _errorCounts!: SafetyManagerErrorCounts<EventMap, SafetyKey>

  private readonly _safetyLogs = new Map<SafetyKey, RingBuffer<SafetyLogEntry>>()

  /* -------------- 📡 Emitter ------------------------------- */

  private readonly _emitter: Emittery<SafetyManagerEventMap<EventMap>>

  /* -------------- 🔨 Constructor -------------------------- */

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

  /* -------------- 📤 Public Accessors --------------------- */


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


  /* -------------- 🧩 Private Helpers ---------------------- */

  private _recordListenerErrorEntry<E extends SafetyKey>(
    event: E,
    error: unknown,
    listenerName?: string,
  ): void {
    const key = SafetyManager.normalizeEventKeyForMap(event) as SafetyKey

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

  /* -------------- ⚠️ Protected: Errors -------------------- */

  protected get emitter(): Emittery<SafetyManagerEventMap<EventMap>> { return this._emitter }

  /* -------------- 🔧 Static: Private utilities ------------ */

  /**
   * Normalize a PropertyKey for map lookups.
   * - Undefined/null → undefined
   * - Global symbols → string tag (stable across realms)
   * - Local symbols → preserved as-is
   * - Numbers/strings → preserved as-is
   */
  private static normalizeEventKeyForMap(key?: PropertyKey): PropertyKey | undefined {
    if (key == null) return undefined

    if (typeof key === "symbol") {
      const globalKey = Symbol.keyFor(key)
      if (globalKey) return `@@symbol:${globalKey}`
      return key
    }

    return key
  }

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
