import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  clearFactionConfig,
  getFactionConfig,
  getFactionDoctrine,
  setFactionDoctrine,
  setFactionModelConfig,
} from '../application/faction/FactionConfigStore'
import { readJsonBody, writeJson } from './http'

function sanitizeFactionId(raw: string): string | null {
  return /^[a-z0-9_-]{1,40}$/.test(raw) ? raw : null
}

function extractFactionId(pathname: string, prefix: string): string | null {
  const rest = pathname.slice(prefix.length)
  const factionId = rest.split('/')[0]
  return sanitizeFactionId(factionId)
}

export async function dispatchFactionConfigRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const PREFIX = '/api/faction/'
  if (!pathname.startsWith(PREFIX)) {
    return false
  }

  const factionId = extractFactionId(pathname, PREFIX)
  if (!factionId) {
    writeJson(res, 400, { error: 'Invalid factionId' })
    return true
  }

  const subPath = pathname.slice(PREFIX.length + factionId.length)

  if (req.method === 'GET' && subPath === '/config') {
    const config = getFactionConfig(factionId)
    const doctrine = getFactionDoctrine(factionId)
    const modelConfig = config?.modelConfig
    writeJson(res, 200, {
      factionId,
      doctrine,
      modelConfig: modelConfig
        ? {
            model: modelConfig.model,
            hasApiKey: Boolean(modelConfig.apiKey),
              baseUrl: modelConfig.baseUrl,
              commanderModel: modelConfig.commanderModel,
              generalModel: modelConfig.generalModel,
              unitModel: modelConfig.unitModel,
            }
        : null,
      updatedAt: config?.updatedAt ?? null,
    })
    return true
  }

  if (req.method === 'POST' && subPath === '/doctrine') {
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const doctrine = typeof body.doctrine === 'string' ? body.doctrine.trim() : ''
    if (!doctrine) {
      writeJson(res, 400, { error: 'doctrine is required (string)' })
      return true
    }

    setFactionDoctrine(factionId, doctrine)
    console.log(`[FactionConfig] faction=${factionId} doctrine updated (${doctrine.length} chars)`)
    writeJson(res, 200, {
      ok: true,
      factionId,
      doctrine: doctrine.slice(0, 100) + (doctrine.length > 100 ? '...' : ''),
    })
    return true
  }

  if (req.method === 'POST' && subPath === '/model-config') {
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const model = typeof body.model === 'string' ? body.model.trim() : ''
    if (!model) {
      writeJson(res, 400, { error: 'model is required (string, e.g. "gemini-2.0-flash:free")' })
      return true
    }

    setFactionModelConfig(factionId, {
      model,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey.trim() : undefined,
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl.trim() : undefined,
      commanderModel: typeof body.commanderModel === 'string' ? body.commanderModel.trim() : undefined,
      generalModel: typeof body.generalModel === 'string' ? body.generalModel.trim() : undefined,
      unitModel: typeof body.unitModel === 'string' ? body.unitModel.trim() : undefined,
    })

    console.log(`[FactionConfig] faction=${factionId} model-config updated: model=${model} hasKey=${Boolean(body.apiKey)}`)
    writeJson(res, 200, { ok: true, factionId, model })
    return true
  }

  if (req.method === 'DELETE' && subPath === '/config') {
    clearFactionConfig(factionId)
    console.log(`[FactionConfig] faction=${factionId} config cleared`)
    writeJson(res, 200, { ok: true, factionId })
    return true
  }

  return false
}
