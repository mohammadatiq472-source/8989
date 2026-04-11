# Worktree Parallel Quickstart (2026-04-11)

Goal: support fast multi-window iteration without cross-window dirty-worktree conflicts.

## 1) Why this exists

When multiple AI windows edit the same directory, each window sees unrelated edits as "dirty workspace".  
Use one worktree per window instead.

## 2) One-time setup

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup_parallel_worktrees.ps1 -DryRun
powershell -ExecutionPolicy Bypass -File scripts/setup_parallel_worktrees.ps1 -Create
```

Default lanes:

1. `../8989-m18` (M18 gates/workflow/docs)
2. `../8989-m01` (M01 persistence/save-slot)
3. `../8989-godot` (godot visuals/runtime)

## 3) Single system-prompt constraint workaround

If Codex only allows one global system prompt, keep it generic:

1. Always read `AGENTS.md`.
2. Always read `docs/AGENTS_EXECUTION_CURRENT_2026_04.md`.
3. Then read only lane-specific docs and files (whitelist).
4. Ignore unrelated dirty files outside lane whitelist.

Use per-window first message to inject lane constraints (not system prompt):

```text
Use helper command:
powershell -ExecutionPolicy Bypass -File scripts/emit_lane_window_prompt.ps1 -Lane m18
```

## 4) Integration model

1. Dev windows: code only in own worktree + own lane.
2. Integrator window: merges lane branches and runs full gate chain.
3. Never run destructive cleanup outside current worktree.

## 5) Context hygiene

1. Do not load all docs by default.
2. Prefer quick-nav + lane card.
3. Treat old prompt docs as reference, not mandatory read.
4. See `docs/SUBAGENT_ASSET_AUDIT_2026_04_11.md` for keep/archive policy.
