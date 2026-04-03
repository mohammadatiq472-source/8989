# Engineer Start Here (2026-03-29)

## Read These First

1. `docs/SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29.md`
2. `docs/CHANGELOG_SEMANTIC_NEUTRALIZATION.md`
3. `docs/unity/11-unity-call-order.md`

## Hard Rules For This Migration

- Do not introduce new `player/enemy` semantic coupling in newly changed code.
- Prefer neutral terms: `faction`, `targetFaction`, `humanFactionId`, `aiFactionId`.
- Compatibility aliases are allowed temporarily, but mark them as deprecated.

## Before You Commit

- If you changed names (fields/functions/contracts), update both docs:
  - `docs/SEMANTIC_NEUTRALIZATION_GUIDE_2026_03_29.md` (what changed, why, compatibility)
  - `docs/CHANGELOG_SEMANTIC_NEUTRALIZATION.md` (append one single-line entry)
- If Unity/HUD consumer fields changed, include one verification conclusion.

## Contract Sync Gate (Mandatory)

- Run `npm run gate:contracts:unity` before commit.
- This gate checks both top-level and nested fields between:
  - TS contracts: `shared/contracts/game/world.ts`, `shared/contracts/game/ws.ts`
  - Unity DTOs: `My project/Assets/Scripts/Data/GameModels.cs`
- WorldState uses key-block whitelist (not full hard-lock) to avoid false positives during parallel work:
  - Root key fields (`tick/worldVersion/map/factions/units/intel/reports`)
  - Key nested blocks (`map`, `map.tiles[]`, `map.regions[]`, `factions{}`, `units[]`)
- The gate is fail-fast:
  - The first missing C# field compared with TS contract fails the run immediately.
  - Output includes the failing path, missing fields, and compared property lists.
- CI also enforces this gate in `.github/workflows/phase5-hardening-gate.yml`.

## Unity Render Profile + RenderGate (Mandatory For Isometric Visual Work)

- Apply profile before visual tuning:
  - Medieval pack: `YouZhou/Profiles/Apply Medieval Pack Profile (90x52, 0.51966)`
  - Nature pack: `YouZhou/Profiles/Apply Nature Profile (292/122 -> 0.418)`
- Render regression gate:
  - Run: `YouZhou/RenderGate/Run`
  - Set baseline: `YouZhou/RenderGate/Set Baseline`
  - Open output: `YouZhou/RenderGate/Open Output Folder`
- Output artifacts (fixed path):
  - `tmp/rendergate/latest.png`
  - `tmp/rendergate/baseline.png`
  - `tmp/rendergate/diff.png`
  - `tmp/rendergate/report.json`
- Team rule:
  - Any map/tiling/material/sorting change must include one RenderGate run result in delivery notes.

## One-Line Entry Template

`YYYY-MM-DD | scope | change | compatibility | refs`

Example:

`2026-03-29 | contracts.meta | rename playerPower/enemyPower -> primaryFactionPower/opposingFactionPower | dual-read | shared/contracts/meta.ts`
