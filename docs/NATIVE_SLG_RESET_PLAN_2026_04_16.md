# 原生 SLG 主线重置计划（2026-04-16）

> 状态：历史快照 / 重置决策记录。  
> 现行口径请改读：[NATIVE_SLG_MAINLINE_INDEX.md](NATIVE_SLG_MAINLINE_INDEX.md)

> 目的：把当前“UI Preview / map_surface / worktree 分散推进”状态，收口回“单仓库 + 原生 SLG 主壳 + AI 作为新变量”的主线，避免后续继续偏航或丢失上下文。

先读入口：

- [原生 SLG 主线导航入口](NATIVE_SLG_MAINLINE_INDEX_2026_04_16.md)

## 1. 当前执行决定

1. 当前阶段不再把 `worktree` 作为默认工作模式。
2. 当前默认工作目录改为主仓库：`C:\Users\Buffoon Queer\Desktop\8989`
3. `8989-cd` 及其他 `8989-*` 目录暂时视为历史分支工作面，只做参考，不再继续并行推进。
4. 当前最重要的任务不是继续修 `map_surface` 小收口，而是重建“原生 SLG 客户端主线文档包”。
5. 在正式打磨完成前，不以 PR 隔离为目标；先把单仓库里的产品主线走顺。

## 2. 北极星定义

目标拆分为两层：

1. 先做一款原生 SLG 手游壳子。
   强参照《率土之滨》《三国志·战略版》的页面结构、按钮位置、交互路径与信息层级。
2. 再把 AI 作为这款原生 SLG 里的新变量接进去。
   AI 不是独立演示系统，也不是外挂层，而是原生 SLG 内部的玩家、托管者、执行者、组织者。

一句话：

**先做“像率土/三战”的原生 SLG 主界面与主流程，再做 AI 玩家与真人玩家的互动。**

## 3. 原生 SLG 页面结构

页面结构按“四层”来定义，而不是拆成互相割裂的 demo 页面。

### 3.1 持续壳层

所有主模式共享同一套外壳：

- 顶部全局状态条：头像、资源、货币、网络、计时、邮件
- 左侧任务/战报/邮件抽屉流
- 底部主功能栏：`武将 / 内政 / 同盟 / 国战 / AI中枢 / 招募 / 背包 / 设置`
- 右上固定世界层入口：`大地图`

### 3.2 主城模式

默认驻留页应是主城，而不是预览页：

- 中央是主城可交互舞台
- 建筑、功能入口、产出反馈都围绕主城展开
- 主城不是静态背景，而是玩家默认停留的操作面

### 3.3 大地图模式

大地图不是独立孤岛页，而是同一壳层下的模式切换：

- 左侧模式栏：国家 / 州 / 战区 / 地块等层级
- 左中上下文面板：选中州、城、地块后的信息与动作
- 中央主地图：国家层 -> 州层 -> 战区层 -> 地块层的 LOD 递进
- 右侧工具条：缩放、筛选、跳转、定位
- 底部世界动作条：坐标、行军、驻守、视野、切换操作

### 3.4 功能浮层

武将、招募、同盟、战报、势力等页面不应另起一套世界结构，而应作为主壳层上的功能覆盖层：

- 共享顶部和关闭逻辑
- 共享返回路径
- 共享信息密度规范
- 共享“从主城 / 大地图进入，再返回原上下文”的流程

## 4. AI 第一阶段插入点

第一阶段必须克制，不做“到处都是 AI 按钮”。

### 4.1 只保留两个正式入口

1. `AI中枢`
   固定在底栏中间，作为唯一强入口。
2. `AI Hub / 城市上下文`
   从主面板流进入，作为场景级补充入口。

### 4.2 第一阶段不做的入口

- 不做右侧直达 AI 快捷按钮
- 不做顶部独立 AI 按钮
- 不做脱离主城/大地图的独立 AI 页面
- 不把 AI 先做成“预览系统专属入口”

### 4.3 第一阶段 AI 负责什么

- AI 托管执行
- AI 建议与解释
- AI 组织协作
- AI 玩家/AI 势力参与同一世界

### 4.4 第一阶段 AI 不负责什么

- 不替代整个主 UI 结构
- 不先做一套 AI-only 操作系统
- 不先把所有细分页面都嵌入 AI 功能

## 5. 当前代码分区

### 5.1 保留区

这些是主线资产，不应因为 UI 方向重置就推翻：

- `server/**`
- `shared/**`
- `godot-client/scripts/map/**`

### 5.2 冻结区

这些现在更像 `UI Preview Sandbox / story / capture regression` 体系，应冻结，不继续当主线推进：

- `godot-client/scripts/dev/stories/**`
- `godot-client/scripts/dev/components/**`
- `godot-client/scenes/dev/**`
- `godot-client/data/ui_preview/stories/**`
- `godot-client/tools/validate_ui_preview_sandbox.py`
- `godot-client/tools/run_ui_preview_sandbox_regression.py`

### 5.3 桥接参考区

这些不能直接当主线，但仍有参考价值：

- `godot-client/README.md`
- `godot-client/data/ui_preview/stories/stories_manifest.json`
- `godot-client/scripts/dev/stories/ui_preview_story_base.gd`
- `godot-client/scripts/dev/stories/map_preview_story_base.gd`
- `godot-client/scripts/dev/data/ui_preview_data_adapter.gd`
- `C:\Users\Buffoon Queer\Desktop\8989-cd\docs\MAP_SURFACE_LAYOUT_RESEARCH_2026_04_16.md`

## 6. 现阶段不再继续的偏航方向

以下方向短期内一律降级，不再当作主线投入：

1. `map_surface` 的 shared semantic density 小收口
2. Card D 延伸设计
3. 继续围绕 preview sandbox 做叠层优化
4. 为了回归截图而继续堆更多演示壳层

这些内容不是完全没价值，但它们现在只能作为局部参考，不能继续牵引主目标。

## 7. 需要产出的正式文档包

下一轮应直接在主仓库内补齐三类文档：

1. [原生 SLG 页面结构](NATIVE_SLG_PAGE_STRUCTURE_2026_04_16.md)
   明确主城、大地图、功能浮层、共享壳层的布局与切换关系。
2. [AI 第一阶段插入点](AI_PHASE1_INSERTION_POINTS_2026_04_16.md)
   明确 AI 入口、AI 能力边界、AI 与真人/同盟/托管的结合点。
3. [代码主线保留 / 冻结 / 桥接矩阵](CODE_MAINLINE_KEEP_FREEZE_BRIDGE_2026_04_16.md)
   明确哪些代码继续作为主资产，哪些只做参考，哪些暂停不动。

## 8. 后续执行顺序

### 8.1 文档阶段

1. 把原生 SLG 页面结构单独写成正式文档。
2. 把 AI 第一阶段插入点单独写成正式文档。
3. 把代码分区和收口策略单独写成正式文档。
4. 再把三者汇总成新的主导航入口。

### 8.2 代码阶段

1. 不先改 server / shared 主干契约。
2. 先明确 Godot 客户端的真正主入口应该是什么，而不是继续复用 `ui_preview_sandbox`。
3. 先做“原生 SLG 主城页 / 主壳层”的结构重建。
4. 再接“大地图模式”与 `AI中枢`。

## 9. 单仓库工作法说明

从当前这轮起，默认按下面的方式执行：

1. 主仓库 `8989` 作为唯一活跃工作面。
2. 其他 `8989-*` 目录只读参考，不继续混写。
3. 等主线稳定后，再决定是否彻底清理或归档旧 worktree。

这不是永久规则，而是当前阶段的收口策略。

## 10. 一句话检查

如果某项工作不能直接回答下面任一问题，就说明它又开始偏航：

1. 这是否让客户端更像一款原生 SLG？
2. 这是否让 AI 更自然地嵌入原生 SLG 主流程？
3. 这是否在减少 preview/sandbox 偏航，而不是继续加深它？
