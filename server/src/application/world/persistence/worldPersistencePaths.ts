import { dirname, join } from 'node:path'

function resolveWorldPersistRoot(): string {
  const configured = process.env.WORLD_PERSIST_ROOT?.trim()
  return configured && configured.length > 0 ? configured : join(process.cwd(), 'tmp')
}

export const WORLD_STATE_PERSIST_PATH =
  process.env.WORLD_STATE_PERSIST_PATH?.trim() || buildWorldPersistencePath('world_snapshot.json')
export const NARRATIVE_PERSIST_PATH =
  process.env.NARRATIVE_PERSIST_PATH?.trim() || buildWorldPersistencePath('narrative_events.json')

export function buildWorldPersistencePath(fileName: string): string {
  return join(resolveWorldPersistRoot(), fileName)
}

export function getWorldStatePersistDir(): string {
  return dirname(WORLD_STATE_PERSIST_PATH)
}

export function getNarrativePersistDir(): string {
  return dirname(NARRATIVE_PERSIST_PATH)
}
