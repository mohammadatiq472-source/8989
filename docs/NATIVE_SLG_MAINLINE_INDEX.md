# 原生 SLG 正式主线文档

> 状态：正式主线文档。  
> 用途：把当前“原生 SLG + AI 玩家”主线固定成唯一产品主线文档；后续对齐、改码、组件设计、旧文档降级都以这份为准。

## 0. 正式读取顺序

后续 AI / 新窗口 / 新会话默认按下面顺序读取：

1. [NATIVE_SLG_MAINLINE_INDEX.md](NATIVE_SLG_MAINLINE_INDEX.md)
2. [NATIVE_SLG_COMPONENT_ARCHITECTURE.md](NATIVE_SLG_COMPONENT_ARCHITECTURE.md)
3. [Godot 原生 SLG 主壳布局对齐（2026-04-18）](GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md)
4. [Godot SVG 图标源资产包（2026-04-18）](GODOT_SVG_ICON_SOURCE_PACK_2026_04_18.md)
5. [Godot 战报面板骨架（2026-04-18）](GODOT_BATTLE_REPORT_PANEL_SKELETON_2026_04_18.md)
6. [AI 快速导航索引](AI_QUICK_NAV_INDEX_2026_04_10.md)
7. [仓库主入口 README](../README.md)
8. [Godot 主入口 README](../godot-client/README.md)
9. [Codex 主线记忆锚点](../CODEX.md)
10. [NATIVE_SLG_MAINLINE_INDEX_2026_04_16.md](NATIVE_SLG_MAINLINE_INDEX_2026_04_16.md)
11. [NATIVE_SLG_RESET_PLAN_2026_04_16.md](NATIVE_SLG_RESET_PLAN_2026_04_16.md)
12. [NATIVE_SLG_PAGE_STRUCTURE_2026_04_16.md](NATIVE_SLG_PAGE_STRUCTURE_2026_04_16.md)
13. [AI_PHASE1_INSERTION_POINTS_2026_04_16.md](AI_PHASE1_INSERTION_POINTS_2026_04_16.md)
14. [CODE_MAINLINE_KEEP_FREEZE_BRIDGE_2026_04_16.md](CODE_MAINLINE_KEEP_FREEZE_BRIDGE_2026_04_16.md)

说明：

1. 第 1 和第 2 份是正式现行文档。
2. 第 3 到第 9 份是正式导航/运行入口，用来恢复关系图谱与真实启动链。
3. 第 10 到第 14 份保留为快照/附录，不再和第 1、2 份争主入口。
4. 渐进式补读：只有在修改横屏移动端 `关闭 / 返回` 触控热区、`FullScreenPanelHost` 或单武将详情页头部按钮时，补读 [Godot 横屏移动端触控规格（2026-04-28）](GODOT_MOBILE_LANDSCAPE_UI_TOUCH_TARGETS_2026_04_28.md)。
5. 渐进式补读：只有在修改 Godot `AI` 管理页、`AI玩家` 子页、`聊天记忆`、或主聊天频道跳转验证时，补读 [Godot AI 管理页横屏移动端验收记录（2026-04-28）](GODOT_AI_PANEL_MOBILE_LANDSCAPE_ACCEPTANCE_2026_04_28.md)。
6. 为了让后续 AI 能在没有 Obsidian CLI 的情况下也恢复关系图谱，继续补下面这组静态回链：
   - [../CODEX.md](../CODEX.md)
   - [AGENTS_EXECUTION_CURRENT_2026_04.md](AGENTS_EXECUTION_CURRENT_2026_04.md)
   - [AI_QUICK_NAV_INDEX_2026_04_10.md](AI_QUICK_NAV_INDEX_2026_04_10.md)
   - [GODOT_AI_PANEL_MOBILE_LANDSCAPE_ACCEPTANCE_2026_04_28.md](GODOT_AI_PANEL_MOBILE_LANDSCAPE_ACCEPTANCE_2026_04_28.md)
   - [GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md](GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md)
   - [GODOT_SVG_ICON_SOURCE_PACK_2026_04_18.md](GODOT_SVG_ICON_SOURCE_PACK_2026_04_18.md)
   - [GODOT_BATTLE_REPORT_PANEL_SKELETON_2026_04_18.md](GODOT_BATTLE_REPORT_PANEL_SKELETON_2026_04_18.md)
   - [../README.md](../README.md)
   - [../godot-client/README.md](../godot-client/README.md)

## 1. 当前目标

我们当前要做的不是一套 AI 演示系统，而是一款原生 SLG 手游：

1. 强参照国内原生 SLG 手游的主壳、切页手感、入口位置、信息结构。
2. 在原生 SLG 玩法上，为 AI 玩家与真人玩家的互动预留位置。
3. 先把主壳和功能层级做对，再继续扩功能和美术。

一句话：

**先做一款像国内原生 SLG 的手游壳，再把 AI 玩家自然嵌进去。**

## 2. 核心玩法定义

当前核心玩法定义如下：

1. 真人玩家统领若干 AI 玩家。
2. 多个真人玩家可以组成同盟。
3. AI 玩家在世界规则、身份表现、行为参与上尽量与真人玩家一致。
4. AI 玩家与真人玩家的区别，不是 UI 外观，而是驱动方式：
   - 真人由玩家直接操作
   - AI 由大语言模型 + 状态树 + 世界引擎共同驱动

## 3. 层级命名

### 3.1 已确认

1. 顶层统一叫：`世界主壳`
2. 第二层统一叫：`二级功能面板`
3. 第三层统一叫：`三级功能面板`

### 3.2 解释

1. `世界主壳` 不是网页式页面，而是持续存在的游戏世界操作壳。
2. `二级功能面板` 默认是全屏接管式，不是半屏抽屉，不是网站侧栏。
3. `三级功能面板` 只存在于某个二级功能面板内部。

## 4. 世界主壳

### 4.1 已确认

`世界主壳` 至少常驻这些区域：

1. 顶栏资源、货币、头像、时间、邮件类信息
2. 左侧任务/活动/状态流
3. 底部主入口
4. 主视区镜头
5. 主壳内可点击对象：
   - 部队槽
   - 建筑/设施点位
   - 城池
   - 地块
   - 行军/调动对象

### 4.2 当前理解

`世界主壳` 里不是只有一个静态主城页，而是会切换不同操作态：

1. 主城视角态
2. 野外/出征视角态
3. 调动/选地/行军态

这些态都仍属于同一个 `世界主壳`，而不是独立页面。

## 5. 固定主入口二级功能面板

### 5.1 已确认

第一批固定主入口二级功能面板先定为：

1. `内政`
2. `招募`
3. `武将`
4. `同盟`
5. `AI`

### 5.2 已确认补充

1. `内政` 是固定主入口型二级功能面板。
2. `AI` 在 UI 中直接叫 `AI`，本身就是独立的二级功能面板。
3. `招募`、`武将`、`同盟` 也都按完整全屏二级功能面板理解，不按“小窗功能区”理解。

## 6. 主壳对象直达型二级功能面板

### 6.1 已确认

下列内容不从底部 5 主入口进入，而是从 `世界主壳` 内对象直接进入：

1. `部队面板`
2. `部队面板` 首层会呈现 `5 个部队/队伍位`
3. 当前更准确的层级关系是：
   - `世界主壳 -> 部队面板`
   - `部队面板 -> 设施入口`
   - `设施入口 -> 校场 / 募兵所 / 统帅厅 / 其他建筑项`

### 6.2 当前理解

关于 `设施 / 建筑 / 建筑点位 / 部队域`，当前先按下面的口径保存：

1. 当前**并不存在一个已经确认的、统一的 `设施面板`**，可以直接作为“对象直达型二级功能面板壳”来建模。
2. 当前更像是：不同二级功能面板之间会共享一部分 `设施/建筑` 状态，但入口路径并不统一。
3. `市井` 已确认归 `内政` 域，不按独立设施域处理。
4. `建筑` 这个词暂不作为稳定内容域名称使用，更适合先理解成主壳内对象或某个域内的具体设施项。
5. `部队面板` 内部存在一条 `设施` 路径，点进去后会出现建筑树；其中既有偏部队功能的建筑，也可能包含增加资源或开启功能的建筑项。
6. 当前至少存在两类不共享的建筑族：
   - `主城建筑`
   - `地块/军备用建筑`，例如 `要塞 / 预备兵营 / 仓库 / 资源场`
7. `主城建筑` 与 `地块/军备用建筑` 的名字、效果、升级链都不相同，当前按两套对象族理解更准确。

### 6.3 当前待确认

关于 `设施 / 建筑 / 内政 / 部队` 的关系，目前先保留为待确认问题：

1. `校场 / 募兵所 / 统帅厅` 当前更像 `部队` 域相关内容，而不是 `内政` 域。
2. 行业共性里，`市井/集市` 更偏 `内政/城建`；但当前视频又出现了 `部队` 内部的 `设施` 路径，所以不能直接把行业模板硬套进产品结构。
3. `地块/军备用建筑` 在代码结构上要拆到“独立对象族”还是“共享组件 + 独立配置”，待实现层再定。

## 7. 三级功能面板

### 7.1 已确认

`三级功能面板` 只属于某个二级功能面板内部。

### 7.2 当前暂定示例

1. `内政 -> 市井 / 税收 / 政策 / 政务`
2. `部队面板 -> 五部队总览 / 设施`
3. `五部队总览 -> 单队编组 / 征兵 / 阵容录`
4. `设施 -> 校场 / 募兵所 / 统帅厅 / 其他建筑项`
5. `武将 -> 武将总览 / 武将详情 / 战法 / 属性与养成`
6. `同盟 -> 成员 / 分组 / 下属成员 / 官员架构 / 势力分布 / 军略（初版确认，不写死）`
7. `AI -> 托管 / 议程 / 城市上下文`
8. `招募 -> 卡池切换 / 单抽 / 多抽 / 招募结果（初版确认，不写死）`

### 7.3 当前补充理解

1. `二级功能面板` 下方允许继续分出更细的子功能层，当前文档只写到足够指导主线结构的粒度。
2. 后续如果新增功能，不应被视为推翻主线，而是对既有二级功能面板的继续扩展。
3. 对 `同盟` 来说，点击 `成员 / 分组 / 下属成员 / 官员架构 / 势力分布 / 军略` 这类切项时，应按 `三级功能面板` 理解。
4. 在 `同盟` 内再点某个具体成员的个人资料页，更像进一步的详情层，不必强行和上面的三级项放在同一层。

## 8. 来自视频的结构证据

### 8.1 证据视频索引

| 证据别名 | 原始文件名 | 原始路径 | 主要证明内容 |
|---|---|---|---|
| `LTZB_VIDEO_01_BASE_SHELL` | `5248c1d9640247e739d2d7f2addee905_raw.mp4` | `C:\\Users\\26739\\Desktop\\8989\\5248c1d9640247e739d2d7f2addee905_raw.mp4` | 世界主壳、部队面板、市井 |
| `LTZB_VIDEO_02_RECRUIT_GENERAL_TROOP` | `a60de4784fcc191f7ea8a92e711e0f66.mp4` | `D:\\wx\\xwechat_files\\wxid_qb4mrsthej6629_032e\\msg\\video\\2026-04\\a60de4784fcc191f7ea8a92e711e0f66.mp4` | 招募、武将、部队->设施 |
| `LTZB_VIDEO_03_ALLIANCE` | `fd6f2df7950e1578d286ca4d2ca50b71.mp4` | `D:\\wx\\xwechat_files\\wxid_qb4mrsthej6629_032e\\msg\\video\\2026-04\\fd6f2df7950e1578d286ca4d2ca50b71.mp4` | 同盟二级/三级层级 |
| `LTZB_VIDEO_04_FIELD_BUILDINGS` | `78c0e5feed94a5ff00525e8daa53e8ce.mp4` | `D:\\wx\\xwechat_files\\wxid_qb4mrsthej6629_032e\\msg\\video\\2026-04\\78c0e5feed94a5ff00525e8daa53e8ce.mp4` | 地块/军备用建筑、升级、主城建筑树差异 |

说明：

1. 文档里优先使用证据别名，避免后续上下文里反复堆乱码文件名。
2. 保留原始文件名和原始路径，确保来源可追溯。

### 8.2 关键帧与结论

以下证据来自：

- `C:\\Users\\26739\\Desktop\\8989\\5248c1d9640247e739d2d7f2addee905_raw.mp4`
- `D:\\wx\\xwechat_files\\wxid_qb4mrsthej6629_032e\\msg\\video\\2026-04\\a60de4784fcc191f7ea8a92e711e0f66.mp4`
- `D:\\wx\\xwechat_files\\wxid_qb4mrsthej6629_032e\\msg\\video\\2026-04\\fd6f2df7950e1578d286ca4d2ca50b71.mp4`
 - `D:\\wx\\xwechat_files\\wxid_qb4mrsthej6629_032e\\msg\\video\\2026-04\\78c0e5feed94a5ff00525e8daa53e8ce.mp4`

关键帧：

1. [focus_02.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_ltzb_focus_20260416/focus_02.jpg>)
   - 说明 `世界主壳` 内常驻了 5 个部队槽
   - 右侧存在 `设施` 点击入口
2. [focus_03.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_ltzb_focus_20260416/focus_03.jpg>)
   - 说明 `部队面板` 是完整功能层
   - 说明一支部队最多可由 `大营 / 中军 / 前锋` 组成
3. [focus_01.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_ltzb_focus_20260416/focus_01.jpg>)
   - 说明 `市井` 是完整功能层，不是小弹窗
4. [frame_01_00-00-08.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_more_targets_20260416/frame_01_00-00-08.jpg>)
   - 说明 `招募` 是完整全屏二级功能面板
5. [frame_02_00-00-18.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_more_targets_20260416/frame_02_00-00-18.jpg>)
   - 说明 `武将总览` 是独立完整功能层
6. [frame_03_00-00-28.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_more_targets_20260416/frame_03_00-00-28.jpg>)
   - 说明 `武将详情/养成` 也是完整功能层，不是列表页附属小弹窗
7. [frame_05_00-00-55.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_more_targets_20260416/frame_05_00-00-55.jpg>)
   - 说明城政类内容本身具备完整面板结构和多个下级入口
8. [frame_06_00-01-10.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_more_targets_20260416/frame_06_00-01-10.jpg>)
   - 说明 `世界主壳` 常驻资源、左侧状态流、底部部队/入口卡槽
9. [frame_13_00-02-35.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_more_targets_20260416/frame_13_00-02-35.jpg>)
   - 说明 `部队面板` 内部确实存在 `设施入口 -> 建筑树` 路径
10. [frame_15_00-02-42.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_more_targets_20260416/frame_15_00-02-42.jpg>)
   - 说明建筑树展开后会出现多项可点击建筑，不只是单一军备建筑
11. [frame_02_00-00-08.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_alliance_20260416/frame_02_00-00-08.jpg>)
   - 说明 `同盟` 二级功能面板下至少明确存在 `成员 / 分组 / 下属成员` 这类切项
12. [frame_06_00-00-24.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_alliance_20260416/frame_06_00-00-24.jpg>)
   - 说明 `同盟` 内还有官员架构类功能层，不止列表页
13. [frame_11_00-00-48.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_alliance_20260416/frame_11_00-00-48.jpg>)
   - 说明 `同盟` 内存在势力分布/区域图类功能层
14. [frame_12_00-00-54.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_alliance_20260416/frame_12_00-00-54.jpg>)
   - 说明 `同盟` 内还存在 `军略` 这类策略子层
15. [frame_03_00-00-12.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_field_buildings_20260416/frame_03_00-00-12.jpg>)
   - 说明 `地块/军备用建筑` 具备独立详情与建造条件面板
16. [frame_05_00-00-20.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_field_buildings_20260416/frame_05_00-00-20.jpg>)
   - 说明 `地块/军备用建筑` 具备独立升级面板与独立升级参数
17. [frame_08_00-00-32.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_field_buildings_20260416/frame_08_00-00-32.jpg>)
   - 说明 `地块/军备用建筑` 有自己单独的建筑候选列表，例如 `要塞 / 行营营地 / 瞭望塔`
18. [frame_10_00-00-40.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_field_buildings_20260416/frame_10_00-00-40.jpg>)
   - 说明候选列表继续展开时，还会出现 `大型要塞 / 预备兵营 / 仓库 / 采星场` 等外部军备用建筑
19. [frame_12_00-00-48.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_field_buildings_20260416/frame_12_00-00-48.jpg>)
   - 说明 `主城建筑` 有自己单独的建筑树，和外部军备用建筑不共用命名与节点
20. [frame_13_00-00-52.jpg](</C:/Users/26739/Desktop/8989/tmp/video_frames_field_buildings_20260416/frame_13_00-00-52.jpg>)
   - 说明 `主城建筑树` 向下延展出的节点体系也不同于外部军备用建筑

## 9. 当前最重要的未决问题

以下问题仍需继续对话后再最终定稿：

1. `建筑` 这个词以后是否只保留给主壳对象，不再把它当稳定内容域名称？
2. `主城建筑` 和 `地块/军备用建筑` 在代码结构里应拆到什么粒度？
3. 行业共性的 `内政/城建` 归类，和当前视频里的 `部队 -> 设施` 路径，最终如何在产品结构里并存？
4. `地块/军备用建筑` 是否还需要再单列一个对象直达型二级功能面板族，还是保留在 `世界主壳` 内的对象详情链即可？

## 10. 当前代码工作含义

在代码侧，当前最值钱的工作顺序应是：

1. 先把 `世界主壳` 做稳
2. 再做“全屏二级功能面板宿主”
3. 先落第一个固定主入口二级功能面板：`内政`
4. 再落第一个对象直达型二级功能面板：`部队面板`
5. 暂不把 `设施面板` 写成统一总壳，先允许 `内政` 与 `部队面板` 共享一部分设施/建筑状态

## 11. 与正式组件文档的关系

这份文档回答的是：

1. 产品结构是什么
2. 层级怎么分
3. 哪些结论已经被视频证据支撑

[NATIVE_SLG_COMPONENT_ARCHITECTURE.md](NATIVE_SLG_COMPONENT_ARCHITECTURE.md) 回答的是：

1. 组件怎么拆
2. 哪些组件必须复用
3. 哪些域不能被错误抽象成一个万能组件
4. 主城建筑、地块/军备用建筑、部队设施如何共享底座而不混层级

## 12. 文档治理策略

这份文档从现在起作为唯一主文档骨架。

后续文档治理方向：

1. 这份文档保留为唯一主入口
2. 日期版主线文档降为附录/快照
3. preview / task / handoff 旧文档整体降级为：
   - 附录
   - 历史
   - 桥接参考

## 13. 一句话检查

如果一个改动不能直接回答下面任一问题，就说明又开始偏航：

1. 这是否让客户端更像国内原生 SLG？
2. 这是否让 `世界主壳 -> 二级功能面板 -> 三级功能面板` 更清楚？
3. 这是否让 AI 玩家更自然地嵌入原生 SLG 主流程？

## 14. 协作进展记录

本节从现在起作为主线协作文档，记录已经落地并通过正式入口验证的实现，避免后续窗口只看聊天记录。

### 14.1 已完成的主线实现

1. `世界主壳` 已落到正式 Godot 主入口，不再以 preview sandbox 作为默认产品入口。
2. `内政 / 招募 / 武将 / 同盟 / AI` 已作为固定主入口二级功能面板写入主线结构。
3. `部队面板` 已接通 `5 个部队位 -> 部队面板 -> 设施 -> 建筑树 -> 升级单` 链路。
4. `内政` 已接成正式全屏面板，当前至少包含：
   - `市井 / 税收 / 政策 / 政务`
   - 城市建筑树
   - 政务队列
5. `同盟` 已接成正式全屏面板，结构按 `成员 / 分组 / 下属成员 / 官员架构 / 势力分布 / 军略` 初版推进。

### 14.2 已完成的组件化与瘦身

1. 已完成正式组件底座：
   - `FullScreenPanelHost`
   - `PanelTabStrip`
   - `BuildingTreeView`
   - `BuildUpgradeSheet`
   - `SlgSnapshotPanel`
   - `AlliancePanel`
   - `TroopPanel`
   - `InteriorPanel`
   - `RecruitPanel`
   - `GeneralPanel`
   - `AIPanel`
2. 已完成正式 Presenter：
   - `AlliancePresenter`
   - `NativeShellPresenter`
   - `RuntimeContextPresenter`
   - `TroopPanelPresenter`
   - `InternalAffairsPresenter`
   - `RecruitPresenter`
   - `GeneralPresenter`
   - `AIPanelPresenter`
3. 已完成正式 Adapter：
   - `SlgDomainStateAdapter`
   - `SlgDomainActionAdapter`
4. `main.gd` 已从“同时负责读世界态、派生默认态、路由、动作写回”的大总控，收缩到以路由、信号订阅、Presenter/Adapter 调用为主。

### 14.3 已完成的状态链

1. Godot 侧已存在最小共享状态：
   - `troopFacilitiesByUnit`
   - `cityBuildingGroupsByCity`
   - `affairsQueueByCity`
   - `recruitStateByFaction`
   - `generalStateByFaction`
   - `aiStateByFaction`
2. 当前最小共享状态已落在：
   - `godot-client/autoload/world_store.gd`
3. 后端权威态当前按最小方案挂在：
   - `WorldState.slgDomainState`
4. 以下动作已从“只刷新展示”升级为“真实状态变化链”：
   - `部队设施升级`
   - `内政建筑升级`
   - `政务入队`
   - `招募单抽/多抽`
    - `武将编组`
    - `AI 托管切换`
    - `AI 议程刷新`
    - `招募结果 -> 武将聚焦`
    - `AI 上下文焦点 -> 民生记忆权威读`
    - `招募结果 -> 直接编组最新武将`

### 14.4 已完成的最小后端动作

1. 本轮已新增并走通的后端动作：
   - `promoteCityBuilding`
   - `recruitProspectHero`
   - `promoteTroopFacilityBuilding`
   - `enqueueAffair`
   - `setGeneralActiveHero`
   - `setAiContextFocus`
2. 当前复用的正式权威入口：
   - `deployReserveHero`
   - `POST /api/session/autonomy`
   - `previewDomainAgenda`
   - `previewGeneralDirectives`
   - `queryCivilMemory`
3. `city building upgrade` 已不再走本地先成功、后端再补的旧链，而是改成 `promoteCityBuilding` authoritative-first。
4. `troop facility upgrade` 与 `affair enqueue` 已从长期 optimistic local state 收紧为更严格的 `authoritative-first`。
5. `招募` 已切到 `recruitProspectHero` world action 主线，不再绕回 V2 招募旁路。
6. 当前策略不是伪造 CLI/template 桥接，而是：
     - 先把 action intent 正规化
     - 能直连后端的动作直接走 `world action`
     - 其余继续在 Godot 共享状态与后端权威状态之间收口
7. `武将战法` 已不再只是本地状态切换；当前已新增 `setGeneralTactic` 正式后端动作，`general tactic` 会先走权威 world action，再把 `activeHeroId / tacticByHeroId / directivePreview` 一并写回权威 world。
8. `AI 上下文焦点` 已不再只是本地 focus 切换，当前会先走 `queryCivilMemory` 权威读，再回写 `aiStateByFaction.contextMemorySummary`。
9. `alliance / interior` 已继续往统一 snapshot overlay helper 收口，不再保留两套完全不同的开面板胶水。
10. `setGeneralTactic` 当前在后端会根据武将是否已编组自动决定是否向当前部队追加 `queueTacticalOverride`，不再由 Godot adapter 侧手工分支。
11. `AI 议程` 已从“只刷新预览”推进到正式动作族；当前已新增 `queueAiAgendaAction`，由后端统一接 `agenda_expand / agenda_support / agenda_stabilize`，不再由 Godot 直接拼 `queuePlanExecution` payload。
12. `招募结果` 页已补 `查看最新武将 / 直接编组最新武将` 两类后续动作，不再停在结果展示。
13. `alliance / interior / recruit / generals / ai_hub` 现已全部纳入统一 snapshot overlay helper，`main.gd` 不再为这几条维持两套开面板和刷新胶水。
14. `main.gd` 里的 overlay finalize / follow-up / post-navigation 已继续拆到 `_finalize_overlay_action / _finalize_overlay_followups / _apply_overlay_post_navigation` 三层 helper，主编排器只保留薄路由与 runtime label/record 收口。
15. `queryCivilMemory` 已扩展到 `factionId / relatedId` 过滤，`AI context focus` 不再只能做粗粒度权威读；当前会先按 `焦点 + 势力` 精确查询，必要时再回退到 `仅 factionId`。
16. `SlgSnapshotPanel` 已补 `set_active_tab_id(...)`，所以 `招募结果 -> 查看最新武将 / 直接编组最新武将` 现在可以直接切到 `武将 / 详情`，而不只是停在当前结果页。
17. `SlgSnapshotPanel` 当前已开始显式发 `page_changed / page_action_requested`；`top_tab_changed / action_requested` 只保兼容，后续新面板不再新增对旧信号名的依赖。
18. `SlgSnapshotSectionPage` 当前已开始显式消费 `snapshot.shared_state`；共享状态不再只是 presenter 局部变量，后续三级页与跨页共享先走这层合同。
19. `setGeneralActiveHero` 已补成正式后端动作，`activeHeroId` 不再继续停留在 Godot 本地焦点态。
20. `setAiContextFocus` 已补成正式后端动作，并把 `contextMemorySummary` 一并写回权威 world，不再长期依赖“权威读 + 本地 focus 状态”。
21. `shallowCloneWorld()` 已补 `slgDomainState` 深拷贝，避免新增焦点态动作时把同级分支覆盖掉。
20. `setGeneralTactic` 与 `queueAiAgendaAction` 已完成 fresh-port 正式 CLI 验证，确认 `generalStateByFaction` 与 `aiStateByFaction` 的权威写链都能落回 world。
21. `setGeneralTactic` 当前已补“未编组说明链”：如果武将尚未编组，后端会把 `directivePreview.summary / warnings` 一并写入权威 world，而不是再靠 Godot 本地兜底解释。
22. `queueAiAgendaAction` 当前已补权威摘要回写：`aiState.agenda.source / summary / optionLabels / lastAgendaActionId` 会在后端直接写回，不再只依赖前端本地标签刷新。
24. `main.gd` 的 `recruit / generals / ai_hub` 三个 overlay action handler 已继续合并成统一 `_on_snapshot_overlay_page_action_requested(...)`；旧 `_on_snapshot_overlay_action_requested(...)` 只留兼容别名，不再维持三条几乎相同的分域 handler。
25. `troop` 已不再作为 `main.gd` 里的固定面板例外；当前也已纳入统一 snapshot overlay helper，和 `interior / recruit / generals / alliance / ai_hub` 走同一套打开、刷新与回写链。
26. `interior / troop` 的余下动作胶水已继续收口到统一 helper：当前通过 `_on_snapshot_overlay_extra_action_requested(...) + _build_overlay_adapter_args(...)` 统一承接 `building_upgrade_requested / affair_enqueued / upgrade_requested`，不再为这三条链单独保留分域 handler。
26. `AI agenda` 当前已继续细化到“权威选项驱动”的动作入口：面板优先按 `agenda.optionLabels` 生成 `agenda_option_0/1/2`，再由 adapter 解析到正式 `queueAiAgendaAction`，不再把动作按钮顺序固定死在 Godot 侧。
27. `main.gd` 当前已继续把 record / runtime label 收口成统一 `_apply_overlay_feedback(...)`，`troop` 的 state signal 也已统一经过 `_resolve_overlay_state_feedback(...)`，不再散落在各个 handler 里手写一遍。
28. `武将战法` 的权威说明链已补成结构化字段：`directivePreview` 现在除了 `summary / warnings` 外，还会继续写回 `status / effectLines / nextSteps / targetUnitId / targetTileId`，便于后续 presenter 直接吃权威说明。
29. `AI agenda` 已扩到更细的正式动作族：当前除了 `agenda_expand / agenda_support / agenda_stabilize`，还新增了 `agenda_recover / agenda_redeploy`，并由后端权威写回 `optionActionIds + optionLabels`，不再让前端按标签猜动作。
30. `main.gd` 当前已把 overlay finalize 主链下沉到 `slg_domain_action_adapter.finalize_overlay_outcome(...)`；旧的 `_finalize_overlay_action / _finalize_overlay_followups` 已移除，主编排器只保留 world refresh 与 post-navigation 协调。
31. `interior / troop` 当前已把 extra action 参数拼装收成 spec 驱动：`_build_overlay_adapter_args(...)` 不再硬编码方法名，而是读取 overlay spec 里的 `extra_action_arg_templates`。
32. `troop` 的 state signal 当前也已改成 spec 驱动：`troop_selected / facility_selected / building_selected` 的 record path、record state、runtime label 与局部状态赋值都由 `state_feedback_specs` 统一描述，不再散落在主编排器分支里。
33. `武将战法` 当前已补 `directivePreview.heroId / executionState / templateId / affectedUnitIds`；前端如果发现当前激活武将与权威说明链归属不一致，会回退到“按 activeHero + tactic 权威事实重建”的安全摘要，而不再误把上一位武将的说明套给当前武将。
34. `AI context focus` 当前已补 `contextMemorySummary.relatedId` 权威字段，面板不再只知道 `focus_troop / focus_city / focus_alliance` 这种类别，还能显示当前绑定的对象 id。
35. `AI agenda` 当前已补 `targetTileId / targetUnitIds / executionRequestId / recommendedFollowups` 权威字段；面板不再只显示摘要，还能看到目标地块、执行请求号与建议后续动作。
36. `previewDomainAgenda` 当前已补正式合同字段：`DomainAgendaCandidate.actionId` 与 `DomainAgenda.options[]`。AI 面板不再需要按中文标签反推动作 id。
37. `previewDomainAgendaAction(...)` 当前会在后端出口统一正规化 agenda：即使上游 domain bus 未显式给全字段，也会补齐 `options[]` 后再返回前端。
38. `directivePreview` 当前已开始从 faction 级单例向按 hero 归属推进：`generalState.directivePreviewByHeroId` 已落地，`setGeneralTactic` 和后端 `setGeneralTacticAction` 会同步写单例预览和 hero 索引预览。
39. `GeneralPresenter` 当前优先读取 `directivePreviewByHeroId[activeHeroId]`；只有当前 hero 没有专属权威说明链时，才回退到旧的单例预览或安全摘要。
41. `main.gd` 当前已把 overlay post-navigation 再收成 `resolve spec -> apply spec` 两段 helper，不再直接在动作收口点里手写 page/panel/refresh 分支。
42. `main.gd` 当前又把 `interior / troop` 的 runtime-state、state-feedback、extra-action 参数展开继续下沉到了 `overlay_runtime_helper.gd`，主编排器不再自己维护模板展开与大段 troop/interior 专属 glue。
43. `previewDomainAgenda` 当前已继续扩成更丰富的稳定动作/目标合同：`options[]` 内已包含 `actionId / intent / label / summary / priority / targetTileId / targetUnitIds / supportingAiPlayerIds / evidenceRefs / supportCount / recommendedFollowups`。
43. `directivePreviewByHeroId` 当前已不再只是最小索引占位；`setGeneralActiveHero` 会把单例 `directivePreview` 收缩成“当前激活武将的镜像”，`GeneralPresenter` 则优先读取 hero 级权威说明链。
44. `InternalAffairsPresenter` 与 `TroopPanelPresenter` 当前已改成显式返回 `build_overlay_payload()`；`snapshot + runtime_state_patch` 会一起进入 overlay helper，主编排器不再手工从 snapshot 中抽 `city_state_id / activeTroopId / activeFacilityId`。
45. `previewDomainAgenda` 当前已继续补稳 `options[]` 里的目标与支援信息；AI 面板会直接展示权威目标地块与支援票数，不再只拿动作名和摘要做弱推断。
46. `directivePreview` 当前已补 `source + updatedTick`，`setGeneralTactic` 与 `setGeneralTacticAction` 会优先沿 hero 级说明链写回，再把 faction 单例保留为过渡镜像，后续可继续淡化单例依赖。
47. `main.gd` 当前又把 `interior / troop` 的 overlay spec 装配继续往 `overlay_runtime_helper.gd` 下沉；`build_interior_overlay_spec(...) / build_troop_overlay_spec(...) / build_overlay_action_apply_payload(...) / build_close_runtime_patch(...) / build_shell_troop_runtime_patch(...)` 已落地，主编排器不再手写这几段固定 glue。
48. `directivePreviewByHeroId` 当前已补长期来源字段：`sourceActionId + updatedWorldVersion`。`setGeneralTactic` 现在会先把权威说明写进 `directivePreviewByHeroId[heroId]`，再把 faction 单例 `directivePreview` 收成 active hero 镜像，`GeneralPresenter` 也已开始直接显示来源动作与世界版本。
49. `previewDomainAgenda` 当前已从并行数组合同继续推进到显式 `options[]` 对象合同。`DomainCommBus -> WorldService.previewDomainAgendaAction -> Godot adapter -> AIPanelPresenter` 全链路都已开始优先消费 `options[actionId / intent / label / summary / priority / targetTileId / targetUnitIds / supportingAiPlayerIds / evidenceRefs / supportCount / recommendedFollowups]`，旧的 `optionActionIds / optionLabels / optionTargetTileIds / optionSupportCounts` 只作历史兜底，不再作为主路径。
50. `overlay_runtime_helper.gd` 当前已继续承接 `interior / troop` 的活动面板刷新与动作后续组合：`build_active_overlay_refresh_payload(...)` 与 `build_overlay_action_followup_payload(...)` 已落地，`main.gd` 现在更接近“执行 world refresh + 应用 helper 结果”的薄路由。
51. `directivePreview` 当前已新增 `directivePreviewHeroId` 作为显式单例镜像归属；`setGeneralActiveHero / setGeneralTactic / setGeneralTacticAction` 与 `GeneralPresenter` 都按这个字段收口，避免旧单例说明链串到错误武将。
52. `previewDomainAgenda.options[]` 当前已补稳定目标粒度：除了 `actionId / intent / label / summary / priority / supportCount`，还会权威回写 `targetTileId / targetUnitIds / supportingAiPlayerIds / evidenceRefs / recommendedFollowups`；最小权威验证已确认 `preview_option_target_units=u1` 与 AI 写回链一致。
53. `overlay_runtime_helper.gd` 当前继续把 `interior / troop` 的 open / refresh / follow-up runtime-state 读取收进 helper 内部态接口：`build_open_overlay_runtime_patch(...) / prepare_snapshot_payload_from_state(...) / build_active_overlay_refresh_payload_from_state(...) / run_overlay_action_followup_from_state(...)` 已落地，`main.gd` 现在更接近纯薄路由。
54. `directivePreview` 当前已继续收缩为轻量兼容镜像：后端写回会优先落 `directivePreviewByHeroId[heroId]`，singleton 只保留当前激活武将的镜像摘要；`GeneralPresenter` 现在会更明确先走 hero 索引，再在必要时回退到兼容镜像。
55. `main.gd` 当前已把 `interior / troop` 的主动刷新继续压成 helper 生成的 `apply payload`；主编排器不再手工拆 `refresh_payload`，而是统一复用 `overlay_runtime_helper.gd` 的刷新结果。
56. 已新增 [USB_MIGRATION_AUDIT_2026_04_17.md](USB_MIGRATION_AUDIT_2026_04_17.md)，把 `5GB U 盘` 约束下的迁移边界收成正式清单：区分了 `必须迁移 / 推荐迁移 / 条件迁移 / 默认不要迁移`，并给出了 `方案 A / 方案 B / 方案 C` 三种搬运口径。
57. `USB_MIGRATION_AUDIT_2026_04_17.md` 当前已继续吸收并行审计结果：已补 `.obsidian` 的安全边界、`4 个顶层 mp4 + 关键帧目录 + 正式截图证据` 的迁移价值、`tmp/docs_index_for_timeline_*` 一类派生索引默认不迁移，以及“若后续机器不保留 `C:\\Users\\26739\\Desktop\\8989` 同路径，主线文档中的绝对证据链接会失效”的路径风险。
58. 已新增 [USB_MIGRATION_EXECUTION_2026_04_17.md](USB_MIGRATION_EXECUTION_2026_04_17.md) 与正式脚本 [scripts/prepare_usb_migration_package.ps1](../scripts/prepare_usb_migration_package.ps1)，当前已把 `E:` U 盘下的 `minimal / recommended` 迁移执行口径写成可复用入口，并明确了“新机器即使桌面文件夹仍叫 `8989`，只要 Windows 用户名不同，绝对证据路径仍会变化”的风险边界。
59. 已新增 [USB_MIGRATION_PATH_REWRITE_2026_04_17.md](USB_MIGRATION_PATH_REWRITE_2026_04_17.md)，专门留给迁移后的后续 AI：如果新机器仓库根路径不再是 `C:\\Users\\26739\\Desktop\\8989`，先按文档说明只重写 Markdown 证据绝对路径，不要全仓盲改历史说明或外部工具路径。
60. 已新增 [Godot AI 管理页横屏移动端验收记录（2026-04-28）](GODOT_AI_PANEL_MOBILE_LANDSCAPE_ACCEPTANCE_2026_04_28.md)：AI 管理页已完成 `AI玩家 / 聊天记忆 / 打开聊天频道` 主线收口，并通过 `npm run godot:mainline:visual-smoke -- --click-action ai_panel_open_chat_channel` 在 `1600x900` 与 `2388x1080` 验证点击后回到主聊天频道。

### 14.5 当前正式验证口径

当前主线继续只认正式入口，不认 preview 临时入口：

1. `npm run godot:headless:smoke`
2. `npm run godot:headless:smoke -- --scene res://scenes/ui/alliance_panel.tscn`
3. `npm run godot:headless:smoke -- --scene res://scenes/ui/troop_panel.tscn`
4. `npm run godot:headless:smoke -- --scene res://scenes/ui/interior_panel.tscn`
5. `npm run godot:headless:smoke -- --scene res://scenes/ui/recruit_panel.tscn`
6. `npm run godot:headless:smoke -- --scene res://scenes/ui/general_panel.tscn`
7. `npm run godot:headless:smoke -- --scene res://scenes/ui/ai_panel.tscn`
8. `npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --click-action ai_panel_open_chat_channel --window-width 1600 --window-height 900`
9. `npm run godot:mainline:visual-smoke -- --display-mode world --world-action open_hub_panel --panel-id ai_hub --click-action ai_panel_open_chat_channel --window-width 2388 --window-height 1080`
10. `npm run build`
11. `npm run test:world:mutation-lock`
12. `obsidian backlinks path='docs/NATIVE_SLG_MAINLINE_INDEX.md' total`
13. `obsidian links path='docs/NATIVE_SLG_MAINLINE_INDEX.md' total`
14. `obsidian backlinks path='docs/AGENTS_EXECUTION_CURRENT_2026_04.md' total`
15. `obsidian links path='docs/AGENTS_EXECUTION_CURRENT_2026_04.md' total`
16. `obsidian backlinks path='CODEX.md' total`
17. `obsidian links path='CODEX.md' total`
18. `obsidian links path='README.md' total`
19. `obsidian links path='godot-client/README.md' total`
20. `npx tsx -` 直连 `previewDomainAgendaAction(...) + setGeneralTacticAction(...) + queueAiAgendaActionAction(...)` 的最小权威验证

#### 14.5.1 主城节点上下文 visual smoke 封板（2026-04-29）

本节只记录 `世界地图主城节点 -> MainCityHubOverlay -> 面板 -> 返回地图` 的 UI smoke 证据；不代表真实建筑升级 authority、资源扣减、战斗或 AI 后端规则已经在这条链中执行。

本轮封板回归：

1. `npm run godot:headless:smoke`：通过，无 screenshot evidenceDir。
2. `npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120`：通过，evidenceDir=`C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_112255`。
3. `npm run godot:mainline:visual-smoke -- --server-script start --timeout-sec 90 --backend-timeout-sec 120 --click-action world_click_main_city_node`：通过，evidenceDir=`C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_112314`。

已固定保留的 action id 与字段要求：

| action id | 链路 | evidenceDir | 必须保留的关键字段 |
| --- | --- | --- | --- |
| `world_click_main_city_node` | 地图主城节点点击 -> `MainCityHubOverlay` 展开 | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_112314` | `clickActionResult.mapNodeClickContext`；`clickActionResult.mainCityHub.lastMapNodeClick`；`clickActionResult.clicked=true` |
| `world_click_main_city_node_interior` | 地图主城节点点击 -> hub -> `InteriorPanel` -> `BuildingTreeView / BuildUpgradeSheet` 可见 | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_010007` | `mapNodeClickContext`；`interiorPanel.hasBuildingTree=true`；`interiorPanel.hasUpgradeSheet=true` |
| `world_click_main_city_node_building_upgrade` | 地图主城节点点击 -> hub -> `InteriorPanel` -> 选择建筑 -> 升级按钮模板反馈 | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_030229` | `buildingChain.templateOnly=true`；`buildingChain.authorityTriggered=false`；`buildingChain.templateFeedbackVisible=true` |
| `world_click_main_city_node_troop` | 地图主城节点点击 -> hub -> `TroopPanel` | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_012354` | `clickActionResult.mapNodeClickContext`；`troopPanel.hasTroopPanel=true` |
| `world_click_main_city_node_interior_close` | 地图主城节点点击 -> hub -> `InteriorPanel` -> CloseButton -> 返回地图 | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_015734` | `returnedToMap=true`；`mapVisible=true`；`activePanelId=""` |
| `world_click_main_city_node_troop_close` | 地图主城节点点击 -> hub -> `TroopPanel` -> CloseButton -> 返回地图 | `C:\Users\26739\Desktop\8989\tmp\screenshots\mainline_visual_smoke_20260429_033855` | `returnedToMap=true`；`mapVisible=true`；`activePanelId=""` |

边界：这些 smoke 依赖 `MapGrid.player_home_city_node_clicked(context)` 已能在有 `homeTileId` 与 home city overlay entry 的情况下发出；若上游缺字段或缺 overlay entry，UI 侧不额外推断主城。

### 14.6 当前服务器容量警戒

1. 当前 `壳 + 子页 + 共享状态` 的 UI 收口，只能说明前端结构在往正式产品态靠，不等于后端已经完成大服/高并发验证。
2. 现在的 authoritative 主干仍然是单进程 `WorldService` + `world mutation lock`；`SessionManager`、`WebSocket` 广播、`tmp/*.json` 持久化都还是单机实现事实。
3. 没有正式压测、限流/配额、广播预算、AI tick 预算之前，后续 AI 不得把“前端架构做完”误写成“服务器可以放心扛几千真人 + AI”。

### 14.7 当前下一步

1. 继续把 `main.gd` 里最后一层 `interior / troop` world-refresh 与 runtime-state 协调再往统一 helper 侧收，目标继续逼近“纯薄路由”。
2. 继续把 `directivePreviewByHeroId` 从“hero 级权威索引 + faction 单例镜像”推进到更稳的长期结构，逐步让 `directivePreview` 只保留兼容镜像职责。
3. 继续把 `previewDomainAgenda` 的 `options[]` 合同扩成更丰富的稳定动作/目标结构，避免后续目标选择再次退回前端并行数组推断。
4. 在不回 preview 线的前提下，把 `招募 / 武将 / AI` 从“最小真实动作链”继续推进到更深的正式域动作：
   - `招募`：卡池选择、单抽/多抽、结果回写
   - `武将`：roster、编组、战法
   - `AI`：托管、议程、上下文
5. `AI` 下一轮优先继续把更多 agenda 子动作并进 `queueAiAgendaAction` 家族，同时把 `options[]` 贯彻到更多权威读链与场景，不回退到前端标签推断。
6. `武将` 下一轮优先继续把 `战法` 从“正式写动作 + hero 级权威说明链”推进到更完整的副作用链与后续执行反馈。
7. Obsidian CLI 已恢复，下一轮优先继续加强 `README / godot-client/README / AI_QUICK_NAV / 主计划文档` 之间的静态回链和入口优先级。
