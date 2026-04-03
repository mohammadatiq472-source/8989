# MOD-15 - Frontend Map Rendering and Viewport

## 1. Definition
- Owner: Frontend Map (E5)
- Backup owner: Frontend App (E4)
- Goal: Pixi map rendering, viewport controls, LOD textures, and map data hydration.

## 2. Functional Scope
- Pixi map rendering and interactions.
- Viewport transform and clamp strategies.
- LOD texture warmup and cache behavior.
- Map layout prefetch and overview alignment.

## 3. Code Boundaries
- `src/components/pixi/PixiMapBoard.tsx`
- `src/components/mapViewport.ts`
- `src/components/MapBoard.tsx`
- `src/api/mapClient.ts`
- `src/api/worldClient.ts`

## 4. Official Entrypoints
- GET /api/world/map-layout
- GET /api/map/overview
- prefetchWorldMapLayoutForViewport()

## 5. Dependencies
- Modules: MOD-01, MOD-08, MOD-13, MOD-14, MOD-17

## 6. Risks
- Texture volume and LOD policy can cause render stalls.
- Map hierarchy consistency under large worlds needs continuous verification.

## 7. Next Actions
- Create viewport load/perf benchmark scenes.
- Expose texture warmup metrics on debug panel.

## 8. Related Docs
- `docs/HANDOFF_MAP_SYSTEM_2026_03_20.md`
- `docs/UI_MAP_INTEGRATED_WIREFRAME_V1.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
