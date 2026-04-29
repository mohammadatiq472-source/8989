# 通用战法库与招募池第一版收口

> 日期：2026-04-27  
> 范围：Godot native UI 通用战法库、招募池只读预览、前端概率草案  
> 状态：第一版候选，可交给后续 AI 读取；仍然是 preview-only，不接真实库存链

## 后续 AI 必读结论

1. 已经做了玩家可获取、可装配的通用战法库第一版。
2. 通用战法只在 `godot-client/data/ui/general_skill_library_preview.json -> skills[]`。
3. 武将主战法只在 `godot-client/data/ui/general_profile_preview.json -> hero_profiles[*].skills[0]`。
4. 不允许把武将主战法和可装配通用战法混在一起。
5. 当前 27 个武将都是 S 级武将，没有普通武将卡。
6. 招募池同时预览武将卡和战法卡。
7. 战法卡抽出后，未来真实链路应从“可抽战法池”移除该战法。
8. 当可抽战法卡全部抽空后，后续招募口径自然变成 100% S 级武将卡。
9. 以上抽空规则当前只记录在 preview 数据里，不删除静态 JSON，不写库存。

## 权威文件

| 用途 | 文件 |
| --- | --- |
| 武将资料与主战法 | `godot-client/data/ui/general_profile_preview.json` |
| 通用战法库与招募概率预览 | `godot-client/data/ui/general_skill_library_preview.json` |
| 武将面板只读战法库体验 | `godot-client/scripts/ui/general_panel.gd` |
| 武将面板数据摘要 | `godot-client/scripts/ui/presenters/general_presenter.gd` |
| 招募页入口 | `godot-client/scripts/ui/recruit_panel.gd` |
| 招募页同池预览与说明页 | `godot-client/scripts/ui/presenters/recruit_presenter.gd` |
| 数据与概率校验 | `godot-client/tools/validate_general_skill_library.py` |
| 中文低代码填写口径 | `docs/templates/GENERAL_PROFILE_FILL_TEMPLATE.md` |
| 详细过程 handoff | `docs/GENERAL_SKILL_LIBRARY_NATIVE_UI_HANDOFF_2026_04_26.md` |

## 当前数据结构

`general_skill_library_preview.json` 当前包含：

1. `skills[]`：50 条通用战法。
2. `supported_source_pools=["招募"]`。
3. `acquisition_model.entry="武将招募"`。
4. `acquisition_model.draw_modes=["单招","五连"]`。
5. `recruit_probability_preview`：招募概率与只读边界。

通用战法字段至少包括：

```text
id, name, grade, type, level, description, trigger, target, effect,
attribute_effects, source, unlock_hint, compatible_troops,
recommended_slot, combat_role, tags
```

当前固定口径：

| 项 | 当前值 |
| --- | --- |
| 战法数量 | 50 |
| 品质分布 | S=13 / A=22 / B=15 |
| 类型分布 | 指挥=14 / 主动=14 / 被动=12 / 追击=10 |
| 兵种 | 只允许骑兵 / 步兵 / 弓兵 |
| 装配位 | 全部 `任意` |
| 来源 | 全部 `招募` |
| 主战法隔离 | 27 个武将每人 1 个 `innate_` 主战法 |

## 招募概率草案

当前概率仍然只是前端预览，不是正式线上随机：

| 分类 | 概率 |
| --- | ---: |
| 战法卡 | 70% |
| 武将卡 | 30% |
| S级武将 | 30% |
| S级战法 | 10% |
| A级战法 | 30% |
| B级战法 | 30% |

注意：

1. 当前没有普通武将卡。
2. 不允许恢复 `hero_regular / 普通武将` 权重。
3. `validate_general_skill_library.py` 已校验只允许 `hero_s / skill_s / skill_a / skill_b` 四类稀有度权重。
4. 概率建议区间已写入校验脚本：战法卡 65-75，武将卡 25-35，S 武将 25-35，S 战法 8-12，A/B 战法 25-35。

## 战法卡抽空规则

`recruit_probability_preview.pool_depletion_preview` 当前记录：

```text
preview_only=true
no_inventory_write=true
skill_cards_unique=true
skill_card_remove_on_draw=true
```

设计口径：

1. 战法卡不是碎片。
2. 抽到某个战法后，未来真实链路应把该战法从玩家当前可抽战法池移除。
3. 这里的“移除”指运行时可抽池，不是删除 `general_skill_library_preview.json -> skills[]` 静态配置。
4. 当玩家可抽战法池为空时，后续招募预览口径为 100% S 级武将卡。
5. 当前没有接库存，所以这只是 preview-only 合同说明。

## 招募页只读体验

`RecruitPresenter` 当前读取：

```text
res://data/ui/general_profile_preview.json
res://data/ui/general_skill_library_preview.json
```

当前页签：

| 页签 | 作用 |
| --- | --- |
| 卡池 | 展示同池入口、卡类摘要、预览边界、概率摘要 |
| 单招 | 展示 1 格只读样例 |
| 五连 | 展示 5 格混合样例 |
| 结果 | 展示完整概率明细和混合池样例 |
| 说明 | 集中说明同池、单招、五连、概率、抽空和边界 |

所有页面都不消耗资源，不写 `roster / reserve / 战法库存`，不触发真实抽卡。

## 禁止误扩范围

后续 AI 不要在本线直接做：

1. 不改 `server/**`。
2. 不改 `shared/**`。
3. 不碰 world-cell、地图、assets/dev story。
4. 不碰 battle_report / troop_panel。
5. 不接真实抽卡库存。
6. 不写 roster / reserve / 战法库存。
7. 不新增普通武将卡。
8. 不把通用战法写进 `hero_profiles[*].skills[0]`。
9. 不把抽出后移除误解为删除静态战法库 JSON。

## 正式验证入口

```powershell
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONUTF8='1'
python godot-client/tools/validate_general_skill_library.py --json
npm run godot:headless:smoke -- --scene res://scenes/ui/recruit_panel.tscn
npm run godot:headless:smoke -- --scene res://scenes/ui/general_panel.tscn
npm run godot:headless:smoke
```

当前验证结论：以上命令通过。Godot headless smoke 仍会输出既有 RID/ObjectDB 退出警告，但退出码为 0，不作为本线阻塞。

## 后续如果要接真实链路

必须另开后端/合同窗口，并重新定义白名单。建议先设计：

1. 玩家维度或赛季维度的可抽战法池。
2. 战法卡抽出后移除的权威状态。
3. 战法库存或账号持有结构。
4. 战法池抽空后的动态概率重算。
5. 与现有武将 `roster / reserve` 的边界。
