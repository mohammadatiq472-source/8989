import assert from 'node:assert/strict'
import {
  AI_PLAYER_KNOWLEDGE_GRAPH_VERSION,
  type AiPlayerKnowledgeGraphSnapshot,
} from '../../shared/contracts/aiPlayerKnowledgeGraph'
import {
  buildSessionPersistPath,
  getAvailablePort,
  readArray,
  readObject,
  shutdownChild,
  spawnBackend,
  type TailState,
  waitForHealth,
  requestJson,
} from './helpers/backendHarness'

function readSnapshot(data: unknown): AiPlayerKnowledgeGraphSnapshot {
  const root = readObject(data)
  assert.equal(root.ok, true, 'knowledge graph route should return ok=true')
  return readObject(root.snapshot) as unknown as AiPlayerKnowledgeGraphSnapshot
}

async function run() {
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const backend = spawnBackend(port, tail, {
    SESSION_STATE_PERSIST_PATH: buildSessionPersistPath('ai_player_knowledge_graph_http_contract_session'),
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health?.ok, `backend failed to start: ${tail.stderr.join('\n')}`)

    const catalogResult = await requestJson(baseUrl, '/api/ai/player-actions/catalog', 'GET')
    assert.equal(catalogResult.status, 200, `catalog route failed: ${JSON.stringify(catalogResult.data)}`)
    const catalog = readArray(readObject(catalogResult.data).catalog)

    const graphResult = await requestJson(baseUrl, '/api/ai/knowledge-graph', 'GET')
    assert.equal(graphResult.status, 200, `knowledge graph route failed: ${JSON.stringify(graphResult.data)}`)
    const snapshot = readSnapshot(graphResult.data)
    assert.equal(snapshot.version, AI_PLAYER_KNOWLEDGE_GRAPH_VERSION)
    assert.ok(snapshot.promotedActions.length >= 10, 'knowledge graph should expose closed v1 promoted actions')
    assert.ok(snapshot.authorityDecisions.length >= 1, 'knowledge graph should expose explicit authority decisions')
    assert.equal(snapshot.counts.promotedActions, snapshot.promotedActions.length)
    assert.equal(snapshot.counts.authorityDecisions, snapshot.authorityDecisions.length)
    assert.equal(snapshot.counts.executableCatalog, snapshot.executableCatalog.length)

    for (const node of snapshot.promotedActions) {
      const catalogEntry = catalog.find((item) => {
        const entry = readObject(item)
        return entry.action === node.aiAction
      })
      assert.ok(catalogEntry, `promoted knowledge action ${node.aiAction} must exist in the catalog`)
      const entry = readObject(catalogEntry)
      assert.equal(entry.executableInV1, true, `${node.aiAction} must stay executable in v1`)
      assert.equal(entry.mappedWorldAction, node.worldAction, `${node.aiAction} must stay mapped to ${node.worldAction}`)
    }

    const deferredContextFocus = snapshot.authorityDecisions.find((item) => item.worldAction === 'setAiContextFocus')
    assert.ok(deferredContextFocus, 'knowledge graph must keep explicit defer decision for setAiContextFocus')
    assert.equal(deferredContextFocus?.recommendation, 'defer')

    const rewardFilterResult = await requestJson(baseUrl, '/api/ai/knowledge-graph?aiAction=reward_claim', 'GET')
    assert.equal(rewardFilterResult.status, 200, `reward_claim filter failed: ${JSON.stringify(rewardFilterResult.data)}`)
    const rewardSnapshot = readSnapshot(rewardFilterResult.data)
    assert.equal(rewardSnapshot.promotedActions.length, 1)
    assert.equal(rewardSnapshot.promotedActions[0]?.aiAction, 'reward_claim')
    assert.equal(rewardSnapshot.promotedActions[0]?.worldAction, 'claimReward')

    const deferOnlyResult = await requestJson(baseUrl, '/api/ai/knowledge-graph?recommendation=defer&includeCatalog=false', 'GET')
    assert.equal(deferOnlyResult.status, 200, `defer filter failed: ${JSON.stringify(deferOnlyResult.data)}`)
    const deferOnlySnapshot = readSnapshot(deferOnlyResult.data)
    assert.equal(deferOnlySnapshot.promotedActions.length, 0)
    assert.equal(deferOnlySnapshot.authorityDecisions.length, 1)
    assert.equal(deferOnlySnapshot.executableCatalog.length, 0)

    const obsidianResult = await requestJson(baseUrl, '/api/ai/knowledge-graph?format=obsidian&aiAction=recruit_pool_select', 'GET')
    assert.equal(obsidianResult.status, 200, `obsidian export failed: ${JSON.stringify(obsidianResult.data)}`)
    const obsidianPayload = readObject(obsidianResult.data)
    assert.equal(obsidianPayload.ok, true)
    assert.equal(obsidianPayload.format, 'obsidian')
    const markdown = String(obsidianPayload.markdown ?? '')
    assert.ok(markdown.includes('# AI Player Backend Knowledge Graph'))
    assert.ok(markdown.includes('recruit_pool_select -> setRecruitSelectedPool'))
    assert.ok(markdown.includes('Obsidian 可以用来沉淀和检索这份图谱'))

    const invalidFormatResult = await requestJson(baseUrl, '/api/ai/knowledge-graph?format=markdown', 'GET')
    assert.equal(invalidFormatResult.status, 422)

    console.log('[ai_player_knowledge_graph_http_contract] all checks passed')
  } finally {
    await shutdownChild(backend)
  }
}

run().catch((error) => {
  console.error('[ai_player_knowledge_graph_http_contract] failed:', error)
  process.exitCode = 1
})
