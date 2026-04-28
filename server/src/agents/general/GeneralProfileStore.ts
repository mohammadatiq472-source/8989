import type { HeroArchetype, WorldState } from '../../../../shared/contracts/game'
import { existsSync, readFileSync, mkdirSync, readdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type GeneralProfile = {
  id: string
  name: string
  faction: string
  unitId: string
  /**
   * 将领等级（运行时派生，不持久化）
   * Tier 1（90%）: 纯 UtilityAI，零 LLM 调用 —— 普通执行者
   * Tier 2（9%）:  重要时机触发小模型 LLM —— 有经验的将领
   * Tier 3（1%）:  强模型，关键节点可用 —— 名将/盟主直辖精英
   */
  tier?: 1 | 2 | 3
  personality: {
    aggression: number
    loyalty: number
    riskTolerance: number
    speciality: string
  }
  history: {
    battlesWon: number
    battlesLost: number
    keyDecisions: string[]
    diplomaticContacts: string[]
  }
  relationship: {
    lordTrust: number
    recentIgnored: number
    pendingGrievance: string[]
  }
  memory: {
    shortTerm: string[]
    longTermSummary: string
  }
}

export type GeneralReflectOutcome = 'success' | 'failure' | 'neutral'

export type GeneralReflectFeedback = {
  profileId: string
  tick: number
  summary: string
  significance: 'minor' | 'major' | 'epic'
  outcome: GeneralReflectOutcome
  battleOutcome?: 'win' | 'loss' | 'draw'
  grievance?: string
}

const GENERAL_STORE = new Map<string, GeneralProfile>()
const MAX_SHORT_TERM_MEMORY = 20
const MAX_KEY_DECISIONS = 40
const MAX_GRIEVANCE = 12
const LONG_TERM_SUMMARY_LIMIT = 360

// P1-4: 按势力分文件持久化
const PERSIST_DIR = join(process.cwd(), 'tmp', 'general_profiles')
const LEGACY_PERSIST_PATH = join(process.cwd(), 'tmp', 'general_profiles.json')
const dirtyFactions = new Set<string>()
let persistTimer: ReturnType<typeof setTimeout> | null = null
const PERSIST_DEBOUNCE_MS = 3_000

function loadPersistedProfiles() {
  try {
    // 优先从按势力分文件加载
    if (existsSync(PERSIST_DIR)) {
      const files = readdirSync(PERSIST_DIR).filter(f => f.endsWith('.json'))
      let totalCount = 0
      for (const file of files) {
        try {
          const raw = readFileSync(join(PERSIST_DIR, file), 'utf8')
          const entries = JSON.parse(raw) as Array<[string, GeneralProfile]>
          for (const [key, profile] of entries) {
            GENERAL_STORE.set(key, profile)
          }
          totalCount += entries.length
        } catch {
          console.warn(`[GeneralProfileStore] failed to load faction file: ${file}`)
        }
      }
      if (totalCount > 0) {
        console.log(`[GeneralProfileStore] restored ${totalCount} profiles from ${files.length} faction files`)
        return
      }
    }
    // 回退到旧版单文件格式
    if (existsSync(LEGACY_PERSIST_PATH)) {
      const raw = readFileSync(LEGACY_PERSIST_PATH, 'utf8')
      const entries = JSON.parse(raw) as Array<[string, GeneralProfile]>
      for (const [key, profile] of entries) {
        GENERAL_STORE.set(key, profile)
      }
      console.log(`[GeneralProfileStore] migrated ${entries.length} profiles from legacy single file`)
      // 迁移完成后标记所有势力为脏，下次保存时写分势力文件
      for (const profile of GENERAL_STORE.values()) {
        dirtyFactions.add(profile.faction)
      }
    }
  } catch {
    console.warn('[GeneralProfileStore] failed to load persisted profiles, starting fresh')
  }
}

function schedulePersist(faction?: string) {
  if (faction) dirtyFactions.add(faction)
  if (dirtyFactions.size === 0) return
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    if (dirtyFactions.size === 0) return
    const factionsToPersist = new Set(dirtyFactions)
    dirtyFactions.clear()
    if (!existsSync(PERSIST_DIR)) mkdirSync(PERSIST_DIR, { recursive: true })
    // 每个脏势力单独写一个文件
    for (const factionId of factionsToPersist) {
      const entries = Array.from(GENERAL_STORE.entries()).filter(([, p]) => p.faction === factionId)
      if (entries.length === 0) continue
      const safeName = factionId.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_')
      writeFile(join(PERSIST_DIR, `${safeName}.json`), JSON.stringify(entries, null, 2), 'utf8')
        .catch(() => console.warn(`[GeneralProfileStore] failed to persist faction: ${factionId}`))
    }
  }, PERSIST_DEBOUNCE_MS)
}

loadPersistedProfiles()

export function getOrCreateGeneralProfiles(world: WorldState) {
  for (const unit of world.units) {
    if (!GENERAL_STORE.has(unit.id)) {
      GENERAL_STORE.set(unit.id, createProfileFromUnit(unit))
    }
  }

  return Array.from(GENERAL_STORE.values())
}

export function getGeneralProfilesForFaction(world: WorldState, faction: string) {
  return getOrCreateGeneralProfiles(world).filter((profile) => profile.faction === faction)
}

export function updateGeneralProfile(profileId: string, updater: (profile: GeneralProfile) => void) {
  const profile = GENERAL_STORE.get(profileId)
  if (!profile) {
    return false
  }

  updater(profile)
  schedulePersist(profile.faction)
  return true
}

export function recordGeneralShortTermMemory(profileId: string, text: string) {
  const profile = GENERAL_STORE.get(profileId)
  if (!profile) {
    return
  }

  profile.memory.shortTerm.unshift(text)
  profile.memory.shortTerm = profile.memory.shortTerm.slice(0, MAX_SHORT_TERM_MEMORY)
  schedulePersist(profile.faction)
}

export function applyGeneralReflectFeedback(feedback: GeneralReflectFeedback) {
  const profile = GENERAL_STORE.get(feedback.profileId)
  if (!profile) {
    return false
  }

  if (feedback.battleOutcome === 'win') {
    profile.history.battlesWon += 1
  } else if (feedback.battleOutcome === 'loss') {
    profile.history.battlesLost += 1
  }

  const compactSummary = compactLine(feedback.summary)
  if (compactSummary.length > 0) {
    profile.history.keyDecisions.unshift(`[tick ${feedback.tick}] ${truncate(compactSummary, 120)}`)
    profile.history.keyDecisions = profile.history.keyDecisions.slice(0, MAX_KEY_DECISIONS)
  }

  const impactWeight = significanceWeight(feedback.significance)
  if (feedback.outcome === 'success') {
    profile.relationship.lordTrust = clamp01(profile.relationship.lordTrust + 0.025 * impactWeight)
    profile.personality.loyalty = clamp01(profile.personality.loyalty + 0.02 * impactWeight)
    profile.relationship.recentIgnored = Math.max(0, profile.relationship.recentIgnored - 1)
    if (profile.relationship.pendingGrievance.length > 0) {
      profile.relationship.pendingGrievance = profile.relationship.pendingGrievance.slice(0, -1)
    }
  } else if (feedback.outcome === 'failure') {
    profile.relationship.lordTrust = clamp01(profile.relationship.lordTrust - 0.03 * impactWeight)
    profile.personality.loyalty = clamp01(profile.personality.loyalty - 0.024 * impactWeight)
    profile.relationship.recentIgnored = Math.min(8, profile.relationship.recentIgnored + 1)

    const grievance = compactLine(feedback.grievance || '') || `tick ${feedback.tick}: unresolved setback`
    profile.relationship.pendingGrievance.unshift(truncate(grievance, 140))
    profile.relationship.pendingGrievance = profile.relationship.pendingGrievance.slice(0, MAX_GRIEVANCE)
  }

  profile.memory.longTermSummary = appendLongTermSummary(
    profile.memory.longTermSummary,
    feedback.tick,
    compactSummary,
    feedback.outcome,
  )

  schedulePersist(profile.faction)
  return true
}

function createProfileFromUnit(unit: WorldState['units'][number]): GeneralProfile {
  const bias = personalityByArchetype(unit.hero.archetype)

  return {
    id: unit.id,
    name: unit.hero.name,
    faction: unit.faction,
    unitId: unit.id,
    personality: {
      aggression: bias.aggression,
      loyalty: 0.72,
      riskTolerance: bias.riskTolerance,
      speciality: bias.speciality,
    },
    history: {
      battlesWon: 0,
      battlesLost: 0,
      keyDecisions: [],
      diplomaticContacts: [],
    },
    relationship: {
      lordTrust: 0.68,
      recentIgnored: 0,
      pendingGrievance: [],
    },
    memory: {
      shortTerm: [],
      longTermSummary: '',
    },
  }
}

function personalityByArchetype(archetype: HeroArchetype) {
  switch (archetype) {
    case 'assault':
      return { aggression: 0.8, riskTolerance: 0.7, speciality: 'flanking' }
    case 'recon':
      return { aggression: 0.45, riskTolerance: 0.55, speciality: 'recon' }
    case 'guard':
      return { aggression: 0.35, riskTolerance: 0.4, speciality: 'siege' }
    case 'mobile':
      return { aggression: 0.6, riskTolerance: 0.65, speciality: 'flanking' }
    case 'heavy':
      return { aggression: 0.7, riskTolerance: 0.5, speciality: 'siege' }
    case 'logistics':
      return { aggression: 0.25, riskTolerance: 0.3, speciality: 'logistics' }
    case 'reserve':
      return { aggression: 0.4, riskTolerance: 0.45, speciality: 'support' }
    default:
      return { aggression: 0.5, riskTolerance: 0.5, speciality: 'support' }
  }
}

function significanceWeight(value: GeneralReflectFeedback['significance']) {
  if (value === 'epic') {
    return 1.35
  }

  if (value === 'major') {
    return 1
  }

  return 0.65
}

function appendLongTermSummary(
  currentSummary: string,
  tick: number,
  summary: string,
  outcome: GeneralReflectOutcome,
) {
  if (!summary) {
    return currentSummary
  }

  const token = `[t${tick}|${outcome}] ${truncate(summary, 80)}`
  const combined = currentSummary ? `${token} | ${currentSummary}` : token
  return truncate(combined, LONG_TERM_SUMMARY_LIMIT)
}

function compactLine(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) {
    return value
  }

  return `${value.slice(0, Math.max(0, limit - 1))}?`
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

// ─── Tier 系统 ────────────────────────────────────────────────────────────────

/**
 * 根据将领档案动态计算 tier（运行时派生，不持久化）。
 *
 * 成本金字塔：
 *   Tier 1 (~90%) — 纯 UtilityAI，零 LLM 调用
 *   Tier 2 (~9%)  — 关键时机触发小模型 LLM（有经验的中层将领）
 *   Tier 3 (~1%)  — 强模型，盟主重点关注的精英名将
 *
 * 晋升条件（AND 逻辑，越严格越好）：
 *   Tier 3: totalBattles >= 10 AND lordTrust >= 0.80 AND loyalty >= 0.75
 *   Tier 2: totalBattles >= 4  AND lordTrust >= 0.65 AND loyalty >= 0.5
 *   Tier 1: 其余所有（新将、被忽视将、低忠诚将）
 *
 * 降级触发：
 *   忠诚度 < 0.35 → 强制降回 Tier 1（叛将不值得 LLM 资源）
 *   recentIgnored >= 6 → 强制降回 Tier 1（被冷落的将领会怠工）
 */
export function computeGeneralTier(profile: GeneralProfile): 1 | 2 | 3 {
  const { loyalty } = profile.personality
  const { lordTrust, recentIgnored } = profile.relationship
  const totalBattles = profile.history.battlesWon + profile.history.battlesLost

  // 强制降级条件
  if (loyalty < 0.35 || recentIgnored >= 6) return 1

  // Tier 3: 精英名将
  if (totalBattles >= 10 && lordTrust >= 0.80 && loyalty >= 0.75) return 3

  // Tier 2: 有经验的中层将领
  if (totalBattles >= 4 && lordTrust >= 0.65 && loyalty >= 0.50) return 2

  // Tier 1: 默认（新将、低信任将）
  return 1
}

