param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("m18", "m01", "godot", "rules", "planner", "diplomacy", "frontend", "meta")]
  [string]$Lane
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$common = @(
  "Read order (minimal):",
  "1) AGENTS.md",
  "2) docs/AGENTS_EXECUTION_CURRENT_2026_04.md",
  "3) docs/AI_QUICK_NAV_INDEX_2026_04_10.md",
  "",
  "Global constraints:",
  "- Only modify lane whitelist files.",
  "- Ignore unrelated dirty files outside whitelist.",
  "- Report: read docs / changed files / formal commands / verification results."
)

$lanes = @{
  m18 = @{
    title = "Lane M18 (Gates/Workflow)"
    whitelist = @(
      "server/src/evals/**",
      ".github/workflows/ai-trio-gate.yml",
      ".github/pull_request_template.md",
      "docs/modules_v2/M18.md",
      "docs/GATE_TRIO_HANDOFF_2026_04_10.md",
      "docs/TASK_2026_04_10_AI_BATCH3_EXEC_CARDS.md"
    )
    verify = @("npm run build", "npm run gate:ai:nightly:acceptance", "npm run gate:ai:trio")
  }
  m01 = @{
    title = "Lane M01 (Persistence/Save-Slot)"
    whitelist = @(
      "server/src/application/world/WorldService.ts",
      "server/src/app.ts",
      "server/src/routes/observability.ts",
      "docs/modules_v2/M01.md",
      "docs/PERSISTENCE_ALERT_RUNBOOK_2026_04_09.md"
    )
    verify = @("npm run build", "npm run gate:save-slots:restore-apply:stability", "npm run gate:ai:nightly:acceptance")
  }
  godot = @{
    title = "Lane Godot (M15/M16 Visual Runtime)"
    whitelist = @(
      "godot-client/scripts/map/**",
      "godot-client/scripts/ui/**",
      "godot-client/assets/themes/slgclient/**",
      "godot-client/tools/run_week1_gate.py",
      "docs/GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md",
      "docs/GODOT_VISUAL_REPLACEMENT_EXECUTION_2026_04_10.md"
    )
    verify = @("npm run gate:godot:week1", "npm run godot:ops:visual-validate")
  }
  rules = @{
    title = "Lane Rules Engine"
    whitelist = @("shared/domain/**", "server/src/domain/**", "docs/modules_v2/M02.md")
    verify = @("npm run build")
  }
  planner = @{
    title = "Lane Planner/Commander"
    whitelist = @("server/src/agents/commander/**", "server/src/application/world/**", "docs/modules_v2/M03.md")
    verify = @("npm run build", "npm run gate:ai:mainline:stability")
  }
  diplomacy = @{
    title = "Lane General/Diplomacy"
    whitelist = @("server/src/agents/general/**", "docs/modules_v2/M04.md", "docs/modules_v2/M05.md")
    verify = @("npm run build", "npm run gate:ai:mainline:stability")
  }
  frontend = @{
    title = "Lane Frontend"
    whitelist = @("godot-client/**", "docs/modules_v2/M15.md", "docs/modules_v2/M16.md")
    verify = @("npm run gate:godot:week1")
  }
  meta = @{
    title = "Lane Meta/Docs Governance"
    whitelist = @("docs/**", "AGENTS.md", "WORKTREE_PARALLEL_QUICKSTART_2026_04_11.md")
    verify = @("obsidian files folder='docs' ext=md")
  }
}

$laneConfig = $lanes[$Lane]
if (-not $laneConfig) {
  throw "Lane config missing: $Lane"
}

Write-Output "Lane bootstrap prompt"
Write-Output "====================="
Write-Output $laneConfig.title
Write-Output ""
$common | ForEach-Object { Write-Output $_ }
Write-Output ""
Write-Output "Whitelist:"
$laneConfig.whitelist | ForEach-Object { Write-Output "- $_" }
Write-Output ""
Write-Output "Formal validation commands:"
$laneConfig.verify | ForEach-Object { Write-Output "- $_" }
