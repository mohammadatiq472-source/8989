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
import { appendRuntimeWorldEvent, getWorldStateReadonly } from '../application/world/WorldService'
import { getFactionAutonomyLevel, resolveSessionControlMode } from '../multiplayer/SessionManager'
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

function resolveFactionControlContext(factionId: string) {
  const autonomyLevel = getFactionAutonomyLevel(factionId)
  return {
    autonomyLevel,
    controlMode: resolveSessionControlMode(autonomyLevel),
  }
}

function recordDiplomacyRuntimeEvent(params: {
  action: string
  success: boolean
  message: string
  metadata?: Record<string, unknown>
}) {
  appendRuntimeWorldEvent({
    action: params.action,
    success: params.success,
    message: params.message,
    metadata: params.metadata,
  })
}

// ─── 处理器 ──────────────────────────────────────────────────────────────────

async function handleProposeRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_propose',
      success: false,
      message: 'diplomacy propose rejected: invalid json body',
      metadata: { reason: 'invalid_json' },
    })
    writeJson(res, 400, { ok: false, error: 'Invalid JSON body.' })
    return
  }
  const parsed = ProposeSchema.safeParse(body)
  if (!parsed.success) {
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_propose',
      success: false,
      message: 'diplomacy propose rejected: invalid payload',
      metadata: { reason: 'invalid_payload' },
    })
    writeJson(res, 422, { ok: false, error: parsed.error.message })
    return
  }

  const { proposerId, targetId, type, terms } = parsed.data
  const world = getWorldStateReadonly() as Parameters<typeof getOrCreateGeneralProfiles>[0]
  const profiles = getOrCreateGeneralProfiles(world)

  const proposer = profiles.find((p) => p.id === proposerId)
  const target = profiles.find((p) => p.id === targetId)

  if (!proposer) {
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_propose',
      success: false,
      message: `proposer not found: ${proposerId}`,
      metadata: { proposerId, targetId, type, terms },
    })
    writeJson(res, 404, { ok: false, error: `Proposer general '${proposerId}' not found.` })
    return
  }
  if (!target) {
    const proposerControl = resolveFactionControlContext(proposer.faction)
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_propose',
      success: false,
      message: `target not found: ${targetId}`,
      metadata: {
        proposerId,
        targetId,
        proposerFactionId: proposer.faction,
        proposerAutonomyLevel: proposerControl.autonomyLevel,
        proposerControlMode: proposerControl.controlMode,
        type,
      },
    })
    writeJson(res, 404, { ok: false, error: `Target general '${targetId}' not found.` })
    return
  }
  if (proposer.faction === target.faction) {
    const proposerControl = resolveFactionControlContext(proposer.faction)
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_propose',
      success: false,
      message: 'cannot negotiate with same faction',
      metadata: {
        proposerId,
        targetId,
        factionId: proposer.faction,
        autonomyLevel: proposerControl.autonomyLevel,
        controlMode: proposerControl.controlMode,
      },
    })
    writeJson(res, 400, { ok: false, error: 'Cannot negotiate with generals of the same faction.' })
    return
  }

  try {
    const result = await createDiplomacyProposal(proposer, target, type, terms, world)
    const proposerControl = resolveFactionControlContext(proposer.faction)
    const targetControl = resolveFactionControlContext(target.faction)
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_propose',
      success: true,
      message: `diplomacy proposal created: ${result.proposal.id}`,
      metadata: {
        proposalId: result.proposal.id,
        type,
        proposerId,
        targetId,
        proposerFactionId: proposer.faction,
        targetFactionId: target.faction,
        proposerAutonomyLevel: proposerControl.autonomyLevel,
        proposerControlMode: proposerControl.controlMode,
        targetAutonomyLevel: targetControl.autonomyLevel,
        targetControlMode: targetControl.controlMode,
      },
    })

    writeJson(res, 200, {
      ok: true,
      ...result,
      proposerAutonomyLevel: proposerControl.autonomyLevel,
      proposerControlMode: proposerControl.controlMode,
      targetAutonomyLevel: targetControl.autonomyLevel,
      targetControlMode: targetControl.controlMode,
    })
  } catch (err) {
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_propose',
      success: false,
      message: err instanceof Error ? err.message : 'diplomacy propose failed',
      metadata: {
        proposerId,
        targetId,
        type,
      },
    })
    writeJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'Internal error' })
  }
}

async function handleRespondRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_respond',
      success: false,
      message: 'diplomacy respond rejected: invalid json body',
      metadata: { reason: 'invalid_json' },
    })
    writeJson(res, 400, { ok: false, error: 'Invalid JSON body.' })
    return
  }
  const parsed = RespondSchema.safeParse(body)
  if (!parsed.success) {
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_respond',
      success: false,
      message: 'diplomacy respond rejected: invalid payload',
      metadata: { reason: 'invalid_payload' },
    })
    writeJson(res, 422, { ok: false, error: parsed.error.message })
    return
  }

  const { proposalId } = parsed.data
  const proposal = getProposal(proposalId)
  if (!proposal) {
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_respond',
      success: false,
      message: `proposal not found: ${proposalId}`,
      metadata: { proposalId },
    })
    writeJson(res, 404, { ok: false, error: `Proposal '${proposalId}' not found.` })
    return
  }
  if (proposal.response) {
    const proposerControl = resolveFactionControlContext(proposal.proposerFaction)
    const targetControl = resolveFactionControlContext(proposal.targetFaction)
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_respond',
      success: false,
      message: `proposal already responded: ${proposalId}`,
      metadata: {
        proposalId,
        proposerFactionId: proposal.proposerFaction,
        targetFactionId: proposal.targetFaction,
        proposerAutonomyLevel: proposerControl.autonomyLevel,
        proposerControlMode: proposerControl.controlMode,
        targetAutonomyLevel: targetControl.autonomyLevel,
        targetControlMode: targetControl.controlMode,
      },
    })
    writeJson(res, 409, { ok: false, error: 'Proposal already responded to.' })
    return
  }

  const world = getWorldStateReadonly() as Parameters<typeof getOrCreateGeneralProfiles>[0]
  const profiles = getOrCreateGeneralProfiles(world)
  const proposer = profiles.find((p) => p.id === proposal.proposerId)
  const target = profiles.find((p) => p.id === proposal.targetId)

  if (!proposer || !target) {
    const proposerControl = resolveFactionControlContext(proposal.proposerFaction)
    const targetControl = resolveFactionControlContext(proposal.targetFaction)
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_respond',
      success: false,
      message: 'proposer or target general not found while responding',
      metadata: {
        proposalId,
        proposerId: proposal.proposerId,
        targetId: proposal.targetId,
        proposerFactionId: proposal.proposerFaction,
        targetFactionId: proposal.targetFaction,
        proposerAutonomyLevel: proposerControl.autonomyLevel,
        proposerControlMode: proposerControl.controlMode,
        targetAutonomyLevel: targetControl.autonomyLevel,
        targetControlMode: targetControl.controlMode,
      },
    })
    writeJson(res, 404, { ok: false, error: 'Proposer or target general no longer found.' })
    return
  }

  try {
    const result = await respondToDiplomacyProposal(proposalId, proposer, target, world)
    const proposerControl = resolveFactionControlContext(proposer.faction)
    const targetControl = resolveFactionControlContext(target.faction)
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_respond',
      success: true,
      message: `diplomacy proposal responded: ${proposalId}`,
      metadata: {
        proposalId,
        responseAction: result.proposal.response?.action,
        proposerId: proposer.id,
        targetId: target.id,
        proposerFactionId: proposer.faction,
        targetFactionId: target.faction,
        proposerAutonomyLevel: proposerControl.autonomyLevel,
        proposerControlMode: proposerControl.controlMode,
        targetAutonomyLevel: targetControl.autonomyLevel,
        targetControlMode: targetControl.controlMode,
      },
    })

    writeJson(res, 200, {
      ok: true,
      ...result,
      proposerAutonomyLevel: proposerControl.autonomyLevel,
      proposerControlMode: proposerControl.controlMode,
      targetAutonomyLevel: targetControl.autonomyLevel,
      targetControlMode: targetControl.controlMode,
    })
  } catch (err) {
    const proposerControl = resolveFactionControlContext(proposer.faction)
    const targetControl = resolveFactionControlContext(target.faction)
    recordDiplomacyRuntimeEvent({
      action: 'diplomacy_respond',
      success: false,
      message: err instanceof Error ? err.message : 'diplomacy respond failed',
      metadata: {
        proposalId,
        proposerFactionId: proposer.faction,
        targetFactionId: target.faction,
        proposerAutonomyLevel: proposerControl.autonomyLevel,
        proposerControlMode: proposerControl.controlMode,
        targetAutonomyLevel: targetControl.autonomyLevel,
        targetControlMode: targetControl.controlMode,
      },
    })
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
