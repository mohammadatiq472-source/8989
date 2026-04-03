import type { IncomingMessage, ServerResponse } from 'node:http'
import { planningRequestSchema } from '../../../shared/schemas/planning'
import { createPlanningResult } from '../application/planning/PlanningService'
import { getWorldSnapshot } from '../application/world/WorldService'
import { isHttpBodyError, readJsonBody, writeJson } from './http'

export async function handlePlanningRoute(req: IncomingMessage, res: ServerResponse) {
  try {
    const payload = await readJsonBody(req)
    const parsed = planningRequestSchema.safeParse(payload)

    if (!parsed.success) {
      writeJson(res, 400, {
        error: 'Invalid planning payload.',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
      return
    }

    const result = await createPlanningResult(
      getWorldSnapshot().world,
      parsed.data.strategicCommand,
      parsed.data.config,
    )

    writeJson(res, 200, result)
  } catch (error) {
    if (isHttpBodyError(error)) {
      writeJson(res, error.statusCode, { error: error.message })
      return
    }

    const message = error instanceof Error ? error.message : 'Unknown server error.'
    writeJson(res, 500, { error: message })
  }
}
