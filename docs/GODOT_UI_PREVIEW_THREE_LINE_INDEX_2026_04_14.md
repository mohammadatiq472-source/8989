# Godot UI Preview 三线索引（2026-04-14）

> 状态：历史 / preview 治理文档。
> 当前产品主线已切到 `世界主壳 + 二级功能面板 + AI 变量`。
> 现行主线请改读：[NATIVE_SLG_MAINLINE_INDEX.md](NATIVE_SLG_MAINLINE_INDEX.md) 与 [NATIVE_SLG_COMPONENT_ARCHITECTURE.md](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)

## 1. 目的

这份文档把 `UI Preview Sandbox`、`Godot 编辑器插件`、`MCP CLI` 三条正式链放到同一页，避免后续 AI 或新窗口把三者混成一条线。

核心结论：

1. `UI Preview Sandbox` 是 story 运行时、截图验证、回归比较的主链。
2. `Godot 编辑器插件` 是 sandbox 的编辑器入口，不是独立 story 系统。
3. `MCP CLI` 是 world/session/headless 的权威执行链，不走 `stories_manifest.json`。

## 2. 三线对照

| 线 | 作用 | 单一事实来源 | 正式入口 | 说明 |
| --- | --- | --- | --- | --- |
| UI Preview Sandbox | UI 运行时预览、story 导航、截图验证 | [`godot-client/data/ui_preview/stories/stories_manifest.json`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/data/ui_preview/stories/stories_manifest.json) | [`godot-client/tools/run_ui_preview_sandbox.py`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/tools/run_ui_preview_sandbox.py) / [`godot-client/tools/validate_ui_preview_sandbox.py`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/tools/validate_ui_preview_sandbox.py) / [`godot-client/tools/run_ui_preview_sandbox_regression.py`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/tools/run_ui_preview_sandbox_regression.py) | 主链负责 story、viewport、source、captureTargets、validation、regression |
| Godot 编辑器插件 | 编辑器内快速选 story、打开 sandbox、直接 play story | 同一份 [`stories_manifest.json`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/data/ui_preview/stories/stories_manifest.json) | [`godot-client/addons/ui_preview_sandbox/plugin.cfg`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/addons/ui_preview_sandbox/plugin.cfg) -> [`ui_preview_sandbox_plugin.gd`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/addons/ui_preview_sandbox/ui_preview_sandbox_plugin.gd) -> [`ui_preview_sandbox_dock.gd`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/addons/ui_preview_sandbox/ui_preview_sandbox_dock.gd) | 编辑器入口通过 `start_story_id` override 驱动同一 sandbox scene |
| MCP CLI | world/session/headless 的权威执行与 smoke | 后端 API 契约与 `/api/world/action` | [`server/src/mcp/gameServer.ts`](C:/Users/Buffoon%20Queer/Desktop/8989/server/src/mcp/gameServer.ts) / [`godot-client/tools/slg_ops_cli.py`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/tools/slg_ops_cli.py) | 不负责 story 预览，负责 authoritative 执行与 engine-level smoke |

## 3. 关键文件

- sandbox host scene: [`godot-client/scenes/dev/ui_preview_sandbox.tscn`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/scenes/dev/ui_preview_sandbox.tscn)
- sandbox runtime: [`godot-client/scripts/dev/stories/ui_preview_sandbox.gd`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/scripts/dev/stories/ui_preview_sandbox.gd)
- manifest contract validator: [`godot-client/tools/validate_ui_preview_sandbox.py`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/tools/validate_ui_preview_sandbox.py)
- regression runner: [`godot-client/tools/run_ui_preview_sandbox_regression.py`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/tools/run_ui_preview_sandbox_regression.py)
- editor plugin enablement: [`godot-client/project.godot`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/project.godot)

## 4. 正式入口命令

```powershell
py -3.11 godot-client/tools/run_ui_preview_sandbox.py
py -3.11 godot-client/tools/validate_ui_preview_sandbox.py --presentation-capture --report-path tmp/screenshots/ui_preview_sandbox/preview_validation_report.json --screenshot-dir tmp/screenshots/ui_preview_sandbox
npm run godot:ui:preview:regress
D:\Apps\Godot\Godot_v4.6.2-stable_win64.exe --path godot-client --scene res://scenes/dev/ui_preview_sandbox.tscn
npm run godot:ops:cli -- bootstrap-chain --output tmp/gates/godot_ops_bootstrap_latest.json
```

## 5. Story 索引

统一规则：

1. 所有 story 都来自同一份 [`stories_manifest.json`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/data/ui_preview/stories/stories_manifest.json)。
2. `validate_ui_preview_sandbox.py` 从 manifest 生成 story 序列并逐个校验。
3. `run_ui_preview_sandbox_regression.py` 基于 validation 产物与 baseline hash 比较。
4. Godot 编辑器插件通过 `Play Selected Story` 把 `ui_preview_sandbox/start_story_id` 写入 `ProjectSettings`，再启动同一 sandbox scene。

| storyId | scenePath | payloadPath | captureTargets | validator | regression | editor entry |
| --- | --- | --- | --- | --- | --- | --- |
| `hud_token` | `res://scenes/dev/stories/hud_token_story.tscn` | `res://data/ui_preview/stories/hud_token_story.json` | 6 | `validate_ui_preview_sandbox.py` | `run_ui_preview_sandbox_regression.py` | 插件下拉可选 |
| `observability` | `res://scenes/dev/stories/observability_story.tscn` | `res://data/ui_preview/stories/observability_story.json` | 7 | 同上 | 同上 | 同上 |
| `panel_stack` | `res://scenes/dev/stories/panel_stack_story.tscn` | `res://data/ui_preview/stories/panel_stack_story.json` | 6 | 同上 | 同上 | 同上 |
| `map_surface` | `res://scenes/dev/stories/map_surface_story.tscn` | `res://data/ui_preview/stories/map_surface_story.json` | 4 | 同上 | 同上 | 同上 |
| `map_zoom_hover` | `res://scenes/dev/stories/map_zoom_hover_story.tscn` | `res://data/ui_preview/stories/map_zoom_hover_story.json` | 3 | 同上 | 同上 | 同上 |
| `map_overlay` | `res://scenes/dev/stories/map_overlay_story.tscn` | `res://data/ui_preview/stories/map_overlay_story.json` | 2 | 同上 | 同上 | 同上 |
| `map_units` | `res://scenes/dev/stories/map_units_story.tscn` | `res://data/ui_preview/stories/map_units_story.json` | 2 | 同上 | 同上 | 同上 |
| `ui_canvas` | `res://scenes/dev/stories/ui_canvas_story.tscn` | `res://data/ui_preview/stories/ui_canvas_story.json` | 4 | 同上 | 同上 | 同上 |

> 2026-04-28：`province_layer / warzone_layer / nation_layer` 宏观 preview 旧线已退役并从 active manifest 删除；不要再作为主线 UI 或视觉资产入口。

## 6. 最容易混淆的点

1. `Godot 编辑器插件` 不是另一套 story 系统，它只是 sandbox 的编辑器入口。
2. `MCP CLI` 不走 `stories_manifest.json`，不要把它误判成 story 预览链。
3. `preview_national_agenda`、`preview_court_session` 这类 world-action template 属于 backend/MCP CLI 侧，不属于 UI Preview Sandbox story。
4. 评估 Godot 能力时，至少要同时看这三条线，不能只看 `main.tscn` 或只看 headless smoke。

## 7. 相关文档

- [`docs/GODOT_UI_PREVIEW_SANDBOX_ARCHITECTURE_2026_04_12.md`](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_SANDBOX_ARCHITECTURE_2026_04_12.md)
- [`docs/GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md`](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md)
- [`docs/GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md`](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md)
- [`docs/AI_QUICK_NAV_INDEX_2026_04_10.md`](C:/Users/Buffoon%20Queer/Desktop/8989/docs/AI_QUICK_NAV_INDEX_2026_04_10.md)
