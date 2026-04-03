# V2 架构设计：多玩家联盟体系 + 武将升星 + 资源滚雪球

> 基于用户决策（2026-03-19），本文档定义新架构的全部核心设计。
> 所有实现必须遵守此文档。

---

## 一、用户做出的选择

| 问题 | 选择 | 说明 |
|------|------|------|
| A. 招募系统 | **全拆：多玩家各建立小势力，联盟体系** | 不再是 13 固定 AI 势力，而是多真人玩家 + AI 玩家组合 |
| B. 编队规模 | **全面重构** | 每 AI 玩家最多 5 支部队（从 1 支扩展到 5 支） |
| C. 记忆方案 | 保持现状（Mem0 降级 InMemory） | 后续再升级 |
| D. 账号系统 | **PostgreSQL + OAuth** | SQLite 不支持联机，改用 PostgreSQL |
| E. 地图节奏 | **保持现状** | 战争晚不是地图问题，是系统太简陋 |

---

## 二、层级架构（从上到下）

```
同盟 Alliance（最多 100 位玩家）
  ├── 真人玩家 HumanPlayer × N（盟主 + 成员）
  │     └── AI 玩家 AIPlayer × 10（每位真人管 10 个 AI）
  │           └── 部队 Army × 5（每 AI 玩家最多 5 支部队）
  │                 ├── 主将 MainGeneral × 1
  │                 └── 副将 ViceGeneral × 2
  └── 独立玩家（无盟，同样的内部结构）
```

### 关键数字

| 参数 | 值 | 说明 |
|------|---|------|
| 同盟最大玩家数 | 100 | 真人玩家上限 |
| 每真人管 AI 数 | 10 | 每位真人玩家管辖 10 个 AI 玩家 |
| AI 部队上限 | 5 | 每 AI 玩家最多出 5 支部队（需发展解锁） |
| 每队编制 | 1主将 + 2副将 | 3 武将编队 |
| 同盟理论最大部队 | 100 × 10 × 5 = 5,000 | 极限情况 |
| 每部队武将数 | 3 | 主将 + 2 副将 |

### 发展解锁：部队数量递增

| 条件 | 可出部队数 | 说明 |
|------|-----------|------|
| 初始 | 1 | 新 AI 玩家只有 1 支部队 |
| 拥有 3 城 | 2 | 占领 3 座城池后解锁第 2 支 |
| 拥有 6 城 | 3 | |
| 拥有 10 城 | 4 | |
| 拥有 15 城 | 5 | 满编 |

---

## 三、武将星级与升星系统

### 3.1 品质（稀有度）

| 品质 | 标记 | 基础星数 | 可升红星数 | 潜力上限 | 颜色 |
|------|------|---------|-----------|---------|------|
| 一星 | ★ | 1 | 1 | +10 属性 | 白 |
| 二星 | ★★ | 2 | 2 | +20 属性 | 绿 |
| 三星 | ★★★ | 3 | 3 | +30 属性 | 蓝 |
| 四星 | ★★★★ | 4 | 4 | +40 属性 | 紫 |
| 五星 | ★★★★★ | 5 | 5 | +50 属性 | 金 |

### 3.2 升星机制

- **升 1 红星 = 消耗 1 张相同武将卡**
- 5 星武将最多升 5 次 → 5 红星（满星 = 5黄 → 5红），获得 +50 总属性点
- 4 星武将最多升 4 次 → 4 红星，获得 +40 总属性点
- 以此类推
- **每升 1 星获得 +10 属性点**，可由 AI 自动分配或真人玩家手动分配

### 3.3 星级属性加成

```
每升 1 红星：+10 自由属性点
分配到五维：force / command / intelligence / charisma / speed
```

### 3.4 星级显示

```typescript
// 示例：5星武将已升3红星
{
  quality: 5,           // 基础品质（决定黄星数量）
  redStars: 3,          // 已升红星数
  // 显示：★★★☆☆ → 红红红黄黄
  // 含义：5星中3星已升级为红色
  bonusAttributes: 30,  // 3 × 10 = 30 点可分配属性
}
```

### 3.5 与 STZB 数据的对应

| STZB 概念 | 本项目设计 | 说明 |
|-----------|-----------|------|
| star_level=50 | quality × 10 上限 | 简化为品质决定上限 |
| 25级上限武将 | 低品质武将（1-3星） | |
| 30级上限武将 | 高品质武将（4-5星） | |
| 觉醒(102xxx) | 觉醒系统（远期） | V2 暂不实现 |
| SP版(105xxx) | 限定版（远期） | V2 暂不实现 |

---

## 四、资源与滚雪球系统

### 4.1 四种资源

| 资源 | 标识 | 来源 | 主要用途 |
|------|------|------|---------|
| 粮草 | food | 农田、城池产出 | 部队维护、行军消耗 |
| 木材 | wood | 伐木场、森林地块 | 建筑建造 |
| 石料 | stone | 采石场、山地地块 | 城墙升级、防御工事 |
| 铁矿 | iron | 矿场、矿山地块 | 武器打造、部队强化 |

### 4.2 资源产出

```
每回合产出 = 基础产出 + Σ(己方资源地块产出) + 城池加成
```

- 资源地块（type='resource'）被占领后自动产出
- 城池 cityLevel 越高，周围地块产出加成越高
- 建筑可增加产出效率

### 4.3 滚雪球效应

资源越多 → 可维持更多部队 → 占领更多地块 → 资源更多

**防止一家独大的平衡机制**：
- 领地过大时维护成本指数增长
- 远离核心城池的部队补给线消耗增加
- 叛逆/忠诚度机制限制过度扩张

---

## 五、部队系统

### 5.1 部队构成

```typescript
// 一支部队 = 1 主将 + 最多 2 副将
Army {
  id: string
  mainGeneral: GeneralInstance    // 主将（决定部队基础属性）
  viceGenerals: GeneralInstance[] // 副将（最多2人，提供加成）
  troopCount: number              // 兵力（初始约500，上限根据主将等级）
  status: ArmyStatus
  tileId: string                  // 当前位置
}
```

### 5.2 AI 玩家管理

```
AIPlayer
  ├── 武将仓库（已招募的所有武将实例）
  ├── 部队槽位（1~5，需发展解锁）
  ├── 领地（占领的地块）
  └── 资源存储
```

### 5.3 战斗力计算

```
部队战斗力 = 主将属性加成 × 兵力 × (1 + 副将1加成 + 副将2加成)
```

---

## 六、武将招募系统

### 6.1 招募方式

- **抽卡池**：消耗资源（铁矿 + 粮草）进行招募
- **战场俘获**：击败敌人后有概率俘获敌方武将
- **同名武将**：重复获得同名武将 → 用于升星

### 6.2 招募池设计

| 池类型 | 内容 | 保底 |
|--------|------|------|
| 普通池 | 1-3星武将为主 | 10次保底3星 |
| 精英池 | 3-5星武将 | 30次保底5星 |
| 限定池 | 特定武将UP | 50次保底指定 |

### 6.3 武将实例 vs 武将模板

```
武将模板(HeroTemplate): 关羽、赵云等不变的定义
武将实例(GeneralInstance): 玩家拥有的具体关羽，有自己的等级、星级、属性分配
```

同一个武将模板可以被多个玩家拥有（重复），每个实例独立升星。

---

## 七、账号系统

### 7.1 为什么不用 SQLite

SQLite 是文件级数据库，只能单进程访问。多人联网游戏需要：
- 多客户端并发连接
- 网络可达的数据库
- 事务隔离
- 水平扩展能力

### 7.2 选型：PostgreSQL + OAuth

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ 客户端(Web) │────▶│ Node.js 后端  │────▶│ PostgreSQL   │
│             │◀────│   + OAuth    │◀────│              │
└─────────────┘     └──────────────┘     └──────────────┘
```

- **PostgreSQL**: 生产级关系数据库，支持高并发
- **OAuth 2.0**: 支持 Google/Discord/GitHub 登录
- **JWT Token**: 会话管理
- **bcrypt**: 密码哈希（如果支持本地账号）

### 7.3 数据库表设计（核心）

```sql
-- 用户账号
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),  -- 本地账号
  oauth_provider VARCHAR(32),  -- google/discord/github
  oauth_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 同盟
CREATE TABLE alliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(64) UNIQUE NOT NULL,
  leader_id UUID REFERENCES users(id),
  max_members INT DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 同盟成员
CREATE TABLE alliance_members (
  alliance_id UUID REFERENCES alliances(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR(16) DEFAULT 'member', -- leader/officer/member
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (alliance_id, user_id)
);

-- AI 玩家（每位真人管 10 个）
CREATE TABLE ai_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id),
  name VARCHAR(32) NOT NULL,
  specialty VARCHAR(16),
  army_slots INT DEFAULT 1,
  resources JSONB DEFAULT '{"food":1000,"wood":500,"stone":300,"iron":200}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 武将实例（每个 AI 玩家拥有的武将）
CREATE TABLE general_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_player_id UUID REFERENCES ai_players(id),
  template_id VARCHAR(16) NOT NULL,  -- 对应 heroPool 的 id
  quality INT NOT NULL,              -- 1-5 星
  red_stars INT DEFAULT 0,           -- 已升红星数
  level INT DEFAULT 1,
  bonus_force INT DEFAULT 0,         -- 升星后分配的属性
  bonus_command INT DEFAULT 0,
  bonus_intelligence INT DEFAULT 0,
  bonus_charisma INT DEFAULT 0,
  bonus_speed INT DEFAULT 0,
  assigned_army_id UUID,             -- 当前编入哪支部队（null=仓库）
  assigned_role VARCHAR(8),          -- 'main' | 'vice'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.4 迁移路径

**阶段 1（当前）**：仍用内存 WorldState + JSON 文件，但类型定义已预留联机字段
**阶段 2**：PostgreSQL 上线，WorldState 持久化到数据库
**阶段 3**：OAuth 登录 + 完整的多人联机

---

## 八、战争节奏问题的根因分析

用户反馈：**"战争之所以来得太晚，不是地图太大，而是系统太简陋"**

### 问题根源

1. **没有资源滚雪球** → 无动力扩张
2. **只有 1 支部队** → 行动力太弱，占地太慢
3. **没有招募系统** → 武将固定，无成长感
4. **没有建筑系统** → 占城无收益感
5. **AI 决策太保守** → 缺乏主动进攻动机

### V2 解决方案

1. ✅ 四资源系统 → 占地有明确资源收益
2. ✅ 1→5 部队扩展 → 行动力 5 倍增长
3. ✅ 武将招募+升星 → 成长正反馈
4. 🔜 建筑系统（V3） → 城池发展
5. ✅ AI 决策优化 → 资源驱动的进攻决策

---

## 九、TypeScript 类型定义变更清单

### 新增类型

```typescript
// 武将品质（1-5星）
export type HeroQualityTier = 1 | 2 | 3 | 4 | 5

// 武将模板（不变的定义数据）
export type HeroTemplate = {
  id: string
  name: string
  faction: HeroFaction
  cardType: HeroCardType
  qualityTier: HeroQualityTier  // 1-5星
  maxLevel: number              // 25 或 30
  baseForce: number
  baseCommand: number
  baseIntelligence: number
  baseCharisma: number
  baseSpeed: number
  growthForce: number           // 每级成长
  growthCommand: number
  growthIntelligence: number
  growthCharisma: number
  growthSpeed: number
  skillName: string
  archetype: HeroArchetype
  troopType: TroopType
  tags: string[]
}

// 武将实例（玩家拥有的具体武将）
export type GeneralInstance = {
  id: string                    // 实例唯一ID
  templateId: string            // 对应 HeroTemplate.id
  ownerId: string               // 所属 AI 玩家 ID
  quality: HeroQualityTier      // 继承自模板
  redStars: number              // 已升红星数 (0 ~ quality)
  level: number                 // 当前等级
  // 升星分配的额外属性
  bonusForce: number
  bonusCommand: number
  bonusIntelligence: number
  bonusCharisma: number
  bonusSpeed: number
  // 分配状态
  assignedArmyId?: string       // 编入的部队ID
  assignedRole?: 'main' | 'vice'
}

// 部队
export type Army = {
  id: string
  aiPlayerId: string
  mainGeneralId?: string        // 主将实例ID
  viceGeneralIds: string[]      // 副将实例ID列表（最多2）
  troopCount: number            // 兵力
  maxTroopCount: number         // 兵力上限
  tileId: string                // 当前位置
  status: ArmyStatus
  currentTask?: string
}

export type ArmyStatus = '待命' | '行军中' | '交战中' | '驻防中' | '侦察中' | '返回中'

// AI 玩家（真人的下属）
export type AIPlayerV2 = {
  id: string
  name: string
  ownerId: string               // 真人玩家ID
  factionId: string             // 所属势力/同盟
  specialty: 'assault' | 'recon' | 'guard' | 'logistics' | 'expansion'
  armySlots: number             // 当前可用部队槽 (1-5)
  armies: Army[]
  generals: GeneralInstance[]   // 武将仓库
  resources: PlayerResources
  capturedTiles: string[]       // 占领的地块
  capturedCities: string[]      // 占领的城池
}

export type PlayerResources = {
  food: number
  wood: number
  stone: number
  iron: number
}

// 同盟
export type Alliance = {
  id: string
  name: string
  leaderId: string              // 盟主 (真人玩家ID)
  officerIds: string[]          // 官员列表
  memberIds: string[]           // 所有成员ID
  maxMembers: number            // 上限 100
  doctrine?: string             // 同盟方略
  createdAt: number
}

// 真人玩家
export type HumanPlayer = {
  id: string
  username: string
  allianceId?: string
  aiPlayerIds: string[]         // 管辖的 10 个 AI 玩家 ID
}
```

### 修改的类型

```typescript
// HeroQuality: '2-UC' | '3-R' | '4-SR'
// → 改为 HeroQualityTier: 1 | 2 | 3 | 4 | 5

// AIPlayer: 原来 unitIds 最多3支
// → AIPlayerV2: armySlots 1~5, armies 数组

// FactionState: 原来是 13 固定势力
// → 改为动态势力，由同盟或独立玩家创建
```

---

## 十、实施优先级

### P0 — 本轮实现

1. ✅ 新增类型定义 (HeroTemplate, GeneralInstance, Army, AIPlayerV2, Alliance, HumanPlayer)
2. ✅ 武将升星逻辑 (starUpgrade)
3. ✅ 部队扩展逻辑 (armySlots 解锁)
4. ✅ 资源系统基础 (PlayerResources, 产出计算)
5. ✅ 武将招募基础接口

### P1 — 下一轮

6. PostgreSQL 数据层
7. OAuth 登录
8. 同盟 CRUD API
9. 前端同盟管理界面

### P2 — 后续

10. 建筑系统
11. 觉醒系统
12. 限定武将
13. 战场俘获

---

*本文档由 GitHub Copilot 于 2026-03-19 生成，基于用户架构决策。*
