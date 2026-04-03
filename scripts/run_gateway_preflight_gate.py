#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


CheckStatus = str  # pass | warn | fail


def main() -> int:
    parser = argparse.ArgumentParser(description='Preflight gate for gateway-scale evaluation runtime config.')
    parser.add_argument('--project-root', type=Path, default=Path.cwd(), help='Project root (default: cwd).')
    parser.add_argument(
        '--output',
        type=Path,
        default=Path('tmp/gates/gateway_preflight/latest.json'),
        help='JSON report output path.',
    )
    parser.add_argument('--timeout-seconds', type=float, default=3.0, help='Network probe timeout seconds.')
    parser.add_argument(
        '--require-key',
        choices=['auto', 'always', 'never'],
        default='auto',
        help='Whether API key is mandatory. auto follows GATEWAY_PREFLIGHT_REQUIRE_KEY env.',
    )
    args = parser.parse_args()

    project_root = args.project_root.resolve()
    dotenv_values = load_dotenv_chain(project_root, ['.env', '.env.local'])

    relay_url = resolve_value('LLM_RELAY_URL', dotenv_values)
    ai_server_url = resolve_value('AI_SERVER_URL', dotenv_values)
    api_key = resolve_value('LLM_RELAY_API_KEY', dotenv_values)
    api_keys = resolve_value('LLM_RELAY_API_KEYS', dotenv_values)
    api_keys_file = resolve_value('LLM_RELAY_API_KEYS_FILE', dotenv_values)

    require_key = resolve_require_key_mode(args.require_key, dotenv_values)

    checks: list[dict[str, Any]] = []
    checks.append(check('env_llm_relay_url_present', 'pass' if bool(relay_url) else 'fail', mask(relay_url), required=True))

    if relay_url:
        checks.extend(validate_url_check('env_llm_relay_url_valid', relay_url, required=True))
        checks.append(network_probe('llm_relay_connectivity', relay_url, args.timeout_seconds, required=True))

    has_key = bool(api_key or api_keys or api_keys_file)
    if has_key:
        checks.append(
            check(
                'env_llm_key_any_present',
                'pass',
                'LLM_RELAY_API_KEY / LLM_RELAY_API_KEYS / LLM_RELAY_API_KEYS_FILE',
                required=require_key,
            )
        )
    else:
        checks.append(
            check(
                'env_llm_key_any_present',
                'fail' if require_key else 'warn',
                'LLM_RELAY_API_KEY / LLM_RELAY_API_KEYS / LLM_RELAY_API_KEYS_FILE (missing)',
                required=require_key,
            )
        )

    if api_keys_file:
        key_file_path = (project_root / api_keys_file).resolve() if not Path(api_keys_file).is_absolute() else Path(api_keys_file)
        checks.append(check('env_llm_keys_file_exists', 'pass' if key_file_path.exists() else 'fail', str(key_file_path), required=True))

    if ai_server_url:
        checks.extend(validate_url_check('env_ai_server_url_valid', ai_server_url, required=False))
        checks.append(network_probe('ai_server_connectivity', ai_server_url, args.timeout_seconds, required=False))

    gate_status = aggregate_status(checks)
    passed = gate_status != 'fail'

    report = {
        'gate': 'gateway_preflight',
        'status': gate_status,
        'passed': passed,
        'checkedAtUtc': datetime.now(timezone.utc).isoformat(),
        'checks': checks,
        'inputs': {
            'llmRelayUrl': mask(relay_url),
            'aiServerUrl': mask(ai_server_url),
            'hasApiKey': bool(api_key),
            'hasApiKeys': bool(api_keys),
            'hasApiKeysFile': bool(api_keys_file),
            'requireKey': require_key,
            'dotenvLoaded': sorted(dotenv_values.keys()),
        },
    }

    output_path = args.output if args.output.is_absolute() else project_root / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if passed else 1


def resolve_require_key_mode(mode: str, dotenv_values: dict[str, str]) -> bool:
    if mode == 'always':
        return True
    if mode == 'never':
        return False

    raw = resolve_value('GATEWAY_PREFLIGHT_REQUIRE_KEY', dotenv_values)
    return raw in {'1', 'true', 'TRUE', 'yes', 'YES'}


def load_dotenv_chain(project_root: Path, file_names: list[str]) -> dict[str, str]:
    merged: dict[str, str] = {}
    for file_name in file_names:
        path = project_root / file_name
        if not path.exists():
            continue
        merged.update(parse_dotenv(path))
    return merged


def parse_dotenv(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue

        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip()

        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]

        result[key] = value

    return result


def resolve_value(key: str, dotenv_values: dict[str, str]) -> str:
    env_value = os.environ.get(key)
    if env_value is not None and env_value.strip() != '':
        return env_value.strip()
    return dotenv_values.get(key, '').strip()


def validate_url_check(name: str, value: str, required: bool) -> list[dict[str, Any]]:
    parsed = urlparse(value)
    scheme_ok = parsed.scheme in {'http', 'https'}
    host_ok = bool(parsed.netloc)
    return [
        check(f'{name}_scheme', 'pass' if scheme_ok else 'fail', parsed.scheme or '(missing)', required=required),
        check(f'{name}_host', 'pass' if host_ok else 'fail', parsed.netloc or '(missing)', required=required),
    ]


def network_probe(name: str, base_url: str, timeout_seconds: float, required: bool) -> dict[str, Any]:
    probe_targets = [
        base_url.rstrip('/') + '/v1/models',
        base_url.rstrip('/') + '/health',
        base_url,
    ]

    for target in probe_targets:
        try:
            req = Request(target, method='GET')
            with urlopen(req, timeout=timeout_seconds) as resp:  # noqa: S310
                status = getattr(resp, 'status', None)
                return check(name, 'pass', f'{target} -> HTTP {status}', required=required)
        except Exception as err:  # noqa: BLE001
            if is_connective_success(err):
                return check(name, 'pass', f'{target} -> reachable ({type(err).__name__}: {err})', required=required)

    return check(name, 'fail' if required else 'warn', f'probe failed for {base_url}', required=required)


def is_connective_success(error: Exception) -> bool:
    if isinstance(error, URLError) and isinstance(error.reason, socket.timeout):
        return False

    text = str(error).lower()
    return any(token in text for token in ['401', '403', '404', '405'])


def aggregate_status(checks: list[dict[str, Any]]) -> CheckStatus:
    statuses = {item['status'] for item in checks}
    if 'fail' in statuses:
        return 'fail'
    if 'warn' in statuses:
        return 'warn'
    return 'pass'


def mask(value: str) -> str:
    if not value:
        return '(unset)'
    if len(value) <= 16:
        return value
    return value[:8] + '...' + value[-6:]


def check(name: str, status: CheckStatus, detail: str, required: bool) -> dict[str, Any]:
    return {
        'name': name,
        'status': status,
        'passed': status != 'fail',
        'required': required,
        'detail': detail,
    }


if __name__ == '__main__':
    raise SystemExit(main())
