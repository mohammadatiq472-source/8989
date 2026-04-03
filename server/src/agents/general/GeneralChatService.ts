/**
 * GeneralChatService.ts — 将领双模 Agent（聊天 + 战术）
 *
 * 这是 Phase 2「将领社交」的核心模块。
 *
 * 双模设计：
 *   ┌─────────────────────────────────────┐
 *   │  玩家消息                            │
 *   │       ↓                             │
 *   │  意图路由器 (detectChatMode)         │
 *   │  ├── chat 模式 → 角色扮演回复        │
 *   │  └── order 模式 → 结构化命令解析     │
 *   └─────────────────────────────────────┘
 *
 * 架构参考：
 *   - desplega-ai/agent-swarm SOUL.md / IDENTITY.md 持久身份
 *   - SillyTavern Character Card (W++ / JSON 格式)
 *   - Letta/MemGPT core/archival/recall 三层记忆
 *
 * 关键特性：
 *   - 两种模式**共享同一份记忆**，聊天时说的话影响战术决策，反之亦然
 *   - 将领个性（aggression/loyalty/riskTolerance）实时影响对话语气
 *   - 长期对话历史持久化到文件（每将领独立会话文件）
 *   - 忠诚度越低 → AI 将领态度越冷漠甚至抗命
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WorldState } from '../../../../shared/contracts/game'
import { getFactionModelConfig } from '../../application/faction/FactionConfigStore'
import { recordGeneralShortTermMemory, type GeneralProfile } from './GeneralProfileStore'
import { resolveChatMode, type ChatMode } from './chatMode'

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  mode: 'chat' | 'order' | 'auto'
}

export type ChatSession = {
  generalId: string
  messages: ChatMessage[]
  createdAt: number
  lastActiveAt: number
}

export type ChatResponse = {
  generalId: string
  generalName: string
  mode: 'chat' | 'order'
  reply: string
  /** 若 mode=order，解析出的战术意图 */
  parsedOrder?: {
    action: string
    target?: string
    note: string
  }
  loyaltyHint?: string
  latencyMs: number
}

// ─── 对话历史持久化 ──────────────────────────────────────────────────────────

const CHAT_DIR = join(process.cwd(), 'tmp', 'general_chats')
const MAX_HISTORY_MESSAGES = 40
const MAX_CONTEXT_MESSAGES = 12 // Number of message turns included in each LLM call
const CHAT_PERSIST_DEBOUNCE_MS = 120

const SESSION_CACHE = new Map<string, ChatSession>()

type ChatPersistState = {
  timer: NodeJS.Timeout | null
  writing: boolean
  dirty: boolean
  pendingSnapshot: ChatSession | null
}

const CHAT_PERSIST_STATES = new Map<string, ChatPersistState>()

function getChatPath(generalId: string): string {
  return join(CHAT_DIR, `${generalId}.json`)
}

function cloneSession(session: ChatSession): ChatSession {
  return JSON.parse(JSON.stringify(session)) as ChatSession
}

function getPersistState(generalId: string): ChatPersistState {
  let state = CHAT_PERSIST_STATES.get(generalId)
  if (!state) {
    state = {
      timer: null,
      writing: false,
      dirty: false,
      pendingSnapshot: null,
    }
    CHAT_PERSIST_STATES.set(generalId, state)
  }
  return state
}

function scheduleSessionPersist(session: ChatSession): void {
  const state = getPersistState(session.generalId)
  state.pendingSnapshot = cloneSession(session)
  state.dirty = true

  if (state.timer) {
    clearTimeout(state.timer)
  }

  state.timer = setTimeout(() => {
    state.timer = null
    void flushSessionPersist(session.generalId)
  }, CHAT_PERSIST_DEBOUNCE_MS)
}

async function flushSessionPersist(generalId: string): Promise<void> {
  const state = CHAT_PERSIST_STATES.get(generalId)
  if (!state || state.writing) {
    return
  }

  state.writing = true

  try {
    while (state.dirty && state.pendingSnapshot) {
      const snapshot = state.pendingSnapshot
      state.pendingSnapshot = null
      state.dirty = false

      if (!existsSync(CHAT_DIR)) {
        await mkdir(CHAT_DIR, { recursive: true })
      }

      await writeFile(getChatPath(generalId), JSON.stringify(snapshot, null, 2), 'utf8')
    }
  } catch {
    // non-fatal
  } finally {
    state.writing = false

    if (state.dirty && state.pendingSnapshot) {
      void flushSessionPersist(generalId)
    }
  }
}

function loadSession(generalId: string): ChatSession {
  if (SESSION_CACHE.has(generalId)) return SESSION_CACHE.get(generalId)!

  try {
    const path = getChatPath(generalId)
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf8')
      const session = JSON.parse(raw) as ChatSession
      SESSION_CACHE.set(generalId, session)
      return session
    }
  } catch {
    // ignore, create fresh
  }

  const fresh: ChatSession = {
    generalId,
    messages: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  }
  SESSION_CACHE.set(generalId, fresh)
  return fresh
}

function saveSession(session: ChatSession): void {
  session.lastActiveAt = Date.now()
  session.messages = session.messages.slice(-MAX_HISTORY_MESSAGES)
  SESSION_CACHE.set(session.generalId, session)
  scheduleSessionPersist(session)
}

export function getChatHistory(generalId: string): ChatMessage[] {
  return loadSession(generalId).messages
}

export function clearChatHistory(generalId: string): void {
  SESSION_CACHE.delete(generalId)
  try {
    const path = getChatPath(generalId)
    if (existsSync(path)) {
      scheduleSessionPersist({
        generalId,
        messages: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      })
    }
  } catch { /* ignore */ }
}

// ─── Character Card 构建 ─────────────────────────────────────────────────────

/**
 * 将 GeneralProfile 转成 SOUL.md + IDENTITY.md 风格的系统 prompt。
 * 参考 desplega-ai/agent-swarm 的 4 文件身份系统 + SillyTavern character card。
 */
function buildCharacterSystemPrompt(
  general: GeneralProfile,
  world: WorldState,
  mode: ChatMode,
): string {
  const unit = world.units.find((u) => u.id === general.unitId)
  const currentTile = unit ? world.map.tiles.find((t) => t.id === unit.tileId) : null
  const loyalty = general.personality.loyalty
  const recentIgnored = general.relationship.recentIgnored

  // SOUL — 不变内核
  const soulPrompt = buildSoulPrompt(general, loyalty, recentIgnored)

  // IDENTITY — 当前状态和履历
  const identityPrompt = buildIdentityPrompt(general, unit, currentTile, world)

  // LOREBOOK — 世界知识（关键词触发式，简化版）
  const lorebookPrompt = buildLorebookSnippet(world, general.faction)

  // MEMORY — 短期记忆 + 长期摘要（来自 Mem0 和战术交互历史）
  const memoryPrompt = buildMemoryPrompt(general)

  // 模式专属指令
  const modeInstruction =
    mode === 'chat'
      ? `
[当前模式：角色扮演对话]
用第一人称，以你的身份回应主公。保持你的性格，不必提供战术数据，自然说话即可。
回复长度：1-3 句话，不要啰嗦。如果最近被忽视（recentIgnored > 3），语气可以冷淡或有微词。
`
      : `
[当前模式：战术命令解析]
主公正在下达战术意图。你的职责是：
1. 表明你是否接受该命令（考虑你的个性和当前局势）
2. 简短反馈你会如何执行（1-2 句）
3. 如果命令有风险，说出你的顾虑
用第一人称回应，保持将领语气。
`

  return `${soulPrompt}\n\n${identityPrompt}\n\n${lorebookPrompt}\n\n${memoryPrompt}\n\n${modeInstruction}`
}

function buildSoulPrompt(
  general: GeneralProfile,
  loyalty: number,
  recentIgnored: number,
): string {
  const { name } = general
  const { aggression, riskTolerance, speciality } = general.personality

  const personalityDesc = [
    aggression > 0.7 ? '激进好战，渴望建功立业' : aggression < 0.45 ? '沉稳谨慎，不轻易冒进' : '攻守兼备',
    riskTolerance > 0.7 ? '胆大，敢于冒险' : riskTolerance < 0.45 ? '稳健，注重保存实力' : '风险意识适中',
    speciality === 'flanking' || speciality === 'mobile' ? '擅长奇袭迂回' :
    speciality === 'siege' ? '专于攻城拔寨' :
    speciality === 'recon' ? '精于侦察情报' :
    speciality === 'diplomacy' ? '长于外交斡旋' :
    speciality === 'logistics' || speciality === 'support' ? '善后勤支援' : '全能将领',
  ].join('，')

  const loyaltyDesc =
    loyalty > 0.75
      ? '对主公忠心耿耿，视主公如明主'
      : loyalty > 0.5
        ? '对主公基本信任，但偶有保留'
        : loyalty > 0.3
          ? '对主公已有失望，言辞间偶有迟疑'
          : '对主公深感不满，内心已有异心'

  const ignoredNote =
    recentIgnored >= 5
      ? '近来主公屡次无视你的谏言，你心中憋屈，言语间可能流露不满。'
      : recentIgnored >= 3
        ? '近来你的意见未被采纳，语气可略显冷淡。'
        : ''

  return `[SOUL — 灵魂档案]
你是 ${name}，一位三国乱世中的将领。
性格：${personalityDesc}。
忠诚：${loyaltyDesc}。
${ignoredNote}
你有自己的骄傲和底线——绝不是主公的工具，而是有血有肉的人。`
}

function buildIdentityPrompt(
  general: GeneralProfile,
  unit: WorldState['units'][number] | undefined,
  currentTile: WorldState['map']['tiles'][number] | undefined | null,
  world: WorldState,
): string {
  const { history, relationship } = general
  const winRate =
    history.battlesWon + history.battlesLost > 0
      ? Math.round(
          (history.battlesWon / (history.battlesWon + history.battlesLost)) * 100,
        )
      : null

  const recentDecisions = history.keyDecisions.slice(0, 3).join('；')
  const positionDesc = currentTile
    ? `当前驻于 ${currentTile.name}（${currentTile.type}，敌压 ${currentTile.enemyPressure}）`
    : '当前位置未知'
  const strengthDesc = unit
    ? `兵力 ${unit.strength}%，补给 ${unit.supply}/9，状态：${unit.status}`
    : ''
  const grievanceNote =
    relationship.pendingGrievance.length > 0
      ? `你心中有未解的委屈：${relationship.pendingGrievance[0]}`
      : ''

  return `[IDENTITY — 当前状态]
Tick ${world.tick} | ${positionDesc}
${strengthDesc}
战绩：${history.battlesWon} 胜 ${history.battlesLost} 败${winRate !== null ? `（胜率 ${winRate}%）` : ''}
近期决策记录：${recentDecisions || '暂无'}
${grievanceNote}`
}

function buildLorebookSnippet(world: WorldState, factionId: string): string {
  const playerFood = world.factions[factionId]?.food ?? 0
  const playerAP = world.factions[factionId]?.actionPoints ?? 0
  const battleRisk = Math.round(
    world.feedback.battleRecords.slice(0, 3).reduce((sum, r) => sum + r.attackerLoss, 0),
  )
  return `[KNOWLEDGE — 当前大局]
Tick ${world.tick}：${factionId} 粮草${playerFood}，行动点${playerAP}，近期战损${battleRisk}。`
}

/**
 * 注入将领记忆上下文：短期记忆 + 长期摘要
 * 闭合 Mem0 写入 → 读取循环，让 AI 能回忆此前对话和战术经历
 */
function buildMemoryPrompt(general: GeneralProfile): string {
  const sections: string[] = []

  // 短期记忆（最近 6 条，避免 token 爆炸）
  if (general.memory.shortTerm.length > 0) {
    const recentMemory = general.memory.shortTerm.slice(0, 6).join('\n')
    sections.push(`[短期记忆 — 你最近的经历]\n${recentMemory}`)
  }

  // 长期摘要（Mem0 压缩的持久记忆）
  if (general.memory.longTermSummary) {
    sections.push(`[长期记忆 — 你沉淀下来的印象]\n${general.memory.longTermSummary}`)
  }

  if (sections.length === 0) {
    return '[MEMORY — 记忆]\n暂无特别记忆。'
  }

  return `[MEMORY — 记忆]\n${sections.join('\n\n')}`
}

// ─── LLM 调用 ────────────────────────────────────────────────────────────────

const CHAT_TIMEOUT_MS = 15_000
const MAX_CHAT_OUTPUT_TOKENS = 300

async function callChatLLM(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  factionId?: string,
): Promise<string | null> {
  // BYOK：优先用玩家自带的模型配置，否则回落到服务器环境变量
  const byok = factionId ? getFactionModelConfig(factionId) : undefined
  const relayUrl = byok?.baseUrl ?? process.env.LLM_RELAY_URL
  const relayApiKey = byok?.apiKey ?? process.env.LLM_RELAY_API_KEY ?? ''
  // 聊天专用模型：可以用语言能力更强的模型（对话质量更高），或指定免费模型
  const chatModel =
    byok?.model ??
    process.env.LLM_CHAT_MODEL ??
    process.env.LLM_RELAY_MODEL ??
    'openrouter/deepseek/deepseek-chat-v3-0324:free'

  if (!relayUrl) return null

  const endpoint = `${relayUrl.replace(/\/$/, '')}/chat/completions`

  // 构建对话历史（最近 N 轮）
  const contextMessages = history
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }))

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${relayApiKey}`,
      },
      body: JSON.stringify({
        model: chatModel,
        temperature: 0.75, // 聊天模式：更高 temperature 增加个性化表达
        max_tokens: MAX_CHAT_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: systemPrompt },
          ...contextMessages,
          { role: 'user', content: userMessage },
        ],
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
 * 处理玩家与将领的对话请求。
 * 同时记录双向记忆：玩家说的话 + 将领的回复都写入会话历史。
 */
export async function chatWithGeneral(
  general: GeneralProfile,
  world: WorldState,
  userMessage: string,
  forcedMode?: 'chat' | 'order',
): Promise<ChatResponse> {
  const startedAt = Date.now()
  const session = loadSession(general.id)
  const mode = resolveChatMode(userMessage, forcedMode)
  const systemPrompt = buildCharacterSystemPrompt(general, world, mode)

  const reply =
    (await callChatLLM(systemPrompt, session.messages, userMessage, general.faction)) ??
    buildFallbackReply(general, mode)

  // 双向写入对话历史
  session.messages.push(
    { role: 'user', content: userMessage, timestamp: Date.now(), mode },
    { role: 'assistant', content: reply, timestamp: Date.now(), mode },
  )
  saveSession(session)

  // 同步写入将领短期记忆（影响战术决策）
  // 只写入有实质内容的玩家消息（避免过短寒暄污染战术记忆）
  if (userMessage.length > 10) {
    const memoryNote = `[chat tick${world.tick}] Player said: "${userMessage.slice(0, 60)}"; ${general.name} replied: "${reply.slice(0, 60)}"`
    recordGeneralShortTermMemory(general.id, memoryNote)
  }

  const loyaltyHint =
    general.personality.loyalty < 0.4
      ? `${general.name} 的忠诚度已降至 ${(general.personality.loyalty * 100).toFixed(0)}%，态度明显冷淡`
      : general.relationship.recentIgnored >= 5
        ? `${general.name} 已连续 ${general.relationship.recentIgnored} 次被忽视`
        : undefined

  // mode=order 时尝试从回复中提取战术解析
  const parsedOrder =
    mode === 'order'
      ? extractOrderFromReply(reply)
      : undefined

  return {
    generalId: general.id,
    generalName: general.name,
    mode,
    reply,
    parsedOrder,
    loyaltyHint,
    latencyMs: Date.now() - startedAt,
  }
}

// ─── 降级回复 ────────────────────────────────────────────────────────────────

function buildFallbackReply(general: GeneralProfile, mode: ChatMode): string {
  const { name, personality } = general
  if (mode === 'order') {
    return personality.loyalty > 0.5
      ? `${name} 遵令。将立刻部署行动，请主公放心。`
      : `${name} 知道了。`
  }
  return personality.loyalty > 0.7
    ? `主公唤末将何事？${name} 随时恭候。`
    : personality.loyalty > 0.4
      ? `何事？`
      : `（${name} 沉默，只是淡淡地看了你一眼）`
}

// ─── 战术命令提取 ────────────────────────────────────────────────────────────

const ACTION_HINT_MAP: Record<string, string> = {
  进攻: 'capture', 攻打: 'capture', 攻占: 'capture', 拿下: 'capture', 夺取: 'capture', 占领: 'capture',
  撤退: 'march', 撤兵: 'march', 后撤: 'march', 行军: 'march', 推进: 'march',
  侦察: 'recon', 探查: 'recon', 刺探: 'recon',
  驻守: 'garrison', 驻防: 'garrison', 守住: 'garrison', 防守: 'garrison',
  支援: 'support', 增援: 'support',
}

function extractOrderFromReply(reply: string): ChatResponse['parsedOrder'] | undefined {
  // 简单关键词匹配，从 LLM 的回复中提取行动意图
  for (const [keyword, action] of Object.entries(ACTION_HINT_MAP)) {
    if (reply.includes(keyword)) {
      return { action, note: reply.slice(0, 80) }
    }
  }
  return undefined
}
