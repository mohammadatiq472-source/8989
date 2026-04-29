# 世界资源地赛季切换风险处置与窗口分流（2026-04-22）

## 1. 结论

当前后端窗口已经能负责：

- 定义 `world_seed / generation_version / level_weight_table / kind_weight_table`。
- 生成并持久化每个 tile 的 `resourceKind/resourceLevel`。
- 准备新赛季 persist、生成 JSON/Markdown 报告、做 dry-run gate。
- 把 cutover / reseed / AI 资源 authority 纳入 `gate:world:resource-authority`。

当前后端窗口不应该继续扩大到：

- 自动切正式流量。
- 在线旧世界洗牌。
- Godot 资源视觉落格。
- AI 玩家 UI、总督 UI 或客户端交互样式。
- 大规模压测、部署编排和生产环境密钥/变量管理。

这些不是不能做，而是要拆到专门窗口，避免把世界资源 authority、视觉验收、部署运维和 AI/UI 交互混在一个上下文里。

## 2. 已在当前窗口处理的风险

### 2.1 新赛季资源生成不可复现

处理方式：

- `worldSeed`、`generationVersion`、`resourceTileDensityPermille`、`levelWeightTable`、`kindWeightTable` 都进入新世界 metadata。
- `/api/world/map-layout?scope=full` 可以读回 `resourceGeneration` 和每个资源 tile 的等级/类型。
- `ops:world:resource-generation` 会验证资源总数、字段完整性、`L01 > L05 > L09`。

剩余要求：

- 正式服 seed 命名必须按赛季/服务器固定，不要临时手填随机字符串后丢失记录。

### 2.2 创建新 persist 时误写旧世界

处理方式：

- `ops:world:season-cutover:create-persist` 要求显式传入：
  - `--confirm-create-persist`
  - `--confirm-server-id=...`
  - `--confirm-season-id=...`
  - `--confirm-old-world-write-stopped`
- 缺少旧世界停止写入确认时，命令会失败，不创建新 persist。
- 新 persist 目标路径不能等于当前世界 persist 或旧世界 persist。

剩余要求：

- 生产切换仍然需要部署窗口保证旧进程停止写入，后端 ops 只能做命令级防呆。

### 2.3 只生成机器报告，人工难审

处理方式：

- `ops:world:season-cutover:create-persist` 同时输出 JSON 和 Markdown 报告。
- `gate:world:season-cutover-prepare-dry-run` 会验证报告存在，并验证新 persist 能被临时后端读回。

剩余要求：

- 正式切换前必须人工确认 Markdown 报告，不建议只看 exit code。

### 2.4 高层 authority gate 漏掉新赛季流程

处理方式：

- `gate:world:resource-authority` 已纳入：
  - `gate:world:season-cutover-prepare-dry-run`
  - `gate:world:new-season-reseed-dry-run`
  - `ops:world:resource-generation`
  - AI 采集、AI 输送、总督 inbox 相关验证。

剩余要求：

- 长链 gate 曾出现过一次 `ECONNRESET`，单项串行重跑通过；如果复现，应优先调查测试后端启动/停止隔离，而不是降低 gate 覆盖面。

## 3. 当前不建议在本窗口解决的风险

### 3.1 自动切正式流量

判断：

不应在当前后端资源窗口解决。

原因：

- 正式流量切换涉及部署平台、进程生命周期、环境变量注入、服务发现、负载均衡、回滚策略。
- 当前 `create-persist` 的职责是准备新赛季世界文件，不应该顺手重启服务或改生产配置。

建议窗口：

- DevOps / 发布运维窗口。

建议边界：

- 读取 `docs/WORLD_RESOURCE_SEASON_CONFIG_SWITCH_2026_04_22.md`。
- 使用 ops 报告里的新 persist path。
- 切换 `WORLD_STATE_PERSIST_PATH / WORLD_PERSIST_ROOT / NARRATIVE_PERSIST_PATH / WORLD_SAVE_SLOTS_PATH / SESSION_STATE_PERSIST_PATH`。
- 启动后只读验证，不在部署脚本里重新生成资源地。

### 3.2 在线旧世界直接洗牌

判断：

不建议支持，除非另开迁移/补偿设计。

原因：

- 旧世界已有玩家占领、采集、行军、战报、AI 任务和存档引用。
- 直接洗牌会让资源 tile 的语义变化，破坏玩家预期和历史状态。
- 传统赛季制 SLG 通常把地图结构更新放在新服/新赛季，是为了避免在线世界的状态冲突。

建议窗口：

- 赛季迁移 / 运营补偿窗口。

建议边界：

- 只做显式 migration，不做启动期隐式重洗。
- migration 必须有 backup、dry-run、差异报告、人工确认、回滚方案。

### 3.3 Godot 资源地视觉落格

判断：

不在当前后端窗口解决。

原因：

- 视觉正确性依赖 Godot 的 tile/cell 投影、资源 PNG anchor、hover/selection 层级和运行态截图。
- 后端只负责 `resourceKind/resourceLevel` 真相，不负责画法。

建议窗口：

- Godot 世界地图资源视觉/UI 接入窗口。

建议边界：

- 只改 `godot-client/scripts/map/map_grid.gd`、资源 manifest、资源 PNG 接入和 Godot 验证链。
- 不改 `server/src/**`、AI 玩家系统、Web 原型、native_slg_shell 主壳样式。
- 验收必须看到真实运行态资源地截图，不能用旧地图底图或额外底盘冒充。

### 3.4 AI 玩家 UI / 总督交互

判断：

不在当前后端资源生成窗口继续扩大。

原因：

- AI 资源采集/输送 authority 已有后端合同，UI 只应该展示 proposal、receipt、inbox、cooldown、quota。
- 如果 UI 本地做资源结算，会和后端 authority 冲突。

建议窗口：

- AI 玩家资源输送 / UI authority 窗口。

建议边界：

- UI 消费后端字段，不直接写世界资源字段。
- 后端窗口只提供接口合同和验证入口。

### 3.5 超大规模联机性能

判断：

当前可以记录风险，但不应和资源生成落地混做。

原因：

- 性能问题涉及 full map layout 暴露、WebSocket 广播、世界写锁、AI 批处理、资源刷新频率。
- 当前 `ENABLE_FULL_MAP_LAYOUT=1` 只建议用于验证/canary，不建议正式常驻。

建议窗口：

- 性能压测 / 容量规划窗口。

建议边界：

- 基于真实地图尺寸、玩家数量、AI 数量和 tick 频率压测。
- 决定 map-layout 是否分页、分区或按视野加载。

## 4. 当前窗口还适合继续做的事

适合继续做：

- 补后端 handoff、ops、配置切换和风险文档。
- 增加只读校验入口，例如后续可做 `ops:world:season-config:verify`，检查当前进程实际读取的 persist 与 cutover 报告是否一致。
- 修复 `gate:world:resource-authority` 中可复现的后端启动/停止不稳定。
- 继续补资源 authority 的非 UI、非 Godot、非部署侧验证。

不适合继续做：

- 重做 Godot 截图或资源 PNG 视觉。
- 写 UI 页面。
- 修改 AI 玩家策略。
- 写生产部署脚本自动切流。
- 对旧世界做在线洗牌。

## 5. 交给其他窗口的任务清单

### Godot 世界地图资源视觉窗口

目标：

- 把纯资源 PNG 拼接规则正式接入世界地图运行态。
- 保证 `tile/cell -> 320x160 footprint -> 200x100` 的缩放和 anchor 不漂移。
- 做资源地视觉二次校准：iron 提亮、wood 层次增强、L01 稀疏和 L09 密度对比。

必须读取：

- `AGENTS.md`
- `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
- `CODEX.md`
- `docs/WORLD_RESOURCE_WORKSTREAM_SPLIT_2026_04_22.md`
- `docs/WORLD_RESOURCE_GENERATION_AUTHORITY_HANDOFF_2026_04_22.md`

禁止扩大：

- `server/src/**`
- AI 玩家系统
- Web 原型
- native_slg_shell 主壳样式

### AI 玩家资源输送 / UI authority 窗口

目标：

- 对齐 `AI_PLAYER_RESOURCE_TRANSFER_AUTHORITY_HANDOFF_2026_04_21.md`。
- 展示 AI 资源采集/输送 proposal、receipt、inbox、quota、cooldown。
- 保证 UI 不做本地资源结算。

必须读取：

- `docs/AI_PLAYER_RESOURCE_TRANSFER_AUTHORITY_HANDOFF_2026_04_21.md`
- `docs/WORLD_RESOURCE_GENERATION_AUTHORITY_HANDOFF_2026_04_22.md`
- `docs/WORLD_RESOURCE_WORKSTREAM_SPLIT_2026_04_22.md`

禁止扩大：

- 世界资源生成算法。
- Godot tile 投影。
- 生产部署切流。

### DevOps / 发布运维窗口

目标：

- 把 `ops:world:season-cutover:create-persist` 产物接入真实环境切换。
- 明确预检、停写、切 env、启动、只读验证、回滚。

必须读取：

- `docs/WORLD_RESOURCE_SEASON_CUTOVER_OPS_2026_04_22.md`
- `docs/WORLD_RESOURCE_SEASON_CONFIG_SWITCH_2026_04_22.md`
- 本文档。

禁止扩大：

- 不在部署脚本中重新生成资源地。
- 不在线洗旧世界。

### 性能压测 / 容量窗口

目标：

- 验证 full map layout、资源 tile 数量、AI 批处理和多人访问压力。
- 给正式服决定分页/分区/视野裁剪策略。

必须读取：

- `docs/WORLD_RESOURCE_GENERATION_AUTHORITY_HANDOFF_2026_04_22.md`
- `docs/WORLD_RESOURCE_SEASON_CONFIG_SWITCH_2026_04_22.md`

禁止扩大：

- 不改视觉资产。
- 不改赛季生成语义。

## 6. 一句话口径

当前窗口负责把“资源地真相”做成可复现、可持久化、可审计、可切换的新赛季后端能力；视觉、UI、部署、压测分别交给对应窗口，不在这里继续混做。
