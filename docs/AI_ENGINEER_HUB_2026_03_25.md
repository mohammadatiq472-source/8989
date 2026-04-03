# AI Engineer Hub - 2026-03-26

Operational hub for all AI engineers.

## 1) Mandatory Common Context (all lanes)
Read before any task:
1. `AGENTS.md`
2. `docs/PROJECT_RUNTIME_BASELINE_2026_03_25.md`
3. `docs/MODULE_INDEX_2026_03_25_V2.md`
4. `docs/modules_v2/` target module card
5. `docs/AI_ENGINEER_ORG_2026_03_25.md`

## 2) Specialized Context Packs
| Lane | Must-read code/doc paths |
| --- | --- |
| AI-BE-EntryRuntime (M01) | `server/src/app.ts`, `server/src/bootstrap/`, `server/src/routes/http.ts` |
| AI-BE-RuleState (M02/M19) | `shared/domain/rules.ts`, `server/src/application/world/`, `server/src/infra/store/` |
| AI-Agent-Commander (M03) | `server/src/application/planning/`, `server/src/agents/commander/`, `server/src/infra/llm/` |
| AI-Agent-General (M04) | `server/src/agents/general/`, `server/src/routes/generalChat.ts` |
| AI-Agent-ReflectMemory (M05) | `server/src/agents/reflect/`, `server/src/agents/memory/` |
| AI-Agent-GovDiplo (M06/M07/M08) | `server/src/agents/commBus/`, `server/src/agents/court/`, `server/src/routes/diplomacy.ts`, `server/src/multiplayer/` |
| AI-BE-WorldMeta (M09/M13) | `server/src/application/map/`, `server/src/application/nation/`, `server/src/application/v2/` |
| AI-Platform-ModelGateway (M10/M12) | `server/src/application/ai/`, `server/src/ai-server.ts`, `server/src/mcp/` |
| AI-Platform-Observability (M11) | `server/src/routes/replay.ts`, `server/src/routes/observability.ts`, `server/src/ws/` |
| AI-Shared-Contracts (M14) | `shared/contracts/`, `shared/schemas/`, `shared/domain/` |
| AI-FE-CommandSurface (M15/M17) | `src/App.tsx`, `src/components/panels/`, `src/game/` |
| AI-FE-MapSurface (M16) | `src/components/pixi/`, `src/components/mapViewport.ts` |
| AI-QA-Gates (M18) | `server/src/evals/`, `server/evals/`, `server/tests/` |

## 3) Update Cadence (mandatory)
- On task start: write lane, module, scope in Work Log.
- On task end: write changed files and official validation results.
- Every Friday: backfill `Validation Snapshot` for touched module cards.
- If blocked > 4h: post blocker and support request in Message Board.

## 4) Skill Checkout Board
| Time | Lane ID | Skill | Why used | Outcome (EN) | 结果（中文） |
| --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD HH:mm | AI-xxx | skill-name | short reason | pass/fail + note | 中文一句话结论 |

## 5) Work Log (cross-lane visibility)
| Time | Lane ID | Module | Status | Changed Files | Validation | Result (EN) | 结果（中文） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD HH:mm | AI-xxx | Mxx | in-progress/done | path1,path2 | command + pass/fail | one-line outcome | 中文一句话结论 |
| 2026-03-26 21:17 | AI-FE-CommandSurface | M15/M17 | done | src/App.tsx,src/app/flows/tileActionPreview.ts,docs/modules_v2/M15.md | `npm run lint` PASS; `npm run build` PASS | Extracted tile action preview/path estimation flow out of App without API break | 将地图预览与路径估算纯逻辑拆出 App，lint/build 已通过 |
| 2026-03-26 21:19 | AI-FE-MapSurface | M16 | done | src/components/pixi/PixiMapBoard.tsx,src/components/pixi/PixiMapBoardLayers.ts,src/components/pixi/PixiMapBoardViewport.ts,src/components/pixi/PixiMapBoardInteraction.ts,src/components/pixi/PixiMapBoardAnimation.ts,docs/modules_v2/M16.md | `npm run lint` PASS; `npm run build` PASS | Split PixiMapBoard into focused submodules while preserving the existing Pixi entrypoint | 已将 PixiMapBoard 拆分为渲染/视口/交互/动画子模块，并通过 lint/build 验证 |
| 2026-03-26 21:58 | AI-BE-RuleState | M02/M19 | done | server/src/application/world/WorldService.ts,server/src/application/world/persistence/worldPersistence.ts,docs/AI_ENGINEER_HUB_2026_03_25.md | `npm run lint` FAIL (pre-existing parse errors in `shared/contracts/game/*.ts`); `npm run build` FAIL (same pre-existing parse errors); `npm run test:world:mutation-lock` PASS | Extracted world persistence and narrative storage into a dedicated module while keeping the WorldService facade intact | 已将世界持久化与叙事存储抽到独立模块，WorldService 兼容层保留；mutation-lock 测试通过，但 lint/build 被仓库既有的 shared contracts 语法问题阻断 |

| 2026-03-26 22:03 | AI-Shared-Contracts | M14 | done | shared/contracts/game.ts,shared/contracts/game/common.ts,shared/contracts/game/planning.ts,shared/contracts/game/history.ts,shared/contracts/game/ai.ts,shared/contracts/game/meta.ts,shared/contracts/game/world.ts,docs/modules_v2/M14.md | `npm run lint` PASS; `npm run build` PASS | Completed contract domain split with facade re-export, no API break | 已完成契约分域拆分并保留 facade 兼容出口，lint/build 通过 |
| 2026-03-26 22:09 | AI-QA-Gates | M18 (cross M02/M14/M15/M16) | done | docs/modules_v2/M02.md,docs/modules_v2/M18.md,docs/AI_ENGINEER_HUB_2026_03_25.md | `npm run lint` PASS; `npm run build` PASS; `npm run test:world:mutation-lock` PASS; `npm run eval:planning:offline` PASS; `npm run eval:orchestrator:stress` PASS; `npm run gate:phase5:hardening` PASS | Gate re-validation passed after wave-2 splits | 二次拆分后门禁复验通过 |
## 6) Message Board (handoff / assist needed)
| Time | From | To | Topic | Watchouts | Needed Support |
| --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD HH:mm | lane-id | lane-id/all | short title | dependency/risk | concrete ask |

## 7) Conflict Resolution Rule
- Contract/schema conflicts (M14) override lane-local assumptions.
- Rule-engine constraints (M02) override agent proposal logic.
- Final arbitration record: corresponding `docs/modules_v2/Mxx.md` card.

## 8) Sub-Agent Prompt Templates
- `docs/AI_SUBAGENT_LAUNCH_PROMPTS_2026_03_26.md`

