# AI 玩家自动化滚动状态（2026-04-26）

## 本轮完成

- 主窗口已接收独立 worktree 的后端合同包，不做整文件覆盖，只手工融合 `tile_occupy / troop_heal` 的 authority 链。
- `tile_occupy` 已成为可执行 v1 action：proposal schema -> executor -> `occupyTile` WorldService action -> `shared/domain/rules.ts` -> `commitWorldState` -> receipt。
- `tile_occupy` 成功会修改地块 owner、降低 enemyPressure、扣 1 行动点与 1 粮草，并返回 `worldAction=occupyTile`。
- `troop_heal` 已成为可执行 v1 action：proposal schema -> executor -> `healTroop` WorldService action -> rules -> receipt。
- `troop_heal` 成功会恢复 AI 受管部队兵力和补给，扣 1 行动点与 2 粮草；满状态会返回 `unit_already_full` 正式失败 receipt。
- `development-plan` 已把 `tile_occupy / troop_heal` 从 deferred 风险项提升为可执行候选动作，并输出 `proposalArgs / proposalReason / targetUnitId / targetTileId`。
- AI runtime prompt allowed actions、AI knowledge graph、HTTP aggregate shard 已同步 `tile_occupy / troop_heal`。
- `battle_report_read` 已合入正式只读 contract：`GET /api/ai/players/:id/battle-reports`，按 AI 管辖部队筛选战报并返回损伤、严重度和下一步建议，不改 worldVersion。
- `development-plan.recommendedLoop` 已显式给出 `tile_occupy -> troop_heal -> march_move -> resource_gather` 的发育循环。
- Godot 主界面 AI overlay 的提案/回执详情保持“资源 / 目标 / 风险 / 批准后结果”四块玩家文案，并补齐占地、整补、行军目标说明。
- 新增地图可视化表达草案文档，先定义 AI 势力、部队、行动意图、资源占领状态的视觉合同，不碰 world-cell 渲染。

## 验证命令

- `npm run build`：通过。
- `npm run test:ai:runtime-prompt-contract`：通过。
- `npx tsx server/tests/ai_player_backend_knowledge_graph.test.ts`：通过。
- `npm run test:ai:player-http-core-contract`：通过。
- `npx tsx server/tests/ai_player_development_plan_http_contract.test.ts`：通过。
- `npx tsx server/tests/ai_player_http_tile_occupy_contract.test.ts`：通过。
- `npx tsx server/tests/ai_player_http_troop_heal_contract.test.ts`：通过。
- `npm run gate:ai:preflight`：通过。
- `npm run test:ai:player-http-chat-command-contract`：通过。
- `npm run test:ai:player-http-contract`：通过，包含新增 `tile_occupy / troop_heal` shard。
- `npx tsx server/tests/ai_player_http_battle_report_read_contract.test.ts`：通过。
- `npm run godot:headless:smoke`：通过；Godot 输出既有 `ObjectDB instances leaked` warning，但命令退出码为 0。
- `npm run build`：本轮通过。
- `npx tsx server/tests/ai_player_development_plan_http_contract.test.ts`：本轮通过。
- `npm run test:ai:player-http-contract`：本轮通过，包含 `battle_report_read` shard。
- `npm run gate:ai:preflight`：本轮通过。

## 剩余主赛项

- AI 管理页/主界面后续可消费 `/battle-reports` 的战报 read-model，但本轮不把它做成可执行 action。
- Godot proposal 详情可以继续消费 `development-plan.candidateActions[].proposalArgs`，保持“资源 / 目标 / 风险 / 批准后结果”四块。
- 地图可视化表达下一步只做最小 contract 接线：AI 部队徽标、占地归属、行动意图，不做 world-cell 美术微调。
- 玩家/势力分账阶段再接 `/api/faction/:id/model-config` 保存 UI，不显示明文 key。

## 风险项

- `tile_occupy` v1 不处理战斗、城池围攻、迷雾和敌占地；这些会正式失败或保持后续 authority。
- `troop_heal` v1 不处理征兵队列、伤兵池、武将体力和战法冷却，只恢复 strength/supply。
- `development-plan.currentDevelopmentPoints` 仍使用当前 read-model 估算，不是最终赛季势力公式。
- `battle_report_read` 当前只读已有 `feedback.battleRecords`，不伪造战斗、不自动触发补兵。
- 当前主工作树仍有大量非本窗口脏文件和未跟踪资源，不能做清污、回滚或全仓格式化。

## 阻塞项

- 地图可视化还只是草案文档，尚未进入 Godot 地图层正式实现。
- Godot overlay 需要用正式 smoke/截图继续确认玩家路径，但本轮不扩大到地图渲染。

## 下一轮优先级

1. 让 AI 管理页或主界面按需读取 `/battle-reports`，展示最近战报和损伤建议。
2. 将地图可视化草案拆成最小 Godot contract，不进入 world-cell 美术细调。
3. 若要继续推进发育闭环，优先做“战报建议 -> troop_heal 提案 -> march_move/tile_occupy 下一步”的自动提示。

## 2026-04-27 本轮追加

### 本轮完成

- Godot HTTP client 已新增 `get_ai_player_battle_reports()`，AI runtime 刷新时会读取 `/api/ai/players/:id/battle-reports` 并保存 `playerRuntimeBattleReportReadModel / playerRuntimeBattleReportItems`。
- AI 管理页玩家页已展示“最近战报 / 损伤 / 建议 / 战报下一步”，并新增“按战报补兵 / 按建议行军 / 按建议占地”按钮，按钮会走正式 proposal create endpoint。
- 战报跟进提案优先复用 `development-plan.candidateActions[].proposalArgs`；`troop_heal` 在 planner 没有参数时可从最近 AI 相关战报回退到 `attackerUnitId`。
- Godot 地图层已加入最小 AI 地图表达：AI 管辖部队显示 AI 身份徽标；pending/approved 的 `march_move / tile_occupy / resource_gather` proposal 会画目标地块意图环；已占资源地和已采集地块显示状态 marker。

### 验证命令

- `git diff --check -- godot-client/scripts/infra/http/backend_api_client.gd godot-client/scripts/app/adapters/slg_domain_action_adapter.gd godot-client/scripts/ui/presenters/ai_panel_presenter.gd godot-client/scripts/map/unit_view_layer.gd godot-client/scripts/map/ai_map_intent_marker.gd`：通过。
- `npm run build`：通过。
- `npx tsx server/tests/ai_player_http_battle_report_read_contract.test.ts`：通过。
- `npx tsx server/tests/ai_player_development_plan_http_contract.test.ts`：通过。
- `npm run gate:ai:preflight`：通过。
- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。

### 剩余主赛项

- 需要在真实运行态做一次截图或录屏，确认 AI 意图环、占地/采集 marker 与玩家主界面不互相遮挡。
- `battle_report_read -> troop_heal -> march_move/tile_occupy` 现在可生成 proposal，但仍需要通过玩家审批执行后再形成连续闭环证据。

### 风险项

- 最小地图 marker 当前只消费已有 proposal、占地和采集状态，不做路径预览、不做战斗预测、不处理敌占地压力可视化。
- 同势力 AI 部队徽标依赖 world unit 的 `aiPlayerId` 字段；如果后端快照没有写入该字段，只能显示普通本势力部队样式。

### 阻塞项

- 真实玩家路径仍缺一张 Godot 运行截图：AI 管理页战报卡、战报跟进 proposal、地图意图 marker 需要在同一后端状态下做联调证据。

### 下一轮优先级

1. 用临时后端状态跑一条“战报建议 -> troop_heal 提案 -> 审批执行 -> receipt -> 聊天/管理页可见”的完整录屏或截图链。
2. 若截图确认 marker 过密，再只做密度/开关级别调整，不进入 world-cell 美术微调。

## 2026-04-27 战报跟进玩家路径证据

### 本轮完成

- 新增 `tmp/run_ai_battle_report_followup_evidence.ts` 与 `tmp/ai_battle_report_followup_capture.gd` 作为临时联调证据脚本；脚本只放在 `tmp/`，不可作为正式交付入口。
- 临时后端隔离状态已跑通真实路径：`GET /api/ai/players/:id/battle-reports` 读出高损失败战报 -> 创建并审批执行 `troop_heal` -> receipt 返回 `worldAction=healTroop` -> 创建并审批执行 `tile_occupy` -> receipt 返回 `worldAction=occupyTile` 且目标地块 owner 变为 `player` -> 再创建 pending `march_move` 作为下一步玩家审批项。
- Godot AI 管理页截图已显示“最近战报 / 建议 / proposal 历史”：`troop_heal` 与 `tile_occupy` 为 executed，`march_move` 为 pending_approval。
- Godot 地图截图已显示最小 AI 地图表达：AI 管辖部队徽标、蓝色目标意图环、绿色已占资源地、金色已采集地块。当前证据里 marker 不密集，未新增额外视觉微调。
- 修复 `SlgSnapshotPanel` 首次灌入 snapshot 时 section page 尚未入树导致的 onready 空节点问题；现在先挂载内容节点，再设置 page payload。

### 验证命令

- `npx tsx tmp/run_ai_battle_report_followup_evidence.ts`：通过；生成 `tmp/screenshots/ai_battle_report_followup_evidence/evidence_summary.json` 与两张截图。
- `npx tsx server/tests/ai_player_http_tile_occupy_contract.test.ts`：通过。
- `npm run build`：通过。
- `npx tsx server/tests/ai_player_http_battle_report_read_contract.test.ts`：通过。
- `npx tsx server/tests/ai_player_http_troop_heal_contract.test.ts`：通过。
- `npx tsx server/tests/ai_player_http_tile_occupy_contract.test.ts`：通过。
- `npx tsx server/tests/ai_player_http_movement_contract.test.ts`：通过。
- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `git diff --check -- godot-client/scripts/map/unit_view_layer.gd godot-client/scripts/ui/slg_snapshot_panel.gd tmp/run_ai_battle_report_followup_evidence.ts tmp/ai_battle_report_followup_capture.gd`：通过。
- UTF-8 回读与 touched files secret scan：通过，未发现用户 relay key 明文。

### 剩余主赛项

- 把这条临时证据脚本沉淀为正式 gate 或复用已有 Godot week gate 的一个 AI 路径 shard。
- 聊天流侧还可以补“战报建议 -> 已补兵 -> 已占地 -> 下一步行军待审批”的聚合玩家消息，但本轮 AI 管理页和地图证据已可看懂。

### 风险项

- 地图截图仍会输出既有 world-cell reserved footprint warning；本轮未进入 world-cell 美术或布局微调。
- 临时证据脚本依赖构造的隔离世界状态，不等同于长线存档迁移 gate。

### 阻塞项

- 暂无新的 authority 阻塞；下一步主要是把证据路径纳入正式自动化入口，并补聊天侧聚合提示。

### 下一轮优先级

1. 将 `battle_report_read -> troop_heal -> tile_occupy -> march_move pending` 证据链整理成正式 contract/gate shard。
2. 给主界面聊天流补一条玩家可读聚合回执，说明“已补兵、已占地、下一步行军待批准”。
3. 若后续地图 marker 变多，只加开关或数量上限，不做 world-cell 美术微调。

## 2026-04-27 正式 gate 与聊天聚合回执

### 本轮完成

- 新增正式 HTTP contract：`server/tests/ai_player_http_battle_report_followup_contract.test.ts`。
- 该 contract 已覆盖正式玩家路径：`battle_report_read -> troop_heal -> tile_occupy -> march_move pending`。
- 新 gate 已加入 `npm run test:ai:player-http-battle-report-followup-contract`、`npm run test:ai:player-http-contract` shard，以及 `npm run gate:ai:preflight`。
- 直接创建 proposal 时会写入 AI 聊天流；当后端检测到同一 AI 已有成功 `troop_heal` receipt、成功 `tile_occupy` receipt，并生成待审批 `march_move` proposal 时，会追加聚合回执：`已补兵、已占地，下一步行军待批准。`
- 聊天聚合回执使用 `metadata.aggregateKind=battle_report_followup`，主界面聊天按既有 receipt 卡片展示，不新增 world-cell 视觉逻辑。

### 验证命令

- `npx tsx server/tests/ai_player_http_battle_report_followup_contract.test.ts`：通过。
- `npm run test:ai:player-http-battle-report-followup-contract`：通过。
- `npx tsx server/tests/ai_player_http_chat_command_contract.test.ts`：通过。
- `npm run build`：通过。
- `npm run test:ai:player-http-contract`：通过，包含新增 battle followup shard。
- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `npm run gate:ai:preflight`：通过，已包含新增 battle followup gate。

### 剩余主赛项

- 如果主界面要更强反馈，可在聊天 overlay 对 `metadata.aggregateKind=battle_report_followup` 加轻量 toast 或置顶提示；当前已能在聊天流看到正式聚合回执。
- `tmp/run_ai_battle_report_followup_evidence.ts` 仍只是截图证据脚本，不作为正式入口；正式入口已迁移到 `server/tests`。

### 风险项

- 聚合回执当前按 chat/proposal/receipt 状态判断，不做战斗预测，也不伪造 battle report。
- marker 数量仍沿用当前最小限制；本轮没有新增 world-cell 美术微调。

### 阻塞项

- 暂无本轮新增阻塞。

### 下一轮优先级

1. 视玩家反馈决定是否给 `battle_report_followup` 聚合回执加轻量 toast。
2. 继续把 pending `march_move` 的玩家审批路径接到更完整的地图目标说明。
3. 若 marker 变密，只加开关或数量上限。

## 2026-04-27 march_move 批准后聚合提示与地图目标对齐

### 本轮完成

- `march_move` 批准执行成功后，后端除正常 receipt 外会在 AI 聊天流追加聚合回执：`已行军到目标地。`
- `battle_report_read -> troop_heal -> tile_occupy -> march_move pending -> approve/execute march_move` 已纳入正式 followup contract；contract 断言部队最终落到 `targetTileId`。
- Godot 主界面聊天 proposal 详情把 `march_move` 显示为“行军到目标地”，并在目标说明里写明“地图目标地块 / 地图意图环”，避免玩家只看到动作名。
- 地图 AI marker 只新增密度控制：pending/approved 意图 marker 上限 12，资源状态 marker 继续使用统一上限 24；未改 world-cell 美术。

### 验证命令

- `npx tsx server/tests/ai_player_http_battle_report_followup_contract.test.ts`：通过。
- `npm run test:ai:player-http-battle-report-followup-contract`：通过。
- `npm run build`：通过。
- `npx tsx server/tests/ai_player_http_chat_command_contract.test.ts`：通过。
- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `npm run test:ai:player-http-contract`：通过，包含新增 followup shard。
- `npm run gate:ai:preflight`：通过。

### 剩余主赛项

- 继续把更多玩家自然语言命令落到可执行 proposal，而不是扩大 UI 美术范围。
- 让地图目标说明、proposal 详情和回执文案保持同一套玩家语义。

### 风险项

- 当前 `已行军到目标地。` 是聊天聚合提示，不等同于自动触发下一步占地或采集；下一步仍需要 proposal/审批。
- marker 密度控制是固定上限，后续如果玩家需要区域聚合或开关，再做独立 UI 控制，不进入 world-cell 美术微调。

### 阻塞项

- 暂无本轮新增阻塞。

### 下一轮优先级

1. 把下一条 `tile_occupy` 或 `resource_gather` 的推荐理由继续和地图目标说明对齐。
2. 若用户要截图证据，再用既有临时截图脚本复跑，不把临时脚本当正式 gate。

## 2026-04-27 目标说明与 AI 管理页可读化

### 本轮完成

- `development-plan` 中 `march_move / tile_occupy / resource_gather` 的 `reason / proposalReason` 已显式带上地图目标地块，避免模型、聊天和管理页只看到动作名。
- `march_move` ready 候选现在会输出 `proposalArgs / proposalReason / targetUnitId / targetTileId`，便于 Godot 和聊天详情直接展示“部队 -> 地图地块 -> 批准后结果”。
- AI 管理页 proposal 卡片、候选动作卡片和发育主赛项卡片改为中文动作名；描述里补充目标部队、地图目标地块和执行后结果。
- 复跑临时截图证据：AI 管理页已能看到“行军到目标地 / 占领地图目标地块 / 整补部队”等中文卡片；地图证据仍只显示 AI 部队徽标、目标意图环、占地/采集状态，未做 world-cell 美术改动。

### 验证命令

- `npx tsx server/tests/ai_player_development_plan_http_contract.test.ts`：通过。
- `npm run build`：通过。
- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `npx tsx tmp/run_ai_battle_report_followup_evidence.ts`：通过；生成截图于 `tmp/screenshots/ai_battle_report_followup_evidence/`，该脚本是临时证据入口，不作为正式 gate。
- `npm run test:ai:player-http-contract`：通过。
- `npm run gate:ai:preflight`：通过。

### 剩余主赛项

- 若要把“已行军到目标地”也做成可截图的聊天 overlay 证据，需要扩展临时截图脚本去打开主界面聊天 overlay；正式链已由 contract 覆盖。

### 风险项

- AI 管理页截图来自 tmp 证据脚本，适合作为人工确认，不替代正式 gate。
- world-cell reserved footprint warning 仍来自既有地图运行时，本轮未进入该 lane。

### 阻塞项

- 暂无本轮新增阻塞。

### 下一轮优先级

1. 如需可视证据，补一个只读聊天 overlay 截图脚本，展示 `已补兵、已占地` 与 `已行军到目标地` 聚合回执。
2. 继续把模型 proposal 的自然语言理由压成玩家能懂的目标/风险/结果句式。

## 2026-04-27 聊天回执截图与模型四块理由

### 本轮完成

- `tmp/ai_battle_report_followup_capture.gd` 增加主界面聊天 overlay 截图，默认切到“回执”筛选。
- `tmp/run_ai_battle_report_followup_evidence.ts` 扩展为完整证据链：战报建议 -> `troop_heal` -> `tile_occupy` -> pending `march_move` 聚合回执 -> 批准执行 `march_move` -> `已行军到目标地。` 聚合回执。
- 截图证据已生成：
  - `tmp/screenshots/ai_battle_report_followup_evidence/01_after_tile_occupy_pending_march_chat_receipts.png`
  - `tmp/screenshots/ai_battle_report_followup_evidence/02_after_march_executed_chat_receipts_chat_receipts.png`
- 模型 proposal prompt 已要求 `reason` 使用四块玩家语言：`资源：...；目标：...；风险：...；批准后结果：...`。
- live model gate 增加 `proposal_reason_player_four_blocks` 检查；只有每个 proposal.reason 都包含四块 token 才算通过。

### 验证命令

- `npx tsx server/tests/ai_player_runtime_prompt_contract.test.ts`：通过。
- `npx tsx server/tests/ai_player_runtime_model_proposal_contract.test.ts`：通过。
- `npx tsx server/tests/ai_player_http_model_proposal_contract.test.ts`：通过。
- `npm run gate:ai:live-model-proposal`：安全跳过；原因是本机没有 `AI_PLAYER_RUNTIME_MODEL_API_KEY` / `LLM_RELAY_API_KEY` 临时环境变量。未写入、未回显 secret。
- `npx tsx tmp/run_ai_battle_report_followup_evidence.ts`：通过；生成聊天 overlay 截图和地图/管理页截图。该脚本仍是临时证据入口，不作为正式 gate。
- `npm run build`：通过。
- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `npm run gate:ai:preflight`：通过。
- `npm run test:ai:player-http-contract`：通过。

### 剩余主赛项

- 若要做真实中转站 live 试验，需要在本机当前进程或父环境临时注入 `AI_PLAYER_RUNTIME_MODEL_API_KEY` 或 `LLM_RELAY_API_KEY`；不能把 key 写入仓库或命令历史。

### 风险项

- `tmp` 截图脚本为人工证据入口；正式闭环仍由 `server/tests` 与 `gate:ai:preflight` 覆盖。
- world-cell reserved footprint warning 仍来自既有地图运行时，本轮未进入 world-cell 美术 lane。

### 阻塞项

- live relay 真请求未执行，唯一原因是本机环境变量没有 secret。

### 下一轮优先级

1. 用户临时注入 relay key 后，跑 `npm run gate:ai:live-model-proposal` 验证真实模型 raw JSON 和四块 reason。
2. 把四块 reason 继续传递到 Godot proposal 详情弹窗，减少 “AI 说明” 的重复文本。

## 2026-04-27 Godot 聊天移动端与四块详情去重

### 本轮完成

- Godot 主界面聊天 overlay 中 proposal 详情不再追加 `AI 说明`，优先解析 `资源 / 目标 / 风险 / 批准后结果` 四块作为唯一正文入口。
- 主界面聊天筛选按钮去掉数字统计；状态文案明确“聊天主要用于下达命令，完整统计留在 AI 管理页”，避免把 AI 管理页职责挤进聊天。
- 手机宽度下聊天面板、频道栏和 proposal 详情弹窗改为自适应；消息正文、输入框、详情正文的字号上调。
- 聊天输入行显式显示 `输入给当前 AI 的命令 / 语音 / 发给 AI`；语音入口当前仅预留，不接真实语音识别。
- 回执卡片清理后端 null 空值，补充 `healTroop / occupyTile / moveUnit / gatherAiResourceTile` 的中文动作名。
- 临时截图证据增加 proposal 详情截图，覆盖移动端聊天回执与详情弹窗。

### 验证命令

- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `npx tsx tmp/run_ai_battle_report_followup_evidence.ts`：通过；生成移动端聊天 overlay、proposal 详情、地图和管理页截图。该脚本仍是临时证据入口，不作为正式 gate。
- `npm run build`：通过。

### 剩余主赛项

- 若要正式语音输入，需要另开语音采集/权限/ASR contract；本轮只做 UI 入口预留。
- 真实 relay live gate 仍需通过临时环境变量注入 secret 后再跑，不能落盘。

### 风险项

- 当前聊天 overlay 仍保留提案/回执筛选作为轻量追踪；AI 管理页才承载完整统计、候选动作和失败原因。
- 移动端截图为 390x844 证据，后续还应在真实手机分辨率和 Godot 触控输入上做一次人工复核。
- world-cell reserved footprint warning 仍来自既有地图运行时，本轮未进入 world-cell 美术 lane。

### 阻塞项

- 语音输入未接真实录音或 ASR。
- live relay 真请求未执行，原因仍是本机环境变量未注入 secret。

### 下一轮优先级

1. 若用户要继续移动端体验，优先把聊天 overlay 的按钮触控尺寸和软键盘遮挡做一次真机/模拟器复核。
2. 用户临时注入 relay key 后，跑 `npm run gate:ai:live-model-proposal` 验证真实模型只输出 JSON proposal 和四块 reason。

## 2026-04-27 Relay 密钥注入与聊天软键盘安全区

### 本轮完成

- 新增 `scripts/Run-AiLiveModelProposalGate.ps1`，通过交互式隐藏输入临时设置 relay 环境变量，运行结束后恢复原环境；不把 key 写入命令历史、仓库或日志。
- 新增 `docs/AI_PLAYER_VOICE_COMMAND_DEFERRED_2026_04_27.md`，把语音输入明确列为后续 ASR contract：录音入口 -> ASR 文本 -> 复用现有自然语言命令链。
- Godot 主界面聊天 overlay 增加软键盘安全区处理：输入框聚焦时读取虚拟键盘高度，底部加入安全 spacer，并把消息滚动到底部。
- Godot 主界面聊天 overlay 的频道按钮、筛选按钮、语音按钮和发送按钮统一提高到 44px 触控高度；竖屏截图验证输入行没有被模拟软键盘遮挡。
- `tmp/run_ai_battle_report_followup_evidence.ts` 增加软键盘安全区截图断言，作为移动端路径证据。

### 验证命令

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Run-AiLiveModelProposalGate.ps1 -ValidateOnly`：通过；只验证 helper 就绪，不请求 secret。
- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `npx tsx tmp/run_ai_battle_report_followup_evidence.ts`：通过；生成聊天 overlay、proposal 详情、软键盘安全区、地图和管理页截图。该脚本仍是临时证据入口，不作为正式 gate。
- `npm run build`：通过。

### 剩余主赛项

- 真实 relay live gate 需要用户在交互式提示中临时输入 key 后运行 helper；本轮没有把 key 写入命令或文件。
- 移动端真机/模拟器还需要人工复核软键盘行为、触控尺寸和竖屏滚动。

### 风险项

- Godot headless 只能用调试高度模拟软键盘，不能完全替代 Android/iOS 真实软键盘。
- 语音输入已归档为未实现 contract，当前按钮只作为入口预留。

### 阻塞项

- live relay 真请求尚未执行；需要通过隐藏输入方式临时注入 secret。
- ASR provider、音频格式、时长限制和权限失败提示尚未定型。

### 下一轮优先级

1. 通过 `scripts/Run-AiLiveModelProposalGate.ps1` 跑真实 relay live gate，确认模型只输出 JSON proposal。
2. 用模拟器或真机打开主界面聊天 overlay，复核软键盘遮挡、触控尺寸和竖屏滚动。
3. 若复核通过，再把语音输入 contract 进入后续 ASR 实现阶段。

## 2026-04-27 主界面聊天气泡化与长命令输入

### 本轮完成

- Godot 主界面聊天 overlay 从工程卡片式消息改为群聊式消息流：真人/总督消息右侧展示，AI/提案左侧展示，带头像位和姓名；系统/回执弱化为居中提示卡。
- 移动端输入框从 `LineEdit` 改为 `TextEdit`：支持多行、自动增高到上限、长文本在输入框内部滚动；发送按钮继续复用同一条自然语言命令链。
- 移动端 composer 改为两行：输入框独占一行，`语音 / 发送` 按钮在下一行，避免长命令被按钮挤到过窄。
- 聊天读取失败做了去重：同一 AI/筛选/错误不再连续刷多条失败消息，只保留状态和一次系统提示。
- 重启了 Godot 主线运行时窗口，当前可见窗口为 `SLG Commander Godot Client (DEBUG)`。

### 验证命令

- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `npx tsx tmp/run_ai_battle_report_followup_evidence.ts`：通过；生成聊天气泡、proposal 详情、长命令软键盘安全区、地图和管理页截图。该脚本仍是临时证据入口，不作为正式 gate。

### 剩余主赛项

- 需要用户在新打开的 Godot runtime 里确认群聊式消息流是否更像真人/AI 对话。
- 若确认方向正确，下一步再把 AI 头像来源接到 AI 管理页的头像/名称配置，而不是固定首字头像。

### 风险项

- 当前头像是首字/“我”的最小表达，还不是玩家自定义头像资源。
- 系统/回执仍是居中提示卡；如果后续希望“AI 亲口汇报执行结果”，需要后端把聚合回执映射成 AI authorType 消息。

### 阻塞项

- 真机软键盘、手指拖动长文本输入的体验仍需用户在运行时窗口或后续模拟器里实测确认。

### 下一轮优先级

1. 根据用户实测反馈，调整气泡宽度、头像位置、系统回执是否改由 AI 口吻展示。
2. 如果移动端输入确认可用，再接 AI 头像/昵称配置来源。

## 2026-04-27 聊天半屏透明覆盖与 AI 巡查口吻

### 本轮完成

- 主界面聊天 overlay 桌面宽度从约 44% 调整到约 50%，最大宽度提升到 760，便于承载长文本和多人频道。
- 聊天 panel、频道栏和消息区降低不透明度，作为主界面半透明覆盖层，实际运行时可以隐约看到被遮住的主界面内容。
- AI 头像从单字色块升级为角色徽章：显示 `AI` 与 `后勤/斥候/军务/助手` 角色短标；真人仍显示 `我/总督`。
- AI 频道本地预览去掉第三方“战况”播报，改为 AI 自己巡查后的汇报口吻。
- 回执不再作为居中系统卡展示，改为 AI 左侧气泡汇报，避免“第三方系统插话”的观感。
- 聊天标题副文案改为 `AI 巡查频道 / 定期激活 / 总督 ...`，先把“AI 定期激活巡查”作为玩家可理解的交互形态暴露出来。
- 临时截图证据增加 `desktop_half_overlay`，用于验证桌面半屏覆盖宽度。

### 验证命令

- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `npx tsx tmp/run_ai_battle_report_followup_evidence.ts`：通过；生成半屏桌面 overlay、移动端气泡、长命令软键盘安全区、地图和管理页截图。该脚本仍是临时证据入口，不作为正式 gate。

### 剩余主赛项

- 后端还缺正式 `AI 定期激活 / 巡查 tick`：应由 runtime 定时读取周边世界、战报、资源、行动点，生成 AI 自述消息或 proposal，而不是只等真人输入。
- 若要更像“真人 AI 玩家”，下一步应把聚合回执与巡查摘要都写成 AI authorType 消息，并保留 receipt/proposal metadata 供详情按钮读取。

### 风险项

- 现在的头像仍是 UI 生成的角色徽章，不是玩家/AI 自定义头像资源。
- 桌面截图证据使用临时截图场景，背景不是完整主界面；透明效果需要在正式 Godot runtime 里目测确认。

### 阻塞项

- 定期激活巡查还没有 backend scheduler / tick contract。
- 巡查消息的来源范围、冷却、预算、是否需要审批，还未形成正式规则。

### 下一轮优先级

1. 接 `AI patrol tick` contract：读取世界 -> 生成巡查摘要/候选 proposal -> 写入 AI 聊天频道。
2. 把 receipt 聚合回执在后端改为 AI 口吻消息，UI 继续按 AI 气泡显示。
3. 接 AI 管理页头像/角色配置，替代当前 UI 生成徽章。

## 2026-04-27 AI 巡查 contract、频道修正与头像接入

### 本轮完成

- 主界面聊天频道按最新口径修正：`世界` 显示为 `事件`，`本州` 显示为 `本周`，移除 `本县`，保留 `同盟` 与独立 AI 频道。
- 新增 `POST /api/ai/players/:id/chat/patrol-tick`：只读 runtime、development-plan、battle-report read model，写入 `authorType=ai` 的巡查消息；不创建、不审批、不执行 world proposal。
- Godot 聊天 overlay 增加 `巡查` 按钮，调用正式 patrol tick endpoint；巡查摘要、执行回执和通用收件箱领取回执继续按 AI 气泡展示。
- 执行 receipt 写回聊天流统一为 AI 作者消息，包含普通执行、失败、聚合与 inbox claim receipt。
- 从 `portrait_assets/locked_images` 生成 26 张 AI 聊天头像，排除 `sun_quan_succession_entrustment_v1_locked.png`；新增头像 manifest 并接入主界面 AI 气泡与 AI 管理页卡片。
- Godot 头像读取改为 `Image.load()` -> `ImageTexture`，避免新 PNG 未经 Godot import 时 `load(res://*.png)` 报 loader 错误。
- 临时截图证据脚本补了回执列表滚动到底部，能展示“已补兵、已占地、下一步行军待批准”和“已行军到目标地”。

### 验证命令

- `npx tsx server/tests/ai_player_http_chat_patrol_tick_contract.test.ts`：通过。
- `npm run test:ai:player-http-chat-command-contract`：通过。
- `npm run build`：通过。
- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `npx tsx tmp/run_ai_overlay_backend_capture.ts`：通过；生成 AI 聊天、通用收件箱、proposal/receipt 详情截图。临时证据入口，不作为正式 gate。
- `npx tsx tmp/run_ai_battle_report_followup_evidence.ts`：通过；生成战报建议 -> 补兵 -> 占地 -> 行军完成的聊天/管理页/地图截图。临时证据入口，不作为正式 gate。
- UTF-8 回读：通过。
- touched files secret scan：通过，未发现 secret-like key 或 relay key 明文。

### 剩余主赛项

- patrol tick 目前是手动触发 contract；后续还需要 scheduler/冷却/预算，形成真正定期激活。
- AI 头像已经有 26 张候选和 manifest，但 AI 管理页还缺正式“选择/保存头像”配置入口。
- 真实 relay live gate 仍需用户临时注入 secret 后执行，确认模型只输出 JSON proposal。

### 风险项

- 当前仓库仍是多窗口脏工作树，本轮只碰 AI 玩家与 Godot overlay 白名单文件，未清理无关 dirty/untracked。
- `tmp/run_ai_battle_report_followup_evidence.ts` 运行时会输出既有 world-cell reserved footprint conflict warnings；本轮没有进入 world-cell 视觉或布局修正。
- 新增通用卡片 `image_path` 渲染器会影响使用同一 `SlgSnapshotSectionPage` 的其他页面，但只有带 `image_path` 的卡片才显示图片，默认路径为空。

### 阻塞项

- 自动巡查还缺正式定时触发策略。
- 玩家/势力分账的 BYOK 保存 UI 仍按既定策略后置，当前只展示接入状态，不显示明文。

### 下一轮优先级

1. 给 patrol tick 增加最小 scheduler/冷却 gate，确保不会刷屏，也不会绕过 proposal 审批。
2. 在 AI 管理页补头像选择/保存 contract，沿用 26 张头像 manifest。
3. 用户临时注入 relay key 后，跑真实 `gate:ai:live-model-proposal`，确认 JSON-only proposal。

## 2026-04-27 Patrol 冷却、AI 头像 profile 与 live gate 注入口

### 本轮完成

- `POST /api/ai/players/:id/chat/patrol-tick` 增加 `triggerMode=manual|scheduler`、`cooldownTicks`、`force`；冷却中返回 `patrol_cooldown_active`，不会重复写巡查消息。
- 巡查消息 metadata 记录 `manual_patrol_tick` / `scheduler_patrol_tick`、`cooldownUntilTick`、`cooldownTicks`，便于 UI 和日志解释来源。
- AI profile contract 增加 `avatarId`、`avatarImagePath`；`/api/ai/players/:id/profile` 支持只更新头像，不要求同时改名。
- Godot AI 管理页增加“选择 AI 头像”入口，读取 `res://data/ai_chat_portraits.json`，保存头像到正式 profile。
- AI 管理页卡片与主界面聊天 overlay 会优先使用 profile 返回的头像路径，再回退到 manifest 默认头像。

### 验证命令

- `npm run build`：通过。
- `npx tsx server/tests/ai_player_http_chat_patrol_tick_contract.test.ts`：通过。
- `npx tsx server/tests/ai_player_http_core_contract.test.ts`：通过。
- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `npm run gate:ai:preflight`：通过。
- `npm run gate:ai:live-model-proposal`：未执行；当前进程没有 `AI_PLAYER_RUNTIME_MODEL_API_KEY` 或 `LLM_RELAY_API_KEY` 临时环境变量。为避免把 relay key 写进命令、仓库或日志，本轮只做安全缺省跳过。

### 剩余主赛项

- 真实 relay live gate 需要从外部临时环境注入 key 后执行，确认中转站模型只输出 JSON proposal。
- patrol tick 已有冷却 gate，但还缺长期 scheduler 运行器入口；当前仍由按钮或 HTTP 调用触发。

### 风险项

- 当前仓库仍是多窗口脏工作树，本轮只增量修改 AI 玩家和 Godot AI 面板白名单文件，未清理无关 dirty/untracked。
- 头像保存 contract 只保存 `avatarId/avatarImagePath`，还没有玩家上传自定义头像、裁剪或审核流程。

### 阻塞项

- 缺一个安全 secret 注入方式让 Codex runner 不在命令文本里出现 key；需要用户在外部 shell 设置临时环境变量后再跑 live gate。
- 真正后台定时 scheduler 需要后续接入 runtime tick 或服务级周期任务，本轮只完成冷却 gate 与 scheduler 触发模式 contract。

### 下一轮优先级

1. 在外部临时环境变量已存在时执行 `npm run gate:ai:live-model-proposal`。
2. 接 patrol tick 的后台 scheduler 运行器，复用本轮冷却 gate。
3. 做一张 AI 管理页头像选择和主界面聊天头像生效的截图证据。

## 2026-04-27 Patrol Scheduler 正式入口

### 本轮完成

- 新增 `POST /api/ai/chat/patrol-scheduler/run` 正式入口：按 `aiPlayerIds/governorPlayerId/factionId/limit` 筛选 AI 玩家，逐个以 `triggerMode=scheduler` 触发 patrol tick。
- scheduler 复用 patrol 冷却 gate；冷却中的 AI 返回 `patrol_cooldown_active` 并计入 `skippedCount`，不会重复写聊天消息。
- 新增可选后台定时器：`AI_PLAYER_CHAT_PATROL_SCHEDULER_ENABLED=1` 时启动，默认关闭；可用 `AI_PLAYER_CHAT_PATROL_SCHEDULER_INTERVAL_MS / COOLDOWN_TICKS / LIMIT` 调整。
- graceful shutdown 会停止 AI patrol scheduler，避免后台 timer 挂住进程。
- 真实 relay live gate 已通过：`claude-sonnet-4-6` 在 `https://xiamiapi.xyz` 上返回 strict raw JSON proposal，`strictRawJsonOnly=true`，proposalCount=1。
- `claude-haiku-4-5-20251001` 在同一 relay 上可生成合法 proposal，但会把 JSON 包进 markdown fence；后端能 normalization 解析，但 strict live gate 判失败。

### 验证命令

- `npm run build`：通过。
- `npx tsx server/tests/ai_player_http_chat_patrol_tick_contract.test.ts`：通过；覆盖手动巡查、冷却拒绝、强制 scheduler、scheduler run 冷却跳过与强制写入。
- `npm run gate:ai:preflight`：通过。
- `npm run gate:ai:live-model-proposal` with `AI_PLAYER_RUNTIME_MODEL=claude-haiku-4-5-20251001`：失败；唯一失败项为 `strict_raw_json_only`，normalization=`markdown_fence_after_retry`。
- `npm run gate:ai:live-model-proposal` with `AI_PLAYER_RUNTIME_MODEL=claude-sonnet-4-6`：通过；`strictRawJsonOnly=true`。

### 剩余主赛项

- scheduler 默认关闭，后续要决定正式运行环境是否打开 `AI_PLAYER_CHAT_PATROL_SCHEDULER_ENABLED=1`。
- 严格 JSON-only 运行模型建议先用 `claude-sonnet-4-6`；若坚持最低成本 Haiku，需要接受 markdown fence normalization 或继续找 relay/model 参数。

### 风险项

- scheduler 目前只生成 AI 巡查消息和候选摘要，不自动创建/审批/执行 proposal；这是为了保持后端审批边界。
- 多 AI 同时巡查时，冷却 gate 已防刷屏，但频道消息增长仍需要后续观察持久化体积。
- Haiku 的 strict JSON-only 行为不满足 gate，不能作为严格 live gate 默认模型。

### 阻塞项

- 后续若要让 scheduler 自动创建提案，需要单独增加预算/审批策略，不应复用巡查入口直接执行动作。
- 需要决定默认 runtime 模型策略：低成本 Haiku + normalization，或严格 Sonnet。

### 下一轮优先级

1. 决定默认 runtime 模型策略：严格 JSON-only 用 `claude-sonnet-4-6`，还是继续保留 Haiku 作为低成本 normalization 模式。
2. 做 AI 管理页头像选择与主界面聊天头像生效截图证据。
3. 决定正式环境是否默认开启 patrol scheduler，或先只保留 HTTP 手动触发。

## 2026-04-27 Runtime Model Strategy Lock

### 本轮完成

- AI runtime 默认模型策略已定：会改世界的正式 JSON proposal 默认 `claude-sonnet-4-6`，因为该模型已通过 strict raw JSON-only live gate。
- `claude-haiku-4-5-20251001` 保留为可手动指定的低成本候选；当前不再作为默认 action proposal 模型。
- 新增策略文档：`docs/AI_PLAYER_RUNTIME_MODEL_STRATEGY_2026_04_27.md`，明确多模型后续方向和 patrol scheduler 口径。
- `aiPlayerRuntimeModelTarget` 导出 `DEFAULT_AI_PLAYER_RUNTIME_MODEL`，AI runtime view 与 live gate helper 已同步默认模型。
- 新增 `server/tests/ai_player_runtime_model_target_contract.test.ts`，验证默认模型、默认 relay base URL、env override 和 secret env source。

### 验证命令

- 待本轮跑：`npm run build`
- 待本轮跑：`npm run test:ai:runtime-model-target-contract`
- 待本轮跑：`npm run test:ai:player-http-core-contract`
- 待本轮跑：`npm run gate:ai:live-model-proposal`

### 剩余主赛项

1. 截 AI 管理页头像选择弹窗证据。
2. 截主界面聊天 AI 气泡头像生效证据。
3. 继续保持 patrol scheduler app 内默认关闭，正式环境先使用 HTTP/manual 或外部 scheduler 分片触发。

### 风险项

- 当前高并发多模型路由层尚未实现；现阶段只是单 active model + env override。
- app 内 scheduler 如果直接开启，在几千 AI 玩家规模会放大模型请求峰值，必须等队列/限流/分片策略完成后再作为生产默认。

### 阻塞项

- 玩家/势力 BYOK 保存 UI 仍按既定计划留到分账阶段；当前 AI 管理页只显示接入状态，不显示明文 key。

### 下一轮优先级

1. 跑正式验证和 live gate。
2. 生成 AI 管理页头像选择与主聊天头像截图。
3. 如截图证据不足，仅补 visual-smoke 专用开关，不做 UI 美术扩展。

## 2026-04-27 Runtime Model / Avatar Evidence Closeout

### 本轮完成

- AI runtime 默认模型已切到 `claude-sonnet-4-6`，并以 `DEFAULT_AI_PLAYER_RUNTIME_MODEL` 统一给 runtime target 和 AI 管理页模型展示复用。
- live gate helper 默认模型同步为 `claude-sonnet-4-6`。
- `gate:ai:live-model-proposal` 在用户临时 relay key 注入下通过，输出 `strictRawJsonOnly=true`；secret 只在当前 PowerShell 子进程环境中使用，未写入仓库。
- AI 管理页头像选择弹窗已通过 visual smoke 截图：`tmp/screenshots/ai_avatar_picker_20260427/01_ready_world_hub_panel.png`。
- 主界面聊天 AI 气泡已通过 visual smoke 截图确认 profile 头像生效：`tmp/screenshots/ai_chat_avatar_with_message_20260427/01_ready_world_map.png`。
- `godot-client/tools/run_mainline_visual_smoke.py` 增加可选 AI avatar profile seed，用于截图前走正式 `/api/ai/players` 和 `/profile` contract；默认不启用。
- `godot-client/scripts/ui/ai_panel.gd` 增加 visual-smoke-only 头像弹窗开关：`SLG_AI_PANEL_VISUAL_SMOKE_OPEN_AVATAR_SELECT=1`；生产默认不打开。

### 验证命令

- `npm run build`：通过。
- `npm run test:ai:runtime-model-target-contract`：通过。
- `npm run test:ai:player-http-core-contract`：通过。
- `npm run gate:ai:live-model-proposal`：通过，默认模型 `claude-sonnet-4-6`，`strictRawJsonOnly=true`。
- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `npm run gate:ai:preflight`：通过。
- `npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --seed-ai-avatar-id cao_cao_fate_v1 --seed-ai-avatar-image res://assets/portraits/ai_chat/cao_cao_fate_v1_avatar_160.png --evidence-dir tmp/screenshots/ai_avatar_picker_20260427`：通过。
- `npm run godot:mainline:visual-smoke -- --display-mode world --world-action none --seed-ai-avatar-id cai_wenji_fate_frontier_qin_v1 --seed-ai-avatar-image res://assets/portraits/ai_chat/cai_wenji_fate_frontier_qin_v1_avatar_160.png --evidence-dir tmp/screenshots/ai_chat_avatar_with_message_20260427`：通过。

### 剩余主赛项

1. 后续多模型/多供应商阶段需要新增模型路由层：按 AI / 势力 / provider pool 做预算、限流、熔断和 fallback。
2. 玩家/势力 BYOK 保存 UI 仍留到分账阶段，不显示明文 key。

### 风险项

- 当前仍是单 active model + env override；还没有几千 AI 玩家规模下的 provider pool、并发排队和故障切换。
- visual smoke 为了截图写入了 tmp 下的 AI profile seed，不是生产数据迁移。
- app 内 patrol scheduler 虽已有实现，但正式环境默认不启用；大规模运行必须通过外部 scheduler/队列分片调用 HTTP 入口。

### 阻塞项

- 无本轮新增硬阻塞；下一阶段阻塞主要是多模型路由和 BYOK 分账密钥持久化。

### 下一轮优先级

1. 设计并实现最小 provider pool/read-model，让不同 AI 可观测到自己当前模型来源、预算和 fallback 状态。
2. 为 patrol scheduler 加外部调度部署说明或 ops gate，而不是直接默认打开 app 内 timer。
3. 继续把 AI 管理页截图状态从“能选头像”推进到“玩家卡片也清楚显示当前头像/模型/预算”。

## 2026-04-27 Provider Pool Read Model / Patrol Ops Gate

### 本轮完成

- AI runtime list/detail 已新增 `modelStatus` read-model，保留兼容字段 `modelName / modelSource`。
- `modelStatus` 覆盖当前模型、provider、来源、strict JSON-only 能力、预算档位、fallback 状态、secret configured 和安全的 env 来源名。
- provider pool v1 只做 read-model，不承诺多供应商并发、熔断或自动 fallback 执行。
- 新增 `gate:ai:patrol-scheduler-ops`，验证 app 内 patrol timer 默认关闭，外部 HTTP scheduler 可写入一次，冷却中的 AI 计入 `skippedCount`。
- `gate:ai:preflight` 已接入 provider read-model contract 与 patrol tick contract。

### 验证命令

- `npm run build`：通过。
- `npm run test:ai:runtime-model-target-contract`：通过。
- `npm run test:ai:provider-pool-read-model-contract`：通过。
- `npm run test:ai:player-http-chat-patrol-tick-contract`：通过。
- `npm run gate:ai:patrol-scheduler-ops`：通过，生成 `tmp/gates/ai_player_patrol_scheduler_ops_gate_latest.json`。
- `npm run test:ai:player-http-core-contract`：通过。
- `npm run gate:ai:preflight`：通过。

### 剩余主赛项

- provider pool 执行层仍未实现；后续再做多供应商并发、限流、熔断和 fallback。
- 玩家/势力 BYOK 分账与密钥持久化仍后置，本轮只暴露安全 read-model。
- UI 窗口可读取 `modelStatus` 展示模型、预算档位和 secret configured 状态，本窗口不改 AI 管理页布局。

### 风险项

- `fallbackEnabled=false` 是当前真实状态；`fallbackModel` 只是后续执行层的安全候选提示，不代表已经会自动 fallback。
- app 内 patrol scheduler 仍要求显式 `AI_PLAYER_CHAT_PATROL_SCHEDULER_ENABLED=1`，正式环境默认走外部 scheduler/queue。
- 当前仓库仍是多窗口脏工作树，本轮未清理无关 dirty/untracked 文件。

### 阻塞项

- 多模型 provider pool 执行层、BYOK 分账、生产队列/限流仍需独立后续任务。

### 下一轮优先级

1. UI 窗口消费 `modelStatus`，只做 AI 管理页字段展示，不改后端合同。
2. 设计 provider pool 执行层前，先补 provider 配置来源和 BYOK 分账边界。
3. 生产部署前补外部 scheduler/queue 的分片与限流配置。

## 2026-04-27 Provider Pool Execution / Patrol Queue v1

### 本轮完成

- AI runtime proposal 执行层已接入 faction BYOK/model config：`faction_config -> env -> default`。
- `/api/faction/:id/model-config` 中的 `commanderModel / model / baseUrl / apiKey` 可驱动 AI runtime proposal 请求；runtime read-model 同步显示 `modelStatus.source=faction_config`。
- 新增正式 HTTP contract：`server/tests/ai_player_http_model_proposal_byok_contract.test.ts`，用本地 fake relay 验证 `/model-proposals` 实际使用 faction BYOK 的 baseUrl/model/key，且响应不泄露 secret。
- patrol scheduler request/response 增加 `shardIndex / shardCount` 与 `providerBudgetTier / providerBudgetMaxRuns`，response 返回 `shard` 与 `providerBudget` 审计摘要。
- `gate:ai:patrol-scheduler-ops` 已覆盖 app timer 默认关闭、外部 runner、静态分片空批、provider budget disabled safe skip、cooldown safe skip、无 secret 泄露。
- UI 窗口的 visual-smoke Observability 开关属于 Godot/主壳调试层，不在本窗口修改或回滚。

### 验证命令

- `npm run build`：通过。
- `npm run test:ai:runtime-model-target-contract`：通过。
- `npm run test:ai:provider-pool-read-model-contract`：通过。
- `npm run test:ai:player-http-chat-patrol-tick-contract`：通过。
- `npm run gate:ai:patrol-scheduler-ops`：通过。
- `npx tsx server/tests/faction_config_byok_persistence_contract.test.ts`：通过。
- `npm run test:ai:player-http-core-contract`：通过。
- `npm run test:ai:player-http-model-proposal-byok-contract`：通过。
- `npm run test:ai:player-http-model-proposal-contract`：通过。

### 剩余主赛项

- provider pool 还没有多供应商并发、熔断、自动 fallback、玩家级 `player_config` 或 token/cost 计费。
- 外部 queue 还没有 `queueRunId / idempotencyKey / lease / retryAfter / backoff`，当前只完成静态 shard 与 provider run budget。
- BYOK 已接执行层和持久化安全链，但分账、审计和玩家级密钥管理 UI 仍后置。

### 风险项

- `providerBudgetMaxRuns` 是本批 scheduler 的写入前预算上限，不等同于真实模型 token/cost 计量。
- faction BYOK 在无 `FACTION_APIKEY_ENCRYPTION_KEY` 时仍是内存可用、默认不落明文盘；生产必须配置加密 key。
- 当前仓库仍是多窗口脏工作树，本轮未清理无关 dirty/untracked 文件。

### 阻塞项

- 生产级 provider pool 仍需要队列、限流、熔断、fallback、审计和成本统计。

### 下一轮优先级

1. 给 provider pool 增加候选 target 列表和 fallback 失败原因记录。
2. 给外部 queue 增加 `queueRunId / idempotencyKey / lease / retryAfter`。
3. 将 BYOK 分账和玩家级密钥管理拆成独立合同。

## 2026-04-27 Godot AI 管理页专门布局 / 窄屏适配

### 本轮完成

- Godot AI 管理页默认进入“管理”页，专门展示 AI 身份、模型来源、当前预算、候选动作、失败原因和下一步建议。
- 玩家页文案收敛为玩家可读表达，缺失 provider pool 字段时显示“等待 provider pool 字段”，未改 shared/server 合同。
- AI 玩家卡与身份卡优先使用 runtime `avatarImagePath`，runtime 未刷新时使用正式头像库兜底，不再退回字母徽章。
- `SlgSnapshotSectionPage` 增加 AI 管理页窄屏一列化、稳定 chip 最小宽度和 44px 触控按钮高度。
- `run_mainline_visual_smoke.py` 增加 `--window-width/--window-height`，用于正式 visual smoke 生成窄屏截图。

### 验证命令

- `git diff --check -- godot-client/scripts/ui/ai_panel.gd godot-client/scripts/ui/presenters/ai_panel_presenter.gd godot-client/scripts/ui/slg_snapshot_section_page.gd godot-client/tools/run_mainline_visual_smoke.py`：通过。
- `npm run godot:headless:smoke`：通过；仍有既有 `ObjectDB instances leaked` warning，退出码为 0。
- `npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --seed-ai-avatar-id cao_cao_fate_v1 --seed-ai-avatar-image res://assets/portraits/ai_chat/cao_cao_fate_v1_avatar_160.png --evidence-dir tmp/screenshots/ai_panel_dedicated_layout_20260427`：通过，1600x900。
- `npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --seed-ai-avatar-id cao_cao_fate_v1 --seed-ai-avatar-image res://assets/portraits/ai_chat/cao_cao_fate_v1_avatar_160.png --window-width 390 --window-height 844 --evidence-dir tmp/screenshots/ai_panel_dedicated_layout_20260427_mobile`：通过，390x844。
- `npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --seed-ai-avatar-id cao_cao_fate_v1 --seed-ai-avatar-image res://assets/portraits/ai_chat/cao_cao_fate_v1_avatar_160.png --window-width 900 --window-height 1000 --evidence-dir tmp/screenshots/ai_panel_dedicated_layout_20260427_narrow`：通过，900x1000。
- UTF-8 回读与 touched files secret scan：通过，未发现 secret 模式。

### 剩余主赛项

- 真实玩家手动点“刷新 AI 玩家”后，管理页会继续消费 provider window 已补的 `modelStatus` 字段；本轮不扩后端合同。
- 390x844 截图证明正式窗口尺寸链路可用，但现有 Observability 调试层会覆盖大部分手机宽度画面；更清晰的窄屏证据使用 900x1000。

### 风险项

- 手机宽度下主壳 Observability 调试层覆盖 AI 面板，这是既有主壳覆盖层问题，本轮未改 `main.gd` 或 Observability。
- visual smoke 截图前 AI runtime refresh 可能尚未完成，因此 UI 保留正式头像库兜底；真实 runtime 刷新后仍优先展示后端 profile avatar。

### 阻塞项

- 无本轮新增硬阻塞；provider pool 执行层、BYOK 分账和生产调度仍属于后端/ops 专门窗口。

### 下一轮优先级

1. 在允许触碰主壳调试层的窗口里，为 visual smoke 增加隐藏 Observability 的正式开关。
2. AI 管理页继续消费后端 read-model 新字段，不在 UI 窗口补合同。

## 2026-04-27 横屏验收口径修正 / 后端复验

### 本轮口径修正

- AI 管理页 Godot 集成已转交主壳调试/Godot 集成窗口，本窗口不再触碰 `godot-client/scripts/ui/ai_panel.gd`、`godot-client/scripts/ui/presenters/ai_panel_presenter.gd`、`godot-client/scripts/ui/slg_snapshot_section_page.gd` 或 visual smoke UI 适配。
- AI 管理页只消费后端 `modelStatus`：模型名、来源、预算档位、`secretConfigured`、fallback 状态；UI 不回查 provider pool、faction config 或完整 world snapshot。
- 移动端正式验收先以横屏为准：`1600x900` 作为最低实用横屏/模拟器基线，`2388x1080` 作为当前手机横屏目标。
- `390x844` 与 `900x1000` 只保留为旧验证历史，不再作为当前正式验收目标；后续 Godot 集成窗口应优先补跑 `1600x900` 与 `2388x1080`。

### 本窗口后端复验

- `npm run test:ai:provider-pool-read-model-contract`：通过，确认 runtime list/detail 暴露 `modelStatus`，且 read-model payload 不暴露 raw secret。
- `npm run gate:ai:patrol-scheduler-ops`：通过，确认 app 内 patrol timer 默认关闭，外部 HTTP scheduler 可运行且 cooldown 进入 `skippedCount`。
- `npm run build`：通过。
- `npm run test:ai:runtime-model-target-contract`：通过。
- `npm run test:ai:player-http-core-contract`：通过。
- `npm run test:ai:player-http-chat-patrol-tick-contract`：通过。
- `npm run gate:ai:preflight`：通过，覆盖 AI governance guard 聚合链。

### 风险项

- 当前工作树仍是多窗口脏树，`server/shared/docs/godot-client` 均存在既有 dirty/untracked 文件；本轮只追加状态文档，不清理无关文件。
- `modelStatus.fallbackEnabled=true` 现在只代表存在候选 fallback target，不代表已启用自动重试执行层；`fallbackModel` 指向下一候选 target。
- provider pool v1 仍是 read-model，不是生产级多供应商并发、熔断、分账或 BYOK 执行层。

### 下一步

1. Godot 集成窗口按新横屏基线补跑 AI 管理页 `1600x900` 与 `2388x1080` visual smoke。
2. 本窗口后续只做 provider pool 执行层 / BYOK 分账 / 外部 scheduler 队列化等后端任务，不抢 Godot AI 管理页布局。

## 2026-04-27 Provider Pool runtime.modelStatus 真实字段补齐

### 本轮完成

- `runtime.modelStatus` 补齐 `targetCount / candidateTargets / byokSource`。
- `candidateTargets[]` 返回候选 target 安全元数据：`model / provider / source / byokSource / priority / isActive / fallbackCandidate / strictJsonOnlyCapable / budgetTier / lastFailureReason / secretConfigured / secretSource`。
- provider target resolver 现在按 `faction_config -> primary env -> optional LLM relay env -> default` 输出候选序列，`fallbackEnabled / fallbackModel` 由候选序列真实计算。
- 模型 proposal 路径失败时会按 faction 记录安全失败码到 `lastFallbackReason`，成功 proposal 会清空该字段；不记录 raw payload、key 或堆栈。
- BYOK 来源从 `secretSource` 中拆出 `byokSource`，当前支持 `none / faction_config`，`player_config` 保留给玩家级密钥管理后续合同。

### 验证命令

- `npm run build`：通过。
- `npm run test:ai:runtime-model-target-contract`：通过。
- `npm run test:ai:provider-pool-read-model-contract`：通过。
- `npm run test:ai:player-http-model-proposal-byok-contract`：通过。
- `npm run test:ai:player-http-model-proposal-contract`：通过。

### 风险项

- `fallbackEnabled` 仍不是自动 provider fallback 执行层，只是 read-model 中的候选链路可见性。
- BYOK 分账 ledger、审计事件表和玩家级密钥 CRUD 尚未实现；本轮只把 runtime read-model 字段拆清。
- 当前工作树仍是多窗口脏树，本轮不清理、不回滚 Godot/UI 线改动。

### 下一步

1. provider pool 执行层按 `candidateTargets` 做真实 fallback 重试与失败原因分摊。
2. 外部 queue 继续补 `queueRunId / idempotencyKey / lease / retryAfter / backoff`。
3. BYOK 后续拆账单 ledger、审计事件和 `player_config` 密钥管理。

## 2026-04-27 Provider fallback / Queue v2 / BYOK 拆分

### 本轮完成

- provider pool 执行层从单 target 请求升级为候选 target 顺序 fallback。
- `/api/ai/players/:id/model-proposals` 成功响应返回 `providerFallback.selectedProvider / failureCount / failures`，只含安全元数据和失败码。
- fallback 失败原因会按候选写回 `runtime.modelStatus.candidateTargets[].lastFailureReason`；成功首选 target 时清空旧失败。
- patrol scheduler 外部 queue 合同补齐 `queueRunId / idempotencyKey / leaseId / leaseTtlMs / backoffMs / retryAfterMs`。
- 同一 `idempotencyKey` 的 scheduler replay 返回缓存结果，`queue.deduped=true`，不重复写巡查消息。
- BYOK 分账、审计、玩家级密钥管理拆到 `docs/AI_PLAYER_BYOK_BILLING_AUDIT_PLAYER_KEY_CONTRACT_2026_04_27.md`。

### 验证命令

- `npm run build`：通过。
- `npm run test:ai:player-http-model-proposal-byok-contract`：通过，覆盖 faction BYOK 失败后 env fallback 成功与 secret 不泄露。
- `npm run test:ai:player-http-model-proposal-contract`：通过。
- `npm run test:ai:player-http-chat-patrol-tick-contract`：通过，覆盖 idempotency replay 不二次写消息。
- `npm run gate:ai:patrol-scheduler-ops`：通过，覆盖 queue idempotency / lease / backoff 响应。

### 风险项

- `leaseId / leaseTtlMs` 当前是外部 queue 审计合同，不是跨进程分布式锁；生产 lease ownership 仍应由外部队列系统保证。
- BYOK billing ledger、audit store、player-level key CRUD 仍未实现；本轮只拆正式合同和 read-model 边界。
- 当前工作树仍有多窗口 dirty/untracked 文件；本轮未清理、未回滚 UI/Godot 线。

### 下一步

1. 将 provider fallback 失败原因接入后续 billing/audit event store。
2. 按 `player_config` 合同实现玩家级 key CRUD 与加密 secret storage。
3. 若下一轮需要 UI 展示，只交给 UI 窗口消费 read-model，不在本窗口改 Godot 布局。

## 2026-04-27 Provider accounting / Player BYOK CRUD

### 本轮完成

- 新增 provider account 后端合同：`/api/ai/provider/player-keys/:ownerPlayerId` 支持玩家级 BYOK `GET / POST / DELETE`。
- 玩家级 key 使用 `FACTION_APIKEY_ENCRYPTION_KEY` 加密落盘；无加密 key 时默认不持久化明文 key。
- runtime model target 顺序升级为 `player_config -> faction_config -> env -> default`，玩家级 key 可优先驱动 `/model-proposals`。
- provider 请求成功写入 billing ledger；provider fallback/失败和 key 配置/撤销写入 audit event store。
- 新增正式 HTTP contract：`server/tests/ai_player_provider_accounting_contract.test.ts`，覆盖 key CRUD、加密持久化、runtime read-model、model proposal、ledger、audit、secret 不泄露。

### 验证命令

- `npm run build`：通过。
- `npm run test:ai:runtime-model-target-contract`：通过。
- `npm run test:ai:provider-pool-read-model-contract`：通过。
- `npm run test:ai:player-http-model-proposal-byok-contract`：通过。
- `npm run test:ai:provider-accounting-contract`：通过。
- `npm run test:ai:player-http-model-proposal-contract`：通过。
- `npm run test:ai:player-http-chat-patrol-tick-contract`：通过。
- `npm run gate:ai:patrol-scheduler-ops`：通过。
- `npm run gate:ai:preflight`：通过。

### 风险项

- billing/audit 当前是本进程 JSON store，不是外部数据库或跨进程审计总线。
- provider pool 仍未实现多供应商并发、熔断和真实 token/cost 扣减预算。
- Godot/Web 保存 UI 未在本窗口实现，后续只消费后端 read-model。

### 下一步

1. 如 UI 需要展示玩家级 key 状态，只交给 UI 窗口消费 `/api/ai/provider/player-keys/:ownerPlayerId` 和 `runtime.modelStatus`。
2. 后续生产化再接外部 ledger/audit 数据库和 provider budget 扣减策略。
3. 多供应商并发、熔断和真实 token/cost 扣减仍留给 provider pool 后续任务。
