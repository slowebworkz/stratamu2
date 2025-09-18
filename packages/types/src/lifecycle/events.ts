// Shared lifecycle event contract for all emitters

export interface LifecycleEvents {
  init: void
  start: void
  resume: void
  suspend: void
  stop: void
  reset: void
  destroy: void
}
