import { z } from 'zod'

export const commTopicSchema = z.enum([
  'intel_report',
  'intel_request',
  'support_request',
  'path_coordination',
  'target_proposal',
  'resource_alert',
  'risk_alert',
  'status_update',
  'agenda_candidate',
  'ack',
  'reject',
])

export const commPrioritySchema = z.enum(['P0', 'P1', 'P2'])

export const domainCommDropReasonSchema = z.enum(['send_quota', 'receive_quota', 'dedupe', 'invalid_receiver'])

export const busMessageSchema = z.object({
  id: z.string().min(1),
  tick: z.number().int().nonnegative(),
  domainId: z.string().min(1),
  factionId: z.string().min(1),
  senderAiPlayerId: z.string().min(1),
  receiverAiPlayerIds: z.array(z.string().min(1)).min(1).max(32),
  topic: commTopicSchema,
  priority: commPrioritySchema,
  ttlTicks: z.number().int().min(1).max(6),
  confidence: z.number().min(0).max(1),
  intent: z.string().min(1).max(120),
  payload: z.record(z.string(), z.unknown()),
  evidenceRefs: z.array(z.string().min(1).max(120)).max(16),
  conflictKey: z.string().min(1).max(120).optional(),
  dedupeKey: z.string().min(1).max(120).optional(),
  createdAt: z.number().int().nonnegative(),
})

export const domainAgendaCandidateSchema = z.object({
  intent: z.string().min(1).max(120),
  priority: commPrioritySchema,
  summary: z.string().min(1).max(320),
  supportingAiPlayerIds: z.array(z.string().min(1)).max(32),
  evidenceRefs: z.array(z.string().min(1).max(120)).max(16),
})

export const domainAgendaSchema = z.object({
  id: z.string().min(1),
  tick: z.number().int().nonnegative(),
  domainId: z.string().min(1),
  factionId: z.string().min(1),
  candidates: z.array(domainAgendaCandidateSchema).max(5),
  summary: z.string().min(1).max(500),
  generatedAt: z.number().int().nonnegative(),
})

export const nationalAgendaRecommendedActionSchema = z.enum([
  'recon_first',
  'reinforce',
  'stabilize',
  'capture',
  'diplomacy',
  'hold',
])

export const nationalAgendaOptionSchema = z.object({
  id: z.string().min(1),
  tick: z.number().int().nonnegative(),
  intentKey: z.string().min(1).max(120),
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(420),
  priority: commPrioritySchema,
  sourceDomainIds: z.array(z.string().min(1)).max(64),
  sourceFactionIds: z.array(z.string().min(1)).max(64),
  supportingAiPlayerIds: z.array(z.string().min(1)).max(160),
  candidateIntents: z.array(z.string().min(1)).max(160),
  recommendedAction: nationalAgendaRecommendedActionSchema,
  confidence: z.number().min(0).max(1),
})

export const nationalAgendaWindowSchema = z.object({
  id: z.string().min(1),
  tick: z.number().int().nonnegative(),
  optionCountIn: z.number().int().nonnegative(),
  optionCountOut: z.number().int().nonnegative(),
  options: z.array(nationalAgendaOptionSchema).max(9),
  summary: z.string().min(1).max(640),
  generatedAt: z.number().int().nonnegative(),
})

export const domainCommMetricsSnapshotSchema = z.object({
  domainId: z.string().min(1),
  factionId: z.string().min(1),
  tick: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  dropped: z.number().int().nonnegative(),
  droppedByReason: z.record(domainCommDropReasonSchema, z.number().int().nonnegative()),
  conflictBuckets: z.number().int().nonnegative(),
  agendaCandidatesIn: z.number().int().nonnegative(),
  agendaCandidatesOut: z.number().int().nonnegative(),
})

export const domainCommPreviewResponseSchema = z.object({
  domainId: z.string().min(1),
  factionId: z.string().min(1),
  tick: z.number().int().nonnegative(),
  agenda: domainAgendaSchema,
  metrics: domainCommMetricsSnapshotSchema,
  messages: z.array(busMessageSchema).optional(),
})
