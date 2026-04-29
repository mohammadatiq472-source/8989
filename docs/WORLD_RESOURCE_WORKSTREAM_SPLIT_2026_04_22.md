# 世界资源地接入任务拆分与窗口边界（2026-04-22）

## 0. 补充口径（2026-04-23）

- 世界地图对象当前正式执行路线改为 `方案 B = 底盘固定 + 建筑绑定 + 扩建后资源格转建筑格`。
- 对应正式计划文档：`docs/WORLD_CELL_LAYERED_BASE_BINDING_EXECUTION_PLAN_2026_04_23.md`
- `方案 A = 直接往格子上叠建筑 PNG / 沿用 resource overlay 链做非资源节点显示` 现在只保留为历史验证路线，不再作为后续窗口的正式主线。

## 1. 目的

这份文档用于把“世界资源地接入”拆成可并行窗口，降低上下文污染。

当前主线不是继续扩大 UI 域，也不是重做 AI 玩家系统，而是把世界地图 tile/cell 作为 SLG 操作单位正式接入；资源地是第一批落地对象，A1-A5 主城/城池类地图占位现在允许进入同一条地图 cell 视觉链路：

- 后端负责资源地生成、持久化、authority 和可审计配置。
- Godot 视觉窗口负责资源地与 A1-A5 主城/城池类 PNG 落格、tile 投影、hover/selection 覆盖关系。
- AI/UI authority 窗口只消费后端 proposal、receipt、inbox、quota，不做本地结算。

## 2. 已读取依据

- `C:\Users\26739\Desktop\8989\AGENTS.md`
- `C:\Users\26739\Desktop\8989\docs\AGENTS_EXECUTION_CURRENT_2026_04.md`
- `C:\Users\26739\Desktop\8989\CODEX.md`
- `C:\Users\26739\Desktop\8989\docs\AI_PLAYER_RESOURCE_TRANSFER_AUTHORITY_HANDOFF_2026_04_21.md`
- `C:\Users\26739\Desktop\8989\docs\WORLD_RESOURCE_GENERATION_AUTHORITY_HANDOFF_2026_04_22.md`
- `C:\Users\26739\Desktop\8989\docs\WORLD_RESOURCE_NEW_SEASON_RESEED_DESIGN_2026_04_22.md`
- `C:\Users\26739\Desktop\8989\docs\WORLD_RESOURCE_SEASON_CUTOVER_OPS_2026_04_22.md`
- `C:\Users\26739\Desktop\8989\docs\WORLD_RESOURCE_SEASON_CONFIG_SWITCH_2026_04_22.md`
- `C:\Users\26739\Desktop\8989\docs\WORLD_RESOURCE_DEV_PERSIST_RESET_2026_04_22.md`
- `C:\Users\26739\Desktop\8989_资产执行拆单版.md`

## 3. 当前代码事实

后端资源地生成与持久化已经有落地入口：

- `shared/domain/worldResourceGeneration.ts`
  - 定义 `worldSeed`
  - 定义 `generationVersion`
  - 定义 `resourceTileDensityPermille`
  - 定义 `levelWeightTable`
  - 定义 `kindWeightTable`
  - 提供确定性 tile 生成、等级、类型、metadata normalize。
- `shared/domain/scenario.ts`
  - `createInitialWorldState({ resourceGenerationPolicy })`
  - 新世界生成时写入 tile `resourceKind/resourceLevel`
  - 写入 `map.resourceGeneration`
- `server/src/application/world/WorldService.ts`
  - 启动期读取 `WORLD_RESOURCE_*` 环境变量
  - 旧存档缺字段时补齐并安排持久化
  - `/api/world`、`/api/world/map-layout` 输出资源地字段和 generation metadata
- `server/tests/world_resource_generation_contract.test.ts`
  - 验证确定性生成
  - 验证 env override
  - 验证旧存档补齐
- `server/src/ops/prepareWorldSeasonCutover.ts`
  - 正式赛季切换预检
  - 旧 persist 指纹与旧世界停写确认
  - 创建新赛季 persist
  - 生成 JSON / Markdown 报告并要求人工确认
- `server/src/evals/runWorldSeasonCutoverPrepareGate.ts`
  - gate 验证正式 cutover ops 能创建新 persist 并由后端回读

AI 资源 authority 已有独立 handoff：

- AI 采集资源地只消费后端持久化的 `resourceKind/resourceLevel`
- `gatherAiResourceTile` 收益为 `resourceLevel * 10`
- AI 资源输送只走后端 proposal / WorldService / receipt
- UI 不本地扣 AI 子账户资源
- UI 不本地给 faction 增加 `food/wood/stone/iron`

## 4. 三窗口拆分

### A. 后端规则与持久化窗口

适合由当前窗口继续负责。

职责：

- 维护 `world_seed / generation_version / level_weight_table / kind_weight_table`
- 确认资源地生成只在后端/共享 domain 完成
- 确认旧世界补齐字段后持久化
- 确认 `/api/world/map-layout` 输出 Godot 所需字段
- 维护 AI 采集、资源输送和总督 inbox 的 authority 口径
- 写 handoff、运维说明、验证入口和风险说明

允许修改范围：

- `shared/domain/worldResourceGeneration.ts`
- `shared/domain/scenario.ts`
- `shared/contracts/**` 中资源地字段相关合同
- `server/src/application/world/WorldService.ts`
- `server/tests/*resource*`
- `server/tests/*ai*resource*`
- `docs/*RESOURCE*HANDOFF*.md`
- 本文档

正式验证入口：

```text
npm run build
npm run test:world:resource-generation-contract
npm run test:world:ai-resource-gather-http-contract
npm run test:world:resource-transfer-http-contract
npm run test:world:governor-resource-inbox-http-contract
npm run test:ai:player-http-resource-gather-contract
npm run test:ai:player-http-resource-transfer-contract
npm run gate:ai:preflight
npm run gate:world:resource-authority
npm run ops:world:resource-generation
npm run ops:world:season-cutover:precheck
npm run ops:world:season-cutover:create-persist
npm run gate:world:season-cutover-prepare-dry-run
npm run dev:world:persist:reset:dry-run
```

下一步可做：

- 使用 `npm run ops:world:resource-generation` 做只读运维检查，输出当前世界 `resourceGeneration`、类型统计、等级统计。
- 使用 `npm run ops:world:season-cutover:precheck` 和 `npm run ops:world:season-cutover:create-persist` 做正式赛季切换准备，生成新 persist 与 JSON / Markdown 报告；create 模式必须确认旧世界已停写，等待人工确认后再切部署配置。
- 按 `docs/WORLD_RESOURCE_SEASON_CONFIG_SWITCH_2026_04_22.md` 切换 `WORLD_STATE_PERSIST_PATH`、`NARRATIVE_PERSIST_PATH`、`WORLD_SAVE_SLOTS_PATH`、`SESSION_STATE_PERSIST_PATH`，避免只切世界文件导致跨赛季状态串用。
- 使用 `npm run gate:world:resource-authority` 做资源地 authority 一体门禁，包含正式 cutover ops、 新赛季 / 新服临时 persist path 演练，并串行覆盖生成、采集、输送、inbox、AI proposal。
- 使用 `npm run dev:world:persist:reset:dry-run` 和 `npm run dev:world:persist:reset` 做本地开发 world snapshot 重置；该命令只允许处理仓库 `tmp/` 下的开发持久化文件。
- 新赛季/新服重洗资源地的显式流程已写入 `docs/WORLD_RESOURCE_NEW_SEASON_RESEED_DESIGN_2026_04_22.md`，不在旧存档上隐式重洗。
- 把多服务器的 `worldSeed/generationVersion` 从单纯 env 逐步收敛到赛季配置或世界配置。

### B. Godot 世界地图 cell 视觉窗口

适合单独开窗口继续做，不建议由当前窗口继续深做像素级细调。

职责：

- 只围绕世界地图 tile/cell 的基础显示、投影、PNG 落格和 hover/selection 覆盖关系。
- 当前允许吸收 `8989_资产执行拆单版.md` 的：
  - A1 主城底盘 / 主城建筑组合
  - A2 普通城池
  - A3 关口
  - A4 要塞
  - A5 码头
  - A6 资源地节点
  - B1 地块选中高亮件
  - B2 节点选中框
- 确认 384x384 PNG 的 `bottom_center` 锚点。
- 确认 320x160 source footprint 到 200x100 TMX tile 的缩放关系。
- 确认资源地严格贴合一个菱形 tile/cell。
- 确认资源地不额外生成底盘、不叠旧世界地图贴图、不跨格。
- 确认 hover、selection、行军阅读不被资源贴图破坏。

底层 cell 语义：

- 世界地图 tile/cell 是 SLG 操作单位、移动单位、占领单位、交互选择单位。
- “空白 / free cell”不是最终玩法语义；它只是当前地图数据或资产尚未覆盖时的临时表现状态。
- 正式 cell 可以被资源地、主城底盘/建筑组合、普通城池、关口、要塞、码头、山脉、河流等地图对象占用。
- 普通城池、关口、要塞、码头、山脉、河流等对象都属于后续可做的世界地图 cell 对象；缺资产时先通过提示词生成或从现有组件导出，不视为本窗口禁止项。
- 山脉、河流、州界、关口等对象可以成为移动阻隔、州/区域分界或战略通道；Godot 可以先做视觉落格和覆盖层验证，正式阻隔/通行/归属语义再由后端 / 共享地图数据确认。
- Godot 可以为非 resource cell 使用资源 PNG 做临时视觉兜底以避免黑洞，但这只是显示层兜底，不得写回或暗示该 cell 是后端资源地。
- A1-A5 如果来自 SVG/React 组件，应先导出为 384x384 透明 PNG，并保持 `bottom_center` / footprint 语义，再接入 Godot 世界地图 cell 渲染链。
- 主城/城池组合应走“底盘固定 + 建筑绑定 + 扩建转格”的正式 world cell contract，而不是继续沿用叠建筑 PNG 的历史验证链；同时必须有明确的 cell anchor、层级顺序、选中框关系和遮挡规则，不能混用 `resourceKind/resourceLevel`。

已确认的 A1-A5 / 主城建筑 SVG/React 资产源：

- `C:\Users\26739\Desktop\8989\Academy.tsx`
- `C:\Users\26739\Desktop\8989\Armory.tsx`
- `C:\Users\26739\Desktop\8989\Barracks.tsx`
- `C:\Users\26739\Desktop\8989\CityGate.tsx`
- `C:\Users\26739\Desktop\8989\CityLordMansion.tsx`
- `C:\Users\26739\Desktop\8989\CityWallSegment.tsx`
- `C:\Users\26739\Desktop\8989\ConstructionPlot.tsx`
- `C:\Users\26739\Desktop\8989\CornerWatchtower.tsx`
- `C:\Users\26739\Desktop\8989\DrillGround.tsx`
- `C:\Users\26739\Desktop\8989\Granary.tsx`
- `C:\Users\26739\Desktop\8989\Infirmary.tsx`
- `C:\Users\26739\Desktop\8989\Market.tsx`
- `C:\Users\26739\Desktop\8989\RecruitHall.tsx`
- `C:\Users\26739\Desktop\8989\Residence.tsx`
- `C:\Users\26739\Desktop\8989\Stable.tsx`
- `C:\Users\26739\Desktop\8989\Warehouse.tsx`
- `C:\Users\26739\Desktop\8989\Workshop.tsx`
- `C:\Users\26739\Desktop\8989\MainCityFoundation.tsx`
- `C:\Users\26739\Desktop\8989\MainCityPlaceholder.tsx`

其中 Academy、Armory、Barracks、CityGate、CityLordMansion、CityWallSegment、ConstructionPlot、CornerWatchtower、DrillGround、Granary、Infirmary、Market、RecruitHall、Residence、Stable、Warehouse、Workshop 已确认具备 384 canvas、240 footprint、`viewBox` 和 `bottom-center footprint center` anchor 语义；它们可以作为 PNG 导出源，而不是 Web 原型交付目标。MainCityFoundation、MainCityPlaceholder 更像整屏临时构图参考，需要先拆成地图 cell 级组件后再导出。

允许修改范围：

- `godot-client/scripts/map/map_grid.gd`
- `godot-client/assets/themes/slgclient/current/world/resources/**`
- `godot-client/assets/themes/slgclient/current/world/*.png`
- `godot-client/assets/themes/slgclient/current/world/resources/world_resource_assets_manifest_v1.json`
- `godot-client/assets/themes/slgclient/manifests/overlay_frames_manifest.json`
- `godot-client/assets/themes/slgclient/current/world/map.tmx`
- A1-A5 资产导出工具或 manifest，但仅限世界地图 cell 视觉接入所需范围
- 必要时只读或最小改动 `godot-client/scenes/app/main.tscn`
- 必要时只读或最小改动 `godot-client/scripts/app/main.gd`

明确禁止：

- 不改 `server/src/**`
- 不改 `shared/**`
- 不做 AI 玩家系统
- 不做 Web 原型
- 不做编辑器插件
- 不扩回 `native_slg_shell` 主壳样式
- 不做国战/事件/活动页模板
- 不做 A1-A5 的后端占领、迁城、城池功能、港口功能、关口通行规则或系统城池玩法结算
- 不做 E 多兵种地图部队扩展
- 不做 F 战斗演出增强

正式验证入口：

```text
npm run godot:headless:smoke -- --scene res://scenes/app/main.tscn
npm run godot:mainline:runtime -- --quit-after 1
npm run gate:godot:week1
npm run gate:godot:week1:compat:debug-only
```

`week1` 和 `compat` 必须串行跑，不能并行。

下一步可做：

- 继续校准资源地连片拼接，避免空白 cell 黑洞。
- 将 A1-A5 的 SVG/React 组件导出为 384x384 PNG，并建立世界地图 cell manifest。
- 在 Godot 中验证主城底盘/建筑组合与资源地共享同一套 tile 投影和 selection/hover 覆盖层。
- 截图必须能看到资源地、主城/城池类 cell 在同一套 tile 投影下连片拼接，且选中/hover 始终在上层。

### C. AI 玩家资源输送 / UI authority 窗口

适合独立窗口处理，不建议与 Godot 资源落格混做。

职责：

- 展示 AI 资源采集 receipt。
- 展示 AI 资源输送 proposal。
- 展示资源输送 receipt。
- 展示总督 inbox。
- 展示 `resourceTransfer` policy、quota、cooldown、blockedBy。
- 所有判定以后端返回的 receipt、failureCode、quota 字段为准。

允许读取入口：

- `GET /api/ai/players/:aiPlayerId`
- `GET /api/ai/players`
- `GET /api/world`
- `GET /api/world/map-layout`
- `POST /api/world/action`
- AI proposal approve/execute 相关路由

明确禁止：

- 不在 UI 本地扣 AI 子账户资源。
- 不在 UI 本地给 faction 增加 `food/wood/stone/iron`。
- 不把资源输送映射到真人“玉符 / 铜钱”钱包。
- 不绕过 AI proposal approve/execute 直接执行 world action。
- 不把 `claimGovernorResourceInbox`、`setAiResourceTransferPolicy` 包装成 AI 玩家原子动作。
- 不做跨势力贸易入口。

正式验证入口：

```text
npm run test:world:ai-resource-gather-http-contract
npm run test:world:resource-transfer-http-contract
npm run test:world:governor-resource-inbox-http-contract
npm run test:ai:player-http-resource-gather-contract
npm run test:ai:player-http-resource-transfer-contract
npm run gate:ai:preflight
```

## 5. 跨窗口交接合同

后端给 Godot：

```text
tile.id
tile.x
tile.y
tile.type
tile.terrain
tile.resourceKind
tile.resourceLevel
tile.city / tile.structure / tile.blocker（如后续后端字段存在）
map.resourceGeneration
```

字段语义：

- `resourceKind/resourceLevel` 只在 `tile.type == resource` 时作为资源地 authority。
- 主城、普通城池、关口、要塞、码头、山脉、河流等 cell 对象应走 `tile.type` 或后续明确的地图语义字段。
- Godot 可以先做 PNG 视觉落格和 manifest，但不能把非 resource cell 本地改写成资源地，也不能用 `resourceLevel` 表达城池或山脉强度。

Godot 给后端：

```text
无生成规则回写。
只通过选择 tile、操作 tile、移动单位等用户动作调用后端 authority。
```

后端给 AI/UI：

```text
resourceKind/resourceLevel
resourceTransfer.configuredPolicy
resourceTransfer.effectivePolicy
resourceTransfer.quota
resourceTransfer.remainingQuotaTotal
resourceTransfer.cooldownRemainingTicks
resourceTransfer.windowRemainingTicks
resourceTransfer.canTransferNow
resourceTransfer.blockedBy
receipt.worldAction
receipt.worldActionPayload
receipt.failureCode
receipt.execution
```

AI/UI 给后端：

```text
proposal / approve / execute 请求。
不直接写世界资源字段。
```

## 6. 当前建议排序

1. 当前窗口已补“只读运维检查入口”，让资源生成统计能被正式命令复现。
2. Godot 视觉窗口按 `docs/WORLD_CELL_LAYERED_BASE_BINDING_EXECUTION_PLAN_2026_04_23.md` 先做 contract 归一，再做 runtime builder 改造与运行态截图。
3. AI/UI authority 窗口只做资源输送展示和 receipt/inbox 消费，不接管结算。
4. 新赛季/新服重洗资源地单独设计，不混入 Godot 视觉窗口。

## 7. 当前风险

- 视觉窗口容易把资源地落格扩大成主壳 UI、事件页、国战页或 Web 原型。
- 后端窗口容易把资源生成扩大成 AI 行为策略，不应混做。
- 如果 Godot 客户端重新随机资源分布，多人联机世界会出现每个客户端看到不同资源地的灾难性问题。
- 如果运营中直接改 env 期待旧世界重洗，会和持久化保护语义冲突。
- 如果截图仍混入旧世界地图贴图或额外底盘，资源地落格验收无效。

风险处置和跨窗口分流的细化说明见 `WORLD_RESOURCE_CUTOVER_RISK_TRIAGE_AND_WINDOW_SPLIT_2026_04_22.md`。

## 8. 一句话口径

资源地的真相在后端持久化世界状态里；Godot 只负责把一个 tile/cell 画准，AI/UI 只负责消费后端 authority 的结果。
