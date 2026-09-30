/** Minimal guard function type. Defined here so compiled .d.ts has no guardz reference. */
export type GuardFn<T> = (value: unknown) => value is T
