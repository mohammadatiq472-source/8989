# AI 玩家集成窗口锁（2026-04-27）

## 作用

本文件给当前旧窗口使用。当前窗口上下文已经持续两天，包含大量历史讨论、截图、Web 原型、Godot 截图和中间方案。对话历史和图片无法在 Codex 窗口内真正删除，因此本窗口后续用“集成锁”降低污染：

- 不再沿旧截图和旧原型细节继续展开新实现。
- 不再直接承担大块新开发。
- 只接收其他专门窗口的交付结果，做冲突检查、合同对齐、集成验证和最终风险判断。
- 每次集成前只读紧凑锚点文档，不回放旧图片上下文。

## 当前已拆出的专门窗口

### A. Provider Pool / Patrol Ops 后端窗口

任务包：

- `docs/AI_PLAYER_PROVIDER_POOL_AND_AI_PANEL_NEXT_WINDOW_PROMPT_2026_04_27.md`

职责：

- provider pool/read-model
- 每个 AI 的模型来源、预算、fallback 状态
- patrol scheduler 外部调度说明或 ops gate
- app 内 timer 默认关闭

禁止：

- 不改 Godot AI 管理页布局
- 不碰 `godot-client/scripts/ui/ai_panel.gd`
- 不碰 `godot-client/scripts/ui/presenters/ai_panel_presenter.gd`
- 不碰 `godot-client/scenes/ui/ai_panel.tscn`

### B. Godot AI 管理页 UI / 移动端窗口

任务包：

- `docs/AI_PLAYER_AI_PANEL_UI_NEXT_WINDOW_PROMPT_2026_04_27.md`

职责：

- Godot AI 管理页专门布局
- 移动端适配
- 头像 / 模型 / 预算 / 失败原因玩家可读卡片
- 截图证据

禁止：

- 不改 provider pool 后端
- 不改 shared/server AI 合同
- 不做 patrol scheduler ops gate

## 本窗口后续集成流程

当 A 或 B 窗口交付时，本窗口按以下顺序处理：

1. 读交付窗口的最终总结和改动文件清单。
2. 跑 `git status --short`，确认是否碰到对方白名单。
3. 如果 A 改了 shared/server 合同，检查 B 是否只消费字段、不抢改后端。
4. 如果 B 改了 Godot UI，检查 A 是否没有改 UI 热文件。
5. 跑最低集成 gate：
   - `npm run build`
   - A 后端相关 contract/gate
   - `npm run godot:headless:smoke`
   - 必要的 `godot:mainline:visual-smoke`
6. 更新 `docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md`，只写事实。
7. 输出通过项 / 风险项 / 阻塞项 / 下一步。

## 当前不建议再开的窗口

### 暂不单开：Web 原型继续扩展

原因：

- Web 原型已经完成形态验证。
- 继续扩会变成第三套 UI，和 Godot 正式客户端竞争注意力。
- 后续只允许在 `tmp/` 里做不可维护验证，不作为正式客户端。

### 暂不单开：World-cell / map 美术

原因：

- 当前主线目标是 AI 玩家可玩闭环，不是世界地图视觉。
- 任何 marker 密度问题只加开关/上限，不做 world-cell 美术微调。

### 暂不单开：BYOK / 玩家自带 key 保存 UI

原因：

- 需要 `FACTION_APIKEY_ENCRYPTION_KEY`、持久化密钥安全策略、分账逻辑一起定。
- 当前阶段只显示“全局中转站 / 已配置玩家自带 key”，不显示明文。
- 等 provider pool read-model 稳定后再开安全窗口更合适。

## 可考虑的新窗口方向

### C. AI 可玩闭环 Authority / End-to-End Gate 窗口

建议：等 A、B 两个窗口至少各交付一轮后再开。

目标：

- 把“自然语言命令 -> JSON proposal -> 后端执行 -> receipt -> 聊天/AI 管理页/地图可见”整理成正式 end-to-end gate。
- 聚合已有动作链：`troop_heal -> tile_occupy -> march_move/resource_gather`。
- 明确哪些是可执行 authority，哪些只是 read-model 或 risk item。

可能白名单：

- `shared/contracts/aiPlayer.ts`
- `shared/schemas/aiPlayer.ts`
- `server/src/application/ai/AIPlayerGovernanceService.ts`
- `server/src/application/ai/aiPlayerChatCommandService.ts`
- `server/src/application/ai/aiPlayerDevelopmentPlanReadModel.ts`
- `server/src/application/ai/aiPlayerBattleReportReadModel.ts`
- `server/tests/ai_player_http_*`
- `server/src/evals/runAiPlayer*Gate.ts`
- `docs/AI_PLAYER_AUTOMATION_ROLLING_STATUS_2026_04_26.md`

禁止：

- 不做 UI 布局
- 不碰 world-cell 美术
- 不做 provider pool 路由层，除非 A 已交付字段后只消费

### D. AI 地图意图可视化 / 玩家路径证据窗口

建议：如果 B 窗口完成 AI 管理页后，玩家仍看不懂 AI 在地图上做什么，再开。

目标：

- AI 部队徽标
- 目标地块意图环
- 占地 / 采集状态
- marker 数量上限和开关
- 不做 world-cell 美术微调

可能白名单：

- `godot-client/scripts/map/ai_map_intent_marker.gd`
- `godot-client/scripts/ui/main_chat_overlay.gd`（仅对齐聊天提案详情）
- `godot-client/scripts/app/adapters/slg_domain_state_adapter.gd`
- `godot-client/tools/run_mainline_visual_smoke.py`
- `docs/AI_PLAYER_MAP_VISUAL_EXPRESSION_DRAFT_2026_04_27.md`

禁止：

- 不改 world-cell 资产、pass/fort/dock 截图链
- 不改后端 authority
- marker 过密只加密度控制

### E. BYOK / Faction Model Config 安全窗口

建议：等 provider pool read-model 和当前全局中转站策略稳定后再开。

目标：

- `FACTION_APIKEY_ENCRYPTION_KEY`
- `/api/faction/:id/model-config`
- 玩家/势力自带 key 加密持久化
- 明文不显示
- 分账与预算状态

可能白名单：

- `shared/contracts/game/ai.ts`
- `server/src/config/*`
- `server/src/routes/*faction*`
- `server/tests/faction_config_byok_persistence_contract.test.ts`
- `docs/AI_PLAYER_RUNTIME_MODEL_STRATEGY_2026_04_27.md`

禁止：

- 不改 AI 管理页保存 UI，除非安全合同先通过
- 不把 secret 写入仓库或日志

## 当前建议

现在先不要再开新窗口。先让 A、B 两个窗口各自推进：

1. A 交付 provider pool/read-model + patrol ops gate。
2. B 交付 Godot AI 管理页专门布局 + 移动端截图。
3. 本窗口接收两边结果后做一次集成验收。
4. 如果集成后缺“真实可玩闭环 gate”，再开 C 窗口。

这样窗口数量不会失控，也不会让 shared/server/Godot UI 热文件互相抢改。
