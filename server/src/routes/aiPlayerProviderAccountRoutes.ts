import type { IncomingMessage, ServerResponse } from 'node:http'
import { upsertAiPlayerProviderPlayerKeyRequestSchema } from '../../../shared/schemas/aiPlayerProviderAccount'
import {
  getAiPlayerProviderAccountStoreHealth,
  getAiPlayerProviderPlayerKey,
  listAiPlayerProviderAuditEvents,
  listAiPlayerProviderBillingLedger,
  listAiPlayerProviderBudgetWindows,
  revokeAiPlayerProviderPlayerKey,
  upsertAiPlayerProviderPlayerKey,
} from '../application/ai/aiPlayerProviderAccountStore'
import { readJsonBody, writeJson } from './http'

const PREFIX = '/api/ai/provider'

function parseLimit(url: URL) {
  const parsed = Number(url.searchParams.get('limit') ?? '50')
  if (!Number.isFinite(parsed)) {
    return 50
  }
  return Math.max(1, Math.min(500, Math.trunc(parsed)))
}

function decodePathSegment(input: string | undefined): string | null {
  if (!input) {
    return null
  }
  try {
    const decoded = decodeURIComponent(input).trim()
    return /^[a-zA-Z0-9_-]{1,80}$/.test(decoded) ? decoded : null
  } catch {
    return null
  }
}

export async function dispatchAiPlayerProviderAccountRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
): Promise<boolean> {
  if (!pathname.startsWith(PREFIX)) {
    return false
  }

  if (req.method === 'GET' && pathname === `${PREFIX}/health`) {
    writeJson(res, 200, getAiPlayerProviderAccountStoreHealth())
    return true
  }

  if (req.method === 'GET' && pathname === `${PREFIX}/billing-ledger`) {
    writeJson(res, 200, listAiPlayerProviderBillingLedger({
      limit: parseLimit(url),
      aiPlayerId: url.searchParams.get('aiPlayerId')?.trim() || undefined,
      factionId: url.searchParams.get('factionId')?.trim() || undefined,
      governorPlayerId: url.searchParams.get('governorPlayerId')?.trim() || undefined,
      billingAccountType: url.searchParams.get('billingAccountType') === 'faction_byok'
        || url.searchParams.get('billingAccountType') === 'player_byok'
        || url.searchParams.get('billingAccountType') === 'platform'
        ? url.searchParams.get('billingAccountType') as 'faction_byok' | 'player_byok' | 'platform'
        : undefined,
    }))
    return true
  }

  if (req.method === 'GET' && pathname === `${PREFIX}/audit-events`) {
    const eventType = url.searchParams.get('eventType')?.trim()
    writeJson(res, 200, listAiPlayerProviderAuditEvents({
      limit: parseLimit(url),
      aiPlayerId: url.searchParams.get('aiPlayerId')?.trim() || undefined,
      factionId: url.searchParams.get('factionId')?.trim() || undefined,
      governorPlayerId: url.searchParams.get('governorPlayerId')?.trim() || undefined,
      ownerPlayerId: url.searchParams.get('ownerPlayerId')?.trim() || undefined,
      eventType: eventType === 'byok_key_configured'
        || eventType === 'byok_key_revoked'
        || eventType === 'provider_request_succeeded'
        || eventType === 'provider_request_failed'
        || eventType === 'provider_fallback_failed'
        ? eventType
        : undefined,
    }))
    return true
  }

  if (req.method === 'GET' && pathname === `${PREFIX}/budget-windows`) {
    const billingAccountType = url.searchParams.get('billingAccountType')
    const budgetTier = url.searchParams.get('budgetTier')
    writeJson(res, 200, listAiPlayerProviderBudgetWindows({
      limit: parseLimit(url),
      billingAccountType: billingAccountType === 'faction_byok'
        || billingAccountType === 'player_byok'
        || billingAccountType === 'platform'
        ? billingAccountType
        : undefined,
      billingAccountId: url.searchParams.get('billingAccountId')?.trim() || undefined,
      budgetTier: budgetTier === 'strict_action'
        || budgetTier === 'economy_chat'
        || budgetTier === 'disabled'
        ? budgetTier
        : undefined,
    }))
    return true
  }

  const suffix = pathname.slice(`${PREFIX}/player-keys/`.length)
  if (!pathname.startsWith(`${PREFIX}/player-keys/`)) {
    return false
  }
  const [ownerSegment] = suffix.split('/')
  const ownerPlayerId = decodePathSegment(ownerSegment)
  if (!ownerPlayerId) {
    writeJson(res, 400, { ok: false, error: 'ownerPlayerId is required.' })
    return true
  }

  if (req.method === 'GET') {
    writeJson(res, 200, {
      ok: true,
      key: getAiPlayerProviderPlayerKey(ownerPlayerId),
    })
    return true
  }

  if (req.method === 'POST') {
    const parsed = upsertAiPlayerProviderPlayerKeyRequestSchema.safeParse(await readJsonBody(req))
    if (!parsed.success) {
      writeJson(res, 422, { ok: false, error: parsed.error.message })
      return true
    }
    const result = upsertAiPlayerProviderPlayerKey(ownerPlayerId, parsed.data)
    writeJson(res, result.ok ? 200 : 400, result)
    return true
  }

  if (req.method === 'DELETE') {
    const actorId = url.searchParams.get('actorId')?.trim() || undefined
    const result = revokeAiPlayerProviderPlayerKey(ownerPlayerId, actorId)
    writeJson(res, result.ok ? 200 : 404, result)
    return true
  }

  return false
}
