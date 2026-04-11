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
2. `npm run gate:ai:nightly:acceptance` -> `PASS`（runId: `ai_nightly_2026-04-11T07-07-16-391Z`）
3. `npm run gate:ai:trio` -> `PASS`（nightly runId: `ai_nightly_2026-04-11T07-13-15-653Z`，summary runId: `gate_trio_summary_2026-04-11T07-13-34-657Z`）
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

## 13. 下一默认推进

建议推进 `B3-C12`：收敛 `gate-trio` summary 产物保留策略（`latest + 最近 N 份`）并补 trio-summary 新鲜度显式检查，进一步压降门禁目录噪声。
