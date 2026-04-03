import { z } from 'zod'
import { commPrioritySchema, nationalAgendaRecommendedActionSchema } from './commBus'

export const courtSeatHolderTypeSchema = z.enum(['human', 'ai'])

export const courtSeatRoleSchema = z.enum(['human_lord', 'ai_council'])

export const courtProposalClassSchema = z.enum(['routine', 'war', 'constitutional'])

export const courtVoteChoiceSchema = z.enum(['yes', 'no', 'abstain'])

export const courtResolutionDecisionSchema = z.enum(['passed', 'rejected', 'deferred'])

export const courtSeatSchema = z.object({
  id: z.string().min(1),
  tick: z.number().int().nonnegative(),
  factionId: z.string().min(1),
  holderType: courtSeatHolderTypeSchema,
  role: courtSeatRoleSchema,
  holderId: z.string().min(1),
  holderName: z.string().min(1).max(120),
  weight: z.number().min(0.1).max(5),
  canVeto: z.boolean(),
})

export const courtProposalSchema = z.object({
  id: z.string().min(1),
  tick: z.number().int().nonnegative(),
  sourceOptionId: z.string().min(1),
  sourceIntentKey: z.string().min(1).max(120),
  priority: commPrioritySchema,
  proposalClass: courtProposalClassSchema,
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(420),
  recommendedAction: nationalAgendaRecommendedActionSchema,
  sourceDomainIds: z.array(z.string().min(1)).max(64),
  sourceFactionIds: z.array(z.string().min(1)).max(64),
})

export const courtVoteSchema = z.object({
  seatId: z.string().min(1),
  proposalId: z.string().min(1),
  choice: courtVoteChoiceSchema,
  reason: z.string().min(1).max(240),
})

export const courtResolutionSchema = z.object({
  id: z.string().min(1),
  proposalId: z.string().min(1),
  decision: courtResolutionDecisionSchema,
  quorumMet: z.boolean(),
  yesWeight: z.number().nonnegative(),
  noWeight: z.number().nonnegative(),
  abstainWeight: z.number().nonnegative(),
  thresholdRatio: z.number().min(0).max(1),
  passedRatio: z.number().min(0).max(1),
  executionDirective: z.string().min(1).max(280),
  accountableSeatIds: z.array(z.string().min(1)).max(64),
})

export const courtSessionSchema = z.object({
  id: z.string().min(1),
  tick: z.number().int().nonnegative(),
  agendaId: z.string().min(1),
  seats: z.array(courtSeatSchema).min(1).max(256),
  proposals: z.array(courtProposalSchema).max(9),
  votes: z.array(courtVoteSchema).max(9 * 256),
  resolutions: z.array(courtResolutionSchema).max(9),
  summary: z.string().min(1).max(640),
  openedAt: z.string().min(1),
  closedAt: z.string().min(1),
})
