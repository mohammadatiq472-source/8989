import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  approveAiPlayerActionProposal,
  createAiPlayerActionProposal,
  executeAiPlayerActionProposal,
  getAiPlayerActionProposal,
  listAiPlayerActionProposals,
  rejectAiPlayerActionProposal,
} from '../application/ai/AIPlayerGovernanceService'
import {
  aiPlayerActionProposalRequestSchema,
  aiPlayerProposalStatusSchema,
  approveAiPlayerProposalRequestSchema,
  executeAiPlayerProposalRequestSchema,
  rejectAiPlayerProposalRequestSchema,
} from '../../../shared/schemas/aiPlayer'
import {
  recordAiPlayerProposalFailureInChat,
  recordAiPlayerProposalInChat,
  recordAiPlayerReceiptInChat,
} from '../application/ai/aiPlayerChatCommandService'
import { writeJson } from './http'
import { parseBody, parseOptionalLimit } from './aiPlayerRouteShared'

async function handleCreateProposalRoute(req: IncomingMessage, res: ServerResponse) {
  const parsed = await parseBody(req, aiPlayerActionProposalRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = createAiPlayerActionProposal(parsed.data)
  if (result.error) {
    writeJson(res, 400, { ok: false, error: result.error })
    return
  }

  const chatRecord = result.proposal ? recordAiPlayerProposalInChat(result.proposal) : {
    proposalMessage: null,
    aggregateMessage: null,
  }

  writeJson(res, 200, {
    ok: true,
    proposal: result.proposal,
    chatMessage: chatRecord.proposalMessage,
    aggregateChatMessage: chatRecord.aggregateMessage,
  })
}

function handleListProposalsRoute(_req: IncomingMessage, res: ServerResponse, url: URL) {
  const aiPlayerId = url.searchParams.get('aiPlayerId')?.trim() || undefined
  const statusRaw = url.searchParams.get('status')?.trim()
  let status: ReturnType<typeof aiPlayerProposalStatusSchema.parse> | undefined
  if (statusRaw) {
    const parsedStatus = aiPlayerProposalStatusSchema.safeParse(statusRaw)
    if (!parsedStatus.success) {
      writeJson(res, 422, { ok: false, error: parsedStatus.error.message })
      return
    }
    status = parsedStatus.data
  }

  const limit = parseOptionalLimit(url.searchParams.get('limit'), 50)
  const items = listAiPlayerActionProposals({ aiPlayerId, status, limit })
  writeJson(res, 200, {
    items,
    count: items.length,
  })
}

function handleGetProposalRoute(_req: IncomingMessage, res: ServerResponse, proposalId: string) {
  const proposal = getAiPlayerActionProposal(proposalId)
  if (!proposal) {
    writeJson(res, 404, { ok: false, error: `proposal not found: ${proposalId}` })
    return
  }

  writeJson(res, 200, {
    ok: true,
    proposal,
  })
}

async function handleApproveProposalRoute(req: IncomingMessage, res: ServerResponse, proposalId: string) {
  const parsed = await parseBody(req, approveAiPlayerProposalRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = approveAiPlayerActionProposal(proposalId, parsed.data)
  if (result.error) {
    writeJson(res, result.error.includes('not found') ? 404 : 409, { ok: false, error: result.error })
    return
  }

  writeJson(res, 200, {
    ok: true,
    proposal: result.proposal,
  })
}

async function handleRejectProposalRoute(req: IncomingMessage, res: ServerResponse, proposalId: string) {
  const parsed = await parseBody(req, rejectAiPlayerProposalRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = rejectAiPlayerActionProposal(proposalId, parsed.data)
  if (result.error) {
    writeJson(res, result.error.includes('not found') ? 404 : 409, { ok: false, error: result.error })
    return
  }

  writeJson(res, 200, {
    ok: true,
    proposal: result.proposal,
  })
}

async function handleExecuteProposalRoute(req: IncomingMessage, res: ServerResponse, proposalId: string) {
  const parsed = await parseBody(req, executeAiPlayerProposalRequestSchema)
  if (!parsed.ok) {
    writeJson(res, 422, { ok: false, error: parsed.error })
    return
  }

  const result = await executeAiPlayerActionProposal(proposalId, parsed.data)
  if (result.error) {
    const status = result.error.includes('not found')
      ? 404
      : result.error.includes('not approved') || result.error.includes('not executable')
        ? 409
        : 400
    const chatMessage = result.proposal && result.failureCode
      ? recordAiPlayerProposalFailureInChat({
        proposal: result.proposal,
        failureCode: result.failureCode,
        error: result.error,
        recoveryHint: result.recoveryHint,
      })
      : null
    writeJson(res, status, {
      ok: false,
      error: result.error,
      failureCode: result.failureCode ?? null,
      recoveryHint: result.recoveryHint,
      proposal: result.proposal,
      chatMessage,
    })
    return
  }

  writeJson(res, 200, {
    ok: true,
    proposal: result.proposal,
    receipt: result.receipt,
    chatMessage: result.receipt ? recordAiPlayerReceiptInChat(result.receipt) : null,
  })
}

export async function dispatchAiPlayerProposalRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
): Promise<boolean> {
  if (req.method === 'POST' && pathname === '/api/ai/players/proposals') {
    await handleCreateProposalRoute(req, res)
    return true
  }

  if (req.method === 'GET' && pathname === '/api/ai/players/proposals') {
    handleListProposalsRoute(req, res, url)
    return true
  }

  if (!pathname.startsWith('/api/ai/players/proposals/')) {
    return false
  }

  const suffix = pathname.slice('/api/ai/players/proposals/'.length)
  const [proposalId, operation] = suffix.split('/')
  if (!proposalId) {
    writeJson(res, 400, { ok: false, error: 'proposalId required.' })
    return true
  }

  if (req.method === 'GET' && !operation) {
    handleGetProposalRoute(req, res, proposalId)
    return true
  }
  if (req.method === 'POST' && operation === 'approve') {
    await handleApproveProposalRoute(req, res, proposalId)
    return true
  }
  if (req.method === 'POST' && operation === 'reject') {
    await handleRejectProposalRoute(req, res, proposalId)
    return true
  }
  if (req.method === 'POST' && operation === 'execute') {
    await handleExecuteProposalRoute(req, res, proposalId)
    return true
  }

  return false
}
