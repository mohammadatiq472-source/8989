# AI 原生 SLG 目标对齐审计（2026-04-10）

## 0. 结论先行

当前代码结构**没有偏离核心方向**（规则引擎权威 + 人定战略 AI 执行），目前偏移已从“中度”降到“轻中度”：

1. Godot 客户端已具备模板化动作触发与 lastAction 回显，复杂动作有 CLI/MCP 正式入口可复用。
2. AI 操作能力已从“仅通用 action”升级到“模板化 action + 剧本化回归对账”。
3. Session 在线态恢复与鉴权/生命周期治理已补上并门禁化，当前重心转向批次收尾与下一批卡片规划。

换句话说：方向对，执行面不均衡，需要把“观测优先”收敛到“操作与观测并重”。

---

## 1. 目标基准（现行口径）

目标基准来自现行执行文档 [AGENTS_EXECUTION_CURRENT_2026_04.md](AGENTS_EXECUTION_CURRENT_2026_04.md)：

1. 真人负责战略意志与组织决策。
2. AI 在同一 SLG 世界里像玩家一样执行、协作、博弈。
3. 后端规则引擎 authoritative，前端不做裁决分支。

---

## 2. 对齐矩阵（目标 vs 现状）

| 目标能力 | 现状证据 | 对齐度 | 偏移等级 | 处理建议 |
| --- | --- | --- | --- | --- |
| 规则引擎权威裁决 | `server/src/routes/world.ts` 仅通过 `/api/world/action` 进规则链；`WorldService` 执行 | 高 | 低 | 保持不动，继续把新增操作接到同一 action 链 |
| 人机同权“可操作面” | Godot 已支持 `refresh/advanceTick` + `Ctrl+1/2/3` 模板动作，CLI/MCP 支持模板执行与剧本回归 | 高 | 低 | 保持模板动作收敛到同一 action 链并持续门禁 |
| AI 像玩家执行 | 后端闭环稳定 + MCP/CLI 可跑模板动作（含 move/upgrade/override）+ 固定初始态回放夹具对账报告 | 高 | 低 | 维持 fixture `template-replay` + mainline gate 双轨验收 |
| 会话与自治切换 | `SessionManager` 支持 L1/L2/L3；token 生命周期与错误码边界已落地且门禁化 | 高 | 低 | 保持 `gate:session:security` + nightly 持续回归 |
| 观测可追溯（事件/叙事） | `/api/events` `/api/narratives` `/api/civil-memory` + Godot ObservabilityPanel | 高 | 低 | 继续沿用，补关键动作 trace id |
| Godot 迁移主链 | `godot-client` 已有 runtime/join/world/map + MapGrid + gate | 中高 | 中 | 从“读链完整”转向“操作链完整” |
| MCP 可自动化操作 | 原 MCP 偏读取；本次已补 `session/join/autonomy/leave` + `run_world_action` | 中 | 中 | 用 MCP 工具做“AI 执行剧本”回归 |
| CLI 可复现自动化 | 原仅 `run_week1_gate.py`；本次新增 `slg_ops_cli.py` | 中 | 中 | 固化到 gate 与 runbook，减少手工点操作 |
| 多实例/线上形态 | 持久化以单机文件态为主 | 低中 | 高 | 后续进入存储与一致性专项，当前先不扩功能 |

---

## 3. 当前“结构偏移”具体表现

1. **前端动作入口仍偏轻量**：Godot 已补快捷模板动作，但复杂操作仍以 CLI/MCP 为主。
2. **自动化回归已模板剧本化并收紧**：`template-replay`、mainline gate 与 nightly gate 已固定“初始态夹具 -> 动作 -> 事件/叙事对账 -> 还原”报告入口。
3. **治理边界已收口并门禁化**：Session 鉴权/生命周期已落地并并入 gate/nightly 防回归。

---

## 4. 本轮已落地的纠偏动作

1. MCP 扩展操作工具（见 `server/src/mcp/gameServer.ts`）：
   - `get_session_runtime`
   - `join_session`
   - `set_session_autonomy`
   - `leave_session`
   - `get_map_layout`
   - `run_world_action`
2. 新增 Godot/后端统一 CLI：
   - `godot-client/tools/slg_ops_cli.py`
   - npm 入口：`npm run godot:ops:cli -- <subcommand>`
3. `godot-client/README.md` 增加 CLI 控制面说明与可复现命令。

---

## 5. 下一阶段建议（务实优先级）

1. **P0：B2-C18（Session security gate）已完成**
   - token 生命周期、过期策略、401 语义、errorCode/tokenState 边界已固化到自动 gate，并并入 nightly。
2. **P1：B2-C19 操作面扩展已完成**
   - CLI/MCP 已增加“常用 world action 模板层”（move/upgrade/override 等），Godot Runtime 已补 lastAction 对账显示。
3. **P1：B2-C20 AI 执行回归脚本已完成**
   - 已落地 `template-replay` + `gate:ai:mainline:stability` 对账，报告落盘 `tmp/gates/ai_ops_template_replay_latest.json`。
4. **P1：B2-C21 固定初始态夹具已完成**
   - 已新增 `/api/save-slots/fixture/prime`，并将模板回放收紧为“全必选步骤 + 默认 60s 回放超时下限”。
5. **P1：B2-C22 nightly 显式断言已完成**
   - nightly 现在直接解析 `ai_ops_template_replay_latest.json` 并校验夹具三项与全必选步骤，不再只依赖 mainline exit code。
6. **P1：B2-C23 门禁三件套交接已完成**
   - 已新增 `gate:ai:trio` 与统一交接文档 `GATE_TRIO_HANDOFF_2026_04_10.md`，可一键执行并快速排障。
7. **P1：B3-C01 三件套提速已完成**
   - nightly 已支持 `reuse_latest_reports` + 新鲜度校验，`gate:ai:trio` 不再重复执行 session/mainline 两遍。
8. **P1：B3-C02 三件套聚合报告已完成**
   - 已新增 `gate_trio_summary_latest.json`，可单文件读取 session/mainline/nightly/template-replay 的一致性与总状态。
9. **P1：B3-C03 Save Slot 迁移策略最小卡已完成**
   - 已固化 Save Slot `version envelope + legacy 兼容 + 跨环境迁移最小 SOP`，并纳入 runbook/narrative，nightly 继续作为回放夹具链验证入口。
10. **P1：B3-C04 Save Slot 健康纳管卡已完成**
   - Save Slot 已纳入 `/api/health.persistence` 与 nightly `persistence_snapshot_available`，并进入 `alerts.source` 聚合域。
11. **P1：B3-C05 Save Slot 大文件治理卡已完成**
   - 已新增 `soft/hard` 体积阈值、`save_slots_not_hard_oversize` 检查与 `save_slots_oversize_*` 告警码，实现“可观测 + 可门禁”。
12. **P1：B3-C06 Save Slot 归档压缩与锁治理卡已完成**
   - 已新增 soft 超限自动 gzip 归档、锁冲突/失败可观测与 nightly 三项显式检查（archive/lock），形成“体积 + 一致性”双治理闭环。

---

## 6. 审计判定

**判定：可继续推进，不需要推翻重构。**  
应采取“边跑边纠偏”的方式：保持现有后端主链稳定，优先补齐操作面与鉴权治理，而不是再开新一轮架构重写。
