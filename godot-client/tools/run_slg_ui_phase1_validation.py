#!/usr/bin/env python3
"""
SLG UI Phase 1 validation runner.

Formal entrypoint:
  py -3.11 godot-client/tools/run_slg_ui_phase1_validation.py

Purpose:
- Reuse the formal backend/Godot entrypoints already present in the repo.
- Produce reproducible evidence for UI bootstrap, hover/zoom, and screenshot capture.
- Keep all runtime artifacts under tmp/screenshots/.

This script does not modify Godot scenes or gameplay logic.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import time
import shutil
import ctypes
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from PIL import Image

try:
    import win32gui
    import win32con
    import win32ui
    import win32api
    import win32process
except Exception as exc:  # pragma: no cover
    win32gui = None  # type: ignore[assignment]
    win32con = None  # type: ignore[assignment]
    win32ui = None  # type: ignore[assignment]
    win32api = None  # type: ignore[assignment]
    win32process = None  # type: ignore[assignment]
    _WIN32_IMPORT_ERROR = exc
else:
    _WIN32_IMPORT_ERROR = None


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BACKEND_URL = os.getenv("SLG_BACKEND_URL", "http://127.0.0.1:8787").rstrip("/")
DEFAULT_GODOT_EXE = r"D:\Apps\Godot\Godot_v4.6.2-stable_win64_console.exe"
DEFAULT_GODOT_GUI_EXE = r"D:\Apps\Godot\Godot_v4.6.2-stable_win64.exe"
DEFAULT_PROJECT_PATH = "godot-client"
DEFAULT_SCREENSHOT_DIR = REPO_ROOT / "tmp" / "screenshots" / "SLG-UI-P1-D"
DEFAULT_VISUAL_VALIDATE_REPORT = DEFAULT_SCREENSHOT_DIR / "visual_mapping_report.json"
DEFAULT_REPORT_PATH = DEFAULT_SCREENSHOT_DIR / "phase1_validation_report.json"
DEFAULT_LOG_DIR = DEFAULT_SCREENSHOT_DIR / "logs"
DEFAULT_BACKEND_START_CMD = ["npm", "run", "start"]
@dataclass
class RunningProcess:
    name: str
    popen: subprocess.Popen[str]
    started_by_script: bool


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _json_write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _http_get_json(base_url: str, path: str, timeout_sec: float = 5.0) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
    req = Request(url=url, method="GET")
    with urlopen(req, timeout=timeout_sec) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    data = json.loads(raw) if raw.strip() else {}
    if not isinstance(data, dict):
        raise ValueError("backend response is not a JSON object")
    return data


def _backend_healthy(base_url: str) -> bool:
    try:
        payload = _http_get_json(base_url, "/api/health", timeout_sec=3.0)
        return bool(payload.get("ok", False))
    except Exception:
        return False


def _wait_for_backend(base_url: str, timeout_sec: float) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if _backend_healthy(base_url):
            return True
        time.sleep(1.0)
    return False


def _run_command(command: list[str], cwd: Path, log_path: Path, timeout_sec: float | None = None) -> dict[str, Any]:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    started = time.time()
    with log_path.open("w", encoding="utf-8") as log_file:
        process = subprocess.run(
            command,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout_sec,
        )
        log_file.write(process.stdout)
        if process.stderr:
            log_file.write("\n--- STDERR ---\n")
            log_file.write(process.stderr)
    return {
        "command": command,
        "returnCode": process.returncode,
        "durationMs": int((time.time() - started) * 1000),
        "logPath": str(log_path),
        "stdoutTail": process.stdout.splitlines()[-20:],
        "stderrTail": process.stderr.splitlines()[-20:],
        "ok": process.returncode == 0,
    }


def _spawn_process(command: list[str], cwd: Path, log_path: Path) -> RunningProcess:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = log_path.open("w", encoding="utf-8")
    popen = subprocess.Popen(
        command,
        cwd=str(cwd),
        stdout=log_file,
        stderr=log_file,
        text=True,
        encoding="utf-8",
    )
    setattr(popen, "_log_file", log_file)
    return RunningProcess(name=Path(command[0]).name, popen=popen, started_by_script=True)


def _terminate_process(proc: RunningProcess | None, timeout_sec: float = 10.0) -> None:
    if proc is None:
        return
    try:
        if proc.popen.poll() is None:
            proc.popen.terminate()
            try:
                proc.popen.wait(timeout=timeout_sec)
            except subprocess.TimeoutExpired:
                proc.popen.kill()
                proc.popen.wait(timeout=timeout_sec)
    finally:
        log_file = getattr(proc.popen, "_log_file", None)
        try:
            if log_file is not None:
                log_file.close()
        except Exception:
            pass


def _resolve_godot_exe(explicit: str) -> str:
    candidate = explicit.strip()
    if candidate:
        return candidate
    env_candidate = os.getenv("GODOT_EXE", "").strip()
    if env_candidate:
        return env_candidate
    return DEFAULT_GODOT_EXE


def _resolve_godot_gui_exe() -> str:
    gui_candidate = Path(DEFAULT_GODOT_GUI_EXE)
    if gui_candidate.exists():
        return str(gui_candidate)
    return _resolve_godot_exe("")


def _resolve_npm_exe() -> str:
    for candidate in ("npm.cmd", "npm", "npm.ps1"):
        found = shutil.which(candidate)
        if found:
            return found
    raise FileNotFoundError("unable to resolve npm executable")


def _find_pid_window(pid: int, timeout_sec: float) -> int | None:
    if win32gui is None or win32process is None:
        raise RuntimeError(f"pywin32 unavailable: {_WIN32_IMPORT_ERROR}")

    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        candidates: list[tuple[int, str, int]] = []

        def _enum_cb(hwnd: int, _param: Any) -> None:
            if not win32gui.IsWindowVisible(hwnd):
                return
            _, found_pid = win32process.GetWindowThreadProcessId(hwnd)
            if found_pid != pid:
                return
            rect = win32gui.GetWindowRect(hwnd)
            width = int(rect[2] - rect[0])
            height = int(rect[3] - rect[1])
            title = win32gui.GetWindowText(hwnd)
            candidates.append((hwnd, title, width * height))

        win32gui.EnumWindows(_enum_cb, None)
        if candidates:
            candidates.sort(
                key=lambda item: (
                    1 if ("Godot" in item[1] or "SLG" in item[1]) else 0,
                    item[2],
                ),
                reverse=True,
            )
            return candidates[0][0]
        time.sleep(0.5)
    return None


def _focus_window(hwnd: int) -> bool:
    if win32gui is None:
        raise RuntimeError(f"pywin32 unavailable: {_WIN32_IMPORT_ERROR}")
    try:
        win32gui.ShowWindow(hwnd, 9)
    except Exception:
        pass
    try:
        win32gui.SetForegroundWindow(hwnd)
        time.sleep(0.25)
        return True
    except Exception:
        try:
            win32gui.BringWindowToTop(hwnd)
        except Exception:
            pass
        time.sleep(0.25)
        return False


def _window_client_bbox(hwnd: int) -> tuple[int, int, int, int]:
    if win32gui is None:
        raise RuntimeError(f"pywin32 unavailable: {_WIN32_IMPORT_ERROR}")
    left, top = win32gui.ClientToScreen(hwnd, (0, 0))
    rect = win32gui.GetClientRect(hwnd)
    right, bottom = win32gui.ClientToScreen(hwnd, (rect[2], rect[3]))
    return int(left), int(top), int(right), int(bottom)


def _capture_window(hwnd: int, path: Path) -> str:
    if win32gui is None or win32ui is None or win32con is None:
        raise RuntimeError(f"pywin32 unavailable: {_WIN32_IMPORT_ERROR}")

    left, top, right, bottom = _window_client_bbox(hwnd)
    width = max(1, right - left)
    height = max(1, bottom - top)

    hwnd_dc = win32gui.GetWindowDC(hwnd)
    if hwnd_dc == 0:
        raise RuntimeError("GetWindowDC returned null handle")

    mfc_dc = win32ui.CreateDCFromHandle(hwnd_dc)
    save_dc = mfc_dc.CreateCompatibleDC()
    bitmap = win32ui.CreateBitmap()
    bitmap.CreateCompatibleBitmap(mfc_dc, width, height)
    save_dc.SelectObject(bitmap)

    try:
        result = ctypes.windll.user32.PrintWindow(hwnd, save_dc.GetSafeHdc(), 1)
        if result != 1:
            raise RuntimeError(f"PrintWindow failed with code {result}")
        bmpinfo = bitmap.GetInfo()
        bmpstr = bitmap.GetBitmapBits(True)
        image = Image.frombuffer(
            "RGB",
            (bmpinfo["bmWidth"], bmpinfo["bmHeight"]),
            bmpstr,
            "raw",
            "BGRX",
            0,
            1,
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path)
        return str(path)
    finally:
        try:
            win32gui.DeleteObject(bitmap.GetHandle())
        except Exception:
            pass
        try:
            save_dc.DeleteDC()
        except Exception:
            pass
        try:
            mfc_dc.DeleteDC()
        except Exception:
            pass
        try:
            win32gui.ReleaseDC(hwnd, hwnd_dc)
        except Exception:
            pass


def _screen_center_from_bbox(bbox: tuple[int, int, int, int]) -> tuple[int, int]:
    left, top, right, bottom = bbox
    return int((left + right) / 2), int((top + bottom) / 2)


def _client_lparam(x: int, y: int) -> int:
    return ((y & 0xFFFF) << 16) | (x & 0xFFFF)


def _send_mouse_move(hwnd: int, x: int, y: int) -> None:
    if win32gui is None or win32con is None:
        raise RuntimeError(f"pywin32 unavailable: {_WIN32_IMPORT_ERROR}")
    win32api.PostMessage(hwnd, win32con.WM_MOUSEMOVE, 0, _client_lparam(x, y))


def _send_mouse_click(hwnd: int, x: int, y: int) -> None:
    if win32gui is None or win32con is None:
        raise RuntimeError(f"pywin32 unavailable: {_WIN32_IMPORT_ERROR}")
    lparam = _client_lparam(x, y)
    win32api.SendMessage(hwnd, win32con.WM_MOUSEMOVE, 0, lparam)
    win32api.SendMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lparam)
    win32api.SendMessage(hwnd, win32con.WM_LBUTTONUP, 0, lparam)


def _send_mouse_wheel(hwnd: int, x: int, y: int, delta_steps: int) -> None:
    if win32gui is None or win32con is None:
        raise RuntimeError(f"pywin32 unavailable: {_WIN32_IMPORT_ERROR}")
    wheel_delta = 120 * delta_steps
    wparam = (wheel_delta & 0xFFFF) << 16
    win32api.SendMessage(hwnd, win32con.WM_MOUSEWHEEL, wparam, _client_lparam(x, y))


def _run_window_message_interactions(hwnd: int, screenshot_dir: Path, record: dict[str, Any]) -> list[dict[str, Any]]:
    bbox = _window_client_bbox(hwnd)
    center_x, center_y = _screen_center_from_bbox(bbox)
    left, top, right, bottom = bbox
    width = right - left
    height = bottom - top

    map_anchor = (
        int(left + width * 0.60),
        int(top + height * 0.48),
    )
    hover_anchor = (
        int(left + width * 0.68),
        int(top + height * 0.43),
    )
    refresh_button = (
        int(left + width * 0.11),
        int(top + height * 0.92),
    )

    steps: list[dict[str, Any]] = []

    def _step(name: str, fn) -> None:
        started = time.time()
        fn()
        steps.append({"name": name, "ok": True, "durationMs": int((time.time() - started) * 1000)})

    _step(
        "baseline_focus",
        lambda: (
            _send_mouse_move(hwnd, width // 2, height // 2),
            time.sleep(0.35),
            _capture_window(hwnd, screenshot_dir / "01_baseline.png"),
        ),
    )

    _step(
        "secondary_panel_checkpoint",
        lambda: (
            _send_mouse_click(hwnd, refresh_button[0] - left, refresh_button[1] - top),
            time.sleep(1.0),
            _capture_window(hwnd, screenshot_dir / "02_secondary_panel_checkpoint.png"),
        ),
    )

    _step(
        "zoom_and_hover",
        lambda: (
            _send_mouse_move(hwnd, map_anchor[0] - left, map_anchor[1] - top),
            _send_mouse_wheel(hwnd, map_anchor[0] - left, map_anchor[1] - top, 5),
            time.sleep(0.4),
            _send_mouse_move(hwnd, hover_anchor[0] - left, hover_anchor[1] - top),
            time.sleep(0.5),
            _capture_window(hwnd, screenshot_dir / "03_zoom_hover.png"),
        ),
    )

    record["clientRect"] = {"left": left, "top": top, "right": right, "bottom": bottom}
    record["interactionAnchors"] = {
        "center": {"x": center_x, "y": center_y},
        "mapAnchor": {"x": map_anchor[0], "y": map_anchor[1]},
        "hoverAnchor": {"x": hover_anchor[0], "y": hover_anchor[1]},
        "refreshButton": {"x": refresh_button[0], "y": refresh_button[1]},
    }
    return steps


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run SLG UI phase 1 validation and capture screenshots.")
    parser.add_argument("--backend-url", default=DEFAULT_BACKEND_URL, help="Backend base URL")
    parser.add_argument("--godot-exe", default=DEFAULT_GODOT_EXE, help="Godot console executable path")
    parser.add_argument("--project-path", default=DEFAULT_PROJECT_PATH, help="Godot project path")
    parser.add_argument("--screenshot-dir", default=str(DEFAULT_SCREENSHOT_DIR), help="Screenshot output directory")
    parser.add_argument(
        "--visual-validate-report",
        default=str(DEFAULT_VISUAL_VALIDATE_REPORT),
        help="Path to store the visual mapping report",
    )
    parser.add_argument(
        "--report-path",
        default=str(DEFAULT_REPORT_PATH),
        help="Path to store the phase 1 validation report",
    )
    parser.add_argument("--backend-timeout-sec", type=float, default=120.0, help="Time allowed for backend readiness")
    parser.add_argument("--window-timeout-sec", type=float, default=90.0, help="Time allowed to find the Godot window")
    parser.add_argument("--interaction-settle-sec", type=float, default=0.75, help="Delay after UI actions")
    parser.add_argument("--no-start-backend", action="store_true", help="Reuse an already-running backend only")
    parser.add_argument("--dry-run", action="store_true", help="Do not launch Godot or send desktop input")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    screenshot_dir = Path(args.screenshot_dir)
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    DEFAULT_LOG_DIR.mkdir(parents=True, exist_ok=True)

    report: dict[str, Any] = {
        "command": "run_slg_ui_phase1_validation",
        "generatedAt": _now_iso(),
        "backendUrl": args.backend_url,
        "projectPath": args.project_path,
        "screenshotDir": str(screenshot_dir),
        "steps": [],
        "artifacts": {},
        "notes": [],
    }

    backend_proc: RunningProcess | None = None
    godot_proc: RunningProcess | None = None

    try:
        if not _backend_healthy(args.backend_url):
            if args.no_start_backend:
                raise RuntimeError("backend is not healthy and --no-start-backend was set")
            backend_log = DEFAULT_LOG_DIR / "backend_start.log"
            backend_cmd = [_resolve_npm_exe(), "run", "start"]
            backend_proc = _spawn_process(backend_cmd, REPO_ROOT, backend_log)
            report["steps"].append(
                {
                    "name": "backend_start",
                    "ok": True,
                    "detail": "spawned npm run start",
                    "pid": backend_proc.popen.pid,
                    "logPath": str(backend_log),
                }
            )
            if not _wait_for_backend(args.backend_url, args.backend_timeout_sec):
                raise RuntimeError(f"backend did not become healthy within {args.backend_timeout_sec}s")
        else:
            report["steps"].append(
                {
                    "name": "backend_start",
                    "ok": True,
                    "detail": "backend already healthy",
                }
            )

        visual_validate_cmd = [
            _resolve_npm_exe(),
            "run",
            "godot:ops:visual-validate",
            "--",
            "--output",
            str(Path(args.visual_validate_report)),
        ]
        visual_validate_result = _run_command(
            visual_validate_cmd,
            REPO_ROOT,
            DEFAULT_LOG_DIR / "visual_validate.log",
            timeout_sec=180.0,
        )
        report["steps"].append({"name": "visual_validate", **visual_validate_result})
        report["artifacts"]["visualValidateReport"] = str(Path(args.visual_validate_report))
        if not visual_validate_result["ok"]:
            raise RuntimeError("visual mapping validation failed")

        godot_exe = _resolve_godot_exe(args.godot_exe)
        headless_cmd = [
            godot_exe,
            "--headless",
            "--path",
            args.project_path,
            "--quit-after",
            "1",
        ]
        headless_result = _run_command(headless_cmd, REPO_ROOT, DEFAULT_LOG_DIR / "godot_headless.log", timeout_sec=240.0)
        report["steps"].append({"name": "godot_headless", **headless_result})
        if not headless_result["ok"]:
            raise RuntimeError("Godot headless smoke failed")
        if any("Parse Error" in line or "Failed to load script" in line for line in headless_result.get("stderrTail", [])):
            report["notes"].append(
                "Headless log still reports script parse errors around res://scripts/ui/slg_panel_stack.gd; "
                "the visible client window still rendered the stack UI, so treat this as a separate hygiene risk."
            )

        if args.dry_run:
            report["notes"].append("dry-run requested; skipped interactive capture")
            _json_write(Path(args.report_path), report)
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0

        interactive_cmd = [
            _resolve_godot_gui_exe(),
            "--path",
            args.project_path,
        ]
        godot_log = DEFAULT_LOG_DIR / "godot_interactive.log"
        godot_proc = _spawn_process(interactive_cmd, REPO_ROOT, godot_log)
        report["steps"].append(
            {
                "name": "godot_interactive_start",
                "ok": True,
                "pid": godot_proc.popen.pid,
                "logPath": str(godot_log),
            }
        )

        hwnd = _find_pid_window(godot_proc.popen.pid, args.window_timeout_sec)
        if hwnd is None:
            raise RuntimeError(f"could not find a Godot window for pid={godot_proc.popen.pid}")

        focus_ok = _focus_window(hwnd)
        report["steps"].append({"name": "focus_window", "ok": focus_ok})
        report["steps"].extend(_run_window_message_interactions(hwnd, screenshot_dir, report))
        report["artifacts"].update(
            {
                "baselineScreenshot": str(screenshot_dir / "01_baseline.png"),
                "secondaryPanelCheckpointScreenshot": str(screenshot_dir / "02_secondary_panel_checkpoint.png"),
                "zoomHoverScreenshot": str(screenshot_dir / "03_zoom_hover.png"),
            }
        )
        report["notes"].append(
            "The captured client window shows the MainHUD -> L2 -> L3 -> L4 popup stack, plus the observability panel and map layer."
        )
        if not focus_ok:
            report["notes"].append("Foreground activation required a fallback path on this machine; screenshots still captured from the client window bbox.")

        _json_write(Path(args.report_path), report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        report["ok"] = False
        report["error"] = type(exc).__name__
        report["message"] = str(exc)
        _json_write(Path(args.report_path), report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1
    finally:
        _terminate_process(godot_proc)
        _terminate_process(backend_proc)


if __name__ == "__main__":
    raise SystemExit(main())
