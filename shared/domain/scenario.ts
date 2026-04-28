import { buildHeroProfileFromPool, getHeroPoolEntryByName } from './heroPool'
import { generateInitialPveNodes } from './provincePve'
import {
  DEFAULT_WORLD_RESOURCE_GENERATION_POLICY,
  buildWorldResourceGenerationSummary,
  resolveGeneratedWorldResourceKind,
  resolveGeneratedWorldResourceLevel,
  shouldGenerateWorldResourceTile,
  type WorldResourceGenerationPolicy,
} from './worldResourceGeneration'
import type {
  CityCamp,
  CityFootprintTiles,
  CityTechLevels,
  MapContinuousOverlays,
  MapRegion,
  ResourceKind,
  Tile,
  TileIntel,
  Unit,
  WorldState,
} from '../contracts/game'

const MAP_WIDTH = 320
const MAP_HEIGHT = 320
const LEGACY_ANCHOR_OFFSET_X = 132
const LEGACY_ANCHOR_OFFSET_Y = 112

type ProvinceDefinition = {
  id: string
  name: string
  centerX: number
  centerY: number
  terrainBias: Tile['terrain']
  summary: string
}

export type HanProvinceAnchor = {
  id: string
  name: string
  centerX: number
  centerY: number
  summary: string
}

const HAN_PROVINCES: ProvinceDefinition[] = [
  {
    id: 'sili',
    name: '司隶',
    centerX: 160,
    centerY: 158,
    terrainBias: 'urban',
    summary: '以洛阳为核心，承担中央调度与多线会战。',
  },
  {
    id: 'jizhou',
    name: '冀州',
    centerX: 186,
    centerY: 108,
    terrainBias: 'highland',
    summary: '北地高原与平原交界，适合建立前压战区。',
  },
  {
    id: 'bingzhou',
    name: '并州',
    centerX: 126,
    centerY: 94,
    terrainBias: 'mountain',
    summary: '太行山脉西侧，天然防线密集。',
  },
  {
    id: 'youzhou',
    name: '幽州',
    centerX: 226,
    centerY: 72,
    terrainBias: 'forest',
    summary: '北疆林地纵深大，侦察与机动压力高。',
  },
  {
    id: 'yanzhou',
    name: '兖州',
    centerX: 212,
    centerY: 146,
    terrainBias: 'grassland',
    summary: '中原要冲，承担兵站与纵向增援。',
  },
  {
    id: 'yuzhou',
    name: '豫州',
    centerX: 194,
    centerY: 188,
    terrainBias: 'grassland',
    summary: '中轴腹地，连接司隶与江淮。',
  },
  {
    id: 'qingzhou',
    name: '青州',
    centerX: 262,
    centerY: 132,
    terrainBias: 'riverland',
    summary: '东线滨海平原，资源与补给带密集。',
  },
  {
    id: 'xuzhou',
    name: '徐州',
    centerX: 252,
    centerY: 194,
    terrainBias: 'riverland',
    summary: '淮河北岸走廊，州际通道竞争激烈。',
  },
  {
    id: 'jingzhou',
    name: '荆州',
    centerX: 176,
    centerY: 242,
    terrainBias: 'riverland',
    summary: '汉水与江汉平原交错，适合防守反击。',
  },
  {
    id: 'yangzhou',
    name: '扬州',
    centerX: 244,
    centerY: 252,
    terrainBias: 'riverland',
    summary: '江淮水网复杂，推进依赖关口与渡口控制。',
  },
  {
    id: 'yizhou',
    name: '益州',
    centerX: 96,
    centerY: 246,
    terrainBias: 'mountain',
    summary: '西南盆地与山岭构成纵深防区。',
  },
  {
    id: 'liangzhou',
    name: '凉州',
    centerX: 58,
    centerY: 146,
    terrainBias: 'wasteland',
    summary: '西陲走廊地形恶劣，适合筑防与牵制。',
  },
  {
    id: 'jiaozhou',
    name: '交州',
    centerX: 214,
    centerY: 300,
    terrainBias: 'forest',
    summary: '南疆湿热林地，侦察成本高。',
  },
]

export function getHanProvinceAnchors(): HanProvinceAnchor[] {
  return HAN_PROVINCES.map((province) => ({
    id: province.id,
    name: province.name,
    centerX: province.centerX,
    centerY: province.centerY,
    summary: province.summary,
  }))
}

type StrategicNodeTileType = Extract<Tile['type'], 'pass' | 'fort' | 'dock'>
type StrategicNodeAnchor = {
  id: string
  name: string
  type: StrategicNodeTileType
  owner: Tile['owner']
  x: number
  y: number
  terrain: Tile['terrain']
  moveCost: number
  enemyPressure: number
  scoutingDifficulty: number
}

const STRATEGIC_FORT_ANCHORS: StrategicNodeAnchor[] = [
  { id: 'fort_liangzhou_corridor', name: '凉州走廊营寨', type: 'fort', owner: 'player', x: 72, y: 190, terrain: 'wasteland', moveCost: 2, enemyPressure: 2, scoutingDifficulty: 2 },
  { id: 'fort_yizhou_north_gate', name: '益州北门营寨', type: 'fort', owner: 'player', x: 96, y: 214, terrain: 'highland', moveCost: 2, enemyPressure: 2, scoutingDifficulty: 2 },
  { id: 'fort_sili_west_ridge', name: '司隶西岭要塞', type: 'fort', owner: 'neutral', x: 132, y: 132, terrain: 'mountain', moveCost: 2, enemyPressure: 3, scoutingDifficulty: 3 },
  { id: 'fort_sili_south_camp', name: '司隶南营', type: 'fort', owner: 'neutral', x: 146, y: 184, terrain: 'grassland', moveCost: 1, enemyPressure: 2, scoutingDifficulty: 2 },
  { id: 'fort_jizhou_frontier', name: '冀州前沿营寨', type: 'fort', owner: 'enemy', x: 184, y: 132, terrain: 'highland', moveCost: 2, enemyPressure: 4, scoutingDifficulty: 2 },
  { id: 'fort_yanzhou_supply_camp', name: '兖州补给营寨', type: 'fort', owner: 'neutral', x: 214, y: 166, terrain: 'grassland', moveCost: 1, enemyPressure: 3, scoutingDifficulty: 2 },
  { id: 'fort_bingzhou_ridge', name: '并州山垒', type: 'fort', owner: 'enemy', x: 126, y: 104, terrain: 'mountain', moveCost: 2, enemyPressure: 4, scoutingDifficulty: 3 },
  { id: 'fort_jizhou_hillcamp', name: '冀州丘营', type: 'fort', owner: 'enemy', x: 170, y: 122, terrain: 'highland', moveCost: 2, enemyPressure: 4, scoutingDifficulty: 2 },
  { id: 'fort_yanzhou_north_line', name: '兖州北线营寨', type: 'fort', owner: 'neutral', x: 218, y: 134, terrain: 'grassland', moveCost: 1, enemyPressure: 3, scoutingDifficulty: 2 },
  { id: 'fort_yizhou_south_ridge', name: '益州南岭营寨', type: 'fort', owner: 'player', x: 92, y: 268, terrain: 'highland', moveCost: 2, enemyPressure: 2, scoutingDifficulty: 2 },
  { id: 'fort_jiaozhou_forest_camp', name: '交州林间营寨', type: 'fort', owner: 'enemy', x: 210, y: 292, terrain: 'forest', moveCost: 2, enemyPressure: 4, scoutingDifficulty: 3 },
  { id: 'fort_yizhou_ba_ridge', name: '益州巴岭要塞', type: 'fort', owner: 'player', x: 88, y: 236, terrain: 'mountain', moveCost: 2, enemyPressure: 3, scoutingDifficulty: 3 },
]

const STRATEGIC_DOCK_ANCHORS: StrategicNodeAnchor[] = [
  { id: 'dock_liangzhou_yellow_river', name: '凉州黄河渡口', type: 'dock', owner: 'player', x: 74, y: 146, terrain: 'riverland', moveCost: 1, enemyPressure: 2, scoutingDifficulty: 2 },
  { id: 'dock_yanzhou_yellow_river', name: '兖州黄河渡口', type: 'dock', owner: 'neutral', x: 224, y: 152, terrain: 'riverland', moveCost: 1, enemyPressure: 3, scoutingDifficulty: 2 },
  { id: 'dock_qingzhou_yellow_river', name: '青州黄河渡口', type: 'dock', owner: 'enemy', x: 264, y: 152, terrain: 'riverland', moveCost: 1, enemyPressure: 4, scoutingDifficulty: 2 },
  { id: 'dock_jingzhou_huaihe_west', name: '荆州淮西渡口', type: 'dock', owner: 'neutral', x: 154, y: 224, terrain: 'riverland', moveCost: 1, enemyPressure: 2, scoutingDifficulty: 2 },
  { id: 'dock_jingzhou_huaihe_mid', name: '荆州淮中渡口', type: 'dock', owner: 'neutral', x: 184, y: 224, terrain: 'riverland', moveCost: 1, enemyPressure: 2, scoutingDifficulty: 2 },
  { id: 'dock_yangzhou_huaihe', name: '扬州淮河渡口', type: 'dock', owner: 'enemy', x: 224, y: 224, terrain: 'riverland', moveCost: 1, enemyPressure: 4, scoutingDifficulty: 2 },
  { id: 'dock_jingzhou_yangtze_west', name: '荆州江陵渡口', type: 'dock', owner: 'player', x: 140, y: 268, terrain: 'riverland', moveCost: 1, enemyPressure: 2, scoutingDifficulty: 2 },
  { id: 'dock_jingzhou_yangtze_mid', name: '荆州汉津渡口', type: 'dock', owner: 'neutral', x: 180, y: 268, terrain: 'riverland', moveCost: 1, enemyPressure: 3, scoutingDifficulty: 2 },
  { id: 'dock_yangzhou_yangtze_mid', name: '扬州江心渡口', type: 'dock', owner: 'enemy', x: 230, y: 268, terrain: 'riverland', moveCost: 1, enemyPressure: 4, scoutingDifficulty: 2 },
  { id: 'dock_yangzhou_yangtze_east', name: '扬州东江渡口', type: 'dock', owner: 'enemy', x: 280, y: 268, terrain: 'riverland', moveCost: 1, enemyPressure: 4, scoutingDifficulty: 2 },
]

const STRATEGIC_NODE_BACKFILL_ANCHORS: StrategicNodeAnchor[] = [
  ...STRATEGIC_FORT_ANCHORS,
  ...STRATEGIC_DOCK_ANCHORS,
]

const worldSetup = createWorldSetup(DEFAULT_WORLD_RESOURCE_GENERATION_POLICY)
const tiles: Tile[] = worldSetup.tiles
const regions: MapRegion[] = worldSetup.regions
const overlays: MapContinuousOverlays = worldSetup.overlays
const resourceGeneration = worldSetup.resourceGeneration
const connections = buildGridConnections(tiles)
const playerStartingHeroIds = ['关羽', '太史慈', '郝昭', '张辽', '吕布', '华佗', '刘备'].map(
  getHeroIdByName,
)
const enemyStartingHeroIds = ['高顺', '郭嘉', '夏侯惇', '孙策'].map(getHeroIdByName)
const playerReserveHeroIds = ['诸葛亮', '关银屏'].map(getHeroIdByName)
const enemyReserveHeroIds = ['司马懿'].map(getHeroIdByName)
const playerProspectHeroIds = ['赵云', '孙尚香', '黄忠', '张春华', '周瑜', '张机'].map(
  getHeroIdByName,
)
const enemyProspectHeroIds = ['华雄', '张角', '马超', '陆逊', '曹操', '貂蝉'].map(
  getHeroIdByName,
)
type ScenarioUnitDraft = {
  id: string
  faction: Unit['faction']
  heroName: string
  unitName: string
  tileId: string
  strength: number
  mobility: number
  supply: number
  status: Unit['status']
  currentTask: string
  corps: Unit['corps']
  hero: {
    archetype: Unit['hero']['archetype']
    title: string
    growthFocus: string
    traits: string[]
    troopType?: Unit['hero']['troopType']
    level?: number
  }
}

const unitDrafts: ScenarioUnitDraft[] = [
  {
    id: 'u1',
    faction: 'player',
    heroName: '关羽',
    unitName: '关羽所部',
    tileId: 'tile_07',
    strength: 82,
    mobility: 2,
    supply: 6,
    status: '待命',
    currentTask: '监控西侧关口',
    corps: {
      name: '白岭突击营',
      doctrine: '抢关先手，接敌后立刻压住关口宽度。',
      specialty: '关口抢占',
      readiness: 86,
      roster: ['枪盾先锋', '近战督战', '破障工兵'],
    },
    hero: {
      archetype: 'assault',
      title: '裂关校尉',
      growthFocus: '继续成长后可转成前线破门核心，是西关线最像“主将”的部队。',
      traits: ['突前', '破障', '近战压制'],
      level: 24,
    },
  },
  {
    id: 'u2',
    faction: 'player',
    heroName: '太史慈',
    unitName: '太史慈所部',
    tileId: 'tile_03',
    strength: 54,
    mobility: 3,
    supply: 5,
    status: '待命',
    currentTask: '观察北线雾区',
    corps: {
      name: '雾哨游骑',
      doctrine: '先摸清敌前哨和雾区轮廓，再为主力提供落点。',
      specialty: '北线侦察',
      readiness: 79,
      roster: ['轻骑斥候', '信标手', '山地向导'],
    },
    hero: {
      archetype: 'recon',
      title: '夜巡都尉',
      growthFocus: '成长后可把北线侦察带变成长期视野资产，降低 AI 盲推成本。',
      traits: ['先见', '游骑', '追踪'],
      troopType: 'mixed',
      level: 22,
    },
  },
  {
    id: 'u3',
    faction: 'player',
    heroName: '郝昭',
    unitName: '郝昭所部',
    tileId: 'tile_08',
    strength: 88,
    mobility: 1,
    supply: 7,
    status: '驻防中',
    currentTask: '驻防青石城',
    corps: {
      name: '青石城卫',
      doctrine: '守住主城和补给心脏，确保推进时不被反穿。',
      specialty: '主城驻防',
      readiness: 91,
      roster: ['城墙守军', '弓弩列阵', '城门备队'],
    },
    hero: {
      archetype: 'guard',
      title: '青石镇守',
      growthFocus: '后续可扩成防线锚点型武将，让主基地不再只是一个数值点。',
      traits: ['守城', '稳线', '反突入'],
      troopType: 'shield',
      level: 25,
    },
  },
  {
    id: 'u4',
    faction: 'player',
    heroName: '张辽',
    unitName: '张辽所部',
    tileId: 'tile_12',
    strength: 73,
    mobility: 2,
    supply: 6,
    status: '待命',
    currentTask: '随时支援中军',
    corps: {
      name: '风隼机动营',
      doctrine: '在中军与两翼之间快速补位，优先接临时火点。',
      specialty: '快速策应',
      readiness: 82,
      roster: ['轻装步军', '机动预备', '侧翼护送'],
    },
    hero: {
      archetype: 'mobile',
      title: '追风校尉',
      growthFocus: '成长后适合做 AI 的高优先级机动响应节点。',
      traits: ['补位', '快速转场', '策应'],
      level: 24,
    },
  },
  {
    id: 'u5',
    faction: 'player',
    heroName: '吕布',
    unitName: '吕布所部',
    tileId: 'tile_13',
    strength: 92,
    mobility: 1,
    supply: 8,
    status: '待命',
    currentTask: '准备推进中线',
    corps: {
      name: '铁壁重营',
      doctrine: '慢，但一旦压上去就要打成决定性正面。',
      specialty: '中线突破',
      readiness: 88,
      roster: ['重步前列', '破甲手', '压阵亲卫'],
    },
    hero: {
      archetype: 'heavy',
      title: '横阵将',
      growthFocus: '后续可以承接更重的成长与战法系统，是长期养成的主 C 候选。',
      traits: ['重压', '正面突破', '耗损承受'],
      level: 28,
    },
  },
  {
    id: 'u6',
    faction: 'player',
    heroName: '华佗',
    unitName: '华佗所部',
    tileId: 'tile_11',
    strength: 48,
    mobility: 1,
    supply: 9,
    status: '驻防中',
    currentTask: '保障粮仓',
    corps: {
      name: '河谷辎运列',
      doctrine: '把粮、械和替补稳稳送到前线，不做无意义推进。',
      specialty: '后勤维护',
      readiness: 77,
      roster: ['辎车', '补给兵', '简易工事班'],
    },
    hero: {
      archetype: 'logistics',
      title: '粮械监',
      growthFocus: '后面做发展期玩法时，这类武将能承接非战斗成长价值。',
      traits: ['补给', '稳态', '修复'],
      troopType: 'supply',
      level: 23,
    },
  },
  {
    id: 'u7',
    faction: 'player',
    heroName: '刘备',
    unitName: '刘备所部',
    tileId: 'tile_08',
    strength: 67,
    mobility: 2,
    supply: 6,
    status: '待命',
    currentTask: '补位主城周边',
    corps: {
      name: '青石预备营',
      doctrine: '不上头，专门补位高损耗单位和临时战区空缺。',
      specialty: '预备补位',
      readiness: 74,
      roster: ['混成预备', '替补队', '伤兵接应'],
    },
    hero: {
      archetype: 'reserve',
      title: '后队司备',
      growthFocus: '成长后能把战损恢复和轮换做成一条完整体验链。',
      traits: ['补位', '续战', '整编'],
      troopType: 'mixed',
      level: 24,
    },
  },
  {
    id: 'e1',
    faction: 'enemy',
    heroName: '高顺',
    unitName: '高顺所部',
    tileId: 'tile_10',
    strength: 84,
    mobility: 2,
    supply: 6,
    status: '驻防中',
    currentTask: '守备赤垒要塞',
    corps: {
      name: '赤垒先登',
      doctrine: '以要塞为支点压住东中线。',
      specialty: '要塞压制',
      readiness: 85,
      roster: ['先登重步', '城侧护卫'],
    },
    hero: {
      archetype: 'heavy',
      title: '赤垒牙将',
      growthFocus: '敌方要塞压制节点。',
      traits: ['据点', '重压'],
      troopType: 'infantry',
      level: 24,
    },
  },
  {
    id: 'e2',
    faction: 'enemy',
    heroName: '郭嘉',
    unitName: '郭嘉所部',
    tileId: 'tile_05',
    strength: 52,
    mobility: 3,
    supply: 5,
    status: '侦察中',
    currentTask: '监视北线',
    corps: {
      name: '灰哨游骑',
      doctrine: '贴着雾区观察我方动向。',
      specialty: '侦骑',
      readiness: 76,
      roster: ['游骑斥候', '信使'],
    },
    hero: {
      archetype: 'recon',
      title: '灰羽哨长',
      growthFocus: '敌方北线视野点。',
      traits: ['侦骑', '游走'],
      level: 23,
    },
  },
  {
    id: 'e3',
    faction: 'enemy',
    heroName: '夏侯惇',
    unitName: '夏侯惇所部',
    tileId: 'tile_15',
    strength: 79,
    mobility: 2,
    supply: 5,
    status: '待命',
    currentTask: '卡住东侧峡口',
    corps: {
      name: '东峡扼守队',
      doctrine: '守住峡口，不给东线开发带轻易成形。',
      specialty: '峡口封锁',
      readiness: 81,
      roster: ['峡口守军', '反冲步队'],
    },
    hero: {
      archetype: 'guard',
      title: '峡牙都伯',
      growthFocus: '敌方东线门闩。',
      traits: ['扼守', '抗压'],
      troopType: 'shield',
      level: 24,
    },
  },
  {
    id: 'e4',
    faction: 'enemy',
    heroName: '孙策',
    unitName: '孙策所部',
    tileId: 'tile_09',
    strength: 71,
    mobility: 2,
    supply: 5,
    status: '待命',
    currentTask: '策应中线',
    corps: {
      name: '中线策应队',
      doctrine: '随时从岔路插向我方前伸点。',
      specialty: '中线补刀',
      readiness: 78,
      roster: ['轻装步军', '机动侧击'],
    },
    hero: {
      archetype: 'mobile',
      title: '岔路督骑',
      growthFocus: '敌方中线游动威胁。',
      traits: ['补刀', '机动'],
      level: 24,
    },
  },
]

const units: Unit[] = unitDrafts.map(createScenarioUnit)

export type CreateInitialWorldStateOptions = {
  resourceGenerationPolicy?: WorldResourceGenerationPolicy
}

export function createInitialWorldState(options?: CreateInitialWorldStateOptions): WorldState {
  const setup = options?.resourceGenerationPolicy
    ? createWorldSetup(options.resourceGenerationPolicy)
    : {
        tiles,
        connections,
        regions,
        overlays,
        resourceGeneration,
      }

  return {
    tick: 1,
    worldVersion: 1,
    map: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tiles: setup.tiles,
      connections: setup.connections,
      regions: setup.regions,
      overlays: setup.overlays,
      resourceGeneration: setup.resourceGeneration,
    },
    factions: {
      player: {
        id: 'player',
        food: 20,
        actionPoints: 6,
        claimableRewards: [],
        aiQuota: {
          initialQuota: 4,
          currentQuota: 4,
          maxQuota: 10,
          growthScore: 0,
          tugIntensity: 0,
          nextUnlockScore: 66,
        },
        heroCommand: {
          doctrine: '主打稳补给、分批扩张和把熟练武将送入前线执行链。',
          homeTileId: 'tile_08',
          commandLimit: 10,
          heroLuck: 74,
          developmentPoints: 18,
          acquisitionThreshold: 18,
          rosterHeroIds: [...playerStartingHeroIds, ...playerReserveHeroIds],
          reserveHeroIds: [...playerReserveHeroIds],
          prospectHeroIds: playerProspectHeroIds,
          recentHeroId: playerReserveHeroIds[0],
        },
      },
      enemy: {
        id: 'enemy',
        food: 18,
        actionPoints: 6,
        claimableRewards: [],
        aiQuota: {
          initialQuota: 3,
          currentQuota: 3,
          maxQuota: 10,
          growthScore: 0,
          tugIntensity: 0,
          nextUnlockScore: 42,
        },
        heroCommand: {
          doctrine: '优先把高压武将送去关口与要塞，把发展成果转成前线威慑。',
          homeTileId: 'tile_10',
          commandLimit: 8,
          heroLuck: 68,
          developmentPoints: 7,
          acquisitionThreshold: 20,
          rosterHeroIds: [...enemyStartingHeroIds, ...enemyReserveHeroIds],
          reserveHeroIds: [...enemyReserveHeroIds],
          prospectHeroIds: enemyProspectHeroIds,
          recentHeroId: enemyReserveHeroIds[0],
        },
      },
    },
    alliance: {
      commanders: [
        {
          id: 'ally_west',
          name: '河东盟军',
          specialty: 'frontier',
          assignedRegionId: 'west_front',
          readiness: 78,
        },
        {
          id: 'ally_north',
          name: '山麓游骑',
          specialty: 'recon',
          assignedRegionId: 'north_recon',
          readiness: 72,
        },
        {
          id: 'ally_east',
          name: '东境屯垦军',
          specialty: 'resource',
          assignedRegionId: 'east_expansion',
          readiness: 69,
        },
      ],
      directives: {
        west_front: {
          regionId: 'west_front',
          stance: 'support',
          assignedCommanderId: 'ally_west',
          supportLevel: 74,
          summary: '盟友西线负责策应关口与西南粮仓，适合协同驻防与补位。',
        },
        north_recon: {
          regionId: 'north_recon',
          stance: 'harass',
          assignedCommanderId: 'ally_north',
          supportLevel: 66,
          summary: '盟友北线以游骑骚扰和视野共享为主，适合压制敌前哨。',
        },
        central_base: {
          regionId: 'central_base',
          stance: 'hold',
          assignedCommanderId: 'ally_west',
          supportLevel: 58,
          summary: '盟友默认稳住青石后勤圈，不主动外推。',
        },
        east_expansion: {
          regionId: 'east_expansion',
          stance: 'expand',
          assignedCommanderId: 'ally_east',
          supportLevel: 71,
          summary: '盟友愿意协同开发东线采邑，但需要我方补给跟上。',
        },
      },
    },
    feedback: {
      allianceActions: [],
      battleRecords: [],
      diplomacyAgreements: [],
    },
    units,
    reports: [
      {
        id: 'report_boot_1',
        tick: 1,
        title: '战区初始化',
        detail:
          '青石城防线已经接入 320x320 菱形沙盘（约 10 万格），我方可沿西侧关口、北线侦察带与东线采邑展开调度。',
      },
      {
        id: 'report_boot_2',
        tick: 1,
        title: '敌情概览',
        detail:
          '赤垒要塞与东侧峡口对我形成正面挤压，洛阳周边大城群仍处于高压争夺态势。',
      },
    ],
    intel: createInitialIntel(setup.tiles),
    tacticalOverrides: [],
    executions: {},
    history: {
      planningJobs: [],
      executionReplays: [],
    },
    pveNodes: generateInitialPveNodes(setup.tiles),
    luoyangSiegeProgress: {},
    citySiegeProgress: {},
  }
}

function createScenarioUnit(draft: ScenarioUnitDraft): Unit {
  return {
    id: draft.id,
    name: draft.unitName,
    faction: draft.faction,
    corps: draft.corps,
    hero: buildHeroProfileFromPool(draft.heroName, {
      archetype: draft.hero.archetype,
      troopType: draft.hero.troopType,
      title: draft.hero.title,
      level: draft.hero.level,
      growthFocus: draft.hero.growthFocus,
      traits: draft.hero.traits,
    }),
    tileId: draft.tileId,
    strength: draft.strength,
    mobility: draft.mobility,
    supply: draft.supply,
    status: draft.status,
    currentTask: draft.currentTask,
  }
}

function getHeroIdByName(name: string) {
  return getHeroPoolEntryByName(name).id
}

function createInitialIntel(inputTiles: Tile[] = tiles): Record<string, TileIntel> {
  return Object.fromEntries(
    inputTiles.map((tile) => {
      if (tile.owner === 'player') {
        return [
          tile.id,
          {
            level: 'confirmed',
            lastScoutedTick: 1,
            summary: `${tile.name} 已纳入我方稳定控制。`,
          },
        ]
      }

      if (
        tile.id === 'tile_06' ||
        tile.id === 'tile_02' ||
        tile.id === 'tile_09' ||
        tile.id === 'tile_14' ||
        tile.landmarkId === 'luoyang' ||
        tile.cityLevel === 8
      ) {
        return [
          tile.id,
          {
            level: 'suspected',
            summary: `${tile.name} 已捕捉到轮廓情报，仍需进一步接触确认驻军与地块等级。`,
          },
        ]
      }

      if (tile.owner === 'enemy') {
        return [
          tile.id,
          {
            level: 'suspected',
            summary: `${tile.name} 已通过远距侦察确认敌情，尚未完成近距复核。`,
          },
        ]
      }

      return [
        tile.id,
        {
          level: tile.type === 'fog' ? 'unknown' : 'suspected',
          summary:
            tile.type === 'fog'
              ? `${tile.name} 仍处于战争迷雾，需要侦察后才能判定地块价值。`
              : `${tile.name} 已有基础地貌判断，仍需靠近后确认资源或驻军细节。`,
        },
      ]
    }),
  )
}

type TileOverride = Omit<Partial<Tile>, 'id' | 'x' | 'y'> & {
  id: string
  x: number
  y: number
  name: string
  type: Tile['type']
  owner: Tile['owner']
}

function isStrategicNodeTileType(type: Tile['type']): type is StrategicNodeTileType {
  return type === 'pass' || type === 'fort' || type === 'dock'
}

export function normalizeWorldStrategicNodesForWorld(world: WorldState): { world: WorldState; changed: boolean } {
  const tileIndexByCoord = new Map(world.map.tiles.map((tile, index) => [keyOf(tile.x, tile.y), index]))
  let nextTiles: Tile[] | null = null

  for (const anchor of STRATEGIC_NODE_BACKFILL_ANCHORS) {
    const index = tileIndexByCoord.get(keyOf(anchor.x, anchor.y))
    if (index === undefined) {
      continue
    }

    const tile = (nextTiles ?? world.map.tiles)[index]
    const nextTile: Tile = {
      ...tile,
      name: anchor.name,
      type: anchor.type,
      terrain: anchor.terrain,
      moveCost: anchor.moveCost,
      enemyPressure: anchor.enemyPressure,
      scoutingDifficulty: anchor.scoutingDifficulty,
      resourceLevel: undefined,
      resourceKind: undefined,
      cityLevel: undefined,
      district: tile.district ?? resolveProvinceAt(anchor.x, anchor.y).id,
    }

    if (
      tile.name === nextTile.name &&
      tile.type === nextTile.type &&
      tile.terrain === nextTile.terrain &&
      tile.moveCost === nextTile.moveCost &&
      tile.enemyPressure === nextTile.enemyPressure &&
      tile.scoutingDifficulty === nextTile.scoutingDifficulty &&
      tile.resourceLevel === undefined &&
      tile.resourceKind === undefined &&
      tile.cityLevel === undefined &&
      tile.district === nextTile.district
    ) {
      continue
    }

    nextTiles ??= [...world.map.tiles]
    nextTiles[index] = nextTile
  }

  if (!nextTiles) {
    return { world, changed: false }
  }

  return {
    world: {
      ...world,
      map: {
        ...world.map,
        tiles: nextTiles,
        connections: buildGridConnections(nextTiles),
      },
    },
    changed: true,
  }
}

function createWorldSetup(resourceGenerationPolicy: WorldResourceGenerationPolicy) {
  const overrides = new Map<string, TileOverride>()

  appendLegacyAnchorTiles(overrides)
  appendHistoricPassAnchors(overrides)
  appendStrategicFortAnchors(overrides)
  appendStrategicDockAnchors(overrides)
  appendCityCluster(overrides, {
    idPrefix: 'luoyang',
    name: '洛阳',
    startX: 156,
    startY: 154,
    width: 9,
    height: 9,
    owner: 'neutral',
    minCityLevel: 7,
    maxCityLevel: 9,
    landmarkId: 'luoyang',
  })
  appendCityCluster(overrides, {
    idPrefix: 'yecheng',
    name: '邺城',
    startX: 200,
    startY: 104,
    width: 5,
    height: 5,
    owner: 'enemy',
    minCityLevel: 5,
    maxCityLevel: 7,
    landmarkId: 'yecheng',
  })
  appendCityCluster(overrides, {
    idPrefix: 'xuchang',
    name: '许昌',
    startX: 186,
    startY: 184,
    width: 5,
    height: 5,
    owner: 'neutral',
    minCityLevel: 4,
    maxCityLevel: 6,
    landmarkId: 'xuchang',
  })
  appendCityCluster(overrides, {
    idPrefix: 'hejian',
    name: '长安',
    startX: 120,
    startY: 152,
    width: 5,
    height: 5,
    owner: 'player',
    minCityLevel: 4,
    maxCityLevel: 6,
    landmarkId: 'hejian',
  })
  appendCityCluster(overrides, {
    idPrefix: 'chengdu',
    name: '成都',
    startX: 78,
    startY: 236,
    width: 5,
    height: 5,
    owner: 'player',
    minCityLevel: 4,
    maxCityLevel: 6,
    landmarkId: 'chengdu',
  })
  appendCityCluster(overrides, {
    idPrefix: 'jianye',
    name: '建业',
    startX: 248,
    startY: 236,
    width: 5,
    height: 5,
    owner: 'enemy',
    minCityLevel: 4,
    maxCityLevel: 6,
    landmarkId: 'jianye',
  })
  const resourceBlockedFootprintKeys = buildResourceBlockedWorldCellFootprintKeys(overrides)
  appendResourceCluster(overrides, resourceGenerationPolicy, {
    idPrefix: 'mine',
    name: '矿脉',
    positions: [
      [104, 170],
      [108, 168],
      [112, 166],
      [208, 120],
      [212, 122],
      [216, 124],
      [252, 164],
      [256, 166],
      [260, 168],
    ],
    owner: 'neutral',
    levelBias: 2,
    resourceKind: 'stone',
  }, resourceBlockedFootprintKeys)
  appendResourceCluster(overrides, resourceGenerationPolicy, {
    idPrefix: 'field',
    name: '良田',
    positions: [
      [132, 206],
      [136, 208],
      [140, 210],
      [144, 212],
      [188, 214],
      [194, 216],
      [200, 218],
      [246, 212],
      [252, 214],
    ],
    owner: 'neutral',
    levelBias: 0,
    resourceKind: 'food',
  }, resourceBlockedFootprintKeys)

  const generatedTiles: Tile[] = []
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const override = overrides.get(keyOf(x, y))
      generatedTiles.push(createTileFromGrid(x, y, resourceGenerationPolicy, resourceBlockedFootprintKeys, override))
    }
  }

  applyProvinceBarriers(generatedTiles)
  applyProvincePasses(generatedTiles, overrides)

  const generatedRegions = buildStrategicRegions(generatedTiles)
  const generatedOverlays = buildMapContinuousOverlays(generatedTiles)
  clearResourceTilesFromReservedOverlays(generatedTiles, generatedOverlays)

  return {
    tiles: generatedTiles,
    connections: buildGridConnections(generatedTiles),
    regions: generatedRegions,
    overlays: generatedOverlays,
    resourceGeneration: buildWorldResourceGenerationSummary(generatedTiles, resourceGenerationPolicy),
  }
}

function buildGridConnections(inputTiles: Tile[]) {
  const tileMap = new Map(inputTiles.map((tile) => [keyOf(tile.x, tile.y), tile]))
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  return Object.fromEntries(
    inputTiles.map((tile) => {
      const neighbors = directions
        .map(([dx, dy]) => tileMap.get(keyOf(tile.x + dx, tile.y + dy)))
        .filter((neighbor): neighbor is Tile => !!neighbor)
        .filter((neighbor) => canTraverseBetweenTiles(tile, neighbor))
        .map((neighbor) => neighbor.id)

      return [tile.id, neighbors]
    }),
  )
}

function keyOf(x: number, y: number) {
  return `${x}:${y}`
}

function appendLegacyAnchorTiles(overrides: Map<string, TileOverride>) {
  const legacyAnchors: TileOverride[] = [
    {
      id: 'tile_01',
      name: '寒霜岭',
      type: 'fog',
      owner: 'neutral',
      x: 18,
      y: 46,
      terrain: 'mountain',
      moveCost: 2,
      enemyPressure: 1,
      scoutingDifficulty: 3,
    },
    {
      id: 'tile_02',
      name: '北侧坡地',
      type: 'plain',
      owner: 'neutral',
      x: 19,
      y: 46,
      terrain: 'highland',
      moveCost: 1,
      enemyPressure: 1,
      scoutingDifficulty: 1,
    },
    {
      id: 'tile_03',
      name: '烽烟台',
      type: 'resource',
      owner: 'player',
      x: 20,
      y: 46,
      terrain: 'highland',
      moveCost: 1,
      enemyPressure: 2,
      scoutingDifficulty: 1,
      resourceLevel: 4,
    },
    {
      id: 'tile_04',
      name: '雾林边缘',
      type: 'fog',
      owner: 'neutral',
      x: 21,
      y: 46,
      terrain: 'forest',
      moveCost: 2,
      enemyPressure: 3,
      scoutingDifficulty: 3,
    },
    {
      id: 'tile_05',
      name: '敌前哨',
      type: 'resource',
      owner: 'enemy',
      x: 22,
      y: 46,
      terrain: 'highland',
      moveCost: 1,
      enemyPressure: 4,
      scoutingDifficulty: 2,
      resourceLevel: 5,
    },
    {
      id: 'tile_06',
      name: '西侧关口',
      type: 'pass',
      owner: 'neutral',
      x: 18,
      y: 47,
      terrain: 'mountain',
      moveCost: 2,
      enemyPressure: 2,
      scoutingDifficulty: 2,
      cityLevel: 4,
    },
    {
      id: 'tile_07',
      name: '河谷平原',
      type: 'plain',
      owner: 'player',
      x: 19,
      y: 47,
      terrain: 'riverland',
      moveCost: 1,
      enemyPressure: 1,
      scoutingDifficulty: 1,
    },
    {
      id: 'tile_08',
      name: '青石城',
      type: 'city',
      owner: 'player',
      x: 20,
      y: 47,
      terrain: 'urban',
      moveCost: 1,
      enemyPressure: 1,
      scoutingDifficulty: 1,
      cityLevel: 6,
      district: 'sili',
      landmarkId: 'qingshi',
      landmarkName: '青石城',
    },
    {
      id: 'tile_09',
      name: '北线岔路',
      type: 'plain',
      owner: 'neutral',
      x: 21,
      y: 47,
      terrain: 'highland',
      moveCost: 1,
      enemyPressure: 3,
      scoutingDifficulty: 2,
    },
    {
      id: 'tile_10',
      name: '赤垒要塞',
      type: 'city',
      owner: 'enemy',
      x: 22,
      y: 47,
      terrain: 'urban',
      moveCost: 1,
      enemyPressure: 5,
      scoutingDifficulty: 2,
      cityLevel: 7,
      district: 'sili',
      landmarkId: 'chilei',
      landmarkName: '赤垒要塞',
    },
    {
      id: 'tile_11',
      name: '西南粮仓',
      type: 'resource',
      owner: 'player',
      x: 18,
      y: 48,
      terrain: 'grassland',
      moveCost: 1,
      enemyPressure: 1,
      scoutingDifficulty: 1,
      resourceLevel: 4,
    },
    {
      id: 'tile_12',
      name: '后勤营地',
      type: 'plain',
      owner: 'player',
      x: 19,
      y: 48,
      terrain: 'grassland',
      moveCost: 1,
      enemyPressure: 0,
      scoutingDifficulty: 1,
    },
    {
      id: 'tile_13',
      name: '中军大道',
      type: 'plain',
      owner: 'player',
      x: 20,
      y: 48,
      terrain: 'riverland',
      moveCost: 1,
      enemyPressure: 1,
      scoutingDifficulty: 1,
    },
    {
      id: 'tile_14',
      name: '东线采邑',
      type: 'resource',
      owner: 'neutral',
      x: 21,
      y: 48,
      terrain: 'grassland',
      moveCost: 1,
      enemyPressure: 2,
      scoutingDifficulty: 1,
      resourceLevel: 5,
    },
    {
      id: 'tile_15',
      name: '东侧峡口',
      type: 'pass',
      owner: 'enemy',
      x: 22,
      y: 48,
      terrain: 'mountain',
      moveCost: 2,
      enemyPressure: 4,
      scoutingDifficulty: 2,
      cityLevel: 4,
    },
  ]

  for (const anchor of legacyAnchors) {
    const shiftedAnchor: TileOverride = {
      ...anchor,
      x: anchor.x + LEGACY_ANCHOR_OFFSET_X,
      y: anchor.y + LEGACY_ANCHOR_OFFSET_Y,
    }
    overrides.set(keyOf(shiftedAnchor.x, shiftedAnchor.y), shiftedAnchor)
  }
}

function appendHistoricPassAnchors(overrides: Map<string, TileOverride>) {
  appendPassChain(overrides, [
    [146, 152, '潼关'],
    [150, 154, '函谷关'],
    [170, 156, '虎牢关'],
    [156, 170, '武关'],
    [172, 138, '井陉关'],
    [162, 132, '壶关'],
  ])
}

function appendStrategicFortAnchors(overrides: Map<string, TileOverride>) {
  appendStrategicNodeAnchors(overrides, STRATEGIC_FORT_ANCHORS)
}

function appendStrategicDockAnchors(overrides: Map<string, TileOverride>) {
  appendStrategicNodeAnchors(overrides, STRATEGIC_DOCK_ANCHORS)
}

function appendStrategicNodeAnchors(
  overrides: Map<string, TileOverride>,
  anchors: StrategicNodeAnchor[],
) {
  for (const anchor of anchors) {
    overrides.set(keyOf(anchor.x, anchor.y), {
      ...anchor,
      district: resolveProvinceAt(anchor.x, anchor.y).id,
    })
  }
}

function appendCityCluster(
  overrides: Map<string, TileOverride>,
  config: {
    idPrefix: string
    name: string
    startX: number
    startY: number
    width: number
    height: number
    owner: Tile['owner']
    minCityLevel: number
    maxCityLevel: number
    landmarkId: string
  },
) {
  const centerX = config.startX + (config.width - 1) / 2
  const centerY = config.startY + (config.height - 1) / 2

  for (let localY = 0; localY < config.height; localY += 1) {
    for (let localX = 0; localX < config.width; localX += 1) {
      const x = config.startX + localX
      const y = config.startY + localY
      const distance = Math.abs(centerX - x) + Math.abs(centerY - y)
      const cityLevel = clampNumber(
        config.maxCityLevel - Math.floor(distance / 1.5),
        config.minCityLevel,
        config.maxCityLevel,
      )

      overrides.set(keyOf(x, y), {
        id: `${config.idPrefix}_${localX}_${localY}`,
        name:
          cityLevel >= config.maxCityLevel
            ? `${config.name}皇城`
            : cityLevel >= config.maxCityLevel - 1
              ? `${config.name}内郭`
              : `${config.name}外城`,
        type: 'city',
        owner: config.owner,
        x,
        y,
        terrain: 'urban',
        moveCost: 1,
        enemyPressure:
          config.owner === 'enemy' ? clampNumber(cityLevel + 1, 3, 5) : clampNumber(cityLevel - 1, 1, 4),
        scoutingDifficulty: cityLevel >= 7 ? 3 : 2,
        cityLevel,
        district: resolveProvinceAt(x, y).id,
        landmarkId: config.landmarkId,
        landmarkName: config.name,
      })
    }
  }
}

function appendResourceCluster(
  overrides: Map<string, TileOverride>,
  resourceGenerationPolicy: WorldResourceGenerationPolicy,
  config: {
    idPrefix: string
    name: string
    positions: Array<[number, number]>
    owner: Tile['owner']
    levelBias: number
    resourceKind?: ResourceKind
  },
  resourceBlockedFootprintKeys: ReadonlySet<string> = new Set(),
) {
  for (const [index, position] of config.positions.entries()) {
    const [x, y] = position
    if (resourceBlockedFootprintKeys.has(keyOf(x, y))) {
      continue
    }
    overrides.set(keyOf(x, y), {
      id: `${config.idPrefix}_${index + 1}`,
      name: `${config.name}${index + 1}`,
      type: 'resource',
      owner: config.owner,
      x,
      y,
      terrain: index % 2 === 0 ? 'grassland' : 'highland',
      moveCost: 1,
      enemyPressure: clampNumber(Math.round(x / 22) + config.levelBias, 1, 5),
      scoutingDifficulty: 1,
      resourceLevel: clampNumber(resolveResourceLevel(x, y, resourceGenerationPolicy) + config.levelBias, 1, 9),
      resourceKind: config.resourceKind ?? resolveResourceKind(x, y, resourceGenerationPolicy),
    })
  }
}

function appendPassChain(
  overrides: Map<string, TileOverride>,
  passes: Array<[number, number, string]>,
) {
  for (const [index, pass] of passes.entries()) {
    const [x, y, name] = pass
    overrides.set(keyOf(x, y), {
      id: `pass_${index + 1}`,
      name,
      type: 'pass',
      owner: x < MAP_WIDTH * 0.3 ? 'player' : x > MAP_WIDTH * 0.72 ? 'enemy' : 'neutral',
      x,
      y,
      terrain: 'mountain',
      moveCost: 2,
      enemyPressure: clampNumber(Math.round(x / 64) + 1, 1, 5),
      scoutingDifficulty: 2,
      cityLevel: 3,
      district: resolveProvinceAt(x, y).id,
    })
  }
}

function buildResourceBlockedWorldCellFootprintKeys(overrides: Map<string, TileOverride>) {
  const blockedKeys = new Set<string>()

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const terrain = resolveBaseTerrain(x, y)
      if (terrain === 'mountain' || terrain === 'riverland') {
        blockedKeys.add(keyOf(x, y))
      }
    }
  }

  const cityGroups = new Map<string, TileOverride[]>()
  for (const override of overrides.values()) {
    if (isStrategicNodeTileType(override.type)) {
      reserveCenteredFootprint(blockedKeys, override.x, override.y, 1)
      continue
    }

    if (override.type !== 'city') {
      continue
    }

    const groupKey = override.landmarkId ?? override.id
    const bucket = cityGroups.get(groupKey) ?? []
    bucket.push(override)
    cityGroups.set(groupKey, bucket)
  }

  for (const cityGroup of cityGroups.values()) {
    if (cityGroup.length === 0) {
      continue
    }

    const centerX = cityGroup.reduce((sum, tile) => sum + tile.x, 0) / cityGroup.length
    const centerY = cityGroup.reduce((sum, tile) => sum + tile.y, 0) / cityGroup.length
    const maxCityLevel = cityGroup.reduce((level, tile) => Math.max(level, tile.cityLevel ?? 3), 3)
    const homeCity = cityGroup.some((tile) => tile.id === 'tile_08' || tile.id === 'tile_10')
    const sideLength = homeCity ? 3 : resolveSystemCityFootprintSideLength(maxCityLevel)
    reserveCenteredFootprint(blockedKeys, Math.round(centerX), Math.round(centerY), sideLength)
  }

  return blockedKeys
}

function reserveCenteredFootprint(blockedKeys: Set<string>, centerX: number, centerY: number, sideLength: number) {
  const normalizedSideLength = Math.max(1, Math.floor(sideLength))
  const half = Math.floor(normalizedSideLength / 2)
  for (let localY = -half; localY <= half; localY += 1) {
    for (let localX = -half; localX <= half; localX += 1) {
      const x = centerX + localX
      const y = centerY + localY
      if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) {
        continue
      }
      blockedKeys.add(keyOf(x, y))
    }
  }
}

function resolveSystemCityFootprintSideLength(cityLevel: number) {
  const normalizedLevel = clampNumber(cityLevel, 3, 9)
  if (normalizedLevel >= 9) {
    return 9
  }
  if (normalizedLevel >= 7) {
    return 7
  }
  if (normalizedLevel >= 5) {
    return 5
  }
  return 3
}

function applyProvinceBarriers(tiles: Tile[]) {
  const tileByCoord = new Map(tiles.map((tile) => [keyOf(tile.x, tile.y), tile]))
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  for (const tile of tiles) {
    if (tile.type === 'city' || isStrategicNodeTileType(tile.type) || tile.landmarkId) {
      continue
    }

    const boundaryNeighbor = directions
      .map(([dx, dy]) => tileByCoord.get(keyOf(tile.x + dx, tile.y + dy)))
      .find((neighbor) => neighbor && neighbor.district !== tile.district)

    if (!boundaryNeighbor) {
      continue
    }

    const pairKey = [tile.district ?? 'unknown', boundaryNeighbor.district ?? 'unknown'].sort().join('|')
    const riverBoundary = hashString(pairKey) % 3 === 0
    tile.terrain = riverBoundary ? 'riverland' : 'mountain'
    tile.type = 'plain'
    tile.resourceLevel = undefined
    tile.resourceKind = undefined
    tile.moveCost = 2
    tile.scoutingDifficulty = 3
    tile.enemyPressure = clampNumber(tile.enemyPressure + 1, 0, 5)
  }
}

function applyProvincePasses(tiles: Tile[], overrides: Map<string, TileOverride>) {
  const tileByCoord = new Map(tiles.map((tile) => [keyOf(tile.x, tile.y), tile]))
  const boundaryByPair = new Map<
    string,
    Array<{
      tile: Tile
      neighbor: Tile
      score: number
    }>
  >()

  for (const tile of tiles) {
    const right = tileByCoord.get(keyOf(tile.x + 1, tile.y))
    const down = tileByCoord.get(keyOf(tile.x, tile.y + 1))
    const neighbors = [right, down].filter((neighbor): neighbor is Tile => !!neighbor)

    for (const neighbor of neighbors) {
      if (!tile.district || !neighbor.district || tile.district === neighbor.district) {
        continue
      }

      const pairKey = [tile.district, neighbor.district].sort().join('|')
      const score = tile.x + tile.y + neighbor.x + neighbor.y
      const bucket = boundaryByPair.get(pairKey) ?? []
      bucket.push({ tile, neighbor, score })
      boundaryByPair.set(pairKey, bucket)
    }
  }

  for (const [pairKey, boundaries] of boundaryByPair.entries()) {
    if (boundaries.length === 0) {
      continue
    }

    boundaries.sort((a, b) => a.score - b.score)
    const desiredPassCount = clampNumber(Math.floor(boundaries.length / 70), 2, 4)
    const step = Math.max(1, Math.floor(boundaries.length / desiredPassCount))
    let passIndex = 1

    for (let index = 0; index < boundaries.length && passIndex <= desiredPassCount; index += step) {
      const boundary = boundaries[index]
      const passName = `${pairKey.replace('|', '-')} Pass ${passIndex}`
      markTileAsPass(boundary.tile, passName)
      markTileAsPass(boundary.neighbor, passName)
      passIndex += 1
    }
  }

  for (const override of overrides.values()) {
    const tile = tileByCoord.get(keyOf(override.x, override.y))
    if (!tile) {
      continue
    }
    tile.type = override.type
    tile.terrain = override.terrain ?? tile.terrain
    tile.owner = override.owner
    tile.name = override.name
    tile.moveCost = override.moveCost ?? tile.moveCost
    tile.enemyPressure = override.enemyPressure ?? tile.enemyPressure
    tile.scoutingDifficulty = override.scoutingDifficulty ?? tile.scoutingDifficulty
    tile.resourceLevel = override.resourceLevel ?? (tile.type === 'resource' ? tile.resourceLevel : undefined)
    tile.resourceKind = override.resourceKind ?? (tile.type === 'resource' ? tile.resourceKind : undefined)
    tile.cityLevel = override.cityLevel
    tile.district = override.district ?? tile.district
    tile.landmarkId = override.landmarkId
    tile.landmarkName = override.landmarkName
  }
}

function canTraverseBetweenTiles(from: Tile, to: Tile) {
  if (!from.district || !to.district || from.district === to.district) {
    return true
  }

  return isStrategicNodeTileType(from.type) || isStrategicNodeTileType(to.type)
}

function markTileAsPass(tile: Tile, passName: string) {
  if (tile.landmarkId || tile.type === 'city' || tile.type === 'fort' || tile.type === 'dock') {
    return
  }

  tile.type = 'pass'
  tile.terrain = 'mountain'
  tile.name = tile.id.startsWith('grid_') ? passName : tile.name
  tile.moveCost = 2
  tile.scoutingDifficulty = 2
  tile.cityLevel = tile.cityLevel ?? 3
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }

  return Math.abs(hash)
}

function resolveProvinceAt(x: number, y: number): ProvinceDefinition {
  let nearestProvince = HAN_PROVINCES[0]
  let nearestScore = Number.POSITIVE_INFINITY

  for (const province of HAN_PROVINCES) {
    const dx = x - province.centerX
    const dy = y - province.centerY
    const score = dx * dx + dy * dy * 1.18
    if (score < nearestScore) {
      nearestScore = score
      nearestProvince = province
    }
  }

  return nearestProvince
}

function createTileFromGrid(
  x: number,
  y: number,
  resourceGenerationPolicy: WorldResourceGenerationPolicy,
  resourceBlockedFootprintKeys: ReadonlySet<string>,
  override?: TileOverride,
): Tile {
  const province = resolveProvinceAt(x, y)
  const terrain = override?.terrain ?? resolveBaseTerrain(x, y)
  const type = override?.type ?? resolveBaseTileType(x, y, terrain, resourceGenerationPolicy, resourceBlockedFootprintKeys)
  const owner = override?.owner ?? resolveBaseOwner(x, y)

  return {
    id: override?.id ?? `grid_${x}_${y}`,
    name: override?.name ?? buildBaseTileName(x, y, terrain, type),
    type,
    terrain,
    owner,
    x,
    y,
    moveCost: override?.moveCost ?? resolveMoveCost(terrain, type),
    enemyPressure: override?.enemyPressure ?? resolveEnemyPressure(x, y, owner, type),
    scoutingDifficulty: override?.scoutingDifficulty ?? resolveScoutingDifficulty(terrain, type),
    resourceLevel: override?.resourceLevel ?? (type === 'resource' ? resolveResourceLevel(x, y, resourceGenerationPolicy) : undefined),
    resourceKind: override?.resourceKind ?? (type === 'resource' ? resolveResourceKind(x, y, resourceGenerationPolicy) : undefined),
    cityLevel: override?.cityLevel ?? (type === 'city' ? resolveCityLevel(x, y) : undefined),
    district: override?.district ?? province.id,
    landmarkId: override?.landmarkId,
    landmarkName: override?.landmarkName,
  }
}

function resolveBaseTerrain(x: number, y: number): Tile['terrain'] {
  const province = resolveProvinceAt(x, y)
  const riverLineYellow = 152 + Math.sin(x / 18) * 7
  const riverLineHuai = 224 + Math.sin(x / 14) * 5
  const qinlingLine = 196 + Math.sin(x / 20) * 9
  const taihangLine = 126 + Math.sin(y / 17) * 6

  if (x < 20 || x > MAP_WIDTH - 20 || y < 20 || y > MAP_HEIGHT - 18) {
    return 'wasteland'
  }

  if (Math.abs(y - riverLineYellow) <= 1 || (x > 142 && Math.abs(y - riverLineHuai) <= 1)) {
    return 'riverland'
  }

  if (Math.abs(y - qinlingLine) <= 1 || (y < 206 && Math.abs(x - taihangLine) <= 2)) {
    return 'mountain'
  }

  switch (province.terrainBias) {
    case 'mountain':
      return (x + y) % 5 === 0 ? 'highland' : 'mountain'
    case 'forest':
      return (x + y) % 6 === 0 ? 'highland' : 'forest'
    case 'riverland':
      return (x + y) % 11 === 0 ? 'highland' : 'riverland'
    case 'urban':
      return Math.abs(x - province.centerX) + Math.abs(y - province.centerY) <= 10 ? 'urban' : 'grassland'
    case 'wasteland':
      return (x + y) % 7 === 0 ? 'highland' : 'wasteland'
    case 'highland':
      return (x + y) % 5 === 0 ? 'mountain' : 'highland'
    default:
      return 'grassland'
  }
}

function resolveBaseTileType(
  x: number,
  y: number,
  terrain: Tile['terrain'],
  resourceGenerationPolicy: WorldResourceGenerationPolicy,
  resourceBlockedFootprintKeys: ReadonlySet<string> = new Set(),
): Tile['type'] {
  const province = resolveProvinceAt(x, y)
  const signal = Math.abs((x * 31 + y * 17 + hashString(province.id)) % 211)

  // Fog: only deep edge wasteland + rare deep forest
  if (terrain === 'wasteland' && (x < 8 || x >= MAP_WIDTH - 8 || y < 8 || y >= MAP_HEIGHT - 8)) {
    return 'fog'
  }
  if (terrain === 'forest' && signal % 37 === 0) {
    return 'fog'
  }

  if (terrain === 'mountain' && signal % 41 === 0) {
    return 'pass'
  }

  if (
    (province.id === 'sili' &&
      Math.abs(x - province.centerX) + Math.abs(y - province.centerY) <= 12 &&
      signal % 5 === 0) ||
    (terrain === 'riverland' && signal % 47 === 0)
  ) {
    return 'city'
  }

  if (
    !resourceBlockedFootprintKeys.has(keyOf(x, y))
    && shouldGenerateWorldResourceTile(x, y, province.id, resourceGenerationPolicy)
  ) {
    return 'resource'
  }

  return 'plain'
}

function resolveBaseOwner(x: number, y: number): Tile['owner'] {
  const provinceId = resolveProvinceAt(x, y).id

  if (provinceId === 'liangzhou' || provinceId === 'yizhou') {
    return 'player'
  }

  if (provinceId === 'youzhou' || provinceId === 'qingzhou' || provinceId === 'jiaozhou') {
    return 'enemy'
  }

  if (x <= MAP_WIDTH * 0.24 && y >= MAP_HEIGHT * 0.42) {
    return 'player'
  }

  if (x >= MAP_WIDTH * 0.76 && y >= MAP_HEIGHT * 0.22 && y <= MAP_HEIGHT * 0.8) {
    return 'enemy'
  }

  return 'neutral'
}

function resolveMoveCost(terrain: Tile['terrain'], type: Tile['type']) {
  if (type === 'city') {
    return 1
  }

  if (type === 'pass' || type === 'fort' || terrain === 'mountain') {
    return 2
  }

  if (terrain === 'forest' || terrain === 'wasteland') {
    return 2
  }

  return 1
}

function resolveEnemyPressure(
  x: number,
  y: number,
  owner: Tile['owner'],
  type: Tile['type'],
) {
  const distanceToLuoyang = Math.abs(x - 160) + Math.abs(y - 158)
  let pressure = clampNumber(Math.round(x / 72) + Math.round((220 - distanceToLuoyang) / 90), 0, 5)

  if (owner === 'player') {
    pressure = Math.max(0, pressure - 2)
  } else if (owner === 'enemy') {
    pressure = Math.min(5, pressure + 1)
  }

  if (type === 'city') {
    pressure = Math.min(5, pressure + 1)
  }

  if (type === 'fog') {
    pressure = Math.min(5, pressure + 1)
  }

  return pressure
}

function resolveScoutingDifficulty(terrain: Tile['terrain'], type: Tile['type']) {
  if (type === 'fog' || terrain === 'mountain' || terrain === 'wasteland') {
    return 3
  }

  if (terrain === 'forest' || terrain === 'highland') {
    return 2
  }

  return 1
}

function resolveResourceLevel(
  x: number,
  y: number,
  resourceGenerationPolicy: WorldResourceGenerationPolicy = DEFAULT_WORLD_RESOURCE_GENERATION_POLICY,
) {
  return resolveGeneratedWorldResourceLevel(
    x,
    y,
    resolveProvinceAt(x, y).id,
    resourceGenerationPolicy,
  )
}

function resolveResourceKind(
  x: number,
  y: number,
  resourceGenerationPolicy: WorldResourceGenerationPolicy = DEFAULT_WORLD_RESOURCE_GENERATION_POLICY,
): ResourceKind {
  const province = resolveProvinceAt(x, y)
  return resolveGeneratedWorldResourceKind(
    x,
    y,
    province.id,
    resolveBaseTerrain(x, y),
    resourceGenerationPolicy,
  )
}

function resolveCityLevel(x: number, y: number) {
  return clampNumber(((x + y) % 5) + 2, 2, 7)
}

function buildBaseTileName(
  x: number,
  y: number,
  terrain: Tile['terrain'],
  type: Tile['type'],
) {
  const provinceName = resolveProvinceAt(x, y).name
  if (type === 'resource') {
    return `${provinceName} Resource ${x}-${y}`
  }

  if (type === 'city') {
    return `${provinceName} City ${x}-${y}`
  }

  if (type === 'pass') {
    return `${provinceName} Pass ${x}-${y}`
  }

  if (type === 'fort') {
    return `${provinceName} Fort ${x}-${y}`
  }

  if (type === 'dock') {
    return `${provinceName} Dock ${x}-${y}`
  }

  switch (terrain) {
    case 'forest':
      return `${provinceName} Forest ${x}-${y}`
    case 'highland':
      return `${provinceName} Highland ${x}-${y}`
    case 'mountain':
      return `${provinceName} Ridge ${x}-${y}`
    case 'riverland':
      return `${provinceName} River ${x}-${y}`
    case 'wasteland':
      return `${provinceName} Wasteland ${x}-${y}`
    default:
      return `${provinceName} Plains ${x}-${y}`
  }
}

function buildMapContinuousOverlays(tiles: Tile[]): MapContinuousOverlays {
  const tileByCoord = new Map(tiles.map((tile) => [keyOf(tile.x, tile.y), tile]))

  const mountainRidges = [
    buildContinuousPathOverlay(
      'ridge_qinling',
      '\u79e6\u5cad\u5c71\u8109',
      sampleLineByX(32, MAP_WIDTH - 28, 4, (x) => 196 + Math.sin(x / 20) * 9),
      tileByCoord,
    ),
    buildContinuousPathOverlay(
      'ridge_taihang',
      '\u592a\u884c\u5c71\u8109',
      sampleLineByY(36, 212, 4, (y) => 126 + Math.sin(y / 17) * 6),
      tileByCoord,
    ),
    buildContinuousPathOverlay(
      'ridge_bashan',
      '\u5df4\u5c71\u5c71\u7cfb',
      sampleLineByX(52, 196, 5, (x) => 238 + Math.sin(x / 11) * 7),
      tileByCoord,
    ),
  ].filter((path) => path.nodes.length >= 2)

  const rivers = [
    buildContinuousPathOverlay(
      'river_huanghe',
      '\u9ec4\u6cb3',
      sampleLineByX(24, MAP_WIDTH - 20, 3, (x) => 152 + Math.sin(x / 18) * 7),
      tileByCoord,
    ),
    buildContinuousPathOverlay(
      'river_huaihe',
      '\u6dee\u6cb3',
      sampleLineByX(142, MAP_WIDTH - 20, 3, (x) => 224 + Math.sin(x / 14) * 5),
      tileByCoord,
    ),
    buildContinuousPathOverlay(
      'river_changjiang',
      '\u957f\u6c5f',
      sampleLineByX(60, MAP_WIDTH - 18, 3, (x) => 268 + Math.sin(x / 13) * 6),
      tileByCoord,
    ),
  ].filter((path) => path.nodes.length >= 2)

  return {
    mountainRidges,
    rivers,
    cityClusters: buildCityClusterOverlays(tiles, tileByCoord),
  }
}

function buildContinuousPathOverlay(
  id: string,
  name: string,
  nodes: Array<{ x: number; y: number }>,
  tileByCoord: Map<string, Tile>,
) {
  const normalizedNodes: Array<{ x: number; y: number }> = []
  for (const node of nodes) {
    const x = clampNumber(Math.round(node.x), 0, MAP_WIDTH - 1)
    const y = clampNumber(Math.round(node.y), 0, MAP_HEIGHT - 1)
    const previous = normalizedNodes[normalizedNodes.length - 1]
    if (previous && previous.x === x && previous.y === y) {
      continue
    }
    normalizedNodes.push({ x, y })
  }

  const tileIds = new Set<string>()
  for (const node of normalizedNodes) {
    const tile = tileByCoord.get(keyOf(node.x, node.y))
    if (tile) {
      tileIds.add(tile.id)
    }
  }

  return {
    id,
    name,
    nodes: normalizedNodes,
    tileIds: Array.from(tileIds),
  }
}

function buildCityClusterOverlays(tiles: Tile[], tileByCoord: Map<string, Tile>) {
  const groups = new Map<string, Tile[]>()
  const tileById = new Map(tiles.map((tile) => [tile.id, tile]))

  for (const tile of tiles) {
    if (!tile.landmarkId && tile.type !== 'city') {
      continue
    }

    const key = tile.landmarkId ?? `city_${tile.district ?? 'unknown'}_${Math.floor(tile.x / 8)}_${Math.floor(tile.y / 8)}`
    const bucket = groups.get(key) ?? []
    bucket.push(tile)
    groups.set(key, bucket)
  }

  const clusters: MapContinuousOverlays['cityClusters'] = []
  for (const [id, bucket] of groups.entries()) {
    if (bucket.length === 0) {
      continue
    }

    const centerX = bucket.reduce((sum, tile) => sum + tile.x, 0) / bucket.length
    const centerY = bucket.reduce((sum, tile) => sum + tile.y, 0) / bucket.length
    const centerTile = bucket.reduce((best, tile) => {
      if (!best) {
        return tile
      }
      const bestDistance = Math.abs(best.x - centerX) + Math.abs(best.y - centerY)
      const tileDistance = Math.abs(tile.x - centerX) + Math.abs(tile.y - centerY)
      return tileDistance < bestDistance ? tile : best
    }, bucket[0])

    const sortedTiles = [...bucket].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const footprintTiles = resolveCityFootprintTiles({
      owner: centerTile.owner,
      cityLevel: centerTile.cityLevel,
      tileCount: sortedTiles.length,
      landmarkId: centerTile.landmarkId,
      landmarkName: centerTile.landmarkName,
    })
    const footprintTileIds = resolveCityFootprintTileIds({
      centerX,
      centerY,
      footprintTiles,
      tileByCoord,
      fallbackTiles: sortedTiles,
    })
    const cityHallTileId =
      resolveCityHallTileId({
        tileIds: footprintTileIds,
        tileById,
        centerX,
        centerY,
      }) ?? centerTile.id

    clusters.push({
      id,
      name: centerTile.landmarkName ?? centerTile.name,
      centerTileId: centerTile.id,
      cityHallTileId,
      tileIds: footprintTileIds,
      district: centerTile.district,
      owner: centerTile.owner,
      camp: (centerTile.owner === 'player'
        ? 'human_controlled'
        : centerTile.owner === 'neutral'
          ? 'neutral'
          : 'autonomous') as CityCamp,
      footprintTiles,
      footprintTier: resolveCityFootprintTier(footprintTiles),
      upgradeCapTiles: footprintTiles,
      isUpgradeable: false,
      techLevels: createInitialCityTechLevels(footprintTiles, centerTile.owner === 'player'),
    })
  }

  return clusters
}

function clearResourceTilesFromReservedOverlays(tiles: Tile[], overlays: MapContinuousOverlays) {
  const tileById = new Map(tiles.map((tile) => [tile.id, tile]))
  const reservedTileIds = new Set<string>()

  for (const cluster of overlays.cityClusters) {
    for (const tileId of cluster.tileIds) {
      reservedTileIds.add(tileId)
    }
  }

  for (const path of overlays.mountainRidges) {
    for (const tileId of path.tileIds) {
      reservedTileIds.add(tileId)
    }
  }

  for (const path of overlays.rivers) {
    for (const tileId of path.tileIds) {
      reservedTileIds.add(tileId)
    }
  }

  for (const tileId of reservedTileIds) {
    const tile = tileById.get(tileId)
    if (!tile || tile.type !== 'resource') {
      continue
    }

    tile.type = 'plain'
    tile.resourceLevel = undefined
    tile.resourceKind = undefined
  }
}

function resolveCityFootprintTiles(params: {
  owner: Tile['owner']
  cityLevel?: number
  tileCount: number
  landmarkId?: string
  landmarkName?: string
}): CityFootprintTiles {
  const cityLevel = params.cityLevel ?? 1

  const landmarkId = params.landmarkId ?? ''
  const landmarkName = params.landmarkName ?? ''
  if (landmarkId === 'qingshi' || landmarkId === 'chilei') {
    return 9
  }

  if (
    landmarkId === 'luoyang' ||
    landmarkName.includes('\u6d1b\u9633')
  ) {
    return 81
  }

  if (params.landmarkId || params.tileCount >= 9) {
    return resolveSystemCityFootprintTiles(cityLevel)
  }

  return 9
}

function resolveSystemCityFootprintTiles(cityLevel: number): CityFootprintTiles {
  const sideLength = resolveSystemCityFootprintSideLength(cityLevel)
  return (sideLength * sideLength) as CityFootprintTiles
}

function createInitialCityTechLevels(footprintTiles: CityFootprintTiles, isPlayerCity: boolean): CityTechLevels {
  const tierBase =
    footprintTiles === 9 ? 3 :
      footprintTiles === 25 ? 4 :
        footprintTiles === 49 ? 5 : 6
  const bonus = isPlayerCity ? 1 : 0

  return {
    governance: Math.max(0, Math.min(5, tierBase + bonus)),
    logistics: Math.max(0, Math.min(5, tierBase + bonus - 1)),
    defense: Math.max(0, Math.min(5, tierBase + bonus)),
    recruitment: Math.max(0, Math.min(5, tierBase + bonus - 1)),
  }
}

function resolveCityFootprintTier(footprintTiles: CityFootprintTiles) {
  switch (footprintTiles) {
    case 9:
      return 'city_3x3' as const
    case 25:
      return 'city_5x5' as const
    case 49:
      return 'city_7x7' as const
    default:
      return 'city_9x9' as const
  }
}

function resolveCityFootprintTileIds(params: {
  centerX: number
  centerY: number
  footprintTiles: CityFootprintTiles
  tileByCoord: Map<string, Tile>
  fallbackTiles: Tile[]
}) {
  const sideLength = Math.round(Math.sqrt(params.footprintTiles))
  const startX = Math.round(params.centerX - (sideLength - 1) / 2)
  const startY = Math.round(params.centerY - (sideLength - 1) / 2)
  const selectedTiles: Tile[] = []
  const selectedIds = new Set<string>()

  for (let localY = 0; localY < sideLength; localY += 1) {
    for (let localX = 0; localX < sideLength; localX += 1) {
      const tile = params.tileByCoord.get(keyOf(startX + localX, startY + localY))
      if (!tile || selectedIds.has(tile.id)) {
        continue
      }

      selectedTiles.push(tile)
      selectedIds.add(tile.id)
    }
  }

  const fallbackTiles = [...params.fallbackTiles].sort((a, b) => {
    const aDistance = Math.abs(a.x - params.centerX) + Math.abs(a.y - params.centerY)
    const bDistance = Math.abs(b.x - params.centerX) + Math.abs(b.y - params.centerY)
    if (aDistance !== bDistance) {
      return aDistance - bDistance
    }

    if (a.y !== b.y) {
      return a.y - b.y
    }

    if (a.x !== b.x) {
      return a.x - b.x
    }

    return a.id.localeCompare(b.id)
  })

  for (const tile of fallbackTiles) {
    if (selectedTiles.length >= params.footprintTiles) {
      break
    }

    if (selectedIds.has(tile.id)) {
      continue
    }

    selectedTiles.push(tile)
    selectedIds.add(tile.id)
  }

  if (selectedTiles.length === 0) {
    return []
  }

  return selectedTiles
    .sort((a, b) => {
      if (a.y !== b.y) {
        return a.y - b.y
      }

      if (a.x !== b.x) {
        return a.x - b.x
      }

      return a.id.localeCompare(b.id)
    })
    .slice(0, params.footprintTiles)
    .map((tile) => tile.id)
}

function resolveCityHallTileId(params: {
  tileIds: string[]
  tileById: Map<string, Tile>
  centerX: number
  centerY: number
}) {
  let bestTileId: string | undefined
  let bestDistance = Number.POSITIVE_INFINITY

  for (const tileId of params.tileIds) {
    const tile = params.tileById.get(tileId)
    if (!tile) {
      continue
    }

    const distance = Math.abs(tile.x - params.centerX) + Math.abs(tile.y - params.centerY)
    if (distance < bestDistance) {
      bestDistance = distance
      bestTileId = tile.id
      continue
    }

    if (distance === bestDistance && bestTileId && tile.id.localeCompare(bestTileId) < 0) {
      bestTileId = tile.id
    }
  }

  return bestTileId
}

function sampleLineByX(
  startX: number,
  endX: number,
  step: number,
  resolveY: (x: number) => number,
) {
  const nodes: Array<{ x: number; y: number }> = []
  for (let x = startX; x <= endX; x += Math.max(1, step)) {
    nodes.push({ x, y: resolveY(x) })
  }

  return nodes
}

function sampleLineByY(
  startY: number,
  endY: number,
  step: number,
  resolveX: (y: number) => number,
) {
  const nodes: Array<{ x: number; y: number }> = []
  for (let y = startY; y <= endY; y += Math.max(1, step)) {
    nodes.push({ x: resolveX(y), y })
  }

  return nodes
}

function buildStrategicRegions(inputTiles: Tile[]): MapRegion[] {
  const legacyX = LEGACY_ANCHOR_OFFSET_X
  const legacyY = LEGACY_ANCHOR_OFFSET_Y
  const regionDefinitions = [
    {
      id: 'west_front',
      name: 'West Gate Front',
      role: 'frontier',
      priority: 'high',
      centerTileId: 'tile_06',
      summary: 'Legacy frontline around west gate where opening battles start.',
      predicate: (tile: Tile) =>
        tile.x >= legacyX + 14 && tile.x <= legacyX + 20 && tile.y >= legacyY + 43 && tile.y <= legacyY + 55,
    },
    {
      id: 'north_recon',
      name: 'North Recon Belt',
      role: 'recon',
      priority: 'high',
      centerTileId: 'tile_04',
      summary: 'Fog and highland belt for intel-first scouting.',
      predicate: (tile: Tile) =>
        tile.x >= legacyX + 17 && tile.x <= legacyX + 31 && tile.y >= legacyY + 35 && tile.y <= legacyY + 48,
    },
    {
      id: 'central_base',
      name: 'Central Logistics',
      role: 'support',
      priority: 'medium',
      centerTileId: 'tile_08',
      summary: 'Main supply and reserve coordination area around Qingshi.',
      predicate: (tile: Tile) =>
        tile.x >= legacyX + 17 && tile.x <= legacyX + 25 && tile.y >= legacyY + 45 && tile.y <= legacyY + 56,
    },
    {
      id: 'east_expansion',
      name: 'East Expansion Belt',
      role: 'resource',
      priority: 'medium',
      centerTileId: 'tile_14',
      summary: 'Resource-growth corridor for controlled expansion.',
      predicate: (tile: Tile) =>
        tile.x >= legacyX + 20 && tile.x <= legacyX + 36 && tile.y >= legacyY + 44 && tile.y <= legacyY + 60,
    },
    {
      id: 'luoyang_core',
      name: 'Luoyang Core',
      role: 'frontier',
      priority: 'high',
      centerTileId: 'luoyang_3_3',
      summary: 'Central capital cluster in the middle of the 100k-tile board.',
      predicate: (tile: Tile) => tile.landmarkId === 'luoyang',
    },
    {
      id: 'central_plains',
      name: 'Central Plains',
      role: 'resource',
      priority: 'medium',
      centerTileId: 'field_6',
      summary: 'Yuzhou-Yanzhou-Xuzhou economic axis.',
      predicate: (tile: Tile) => ['yuzhou', 'yanzhou', 'xuzhou'].includes(tile.district ?? ''),
    },
    {
      id: 'eastern_ridge',
      name: 'Northern Ridge Line',
      role: 'frontier',
      priority: 'high',
      centerTileId: 'pass_5',
      summary: 'Bingzhou-Jizhou-Youzhou mountain defense and pass warfare.',
      predicate: (tile: Tile) => ['bingzhou', 'jizhou', 'youzhou', 'qingzhou'].includes(tile.district ?? ''),
    },
    {
      id: 'southern_granary',
      name: 'Southern Granary',
      role: 'support',
      priority: 'medium',
      centerTileId: 'hejian_1_1',
      summary: 'Jingzhou-Yangzhou-Yizhou rear support and farming belt.',
      predicate: (tile: Tile) => ['jingzhou', 'yangzhou', 'yizhou'].includes(tile.district ?? ''),
    },
  ] as const

  return regionDefinitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    role: definition.role,
    priority: definition.priority,
    centerTileId: definition.centerTileId,
    tileIds: inputTiles.filter(definition.predicate).map((tile) => tile.id),
    summary: definition.summary,
  }))
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
