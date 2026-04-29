# 原生 SLG 正式组件文档

> 状态：正式主线文档。  
> 用途：定义“世界主壳 + 二级功能面板 + 三级功能面板”的组件化拆法、共享状态方案、建筑系统建模策略与素材替换约束。  
> 配套主文档：[NATIVE_SLG_MAINLINE_INDEX.md](NATIVE_SLG_MAINLINE_INDEX.md)

## 1. 这份文档解决什么问题

这份文档不是单纯罗列 UI 名字，而是用来解决下面 4 个实现风险：

1. 避免后续 AI 窗口把 `率土 / 三战式原生 SLG` 做成网页式页面系统。
2. 避免因为组件抽象过粗，把 `内政 / 部队 / 同盟 / 招募 / 武将 / AI` 混成一个通用大面板。
3. 避免因为组件抽象过细，导致一周内根本堆不出 demo。
4. 避免未来拿到正式素材后，现有 UI 结构无法替换、无法接皮。

## 2. 总体结论

### 2.1 推荐实现策略

当前推荐采用：

`共享组件底座 + 分域配置 + 分域 Presenter / Adapter`

而不是下面任一极端：

1. 不是“两套建筑系统完全独立实现到 UI、数据、交互全部重复一遍”
2. 也不是“一个万能建筑组件糊所有主城建筑与地块军备用建筑”

### 2.2 为什么这样选

因为当前已经确认：

1. `主城建筑` 和 `地块/军备用建筑` 不是同一棵树。
2. 它们的名称、效果、升级链、候选项都不同。
3. 但它们在 UI 交互上仍有大量可复用的共性：
   - 建筑卡片
   - 建筑详情
   - 建造条件
   - 升级条目
   - 消耗展示
   - 建筑树视图

所以最稳的方案是：

1. 底层共用 `BuildingCard / BuildingDetailPanel / BuildingTreeView / UpgradeActionSheet`
2. 域层分别维护：
   - `主城建筑定义`
   - `地块/军备用建筑定义`
   - `部队设施定义`

## 3. 组件化原则

### 3.1 必须组件化的层

下面这些必须组件化：

1. `世界主壳宿主`
2. `全屏二级功能面板宿主`
3. `标签切换条`
4. `列表面板`
5. `详情面板`
6. `建筑树视图`
7. `建造/升级确认面板`
8. `资源/消耗条`
9. `成员卡 / 武将卡 / 部队卡 / 建筑卡`
10. `素材插槽层`

### 3.2 不应抽成一个万能组件的层

下面这些不应硬抽成一个“大一统业务组件”：

1. `内政域`
2. `部队域`
3. `同盟域`
4. `招募域`
5. `武将域`
6. `AI 域`
7. `主城建筑树`
8. `地块/军备用建筑树`

原因很简单：

这些层共享的是“骨架”，不是“语义”。

## 4. 正式组件家族

### 4.1 世界主壳组件家族

| 组件名 | 作用 | 备注 |
|---|---|---|
| `WorldShellRoot` | 世界主壳根宿主 | 承载主城态、野外态、行军态 |
| `TopResourceBar` | 顶栏资源/货币/头像/时间 | 必须支持纯文本占位 |
| `LeftStatusRail` | 左侧任务/活动/状态流 | 后续可扩展为战报/提示入口 |
| `PrimaryNavDock` | 底部主入口栏 | 固定承载 `内政 / 招募 / 武将 / 同盟 / AI` |
| `ShellObjectHotspotLayer` | 主壳可点击对象层 | 城池、地块、部队、建筑点位 |

### 4.2 二级功能面板组件家族

| 组件名 | 作用 | 备注 |
|---|---|---|
| `FullScreenPanelHost` | 全屏二级功能面板宿主 | 所有二级面板共用 |
| `PanelHeaderBar` | 面板标题、返回、二级状态位 | 统一风格 |
| `PanelTabStrip` | 面板内标签切换条 | 用于三级功能面板切换 |
| `PanelSectionStack` | 面板内容分区栈 | 避免把整页写死 |
| `PanelFooterActionRow` | 底部操作区 | 招募、升级、确认、关闭 |

横屏移动端的 `关闭 / 返回` 触控规格不要散落在各面板里。修改 `FullScreenPanelHost`、单武将详情页头部按钮或相关 visual smoke 时，补读 [Godot 横屏移动端触控规格（2026-04-28）](GODOT_MOBILE_LANDSCAPE_UI_TOUCH_TARGETS_2026_04_28.md)；其他 UI 任务不需要默认读取这份补充文档。

### 4.3 列表/详情组件家族

| 组件名 | 作用 | 复用域 |
|---|---|---|
| `EntityListPanel` | 左/中列表区 | 同盟成员、武将总览、部队总览 |
| `EntityCard` | 单实体卡片 | 成员卡、武将卡、部队卡、建筑卡 |
| `EntityDetailPanel` | 右/中详情区 | 武将详情、成员详情、建筑详情 |
| `StatsBlock` | 属性块 | 武将属性、部队属性、建筑效果 |
| `CostRow` | 资源消耗展示 | 建造、升级、征兵、抽卡 |
| `EffectList` | 效果说明区 | 建筑效果、战法效果、政策效果 |

### 4.4 建筑组件家族

| 组件名 | 作用 | 备注 |
|---|---|---|
| `BuildingOptionRail` | 建筑候选横向/纵向列表 | 地块军备用建筑候选 |
| `BuildingTreeView` | 建筑树视图 | 主城建筑树、科技树式结构 |
| `BuildingDetailPanel` | 建筑详情 | 名称、等级、效果、条件 |
| `BuildUpgradeSheet` | 建造/升级确认面板 | 统一处理建造时间、资源消耗 |
| `BuildingSlotBadge` | 建筑状态角标 | 可建、升级中、条件不足 |

### 4.5 领域专属 Presenter / Adapter

这层不是 UI 组件，而是“把共享组件喂成正确内容”的组装层：

| Presenter / Adapter | 负责什么 |
|---|---|
| `InternalAffairsPresenter` | 内政域列表、详情、三级项组装 |
| `TroopPanelPresenter` | 五部队总览、单队编组、征兵、设施 |
| `AlliancePresenter` | 成员、分组、下属成员、官员架构、势力分布、军略 |
| `RecruitPresenter` | 卡池、抽卡、结果展示 |
| `GeneralPresenter` | 武将总览、详情、战法、养成 |
| `AIPanelPresenter` | 托管、议程、上下文 |
| `CityBuildingPresenter` | 主城建筑树和建筑详情 |
| `FieldStructurePresenter` | 地块/军备用建筑候选、详情、升级 |

## 5. 二级功能面板与三级功能面板如何落到组件

### 5.1 固定主入口型二级功能面板

第一阶段按这 5 个实现：

1. `内政`
2. `招募`
3. `武将`
4. `同盟`
5. `AI`

它们统一走：

`PrimaryNavDock -> FullScreenPanelHost -> PanelTabStrip -> PanelSectionStack`

### 5.2 主壳对象直达型二级功能面板

第一阶段至少实现：

1. `部队面板`

后续可能扩成：

1. `地块/军备用建筑详情链`
2. 城池对象详情链
3. 行军目标对象详情链

### 5.3 当前已确认的三级切项

| 二级面板 | 三级切项 |
|---|---|
| `内政` | `市井 / 税收 / 政策 / 政务` |
| `部队面板` | `五部队总览 / 设施` |
| `五部队总览` | `单队编组 / 征兵 / 阵容录` |
| `设施` | `校场 / 募兵所 / 统帅厅 / 其他建筑项` |
| `武将` | `武将总览 / 武将详情 / 战法 / 属性与养成` |
| `同盟` | `成员 / 分组 / 下属成员 / 官员架构 / 势力分布 / 军略` |
| `AI` | `托管 / 议程 / 城市上下文` |
| `招募` | `卡池切换 / 单抽 / 多抽 / 招募结果` |

## 6. 建筑系统正式实现建议

### 6.1 不推荐的两种做法

#### A. 两套完全独立实现

问题：

1. UI 会重复开发
2. 升级、消耗、详情、状态标签会重复写
3. 后面替换素材会非常痛苦

#### B. 一个万能建筑面板糊所有建筑

问题：

1. 会抹掉 `主城建筑` 和 `地块/军备用建筑` 的真实差异
2. 会逼着 `部队 -> 设施` 和 `内政 -> 市井` 用同一套路由
3. 很容易把层级做混

### 6.2 推荐做法

推荐：

`共享 Building 组件底座 + 两套建筑定义 + 两套 Presenter`

拆法如下：

1. 共享底座：
   - `BuildingCard`
   - `BuildingDetailPanel`
   - `BuildUpgradeSheet`
   - `BuildingTreeView`
   - `CostRow`
   - `EffectList`

2. 主城建筑定义：
   - `city_building_definitions`
   - 只服务 `内政` 或主城建筑树

3. 地块/军备用建筑定义：
   - `field_structure_definitions`
   - 只服务外部地块建筑候选、详情、升级

4. 部队设施定义：
   - `troop_facility_definitions`
   - 只服务 `部队面板 -> 设施`

### 6.3 这样做的收益

1. 结构不混
2. UI 不重复
3. 素材可替换
4. 一周内更可能堆出 demo

## 7. 共享状态但不混层级的正式方案

### 7.1 共享什么

可以共享的不是“路由层级”，而是“底层事实”：

1. 建筑定义
2. 建筑实例
3. 等级
4. 消耗
5. 效果
6. 建造中/升级中状态
7. 所属城市/所属地块/所属部队上下文

### 7.2 不共享什么

不应该共享：

1. 当前在哪个面板里
2. 当前属于哪一条交互路径
3. 当前返回去哪
4. 当前顶部标题和标签条

这些属于 UI 路由状态，必须由各自面板自己管理。

### 7.3 推荐状态分层

推荐把状态分成三层：

1. `WorldState`
   - 城市
   - 地块
   - 部队
   - 所有建筑实例

2. `DomainState`
   - `internal_affairs_state`
   - `troop_panel_state`
   - `alliance_state`
   - `recruit_state`
   - `general_state`
   - `ai_panel_state`

3. `ViewRouteState`
   - 当前二级面板
   - 当前三级切项
   - 当前选中的对象 id

### 7.4 具体怎么避免混层级

例如：

1. `内政 -> 市井`
   - 从 `WorldState` 读城市经济相关建筑和效果
   - 由 `InternalAffairsPresenter` 组装
   - 路由仍留在 `内政`

2. `部队面板 -> 设施 -> 校场`
   - 从 `WorldState` 读部队设施相关定义和实例
   - 由 `TroopPanelPresenter` 组装
   - 路由仍留在 `部队面板`

也就是说：

**共享的是数据，不共享的是层级。**

## 8. 素材替换与占位策略

### 8.1 当前约束

当前没有完整美术资产，所以必须允许：

1. 用简字按钮占位
2. 用统一边框/底板占位
3. 用图标缺省态占位
4. 用文字替代表面贴图

### 8.2 为了后续替换素材，当前组件必须保留的插槽

每个主要组件都应至少预留：

1. `frame_slot`
2. `background_slot`
3. `icon_slot`
4. `badge_slot`
5. `title_text_slot`
6. `subtitle_text_slot`
7. `state_text_slot`

### 8.3 严禁的做法

1. 严禁把中文标题直接烤进图片
2. 严禁把某个临时素材路径硬编码进面板逻辑
3. 严禁把同一素材命名当成唯一业务语义

### 8.4 推荐做法

1. 组件只认“语义插槽”
2. 主题或资源映射表再把语义插槽映到真实素材
3. 没素材时回退到文本占位

## 9. 证据视频索引

当前正式主线判断，直接基于以下视频：

| 证据别名 | 原始文件名 | 原始路径 | 主要证明内容 |
|---|---|---|---|
| `LTZB_VIDEO_01_BASE_SHELL` | `5248c1d9640247e739d2d7f2addee905_raw.mp4` | `C:\\Users\\26739\\Desktop\\8989\\5248c1d9640247e739d2d7f2addee905_raw.mp4` | 世界主壳、部队面板、市井 |
| `LTZB_VIDEO_02_RECRUIT_GENERAL_TROOP` | `a60de4784fcc191f7ea8a92e711e0f66.mp4` | `D:\\wx\\xwechat_files\\wxid_qb4mrsthej6629_032e\\msg\\video\\2026-04\\a60de4784fcc191f7ea8a92e711e0f66.mp4` | 招募、武将、部队->设施 |
| `LTZB_VIDEO_03_ALLIANCE` | `fd6f2df7950e1578d286ca4d2ca50b71.mp4` | `D:\\wx\\xwechat_files\\wxid_qb4mrsthej6629_032e\\msg\\video\\2026-04\\fd6f2df7950e1578d286ca4d2ca50b71.mp4` | 同盟二级/三级层级 |
| `LTZB_VIDEO_04_FIELD_BUILDINGS` | `78c0e5feed94a5ff00525e8daa53e8ce.mp4` | `D:\\wx\\xwechat_files\\wxid_qb4mrsthej6629_032e\\msg\\video\\2026-04\\78c0e5feed94a5ff00525e8daa53e8ce.mp4` | 地块/军备用建筑、升级、主城建筑树差异 |

说明：

1. 当前只给出“文档内别名”，不改磁盘原始文件名，避免破坏来源链。
2. 后续如果要做长期素材库，再单独整理成 `evidence_manifest`。

## 10. 一周 demo 的建议实现顺序

1. `FullScreenPanelHost`
2. `PanelTabStrip`
3. `EntityListPanel + EntityDetailPanel`
4. `BuildingTreeView + BuildUpgradeSheet`
5. `AlliancePresenter`
6. `TroopPanelPresenter`
7. `CityBuildingPresenter`
8. `FieldStructurePresenter`

原因：

1. 这条顺序最贴近你已经录出来的视频证据
2. 最容易先拼出“像原生 SLG”的 demo
3. 最容易让后续 AI 继续接着做，而不是重新理解结构

## 11. 当前一句话约束

如果某个组件抽象不能同时满足下面两条，就说明抽象错了：

1. 它能复用 UI 壳与交互骨架
2. 它不会抹掉 `内政 / 部队 / 同盟 / 招募 / 武将 / AI / 主城建筑 / 地块军备用建筑` 的领域差异
