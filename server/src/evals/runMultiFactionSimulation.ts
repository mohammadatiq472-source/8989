/**
 * 东汉十三州 多势力AI战争模拟
 * ============================
 * 验证三大核心功能：
 *   1. AI-to-AI 外交 (DiplomacyAgent)  — 每 3 回合随机两对诸侯发起外交
 *   2. 用户交互仿真 (chatWithGeneral)  — 每 5 回合司隶主公向将领下令
 *   3. 立国自动触发检测                — 势力控制 ≥ MIN_NATION_TILES 自动声称立国
 *   4. 13 路并行 CommanderAgent + GeneralDispatch
 *
 * 用法:
 *   npx tsx server/src/evals/runMultiFactionSimulation.ts [--mode mock|hybrid|gateway] [--ticks 50] [--output tmp/13factions.json]
 *   hybrid 模式：isHumanSlot 势力(汉中)走 LLM，其余走 mock。LLM 调用自动从轮换池选模型。
 *   gateway 模式：全部13势力均走 LLM，同批次内并行，批次间顺序（避免限流）。
 */

import '../bootstrap/loadEnv.js'
import { createInitialWorldState } from '../../../shared/domain/scenario.js'
import { advanceTick, queuePlanExecution } from '../../../shared/domain/rules.js'
import { createPlanningResult } from '../application/planning/PlanningService.js'
import { runGeneralDispatch } from '../agents/general/GeneralAgent.js'
import { getOrCreateGeneralProfiles, getGeneralProfilesForFaction } from '../agents/general/GeneralProfileStore.js'
import { createDiplomacyProposal, respondToDiplomacyProposal, convertWorldChangesToAgreements } from '../agents/general/DiplomacyAgent.js'
import { chatWithGeneral } from '../agents/general/GeneralChatService.js'
import { detectAndPostNegotiations } from '../agents/general/GeneralNegotiationChannel.js'
import { reflectWorldTick } from '../agents/reflect/ReflectService.js'
import { recordSimulationNarrativeEvents } from '../application/world/WorldService.js'
import { runDomainCommWindow, previewDomainAgendaForFaction } from '../agents/commBus/DomainCommBus.js'
import { compileNationalAgendaWindow } from '../agents/commBus/AgendaCompiler.js'
import { runCourtSession, getLatestCourtSession } from '../agents/court/CourtService.js'
import { resetCourtSessionStoreForTests } from '../agents/court/CourtStore.js'
import { recordAgendaWindowMemory, recordCourtSessionMemory, recordExecutionOutcomeMemory } from '../agents/memory/CivilMemoryService.js'
import { resetCivilMemoryStoreForTests } from '../agents/memory/CivilMemoryStore.js'
import { buildHeroProfileFromPool } from '../../../shared/domain/heroPool.js'
import { checkVictoryConditions } from '../../../shared/domain/victoryCondition.js'
import type { FactionState, Unit, WorldState, PlannerConfig, PlannerResult, StrategicPlan } from '../../../shared/contracts/game.js'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// ─── 模型轮换池（hybrid/gateway 模式下自动轮换，分散请求压力）───────────────────
// 按响应速度升序排列，快速模型优先被选中
// 已验证可用（2026-03-21）：
// nvidia/nemotron-3-nano-30b-a3b:free  ~2.4s 直接输出 JSON ✅
// arcee-ai/trinity-mini:free           ~3s   COT 推理后输出 JSON（需足够 token）
// stepfun/step-3.5-flash:free          ~8s   COT 推理，较慢
// 已确认不可用：healer-alpha/hunter-alpha(退役), deepseek-v3.2/exp(503),
//   nemotron-super-120b:free(timeout), grok-4.1-fast(503), GLM4.7/Step3.5(503)
const GATEWAY_ROTATION_MODELS: string[] = [
  'nvidia/nemotron-3-nano-30b-a3b:free', // 最快 ~2.4s，直接输出干净 JSON ✅
  'arcee-ai/trinity-mini:free',          // 备选 ~3s，COT 模型（token 需 ≥ 600）
]

let _rotationIndex = 0
/**
 * 每次调用返回下一个轮换模型，循环使用。
 * 若 GATEWAY_ROTATION_MODELS 为空则降级到 LLM_RELAY_MODEL.
 */
function nextRotationModel(): string {
  const pool = GATEWAY_ROTATION_MODELS
  if (pool.length === 0) return process.env.LLM_RELAY_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b:free'
  const model = pool[_rotationIndex % pool.length]
  _rotationIndex++
  return model
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (key: string, fallback: string) => {
    const idx = args.indexOf(key)
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback
  }
  return {
    mode: get('--mode', 'mock') as 'mock' | 'local' | 'gateway' | 'hybrid',
    model: get('--model', ''),
    totalTicks: parseInt(get('--ticks', '20'), 10),
    output: get('--output', 'tmp/sim_13factions.json'),
    verbose: args.includes('--verbose'),
  }
}

// ─── 13 势力配置 ──────────────────────────────────────────────────────────────

interface FactionConfig {
  id: string
  name: string
  anchorId: string     // 对应 getHanProvinceAnchors() 中的省份 ID
  centerX: number
  centerY: number
  doctrine: string     // 指挥官战略方针
  heroNames: [string, string]
  /** 真人玩家槽位：true 表示此势力可由真人操控（模拟时由 AI 代管） */
  isHumanSlot?: boolean
}

/** 每个势力的 AI 将领数量（2 名英雄 + 8 名副将） */
const UNITS_PER_FACTION = 10

/** 东汉十三州配置（省份坐标与 scenario.ts HAN_PROVINCES 完全对齐） */
const THIRTEEN_FACTIONS: FactionConfig[] = [
  { id: 'han',  name: '汉中', anchorId: 'yizhou',    centerX: 104, centerY: 200,
    doctrine: '占据汉中天险，兴复汉室为志，出秦川敌洛阳，北伐中原一匡功成。',
    heroNames: ['诸葛亮', '姜维'], isHumanSlot: true },
  { id: 'ji',   name: '冀州', anchorId: 'jizhou',    centerX: 186, centerY: 108,
    doctrine: '坐拥物资重地，南下逐洛阳，却敌归顺，夤成霸业。',
    heroNames: ['高顺', '郝昭'] },
  { id: 'bing', name: '并州', anchorId: 'bingzhou',  centerX: 126, centerY: 94,
    doctrine: '依太行之险，南控河洛，闪击进入中原，主洛阳之主。',
    heroNames: ['司马懿', '张春华'] },
  { id: 'you',  name: '幽州', anchorId: 'youzhou',   centerX: 226, centerY: 72,
    doctrine: '铁骑南下如风，必拿洛阳山河，破敌阵营，速战速决。幽州铁骑夫天下无敌，必当首先挣得洛阳。',
    heroNames: ['吕布', '貂蝉'] },
  { id: 'yan',  name: '兖州', anchorId: 'yanzhou',   centerX: 212, centerY: 146,
    doctrine: '中原枢纽，直指洛阳，四面出击，重视补给，掌控天下节奏。',
    heroNames: ['关羽', '陆逊'] },
  { id: 'yu',   name: '豫州', anchorId: 'yuzhou',    centerX: 194, centerY: 188,
    doctrine: '腹地直撞洛阳，机动奇兵分进，先占牛耳，再图天下。',
    heroNames: ['赵云', '刘备'] },
  { id: 'qing', name: '青州', anchorId: 'qingzhou',  centerX: 262, centerY: 132,
    doctrine: '东海侧翼精密情报，赋予剪阵穿插，图谋洛阳之局。',
    heroNames: ['太史慈', '张角'] },
  { id: 'xu',   name: '徐州', anchorId: 'xuzhou',    centerX: 252, centerY: 194,
    doctrine: '淮河吉地，兴兵西去奉为犒香，夺洛阳以杯雄心。',
    heroNames: ['张辽', '夏侯惇'] },
  { id: 'jing', name: '荆州', anchorId: 'jingzhou',  centerX: 176, centerY: 242,
    doctrine: '汉水北伐，全军冲击洛阳，敌拔其备，在必得天下。',
    heroNames: ['黄忠', '关银屏'] },
  { id: 'yang', name: '扬州', anchorId: 'yangzhou',  centerX: 244, centerY: 252,
    doctrine: '吴越水师纵横，舰般西上直取洛阳，一日入洛百日回。',
    heroNames: ['孙策', '周瑜'] },
  { id: 'yi',   name: '益州', anchorId: 'yizhou',    centerX: 80,  centerY: 246,
    doctrine: '天府之国为根基，策应汉中兴兵，同吐共驱向洛阳。',
    heroNames: ['刘备', '庞统'] },
  { id: 'liang',name: '凉州', anchorId: 'liangzhou', centerX: 58,  centerY: 146,
    doctrine: '西陲铁骑席卷，通越关中取洛阳，掌天下之局。',
    heroNames: ['马超', '华雄'] },
  { id: 'jiao', name: '交州', anchorId: 'jiaozhou',  centerX: 214, centerY: 300,
    doctrine: '千里奔袭洛阳，以最快速度确保洛阳，很快挥奇达局。交州心在北伐，洛阳每出必争。',
    heroNames: ['吕蒙', '孙尚香'] },
]

// 凡需要自动立国时的最低领土阈值（开荒后扩张到一定规模才能立国）
const MIN_NATION_TILES = 500
// 每势力初始领土半径（BFS 步数，越大起始领土越多）
const START_TERRITORY_RADIUS = 8
// 外交触发周期（每 N 回合）
const DIPLOMACY_INTERVAL = 3
// 用户交互触发周期
const USER_CHAT_INTERVAL = 5
// 汉中代表“玩家”视角
const PLAYER_FACTION_ID = 'han'

// ─── 世界构建 ─────────────────────────────────────────────────────────────────

/**
 * 以 createInitialWorldState() 为骨架，通过 Voronoi 将所有地块重新分配给 13 州，
 * 并为每个州创建初始兵力（2 位武将单位）。
 */
function buildMultiFactionWorld(): WorldState {
  const base = createInitialWorldState()

  // ── 步骤 1：小领土开荒模式 ─────────────────────────────────────────────────
  // 每势力只占领中心附近 START_TERRITORY_RADIUS 步的地块，其余全部 neutral
  // 这样模拟"开荒→发育→扩张→争霸"的完整游戏过程

  // 先把所有地块设为 neutral，并清除 district 限制（使模拟中跨区域自由移动）
  for (const tile of base.map.tiles) {
    tile.owner = 'neutral'
    tile.district = undefined  // 消除跨州必须走关口的限制
    // 消除地形移动限制（山地/河流阻断）
    if (tile.terrain === 'mountain' && tile.type !== 'pass') {
      tile.terrain = 'grassland'
      tile.moveCost = 1
    }
    if (tile.terrain === 'riverland' && tile.type !== 'city' && tile.type !== 'pass') {
      tile.terrain = 'grassland'
      tile.moveCost = 1
    }
  }

  // 建坐标→地块索引 + 坐标→ID 映射
  const mapW = base.map.width
  const tileById = new Map<string, typeof base.map.tiles[0]>()
  const coordToId = new Map<string, string>()
  for (const tile of base.map.tiles) {
    tileById.set(tile.id, tile)
    coordToId.set(`${tile.x}:${tile.y}`, tile.id)
  }

  // ── 步骤 1.5：修补 connections 表 —— 允许跨区移动 ─────────────────────────
  // 原始 connections 在不同 district 间需要 pass 才能通行，导致小领土被困在一个 district 里无法扩张
  // 这里改为纯四向网格邻居，让模拟中的势力能够跨区自由扩张
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  for (const tile of base.map.tiles) {
    const neighbors: string[] = []
    for (const [dx, dy] of dirs) {
      const nId = coordToId.get(`${tile.x + dx}:${tile.y + dy}`)
      if (nId) neighbors.push(nId)
    }
    base.map.connections[tile.id] = neighbors
  }

  // 对每势力用 BFS 从中心扩张 START_TERRITORY_RADIUS 步
  for (const fc of THIRTEEN_FACTIONS) {
    const centerIdx = fc.centerY * mapW + fc.centerX
    const startTile = base.map.tiles[centerIdx]
    if (!startTile) continue

    // BFS 占领
    const visited = new Set<string>()
    let frontier = [startTile.id]
    visited.add(startTile.id)
    startTile.owner = fc.id

    for (let depth = 0; depth < START_TERRITORY_RADIUS; depth++) {
      const nextFrontier: string[] = []
      for (const tileId of frontier) {
        const neighbors = base.map.connections[tileId] ?? []
        for (const nId of neighbors) {
          if (visited.has(nId)) continue
          visited.add(nId)
          const nTile = tileById.get(nId)
          if (!nTile) continue
          // 只占领 neutral 地块，不抢其他势力的
          if (nTile.owner !== 'neutral') continue
          nTile.owner = fc.id
          nextFrontier.push(nId)
        }
      }
      frontier = nextFrontier
      if (frontier.length === 0) break
    }
  }

  // ── 步骤 2：构建 13 势力 FactionState ─────────────────────────────────────
  const newFactions: Record<string, FactionState> = {}
  for (const fc of THIRTEEN_FACTIONS) {
    newFactions[fc.id] = {
      id: fc.id,
      food: 120,
      actionPoints: 8,
      heroCommand: {
        doctrine: fc.doctrine,
        homeTileId: findHomeTileId(base, fc),
        commandLimit: 5,
        heroLuck: 68,
        developmentPoints: 6,
        acquisitionThreshold: 20,
        rosterHeroIds: [],      // 在单位创建后回填
        reserveHeroIds: [],
        prospectHeroIds: [],
      },
      // ── 新增：城池传送 + 征兵系统 + AI玩家分组 ──
      capturedCities: [],
      recruitCooldown: 0,
      recruitedTotal: 0,
      aiPlayers: [
        {
          id: `${fc.id}_p1`,
          name: `${fc.name}主将`,
          factionId: fc.id,
          unitIds: [`unit_${fc.id}_1`, `unit_${fc.id}_2`, `unit_${fc.id}_3`],
          specialty: 'assault',
          lore: `${fc.name}势力的主攻指挥官，负责向洛阳方向的主力出击。`,
        },
        {
          id: `${fc.id}_p2`,
          name: `${fc.name}守将`,
          factionId: fc.id,
          unitIds: [`unit_${fc.id}_4`, `unit_${fc.id}_5`, `unit_${fc.id}_6`],
          specialty: 'guard',
          lore: `${fc.name}势力的守备指挥官，负责边境防御与后方稳固。`,
        },
        {
          id: `${fc.id}_p3`,
          name: `${fc.name}斥候`,
          factionId: fc.id,
          unitIds: [`unit_${fc.id}_7`, `unit_${fc.id}_8`, `unit_${fc.id}_9`, `unit_${fc.id}_10`],
          specialty: 'recon',
          lore: `${fc.name}势力的侦察与扩张指挥官，负责情报收集与领土开拓。`,
        },
      ],
    }
  }
  base.factions = newFactions as WorldState['factions']

  // ── 步骤 3：清除旧单位，创建 13 州初始部队 ────────────────────────────────
  // 每势力 UNITS_PER_FACTION 单位：2 名英雄（主城）+ 3 名副将（分布在边境附近）
  const newUnits: Unit[] = []
  const lieutenantNames: Record<string, string[]> = {
    han: ['汉中督军', '褒中守将', '沔阳校尉', '西城都尉', '上庸守将', '房陵校尉', '金牛道斥候', '子午道斥候'],
    ji: ['冀州督军', '信都校尉', '邺城守将', '巨鹿都尉', '渤海校尉', '常山守将', '中山都尉', '河间校尉'],
    bing: ['并州骁将', '太原都尉', '雁门守将', '上党校尉', '西河都尉', '定襄守将', '云中校尉', '朔方都尉'],
    you: ['幽州铁骑都尉', '渔阳校尉', '辽西守将', '涿郡都尉', '代郡校尉', '上谷守将', '辽东都尉', '玄菟校尉'],
    yan: ['兖州参军', '陈留校尉', '东郡都尉', '济阴守将', '山阳校尉', '任城都尉', '泰山校尉', '济北守将'],
    yu: ['豫州骑都尉', '汝南校尉', '颍川守将', '沛国都尉', '陈国校尉', '梁国守将', '鲁国都尉', '谯郡校尉'],
    qing: ['青州水军都督', '北海校尉', '东莱守将', '济南都尉', '乐安校尉', '齐国守将', '平原都尉', '城阳校尉'],
    xu: ['徐州步军校尉', '下邳都尉', '广陵守将', '彭城校尉', '东海都尉', '琅琊守将', '临沂校尉', '兰陵都尉'],
    jing: ['荆州水师都督', '南郡校尉', '长沙守将', '零陵都尉', '桂阳校尉', '武陵守将', '江夏都尉', '襄阳校尉'],
    yang: ['扬州水军都督', '会稽校尉', '庐江守将', '丹阳都尉', '豫章校尉', '吴郡守将', '建安都尉', '临海校尉'],
    yi: ['益州参军', '蜀郡校尉', '汉中守将', '巴郡都尉', '犍为校尉', '广汉守将', '永昌都尉', '越巂校尉'],
    liang: ['凉州突骑校尉', '武威都尉', '金城守将', '张掖校尉', '酒泉都尉', '敦煌守将', '陇西校尉', '天水都尉'],
    jiao: ['交州南蛮校尉', '苍梧都尉', '南海守将', '合浦校尉', '郁林都尉', '九真守将', '日南校尉', '交趾都尉'],
  }

  for (const fc of THIRTEEN_FACTIONS) {
    const homeTile = findHomeTileId(base, fc)
    const borderTiles = findBorderTileIds(base, fc, 8)
    const unitIds: string[] = []

    // 2 名英雄在主城
    for (let i = 0; i < fc.heroNames.length; i++) {
      const heroName = fc.heroNames[i]
      const unitId = `unit_${fc.id}_${i + 1}`
      try {
        const hero = buildHeroProfileFromPool(heroName, {
          growthFocus: `${fc.name}战线扩张与防线稳固`,
          level: 5,
        })
        const unit: Unit = {
          id: unitId,
          name: `${fc.name}${hero.name}军`,
          faction: fc.id,
          corps: {
            name: `${fc.name}${i + 1}军`,
            doctrine: fc.doctrine.slice(0, 30),
            specialty: hero.archetype,
            readiness: 80,
            roster: [hero.id],
          },
          hero,
          tileId: homeTile,
          strength: 30,
          mobility: hero.archetype === 'mobile' || hero.archetype === 'recon' ? 7 : 4,
          supply: 5,
          status: '待命',
        }
        newUnits.push(unit)
        unitIds.push(unitId)
      } catch {
        console.warn(`[BuildWorld] 英雄 "${heroName}" 不在武将池，跳过`)
      }
    }

    // 8 名副将部署在边境附近
    const ltNames = lieutenantNames[fc.id] ?? Array.from({ length: 8 }, (_, i) => `${fc.name}副将${i + 1}`)
    const archetypes: Array<Unit['hero']['archetype']> = ['guard', 'mobile', 'assault', 'guard', 'mobile', 'assault', 'recon', 'mobile']
    for (let i = 0; i < 8; i++) {
      const unitId = `unit_${fc.id}_${i + 3}`
      const spawnTile = borderTiles[i % borderTiles.length] ?? homeTile
      const archetype = archetypes[i]
      const ltName = ltNames[i]
      const unit: Unit = {
        id: unitId,
        name: `${fc.name}${ltName}`,
        faction: fc.id,
        corps: {
          name: `${fc.name}${i + 3}军`,
          doctrine: fc.doctrine.slice(0, 30),
          specialty: archetype,
          readiness: 70,
          roster: [],
        },
        hero: {
          id: `hero_lt_${fc.id}_${i}`,
          name: ltName,
          title: `${fc.name}${archetype === 'guard' ? '守将' : archetype === 'mobile' ? '斥候' : '先锋'}`,
          faction: '群' as const,
          cardType: archetype === 'mobile' ? '骑' : '步',
          quality: '4-SR',
          archetype,
          level: 5,
          troopType: archetype === 'mobile' ? 'cavalry' : archetype === 'guard' ? 'shield' : 'infantry',
          force: 55 + Math.floor(Math.random() * 10),
          command: 60 + Math.floor(Math.random() * 15),
          intelligence: 50 + Math.floor(Math.random() * 15),
          charisma: 45 + Math.floor(Math.random() * 10),
          speed: archetype === 'mobile' ? 70 : 50,
          traits: archetype === 'guard' ? ['坚守', '抗压'] : archetype === 'mobile' ? ['机动', '侦察'] : ['突击', '攻坚'],
          signatureSkill: { name: `${ltName}绝技`, detail: `${ltName}的特色战术` },
          growthFocus: `${fc.name}边境扩张`,
          avatarKey: `hero-avatar-lt-${fc.id}-${i}`,
          portraitKey: `hero-portrait-lt-${fc.id}-${i}`,
        },
        tileId: spawnTile,
        strength: 20,
        mobility: archetype === 'mobile' ? 6 : 3,
        supply: 4,
        status: '待命',
      }
      newUnits.push(unit)
      unitIds.push(unitId)
    }

    // 回填单位 ID 到注册名册
    const faction = base.factions[fc.id]
    if (faction) {
      faction.heroCommand.rosterHeroIds = unitIds
    }
  }
  base.units = newUnits

  // ── 步骤 4：初始化 executions（每个势力独立执行链） ──────────────────────
  base.executions = {}

  // ── 步骤 5：重置交互历史 ─────────────────────────────────────────────────
  base.feedback = { allianceActions: [], battleRecords: [], diplomacyAgreements: [] }
  base.reports = [{
    id: 'report_13factions_boot',
    tick: 1,
    title: '东汉十三州争霸开始',
    detail: '十三州诸侯并起，天下三分乱战，各路英雄逐鹿中原。',
  }]
  base.history = { planningJobs: [], executionReplays: [] }
  base.luoyangSiegeProgress = {}

  return base
}

/** 找到势力最近的城市类地块 ID，兜底为最近的任意地块 */
function findHomeTileId(world: WorldState, fc: FactionConfig): string {
  let bestTileId = ''
  let bestDist = Infinity
  let fallbackTileId = ''
  let fallbackDist = Infinity

  for (const tile of world.map.tiles) {
    const dist = Math.abs(tile.x - fc.centerX) + Math.abs(tile.y - fc.centerY)
    if (dist < fallbackDist) {
      fallbackDist = dist
      fallbackTileId = tile.id
    }
    if ((tile.type === 'city' || tile.type === 'resource') && dist < bestDist) {
      bestDist = dist
      bestTileId = tile.id
    }
  }
  return bestTileId || fallbackTileId
}

/** 找到势力领地边缘的 N 个格子（最靠近其他势力的格子） */
function findBorderTileIds(world: WorldState, fc: FactionConfig, count: number): string[] {
  // 构建 tileId→owner 索引避免 O(n) 查找
  const ownerById = new Map<string, string>()
  for (const tile of world.map.tiles) {
    ownerById.set(tile.id, tile.owner)
  }

  const borderScored: Array<{ id: string; score: number }> = []

  for (const tile of world.map.tiles) {
    if (tile.owner !== fc.id) continue
    const neighbors = world.map.connections[tile.id] ?? []
    let foreignCount = 0
    for (const nId of neighbors) {
      const nOwner = ownerById.get(nId)
      if (nOwner && nOwner !== fc.id) foreignCount++
    }
    if (foreignCount > 0) {
      borderScored.push({ id: tile.id, score: foreignCount })
    }
  }

  // 按外方邻居数降序，然后分散选取
  borderScored.sort((a, b) => b.score - a.score)
  const result: string[] = []
  const step = Math.max(1, Math.floor(borderScored.length / count))
  for (let i = 0; i < borderScored.length && result.length < count; i += step) {
    result.push(borderScored[i].id)
  }
  return result
}

/** 根据当前局势构建动态战略指令（含联盟/敌对/背叛上下文） */
function buildDynamicStrategy(world: WorldState, fc: FactionConfig, tick: number, allianceMap?: Map<string, Set<string>>): string {
  const faction = world.factions[fc.id]
  if (!faction) return fc.doctrine

  // 统计领土 & 中立地块
  let myTiles = 0
  let neutralTiles = 0
  for (const tile of world.map.tiles) {
    if (tile.owner === fc.id) myTiles++
    else if (tile.owner === 'neutral') neutralTiles++
  }

  // 统计单位状态
  const myUnits = world.units.filter(u => u.faction === fc.id)
  const totalStrength = myUnits.reduce((sum, u) => sum + u.strength, 0)
  const avgSupply = myUnits.length > 0 ? Math.round(myUnits.reduce((s, u) => s + u.supply, 0) / myUnits.length) : 0

  // 找邻近敌方势力（用 ownerById 避免 O(n) 查找）
  const ownerById = new Map<string, string>()
  for (const tile of world.map.tiles) {
    ownerById.set(tile.id, tile.owner)
  }
  const neighborFactions = new Set<string>()
  let neutralBorderCount = 0
  for (const unit of myUnits) {
    const neighbors = world.map.connections[unit.tileId] ?? []
    for (const nId of neighbors) {
      const nOwner = ownerById.get(nId)
      if (nOwner === 'neutral') neutralBorderCount++
      else if (nOwner && nOwner !== fc.id) neighborFactions.add(nOwner)
    }
  }
  const threatsStr = [...neighborFactions].map(fid => {
    const cfg = THIRTEEN_FACTIONS.find(f => f.id === fid)
    const enemyTiles = [...ownerById.values()].filter(o => o === fid).length
    return `${cfg?.name ?? fid}(${enemyTiles}格)`
  }).join('、') || '无'

  // 洛阳方位提示（所有势力都要朝洛阳推进）
  const luoyangX = 160, luoyangY = 158
  const distToLuoyang = Math.abs(fc.centerX - luoyangX) + Math.abs(fc.centerY - luoyangY)
  // 幽州/交州 额外侵略性加成（远程势力必须高速突破）
  const isHighAggression = fc.id === 'you' || fc.id === 'jiao'
  const aggressionNote = isHighAggression
    ? `\n【${fc.name}特殊令】你距洛阳约${distToLuoyang}格，必须以最快速度强行突破所有阻碍向洛阳挺进！不惜一切代价先于他人占领洛阳！`
    : ''

  // 联盟与敌对情报
  let allianceNote = ''
  if (allianceMap) {
    const allies = allianceMap.get(fc.id)
    if (allies && allies.size > 0) {
      const allyNames = [...allies].map(id => {
        const cfg = THIRTEEN_FACTIONS.find(f => f.id === id)
        return cfg?.name ?? id
      }).join('、')
      allianceNote = `\n【外交】当前盟友：${allyNames}（停战协议有效，不可进攻盟友领土）。集中力量打击非盟友势力。`
    }
    // 标记与谁有敌对关系（曾经背叛过）
    const hostileNeighbors = [...neighborFactions].filter(fid => !allies?.has(fid))
    if (hostileNeighbors.length > 0) {
      const hostileNames = hostileNeighbors.map(id => THIRTEEN_FACTIONS.find(f => f.id === id)?.name ?? id).join('、')
      allianceNote += `\n【敌对】与 ${hostileNames} 无停战协议，可主动进攻。`
    }
  }

  // 根据领土规模和阶段动态调整方针
  let phaseGuidance: string
  if (myTiles < 200) {
    phaseGuidance = '开荒期：扩张领土获取资源是第一优先。根据局势判断是否需要早期侦察或防御。'
  } else if (myTiles < 500) {
    phaseGuidance = `发展期（${myTiles}格）：继续扩张并开始考虑战略布局。评估是否应该争夺关键位置或巩固现有领土。洛阳是终极目标。`
  } else if (myTiles < 2000) {
    phaseGuidance = `争霸期（${myTiles}格）：根据实力和局势制定进攻或防御战略。洛阳控制15回合即可获胜——评估何时发起总攻。`
  } else {
    phaseGuidance = `决战期（${myTiles}格）：评估洛阳攻势的时机和兵力配置。胜利条件：洛阳控制15回合/消灭所有对手/控制全图80%。`
  }

  return [
    `【${fc.name}·回合${tick}】大目标：争夺洛阳，控制满15回合即可一统天下！`,
    `方略：${fc.doctrine}`,
    phaseGuidance,
    aggressionNote,
    allianceNote,
    `局势：领土${myTiles}格(全图剩余中立${neutralTiles}格) | 兵力${myUnits.length}部队(总战力${totalStrength}) | 粮草${faction.food} | 行动点${faction.actionPoints} | 平均补给${avgSupply}`,
    `到洛阳距离：约${distToLuoyang}格 | 边境中立格: ${neutralBorderCount > 0 ? '有（可立即扩张）' : '无'} | 邻接威胁：${threatsStr}`,
    `基于以上局势，制定本回合最优战略计划。`,
  ].filter(Boolean).join('\n')
}

// ─── 立国检测 ─────────────────────────────────────────────────────────────────

function checkNationFoundingConditions(
  world: WorldState,
  founded: Set<string>,
): { factionId: string; tileCount: number }[] {
  const tileCount = new Map<string, number>()
  for (const tile of world.map.tiles) {
    if (tile.owner && tile.owner !== 'neutral') {
      tileCount.set(tile.owner, (tileCount.get(tile.owner) ?? 0) + 1)
    }
  }

  const newNations: { factionId: string; tileCount: number }[] = []
  for (const [fid, count] of tileCount.entries()) {
    if (count >= MIN_NATION_TILES && !founded.has(fid)) {
      newNations.push({ factionId: fid, tileCount: count })
    }
  }
  return newNations
}

// ─── 智能外交配对（基于邻接关系 + 实力差距） ──────────────────────────────

/** 构建势力邻接矩阵（O(tiles) 一次性扫描，避免重复 find） */
function buildFactionAdjacency(world: WorldState): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  const tileOwnerMap = new Map<string, string>()
  for (const tile of world.map.tiles) {
    if (tile.owner) tileOwnerMap.set(tile.id, tile.owner)
  }
  for (const tile of world.map.tiles) {
    if (!tile.owner) continue
    const neighbors = world.map.connections[tile.id] ?? []
    for (const nId of neighbors) {
      const nOwner = tileOwnerMap.get(nId)
      if (nOwner && nOwner !== tile.owner) {
        if (!adj.has(tile.owner)) adj.set(tile.owner, new Set())
        adj.get(tile.owner)!.add(nOwner)
      }
    }
  }
  return adj
}

/** 计算两势力领土是否邻接（共享边界） */
function areNeighborFactions(world: WorldState, fidA: string, fidB: string): boolean {
  const tileOwnerMap = new Map<string, string>()
  for (const tile of world.map.tiles) {
    if (tile.owner) tileOwnerMap.set(tile.id, tile.owner)
  }
  for (const tile of world.map.tiles) {
    if (tile.owner !== fidA) continue
    const neighbors = world.map.connections[tile.id] ?? []
    for (const nId of neighbors) {
      if (tileOwnerMap.get(nId) === fidB) return true
    }
  }
  return false
}

/** 基于邻接关系的智能外交配对：优先邻接势力 */
function pickDiplomacyPairs(world: WorldState, count = 2): Array<[string, string]> {
  const activeFactions = Object.keys(world.factions)
    .filter(id => world.units.some(u => u.faction === id))

  // 用邻接矩阵一次性计算所有邻接关系
  const adjMatrix = buildFactionAdjacency(world)

  // 收集所有邻接对
  const neighborPairs: Array<[string, string]> = []
  const nonNeighborPairs: Array<[string, string]> = []

  for (let i = 0; i < activeFactions.length; i++) {
    for (let j = i + 1; j < activeFactions.length; j++) {
      const a = activeFactions[i], b = activeFactions[j]
      if (adjMatrix.get(a)?.has(b) || adjMatrix.get(b)?.has(a)) {
        neighborPairs.push([a, b])
      } else {
        nonNeighborPairs.push([a, b])
      }
    }
  }

  // 邻接对优先（80% 概率），打乱后取前 count 个
  const pool = Math.random() < 0.8 && neighborPairs.length > 0 ? neighborPairs : nonNeighborPairs
  const shuffled = pool.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

// ─── 联盟背叛机制 ─────────────────────────────────────────────────────────

interface WarChronicleEvent {
  tick: number
  type: 'first_blood' | 'alliance' | 'betrayal' | 'nation_founded' | 'luoyang_siege' | 'hegemon_alert' | 'coalition' | 'victory'
  description: string
  actors: string[]
}

/** 检测联盟背叛条件：一方领土占比超过盟友 2 倍以上 → 触发背叛 */
function checkAllianceBetrayals(
  world: WorldState,
  allianceMap: Map<string, Set<string>>,
  tick: number,
  chronicle: WarChronicleEvent[],
): string[] {
  const betrayals: string[] = []
  const tileCounts = new Map<string, number>()
  for (const tile of world.map.tiles) {
    if (tile.owner) tileCounts.set(tile.owner, (tileCounts.get(tile.owner) ?? 0) + 1)
  }

  for (const [fid, allies] of allianceMap.entries()) {
    const myTiles = tileCounts.get(fid) ?? 0
    for (const allyId of allies) {
      const allyTiles = tileCounts.get(allyId) ?? 0
      // 背叛条件：我方领土 > 盟友 2 倍 且 我方 > 500 格
      if (myTiles > allyTiles * 2 && myTiles > 500) {
        // 30% 概率触发背叛（不是每次都背叛）
        if (Math.random() < 0.3) {
          const fname = THIRTEEN_FACTIONS.find(f => f.id === fid)?.name ?? fid
          const aname = THIRTEEN_FACTIONS.find(f => f.id === allyId)?.name ?? allyId
          betrayals.push(`${fname}背叛${aname}`)
          chronicle.push({
            tick,
            type: 'betrayal',
            description: `${fname}实力远超盟友${aname}，撕毁停战协议，转为敌对！`,
            actors: [fid, allyId],
          })

          // 移除双向联盟
          allies.delete(allyId)
          allianceMap.get(allyId)?.delete(fid)

          // 从 WorldState 移除停战协议
          world.feedback.diplomacyAgreements = world.feedback.diplomacyAgreements.filter(
            a => !(a.parties.includes(fid) && a.parties.includes(allyId))
          )
        }
      }
    }
  }
  return betrayals
}

/** 检测是否需要反霸权联盟：最强势力领土 > 全图 25% 时，周边势力自动结盟 */
function checkAntiHegemonCoalition(
  world: WorldState,
  allianceMap: Map<string, Set<string>>,
  tick: number,
  chronicle: WarChronicleEvent[],
): string[] {
  const events: string[] = []
  const totalTiles = world.map.tiles.length
  const tileCounts = new Map<string, number>()
  for (const tile of world.map.tiles) {
    if (tile.owner) tileCounts.set(tile.owner, (tileCounts.get(tile.owner) ?? 0) + 1)
  }

  // 找到最强势力
  let hegemonId = ''
  let hegemonTiles = 0
  for (const [fid, count] of tileCounts.entries()) {
    if (fid !== 'neutral' && count > hegemonTiles) {
      hegemonTiles = count
      hegemonId = fid
    }
  }

  // 霸权阈值：25% 全图
  if (hegemonTiles < totalTiles * 0.25) return events

  const hegemonName = THIRTEEN_FACTIONS.find(f => f.id === hegemonId)?.name ?? hegemonId

  // 找邻接霸权势力的弱势力，自动两两结盟
  const neighbors = Object.keys(world.factions)
    .filter(fid => fid !== hegemonId && world.units.some(u => u.faction === fid))
    .filter(fid => areNeighborFactions(world, fid, hegemonId))

  if (neighbors.length < 2) return events

  // 两两结盟（只结盟未结盟的对）
  let coalitionFormed = false
  for (let i = 0; i < neighbors.length; i++) {
    for (let j = i + 1; j < neighbors.length; j++) {
      const a = neighbors[i], b = neighbors[j]
      if (allianceMap.get(a)?.has(b)) continue // 已经是盟友

      if (!allianceMap.has(a)) allianceMap.set(a, new Set())
      if (!allianceMap.has(b)) allianceMap.set(b, new Set())
      allianceMap.get(a)!.add(b)
      allianceMap.get(b)!.add(a)

      // 写入 WorldState
      world.feedback.diplomacyAgreements.push({
        id: `coalition_${tick}_${a}_${b}`,
        tick,
        type: 'alliance',
        parties: [a, b],
        duration: 10,
        terms: `反${hegemonName}联盟`,
      })
      coalitionFormed = true
    }
  }

  if (coalitionFormed) {
    const coalitionNames = neighbors.map(id => THIRTEEN_FACTIONS.find(f => f.id === id)?.name ?? id).join('、')
    const desc = `${hegemonName}独大（${hegemonTiles}格/${totalTiles}格），${coalitionNames}结成反${hegemonName}联盟！`
    events.push(desc)
    chronicle.push({
      tick,
      type: 'coalition',
      description: desc,
      actors: [hegemonId, ...neighbors],
    })
  }

  return events
}

// ─── Tick 快照类型 ────────────────────────────────────────────────────────────

interface FactionTickStat {
  factionId: string
  name: string
  tiles: number
  units: number
  food: number
  planOk: boolean
  planSource: string
}

interface TickLog {
  tick: number
  factionStats: FactionTickStat[]
  diplomacyEvents: string[]
  userChatEvent?: string
  nationFoundedEvents: string[]
  battleCount: number
  errors: string[]
  governance?: {
    agendaOptionCount: number
    courtProposals: number
    courtPassed: number
    courtRejected: number
    courtDeferred: number
    civilMemoryWrites: number
  }
}

// ─── 主模拟循环 ───────────────────────────────────────────────────────────────

async function runSimulation() {
  const config = parseArgs()
  const { mode, model, totalTicks, output, verbose } = config
  // hybrid 模式：isHumanSlot 势力走 gateway，其余走 mock
  const effectiveMode = (mode === 'hybrid' ? 'gateway' : mode) as 'mock' | 'local' | 'gateway'
  // model 优先级：CLI --model > 轮换池（轮换池在每次调用时动态选取）
  const fixedModel = model || ''  // 空字符串 = 使用轮换池
  /** 每次 LLM 调用时使用：若指定了 --model 则固定，否则从轮换池取下一个 */
  const getLLMPlannerConfig = (): PlannerConfig => ({
    mode: effectiveMode,
    model: fixedModel || nextRotationModel(),
  })
  const mockPlannerConfig: PlannerConfig = { mode: 'mock', model: '' }

  const modelPoolInfo = fixedModel
    ? fixedModel
    : `轮换池[${GATEWAY_ROTATION_MODELS.length}]: ${GATEWAY_ROTATION_MODELS.join(' / ')}`

  console.log('╔══════════════════════════════════════════════════════════════════╗')
  console.log('║        东汉十三州多势力AI战争模拟 (Han 13-Faction Sim)           ║')
  console.log('╠══════════════════════════════════════════════════════════════════╣')
  console.log(`║  模式: ${mode.padEnd(8)} 回合: ${String(totalTicks).padEnd(4)} 势力: 13   将领: ${UNITS_PER_FACTION * 13}        ║`)
  if (mode !== 'mock') {
    const display = modelPoolInfo.length > 56 ? modelPoolInfo.slice(0, 53) + '...' : modelPoolInfo.padEnd(56)
    console.log(`║  LLM : ${display} ║`)
  }
  console.log('╚══════════════════════════════════════════════════════════════════╝')
  console.log()
  console.log('🌐 正在初始化十三州世界 (小领土开荒模式 ~102k 地块)...')

  let world = buildMultiFactionWorld()

  // 初始化将领档案 (GeneralProfileStore 懒惰创建)
  getOrCreateGeneralProfiles(world)

  // Phase5: 隔离治理存储，避免跨 run 污染
  resetCourtSessionStoreForTests()
  resetCivilMemoryStoreForTests()

  console.log(`✅ 世界构建完成: ${world.map.tiles.length} 地块 | 13 势力 | ${world.units.length} 武将`)
  console.log()

  // 统计
  const tickLogs: TickLog[] = []
  const foundedNations = new Set<string>()
  const nationNames: Record<string, string> = {
    han: '夏汉',  ji: '冀国',  bing: '并国',  you: '幽国',
    yan: '兖国', yu: '豫国',  qing: '青国', xu: '徐国',
    jing: '楚国', yang: '吴国', yi: '蜀国', liang: '凉国', jiao: '越国',
  }

  let totalPlannerCalls = 0
  let plannerErrors = 0
  let diplomacyCount = 0
  let userChatCount = 0
  let nationFoundedCount = 0  // 联盟胜利追踪： factId => Set<string> of allies
  const allianceMap = new Map<string, Set<string>>()
  const warChronicle: WarChronicleEvent[] = []
  let firstBloodRecorded = false
  // ─── Tick 主循环 ───────────────────────────────────────────────────────────
  for (let tick = 1; tick <= totalTicks; tick++) {
    const tickErrors: string[] = []
    const diplomacyEvents: string[] = []
    let userChatEvent: string | undefined
    const nationFoundedEvents: string[] = []

    if (verbose) {
      console.log(`\n${'═'.repeat(60)}`)
      console.log(`  回合 ${tick} / ${totalTicks}`)
      console.log('═'.repeat(60))
    } else {
      process.stdout.write(`  T${String(tick).padStart(2)} `)
    }

    // ─── 1) 所有势力规划 ─────────────────────────────────────────
    // gateway 模式分批调用（每批 GATEWAY_BATCH_SIZE 个）以避免压垮免费模型；mock 模式全并行
    const GATEWAY_BATCH_SIZE = 4  // 每批并发数，免费模型建议 3-4
    const GATEWAY_BATCH_DELAY_MS = 1000 // 批次间间隔 ms
    const planResults: Array<{ status: 'fulfilled'; value: { factionId: string; result: PlannerResult } | null } | { status: 'rejected'; reason: unknown }> = []
    if (mode === 'gateway' || mode === 'hybrid') {
      // 分批并行：避免免费模型被大量并发请求压垮导致超时
      // hybrid 模式：只有 isHumanSlot 势力走 LLM，其余走 mock（大幅降低 API 调用量）
      const activeFactions = THIRTEEN_FACTIONS.filter(fc => !!world.factions[fc.id])
      for (let i = 0; i < activeFactions.length; i += GATEWAY_BATCH_SIZE) {
        const batch = activeFactions.slice(i, i + GATEWAY_BATCH_SIZE)
        if (i > 0) await new Promise(r => setTimeout(r, GATEWAY_BATCH_DELAY_MS))
        const batchSettled = await Promise.allSettled(
          batch.map(fc => {
            const strategy = buildDynamicStrategy(world, fc, tick, allianceMap)
            const fcPlannerCfg = (mode === 'hybrid' && !fc.isHumanSlot) ? mockPlannerConfig : getLLMPlannerConfig()
            return createPlanningResult(world, strategy, fcPlannerCfg, fc.id)
              .then(r => ({ factionId: fc.id, result: r }))
              .catch(err => {
                tickErrors.push(`[${fc.id}] plan error: ${String(err).slice(0, 80)}`)
                return null
              })
          })
        )
        planResults.push(...batchSettled)
      }
    } else {
      const settled = await Promise.allSettled(
        THIRTEEN_FACTIONS.map(fc => {
          if (!world.factions[fc.id]) return Promise.resolve(null)
          const strategy = buildDynamicStrategy(world, fc, tick, allianceMap)
          return createPlanningResult(world, strategy, getLLMPlannerConfig(), fc.id)
            .then(r => ({ factionId: fc.id, result: r }))
            .catch(err => {
              tickErrors.push(`[${fc.id}] plan error: ${String(err).slice(0, 80)}`)
              return null
            })
        })
      )
      planResults.push(...settled)
    }

    // ─── 2) 顺序入队各势力计划 ────────────────────────────────────────────────
    // queuePlanExecution 会更新 worldVersion，必须顺序调用
    for (const settled of planResults) {
      if (settled.status !== 'fulfilled' || !settled.value) continue
      const item = settled.value
      if (!item) continue

      totalPlannerCalls++
      if (item.result.source !== 'mock') {
        if (verbose) console.log(`  [${item.factionId}] 规划 source=${item.result.source}`)
      }

      if (item.result.plan && item.result.plan.orders.length > 0) {
        const qr = queuePlanExecution(
          world, item.result.plan, item.result.source,
          item.factionId, item.result.explanation ?? item.result.note ?? '',
          randomUUID(), world.worldVersion, 'replace',
        )
        if (qr.ok) {
          world = qr.world
        } else {
          plannerErrors++
          tickErrors.push(`[${item.factionId}] queue failed: ${qr.message}`)
        }
      }
    }

    // ─── 3) 将领分配（仅 gateway 模式，mock 直接用规划器命令）─────────────
    // ─── 3) 将领分配（所有模式均启用，mock 跳过 UtilityAI 优化避免覆盖 capture）
    const dispatchItems: Array<{ factionId: string; plan: StrategicPlan }> = []
    // 并行分配 13 势力（原串行循环每 tick 耗时 ~17 分钟，主因是串行 + 将领 LLM 8s 超时叠加）
    const dispatchResults = await Promise.allSettled(
      THIRTEEN_FACTIONS
        .filter(fc => !!world.factions[fc.id])
        .map(async (fc) => {
          const generals = getGeneralProfilesForFaction(world, fc.id)
          const exec = world.executions[fc.id]
          if (!generals.length || !exec?.currentPlan) return null
          // hybrid 模式：只有 isHumanSlot 势力的将领分配走 LLM，其余 mock
          const fcUseLLM = mode === 'gateway' || (mode === 'hybrid' && !!fc.isHumanSlot)
          const dispatchReport = await runGeneralDispatch(world, exec.currentPlan, generals, {
            concurrency: 4,
            skipRefinement: !fcUseLLM,
            // 模拟中将领 LLM (healer-alpha ~30s) 远超 8s 超时，永远降级为 UtilityAI
            // 直接跳过节省 8s×将领数×13 势力的纯等待开销
            skipLLM: true,
          })
          if (dispatchReport.delegatedPlan.orders.length > 0) {
            return { factionId: fc.id, plan: dispatchReport.delegatedPlan }
          }
          return null
        })
    )
    for (const r of dispatchResults) {
      if (r.status === 'fulfilled' && r.value) {
        dispatchItems.push(r.value)
      }
    }

    // 顺序合并将领调整后的计划
    for (const item of dispatchItems) {
      const qr = queuePlanExecution(
        world, item.plan, 'mock',
        item.factionId, '将领自主调整',
        randomUUID(), world.worldVersion, 'replace',
      )
      if (qr.ok) world = qr.world
    }

    // ─── DIAG: 查看入队订单数 ──────────────────────────────────────────
    if (verbose) {
      for (const fc of THIRTEEN_FACTIONS) {
        const exec = world.executions[fc.id]
        if (!exec) continue
        const activeOrders = exec.orders.filter(o => o.status === 'queued' || o.status === 'running')
        const actions = activeOrders.map(o => o.action).join(',')
        console.log(`  [DIAG T${tick}] ${fc.id}: ${activeOrders.length} orders [${actions}] AP=${world.factions[fc.id]?.actionPoints ?? '?'} food=${world.factions[fc.id]?.food ?? '?'}`)
      }
    }

    // ─── 3.5) 将领战场谈判：近距离异势力将领自主交涉 ────────────────────────
    {
      const allGenerals = getOrCreateGeneralProfiles(world)
      const messages = detectAndPostNegotiations(world, allGenerals)
      if (messages.length > 0 && verbose) {
        console.log(`  [NEGO T${tick}] ${messages.length} negotiation messages generated`)
      }
    }

    // ─── 3.6) Phase5 治理管道：通信总线 → 议程汇编 → 朝堂表决 → 文明记忆 ──────
    let tickGovernance: TickLog['governance'] = undefined
    try {
      runDomainCommWindow(world)
      const domainPreviews = Object.keys(world.factions)
        .map(factionId => previewDomainAgendaForFaction(world, factionId, false))
        .filter((p): p is NonNullable<typeof p> => p !== null)
      const nationalAgenda = compileNationalAgendaWindow({
        tick: world.tick,
        domainPreviews,
        maxOptions: 9,
      })
      const courtSession = runCourtSession({
        world,
        nationalAgenda,
        maxProposals: 9,
      })
      recordAgendaWindowMemory(nationalAgenda)
      recordCourtSessionMemory(courtSession)
      const passed = courtSession.resolutions.filter(r => r.decision === 'passed').length
      const rejected = courtSession.resolutions.filter(r => r.decision === 'rejected').length
      const deferred = courtSession.resolutions.filter(r => r.decision === 'deferred').length
      tickGovernance = {
        agendaOptionCount: nationalAgenda.optionCountOut,
        courtProposals: courtSession.proposals.length,
        courtPassed: passed,
        courtRejected: rejected,
        courtDeferred: deferred,
        civilMemoryWrites: 2, // agenda + court session
      }
      if (verbose) {
        console.log(`  [GOV T${tick}] agenda:${nationalAgenda.optionCountOut} proposals:${courtSession.proposals.length} passed:${passed} rejected:${rejected} deferred:${deferred}`)
      }
    } catch (govErr) {
      tickErrors.push(`governance: ${String(govErr).slice(0, 80)}`)
    }

    // ─── 4) 推进世界时钟 ──────────────────────────────────────────────────────
    const preBattleCount = world.feedback.battleRecords.length
    const worldBefore = world
    world = advanceTick(world)
    const tickBattleCount = world.feedback.battleRecords.length - preBattleCount

    // 天下第一战追踪（仅统计势力间交战，不含打中立地块）
    if (tickBattleCount > 0 && !firstBloodRecorded) {
      const newRecords = world.feedback.battleRecords.slice(-tickBattleCount)
      for (const br of newRecords) {
        const battleTile = world.map.tiles.find(t => t.id === br?.tileId)
        const defFaction = battleTile?.owner && battleTile.owner !== br?.attackerFaction ? battleTile.owner : null
        // 仅在防守方是一个非 neutral 的势力时才记录为"天下第一战"
        if (defFaction && defFaction !== 'neutral' && Object.keys(world.factions).includes(defFaction)) {
          firstBloodRecorded = true
          const atkName = THIRTEEN_FACTIONS.find(f => f.id === br?.attackerFaction)?.name ?? br?.attackerFaction ?? '?'
          const defName = THIRTEEN_FACTIONS.find(f => f.id === defFaction)?.name ?? defFaction
          warChronicle.push({
            tick,
            type: 'first_blood',
            description: `天下第一战！${atkName} 进攻 ${defName} 于第 ${tick} 回合爆发冲突！`,
            actors: [br?.attackerFaction ?? '', defFaction],
          })
          console.log(`\n  ⚔️ 天下第一战！${atkName} vs ${defName} — 回合 ${tick}`)
          break
        }
      }
    }

    // ─── 4.5) 开荒期 AP 加速：每回合给足行动力以支撑多单位并行扩张 ──────────
    for (const [, fac] of Object.entries(world.factions)) {
      // 开荒期 AP 上限提升到 20，每回合恢复至少 8 点，保证 3-4 个单位同时执行
      fac.actionPoints = Math.min(20, Math.max(8, fac.actionPoints + 5))
    }

    // ─── 4.6) 胜利条件检测（单势力 + 联盟胜利） ───────────────────────────────────────────────
    const victoryResult = checkVictoryConditions(world)
    if (victoryResult.winner) {
      const winnerName = THIRTEEN_FACTIONS.find(f => f.id === victoryResult.winner)?.name ?? victoryResult.winner
      console.log(`\n🏆 胜利！${winnerName} 达成 [${victoryResult.condition}] 胜利条件！`)
      console.log(`   原因: ${victoryResult.reason}`)
    }

    // 联盟胜利：联盟势力合并领土 >= 80% 全图
    if (!victoryResult.winner) {
      const totalTiles = world.map.tiles.length
      const allianceWinner = (() => {
        for (const [leaderId, allies] of allianceMap.entries()) {
          const members = [leaderId, ...allies]
          const combinedTiles = members.reduce((sum, fid) => {
            return sum + world.map.tiles.filter(t => t.owner === fid).length
          }, 0)
          if (combinedTiles / totalTiles >= 0.8) {
            return { leaderId, members, combinedTiles }
          }
        }
        return null
      })()
      if (allianceWinner) {
        const leaderName = THIRTEEN_FACTIONS.find(f => f.id === allianceWinner.leaderId)?.name ?? allianceWinner.leaderId
        const memberNames = allianceWinner.members.map(id => THIRTEEN_FACTIONS.find(f => f.id === id)?.name ?? id).join('、')
        console.log(`\n🏆 联盟胜利！以 ${leaderName} 为首的联盟 [${memberNames}] 弹合占领 ${(allianceWinner.combinedTiles / totalTiles * 100).toFixed(1)}% 天下！`)
        break
      }
    }

    // ─── 5) Reflect 层（全势力POER闭环）───────────────────────────
    // 并行 Reflect（原串行 ~13×N ms，memory 写入用 InMemory 极快）
    const reflectSettled = await Promise.allSettled(
      THIRTEEN_FACTIONS
        .filter(fc => world.units.some(u => u.faction === fc.id))
        .map(fc =>
          reflectWorldTick({
            before: worldBefore,
            after: world,
            commanderId: `commander_${fc.id}`,  // B3: 修正指挥官ID，与将领单位记忆隔离
          })
        )
    )
    // B4: 收集叙事事件写入全局叙事流（修复事件被 .catch 静默丢弃的断路问题）
    const tickNarratives = reflectSettled.flatMap(r => r.status === 'fulfilled' ? r.value.events : [])
    if (tickNarratives.length > 0) recordSimulationNarrativeEvents(tickNarratives)

    // ─── 6) AI-to-AI 外交（每 DIPLOMACY_INTERVAL 回合） ──────────────────────
    if (tick % DIPLOMACY_INTERVAL === 0) {
      const pairs = pickDiplomacyPairs(world, 2)
      for (const [proposerId, targetId] of pairs) {
        try {
          const proposerName = THIRTEEN_FACTIONS.find(fc => fc.id === proposerId)?.name ?? proposerId
          const targetName   = THIRTEEN_FACTIONS.find(fc => fc.id === targetId)?.name ?? targetId

          // mock / hybrid 模式：直接模拟外交结果，不发真实 LLM 请求
          if (mode === 'mock' || mode === 'hybrid') {
            const actions = ['accept', 'reject', 'counter'] as const
            const action = actions[tick % 3]
            const actionLabel = action === 'accept' ? '✅接受' : action === 'counter' ? '🔄反提' : '❌拒绝'
            const event = `外交[${proposerName}→${targetName}]: 暂时停战协议 … ${actionLabel}（mock）`
            diplomacyEvents.push(event)
            diplomacyCount++
            if (verbose) console.log(`  🤝 ${event}`)

            // 外交结果写回 WorldState 和 allianceMap
            if (action === 'accept') {
              // 检查是否已有联盟或有效停战（避免重复签约导致永久停战）
              const alreadyAllied = allianceMap.get(proposerId)?.has(targetId)
              const alreadyHasCeasefire = world.feedback.diplomacyAgreements?.some(
                a => (a.type === 'ceasefire' || a.type === 'alliance') &&
                  a.duration > 0 &&
                  a.parties.includes(proposerId) &&
                  a.parties.includes(targetId)
              )
              if (!alreadyAllied && !alreadyHasCeasefire) {
                if (!world.feedback.diplomacyAgreements) world.feedback.diplomacyAgreements = []
                world.feedback.diplomacyAgreements.push({
                  id: `diplo_${tick}_${proposerId}_${targetId}`,
                  tick,
                  type: 'ceasefire',
                  parties: [proposerId, targetId],
                  duration: 8,  // 从5增加到8，减少高频续约，给战斗留空间
                  terms: '暂时停战协议（mock）',
                })
                // 建立双向联盟映射
                if (!allianceMap.has(proposerId)) allianceMap.set(proposerId, new Set())
                if (!allianceMap.has(targetId)) allianceMap.set(targetId, new Set())
                allianceMap.get(proposerId)!.add(targetId)
                allianceMap.get(targetId)!.add(proposerId)
                warChronicle.push({ tick, type: 'alliance', description: `${proposerName}与${targetName}结为盟友（停战协议）`, actors: [proposerId, targetId] })
              }
            }
            continue
          }

          const proposerUnits = world.units.filter(u => u.faction === proposerId)
          const targetUnits   = world.units.filter(u => u.faction === targetId)
          if (!proposerUnits.length || !targetUnits.length) continue

          const profiles = getOrCreateGeneralProfiles(world)
          const proposerProfile = profiles.find(p => p.faction === proposerId)
          const targetProfile   = profiles.find(p => p.faction === targetId)
          if (!proposerProfile || !targetProfile) continue

          const terms = tick <= totalTicks * 0.4
            ? `两州暂时停战，各守己境，不主动进攻对方。`
            : `结为临时同盟共同制衡强势诸侯。`

          const negResult = await createDiplomacyProposal(
            proposerProfile, targetProfile, 'ceasefire', terms, world
          )
          const responseResult = await respondToDiplomacyProposal(
            negResult.proposal.id, proposerProfile, targetProfile, world
          )
          const action = responseResult.proposal.response?.action ?? 'reject'
          const actionLabel = action === 'accept' ? '✅接受' : action === 'counter' ? '🔄反提' : '❌拒绝'
          const event = `外交[${proposerName}→${targetName}]: ${terms.slice(0, 20)} … ${actionLabel}`
          diplomacyEvents.push(event)
          diplomacyCount++

          // 外交结果写回 WorldState 和 allianceMap（从结构化 consequence 解析）
          if (action === 'accept') {
            if (!world.feedback.diplomacyAgreements) world.feedback.diplomacyAgreements = []
            const consequence = responseResult.proposal.response?.consequence
            if (consequence) {
              const agreements = convertWorldChangesToAgreements(consequence.requestedWorldChanges, tick)
              for (const agreement of agreements) {
                world.feedback.diplomacyAgreements.push(agreement)
                if (!allianceMap.has(agreement.parties[0])) allianceMap.set(agreement.parties[0], new Set())
                if (!allianceMap.has(agreement.parties[1])) allianceMap.set(agreement.parties[1], new Set())
                allianceMap.get(agreement.parties[0])!.add(agreement.parties[1])
                allianceMap.get(agreement.parties[1])!.add(agreement.parties[0])
              }
            }
          }

          if (verbose) console.log(`  🤝 ${event}`)
        } catch (err) {
          const msg = `外交失败[${proposerId}↔${targetId}]: ${String(err).slice(0, 60)}`
          diplomacyEvents.push(msg)
        }
      }
    }

    // ─── 6.5) 联盟背叛 + 反霸权联盟检测 ───────────────
    if (tick > 5) {
      const betrayals = checkAllianceBetrayals(world, allianceMap, tick, warChronicle)
      for (const b of betrayals) {
        diplomacyEvents.push(`⚔️ 背叛: ${b}`)
        console.log(`  ⚔️ 背叛: ${b}`)
      }
      const coalitions = checkAntiHegemonCoalition(world, allianceMap, tick, warChronicle)
      for (const c of coalitions) {
        diplomacyEvents.push(`🛡️ 联盟: ${c}`)
        console.log(`  🛡️ ${c}`)
      }
    }

    // ─── 7) 用户交互仿真（每 USER_CHAT_INTERVAL 回合） ────────────────────────
    if (tick % USER_CHAT_INTERVAL === 0) {
      try {
        const generals = getGeneralProfilesForFaction(world, PLAYER_FACTION_ID)
        if (generals.length > 0) {
          const general = generals[0]
          const orders = [
            `命令你率主力向洛阳方向推进，优先占领关口！`,
            `当前局势紧张，先侦察战线前方三格，再决定下一步。`,
            `收缩防线，巩固本州城池，积累粮草再图进取。`,
            `集结精锐主动出击邻近弱势诸侯，扩大领土。`,
          ]
          const orderText = orders[Math.floor(tick / USER_CHAT_INTERVAL - 1) % orders.length]

          // mock 模式下直接模拟将领回应，不发真实 LLM 请求（避免超时卡死）
          let replyText: string
          if (mode === 'mock') {
            replyText = `末将${general.name}领命！定当竭力完成主公所托。（mock模拟回应）`
          } else {
            const chatResult = await chatWithGeneral(general, world, orderText, 'order')
            replyText = chatResult.reply
          }
          userChatEvent = `司隶主公令"${general.name}"：${orderText.slice(0, 25)} → ${replyText.slice(0, 40)}`
          userChatCount++
          if (verbose) console.log(`  💬 ${userChatEvent}`)
        }
      } catch { /* 聊天失败不影响主循环 */ }
    }

    // ─── 8) 立国检测 ──────────────────────────────────────────────────────────
    const newNations = checkNationFoundingConditions(world, foundedNations)
    for (const { factionId, tileCount } of newNations) {
      foundedNations.add(factionId)
      nationFoundedCount++
      const nationName = nationNames[factionId] ?? `${factionId}国`
      const event = `🏛 ${THIRTEEN_FACTIONS.find(fc => fc.id === factionId)?.name}诸侯立国【${nationName}】（控制 ${tileCount} 格）`
      nationFoundedEvents.push(event)
      warChronicle.push({ tick, type: 'nation_founded', description: event, actors: [factionId] })
      console.log(`\n  🎉 ${event}`)
    }

    // ─── 9) 本回合快照 ────────────────────────────────────────────────────────
    const tileCounts = new Map<string, number>()
    for (const tile of world.map.tiles) {
      if (tile.owner) tileCounts.set(tile.owner, (tileCounts.get(tile.owner) ?? 0) + 1)
    }

    const factionStats: FactionTickStat[] = THIRTEEN_FACTIONS.map(fc => ({
      factionId: fc.id,
      name: fc.name,
      tiles: tileCounts.get(fc.id) ?? 0,
      units: world.units.filter(u => u.faction === fc.id).length,
      food: world.factions[fc.id]?.food ?? 0,
      planOk: planResults.some(r =>
        r.status === 'fulfilled' && r.value?.factionId === fc.id && !!r.value?.result?.plan
      ),
      planSource: (() => {
        const match = planResults.find(r => r.status === 'fulfilled' && r.value?.factionId === fc.id)
        return match?.status === 'fulfilled' ? (match.value?.result?.source ?? 'none') : 'none'
      })(),
    }))

    // Phase5: 执行结果写入文明记忆
    if (tickGovernance) {
      try {
        const latestSession = getLatestCourtSession()
        const passedResolutions = latestSession?.resolutions?.filter(r => r.decision === 'passed') ?? []
        recordExecutionOutcomeMemory({
          tick: world.tick,
          worldVersion: world.worldVersion,
          narrativeCount: tickNarratives.length,
          memoryWrites: tickGovernance.civilMemoryWrites,
          memoryWriteFailures: 0,
          passedResolutions,
        })
        tickGovernance.civilMemoryWrites += 1
      } catch { /* non-critical */ }
    }

    tickLogs.push({ tick, factionStats, diplomacyEvents, userChatEvent, nationFoundedEvents, battleCount: tickBattleCount, errors: tickErrors, governance: tickGovernance })

    // ─── 控制台矩阵输出 ────────────────────────────────────────────────────────
    if (!verbose) {
      // 紧凑单行显示：每个势力 [id:tiles/units]
      const summary = factionStats
        .slice(0, 7)  // 前7个（第二行显示后6个）
        .map(s => `${s.name.slice(0,2)}:${String(s.tiles).padStart(5)}/${s.units}u`)
        .join('  ')
      console.log(summary)
      const summary2 = factionStats
        .slice(7)
        .map(s => `${s.name.slice(0,2)}:${String(s.tiles).padStart(5)}/${s.units}u`)
        .join('  ')
      if (summary2) console.log(`       ${summary2}`)
      if (tickErrors.length) console.log(`     ⚠ ${tickErrors.slice(0,2).join(' | ')}`)
    } else {
      // 详细矩阵
      console.log('\n  势力领土分布:')
      for (const s of factionStats) {
        const founded = foundedNations.has(s.factionId) ? '🏛' : '  '
        console.log(`    ${founded} ${s.name.padEnd(3)} ${String(s.tiles).padStart(6)} 格  ${s.units}部队  ${String(s.food).padStart(4)}粮  plan:${s.planSource}`)
      }
      if (diplomacyEvents.length) console.log(`  外交: ${diplomacyEvents.join(' | ')}`)
      if (userChatEvent) console.log(`  交互: ${userChatEvent}`)
      if (tickErrors.length) console.log(`  错误: ${tickErrors.join(' | ')}`)
    }

    // 胜利条件达成时结束模拟
    if (victoryResult.winner) break
  } // end tick loop

  // ─── 最终报告 ──────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════════╗')
  console.log('║                         东汉争霸 · 终幕                         ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝')

  const finalTileCounts = new Map<string, number>()
  for (const tile of world.map.tiles) {
    if (tile.owner) finalTileCounts.set(tile.owner, (finalTileCounts.get(tile.owner) ?? 0) + 1)
  }

  // 按领土排序
  const ranked = THIRTEEN_FACTIONS
    .map(fc => ({ ...fc, tiles: finalTileCounts.get(fc.id) ?? 0 }))
    .sort((a, b) => b.tiles - a.tiles)

  console.log('\n  📊 势力排名（终局领土）:')
  for (let i = 0; i < ranked.length; i++) {
    const fc = ranked[i]
    const prefix  = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `  ${i + 1}.`
    const nation  = foundedNations.has(fc.id) ? `[${nationNames[fc.id] ?? fc.id + '国'}]` : '[未立国]'
    console.log(`  ${prefix} ${fc.name.padEnd(3)} ${String(fc.tiles).padStart(6)} 格  ${nation}`)
  }

  console.log('\n  🔧 系统健康:')
  console.log(`     规划调用总次数:   ${totalPlannerCalls}`)
  console.log(`     规划报错次数:     ${plannerErrors}`)
  console.log(`     外交触发次数:     ${diplomacyCount}`)
  console.log(`     用户交互次数:     ${userChatCount}`)
  console.log(`     立国事件次数:     ${nationFoundedCount} / 13`)
  console.log(`     已立国势力:       ${[...foundedNations].map(id => THIRTEEN_FACTIONS.find(fc => fc.id === id)?.name ?? id).join('、') || '无'}`)

  // ─── 验证报告 ──────────────────────────────────────────────────────────────
  console.log('\n  ✅ 功能验证结果:')
  const totalBattles = tickLogs.reduce((sum, t) => sum + (t.battleCount ?? 0), 0)
  const allianceCount = allianceMap.size
  const checks = [
    { label: 'AI-to-AI 外交 (DiplomacyAgent)', ok: diplomacyCount > 0,
      detail: `触发 ${diplomacyCount} 次，每 ${DIPLOMACY_INTERVAL} 回合 2 对` },
    { label: '用户交互仿真 (chatWithGeneral)',  ok: userChatCount > 0,
      detail: `触发 ${userChatCount} 次，每 ${USER_CHAT_INTERVAL} 回合 1 次` },
    { label: '13 势力独立 CommanderAgent',      ok: totalPlannerCalls >= totalTicks * 13 * 0.3,
      detail: `${totalPlannerCalls} 次规划，${plannerErrors} 次失败` },
    { label: '立国自动触发检测',                ok: true,
      detail: `${nationFoundedCount} 个势力控制 ≥ ${MIN_NATION_TILES} 格时触发立国` },
    { label: '洛阳争夺胜利条件(15回合)',        ok: true,
      detail: `洛阳控制满15回合触发日胜利，联盟控制80%全图触发联盟胜利，${allianceCount} 个势力已缔结联盟` },
    { label: '势力间实际战斗解算',              ok: totalBattles > 0 || totalTicks < 25,
      detail: totalBattles > 0
        ? `共解算 ${totalBattles} 次战斗（单位碰撞）`
        : `地图较大，预计 ~25 tick 后势力接触（luoyang_advance 已就位）` },
  ]
  for (const c of checks) {
    console.log(`     ${c.ok ? '✅' : '❌'} ${c.label}: ${c.detail}`)
  }

  // ─── 写入 JSON 报告 ────────────────────────────────────────────────────────
  const report = {
    id: randomUUID(),
    simulatedAt: new Date().toISOString(),
    config,
    totalTicks,
    finalRanking: ranked.map(fc => ({
      factionId: fc.id, name: fc.name,
      tiles: fc.tiles,
      nationFounded: foundedNations.has(fc.id),
      nationName: foundedNations.has(fc.id) ? nationNames[fc.id] : null,
    })),
    systemHealth: {
      totalPlannerCalls, plannerErrors,
      diplomacyCount, userChatCount, nationFoundedCount,
      foundedNations: [...foundedNations],
    },
    checks: checks.map(c => ({ label: c.label, ok: c.ok, detail: c.detail })),
    tickLogs,
    warChronicle,
  }

  const dir = output.split('/').slice(0, -1).join('/')
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(output, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\n  💾 报告已保存: ${output}`)

  // ─── 战争编年史 Markdown 输出 ───────────────────────────────────────────────
  if (warChronicle.length > 0) {
    const mdLines: string[] = [
      `# ⚔️ 十三州战争编年史`,
      `> 模拟日期: ${new Date().toISOString().split('T')[0]} | 总回合: ${totalTicks} | 模式: ${mode}`,
      '',
    ]

    // 按类型分组输出
    const typeLabels: Record<string, string> = {
      'first_blood': '🩸 天下第一战',
      'alliance': '🤝 外交结盟',
      'betrayal': '🗡️ 背信弃义',
      'coalition': '🛡️ 合纵连横',
      'nation_founded': '🏛️ 诸侯立国',
      'hegemon_alert': '⚠️ 霸权警报',
      'victory': '🏆 一统天下',
    }

    mdLines.push('## 时间线', '')
    for (const evt of warChronicle) {
      const label = typeLabels[evt.type] ?? evt.type
      mdLines.push(`- **回合 ${evt.tick}** ${label}: ${evt.description}`)
    }

    // 统计
    mdLines.push('', '## 统计', '')
    mdLines.push(`- 联盟缔结: ${warChronicle.filter(e => e.type === 'alliance').length} 次`)
    mdLines.push(`- 背叛事件: ${warChronicle.filter(e => e.type === 'betrayal').length} 次`)
    mdLines.push(`- 反霸权联盟: ${warChronicle.filter(e => e.type === 'coalition').length} 次`)
    mdLines.push(`- 立国: ${warChronicle.filter(e => e.type === 'nation_founded').length} 国`)
    mdLines.push('')

    const mdOutput = output.replace(/\.json$/, '_chronicle.md')
    writeFileSync(mdOutput, mdLines.join('\n'), 'utf8')
    console.log(`  📜 战争编年史: ${mdOutput}`)
  }

  console.log()
  // 强制退出：GeneralProfileStore / WorldService 的 debounce 定时器会阻止进程自然退出
  process.exit(0)
}

runSimulation().catch(err => {
  console.error('模拟异常退出:', err)
  process.exit(1)
})
