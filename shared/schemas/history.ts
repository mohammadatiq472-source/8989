import { z } from 'zod'

export const worldEventCategorySchema = z.enum([
  'world_action',
  'planning',
  'replay',
  'persistence',
  'system',
])

export const worldEventRecordSchema = z.object({
  id: z.string(),
  category: worldEventCategorySchema,
  action: z.string(),
  success: z.boolean(),
  tick: z.number().int(),
  worldVersion: z.number().int(),
  createdAt: z.string(),
  requestId: z.string().optional(),
  message: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const webSocketObservabilityErrorSchema = z.object({
  at: z.string(),
  stage: z.string(),
  factionId: z.string().nullable(),
  message: z.string(),
})

export const webSocketObservabilityStatsSchema = z.object({
  totalConnections: z.number().int(),
  subscribedConnections: z.number().int(),
  factionDistribution: z.record(z.string(), z.number().int()),
  recentErrors: z.array(webSocketObservabilityErrorSchema),
})

export const worldEventsResponseSchema = z.object({
  items: z.array(worldEventRecordSchema),
  wsStats: webSocketObservabilityStatsSchema.optional(),
})
