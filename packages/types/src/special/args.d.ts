export type Args<T> = T extends undefined | undefined ? [] : T extends unknown[] ? T : [T]
