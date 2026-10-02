export type { ExecutionOptions, ProcessState } from "./shared/lifecycle.ts"

export type { ProcessDefinition } from "./children/process-definition.ts"
export type { ProcessResult } from "./children/process-result.ts"
export type {
  ManagedProcess,
  ManagedProcessHooks,
  ManagedProcessOptions,
  ProcessOutputOptions,
  StopOptions,
} from "./children/managed-process.ts"
export { createManagedProcess } from "./children/managed-process.ts"
export type {
  ProcessManagerEvents,
  RunOptions,
  StartOptions,
} from "./children/child-process-manager.ts"
export { ChildProcessManager } from "./children/child-process-manager.ts"
