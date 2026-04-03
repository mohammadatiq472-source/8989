import type { HeroArchetype, HeroPoolEntry, TroopType, Unit } from '../contracts/game'

type HeroPoolSeedEntry = Omit<HeroPoolEntry, 'avatarKey' | 'portraitKey'>

const lightweightHeroPoolSeed: HeroPoolSeedEntry[] = [
  { id: '100451', name: '关羽', faction: '蜀', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '樊渊泅囚', archetype: 'assault', troopType: 'cavalry', tags: ['突击', '压线', '突破'] },
  { id: '100021', name: '赵云', faction: '蜀', cardType: '步', quality: '4-SR', cost: 3.5, skillName: '银龙冲阵', archetype: 'mobile', troopType: 'infantry', tags: ['机动', '突前', '抢点'] },
  { id: '100027', name: '张辽', faction: '魏', cardType: '骑', quality: '4-SR', cost: 3.5, skillName: '其疾如风', archetype: 'mobile', troopType: 'cavalry', tags: ['奔袭', '绕后', '追击'] },
  { id: '100476', name: '郭嘉', faction: '魏', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '奇佐鬼谋', archetype: 'recon', troopType: 'cavalry', tags: ['控场', '侦测', '扰乱'] },
  { id: '100369', name: '华佗', faction: '未知', cardType: '步', quality: '4-SR', cost: 3.0, skillName: '去疾', archetype: 'logistics', troopType: 'supply', tags: ['恢复', '后勤', '续航'] },
  { id: '100035', name: '吕蒙', faction: '吴', cardType: '弓', quality: '4-SR', cost: 3.5, skillName: '白衣渡江', archetype: 'recon', troopType: 'mixed', tags: ['侦察', '奇袭', '压前'] },
  { id: '100031', name: '周瑜', faction: '吴', cardType: '弓', quality: '4-SR', cost: 3.0, skillName: '玄武洰流', archetype: 'reserve', troopType: 'mixed', tags: ['谋略', '压制', '协同'] },
  { id: '100656', name: '高顺', faction: '群', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '登锋陷阵', archetype: 'heavy', troopType: 'cavalry', tags: ['重压', '攻坚', '前顶'] },
  { id: '100450', name: '孙策', faction: '吴', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '霸王渡江', archetype: 'assault', troopType: 'cavalry', tags: ['突击', '滚动推进', '先手'] },
  { id: '100013', name: '马超', faction: '群', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '血溅黄砂', archetype: 'assault', troopType: 'cavalry', tags: ['骑突', '追猎', '爆发'] },
  { id: '100442', name: '黄忠', faction: '蜀', cardType: '步', quality: '4-SR', cost: 3.0, skillName: '定军扬威', archetype: 'heavy', troopType: 'shield', tags: ['火力', '定点压制', '稳打'] },
  { id: '100472', name: '司马懿', faction: '魏', cardType: '步', quality: '4-SR', cost: 3.0, skillName: '破凰', archetype: 'reserve', troopType: 'infantry', tags: ['谋略', '消耗', '节奏'] },
  { id: '100478', name: '陆逊', faction: '吴', cardType: '步', quality: '4-SR', cost: 3.0, skillName: '火势风威', archetype: 'reserve', troopType: 'infantry', tags: ['火攻', '区域压制', '筹划'] },
  { id: '100449', name: '夏侯惇', faction: '魏', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '盲侯奋勇', archetype: 'guard', troopType: 'shield', tags: ['抗线', '反击', '驻守'] },
  { id: '100526', name: '张机', faction: '未知', cardType: '弓', quality: '4-SR', cost: 3.0, skillName: '金匮要略', archetype: 'logistics', troopType: 'supply', tags: ['恢复', '支援', '维持'] },
  { id: '100029', name: '张春华', faction: '魏', cardType: '弓', quality: '4-SR', cost: 2.5, skillName: '强势', archetype: 'recon', troopType: 'mixed', tags: ['扰乱', '压制', '穿插'] },
  { id: '100090', name: '太史慈', faction: '吴', cardType: '弓', quality: '4-SR', cost: 2.5, skillName: '方阵突击', archetype: 'recon', troopType: 'mixed', tags: ['观察', '点杀', '扫荡'] },
  { id: '100036', name: '孙尚香', faction: '吴', cardType: '弓', quality: '4-SR', cost: 2.5, skillName: '枭姬', archetype: 'mobile', troopType: 'mixed', tags: ['远袭', '清点', '策应'] },
  { id: '100072', name: '关银屏', faction: '蜀', cardType: '步', quality: '4-SR', cost: 3.0, skillName: '巾帼战阵', archetype: 'assault', troopType: 'infantry', tags: ['强攻', '压前', '近战'] },
  { id: '100023', name: '曹操', faction: '魏', cardType: '骑', quality: '4-SR', cost: 3.5, skillName: '魏武之世', archetype: 'reserve', troopType: 'cavalry', tags: ['统御', '增益', '总揽'] },
  { id: '100016', name: '刘备', faction: '蜀', cardType: '步', quality: '4-SR', cost: 3.5, skillName: '皇裔流离', archetype: 'reserve', troopType: 'shield', tags: ['稳军', '恢复', '补位'] },
  { id: '100017', name: '诸葛亮', faction: '蜀', cardType: '步', quality: '4-SR', cost: 3.0, skillName: '诸葛锦囊', archetype: 'recon', troopType: 'infantry', tags: ['筹划', '侦测', '控场'] },
  { id: '102014', name: '张角', faction: '群', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '黄天当立', archetype: 'heavy', troopType: 'cavalry', tags: ['压场', '动员', '群攻'] },
  { id: '100661', name: '吕布', faction: '群', cardType: '骑', quality: '4-SR', cost: 4.0, skillName: '天下无双', archetype: 'heavy', troopType: 'cavalry', tags: ['爆发', '决战', '威慑'] },
  { id: '100474', name: '张宁', faction: '群', cardType: '步', quality: '4-SR', cost: 3.0, skillName: '黄天余音', archetype: 'logistics', troopType: 'supply', tags: ['恢复', '鼓舞', '稳定'] },
  { id: '100475', name: '郝昭', faction: '魏', cardType: '步', quality: '4-SR', cost: 3.0, skillName: '不动如山', archetype: 'guard', troopType: 'shield', tags: ['坚守', '筑点', '抗压'] },
  { id: '100005', name: '貂蝉', faction: '未知', cardType: '弓', quality: '4-SR', cost: 2.5, skillName: '闭月', archetype: 'recon', troopType: 'mixed', tags: ['魅惑', '牵制', '控场'] },
  { id: '100647', name: '华雄', faction: '群', cardType: '骑', quality: '4-SR', cost: 3.5, skillName: '将出关西', archetype: 'heavy', troopType: 'cavalry', tags: ['攻坚', '重压', '威吓'] },
  { id: '100060', name: '姜维', faction: '蜀', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '九伐中原', archetype: 'assault', troopType: 'cavalry', tags: ['突击', '北伐', '攻坚'] },
  { id: '100061', name: '庞统', faction: '蜀', cardType: '步', quality: '4-SR', cost: 3.0, skillName: '凤雏谋断', archetype: 'reserve', troopType: 'infantry', tags: ['谋略', '决策', '协同'] },
  // --- 第二批武将（基于率土之滨 recommend_hero 列表扩充） ---
  { id: '100015', name: '甘宁', faction: '吴', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '锦帆突袭', archetype: 'assault', troopType: 'cavalry', tags: ['突袭', '水战', '奇兵'] },
  { id: '100020', name: '典韦', faction: '魏', cardType: '步', quality: '4-SR', cost: 3.5, skillName: '古之恶来', archetype: 'guard', troopType: 'shield', tags: ['护卫', '死战', '抗压'] },
  { id: '100024', name: '孙权', faction: '吴', cardType: '弓', quality: '4-SR', cost: 3.0, skillName: '制衡', archetype: 'reserve', troopType: 'mixed', tags: ['统御', '联合', '节奏'] },
  { id: '100028', name: '荀彧', faction: '魏', cardType: '弓', quality: '4-SR', cost: 2.5, skillName: '驱虎吞狼', archetype: 'recon', troopType: 'supply', tags: ['内政', '筹谋', '稳定'] },
  { id: '100030', name: '黄盖', faction: '吴', cardType: '弓', quality: '4-SR', cost: 2.5, skillName: '苦肉计', archetype: 'heavy', troopType: 'mixed', tags: ['火攻', '牺牲', '压制'] },
  { id: '100034', name: '许褚', faction: '魏', cardType: '步', quality: '4-SR', cost: 3.0, skillName: '虎痴', archetype: 'guard', troopType: 'shield', tags: ['肉搏', '护主', '抗线'] },
  { id: '100074', name: '魏延', faction: '蜀', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '子午谷奇谋', archetype: 'mobile', troopType: 'cavalry', tags: ['奇袭', '冒进', '独断'] },
  { id: '100337', name: '甄姬', faction: '魏', cardType: '弓', quality: '4-SR', cost: 2.5, skillName: '洛神赋', archetype: 'logistics', troopType: 'supply', tags: ['恢复', '鼓舞', '辅助'] },
  { id: '100452', name: '张飞', faction: '蜀', cardType: '步', quality: '4-SR', cost: 3.5, skillName: '据水断桥', archetype: 'guard', troopType: 'infantry', tags: ['威慑', '守关', '反击'] },
  { id: '100477', name: '徐庶', faction: '蜀', cardType: '步', quality: '4-SR', cost: 2.5, skillName: '举荐卧龙', archetype: 'recon', troopType: 'infantry', tags: ['侦察', '谋略', '辅佐'] },
  { id: '100479', name: '法正', faction: '蜀', cardType: '弓', quality: '4-SR', cost: 3.0, skillName: '恩怨分明', archetype: 'recon', troopType: 'mixed', tags: ['奇谋', '反间', '精算'] },
  { id: '100480', name: '曹仁', faction: '魏', cardType: '步', quality: '4-SR', cost: 3.0, skillName: '据守不退', archetype: 'guard', troopType: 'shield', tags: ['坚守', '不屈', '压阵'] },
  { id: '100494', name: '徐晃', faction: '魏', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '长驱破围', archetype: 'mobile', troopType: 'cavalry', tags: ['截击', '穿插', '解围'] },
  { id: '100496', name: '庞德', faction: '魏', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '抬棺死战', archetype: 'heavy', troopType: 'cavalry', tags: ['决死', '攻坚', '勇猛'] },
  { id: '100498', name: '程昱', faction: '魏', cardType: '弓', quality: '4-SR', cost: 2.5, skillName: '毒士', archetype: 'recon', troopType: 'supply', tags: ['计谋', '毒策', '消耗'] },
  { id: '100553', name: '左慈', faction: '群', cardType: '骑', quality: '4-SR', cost: 2.5, skillName: '幻术', archetype: 'recon', troopType: 'mixed', tags: ['扰乱', '幻惑', '控场'] },
  { id: '100574', name: '陈宫', faction: '群', cardType: '弓', quality: '4-SR', cost: 3.0, skillName: '忠谋竭虑', archetype: 'reserve', troopType: 'mixed', tags: ['谋略', '献策', '协同'] },
  { id: '100025', name: '鲁肃', faction: '吴', cardType: '弓', quality: '4-SR', cost: 2.5, skillName: '大义凛然', archetype: 'logistics', troopType: 'supply', tags: ['外交', '联盟', '稳定'] },
  { id: '100033', name: '夏侯渊', faction: '魏', cardType: '骑', quality: '4-SR', cost: 3.0, skillName: '急袭千里', archetype: 'mobile', troopType: 'cavalry', tags: ['奔袭', '速攻', '先手'] },
  { id: '100019', name: '袁绍', faction: '群', cardType: '步', quality: '4-SR', cost: 3.0, skillName: '四世三公', archetype: 'reserve', troopType: 'infantry', tags: ['统御', '声势', '动员'] },
]

export const lightweightHeroPool: HeroPoolEntry[] = lightweightHeroPoolSeed.map((entry) => ({
  ...entry,
  avatarKey: `hero-avatar-${entry.id}`,
  portraitKey: `hero-portrait-${entry.id}`,
}))

const lightweightHeroPoolByName = new Map(lightweightHeroPool.map((entry) => [entry.name, entry]))
const lightweightHeroPoolById = new Map(lightweightHeroPool.map((entry) => [entry.id, entry]))

type HeroProfileOptions = {
  archetype?: HeroArchetype
  troopType?: TroopType
  level?: number
  title?: string
  growthFocus: string
  traits?: string[]
}

export function getHeroPoolEntryByName(name: string) {
  const entry = lightweightHeroPoolByName.get(name)
  if (!entry) {
    throw new Error(`轻量武将池中不存在 ${name}。`)
  }
  return entry
}

export function getHeroPoolEntryById(id: string) {
  const entry = lightweightHeroPoolById.get(id)
  if (!entry) {
    throw new Error(`轻量武将池中不存在 ID ${id}。`)
  }
  return entry
}

export function buildHeroProfileFromPoolId(
  id: string,
  options: HeroProfileOptions,
) {
  return buildHeroProfileFromPool(getHeroPoolEntryById(id).name, options)
}

export function buildHeroProfileFromPool(
  name: string,
  options: HeroProfileOptions,
): Unit['hero'] {
  const entry = getHeroPoolEntryByName(name)
  const archetype = options.archetype ?? entry.archetype
  const troopType = options.troopType ?? deriveTroopType(entry, archetype)

  return {
    id: `hero_${entry.id}`,
    name: entry.name,
    title: options.title ?? buildHeroTitle(entry, archetype),
    faction: entry.faction,
    cardType: entry.cardType,
    quality: entry.quality,
    archetype,
    level: options.level ?? deriveHeroLevel(entry),
    troopType,
    avatarKey: entry.avatarKey,
    portraitKey: entry.portraitKey,
    force: deriveForce(entry, archetype),
    command: deriveCommand(entry, archetype),
    intelligence: deriveIntelligence(entry, archetype),
    charisma: deriveCharisma(entry, archetype),
    speed: deriveSpeed(entry, archetype),
    traits: Array.from(new Set([...(options.traits ?? []), ...entry.tags])).slice(0, 4),
    signatureSkill: {
      name: entry.skillName,
      detail: buildSkillDetail(entry, archetype),
    },
    growthFocus: options.growthFocus,
  }
}

function deriveTroopType(entry: HeroPoolEntry, archetype: HeroArchetype): TroopType {
  if (archetype === 'logistics') {
    return 'supply'
  }

  if (entry.cardType === '骑') {
    return 'cavalry'
  }

  if (entry.cardType === '弓') {
    return 'mixed'
  }

  if (archetype === 'guard') {
    return 'shield'
  }

  return 'infantry'
}

function deriveHeroLevel(entry: HeroPoolEntry) {
  const qualityBase = entry.quality === '4-SR' ? 24 : entry.quality === '3-R' ? 18 : 12
  return qualityBase + Math.round(entry.cost * 2)
}

function deriveCommand(entry: HeroPoolEntry, archetype: HeroArchetype) {
  const base = 48 + Math.round(entry.cost * 10)
  const qualityBonus = entry.quality === '4-SR' ? 12 : entry.quality === '3-R' ? 6 : 0
  const roleBonus = archetype === 'heavy' || archetype === 'guard' ? 10 : archetype === 'reserve' ? 8 : 4
  return clamp(base + qualityBonus + roleBonus)
}

function deriveForce(entry: HeroPoolEntry, archetype: HeroArchetype) {
  const base = 44 + Math.round(entry.cost * 9)
  const typeBonus = entry.cardType === '步' ? 12 : entry.cardType === '骑' ? 8 : 2
  const roleBonus = archetype === 'assault' || archetype === 'heavy' ? 14 : archetype === 'guard' ? 8 : 0
  return clamp(base + typeBonus + roleBonus)
}

function deriveSpeed(entry: HeroPoolEntry, archetype: HeroArchetype) {
  const typeBonus = entry.cardType === '骑' ? 18 : entry.cardType === '弓' ? 10 : 4
  const roleBonus =
    archetype === 'mobile' || archetype === 'recon'
      ? 16
      : archetype === 'assault'
        ? 10
        : archetype === 'logistics'
          ? -6
          : 0
  return clamp(40 + Math.round(entry.cost * 7) + typeBonus + roleBonus)
}

function deriveIntelligence(entry: HeroPoolEntry, archetype: HeroArchetype) {
  const typeBonus = entry.cardType === '弓' ? 14 : entry.cardType === '步' ? 10 : 6
  const roleBonus =
    archetype === 'logistics' || archetype === 'reserve'
      ? 16
      : archetype === 'recon'
        ? 10
        : 2
  return clamp(42 + Math.round(entry.cost * 7) + typeBonus + roleBonus)
}

function deriveCharisma(entry: HeroPoolEntry, archetype: HeroArchetype) {
  const base = 42 + Math.round(entry.cost * 6)
  const roleBonus = archetype === 'reserve' || archetype === 'logistics' ? 14 : archetype === 'recon' ? 10 : archetype === 'guard' ? 8 : 2
  const qualityBonus = entry.quality === '4-SR' ? 10 : entry.quality === '3-R' ? 5 : 0
  return clamp(base + roleBonus + qualityBonus)
}

function buildHeroTitle(entry: HeroPoolEntry, archetype: HeroArchetype) {
  const roleTitle =
    archetype === 'assault'
      ? '破阵主将'
      : archetype === 'recon'
        ? '游击谋臣'
        : archetype === 'guard'
          ? '镇守主将'
          : archetype === 'mobile'
            ? '机动先锋'
            : archetype === 'heavy'
              ? '重锋统军'
              : archetype === 'logistics'
                ? '军资总管'
                : '中军节制'
  return `${entry.faction}${roleTitle}`
}

function buildSkillDetail(entry: HeroPoolEntry, archetype: HeroArchetype) {
  const tacticTone =
    archetype === 'assault'
      ? '在正面压强和重点突破时最容易形成战果。'
      : archetype === 'recon'
        ? '适合把侦察、牵制和节奏破坏串成一条线。'
        : archetype === 'guard'
          ? '更适合稳点、吃压和保护补给节点。'
          : archetype === 'mobile'
            ? '适合快速转场、补位和抢临时窗口。'
            : archetype === 'heavy'
              ? '适合做一锤定音的正面压制。'
              : archetype === 'logistics'
                ? '能把支援和恢复转化成长期续战收益。'
                : '适合做中军协同和战区节奏控制。'
  return `以 ${entry.skillName} 为招牌动作，${tacticTone}`
}

function clamp(value: number) {
  return Math.max(40, Math.min(98, value))
}
