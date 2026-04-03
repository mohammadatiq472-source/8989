/**
 * GameClock.ts — 游戏主时钟（L2 自主模式驱动器）
 *
 * 这是让游戏世界"活起来"的核心组件。
 * 没有它，系统是零自驱动的——advanceTick 只能靠外部 POST 触发，
 * 玩家离线后整个联盟完全瘫痪，根本无法实现"活的三国世界"。
 *
 * 当 GAME_CLOCK_ENABLED=1 时，每隔 GAME_TICK_INTERVAL_MS 毫秒自动：
 *   ① sweepAllTimeouts()        — 主动把超时玩家切换为 L2 代理模式
 *   ② _autoplanL2Factions()     — 为所有 L2 势力触发 CommanderAgent 自动规划
 *   ③ advanceTickAction()        — 推进 Tick（规则引擎裁决一切）
 *
 * 这实现了 AGENTS.md 中的 L2 代理模式（delegated autonomy）：
 *   玩家定义 Doctrine（通过 AI_DOCTRINE_PROMPT 或未来的 /api/doctrine 接口），
 *   AI 在 Doctrine 框架内完整自主，玩家上线后复盘 + 调整。
 *
 * 扩展性设计：
 *   - MAX_FACTIONS_PER_TICK 限制每 tick 规划的最大势力数，防止 tick 超时
 *   - AUTO_PLAN_ENABLED=0 可单独关闭 LLM 规划但保留 tick 推进
 *   - GAME_CLOCK_CONCURRENCY 控制并发规划的最大并发数
 *
 * 成本金字塔（参见 AGENTS.md §五 成本金字塔）：
 *   Commander: 强模型，每 tick 每势力一次（此处触发）
 *   General:   中/小模型，在 queuePlanExecutionAction(dispatchGenerals=true) 中触发
 *   UtilityAI: 零成本，绝大多数将领走此路径（tier 系统保证）
 */

import { getWorldStateReadonly, advanceTickAction, queuePlanExecutionAction } from '../world/WorldService'
import { createPlanningResult } from '../planning/PlanningService'
import { sweepAllTimeouts, getAllAutonomousFactionIds } from '../../multiplayer/SessionManager'
import { getFactionDoctrine, getFactionModelConfig } from '../faction/FactionConfigStore'
import type { PlannerConfig, PlanSource, WorldState } from '../../../../shared/contracts/game'
import { randomUUID } from 'node:crypto'

// ─── 配置（全部可通过 env 覆盖）─────────────────────────────────────────────

/** 最小 tick 间隔（防止误配置引发风暴）*/
const MIN_TICK_MS = 10_000

const TICK_INTERVAL_MS = Math.max(
  MIN_TICK_MS,
  Number(process.env.GAME_TICK_INTERVAL_MS ?? 60_000),
)

/** 每 tick 最多规划的势力数（成本上限）*/
const MAX_FACTIONS_PER_TICK = Math.min(
  100,
  Math.max(1, Number(process.env.GAME_CLOCK_MAX_FACTIONS ?? 13)),
)

/** 是否开启 LLM 自动规划（=0 时只推进 tick，不触发 Commander）*/
const AUTO_PLAN_ENABLED = process.env.GAME_CLOCK_AUTO_PLAN !== '0'

/** 规划并发数（防止同时触发过多 LLM 请求）*/
const PLAN_CONCURRENCY = Math.min(
  10,
  Math.max(1, Number(process.env.GAME_CLOCK_CONCURRENCY ?? 4)),
)

/** Retry count for enqueue when world mutation lock is busy */
const PLAN_ENQUEUE_MAX_RETRIES = Math.min(
  8,
  Math.max(1, Number(process.env.GAME_CLOCK_ENQUEUE_RETRIES ?? 4)),
)

/** Backoff base milliseconds for enqueue retries */
const PLAN_ENQUEUE_BACKOFF_MS = Math.min(
  2_000,
  Math.max(20, Number(process.env.GAME_CLOCK_ENQUEUE_BACKOFF_MS ?? 80)),
)

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

function buildPlannerConfig(factionId?: string): PlannerConfig {
  // 优先使用玩家为该势力配置的模型（BYOK）
  const factionModel = factionId ? getFactionModelConfig(factionId) : undefined
  if (factionModel) {
    return {
      mode: 'gateway',
      model: factionModel.commanderModel ?? factionModel.model,
      ...(factionModel.apiKey ? { apiKey: factionModel.apiKey } : {}),
      ...(factionModel.baseUrl ? { baseUrl: factionModel.baseUrl } : {}),
    } as PlannerConfig
  }
  // 回落服务器默认配置
  const hasGateway = !!(process.env.LLM_RELAY_URL)
  const mode = hasGateway ? 'gateway' : 'mock'
  return {
    mode,
    model: process.env.LLM_RELAY_MODEL ?? 'mock',
  }
}

function getDefaultStrategy(factionId: string): string {
  // 优先使用玩家通过 /api/faction/:id/doctrine 设置的方针
  return getFactionDoctrine(factionId)
}

/** 简单并发限制：将 tasks 分批执行，每批最多 batchSize 个 */
async function batchedSettled<T>(
  tasks: Array<() => Promise<T>>,
  batchSize: number,
): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = []
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize).map(t => t())
    const batchResults = await Promise.allSettled(batch)
    results.push(...batchResults)
  }
  return results
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isWorldMutationBusyMessage(message?: string): boolean {
  return typeof message === 'string' && message.startsWith('world mutation busy')
}

// ─── GameClock 类 ─────────────────────────────────────────────────────────────

export class GameClock {
  private timer: ReturnType<typeof setInterval> | null = null
  private tickRunning = false

  /**
   * 启动时钟。
   * @param intervalMs tick 间隔（毫秒），默认 TICK_INTERVAL_MS
   */
  start(intervalMs: number = TICK_INTERVAL_MS): void {
    if (this.timer) {
      console.warn('[GameClock] already running, ignoring start()')
      return
    }
    this.timer = setInterval(() => void this._onTick(), intervalMs)
    console.log(
      `[GameClock] ✓ started — interval=${intervalMs}ms, ` +
      `auto_plan=${AUTO_PLAN_ENABLED}, max_factions=${MAX_FACTIONS_PER_TICK}, ` +
      `plan_concurrency=${PLAN_CONCURRENCY}`,
    )
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    console.log('[GameClock] stopped')
  }

  /** 手动触发单次 tick（用于测试或管理接口）*/
  async triggerOnce(): Promise<{ ok: boolean; elapsed: number; message?: string }> {
    if (this.tickRunning) {
      return { ok: false, elapsed: 0, message: 'tick already running' }
    }
    const start = Date.now()
    await this._onTick()
    return { ok: true, elapsed: Date.now() - start }
  }

  // ─── 私有核心逻辑 ──────────────────────────────────────────────────────────

  private async _onTick(): Promise<void> {
    if (this.tickRunning) {
      console.log('[GameClock] tick skipped — previous tick still running')
      return
    }
    this.tickRunning = true
    const tickStart = Date.now()

    try {
      // ① 主动扫描离线玩家 → 切换为 L2 代理模式
      sweepAllTimeouts()

      // ② 为 L2 势力自动规划（CommanderAgent）
      if (AUTO_PLAN_ENABLED) {
        await this._autoplanL2Factions()
      }

      // ③ 推进 Tick（规则引擎裁决）
      const result = await advanceTickAction(false)  // includeWorld=false 节省序列化
      const elapsed = Date.now() - tickStart

      if (result.ok) {
        console.log(`[GameClock] tick #${(result as { tick?: number }).tick ?? '?'} completed in ${elapsed}ms`)
      } else {
        // advanceTickAction 被 isTickAdvancing mutex 拒绝时返回 ok=false
        console.warn(`[GameClock] tick rejected by mutex (elapsed=${elapsed}ms)`)
      }
    } catch (err) {
      const elapsed = Date.now() - tickStart
      console.error(`[GameClock] tick error after ${elapsed}ms:`, err instanceof Error ? err.message : err)
    } finally {
      this.tickRunning = false
    }
  }

  private async _autoplanL2Factions(): Promise<void> {
    const world = getWorldStateReadonly() as WorldState
    const allFactionIds = Object.keys(world.factions ?? {})
    if (allFactionIds.length === 0) return

    // 取所有 L2 势力，并按上限截断（成本保护）
    const l2Factions = getAllAutonomousFactionIds(allFactionIds).slice(0, MAX_FACTIONS_PER_TICK)
    if (l2Factions.length === 0) return

    const tasks = l2Factions.map(factionId => () =>
      this._planForFaction(world, factionId, buildPlannerConfig(factionId))
    )

    const results = await batchedSettled(tasks, PLAN_CONCURRENCY)

    const failed = results.filter(r => r.status === 'rejected')
    if (failed.length > 0) {
      console.warn(
        `[GameClock] auto-plan: ${results.length - failed.length}/${results.length} succeeded, ` +
        `${failed.length} failed`,
      )
    }
  }

  private async _planForFaction(
    world: WorldState,
    factionId: string,
    config: PlannerConfig,
  ): Promise<void> {
    const strategy = getDefaultStrategy(factionId)

    const planResult = await createPlanningResult(world, strategy, config, factionId)
    if (planResult.plan.orders.length === 0) return

    const enqueueParams = {
      plan: planResult.plan,
      source: config.mode as PlanSource,
      strategicCommand: strategy,
      requestId: randomUUID(),
      basedOnWorldVersion: world.worldVersion,
      factionId,
      dispatchGenerals: true,
      generalConcurrency: 4,
      generalSide: factionId,
      executionMode: 'replace' as const,
    }
    for (let attempt = 1; attempt <= PLAN_ENQUEUE_MAX_RETRIES; attempt += 1) {
      const queueResult = await queuePlanExecutionAction(
        enqueueParams,
        false,  // includeWorld=false, GameClock does not need response payload
      )

      if (queueResult.ok) {
        return
      }

      if (!isWorldMutationBusyMessage(queueResult.message)) {
        console.warn(
          `[GameClock] queue_plan_execution rejected for faction=${factionId}: ${queueResult.message ?? 'unknown reason'}`,
        )
        return
      }
      if (attempt >= PLAN_ENQUEUE_MAX_RETRIES) {
        console.warn(
          `[GameClock] queue_plan_execution busy after ${attempt} attempts for faction=${factionId}; plan dropped`,
        )
        return
      }
      await sleep(PLAN_ENQUEUE_BACKOFF_MS * attempt)
    }
  }
}

// ─── 单例导出 ─────────────────────────────────────────────────────────────────

/** 全局 GameClock 单例，由 app.ts 在服务启动后调用 gameClock.start() */
export const gameClock = new GameClock()
