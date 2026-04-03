/**
 * generalChat.ts — 将领对话路由
 *
 * 路由：
 *   GET  /api/generals                  — 列出所有将领档案（含性格摘要）
 *   POST /api/generals/:id/chat         — 与将领对话（双模：聊天/命令）
 *   GET  /api/generals/:id/chat         — 获取该将领的对话历史
 *   DELETE /api/generals/:id/chat       — 清空对话历史
 *
 * 注意：路由 ID 提取使用 pathname.match()，兼容 Node.js 原生 HTTP 无路由框架。
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { getOrCreateGeneralProfiles } from '../agents/general/GeneralProfileStore'
import { chatWithGeneral, getChatHistory, clearChatHistory } from '../agents/general/GeneralChatService'
import type { GeneralProfile } from '../agents/general/GeneralProfileStore'
import { getWorldStateReadonly } from '../application/world/WorldService'
import { readJsonBody, writeJson } from './http'
import { z } from 'zod'

// ─── 请求校验 Schema ──────────────────────────────────────────────────────────

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2_000),
  mode: z.enum(['chat', 'order', 'auto']).optional(),
})

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function extractGeneralId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/generals\/([^/]+)\/chat$/)
  return match ? (match[1] ?? null) : null
}

function buildGeneralSummary(general: GeneralProfile) {
  return {
    id: general.id,
    name: general.name,
    faction: general.faction,
    unitId: general.unitId,
    personality: {
      aggression: general.personality.aggression,
      loyalty: general.personality.loyalty,
      riskTolerance: general.personality.riskTolerance,
      speciality: general.personality.speciality,
    },
    stats: {
      battlesWon: general.history.battlesWon,
      battlesLost: general.history.battlesLost,
      lordTrust: general.relationship.lordTrust,
      recentIgnored: general.relationship.recentIgnored,
      pendingGrievanceCount: general.relationship.pendingGrievance.length,
    },
    memorySnippet: general.memory.shortTerm.slice(0, 3),
  }
}

// ─── 路由处理器 ──────────────────────────────────────────────────────────────

/**
 * GET /api/generals
 * 返回当前世界所有将领档案的摘要列表。
 */
export function handleListGeneralsRoute(_req: IncomingMessage, res: ServerResponse): void {
  const world = getWorldStateReadonly() as Parameters<typeof getOrCreateGeneralProfiles>[0]
  const profiles = getOrCreateGeneralProfiles(world)

  writeJson(res, 200, {
    ok: true,
    count: profiles.length,
    generals: profiles.map(buildGeneralSummary),
  })
}

/**
 * POST /api/generals/:id/chat
 * Body: { message: string, mode?: 'chat' | 'order' | 'auto' }
 */
export async function handleGeneralChatRoute(
  req: IncomingMessage,
  res: ServerResponse,
  generalId: string,
): Promise<void> {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    writeJson(res, 400, { ok: false, error: 'Invalid JSON body.' })
    return
  }

  const parseResult = ChatRequestSchema.safeParse(body)
  if (!parseResult.success) {
    writeJson(res, 422, { ok: false, error: parseResult.error.message })
    return
  }

  const { message, mode } = parseResult.data
  const world = getWorldStateReadonly() as Parameters<typeof getOrCreateGeneralProfiles>[0]
  const profiles = getOrCreateGeneralProfiles(world)
  const general = profiles.find((p) => p.id === generalId)

  if (!general) {
    writeJson(res, 404, { ok: false, error: `General '${generalId}' not found.` })
    return
  }

  const forcedMode = mode === 'auto' || mode === undefined ? undefined : mode

  try {
    const response = await chatWithGeneral(general, world, message, forcedMode)
    writeJson(res, 200, { ok: true, ...response })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    writeJson(res, 500, { ok: false, error: msg })
  }
}

/**
 * GET /api/generals/:id/chat
 * 返回将领的对话历史。
 */
export function handleGetChatHistoryRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  generalId: string,
): void {
  const world = getWorldStateReadonly() as Parameters<typeof getOrCreateGeneralProfiles>[0]
  const profiles = getOrCreateGeneralProfiles(world)
  const general = profiles.find((p) => p.id === generalId)

  if (!general) {
    writeJson(res, 404, { ok: false, error: `General '${generalId}' not found.` })
    return
  }

  const history = getChatHistory(generalId)
  writeJson(res, 200, {
    ok: true,
    generalId,
    generalName: general.name,
    messageCount: history.length,
    messages: history,
  })
}

/**
 * DELETE /api/generals/:id/chat
 * 清空将领的对话历史。
 */
export function handleClearChatHistoryRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  generalId: string,
): void {
  clearChatHistory(generalId)
  writeJson(res, 200, { ok: true, cleared: true, generalId })
}

// ─── 统一分发入口（供 app.ts 调用）──────────────────────────────────────────

/**
 * 分发 /api/generals 相关路由。
 * 在 app.ts 中：
 *   if (requestUrl.pathname.startsWith('/api/generals')) {
 *     await dispatchGeneralChatRoutes(req, res, requestUrl.pathname)
 *     return
 *   }
 */
export async function dispatchGeneralChatRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  // GET /api/generals — 列出所有将领
  if (req.method === 'GET' && pathname === '/api/generals') {
    handleListGeneralsRoute(req, res)
    return
  }

  // /api/generals/:id/chat — 对话相关
  const generalId = extractGeneralId(pathname)
  if (generalId) {
    if (req.method === 'POST') {
      await handleGeneralChatRoute(req, res, generalId)
      return
    }
    if (req.method === 'GET') {
      handleGetChatHistoryRoute(req, res, generalId)
      return
    }
    if (req.method === 'DELETE') {
      handleClearChatHistoryRoute(req, res, generalId)
      return
    }
  }

  writeJson(res, 404, { error: 'Route not found.' })
}
