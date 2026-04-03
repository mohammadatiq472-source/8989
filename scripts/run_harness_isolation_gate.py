#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def main() -> int:
    parser = argparse.ArgumentParser(description='Validate project-local claude-code-harness isolation state.')
    parser.add_argument(
        '--project-root',
        type=Path,
        default=Path.cwd(),
        help='Project root path. Defaults to current working directory.',
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=Path('tmp/gates/harness_isolation/latest.json'),
        help='Where to write the JSON gate report.',
    )
    args = parser.parse_args()

    project_root = args.project_root.resolve()
    checks: list[dict[str, Any]] = []

    marker_path = project_root / '.codex-harness-home' / 'harness-install.json'
    launcher_path = project_root / 'Start-Codex-Harness-Isolated.cmd'
    skills_path = project_root / '.codex-harness-home' / 'skills'
    rules_path = project_root / '.codex-harness-home' / 'rules'

    marker_payload: dict[str, Any] = {}
    if marker_path.exists():
        checks.append(ok('marker_exists', True, str(marker_path)))
        try:
            marker_payload = json.loads(marker_path.read_text(encoding='utf-8'))
            checks.append(ok('marker_json_parse', True, 'harness-install.json parsed'))
        except Exception as err:  # noqa: BLE001
            checks.append(ok('marker_json_parse', False, f'parse failed: {err}'))
    else:
        checks.append(ok('marker_exists', False, f'missing: {marker_path}'))

    checks.append(ok('skills_exists', skills_path.exists(), str(skills_path)))
    checks.append(ok('rules_exists', rules_path.exists(), str(rules_path)))

    if marker_payload:
        checks.append(ok(
            'marker_isolation',
            marker_payload.get('isolation') == 'project-local-only',
            f"isolation={marker_payload.get('isolation')!r}",
        ))
        checks.append(ok(
            'marker_global_touched',
            marker_payload.get('globalCodexHomeTouched') is False,
            f"globalCodexHomeTouched={marker_payload.get('globalCodexHomeTouched')!r}",
        ))

        expected_target = str((project_root / '.codex-harness-home').resolve())
        checks.append(ok(
            'marker_target_path',
            str(marker_payload.get('targetCodeHome', '')).strip() == expected_target,
            f"targetCodeHome={marker_payload.get('targetCodeHome')!r}",
        ))

    if launcher_path.exists():
        launcher_text = launcher_path.read_text(encoding='utf-8', errors='replace').lower()
        checks.append(ok('launcher_exists', True, str(launcher_path)))
        checks.append(ok(
            'launcher_sets_codex_home',
            'codex_home=%cd%\.codex-harness-home' in launcher_text,
            'expects project-local CODEX_HOME',
        ))
    else:
        checks.append(ok('launcher_exists', False, f'missing: {launcher_path}'))

    passed = all(item['passed'] for item in checks)
    report = {
        'gate': 'harness_isolation',
        'passed': passed,
        'checkedAtUtc': datetime.now(timezone.utc).isoformat(),
        'projectRoot': str(project_root),
        'checks': checks,
    }

    output_path = args.output
    if not output_path.is_absolute():
        output_path = project_root / output_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if passed else 1


def ok(name: str, passed: bool, detail: str) -> dict[str, Any]:
    return {
        'name': name,
        'passed': passed,
        'detail': detail,
    }


if __name__ == '__main__':
    raise SystemExit(main())
