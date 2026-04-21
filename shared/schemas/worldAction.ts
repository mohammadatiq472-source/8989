import { z } from 'zod'
import type { WorldActionRequest } from '../contracts/game'
import { actionTypeSchema, strategicPlanSchema, planSourceSchema } from './planning'
import { civilMemoryEventTypeSchema } from './civilMemory'

const factionIdSchema = z.string().min(1).max(64)
const allianceStanceSchema = z.enum(['hold', 'support', 'harass', 'expand'])
const executionEnqueueModeSchema = z.enum(['replace', 'append', 'reject_if_active'])
const tacticalTemplateIdSchema = z.enum(['rally', 'harass', 'withdraw', 'breakthrough', 'sweep', 'garrison'])
const cityTechTrackIdSchema = z.enum(['governance', 'logistics', 'defense', 'recruitment'])
const generalTacticIdSchema = z.enum(['assault', 'guard', 'logistics'])
const aiAgendaActionIdSchema = z.enum(['agenda_expand', 'agenda_support', 'agenda_stabilize', 'agenda_recover', 'agenda_redeploy'])
const resourceTransferBundleSchema = z.object({
  food: z.number().int().positive().optional(),
  wood: z.number().int().positive().optional(),
  stone: z.number().int().positive().optional(),
  iron: z.number().int().positive().optional(),
}).strict().refine(
  (value) => Object.values(value).some((amount) => typeof amount === 'number' && amount > 0),
  { message: 'at least one positive resource amount is required' },
)

const generalDirectiveSchema = z.object({
  generalId: z.string().min(1),
  instruction: z.string().min(1).max(400),
  targetTileId: z.string().min(1).optional(),
  action: actionTypeSchema.optional(),
})

export const worldActionRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('appendPlanningJobHistory'),
    payload: z.object({
      entry: z.object({
        id: z.string().min(1),
        status: z.enum(['queued', 'running', 'succeeded', 'failed', 'stale']),
        sourceMode: planSourceSchema,
        strategicCommand: z.string().min(1).max(400),
        requestedTick: z.number().int().nonnegative(),
        requestedWorldVersion: z.number().int().nonnegative(),
        message: z.string().min(1),
        resolvedSource: planSourceSchema.optional(),
        plannerNote: z.string().max(2000).optional(),
        plannerExplanation: z.string().max(1000).optional(),
        planningRationale: z.array(z.string().max(240)).max(8).optional(),
        completedTick: z.number().int().nonnegative().optional(),
        completedWorldVersion: z.number().int().nonnegative().optional(),
        plan: strategicPlanSchema.optional(),
      }),
    }),
  }),
  z.object({
    action: z.literal('queuePlanExecution'),
    payload: z.object({
      plan: strategicPlanSchema,
      source: planSourceSchema,
      strategicCommand: z.string().min(1).max(400),
      requestId: z.string().min(1),
      basedOnWorldVersion: z.number().int().nonnegative(),
      factionId: factionIdSchema.optional(),
      plannerNote: z.string().max(2000).optional(),
      plannerExplanation: z.string().max(1000).optional(),
      planningRationale: z.array(z.string().max(240)).max(8).optional(),
      dispatchGenerals: z.boolean().optional(),
      generalConcurrency: z.number().int().min(1).max(32).optional(),
      generalSide: factionIdSchema.optional(),
      generalDirectives: z.array(generalDirectiveSchema).max(32).optional(),
      executionMode: executionEnqueueModeSchema.optional(),
      expectedExecutionRequestId: z.string().min(1).optional(),
    }),
  }),
  z.object({
    action: z.literal('previewGeneralDirectives'),
    payload: z.object({
      directives: z.array(generalDirectiveSchema).min(1).max(32),
      side: factionIdSchema.optional(),
      basePlan: strategicPlanSchema.optional(),
    }),
  }),
  z.object({
    action: z.literal('previewDomainAgenda'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      domainId: z.string().min(1).max(128).optional(),
      includeMessages: z.boolean().optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('previewNationalAgenda'),
    payload: z.object({
      maxOptions: z.number().int().min(1).max(9).optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('previewCourtSession'),
    payload: z.object({
      maxProposals: z.number().int().min(1).max(9).optional(),
      maxOptions: z.number().int().min(1).max(9).optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('queryCivilMemory'),
    payload: z.object({
      limit: z.number().int().min(1).max(500).optional(),
      type: civilMemoryEventTypeSchema.optional(),
      tickFrom: z.number().int().nonnegative().optional(),
      tickTo: z.number().int().nonnegative().optional(),
      factionId: factionIdSchema.optional(),
      relatedId: z.string().min(1).max(128).optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('setGeneralTactic'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      heroId: z.string().min(1).max(128),
      tacticId: generalTacticIdSchema,
    }),
  }),
  z.object({
    action: z.literal('setGeneralActiveHero'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      heroId: z.string().min(1).max(128),
    }),
  }),
  z.object({
    action: z.literal('queueAiAgendaAction'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      agendaActionId: aiAgendaActionIdSchema,
    }),
  }),
  z.object({
    action: z.literal('setAiContextFocus'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      contextFocusId: z.enum(['focus_city', 'focus_troop', 'focus_alliance']),
    }),
  }),
  z.object({ action: z.literal('advanceTick') }),
  z.object({ action: z.literal('clearPlanExecution'), payload: z.object({ factionId: factionIdSchema.optional() }).optional() }),
  z.object({
    action: z.literal('moveUnit'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      unitId: z.string().min(1),
      targetTileId: z.string().min(1),
    }),
  }),
  z.object({
    action: z.literal('deployReserveHero'),
    payload: z.object({
      factionId: factionIdSchema,
      heroId: z.string().min(1),
      tileId: z.string().min(1),
    }),
  }),
  z.object({
    action: z.literal('upgradeCity'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      tileId: z.string().min(1),
    }),
  }),
  z.object({
    action: z.literal('upgradeCityTech'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      tileId: z.string().min(1),
      techId: cityTechTrackIdSchema,
    }),
  }),
  z.object({
    action: z.literal('promoteCityBuilding'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      cityId: z.string().min(1),
      groupId: z.string().min(1),
      buildingId: z.string().min(1),
    }),
  }),
  z.object({
    action: z.literal('queueTacticalOverride'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      unitId: z.string().min(1),
      templateId: tacticalTemplateIdSchema,
      targetTileId: z.string().min(1),
      summary: z.string().min(1).max(400),
    }),
  }),
  z.object({
    action: z.literal('updateAllianceDirective'),
    payload: z.object({
      regionId: z.string().min(1),
      stance: allianceStanceSchema,
    }),
  }),
  z.object({
    action: z.literal('allianceHelp'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      regionId: z.string().min(1),
    }),
  }),
  z.object({
    action: z.literal('claimReward'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      rewardId: z.string().min(1).max(128).optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('transferFactionResourcesToGovernor'),
    payload: z.object({
      sourceFactionId: factionIdSchema,
      sourceAiPlayerId: z.string().min(1).max(80),
      governorPlayerId: z.string().min(1).max(80),
      resources: resourceTransferBundleSchema,
      reason: z.string().min(1).max(400),
      approvedBy: z.string().min(1).max(80),
    }).strict(),
  }),
  z.object({
    action: z.literal('promoteTroopFacilityBuilding'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      unitId: z.string().min(1),
      facilityId: z.string().min(1),
      buildingId: z.string().min(1),
    }),
  }),
  z.object({
    action: z.literal('setRecruitSelectedPool'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      poolId: z.string().min(1).max(64),
    }),
  }),
  z.object({
    action: z.literal('recruitProspectHero'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      count: z.number().int().min(1).max(10).optional(),
      poolId: z.string().min(1).max(64).optional(),
    }),
  }),
  z.object({
    action: z.literal('enqueueAffair'),
    payload: z.object({
      factionId: factionIdSchema.optional(),
      cityId: z.string().min(1),
      affairId: z.string().min(1),
    }),
  }),
])

export function parseWorldActionRequest(input: unknown): WorldActionRequest {
  return worldActionRequestSchema.parse(input) as WorldActionRequest
}
