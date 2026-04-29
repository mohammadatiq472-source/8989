# Godot 原生 SLG 主壳布局对齐（2026-04-18）

> 状态：现行主壳布局收口文档。  
> 用途：把 `native_slg_shell` 的当前布局口径、视频证据、Godot 编辑定位方法和正式验证入口固定下来。

## 0. 关联文档

1. [原生 SLG 正式主线文档](NATIVE_SLG_MAINLINE_INDEX.md)
2. [原生 SLG 正式组件文档](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)
3. [AI 快速导航索引](AI_QUICK_NAV_INDEX_2026_04_10.md)
4. [率土之滨逆向研究 → 项目设计洞察](STZB_REVERSE_DESIGN_INSIGHTS.md)
5. [Godot + MCP + CLI 控制面](GODOT_MCP_CLI_CONTROL_SURFACE_2026_04_10.md)
6. [Godot SVG 图标源资产包（2026-04-18）](GODOT_SVG_ICON_SOURCE_PACK_2026_04_18.md)
7. [Godot 战报面板骨架（2026-04-18）](GODOT_BATTLE_REPORT_PANEL_SKELETON_2026_04_18.md)

## 1. 证据来源

当前主壳布局以 `LTZB_VIDEO_01_BASE_SHELL` 为主证据，即：

- [5248c1d9640247e739d2d7f2addee905_raw.mp4](</C:/Users/26739/Desktop/8989/5248c1d9640247e739d2d7f2addee905_raw.mp4>)

本轮已抽取关键帧，供本机复核：

- [tmp/video_frames_5248_iio](/C:/Users/26739/Desktop/8989/tmp/video_frames_5248_iio)

## 2. 当前对齐结论

当前主壳不再按 `debug HUD` 思路摆放信息，而按更接近原生 SLG 手游主界面的层级收口：

1. 顶栏继续保留资源，但 `RuntimeLabel` 不再进入主视觉层。
2. 顶栏右侧紧邻 `大地图` 的位置，先保留 `玉符 / 铜钱` 货币条。
3. 左侧保留窄任务流与部队态势，不再放宽大的说明型 debug 面板。
4. `战报` 从顶部移到左下功能入口上方，作为独立辅助入口。
5. 底部主入口先只保留：`武将 / 内政 / 同盟 / AI / 招募`。
6. `国战 / 背包 / 设置` 当前先退出主视觉层，等正式链路接上再回归。
7. `刷新世界 / 推进 Tick / 导出性能` 属于开发验证入口，不属于正式手游主界面，因此当前隐藏。
8. 右侧 `城市上下文` 当前也退出主视觉层，避免抢占世界主视区。

## 3. 代码落点

### 3.1 场景结构

主壳场景：

- [godot-client/scenes/ui/native_slg_shell.tscn](/C:/Users/26739/Desktop/8989/godot-client/scenes/ui/native_slg_shell.tscn)

当前最关键的节点：

1. `TopStrip -> TopRow -> Actions -> PremiumCurrencyRow`
2. `BottomNav -> BottomRow -> MainNav -> UtilityRow -> MailButton / ActivityButton / HelpButton`
3. `BottomNav -> BottomRow -> MainNav -> NavButtons`
4. `LeftRail -> TaskHeaderRow`
5. `CenterStage`
6. `RuntimeOps`
7. `RightContext`

### 3.2 脚本行为

主壳交互脚本：

- [godot-client/scripts/ui/native_slg_shell.gd](/C:/Users/26739/Desktop/8989/godot-client/scripts/ui/native_slg_shell.gd)

顶栏/左栏/部队文案来源：

- [godot-client/scripts/ui/presenters/native_shell_presenter.gd](/C:/Users/26739/Desktop/8989/godot-client/scripts/ui/presenters/native_shell_presenter.gd)

主场景把 presenter payload 注入主壳的入口：

- [godot-client/scripts/app/main.gd](/C:/Users/26739/Desktop/8989/godot-client/scripts/app/main.gd)

## 4. 在 Godot 里怎么定位和改

如果只是想改结构位置，不要先在画布里拖；先看容器。

### 4.1 正确打开方式

1. 打开 [godot-client/project.godot](/C:/Users/26739/Desktop/8989/godot-client/project.godot)
2. 打开 [native_slg_shell.tscn](/C:/Users/26739/Desktop/8989/godot-client/scenes/ui/native_slg_shell.tscn)

### 4.2 先看场景树，不先看画布

当前主壳大量节点挂在：

1. `HBoxContainer`
2. `VBoxContainer`
3. `MarginContainer`
4. `GridContainer`

这意味着位置主要由下面几件事决定：

1. 节点在场景树里的顺序
2. 父容器类型
3. `Visible`
4. `Custom Minimum Size`
5. `Size Flags`
6. `Separation`
7. `Margin`

### 4.3 实际最常改的属性

1. 想临时去掉一个块：改 `Visible`
2. 想让按钮更窄/更宽：改 `Custom Minimum Size`
3. 想让按钮之间更近/更远：改父容器的 `Separation`
4. 想让整块离边更近/更远：改外层 `MarginContainer` 或节点 `offset`
5. 想改变按钮顺序：直接在场景树里拖节点顺序

### 4.4 看运行时真实结构

运行游戏后，切到编辑器上方的 `Remote` 场景树。

这一步等价于网页里的运行时 DOM 检查，适合确认：

1. 节点是否真的显示
2. 运行时有没有被脚本改字
3. 哪些节点是场景内常驻，哪些是运行时生成

## 5. 当前正式验证口径

当前主壳布局修改后，仍只认正式入口：

```powershell
npm run godot:headless:smoke
npm run godot:mainline:runtime -- --quit-after 1
npm run gate:godot:week1
```

## 6. 下一轮建议

下一轮更值得继续推进的是：

1. 把 `LeftRail` 继续拆成更像原生 SLG 的窄任务条 + 队列区
2. 用真实图标替换当前文字型 `玉符 / 铜钱 / 资源` 占位
3. 把 `战报` 从“位置先对”推进到真正可读的正式面板
4. 继续弱化 `CenterStage` 的大说明卡，让世界主视区更接近游戏镜头
