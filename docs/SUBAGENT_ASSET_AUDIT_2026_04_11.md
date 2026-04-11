# Subagent Asset Audit (2026-04-11)

## 0. Answer first

Yes, subagent assets should still be used.  
No, they should not all be loaded every run.

The right model is "selective loading + lane-scoped worktrees".

## 1. Current executable asset inventory

1. `.github/agents/*.agent.md`: 6 files
   - `commander-planning.agent.md`
   - `frontend.agent.md`
   - `general-diplomacy.agent.md`
   - `qa-sim.agent.md`
   - `rules-engine.agent.md`
   - `world-meta.agent.md`
2. `docs/AI_SUBAGENT_LAUNCH_PROMPTS_2026_03_26.md`: one launcher template doc (not 16 separate files)
3. `docs/prompts/*`: planner prompt references

## 2. Pollution risk

Risk is not "file count" itself.  
Risk is treating all prompt/docs as mandatory context on every window.

## 3. Recommended usage policy

1. Default load: only `AGENTS.md` + current execution doc + quick-nav.
2. Load subagent prompt assets only when you spawn/assign a lane.
3. Keep one lane per worktree; keep one whitelist per lane.
4. Integrator lane does cross-lane merge/gates; dev lanes do not.

## 4. Fast operation

1. Create lanes: `scripts/setup_parallel_worktrees.ps1`.
2. Print lane bootstrap prompt: `scripts/emit_lane_window_prompt.ps1 -Lane <lane>`.
3. Paste lane prompt into each AI window first message.

## 5. Keep vs archive

1. Keep active:
   - `.github/agents/*.agent.md`
   - `docs/AI_SUBAGENT_LAUNCH_PROMPTS_2026_03_26.md`
   - `docs/prompts/*`
2. Reference-only:
   - historical narrative/handoff prompt docs unless debugging history
