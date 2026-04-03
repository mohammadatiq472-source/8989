import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

type ReplayRagCacheFile<TEntry> = {
  version: 1
  entries: TEntry[]
}

type ReplayRagCacheReadResult<TEntry> = {
  entries: TEntry[]
  diskLoaded: boolean
}

export function resolveReplayRagCacheFilePath() {
  const raw = process.env.REPLAY_RAG_CACHE_FILE?.trim() || 'tmp/replay_rag_index_cache.json'
  return resolve(process.cwd(), raw)
}

export function isReplayRagCacheEnabled() {
  const raw = process.env.REPLAY_RAG_CACHE?.trim().toLowerCase()
  if (!raw) {
    return true
  }

  return !['0', 'false', 'off', 'no'].includes(raw)
}

export function readReplayRagCacheFile<TEntry>(
  filePath: string,
  isValidEntry: (entry: unknown) => entry is TEntry,
): ReplayRagCacheReadResult<TEntry> {
  if (!existsSync(filePath)) {
    return {
      entries: [],
      diskLoaded: false,
    }
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as ReplayRagCacheFile<unknown>
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
      return {
        entries: [],
        diskLoaded: false,
      }
    }

    return {
      entries: parsed.entries.filter(isValidEntry),
      diskLoaded: true,
    }
  } catch (error) {
    console.warn(
      `[ReplayRAG] failed to load cache file: ${error instanceof Error ? error.message : 'unknown error'}`,
    )

    return {
      entries: [],
      diskLoaded: false,
    }
  }
}

export function writeReplayRagCacheFile<TEntry>(filePath: string, entries: TEntry[]) {
  const tempFilePath = `${filePath}.tmp-${process.pid}-${Date.now()}`

  try {
    mkdirSync(dirname(filePath), { recursive: true })
    const payload: ReplayRagCacheFile<TEntry> = {
      version: 1,
      entries,
    }

    const serialized = `${JSON.stringify(payload, null, 2)}\n`
    writeFileSync(tempFilePath, serialized, 'utf-8')
    renameSync(tempFilePath, filePath)
    return true
  } catch (error) {
    rmSync(tempFilePath, { force: true })
    console.warn(
      `[ReplayRAG] failed to persist cache file: ${error instanceof Error ? error.message : 'unknown error'}`,
    )
    return false
  }
}
