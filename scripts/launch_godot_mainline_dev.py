#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BACKEND_URL = os.getenv("SLG_BACKEND_URL", "http://127.0.0.1:8787").rstrip("/")
DEFAULT_SCENE = "res://scenes/app/main.tscn"
DEFAULT_LOG_DIR = REPO_ROOT / "tmp" / "logs"


def _resolve_npm_exe() -> str:
    return "npm.cmd" if os.name == "nt" else "npm"


def _health_url(backend_url: str) -> str:
    return backend_url.rstrip("/") + "/api/health"


def _read_health(backend_url: str, timeout_sec: float) -> dict[str, Any]:
    url = _health_url(backend_url)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout_sec) as response:
            raw = response.read().decode("utf-8", errors="replace")
            try:
                data: Any = json.loads(raw) if raw.strip() else {}
            except json.JSONDecodeError:
                data = {"raw": raw}
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


def _wait_for_health(backend_url: str, timeout_sec: float, poll_sec: float, request_timeout_sec: float) -> dict[str, Any]:
    deadline = time.perf_counter() + timeout_sec
    last_result: dict[str, Any] = {}
    while time.perf_counter() <= deadline:
        last_result = _read_health(backend_url, request_timeout_sec)
        if bool(last_result.get("ok", False)):
            return last_result
        time.sleep(poll_sec)
    return last_result


def _spawn_backend(script_name: str) -> dict[str, Any]:
    DEFAULT_LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = DEFAULT_LOG_DIR / "godot_mainline_dev_backend.log"
    log_file = log_path.open("a", encoding="utf-8")
    creationflags = 0
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)
    process = subprocess.Popen(
        [_resolve_npm_exe(), "run", script_name],
        cwd=REPO_ROOT,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        creationflags=creationflags,
    )
    return {
        "pid": process.pid,
        "logPath": str(log_path),
        "script": script_name,
    }


def _build_godot_launch_command(args: argparse.Namespace, dry_run: bool) -> list[str]:
    command = [
        sys.executable,
        str(REPO_ROOT / "scripts" / "launch_godot.py"),
        "--mode",
        "runtime",
        "--scene",
        args.scene,
    ]
    if args.godot_exe.strip():
        command.extend(["--godot-exe", args.godot_exe.strip()])
    if dry_run:
        command.append("--dry-run")
    if args.godot_passthrough:
        command.extend(args.godot_passthrough)
    return command


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start backend if needed, wait for health, then open the Godot mainline runtime.")
    parser.add_argument("--backend-url", default=DEFAULT_BACKEND_URL)
    parser.add_argument("--backend-timeout-sec", type=float, default=45.0)
    parser.add_argument("--health-timeout-sec", type=float, default=2.0)
    parser.add_argument("--poll-sec", type=float, default=1.0)
    parser.add_argument("--server-script", default="server:dev")
    parser.add_argument("--no-start-backend", action="store_true")
    parser.add_argument("--scene", default=DEFAULT_SCENE)
    parser.add_argument("--godot-exe", default="")
    parser.add_argument("--dry-run", action="store_true")
    args, passthrough = parser.parse_known_args()
    args.backend_url = args.backend_url.rstrip("/")
    args.godot_passthrough = passthrough
    return args


def main() -> int:
    args = _parse_args()
    report: dict[str, Any] = {
        "command": "launch_godot_mainline_dev",
        "backendUrl": args.backend_url,
        "scene": args.scene,
        "dryRun": args.dry_run,
        "steps": [],
    }

    initial_health = _read_health(args.backend_url, args.health_timeout_sec)
    report["steps"].append({"name": "initial_health", **initial_health})

    if not bool(initial_health.get("ok", False)):
        if args.no_start_backend:
            report["ok"] = False
            report["error"] = "backend_unhealthy_no_start"
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 1
        if args.dry_run:
            report["steps"].append({
                "name": "backend_start",
                "ok": True,
                "dryRun": True,
                "detail": f"would run npm run {args.server_script}",
            })
        else:
            backend_info = _spawn_backend(args.server_script)
            report["steps"].append({"name": "backend_start", "ok": True, **backend_info})
            ready_health = _wait_for_health(args.backend_url, args.backend_timeout_sec, args.poll_sec, args.health_timeout_sec)
            report["steps"].append({"name": "wait_for_health", **ready_health})
            if not bool(ready_health.get("ok", False)):
                report["ok"] = False
                report["error"] = "backend_health_timeout"
                print(json.dumps(report, ensure_ascii=False, indent=2))
                return 1
    else:
        report["steps"].append({"name": "backend_start", "ok": True, "detail": "backend already healthy"})

    godot_command = _build_godot_launch_command(args, args.dry_run)
    report["steps"].append({"name": "godot_launch_command", "ok": True, "command": godot_command})

    if args.dry_run:
        completed = subprocess.run(godot_command, cwd=REPO_ROOT, text=True, capture_output=True)
        report["steps"].append({
            "name": "godot_launch_dry_run",
            "ok": completed.returncode == 0,
            "returnCode": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        })
        report["ok"] = completed.returncode == 0
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return int(completed.returncode)

    completed = subprocess.run(godot_command, cwd=REPO_ROOT)
    report["steps"].append({"name": "godot_launch", "ok": completed.returncode == 0, "returnCode": completed.returncode})
    report["ok"] = completed.returncode == 0
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return int(completed.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
