# Claude Harness Project-Isolated Setup (2026-03-26)

## Goal
- Enable `claude-code-harness` for this project only.
- Do not modify global `C:\Users\Buffoon Queer\.codex`.

## Implementation
1. Run project-local installer:
   - `py -3.11 scripts/setup_codex_harness_isolated.py`
2. Install target is fixed to:
   - `.codex-harness-home/`
3. Start Codex with isolated home:
   - `Start-Codex-Harness-Isolated.cmd`
   - This launcher sets `CODEX_HOME=%CD%\.codex-harness-home`

## Isolation Boundaries
- Only sync `claude-code-harness/codex/.codex/skills` and `rules` into project-local home.
- Do not overwrite project root `AGENTS.md`.
- Do not write to global `~/.codex/skills` or `~/.codex/rules`.

## Rollback
1. Close current Codex session.
2. Delete `.codex-harness-home/`.
3. Delete `Start-Codex-Harness-Isolated.cmd` (optional).

## Verification
Check `.codex-harness-home/harness-install.json`:
- `isolation = project-local-only`
- `globalCodexHomeTouched = false`

## Gate Entrypoint
- Run `npm run gate:harness:isolation` to verify isolation marker, local skills/rules, and launcher `CODEX_HOME` binding.
- Report file: `tmp/gates/harness_isolation/latest.json`.
