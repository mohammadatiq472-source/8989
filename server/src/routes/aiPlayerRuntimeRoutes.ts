import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  getGovernedAiPlayerRuntime,
  listAiPlayerActionCatalog,
  listAiPlayerActionReceipts,
  listGovernedAiPlayers,
  pauseGovernedAiPlayer,
  registerGovernedAiPlayer,
  resumeGovernedAiPlayer,
} from '../application/ai/AIPlayerGovernanceService'
import {
  createGovernedAiPlayerRequestSchema,
  updateGovernedAiPlayerStatusRequestSchema,
} from '../../../shared/schemas/aiPlayer'
import { writeJson } from './http'
import { parseBody, parseBooleanFlag, parseOptionalLimit } from './aiPlayerRouteShared'

async function handleRegisterRoute(req: IncomingMessage, res: ServerResponse) {
  const parsed = await parseBody(req, createGovernedAiPlayerRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = registerGovernedAiPlayer(parsed.data)
  if (result.error) {
    writeJson(res, result.error.startsWith('ai player already exists') ? 409 : 400, {
      ok: false,
      error: result.error,
    })
    return
  }

  writeJson(res, 200, {
    ok: true,
    player: result.player,
  })
}

function handleListPlayersRoute(_req: IncomingMessage, res: ServerResponse, url: URL) {
  const governorPlayerId = url.searchParams.get('governorPlayerId')?.trim() || undefined
  const factionId = url.searchParams.get('factionId')?.trim() || undefined
  const includeDisabled = parseBooleanFlag(url.searchParams.get('includeDisabled'))
  const items = listGovernedAiPlayers({
    governorPlayerId,
    factionId,
    includeDisabled,
  })

  writeJson(res, 200, {
    items,
    count: items.length,
  })
}

function handleGetPlayerRoute(_req: IncomingMessage, res: ServerResponse, aiPlayerId: string) {
  const player = getGovernedAiPlayerRuntime(aiPlayerId)
  if (!player) {
    writeJson(res, 404, { ok: false, error: `ai player not found: ${aiPlayerId}` })
    return
  }

  writeJson(res, 200, player)
}

async function handlePauseRoute(req: IncomingMessage, res: ServerResponse, aiPlayerId: string) {
  const parsed = await parseBody(req, updateGovernedAiPlayerStatusRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = pauseGovernedAiPlayer(aiPlayerId, parsed.data.updatedBy)
  if (result.error) {
    writeJson(res, 404, { ok: false, error: result.error })
    return
  }

  writeJson(res, 200, {
    ok: true,
    player: result.player,
  })
}

async function handleResumeRoute(req: IncomingMessage, res: ServerResponse, aiPlayerId: string) {
  const parsed = await parseBody(req, updateGovernedAiPlayerStatusRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = resumeGovernedAiPlayer(aiPlayerId, parsed.data.updatedBy)
  if (result.error) {
    writeJson(res, 404, { ok: false, error: result.error })
    return
  }

  writeJson(res, 200, {
    ok: true,
    player: result.player,
  })
}

function handleReceiptsRoute(_req: IncomingMessage, res: ServerResponse, aiPlayerId: string, url: URL) {
  const player = getGovernedAiPlayerRuntime(aiPlayerId)
  if (!player) {
    writeJson(res, 404, { ok: false, error: `ai player not found: ${aiPlayerId}` })
    return
  }

  const limit = parseOptionalLimit(url.searchParams.get('limit'))
  const items = listAiPlayerActionReceipts(aiPlayerId, limit)
  writeJson(res, 200, {
    items,
    count: items.length,
  })
}

export async function dispatchAiPlayerRuntimeRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
): Promise<boolean> {
  if (req.method === 'GET' && pathname === '/api/ai/player-actions/catalog') {
    writeJson(res, 200, {
      catalog: listAiPlayerActionCatalog(),
    })
    return true
  }

  if (req.method === 'POST' && pathname === '/api/ai/players') {
    await handleRegisterRoute(req, res)
    return true
  }

  if (req.method === 'GET' && pathname === '/api/ai/players') {
    handleListPlayersRoute(req, res, url)
    return true
  }

  if (!pathname.startsWith('/api/ai/players/')) {
    return false
  }

  const suffix = pathname.slice('/api/ai/players/'.length)
  const [aiPlayerId, operation] = suffix.split('/')
  if (!aiPlayerId) {
    writeJson(res, 400, { ok: false, error: 'aiPlayerId required.' })
    return true
  }

  if (req.method === 'GET' && !operation) {
    handleGetPlayerRoute(req, res, aiPlayerId)
    return true
  }
  if (req.method === 'POST' && operation === 'pause') {
    await handlePauseRoute(req, res, aiPlayerId)
    return true
  }
  if (req.method === 'POST' && operation === 'resume') {
    await handleResumeRoute(req, res, aiPlayerId)
    return true
  }
  if (req.method === 'GET' && operation === 'receipts') {
    handleReceiptsRoute(req, res, aiPlayerId, url)
    return true
  }

  return false
}
