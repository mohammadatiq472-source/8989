import type { IncomingMessage, ServerResponse } from 'node:http'
import { nationFoundRequestSchema } from '../../../shared/schemas/nation'
import { foundNation, getNationProfiles } from '../application/nation/NationService'
import { isHttpBodyError, readJsonBody, writeJson } from './http'

export function handleNationProfilesRoute(_req: IncomingMessage, res: ServerResponse) {
  writeJson(res, 200, getNationProfiles())
}

export async function handleNationFoundRoute(req: IncomingMessage, res: ServerResponse) {
  try {
    const payload = await readJsonBody(req)
    const parsed = nationFoundRequestSchema.safeParse(payload)

    if (!parsed.success) {
      writeJson(res, 400, {
        error: 'Invalid nation founding payload.',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
      return
    }

    writeJson(res, 200, foundNation(parsed.data))
  } catch (error) {
    if (isHttpBodyError(error)) {
      writeJson(res, error.statusCode, { error: error.message })
      return
    }

    const message = error instanceof Error ? error.message : 'Failed to found nation.'
    const isClientError =
      message.startsWith('Unsupported factionId') ||
      message.startsWith('Selected capital tile')
    writeJson(res, isClientError ? 400 : 500, { error: message })
  }
}
