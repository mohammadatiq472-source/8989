import assert from 'node:assert/strict'
import type { WorldState } from '../../shared/contracts/game/world'
import {
  FACTION_ID,
  bootRegisteredAiPlayer,
  createApproveExecuteProposal,
  ensureFactionBudget,
  loadWorldState,
  assertSuccessfulReceipt,
} from './helpers/aiPlayerHttpContractHarness'
import { readObject } from './helpers/backendHarness'

function resolveAllianceHelpCandidate(world: WorldState) {
  assert.ok(world.factions[FACTION_ID], 'player faction should exist before alliance_help')
  assert.ok(Object.values(world.alliance.directives).length > 0, 'alliance_help should have at least one active directive')
  assert.ok(world.alliance.commanders.length > 0, 'alliance_help should have at least one ally commander')
}

function resolveFormationAssignCandidate(world: WorldState): {
  heroId: string
  tacticId: 'assault' | 'guard' | 'logistics'
} {
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, 'player faction should exist before formation_assign')

  const heroId = faction.heroCommand.rosterHeroIds[0]
  assert.ok(heroId, 'formation_assign should have an available hero')

  const generalState = world.slgDomainState?.generalStateByFaction?.[FACTION_ID]
  const currentTactic = generalState?.tacticByHeroId?.[heroId]
  const tacticId = (['assault', 'guard', 'logistics'] as const).find((candidate) => candidate !== currentTactic) ?? 'assault'

  return {
    heroId,
    tacticId,
  }
}

function resolveGeneralFocusCandidate(world: WorldState): { heroId: string } {
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, 'player faction should exist before general_focus_set')

  const rosterHeroIds = faction.heroCommand.rosterHeroIds
  const generalState = world.slgDomainState?.generalStateByFaction?.[FACTION_ID]
  const previousHeroId = generalState?.activeHeroId
  const heroId = rosterHeroIds.find((candidate) => candidate !== previousHeroId) ?? previousHeroId ?? rosterHeroIds[0]

  assert.ok(heroId, 'general_focus_set should have an available hero')
  return { heroId }
}

function resolveTroopFacilityUpgradeCandidate(world: WorldState): {
  unitId: string
  facilityId: string
  buildingId: string
} {
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, 'player faction should exist before troop_facility_upgrade')
  const unit = world.units.find((candidate) => candidate.faction === FACTION_ID)
  assert.ok(unit, 'troop_facility_upgrade should have an executable unit')

  return {
    unitId: unit.id,
    facilityId: 'training_ground',
    buildingId: 'training_ground_base',
  }
}

function resolveThreatEscapeCandidate(world: WorldState): { mode: 'recover' | 'redeploy'; agendaActionId: 'agenda_recover' | 'agenda_redeploy' } {
  const faction = world.factions[FACTION_ID]
  assert.ok(faction, 'player faction should exist before threat_escape')
  const unit = world.units.find((candidate) => candidate.faction === FACTION_ID)
  assert.ok(unit, 'threat_escape should have an executable unit')

  const currentTile = world.map.tiles.find((tile) => tile.id === unit.tileId)
  const hasNeighbor = (world.map.connections[unit.tileId] ?? []).some((tileId) => tileId !== unit.tileId)
  const mode = hasNeighbor && (currentTile?.enemyPressure ?? 0) > 0 ? 'redeploy' : 'recover'
  return {
    mode,
    agendaActionId: mode === 'redeploy' ? 'agenda_redeploy' : 'agenda_recover',
  }
}

async function run() {
  const backend = await bootRegisteredAiPlayer('ai_player_http_command_support_contract')
  const baseUrl = backend.baseUrl

  try {
    await ensureFactionBudget(baseUrl, 1, 0, 'alliance help')
    const worldBeforeAllianceHelp = await loadWorldState(baseUrl)
    resolveAllianceHelpCandidate(worldBeforeAllianceHelp)
    const allianceHelp = await createApproveExecuteProposal(baseUrl, 'alliance_help', {}, 'Alliance help command support test')
    assertSuccessfulReceipt('alliance_help', allianceHelp.receipt, 'allianceHelp')
    assert.equal(allianceHelp.receipt.failureCode, null, 'alliance_help should be success receipt')
    const allianceHelpExecution = readObject(allianceHelp.receipt.execution)
    assert.equal(typeof allianceHelpExecution.status, 'string', 'alliance_help should expose execution.status')
    assert.ok(
      typeof allianceHelp.receipt.actionRequestId === 'string' && allianceHelp.receipt.actionRequestId.length > 0,
      'alliance_help should expose actionRequestId',
    )
    const worldBeforeFormationAssign = await loadWorldState(baseUrl)
    const formationAssignCandidate = resolveFormationAssignCandidate(worldBeforeFormationAssign)
    const formationAssign = await createApproveExecuteProposal(
      baseUrl,
      'formation_assign',
      {
        heroId: formationAssignCandidate.heroId,
        tacticId: formationAssignCandidate.tacticId,
      },
      'Formation assign command support test',
    )
    assertSuccessfulReceipt('formation_assign', formationAssign.receipt, 'setGeneralTactic')
    assert.equal(formationAssign.receipt.failureCode, null, 'formation_assign should be success receipt')

    const worldBeforeGeneralFocus = await loadWorldState(baseUrl)
    const generalFocusCandidate = resolveGeneralFocusCandidate(worldBeforeGeneralFocus)
    const generalFocus = await createApproveExecuteProposal(
      baseUrl,
      'general_focus_set',
      {
        heroId: generalFocusCandidate.heroId,
      },
      'General focus set command support test',
    )
    assertSuccessfulReceipt('general_focus_set', generalFocus.receipt, 'setGeneralActiveHero')
    assert.equal(generalFocus.receipt.failureCode, null, 'general_focus_set should be success receipt')

    const worldBeforeTroopFacilityUpgrade = await loadWorldState(baseUrl)
    const troopFacilityUpgradeCandidate = resolveTroopFacilityUpgradeCandidate(worldBeforeTroopFacilityUpgrade)
    const troopFacilityUpgrade = await createApproveExecuteProposal(
      baseUrl,
      'troop_facility_upgrade',
      {
        unitId: troopFacilityUpgradeCandidate.unitId,
        facilityId: troopFacilityUpgradeCandidate.facilityId,
        buildingId: troopFacilityUpgradeCandidate.buildingId,
      },
      'Troop facility upgrade command support test',
    )
    assertSuccessfulReceipt('troop_facility_upgrade', troopFacilityUpgrade.receipt, 'promoteTroopFacilityBuilding')
    assert.equal(
      troopFacilityUpgrade.receipt.failureCode,
      null,
      'troop_facility_upgrade should be success receipt',
    )

    const worldBeforeThreatEscape = await loadWorldState(baseUrl)
    const threatEscapeCandidate = resolveThreatEscapeCandidate(worldBeforeThreatEscape)
    const threatEscape = await createApproveExecuteProposal(
      baseUrl,
      'threat_escape',
      {
        mode: threatEscapeCandidate.mode,
      },
      'Threat escape command support test',
    )
    assertSuccessfulReceipt('threat_escape', threatEscape.receipt, 'queueAiAgendaAction')
    assert.equal(threatEscape.receipt.failureCode, null, 'threat_escape should be success receipt')
  } finally {
    await backend.stop()
  }
}

run().catch((error) => {
  console.error('[ai_player_http_command_support_contract] failed:', error)
  process.exitCode = 1
})
