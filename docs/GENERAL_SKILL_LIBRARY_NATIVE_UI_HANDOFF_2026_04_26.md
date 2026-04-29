# Godot Native UI 通用战法库收口交接

> 日期：2026-04-26
> 范围：Godot native UI 武将面板通用战法库第一版
> 边界：不改 `server/**`、不改 `shared/**`、不碰 world-cell、battle report、troop panel，不接真实装备链。

## 1. 当前结论

本轮已经把“玩家可获取、可装配”的通用战法库从口头草案推进到可读取、可展示摘要、可校验的 Godot native UI 预览资产。

当前权威数据入口：

| 数据 | 路径 |
| --- | --- |
| 武将资料与 27 个武将主战法 | `godot-client/data/ui/general_profile_preview.json` |
| 玩家可获取、可装配通用战法库 | `godot-client/data/ui/general_skill_library_preview.json` |

后续 AI 若只需要最终结论，优先读：`docs/GENERAL_SKILL_LIBRARY_RECRUIT_POOL_FINAL_2026_04_27.md`。

关键边界保持不变：

1. `hero_profiles[*].skills[0]` 只保留武将主战法。
2. 通用战法只进入 `general_skill_library_preview.json -> skills[]`。
3. `recommended_slot / combat_role` 是预览建议字段，不代表正式装备链已接入。
4. 当前兵种模型只允许 `骑兵 / 步兵 / 弓兵`；每名武将只有一个固定 `troop_type`，不填写兵种适性。

## 2. 当前战法库规模

当前 `general_skill_library_preview.json` 共 `50` 条通用战法。

| 维度 | 分布 |
| --- | --- |
| 品质 | S=13 / A=22 / B=15 |
| 类型 | 指挥=14 / 主动=14 / 被动=12 / 追击=10 |
| 兵种覆盖 | 骑兵=32 / 步兵=39 / 弓兵=34 |
| 装配位 | 任意=50 |
| 武将主战法隔离 | 27 个武将，每人 1 个 `innate_` 主战法 |

来源池已收敛为 1 类：

| 来源池 | 数量 |
| --- | ---: |
| 招募 | 50 |

获取口径：通用战法与武将共用“武将招募”入口，支持单招和五连。第一版先按“战法整体权重高于 S 级武将”的好概率预览口径处理，正式概率表后续统一落到招募系统，不再拆内政、研究、演武、传承等独立入口。

当前招募概率草案只做前端预览表，不接真实随机、不写库存：

| 分类 | 概率 |
| --- | ---: |
| 战法卡总权重 | 70% |
| 武将卡总权重 | 30% |
| S级武将 | 30% |
| S级战法 | 10% |
| A级战法 | 30% |
| B级战法 | 30% |

边界字段：`recruit_probability_preview.preview_only=true`，`no_inventory_write=true`。补充说明字段为 `single_draw_preview_note / five_draw_probability_note / display_notes`，用于招募页直接展示“只读、无消耗、无落库”的口径。招募页先把 `display_notes` 渲染为“预览边界”摘要卡，再把概率拆成“卡类权重 / 稀有度权重 / 保底状态”三组只读卡片。五连当前只展示概率说明和固定样例，不做真实随机；`guarantee_preview.enabled=false`，保底状态只显示“未启用”，不写任何保底进度。

当前没有普通武将卡，武将卡全部按 S 级武将处理。`pool_depletion_preview` 记录第一版抽空口径：战法卡抽出后从可抽战法池移除；当可抽战法卡为空时，后续预览口径为 100% S 级武将卡。该规则仍是 preview-only，不写库存、不删静态配置。

## 3. 通用战法字段

每条 `skills[]` 当前必须包含：

| 字段 | 用途 |
| --- | --- |
| `id` | 稳定 ID，格式 `lib_<品质>_<英文短名>` |
| `name` | 中文战法名 |
| `grade` | `S / A / B` |
| `type` | `指挥 / 主动 / 被动 / 追击` |
| `level` | 当前预览等级 |
| `description` | 一句话数值化说明 |
| `trigger` | 触发时机 |
| `target` | 目标范围 |
| `effect` | 正文效果 |
| `attribute_effects` | 属性影响，用于 UI 展示 |
| `source` | 获取来源和绑定边界 |
| `unlock_hint` | 玩家侧解锁提示 |
| `compatible_troops` | 可装配的固定兵种，只允许骑兵/步兵/弓兵 |
| `recommended_slot` | 固定 `任意`，第一版不做站位推荐 |
| `combat_role` | 简短战斗定位 |
| `tags` | 低代码筛选标签 |

## 4. Godot UI 接入状态

`GeneralPresenter` 当前读取：

```text
res://data/ui/general_skill_library_preview.json
```

并生成只读摘要：

1. 通用战法总数。
2. S/A/B 分布。
3. 指挥/主动/被动/追击分布。
4. 骑/步/弓兵种覆盖。
5. 装配位固定为任意。
6. 高频 tags。

`GeneralPanel` 当前只做小范围只读展示：

1. 战法槽仍显示武将主战法和空槽。
2. 战法块下方显示通用战法库摘要。
3. 战法详情弹窗兼容 `recommended_slot / combat_role`，但只有技能数据带字段时才展示。
4. 当前没有把通用战法真正写入任意武将槽位。
5. 新增 `战法库` 页签，只读浏览 50 条通用战法，支持按品质、类型、兵种、来源、标签筛选。
6. `战法库` 页签带本地搜索框，可查名称、描述、效果、来源、兵种和标签；搜索词只保存在当前 UI 状态，不写入数据文件或后端。
7. 来源筛选使用 `source.pool`，当前统一为 `招募`；标签筛选按钮按当前品质/类型/兵种/来源/搜索条件下的命中数量降序展示，例如 `增伤×8`。
8. 搜索保持回车或“搜索”按钮刷新，不做即时刷新，避免重建面板时打断输入。
9. 筛选区下方显示结果摘要：当前条件、来源命中 Top、标签命中 Top、搜索命中字段统计。
10. 搜索生效时，每条结果显示短句命中提示，例如 `搜索命中：名称 / 标签 / 来源`；这只是只读查看辅助，不代表推荐搭配。
11. 支持结果排序：品质、名称、类型、来源；筛选、搜索、排序和来源/标签折叠状态会写回当前 `shared_state.skill_library_ui_state`，仅保留在当前 UI 快照生命周期。
12. 来源与标签筛选默认折叠展示，点击“展开”才显示完整按钮组。
13. 战法库条目点击后复用战法详情弹窗；不做站位推荐，不做武将名推荐。

`RecruitPresenter` 当前也读取同一批预览数据：

```text
res://data/ui/general_profile_preview.json
res://data/ui/general_skill_library_preview.json
```

并生成只读招募预览：

1. 卡池页展示“武将 + 战法”同池口径。
2. 单招页展示 1 格只读结果样例，可能是武将卡或战法卡。
3. 五连页展示 5 格混合结果样例，当前预览为 1 张武将卡 + 4 张战法卡。
4. 结果页复用五连混合样例，方便检查武将卡和战法卡同屏展示。
5. 所有预览都不消耗 `developmentPoints`，不写 `roster / reserve / 战法库存`，不接正式概率表。
6. 卡池页、单招页、五连页和结果页都会展示 `recruit_probability_preview` 的只读概率草案。
7. 卡池页的概率卡片只展示“卡类权重 / 稀有度权重 / 保底状态”三组摘要；完整概率草案保留在结果页，避免卡池页过密。保底当前仅为只读边界提示，`guarantee_preview.enabled=false`。
8. 卡池页使用 `display_notes` 生成“预览边界”摘要卡，固定说明只读、不代表最终概率、不写库存。
9. 卡池页、五连页和结果页会把当前五连样例拆成“武将卡 / 战法卡”分类摘要，只说明样例构成，不做推荐搭配。
10. 说明页集中展示同池入口、单招样例、五连样例、概率明细位置和预览边界；该页仍然只读，不发起抽卡。

## 5. 可复用校验入口

文本报告：

```powershell
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONUTF8='1'
python godot-client/tools/validate_general_skill_library.py
```

机器可读 JSON 报告：

```powershell
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONUTF8='1'
python godot-client/tools/validate_general_skill_library.py --json
```

当前校验覆盖：

1. `skills[]` 数量必须在 `20-50`。
2. 每条通用战法字段完整。
3. `id` 不重复，不允许 `innate_` 前缀。
4. `id` 品质前缀必须匹配 `grade`。
5. `grade / type / compatible_troops / recommended_slot / tags / source.pool` 必须在固定枚举内。
6. 文案至少包含 2 个数字信号。
7. `source.pool / source.unlock_method / source.bind_rule` 必填。
8. `source.bind_rule` 必须声明不写入 `hero_profiles[*].skills[0]`。
9. 27 个武将仍必须每人仅有 1 个 `innate_` 主战法。
10. 27 个武将不能再包含兵种适性数组，`troop_type` 只允许 `cavalry / infantry / archer`。
11. `recommended_slot` 必须固定为 `任意`，不在数据层暗示站位答案。
12. `recruit_probability_preview` 必须声明 `preview_only / no_inventory_write`，类型权重和稀有度权重都必须合计 100。
13. 招募概率权重必须保持在第一版建议区间：战法卡 65-75，武将卡 25-35，S 武将 25-35，S 战法 8-12，A/B 战法 25-35；不允许再出现普通武将权重。
14. `pool_depletion_preview` 必须声明战法卡抽出后从可抽池移除，且保持 `preview_only / no_inventory_write`。

## 6. 本轮正式验证

已复用正式入口：

```powershell
python godot-client/tools/validate_general_skill_library.py
python godot-client/tools/validate_general_skill_library.py --json
npm run godot:headless:smoke -- --scene res://scenes/ui/recruit_panel.tscn
npm run godot:headless:smoke -- --scene res://scenes/ui/general_panel.tscn
npm run godot:headless:smoke
```

当前结果：

| 命令 | 结果 |
| --- | --- |
| `validate_general_skill_library.py` | 通过 |
| `validate_general_skill_library.py --json` | 通过 |
| `godot:headless:smoke -- --scene res://scenes/ui/recruit_panel.tscn` | 退出码 0 |
| `godot:headless:smoke -- --scene res://scenes/ui/general_panel.tscn` | 退出码 0 |
| `godot:headless:smoke` | 退出码 0 |

Godot headless smoke 仍会输出既有退出资源泄漏 warning/error，但当前不阻塞命令通过。

本轮 2026-04-27 补齐招募概率只读说明：

1. `recruit_probability_preview` 增加单招说明、五连说明、展示边界和保底未启用提示。
2. 招募页概率卡片展示战法卡/武将卡权重、S/A/B/普通权重和“保底状态”，并在卡池页额外归纳为“卡类权重 / 稀有度权重 / 保底状态”三组。
3. 校验入口已覆盖概率合计 100、`preview_only=true`、`no_inventory_write=true`、`guarantee_preview.enabled=false`。
4. 仍未接真实随机、库存、保底进度、roster/reserve 或服务端合同。
5. 分组卡片增量已通过 `recruit_panel.tscn`、`general_panel.tscn` 和全局 Godot headless smoke。
6. `display_notes` 已接入卡池页“预览边界”摘要卡，继续保持只读、不消耗、不落库。
7. 五连样例已增加“武将卡 / 战法卡”分类摘要，继续只读展示，不改变样例顺序和概率数据。
8. 卡池页已做概率明细降噪：只保留三组概率摘要，完整概率明细移动到结果页继续只读展示。
9. 招募页新增只读“说明”tab，集中解释同池、单招、五连、概率和边界，不接真实抽卡。
10. 校验脚本已锁住招募概率建议区间，避免后续误把第一版概率改离当前草案。
11. 普通武将权重已移除，武将卡统一为 S 级武将 30%；抽空规则以 `pool_depletion_preview` 只读记录。

## 7. 修改文件清单

| 文件 | 说明 |
| --- | --- |
| `godot-client/data/ui/general_profile_preview.json` | 保持 27 个武将主战法，并移除兵种适性数组 |
| `godot-client/data/ui/general_skill_library_preview.json` | 扩到 50 条通用战法，装配位统一任意，兵种收敛到骑/步/弓 |
| `godot-client/scripts/ui/presenters/general_presenter.gd` | 读取新战法库并生成摘要 |
| `godot-client/scripts/ui/general_panel.gd` | 显示通用战法库摘要，弹窗兼容推荐位/定位 |
| `godot-client/scripts/ui/presenters/recruit_presenter.gd` | 显示武将卡/战法卡同池预览、概率草案和保底未启用提示 |
| `godot-client/tools/validate_general_skill_library.py` | 新增可复用校验入口，支持文本和 JSON 输出 |
| `docs/templates/GENERAL_PROFILE_FILL_TEMPLATE.md` | 更新低代码填写口径、字段、枚举、校验命令 |
| `docs/templates/GENERAL_PROFILE_ROSTER_DRAFT_27.md` | 补充主战法与通用战法库隔离规则 |

## 8. 尚需用户确认

1. 50 条通用战法的名称和数值是否作为第二批预览锁定。
2. S/A/B 比例是否维持 `13/22/15`。
3. `combat_role` 是否继续使用中文短句。

## 9. 版本纳入建议

如果用户确认纳入版本管理，本线建议只纳入以下文件：

| 文件 | 原因 |
| --- | --- |
| `godot-client/data/ui/general_profile_preview.json` | 27 个武将主战法隔离、固定兵种口径 |
| `godot-client/data/ui/general_skill_library_preview.json` | 50 条通用战法、招募来源、概率预览数据 |
| `godot-client/scripts/ui/general_panel.gd` | 战法库筛选、搜索、摘要只读体验 |
| `godot-client/scripts/ui/presenters/general_presenter.gd` | GeneralPanel 数据摘要与战法库读取 |
| `godot-client/scripts/ui/recruit_panel.gd` | 招募页场景入口 |
| `godot-client/scripts/ui/presenters/recruit_presenter.gd` | 武将卡/战法卡同池预览、说明页、概率摘要 |
| `godot-client/tools/validate_general_skill_library.py` | 通用战法库与招募概率正式校验入口 |
| `docs/GENERAL_SKILL_LIBRARY_NATIVE_UI_HANDOFF_2026_04_26.md` | 本线 handoff 与验证记录 |
| `docs/templates/GENERAL_PROFILE_FILL_TEMPLATE.md` | 中文低代码填写口径 |
| `docs/templates/GENERAL_PROFILE_ROSTER_DRAFT_27.md` | 主战法与通用战法隔离口径 |

本线仍然不建议纳入或改动：

1. `server/**`
2. `shared/**`
3. `godot-client/scripts/map/**`
4. `godot-client/scripts/dev/**`
5. `godot-client/assets/**`
6. `battle_report / troop_panel` 相关脚本与场景
7. 任何 roster / reserve / 战法库存落库链路

## 10. 第一版交付检查清单

当前可以作为“通用战法库 + 招募池前端概率预览”第一版候选，但必须继续按 preview-only 理解：

- [x] 50 条通用战法位于 `general_skill_library_preview.json -> skills[]`。
- [x] 27 个武将仍然每人 1 个 `innate_` 主战法。
- [x] 通用战法来源池全部收敛为 `招募`。
- [x] 兵种只允许 `骑兵 / 步兵 / 弓兵`。
- [x] `recommended_slot` 全部固定为 `任意`。
- [x] 招募概率草案合计 100%，战法卡 70%，武将卡 30%。
- [x] 招募概率草案符合第一版建议区间：战法卡 65-75，武将卡 25-35，S 武将 25-35，S 战法 8-12，A/B 战法 25-35。
- [x] 当前没有普通武将卡，武将卡统一为 S 级武将。
- [x] 已记录战法卡抽空规则：战法卡抽出后从可抽池移除，战法池为空后预览口径为 100% S 级武将卡。
- [x] 招募页已有卡池、单招、五连、结果、说明 5 个只读页签。
- [x] 卡池页展示摘要，结果页展示完整概率明细。
- [x] `preview_only=true`、`no_inventory_write=true`、`guarantee_preview.enabled=false`。
- [x] 正式验证入口已覆盖数据、UTF-8、空白和 Godot headless smoke。

仍然明确未做：

1. 未接真实随机、真实抽卡概率或保底计数。
2. 未写 `roster / reserve / 战法库存`。
3. 未新增后端合同、服务端动作、shared schema 或库存链。
4. 未做推荐搭配、站位绑定或武将装配落库。
5. 未改 world-cell、地图、assets/dev story、战报或部队面板。

## 11. 下一阶段建议

下一阶段不要直接混入后端装备链。建议先做一张“通用战法进入装备槽”的 UI 合同草案：

1. 新增 `equipped_skill_slots` 或等价预览字段。
2. 明确主战法槽和可装配槽的 UI 边界。
3. 明确通用战法是否按武将、账号、赛季或阵营持有。
4. 再决定是否需要后端权威动作链。

## 12. 最终复核结论

截至本线最后一轮复核，功能范围已经足够作为第一版候选：

1. 不需要继续自动扩展 UI 功能；继续扩展容易越界到真实抽卡、库存或装备链。
2. 下一次人工确认优先看概率表、保底策略和是否纳入版本管理。
3. 若未收到明确新需求，后续自动化只应复跑验证，不再新增页面、字段或交互。
4. 若用户决定接真实链路，必须另开后端/合同窗口，并重新定义 server/shared 白名单。
