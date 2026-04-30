#!/usr/bin/env python3
"""
UI Preview Sandbox regression runner.

Formal entrypoint:
  scripts\run_python.cmd godot-client\tools\run_ui_preview_sandbox_regression.py

Purpose:
- Run the formal UI preview sandbox validator.
- Compare the captured screenshots against a stable baseline hash manifest.
- Emit a machine-readable regression report with command, screenshots, hashes,
  diffs, and conclusion.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from hashlib import sha256
from pathlib import Path
from typing import Any

from run_ui_preview_sandbox import DEFAULT_PROJECT_PATH, resolve_godot_gui_exe

REPO_ROOT = Path(__file__).resolve().parents[2]
VALIDATOR_SCRIPT = REPO_ROOT / "godot-client" / "tools" / "validate_ui_preview_sandbox.py"
DEFAULT_SCREENSHOT_DIR = REPO_ROOT / "tmp" / "screenshots" / "ui_preview_sandbox"
DEFAULT_VALIDATION_REPORT_PATH = DEFAULT_SCREENSHOT_DIR / "preview_validation_report.json"
DEFAULT_REGRESSION_REPORT_PATH = DEFAULT_SCREENSHOT_DIR / "ui_preview_sandbox_regression_report.json"
DEFAULT_VALIDATION_LOG_PATH = DEFAULT_SCREENSHOT_DIR / "logs" / "ui_preview_sandbox_regression_validation.log"
DEFAULT_IMPORT_LOG_PATH = DEFAULT_SCREENSHOT_DIR / "logs" / "ui_preview_sandbox_regression_import.log"
DEFAULT_BASELINE_MANIFEST = {
    "01_hud_token_story.png": "d3d3599485c9a57cdccc7c2f134784cdcbe6bbdf3caeec6f664c555523ba8be9",
    "02_observability_story.png": "f2fd1b956694d5b087390a36b58fc32afc6cc3b87bd64b143666373eb322fc80",
    "03_panel_stack_story.png": "270ede7113cf3c69d3706e2716e097397c8a27736e4eb7e32dcca7451c4fc1cc",
    "04_map_surface_story.png": "034e0c58c613b9758ead4ccfe94ab12d585c17bd2651df018781275877e175d5",
    "05_map_zoom_hover_story.png": "00b27a803c11189b1d0a9b4adbea988318fb67dfa8c6f36c76ec52b9974ddd1f",
    "06_map_overlay_story.png": "e618bda8285058295badf8ebbf34731166fbe339f4d7e3cc3fd3fcffadcde2e6",
    "07_map_units_story.png": "c9db0fb2adcb88486b1676a7a32abb9ab22eacdf169648c65e5a972895a13792",
    "08_ui_canvas_story.png": "aad805e84afa4e94ebe8082eea312398f96c25c937264e5274c9d8cd0f71d766",
}


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _json_write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _resolve_output_path(path_value: str, *, base_dir: Path = REPO_ROOT) -> Path:
    path = Path(str(path_value).strip())
    if not path.is_absolute():
        path = base_dir / path
    return path.resolve(strict=False)


def _run_command(
    command: list[str],
    cwd: Path,
    log_path: Path,
    timeout_sec: float | None = None,
) -> dict[str, Any]:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    started = time.time()
    with log_path.open("w", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            command,
            cwd=str(cwd),
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=log_file,
            text=True,
            encoding="utf-8",
            close_fds=True,
        )
        timed_out = False
        try:
            return_code = process.wait(timeout=timeout_sec)
        except subprocess.TimeoutExpired:
            timed_out = True
            process.kill()
            return_code = process.wait(timeout=30)
    log_lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    return {
        "command": command,
        "returnCode": return_code,
        "durationMs": int((time.time() - started) * 1000),
        "logPath": str(log_path),
        "stdoutTail": log_lines[-20:],
        "stderrTail": [],
        "ok": return_code == 0 and not timed_out,
        "timedOut": timed_out,
    }


def _sha256_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the UI Preview Sandbox regression command.")
    parser.add_argument("--validation-report-path", default=str(DEFAULT_VALIDATION_REPORT_PATH))
    parser.add_argument("--regression-report-path", default=str(DEFAULT_REGRESSION_REPORT_PATH))
    parser.add_argument("--screenshot-dir", default=str(DEFAULT_SCREENSHOT_DIR))
    parser.add_argument(
        "--baseline-report",
        default="",
        help="Optional path to a previous preview_validation_report.json to compare against.",
    )
    parser.add_argument("--validation-timeout-sec", type=float, default=420.0)
    parser.add_argument("--import-timeout-sec", type=float, default=90.0)
    parser.add_argument("--print-command", action="store_true", help="Print the resolved command set as JSON.")
    parser.add_argument("--dry-run", action="store_true", help="Resolve commands and exit without launching.")
    return parser.parse_args()


def _extract_manifest_from_report(report: dict[str, Any], report_path: Path) -> dict[str, Any]:
    screenshots = report.get("artifacts", {}).get("screenshots", [])
    if not isinstance(screenshots, list) or not screenshots:
        raise ValueError(f"report does not contain screenshots: {report_path}")

    ordered_entries: list[dict[str, Any]] = []
    for screenshot_value in screenshots:
        screenshot_path = Path(str(screenshot_value))
        if not screenshot_path.exists():
            raise FileNotFoundError(f"screenshot missing: {screenshot_path}")
        ordered_entries.append(
            {
                "fileName": screenshot_path.name,
                "path": str(screenshot_path),
                "sha256": _sha256_file(screenshot_path),
            }
        )

    return {
        "reportPath": str(report_path),
        "entryCount": len(ordered_entries),
        "orderedEntries": ordered_entries,
        "hashes": {entry["fileName"]: entry["sha256"] for entry in ordered_entries},
    }


def _compare_manifests(expected: dict[str, str], actual: dict[str, str], expected_order: list[str], actual_order: list[str]) -> dict[str, Any]:
    missing = [file_name for file_name in expected_order if file_name not in actual]
    unexpected = [file_name for file_name in actual_order if file_name not in expected]
    hash_mismatches = [
        {
            "fileName": file_name,
            "expected": expected[file_name],
            "actual": actual.get(file_name, ""),
        }
        for file_name in expected_order
        if file_name in actual and actual[file_name] != expected[file_name]
    ]
    order_mismatch = expected_order != actual_order
    ok = not missing and not unexpected and not hash_mismatches and not order_mismatch
    return {
        "ok": ok,
        "missing": missing,
        "unexpected": unexpected,
        "hashMismatches": hash_mismatches,
        "orderMismatch": order_mismatch,
        "expectedCount": len(expected_order),
        "actualCount": len(actual_order),
    }


def main() -> int:
    args = _parse_args()
    screenshot_dir = _resolve_output_path(args.screenshot_dir)
    validation_report_path = _resolve_output_path(args.validation_report_path)
    regression_report_path = _resolve_output_path(args.regression_report_path)
    baseline_report_path = Path(args.baseline_report) if args.baseline_report.strip() else None
    validation_log_path = screenshot_dir / "logs" / "ui_preview_sandbox_regression_validation.log"
    import_log_path = screenshot_dir / "logs" / "ui_preview_sandbox_regression_import.log"

    if screenshot_dir != DEFAULT_SCREENSHOT_DIR:
        if Path(args.validation_report_path) == DEFAULT_VALIDATION_REPORT_PATH:
            validation_report_path = screenshot_dir / "preview_validation_report.json"
        if Path(args.regression_report_path) == DEFAULT_REGRESSION_REPORT_PATH:
            regression_report_path = screenshot_dir / "ui_preview_sandbox_regression_report.json"

    screenshot_dir.mkdir(parents=True, exist_ok=True)
    validation_log_path.parent.mkdir(parents=True, exist_ok=True)

    import_cmd = [
        resolve_godot_gui_exe(),
        "--headless",
        "--path",
        DEFAULT_PROJECT_PATH,
        "--import",
    ]
    validate_cmd = [
        sys.executable,
        str(VALIDATOR_SCRIPT),
        "--presentation-capture",
        "--report-path",
        str(validation_report_path),
        "--screenshot-dir",
        str(screenshot_dir),
    ]
    report: dict[str, Any] = {
        "command": "run_ui_preview_sandbox_regression",
        "generatedAt": _now_iso(),
        "importCommand": import_cmd,
        "validationCommand": validate_cmd,
        "validationReportPath": str(validation_report_path),
        "regressionReportPath": str(regression_report_path),
        "screenshotDir": str(screenshot_dir),
        "baseline": {
            "mode": "embedded" if baseline_report_path is None else "report",
            "reportPath": str(baseline_report_path) if baseline_report_path is not None else None,
            "hashes": DEFAULT_BASELINE_MANIFEST,
        },
        "comparison": {},
        "steps": [],
        "artifacts": {},
        "ok": False,
    }

    if args.print_command:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.dry_run:
        _json_write(regression_report_path, report)
        return 0

    import_result = _run_command(import_cmd, REPO_ROOT, import_log_path, timeout_sec=args.import_timeout_sec)
    report["steps"].append({"name": "godot_import_prewarm", **import_result})
    report["artifacts"]["importLog"] = str(import_log_path)
    if not import_result["ok"]:
        report["comparison"] = {
            "ok": False,
            "reason": "import_prewarm_failed",
        }
        _json_write(regression_report_path, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1

    validation_result = _run_command(validate_cmd, REPO_ROOT, validation_log_path, timeout_sec=args.validation_timeout_sec)
    report["steps"].append({"name": "validate", **validation_result})
    report["artifacts"]["validationLog"] = str(validation_log_path)

    if not validation_result["ok"]:
        report["comparison"] = {
            "ok": False,
            "reason": "validation_failed",
        }
        _json_write(regression_report_path, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1

    if not validation_report_path.exists():
        report["comparison"] = {
            "ok": False,
            "reason": "validation_report_missing",
        }
        _json_write(regression_report_path, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1

    current_report = json.loads(validation_report_path.read_text(encoding="utf-8"))
    current_manifest = _extract_manifest_from_report(current_report, validation_report_path)

    if baseline_report_path is not None:
        if not baseline_report_path.exists():
            report["comparison"] = {
                "ok": False,
                "reason": "baseline_report_missing",
                "baselineReportPath": str(baseline_report_path),
            }
            _json_write(regression_report_path, report)
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 1
        baseline_report = json.loads(baseline_report_path.read_text(encoding="utf-8"))
        baseline_manifest = _extract_manifest_from_report(baseline_report, baseline_report_path)
        baseline_mode = "report"
    else:
        baseline_manifest = {
            "reportPath": None,
            "entryCount": len(DEFAULT_BASELINE_MANIFEST),
            "orderedEntries": [
                {"fileName": file_name, "path": "", "sha256": file_hash}
                for file_name, file_hash in DEFAULT_BASELINE_MANIFEST.items()
            ],
            "hashes": DEFAULT_BASELINE_MANIFEST,
        }
        baseline_mode = "embedded"

    baseline_order = list(baseline_manifest["hashes"].keys())
    actual_order = list(current_manifest["hashes"].keys())
    comparison = _compare_manifests(baseline_manifest["hashes"], current_manifest["hashes"], baseline_order, actual_order)
    report["baseline"]["mode"] = baseline_mode
    if baseline_mode == "report":
        report["baseline"]["reportPath"] = baseline_manifest["reportPath"]
        report["baseline"]["entryCount"] = baseline_manifest["entryCount"]
        report["baseline"]["orderedEntries"] = baseline_manifest["orderedEntries"]
    report["comparison"] = comparison
    report["artifacts"].update(
        {
            "validationReport": str(validation_report_path),
            "screenshots": current_manifest["orderedEntries"],
        }
    )
    report["steps"].append(
        {
            "name": "compare_hashes",
            "ok": comparison["ok"],
            "baselineMode": baseline_mode,
            "missing": comparison["missing"],
            "unexpected": comparison["unexpected"],
            "hashMismatchCount": len(comparison["hashMismatches"]),
            "orderMismatch": comparison["orderMismatch"],
        }
    )
    report["ok"] = bool(comparison["ok"])
    report["conclusion"] = "PASS" if report["ok"] else "FAIL"
    _json_write(regression_report_path, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
