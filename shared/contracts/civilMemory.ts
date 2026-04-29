export type CivilMemoryEventType =
  | 'agenda_compiled'
  | 'court_session_closed'
  | 'court_resolution'
  | 'execution_outcome'

export type CivilResponsibilityRole = 'sponsor' | 'voter_yes' | 'voter_no' | 'executor' | 'observer'

export type CivilExecutionOutcome = 'pending' | 'success' | 'failed'

export type CivilMemoryIntegrityAlgorithm = 'sha256'

export type CivilResponsibility = {
  seatId: string
  role: CivilResponsibilityRole
  weight: number
}

export type CivilMemoryIntegrity = {
  algorithm: CivilMemoryIntegrityAlgorithm
  prevHash: string
  hash: string
  chainIndex: number
}

export type CivilMemoryEntry = {
  id: string
  tick: number
  type: CivilMemoryEventType
  title: string
  summary: string
  relatedIds: string[]
  factionIds: string[]
  sessionId?: string
  proposalId?: string
  resolutionId?: string
  outcome?: CivilExecutionOutcome
  responsibilities: CivilResponsibility[]
  metadata: Record<string, unknown>
  createdAt: string
  integrity?: CivilMemoryIntegrity
}

export type CivilMemoryQuery = {
  limit?: number
  type?: CivilMemoryEventType
  tickFrom?: number
  tickTo?: number
  factionId?: string
  relatedId?: string
}

export type CivilMemoryQueryResponse = {
  items: CivilMemoryEntry[]
}
