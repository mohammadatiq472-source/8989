import type {
  TacticalAttribute,
  TacticalDamageKind,
  TacticalSkillFormula,
  TacticalSkillType,
} from './tacticalSkillRules'

export type TacticalFormulaTemplateId =
  | 'command_ally_attribute_buff_v1'
  | 'command_enemy_attribute_debuff_v1'
  | 'command_ally_guard_recovery_v1'
  | 'passive_self_guard_v1'
  | 'passive_self_recovery_v1'
  | 'passive_counter_guard_v1'
  | 'active_damage_enemy_single_v1'
  | 'active_damage_enemy_group_v1'
  | 'active_damage_enemy_all_v1'
  | 'active_damage_enemy_commander_v1'
  | 'active_damage_enemy_lowest_v1'
  | 'active_ally_heal_v1'
  | 'active_ally_cleanse_v1'
  | 'chase_after_normal_attack_v1'

export type TacticalFormulaTemplateParams = {
  attributeModifiers?: Partial<Record<TacticalAttribute, number>>
  activationRate?: number
  damageKind?: TacticalDamageKind
  damageRate?: number
  breakDamageRate?: number
  speedBonusRate?: number
  burnRate?: number
  burnTurns?: number
  healingRate?: number
  damageReduction?: number
  evasionChargesAgainst?: TacticalSkillType[]
  controlCleanseCharges?: number
  targetSelector?: TacticalSkillFormula['targetSelector']
  targetCount?: number
}

export type TacticalSkillFormulaDefinition = TacticalSkillFormula & {
  templateId: TacticalFormulaTemplateId
  templateParams: TacticalFormulaTemplateParams
}

export type TacticalFormulaCoverageAudit = {
  totalSkillCount: number
  implementedSkillIds: string[]
  missingSkillIds: string[]
  missingInnateSkillIds: string[]
  missingGeneralSkillIds: string[]
  implementedDefinitions: TacticalSkillFormulaDefinition[]
}

const FIXED_INNATE_SKILL_BY_HERO_ID: Record<string, string> = {
  '100016': 'innate_100016',
  '100017': 'innate_100017',
  '100021': 'innate_100021',
  '100023': 'innate_100023',
  '100027': 'innate_100027',
  '100031': 'innate_100031',
  '100090': 'innate_100090',
  '100451': 'innate_100451',
  '100661': 'innate_100661',
  '100701': 'innate_100701',
  '100702': 'innate_100702',
  '100703': 'innate_100703',
  '100704': 'innate_100704',
  '100705': 'innate_100705',
  '100706': 'innate_100706',
  '100707': 'innate_100707',
  '100708': 'innate_100708',
  '100709': 'innate_100709',
  '100710': 'innate_100710',
  '100711': 'innate_100711',
  '100712': 'innate_100712',
  '100713': 'innate_100713',
  '100714': 'innate_100714',
  '100715': 'innate_100715',
  '100716': 'innate_100716',
  '100717': 'innate_100717',
  '100718': 'innate_100718',
}

type TacticalFormulaInput = Omit<TacticalSkillFormula, 'slot'> & {
  templateId: TacticalFormulaTemplateId
}

const REPRESENTATIVE_FORMULA_DEFINITIONS = Object.fromEntries(
  [
    defineFormula({
      id: 'innate_100016',
      name: '兴复汉室',
      type: 'command',
      templateId: 'command_ally_guard_recovery_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { command: 0.2 },
      damageReduction: 0.22,
      healingRate: 0.75,
    }),
    defineFormula({
      id: 'innate_100017',
      name: '隆中对',
      type: 'command',
      templateId: 'command_enemy_attribute_debuff_v1',
      targetSelector: 'enemy_team',
      attributeModifiers: { intelligence: -0.18, speed: -0.08 },
      controlCleanseCharges: 1,
    }),
    defineFormula({
      id: 'innate_100021',
      name: '长坂护主',
      type: 'passive',
      templateId: 'passive_self_guard_v1',
      targetSelector: 'self',
      attributeModifiers: { command: 0.18, speed: 0.1 },
      controlCleanseCharges: 1,
    }),
    defineFormula({
      id: 'innate_100023',
      name: '魏武之世',
      type: 'command',
      templateId: 'command_ally_attribute_buff_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { force: 0.18, intelligence: 0.18, speed: 0.18 },
    }),
    defineFormula({
      id: 'innate_100027',
      name: '威震逍遥',
      type: 'active',
      templateId: 'active_damage_enemy_commander_v1',
      targetSelector: 'enemy_commander',
      activationRate: 45,
      damageKind: 'physical',
      damageRate: 1.05,
      speedBonusRate: 0.08,
    }),
    defineFormula({
      id: 'innate_100031',
      name: '赤壁火势',
      type: 'active',
      templateId: 'active_damage_enemy_all_v1',
      targetSelector: 'enemy_team',
      activationRate: 45,
      damageKind: 'strategy',
      damageRate: 0.7,
      burnRate: 0.25,
      burnTurns: 2,
    }),
    defineFormula({
      id: 'innate_100090',
      name: '信义神射',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'normal_attack_target',
      activationRate: 45,
      damageKind: 'physical',
      damageRate: 1.4,
      breakDamageRate: 1.55,
    }),
    defineFormula({
      id: 'innate_100451',
      name: '威震华夏',
      type: 'active',
      templateId: 'active_damage_enemy_all_v1',
      targetSelector: 'enemy_team',
      activationRate: 40,
      damageKind: 'physical',
      damageRate: 0.68,
    }),
    defineFormula({
      id: 'innate_100661',
      name: '天下无双',
      type: 'active',
      templateId: 'active_damage_enemy_group_v1',
      targetSelector: 'enemy_group_2',
      activationRate: 35,
      damageKind: 'physical',
      damageRate: 1.05,
      speedBonusRate: 0.08,
    }),
    defineFormula({
      id: 'innate_100701',
      name: '禅代魏统',
      type: 'command',
      templateId: 'command_ally_attribute_buff_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { command: 0.12, intelligence: 0.1 },
    }),
    defineFormula({
      id: 'innate_100702',
      name: '古之恶来',
      type: 'passive',
      templateId: 'passive_counter_guard_v1',
      targetSelector: 'ally_commander',
      damageReduction: 0.22,
      attributeModifiers: { command: 0.1, force: 0.08 },
    }),
    defineFormula({
      id: 'innate_100703',
      name: '关西乱政',
      type: 'command',
      templateId: 'command_ally_attribute_buff_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { force: 0.22, intelligence: 0.14 },
    }),
    defineFormula({
      id: 'innate_100704',
      name: '铃响破胆',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'enemy_group_2',
      activationRate: 45,
      damageKind: 'physical',
      damageRate: 2.2,
    }),
    defineFormula({
      id: 'innate_100705',
      name: '遗计定辽',
      type: 'command',
      templateId: 'command_enemy_attribute_debuff_v1',
      targetSelector: 'enemy_team',
      attributeModifiers: { force: -0.16, intelligence: -0.16 },
    }),
    defineFormula({
      id: 'innate_100706',
      name: '衣带诏',
      type: 'command',
      templateId: 'command_ally_guard_recovery_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { command: 0.1 },
      damageReduction: 0.04,
    }),
    defineFormula({
      id: 'innate_100707',
      name: '毒士乱武',
      type: 'active',
      templateId: 'active_damage_enemy_group_v1',
      targetSelector: 'enemy_group_2',
      activationRate: 45,
      damageKind: 'strategy',
      damageRate: 0.9,
      burnRate: 0.35,
      burnTurns: 1,
    }),
    defineFormula({
      id: 'innate_100708',
      name: '锦马复仇',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'normal_attack_target',
      activationRate: 45,
      damageKind: 'physical',
      damageRate: 1.6,
      speedBonusRate: 0.25,
    }),
    defineFormula({
      id: 'innate_100709',
      name: '高平陵变',
      type: 'passive',
      templateId: 'passive_self_recovery_v1',
      targetSelector: 'self',
      attributeModifiers: { intelligence: 0.32 },
      healingRate: 0.4,
    }),
    defineFormula({
      id: 'innate_100710',
      name: '小霸王',
      type: 'active',
      templateId: 'active_damage_enemy_single_v1',
      targetSelector: 'enemy_random_1',
      activationRate: 60,
      damageKind: 'physical',
      damageRate: 2.3,
      speedBonusRate: 0.25,
    }),
    defineFormula({
      id: 'innate_100711',
      name: '坐断江东',
      type: 'active',
      templateId: 'active_ally_cleanse_v1',
      targetSelector: 'ally_team',
      activationRate: 35,
      healingRate: 0.25,
      controlCleanseCharges: 1,
    }),
    defineFormula({
      id: 'innate_100712',
      name: '受命江东',
      type: 'command',
      templateId: 'command_ally_guard_recovery_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { command: 0.12, force: 0.18 },
      damageReduction: 0.05,
    }),
    defineFormula({
      id: 'innate_100713',
      name: '独眼刚烈',
      type: 'passive',
      templateId: 'passive_counter_guard_v1',
      targetSelector: 'self',
      attributeModifiers: { command: 0.24, force: 0.08 },
      damageReduction: 0.12,
    }),
    defineFormula({
      id: 'innate_100714',
      name: '王佐之才',
      type: 'active',
      templateId: 'active_damage_enemy_group_v1',
      targetSelector: 'enemy_group_2',
      activationRate: 40,
      damageKind: 'strategy',
      damageRate: 0.8,
    }),
    defineFormula({
      id: 'innate_100715',
      name: '万箭齐发',
      type: 'active',
      templateId: 'active_damage_enemy_all_v1',
      targetSelector: 'enemy_team',
      activationRate: 50,
      damageKind: 'physical',
      damageRate: 0.7,
    }),
    defineFormula({
      id: 'innate_100716',
      name: '巴西怒吼',
      type: 'active',
      templateId: 'active_damage_enemy_all_v1',
      targetSelector: 'enemy_team',
      activationRate: 70,
      damageKind: 'physical',
      damageRate: 0.56,
    }),
    defineFormula({
      id: 'innate_100717',
      name: '不屈护主',
      type: 'passive',
      templateId: 'passive_counter_guard_v1',
      targetSelector: 'ally_commander',
      damageReduction: 0.45,
    }),
    defineFormula({
      id: 'innate_100718',
      name: '胡笳十八拍',
      type: 'active',
      templateId: 'active_ally_heal_v1',
      targetSelector: 'ally_lowest_2',
      activationRate: 55,
      healingRate: 1.15,
    }),
    defineFormula({
      id: 'lib_s_command_battle_banner',
      name: '军势旌旗',
      type: 'command',
      templateId: 'command_ally_attribute_buff_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { force: 0.12, speed: 0.08 },
      evasionChargesAgainst: ['active', 'chase'],
    }),
    defineFormula({
      id: 'lib_s_active_fire_raid',
      name: '烈焰突袭',
      type: 'active',
      templateId: 'active_damage_enemy_group_v1',
      targetSelector: 'enemy_group_2',
      activationRate: 45,
      damageKind: 'strategy',
      damageRate: 1,
      burnRate: 0.25,
      burnTurns: 2,
    }),
    defineFormula({
      id: 'lib_s_passive_fortified_mind',
      name: '固本守心',
      type: 'passive',
      templateId: 'passive_self_guard_v1',
      targetSelector: 'self',
      attributeModifiers: { command: 0.14, intelligence: 0.1 },
      controlCleanseCharges: 1,
      damageReduction: 0.08,
    }),
    defineFormula({
      id: 'lib_s_chase_rending_charge',
      name: '破阵追袭',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'normal_attack_target',
      activationRate: 40,
      damageKind: 'physical',
      damageRate: 1.5,
      breakDamageRate: 1.85,
    }),
    defineFormula({
      id: 'lib_s_command_eight_gate_guard',
      name: '八门固守',
      type: 'command',
      templateId: 'command_ally_guard_recovery_v1',
      targetSelector: 'ally_team',
      damageReduction: 0.2,
      evasionChargesAgainst: ['active'],
    }),
    defineFormula({
      id: 'lib_s_active_thunder_camp',
      name: '雷火连营',
      type: 'active',
      templateId: 'active_damage_enemy_all_v1',
      targetSelector: 'enemy_team',
      activationRate: 35,
      damageKind: 'strategy',
      damageRate: 0.7,
    }),
    defineFormula({
      id: 'lib_a_command_vanguard_order',
      name: '先登号令',
      type: 'command',
      templateId: 'command_ally_attribute_buff_v1',
      targetSelector: 'ally_commander',
      attributeModifiers: { force: 0.1, command: 0.08 },
    }),
    defineFormula({
      id: 'lib_a_command_archer_drill',
      name: '弓阵整备',
      type: 'command',
      templateId: 'command_ally_attribute_buff_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { force: 0.08, intelligence: 0.08 },
    }),
    defineFormula({
      id: 'lib_a_active_crossbow_volley',
      name: '连弩齐射',
      type: 'active',
      templateId: 'active_damage_enemy_group_v1',
      targetSelector: 'enemy_group_2',
      activationRate: 40,
      damageKind: 'physical',
      damageRate: 0.8,
    }),
    defineFormula({
      id: 'lib_a_active_feint_sweep',
      name: '佯攻扫营',
      type: 'active',
      templateId: 'active_damage_enemy_single_v1',
      targetSelector: 'enemy_random_1',
      activationRate: 45,
      damageKind: 'physical',
      damageRate: 1.35,
    }),
    defineFormula({
      id: 'lib_a_passive_reserve_guard',
      name: '守备整训',
      type: 'passive',
      templateId: 'passive_self_guard_v1',
      targetSelector: 'self',
      attributeModifiers: { command: 0.12 },
      damageReduction: 0.08,
    }),
    defineFormula({
      id: 'lib_a_passive_calm_reserve',
      name: '静气养锐',
      type: 'passive',
      templateId: 'passive_self_recovery_v1',
      targetSelector: 'self',
      attributeModifiers: { force: 0.08, intelligence: 0.08 },
      damageReduction: 0.04,
    }),
    defineFormula({
      id: 'lib_a_chase_opportunistic_follow',
      name: '乘势追击',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'normal_attack_target',
      activationRate: 35,
      damageKind: 'physical',
      damageRate: 1.15,
      breakDamageRate: 1.4,
    }),
    defineFormula({
      id: 'lib_a_chase_swift_blade',
      name: '疾刃连击',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'normal_attack_target',
      activationRate: 30,
      damageKind: 'physical',
      damageRate: 0.95,
      speedBonusRate: 0.45,
    }),
    defineFormula({
      id: 'lib_a_active_benevolent_aid',
      name: '仁心救护',
      type: 'active',
      templateId: 'active_ally_heal_v1',
      targetSelector: 'ally_lowest_2',
      activationRate: 50,
      healingRate: 0.95,
    }),
    defineFormula({
      id: 'lib_a_command_iron_wall_line',
      name: '铁壁列阵',
      type: 'command',
      templateId: 'command_ally_guard_recovery_v1',
      targetSelector: 'ally_team',
      damageReduction: 0.18,
      evasionChargesAgainst: ['chase'],
    }),
    defineFormula({
      id: 'lib_b_command_line_discipline',
      name: '行伍整肃',
      type: 'command',
      templateId: 'command_ally_attribute_buff_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { command: 0.05 },
    }),
    defineFormula({
      id: 'lib_b_command_marching_ration',
      name: '行军口粮',
      type: 'command',
      templateId: 'command_ally_guard_recovery_v1',
      targetSelector: 'ally_team',
      healingRate: 0.22,
    }),
    defineFormula({
      id: 'lib_b_active_probe_attack',
      name: '试探攻势',
      type: 'active',
      templateId: 'active_damage_enemy_single_v1',
      targetSelector: 'enemy_random_1',
      activationRate: 35,
      damageKind: 'physical',
      damageRate: 0.9,
      speedBonusRate: 0.1,
    }),
    defineFormula({
      id: 'lib_b_active_smoke_arrow',
      name: '烟矢扰阵',
      type: 'active',
      templateId: 'active_damage_enemy_group_v1',
      targetSelector: 'enemy_group_2',
      activationRate: 30,
      damageKind: 'strategy',
      damageRate: 0.45,
    }),
    defineFormula({
      id: 'lib_b_passive_field_medicine',
      name: '战地医护',
      type: 'passive',
      templateId: 'passive_self_recovery_v1',
      targetSelector: 'self',
      healingRate: 0.35,
      damageReduction: 0.04,
    }),
    defineFormula({
      id: 'lib_b_passive_wall_guard',
      name: '墙垒戒备',
      type: 'passive',
      templateId: 'passive_self_guard_v1',
      targetSelector: 'self',
      attributeModifiers: { command: 0.07 },
    }),
    defineFormula({
      id: 'lib_b_chase_counter_cut',
      name: '反手追斩',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'normal_attack_target',
      activationRate: 30,
      damageKind: 'physical',
      damageRate: 0.85,
    }),
    defineFormula({
      id: 'lib_b_chase_quick_ride',
      name: '疾骑补击',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'normal_attack_target',
      activationRate: 35,
      damageKind: 'physical',
      damageRate: 0.55,
      speedBonusRate: 0.12,
    }),
    defineFormula({
      id: 'lib_s_command_lord_guard',
      name: '主将固护',
      type: 'command',
      templateId: 'command_ally_guard_recovery_v1',
      targetSelector: 'ally_commander',
      damageReduction: 0.28,
      healingRate: 0.5,
    }),
    defineFormula({
      id: 'lib_s_passive_deep_plan',
      name: '后谋蓄势',
      type: 'passive',
      templateId: 'passive_self_recovery_v1',
      targetSelector: 'self',
      attributeModifiers: { intelligence: 0.28 },
    }),
    defineFormula({
      id: 'lib_a_chase_chain_pressure',
      name: '连击压阵',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'normal_attack_target',
      activationRate: 40,
      damageKind: 'physical',
      damageRate: 0.9,
      breakDamageRate: 1.15,
    }),
    defineFormula({
      id: 'lib_a_active_finish_lord',
      name: '斩将乘势',
      type: 'active',
      templateId: 'active_damage_enemy_commander_v1',
      targetSelector: 'enemy_commander',
      activationRate: 40,
      damageKind: 'physical',
      damageRate: 1.05,
      breakDamageRate: 1.25,
    }),
    defineFormula({
      id: 'lib_a_passive_prepare_anchor',
      name: '稳阵蓄锋',
      type: 'passive',
      templateId: 'passive_self_guard_v1',
      targetSelector: 'self',
      damageReduction: 0.22,
      controlCleanseCharges: 1,
    }),
    defineFormula({
      id: 'lib_b_command_clear_order',
      name: '清令整军',
      type: 'command',
      templateId: 'command_ally_guard_recovery_v1',
      targetSelector: 'ally_lowest_1',
      healingRate: 0.35,
      controlCleanseCharges: 1,
    }),
    defineFormula({
      id: 'lib_s_command_unified_momentum',
      name: '众势并进',
      type: 'command',
      templateId: 'command_ally_attribute_buff_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { force: 0.12, intelligence: 0.06 },
      damageReduction: 0.08,
    }),
    defineFormula({
      id: 'lib_s_active_flooding_arrows',
      name: '江潮破阵',
      type: 'active',
      templateId: 'active_damage_enemy_group_v1',
      targetSelector: 'enemy_group_2',
      activationRate: 45,
      damageKind: 'strategy',
      damageRate: 1.05,
      breakDamageRate: 1.2,
    }),
    defineFormula({
      id: 'lib_s_passive_last_stand',
      name: '据险不退',
      type: 'passive',
      templateId: 'passive_self_recovery_v1',
      targetSelector: 'self',
      damageReduction: 0.16,
      healingRate: 0.5,
    }),
    defineFormula({
      id: 'lib_s_chase_double_break',
      name: '双破追击',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'normal_attack_target',
      activationRate: 38,
      damageKind: 'physical',
      damageRate: 1.2,
      breakDamageRate: 1.55,
    }),
    defineFormula({
      id: 'lib_s_command_clear_sky',
      name: '澄明军令',
      type: 'command',
      templateId: 'command_ally_guard_recovery_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { force: 0.05, intelligence: 0.05 },
      controlCleanseCharges: 1,
    }),
    defineFormula({
      id: 'lib_a_command_rhythm_drill',
      name: '行阵节奏',
      type: 'command',
      templateId: 'command_ally_attribute_buff_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { speed: 0.1, force: 0.08 },
      healingRate: 0.2,
    }),
    defineFormula({
      id: 'lib_a_active_focus_fire',
      name: '集火军令',
      type: 'active',
      templateId: 'active_damage_enemy_lowest_v1',
      targetSelector: 'enemy_lowest_1',
      activationRate: 45,
      damageKind: 'physical',
      damageRate: 1.35,
      breakDamageRate: 1.45,
    }),
    defineFormula({
      id: 'lib_a_active_poison_flame',
      name: '毒焰扰营',
      type: 'active',
      templateId: 'active_damage_enemy_group_v1',
      targetSelector: 'enemy_group_2',
      activationRate: 40,
      damageKind: 'strategy',
      damageRate: 0.7,
      burnRate: 0.25,
      burnTurns: 2,
    }),
    defineFormula({
      id: 'lib_a_passive_steady_recovery',
      name: '稳息回军',
      type: 'passive',
      templateId: 'passive_self_recovery_v1',
      targetSelector: 'self',
      healingRate: 0.45,
      controlCleanseCharges: 1,
    }),
    defineFormula({
      id: 'lib_a_passive_counter_ready',
      name: '反击备势',
      type: 'passive',
      templateId: 'passive_counter_guard_v1',
      targetSelector: 'self',
      damageReduction: 0.08,
      attributeModifiers: { force: 0.08 },
    }),
    defineFormula({
      id: 'lib_a_chase_marked_cut',
      name: '标记追斩',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'normal_attack_target',
      activationRate: 40,
      damageKind: 'physical',
      damageRate: 1,
      breakDamageRate: 1.2,
    }),
    defineFormula({
      id: 'lib_a_chase_speed_snap',
      name: '迅影补刀',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'normal_attack_target',
      activationRate: 45,
      damageKind: 'physical',
      damageRate: 0.95,
      speedBonusRate: 0.12,
    }),
    defineFormula({
      id: 'lib_a_command_bow_cover',
      name: '弓步掩护',
      type: 'command',
      templateId: 'command_ally_guard_recovery_v1',
      targetSelector: 'ally_team',
      damageReduction: 0.1,
      attributeModifiers: { intelligence: 0.04 },
    }),
    defineFormula({
      id: 'lib_a_active_break_morale',
      name: '破胆击',
      type: 'active',
      templateId: 'active_damage_enemy_single_v1',
      targetSelector: 'enemy_random_1',
      activationRate: 40,
      damageKind: 'physical',
      damageRate: 1.6,
    }),
    defineFormula({
      id: 'lib_b_command_trial_order',
      name: '试练军令',
      type: 'command',
      templateId: 'command_ally_attribute_buff_v1',
      targetSelector: 'ally_team',
      attributeModifiers: { force: 0.06, command: 0.06 },
    }),
    defineFormula({
      id: 'lib_b_active_short_strike',
      name: '短兵突击',
      type: 'active',
      templateId: 'active_damage_enemy_single_v1',
      targetSelector: 'enemy_random_1',
      activationRate: 45,
      damageKind: 'physical',
      damageRate: 1.1,
      breakDamageRate: 1.25,
    }),
    defineFormula({
      id: 'lib_b_active_mind_probe',
      name: '探谋扰敌',
      type: 'active',
      templateId: 'active_damage_enemy_single_v1',
      targetSelector: 'enemy_random_1',
      activationRate: 35,
      damageKind: 'strategy',
      damageRate: 0.9,
      speedBonusRate: 0.1,
    }),
    defineFormula({
      id: 'lib_b_passive_minor_guard',
      name: '小阵固守',
      type: 'passive',
      templateId: 'passive_self_guard_v1',
      targetSelector: 'self',
      damageReduction: 0.08,
      healingRate: 0.28,
    }),
    defineFormula({
      id: 'lib_b_passive_battle_bandage',
      name: '简易包扎',
      type: 'passive',
      templateId: 'passive_self_recovery_v1',
      targetSelector: 'ally_lowest_1',
      healingRate: 0.28,
    }),
    defineFormula({
      id: 'lib_b_chase_follow_arrow',
      name: '随射补击',
      type: 'chase',
      templateId: 'chase_after_normal_attack_v1',
      targetSelector: 'normal_attack_target',
      activationRate: 35,
      damageKind: 'physical',
      damageRate: 0.7,
      speedBonusRate: 0.12,
    }),
  ].map((definition) => [definition.id, definition]),
) as Record<string, TacticalSkillFormulaDefinition>

export function getExpectedRepresentativeInnateSkillId(heroId: string) {
  return FIXED_INNATE_SKILL_BY_HERO_ID[normalizeHeroId(heroId)]
}

export function getRepresentativeTacticalSkillFormulaDefinition(
  skillId: string,
): TacticalSkillFormulaDefinition | undefined {
  return REPRESENTATIVE_FORMULA_DEFINITIONS[skillId]
}

export function getRepresentativeTacticalSkillFormula(skillId: string): TacticalSkillFormula | undefined {
  const definition = getRepresentativeTacticalSkillFormulaDefinition(skillId)
  if (!definition) {
    return undefined
  }
  return materializeFormula(definition)
}

export function listRepresentativeTacticalSkillFormulaDefinitions(): TacticalSkillFormulaDefinition[] {
  return Object.values(REPRESENTATIVE_FORMULA_DEFINITIONS)
}

export function listRepresentativeTacticalSkillFormulas(): TacticalSkillFormula[] {
  return listRepresentativeTacticalSkillFormulaDefinitions().map(materializeFormula)
}

export function auditRepresentativeTacticalFormulaCoverage(params: {
  innateSkillIds: string[]
  generalSkillIds: string[]
}): TacticalFormulaCoverageAudit {
  const expectedSkillIds = [...params.innateSkillIds, ...params.generalSkillIds]
  const implementedSkillIds = expectedSkillIds
    .filter((skillId) => Boolean(REPRESENTATIVE_FORMULA_DEFINITIONS[skillId]))
    .sort()
  const missingInnateSkillIds = params.innateSkillIds
    .filter((skillId) => !REPRESENTATIVE_FORMULA_DEFINITIONS[skillId])
    .sort()
  const missingGeneralSkillIds = params.generalSkillIds
    .filter((skillId) => !REPRESENTATIVE_FORMULA_DEFINITIONS[skillId])
    .sort()

  return {
    totalSkillCount: expectedSkillIds.length,
    implementedSkillIds,
    missingSkillIds: [...missingInnateSkillIds, ...missingGeneralSkillIds].sort(),
    missingInnateSkillIds,
    missingGeneralSkillIds,
    implementedDefinitions: implementedSkillIds.map((skillId) => REPRESENTATIVE_FORMULA_DEFINITIONS[skillId]),
  }
}

function defineFormula(input: TacticalFormulaInput): TacticalSkillFormulaDefinition {
  const { templateId, ...formulaInput } = input
  const formula: TacticalSkillFormula = {
    ...formulaInput,
    slot: input.id.startsWith('innate_') ? 'innate' : 'equipped',
  }
  return {
    ...formula,
    templateId,
    templateParams: buildTemplateParams(formula),
  }
}

function buildTemplateParams(formula: TacticalSkillFormula): TacticalFormulaTemplateParams {
  return {
    attributeModifiers: formula.attributeModifiers ? { ...formula.attributeModifiers } : undefined,
    activationRate: formula.activationRate,
    damageKind: formula.damageKind,
    damageRate: formula.damageRate,
    breakDamageRate: formula.breakDamageRate,
    speedBonusRate: formula.speedBonusRate,
    burnRate: formula.burnRate,
    burnTurns: formula.burnTurns,
    healingRate: formula.healingRate,
    damageReduction: formula.damageReduction,
    evasionChargesAgainst: formula.evasionChargesAgainst ? [...formula.evasionChargesAgainst] : undefined,
    controlCleanseCharges: formula.controlCleanseCharges,
    targetSelector: formula.targetSelector,
    targetCount: inferTargetCount(formula.targetSelector),
  }
}

function materializeFormula(definition: TacticalSkillFormulaDefinition): TacticalSkillFormula {
  const { templateId: _templateId, templateParams: _templateParams, ...formula } = definition
  return {
    ...formula,
    attributeModifiers: formula.attributeModifiers ? { ...formula.attributeModifiers } : undefined,
    evasionChargesAgainst: formula.evasionChargesAgainst ? [...formula.evasionChargesAgainst] : undefined,
  }
}

function inferTargetCount(targetSelector: TacticalSkillFormula['targetSelector']) {
  switch (targetSelector) {
    case 'ally_team':
    case 'enemy_team':
      return 3
    case 'ally_lowest_2':
    case 'enemy_group_2':
      return 2
    case 'self':
    case 'ally_commander':
    case 'ally_lowest_1':
    case 'enemy_commander':
    case 'enemy_random_1':
    case 'enemy_lowest_1':
    case 'normal_attack_target':
      return 1
  }
}

function normalizeHeroId(heroId: string) {
  return heroId.startsWith('hero_') ? heroId.slice('hero_'.length) : heroId
}
