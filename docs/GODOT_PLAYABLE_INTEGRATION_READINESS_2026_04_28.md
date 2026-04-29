# Godot Playable Integration Readiness（2026-04-28）

本文是开工前读档与边界确认文档。目标不是实现功能，而是在多 AI 窗口并行时固定：

1. 已经读取和确认过哪些事实。
2. 哪些文件归哪个窗口。
3. 正式集成前依赖哪些文件和命令。
4. 哪些文件尚未读取或需要其他窗口确认。

当前集成策略：使用隔离集成工作树，不在当前大脏树里直接合并。

第一条可玩闭环目标：`Godot mainline -> MapGrid -> 青石城 hub -> AI tile_occupy 后端 authority -> world state / receipt -> Godot visual smoke report`。

## 1. 已读取文件清单

### 1.1 Global Rules

- `AGENTS.md`
- `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
- `CODEX.md`
- `README.md`
- `package.json`

结论：

- 中文文件读写必须 UTF-8。
- 多窗口并行时不能跨线清污、回滚、整文件覆盖。
- 正式验证优先用 package scripts / repo gate，不用临时脚本替代正式入口。

### 1.2 Godot Mainline

- `godot-client/project.godot`
- `godot-client/scenes/app/main.tscn`
- `godot-client/scripts/app/main.gd`
- `godot-client/scripts/ui/main_city_hub_overlay.gd`
- `godot-client/tools/run_mainline_visual_smoke.py`
- `docs/GODOT_PLAYABLE_STATE_AUDIT_2026_04_26.md`

已确认事实：

- Godot 正式入口是 `godot-client/project.godot -> res://scenes/app/main.tscn`。
- `main.tscn` 内已有 `MapGrid`、`NativeShell`、`MainCityHubOverlay`。
- `MainCityHubOverlay` 已把 `青石城` 主城 hub 接入正式 world 模式。
- visual smoke 已支持 `--display-mode world`、`--world-action open_hub`、`--world-action open_hub_panel`、`--panel-id`。
- `alliance` 是当前稳定二级面板验收目标；`interior` 仍有既有 null 节点风险。

### 1.3 World-cell / Map

- `godot-client/scripts/map/map_grid.gd`
- `docs/WORLD_CELL_PHASE2_MAP_GRID_REVIEW_2026_04_25.md`
- `docs/WORLD_CELL_PHASE2_RUNTIME_BUILDER_CONSOLIDATION_2026_04_25.md`
- `docs/WORLD_CELL_FOOTPRINT_PLACEMENT_CONTRACT_2026_04_23.md`
- `godot-client/assets/themes/slgclient/current/world/world_cell_assets_manifest_v1.json`
- `godot-client/assets/themes/slgclient/current/world/world_cell_footprint_manifest_v1.json`

已确认事实：

- `map_grid.gd` 属于 world-cell / map runtime builder 专线，不属于 mainline hub 线。
- 当前 `map_grid.gd` 是大热文件，diff 规模约 `+5631/-532`。
- world-cell 文档明确后续应继续审查 `generic node runtime builder / placement_policy / live_pass metadata`。
- Godot 客户端不应自己生成资源真相，只消费后端 world / map-layout 结果。

### 1.4 Resource Authority / Assets

- `docs/WORLD_RESOURCE_GENERATION_AUTHORITY_HANDOFF_2026_04_22.md`
- `docs/WORLD_RESOURCE_WORKSTREAM_SPLIT_2026_04_22.md`
- `godot-client/assets/themes/slgclient/current/**`
- `godot-client/assets/themes/slgclient/replacements/exchange_bundle/**`
- `world_resource_png_exports/**`
- `portrait_assets/**`

已确认事实：

- 资源地 truth 在后端持久化世界状态里；Godot 只负责画准 tile/cell。
- 当前 assets 脏区是资源导入/替换链，不归 mainline hub 窗口手写。
- 当前 assets 脏区包含大量 `.import`、PNG、PLIST、TSX、TMX、manifest 文件。

### 1.5 AI tile_occupy / Backend Authority

- `docs/AI_PLAYER_MAIN_WINDOW_COMPARE_2026_04_27.md`
- `docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md`
- `docs/AI_PLAYER_INTEGRATION_WINDOW_LOCK_2026_04_27.md`
- `docs/AI_PLAYER_MAP_VISUAL_EXPRESSION_DRAFT_2026_04_27.md`
- `server/tests/ai_player_http_tile_occupy_contract.test.ts`
- `server/src/application/ai/aiPlayerProposalExecution.ts`
- `server/src/application/world/WorldService.ts`
- `shared/schemas/worldAction.ts`
- `shared/contracts/aiPlayer.ts`
- `shared/domain/rules.ts`

已确认事实：

- 后端 authority 链为：`AI proposal -> executor -> WorldService -> shared/domain/rules.ts -> commitWorldState -> receipt`。
- `tile_occupy` 已在滚动状态中记录为可执行 v1 action。
- `tile_occupy` 成功会修改地块 owner、降低 enemyPressure、扣 1 行动点与 1 粮草，并返回 `worldAction=occupyTile`。
- Godot/UI 只消费 `development-plan`、`battle-reports`、receipt 和 world state，不在客户端重做 authority。

### 1.6 Validation Scripts

已确认 package scripts：

- `godot:mainline:visual-smoke`: `scripts\run_python.cmd godot-client\tools\run_mainline_visual_smoke.py`
- `godot:headless:smoke`: `Start-Godot-Headless-Smoke.cmd`
- `godot:world-cell:live-nodes-capture`: `scripts\run_python.cmd scripts\capture_world_cell_live_nodes.py`
- `gate:ai:preflight`: `npm run build && npm run test:ai:governance-guard`

已确认缺口：

- `package.json` 当前没有 `test:ai:player-http-tile_occupy-contract` 脚本。
- 测试文件存在：`server/tests/ai_player_http_tile_occupy_contract.test.ts`。
- 当前可用直接命令应记录为：`npx tsx server/tests/ai_player_http_tile_occupy_contract.test.ts`。

## 2. 文件归属矩阵

| 文件 / 目录 | Owner 窗口 | 本集成窗口可改 | 理由 | 需要的验证 |
| --- | --- | --- | --- | --- |
| `docs/GODOT_PLAYABLE_INTEGRATION_READINESS_2026_04_28.md` | 集成窗口 | 是 | 只记录边界和读档事实 | UTF-8 回读 |
| `godot-client/project.godot` | 集成窗口只读 | 否，除非入口丢失 | 正式入口已是 `main.tscn` | Godot 启动 |
| `godot-client/scenes/app/main.tscn` | mainline hub | 小块改 | 正式主场景，承载 MapGrid / NativeShell / hub | visual smoke |
| `godot-client/scripts/app/main.gd` | mainline hub / 集成胶水 | 小块改 | 连接 runtime、hub、面板、visual smoke；禁止整文件覆盖 | visual smoke + diff review |
| `godot-client/scripts/ui/main_city_hub_overlay.gd` | mainline hub | 小块改 | 青石城 hub 专属 UI 层 | world + open_hub smoke |
| `godot-client/tools/run_mainline_visual_smoke.py` | mainline hub | 小块改 | GUI 可视化验收正式入口 | visual smoke |
| `godot-client/scripts/map/map_grid.gd` | world-cell / map runtime | 否 | 大型地图 runtime builder 热文件，不归 hub 线 | world-cell capture gate |
| `godot-client/assets/themes/slgclient/**` | map resource / asset import | 否 | 大规模资源导入、manifest、TMX、PNG/PLIST/TSX | asset manifest + Godot import |
| `godot-client/scripts/dev/**` | dev story / editor artifacts | 否 | 当前脏区主要是 `*.gd.uid`，不进入正式主线 | 不纳入集成 |
| `server/**` | backend authority | 否 | AI / world authority 由后端窗口负责 | `npm run build` + contract tests |
| `shared/**` | backend authority | 否 | 合同、schema、rules 由后端窗口负责 | `npm run build` + contract tests |
| `docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md` | backend status | 只读 | 记录后端窗口进展 | 不由本窗口更新 |
| `docs/GODOT_PLAYABLE_STATE_AUDIT_2026_04_26.md` | mainline hub / 集成窗口 | 可追加 | Godot 可玩态盘点与证据索引 | UTF-8 回读 |

## 3. 集成依赖链

目标链路：

```text
Godot project.godot
-> main.tscn
-> MapGrid
-> WorldStore / backend runtime
-> 青石城 MainCityHubOverlay
-> AI/tile_occupy proposal or receipt
-> WorldService / shared rules authority
-> world state owner/worldVersion 更新
-> Godot visual smoke report + screenshot
```

关键原则：

1. Godot 只能展示后端合同和 receipt，不直接改世界状态。
2. `tile_occupy` authority 成功与否以后端 contract test 为准。
3. MapGrid 只负责渲染 world state，不实现 AI 行为策略。
4. visual smoke 只验证“可见、可点、可读回”，不替代后端规则测试。

## 4. 禁止跨线覆盖

以下文件禁止整文件覆盖：

- `godot-client/scripts/map/map_grid.gd`
- `godot-client/scripts/app/main.gd`
- `server/src/application/world/WorldService.ts`
- `server/src/application/ai/aiPlayerProposalExecution.ts`
- `shared/domain/rules.ts`
- `shared/schemas/worldAction.ts`
- `shared/contracts/aiPlayer.ts`

允许的集成方式：

1. 从 owner 窗口接收已验证的小包。
2. 手工小块融合，并保留现有主树逻辑。
3. 每个小包单独跑 owner gate。
4. 任何跨 owner 文件修改前先记录理由和预期验证命令。

禁止的集成方式：

1. 从独立 worktree 直接整文件复制热文件。
2. 为了让 Godot 截图通过，在客户端伪造后端 world / receipt。
3. 把 dev story 当正式主线入口。
4. 把 assets 清污和 mainline hub 代码改动混在同一提交。

## 5. 验证入口

### 5.1 Godot Mainline

```powershell
npm run godot:headless:smoke -- --quit-after 3
npm run godot:mainline:visual-smoke -- --display-mode world --timeout-sec 90
npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub --timeout-sec 90
npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id alliance --timeout-sec 90
```

验收点：

- `runtimeReady=true`
- `runtimeLabelOk=true`
- `mapVisible=true`
- `mainCityHub.visible=true`
- `mainCityHub.expanded=true`
- `panelOpenOk=true`（至少 `alliance`）

### 5.2 AI tile_occupy / Backend

```powershell
npm run build
npx tsx server/tests/ai_player_http_tile_occupy_contract.test.ts
npm run gate:ai:preflight
```

注意：

- 当前 `package.json` 缺少 `test:ai:player-http-tile_occupy-contract` 脚本。
- 若要把该测试纳入正式 package entry，需要后端 authority 窗口补脚本或确认命名。

### 5.3 World-cell / Map

```powershell
npm run godot:world-cell:live-nodes-capture
npm run godot:world-cell:live-nodes-capture:viewport
npm run godot:world-cell:live-nodes-capture:region
```

验收点：

- `captureMode` 必须区分 `live_pass` / `live_nodes` / preview，不用 `nodes_formal` 冒充 live 证据。
- `map_grid.gd` 变更必须能通过 world-cell owner 的截图/JSON 证据闭环。
- assets manifest 必须和实际资源路径一致。

## 6. 当前 Git 脏区快照

2026-04-28 只读复核：

```text
TOTAL_DIRTY 3121
mainline_hub 6
backend_authority 116
map_grid 1
assets 1719
dev_story_uid 28
other 1251
```

解释：

- `server/**` 与 `shared/**` 归 backend authority，不由本窗口清理。
- `map_grid.gd` 归 world-cell / map runtime，不由 mainline hub 手写。
- assets 归 map resource / asset import，不和 hub 代码混改。
- dev story UID 不进入正式 mainline。
- `other` 中包含大量仓库迁移/Obsidian/系统路径噪声，必须由 repo hygiene 专门处理。

## 7. 未读 / 待确认文件

### 7.1 缺失文件

- `docs/AI_PLAYER_TILE_OCCUPY_WORKTREE_MERGE_CHECKLIST_2026_04_27.md`

当前主树未找到该文件。可替代参考：

- `docs/AI_PLAYER_MAIN_WINDOW_COMPARE_2026_04_27.md`
- `docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md`

### 7.2 需要后端窗口确认

- `tile_occupy` 最终 package script 名称。
- `tile_occupy` receipt 中 Godot 应读取的最小字段。
- `development-plan` 或 runtime read-model 中是否稳定暴露 `targetTileId / proposalArgs / worldActionPayload`。
- 是否允许集成窗口新增只读 visual smoke adapter 来读取 tile_occupy 结果。

### 7.3 需要 world-cell / asset 窗口确认

- `map_grid.gd` 当前大 diff 是否已经是 owner 窗口最终版本。
- `world_cell_assets_manifest_v1.json` 是否应纳入版本控制。
- `world_cell_footprint_manifest_v1.json` 是否应纳入版本控制。
- 当前 assets 中 `322 D / 1390 ??` 是预期替换还是迁移污染。
- Godot 导入 `.import` 文件是否应该提交。

### 7.4 需要 mainline hub 窗口确认

- `MainCityHubOverlay` 是否作为正式 hub v1 保留。
- `alliance` 是否继续作为稳定 visual smoke 面板。
- `interior` null 节点错误是否单独开 UI 面板修复窗口。
- `observe_tile_occupy` visual smoke 是否新增为正式参数，还是先用现有 world/hub/panel smoke 观察。

## 8. 开工前默认决策

1. 不在当前大脏树直接做最终集成。
2. 使用隔离集成工作树承接 owner 窗口输出。
3. 第一条可玩闭环选择 `tile_occupy`。
4. Godot 只读后端 world state / receipt，不实现 authority。
5. `alliance` 继续作为稳定面板验收目标。
6. `interior` 不作为第一阶段阻塞项。
7. 缺失 package script 不阻塞读档文档，但阻塞“正式 package 入口完整性”。

## 9. 下一步建议

1. 后端 authority 窗口确认 `tile_occupy` 最终合同字段和 package script。
2. world-cell / asset 窗口确认 `map_grid.gd` 与 manifest/assets 的最终归属。
3. 集成窗口新建隔离工作树，只搬运已确认包。
4. 集成工作树先跑 Godot mainline visual smoke，再接 tile_occupy 后端合同。
5. 最终把 `observe_tile_occupy` 做成正式 visual smoke 参数，而不是临时截图脚本。

## 10. 持续并行窗口的防漂移协议

隔离工作树不是“一次提取后永久正确”。如果其他窗口仍在继续开发，同一文件可能继续新增内容，旧提取包会过期。因此正式集成必须按“owner 最新交付包”反复刷新，而不是拿旧文件覆盖。

### 10.1 每个窗口必须交付 handoff package

每个 owner 窗口在交付给集成窗口前，必须给出：

1. `baseCommit`：开始改动时的 `git rev-parse HEAD`。
2. `headCommit` 或当前 diff 摘要：交付时的代码状态。
3. `ownedPaths`：自己真正负责的文件/目录白名单。
4. `changedPaths`：实际改动文件清单。
5. `validationCommands`：已跑过的正式命令和结果。
6. `doNotOverwrite`：明确不能被其他窗口整文件覆盖的热文件。
7. `handoffDoc`：交付说明文档或滚动状态文档路径。

没有 handoff package 的改动，不进入集成工作树。

### 10.2 集成窗口不直接提取旧文件

集成窗口禁止这样做：

```text
从某个旧时间点复制 map_grid.gd / main.gd / WorldService.ts 整文件到集成树。
```

正确做法：

1. 先读 owner 最新 handoff。
2. 对比 owner 的 `baseCommit..当前状态`。
3. 只搬运属于该 owner 的改动块。
4. 如果同一文件在多个窗口都改过，先拆成语义块，再手工融合。
5. 融合后跑该 owner 的正式验证。

### 10.3 每轮集成前做 drift check

每次集成开始前，必须在当前主工作树和隔离集成工作树分别记录：

```powershell
git rev-parse HEAD
git status --porcelain=v1
git diff --name-status
git diff --stat
```

然后按 owner 分组比较：

| owner | 必查文件 |
| --- | --- |
| mainline hub | `main.tscn`、`main.gd`、`main_city_hub_overlay.gd`、`run_mainline_visual_smoke.py` |
| world-cell/map | `map_grid.gd`、world-cell manifests、map assets |
| backend authority | `server/**`、`shared/**`、AI/world contract tests |
| UI panels | `godot-client/scenes/ui/**`、`godot-client/scripts/ui/**`，但不含 `main_city_hub_overlay.gd` |
| repo hygiene | `.obsidian/**`、迁移资产、系统路径噪声、孤立 `.uid` |

如果发现 owner 仍在改同一热文件，集成窗口只能做只读比较，不能提前覆盖。

### 10.4 对同一热文件使用三段式融合

热文件包括：

- `godot-client/scripts/app/main.gd`
- `godot-client/scripts/map/map_grid.gd`
- `server/src/application/world/WorldService.ts`
- `server/src/application/ai/aiPlayerProposalExecution.ts`
- `shared/domain/rules.ts`
- `shared/schemas/worldAction.ts`
- `shared/contracts/aiPlayer.ts`

三段式融合：

1. `ours`：集成工作树当前版本。
2. `theirs`：owner 最新交付版本。
3. `base`：owner 开工时的 base commit 版本。

只合入 `theirs` 相对 `base` 的有效语义改动；保留 `ours` 中其他窗口已集成的改动。不能用 `theirs` 整文件替换 `ours`。

### 10.5 防漏提清单

为避免“前一天提取了文件，后一天 owner 又新增内容没提取”，每次合并 owner 包后必须记录：

```text
owner:
baseCommit:
handoffAt:
integratedAt:
changedPaths:
skippedPaths:
reasonForSkip:
validation:
remainingDrift:
```

如果 `remainingDrift` 非空，不允许声称“该 owner 已全部集成”。只能说“已集成到某个 handoff 版本”。

### 10.6 推荐节奏

1. owner 窗口继续各自开发，不要求全部停工。
2. 集成窗口按固定节奏拉取 owner 最新 handoff，例如每天一次或每个关键 gate 后一次。
3. 每次只集成一个 owner 包，不同时集成后端、map、UI 三条线。
4. 集成顺序固定为：
   - backend authority 合同包
   - world-cell / map 渲染包
   - mainline hub / visual smoke 包
   - UI 面板小修包
5. 每包集成后立刻跑 owner gate，再跑一条主线 smoke。

### 10.7 出现冲突时的默认处理

| 冲突类型 | 默认处理 |
| --- | --- |
| 同一文件不同函数冲突 | 手工融合，保留两边语义，跑双方验证 |
| 同一函数不同语义冲突 | 停止，回 owner 确认；不猜 |
| package script 命名冲突 | 保留已有正式入口，新增入口需 owner 确认 |
| asset 删除与新增混杂 | 停止，交 asset owner 确认 manifest 与 `.import` 是否提交 |
| Godot 场景 uid/import 噪声 | 不纳入正式集成，除非 Godot owner 明确需要 |
| 后端合同字段缺失 | 不在 Godot 侧伪造字段，回 backend owner 补 contract |

### 10.8 最终合并前的冻结窗口

真正准备合并回主线前，需要一个短冻结窗口：

1. 暂停 owner 窗口继续改热文件。
2. 集成窗口记录最终 `git status`、`git diff --stat`、owner handoff 版本。
3. 跑完整 gate：
   - `npm run build`
   - `npx tsx server/tests/ai_player_http_tile_occupy_contract.test.ts`
   - `npm run gate:ai:preflight`
   - `npm run godot:headless:smoke -- --quit-after 3`
   - `npm run godot:mainline:visual-smoke -- --display-mode world --timeout-sec 90`
   - `npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id alliance --timeout-sec 90`
4. 只有 gate 通过后，才允许提交集成工作树。

### 10.9 一句话规则

隔离工作树只解决“不要互相踩文件”；它不自动解决“别人后来又改了”。后来又改的内容必须通过 owner handoff、drift check、三段式融合和正式验证再次进入集成树。
