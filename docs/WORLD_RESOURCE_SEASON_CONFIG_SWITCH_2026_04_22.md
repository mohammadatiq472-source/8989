# 世界资源地赛季切换后的配置切换说明（2026-04-22）

## 1. 结论

`ops:world:season-cutover:create-persist` 只负责准备新赛季 persist 和报告，不负责切正式流量。

人工确认报告后，正式切换要做的是：

1. 停止旧赛季写入。
2. 把后端运行环境切到报告里的新 `worldStatePersistPath`。
3. 配套切换 narrative、save slots、session persist 路径，避免跨赛季串状态。
4. 启动新赛季后端。
5. 用只读 ops 和 authority gate 验证。

## 2. 从报告提取配置

报告位置来自：

```text
tmp/ops/world-season-cutover/<serverId>/<seasonId>/latest.json
tmp/ops/world-season-cutover/<serverId>/<seasonId>/latest.md
```

如果是 gate dry-run：

```text
tmp/gates/world-season-cutover-prepare/world_season_cutover_prepare_latest.json
```

需要提取：

| 报告字段 | 部署环境变量 |
| --- | --- |
| `target.worldStatePersistPath` | `WORLD_STATE_PERSIST_PATH` |
| `policy.worldSeed` | `WORLD_RESOURCE_SEED` |
| `policy.generationVersion` | `WORLD_RESOURCE_GENERATION_VERSION` |
| `policy.resourceTileDensityPermille` | `WORLD_RESOURCE_TILE_DENSITY_PERMILLE` |
| `policy.levelWeightTable` | `WORLD_RESOURCE_LEVEL_WEIGHT_TABLE` |
| `policy.kindWeightTable` | `WORLD_RESOURCE_KIND_WEIGHT_TABLE` |

`target.oldPersistSha256` 用于旧赛季归档审计，不用于新赛季启动。

## 3. 推荐目录结构

推荐每个服务器 / 赛季一个独立目录：

```text
data/worlds/<serverId>/<seasonId>/
  world_snapshot.json
  narrative_events.json
  world_save_slots.json
  session_state.json
```

`WORLD_STATE_PERSIST_PATH` 应直接指向新赛季 `world_snapshot.json`。

`WORLD_PERSIST_ROOT` 也可以指向新赛季目录，但不要只设置 `WORLD_PERSIST_ROOT` 后忘记显式检查 `WORLD_STATE_PERSIST_PATH`。正式切换建议两者都设置，减少误读默认 `tmp/world_snapshot.json` 的风险。

## 4. PowerShell 示例

以下示例假设 cutover 报告已经确认 `ok=true`。

```powershell
$seasonRoot = "C:\Users\26739\Desktop\8989\data\worlds\server_alpha\season_002"

$env:WORLD_PERSIST_ROOT = $seasonRoot
$env:WORLD_STATE_PERSIST_PATH = Join-Path $seasonRoot "world_snapshot.json"
$env:NARRATIVE_PERSIST_PATH = Join-Path $seasonRoot "narrative_events.json"
$env:WORLD_SAVE_SLOTS_PATH = Join-Path $seasonRoot "world_save_slots.json"
$env:SESSION_STATE_PERSIST_PATH = Join-Path $seasonRoot "session_state.json"

$env:WORLD_RESOURCE_SEED = "server_alpha:season_002:world_resource:v1"
$env:WORLD_RESOURCE_GENERATION_VERSION = "world_resource_generation_season_002_v1"
$env:WORLD_RESOURCE_TILE_DENSITY_PERMILLE = "480"
$env:WORLD_RESOURCE_LEVEL_WEIGHT_TABLE = "1:360,2:250,3:170,4:110,5:60,6:30,7:12,8:6,9:2"
$env:WORLD_RESOURCE_KIND_WEIGHT_TABLE = "food:250,wood:250,stone:250,iron:250"

npm run start
```

说明：

- `WORLD_STATE_PERSIST_PATH` 是世界事实入口。
- `NARRATIVE_PERSIST_PATH` 默认跟随 `WORLD_PERSIST_ROOT`，但正式切换建议显式设置。
- `WORLD_SAVE_SLOTS_PATH` 在 `WorldService` 内单独读取，正式切换建议显式设置。
- `SESSION_STATE_PERSIST_PATH` 默认是仓库 `tmp/session_state.json`，不会自动跟随 `WORLD_PERSIST_ROOT`，新赛季建议显式切到赛季目录，或人工清空旧 session。

## 5. 启动前检查

启动前必须确认：

```text
WORLD_STATE_PERSIST_PATH != 旧赛季 WORLD_STATE_PERSIST_PATH
NARRATIVE_PERSIST_PATH != 旧赛季 NARRATIVE_PERSIST_PATH
WORLD_SAVE_SLOTS_PATH != 旧赛季 WORLD_SAVE_SLOTS_PATH
SESSION_STATE_PERSIST_PATH != 旧赛季 SESSION_STATE_PERSIST_PATH
```

还要确认：

- 新 `world_snapshot.json` 来自 `ops:world:season-cutover:create-persist`。
- 报告 `ok=true`。
- 报告里 `humanConfirmation.oldWorldWriteStopped=true`。
- 报告里 `creation.created=true`。
- 报告里 `L01 > L05 > L09`。
- `target.oldPersistSha256` 已归档。

## 6. 启动后验证

如果要做完整地图只读验证，后端需要在验证环境打开：

```powershell
$env:ENABLE_FULL_MAP_LAYOUT="1"
```

然后执行：

```powershell
npm run ops:world:resource-generation
npm run ops:world:season-config:verify -- --report-path=tmp\ops\world-season-cutover\local_dev\season_001\latest.json --base-url=http://127.0.0.1:8787
npm run gate:world:resource-authority
```

`ops:world:season-config:verify` 会读取 `/api/health` 的 `persistence.worldState.path`，并和 cutover 报告里的 `target.worldStatePersistPath` 做路径比对；同时会读取 `scope=full` 的 map-layout，比对 `worldSeed`、`generationVersion`、资源地总量和 `L01 > L05 > L09`。

如果只是启动前检查当前 shell/deploy 环境变量是否指向报告里的 persist，可以用：

```powershell
npm run ops:world:season-config:verify -- --report-path=tmp\ops\world-season-cutover\local_dev\season_001\latest.json --env-only
```

`--env-only` 不访问后端，只检查报告、目标 persist 文件和当前 `WORLD_STATE_PERSIST_PATH`。

通过后，正式长期运行不建议继续打开 `ENABLE_FULL_MAP_LAYOUT=1`，避免完整地图接口成为常驻重负载入口。

## 7. 不能做的事

不要做：

- 不要把新 `WORLD_RESOURCE_SEED` 指向旧 `WORLD_STATE_PERSIST_PATH`。
- 不要只切 `WORLD_STATE_PERSIST_PATH`，但继续沿用旧 `WORLD_SAVE_SLOTS_PATH` 或旧 `SESSION_STATE_PERSIST_PATH`。
- 不要在旧后端还在写入时执行 `create-persist`。
- 不要在 Godot / UI 里本地随机资源地。
- 不要把 `ENABLE_FULL_MAP_LAYOUT=1` 当成正式服常驻配置。

## 8. 回滚口径

如果新赛季启动后验证失败：

1. 停止新赛季后端写入。
2. 保留新赛季目录和报告作为排障材料。
3. 恢复旧赛季的 `WORLD_STATE_PERSIST_PATH`、`NARRATIVE_PERSIST_PATH`、`WORLD_SAVE_SLOTS_PATH`、`SESSION_STATE_PERSIST_PATH`。
4. 启动旧赛季后端。
5. 执行旧赛季只读检查。

回滚不是重洗旧世界，不修改旧 persist。

## 9. 与现有 ops 的关系

- `ops:world:season-cutover:precheck`：验证新赛季参数和目标路径。
- `ops:world:season-cutover:create-persist`：创建新赛季世界文件和报告。
- `ops:world:season-config:verify`：切换配置后只读校验当前后端是否真的指向报告里的新 persist。
- `gate:world:season-cutover-prepare-dry-run`：证明正式 cutover ops 能创建新 persist 并被后端回读。
- `gate:world:season-config-verify-dry-run`：证明 `season-config:verify` 能识别临时后端运行中的 world persist path。
- `gate:world:resource-authority`：更高层资源 authority 门禁，覆盖 cutover、reseed、AI 采集、AI 输送、总督 inbox。
- `WORLD_RESOURCE_CUTOVER_RISK_TRIAGE_AND_WINDOW_SPLIT_2026_04_22.md`：说明哪些风险当前窗口已处理，哪些应交给 Godot、AI/UI、DevOps 或压测窗口。

配置切换必须发生在这些步骤之后，由人工或部署系统执行。
