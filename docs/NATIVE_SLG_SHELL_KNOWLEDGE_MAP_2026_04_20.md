# NATIVE_SLG_SHELL_KNOWLEDGE_MAP_2026_04_20

## 0. 用途

这份文档不是新的设计提案，而是把 `native_slg_shell` 这条线已经做过的事情，整理成可复用的知识图谱式索引。  
目标只有两个：

- 让新窗口/新 AI 直接继承当前状态，避免重做
- 把“哪些已经资源化、哪些必须留骨架、哪些还能继续替换”固定下来

机器可读索引：

- `C:\Users\26739\Desktop\8989\docs\NATIVE_SLG_SHELL_KNOWLEDGE_MAP_2026_04_20.json`
- `C:\Users\26739\Desktop\8989\docs\NATIVE_SLG_SHELL_AI_QUICK_ENTRY_2026_04_20.json`

---

## 1. 必读顺序

1. `C:\Users\26739\Desktop\8989\AGENTS.md`
2. `C:\Users\26739\Desktop\8989\docs\AGENTS_EXECUTION_CURRENT_2026_04.md`
3. `C:\Users\26739\Desktop\8989\CODEX.md`
4. `C:\Users\26739\Desktop\8989\docs\GODOT_NATIVE_SHELL_LAYOUT_ALIGNMENT_2026_04_18.md`
5. `C:\Users\26739\Desktop\8989\docs\NATIVE_SLG_SHELL_HANDOFF_2026_04_20.md`
6. 本文档
7. `C:\Users\26739\Desktop\8989\docs\NATIVE_SLG_SHELL_KNOWLEDGE_MAP_2026_04_20.json`
8. `C:\Users\26739\Desktop\8989\docs\NATIVE_SLG_SHELL_AI_QUICK_ENTRY_2026_04_20.json`

---

## 2. 当前主题边界

只允许围绕：

- `native_slg_shell`
- 主壳文案单源
- runtime HUD 已从主壳剥离后的继续收口
- 主壳与本地视频/截图、主流 SLG UI 的层级/比例/密度对齐

不要扩到：

- `server/src/**`
- `shared/**`
- AI 玩家系统
- 编辑器插件
- Web 原型
- 其他 UI 域

---

## 3. 已完成沉淀

### 3.1 HUD 剥离

- runtime/dev HUD 已不在 `NativeShell`
- HUD 当前在 `main.tscn` 的独立 `HoverLayer`

这意味着：

- `native_slg_shell` 只负责产品主壳
- runtime 观测层不再与主壳视觉绑死

### 3.2 主壳文案单源

当前主壳动态文案的主来源已经稳定为：

- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\native_slg_shell.gd`
- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\presenters\native_shell_presenter.gd`

`.tscn` 不再承担动态默认文案双持。

### 3.3 LeftRail 已资源化密度

LeftRail 的密度、字体层级、token 行高度已经抽成资源：

- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\native_shell_left_rail_density_profile.gd`

它当前承接：

- 外边距
- 区块间距
- task header 间距
- troop card list 间距
- quick link 间距
- token 字号和行高

### 3.4 Chrome 样式已资源化

按钮和 panel 的 fallback chrome 已经不是散在主壳脚本里，而是走这条链：

1. `native_shell_chrome_style_profile.gd`
2. `native_shell_chrome_profile_catalog.gd`
3. `native_shell_chrome_profile_fallback.tres`
4. `native_slg_shell.gd` 消费入口

已进入资源槽的视觉域包括：

- city action
- left rail quick link
- troop slot
- utility button
- under construction
- center stage
- default button fallback
- Backdrop
- RightContext
- quick link flat/非 flat 表现

### 3.5 主壳骨架几何已资源化

主壳 offsets / margins / separations / 关键按钮 min size 已进入：

- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\native_shell_layout_profile.gd`

已覆盖：

- `TopStrip`
- `LeftRail`
- `RightContext`
- `CenterStage`
- `BottomNav`
- `TopMargin / StageMargin / BottomMargin`
- `TopRow / Actions / PremiumCurrencyRow`
- `RightColumn`
- `StageColumn / CityEntryGrid`
- `BottomRow / MainNav / UtilityRow / NavButtons`
- 关键按钮的 `custom_minimum_size`

### 3.6 结构字号已资源化

主壳结构文本字号已经进入：

- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\native_shell_typography_profile.gd`

当前承接：

- TopStrip badge/资源条/货币条字号
- RightContext title/body 字号
- CenterStage 的 badge/title/body/focus/entry/status/hint 字号
- UtilityRow / MainNav / WorldEntryHint 字号

### 3.7 主壳占位 copy 已资源化

主壳当前默认 copy 已经进入：

- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\native_shell_copy_profile.gd`

当前承接：

- city action / utility / under construction 的占位 copy
- `主城/大地图` 模式标题、提示、入口条默认文案
- 主城任务条/队列条/五队概览的默认 fallback 文案
- 主壳内联 tooltip/status 模板

### 3.8 图标绑定已资源化

图标纹理和 `h_separation` 已经进入：

- `C:\Users\26739\Desktop\8989\godot-client\scripts\ui\native_shell_icon_profile.gd`

主壳不再直接识别具体 SVG 资产名。

### 3.9 RightContext 已 slot 化

`RightContext` 不再只是固定栏里的 `title/body` 两行文本，  
现在已经具备：

- `presenter -> main.gd -> native_slg_shell` 的 payload 接线
- `ContextSlotList` 槽位容器
- slot 级 chrome / 字号 / density 资源槽
- 默认 fallback slot 数据

当前骨架仍固定，但内容块已经可以按 slot 替换。

### 3.10 主壳场景 fallback 已大幅清空

`native_slg_shell.tscn` 现在主要承担：

- 节点树
- anchor/preset
- 零文本默认骨架

它已经不再承担：

- 主壳 offsets
- 主壳 margin/separation
- 主导航/入口/utility/under construction 的 min size
- LeftRail / RightContext 的密度默认值
- 主壳结构字号
- Backdrop 底色
- 空文本占位

---

## 4. 知识图谱式索引

下面这部分不是数据库格式，但已经可以作为后续 AI 的“图谱入口”。

### 4.1 节点

#### Node: `native_slg_shell.gd`

角色：

- 主壳骨架 orchestrator
- mode/focus 状态机
- resource slot 消费层
- runtime payload -> node 映射层

不要把它当：

- 最终 UI 资产存放点
- 大量 fallback 视觉数据仓库

#### Node: `native_shell_presenter.gd`

角色：

- 主壳文案单源
- task / queue / focus / troop summary 的 token 压缩层

不要把它当：

- 场景几何层
- 视觉样式层

#### Node: `native_shell_chrome_profile_catalog.gd`

角色：

- chrome resource slot router
- style / icon / layout / density 的统一解析入口

#### Node: `native_shell_chrome_style_profile.gd`

角色：

- 单体 chrome style 数据模型

#### Node: `native_shell_left_rail_density_profile.gd`

角色：

- LeftRail token/队列/卡列密度模型

#### Node: `native_shell_layout_profile.gd`

角色：

- 主壳骨架几何和 density 模型

#### Node: `native_shell_icon_profile.gd`

角色：

- 图标纹理与图标间距模型

#### Node: `native_shell_chrome_profile_fallback.tres`

角色：

- 当前 fallback 数据总装资源
- 未来真实 UI 资产接入前的默认 profile 实例

### 4.2 关系

- `native_slg_shell.gd -> consumes -> native_shell_chrome_profile_catalog.gd`
- `native_shell_chrome_profile_catalog.gd -> resolves -> native_shell_chrome_style_profile.gd`
- `native_shell_chrome_profile_catalog.gd -> resolves -> native_shell_left_rail_density_profile.gd`
- `native_shell_chrome_profile_catalog.gd -> resolves -> native_shell_layout_profile.gd`
- `native_shell_chrome_profile_catalog.gd -> resolves -> native_shell_icon_profile.gd`
- `native_shell_chrome_profile_catalog.gd -> data_from -> native_shell_chrome_profile_fallback.tres`
- `native_shell_presenter.gd -> feeds -> native_slg_shell.gd`
- `main.gd -> injects_payload_into -> native_slg_shell.gd`

### 4.3 关键事实

- `RightContext` 当前是固定骨架内容栏，不是资产槽位面板
- `LeftRail` 的密度已经资源化，但它的结构顺序仍由主壳骨架控制
- `city/world` 模式切换属于骨架状态机，不属于可替换资产层
- `TroopSlot` 的 archetype 规则属于骨架业务语义，不属于视觉皮肤

---

## 5. 还必须保留在骨架层的东西

### 5.1 场景树拓扑

必须保留：

- `TopStrip`
- `LeftRail`
- `RightContext`
- `CenterStage`
- `BottomNav`
- 这些节点之间的锚点关系与容器父子关系

原因：

- 这是主壳布局骨架本身
- 真实 UI 资产只能挂接到这些 slot 上，不能取代 slot 拓扑

### 5.2 信号与事件路由

必须保留：

- `mode_toggle_requested`
- `shell_action_requested`
- `troop_slot_requested`
- `interior_tab_requested`

原因：

- 这是主壳对 runtime/app 的合同层

### 5.3 模式机与显示编排

必须保留：

- `city/world` 模式机
- 当前焦点入口
- 哪些区块在什么模式下显示/隐藏

原因：

- 这是产品交互结构，不是换皮内容

### 5.4 语义槽位规则

必须保留：

- city action 的 `surface_role`
- `TroopSlot` 的 `primary/mobile/reserve`
- LeftRail 的区块顺序

原因：

- 这些决定的是“哪一类信息占哪一个槽位”

### 5.5 payload 适配层

必须保留：

- presenter payload 到 shell node 的映射
- token 压缩后文本到控件的注入
- 货币摘要解析

原因：

- 这是 runtime 数据和主壳结构之间的适配层

---

## 6. 还可以继续替换/继续资源化的东西

截至当前轮，`native_slg_shell` 这一条线里前面列出的可替换项已经清到 0。  
后续如果再继续推进，重点会从“清占位”转向“接真实 UI 资产”。

---

## 7. 如何避免后续 AI 重做

后续 AI 进入这条线时，先做这几个判断：

1. 如果问题是样式/边距/尺寸，不要先改 `.tscn`，先看：
   - `native_shell_layout_profile.gd`
   - `native_shell_chrome_profile_fallback.tres`
2. 如果问题是 LeftRail 密度，不要先改 `native_slg_shell.tscn`，先看：
   - `native_shell_left_rail_density_profile.gd`
3. 如果问题是按钮皮肤或 fallback 色，不要先往 `native_slg_shell.gd` 写死颜色，先看：
   - `native_shell_chrome_style_profile.gd`
   - `native_shell_chrome_profile_catalog.gd`
4. 如果问题是图标或图标间距，不要先 `preload` 新纹理，先看：
   - `native_shell_icon_profile.gd`
5. 如果问题是 task/queue/focus/troop token，不要先改 scene 文案，先看：
   - `native_shell_presenter.gd`

可以把这五条理解成“去哪里改”的快速索引。

---

## 8. 给新 AI 的一句话结论

`native_slg_shell` 这条线已经从“代码里画一层假皮”推进到“骨架 + resource slot + fallback resource”结构。  
以后不要再把主壳样式直接写回脚本或 scene；先判断它属于：

- 骨架拓扑
- 语义槽位
- layout slot
- density slot
- chrome slot
- icon slot
- 文案单源

再改。
