# AI 玩家主窗口对比记录 2026-04-27

## 结论

- 主窗口是 AI 玩家可玩闭环总控窗口，保留 Godot 主界面 AI 聊天、通用收件箱、AI 管理台和真实 relay/UI 接线。
- 独立 worktree 是后端合同包，提供 `tile_occupy / troop_heal / battle_report_read / development-plan` 的后端参考实现。
- 主窗口不能整文件覆盖 worktree；本轮只手工融合 `tile_occupy / troop_heal` 的合同、规则、执行器和测试，并补入 `battle_report_read` 只读 read-model。
- `battle_report_read` 已在主窗口作为只读 contract 合入，不加入 proposal executor，不改 world。

## 合同组对比

| 合同组 | 主窗口融合状态 | 备注 |
| --- | --- | --- |
| AI contracts/schemas | 已合入 `tile_occupy / troop_heal` args，并保持主窗口 chat/model/inbox 类型 | 不覆盖主窗口聊天链 |
| world action authority | 已合入 `occupyTile / healTroop` world action、schema、route、WorldService、rules | 成功链均返回正式 receipt |
| AI runtime/read model | 已把 `tile_occupy / troop_heal` 作为 development-plan 可执行候选，并新增 `/battle-reports` 只读模型 | `battle_report_read` 只读，不生成执行 proposal |
| chat/proposal/receipt | proposal executor 已能执行 `tile_occupy / troop_heal` | Godot 展示继续消费现有 receipt contract，并保持四块玩家文案 |
| tests | 已新增 `ai_player_http_tile_occupy_contract`、`ai_player_http_troop_heal_contract`、`ai_player_http_battle_report_read_contract` 并接入 aggregate | 本轮继续用正式入口验证 |

## 后续合回口径

1. 不从独立 worktree 复制热文件整文件。
2. `battle_report_read` 保持只读 route 和 contract，不加入 executor action。
3. UI 只消费 `development-plan`、`battle-reports` 和 receipt 字段，不在 AI 管理页塞通用收件箱。
4. 地图可视化先按草案文档拆 contract，不在主窗口直接打磨 world-cell 视觉。
