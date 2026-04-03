import type { CommPriority, NationalAgendaOption } from './commBus'

export type CourtSeatHolderType = 'human' | 'ai'

export type CourtSeatRole = 'human_lord' | 'ai_council'

export type CourtProposalClass = 'routine' | 'war' | 'constitutional'

export type CourtVoteChoice = 'yes' | 'no' | 'abstain'

export type CourtResolutionDecision = 'passed' | 'rejected' | 'deferred'

export type CourtSeat = {
  id: string
  tick: number
  factionId: string
  holderType: CourtSeatHolderType
  role: CourtSeatRole
  holderId: string
  holderName: string
  weight: number
  canVeto: boolean
}

export type CourtProposal = {
  id: string
  tick: number
  sourceOptionId: string
  sourceIntentKey: string
  priority: CommPriority
  proposalClass: CourtProposalClass
  title: string
  summary: string
  recommendedAction: NationalAgendaOption['recommendedAction']
  sourceDomainIds: string[]
  sourceFactionIds: string[]
}

export type CourtVote = {
  seatId: string
  proposalId: string
  choice: CourtVoteChoice
  reason: string
}

export type CourtResolution = {
  id: string
  proposalId: string
  decision: CourtResolutionDecision
  quorumMet: boolean
  yesWeight: number
  noWeight: number
  abstainWeight: number
  thresholdRatio: number
  passedRatio: number
  executionDirective: string
  accountableSeatIds: string[]
}

export type CourtSession = {
  id: string
  tick: number
  agendaId: string
  seats: CourtSeat[]
  proposals: CourtProposal[]
  votes: CourtVote[]
  resolutions: CourtResolution[]
  summary: string
  openedAt: string
  closedAt: string
}

export type CourtSessionListResponse = {
  items: CourtSession[]
}
