import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CivilMemoryEntry, CivilMemoryQuery } from '../../../../shared/contracts/civilMemory'
import { civilMemoryEntrySchema } from '../../../../shared/schemas/civilMemory'

const MAX_CIVIL_MEMORY = 2000
const CIVIL_MEMORY_CHAIN_ALGORITHM = 'sha256'

type CivilMemoryIntegrityReport = {
  ok: boolean
  errors: string[]
  inspected: number
  headHash?: string
  tailHash?: string
}

const entries: CivilMemoryEntry[] = []
let loaded = false
let loadedPath: string | null = null

let persistDirty = false
let persistInFlight: Promise<void> | null = null
let persistEpoch = 0

function resolveCivilMemoryPath() {
  const overridden = process.env.CIVIL_MEMORY_PATH?.trim()
  return overridden && overridden.length > 0 ? overridden : join(process.cwd(), 'tmp', 'civil_memory_ledger.json')
}

function ensureLoaded() {
  const storePath = resolveCivilMemoryPath()
  if (loaded && loadedPath === storePath) return

  entries.length = 0
  loaded = true
  loadedPath = storePath

  try {
    if (!existsSync(storePath)) return
    const raw = readFileSync(storePath, 'utf8')
    const parsed = JSON.parse(raw) as CivilMemoryEntry[]
    for (const item of parsed) {
      entries.push(civilMemoryEntrySchema.parse(item))
    }
    if (entries.length > MAX_CIVIL_MEMORY) {
      entries.splice(MAX_CIVIL_MEMORY)
    }

    if (backfillIntegrityChain(entries)) {
      persist()
    }
  } catch {
    entries.length = 0
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

      const storePath = loadedPath ?? resolveCivilMemoryPath()
      const payload = JSON.stringify(entries, null, 2)
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

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  const keys = Object.keys(value).sort()
  const encoded = keys.map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`)
  return `{${encoded.join(',')}}`
}

function cloneWithoutIntegrity(entry: CivilMemoryEntry): Omit<CivilMemoryEntry, 'integrity'> {
  const { integrity: _integrity, ...withoutIntegrity } = entry
  void _integrity
  return withoutIntegrity
}

function computeIntegrity(params: {
  entry: Omit<CivilMemoryEntry, 'integrity'>
  prevHash: string
  chainIndex: number
}) {
  const payload = stableSerialize({
    algorithm: CIVIL_MEMORY_CHAIN_ALGORITHM,
    prevHash: params.prevHash,
    chainIndex: params.chainIndex,
    id: params.entry.id,
    tick: params.entry.tick,
    type: params.entry.type,
    title: params.entry.title,
    summary: params.entry.summary,
    relatedIds: params.entry.relatedIds,
    factionIds: params.entry.factionIds,
    sessionId: params.entry.sessionId ?? null,
    proposalId: params.entry.proposalId ?? null,
    resolutionId: params.entry.resolutionId ?? null,
    outcome: params.entry.outcome ?? null,
    responsibilities: params.entry.responsibilities,
    metadata: params.entry.metadata,
    createdAt: params.entry.createdAt,
  })

  const hash = createHash(CIVIL_MEMORY_CHAIN_ALGORITHM).update(payload, 'utf8').digest('hex')
  return {
    algorithm: CIVIL_MEMORY_CHAIN_ALGORITHM,
    prevHash: params.prevHash,
    hash,
    chainIndex: params.chainIndex,
  } as const
}

function backfillIntegrityChain(target: CivilMemoryEntry[]) {
  if (target.length === 0) return false
  if (target.every((entry) => entry.integrity)) return false

  let prevHash = 'genesis'
  let chainIndex = 0

  for (let cursor = target.length - 1; cursor >= 0; cursor -= 1) {
    const base = cloneWithoutIntegrity(target[cursor])
    const integrity = computeIntegrity({
      entry: base,
      prevHash,
      chainIndex,
    })

    target[cursor] = civilMemoryEntrySchema.parse({
      ...base,
      integrity,
    })

    prevHash = integrity.hash
    chainIndex += 1
  }

  return true
}

export function appendCivilMemoryEntry(entry: Omit<CivilMemoryEntry, 'id' | 'createdAt' | 'integrity'>): CivilMemoryEntry {
  ensureLoaded()

  const base = civilMemoryEntrySchema.parse({
    ...entry,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  })

  const previousHead = entries[0]?.integrity
  const integrity = computeIntegrity({
    entry: cloneWithoutIntegrity(base),
    prevHash: previousHead?.hash ?? 'genesis',
    chainIndex: (previousHead?.chainIndex ?? -1) + 1,
  })

  const resolved: CivilMemoryEntry = civilMemoryEntrySchema.parse({
    ...base,
    integrity,
  })

  entries.unshift(resolved)
  if (entries.length > MAX_CIVIL_MEMORY) {
    entries.splice(MAX_CIVIL_MEMORY)
  }
  persist()
  return structuredClone(resolved)
}

export function queryCivilMemory(params: CivilMemoryQuery = {}): CivilMemoryEntry[] {
  ensureLoaded()

  const limit = Number.isFinite(params.limit) ? Math.max(1, Math.min(500, Math.floor(params.limit ?? 120))) : 120
  const tickFrom = params.tickFrom
  const tickTo = params.tickTo
  const factionId = params.factionId?.trim()
  const relatedId = params.relatedId?.trim()

  return entries
    .filter((item) => {
      if (params.type && item.type !== params.type) return false
      if (typeof tickFrom === 'number' && item.tick < tickFrom) return false
      if (typeof tickTo === 'number' && item.tick > tickTo) return false
      if (factionId && !item.factionIds.includes(factionId)) return false
      if (relatedId && !item.relatedIds.includes(relatedId)) return false
      return true
    })
    .slice(0, limit)
    .map((item) => structuredClone(item))
}

export function verifyCivilMemoryIntegrity(): CivilMemoryIntegrityReport {
  ensureLoaded()

  if (entries.length === 0) {
    return {
      ok: true,
      errors: [],
      inspected: 0,
    }
  }

  const errors: string[] = []

  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1].integrity
    const current = entries[index].integrity

    if (!previous || !current) {
      continue
    }

    if (previous.chainIndex <= current.chainIndex) {
      errors.push(`chain_index_order_invalid:newer=${previous.chainIndex},older=${current.chainIndex}`)
      break
    }
  }

  let priorEntry: CivilMemoryEntry | null = null

  for (let cursor = entries.length - 1; cursor >= 0; cursor -= 1) {
    const current = entries[cursor]
    const integrity = current.integrity
    if (!integrity) {
      errors.push(`missing_integrity:${current.id}`)
      continue
    }

    if (integrity.algorithm !== CIVIL_MEMORY_CHAIN_ALGORITHM) {
      errors.push(`algorithm_mismatch:${current.id}:${integrity.algorithm}`)
      continue
    }

    if (priorEntry?.integrity) {
      if (integrity.chainIndex !== priorEntry.integrity.chainIndex + 1) {
        errors.push(`chain_index_gap:${current.id}:${integrity.chainIndex}`)
      }

      if (integrity.prevHash !== priorEntry.integrity.hash) {
        errors.push(`prev_hash_mismatch:${current.id}`)
      }
    }

    const expected = computeIntegrity({
      entry: cloneWithoutIntegrity(current),
      prevHash: integrity.prevHash,
      chainIndex: integrity.chainIndex,
    }).hash

    if (expected !== integrity.hash) {
      errors.push(`hash_mismatch:${current.id}`)
    }

    priorEntry = current
  }

  return {
    ok: errors.length === 0,
    errors,
    inspected: entries.length,
    headHash: entries[0]?.integrity?.hash,
    tailHash: entries[entries.length - 1]?.integrity?.hash,
  }
}

export async function flushCivilMemoryPersist() {
  ensureLoaded()
  persist()
  await waitForPersistIdle()
}

export function resetCivilMemoryStoreForTests() {
  entries.length = 0
  loaded = false
  loadedPath = null
  persistDirty = false
  persistInFlight = null
  persistEpoch += 1
}
