import { z } from 'zod'
import { aiPlayerActionTypeSchema } from './aiPlayer'

export const aiPlayerRuntimePromptSectionIdSchema = z.enum([
  'role',
  'authority',
  'observation',
  'decision',
  'budget',
  'output',
])

export const aiPlayerRuntimePromptSectionSchema = z.object({
  id: aiPlayerRuntimePromptSectionIdSchema,
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(24).max(800),
  required: z.literal(true),
})

export const aiPlayerRuntimePromptOutputContractSchema = z.object({
  format: z.literal('json'),
  maxProposals: z.number().int().min(0).max(5),
  requiredProposalFields: z.tuple([
    z.literal('action'),
    z.literal('args'),
    z.literal('reason'),
  ]),
  deferField: z.literal('deferReason'),
  reviewField: z.literal('needsHumanReview'),
})

export const aiPlayerRuntimeSystemContextSchema = z.object({
  version: z.string().trim().min(10).max(32),
  purpose: z.string().trim().min(24).max(240),
  allowedActions: z.array(aiPlayerActionTypeSchema).min(1),
  deferredWorldAuthorities: z.array(z.string().trim().min(1).max(120)),
  sections: z.array(aiPlayerRuntimePromptSectionSchema).min(1),
  outputContract: aiPlayerRuntimePromptOutputContractSchema,
})

export type AiPlayerRuntimeSystemContextInput = z.input<typeof aiPlayerRuntimeSystemContextSchema>

export function parseAiPlayerRuntimeSystemContext(value: unknown) {
  return aiPlayerRuntimeSystemContextSchema.parse(value)
}
