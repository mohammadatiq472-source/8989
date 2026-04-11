# Godot 视觉替换执行文档（TMX + UnitView，2026-04-10）

## 1. 目标与边界

本链路只做 Godot 展示层替换，不改后端 authoritative 契约：

1. 地图：`MapGrid` 从 debug 网格切换到 `slgclient` TMX 静态底图。
2. 单位：`UnitView` 使用 8 向帧动画与 replay engage 驱动。
3. API：`/api/session/*`、`/api/world/action`、历史回放字段保持不变。
4. 叠加语义层：资源地与主城标识优先走贴图（`map_res/map_tiles/cityComponent/component_outside`），数字徽标仅作兜底。
5. 山脉连续性降噪：`MapGrid` 增加邻接驱动 mountain overlay（`hill1..5`）以抑制“每格独立噪声”。
6. terrain 边缘拼接：`riverland/wasteland` 接入 `water_edge/sand_edge` 方向型 bitmask + 朝向旋转。

## 2. 目录契约（必须遵守）

- 当前启用资产：`godot-client/assets/themes/slgclient/current`
- 后续替换候选：`godot-client/assets/themes/slgclient/replacements`
- 机读清单：`godot-client/assets/themes/slgclient/manifests`

本轮关键文件：

- 底图：`current/world/map.tmx` + `*.tsx` + `*.png`
- 单位帧：`current/units/qibing_frames/*.png`
- 语义贴图：`current/overlays/frames/*.png`
- 边缘/地貌贴图库：`current/world/hill*.{png,plist}`、`water_edge_*`、`sand_edge_*`
- 资产清单：`manifests/slgclient_asset_manifest.json`
- 帧清单：`manifests/unit_frames_manifest.json`
- 叠加帧清单：`manifests/overlay_frames_manifest.json`
- 对外交换包：`replacements/exchange_bundle/*`（给 Gemini/Banana 等外部工具直接消费）

## 3. 正式入口命令（可复现）

```powershell
# 1) 导入/刷新 slgclient 资产 + 机读 manifest
py -3.11 godot-client/tools/import_slgclient_theme_assets.py

# 2) strict 门禁（唯一验收口径）
npm run gate:godot:week1

# 3) 控制面链路（输出 JSON 证据）
npm run godot:ops:cli -- --output tmp/gates/godot_ops_bootstrap_latest.json bootstrap-chain

# 4) 模板动作回放（含 battle/tile_control/logistics 高亮覆盖）
npm run godot:ops:cli -- --timeout-sec 180 --output tmp/gates/ai_ops_template_replay_latest.json template-replay --scenario baseline_v1

# 5) 映射稳定性抽检（plain/resource/city + mountain/grassland/riverland）
npm run godot:ops:visual-validate
```

## 4. strict / compat 使用边界（门禁）

| 命令 | 用途 | 是否可写“通过结论” |
| --- | --- | --- |
| `npm run gate:godot:week1` | strict，默认，CI/验收 | 可以（唯一口径） |
| `npm run gate:godot:week1:compat` | 兼容排障 | 不可以（仅定位问题） |

## 5. 替换步骤（主线）

1. 运行资产导入脚本，确认 `current/` 与 `manifests/` 生成成功。
2. 确认 `map_grid.gd` 可加载 `map.tmx`，并保持对外方法不变：`tile_to_screen_position` / `get_view_state` / `view_transform_changed`。
3. 确认 `unit_marker.gd` 从 `unit_frames_manifest.json` 读取 8 向帧；`unit_view_layer.gd` 继续复用 replay/highlight 链。
4. 确认 `map_grid.gd` 可读取 `overlay_frames_manifest.json`，资源地/主城标识优先贴图渲染。
5. 确认 mountain 邻接降噪层生效（`hill1..5` 按邻接度分层，不再纯随机单格噪声）。
6. 运行 strict + bootstrap-chain + template-replay + visual-validate 四条验证链，归档到 `tmp/gates/*.json`。

Mountain 参数化开关（`map_grid.gd` 导出参数）：

1. `mountain_overlay_enabled`：总开关（关闭则不绘制山脉 overlay）
2. `mountain_bitmask_enabled`：bitmask 朝向开关（关闭回退到邻接度旧算法）
3. `mountain_rotation_enabled`：边缘朝向旋转开关
4. `mountain_visual_profile`：预设档位（`custom/smooth/sharp/low_noise`，修改后自动重建 overlay）
5. `mountain_overlay_base_height`：基准尺寸
6. `mountain_overlay_alpha_min` / `mountain_overlay_alpha_max`：透明度范围
7. `mountain_edge_denoise_enabled`：边缘抑噪开关（弱连接孤立山块可自动跳过）
8. `mountain_edge_noise_alpha_threshold`：边缘抑噪阈值（低于阈值时边缘山块不绘制）
9. `mountain_ridge_bias_enabled` / `mountain_ridge_bias_strength`：山脊优先加权（连续山脊更厚更显著）

Terrain edge 参数化开关（`map_grid.gd` 导出参数）：

1. `terrain_edge_overlay_enabled`：总开关
2. `terrain_edge_bitmask_enabled`：bitmask 朝向开关（关闭时走简化选帧）
3. `terrain_edge_rotation_enabled`：旋转朝向开关
4. `river_edge_enabled` / `sand_edge_enabled`：分类型开关
5. `terrain_edge_overlay_base_height`：基准尺寸
6. `terrain_edge_alpha_min` / `terrain_edge_alpha_max`：透明度范围

Resource/Home 参数化开关（`map_grid.gd` 导出参数）：

1. `resource_overlay_enabled`：资源贴图总开关
2. `resource_overlay_text_enabled`：资源等级数字徽标开关（默认关闭，优先纯贴图）
3. `resource_overlay_base_height` / `resource_overlay_alpha`：资源贴图尺寸与透明度
4. `home_city_overlay_scale`：主城旗帜/防御圈/徽标整体缩放
5. `home_city_badge_enabled`：主城 `P/AI + Cx` 徽标开关
6. 主城锚点补强：`homeTileId` 不在当前 chunk 时，允许回退到 `world.map.tiles` 城市索引与 faction owner 匹配，避免主城标识丢失。

## 6. 回滚步骤（最小）

1. 回退脚本层：`map_grid.gd`、`unit_marker.gd`、`unit_view_layer.gd` 到上一个稳定提交。
2. 回退场景层：`godot-client/scenes/app/main.tscn`。
3. 重新执行 `npm run gate:godot:week1`，确保 strict 恢复通过后再继续改动。

## 7. 常见故障与排查

1. `No loader found for resource: ...png`
   - 说明：Godot 资源导入缓存未就绪或加载器不可用。
   - 处理：优先使用 `Image.load(...) -> ImageTexture.create_from_image(...)` 的运行时后备加载链。
2. `slg_ops_cli.py: error: unrecognized arguments: --output ...`
   - 说明：CLI 全局参数位置错误。
   - 处理：把 `--output/--timeout-sec` 放在子命令之前，例如 `npm run godot:ops:cli -- --output <path> bootstrap-chain`。
3. `template-replay` 的 `advance_tick` 超时
   - 处理：加 `--timeout-sec 180` 重跑，优先保留 strict 验收口径不变。

## 8. 资产集中出口（给外部工具替换）

导入脚本会自动同步可运行资产到：

- `godot-client/assets/themes/slgclient/replacements/exchange_bundle/world`
- `godot-client/assets/themes/slgclient/replacements/exchange_bundle/units`
- `godot-client/assets/themes/slgclient/replacements/exchange_bundle/overlays`
- `godot-client/assets/themes/slgclient/replacements/exchange_bundle/manifests`
- `godot-client/assets/themes/slgclient/replacements/exchange_bundle/exchange_bundle_manifest.json`

用途：

1. 给 Gemini/Banana 等工具统一提供“可直接替换”的输入目录。
2. 通过 `exchange_bundle_manifest.json` 做版本戳/体积/文件数核对。
3. 不改变当前 `current/` 运行入口，避免影响 strict 验收链。

## 9. 山脉连续性降噪的可用素材池（未全部启用）

目前 `tmp/third_party/slgclient/assets/resources/world` 里可直接复用但尚未全量接入的拼接素材：

1. `hill.plist`：15 帧（山体细分）
2. `water_edge_1.plist` + `water_edge_3.plist`：各 26 帧（水域边缘拼接）
3. `sand_edge_1.plist` + `sand_edge_3.plist`：各 26 帧（沙地边缘拼接）
4. `cityComponent.plist`：142 帧（城建/旗标等）
5. `component_outside.plist`：55 帧（外框旗标等）

建议：后续做“邻接拼接降噪”时，优先基于 `hill/water_edge/sand_edge` 三组 atlas 做 bitmask 映射，不要再回退到单格随机贴图。

## 10. 宝石 CLI（Obsidian CLI）检索与连通校验

```powershell
obsidian files folder='docs' ext=md
obsidian search query='Godot 视觉替换执行文档 TMX UnitView strict compat'
obsidian backlinks path='docs/GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md' total
obsidian backlinks path='docs/AI_QUICK_NAV_INDEX_2026_04_10.md' total
```

用途：

1. `files`：确认文档存在。
2. `search`：直接命中 strict/compat 与替换入口。
3. `backlinks`：确认导航索引与执行文档双向连通。
