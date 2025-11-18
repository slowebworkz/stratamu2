import type { JsonValue, PartialDeep, Promisable, SetRequired } from "type-fest";

import type { TelnetConfig, TelnetEventMap } from "./index.ts";

export type TelnetConfigRequired = SetRequired<
  TelnetConfig,
  "port" | "idleTimeoutMs" | "maxConnections" | "maxConnectionsPerIP"
>;

/**
 * Handler signature for Telnet events in classic MUDs/MUSHes.
 */
export type TelnetEventHandler = (
  clientId: TelnetClientId,
  message: TelnetMessage,
  state: TelnetClientState,
) => Promisable<void>;

/**
 * Deep partial mapping of Telnet event handlers.
 */
export type TelnetHandlers = PartialDeep<{
  [K in keyof TelnetEventMap]: Array<TelnetEventHandler>;
}>;

/**
 * Telnet middleware function signature.
 * Supports async chaining for classic MUD/MUSH middleware stacks.
 */
export type TelnetMiddleware = (
  clientId: TelnetClientId,
  message: TelnetMessage,
  next: () => Promisable<void>,
) => Promisable<void>;

/**
 * State object for a connected Telnet client session.
 * Use a Record<string, JsonValue> for flexibility and Type-Fest compatibility.
 * Extend as needed for your Telnet application.
 */
export type TelnetClientState = Record<string, JsonValue>;

export type TelnetGroupId = string;
export type TelnetClientId = string;

/**
 * Telnet messages can be strings or raw bytes (Uint8Array) for classic MUD/MUSH protocols.
 */
export type TelnetMessage = string | Uint8Array;
