const LIFECYCLE_STATE = [
  'created',
  'initialized',
  'running',
  'suspended',
  'stopped',
  'destroyed',
] as const

export type LifecycleState = (typeof LIFECYCLE_STATE)[number]
