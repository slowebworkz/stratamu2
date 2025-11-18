export type Args<T> = T extends undefined | undefined ? [] : T extends any[] ? T : [T];
