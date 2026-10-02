/**
 * What to launch: an explicit executable and argument list, never a shell string. The caller
 * constructs this in code -- never from a raw string or by concatenating untrusted input -- which
 * is what "registered" means for this package today. A named registry/allowlist for less-trusted
 * callers (plugins) is a further, deliberately deferred hardening layer, not this.
 */
export interface ProcessDefinition {
  readonly id: string
  readonly executable: string
  readonly args?: readonly string[]
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
}
