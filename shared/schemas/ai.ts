import { z } from 'zod'
import type { AiConfigUpdateRequest } from '../contracts/game'

export const aiRiskPreferenceSchema = z.enum(['conservative', 'balanced', 'aggressive'])

export const aiModelRoleConfigSchema = z
  .object({
    commander: z.string().trim().min(1).max(160),
    general: z.string().trim().min(1).max(160),
    unit: z.string().trim().min(1).max(160),
  })
  .strict()

export const aiHubConfigSchema = z
  .object({
    automationEnabled: z.boolean(),
    plannerFrequency: z.number().int().min(1).max(12),
    riskPreference: aiRiskPreferenceSchema,
    doctrinePrompt: z.string().trim().min(1).max(2000),
    models: aiModelRoleConfigSchema,
  })
  .strict()

export const aiConfigUpdateRequestSchema = z
  .object({
    config: aiHubConfigSchema,
    factionId: z.string().trim().regex(/^[a-z0-9_-]{1,40}$/).optional(),
  })
  .strict()

export function parseAiConfigUpdateRequest(input: unknown): AiConfigUpdateRequest {
  return aiConfigUpdateRequestSchema.parse(input) as AiConfigUpdateRequest
}
