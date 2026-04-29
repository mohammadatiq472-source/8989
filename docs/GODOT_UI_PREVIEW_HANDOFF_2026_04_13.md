# Godot UI Preview Handoff（2026-04-13）

> 状态：历史 / preview 交接文档。  
> 当前主线已不再以 `ui_preview_sandbox.tscn` 为产品入口。  
> 现行主线请改读：[NATIVE_SLG_MAINLINE_INDEX.md](NATIVE_SLG_MAINLINE_INDEX.md)

这份文档用于把当前 `Godot + UI Preview Sandbox` 的地图 UI 主线，交接给新的 AI 窗口，目标是降低上下文污染，避免重新摸索入口和故事链。

## 1. 当前正式入口

正式入口只认 sandbox 主线，不回 `main.tscn` / `main.gd` 盲改。

- 主入口场景：[`godot-client/scenes/dev/ui_preview_sandbox.tscn`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/scenes/dev/ui_preview_sandbox.tscn)
- sandbox 启动脚本：[`godot-client/tools/run_ui_preview_sandbox.py`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/tools/run_ui_preview_sandbox.py)
- sandbox 验证脚本：[`godot-client/tools/validate_ui_preview_sandbox.py`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/tools/validate_ui_preview_sandbox.py)
- 截图回归脚本：[`godot-client/tools/run_ui_preview_sandbox_regression.py`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/tools/run_ui_preview_sandbox_regression.py)
- Godot 直接打开命令：

```powershell
D:\Apps\Godot\Godot_v4.6.2-stable_win64.exe --path godot-client --scene res://scenes/dev/ui_preview_sandbox.tscn
```

## 2. 已完成 story 链

已正式打通并进入验证口径的宏观导航链是：

- `map_surface -> province_layer -> warzone_layer -> nation_layer`

这条链不是手工跳转测试，而是当前 UI Preview Sandbox 的正式故事链。

当前已落地的 story pack：

- `Core UI`: `hud_token`, `observability`, `panel_stack`
- `Map Preview Pack`: `map_surface`, `map_zoom_hover`, `map_overlay`, `map_units`
- `Map Macro Pack`: `province_layer`, `warzone_layer`, `nation_layer`
- `Canvas Pack`: `ui_canvas`

当前组件方向已经稳定成型：

- `map_surface` 已拆成可复用组件壳
- `province_layer` 已有州层焦点板
- `warzone_layer` 已有战区摘要板
- `nation_layer` 已有 `banner / palette / entry` 三段式结构

## 3.1 产品前台四卡当前状态

这是一份给后续窗口直接读的状态锚点，和聊天上下文解耦。

| Card | 目标 | 当前状态 | 依赖 / 验证入口 |
| --- | --- | --- | --- |
| A | 主场景反 demo 化 | 已收口到 `map_surface` 的首屏焦点卡、AI 玩家入口、底边焦点卡与稳定返回链 | `py -3.11 godot-client/tools/run_ui_preview_sandbox.py`；`py -3.11 godot-client/tools/validate_ui_preview_sandbox.py --presentation-capture --report-path tmp/screenshots/ui_preview_sandbox/preview_validation_report.json --screenshot-dir tmp/screenshots/ui_preview_sandbox`；`npm run godot:ui:preview:regress` |
| B | AI 玩家名片 + 接令反馈 | 已有 AI 玩家面板、状态切换、返回链与自动交互验证 | 同上，外加 `map_surface_interactions` |
| C | 主城/建筑/科技最小成长页 | 尚未形成独立 story | 需先落最小可截图成长页，再接验证链 |
| D | 同盟/国家最小组织页 | 尚未形成独立 story | 需先落最小组织页，再接验证链 |

推荐的 Obsidian 读法：

1. 先读 [TASK_2026_04_14_PRODUCT_FRONTEND_EXEC_CARDS.md](C:/Users/Buffoon%20Queer/Desktop/8989/docs/TASK_2026_04_14_PRODUCT_FRONTEND_EXEC_CARDS.md) 的状态图谱。
2. 再读这份 handoff 的 story 链与白名单。
3. 必要时用 `obsidian backlinks` 检查这两份文档是否已经互相连通。

## 3. 当前 `province_layer` 焦点板状态

`province_layer` 现在的焦点板不是临时接入口，而是已经升级为州层产品入口骨架，重点已经从“能进”转到“能稳、能读、能跳”。

现在应优先确认的状态是：

1. 信息层级是否稳定，州名 / 州府 / 阵营 / 状态是否一眼可读。
2. 跳转入口是否稳定，点击后能继续沿 sandbox 主线进入下一层。
3. 语义是否继续对齐 `RoleCity.prefab` 的州层焦点卡骨架，而不是回退成纯装饰卡。
4. 视觉密度仍可能继续微调，但这不应破坏入口稳定性。

一句话：`province_layer` 已经站到“产品面板骨架”这一级，后续只允许在这个骨架上做稳态增强。

当前最新正式验证截图：

- `03_panel_stack_story.png` 最新已验证 hash：`779329140cca384c4ad20e0973350c959fc84309ee4a1797d9c1bd8c8c74e9b6`
- `08_province_layer_story.png` 最新已验证 hash：`f764397e428566abb6e8a20f5f610fc76090b14d0b996f3c0933b62ca3476ff7`
- `09_warzone_layer_story.png` 最新已验证 hash：`f646582942f007482f66b8b6a7095bc960a58826a33ed060c32441492523cd66`
- `11_ui_canvas_story.png` 最新已验证 hash：`1448c1ade82b69da744b70c924278d6de45f284a76bfe667ff4dde4218d3613c`

注意：

- 四个 hash 已写回 `godot-client/tools/run_ui_preview_sandbox_regression.py` 的 embedded baseline。
- 当前 `npm run godot:ui:preview:regress` 应只在后续真实改动时出现新的 hash mismatch。
- `validate_ui_preview_sandbox.py` 已补充 story/source 稳态等待（sync + timeout），用于降低 `08` 截图漂移。
- `ui_canvas` 已正式接入 `stories_manifest` 与 regression baseline，和其余 story 一样走完整验证链。

## 4. 工作区污染判断

当前工作区不是净工作树，存在大量与本次任务无关的已改动和未跟踪文件。

判断结论：

- 污染是明确存在的，不要假设当前工作区干净。
- 新窗口不要扩大写面，不要把无关改动带进这条 UI 主线。
- 只在 sandbox 主线内工作，优先限制在 story / component / sandbox validation 相关文件。
- 任何回到 `main.tscn`、`main.gd` 或 `server/**` 的动作都应视为越界。

## 5. 下一窗口建议

1. 继续只盯 `province_layer` 焦点板，把它压成真正站住的州层产品面板。
2. 继续沿 `click -> context panel -> map scroll -> top layer` 的原始语义走，不要把导航链改成静态卡片堆。
3. 只从 UI Preview Sandbox 看效果，不回主场景盲改。
4. 如果要继续宏观地图链，优先做 `province -> warzone` 的连续点击与定位闭环，不要先扩散到别的 UI。
5. 新窗口只在 sandbox 主线内工作，避免接触与本任务无关的污染文件。

## 6. 建议白名单

### 6.1 必读文档

- [`AGENTS.md`](C:/Users/Buffoon%20Queer/Desktop/8989/AGENTS.md)
- [`docs/AGENTS_EXECUTION_CURRENT_2026_04.md`](C:/Users/Buffoon%20Queer/Desktop/8989/docs/AGENTS_EXECUTION_CURRENT_2026_04.md)
- [`docs/GODOT_MAP_MACRO_COMPONENTS_2026_04_13.md`](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_MAP_MACRO_COMPONENTS_2026_04_13.md)
- [`docs/GODOT_PROVINCE_WARZONE_PREFAB_SEMANTICS_2026_04_13.md`](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_PROVINCE_WARZONE_PREFAB_SEMANTICS_2026_04_13.md)
- [`godot-client/README.md`](C:/Users/Buffoon%20Queer/Desktop/8989/godot-client/README.md)
- 本交接文档本身：[`docs/GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md`](C:/Users/Buffoon%20Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md)

### 6.2 推荐实现白名单

只建议围绕 sandbox 主线改这些方向，不要跨出去：

- `godot-client/scenes/dev/ui_preview_sandbox.tscn`
- `godot-client/scenes/dev/components/**`
- `godot-client/scripts/dev/**`
- `godot-client/data/ui_preview/stories/**`
- `godot-client/tools/run_ui_preview_sandbox.py`
- `godot-client/tools/validate_ui_preview_sandbox.py`
- `godot-client/tools/run_ui_preview_sandbox_regression.py`

### 6.3 明确禁止

- `godot-client/scenes/app/main.tscn`
- `godot-client/scripts/app/main.gd`
- `server/**`
- 任何与当前 UI Preview 主线无关的重构目录

## 7. 建议正式验证命令

至少跑一条正式入口，优先用这条做最小可复现验证：

```powershell
py -3.11 -c "from pathlib import Path; p=Path(r'C:/Users/Buffoon Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md'); print('ok' if p.read_text(encoding='utf-8') else 'empty')"
```

正式 sandbox 入口链：

```powershell
py -3.11 godot-client/tools/run_ui_preview_sandbox.py
```

```powershell
py -3.11 godot-client/tools/validate_ui_preview_sandbox.py --presentation-capture --report-path tmp/screenshots/ui_preview_sandbox/preview_validation_report.json --screenshot-dir tmp/screenshots/ui_preview_sandbox
```

```powershell
npm run godot:ui:preview:regress
```

如需 headless 固定核验，可补跑：

```powershell
D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --path C:\Users\Buffoon Queer\Desktop\8989\godot-client --scene res://scenes/dev/stories/province_layer_story.tscn --quit-after 1
```

```powershell
D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe --headless --path C:\Users\Buffoon Queer\Desktop\8989\godot-client --scene res://scenes/dev/stories/warzone_layer_story.tscn --quit-after 1
```

## 8. 给新窗口的可直接复制提示词

```text
你是新的主代理窗口，接手 C:\Users\Buffoon Queer\Desktop\8989 的 Godot SLG UI 主线。

硬约束：
1. 只做 Godot 客户端 UI 与必要 docs，不碰 server 业务逻辑。
2. 只在 UI Preview Sandbox 主线内工作，不回 main.tscn / main.gd 盲改。
3. 严格遵守 AGENTS.md 与 docs/AGENTS_EXECUTION_CURRENT_2026_04.md。
4. 中文读写统一用 py -3.11 + encoding='utf-8'，改中文后必须 UTF-8 回读校验。
5. 只有主代理能创建子代理，子代理禁止再创建子代理。
6. 每个子代理只能改自己的白名单文件，跨界先报主代理审批。
7. 必须给出至少一条正式可复现验证链，不能只给计划。

当前正式入口：
- py -3.11 -c "from pathlib import Path; p=Path(r'C:/Users/Buffoon Queer/Desktop/8989/docs/GODOT_UI_PREVIEW_HANDOFF_2026_04_13.md'); print('ok' if p.read_text(encoding='utf-8') else 'empty')"
- py -3.11 godot-client/tools/run_ui_preview_sandbox.py
- py -3.11 godot-client/tools/validate_ui_preview_sandbox.py --presentation-capture --report-path tmp/screenshots/ui_preview_sandbox/preview_validation_report.json --screenshot-dir tmp/screenshots/ui_preview_sandbox
- npm run godot:ui:preview:regress

当前已完成链：
- map_surface -> province_layer -> warzone_layer -> nation_layer

当前 `province_layer` 状态：
- 焦点板已经从接入口升级为州层产品入口骨架
- 优先保证信息层级、跳转入口和滚动定位稳定

当前工作区判断：
- 工作区存在大量无关改动和未跟踪文件，属于污染态
- 不要扩大写面，不要碰与 sandbox 主线无关的文件

当前优先级：
1. 继续压稳 province_layer 焦点板。
2. 保持 click -> context panel -> map scroll -> top layer 的原始语义。
3. 只在 sandbox 主线内工作，不回主场景盲改。

建议白名单：
- godot-client/scenes/dev/ui_preview_sandbox.tscn
- godot-client/scenes/dev/components/**
- godot-client/scripts/dev/**
- godot-client/data/ui_preview/stories/**
- godot-client/tools/run_ui_preview_sandbox.py
- godot-client/tools/validate_ui_preview_sandbox.py
- godot-client/tools/run_ui_preview_sandbox_regression.py

请按以下顺序工作：
1. 先读 AGENTS.md、docs/AGENTS_EXECUTION_CURRENT_2026_04.md、docs/GODOT_MAP_MACRO_COMPONENTS_2026_04_13.md、docs/GODOT_PROVINCE_WARZONE_PREFAB_SEMANTICS_2026_04_13.md、godot-client/README.md、这份 handoff。
2. 只在白名单内修改。
3. 每个子代理必须回传读取文档路径、修改文件清单、复用的正式入口命令、验证结果与结论。
4. 主代理最后统一输出：通过项 / 风险项 / 阻塞项 / 下一步。
```

## 9. 备注

- 当前正式故事链与验证链已经可复现，新的窗口不需要重新摸索入口。
- 真正需要控制的是修改边界，不是再找一个新的开发入口。
