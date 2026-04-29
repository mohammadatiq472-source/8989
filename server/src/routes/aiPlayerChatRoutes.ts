import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  getAiPlayerChatReadCursor,
  listAiPlayerChatChannel,
  runAiPlayerChatPatrolScheduler,
  submitAiPlayerChatMessage,
  triggerAiPlayerChatPatrolTick,
  updateAiPlayerChatReadCursor,
} from '../application/ai/aiPlayerChatCommandService'
import {
  aiPlayerChatPatrolTickRequestSchema,
  aiPlayerChatPatrolSchedulerRunRequestSchema,
  aiPlayerChatHistoryFilterSchema,
  sendAiPlayerChatMessageRequestSchema,
  updateAiPlayerChatReadCursorRequestSchema,
} from '../../../shared/schemas/aiPlayerChat'
import { writeJson } from './http'
import { parseBody, parseOptionalLimit } from './aiPlayerRouteShared'

async function handleSendChatMessageRoute(req: IncomingMessage, res: ServerResponse, aiPlayerId: string) {
  const parsed = await parseBody(req, sendAiPlayerChatMessageRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = await submitAiPlayerChatMessage(aiPlayerId, parsed.data)
  if (!result.ok) {
    writeJson(res, result.error?.includes('not found') ? 404 : 409, result)
    return
  }

  writeJson(res, 200, result)
}

async function handlePatrolTickRoute(req: IncomingMessage, res: ServerResponse, aiPlayerId: string) {
  const parsed = await parseBody(req, aiPlayerChatPatrolTickRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = triggerAiPlayerChatPatrolTick(aiPlayerId, parsed.data)
  if (!result.ok) {
    const status = result.error?.includes('not found')
      ? 404
      : result.error === 'patrol_cooldown_active'
        ? 429
        : 400
    writeJson(res, status, result)
    return
  }

  writeJson(res, 200, result)
}

async function handlePatrolSchedulerRunRoute(req: IncomingMessage, res: ServerResponse) {
  const parsed = await parseBody(req, aiPlayerChatPatrolSchedulerRunRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = runAiPlayerChatPatrolScheduler(parsed.data)
  writeJson(res, result.ok ? 200 : 409, result)
}

function handleGetChatRoute(_req: IncomingMessage, res: ServerResponse, aiPlayerId: string, url: URL) {
  const limit = parseOptionalLimit(url.searchParams.get('limit'), 50)
  const readerId = url.searchParams.get('readerId')?.trim() || undefined
  const filterResult = aiPlayerChatHistoryFilterSchema.safeParse(url.searchParams.get('filter')?.trim() || 'all')
  if (!filterResult.success) {
    writeJson(res, 422, { ok: false, error: 'invalid_chat_history_filter' })
    return
  }
  const beforeMessageId = url.searchParams.get('beforeMessageId')?.trim() || undefined
  const result = listAiPlayerChatChannel(aiPlayerId, limit, readerId, filterResult.data, beforeMessageId)
  if ('error' in result) {
    const error = result.error ?? 'chat_channel_failed'
    const status = error.includes('chat message not found')
      ? 409
      : error.includes('not found')
        ? 404
        : 400
    writeJson(res, status, {
      ok: false,
      error,
    })
    return
  }

  writeJson(res, 200, result)
}

function handleGetReadCursorRoute(_req: IncomingMessage, res: ServerResponse, aiPlayerId: string, url: URL) {
  const readerId = url.searchParams.get('readerId')?.trim()
  if (!readerId) {
    writeJson(res, 422, { ok: false, error: 'readerId required' })
    return
  }
  const result = getAiPlayerChatReadCursor(aiPlayerId, readerId)
  if (!result.ok) {
    writeJson(res, result.error?.includes('not found') ? 404 : 400, result)
    return
  }
  writeJson(res, 200, result)
}

async function handleUpdateReadCursorRoute(req: IncomingMessage, res: ServerResponse, aiPlayerId: string) {
  const parsed = await parseBody(req, updateAiPlayerChatReadCursorRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = updateAiPlayerChatReadCursor(aiPlayerId, parsed.data)
  if (!result.ok) {
    const status = result.error?.includes('not found')
      ? 404
      : result.error?.includes('chat message not found')
        ? 409
        : 400
    writeJson(res, status, result)
    return
  }
  writeJson(res, 200, result)
}

export async function dispatchAiPlayerChatRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
): Promise<boolean> {
  if (pathname === '/api/ai/chat/patrol-scheduler/run') {
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return true
    }
    await handlePatrolSchedulerRunRoute(req, res)
    return true
  }

  if (!pathname.startsWith('/api/ai/players/')) {
    return false
  }

  const suffix = pathname.slice('/api/ai/players/'.length)
  const [aiPlayerId, operation, childOperation] = suffix.split('/')
  if (!aiPlayerId || operation !== 'chat') {
    return false
  }

  if (req.method === 'GET' && (!childOperation || childOperation === 'messages')) {
    handleGetChatRoute(req, res, aiPlayerId, url)
    return true
  }

  if (req.method === 'GET' && childOperation === 'read-cursor') {
    handleGetReadCursorRoute(req, res, aiPlayerId, url)
    return true
  }

  if (req.method === 'POST' && childOperation === 'read-cursor') {
    await handleUpdateReadCursorRoute(req, res, aiPlayerId)
    return true
  }

  if (req.method === 'POST' && childOperation === 'messages') {
    await handleSendChatMessageRoute(req, res, aiPlayerId)
    return true
  }

  if (req.method === 'POST' && childOperation === 'patrol-tick') {
    await handlePatrolTickRoute(req, res, aiPlayerId)
    return true
  }

  return false
}
