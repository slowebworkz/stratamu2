import type { Merge, PartialDeep } from 'type-fest'

export type BaseNetworkConfig = {
  port?: number
  idleTimeoutMs?: number
  maxConnections?: number
  maxConnectionsPerIP?: number
}

export type TelnetConfig = PartialDeep<BaseNetworkConfig>

export type WebSocketConfig = Merge<
  BaseNetworkConfig,
  {
    path?: string
    cors?: boolean
  }
>
