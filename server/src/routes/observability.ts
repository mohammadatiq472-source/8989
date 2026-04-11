import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CivilMemoryObservabilityResponse } from '../../../shared/contracts/game'
import {
  getNarrativeEvents,
  getNationalAgendaSnapshot,
  getSaveSlotsArchiveCatalog,
  getCourtSessionSnapshot,
  getCivilMemorySnapshot,
  getSaveSlots,
  getWorldEvents,
  loadWorldSlot,
  primeReplayFixtureSlot,
  runSaveSlotsArchiveRestoreApply,
  runSaveSlotsArchiveRestoreDrill,
  runSaveSlotsArchiveRestoreRollbackDrill,
  saveWorldSlot,
} from '../application/world/WorldService'
import { readJsonBody, writeJson } from './http'
import { getMemoryProviderDiagnostics } from '../agents/memory/MemoryStore'
import { civilMemoryObservabilityResponseSchema } from '../../../shared/schemas/civilMemory'
import { getWebSocketStats } from '../ws/GameWebSocket'
import { worldEventsResponseSchema } from '../../../shared/schemas/history'

type SaveSlotPayload = {
  slotId?: string
  label?: string
}

type SaveSlotFixturePrimePayload = {
  slotId?: string
  label?: string
  source?: 'initial_world_v1' | 'current_world'
}

type SaveSlotArchiveRestoreDrillPayload = {
  archivePath?: string
}

type SaveSlotArchiveRestoreApplyPayload = {
  archivePath?: string
  force?: boolean
}

type SaveSlotArchiveRestoreRollbackDrillPayload = {
  archivePath?: string
}

export function handleWorldEventsRoute(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  const limit = Number(requestUrl.searchParams.get('limit') ?? '200')
  const payload = worldEventsResponseSchema.parse({
    ...getWorldEvents(limit),
    wsStats: getWebSocketStats(),
  })
  writeJson(res, 200, payload)
}

export function handleWorldEventsStreamRoute(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  const limit = Number(requestUrl.searchParams.get('limit') ?? '120')
  const intervalMs = Math.max(400, Math.min(2500, Number(requestUrl.searchParams.get('intervalMs') ?? '1000')))

  let lastSeenId = requestUrl.searchParams.get('sinceId')?.trim() ?? ''
  let closed = false

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const emit = () => {
    if (closed || res.writableEnded) {
      return
    }

    const items = getWorldEvents(limit).items
    if (items.length === 0) {
      res.write(': keepalive\n\n')
      return
    }

    let nextItems = items
    if (lastSeenId) {
      const existingIndex = items.findIndex((item) => item.id === lastSeenId)
      if (existingIndex === 0) {
        res.write(': keepalive\n\n')
        return
      }

      nextItems = existingIndex > 0 ? items.slice(0, existingIndex) : items.slice(0, 1)
    } else {
      nextItems = items.slice(0, Math.min(4, items.length))
    }

    if (nextItems.length === 0) {
      res.write(': keepalive\n\n')
      return
    }

    for (const item of nextItems.reverse()) {
      res.write(`event: world_event\n`)
      res.write(`data: ${JSON.stringify(item)}\n\n`)
    }

    lastSeenId = items[0]?.id ?? lastSeenId
  }

  res.write('retry: 2000\n\n')
  emit()

  const timer = setInterval(emit, intervalMs)
  const cleanup = () => {
    if (closed) {
      return
    }

    closed = true
    clearInterval(timer)
    if (!res.writableEnded) {
      res.end()
    }
  }

  req.on('close', cleanup)
  req.on('end', cleanup)
  req.on('error', cleanup)
}

export function handleNarrativeEventsRoute(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  const limit = Number(requestUrl.searchParams.get('limit') ?? '200')
  writeJson(res, 200, getNarrativeEvents(limit))
}

export function handleNationalAgendaRoute(_req: IncomingMessage, res: ServerResponse) {
  writeJson(res, 200, getNationalAgendaSnapshot())
}

export function handleCourtSessionRoute(_req: IncomingMessage, res: ServerResponse) {
  writeJson(res, 200, getCourtSessionSnapshot())
}

export function handleCivilMemoryRoute(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  const limit = Number(requestUrl.searchParams.get('limit') ?? '120')
  const typeRaw = requestUrl.searchParams.get('type')?.trim()
  const type =
    typeRaw === 'agenda_compiled' ||
    typeRaw === 'court_session_closed' ||
    typeRaw === 'court_resolution' ||
    typeRaw === 'execution_outcome'
      ? typeRaw
      : undefined
  const tickFromRaw = requestUrl.searchParams.get('tickFrom')
  const tickFrom = tickFromRaw ? Number(tickFromRaw) : undefined
  const tickToRaw = requestUrl.searchParams.get('tickTo')
  const tickTo = tickToRaw ? Number(tickToRaw) : undefined

  const snapshot = getCivilMemorySnapshot({
    limit,
    type,
    tickFrom: Number.isFinite(tickFrom) ? tickFrom : undefined,
    tickTo: Number.isFinite(tickTo) ? tickTo : undefined,
  })

  const responsePayload: CivilMemoryObservabilityResponse = {
    ...snapshot,
    memoryProvider: getMemoryProviderDiagnostics(),
  }

  writeJson(res, 200, civilMemoryObservabilityResponseSchema.parse(responsePayload))
}

export function handleSaveSlotsRoute(_req: IncomingMessage, res: ServerResponse) {
  writeJson(res, 200, getSaveSlots())
}

export function handleSaveSlotsArchiveRoute(_req: IncomingMessage, res: ServerResponse) {
  writeJson(res, 200, getSaveSlotsArchiveCatalog())
}

export async function handleSaveSlotSaveRoute(req: IncomingMessage, res: ServerResponse) {
  try {
    const payload = (await readJsonBody(req)) as SaveSlotPayload
    if (!payload.slotId || typeof payload.slotId !== 'string') {
      writeJson(res, 400, { error: 'slotId is required.' })
      return
    }

    const record = saveWorldSlot(payload.slotId, payload.label)
    writeJson(res, 200, { slot: record })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'save slot failed'
    const statusCode = message.includes('slotId must match') ? 400 : 500
    writeJson(res, statusCode, { error: message })
  }
}

export async function handleSaveSlotLoadRoute(req: IncomingMessage, res: ServerResponse) {
  try {
    const payload = (await readJsonBody(req)) as SaveSlotPayload
    if (!payload.slotId || typeof payload.slotId !== 'string') {
      writeJson(res, 400, { error: 'slotId is required.' })
      return
    }

    writeJson(res, 200, loadWorldSlot(payload.slotId))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'load slot failed'
    const statusCode = message.includes('slotId must match') ? 400 : 500
    writeJson(res, statusCode, { error: message })
  }
}

export async function handleSaveSlotFixturePrimeRoute(req: IncomingMessage, res: ServerResponse) {
  try {
    const payload = (await readJsonBody(req)) as SaveSlotFixturePrimePayload
    if (!payload.slotId || typeof payload.slotId !== 'string') {
      writeJson(res, 400, { error: 'slotId is required.' })
      return
    }

    const source = payload.source === 'current_world' ? 'current_world' : 'initial_world_v1'
    const record = primeReplayFixtureSlot(payload.slotId, {
      label: payload.label,
      source,
    })
    writeJson(res, 200, {
      slot: record,
      source,
      fixture: {
        slotId: record.slotId,
        tick: record.tick,
        worldVersion: record.worldVersion,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'prime fixture slot failed'
    const statusCode = message.includes('slotId must match') ? 400 : 500
    writeJson(res, statusCode, { error: message })
  }
}

export async function handleSaveSlotArchiveRestoreDrillRoute(req: IncomingMessage, res: ServerResponse) {
  try {
    const payload = (await readJsonBody(req)) as SaveSlotArchiveRestoreDrillPayload
    const archivePath = typeof payload.archivePath === 'string' ? payload.archivePath.trim() : undefined
    const drill = runSaveSlotsArchiveRestoreDrill({ archivePath })
    writeJson(res, drill.status === 'failed' ? 422 : 200, { drill })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'archive restore drill failed'
    writeJson(res, 400, { error: message })
  }
}

export async function handleSaveSlotArchiveRestoreApplyRoute(req: IncomingMessage, res: ServerResponse) {
  try {
    const payload = (await readJsonBody(req)) as SaveSlotArchiveRestoreApplyPayload
    const archivePath = typeof payload.archivePath === 'string' ? payload.archivePath.trim() : undefined
    const force = payload.force === true
    const restore = await runSaveSlotsArchiveRestoreApply({ archivePath, force })
    writeJson(res, restore.status === 'failed' ? 422 : 200, { restore })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'archive restore apply failed'
    writeJson(res, 400, { error: message })
  }
}

export async function handleSaveSlotArchiveRestoreRollbackDrillRoute(req: IncomingMessage, res: ServerResponse) {
  try {
    const payload = (await readJsonBody(req)) as SaveSlotArchiveRestoreRollbackDrillPayload
    const archivePath = typeof payload.archivePath === 'string' ? payload.archivePath.trim() : undefined
    const drill = runSaveSlotsArchiveRestoreRollbackDrill({ archivePath })
    writeJson(res, drill.status === 'failed' ? 422 : 200, { drill })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'archive restore rollback drill failed'
    writeJson(res, 400, { error: message })
  }
}
