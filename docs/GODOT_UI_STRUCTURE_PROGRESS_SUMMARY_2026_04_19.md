# Godot UI 结构线推进总结 2026-04-19

## 文档目的

这份文档汇总我接手 `8989` 项目 Godot 原生 SLG 主线 UI 结构线之后，围绕以下目标完成的累计工作：

- 统一主壳 -> 二级面板壳 -> child page / 弹层 的层级
- 让 `shared_state` 被 child page 真正消费
- 继续压 `battle_report` 列表页 / 详情页结构位
- 让 `recruit / generals / ai` 从旧字符串页推进到显式 child-page block schema
- 让 `alliance / interior` 从旧 tab/section 语义收口到 `page_id`
- 逐步移除 `top_tab_changed / section_changed / set_active_tab_id / default_tab_id` 兼容口

当前阶段仍然坚持结构、层级、父子关系、共享状态关系优先，不做材质感、装饰风格大翻新。

## 边界与原则

本轮以及累计推进过程中，始终遵守以下边界：

- 只做 UI 结构线
- 优先改：
  - `godot-client/scenes/ui/**`
  - `godot-client/scripts/ui/**`
  - `godot-client/scripts/ui/presenters/**`
  - `godot-client/scripts/app/main.gd`
  - `godot-client/scripts/app/overlay_runtime_helper.gd`
- 不扩到：
  - `server/src/**`
  - `shared/**`
  - AI 玩家执行系统
  - 服务器容量 / world 并发治理
  - 地图性能优化
  - 材质/装饰风格翻新

## 已确认并收口的总体现状

### 1. 路由与壳层语义

- `page_id` 已经成为主语义，`tab_id` 在主线 UI 壳层中基本清空。
- `recruit / generals / ai` 现在统一通过 `SlgSnapshotPanel` 走 `page_changed / page_action_requested`。
- `alliance / interior` 已统一到复合 `page_id`，例如 `members/overview`、`market/economy`。
- `battle_report` 已不再发 `top_tab_changed`，也不再暴露 `set_active_tab_id(...)`。
- `main.gd` 不再为主线 snapshot overlay 保留 `top_tab_changed` 和 `set_active_tab_id` fallback。

### 2. child page 合同

- `SlgSnapshotSectionPage` 已从旧的 `left_cards / items / right_cards / detail_lines / actions / footer_lines` 渲染，扩展到显式 `item_cards / content_blocks` 渲染。
- `content_blocks` 已支持：
  - `text_block`
  - `button_row`
  - `card_grid`
- `battle_report_detail_page` 的 detail 三子页现在统一消费：
  - `detail_pages`
  - `content_blocks`
  - `structure_groups`

### 3. shared_state 消费

- `SlgSnapshotSectionPage` 已集中负责 `shared_state` dotted path 读取和结构卡/状态 chip 展示。
- `battle_report_list_page` / `battle_report_detail_page` 已真实消费壳层 shared state，例如：
  - `page_id`
  - `list_mode`
  - `selected_report`
  - `detail_tab`
  - `report_count`

## 主要推进内容

### A. Battle Report 线

#### 已完成

- 建立并持续压实：
  - `battle_report_panel.tscn`
  - `battle_report_list_page.tscn`
  - `battle_report_detail_page.tscn`
- `BattleReportPanel` 已具备：
  - 列表页 / 详情页壳层切换
  - `shared_state` 下发
  - `selected_report / detail_tab / list_mode / report_count` 结构状态管理
- `battle_report` detail 合同已从旧 `detail_sections` 收口到 `detail_pages`
- `battle_report` detail 子页 `battlefield / stats / formation` 已统一到：
  - `content_blocks`
  - `structure_groups`
- `battle_report_presenter.gd` 与 `battle_report_panel.gd` 的结构预览和真实详情合同已统一使用 `boxes`，生产 UI 线不再残留 `"items":`
- `battle_report_panel.gd` 已删除：
  - `signal top_tab_changed`
  - `set_active_tab_id(...)`
  - 所有 `top_tab_changed.emit(...)`

#### 当前状态

- `battle_report` 这条线已经不再依赖旧 tab 语义。
- `battle_report` 生产 UI 线已经没有 `"items":`
- `battle_report` 仍保留自己的专用 `report_cards / detail_payload` 合同，还没有完全并到通用 child-page scene。

### B. Snapshot 线：Recruit / Generals / AI

#### 已完成

- `SlgSnapshotSectionPage` 场景新增 `ContentBlocks`
- `SlgSnapshotSectionPage` 脚本新增：
  - `item_cards` 消费
  - `content_blocks` 消费
  - `card_grid / button_row / text_block` 动态构建
- `RecruitPresenter` 现在只输出：
  - `summary_lines`
  - `shared_state_fields`
  - `item_cards`
  - `content_blocks`
- `GeneralPresenter` 现在只输出：
  - `summary_lines`
  - `shared_state_fields`
  - `item_cards`
  - `content_blocks`
- `AIPanelPresenter` 现在只输出：
  - `summary_lines`
  - `shared_state_fields`
  - `item_cards`
  - `content_blocks`
- `SlgSnapshotPanel` 已删除：
  - `signal top_tab_changed`
  - `signal action_requested(tab_id, action_id)`
  - `set_active_tab_id(...)`
  - `default_tab_id` 读取 fallback

#### 当前状态

- `recruit / generals / ai` 这三条 snapshot 主线已全部切到 `page_id + shared_state + block schema`
- 这三条线的 presenter 已没有：
  - `"items":`
  - `"detail_lines":`
  - `"footer_lines":`
  - `"left_cards":`
  - `"right_cards":`
  - `default_tab_id`

### C. Alliance / Interior 线

#### 已完成

- `alliance / interior` 已从旧 `top_tab_changed / section_changed` 收口到 `page_id`
- `alliance` 多个 section 已收成显式 `item_cards / content_blocks`，包括：
  - `members/overview`
  - `members/groups`
  - `applications/pending`
  - `applications/review`
  - `applications/history`
  - `coordination/board`
  - `battle_reports/latest`
  - `battle_reports/archive`
  - `battle_reports/highlights`
  - `mail/inbox`
  - `mail/archive`
  - `mail/system`
- `interior` 多个 section 已收成显式 `section_payloads + item_cards / content_blocks`，包括：
  - `tax/flow`
  - `tax/reserve`
  - `policy/recruitment`
  - `policy/defense`
  - `market/economy`
  - `market/routing`
  - `affairs/appointment`
  - `affairs/bounty`
- `AffairsQueueView` 已独立成专用 scene：
  - `affairs_queue_view.tscn`
  - `affairs_queue_view.gd`

#### 这次新完成的关键点

- `alliance_panel.gd` 已删除：
  - `set_active_tab_id(...)`
  - runtime fallback 判定 `_should_allow_legacy_fallback(...)`
  - `runtime_legacy_transition` 的动态赋值
  - `allow_legacy_fallback` 的动态赋值
- `interior_panel.gd` 已删除：
  - `set_active_tab_id(...)`
  - runtime fallback 判定 `_should_allow_legacy_fallback(...)`
  - `runtime_legacy_transition` 的动态赋值
  - `allow_legacy_fallback` 的动态赋值

#### 当前状态

- `alliance / interior` 当前内建主线 section 已没有实际 legacy 触发源
- `runtime_legacy_transition / allow_legacy_fallback` 现在只剩 `child_page_block_factory.gd` 里保留过渡门本身

### D. 主壳与 Overlay Runtime

#### 已完成

- `main.gd` 已删除 snapshot overlay 里的：
  - `top_tab_changed` 连接 fallback
  - `action_requested` 旧路由 fallback 的依赖面中 battle_report 旧口
  - `_on_overlay_top_tab_changed()`
  - `_set_active_overlay_panel_page()` 里的 `set_active_tab_id(...)` fallback
- `overlay_runtime_helper.gd` 的 `build_basic_snapshot_overlay_spec(...)` 默认 handler 已从旧 top-tab alias 切到 `_on_overlay_page_changed`

#### 当前状态

- snapshot 主线 overlay 已统一按 `page_changed / set_active_page_id` 工作
- 旧的 top-tab 主壳兼容线在当前主线 UI 中已清空

## 关键文件清单

### 结构与壳层

- `godot-client/scenes/ui/slg_snapshot_section_page.tscn`
- `godot-client/scripts/ui/slg_snapshot_section_page.gd`
- `godot-client/scripts/ui/slg_snapshot_panel.gd`
- `godot-client/scripts/ui/battle_report_panel.gd`
- `godot-client/scripts/ui/battle_report_detail_page.gd`
- `godot-client/scripts/ui/alliance_panel.gd`
- `godot-client/scripts/ui/interior_panel.gd`
- `godot-client/scripts/ui/affairs_queue_view.gd`
- `godot-client/scenes/ui/affairs_queue_view.tscn`

### Presenter

- `godot-client/scripts/ui/presenters/recruit_presenter.gd`
- `godot-client/scripts/ui/presenters/general_presenter.gd`
- `godot-client/scripts/ui/presenters/ai_panel_presenter.gd`
- `godot-client/scripts/ui/presenters/battle_report_presenter.gd`
- `godot-client/scripts/ui/presenters/alliance_presenter.gd`
- `godot-client/scripts/ui/presenters/internal_affairs_presenter.gd`

### 主壳 / Runtime

- `godot-client/scripts/app/main.gd`
- `godot-client/scripts/app/overlay_runtime_helper.gd`
- `godot-client/scripts/ui/child_page_block_factory.gd`

## 正式验证记录

已反复复用以下正式入口进行验证：

- `npm run godot:headless:smoke -- --scene res://scenes/ui/battle_report_panel.tscn`
- `npm run godot:headless:smoke -- --scene res://scenes/ui/recruit_panel.tscn`
- `npm run godot:headless:smoke -- --scene res://scenes/ui/general_panel.tscn`
- `npm run godot:headless:smoke -- --scene res://scenes/ui/ai_panel.tscn`
- `npm run godot:headless:smoke -- --scene res://scenes/ui/alliance_panel.tscn`
- `npm run godot:headless:smoke -- --scene res://scenes/ui/interior_panel.tscn`
- `npm run godot:mainline:runtime -- --quit-after 1`
- `npm run gate:godot:week1`

最新 gate 结果：

- `[W1-C13] ok=True`
- stamped: `tmp/gates/godot_week1_gate_20260419_032537.json`

说明：

- `recruit / generals / ai` smoke 仍有既有 Godot RID / 资源泄漏告警
- 这些告警本轮没有新增，且退出码均为 `0`

## 编码与审计结果

- 所有本轮及关键累计改动文件都做了 UTF-8 回读校验
- 结果均为 `UTF8_OK`
- `git diff --check` 未出现 patch/空白错误
- 仅存在既有 LF -> CRLF 警告

## 图 1 / 图 2 / 图 3 修订计划落地（2026-04-25）

- 图 1 归 `GeneralPanel`：武将页默认进入 `profile`，主视觉改为左侧大立绘、轻量武将切换条、右侧 `详情 / 配点 / 兵种` 分区；`roster` 不再作为主体验展开。
- 图 2 归 `battle_report_detail_page`：继续精修 `SOM-D01 ~ SOM-D10` 的双方兵力、中央胜负、左右三武将卡、回放区、士气区和 `战斗地点 / 统计 / 阵容详情` 页签。
- 图 3 归 `battle_report_list_page`：继续精修 `SOM-L05 ~ SOM-L09` 的单条战报头部、我方三武将、中央胜负时间、敌方三武将和右侧窄筛选 / 序号 rail。
- 本轮仍不新增战报页面、不重做主壳、不接后端新动作；无正式战报时继续显示结构空状态，不伪造战报数据。
- `GeneralPresenter` 继续把单武将详情字段挂在 `shared_state.active_hero_profile` 下；画像优先走 `res://assets/themes/slgclient/current/generalpic/locked_preview/card_<hero_id>.png`，缺失时由 UI 显示“画像未接入” fallback。

## GeneralPanel 单武将详情真实数据入口（2026-04-25）

- 新增 `godot-client/data/ui/general_profile_preview.json` 作为 Godot 侧可维护预览资料入口，避免基础属性、兵力体力、战法、兵种适性、配点信息散落在 UI 代码里。
- 当前预览资料覆盖 9 个已锁定画像武将：`100016 / 100017 / 100021 / 100023 / 100027 / 100031 / 100090 / 100451 / 100661`。
- 当前 UI 口径：单武将兵力上限固定按 `0 ~ 10000` 展示，体力上限按 `0 ~ 150` 展示；这些是预览页展示规则，不改变后端或 shared 权威合同。
- `GeneralPanel` 当前只保留一个右侧 `详情 / 配点 / 兵种` tabs；外层 `FullScreenPanelHost` 的通用头部和空 tabs 已隐藏，避免出现重复 tabs。
- 左侧已经收成图 1 方向的覆盖式大立绘舞台：画像覆盖面积加大，阵营竖标、星级、身份信息、底部操作条覆盖在立绘区域内，避免普通 Web 卡片堆叠感。
- 最新布局继续收回到“立绘约半屏 + 左侧 rail + 渐变透明浮层”：页面不再使用开发期 `武将详情` 顶部标题框，返回/关闭/未保护改成轻量覆盖控件，立绘保留更多细节，并用左到右渐变过渡到详情面板。
- 左侧 rail 当前只保留 `阵营 / 领兵 / 列传`，`外观` 暂时移除；底部中央姓名浮层已移除，武将名改放到右侧详情头行。
- 阵营展示口径改为两字：`曹魏 / 季汉 / 东吴 / 群雄`；UI 对应默认色为曹魏蓝、季汉绿、东吴红、群雄黄，旧资料里的 `魏 / 蜀 / 吴 / 群 / 纪汉` 会在 UI 层归一。
- 右侧 `详情 / 配点 / 兵种` 三个 tab 已能分别生成真实 Godot 截图；详情页把状态、兵力体力和基础属性融成单个 `属性` 面板，下面接战法区，减少卡片碎片感。
- `兵种` tab 已按参考图改成可选择的三列兵种模型卡：当前使用仓库已有 `qibing_frames` 骑兵帧并通过 `AtlasTexture` 裁掉透明边放大展示，正式轻骑、铁骑等兵种模型图仍需后续补资源。
- 资料完整性检查已覆盖 9 个预览武将：必需字段无缺失，战法均为 3 个，兵种适性均不少于 4 项；`archer` 已在 `GeneralPresenter` 中映射为“弓兵”，避免弓兵武将落入默认“步兵”。
- `详情` tab 的战法区已从横向文字卡改为三枚圆形战法槽，显示评级、等级、战法名和类型；下方说明集中展示 `skills[].description`，仍从 `general_profile_preview.json -> GeneralPresenter -> shared_state.active_hero_profile` 链路读取。
- `配点` tab 已按参考图简化为稀有度、剩余点数、推荐方向、方案一/二/三、攻击/防御/谋略/速度四行加减点和 `洗点 / 确定` 占位，不再重复基础属性大面板。
- `配点` tab 已移除推荐方向字段，改为 `当前方案 / 剩余点数 / 稀有度`；配点推荐不作为本项目低代码资料必填项。
- 新增 `docs/templates/GENERAL_PROFILE_FILL_TEMPLATE.md`，用中文说明可填写字段；战法资料支持 `trigger / target / effect / attribute_effects`，Godot UI 会显示战法触发、目标、效果和属性影响。
- `上一位 / 下一位` 是真实 UI action；`重置 / 攻略 / 分享 / 传承` 当前按预览占位 chip 展示，不承诺动作链。
- `stars / red_stars` 已由 `GeneralPresenter` 从资料入口透传到 UI，后续星级和红星只需要维护 `general_profile_preview.json`。
- `上一位 / 下一位 / focus_hero:<id>` 已支持在 `GeneralPanel` 本地 snapshot 内切换当前武将，切换时同步刷新画像、阵营、兵种、属性、战法、配点和兵种适性；该预览切换不写入 WorldStore，也不改变后端或 shared 权威合同。
- 自动截图使用临时 Godot 捕获场景生成 `tmp/general_panel_godot_preview_20260425_profile.png`、`tmp/general_panel_godot_preview_20260425_tactics.png`、`tmp/general_panel_godot_preview_20260425_growth.png`；该临时场景不作为正式验证入口，正式验证仍以 `npm run godot:headless:smoke -- --scene res://scenes/ui/general_panel.tscn` 为准。
- 切换验证截图另生成 `tmp/general_panel_godot_preview_20260425_switch_100023.png`、`tmp/general_panel_godot_preview_20260425_switch_100016.png`、`tmp/general_panel_godot_preview_20260425_switch_100017.png`。

## 当前剩余 UI 结构债

### 1. battle_report 仍是专用合同

虽然 battle_report 已经去掉了：

- `"items"`
- `top_tab_changed`
- `set_active_tab_id`

但它仍保留专用的：

- `report_cards`
- `detail_payload`

也就是说，battle_report 已经进入显式结构页，但还没有完全并成统一 child-page scene 合同。

### 2. child_page_block_factory 仍保留 runtime 过渡门

当前 `child_page_block_factory.gd` 里还保留：

- `allow_legacy_fallback`
- `runtime_legacy_transition`

这条门现在没有主线 section 在实际触发，但门本身还在，后续可以继续收紧。

### 3. 战报动作还不是统一 page action

`battle_report` 当前主要统一的是结构合同和页签合同；若后续要把它完全纳入主壳动作语义，还可以继续补：

- `page_action_requested`
- 与 adapter 的更稳定动作页合同

## 后续建议

### 优先级 1：继续压 battle_report 专用合同

建议继续把：

- `report_cards`
- `detail_payload`

再向更稳定的 page contract 收口，减少 `battle_report_panel.gd` 对专用字段的直接依赖。

### 优先级 2：继续收紧 child_page_block_factory

当前主线已经没有实际 legacy 触发源，可以考虑把：

- `runtime_legacy_transition`
- `allow_legacy_fallback`

从“保底兼容”继续收成“更硬的开发期提示”。

### 优先级 3：统一 battle_report 动作口径

如果后续战报需要和主壳统一动作语义，建议补：

- `page_action_requested`
- 更清晰的 detail child-page 动作页合同

### 优先级 4：最后再做横向清理

当 battle_report 也彻底并入更统一合同后，可以再做一次 repo 级 UI 审计，确认：

- `godot-client/scripts/ui/**`
- `godot-client/scripts/app/**`

里已经没有新的旧路由或旧结构键回流。

## 一句话结论

当前 `8989` Godot 原生 SLG 主线 UI 的结构线，已经从“多套旧 tab/字符串页并存”推进到“以 `page_id + shared_state + block schema` 为主的统一壳层体系”；`battle_report / recruit / generals / ai / alliance / interior` 都已经完成了大收口，剩下的重点是继续压平战报专用合同和最终收紧 factory 过渡门。
