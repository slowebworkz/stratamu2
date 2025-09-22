export type Args<T> = [T] extends [void] | [undefined] ? [] : [T]
