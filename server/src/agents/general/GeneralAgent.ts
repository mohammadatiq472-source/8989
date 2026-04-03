import type { StrategicPlan, StructuredOrder, WorldState } from '../../../../shared/contracts/game'
import { getMemoryProvider } from '../memory/MemoryStore'
import { recordGeneralShortTermMemory, type GeneralProfile } from './GeneralProfileStore'
import { evaluateGeneralOptions } from './GeneralUtilityAI'
import { shouldCallGeneralLLM, callGeneralLLM } from './GeneralLLMAdapter'
import { detectAndPostNegotiations, drainNegotiationInbox } from './GeneralNegotiationChannel'

// ── P0-1: 全局 LLM 并发信号量 ────────────────────────────────────────────────
// 防止 300+ 将领同时发 LLM 请求导致 API 洪泛
const LLM_GENERAL_CONCURRENCY = Math.max(1, parseInt(process.env.LLM_GENERAL_CONCURRENCY ?? '8', 10))
let llmActiveCount = 0
const llmQueue: Array<() => void> = []
async function withLLMLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (llmActiveCount >= LLM_GENERAL_CONCURRENCY) {
    await new Promise<void>(resolve => llmQueue.push(resolve))
  }
  llmActiveCount++
  try { return await fn() }
  finally {
    llmActiveCount--
    llmQueue.shift()?.()
  }
}

const MEM0_TIMEOUT_MS = 8_000

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

/** L1=assigned(执行), L2=delegated(代理), L3=negotiated(协商), idle=无可执行动作 */
type GeneralAutonomySource = 'assigned' | 'delegated' | 'negotiated' | 'idle'

export type GeneralDispatchOptions = {
  concurrency: number
  skipRefinement?: boolean
  /** mock 模式下传 true ，跳过将领 LLM 增强调用（避免 mock 模式向远端网关发送 8s 超时请求） */
  skipLLM?: boolean
}

export type GeneralAgentDecision = {
  generalId: string
  orderCount: number
  orders: StructuredOrder[]
  summary: string
  latencyMs: number
  success: boolean
  autonomySource: GeneralAutonomySource
  adjusted: boolean
  reason: string
}

export type GeneralDispatchSummary = {
  totalGenerals: number
  totalOrders: number
  delegatedOrders: number
  adjustedOrders: number
  durationMs: number
  p50LatencyMs: number
  p95LatencyMs: number
}

export type GeneralDispatchReport = {
  summary: GeneralDispatchSummary
  results: GeneralAgentDecision[]
  delegatedPlan: StrategicPlan
}

type GeneralTask = {
  general: GeneralProfile
  orders: StructuredOrder[]
}

type GeneralOrderResolution = {
  orders: StructuredOrder[]
  autonomySource: GeneralAutonomySource
  adjusted: boolean
  reason: string
}

type GeneralMemoryRecall = {
  items: string[]
  topText?: string
}

export async function runGeneralDispatch(
  world: WorldState,
  plan: StrategicPlan,
  generals: GeneralProfile[],
  options: GeneralDispatchOptions,
): Promise<GeneralDispatchReport> {
  const startTime = Date.now()
  const tasks = buildGeneralTasks(plan, generals)
  const results: GeneralAgentDecision[] = []

  const queue = tasks.slice()
  const concurrency = Math.max(1, Math.min(32, Math.round(options.concurrency)))

  const worker = async () => {
    while (queue.length > 0) {
      const task = queue.shift()
      if (!task) {
        return
      }

      const resolution = resolveGeneralOrders(world, task.general, task.orders, options.skipRefinement)
      results.push(await executeGeneralTask(world, task.general, resolution, options.skipLLM))
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, tasks.length) }).map(worker)
  await Promise.all(runners)

  const delegatedOrders = buildDelegatedOrders(plan.orders, results)
  const delegatedPlan: StrategicPlan = {
    ...plan,
    orders: delegatedOrders,
    constraints: Array.from(new Set([...plan.constraints, 'general_dispatch_autonomy_v2'])).slice(0, 16),
  }

  const durationMs = Math.max(1, Date.now() - startTime)
  const latencies = results.map((item) => item.latencyMs)

  // ── 跨势力将领战场对话（距离 ≤5 格时触发谈判消息，下回合将领读取并调整意图）──
  try {
    const negotiations = detectAndPostNegotiations(world, generals)
    if (negotiations.length > 0) {
      const toneLabels: Record<string, string> = {
        threat: '威慑', challenge: '挑战', ceasefire_offer: '停火邀约',
        intelligence: '情报交换', alliance_offer: '结盟邀约',
      }
      const summary = negotiations
        .map(n => `${n.senderName}→${n.receiverId}[${toneLabels[n.tone]}/${n.distanceTiles}格]`)
        .join('、')
      delegatedPlan.constraints = [
        ...delegatedPlan.constraints.slice(0, 14),
        `negotiations_tick:${world.tick}`,
        `negotiation_count:${negotiations.length}`,
      ]
      // 将谈判摘要附到计划意图（AI 下回合可读取并考虑）
      delegatedPlan.intent = delegatedPlan.intent + `\n[战场对话 tick${world.tick}] ${summary}`
    }
  } catch {
    // negotiation 非关键路径，失败不影响 dispatch 结果
  }

  // ── 将领读取己方 inbox 中的谈判消息（注入到短期记忆）──
  try {
    for (const general of generals) {
      const inbox = drainNegotiationInbox(general.id)
      if (inbox.length > 0) {
        const inboxSummary = inbox.map(m => `[tick${m.tick} from ${m.senderName}(${m.senderFactionId})]: ${m.body.slice(0, 60)}...`).join('\n')
        recordGeneralShortTermMemory(general.id, `[战场对话接收] ${inboxSummary}`)
      }
    }
  } catch {
    // 同上，非关键路径
  }

  return {
    summary: {
      totalGenerals: results.length,
      totalOrders: delegatedOrders.length,
      delegatedOrders: results.filter((item) => item.autonomySource === 'delegated' && item.orderCount > 0).length,
      adjustedOrders: results.filter((item) => item.adjusted).length,
      durationMs,
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
    },
    results,
    delegatedPlan,
  }
}

function buildGeneralTasks(plan: StrategicPlan, generals: GeneralProfile[]): GeneralTask[] {
  const byGeneral = new Map<string, StructuredOrder[]>()

  for (const order of plan.orders) {
    const targetGeneral = generals.find((general) => general.unitId === order.unitId)
    if (!targetGeneral) {
      continue
    }

    const bucket = byGeneral.get(targetGeneral.id) ?? []
    bucket.push(order)
    byGeneral.set(targetGeneral.id, bucket)
  }

  return generals.map((general) => ({
    general,
    orders: byGeneral.get(general.id) ?? [],
  }))
}

function resolveGeneralOrders(
  world: WorldState,
  general: GeneralProfile,
  assignedOrders: StructuredOrder[],
  skipRefinement?: boolean,
): GeneralOrderResolution {
  // Phase 1D: 用 UtilityAI 替换原有 pick* 函数体系
  const utilityOrders = evaluateGeneralOptions(world, general, assignedOrders, !!skipRefinement)

  if (assignedOrders.length > 0) {
    const minLen = Math.min(utilityOrders.length, assignedOrders.length)
    const adjusted =
      utilityOrders.length !== assignedOrders.length ||
      utilityOrders.slice(0, minLen).some(
        (o, i) => o.action !== assignedOrders[i]?.action || o.target !== assignedOrders[i]?.target,
      )
    return {
      orders: utilityOrders,
      autonomySource: 'assigned',
      adjusted,
      reason: adjusted ? 'utility_risk_adjusted' : 'assigned_order',
    }
  }

  if (utilityOrders.length > 0) {
    return {
      orders: utilityOrders,
      autonomySource: 'delegated',
      adjusted: false,
      reason: 'utility_fill',
    }
  }

  return {
    orders: [],
    autonomySource: 'idle',
    adjusted: false,
    reason: 'no_viable_action',
  }
}

function buildDelegatedOrders(originalOrders: StructuredOrder[], decisions: GeneralAgentDecision[]) {
  const byUnitId = new Map<string, StructuredOrder>()

  // 战略级命令优先：Commander 计划先入队
  for (const order of originalOrders) {
    byUnitId.set(order.unitId, order)
  }

  // 将领自主调整可覆盖（adjusted=true 时替换，否则保留 Commander 原始命令）
  for (const decision of decisions) {
    if (!decision.adjusted && decision.autonomySource === 'assigned') continue
    for (const order of decision.orders) {
      byUnitId.set(order.unitId, order)
    }
  }

  const delegatedOrders = Array.from(byUnitId.values())
  const maxOrders = readDelegatedOrderLimit()
  if (maxOrders <= 0) {
    return delegatedOrders
  }

  return delegatedOrders.slice(0, maxOrders)
}

async function executeGeneralTask(
  world: WorldState,
  general: GeneralProfile,
  resolution: GeneralOrderResolution,
  skipLLM?: boolean,
): Promise<GeneralAgentDecision> {
  const startedAt = Date.now()

  // Phase 1D: LLM 增强层 — 仅在高意义决策节点调用，超时自动降级到 UtilityAI 结果
  let enhancedResolution = resolution
  if (!skipLLM && shouldCallGeneralLLM(general, resolution.orders, world)) {
    const llmResult = await withTimeout(
      withLLMLimit(() => callGeneralLLM(world, general, resolution.orders)),
      MEM0_TIMEOUT_MS,
      { ok: false as const, reason: 'timeout_outer', latencyMs: 0 },
    )
    if (llmResult.ok && llmResult.orders.length > 0) {
      enhancedResolution = {
        orders: llmResult.orders,
        autonomySource: resolution.autonomySource,
        adjusted: true,
        reason: `llm_enhanced:${llmResult.reason}`,
      }
    }
  }

  const memory = await getMemoryProvider()
  const memoryRecall = await withTimeout(
    safeRecallGeneralMemory(
      memory,
      general.id,
      buildGeneralMemoryQuery(world, general, enhancedResolution),
    ),
    MEM0_TIMEOUT_MS,
    { items: [] } as GeneralMemoryRecall,
  )
  const summary = buildGeneralSummary(world, general, enhancedResolution, memoryRecall)

  try {
    const memoryText = `[tick ${world.tick}] ${summary}`
    await withTimeout(
      memory.add(general.id, memoryText, {
        type: 'general_dispatch',
        unitId: general.unitId,
        orderCount: enhancedResolution.orders.length,
        autonomySource: enhancedResolution.autonomySource,
        adjusted: enhancedResolution.adjusted,
        reason: enhancedResolution.reason,
        recallCount: memoryRecall.items.length,
        recallTop: memoryRecall.topText,
      }),
      MEM0_TIMEOUT_MS,
      undefined,
    )
    recordGeneralShortTermMemory(general.id, memoryText)
  } catch {
    // ignore memory failures for dispatch
  }

  return {
    generalId: general.id,
    orderCount: enhancedResolution.orders.length,
    orders: enhancedResolution.orders,
    summary,
    latencyMs: Math.max(1, Date.now() - startedAt),
    success: true,
    autonomySource: enhancedResolution.autonomySource,
    adjusted: enhancedResolution.adjusted,
    reason: enhancedResolution.reason,
  }
}

async function safeRecallGeneralMemory(
  memory: Awaited<ReturnType<typeof getMemoryProvider>>,
  generalId: string,
  query: string,
): Promise<GeneralMemoryRecall> {
  try {
    const result = await memory.search(generalId, query, 3)
    const items = result
      .map((entry) => entry.text.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 3)

    const topText = items[0] ? items[0].slice(0, 120) : undefined
    return {
      items,
      topText,
    }
  } catch {
    return {
      items: [],
    }
  }
}

function buildGeneralMemoryQuery(
  world: WorldState,
  general: GeneralProfile,
  resolution: GeneralOrderResolution,
) {
  const orderHint = resolution.orders[0]
    ? `${resolution.orders[0].action}:${resolution.orders[0].target}`
    : 'idle'

  return `tick ${world.tick} ${general.name} ${general.personality.speciality} ${orderHint}`
}

function appendRecallHint(summary: string, recall: GeneralMemoryRecall) {
  if (!recall.topText) {
    return summary
  }

  return `${summary} recall:${recall.topText}`
}

function buildGeneralSummary(
  world: WorldState,
  general: GeneralProfile,
  resolution: GeneralOrderResolution,
  recall: GeneralMemoryRecall,
) {
  if (resolution.orders.length === 0) {
    return appendRecallHint(`${general.name} held position at tick ${world.tick} due to ${resolution.reason}.`, recall)
  }

  const targets = resolution.orders.map((order) => `${order.action}:${order.target}`).join(', ')
  if (resolution.autonomySource === 'delegated') {
    return appendRecallHint(`${general.name} delegated ${resolution.orders.length} order at tick ${world.tick} (${targets}).`, recall)
  }

  if (resolution.adjusted) {
    return appendRecallHint(`${general.name} adjusted assigned order at tick ${world.tick} (${targets}) based on tactical risk.`, recall)
  }

  return appendRecallHint(`${general.name} acknowledged ${resolution.orders.length} assigned order at tick ${world.tick} (${targets}).`, recall)
}

function readDelegatedOrderLimit() {
  const raw = process.env.GENERAL_DISPATCH_MAX_ORDERS
  if (!raw) {
    return 0
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  const normalized = Math.floor(parsed)
  return normalized > 0 ? normalized : 0
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0
  }

  const sorted = values.slice().sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)))
  return sorted[index]
}
