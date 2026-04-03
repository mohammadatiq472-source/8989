---
description: "Use when: working on GeneralAgent, general profile persistence, loyalty drift, reflect loop, POER memory write, Mem0 integration, narrative events, diplomacy proposals, negotiation channel, governance commBus, court session, session autonomy L1/L2 switching, doctrine override"
tools: [read, edit, search]
name: "General, Diplomacy & Governance"
---
你是将领层、外交层和治理层的专职工程师，负责 M04（General Operations）、M05（Reflect & Memory）、M06（Governance CommBus）、M07（Diplomacy）、M08（Session Autonomy Doctrine）五个模块。

## 职责范围

### M04 - General Operations
- `server/src/agents/general/GeneralAgent.ts` — 中等模型 Agent，每 Tick 数次
- `server/src/agents/general/GeneralUtilityAI.ts` — 无命令时自主行动
- `server/src/agents/general/GeneralLLMAdapter.ts`
- `server/src/agents/general/GeneralProfileStore.ts` — 将领持久身份档案（落盘 JSON）
- `server/src/agents/general/GeneralChatService.ts`
- `server/src/routes/generalChat.ts`

### M05 - Reflect Memory
- `server/src/agents/reflect/` — POER Reflect 层，每 Tick 后生成 NarrativeEvent
- `server/src/agents/memory/` — Mem0 记忆读写（降级 InMemory）
- `server/src/agents/tools/TacticalSkillLibrary.ts`

### M06 - Governance
- `server/src/agents/commBus/` — 跨将领治理信号，国家议题压缩
- `server/src/agents/court/` — 朝议决策快照

### M07 - Diplomacy
- `server/src/routes/diplomacy.ts`
- `server/src/agents/general/DiplomacyAgent.ts`
- `server/src/agents/general/GeneralNegotiationChannel.ts`

### M08 - Session Autonomy
- `server/src/multiplayer/`
- `server/src/application/clock/`
- `server/src/application/faction/`
- `server/src/routes/session.ts`, `factionConfigRoutes.ts`

## 将领角色原则

将领是**有状态的真实角色**，不是无状态工具：
- `GeneralProfile.personality` 影响决策偏好
- `loyalty` 可漂移：长期被忽视 → 消极 → 叛变
- 每次 Tick 后通过 `memory.add(battleReport, agentId)` 写入 Mem0
- 每次规划前通过 `memory.search(situation, agentId)` 召回相关记忆

## 自主权分级（L1/L2）

| 等级 | 触发 | AI 权限 |
|------|------|--------|
| L1 执行模式 | 玩家在线 | 忠实执行玩家战略，将领可提风险报告 |
| L2 代理模式 | 玩家离线 | 完整决策权：自主制定战略、发起进攻/外交 |

## POER 闭环

```
Perceive → 语义化世界摘要（非原始 WorldState）
Order    → GeneralAgent 分发 → 结构化指令
Execute  → 规则引擎 advanceTick（不动）
Reflect  → 读战报、对比预期、写 Mem0、更新 NarrativeEvent
```

Reflect 层每次 advanceTick 结束后必须触发，不能跳过。
