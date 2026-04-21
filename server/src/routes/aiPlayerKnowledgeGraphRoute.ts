import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import {
  buildAiPlayerKnowledgeGraphSnapshot,
  renderAiPlayerKnowledgeGraphObsidian,
} from '../application/ai/AiPlayerKnowledgeGraphService'
import {
  AI_PLAYER_AUTHORITY_RECOMMENDATIONS,
  AI_PLAYER_KNOWLEDGE_GRAPH_FORMATS,
  type AiPlayerKnowledgeGraphQuery,
} from '../../../shared/contracts/aiPlayerKnowledgeGraph'
import { writeJson } from './http'
import { parseBooleanFlag } from './aiPlayerRouteShared'

function handleKnowledgeGraphRoute(_req: IncomingMessage, res: ServerResponse, url: URL) {
  const formatResult = url.searchParams.get('format')?.trim()
    ? z.enum(AI_PLAYER_KNOWLEDGE_GRAPH_FORMATS).safeParse(url.searchParams.get('format')?.trim())
    : { success: true as const, data: 'json' as const }
  if (!formatResult.success) {
    writeJson(res, 422, { ok: false, error: formatResult.error.message })
    return
  }

  const recommendationResult = url.searchParams.get('recommendation')?.trim()
    ? z.enum(AI_PLAYER_AUTHORITY_RECOMMENDATIONS).safeParse(url.searchParams.get('recommendation')?.trim())
    : { success: true as const, data: undefined }
  if (!recommendationResult.success) {
    writeJson(res, 422, { ok: false, error: recommendationResult.error.message })
    return
  }

  const query: AiPlayerKnowledgeGraphQuery = {
    aiAction: (url.searchParams.get('aiAction')?.trim() || undefined) as AiPlayerKnowledgeGraphQuery['aiAction'],
    worldAction: url.searchParams.get('worldAction')?.trim() || undefined,
    recommendation: recommendationResult.data,
    includeCatalog: !url.searchParams.has('includeCatalog') || parseBooleanFlag(url.searchParams.get('includeCatalog')),
  }
  const snapshot = buildAiPlayerKnowledgeGraphSnapshot(query)

  if (formatResult.data === 'obsidian') {
    writeJson(res, 200, {
      ok: true,
      format: 'obsidian',
      snapshot,
      markdown: renderAiPlayerKnowledgeGraphObsidian(snapshot),
    })
    return
  }

  writeJson(res, 200, {
    ok: true,
    format: 'json',
    snapshot,
  })
}

export function dispatchAiPlayerKnowledgeGraphRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
): boolean {
  if (req.method === 'GET' && pathname === '/api/ai/knowledge-graph') {
    handleKnowledgeGraphRoute(req, res, url)
    return true
  }

  return false
}
