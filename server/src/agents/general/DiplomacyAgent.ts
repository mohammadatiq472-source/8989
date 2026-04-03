/**
 * DiplomacyAgent.ts — 跨势力将领外交层
 *
 * 这是 Phase 2C「外交层」的核心模块。
 *
 * 外交工作流：
 *   ┌──────────────────────────────────────────────────────┐
 *   │  外交提案方（我方将领）→ DiplomacyAgent               │
 *   │         ↓ 生成提案文本（In-character）                │
 *   │  目标方（对方将领）  → DiplomacyAgent 评估回应        │
 *   │         ↓ 接受/拒绝/反提案                            │
 *   │  结果写入双方 GeneralProfile                          │
 *   └──────────────────────────────────────────────────────┘
 *
 * 支持提案类型：
 *   - ceasefire       — 局部停火协议
 *   - territory_trade — 领土交换
 *   - alliance        — 临时结盟
 *   - betrayal        — 背叛协议（秘密策反）
 *   - intelligence    — 情报交换
 *
 * 结果影响：
 *   - general.history.diplomaticContacts 写入接触记录
 *   - general.personality.loyalty 可在 betrayal 成功后漂移
 *   - general.relationship.lordTrust 在拒绝主公命令外交时下降
 *
 * 架构说明：
 *   - 所有外交结果以"提案"形式返回，最终需要规则引擎确认 world mutation
 *   - LLM 只负责"说什么"和"评估"，不直接修改 WorldState
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorldState } from '../../../../shared/contracts/game'
import type { GeneralProfile } from './GeneralProfileStore'
import { updateGeneralProfile } from './GeneralProfileStore'

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export type DiplomacyProposalType =
  | 'ceasefire'
  | 'territory_trade'
  | 'alliance'
  | 'betrayal'
  | 'intelligence'

export type DiplomacyProposal = {
  id: string
  tick: number
  type: DiplomacyProposalType
  proposerId: string          // 提案方将领 ID
  targetId: string            // 目标方将领 ID
  proposerFaction: string
  targetFaction: string
  terms: string               // 提案条款（自然语言）
  proposerMessage: string     // 提案方的 In-character 开场白
  /** 目标方响应后填入 */
  response?: DiplomacyResponse
  createdAt: number
}

export type DiplomacyResponseAction = 'accept' | 'reject' | 'counter'

export type DiplomacyResponse = {
  action: DiplomacyResponseAction
  targetMessage: string       // 目标方将领的 In-character 回应
  counterTerms?: string       // 若 action=counter，反提案条款
  consequence: DiplomacyConsequence
  respondedAt: number
}

export type DiplomacyConsequence = {
  /** 对提案方将领属性的影响 */
  proposerLoyaltyDelta?: number
  targetLoyaltyDelta?: number
  proposerLordTrustDelta?: number
  targetLordTrustDelta?: number
  /** 需要规则引擎执行的 world 变更（结构化，可被规则引擎直接解析） */
  requestedWorldChanges: DiplomacyWorldChange[]
  /** 双方是否建立了外交接触记录 */
  contactEstablished: boolean
  /** 关系等级升降 */
  significance: 'minor' | 'major' | 'epic'
}

/** 结构化外交变更，规则引擎可直接解析为 DiplomacyAgreement */
export type DiplomacyWorldChange =
  | { action: 'ceasefire'; parties: [string, string]; duration: number; description: string }
  | { action: 'alliance'; parties: [string, string]; duration: number; description: string }
  | { action: 'betrayal'; targetGeneralId: string; delayTicks: number; description: string }
  | { action: 'territory_trade'; parties: [string, string]; description: string }
  | { action: 'intelligence'; parties: [string, string]; description: string }

export type DiplomacyNegotiationResult = {
  proposal: DiplomacyProposal
  latencyMs: number
}

// ─── 提案持久化（文件 + 内存缓存）──────────────────────────────────────────

const DIPLO_DIR = join(process.cwd(), 'tmp', 'diplomacy')
const DIPLO_FILE = join(DIPLO_DIR, 'proposals.json')
const PROPOSAL_STORE = new Map<string, DiplomacyProposal>()
let _diploLoaded = false

let proposalPersistTimer: ReturnType<typeof setTimeout> | null = null
let proposalPersistInFlight: Promise<void> | null = null
let proposalPersistDirty = false
const PROPOSAL_PERSIST_DEBOUNCE_MS = 1_500

function loadProposalsFromDisk(): void {
  if (_diploLoaded) return
  _diploLoaded = true
  try {
    if (!existsSync(DIPLO_FILE)) {
      return
    }
    const raw = readFileSync(DIPLO_FILE, 'utf-8')
    const arr = JSON.parse(raw) as DiplomacyProposal[]
    for (const p of arr) {
      PROPOSAL_STORE.set(p.id, p)
    }
  } catch {
    // corrupt file - start fresh
  }
}

function schedulePersistProposals(): void {
  proposalPersistDirty = true
  if (proposalPersistTimer) {
    return
  }

  proposalPersistTimer = setTimeout(() => {
    proposalPersistTimer = null
    void flushProposalPersist()
  }, PROPOSAL_PERSIST_DEBOUNCE_MS)
}

async function flushProposalPersist(): Promise<void> {
  if (!proposalPersistDirty) {
    return
  }

  if (proposalPersistInFlight) {
    await proposalPersistInFlight
    return
  }

  const snapshot = Array.from(PROPOSAL_STORE.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 200) // Keep at most 200 historical proposals

  proposalPersistDirty = false
  proposalPersistInFlight = (async () => {
    await mkdir(DIPLO_DIR, { recursive: true })
    const payload = JSON.stringify(snapshot, null, 2)
    const tmpPath = join(
      DIPLO_DIR,
      `proposals.json.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    )

    await writeFile(tmpPath, payload, 'utf8')
    try {
      await rm(DIPLO_FILE, { force: true })
      await rename(tmpPath, DIPLO_FILE)
    } catch {
      await writeFile(DIPLO_FILE, payload, 'utf8')
      await rm(tmpPath, { force: true }).catch(() => {})
    }
  })()

  try {
    await proposalPersistInFlight
  } catch {
    proposalPersistDirty = true
  } finally {
    proposalPersistInFlight = null
    if (proposalPersistDirty && !proposalPersistTimer) {
      schedulePersistProposals()
    }
  }
}

function genProposalId(): string {
  return `diplo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function getProposal(id: string): DiplomacyProposal | undefined {
  loadProposalsFromDisk()
  return PROPOSAL_STORE.get(id)
}

export function listProposals(): DiplomacyProposal[] {
  loadProposalsFromDisk()
  return Array.from(PROPOSAL_STORE.values()).sort((a, b) => b.createdAt - a.createdAt)
}

// ─── 外交评分函数 ────────────────────────────────────────────────────────────

/**
 * 计算目标将领接受某类提案的基础概率（0-1）。
 * 最终由 LLM 在 In-character 框架内推理，这里只提供先验分数供 prompt 使用。
 */
function computeAcceptancePrior(
  _proposer: GeneralProfile,
  target: GeneralProfile,
  type: DiplomacyProposalType,
  world: WorldState,
): number {
  const targetUnit = world.units.find((u) => u.id === target.unitId)
  const pressureUnderFire = targetUnit
    ? world.map.tiles.find((t) => t.id === targetUnit.tileId)?.enemyPressure ?? 0
    : 0

  // 基础接受倾向：loyalty 高的将领更谨慎（不愿背叛主公方向）
  let prior = 0.5

  switch (type) {
    case 'ceasefire':
      // 压力越大 → 停火倾向越高
      prior += pressureUnderFire * 0.08
      prior += (1 - target.personality.aggression) * 0.2
      break
    case 'territory_trade':
      prior += (1 - target.personality.riskTolerance) * 0.15
      break
    case 'alliance':
      // 对方 loyalty 高意味着对主公忠诚，不轻易缔结跨势力同盟
      prior -= target.personality.loyalty * 0.3
      prior += target.personality.riskTolerance * 0.1
      break
    case 'betrayal':
      // 低忠诚度 + 高委屈 → 被策反概率增加
      prior = (1 - target.personality.loyalty) * 0.6
      prior += target.relationship.pendingGrievance.length * 0.05
      prior += target.relationship.recentIgnored * 0.04
      break
    case 'intelligence':
      // 侦察专精的将领愿意交换情报
      prior += target.personality.speciality === 'recon' ? 0.2 : 0
      prior += (1 - target.personality.loyalty) * 0.15
      break
  }

  return Math.max(0.05, Math.min(0.95, prior))
}

// ─── 系统 Prompt 构建 ────────────────────────────────────────────────────────

function buildProposerSystemPrompt(
  proposer: GeneralProfile,
  target: GeneralProfile,
  type: DiplomacyProposalType,
  terms: string,
): string {
  return `你是 ${proposer.name}，${proposer.faction} 的将领（${proposer.personality.speciality} 专精）。
你正在向敌对势力 ${target.faction} 的将领 ${target.name} 发起外交接触。

提案类型：${type}
提案条款：${terms}

请以第一人称、符合你角色的语气，写一段开场白（1-3句），传递这个提案。
要有将领的骄傲感，但也留出对方接受的空间。只输出开场白，不要解释。`
}

function buildTargetEvaluationPrompt(
  proposer: GeneralProfile,
  target: GeneralProfile,
  proposal: DiplomacyProposal,
  acceptancePrior: number,
): string {
  const loyaltyLevel =
    target.personality.loyalty > 0.7
      ? '高度忠诚于主公'
      : target.personality.loyalty > 0.45
        ? '对主公态度逐渐复杂'
        : '对主公已有不满'

  const grievanceNote =
    target.relationship.pendingGrievance.length > 0
      ? `你心中有委屈：${target.relationship.pendingGrievance[0]}`
      : ''

  return `你是 ${target.name}，${target.faction} 的将领。${loyaltyLevel}。${grievanceNote}

对方 ${proposer.name}（${proposer.faction}）向你提出了：
类型：${proposal.type}
条款：${proposal.terms}
对方开场白："${proposal.proposerMessage}"

你接受这个提案的倾向约为 ${Math.round(acceptancePrior * 100)}%（你可以基于角色判断覆盖这个倾向）。

请以第一人称用将领语气回应。输出 JSON：
{"action":"accept"|"reject"|"counter","message":"你的In-character回应（1-3句）","counterTerms":"若counter，你提出的新条款，否则空字符串"}

只输出 JSON，不要 markdown 包裹。`
}

// ─── LLM 调用 ────────────────────────────────────────────────────────────────

const DIPLO_TIMEOUT_MS = 12_000

async function callDiploLLM(systemPrompt: string): Promise<string | null> {
  const relayUrl = process.env.LLM_RELAY_URL
  const relayApiKey = process.env.LLM_RELAY_API_KEY ?? ''
  const model =
    process.env.LLM_CHAT_MODEL ??
    process.env.LLM_RELAY_MODEL ??
    'openrouter/deepseek/deepseek-chat-v3-0324:free'

  if (!relayUrl) return null

  const endpoint = `${relayUrl.replace(/\/$/, '')}/chat/completions`
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), DIPLO_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${relayApiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 300,
        messages: [{ role: 'user', content: systemPrompt }],
      }),
      signal: controller.signal,
    })
    if (!response.ok) return null
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return data.choices?.[0]?.message?.content?.trim() ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timeoutHandle)
  }
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

/**
 * 创建外交提案（提案方 → 生成 In-character 开场白）。
 */
export async function createDiplomacyProposal(
  proposer: GeneralProfile,
  target: GeneralProfile,
  type: DiplomacyProposalType,
  terms: string,
  world: WorldState,
): Promise<DiplomacyNegotiationResult> {
  const startedAt = Date.now()

  const proposerMessage =
    (await callDiploLLM(buildProposerSystemPrompt(proposer, target, type, terms))) ??
    `${proposer.name} 传话：${terms}`

  const proposal: DiplomacyProposal = {
    id: genProposalId(),
    tick: world.tick,
    type,
    proposerId: proposer.id,
    targetId: target.id,
    proposerFaction: proposer.faction,
    targetFaction: target.faction,
    terms,
    proposerMessage,
    createdAt: Date.now(),
  }

  PROPOSAL_STORE.set(proposal.id, proposal)
  schedulePersistProposals()

  return { proposal, latencyMs: Date.now() - startedAt }
}

/**
 * 目标将领响应外交提案。
 * 同时更新双方将领档案（外交接触记录 + 忠诚/信任变化）。
 */
export async function respondToDiplomacyProposal(
  proposalId: string,
  proposer: GeneralProfile,
  target: GeneralProfile,
  world: WorldState,
): Promise<DiplomacyNegotiationResult> {
  const startedAt = Date.now()
  loadProposalsFromDisk()
  const proposal = PROPOSAL_STORE.get(proposalId)

  if (!proposal) {
    throw new Error(`Proposal '${proposalId}' not found`)
  }

  const acceptancePrior = computeAcceptancePrior(proposer, target, proposal.type, world)
  const rawResponse = await callDiploLLM(
    buildTargetEvaluationPrompt(proposer, target, proposal, acceptancePrior),
  )

  let action: DiplomacyResponseAction = 'reject'
  let targetMessage = `${target.name} 沉默，未予回应。`
  let counterTerms: string | undefined

  if (rawResponse) {
    try {
      // 尝试解析 JSON
      const parsed = JSON.parse(rawResponse.replace(/```json|```/g, '').trim()) as {
        action?: string
        message?: string
        counterTerms?: string
      }
      if (parsed.action === 'accept' || parsed.action === 'reject' || parsed.action === 'counter') {
        action = parsed.action as DiplomacyResponseAction
      }
      if (parsed.message) targetMessage = parsed.message
      if (parsed.counterTerms) counterTerms = parsed.counterTerms
    } catch {
      // 无法解析 JSON 时，尝试文本判断
      const lower = rawResponse.toLowerCase()
      if (lower.includes('accept') || lower.includes('同意') || lower.includes('接受')) {
        action = 'accept'
      } else if (lower.includes('counter') || lower.includes('反提') || lower.includes('改为')) {
        action = 'counter'
      }
      targetMessage = rawResponse.slice(0, 200)
    }
  }

  // 计算后果
  const consequence = computeConsequence(proposal.type, action, proposer, target)
  // counter-terms 不生成额外的 world change，只记录在 response.counterTerms 中

  const response: DiplomacyResponse = {
    action,
    targetMessage,
    counterTerms,
    consequence,
    respondedAt: Date.now(),
  }

  proposal.response = response
  PROPOSAL_STORE.set(proposalId, proposal)
  schedulePersistProposals()

  // Update diplomatic contact records
  if (consequence.contactEstablished) {
    updateGeneralProfile(proposer.id, (profile) => {
      if (!profile.history.diplomaticContacts.includes(target.id)) {
        profile.history.diplomaticContacts.push(target.id)
      }
    })
    updateGeneralProfile(target.id, (profile) => {
      if (!profile.history.diplomaticContacts.includes(proposer.id)) {
        profile.history.diplomaticContacts.push(proposer.id)
      }
    })
  }

  // Apply loyalty/trust drift
  if (consequence.proposerLoyaltyDelta !== undefined) {
    updateGeneralProfile(proposer.id, (profile) => {
      profile.personality.loyalty = Math.max(
        0,
        Math.min(1, profile.personality.loyalty + consequence.proposerLoyaltyDelta!),
      )
    })
  }
  if (consequence.targetLoyaltyDelta !== undefined) {
    updateGeneralProfile(target.id, (profile) => {
      profile.personality.loyalty = Math.max(
        0,
        Math.min(1, profile.personality.loyalty + consequence.targetLoyaltyDelta!),
      )
    })
  }

  return { proposal, latencyMs: Date.now() - startedAt }
}

// ─── 后果计算 ────────────────────────────────────────────────────────────────

function computeConsequence(
  type: DiplomacyProposalType,
  action: DiplomacyResponseAction,
  proposer: GeneralProfile,
  target: GeneralProfile,
): DiplomacyConsequence {
  const base: DiplomacyConsequence = {
    requestedWorldChanges: [],
    contactEstablished: action !== 'reject',
    significance: 'minor',
  }

  if (action === 'reject') return base

  switch (type) {
    case 'ceasefire':
      base.requestedWorldChanges.push({
        action: 'ceasefire',
        parties: [proposer.faction, target.faction],
        duration: 3,
        description: `[ceasefire] ${proposer.faction} ↔ ${target.faction}：停火协议 3 tick`,
      })
      base.significance = 'major'
      break

    case 'alliance':
      base.requestedWorldChanges.push({
        action: 'alliance',
        parties: [proposer.faction, target.faction],
        duration: 5,
        description: `[alliance] ${proposer.faction} ↔ ${target.faction}：临时同盟 5 tick`,
      })
      // alliance 会略微降低双方对己方主公的忠诚（有了外部依赖）
      base.proposerLoyaltyDelta = -0.03
      base.targetLoyaltyDelta = -0.03
      base.significance = 'epic'
      break

    case 'betrayal':
      // 被策反的将领忠诚度大跌
      base.targetLoyaltyDelta = -0.25
      base.targetLordTrustDelta = -0.3
      base.requestedWorldChanges.push({
        action: 'betrayal',
        targetGeneralId: target.id,
        delayTicks: 1,
        description: `[betrayal] ${target.name} 可能在下次 tick 延迟执行主公命令`,
      })
      base.significance = 'epic'
      break

    case 'territory_trade':
      base.requestedWorldChanges.push({
        action: 'territory_trade',
        parties: [proposer.faction, target.faction],
        description: `[territory_trade] ${proposer.faction} ↔ ${target.faction}：需要规则引擎仲裁具体格子归属变更`,
      })
      base.significance = 'major'
      break

    case 'intelligence':
      base.requestedWorldChanges.push({
        action: 'intelligence',
        parties: [proposer.faction, target.faction],
        description: `[intelligence] ${proposer.faction} 共享了侦察数据给 ${target.faction}`,
      })
      break
  }

  return base
}

/**
 * 将结构化 DiplomacyWorldChange 转换为规则引擎可识别的 DiplomacyAgreement。
 * 只有 ceasefire/alliance 类型会生成 agreement（betrayal/territory_trade/intelligence 不需要持久停战效果）。
 */
export function convertWorldChangesToAgreements(
  changes: DiplomacyWorldChange[],
  tick: number,
): Array<{ id: string; tick: number; type: 'ceasefire' | 'alliance' | 'trade'; parties: [string, string]; duration: number; terms: string }> {
  const result: Array<{ id: string; tick: number; type: 'ceasefire' | 'alliance' | 'trade'; parties: [string, string]; duration: number; terms: string }> = []
  for (const change of changes) {
    if (change.action === 'ceasefire') {
      result.push({
        id: `diplo_${tick}_${change.parties[0]}_${change.parties[1]}`,
        tick,
        type: 'ceasefire',
        parties: change.parties,
        duration: change.duration,
        terms: change.description,
      })
    } else if (change.action === 'alliance') {
      result.push({
        id: `diplo_${tick}_${change.parties[0]}_${change.parties[1]}`,
        tick,
        type: 'alliance',
        parties: change.parties,
        duration: change.duration,
        terms: change.description,
      })
    }
  }
  return result
}
