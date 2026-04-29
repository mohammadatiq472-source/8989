# AI 玩家地图可视化表达草案 2026-04-27

## 定位

- 本文只定义真人玩家与 AI 玩家在地图上的视觉合同草案，不修改 world-cell / pass / fort / dock 渲染。
- 地图层表达的核心是“谁控制、谁在行动、接下来想做什么、资源归属与收益流向”。
- 正式实现前先消费后端合同字段，避免 UI 自己猜测 AI 状态或本地改世界。

## 地图图层

| 图层 | 真人玩家表达 | AI 玩家表达 | 需要的合同字段 |
| --- | --- | --- | --- |
| 势力归属 | 地块边缘主色、势力旗标 | 同一势力色内加 AI 细边或角标，不覆盖资源/建筑主图 | `tile.owner`、`factionId`、`aiPlayerId` |
| 部队 | 部队模型、武将头像、兵力条 | 部队名牌旁显示 AI 名称短标，受管部队加小徽标 | `unit.id`、`unit.aiPlayerId`、`unit.faction`、`unit.strength`、`unit.supply` |
| 行动意图 | 玩家手动选中后显示路径/目标 | proposal pending 时显示虚线箭头或目标环，approved/executing 加亮 | `proposal.action`、`proposal.args`、`proposal.status`、`worldActionPayload` |
| 资源占领 | 资源地保留四类资源图标 | 已由 AI 占有/采集的资源地显示 AI 子账户角标 | `tile.resourceKind`、`tile.resourceLevel`、`aiResourceGatherClaims` |
| 回执结果 | 成功/失败 toast 与聊天回执 | AI 行动完成后在目标地块短暂显示成功/失败状态 | `receipt.ok`、`receipt.failureCode`、`receipt.worldActionPayload` |

## 行动意图状态

- `pending_approval`：目标地块显示细黄环，路径用低透明虚线，表示等待总督批准。
- `approved`：目标地块显示蓝白呼吸环，表示后端可执行。
- `executed`：目标地块短暂显示绿色完成提示，并同步聊天 receipt。
- `failed`：目标地块显示红色短闪，点击后打开失败原因和下一步。

## 四类资源

- 粮草：保留现有粮田/农田资源图，不用纯文字替代。
- 木材：保留木场资源图，AI 采集后加“AI 子账户”角标。
- 石料：保留石矿资源图，显示资源等级和归属。
- 铁矿：保留铁矿资源图，显示资源等级和归属。

## 最小玩家路径

1. 真人在主界面 AI 聊天频道下令。
2. AI 生成 proposal，地图上出现行动意图。
3. 真人点地图意图或聊天提案，看到“资源 / 目标 / 风险 / 批准后结果”四块。
4. 批准执行后，后端 WorldService/rules 写 world 与 receipt。
5. 地图状态更新，聊天流写入回执；失败时给玩家下一步。

## 边界

- 本草案不是 world-cell 视觉调参，不处理 pass/fort/dock 截图。
- 不在 AI 管理页放通用收件箱。
- 不让模型直接控制地图状态；模型只输出 JSON proposal，地图只展示后端合同和 receipt。
