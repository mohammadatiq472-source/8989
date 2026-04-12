# Godot AI 玩家动画与原型兜底（2026-04-10）

## 1. 当前实现结论（可运行）

当前 AI 玩家表现已升级为可复用的 8 向动画骨架：

1. 单位标记动画入口：`godot-client/scripts/map/unit_marker.gd`
2. 回放驱动触发：`godot-client/scripts/map/unit_view_layer.gd`
3. 强度分级：`battle (1.20) > tile_control (0.82) > logistics (0.55)`
4. 方向支持：优先 `fromTileId/toTileId`，缺失时回退单位位移向量
5. Engage 视觉风格：`battle` 红色高冲量、`tile_control` 琥珀中冲量、`logistics` 蓝色低冲量（与强度顺序一致）

表现形态（当前）：

- `AnimatedSprite2D` 8 向（`run_*` + `idle_*`）
- replay 驱动 engage 两段脉冲（预压 -> 爆发 -> 回落）
- 移动动画按位移距离动态调速
- 与世界回放高亮对齐，支持 `unitId/tileId/fromTileId/toTileId`，缺失锚点时保留回退路径

## 2. 外部原型评估（llr104/slgclient）

仓库：`https://github.com/llr104/slgclient`

本地核查结果：

1. 技术栈：CocosCreator 3.4.0（非 Godot）
2. 动画资产：存在 8 向跑动 `.anim`（`qb_run_{d,l,ld,lu,r,rd,ru,u}.anim`）
3. 素材形态：大量 `.png + .plist + .json + .anim`，偏 Cocos 资产管线
4. 最近提交：`2024-06-01`（非“已废弃不可用”，但不是 Godot 直插）

结论：

- 可以作为“动作语义与方向规则原型参考”。
- 不建议直接搬资产到 Godot 作为正式方案（转换成本和管线风险高）。
- 更稳妥的是按其“8 向移动 + 状态切换”语义在 Godot 本地重建。

## 3. 建议落地顺序

1. 保留当前 `UnitMarker` 作为 fallback（保证 AI 可见、可验证）。
2. 在 Godot 新增 `AnimatedSprite2D` 版 `UnitView`（8 向 idle/run）。
3. 用当前 replay 高亮链继续驱动 engage（battle/tile_control/logistics）。
4. 后续再评估是否引入统一 spritesheet（而非直接吃 Cocos `.anim`）。

## 4. 复现命令

```powershell
# 打开 Godot 编辑器
D:\Apps\Godot\Godot_v4.6.2-stable_win64.exe --path godot-client

# 严格门禁（CI/验收口径）
npm run gate:godot:week1

# 控制面链路 smoke
npm run godot:ops:cli -- --output tmp/gates/godot_ops_bootstrap_unitview_latest.json bootstrap-chain
```

## 5. 给后续 AI 的检索锚点

- `docs/AI_QUICK_NAV_INDEX_2026_04_10.md`
- `docs/GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md`
- `docs/GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md`
- `godot-client/README.md`


## 6. P4 实施更新（2026-04-12）

1. 代码落地：
   - `unit_marker.gd` 已切换 `AnimatedSprite2D` 8 向动画主链，保留 fallback 圆环可视语义。
   - `unit_view_layer.gd` 已接入按位移距离调速（短距平滑，长距提速）。
2. 正式验证：
   - `npm run gate:godot:week1` -> `PASS`（`tmp/gates/godot_week1_gate_latest.json`）
   - `npm run gate:ai:trio` -> `PASS`（nightly runId: `ai_nightly_2026-04-12T06-02-44-650Z`，summary runId: `gate_trio_summary_2026-04-12T06-03-06-977Z`）
3. 收尾文档：
   - 见 `docs/CLOSEOUT_P4_AI_PLAYER_ANIMATION_2026_04_12.md`。
