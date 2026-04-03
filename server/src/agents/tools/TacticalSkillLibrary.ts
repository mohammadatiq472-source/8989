/**
 * TacticalSkillLibrary - Voyager ???????
 *
 * ?????????????? ReflectService ?????"???? + ???? + ??"
 * ? JSON ???????? CommanderAgent ????????????????? tactics?
 * ?? historicalSkills ????? LLM ?????????
 *
 * ???????Wang et al., "Voyager: An Open-Ended Embodied Agent with LLM" (2023)
 * ?????? skill library ? agent ????????? baseline ? ~3x?
 */

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type TacticalSkillEntry = {
  id: string
  /** 例：['phase:expand', 'luoyang:opposing', 'pressure:high', 'faction:primary'] */
  situationTags: string[]
  /** ??????? */
  tacticSummary: string
  /** ??????????????? unit id? */
  prototypeOrders: Array<{
    action: string
    context: string // e.g. "???????????????"
  }>
  /** ?????? 0.0-1.0????? */
  outcomeScore: number
  /** ???????? */
  uses: number
  /** ???????? tick */
  tickRecorded: number
  /** ????????????????????? */
  factionId: string
}

// -- ????? ----------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILL_LIBRARY_PATH = join(__dirname, '../../config/tactical_skills.json')

const MAX_SKILLS = 80 // ???? N ???????
const MAX_RETRIEVE = 5 // ?????? N ?
const EMA_NEW_WEIGHT = 0.35 // ???????????????
const TAG_MATCH_THRESHOLD = 0.6 // ??????????????

// -- ???? ------------------------------------------------------------------
let _cache: TacticalSkillEntry[] | null = null

let persistDirty = false
let persistInFlight: Promise<void> | null = null
const persistEpoch = 0

// -- ?? API ------------------------------------------------------------------

/**
 * ????????????
 *
 * ?????????? >= TAG_MATCH_THRESHOLD ?????? EMA ?? outcomeScore?
 * ????????? MAX_SKILLS ???????
 */
export function addTacticalSkill(
  entry: Omit<TacticalSkillEntry, 'id' | 'uses'>,
): void {
  const skills = loadSkills()
  const existingMatch = findBestTagMatch(skills, entry.situationTags, TAG_MATCH_THRESHOLD)

  if (existingMatch) {
    // EMA ??
    existingMatch.outcomeScore =
      existingMatch.outcomeScore * (1 - EMA_NEW_WEIGHT) + entry.outcomeScore * EMA_NEW_WEIGHT
    existingMatch.uses += 1
    existingMatch.tickRecorded = entry.tickRecorded
    // ????????????????
    if (entry.outcomeScore > existingMatch.outcomeScore) {
      existingMatch.tacticSummary = entry.tacticSummary
      existingMatch.prototypeOrders = entry.prototypeOrders
    }
  } else {
    skills.push({ ...entry, id: randomUUID(), uses: 1 })

    // ?????????????? MAX_SKILLS ?
    if (skills.length > MAX_SKILLS) {
      skills.sort((a, b) => b.outcomeScore * Math.log1p(b.uses) - a.outcomeScore * Math.log1p(a.uses))
      skills.splice(MAX_SKILLS)
    }
  }

  saveSkills(skills)
}

/**
 * ???????????????????????? ? ???????
 */
export function retrieveTacticalSkills(
  situationTags: string[],
  topN: number = MAX_RETRIEVE,
): TacticalSkillEntry[] {
  const skills = loadSkills()
  if (skills.length === 0 || situationTags.length === 0) return []

  const scored = skills.map((skill) => {
    const overlap = computeTagOverlap(situationTags, skill.situationTags)
    return { skill, relevanceScore: overlap * skill.outcomeScore }
  })

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore)

  return scored
    .slice(0, topN)
    .filter((x) => x.relevanceScore > 0)
    .map((x) => x.skill)
}

export function getAllTacticalSkills(): TacticalSkillEntry[] {
  return loadSkills()
}

export function getTacticalSkillCount(): number {
  return loadSkills().length
}

export async function flushTacticalSkillPersist() {
  persist()
  await waitForPersistIdle()
}

// -- ?????? helper?? CommanderTools ? ReflectService ???------------
export function buildSituationTags(
  worldTick: number,
  factionId: string,
  luoyangOwner: string,
  pressureTier: 'low' | 'medium' | 'high',
  phaseLabel: string,
  extras: string[] = [],
): string[] {
  const phaseBucket = mapTickToPhase(worldTick)
  return [
    `phase:${phaseBucket}`,
    `luoyang:${luoyangOwner === factionId ? 'ours' : luoyangOwner === 'neutral' ? 'neutral' : 'opposing'}`,
    `pressure:${pressureTier}`,
    `scenario:${normalizePhaseLabel(phaseLabel)}`,
    ...extras,
  ]
}

// -- ???? ------------------------------------------------------------------

function loadSkills(): TacticalSkillEntry[] {
  if (_cache !== null) return _cache

  if (!existsSync(SKILL_LIBRARY_PATH)) {
    _cache = []
    return _cache
  }

  try {
    const raw = readFileSync(SKILL_LIBRARY_PATH, 'utf-8')
    _cache = JSON.parse(raw) as TacticalSkillEntry[]
  } catch {
    _cache = []
  }

  return _cache
}

function saveSkills(skills: TacticalSkillEntry[]): void {
  _cache = skills
  persist()
}

function persist() {
  persistDirty = true
  if (persistInFlight) {
    return
  }

  const epoch = persistEpoch
  persistInFlight = drainPersistQueue(epoch)
}

async function drainPersistQueue(epoch: number): Promise<void> {
  try {
    while (persistDirty) {
      persistDirty = false
      if (epoch !== persistEpoch) {
        return
      }

      const payload = JSON.stringify(_cache ?? [], null, 2)
      await mkdir(dirname(SKILL_LIBRARY_PATH), { recursive: true })
      await writeFile(SKILL_LIBRARY_PATH, payload, 'utf-8')
    }
  } catch {
    // ?????????????
  } finally {
    if (persistInFlight && epoch === persistEpoch) {
      persistInFlight = null
    }

    if (persistDirty && epoch === persistEpoch) {
      persist()
    }
  }
}

async function waitForPersistIdle() {
  while (persistInFlight) {
    await persistInFlight
  }
}

function computeTagOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const intersect = b.filter((t) => setA.has(t)).length
  return intersect / Math.max(a.length, b.length)
}

function findBestTagMatch(
  skills: TacticalSkillEntry[],
  tags: string[],
  threshold: number,
): TacticalSkillEntry | undefined {
  let best: TacticalSkillEntry | undefined
  let bestScore = 0

  for (const skill of skills) {
    const score = computeTagOverlap(tags, skill.situationTags)
    if (score >= threshold && score > bestScore) {
      bestScore = score
      best = skill
    }
  }

  return best
}

function mapTickToPhase(tick: number): string {
  if (tick <= 5) return 'early'
  if (tick <= 15) return 'mid'
  if (tick <= 30) return 'late'
  return 'endgame'
}

function normalizePhaseLabel(label: string): string {
  // ?????????? slug???????
  if (label.includes('??')) return 'expansion'
  if (label.includes('??')) return 'nation_found'
  if (label.includes('??')) return 'pass_capture'
  if (label.includes('??')) return 'luoyang_decisive'
  return label.toLowerCase().replace(/\s+/g, '_').slice(0, 20)
}
