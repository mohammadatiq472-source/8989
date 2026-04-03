import type { IncomingMessage, ServerResponse } from 'node:http'
import { getMapOverview } from '../application/map/MapOverviewService'
import { writeJson } from './http'

export function handleMapOverviewRoute(_req: IncomingMessage, res: ServerResponse) {
  writeJson(res, 200, getMapOverview())
}
