#!/usr/bin/env python3
"""
UI Preview Sandbox launcher.

Formal entrypoint:
  scripts\run_python.cmd godot-client\tools\run_ui_preview_sandbox.py

Purpose:
- Launch the reusable UI preview sandbox scene.
- Keep the launch command stable for humans and AI windows.
- Prefer the sandbox scene over the main gameplay scene for UI iteration.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROJECT_PATH = "godot-client"
DEFAULT_SCENE_PATH = "res://scenes/dev/ui_preview_sandbox.tscn"
DEFAULT_GODOT_GUI_EXE = r"D:\Apps\Godot\Godot_v4.6.2-stable_win64.exe"
DEFAULT_GODOT_CONSOLE_EXE = r"D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe"


def resolve_godot_gui_exe(explicit: str = "") -> str:
    candidate = explicit.strip()
    if candidate:
        return candidate

    for env_name in ("GODOT_GUI_EXE", "GODOT_EDITOR_EXE", "GODOT_EXE", "GODOT_CONSOLE_EXE"):
        env_candidate = os.getenv(env_name, "").strip()
        if env_candidate:
            return env_candidate

    for candidate_path in (
        r"C:\Godot_v4.6.2-stable_win64.exe",
        r"C:\Godot_v4.6.2-stable_win64_console.exe",
        DEFAULT_GODOT_GUI_EXE,
        DEFAULT_GODOT_CONSOLE_EXE,
        r"C:\Program Files\Godot\Godot_v4.6.2-stable_win64.exe",
        r"C:\Program Files\Godot\Godot_v4.6.2-stable_win64_console.exe",
        r"C:\Users\26739\Downloads\Godot_v4.6.2-stable_win64.exe",
        r"C:\Users\26739\Downloads\Godot_v4.6.2-stable_win64_console.exe",
    ):
        if Path(candidate_path).exists():
            return candidate_path

    for command_name in ("godot.exe", "godot4", "Godot_v4.6.2-stable_win64.exe", "godot_console.exe"):
        found = shutil.which(command_name)
        if found:
            return found

    return DEFAULT_GODOT_GUI_EXE


def build_godot_command(
    *,
    godot_exe: str,
    project_path: str = DEFAULT_PROJECT_PATH,
    scene_path: str = DEFAULT_SCENE_PATH,
    headless: bool = False,
    extra_args: list[str] | None = None,
) -> list[str]:
    command = [godot_exe]
    if headless:
        command.append("--headless")
    command.extend(["--path", project_path, "--scene", scene_path])
    if extra_args:
        command.extend(extra_args)
    return command


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Launch the reusable UI Preview Sandbox scene.")
    parser.add_argument("--godot-exe", default="", help="Explicit Godot executable path")
    parser.add_argument("--project-path", default=DEFAULT_PROJECT_PATH, help="Godot project path")
    parser.add_argument("--scene-path", default=DEFAULT_SCENE_PATH, help="Sandbox scene path")
    parser.add_argument("--headless", action="store_true", help="Launch Godot in headless mode")
    parser.add_argument("--print-command", action="store_true", help="Print the resolved command as JSON before launch")
    parser.add_argument("--dry-run", action="store_true", help="Resolve the command and exit without launching")
    return parser.parse_args()


def _print_command_payload(command: list[str], args: argparse.Namespace) -> None:
    payload: dict[str, Any] = {
        "cwd": str(REPO_ROOT),
        "command": command,
        "projectPath": args.project_path,
        "scenePath": args.scene_path,
        "headless": bool(args.headless),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def main() -> int:
    args = _parse_args()
    godot_exe = resolve_godot_gui_exe(args.godot_exe)
    command = build_godot_command(
        godot_exe=godot_exe,
        project_path=args.project_path,
        scene_path=args.scene_path,
        headless=args.headless,
    )

    if args.print_command or args.dry_run:
        _print_command_payload(command, args)
    if args.dry_run:
        return 0

    completed = subprocess.run(command, cwd=str(REPO_ROOT))
    return int(completed.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
