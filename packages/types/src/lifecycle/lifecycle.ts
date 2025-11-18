const _LIFECYCLE_STATE = [
  "created",
  "initialized",
  "running",
  "suspended",
  "stopped",
  "destroyed",
] as const;

export type LifecycleState = (typeof _LIFECYCLE_STATE)[number];
