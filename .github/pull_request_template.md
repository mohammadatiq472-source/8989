## 变更摘要

<!-- 描述本次改动目标、范围、风险 -->

## 任务类型

- [ ] 后端（`server/` 或 `shared/`）
- [ ] 前端（Unity `My project/Assets/Scripts/`）
- [ ] 测试/门禁（`server/tests/`、`server/src/evals/`、workflow）

## 双机协作核对（必须）

- [ ] `A-main` 已审阅并认可任务拆分与变更方向
- [ ] `B-main` 已审阅并认可实现与测试结论
- [ ] 已在企业微信同步结论（总控群或会战群）
- [ ] 已附带回滚方案（或说明无需回滚）

## A/B 分工（游戏项目）

- A 负责模块（示例：`M03/M02/M14`）：<!-- server/shared 写入范围 -->
- B 负责模块（示例：`M15/M16` Unity）：<!-- Unity 写入范围 -->
- 跨模块触点（如 `shared/contracts`、`docs/unity`）：

## 验证链（至少一条可复现）

- [ ] 本地验证命令已执行并通过
- [ ] CI 检查通过（至少包含 `phase5-hardening-gate`）

验证命令与输出摘要：

```text
<command #1>
<result #1>
<command #2>
<result #2>
```

## 回滚与风险

- 回滚命令/步骤：
- 已知风险：

## 关联信息

- 任务号（GitHub Issue / Plane）：
- 关联分支：
- 影响模块（Mxx）：
