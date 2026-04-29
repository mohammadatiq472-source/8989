import { existsSync, readFileSync, renameSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  AiPlayerActionProposal,
  AiPlayerActionReceipt,
  AiPlayerGovernancePersistHealth,
  GovernedAiPlayer,
} from '../../../../shared/contracts/aiPlayer'
import type {
  AiPlayerChatMessage,
  AiPlayerChatReadCursor,
} from '../../../../shared/contracts/aiPlayerChat'
import {
  aiPlayerActionProposalSchema,
  aiPlayerActionReceiptSchema,
  governedAiPlayerSchema,
} from '../../../../shared/schemas/aiPlayer'
import {
  aiPlayerChatMessageSchema,
  aiPlayerChatReadCursorSchema,
} from '../../../../shared/schemas/aiPlayerChat'
import {
  actionProposals,
  actionReceiptsByAiPlayer,
  aiPlayerGovernancePersistState,
  AI_PLAYER_GOVERNANCE_PERSIST_DEBOUNCE_MS,
  AI_PLAYER_GOVERNANCE_PERSIST_PATH,
  AI_PLAYER_GOVERNANCE_PERSIST_VERSION,
  cloneValue,
  chatMessagesByAiPlayer,
  chatReadCursors,
  governedAiPlayers,
  MAX_PERSISTED_CHAT_MESSAGES_PER_PLAYER,
  MAX_PERSISTED_CHAT_READ_CURSORS,
  MAX_PERSISTED_AI_PLAYERS,
  MAX_PERSISTED_PROPOSALS,
  MAX_PERSISTED_RECEIPTS_PER_PLAYER,
  sortByUpdatedDesc,
} from './aiPlayerGovernanceState'

type PersistedAiPlayerGovernanceEnvelope = {
  version?: number
  savedAt?: string
  players?: unknown
  proposals?: unknown
  receiptsByAiPlayer?: unknown
  chatMessagesByAiPlayer?: unknown
  chatReadCursors?: unknown
}

type PersistedAiPlayerReceiptBucket = {
  aiPlayerId: string
  items: unknown
}

type PersistedAiPlayerChatMessageBucket = {
  aiPlayerId: string
  items: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function quarantineCorruptPersistFile() {
  try {
    if (!existsSync(AI_PLAYER_GOVERNANCE_PERSIST_PATH)) {
      return
    }

    const quarantinedPath = `${AI_PLAYER_GOVERNANCE_PERSIST_PATH}.corrupt.${Date.now()}`
    renameSync(AI_PLAYER_GOVERNANCE_PERSIST_PATH, quarantinedPath)
    aiPlayerGovernancePersistState.corruptQuarantineCount += 1
    aiPlayerGovernancePersistState.lastCorruptQuarantineAt = Date.now()
    console.warn(`[AIPlayerGovernanceService] quarantined corrupt governance state: ${quarantinedPath}`)
  } catch {
    // non-fatal: continue with empty in-memory state
  }
}

function readPersistedEnvelope(input: unknown): PersistedAiPlayerGovernanceEnvelope {
  if (!isRecord(input)) {
    return {}
  }
  return input as PersistedAiPlayerGovernanceEnvelope
}

function sanitizeGovernedAiPlayer(input: unknown): GovernedAiPlayer | null {
  const parsed = governedAiPlayerSchema.safeParse(input)
  return parsed.success ? cloneValue(parsed.data) : null
}

function sanitizeProposal(input: unknown): AiPlayerActionProposal | null {
  const parsed = aiPlayerActionProposalSchema.safeParse(input)
  return parsed.success ? cloneValue(parsed.data) : null
}

function sanitizeReceipt(input: unknown): AiPlayerActionReceipt | null {
  const parsed = aiPlayerActionReceiptSchema.safeParse(input)
  return parsed.success ? cloneValue(parsed.data) : null
}

function sanitizeChatMessage(input: unknown): AiPlayerChatMessage | null {
  const parsed = aiPlayerChatMessageSchema.safeParse(input)
  return parsed.success ? cloneValue(parsed.data) : null
}

function sanitizeChatReadCursor(input: unknown): AiPlayerChatReadCursor | null {
  const parsed = aiPlayerChatReadCursorSchema.safeParse(input)
  return parsed.success ? cloneValue(parsed.data) : null
}

function clearPersistTimer() {
  if (!aiPlayerGovernancePersistState.persistTimer) {
    return
  }
  clearTimeout(aiPlayerGovernancePersistState.persistTimer)
  aiPlayerGovernancePersistState.persistTimer = null
}

export function loadPersistedGovernanceState() {
  if (aiPlayerGovernancePersistState.loaded) {
    return
  }
  aiPlayerGovernancePersistState.loaded = true

  if (!aiPlayerGovernancePersistState.persistEnabled || !existsSync(AI_PLAYER_GOVERNANCE_PERSIST_PATH)) {
    return
  }

  try {
    const raw = readFileSync(AI_PLAYER_GOVERNANCE_PERSIST_PATH, 'utf8')
    const parsed = readPersistedEnvelope(JSON.parse(raw))

    let nextRestoredPlayers = 0
    let nextRestoredProposals = 0
    let nextRestoredReceipts = 0

    if (Array.isArray(parsed.players)) {
      for (const item of parsed.players.slice(0, MAX_PERSISTED_AI_PLAYERS)) {
        const player = sanitizeGovernedAiPlayer(item)
        if (!player) {
          continue
        }
        governedAiPlayers.set(player.aiPlayerId, player)
        nextRestoredPlayers += 1
      }
    }

    if (Array.isArray(parsed.proposals)) {
      for (const item of parsed.proposals.slice(0, MAX_PERSISTED_PROPOSALS)) {
        const proposal = sanitizeProposal(item)
        if (!proposal) {
          continue
        }
        actionProposals.set(proposal.proposalId, proposal)
        nextRestoredProposals += 1
      }
    }

    if (Array.isArray(parsed.receiptsByAiPlayer)) {
      for (const item of parsed.receiptsByAiPlayer as PersistedAiPlayerReceiptBucket[]) {
        if (!isRecord(item) || typeof item.aiPlayerId !== 'string' || !Array.isArray(item.items)) {
          continue
        }

        const receipts: AiPlayerActionReceipt[] = []
        for (const candidate of item.items.slice(-MAX_PERSISTED_RECEIPTS_PER_PLAYER)) {
          const receipt = sanitizeReceipt(candidate)
          if (!receipt) {
            continue
          }
          receipts.push(receipt)
        }

        if (receipts.length === 0) {
          continue
        }

        actionReceiptsByAiPlayer.set(item.aiPlayerId, receipts)
        nextRestoredReceipts += receipts.length
      }
    }

    if (Array.isArray(parsed.chatMessagesByAiPlayer)) {
      for (const item of parsed.chatMessagesByAiPlayer as PersistedAiPlayerChatMessageBucket[]) {
        if (!isRecord(item) || typeof item.aiPlayerId !== 'string' || !Array.isArray(item.items)) {
          continue
        }

        const messages: AiPlayerChatMessage[] = []
        for (const candidate of item.items.slice(-MAX_PERSISTED_CHAT_MESSAGES_PER_PLAYER)) {
          const message = sanitizeChatMessage(candidate)
          if (!message) {
            continue
          }
          messages.push(message)
        }

        if (messages.length === 0) {
          continue
        }

        chatMessagesByAiPlayer.set(item.aiPlayerId, messages)
      }
    }

    if (Array.isArray(parsed.chatReadCursors)) {
      for (const item of parsed.chatReadCursors.slice(0, MAX_PERSISTED_CHAT_READ_CURSORS)) {
        const cursor = sanitizeChatReadCursor(item)
        if (!cursor) {
          continue
        }
        chatReadCursors.set(`${cursor.aiPlayerId}:${cursor.readerId}`, cursor)
      }
    }

    aiPlayerGovernancePersistState.restoredPlayerCount = nextRestoredPlayers
    aiPlayerGovernancePersistState.restoredProposalCount = nextRestoredProposals
    aiPlayerGovernancePersistState.restoredReceiptCount = nextRestoredReceipts
    aiPlayerGovernancePersistState.lastRestoreAt = Date.now()
  } catch {
    governedAiPlayers.clear()
    actionProposals.clear()
    actionReceiptsByAiPlayer.clear()
    chatMessagesByAiPlayer.clear()
    chatReadCursors.clear()
    quarantineCorruptPersistFile()
  }
}

export function ensureAiPlayerGovernanceLoaded() {
  if (!aiPlayerGovernancePersistState.loaded) {
    loadPersistedGovernanceState()
  }
}

function buildPersistedGovernanceEnvelope(): PersistedAiPlayerGovernanceEnvelope {
  const players = Array.from(governedAiPlayers.values())
    .sort((left, right) => left.aiPlayerId.localeCompare(right.aiPlayerId))
    .slice(0, MAX_PERSISTED_AI_PLAYERS)
  const proposals = sortByUpdatedDesc(Array.from(actionProposals.values()))
    .slice(0, MAX_PERSISTED_PROPOSALS)
  const receiptsByAiPlayer = Array.from(actionReceiptsByAiPlayer.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([aiPlayerId, items]) => ({
      aiPlayerId,
      items: items.slice(-MAX_PERSISTED_RECEIPTS_PER_PLAYER),
    }))
  const persistedChatMessagesByAiPlayer = Array.from(chatMessagesByAiPlayer.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([aiPlayerId, items]) => ({
      aiPlayerId,
      items: items.slice(-MAX_PERSISTED_CHAT_MESSAGES_PER_PLAYER),
    }))
  const persistedChatReadCursors = Array.from(chatReadCursors.values())
    .sort((left, right) =>
      left.aiPlayerId.localeCompare(right.aiPlayerId) ||
      left.readerId.localeCompare(right.readerId),
    )
    .slice(0, MAX_PERSISTED_CHAT_READ_CURSORS)

  return {
    version: AI_PLAYER_GOVERNANCE_PERSIST_VERSION,
    savedAt: new Date().toISOString(),
    players,
    proposals,
    receiptsByAiPlayer,
    chatMessagesByAiPlayer: persistedChatMessagesByAiPlayer,
    chatReadCursors: persistedChatReadCursors,
  }
}

export function scheduleAiPlayerGovernancePersist() {
  ensureAiPlayerGovernanceLoaded()
  if (!aiPlayerGovernancePersistState.persistEnabled) {
    return
  }

  aiPlayerGovernancePersistState.persistDirty = true
  if (aiPlayerGovernancePersistState.persistTimer) {
    return
  }

  aiPlayerGovernancePersistState.persistTimer = setTimeout(() => {
    aiPlayerGovernancePersistState.persistTimer = null
    void persistGovernanceState()
  }, AI_PLAYER_GOVERNANCE_PERSIST_DEBOUNCE_MS)
}

async function persistGovernanceState() {
  ensureAiPlayerGovernanceLoaded()
  if (!aiPlayerGovernancePersistState.persistEnabled) {
    return
  }

  if (aiPlayerGovernancePersistState.persistInFlight) {
    await aiPlayerGovernancePersistState.persistInFlight
    return
  }

  if (!aiPlayerGovernancePersistState.persistDirty) {
    return
  }

  aiPlayerGovernancePersistState.persistInFlight = (async () => {
    try {
      while (aiPlayerGovernancePersistState.persistDirty) {
        aiPlayerGovernancePersistState.persistDirty = false
        const payload = JSON.stringify(buildPersistedGovernanceEnvelope(), null, 2)
        await mkdir(dirname(AI_PLAYER_GOVERNANCE_PERSIST_PATH), { recursive: true })
        const tmpPath = `${AI_PLAYER_GOVERNANCE_PERSIST_PATH}.tmp-${process.pid}-${Date.now()}`
        await writeFile(tmpPath, payload, 'utf8')
        await rename(tmpPath, AI_PLAYER_GOVERNANCE_PERSIST_PATH)
        aiPlayerGovernancePersistState.persistSuccessCount += 1
        aiPlayerGovernancePersistState.lastPersistAt = Date.now()
      }
    } catch {
      aiPlayerGovernancePersistState.persistDirty = true
      aiPlayerGovernancePersistState.persistFailureCount += 1
      aiPlayerGovernancePersistState.lastPersistErrorAt = Date.now()
    } finally {
      aiPlayerGovernancePersistState.persistInFlight = null
      if (aiPlayerGovernancePersistState.persistDirty) {
        scheduleAiPlayerGovernancePersist()
      }
    }
  })()

  await aiPlayerGovernancePersistState.persistInFlight
}

export function storeAiPlayerActionReceipt(receipt: AiPlayerActionReceipt) {
  const receipts = actionReceiptsByAiPlayer.get(receipt.aiPlayerId) ?? []
  receipts.push(cloneValue(receipt))
  if (receipts.length > MAX_PERSISTED_RECEIPTS_PER_PLAYER) {
    receipts.splice(0, receipts.length - MAX_PERSISTED_RECEIPTS_PER_PLAYER)
  }
  actionReceiptsByAiPlayer.set(receipt.aiPlayerId, receipts)
  scheduleAiPlayerGovernancePersist()
}

export async function flushAiPlayerGovernancePersist(): Promise<void> {
  ensureAiPlayerGovernanceLoaded()
  if (!aiPlayerGovernancePersistState.persistEnabled) {
    return
  }

  clearPersistTimer()
  if (!aiPlayerGovernancePersistState.persistDirty) {
    if (aiPlayerGovernancePersistState.persistInFlight) {
      await aiPlayerGovernancePersistState.persistInFlight
    }
    return
  }

  await persistGovernanceState()
}

export function getPendingProposalCountForAllPlayers(): number {
  let count = 0
  for (const proposal of actionProposals.values()) {
    if (proposal.status === 'pending_approval') {
      count += 1
    }
  }
  return count
}

export function getAiPlayerGovernancePersistHealth(): AiPlayerGovernancePersistHealth {
  ensureAiPlayerGovernanceLoaded()
  let receiptCount = 0
  for (const receipts of actionReceiptsByAiPlayer.values()) {
    receiptCount += receipts.length
  }
  let pausedPlayerCount = 0
  let disabledPlayerCount = 0
  for (const player of governedAiPlayers.values()) {
    if (player.paused) {
      pausedPlayerCount += 1
    }
    if (!player.enabled) {
      disabledPlayerCount += 1
    }
  }

  return {
    path: AI_PLAYER_GOVERNANCE_PERSIST_PATH,
    enabled: aiPlayerGovernancePersistState.persistEnabled,
    loaded: aiPlayerGovernancePersistState.loaded,
    playerCount: governedAiPlayers.size,
    pausedPlayerCount,
    disabledPlayerCount,
    proposalCount: actionProposals.size,
    pendingProposalCount: getPendingProposalCountForAllPlayers(),
    receiptCount,
    persistDirty: aiPlayerGovernancePersistState.persistDirty,
    persistInFlight: Boolean(aiPlayerGovernancePersistState.persistInFlight),
    persistSuccessCount: aiPlayerGovernancePersistState.persistSuccessCount,
    persistFailureCount: aiPlayerGovernancePersistState.persistFailureCount,
    lastPersistAt: aiPlayerGovernancePersistState.lastPersistAt,
    lastPersistErrorAt: aiPlayerGovernancePersistState.lastPersistErrorAt,
    corruptQuarantineCount: aiPlayerGovernancePersistState.corruptQuarantineCount,
    lastCorruptQuarantineAt: aiPlayerGovernancePersistState.lastCorruptQuarantineAt,
    restoredPlayerCount: aiPlayerGovernancePersistState.restoredPlayerCount,
    restoredProposalCount: aiPlayerGovernancePersistState.restoredProposalCount,
    restoredReceiptCount: aiPlayerGovernancePersistState.restoredReceiptCount,
    lastRestoreAt: aiPlayerGovernancePersistState.lastRestoreAt,
    persistVersion: AI_PLAYER_GOVERNANCE_PERSIST_VERSION,
  }
}

export function resetAiPlayerGovernancePersistForTests() {
  clearPersistTimer()
  governedAiPlayers.clear()
  actionProposals.clear()
  actionReceiptsByAiPlayer.clear()
  chatMessagesByAiPlayer.clear()
  chatReadCursors.clear()
  aiPlayerGovernancePersistState.loaded = true
  aiPlayerGovernancePersistState.persistDirty = false
  aiPlayerGovernancePersistState.persistInFlight = null
  aiPlayerGovernancePersistState.persistSuccessCount = 0
  aiPlayerGovernancePersistState.persistFailureCount = 0
  aiPlayerGovernancePersistState.lastPersistAt = null
  aiPlayerGovernancePersistState.lastPersistErrorAt = null
  aiPlayerGovernancePersistState.corruptQuarantineCount = 0
  aiPlayerGovernancePersistState.lastCorruptQuarantineAt = null
  aiPlayerGovernancePersistState.restoredPlayerCount = 0
  aiPlayerGovernancePersistState.restoredProposalCount = 0
  aiPlayerGovernancePersistState.restoredReceiptCount = 0
  aiPlayerGovernancePersistState.lastRestoreAt = null
}
