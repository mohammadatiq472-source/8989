import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CourtSession } from '../../../../shared/contracts/court'
import { courtSessionSchema } from '../../../../shared/schemas/court'

const MAX_SESSIONS = 320

const sessions: CourtSession[] = []
let loaded = false
let loadedPath: string | null = null

let persistDirty = false
let persistInFlight: Promise<void> | null = null
let persistEpoch = 0

function resolveCourtStorePath() {
  const overridden = process.env.COURT_STORE_PATH?.trim()
  return overridden && overridden.length > 0 ? overridden : join(process.cwd(), 'tmp', 'court_sessions.json')
}

function ensureLoaded() {
  const storePath = resolveCourtStorePath()
  if (loaded && loadedPath === storePath) return

  sessions.length = 0
  loaded = true
  loadedPath = storePath

  try {
    if (!existsSync(storePath)) return
    const raw = readFileSync(storePath, 'utf8')
    const parsed = JSON.parse(raw) as CourtSession[]
    for (const item of parsed) {
      sessions.push(courtSessionSchema.parse(item))
    }
    if (sessions.length > MAX_SESSIONS) {
      sessions.splice(MAX_SESSIONS)
    }
  } catch {
    sessions.length = 0
  }
}

function persist() {
  persistDirty = true
  if (persistInFlight) {
    return
  }

  const epoch = persistEpoch
  persistInFlight = drainPersistQueue(epoch)
}

async function drainPersistQueue(epoch: number): Promise<void> {
  try {
    while (persistDirty) {
      persistDirty = false
      if (epoch !== persistEpoch) {
        return
      }

      const storePath = loadedPath ?? resolveCourtStorePath()
      const payload = JSON.stringify(sessions, null, 2)
      await mkdir(dirname(storePath), { recursive: true })
      await writeFile(storePath, payload, 'utf8')
    }
  } catch {
    // preserve non-fatal behavior from previous sync implementation
  } finally {
    if (persistInFlight && epoch === persistEpoch) {
      persistInFlight = null
    }

    if (persistDirty && epoch === persistEpoch) {
      persist()
    }
  }
}

async function waitForPersistIdle() {
  while (persistInFlight) {
    await persistInFlight
  }
}

export function recordCourtSession(session: CourtSession) {
  ensureLoaded()
  sessions.unshift(courtSessionSchema.parse(session))
  if (sessions.length > MAX_SESSIONS) {
    sessions.splice(MAX_SESSIONS)
  }
  persist()
}

export function getLatestCourtSession(): CourtSession | null {
  ensureLoaded()
  const latest = sessions[0]
  return latest ? structuredClone(latest) : null
}

export function getCourtSessions(limit = 40): CourtSession[] {
  ensureLoaded()
  const normalized = Number.isFinite(limit) ? Math.max(1, Math.min(MAX_SESSIONS, Math.floor(limit))) : 40
  return sessions.slice(0, normalized).map((item) => structuredClone(item))
}

export async function flushCourtSessionPersist() {
  ensureLoaded()
  persist()
  await waitForPersistIdle()
}

export function resetCourtSessionStoreForTests() {
  sessions.length = 0
  loaded = false
  loadedPath = null
  persistDirty = false
  persistInFlight = null
  persistEpoch += 1
}
