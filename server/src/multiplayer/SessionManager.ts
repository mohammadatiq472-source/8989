/**
 * SessionManager.ts - multiplayer session boundaries and autonomy transitions.
 */

import { createHash, randomUUID } from 'node:crypto'

export type AutonomyLevel = 'L1_assigned' | 'L2_delegated' | 'L3_negotiated'

export type PlayerSession = {
  sessionId: string
  token: string
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

const DEFAULT_HEARTBEAT_TIMEOUT_MS = 30_000
const DEFAULT_STALE_SESSION_TTL_MS = 10 * 60_000
const DEFAULT_MAX_ACTIVE_SESSIONS = 1024
const DEFAULT_MAX_SEATS_PER_FACTION = 10
const DEFAULT_MAX_PLAYER_NAME_LENGTH = 32

const MIN_HEARTBEAT_TIMEOUT_MS = 5_000
const MAX_HEARTBEAT_TIMEOUT_MS = 5 * 60_000
const MIN_STALE_TTL_MS = 30_000
const MAX_STALE_TTL_MS = 24 * 60 * 60_000
const MIN_MAX_ACTIVE_SESSIONS = 1
const MAX_MAX_ACTIVE_SESSIONS = 20_000
const MIN_MAX_SEATS_PER_FACTION = 1
const MAX_MAX_SEATS_PER_FACTION = 64
const MIN_MAX_PLAYER_NAME_LENGTH = 8
const MAX_MAX_PLAYER_NAME_LENGTH = 64

const TOKEN_PATTERN = /^[a-f0-9]{48}$/

const sessions = new Map<string, PlayerSession>()
const factionSessions = new Map<string, Set<string>>()

let runtimeConfig = loadRuntimeConfigFromEnv()
let nowSource: () => number = () => Date.now()

export function joinSession(
  factionId: string,
  playerName: string,
  validFactions: string[],
): PlayerSession | { error: string } {
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
  const session: PlayerSession = {
    sessionId: randomUUID(),
    token,
    factionId,
    seatId,
    playerName: normalizedName,
    joinedAt: now,
    lastHeartbeat: now,
    autonomyLevel: 'L1_assigned',
  }

  sessions.set(token, session)
  registerFactionToken(factionId, token)

  return session
}

export function heartbeat(token: string): { ok: boolean; error?: string } {
  if (!isTokenFormatValid(token)) {
    return { ok: false, error: 'Invalid token format' }
  }

  sweepTimeoutsAndPruneStaleSessions()

  const session = sessions.get(token)
  if (!session) {
    return { ok: false, error: 'Invalid token' }
  }

  session.lastHeartbeat = nowMs()
  if (session.autonomyLevel !== 'L1_assigned') {
    session.autonomyLevel = 'L1_assigned'
  }

  return { ok: true }
}

export function leaveSession(token: string): { ok: boolean } {
  if (!isTokenFormatValid(token)) {
    return { ok: false }
  }

  const removed = removeSessionByToken(token)
  return { ok: removed }
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
    maxPlayerNameLength: runtimeConfig.maxPlayerNameLength,
  }
}

export function getFactionAutonomyLevel(factionId: string): AutonomyLevel {
  sweepTimeoutsAndPruneStaleSessions()
  const factionState = getFactionAutonomyState(factionId)
  return factionState.autonomyLevel
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
): { ok: boolean; error?: string } {
  if (!isTokenFormatValid(token)) {
    return { ok: false, error: 'Invalid token format' }
  }

  sweepTimeoutsAndPruneStaleSessions()

  const session = sessions.get(token)
  if (!session) {
    return { ok: false, error: 'Invalid token' }
  }

  session.lastHeartbeat = nowMs()
  session.autonomyLevel = autonomyLevel
  return { ok: true }
}

export function validateToken(token: string): { factionId: string } | null {
  if (!isTokenFormatValid(token)) {
    return null
  }

  sweepTimeoutsAndPruneStaleSessions()

  const session = sessions.get(token)
  if (!session) {
    return null
  }

  session.lastHeartbeat = nowMs()
  session.autonomyLevel = 'L1_assigned'
  return { factionId: session.factionId }
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
  sessions.clear()
  factionSessions.clear()
  runtimeConfig = loadRuntimeConfigFromEnv()
  nowSource = () => Date.now()
}

function nowMs() {
  return nowSource()
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

function sweepTimeoutsAndPruneStaleSessions(): void {
  const now = nowMs()

  for (const [token, session] of sessions.entries()) {
    const elapsedMs = now - session.lastHeartbeat

    if (elapsedMs >= runtimeConfig.staleSessionTtlMs) {
      removeSessionByToken(token)
      continue
    }

    if (elapsedMs >= runtimeConfig.heartbeatTimeoutMs && session.autonomyLevel === 'L1_assigned') {
      session.autonomyLevel = 'L2_delegated'
    }
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

function clampInt(value: number, min: number, max: number): number {
  const normalized = Math.round(value)
  if (!Number.isFinite(normalized)) {
    return min
  }

  return Math.max(min, Math.min(max, normalized))
}
