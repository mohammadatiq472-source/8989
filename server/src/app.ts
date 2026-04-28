import './bootstrap/loadEnv'
import type { Server as HttpServer, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { handlePlanningRoute } from './routes/planning'
import { handleMapOverviewRoute } from './routes/map'
import { handleAiConfigGetRoute, handleAiConfigSaveRoute, handleAiLogsRoute, handleAiModelsRoute } from './routes/ai'
import {
  handleAiRuntimeObservabilityRoute,
  handleNarrativeEventsRoute,
  handleNationalAgendaRoute,
  handleCourtSessionRoute,
  handleCivilMemoryRoute,
  handleSaveSlotLoadRoute,
  handleSaveSlotArchiveRestoreApplyRoute,
  handleSaveSlotArchiveRestoreDrillRoute,
  handleSaveSlotArchiveRestoreRollbackDrillRoute,
  handleSaveSlotFixturePrimeRoute,
  handleSaveSlotSaveRoute,
  handleSaveSlotsArchiveRoute,
  handleSaveSlotsRoute,
  handleWorldEventsRoute,
  handleWorldEventsStreamRoute,
} from './routes/observability'
import {
  handleReplayArchiveRoute,
  handleReplayEntryRoute,
  handleReplayRagCacheStatsRoute,
} from './routes/replay'
import { handleNationFoundRoute, handleNationProfilesRoute } from './routes/nation'
import { dispatchGeneralChatRoutes } from './routes/generalChat'
import { dispatchDiplomacyRoutes } from './routes/diplomacy'
import { dispatchAiPlayerRoutes } from './routes/aiPlayer'
import { dispatchInboxRoutes } from './routes/inbox'
import { dispatchSessionRoutes } from './routes/session'
import { dispatchV2Routes } from './routes/v2game'
import { isHttpBodyError, writeJson } from './routes/http'
import { dispatchFactionConfigRoutes } from './routes/factionConfigRoutes'
import { handleWorldActionRoute, handleWorldMapLayoutRoute, handleWorldSummaryRoute } from './routes/world'
import { flushAiHubConfigPersist, getAiHubConfigPersistHealth } from './application/ai/AiConfigService'
import { flushAiPlayerGovernancePersist, getAiPlayerGovernancePersistHealth } from './application/ai/AIPlayerGovernanceService'
import { startAiPlayerChatPatrolScheduler, stopAiPlayerChatPatrolScheduler } from './application/ai/aiPlayerChatCommandService'
import { flushAiPlayerProviderAccountStorePersist, getAiPlayerProviderAccountStoreHealth } from './application/ai/aiPlayerProviderAccountStore'
import { flushFactionConfigPersist, getFactionConfigPersistHealth } from './application/faction/FactionConfigStore'
import { flushV2GamePersist, getV2GamePersistHealth } from './application/v2/V2GameService'
import {
  flushWorldPersist,
  flushNarrativePersist,
  flushGovernancePersist,
  flushSaveSlotsPersist,
  createWorldDeltaSnapshot,
  getSaveSlotsPersistHealth,
  getWorldStateReadonly,
  getWorldStatePersistHealth,
} from './application/world/WorldService'
import { attachWebSocket, broadcastTickDelta } from './ws/GameWebSocket'
import { createWorldStore } from './infra/store/RedisWorldStore'
import { gameClock } from './application/clock/GameClock'
import { runtimeConfig } from './runtime/runtimeConfig'
import { flushNegotiationInboxPersist } from './agents/general/GeneralNegotiationChannel'
import { flushSessionPersist, getSessionPersistHealth } from './multiplayer/SessionManager'

const { host, port, allowFullMapLayout, gameClockEnabled } = runtimeConfig
const aiPlayerChatPatrolSchedulerEnabled = readBooleanEnv('AI_PLAYER_CHAT_PATROL_SCHEDULER_ENABLED', false)

const MAX_WORLD_SUMMARY_HISTORY_LIMIT = 500
const MAX_WORLD_REPLAY_LIMIT = 500
const MAX_WORLD_REPLAY_FRAME_LIMIT = 1000
const MAX_AI_LOGS_LIMIT = 200

type PersistenceSeverity = 'high' | 'medium' | 'low'

type PersistenceAlert = {
  severity: PersistenceSeverity
  source: 'factionConfig' | 'aiConfig' | 'aiPlayerGovernance' | 'aiPlayerProviderAccounts' | 'v2Game' | 'session' | 'saveSlots'
  code: string
  message: string
}

function buildPersistenceSnapshot() {
  const worldState = getWorldStatePersistHealth()
  const factionConfig = getFactionConfigPersistHealth()
  const aiConfig = getAiHubConfigPersistHealth()
  const aiPlayerGovernance = getAiPlayerGovernancePersistHealth()
  const aiPlayerProviderAccounts = getAiPlayerProviderAccountStoreHealth()
  const v2Game = getV2GamePersistHealth()
  const session = getSessionPersistHealth()
  const saveSlots = getSaveSlotsPersistHealth()
  const alerts = buildPersistenceAlerts({
    factionConfig,
    aiConfig,
    aiPlayerGovernance,
    aiPlayerProviderAccounts,
    v2Game,
    session,
    saveSlots,
  })

  return {
    worldState,
    factionConfig,
    aiConfig,
    aiPlayerGovernance,
    aiPlayerProviderAccounts,
    v2Game,
    session,
    saveSlots,
    alerts,
  }
}

function buildPersistenceAlerts(input: {
  factionConfig: ReturnType<typeof getFactionConfigPersistHealth>
  aiConfig: ReturnType<typeof getAiHubConfigPersistHealth>
  aiPlayerGovernance: ReturnType<typeof getAiPlayerGovernancePersistHealth>
  aiPlayerProviderAccounts: ReturnType<typeof getAiPlayerProviderAccountStoreHealth>
  v2Game: ReturnType<typeof getV2GamePersistHealth>
  session: ReturnType<typeof getSessionPersistHealth>
  saveSlots: ReturnType<typeof getSaveSlotsPersistHealth>
}): PersistenceAlert[] {
  const alerts: PersistenceAlert[] = []

  if (input.factionConfig.security.secretPersistMode === 'memory_only') {
    alerts.push({
      severity: 'high',
      source: 'factionConfig',
      code: 'missing_encryption_key',
      message:
        'BYOK apiKey persistence is disabled because FACTION_APIKEY_ENCRYPTION_KEY is missing and plaintext persist is off.',
    })
  }

  if (input.factionConfig.security.allowPlaintextPersist) {
    alerts.push({
      severity: 'medium',
      source: 'factionConfig',
      code: 'plaintext_persist_enabled',
      message: 'FACTION_APIKEY_ALLOW_PLAINTEXT_PERSIST is enabled; BYOK apiKey may be persisted in plaintext.',
    })
  }

  if (input.aiPlayerProviderAccounts.security.secretPersistMode === 'memory_only') {
    alerts.push({
      severity: 'high',
      source: 'aiPlayerProviderAccounts',
      code: 'missing_encryption_key',
      message:
        'Player-level BYOK apiKey persistence is disabled because FACTION_APIKEY_ENCRYPTION_KEY is missing and plaintext persist is off.',
    })
  }

  if (input.aiPlayerProviderAccounts.security.allowPlaintextPersist) {
    alerts.push({
      severity: 'medium',
      source: 'aiPlayerProviderAccounts',
      code: 'plaintext_persist_enabled',
      message: 'FACTION_APIKEY_ALLOW_PLAINTEXT_PERSIST is enabled; player-level BYOK apiKey may be persisted in plaintext.',
    })
  }

  const persistFailureRules: Array<{
    source: PersistenceAlert['source']
    failureCount: number
  }> = [
    { source: 'factionConfig', failureCount: input.factionConfig.persistFailureCount },
    { source: 'aiConfig', failureCount: input.aiConfig.persistFailureCount },
    { source: 'aiPlayerGovernance', failureCount: input.aiPlayerGovernance.persistFailureCount },
    { source: 'aiPlayerProviderAccounts', failureCount: input.aiPlayerProviderAccounts.persistFailureCount },
    { source: 'v2Game', failureCount: input.v2Game.persistFailureCount },
    { source: 'session', failureCount: input.session.persistFailureCount },
    { source: 'saveSlots', failureCount: input.saveSlots.persistFailureCount },
  ]

  for (const rule of persistFailureRules) {
    if (rule.failureCount <= 0) {
      continue
    }

    alerts.push({
      severity: rule.failureCount >= 5 ? 'high' : 'medium',
      source: rule.source,
      code: 'persist_failures',
      message: `Detected ${rule.failureCount} persistence write failures for ${rule.source}.`,
    })
  }

  const quarantineRules: Array<{
    source: PersistenceAlert['source']
    quarantineCount: number
  }> = [
    { source: 'factionConfig', quarantineCount: input.factionConfig.corruptQuarantineCount },
    { source: 'aiConfig', quarantineCount: input.aiConfig.corruptQuarantineCount },
    { source: 'aiPlayerGovernance', quarantineCount: input.aiPlayerGovernance.corruptQuarantineCount },
    { source: 'aiPlayerProviderAccounts', quarantineCount: input.aiPlayerProviderAccounts.corruptQuarantineCount },
    { source: 'v2Game', quarantineCount: input.v2Game.corruptQuarantineCount },
    { source: 'session', quarantineCount: input.session.corruptQuarantineCount },
    { source: 'saveSlots', quarantineCount: input.saveSlots.corruptQuarantineCount },
  ]

  for (const rule of quarantineRules) {
    if (rule.quarantineCount <= 0) {
      continue
    }

    alerts.push({
      severity: rule.quarantineCount >= 3 ? 'high' : 'medium',
      source: rule.source,
      code: rule.quarantineCount >= 3 ? 'quarantine_surge' : 'quarantine_detected',
      message: `Detected ${rule.quarantineCount} corrupt-store quarantine events for ${rule.source}.`,
    })
  }

  const saveSlotsFileSizeBytes = input.saveSlots.fileSizeBytes
  if (input.saveSlots.fileSizeLevel === 'hard' && typeof saveSlotsFileSizeBytes === 'number') {
    alerts.push({
      severity: 'high',
      source: 'saveSlots',
      code: 'save_slots_oversize_hard',
      message: `Save-slot store size ${saveSlotsFileSizeBytes} bytes reached hard limit ${input.saveSlots.hardLimitBytes} bytes.`,
    })
  } else if (input.saveSlots.fileSizeLevel === 'soft' && typeof saveSlotsFileSizeBytes === 'number') {
    alerts.push({
      severity: 'medium',
      source: 'saveSlots',
      code: 'save_slots_oversize_soft',
      message: `Save-slot store size ${saveSlotsFileSizeBytes} bytes reached soft limit ${input.saveSlots.softLimitBytes} bytes.`,
    })
  }

  if (input.saveSlots.archiveFailureCount > 0) {
    alerts.push({
      severity: input.saveSlots.archiveFailureCount >= 3 ? 'high' : 'medium',
      source: 'saveSlots',
      code: 'save_slots_archive_failures',
      message: `Save-slot archive pipeline has ${input.saveSlots.archiveFailureCount} failures.`,
    })
  }

  if (input.saveSlots.lockContentionCount > 0) {
    alerts.push({
      severity: input.saveSlots.lockContentionCount >= 3 ? 'high' : 'medium',
      source: 'saveSlots',
      code: 'save_slots_lock_contention',
      message: `Save-slot persist lock contention observed ${input.saveSlots.lockContentionCount} times.`,
    })
  }

  if (input.saveSlots.lockFailureCount > 0) {
    alerts.push({
      severity: 'high',
      source: 'saveSlots',
      code: 'save_slots_lock_failures',
      message: `Save-slot persist lock operations failed ${input.saveSlots.lockFailureCount} times.`,
    })
  }

  if (input.saveSlots.restoreDrillFailureCount > 0) {
    alerts.push({
      severity: input.saveSlots.restoreDrillFailureCount >= 3 ? 'high' : 'medium',
      source: 'saveSlots',
      code: 'save_slots_restore_drill_failures',
      message: `Save-slot archive restore drills failed ${input.saveSlots.restoreDrillFailureCount} times.`,
    })
  }

  if (input.saveSlots.restoreApplyFailureCount > 0) {
    alerts.push({
      severity: input.saveSlots.restoreApplyFailureCount >= 3 ? 'high' : 'medium',
      source: 'saveSlots',
      code: 'save_slots_restore_apply_failures',
      message: `Save-slot archive restore apply failed ${input.saveSlots.restoreApplyFailureCount} times.`,
    })
  }

  if (input.saveSlots.restoreRollbackDrillFailureCount > 0) {
    alerts.push({
      severity: input.saveSlots.restoreRollbackDrillFailureCount >= 3 ? 'high' : 'medium',
      source: 'saveSlots',
      code: 'save_slots_restore_rollback_drill_failures',
      message: `Save-slot restore rollback drills failed ${input.saveSlots.restoreRollbackDrillFailureCount} times.`,
    })
  }

  return alerts
}

function logPersistenceStartupAlerts(snapshot: ReturnType<typeof buildPersistenceSnapshot>) {
  if (snapshot.alerts.length === 0) {
    console.log('[startup-check] persistence health: ok')
    return
  }

  for (const alert of snapshot.alerts) {
    const line = `[startup-check][persistence][${alert.severity.toUpperCase()}][${alert.source}][${alert.code}] ${alert.message}`
    if (alert.severity === 'high') {
      console.error(line)
      continue
    }
    console.warn(line)
  }
}

const server = createServer(async (req, res) => {
  try {
  applyCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`)

  if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
    const world = getWorldStateReadonly()
    const persistence = buildPersistenceSnapshot()
    writeJson(res, 200, {
      ok: true,
      service: 'slg-backend',
      now: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      runtime: {
        host,
        port,
        gameClockEnabled,
      },
      world: {
        tick: world.tick,
        worldVersion: world.worldVersion,
        factionCount: Object.keys(world.factions).length,
        unitCount: world.units.length,
        reportCount: world.reports.length,
      },
      persistence,
    })
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/world') {
    const sinceWorldVersionRaw = requestUrl.searchParams.get('sinceWorldVersion')
    const parsedSinceWorldVersion = sinceWorldVersionRaw ? Number(sinceWorldVersionRaw) : Number.NaN
    const sinceWorldVersion = Number.isFinite(parsedSinceWorldVersion)
      ? Math.max(0, Math.floor(parsedSinceWorldVersion))
      : undefined

    const planningHistoryLimitRaw = requestUrl.searchParams.get('planningHistoryLimit')
    const parsedPlanningHistoryLimit = planningHistoryLimitRaw ? Number(planningHistoryLimitRaw) : Number.NaN
    const planningHistoryLimit = Number.isFinite(parsedPlanningHistoryLimit)
      ? Math.max(1, Math.min(MAX_WORLD_SUMMARY_HISTORY_LIMIT, Math.floor(parsedPlanningHistoryLimit)))
      : undefined

    const replayLimitRaw = requestUrl.searchParams.get('replayLimit')
    const parsedReplayLimit = replayLimitRaw ? Number(replayLimitRaw) : Number.NaN
    const replayLimit = Number.isFinite(parsedReplayLimit)
      ? Math.max(1, Math.min(MAX_WORLD_REPLAY_LIMIT, Math.floor(parsedReplayLimit)))
      : undefined

    const replayFrameLimitRaw = requestUrl.searchParams.get('replayFrameLimit')
    const parsedReplayFrameLimit = replayFrameLimitRaw ? Number(replayFrameLimitRaw) : Number.NaN
    const replayFrameLimit = Number.isFinite(parsedReplayFrameLimit)
      ? Math.max(1, Math.min(MAX_WORLD_REPLAY_FRAME_LIMIT, Math.floor(parsedReplayFrameLimit)))
      : undefined

    const intelMode = requestUrl.searchParams.get('intelMode') === 'full' ? 'full' : 'sparse'

    handleWorldSummaryRoute(req, res, {
      sinceWorldVersion,
      planningHistoryLimit,
      replayLimit,
      replayFrameLimit,
      intelMode,
    })
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/world/map-layout') {
    const scopeRaw = requestUrl.searchParams.get('scope')
    if (scopeRaw === 'full' && !allowFullMapLayout) {
      writeJson(res, 403, {
        error: 'scope=full is disabled on this server. Set ENABLE_FULL_MAP_LAYOUT=1 to enable debug export.',
      })
      return
    }

    const scope =
      scopeRaw === 'bootstrap' ||
      scopeRaw === 'province' ||
      scopeRaw === 'region' ||
      scopeRaw === 'full' ||
      scopeRaw === 'viewport'
        ? scopeRaw
        : 'bootstrap'

    const provinceId = requestUrl.searchParams.get('provinceId')?.trim() || undefined
    const regionId = requestUrl.searchParams.get('regionId')?.trim() || undefined

    const centerXRaw = requestUrl.searchParams.get('centerX')
    const parsedCenterX = centerXRaw ? Number(centerXRaw) : Number.NaN
    const centerX = Number.isFinite(parsedCenterX) ? Math.floor(parsedCenterX) : undefined

    const centerYRaw = requestUrl.searchParams.get('centerY')
    const parsedCenterY = centerYRaw ? Number(centerYRaw) : Number.NaN
    const centerY = Number.isFinite(parsedCenterY) ? Math.floor(parsedCenterY) : undefined

    const layerRaw = requestUrl.searchParams.get('layer')
    const layer =
      layerRaw === 'nation' || layerRaw === 'province' || layerRaw === 'region' || layerRaw === 'tile'
        ? layerRaw
        : undefined

    handleWorldMapLayoutRoute(req, res, {
      scope,
      provinceId,
      regionId,
      centerX,
      centerY,
      layer,
    })
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/world/action') {
    const includeWorldRaw = requestUrl.searchParams.get('includeWorld')?.toLowerCase()
    const includeWorld =
      includeWorldRaw === '1' ||
      includeWorldRaw === 'true' ||
      includeWorldRaw === 'yes'

    await handleWorldActionRoute(req, res, {
      includeWorld,
    })
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/planning/create') {
    await handlePlanningRoute(req, res)
    return
  }


  if (req.method === 'GET' && requestUrl.pathname === '/api/ai/models') {
    await handleAiModelsRoute(req, res)
    return
  }

  if (
    requestUrl.pathname === '/api/ai/player-actions/catalog' ||
    requestUrl.pathname === '/api/ai/knowledge-graph' ||
    requestUrl.pathname === '/api/ai/chat/patrol-scheduler/run' ||
    requestUrl.pathname.startsWith('/api/ai/provider') ||
    requestUrl.pathname === '/api/ai/players' ||
    requestUrl.pathname.startsWith('/api/ai/players/')
  ) {
    await dispatchAiPlayerRoutes(req, res, requestUrl.pathname, requestUrl)
    return
  }

  if (await dispatchInboxRoutes(req, res, requestUrl.pathname, requestUrl)) {
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/ai/logs') {
    const parsedLimit = Number(requestUrl.searchParams.get('limit') ?? '20')
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(MAX_AI_LOGS_LIMIT, Math.floor(parsedLimit)))
      : 20
    handleAiLogsRoute(req, res, limit)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/ai/config') {
    handleAiConfigGetRoute(req, res)
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/ai/config') {
    await handleAiConfigSaveRoute(req, res)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/replay/archive') {
    handleReplayArchiveRoute(req, res)
    return
  }


  if (req.method === 'GET' && requestUrl.pathname === '/api/replay/rag-cache') {
    handleReplayRagCacheStatsRoute(req, res)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname.startsWith('/api/replay/')) {
    const requestId = requestUrl.pathname.slice('/api/replay/'.length)
    if (!requestId) {
      writeJson(res, 400, { error: 'requestId is required.' })
      return
    }

    handleReplayEntryRoute(req, res, requestId)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/map/overview') {
    handleMapOverviewRoute(req, res)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/nation/profiles') {
    handleNationProfilesRoute(req, res)
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/nation/found') {
    await handleNationFoundRoute(req, res)
    return
  }


  if (req.method === 'GET' && requestUrl.pathname === '/api/events/stream') {
    handleWorldEventsStreamRoute(req, res)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/events') {
    handleWorldEventsRoute(req, res)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/observability/ai-runtime') {
    handleAiRuntimeObservabilityRoute(req, res)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/narratives') {
    handleNarrativeEventsRoute(req, res)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/comm-bus/national-agenda') {
    handleNationalAgendaRoute(req, res)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/court/session/latest') {
    handleCourtSessionRoute(req, res)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/civil-memory') {
    handleCivilMemoryRoute(req, res)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/save-slots') {
    handleSaveSlotsRoute(req, res)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/save-slots/archive') {
    handleSaveSlotsArchiveRoute(req, res)
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/save-slots/save') {
    await handleSaveSlotSaveRoute(req, res)
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/save-slots/load') {
    await handleSaveSlotLoadRoute(req, res)
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/save-slots/fixture/prime') {
    await handleSaveSlotFixturePrimeRoute(req, res)
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/save-slots/archive/restore-drill') {
    await handleSaveSlotArchiveRestoreDrillRoute(req, res)
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/save-slots/archive/restore') {
    await handleSaveSlotArchiveRestoreApplyRoute(req, res)
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/save-slots/archive/restore-rollback-drill') {
    await handleSaveSlotArchiveRestoreRollbackDrillRoute(req, res)
    return
  }

  if (requestUrl.pathname.startsWith('/api/generals')) {
    await dispatchGeneralChatRoutes(req, res, requestUrl.pathname)
    return
  }

  if (requestUrl.pathname.startsWith('/api/diplomacy')) {
    await dispatchDiplomacyRoutes(req, res, requestUrl.pathname)
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/world/diagnostic/emit-ai-quota-delta') {
    const factionId = requestUrl.searchParams.get('factionId')?.trim() || 'player'
    const world = getWorldStateReadonly()
    const previous = createWorldDeltaSnapshot(world)
    const syntheticCurrent = createWorldDeltaSnapshot(world)
    const targetFaction = previous.factions[factionId]
    const quota = targetFaction?.aiQuota
    if (!targetFaction || !quota) {
      writeJson(res, 404, { error: `unknown faction or aiQuota missing: ${factionId}` })
      return
    }

    const worldQuota = world.factions[factionId]?.aiQuota
    const baselineCurrent = worldQuota?.currentQuota ?? quota.currentQuota
    const maxQuota = worldQuota?.maxQuota ?? quota.maxQuota
    const minQuota = worldQuota?.initialQuota ?? quota.initialQuota

    let nextQuota = baselineCurrent
    if (baselineCurrent < maxQuota) {
      nextQuota = baselineCurrent + 1
    } else if (baselineCurrent > minQuota) {
      nextQuota = baselineCurrent - 1
    }

    quota.currentQuota = baselineCurrent
    const currentFaction = syntheticCurrent.factions[factionId]
    if (currentFaction?.aiQuota) {
      currentFaction.aiQuota.currentQuota = nextQuota
    }

    broadcastTickDelta(previous, syntheticCurrent, [])

    writeJson(res, 200, {
      ok: true,
      factionId,
      tick: world.tick,
      previousQuota: baselineCurrent,
      currentQuota: nextQuota,
      maxQuota,
      baselineCurrentQuota: baselineCurrent,
      direction: nextQuota > baselineCurrent ? 'expansion' : nextQuota < baselineCurrent ? 'shrink' : 'flat',
      note: 'diagnostic tick_delta emitted (world state unchanged)',
    })
    return
  }

  if (requestUrl.pathname.startsWith('/api/session')) {
    await dispatchSessionRoutes(req, res, requestUrl.pathname)
    return
  }

  if (requestUrl.pathname.startsWith('/api/v2')) {
    await dispatchV2Routes(req, res, requestUrl.pathname)
    return
  }

  if (requestUrl.pathname.startsWith('/api/faction')) {
    const handled = await dispatchFactionConfigRoutes(req, res, requestUrl.pathname)
    if (handled) return
  }

  writeJson(res, 404, { error: 'Route not found.' })
  } catch (err) {
    console.error('[app] unhandled route error:', err)
    if (!res.writableEnded) {
      if (isHttpBodyError(err)) {
        writeJson(res, err.statusCode, { error: err.message })
        return
      }

      writeJson(res, 500, { error: err instanceof Error ? err.message : 'Internal server error' })
    }
  }
})

applyHttpServerGuards(server)

server.listen(port, host, () => {
  console.log(`planning server listening on http://${host}:${port}`)
  // P1-7: 初始化 WorldStore（Redis 或 InMemory）
  createWorldStore().catch(err => {
    console.warn('[app] WorldStore init warning:', err instanceof Error ? err.message : err)
  })
  // 启动游戏时钟（当 GAME_CLOCK_ENABLED=1 时自动推进 tick + L2 自主规划）
  if (gameClockEnabled) {
    gameClock.start()
  }
  if (aiPlayerChatPatrolSchedulerEnabled) {
    startAiPlayerChatPatrolScheduler({
      intervalMs: readIntEnv('AI_PLAYER_CHAT_PATROL_SCHEDULER_INTERVAL_MS', 60_000, 5_000, 3_600_000),
      cooldownTicks: readIntEnv('AI_PLAYER_CHAT_PATROL_SCHEDULER_COOLDOWN_TICKS', 6, 0, 100000),
      limit: readIntEnv('AI_PLAYER_CHAT_PATROL_SCHEDULER_LIMIT', 10, 1, 50),
    })
  }

  const persistence = buildPersistenceSnapshot()
  logPersistenceStartupAlerts(persistence)
})

// WebSocket Delta 协议挂载（ws://host:port/ws）
attachWebSocket(server)

let shuttingDown = false

async function gracefulShutdown(signal: string) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true

  console.log(`[app] received ${signal}, flushing state to disk...`)
  gameClock.stop()
  stopAiPlayerChatPatrolScheduler()

  try {
    await Promise.all([
      flushWorldPersist(),
      flushNarrativePersist(),
      flushGovernancePersist(),
      flushNegotiationInboxPersist(),
      flushFactionConfigPersist(),
      flushAiHubConfigPersist(),
      flushAiPlayerGovernancePersist(),
      flushAiPlayerProviderAccountStorePersist(),
      flushV2GamePersist(),
      flushSessionPersist(),
      flushSaveSlotsPersist(),
    ])
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT')
})
process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM')
})

function applyHttpServerGuards(server: HttpServer) {
  const requestTimeoutMs = readIntEnv('HTTP_REQUEST_TIMEOUT_MS', 60_000, 5_000, 300_000)
  const headersTimeoutMs = readIntEnv(
    'HTTP_HEADERS_TIMEOUT_MS',
    Math.min(120_000, requestTimeoutMs + 5_000),
    5_000,
    300_000,
  )
  const keepAliveTimeoutMs = readIntEnv('HTTP_KEEP_ALIVE_TIMEOUT_MS', 5_000, 1_000, 120_000)
  const maxRequestsPerSocket = readIntEnv('HTTP_MAX_REQUESTS_PER_SOCKET', 100, 1, 10_000)

  server.requestTimeout = requestTimeoutMs
  server.headersTimeout = headersTimeoutMs
  server.keepAliveTimeout = keepAliveTimeoutMs
  server.maxRequestsPerSocket = maxRequestsPerSocket
}

function readIntEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(raw)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.round(raw)))
}

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) {
    return fallback
  }
  if (['1', 'true', 'yes', 'on'].includes(raw)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return false
  }
  return fallback
}

function applyCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
