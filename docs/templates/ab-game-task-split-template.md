# A/B 双机任务分工模板（游戏项目）

## 0. 任务元信息

- 任务名：
- 时间：
- 仓库：
- 主分支：
- 目标版本：

## 1. 任务目标

- 业务目标：
- 技术目标：
- 非目标（明确不做）：

## 2. 模块边界

- 后端模块（A 优先）：`M01/M02/M03/M04/M05/M06/M07/M08/M09/M10/M11/M12/M13/M14/M18/M19`
- 前端模块（B 优先，Godot）：`godot-client/scenes/*`, `godot-client/scripts/*`, `godot-client/autoload/*`, `godot-client/assets/*`, `godot-client/data/*`
- 跨模块需双审：`shared/contracts/*`, `shared/schemas/*`, `docs/modules_v2/*`, `docs/TASK_*GODOT*`

## 3. A/B 分工

### A 机（后端主责）
- 负责路径：
- 交付物：
- 验证命令：

### B 机（前端主责，Godot）
- 负责路径：
- 交付物：
- 验证命令：

## 4. PR 流程

1. A/B 分别从 `main` 切分支：`codex/<task>-backend-*`、`codex/<task>-godot-*`
2. 先开 Draft PR，补齐模板中的 A/B 分工和验证计划
3. 本地验证通过后改为 Ready for Review
4. A-main + B-main 双审通过，再合并

## 5. 合并门禁

- 必须包含本地验证证据
- 必须包含 CI 结果
- 必须写明回滚方案
- 必须在企业微信群同步结论
- Godot 任务必须附带 `--headless --path godot-client --quit` 验证结果
