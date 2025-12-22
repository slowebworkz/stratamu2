import type { ClientCapabilities } from "@/special"

export interface BaseClient {
  clientId: string
  capabilities?: ClientCapabilities
  connectionInfo?: {
    ip?: string
    port?: number
    connected?: Date
  }
  // Add more fields as needed for your use case
}
