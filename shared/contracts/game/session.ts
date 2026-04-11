export type SessionAutonomyLevel = 'L1_assigned' | 'L2_delegated' | 'L3_negotiated'
export type SessionAuthErrorCode = 'invalid_token_format' | 'invalid_token' | 'token_expired'

export type SessionTokenState = {
  issuedAt: string
  expiresAt: string
  remainingMs: number
  expired: boolean
}

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

export type SessionJoinResponse = {
  sessionId: string
  token: string
  factionId: string
  seatId: number
  autonomyLevel: SessionAutonomyLevel
  controlMode: SessionControlMode
  tokenState?: SessionTokenState
}

export type SessionMutationResponse = {
  ok: boolean
  error?: string
  errorCode?: SessionAuthErrorCode
  factionId?: string
  autonomyLevel?: SessionAutonomyLevel
  controlMode?: SessionControlMode
  tokenState?: SessionTokenState
}
