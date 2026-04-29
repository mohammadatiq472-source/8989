# 率土之滨逆向研究 → 项目设计洞察

> 基于 2026-03-18/19 逆向研究成果，转化为本项目（AI 原生 SLG）的直接设计参考

当前 Godot 主壳的现行布局落地、视频证据路径和编辑器定位方法，统一见：

- [Godot 原生 SLG 主壳布局对齐（2026-04-18）](GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md)

---

## 一、服务端协议架构（直接参考）

### 网络层
- **传输协议**：TCP 长连接，端口 8001
- **服务器 IP**：`42.186.76.238`（网易 CDN，中国区）
- **引擎**：Cocos2d-x + NeoX（网易自研）
- **脚本层**：Lua（`.stb` 格式加密，主逻辑全在 Lua 里）

### 数据包格式
```
[0:4]  = 包大小 BigEndian uint32
[4:8]  = cmdId (协议号) BigEndian uint32
[12]   = 数据类型 (2=明文, 3=zlib+JSON, 5=XOR152+JSON)
[17:]  = 数据体
```

### **核心协议映射（已完全解析）**
| cmdId | 名称 | 类型 | 频率 | 说明 |
|-------|------|------|------|------|
| 10 | **战斗数据** | zlib | 战斗时 | attack_advance, all_skill_info, 完整战斗初始化 |
| 24 | 性能上报 | - | 每分钟 | FPS/内存/网络 |
| 63 | 初始化3 | - | 登录时 | - |
| 92 | **战报** | zlib | 战斗后 | 完整战斗数据（stzbHelper 主要解析目标） |
| 103 | **同盟成员** | zlib | 按需 | 联盟成员列表（含成员ID、名称） |
| 135 | 未知 | - | 低频 | - |
| 694 | 心跳 | xor | 每60秒 | `send:694, []` |
| 829 | **武将详细属性** | zlib | 查看时 | attack_add, defence_add, destroy_add, hero_type, gear_info |
| 949 | 未知 | - | 低频 | - |
| 954 | **群组信息** | - | 按需 | 联盟/群组数据 |
| 955 | **联盟详情** | - | 按需 | 公会详细信息 |
| 2200 | 未知 | - | 低频 | - |
| 2319 | 城池状态 | xor | 高频 | `[city_id, status]` |
| 3400 | 地图区块 | - | 按需 | 视野移动时 |
| 3686 | **角色档案** | - | 登录时 | username, server, title（会话绑定标记） |
| 4328 | 部队序列号 | xor | 高频 | `[army_id, seq]` |
| 4330 | **坐标查询** | - | 按需 | 格子详细信息查询 |
| 5013 | **技能信息** | - | 按需 | 技能名称如"翩翩君子"、"重情重义" |
| 5026 | **地图视野** | 明文 | 高频 | 视野内玩家位置、军营等建筑、行军数据 |
| **5028** | **世界快照** | 明文 | **秒级** | 最重要！包含地图/部队/玩家完整状态 |
| 5064 | **武将列表** | xor | 按需 | res 字段含武将 ID 列表 |
| 6095 | 地图格子状态 | - | 高频 | 视野内格子（单次抓包中出现11次） |
| 6147 | 地图格子详情 | - | 高频 | 格子详细信息 |
| 6231 | **战报回放** | zlib | 查看战报时 | 回合制战斗详细数据，格式"3r0,0#0e1,heroId#..." |
| 6314 | 公告 | - | 周期 | 跑马灯公告 |
| **90005** | **数据同步** | zlib/xor | **高频** | 增量表更新，最重要 |
| 90006 | 同步序列号 | xor | 每10秒 | 版本号 |
| 90008 | 状态票据 | xor | 高频 | 65次/5分钟 |

---

## 二、数据表结构（完整已解析）

### Tb_hero（将领数据）
```typescript
interface HeroRow {
  hero_id: number          // field[0]: 唯一ID
  hero_type_id: number     // field[1]: 武将模板ID（如100009=董卓?）
  user_id: number          // field[2]: 归属玩家
  level: number            // field[6]: 等级（通常1-40）
  power: number            // field[7]: 战力/经验
  star_level: number       // field[8]: 星级（如50）
  last_battle_time: number // field[9]: unix timestamp
  total_power: number      // field[10]: 综合战力（如2340, 3360）
  force: number            // field[17]: 武力（684）
  governance: number       // field[18]: 统率（1786）
  skill_power: number      // field[19]: 技能（3268）
  wisdom: number           // field[20]: 智谋（950）
  charisma: number         // field[21]: 魅力（1824）
  inherited_skills: string // field[22]: "200032,1;"
  battle_losses: number    // field[27]: 战损（187）
  equipped_skills: string  // field[33]: "1,21,31,"
  skill_progress: string   // field[34]: "21,0,0;31,0,0;"
}
```

**增量更新格式**：`[0, hero_id, field_id, value, field_id, value, ...]`

**已知武将 ID（本次捕获）**：
- 100009, 100032, 100592 ← 某玩家的三武将队伍
- 玩家日志出现"**董卓**"，是其中一个

### Tb_army（部队/军队）
```typescript
interface ArmyRow {
  army_id: number          // field[0]: 唯一ID（如143314201）
  army_type: number        // field[1]: 1=进攻 2=防守 25=行军中
  user_id: number          // field[2]: 所属玩家
  start_city_id: number    // field[3]: 出发城池
  target_city_id: number   // field[4]: 目标城池
  depart_time: number      // field[5]: unix timestamp
  arrive_time: number      // field[6]: unix timestamp
  home_city_id: number     // field[10]: 主城
  src_city_id: number      // field[11]: 上一个城池
  speed: number            // field[14]: 移动速度
  soldier_losses: string   // field[16]: "0,0;0,0;0,0;"（形成阵型损失）
  soldier_formation: string // field[17]: "3,3;1,1;1,1;"（兵种+数量）
  march_speed: number      // field[28]: 行军速度（120）
  last_battle_ref: string  // field[32]: "battle_id,r1,r2,r3,r4,r5;"
  status: number           // field[49]: 0=静止 1=行军中
  march_type: number       // field[52]: 4=攻击 5=返回
  battle_log: string       // field[140]: "5840016,1,1,1,1,2;5840023,..."
  battle_time: number      // field[141]: 战斗时间
  battle_target: number    // field[142]: 目标城池
}
```

**战斗结果格式**：`"battle_id,result1,result2,result3,result4,result5;"`

### Tb_world_city（世界地图城池）
```typescript
interface CitySlot {
  city_id: number          // row: x*10000+y（如14321422 = x:1432, y:1422）
  city_level: number       // row[1]: 城池等级
  owner_user_id: number    // row[6]: 占领者
  occupy_time: number      // row[4]: 占领时间
  expire_time: number      // row[16]: 保护期
}
// 格式：{city_id: {slot_id: [op, ?, owner, ?, occupy_time, ...]}}
```

### Tb_user_res（玩家资源）
```typescript
// op=2, [0, user_id, field_id, value, field_id, value, ...]
// field_id 3,4,5,6 = 木材/石料/粮草/铁矿（猜测）
// 示例：3=618019, 4=665922, 5=637583, 6=638261
```

### Tb_battle_report_attack（攻击战报）
```typescript
interface BattleReport {
  battle_id: number        // row[0]
  attacker_user_id: number // row[1]
  defender_user_id: number // row[2] (0=野怪)
  army_id: number          // row[3]: 143314201
  battle_time: number      // row[4]: unix timestamp
  result: number           // row[6]: 1=胜 0=败
  city_id: number          // row[7]: 战斗地点
  attacker_heroes: string  // row[10]: "100009,100032,100592"
  defender_heroes: string  // row[11]: ""（野怪无英雄）
}
```

### Tb_user_game_log（操作日志）
```typescript
// row: [log_id, user_id, action_type, detail_type, detail_json, timestamp]
// action_type 14 = 攻城结果（"[\"董卓\",\"土地Lv.3\",14321422]"）
// action_type 15 = 占领获益（"[\"董卓\",\"\",city_id,\"2,280;\"]"）
// action_type 16 = 攻城结果2
```

---

## 三、坐标系统（完全解析）

### 统一坐标编码（2026-03-19 修正）

**所有表统一使用同一编码**: `pos = x * 10000 + y`

```
坐标系统:
  X 轴向南递增 (x ≈ 1~1501)
  Y 轴向东递增 (y ≈ 1~1501)
  地图约 1500×1500 近正方形网格

城市示例:
  14321422 = x=1432(南方), y=1422(东方)

郡县示例:
  7510751 = x=751, y=751 （河南尹中心点，地图正中央）
  1510873 = x=151, y=873 （上谷，幽州，北方）
  11520083 = x=1152, y=83 （云南，益州，西南）
```

> **2026-03-19 修正**: 此前误判郡县为 `x*1000+y` 编码，实际全部是 `x*10000+y`。
> 已通过 SVG 可视化验证地理位置正确（凉州=西北、幽州=东北、益州=西南、扬州=东南）。

**行军时间计算**（从 Tb_army 推算）：
```
distance = |target_row - src_row| + |target_col - src_col|  （曼哈顿距离）
march_time = distance / march_speed * 时间系数
速度 120 → 相邻格约 1 格/秒（推测）
```

**已知城池类型**：
- `土地Lv.3` = 野怪占据的普通格子（可占领）
- level 字段决定城池等级（1-9+）

---

## 四、战斗机制（从数据推断）

### 将领属性
| 属性 | 字段 | 示例值 | 说明 |
|------|------|--------|------|
| 武力 | force | 684 | 影响物理攻击 |
| 统率 | governance | 1786 | 影响兵种战斗力 |
| 技能 | skill_power | 3268 | 技能伤害系数 |
| 智谋 | wisdom | 950 | 影响计谋/反制 |
| 魅力 | charisma | 1824 | 影响士气/回血 |
| 综合战力 | total_power | 2340-3360 | 综合评分 |

### 兵种编制（soldier_formation）
```
"3,3;1,1;1,1;" = 
  兵种3×3人, 兵种1×1人, 兵种1×1人
实际可能是 [兵种ID,兵力;兵种ID,兵力;兵种ID,兵力]
```

### 已知 CMD_92 战报字段（stzbHelper 来源）
```
battle_id, time, wid(城池坐标), 
attack_name, defend_name,           ← 玩家名
attack_union_name, defend_union_name ← 联盟名
attack_all_hero_info: "heroId,level; heroId,level;"
defend_all_hero_info: ...
attack_advance: "star1;star2;star3;"  ← 进阶星级
attacker_gear_info: ...               ← 装备
all_skill_info: ...                   ← 技能
attack_hp, defend_hp: long            ← 战斗前/后 hp
result: int                           ← 0/1 胜负
```

---

## 五、五大核心设计洞察 → 直接应用到项目

### 洞察1：世界状态是增量的，不是全量的
**率土做法**：
- CMD_5028（世界快照）每秒推送，内容是 **增量diff**
- CMD_90005 是数据库行级别的 **表增量操作**（op=1插入/2更新/3删除）
- 客户端维持本地状态，只接收变化

**应用到我们项目**：
```typescript
// 我们的 WorldState 应该同样支持增量
interface WorldStateDelta {
  tick: number
  ops: Array<{
    table: 'city' | 'army' | 'unit' | 'player'
    op: 'insert' | 'update' | 'delete'
    id: string
    changes: Partial<AnyEntity>
  }>
}
// AI 感知层 (Perceive) 只拿增量，不拿全量
```

### 洞察2：部队有完整的生命周期状态机
**率土做法（从 Tb_army 推断）**：
```
状态: status=0(静止), 1(行军中), 4(战斗), 5(回城中)
march_type: 4=攻击, 5=返回
子状态: sub_status=98（推测=征兵中）
通知系统: army_move_state_xxx, army_conscripting_state_xxx
```

**应用到我们项目**：
```typescript
type ArmyStatus = 'idle' | 'marching' | 'fighting' | 'returning' | 'conscripting'
// 我们已有的 GeneralAgent 应该在 PlanningJobMachine 里感知这个状态
// 每次 advanceTick 后更新 WorldState.armies[id].status
```

### 洞察3：同盟战争的核心是城池所有权争夺
**率土做法**：
```
Tb_world_city: {city_id: {slot: [op, ?, owner_user_id, ?, occupy_time, expire_time, ...]}}
每个格子有唯一 owner
占领后有保护期（expire_time）
城池有等级 1-N（影响资源产出）
```

**应用到我们项目**：
```typescript
interface CityCell {
  id: string   // 'x,y'
  level: number
  ownerId: string | null
  occupyTick: number
  isProtected: boolean
  resourceType: 'wood' | 'stone' | 'food' | 'iron' | 'capital' | 'pass'
}
// CommanderAgent 的战略目标应该以 CityCell 为单位
// "占领 (1432, 1422)" 是一个合法的 ExecutableOrder
```

### 洞察4：将领是独立的有状态主体
**率土做法**：
```
每个将领有：hero_id, hero_type_id, level, star_level, 五维属性, 技能列表
技能系统：equipped_skills="1,21,31;" skill_progress="21,0,0;31,0,0;"
归属：user_id 绑定到具体玩家
上阵：army 的 soldier_formation 包含将领编队
```

**应用到我们项目**（已有 GeneralProfile，对照完善）：
```typescript
interface GeneralProfile {
  id: string
  heroTypeId: string  // 对应率土的 hero_type_id
  level: number
  attributes: {
    force: number      // 武力
    governance: number // 统率  
    skill: number      // 技能
    wisdom: number     // 智谋
    charisma: number   // 魅力
  }
  skills: string[]
  assignedArmyId: string | null  // 当前编入哪支部队
}
```

### 洞察5：资源系统是时间驱动的产出
**率土做法（从 Tb_user_res + Tb_user_city 推断）**：
```
资源字段 3,4,5,6 → 4种基础资源（每次更新都有时间戳字段20-24）
时间戳21,22,23,24 = 各资源上次产出时间
城池等级（Tb_user_city field[3]: 9030, 11911...）影响产出速率
Tick 推进时资源增加：resources[i] += city_level * rate * elapsed_seconds
```

**应用到我们项目**：
```typescript
// 在 advanceTick 里：
function tickResources(state: WorldState): void {
  for (const playerId of Object.keys(state.players)) {
    const player = state.players[playerId]
    const tickDelta = TICK_DURATION_SECONDS
    for (const cityId of player.occupiedCities) {
      const city = state.cities[cityId]
      player.resources.food   += city.level * FOOD_RATE   * tickDelta
      player.resources.wood   += city.level * WOOD_RATE   * tickDelta
      player.resources.stone  += city.level * STONE_RATE  * tickDelta
      player.resources.iron   += city.level * IRON_RATE   * tickDelta
    }
  }
}
```

---

## 六、Lua 脚本层的逆向线索

从 `unitrace.log` 的 `[SCRIPT]` 标签确认：
```
main.rolling_notice_view.RollingNoticeView   ← Lua 模块路径
NetMgr.onCallback: 5028                      ← Lua 函数名
HelpGuideManager._onHelpGuideNodeTrigger     ← AI Guide Lua
ngpush_service.remove_local_notification     ← 推送服务 Lua
```

**这意味着**：
- 游戏主逻辑在 Lua 脚本中（`.stb` 文件）
- 模块名格式：`目录.文件名.类名`
- 网络包处理：`NetMgr.onCallback(cmdId, data)`
- 推送通知用 `army_conscripting_state_{army_id}` 格式

**对项目的启示**：我们的前端事件系统可以参考这个模式：
```typescript
// 事件命名规范（参考率土）：
'army.move.started'          // army_move_state_{id}
'army.conscript.completed'   // army_conscripting_state_{id}  
'battle.result.available'    // battle_report_{id}
'city.occupied'              // city_state_{id}
```

---

## 七、STZB 文件加密（未完全破解，但有进展）

| 格式 | Magic | 加密方式 | 状态 |
|------|-------|--------|------|
| `.stb` 脚本 | `STZB` (53545a42) | AES（熵7.04，高强度） | 待 Frida 运行时 hook |
| `gm_dict.json` | `d55ae4ca` | 未知（非STZB） | 待分析 |
| 网络包 type_3 | - | zlib | **已破解** |
| 网络包 type_5 | - | XOR152 | **已破解** |

**Frida 方案**（待 ADB 稳定后执行）：
```javascript
// 目标函数：NeoX 文件加载器的解密回调
// 推测函数名：neox_file_decrypt / stb_load / readFileContents
Interceptor.attach(Module.findExportByName("libclient.so", "?????"), {
  onLeave: function(retval) {
    // 拦截返回值即为解密后内容
    send(Memory.readByteArray(retval, size))
  }
})
```

---

## 八、玩家全局状态（Tb_user_red_dot_new — 解锁完整快照）

`Tb_user_red_dot_new` 的 field[5] 是一个 JSON 大对象，包含玩家几乎全部解锁状态：

```json
{
  "4562": "100101,100013,100023,100478,100015,100021,100024",  // 已解锁武将类型ID列表
  "598":  "11,36,51,76,79,17,40",         // 已解锁内政/建筑？
  "2035": "29,34,35,23,36,37,14,17",      // 已解锁阵型/科技？
  "4558": "4,1;5,1;3,2;7,1;",             // 装备槽状态
  "18":   "29,1;14,1;11,1;16,1;12,1;3,1;21,1;18,1;76,1;75,1;", // 已学科技
  "19":   "1,1;2,1;3,1;4,1;5,1;",         // 城建等级
  "3098": "2,6,5,7,8,9,4,1,11,10,12",     // 研究顺序？
  "9116": "30000000",                      // 某上限（兵力上限？）
  "7050": "3,1,6,4,5,7,2,8,9,10",         // 阵型优先级
  "119":  "18317367988"                   // 可能是总战力/积分
}
```

**对项目的价值**：
- `4562` 揭示了武将解锁列表字段的格式，对应我们的 `UnlockedGenerals`
- `9116 = 30000000` 极可能是**兵力上限**（3千万）
- `18`/`19` 格式 `id,level;` 是科技树和建筑的通用序列化格式

---

## 九、战斗日志完整解析（实测数据）

### 本次捕获的两场战斗（用户 2637414，玩家"风华丨风向"）

| 字段 | 战斗1 | 战斗2 |
|------|-------|-------|
| battle_id | 5840016 | 5840023 |
| 时间 | 1773809072 | 1773809109 |
| 城池坐标 | 14321422 (x:1432,y:1422) | 14311422 (x:1431,y:1422) |
| 攻方武将 | 100009,100032,100592 | 100009,100032,100592 |
| 守方武将 | (空，野怪) | (空，野怪) |
| 结果 | 胜(1) | 胜(1) |
| battle log | `5840016,1,1,1,1,2;` | `5840023,1,1,1,2,1;` |
| 占领奖励 | `"2,280;"` (资源type2,280) | `"3,240;"` (资源type3,240) |

### 战斗结果字段格式
```
"battle_id, r1, r2, r3, r4, r5;"
r1=1(整体胜), r2/r3=小分胜负, r4=将领状态, r5=阵型结果
```

### 武将战后更新（即时推送）
战斗后 CMD_90005 立即推送 Tb_hero 更新：
```
hero 4495252: power 2340→3360, stat11 3916→3988, losses 0→10, exp 207850→9150
hero 4495250: power 2340→3360, stat11 3889, losses 0→144, exp 207750→9050  
hero 4495240: power 2340→3360, stat11 3990, losses 0→37, exp 207800→9100
```
**结论**：战斗后立即推送，hero 的 power/损失/经验都是战斗结果的直接函数。

---

## 十、资源系统实测数据

```
userId: 2637414
资源快照（两次战斗间，约 63 秒间隔）：
  field 3 (木材?): 618019 → 618057   (增加 38/63s ≈ 0.6/s)
  field 4 (石料?): 665922 → 665964   (增加 42/63s ≈ 0.67/s)
  field 5 (粮草?): 637583 → 637741   (增加 158/63s ≈ 2.5/s)
  field 6 (铁矿?): 638261 → 638302   (增加 41/63s ≈ 0.65/s)
  field 27(?)    : 280    → 330      (增加 50/63s ≈ 0.79/s)
  field 14(?);   : 5930   → 5680     (减少 250 ← 战斗消耗？)
  field 15(?):    :        → 5680    
  field 28(?)    :         → 330
```

**城池等级快照（Tb_user_city field[3]）**：
```
city 14331420: 9030 → 11911 → 11867   ← 主城（坐标 x:1433, y:1420）
```

**对产出公式的推断**：
```typescript
// 玩家主城 1433,1420，周边两格的野地被占领
// 63秒内：木材+38，粮草+158（远高于其他）
// 推测粮草是主要产出资源，city_level 直接影响产出速率
// 公式猜测：resource_per_tick = base_rate * (city_level / 1000)^2
```

---

## 十一、ADB/Frida 状态总结

### ✅ 已完成
- ADB 连接 MUMU (127.0.0.1:7555)，已获 root（`adb root` 命令）
- MUMU root 通过 CLI 开启：`MuMuManager.exe setting -v 0 --key root_permission --value true`
- 提取 libclient.so (115MB，x86_64 + ARM Houdini 翻译层)
- 提取全部配置文件、pref_data、env_config
- tcpdump 抓包多轮（含 exec-out 流式管道）
- **完整解码所有网络包（3 种编码全破解）**
- **完整数据库表结构分析（11 张表）**
- **实测战斗数据 2 场，将领 3 个，资源产出曲线**
- **Python 工具链完成**：
  - `tmp/stzb_capture.py` — pcap 文件解析器 + Scapy 实时抓包
  - `tmp/stzb_long_capture.py` — ADB tcpdump 流式抓包（支持长时间运行、多账号）
  - `tmp/stzb_raw_capture.py` — Windows Raw Socket 抓包（需管理员权限）
- **stzbHelper (Go) 源码完全分析**：parse.go 的 BattleData 结构、协议格式已移植到 Python

### 🔧 当前环境
```
ADB: D:\Program Files\Netease\MuMu\nx_main\adb.exe -s 127.0.0.1:7555
MuMu CLI: D:\Program Files\Netease\MuMu\nx_main\MuMuManager.exe
Python: C:\Users\Buffoon Queer\AppData\Local\Programs\Python\Python311\python.exe
Root: uid=0(root) via `adb root`
Game: com.netease.stzb.netease
Server: 42.186.76.238:8001
```

### ❌ 待做（Frida 部分）
- frida-server 版本问题：MUMU 是 x86_64，游戏用 ARM Houdini，两套 ISA
- 目前最可行方案：**frida-server-16-x86_64 + frida-gadget 注入到 ARM 层**
- 备选方案：使用 **Cheat Engine + MUMU** 直接内存搜索

### 下一步
1. 用 `frida-ps -U` 确认 x86_64 frida 能看到 stzb 进程
2. Hook `neox_decrypt` 或 lua_loadbuffer 获取 .stb 明文
3. 从 .stb 中提取完整武将属性表、战斗公式、科技树参数
4. 推送 **frida-server-x86_64-16.5.9**（匹配 Python frida 16.5.9）

### 备用方案（不需要 Frida）
1. 做一次**完整战斗演练**，抓取 CMD_92 战报包
2. 通过战报反推伤害公式
3. 用**公开 wiki 数据**验证武将属性（率土有大量玩家整理的数据表）

### GitHub 开源参考项目
| 项目 | Stars | 语言 | 说明 |
|------|-------|------|------|
| FlxSNX/stzbHelper | 44 | Go | **核心参考**：完整协议解析、BattleData 结构、宿主机 Npcap 抓包 |
| Wind0622/stzbhelper-java | 0 | Java | stzbHelper Java 移植版 |
| Perfare/Il2CppDumper | 8742 | C# | IL2CPP 逆向（率土非旧客户端栈，不适用） |
| Perfare/AssetStudio | 15162 | C# | 旧客户端资源提取（同上） |
| K0lb3/U-Py | 1257 | Python | Python 旧客户端 API（同上） |
| yairm210/Unciv | 10177 | Kotlin | 开源文明5（架构参考） |

---

## 十二、技能效果 ID 语义推导（2026-03-18 新增，03-18 大幅修正）

> 基于 `tb_cfg_skill_effect_map`（670 条技能、121 种效果 ID）+ **技能中文名→效果 ID 分组语义分析**
> 分析方法：将同一效果 ID 下的所有技能名聚合，从名称语义推导效果含义。

### 分析方法论

效果处理逻辑不在客户端脚本中（全局搜索所有可解析 .pyc 的 co_names/co_consts 确认），
战斗计算在服务端 C++ 层 (libclient.so) 执行。因此通过**技能名→效果ID反向推导**：

```
同一 effect_id 下多个技能的中文名呈现一致语义特征
→ 该特征即为效果 ID 的含义
```

### 效果 ID 完整语义表

#### 100系 — 属性加成/基础增强

| ID | 次数 | 确认语义 | 代表技能 |
|----|------|---------|---------|
| **101** | 58 | **武力/攻击加成** | 天下无双, 攻击强化, 坚守突击 |
| **102** | 56 | **统率/防御加成** | 义勇军, 防御之策, 坚守突击 |
| **103** | 44 | **智谋/策略加成** | 运筹帷幄, 成竹在胸, 远攻秘策 |
| **104** | 15 | **速度加成** | 其疾如风, 速度强化, 疾风突击 |
| **105** | 4 | **攻城效果** | 冲车, 毁墙, 投石轰击, 陷阵营 |
| **106** | 13 | **远程攻击加成** | 远攻强化, 远攻之策, 远攻秘策 |
| 111 | 6 | 属性倍率/加成变体 | 一骑当千, 形兵之极 |
| 131 | 12 | 攻击倍增 | 侵掠如火, 锐士, 矢志不移 |
| 152 | 44 | 兵种特攻系数 | 长戟兵方阵, 弓兵特攻 |
| 191 | 4 | 特殊属性(兵占比加成) | 整装待发, 坚城之计 |

#### 200系 — 主动伤害/攻击行为

| ID | 次数 | 确认语义 | 代表技能 |
|----|------|---------|---------|
| **201** | 45 | **物理主动伤害** | 重斩, 齐射, 箭岚, 乱击 |
| **202** | 39 | **谋略主动伤害** | 闭月, 强攻, 枪阵, 鱼鳞阵 |
| **203** | 39 | **减益debuff(谋略系)** | 谎报, 中级谎报, 谋定 |
| **204** | 18 | **牵制/限制行动** | 牵制, 牵制之策, 攻其不备 |
| 207 | 25 | 策略间接伤害 | 驱虎吞狼, 鬼谋, 了如指掌 |
| 211 | 7 | 连续物理攻击 | 三板斧, 百鸟朝凤 |
| 271 | 3 | 大范围策略伤害 | 火烧连营, 焰焚箕轸 |

#### 300系 — 核心战斗机制（使用最广泛）

| ID | 次数 | 确认语义 | 代表技能 |
|----|------|---------|---------|
| **301** | **159** | **普通攻击/主动物理** | 辕门射戟, 银龙冲阵, 横扫千军 |
| **302** | **85** | **谋略攻击/主动策略** | 算无遗策, 猛火, 奇门遁甲 |
| **303** | 21 | 穿透物理(追击) | 铁骑突击, 浴血, 绝地反击 |
| **304** | 18 | 持续策略(DoT) | 楚歌四起, 毒泉, 瘟疫 |
| **305** | 20 | **火攻** | 火箭, 火辎, 焰焚箕轸, 赤壁大火 |
| **306** | 8 | 连环/组合攻击 | 索命连环, 破凰, 三英战吕布 |
| **307** | 3 | 大规模火攻 | 火烧连营, 烽火覆周 |
| 311 | 3 | 特殊物理(溃逃加伤) | 斩杀, 痛击 |
| 322 | 6 | 特殊策略(附加效果) | 空城计, 反间计 |

#### 400系 — 治疗/回复

| ID | 次数 | 确认语义 | 代表技能 |
|----|------|---------|---------|
| **401** | **49** | **主动治疗/回复** | 安抚军心, 急救, 包扎, 增援 |
| **402** | 21 | **持续治疗/大量回复** | 胡笳离愁, 收拢, 休整, 养精蓄锐 |

#### 500系 — Buff/Debuff/控制（效果最丰富）

| ID | 次数 | 确认语义 | 代表技能 |
|----|------|---------|---------|
| **501** | 15 | 额外伤害buff | 方阵突击, 落雷, 陷阱 |
| **502** | 17 | 增伤/减防debuff | 强势, 决绝, 反计 |
| **503** | 14 | 混乱/控制 | 闭月, 迷阵, 妖术, 蛊惑 |
| **504** | 15 | 护盾/格挡 | 坚盾阵, 援护, 一夫当关 |
| **505** | 9 | 嘲讽/拉仇恨 | 挑衅, 诱敌, 虎据孤城 |
| **511** | 15 | 先手/洞察 | 洞察, 陷阵营, 明察秋毫 |
| **512** | 6 | 驱散/净化(debuff) | 驱散, 看破, 明镜止水 |
| **513** | 7 | 净化/解控(buff) | 冷静, 移花接木, 金蝉脱壳 |
| **515** | 14 | 光环/场控 | 国士, 白衣渡江, 王佐之才 |
| **521** | 18 | 位移/突袭 | 假途, 神兵天降, 千里奔袭 |
| **522** | **63** | **物理防御buff** | 坚守, 铁壁, 避其锋芒 |
| **523** | 19 | 物理攻击buff | 银龙冲阵, 决绝, 战意 |
| **524** | **58** | **谋略防御buff** | 铁壁, 固阵, 避其锋芒 |
| **531** | **54** | **物理增伤buff** | 冲锋, 奋起, 激昂 |
| **532** | 32 | 物理debuff/减防 | 骁勇, 破甲, 攻心, 威压 |
| **533** | 31 | 谋略增伤buff | 激昂, 犒劳, 谋定而动 |
| **534** | 27 | 谋略debuff/减防 | 破甲, 乱阵, 攻心 |
| **551** | 14 | 反击/触发 | 战伤无畏, 反击, 绝地反击 |
| **552** | 13 | 特殊触发/debuff | 佯攻, 八门金锁, 虚实 |

#### 700系 — 高阶/特殊机制

| ID | 次数 | 确认语义 | 代表技能 |
|----|------|---------|---------|
| 701 | 5 | 特殊被动 | 鬼谋, 锦马慑敌 |
| **714** | 16 | **闪避/免疫** | 规避, 兵者诡道, 美人计 |
| 744 | 5 | 追击加速 | 穷追猛打, 先驱突击 |
| **752** | 10 | 奇袭/突然效果 | 措手不及, 白衣渡江, 声东击西 |
| **761** | 18 | **先手/优先行动** | 先驱, 长驱直入, 先驱突击 |
| 771 | 6 | 溃逃/恐惧 | 长坂之吼, 虎啸 |

#### 900系 — 特殊战术机制

| ID | 次数 | 确认语义 | 代表技能 |
|----|------|---------|---------|
| 901 | 2 | 畏缩/犹疑 | 上将潘凤, 犹疑 |
| 902 | 7 | 特殊战术/借势 | 借刀斩叛, 疑兵避战, 围魏救赵 |
| **952** | 9 | **停战/不战** | 不攻, 拒战言和, 偃旗息鼓 |

#### 复合 ID（100000xxx）— 条件触发变体

| 前缀 | 基础效果 | 含义 | 代表技能 |
|-------|---------|------|---------|
| 100000+401 | 治疗 | 条件治疗 | 皇裔流离, 遗志, 忠义蜀后 |
| 100000+512 | 驱散 | 条件驱散 | 索命连环, 驱逐, 看破 |
| 100000+513 | 净化 | 条件净化 | 安抚军心, 冷静, 移花接木 |
| 200001/200002 | — | XP技能/觉醒效果 | 健卒不殆, 三让徐州 |

### 效果体系总览

```
100系 ─ 属性加成（被动）    ← 武/统/智/速/攻城/远攻
200系 ─ 主动伤害/debuff     ← 物理伤害/策略伤害/减益/牵制
300系 ─ 核心战斗行为（最多）← 普攻/策攻/追击/DoT/火攻/连环
400系 ─ 治疗回复            ← 主动治疗/持续治疗
500系 ─ Buff/Debuff/控制    ← 最丰富，涵盖增减攻防/控制/位移/光环
700系 ─ 高阶被动/特殊       ← 闪避/免疫/先手/溃逃
900系 ─ 特殊战术            ← 畏缩/借势/停战
```

**项目设计参考**：
- STZB 效果体系分 7 大系 + 复合条件变体，共 121 种基础效果
- 建议本项目技能效果也分 100 系（基础增强）、200 系（主动伤害）、300 系（核心行为）、400 系（治疗）、500 系（增减益控制）的 5 大系架构
- 每系 10-20 个独立 ID，总计 50-100 个，配合复合前缀可扩展
- 高频效果（301 普攻 159 次、302 策攻 85 次）应为系统默认行为
- 500 系最丰富（25 种），体现了 SLG 对 Buff/Debuff 系统深度的需求

---

## 十三、武将属性表结构（2026-03-18 新增）

> 基于 `tb_cfg_hero_new_cost`（58 个 SSR 武将，arity=12）

### 字段映射（推导）

```
[0]  hero_type_id: 武将类型ID (100004-105008)
[1]  rarity:       星级上限 (25=4星, 30=5星)
[2]  force:        武力基础值 (2300-11000)
[3]  governance:   统率基础值 (5500-13600)  
[4]  wisdom:       智谋基础值 (3300-12700)
[5]  charisma:     魅力基础值 (2900-9000)
[6]  speed:        速度 (200-2200，多数为600-1200)
[7]  force_sub:    武力副属性 (34-229)
[8]  gov_sub:      统率副属性 (92-209)
[9]  wisdom_sub:   智谋副属性 (38-248)
[10] charisma_sub: 魅力副属性 (39-157)
[11] speed_sub:    速度副属性 (14-181)
```

### 样本数据（5 个武将，推断人物）

| field[0] | 推测武将 | 武力 | 统率 | 智谋 | 魅力 | 速度 |
|----------|---------|------|------|------|------|------|
| 100004 | （弓兵型）| 6400 | 7700 | 9500 | 8500 | 200 |
| 100019 | （骑兵型）| 9500 | 8300 | 5800 | 8800 | 300 |
| 100020 | （谋士型）| 3500 | 7400 | 9800 | 2900 | 1600 |
| 100032 | （攻城型）| 2900 | 5600 | 9000 | 3700 | 1200 |
| 100028 | （猛将型）| 9300 | 5600 | 9500 | 5300 | 900 |

**推荐武将列表**（`tb_cfg_recommend_hero`，63个）：
100013, 100015, 100016, 100020, 100021... 这些是游戏推荐的入门时期目标武将。

**项目设计参考**：
- 五维属性（武力/统率/智谋/魅力/速度）是 STZB 核心设计，本项目已在 `GeneralProfile` 中有类似字段，应对齐
- 速度差异巨大（200 vs 1600，8倍差）表明机动性是核心数值之一
- 武将稀有度用最大培养等级区分（25星/30星）而非传统稀有度标签

---

## 九、关键已知数据总结

```
游戏服务器: 42.186.76.238:8001 (TCP)
测试玩家: 风华丨风向 (user_id: 2637414)
主城坐标: (1433, 1420)
当前战斗坐标: (1432, 1422), (1431, 1422)
攻击目标: 土地Lv.3 (野地)
进攻武将组合: heroes 100009, 100032, 100592
部队速度: 120, 编队: "3,3;1,1;1,1;"
资源量级: ~63万/种 (木石粮铁)
战报 ID: 5840016, 5840023 (均为胜利)
```

---

## 十四、区划空间数据分析（2026-03-19 新增）

> 基于 `cfg_map_world.json`（47表, 6.6MB）深度分析，发现完整的区划层级空间数据。

### 区划层级架构

```
州 (region, 13+1个) → 郡 (junxian, 94个) → 县 (xian, 316个) → 城市 (world_city) → 地块 (world_join 邻接图)
```

### 数据源表

| 表 | 行数 | arity | 关键字段 | 用途 |
|-----|------|-------|---------|------|
| `tb_cfg_region_314` | 13 | 9 | id, 名称, 简称, 描述(含首府), 邻接 | 州级区划+邻接关系 |
| `tb_cfg_world_junxian_2` | 94 | 7 | id, center_xy, 郡名, min_xy, max_xy | 郡级BBox边界 |
| `tb_cfg_world_xian_14` | 316 | 6 | id, 县名, center_xy, min_xy, max_xy | 县级BBox边界 |
| `tb_cfg_world_city_5` | 2362 | 7 | pos(x*10000+y), type, 名 | 城市点位 |
| `tb_cfg_world_join` | 4470 | 2 | [地块A, 地块B] | 邻接图/路径规划 |
| `tb_cfg_client_scenic` | 8264 | var | pos, 类型 | 景观/装饰坐标 |

### ID编码规律

层级关系嵌入在 ID 中：

```
junxian_id ÷ 100 = region_id
xian_id    ÷ 100 = junxian_id

示例：
  县 10102(荥阳) ÷ 100 = 郡 101(河南尹) ÷ 100 = 州 1(司隶)
  县 90104      ÷ 100 = 郡 901(太原) ÷ 100 = 州 9(并州)
```

### BBox 数据示例

```
郡 101 河南尹: center=(751,751), bbox=[(715,643), (838,775)]
郡 201 京兆:     center=(527,577), bbox=[(479,488), (580,639)]
郡 901 太原:   center=(649,823), bbox=[(582,756), (717,902)]

坐标系: pos = x*10000+y, X轴向南递增, Y轴向东递增, 地图约1500×1500
```

每个郡/县的 BBox 定义了地图上的矩形边界，可直接用于：
- 旧客户端 Tilemap 区域形状生成
- Polygon/Rect Collider 点击检测
- 战区自动划分算法的空间输入

### 对项目的应用价值

1. **地图生成**：94郡BBox + 316县BBox → 构建完整地图骨架，无需从图片提取边界
2. **战区划分**：Region邻接表 + ID层级 → CommanderAgent 战区自动分配
3. **行军规划**：world_join(4470边) + world_road_detail(1099条) → 构建导航图
4. **情报系统**：郡级BBox 可作为“边界侦察”的触发区域
5. **建议路线**：不需二次逆向工程提取地图边界，cfg数据已包含完整空间信息
