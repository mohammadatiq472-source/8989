import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseWorldActionRequest } from '../../../shared/schemas/worldAction'
import {
  allianceHelpAction,
  appendPlanningJobHistoryAction,
  advanceTickAction,
  clearPlanExecutionAction,
  deployReserveHeroAction,
  getWorldMapLayout,
  getWorldSummary,
  moveUnitAction,
  promoteCityBuildingAction,
  promoteTroopFacilityBuildingAction,
  rewardClaimAction,
  recruitProspectHeroAction,
  setAiContextFocusAction,
  setGeneralActiveHeroAction,
  setGeneralTacticAction,
  upgradeCityAction,
  upgradeCityTechAction,
  queuePlanExecutionAction,
  queueAiAgendaActionAction,
  previewGeneralDirectivesAction,
  previewDomainAgendaAction,
  previewNationalAgendaAction,
  previewCourtSessionAction,
  queryCivilMemoryAction,
  queueTacticalOverrideAction,
  enqueueAffairAction,
  setRecruitSelectedPoolAction,
  updateAllianceDirectiveAction,
} from '../application/world/WorldService'
import { isHttpBodyError, readJsonBody, writeJson } from './http'

type WorldSummaryRouteOptions = {
  sinceWorldVersion?: number
  planningHistoryLimit?: number
  replayLimit?: number
  replayFrameLimit?: number
  intelMode?: 'sparse' | 'full'
}

type WorldMapLayoutRouteOptions = {
  scope?: 'full' | 'bootstrap' | 'province' | 'region' | 'viewport'
  provinceId?: string
  regionId?: string
  centerX?: number
  centerY?: number
  layer?: 'nation' | 'province' | 'region' | 'tile'
}

type WorldActionRouteOptions = {
  includeWorld?: boolean
}

export function handleWorldSummaryRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  options?: WorldSummaryRouteOptions,
) {
  writeJson(res, 200, getWorldSummary(options))
}

export function handleWorldMapLayoutRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  options?: WorldMapLayoutRouteOptions,
) {
  writeJson(res, 200, getWorldMapLayout(options))
}

export async function handleWorldActionRoute(
  req: IncomingMessage,
  res: ServerResponse,
  options?: WorldActionRouteOptions,
) {
  const includeWorld = options?.includeWorld === true

  try {
    const payload = await readJsonBody(req)
    const request = parseWorldActionRequest(payload)

    switch (request.action) {
      case 'appendPlanningJobHistory':
        writeJson(res, 200, appendPlanningJobHistoryAction(request.payload.entry, includeWorld))
        return
      case 'queuePlanExecution':
        writeJson(res, 200, await queuePlanExecutionAction(request.payload, includeWorld))
        return
      case 'previewGeneralDirectives':
        writeJson(res, 200, previewGeneralDirectivesAction(request.payload))
        return
      case 'previewDomainAgenda':
        writeJson(res, 200, previewDomainAgendaAction(request.payload, includeWorld))
        return
      case 'previewNationalAgenda':
        writeJson(res, 200, previewNationalAgendaAction(request.payload, includeWorld))
        return
      case 'previewCourtSession':
        writeJson(res, 200, previewCourtSessionAction(request.payload, includeWorld))
        return
      case 'queryCivilMemory':
        writeJson(res, 200, queryCivilMemoryAction(request.payload, includeWorld))
        return
      case 'setGeneralActiveHero':
        writeJson(res, 200, setGeneralActiveHeroAction(request.payload.heroId, includeWorld, request.payload.factionId))
        return
      case 'setGeneralTactic':
        writeJson(
          res,
          200,
          setGeneralTacticAction(
            request.payload.heroId,
            request.payload.tacticId,
            includeWorld,
            request.payload.factionId,
          ),
        )
        return
      case 'queueAiAgendaAction':
        writeJson(res, 200, queueAiAgendaActionAction(request.payload.agendaActionId, includeWorld, request.payload.factionId))
        return
      case 'setAiContextFocus':
        writeJson(
          res,
          200,
          setAiContextFocusAction(
            request.payload.contextFocusId as 'focus_city' | 'focus_troop' | 'focus_alliance',
            includeWorld,
            request.payload.factionId,
          ),
        )
        return
      case 'advanceTick':
        writeJson(res, 200, await advanceTickAction(includeWorld))
        return
      case 'clearPlanExecution':
        writeJson(res, 200, clearPlanExecutionAction(includeWorld, request.payload?.factionId))
        return
      case 'moveUnit':
        writeJson(
          res,
          200,
          moveUnitAction(
            request.payload.unitId,
            request.payload.targetTileId,
            includeWorld,
            request.payload.factionId,
          ),
        )
        return
      case 'deployReserveHero':
        writeJson(
          res,
          200,
          deployReserveHeroAction(
            request.payload.factionId,
            request.payload.heroId,
            request.payload.tileId,
            includeWorld,
          ),
        )
        return
      case 'upgradeCity':
        writeJson(res, 200, upgradeCityAction(request.payload.tileId, includeWorld, request.payload.factionId))
        return
      case 'upgradeCityTech':
        writeJson(
          res,
          200,
          upgradeCityTechAction(request.payload.tileId, request.payload.techId, includeWorld, request.payload.factionId),
        )
        return
      case 'promoteCityBuilding':
        writeJson(
          res,
          200,
          promoteCityBuildingAction(
            request.payload.cityId,
            request.payload.groupId,
            request.payload.buildingId,
            includeWorld,
            request.payload.factionId,
          ),
        )
        return
      case 'queueTacticalOverride':
        writeJson(
          res,
          200,
          queueTacticalOverrideAction(
            request.payload.unitId,
            request.payload.templateId,
            request.payload.targetTileId,
            request.payload.summary,
            includeWorld,
            request.payload.factionId,
          ),
        )
        return
      case 'updateAllianceDirective':
        writeJson(
          res,
          200,
          updateAllianceDirectiveAction(request.payload.regionId, request.payload.stance, includeWorld),
        )
        return
      case 'allianceHelp':
        writeJson(
          res,
          200,
          allianceHelpAction(request.payload.regionId, includeWorld, request.payload.factionId),
        )
        return
      case 'claimReward':
        writeJson(
          res,
          200,
          rewardClaimAction(request.payload?.rewardId, includeWorld, request.payload?.factionId),
        )
        return
      case 'promoteTroopFacilityBuilding':
        writeJson(
          res,
          200,
          promoteTroopFacilityBuildingAction(
            request.payload.unitId,
            request.payload.facilityId,
            request.payload.buildingId,
            includeWorld,
            request.payload.factionId,
          ),
        )
        return
      case 'setRecruitSelectedPool':
        writeJson(
          res,
          200,
          setRecruitSelectedPoolAction(request.payload.poolId, includeWorld, request.payload.factionId),
        )
        return
      case 'recruitProspectHero':
        writeJson(
          res,
          200,
          recruitProspectHeroAction(
            includeWorld,
            request.payload.factionId,
            request.payload.count ?? 1,
            request.payload.poolId ?? 'pool_standard',
          ),
        )
        return
      case 'enqueueAffair':
        writeJson(
          res,
          200,
          enqueueAffairAction(request.payload.cityId, request.payload.affairId, includeWorld, request.payload.factionId),
        )
        return
      default:
        writeJson(res, 400, { error: 'Unknown world action.' })
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError' && 'issues' in error) {
      const issues = (error as unknown as { issues: Array<{ path?: PropertyKey[]; message?: string }> }).issues
      const details = issues.map((issue) => ({
        path: (issue.path ?? []).join('.') || 'root',
        message: issue.message ?? 'Validation error',
      }))
      writeJson(res, 400, { error: 'Invalid request payload.', details })
      return
    }
    if (isHttpBodyError(error)) {
      writeJson(res, error.statusCode, { error: error.message })
      return
    }

    const message = error instanceof Error ? error.message : 'Unknown server error.'
    writeJson(res, 500, { error: message })
  }
}
