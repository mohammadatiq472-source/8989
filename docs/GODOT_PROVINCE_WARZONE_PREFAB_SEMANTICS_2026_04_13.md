# Godot Province / Warzone Prefab 语义映射

- 文档日期：2026-04-13
- 适用范围：`province_layer` / `warzone_layer` / `nation_layer` 的后续组件复用与替换
- 目标：把 `tmp/third_party/slgclient/assets/prefab/map` 与 `tmp/third_party/slgclient/assets/scripts/map/ui` 的语义，稳定映射到 Godot 版宏观地图组件库，供后续 AI 直接复用

## 1. 本次审计读取范围

已读取并作为本页依据的文档与源码：

- `C:/Users/Buffoon Queer/Desktop/8989/AGENTS.md`
- `C:/Users/Buffoon Queer/Desktop/8989/docs/AGENTS_EXECUTION_CURRENT_2026_04.md`
- `C:/Users/Buffoon Queer/Desktop/8989/docs/UI_MAP_INTEGRATED_WIREFRAME_V1.md`
- `C:/Users/Buffoon Queer/Desktop/8989/docs/GODOT_MAP_MACRO_COMPONENTS_2026_04_13.md`
- `C:/Users/Buffoon Queer/Desktop/8989/godot-client/README.md`
- `C:/Users/Buffoon Queer/Desktop/8989/tmp/third_party/slgclient/assets/prefab/map/MapClickUI.prefab`
- `C:/Users/Buffoon Queer/Desktop/8989/tmp/third_party/slgclient/assets/prefab/map/RoleCity.prefab`
- `C:/Users/Buffoon Queer/Desktop/8989/tmp/third_party/slgclient/assets/prefab/map/SysCity.prefab`
- `C:/Users/Buffoon Queer/Desktop/8989/tmp/third_party/slgclient/assets/scripts/map/ui/MapUILogic.ts`
- `C:/Users/Buffoon Queer/Desktop/8989/tmp/third_party/slgclient/assets/scripts/map/ui/RightCityItemLogic.ts`

## 2. 结论先行

1. `MapClickUI.prefab` 是地图主界面壳与地块/据点上下文操作板的复合 prefab，不是单一按钮组件。
2. `RoleCity.prefab` 更接近“角色城池卡”或“己方城池展示卡”，适合作为 `province_layer` 的州层焦点卡骨架。
3. `SysCity.prefab` 更接近“系统城池 / 通用城池展示卡”，适合作为 `warzone_layer` 的摘要卡、节点卡或路线节点卡骨架。
4. `MapUILogic.ts` 说明原项目的地图 UI 核心是“点击节点 -> 打开上下文面板 -> 必要时滚动地图 -> 再打开子面板”。
5. `RightCityItemLogic.ts` 说明右侧列表项的最小语义是“名称 + 坐标 + 点击回跳地图中心点”。
6. 后续 Godot 映射的优先级应当是“导航字段 > 结构字段 > 状态字段 > 装饰字段”，避免先做皮肤后补语义。

## 3. prefab 节点语义

### 3.1 `MapClickUI.prefab`

根节点：

- `MapClickUI`
- 根尺寸：`256 x 128`
- 组件：自定义行为 + `UIOpacity` + `UITransform`

子节点语义摘要：

| 节点名 | 语义判断 | 建议对应到 Godot |
|---|---|---|
| `bgSelect` | 选中高亮底板 | 选中态底图 / 高亮框 |
| `bg` | 通用背景底板 | 主面板背景 |
| `bgMian` | 主信息条背景，疑似 `main` 拼写 | 标题/主信息行背景 |
| `bgUnion` | 联盟/同盟信息条背景 | 同盟行 / 势力行 |
| `bgPos` | 坐标/位置行背景 | 坐标读板行 |
| `labelMian` | 主信息标题标签 | 标题标签 |
| `labelName` | 名称标签 | 名称标签 |
| `labelLunxian` | 状态/轮选/轮询类标签，含义需保守处理 | 状态/层级/轮次标签 |
| `labelUnion` | 同盟/归属标签 | 归属标签 |
| `labelPos` | 坐标标签 | 坐标标签 |
| `durableNode` | 耐久区容器 | 耐久/进度容器 |
| `New ProgressBar` | 耐久进度条 | 耐久条 |
| `labelDurable` | 耐久数值文本 | 耐久数字 |
| `btnList` | 纵向操作按钮列表 | 动作矩阵 |
| `btnTransfer` | 调动/迁移 | 转移/调动 |
| `btnBuild` | 建设 | 建设 |
| `btnMove` | 行军/移动 | 行军/移动 |
| `btnOccupy` | 占领 | 占领 |
| `btnGiveUp` | 放弃 | 放弃 |
| `btnReclaim` | 收回/重夺 | 收回 |
| `btnTagAdd` | 添加标记 | 添加标签/收藏 |
| `btnTagRemove` | 移除标记 | 移除标签/收藏 |
| `leftNode` | 左下统计容器 | 资源/驻军/收益概览 |
| `bg2` | 统计底板 | 统计底纹 |
| `labelYield` | 资源产出读板 | 资源收益 |
| `labelSoldierCnt` | 兵力/驻军数值 | 驻军/兵力 |
| `btnEnter` | 进入/确认入口 | 进入详情 / 打开下一级 |

语义判断：

1. 这个 prefab 不是简单的弹框，而是“地块/城池上下文操作台”。
2. 它同时包含信息展示、耐久展示、动作按钮、资源/驻军概览和进入下一级的入口。
3. 在 Godot 宏组件里，最适合拆成 `summary header + status rail + action grid + stats rail + entry button` 五段。

### 3.2 `RoleCity.prefab`

根节点：

- `RoleCity`
- 根尺寸：`600 x 300`

节点语义摘要：

| 节点名 | 语义判断 | 建议对应到 Godot |
|---|---|---|
| `up_sprite` | 上层装饰/高亮底图 | 州层焦点底图 |
| `down_sprite` | 下层装饰/阴影底图 | 州层阴影底图 |
| `sprite` | 主图标或主体轮廓 | 城池主图 |
| `labelName` | 城池名称 | 州府/城池名 |
| `mian` | 主 icon / 主入口标记，疑似 `main` 拼写 | 主徽记 / 状态 icon |
| `New Label` | icon 内嵌文字 | 角标 / 等级 / 简记 |

语义判断：

1. `RoleCity` 更像“主城/己方城池”的展示卡。
2. 它的视觉结构偏“主图 + 名称 + 徽记”，适合州层焦点板。
3. 这类 prefab 不适合直接当战区摘要卡，更适合做 `province focus` 的主视觉骨架。

### 3.3 `SysCity.prefab`

根节点：

- `SysCity`
- 根尺寸：`800 x 400`

节点语义摘要：

| 节点名 | 语义判断 | 建议对应到 Godot |
|---|---|---|
| `down_sprite` | 下层底图 | 战区/据点底图 |
| `up_sprite` | 上层底图 | 高亮/状态底图 |
| `cityicon` | 城池主体图层 | 城池/据点主图 |
| `mian` | 主 icon / 主标记，疑似 `main` 拼写 | 主状态标记 |
| `New Label` | 内嵌文字 | 等级/标签/角标 |

语义判断：

1. `SysCity` 更偏“系统城池 / 通用据点”。
2. 相比 `RoleCity`，它更像公共节点或战区节点的展示模板。
3. 适合作为 `warzone summary` 的节点卡、路线卡、关口卡骨架。

## 4. 脚本语义

### 4.1 `MapUILogic.ts`

这个脚本体现了原项目地图 UI 的核心编排方式：

1. 通过事件总线打开不同上下文面板。
2. 通过 `instantiate(prefab)` 懒加载面板。
3. 每次打开后都调用 `setSiblingIndex(this.topLayer())`，保证层级始终在最上方。
4. 城市/关口类面板在打开时会强制触发 `scrollToMap(x, y)`，把视角对准目标。

与省层 / 战区层直接相关的方法：

| 方法 | 原始语义 | 对 Godot 的映射建议 |
|---|---|---|
| `openCityAbout(data)` | 打开城市详情，并滚动到城市坐标 | `province focus` 的进入方法 |
| `openFortressAbout(data)` | 打开关口/要塞详情 | `warzone summary` 的进入方法 |
| `openFacility(data)` | 打开设施列表 | 州/战区的次级功能面板 |
| `openArmySetting(cityId, order)` | 打开军队编组/配置 | 州层部队编组入口 |
| `openGeneral(data)` | 打开武将列表 | 武将/队伍选择入口 |
| `openGeneralDes(cfgData, curData)` | 打开武将详情 | 武将详情面板 |
| `openGeneralChoose(data)` | 武将选择 | 选择器入口 |
| `onOpenArmySelectUI(cmd, x, y)` | 军队选择并定位到地图坐标 | 战区行动选择入口 |
| `openDrawR(data)` | 抽卡结果 | 非地图主线，可后置 |
| `onCollection(msg)` | 征收反馈 | 资源类副反馈 |
| `beforeScrollToMap(x, y, oldx, oldy)` | 地图大范围移动前播放云动画 | 视角迁移反馈 |

对省层 / 战区层最重要的不是“所有功能都搬过来”，而是：

1. 保留“点击节点 -> 打开上下文面板 -> 必要时滚到目标点”的顺序。
2. 保留“顶层叠加，后打开面板永远在最上层”的层级策略。
3. 保留“面板打开后再反推地图定位”的交互逻辑。

### 4.2 `RightCityItemLogic.ts`

这个脚本提供了右侧列表项的最小语义：

1. 文本区：`labelInfo` = 名称。
2. 坐标区：`labelPos` = `(x, y)`。
3. 点击背景：播放点击音效并发送 `scrollToMap(x, y)`。
4. 赋值接口：`setArmyData(data)`。

这说明右侧列表项在原项目里不是纯装饰卡片，而是：

1. 一个可点击的地图定位锚点。
2. 一个最小摘要单元。
3. 一个可以驱动地图跳转的语义入口。

## 5. 对 province focus / warzone summary 的组件映射

### 5.1 `province focus` 推荐映射

建议把 `province focus` 看成 `RoleCity.prefab + openCityAbout(data)` 的 Godot 化结果。

推荐组件拆分：

| Godot 组件 | 对应语义 | 主要来源 |
|---|---|---|
| `ProvinceFocusHeader` | 州名、州府、阵营、状态徽记 | `RoleCity.prefab` |
| `ProvinceFocusHeroCard` | 主城主视觉、主 icon、等级/角标 | `RoleCity.prefab` |
| `ProvinceFocusRouteRail` | 坐标、路线、关口、前往入口 | `MapUILogic.ts` / `RightCityItemLogic.ts` |
| `ProvinceFocusStatsRail` | 耐久、兵力、资源、产出 | `MapClickUI.prefab` |
| `ProvinceFocusActionDock` | 进入、调动、建设、标记 | `MapClickUI.prefab` |

推荐入口字段：

1. `name`
2. `cityName`
3. `provinceName`
4. `x`, `y`
5. `ownerName`
6. `factionName`
7. `durability`
8. `garrison`
9. `yield`
10. `entryStoryId`
11. `entryReason`
12. `routeHint`

优先级：

1. 先做 `name / x / y / entryStoryId`，保证可跳转。
2. 再做 `owner / faction / durability / garrison`，保证可读。
3. 最后做视觉装饰和副信息，避免先画皮后补语义。

### 5.2 `warzone summary` 推荐映射

建议把 `warzone summary` 看成 `SysCity.prefab + MapClickUI.prefab + openFortressAbout(data)` 的 Godot 化结果。

推荐组件拆分：

| Godot 组件 | 对应语义 | 主要来源 |
|---|---|---|
| `WarzoneSummaryHeader` | 战区名、州名、关口/节点状态 | `SysCity.prefab` |
| `WarzoneSummaryNodeCard` | 城池/据点节点卡 | `SysCity.prefab` |
| `WarzoneSummaryPressureRail` | 压强、威胁、路线阻塞 | `MapClickUI.prefab` |
| `WarzoneSummaryActionRail` | 攻打、驻守、侦察、放弃、标记 | `MapClickUI.prefab` |
| `WarzoneSummaryJumpRail` | 点击后滚到地图目标点 | `RightCityItemLogic.ts` |

推荐入口字段：

1. `title`
2. `nodeName`
3. `zoneName`
4. `x`, `y`
5. `status`
6. `pressure`
7. `durability`
8. `ownerName`
9. `entryStoryId`
10. `entryReason`
11. `actionList`
12. `routeTarget`

优先级：

1. 先做 `title / nodeName / x / y / entryStoryId`。
2. 再做 `status / pressure / durability / ownerName`。
3. 最后做按钮样式、图标、分割线、装饰底纹。

## 6. 推荐的入口字段规范

为了后续 AI 直接复用，建议所有宏观地图面板都统一使用以下字段分类：

### 6.1 导航字段

- `storyNavigation.targetStoryId`
- `storyNavigation.reason`
- `storyNavigation.requestPayload`
- `navigationContext.sourceStoryId`
- `navigationContext.focusKey`
- `navigationContext.x`
- `navigationContext.y`

### 6.2 结构字段

- `title`
- `name`
- `nodeName`
- `provinceName`
- `zoneName`
- `ownerName`
- `factionName`
- `status`

### 6.3 状态字段

- `durability`
- `garrison`
- `pressure`
- `yield`
- `level`
- `routeHint`

### 6.4 视觉字段

- `iconKey`
- `spriteKey`
- `badgeKey`
- `toneKey`
- `panelSkinKey`

### 6.5 低优先级字段

- `tipText`
- `flavorText`
- `extraDetails`
- `debugLabel`

## 7. 替换优先级

后续替换建议按以下顺序推进：

1. `province focus` 先接 `RoleCity.prefab` 语义，因为它最贴近州层焦点卡。
2. `warzone summary` 先接 `SysCity.prefab` 语义，因为它最贴近战区节点卡和摘要卡。
3. `MapClickUI.prefab` 作为公共上下文操作台，优先提供动作区、耐久区、统计区和进入入口。
4. `MapUILogic.ts` 的“滚动到目标点 + 顶层叠加”策略必须保留，不能被静态卡片设计冲掉。
5. `RightCityItemLogic.ts` 的“名称 + 坐标 + 点击跳转”必须作为所有右侧列表项的最小协议。

## 8. 直接给后续 AI 的使用说明

如果后续 AI 继续做 `province_layer` 或 `warzone_layer`，请先读这份文档，再按下面顺序动手：

1. 先选导航字段，确保有明确的 `entryStoryId` 和 `requestPayload`。
2. 再补结构字段，保证卡片可读。
3. 然后补状态字段，保证卡片有“战略意义”。
4. 最后才做视觉字段和皮肤。
5. 如果要新增组件，优先从 `RoleCity` / `SysCity` / `MapClickUI` 三类语义出发，不要先从纯装饰出发。

## 9. 简短结论

`province` 应该优先吸收 `RoleCity.prefab` 的州层焦点语义；`warzone` 应该优先吸收 `SysCity.prefab` 和 `MapClickUI.prefab` 的战区节点与操作台语义。  
这条映射的核心不是“做更漂亮的卡”，而是把“点击后跳转、滚动定位、顶层打开、上下文操作”变成稳定协议。
