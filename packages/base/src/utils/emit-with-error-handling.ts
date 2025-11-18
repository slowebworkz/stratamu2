/**
 * Shared helper for emit() error handling with strict bubbling semantics.
 */

// Type for error handler callback (no longer used)
// export type EmitErrorHandler = (error: unknown) => void;

// Type for the args parameter: either a readonly array of T or an empty array
export type EmitArgs<T> = readonly T[] | [];

// Main emitWithErrorHandling
// Returns a Promise or array of Promises for emission; caller handles aggregation and errors
export function emitWithErrorHandling<TPayload>(
  args: EmitArgs<TPayload>,
  emitMethods:
    | Array<(data: TPayload | undefined) => unknown>
    | ((data: TPayload | undefined) => unknown),
): Promise<void>[] {
  const data = extractPayload(args);
  const methods = Array.isArray(emitMethods) ? emitMethods : [emitMethods];
  return methods.map((fn) => Promise.resolve(fn(data)) as Promise<void>);
}

// Extracts the payload from args (first element or undefined)
export function extractPayload<T>(args: EmitArgs<T>): T | undefined {
  return args.length > 0 ? args[0] : undefined;
}
