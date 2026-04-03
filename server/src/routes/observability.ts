import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  getNarrativeEvents,
  getNationalAgendaSnapshot,
  getCourtSessionSnapshot,
  getCivilMemorySnapshot,
  getSaveSlots,
  getWorldEvents,
  loadWorldSlot,
  saveWorldSlot,
} from '../application/world/WorldService'
import { readJsonBody, writeJson } from './http'

type SaveSlotPayload = {
  slotId?: string
  label?: string
}

export function handleWorldEventsRoute(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  const limit = Number(requestUrl.searchParams.get('limit') ?? '200')
  writeJson(res, 200, getWorldEvents(limit))
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

  writeJson(
    res,
    200,
    getCivilMemorySnapshot({
      limit,
      type,
      tickFrom: Number.isFinite(tickFrom) ? tickFrom : undefined,
      tickTo: Number.isFinite(tickTo) ? tickTo : undefined,
    }),
  )
}

export function handleSaveSlotsRoute(_req: IncomingMessage, res: ServerResponse) {
  writeJson(res, 200, getSaveSlots())
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
