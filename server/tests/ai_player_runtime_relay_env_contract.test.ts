import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { writeFileSync } from 'node:fs'
import { createInitialWorldState } from '../../shared/domain/scenario'
import {
  buildSessionPersistPath,
  getAvailablePort,
  readObject,
  requestJson,
  shutdownChild,
  spawnBackend,
  type TailState,
  waitForHealth,
} from './helpers/backendHarness'

const RUNTIME_AI_PLAYER_ID = 'player_operator_relay_runtime'
const CHAT_AI_PLAYER_ID = 'player_operator_relay_chat'
const FACTION_ID = 'player'
const GOVERNOR_PLAYER_ID = 'human_relay_env'
const TEST_RELAY_API_KEY = 'test-relay-env-secret-never-echo'
const TEST_MODEL = 'claude-haiku-4-5-20251001'

const MODEL_OUTPUT = {
  summary: 'transfer available AI wood to the governor inbox through governed proposal flow',
  proposals: [
    {
      action: 'resource_transfer_to_governor',
      args: {
        resources: {
          wood: 11,
        },
      },
      reason: 'The relay-env contract observed transferable wood and an open runtime transfer policy.',
    },
  ],
  deferReason: '',
  needsHumanReview: false,
}

type RelayCall = {
  path: string
  authorization: string
  body: Record<string, unknown>
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function startMockRelay() {
  const port = await getAvailablePort()
  const calls: RelayCall[] = []
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'not_found' }))
      return
    }

    const rawBody = await readRequestBody(req)
    calls.push({
      path: req.url,
      authorization: String(req.headers.authorization ?? ''),
      body: JSON.parse(rawBody) as Record<string, unknown>,
    })

    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      model: TEST_MODEL,
      choices: [
        {
          message: {
            content: JSON.stringify(MODEL_OUTPUT),
          },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
      },
    }))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  })

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

function seedWorldStateWithRelayEnvAccounts() {
  const world = createInitialWorldState()
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, `missing faction ${FACTION_ID} while seeding relay-env shard`)
  faction.aiPlayers = [
    {
      id: RUNTIME_AI_PLAYER_ID,
      name: 'Relay Runtime Operator',
      factionId: FACTION_ID,
      unitIds: [],
      specialty: 'logistics',
    },
    {
      id: CHAT_AI_PLAYER_ID,
      name: 'Relay Chat Operator',
      factionId: FACTION_ID,
      unitIds: [],
      specialty: 'logistics',
    },
  ]
  faction.aiResourceAccounts = {
    [RUNTIME_AI_PLAYER_ID]: {
      aiPlayerId: RUNTIME_AI_PLAYER_ID,
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      resources: {
        food: 0,
        wood: 40,
        stone: 0,
        iron: 0,
      },
      updatedTick: world.tick,
    },
    [CHAT_AI_PLAYER_ID]: {
      aiPlayerId: CHAT_AI_PLAYER_ID,
      governorPlayerId: GOVERNOR_PLAYER_ID,
      factionId: FACTION_ID,
      resources: {
        food: 0,
        wood: 40,
        stone: 0,
        iron: 0,
      },
      updatedTick: world.tick,
    },
  }
  faction.governorResourceInboxes = {}

  const path = buildSessionPersistPath('ai_player_runtime_relay_env_world_state')
  writeFileSync(path, `${JSON.stringify(world)}\n`, 'utf-8')
  return path
}

async function registerRelayAiPlayer(baseUrl: string, aiPlayerId: string, displayName: string) {
  const register = await requestJson(baseUrl, '/api/ai/players', 'POST', {
    aiPlayerId,
    displayName,
    governorPlayerId: GOVERNOR_PLAYER_ID,
    factionId: FACTION_ID,
    actionWhitelist: ['resource_transfer_to_governor'],
    budgetPolicy: {
      allowHighRiskActions: true,
    },
  })
  assert.equal(register.status, 200, `register ${aiPlayerId} failed: ${JSON.stringify(register.data)}`)
}

function assertNoSecretLeak(value: unknown) {
  const serialized = JSON.stringify(value)
  assert.ok(!serialized.includes(TEST_RELAY_API_KEY), `relay secret leaked through response payload: ${serialized}`)
}

async function run() {
  const relay = await startMockRelay()
  const port = await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const tail: TailState = { stdout: [], stderr: [] }
  const worldStatePath = seedWorldStateWithRelayEnvAccounts()
  const child = spawnBackend(port, tail, {
    AI_PLAYER_GOVERNANCE_STATE_PATH: buildSessionPersistPath('ai_player_runtime_relay_env_governance_state'),
    SESSION_STATE_PERSIST_PATH: buildSessionPersistPath('ai_player_runtime_relay_env_session_state'),
    WORLD_STATE_PERSIST_PATH: worldStatePath,
    AI_PLAYER_RUNTIME_MODEL_API_KEY: '',
    AI_PLAYER_RUNTIME_MODEL_BASE_URL: '',
    AI_PLAYER_RUNTIME_MODEL: '',
    LLM_RELAY_API_KEY: TEST_RELAY_API_KEY,
    LLM_RELAY_API_KEYS: '',
    LLM_RELAY_URL: relay.baseUrl,
    LLM_RELAY_MODEL: TEST_MODEL,
    OPENAI_API_KEY: '',
  })

  try {
    const health = await waitForHealth(baseUrl)
    assert.ok(health, `backend did not become healthy\nstdout=${tail.stdout.join('\n')}\nstderr=${tail.stderr.join('\n')}`)

    const join = await requestJson(baseUrl, '/api/session/join', 'POST', {
      factionId: FACTION_ID,
      playerName: GOVERNOR_PLAYER_ID,
    })
    assert.equal(join.status, 200, `session join failed: ${JSON.stringify(join.data)}`)

    await registerRelayAiPlayer(baseUrl, RUNTIME_AI_PLAYER_ID, 'Relay Runtime Operator')
    await registerRelayAiPlayer(baseUrl, CHAT_AI_PLAYER_ID, 'Relay Chat Operator')

    const runtimeProposal = await requestJson(baseUrl, `/api/ai/players/${RUNTIME_AI_PLAYER_ID}/model-proposals`, 'POST')
    assert.equal(runtimeProposal.status, 200, `runtime relay proposal failed: ${JSON.stringify(runtimeProposal.data)}`)
    const runtimePayload = readObject(runtimeProposal.data)
    assert.equal(runtimePayload.ok, true)
    assert.equal(runtimePayload.model, TEST_MODEL)
    assert.equal(runtimePayload.proposalCount, 1)
    const runtimeProposalItem = readObject((runtimePayload.proposals as unknown[])[0])
    assert.equal(runtimeProposalItem.source, 'llm')
    assert.equal(runtimeProposalItem.action, 'resource_transfer_to_governor')
    assertNoSecretLeak(runtimeProposal.data)

    const chatProposal = await requestJson(baseUrl, `/api/ai/players/${CHAT_AI_PLAYER_ID}/chat/messages`, 'POST', {
      body: '青州后勤官，判断一下现在是否应该向总督输送资源。',
      senderId: GOVERNOR_PLAYER_ID,
      senderName: '总督',
      createProposal: true,
    })
    assert.equal(chatProposal.status, 200, `chat relay proposal failed: ${JSON.stringify(chatProposal.data)}`)
    const chatPayload = readObject(chatProposal.data)
    assert.equal(chatPayload.ok, true)
    const chatProposalItem = readObject(chatPayload.proposal)
    assert.equal(chatProposalItem.source, 'llm')
    assert.equal(chatProposalItem.action, 'resource_transfer_to_governor')
    const proposalMessage = readObject(chatPayload.proposalMessage)
    const proposalMetadata = readObject(proposalMessage.metadata)
    assert.equal(proposalMetadata.proposalMode, 'model')
    assert.equal(proposalMetadata.model, TEST_MODEL)
    assertNoSecretLeak(chatProposal.data)

    assert.equal(relay.calls.length, 2, `expected runtime and chat to call relay once each, got ${relay.calls.length}`)
    for (const call of relay.calls) {
      assert.equal(call.path, '/v1/chat/completions')
      assert.equal(call.authorization, `Bearer ${TEST_RELAY_API_KEY}`)
      assert.equal(call.body.model, TEST_MODEL)
      assert.deepEqual(call.body.response_format, { type: 'json_object' })
    }

    console.log('[ai_player_runtime_relay_env_contract] all checks passed')
  } finally {
    await shutdownChild(child)
    await relay.close()
  }
}

run().catch((error) => {
  console.error('[ai_player_runtime_relay_env_contract] failed:', error)
  process.exitCode = 1
})
