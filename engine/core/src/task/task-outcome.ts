/** What happened to a task, once it has finished. */
export type TaskOutcome =
  | { readonly state: "completed" }
  | { readonly state: "failed"; readonly error: unknown }
  | { readonly state: "cancelled"; readonly reason: unknown }
