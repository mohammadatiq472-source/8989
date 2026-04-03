/**
 * GeneralUtilityAI.ts — 将领效用 AI
 *
 * 职责：
 *   - 作为 GeneralAgent 的默认决策层，无需 LLM 调用
 *   - 作为 LLM 超时/不可用时的降级策略（Utility AI Fallback）
 *   - 通过连续效用函数 + 个性参数调制，产出比原有 pick* 系列更精细的行动提案
 *
 * 参考：
 *   - Dave Mark & Kevin Dill 的 Utility AI 系列（GDC 演讲）
 *   - Generative Agents 的个性参数在决策中的应用
 *
 * 设计原则：
 *   - 零 LLM 调用，零异步，零成本
 *   - 个性参数（aggression/riskTolerance/speciality/loyalty）直接调制效用分
 *   - 供给、兵力不足时自动降级行动强度
 */

import type { ActionType, StructuredOrder, Tile, WorldState } from '../../../../shared/contracts/game'
import type { GeneralProfile } from './GeneralProfileStore'
import { getTileByIdFast } from '../../../../shared/domain/worldIndex'
import { estimateTileDistance } from '../../../../shared/domain/hpaStar'
import { planUnitMovement } from '../../../../shared/domain/hpaStar'
import { retrieveTacticalSkills, buildSituationTags, type TacticalSkillEntry } from '../tools/TacticalSkillLibrary'

// ─── 类型 ────────────────────────────────────────────────────────────────────

export type UtilityProposal = {
  order: StructuredOrder
  score: number
  reasoning: string
}

type TileCandidate = {
  tile: Tile
  action: ActionType
  baseScore: number
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

/**
 * 基于效用函数为将领产出行动命令。
 *   - 有分配命令时：refine（调整不合理的高风险命令）
 *   - 无分配命令时：propose（自主提案最优行动）
 */
export function evaluateGeneralOptions(
  world: WorldState,
  general: GeneralProfile,
  assignedOrders: StructuredOrder[],
  skipRefinement = false,
): StructuredOrder[] {
  if (assignedOrders.length > 0) {
    if (skipRefinement) return assignedOrders
    return refineOrdersByUtility(world, general, assignedOrders)
  }
  // mock 模式(skipRefinement)跳过 HPA* 自主提案——100k格 × 130将领 = OOM
  if (skipRefinement) return []
  const proposal = proposeByUtility(world, general)
  return proposal ? [proposal.order] : []
}

// ─── 已分配命令优化 ──────────────────────────────────────────────────────────

function refineOrdersByUtility(
  world: WorldState,
  general: GeneralProfile,
  orders: StructuredOrder[],
): StructuredOrder[] {
  return orders.map((order) => {
    const targetTile = getTileByIdFast(world, order.target)
    if (!targetTile) return order

    const unit = world.units.find((u) => u.id === order.unitId)
    if (!unit) return order

    // 低进攻性 + 高威胁目标 → 降级为侦察
    if (
      (order.action === 'capture' || order.action === 'march') &&
      targetTile.enemyPressure >= 3 &&
      general.personality.aggression < 0.35
    ) {
      return { ...order, action: 'recon' }
    }

    // 物流专长 + 进攻命令 → 改为支援
    if (
      (general.personality.speciality === 'logistics' || general.personality.speciality === 'support') &&
      order.action === 'capture'
    ) {
      return { ...order, action: 'support' }
    }

    // 己方领土 capture → garrison
    if (order.action === 'capture' && targetTile.owner === general.faction) {
      return { ...order, action: 'garrison' }
    }

    // 极低供给时避免进攻（supply < 2，接近断粮）
    if (unit.supply < 2 && (order.action === 'capture' || order.action === 'march')) {
      return { ...order, action: 'garrison', target: unit.tileId }  // 属地驻守，不公红进敌地
    }

    // 兵力不足时（strength < 30%）避免进攻高威胁目标
    if (
      unit.strength < 30 &&
      targetTile.enemyPressure >= 2 &&
      (order.action === 'capture' || order.action === 'march')
    ) {
      return { ...order, action: 'recon' }
    }

    return order
  })
}

// ─── 自主行动提案 ────────────────────────────────────────────────────────────

/**
 * 自主行动：扫描候选格子，用效用函数 + 个性调制选出最优行动。
 * 返回 null 表示将领选择按兵不动（idle）。
 */
export function proposeByUtility(
  world: WorldState,
  general: GeneralProfile,
): UtilityProposal | null {
  const unit = world.units.find((u) => u.id === general.unitId)
  if (!unit || unit.status !== '待命') return null

  const candidates = buildCandidates(world, general, unit.tileId)
  if (candidates.length === 0) return null

  // Voyager 战术技能召回：从 TacticalSkillLibrary 检索当前情境相关的历史战术
  const luoyangTile = world.map.tiles.find((t: Tile) => t.name === '洛阳')
  const luoyangOwner = luoyangTile?.owner ?? 'neutral'
  const situationTags = buildSituationTags(
    world.tick, unit.faction, luoyangOwner, 'medium', 'auto',
  )
  const skills = retrieveTacticalSkills(situationTags)

  const scored = candidates.map((c) => ({
    ...c,
    adjustedScore: applyPersonalityModifier(c, general, unit.supply, unit.strength, skills),
  }))
  scored.sort((a, b) => b.adjustedScore - a.adjustedScore)

  // HPA* 可达性校验：对前 3 个候选检查路径可达，选取第一个可达的
  for (const candidate of scored.slice(0, 3)) {
    if (!candidate || candidate.adjustedScore <= 0) continue
    const pathResult = planUnitMovement(world, general.unitId, candidate.tile.id)
    if (pathResult.found) {
      return {
        order: { unitId: general.unitId, action: candidate.action, target: candidate.tile.id },
        score: candidate.adjustedScore,
        reasoning: `utility=${candidate.adjustedScore.toFixed(1)} tile=${candidate.tile.id} type=${candidate.tile.type} press=${candidate.tile.enemyPressure} action=${candidate.action} pathCost=${pathResult.totalCost}`,
      }
    }
  }

  // 所有候选均不可达，回退为原始评分最高的（可能是相邻格）
  const best = scored[0]
  if (!best || best.adjustedScore <= 0) return null

  return {
    order: { unitId: general.unitId, action: best.action, target: best.tile.id },
    score: best.adjustedScore,
    reasoning: `utility=${best.adjustedScore.toFixed(1)} tile=${best.tile.id} type=${best.tile.type} press=${best.tile.enemyPressure} action=${best.action} path=fallback`,
  }
}

// ─── 候选格子构建 ────────────────────────────────────────────────────────────

function buildCandidates(world: WorldState, general: GeneralProfile, unitTileId?: string): TileCandidate[] {
  const candidates: TileCandidate[] = []
  const maxPressure = general.personality.riskTolerance < 0.45 ? 2 : 4

  // 获取单位当前位置坐标用于距离惩罚
  const unitTile = unitTileId ? getTileByIdFast(world, unitTileId) : null

  for (const tile of world.map.tiles) {
    if (tile.type === 'fog') continue

    // 距离惩罚系数：曼哈顿距离越远，分数越低
    const distPenalty = unitTile
      ? Math.max(0.2, 1.0 - estimateTileDistance(unitTile.x, unitTile.y, tile.x, tile.y) * 0.04)
      : 1.0

    // ── 侦察目标：未确认情报的高价值格子
    if (tile.owner !== general.faction) {
      const intelUnconfirmed = world.intel[tile.id]?.level !== 'confirmed'
      if (intelUnconfirmed && tile.enemyPressure <= maxPressure + 1) {
        const score =
          (tile.enemyPressure * 1.5 +
          (tile.type === 'pass' ? 3 : 0) +
          (tile.type === 'city' ? 2 : 0) +
          (tile.type === 'resource' ? 1.5 : 0)) * distPenalty
        candidates.push({ tile, action: 'recon', baseScore: score })
      }
    }

    // ── 扩张/进攻目标：中性/敌方资源/城市/关隘
    if (
      tile.owner !== general.faction &&
      tile.enemyPressure <= maxPressure &&
      (tile.type === 'resource' || tile.type === 'city' || tile.type === 'pass')
    ) {
      const score =
        ((tile.owner === 'neutral' ? 4 : 2) +
        (tile.type === 'resource' ? 3 : 0) +
        (tile.type === 'city' ? 2 : 0) +
        (tile.type === 'pass' ? 1 : 0)) * distPenalty
      const action: ActionType = tile.owner === 'neutral' ? 'march' : 'capture'
      candidates.push({ tile, action, baseScore: score })
    }

    // ── 支援目标：己方受威胁的关键格
    if (
      tile.owner === general.faction &&
      (tile.type === 'resource' || tile.type === 'pass' || tile.type === 'city') &&
      tile.enemyPressure >= 2
    ) {
      const score =
        (tile.enemyPressure * 2 +
        (tile.type === 'resource' ? 2 : 0) +
        (tile.type === 'pass' ? 1.5 : 0)) * distPenalty
      candidates.push({ tile, action: 'support', baseScore: score })
    }
  }

  // 取前 40 个高分候选，避免后续排序开销
  return candidates.sort((a, b) => b.baseScore - a.baseScore).slice(0, 40)
}

// ─── 个性调制器 ──────────────────────────────────────────────────────────────

/**
 * 将基础效用分乘以个性参数来调制最终分。
 *
 * 调制维度：
 *   - aggression: 0-1，激进程度，调制进攻行动权重
 *   - riskTolerance: 0-1，风险偏好，调制高压力目标的折扣
 *   - speciality: 专长加成
 *   - loyalty: 低忠诚 → 消极怠工折扣
 *   - supply: 低供给 → 进攻大幅贬值
 *   - strength: 低兵力 → 进攻风险上升
 */
function applyPersonalityModifier(
  candidate: TileCandidate,
  general: GeneralProfile,
  supply: number,
  strength: number,
  relevantSkills?: TacticalSkillEntry[],
): number {
  const { aggression, riskTolerance, speciality, loyalty } = general.personality
  let score = candidate.baseScore

  // 攻击性调制（进攻行动受 aggression 加权）
  if (candidate.action === 'capture' || candidate.action === 'march') {
    score *= 0.5 + aggression * 1.0
  }

  // 风险偏好调制（高压力目标在低 riskTolerance 时贬值）
  if (candidate.tile.enemyPressure >= 3) {
    score *= riskTolerance
  }

  // 专长加成
  if (speciality === 'recon' && candidate.action === 'recon') score *= 1.5
  else if (speciality === 'siege' && candidate.action === 'capture') score *= 1.4
  else if ((speciality === 'flanking' || speciality === 'mobile') && candidate.action === 'march') score *= 1.3
  else if ((speciality === 'logistics' || speciality === 'support') && candidate.action === 'support') score *= 1.6
  else if (speciality === 'diplomacy' && candidate.action === 'garrison') score *= 1.2

  // 低供给惩罚进攻
  if (supply < 3 && (candidate.action === 'capture' || candidate.action === 'march')) {
    score *= Math.max(0.1, supply / 9)
  }

  // 低兵力惩罚高压力进攻
  if (strength < 40 && candidate.tile.enemyPressure >= 2 && candidate.action === 'capture') {
    score *= 0.4
  }

  // 低忠诚度消极怠工
  if (loyalty < 0.4) {
    score *= 0.6 + loyalty * 0.5
  }

  // Voyager 战术技能加权：历次战斗自我提炼的经验影响决策评分
  if (relevantSkills && relevantSkills.length > 0) {
    for (const skill of relevantSkills) {
      const matchesAction = skill.prototypeOrders.some((o: { action: string; context: string }) => o.action === candidate.action)
      if (matchesAction && skill.outcomeScore > 0.5) {
        score *= 1 + (skill.outcomeScore - 0.5) * 0.4
      }
    }
  }

  return Math.max(0, Math.round(score * 10) / 10)
}

// ─── 工具函数（供外部测试/调试使用）────────────────────────────────────────

/** 返回 Top-N 行动提案（带评分），用于调试和将领会议场景 */
export function getTopProposals(
  world: WorldState,
  general: GeneralProfile,
  limit = 3,
): UtilityProposal[] {
  const unit = world.units.find((u) => u.id === general.unitId)
  if (!unit) return []

  const candidates = buildCandidates(world, general, unit.tileId)
  return candidates
    .map((c) => ({
      order: { unitId: general.unitId, action: c.action, target: c.tile.id },
      score: applyPersonalityModifier(c, general, unit.supply, unit.strength),
      reasoning: `tile=${c.tile.id} type=${c.tile.type} base=${c.baseScore}`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
