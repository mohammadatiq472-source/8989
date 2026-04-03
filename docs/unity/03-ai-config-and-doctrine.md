# Unity 侧 AI 配置接口与 Doctrine 生效链路

## 目标

本页只描述 Unity 侧的 AI 配置入口，以及 `doctrine / model` 如何在后端生效。
当前阶段，Unity 侧只允许人类控制 `faction=player`，因此所有正式配置都应落到 `player` 这一个势力上。

## 官方入口

- `GET /api/ai/config?factionId=player`
- `POST /api/ai/config`
- `GET /api/ai/models`
- `GET /api/session/runtime`

## 数据契约

### GET /api/ai/config

返回当前势力的 AI Hub 配置。

```ts
type AiConfigResponse = {
  config: {
    automationEnabled: boolean
    plannerFrequency: number
    riskPreference: 'conservative' | 'balanced' | 'aggressive'
    doctrinePrompt: string
    models: {
      commander: string
      general: string
      unit: string
    }
  }
  updatedAt: string
  factionId: string
}
```

### POST /api/ai/config

提交整套 AI Hub 配置。

```ts
type AiConfigUpdateRequest = {
  factionId?: string
  config: {
    automationEnabled: boolean
    plannerFrequency: number
    riskPreference: 'conservative' | 'balanced' | 'aggressive'
    doctrinePrompt: string
    models: {
      commander: string
      general: string
      unit: string
    }
  }
}
```

## 生效链路

### 1. Unity 发起保存

Unity 侧配置页提交 `POST /api/ai/config`。

### 2. 路由层解析 faction

`server/src/routes/ai.ts`

- `factionId` 经过归一化
- 缺省或非法值都会回落到 `player`
- 当前实现没有给 Unity 配置页开放“编辑其他势力”的正式路径

### 3. AI Hub 配置写入内存态

`server/src/application/ai/AiConfigService.ts`

- `updateAiHubConfig(config, factionId)` 更新该势力的 AI Hub 配置
- `getAiHubConfig(factionId)` 返回读取态
- `factionId` 不存在时，默认读取 `player`

### 4. Doctrine 和模型配置同步落库到 faction store

`server/src/routes/ai.ts` 保存时会同时执行：

1. `setFactionDoctrine(factionId, doctrinePrompt)`
2. `setFactionModelConfig(factionId, ...)`

这意味着：

- `doctrinePrompt` 是该势力的战术方针输入
- `models.commander / general / unit` 是该势力的角色模型配置
- 一次保存会同时影响 doctrine 和 model 两条链路

### 5. Doctrine 被后续规划读取

`server/src/application/clock/GameClock.ts`

- `getDefaultStrategy(factionId)` 读取 `getFactionDoctrine(factionId)`
- `CommanderAgent` 的规划上下文最终会受到该 doctrine 影响
- 当 `factionModel` 存在时，规划配置会优先使用该势力的 `commanderModel`

### 6. Model 优先级

后端当前的实际优先级是：

1. `factionModel.commanderModel`
2. `factionModel.model`
3. 服务器默认模型配置
4. mock fallback

## `faction=player` 约束

Unity-first 阶段的约束很明确：

- 人类控制只允许 `player`
- `/api/session/join` 会拒绝非 `player` 的人类接入
- `/api/ai/config` 虽然支持 `factionId` 参数，但 Unity 正式配置页应只传 `player`
- 这保证了 UI、会话和 AI 配置都围绕同一个人类主势力工作

### 约束含义

- 不要让 Unity UI 暴露“切换到敌方势力配置”的入口
- 不要把非 `player` 的配置当作正式人类操作路径
- 如果未来要支持多势力托管，需要单独设计权限和界面，不要复用当前 `player` 路径

## 读取时的联动展示建议

Unity 侧展示配置时，建议同时读取：

- `GET /api/ai/config?factionId=player`：显示当前 AI Hub 配置
- `GET /api/session/runtime`：显示 doctrine preview、模型是否已配置、当前自治等级
- `GET /api/ai/models`：拉取可选模型列表，供 commander/general/unit 三档选择

## 验证命令

### 1. 启动后端

```powershell
npm run start
```

如需验证 Tick 推进后 doctrine/model 参与规划的完整链路，再用：

```powershell
npm run start:clock
```

### 2. 写入 player 配置

```powershell
$body = @{
  factionId = 'player'
  config = @{
    automationEnabled = $true
    plannerFrequency = 2
    riskPreference = 'balanced'
    doctrinePrompt = 'Protect passes first, then expand.'
    models = @{
      commander = 'qwen/qwen3.5-flash-02-23'
      general = 'qwen/qwen3.5-flash-02-23'
      unit = 'qwen/qwen3.5-flash-02-23'
    }
  }
} | ConvertTo-Json -Depth 6

curl.exe -s -X POST "http://127.0.0.1:8787/api/ai/config" `
  -H "Content-Type: application/json" `
  --data-binary $body
```

### 3. 读取回显并检查生效

```powershell
curl.exe -s "http://127.0.0.1:8787/api/ai/config?factionId=player"
curl.exe -s "http://127.0.0.1:8787/api/session/runtime"
```

### 4. 验证非 player 接入被拒绝

```powershell
curl.exe -s -X POST "http://127.0.0.1:8787/api/session/join" `
  -H "Content-Type: application/json" `
  --data-binary '{"factionId":"enemy","playerName":"Tester"}'
```

预期结果：

- 第 2 步返回 `200`
- 第 3 步能看到 `player` 的 doctrine / model 配置
- 第 4 步返回 `403`

## 结论

当前 Unity 侧 AI 配置不是单独的“模型设置页”，而是 `player` 势力的治理入口。
一次保存同时更新 doctrine 和模型配置，后续规划链路会直接消费这些值。
