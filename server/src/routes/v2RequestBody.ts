import type { IncomingMessage } from 'node:http'
import { z } from 'zod'
import { readJsonBody } from './http'
import {
  recruitRequestSchema,
  starUpgradeRequestSchema,
  starAttributeAllocationSchema,
  armyComposeRequestSchema,
  allianceCreateRequestSchema,
  allianceJoinRequestSchema,
} from '../../../shared/schemas/recruit'

interface ValidatedBodySuccess<T> {
  success: true
  data: T
}

interface ValidatedBodyFailure {
  success: false
  responseBody: {
    error: string
    details?: unknown
  }
}

type ValidatedBodyResult<T> = ValidatedBodySuccess<T> | ValidatedBodyFailure

const armyCreateRequestSchema = z.object({
  aiPlayerId: z.string().trim().min(1),
  tileId: z.string().trim().min(1),
})

export async function parseRecruitRequestBody(
  req: IncomingMessage,
): Promise<ValidatedBodyResult<(typeof recruitRequestSchema)['_output']>> {
  const payload = await readJsonBody(req)
  const parsed = recruitRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      success: false,
      responseBody: { error: 'Invalid recruit payload', details: parsed.error.issues },
    }
  }
  return { success: true, data: parsed.data }
}

export async function parseStarUpgradeRequestBody(
  req: IncomingMessage,
): Promise<ValidatedBodyResult<(typeof starUpgradeRequestSchema)['_output']>> {
  const payload = await readJsonBody(req)
  const parsed = starUpgradeRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      success: false,
      responseBody: { error: 'Invalid star upgrade payload', details: parsed.error.issues },
    }
  }
  return { success: true, data: parsed.data }
}

export async function parseStarAllocateRequestBody(
  req: IncomingMessage,
): Promise<ValidatedBodyResult<(typeof starAttributeAllocationSchema)['_output']>> {
  const payload = await readJsonBody(req)
  const parsed = starAttributeAllocationSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      success: false,
      responseBody: { error: 'Invalid attribute allocation payload', details: parsed.error.issues },
    }
  }
  return { success: true, data: parsed.data }
}

export async function parseArmyComposeRequestBody(
  req: IncomingMessage,
): Promise<ValidatedBodyResult<(typeof armyComposeRequestSchema)['_output']>> {
  const payload = await readJsonBody(req)
  const parsed = armyComposeRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      success: false,
      responseBody: { error: 'Invalid army compose payload', details: parsed.error.issues },
    }
  }
  return { success: true, data: parsed.data }
}

export async function parseArmyCreateRequestBody(
  req: IncomingMessage,
): Promise<ValidatedBodyResult<{ aiPlayerId: string; tileId: string }>> {
  const payload = await readJsonBody(req)
  const parsed = armyCreateRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      success: false,
      responseBody: { error: 'Invalid army create payload', details: parsed.error.issues },
    }
  }
  return { success: true, data: parsed.data }
}

export async function parseAllianceCreateRequestBody(
  req: IncomingMessage,
): Promise<ValidatedBodyResult<(typeof allianceCreateRequestSchema)['_output']>> {
  const payload = await readJsonBody(req)
  const parsed = allianceCreateRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      success: false,
      responseBody: { error: 'Invalid alliance create payload', details: parsed.error.issues },
    }
  }
  return { success: true, data: parsed.data }
}

export async function parseAllianceJoinRequestBody(
  req: IncomingMessage,
): Promise<ValidatedBodyResult<(typeof allianceJoinRequestSchema)['_output']>> {
  const payload = await readJsonBody(req)
  const parsed = allianceJoinRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      success: false,
      responseBody: { error: 'Invalid join payload', details: parsed.error.issues },
    }
  }
  return { success: true, data: parsed.data }
}
