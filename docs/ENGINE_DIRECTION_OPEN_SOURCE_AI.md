# Engine Direction: Do Not Migrate Entirely to UE Yet

## Decision

Do not migrate the full game body to UE (UN/Unreal Engine) at the current stage.
Keep the primary stack as **TypeScript + Web client + authoritative backend** and continue validating the AI-native command system first.

## Why

1. Your current moat is structured world/rules/planning, not 3D rendering.
2. Full UE migration increases engineering complexity too early (language/runtime/toolchain split).
3. For open-source collaboration and deep AI integration, TS/Node has lower friction.
4. The most important proof now is command-to-execution reliability, not visual engine replacement.

## Recommended Path

1. Keep current repo as mainline; continue backend authoritative + persistence + eval work.
2. Freeze protocol contracts (`shared/contracts`, `shared/schemas`, event/replay formats).
3. If UE is needed later, treat UE as a client/view layer only; keep backend rules authoritative.
4. Build a thin UE PoC (read world + submit actions) before any large migration decision.

## Open-Source + AI Strategy

1. Open-source `shared/contracts` and `shared/schemas` as the stable extension boundary.
2. Publish replay/event schemas so community can build tactical tools and analytics.
3. Keep AI as proposal engine only; final world mutation remains in backend rule layer.
4. Keep gateway/provider abstraction to avoid hard dependency on a single model vendor.
