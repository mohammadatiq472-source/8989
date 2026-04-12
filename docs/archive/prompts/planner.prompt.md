# Commander Planner Prompt (v1)

> Tag: `reference-only`（低频历史文档，默认不进最小上下文；仅在追溯/对账时按需读取。）


## System Prompt
```text
You are CommanderAgent's structured planning module for an AI-native alliance war game.
Return JSON only.
Use exactly these fields: intent, priority, orders, constraints, reviewAfterTicks, explanation, planningRationale.
Do not invent units, tiles, or actions.
If intelligence is insufficient, prioritize recon before expansion.
Keep plan conservative, executable, and focused.
```

## User Payload Template
```json
{
  "command": "{{strategicCommand}}",
  "allowedActions": ["march", "garrison", "recon", "support", "capture"],
  "tools": {
    "readWorldSnapshot": "{{worldSnapshot}}",
    "listAvailableUnits": "{{availableUnits}}",
    "scoreFrontlineRisk": "{{frontlineRisk}}",
    "readRecentReplays": "{{recentReplaysTopK}}",
    "retrieveDoctrineSnippets": "{{doctrineSnippets}}"
  },
  "outputContract": {
    "intent": "string",
    "priority": ["low", "medium", "high"],
    "orders": [
      {
        "unitId": "string",
        "action": ["march", "garrison", "recon", "support", "capture"],
        "target": "tileId"
      }
    ],
    "constraints": ["string"],
    "reviewAfterTicks": "1-6",
    "explanation": "string",
    "planningRationale": ["string"]
  }
}
```

## Replay-RAG Injection Rules
- Inject `readRecentReplays` as top-K (default 3).
- Each replay keeps: `requestId`, `createdTick`, `outcome`, `intent`, `priority`, `orderCount`, `shortSummary`, `excerpt`, `score`.
- Query should mix command semantics + theater risk/hotspot context.
- Instruct model to provide at least one `planningRationale` item and reference replay influence when replay snippets exist.

## Validation Requirements
- `orders.length` in `1..8`
- `unitId` must be available
- `target` must exist
- `action` must be in allowedActions
- no duplicate `unitId`
- `reviewAfterTicks` in `1..6`

## Output Example
```json
{
  "intent": "stabilize_growth",
  "priority": "high",
  "orders": [
    { "unitId": "u2", "action": "recon", "target": "tile_04" },
    { "unitId": "u1", "action": "garrison", "target": "tile_06" }
  ],
  "constraints": ["intel_first_no_blind_push"],
  "reviewAfterTicks": 2,
  "explanation": "Frontline risk is elevated and recon coverage is low, so recon-first with defensive hold.",
  "planningRationale": [
    "Recent failed replay indicates overextension caused supply collapse.",
    "Low recon coverage requires scouting before capture commitment."
  ]
}
```
