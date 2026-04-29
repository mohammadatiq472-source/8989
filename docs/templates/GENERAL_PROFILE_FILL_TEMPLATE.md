# 武将资料低代码填写模板

> 用途：给 Godot 原生 `GeneralPanel` 预览页填写武将资料。
> Godot 实际读取文件：`godot-client/data/ui/general_profile_preview.json`。
> 注意：实际 JSON 文件不能写 `// 注释`，中文说明统一写在本模板里。

## 最小填写流程

1. 准备画像：当前锁定版放到 `godot-client/assets/themes/slgclient/current/generalpic/locked_preview/card_<武将ID>.png`。
   后续扩画布展示版放到 `godot-client/assets/themes/slgclient/current/generalpic/display_preview/card_<武将ID>.png`，同名文件会自动优先使用。
2. 复制一个武将块，改成新的 `<武将ID>`。
3. 填阵营、星级、红星、等级、兵力、体力、属性、成长、战法、兵种。
4. 跑 `npm run godot:headless:smoke -- --scene res://scenes/ui/general_panel.tscn`。
5. 打开截图或运行主线检查立绘裁切是否合适。

## 画像规格建议

当前 `GeneralPanel` 在 1920x960 预览截图里的立绘显示矩形约为：

| 项目 | 当前值 |
| --- | --- |
| 屏幕位置 | x=92 到 x=960 |
| 显示宽度 | 约 868 px |
| 显示高度 | 约 962 px |
| 右侧面板起点 | x=1037 左右 |
| 画像与面板间距 | 约 77 px，叠加横向渐变 |

建议批量画像规格：

| 规格 | 建议 |
| --- | --- |
| 最低可用 | 不低于 `1122x1402` |
| 推荐原图 | `1400x1750` 或 `1536x1920`，画幅仍可接近 `4:5` |
| Godot 展示画布 | 若要不留侧边暗场，建议扩展到约 `1265x1402` 或同等 `0.90:1` 比例 |
| 主体位置 | 头部在上方 10% 到 30%，身体中心略偏左 |
| 留白 | 头冠、手臂、武器、衣摆不要贴边；宁可扩背景，不要放大人物硬裁 |

当前 27 张 locked 画像均为 `1122x1402`，作为原图分辨率已经够当前预览使用。
Godot 侧优先使用“等比完整显示”保住衣冠、手臂、衣摆等边缘细节；如果未来想要完全铺满左半屏，不建议直接把人物放大，而是把画布横向扩到约 `1265x1402`，两侧用背景/暗场补足。

当前批次先按曹操锁定图的展示比例作为基准：只要后续画像接近 `4:5`，且人物头冠、手臂、衣摆没有贴边，就可以直接进入 `locked_preview`。扩画布版本只作为后续替换优先源，不阻塞当前 UI 和数据推进。

## 阵营固定值

| 阵营 | UI 颜色 | 说明 |
| --- | --- | --- |
| 曹魏 | 蓝色 | 曹魏武将 |
| 季汉 | 绿色 | 蜀汉/季汉武将 |
| 东吴 | 红色 | 吴国武将 |
| 群雄 | 黄色 | 群雄武将 |

旧写法 `魏 / 蜀 / 吴 / 群 / 纪汉` 会在 UI 层归一，但新资料建议直接填两字阵营。

## 字段说明

| 字段 | 中文含义 | 是否必填 | 示例 |
| --- | --- | --- | --- |
| `name` | 武将名 | 是 | `曹操` |
| `title` | 称号 | 否 | `魏武帝` |
| `variant_tag` | 同名武将变体标记 | 否 | `XP / SP` |
| `variant_label` | UI 展示用变体标记 | 否 | `XP` |
| `faction` | 两字阵营 | 是 | `曹魏` |
| `card_type` | 卡面兵种短字 | 是 | `骑` |
| `quality` | 稀有度 | 是 | `5-SP` |
| `stars` | 黄星数量 | 是 | `5` |
| `red_stars` | 红星数量 | 是 | `1` |
| `cost` | 统御值 | 是 | `3.5` |
| `troop_type` | 固定兵种英文键 | 是 | `cavalry` |
| `attack_range` | 攻击距离 | 是 | `2` |
| `level` | 等级 | 是 | `41` |
| `soldier_current / soldier_max` | 当前兵力 / 兵力上限 | 是 | `9300 / 10000` |
| `stamina_current / stamina_max` | 当前体力 / 体力上限 | 是 | `150 / 150` |
| `attributes` | 当前属性 | 是 | 攻击、防御、谋略、攻城、速度 |
| `growth` | 成长值 | 是 | 每级成长 |
| `skills` | 战法列表 | 是 | 当前只填 1 个武将主战法 |
| `allocation.free_points` | 可用配点 | 否 | `96` |
| `allocation.active_scheme` | 当前方案名 | 否 | `方案一` |
| `display_portrait_path` | 可选展示版画像路径 | 否 | `res://assets/themes/slgclient/current/generalpic/display_preview/card_100023.png` |

`troop_type` 只允许 `cavalry / infantry / archer`，分别对应 UI 文案 `骑兵 / 步兵 / 弓兵`。每名武将只填一个固定兵种，不再填写兵种适性数组。

## 画像接入节奏

当前 UI 可以继续使用 `locked_preview` 里的已确认画像。资产窗口产出扩画布/补背景版本后，只需要把文件放进 `display_preview/card_<武将ID>.png`，`GeneralPresenter` 会自动优先使用展示版；没有展示版时回退到 `locked_preview`，再回退到旧 `generalpic/card_<武将ID>.png`。

如某个武将需要临时指定非标准文件名，可在对应 JSON 武将块里填写 `display_portrait_path`。标准批量接入仍推荐同名 `card_<武将ID>.png`，这样后续替换最快。

## 战法字段

`GeneralPanel` 详情页只把战法本体显示成可点击按钮；触发、目标、效果、属性影响放进点击后的弹窗里，避免详情页正文被长说明挤满。通用战法若带 `recommended_slot / combat_role`，弹窗只读展示建议位和定位；这仍然不是正式装备链。

| 字段 | 中文含义 | 示例 |
| --- | --- | --- |
| `id` | 稳定战法 ID | `innate_100023` |
| `name` | 战法名 | `魏武之世` |
| `grade` | 战法等级品质 | `S` |
| `type` | 战法类型 | `指挥 / 主动 / 被动 / 追击` |
| `level` | 战法等级 | `10` |
| `description` | 一句话数字说明 | `前3回合我军全体攻击+18%，谋略+18%。` |
| `trigger` | 触发时机 | `第1回合战斗开始时发动，持续3回合。` |
| `target` | 影响目标 | `我军全体3名武将` |
| `effect` | 战法效果正文 | `攻击、谋略按基础属性结算加成。` |
| `attribute_effects` | 属性影响，给 UI 展示 | `{ "attack": "+40", "strategy": "+40" }` |
| `source` | 来源边界 | `{ "kind": "hero_innate" }` |
| `unlock_hint` | 解锁提示 | `获得该武将后默认拥有。` |

品质颜色固定为：`S=金色`、`A=紫色`、`B=蓝色`。当前 27 名武将的主战法可以全部先填 `S`；`A / B` 不是废弃，而是留给后续大量可获取、可装配的通用战法。战法弹窗会按 `type` 自动选用类型图标：`指挥`、`主动`、`被动`、`追击`。若 Godot 端暂未接入 `追击` SVG，可先沿用被动样式，后续补独立图标。填写时优先写数字和回合条件，少写“提升较多”“概率较高”这类笼统描述。

当前阶段每名武将只填写 1 个武将主战法，仍位于 `godot-client/data/ui/general_profile_preview.json -> hero_profiles[*].skills[0]`。玩家可获取、可装配通用战法单独位于 `godot-client/data/ui/general_skill_library_preview.json -> skills[]`，不得直接写进武将主战法；正式装备链落地后再新增 `equipped_skill_slots` 或等价槽位数据。

## 玩家可装配战法库

通用可装配战法库使用独立 JSON 文件，不和 27 名武将的 `skills[0]` 混放。

| 文件 | 内容 |
| --- | --- |
| `godot-client/data/ui/general_profile_preview.json` | 武将资料与武将主战法 |
| `godot-client/data/ui/general_skill_library_preview.json` | 玩家可获取、可装配通用战法库预览 |

战法库固定支持：

| 维度 | 固定值 |
| --- | --- |
| 品质 | `S / A / B` |
| 类型 | `指挥 / 主动 / 被动 / 追击` |
| 默认等级 | `1` |
| 最高等级 | `10` |

战法库里每条 `skills[]` 必须包含 `id / name / grade / type / level / description / trigger / target / effect / attribute_effects / source / unlock_hint / compatible_troops / recommended_slot / combat_role / tags`。`source.kind` 先统一写 `general_skill_library_preview`，`source.bind_rule` 必须说明“仅进入玩家可装配战法槽，不写入 hero_profiles[*].skills[0]”。

### 可复制可装配战法块

```json
{
  "id": "lib_a_active_example",
  "name": "示例战法",
  "grade": "A",
  "type": "主动",
  "level": 1,
  "description": "40%发动，对敌军群体2人造成120%攻击伤害。",
  "trigger": "战斗回合行动时有40%概率发动。",
  "target": "敌军群体2名武将",
  "effect": "造成稳定群体攻击伤害。",
  "attribute_effects": {
    "force": "伤害率120%"
  },
  "source": {
    "kind": "general_skill_library_preview",
    "pool": "招募",
    "unlock_method": "武将招募同池随机获得；支持单招和五连。",
    "bind_rule": "仅进入玩家可装配战法槽；与武将招募同池产出，不写入hero_profiles[*].skills[0]。"
  },
  "unlock_hint": "在武将招募中随机获得；单招或五连均可能产出。",
  "compatible_troops": ["骑兵", "步兵", "弓兵"],
  "recommended_slot": "任意",
  "combat_role": "群体攻击输出",
  "tags": ["群体", "攻击伤害", "主动"]
}
```

`attribute_effects` 可用键：

| 键 | UI 文案 |
| --- | --- |
| `attack` 或 `force` | 攻击 |
| `defense` 或 `command` | 防御 |
| `strategy` 或 `intelligence` | 谋略 |
| `siege` 或 `charisma` | 攻城 |
| `speed` | 速度 |

`compatible_troops` 使用中文兵种数组，第一版只允许 `骑兵 / 步兵 / 弓兵`。这是“可装配战法支持哪些固定兵种”，不是兵种适性；不要填写其他额外兵种。`tags` 用于后续筛选与低代码检索，建议填 2 到 4 个固定短标签，例如 `开局 / 追击 / 恢复 / 破防`。

`recommended_slot` 第一版固定填写 `任意`。当前不做站位推荐，也不提前给玩家标准搭配；后续等真实玩家形成有效搭配后，再考虑是否开放 `前锋 / 中军 / 大营` 这类推荐口径。`combat_role` 继续保持中文短句，例如 `开局全队增益 / 后期谋略增伤 / 普攻连击追击`。

Godot `战法库` 页签当前是只读查看体验：按 `grade / type / compatible_troops / source.pool / tags` 筛选，支持搜索名称、描述、效果、来源、兵种和标签；来源按钮使用 `source.pool`，标签按钮继续使用固定短标签，并按当前筛选命中数量降序展示。筛选区下方会显示当前条件、来源命中 Top、标签命中 Top、搜索命中字段统计；搜索生效时，结果行会显示 `搜索命中：名称 / 标签 / 来源` 这类短句提示。搜索词、筛选项、排序项、来源/标签折叠状态只保存在当前 `shared_state.skill_library_ui_state`，搜索保持回车或“搜索”按钮刷新；不写入装备槽、不写后端，也不输出推荐搭配。

### 通用战法库自检口径

每轮扩充或调整 `general_skill_library_preview.json` 后，先做以下人工/脚本一致性检查：

1. `skills[]` 数量当前允许 `20-50`，第一版大库目标为 50 条，先保证字段完整和风格一致。
2. `id` 用 `lib_<品质>_<类型>_<英文短名>`，不得和武将主战法 `innate_<武将ID>` 混用。
3. S 级优先承载强机制，A 级承载稳定核心组件，B 级承载新手与低成本过渡。
4. 四类战法都要有覆盖：`指挥` 负责战前/回合开始，`主动` 负责行动时概率发动，`被动` 负责常驻/受击/条件触发，`追击` 负责普攻后追加。
5. 兵种覆盖要能被 UI 摘要读出：`compatible_troops` 不为空，且不要让某一个兵种长期缺席。
6. 文案必须数值化：发动率、伤害率/恢复率、持续回合、目标数量、属性百分比至少明确其中 2 项。
7. `source.pool / source.unlock_method / source.bind_rule` 都必须填写，避免后续策划不知道战法从哪里来、如何解锁、能装到哪里。
8. `recommended_slot` 固定为 `任意`，`combat_role` 只做短定位，不写入武将主战法，也不触发真实装备。

当前 `source.pool` 固定候选：

| 来源池 | 用途 |
| --- | --- |
| `招募` | 与武将同池产出；支持单招和五连，战法整体权重高于 S 级武将 |

第一版不再拆 `内政任务 / 战法研究 / 名将传承` 等独立来源。通用战法进入武将招募池，抽到后进入玩家可装配通用战法库；正式概率表后续由招募系统统一维护。

招募页只读预览会从 `general_profile_preview.json` 读取武将卡，从 `general_skill_library_preview.json` 读取战法卡。单招展示 1 格样例，五连展示 5 格混合样例；当前样例偏向战法卡，保证战法整体权重高于 S 级武将。该预览不消耗资源，不写 roster / reserve / 战法库存，也不代表正式概率。

当前 `recruit_probability_preview` 是前端概率草案，必须保持 `preview_only=true` 和 `no_inventory_write=true`。第一版权重为：战法卡 70%，武将卡 30%；S级武将 30%，S级战法 10%，A级战法 30%，B级战法 30%。当前没有普通武将卡，武将卡全部按 S 级武将处理。`item_type_weights` 与 `rarity_weights` 各自都必须合计 100。

第一版概率校验区间已经写入脚本：战法卡 65-75，武将卡 25-35；S级武将 25-35，S级战法 8-12，A级战法 25-35，B级战法 25-35。修改概率时不要只改文案，必须让 JSON 权重和校验区间同时自洽。

招募概率说明字段必须用中文短句填写：`single_draw_preview_note` 写单招口径，`five_draw_probability_note` 写五连口径，`display_notes` 写只读边界。`guarantee_preview.enabled` 在真实库存链和抽卡记录接入前固定为 `false`，只允许显示“保底未启用”，不能记录保底次数。

招募页展示时会先按“卡类权重 / 稀有度权重 / 保底状态”归组，再展开完整概率草案。策划填写时不要把分组当成推荐搭配或真实抽卡记录；它只帮助玩家读懂当前只读概率表。

`display_notes` 会直接生成“预览边界”摘要卡。建议固定三句：只用于 Godot 原生 UI 预览、不代表最终线上概率、不写入 roster/reserve/战法库存。不要在这里填写正式保底、正式库存或后端合同内容。

五连样例会按 `preview_kind` 自动拆成“武将卡 / 战法卡”分类摘要。这里不是推荐搭配，也不是正式出货记录，只用于说明同池预览里两类卡都可能出现。

卡池页只展示概率摘要，完整概率明细保留在结果页。填写概率字段时仍要保持 `item_type_weights` 和 `rarity_weights` 各自合计 100，因为结果页会完整读取这些字段。

招募页包含只读“说明”tab，集中解释同池入口、单招样例、五连样例、概率明细位置和预览边界。该页只读取现有字段，不代表新增抽卡动作、库存链或服务端合同。

`pool_depletion_preview` 只记录抽空口径：战法卡抽出后从可抽战法池移除；当可抽战法卡为空时，后续预览口径为 100% S级武将卡。当前不写库存，不删除静态配置，不接真实抽卡链。

当前 `tags` 固定候选：

| 类别 | 标签 |
| --- | --- |
| 成长阶段 | `新手 / 低成本 / 低兵力` |
| 战斗形态 | `开局 / 后发 / 准备 / 主动 / 普攻 / 追击 / 连击` |
| 伤害与控制 | `单体 / 群体 / 攻击伤害 / 谋略伤害 / 燃烧 / 破防 / 降速 / 控制 / 增伤` |
| 防守与续航 | `减伤 / 恢复 / 自保 / 抗控 / 主将保护` |
| 队伍与兵种 | `全队 / 骑兵 / 步兵 / 弓兵 / 速度` |

可复用校验入口：

```powershell
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONUTF8='1'
python godot-client/tools/validate_general_skill_library.py
```

机器可读报告：

```powershell
$env:PYTHONIOENCODING='utf-8'
$env:PYTHONUTF8='1'
python godot-client/tools/validate_general_skill_library.py --json
```

该入口只校验 Godot native UI 预览数据：通用战法字段、`id` 规则、品质/类型枚举、兵种兼容、固定 `任意` 装配位、收窄后的标签和来源边界、数值化文案，以及 27 名武将仍只保留 1 个 `innate_` 主战法。

Godot `GeneralPanel` 的 `战法库` 页签会按 `grade / type / compatible_troops / tags` 做只读筛选和查看；这里仍然不写装备结果，也不提供武将名推荐。

## 可复制 JSON 块

把下面内容复制到 `hero_profiles` 里，并把 `100000` 改成真实武将 ID。

```json
"100000": {
  "name": "武将名",
  "title": "称号",
  "faction": "曹魏",
  "card_type": "骑",
  "quality": "5-SP",
  "stars": 5,
  "red_stars": 0,
  "cost": 3.5,
  "troop_type": "cavalry",
  "attack_range": 2,
  "level": 1,
  "exp_current": 0,
  "exp_max": 10000,
  "soldier_current": 10000,
  "soldier_max": 10000,
  "stamina_current": 150,
  "stamina_max": 150,
  "attributes": {
    "force": 100,
    "command": 100,
    "intelligence": 100,
    "charisma": 20,
    "speed": 100
  },
  "growth": {
    "force": 1.0,
    "command": 1.0,
    "intelligence": 1.0,
    "charisma": 0.4,
    "speed": 1.0
  },
  "skills": [
    {
      "id": "innate_100000",
      "name": "武将主战法",
      "grade": "S",
      "type": "指挥",
      "level": 10,
      "description": "前3回合我军全体攻击+18%，谋略+18%。",
      "trigger": "第1回合战斗开始时发动，持续3回合。",
      "target": "我军全体3名武将",
      "effect": "攻击、谋略按基础属性结算加成。",
      "attribute_effects": {
        "attack": "+18%",
        "strategy": "+18%"
      },
      "source": {
        "kind": "hero_innate",
        "hero_id": "100000",
        "hero_name": "武将名",
        "bind_rule": "武将主战法，仅随武将存在，不进入玩家通用可装配库。"
      },
      "unlock_hint": "获得该武将后默认拥有；当前阶段不可拆出为玩家通用可装配战法。"
    }
  ],
  "allocation": {
    "free_points": 0,
    "active_scheme": "方案一"
  }
}
```

## 当前不建议填写的内容

- 不填配点推荐：UI 只展示当前方案和剩余点数，不再按参考游戏复刻推荐方向。
- 不填后端动作：洗点、确定、皮肤选择暂时都不写权威状态。
- 不填兵种适性：每名武将只有一个 `troop_type` 固定兵种，当前只允许 `cavalry / infantry / archer`。
- 不在 JSON 里写注释：JSON 注释会导致 Godot 解析失败。
