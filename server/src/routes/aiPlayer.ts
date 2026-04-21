import type { IncomingMessage, ServerResponse } from 'node:http'
import { dispatchAiPlayerKnowledgeGraphRoute } from './aiPlayerKnowledgeGraphRoute'
import { dispatchAiPlayerProposalRoutes } from './aiPlayerProposalRoutes'
import { dispatchAiPlayerRuntimeRoutes } from './aiPlayerRuntimeRoutes'
import { writeJson } from './http'

export async function dispatchAiPlayerRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
): Promise<void> {
  if (dispatchAiPlayerKnowledgeGraphRoute(req, res, pathname, url)) {
    return
  }

  if (await dispatchAiPlayerProposalRoutes(req, res, pathname, url)) {
    return
  }

  if (await dispatchAiPlayerRuntimeRoutes(req, res, pathname, url)) {
    return
  }

  writeJson(res, 404, { error: 'AI player route not found.' })
}
