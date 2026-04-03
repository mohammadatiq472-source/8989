import type { HeroArchetype, HeroCardType, HeroFaction, HeroQualityTier, TroopType } from '../game'

// V2 hero template
export type HeroTemplate = {
  id: string
  name: string
  faction: HeroFaction
  cardType: HeroCardType
  qualityTier: HeroQualityTier
  maxLevel: number
  baseForce: number
  baseCommand: number
  baseIntelligence: number
  baseCharisma: number
  baseSpeed: number
  growthForce: number
  growthCommand: number
  growthIntelligence: number
  growthCharisma: number
  growthSpeed: number
  skillName: string
  archetype: HeroArchetype
  troopType: TroopType
  tags: string[]
}

// Player-owned hero instance
export type GeneralInstance = {
  id: string
  templateId: string
  ownerId: string
  quality: HeroQualityTier
  redStars: number
  level: number
  bonusForce: number
  bonusCommand: number
  bonusIntelligence: number
  bonusCharisma: number
  bonusSpeed: number
  assignedArmyId?: string
  assignedRole?: 'main' | 'vice'
}

export type ArmyStatus =
  | '\u5f85\u547d'
  | '\u884c\u519b\u4e2d'
  | '\u4ea4\u6218\u4e2d'
  | '\u9a7b\u9632\u4e2d'
  | '\u4fa6\u5bdf\u4e2d'
  | '\u8fd4\u56de\u4e2d'

// Army = 1 main + up to 2 vice
export type Army = {
  id: string
  aiPlayerId: string
  mainGeneralId?: string
  viceGeneralIds: string[]
  troopCount: number
  maxTroopCount: number
  tileId: string
  status: ArmyStatus
  currentTask?: string
}

export type PlayerResources = {
  food: number
  wood: number
  stone: number
  iron: number
}

export type AIPlayerV2 = {
  id: string
  name: string
  ownerId: string
  factionId: string
  specialty: 'assault' | 'recon' | 'guard' | 'logistics' | 'expansion'
  armySlots: number
  armies: Army[]
  generals: GeneralInstance[]
  resources: PlayerResources
  capturedTiles: string[]
  capturedCities: string[]
}

export const ARMY_SLOT_THRESHOLDS: readonly { cities: number; slots: number }[] = [
  { cities: 0, slots: 1 },
  { cities: 3, slots: 2 },
  { cities: 6, slots: 3 },
  { cities: 10, slots: 4 },
  { cities: 15, slots: 5 },
] as const

export const STAR_UPGRADE_BONUS_PER_STAR = 10

export type Alliance = {
  id: string
  name: string
  leaderId: string
  officerIds: string[]
  memberIds: string[]
  maxMembers: number
  doctrine?: string
  createdAt: number
}

export type AllianceMemberRole = 'leader' | 'officer' | 'member'

export type HumanPlayer = {
  id: string
  username: string
  email?: string
  allianceId?: string
  allianceRole?: AllianceMemberRole
  aiPlayerIds: string[]
  createdAt: number
}

export type RecruitPoolType = 'normal' | 'elite' | 'limited'

export type RecruitResult = {
  templateId: string
  qualityTier: HeroQualityTier
  isNew: boolean
  isDuplicate: boolean
}

export type StarUpgradeRequest = {
  targetInstanceId: string
  sacrificeInstanceIds: string[]
}

export type StarAttributeAllocation = {
  instanceId: string
  force: number
  command: number
  intelligence: number
  charisma: number
  speed: number
}
