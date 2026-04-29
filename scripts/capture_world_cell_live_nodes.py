#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
GODOT_PROJECT_PATH = REPO_ROOT / "godot-client"
MAIN_SCENE = "res://scenes/app/main.tscn"
ARTIFACT_DIR = REPO_ROOT / "tmp" / "screenshots" / "world_resource_alignment"
ARTIFACT_PREFIX = "world_cell_runtime_preview_capture_live_nodes"
STDOUT_LOG = REPO_ROOT / "tmp" / "godot_live_nodes_capture_stdout.log"
STDERR_LOG = REPO_ROOT / "tmp" / "godot_live_nodes_capture_stderr.log"
DEFAULT_BACKEND_URL = "http://127.0.0.1:8787"


sys.path.insert(0, str(SCRIPT_DIR))
from launch_godot import resolve_godot_exe  # noqa: E402


def _artifact_paths() -> dict[str, Path]:
    return {
        "metadata": ARTIFACT_DIR / f"{ARTIFACT_PREFIX}.json",
        "fullCapture": ARTIFACT_DIR / f"{ARTIFACT_PREFIX}.png",
        "cropCapture": ARTIFACT_DIR / f"{ARTIFACT_PREFIX}_crop.png",
    }


def _sanitize_artifact_token(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in value.strip().lower())


def _scoped_artifact_paths(map_scope: str, scope_id: str = "") -> dict[str, Path]:
    scope_suffix = _sanitize_artifact_token(map_scope)
    id_suffix = _sanitize_artifact_token(scope_id)
    if not scope_suffix:
        scope_suffix = "unknown"
    if id_suffix:
        scope_suffix = f"{scope_suffix}_{id_suffix}"
    return {
        "metadata": ARTIFACT_DIR / f"{ARTIFACT_PREFIX}_{scope_suffix}.json",
        "fullCapture": ARTIFACT_DIR / f"{ARTIFACT_PREFIX}_{scope_suffix}.png",
        "cropCapture": ARTIFACT_DIR / f"{ARTIFACT_PREFIX}_{scope_suffix}_crop.png",
    }


def _read_tail(path: Path, max_lines: int = 80) -> list[str]:
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return lines[-max_lines:]


def _check_backend(base_url: str, timeout_sec: float) -> tuple[bool, str]:
    try:
        with urlopen(f"{base_url.rstrip('/')}/api/health", timeout=timeout_sec) as response:
            if 200 <= response.status < 300:
                return True, f"status={response.status}"
            return False, f"status={response.status}"
    except URLError as exc:
        return False, str(exc.reason)
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def _clean_artifacts(paths: dict[str, Path]) -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    for path in paths.values():
        if path.exists():
            path.unlink()


def _copy_artifacts(source_paths: dict[str, Path], target_paths: dict[str, Path]) -> None:
    for key, source_path in source_paths.items():
        target_path = target_paths[key]
        if source_path.exists():
            shutil.copy2(source_path, target_path)


def _validate_metadata(path: Path, expected_counts: dict[str, int]) -> tuple[list[str], dict[str, object]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    live_backend = data.get("liveBackend") if isinstance(data, dict) else {}
    if not isinstance(live_backend, dict):
        live_backend = {}
    availability = live_backend.get("strategicNodeAvailability", {})
    if not isinstance(availability, dict):
        availability = {}
    status = live_backend.get("liveNodeCaptureStatus", {})
    if not isinstance(status, dict):
        status = {}
    sample_hit_stats = live_backend.get("sampleHitStats", {})
    if not isinstance(sample_hit_stats, dict):
        sample_hit_stats = {}
    samples = data.get("samples", []) if isinstance(data, dict) else []
    if not isinstance(samples, list):
        samples = []
    observed_counts = availability.get("observedRawBackendCounts", {})
    if not isinstance(observed_counts, dict):
        observed_counts = {}
    sample_counts = status.get("sampleCountsByType", {})
    if not isinstance(sample_counts, dict):
        sample_counts = {}

    errors: list[str] = []
    if data.get("captureMode") != "live_nodes":
        errors.append(f"captureMode={data.get('captureMode')!r}")
    if data.get("mode") != "live_backend_nodes":
        errors.append(f"mode={data.get('mode')!r}")
    for node_type, expected_count in expected_counts.items():
        actual_count = int(observed_counts.get(node_type, -1) or -1)
        if actual_count != expected_count:
            errors.append(f"observedRawBackendCounts.{node_type}={actual_count}, expected={expected_count}")
        if int(sample_counts.get(node_type, 0) or 0) <= 0:
            errors.append(f"missing live sample for {node_type}")
    for key in (
        "allHitOk",
        "allScreenRoundtripOk",
        "allReservedProxyOk",
        "allSelectionOk",
        "allHoverOk",
    ):
        if not bool(sample_hit_stats.get(key, False)):
            errors.append(f"sampleHitStats.{key} is not true")
    if not bool(status.get("ok", False)):
        errors.append("liveNodeCaptureStatus.ok is not true")
    reserved_audit = live_backend.get("reservedHitCoverageAudit", {})
    if not isinstance(reserved_audit, dict):
        reserved_audit = {}
    if not bool(reserved_audit.get("allReservedHitsOk", False)):
        errors.append("reservedHitCoverageAudit.allReservedHitsOk is not true")

    summary: dict[str, object] = {
        "captureMode": data.get("captureMode"),
        "mode": data.get("mode"),
        "sampleCount": len(samples),
        "sampleCountsByType": sample_counts,
        "observedRawBackendCounts": observed_counts,
        "sampleHitStats": sample_hit_stats,
        "liveNodeCaptureStatusOk": status.get("ok"),
        "liveNodeFailedChecks": status.get("failedChecks", []),
        "reservedHitCoverage": {
            "allReservedHitsOk": reserved_audit.get("allReservedHitsOk"),
            "footprintCellHitCount": reserved_audit.get("footprintCellHitCount"),
            "coverageScope": reserved_audit.get("coverageScope"),
        },
    }
    return errors, summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture Godot world-cell live backend pass/fort/dock samples.")
    parser.add_argument("--backend-url", default=os.getenv("SLG_BACKEND_URL", DEFAULT_BACKEND_URL))
    parser.add_argument("--map-scope", default="bootstrap", choices=("bootstrap", "full", "province", "region", "viewport"))
    parser.add_argument("--timeout-sec", type=float, default=90.0)
    parser.add_argument("--health-timeout-sec", type=float, default=5.0)
    parser.add_argument("--godot-exe", default="")
    parser.add_argument("--project-path", default=str(GODOT_PROJECT_PATH))
    parser.add_argument("--scene", default=MAIN_SCENE)
    parser.add_argument("--province-id", default="")
    parser.add_argument("--region-id", default="")
    parser.add_argument("--center-x", default="")
    parser.add_argument("--center-y", default="")
    parser.add_argument("--layer", default="")
    parser.add_argument("--expected-pass", type=int, default=378)
    parser.add_argument("--expected-fort", type=int, default=6)
    parser.add_argument("--expected-dock", type=int, default=4)
    parser.add_argument("--no-clean", action="store_true")
    parser.add_argument("--skip-backend-health", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    paths = _artifact_paths()
    scope_id_parts = [
        args.province_id,
        args.region_id,
        args.layer,
        args.center_x,
        args.center_y,
    ]
    scoped_paths = _scoped_artifact_paths(args.map_scope, "_".join(part for part in scope_id_parts if part))
    expected_counts = {
        "pass": args.expected_pass,
        "fort": args.expected_fort,
        "dock": args.expected_dock,
    }
    exe = resolve_godot_exe("headless", args.godot_exe)
    command = [
        exe,
        "--path",
        str(Path(args.project_path).resolve()),
        "--scene",
        args.scene,
    ]
    env = os.environ.copy()
    env["SLG_BACKEND_URL"] = args.backend_url.rstrip("/")
    env["SLG_EXPORT_WORLD_CELL_PREVIEW_CAPTURE"] = "1"
    env["SLG_WORLD_CELL_CAPTURE_MODE"] = "live_nodes"
    env["SLG_MAP_SCOPE"] = args.map_scope
    env["SLG_MAP_PROVINCE_ID"] = args.province_id
    env["SLG_MAP_REGION_ID"] = args.region_id
    env["SLG_MAP_CENTER_X"] = args.center_x
    env["SLG_MAP_CENTER_Y"] = args.center_y
    env["SLG_MAP_LAYER"] = args.layer
    env["SLG_BOOT_DISPLAY_MODE"] = "world"

    payload: dict[str, object] = {
        "command": command,
        "backendUrl": env["SLG_BACKEND_URL"],
        "mapScope": args.map_scope,
        "mapQuery": {
            "provinceId": args.province_id,
            "regionId": args.region_id,
            "centerX": args.center_x,
            "centerY": args.center_y,
            "layer": args.layer,
        },
        "expectedCounts": expected_counts,
        "artifacts": {key: str(value) for key, value in paths.items()},
        "scopedArtifacts": {key: str(value) for key, value in scoped_paths.items()},
        "logs": {
            "stdout": str(STDOUT_LOG),
            "stderr": str(STDERR_LOG),
        },
    }
    if not exe:
        payload["ok"] = False
        payload["error"] = "godot_exe_not_found"
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 1
    if args.dry_run:
        payload["ok"] = True
        payload["dryRun"] = True
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if not args.skip_backend_health:
        backend_ok, backend_detail = _check_backend(env["SLG_BACKEND_URL"], args.health_timeout_sec)
        payload["backendHealth"] = {"ok": backend_ok, "detail": backend_detail}
        if not backend_ok:
            payload["ok"] = False
            payload["error"] = "backend_health_failed"
            print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 1

    if not args.no_clean:
        _clean_artifacts(paths)
        _clean_artifacts(scoped_paths)
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    STDOUT_LOG.parent.mkdir(parents=True, exist_ok=True)
    start_time = time.time()
    found_metadata = False
    process_exited_before_metadata = False
    godot_stopped_by_wrapper = False
    with STDOUT_LOG.open("w", encoding="utf-8", errors="replace") as stdout_file, STDERR_LOG.open(
        "w",
        encoding="utf-8",
        errors="replace",
    ) as stderr_file:
        process = subprocess.Popen(
            command,
            cwd=REPO_ROOT,
            env=env,
            stdout=stdout_file,
            stderr=stderr_file,
            text=True,
        )
        while time.time() - start_time < args.timeout_sec:
            if paths["metadata"].exists():
                found_metadata = True
                break
            if process.poll() is not None:
                process_exited_before_metadata = True
                break
            time.sleep(0.5)
        if process.poll() is None:
            godot_stopped_by_wrapper = True
            process.terminate()
            try:
                process.wait(timeout=3.0)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3.0)
        payload["godotPid"] = process.pid
        payload["godotExitCode"] = process.returncode

    payload["durationMs"] = int((time.time() - start_time) * 1000)
    payload["foundMetadata"] = found_metadata
    payload["processExitedBeforeMetadata"] = process_exited_before_metadata
    payload["godotStoppedByWrapper"] = godot_stopped_by_wrapper
    payload["artifactStatus"] = {
        key: {"exists": value.exists(), "size": value.stat().st_size if value.exists() else 0}
        for key, value in paths.items()
    }
    if not found_metadata:
        payload["ok"] = False
        payload["error"] = "metadata_not_found"
        payload["stdoutTail"] = _read_tail(STDOUT_LOG)
        payload["stderrTail"] = _read_tail(STDERR_LOG)
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 1

    validation_errors, metadata_summary = _validate_metadata(paths["metadata"], expected_counts)
    if not validation_errors:
        _copy_artifacts(paths, scoped_paths)
    payload["metadataSummary"] = metadata_summary
    payload["validationErrors"] = validation_errors
    payload["scopedArtifactStatus"] = {
        key: {"exists": value.exists(), "size": value.stat().st_size if value.exists() else 0}
        for key, value in scoped_paths.items()
    }
    payload["ok"] = not validation_errors
    if validation_errors:
        payload["stdoutTail"] = _read_tail(STDOUT_LOG)
        payload["stderrTail"] = _read_tail(STDERR_LOG)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if not validation_errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
