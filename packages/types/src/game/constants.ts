export interface GameNetworkingConstants {
  readonly maxConnections: number
  readonly maxConnectionsPerIP: number
  readonly defaultPort: number
  readonly idleTimeoutMs: number
  readonly connectionTimeoutMs?: number
  readonly supportedProtocols: string[]
  readonly preferredProtocol: 'telnet' | 'websocket' | 'both'
  readonly maxInputLength: number
  readonly maxOutputBuffer: number
  readonly maxCommandHistory: number
}

export interface GameSystemConstants extends GameNetworkingConstants {
  readonly maxNameLength: number
  readonly maxPasswordLength: number
  readonly maxTitleLength: number
  readonly maxPromptLength: number
  readonly maxLevel: number
  readonly maxStatValue: number
  readonly maxRooms: number
  readonly maxObjects: number
  readonly maxMobs: number
  readonly maxSayLength: number
  readonly maxTellLength: number
  readonly maxChannelLength: number
  readonly maxEmoteLength: number
}

export interface MUDConstants extends GameSystemConstants {
  readonly gameType: 'MUD'
  readonly combatSystem: 'turn-based' | 'real-time' | 'hybrid'
  readonly allowPK: boolean
  readonly multiclassing: boolean
}

export interface MUSHConstants extends GameSystemConstants {
  readonly gameType: 'MUSH'
  readonly posesEnabled: boolean
  readonly objectCreation: boolean
  readonly codingAllowed: boolean
  readonly maxObjectsPerPlayer: number
}

export interface MOOConstants extends GameSystemConstants {
  readonly gameType: 'MOO'
  readonly programmingAllowed: boolean
  readonly verbProgramming: boolean
  readonly maxVerbsPerObject: number
  readonly maxPropertiesPerObject: number
}

export interface MUCKConstants extends GameSystemConstants {
  readonly gameType: 'MUCK'
  readonly buildingEnabled: boolean
  readonly mufProgramming: boolean
  readonly maxRoomsPerPlayer: number
  readonly maxActionsPerPlayer: number
}
