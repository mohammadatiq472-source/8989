import type {
  AiPlayerBattleReportReadItem,
  AiPlayerBattleReportReadModel,
  AiPlayerBattleReportSeverity,
  GovernedAiPlayerRuntimeDetail,
} from '../../../../shared/contracts/aiPlayer'
import type { BattleOutcomeRecord } from '../../../../shared/contracts/game/history'
import type { WorldState } from '../../../../shared/contracts/game/world'
import { getWorldStateReadonly } from '../world/WorldService'

function clampBattleReportLimit(limit = 8): number {
  const normalized = Math.trunc(Number(limit) || 8)
  if (!Number.isFinite(normalized)) {
    return 8
  }
  return Math.max(1, Math.min(50, normalized))
}

function readAssignedUnitIds(world: Readonly<WorldState>, runtime: GovernedAiPlayerRuntimeDetail): string[] {
  const faction = world.factions[runtime.factionId]
  const assigned = new Set<string>()
  const ordered: string[] = []
  const append = (unitId?: string) => {
    const normalized = String(unitId ?? '').trim()
    if (normalized === '' || assigned.has(normalized)) {
      return
    }
    assigned.add(normalized)
    ordered.push(normalized)
  }

  const aiPlayerGroup = faction?.aiPlayers?.find((player) => player.id === runtime.aiPlayerId)
  for (const unitId of aiPlayerGroup?.unitIds ?? []) {
    append(unitId)
  }
  for (const unit of world.units) {
    if (unit.faction === runtime.factionId && unit.aiPlayerId === runtime.aiPlayerId) {
      append(unit.id)
    }
  }
  return ordered
}

function buildRelevantTileSet(world: Readonly<WorldState>, runtime: GovernedAiPlayerRuntimeDetail, unitIds: readonly string[]): Set<string> {
  const assigned = new Set(unitIds)
  const tileIds = new Set<string>()
  for (const unit of world.units) {
    if (assigned.has(unit.id) || unit.faction === runtime.factionId) {
      tileIds.add(unit.tileId)
    }
  }
  return tileIds
}

function resolveBattleReportPerspective(
  runtime: GovernedAiPlayerRuntimeDetail,
  unitIds: readonly string[],
  relevantTileIds: ReadonlySet<string>,
  record: Pick<BattleOutcomeRecord, 'attackerFaction' | 'attackerUnitId' | 'tileId'>,
): AiPlayerBattleReportReadItem['perspective'] | null {
  if (record.attackerFaction === runtime.factionId || unitIds.includes(record.attackerUnitId)) {
    return 'attacker'
  }
  if (relevantTileIds.has(record.tileId)) {
    return 'nearby'
  }
  return null
}

function resolveBattleReportSeverity(params: {
  outcome: BattleOutcomeRecord['outcome']
  ownLoss: number | null
  enemyLoss: number | null
}): AiPlayerBattleReportSeverity {
  if (params.outcome === 'loss') {
    return 'high'
  }
  const ownLoss = params.ownLoss ?? 0
  const enemyLoss = params.enemyLoss ?? 0
  if (ownLoss >= Math.max(40, enemyLoss)) {
    return 'high'
  }
  if (ownLoss >= 20 || ownLoss >= enemyLoss * 0.6) {
    return 'medium'
  }
  return 'low'
}

function resolveBattleReportNextStep(params: {
  outcome: BattleOutcomeRecord['outcome']
  severity: AiPlayerBattleReportSeverity
  assignedUnitInvolved: boolean
}): string {
  if (params.outcome === 'loss') {
    return params.assignedUnitInvolved
      ? '本次失败且涉及 AI 管辖部队，先补兵或驻防，避免继续推进。'
      : '本次失败，先读取地块压力与兵力损伤，再决定是否补兵或撤回。'
  }
  if (params.severity === 'high') {
    return '虽然获胜但损伤偏高，先补兵和恢复补给，再考虑继续占地。'
  }
  if (params.severity === 'medium') {
    return '获胜但有可见损伤，建议先确认行动点和粮草，再执行下一步。'
  }
  return '胜利且损伤较低，可评估相邻中立地块，准备 tile_occupy 或 resource_gather。'
}

function toBattleReportReadItem(
  record: BattleOutcomeRecord,
  perspective: AiPlayerBattleReportReadItem['perspective'],
  unitIds: readonly string[],
): AiPlayerBattleReportReadItem {
  const assignedUnitInvolved = unitIds.includes(record.attackerUnitId)
  const ownLoss = perspective === 'attacker' ? record.attackerLoss : null
  const enemyLoss = perspective === 'attacker' ? record.defenderLoss : null
  const severity = resolveBattleReportSeverity({
    outcome: record.outcome,
    ownLoss,
    enemyLoss,
  })
  return {
    ...record,
    reportId: record.id,
    perspective,
    assignedUnitInvolved,
    ownLoss,
    enemyLoss,
    severity,
    nextStepSuggestion: resolveBattleReportNextStep({
      outcome: record.outcome,
      severity,
      assignedUnitInvolved,
    }),
  }
}

export function buildAiPlayerBattleReportReadModel(
  runtime: GovernedAiPlayerRuntimeDetail,
  requestedLimit = 8,
): AiPlayerBattleReportReadModel {
  const world = getWorldStateReadonly()
  const unitIds = readAssignedUnitIds(world, runtime)
  const relevantTileIds = buildRelevantTileSet(world, runtime, unitIds)
  const limit = clampBattleReportLimit(requestedLimit)
  const items: AiPlayerBattleReportReadItem[] = []
  const orderedRecords = [...world.feedback.battleRecords].sort(
    (left, right) => right.tick - left.tick || right.id.localeCompare(left.id),
  )

  for (const record of orderedRecords) {
    const perspective = resolveBattleReportPerspective(runtime, unitIds, relevantTileIds, record)
    if (!perspective) {
      continue
    }
    items.push(toBattleReportReadItem(record, perspective, unitIds))
    if (items.length >= limit) {
      break
    }
  }

  return {
    aiPlayerId: runtime.aiPlayerId,
    factionId: runtime.factionId,
    unitIds,
    limit,
    count: items.length,
    items,
    generatedAt: new Date().toISOString(),
  }
}
