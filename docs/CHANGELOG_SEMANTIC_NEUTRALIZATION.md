# Semantic Neutralization Changelog (Rolling)

> Fast index for terminology/name changes.
> Rule: every semantic/field/function naming change must add exactly one line.

## Format

`YYYY-MM-DD | scope | change | compatibility | refs`

## 2026-03

2026-03-29 | docs.policy | Added rolling semantic changelog and linked it from engineer start doc | n/a | docs/CHANGELOG_SEMANTIC_NEUTRALIZATION.md, docs/00_ENGINEER_START_HERE_2026_03_29.md
2026-03-29 | legacy.network/session | Legacy HumanFactionSession naming aligned to neutral wording (historical) | dual-read | docs/archive/
2026-03-29 | server.events.quota | Added aiQuotaChanges event chain for HUD subscription tips | additive | server/src/events/aiQuota.ts, godot-client/scripts/app/main.gd
2026-03-29 | contracts.meta | Upgraded meta contract naming from player/enemy to neutral fields | dual-read | shared/contracts/meta.ts, shared/schemas/meta.schema.ts
2026-03-29 | scripts.copy | Replaced player/enemy literal wording in scripts with neutral terminology | n/a | scripts/*
2026-03-29 | contracts.legacy.sync-gate | Legacy contract sync gate archived and removed from current pipeline | strict-check | .github/workflows/phase5-hardening-gate.yml, docs/00_ENGINEER_START_HERE_2026_03_29.md
2026-03-29 | contracts.worldstate.whitelist | WorldState nested whitelist rules kept for low false positives in cross-module work | strict-check | docs/00_ENGINEER_START_HERE_2026_03_29.md
2026-03-29 | godot.frontend.render | Documented Godot-first map/HUD render baseline and neutral terminology sync | additive | godot-client/README.md, docs/00_ENGINEER_START_HERE_2026_03_29.md
