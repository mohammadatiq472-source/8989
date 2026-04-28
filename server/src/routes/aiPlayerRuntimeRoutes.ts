import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createAiPlayerActionProposal,
  getGovernedAiPlayerRuntime,
  listAiPlayerActionCatalog,
  listAiPlayerActionReceipts,
  listGovernedAiPlayers,
  pauseGovernedAiPlayer,
  registerGovernedAiPlayer,
  resumeGovernedAiPlayer,
  updateGovernedAiPlayerProfile,
  upsertGovernedAiPlayerContextDocument,
} from '../application/ai/AIPlayerGovernanceService'
import {
  createGovernedAiPlayerRequestSchema,
  updateGovernedAiPlayerProfileRequestSchema,
  updateGovernedAiPlayerStatusRequestSchema,
  upsertAiPlayerContextDocumentRequestSchema,
} from '../../../shared/schemas/aiPlayer'
import { getWorldStateReadonly } from '../application/world/WorldService'
import {
  parseAiPlayerRuntimeProposalJson,
  requestAiPlayerRuntimeProposalFromCandidateTargets,
  toAiPlayerActionProposalRequests,
} from '../application/ai/aiPlayerRuntimeProposalModel'
import {
  clearAiPlayerRuntimeModelFallbackReasonForOwner,
  recordAiPlayerRuntimeModelFallbackFailuresForOwner,
  recordAiPlayerRuntimeModelFallbackReasonForOwner,
  resolveAiPlayerRuntimeModelTargetCandidates,
} from '../application/ai/aiPlayerRuntimeModelTarget'
import {
  commitAiPlayerProviderBudgetReservation,
  recordAiPlayerProviderModelRequestAccounting,
  reserveAiPlayerProviderBudget,
} from '../application/ai/aiPlayerProviderAccountStore'
import { buildAiPlayerBattleReportReadModel } from '../application/ai/aiPlayerBattleReportReadModel'
import { buildAiPlayerDevelopmentPlan } from '../application/ai/aiPlayerDevelopmentPlanReadModel'
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

async function handleProfileRoute(req: IncomingMessage, res: ServerResponse, aiPlayerId: string) {
  const parsed = await parseBody(req, updateGovernedAiPlayerProfileRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = updateGovernedAiPlayerProfile(aiPlayerId, parsed.data)
  if (result.error) {
    writeJson(res, result.error.includes('not found') ? 404 : 400, { ok: false, error: result.error })
    return
  }

  writeJson(res, 200, {
    ok: true,
    player: result.player,
  })
}

async function handleContextDocumentRoute(req: IncomingMessage, res: ServerResponse, aiPlayerId: string) {
  const parsed = await parseBody(req, upsertAiPlayerContextDocumentRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = upsertGovernedAiPlayerContextDocument(aiPlayerId, parsed.data)
  if (result.error) {
    writeJson(res, result.error.includes('not found') ? 404 : 400, { ok: false, error: result.error })
    return
  }

  writeJson(res, 200, {
    ok: true,
    document: result.document,
    player: result.player,
  })
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

function parseTargetDevelopmentPoints(url: URL): number | undefined {
  const raw = url.searchParams.get('goalPower') ?? url.searchParams.get('targetDevelopmentPoints')
  const value = Number(raw ?? Number.NaN)
  if (!Number.isFinite(value)) {
    return undefined
  }
  return Math.max(1, Math.min(100000, Math.trunc(value)))
}

function handleDevelopmentPlanRoute(_req: IncomingMessage, res: ServerResponse, aiPlayerId: string, url: URL) {
  const runtime = getGovernedAiPlayerRuntime(aiPlayerId)
  if (!runtime) {
    writeJson(res, 404, { ok: false, error: `ai player not found: ${aiPlayerId}` })
    return
  }

  writeJson(res, 200, buildAiPlayerDevelopmentPlan(runtime, {
    targetDevelopmentPoints: parseTargetDevelopmentPoints(url),
  }))
}

function handleBattleReportsRoute(_req: IncomingMessage, res: ServerResponse, aiPlayerId: string, url: URL) {
  const runtime = getGovernedAiPlayerRuntime(aiPlayerId)
  if (!runtime) {
    writeJson(res, 404, { ok: false, error: `ai player not found: ${aiPlayerId}` })
    return
  }

  writeJson(res, 200, buildAiPlayerBattleReportReadModel(
    runtime,
    parseOptionalLimit(url.searchParams.get('limit'), 8),
  ))
}

function buildAiPlayerModelObservation(aiPlayerId: string, runtime: NonNullable<ReturnType<typeof getGovernedAiPlayerRuntime>>) {
  const world = getWorldStateReadonly()
  const faction = world.factions[runtime.factionId]
  const developmentPlan = buildAiPlayerDevelopmentPlan(runtime)
  const factionUnits = world.units
    .filter((unit) => unit.faction === runtime.factionId)
    .slice(0, 12)
    .map((unit) => ({
      id: unit.id,
      tileId: unit.tileId,
      status: unit.status,
      strength: unit.strength,
      supply: unit.supply,
      heroId: unit.hero.id,
      heroName: unit.hero.name,
    }))

  return {
    aiPlayerId,
    runtime,
    world: {
      tick: world.tick,
      worldVersion: world.worldVersion,
      faction: faction
        ? {
            id: faction.id,
            actionPoints: faction.actionPoints,
            food: faction.food,
            wood: faction.wood ?? 0,
            stone: faction.stone ?? 0,
            iron: faction.iron ?? 0,
            aiResourceAccounts: faction.aiResourceAccounts ?? {},
            governorResourceInboxes: faction.governorResourceInboxes ?? {},
            aiResourceTransferQuotaByAiPlayer: faction.aiResourceTransferQuotaByAiPlayer ?? {},
            aiResourceTransferPolicy: faction.aiResourceTransferPolicy ?? null,
          }
        : null,
      units: factionUnits,
    },
    developmentPlan,
    receipts: runtime.latestReceipt ? [runtime.latestReceipt] : [],
    failures: runtime.observability.recentFailures?.samples ?? [],
  }
}

function resolveProviderLabel(baseUrl: string) {
  try {
    return new URL(baseUrl).host || 'relay'
  } catch {
    return 'relay'
  }
}

function resolveModelProposalErrorStatus(error: string) {
  if (error === 'provider_budget_gate_unavailable') {
    return 503
  }
  if (error.startsWith('provider_budget_')) {
    return 429
  }
  return error === 'missing_model_api_key' ? 400 : 502
}

async function buildAiPlayerModelProposalRequests(aiPlayerId: string, runtime: NonNullable<ReturnType<typeof getGovernedAiPlayerRuntime>>) {
  const observation = buildAiPlayerModelObservation(aiPlayerId, runtime)
  const testMockOutput = process.env.NODE_ENV === 'test'
    ? process.env.AI_PLAYER_RUNTIME_MODEL_MOCK_OUTPUT?.trim()
    : ''
  if (testMockOutput) {
    const output = parseAiPlayerRuntimeProposalJson(testMockOutput)
    return {
      ok: true as const,
      output,
      proposalRequests: toAiPlayerActionProposalRequests(aiPlayerId, output),
      model: 'mock:test',
      providerFallbackFailures: [],
    }
  }

  const candidates = resolveAiPlayerRuntimeModelTargetCandidates({
    factionId: runtime.factionId,
    ownerPlayerId: runtime.governorPlayerId,
  })
  return await requestAiPlayerRuntimeProposalFromCandidateTargets({
    candidates,
    observation,
    reserveCandidateAttempt: (candidate) => reserveAiPlayerProviderBudget({
      aiPlayerId: runtime.aiPlayerId,
      factionId: runtime.factionId,
      governorPlayerId: runtime.governorPlayerId,
      model: candidate.target.model,
      provider: resolveProviderLabel(candidate.target.baseUrl),
      source: candidate.source,
      byokSource: candidate.byokSource,
    }),
    commitCandidateAttempt: async (_candidate, result, reservation) => {
      await commitAiPlayerProviderBudgetReservation(reservation?.reservationId, {
        ok: result.ok,
        usage: result.ok ? result.usage : undefined,
        error: result.ok ? undefined : result.error,
      })
    },
  })
}

async function handleModelProposalsRoute(_req: IncomingMessage, res: ServerResponse, aiPlayerId: string) {
  const runtime = getGovernedAiPlayerRuntime(aiPlayerId)
  if (!runtime) {
    writeJson(res, 404, { ok: false, error: `ai player not found: ${aiPlayerId}` })
    return
  }

  let modelResult: Awaited<ReturnType<typeof buildAiPlayerModelProposalRequests>>
  try {
    modelResult = await buildAiPlayerModelProposalRequests(aiPlayerId, runtime)
  } catch {
    recordAiPlayerRuntimeModelFallbackReasonForOwner(
      runtime.factionId,
      'model_proposal_request_failed',
      runtime.governorPlayerId,
    )
    recordAiPlayerProviderModelRequestAccounting({
      ok: false,
      aiPlayerId: runtime.aiPlayerId,
      factionId: runtime.factionId,
      governorPlayerId: runtime.governorPlayerId,
      error: 'model_proposal_request_failed',
    })
    writeJson(res, 502, { ok: false, error: 'model_proposal_request_failed' })
    return
  }

  if (!modelResult.ok) {
    if (modelResult.providerFallbackFailures?.length) {
      recordAiPlayerRuntimeModelFallbackFailuresForOwner(
        runtime.factionId,
        modelResult.providerFallbackFailures,
        runtime.governorPlayerId,
      )
    } else {
      recordAiPlayerRuntimeModelFallbackReasonForOwner(runtime.factionId, modelResult.error, runtime.governorPlayerId)
    }
    recordAiPlayerProviderModelRequestAccounting({
      ok: false,
      aiPlayerId: runtime.aiPlayerId,
      factionId: runtime.factionId,
      governorPlayerId: runtime.governorPlayerId,
      providerFallbackFailures: modelResult.providerFallbackFailures ?? [],
      error: modelResult.error,
    })
    writeJson(res, resolveModelProposalErrorStatus(modelResult.error), {
      ok: false,
      error: modelResult.error,
      providerFallbackFailures: modelResult.providerFallbackFailures ?? [],
    })
    return
  }
  if (modelResult.providerFallbackFailures?.length) {
    recordAiPlayerRuntimeModelFallbackFailuresForOwner(
      runtime.factionId,
      modelResult.providerFallbackFailures,
      runtime.governorPlayerId,
    )
  } else {
    clearAiPlayerRuntimeModelFallbackReasonForOwner(runtime.factionId, runtime.governorPlayerId)
  }
  const providerRequestId = recordAiPlayerProviderModelRequestAccounting({
    ok: true,
    aiPlayerId: runtime.aiPlayerId,
    factionId: runtime.factionId,
    governorPlayerId: runtime.governorPlayerId,
    selectedProvider: modelResult.selectedProvider ?? null,
    providerFallbackFailures: modelResult.providerFallbackFailures ?? [],
    usage: modelResult.usage,
    budgetWindowKey: modelResult.budgetWindowKey,
    budgetReservationId: modelResult.budgetReservationId,
  })

  const proposals = []
  const rejected = []
  for (const proposalRequest of modelResult.proposalRequests) {
    const created = createAiPlayerActionProposal(proposalRequest)
    if (created.error) {
      rejected.push({
        action: proposalRequest.action,
        error: created.error,
      })
      continue
    }
    proposals.push(created.proposal)
  }

  writeJson(res, rejected.length === 0 ? 200 : 409, {
    ok: rejected.length === 0,
    model: modelResult.model,
    output: modelResult.output,
    proposals,
    proposalCount: proposals.length,
    rejected,
    rejectedCount: rejected.length,
    providerFallback: {
      requestId: providerRequestId,
      selectedProvider: modelResult.selectedProvider ?? null,
      failureCount: modelResult.providerFallbackFailures?.length ?? 0,
      failures: modelResult.providerFallbackFailures ?? [],
    },
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
  if (req.method === 'POST' && operation === 'model-proposals') {
    await handleModelProposalsRoute(req, res, aiPlayerId)
    return true
  }
  if (req.method === 'GET' && operation === 'development-plan') {
    handleDevelopmentPlanRoute(req, res, aiPlayerId, url)
    return true
  }
  if (req.method === 'GET' && operation === 'battle-reports') {
    handleBattleReportsRoute(req, res, aiPlayerId, url)
    return true
  }
  if (req.method === 'POST' && operation === 'profile') {
    await handleProfileRoute(req, res, aiPlayerId)
    return true
  }
  if (req.method === 'POST' && operation === 'context-documents') {
    await handleContextDocumentRoute(req, res, aiPlayerId)
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
