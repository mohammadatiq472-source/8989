# Godot + MCP + CLI 控制面（2026-04-10）

## 0. 目标

把“AI 只能读状态”升级为“AI 可通过标准入口执行与复盘”：

1. MCP：给编程助手提供结构化工具调用。
2. CLI：给自动化代理提供可复现命令链。
3. Godot headless：把引擎启动纳入同一验证链。

---

## 1. 正式入口

### 1.1 MCP（stdio）

- 入口：`npx tsx server/src/mcp/gameServer.ts`
- 代码：`server/src/mcp/gameServer.ts`

### 1.2 CLI（推荐）

- 入口：`npm run godot:ops:cli -- <subcommand>`
- 脚本：`godot-client/tools/slg_ops_cli.py`

### 1.3 Godot week1 gate

- 入口：`npm run gate:godot:week1`
- 严格口径（默认，CI/验收）：`--no-allow-stale-runtime-schema`
- 兼容口径（仅排障，不得作为验收证据）：`npm run gate:godot:week1:compat`
- 产物：`tmp/gates/godot_week1_gate_latest.json`

---

## 2. MCP 工具映射（当前）

| 类别 | 工具 | 作用 |
| --- | --- | --- |
| 世界读取 | `get_world_summary` / `get_world_snapshot` | 读取 world 概览 |
| 事件读取 | `get_recent_events` / `get_narrative_events` | 读取事件与叙事 |
| AI 观测 | `get_ai_logs` | 读取 strict/fallback 诊断 |
| Session 操作 | `get_session_runtime` / `join_session` / `set_session_autonomy` / `leave_session` | 会话与自治控制 |
| 地图读取 | `get_map_layout` | 获取布局数据供渲染 |
| 规则执行 | `advance_tick` / `run_world_action` | 通过 authoritative world action 执行操作 |
| 基础健康 | `health_check` | 检查后端可用性 |

---

## 3. CLI 子命令映射（当前）

| 子命令 | 对应后端/引擎 | 说明 |
| --- | --- | --- |
| `health` | `GET /api/health` | 基础健康检查 |
| `runtime` | `GET /api/session/runtime` | 读取 faction/session 运行态 |
| `join` | `POST /api/session/join` | 加入席位并拿 token |
| `heartbeat` | `POST /api/session/heartbeat` | 会话保活 |
| `autonomy` | `POST /api/session/autonomy` | L1/L2/L3 切换 |
| `leave` | `POST /api/session/leave` | 离开席位 |
| `world` | `GET /api/world` | 世界摘要读取 |
| `map-layout` | `GET /api/world/map-layout` | 地图布局读取（默认摘要，`--raw` 可切原始） |
| `world-action` | `POST /api/world/action` | 通用规则动作入口（默认摘要，`--raw` 可切原始） |
| `advance-tick` | `world-action(advanceTick)` | Tick 推进快捷命令 |
| `headless` | Godot `--headless` | 引擎启动 smoke |
| `bootstrap-chain` | 组合链路 | `health -> runtime -> join -> world -> map -> headless -> leave` |

补充：

- `bootstrap-chain` 默认输出 map-layout 摘要，必要时可使用 `--raw-map-layout` 进行深度排障。

---

## 4. 示例命令（可直接复现）

```powershell
npm run godot:ops:cli -- health
npm run godot:ops:cli -- runtime
npm run godot:ops:cli -- join --faction-id player --player-name ai_cli
npm run godot:ops:cli -- autonomy --token <TOKEN> --level L2_delegated
npm run godot:ops:cli -- world-action --action advanceTick
npm run godot:ops:cli -- map-layout --scope bootstrap
npm run godot:ops:cli -- headless
npm run godot:ops:cli -- --output tmp/gates/godot_ops_bootstrap_latest.json bootstrap-chain
npm run godot:ops:cli -- --timeout-sec 180 template-replay --scenario baseline_v1 --report-path tmp/gates/ai_ops_template_replay_latest.json
npm run godot:ops:visual-validate
```

---

## 5. 设计边界（必须遵守）

1. 规则裁决只走 `/api/world/action`（不在 Godot 客户端做权威分支）。
2. CLI/MCP 仅提供“可控入口”，不绕过后端 schema 校验。
3. 所有自动化执行建议写 JSON 证据（`--output`）便于回放与审计。

---

## 6. 下一步（短期）

1. 为 `world-action` 增加“常用动作模板库”（减少 payload 手写错误）。
2. 把 `bootstrap-chain` 纳入夜间回归，形成“可启动 + 可执行 + 可观测”一体门禁。
3. 在 B2-C16 已补齐 token 生命周期后，下一步把 session 安全 smoke 变成固定 gate（纳入 nightly）。
4. AI 玩家动画与外部原型兜底参考：`docs/GODOT_AI_PLAYER_ANIMATION_FALLBACK_2026_04_10.md`。
