# MOD-13 - Shared Contracts, Schemas, and Domain Models

## 1. Definition
- Owner: Shared Layer Owner (E6)
- Backup owner: Backend Core (E1)
- Goal: Single source of truth for cross-layer data contracts and validation.

## 2. Functional Scope
- Type contracts in shared/contracts.
- Zod schemas in shared/schemas.
- Core domain algorithms in shared/domain.
- Cross-frontend/backend compatibility guarantees.

## 3. Code Boundaries
- `shared/contracts/*.ts`
- `shared/schemas/*.ts`
- `shared/domain/*.ts`

## 4. Official Entrypoints
- Used by all server/src and src modules.
- npm run lint
- npm run build

## 5. Dependencies
- Modules: MOD-01, MOD-02, MOD-08, MOD-12, MOD-14

## 6. Risks
- Contract/schema drift creates silent runtime corruption.
- High reuse makes changes expensive without central regression checks.

## 7. Next Actions
- Add contract-schema parity checks in CI.
- Define breaking-change process with migration note requirements.

## 8. Related Docs
- `docs/audit-shared-contracts-schemas-2026-03-20.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
