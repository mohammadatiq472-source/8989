/**
 * SessionManager.ts - multiplayer session boundaries and autonomy transitions.
 */

import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type AutonomyLevel = 'L1_assigned' | 'L2_delegated' | 'L3_negotiated'
export type SessionControlMode = 'human_assigned' | 'ai_delegated' | 'ai_negotiated'
export type SessionAuthErrorCode = 'invalid_token_format' | 'invalid_token' | 'token_expired'

export type SessionTokenState = {
  issuedAt: number
  expiresAt: number
  remainingMs: number
  expired: boolean
}

export type PlayerSession = {
  sessionId: string
  token: string
  tokenIssuedAt: number
  tokenExpiresAt: number
  factionId: string
  seatId: number
  playerName: string
  joinedAt: number
  lastHeartbeat: number
  autonomyLevel: AutonomyLevel
}

export type SessionStatus = {
  players: Array<{
    sessionId: string
    factionId: string
    seatId: number
    playerName: string
    online: boolean
    autonomyLevel: AutonomyLevel
  }>
  aiControlledFactions: string[]
}

export type SessionRuntimeConfig = {
  heartbeatTimeoutMs: number
  staleSessionTtlMs: number
  tokenMaxAgeMs: number
  maxActiveSessions: number
  maxSeatsPerFaction: number
  maxPlayerNameLength: number
}

export type SessionMetrics = {
  activeSessions: number
  onlineSessions: number
  delegatedSessions: number
  claimedFactions: number
  maxActiveSessions: number
  maxSeatsPerFaction: number
  heartbeatTimeoutMs: number
  staleSessionTtlMs: number
  tokenMaxAgeMs: number
  maxPlayerNameLength: number
}

export type FactionSessionSnapshot = {
  factionId: string
  autonomyLevel: AutonomyLevel
  playerName?: string
  playerNames: string[]
  online: boolean
  seatCount: number
  onlineSeatCount: number
}

type PersistedSessionEnvelope = {
  version?: number
  savedAt?: string
  sessions?: unknown
}

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000
const DEFAULT_STALE_SESSION_TTL_MS = 10 * 60_000
const DEFAULT_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60_000
const DEFAULT_MAX_ACTIVE_SESSIONS = 1024
const DEFAULT_MAX_SEATS_PER_FACTION = 10
const DEFAULT_MAX_PLAYER_NAME_LENGTH = 32
const SESSION_STATE_PERSIST_VERSION = 1
const SESSION_STATE_PERSIST_DEBOUNCE_MS = 1_000
const MAX_PERSISTED_SESSIONS = 4_096
const SESSION_STATE_PERSIST_PATH =
  process.env.SESSION_STATE_PERSIST_PATH?.trim() || join(process.cwd(), 'tmp', 'session_state.json')

const MIN_HEARTBEAT_TIMEOUT_MS = 5_000
const MAX_HEARTBEAT_TIMEOUT_MS = 5 * 60_000
const MIN_STALE_TTL_MS = 30_000
const MAX_STALE_TTL_MS = 24 * 60 * 60_000
const MIN_TOKEN_MAX_AGE_MS = 60_000
const MAX_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60_000
const MIN_MAX_ACTIVE_SESSIONS = 1
const MAX_MAX_ACTIVE_SESSIONS = 20_000
const MIN_MAX_SEATS_PER_FACTION = 1
const MAX_MAX_SEATS_PER_FACTION = 64
const MIN_MAX_PLAYER_NAME_LENGTH = 8
const MAX_MAX_PLAYER_NAME_LENGTH = 64

const TOKEN_PATTERN = /^[a-f0-9]{48}$/

const sessions = new Map<string, PlayerSession>()
const factionSessions = new Map<string, Set<string>>()
let loaded = false
let persistEnabled = readBooleanFromEnv('SESSION_PERSIST_ENABLED', true)
let persistDirty = false
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistInFlight: Promise<void> | null = null
let persistSuccessCount = 0
let persistFailureCount = 0
let lastPersistAt: number | null = null
let lastPersistErrorAt: number | null = null
let corruptQuarantineCount = 0
let lastCorruptQuarantineAt: number | null = null
let restoredSessionCount = 0
let lastRestoreAt: number | null = null

let runtimeConfig = loadRuntimeConfigFromEnv()
let nowSource: () => number = () => Date.now()

loadPersistedSessionState()

export function joinSession(
  factionId: string,
  playerName: string,
  validFactions: string[],
): PlayerSession | { error: string } {
  ensureLoaded()
  sweepTimeoutsAndPruneStaleSessions()

  if (!validFactions.includes(factionId)) {
    return { error: `Unknown faction: ${factionId}` }
  }

  const normalizedName = normalizePlayerName(playerName)
  if (!normalizedName) {
    return { error: `Invalid playerName (1-${runtimeConfig.maxPlayerNameLength} chars required)` }
  }

  if (sessions.size >= runtimeConfig.maxActiveSessions) {
    return { error: `Session capacity reached (${runtimeConfig.maxActiveSessions})` }
  }

  const existingFactionSessions = listFactionSessions(factionId)
  if (existingFactionSessions.length >= runtimeConfig.maxSeatsPerFaction) {
    return { error: `Faction ${factionId} seat capacity reached (${runtimeConfig.maxSeatsPerFaction})` }
  }

  const now = nowMs()
  const token = generateToken()
  const seatId = allocateSeatId(existingFactionSessions, runtimeConfig.maxSeatsPerFaction)
  const tokenIssuedAt = now
  const tokenExpiresAt = now + runtimeConfig.tokenMaxAgeMs
  const session: PlayerSession = {
    sessionId: randomUUID(),
    token,
    tokenIssuedAt,
    tokenExpiresAt,
    factionId,
    seatId,
    playerName: normalizedName,
    joinedAt: now,
    lastHeartbeat: now,
    autonomyLevel: 'L1_assigned',
  }

  sessions.set(token, session)
  registerFactionToken(factionId, token)
  schedulePersist()

  return session
}

export function heartbeat(token: string): {
  ok: boolean
  error?: string
  errorCode?: SessionAuthErrorCode
  tokenState?: SessionTokenState
} {
  const tokenValidation = resolveTokenSession(token, {
    touchHeartbeat: true,
    forceAssignedAutonomy: true,
  })
  if (!tokenValidation.ok) {
    return {
      ok: false,
      error: tokenValidation.error,
      errorCode: tokenValidation.errorCode,
    }
  }

  return {
    ok: true,
    tokenState: tokenValidation.tokenState,
  }
}

export function leaveSession(token: string): {
  ok: boolean
  error?: string
  errorCode?: SessionAuthErrorCode
  tokenState?: SessionTokenState
} {
  const tokenValidation = resolveTokenSession(token)
  if (!tokenValidation.ok) {
    return {
      ok: false,
      error: tokenValidation.error,
      errorCode: tokenValidation.errorCode,
    }
  }

  const previousTokenState = tokenValidation.tokenState
  const removed = removeSessionByToken(token)
  if (removed) {
    schedulePersist()
    return {
      ok: true,
      tokenState: previousTokenState,
    }
  }
  return { ok: false, error: 'Invalid token', errorCode: 'invalid_token' }
}

export function getSessionStatus(allFactionIds: string[]): SessionStatus {
  sweepTimeoutsAndPruneStaleSessions()

  const players: SessionStatus['players'] = []
  const now = nowMs()

  for (const session of sessions.values()) {
    players.push({
      sessionId: session.sessionId,
      factionId: session.factionId,
      seatId: session.seatId,
      playerName: session.playerName,
      online: isOnline(session, now),
      autonomyLevel: session.autonomyLevel,
    })
  }

  const aiControlledFactions = allFactionIds.filter((faction) => getFactionAutonomyLevel(faction) !== 'L1_assigned')
  return { players, aiControlledFactions }
}

export function getSessionMetrics(): SessionMetrics {
  sweepTimeoutsAndPruneStaleSessions()

  const now = nowMs()
  let onlineSessions = 0
  let delegatedSessions = 0

  for (const session of sessions.values()) {
    if (isOnline(session, now)) {
      onlineSessions += 1
    }
    if (session.autonomyLevel === 'L2_delegated') {
      delegatedSessions += 1
    }
  }

  return {
    activeSessions: sessions.size,
    onlineSessions,
    delegatedSessions,
    claimedFactions: factionSessions.size,
    maxActiveSessions: runtimeConfig.maxActiveSessions,
    maxSeatsPerFaction: runtimeConfig.maxSeatsPerFaction,
    heartbeatTimeoutMs: runtimeConfig.heartbeatTimeoutMs,
    staleSessionTtlMs: runtimeConfig.staleSessionTtlMs,
    tokenMaxAgeMs: runtimeConfig.tokenMaxAgeMs,
    maxPlayerNameLength: runtimeConfig.maxPlayerNameLength,
  }
}

export function getFactionAutonomyLevel(factionId: string): AutonomyLevel {
  sweepTimeoutsAndPruneStaleSessions()
  const factionState = getFactionAutonomyState(factionId)
  return factionState.autonomyLevel
}

export function resolveSessionControlMode(autonomyLevel: AutonomyLevel): SessionControlMode {
  if (autonomyLevel === 'L1_assigned') {
    return 'human_assigned'
  }
  if (autonomyLevel === 'L3_negotiated') {
    return 'ai_negotiated'
  }
  return 'ai_delegated'
}

export function getSessionControlContextByToken(token: string): {
  factionId: string
  autonomyLevel: AutonomyLevel
  controlMode: SessionControlMode
} | null {
  const tokenValidation = resolveTokenSession(token)
  if (!tokenValidation.ok) {
    return null
  }

  const autonomyLevel = getFactionAutonomyLevel(tokenValidation.session.factionId)
  return {
    factionId: tokenValidation.session.factionId,
    autonomyLevel,
    controlMode: resolveSessionControlMode(autonomyLevel),
  }
}

export function getSessionTokenStateByToken(token: string): SessionTokenState | null {
  const tokenValidation = resolveTokenSession(token)
  if (!tokenValidation.ok) {
    return null
  }
  return tokenValidation.tokenState
}

export function sweepAllTimeouts(): void {
  sweepTimeoutsAndPruneStaleSessions()
}

export function getAllL2FactionIds(allFactionIds: string[]): string[] {
  return getAllAutonomousFactionIds(allFactionIds)
}

export function getAllAutonomousFactionIds(allFactionIds: string[]): string[] {
  sweepTimeoutsAndPruneStaleSessions()
  return allFactionIds.filter((faction) => getFactionAutonomyState(faction).autonomyLevel !== 'L1_assigned')
}

export function getFactionSessionSnapshot(factionId: string): FactionSessionSnapshot {
  sweepTimeoutsAndPruneStaleSessions()

  const state = getFactionAutonomyState(factionId)
  if (state.sessions.length === 0) {
    return {
      factionId,
      autonomyLevel: 'L2_delegated',
      playerNames: [],
      online: false,
      seatCount: 0,
      onlineSeatCount: 0,
    }
  }

  const onlineSessions = state.onlineSessions
  const primary = onlineSessions[0] ?? state.sessions[0]
  const uniquePlayerNames = Array.from(
    new Set(
      state.sessions
        .map((session) => session.playerName)
        .filter((name) => name.trim().length > 0),
    ),
  )

  return {
    factionId,
    autonomyLevel: state.autonomyLevel,
    playerName: primary?.playerName,
    playerNames: uniquePlayerNames.slice(0, 16),
    online: onlineSessions.length > 0,
    seatCount: state.sessions.length,
    onlineSeatCount: onlineSessions.length,
  }
}

export function setSessionAutonomyLevel(
  token: string,
  autonomyLevel: AutonomyLevel,
): {
  ok: boolean
  error?: string
  errorCode?: SessionAuthErrorCode
  tokenState?: SessionTokenState
} {
  const tokenValidation = resolveTokenSession(token, {
    touchHeartbeat: true,
    forceAssignedAutonomy: false,
  })
  if (!tokenValidation.ok) {
    return {
      ok: false,
      error: tokenValidation.error,
      errorCode: tokenValidation.errorCode,
    }
  }

  tokenValidation.session.autonomyLevel = autonomyLevel
  schedulePersist()
  return {
    ok: true,
    tokenState: buildTokenState(tokenValidation.session),
  }
}

export function validateToken(token: string): { factionId: string; tokenState: SessionTokenState } | null {
  const tokenValidation = resolveTokenSession(token, {
    touchHeartbeat: true,
    forceAssignedAutonomy: true,
  })
  if (!tokenValidation.ok) {
    return null
  }

  return {
    factionId: tokenValidation.session.factionId,
    tokenState: tokenValidation.tokenState,
  }
}

export function getSessionRuntimeConfig(): SessionRuntimeConfig {
  return { ...runtimeConfig }
}

export function setSessionRuntimeConfigForTests(partial: Partial<SessionRuntimeConfig>): void {
  runtimeConfig = normalizeRuntimeConfig(partial, runtimeConfig)
}

export function setSessionTimeSourceForTests(source: () => number): void {
  nowSource = source
}

export function resetSessionManagerForTests(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  sessions.clear()
  factionSessions.clear()
  persistEnabled = false
  persistDirty = false
  persistInFlight = null
  persistSuccessCount = 0
  persistFailureCount = 0
  lastPersistAt = null
  lastPersistErrorAt = null
  corruptQuarantineCount = 0
  lastCorruptQuarantineAt = null
  restoredSessionCount = 0
  lastRestoreAt = null
  loaded = true
  runtimeConfig = loadRuntimeConfigFromEnv()
  nowSource = () => Date.now()
}

function nowMs() {
  return nowSource()
}

function buildTokenState(session: PlayerSession, now = nowMs()): SessionTokenState {
  return {
    issuedAt: session.tokenIssuedAt,
    expiresAt: session.tokenExpiresAt,
    remainingMs: Math.max(0, session.tokenExpiresAt - now),
    expired: now >= session.tokenExpiresAt,
  }
}

function resolveTokenSession(
  token: string,
  options: {
    touchHeartbeat?: boolean
    forceAssignedAutonomy?: boolean
  } = {},
):
  | {
      ok: true
      session: PlayerSession
      tokenState: SessionTokenState
    }
  | {
      ok: false
      error: string
      errorCode: SessionAuthErrorCode
    } {
  if (!isTokenFormatValid(token)) {
    return {
      ok: false,
      error: 'Invalid token format',
      errorCode: 'invalid_token_format',
    }
  }

  sweepTimeoutsAndPruneStaleSessions(false)

  const session = sessions.get(token)
  if (!session) {
    return {
      ok: false,
      error: 'Invalid token',
      errorCode: 'invalid_token',
    }
  }

  const now = nowMs()
  if (now >= session.tokenExpiresAt) {
    removeSessionByToken(token)
    schedulePersist()
    return {
      ok: false,
      error: 'Token expired',
      errorCode: 'token_expired',
    }
  }

  if (options.touchHeartbeat) {
    const previousHeartbeat = session.lastHeartbeat
    const previousAutonomy = session.autonomyLevel
    session.lastHeartbeat = now
    if (options.forceAssignedAutonomy && session.autonomyLevel !== 'L1_assigned') {
      session.autonomyLevel = 'L1_assigned'
    }

    if (session.lastHeartbeat !== previousHeartbeat || session.autonomyLevel !== previousAutonomy) {
      schedulePersist()
    }
  }

  return {
    ok: true,
    session,
    tokenState: buildTokenState(session, now),
  }
}

function getFactionTokens(factionId: string) {
  return factionSessions.get(factionId)
}

function listFactionSessions(factionId: string): PlayerSession[] {
  const tokens = getFactionTokens(factionId)
  if (!tokens || tokens.size === 0) {
    return []
  }

  const result: PlayerSession[] = []
  for (const token of tokens.values()) {
    const session = sessions.get(token)
    if (session) {
      result.push(session)
    }
  }

  return result
}

function registerFactionToken(factionId: string, token: string): void {
  let tokens = factionSessions.get(factionId)
  if (!tokens) {
    tokens = new Set<string>()
    factionSessions.set(factionId, tokens)
  }
  tokens.add(token)
}

function unregisterFactionToken(factionId: string, token: string): void {
  const tokens = factionSessions.get(factionId)
  if (!tokens) {
    return
  }

  tokens.delete(token)
  if (tokens.size === 0) {
    factionSessions.delete(factionId)
  }
}

function allocateSeatId(existingSessions: PlayerSession[], maxSeats: number): number {
  const used = new Set(existingSessions.map((item) => item.seatId))
  for (let seatId = 1; seatId <= maxSeats; seatId += 1) {
    if (!used.has(seatId)) {
      return seatId
    }
  }
  return maxSeats + 1
}

function removeSessionByToken(token: string): boolean {
  const session = sessions.get(token)
  if (!session) {
    return false
  }

  sessions.delete(token)
  unregisterFactionToken(session.factionId, token)
  return true
}

function isOnline(session: PlayerSession, now = nowMs()): boolean {
  return now - session.lastHeartbeat < runtimeConfig.heartbeatTimeoutMs
}

function getFactionAutonomyState(factionId: string): {
  autonomyLevel: AutonomyLevel
  sessions: PlayerSession[]
  onlineSessions: PlayerSession[]
} {
  const factionAllSessions = listFactionSessions(factionId)
  if (factionAllSessions.length === 0) {
    return {
      autonomyLevel: 'L2_delegated',
      sessions: [],
      onlineSessions: [],
    }
  }

  const now = nowMs()
  const onlineSessions = factionAllSessions.filter((session) => isOnline(session, now))
  if (onlineSessions.length === 0) {
    return {
      autonomyLevel: 'L2_delegated',
      sessions: factionAllSessions,
      onlineSessions,
    }
  }

  if (onlineSessions.some((session) => session.autonomyLevel === 'L1_assigned')) {
    return {
      autonomyLevel: 'L1_assigned',
      sessions: factionAllSessions,
      onlineSessions,
    }
  }

  if (onlineSessions.some((session) => session.autonomyLevel === 'L3_negotiated')) {
    return {
      autonomyLevel: 'L3_negotiated',
      sessions: factionAllSessions,
      onlineSessions,
    }
  }

  return {
    autonomyLevel: 'L2_delegated',
    sessions: factionAllSessions,
    onlineSessions,
  }
}

function sweepTimeoutsAndPruneStaleSessions(pruneExpiredTokens = true): void {
  ensureLoaded()
  const now = nowMs()
  let changed = false

  for (const [token, session] of sessions.entries()) {
    const elapsedMs = now - session.lastHeartbeat

    if (pruneExpiredTokens && now >= session.tokenExpiresAt) {
      removeSessionByToken(token)
      changed = true
      continue
    }

    if (elapsedMs >= runtimeConfig.staleSessionTtlMs) {
      removeSessionByToken(token)
      changed = true
      continue
    }

    if (elapsedMs >= runtimeConfig.heartbeatTimeoutMs && session.autonomyLevel === 'L1_assigned') {
      session.autonomyLevel = 'L2_delegated'
      changed = true
    }
  }

  if (changed) {
    schedulePersist()
  }
}

function normalizePlayerName(playerName: string): string | null {
  const normalized = playerName.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return null
  }

  if (normalized.length > runtimeConfig.maxPlayerNameLength) {
    return null
  }

  return normalized
}

function isTokenFormatValid(token: string): boolean {
  return TOKEN_PATTERN.test(token)
}

function generateToken(): string {
  const raw = randomUUID() + nowMs().toString()
  return createHash('sha256').update(raw).digest('hex').slice(0, 48)
}

function ensureLoaded() {
  if (loaded) {
    return
  }
  loadPersistedSessionState()
}

function loadPersistedSessionState() {
  if (loaded) {
    return
  }
  loaded = true

  if (!persistEnabled) {
    return
  }

  if (!existsSync(SESSION_STATE_PERSIST_PATH)) {
    return
  }

  try {
    const raw = readFileSync(SESSION_STATE_PERSIST_PATH, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const restored = resolvePersistedSessions(parsed)

    sessions.clear()
    factionSessions.clear()
    for (const session of restored) {
      sessions.set(session.token, session)
      registerFactionToken(session.factionId, session.token)
    }

    restoredSessionCount = restored.length
    lastRestoreAt = Date.now()
    sweepTimeoutsAndPruneStaleSessions()

    if (restored.length > 0) {
      console.log(`[SessionManager] restored ${restored.length} sessions from disk`)
    }
  } catch {
    sessions.clear()
    factionSessions.clear()
    quarantineCorruptPersistFile()
    console.warn('[SessionManager] failed to restore persisted session state, using in-memory fallback')
  }
}

function resolvePersistedSessions(raw: unknown): PlayerSession[] {
  let items: unknown[] = []

  if (Array.isArray(raw)) {
    // legacy payload: raw array
    items = raw
  } else if (raw && typeof raw === 'object') {
    const envelope = raw as PersistedSessionEnvelope
    if (Array.isArray(envelope.sessions)) {
      items = envelope.sessions
    }
  }

  if (items.length === 0) {
    return []
  }

  const dedup = new Map<string, PlayerSession>()
  for (const item of items) {
    const session = normalizePersistedSession(item)
    if (!session) {
      continue
    }
    const previous = dedup.get(session.token)
    if (!previous || session.lastHeartbeat >= previous.lastHeartbeat) {
      dedup.set(session.token, session)
    }
  }

  if (dedup.size === 0) {
    return []
  }

  return Array.from(dedup.values())
    .sort((left, right) => right.lastHeartbeat - left.lastHeartbeat)
    .slice(0, MAX_PERSISTED_SESSIONS)
}

function normalizePersistedSession(raw: unknown): PlayerSession | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const item = raw as Partial<PlayerSession>
  const token = typeof item.token === 'string' ? item.token : ''
  const sessionId = typeof item.sessionId === 'string' ? item.sessionId.trim() : ''
  const factionId = typeof item.factionId === 'string' ? item.factionId.trim() : ''
  const playerNameRaw = typeof item.playerName === 'string' ? item.playerName : ''
  const normalizedPlayerName = normalizePlayerName(playerNameRaw)
  const seatIdRaw = Number(item.seatId)
  const joinedAtRaw = Number(item.joinedAt)
  const lastHeartbeatRaw = Number(item.lastHeartbeat)
  const tokenIssuedAtRaw = Number((item as { tokenIssuedAt?: unknown }).tokenIssuedAt ?? joinedAtRaw)
  const tokenExpiresAtRaw = Number(
    (item as { tokenExpiresAt?: unknown }).tokenExpiresAt ?? tokenIssuedAtRaw + runtimeConfig.tokenMaxAgeMs,
  )

  if (!isTokenFormatValid(token) || !sessionId || !factionId || !normalizedPlayerName) {
    return null
  }

  if (!Number.isFinite(seatIdRaw) || seatIdRaw < 1 || seatIdRaw > MAX_MAX_SEATS_PER_FACTION) {
    return null
  }

  if (
    !Number.isFinite(joinedAtRaw) ||
    !Number.isFinite(lastHeartbeatRaw) ||
    !Number.isFinite(tokenIssuedAtRaw) ||
    !Number.isFinite(tokenExpiresAtRaw)
  ) {
    return null
  }

  const autonomyLevel: AutonomyLevel =
    item.autonomyLevel === 'L1_assigned' ||
      item.autonomyLevel === 'L2_delegated' ||
      item.autonomyLevel === 'L3_negotiated'
      ? item.autonomyLevel
      : 'L2_delegated'

  const joinedAt = Math.max(0, Math.floor(joinedAtRaw))
  const lastHeartbeat = Math.max(joinedAt, Math.floor(lastHeartbeatRaw))
  const tokenIssuedAt = Math.max(0, Math.floor(tokenIssuedAtRaw))
  const tokenExpiresAt = Math.max(tokenIssuedAt + 1, Math.floor(tokenExpiresAtRaw))

  return {
    sessionId,
    token,
    tokenIssuedAt,
    tokenExpiresAt,
    factionId,
    seatId: Math.floor(seatIdRaw),
    playerName: normalizedPlayerName,
    joinedAt,
    lastHeartbeat,
    autonomyLevel,
  }
}

function quarantineCorruptPersistFile() {
  try {
    if (!existsSync(SESSION_STATE_PERSIST_PATH)) {
      return
    }

    const quarantinedPath = `${SESSION_STATE_PERSIST_PATH}.corrupt.${Date.now()}`
    renameSync(SESSION_STATE_PERSIST_PATH, quarantinedPath)
    corruptQuarantineCount += 1
    lastCorruptQuarantineAt = Date.now()
    console.warn(`[SessionManager] quarantined corrupt session state file: ${quarantinedPath}`)
  } catch {
    // non-fatal: runtime continues in memory mode
  }
}

function schedulePersist() {
  if (!persistEnabled) {
    return
  }

  persistDirty = true
  if (persistTimer) {
    return
  }

  persistTimer = setTimeout(() => {
    persistTimer = null
    void persistSessionState()
  }, SESSION_STATE_PERSIST_DEBOUNCE_MS)
}

async function persistSessionState() {
  if (!persistEnabled) {
    return
  }

  if (persistInFlight) {
    await persistInFlight
    return
  }

  if (!persistDirty) {
    return
  }

  persistInFlight = (async () => {
    try {
      while (persistDirty) {
        persistDirty = false
        const payload = JSON.stringify(
          {
            version: SESSION_STATE_PERSIST_VERSION,
            savedAt: new Date().toISOString(),
            sessions: Array.from(sessions.values())
              .sort((left, right) => right.lastHeartbeat - left.lastHeartbeat)
              .slice(0, MAX_PERSISTED_SESSIONS),
          } satisfies PersistedSessionEnvelope,
          null,
          2,
        )
        await mkdir(dirname(SESSION_STATE_PERSIST_PATH), { recursive: true })
        const tmpPath = `${SESSION_STATE_PERSIST_PATH}.tmp-${process.pid}-${Date.now()}`
        await writeFile(tmpPath, payload, 'utf8')
        await rename(tmpPath, SESSION_STATE_PERSIST_PATH)
        persistSuccessCount += 1
        lastPersistAt = Date.now()
      }
    } catch {
      persistDirty = true
      persistFailureCount += 1
      lastPersistErrorAt = Date.now()
    } finally {
      persistInFlight = null
      if (persistDirty) {
        schedulePersist()
      }
    }
  })()

  await persistInFlight
}

export async function flushSessionPersist(): Promise<void> {
  ensureLoaded()
  if (!persistEnabled) {
    return
  }

  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }

  if (!persistDirty) {
    if (persistInFlight) {
      await persistInFlight
    }
    return
  }

  await persistSessionState()
}

export function getSessionPersistHealth() {
  ensureLoaded()
  return {
    path: SESSION_STATE_PERSIST_PATH,
    enabled: persistEnabled,
    loaded,
    sessionCount: sessions.size,
    factionCount: factionSessions.size,
    persistDirty,
    persistInFlight: Boolean(persistInFlight),
    persistSuccessCount,
    persistFailureCount,
    lastPersistAt,
    lastPersistErrorAt,
    corruptQuarantineCount,
    lastCorruptQuarantineAt,
    restoredSessionCount,
    lastRestoreAt,
    persistVersion: SESSION_STATE_PERSIST_VERSION,
  }
}

function loadRuntimeConfigFromEnv(): SessionRuntimeConfig {
  const heartbeatTimeoutMs = readIntFromEnv(
    'SESSION_HEARTBEAT_TIMEOUT_MS',
    DEFAULT_HEARTBEAT_TIMEOUT_MS,
    MIN_HEARTBEAT_TIMEOUT_MS,
    MAX_HEARTBEAT_TIMEOUT_MS,
  )

  const staleFloor = Math.max(MIN_STALE_TTL_MS, heartbeatTimeoutMs + 1_000)
  const staleSessionTtlMs = readIntFromEnv(
    'SESSION_STALE_TTL_MS',
    Math.max(DEFAULT_STALE_SESSION_TTL_MS, heartbeatTimeoutMs + 1_000),
    staleFloor,
    MAX_STALE_TTL_MS,
  )

  const tokenFloor = Math.max(MIN_TOKEN_MAX_AGE_MS, heartbeatTimeoutMs + 1_000)
  const tokenMaxAgeMs = readIntFromEnv(
    'SESSION_TOKEN_MAX_AGE_MS',
    Math.max(DEFAULT_TOKEN_MAX_AGE_MS, heartbeatTimeoutMs + 1_000),
    tokenFloor,
    MAX_TOKEN_MAX_AGE_MS,
  )

  const maxActiveSessions = readIntFromEnv(
    'SESSION_MAX_ACTIVE',
    DEFAULT_MAX_ACTIVE_SESSIONS,
    MIN_MAX_ACTIVE_SESSIONS,
    MAX_MAX_ACTIVE_SESSIONS,
  )

  const maxSeatsPerFaction = readIntFromEnv(
    'SESSION_MAX_SEATS_PER_FACTION',
    DEFAULT_MAX_SEATS_PER_FACTION,
    MIN_MAX_SEATS_PER_FACTION,
    MAX_MAX_SEATS_PER_FACTION,
  )

  const maxPlayerNameLength = readIntFromEnv(
    'SESSION_MAX_PLAYER_NAME_LENGTH',
    DEFAULT_MAX_PLAYER_NAME_LENGTH,
    MIN_MAX_PLAYER_NAME_LENGTH,
    MAX_MAX_PLAYER_NAME_LENGTH,
  )

  return {
    heartbeatTimeoutMs,
    staleSessionTtlMs,
    tokenMaxAgeMs,
    maxActiveSessions,
    maxSeatsPerFaction,
    maxPlayerNameLength,
  }
}

function normalizeRuntimeConfig(
  partial: Partial<SessionRuntimeConfig>,
  base: SessionRuntimeConfig,
): SessionRuntimeConfig {
  const heartbeatTimeoutMs = clampInt(
    partial.heartbeatTimeoutMs ?? base.heartbeatTimeoutMs,
    MIN_HEARTBEAT_TIMEOUT_MS,
    MAX_HEARTBEAT_TIMEOUT_MS,
  )

  const staleSessionTtlMs = clampInt(
    partial.staleSessionTtlMs ?? base.staleSessionTtlMs,
    Math.max(MIN_STALE_TTL_MS, heartbeatTimeoutMs + 1_000),
    MAX_STALE_TTL_MS,
  )

  const tokenMaxAgeMs = clampInt(
    partial.tokenMaxAgeMs ?? base.tokenMaxAgeMs,
    Math.max(MIN_TOKEN_MAX_AGE_MS, heartbeatTimeoutMs + 1_000),
    MAX_TOKEN_MAX_AGE_MS,
  )

  const maxActiveSessions = clampInt(
    partial.maxActiveSessions ?? base.maxActiveSessions,
    MIN_MAX_ACTIVE_SESSIONS,
    MAX_MAX_ACTIVE_SESSIONS,
  )

  const maxSeatsPerFaction = clampInt(
    partial.maxSeatsPerFaction ?? base.maxSeatsPerFaction,
    MIN_MAX_SEATS_PER_FACTION,
    MAX_MAX_SEATS_PER_FACTION,
  )

  const maxPlayerNameLength = clampInt(
    partial.maxPlayerNameLength ?? base.maxPlayerNameLength,
    MIN_MAX_PLAYER_NAME_LENGTH,
    MAX_MAX_PLAYER_NAME_LENGTH,
  )

  return {
    heartbeatTimeoutMs,
    staleSessionTtlMs,
    tokenMaxAgeMs,
    maxActiveSessions,
    maxSeatsPerFaction,
    maxPlayerNameLength,
  }
}

function readIntFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return clampInt(parsed, min, max)
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

function clampInt(value: number, min: number, max: number): number {
  const normalized = Math.round(value)
  if (!Number.isFinite(normalized)) {
    return min
  }

  return Math.max(min, Math.min(max, normalized))
}
