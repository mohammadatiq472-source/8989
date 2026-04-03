# 全仓中性术语迁移索引（2026-03-29）

## 1. 目标与范围

本轮改造目标：

- 去除新增代码中的 `player/enemy` 语义耦合。
- 保留必要兼容层，避免旧脚本/旧调用立刻失效。
- 明确“函数名变更 + 用意 + 兼容状态”，防止后续工程师重复改造。

本文件是当前“术语统一”唯一索引入口，后续改动请在此文件追加。

---

## 2. 核心函数/接口变更清单

## 2.1 Unity 客户端（人类势力改为运行时注入）

文件：`My project/Assets/Scripts/Network/09-csharp-dto-ai-config.cs`

- `AiConfigFactionConstraint.HumanFactionId`
  - 旧：`"player"`
  - 新：`""`（空默认）
  - 用意：禁止客户端静态绑死 `player`。
- `IsHumanControlledFaction(string factionId)`
  - 旧：仅 `factionId == "player"` 返回 true
  - 新：非空 factionId 即视为可控
  - 用意：支持未来多真人多势力。

文件：`My project/Assets/Scripts/Network/07-csharp-client-skeleton.cs`

- `GetAiConfigAsync(...)`
  - 旧：默认拼 `/api/ai/config?factionId=player`
  - 新：默认空 faction 时请求 `/api/ai/config`，有值才带 query
  - 用意：让服务端决定默认主势力，客户端不硬编码。

文件：`My project/Assets/Scripts/Network/UnitySessionHeartbeatController.cs`

- 新增：`ResolveJoinFactionIdAsync()`
  - 行为：当 Inspector 未配置 factionId 时，从 `/api/unity/runtime` 选择可加入势力。
  - 用意：接入阶段可零配置启动。
- `JoinAndStartHeartbeatLoopAsync()`
  - 新行为：join 成功后回写 `factionId` 并同步到 `GameManager.playerFactionId`。

文件：`My project/Assets/Scripts/Game/GameManager.cs`

- `playerFactionId`
  - 旧默认：`"player"`
  - 新默认：`string.Empty`
  - 用意：由会话系统在运行时注入。

文件：`My project/Assets/Scripts/Map/ChunkedMapRenderer.cs`

- 新增：`IsHumanOwner(string owner)`
  - 用于替代 `owner == "player"` 判断。
- `GetFactionTint(...)` / `GetTerrainColorFallback(...)`
  - 旧：直接按 `player`/非`player`着色
  - 新：按运行时人类势力着色。

文件：`My project/Assets/Scripts/Map/UnitTokenRenderer.cs`

- 新增：`ResolveHumanFactionId(WorldState world)`
  - 行为：当 `GameManager.playerFactionId` 为空时，从当前 world 推断主人类势力。
  - 用意：避免 token 渲染链路依赖固定 `player`。

文件：`My project/Assets/Editor/Diagnostics/AiQuotaRealtimeHudPlayModeValidator.cs`

- 验证用 faction 从硬编码 `player` 改为测试常量 `faction_alpha`。
- 用意：PlayMode 验证用例也走中性路径。

---

## 2.2 服务端关键逻辑（去 player 特判）

文件：`server/src/agents/court/CourtService.ts`

- `buildSeats(...)` 中 `canVeto`
  - 旧：`factionId === 'player'`
  - 新：`canVeto: true`（所有 human seat）
  - 用意：去除 player 特权，支持多真人势力平权治理。

文件：`server/src/agents/reflect/ReflectService.ts`

- 新增：`resolveFallbackFactionId(world)`
  - 行为：按单位/领土评分选择 fallback 势力。
- `dominantFaction` 推断
  - 旧：无匹配时回退 `'player'`
  - 新：回退 `resolveFallbackFactionId(world)`
  - 用意：去除反射层默认阵营耦合。

文件：`server/src/ws/GameWebSocket.ts`

- 订阅报错文案
  - 旧：`player-controlled faction subscription`
  - 新：`human-controlled faction subscription`
  - 用意：协议语义中立化。

文件：`server/src/agents/tools/TacticalSkillLibrary.ts`

- `buildSituationTags(...)`
  - 旧：`luoyang:enemy`
  - 新：`luoyang:opposing`
  - 用意：技能标签统一中性词汇，减少下游 prompt 偏置。

---

## 2.3 共享契约与标签

文件：`shared/contracts/game/meta.ts`

- `CityCamp`
  - 旧：`'player' | 'ai' | 'neutral'`
  - 新：`'human_controlled' | 'autonomous' | 'neutral'`
  - 用意：UI/后端契约对齐“人控/自治/中立”。

文件：`shared/domain/labels.ts`

- `cityCampLabel(...)`
  - 跟随 `CityCamp` 新枚举。
- `ownerLabel(...)`
  - 旧：我方/敌方/中立
  - 新：中立或 `阵营(<factionId>)`
  - 用意：避免标签层把 faction 语义压扁成二元对立。
- `formatNarrativeActors(...)`
  - 去掉 actor=`player/enemy` 的特判映射。

文件：`shared/domain/ruleLabels.ts`

- `ownerLabel(...)`
  - 同步改为 `中立` 或 `阵营(<factionId>)`。

文件：`shared/domain/scenario.ts`

- `camp` 映射改为新枚举：
  - `player -> human_controlled`
  - `others -> autonomous`
  - `neutral -> neutral`
- 用意：城池语义与契约一致。

---

## 2.4 对抗导演模块命名迁移（带兼容）

文件：`shared/domain/enemyDirector.ts`

- 新增主入口：`runOpposingDirector(...)`
- 旧入口保留：`runEnemyDirector(...)`（兼容 wrapper，内部转调新入口）
- 函数名变更：
  - `resolveDefaultEnemyDirectorOptions` -> `resolveDefaultOpposingDirectorOptions`
  - `canEnemyMoveInto` -> `canOpposingUnitMoveInto`
- 变量名变更：
  - `unhandledEnemies` -> `unhandledOpposingUnits`
  - 循环变量 `enemy` -> `unit`
- 用意：模块语义中性化，同时不破坏旧调用。

文件：`shared/domain/rules.ts`

- import 从 `runEnemyDirector as runOpposingDirector` 改为直接 `runOpposingDirector`。

---

## 2.5 评测脚本参数语义升级（兼容旧参数）

文件：`server/src/evals/runOrchestratorStress.ts`

- 新参数（推荐）：
  - `--primary-agents`
  - `--opposing-agents`
  - `--primary-faction-id`
  - `--opposing-faction-id`
- 旧参数兼容：
  - `--player-agents`
  - `--enemy-agents`
- 输出 summary 新增：
  - `primaryFactionId` / `opposingFactionId`
  - `primaryAgents` / `opposingAgents`
- 同时保留兼容字段：
  - `playerAgents` / `enemyAgents`（deprecated）

文件：`server/src/evals/runPhase5HardeningGate.ts`

- `buildDeadlockAgenda(tick)` -> `buildDeadlockAgenda(tick, primaryFactionId)`
- `createCivilEntry(tick, idx)` -> `createCivilEntry(tick, idx, factionId)`
- 新增 `resolvePrimaryFactionId(...)`，替代脚本内 `'player'` 常量。

文件：`server/src/evals/runOfflinePlanningEval.ts`

- `evaluateStructure(...)` 改为基于 `resolvePrimaryFactionId(world)` 的单位集合校验。
- 错误码从 `unknown_or_non_player_unit` 改为 `unknown_or_non_primary_unit`。
- 伪造 battle 记录的 `attackerFaction` 改为动态主势力。

---

## 3. 兼容策略（必须遵守）

- 不要删除 `runEnemyDirector` 旧导出，直到全仓调用链全部迁移完成。
- `runOrchestratorStress.ts` 旧参数 `--player-agents/--enemy-agents` 仍允许使用。
- 输出中的 `playerAgents/enemyAgents` 暂保留，避免旧报表解析器失效。

---

## 4. 已验证的正式入口

- `npm run -s build`
- `npm run -s lint`
- `npm run -s test:session:manager`
- `npm run -s test:ai:quota`
- `npm run -s test:world:mutation-lock`
- `npx tsx server/src/evals/runOrchestratorStress.ts --primary-agents 1 --opposing-agents 1 --concurrency 1 --batch-size 1 --mode mock --output tmp/gates/stress_primary_opposing_smoke.json`
- `npx tsx server/src/evals/runOrchestratorStress.ts --player-agents 1 --enemy-agents 1 --concurrency 1 --batch-size 1 --mode mock --output tmp/gates/stress_player_enemy_compat_smoke.json`
- `npx tsx server/src/evals/runPhase5HardeningGate.ts`
- `npx tsx server/src/evals/runOfflinePlanningEval.ts --dataset server/evals/planning_offline_eval_v1.json --output tmp/planning_offline_eval_neutralized.json`

---

## 5. 尚未收敛完的区域（后续工程师请接续）

- `shared/domain/scenario.ts` 仍包含大量双阵营示例数据（`player/enemy`），属于世界初始内容层而非接口层。
- 部分 `docs/unity/*.md` 仍存在“player-only”历史描述，需和产品节奏一起逐步更新。
- `server/src/evals/runDualPlayerSimulation.ts` 仍会报告“核心规则默认阵营语义”相关 critical gap（评测层提示，不是运行崩溃）。

---

## 6. 协作约束（避免重复改造）

- 新增功能禁止再写死 `player` 作为默认人类势力。
- 任何“对抗方”命名优先用 `opposing`，不要新引入 `enemy*` 前缀。
- 如果改动影响旧入口，必须在本文件追加“兼容策略”条目后再提交。

## 7. Memory Thread Anchor And Verification

- Memory reference used: `codex://threads/019d3113-5586-7181-a3bf-005434e70e99`
- C-drive lookup completed
- Session file used: `C:\Users\Buffoon Queer\.codex\sessions\2026\03\28\rollout-2026-03-28T04-54-04-019d3113-5586-7181-a3bf-005434e70e99.jsonl`
- Top summary check: `turn_context.summary = none` (therefore latest conversation blocks were used as source of truth)
- Current confirmed intent:
  - Unity-first frontend baseline (web frontend removed from active path)
  - neutral terminology migration must be globally discoverable and avoid duplicate re-edits
  - each terminology change should be quickly searchable by date and scope

## 8. Rolling Log Requirement (Mandatory)

- Keep using `docs/CHANGELOG_SEMANTIC_NEUTRALIZATION.md` as the rolling one-line index.
- Every semantic naming change must append one date line immediately.
- Any reintroduction of literal `player/enemy` naming requires justification and compatibility note.
- Entry format: `YYYY-MM-DD | scope | change | compatibility | refs`
