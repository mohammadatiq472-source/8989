## 变更摘要

<!-- 描述本次改动目标、范围、风险 -->

## 任务类型

- [ ] 后端（`server/` 或 `shared/`）
- [ ] 前端（Godot `godot-client/`）
- [ ] 测试/门禁（`server/tests/`、`server/src/evals/`、workflow）

## 双机协作核对（必须）

- [ ] `A-main` 已审阅并认可任务拆分与变更方向
- [ ] `B-main` 已审阅并认可实现与测试结论
- [ ] 已在企业微信同步结论（总控群或会战群）
- [ ] 已附带回滚方案（或说明无需回滚）

## A/B 分工（游戏项目）

- A 负责模块（示例：`M03/M02/M14`）：<!-- server/shared 写入范围 -->
- B 负责模块（示例：`M15/M16` Godot）：<!-- godot-client 写入范围 -->
- 跨模块触点（如 `shared/contracts`、`godot-client`）：

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

## Gate Trio 失败摘要（CI/PR）

> 当 `ai-trio-gate` 失败时，请从 workflow 的 Step Summary 复制 **PR Failure Summary Template** 到下方并补充实际动作。
<!-- ai-trio-auto-comment: auto -->
> 默认开启 `Failure/High-Risk` 自动评论；若需人工覆盖，请把上方注释改成 `<!-- ai-trio-auto-comment: manual -->`。

```markdown
### Gate Trio Failure Snapshot
- summaryRunId:
- overallPassed:
- staleDetected:
- staleCount:
- highestSeverity:
- primaryRecommendation:
- prAutoCommentStatus:
- prAutoCommentReason:
- prAutoCommentOutcome:

#### freshnessTriage.items (stale first)
| checkName | severity | overdueSec | componentRefreshCommand |
| --- | --- | --- | --- |
| | | | |

#### Next Actions
1.
2.
3.
```

> 若 Step Summary 出现 `PR Auto Prompt (Failure/High-Risk)`，请将其复制到下方并明确是否已执行 `immediateAction`。

```markdown
⚠️ ai-trio-gate 自动提示（Failure/High-Risk）：
- summaryRunId:
- highestSeverity:
- highRiskChecks:
- immediateAction:
- actionStatus: executed / pending
- autoCommentReconcileStatus: posted / updated / skipped / failed
- autoCommentReconcileReason: created_new / updated_existing / manual_override / fork_permission_restricted / permission_denied / no_high_risk_prompt / not_pull_request / ...
- autoCommentOutcome: auto_comment_posted / auto_comment_updated / auto_comment_skipped:<reason> / auto_comment_failed:<reason>
```

## 回滚与风险

- 回滚命令/步骤：
- 已知风险：

## 关联信息

- 任务号（GitHub Issue / Plane）：
- 关联分支：
- 影响模块（Mxx）：
