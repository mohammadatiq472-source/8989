#!/usr/bin/env python3
"""
SLG Godot/Backend Ops CLI

Purpose:
- Provide a reproducible CLI control surface for AI-driven workflows.
- Use backend authoritative APIs for session/world actions.
- Optionally run Godot headless bootstrap for engine-level smoke.

Official usage examples:
  py -3.11 godot-client/tools/slg_ops_cli.py health
  py -3.11 godot-client/tools/slg_ops_cli.py runtime
  py -3.11 godot-client/tools/slg_ops_cli.py join --faction-id player --player-name ai_cli
  py -3.11 godot-client/tools/slg_ops_cli.py advance-tick
  py -3.11 godot-client/tools/slg_ops_cli.py world-action-templates
  py -3.11 godot-client/tools/slg_ops_cli.py world-action-template --template move_first_unit --faction-id player
  py -3.11 godot-client/tools/slg_ops_cli.py template-replay --scenario baseline_v1
  py -3.11 godot-client/tools/slg_ops_cli.py headless
  py -3.11 godot-client/tools/slg_ops_cli.py bootstrap-chain --output tmp/gates/godot_ops_bootstrap_latest.json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = os.getenv("SLG_BACKEND_URL", "http://127.0.0.1:8787").rstrip("/")
DEFAULT_GODOT_EXE = r"D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe"
DEFAULT_PROJECT_PATH = "godot-client"
DEFAULT_TEMPLATE_REPLAY_REPORT_PATH = "tmp/gates/ai_ops_template_replay_latest.json"
DEFAULT_TEMPLATE_REPLAY_FIXTURE_SLOT_ID = "ai_template_replay_fixture_v1"
DEFAULT_TEMPLATE_REPLAY_BACKUP_SLOT_ID = "ai_template_replay_backup_v1"
WORLD_ACTION_TEMPLATE_CHOICES = (
    "advance_tick",
    "clear_plan_execution",
    "preview_national_agenda",
    "preview_court_session",
    "move_first_unit",
    "upgrade_first_city",
    "tactical_override_first_unit",
)
TACTICAL_OVERRIDE_TEMPLATE_CHOICES = (
    "rally",
    "harass",
    "withdraw",
    "breakthrough",
    "sweep",
    "garrison",
)
TEMPLATE_REPLAY_SCENARIO_CHOICES = ("baseline_v1",)
WORLD_ACTION_EVENT_NAME_MAP: dict[str, str] = {
    "advanceTick": "advance_tick",
    "clearPlanExecution": "clear_plan_execution",
    "previewNationalAgenda": "preview_national_agenda",
    "previewCourtSession": "preview_court_session",
    "moveUnit": "move_unit",
    "upgradeCity": "upgrade_city",
    "queueTacticalOverride": "queue_tactical_override",
}


@dataclass
class CliContext:
    base_url: str
    timeout_sec: float
    output: str | None
    compact: bool


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _json_dumps(payload: Any, compact: bool = False) -> str:
    if compact:
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _print_and_maybe_write(payload: Any, ctx: CliContext) -> None:
    body = _json_dumps(payload, compact=ctx.compact)
    print(body)
    if ctx.output:
        output_path = Path(ctx.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(body + ("\n" if not body.endswith("\n") else ""), encoding="utf-8")


def _http_json(
    base_url: str,
    path: str,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    timeout_sec: float = 15.0,
) -> dict[str, Any]:
    url = f"{base_url}{path}"
    payload: bytes | None = None
    headers = {"Content-Type": "application/json"}
    if body is not None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")

    req = Request(url=url, data=payload, method=method.upper(), headers=headers)
    started = time.time()
    try:
        with urlopen(req, timeout=timeout_sec) as resp:
            status = int(getattr(resp, "status", 200))
            text = resp.read().decode("utf-8", errors="replace")
            data: Any
            try:
                data = json.loads(text) if text.strip() else {}
            except json.JSONDecodeError:
                data = {"raw": text}
            return {
                "ok": 200 <= status < 300,
                "status": status,
                "durationMs": int((time.time() - started) * 1000),
                "path": path,
                "method": method.upper(),
                "data": data,
            }
    except HTTPError as error:
        text = error.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(text) if text.strip() else {}
        except json.JSONDecodeError:
            data = {"raw": text}
        return {
            "ok": False,
            "status": int(error.code),
            "durationMs": int((time.time() - started) * 1000),
            "path": path,
            "method": method.upper(),
            "error": "http_error",
            "message": str(error),
            "data": data,
        }
    except URLError as error:
        return {
            "ok": False,
            "status": -1,
            "durationMs": int((time.time() - started) * 1000),
            "path": path,
            "method": method.upper(),
            "error": "url_error",
            "message": str(error.reason),
        }
    except Exception as error:  # pragma: no cover
        return {
            "ok": False,
            "status": -1,
            "durationMs": int((time.time() - started) * 1000),
            "path": path,
            "method": method.upper(),
            "error": "request_failed",
            "message": str(error),
        }


def _summarize_world_like(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload

    world: dict[str, Any] | None = None
    if isinstance(payload.get("world"), dict):
        world = payload.get("world")
    elif "map" in payload and "factions" in payload:
        world = payload

    if world is None:
        return payload

    map_data = world.get("map", {})
    factions = world.get("factions", {})
    units = world.get("units", [])
    reports = world.get("reports", [])
    queue = world.get("planExecutionQueue", [])

    return {
        "summaryMode": "world_like_summary_v1",
        "tick": world.get("tick"),
        "worldVersion": world.get("worldVersion"),
        "map": {
            "width": map_data.get("width"),
            "height": map_data.get("height"),
            "tileCount": len(map_data.get("tiles", [])) if isinstance(map_data.get("tiles", []), list) else None,
        },
        "factions": {
            "count": len(factions) if isinstance(factions, dict) else None,
            "ids": list(factions.keys())[:12] if isinstance(factions, dict) else [],
        },
        "units": {
            "count": len(units) if isinstance(units, list) else None,
        },
        "reports": {
            "count": len(reports) if isinstance(reports, list) else None,
        },
        "planQueue": {
            "count": len(queue) if isinstance(queue, list) else None,
        },
    }


def _summarize_map_layout_like(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload

    map_data = payload.get("map", {})
    chunks = payload.get("chunks", [])
    provinces = payload.get("provinces", [])
    regions = payload.get("regions", [])
    districts = payload.get("districts", [])

    tiles_value = map_data.get("tiles", []) if isinstance(map_data, dict) else []
    tile_count = len(tiles_value) if isinstance(tiles_value, list) else None

    chunk_summaries: list[dict[str, Any]] = []
    if isinstance(chunks, list):
        for chunk in chunks[:6]:
            if not isinstance(chunk, dict):
                continue
            chunk_tiles = chunk.get("tiles", [])
            chunk_summaries.append(
                {
                    "id": chunk.get("id") or chunk.get("chunkId"),
                    "x": chunk.get("x"),
                    "y": chunk.get("y"),
                    "width": chunk.get("width"),
                    "height": chunk.get("height"),
                    "tileCount": len(chunk_tiles) if isinstance(chunk_tiles, list) else None,
                }
            )

    return {
        "summaryMode": "map_layout_summary_v1",
        "mapLayoutVersion": payload.get("mapLayoutVersion"),
        "scope": payload.get("scope"),
        "map": {
            "width": map_data.get("width") if isinstance(map_data, dict) else None,
            "height": map_data.get("height") if isinstance(map_data, dict) else None,
            "tileCount": tile_count,
        },
        "chunks": {
            "count": len(chunks) if isinstance(chunks, list) else None,
            "sample": chunk_summaries,
        },
        "provinces": {
            "count": len(provinces) if isinstance(provinces, list) else None,
        },
        "regions": {
            "count": len(regions) if isinstance(regions, list) else None,
        },
        "districts": {
            "count": len(districts) if isinstance(districts, list) else None,
        },
    }


def _resolve_faction_id(ctx: CliContext, preferred_faction_id: str | None) -> str | None:
    if preferred_faction_id:
        return preferred_faction_id

    runtime = _http_json(ctx.base_url, "/api/session/runtime", "GET", timeout_sec=ctx.timeout_sec)
    if not runtime.get("ok"):
        return None

    rows = runtime.get("data", {}).get("factions", [])
    if not isinstance(rows, list) or len(rows) == 0:
        return None

    for row in rows:
        if isinstance(row, dict) and int(row.get("onlineSeatCount", 0)) <= 0:
            faction_id = str(row.get("factionId", "")).strip()
            if faction_id:
                return faction_id

    first_row = rows[0]
    if isinstance(first_row, dict):
        faction_id = str(first_row.get("factionId", "")).strip()
        if faction_id:
            return faction_id
    return None


def cmd_health(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    result = _http_json(ctx.base_url, "/api/health", "GET", timeout_sec=ctx.timeout_sec)
    return (0 if result.get("ok") else 1), {"command": "health", "at": _now_iso(), "result": result}


def cmd_runtime(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    result = _http_json(ctx.base_url, "/api/session/runtime", "GET", timeout_sec=ctx.timeout_sec)
    return (0 if result.get("ok") else 1), {"command": "runtime", "at": _now_iso(), "result": result}


def cmd_join(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    faction_id = _resolve_faction_id(ctx, args.faction_id)
    if not faction_id:
        return 1, {"command": "join", "at": _now_iso(), "ok": False, "error": "faction_resolve_failed"}
    payload = {"factionId": faction_id, "playerName": args.player_name}
    result = _http_json(ctx.base_url, "/api/session/join", "POST", payload, timeout_sec=ctx.timeout_sec)
    return (0 if result.get("ok") else 1), {
        "command": "join",
        "at": _now_iso(),
        "request": payload,
        "result": result,
    }


def cmd_heartbeat(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    result = _http_json(
        ctx.base_url,
        "/api/session/heartbeat",
        "POST",
        {"token": args.token},
        timeout_sec=ctx.timeout_sec,
    )
    return (0 if result.get("ok") else 1), {"command": "heartbeat", "at": _now_iso(), "result": result}


def cmd_autonomy(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    result = _http_json(
        ctx.base_url,
        "/api/session/autonomy",
        "POST",
        {"token": args.token, "level": args.level},
        timeout_sec=ctx.timeout_sec,
    )
    return (0 if result.get("ok") else 1), {"command": "autonomy", "at": _now_iso(), "result": result}


def cmd_leave(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    result = _http_json(
        ctx.base_url,
        "/api/session/leave",
        "POST",
        {"token": args.token},
        timeout_sec=ctx.timeout_sec,
    )
    return (0 if result.get("ok") else 1), {"command": "leave", "at": _now_iso(), "result": result}


def cmd_world(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    intel_mode = "full" if args.intel_mode == "full" else "sparse"
    result = _http_json(ctx.base_url, f"/api/world?intelMode={intel_mode}", "GET", timeout_sec=ctx.timeout_sec)
    output_result = dict(result)
    if result.get("ok") and not args.raw:
        output_result["data"] = _summarize_world_like(result.get("data", {}))
    return (0 if result.get("ok") else 1), {
        "command": "world",
        "at": _now_iso(),
        "intelMode": intel_mode,
        "result": output_result,
    }


def cmd_map_layout(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    scope = quote(args.scope, safe="")
    result = _http_json(ctx.base_url, f"/api/world/map-layout?scope={scope}", "GET", timeout_sec=ctx.timeout_sec)
    output_result = dict(result)
    if result.get("ok") and not args.raw:
        output_result["data"] = _summarize_map_layout_like(result.get("data", {}))
    return (0 if result.get("ok") else 1), {
        "command": "map-layout",
        "at": _now_iso(),
        "scope": args.scope,
        "result": output_result,
    }


def _parse_payload_json(payload_json: str | None) -> dict[str, Any]:
    if not payload_json:
        return {}
    parsed = json.loads(payload_json)
    if not isinstance(parsed, dict):
        raise ValueError("payload-json must be a JSON object")
    return parsed


def _read_world_state_from_world_result(result: dict[str, Any]) -> dict[str, Any]:
    data = result.get("data", {})
    if not isinstance(data, dict):
        return {}
    world = data.get("world", data)
    if not isinstance(world, dict):
        return {}
    return world


def _load_world_state(ctx: CliContext) -> tuple[dict[str, Any], dict[str, Any]]:
    world_result = _http_json(ctx.base_url, "/api/world?intelMode=full", "GET", timeout_sec=ctx.timeout_sec)
    world_state = _read_world_state_from_world_result(world_result)

    # /api/world summary may omit map connections in some modes.
    # Pull map-layout snapshot to complete move/override template auto-resolve.
    map_data = world_state.get("map", {})
    has_connections = isinstance(map_data, dict) and isinstance(map_data.get("connections"), dict)
    if not has_connections:
        map_layout_result = _http_json(ctx.base_url, "/api/world/map-layout?scope=bootstrap", "GET", timeout_sec=ctx.timeout_sec)
        map_layout_data = map_layout_result.get("data", {})
        if isinstance(map_layout_data, dict):
            layout_map = map_layout_data.get("map", {})
            if isinstance(layout_map, dict):
                if not isinstance(map_data, dict):
                    map_data = {}
                if not isinstance(map_data.get("connections"), dict) and isinstance(layout_map.get("connections"), dict):
                    map_data["connections"] = layout_map.get("connections", {})
                if not isinstance(map_data.get("tiles"), list) and isinstance(layout_map.get("tiles"), list):
                    map_data["tiles"] = layout_map.get("tiles", [])
                world_state["map"] = map_data

    return world_state, world_result


def _pick_faction_unit(world_state: dict[str, Any], faction_id: str, preferred_unit_id: str) -> dict[str, Any] | None:
    units = world_state.get("units", [])
    if not isinstance(units, list):
        return None

    normalized_unit_id = preferred_unit_id.strip()
    if normalized_unit_id:
        for unit in units:
            if isinstance(unit, dict) and str(unit.get("id", "")) == normalized_unit_id:
                return unit

    for unit in units:
        if not isinstance(unit, dict):
            continue
        if str(unit.get("faction", "")) == faction_id:
            return unit
    return None


def _pick_adjacent_target_tile(world_state: dict[str, Any], unit_tile_id: str, preferred_target_tile_id: str) -> str | None:
    normalized_target = preferred_target_tile_id.strip()
    if normalized_target:
        return normalized_target

    map_data = world_state.get("map", {})
    if not isinstance(map_data, dict):
        return None
    connections = map_data.get("connections", {})
    if not isinstance(connections, dict):
        return None

    neighbors = connections.get(unit_tile_id, [])
    if not isinstance(neighbors, list):
        return None
    for tile_id in neighbors:
        if isinstance(tile_id, str) and tile_id and tile_id != unit_tile_id:
            return tile_id
    for tile_id in neighbors:
        if isinstance(tile_id, str) and tile_id:
            return tile_id
    return None


def _pick_owned_city_tile(world_state: dict[str, Any], faction_id: str, preferred_city_tile_id: str) -> str | None:
    normalized_tile_id = preferred_city_tile_id.strip()
    if normalized_tile_id:
        return normalized_tile_id

    map_data = world_state.get("map", {})
    if not isinstance(map_data, dict):
        return None
    tiles = map_data.get("tiles", [])
    if not isinstance(tiles, list):
        return None

    for tile in tiles:
        if not isinstance(tile, dict):
            continue
        if str(tile.get("owner", "")) != faction_id:
            continue
        tile_id = str(tile.get("id", "")).strip()
        if tile_id == "":
            continue
        tile_type = str(tile.get("type", ""))
        if tile_type in ("city", "capital") or isinstance(tile.get("cityLevel"), (int, float)):
            return tile_id
    return None


def _build_world_action_template_request(args: argparse.Namespace, ctx: CliContext) -> tuple[dict[str, Any] | None, dict[str, Any], str | None]:
    template = str(args.template)
    include_world_default = template not in ("preview_national_agenda", "preview_court_session")
    include_world: bool = include_world_default if args.include_world is None else bool(args.include_world)

    if template == "advance_tick":
        return (
            {"action": "advanceTick", "payload": {}, "includeWorld": include_world},
            {"template": template},
            None,
        )

    if template == "preview_national_agenda":
        return (
            {"action": "previewNationalAgenda", "payload": {"maxOptions": 5}, "includeWorld": include_world},
            {"template": template, "maxOptions": 5},
            None,
        )

    if template == "preview_court_session":
        return (
            {
                "action": "previewCourtSession",
                "payload": {"maxProposals": 5, "maxOptions": 5},
                "includeWorld": include_world,
            },
            {"template": template, "maxProposals": 5, "maxOptions": 5},
            None,
        )

    faction_id = _resolve_faction_id(ctx, args.faction_id)
    if not faction_id:
        return None, {"template": template}, "faction_resolve_failed"

    if template == "clear_plan_execution":
        return (
            {"action": "clearPlanExecution", "payload": {"factionId": faction_id}, "includeWorld": include_world},
            {"template": template, "factionId": faction_id},
            None,
        )

    world_state, world_result = _load_world_state(ctx)
    if not bool(world_result.get("ok", False)):
        return None, {"template": template, "worldLoad": world_result}, "world_load_failed"

    if template == "upgrade_first_city":
        tile_id = _pick_owned_city_tile(world_state, faction_id, args.city_tile_id)
        if not tile_id:
            return None, {"template": template, "factionId": faction_id}, "city_tile_resolve_failed"
        return (
            {"action": "upgradeCity", "payload": {"factionId": faction_id, "tileId": tile_id}, "includeWorld": include_world},
            {"template": template, "factionId": faction_id, "tileId": tile_id},
            None,
        )

    unit = _pick_faction_unit(world_state, faction_id, args.unit_id)
    if not unit:
        return None, {"template": template, "factionId": faction_id}, "unit_resolve_failed"

    unit_id = str(unit.get("id", "")).strip()
    unit_tile_id = str(unit.get("tileId", "")).strip()
    if unit_id == "" or unit_tile_id == "":
        return None, {"template": template, "factionId": faction_id}, "unit_identity_invalid"

    target_tile_id = _pick_adjacent_target_tile(world_state, unit_tile_id, args.target_tile_id)
    if not target_tile_id:
        return None, {"template": template, "factionId": faction_id, "unitId": unit_id}, "target_tile_resolve_failed"

    if template == "move_first_unit":
        return (
            {
                "action": "moveUnit",
                "payload": {"factionId": faction_id, "unitId": unit_id, "targetTileId": target_tile_id},
                "includeWorld": include_world,
            },
            {"template": template, "factionId": faction_id, "unitId": unit_id, "targetTileId": target_tile_id},
            None,
        )

    summary = str(args.summary or "").strip()
    if summary == "":
        summary = f"template:{args.override_template_id} target:{target_tile_id}"

    return (
        {
            "action": "queueTacticalOverride",
            "payload": {
                "factionId": faction_id,
                "unitId": unit_id,
                "targetTileId": target_tile_id,
                "templateId": args.override_template_id,
                "summary": summary,
            },
            "includeWorld": include_world,
        },
        {
            "template": template,
            "factionId": faction_id,
            "unitId": unit_id,
            "targetTileId": target_tile_id,
            "overrideTemplateId": args.override_template_id,
        },
        None,
    )


def _execute_world_action_request(
    action: str,
    payload: dict[str, Any],
    include_world: bool,
    raw: bool,
    command_name: str,
    ctx: CliContext,
    meta: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    body: dict[str, Any] = {"action": action}
    if payload:
        body["payload"] = payload
    include_world_query = "true" if include_world else "false"
    result = _http_json(
        ctx.base_url,
        f"/api/world/action?includeWorld={include_world_query}",
        "POST",
        body,
        timeout_sec=ctx.timeout_sec,
    )
    output_result = dict(result)
    if result.get("ok") and not raw:
        data = result.get("data", {})
        if isinstance(data, dict):
            summarized: dict[str, Any] = {
                "ok": data.get("ok"),
                "tick": data.get("tick"),
                "worldVersion": data.get("worldVersion"),
                "rawKeys": list(data.keys())[:20],
            }

            agenda = data.get("nationalAgenda")
            if isinstance(agenda, dict):
                summarized["nationalAgenda"] = {
                    "id": agenda.get("id"),
                    "tick": agenda.get("tick"),
                    "summary": agenda.get("summary"),
                    "optionCountIn": agenda.get("optionCountIn"),
                    "optionCountOut": agenda.get("optionCountOut"),
                }

            court = data.get("courtSession")
            if isinstance(court, dict):
                proposals = court.get("proposals", [])
                resolutions = court.get("resolutions", [])
                summarized["courtSession"] = {
                    "id": court.get("id"),
                    "tick": court.get("tick"),
                    "summary": court.get("summary"),
                    "proposalCount": len(proposals) if isinstance(proposals, list) else None,
                    "resolutionCount": len(resolutions) if isinstance(resolutions, list) else None,
                }

            summarized_world = _summarize_world_like(data)
            if (
                isinstance(summarized_world, dict)
                and summarized_world.get("summaryMode") == "world_like_summary_v1"
            ):
                summarized["world"] = summarized_world
            elif isinstance(data.get("world"), dict):
                wrapped_world = _summarize_world_like({"world": data.get("world")})
                if (
                    isinstance(wrapped_world, dict)
                    and wrapped_world.get("summaryMode") == "world_like_summary_v1"
                ):
                    summarized["world"] = wrapped_world

            output_result["data"] = summarized

    response_payload: dict[str, Any] = {
        "command": command_name,
        "at": _now_iso(),
        "request": body,
        "result": output_result,
    }
    if meta:
        response_payload["meta"] = meta
    return (0 if result.get("ok") else 1), response_payload


def cmd_world_action(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    payload = _parse_payload_json(args.payload_json)
    return _execute_world_action_request(
        action=str(args.action),
        payload=payload,
        include_world=bool(args.include_world),
        raw=bool(args.raw),
        command_name="world-action",
        ctx=ctx,
    )


def cmd_world_action_template(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    request, meta, error_code = _build_world_action_template_request(args, ctx)
    if request is None:
        return 1, {
            "command": "world-action-template",
            "at": _now_iso(),
            "ok": False,
            "error": error_code or "template_resolve_failed",
            "meta": meta,
        }

    return _execute_world_action_request(
        action=str(request.get("action", "")),
        payload=request.get("payload", {}) if isinstance(request.get("payload", {}), dict) else {},
        include_world=bool(request.get("includeWorld", False)),
        raw=bool(args.raw),
        command_name="world-action-template",
        ctx=ctx,
        meta=meta,
    )


def cmd_world_action_templates(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    return 0, {
        "command": "world-action-templates",
        "at": _now_iso(),
        "templates": [
            {
                "id": "advance_tick",
                "action": "advanceTick",
                "defaultIncludeWorld": True,
                "autoResolves": [],
            },
            {
                "id": "clear_plan_execution",
                "action": "clearPlanExecution",
                "defaultIncludeWorld": True,
                "autoResolves": ["factionId"],
            },
            {
                "id": "preview_national_agenda",
                "action": "previewNationalAgenda",
                "defaultIncludeWorld": False,
                "autoResolves": [],
            },
            {
                "id": "preview_court_session",
                "action": "previewCourtSession",
                "defaultIncludeWorld": False,
                "autoResolves": [],
            },
            {
                "id": "move_first_unit",
                "action": "moveUnit",
                "defaultIncludeWorld": True,
                "autoResolves": ["factionId", "unitId", "targetTileId"],
            },
            {
                "id": "upgrade_first_city",
                "action": "upgradeCity",
                "defaultIncludeWorld": True,
                "autoResolves": ["factionId", "tileId"],
            },
            {
                "id": "tactical_override_first_unit",
                "action": "queueTacticalOverride",
                "defaultIncludeWorld": True,
                "autoResolves": ["factionId", "unitId", "targetTileId", "templateId", "summary"],
            },
        ],
    }


def _extract_items_from_http_result(result: dict[str, Any]) -> list[dict[str, Any]]:
    data = result.get("data", {})
    if not isinstance(data, dict):
        return []
    items = data.get("items", [])
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def _collect_item_ids(items: list[dict[str, Any]]) -> set[str]:
    output: set[str] = set()
    for item in items:
        item_id = str(item.get("id", "")).strip()
        if item_id:
            output.add(item_id)
    return output


def _collect_new_items(after_items: list[dict[str, Any]], before_ids: set[str]) -> list[dict[str, Any]]:
    if not before_ids:
        return list(after_items)
    output: list[dict[str, Any]] = []
    for item in after_items:
        item_id = str(item.get("id", "")).strip()
        if item_id and item_id in before_ids:
            continue
        output.append(item)
    return output


def _resolve_action_success(step_payload: dict[str, Any]) -> tuple[bool, bool]:
    step_result = step_payload.get("result", {})
    http_ok = bool(step_result.get("ok")) if isinstance(step_result, dict) else False
    action_ok = http_ok
    if isinstance(step_result, dict):
        data = step_result.get("data", {})
        if isinstance(data, dict) and isinstance(data.get("ok"), bool):
            action_ok = bool(data.get("ok"))
    return http_ok, action_ok


def _save_slot(ctx: CliContext, slot_id: str, label: str) -> dict[str, Any]:
    return _http_json(
        ctx.base_url,
        "/api/save-slots/save",
        "POST",
        {"slotId": slot_id, "label": label},
        timeout_sec=ctx.timeout_sec,
    )


def _load_slot(ctx: CliContext, slot_id: str) -> dict[str, Any]:
    return _http_json(
        ctx.base_url,
        "/api/save-slots/load",
        "POST",
        {"slotId": slot_id},
        timeout_sec=ctx.timeout_sec,
    )


def _prime_fixture_slot(ctx: CliContext, slot_id: str, label: str, source: str) -> dict[str, Any]:
    return _http_json(
        ctx.base_url,
        "/api/save-slots/fixture/prime",
        "POST",
        {"slotId": slot_id, "label": label, "source": source},
        timeout_sec=ctx.timeout_sec,
    )


def cmd_template_replay(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    scenario = str(args.scenario)
    run_id = f"ai_ops_template_replay_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    fixture_slot_id = str(args.fixture_slot_id).strip() or DEFAULT_TEMPLATE_REPLAY_FIXTURE_SLOT_ID
    backup_slot_id = str(args.backup_slot_id).strip() or DEFAULT_TEMPLATE_REPLAY_BACKUP_SLOT_ID
    fixture_source = "current_world" if str(args.fixture_source).strip() == "current_world" else "initial_world_v1"
    restore_world = bool(args.restore_world)
    replay_timeout_sec = max(float(ctx.timeout_sec), 60.0)
    replay_ctx = CliContext(
        base_url=ctx.base_url,
        timeout_sec=replay_timeout_sec,
        output=None,
        compact=ctx.compact,
    )

    checks: list[dict[str, Any]] = []
    steps: list[dict[str, Any]] = []

    backup_result = _save_slot(replay_ctx, backup_slot_id, "AI Template Replay Runtime Backup")
    checks.append(
        {
            "name": "fixture_backup_saved",
            "passed": bool(backup_result.get("ok")),
            "details": {"status": backup_result.get("status"), "backupSlotId": backup_slot_id},
        }
    )

    fixture_prime_result = _prime_fixture_slot(
        replay_ctx,
        fixture_slot_id,
        "AI Template Replay Fixture v1",
        fixture_source,
    )
    checks.append(
        {
            "name": "fixture_slot_primed",
            "passed": bool(fixture_prime_result.get("ok")),
            "details": {
                "status": fixture_prime_result.get("status"),
                "fixtureSlotId": fixture_slot_id,
                "fixtureSource": fixture_source,
            },
        }
    )

    fixture_load_result = _load_slot(replay_ctx, fixture_slot_id)
    checks.append(
        {
            "name": "fixture_slot_loaded",
            "passed": bool(fixture_load_result.get("ok")),
            "details": {"status": fixture_load_result.get("status"), "fixtureSlotId": fixture_slot_id},
        }
    )
    if not bool(fixture_prime_result.get("ok")) and bool(fixture_load_result.get("ok")):
        for check in checks:
            if str(check.get("name", "")).strip() != "fixture_slot_primed":
                continue
            details = check.get("details", {})
            if not isinstance(details, dict):
                details = {}
            details["fallback"] = "fixture_load_success_without_prime"
            check["details"] = details
            check["passed"] = True
            break

    before_events_result = _http_json(
        replay_ctx.base_url,
        f"/api/events?limit={int(args.events_limit)}",
        "GET",
        timeout_sec=replay_ctx.timeout_sec,
    )
    before_narratives_result = _http_json(
        replay_ctx.base_url,
        f"/api/narratives?limit={int(args.narratives_limit)}",
        "GET",
        timeout_sec=replay_ctx.timeout_sec,
    )
    before_events = _extract_items_from_http_result(before_events_result)
    before_narratives = _extract_items_from_http_result(before_narratives_result)
    before_event_ids = _collect_item_ids(before_events)
    before_narrative_ids = _collect_item_ids(before_narratives)

    checks.extend(
        [
            {
                "name": "prefetch_events_ok",
                "passed": bool(before_events_result.get("ok")),
                "details": {"status": before_events_result.get("status"), "count": len(before_events)},
            },
            {
                "name": "prefetch_narratives_ok",
                "passed": bool(before_narratives_result.get("ok")),
                "details": {"status": before_narratives_result.get("status"), "count": len(before_narratives)},
            },
        ]
    )

    bootstrap_required_checks = {
        "fixture_backup_saved",
        "fixture_slot_loaded",
        "prefetch_events_ok",
        "prefetch_narratives_ok",
    }
    bootstrap_ok = True
    for check in checks:
        check_name = str(check.get("name", "")).strip()
        if check_name in bootstrap_required_checks and not bool(check.get("passed")):
            bootstrap_ok = False
            break
    if not bootstrap_ok:
        if restore_world:
            restore_attempt = _load_slot(replay_ctx, backup_slot_id)
            checks.append(
                {
                    "name": "fixture_backup_restored",
                    "passed": bool(restore_attempt.get("ok")),
                    "details": {"status": restore_attempt.get("status"), "backupSlotId": backup_slot_id},
                }
            )

        report = {
            "command": "template-replay",
            "runId": run_id,
            "generatedAt": _now_iso(),
            "scenario": scenario,
            "baseUrl": ctx.base_url,
            "fixture": {
                "fixtureSlotId": fixture_slot_id,
                "backupSlotId": backup_slot_id,
                "source": fixture_source,
                "restoreWorld": restore_world,
            },
            "checks": checks,
            "steps": steps,
            "passed": False,
            "error": "fixture_bootstrap_failed",
        }
        report_path = str(args.report_path).strip()
        if report_path:
            output_path = Path(report_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(_json_dumps(report, compact=False) + "\n", encoding="utf-8")
            report["reportPath"] = report_path
        return 1, report

    if scenario == "baseline_v1":
        template_sequence = [
            "clear_plan_execution",
            "move_first_unit",
            "tactical_override_first_unit",
            "preview_national_agenda",
            "preview_court_session",
            "advance_tick",
        ]
    else:
        return 1, {
            "command": "template-replay",
            "runId": run_id,
            "generatedAt": _now_iso(),
            "scenario": scenario,
            "ok": False,
            "error": "unsupported_scenario",
        }

    for template_id in template_sequence:
        template_args = argparse.Namespace(
            template=template_id,
            faction_id=str(args.faction_id or ""),
            unit_id=str(args.unit_id or ""),
            target_tile_id=str(args.target_tile_id or ""),
            city_tile_id=str(args.city_tile_id or ""),
            override_template_id=str(args.override_template_id),
            summary=str(args.summary or ""),
            include_world=None,
            raw=False,
        )
        step_code, step_payload = cmd_world_action_template(template_args, replay_ctx)
        http_ok, action_ok = _resolve_action_success(step_payload)
        request = step_payload.get("request", {})
        request_action = str(request.get("action", "")).strip() if isinstance(request, dict) else ""
        expected_event_action = WORLD_ACTION_EVENT_NAME_MAP.get(request_action, "")
        required = True
        result_ok = bool(step_code == 0 and http_ok and action_ok)
        step_passed = result_ok if required else True
        steps.append(
            {
                "templateId": template_id,
                "required": required,
                "passed": step_passed,
                "resultOk": result_ok,
                "httpOk": http_ok,
                "actionOk": action_ok,
                "requestAction": request_action,
                "expectedEventAction": expected_event_action,
                "response": step_payload,
            }
        )

    after_events_result = _http_json(
        replay_ctx.base_url,
        f"/api/events?limit={int(args.events_limit)}",
        "GET",
        timeout_sec=replay_ctx.timeout_sec,
    )
    after_narratives_result = _http_json(
        replay_ctx.base_url,
        f"/api/narratives?limit={int(args.narratives_limit)}",
        "GET",
        timeout_sec=replay_ctx.timeout_sec,
    )
    after_events = _extract_items_from_http_result(after_events_result)
    after_narratives = _extract_items_from_http_result(after_narratives_result)
    new_events = _collect_new_items(after_events, before_event_ids)
    new_narratives = _collect_new_items(after_narratives, before_narrative_ids)

    required_failed_steps = [
        str(step.get("templateId", ""))
        for step in steps
        if bool(step.get("required", False)) and not bool(step.get("resultOk", False))
    ]
    optional_failed_steps = [
        str(step.get("templateId", ""))
        for step in steps
        if not bool(step.get("required", False)) and not bool(step.get("resultOk", False))
    ]
    step_all_ok = len(required_failed_steps) == 0
    expected_event_actions = sorted(
        {
            str(step.get("expectedEventAction", "")).strip()
            for step in steps
            if isinstance(step.get("expectedEventAction"), str) and str(step.get("expectedEventAction")).strip()
        }
    )
    observed_new_event_actions = sorted(
        {
            str(item.get("action", "")).strip()
            for item in new_events
            if isinstance(item.get("action"), str) and str(item.get("action", "")).strip()
        }
    )
    missing_event_actions = [action for action in expected_event_actions if action not in observed_new_event_actions]

    advance_tick_events = [
        item
        for item in new_events
        if str(item.get("action", "")).strip() == "advance_tick" and bool(item.get("success", False))
    ]
    expected_narrative_count = 0
    for event in advance_tick_events:
        metadata = event.get("metadata", {})
        if not isinstance(metadata, dict):
            continue
        value = metadata.get("narrativeEvents")
        if isinstance(value, (int, float)):
            expected_narrative_count += int(value)

    narrative_reconcile_ok = len(new_narratives) >= expected_narrative_count

    checks.extend(
        [
            {
                "name": "template_steps_all_ok",
                "passed": step_all_ok,
                "details": {
                    "stepCount": len(steps),
                    "requiredFailedSteps": required_failed_steps,
                    "optionalFailedSteps": optional_failed_steps,
                },
            },
            {
                "name": "postfetch_events_ok",
                "passed": bool(after_events_result.get("ok")),
                "details": {"status": after_events_result.get("status"), "count": len(after_events), "newCount": len(new_events)},
            },
            {
                "name": "postfetch_narratives_ok",
                "passed": bool(after_narratives_result.get("ok")),
                "details": {
                    "status": after_narratives_result.get("status"),
                    "count": len(after_narratives),
                    "newCount": len(new_narratives),
                },
            },
            {
                "name": "expected_event_actions_logged",
                "passed": len(missing_event_actions) == 0,
                "details": {
                    "expected": expected_event_actions,
                    "observed": observed_new_event_actions,
                    "missing": missing_event_actions,
                },
            },
            {
                "name": "narrative_reconcile_ok",
                "passed": narrative_reconcile_ok,
                "details": {
                    "newNarratives": len(new_narratives),
                    "expectedFromAdvanceTickMetadata": expected_narrative_count,
                    "advanceTickEventCount": len(advance_tick_events),
                },
            },
        ]
    )

    if restore_world:
        restore_result = _load_slot(replay_ctx, backup_slot_id)
        checks.append(
            {
                "name": "fixture_backup_restored",
                "passed": bool(restore_result.get("ok")),
                "details": {"status": restore_result.get("status"), "backupSlotId": backup_slot_id},
            }
        )

    passed = all(bool(check.get("passed")) for check in checks)
    report = {
        "command": "template-replay",
        "runId": run_id,
        "generatedAt": _now_iso(),
        "scenario": scenario,
        "baseUrl": ctx.base_url,
        "fixture": {
            "fixtureSlotId": fixture_slot_id,
            "backupSlotId": backup_slot_id,
            "source": fixture_source,
            "restoreWorld": restore_world,
        },
        "checks": checks,
        "steps": steps,
        "events": {
            "beforeCount": len(before_events),
            "afterCount": len(after_events),
            "newCount": len(new_events),
            "newActions": observed_new_event_actions,
        },
        "narratives": {
            "beforeCount": len(before_narratives),
            "afterCount": len(after_narratives),
            "newCount": len(new_narratives),
            "expectedFromAdvanceTickMetadata": expected_narrative_count,
        },
        "passed": passed,
    }

    report_path = str(args.report_path).strip()
    if report_path:
        output_path = Path(report_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(_json_dumps(report, compact=False) + "\n", encoding="utf-8")
        report["reportPath"] = report_path

    return (0 if passed else 1), report


def cmd_advance_tick(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    payload = _parse_payload_json(args.payload_json)
    return _execute_world_action_request(
        action="advanceTick",
        payload=payload,
        include_world=bool(args.include_world),
        raw=bool(args.raw),
        command_name="advance-tick",
        ctx=ctx,
    )


def cmd_headless(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    command = [
        args.godot_exe,
        "--headless",
        "--path",
        args.project_path,
        "--quit-after",
        str(args.quit_after),
    ]
    started = time.time()
    process = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
    duration_ms = int((time.time() - started) * 1000)
    stdout_lines = process.stdout.splitlines()[-args.tail_lines :]
    stderr_lines = process.stderr.splitlines()[-args.tail_lines :]
    payload = {
        "command": "headless",
        "at": _now_iso(),
        "ok": process.returncode == 0,
        "returnCode": process.returncode,
        "durationMs": duration_ms,
        "godotExe": args.godot_exe,
        "projectPath": args.project_path,
        "stdoutTail": stdout_lines,
        "stderrTail": stderr_lines,
    }
    return (0 if process.returncode == 0 else 1), payload


def cmd_bootstrap_chain(args: argparse.Namespace, ctx: CliContext) -> tuple[int, dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    ok = True
    token = ""

    health = _http_json(ctx.base_url, "/api/health", "GET", timeout_sec=ctx.timeout_sec)
    steps.append({"name": "health", "result": health})
    ok = ok and bool(health.get("ok"))

    runtime = _http_json(ctx.base_url, "/api/session/runtime", "GET", timeout_sec=ctx.timeout_sec)
    steps.append({"name": "runtime", "result": runtime})
    ok = ok and bool(runtime.get("ok"))

    faction_id = _resolve_faction_id(ctx, args.faction_id)
    if not faction_id:
        ok = False
        steps.append({"name": "resolve-faction", "ok": False, "error": "faction_resolve_failed"})
    else:
        join_payload = {"factionId": faction_id, "playerName": args.player_name}
        join = _http_json(ctx.base_url, "/api/session/join", "POST", join_payload, timeout_sec=ctx.timeout_sec)
        steps.append({"name": "join", "request": join_payload, "result": join})
        if not bool(join.get("ok")):
            ok = False
        else:
            token = str(join.get("data", {}).get("token", ""))

    world = _http_json(ctx.base_url, "/api/world?intelMode=sparse", "GET", timeout_sec=ctx.timeout_sec)
    steps.append({"name": "world", "result": {**world, "data": _summarize_world_like(world.get("data", {}))}})
    ok = ok and bool(world.get("ok"))

    scope_q = quote(args.scope, safe="")
    map_layout = _http_json(ctx.base_url, f"/api/world/map-layout?scope={scope_q}", "GET", timeout_sec=ctx.timeout_sec)
    map_layout_output = dict(map_layout)
    if map_layout.get("ok") and not args.raw_map_layout:
        map_layout_output["data"] = _summarize_map_layout_like(map_layout.get("data", {}))
    steps.append({"name": "map-layout", "scope": args.scope, "result": map_layout_output})
    ok = ok and bool(map_layout.get("ok"))

    if args.run_headless:
        headless_code, headless_payload = cmd_headless(args, ctx)
        steps.append({"name": "godot-headless", "result": headless_payload})
        ok = ok and headless_code == 0

    if args.leave and token:
        leave = _http_json(ctx.base_url, "/api/session/leave", "POST", {"token": token}, timeout_sec=ctx.timeout_sec)
        steps.append({"name": "leave", "result": leave})
        ok = ok and bool(leave.get("ok"))

    payload = {
        "command": "bootstrap-chain",
        "startedAt": _now_iso(),
        "ok": ok,
        "baseUrl": ctx.base_url,
        "factionId": faction_id,
        "tokenAcquired": bool(token),
        "steps": steps,
    }
    return (0 if ok else 1), payload


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="SLG Godot/Backend Ops CLI")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Backend base URL, default from SLG_BACKEND_URL")
    parser.add_argument("--timeout-sec", type=float, default=15.0, help="HTTP timeout seconds")
    parser.add_argument("--output", default=None, help="Write output JSON to file")
    parser.add_argument("--compact", action="store_true", help="Print compact one-line JSON")

    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    p_health = subparsers.add_parser("health", help="GET /api/health")
    p_health.set_defaults(func=cmd_health)

    p_runtime = subparsers.add_parser("runtime", help="GET /api/session/runtime")
    p_runtime.set_defaults(func=cmd_runtime)

    p_join = subparsers.add_parser("join", help="POST /api/session/join")
    p_join.add_argument("--faction-id", default="", help="Faction ID; if empty, auto-resolve from runtime")
    p_join.add_argument("--player-name", default=os.getenv("SLG_PLAYER_NAME", "ai_cli"), help="Player name")
    p_join.set_defaults(func=cmd_join)

    p_heartbeat = subparsers.add_parser("heartbeat", help="POST /api/session/heartbeat")
    p_heartbeat.add_argument("--token", required=True, help="Session token")
    p_heartbeat.set_defaults(func=cmd_heartbeat)

    p_autonomy = subparsers.add_parser("autonomy", help="POST /api/session/autonomy")
    p_autonomy.add_argument("--token", required=True, help="Session token")
    p_autonomy.add_argument("--level", required=True, choices=["L1_assigned", "L2_delegated", "L3_negotiated"], help="Autonomy level")
    p_autonomy.set_defaults(func=cmd_autonomy)

    p_leave = subparsers.add_parser("leave", help="POST /api/session/leave")
    p_leave.add_argument("--token", required=True, help="Session token")
    p_leave.set_defaults(func=cmd_leave)

    p_world = subparsers.add_parser("world", help="GET /api/world")
    p_world.add_argument("--intel-mode", default="sparse", choices=["sparse", "full"], help="intelMode query")
    p_world.add_argument("--raw", action="store_true", help="Print raw world payload (can be very large)")
    p_world.set_defaults(func=cmd_world)

    p_map = subparsers.add_parser("map-layout", help="GET /api/world/map-layout")
    p_map.add_argument("--scope", default="bootstrap", choices=["full", "bootstrap", "province", "region", "viewport"], help="Map layout scope")
    p_map.add_argument("--raw", action="store_true", help="Print raw map-layout payload (can be very large)")
    p_map.set_defaults(func=cmd_map_layout)

    p_world_action = subparsers.add_parser("world-action", help="POST /api/world/action")
    p_world_action.add_argument("--action", required=True, help="World action name")
    p_world_action.add_argument("--payload-json", default="", help='JSON object string, e.g. \'{"factionId":"player"}\'')
    p_world_action.add_argument("--include-world", action=argparse.BooleanOptionalAction, default=False, help="includeWorld query")
    p_world_action.add_argument("--raw", action="store_true", help="Print raw world payload (can be very large)")
    p_world_action.set_defaults(func=cmd_world_action)

    p_world_action_templates = subparsers.add_parser("world-action-templates", help="List predefined world-action templates")
    p_world_action_templates.set_defaults(func=cmd_world_action_templates)

    p_world_action_template = subparsers.add_parser(
        "world-action-template",
        help="Run predefined world-action template with optional payload auto-resolve",
    )
    p_world_action_template.add_argument("--template", required=True, choices=WORLD_ACTION_TEMPLATE_CHOICES, help="Template ID")
    p_world_action_template.add_argument("--faction-id", default="", help="Faction override; empty means auto-resolve from runtime")
    p_world_action_template.add_argument("--unit-id", default="", help="Unit override for move/override templates")
    p_world_action_template.add_argument("--target-tile-id", default="", help="Target tile override for move/override templates")
    p_world_action_template.add_argument("--city-tile-id", default="", help="City tile override for upgrade template")
    p_world_action_template.add_argument(
        "--override-template-id",
        default="garrison",
        choices=TACTICAL_OVERRIDE_TEMPLATE_CHOICES,
        help="Tactical template for tactical_override_first_unit",
    )
    p_world_action_template.add_argument("--summary", default="", help="Optional summary for tactical_override_first_unit")
    p_world_action_template.add_argument(
        "--include-world",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="Override includeWorld behavior (template default used when omitted)",
    )
    p_world_action_template.add_argument("--raw", action="store_true", help="Print raw world payload (can be very large)")
    p_world_action_template.set_defaults(func=cmd_world_action_template)

    p_template_replay = subparsers.add_parser(
        "template-replay",
        help="Run template action scenario and reconcile /api/events + /api/narratives",
    )
    p_template_replay.add_argument("--scenario", default="baseline_v1", choices=TEMPLATE_REPLAY_SCENARIO_CHOICES, help="Scenario ID")
    p_template_replay.add_argument("--events-limit", type=int, default=120, help="Limit for /api/events snapshots")
    p_template_replay.add_argument("--narratives-limit", type=int, default=120, help="Limit for /api/narratives snapshots")
    p_template_replay.add_argument("--faction-id", default="", help="Faction override for template auto-resolve")
    p_template_replay.add_argument("--unit-id", default="", help="Unit override for template auto-resolve")
    p_template_replay.add_argument("--target-tile-id", default="", help="Target tile override for template auto-resolve")
    p_template_replay.add_argument("--city-tile-id", default="", help="City tile override for template auto-resolve")
    p_template_replay.add_argument(
        "--override-template-id",
        default="garrison",
        choices=TACTICAL_OVERRIDE_TEMPLATE_CHOICES,
        help="Tactical template for tactical_override_first_unit",
    )
    p_template_replay.add_argument("--summary", default="", help="Optional tactical override summary")
    p_template_replay.add_argument(
        "--fixture-slot-id",
        default=DEFAULT_TEMPLATE_REPLAY_FIXTURE_SLOT_ID,
        help="Save-slot id used for deterministic fixture replay bootstrap",
    )
    p_template_replay.add_argument(
        "--backup-slot-id",
        default=DEFAULT_TEMPLATE_REPLAY_BACKUP_SLOT_ID,
        help="Save-slot id used to backup current runtime world before fixture replay",
    )
    p_template_replay.add_argument(
        "--fixture-source",
        default="initial_world_v1",
        choices=["initial_world_v1", "current_world"],
        help="Fixture seed source (default uses canonical initial world)",
    )
    p_template_replay.add_argument(
        "--restore-world",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Restore backed-up runtime world after replay",
    )
    p_template_replay.add_argument(
        "--report-path",
        default=DEFAULT_TEMPLATE_REPLAY_REPORT_PATH,
        help="Path to write replay report JSON",
    )
    p_template_replay.set_defaults(func=cmd_template_replay)

    p_advance = subparsers.add_parser("advance-tick", help='Shortcut for world-action --action "advanceTick"')
    p_advance.add_argument("--payload-json", default="", help='JSON object string, usually empty for advanceTick')
    p_advance.add_argument("--include-world", action=argparse.BooleanOptionalAction, default=False, help="includeWorld query")
    p_advance.add_argument("--raw", action="store_true", help="Print raw world payload (can be very large)")
    p_advance.set_defaults(func=cmd_advance_tick)

    p_headless = subparsers.add_parser("headless", help="Run Godot headless bootstrap")
    p_headless.add_argument("--godot-exe", default=DEFAULT_GODOT_EXE, help="Godot console executable path")
    p_headless.add_argument("--project-path", default=DEFAULT_PROJECT_PATH, help="Godot project path")
    p_headless.add_argument("--quit-after", type=int, default=1, help="Godot --quit-after seconds")
    p_headless.add_argument("--tail-lines", type=int, default=12, help="Tail lines kept in output")
    p_headless.set_defaults(func=cmd_headless)

    p_chain = subparsers.add_parser("bootstrap-chain", help="Run runtime/join/world/map/headless chain")
    p_chain.add_argument("--faction-id", default="", help="Faction ID override")
    p_chain.add_argument("--player-name", default=os.getenv("SLG_PLAYER_NAME", "ai_cli"), help="Player name")
    p_chain.add_argument("--scope", default="bootstrap", choices=["full", "bootstrap", "province", "region", "viewport"], help="Map layout scope")
    p_chain.add_argument("--run-headless", action=argparse.BooleanOptionalAction, default=True, help="Run Godot headless step")
    p_chain.add_argument("--leave", action=argparse.BooleanOptionalAction, default=True, help="Leave session at end when token acquired")
    p_chain.add_argument("--raw-map-layout", action=argparse.BooleanOptionalAction, default=False, help="Keep raw map-layout payload in output")
    p_chain.add_argument("--godot-exe", default=DEFAULT_GODOT_EXE, help="Godot console executable path")
    p_chain.add_argument("--project-path", default=DEFAULT_PROJECT_PATH, help="Godot project path")
    p_chain.add_argument("--quit-after", type=int, default=1, help="Godot --quit-after seconds")
    p_chain.add_argument("--tail-lines", type=int, default=12, help="Tail lines kept in output")
    p_chain.set_defaults(func=cmd_bootstrap_chain)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    ctx = CliContext(
        base_url=str(args.base_url).rstrip("/"),
        timeout_sec=float(args.timeout_sec),
        output=args.output,
        compact=bool(args.compact),
    )

    try:
        code, payload = args.func(args, ctx)
    except ValueError as error:
        code = 1
        payload = {"ok": False, "error": "invalid_argument", "message": str(error), "at": _now_iso()}
    except json.JSONDecodeError as error:
        code = 1
        payload = {"ok": False, "error": "invalid_json", "message": str(error), "at": _now_iso()}

    _print_and_maybe_write(payload, ctx)
    return int(code)


if __name__ == "__main__":
    raise SystemExit(main())
