# 世界资源地生成 authority / 运维交接（2026-04-22）

## 0. 补充口径（2026-04-23）

- 本文档只负责“资源生成 authority 在后端”的口径。
- 世界地图对象在 Godot 运行态如何进入统一 world cell contract，应以 `docs/WORLD_CELL_LAYERED_BASE_BINDING_EXECUTION_PLAN_2026_04_23.md` 为准。
- `方案 A = 直接往格子上叠建筑 PNG / 沿用 resource overlay 链做非资源节点显示` 不再作为正式客户端方案；客户端仍然禁止自行生成资源分布。

## 1. 结论

- 世界资源地生成已经从“代码内固定规则”升级为“后端 authority 生成 + world state 持久化 + 可由服务器启动配置覆盖”。
- 生成核心仍在后端/共享 domain，不在 Godot、不在 UI、不在客户端随机。
- 新建世界时使用 `worldSeed + generationVersion + resourceTileDensityPermille + levelWeightTable + kindWeightTable` 确定性生成资源地。
- 已有持久化世界优先使用存档里的 `map.resourceGeneration`，不会因为改环境变量而重洗资源地。
- 旧存档如果缺 `resourceGeneration` 或资源 tile 缺 `resourceKind/resourceLevel`，启动时会按确定性规则补齐并安排持久化。
- Godot / UI 只读 `/api/world/map-layout` 或 `/api/world` 返回的 `resourceKind/resourceLevel/resourceGeneration`，禁止客户端重新生成资源分布。

## 2. 当前代码事实

核心文件：

- `shared/domain/worldResourceGeneration.ts`
  - 默认策略：`DEFAULT_WORLD_RESOURCE_GENERATION_POLICY`
  - 资源 tile 是否生成：`shouldGenerateWorldResourceTile`
  - 等级生成：`resolveGeneratedWorldResourceLevel`
  - 类型生成：`resolveGeneratedWorldResourceKind`
  - 元数据汇总：`buildWorldResourceGenerationSummary`
  - 旧存档补齐：`normalizeGeneratedWorldResourceTiles`
  - metadata 标准化：`normalizeWorldResourceGenerationMetadata`
- `shared/domain/scenario.ts`
  - `createInitialWorldState({ resourceGenerationPolicy })`
  - 新世界创建时按传入 policy 生成 resource tile。
- `server/src/application/world/WorldService.ts`
  - 启动时从环境变量解析 `WORLD_RESOURCE_GENERATION_POLICY`。
  - 初始世界、测试 reset、fixture 世界都走同一 policy。
  - 加载旧存档时补齐资源地 metadata。
  - `resourceGeneration` 变化会触发 map layout 重建。
- `shared/contracts/game/world.ts`
  - `WorldState.map.resourceGeneration`
  - `WorldMapLayout.resourceGeneration`
  - `WorldSummary.map.resourceGeneration`
- `server/tests/world_resource_generation_contract.test.ts`
  - 覆盖默认生成、旧存档补齐、自定义 seed/version/权重表、HTTP 读回。
- `docs/WORLD_RESOURCE_NEW_SEASON_RESEED_DESIGN_2026_04_22.md`
  - 定义新赛季 / 新服资源重洗流程。
  - 明确新的持久化世界是资源重洗的最小安全单位。
- `docs/WORLD_RESOURCE_SEASON_CUTOVER_OPS_2026_04_22.md`
  - 定义正式赛季切换 ops：预检、旧 persist 指纹、停写确认、创建新 persist、JSON / Markdown 报告、人工确认。
- `docs/WORLD_RESOURCE_SEASON_CONFIG_SWITCH_2026_04_22.md`
  - 定义 cutover 报告通过后如何切换部署环境变量和赛季持久化路径。
- `docs/WORLD_RESOURCE_DEV_PERSIST_RESET_2026_04_22.md`
  - 定义本地开发 world snapshot 重置流程。
  - 明确该命令只适用于仓库 `tmp/` 下的开发持久化文件。

## 3. 默认策略

默认 seed/version：

```text
worldSeed = initial_world_v1_resource_seed_2026_04
generationVersion = world_resource_generation_v1
resourceTileDensityPermille = 480
```

默认等级权重：

```text
L01 360
L02 250
L03 170
L04 110
L05 60
L06 30
L07 12
L08 6
L09 2
```

默认资源类型权重：

```text
food 250
wood 250
stone 250
iron 250
```

类型权重会再叠加地形偏置：

- `forest` 偏向 `wood`
- `mountain/highland` 偏向 `stone/iron`
- `grassland/riverland` 偏向 `food`

## 4. 运维环境变量

这些变量只影响“新建世界”。已有持久化世界已经有自己的 `map.resourceGeneration`，不会被环境变量覆盖。

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `WORLD_RESOURCE_SEED` | 世界资源生成 seed | `initial_world_v1_resource_seed_2026_04` |
| `WORLD_RESOURCE_GENERATION_VERSION` | 生成规则版本 | `world_resource_generation_v1` |
| `WORLD_RESOURCE_TILE_DENSITY_PERMILLE` | 资源 tile 密度，1-1000 | `480` |
| `WORLD_RESOURCE_LEVEL_WEIGHT_TABLE` | L01-L09 等级权重 | 默认等级权重 |
| `WORLD_RESOURCE_KIND_WEIGHT_TABLE` | food/wood/stone/iron 类型权重 | 默认类型权重 |

权重表支持两种格式。

短格式：

```text
WORLD_RESOURCE_LEVEL_WEIGHT_TABLE=1:360,2:250,3:170,4:110,5:60,6:30,7:12,8:6,9:2
WORLD_RESOURCE_KIND_WEIGHT_TABLE=food:250,wood:250,stone:250,iron:250
```

JSON object 格式：

```json
{
  "1": 360,
  "2": 250,
  "3": 170,
  "4": 110,
  "5": 60,
  "6": 30,
  "7": 12,
  "8": 6,
  "9": 2
}
```

JSON array 格式：

```json
[
  { "level": 1, "weight": 360 },
  { "level": 2, "weight": 250 }
]
```

资源类型也支持 array：

```json
[
  { "kind": "food", "weight": 250 },
  { "kind": "wood", "weight": 250 },
  { "kind": "stone", "weight": 250 },
  { "kind": "iron", "weight": 250 }
]
```

无效值处理：

- 空 seed/version 回落默认值。
- density 非数字时回落默认值；有效范围 clamp 到 `1..1000`。
- 权重表解析失败、权重非正数、等级不在 `1..9`、类型不在 `food/wood/stone/iron` 时会过滤。
- 过滤后没有有效条目时回落默认表。

## 5. 持久化语义

新建世界：

1. `WorldService` 读取环境变量，得到 `WORLD_RESOURCE_GENERATION_POLICY`。
2. `createInitialWorldState({ resourceGenerationPolicy })` 生成 `map.tiles`。
3. 每个 resource tile 持久化 `resourceKind/resourceLevel`。
4. `map.resourceGeneration` 持久化 seed/version/权重表和实际统计。

加载已有世界：

1. 优先读取存档里的 `map.tiles` 和 `map.resourceGeneration`。
2. 如果 `map.resourceGeneration` 存在，metadata 里的 seed/version/权重表是该世界的权威记录。
3. 如果旧存档缺 metadata，使用当前服务器 policy 补齐 metadata。
4. 如果旧资源 tile 缺 `resourceKind/resourceLevel`，按该世界 metadata 或 fallback policy 补齐。
5. 补齐后会 schedule world persist，让旧存档升级到新结构。

重要限制：

- 不要在运营中的已有世界上直接改环境变量期待地图资源重洗。
- 如果确实需要重洗资源地图，应走明确的新世界/新赛季/迁移脚本流程，并记录新的 `generationVersion`。
- 不要只改 `WORLD_RESOURCE_SEED` 但沿用旧存档；旧存档不会自动洗牌，这是防止线上资源地漂移的保护。

## 6. HTTP 读取入口

地图静态布局入口：

```text
GET /api/world/map-layout?scope=bootstrap
GET /api/world/map-layout?scope=province&provinceId=...
GET /api/world/map-layout?scope=region&regionId=...
GET /api/world/map-layout?scope=full
```

`map.tiles[]` 中资源地字段：

```ts
{
  type: 'resource',
  resourceKind: 'food' | 'wood' | 'stone' | 'iron',
  resourceLevel: number
}
```

`map.resourceGeneration` 中元数据：

```ts
{
  worldSeed: string,
  generationVersion: string,
  resourceTileDensityPermille: number,
  levelWeightTable: Array<{ level: number, weight: number }>,
  kindWeightTable: Array<{ kind: ResourceKind, weight: number }>,
  generatedResourceTileCount: number,
  levelCounts: Record<string, number>,
  kindCounts: Record<ResourceKind, number>
}
```

世界摘要入口：

```text
GET /api/world?intelMode=full
```

摘要不会返回完整静态 tiles，但会返回 `world.map.resourceGeneration`，用于 UI 或调试面确认当前世界的生成版本。

## 7. AI 资源 authority 对齐

AI 资源地采集仍然消费持久化 tile 字段：

- `resourceKind`
- `resourceLevel`

正式行为：

- `gatherAiResourceTile` 要求 AI 单位驻扎在己方资源地。
- 收益为 `resourceLevel * 10`。
- 收益入账 `FactionState.aiResourceAccounts[aiPlayerId]`。
- 同一资源地通过 `FactionState.aiResourceGatherClaims[tileId]` 防重复采集。

这条链不读取环境变量，不重新计算资源等级，也不在 UI 本地结算。

## 8. Godot / UI 交接边界

Godot 世界地图：

- 只读 `/api/world/map-layout` 的 tile 数据。
- 用 `resourceKind/resourceLevel` 选择资源贴图。
- 不在 GDScript 里生成随机资源分布。
- 不把 `worldSeed/generationVersion/weightTable` 当作客户端生成输入；这些只用于展示、调试、审计。
- 资源地 authority 只由 `type='resource' + resourceKind + resourceLevel` 确认。
- 非 resource cell 的视觉兜底、A1-A5 主城/城池类 PNG、山脉/河流/关口/要塞/码头等地图对象，属于世界地图 cell 表现层或后续地图语义层，不得混用资源地生成规则。
- Godot 可以为了避免黑洞给非 resource cell 绘制临时资源 PNG 或主城/城池 PNG，但这不改变后端 tile 类型，也不代表客户端生成了资源地。
- 主城底盘/建筑组合如果由 SVG/React 组件导出，应保持 384x384 透明 PNG、`bottom_center` anchor 和 2:1 等距 footprint，再进入世界地图 cell 渲染链。
- 普通城池、关口、要塞、码头、山脉、河流都可以继续做世界地图 cell 视觉资产和 PNG 落格；当前文档只限制它们不要进入资源地生成 authority，不表示 Godot 视觉窗口不能做。
- 缺少现成素材的山脉、河流、码头等对象可以先通过提示词生成 384x384 透明 PNG，再按同一套 `bottom_center` anchor、tile 投影和 hover/selection 覆盖规则接入。

AI 玩家 UI：

- 资源地采集 UI 只展示后端 receipt。
- 资源输送 UI 只展示 proposal/receipt/inbox/policy。
- 不本地扣 AI 子账户资源。
- 不本地给 faction 加资源。

## 9. 正式验证入口

资源生成与持久化：

```text
npm run test:world:resource-generation-contract
```

AI 资源采集：

```text
npm run test:world:ai-resource-gather-http-contract
npm run test:ai:player-http-resource-gather-contract
```

AI 资源输送：

```text
npm run test:world:resource-transfer-http-contract
npm run test:world:governor-resource-inbox-http-contract
npm run test:ai:player-http-resource-transfer-contract
```

AI preflight：

```text
npm run gate:ai:preflight
```

资源地 authority 一体门禁：

```text
npm run gate:world:resource-authority
```

`gate:world:resource-authority` 已包含 `gate:world:season-cutover-prepare-dry-run` 和 `gate:world:new-season-reseed-dry-run`。cutover gate 会调用正式 ops 创建新 persist，并用临时后端回读；reseed dry-run 会使用临时新 persist path 启动干净后端，跑 `ops:world:resource-generation` 并验证 L01 > L05 > L09。

`gate:world:resource-authority` 串行覆盖：资源地生成持久化、AI 采集、AI 资源输送、总督 inbox、AI proposal 资源采集、AI proposal 资源输送。

只读运维检查：

```text
npm run ops:world:resource-generation
```

该命令只读取已启动后端的 `/api/world/map-layout?scope=full`，输出 `resourceGeneration`、等级统计、类型统计和字段完整性检查。检查完整地图时，后端需要用 `ENABLE_FULL_MAP_LAYOUT=1` 启动；如使用非默认端口，可通过 `WORLD_RESOURCE_INSPECT_URL` 或 `--url` 指定目标。命令还会检查等级统计是否明显违背 `levelWeightTable`，用于发现旧持久化世界仍停留在错误或过期分布上的情况。

正式赛季切换 ops：

```text
npm run ops:world:season-cutover:precheck
npm run ops:world:season-cutover:create-persist
npm run ops:world:season-config:verify
npm run gate:world:season-cutover-prepare-dry-run
npm run gate:world:season-config-verify-dry-run
```

该命令组用于创建新赛季 persist、生成报告、人工确认和切换后只读确认。它不切换线上流量，不覆盖旧世界。

create-persist 模式必须带 `--confirm-old-world-write-stopped`，否则不会创建新 persist。

`ops:world:season-config:verify` 会读取 cutover 报告和 `/api/health`，确认运行后端的 `persistence.worldState.path` 确实等于报告里的新 persist，并在完整地图开启时继续校验资源地生成统计。`gate:world:season-config-verify-dry-run` 会用临时后端复现这条链路。

切换后的部署配置不要只切 `WORLD_STATE_PERSIST_PATH`，还要隔离 `NARRATIVE_PERSIST_PATH`、`WORLD_SAVE_SLOTS_PATH`、`SESSION_STATE_PERSIST_PATH`。详细 checklist 见 `docs/WORLD_RESOURCE_SEASON_CONFIG_SWITCH_2026_04_22.md`。

开发态本地 persist 重置：

```text
npm run dev:world:persist:reset:dry-run
npm run dev:world:persist:reset
```

该命令只用于本地开发，默认只允许处理仓库 `tmp/` 下的 world snapshot，并会先备份再删除。不要用于线上旧世界迁移。

## 10. 当前已知风险

- `npm run test:ai:player-http-contract` 聚合长链在连续启动/停止多个测试后端时有过 `ECONNRESET`/health wait 不稳定；对应单项 shard 串行重跑通过。
- 环境变量配置是启动期读取，不是运行时热更新。
- density、权重表是运营级配置，正式服变更前应先在新 world persist root 下验证 map-layout 统计。
- 后续如果引入多服务器/多赛季，需要把 `worldSeed/generationVersion` 写入赛季配置或世界配置管理，而不是只靠进程环境变量。
- 当前窗口已处理/不处理/转交其他窗口的风险清单，见 `WORLD_RESOURCE_CUTOVER_RISK_TRIAGE_AND_WINDOW_SPLIT_2026_04_22.md`。

## 11. 下一步建议

1. 正式服/测试服 seed 命名规范已收敛到 `WORLD_RESOURCE_NEW_SEASON_RESEED_DESIGN_2026_04_22.md`。
2. 只读运维检查命令已收敛到 `npm run ops:world:resource-generation`。
3. Godot 视觉窗口接入资源地时，只消费后端持久化结果，不再讨论客户端随机。
4. 如果未来必须迁移旧世界，按新赛季重洗设计里的 backup / dry-run / rollback 约束单独设计，不要在现有存档上隐式重洗。
