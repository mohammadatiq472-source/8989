import type {
  AiPlayerActionCatalogEntry,
  AiPlayerActionType,
  AiPlayerExecutableV1ActionType,
} from './aiPlayer'

export const AI_PLAYER_KNOWLEDGE_GRAPH_VERSION = '2026-04-20'
export const AI_PLAYER_KNOWLEDGE_GRAPH_FORMATS = ['json', 'obsidian'] as const
export const AI_PLAYER_AUTHORITY_RECOMMENDATIONS = ['promoted', 'defer'] as const

export type AiPlayerPromotedActionKnowledge = {
  aiAction: AiPlayerExecutableV1ActionType
  worldAction: string
  semanticSummary: string
  verificationCommands: readonly string[]
  criticalNotes: readonly string[]
}

export type AiPlayerAuthorityDecision = {
  worldAction: string
  recommendation: (typeof AI_PLAYER_AUTHORITY_RECOMMENDATIONS)[number]
  suggestedAiAction: AiPlayerActionType | null
  rationale: string
}

export type AiPlayerBackendVersionControlScopeItem = {
  path: string
  role: string
  reviewExpectation: string
}

export type AiPlayerKnowledgeGraphFormat = (typeof AI_PLAYER_KNOWLEDGE_GRAPH_FORMATS)[number]

export type AiPlayerKnowledgeGraphQuery = {
  aiAction?: AiPlayerActionType
  worldAction?: string
  recommendation?: (typeof AI_PLAYER_AUTHORITY_RECOMMENDATIONS)[number]
  includeCatalog?: boolean
}

export type AiPlayerKnowledgeGraphSnapshot = {
  version: string
  exportedAt: string
  query: {
    aiAction: AiPlayerActionType | null
    worldAction: string | null
    recommendation: (typeof AI_PLAYER_AUTHORITY_RECOMMENDATIONS)[number] | null
    includeCatalog: boolean
  }
  promotedActions: readonly AiPlayerPromotedActionKnowledge[]
  authorityDecisions: readonly AiPlayerAuthorityDecision[]
  versionControlScope: readonly AiPlayerBackendVersionControlScopeItem[]
  executableCatalog: readonly AiPlayerActionCatalogEntry[]
  counts: {
    promotedActions: number
    authorityDecisions: number
    versionControlScope: number
    executableCatalog: number
  }
}

export const AI_PLAYER_PROMOTED_V1_ACTION_KNOWLEDGE: readonly AiPlayerPromotedActionKnowledge[] = [
  {
    aiAction: 'city_upgrade',
    worldAction: 'upgradeCity',
    semanticSummary: 'Upgrade the owned city hall through the authoritative city write chain.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['Receipt must preserve worldAction, failureCode, and execution.'],
  },
  {
    aiAction: 'building_upgrade',
    worldAction: 'promoteCityBuilding',
    semanticSummary: 'Upgrade an owned city building with safe default target resolution.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['Proposal args stay action-specific even when omitted in the request body.'],
  },
  {
    aiAction: 'queue_fill_idle_slot',
    worldAction: 'enqueueAffair',
    semanticSummary: 'Fill the first idle city affair slot through the authoritative affair queue.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['Defaults must keep queue selection deterministic.'],
  },
  {
    aiAction: 'research_start',
    worldAction: 'upgradeCityTech',
    semanticSummary: 'Start a city tech track through the authoritative tech upgrade entry.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['Track selection is action-specific and validated at proposal creation time.'],
  },
  {
    aiAction: 'troop_train',
    worldAction: 'deployReserveHero',
    semanticSummary: 'Deploy a reserve hero to the map; this is not a standalone training system.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['Semantics are reserve deployment, not generic barracks training.'],
  },
  {
    aiAction: 'troop_facility_upgrade',
    worldAction: 'promoteTroopFacilityBuilding',
    semanticSummary: 'Upgrade a troop-panel facility building with authority ids reused from the troop panel.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['Rules lazily initialize facility state, so baseline success starts from Lv.1.'],
  },
  {
    aiAction: 'recruit_pool_select',
    worldAction: 'setRecruitSelectedPool',
    semanticSummary: 'Switch the authoritative recruit pool before commander recruitment.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['Default resolution prefers the first pool that differs from the current authority state.'],
  },
  {
    aiAction: 'recruit_commander',
    worldAction: 'recruitProspectHero',
    semanticSummary: 'Recruit a commander from the selected pool with baseline success and structured failure samples.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['Baseline success must stay before any advanceTick because prospectHeroIds auto-consume later.'],
  },
  {
    aiAction: 'world_scout',
    worldAction: 'queuePlanExecution',
    semanticSummary: 'Queue one authoritative recon order for a faction unit.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['Current v1 semantics are adjacent recon queueing, not instant intel resolution.'],
  },
  {
    aiAction: 'march_move',
    worldAction: 'moveUnit',
    semanticSummary: 'Move a faction unit to an adjacent target tile through the authoritative move path.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['Target resolution remains adjacent-only in v1.'],
  },
  {
    aiAction: 'garrison_set',
    worldAction: 'queueTacticalOverride',
    semanticSummary: 'Queue the formal garrison tactical override template for a unit.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['Current v1 path always uses the authoritative garrison template id.'],
  },
  {
    aiAction: 'general_focus_set',
    worldAction: 'setGeneralActiveHero',
    semanticSummary: 'Write the authoritative activeHeroId; this is not a UI-local focus state.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['Keep semantic distinction from purely presentational selection state.'],
  },
  {
    aiAction: 'formation_assign',
    worldAction: 'setGeneralTactic',
    semanticSummary: 'Write the authoritative tactic assignment and directive preview for a hero.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['This is tactic authority, not a full formation management system.'],
  },
  {
    aiAction: 'threat_escape',
    worldAction: 'queueAiAgendaAction',
    semanticSummary: 'Queue agenda_recover or agenda_redeploy through the AI agenda authority.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract'],
    criticalNotes: ['This is agenda-level escape, not a direct hard-coded unit retreat.'],
  },
  {
    aiAction: 'alliance_help',
    worldAction: 'allianceHelp',
    semanticSummary: 'Send one formal alliance support action to the weakest directive region.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract', 'npm run test:world:alliance-help-http-contract'],
    criticalNotes: ['Current authority is a minimal backend support action, not a full alliance mailbox system.'],
  },
  {
    aiAction: 'reward_claim',
    worldAction: 'claimReward',
    semanticSummary: 'Claim the next authoritative pending faction reward from claimableRewards.',
    verificationCommands: ['npm run build', 'npm run test:ai:player-http-contract', 'npm run test:world:reward-claim-http-contract'],
    criticalNotes: ['Current reward flow is pending-claim after provincePve settlement, not instant auto-grant.'],
  },
] as const

export const AI_PLAYER_AUTHORITY_DECISIONS: readonly AiPlayerAuthorityDecision[] = [
  {
    worldAction: 'setAiContextFocus',
    recommendation: 'defer',
    suggestedAiAction: null,
    rationale: 'This is runtime-context authority, not a stable player atomic action. Keep it explicit as a deferred candidate instead of forcing a weak AI action name.',
  },
] as const

export const AI_PLAYER_BACKEND_VERSION_CONTROL_SCOPE: readonly AiPlayerBackendVersionControlScopeItem[] = [
  {
    path: 'shared/contracts/aiPlayer.ts',
    role: 'AI player public contract and action-specific proposal args.',
    reviewExpectation: 'Any executable action change must update schema, catalog, executor, receipt tests, and knowledge graph.',
  },
  {
    path: 'shared/schemas/aiPlayer.ts',
    role: 'Proposal creation-time validation for action-specific args.',
    reviewExpectation: 'Bad args must fail before execution, normally through HTTP 422 contract coverage.',
  },
  {
    path: 'shared/contracts/aiPlayerRuntimePrompt.ts',
    role: 'Runtime LLM system-context contract for proposal-only AI player decisions.',
    reviewExpectation: 'Prompt boundaries must stay aligned with executable v1 actions and authority-chain rules.',
  },
  {
    path: 'shared/schemas/aiPlayerRuntimePrompt.ts',
    role: 'Schema guard for the runtime AI player system-context contract.',
    reviewExpectation: 'Schema must reject loose prompt contracts and preserve JSON-output requirements.',
  },
  {
    path: 'shared/contracts/aiPlayerKnowledgeGraph.ts',
    role: 'Machine-readable source of truth for promoted/deferred authority decisions and backend review scope.',
    reviewExpectation: 'Keep this file aligned with static catalog and backend split modules.',
  },
  {
    path: 'server/src/application/ai/aiPlayerActionCatalog.ts',
    role: 'Side-effect-free AI player action catalog.',
    reviewExpectation: 'Executable v1 catalog entries must match the knowledge graph.',
  },
  {
    path: 'server/src/application/ai/aiPlayerProposalExecution.ts',
    role: 'Action resolver plus authoritative WorldService executor bridge.',
    reviewExpectation: 'Must not own proposal lifecycle, receipt persistence, or governance event side effects.',
  },
  {
    path: 'server/src/application/ai/aiPlayerGovernanceState.ts',
    role: 'Shared in-memory governance maps and small state helpers.',
    reviewExpectation: 'State module must not import the facade or heavy runtime modules.',
  },
  {
    path: 'server/src/application/ai/aiPlayerGovernancePersist.ts',
    role: 'Governance persistence, restore, receipt storage, and persist health.',
    reviewExpectation: 'Persistence must remain UTF-8 JSON and keep corrupt-file quarantine behavior.',
  },
  {
    path: 'server/src/application/ai/aiPlayerGovernanceRuntimeView.ts',
    role: 'Runtime detail and observability read models.',
    reviewExpectation: 'Read models may inspect world/session state but must not mutate proposal/world authority.',
  },
  {
    path: 'server/src/application/ai/aiPlayerProposalLifecycle.ts',
    role: 'Proposal create/list/get/approve/reject/execute lifecycle.',
    reviewExpectation: 'Execution wrapper owns proposal status, receipt creation, persistence scheduling, and governance events.',
  },
  {
    path: 'server/src/application/ai/aiPlayerGovernanceEvents.ts',
    role: 'Governance event append wrapper.',
    reviewExpectation: 'Keep event recording centralized instead of duplicating appendRuntimeWorldEvent calls.',
  },
  {
    path: 'server/src/application/ai/AIPlayerGovernanceService.ts',
    role: 'Facade preserving public API exports for routes, MCP, and tests.',
    reviewExpectation: 'Do not re-expand resolver, persistence, or route-specific details back into the facade.',
  },
  {
    path: 'server/src/application/ai/AiPlayerKnowledgeGraphService.ts',
    role: 'HTTP/MCP knowledge graph snapshot and Obsidian export formatting.',
    reviewExpectation: 'Obsidian output remains a mirror, not the authoritative source.',
  },
  {
    path: 'server/src/routes/aiPlayer.ts',
    role: 'Thin AI player HTTP dispatcher.',
    reviewExpectation: 'Keep route-specific handlers in split route modules.',
  },
  {
    path: 'server/src/routes/aiPlayerKnowledgeGraphRoute.ts',
    role: 'AI player knowledge graph HTTP route.',
    reviewExpectation: 'Keep HTTP contract stable for JSON and obsidian formats.',
  },
  {
    path: 'server/src/routes/aiPlayerProposalRoutes.ts',
    role: 'AI player proposal HTTP routes.',
    reviewExpectation: 'Preserve create/approve/reject/execute behavior and status codes.',
  },
  {
    path: 'server/src/routes/aiPlayerRuntimeRoutes.ts',
    role: 'AI player runtime/catalog/register/pause/resume/receipt routes.',
    reviewExpectation: 'Preserve runtime read shape and registration semantics.',
  },
  {
    path: 'server/src/routes/aiPlayerRouteShared.ts',
    role: 'Shared AI player route parsing helpers.',
    reviewExpectation: 'Keep parsing helpers side-effect free.',
  },
  {
    path: 'server/src/mcp/registerAiPlayerTools.ts',
    role: 'AI player MCP tool registration.',
    reviewExpectation: 'Keep AI player MCP tools out of the large gameServer assembly file.',
  },
  {
    path: 'server/tests/ai_player_backend_knowledge_graph.test.ts',
    role: 'Static guard for knowledge graph, catalog, and review scope consistency.',
    reviewExpectation: 'Run through test:ai:knowledge-graph and governance-guard.',
  },
  {
    path: 'server/tests/ai_player_http_contract.test.ts',
    role: 'End-to-end AI player HTTP proposal/action/receipt contract.',
    reviewExpectation: 'Run after any AI player action or lifecycle change.',
  },
  {
    path: 'server/tests/ai_player_knowledge_graph_http_contract.test.ts',
    role: 'Knowledge graph HTTP read surface contract.',
    reviewExpectation: 'Run after any knowledge graph read surface change.',
  },
  {
    path: 'server/tests/ai_player_knowledge_graph_mcp.test.ts',
    role: 'Knowledge graph MCP read surface contract.',
    reviewExpectation: 'Run after any AI player MCP registration change.',
  },
] as const

export const AI_PLAYER_PROMOTED_V1_ACTION_IDS = AI_PLAYER_PROMOTED_V1_ACTION_KNOWLEDGE.map((item) => item.aiAction)
