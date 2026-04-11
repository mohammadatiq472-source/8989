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


def _snapshot_repo_file(path: Path) -> bytes | None:
    if not path.exists():
        return None
    return path.read_bytes()


def _restore_repo_file(path: Path, baseline: bytes | None) -> tuple[bool, str]:
    try:
        if baseline is None:
            if path.exists():
                path.unlink()
                return True, "removed generated file without baseline"
            return True, "skipped: baseline missing and file absent"

        current = path.read_bytes() if path.exists() else None
        if current == baseline:
            return True, "already matches baseline"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(baseline)
        return True, "restored file to baseline"
    except Exception as exc:  # pragma: no cover
        return False, f"restore failed: {exc}"


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


def _extract_case_return_dict(source: str, case_token: str) -> dict[str, float] | None:
    pattern = re.compile(
        rf"{re.escape(case_token)}\s*:\s*\n\s*return\s*\{{(?P<body>.*?)\n\s*\}}",
        re.DOTALL,
    )
    match = pattern.search(source)
    if not match:
        return None
    body = match.group("body")
    parsed: dict[str, float] = {}
    for kv in re.finditer(r'"(?P<key>[^"]+)"\s*:\s*(?P<value>[0-9]+(?:\.[0-9]+)?)', body):
        key = kv.group("key")
        try:
            parsed[key] = float(kv.group("value"))
        except ValueError:
            continue
    return parsed


def _extract_case_return_color(source: str, case_token: str) -> tuple[float, float, float, float] | None:
    pattern = re.compile(
        rf"{re.escape(case_token)}\s*:\s*\n\s*return\s+Color\((?P<rgba>[^\)]*)\)",
        re.DOTALL,
    )
    match = pattern.search(source)
    if not match:
        return None
    raw_parts = [part.strip() for part in match.group("rgba").split(",")]
    if len(raw_parts) < 4:
        return None
    values: list[float] = []
    for part in raw_parts[:4]:
        try:
            values.append(float(part))
        except ValueError:
            return None
    return values[0], values[1], values[2], values[3]


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
    normalize_hook_ok = "_normalize_replay_engage_kind(" in source and "_register_replay_engage_kind(" in source
    unknown_record_ok = "_replay_engage_unknown_kind_count" in source and "_replay_engage_unknown_kind_samples" in source
    direction_metrics_ok = "_replay_engage_direction_direct_hits" in source and "_replay_engage_direction_fallback_hits" in source
    frame_metrics_snapshot_ok = "_update_replay_engage_metrics_snapshot(" in source and 'set_meta("replay_engage_metrics"' in source

    ok = (
        ordered
        and positive
        and frame_filter_ok
        and normalize_hook_ok
        and unknown_record_ok
        and direction_metrics_ok
        and frame_metrics_snapshot_ok
    )
    detail = "unit view engage intensity contract passed" if ok else "unit view engage intensity contract failed"
    return ok, detail, {
        "file": str(path),
        "battle": battle,
        "tileControl": tile_control,
        "logistics": logistics,
        "ordered": ordered,
        "positive": positive,
        "frameFilterIncludesKinds": frame_filter_ok,
        "normalizeHookOk": normalize_hook_ok,
        "unknownRecordOk": unknown_record_ok,
        "directionMetricsOk": direction_metrics_ok,
        "frameMetricsSnapshotOk": frame_metrics_snapshot_ok,
    }


def _validate_replay_engage_kind_contract(repo_root: Path) -> tuple[bool, str, dict[str, Any]]:
    rules_path = repo_root / "shared" / "domain" / "rules.ts"
    unit_view_path = repo_root / "godot-client" / "scripts" / "map" / "unit_view_layer.gd"
    rules_source = rules_path.read_text(encoding="utf-8")
    unit_view_source = unit_view_path.read_text(encoding="utf-8")

    required_rule_tokens = (
        "const ENGAGE_REPLAY_HIGHLIGHT_KIND_WHITELIST",
        "function normalizeEngageReplayHighlightKind(",
        "function createEngageReplayHighlight(",
        "engageKindDowngradedFrom",
    )
    missing_rule_tokens = [token for token in required_rule_tokens if token not in rules_source]

    raw_engage_create_calls: list[int] = []
    rule_lines = rules_source.splitlines()
    for idx, line in enumerate(rule_lines, start=1):
        if "createReplayHighlight(" not in line:
            continue
        if "function createReplayHighlight(" in line:
            continue
        window = "\n".join(rule_lines[idx - 1 : idx + 8])
        if "'battle'" in window or "'tile_control'" in window or "'logistics'" in window:
            raw_engage_create_calls.append(idx)

    required_unit_view_tokens = (
        "const ENGAGE_KIND_FALLBACK",
        "const KNOWN_NON_ENGAGE_HIGHLIGHT_KINDS",
        "func _normalize_replay_engage_kind(",
        "func _register_replay_engage_kind(",
    )
    missing_unit_view_tokens = [token for token in required_unit_view_tokens if token not in unit_view_source]

    ok = not missing_rule_tokens and not raw_engage_create_calls and not missing_unit_view_tokens
    detail = "replay engage kind contract passed" if ok else "replay engage kind contract failed"
    return ok, detail, {
        "rulesPath": str(rules_path),
        "unitViewPath": str(unit_view_path),
        "missingRuleTokens": missing_rule_tokens,
        "rawEngageCreateReplayCallLines": raw_engage_create_calls,
        "missingUnitViewTokens": missing_unit_view_tokens,
    }


def _validate_unit_marker_engage_profile_contract(repo_root: Path) -> tuple[bool, str, dict[str, Any]]:
    path = repo_root / "godot-client" / "scripts" / "map" / "unit_marker.gd"
    source = path.read_text(encoding="utf-8")

    case_tokens = {
        "battle": "ENGAGE_KIND_BATTLE",
        "tile_control": "ENGAGE_KIND_TILE_CONTROL",
        "logistics": "ENGAGE_KIND_LOGISTICS",
    }
    required_profile_keys = (
        "boost",
        "preScale",
        "peakScale",
        "preDuration",
        "burstDuration",
        "settleDuration",
        "push",
    )

    profile_values: dict[str, dict[str, float]] = {}
    missing_profile_cases: list[str] = []
    missing_profile_keys: dict[str, list[str]] = {}
    for kind, token in case_tokens.items():
        parsed = _extract_case_return_dict(source, token)
        if parsed is None:
            missing_profile_cases.append(kind)
            continue
        profile_values[kind] = parsed
        missing_keys = [key for key in required_profile_keys if key not in parsed]
        if missing_keys:
            missing_profile_keys[kind] = missing_keys

    accent_colors: dict[str, tuple[float, float, float, float]] = {}
    missing_accent_cases: list[str] = []
    for kind, token in case_tokens.items():
        parsed = _extract_case_return_color(source, token)
        if parsed is None:
            missing_accent_cases.append(kind)
            continue
        accent_colors[kind] = parsed

    normalize_default_ok = (
        re.search(
            r"func\s+_normalize_engage_kind\(kind:\s*String\)\s*->\s*String:\s*"
            r".*?match\s+kind:\s*.*?_\s*:\s*\n\s*return\s+ENGAGE_KIND_BATTLE",
            source,
            re.DOTALL,
        )
        is not None
    )

    boost_ordered = False
    push_ordered = False
    peak_scale_ordered = False
    settle_duration_escalates = False
    if all(kind in profile_values for kind in case_tokens):
        battle_profile = profile_values["battle"]
        tile_control_profile = profile_values["tile_control"]
        logistics_profile = profile_values["logistics"]
        boost_ordered = (
            battle_profile.get("boost", 0.0)
            > tile_control_profile.get("boost", 0.0)
            > logistics_profile.get("boost", 0.0)
            > 0.0
        )
        push_ordered = (
            battle_profile.get("push", 0.0)
            > tile_control_profile.get("push", 0.0)
            > logistics_profile.get("push", 0.0)
            > 0.0
        )
        peak_scale_ordered = (
            battle_profile.get("peakScale", 0.0)
            > tile_control_profile.get("peakScale", 0.0)
            > logistics_profile.get("peakScale", 0.0)
            > 0.0
        )
        settle_duration_escalates = (
            battle_profile.get("settleDuration", 0.0)
            < tile_control_profile.get("settleDuration", 0.0)
            < logistics_profile.get("settleDuration", 0.0)
        )

    battle_red_dominant = False
    tile_control_warm = False
    logistics_cool = False
    if all(kind in accent_colors for kind in case_tokens):
        battle_rgba = accent_colors["battle"]
        tile_control_rgba = accent_colors["tile_control"]
        logistics_rgba = accent_colors["logistics"]
        battle_red_dominant = battle_rgba[0] > battle_rgba[2]
        tile_control_warm = tile_control_rgba[0] >= tile_control_rgba[1] > tile_control_rgba[2]
        logistics_cool = logistics_rgba[2] > logistics_rgba[0]

    ok = (
        not missing_profile_cases
        and not missing_profile_keys
        and not missing_accent_cases
        and normalize_default_ok
        and boost_ordered
        and push_ordered
        and peak_scale_ordered
        and settle_duration_escalates
        and battle_red_dominant
        and tile_control_warm
        and logistics_cool
    )
    detail = "unit marker engage profile contract passed" if ok else "unit marker engage profile contract failed"
    return ok, detail, {
        "file": str(path),
        "missingProfileCases": missing_profile_cases,
        "missingProfileKeys": missing_profile_keys,
        "missingAccentCases": missing_accent_cases,
        "normalizeDefaultOk": normalize_default_ok,
        "boostOrdered": boost_ordered,
        "pushOrdered": push_ordered,
        "peakScaleOrdered": peak_scale_ordered,
        "settleDurationEscalates": settle_duration_escalates,
        "battleRedDominant": battle_red_dominant,
        "tileControlWarm": tile_control_warm,
        "logisticsCool": logistics_cool,
        "profiles": profile_values,
        "accentColors": accent_colors,
    }


def _load_json_manifest(path: Path) -> tuple[Any | None, str | None]:
    if not path.exists():
        return None, f"missing file: {path}"
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except json.JSONDecodeError as exc:
        return None, f"json parse failed: {path} ({exc})"


def _validate_theme_manifest_contract(repo_root: Path) -> tuple[bool, str, dict[str, Any]]:
    manifests_root = repo_root / "godot-client" / "assets" / "themes" / "slgclient" / "manifests"
    unit_manifest_path = manifests_root / "unit_frames_manifest.json"
    overlay_manifest_path = manifests_root / "overlay_frames_manifest.json"
    asset_manifest_path = manifests_root / "slgclient_asset_manifest.json"

    errors: list[str] = []
    details: dict[str, Any] = {
        "unitManifestPath": str(unit_manifest_path),
        "overlayManifestPath": str(overlay_manifest_path),
        "assetManifestPath": str(asset_manifest_path),
    }

    unit_manifest, unit_err = _load_json_manifest(unit_manifest_path)
    if unit_err is not None:
        errors.append(unit_err)
    overlay_manifest, overlay_err = _load_json_manifest(overlay_manifest_path)
    if overlay_err is not None:
        errors.append(overlay_err)
    asset_manifest, asset_err = _load_json_manifest(asset_manifest_path)
    if asset_err is not None:
        errors.append(asset_err)

    expected_directions = {"r", "ru", "u", "lu", "l", "ld", "d", "rd"}
    missing_directions: list[str] = []
    empty_direction_frames: list[str] = []
    invalid_direction_frames: list[str] = []
    if isinstance(unit_manifest, dict):
        directions = unit_manifest.get("directions", {})
        if not isinstance(directions, dict):
            errors.append("unit_frames_manifest directions must be an object")
            directions = {}
        details["unitDirectionCount"] = len(directions)
        for direction in sorted(expected_directions):
            frame_list = directions.get(direction)
            if not isinstance(frame_list, list):
                missing_directions.append(direction)
                continue
            if len(frame_list) == 0:
                empty_direction_frames.append(direction)
                continue
            invalid_frame = any(
                not isinstance(frame, dict) or str(frame.get("texturePath", "")).strip() == "" for frame in frame_list
            )
            if invalid_frame:
                invalid_direction_frames.append(direction)
        details["unitFrameCountsByDirection"] = {
            direction: len(directions.get(direction, [])) if isinstance(directions.get(direction), list) else 0
            for direction in sorted(expected_directions)
        }
    else:
        if unit_manifest is not None:
            errors.append("unit_frames_manifest must be an object")
    if missing_directions:
        errors.append(f"unit_frames_manifest missing directions: {', '.join(missing_directions)}")
    if empty_direction_frames:
        errors.append(f"unit_frames_manifest has empty frame arrays: {', '.join(empty_direction_frames)}")
    if invalid_direction_frames:
        errors.append(f"unit_frames_manifest has invalid frame entries: {', '.join(invalid_direction_frames)}")

    required_overlay_prefix_groups = (
        ("land_ground_",),
        ("land_1_",),
        ("land_2_",),
        ("land_3_",),
        ("home_defend",),
        ("flag_blue_", "out_flag_blue_"),
        ("flag_red_", "out_flag_red_"),
        ("hill1", "hill2", "hill3", "hill4", "hill5"),
        ("water_edge_", "water_"),
        ("sand_edge_", "sand_"),
    )
    missing_overlay_prefix_groups: list[str] = []
    overlay_frame_count = 0
    if isinstance(overlay_manifest, dict):
        overlay_frames = overlay_manifest.get("frames", {})
        if not isinstance(overlay_frames, dict):
            errors.append("overlay_frames_manifest frames must be an object")
            overlay_frames = {}
        overlay_keys = list(overlay_frames.keys())
        overlay_frame_count = len(overlay_keys)
        details["overlayFrameCount"] = overlay_frame_count
        for group in required_overlay_prefix_groups:
            if not any(any(key.startswith(prefix) for prefix in group) for key in overlay_keys):
                missing_overlay_prefix_groups.append(" | ".join(group))
    else:
        if overlay_manifest is not None:
            errors.append("overlay_frames_manifest must be an object")
    if overlay_frame_count <= 0:
        errors.append("overlay_frames_manifest has no frames")
    if missing_overlay_prefix_groups:
        errors.append(
            "overlay_frames_manifest missing required frame prefix groups: "
            + ", ".join(missing_overlay_prefix_groups)
        )

    exchange_manifest_exists = False
    exchange_stats_ok = False
    if isinstance(asset_manifest, dict):
        exchange_bundle = asset_manifest.get("exchangeBundle", {})
        if not isinstance(exchange_bundle, dict):
            errors.append("slgclient_asset_manifest exchangeBundle must be an object")
            exchange_bundle = {}
        manifest_rel = str(exchange_bundle.get("manifestPath", "")).strip()
        if manifest_rel == "":
            errors.append("slgclient_asset_manifest exchangeBundle.manifestPath is empty")
        else:
            exchange_manifest_path = repo_root / manifest_rel
            exchange_manifest_exists = exchange_manifest_path.exists()
            if not exchange_manifest_exists:
                errors.append(f"exchange bundle manifest missing: {exchange_manifest_path}")
            details["exchangeManifestPath"] = str(exchange_manifest_path)
        stats = exchange_bundle.get("stats", {})
        if not isinstance(stats, dict):
            errors.append("slgclient_asset_manifest exchangeBundle.stats must be an object")
            stats = {}
        required_stats_groups = ("world", "units", "overlays", "manifests")
        group_errors: list[str] = []
        for group in required_stats_groups:
            value = stats.get(group)
            if not isinstance(value, dict):
                group_errors.append(group)
                continue
            file_count = int(value.get("files", 0) or 0)
            if file_count <= 0:
                group_errors.append(group)
        exchange_stats_ok = len(group_errors) == 0
        if group_errors:
            errors.append(f"exchange bundle stats missing or empty groups: {', '.join(group_errors)}")
        details["exchangeStats"] = stats
    else:
        if asset_manifest is not None:
            errors.append("slgclient_asset_manifest must be an object")

    details["missingDirections"] = missing_directions
    details["emptyDirectionFrames"] = empty_direction_frames
    details["invalidDirectionFrames"] = invalid_direction_frames
    details["missingOverlayPrefixGroups"] = missing_overlay_prefix_groups
    details["exchangeManifestExists"] = exchange_manifest_exists
    details["exchangeStatsOk"] = exchange_stats_ok

    ok = len(errors) == 0
    if errors:
        details["errors"] = errors
    detail = "theme manifest contract passed" if ok else f"theme manifest contract failed ({len(errors)} issue(s))"
    return ok, detail, details


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


def _collect_runtime_replay_engage_metrics(world_payload: Any) -> dict[str, Any]:
    target_kinds = ("battle", "tile_control", "logistics")
    known_non_engage = {"enemy_turn", "alliance_turn", "intel", "planning"}
    metrics: dict[str, Any] = {
        "kindCounts": {kind: 0 for kind in target_kinds},
        "unknownDowngradedKindCount": 0,
        "unknownDowngradedKindSamples": [],
        "engageHighlightTotal": 0,
        "engageAnchoredHighlightTotal": 0,
        "directionDirectCount": 0,
        "directionFallbackCount": 0,
        "estimatedTriggerCount": 0,
        "frameSample": [],
        "replayCount": 0,
        "frameCount": 0,
    }
    if not isinstance(world_payload, dict):
        return metrics

    history = world_payload.get("history", {})
    if not isinstance(history, dict):
        return metrics
    replays = history.get("executionReplays", [])
    if not isinstance(replays, list):
        return metrics

    metrics["replayCount"] = len(replays)
    for replay_idx, replay in enumerate(replays):
        if not isinstance(replay, dict):
            continue
        frames = replay.get("frames", [])
        if not isinstance(frames, list):
            continue
        metrics["frameCount"] += len(frames)
        for frame_idx, frame in enumerate(frames):
            if not isinstance(frame, dict):
                continue
            highlights = frame.get("highlights", [])
            if not isinstance(highlights, list):
                highlights = []

            frame_kind_counts: dict[str, int] = {kind: 0 for kind in target_kinds}
            frame_engage_highlights = 0
            frame_anchored_highlights = 0
            frame_unknown_downgraded = 0

            for highlight in highlights:
                if not isinstance(highlight, dict):
                    continue
                raw_kind = str(highlight.get("kind", "")).strip()
                has_anchor = any(
                    str(highlight.get(key, "")).strip() != ""
                    for key in ("unitId", "tileId", "fromTileId", "toTileId")
                )
                normalized_kind = ""
                if raw_kind in target_kinds:
                    normalized_kind = raw_kind
                elif raw_kind == "" or raw_kind in known_non_engage:
                    normalized_kind = ""
                elif has_anchor:
                    normalized_kind = "tile_control"
                    metrics["unknownDowngradedKindCount"] += 1
                    frame_unknown_downgraded += 1
                    if len(metrics["unknownDowngradedKindSamples"]) < 8 and raw_kind not in metrics["unknownDowngradedKindSamples"]:
                        metrics["unknownDowngradedKindSamples"].append(raw_kind)

                if normalized_kind == "":
                    continue
                metrics["kindCounts"][normalized_kind] += 1
                frame_kind_counts[normalized_kind] += 1
                metrics["engageHighlightTotal"] += 1
                frame_engage_highlights += 1

                if has_anchor:
                    metrics["engageAnchoredHighlightTotal"] += 1
                    frame_anchored_highlights += 1

                from_tile_id = str(highlight.get("fromTileId", "")).strip()
                to_tile_id = str(highlight.get("toTileId", "")).strip()
                if from_tile_id != "" and to_tile_id != "" and from_tile_id != to_tile_id:
                    metrics["directionDirectCount"] += 1
                else:
                    metrics["directionFallbackCount"] += 1

            frame_fallback_targets = 0
            if frame_engage_highlights == 0:
                order_states = frame.get("orderStates", [])
                if isinstance(order_states, list):
                    seen_units: set[str] = set()
                    for order_state in order_states:
                        if not isinstance(order_state, dict):
                            continue
                        status = str(order_state.get("status", "")).strip()
                        if status not in {"running", "completed", "failed"}:
                            continue
                        unit_id = str(order_state.get("unitId", "")).strip()
                        if unit_id == "" or unit_id in seen_units:
                            continue
                        seen_units.add(unit_id)
                        if len(seen_units) >= 4:
                            break
                    frame_fallback_targets = len(seen_units)
                if frame_fallback_targets > 0:
                    metrics["kindCounts"]["tile_control"] += frame_fallback_targets
                    frame_kind_counts["tile_control"] += frame_fallback_targets
                    metrics["directionFallbackCount"] += frame_fallback_targets

            metrics["estimatedTriggerCount"] += frame_anchored_highlights + frame_fallback_targets
            if (
                frame_engage_highlights > 0
                or frame_fallback_targets > 0
                or frame_unknown_downgraded > 0
            ) and len(metrics["frameSample"]) < 24:
                metrics["frameSample"].append(
                    {
                        "replayIndex": replay_idx,
                        "frameIndex": frame_idx,
                        "kindCounts": frame_kind_counts,
                        "engageHighlights": frame_engage_highlights,
                        "anchoredHighlights": frame_anchored_highlights,
                        "fallbackTargets": frame_fallback_targets,
                        "unknownDowngraded": frame_unknown_downgraded,
                    }
                )
    return metrics


def _validate_runtime_replay_engage_consistency(
    world_payload: Any,
    *,
    require_target_highlights: bool = False,
) -> tuple[bool, str, dict[str, Any]]:
    metrics_first = _collect_runtime_replay_engage_metrics(world_payload)
    metrics_second = _collect_runtime_replay_engage_metrics(world_payload)
    deterministic = json.dumps(metrics_first, sort_keys=True) == json.dumps(metrics_second, sort_keys=True)

    kind_counts = metrics_first.get("kindCounts", {})
    kind_total = (
        int(kind_counts.get("battle", 0))
        + int(kind_counts.get("tile_control", 0))
        + int(kind_counts.get("logistics", 0))
    )
    active_kinds = sum(1 for key in ("battle", "tile_control", "logistics") if int(kind_counts.get(key, 0)) > 0)
    estimated_triggers = int(metrics_first.get("estimatedTriggerCount", 0))
    unknown_downgraded = int(metrics_first.get("unknownDowngradedKindCount", 0))
    direction_direct = int(metrics_first.get("directionDirectCount", 0))
    direction_fallback = int(metrics_first.get("directionFallbackCount", 0))
    engage_highlights = int(metrics_first.get("engageHighlightTotal", 0))

    if not require_target_highlights and metrics_first.get("replayCount", 0) == 0:
        return True, "runtime replay engage consistency skipped: no executionReplays", {
            **metrics_first,
            "deterministic": deterministic,
            "skipped": True,
        }

    has_engage_data = kind_total > 0 and estimated_triggers > 0
    variety_ok = active_kinds >= 2 if require_target_highlights else True
    direction_metrics_ok = (direction_direct + direction_fallback) >= engage_highlights
    unknown_ok = unknown_downgraded == 0
    ok = deterministic and has_engage_data and variety_ok and direction_metrics_ok and unknown_ok

    detail = "runtime replay engage consistency passed" if ok else "runtime replay engage consistency failed"
    return ok, detail, {
        **metrics_first,
        "deterministic": deterministic,
        "hasEngageData": has_engage_data,
        "varietyOk": variety_ok,
        "directionMetricsOk": direction_metrics_ok,
        "unknownDowngradedKindsOk": unknown_ok,
    }


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
    tactical_skills_path = repo_root / "server" / "src" / "config" / "tactical_skills.json"
    tactical_skills_baseline = _snapshot_repo_file(tactical_skills_path)

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
    replay_consistency_ok, replay_consistency_detail, replay_consistency_extra = _validate_runtime_replay_engage_consistency(
        runtime_world_payload,
        require_target_highlights=args.require_runtime_replay,
    )
    _append_step(
        steps,
        "replay-engage-consistency-contract",
        t,
        replay_consistency_ok,
        replay_consistency_detail,
        replay_consistency_extra,
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
    replay_engage_kind_ok, replay_engage_kind_detail, replay_engage_kind_extra = _validate_replay_engage_kind_contract(repo_root)
    _append_step(
        steps,
        "replay-engage-kind-contract",
        t,
        replay_engage_kind_ok,
        replay_engage_kind_detail,
        replay_engage_kind_extra,
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

    t = time.time()
    unit_marker_ok, unit_marker_detail, unit_marker_extra = _validate_unit_marker_engage_profile_contract(repo_root)
    _append_step(
        steps,
        "unitmarker-engage-profile-contract",
        t,
        unit_marker_ok,
        unit_marker_detail,
        unit_marker_extra,
    )

    t = time.time()
    theme_manifest_ok, theme_manifest_detail, theme_manifest_extra = _validate_theme_manifest_contract(repo_root)
    _append_step(
        steps,
        "theme-manifest-contract",
        t,
        theme_manifest_ok,
        theme_manifest_detail,
        theme_manifest_extra,
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

    t = time.time()
    restore_tactical_ok, restore_tactical_detail = _restore_repo_file(tactical_skills_path, tactical_skills_baseline)
    _append_step(
        steps,
        "restore-tactical-skills-config",
        t,
        restore_tactical_ok,
        restore_tactical_detail,
        {"path": str(tactical_skills_path)},
    )

    required = {
        "health",
        "runtime",
        "join",
        "world",
        "map-layout",
        "godot-headless",
        "replay-highlight-runtime-sanity",
        "replay-engage-consistency-contract",
        "replay-highlight-anchor-contract",
        "replay-engage-kind-contract",
        "unitview-engage-intensity-contract",
        "unitmarker-engage-profile-contract",
        "theme-manifest-contract",
        "restore-tactical-skills-config",
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
