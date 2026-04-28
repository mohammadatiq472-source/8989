import assert from 'node:assert/strict'
import type { ResolvedPlannerTarget } from '../src/config/modelGateway'
import {
  buildAiPlayerRuntimeProposalMessages,
  parseAiPlayerRuntimeProposalJson,
  requestAiPlayerRuntimeProposalFromModel,
  toAiPlayerActionProposalRequests,
} from '../src/application/ai/aiPlayerRuntimeProposalModel'
import { AI_PLAYER_RUNTIME_SYSTEM_CONTEXT } from '../../shared/contracts/aiPlayerRuntimePrompt'
import { aiPlayerActionProposalRequestSchema } from '../../shared/schemas/aiPlayer'

const TARGET: ResolvedPlannerTarget = {
  source: 'gateway',
  label: 'contract relay',
  protocol: 'openai_compat',
  baseUrl: 'https://relay.example/v1',
  apiKeys: ['secret-token-for-test'],
  model: 'cheap-json-model',
}

const VALID_MODEL_OUTPUT = {
  summary: 'transfer excess wood to the governor inbox',
  proposals: [
    {
      action: 'resource_transfer_to_governor',
      args: { resources: { wood: 11 } },
      reason: '资源：AI 子账户木材 11 可输送；目标：转入总督通用收件箱；风险：需要人工批准且受额度/冷却约束；批准后结果：后端执行资源输送并生成 receipt。',
    },
  ],
  deferReason: '',
  needsHumanReview: true,
}

function testStrictJsonParserAndRequestConversion() {
  const parsed = parseAiPlayerRuntimeProposalJson(JSON.stringify(VALID_MODEL_OUTPUT))
  assert.equal(parsed.proposals.length, 1)
  assert.equal(parsed.proposals[0].action, 'resource_transfer_to_governor')

  const requests = toAiPlayerActionProposalRequests('ai_player_alpha', parsed)
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0], {
    aiPlayerId: 'ai_player_alpha',
    action: 'resource_transfer_to_governor',
    args: { resources: { wood: 11 } },
    reason: '资源：AI 子账户木材 11 可输送；目标：转入总督通用收件箱；风险：需要人工批准且受额度/冷却约束；批准后结果：后端执行资源输送并生成 receipt。',
    source: 'llm',
  })
  assert.ok(aiPlayerActionProposalRequestSchema.safeParse(requests[0]).success)
}

function testParserRejectsNonContractOutput() {
  assert.throws(
    () => parseAiPlayerRuntimeProposalJson('```json\n{"proposals":[]}\n```'),
    /Unexpected token/,
    'model output must be strict JSON without markdown fences',
  )
  assert.throws(
    () => parseAiPlayerRuntimeProposalJson(JSON.stringify({
      summary: 'invalid action',
      proposals: [{ action: 'battle_report_read', args: {}, reason: 'not executable in the runtime prompt' }],
      needsHumanReview: false,
    })),
    /AI_PLAYER_RUNTIME_ALLOWED_ACTIONS/,
    'model output must stay inside the executable v1 player action list',
  )
  assert.throws(
    () => parseAiPlayerRuntimeProposalJson(JSON.stringify({
      summary: 'too many',
      proposals: Array.from({ length: AI_PLAYER_RUNTIME_SYSTEM_CONTEXT.outputContract.maxProposals + 1 }, () => ({
        action: 'reward_claim',
        args: {},
        reason: 'claim pending reward',
      })),
      needsHumanReview: false,
    })),
    /Too big/,
    'model output must respect maxProposals',
  )
}

async function testOpenAiCompatRequestUsesJsonOnlyBoundary() {
  let observedAuthorization = ''
  let observedBody: Record<string, unknown> = {}
  const fetchImpl: typeof fetch = async (_url, init) => {
    observedAuthorization = String((init?.headers as Record<string, string>).Authorization)
    observedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    return new Response(JSON.stringify({
      model: TARGET.model,
      choices: [
        {
          message: {
            content: JSON.stringify(VALID_MODEL_OUTPUT),
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const result = await requestAiPlayerRuntimeProposalFromModel({
    target: TARGET,
    observation: {
      aiPlayerId: 'ai_player_alpha',
      runtime: { aiPlayerId: 'ai_player_alpha', resourceTransfer: { canTransferNow: true } },
      world: { factions: { player: { aiResourceAccounts: { ai_player_alpha: { resources: { wood: 30 } } } } } },
      receipts: [],
      failures: [],
    },
    fetchImpl,
  })

  if (!result.ok) {
    throw new Error(result.error)
  }
  assert.equal(result.ok, true)
  assert.equal(observedAuthorization, `Bearer ${TARGET.apiKeys[0]}`)
  assert.equal(observedBody.model, TARGET.model)
  assert.deepEqual(observedBody.response_format, { type: 'json_object' })
  assert.equal(result.proposalRequests[0].source, 'llm')
  assert.equal(result.proposalRequests[0].action, 'resource_transfer_to_governor')

  const messages = buildAiPlayerRuntimeProposalMessages({
    aiPlayerId: 'ai_player_alpha',
    runtime: {},
  })
  assert.ok(messages[0].content.includes('JSON only'))
  assert.ok(messages[0].content.includes('WorldService'))
  assert.ok(messages[0].content.includes('commitWorldState'))
}

async function testModelErrorsDoNotExposeSecrets() {
  const failed = await requestAiPlayerRuntimeProposalFromModel({
    target: TARGET,
    observation: { aiPlayerId: 'ai_player_alpha', runtime: {} },
    fetchImpl: async () => new Response('{}', { status: 401 }),
  })
  assert.equal(failed.ok, false)
  assert.equal(failed.error, 'model_request_failed_401')
  assert.ok(!failed.error.includes(TARGET.apiKeys[0]))

  const missingKey = await requestAiPlayerRuntimeProposalFromModel({
    target: { ...TARGET, apiKeys: [] },
    observation: { aiPlayerId: 'ai_player_alpha', runtime: {} },
    fetchImpl: async () => new Response('{}', { status: 200 }),
  })
  assert.equal(missingKey.ok, false)
  assert.equal(missingKey.error, 'missing_model_api_key')
}

async function testAuthFailuresTryNextKeyWithoutSecretLeak() {
  const attemptedAuthorizations: string[] = []
  const retryTarget: ResolvedPlannerTarget = {
    ...TARGET,
    apiKeys: ['expired-key-for-test', 'valid-key-for-test'],
  }
  const result = await requestAiPlayerRuntimeProposalFromModel({
    target: retryTarget,
    observation: { aiPlayerId: 'ai_player_alpha', runtime: {} },
    fetchImpl: async (_url, init) => {
      const authorization = String((init?.headers as Record<string, string>).Authorization)
      attemptedAuthorizations.push(authorization)
      if (authorization === 'Bearer expired-key-for-test') {
        return new Response('{}', { status: 401 })
      }
      return new Response(JSON.stringify({
        model: retryTarget.model,
        choices: [
          {
            message: {
              content: JSON.stringify(VALID_MODEL_OUTPUT),
            },
          },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })

  if (!result.ok) {
    throw new Error(result.error)
  }
  assert.deepEqual(attemptedAuthorizations, [
    'Bearer expired-key-for-test',
    'Bearer valid-key-for-test',
  ])
  assert.equal(result.proposalRequests.length, 1)
  assert.equal(result.proposalRequests[0].source, 'llm')
}

async function testJsonParseFailureRetriesWithRawJsonCorrection() {
  let callCount = 0
  let retryBody: Record<string, unknown> = {}
  const result = await requestAiPlayerRuntimeProposalFromModel({
    target: TARGET,
    observation: { aiPlayerId: 'ai_player_alpha', runtime: {} },
    fetchImpl: async (_url, init) => {
      callCount += 1
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      if (callCount === 2) {
        retryBody = body
      }
      const content = callCount === 1
        ? `\`\`\`json\n${JSON.stringify(VALID_MODEL_OUTPUT)}\n\`\`\``
        : JSON.stringify(VALID_MODEL_OUTPUT)
      return new Response(JSON.stringify({
        model: TARGET.model,
        choices: [
          {
            message: {
              content,
            },
          },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })

  if (!result.ok) {
    throw new Error(result.error)
  }
  assert.equal(callCount, 2, 'markdown-fenced model output should trigger one raw JSON correction retry')
  assert.ok(JSON.stringify(retryBody).includes('not raw JSON'))
  assert.equal(result.proposalRequests[0].action, 'resource_transfer_to_governor')
}

async function testRetryCanNormalizeCompleteMarkdownFenceAfterCorrection() {
  let callCount = 0
  const result = await requestAiPlayerRuntimeProposalFromModel({
    target: TARGET,
    observation: { aiPlayerId: 'ai_player_alpha', runtime: {} },
    fetchImpl: async () => {
      callCount += 1
      return new Response(JSON.stringify({
        model: TARGET.model,
        choices: [
          {
            message: {
              content: `\`\`\`json\n${JSON.stringify(VALID_MODEL_OUTPUT)}\n\`\`\``,
            },
          },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })

  if (!result.ok) {
    throw new Error(result.error)
  }
  assert.equal(callCount, 3)
  assert.equal(result.normalization, 'markdown_fence_after_retry')
  assert.equal(result.proposalRequests[0].action, 'resource_transfer_to_governor')
}

async function testFinalCorrectionCanRecoverStrictRawJson() {
  let callCount = 0
  const result = await requestAiPlayerRuntimeProposalFromModel({
    target: TARGET,
    observation: { aiPlayerId: 'ai_player_alpha', runtime: {} },
    fetchImpl: async () => {
      callCount += 1
      const content = callCount < 3
        ? `\`\`\`json\n${JSON.stringify(VALID_MODEL_OUTPUT)}\n\`\`\``
        : JSON.stringify(VALID_MODEL_OUTPUT)
      return new Response(JSON.stringify({
        model: TARGET.model,
        choices: [
          {
            message: {
              content,
            },
          },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })

  if (!result.ok) {
    throw new Error(result.error)
  }
  assert.equal(callCount, 3)
  assert.equal(result.normalization, undefined)
  assert.equal(result.proposalRequests[0].action, 'resource_transfer_to_governor')
}

async function run() {
  testStrictJsonParserAndRequestConversion()
  testParserRejectsNonContractOutput()
  await testOpenAiCompatRequestUsesJsonOnlyBoundary()
  await testModelErrorsDoNotExposeSecrets()
  await testAuthFailuresTryNextKeyWithoutSecretLeak()
  await testJsonParseFailureRetriesWithRawJsonCorrection()
  await testRetryCanNormalizeCompleteMarkdownFenceAfterCorrection()
  await testFinalCorrectionCanRecoverStrictRawJson()
  console.log('[ai_player_runtime_model_proposal_contract] all checks passed')
}

run().catch((error) => {
  console.error('[ai_player_runtime_model_proposal_contract] failed:', error)
  process.exitCode = 1
})
