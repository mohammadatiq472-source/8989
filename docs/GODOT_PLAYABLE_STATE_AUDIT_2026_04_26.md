# Godot 可玩状态盘点与推进计划（2026-04-26）

> 范围：`C:\Users\26739\Desktop\8989` 的 Godot + SLG 主线。本文先记录第一轮已验证事实，再承接第二轮全代码只读搜索后的增量结论。

## 0. 当前结论

当前客户端已经不是纯概念稿，也不是 Web 原型。它可以通过 Godot 主入口加载，能看到原生 SLG 主壳，能点进主要二级面板，并且部分面板已经接到 `WorldStore`、presenter、adapter 或后端 API。

但它还不能算完整 Playable Alpha。原因是：主城默认驻留页还不够产品化；部分面板仍依赖空态、fallback、本地派生 read model；战报、聊天、AI runtime、部队升级、主城动作等还没有全部形成稳定的真实闭环。

## 1. 已验证入口

- Godot 工程入口：`godot-client/project.godot`
- Godot 主场景：`res://scenes/app/main.tscn`
- 主脚本：`godot-client/scripts/app/main.gd`
- 主场景包含：
  - `MapGrid`
  - `UnitViewLayer`
  - `NativeShell`
  - `MainChatOverlay`
  - `FullScreenPanelHost`
  - `ObservabilityPanel`

## 2. 正式验证命令

已实际运行并通过：

```powershell
npm run godot:headless:smoke
```

结果摘要：

- Godot 版本：`4.6.2.stable`
- 主场景成功加载
- 输出 `[godot-bootstrap] start`
- 退出码 `0`
- 退出时仍有 ObjectDB/RID leak 警告，当前不阻断 smoke

可用正式入口：

```powershell
npm run godot:headless:smoke
npm run godot:mainline:runtime
npm run godot:editor
npm run gate:godot:week1
npm run godot:ui:preview:regress
npm run godot:ops:cli
```

`npm run godot:mainline:runtime` 会打开交互窗口，不是阻塞式测试命令。

## 3. 用户最少步骤看到当前游戏

只看当前客户端壳：

```powershell
cd C:\Users\26739\Desktop\8989
npm run godot:mainline:runtime
```

先做启动链验证：

```powershell
npm run godot:headless:smoke
```

希望看到更多真实数据时：

```powershell
npm run start
npm run godot:mainline:runtime
```

## 4. 当前 UI 地图（第一轮）

| 入口 | scene | script | presenter | 当前状态 |
|---|---|---|---|---|
| 主壳 | `godot-client/scenes/ui/native_slg_shell.tscn` | `godot-client/scripts/ui/native_slg_shell.gd` | `NativeShellPresenter` | 最完整的主壳 UI，可看到资源、主城入口、部队槽、底栏 |
| 内政 | `godot-client/scenes/ui/interior_panel.tscn` | `godot-client/scripts/ui/interior_panel.gd` | `InternalAffairsPresenter` | 真 Godot 面板，宿主型薄 scene，脚本生成内容 |
| 招募 | `godot-client/scenes/ui/recruit_panel.tscn` | `godot-client/scripts/ui/recruit_panel.gd` | `RecruitPresenter` | 真 Godot 面板，继承 `SlgSnapshotPanel`，以 snapshot 驱动 |
| 武将 | `godot-client/scenes/ui/general_panel.tscn` | `godot-client/scripts/ui/general_panel.gd` | `GeneralPresenter` | 真 Godot 面板，脚本生成较深，已有 roster/profile/tactics/growth |
| 同盟 | `godot-client/scenes/ui/alliance_panel.tscn` | `godot-client/scripts/ui/alliance_panel.gd` | `AlliancePresenter` | 真 Godot 面板，host + section strip + block factory |
| AI | `godot-client/scenes/ui/ai_panel.tscn` | `godot-client/scripts/ui/ai_panel.gd` | `AIPanelPresenter` | 真 Godot 面板，托管、议程、上下文、AI 玩家 runtime |
| 部队 | `godot-client/scenes/ui/troop_panel.tscn` | `godot-client/scripts/ui/troop_panel.gd` | `TroopPanelPresenter` | 真 Godot UI，含部队、设施、建筑树、升级单 |
| 战报 | `godot-client/scenes/ui/battle_report_panel.tscn` | `godot-client/scripts/ui/battle_report_panel.gd` | `BattleReportPresenter` | 结构较完整，含 list/detail 子页 |
| 聊天浮层 | `godot-client/scenes/ui/main_chat_overlay.tscn` | `godot-client/scripts/ui/main_chat_overlay.gd` | 无独立 presenter | 有真实 API 接入口，也有 fallback 内容 |
| 活动/帮助/背包/设置/国战 | 主壳按钮/旧 host fallback | `main.gd` fallback | 无 | 主要是入口或占位 |

## 5. 已经有真实 Godot UI 的部分

- `native_slg_shell`
- `battle_report_panel`、`battle_report_list_page`、`battle_report_detail_page`
- `troop_panel`
- `building_tree_view`
- `build_upgrade_sheet`
- `affairs_queue_view`
- `full_screen_panel_host`
- `panel_tab_strip`
- `slg_snapshot_section_page`
- `interior_panel`
- `alliance_panel`
- `recruit_panel`
- `general_panel`
- `ai_panel`
- `main_chat_overlay`

## 6. 仍偏骨架/占位的部分

- `activity`
- `help`
- `bag`
- `settings`
- `battle_report` 在 under-construction fallback 中仍有旧占位入口
- 战报无真实 records 时主要展示空态结构合同
- 主聊天浮层后端不可用时会显示 fallback 身份、频道、消息
- 部队升级单 secondary action 当前未形成有效交互链

## 7. 数据入口与后端/AI 接入缺口

已经看到的数据入口：

- `main.gd` 通过 `BackendApiClient` 拉 `get_runtime()`、`join_session()`、`get_world_summary()`、`advance_tick()`、`post_world_action()`
- `SlgDomainActionAdapter` 是 UI 动作到后端/API 的核心 adapter
- `SlgDomainStateAdapter` 包装 `WorldStore`
- 内政消费 faction、city clusters、resources、tech
- 部队消费 `world.units`、map/city 派生信息、AI player 名称
- 招募消费 `heroCommand`、`WorldStore.get_recruit_state`
- 武将消费 `heroCommand`、`world.units`、`WorldStore.get_general_state`
- 同盟消费 `world.alliance`、`feedback`、`history`、`executions`、`reports`
- AI 消费 `WorldStore.get_ai_state`、AI control/execution/receipt、AI resource accounts、governor inboxes
- 聊天浮层接 AI chat、proposal、unified inbox API

主要缺口：

- 内政/部队仍缺更细的后端 read model，部分 building/queue/facility 来自 Godot 本地派生
- 战报需要稳定真实列表/详情输入
- AI resource transfer 的 quota/cooldown/failureCode 必须继续以后端 runtime/receipt 为准
- AI chat fallback 需要避免误导为真实在线 AI
- 部队升级 secondary action 未接通
- 活动/帮助/背包/设置/国战仍是入口级占位

## 8. 第二轮全代码只读探查目标

第二轮需要补齐第一轮没有覆盖充分的内容：

1. 全仓文件清单与未读区域：确认哪些目录、数据文件、工具、测试、配置还没有纳入可玩度判断。
2. Godot runtime 层：`scripts/app`、`scripts/infra`、autoload、project settings、tools、ops CLI。
3. Godot UI 与资产数据层：scene、presenter、resource profile、JSON manifest、主题、fallback 文案。
4. 后端 API 与运行时层：只读 `server/src/**`，确认 Godot 已调用接口背后的真实实现边界。
5. shared 合同与测试层：只读 `shared/**`、`server/tests/**`、`package.json` scripts，确认正式合同和 gate 能支撑哪些 UI 闭环。
6. 文档与计划层：`docs/**` 里和可玩 Alpha、UI 主线、AI 接入、Godot 验证相关的事实是否过期或冲突。

## 9. 第一轮推荐推进顺序

1. 主城默认驻留页产品化。
2. 部队面板交互闭环。
3. 招募/武将正式动作深化。
4. AI 面板按后端 runtime/receipt/failureCode 收紧。
5. 战报/聊天真实数据与 fallback 边界收紧。

## 10. 第二轮增量结论

### 10.1 二轮总判断

第二轮全代码只读后，结论需要比第一轮更精确：

1. Godot 客户端主线可以启动，且不是空 UI。
2. Godot 调用的 server 主链大多有真实路由、service、shared schema、domain rules 和合同测试支撑。
3. 但“可启动”和“可玩闭环”必须拆开。`headless smoke` 只能证明 Godot 主场景和资源链能加载，不能证明 backend live runtime 已闭合。
4. 当前没有离线 playable fallback。backend 不在线时，`main.gd` 会在 `/api/session/runtime` 失败后进入 `runtime failed`，无法形成可玩闭环。
5. 当前最大缺口不是“有没有页面”，而是“页面看到的数据是否来自权威 read model、动作是否有 receipt/failureCode、fallback 是否会误导用户”。

### 10.2 第二轮新增覆盖面

第一轮偏重 `docs / scenes / ui scripts / presenters`。第二轮补读后，需要纳入可玩判断的范围增加为：

| 范围 | 结论 |
|---|---|
| `godot-client/autoload/**` | `AppConfig / SessionStore / WorldStore` 是运行时基础设施，不能漏掉 |
| `godot-client/scripts/infra/**` | `BackendApiClient` 和 `ObservabilityBridge` 是 Godot live 链关键 |
| `godot-client/tools/**` | `slg_ops_cli.py`、`run_week1_gate.py` 是正式验证/联通入口 |
| `godot-client/data/ui/**` | 武将 profile/skill preview 数据已支撑 UI，但不是后端权威数据 |
| `godot-client/data/ui_preview/**` | preview sandbox 数据，不应混入主线 runtime 判断 |
| `godot-client/assets/themes/slgclient/**` | 主壳、武将、战报、地图资源有大量素材支撑 |
| `shared/contracts/**` | session/world/AI/inbox/chat 合同已成形 |
| `shared/schemas/**` | `worldAction`、AI player、chat、inbox schema 覆盖主要动作链 |
| `shared/domain/rules.ts` | 关键 world action 的权威规则入口 |
| `server/src/routes/**` | Godot 调用的主要 API 均有真实路由 |
| `server/src/application/**` | WorldService、AI governance、UnifiedInbox 等是真 service |
| `server/tests/**` | 有一批合同测试证明后端链，但缺 Godot 字段级 contract |
| `tmp/**` | 证据与噪声混杂，需要单独治理 |
| 根目录 `*.tsx / *.png / *.mp4 / *.jpg` | 有资产原型与视觉证据，不属于当前 Godot runtime 主入口 |

本轮不再把 `godot-client/resources/` 当作现有入口：该目录当前不存在。

### 10.3 全仓规模补录

在排除 `.git / node_modules / .godot / .import / tmp / logs / .obsidian` 后，本轮只读统计到约 `3868` 个文件。

关键目录计数：

| 目录 | 文件数 |
|---|---:|
| `godot-client` | 3183 |
| `docs` | 192 |
| `server` | 157 |
| `portrait_assets` | 142 |
| `shared` | 54 |
| `world_resource_png_exports` | 43 |
| `scripts` | 23 |

关键代码/配置面：

| 范围 | 文件数 |
|---|---:|
| `godot-client/scripts` | 170 |
| `godot-client/scenes` | 55 |
| `godot-client/assets` | 2909 |
| `godot-client/tools` | 13 |
| `server/src` | 112 |
| `server/tests` | 40 |
| `shared` | 54 |

文档漂移风险：`docs/AGENTS_EXECUTION_CURRENT_2026_04.md` 的代码量快照仍写较早数字，已经不能当作当前全仓统计事实。

### 10.4 当前正式命令状态

| 命令 | 状态 | 说明 |
|---|---|---|
| `npm run godot:headless:smoke` | 通过 | 主场景加载，输出 `[godot-bootstrap] start` |
| `npm run godot:ops:cli -- health` | 失败 | backend 未启动，`127.0.0.1:8787` 拒绝连接 |
| `npm run build` | 通过 | TypeScript server/shared 构建通过；不验证 Godot GDScript |
| `npm run test:ai:player-http-playable-loop-contract` | 通过 | AI player playable loop 合同链通过 |
| `npm run lint` | 失败 | 2 个 lint error，见下 |

当前 `lint` 红灯：

- `server/tests/world_alliance_help_http_contract.test.ts:74`：`prefer-const`
- `server/tests/world_map_layout_strategic_nodes_contract.test.ts:17`：`@typescript-eslint/no-unused-vars`

轻量正式回归建议集合：

```powershell
npm run build
npm run test:ai:player-http-core-contract
npm run test:ai:player-http-domestic-contract
npm run test:ai:player-http-movement-contract
npm run test:ai:player-http-recruit-contract
npm run test:ai:player-http-playable-loop-contract
npm run test:world:alliance-help-http-contract
npm run test:world:reward-claim-http-contract
npm run test:world:unified-inbox-http-contract
```

重型命令不要默认跑：

- `gate:*`
- `eval:orchestrator:stress`
- `gate:scale:3000:*`
- `test:*:load`
- `test:runtime:combo-load`

### 10.5 Godot runtime/app/infra 结论

`project.godot` 注册的 autoload：

- `AppConfig`
- `SessionStore`
- `WorldStore`

`main.gd` 启动链：

1. 创建 `BackendApiClient`
2. 配置 `ObservabilityBridge`
3. 绑定主壳、面板、world store
4. 调 `_bootstrap_runtime_world()`
5. 请求 `/api/session/runtime`
6. 尝试 `join_session`
7. 拉 `/api/world?intelMode=sparse`
8. 拉 `/api/world/map-layout`
9. 刷新 shell 与 overlay
10. 启动 observability

关键判断：

- `WorldStore` 不是空壳，会同步 `world.slgDomainState` 到 troop/city/affairs/recruit/general/AI 本地读面。
- 但 `WorldStore` 也保留本地 `bootstrap_* / promote_* / enqueue_*` 能力，所以文档判断必须区分“后端权威回写”和“Godot 本地演示/派生”。
- `ObservabilityBridge` 消费 WS、events、runtime、civil-memory，并会把 runtime control context 回写到 Godot 侧 UI 状态。
- `slg_ops_cli.py` 可作为只读联通验证入口，但 `join/advance/world-action` 属于写状态控制面，不能混进只读审计。

### 10.6 Godot 调用到 server 的映射

| Godot 调用/能力 | server endpoint | route/service | 当前判断 |
|---|---|---|---|
| runtime | `GET /api/session/runtime` | `server/src/routes/session.ts` -> `SessionManager` | 有真实实现 |
| join | `POST /api/session/join` | `server/src/routes/session.ts` -> `SessionManager.joinSession` | 有真实实现 |
| world summary | `GET /api/world` | `server/src/routes/world.ts` -> `WorldService.getWorldSummary` | 有真实实现 |
| map layout | `GET /api/world/map-layout` | `server/src/routes/world.ts` -> `WorldService.getWorldMapLayout` | 有真实实现 |
| world action | `POST /api/world/action` | `server/src/routes/world.ts` -> `WorldService` + `shared/domain/rules.ts` | 有真实实现 |
| advance tick | `action=advanceTick` | `WorldService.advanceTick` | 有 mutation lock 与阶段统计 |
| AI player runtime | `/api/ai/players*` | `aiPlayerRuntimeRoutes.ts` + `AIPlayerGovernanceService` | 有真实实现 |
| AI proposals | `/api/ai/players/proposals*` | `aiPlayerProposalRoutes.ts` + proposal lifecycle | 有真实实现 |
| AI chat | `/api/ai/players/:id/chat/*` | `aiPlayerChatRoutes.ts` + chat command service | 有真实实现 |
| unified inbox | `/api/inbox*` | `inbox.ts` + `UnifiedInboxService` | 有真实实现 |
| observability runtime | `GET /api/observability/ai-runtime` | `observability.ts` | 有服务端读面 |

注意：Godot `BackendApiClient.get_runtime()` 当前直接对应 `/api/session/runtime`。`/api/observability/ai-runtime` 是另一个服务端 runtime/观测读面，不应混写。

### 10.7 UI 动作链合同矩阵

| UI 域 | Godot adapter 方法 | world/API action | 权威位置 | 测试/证据 |
|---|---|---|---|---|
| 内政建筑升级 | `request_city_building_upgrade` | `promoteCityBuilding` | `shared/domain/rules.ts` | `test:ai:player-http-domestic-contract` |
| 内政政务入队 | `request_affair_enqueue` | `enqueueAffair` | `shared/domain/rules.ts` | `test:ai:player-http-domestic-contract` |
| 部队设施升级 | `request_troop_facility_upgrade` | `promoteTroopFacilityBuilding` | `shared/domain/rules.ts` | `test:ai:player-http-command-support-contract` |
| 招募选池 | `request_select_recruit_pool` | `setRecruitSelectedPool` | `shared/domain/rules.ts` | `test:ai:player-http-recruit-contract` |
| 招募抽卡 | `request_recruit_draw` | `recruitProspectHero` | `shared/domain/rules.ts` | `test:ai:player-http-recruit-contract` |
| 武将焦点 | `request_focus_general_hero` | `setGeneralActiveHero` | `shared/domain/rules.ts` | `test:ai:player-http-command-support-contract` |
| 武将战法 | `request_set_general_tactic` | `setGeneralTactic` | `shared/domain/rules.ts` | `test:ai:player-http-command-support-contract` |
| 武将部署 | `request_deploy_general` | `deployReserveHero` | `shared/domain/rules.ts` | `test:ai:player-http-recruit-contract` |
| 同盟指令 | `request_alliance_directive_update` | `updateAllianceDirective` | `shared/domain/rules.ts` | `world_mutation_lock` 命中，缺 UI 专测 |
| AI 托管 | `request_ai_autonomy` | `/api/session/autonomy` | `server/src/routes/session.ts` | session/runtime 合同 |
| AI 议程预览 | `request_ai_agenda_preview` | `previewDomainAgenda` | `WorldService`/comm bus | AI runtime/observability 测试命中 |
| AI 上下文 | `request_ai_context_focus` | `setAiContextFocus` | `shared/domain/rules.ts` | AI knowledge/runtime prompt tests |
| AI 议程执行 | `request_ai_agenda_execution` | `queueAiAgendaAction` | `shared/domain/rules.ts` | `test:ai:player-http-command-support-contract` |
| AI 玩家刷新 | `request_ai_player_runtime_refresh` | `/api/ai/players*` | AI governance routes/service | AI player core/model tests |
| AI 提案创建/执行 | `request_ai_player_*proposal*` | proposal APIs | proposal lifecycle | playable loop contract |
| AI 资源 inbox 领取 | `request_ai_player_governor_inbox_claim` | `claimGovernorResourceInbox` | `shared/domain/rules.ts` | world inbox/resource tests |

缺口：

- 战报 `battle_report_read` 在 AI action catalog 中可见，但 v1 不可执行，不能当作战报闭环已完成。
- `troop_panel.gd` 的 upgrade secondary action 当前仍缺有效交互链。
- 目前没有“Godot adapter 字段级 contract test”，也就是没有专门测试 `main.gd / SlgDomainActionAdapter` 实际消费字段是否与 HTTP 合同完全一致。

### 10.8 资产与 UI 数据断层

资产/数据已接入的部分：

- 主壳：`.tres profile`、SVG shell icons、主壳按钮/部队槽 PNG、city grid profile。
- 武将：`generalpic/card_*.png`、骑兵帧、技能 SVG、`data/ui/general_profile_preview.json`、`general_skill_library_preview.json`。
- 战报：`battle_report.svg`、`close_badge.svg`、`back_badge.svg`、`mail_notice.svg`。
- 观测面板：`ui_theme_tokens.json` 指向 HUD 贴图。
- 地图资源链：headless 日志确认 `overlay frames loaded=51`、`world resource assets loaded=40`、`world cell assets loaded=29 composites=10`。

断层：

- 当前主壳运行时吃的是 `native_shell_city_grid_profile.tres`，不是 `assets/themes/slgclient/current/world/native_shell_main_city_layout_profile_v1.json`。
- `native_shell_main_city_layout_profile_v1.json` 暂时属于旁路资料，未看到运行时代码直接引用。
- 主城 world 资产已存在，但 `Academy / Market / RecruitHall / Infirmary` 等 `.tres` 槽位仍是空 `texture_path`，运行时继续显示 placeholder token。
- `interior / alliance / recruit / ai / troop / main_chat_overlay` 结构已成，但素材与权威数据没有全部接通。
- `ui_preview/stories/**` 是 sandbox/preview 数据，不是当前 Godot 主线 runtime 数据源。

### 10.9 本地推断与后端 read model 缺口

当前主要本地推断：

- 内政 building groups
- 内政 affairs queue
- 部队 facility tree
- 部队升级单部分展示状态
- 武将 profile/skill preview JSON
- 主聊天 fallback channels/messages
- 战报 empty-state preview contract

需要后端 read model 的缺口：

1. 内政：城市建筑组、政务队列、升级成本/收益、排队状态。
2. 部队：设施树、设施升级状态、部队设施成本/收益。
3. 战报：稳定的 list/detail 数据、搜索/filter、回放入口。
4. 聊天：后端不可用时显式离线状态，避免 fallback 像真实在线 AI。
5. Godot adapter 字段级合同：让 UI 消费字段和 HTTP 合同之间有自动验证。

### 10.10 文档与证据治理风险

已发现的漂移：

- `docs/AGENTS_EXECUTION_CURRENT_2026_04.md` 的代码量快照已过期。
- `CODEX.md` 的“当前实现顺序”更像历史落地顺序，不适合作为当前唯一路线图。
- `docs/P0_PLAYABLE_ALPHA_EXECUTION_PLAN.md` 仍偏 2026-03 后端/P0 计划，应降级为历史/并行后端计划，不应覆盖当前 Godot 原生主线。
- `tmp/**` 证据与噪声混杂，后续需要单独治理。

本轮只更新本文，不顺手改其他文档或 lint 红灯。

### 10.11 下一周推荐推进顺序（二轮修正）

1. **先修最小门禁红灯**：修掉当前 2 个 lint error，恢复基础 gate 可信度。
2. **补 live 只读联通证据**：backend 存活时跑 `godot:ops:cli -- health/runtime`，验证 `runtime -> world -> map-layout -> observability`，不跑写状态动作。
3. **主城默认驻留页产品化**：把 `.tres` 空 texture 槽接上已有主城资产，明确哪些建筑格位是真素材、哪些仍 placeholder。
4. **后端 read model 优先补内政/部队**：减少 Godot 本地派生 building/queue/facility。
5. **补 Godot adapter 字段级 contract test**：覆盖 UI 动作 -> worldAction -> receipt/failureCode。
6. **战报/聊天真实性边界**：战报 list/detail 真实输入，聊天 fallback 明确离线/示例状态。
7. **招募/武将/AI 深化**：围绕 receipt、failureCode、runtime read model 推进，避免继续扩大纯 fallback。
8. **tmp 证据治理**：区分正式证据、临时验证产物、可清理噪声。

### 10.12 下一轮可以直接开工的代码任务

不改玩法前提下，最适合的代码任务是：

1. `lint` 两处小修。
2. 给 `docs/AGENTS_EXECUTION_CURRENT_2026_04.md` 和 `CODEX.md` 加状态提示，标明统计/顺序为历史快照。
3. 补 `TMP_ARTIFACT_GOVERNANCE_2026_04_26.md`。
4. 接通 `native_shell_city_grid_profile.tres` 中已有主城资产槽位。
5. 为 `SlgDomainActionAdapter` 增加字段级静态/合同验证脚本或测试。
6. 补战报 list/detail read model 合同。
7. 补聊天 fallback 真实性约束。

## 11. 引擎连接复盘：为什么不像普通 Godot 项目一按运行就能边看边做

### 11.1 这次实际连接到的引擎状态

本轮已经实际连接 Godot 引擎，不是只看代码：

- `npm run godot:headless:smoke -- --dry-run` 能解析到 `C:\Godot_v4.6.2-stable_win64_console.exe`。
- `npm run godot:headless:smoke` 通过，Godot 4.6.2 能加载 `res://scenes/app/main.tscn`，并加载地图、overlay、world resource assets、world cell assets。
- `npm run godot:mainline:runtime -- --dry-run` 能解析到 `C:\Godot_v4.6.2-stable_win64.exe`。
- `npm run godot:mainline:runtime` 已打开 GUI runtime，窗口标题为 `SLG Commander Godot Client (DEBUG)`。
- backend 启动前，`npm run godot:ops:cli -- health` 失败，8787 无服务。
- 通过 `npm run server:dev` 启动 backend 后，`npm run godot:ops:cli -- health` 返回 200。
- `/api/session/runtime` 返回 200，当前有 `player` / `enemy` 两个 faction，`tick=3`，`worldVersion=6`。

所以结论不是“Godot 引擎连不上”。引擎能运行，backend 也能运行；真正的问题是项目没有形成一个稳定的一键可视化开发闭环。

### 11.2 和普通 Godot 项目的差异

很多 Godot 项目能做到“按运行就看到现在做成什么样”，通常是因为主场景的可见状态主要来自本地 scene、resource、autoload、mock data。编辑器按 Play 时，即使没有外部服务，也能直接进入一个本地可玩的状态。

当前项目的结构不同：

- Godot 不是完整单机游戏本体，而是 Node authoritative backend 的 native client。
- 主场景 `godot-client/scenes/app/main.tscn` 的脚本 `godot-client/scripts/app/main.gd` 启动后会先调用 `BackendApiClient.get_runtime()`。
- 如果 `/api/session/runtime` 不通，`main.gd` 会进入 `runtime failed`，后续 join/session、world refresh、map layout、panel presenter 数据链都不会完整展开。
- `npm run godot:mainline:runtime` 只负责打开 Godot，不负责先启动 backend。
- `npm run godot:headless:smoke` 只能证明主场景和资源能被 Godot 加载，不等价于“玩家可视化可玩”。

因此，别人“一边查看一边做”依赖的是本地预览闭环；我们现在缺的是“backend + Godot + dev seed + 可见状态”的一键闭环。

### 11.3 当前为什么会觉得“弄不出来”

这轮实测后，原因可以拆成四层：

1. **运行顺序不完整**：只跑 Godot 主线 runtime 时，如果 backend 没有先启动，主场景拿不到 runtime，UI 会停在失败/空态。
2. **入口命令分散**：`server:dev`、`godot:ops:cli -- health`、`godot:mainline:runtime` 是分开的，没有一个正式命令把它们串起来。
3. **headless 证据容易误导**：headless smoke 通过代表 Godot 能加载场景，不代表用户能点完整玩法。
4. **编辑器预览和真实 runtime 没有隔离好**：普通编辑器预览需要轻量 mock/read-only seed；真实 mainline runtime 需要 live backend。现在两者混在一个主入口里，失败时体验像“游戏没做出来”。

### 11.4 用户现在最少步骤看到当前游戏

当前可复现步骤是：

1. 在仓库根目录运行 `npm run server:dev`。
2. 新开一个终端运行 `npm run godot:ops:cli -- health`，确认返回 `ok=true`。
3. 运行 `npm run godot:mainline:runtime`。
4. Godot 窗口应打开为 `SLG Commander Godot Client (DEBUG)`。

如果只想确认引擎能加载主场景，可运行：

```powershell
npm run godot:headless:smoke
```

但这只能作为启动 smoke，不应当作为可玩度验收。

### 11.5 应该补的开发体验工程

下一阶段要让它接近普通 Godot 项目的“按运行就能看”，建议补这几件事：

1. 新增正式一键入口，例如 `npm run dev:godot:play`：检查 8787，未启动则启动 `server:dev`，等待 `/api/health`，再打开 `godot:mainline:runtime`。
2. 新增 Godot 侧启动前诊断 UI：backend 不通时，不只显示 `runtime failed`，而是明确显示“后端未启动、请运行哪个命令”。
3. 新增轻量 dev seed：不要每次依赖 40MB+ world snapshot 和 160MB+ save slot 文件才能看见 UI。
4. 将 editor preview 和 mainline runtime 分离：editor preview 可以走本地 mock/read-only snapshot，mainline runtime 必须走 backend。
5. 增加可视化 runtime 验收：正式命令应能证明主壳打开、runtime label 进入 ready、至少一个二级面板能打开并显示 live tick/worldVersion。

### 11.6 这对后续代码推进的含义

当前不是单纯“再补几个 UI 页面”就能变好。更关键的是先把运行链打通成产品化开发体验：

- 先做一键启动/健康检查/错误提示，让任何人能稳定打开当前版本。
- 再做最小可视化验收，避免只用 headless smoke 冒充可玩。
- 然后再推进内政、招募、武将、AI、部队、战报等面板的真实交互链。

换句话说，下一步最值得优先做的不是新玩法，而是“可运行、可看见、可复现”的 Godot 开发闭环。

## 12. 一键开发闭环落地记录（2026-04-26）

### 12.1 开工前复查结论

本轮按要求先开了两个只读审查 agent，避免重复实现已有能力：

1. **启动链审查**：仓库已有 `godot:mainline:runtime`、`launch_godot.py`、`godot:ops:cli -- health/runtime/bootstrap-chain`，但没有“启动 server -> 等 health -> 打开 Godot mainline runtime”的完整一键链。
2. **Godot 诊断审查**：`BackendApiClient.get_health()` 已存在，`ObservabilityPanel` 已存在，但主线 bootstrap 失败时只有 `runtime failed`，没有明确 backend 未启动分型，也没有复用 `get_health()` 展示诊断。

因此本轮不重做 Godot 启动器、不重做观测面板，只补最小编排层和最小诊断字段。

### 12.2 本轮新增入口

新增正式入口：

```powershell
npm run dev:godot:play
```

同时增加同义 Godot 命名入口：

```powershell
npm run godot:mainline:dev
```

入口行为：

1. 先检查 `SLG_BACKEND_URL`，默认 `http://127.0.0.1:8787/api/health`。
2. 如果 backend 已健康，直接复用 `scripts/launch_godot.py` 打开 `res://scenes/app/main.tscn`。
3. 如果 backend 不健康，自动启动 `npm run server:dev`，等待 health 成功后再打开 Godot。
4. `--dry-run` 可只打印判断链和 Godot 解析命令，不打开窗口。
5. `--no-start-backend` 可用于只允许复用已启动 backend 的严格验证。

涉及文件：

- `Start-Godot-Mainline-Dev.cmd`
- `scripts/launch_godot_mainline_dev.py`
- `package.json`

### 12.3 Godot 侧最小诊断补强

改动限定在主线 runtime 诊断，不新增玩法、不改地图：

- `godot-client/scripts/app/main.gd`
  - bootstrap 前记录 `checking /api/session/runtime`。
  - `/api/session/runtime` 失败时，自动再调用 `get_health()` 做一次诊断。
  - 如果 health 也失败，runtime label 进入 `backend unreachable; run npm run dev:godot:play, then press Ctrl+R`。
  - 如果 health 成功但 runtime 失败，提示 `runtime failed; backend health ok; check /api/session/runtime`。
  - bootstrap 失败后，`Ctrl+R` 和原刷新按钮会优先重试 bootstrap，而不是只刷新 world/map。

- `godot-client/scripts/ui/observability_panel.gd`
  - Runtime 区块增加 `backendHealth`、`runtimeBackendUrl`、`diagnostic` 摘要。
  - 复用已有观测面板，没有新增大 UI。

### 12.4 本轮验证结果

已通过：

```powershell
python -m py_compile scripts\launch_godot_mainline_dev.py
npm run dev:godot:play -- --dry-run
npm run godot:mainline:dev -- --dry-run
npm run dev:godot:play -- --backend-url http://127.0.0.1:9876 --dry-run
npm run dev:godot:play -- --godot-exe C:\Godot_v4.6.2-stable_win64_console.exe -- --quit-after 3
npm run godot:headless:smoke -- --quit-after 3
npm run godot:ops:cli -- health
```

验证结论：

- 新入口在 backend 已健康时会直接打开 Godot runtime 命令。
- 新入口在假端口 dry-run 下会进入“would run npm run server:dev”分支，证明自动起服分支可达。
- backend 不在 8787 监听时，实跑新入口可重新拉起 backend；随后 `godot:ops:cli -- health` 返回 200。
- Godot 主场景 headless 加载通过，没有出现 GDScript 解析失败。
- backend 当前 health 为 200，世界状态为 `tick=3`、`worldVersion=6`、`factionCount=2`。

### 12.5 仍未解决的问题

本轮只解决“能不能一键进入开发运行链”和“失败时能不能知道是 backend 未启动”。仍未解决：

1. 没有轻量 dev seed，当前仍依赖较大的 `tmp/world_snapshot.json` 和 `tmp/world_save_slots.json`。
2. 没有正式可视化截图 gate；headless 仍只能证明加载，不证明二级面板可玩。
3. editor preview 与 mainline runtime 的产品级分流还可以更清晰。
4. 内政、招募、武将、AI、部队、战报的真实交互链仍需后续逐项补齐。

### 12.6 下一步建议

下一步最该做的是：

1. 用 `npm run dev:godot:play` 作为默认人工打开入口。
2. 再补一个可视化 runtime 验收：确认窗口打开、runtime label ready、至少一个二级面板能打开。
3. 然后再进入轻量 dev seed，减少每次开发依赖大 snapshot 的成本。

## 13. Godot 主线可视化验收落地（2026-04-26）

### 13.1 新增正式命令

新增主线可视化 smoke：

```powershell
npm run godot:mainline:visual-smoke
```

命令目标：

1. 检查 backend `/api/health`。
2. 必要时启动 backend。
3. 打开真实 Godot GUI 主线 runtime。
4. 等待主场景进入 runtime ready。
5. 验证 runtime label 含 live `tick` 与 `worldVersion`。
6. 默认 `city` 模式自动打开一个二级面板；`--display-mode world` 则验证正式主线大地图可见。
7. 保存 Godot 内部 JSON report 与 viewport 截图到 `tmp/screenshots/mainline_visual_smoke_*`。

涉及文件：

- `godot-client/tools/run_mainline_visual_smoke.py`
- `godot-client/scripts/app/main.gd`
- `package.json`

### 13.2 当前通过证据

已运行：

```powershell
npm run godot:mainline:visual-smoke -- --timeout-sec 90 --panel-id alliance
```

结果：

- `ok=true`
- `windowReady=true`
- `runtimeReady=true`
- `runtimeLabelOk=true`
- `displayMode=city`
- `mapVisible=false`
- `tick=3`
- `worldVersion=6`
- `panelId=alliance`
- `panelOpenOk=true`
- screenshot 非空，尺寸 `1600x900`

证据目录：

```text
tmp/screenshots/mainline_visual_smoke_20260426_231343
```

关键文件：

- `tmp/screenshots/mainline_visual_smoke_20260426_231343/mainline_visual_smoke_summary.json`
- `tmp/screenshots/mainline_visual_smoke_20260426_231343/godot_visual_smoke_report.json`
- `tmp/screenshots/mainline_visual_smoke_20260426_231343/01_ready_secondary_panel.png`
- `tmp/screenshots/mainline_visual_smoke_20260426_231343/godot.log`

截图内容确认：左侧为同盟二级面板，右侧为 observability/runtime 区块；runtime 文案显示 `faction=player`、`tick=3`、`worldVersion=6`、`sessionMode=joined`。

### 13.3 正式主线大地图验收

已运行：

```powershell
npm run godot:mainline:visual-smoke -- --display-mode world --timeout-sec 90
```

结果：

- `ok=true`
- `displayMode=world`
- `displayModeOk=true`
- `mapVisible=true`
- `mapRequirementOk=true`
- `runtimeReady=true`
- `runtimeLabelOk=true`
- `tick=3`
- `worldVersion=6`
- `panelRequired=false`
- screenshot 非空，尺寸 `1600x900`

证据目录：

```text
tmp/screenshots/mainline_visual_smoke_20260426_231226
```

关键文件：

- `tmp/screenshots/mainline_visual_smoke_20260426_231226/mainline_visual_smoke_summary.json`
- `tmp/screenshots/mainline_visual_smoke_20260426_231226/godot_visual_smoke_report.json`
- `tmp/screenshots/mainline_visual_smoke_20260426_231226/01_ready_world_map.png`
- `tmp/screenshots/mainline_visual_smoke_20260426_231226/godot.log`

结论：正式 `main.tscn` 中的 `MapGrid` 没有丢，已经可以通过同一主线入口进入 `world` 模式并显示大地图。此前看起来像“完整地图主界面”的 `scenes/dev/stories/map_*` 仍应退出产品主线，后续只作为迁移参考或历史验证资产处理。

当前观感问题：正式 world 模式里左侧聊天层、底部主壳、右侧 observability 会遮挡地图；这是主线壳层布局收口问题，不是地图脚本丢失问题。

### 13.4 为什么默认验收面板选同盟

第一次以 `interior` 作为默认二级面板时失败，原因不是主线 runtime 不能 ready，而是内政面板当前会触发既有 UI 运行时错误：

- `BuildingTreeView._clear_item_buttons` 对 null 调 `get_children`
- `BuildingTreeView._rebuild_items` 对 null 调 `add_child`
- `BuildUpgradeSheet._refresh_view` 对 null 写 `text`

因此本轮视觉 smoke 默认用较稳定的 `alliance` 作为“至少一个二级面板能打开”的最小验收。内政面板错误应作为下一轮 UI 修复主线单独处理。

### 13.5 当前残余风险

`npm run godot:headless:smoke -- --quit-after 3` 最新复跑返回码为 0，没有复现此前看到的 `general_panel.gd:1270` 解析日志；当前仍有 Godot 退出时的对象泄漏 warning：

```text
WARNING: ObjectDB instances leaked at exit (run with --verbose for details).
```

这说明 headless smoke 仍不能替代可视化验收：它不会证明 runtime label 可见，也不会证明二级面板可打开。后续应把 Godot 日志中的 `SCRIPT ERROR` / `Parse Error` 纳入正式失败条件，同时保留 GUI visual smoke 作为可玩态验收。

### 13.6 下一步

下一步建议顺序：

1. 修内政面板 `BuildingTreeView` / `BuildUpgradeSheet` null 节点错误。
2. 将 `godot:mainline:visual-smoke` 的 `city` 与 `world` 两种模式纳入正式 Godot 主线验收。
3. 收口 world 模式遮挡层：聊天、observability、底部主壳在大地图态需要明确折叠/弱化规则。
4. 增加 `--panel-id recruit/troop/ai_hub` 多面板参数化 smoke，逐步扩大覆盖面。
5. 让 headless smoke 对 `SCRIPT ERROR` / `Parse Error` 进行日志级失败判定。

## 14. 主城 hub 并入正式 world 主线（2026-04-27）

### 14.1 本轮目标

把此前“第一项的默认组成 / 主城入口面板”并入正式 `main.tscn` 的 `world` 模式，而不是继续维护第三条 dev story 路线。当前实际主线收口为三条：

1. `city` 模式：默认进入城内壳层和二级面板。
2. `world` 模式：正式大地图 + 地图坐标上的主城 hub。
3. 二级面板：从城内壳层或主城 hub 统一打开同一批 Native SLG 面板。

### 14.2 已接入文件

- `godot-client/scripts/ui/main_city_hub_overlay.gd`
- `godot-client/scenes/app/main.tscn`
- `godot-client/scripts/app/main.gd`
- `godot-client/tools/run_mainline_visual_smoke.py`
- `tmp/automation_mainline_city_hub_prompt_2026_04_26.md`

未触碰：

- `server/**`
- `shared/**`
- `godot-client/scripts/map/map_grid.gd`
- dev story 地图实现

### 14.3 当前能看到什么

`world` 模式现在可以看到：

- 正式 `MapGrid` 大地图。
- 绑定到主城坐标的 `青石城` hub。
- hub 默认收起时显示主城名、主公队列、开发值、展开按钮。
- hub 展开后显示六个入口：`内政`、`招募`、`武将`、`同盟`、`AI`、`部队`。

主城定位来自现有 runtime 数据：

- `heroCommand.homeTileId=tile_08`
- `tileX=152`
- `tileY=159`
- `title=青石城`

### 14.4 当前能点什么

hub 展开后的入口会复用既有 `_open_overlay_panel()` 链路打开正式二级面板，不新增玩法逻辑。已用正式可视化 smoke 验证：

```powershell
npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id alliance --timeout-sec 90
```

结果：

- `ok=true`
- `displayMode=world`
- `worldAction=open_hub_panel`
- `mapVisible=true`
- `mainCityHub.visible=true`
- `mainCityHub.expanded=true`
- `mainCityHub.tileId=tile_08`
- `activePanelId=alliance`
- `panelOpenOk=true`
- `runtimeLabelOk=true`
- `tick=3`
- `worldVersion=6`

证据目录：

```text
tmp/screenshots/mainline_visual_smoke_20260427_000331
```

关键文件：

- `tmp/screenshots/mainline_visual_smoke_20260427_000331/mainline_visual_smoke_summary.json`
- `tmp/screenshots/mainline_visual_smoke_20260427_000331/godot_visual_smoke_report.json`
- `tmp/screenshots/mainline_visual_smoke_20260427_000331/01_ready_world_hub_panel.png`
- `tmp/screenshots/mainline_visual_smoke_20260427_000331/godot.log`

### 14.5 可视化分层证据

主城 hub 可见但不打开面板：

```powershell
npm run godot:mainline:visual-smoke -- --display-mode world --timeout-sec 90
```

证据目录：

```text
tmp/screenshots/mainline_visual_smoke_20260427_000118
```

主城 hub 展开但不打开面板：

```powershell
npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub --timeout-sec 90
```

证据目录：

```text
tmp/screenshots/mainline_visual_smoke_20260427_000155
```

默认 `city` 模式二级面板回归验证：

```powershell
npm run godot:mainline:visual-smoke -- --timeout-sec 90 --panel-id alliance
```

证据目录：

```text
tmp/screenshots/mainline_visual_smoke_20260427_000427
```

### 14.6 自动化提示词

为 8 小时、每 30 分钟一次的自动化巡检准备了稳定提示词：

```text
tmp/automation_mainline_city_hub_prompt_2026_04_26.md
```

提示词把最初目标、禁止范围、正式入口、证据写回位置和不得失忆的检查点都固定下来。自动化每轮应先读这个提示词，再读本盘点文档的第 14 节，避免因为多轮上下文过长而偏离主线。

### 14.7 当前缺口

1. 主城 hub 现在是最小可用视觉入口，还没有做成最终美术风格。
2. 左侧聊天层、右侧 observability、底部主壳在 `world` 模式仍会遮挡地图，后续需要折叠/弱化规则。
3. `interior` 面板仍有既有 null 节点错误，本轮继续用 `alliance` 作为稳定二级面板验收目标。
4. `recruit`、`generals`、`ai_hub`、`troop` 入口已经接到同一打开链路，但还需要逐个扩展正式 smoke 覆盖。
5. headless smoke 仍只能证明 Godot 可启动，不能替代 GUI 可视化验收。
