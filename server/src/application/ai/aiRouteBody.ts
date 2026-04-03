import type { IncomingMessage } from 'node:http'
import type { AiConfigUpdateRequest } from '../../../../shared/contracts/game'
import { aiConfigUpdateRequestSchema } from '../../../../shared/schemas/ai'
import { readJsonBody } from '../../routes/http'

export type AiConfigValidationErrorDetail = {
  path: string
  message: string
}

export type AiConfigUpdateBodyValidationResult =
  | { success: true; data: AiConfigUpdateRequest }
  | { success: false; details: AiConfigValidationErrorDetail[] }

export async function parseAiConfigUpdateBody(req: IncomingMessage): Promise<AiConfigUpdateBodyValidationResult> {
  const payload = await readJsonBody(req)
  return validateAiConfigUpdateBody(payload)
}

export function validateAiConfigUpdateBody(payload: unknown): AiConfigUpdateBodyValidationResult {
  const parsed = aiConfigUpdateRequestSchema.safeParse(payload)

  if (!parsed.success) {
    return {
      success: false,
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    }
  }

  return {
    success: true,
    data: parsed.data,
  }
}
