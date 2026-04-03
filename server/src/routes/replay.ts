import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  getExecutionReplayByRequestId,
  getReplayArchive,
  getReplayArchiveEntry,
} from '../application/world/WorldService'
import { getReplayRagCacheStats } from '../infra/rag/retrieveReplays'
import { writeJson } from './http'

export function handleReplayArchiveRoute(_req: IncomingMessage, res: ServerResponse) {
  writeJson(res, 200, getReplayArchive())
}

export function handleReplayEntryRoute(_req: IncomingMessage, res: ServerResponse, requestId: string) {
  const archiveEntry = getReplayArchiveEntry(requestId)
  const replay = getExecutionReplayByRequestId(requestId)

  if (!archiveEntry || !replay) {
    writeJson(res, 404, { error: `Replay ${requestId} not found.` })
    return
  }

  writeJson(res, 200, {
    archive: archiveEntry,
    replay,
  })
}

export function handleReplayRagCacheStatsRoute(_req: IncomingMessage, res: ServerResponse) {
  writeJson(res, 200, getReplayRagCacheStats())
}
