import assert from 'node:assert/strict'
import {
  loadGeneralProfileCatalog,
  loadGeneralSkillCatalog,
} from '../../shared/domain/generalProfileCatalog'
import {
  auditRepresentativeTacticalFormulaCoverage,
  listRepresentativeTacticalSkillFormulaDefinitions,
} from '../../shared/domain/tacticalSkillFormulaCatalog'
import { listRepresentativeTacticalSkillFormulas } from '../../shared/domain/tacticalSkillRules'

function testTemplateDefinitionsForImplementedRepresentativeSkills() {
  const definitions = listRepresentativeTacticalSkillFormulaDefinitions()
  const templateBySkillId = Object.fromEntries(
    definitions.map((definition) => [definition.id, definition.templateId]),
  )
  const templateIds = [...new Set(definitions.map((definition) => definition.templateId))].sort()

  assert.equal(definitions.length, 77)
  assert.deepEqual(templateIds, [
    'active_ally_cleanse_v1',
    'active_ally_heal_v1',
    'active_damage_enemy_all_v1',
    'active_damage_enemy_commander_v1',
    'active_damage_enemy_group_v1',
    'active_damage_enemy_lowest_v1',
    'active_damage_enemy_single_v1',
    'chase_after_normal_attack_v1',
    'command_ally_attribute_buff_v1',
    'command_ally_guard_recovery_v1',
    'command_enemy_attribute_debuff_v1',
    'passive_counter_guard_v1',
    'passive_self_guard_v1',
    'passive_self_recovery_v1',
  ])
  assert.equal(templateBySkillId.innate_100021, 'passive_self_guard_v1')
  assert.equal(templateBySkillId.innate_100027, 'active_damage_enemy_commander_v1')
  assert.equal(templateBySkillId.innate_100718, 'active_ally_heal_v1')
  assert.equal(templateBySkillId.lib_s_command_battle_banner, 'command_ally_attribute_buff_v1')
  assert.equal(templateBySkillId.lib_s_active_fire_raid, 'active_damage_enemy_group_v1')
  assert.equal(templateBySkillId.lib_s_passive_fortified_mind, 'passive_self_guard_v1')
  assert.equal(templateBySkillId.lib_s_chase_rending_charge, 'chase_after_normal_attack_v1')
  assert.equal(templateBySkillId.lib_a_active_benevolent_aid, 'active_ally_heal_v1')
  assert.equal(templateBySkillId.lib_b_chase_follow_arrow, 'chase_after_normal_attack_v1')

  const formulas = listRepresentativeTacticalSkillFormulas()
  assert.equal(formulas.length, definitions.length)
  assert.ok(
    formulas.every((formula) => !('templateId' in formula)),
    'runtime formulas should be materialized without template metadata',
  )
}

function testFormulaCoverageAuditAcrossAuthorityCatalogs() {
  const profiles = loadGeneralProfileCatalog()
  const generalSkills = loadGeneralSkillCatalog()
  const audit = auditRepresentativeTacticalFormulaCoverage({
    innateSkillIds: Object.values(profiles).map((profile) => profile.innateSkill.id),
    generalSkillIds: Object.keys(generalSkills),
  })

  assert.equal(Object.keys(profiles).length, 27)
  assert.equal(Object.keys(generalSkills).length, 50)
  assert.equal(audit.totalSkillCount, 77)
  assert.equal(audit.implementedSkillIds.length, 77)
  assert.deepEqual(audit.missingSkillIds, [])
  assert.deepEqual(audit.missingInnateSkillIds, [])
  assert.deepEqual(audit.missingGeneralSkillIds, [])
  assert.ok(audit.implementedSkillIds.includes('innate_100451'))
  assert.ok(audit.implementedSkillIds.includes('lib_s_active_thunder_camp'))
  assert.ok(audit.implementedSkillIds.includes('innate_100027'))
  assert.ok(audit.implementedSkillIds.includes('lib_s_active_fire_raid'))
}

function run() {
  testTemplateDefinitionsForImplementedRepresentativeSkills()
  testFormulaCoverageAuditAcrossAuthorityCatalogs()

  console.log('[tactical_skill_formula_catalog_contract] all checks passed')
}

run()
