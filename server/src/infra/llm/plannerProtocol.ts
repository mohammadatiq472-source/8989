import { parsePlannerModelOutput } from '../../../../shared/schemas/planning'
import type { PlannerMetrics, PlannerResult } from '../../../../shared/contracts/game'
import type { CommanderToolContext } from '../../agents/tools/CommanderTools'
import { buildPlannerOutputContract, PLANNER_SYSTEM_PROMPT } from './plannerPrompt'

export type PlannerFallbackOrderHint = {
  unitId: string
  target: string
}

export function buildPlannerMessages(
  strategicCommand: string,
  toolContext: CommanderToolContext,
  options?: {
    compactContext?: boolean
  },
) {
  const compactContext = options?.compactContext ?? false

  const toolPayload = {
    command: strategicCommand,
    allowedActions: toolContext.allowedActions,
    tools: compactContext ? buildCompactTools(toolContext) : buildFullTools(toolContext),
    outputContract: buildPlannerOutputContract(),
  }

  return [
    {
      role: 'system',
      content: PLANNER_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: JSON.stringify(toolPayload, null, 2),
    },
  ]
}

function buildFullTools(toolContext: CommanderToolContext) {
  return {
    readWorldSnapshot: toolContext.worldSnapshot,
    listAvailableUnits: toolContext.availableUnits,
    scoreFrontlineRisk: toolContext.frontlineRisk,
    readRecentReplays: toolContext.recentReplays,
    retrieveDoctrineSnippets: toolContext.doctrineSnippets,
    memoryRecall: toolContext.memoryRecall ?? [],
    recentNarratives: toolContext.recentNarratives.slice(0, 5),
    passControlStatus: toolContext.passControlStatus,
    pveOpportunities: toolContext.pveOpportunities.slice(0, 6),
    victoryContext: toolContext.victoryContext,
    historicalSkills: toolContext.historicalSkills.slice(0, 5),
    enemyThreats: (toolContext.enemyThreats ?? []).slice(0, 5),
  }
}

function buildCompactTools(toolContext: CommanderToolContext) {
  return {
    readWorldSnapshot: compactValue(toolContext.worldSnapshot, 1),
    listAvailableUnits: toolContext.availableUnits.slice(0, 6).map((unit) => ({
      id: unit.id,
      tileId: unit.tileId,
      status: unit.status,
      strength: unit.strength,
      supply: unit.supply,
      available: unit.available,
    })),
    scoreFrontlineRisk: {
      score: toolContext.frontlineRisk.score,
      tier: toolContext.frontlineRisk.tier,
      hotspots: toolContext.frontlineRisk.hotspots.slice(0, 1).map((spot) => ({
        regionId: spot.regionId,
        riskScore: spot.riskScore,
        scoutingCoverage: spot.scoutingCoverage,
        summary: clampText(spot.summary, 120),
      })),
    },
    readRecentReplays: toolContext.recentReplays.slice(0, 1).map((replay) => ({
      requestId: replay.requestId,
      createdTick: replay.createdTick,
      outcome: replay.outcome,
      priority: replay.priority,
      shortSummary: clampText(replay.shortSummary, 120),
      excerpt: clampText(replay.excerpt, 160),
      score: replay.score,
    })),
    retrieveDoctrineSnippets: toolContext.doctrineSnippets.slice(0, 1).map((snippet) => ({
      id: snippet.id,
      title: snippet.title,
      trigger: clampText(snippet.trigger, 80),
      guidance: clampText(snippet.guidance, 120),
      preferredActions: snippet.preferredActions.slice(0, 3),
      caution: clampText(snippet.caution, 100),
    })),
    memoryRecall: (toolContext.memoryRecall ?? []).slice(0, 1).map((item) => ({
      text: clampText(pickString(item.text), 120),
      score: typeof item.score === 'number' ? item.score : undefined,
      createdAt: clampOptionalText(pickString(item.createdAt), 40),
    })),
    recentNarratives: toolContext.recentNarratives.slice(0, 2).map(n => ({
      summary: clampText(n.summary, 100),
      type: n.type,
      significance: n.significance,
    })),
    passControlStatus: toolContext.passControlStatus.slice(0, 3),
    pveOpportunities: toolContext.pveOpportunities.slice(0, 2),
    victoryContext: toolContext.victoryContext,
    historicalSkills: toolContext.historicalSkills.slice(0, 2).map(s => ({
      situationTags: s.situationTags?.slice(0, 4),
      tacticSummary: clampText(s.tacticSummary, 100),
      outcomeScore: s.outcomeScore,
    })),
    enemyThreats: (toolContext.enemyThreats ?? []).slice(0, 3).map(t => ({
      factionId: t.factionId,
      strength: t.strength,
      threatLevel: t.threatLevel,
      tileId: t.tileId,
    })),
  }
}

function compactValue(value: unknown, depth: number): unknown {
  if (depth >= 2) {
    return compactLeaf(value)
  }

  if (Array.isArray(value)) {
    return value.slice(0, 4).map((item) => compactValue(item, depth + 1))
  }

  if (isRecord(value)) {
    const keys = Object.keys(value)
    const result: Record<string, unknown> = {}
    for (const key of keys.slice(0, 8)) {
      result[key] = compactValue(value[key], depth + 1)
    }
    if (keys.length > 12) {
      result._truncatedKeys = keys.length - 8
    }
    return result
  }

  return compactLeaf(value)
}

function compactLeaf(value: unknown): unknown {
  if (typeof value === 'string') {
    return clampText(value, 160)
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value
  }

  if (Array.isArray(value)) {
    return `[array:${value.length}]`
  }

  if (isRecord(value)) {
    return `[object:${Object.keys(value).length}]`
  }

  return undefined
}

export function createPlannerResultFromText(params: {
  source: PlannerResult['source']
  rawText: string
  note: string
  metrics?: PlannerMetrics
  fallbackOrderHint?: PlannerFallbackOrderHint
}): PlannerResult {
  const parsed = parsePlannerOutputFromText(params.rawText, params.fallbackOrderHint)

  return {
    source: params.source,
    plan: parsed.plan,
    explanation: parsed.explanation,
    planningRationale: parsed.planningRationale,
    note: params.note,
    rawText: params.rawText,
    metrics: params.metrics,
  }
}

function parsePlannerOutputFromText(rawText: string, fallbackOrderHint?: PlannerFallbackOrderHint) {
  const jsonText = extractJsonObject(rawText)

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(jsonText)
  } catch {
    throw new Error('planner response is not valid JSON')
  }

  const normalizedDraft = normalizePlannerDraft(parsedJson)

  try {
    return parsePlannerModelOutput(normalizedDraft)
  } catch (error) {
    if (fallbackOrderHint && isMissingOrdersError(error) && isRecord(normalizedDraft)) {
      const patchedDraft: Record<string, unknown> = {
        ...normalizedDraft,
        orders: [
          {
            unitId: fallbackOrderHint.unitId,
            action: 'recon',
            target: fallbackOrderHint.target,
          },
        ],
      }

      return parsePlannerModelOutput(patchedDraft)
    }

    throw error
  }
}

function extractJsonObject(input: string) {
  const firstBrace = input.indexOf('{')
  const lastBrace = input.lastIndexOf('}')

  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('planner response does not include a JSON object')
  }

  return input.slice(firstBrace, lastBrace + 1)
}

function normalizePlannerDraft(input: unknown): unknown {
  if (!isRecord(input)) {
    return input
  }

  const draft: Record<string, unknown> = { ...input }
  const plan = isRecord(draft.plan) ? draft.plan : undefined

  draft.intent = clampText(pickString(draft.intent ?? plan?.intent), 160)
  draft.priority = normalizePriority(draft.priority ?? plan?.priority)
  draft.reviewAfterTicks = normalizeReviewAfterTicks(draft.reviewAfterTicks ?? plan?.reviewAfterTicks)
  draft.orders = normalizeOrders(draft.orders ?? plan?.orders)
  draft.constraints = normalizeStringList(draft.constraints ?? plan?.constraints, 16, 120)
  draft.explanation = clampOptionalText(pickString(draft.explanation ?? plan?.explanation), 1000)
  draft.planningRationale = normalizeStringList(
    draft.planningRationale ?? plan?.planningRationale,
    8,
    240,
  )

  return draft
}

function normalizePriority(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 1) {
      return 'low'
    }
    if (value >= 3) {
      return 'high'
    }
    return 'medium'
  }

  if (isRecord(value)) {
    return normalizePriority(value.level ?? value.value ?? value.name ?? value.label)
  }

  const raw = pickString(value).toLowerCase()
  if (raw === 'low' || raw === 'medium' || raw === 'high') {
    return raw
  }

  if (raw === 'urgent' || raw === 'critical' || raw === 'p1' || raw.includes('high')) {
    return 'high'
  }

  if (raw === 'normal' || raw === 'p2' || raw.includes('medium')) {
    return 'medium'
  }

  if (raw === 'p3' || raw.includes('low')) {
    return 'low'
  }

  return 'medium'
}

function normalizeReviewAfterTicks(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampInt(value, 1, 6)
  }

  if (typeof value === 'string') {
    const match = value.match(/\d+/)
    if (match) {
      return clampInt(Number(match[0]), 1, 6)
    }
  }

  return value
}

function normalizeOrders(value: unknown) {
  if (!Array.isArray(value)) {
    return value
  }

  const normalized = value
    .map((item) => normalizeOrder(item))
    .filter((item): item is ReturnType<typeof normalizeOrder> => item !== null)

  return normalized.slice(0, 8)
}

function normalizeOrder(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  const unitId =
    pickString(value.unitId) ||
    pickString(value.unit_id) ||
    pickString(value.unit)
  const action = normalizeAction(value.action ?? value.type ?? value.order)
  const target =
    pickString(value.target) ||
    pickString(value.tileId) ||
    pickString(value.tile_id) ||
    pickString(value.tile) ||
    pickString(value.targetTile)

  if (!unitId || !action || !target) {
    return null
  }

  return {
    unitId,
    action,
    target,
  }
}

function normalizeAction(value: unknown) {
  const raw = pickString(value).toLowerCase()

  if (raw === 'march' || raw === 'garrison' || raw === 'recon' || raw === 'support' || raw === 'capture') {
    return raw
  }

  if (raw === 'move' || raw === 'advance') {
    return 'march'
  }

  if (raw === 'hold' || raw === 'defend') {
    return 'garrison'
  }

  if (raw === 'scout') {
    return 'recon'
  }

  if (raw === 'assist' || raw === 'reinforce') {
    return 'support'
  }

  if (raw === 'occupy' || raw === 'seize') {
    return 'capture'
  }

  return ''
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : []

  const list = source
    .map((item) => clampOptionalText(pickString(item), maxLength))
    .filter((item): item is string => Boolean(item))

  return list.slice(0, maxItems)
}

function isMissingOrdersError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes('orders') && (message.includes('too_small') || message.includes('>=1 items'))
}

function clampText(value: string, maxLength: number) {
  if (!value) {
    return value
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function clampOptionalText(value: string, maxLength: number) {
  if (!value) {
    return undefined
  }

  return clampText(value, maxLength)
}

function clampInt(value: number, min: number, max: number) {
  const normalized = Math.round(value)
  return Math.min(max, Math.max(min, normalized))
}

function pickString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
