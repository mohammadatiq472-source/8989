import { z } from 'zod'
import { aiPlayerActionTypeSchema } from './aiPlayer'
import {
  AI_PLAYER_RUNTIME_ALLOWED_ACTIONS,
  AI_PLAYER_RUNTIME_SYSTEM_CONTEXT,
} from '../contracts/aiPlayerRuntimePrompt'

export const aiPlayerRuntimePromptSectionIdSchema = z.enum([
  'role',
  'authority',
  'observation',
  'decision',
  'identity_context',
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

const aiPlayerRuntimeAllowedActionSet = new Set<string>(AI_PLAYER_RUNTIME_ALLOWED_ACTIONS)

export const aiPlayerRuntimeModelProposalSchema = z.object({
  action: aiPlayerActionTypeSchema.refine(
    (action) => aiPlayerRuntimeAllowedActionSet.has(action),
    { message: 'action must be in AI_PLAYER_RUNTIME_ALLOWED_ACTIONS' },
  ),
  args: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().min(1).max(600),
}).strict()

export const aiPlayerRuntimeModelOutputSchema = z.object({
  summary: z.string().trim().min(1).max(600).optional(),
  proposals: z.array(aiPlayerRuntimeModelProposalSchema)
    .max(AI_PLAYER_RUNTIME_SYSTEM_CONTEXT.outputContract.maxProposals)
    .default([]),
  deferReason: z.string().trim().max(600).optional(),
  needsHumanReview: z.boolean().default(false),
}).strict().refine(
  (value) => value.proposals.length > 0 || Boolean(value.deferReason?.trim()),
  { message: 'model output must include at least one proposal or deferReason' },
)

export type AiPlayerRuntimeModelOutputInput = z.input<typeof aiPlayerRuntimeModelOutputSchema>
export type AiPlayerRuntimeModelOutput = z.output<typeof aiPlayerRuntimeModelOutputSchema>

export function parseAiPlayerRuntimeModelOutput(value: unknown) {
  return aiPlayerRuntimeModelOutputSchema.parse(value)
}
