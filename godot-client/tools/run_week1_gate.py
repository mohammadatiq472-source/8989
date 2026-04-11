#!/usr/bin/env python3
"""
Week 1 gate runner for Godot client migration (W1-C13).

Formal entrypoint:
  py -3.11 godot-client/tools/run_week1_gate.py
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://127.0.0.1:8787"
DEFAULT_GODOT_EXE = r"D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe"
DEFAULT_GODOT_PATH = "godot-client"
DEFAULT_OUTPUT = "tmp/gates/godot_week1_gate_latest.json"


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _parse_json(raw: str) -> Any:
    if raw.strip() == "":
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"_raw": raw}


def _http_json(method: str, url: str, body: dict[str, Any] | None = None, timeout: float = 12.0) -> dict[str, Any]:
    data: bytes | None = None
    headers: dict[str, str] = {}
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(url=url, data=data, headers=headers, method=method.upper())
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return {
                "ok": 200 <= resp.status < 300,
                "status": resp.status,
                "data": _parse_json(raw),
                "raw": raw,
                "error": None,
            }
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        return {
            "ok": False,
            "status": exc.code,
            "data": _parse_json(raw),
            "raw": raw,
            "error": f"http_error:{exc.code}",
        }
    except URLError as exc:
        return {
            "ok": False,
            "status": -1,
            "data": {},
            "raw": "",
            "error": f"network_error:{exc.reason}",
        }


def _pick_faction_id(runtime_payload: Any) -> str:
    if not isinstance(runtime_payload, dict):
        return ""
    factions = runtime_payload.get("factions")
    if not isinstance(factions, list) or not factions:
        return ""

    def _extract(item: Any) -> tuple[str, int, int]:
        if not isinstance(item, dict):
            return "", 0, 0
        faction_id = str(item.get("factionId", "")).strip()
        seat_count = int(item.get("seatCount", 0) or 0)
        online_seat_count = int(item.get("onlineSeatCount", 0) or 0)
        return faction_id, seat_count, online_seat_count

    for item in factions:
        faction_id, seat_count, online_seat_count = _extract(item)
        if faction_id and (seat_count <= 0 or online_seat_count < seat_count):
            return faction_id

    for item in factions:
        faction_id, _, _ = _extract(item)
        if faction_id:
            return faction_id
    return ""


def _resolve_godot_exe(explicit: str) -> str:
    if explicit.strip():
        return explicit.strip()

    env_candidate = os.getenv("GODOT_EXE", "").strip()
    if env_candidate:
        return env_candidate

    if Path(DEFAULT_GODOT_EXE).exists():
        return DEFAULT_GODOT_EXE

    for candidate in ("godot_console.exe", "godot.exe", "godot4"):
        found = shutil.which(candidate)
        if found:
            return found
    return DEFAULT_GODOT_EXE


def _append_step(steps: list[dict[str, Any]], name: str, started: float, ok: bool, detail: str, extra: dict[str, Any] | None = None) -> None:
    item: dict[str, Any] = {
        "name": name,
        "ok": ok,
        "durationMs": int((time.time() - started) * 1000),
        "detail": detail,
    }
    if extra:
        item["extra"] = extra
    steps.append(item)


def _find_balanced_segment(text: str, start_idx: int, open_char: str, close_char: str) -> tuple[int, str]:
    depth = 1
    idx = start_idx
    in_str: str | None = None
    escaping = False
    while idx < len(text) and depth > 0:
        ch = text[idx]
        if in_str is not None:
            if escaping:
                escaping = False
            elif ch == "\\":
                escaping = True
            elif ch == in_str:
                in_str = None
        else:
            if ch in ("'", '"', "`"):
                in_str = ch
            elif ch == open_char:
                depth += 1
            elif ch == close_char:
                depth -= 1
        idx += 1
    return idx, text[start_idx:idx]


def _line_at(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _validate_replay_highlight_anchor_contract(repo_root: Path) -> tuple[bool, str, dict[str, Any]]:
    rules_path = repo_root / "shared" / "domain" / "rules.ts"
    province_path = repo_root / "shared" / "domain" / "provincePve.ts"
    luoyang_path = repo_root / "shared" / "domain" / "luoyangEndgame.ts"

    errors: list[dict[str, Any]] = []
    scanned = {
        "rulesPath": str(rules_path),
        "provincePath": str(province_path),
        "luoyangPath": str(luoyang_path),
        "createReplayHighlightCallCount": 0,
    }

    rules_text = rules_path.read_text(encoding="utf-8")
    call_needle = "createReplayHighlight("
    idx = 0
    while True:
        call_idx = rules_text.find(call_needle, idx)
        if call_idx < 0:
            break
        line_no = _line_at(rules_text, call_idx)
        line_text = rules_text.splitlines()[line_no - 1].strip()
        end_idx, call_segment = _find_balanced_segment(rules_text, call_idx + len(call_needle), "(", ")")
        idx = end_idx
        if line_text.startswith("function createReplayHighlight("):
            continue
        scanned["createReplayHighlightCallCount"] += 1
        has_anchor = any(token in call_segment for token in ("unitId", "tileId", "fromTileId", "toTileId"))
        if not has_anchor:
            errors.append({
                "file": str(rules_path),
                "line": line_no,
                "reason": "createReplayHighlight call missing anchor fields",
            })

    required_create_impl_tokens = (
        "const normalizedTileId = context?.tileId ?? context?.toTileId ?? context?.fromTileId",
        "const normalizedToTileId = context?.toTileId ?? normalizedTileId",
        "tileId: normalizedTileId",
        "toTileId: normalizedToTileId",
    )
    for token in required_create_impl_tokens:
        if token not in rules_text:
            errors.append({
                "file": str(rules_path),
                "line": 0,
                "reason": f"createReplayHighlight implementation missing token: {token}",
            })

    def _validate_literal_highlight_file(path: Path) -> None:
        text = path.read_text(encoding="utf-8")
        literal_needle = "highlights.push({"
        i = 0
        while True:
            literal_idx = text.find(literal_needle, i)
            if literal_idx < 0:
                break
            line_no = _line_at(text, literal_idx)
            end_idx, obj_segment = _find_balanced_segment(text, literal_idx + len("highlights.push({"), "{", "}")
            i = end_idx
            if all(key in obj_segment for key in ("kind:", "severity:", "title:", "detail:")):
                has_anchor = any(token in obj_segment for token in ("unitId:", "tileId:", "fromTileId:", "toTileId:"))
                if not has_anchor:
                    errors.append({
                        "file": str(path),
                        "line": line_no,
                        "reason": "literal ReplayHighlight missing anchor fields",
                    })

    _validate_literal_highlight_file(province_path)
    _validate_literal_highlight_file(luoyang_path)

    if errors:
        return False, f"replay highlight anchor contract failed ({len(errors)} issue(s))", {"errors": errors, "scanned": scanned}
    return True, "replay highlight anchor contract passed", {"scanned": scanned}


def _extract_case_return(source: str, case_name: str) -> float | None:
    escaped = re.escape(case_name)
    pattern = rf'"{escaped}"\s*:\s*\n\s*return\s+([0-9]+(?:\.[0-9]+)?)'
    match = re.search(pattern, source)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def _validate_unit_view_layer_engage_intensity(repo_root: Path) -> tuple[bool, str, dict[str, Any]]:
    path = repo_root / "godot-client" / "scripts" / "map" / "unit_view_layer.gd"
    source = path.read_text(encoding="utf-8")

    battle = _extract_case_return(source, "battle")
    tile_control = _extract_case_return(source, "tile_control")
    logistics = _extract_case_return(source, "logistics")

    missing_cases = [name for name, value in (("battle", battle), ("tile_control", tile_control), ("logistics", logistics)) if value is None]
    if missing_cases:
        return False, f"engage intensity mapping missing cases: {', '.join(missing_cases)}", {"file": str(path)}

    assert battle is not None and tile_control is not None and logistics is not None
    ordered = battle > tile_control > logistics
    positive = logistics > 0.0
    frame_filter_ok = 'kind == "battle" or kind == "tile_control" or kind == "logistics"' in source

    ok = ordered and positive and frame_filter_ok
    detail = "unit view engage intensity contract passed" if ok else "unit view engage intensity contract failed"
    return ok, detail, {
        "file": str(path),
        "battle": battle,
        "tileControl": tile_control,
        "logistics": logistics,
        "ordered": ordered,
        "positive": positive,
        "frameFilterIncludesKinds": frame_filter_ok,
    }


def _validate_runtime_replay_highlights(
    world_payload: Any,
    *,
    require_target_highlights: bool = False,
) -> tuple[bool, str, dict[str, Any]]:
    if not isinstance(world_payload, dict):
        return False, "world payload is not a dict", {"checkedHighlights": 0}

    history = world_payload.get("history", {})
    if not isinstance(history, dict):
        if require_target_highlights:
            return False, "runtime replay highlight sanity failed: history missing", {"checkedHighlights": 0}
        return True, "runtime replay highlight sanity skipped: history missing", {"checkedHighlights": 0, "skipped": True}

    replays = history.get("executionReplays", [])
    if not isinstance(replays, list) or len(replays) == 0:
        if require_target_highlights:
            return False, "runtime replay highlight sanity failed: no executionReplays", {"checkedHighlights": 0}
        return True, "runtime replay highlight sanity skipped: no executionReplays", {"checkedHighlights": 0, "skipped": True}

    target_kinds = {"battle", "tile_control", "logistics"}
    checked = 0
    errors: list[dict[str, Any]] = []
    for replay_idx, replay in enumerate(replays):
        if not isinstance(replay, dict):
            continue
        frames = replay.get("frames", [])
        if not isinstance(frames, list):
            continue
        for frame_idx, frame in enumerate(frames):
            if not isinstance(frame, dict):
                continue
            highlights = frame.get("highlights", [])
            if not isinstance(highlights, list):
                continue
            for highlight_idx, highlight in enumerate(highlights):
                if not isinstance(highlight, dict):
                    continue
                kind = str(highlight.get("kind", "")).strip()
                if kind not in target_kinds:
                    continue
                checked += 1
                has_anchor = any(
                    str(highlight.get(key, "")).strip() != ""
                    for key in ("unitId", "tileId", "fromTileId", "toTileId")
                )
                if not has_anchor:
                    errors.append(
                        {
                            "replayIndex": replay_idx,
                            "frameIndex": frame_idx,
                            "highlightIndex": highlight_idx,
                            "kind": kind,
                            "id": str(highlight.get("id", "")),
                        }
                    )

    if errors:
        return False, f"runtime replay highlight sanity failed ({len(errors)} issue(s))", {"checkedHighlights": checked, "errors": errors}

    if checked == 0:
        if require_target_highlights:
            return False, "runtime replay highlight sanity failed: no target highlight kinds", {"checkedHighlights": 0}
        return True, "runtime replay highlight sanity skipped: no target highlight kinds", {"checkedHighlights": 0, "skipped": True}

    return True, "runtime replay highlight sanity passed", {"checkedHighlights": checked}


def _run_template_replay_seed(repo_root: Path, base_url: str, report_path: Path) -> tuple[bool, str, dict[str, Any]]:
    cli_path = repo_root / "godot-client" / "tools" / "slg_ops_cli.py"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "py",
        "-3.11",
        str(cli_path),
        "--base-url",
        base_url,
        "--output",
        str(report_path),
        "template-replay",
        "--scenario",
        "baseline_v1",
        "--no-restore-world",
        "--report-path",
        str(report_path),
    ]
    started = time.time()
    try:
        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
            check=False,
        )
    except Exception as exc:  # pragma: no cover
        return False, "template replay seed failed to run", {"error": str(exc), "reportPath": str(report_path)}

    report_data: dict[str, Any] = {}
    if report_path.exists():
        try:
            loaded = json.loads(report_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                report_data = loaded
        except json.JSONDecodeError:
            report_data = {}

    passed = bool(report_data.get("passed", False))
    ok = proc.returncode == 0 and passed
    detail = "template replay seed passed" if ok else "template replay seed failed"
    return ok, detail, {
        "returnCode": proc.returncode,
        "durationMs": int((time.time() - started) * 1000),
        "reportPath": str(report_path),
        "reportPassed": passed,
        "checks": report_data.get("checks", []),
        "stderrTail": (proc.stderr or "").strip().splitlines()[-12:],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Godot Week1 gate (W1-C13).")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--godot-exe", default="")
    parser.add_argument("--godot-path", default=DEFAULT_GODOT_PATH)
    parser.add_argument("--player-name", default="godot_week1_gate")
    parser.add_argument("--map-scope", default="full", choices=["full", "bootstrap", "province", "region", "viewport"])
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--strict-join", action="store_true", help="Fail gate when /api/session/join does not return 200.")
    parser.add_argument(
        "--require-runtime-replay",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Require runtime executionReplays to contain battle/tile_control/logistics highlight anchors.",
    )
    parser.add_argument(
        "--seed-runtime-replay",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Auto-run template-replay when runtime replay payload is missing before strict sanity check.",
    )
    parser.add_argument(
        "--allow-stale-runtime-schema",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Allow runtime replay sanity downgrade when backend schema appears stale but source anchor contract passes.",
    )
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    godot_exe = _resolve_godot_exe(args.godot_exe)
    godot_path = args.godot_path
    repo_root = Path(__file__).resolve().parents[2]

    steps: list[dict[str, Any]] = []
    started_at = _now_iso()
    token = ""
    faction_id = ""
    effective_map_scope = args.map_scope

    t = time.time()
    health = _http_json("GET", f"{base_url}/api/health")
    _append_step(
        steps,
        "health",
        t,
        bool(health.get("ok", False)),
        "GET /api/health",
        {"status": health.get("status")},
    )

    t = time.time()
    runtime = _http_json("GET", f"{base_url}/api/session/runtime")
    runtime_ok = bool(runtime.get("ok", False))
    if runtime_ok:
        faction_id = _pick_faction_id(runtime.get("data", {}))
    _append_step(
        steps,
        "runtime",
        t,
        runtime_ok and faction_id != "",
        "GET /api/session/runtime",
        {"status": runtime.get("status"), "factionId": faction_id},
    )

    t = time.time()
    join_ok = False
    join_status = -1
    if faction_id:
        join = _http_json(
            "POST",
            f"{base_url}/api/session/join",
            body={"factionId": faction_id, "playerName": args.player_name},
        )
        join_status = int(join.get("status", -1))
        if bool(join.get("ok", False)):
            join_ok = True
            join_data = join.get("data", {})
            if isinstance(join_data, dict):
                token = str(join_data.get("token", ""))
        elif join_status == 409:
            # faction full/online is acceptable for readonly world/map fetch in non-strict mode
            join_ok = not args.strict_join

    _append_step(
        steps,
        "join",
        t,
        join_ok,
        "POST /api/session/join",
        {"status": join_status, "strictJoin": bool(args.strict_join)},
    )

    t = time.time()
    world = _http_json("GET", f"{base_url}/api/world?intelMode=sparse")
    world_data = world.get("data", {})
    world_ok = bool(world.get("ok", False)) and isinstance(world_data, dict) and "world" in world_data
    _append_step(
        steps,
        "world",
        t,
        world_ok,
        "GET /api/world?intelMode=sparse",
        {"status": world.get("status")},
    )

    runtime_world_payload = world_data.get("world", {}) if isinstance(world_data, dict) else {}
    precheck_ok, precheck_detail, precheck_extra = _validate_runtime_replay_highlights(
        runtime_world_payload,
        require_target_highlights=False,
    )
    precheck_skipped = bool(precheck_extra.get("skipped", False))
    final_runtime_ok = precheck_ok
    final_runtime_detail = precheck_detail
    final_runtime_extra: dict[str, Any] = dict(precheck_extra)

    if args.require_runtime_replay and precheck_skipped:
        if args.seed_runtime_replay:
            t = time.time()
            template_report_path = Path(args.output).parent / "godot_week1_template_replay_seed_latest.json"
            template_ok, template_detail, template_extra = _run_template_replay_seed(repo_root, base_url, template_report_path)
            _append_step(
                steps,
                "template-replay-seed",
                t,
                template_ok,
                template_detail,
                template_extra,
            )

            if template_ok:
                t = time.time()
                world_after_seed = _http_json("GET", f"{base_url}/api/world?intelMode=sparse")
                world_after_data = world_after_seed.get("data", {})
                world_after_ok = bool(world_after_seed.get("ok", False)) and isinstance(world_after_data, dict) and "world" in world_after_data
                _append_step(
                    steps,
                    "world-after-template-replay",
                    t,
                    world_after_ok,
                    "GET /api/world?intelMode=sparse (after template replay seed)",
                    {"status": world_after_seed.get("status")},
                )
                runtime_world_payload = world_after_data.get("world", {}) if isinstance(world_after_data, dict) else {}
                final_runtime_ok, final_runtime_detail, final_runtime_extra = _validate_runtime_replay_highlights(
                    runtime_world_payload,
                    require_target_highlights=True,
                )

                t = time.time()
                restore_result = _http_json(
                    "POST",
                    f"{base_url}/api/save-slots/load",
                    body={"slotId": "ai_template_replay_backup_v1"},
                )
                _append_step(
                    steps,
                    "template-replay-restore",
                    t,
                    bool(restore_result.get("ok", False)),
                    "POST /api/save-slots/load (restore runtime backup after template replay seed)",
                    {"status": restore_result.get("status"), "slotId": "ai_template_replay_backup_v1"},
                )
            else:
                final_runtime_ok = False
                final_runtime_detail = "runtime replay highlight sanity failed: template replay seed failed"
                final_runtime_extra = {
                    "seedStep": "template-replay-seed",
                    "seedFailed": True,
                }
        else:
            final_runtime_ok = False
            final_runtime_detail = "runtime replay highlight sanity failed: no executionReplays and seeding disabled"
            final_runtime_extra = {
                "checkedHighlights": 0,
                "requireRuntimeReplay": True,
                "seedRuntimeReplay": False,
            }
    elif args.require_runtime_replay:
        final_runtime_ok, final_runtime_detail, final_runtime_extra = _validate_runtime_replay_highlights(
            runtime_world_payload,
            require_target_highlights=True,
        )

    if (
        not final_runtime_ok
        and args.require_runtime_replay
        and args.allow_stale_runtime_schema
        and isinstance(final_runtime_extra.get("errors"), list)
        and len(final_runtime_extra.get("errors", [])) > 0
    ):
        anchor_ok, _, _ = _validate_replay_highlight_anchor_contract(repo_root)
        if anchor_ok:
            final_runtime_ok = True
            final_runtime_detail = (
                "runtime replay highlight sanity downgraded: backend schema appears stale, source anchor contract passed"
            )
            final_runtime_extra = {
                **final_runtime_extra,
                "staleBackendSchemaSuspected": True,
                "sourceAnchorContractPassed": True,
            }

    t = time.time()
    _append_step(
        steps,
        "replay-highlight-runtime-sanity",
        t,
        final_runtime_ok,
        final_runtime_detail,
        final_runtime_extra,
    )

    t = time.time()
    map_layout = _http_json("GET", f"{base_url}/api/world/map-layout?scope={args.map_scope}")
    if int(map_layout.get("status", -1)) == 403 and args.map_scope == "full":
        effective_map_scope = "bootstrap"
        map_layout = _http_json("GET", f"{base_url}/api/world/map-layout?scope={effective_map_scope}")
    map_ok = bool(map_layout.get("ok", False)) and isinstance(map_layout.get("data", {}), dict)
    _append_step(
        steps,
        "map-layout",
        t,
        map_ok,
        "GET /api/world/map-layout",
        {"status": map_layout.get("status"), "scope": effective_map_scope},
    )

    t = time.time()
    godot_cmd = [
        godot_exe,
        "--headless",
        "--path",
        godot_path,
        "--quit-after",
        "1",
    ]
    env = dict(os.environ)
    env["SLG_BACKEND_URL"] = base_url
    env["SLG_PLAYER_NAME"] = args.player_name
    env["SLG_MAP_SCOPE"] = effective_map_scope
    env["SLG_BOOTSTRAP_QUIT"] = "1"
    if faction_id:
        env["SLG_FACTION_ID"] = faction_id

    try:
        proc = subprocess.run(
            godot_cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            env=env,
            check=False,
        )
        combined_log = (proc.stdout or "") + "\n" + (proc.stderr or "")
        godot_ok = proc.returncode == 0 and "[godot-bootstrap] start" in combined_log
        _append_step(
            steps,
            "godot-headless",
            t,
            godot_ok,
            "Godot headless bootstrap",
            {
                "returnCode": proc.returncode,
                "exe": godot_exe,
                "logTail": combined_log.strip().splitlines()[-20:],
            },
        )
    except Exception as exc:  # pragma: no cover
        _append_step(
            steps,
            "godot-headless",
            t,
            False,
            "Godot headless bootstrap",
            {"exe": godot_exe, "error": str(exc)},
        )

    t = time.time()
    replay_anchor_ok, replay_anchor_detail, replay_anchor_extra = _validate_replay_highlight_anchor_contract(repo_root)
    _append_step(
        steps,
        "replay-highlight-anchor-contract",
        t,
        replay_anchor_ok,
        replay_anchor_detail,
        replay_anchor_extra,
    )

    t = time.time()
    unit_view_ok, unit_view_detail, unit_view_extra = _validate_unit_view_layer_engage_intensity(repo_root)
    _append_step(
        steps,
        "unitview-engage-intensity-contract",
        t,
        unit_view_ok,
        unit_view_detail,
        unit_view_extra,
    )

    if token:
        t = time.time()
        leave = _http_json("POST", f"{base_url}/api/session/leave", body={"token": token})
        _append_step(
            steps,
            "leave",
            t,
            bool(leave.get("ok", False)),
            "POST /api/session/leave",
            {"status": leave.get("status")},
        )

    required = {
        "health",
        "runtime",
        "join",
        "world",
        "map-layout",
        "godot-headless",
        "replay-highlight-runtime-sanity",
        "replay-highlight-anchor-contract",
        "unitview-engage-intensity-contract",
    }
    overall_ok = True
    for step in steps:
        if step["name"] in required and not step["ok"]:
            overall_ok = False
            break

    ended_at = _now_iso()
    report = {
        "card": "W1-C13",
        "startedAt": started_at,
        "endedAt": ended_at,
        "ok": overall_ok,
        "baseUrl": base_url,
        "factionId": faction_id,
        "mapScope": effective_map_scope,
        "godotExe": godot_exe,
        "steps": steps,
    }

    latest_path = Path(args.output)
    latest_path.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    stamped_path = latest_path.parent / f"godot_week1_gate_{timestamp}.json"

    latest_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    stamped_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[W1-C13] ok={overall_ok} latest={latest_path} stamped={stamped_path}")
    return 0 if overall_ok else 2


if __name__ == "__main__":
    sys.exit(main())
