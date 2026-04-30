# 资产使用索引（2026-04-28）

## 0. 快照范围

本索引覆盖 `godot-client/assets/themes/slgclient/**` 内的资产池，并补充 `docs/` 下资产/窗口交接文档的提交归属。它不声明玩法、主线接线或视觉设计完成。

## 1. 正式可用资产池

| 资产池 | 路径 | 机读索引 | 当前数量/口径 | 使用建议 |
| --- | --- | --- | --- | --- |
| 世界地图基础 | `current/world/map.tmx`、`current/world/cityComponent.*`、`current/world/component_outside.*`、`current/world/map_qibing.*` | `manifests/slgclient_asset_manifest.json` 的 `world` 段 | `current/world` 当前 113 文件，其中 PNG 72、JSON 4 | 可作为世界地图基础来源。不要绕过 manifest 直接猜帧语义。 |
| 世界资源地 | `current/world/resources` | `current/world/resources/world_resource_assets_manifest_v1.json` | 4 类资源，`grain/wood/stone/iron`，每类 `base + l01-l09`，共 40 PNG | 正式可用。按 `effective_footprint=[320,160]`、`anchor_pixel=[192,310]` 处理。 |
| 世界战略节点 | `current/world/*_base_v1.png` 与 `current/world/world_cell_*` | `current/world/world_cell_assets_manifest_v1.json`、`current/world/world_cell_footprint_manifest_v1.json` | 29 个 frame，10 个 composite，12 个 footprint | 正式可用。使用 composite id：`world_node_city_v1`、`world_node_capital_v1`、`world_node_system_city_3x3/5x5/7x7/9x9_v1`、`world_node_pass_sw/se_v1`、`world_node_fort_v1`、`world_node_dock_v1`。 |
| 骑兵世界地图帧 | `current/units/qibing_frames` | `manifests/unit_frames_manifest.json` | 8 方向 x 10 帧，共 80 PNG | 正式骑兵外显素材。不要当作步/弓/器械通用素材。 |
| 主线 UI 候选纹理 | `current/ui/native_shell_*`、`current/ui/skill/skill_type_*.svg` | `manifests/ui_manifest.json` | `current/ui` 当前 20 文件，其中 4 PNG、8 SVG、8 `.import` | 可作为当前主线 UI 候选。旧 `hud_v1` 不再作为参考。 |
| 头像/卡牌素材 | `current/generalpic` | `manifests/generalpic_manifest.json`、`manifests/generalpic_index.json` | selectedIdCount 448，fileCount 449，含 `head_wrap.png` | 可作为武将头像/卡牌素材池。不要扩散成通用 UI 语言。 |

## 2. 参考或局部可用资产池

| 资产池 | 路径 | 当前事实 | 使用边界 |
| --- | --- | --- | --- |
| overlay 旗帜/山体/要塞帧 | `current/overlays/frames` | 当前 62 PNG；`overlay_frames_manifest.json` 只列 `marker/home` 两组 51 帧 | 可作 marker/reference。不能覆盖 route、target、hostile、node state 的正式缺口。 |
| UI 根目录旧导入 | `current/ui/*.png` | 旧登录、旧面板、旧卡牌、旧选择框、旧 `hud_v1` 已删除；当前只剩 `native_shell_*` 新生成件 | 不再作为 reference/dev story 池。 |
| `btn`/旧 `skill` PNG | `current/ui/btn`、`current/ui/skill/tactics_*.png` | 已删除；`current/ui/skill` 只保留 `skill_type_*.svg` | 不再使用旧按钮/旧战法底图。 |
| 外部交换包 | `replacements/exchange_bundle` | `ui` segment 已删除；manifest 当前记录 world/generalpic/units/overlays/manifests 五段 | 给外部工具消费。窗口 1-4 不应直接接运行时。 |
| 源图标 | `source/svg_shell_icons` | 1 个 manifest，若干 SVG/导入源 | 源构造材料，不作为运行时资源池。 |

## 3. 已删除旧资产记录

- `current/ui/login_btn_denglu.png`
- `current/ui/login_btn_zhuce.png`
- `current/ui/bg_window_6.png`
- `current/ui/tipsbiaoti.png`
- `current/ui/diban_1.png`
- `current/ui/diban1_23.png`
- `current/ui/card_110500.png`
- `current/ui/card_bg.png`
- `current/ui/bg_vipshop_top.png`
- `current/ui/img_demon4.png`
- `current/ui/img_gem_21.png`
- `current/ui/img_shiyongz.png`
- `current/ui/zhuzha_mid_001.png`
- `current/ui/btn/**`
- `current/ui/hud_v1/**`
- `current/ui/skill/tactics_*.png`
- `replacements/exchange_bundle/ui/**`

这些文件已从资产池删除；若 dev story 或其他窗口仍引用，应该迁移到新资产语义，不应恢复旧图。

## 4. 缺口资产清单

| 缺口 | 需要交付的最小资产 | 当前可参考但不够正式的素材 | 建议 manifest id |
| --- | --- | --- | --- |
| route / 行军路线 | 主路径线、虚线路径线、转折点、方向箭头、路径端点吸附规则 | 无正式文件名命中；可参考等距网格与旗帜 marker 尺寸 | `map_route_line_v1`、`map_route_dash_v1`、`map_route_turn_v1`、`map_route_arrow_v1` |
| start/end marker | 起点 marker、终点 marker、落点 marker | `flag_*`、`out_flag_*` 只能做参考 | `map_marker_start_v1`、`map_marker_end_v1`、`map_marker_landing_v1` |
| attack/target marker | 攻击目标、攻城目标、集结目标 badge | 无正式文件名命中 | `map_target_attack_v1`、`map_target_siege_v1`、`map_target_rally_v1` |
| hostile/ownership overlay | friendly、enemy、neutral、contested、engaged 覆盖层 | manifest 已有状态语义，但没有正式状态图层 | `map_state_own_v1`、`map_state_enemy_v1`、`map_state_contested_v1`、`map_state_engaged_v1` |
| selection/disabled node state | hover、selected、disabled、cooldown | 旧 `actport_xfqp__box_select.png` 已删除，无正式可用旧参考 | `map_node_hover_v1`、`map_node_selected_v1`、`map_node_disabled_v1` |
| macro UI skin | province focus、warzone summary、nation banner/entry/palette、事件/国战二级页模板 | dev story 结构已有，但当前资产池未出现 province/warzone/nation/macro 文件命名 | `macro_province_focus_v1`、`macro_warzone_summary_v1`、`macro_nation_banner_v1`、`macro_event_page_shell_v1` |

## 5. Retired Preview 入口

旧 `province_layer / warzone_layer / nation_layer` 线不再作为资产可用清单入口：

- `godot-client/tools/run_ui_preview_sandbox_regression.py` 已移除 `08_province_layer_story.png`、`09_warzone_layer_story.png`、`10_nation_layer_story.png`。
- `godot-client/tools/validate_ui_preview_sandbox.py` 已移除 `province_layer -> warzone_layer -> nation_layer` 的跳转链。
- 因此本轮不删除 `scenes/dev/stories/*_layer_story.tscn` 或 `scripts/dev/stories/*_layer_story.gd`；它们仅作为待退役 preview 回归线存在，不再进入资产推荐。

## 6. 给窗口 1-4 的可用清单

### 窗口 1：主线/主壳

已删除：

- `current/ui/hud_v1/bg_window_3.png`
- `current/ui/hud_v1/dialog_bg.png`
- `current/ui/hud_v1/toast_bg.png`
- `current/ui/hud_v1/btn_red_1.png`
- `current/ui/hud_v1/btn_yellow_1.png`
- `current/ui/hud_v1/btn_set.png`

避免：

- `ui_theme_tokens.gd` 内置默认表继续引用旧 `hud_v1` 路径；请窗口 1 清理该脚本引用。
- `exchange_bundle/ui/**` 已删除，不要恢复。

### 窗口 2：世界地图/世界节点

可用：

- `current/world/world_cell_assets_manifest_v1.json`
- `current/world/world_cell_footprint_manifest_v1.json`
- `current/world/resources/world_resource_assets_manifest_v1.json`
- `current/world/pass_sw_base_v1.png`
- `current/world/pass_se_base_v1.png`
- `current/world/fort_base_v1.png`
- `current/world/dock_base_v1.png`
- `current/world/world_cell_city_ground_base_v1.png`
- `current/world/world_cell_node_ground_base_v1.png`
- `current/world/resources/world_resource_*_v1.png`

避免：

- 把 `gate` 当 runtime id。
- 用旧 overlay 代替节点状态图层。

### 窗口 3：地图交互覆盖层

可参考：

- `current/overlays/frames/flag_*.png`
- `current/overlays/frames/out_flag_*.png`

必须新补：

- route/path/march 线条与箭头。
- start/end/target marker。
- own/enemy/contested/engaged 覆盖层。
- hover/selected/disabled 节点状态 overlay。

### 窗口 4：宏观地图/preview 晋升

可参考：

- `current/overlays/frames` 中的 marker/旗帜只能用于尺度和锚点参考。
- `source/svg_shell_icons/**` 只能作为源构造材料。

必须新补：

- province focus 正式皮肤。
- warzone summary 正式皮肤。
- nation banner/entry/palette 正式皮肤。
- event / 国战 / 活动二级页模板包。

### 窗口 5：资产/文档治理

可提交的最小文档包：

- `docs/ASSET_MANIFEST_GOVERNANCE_2026_04_28.md`
- `docs/ASSET_USAGE_INDEX_2026_04_28.md`

可提交的资产治理包必须显式列路径，不能用 `git add godot-client/assets/themes/slgclient` 一把加：

- manifest 修改：`manifests/slgclient_asset_manifest.json`、`manifests/ui_manifest.json`、`manifests/ui_theme_tokens.json`、`manifests/overlay_frames_manifest.json`
- exchange bundle manifest 修改：`replacements/exchange_bundle/exchange_bundle_manifest.json` 与 `replacements/exchange_bundle/manifests/*.json`
- 旧 UI 删除：`current/ui/btn/**`、`current/ui/hud_v1/**`、`current/ui/skill/tactics_*.png`、`replacements/exchange_bundle/ui/**`
- 新 UI 候选：`current/ui/native_shell_*`、`current/ui/skill/skill_type_*.svg`

## 7. `docs/` 使用索引（2026-04-29）

| 类别 | 当前状态 | 处理建议 |
| --- | --- | --- |
| 窗口 5 资产治理文档 | 最小包固定为本文件与 manifest 治理口径 | 可随资产包提交；不要扩成整目录 `docs/` 提交。 |
| 资产相关参考文档 | `STZB_*`、`GODOT_VISUAL_REPLACEMENT_*`、`SUBAGENT_ASSET_AUDIT_*`、`GODOT_SVG_ICON_SOURCE_PACK_*`、`WORLD_STRATEGIC_NODE_ASSET_FINALIZATION_*` | 只作为读入锚点或对应 owner 交付，不自动进入窗口 5 提交。 |
| Godot UI / mainline 文档 | 多个 `GODOT_*`、`NATIVE_SLG_*`、`GENERAL_SKILL_*`、`WORLD_EVENT_ACTIVITY_*` | 归窗口 3/4/7/8 或主线集成窗口；窗口 5 只引用，不提交。 |
| world resource / world cell 文档 | 多个 `WORLD_RESOURCE_*`、`WORLD_CELL_*` | 归世界地图/资源 owner；资产窗口只引用 manifest 事实。 |
| AI / backend 文档 | 多个 `AI_PLAYER_*`、`AI_BACKEND_*` | 归 backend/shared owner，禁止混入资产包。 |
| automation / templates / migration | `docs/automation/**`、`docs/templates/**`、`USB_MIGRATION_*`、`NEW_MACHINE_*` | 流程或迁移材料，需主合并窗口单独判断。 |

## 8. 资产数量快照

- `current`：1374 文件，716 PNG，4 JSON。
- `current/world`：113 文件，72 PNG，4 JSON。
- `current/world/resources`：41 文件，40 PNG，1 JSON。
- `current/units/qibing_frames`：160 文件，80 PNG，80 `.import`。
- `current/overlays/frames`：124 文件，62 PNG，62 `.import`。
- `current/ui`：20 文件，4 PNG，8 SVG，8 `.import`。
- `current/ui/hud_v1`：已删除。
- `current/generalpic`：926 文件，476 PNG，449 `.import`。
- `replacements/exchange_bundle`：1198 文件，594 PNG，5 JSON，594 `.import`。

以上数量用于本轮治理索引，不替代后续正式导入脚本生成的 manifest。

## 9. 5B 续航索引（2026-04-30）

本轮复核 manifest 与文件树后，正式可用资产池未变化：

- 世界资源地：`current/world/resources/world_resource_assets_manifest_v1.json`，4 类资源，每类 `base + l01-l09`，40 PNG，继续按 `effective_footprint=[320,160]` 与 `anchor_pixel=[192,310]` 使用。
- 世界战略节点：`current/world/world_cell_assets_manifest_v1.json` 与 `current/world/world_cell_footprint_manifest_v1.json`，29 个 frame、10 个 composite、12 个 footprint；`pass` 仍是 runtime/manifest id，`gate` 只作展示别名。
- 主线 UI 候选：只看 `current/ui/native_shell_*` 与 `current/ui/skill/skill_type_*.svg`；`current/ui/hud_v1`、旧按钮、旧战法 PNG、`replacements/exchange_bundle/ui/**` 继续 retired。
- 外部交换包：`replacements/exchange_bundle/exchange_bundle_manifest.json` 仍为 world/generalpic/units/overlays/manifests 五段，`prunedOldUi=true`、`hudV1Removed=true`；它是消费快照，不是运行时权威。

当前缺口资产仍为：

- route/path/march 线条、转折、方向箭头。
- start/end/landing 与 attack/siege/rally target marker。
- own/enemy/neutral/contested/engaged 关系覆盖层。
- hover/selected/disabled/cooldown 节点状态 overlay。
- province/warzone/nation/event 二级页宏观 UI 皮肤包。

`docs/` 当前 owner 归属只做索引：

- 窗口 5B 可收：`docs/ASSET_MANIFEST_GOVERNANCE_2026_04_28.md`、`docs/ASSET_USAGE_INDEX_2026_04_28.md`。
- 窗口 8/formal_pack：`docs/FORMAL_PACK_ASSET_HANDOFF_2026_04_30.md`、`docs/FORMAL_PACK_COMPONENT_PACKAGE_2026_04_30.md`。
- backend/world-affairs：`docs/SCENARIO_WORLD_AFFAIRS_AUTOMATION_PROMPT_2026_04_30.md`、`docs/SCENARIO_WORLD_AFFAIRS_BACKEND_CONTRACT_2026_04_30.md`。
- 模板/武将档案 owner：`docs/templates/GENERAL_PROFILE_ROSTER_DRAFT_27.md`。
- 主窗口确认：`docs/AI_SLG_超大地图与AI玩家剧本设计参考.md`。

窗口 5B 不收 `server/**`、`shared/**`、`godot-client/scripts/ui/**`、`godot-client/scenes/**`、`godot-client/data/ui/**`、`godot-client/.godot/**`、顶层临时素材包、`.tools/**`、`.obsidian/**`、`.claudian/**`、`.copilot/**`、`00-OpenClaw-Hub/**`。
