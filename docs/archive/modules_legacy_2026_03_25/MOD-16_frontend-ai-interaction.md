# MOD-16 - Frontend AI Interaction (Copilot/General Chat/AI Hub)

## 1. Definition
- Owner: Frontend App (E4)
- Backup owner: AI Systems (E2)
- Goal: Player-facing AI interaction layer for copilot runtime, general chat, and model config UX.

## 2. Functional Scope
- Copilot runtime integration and readable context streaming.
- General chat UI and history flow.
- AI Hub model/config panel.
- Frontend action chain to /api/copilotkit and /api/generals/* endpoints.

## 3. Code Boundaries
- `src/components/copilot/CopilotCommanderPanel.tsx`
- `src/components/screens/GeneralChatPanel.tsx`
- `src/components/panels/AiHubPanel.tsx`
- `server/src/routes/copilot.ts`
- `server/src/routes/generalChat.ts`

## 4. Official Entrypoints
- POST /api/copilotkit
- GET|POST /api/generals/*
- GET|POST /api/ai/config

## 5. Dependencies
- Modules: MOD-03, MOD-08, MOD-10, MOD-14

## 6. Risks
- Chat and profile state can drift under high event volume.
- Copilot protocol upgrades may break runtime compatibility.

## 7. Next Actions
- Unify chat message IDs with general memory IDs.
- Normalize Copilot action result events for replayability.

## 8. Related Docs
- `docs/AI_LAYER_STATUS.md`
- `docs/ROLE_FRONTEND_ENGINEER.md`

## 9. Handoff Checklist
- [ ] Reproduce module baseline using official entrypoints.
- [ ] Confirm change impact scope (intra-module vs cross-module).
- [ ] Update this module card when behavior, interface, or ownership changes.
