import assert from 'node:assert/strict'
import { createServer, type IncomingMessage } from 'node:http'
import { writeFileSync } from 'node:fs'
import { createInitialWorldState } from '../../shared/domain/scenario'
import {
  buildSessionPersistPath,
  getAvailablePort,
  readArray,
  readObject,
  requestJson,
  shutdownChild,
  spawnBackend,
  type TailState,
  waitForHealth,
} from './helpers/backendHarness'

const AI_PLAYER_ID = 'player_operator_model_byok'
const FACTION_ID = 'player'
const GOVERNOR_PLAYER_ID = 'human_alpha'
const BYOK_MODEL = 'faction/strict-json-model'
const BYOK_SECRET = 'model-proposal-byok-contract-token'
const ENV_FALLBACK_MODEL = 'env/strict-json-model'
const ENV_FALLBACK_SECRET = 'model-proposal-env-fallback-token'
const MODEL_OUTPUT = {
  summary: 'claim the available reward through governed proposal flow',
  proposals: [
    {
      action: 'reward_claim',
      args: {},
      reason: '资源：当前存在待领取奖励；目标：领取奖励入账；风险：需要人工批准；批准后结果：后端执行奖励领取并生成 receipt。',
    },
  ],
  deferReason: '',
  needsHumanReview: false,
}

type RelayProbe = {
  authorization: string
  model: string
  path: string
}

function seedWorldState() {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding BYOK model proposal shard`)
  faction.aiPlayers = [
    {
      id: AI_PLAYER_ID,
      name: 'Player Operator Model BYOK',
      factionId: FACTION_ID,
      unitIds: [],
      specialty: 'logistics',
    },
  ]

  const path = buildSessionPersistPath('ai_player_http_model_proposal_byok_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return path
}

async function readRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

async function startRelayProbe(options: { model: string; responseStatus?: number }) {
  const port = await getAvailablePort()
  const probes: RelayProbe[] = []
  const server = createServer((req, res) => {
    void (async () => {
      const body = JSON.parse(await readRequestBody(req)) as Record<string, unknown>
      probes.push({
        authorization: String(req.headers.authorization ?? ''),
        model: String(body.model ?? ''),
        path: String(req.url ?? ''),
      })
      if (options.responseStatus && options.responseStatus !== 200) {
        res.writeHead(options.responseStatus, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: `forced_${options.responseStatus}` }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        model: options.model,
        choices: [
          {
            message: {
              content: JSON.stringify(MODEL_OUTPUT),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }))
    })().catch((error: unknown) => {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  })

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    probes,
    stop: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

async function run() {
  const byokRelay = await startRelayProbe({ model: BYOK_MODEL, responseStatus: 401 })
  const envFallbackRelay = await startRelayProbe({ model: ENV_FALLBACK_MODEL })
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const child = spawnBackend(port, tail, {
    AI_PLAYER_GOVERNANCE_STATE_PATH: buildSessionPersistPath('ai_player_http_model_proposal_byok_governance_state'),
    SESSION_STATE_PERSIST_PATH: buildSessionPersistPath('ai_player_http_model_proposal_byok_session_state'),
    WORLD_STATE_PERSIST_PATH: seedWorldState(),
    FACTION_CONFIG_STORE_PATH: buildSessionPersistPath('ai_player_http_model_proposal_byok_faction_config'),
    AI_PLAYER_RUNTIME_MODEL_BASE_URL: envFallbackRelay.baseUrl,
    AI_PLAYER_RUNTIME_MODEL: ENV_FALLBACK_MODEL,
    AI_PLAYER_RUNTIME_MODEL_API_KEY: ENV_FALLBACK_SECRET,
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const join = await requestJson(baseUrl, '/api/session/join', 'POST', {
      factionId: FACTION_ID,
      playerName: GOVERNOR_PLAYER_ID,
    })
    assert.equal(join.status, 200, `session join failed: ${JSON.stringify(join.data)}`)

    const saveModelConfig = await requestJson(baseUrl, `/api/faction/${FACTION_ID}/model-config`, 'POST', {
      model: 'faction/base-model',
      commanderModel: BYOK_MODEL,
      baseUrl: byokRelay.baseUrl,
      apiKey: BYOK_SECRET,
    })
    assert.equal(saveModelConfig.status, 200, `save faction model config failed: ${JSON.stringify(saveModelConfig.data)}`)

    const register = await requestJson(baseUrl, '/api/ai/players', 'POST', {
      aiPlayerId: AI_PLAYER_ID,
      displayName: 'Player Operator Model BYOK',
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      actionWhitelist: ['reward_claim'],
    })
    assert.equal(register.status, 200, `register failed: ${JSON.stringify(register.data)}`)

    const modelProposals = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}/model-proposals`, 'POST')
    assert.equal(modelProposals.status, 200, `model proposal route failed: ${JSON.stringify(modelProposals.data)}`)
    const modelProposalPayload = readObject(modelProposals.data)
    assert.equal(modelProposalPayload.ok, true)
    assert.equal(modelProposalPayload.model, ENV_FALLBACK_MODEL)
    assert.equal(modelProposalPayload.proposalCount, 1)
    assert.equal(byokRelay.probes.length, 1)
    assert.equal(byokRelay.probes[0].path, '/v1/chat/completions')
    assert.equal(byokRelay.probes[0].model, BYOK_MODEL)
    assert.equal(byokRelay.probes[0].authorization, `Bearer ${BYOK_SECRET}`)
    assert.equal(envFallbackRelay.probes.length, 1)
    assert.equal(envFallbackRelay.probes[0].path, '/v1/chat/completions')
    assert.equal(envFallbackRelay.probes[0].model, ENV_FALLBACK_MODEL)
    assert.equal(envFallbackRelay.probes[0].authorization, `Bearer ${ENV_FALLBACK_SECRET}`)
    const providerFallback = readObject(modelProposalPayload.providerFallback)
    assert.equal(readObject(providerFallback.selectedProvider).model, ENV_FALLBACK_MODEL)
    assert.equal(readObject(providerFallback.selectedProvider).source, 'env')
    assert.equal(providerFallback.failureCount, 1)
    const providerFailure = readObject(readArray(providerFallback.failures)[0])
    assert.equal(providerFailure.model, BYOK_MODEL)
    assert.equal(providerFailure.source, 'faction_config')
    assert.equal(providerFailure.byokSource, 'faction_config')
    assert.equal(providerFailure.error, 'model_request_failed_401')

    const serializedPayload = JSON.stringify(modelProposals.data)
    assert.equal(serializedPayload.includes(BYOK_SECRET), false, 'model proposal response must not expose faction BYOK secret')
    assert.equal(serializedPayload.includes(ENV_FALLBACK_SECRET), false, 'model proposal response must not expose env secret')

    const runtimeAfter = await requestJson(baseUrl, `/api/ai/players/${AI_PLAYER_ID}`, 'GET')
    assert.equal(runtimeAfter.status, 200, `runtime read failed: ${JSON.stringify(runtimeAfter.data)}`)
    const modelStatus = readObject(readObject(runtimeAfter.data).modelStatus)
    assert.equal(modelStatus.source, 'faction_config')
    assert.equal(modelStatus.secretSource, 'faction_config:byok')
    assert.match(String(modelStatus.lastFallbackReason), /faction_config:model_request_failed_401/)
    const factionCandidate = readObject(readArray(modelStatus.candidateTargets).find((item) => readObject(item).source === 'faction_config'))
    assert.equal(factionCandidate.lastFailureReason, 'model_request_failed_401')
    assert.equal(JSON.stringify(runtimeAfter.data).includes(BYOK_SECRET), false)
    assert.equal(JSON.stringify(runtimeAfter.data).includes(ENV_FALLBACK_SECRET), false)

    console.log('[ai_player_http_model_proposal_byok_contract] all checks passed')
  } finally {
    await shutdownChild(child)
    await byokRelay.stop()
    await envFallbackRelay.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_model_proposal_byok_contract] failed:', error)
  process.exitCode = 1
})
