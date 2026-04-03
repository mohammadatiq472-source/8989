# Semantic Neutralization Changelog (Rolling)

> Fast index for terminology/name changes.
> Rule: every semantic/field/function naming change must add exactly one line.

## Format

`YYYY-MM-DD | scope | change | compatibility | refs`

## 2026-03

2026-03-29 | docs.policy | Added rolling semantic changelog and linked it from engineer start doc | n/a | docs/CHANGELOG_SEMANTIC_NEUTRALIZATION.md, docs/00_ENGINEER_START_HERE_2026_03_29.md
2026-03-29 | unity.network/session | HumanFactionSession aligned to neutral naming (remove direct player/enemy wording) | dual-read | client/unity/06-HumanFactionSession.cs, client/unity/07-WorldModels.cs
2026-03-29 | server.events.quota | Added aiQuotaChanges event chain for Unity HUD subscription tips | additive | server/src/events/aiQuota.ts, client/unity/09-HudEventBridge.cs
2026-03-29 | contracts.meta | Upgraded meta contract naming from player/enemy to neutral fields | dual-read | shared/contracts/meta.ts, shared/schemas/meta.schema.ts
2026-03-29 | scripts.copy | Replaced player/enemy literal wording in scripts with neutral terminology | n/a | scripts/*
2026-03-29 | contracts.unity.sync-gate | Expanded Unity contract gate to nested paths with fail-fast reporting and CI enforcement | strict-check | scripts/validate_contract_sync.ts, .github/workflows/phase5-hardening-gate.yml, docs/00_ENGINEER_START_HERE_2026_03_29.md, docs/unity/12-unity-integration-acceptance.md
2026-03-29 | contracts.unity.worldstate-whitelist | Expanded gate to WorldState key nested blocks with whitelist mode to reduce parallel-work false positives | strict-check | scripts/validate_contract_sync.ts, docs/00_ENGINEER_START_HERE_2026_03_29.md, docs/unity/12-unity-integration-acceptance.md
2026-03-29 | unity.frontend.render | Documented Unity-first map/unit/HUD rendering fixes plus aiQuotaChanges HUD bridge and neutral terminology sync | additive | docs/unity/12-unity-integration-acceptance.md, docs/00_ENGINEER_START_HERE_2026_03_29.md
