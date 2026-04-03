#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def write_default_config(config_path: Path) -> None:
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config = """# Project-isolated Codex config for Claude Harness
[features]
multi_agent = true

[agents]
max_threads = 8

[agents.implementer]
description = "Codex implementation worker for harness task execution"

[agents.reviewer]
description = "Codex reviewer worker for harness review and retake loops"
sandbox = "workspace-read-only"

[agents.task_worker]
description = "Standard Breezing implementer (impl_mode: standard). Implements tasks, runs self-review, build, and tests."

[agents.code_reviewer]
description = "Breezing reviewer. Performs independent code review with harness-review 5-point assessment including AI Residuals. Issues APPROVE / REQUEST_CHANGES / REJECT / STOP. Read-only."
sandbox = "workspace-read-only"

[agents.codex_implementer]
description = "Codex Breezing implementer (impl_mode: codex, used with --codex flag). Invokes Codex CLI, verifies AGENTS_SUMMARY, enforces Quality Gates."

[agents.plan_analyst]
description = "Phase 0 planning analyst: analyzes task granularity, estimates owned files, proposes dependencies, and evaluates risk. Read-only access to codebase."
sandbox = "workspace-read-only"

[agents.plan_critic]
description = "Phase 0 plan critic: red-team review of decomposition and risk. Read-only access."
sandbox = "workspace-read-only"

[memories]
no_memories_if_mcp_or_web_search = false
"""
    config_path.write_text(config, encoding='utf-8')


def ensure_harness_repo(repo_dir: Path, refresh: bool) -> None:
    if repo_dir.exists() and refresh:
        shutil.rmtree(repo_dir)

    if repo_dir.exists():
        return

    repo_dir.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ['git', 'clone', '--depth', '1', 'https://github.com/Chachamaru127/claude-code-harness', str(repo_dir)],
        check=True,
    )


def backup_existing(target: Path) -> Path | None:
    if not target.exists():
        return None

    stamp = datetime.now().strftime('%Y%m%d%H%M%S')
    backup_root = target / 'backups' / 'setup-harness' / stamp
    backup_root.parent.mkdir(parents=True, exist_ok=True)

    for child_name in ['skills', 'rules']:
        child = target / child_name
        if child.exists():
            dst = backup_root / child_name
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(child), str(dst))

    return backup_root


def copy_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def main() -> int:
    parser = argparse.ArgumentParser(description='Install Claude Harness into project-local isolated CODEX_HOME')
    parser.add_argument('--project-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--harness-repo', type=Path, default=None, help='Existing harness repository path')
    parser.add_argument('--target-home', type=Path, default=None, help='Project-local CODEX_HOME path')
    parser.add_argument('--refresh-repo', action='store_true', help='Re-clone harness repository before install')
    args = parser.parse_args()

    project_root = args.project_root.resolve()
    harness_repo = (args.harness_repo.resolve() if args.harness_repo else (project_root / 'tmp' / 'ext' / 'claude-code-harness'))
    target_home = (args.target_home.resolve() if args.target_home else (project_root / '.codex-harness-home'))

    ensure_harness_repo(harness_repo, args.refresh_repo)

    source_codex_home = harness_repo / 'codex' / '.codex'
    source_skills = source_codex_home / 'skills'
    source_rules = source_codex_home / 'rules'
    if not source_skills.exists() or not source_rules.exists():
        raise FileNotFoundError(f'Missing harness codex assets under: {source_codex_home}')

    backup_root = backup_existing(target_home)
    target_home.mkdir(parents=True, exist_ok=True)

    copy_tree(source_skills, target_home / 'skills')
    copy_tree(source_rules, target_home / 'rules')
    write_default_config(target_home / 'config.toml')

    marker = {
        'installedAtUtc': datetime.now(timezone.utc).isoformat(),
        'projectRoot': str(project_root),
        'targetCodeHome': str(target_home),
        'sourceRepo': str(harness_repo),
        'sourceSkills': str(source_skills),
        'sourceRules': str(source_rules),
        'backupRoot': (str(backup_root) if backup_root else None),
        'isolation': 'project-local-only',
        'globalCodexHomeTouched': False,
    }
    (target_home / 'harness-install.json').write_text(json.dumps(marker, ensure_ascii=False, indent=2), encoding='utf-8')

    print('Harness isolated install complete')
    print(f'project_root={project_root}')
    print(f'target_home={target_home}')
    print(f'source_repo={harness_repo}')
    if backup_root:
        print(f'backup_root={backup_root}')
    print('global_codex_home_touched=False')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
