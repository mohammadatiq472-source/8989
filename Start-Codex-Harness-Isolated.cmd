@echo off
setlocal
cd /d "%~dp0"

set "CODEX_HOME=%CD%\.codex-harness-home"
if not exist "%CODEX_HOME%\skills" (
  echo [WARN] Project-local harness not installed yet.
  echo [INFO] Run: py -3.11 scripts\setup_codex_harness_isolated.py
)

echo [INFO] CODEX_HOME=%CODEX_HOME%
codex %*
