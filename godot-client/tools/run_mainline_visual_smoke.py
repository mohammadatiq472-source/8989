#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BACKEND_URL = os.getenv("SLG_BACKEND_URL", "http://127.0.0.1:8787").rstrip("/")
DEFAULT_PROJECT_PATH = REPO_ROOT / "godot-client"
DEFAULT_SCENE = "res://scenes/app/main.tscn"
DEFAULT_PANEL_ID = "world_event"
DEFAULT_DISPLAY_MODE = "world"
PANEL_ID_ALIASES = {
    "ai": "ai_hub",
    "world": "world_event",
    "world-event": "world_event",
    "world-affairs": "world_affairs",
    "task": "tasks",
    "faction": "faction_status",
    "status": "faction_status",
}
CLICK_ACTION_CHOICES = (
    "none",
    "ai_panel_open_chat_channel",
    "shell_open_chat_channel",
    "world_open_main_city_hub",
    "world_click_main_city_node",
    "world_click_main_city_node_city_context",
    "world_click_main_city_node_troop_assign_preview",
    "world_click_main_city_node_facility_building_tree",
    "world_click_main_city_node_interior",
    "world_click_main_city_node_interior_close",
    "world_click_main_city_node_building_upgrade",
    "world_click_main_city_node_troop",
    "world_click_main_city_node_troop_close",
    "world_open_main_city_interior",
    "world_open_main_city_building_upgrade",
    "world_open_main_city_troop",
    "generals_roster_open_hero_profile",
)

# Main-city map-node actions are fixed regression IDs.
# Required report fields:
# - world_click_main_city_node:
#   clickActionResult.mapNodeClickContext and
#   clickActionResult.mainCityHub.lastMapNodeClick must be present.
# - world_click_main_city_node_troop_assign_preview:
#   templateOnly must be true and authorityTriggered must be false.
# - world_click_main_city_node_facility_building_tree:
#   mainCityContext.hasFacilityTree and hasUpgradeSheet must be true.
MAIN_CITY_CLICK_ACTION_DEFAULTS = {
    "world_open_main_city_hub": {
        "display_mode": "world",
        "world_action": "open_hub",
    },
    "world_click_main_city_node": {
        "display_mode": "world",
        "world_action": "none",
    },
    "world_click_main_city_node_city_context": {
        "display_mode": "world",
        "world_action": "none",
    },
    "world_click_main_city_node_troop_assign_preview": {
        "display_mode": "world",
        "world_action": "none",
    },
    "world_click_main_city_node_facility_building_tree": {
        "display_mode": "world",
        "world_action": "none",
    },
    "world_click_main_city_node_interior": {
        "display_mode": "world",
        "world_action": "none",
        "panel_id": "interior",
    },
    "world_click_main_city_node_interior_close": {
        "display_mode": "world",
        "world_action": "none",
        "panel_id": "interior",
    },
    "world_click_main_city_node_building_upgrade": {
        "display_mode": "world",
        "world_action": "none",
        "panel_id": "interior",
    },
    "world_click_main_city_node_troop": {
        "display_mode": "world",
        "world_action": "none",
        "panel_id": "troop",
    },
    "world_click_main_city_node_troop_close": {
        "display_mode": "world",
        "world_action": "none",
        "panel_id": "troop",
    },
    "world_open_main_city_interior": {
        "display_mode": "world",
        "world_action": "open_hub_panel",
        "panel_id": "interior",
    },
    "world_open_main_city_building_upgrade": {
        "display_mode": "world",
        "world_action": "open_hub_panel",
        "panel_id": "interior",
    },
    "world_open_main_city_troop": {
        "display_mode": "world",
        "world_action": "open_hub_panel",
        "panel_id": "troop",
    },
    "generals_roster_open_hero_profile": {
        "display_mode": "world",
        "world_action": "open_hub_panel",
        "panel_id": "generals",
    },
}


def _resolve_npm_exe() -> str:
    return "npm.cmd" if os.name == "nt" else "npm"


def _load_godot_launcher_module():
    launcher_path = REPO_ROOT / "scripts" / "launch_godot.py"
    spec = importlib.util.spec_from_file_location("launch_godot", launcher_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {launcher_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _resolve_visual_smoke_panel_id(panel_id: str) -> str:
    normalized = str(panel_id or "").strip()
    return PANEL_ID_ALIASES.get(normalized, normalized)


def _apply_main_city_click_action_defaults(args: argparse.Namespace) -> None:
    defaults = MAIN_CITY_CLICK_ACTION_DEFAULTS.get(args.click_action)
    if not defaults:
        return
    args.display_mode = str(defaults.get("display_mode", args.display_mode))
    args.world_action = str(defaults.get("world_action", args.world_action))
    if "panel_id" in defaults:
        args.panel_id = str(defaults["panel_id"])


def _health_url(backend_url: str) -> str:
    return backend_url.rstrip("/") + "/api/health"


def _read_health(backend_url: str, timeout_sec: float = 3.0) -> dict[str, Any]:
    started = time.perf_counter()
    url = _health_url(backend_url)
    try:
        with urllib.request.urlopen(url, timeout=timeout_sec) as response:
            raw = response.read().decode("utf-8", errors="replace")
            data: Any = json.loads(raw) if raw.strip() else {}
            status = int(getattr(response, "status", 0))
            return {
                "ok": 200 <= status < 300,
                "status": status,
                "durationMs": round((time.perf_counter() - started) * 1000),
                "url": url,
                "data": data,
            }
    except urllib.error.HTTPError as exc:
        return {
            "ok": False,
            "status": int(exc.code),
            "durationMs": round((time.perf_counter() - started) * 1000),
            "url": url,
            "error": "http_error",
            "message": str(exc),
        }
    except Exception as exc:
        return {
            "ok": False,
            "status": -1,
            "durationMs": round((time.perf_counter() - started) * 1000),
            "url": url,
            "error": "url_error",
            "message": str(exc),
        }


def _wait_for_health(backend_url: str, timeout_sec: float) -> dict[str, Any]:
    deadline = time.perf_counter() + timeout_sec
    last_result: dict[str, Any] = {}
    while time.perf_counter() <= deadline:
        last_result = _read_health(backend_url)
        if bool(last_result.get("ok", False)):
            return last_result
        time.sleep(1.0)
    return last_result


def _request_json(
    backend_url: str,
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    timeout_sec: float = 6.0,
) -> dict[str, Any]:
    url = backend_url.rstrip("/") + path
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if payload is not None else {},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_sec) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return {
                "ok": 200 <= int(getattr(response, "status", 0)) < 300,
                "status": int(getattr(response, "status", 0)),
                "data": json.loads(raw) if raw.strip() else {},
            }
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        return {
            "ok": False,
            "status": int(exc.code),
            "data": json.loads(raw) if raw.strip() else {},
            "error": "http_error",
            "message": str(exc),
        }
    except Exception as exc:
        return {
            "ok": False,
            "status": -1,
            "data": {},
            "error": "url_error",
            "message": str(exc),
        }


def _seed_ai_avatar_profile(args: argparse.Namespace) -> dict[str, Any]:
    avatar_id = str(args.seed_ai_avatar_id).strip()
    avatar_image = str(args.seed_ai_avatar_image).strip()
    if not avatar_id or not avatar_image:
        return {"ok": True, "skipped": True, "reason": "seed_ai_avatar_not_requested"}

    ai_player_id = str(args.seed_ai_player_id).strip() or "player_operator_alpha"
    display_name = str(args.seed_ai_display_name).strip() or "青州后勤官"
    governor_player_id = str(args.seed_ai_governor_player_id).strip() or "human_alpha"
    faction_id = str(args.seed_ai_faction_id).strip() or "player"
    register_payload = {
        "aiPlayerId": ai_player_id,
        "displayName": display_name,
        "governorPlayerId": governor_player_id,
        "factionId": faction_id,
        "avatarId": avatar_id,
        "avatarImagePath": avatar_image,
        "actionWhitelist": ["resource_transfer_to_governor", "resource_gather", "reward_claim"],
    }
    register_result = _request_json(args.backend_url, "POST", "/api/ai/players", register_payload)
    register_ok = bool(register_result.get("ok", False)) or int(register_result.get("status", -1)) == 409
    profile_path = "/api/ai/players/%s/profile" % urllib.parse.quote(ai_player_id, safe="")
    profile_result = _request_json(args.backend_url, "POST", profile_path, {
        "displayName": display_name,
        "avatarId": avatar_id,
        "avatarImagePath": avatar_image,
        "updatedBy": "visual_smoke_seed",
    })
    return {
        "ok": register_ok and bool(profile_result.get("ok", False)),
        "aiPlayerId": ai_player_id,
        "displayName": display_name,
        "avatarId": avatar_id,
        "avatarImagePath": avatar_image,
        "register": register_result,
        "profile": profile_result,
    }


def _spawn_backend(log_path: Path, server_script: str) -> subprocess.Popen[str]:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = log_path.open("w", encoding="utf-8")
    creationflags = 0
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)
    process = subprocess.Popen(
        [_resolve_npm_exe(), "run", server_script],
        cwd=REPO_ROOT,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        creationflags=creationflags,
    )
    setattr(process, "_log_file", log_file)
    return process


def _terminate(process: subprocess.Popen[str] | None) -> None:
    if process is None:
        return
    try:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=8)
    finally:
        log_file = getattr(process, "_log_file", None)
        if log_file is not None:
            try:
                log_file.close()
            except Exception:
                pass


def _image_stats(path: Path) -> dict[str, Any]:
    try:
        from PIL import Image, ImageStat
    except Exception as exc:
        return {"ok": path.exists(), "path": str(path), "warning": f"PIL unavailable: {exc}"}
    if not path.exists():
        return {"ok": False, "path": str(path), "error": "missing"}
    with Image.open(path) as image:
        stat = ImageStat.Stat(image.convert("RGB"))
        extrema = image.convert("RGB").getextrema()
        non_flat = any(channel[0] != channel[1] for channel in extrema)
        return {
            "ok": image.width >= 320 and image.height >= 180 and non_flat,
            "path": str(path),
            "width": image.width,
            "height": image.height,
            "extrema": extrema,
            "mean": [round(value, 2) for value in stat.mean],
            "nonFlat": non_flat,
        }


def _default_evidence_dir() -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return REPO_ROOT / "tmp" / "screenshots" / f"mainline_visual_smoke_{stamp}"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a Godot mainline visual smoke for the formal main scene.")
    parser.add_argument("--backend-url", default=DEFAULT_BACKEND_URL)
    parser.add_argument("--backend-timeout-sec", type=float, default=45.0)
    parser.add_argument("--server-script", default="server:dev")
    parser.add_argument("--no-start-backend", action="store_true")
    parser.add_argument("--godot-exe", default="")
    parser.add_argument("--project-path", default=str(DEFAULT_PROJECT_PATH))
    parser.add_argument("--scene", default=DEFAULT_SCENE)
    parser.add_argument("--display-mode", choices=("city", "world"), default=DEFAULT_DISPLAY_MODE)
    parser.add_argument("--world-action", choices=("none", "open_hub", "open_hub_panel"), default="none")
    parser.add_argument("--panel-id", default=DEFAULT_PANEL_ID)
    parser.add_argument("--seed-ai-player-id", default="player_operator_alpha")
    parser.add_argument("--seed-ai-display-name", default="青州后勤官")
    parser.add_argument("--seed-ai-governor-player-id", default="human_alpha")
    parser.add_argument("--seed-ai-faction-id", default="player")
    parser.add_argument("--seed-ai-avatar-id", default="")
    parser.add_argument("--seed-ai-avatar-image", default="")
    parser.add_argument("--evidence-dir", default="")
    parser.add_argument("--window-width", type=int, default=0)
    parser.add_argument("--window-height", type=int, default=0)
    parser.add_argument("--show-observability", action="store_true", help="Keep the in-game observability panel visible in screenshots.")
    parser.add_argument("--close-after-open", action="store_true", help="After opening the requested panel, press its close button before the final screenshot.")
    parser.add_argument("--click-action", choices=CLICK_ACTION_CHOICES, default="none", help="Whitelist-only UI click after the requested panel is opened.")
    parser.add_argument("--timeout-sec", type=float, default=90.0)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    _apply_main_city_click_action_defaults(args)
    panel_id = _resolve_visual_smoke_panel_id(args.panel_id)
    panel_required = args.display_mode == "city" or args.world_action == "open_hub_panel"
    evidence_dir = Path(args.evidence_dir).resolve() if args.evidence_dir.strip() else _default_evidence_dir()
    report_path = evidence_dir / "godot_visual_smoke_report.json"
    summary_path = evidence_dir / "mainline_visual_smoke_summary.json"
    if args.click_action != "none":
        screenshot_name = f"01_after_{args.click_action}.png"
    elif args.display_mode == "world" and args.world_action == "open_hub_panel":
        screenshot_name = "01_ready_world_hub_panel.png"
    elif args.display_mode == "world":
        screenshot_name = "01_ready_world_map.png"
    else:
        screenshot_name = "01_ready_secondary_panel.png"
    screenshot_path = evidence_dir / screenshot_name
    backend_log_path = evidence_dir / "backend.log"
    godot_log_path = evidence_dir / "godot.log"
    evidence_dir.mkdir(parents=True, exist_ok=True)

    summary: dict[str, Any] = {
        "command": "run_mainline_visual_smoke",
        "backendUrl": args.backend_url,
        "scene": args.scene,
        "displayMode": args.display_mode,
        "worldAction": args.world_action,
        "panelId": panel_id,
        "requestedPanelId": args.panel_id,
        "panelRequired": panel_required,
        "closeAfterOpen": args.close_after_open,
        "clickAction": args.click_action,
        "hideObservability": not args.show_observability,
        "windowSize": {
            "width": args.window_width,
            "height": args.window_height,
        },
        "evidenceDir": str(evidence_dir),
        "steps": [],
        "artifacts": {
            "godotReport": str(report_path),
            "summaryReport": str(summary_path),
            "screenshot": str(screenshot_path),
            "godotLog": str(godot_log_path),
        },
    }

    backend_process: subprocess.Popen[str] | None = None
    godot_process: subprocess.Popen[str] | None = None
    started_backend = False

    try:
        initial_health = _read_health(args.backend_url)
        summary["steps"].append({"name": "initial_health", **initial_health})
        if not bool(initial_health.get("ok", False)):
            if args.no_start_backend:
                summary["ok"] = False
                summary["error"] = "backend_unhealthy_no_start"
                _write_json(summary_path, summary)
                print(json.dumps(summary, ensure_ascii=False, indent=2))
                return 1
            backend_process = _spawn_backend(backend_log_path, args.server_script)
            started_backend = True
            summary["steps"].append({"name": "backend_start", "ok": True, "pid": backend_process.pid, "logPath": str(backend_log_path)})
            ready_health = _wait_for_health(args.backend_url, args.backend_timeout_sec)
            summary["steps"].append({"name": "wait_for_health", **ready_health})
            if not bool(ready_health.get("ok", False)):
                summary["ok"] = False
                summary["error"] = "backend_health_timeout"
                _write_json(summary_path, summary)
                print(json.dumps(summary, ensure_ascii=False, indent=2))
                return 1
        else:
            summary["steps"].append({"name": "backend_start", "ok": True, "detail": "backend already healthy"})

        seed_result = _seed_ai_avatar_profile(args)
        summary["steps"].append({"name": "seed_ai_avatar_profile", **seed_result})
        if not bool(seed_result.get("ok", False)):
            summary["ok"] = False
            summary["error"] = "seed_ai_avatar_profile_failed"
            _write_json(summary_path, summary)
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 1

        launcher = _load_godot_launcher_module()
        godot_exe = launcher.resolve_godot_exe("runtime", args.godot_exe)
        if not godot_exe:
            raise RuntimeError("Godot executable not resolved")

        command = [
            godot_exe,
            "--path",
            str(Path(args.project_path).resolve()),
            "--scene",
            args.scene,
        ]
        if args.window_width > 0 and args.window_height > 0:
            command.extend(["--resolution", f"{args.window_width}x{args.window_height}"])
        env = os.environ.copy()
        env["SLG_BACKEND_URL"] = args.backend_url
        env["SLG_BOOT_DISPLAY_MODE"] = args.display_mode
        env["SLG_MAINLINE_VISUAL_SMOKE"] = "1"
        env["SLG_MAINLINE_VISUAL_SMOKE_DISPLAY_MODE"] = args.display_mode
        env["SLG_MAINLINE_VISUAL_SMOKE_WORLD_ACTION"] = args.world_action
        env["SLG_MAINLINE_VISUAL_SMOKE_REQUIRE_PANEL"] = "1" if panel_required else "0"
        env["SLG_MAINLINE_VISUAL_SMOKE_PANEL"] = panel_id
        env["SLG_MAINLINE_VISUAL_SMOKE_REPORT"] = str(report_path)
        env["SLG_MAINLINE_VISUAL_SMOKE_SCREENSHOT"] = str(screenshot_path)
        env["SLG_MAINLINE_VISUAL_SMOKE_HIDE_OBSERVABILITY"] = "0" if args.show_observability else "1"
        env["SLG_MAINLINE_VISUAL_SMOKE_CLOSE_AFTER_OPEN"] = "1" if args.close_after_open else "0"
        env["SLG_MAINLINE_VISUAL_SMOKE_CLICK_ACTION"] = args.click_action

        godot_log = godot_log_path.open("w", encoding="utf-8")
        godot_process = subprocess.Popen(
            command,
            cwd=REPO_ROOT,
            stdout=godot_log,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            env=env,
        )
        setattr(godot_process, "_log_file", godot_log)
        summary["steps"].append({"name": "godot_start", "ok": True, "pid": godot_process.pid, "command": command})

        try:
            return_code = godot_process.wait(timeout=args.timeout_sec)
        except subprocess.TimeoutExpired:
            summary["ok"] = False
            summary["error"] = "godot_timeout"
            _write_json(summary_path, summary)
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 1

        summary["steps"].append({"name": "godot_exit", "ok": return_code == 0, "returnCode": return_code})
        godot_report = _read_json(report_path) if report_path.exists() else {}
        screenshot_stats = _image_stats(screenshot_path)
        summary["godotReport"] = godot_report
        summary["screenshotStats"] = screenshot_stats
        summary["ok"] = return_code == 0 and bool(godot_report.get("ok", False)) and bool(screenshot_stats.get("ok", False))
        if started_backend:
            summary["notes"] = ["backend was started by this visual smoke command"]
        _write_json(summary_path, summary)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0 if bool(summary.get("ok", False)) else 1
    except Exception as exc:
        summary["ok"] = False
        summary["error"] = type(exc).__name__
        summary["message"] = str(exc)
        _write_json(summary_path, summary)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 1
    finally:
        _terminate(godot_process)
        if started_backend:
            _terminate(backend_process)


if __name__ == "__main__":
    raise SystemExit(main())
