import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'

import type { NarrativeEvent, WorldState } from '../../../../../shared/contracts/game'
import {
  NARRATIVE_PERSIST_PATH,
  WORLD_STATE_PERSIST_PATH,
  getNarrativePersistDir,
  getWorldStatePersistDir,
} from './worldPersistencePaths'

const MAX_NARRATIVE_EVENTS = 200
const WORLD_PERSIST_DEBOUNCE_MS = 10_000
const NARRATIVE_PERSIST_DEBOUNCE_MS = 3_000

let worldPersistDirty = false
let worldPersistTimer: ReturnType<typeof setTimeout> | null = null
let worldPersistInFlight: Promise<void> | null = null
let latestWorldStateGetter: (() => WorldState) | null = null

let narrativePersistDirty = false
let narrativePersistTimer: ReturnType<typeof setTimeout> | null = null
let narrativePersistInFlight: Promise<void> | null = null
const narrativeEvents: NarrativeEvent[] = []

export function loadPersistedWorldState(setWorldState: (worldState: WorldState) => void): void {
  try {
    if (existsSync(WORLD_STATE_PERSIST_PATH)) {
      const raw = readFileSync(WORLD_STATE_PERSIST_PATH, 'utf8')
      const saved = JSON.parse(raw) as WorldState
      if (saved && typeof saved.tick === 'number' && saved.map && saved.factions) {
        setWorldState(saved)
        console.log(`[WorldService] restored world state from disk (tick=${saved.tick})`)
      } else {
        console.warn('[WorldService] persisted world snapshot is malformed, starting fresh')
      }
    }
  } catch {
    console.warn('[WorldService] failed to load persisted world state, starting fresh')
  }
}

export function scheduleWorldPersist(getWorldState: () => WorldState): void {
  latestWorldStateGetter = getWorldState
  worldPersistDirty = true
  if (worldPersistTimer) return

  worldPersistTimer = setTimeout(() => {
    worldPersistTimer = null
    void drainWorldPersistQueue()
  }, WORLD_PERSIST_DEBOUNCE_MS)
}

export async function flushWorldPersist(getWorldState: () => WorldState): Promise<void> {
  latestWorldStateGetter = getWorldState

  if (worldPersistTimer) {
    clearTimeout(worldPersistTimer)
    worldPersistTimer = null
  }

  worldPersistDirty = true
  await drainWorldPersistQueue()
}

export function loadPersistedNarrativeEvents(): void {
  try {
    if (existsSync(NARRATIVE_PERSIST_PATH)) {
      const raw = readFileSync(NARRATIVE_PERSIST_PATH, 'utf8')
      const entries = JSON.parse(raw) as NarrativeEvent[]
      narrativeEvents.push(...entries.slice(0, MAX_NARRATIVE_EVENTS))
      console.log(`[WorldService] restored ${narrativeEvents.length} narrative events from disk`)
    }
  } catch {
    console.warn('[WorldService] failed to load persisted narrative events, starting fresh')
  }
}

export function getNarrativeEvents(limit = 200): { items: NarrativeEvent[] } {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 200
  return {
    items: narrativeEvents.slice(0, normalizedLimit),
  }
}

export function recordSimulationNarrativeEvents(events: NarrativeEvent[]): void {
  if (!events.length) {
    return
  }

  narrativeEvents.unshift(...events)
  if (narrativeEvents.length > MAX_NARRATIVE_EVENTS) {
    narrativeEvents.splice(MAX_NARRATIVE_EVENTS)
  }
  scheduleNarrativePersist()
}

export async function flushNarrativePersist(): Promise<void> {
  if (narrativePersistTimer) {
    clearTimeout(narrativePersistTimer)
    narrativePersistTimer = null
  }

  narrativePersistDirty = true
  await drainNarrativePersistQueue()
}

function scheduleNarrativePersist() {
  narrativePersistDirty = true
  if (narrativePersistTimer) return

  narrativePersistTimer = setTimeout(() => {
    narrativePersistTimer = null
    void drainNarrativePersistQueue()
  }, NARRATIVE_PERSIST_DEBOUNCE_MS)
}

async function drainWorldPersistQueue() {
  if (worldPersistInFlight) {
    await worldPersistInFlight
    return
  }

  if (!worldPersistDirty) {
    return
  }

  worldPersistInFlight = (async () => {
    try {
      while (worldPersistDirty) {
        worldPersistDirty = false

        const getWorldState = latestWorldStateGetter
        if (!getWorldState) {
          continue
        }

        const payload = JSON.stringify(getWorldState())
        await mkdir(getWorldStatePersistDir(), { recursive: true })
        await writeFile(WORLD_STATE_PERSIST_PATH, payload, 'utf8')
      }
    } catch {
      console.warn('[WorldService] failed to persist world state')
    } finally {
      worldPersistInFlight = null

      if (worldPersistDirty) {
        void drainWorldPersistQueue()
      }
    }
  })()

  await worldPersistInFlight
}

async function drainNarrativePersistQueue() {
  if (narrativePersistInFlight) {
    await narrativePersistInFlight
    return
  }

  if (!narrativePersistDirty) {
    return
  }

  narrativePersistInFlight = (async () => {
    try {
      while (narrativePersistDirty) {
        narrativePersistDirty = false

        const payload = JSON.stringify(narrativeEvents, null, 2)
        await mkdir(getNarrativePersistDir(), { recursive: true })
        await writeFile(NARRATIVE_PERSIST_PATH, payload, 'utf8')
      }
    } catch {
      console.warn('[WorldService] failed to persist narrative events')
    } finally {
      narrativePersistInFlight = null

      if (narrativePersistDirty) {
        void drainNarrativePersistQueue()
      }
    }
  })()

  await narrativePersistInFlight
}
