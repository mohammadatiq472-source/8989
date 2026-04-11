import { z } from 'zod'

export const sessionAutonomyLevelSchema = z.enum([
  'L1_assigned',
  'L2_delegated',
  'L3_negotiated',
])

export const sessionAuthErrorCodeSchema = z.enum([
  'invalid_token_format',
  'invalid_token',
  'token_expired',
])

export const sessionControlModeSchema = z.enum([
  'human_assigned',
  'ai_delegated',
  'ai_negotiated',
])

export const sessionRuntimeFactionSchema = z.object({
  factionId: z.string(),
  autonomyLevel: sessionAutonomyLevelSchema,
  controlMode: sessionControlModeSchema,
  playerName: z.string().optional(),
  playerNames: z.array(z.string()).optional(),
  online: z.boolean(),
  seatCount: z.number().int().optional(),
  onlineSeatCount: z.number().int().optional(),
  doctrinePreview: z.string(),
  doctrineUpdatedAt: z.string().optional(),
  hasModelConfig: z.boolean(),
  commanderModel: z.string().optional(),
  generalModel: z.string().optional(),
  unitModel: z.string().optional(),
})

export const sessionRuntimeResponseSchema = z.object({
  tick: z.number().int(),
  worldVersion: z.number().int(),
  factions: z.array(sessionRuntimeFactionSchema),
})

export const sessionTokenStateSchema = z.object({
  issuedAt: z.string(),
  expiresAt: z.string(),
  remainingMs: z.number().int().nonnegative(),
  expired: z.boolean(),
})

export const sessionJoinResponseSchema = z.object({
  sessionId: z.string(),
  token: z.string(),
  factionId: z.string(),
  seatId: z.number().int(),
  autonomyLevel: sessionAutonomyLevelSchema,
  controlMode: sessionControlModeSchema,
  tokenState: sessionTokenStateSchema.optional(),
})

export const sessionMutationResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  errorCode: sessionAuthErrorCodeSchema.optional(),
  factionId: z.string().optional(),
  autonomyLevel: sessionAutonomyLevelSchema.optional(),
  controlMode: sessionControlModeSchema.optional(),
  tokenState: sessionTokenStateSchema.optional(),
})
