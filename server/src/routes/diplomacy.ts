/**
 * diplomacy.ts — 外交路由
 *
 * 路由：
 *   POST /api/diplomacy/propose   — 创建外交提案
 *   POST /api/diplomacy/respond   — 目标将领回应提案
 *   GET  /api/diplomacy/proposals — 列出所有提案记录
 *   GET  /api/diplomacy/proposals/:id — 查看单条提案详情
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import {
  createDiplomacyProposal,
  respondToDiplomacyProposal,
  getProposal,
  listProposals,
  type DiplomacyProposalType,
} from '../agents/general/DiplomacyAgent'
import { getOrCreateGeneralProfiles } from '../agents/general/GeneralProfileStore'
import { getWorldStateReadonly } from '../application/world/WorldService'
import { readJsonBody, writeJson } from './http'

// ─── Schema ──────────────────────────────────────────────────────────────────

const ProposeSchema = z.object({
  proposerId: z.string().min(1),
  targetId: z.string().min(1),
  type: z.enum(['ceasefire', 'territory_trade', 'alliance', 'betrayal', 'intelligence'] as [DiplomacyProposalType, ...DiplomacyProposalType[]]),
  terms: z.string().min(1).max(500),
})

const RespondSchema = z.object({
  proposalId: z.string().min(1),
})

// ─── 处理器 ──────────────────────────────────────────────────────────────────

async function handleProposeRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    writeJson(res, 400, { ok: false, error: 'Invalid JSON body.' })
    return
  }
  const parsed = ProposeSchema.safeParse(body)
  if (!parsed.success) {
    writeJson(res, 422, { ok: false, error: parsed.error.message })
    return
  }

  const { proposerId, targetId, type, terms } = parsed.data
  const world = getWorldStateReadonly() as Parameters<typeof getOrCreateGeneralProfiles>[0]
  const profiles = getOrCreateGeneralProfiles(world)

  const proposer = profiles.find((p) => p.id === proposerId)
  const target = profiles.find((p) => p.id === targetId)

  if (!proposer) {
    writeJson(res, 404, { ok: false, error: `Proposer general '${proposerId}' not found.` })
    return
  }
  if (!target) {
    writeJson(res, 404, { ok: false, error: `Target general '${targetId}' not found.` })
    return
  }
  if (proposer.faction === target.faction) {
    writeJson(res, 400, { ok: false, error: 'Cannot negotiate with generals of the same faction.' })
    return
  }

  try {
    const result = await createDiplomacyProposal(proposer, target, type, terms, world)
    writeJson(res, 200, { ok: true, ...result })
  } catch (err) {
    writeJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'Internal error' })
  }
}

async function handleRespondRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    writeJson(res, 400, { ok: false, error: 'Invalid JSON body.' })
    return
  }
  const parsed = RespondSchema.safeParse(body)
  if (!parsed.success) {
    writeJson(res, 422, { ok: false, error: parsed.error.message })
    return
  }

  const { proposalId } = parsed.data
  const proposal = getProposal(proposalId)
  if (!proposal) {
    writeJson(res, 404, { ok: false, error: `Proposal '${proposalId}' not found.` })
    return
  }
  if (proposal.response) {
    writeJson(res, 409, { ok: false, error: 'Proposal already responded to.' })
    return
  }

  const world = getWorldStateReadonly() as Parameters<typeof getOrCreateGeneralProfiles>[0]
  const profiles = getOrCreateGeneralProfiles(world)
  const proposer = profiles.find((p) => p.id === proposal.proposerId)
  const target = profiles.find((p) => p.id === proposal.targetId)

  if (!proposer || !target) {
    writeJson(res, 404, { ok: false, error: 'Proposer or target general no longer found.' })
    return
  }

  try {
    const result = await respondToDiplomacyProposal(proposalId, proposer, target, world)
    writeJson(res, 200, { ok: true, ...result })
  } catch (err) {
    writeJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'Internal error' })
  }
}

function handleListProposalsRoute(_req: IncomingMessage, res: ServerResponse): void {
  const proposals = listProposals()
  writeJson(res, 200, { ok: true, count: proposals.length, proposals })
}

function handleGetProposalRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  proposalId: string,
): void {
  const proposal = getProposal(proposalId)
  if (!proposal) {
    writeJson(res, 404, { ok: false, error: `Proposal '${proposalId}' not found.` })
    return
  }
  writeJson(res, 200, { ok: true, proposal })
}

// ─── 统一分发入口 ─────────────────────────────────────────────────────────────

export async function dispatchDiplomacyRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  if (req.method === 'POST' && pathname === '/api/diplomacy/propose') {
    await handleProposeRoute(req, res)
    return
  }
  if (req.method === 'POST' && pathname === '/api/diplomacy/respond') {
    await handleRespondRoute(req, res)
    return
  }
  if (req.method === 'GET' && pathname === '/api/diplomacy/proposals') {
    handleListProposalsRoute(req, res)
    return
  }
  if (req.method === 'GET' && pathname.startsWith('/api/diplomacy/proposals/')) {
    const proposalId = pathname.slice('/api/diplomacy/proposals/'.length)
    if (!proposalId) {
      writeJson(res, 400, { ok: false, error: 'proposalId required.' })
      return
    }
    handleGetProposalRoute(req, res, proposalId)
    return
  }
  writeJson(res, 404, { error: 'Route not found.' })
}
