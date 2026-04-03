import { z } from 'zod'
import type { PlannerResult, PlanningRequest, StrategicPlan } from '../contracts/game'

export type PlannerModelOutput = {
  plan: StrategicPlan
  explanation?: string
  planningRationale?: string[]
}

export const plannerModeSchema = z.enum(['mock', 'local', 'gateway'])
export const planSourceSchema = z.enum(['mock', 'local', 'gateway'])
export const regionPrioritySchema = z.enum(['low', 'medium', 'high'])
export const actionTypeSchema = z.enum(['march', 'garrison', 'recon', 'support', 'capture'])

export const structuredOrderSchema = z
  .object({
    unitId: z.string().min(1),
    action: actionTypeSchema,
    target: z.string().min(1),
  })
  .strict()

export const strategicPlanSchema = z
  .object({
    intent: z.string().trim().min(1).max(160),
    priority: regionPrioritySchema,
    orders: z.array(structuredOrderSchema).min(1).max(8),
    constraints: z.array(z.string().trim().min(1).max(120)).max(16).default([]),
    reviewAfterTicks: z.number().int().min(1).max(6),
  })
  .strict()

export const plannerExplanationSchema = z.string().trim().min(1).max(1000)
export const planningRationaleSchema = z.array(z.string().trim().min(1).max(240)).min(1).max(8)

export const plannerModelOutputSchema = strategicPlanSchema
  .extend({
    explanation: plannerExplanationSchema.optional(),
    planningRationale: planningRationaleSchema.optional(),
  })
  .strict()

export const plannerConfigSchema = z
  .object({
    mode: plannerModeSchema,
    model: z.string().max(128).optional().default(''),
  })
  .strict()

export const planningRequestSchema = z
  .object({
    strategicCommand: z.string().trim().min(1).max(400),
    config: plannerConfigSchema,
  })
  .strict()

export const plannerMetricsSchema = z
  .object({
    requestId: z.string().min(1).optional(),
    gatewayProvider: z.string().min(1).max(120),
    model: z.string().min(1).max(180),
    latencyMs: z.number().int().nonnegative(),
    promptTokens: z.number().int().nonnegative().optional(),
    completionTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    estimatedCostUsd: z.number().nonnegative().optional(),
    failureCategory: z
      .enum([
        'validation',
        'gateway_http',
        'gateway_network',
        'gateway_timeout',
        'gateway_quota',
        'provider_error',
        'unknown',
      ])
      .optional(),
  })
  .strict()

export const plannerResultSchema = z
  .object({
    source: planSourceSchema,
    plan: strategicPlanSchema,
    note: z.string().max(2000).optional(),
    explanation: plannerExplanationSchema.optional(),
    planningRationale: planningRationaleSchema.optional(),
    rawText: z.string().optional(),
    metrics: plannerMetricsSchema.optional(),
  })
  .strict()

export function parsePlanningRequest(input: unknown): PlanningRequest {
  return planningRequestSchema.parse(input) as PlanningRequest
}

export function parseStrategicPlan(input: unknown): StrategicPlan {
  return strategicPlanSchema.parse(input) as StrategicPlan
}

export function parsePlannerModelOutput(input: unknown): PlannerModelOutput {
  const parsed = plannerModelOutputSchema.parse(input)

  return {
    plan: {
      intent: parsed.intent,
      priority: parsed.priority,
      orders: parsed.orders,
      constraints: parsed.constraints,
      reviewAfterTicks: parsed.reviewAfterTicks,
    },
    explanation: parsed.explanation,
    planningRationale: parsed.planningRationale,
  }
}

export function parsePlannerResult(input: unknown): PlannerResult {
  return plannerResultSchema.parse(input) as PlannerResult
}
