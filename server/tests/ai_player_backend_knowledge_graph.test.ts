import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  AI_PLAYER_AUTHORITY_DECISIONS,
  AI_PLAYER_BACKEND_VERSION_CONTROL_SCOPE,
  AI_PLAYER_KNOWLEDGE_GRAPH_VERSION,
  AI_PLAYER_PROMOTED_V1_ACTION_IDS,
  AI_PLAYER_PROMOTED_V1_ACTION_KNOWLEDGE,
} from '../../shared/contracts/aiPlayerKnowledgeGraph'
import { listStaticAiPlayerActionCatalog } from '../src/application/ai/aiPlayerActionCatalog'

function testPromotedKnowledgeMatchesExecutableCatalog() {
  const catalog = new Map(listStaticAiPlayerActionCatalog().map((entry) => [entry.action, entry] as const))

  for (const node of AI_PLAYER_PROMOTED_V1_ACTION_KNOWLEDGE) {
    const entry = catalog.get(node.aiAction)
    assert.ok(entry, `knowledge graph action ${node.aiAction} must exist in the AI action catalog`)
    assert.equal(entry?.executableInV1, true, `knowledge graph action ${node.aiAction} must remain executable in v1`)
    assert.equal(entry?.mappedWorldAction, node.worldAction, `knowledge graph action ${node.aiAction} must stay mapped to the documented world action`)
    assert.ok(node.semanticSummary.trim().length >= 16, `knowledge graph action ${node.aiAction} must keep a useful semantic summary`)
    assert.ok(node.verificationCommands.length >= 2, `knowledge graph action ${node.aiAction} must keep formal verification commands`)
    assert.ok(node.criticalNotes.length >= 1, `knowledge graph action ${node.aiAction} must keep at least one critical note`)
  }
}

function testKnowledgeGraphCoversAllClosedV1Actions() {
  const executableCatalogActions = listStaticAiPlayerActionCatalog()
    .filter((entry) => entry.executableInV1)
    .map((entry) => entry.action)
    .sort()
  const documentedActions = [...AI_PLAYER_PROMOTED_V1_ACTION_IDS].sort()

  assert.deepEqual(
    documentedActions,
    executableCatalogActions,
    'machine-readable knowledge graph must cover every closed v1 AI player action',
  )
}

function testDeferredAuthorityDecisionRemainsExplicit() {
  const deferredContextFocus = AI_PLAYER_AUTHORITY_DECISIONS.find((item) => item.worldAction === 'setAiContextFocus')
  assert.ok(deferredContextFocus, 'knowledge graph must keep an explicit deferred decision for setAiContextFocus')
  assert.equal(
    deferredContextFocus?.recommendation,
    'defer',
    'setAiContextFocus should remain deferred until it gains a stable player-action semantic',
  )
  assert.equal(deferredContextFocus?.suggestedAiAction, null, 'deferred context-focus authority should not invent a player action id')
  assert.ok(
    (deferredContextFocus?.rationale.length ?? 0) >= 24,
    'deferred context-focus authority should keep an explicit rationale to prevent repeat work',
  )

  const promotedResourceTransfer = AI_PLAYER_AUTHORITY_DECISIONS.find(
    (item) => item.worldAction === 'transferFactionResourcesToGovernor',
  )
  assert.ok(
    promotedResourceTransfer,
    'knowledge graph must keep an explicit decision for AI-to-governor resource transfer',
  )
  assert.equal(
    promotedResourceTransfer?.recommendation,
    'promoted',
    'resource transfer should be promoted after backend authority and user-confirmed semantics exist',
  )
  assert.equal(
    promotedResourceTransfer?.suggestedAiAction,
    'resource_transfer_to_governor',
    'promoted resource transfer should map to the AI player action id',
  )
  assert.ok(
    (promotedResourceTransfer?.rationale.length ?? 0) >= 80,
    'promoted resource transfer should keep an explicit rationale to prevent repeat work',
  )
  assert.ok(
    (promotedResourceTransfer?.blockers?.length ?? 0) >= 4,
    'promoted resource transfer must preserve the confirmed product/backend decisions',
  )
  assert.ok(
    promotedResourceTransfer?.blockers?.some((item) => item.id === 'target-wallet-semantics' && !item.requiresUserConfirmation),
    'resource transfer target wallet semantics should be marked confirmed',
  )
  assert.ok(
    promotedResourceTransfer?.blockers?.some((item) => item.id === 'source-account-semantics' && !item.requiresUserConfirmation),
    'resource transfer AI source account semantics should be marked confirmed',
  )
  assert.ok(
    promotedResourceTransfer?.blockers?.every((item) => item.question.length >= 24 && item.unblocks.length >= 16),
    'resource transfer decision records must be actionable instead of terse notes',
  )

  const promotedResourceGather = AI_PLAYER_AUTHORITY_DECISIONS.find(
    (item) => item.worldAction === 'gatherAiResourceTile',
  )
  assert.ok(promotedResourceGather, 'knowledge graph must keep an explicit decision for AI resource gathering')
  assert.equal(promotedResourceGather?.recommendation, 'promoted')
  assert.equal(promotedResourceGather?.suggestedAiAction, 'resource_gather')
  assert.ok(
    (promotedResourceGather?.rationale.length ?? 0) >= 80,
    'promoted resource gather should keep the confirmed one-time AI subaccount semantics',
  )

  const governorInboxClaim = AI_PLAYER_AUTHORITY_DECISIONS.find(
    (item) => item.worldAction === 'claimGovernorResourceInbox',
  )
  assert.ok(governorInboxClaim, 'knowledge graph must keep the governor inbox claim decision')
  assert.equal(governorInboxClaim?.recommendation, 'defer')
  assert.equal(governorInboxClaim?.suggestedAiAction, null)
}

function testBackendVersionControlScopeIsConcrete() {
  const paths = AI_PLAYER_BACKEND_VERSION_CONTROL_SCOPE.map((item) => item.path)
  assert.equal(new Set(paths).size, paths.length, 'AI player backend review scope must not contain duplicate paths')
  assert.ok(
    paths.includes('server/src/application/ai/AIPlayerGovernanceService.ts'),
    'review scope must include the facade service',
  )
  assert.ok(
    paths.includes('server/src/application/ai/aiPlayerProposalLifecycle.ts'),
    'review scope must include proposal lifecycle split',
  )
  assert.ok(
    paths.includes('shared/contracts/aiPlayerRuntimePrompt.ts'),
    'review scope must include runtime prompt contract',
  )
  assert.ok(
    paths.includes('shared/schemas/aiPlayerRuntimePrompt.ts'),
    'review scope must include runtime prompt schema',
  )
  assert.ok(
    paths.includes('server/src/application/ai/aiPlayerGovernancePersist.ts'),
    'review scope must include persistence split',
  )
  assert.ok(
    paths.includes('server/src/application/ai/aiPlayerGovernanceRuntimeView.ts'),
    'review scope must include runtime read-model split',
  )

  for (const item of AI_PLAYER_BACKEND_VERSION_CONTROL_SCOPE) {
    assert.ok(item.role.trim().length >= 12, `${item.path} must describe its role`)
    assert.ok(item.reviewExpectation.trim().length >= 16, `${item.path} must describe review expectations`)
    assert.ok(existsSync(join(process.cwd(), item.path)), `${item.path} must exist in the repository`)
  }
}

function run() {
  assert.equal(AI_PLAYER_KNOWLEDGE_GRAPH_VERSION, '2026-04-21')
  testPromotedKnowledgeMatchesExecutableCatalog()
  testKnowledgeGraphCoversAllClosedV1Actions()
  testDeferredAuthorityDecisionRemainsExplicit()
  testBackendVersionControlScopeIsConcrete()
  console.log('[ai_player_backend_knowledge_graph] all checks passed')
}

run()
