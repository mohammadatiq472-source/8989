import assert from 'node:assert/strict'
import {
  AI_PLAYER_RUNTIME_ALLOWED_ACTIONS,
  AI_PLAYER_RUNTIME_DEFERRED_WORLD_AUTHORITIES,
  AI_PLAYER_RUNTIME_PROMPT_VERSION,
  AI_PLAYER_RUNTIME_SYSTEM_CONTEXT,
  renderAiPlayerRuntimeSystemPrompt,
} from '../../shared/contracts/aiPlayerRuntimePrompt'
import { parseAiPlayerRuntimeSystemContext } from '../../shared/schemas/aiPlayerRuntimePrompt'
import { listStaticAiPlayerActionCatalog } from '../src/application/ai/aiPlayerActionCatalog'

function testAllowedActionsMatchExecutableCatalog() {
  const executableActions = listStaticAiPlayerActionCatalog()
    .filter((entry) => entry.executableInV1)
    .map((entry) => entry.action)
    .sort()
  const promptActions = [...AI_PLAYER_RUNTIME_ALLOWED_ACTIONS].sort()

  assert.deepEqual(
    promptActions,
    executableActions,
    'runtime prompt allowed actions must match the closed executable v1 catalog',
  )
}

function testPromptSchemaAndSections() {
  const parsed = parseAiPlayerRuntimeSystemContext(AI_PLAYER_RUNTIME_SYSTEM_CONTEXT)
  assert.equal(parsed.version, AI_PLAYER_RUNTIME_PROMPT_VERSION)
  assert.equal(parsed.outputContract.format, 'json')
  assert.equal(parsed.outputContract.maxProposals, 3)
  assert.deepEqual(parsed.outputContract.requiredProposalFields, ['action', 'args', 'reason'])

  const sectionIds = new Set(parsed.sections.map((section) => section.id))
  for (const requiredSection of ['role', 'authority', 'observation', 'decision', 'budget', 'output'] as const) {
    assert.ok(sectionIds.has(requiredSection), `runtime prompt must include ${requiredSection} section`)
  }
}

function testRenderedPromptKeepsAuthorityBoundary() {
  const rendered = renderAiPlayerRuntimeSystemPrompt()

  for (const action of AI_PLAYER_RUNTIME_ALLOWED_ACTIONS) {
    assert.ok(rendered.includes(action), `rendered prompt must include executable action ${action}`)
  }

  for (const deferredAuthority of AI_PLAYER_RUNTIME_DEFERRED_WORLD_AUTHORITIES) {
    assert.ok(rendered.includes(deferredAuthority), `rendered prompt must name deferred authority ${deferredAuthority}`)
  }

  for (const requiredToken of [
    'SessionManager',
    'WorldService',
    'shared/domain/rules.ts',
    'commitWorldState',
    'action-specific',
    'developmentPlan',
    'candidateActions',
    'riskItems',
    'failureCode',
    'JSON only',
    '资源：',
    '目标：',
    '风险：',
    '批准后结果：',
  ]) {
    assert.ok(rendered.includes(requiredToken), `rendered prompt must preserve ${requiredToken}`)
  }

  assert.ok(
    !([...AI_PLAYER_RUNTIME_ALLOWED_ACTIONS] as readonly string[]).includes('setAiContextFocus'),
    'context focus must not become a player action',
  )
}

function run() {
  testAllowedActionsMatchExecutableCatalog()
  testPromptSchemaAndSections()
  testRenderedPromptKeepsAuthorityBoundary()
  console.log('[ai_player_runtime_prompt_contract] all checks passed')
}

run()
