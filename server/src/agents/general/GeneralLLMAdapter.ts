/**
 * GeneralLLMAdapter.ts — 将领战术 LLM 推理适配器
 *
 * 职责：
 *   - 在关键决策节点为 GeneralAgent 提供 LLM 推理能力
 *   - 不是每 tick 每将领都调用，只在 shouldCallGeneralLLM() 返回 true 时触发
 *   - 超时 8s 自动返回 ok:false，调用方降级到 GeneralUtilityAI
 *   - 使用中转站同一 OpenAI compat 协议，可路由到任意免费模型
 *
 * 成本策略（不用担心成本）：
 *   - 轻量 prompt，< 400 tokens input，< 200 tokens output
 *   - 启发式过滤（shouldCallGeneralLLM）确保只在有意义时调用
 *   - 中转站路由 → 可接入 DeepSeek/Qwen/Mistral 等免费/低成本模型
 *
 * 参考：
 *   - desplega-ai/agent-swarm 的 worker agent hook 机制
 *   - Generative Agents 的 importance-gated memory retrieval
 */

import type { ActionType, StructuredOrder, WorldState } from '../../../../shared/contracts/game'
import type { GeneralProfile } from './GeneralProfileStore'
import { computeGeneralTier } from './GeneralProfileStore'
import { getFactionModelConfig } from '../../application/faction/FactionConfigStore'
import { getTileByIdFast } from '../../../../shared/domain/worldIndex'

// ─── 常量 ────────────────────────────────────────────────────────────────────

const GENERAL_LLM_TIMEOUT_MS = 8_000
const MAX_GENERAL_LLM_OUTPUT_TOKENS = 256

const GENERAL_SYSTEM_PROMPT = `You are GeneralAgent, a tactical sub-commander in an AI-native alliance war game.
Given a tactical situation, decide how to act for your unit.

Output ONLY valid JSON (no markdown, no explanation outside JSON):
{"decision":"execute"|"adjust"|"autonomous","orders":[{"unitId":"...","action":"march"|"garrison"|"recon"|"support"|"capture","target":"tileId"}],"reason":"short"}

Rules:
- Use ONLY the unitId and tileId values given in the situation.
- If supply < 3, prefer garrison or support over capture.
- If enemyPressure >= 4, prefer recon before capture.
- If aggression < 0.5, be conservative (prefer recon/garrison over capture).
- decision="execute" means keep assigned orders as-is.
- decision="adjust" means modify the assigned orders.
- decision="autonomous" means propose a new order when none was assigned.
- Keep reason under 15 words.`

const VALID_ACTIONS: Set<ActionType> = new Set(['march', 'garrison', 'recon', 'support', 'capture'])

// ─── 类型 ────────────────────────────────────────────────────────────────────

type GeneralLLMRawResponse = {
  decision: 'execute' | 'adjust' | 'autonomous'
  orders: StructuredOrder[]
  reason: string
}

export type GeneralLLMResult =
  | { ok: true; orders: StructuredOrder[]; reason: string; latencyMs: number }
  | { ok: false; reason: string; latencyMs: number }

// ─── 启发式过滤 ──────────────────────────────────────────────────────────────

/**
 * 判断此次将领决策是否值得调用 LLM。
 *
 * 策略：基于 Tier 系统的分级门控。
 *   Tier 1 (~90%): 纯 UtilityAI，永远不调用 LLM（新将、低信任将、叛将）
 *   Tier 2 (~9%):  仅在待命状态下调用（有经验的中层将领）
 *   Tier 3 (~1%):  精英名将，优先 LLM（盟主重点关注）
 *
 * 额外跳过条件（满足任一就跳过）：
 *   - 单位非待命状态（正在行军/交战/占领，决策无意义）
 *   - 单位不存在
 *
 * 成本影响：
 *   默认参数下（13 势力 × 10 将领 × 90% Tier1），每 tick 约 13 次 LLM 调用（原 130 次），
 *   成本降至 1/10，同时关键将领质量不变。
 */
export function shouldCallGeneralLLM(
  general: GeneralProfile,
  _assignedOrders: StructuredOrder[],
  world: WorldState,
): boolean {
  const unit = world.units.find((u) => u.id === general.unitId)
  // 非待命单位不做 LLM 决策（它正在执行中，不需要再生成命令）
  if (!unit || unit.status !== '待命') return false

  // Tier 系统门控：Tier 1 将领（~90%）走纯 UtilityAI，不耗 LLM
  const tier = computeGeneralTier(general)
  if (tier === 1) return false

  return true
}

// ─── LLM 调用 ────────────────────────────────────────────────────────────────

/**
 * 调用中转站 LLM 获取将领战术决策。
 * 失败/超时统一返回 ok:false，调用方应降级到 GeneralUtilityAI。
 */
export async function callGeneralLLM(
  world: WorldState,
  general: GeneralProfile,
  assignedOrders: StructuredOrder[],
): Promise<GeneralLLMResult> {
  const startedAt = Date.now()

  // 优先使用玩家为该势力配置的 BYOK 模型，回落服务器全局配置
  const byok = getFactionModelConfig(general.faction)
  const relayUrl = byok?.baseUrl ?? process.env.LLM_RELAY_URL
  const relayApiKey = byok?.apiKey ?? process.env.LLM_RELAY_API_KEY ?? ''
  const relayModel =
    byok?.model ??
    process.env.LLM_GENERAL_MODEL ??
    process.env.LLM_RELAY_MODEL ??
    'openrouter/mistralai/mistral-7b-instruct'

  if (!relayUrl) {
    return { ok: false, reason: 'no_relay_url', latencyMs: 0 }
  }

  // P1-6: 优先通过 AI-Server 代理，降低主进程 LLM 负载
  const aiServerUrl = process.env.AI_SERVER_URL
  const endpoint = aiServerUrl
    ? `${aiServerUrl.replace(/\/$/, '')}/v1/chat/completions`
    : `${relayUrl.replace(/\/$/, '')}/v1/chat/completions`
  const situationPayload = buildSituationPayload(world, general, assignedOrders)

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), GENERAL_LLM_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${relayApiKey}`,
      },
      body: JSON.stringify({
        model: relayModel,
        temperature: 0.1,
        max_tokens: MAX_GENERAL_LLM_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: GENERAL_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(situationPayload) },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return {
        ok: false,
        reason: `http_${response.status}`,
        latencyMs: Date.now() - startedAt,
      }
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const rawText = data.choices?.[0]?.message?.content?.trim() ?? ''
    const parsed = parseGeneralLLMResponse(rawText, assignedOrders)

    if (!parsed) {
      return { ok: false, reason: 'parse_failed', latencyMs: Date.now() - startedAt }
    }

    const validOrders = validateGeneralOrders(parsed.orders, world, general)
    if (validOrders.length === 0 && parsed.decision !== 'execute') {
      return { ok: false, reason: 'no_valid_orders', latencyMs: Date.now() - startedAt }
    }

    const finalOrders = parsed.decision === 'execute' ? assignedOrders : validOrders
    return {
      ok: true,
      orders: finalOrders,
      reason: parsed.reason ?? parsed.decision,
      latencyMs: Date.now() - startedAt,
    }
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network_error'
    return { ok: false, reason, latencyMs: Date.now() - startedAt }
  } finally {
    clearTimeout(timeoutHandle)
  }
}

// ─── 情境构建 ────────────────────────────────────────────────────────────────

function buildSituationPayload(
  world: WorldState,
  general: GeneralProfile,
  assignedOrders: StructuredOrder[],
) {
  const unit = world.units.find((u) => u.id === general.unitId)
  const neighbors = (world.map.connections[unit?.tileId ?? ''] ?? [])
    .map((id) => {
      const t = getTileByIdFast(world, id)
      return t
        ? { id: t.id, type: t.type, owner: t.owner, pressure: t.enemyPressure }
        : null
    })
    .filter(Boolean)
    .slice(0, 6)

  return {
    tick: world.tick,
    general: {
      name: general.name,
      faction: general.faction,
      unitId: general.unitId,
      speciality: general.personality.speciality,
      aggression: general.personality.aggression,
      riskTolerance: general.personality.riskTolerance,
      loyalty: general.personality.loyalty,
      recentIgnored: general.relationship.recentIgnored,
    },
    unit: unit
      ? {
          tileId: unit.tileId,
          strength: unit.strength,
          supply: unit.supply,
          status: unit.status,
        }
      : null,
    neighbors,
    assignedOrders,
    ...(general.memory.shortTerm.length > 0
      ? { recentMemory: general.memory.shortTerm.slice(-3) }
      : {}),
  }
}

// ─── 响应解析 + 校验 ─────────────────────────────────────────────────────────

function parseGeneralLLMResponse(
  rawText: string,
  assignedOrders: StructuredOrder[],
): GeneralLLMRawResponse | null {
  try {
    // 使用平衡括号匹配提取第一个完整 JSON 对象（非贪婪）
    const firstBrace = rawText.indexOf('{')
    if (firstBrace < 0) return null
    let depth = 0, end = -1
    for (let i = firstBrace; i < rawText.length; i++) {
      if (rawText[i] === '{') depth++
      else if (rawText[i] === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end < 0) return null
    const parsed = JSON.parse(rawText.slice(firstBrace, end + 1)) as GeneralLLMRawResponse
    if (!parsed || typeof parsed.decision !== 'string') return null

    if (parsed.decision === 'execute') {
      parsed.orders = assignedOrders
    }
    if (!Array.isArray(parsed.orders)) parsed.orders = []

    return parsed
  } catch {
    return null
  }
}

function validateGeneralOrders(
  orders: StructuredOrder[],
  world: WorldState,
  general: GeneralProfile,
): StructuredOrder[] {
  const unitById = new Map(world.units.map((unit) => [unit.id, unit]))

  return orders
    .filter((order) => {
      const unit = unitById.get(order.unitId)
      if (!unit) return false
      if (unit.id !== general.unitId) return false
      if (unit.faction !== general.faction) return false
      if (!VALID_ACTIONS.has(order.action as ActionType)) return false
      if (!getTileByIdFast(world, order.target)) return false
      return true
    })
    .slice(0, 3)
}
