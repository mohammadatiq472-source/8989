import type { AiPlayerExecutableV1ActionType } from './aiPlayer'

export const AI_PLAYER_RUNTIME_PROMPT_VERSION = '2026-04-21'

export type AiPlayerRuntimePromptSectionId =
  | 'role'
  | 'authority'
  | 'observation'
  | 'decision'
  | 'budget'
  | 'output'

export type AiPlayerRuntimePromptSection = {
  id: AiPlayerRuntimePromptSectionId
  title: string
  body: string
  required: true
}

export type AiPlayerRuntimePromptOutputContract = {
  format: 'json'
  maxProposals: number
  requiredProposalFields: readonly ['action', 'args', 'reason']
  deferField: 'deferReason'
  reviewField: 'needsHumanReview'
}

export type AiPlayerRuntimeSystemContext = {
  version: string
  purpose: string
  allowedActions: readonly AiPlayerExecutableV1ActionType[]
  deferredWorldAuthorities: readonly string[]
  sections: readonly AiPlayerRuntimePromptSection[]
  outputContract: AiPlayerRuntimePromptOutputContract
}

export const AI_PLAYER_RUNTIME_ALLOWED_ACTIONS = [
  'city_upgrade',
  'building_upgrade',
  'queue_fill_idle_slot',
  'research_start',
  'troop_train',
  'troop_facility_upgrade',
  'recruit_pool_select',
  'recruit_commander',
  'world_scout',
  'march_move',
  'garrison_set',
  'general_focus_set',
  'formation_assign',
  'threat_escape',
  'alliance_help',
  'resource_transfer_to_governor',
  'reward_claim',
] as const satisfies readonly AiPlayerExecutableV1ActionType[]

export const AI_PLAYER_RUNTIME_DEFERRED_WORLD_AUTHORITIES = [
  'setAiContextFocus',
] as const

export const AI_PLAYER_RUNTIME_SYSTEM_CONTEXT = {
  version: AI_PLAYER_RUNTIME_PROMPT_VERSION,
  purpose: 'Bound an LLM-controlled AI player to proposal-only play against the authoritative v1 action surface.',
  allowedActions: AI_PLAYER_RUNTIME_ALLOWED_ACTIONS,
  deferredWorldAuthorities: AI_PLAYER_RUNTIME_DEFERRED_WORLD_AUTHORITIES,
  outputContract: {
    format: 'json',
    maxProposals: 3,
    requiredProposalFields: ['action', 'args', 'reason'],
    deferField: 'deferReason',
    reviewField: 'needsHumanReview',
  },
  sections: [
    {
      id: 'role',
      title: 'Role',
      required: true,
      body: 'You are a governed AI player for one faction. You decide proposed player actions, not story narration, UI layout, or hidden world mutations.',
    },
    {
      id: 'authority',
      title: 'Authority Boundary',
      required: true,
      body: 'You never write world state directly. All writes must become approved proposals that execute through SessionManager, WorldService, shared/domain/rules.ts, and commitWorldState. Do not claim an action already happened before a receipt exists.',
    },
    {
      id: 'observation',
      title: 'Observation Inputs',
      required: true,
      body: 'Base decisions only on supplied runtime, budget, world snapshot, receipts, failures, active execution, and action whitelist. If required IDs or budgets are missing, defer instead of inventing facts.',
    },
    {
      id: 'decision',
      title: 'Decision Rules',
      required: true,
      body: 'Choose zero to three actions only from allowedActions. Do not use deferred world authorities such as setAiContextFocus as player actions. Proposal args must be action-specific; omit optional args when the executor can resolve safe defaults.',
    },
    {
      id: 'budget',
      title: 'Budget And Failure Awareness',
      required: true,
      body: 'Respect action points, food, AI quota, active plan locks, recent failureCode values, and execution status. Prefer one low-risk proposal over many conflicting proposals when state is uncertain.',
    },
    {
      id: 'output',
      title: 'Output Contract',
      required: true,
      body: 'Return JSON only: summary, proposals, deferReason, needsHumanReview. Each proposal must include action, args, and reason. Reasons should cite the observed state and expected authoritative worldAction.',
    },
  ],
} as const satisfies AiPlayerRuntimeSystemContext

export function renderAiPlayerRuntimeSystemPrompt(
  context: AiPlayerRuntimeSystemContext = AI_PLAYER_RUNTIME_SYSTEM_CONTEXT,
): string {
  const sections = context.sections
    .map((section) => `## ${section.title}\n${section.body}`)
    .join('\n\n')

  return [
    `AI_PLAYER_RUNTIME_PROMPT_VERSION=${context.version}`,
    `PURPOSE=${context.purpose}`,
    `ALLOWED_ACTIONS=${context.allowedActions.join(', ')}`,
    `DEFERRED_WORLD_AUTHORITIES=${context.deferredWorldAuthorities.join(', ')}`,
    `OUTPUT_FORMAT=${context.outputContract.format}`,
    `MAX_PROPOSALS=${context.outputContract.maxProposals}`,
    sections,
  ].join('\n\n')
}
