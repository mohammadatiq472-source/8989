/**
 * 双阵营对抗全流程模拟
 * =====================
 * 场景: 主阵营 VS 对抗阵营（支持命令行指定 factionId），各带 10 个 AI 将领
 * 流程: 开荒发展 → 省内关卡 → 立国 → 跨省攻城 → 洛阳决战
 *
 * 用法: npx tsx server/src/evals/runDualPlayerSimulation.ts [--mode mock|gateway] [--ticks 60] [--primaryFactionId <factionA>] [--opposingFactionId <factionB>] [--output tmp/sim_result.json]
 */

import '../bootstrap/loadEnv.js'
import { createInitialWorldState } from '../../../shared/domain/scenario.js'
import { advanceTick, queuePlanExecution, deployReserveHero } from '../../../shared/domain/rules.js'
import { checkVictoryConditions } from '../../../shared/domain/victoryCondition.js'
import { createCommanderPlan } from '../agents/commander/CommanderAgent.js'
import { runGeneralDispatch } from '../agents/general/GeneralAgent.js'
import { getGeneralProfilesForFaction } from '../agents/general/GeneralProfileStore.js'
import { reflectWorldTick } from '../agents/reflect/ReflectService.js'
import type { WorldState, PlannerConfig } from '../../../shared/contracts/game.js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// ─── CLI 参数 ─────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (key: string, fallback: string) => {
    const idx = args.indexOf(key)
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback
  }
  const has = (key: string) => args.includes(key)

  return {
    mode: get('--mode', 'mock') as 'mock' | 'local' | 'gateway',
    model: get('--model', ''),
    totalTicks: parseInt(get('--ticks', '60'), 10),
    output: get('--output', 'tmp/dual_faction_sim_result.json'),
    primaryFactionId: get('--primaryFactionId', '').trim(),
    opposingFactionId: get('--opposingFactionId', '').trim(),
    verbose: has('--verbose'),
    generalDispatch: !has('--no-generals'),
  }
}

function resolveSimFactionPair(
  world: WorldState,
  requestedPrimaryFactionId: string,
  requestedOpposingFactionId: string,
) {
  const allFactionIds = Object.keys(world.factions)
  if (allFactionIds.length < 2) {
    throw new Error(`runDualPlayerSimulation requires at least 2 factions, got ${allFactionIds.length}`)
  }

  const rankedFactionIds = [...allFactionIds].sort((left, right) => scoreFaction(world, right) - scoreFaction(world, left))
  const resolvedPrimaryFactionId = requestedPrimaryFactionId || rankedFactionIds[0]
  const resolvedOpposingFallback = rankedFactionIds.find((factionId) => factionId !== resolvedPrimaryFactionId)
  const resolvedOpposingFactionId = requestedOpposingFactionId || resolvedOpposingFallback

  if (!resolvedPrimaryFactionId || !resolvedOpposingFactionId) {
    throw new Error('Could not resolve primary/opposing faction pair from world state.')
  }

  if (!world.factions[resolvedPrimaryFactionId]) {
    throw new Error(`Unknown primaryFactionId: ${resolvedPrimaryFactionId}`)
  }
  if (!world.factions[resolvedOpposingFactionId]) {
    throw new Error(`Unknown opposingFactionId: ${resolvedOpposingFactionId}`)
  }
  if (resolvedPrimaryFactionId === resolvedOpposingFactionId) {
    throw new Error(`primaryFactionId and opposingFactionId must be different (both=${resolvedPrimaryFactionId})`)
  }

  return {
    primaryFactionId: resolvedPrimaryFactionId,
    opposingFactionId: resolvedOpposingFactionId,
  }
}

function scoreFaction(world: WorldState, factionId: string) {
  const tiles = world.map.tiles.filter((tile) => tile.owner === factionId).length
  const units = world.units.filter((unit) => unit.faction === factionId).length
  return tiles * 1000 + units
}

// ─── 核心数据结构 ──────────────────────────────────

interface PhaseDefinition {
  name: string
  startTick: number
  endTick: number
  primaryStrategy: string
  opposingStrategy: string
  description: string
}

interface TickSnapshot {
  tick: number
  phase: string
  primaryTiles: number
  opposingTiles: number
  neutralTiles: number
  primaryUnits: number
  opposingUnits: number
  primaryFood: number
  opposingFood: number
  primaryAP: number
  opposingAP: number
  primaryHeroes: number
  opposingHeroes: number
  battles: number
  narrativeEvents: string[]
  plannerSource: string
  plannerSuccess: boolean
  plannerLatencyMs: number
  errors: string[]
}

interface SimulationReport {
  id: string
  startedAt: string
  finishedAt: string
  config: ReturnType<typeof parseArgs>
  phases: PhaseDefinition[]
  tickSnapshots: TickSnapshot[]
  finalScore: {
    primaryTiles: number
    opposingTiles: number
    primaryUnits: number
    opposingUnits: number
    primaryNationFounded: boolean
    opposingNationFounded: boolean
    luoyangOwner: string
    winner: string
  }
  gapAnalysis: GapItem[]
  systemHealth: {
    totalPlannerCalls: number
    successfulCalls: number
    fallbackCalls: number
    averageLatencyMs: number
    totalTokens: number
    generalDispatchCount: number
  }
}

interface GapItem {
  category: string
  severity: 'critical' | 'major' | 'minor'
  description: string
  recommendation: string
}


// ─── 阶段定义：开荒 → 夺关 → 立国 → 扩张 → 洛阳决战 ─────

function buildPhases(totalTicks: number): PhaseDefinition[] {
  const phase1End = Math.floor(totalTicks * 0.2)   // 20% 开荒
  const phase2End = Math.floor(totalTicks * 0.35)   // 15% 夺关
  const phase3End = Math.floor(totalTicks * 0.45)   // 10% 立国
  const phase4End = Math.floor(totalTicks * 0.75)   // 30% 跨省扩张
  const phase5End = totalTicks                       // 25% 洛阳决战

  return [
    {
      name: '开荒发展',
      startTick: 1,
      endTick: phase1End,
      primaryStrategy: '优先发展资源地，扩展木石铁粮产出，招募武将充实编制，不要急于接触敌军',
      opposingStrategy: '扩资源打地屯田开荒，优先占领周边资源地和城池，积蓄粮草',
      description: '双方在各自州内开荒，抢占资源地，招募武将'
    },
    {
      name: '省内夺关',
      startTick: phase1End + 1,
      endTick: phase2End,
      primaryStrategy: '侦察省内关口，集中兵力攻克关卡，控制跨省通道，巩固防线',
      opposingStrategy: '先侦察北线关口，然后集中力量占领西侧关口抢占通道控制权',
      description: '双方争夺各自州的关卡，为跨省作战做准备'
    },
    {
      name: '立国建制',
      startTick: phase2End + 1,
      endTick: phase3End,
      primaryStrategy: '稳固已控区域，升级主城科技，宣布立国称号，建立完整的补给线',
      opposingStrategy: '稳住前线同时提升城池科技等级，积蓄粮草准备大规模远征',
      description: '双方具备立国条件后建立国家，提升城池科技'
    },
    {
      name: '跨省攻城',
      startTick: phase3End + 1,
      endTick: phase4End,
      primaryStrategy: '从关口突破向对抗阵营腹地推进，占领对方资源城池，切断补给线，扩大领土优势',
      opposingStrategy: '主力从关口出击进攻主阵营侧翼，同时派遣别动队骚扰对方后方资源线',
      description: '大规模跨省战争，双方争夺城池和资源'
    },
    {
      name: '洛阳决战',
      startTick: phase4End + 1,
      endTick: phase5End,
      primaryStrategy: '集结所有主力向洛阳推进，不惜代价攻克洛阳城，这是最终目标',
      opposingStrategy: '全军出击争夺洛阳控制权，集中所有兵力向洛阳进发，不计损失',
      description: '双方围绕洛阳的最终决战'
    }
  ]
}

// ─── 世界状态快照 ──────────────────────────────────

function takeSnapshot(
  world: WorldState,
  phase: string,
  planInfo: { source: string; success: boolean; latencyMs: number },
  errors: string[],
  factionPair: { primaryFactionId: string; opposingFactionId: string },
): TickSnapshot {
  const { primaryFactionId, opposingFactionId } = factionPair
  const tiles = world.map.tiles
  const primaryTiles = tiles.filter(t => t.owner === primaryFactionId).length
  const opposingTiles = tiles.filter(t => t.owner === opposingFactionId).length
  const neutralTiles = tiles.filter(t => t.owner === 'neutral').length

  const primaryUnits = world.units.filter(u => u.faction === primaryFactionId).length
  const opposingUnits = world.units.filter(u => u.faction === opposingFactionId).length

  const battles = world.feedback.battleRecords.filter(b => b.tick === world.tick).length

  // 收集叙事摘要
  const narrativeEvents = world.reports
    .filter(r => r.tick === world.tick)
    .map(r => r.title)
    .slice(0, 5)

  return {
    tick: world.tick,
    phase,
    primaryTiles,
    opposingTiles,
    neutralTiles,
    primaryUnits,
    opposingUnits,
    primaryFood: world.factions[primaryFactionId].food,
    opposingFood: world.factions[opposingFactionId].food,
    primaryAP: world.factions[primaryFactionId].actionPoints,
    opposingAP: world.factions[opposingFactionId].actionPoints,
    primaryHeroes: world.factions[primaryFactionId].heroCommand.rosterHeroIds.length,
    opposingHeroes: world.factions[opposingFactionId].heroCommand.rosterHeroIds.length,
    battles,
    narrativeEvents,
    plannerSource: planInfo.source,
    plannerSuccess: planInfo.success,
    plannerLatencyMs: planInfo.latencyMs,
    errors,
  }
}

// ─── 差距分析引擎 ──────────────────────────────────

function analyzeGaps(
  world: WorldState,
  snapshots: TickSnapshot[],
  factionPair: { primaryFactionId: string; opposingFactionId: string },
): GapItem[] {
  const { primaryFactionId, opposingFactionId } = factionPair
  const gaps: GapItem[] = []

  // ══ GAP 1: 双阵营硬编码 ══
  gaps.push({
    category: '多阵营支持',
    severity: 'critical',
    description: `本评测脚本已支持注入 primary/opposing factionId（当前 ${primaryFactionId} vs ${opposingFactionId}），但核心规则层仍存在默认阵营语义，无法直接扩展到多阵营真人并发。`,
    recommendation: '需要将 FactionId 泛化为动态字符串，支持 N 个阵营；每个阵营都可以绑定独立的 CommanderAgent 实例。'
  })

  // ══ GAP 2: 对抗侧 AI ══ [IMPLEMENTED: Opposing CommanderAgent + GeneralDispatch]
  const opposingMoves = snapshots.filter(s => s.opposingTiles > 0)
  const opposingGrowth = opposingMoves.length > 1
    ? opposingMoves[opposingMoves.length - 1].opposingTiles - opposingMoves[0].opposingTiles
    : 0
  gaps.push({
    category: '对抗侧AI智能度',
    severity: 'minor',
    description: `对抗侧已接入完整 CommanderAgent + GeneralDispatch 链路（与主阵营对等）。领土变化: ${opposingGrowth} 格。mock 模式下双方均使用 mock planner，无法体现真实 LLM 差异。运行 npm run sim:gateway 才能验证真正的 AI vs AI 博弈。`,
    recommendation: 'npm run sim:gateway — 验证真实 LLM 下的双方战略博弈质量。'
  })

  // ══ GAP 3: 省份之间的开荒逻辑 ══ [IMPLEMENTED: provincePve.ts]
  const pveNodeCount = world.pveNodes?.length ?? 0
  const clearedPveCount = world.pveNodes?.filter(n => n.cleared).length ?? 0
  gaps.push({
    category: '开荒发展机制',
    severity: pveNodeCount === 0 ? 'major' : 'minor',
    description: pveNodeCount > 0
      ? `省内开荒PVE系统已实现 (provincePve.ts)：全图共 ${pveNodeCount} 个PVE节点，已清剿 ${clearedPveCount} 个。单位驻扎资源地时自动触发开荒战斗。`
      : '当前 advanceTick 里的 processFactionHeroDevelopment 自动积累发展点并招募武将，但缺乏"省内分区开荒"概念。开荒只是占领资源地增加food收入，没有省级关卡解锁、州内副本等PVE机制。',
    recommendation: '已实现：每个省有3-4个PVE关卡节点，攻克后获得食物和行动点奖励。'
  })

  // ══ GAP 4: 立国系统连通性 ══
  const luoyangTiles = world.map.tiles.filter(t =>
    t.landmarkName?.includes('洛阳') || (t.x >= 155 && t.x <= 165 && t.y >= 150 && t.y <= 160 && t.type === 'city')
  )
  const luoyangOwner = luoyangTiles.length > 0 ? luoyangTiles[0].owner : 'unknown'
  gaps.push({
    category: '立国系统',
    severity: 'minor',
    description: `立国后端 API 已实现 (POST /api/nation/found)，但模拟中缺少自动立国触发条件检查——需要控制 ≥1 个战区 + 持有中心城。当前洛阳所有者: ${luoyangOwner}。`,
    recommendation: '在 advanceTick 中增加自动检测立国条件的逻辑，触发事件通知主阵营可立国。'
  })

  // ══ GAP 5: 胜利条件 ══ [IMPLEMENTED: victoryCondition.ts]
  const victoryResult = checkVictoryConditions(world)
  gaps.push({
    category: '胜利条件',
    severity: 'minor',
    description: `胜利条件已实现 (victoryCondition.ts)：洛阳控制N回合、消灭对方全部单位、控制领土超60%。当前判断：${victoryResult.winner ? victoryResult.winner + '已获胜' : '无人获胜'} — ${victoryResult.reason}`,
    recommendation: '已实现三种胜利条件，洛阳连续控制5回合即可赢得洛阳控制胜利。'
  })

  // ══ GAP 6: 跨省行军约束 ══ [IMPLEMENTED: passControlStatus in CommanderTools]
  gaps.push({
    category: '跨省关卡系统',
    severity: 'minor',
    description: 'passControlStatus 已添加到 CommanderTools.buildCommanderToolContextForFaction。每个关口的控制方、连通省份、是否驻防、推荐行动均已结构化传给 AI 规划器。',
    recommendation: '已实现：AI 现在能感知哪些关口被控制、哪些需要攻克。'
  })

  // ══ GAP 7: 10 AI 将领规模 ══
  const maxUnitsEver = Math.max(...snapshots.map(s => s.primaryUnits))
  gaps.push({
    category: 'AI 将领规模',
    severity: 'major',
    description: `当前测试中主阵营最大同时在线单位数: ${maxUnitsEver}。commandLimit=10 但 prospectHeroIds 只有 28 总英雄(双方共享)。每方 10 将领需要自动招募+部署链路稳定运行，目前仅对抗侧自动部署 reserve，主阵营仍需手动。`,
    recommendation: '添加主阵营的 autoDeployReserveHero 选项（可由 AI Hub 配置开关控制），使模拟场景中主阵营也能自动扩编至 10 单位。'
  })

  // ══ GAP 8: 补给线与后勤 ══
  gaps.push({
    category: '补给线机制',
    severity: 'minor',
    description: '单位有 supply(0-9) 属性，每回合 +1 恢复。但没有真正的补给线概念——不管单位多远离主城，补给都一样恢复。深入敌境的部队应该面临补给断裂风险。',
    recommendation: '实现 supply-chain 逻辑: 单位距离最近友方城池超过N格时，supply 不恢复甚至衰减。'
  })

  // ══ GAP 9: Orchestrator 双阵营调度 ══
  gaps.push({
    category: '编排器双阵营同步',
    severity: 'major',
    description: 'AgentOrchestrator 支持对双阵营 agents 并行规划，但 queuePlanExecution 只能为当前 execution 写入一份计划——无法同时为主阵营和对抗阵营各维护独立执行链。',
    recommendation: '将 PlanExecution 从单一字段改为 Record<FactionId, PlanExecution>，每个阵营独立维护执行链。'
  })

  // ══ GAP 10: 战斗深度 ══
  gaps.push({
    category: '战斗系统深度',
    severity: 'minor',
    description: '当前战斗为简单数值碰撞(攻击力 vs 防御力 × 0.92)。缺乏：兵种克制、武将技能效果、阵型加成、地形详细修正。10v10 大规模战争中战术变化不足。',
    recommendation: '逐步添加: 1) cardType 克制链(步>骑>弓>步) 2) signatureSkill 战斗触发 3) 阵型系统'
  })

  // ══ GAP 11: 计划执行针对性 ══
  const fallbackTicks = snapshots.filter(s => s.plannerSource === 'mock' && s.plannerSuccess)
  gaps.push({
    category: 'AI 规划质量',
    severity: fallbackTicks.length > snapshots.length * 0.3 ? 'major' : 'minor',
    description: `${snapshots.length} 轮中 ${fallbackTicks.length} 轮使用了 mock fallback。AI 规划器对"开荒→夺关→立国→攻城→决战"的阶段性策略变化理解能力需验证。`,
    recommendation: '为每个游戏阶段设计专门的 doctrine snippet，让 AI 能根据当前阶段自动调整策略倾向。'
  })

  // ══ GAP 12: 洛阳特殊机制 ══ [IMPLEMENTED: luoyangEndgame.ts]
  const luoyangSiegeInfo = Object.entries(world.luoyangSiegeProgress ?? {})
    .filter(([, n]) => (n as number) > 0)
    .map(([fid, n]) => `${fid}:${n}/3回合`)
    .join('、') || '无进行中围城'
  gaps.push({
    category: '洛阳终局',
    severity: 'minor',
    description: `洛阳终局机制已实现 (luoyangEndgame.ts)：1.5x 防御加成、3回合围城机制（当前围城状态：${luoyangSiegeInfo}）、胜利倒计时接入 victoryCondition.ts。`,
    recommendation: '已实现：洛阳防御是普通城市的1.5倍，攻城需3回合才能占领，占领后5回合赢得游戏。'
  })

  return gaps
}


// ─── 主模拟循环 ──────────────────────────────────

async function runSimulation() {
  const config = parseArgs()
  const { mode, model, totalTicks, output, verbose, generalDispatch } = config

  console.log('╔══════════════════════════════════════════════════════════════════╗')
  console.log('║  双阵营对抗全流程模拟 (Dual Faction Full-Game Simulation)        ║')
  console.log('╠══════════════════════════════════════════════════════════════════╣')
  console.log(`║  模式: ${mode.padEnd(12)} 总回合: ${String(totalTicks).padEnd(6)} 将领分配: ${generalDispatch ? 'ON' : 'OFF'}        ║`)
  console.log(`║  模型: ${(model || '默认').padEnd(56)}║`)
  console.log('╚══════════════════════════════════════════════════════════════════╝')
  console.log()

  const startedAt = new Date().toISOString()
  const phases = buildPhases(totalTicks)
  const plannerConfig: PlannerConfig = { mode, model: model || '' }

  // 初始化世界
  let world = createInitialWorldState()
  const factionPair = resolveSimFactionPair(world, config.primaryFactionId, config.opposingFactionId)
  const { primaryFactionId, opposingFactionId } = factionPair
  const snapshots: TickSnapshot[] = []

  // 统计
  let totalPlannerCalls = 0
  let successfulCalls = 0
  let fallbackCalls = 0
  let totalLatencyMs = 0
  let totalTokens = 0
  let generalDispatchCount = 0

  console.log('\n📍 初始状态:')
  console.log(`   主阵营ID: ${primaryFactionId}`)
  console.log(`   对抗阵营ID: ${opposingFactionId}`)
  console.log(`   主阵营单位: ${world.units.filter(u => u.faction === primaryFactionId).length}`)
  console.log(`   对抗阵营单位: ${world.units.filter(u => u.faction === opposingFactionId).length}`)
  console.log(`   总地格: ${world.map.tiles.length}`)
  console.log(`   主阵营领土: ${world.map.tiles.filter(t => t.owner === primaryFactionId).length}`)
  console.log(`   对抗阵营领土: ${world.map.tiles.filter(t => t.owner === opposingFactionId).length}`)
  console.log()

  // ─── Tick 主循环 ───
  for (let tick = 1; tick <= totalTicks; tick++) {
    const currentPhase = phases.find(p => tick >= p.startTick && tick <= p.endTick)!
    const tickErrors: string[] = []
    let planInfo = { source: 'none', success: false, latencyMs: 0 }

    // ──────────────────────────────
    // 1) 主阵营：AI Commander 规划
    // ──────────────────────────────
    try {
      const beforePlan = Date.now()
      const planResult = await createCommanderPlan(
        world,
        currentPhase.primaryStrategy,
        plannerConfig,
        primaryFactionId
      )

      const latency = planResult.metrics?.latencyMs ?? (Date.now() - beforePlan)
      planInfo = {
        source: planResult.source,
        success: true,
        latencyMs: latency
      }
      totalPlannerCalls++
      successfulCalls++
      totalLatencyMs += latency
      totalTokens += planResult.metrics?.totalTokens ?? 0
      if (planResult.source === 'mock' && mode !== 'mock') fallbackCalls++

      // 入队执行
      if (planResult.plan && planResult.plan.orders.length > 0) {
        const queueResult = queuePlanExecution(
          world,
          planResult.plan,
          planResult.source,
          primaryFactionId,
          currentPhase.primaryStrategy,
          randomUUID(),
          world.worldVersion,
          'replace'
        )

        if (!queueResult.ok) {
          tickErrors.push(`primary plan queue failed: ${queueResult.message}`)
        } else {
          world = queueResult.world
        }

        // 将领分配
        if (generalDispatch && planResult.plan) {
          try {
            const generals = getGeneralProfilesForFaction(world, primaryFactionId)
            if (generals.length > 0) {
              const generalReport = await runGeneralDispatch(world, planResult.plan, generals, { concurrency: 4 })
              generalDispatchCount++

              // 代入将领调整后的计划
              if (generalReport.delegatedPlan && generalReport.delegatedPlan.orders.length > 0) {
                const refinedResult = queuePlanExecution(
                  world,
                  generalReport.delegatedPlan,
                  planResult.source,
                  primaryFactionId,
                  currentPhase.primaryStrategy + ' [generals refined]',
                  randomUUID(),
                  world.worldVersion,
                  'replace'
                )
                if (refinedResult.ok) world = refinedResult.world
              }
            }
          } catch (err) {
            tickErrors.push(`general dispatch error: ${err instanceof Error ? err.message : 'unknown'}`)
          }
        }
      }
    } catch (err) {
      totalPlannerCalls++
      tickErrors.push(`primary commander error: ${err instanceof Error ? err.message : 'unknown'}`)
      planInfo = { source: 'error', success: false, latencyMs: 0 }
    }

    // ──────────────────────────────
    // 2) 对抗阵营：也尝试 AI Commander 规划（验证双阵营能力）
    // ──────────────────────────────
    try {
      const opposingPlanResult = await createCommanderPlan(
        world,
        currentPhase.opposingStrategy,
        plannerConfig,
        opposingFactionId
      )
      totalPlannerCalls++
      totalLatencyMs += opposingPlanResult.metrics?.latencyMs ?? 0
      totalTokens += opposingPlanResult.metrics?.totalTokens ?? 0

      if (opposingPlanResult.source === 'mock' && mode !== 'mock') fallbackCalls++

      if (opposingPlanResult.plan && opposingPlanResult.plan.orders.length > 0) {
        successfulCalls++
        const opposingQueueResult = queuePlanExecution(
          world,
          opposingPlanResult.plan,
          opposingPlanResult.source,
          opposingFactionId,
          currentPhase.opposingStrategy,
          randomUUID(),
          world.worldVersion,
          'replace'
        )
        if (!opposingQueueResult.ok) {
          tickErrors.push(`opposing plan queue failed: ${opposingQueueResult.message}`)
        } else {
          world = opposingQueueResult.world
        }

        // 将领分配（opposing），与主阵营对等
        if (generalDispatch) {
          try {
            const opposingGenerals = getGeneralProfilesForFaction(world, opposingFactionId)
            if (opposingGenerals.length > 0) {
              const opposingGeneralReport = await runGeneralDispatch(world, opposingPlanResult.plan, opposingGenerals, { concurrency: 4 })
              generalDispatchCount++
              if (opposingGeneralReport.delegatedPlan && opposingGeneralReport.delegatedPlan.orders.length > 0) {
                const opposingRefinedResult = queuePlanExecution(
                  world,
                  opposingGeneralReport.delegatedPlan,
                  opposingPlanResult.source,
                  opposingFactionId,
                  currentPhase.opposingStrategy + ' [generals refined]',
                  randomUUID(),
                  world.worldVersion,
                  'replace'
                )
                if (opposingRefinedResult.ok) world = opposingRefinedResult.world
              }
            }
          } catch (err) {
            tickErrors.push(`opposing general dispatch error: ${err instanceof Error ? err.message : 'unknown'}`)
          }
        }
      }
    } catch (err) {
      totalPlannerCalls++
      tickErrors.push(`opposing commander error: ${err instanceof Error ? err.message : 'unknown'}`)
    }

    // ──────────────────────────────
    // 3) 自动部署 reserve 英雄（双方）
    //    shallowCloneWorld 已修复 OOM，但这里保留手动部署以获得更好控制
    // ──────────────────────────────
    for (const fid of Object.keys(world.factions)) {
      const faction = world.factions[fid]
      while (faction.heroCommand.reserveHeroIds.length > 0 && faction.food >= 3 && faction.actionPoints >= 1) {
        try {
          const result = deployReserveHero(world, fid, faction.heroCommand.reserveHeroIds[0], faction.heroCommand.homeTileId)
          if (!result.ok) break
          world = result.world  // deployReserveHero returns new world
        } catch {
          break  // OOM fallback
        }
      }
    }

    // ──────────────────────────────
    // 4) 城池升级（shallowCloneWorld 已修复 OOM，后续可启用）
    // ──────────────────────────────

    // ──────────────────────────────
    // 5) 推进 Tick（包含规则引擎执行）
    // ──────────────────────────────
    // shallowCloneWorld 已修复性能，但仍每 10 tick 做 reflect 以减少 LLM 调用
    const doReflect = tick % 10 === 0
    const tickBefore = world.tick
    
    world = advanceTick(world)

    // ──────────────────────────────
    // 6) 反思层（仅每 10 tick 触发，避免深拷贝开销）
    // ──────────────────────────────
    if (doReflect) {
      try {
        // 构造轻量 before 状态用于 reflect
        const lightBefore = {
          ...world,
          tick: tickBefore,
          worldVersion: world.worldVersion - 1,
        } as WorldState
        await reflectWorldTick({
          before: lightBefore,
          after: world,
          commanderId: 'commander_primary',
        })
      } catch (err) {
        tickErrors.push(`reflect error: ${err instanceof Error ? err.message : 'unknown'}`)
      }
    }

    // ──────────────────────────────
    // 7) 胜利条件检查
    // ──────────────────────────────
    const victoryResult = checkVictoryConditions(world)
    if (victoryResult.winner) {
      console.log(`\n🏆 Victory! ${victoryResult.winner} wins by ${victoryResult.condition}: ${victoryResult.reason}`)
      const snapshot = takeSnapshot(world, currentPhase.name, planInfo, tickErrors, factionPair)
      snapshots.push(snapshot)
      break
    }

    // ──────────────────────────────
    // 8) 快照
    // ──────────────────────────────
    const snapshot = takeSnapshot(world, currentPhase.name, planInfo, tickErrors, factionPair)
    snapshots.push(snapshot)

    // ──────────────────────────────
    // 8) 输出进度
    // ──────────────────────────────
    const isPhaseStart = tick === currentPhase.startTick
    const isPhaseEnd = tick === currentPhase.endTick
    const isMilestone = tick % 10 === 0

    if (isPhaseStart) {
      console.log(`\n═══ 第 ${tick} 回合 ═══ 进入阶段【${currentPhase.name}】: ${currentPhase.description}`)
    }

    if (isMilestone || isPhaseEnd || verbose) {
      const primaryTiles = snapshot.primaryTiles
      const opposingTiles = snapshot.opposingTiles
      const primaryUnits = snapshot.primaryUnits
      const opposingUnits = snapshot.opposingUnits
      console.log(
        `  T${String(tick).padStart(3)} [${currentPhase.name.padEnd(6)}] ` +
        `主领土:${String(primaryTiles).padStart(4)} 对领土:${String(opposingTiles).padStart(4)} ` +
        `主兵:${String(primaryUnits).padStart(2)} 对兵:${String(opposingUnits).padStart(2)} ` +
        `主粮:${String(Math.floor(snapshot.primaryFood)).padStart(4)} 对粮:${String(Math.floor(snapshot.opposingFood)).padStart(4)} ` +
        `战斗:${snapshot.battles} 源:${planInfo.source}` +
        (snapshot.errors.length > 0 ? ` ⚠${snapshot.errors.length}err` : '')
      )
    }

    if (tickErrors.length > 0 && verbose) {
      for (const err of tickErrors) {
        console.log(`     ⚠ ${err}`)
      }
    }
  }

  // ─── 最终分析 ─────────────────────────────────

  console.log('\n╔══════════════════════════════════════════════════════════════════╗')
  console.log('║                      模拟完成 - 最终分析                        ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝')

  // 洛阳归属
  const luoyangTiles = world.map.tiles.filter(t =>
    t.landmarkName?.includes('洛阳') ||
    (t.x >= 155 && t.x <= 165 && t.y >= 150 && t.y <= 162 && t.type === 'city')
  )
  const luoyangPrimaryCount = luoyangTiles.filter(t => t.owner === primaryFactionId).length
  const luoyangOpposingCount = luoyangTiles.filter(t => t.owner === opposingFactionId).length
  const luoyangOwner = luoyangPrimaryCount > luoyangOpposingCount
    ? primaryFactionId
    : luoyangOpposingCount > luoyangPrimaryCount
      ? opposingFactionId
      : 'contested'

  const finalPrimaryTiles = world.map.tiles.filter(t => t.owner === primaryFactionId).length
  const finalOpposingTiles = world.map.tiles.filter(t => t.owner === opposingFactionId).length

  // Use the victory engine for authoritative winner determination
  const finalVictory = checkVictoryConditions(world)
  const winner = finalVictory.winner ?? (
    finalPrimaryTiles > finalOpposingTiles * 1.2 ? primaryFactionId :
    finalOpposingTiles > finalPrimaryTiles * 1.2 ? opposingFactionId : 'draw'
  )

  // 差距分析
  const gapAnalysis = analyzeGaps(world, snapshots, factionPair)

  const report: SimulationReport = {
    id: randomUUID(),
    startedAt,
    finishedAt: new Date().toISOString(),
    config,
    phases,
    tickSnapshots: snapshots,
    finalScore: {
      primaryTiles: finalPrimaryTiles,
      opposingTiles: finalOpposingTiles,
      primaryUnits: world.units.filter(u => u.faction === primaryFactionId).length,
      opposingUnits: world.units.filter(u => u.faction === opposingFactionId).length,
      primaryNationFounded: false,  // TODO: check nation state
      opposingNationFounded: false,
      luoyangOwner,
      winner,
    },
    gapAnalysis,
    systemHealth: {
      totalPlannerCalls,
      successfulCalls,
      fallbackCalls,
      averageLatencyMs: totalPlannerCalls > 0 ? Math.round(totalLatencyMs / totalPlannerCalls) : 0,
      totalTokens,
      generalDispatchCount,
    }
  }

  // 输出报告
  console.log('\n📊 最终计分:')
  console.log(`   主阵营领土: ${finalPrimaryTiles} 格`)
  console.log(`   对抗阵营领土: ${finalOpposingTiles} 格`)
  console.log(`   主阵营单位: ${report.finalScore.primaryUnits}`)
  console.log(`   对抗阵营单位: ${report.finalScore.opposingUnits}`)
  console.log(`   洛阳归属: ${luoyangOwner}`)
  console.log(`   判定赢家: ${winner}`)

  console.log('\n🔧 系统健康:')
  console.log(`   总规划调用: ${totalPlannerCalls}`)
  console.log(`   成功: ${successfulCalls}`)
  console.log(`   Fallback: ${fallbackCalls}`)
  console.log(`   平均延迟: ${report.systemHealth.averageLatencyMs}ms`)
  console.log(`   总 Token: ${totalTokens}`)
  console.log(`   将领分配次数: ${generalDispatchCount}`)

  console.log('\n🔍 差距分析 (共 ' + gapAnalysis.length + ' 项):')
  const critical = gapAnalysis.filter(g => g.severity === 'critical')
  const major = gapAnalysis.filter(g => g.severity === 'major')
  const minor = gapAnalysis.filter(g => g.severity === 'minor')

  console.log(`   🔴 严重(Critical): ${critical.length}`)
  for (const g of critical) {
    console.log(`      ● [${g.category}] ${g.description.slice(0, 100)}...`)
  }
  console.log(`   🟡 主要(Major): ${major.length}`)
  for (const g of major) {
    console.log(`      ● [${g.category}] ${g.description.slice(0, 100)}...`)
  }
  console.log(`   🟢 次要(Minor): ${minor.length}`)
  for (const g of minor) {
    console.log(`      ● [${g.category}] ${g.description.slice(0, 80)}...`)
  }

  // 保存报告
  try {
    mkdirSync('tmp', { recursive: true })
    writeFileSync(output, JSON.stringify(report, null, 2), 'utf-8')
    console.log(`\n💾 完整报告已保存: ${output}`)
  } catch (e) {
    console.error(`报告保存失败: ${e instanceof Error ? e.message : 'unknown'}`)
  }

  // 退出码
  const exitCode = critical.length > 0 ? 1 : 0
  console.log(`\n退出码: ${exitCode} (${critical.length} critical gaps)`)
  process.exit(exitCode)
}


// ─── 启动 ──────────────────────────────────────

runSimulation().catch((err) => {
  console.error('模拟崩溃:', err)
  process.exit(2)
})
