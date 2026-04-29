# Godot 横屏移动端触控规格（2026-04-28）

> 状态：Godot 主线 UI 补充规范。  
> 读取时机：只有在修改 `FullScreenPanelHost`、单武将详情页、返回/关闭按钮、横屏移动端触控热区时才补读。不要把它加入每个窗口的必读长清单。

## 1. 适用范围

本规范约束横屏移动端的高频离开动作：

1. 二级功能面板右上角 `关闭`。
2. 单武将详情页右上角 `关闭`。
3. 同一层级左上角 `返回主壳 / 返回`。

这些按钮是移动端误触与找不到出口的最高风险点，必须在所有二级/详情面板中保持统一。

## 2. 尺寸规格

| 控件 | 最小尺寸 | 字号 | 位置规则 |
|---|---:|---:|---|
| `关闭` | `112 x 52` | `22` | 二级面板右上角；覆盖式详情页可收进顶部工具行右侧 |
| `返回主壳 / 返回` | `172 x 72` | `24` | 左上角，距左侧约 `16px`，距顶部约 `12px` |

实现侧当前对应：

1. `godot-client/scripts/ui/full_screen_panel_host.gd`
   - `HEADER_CLOSE_BUTTON_SIZE = Vector2(112, 52)`
   - `HEADER_BACK_BUTTON_SIZE = Vector2(172, 72)`
   - `HEADER_BUTTON_FONT_SIZE = 24`
   - `HEADER_CLOSE_BUTTON_FONT_SIZE = 22`
2. `godot-client/scripts/ui/general_panel.gd`
   - `MOBILE_CLOSE_BUTTON_SIZE = Vector2(112, 52)`
   - `MOBILE_BACK_BUTTON_SIZE = Vector2(172, 72)`
   - `MOBILE_HEADER_BUTTON_FONT_SIZE = 24`
   - `MOBILE_CLOSE_BUTTON_FONT_SIZE = 22`
   - `MOBILE_PROFILE_TAB_FONT_SIZE = 20`
   - ?????????`anchor_top = 0.025`?`offset_bottom = -8`????????????

## 3. 可用性规则

1. `关闭` 必须关闭当前二级/详情面板，回到世界主壳，不得只切换页签。
2. 同一宿主头部内的 `返回主壳 / 返回` 与 `关闭` 必须视觉对齐；覆盖式详情页可把 `关闭` 收进首行工具区右侧。
3. `关闭` 按钮必须命名为 `CloseButton`，便于 visual smoke 定位可见按钮。
4. 自动化验证必须优先按可见 `CloseButton`，不能按隐藏宿主按钮。
5. 覆盖式详情页优先把 `关闭` 放进首行工具区右侧；不得让悬浮 `关闭` 压住页签或正文。
6. 每次调整按钮尺寸后，必须跑至少一条横屏 visual smoke。

## 4. 正式验证入口

复用正式入口：

```powershell
npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --window-width 1600 --window-height 900 --close-after-open
```

武将详情页验证：

```powershell
npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id generals --window-width 1600 --window-height 900 --close-after-open
```

验收字段：

1. `closeButtonResult.pressed = true`
2. `closeButtonResult.closed = true`
3. `panelClosedAfterClose = true`
4. `activePanelId = ""`
5. 截图回到世界主壳

## 5. 文档治理

本文件是条件补读文档，不应让所有 AI 窗口默认读取。入口只需要从：

1. `NATIVE_SLG_MAINLINE_INDEX.md` 的渐进式补读段落找到。
2. `NATIVE_SLG_COMPONENT_ARCHITECTURE.md` 的二级功能面板组件段落找到。

后续若新增按钮尺寸，不要散落在多个提示词里，优先按按钮家族补到本文件，不要把所有 UI 细节塞回主索引。

## 6. 后续按钮盘点策略

不要一次性把所有 Godot UI 按钮都写进本文件。当前文件只收最高频、最高风险的“离开动作”按钮。

推荐顺序：

1. 通用壳层按钮：`关闭`、`返回主壳 / 返回`、侧栏展开收起。
2. 全屏详情按钮：武将详情、AI 管理页、战报详情等覆盖式面板的退出按钮。
3. 高频操作按钮：底部行动条、确认/委派/托管、筛选/分页。
4. 普通内容按钮：列表行按钮、标签筛选、开发预览组件。

如需盘点全部按钮，应单开只读 UI 审计窗口，输出按钮清单和候选规范；不要在业务实现窗口里展开全量按钮审计。
