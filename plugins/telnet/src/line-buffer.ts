/**
 * Turns a stream of text chunks into complete lines. A chunk can hold several lines, or stop
 * mid-line, so the unfinished tail is kept until its terminator arrives. `\n` and `\r\n` both end
 * a line; the terminator is not part of it.
 */
export class LineBuffer {
  #pending = ""

  /** Adds a chunk and returns the lines it completed, in order. */
  push(chunk: string): string[] {
    const parts = (this.#pending + chunk).split("\n")
    this.#pending = parts.pop() ?? ""
    return parts.map(line => (line.endsWith("\r") ? line.slice(0, -1) : line))
  }
}
