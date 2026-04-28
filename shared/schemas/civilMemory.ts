import { z } from 'zod'

export const civilMemoryEventTypeSchema = z.enum([
  'agenda_compiled',
  'court_session_closed',
  'court_resolution',
  'execution_outcome',
])

export const civilResponsibilityRoleSchema = z.enum(['sponsor', 'voter_yes', 'voter_no', 'executor', 'observer'])

export const civilExecutionOutcomeSchema = z.enum(['pending', 'success', 'failed'])

export const civilMemoryIntegrityAlgorithmSchema = z.enum(['sha256'])

export const civilMemoryIntegritySchema = z.object({
  algorithm: civilMemoryIntegrityAlgorithmSchema,
  prevHash: z.string().min(1).max(128),
  hash: z.string().length(64),
  chainIndex: z.number().int().nonnegative(),
})

export const civilResponsibilitySchema = z.object({
  seatId: z.string().min(1),
  role: civilResponsibilityRoleSchema,
  weight: z.number().nonnegative(),
})

export const civilMemoryEntrySchema = z.object({
  id: z.string().min(1),
  tick: z.number().int().nonnegative(),
  type: civilMemoryEventTypeSchema,
  title: z.string().min(1).max(180),
  summary: z.string().min(1).max(800),
  relatedIds: z.array(z.string().min(1)).max(80),
  factionIds: z.array(z.string().min(1)).max(80),
  sessionId: z.string().min(1).optional(),
  proposalId: z.string().min(1).optional(),
  resolutionId: z.string().min(1).optional(),
  outcome: civilExecutionOutcomeSchema.optional(),
  responsibilities: z.array(civilResponsibilitySchema).max(120),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().min(1),
  integrity: civilMemoryIntegritySchema.optional(),
})

export const civilMemoryQuerySchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  type: civilMemoryEventTypeSchema.optional(),
  tickFrom: z.number().int().nonnegative().optional(),
  tickTo: z.number().int().nonnegative().optional(),
  factionId: z.string().min(1).max(64).optional(),
  relatedId: z.string().min(1).max(128).optional(),
})

export const memoryProviderRequestedSchema = z.enum(['mem0', 'in_memory'])
export const memoryProviderActiveSchema = z.enum(['mem0', 'in_memory', 'unknown'])
export const memoryProviderLifecycleSchema = z.enum(['uninitialized', 'ready', 'degraded'])

export const memoryProviderObservabilitySchema = z.object({
  requestedProvider: memoryProviderRequestedSchema,
  activeProvider: memoryProviderActiveSchema,
  lifecycle: memoryProviderLifecycleSchema,
  downgraded: z.boolean(),
  reason: z.string().min(1).optional(),
  updatedAt: z.string().min(1),
})

export const civilMemoryObservabilityResponseSchema = z.object({
  items: z.array(civilMemoryEntrySchema),
  memoryProvider: memoryProviderObservabilitySchema,
})
