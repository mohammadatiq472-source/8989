# Recruit Real Draw Backend Handoff

日期：2026-04-29

## 目标

招募页最终要接真实抽卡系统。Godot 侧只发起请求和展示结果；后端必须持有随机、消耗、库存、去重、保底与回执 authority。

## 建议接口

```text
POST /api/v2/recruit/draw
```

请求字段：

```json
{
  "factionId": "player_faction_id",
  "poolId": "pool_famous",
  "drawCount": 1,
  "clientRequestId": "uuid"
}
```

`drawCount` 第一版只允许 `1` 或 `5`。

响应字段：

```json
{
  "ok": true,
  "receiptId": "recruit_receipt_id",
  "poolId": "pool_famous",
  "drawCount": 5,
  "cost": [{"currency": "copper", "amount": 200000}],
  "results": [
    {
      "resultId": "result_id",
      "kind": "hero",
      "heroId": "100451",
      "quality": "S",
      "name": "吕蒙",
      "duplicate": false
    }
  ],
  "stateAfter": {
    "jade": 935,
    "copper": 44881,
    "ticket": 37,
    "heroCardCount": 83,
    "heroCardCapacity": 300,
    "skillCardCount": 18,
    "guaranteeProgress": 5
  }
}
```

## 后端必须负责

1. 校验 `poolId` 是否开放、`drawCount` 是否允许、资源是否足够、武将卡容量是否足够。
2. 使用服务端随机，禁止客户端提交结果。
3. 按卡池表抽取 `hero_s / skill_s / skill_a / skill_b`，不得恢复普通武将权重。
4. 保持武将自带战法与通用战法边界：
   - 武将主战法只来自武将资料。
   - 通用战法只来自通用战法库。
5. 通用战法抽出后进入玩家库存，若规则要求唯一战法，则从可抽战法池移除。
6. 当可抽通用战法池为空时，后续抽取自然变成 100% S 级武将卡。
7. 写入库存、资源扣减、保底进度、最近结果与可审计回执。
8. 支持 `clientRequestId` 幂等，防止五连请求超时后重复扣费。

## 错误码建议

后端返回 `ok=false` 时，建议保持稳定 `code`，Godot 只按 code 展示，不解析自然语言：

| code | 场景 | Godot 展示 |
| --- | --- | --- |
| `pool_closed` | 卡池未开放或赛季结束 | 卡池暂未开放 |
| `invalid_draw_count` | `drawCount` 不是 1 或 5 | 招募次数异常 |
| `insufficient_resource` | 铜钱、玉或招募券不足 | 资源不足，显示缺少资源 |
| `hero_card_capacity_full` | 武将卡容量不足 | 武将卡已满 |
| `skill_card_capacity_full` | 战法卡容量不足 | 战法卡已满 |
| `duplicate_request` | `clientRequestId` 已处理 | 展示原回执，不重复扣费 |
| `pool_depleted` | 卡池无可抽内容且未定义兜底 | 卡池已抽空 |
| `server_busy` | 招募写链或库存锁繁忙 | 稍后重试 |

错误响应建议：

```json
{
  "ok": false,
  "code": "insufficient_resource",
  "message": "copper is not enough",
  "poolId": "pool_famous",
  "drawCount": 5,
  "clientRequestId": "uuid",
  "required": [{"currency": "copper", "amount": 200000}],
  "current": [{"currency": "copper", "amount": 44881}],
  "stateAfter": {
    "jade": 935,
    "copper": 44881,
    "ticket": 37,
    "heroCardCount": 82,
    "heroCardCapacity": 300
  }
}
```

## Godot 展示映射

隔离组件当前预留 `RecruitBackendStatePreview`，用于展示后端回执状态位：

1. 成功：显示 `receiptId`、抽取结果、扣费、`stateAfter`。
2. 资源不足：按钮保持可见但提示缺少资源，不做本地扣减。
3. 容量不足：提示武将卡或战法卡容量不足，保留跳转背包/整理入口的位置。
4. 重复请求：展示原始 `receiptId` 与结果，明确没有重复扣费。
5. 服务繁忙：保留当前卡包展开状态，提示稍后重试。

Godot 不应该在本地推导抽取结果，也不应该在失败时自行修改资源或库存。

## Godot 侧需要的数据

招募页打开时需要一份只读状态：

```json
{
  "resources": {"jade": 935, "copper": 44881, "ticket": 37, "skillExp": 17588},
  "heroCard": {"count": 82, "capacity": 300},
  "pools": [
    {
      "poolId": "pool_famous",
      "title": "名将",
      "subtitle": "5星",
      "singleCost": [{"currency": "copper", "amount": 40000}],
      "fiveCost": [{"currency": "copper", "amount": 200000}],
      "canDrawSingle": true,
      "canDrawFive": false,
      "remainingSingleDraws": 1,
      "probabilitySummary": [
        {"label": "S级武将", "value": "30%"},
        {"label": "S级战法", "value": "10%"},
        {"label": "A级战法", "value": "30%"},
        {"label": "B级战法", "value": "30%"}
      ]
    }
  ],
  "lastResults": []
}
```

## 本目录当前不做

- 不实现后端接口。
- 不写玩家库存。
- 不做真实随机。
- 不做概率最终数值平衡。
- 不导入卡包美术。
