/**
 * Like Record<K, T>, but keys are optional.
 */
export type PartialRecord<K extends keyof any, T> = {
  [P in K]?: T;
};
