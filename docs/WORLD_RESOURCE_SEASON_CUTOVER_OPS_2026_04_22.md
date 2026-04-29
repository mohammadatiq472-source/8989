# 世界资源地正式赛季切换 Ops（2026-04-22）

## 1. 结论

正式赛季切换不做在线旧世界原地洗牌。

当前 v1 运维口径是：

- 为新赛季创建新的 `WORLD_STATE_PERSIST_PATH`。
- 用新的 `worldSeed + generationVersion + levelWeightTable + kindWeightTable` 生成新世界。
- 生成 JSON / Markdown 报告，人工确认后再把部署配置切到新 persist。
- 旧赛季 persist 只归档，不覆盖、不隐式重写。

配置切换细则见：

```text
docs/WORLD_RESOURCE_SEASON_CONFIG_SWITCH_2026_04_22.md
```

这也是赛季制 SLG 常见做法的核心原因：旧赛季的资源、占领、驻军、行军、采集、AI claim、玩家认知都已经绑定旧世界事实。全图在线重洗会让已经发生的世界状态失去可解释性。

## 2. 正式入口

预检，不创建 persist：

```powershell
npm run ops:world:season-cutover:precheck -- --server-id=server_alpha --season-id=season_002 --persist-path=tmp\world-season-cutovers\server_alpha\season_002\world_snapshot.json
```

人工确认后创建新 persist：

```powershell
npm run ops:world:season-cutover:create-persist -- --server-id=server_alpha --season-id=season_002 --persist-path=tmp\world-season-cutovers\server_alpha\season_002\world_snapshot.json --confirm-server-id=server_alpha --confirm-season-id=season_002 --confirm-old-world-write-stopped
```

正式 dry-run gate：

```powershell
npm run gate:world:season-cutover-prepare-dry-run
```

高层资源 authority 门禁已经包含该 gate：

```powershell
npm run gate:world:resource-authority
```

## 3. Ops 做什么

`ops:world:season-cutover:precheck` 会检查：

- `serverId` / `seasonId` 是否显式有效。
- 旧 persist 的存在性、字节数、SHA-256；如果传 `--require-old-persist`，旧 persist 不存在会失败。
- 新 `WORLD_STATE_PERSIST_PATH` 是否不是当前默认 live persist。
- 新 `WORLD_STATE_PERSIST_PATH` 是否不是旧 persist。
- 新 persist 目标文件是否不存在。
- 默认情况下目标是否位于仓库 `tmp/` 下；如果要写非 `tmp/` 路径，必须显式加 `--allow-non-tmp-target`。
- `WORLD_RESOURCE_*` 输入是否可解析。
- 预览生成是否满足 `L01 > L05 > L09`，且 L09 存在。
- 是否已经提供人工确认参数。
- create 模式是否显式确认旧世界已经停写：`--confirm-old-world-write-stopped`。

`ops:world:season-cutover:create-persist` 会在预检通过后：

- 用 shared domain 生成新的 `WorldState`。
- 写入新的 `world_snapshot.json`。
- 临时启动后端读取这个新 persist。
- 复用 `npm run ops:world:resource-generation` 做 HTTP 回读检查。
- 输出并保存报告。

该 ops 不做：

- 不停止旧服务器。
- 不覆盖旧 persist。
- 不切换正式流量。
- 不修改 Godot / UI。

## 4. 报告位置

默认报告写入：

```text
tmp/ops/world-season-cutover/<serverId>/<seasonId>/
```

每次执行会生成：

- `<runId>.json`
- `<runId>.md`
- `latest.json`
- `latest.md`

报告里的 `target` 会包含：

- `oldWorldStatePersistPath`
- `oldPersistExists`
- `oldPersistBytes`
- `oldPersistSha256`
- `worldStatePersistPath`

gate 报告写入：

```text
tmp/gates/world-season-cutover-prepare/world_season_cutover_prepare_latest.json
```

## 5. 线上切换顺序

人工运维建议顺序：

1. 固化旧赛季报告与旧 persist 备份。
2. 执行 `ops:world:season-cutover:precheck`，正式赛季切换建议加 `--require-old-persist`。
3. 人工确认目标路径、seed、generationVersion、权重表。
4. 停止旧赛季写入，并确认不会再写旧 persist。
5. 执行 `ops:world:season-cutover:create-persist`，必须带 `--confirm-old-world-write-stopped`。
6. 阅读 `latest.json` 或 `latest.md`，确认 `ok=true`。
7. 执行 `npm run gate:world:resource-authority`。
8. 按 `docs/WORLD_RESOURCE_SEASON_CONFIG_SWITCH_2026_04_22.md` 把部署配置切到新赛季目录。
9. 启动新赛季后端。
10. 用 `npm run ops:world:season-config:verify` 确认当前运行后端的 `persistence.worldState.path` 等于 cutover 报告里的新 persist。
11. 用 `npm run ops:world:resource-generation` 再做一次只读检查。

切换后配置校验示例：

```powershell
npm run ops:world:season-config:verify -- --server-id=server_alpha --season-id=season_002 --base-url=http://127.0.0.1:8787
```

`ops:world:season-config:verify` 默认按 `--server-id/--season-id` 读取 `tmp/ops/world-season-cutover/<server>/<season>/latest.json`，也可以显式传 `--report-path=...`。该命令默认访问 `/api/world/map-layout?scope=full`，所以切换验证阶段需要临时开启 `ENABLE_FULL_MAP_LAYOUT=1`；如只做启动前环境检查可加 `--env-only`，如只做 health path 检查可加 `--skip-full-map`。

对应 dry-run gate：

```powershell
npm run gate:world:season-config-verify-dry-run
```

该 gate 会创建临时新 persist，启动临时后端，再调用 `ops:world:season-config:verify` 检查 `/api/health` 的实际 world persist path。

## 6. 为什么不在线洗牌

多人 SLG 里，一个 tile 不只是视觉格子，还是移动单位、占领单位、采集单位、AI claim 单位、交互选择单位。

旧世界如果在线全图洗牌，会产生这些问题：

- 玩家昨天占领的资源地今天变成另一种资源。
- 部队目标 tile 的语义漂移。
- AI 采集/输送记录与新资源类型对不上。
- 总督 inbox、事件、日志引用旧 tile 事实。
- 客户端与后端缓存可能短时间看到不同世界。

所以 v1 只支持新服 / 新赛季生成新世界。旧世界未来如果必须迁移，需要单独设计迁移脚本和玩家补偿策略，不能用资源生成 seed 偷换。

## 7. 当前验证

本轮已经验证：

```powershell
npm run ops:world:season-cutover:precheck -- --server-id=local_dev --season-id=season_precheck_validation --persist-path=tmp\ops-validation\season_precheck_validation\world_snapshot.json --report-dir=tmp\ops-validation\season_precheck_validation\report
npm run gate:world:season-cutover-prepare-dry-run
npm run gate:world:season-config-verify-dry-run
```

验证结论：

- 预检通过，不创建 persist。
- gate 成功创建新 persist。
- season-config verify gate 能确认临时后端实际运行的 `persistence.worldState.path` 等于 cutover 报告里的 persist。
- 新 persist 约 44 MB。
- 后端能从新 persist 启动并回读资源统计。
- 资源等级满足 `L01 > L05 > L09`。
- `resourceTileCount == generatedResourceTileCount`。
- `resourceKind/resourceLevel` 字段完整。
