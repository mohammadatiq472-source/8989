# 资产索引与 Manifest 治理口径（2026-04-28）

## 0. 窗口边界

本文件只定义资产来源、manifest、命名、可复用/不可用分类、交换包边界，并补充 `docs/` 下资产/窗口交接文档的归属口径。它不做视觉设计，不接主线，不改玩法逻辑，不修改 Godot 主壳或地图/UI 脚本。

## 1. 本轮已读锚点

- `AGENTS.md`
- `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
- `CODEX.md`
- `docs/STZB_ASSET_REUSE_GUIDE.md`
- `docs/GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md`
- `docs/SUBAGENT_ASSET_AUDIT_2026_04_11.md`
- `C:\Users\26739\Desktop\8989_必需资产缺口清单_率土三战对标版.md`
- `C:\Users\26739\Desktop\8989_资产执行拆单版.md`
- `C:\Users\26739\Desktop\8989_资产评分与优化建议_AI投喂版.md`

## 2. 目录权威口径

| 目录 | 用途 | 治理结论 |
| --- | --- | --- |
| `godot-client/assets/themes/slgclient/current` | 当前 Godot 可消费资产池 | 只有已被具体 manifest 约束、且几何/命名/入口明确的子集可算正式资源。不能把整个 `current` 目录等价为主线成品。 |
| `godot-client/assets/themes/slgclient/manifests` | 导入脚本生成的机读清单根 | 通用索引与交换用清单根。`slgclient_asset_manifest.json` 是导入快照，不应单独覆盖后续世界节点/资源生成清单。 |
| `godot-client/assets/themes/slgclient/current/world/*.json` | 世界地图生成资产清单 | `world_cell_assets_manifest_v1.json`、`world_cell_footprint_manifest_v1.json`、`resources/world_resource_assets_manifest_v1.json` 是世界节点与资源地几何权威。 |
| `godot-client/assets/themes/slgclient/replacements` | 候选替换池 | 只能作为候选或待交换素材池。未晋升到 `current` 且未进入 manifest 前，不算正式资源。 |
| `godot-client/assets/themes/slgclient/replacements/exchange_bundle` | 对外交换包 | 给外部视觉工具、索引工具、独立窗口消费的快照出口。不是运行时权威，也不是资产源头。旧 UI segment 已在本轮清理。 |
| `godot-client/assets/themes/slgclient/source` | 源文件/生成源 | 只作为参考与再生成输入，不直接给主线引用。 |

## 3. 正式主线资源判定规则

一个资产要进入正式可用池，必须同时满足：

1. 路径在 `current` 下，或被 `current/world/*.json` 明确引用。
2. 有机读 manifest 记录来源、尺寸、命名、贴图路径或几何约束。
3. 对世界地图资产，必须满足 `map.tmx` 等距网格约束：运行时 tile 口径为 `200x100`，资源地有效 footprint 为 `320x160`，锚点遵循 manifest 中的 `bottom_center` / `anchor_pixel`。
4. 对战略节点资产，必须使用 `world_cell_assets_manifest_v1.json` 的 composite id 和 `world_cell_footprint_manifest_v1.json` 的 footprint id，不允许用 display alias 代替 runtime id。
5. 对 UI 资产，只有当前主线明确使用、且仍存在于 `current/ui` 的 `native_shell_*` 与 `skill_type_*` 子集可以作为正式候选；`hud_v1`、旧按钮、旧面板和旧战法 PNG 不再作为主线风格参考。
6. 必须可通过正式入口或明确的只读机读校验复现；临时脚本只能放在 `tmp/`，且不能成为交付入口。

## 4. Manifest 路径统一

正式索引入口如下：

- 总导入快照：`godot-client/assets/themes/slgclient/manifests/slgclient_asset_manifest.json`
- UI 导入索引：`godot-client/assets/themes/slgclient/manifests/ui_manifest.json`
- 武将/头像索引：`godot-client/assets/themes/slgclient/manifests/generalpic_manifest.json`
- 武将/头像查询索引：`godot-client/assets/themes/slgclient/manifests/generalpic_index.json`
- 部队帧索引：`godot-client/assets/themes/slgclient/manifests/unit_frames_manifest.json`
- overlay 帧索引：`godot-client/assets/themes/slgclient/manifests/overlay_frames_manifest.json`
- 世界资源地索引：`godot-client/assets/themes/slgclient/current/world/resources/world_resource_assets_manifest_v1.json`
- 世界战略节点索引：`godot-client/assets/themes/slgclient/current/world/world_cell_assets_manifest_v1.json`
- 世界战略节点 footprint：`godot-client/assets/themes/slgclient/current/world/world_cell_footprint_manifest_v1.json`
- 交换包快照：`godot-client/assets/themes/slgclient/replacements/exchange_bundle/exchange_bundle_manifest.json`

治理注意：

- `slgclient_asset_manifest.json` 的 `importedAt` 当前是 `2026-04-12T18:04:29+00:00`，而世界节点包标记为 `2026-04-28`。因此总导入快照不能单独代表 2026-04-28 后新增的世界节点资产状态。
- `overlay_frames_manifest.json` 当前只列 `marker/home` 两组 51 帧；总导入快照里仍出现 `resource/terrain/edge` 计数。这是 manifest 口径漂移信号。窗口 1-4 不应基于总快照的 overlay 分组直接接主线。
- `exchange_bundle` 的 manifest 是外部消费快照；本轮已移除旧 `ui` segment，窗口 1-4 不应再从 `exchange_bundle/ui/**` 消费 UI。

## 5. 命名治理

- 战略节点 runtime id 使用 `pass`、`fort`、`dock`、`resource`、`player_city`、`ai_city`、`system_city`。`gate` 只能作为展示别名，不作为文件名、manifest id 或测试 id。
- 世界资源使用 `grain`、`wood`、`stone`、`iron` 四类，等级使用 `base`、`l01` 到 `l09`。
- 部队帧方向使用 `r/ru/u/lu/l/ld/d/rd`，每方向 10 帧。
- 新增 route、target、hostile、node state、macro UI 资产时，必须先给出稳定 id，再生成 PNG/SVG，再补 manifest；不能只交散图。

## 6. 旧资产池清理状态

本轮已清理白名单内旧 UI 根目录、旧按钮、旧战法 PNG 和 `exchange_bundle/ui` 镜像：

- `godot-client/assets/themes/slgclient/current/ui` 根目录旧导入 PNG，例如 `login_btn_denglu.png`、`login_btn_zhuce.png`、`bg_window_6.png`、`tipsbiaoti.png`、`diban_1.png`、`diban1_23.png`、`card_110500.png` 已删除。
- `current/ui/btn`、`current/ui/hud_v1` 与 `current/ui/skill/tactics_*.png` 旧项目语义按钮/旧派生纹理/旧战法底图已删除。
- `replacements/exchange_bundle/ui/**` 旧镜像已删除，`exchange_bundle_manifest.json` 已移除 `ui` segment。
- `godot-client/assets/themes/slgclient/manifests/ui_theme_tokens.json` 已标记 retired，不再宣传旧 `hud_v1` 路径。
- 风险：`godot-client/scripts/ui/ui_theme_tokens.gd` 的内置默认表仍硬编码旧 `hud_v1` 路径；该脚本在窗口 5 禁改范围内，交给窗口 1 替换或删除引用。
- 当前 `current/ui` 实际只保留 `native_shell_main_nav_button_*_v1`、`native_shell_troop_row_base_v1` 和 `skill/skill_type_*.svg`；`current/ui/hud_v1` 与 `replacements/exchange_bundle/ui` 目录已不存在。
- `current/generalpic` 中的大量头像/卡牌图，只能作为武将头像/卡牌素材池，不作为 UI 风格语言来源。
- `current/overlays/frames` 中的旗帜、山体、`sys_fortress.png` 可以做参考或局部 overlay 素材，但不能替代正式 route、target、hostile、node state 覆盖层。
- `source/svg_shell_icons/**` 是源构造材料，不是运行时资产池。

## 7. 已确认缺口

| 缺口 | 当前事实 | 治理建议 |
| --- | --- | --- |
| route / 行军路线 | 文件名扫描未发现 `route/path/march/line` 类正式资产。 | 需要独立生成路径线、转折点、方向箭头、虚线/实线规范，并写入 manifest。 |
| target / 起终点/攻城目标 | 文件名扫描未发现 `target/goal/attack` 类正式资产。当前只有旗帜类 marker。 | 需要起点、终点、攻击目标、攻城目标 badge，不能复用旧旗帜当最终语义。 |
| hostile / 敌对态 | 文件名扫描未发现 `hostile/enemy/occupy/capture/combat` 类正式 overlay。 | 需要 own/enemy/neutral/contested/engaged 关系层，保持在节点 composite 之上渲染。 |
| node state / 节点状态 | `world_cell_assets_manifest_v1.json` 已定义 neutral/own/enemy/selectable/disabled 语义，但没有独立正式状态 overlay 图。 | 状态资产必须作为 overlay 层，不得替换节点 composite 或改变 footprint。 |
| macro UI / 宏观地图 UI | 文件名扫描未发现 `province/warzone/nation/macro` 类正式资产。外部复查文档确认当前主要停留在 dev story。 | 需要 province focus、warzone summary、nation banner/entry/palette、事件/国战二级页模板的正式皮肤包。 |

## 8. Retired Preview 线

旧 `province_layer / warzone_layer / nation_layer` 线不再作为资产索引入口或正式视觉资产来源。

只读核查结果：

- `godot-client/tools/run_ui_preview_sandbox_regression.py` 已移除 `08_province_layer_story.png`、`09_warzone_layer_story.png`、`10_nation_layer_story.png` 三个旧基线。
- `godot-client/tools/validate_ui_preview_sandbox.py` 已移除 `map_surface -> province_layer -> warzone_layer -> nation_layer` 的 story 跳转期望。
- 对应 `godot-client/scenes/dev/stories/*_layer_story.tscn`、`godot-client/scripts/dev/stories/*_layer_story.gd` 与 `godot-client/data/ui_preview/stories/*_layer_story.json` 当前在工作树中已缺失/待删除。

治理结论：本窗口只把该线从资产索引语义中标记为 retired。是否提交这些 dev story 删除由主合并窗口或对应 UI preview owner 决定；窗口 5 不再把它们列为资产来源。

## 9. 给窗口 1-4 的资产建议

- 窗口 1（主线/壳）：旧 `hud_v1` 资产已删除。请清理 `ui_theme_tokens.gd` 内置默认表中旧 `hud_v1` 路径，改用新的主线 UI 资产或无纹理样式。
- 窗口 2（世界地图/世界节点）：使用 `current/world/world_cell_assets_manifest_v1.json`、`current/world/world_cell_footprint_manifest_v1.json`、`current/world/resources/world_resource_assets_manifest_v1.json`。保持 `200x100` 等距网格与 `320x160` 资源 footprint。
- 窗口 3（地图交互覆盖层）：route、target、hostile、node state 仍是缺口。旧 `actport_xfqp__box_select.png` 已删除，正式交付必须新建语义清单，不要把旧 UI 资源直接提升为主线。
- 窗口 4（宏观地图/preview 晋升）：旧 province/warzone/nation preview 线已标记 retired。先从 `run_ui_preview_sandbox_regression.py` 和 `validate_ui_preview_sandbox.py` 移除相关 story 期望，再删除对应 scene/script 文件。

## 10. `docs/` 文档归属治理（2026-04-29）

本轮只读扫描 `docs/` 下 212 个文件：142 个 clean、10 个 modified、60 个 untracked。`docs/` 噪音不能跟资产包混合提交，必须按窗口归属分包。

| 文档归属 | 数量/状态 | 治理结论 |
| --- | --- | --- |
| asset governance | 9 个，其中 `docs/ASSET_MANIFEST_GOVERNANCE_2026_04_28.md`、`docs/ASSET_USAGE_INDEX_2026_04_28.md` 为窗口 5 本轮正式索引输出 | 可随窗口 5 资产包提交；其他资产类文档需确认 owner 后再并入。 |
| godot UI / mainline | 35 个，其中 21 个 untracked、4 个 modified | 属窗口 3/4/7/8 或主线 UI owner，窗口 5 只索引，不替它们合并。 |
| world map / resource | 12 个 untracked | 属世界地图/资源/战略节点 owner；与资产 manifest 有引用关系，但不自动进入窗口 5 提交。 |
| AI / backend | 33 个，其中 14 个 untracked、3 个 modified | 属 backend/shared/AI owner，禁止混入视觉或资产提交。 |
| automation / templates / migration | 10 个 untracked | 属流程记录或迁移材料；除非主合并窗口指定，不进入资产包。 |
| archive / legacy / other clean docs | 109 个以上 | 只作为历史参考，不因本轮资产治理改动。 |

窗口 5 可提交的 `docs/` 最小包：

- `docs/ASSET_MANIFEST_GOVERNANCE_2026_04_28.md`
- `docs/ASSET_USAGE_INDEX_2026_04_28.md`

禁止窗口 5 代为提交的典型文档：

- `docs/AI_PLAYER_*.md`
- `docs/AI_BACKEND_*.md`
- `docs/NATIVE_SLG_*.md`
- `docs/GODOT_MAIN_CITY_CONTEXT_SMOKE_ACCEPTANCE_2026_04_29.md`
- `docs/GODOT_MOBILE_LANDSCAPE_UI_TOUCH_TARGETS_2026_04_28.md`
- `docs/WORLD_RESOURCE_*.md`
- `docs/WORLD_CELL_*.md`
- `docs/automation/**`
- `docs/templates/**`
- `docs/USB_MIGRATION_*.md`

## 11. 正式入口

优先验证入口：

```powershell
npm run godot:ops:visual-validate
```

必要时才运行：

```powershell
scripts\run_python.cmd godot-client\tools\import_slgclient_theme_assets.py
npm run gate:godot:week1:compat:debug-only
```

注意：`import_slgclient_theme_assets.py` 会重建 manifest 与 `exchange_bundle`。在工作树已有大量资产变更时，不应为了普通文档治理随意执行该脚本；需要执行时必须先说明它会重写哪些白名单资产路径。
