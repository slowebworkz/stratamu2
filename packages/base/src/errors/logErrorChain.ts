// Recursively log the error chain (name + message)

export interface ErrorLogEntry {
  level: number;
  message: string;
}

export interface ErrorStackEntry {
  level: number;
  stack: string | undefined;
}

export async function logErrorChainAsync(
  err: unknown,
  callback?: (entry: ErrorLogEntry, formatted?: string) => Promise<void> | void,
  formatter?: (entry: ErrorLogEntry) => string,
): Promise<ErrorLogEntry[]> {
  const logs: ErrorLogEntry[] = [];

  await _traverseErrorChain(
    err,
    async (error, lvl) =>
      await _handleErrorEntry(logs, _errorEntry(error), lvl, callback, formatter),
    async (leaf, lvl) => await _handleErrorEntry(logs, _leafEntry(leaf), lvl, callback, formatter),
  );

  return logs;
}

export async function logFullErrorChainAsync(
  err: unknown,
  callback?: (entry: ErrorStackEntry) => Promise<void> | void,
): Promise<ErrorStackEntry[]> {
  const logs: ErrorStackEntry[] = [];
  await _traverseErrorChain(err, async (error, lvl) => {
    await _handleStackEntry(logs, _stackEntry(error), lvl, callback);
  });
  return logs;
}

/* -------------------- Internal helpers -------------------- */

async function _traverseErrorChain(
  err: unknown,
  callback: (error: Error, level: number) => Promise<void> | void,
  leafCallback?: (leaf: unknown, level: number) => Promise<void> | void,
  level = 0,
): Promise<void> {
  if (err instanceof Error) {
    await callback(err, level);
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause !== undefined) {
      await _traverseErrorChain(cause, callback, leafCallback, level + 1);
    }
  } else if (leafCallback) {
    await leafCallback(err, level);
  }
}

function _errorEntry(error: Error): Omit<ErrorLogEntry, "level"> {
  return { message: `${error.name}: ${error.message}` };
}

function _leafEntry(leaf: unknown): Omit<ErrorLogEntry, "level"> {
  return { message: String(leaf) };
}

function _stackEntry(error: Error): Omit<ErrorStackEntry, "level"> {
  return { stack: error.stack };
}

async function _handleErrorEntry(
  logs: ErrorLogEntry[],
  entry: Omit<ErrorLogEntry, "level">,
  level: number,
  callback?: (entry: ErrorLogEntry, formatted?: string) => Promise<void> | void,
  formatter?: (entry: ErrorLogEntry) => string,
) {
  const fullEntry: ErrorLogEntry = { ...entry, level };
  logs.push(fullEntry);
  const output = formatter ? formatter(fullEntry) : " ".repeat(level * 2) + fullEntry.message;
  if (callback) await callback(fullEntry, output);
  // Optional: log/output
  // console.log(output);
}

async function _handleStackEntry(
  logs: ErrorStackEntry[],
  entry: Omit<ErrorStackEntry, "level">,
  level: number,
  callback?: (entry: ErrorStackEntry) => Promise<void> | void,
) {
  const fullEntry: ErrorStackEntry = { ...entry, level };
  logs.push(fullEntry);
  if (callback) await callback(fullEntry);
}
