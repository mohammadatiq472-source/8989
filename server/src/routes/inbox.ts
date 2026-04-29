import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  claimUnifiedInboxItem,
  issueDailyWelfare,
  issueEventReward,
  issueUnifiedInboxReward,
  listUnifiedInbox,
} from '../application/inbox/UnifiedInboxService'
import {
  claimUnifiedInboxItemRequestSchema,
  issueDailyWelfareRequestSchema,
  issueEventRewardRequestSchema,
  issueUnifiedInboxRewardRequestSchema,
} from '../../../shared/schemas/inbox'
import { writeJson } from './http'
import { parseBody } from './aiPlayerRouteShared'

export async function dispatchInboxRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
): Promise<boolean> {
  if (req.method === 'GET' && pathname === '/api/inbox') {
    const factionId = url.searchParams.get('factionId')?.trim() || undefined
    const governorPlayerId = url.searchParams.get('governorPlayerId')?.trim() || undefined
    const result = listUnifiedInbox({ factionId, governorPlayerId })
    writeJson(res, result.ok ? 200 : 404, result)
    return true
  }

  if (req.method === 'POST' && pathname === '/api/inbox/claim') {
    const parsed = await parseBody(req, claimUnifiedInboxItemRequestSchema)
    if (!parsed.ok) {
      writeJson(res, 422, { ok: false, error: parsed.error })
      return true
    }

    const result = claimUnifiedInboxItem(parsed.data)
    writeJson(res, result.ok ? 200 : 404, result)
    return true
  }

  if (req.method === 'POST' && pathname === '/api/inbox/issue') {
    const parsed = await parseBody(req, issueUnifiedInboxRewardRequestSchema)
    if (!parsed.ok) {
      writeJson(res, 422, { ok: false, error: parsed.error })
      return true
    }

    const result = issueUnifiedInboxReward(parsed.data)
    writeJson(res, result.ok ? 200 : 409, result)
    return true
  }

  if (req.method === 'POST' && pathname === '/api/inbox/daily-welfare') {
    const parsed = await parseBody(req, issueDailyWelfareRequestSchema)
    if (!parsed.ok) {
      writeJson(res, 422, { ok: false, error: parsed.error })
      return true
    }

    const result = issueDailyWelfare(parsed.data)
    writeJson(res, result.ok ? 200 : 409, result)
    return true
  }

  if (req.method === 'POST' && pathname === '/api/inbox/event-reward') {
    const parsed = await parseBody(req, issueEventRewardRequestSchema)
    if (!parsed.ok) {
      writeJson(res, 422, { ok: false, error: parsed.error })
      return true
    }

    const result = issueEventReward(parsed.data)
    writeJson(res, result.ok ? 200 : 409, result)
    return true
  }

  return false
}
