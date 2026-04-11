# 持久化告警 Runbook（2026-04-09）

## 0. 目标与适用范围

这份 runbook 用于处理后端持久化健康告警，覆盖以下存储域：

1. `factionConfig`（Doctrine/BYOK 模型配置）
2. `aiConfig`（AI Hub 配置）
3. `v2Game`（V2 基础状态）
4. `session`（会话在线态）
5. `saveSlots`（世界 Save Slot 快照）

补充说明：

1. Save Slot 已纳入 `health.persistence.alerts` 聚合源（`persist_failures` / `quarantine_*`）。
2. Save Slot 同时是回放/门禁关键资产，因此本 runbook 保留“跨环境迁移最小检查链”。

统一观测入口：

1. `GET /api/health` -> `persistence.alerts`
2. 启动日志：`[startup-check][persistence][SEVERITY][source][code] ...`

---

## 1. 告警结构

`persistence.alerts[]` 单条结构：

```json
{
  "severity": "high|medium",
  "source": "factionConfig|aiConfig|v2Game|session|saveSlots",
  "code": "missing_encryption_key|plaintext_persist_enabled|persist_failures|quarantine_detected|quarantine_surge|save_slots_oversize_soft|save_slots_oversize_hard|save_slots_archive_failures|save_slots_lock_contention|save_slots_lock_failures|save_slots_restore_drill_failures|save_slots_restore_apply_failures|save_slots_restore_rollback_drill_failures",
  "message": "..."
}
```

说明：

1. 当前实现中未产出 `low` 告警，只有 `high/medium`。
2. 告警判定来自 `server/src/app.ts` 的 `buildPersistenceAlerts()`。

---

## 2. 告警码与阈值

| code | source | severity 规则 | 触发条件 | 处置优先级 |
| --- | --- | --- | --- | --- |
| `missing_encryption_key` | `factionConfig` | 固定 `high` | `secretPersistMode=memory_only`（未配置加密 key 且未允许明文） | P1 |
| `plaintext_persist_enabled` | `factionConfig` | 固定 `medium` | `FACTION_APIKEY_ALLOW_PLAINTEXT_PERSIST=1` | P2 |
| `persist_failures` | `factionConfig/aiConfig/v2Game/session/saveSlots` | `>=5 -> high`，否则 `medium` | `persistFailureCount > 0` | P1/P2 |
| `quarantine_detected` | `factionConfig/aiConfig/v2Game/session/saveSlots` | 固定 `medium` | `corruptQuarantineCount > 0 且 < 3` | P2 |
| `quarantine_surge` | `factionConfig/aiConfig/v2Game/session/saveSlots` | 固定 `high` | `corruptQuarantineCount >= 3` | P1 |
| `save_slots_oversize_soft` | `saveSlots` | 固定 `medium` | `fileSizeBytes >= softLimitBytes` | P2 |
| `save_slots_oversize_hard` | `saveSlots` | 固定 `high` | `fileSizeBytes >= hardLimitBytes` | P1 |
| `save_slots_archive_failures` | `saveSlots` | `>=3 -> high`，否则 `medium` | `archiveFailureCount > 0` | P1/P2 |
| `save_slots_lock_contention` | `saveSlots` | `>=3 -> high`，否则 `medium` | `lockContentionCount > 0` | P1/P2 |
| `save_slots_lock_failures` | `saveSlots` | 固定 `high` | `lockFailureCount > 0` | P1 |
| `save_slots_restore_drill_failures` | `saveSlots` | `>=3 -> high`，否则 `medium` | `restoreDrillFailureCount > 0` | P1/P2 |
| `save_slots_restore_apply_failures` | `saveSlots` | `>=3 -> high`，否则 `medium` | `restoreApplyFailureCount > 0` | P1/P2 |
| `save_slots_restore_rollback_drill_failures` | `saveSlots` | `>=3 -> high`，否则 `medium` | `restoreRollbackDrillFailureCount > 0` | P1/P2 |

Save Slot 默认阈值（可通过 env 覆盖）：

1. `WORLD_SAVE_SLOTS_SOFT_LIMIT_BYTES=134217728`（128 MiB）
2. `WORLD_SAVE_SLOTS_HARD_LIMIT_BYTES=536870912`（512 MiB）
3. `WORLD_SAVE_SLOTS_ARCHIVE_ON_SOFT_LIMIT=true`（soft 超限时自动归档）
4. `WORLD_SAVE_SLOTS_ARCHIVE_DIR=tmp/world_save_slots_archive`
5. `WORLD_SAVE_SLOTS_ARCHIVE_MAX_FILES=12`
6. `WORLD_SAVE_SLOTS_LOCK_STALE_MS=15000`

---

## 3. 值班处置流程（可执行）

### 3.1 T+0（10 分钟内）

1. 拉健康快照，确认告警集合与来源：
   - `GET /api/health`
2. 优先处理 `high`：
   - `missing_encryption_key`
   - `persist_failures`（高阈值）
   - `quarantine_surge`
3. 记录快照（时间、告警数组、各 store 计数）到值班记录。

### 3.2 T+10 ~ T+30（定位）

按 `source` 检查目标文件与计数：

1. `factionConfig.path`（默认 `tmp/faction_configs.json`）
2. `aiConfig.path`（默认 `tmp/ai_hub_configs.json`）
3. `v2Game.path`（默认 `tmp/v2_game_state.json`）
4. `session.path`（默认 `tmp/session_state.json`）
5. `saveSlots.path`（默认 `tmp/world_save_slots.json`）

优先看三类信号：

1. `persistFailureCount` 是否持续增长。
2. `corruptQuarantineCount` 是否增长并出现 `.corrupt.*` 文件。
3. `lastPersistErrorAt` 是否接近当前时间（持续性而非历史遗留）。

### 3.3 T+30 后（处置/升级）

1. `missing_encryption_key`：
   - 需要 BYOK 落盘时，补 `FACTION_APIKEY_ENCRYPTION_KEY`。
   - 不需要 BYOK 落盘时可登记“已接受风险”，保持 memory-only。
2. `plaintext_persist_enabled`：
   - 生产环境建议关闭 `FACTION_APIKEY_ALLOW_PLAINTEXT_PERSIST`。
3. `persist_failures` / `quarantine_*`：
   - 先备份异常文件，再检查磁盘权限、目录存在性、JSON 文件完整性。
   - 若持续增长，升级为 P1 故障并限制高风险写操作变更窗口。
4. `save_slots_oversize_*`：
    - soft：记录体积并安排归档/压缩窗口（P2）。
    - hard：立即冻结高频 save-slot 写操作变更并执行清理方案（P1）。
5. `save_slots_archive_failures` / `save_slots_lock_*`：
   - 先看 `persistence.saveSlots.archive* / lock*` 指标确认是持续增长还是历史残留。
   - `archiveFailureCount` 增长时，优先检查归档目录权限、磁盘空间、路径可写性。
   - `lockContentionCount` 增长时，优先排查是否存在并行实例同时写入 save-slot。
   - `lockFailureCount` 增长时，按 P1 处理（锁文件创建/释放异常会直接影响一致性保障）。
6. `save_slots_restore_drill_failures`：
   - 先调用 `POST /api/save-slots/archive/restore-drill` 复测并拿到失败原因。
   - 若 `archivePath` 空缺，优先检查 `archiveDir` 是否有有效 `.json.gz` 归档。
   - 若解压/解析失败，先隔离损坏归档，再补做一次可恢复归档。
7. `save_slots_restore_apply_failures`：
   - 先调用 `POST /api/save-slots/archive/restore` 做一次受控复测（建议指定 `archivePath`）。
   - 检查 `persistence.saveSlots.lastRestoreApplyMessage/lastRestoreApplyBackupPath`，确认是否已自动回滚。
   - 若回滚失败，按 P1 处理并人工恢复 `*.restore.bak.<ts>` 备份。
8. `save_slots_restore_rollback_drill_failures`：
   - 先调用 `POST /api/save-slots/archive/restore-rollback-drill` 复测。
   - 检查 `persistence.saveSlots.lastRestoreRollbackDrillMessage/lastRestoreRollbackDrillVerified`。
   - 若 `lastRestoreRollbackDrillVerified=false`，按 P1 处理并禁止执行高风险 restore 变更。

---

## 4. 标准验证链（正式入口）

1. 编译校验：
   - `npm run build`
2. 启动服务并查看健康：
   - `PORT=8788 npm start`
   - `GET http://127.0.0.1:8788/api/health`
3. 关注字段：
   - `persistence.alerts`
   - `persistence.factionConfig.persistFailureCount`
   - `persistence.aiConfig.persistFailureCount`
   - `persistence.v2Game.persistFailureCount`
   - `persistence.session.persistFailureCount`
   - `persistence.saveSlots.persistFailureCount`
   - `persistence.*.corruptQuarantineCount`
4. Nightly 汇总入口（B2-C13）：
   - `npm run gate:ai:nightly:acceptance`
   - 报告：`tmp/gates/ai-nightly-acceptance/ai_nightly_acceptance_latest.json`
5. Save Slot 迁移最小校验（B3-C03）：
   - 停服前完成最后一轮 flush（优先正常关停）。
   - 备份并复制 `tmp/world_save_slots.json`（或 `WORLD_SAVE_SLOTS_PATH` 指定文件）。
   - 启动目标环境后校验：
     - `GET /api/save-slots` 可读到迁移前 slot 元数据；
     - `npm run gate:ai:nightly:acceptance` 中 template replay 夹具三项通过：
      - `fixture_slot_primed`
      - `fixture_slot_loaded`
      - `fixture_backup_restored`
6. Save Slot 大文件门禁（B3-C05）：
   - 检查 nightly `checks`：`save_slots_not_hard_oversize=true`
   - 检查 nightly `alerts`：如出现 `save_slots_oversize_soft`，进入 P2 归档治理；若 `save_slots_oversize_hard`，按 P1 立即处置
7. Save Slot 归档与锁治理门禁（B3-C06）：
   - 检查 nightly `checks`：
     - `save_slots_archive_failures_absent=true`
     - `save_slots_lock_contention_absent=true`
     - `save_slots_lock_failures_absent=true`
   - 检查 `persistence.saveSlots`：
     - `archiveFileCount/archiveSuccessCount` 是否持续可增长
     - `lockContentionCount/lockFailureCount` 是否稳定在低位
8. Save Slot 归档恢复演练门禁（B3-C07）：
   - 检查 nightly `checks`：
     - `save_slots_archive_restore_drill_passed=true`
   - 手工复核 API：
     - `GET /api/save-slots/archive`
     - `POST /api/save-slots/archive/restore-drill`
    - 检查 `persistence.saveSlots`：
      - `restoreDrillSuccessCount/restoreDrillFailureCount`
      - `lastRestoreDrillStatus/lastRestoreDrillMessage`
9. Save Slot 真实恢复校验（B3-C08）：
   - 手工复核 API：
     - `POST /api/save-slots/archive/restore`
   - 检查 `persistence.saveSlots`：
      - `restoreApplySuccessCount/restoreApplyFailureCount`
      - `lastRestoreApplyStatus/lastRestoreApplyMessage`
      - `lastRestoreApplyArchivePath/lastRestoreApplyBackupPath`
10. Save Slot restore apply 门禁化（B3-C09）：
   - 检查 nightly `checks`：
     - `save_slots_restore_apply_metrics_observable=true`
     - `save_slots_restore_apply_failure_rollback_trace=true`
     - `save_slots_archive_restore_rollback_drill_passed=true`
   - 手工复核 API：
     - `POST /api/save-slots/archive/restore-rollback-drill`
   - 检查 `persistence.saveSlots`：
     - `restoreRollbackDrillSuccessCount/restoreRollbackDrillFailureCount`
     - `lastRestoreRollbackDrillStatus/lastRestoreRollbackDrillMessage`
     - `lastRestoreRollbackDrillBackupPath/lastRestoreRollbackDrillVerified`
11. Save Slot restore apply 正式 gate（B3-C10）：
   - 执行：
     - `npm run gate:save-slots:restore-apply:stability`
   - 检查报告：
     - `tmp/gates/save-slots-restore-apply-gate/save_slots_restore_apply_gate_latest.json`
   - 检查 nightly `checks`：
     - `save_slots_restore_apply_gate_exit_zero=true`
     - `save_slots_restore_apply_gate_report_parsed=true`
     - `save_slots_restore_apply_gate_passed=true`

---

## 5. 升级规则（建议）

1. P1（立即处理）：
   - 任意 `high` 告警
   - 或 30 分钟内 `persistFailureCount` 连续增长
2. P2（当日处理）：
   - 仅 `medium` 且计数不增长
3. P3（观察）：
   - 历史遗留 `medium`，当前窗口无新增失败/隔离

---

## 6. 已知边界

1. Save Slot 虽已纳入 alerts source，但跨环境迁移正确性仍需 nightly + 人工巡检双校验。
2. 目前无自动告警平台接入，仍以人工巡检为主。
3. 多实例一致性已具备最小锁治理与告警，但不等同于分布式强一致；高并发并行写场景仍需架构级统一写入口。

---

## 7. 关联文档

1. [TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md](TASK_2026_04_09_AI_WEEK2_AUTONOMOUS_EXEC_CARDS.md)
2. [AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md](AI_BACKEND_LOGIC_DEEP_READ_BATCH2_2026_04_09.md)
3. [PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md](PROJECT_EVOLUTION_NARRATIVE_2026_04_09.md)
4. [modules_v2/M01.md](modules_v2/M01.md)
