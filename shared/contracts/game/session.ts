export type SessionAutonomyLevel = 'L1_assigned' | 'L2_delegated' | 'L3_negotiated'

export type SessionControlMode =
  | 'human_assigned'
  | 'ai_delegated'
  | 'ai_negotiated'

export type SessionRuntimeFaction = {
  factionId: string
  autonomyLevel: SessionAutonomyLevel
  controlMode: SessionControlMode
  playerName?: string
  playerNames?: string[]
  online: boolean
  seatCount?: number
  onlineSeatCount?: number
  doctrinePreview: string
  doctrineUpdatedAt?: string
  hasModelConfig: boolean
  commanderModel?: string
  generalModel?: string
  unitModel?: string
}

export type SessionRuntimeResponse = {
  tick: number
  worldVersion: number
  factions: SessionRuntimeFaction[]
}
