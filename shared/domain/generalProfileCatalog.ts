import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TacticalCombatant, TacticalHeroStats, TacticalTroopType } from './tacticalSkillRules'

export type GeneralSkillCatalogEntry = {
  id: string
  name: string
  grade: string
  type: string
  level: number
  description: string
  trigger: string
  target: string
  effect: string
  attributeEffects: Record<string, string>
}

export type GeneralProfileCatalogEntry = {
  id: string
  name: string
  faction: string
  troopType: TacticalTroopType
  level: number
  soldierCurrent: number
  soldierMax: number
  attributes: TacticalHeroStats
  growth: TacticalHeroStats
  innateSkill: GeneralSkillCatalogEntry
  learnableSkillSlots: number
}

type RawSkillEntry = {
  id?: unknown
  name?: unknown
  grade?: unknown
  type?: unknown
  level?: unknown
  description?: unknown
  trigger?: unknown
  target?: unknown
  effect?: unknown
  attribute_effects?: unknown
}

type RawGeneralProfile = {
  name?: unknown
  faction?: unknown
  troop_type?: unknown
  level?: unknown
  soldier_current?: unknown
  soldier_max?: unknown
  attributes?: unknown
  growth?: unknown
  skills?: unknown
  learnable_skill_slots?: unknown
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const GENERAL_PROFILE_PATH = join(__dirname, '../../godot-client/data/ui/general_profile_preview.json')
const GENERAL_SKILL_LIBRARY_PATH = join(__dirname, '../../godot-client/data/ui/general_skill_library_preview.json')

let generalProfileCache: Record<string, GeneralProfileCatalogEntry> | null = null
let generalSkillCache: Record<string, GeneralSkillCatalogEntry> | null = null

export function loadGeneralProfileCatalog(): Record<string, GeneralProfileCatalogEntry> {
  if (generalProfileCache) return generalProfileCache

  const root = JSON.parse(readFileSync(GENERAL_PROFILE_PATH, 'utf-8')) as { hero_profiles?: unknown }
  if (!root.hero_profiles || typeof root.hero_profiles !== 'object' || Array.isArray(root.hero_profiles)) {
    throw new Error('general_profile_preview.json must contain hero_profiles object')
  }

  const entries: Record<string, GeneralProfileCatalogEntry> = {}
  for (const [id, rawValue] of Object.entries(root.hero_profiles)) {
    entries[id] = normalizeGeneralProfile(id, rawValue as RawGeneralProfile)
  }
  generalProfileCache = entries
  return entries
}

export function loadGeneralSkillCatalog(): Record<string, GeneralSkillCatalogEntry> {
  if (generalSkillCache) return generalSkillCache

  const root = JSON.parse(readFileSync(GENERAL_SKILL_LIBRARY_PATH, 'utf-8')) as { skills?: unknown }
  if (!Array.isArray(root.skills)) {
    throw new Error('general_skill_library_preview.json must contain skills array')
  }

  const entries: Record<string, GeneralSkillCatalogEntry> = {}
  for (const rawValue of root.skills) {
    const entry = normalizeSkillEntry(rawValue as RawSkillEntry)
    entries[entry.id] = entry
  }
  generalSkillCache = entries
  return entries
}

export function getGeneralProfileCatalogEntry(heroId: string): GeneralProfileCatalogEntry {
  const entry = loadGeneralProfileCatalog()[heroId]
  if (!entry) {
    throw new Error(`Unknown general profile: ${heroId}`)
  }
  return entry
}

export function getGeneralSkillCatalogEntry(skillId: string): GeneralSkillCatalogEntry {
  const entry = loadGeneralSkillCatalog()[skillId]
  if (!entry) {
    throw new Error(`Unknown general skill: ${skillId}`)
  }
  return entry
}

export function buildTacticalCombatantFromGeneralCatalog(
  heroId: string,
  equippedSkillIds: string[],
  overrides: Partial<Pick<TacticalCombatant, 'strength' | 'mobility' | 'supply'>> = {},
): TacticalCombatant {
  const profile = getGeneralProfileCatalogEntry(heroId)
  const skillCatalog = loadGeneralSkillCatalog()

  if (equippedSkillIds.length > profile.learnableSkillSlots) {
    throw new Error(`${profile.name} can equip at most ${profile.learnableSkillSlots} general skills`)
  }
  for (const skillId of equippedSkillIds) {
    if (!skillCatalog[skillId]) {
      throw new Error(`Unknown equipped general skill: ${skillId}`)
    }
  }

  return {
    heroId: profile.id,
    heroName: profile.name,
    troopType: profile.troopType,
    stats: { ...profile.attributes },
    strength: overrides.strength ?? profile.soldierCurrent,
    mobility: overrides.mobility ?? defaultMobility(profile.troopType),
    supply: overrides.supply ?? 5,
    innateSkillId: profile.innateSkill.id,
    equippedSkillIds: [...equippedSkillIds],
  }
}

function normalizeGeneralProfile(id: string, raw: RawGeneralProfile): GeneralProfileCatalogEntry {
  const rawSkills = raw.skills
  if (!Array.isArray(rawSkills) || rawSkills.length !== 1) {
    throw new Error(`general profile ${id} must contain exactly one innate skill`)
  }

  return {
    id,
    name: requireString(raw.name, `general profile ${id}.name`),
    faction: requireString(raw.faction, `general profile ${id}.faction`),
    troopType: normalizeTroopType(raw.troop_type, `general profile ${id}.troop_type`),
    level: requireNumber(raw.level, `general profile ${id}.level`),
    soldierCurrent: requireNumber(raw.soldier_current, `general profile ${id}.soldier_current`),
    soldierMax: requireNumber(raw.soldier_max, `general profile ${id}.soldier_max`),
    attributes: normalizeStats(raw.attributes, `general profile ${id}.attributes`),
    growth: normalizeStats(raw.growth, `general profile ${id}.growth`),
    innateSkill: normalizeSkillEntry(rawSkills[0] as RawSkillEntry),
    learnableSkillSlots: requireNumber(raw.learnable_skill_slots, `general profile ${id}.learnable_skill_slots`),
  }
}

function normalizeSkillEntry(raw: RawSkillEntry): GeneralSkillCatalogEntry {
  return {
    id: requireString(raw.id, 'skill.id'),
    name: requireString(raw.name, 'skill.name'),
    grade: requireString(raw.grade, 'skill.grade'),
    type: requireString(raw.type, 'skill.type'),
    level: requireNumber(raw.level, 'skill.level'),
    description: requireString(raw.description, 'skill.description'),
    trigger: requireString(raw.trigger, 'skill.trigger'),
    target: requireString(raw.target, 'skill.target'),
    effect: requireString(raw.effect, 'skill.effect'),
    attributeEffects: normalizeAttributeEffects(raw.attribute_effects),
  }
}

function normalizeStats(value: unknown, label: string): TacticalHeroStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  const raw = value as Record<string, unknown>
  return {
    force: requireNumber(raw.force, `${label}.force`),
    command: requireNumber(raw.command, `${label}.command`),
    intelligence: requireNumber(raw.intelligence, `${label}.intelligence`),
    charisma: requireNumber(raw.charisma, `${label}.charisma`),
    speed: requireNumber(raw.speed, `${label}.speed`),
  }
}

function normalizeAttributeEffects(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, rawValue]) => [key, String(rawValue)]),
  )
}

function normalizeTroopType(value: unknown, label: string): TacticalTroopType {
  const raw = requireString(value, label)
  if (
    raw === 'cavalry'
    || raw === 'infantry'
    || raw === 'archer'
    || raw === 'shield'
    || raw === 'mixed'
    || raw === 'supply'
  ) {
    return raw
  }
  throw new Error(`${label} is not a supported tactical troop type: ${raw}`)
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

function defaultMobility(troopType: TacticalTroopType) {
  switch (troopType) {
    case 'cavalry':
      return 34
    case 'archer':
    case 'mixed':
      return 28
    case 'supply':
      return 20
    default:
      return 24
  }
}
