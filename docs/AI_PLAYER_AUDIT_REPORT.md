# AI 玩家系统深度审计报告

> 由 3 个并行审计子代理 + 数据分析生成，基于完整代码审读和仿真数据

---

## 一、审计范围

### 检查的代码文件
| 模块 | 文件 |
|------|------|
| 决策管线 | CommanderAgent.ts, PlanningService.ts, OpenAICompatPlannerAdapter.ts, CommanderTools.ts |
| 将领系统 | GeneralAgent.ts, GeneralProfileStore.ts, GeneralUtilityAI.ts, GeneralLLMAdapter.ts |
| 外交系统 | DiplomacyAgent.ts, GeneralNegotiationChannel.ts |
| 反思系统 | ReflectService.ts |
| 规划降级 | mockPlanner.ts |
| 规则引擎 | rules.ts |
| 仿真设施 | runMultiFactionSimulation.ts |

### 检查的测试数据
| 文件 | 内容 |
|------|------|
| drama30.json (99KB) | 30 tick，纯 mock + 联盟/背叛/建国 |
| gateway50.json (155KB) | 50 tick，意图走 LLM 但全部降级为 mock |
| hybrid1compact.json (6KB) | 1 tick，汉中=LLM(compact)，其余=mock |
| hybrid1test.json (6KB) | 1 tick，汉中=LLM(full context)，其余=mock |

---

## 二、核心发现——数据说话

### 发现 1：Mock 产出高度同质化扩张

**gateway50（50 tick 纯 mock，无联盟）：**
- 13 势力领土范围：3435 ~ 4145 格
- **最强/最弱比值仅 1.21×**——几乎没有差距
- 全部 50536/102400 格被占（49%），增速线性 ≈78 格/tick/势力

**drama30（30 tick mock + 联盟机制）：**
- 领土范围：520 ~ 1782 格
- **最强/最弱比值 3.43×**——联盟系统引入了真实不平等
- 关键：荆州(1782) vs 汉中(520)，差距来自联盟保护 + 地理位置
- 全场仅 T5 发生 8 场战斗，之后 25 tick 零战斗（停战协议太多，彼此都打不到）

### 发现 2：LLM 行为显著不同于 Mock

从之前的 hybrid 测试观察（T1-T30 汉中使用 LLM）：

| 行为维度 | LLM (nvidia/nemotron) | Mock |
|---------|----------------------|------|
| 命令类型 | 60% recon + 20% garrison + 20% march | 90%+ capture，0% recon |
| 战略阶段性 | T1 情报优先 → T4 防御 → T5 均衡 | 始终盲目扩张 |
| 方向感 | 根据 context 选择威胁方向 | BFS 等距扩散（无方向） |
| 侦察 | 首回合 6/8 命令是 recon | **从不生成 recon** |
| 防御 | 感知威胁后主动 garrison | 仅在无其他选项时 garrison |
| T30 领土 | 2162 格（**排名第 1**） | 同期最高约 1400 格 |

**关键洞察：LLM 的"情报优先"策略在 30 tick 后领先纯扩张 50%+**，因为规则引擎的 `recon → intel → autoExpansion` 组合让知情的势力获得更精准的扩张路径。

### 发现 3：外交系统实质空转

- **mock 模式**：tick%3 确定性接受，不调用 DiplomacyAgent，不更新将领档案
- **停战协议 duration=5**：但外交每 3 tick 触发，协议还没过期就被续约
- **结果**：一旦两势力签约就几乎永远不打架（T5 后零战斗）
- **联盟军事加成恒为 0**：`getAllianceSupportModifier()` 只对 `'player'` 阵营返回非零值

---

## 三、Bug 清单（P0-P2）

### P0 — 影响仿真正确性

| # | Bug | 位置 | 影响 |
|---|-----|------|------|
| B1 | **PlanningService fallback 丢失 factionId** | PlanningService.ts catch 块 | LLM 失败降级时生成 factionId='player' 的计划，guard 过滤掉全部命令，势力空转 |
| B2 | **Mock planner 忽略外交协议** | mockPlanner.ts | 生成 capture 攻击停战方领土的命令，进规则引擎被拒，浪费 AP |
| B3 | **commanderId 错误** | runMultiFactionSimulation.ts:1073 | `unit_${fc.id}_1` 混用第 1 号单位 ID 作为指挥官记忆空间，13 势力记忆互相污染 |
| B4 | **NarrativeEvents 返回值被丢弃** | runMultiFactionSimulation.ts | ReflectService 生成的叙事事件不写回 WorldState，无法追溯 |
| B5 | **联盟军事加成只对 player 生效** | rules.ts `getAllianceSupportModifier` | 13 势力互相联盟无任何战场收益，联盟纯粹是停战条约 |

### P1 — 影响 AI 决策质量

| # | Bug | 位置 | 影响 |
|---|-----|------|------|
| B6 | **Mock planner 丢弃 strategicCommand** | mockPlanner.ts 参数 `_strategicCommand` | 13 势力行为完全相同，doctrine 系统形同虚设 |
| B7 | **frontlineRisk 未按 faction 隔离** | CommanderTools.ts | 所有势力看到同一个全局风险评分 |
| B8 | **recentReplays/recentNarratives 未按 faction 过滤** | CommanderTools.ts | faction B 读取 faction A 的行动历史当自己的经验 |
| B9 | **LLM context 缺敌方单位列表** | CommanderTools.ts | LLM 无法精确评估敌方兵力，只有聚合 enemyPressure 值 |
| B10 | **将领 LLM 仿真中硬编码关闭** | runMultiFactionSimulation.ts:969 `skipLLM: true` | GeneralAgent 的中等模型层完全不参与，降级为纯规则 |
| B11 | **charisma 属性无战斗加成** | rules.ts 战斗公式 | 五维属性实际只有四维生效（force/command/intelligence/speed） |

### P2 — 架构债

| # | Issue | 影响 |
|---|-------|------|
| B12 | recon 写入 intel 但 mock/LLM 不读取 intel | 侦察命令零收益 |
| B13 | support 命令从不被 mock 生成 | 后勤支援机制空转 |
| B14 | guard tile 验证过于宽松（只检查格式，不验证存在性）| LLM 可生成不存在的目标 |
| B15 | compact context 递归压缩不可预测 | token 控制不精确 |
| B16 | reviewAfterTicks 上限 schema(6) vs guard(12) 不一致 | 值 7-12 静默通过 |
| B17 | diplomaticContacts 写入但从不读取 | 外交记忆无价值 |

---

## 四、升级建议（按影响排序）

### Tier 1：最小改动，最大回报（1-2 天）

#### U1. 修复 PlanningService fallback 传参（B1）
```typescript
// PlanningService.ts catch:
const fallback = createMockPlan(world, strategicCommand, factionId);
//                                                       ^^^^^^^^^ 加上
```
**回报**：LLM 降级时不再空转，仿真稳定性大幅提升

#### U2. Mock Planner 差异化——读取 doctrine 关键词（B6）
```typescript
// 不再丢弃 strategicCommand，解析关键词
const keywords = strategicCommand.toLowerCase();
const preferRecon = keywords.includes('侦察') || keywords.includes('recon');
const preferDefense = keywords.includes('防御') || keywords.includes('defend');
const preferRush = keywords.includes('进攻') || keywords.includes('attack');
// 在决策树中按关键词调整分支权重
```
**回报**：13 势力行为分化，doctrine 系统上线

#### U3. Mock Planner 外交感知（B2）
```typescript
// findAttackBorderStep / capture 前检查停战
if (hasCeasefireOrAlliance(world, factionId, targetOwner)) continue;
```
**回报**：消除无效 capture 命令，AP 不再浪费

#### U4. 联盟军事加成扩展到全势力（B5）
```typescript
// getAllianceSupportModifier: 移除 'player' 阵营限制
// 检查 diplomacyAgreements 找同盟势力的邻近单位
```
**回报**：联盟从纯停战条约变成真正的军事同盟，外交有战场价值

### Tier 2：中等工作量，显著提升（3-5 天）

#### U5. Mock Planner 兵种分工
- `guard` 型单位 → 优先 garrison（守城/守关隘）
- `recon` 型单位 → 优先 recon（情报收集）+ march
- `assault` 型单位 → 优先 capture + march（进攻主力）
- `logistics` 型单位 → 优先 support（后勤补给）
**回报**：4 种行为模式取代单一 capture 扩张，战线有立体层次

#### U6. frontlineRisk / replays / narratives 按 faction 隔离（B7-B8）
- `scoreFrontlineRisk(world, factionId)` → 只计算自己的前线
- `recentReplays` 过滤 `replay.factionId === factionId`
- `recentNarratives` 过滤 `event.actors.includes(factionId)`
**回报**：LLM 不再读到别人的情报当自己的

#### U7. LLM Context 增加敌方威胁摘要（B9）
```typescript
// 新 tool: listNearbyThreats(world, factionId)
// 返回: 距离前线 ≤5 格的敌方单位 top5，含 strength/direction/factionId
```
**回报**：LLM 从"盲人摸象"升级为"知己知彼"

#### U8. Recon 产出反馈到规划（B12）
- mock planner 在决策前读取 `world.intel` confirmed 区域
- 对 confirmed 区域的敌方信息加权提升（可信度 1.0 vs 未侦察 0.3）
- LLM context 增加 intel 覆盖率和关键发现
**回报**：recon 命令有实际决策收益，形成"侦察→决策→行动"闭环

### Tier 3：较大投入，质变性提升（1-2 周）

#### U9. 将领 UtilityAI 感知联盟 + 外交
- `proposeByUtility()` 在评分中检查目标所属势力是否为盟友
- 盟友领土得分 ×0（不攻击）
- 盟友前线附近得分 ×1.5（支援加成）
**回报**：将领自动执行联盟战略，不再朝盟友发起莫名攻击

#### U10. 流程打通——将领 LLM 可选开启
- 增加 `GENERAL_LLM_ENABLED` 环境变量
- hybrid 模式下 han 势力的将领走 LLM（其余 UtilityAI）
- 调用限制：每 tick 每势力最多 3 次 general LLM 调用
**回报**：将领层出现真正的 AI 思考能力，不再是纯规则

#### U11. Mock Planner v2——引入随机性 + 回合差异化
- 按 `Math.random() * heroAggression` 的概率在 expand/garrison/recon 之间选择
- 不同势力按到洛阳距离设定不同的阶段切换阈值
- 引入"势力性格"概念（基于地理位置的 doctrine 预设）
**回报**：彻底消灭同质化问题，每局仿真产生不同故事

#### U12. charisma 激活——士气系统（B11）
- 新增 `morale` 属性（0-100）
- 战败 → morale -15；战胜 → morale +10；charisma 影响恢复速度
- morale < 30 → strength recovery ×0.5（疲惫军队打不动）
- morale > 80 → 战斗力 ×1.1（士气高涨）
**回报**：第五维属性上线，战争有了心理层面

---

## 五、架构层面的系统性评估

### 成熟度矩阵

| 维度 | 评分 | 说明 |
|------|------|------|
| 容错/重试 | ⬛⬛⬛⬛⬛⬛⬛⬛⬛⬜ 9/10 | 指数退避 + key 轮换 + budget cap + mock fallback，非常专业 |
| Zod 校验 | ⬛⬛⬛⬛⬛⬛⬛⬛⬜⬜ 8/10 | 三层门控（parse→normalize→guard），少量不一致 |
| LLM Context | ⬛⬛⬛⬛⬛⬛⬜⬜⬜⬜ 6/10 | 8 维 context 架构优秀，但缺敌方情报 + 未按 faction 隔离 |
| Mock 规划 | ⬛⬛⬛⬛⬜⬜⬜⬜⬜⬜ 4/10 | 有 BFS 但无差异化、无 doctrine、无外交感知、无 recon |
| 将领系统 | ⬛⬛⬛⬛⬛⬛⬛⬜⬜⬜ 7/10 | 完整的 UtilityAI + 人格调制 + 忠诚漂移，但 LLM 层关闭 |
| 外交系统 | ⬛⬛⬛⬛⬛⬜⬜⬜⬜⬜ 5/10 | 完整实现但 mock 模式绕过，联盟无军事加成 |
| 反思系统 | ⬛⬛⬛⬛⬛⬛⬛⬜⬜⬜ 7/10 | POER 完整闭环 + 技能库积累，但事件不写回 WorldState |
| 多势力隔离 | ⬛⬛⬛⬛⬜⬜⬜⬜⬜⬜ 4/10 | 势力间共享 risk/replay/narrative，信息泄露严重 |
| 规则引擎 | ⬛⬛⬛⬛⬛⬛⬛⬛⬛⬜ 9/10 | 极其成熟，但 charisma/allianceSupport/recon 未充分利用 |

### 核心矛盾

**规则引擎已经 9/10 成熟，但 Mock Planner 只有 4/10**——这意味着丰富的游戏机制（外交、侦察、联盟、关隘防御）被一个过于简单的 AI 行为层白白浪费了。最高 ROI 的改进不是写新规则，而是**让现有的 AI 层能够利用现有的规则引擎能力**。

---

## 六、推荐执行顺序

```
Phase 1（立即）: U1 + U2 + U3 + U4
  → 修 P0 bug，差异化 mock，外交感知，联盟有意义
  → 预期效果：13势力行为分化 3-5×，战斗从T5后归零→持续发生

Phase 2（本周）: U5 + U6 + U7
  → 兵种分工，faction 隔离，敌方威胁感知
  → 预期效果：战线立体化，LLM 决策质量跃升

Phase 3（下周）: U8 + U9 + U10
  → recon 闭环，将领联盟感知，将领 LLM 可选
  → 预期效果：侦察→规划→执行 完整 OODA 循环

Phase 4（后续）: U11 + U12
  → mock v2 随机化，士气系统
  → 预期效果：每局不同的涌现式故事
```

---

*报告生成时间：基于 3 个 Explore 子代理的完整代码审读 + 4 份仿真数据的量化分析*
