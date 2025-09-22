export type Args<T> = T extends void | undefined ? [] : T extends any[] ? T : [T]
