# 代码主线保留 / 冻结 / 桥接矩阵（2026-04-16）

> 状态：附录快照。  
> 当前主线代码判断请先读：[NATIVE_SLG_MAINLINE_INDEX.md](NATIVE_SLG_MAINLINE_INDEX.md) 和 [NATIVE_SLG_COMPONENT_ARCHITECTURE.md](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)

> 目标：明确当前仓库中哪些代码继续作为主线资产，哪些进入冻结区，哪些只保留桥接参考价值。

## 1. 判定原则

代码分区按下面三条判断：

1. 是否直接服务“原生 SLG 主壳 + AI 变量”主线。
2. 是否属于 authoritative 后端或共享契约。
3. 是否只是 `UI Preview Sandbox / story / regression` 体系的执行资产。

## 2. 保留区

### 2.1 `server/**`

判定：主线保留

理由：

- 承载 authoritative 世界推进
- 承载会话与任务
- 承载 AI 执行链路
- 承载 V2 玩法与观测接口

### 2.2 `shared/**`

判定：主线保留

理由：

- 是前后端共享契约层
- 包含世界、会话、规则、场景等事实源
- 不应因前端 UI 重置而推翻

### 2.3 `godot-client/scripts/map/**`

判定：主线保留

理由：

- 这是地图与空间表达的运行时底座
- 与原生 SLG 的主城/大地图重建仍然相关
- 不等同于 preview story 层

## 3. 冻结区

### 3.1 `godot-client/scripts/dev/stories/**`

判定：冻结

理由：

- 明显服务 story / preview 演示结构
- 当前不应继续当主入口推进

### 3.2 `godot-client/scripts/dev/components/**`

判定：冻结

理由：

- 组件主要依附 preview story 体系
- 当前不应继续扩展为主产品界面

### 3.3 `godot-client/scenes/dev/**`

判定：冻结

理由：

- 是 dev / sandbox 场景树
- 不代表未来原生 SLG 正式入口

### 3.4 `godot-client/data/ui_preview/stories/**`

判定：冻结

理由：

- 是 preview story 的数据索引与合同
- 不是客户端主运行逻辑

### 3.5 `godot-client/tools/validate_ui_preview_sandbox.py`

判定：冻结

理由：

- 服务 preview sandbox 验证链
- 当前不应继续作为主线投入中心

### 3.6 `godot-client/tools/run_ui_preview_sandbox_regression.py`

判定：冻结

理由：

- 服务 preview screenshot regression
- 当前不应继续牵引主目标

## 4. 桥接参考区

### 4.1 `godot-client/README.md`

判定：桥接参考

理由：

- 能说明当前 Godot 客户端是如何被 preview 体系组织起来的
- 但不应再当未来主线入口说明书

### 4.2 `godot-client/data/ui_preview/stories/stories_manifest.json`

判定：桥接参考

理由：

- 能帮助理解现有 preview 资产分布
- 但本质是 story 索引，不是主产品入口配置

### 4.3 `godot-client/scripts/dev/stories/ui_preview_story_base.gd`

判定：桥接参考

理由：

- 说明 preview story 的壳层与数据接法
- 可作为拆迁参考，不应继续扩写

### 4.4 `godot-client/scripts/dev/stories/map_preview_story_base.gd`

判定：桥接参考

理由：

- 能看出 `scripts/map/**` 如何被 preview 层复用
- 有桥接价值，但不应作为未来主入口

### 4.5 `godot-client/scripts/dev/data/ui_preview_data_adapter.gd`

判定：桥接参考

理由：

- 说明 preview 数据如何接进 UI
- 后续仅供迁移时参考

### 4.6 `C:\Users\Buffoon Queer\Desktop\8989-cd\docs\MAP_SURFACE_LAYOUT_RESEARCH_2026_04_16.md`

判定：桥接参考

理由：

- 对率土式地图 UI 槽位拆解有参考价值
- 但仍绑定旧 `map_surface` 命名和 preview 语境

## 5. 当前不建议动的区域

在主线文档与正式主入口未定前，不建议优先改：

- preview story 的截图细节
- `map_surface` 的 semantic density 小收口
- Card D 延伸设计
- 以回归截图为目标的壳层增补

## 6. 对后续代码工作的含义

下一阶段代码改造应按下面顺序理解仓库：

1. `server/**` 和 `shared/**` 是不能随意推翻的主资产。
2. `godot-client/scripts/map/**` 是值得承接到原生 SLG 主入口的客户端底座。
3. `godot-client/scripts/dev/**`、`scenes/dev/**`、`data/ui_preview/**` 暂停继续扩写。
4. 后续如果需要迁移代码，应从桥接参考区抽取有用部分，而不是整套照搬 preview 体系。

## 7. 一句话检查

任何新改动都应先问一句：

它是在加强 `server/shared/map` 这条主干，还是又把时间投入回 `preview/dev/story` 侧线？
