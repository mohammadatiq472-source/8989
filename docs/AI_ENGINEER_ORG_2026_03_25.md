# AI Engineer Organization Matrix (EN Primary + 中文辅助) - 2026-03-26

This is the active 13-lane ownership map.
English lane IDs are the machine-readable source of truth.

## Engineer Topology (13 lanes)

| Lane ID (EN) | 中文简称 | Owned Modules | Scope (EN) | 中文职责说明 |
| --- | --- | --- | --- | --- |
| AI-BE-EntryRuntime | 后端入口运行 | M01 | Runtime bootstrap and HTTP ingress stability | 负责启动和路由入口稳定。 |
| AI-BE-RuleState | 规则状态内核 | M02, M19 | Authoritative rules and persistence consistency | 负责规则裁决与持久化一致性。 |
| AI-Agent-Commander | 指挥规划智能体 | M03 | Commander planning lifecycle and guard quality | 负责 Commander 规划链路和 Guard 质量。 |
| AI-Agent-General | 将领行为智能体 | M04 | General behavior/chat/profile coherence | 负责将领行为、聊天与档案一致。 |
| AI-Agent-ReflectMemory | 复盘记忆智能体 | M05 | Reflect closure and memory write/read quality | 负责 Reflect 闭环、记忆写入召回质量。 |
| AI-Agent-GovDiplo | 治理外交智能体 | M06, M07, M08 | Governance, diplomacy, autonomy policy | 负责治理流程、外交协商、L1/L2 自主约束。 |
| AI-BE-WorldMeta | 世界元数据后端 | M09, M13 | Nation/map meta and V2 gameplay data | 负责地图和国家元数据与 V2 后端投影。 |
| AI-Platform-ModelGateway | 模型网关平台 | M10, M12 | Model gateway and MCP integration boundary | 负责模型中转层与 MCP 集成边界。 |
| AI-Platform-Observability | 可观测平台 | M11 | Replay/event/ws observability and incident trace | 负责回放、事件流与故障追踪。 |
| AI-Shared-Contracts | 共享契约 | M14 | Shared contracts/schemas/domain ABI | 负责前后端共享契约与 schema 一致。 |
| AI-FE-CommandSurface | 指挥界面前端 | M15, M17 | Command UI and frontend domain mirror | 负责指挥台交互与前端领域镜像。 |
| AI-FE-MapSurface | 地图渲染前端 | M16 | Pixi map rendering and viewport performance | 负责 Pixi 地图渲染和视口性能。 |
| AI-QA-Gates | 质量门禁验收 | M18 (+ cross-module) | Formal eval/gate and cross-module acceptance | 负责正式入口验收与最终 PASS/FAIL 裁定。 |

## Result Writing Standard (结果书写规范)
- Lane ID / Module ID must be English (machine-readable).
- Completion result must include Chinese summary for human review.
- Recommended output format per task:
  - `Result (EN):` one-line technical outcome
  - `结果（中文）:` 一句话中文结论
  - `Validation:` official entrypoint + pass/fail

## Operating Rules
- Every task must carry one primary module ID and one owner lane.
- Cross-module changes require impacted lane co-review.
- Module cards in `docs/modules_v2/` are canonical handoff docs.
- Weekly mandatory backfill: formal-entry results to module cards.

## Source of Truth
- Runtime baseline: `docs/PROJECT_RUNTIME_BASELINE_2026_03_25.md`
- Collaboration hub: `docs/AI_ENGINEER_HUB_2026_03_25.md`
- Module index: `docs/MODULE_INDEX_2026_03_25_V2.md`
- Module cards: `docs/modules_v2/M01.md` ... `M19.md`
