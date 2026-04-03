/**
 * 武将招募与升星系统
 *
 * 包含：
 * - 武将模板池（HeroTemplate 定义，基于 STZB 逆向数据）
 * - 招募抽卡逻辑（普通池/精英池）
 * - 升星机制（消耗同模板武将实例进行升红星）
 * - 属性加成分配
 */

import type {
  GeneralInstance,
  HeroQualityTier,
  HeroTemplate,
  RecruitPoolType,
  RecruitResult,
  StarAttributeAllocation,
  StarUpgradeRequest,
} from '../contracts/game'
import { STAR_UPGRADE_BONUS_PER_STAR, ARMY_SLOT_THRESHOLDS } from '../contracts/game'

// ─── 武将模板池 ─────────────────────────────

const heroTemplates: HeroTemplate[] = [
  // ── 5星 SSR（最高潜力，cost=4.0，maxLevel=30） ──
  { id: '100661', name: '吕布', faction: '群', cardType: '骑', qualityTier: 5, maxLevel: 30, baseForce: 97, baseCommand: 62, baseIntelligence: 38, baseCharisma: 55, baseSpeed: 85, growthForce: 229, growthCommand: 120, growthIntelligence: 80, growthCharisma: 90, growthSpeed: 180, skillName: '天下无双', archetype: 'heavy', troopType: 'cavalry', tags: ['爆发', '决战', '威慑'] },
  { id: '100451', name: '关羽', faction: '蜀', cardType: '骑', qualityTier: 5, maxLevel: 30, baseForce: 92, baseCommand: 78, baseIntelligence: 55, baseCharisma: 88, baseSpeed: 72, growthForce: 200, growthCommand: 170, growthIntelligence: 110, growthCharisma: 150, growthSpeed: 140, skillName: '樊渊泅囚', archetype: 'assault', troopType: 'cavalry', tags: ['突击', '压线', '突破'] },
  { id: '100023', name: '曹操', faction: '魏', cardType: '骑', qualityTier: 5, maxLevel: 30, baseForce: 72, baseCommand: 95, baseIntelligence: 88, baseCharisma: 96, baseSpeed: 68, growthForce: 150, growthCommand: 210, growthIntelligence: 185, growthCharisma: 200, growthSpeed: 130, skillName: '魏武之世', archetype: 'reserve', troopType: 'cavalry', tags: ['统御', '增益', '总揽'] },
  { id: '100016', name: '刘备', faction: '蜀', cardType: '步', qualityTier: 5, maxLevel: 30, baseForce: 60, baseCommand: 85, baseIntelligence: 75, baseCharisma: 98, baseSpeed: 55, growthForce: 120, growthCommand: 180, growthIntelligence: 160, growthCharisma: 210, growthSpeed: 100, skillName: '皇裔流离', archetype: 'reserve', troopType: 'shield', tags: ['稳军', '恢复', '补位'] },
  { id: '100017', name: '诸葛亮', faction: '蜀', cardType: '步', qualityTier: 5, maxLevel: 30, baseForce: 45, baseCommand: 92, baseIntelligence: 98, baseCharisma: 90, baseSpeed: 50, growthForce: 90, growthCommand: 195, growthIntelligence: 230, growthCharisma: 185, growthSpeed: 95, skillName: '诸葛锦囊', archetype: 'recon', troopType: 'infantry', tags: ['筹划', '侦测', '控场'] },
  { id: '100472', name: '司马懿', faction: '魏', cardType: '步', qualityTier: 5, maxLevel: 30, baseForce: 52, baseCommand: 90, baseIntelligence: 96, baseCharisma: 82, baseSpeed: 48, growthForce: 100, growthCommand: 190, growthIntelligence: 220, growthCharisma: 170, growthSpeed: 92, skillName: '破凰', archetype: 'reserve', troopType: 'infantry', tags: ['谋略', '消耗', '节奏'] },
  { id: '100021', name: '赵云', faction: '蜀', cardType: '步', qualityTier: 5, maxLevel: 30, baseForce: 88, baseCommand: 80, baseIntelligence: 65, baseCharisma: 82, baseSpeed: 90, growthForce: 190, growthCommand: 170, growthIntelligence: 130, growthCharisma: 160, growthSpeed: 195, skillName: '银龙冲阵', archetype: 'mobile', troopType: 'infantry', tags: ['机动', '突前', '抢点'] },
  { id: '100031', name: '周瑜', faction: '吴', cardType: '弓', qualityTier: 5, maxLevel: 30, baseForce: 50, baseCommand: 88, baseIntelligence: 95, baseCharisma: 85, baseSpeed: 58, growthForce: 100, growthCommand: 185, growthIntelligence: 210, growthCharisma: 175, growthSpeed: 115, skillName: '玄武洰流', archetype: 'reserve', troopType: 'mixed', tags: ['谋略', '压制', '协同'] },

  // ── 4星 SR（高潜力，cost=3.0~3.5，maxLevel=30） ──
  { id: '100027', name: '张辽', faction: '魏', cardType: '骑', qualityTier: 4, maxLevel: 30, baseForce: 85, baseCommand: 78, baseIntelligence: 58, baseCharisma: 70, baseSpeed: 88, growthForce: 185, growthCommand: 165, growthIntelligence: 115, growthCharisma: 140, growthSpeed: 190, skillName: '其疾如风', archetype: 'mobile', troopType: 'cavalry', tags: ['奔袭', '绕后', '追击'] },
  { id: '100476', name: '郭嘉', faction: '魏', cardType: '骑', qualityTier: 4, maxLevel: 30, baseForce: 42, baseCommand: 75, baseIntelligence: 92, baseCharisma: 78, baseSpeed: 65, growthForce: 85, growthCommand: 155, growthIntelligence: 200, growthCharisma: 160, growthSpeed: 130, skillName: '奇佐鬼谋', archetype: 'recon', troopType: 'cavalry', tags: ['控场', '侦测', '扰乱'] },
  { id: '100035', name: '吕蒙', faction: '吴', cardType: '弓', qualityTier: 4, maxLevel: 30, baseForce: 72, baseCommand: 80, baseIntelligence: 78, baseCharisma: 68, baseSpeed: 75, growthForce: 145, growthCommand: 168, growthIntelligence: 165, growthCharisma: 135, growthSpeed: 155, skillName: '白衣渡江', archetype: 'recon', troopType: 'mixed', tags: ['侦察', '奇袭', '压前'] },
  { id: '100450', name: '孙策', faction: '吴', cardType: '骑', qualityTier: 4, maxLevel: 30, baseForce: 88, baseCommand: 72, baseIntelligence: 48, baseCharisma: 80, baseSpeed: 82, growthForce: 188, growthCommand: 148, growthIntelligence: 95, growthCharisma: 165, growthSpeed: 170, skillName: '霸王渡江', archetype: 'assault', troopType: 'cavalry', tags: ['突击', '滚动推进', '先手'] },
  { id: '100013', name: '马超', faction: '群', cardType: '骑', qualityTier: 4, maxLevel: 30, baseForce: 90, baseCommand: 65, baseIntelligence: 42, baseCharisma: 60, baseSpeed: 85, growthForce: 195, growthCommand: 130, growthIntelligence: 82, growthCharisma: 120, growthSpeed: 180, skillName: '血溅黄砂', archetype: 'assault', troopType: 'cavalry', tags: ['骑突', '追猎', '爆发'] },
  { id: '100478', name: '陆逊', faction: '吴', cardType: '步', qualityTier: 4, maxLevel: 30, baseForce: 48, baseCommand: 82, baseIntelligence: 90, baseCharisma: 75, baseSpeed: 55, growthForce: 95, growthCommand: 172, growthIntelligence: 195, growthCharisma: 152, growthSpeed: 108, skillName: '火势风威', archetype: 'reserve', troopType: 'infantry', tags: ['火攻', '区域压制', '筹划'] },
  { id: '100452', name: '张飞', faction: '蜀', cardType: '步', qualityTier: 4, maxLevel: 30, baseForce: 92, baseCommand: 70, baseIntelligence: 35, baseCharisma: 45, baseSpeed: 72, growthForce: 200, growthCommand: 142, growthIntelligence: 68, growthCharisma: 88, growthSpeed: 145, skillName: '据水断桥', archetype: 'guard', troopType: 'infantry', tags: ['威慑', '守关', '反击'] },
  { id: '100020', name: '典韦', faction: '魏', cardType: '步', qualityTier: 4, maxLevel: 30, baseForce: 90, baseCommand: 55, baseIntelligence: 30, baseCharisma: 42, baseSpeed: 70, growthForce: 198, growthCommand: 110, growthIntelligence: 58, growthCharisma: 82, growthSpeed: 140, skillName: '古之恶来', archetype: 'guard', troopType: 'shield', tags: ['护卫', '死战', '抗压'] },
  { id: '100442', name: '黄忠', faction: '蜀', cardType: '步', qualityTier: 4, maxLevel: 30, baseForce: 85, baseCommand: 72, baseIntelligence: 45, baseCharisma: 55, baseSpeed: 48, growthForce: 185, growthCommand: 148, growthIntelligence: 88, growthCharisma: 108, growthSpeed: 92, skillName: '定军扬威', archetype: 'heavy', troopType: 'shield', tags: ['火力', '定点压制', '稳打'] },
  { id: '100449', name: '夏侯惇', faction: '魏', cardType: '骑', qualityTier: 4, maxLevel: 30, baseForce: 82, baseCommand: 75, baseIntelligence: 42, baseCharisma: 65, baseSpeed: 72, growthForce: 175, growthCommand: 155, growthIntelligence: 82, growthCharisma: 130, growthSpeed: 145, skillName: '盲侯奋勇', archetype: 'guard', troopType: 'shield', tags: ['抗线', '反击', '驻守'] },
  { id: '100656', name: '高顺', faction: '群', cardType: '骑', qualityTier: 4, maxLevel: 30, baseForce: 85, baseCommand: 72, baseIntelligence: 38, baseCharisma: 48, baseSpeed: 68, growthForce: 182, growthCommand: 148, growthIntelligence: 75, growthCharisma: 95, growthSpeed: 135, skillName: '登锋陷阵', archetype: 'heavy', troopType: 'cavalry', tags: ['重压', '攻坚', '前顶'] },

  // ── 3星 R（中等潜力，maxLevel=25） ──
  { id: '100369', name: '华佗', faction: '未知', cardType: '步', qualityTier: 3, maxLevel: 25, baseForce: 25, baseCommand: 55, baseIntelligence: 82, baseCharisma: 70, baseSpeed: 40, growthForce: 48, growthCommand: 110, growthIntelligence: 170, growthCharisma: 140, growthSpeed: 78, skillName: '去疾', archetype: 'logistics', troopType: 'supply', tags: ['恢复', '后勤', '续航'] },
  { id: '100526', name: '张机', faction: '未知', cardType: '弓', qualityTier: 3, maxLevel: 25, baseForce: 28, baseCommand: 52, baseIntelligence: 78, baseCharisma: 65, baseSpeed: 42, growthForce: 52, growthCommand: 105, growthIntelligence: 162, growthCharisma: 132, growthSpeed: 82, skillName: '金匮要略', archetype: 'logistics', troopType: 'supply', tags: ['恢复', '支援', '维持'] },
  { id: '100029', name: '张春华', faction: '魏', cardType: '弓', qualityTier: 3, maxLevel: 25, baseForce: 42, baseCommand: 60, baseIntelligence: 75, baseCharisma: 65, baseSpeed: 62, growthForce: 82, growthCommand: 122, growthIntelligence: 155, growthCharisma: 130, growthSpeed: 125, skillName: '强势', archetype: 'recon', troopType: 'mixed', tags: ['扰乱', '压制', '穿插'] },
  { id: '100090', name: '太史慈', faction: '吴', cardType: '弓', qualityTier: 3, maxLevel: 25, baseForce: 78, baseCommand: 62, baseIntelligence: 48, baseCharisma: 55, baseSpeed: 75, growthForce: 160, growthCommand: 125, growthIntelligence: 95, growthCharisma: 108, growthSpeed: 152, skillName: '方阵突击', archetype: 'recon', troopType: 'mixed', tags: ['观察', '点杀', '扫荡'] },
  { id: '100036', name: '孙尚香', faction: '吴', cardType: '弓', qualityTier: 3, maxLevel: 25, baseForce: 62, baseCommand: 55, baseIntelligence: 52, baseCharisma: 72, baseSpeed: 78, growthForce: 125, growthCommand: 110, growthIntelligence: 105, growthCharisma: 145, growthSpeed: 158, skillName: '枭姬', archetype: 'mobile', troopType: 'mixed', tags: ['远袭', '清点', '策应'] },
  { id: '100005', name: '貂蝉', faction: '未知', cardType: '弓', qualityTier: 3, maxLevel: 25, baseForce: 30, baseCommand: 45, baseIntelligence: 72, baseCharisma: 95, baseSpeed: 55, growthForce: 58, growthCommand: 88, growthIntelligence: 148, growthCharisma: 195, growthSpeed: 108, skillName: '闭月', archetype: 'recon', troopType: 'mixed', tags: ['魅惑', '牵制', '控场'] },
  { id: '100028', name: '荀彧', faction: '魏', cardType: '弓', qualityTier: 3, maxLevel: 25, baseForce: 28, baseCommand: 68, baseIntelligence: 88, baseCharisma: 82, baseSpeed: 42, growthForce: 55, growthCommand: 138, growthIntelligence: 180, growthCharisma: 168, growthSpeed: 82, skillName: '驱虎吞狼', archetype: 'recon', troopType: 'supply', tags: ['内政', '筹谋', '稳定'] },
  { id: '100025', name: '鲁肃', faction: '吴', cardType: '弓', qualityTier: 3, maxLevel: 25, baseForce: 32, baseCommand: 62, baseIntelligence: 78, baseCharisma: 85, baseSpeed: 45, growthForce: 62, growthCommand: 125, growthIntelligence: 160, growthCharisma: 172, growthSpeed: 88, skillName: '大义凛然', archetype: 'logistics', troopType: 'supply', tags: ['外交', '联盟', '稳定'] },
  { id: '100337', name: '甄姬', faction: '魏', cardType: '弓', qualityTier: 3, maxLevel: 25, baseForce: 25, baseCommand: 48, baseIntelligence: 65, baseCharisma: 88, baseSpeed: 50, growthForce: 48, growthCommand: 95, growthIntelligence: 132, growthCharisma: 180, growthSpeed: 98, skillName: '洛神赋', archetype: 'logistics', troopType: 'supply', tags: ['恢复', '鼓舞', '辅助'] },
  { id: '100474', name: '张宁', faction: '群', cardType: '步', qualityTier: 3, maxLevel: 25, baseForce: 38, baseCommand: 58, baseIntelligence: 72, baseCharisma: 68, baseSpeed: 55, growthForce: 75, growthCommand: 118, growthIntelligence: 148, growthCharisma: 138, growthSpeed: 108, skillName: '黄天余音', archetype: 'logistics', troopType: 'supply', tags: ['恢复', '鼓舞', '稳定'] },

  // ── 2星 UC（低潜力，maxLevel=25，但容易获取，容易满星） ──
  { id: '200001', name: '廖化', faction: '蜀', cardType: '骑', qualityTier: 2, maxLevel: 25, baseForce: 65, baseCommand: 50, baseIntelligence: 35, baseCharisma: 40, baseSpeed: 62, growthForce: 130, growthCommand: 100, growthIntelligence: 68, growthCharisma: 78, growthSpeed: 125, skillName: '先锋突阵', archetype: 'mobile', troopType: 'cavalry', tags: ['先锋', '冲锋', '填线'] },
  { id: '200002', name: '潘凤', faction: '群', cardType: '步', qualityTier: 2, maxLevel: 25, baseForce: 70, baseCommand: 42, baseIntelligence: 28, baseCharisma: 35, baseSpeed: 55, growthForce: 142, growthCommand: 82, growthIntelligence: 55, growthCharisma: 68, growthSpeed: 108, skillName: '上将威名', archetype: 'assault', troopType: 'infantry', tags: ['挑战', '蛮力', '搏杀'] },
  { id: '200003', name: '纪灵', faction: '群', cardType: '步', qualityTier: 2, maxLevel: 25, baseForce: 68, baseCommand: 48, baseIntelligence: 32, baseCharisma: 38, baseSpeed: 50, growthForce: 138, growthCommand: 95, growthIntelligence: 62, growthCharisma: 75, growthSpeed: 98, skillName: '三尖两刃', archetype: 'guard', troopType: 'shield', tags: ['守备', '持久', '消耗'] },
  { id: '200004', name: '陈到', faction: '蜀', cardType: '步', qualityTier: 2, maxLevel: 25, baseForce: 62, baseCommand: 58, baseIntelligence: 40, baseCharisma: 52, baseSpeed: 55, growthForce: 125, growthCommand: 118, growthIntelligence: 78, growthCharisma: 105, growthSpeed: 108, skillName: '白毦精兵', archetype: 'guard', troopType: 'shield', tags: ['精锐', '护卫', '忠守'] },
  { id: '200005', name: '蒋钦', faction: '吴', cardType: '弓', qualityTier: 2, maxLevel: 25, baseForce: 58, baseCommand: 52, baseIntelligence: 45, baseCharisma: 48, baseSpeed: 60, growthForce: 118, growthCommand: 105, growthIntelligence: 88, growthCharisma: 95, growthSpeed: 120, skillName: '水战奇略', archetype: 'recon', troopType: 'mixed', tags: ['水战', '巡逻', '侦察'] },
  { id: '200006', name: '李典', faction: '魏', cardType: '弓', qualityTier: 2, maxLevel: 25, baseForce: 55, baseCommand: 58, baseIntelligence: 52, baseCharisma: 55, baseSpeed: 52, growthForce: 110, growthCommand: 118, growthIntelligence: 105, growthCharisma: 108, growthSpeed: 105, skillName: '稳守后方', archetype: 'logistics', troopType: 'supply', tags: ['后勤', '稳重', '协防'] },

  // ── 1星 N（最低品质，容易满星，早期过渡） ──
  { id: '300001', name: '宋宪', faction: '群', cardType: '步', qualityTier: 1, maxLevel: 25, baseForce: 52, baseCommand: 35, baseIntelligence: 22, baseCharisma: 25, baseSpeed: 45, growthForce: 105, growthCommand: 68, growthIntelligence: 42, growthCharisma: 48, growthSpeed: 88, skillName: '冲阵', archetype: 'assault', troopType: 'infantry', tags: ['冲锋', '填线'] },
  { id: '300002', name: '魏续', faction: '群', cardType: '步', qualityTier: 1, maxLevel: 25, baseForce: 50, baseCommand: 38, baseIntelligence: 25, baseCharisma: 28, baseSpeed: 42, growthForce: 100, growthCommand: 75, growthIntelligence: 48, growthCharisma: 55, growthSpeed: 82, skillName: '据城固守', archetype: 'guard', troopType: 'shield', tags: ['守城', '消耗'] },
  { id: '300003', name: '侯成', faction: '群', cardType: '骑', qualityTier: 1, maxLevel: 25, baseForce: 48, baseCommand: 32, baseIntelligence: 20, baseCharisma: 22, baseSpeed: 55, growthForce: 95, growthCommand: 62, growthIntelligence: 38, growthCharisma: 42, growthSpeed: 108, skillName: '奔走', archetype: 'mobile', troopType: 'cavalry', tags: ['跑腿', '传令'] },
  { id: '300004', name: '车胄', faction: '魏', cardType: '骑', qualityTier: 1, maxLevel: 25, baseForce: 55, baseCommand: 40, baseIntelligence: 28, baseCharisma: 30, baseSpeed: 50, growthForce: 110, growthCommand: 78, growthIntelligence: 55, growthCharisma: 58, growthSpeed: 98, skillName: '伏兵', archetype: 'recon', troopType: 'cavalry', tags: ['埋伏', '巡逻'] },
]

const templateById = new Map(heroTemplates.map(t => [t.id, t]))
const templatesByTier = new Map<HeroQualityTier, HeroTemplate[]>()
for (const t of heroTemplates) {
  const list = templatesByTier.get(t.qualityTier) ?? []
  list.push(t)
  templatesByTier.set(t.qualityTier, list)
}

export function getHeroTemplate(templateId: string): HeroTemplate | undefined {
  return templateById.get(templateId)
}

export function getHeroTemplateOrThrow(templateId: string): HeroTemplate {
  const t = templateById.get(templateId)
  if (!t) throw new Error(`武将模板 ${templateId} 不存在`)
  return t
}

export function getAllHeroTemplates(): HeroTemplate[] {
  return heroTemplates
}

export function getTemplatesByTier(tier: HeroQualityTier): HeroTemplate[] {
  return templatesByTier.get(tier) ?? []
}

// ─── 招募抽卡 ─────────────────────────────

/** 招募池概率配置 */
const POOL_RATES: Record<RecruitPoolType, Record<HeroQualityTier, number>> = {
  normal: { 1: 0.40, 2: 0.35, 3: 0.20, 4: 0.04, 5: 0.01 },
  elite:  { 1: 0.05, 2: 0.15, 3: 0.45, 4: 0.28, 5: 0.07 },
  limited:{ 1: 0.00, 2: 0.05, 3: 0.30, 4: 0.45, 5: 0.20 },
}

/** 保底计数器 */
const PITY_THRESHOLDS: Record<RecruitPoolType, { tier: HeroQualityTier; count: number }> = {
  normal:  { tier: 3, count: 10 },
  elite:   { tier: 5, count: 30 },
  limited: { tier: 5, count: 50 },
}

/** 招募消耗 */
export const RECRUIT_COST: Record<RecruitPoolType, { food: number; iron: number }> = {
  normal:  { food: 200, iron: 100 },
  elite:   { food: 500, iron: 300 },
  limited: { food: 800, iron: 500 },
}

let instanceCounter = 0

/** 生成唯一实例 ID */
function generateInstanceId(): string {
  instanceCounter++
  return `gi_${Date.now()}_${instanceCounter}`
}

/** 根据概率权重抽取品质 */
function rollQualityTier(poolType: RecruitPoolType, pityCount: number): HeroQualityTier {
  const pity = PITY_THRESHOLDS[poolType]
  if (pityCount >= pity.count) {
    return pity.tier
  }

  const rates = POOL_RATES[poolType]
  const roll = Math.random()
  let cumulative = 0
  for (const tier of [5, 4, 3, 2, 1] as HeroQualityTier[]) {
    cumulative += rates[tier]
    if (roll < cumulative) return tier
  }
  return 1
}

/** 从指定品质池中随机选一个模板 */
function rollTemplate(tier: HeroQualityTier): HeroTemplate {
  const pool = getTemplatesByTier(tier)
  if (pool.length === 0) {
    // 降级到最近的有数据的品质
    for (const fallback of [3, 2, 1, 4, 5] as HeroQualityTier[]) {
      const fb = getTemplatesByTier(fallback)
      if (fb.length > 0) return fb[Math.floor(Math.random() * fb.length)]
    }
    throw new Error('武将模板池为空')
  }
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * 执行一次招募
 * @returns 新创建的武将实例 + 招募结果信息
 */
export function performRecruit(
  poolType: RecruitPoolType,
  aiPlayerId: string,
  existingGenerals: GeneralInstance[],
  pityCount: number,
): { instance: GeneralInstance; result: RecruitResult; newPityCount: number } {
  const tier = rollQualityTier(poolType, pityCount)
  const template = rollTemplate(tier)

  const isDuplicate = existingGenerals.some(g => g.templateId === template.id)

  const instance: GeneralInstance = {
    id: generateInstanceId(),
    templateId: template.id,
    ownerId: aiPlayerId,
    quality: template.qualityTier,
    redStars: 0,
    level: 1,
    bonusForce: 0,
    bonusCommand: 0,
    bonusIntelligence: 0,
    bonusCharisma: 0,
    bonusSpeed: 0,
  }

  const isPityHit = tier >= PITY_THRESHOLDS[poolType].tier
  const newPityCount = isPityHit ? 0 : pityCount + 1

  return {
    instance,
    result: {
      templateId: template.id,
      qualityTier: template.qualityTier,
      isNew: !isDuplicate,
      isDuplicate,
    },
    newPityCount,
  }
}

// ─── 升星系统 ─────────────────────────────

/**
 * 验证升星请求是否合法
 * @returns 错误信息，null 表示合法
 */
export function validateStarUpgrade(
  target: GeneralInstance,
  sacrifices: GeneralInstance[],
): string | null {
  if (target.redStars >= target.quality) {
    return `${target.templateId} 已达最大红星数 ${target.quality}`
  }

  if (sacrifices.length === 0) {
    return '至少需要一个牺牲武将'
  }

  if (sacrifices.length + target.redStars > target.quality) {
    return `升星后红星数将超过品质上限 ${target.quality}`
  }

  for (const s of sacrifices) {
    if (s.templateId !== target.templateId) {
      return `牺牲武将 ${s.templateId} 与目标 ${target.templateId} 不是同一模板`
    }
    if (s.id === target.id) {
      return '不能用自己升星'
    }
  }

  return null
}

/**
 * 执行升星：消耗同模板武将，提升红星数
 * @returns 升星后的目标实例（浅拷贝）+ 总共获得的可分配属性点
 */
export function performStarUpgrade(
  request: StarUpgradeRequest,
  allGenerals: GeneralInstance[],
): { upgraded: GeneralInstance; totalBonusPoints: number; consumedIds: string[] } {
  const target = allGenerals.find(g => g.id === request.targetInstanceId)
  if (!target) throw new Error(`目标武将 ${request.targetInstanceId} 不存在`)

  const sacrifices = request.sacrificeInstanceIds.map(id => {
    const s = allGenerals.find(g => g.id === id)
    if (!s) throw new Error(`牺牲武将 ${id} 不存在`)
    return s
  })

  const error = validateStarUpgrade(target, sacrifices)
  if (error) throw new Error(error)

  const starsGained = sacrifices.length
  const upgraded: GeneralInstance = {
    ...target,
    redStars: target.redStars + starsGained,
  }

  return {
    upgraded,
    totalBonusPoints: starsGained * STAR_UPGRADE_BONUS_PER_STAR,
    consumedIds: request.sacrificeInstanceIds,
  }
}

/**
 * 分配升星获得的属性点
 * @returns 分配后的武将实例（浅拷贝）
 */
export function allocateStarAttributes(
  allocation: StarAttributeAllocation,
  generals: GeneralInstance[],
): GeneralInstance {
  const instance = generals.find(g => g.id === allocation.instanceId)
  if (!instance) throw new Error(`武将 ${allocation.instanceId} 不存在`)

  const totalAllocated = allocation.force + allocation.command + allocation.intelligence + allocation.charisma + allocation.speed
  const maxBonus = instance.redStars * STAR_UPGRADE_BONUS_PER_STAR
  const currentUsed = instance.bonusForce + instance.bonusCommand + instance.bonusIntelligence + instance.bonusCharisma + instance.bonusSpeed
  const available = maxBonus - currentUsed

  if (totalAllocated > available) {
    throw new Error(`可分配点数不足：可用 ${available}，尝试分配 ${totalAllocated}`)
  }

  if (allocation.force < 0 || allocation.command < 0 || allocation.intelligence < 0 || allocation.charisma < 0 || allocation.speed < 0) {
    throw new Error('属性分配值不能为负')
  }

  return {
    ...instance,
    bonusForce: instance.bonusForce + allocation.force,
    bonusCommand: instance.bonusCommand + allocation.command,
    bonusIntelligence: instance.bonusIntelligence + allocation.intelligence,
    bonusCharisma: instance.bonusCharisma + allocation.charisma,
    bonusSpeed: instance.bonusSpeed + allocation.speed,
  }
}

// ─── 武将属性计算 ─────────────────────────────

/** 计算武将实例的最终属性（基础 + 等级成长 + 升星加成） */
export function computeGeneralAttributes(instance: GeneralInstance): {
  force: number
  command: number
  intelligence: number
  charisma: number
  speed: number
} {
  const template = getHeroTemplateOrThrow(instance.templateId)
  const level = instance.level

  return {
    force: Math.round(template.baseForce + (template.growthForce * level) / 100) + instance.bonusForce,
    command: Math.round(template.baseCommand + (template.growthCommand * level) / 100) + instance.bonusCommand,
    intelligence: Math.round(template.baseIntelligence + (template.growthIntelligence * level) / 100) + instance.bonusIntelligence,
    charisma: Math.round(template.baseCharisma + (template.growthCharisma * level) / 100) + instance.bonusCharisma,
    speed: Math.round(template.baseSpeed + (template.growthSpeed * level) / 100) + instance.bonusSpeed,
  }
}

// ─── 部队槽位解锁 ─────────────────────────────

/** 计算当前城池数对应的可用部队槽位 */
export function computeArmySlots(capturedCityCount: number): number {
  let slots = 1
  for (const threshold of ARMY_SLOT_THRESHOLDS) {
    if (capturedCityCount >= threshold.cities) {
      slots = threshold.slots
    }
  }
  return slots
}
