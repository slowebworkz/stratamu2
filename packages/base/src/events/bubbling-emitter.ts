import type { AllEvents } from "@/events"
import { FilteredPriorityEmitter } from "@/events"
import type { Args, BaseEventMap } from "@repo/types"

// Helper type for parent event map construction

export abstract class BubblingEmitter<
  EventMap extends BaseEventMap<unknown[]> = BaseEventMap<unknown[]>,
  ParentEventMap extends AllEvents<EventMap> = AllEvents<EventMap>,
> extends FilteredPriorityEmitter<EventMap> {
  /**
   * Optional parent emitter to which events may bubble.
   */
  protected parent?: BubblingEmitter<ParentEventMap>

  /**
   * Set of event names that should bubble to the parent.
   */
  private bubbleEvents = new Set<keyof EventMap>()

  /**
   * Construct a BubblingEmitter with an optional parent.
   * @param parent Optional parent emitter for bubbling.
   */
  constructor(parent?: BubblingEmitter<ParentEventMap>) {
    super()
    this.parent = parent
  }

  /**
   * Get the parent emitter, if any.
   */
  public getParent(): BubblingEmitter<ParentEventMap> | undefined {
    return this.parent
  }

  /**
   * Get all events that have bubbling enabled as a readonly set.
   * @returns Readonly set of event names with bubbling enabled
   */
  public getBubblingEvents(): ReadonlySet<keyof EventMap> {
    return this.bubbleEvents
  }

  /**
   * Check if bubbling is enabled for a specific event.
   * @param event The event name to check.
   */
  public isBubbling<Name extends keyof EventMap>(event: Name): boolean {
    return this.bubbleEvents.has(event)
  }

  /**
   * Enable bubbling for a specific event type.
   * @param event The event name to enable bubbling for.
   */
  public enableBubble<Name extends keyof EventMap>(event: Name): void {
    this.bubbleEvents.add(event)
  }

  /**
   * Disable bubbling for a specific event type.
   * @param event The event name to disable bubbling for.
   */
  public disableBubble<Name extends keyof EventMap>(event: Name): void {
    this.bubbleEvents.delete(event)
  }

  /**
   * Emit an event and bubble it to the parent if enabled.
   * @param eventName The event name.
   * @param args Arguments for the event.
   */
  async emitWithBubble<Name extends keyof EventMap>(
    eventName: Name,
    ...args: Args<EventMap[Name]>
  ): Promise<void> {
    await this.emitSafe(eventName, ...args)
    if (this.isBubbling(eventName)) {
      await this.bubbleToParent(eventName, args)
    }
  }

  /**
   * Emit an event and bubble it to the parent without waiting (fire-and-forget).
   * Useful when you don't want to block on parent emission completion.
   * @param eventName The event name.
   * @param args Arguments for the event.
   */
  async emitWithBubbleAsync<Name extends keyof EventMap>(
    eventName: Name,
    ...args: Args<EventMap[Name]>
  ): Promise<void> {
    await this.emitSafe(eventName, ...args)
    if (!this.parent || !this.isBubbling(eventName)) return
    // Fire-and-forget: don't await parent bubbling
    this.bubbleToParent(eventName, args).catch(error => {
      // Log error to console to prevent unhandled promise rejections
      console.error("BubblingEmitter: Failed to bubble event to parent:", error)
    })
  }

  /**
   * Dispose of this emitter and clear parent reference to prevent memory leaks.
   * This should be called when removing an emitter from a hierarchy.
   */
  public dispose(): void {
    this.parent = undefined
    this.bubbleEvents.clear()
  }

  /**
   * Optional tracing hook for debugging event bubbling.
   */
  protected traceBubble<Name extends keyof EventMap>(eventName: Name): void {
    this.log?.debug?.(
      `[BubblingEmitter] Event "${String(eventName)}" bubbling from ${this.constructor.name}`,
    )
  }

  /**
   * Bubble an event to the parent emitter, recursively.
   * Prevents cycles via the visited set.
   * @param eventName The event name.
   * @param args Arguments for the event.
   * @param visited Set of visited emitters to prevent cycles.
   */
  protected async bubbleToParent<Name extends keyof EventMap>(
    eventName: Name,
    args: Args<EventMap[Name]>,
    visited: Set<BubblingEmitter<ParentEventMap, unknown>> = new Set(),
  ): Promise<void> {
    const parent = this.parent
    if (!parent) return

    // Check if we've already visited this exact parent to prevent infinite loops
    if (visited.has(parent)) return

    // Add current parent to visited set before continuing
    visited.add(parent)

    // Type-safe bubbling using helper type to reduce casting
    const parentEventName = eventName as unknown as keyof ParentEventMap
    const parentArgs = args as Args<ParentEventMap[typeof parentEventName]>

    await parent.emitSafe(parentEventName, ...parentArgs)

    // Only continue bubbling if the parent has bubbling enabled for this event
    if (parent.isBubbling(parentEventName)) {
      await parent.bubbleToParent(parentEventName, parentArgs, visited)
    }
  }

  /**
   * Traverse to the root emitter in the bubbling hierarchy.
   */
  public getRoot(): BubblingEmitter<EventMap, ParentEventMap> {
    let node: BubblingEmitter<EventMap, ParentEventMap> = this
    while (node.parent) node = node.parent as BubblingEmitter<EventMap, ParentEventMap>
    return node
  }
}

/**
 * Fire-and-forget helper for async calls.
 * Catches any errors and logs them without throwing.
 * @param promise The promise to execute.
 * @param context Context string for logging purposes.
 */
async function fireAndForget(promise: Promise<void>, context: string): Promise<void> {
  try {
    await promise
  } catch (error) {
    console.error(`${context}:`, error)
  }
}
