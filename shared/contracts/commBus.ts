export type CommTopic =
  | 'intel_report'
  | 'intel_request'
  | 'support_request'
  | 'path_coordination'
  | 'target_proposal'
  | 'resource_alert'
  | 'risk_alert'
  | 'status_update'
  | 'agenda_candidate'
  | 'ack'
  | 'reject'

export type CommPriority = 'P0' | 'P1' | 'P2'

export type DomainCommDropReason = 'send_quota' | 'receive_quota' | 'dedupe' | 'invalid_receiver'

export type BusMessage = {
  id: string
  tick: number
  domainId: string
  factionId: string
  senderAiPlayerId: string
  receiverAiPlayerIds: string[]
  topic: CommTopic
  priority: CommPriority
  ttlTicks: number
  confidence: number
  intent: string
  payload: Record<string, unknown>
  evidenceRefs: string[]
  conflictKey?: string
  dedupeKey?: string
  createdAt: number
}

export type DomainAgendaCandidate = {
  intent: string
  priority: CommPriority
  summary: string
  supportingAiPlayerIds: string[]
  evidenceRefs: string[]
}

export type DomainAgenda = {
  id: string
  tick: number
  domainId: string
  factionId: string
  candidates: DomainAgendaCandidate[]
  summary: string
  generatedAt: number
}

export type NationalAgendaRecommendedAction =
  | 'recon_first'
  | 'reinforce'
  | 'stabilize'
  | 'capture'
  | 'diplomacy'
  | 'hold'

export type NationalAgendaOption = {
  id: string
  tick: number
  intentKey: string
  title: string
  summary: string
  priority: CommPriority
  sourceDomainIds: string[]
  sourceFactionIds: string[]
  supportingAiPlayerIds: string[]
  candidateIntents: string[]
  recommendedAction: NationalAgendaRecommendedAction
  confidence: number
}

export type NationalAgendaWindow = {
  id: string
  tick: number
  optionCountIn: number
  optionCountOut: number
  options: NationalAgendaOption[]
  summary: string
  generatedAt: number
}

export type DomainCommMetricsSnapshot = {
  domainId: string
  factionId: string
  tick: number
  published: number
  delivered: number
  dropped: number
  droppedByReason: Record<DomainCommDropReason, number>
  conflictBuckets: number
  agendaCandidatesIn: number
  agendaCandidatesOut: number
}

export type DomainCommPreviewResponse = {
  domainId: string
  factionId: string
  tick: number
  agenda: DomainAgenda
  metrics: DomainCommMetricsSnapshot
  messages?: BusMessage[]
}

export type DomainCommWindowSummary = {
  tick: number
  domains: DomainCommPreviewResponse[]
  totalPublished: number
  totalDelivered: number
  totalDropped: number
}
