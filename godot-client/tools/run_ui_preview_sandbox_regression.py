#!/usr/bin/env python3
"""
UI Preview Sandbox regression runner.

Formal entrypoint:
  py -3.11 godot-client/tools/run_ui_preview_sandbox_regression.py

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

REPO_ROOT = Path(__file__).resolve().parents[2]
VALIDATOR_SCRIPT = REPO_ROOT / "godot-client" / "tools" / "validate_ui_preview_sandbox.py"
DEFAULT_SCREENSHOT_DIR = REPO_ROOT / "tmp" / "screenshots" / "ui_preview_sandbox"
DEFAULT_VALIDATION_REPORT_PATH = DEFAULT_SCREENSHOT_DIR / "preview_validation_report.json"
DEFAULT_REGRESSION_REPORT_PATH = DEFAULT_SCREENSHOT_DIR / "ui_preview_sandbox_regression_report.json"
DEFAULT_VALIDATION_LOG_PATH = DEFAULT_SCREENSHOT_DIR / "logs" / "ui_preview_sandbox_regression_validation.log"
DEFAULT_BASELINE_MANIFEST = {
    "01_hud_token_story.png": "d4928f593a7012ed6c80573284b0b10017bfad2cef857fb1c791c9646979eead",
    "02_observability_story.png": "ea3a4fa13c53850ea1479375dd1a3abb9c50ee503111dfc68cc6e8d98710dfb8",
    "03_panel_stack_story.png": "779329140cca384c4ad20e0973350c959fc84309ee4a1797d9c1bd8c8c74e9b6",
    "04_map_surface_story.png": "2b178a5ec4a62b3e89a915abad1cf691f57b584353862a86c9c48e4f7f7e2271",
    "05_map_zoom_hover_story.png": "ef99d5736840f920b6f690808ebc24d8d8c844e25b235280f2a051e88e5e587e",
    "06_map_overlay_story.png": "416d9e5d43b5ab5d2667d69ef2f64afd76db41c95e8f5b83bcff3ba46c0b2396",
    "07_map_units_story.png": "7f5e55863f739752cc91c3e76444407d1890eb0e777aaabfa1012fb03aa98749",
    "08_province_layer_story.png": "f764397e428566abb6e8a20f5f610fc76090b14d0b996f3c0933b62ca3476ff7",
    "09_warzone_layer_story.png": "f646582942f007482f66b8b6a7095bc960a58826a33ed060c32441492523cd66",
    "10_nation_layer_story.png": "17374edd6bdf37bc468a0aa94b5c2a9847d97fb38936b8e8ae0dd5353551b8cf",
    "11_ui_canvas_story.png": "1448c1ade82b69da744b70c924278d6de45f284a76bfe667ff4dde4218d3613c",
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

    if screenshot_dir != DEFAULT_SCREENSHOT_DIR:
        if Path(args.validation_report_path) == DEFAULT_VALIDATION_REPORT_PATH:
            validation_report_path = screenshot_dir / "preview_validation_report.json"
        if Path(args.regression_report_path) == DEFAULT_REGRESSION_REPORT_PATH:
            regression_report_path = screenshot_dir / "ui_preview_sandbox_regression_report.json"

    screenshot_dir.mkdir(parents=True, exist_ok=True)
    validation_log_path.parent.mkdir(parents=True, exist_ok=True)

    validate_cmd = [
        "py",
        "-3.11",
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
