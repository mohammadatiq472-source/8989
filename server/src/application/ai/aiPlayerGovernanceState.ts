import { join } from 'node:path'
import type {
  AiPlayerActionProposal,
  AiPlayerActionReceipt,
  GovernedAiPlayer,
} from '../../../../shared/contracts/aiPlayer'

export const AI_PLAYER_GOVERNANCE_PERSIST_PATH =
  process.env.AI_PLAYER_GOVERNANCE_STATE_PATH?.trim() || join(process.cwd(), 'tmp', 'ai_player_governance_state.json')
export const AI_PLAYER_GOVERNANCE_PERSIST_VERSION = 1
export const AI_PLAYER_GOVERNANCE_PERSIST_DEBOUNCE_MS = 1_000
export const MAX_PERSISTED_AI_PLAYERS = 5_000
export const MAX_PERSISTED_PROPOSALS = 20_000
export const MAX_PERSISTED_RECEIPTS_PER_PLAYER = 200
export const AI_RUNTIME_EVENT_LIMIT = 8

export const governedAiPlayers = new Map<string, GovernedAiPlayer>()
export const actionProposals = new Map<string, AiPlayerActionProposal>()
export const actionReceiptsByAiPlayer = new Map<string, AiPlayerActionReceipt[]>()

export const aiPlayerGovernancePersistState: {
  loaded: boolean
  persistEnabled: boolean
  persistDirty: boolean
  persistTimer: ReturnType<typeof setTimeout> | null
  persistInFlight: Promise<void> | null
  persistSuccessCount: number
  persistFailureCount: number
  lastPersistAt: number | null
  lastPersistErrorAt: number | null
  corruptQuarantineCount: number
  lastCorruptQuarantineAt: number | null
  restoredPlayerCount: number
  restoredProposalCount: number
  restoredReceiptCount: number
  lastRestoreAt: number | null
} = {
  loaded: false,
  persistEnabled: readBooleanFromEnv('AI_PLAYER_GOVERNANCE_PERSIST_ENABLED', true),
  persistDirty: false,
  persistTimer: null,
  persistInFlight: null,
  persistSuccessCount: 0,
  persistFailureCount: 0,
  lastPersistAt: null,
  lastPersistErrorAt: null,
  corruptQuarantineCount: 0,
  lastCorruptQuarantineAt: null,
  restoredPlayerCount: 0,
  restoredProposalCount: 0,
  restoredReceiptCount: 0,
  lastRestoreAt: null,
}

export function nowIso() {
  return new Date().toISOString()
}

export function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

export function sortByUpdatedDesc<T extends { updatedAt?: string; createdAt?: string; observedAt?: string }>(items: T[]): T[] {
  return items.sort((left, right) => {
    const leftKey = left.updatedAt ?? left.createdAt ?? left.observedAt ?? ''
    const rightKey = right.updatedAt ?? right.createdAt ?? right.observedAt ?? ''
    return rightKey.localeCompare(leftKey)
  })
}

function readBooleanFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) {
    return fallback
  }
  if (['1', 'true', 'yes', 'on'].includes(raw)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return false
  }
  return fallback
}
