# Recruit / General Formal Pack Preview

日期：2026-04-29

## 范围

这个目录只承载招募页与总武将页正式化的隔离组件推进，不接入主线壳。

当前预览入口：

- `res://scenes/ui/formal_pack/recruit_general_formal_pack_preview.tscn`

参考图只读位置：

- `tmp/reference/recruit_general_ui_formal_pack_2026_04_29/01_general_roster_grid_reference.jpg`
- `tmp/reference/recruit_general_ui_formal_pack_2026_04_29/02_recruit_pack_open_actions_reference.jpg`
- `tmp/reference/recruit_general_ui_formal_pack_2026_04_29/03_recruit_pack_cards_reference.jpg`

## 当前组件目标

1. 招募：首屏只展示卡包、资源条与武将卡容量；点击卡包后快速展开单招、五连、概率小面板入口。
2. 武将：只做武将卡组总览，不做右侧选中摘要；卡片展示头像占位、品质等级、兵种、战力、编组状态、部队编号、真人/AI 归属。
3. 后端：本包不做真实随机、不写库存；真实抽卡权威逻辑记录在 `RECRUIT_BACKEND_HANDOFF.md`，交给后端窗口实现。

## 边界

- 不改 `server/**`。
- 不改 `shared/**`。
- 不改地图、主壳、`main.gd`、`native_slg_shell.gd`。
- 不导入新资产；卡包图与武将头像先用占位结构。
- 不改变现有 `RecruitPresenter` / `GeneralPresenter` 数据契约。

## 验证入口

```powershell
npm run godot:headless:smoke -- --scene res://scenes/ui/formal_pack/recruit_general_formal_pack_preview.tscn
```

## 当前完成状态

已完成：

1. 招募卡包首屏结构：资源条、卡包横排、当前卡包展开区、单招/五连按钮、概率弹层入口。
2. 招募交互反馈：选中卡包亮条、已展开文案、短促切换 tween、选中卡包自动滚动到可见位置。
3. 招募状态位：卡池状态、容量状态、后端链路等待位、幂等请求提示、后端回执状态预览。
4. 武将总览结构：卡组网格、头像占位、品质等级、兵种、战力、编组状态、部队编号、真人/AI 归属。
5. 武将总览响应式：筛选条横向滚动、卡组列数随宽度收缩、长文案单行裁切。
6. 后端 handoff：真实抽卡请求/响应、错误码、错误响应示例、Godot 展示映射。

仍未完成：

1. 未接入正式 `recruit_panel.gd` / `general_panel.gd`。
2. 未接入 `RecruitPresenter` / `GeneralPresenter` 的真实快照数据。
3. 未导入卡包图、武将头像或正式 UI 资产。
4. 未实现后端真实随机、资源扣减、库存写入、保底与回执持久化。

## 主线集成前置条件

集成到正式页面前，需要用户或主窗口明确批准以下事项：

1. 允许把隔离组件结构迁移到 `godot-client/scripts/ui/recruit_panel.gd` 和 `godot-client/scripts/ui/general_panel.gd`。
2. 后端窗口明确真实抽卡 authority 的接口、错误码、库存字段与幂等语义。
3. 资产窗口提供正式卡包图与武将头像，或确认继续用占位结构进入下一阶段。
4. 主线 smoke 增加或复用打开招募、打开武将总览、点击武将进入详情的验证动作。

## 建议下一轮

当前隔离包已经具备第一版可评审形态。后续自动化建议只做小范围验证或文档维护；不要再继续堆功能，除非用户明确要求接入主线或补截图验证。

## 自动化轮次

### 2026-04-29 00:58 CST

- 招募展开区补充卡池状态、容量状态、后端链路等待位，并对未开放卡包禁用单招/五连按钮。
- 武将卡组筛选行补充总数、已编、预备、最高战力摘要；每张卡底部显式保留“详情>”进入单武将详情的动作暗示。

### 2026-04-29 01:08 CST

- 招募卡包行改为 `ScrollContainer` 横向滚动，窄屏时不再强行压缩卡包。
- 武将卡组网格会根据可用宽度自动从 6 列收缩到更少列，并同步调整卡片宽度。

### 2026-04-29 01:18 CST

- 招募卡包选中态补充顶部亮条与“已展开”状态文案，切换时带短促 tween 反馈。
- 概率说明从普通说明块升级为命名弹层 `RecruitProbabilityPopover`，带更高层级、淡入和缩放动画。

### 2026-04-29 01:21 CST

- 武将筛选行改为 `RosterFilterHorizontalScroll`，窄屏时横向滚动而不是挤压字段。
- 武将卡牌中的战力、星级、姓名、兵种、部队、归属、状态改为单行裁切标签，降低长文案撑乱卡牌的风险。

### 2026-04-29 01:53 CST

- 招募展开区新增 `RecruitBackendStatePreview`，预留成功、资源不足、容量不足、重复请求四类后端回执状态位。
- `RECRUIT_BACKEND_HANDOFF.md` 补充错误码建议、错误响应示例和 Godot 展示映射；仍不实现后端、不写库存。

### 2026-04-29 02:25 CST

- 汇总隔离包已完成项、未完成项、主线集成前置条件与建议下一轮。
- 明确当前包已具备第一版可评审形态，后续不应继续堆功能，除非用户批准接主线或补截图验证。
