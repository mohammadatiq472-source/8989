# TASK 004 - AI 主链 Batch3 自主续跑执行卡（2026-04-10）

> 目标：在 B2 已完成“模板回放夹具 + nightly 显式断言 + 三件套单入口”基础上，进入 Batch3 的稳定化与运维化推进。

## 1. Batch3 卡片总览

| Card | 名称 | 模块 | 目标 | 白名单文件 | 验证入口 |
| --- | --- | --- | --- | --- | --- |
| B3-C01 | 三件套提速卡（nightly 复用最新报告模式） | M18 | 避免 `gate:ai:trio` 内重复执行 session/mainline 两遍，同时保持新鲜度约束 | `server/src/evals/runAiNightlyAcceptanceGate.ts`, `package.json`, `docs/modules_v2/M18.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md` | `npm run build`；`npm run gate:ai:trio`；nightly latest 检查 `executionMode=reuse_latest_reports` + fresh checks |
| B3-C02 | 三件套报告聚合卡（单 JSON 摘要） | M18/M11 | 把 session/mainline/nightly/template-replay 关键状态汇总成单文件，便于 AI 快速读取 | `server/src/evals/runGateTrioSummary.ts`, `package.json`, `docs/modules_v2/M18.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md` | `npm run build`；`npm run gate:ai:trio`；检查 `tmp/gates/gate-trio/gate_trio_summary_latest.json` |
| B3-C03 | Save Slot 迁移策略最小卡（文档 + 校验） | M01/M02 | 明确 Save Slot 版本演进与跨环境迁移口径，降低中期返工 | `docs/modules_v2/M01.md`, `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md`, `docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md` | 文档 UTF-8 回读；`npm run gate:ai:nightly:acceptance` |
| B3-C04 | Save Slot 健康纳管卡（runtime + nightly） | M01/M18 | 将 Save Slot 纳入 `/api/health.persistence` 与 nightly `persistence_snapshot_available`，并进入告警聚合源 | `server/src/application/world/WorldService.ts`, `server/src/app.ts`, `server/src/evals/runAiNightlyAcceptanceGate.ts`, `docs/modules_v2/M01.md`, `docs/modules_v2/M18.md`, `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；检查 report 中 `persistence.saveSlots` 与 `saveSlotsPath` |
| B3-C05 | Save Slot 大文件治理卡（soft/hard 阈值 + 门禁检查） | M01/M18 | 把 save-slot 文件体积纳入告警与 nightly 判定，避免大文件失控 | `server/src/application/world/WorldService.ts`, `server/src/app.ts`, `server/src/evals/runAiNightlyAcceptanceGate.ts`, `docs/modules_v2/M01.md`, `docs/modules_v2/M18.md`, `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；检查 `save_slots_not_hard_oversize` 与 `alerts[source=saveSlots]` |
| B3-C06 | Save Slot 归档压缩 + 锁竞争治理卡（runtime + nightly） | M01/M18 | 在 soft 超限时自动归档压缩，并加入多实例写锁健康指标与 nightly 显式检查 | `server/src/application/world/WorldService.ts`, `server/src/app.ts`, `server/src/evals/runAiNightlyAcceptanceGate.ts`, `docs/modules_v2/M01.md`, `docs/modules_v2/M18.md`, `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；`POST /api/save-slots/save` + `GET /api/health` 检查 archive/lock 指标 |
| B3-C07 | Save Slot 归档恢复演练卡（archive catalog + dry-run drill + gate） | M01/M18 | 提供正式恢复演练入口并将演练结果纳入 nightly，避免“有归档但不可恢复” | `server/src/application/world/WorldService.ts`, `server/src/routes/observability.ts`, `server/src/app.ts`, `server/src/evals/runAiNightlyAcceptanceGate.ts`, `docs/modules_v2/M01.md`, `docs/modules_v2/M18.md`, `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；`GET /api/save-slots/archive`；`POST /api/save-slots/archive/restore-drill` |
| B3-C08 | Save Slot 真实恢复卡（受控 restore + rollback + idempotent） | M01/M18 | 提供 `.json.gz -> active save-store` 正式恢复入口，并内置回滚护栏与幂等防误触 | `server/src/application/world/WorldService.ts`, `server/src/routes/observability.ts`, `server/src/app.ts`, `server/src/evals/runAiNightlyAcceptanceGate.ts`, `docs/modules_v2/M01.md`, `docs/modules_v2/M18.md`, `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md` | `npm run build`；`POST /api/save-slots/archive/restore` |
| B3-C09 | Save Slot restore apply 门禁化卡（无副作用可观测 + rollback drill gate） | M01/M18 | 将 restore apply 纳入 nightly 可观测门禁，并补“失败后自动回滚”演练检查，提供正式 rollback drill API | `server/src/application/world/WorldService.ts`, `server/src/routes/observability.ts`, `server/src/app.ts`, `server/src/evals/runAiNightlyAcceptanceGate.ts`, `docs/modules_v2/M01.md`, `docs/modules_v2/M18.md`, `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md`, `docs/TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；`npm run gate:ai:trio`；`POST /api/save-slots/archive/restore-rollback-drill` |
| B3-C10 | Save Slot restore apply 正式 gate 收敛卡（三段行为 + 清理临时脚本） | M01/M18 | 将 `restored -> skipped -> force restored` 收敛为正式 gate，并接入 nightly；删除临时验证脚本 | `server/src/evals/runSaveSlotsRestoreApplyGate.ts`, `server/src/evals/runAiNightlyAcceptanceGate.ts`, `package.json`, `docs/modules_v2/M01.md`, `docs/modules_v2/M18.md`, `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md`, `docs/TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md` | `npm run gate:save-slots:restore-apply:stability`；`npm run gate:ai:nightly:acceptance`；`npm run gate:ai:trio` |
| B3-C11 | Save Slot restore apply gate 产物保留收敛卡（latest + 最近 N 份 + trio summary 并入） | M01/M18 | 收敛 restore-apply gate 报告/工作区保留策略，并把关键结果并入 trio summary，降低长期噪声与排障跳转成本 | `server/src/evals/runSaveSlotsRestoreApplyGate.ts`, `server/src/evals/runGateTrioSummary.ts`, `docs/modules_v2/M01.md`, `docs/modules_v2/M18.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md`, `docs/TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；`npm run gate:ai:trio` |
| B3-C12 | Gate Trio summary 保留与新鲜度收敛卡（latest + 最近 N 份 + 显式 freshness checks） | M18 | 收敛 `gate-trio` summary 产物保留策略并新增 summary 新鲜度显式检查，降低长期目录噪声与陈旧报告误判 | `server/src/evals/runGateTrioSummary.ts`, `docs/modules_v2/M18.md`, `docs/TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；`npm run gate:ai:trio` |
| B3-C13 | Trio summary 单跑陈旧分级与排障指引卡（freshness triage） | M18 | 给 `gate:ai:trio:summary` 单独执行场景补齐陈旧报告分级提示与可机读排障建议，降低失败时人工判断成本 | `server/src/evals/runGateTrioSummary.ts`, `docs/modules_v2/M18.md`, `docs/TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；`npm run gate:ai:trio` |
| B3-C14 | CI/PR 失败摘要模板接线卡（freshnessTriage 映射） | M18 | 将 `freshnessTriage` 映射到 CI Step Summary 与 PR 失败摘要模板，缩短 triage 首轮定位时间 | `server/src/evals/renderGateTrioFailureSummary.ts`, `package.json`, `.github/workflows/ai-trio-gate.yml`, `.github/pull_request_template.md`, `docs/modules_v2/M18.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md`, `docs/TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；`npm run gate:ai:trio` |
| B3-C15 | stale 高危分级高亮与 PR 自动提示文案卡（failure-only） | M18 | 在 `ai-trio-gate` 失败场景自动高亮 `stale_high/stale_critical/unknown` 并生成可直接粘贴的 PR 自动提示文案，降低高危陈旧漏判 | `server/src/evals/renderGateTrioFailureSummary.ts`, `.github/workflows/ai-trio-gate.yml`, `.github/pull_request_template.md`, `docs/modules_v2/M18.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md`, `docs/TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；`npm run gate:ai:trio` |
| B3-C16 | PR 高危自动提示自动评论接线卡（含人工覆盖开关） | M18 | 将 `PR Auto Prompt (Failure/High-Risk)` 在 `pull_request` 场景自动写入 PR 讨论区，并支持手工改为人工粘贴模式 | `server/src/evals/renderGateTrioFailureSummary.ts`, `.github/workflows/ai-trio-gate.yml`, `.github/pull_request_template.md`, `docs/modules_v2/M18.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md`, `docs/TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md`, `docs/AI_QUICK_NAV_INDEX_2026_04_10.md`, `docs/CLOSEOUT_B3_C16_2026_04_11.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；`npm run gate:ai:trio` |
| B3-C17 | PR 自动评论降级提示与对账字段卡（fork/权限受限） | M18 | 补齐 fork/权限受限场景自动降级提示，并把“自动评论是否成功”纳入失败摘要可复制字段 | `server/src/evals/renderGateTrioFailureSummary.ts`, `.github/workflows/ai-trio-gate.yml`, `.github/pull_request_template.md`, `docs/modules_v2/M18.md`, `docs/GATE_TRIO_HANDOFF_2026_04_10.md`, `docs/TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md`, `docs/AI_QUICK_NAV_INDEX_2026_04_10.md`, `docs/CLOSEOUT_B3_C17_2026_04_11.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；`npm run gate:ai:trio` |
| B3-C18 | docs 第二阶段精简归档治理卡（reference-only 落地） | M18 | 将低频历史 prompt 文档迁入 `docs/archive/prompts/`，原路径保留 stub，收口 quick-nav/governance/候选台账 | `docs/archive/prompts/*`, `docs/prompts/PLANNER_RAG_GRAPH_PROMPTS.md`, `docs/prompts/planner.prompt.md`, `docs/AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md`, `docs/codex-multi-agent-audit-2026-03-20.md`, `docs/AI_PROMPT_CONTEXT_GOVERNANCE_2026_04_11.md`, `docs/PROMPT_ARCHIVE_CANDIDATES_2026_04_11.md`, `docs/AI_QUICK_NAV_INDEX_2026_04_10.md`, `docs/modules_v2/M18.md`, `docs/TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md`, `docs/CLOSEOUT_B3_C18_2026_04_12.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；`npm run gate:ai:trio` |
| B3-C19 | docs 第三阶段收口治理卡（旧路径回写 + archive/stub 逆向索引 + 回滚演练记录） | M18 | 回写跨文档旧路径到 archive 主路径，补齐 archive/stub 双向索引，并附 latest nightly rollback drill 实录 | `docs/archive/prompts/PLANNER_RAG_GRAPH_PROMPTS.md`, `docs/AI_PROMPT_CONTEXT_GOVERNANCE_2026_04_11.md`, `docs/PROMPT_ARCHIVE_CANDIDATES_2026_04_11.md`, `docs/AI_QUICK_NAV_INDEX_2026_04_10.md`, `docs/TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md`, `docs/modules_v2/M18.md`, `docs/CLOSEOUT_B3_C18_2026_04_12.md`, `docs/CLOSEOUT_B3_C19_2026_04_12.md`, `docs/AI_ENGINEER_HUB_2026_03_25.md` | `npm run build`；`npm run gate:ai:nightly:acceptance`；`npm run gate:ai:trio` |

## 2. 执行进展

| Card | 状态 | 关键结论 |
| --- | --- | --- |
| B3-C01 | done | `gate:ai:trio` 已切换为 nightly 复用模式，新增报告新鲜度检查，验证通过。 |
| B3-C02 | done | 已新增 `runGateTrioSummary.ts` 并接入 `gate:ai:trio`，聚合报告可机读。 |
| B3-C03 | done | 已固化 Save Slot 版本演进与跨环境迁移最小口径，并同步 runbook/narrative；nightly 验收通过。 |
| B3-C04 | done | Save Slot 已纳入 runtime/nightly 持久化快照与告警源，降低人工巡检盲区。 |
| B3-C05 | done | Save Slot 文件体积已纳入 soft/hard 阈值治理，nightly 新增硬阈值门禁检查。 |
| B3-C06 | done | Save Slot 已支持 soft 超限自动 gzip 归档与多实例锁治理，nightly 增加 archive/lock 三项显式检查。 |
| B3-C07 | done | Save Slot 已新增归档目录查询与 dry-run 恢复演练入口，nightly 新增 `save_slots_archive_restore_drill_passed` 检查。 |
| B3-C08 | done | Save Slot 已新增真实恢复入口 `POST /api/save-slots/archive/restore`，支持 rollback 备份与幂等跳过。 |
| B3-C09 | done | nightly 已新增 restore apply 可观测门禁与 rollback drill 门禁，并提供 `POST /api/save-slots/archive/restore-rollback-drill` 正式入口。 |
| B3-C10 | done | 已新增 `gate:save-slots:restore-apply:stability` 正式门禁并接入 nightly，临时脚本 `tmp/verify_b3c08_restore_apply.ts` 已删除。 |
| B3-C11 | done | restore-apply gate 已支持 latest + 最近 N 份产物保留，并把关键结果并入 `gate_trio_summary_latest.json`。 |
| B3-C12 | done | gate-trio summary 已支持 latest + 最近 N 份保留，并新增 5 项报告新鲜度显式检查。 |
| B3-C13 | done | trio summary 已新增 `freshnessTriage` 分级输出与 `*_report_fresh` 排障建议字段，单跑失败可直接机读定位。 |
| B3-C14 | done | 已新增 trio 失败摘要渲染脚本与 `ai-trio-gate` workflow，CI Step Summary/PR 模板可直接消费 `freshnessTriage`。 |
| B3-C15 | done | `ai-trio-gate` 失败时会自动高亮高危 stale 分级并输出 `PR Auto Prompt (Failure/High-Risk)` 文案，避免高危陈旧在 PR 线程中被忽略。 |
| B3-C16 | done | `ai-trio-gate` 现已在 PR 场景自动创建/更新高危提示评论，并支持 `ai-trio-auto-comment: manual` 人工覆盖开关。 |
| B3-C17 | done | 已补齐 fork/权限受限场景降级提示，并把 `prAutoCommentStatus/prAutoCommentReason/prAutoCommentOutcome` 与 `autoCommentReconcileStatus/Reason` 收敛为失败摘要 + PR 模板统一对账字段。 |
| B3-C18 | done | docs 第二阶段归档已完成，且 runId 已按 2026-04-12 重跑结果统一更新。 |
| B3-C19 | done | docs 第三阶段已完成：旧路径回写、archive/stub 逆向索引、rollback drill 实录已收口。 |

## 3. B3-C01 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:trio` -> `PASS`
3. nightly latest 抽样检查：
   - `executionMode = reuse_latest_reports`
   - `mainline_report_fresh_when_reuse = true`
   - `template_replay_report_fresh_when_reuse = true`
   - `session_security_report_fresh_when_reuse = true`

## 4. B3-C03 验证记录

1. 文档 UTF-8 回读：
   - `docs/modules_v2/M01.md` -> `PASS`
   - `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md` -> `PASS`
   - `docs/PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`
3. nightly 抽样检查：
   - `template_replay_fixture_checks_passed = true`
   - `template_replay_all_steps_required = true`
   - `persistence_snapshot_available = true`

## 5. B3-C04 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`
3. nightly 抽样检查：
   - `persistence_snapshot_available.details.saveSlotsPath` 存在且为 `tmp/world_save_slots.json`
   - `persistence.saveSlots` 存在（含 `slotCount/persistFailureCount/corruptQuarantineCount/persistVersion`）
   - `alerts.source` 已支持 `saveSlots`（本次样本未触发 saveSlots 告警）

## 6. B3-C05 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`
3. nightly 抽样检查：
   - `save_slots_not_hard_oversize = true`
   - `persistence.saveSlots.fileSizeLevel = soft`
   - `alerts` 包含 `source=saveSlots` + `code=save_slots_oversize_soft`（中告警）
4. 默认阈值：
   - soft: `128 MiB`（`WORLD_SAVE_SLOTS_SOFT_LIMIT_BYTES`）
   - hard: `512 MiB`（`WORLD_SAVE_SLOTS_HARD_LIMIT_BYTES`）

## 7. B3-C06 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`
3. `npm run gate:ai:trio` -> `PASS`（nightly `reuse_latest_reports` 下新增 archive/lock 检查仍通过）
4. nightly 抽样检查（runId: `ai_nightly_2026-04-10T15-17-15-197Z`）：
   - `save_slots_archive_failures_absent = true`
   - `save_slots_lock_contention_absent = true`
   - `save_slots_lock_failures_absent = true`
   - `persistence.saveSlots` 含新增字段：`archive*`、`lock*`
5. API 实测链（正式入口）：
   - `POST /api/save-slots/save` 成功后，`GET /api/health` 观察到：
     - `persistSuccessCount` 增长
     - `archiveSuccessCount` 从 `0` 增长到 `1`
     - `archiveFileCount` 增长，`lastArchivePath` 可读
6. 锁竞争实测链（正式入口）：
   - 人工预置 `tmp/world_save_slots.json.lock` 后触发保存，`GET /api/health` 可见：
     - `lockContentionCount` 增长
     - `persistDirty=true`（等待锁释放后重试）
7. 验证后清理：
   - 已移除临时验证 slot（`b3c06probe*`），并保留备份 `tmp/world_save_slots.json.bak.20260410151655`

## 8. B3-C07 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-11T03-56-21-806Z`）
3. `npm run gate:ai:trio` -> `PASS`（nightly `reuse_latest_reports` 下 `save_slots_archive_restore_drill_passed=true`）
4. 新增 API 正式入口实测：
   - `GET /api/save-slots/archive` -> `PASS`（返回 `archives[]`）
   - `POST /api/save-slots/archive/restore-drill` -> `PASS`（返回 `drill.status=passed`）
5. runtime 健康字段实测（drill 后）：
   - `persistence.saveSlots.restoreDrillSuccessCount` 增长
   - `lastRestoreDrillStatus=passed`
   - `lastRestoreDrillArchivePath`、`lastRestoreDrillSlotCount` 可读

## 9. B3-C08 验证记录

1. `npm run build` -> `PASS`
2. 新增 API 正式入口：
   - `POST /api/save-slots/archive/restore`
   - 支持 `archivePath` 与 `force`（默认 `false`）
3. runtime 健康字段新增：
   - `restoreApplySuccessCount/restoreApplyFailureCount`
   - `lastRestoreApplyStatus/lastRestoreApplyMessage`
   - `lastRestoreApplyArchivePath/lastRestoreApplyBackupPath/lastRestoreApplySlotCount`

## 10. B3-C09 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-11T05-53-58-209Z`）
3. `npm run gate:ai:trio` -> `PASS`（runId: `ai_nightly_2026-04-11T05-59-23-565Z`）
4. nightly 新增检查项抽样：
   - `save_slots_restore_apply_metrics_observable = true`
   - `save_slots_restore_apply_failure_rollback_trace = true`
   - `save_slots_archive_restore_rollback_drill_passed = true`
5. 新增 API 正式入口实测：
   - `POST /api/save-slots/archive/restore-rollback-drill` -> `drill.status=passed`
   - `GET /api/health` 可见 `restoreRollbackDrillSuccessCount` 增长

## 11. B3-C10 验证记录

1. `npm run gate:save-slots:restore-apply:stability` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-11T06-10-41-410Z`）
3. `npm run gate:ai:trio` -> `PASS`（nightly runId: `ai_nightly_2026-04-11T06-16-43-534Z`）
4. nightly 新增检查项抽样：
   - `save_slots_restore_apply_gate_exit_zero = true`
   - `save_slots_restore_apply_gate_report_parsed = true`
   - `save_slots_restore_apply_gate_passed = true`
5. 清理结果：
   - `tmp/verify_b3c08_restore_apply.ts` 已删除

## 12. B3-C11 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-11T07-36-42-175Z`）
3. `npm run gate:ai:trio` -> `PASS`（nightly runId: `ai_nightly_2026-04-11T07-44-05-114Z`，summary runId: `gate_trio_summary_2026-04-11T07-44-47-384Z`）
4. restore-apply gate latest 抽样：
   - `artifacts.keepRecent = 12`
   - `artifacts.retainedRunIds` 非空
   - `artifacts.prunedReports/prunedWorkspaces` 字段可读
5. trio summary latest 抽样：
   - 新增 `reports.saveSlotsRestoreApply` 节点
   - `checks` 新增三项：
     - `save_slots_restore_apply_gate_passed = true`
     - `nightly_references_latest_restore_apply_gate = true`
     - `save_slots_restore_apply_three_phase_semantics = true`
6. 并发护栏抽样：
   - restore-apply gate 目录在本轮串行验证中未再出现“运行中 workspace 被清理”副作用

## 13. B3-C12 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-11T08-00-56-830Z`）
3. `npm run gate:ai:trio` -> `PASS`（nightly runId: `ai_nightly_2026-04-11T08-06-56-791Z`，summary runId: `gate_trio_summary_2026-04-11T08-07-14-754Z`）
4. trio summary latest 抽样：
   - `policy.maxReportAgeSec = 900`
   - `policy.keepRecent = 12`
   - `artifacts.prunedReports = 1`
5. trio summary checks 抽样：
   - `session_security_report_fresh = true`
   - `mainline_report_fresh = true`
   - `nightly_report_fresh = true`
   - `template_replay_report_fresh = true`
   - `save_slots_restore_apply_report_fresh = true`

## 14. B3-C13 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-11T08-54-08-280Z`）
3. `npm run gate:ai:trio` -> `PASS`（nightly runId: `ai_nightly_2026-04-11T08-59-15-827Z`，summary runId: `gate_trio_summary_2026-04-11T08-59-31-104Z`）
4. trio summary latest 抽样：
   - 新增 `freshnessTriage` 顶层结构
   - `freshnessTriage.items` 覆盖 5 个 freshness check（含 `severity/overdueSec/troubleshooting`）
   - `freshnessTriage.primaryRecommendation = npm run gate:ai:trio`（仅陈旧时出现）
5. `*_report_fresh` 检查详情抽样：
   - `details.severity` 可读（`fresh/stale_notice/stale_warning/stale_high/stale_critical/unknown`）
   - `details.troubleshooting.primaryCommand/componentRefreshCommand/rerunSummaryCommand` 可读

## 15. B3-C14 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-11T08-54-08-280Z`）
3. `npm run gate:ai:trio` -> `PASS`（nightly runId: `ai_nightly_2026-04-11T08-59-15-827Z`，summary runId: `gate_trio_summary_2026-04-11T08-59-31-104Z`）
4. 新增 CI/PR 映射入口：
   - `npm run gate:ai:trio:failure-summary`
   - `.github/workflows/ai-trio-gate.yml`（`GITHUB_STEP_SUMMARY` 自动写入）
   - `.github/pull_request_template.md` 新增 `Gate Trio 失败摘要（CI/PR）` 区块
5. 映射字段抽样（`tmp/gates/gate-trio/gate_trio_failure_summary.md`）：
   - `freshness.staleDetected/staleCount/highestSeverity`
   - `Freshness Triage` 表中 `check/severity/overdueSec/componentRefreshCommand`
   - `PR Failure Summary Template` 可直接复制进 PR

## 16. B3-C15 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-11T09-15-39-360Z`）
3. `npm run gate:ai:trio` -> `PASS`（nightly runId: `ai_nightly_2026-04-11T09-20-54-905Z`，summary runId: `gate_trio_summary_2026-04-11T09-21-11-005Z`）
4. 失败摘要渲染增强（`tmp/gates/gate-trio/gate_trio_failure_summary.md`）：
   - 新增 `ciOutcome` 与 `highRiskStaleCount`
   - `ciOutcome=failure` 且存在高危陈旧时，自动输出 `:red_circle: STALE HIGH-RISK HIGHLIGHT (Auto)`
   - 新增 `PR Auto Prompt (Failure/High-Risk)` 文案块，可直接复制到 PR 对话
5. workflow/模板联动：
   - `.github/workflows/ai-trio-gate.yml` 已传入 `--ci-outcome "${{ steps.gate_trio.outcome }}"`
   - `.github/pull_request_template.md` 已新增高危自动提示粘贴位（failure-only）

## 17. B3-C16 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-11T09-32-49-298Z`）
3. `npm run gate:ai:trio` -> `PASS`（nightly runId: `ai_nightly_2026-04-11T09-39-30-211Z`，summary runId: `gate_trio_summary_2026-04-11T09-39-56-358Z`）
4. `npm run gate:ai:trio:failure-summary -- --summary-path tmp/gates/gate-trio/gate_trio_summary_latest.json --output tmp/gates/gate-trio/gate_trio_failure_summary.md --pr-auto-prompt-output tmp/gates/gate-trio/gate_trio_pr_auto_prompt.md --ci-outcome failure` -> `PASS`
5. workflow 自动评论链抽样口径：
   - `pull_request` + failure/high-risk 时，使用 `tmp/gates/gate-trio/gate_trio_pr_auto_prompt.md` 自动创建/更新 PR 评论。
   - PR 描述出现 `ai-trio-auto-comment: manual` 时跳过自动评论，保留人工粘贴入口。

## 18. B3-C17 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-11T10-49-13-964Z`）
3. `npm run gate:ai:trio` -> `PASS`（nightly runId: `ai_nightly_2026-04-11T10-57-32-874Z`，summary runId: `gate_trio_summary_2026-04-11T10-58-09-148Z`）
4. `npm run gate:ai:trio:failure-summary -- --summary-path tmp/gates/gate-trio/gate_trio_summary_latest.json --output tmp/gates/gate-trio/gate_trio_failure_summary.md --pr-auto-prompt-output tmp/gates/gate-trio/gate_trio_pr_auto_prompt.md --ci-outcome failure --pr-auto-comment-status skipped --pr-auto-comment-reason fork_permission_restricted` -> `PASS`
5. workflow 自动评论对账口径：
   - fork/权限受限场景会输出 `prAutoCommentStatus/prAutoCommentReason/prAutoCommentOutcome`，并附带降级动作提示（手工粘贴 + 回填对账字段）。
   - PR 模板已同步 `autoCommentReconcileStatus/Reason` 字段，便于人工核对自动评论是否成功。

## 19. B3-C18 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-12T05-40-21-916Z`）
3. `npm run gate:ai:trio` -> `PASS`（nightly runId: `ai_nightly_2026-04-12T05-45-31-386Z`，summary runId: `gate_trio_summary_2026-04-12T05-45-46-735Z`）
4. docs 归档落地：
   - 原文迁移至 `docs/archive/prompts/`：
     - `PLANNER_RAG_GRAPH_PROMPTS.md`
     - `planner.prompt.md`
     - `AI_PARALLEL_WEEKLY_PLAN_2026_03_25.md`
     - `codex-multi-agent-audit-2026-03-20.md`
   - 原路径均保留 stub（仅“已归档 + 新路径”）。
5. 环境修复记录（与代码无关）：
   - 首次 nightly 失败由损坏归档包触发（`unexpected end of file`）。
   - 已把坏包隔离至 `tmp/world_save_slots_archive/_quarantine_corrupt/` 后复跑通过。

## 20. B3-C19 验证记录

1. `npm run build` -> `PASS`
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-12T05-40-21-916Z`）
3. `npm run gate:ai:trio` -> `PASS`（nightly runId: `ai_nightly_2026-04-12T05-45-31-386Z`，summary runId: `gate_trio_summary_2026-04-12T05-45-46-735Z`）
4. 旧路径回写：
   - `docs/archive/prompts/PLANNER_RAG_GRAPH_PROMPTS.md` 中两处 `docs/prompts/planner.prompt.md` 已回写为 `docs/archive/prompts/planner.prompt.md`。
5. archive/stub 逆向索引：
   - `docs/AI_PROMPT_CONTEXT_GOVERNANCE_2026_04_11.md` 与 `docs/PROMPT_ARCHIVE_CANDIDATES_2026_04_11.md` 已补齐双向映射与“新写链接使用 archive 主路径”口径。
6. 回滚演练记录（latest nightly 报告）：
   - `save_slots_archive_restore_rollback_drill_passed = true`
   - `executedAt = 2026-04-12T05:45:41.967Z`
   - `archivePath = tmp/world_save_slots_archive/world_save_slots.2026-04-11T09-34-13-073Z.json.gz`
   - `backupPath = tmp/gates/ai-nightly-acceptance/save-slots-rollback-drill/world_save_slots.rollback-drill.2026-04-12T05-45-43-878Z.json.restore.bak.1775972743878`

## 21. 下一默认推进

当前已核对 Batch3 执行进展：`B3-C01 ~ B3-C19` 已完成。

执行结论：

1. `AI_QUICK_NAV_INDEX_2026_04_10.md` 已从“建议创建并执行 B3-C19”切换为“建议推进 P5（docs 包 PR 收口）”。
2. docs 第三阶段已落地：旧路径回写完成，archive/stub 逆向索引已补齐，并附 rollback drill 实录。
3. P4 已完成（AnimatedSprite2D 8向 + 可复现验证 + 文档）；后续建议推进 P5：docs 包 PR 收口。
4. `P5` 已完成：已基于 `codex/week1-gate` 拆出 docs-only 可审阅变更包（见 `docs/CLOSEOUT_P5_DOCS_PR_PACKAGE_2026_04_12.md`）。


## 22. P5（docs 包 PR 收口）验证记录

1. docs-only 收口分支：`codex/week1-gate-docs-pack`（base: `codex/week1-gate`）。
2. 收口目标：在不引入非 docs 代码变更的前提下，形成可审阅、可合并的 docs 变更包。
3. 正式入口复用：`npm run build`、`npm run gate:ai:trio`。
4. 结果：`npm` 在当前终端环境触发 Node CSPRNG 断言（`Could not determine Node.js install directory`），本轮无法复跑 trio；已完成 docs 白名单校验与 UTF-8 回读（`19/19` 文件 `PASS`）。
