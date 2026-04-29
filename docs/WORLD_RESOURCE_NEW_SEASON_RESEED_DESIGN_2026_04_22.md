# 新赛季 / 新服世界资源地重洗设计（2026-04-22）

## 1. 结论

世界资源地重洗不能理解为“改环境变量后让旧世界自动重排”。

v1 正式口径是：

- 新赛季 / 新服 = 新的世界持久化身份 + 新的 `worldSeed` + 新的 `generationVersion`。
- 旧世界继续读取旧 `map.tiles` 与旧 `map.resourceGeneration`。
- 后端可以补齐旧世界缺失的 `resourceKind/resourceLevel/resourceGeneration`，但不能隐式替换已有资源分布。
- Godot 和 UI 只读后端返回的持久化结果，不参与重洗。

## 2. 目标

本设计解决：

- 每个服务器 / 赛季有不同但确定性的资源地分布。
- 资源地等级按权重低级多、高级少。
- 重启服务不会重新随机。
- 客户端不会各自生成不同资源地。
- 运维可以在开服前审计资源地统计。
- 回滚时可以明确切回旧世界，而不是半路混用。
- 正式赛季切换可以通过 ops 生成新 persist 与报告，再人工确认切换。

## 3. 非目标

本设计不做：

- 在线旧世界即时重洗。
- 对已有部队、占领、城市、AI 采集记录做自动迁移。
- Godot 客户端本地生成资源分布。
- UI 本地计算资源等级、产出或结算。
- 跨势力贸易、赛季玩法结算、排名发奖。

## 4. 输入参数

每个新服 / 新赛季至少要明确：

```text
serverId
seasonId
worldPersistPath
worldSeed
generationVersion
resourceTileDensityPermille
levelWeightTable
kindWeightTable
```

推荐命名：

```text
serverId = server_alpha
seasonId = season_001
worldSeed = server_alpha:season_001:world_resource:v1
generationVersion = world_resource_generation_season_001_v1
```

推荐默认权重：

```text
WORLD_RESOURCE_TILE_DENSITY_PERMILLE=480
WORLD_RESOURCE_LEVEL_WEIGHT_TABLE=1:360,2:250,3:170,4:110,5:60,6:30,7:12,8:6,9:2
WORLD_RESOURCE_KIND_WEIGHT_TABLE=food:250,wood:250,stone:250,iron:250
```

## 5. 新服流程

新服没有旧世界迁移问题，直接使用新的持久化路径启动。

流程：

1. 分配 `serverId` 与 `seasonId`。
2. 生成新的 `WORLD_STATE_PERSIST_PATH`，不要复用旧世界文件。
3. 设置资源生成环境变量。
4. 启动后端。
5. 用只读运维检查确认资源统计。
6. 通过资源 authority 门禁。
7. 关闭 `ENABLE_FULL_MAP_LAYOUT` 后再进入正式运行。

Windows PowerShell 示例：

```powershell
$env:WORLD_STATE_PERSIST_PATH="C:\Users\26739\Desktop\8989\data\worlds\server_alpha\season_001\world_snapshot.json"
$env:WORLD_RESOURCE_SEED="server_alpha:season_001:world_resource:v1"
$env:WORLD_RESOURCE_GENERATION_VERSION="world_resource_generation_season_001_v1"
$env:WORLD_RESOURCE_TILE_DENSITY_PERMILLE="480"
$env:WORLD_RESOURCE_LEVEL_WEIGHT_TABLE="1:360,2:250,3:170,4:110,5:60,6:30,7:12,8:6,9:2"
$env:WORLD_RESOURCE_KIND_WEIGHT_TABLE="food:250,wood:250,stone:250,iron:250"
$env:ENABLE_FULL_MAP_LAYOUT="1"
npm run start
```

另一个终端执行：

```powershell
npm run ops:world:resource-generation
npm run gate:world:resource-authority
```

验收通过后，正式服不建议继续打开 `ENABLE_FULL_MAP_LAYOUT`。

## 6. 新赛季流程

新赛季有旧世界归档问题，但 v1 仍然不对旧世界做在线重洗。

流程：

1. 停止旧赛季写入。
2. 归档旧赛季 `WORLD_STATE_PERSIST_PATH`。
3. 固化旧赛季的 `worldSeed/generationVersion` 和统计报告。
4. 为新赛季分配新的 `WORLD_STATE_PERSIST_PATH`。
5. 使用新的 `WORLD_RESOURCE_SEED` 与 `WORLD_RESOURCE_GENERATION_VERSION`。
6. 启动新赛季世界。
7. 运行 `npm run ops:world:resource-generation`。
8. 运行 `npm run gate:world:resource-authority`。
9. Godot 只重新读取新世界的 `/api/world/map-layout`，不做本地重洗。

新赛季与旧赛季的世界文件必须并存归档，不应覆盖。

正式 ops 入口见：

```text
docs/WORLD_RESOURCE_SEASON_CUTOVER_OPS_2026_04_22.md
docs/WORLD_RESOURCE_SEASON_CONFIG_SWITCH_2026_04_22.md
npm run ops:world:season-cutover:precheck
npm run ops:world:season-cutover:create-persist
npm run gate:world:season-cutover-prepare-dry-run
```

`create-persist` 必须显式确认旧世界已停写：`--confirm-old-world-write-stopped`。该确认是防止旧赛季还在写入时误判切换报告。

切换部署配置时，不能只切 `WORLD_STATE_PERSIST_PATH`；还要同步隔离 narrative、save slots、session persist 路径，防止跨赛季状态串用。

## 6.1 本地开发态重置

开发阶段如果只是想丢弃本地旧开发 world snapshot，让新 seed/version 重新生成，可以使用：

```text
npm run dev:world:persist:reset:dry-run
npm run dev:world:persist:reset
```

该命令只允许重置仓库 `tmp/` 下的开发世界文件，并会先备份再删除。详细说明见 `docs/WORLD_RESOURCE_DEV_PERSIST_RESET_2026_04_22.md`。

这不是线上旧世界迁移工具。

## 7. 禁止旧世界隐式重洗

禁止在旧 `WORLD_STATE_PERSIST_PATH` 上只改这些变量：

```text
WORLD_RESOURCE_SEED
WORLD_RESOURCE_GENERATION_VERSION
WORLD_RESOURCE_TILE_DENSITY_PERMILLE
WORLD_RESOURCE_LEVEL_WEIGHT_TABLE
WORLD_RESOURCE_KIND_WEIGHT_TABLE
```

原因：

- 旧世界的 tile 已经被持久化。
- 资源地可能已有占领状态、AI 采集记录、部队驻扎、路径规划、选择记录。
- 旧世界的 `map.resourceGeneration` 是审计凭据。
- 多人联机中，隐式重洗会让玩家看到的世界事实发生不可解释漂移。

当前代码只会补缺，不会替换已有 `resourceKind/resourceLevel`。

## 8. 如果未来必须迁移旧世界

这不是 v1 默认流程，必须单独做迁移设计。

最低要求：

- 迁移前备份旧 `WORLD_STATE_PERSIST_PATH`。
- 生成 `migrationId`。
- 输出 dry-run 报告。
- 明确是否清空 `aiResourceGatherClaims`。
- 明确占领资源地、驻扎单位、行军目标是否保留。
- 明确旧 tileId 是否稳定。
- 迁移后写入新的 `generationVersion`。
- 迁移后跑 `ops:world:resource-generation` 与 `gate:world:resource-authority`。
- 迁移失败必须能回滚到旧世界文件。

未完成这些前，不允许做旧世界在线重洗。

## 9. 运维检查标准

开服前必须至少确认：

- `map.resourceGeneration.worldSeed` 符合本服 / 本赛季命名。
- `map.resourceGeneration.generationVersion` 符合本赛季版本。
- `resourceTileCount` 等于 `generatedResourceTileCount`。
- `missingKindTileIds` 为空。
- `missingLevelTileIds` 为空。
- `invalidLevelTileIds` 为空。
- `levelWeightDistributionWarnings` 为空。
- L01 明显多于 L05，L05 明显多于 L09。

命令：

```text
npm run ops:world:resource-generation
```

## 10. 正式门禁

新服 / 新赛季资源 authority 至少跑：

```text
npm run build
npm run gate:world:new-season-reseed-dry-run
npm run gate:world:resource-authority
```

当前 `gate:world:resource-authority` 已经包含 `gate:world:new-season-reseed-dry-run`，单独列出是为了排障时可以先跑 dry-run。

`gate:world:new-season-reseed-dry-run` 会申请临时端口和临时 `WORLD_STATE_PERSIST_PATH`，启动一个干净后端，执行 `npm run ops:world:resource-generation`，并验证：

- 新世界使用本次 dry-run 的 `worldSeed/generationVersion`。
- `resourceTileCount` 等于 `generatedResourceTileCount`。
- L01 > L05 > L09 且 L09 存在。
- 资源地没有缺 `resourceKind/resourceLevel`。
- `levelWeightDistributionWarnings` 为空。

`gate:world:resource-authority` 串行覆盖：

- 资源地生成持久化。
- AI 资源地采集。
- AI 资源输送。
- 总督 inbox 领取。
- AI proposal 资源采集。
- AI proposal 资源输送。

Godot 视觉另走：

```text
npm run godot:headless:smoke -- --scene res://scenes/app/main.tscn
npm run godot:mainline:runtime -- --quit-after 1
npm run gate:godot:week1
npm run gate:godot:week1:compat:debug-only
```

`week1` 和 `compat` 必须串行。

## 11. 回滚流程

如果新赛季资源检查失败：

1. 停止新赛季后端。
2. 保留失败的 `WORLD_STATE_PERSIST_PATH` 作为排障材料。
3. 切回旧赛季的 `WORLD_STATE_PERSIST_PATH` 和旧资源生成环境变量。
4. 启动旧赛季后端。
5. 运行旧赛季的 `ops:world:resource-generation` 只读检查。

禁止把新赛季生成出的 `map.tiles` 局部覆盖回旧世界。

## 12. 窗口分工

当前后端窗口：

- 维护 seed/version/权重/persist 路径设计。
- 维护 `ops:world:resource-generation`。
- 维护 `gate:world:resource-authority`。
- 写运维和迁移 handoff。

Godot 视觉窗口：

- 只读取新世界 `/api/world/map-layout`。
- 只负责资源地 PNG 按 tile/cell 落格显示。
- 不生成、不重洗、不结算。

AI/UI authority 窗口：

- 只消费 proposal、receipt、inbox、quota。
- 不本地扣资源。
- 不本地给 faction 加资源。

## 13. 一句话口径

新赛季 / 新服资源重洗的最小安全单位是“新的持久化世界”，不是“旧世界上换一个随机种子”。
