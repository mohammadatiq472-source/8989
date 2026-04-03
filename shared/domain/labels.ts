/**
 * 共享标签/格式化工具函数，供前端面板和服务端共用。
 * 原 src/game/utils/labels.ts 提升至 shared/domain/ 层。
 */

import type {
  AllianceStance,
  NarrativeEvent,
  TacticalOverride,
  TacticalTemplate,
  Tile,
  Unit,
  WorldState,
} from '../contracts/game'
import { getTileById } from './rules'
import { getHeroPoolEntryById } from './heroPool'

// ─── 叙事事件标签 ────────────────────────────────────────────
export const NARRATIVE_TYPE_LABELS: Record<NarrativeEvent['type'], string> = {
  battle: '战斗',
  diplomacy: '外交',
  betrayal: '背叛',
  achievement: '战果',
  failure: '失利',
}

export const NARRATIVE_SIGNIFICANCE_LABELS: Record<NarrativeEvent['significance'], string> = {
  minor: '轻微',
  major: '重大',
  epic: '史诗',
}

// ─── 城市标签 ────────────────────────────────────────────────
export function cityCampLabel(camp: 'human_controlled' | 'autonomous' | 'neutral') {
  switch (camp) {
    case 'human_controlled':
      return '我方城池'
    case 'autonomous':
      return '自治城池'
    case 'neutral':
      return '中立城池'
  }
}

export function cityTechStatusLabel(status: 'locked' | 'active' | 'max') {
  switch (status) {
    case 'locked':
      return '锁定'
    case 'active':
      return '研究中'
    case 'max':
      return '已满级'
  }
}

// ─── 英雄/武将标签 ────────────────────────────────────────────
export function heroArchetypeLabel(archetype: Unit['hero']['archetype']) {
  switch (archetype) {
    case 'assault':
      return '突击'
    case 'recon':
      return '侦察'
    case 'guard':
      return '守备'
    case 'mobile':
      return '机动'
    case 'heavy':
      return '重装'
    case 'logistics':
      return '后勤'
    case 'reserve':
      return '预备'
  }
}

export function troopTypeLabel(troopType: Unit['hero']['troopType']) {
  switch (troopType) {
    case 'infantry':
      return '步军'
    case 'cavalry':
      return '骑军'
    case 'shield':
      return '枪盾'
    case 'mixed':
      return '混成'
    case 'supply':
      return '辎重'
  }
}

export function heroFactionTone(faction: Unit['hero']['faction']) {
  switch (faction) {
    case '魏':
      return 'wei'
    case '蜀':
      return 'shu'
    case '吴':
      return 'wu'
    case '群':
      return 'qun'
    case '未知':
      return 'neutral'
  }
}

export function heroVisualMonogram(name: string) {
  return name.length <= 2 ? name : name.slice(0, 2)
}

export function heroDisplayName(heroId: string) {
  return getHeroPoolEntryById(heroId).name
}

export function formatHeroIdList(heroIds: string[]) {
  if (heroIds.length === 0) {
    return '暂无'
  }
  return heroIds.slice(0, 6).map(heroDisplayName).join('、')
}

// ─── 战术模板标签 ────────────────────────────────────────────
export function templateTargetScopeLabel(scope: TacticalTemplate['targetScope']) {
  switch (scope) {
    case 'self':
      return '原地/支点'
    case 'neighbor':
      return '相邻地块'
    case 'frontline':
      return '前沿目标'
    case 'region':
      return '战区漫游'
  }
}

export function overrideTemplateLabel(templateId: TacticalOverride['templateId']) {
  switch (templateId) {
    case 'rally':
      return '集结'
    case 'harass':
      return '牵制'
    case 'withdraw':
      return '撤回'
    case 'breakthrough':
      return '重点突破'
    case 'sweep':
      return '扫荡'
    case 'garrison':
      return '驻防'
  }
}

export function overrideStatusTone(override: TacticalOverride) {
  if (override.status === 'committed') {
    return 'recommended'
  }
  if (override.status === 'failed') {
    return 'risky'
  }
  return 'safe'
}

// ─── 地块/地形标签 ────────────────────────────────────────────
export function tileTypeLabel(tileType: Tile['type']) {
  switch (tileType) {
    case 'plain':
      return '平原'
    case 'resource':
      return '资源点'
    case 'pass':
      return '关口'
    case 'city':
      return '城池'
    case 'fog':
      return '雾区'
  }
}

export function ownerLabel(owner: Tile['owner']) {
  if (!owner || owner === 'neutral') return '中立'
  return `阵营(${owner})`
}

export function describeTile(tile: Tile) {
  const typeMap: Record<Tile['type'], string> = {
    plain: '平原',
    resource: '资源点',
    pass: '关口',
    city: '城池',
    fog: '雾区',
  }
  const terrainMap: Record<Tile['terrain'], string> = {
    grassland: '草地',
    forest: '林地',
    highland: '高坡',
    mountain: '山地',
    riverland: '河谷',
    urban: '城坊',
    wasteland: '荒原',
  }
  const extra = [
    tile.resourceLevel ? `资源 Lv.${tile.resourceLevel}` : '',
    tile.cityLevel ? `城建 Lv.${tile.cityLevel}` : '',
    tile.landmarkName ? `地标 ${tile.landmarkName}` : '',
  ]
    .filter(Boolean)
    .join(' / ')

  return `${typeMap[tile.type]}，地形 ${terrainMap[tile.terrain]}，归属 ${ownerLabel(tile.owner)}，移动耗时 ${tile.moveCost}${extra ? `，${extra}` : ''}。`
}

export function describeUnit(world: WorldState, unit: Unit) {
  const tile = getTileById(world, unit.tileId)
  return `${unit.hero.title}${unit.hero.name} 率 ${unit.corps.name} 位于 ${tile?.name ?? unit.tileId}，兵种 ${troopTypeLabel(unit.hero.troopType)}，机动力 ${unit.mobility}，补给 ${unit.supply}，当前状态 ${unit.status}。`
}

// ─── 叙事事件格式化 ────────────────────────────────────────────
export function narrativeTypeLabel(type: NarrativeEvent['type']) {
  return NARRATIVE_TYPE_LABELS[type] ?? type
}

export function narrativeSignificanceLabel(significance: NarrativeEvent['significance']) {
  return NARRATIVE_SIGNIFICANCE_LABELS[significance] ?? significance
}

export function formatNarrativeActors(
  actors: string[],
  unitById: Record<string, Unit>,
  tileById: Record<string, Tile>,
) {
  if (actors.length === 0) return '未知'

  const labels = actors.map((actor) => {
    if (actor === 'commander') return '盟主'
    const unit = unitById[actor]
    if (unit) return unit.hero.name
    const tile = tileById[actor]
    if (tile) return tile.name
    return actor
  })

  return labels.slice(0, 6).join('、')
}

// ─── 同盟姿态 ────────────────────────────────────────────────
export function allianceStanceLabel(stance: AllianceStance) {
  switch (stance) {
    case 'hold':
      return '稳守'
    case 'support':
      return '策应'
    case 'harass':
      return '骚扰'
    case 'expand':
      return '扩张'
  }
}
