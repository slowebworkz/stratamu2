import type { PartialDeep, ReadonlyDeep } from "type-fest";

export interface ConnectionLimits {
  maxConnections: number;
  maxConnectionsPerIP: number;
}

export interface ConnectionInfo {
  ip?: string;
  port?: number;
  connected: Date;
}

export interface ClientInfo {
  clientId: string;
  connectionInfo: ConnectionInfo;
  state: PartialDeep<Record<string, any>>;
  groups: string[];
}

export interface ConnectionStats {
  total: number;
  byIP: ReadonlyMap<string, number>;
  limits: ConnectionLimits;
  canAcceptNew: boolean;
  oldestConnection?: Date;
  newestConnection?: Date;
}

export type ConnectionPolicy = ReadonlyDeep<{
  maxConnections: number;
  maxConnectionsPerIP: number;
  maxGuestConnections?: number;
  maxNewbieConnections?: number;
  idleTimeoutMs: number;
  connectTimeoutMs?: number;
  allowSiteban?: boolean;
  requireDNSLookup?: boolean;
}>;
