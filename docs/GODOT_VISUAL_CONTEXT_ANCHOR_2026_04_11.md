# Godot 视觉替换上下文锚点（2026-04-11）

## 1) 为什么有这份文档

用于降低多轮对话压缩导致的偏离风险。后续 AI 应优先以本文件 + 代码事实作为执行锚点，而不是口头记忆。

## 2) 当前已落地代码事实（source of truth）

### 2.1 地图渲染

- 文件：`godot-client/scripts/map/map_grid.gd`
- 已实现：
  - TMX/TSX 加载：`THEME_MAP_TMX_PATH = res://assets/themes/slgclient/current/world/map.tmx`
  - PNG 运行时后备加载：`_load_texture_with_fallback` / `_load_image_texture`
  - 线性映射缓存：
    - `backend tileId -> tmx cell`（`_tmx_cell_by_tile_id`）
    - `backend coord -> tmx cell`（`_tmx_cell_by_coord_key`）
  - 地图语义叠加：
    - 资源地贴图：`land_ground_*` + `land_*_*`（`stone` 已独立映射到 `land_3_*`，非 `wood` 复用）
      - 开关：`resource_overlay_enabled` / `resource_overlay_text_enabled`
      - 参数：`resource_overlay_base_height` / `resource_overlay_alpha`
    - 主城贴图：`home_defend` + `flag_blue_*` / `flag_red_*`（fallback 才用 `P/AI` 几何标）
      - 参数：`home_city_overlay_scale` / `home_city_badge_enabled`
      - 锚点补强：`homeTileId` 不在当前 chunk 时回退 `world.map.tiles` 城市索引 + faction owner 匹配
    - 山脉邻接降噪：支持方向型 bitmask（含旋转朝向）+ 邻接度回退
      - 开关：`mountain_overlay_enabled` / `mountain_bitmask_enabled` / `mountain_rotation_enabled`
      - 预设：`mountain_visual_profile`（`custom/smooth/sharp/low_noise`，运行时自动同步）
      - 参数：`mountain_overlay_base_height` / `mountain_overlay_alpha_min` / `mountain_overlay_alpha_max`
      - 二段优化：`mountain_edge_denoise_enabled` / `mountain_edge_noise_alpha_threshold` / `mountain_ridge_bias_enabled` / `mountain_ridge_bias_strength`
    - 地形边缘拼接：`riverland/wasteland` 使用 `water_edge/sand_edge` 方向型 bitmask（可旋转）
      - 开关：`terrain_edge_overlay_enabled` / `terrain_edge_bitmask_enabled` / `terrain_edge_rotation_enabled`
      - 分流：`river_edge_enabled` / `sand_edge_enabled`
      - 参数：`terrain_edge_overlay_base_height` / `terrain_edge_alpha_min` / `terrain_edge_alpha_max`
  - 叠加帧清单：`res://assets/themes/slgclient/manifests/overlay_frames_manifest.json`
  - 对外契约仍保留：
    - `view_transform_changed`
    - `tile_to_screen_position`
    - `get_view_state`
  - 新增辅助：`tile_id_to_screen_position`

### 2.2 单位与动画

- 文件：`godot-client/scripts/map/unit_marker.gd`
- 已实现：
  - 8 向帧驱动（`r/ru/u/lu/l/ld/d/rd`）
  - 帧来源：`res://assets/themes/slgclient/manifests/unit_frames_manifest.json`
  - Engage 视觉分层：
    - `battle`：红，高冲量
    - `tile_control`：琥珀，中冲量
    - `logistics`：蓝，低冲量

- 文件：`godot-client/scripts/map/unit_view_layer.gd`
- 已实现：
  - replay/highlight 继续走 `unitId/tileId/fromTileId/toTileId`
  - 强度顺序保持：`battle > tile_control > logistics`
  - `play_engage(intensity, direction, kind)` 已全链路传参

### 2.3 资产导入与验证工具

- `godot-client/tools/import_slgclient_theme_assets.py`
  - 导入 `tmp/third_party/slgclient` 资产到 `assets/themes/slgclient/current`
  - 生成机读 manifest（含 source repo/commit/importedAt）
  - 生成 overlay 帧与 `overlay_frames_manifest.json`
  - 同步对外交换包：`assets/themes/slgclient/replacements/exchange_bundle/*`

- `godot-client/tools/validate_visual_mapping.py`
  - 校验 `plain/resource/city` + `mountain/grassland/riverland`
  - 输出：`tmp/gates/godot_visual_mapping_latest.json`

- `package.json`
  - 新增命令：`godot:ops:visual-validate`

## 3) 验收口径（必须遵守）

1. `npm run gate:godot:week1` 是 strict，唯一可写“通过结论”的口径。  
2. `npm run gate:godot:week1:compat` 仅排障，不得作为结案证据。  
3. 视觉替换链建议固定 4 条：
   - `py -3.11 godot-client/tools/import_slgclient_theme_assets.py`
   - `npm run gate:godot:week1`
   - `npm run godot:ops:cli -- --output tmp/gates/godot_ops_bootstrap_latest.json bootstrap-chain`
   - `npm run godot:ops:cli -- --timeout-sec 180 --output tmp/gates/ai_ops_template_replay_latest.json template-replay --scenario baseline_v1`
   - `npm run godot:ops:visual-validate`

## 4) 已知噪声 / 风险

1. Godot headless 仍会出现 `ObjectDB instances leaked at exit` 警告（当前不阻塞 strict）。  
2. `template-replay` 的 `advance_tick` 耗时波动大，默认建议带 `--timeout-sec 180`。  
3. 当前这些 Godot 与文档文件在该仓库状态中属于 `untracked`，后续提交前需人工确认提交范围。

## 5) 新窗口接手建议

若进入“新阶段需求”（例如整套 UI 视觉二次重构、资产再替换、引擎级性能优化），建议开新窗口；并把本文件作为首读入口。  
若只是继续当前链路的局部精修，可在当前窗口继续。
