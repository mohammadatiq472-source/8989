import { dirname, join } from 'node:path'

const WORLD_PERSIST_ROOT = join(process.cwd(), 'tmp')

export const WORLD_STATE_PERSIST_PATH = buildWorldPersistencePath('world_snapshot.json')
export const NARRATIVE_PERSIST_PATH = buildWorldPersistencePath('narrative_events.json')

export function buildWorldPersistencePath(fileName: string): string {
  return join(WORLD_PERSIST_ROOT, fileName)
}

export function getWorldStatePersistDir(): string {
  return dirname(WORLD_STATE_PERSIST_PATH)
}

export function getNarrativePersistDir(): string {
  return dirname(NARRATIVE_PERSIST_PATH)
}
