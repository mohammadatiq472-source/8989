# Gate Trio 交接入口（2026-04-10）

## 0. 目标

给后续 AI 一个单入口，快速完成“执行门禁 -> 看报告 -> 定位失败点”。

---

## 1. 一条命令执行三件套

```powershell
npm run gate:ai:trio
```

等价于依次执行：

1. `npm run gate:session:security`
2. `npm run gate:ai:mainline:stability`
3. `npm run gate:ai:nightly:acceptance`

说明：

1. `gate:ai:trio` 在 nightly 阶段默认启用 `reuse_latest_reports` 模式（复用刚跑完的 session/mainline 报告）。
2. 若要强制 nightly 全量独立执行（不复用），直接运行：
   - `npm run gate:ai:nightly:acceptance`
3. 若要生成 CI/PR 可复制失败摘要模板，运行：
   - `npm run gate:ai:trio:failure-summary -- --summary-path tmp/gates/gate-trio/gate_trio_summary_latest.json --output tmp/gates/gate-trio/gate_trio_failure_summary.md`

---

## 2. 必看报告路径（latest）

1. Session 安全：`tmp/gates/session-security-gate/session_security_gate_latest.json`
2. Mainline 主链：`tmp/gates/ai-mainline-stability/ai_mainline_stability_latest.json`
3. Nightly 汇总：`tmp/gates/ai-nightly-acceptance/ai_nightly_acceptance_latest.json`
4. Template Replay：`tmp/gates/ai_ops_template_replay_latest.json`
5. Gate Trio 汇总：`tmp/gates/gate-trio/gate_trio_summary_latest.json`
6. Restore Apply Gate：`tmp/gates/save-slots-restore-apply-gate/save_slots_restore_apply_gate_latest.json`

---

## 3. 最小通过标准

1. `gate:session:security` 退出码 `0`
2. `gate:ai:mainline:stability` 退出码 `0`
3. `gate:ai:nightly:acceptance` 退出码 `0`
4. nightly 报告内以下检查为 `true`：
   - `template_replay_report_parsed`
   - `template_replay_passed`
   - `template_replay_fixture_checks_passed`
   - `template_replay_all_steps_required`
   - `persistence_snapshot_available`（含 `saveSlotsPath`）
   - `save_slots_not_hard_oversize`
   - `save_slots_archive_failures_absent`
   - `save_slots_lock_contention_absent`
   - `save_slots_lock_failures_absent`
   - `save_slots_archive_restore_drill_passed`
   - `save_slots_restore_apply_metrics_observable`
   - `save_slots_restore_apply_failure_rollback_trace`
   - `save_slots_archive_restore_rollback_drill_passed`
   - `save_slots_restore_apply_gate_exit_zero`
   - `save_slots_restore_apply_gate_report_parsed`
   - `save_slots_restore_apply_gate_passed`
5. 若 `executionMode=reuse_latest_reports`，还需以下检查为 `true`：
   - `mainline_report_fresh_when_reuse`
   - `template_replay_report_fresh_when_reuse`
   - `session_security_report_fresh_when_reuse`
6. trio summary 抽样中以下检查为 `true`：
   - `save_slots_restore_apply_gate_passed`
   - `nightly_references_latest_restore_apply_gate`
   - `save_slots_restore_apply_three_phase_semantics`
7. trio summary 新鲜度检查为 `true`：
   - `session_security_report_fresh`
   - `mainline_report_fresh`
   - `nightly_report_fresh`
   - `template_replay_report_fresh`
   - `save_slots_restore_apply_report_fresh`
8. trio summary 若包含陈旧项，需可读 `freshnessTriage`：
   - `staleDetected/staleCount/highestSeverity`
   - `items[].severity`（`stale_notice/stale_warning/stale_high/stale_critical/unknown`）
   - `items[].troubleshooting.*`（主命令/组件命令/summary 重跑命令）

---

## 4. 快速排障矩阵

| 失败点 | 优先看哪里 | 典型原因 | 首个动作 |
| --- | --- | --- | --- |
| `session_security_gate_exit_zero=false` | `sessionSecurityGate.stdoutTail/stderrTail` | token 生命周期、401 语义回归 | 先跑 `npm run gate:session:security` 单测并看 latest 报告 |
| `mainline_gate_exit_zero=false` | `mainlineGate.stdoutTail/stderrTail` | tick/dispatch/reflect 链失败 | 先跑 `npm run gate:ai:mainline:stability`，再看 `templateReplay` 节点 |
| `template_replay_passed=false` | `tmp/gates/ai_ops_template_replay_latest.json` | 模板动作失败或回放超时 | 先看 `checks` 与 `steps`，确认 `requiredFailedSteps` |
| `template_replay_fixture_checks_passed=false` | `templateReplayGate` + replay `checks` | fixture 预置/加载/恢复链断裂 | 核对 `fixture_slot_primed`、`fixture_slot_loaded`、`fixture_backup_restored` |
| `save_slots_not_hard_oversize=false` | nightly `checks` + `persistence.saveSlots` | Save Slot 文件超过 hard 阈值 | 先按 `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md` 执行 P1 处置（归档/压缩/窗口限流） |
| `save_slots_archive_failures_absent=false` | nightly `checks` + `persistence.saveSlots.archive*` | 归档目录不可写、磁盘不足、压缩失败 | 先排查 `archiveDir` 权限/剩余空间，再触发一次 `POST /api/save-slots/save` 复测 |
| `save_slots_lock_contention_absent=false` | nightly `checks` + `persistence.saveSlots.lock*` | 多实例并发写同一 save-slot 文件 | 先确认是否存在重复实例；必要时收敛为单写实例并观察计数是否停止增长 |
| `save_slots_lock_failures_absent=false` | nightly `checks` + `alerts[save_slots_lock_failures]` | 锁文件创建/释放失败 | 按 P1 处理，先排查 lock 路径权限与外部占用 |
| `save_slots_archive_restore_drill_passed=false` | nightly `checks` + `details.message` | 归档损坏/无有效归档导致 restore drill 失败 | 先跑 `GET /api/save-slots/archive` 与 `POST /api/save-slots/archive/restore-drill`，根据错误信息修复归档 |
| `save_slots_restore_apply_metrics_observable=false` | nightly `checks` + `persistence.saveSlots.lastRestoreApply*` | restore apply 指标未落地或结构漂移 | 先核对 `WorldService.getSaveSlotsPersistHealth()` 与 nightly 报告字段 |
| `save_slots_restore_apply_failure_rollback_trace=false` | nightly `checks` + `details.lastRestoreApplyMessage` | restore apply 失败后缺少回滚痕迹 | 先跑 `POST /api/save-slots/archive/restore` 复测，并确认失败消息含 rollback 结果 |
| `save_slots_archive_restore_rollback_drill_passed=false` | nightly `checks` + `details.message` | 自动回滚演练失败或校验失败 | 先跑 `POST /api/save-slots/archive/restore-rollback-drill` 复测，并检查 `lastRestoreRollbackDrillVerified` |
| `save_slots_restore_apply_gate_passed=false` | nightly `checks` + `saveSlotsRestoreApplyGate.stdoutTail` | restore apply 三段行为 gate 失败（幂等/force 语义漂移） | 先单跑 `npm run gate:save-slots:restore-apply:stability` 并查看 latest report |
| `nightly_references_latest_restore_apply_gate=false` | trio summary `checks` + `reports.saveSlotsRestoreApply.runId` | nightly 与 restore-apply latest runId 失配 | 先重跑 `npm run gate:ai:trio`，再比对 nightly `saveSlotsRestoreApplyGate.runId` 与 restore gate latest `runId` |
| `save_slots_restore_apply_three_phase_semantics=false` | trio summary `checks` + `reports.saveSlotsRestoreApply.restore` | restore 三段语义漂移（非 restored/skipped/restored） | 先单跑 `npm run gate:save-slots:restore-apply:stability`，确认 `restore.first/second/thirdStatus` |
| `*_report_fresh=false`（trio summary） | trio summary `checks` + `reports.*.ageSec` + `freshnessTriage.items[]` | 上游 latest 报告陈旧，超过 freshness 阈值 | 先执行 `npm run gate:ai:trio`；再看 `freshnessTriage.items[].troubleshooting` 选择组件级补跑 |
| `freshnessTriage.highestSeverity=stale_high/stale_critical/unknown` | trio summary `freshnessTriage` | 陈旧程度高或时间戳异常，单跑 summary 无法收敛 | 先执行 `npm run gate:ai:trio`；若仍失败，检查本机时钟/文件时间并视情况调整 `GATE_TRIO_SUMMARY_MAX_REPORT_AGE_SEC` |
| `ai-trio-gate` workflow 失败 | GitHub Actions `GITHUB_STEP_SUMMARY` + `tmp/gates/gate-trio/gate_trio_failure_summary.md` | PR/CI 运行中 gate 失败需快速粘贴排障摘要 | 复制 `PR Failure Summary Template` 到 PR 描述，再执行 `primaryRecommendation` |
| `ai-trio-gate` workflow 失败且 `highRiskStaleCount>0` | Step Summary `:red_circle: STALE HIGH-RISK HIGHLIGHT (Auto)` + `tmp/gates/gate-trio/gate_trio_pr_auto_prompt.md` + PR 讨论区自动评论 | 出现高危陈旧（`stale_high/stale_critical/unknown`）且在 PR 线程易漏判 | 优先执行 `primaryRecommendation` 刷新主链；默认自动创建/更新高危提示评论，若 PR 描述设为 `ai-trio-auto-comment: manual` 则改为人工粘贴并更新 `Gate Trio Failure Snapshot` |
| `prAutoCommentStatus=skipped` 且 `prAutoCommentReason=fork_permission_restricted/permission_denied` | Step Summary `PR Auto Comment Reconcile` + `tmp/gates/gate-trio/gate_trio_pr_auto_comment_reconcile_latest.json` | fork 或 token 权限受限导致无法自动评论 | 使用 PR 模板手工粘贴 `PR Auto Prompt (Failure/High-Risk)`，并在模板记录 `autoCommentReconcileStatus/Reason` 对账字段 |
| `alerts` 含 `save_slots_restore_apply_failures` | nightly `alerts` + `persistence.saveSlots.lastRestoreApply*` | 真实恢复失败且回滚可能异常 | 先跑 `POST /api/save-slots/archive/restore` 复测，并检查 `lastRestoreApplyMessage/lastRestoreApplyBackupPath` |
| `alerts` 含 `save_slots_restore_rollback_drill_failures` | nightly `alerts` + `persistence.saveSlots.lastRestoreRollbackDrill*` | 回滚演练失败，恢复护栏可信度下降 | 先冻结高风险 restore 变更，再定位回滚失败原因 |
| `blocking_high_alerts_absent=false` | nightly `alerts` | 持久化高危告警超白名单 | 先按 `docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md` 处置 |

---

## 5. 机器可读抽样命令

```powershell
py -3.11 -c "import json, pathlib; p=pathlib.Path('tmp/gates/ai-nightly-acceptance/ai_nightly_acceptance_latest.json'); r=json.loads(p.read_text(encoding='utf-8')); print(r['runId'], r['passed']); print({c['name']: c['passed'] for c in r['checks'] if c['name'].startswith('template_replay_')})"
```

```powershell
py -3.11 -c "import json, pathlib; p=pathlib.Path('tmp/gates/gate-trio/gate_trio_summary_latest.json'); r=json.loads(p.read_text(encoding='utf-8')); print(r['runId'], r['overallPassed']); print(r['reports']['nightly']['executionMode'])"
```

```powershell
py -3.11 -c "import json, pathlib; p=pathlib.Path('tmp/gates/gate-trio/gate_trio_summary_latest.json'); r=json.loads(p.read_text(encoding='utf-8')); s=r['reports']['saveSlotsRestoreApply']; print(s['runId'], s['passed']); print(s.get('restore')); print({c['name']: c['passed'] for c in r['checks'] if c['name'].startswith('save_slots_restore_apply') or c['name'].startswith('nightly_references_latest_restore_apply')})"
```

```powershell
py -3.11 -c "import json, pathlib; p=pathlib.Path('tmp/gates/gate-trio/gate_trio_summary_latest.json'); r=json.loads(p.read_text(encoding='utf-8')); print(r['policy']); print(r.get('artifacts')); print({c['name']: c['passed'] for c in r['checks'] if c['name'].endswith('_report_fresh')})"
```

```powershell
py -3.11 -c "import json, pathlib; p=pathlib.Path('tmp/gates/gate-trio/gate_trio_summary_latest.json'); r=json.loads(p.read_text(encoding='utf-8')); t=r.get('freshnessTriage', {}); print({'staleDetected': t.get('staleDetected'), 'staleCount': t.get('staleCount'), 'highestSeverity': t.get('highestSeverity')}); print([(i.get('checkName'), i.get('severity'), i.get('overdueSec')) for i in t.get('items', [])]); print([(i.get('checkName'), i.get('troubleshooting', {}).get('primaryCommand'), i.get('troubleshooting', {}).get('componentRefreshCommand')) for i in t.get('items', []) if i.get('stale')])"
```

```powershell
npm run gate:ai:trio:failure-summary -- --summary-path tmp/gates/gate-trio/gate_trio_summary_latest.json --output tmp/gates/gate-trio/gate_trio_failure_summary.md
```

```powershell
npm run gate:ai:trio:failure-summary -- --summary-path tmp/gates/gate-trio/gate_trio_summary_latest.json --output tmp/gates/gate-trio/gate_trio_failure_summary.md --ci-outcome failure
```

```powershell
py -3.11 -c "import json, pathlib; p=pathlib.Path('tmp/gates/gate-trio/gate_trio_pr_auto_comment_reconcile_latest.json'); r=json.loads(p.read_text(encoding='utf-8')); print(r)"
```

---

## 6. 关联文档

1. `docs/modules_v2/M18.md`
2. `docs/CLOSEOUT_B2_C22_2026_04_10.md`
3. `docs/CLOSEOUT_B2_C23_2026_04_10.md`
4. `docs/CLOSEOUT_B3_C01_2026_04_10.md`
5. `docs/CLOSEOUT_B3_C02_2026_04_10.md`
6. `docs/CLOSEOUT_B3_C04_2026_04_10.md`
7. `docs/CLOSEOUT_B3_C05_2026_04_10.md`
8. `docs/CLOSEOUT_B3_C06_2026_04_10.md`
9. `docs/CLOSEOUT_B3_C07_2026_04_11.md`
10. `docs/CLOSEOUT_B3_C08_2026_04_11.md`
11. `docs/CLOSEOUT_B3_C09_2026_04_11.md`
12. `docs/CLOSEOUT_B3_C10_2026_04_11.md`
13. `docs/CLOSEOUT_B3_C11_2026_04_11.md`
14. `docs/CLOSEOUT_B3_C12_2026_04_11.md`
15. `docs/CLOSEOUT_B3_C13_2026_04_11.md`
16. `docs/CLOSEOUT_B3_C14_2026_04_11.md`
17. `docs/CLOSEOUT_B3_C15_2026_04_11.md`
18. `docs/AI_QUICK_NAV_INDEX_2026_04_10.md`
