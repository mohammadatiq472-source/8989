# Planner / Replay-RAG / GraphRAG 提示词规范与工程任务分配

> Tag: `reference-only`（低频历史文档，默认不进最小上下文；仅在追溯/对账时按需读取。）


版本：v1
作者：自动生成

---

## 目标与适用场景
- 目的：为 `CommanderAgent` / Planner 提供可复用的提示词模板与检索注入规范（Replay-RAG），并定义代码知识图谱（GraphRAG）的小规模试点方案。使模型产出可被系统化解析、校验并直接入队执行，便于前端展示“为何如此”的解释卡片。适用于后端/AI/前端工程师。
- 场景：玩家提交高层战略命令 -> 后端裁剪世界快照并检索相关 replay/code snippet -> 调用 LLM 生成结构化 `StrategicPlan` -> 后端校验/guard -> 计划入队执行并生成回放/战报。

---

## 一、调用前必须提供的结构化上下文
（后端在调用 LLM 前必须裁剪并注入下列字段，或通过检索注入 top-K snippet）

- `worldSnapshot`（简化）：{ tick, worldVersion, map: { regions, tiles, connections }, units, alliance.directives, history.executionReplays（仅最近 N 条摘要） }
- `availableUnits`：[{ id, tileId, available, status, strength, supply }]
- `frontlineRisk`：{ score, tier, hotspots[] }
- `recentReplays`（检索结果，top-K）：[{ requestId, createdTick, outcome, intent, priority, orderCount, shortSummary, excerpt }]
- `doctrineSnippets`：[{ id, title, preferredActions, summary }]
- `allowedActions`：例如 `['march','garrison','recon','support','capture']`
- 玩家高层指令文本（Command）

提示：prompt 注入体积受限，检索 snippet 每条不超过 600 字，总注入建议 ≤ 6k 字。

---

## 二、模型输出格式（必须严格）
LLM 必须只输出可解析的 JSON（或包裹在 ```json ``` 内），主 schema 对应 `StrategicPlan`：

```json
{
  "intent": "短语式目标",
  "priority": "high|medium|low",
  "orders": [
    { "unitId": "u-123", "action": "march|garrison|recon|support|capture", "target": "tile-456" }
  ],
  "constraints": ["..."],
  "reviewAfterTicks": 2
}
```

可选字段（便于前端解释）：
- `explanation` / `note`（短句），`planningRationale`（字符串数组），`rawText`（原生模型输出）

后端校验规则（必须）：
- orders 数量 ≤ 8
- 每个 `unitId` 必须出现在 `availableUnits` 且 `available === true`
- `target` 必须为存在的 tile id
- `action` 属于 `allowedActions`
- 不允许重复使用同一 `unitId`
- `reviewAfterTicks` 范围 1-6

---

## 三、Planner（CommanderAgent）提示词模板

System（固定）示例：
```
You are CommanderAgent's structured planning module. Produce a conservative, executable strategic plan in JSON that follows the schema exactly. If intelligence is insufficient, prefer recon. Only return JSON.
```

User 模板（占位）：
```
Context: [WORLD_SNAPSHOT_JSON]
AvailableUnits: [AVAILABLE_UNITS_JSON]
FrontlineRisk: [FRONTLINE_RISK_SUMMARY]
RecentMemoryRetrievals: [RETRIEVAL_ARRAY]
DoctrineCandidates: [DOCTRINE_SNIPPETS]
Command: "玩家高层命令文本"
Constraints: [optional constraints]

Instructions:
1) Output JSON with fields: intent, priority, orders, constraints, reviewAfterTicks.
2) Orders <= 8; ensure unitId available and target exists.
3) If intelligence is insufficient, prioritize recon orders.
4) For each retrieved replay, add one-line influence to planningRationale.
5) Only return valid JSON.
```

示例输入/输出（简短）：
- 输入 Command: "稳守东线并侦察北部高敌压区域，优先保护粮道"
- 输出（示例）：
```json
{ "intent":"稳守东线并侦察北部", "priority":"high", "orders":[{"unitId":"u-12","action":"garrison","target":"tile-201"},{"unitId":"u-7","action":"recon","target":"tile-101"}], "constraints":["no-expansion"], "reviewAfterTicks":2, "explanation":"...", "planningRationale":["基于 recent replay r-45 显示东线断粮风险提升..."] }
```

---

## 四、Replay-RAG 检索注入规范（优先实现）

检索返回格式（Top-K）：
```
[
  { "requestId":"r-45", "createdTick":120, "outcome":"failed", "intent":"防守洛阳", "priority":"high", "orderCount":6, "shortSummary":"东线补给被切断导致回撤", "excerpt":"...最多200字...", "score":0.78 }
]
```

注入策略：
- 在 prompt 中以段落插入 "RECENT REPLAYS (top 3):"，列出每条 `shortSummary` + `excerpt`（每条 ≤ 600 字）。
- 要求模型在 `planningRationale` 中对每条检索到的 replay 给出一句“影响说明”。
- 检索 Query = 玩家命令摘要 + 当前战区 id + 最近 N tick 的战斗关键词。
- topK 默认 3，可配置；按语义相关度混合时间衰减排序。

---

## 五、GraphRAG（代码知识图谱）规范（后置试点）

用途：当 Planner 需要引用后端合约、rules 实现或 `CommanderAgent` 逻辑时使用。

索引/分块规则：
- chunk 大小 800-1200 字符，重叠 128-256 字符。
- metadata：{ file_path, repo_tag, language, start_line, end_line, symbols }
- 对大型文件按函数/类级别 chunk。优先索引 `shared/contracts/*`、`shared/domain/*`、`server/src/agents/*`。

检索返回结构：
```
{ "file_path":"server/src/agents/commander/CommanderAgent.ts", "start_line":120, "end_line":210, "snippet":"...", "symbols":["createCommanderPlan"], "score":0.83 }
```

注入要求：当引用代码 snippet 时，模型必须在答案中附上 `file_path` 与行号范围。

注意：GraphRAG 增加复杂度，先做小规模试点。

---

## 六、Embedding / VectorStore 建议
- Embedding：先用 OpenAI embeddings；如需离线可选本地 embedding 模型。
- Vector DB：优先 `Postgres + pgvector`（如已有 Postgres），或 `RedisVector`。
- chunk overlap 128 tokens，topK 3-5。
- 最少存储 metadata：requestId/file_path, createdTick, outcome/score, sourceType, shortSummary。

---

## 七、验证与验收测试（工程师须提交）
核心验收条件：
1. 输出 JSON 能被 `parsePlannerResult`（`shared/schemas/planning.ts`）解析。
2. 通过 `CommanderAgent.guardPlan` 后不出现完全空 orders（或含 fallback recon）。
3. 当进行压力测试（批量调用）时，fallback 比率 < 10%（可调）。
4. median latency 可接受（本地模型 < 2s，gateway 视网络，建议 < 6s）。
5. 每个 plan 包含 ≥1 条 `planningRationale` 并可引用 0-3 条检索 snippet。

建议自动化测试：
- `server/tests/planner_prompt.test.ts`：多组 fixture（worldSnapshot + command），验证 parse 与 guard
- 性能测试脚本：批量调用 `/api/planning/create`（mode: mock/local/gateway）并记录 metrics

---

## 八、交付物清单（工程师交付）
- `docs/archive/prompts/planner.prompt.md`（system + user 模板 + few-shot 示例）
- `docs/prompts/replay_rag.prompt.md`（检索注入样例）
- `docs/prompts/graph_rag.prompt.md`（代码索引规则、示例）
- `docs/prompts/examples/` 下至少 6 个 input->expected_output JSON 用例
- 索引脚本：`scripts/index_replays.ts`
- 检索 API：`server/src/infra/rag/retrieveReplays.ts`
- 测试：`server/tests/planner_prompt.test.ts`

---

## 九、注意事项与最佳实践
- 前端绝不直接请求模型或 embeddings（所有模型调用通过后端 `PlanningService` 与 `ModelGatewayAdapter`）。
- Prompt 不要把整个 world 原文注入；先摘要或 rely on retrieval。
- 强制机器可解析输出（JSON）；后端仍需二次校验。
- 日志与 metrics（tokens/latency/cost）必须随 planning 返回并持久化（见 `PlannerMetrics`）。
- 优先实现 Replay-RAG，小规模 GraphRAG 作为后续扩展。

---

## 十、任务分工（已分配：AI / 后端 / 前端）

### AI 工程师（负责：模型 / 检索 / prompt tuning）
- 任务：实现 Replay-RAG 原型（embeddings、索引、检索），并把检索结果注入 `CommanderAgent` 的 prompt。交付：
  - `scripts/index_replays.ts`（replay -> vector DB）
  - 检索服务 `server/src/infra/rag/retrieveReplays.ts`（topK, metadata）
  - 更新 `CommanderAgent` 调用逻辑（在 `createCommanderPlan` 中注入 `recentReplays`）
  - prompt 模板文件 `docs/archive/prompts/planner.prompt.md`
  - 单元/集成测试（`server/tests/planner_prompt.test.ts`）
- 验收：模型输出能被解析并包含 `planningRationale`，检索命中提升输出稳定性。

### 后端工程师（负责：API / persistence / infra）
- 任务：持久化 replay、提供向量检索后端、保证 `/api/planning/create` 的稳定与 metrics。交付：
  - replay 持久化迁移脚本（Postgres schema 或 `replay_archives` 表）
  - 向量 DB 集成（`pgvector` 或 `RedisVector`）与配置示例
  - 检索 API `server/src/infra/rag/retrieveReplays.ts`
  - 在 `PlanningService` 中接入检索调用并把结果传入 `createCommanderPlan`
  - Metrics 与 tracing 改进（tokens/latency/cost/failureCategory）
- 验收：检索 API 可在 <100ms（本地 vector DB）返回 topK；`/api/planning/create` 能持久化 metrics 与 replay archive

### 前端工程师（负责：展示 / 可解释性 / UX）
- 任务：把 `planningRationale` / `explanation` 等字段可读化，增加“为何如此”卡片与回放检索展示。交付：
  - 前端 UI 卡片：计划解释卡（展示 `planningRationale`、被引用的 replay snippet metadata）
  - 回放列表分页/窗口化改进（`/api/replay/archive`）
  - 地图上高亮被检索到的 hotspot 或引用的 region
  - 确保前端不本地修改 authoritative `world`
- 验收：演示流程中用户能看到“为何如此”的解释卡并点击跳转到 replay 详情

---

## 附录：快速开始建议（工程师）
1. AI：先实现 `scripts/index_replays.ts`，把最近 N 条 replay 写入 vector DB（pgvector 示例优先）。
2. 后端：在 dev 环境创建 `pgvector` 扩展，准备示例 env 变量：`VECTOR_DB_URL`, `EMBEDDING_MODEL`。
3. 前端：在 UI 中把 `planningResult.explanation` 与 `planningResult.planningRationale` 加入指挥台卡片，先用 mock 数据驱动。

---

如果需要，我可以把每个交付物的初始模板（包括 `scripts/index_replays.ts`、`server/src/infra/rag/retrieveReplays.ts` 的骨架和 `server/tests/planner_prompt.test.ts` 的初版）一起提交 PR。

### ??????? LLM ???
- Gateway ???openai_compat??
- ?????`LLM_RELAY_URL` `LLM_RELAY_API_KEYS`?? `OPENAI_API_KEY`?`LLM_RELAY_MODEL`????
- ???`LLM_RELAY_URL=http://216.40.86.55:3100` `LLM_RELAY_MODEL=openrouter/healer-alpha`
- ???`npm run eval:orchestrator:stress -- --player-agents 12 --enemy-agents 12 --concurrency 6 --batch-size 4 --mode gateway --model openrouter/healer-alpha`
- Local ???openai_compat??
- ?????`LOCAL_MODEL_ENDPOINT` `LOCAL_MODEL_NAME`????
- ???`npm run eval:orchestrator:stress -- --player-agents 12 --enemy-agents 12 --concurrency 6 --batch-size 4 --mode local --model qwen3.5-2b-q4_k_m`

