# 收尾总览（P4，AI 玩家动画增强版，2026-04-12）

## 0. 结论

`P4` 已完成：`UnitMarker` 升级为 `AnimatedSprite2D` 8 向动画主实现（保留 fallback 圆环可视语义），并在 `UnitViewLayer` 增加按位移距离调速；Godot Week1 gate 与 AI trio gate 均通过。

## 1. 改动文件

1. `godot-client/scripts/map/unit_marker.gd`
2. `godot-client/scripts/map/unit_view_layer.gd`
3. `docs/GODOT_AI_PLAYER_ANIMATION_FALLBACK_2026_04_10.md`
4. `docs/AI_QUICK_NAV_INDEX_2026_04_10.md`
5. `docs/AI_ENGINEER_HUB_2026_03_25.md`
6. `docs/CLOSEOUT_P4_AI_PLAYER_ANIMATION_2026_04_12.md`

## 2. 行为变更

1. `UnitMarker`：
   - 渲染核心从静态 `Sprite2D` 帧切换为 `AnimatedSprite2D`。
   - 由 `unit_frames_manifest.json` 自动构建 8 向 `run_*` 与 `idle_*` 动画集合。
   - 保留原有 engage profile（`battle/tile_control/logistics`）与颜色语义，不改门禁契约。
2. `UnitViewLayer`：
   - 移动动画按位移距离动态调速，长距离更快、短距离更稳。
   - replay/highlight 触发链保持不变，继续复用既有方向推断与 engage 触发。
3. 兼容性边界：
   - fallback 圆环绘制仍在，避免资源缺失时完全不可见。
   - 未引入临时脚本；仅复用正式入口命令。

## 3. 正式验证链

1. `npm run gate:godot:week1` -> `PASS`
   - report: `tmp/gates/godot_week1_gate_latest.json`
   - 关键 step: `godot-headless`、`unitview-engage-intensity-contract`、`unitmarker-engage-profile-contract`、`theme-manifest-contract` 均为 `ok=true`
2. `npm run gate:ai:trio` -> `PASS`
   - nightly runId: `ai_nightly_2026-04-12T06-02-44-650Z`
   - summary runId: `gate_trio_summary_2026-04-12T06-03-06-977Z`

## 4. 风险与边界

1. `gate:godot:week1` 依赖后端 `:8787` 可达；离线/后端未启动时会出现 `status=-1` 失败，非动画逻辑回归。
2. 当前动画资源来自现有 manifest 帧序列（run 主导）；`idle` 由每向首帧构成，后续可再补专用 idle 帧集。

## 5. 下一步建议

1. 推进 `P5`（docs 包 PR 收口）：整理 docs 变更包到可审阅/可合并状态。
