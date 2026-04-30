#!/usr/bin/env python3
"""
UI Preview Sandbox validation runner.

Formal entrypoint:
  scripts\run_python.cmd godot-client\tools\validate_ui_preview_sandbox.py

Purpose:
- Launch the reusable UI preview sandbox scene.
- Drive at least one reproducible story path.
- Capture screenshots and a JSON report under tmp/screenshots/ui_preview_sandbox/.
"""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
import subprocess
import textwrap
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

from run_ui_preview_sandbox import (
    DEFAULT_PROJECT_PATH,
    DEFAULT_SCENE_PATH,
    REPO_ROOT,
    build_godot_command,
    resolve_godot_gui_exe,
)

try:
    import win32api
    import win32con
    import win32gui
    import win32process
    import win32ui
except Exception as exc:  # pragma: no cover
    win32api = None  # type: ignore[assignment]
    win32con = None  # type: ignore[assignment]
    win32gui = None  # type: ignore[assignment]
    win32process = None  # type: ignore[assignment]
    win32ui = None  # type: ignore[assignment]
    _WIN32_IMPORT_ERROR = exc
else:
    _WIN32_IMPORT_ERROR = None


PROJECT_ROOT = REPO_ROOT / "godot-client"
DEFAULT_SCREENSHOT_DIR = REPO_ROOT / "tmp" / "screenshots" / "ui_preview_sandbox"
DEFAULT_REPORT_PATH = DEFAULT_SCREENSHOT_DIR / "preview_validation_report.json"
DEFAULT_LOG_DIR = DEFAULT_SCREENSHOT_DIR / "logs"
DEFAULT_GODOT_LOG = DEFAULT_LOG_DIR / "godot_preview.log"
DEFAULT_HEADLESS_LOG = DEFAULT_LOG_DIR / "godot_preview_headless.log"
TEMP_DRIVER_DIR = PROJECT_ROOT / "tmp"
TEMP_DRIVER_SCRIPT_PATH = TEMP_DRIVER_DIR / "ui_preview_sandbox_driver.gd"
TEMP_DRIVER_SCENE_PATH = TEMP_DRIVER_DIR / "ui_preview_sandbox_driver.tscn"


@dataclass
class RunningProcess:
    name: str
    popen: subprocess.Popen[str]
    started_by_script: bool


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _json_write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _run_command(command: list[str], cwd: Path, log_path: Path, timeout_sec: float | None = None) -> dict[str, Any]:
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
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _resolve_story_path(path_value: str) -> Path:
    normalized = str(path_value).strip()
    if normalized.startswith("res://"):
        return PROJECT_ROOT / normalized.removeprefix("res://").replace("/", os.sep)
    return Path(normalized)


def _normalize_string_list(raw_values: Any) -> list[str]:
    normalized: list[str] = []
    if isinstance(raw_values, list):
        for item in raw_values:
            value = str(item).strip()
            if value != "":
                normalized.append(value)
    return normalized


def _load_json_dict(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _resolve_output_path(path_value: str, *, base_dir: Path = REPO_ROOT) -> Path:
    path = Path(str(path_value).strip())
    if not path.is_absolute():
        path = base_dir / path
    return path.resolve(strict=False)


def _validate_story_manifest_contract(manifest_path: Path) -> tuple[bool, dict[str, Any]]:
    if not manifest_path.exists():
        return False, {"reason": f"manifest missing: {manifest_path}"}
    try:
        manifest = _load_json_dict(manifest_path)
    except Exception as exc:
        return False, {"reason": f"manifest parse failed: {exc}"}

    errors: list[dict[str, Any]] = []
    schema_version = int(manifest.get("schemaVersion", 0))
    if schema_version < 3:
        errors.append({"path": "schemaVersion", "reason": f"expected >= 3, got {schema_version}"})

    entry_scene_path = str(manifest.get("entryScenePath", "")).strip()
    if entry_scene_path == "":
        errors.append({"path": "entryScenePath", "reason": "missing"})

    stories = manifest.get("stories", [])
    if not isinstance(stories, list) or not stories:
        errors.append({"path": "stories", "reason": "missing or empty"})
        return False, {"schemaVersion": schema_version, "errors": errors}

    story_ids: list[str] = []
    for index, story in enumerate(stories):
        if not isinstance(story, dict):
            errors.append({"path": f"stories[{index}]", "reason": "expected object"})
            continue

        story_id = str(story.get("id", "")).strip()
        story_ids.append(story_id or f"story_{index}")
        base_path = f"stories[{index}]({story_id or 'unknown'})"
        required_fields = ["id", "title", "description", "scenePath", "payloadPath", "defaultSourceMode", "dataSources", "captureTargets", "validation"]
        for field_name in required_fields:
            raw_value = story.get(field_name, None)
            if field_name in {"captureTargets", "validation"}:
                if raw_value is None:
                    errors.append({"path": f"{base_path}.{field_name}", "reason": "missing"})
                continue
            if str(raw_value).strip() == "":
                errors.append({"path": f"{base_path}.{field_name}", "reason": "missing"})

        capture_targets = _normalize_string_list(story.get("captureTargets", []))
        if not capture_targets:
            errors.append({"path": f"{base_path}.captureTargets", "reason": "empty"})

        default_source_mode = str(story.get("defaultSourceMode", "")).strip()
        if default_source_mode == "":
            errors.append({"path": f"{base_path}.defaultSourceMode", "reason": "missing"})
        source_ids: list[str] = []
        raw_sources = story.get("dataSources", [])
        if not isinstance(raw_sources, list) or not raw_sources:
            errors.append({"path": f"{base_path}.dataSources", "reason": "missing or empty"})
        else:
            for source_index, source in enumerate(raw_sources):
                if not isinstance(source, dict):
                    errors.append({"path": f"{base_path}.dataSources[{source_index}]", "reason": "expected object"})
                    continue
                source_id = str(source.get("id", "")).strip()
                source_title = str(source.get("title", "")).strip()
                source_description = str(source.get("description", "")).strip()
                source_mode = str(source.get("mode", "")).strip()
                if source_id == "":
                    errors.append({"path": f"{base_path}.dataSources[{source_index}].id", "reason": "missing"})
                if source_title == "":
                    errors.append({"path": f"{base_path}.dataSources[{source_index}].title", "reason": "missing"})
                if source_description == "":
                    errors.append({"path": f"{base_path}.dataSources[{source_index}].description", "reason": "missing"})
                if source_mode == "":
                    errors.append({"path": f"{base_path}.dataSources[{source_index}].mode", "reason": "missing"})
                if source_id != "":
                    source_ids.append(source_id)
        if default_source_mode != "" and default_source_mode not in source_ids:
            errors.append({"path": f"{base_path}.defaultSourceMode", "reason": f"not found in dataSources ({default_source_mode})"})

        validation = story.get("validation", {})
        if not isinstance(validation, dict):
            errors.append({"path": f"{base_path}.validation", "reason": "expected object"})
            validation = {}

        validation_kind = str(validation.get("kind", "")).strip()
        if validation_kind == "":
            errors.append({"path": f"{base_path}.validation.kind", "reason": "missing"})

        validation_targets = _normalize_string_list(validation.get("captureTargets", []))
        if not validation_targets:
            errors.append({"path": f"{base_path}.validation.captureTargets", "reason": "empty"})
        elif capture_targets and validation_targets != capture_targets:
            errors.append(
                {
                    "path": f"{base_path}.validation.captureTargets",
                    "reason": "must match story.captureTargets",
                }
            )

        expected_state_count = int(validation.get("expectedStateCount", 0))
        if expected_state_count <= 0:
            errors.append({"path": f"{base_path}.validation.expectedStateCount", "reason": "must be > 0"})

        story_scene_path = str(story.get("scenePath", "")).strip()
        payload_path = _resolve_story_path(str(story.get("payloadPath", "")).strip())
        if payload_path.exists():
            try:
                payload = _load_json_dict(payload_path)
            except Exception as exc:
                errors.append({"path": f"{base_path}.payloadPath", "reason": f"payload parse failed: {exc}"})
                continue
            payload_story_id = str(payload.get("storyId", "")).strip()
            if payload_story_id == "" or payload_story_id != story_id:
                errors.append(
                    {
                        "path": f"{base_path}.payload.storyId",
                        "reason": f"expected {story_id}, got {payload_story_id or 'missing'}",
                    }
                )
            payload_capture_targets = _normalize_string_list(payload.get("captureTargets", []))
            if payload_capture_targets != capture_targets:
                errors.append(
                    {
                        "path": f"{base_path}.payload.captureTargets",
                        "reason": "must match story.captureTargets",
                    }
                    )
            payload_data_source = payload.get("dataSource", {})
            if not isinstance(payload_data_source, dict):
                errors.append({"path": f"{base_path}.payload.dataSource", "reason": "expected object"})
            else:
                payload_requested_mode = str(payload_data_source.get("requestedMode", "")).strip()
                payload_effective_mode = str(payload_data_source.get("effectiveMode", "")).strip()
                payload_available_modes = _normalize_string_list(payload_data_source.get("availableModes", []))
                if payload_requested_mode != default_source_mode:
                    errors.append(
                        {
                            "path": f"{base_path}.payload.dataSource.requestedMode",
                            "reason": f"must match story.defaultSourceMode ({default_source_mode})",
                        }
                    )
                if payload_effective_mode != default_source_mode:
                    errors.append(
                        {
                            "path": f"{base_path}.payload.dataSource.effectiveMode",
                            "reason": f"must match story.defaultSourceMode ({default_source_mode})",
                        }
                    )
                if payload_available_modes != source_ids:
                    errors.append(
                        {
                            "path": f"{base_path}.payload.dataSource.availableModes",
                            "reason": "must match story.dataSources ids",
                        }
                    )
            payload_validation = payload.get("validation", {})
            if not isinstance(payload_validation, dict):
                errors.append({"path": f"{base_path}.payload.validation", "reason": "expected object"})
            else:
                payload_validation_kind = str(payload_validation.get("kind", "")).strip()
                if payload_validation_kind == "":
                    errors.append({"path": f"{base_path}.payload.validation.kind", "reason": "missing"})
                elif payload_validation_kind != validation_kind:
                    errors.append(
                        {
                            "path": f"{base_path}.payload.validation.kind",
                            "reason": f"must match manifest validation kind ({validation_kind})",
                        }
                    )
                payload_validation_targets = _normalize_string_list(payload_validation.get("captureTargets", []))
                if payload_validation_targets != capture_targets:
                    errors.append(
                        {
                            "path": f"{base_path}.payload.validation.captureTargets",
                            "reason": "must match story.captureTargets",
                        }
                    )
                payload_expected_state_count = int(payload_validation.get("expectedStateCount", 0))
                if payload_expected_state_count != expected_state_count:
                    errors.append(
                        {
                            "path": f"{base_path}.payload.validation.expectedStateCount",
                            "reason": f"must match manifest validation expectedStateCount ({expected_state_count})",
                        }
                    )
                if payload_validation.get("requiresDistinctScreenshots", None) is not True:
                    errors.append(
                        {
                            "path": f"{base_path}.payload.validation.requiresDistinctScreenshots",
                            "reason": "must be true",
                        }
                    )
            states = payload.get("states", [])
            if not isinstance(states, list) or len(states) != expected_state_count:
                errors.append(
                    {
                        "path": f"{base_path}.payload.states",
                        "reason": f"expected {expected_state_count} states, got {len(states) if isinstance(states, list) else 'invalid'}",
                    }
                )
        else:
            errors.append({"path": f"{base_path}.payloadPath", "reason": f"missing payload: {payload_path}"})

        if story_scene_path == "":
            errors.append({"path": f"{base_path}.scenePath", "reason": "missing"})

    summary = {
        "schemaVersion": schema_version,
        "storyCount": len(stories),
        "storyIds": story_ids,
        "errorCount": len(errors),
        "errors": errors,
    }
    return len(errors) == 0, summary


def _validate_story_uniqueness(screenshot_paths: list[Path], driver_report: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    story_sequence = driver_report.get("storySequence", [])
    if not isinstance(story_sequence, list):
        return False, {"reason": "driver storySequence missing or invalid"}

    first_distinct: list[tuple[str, Path]] = []
    seen_story_ids: set[str] = set()
    for index, entry in enumerate(story_sequence):
        if not isinstance(entry, dict):
            continue
        story_id = str(entry.get("story_id", "")).strip()
        if story_id == "" or story_id in seen_story_ids:
            continue
        if index >= len(screenshot_paths):
            break
        first_distinct.append((story_id, screenshot_paths[index]))
        seen_story_ids.add(story_id)

    if len(first_distinct) < 3:
        return False, {"reason": "fewer than three distinct stories were captured"}

    hashes = [_sha256_file(path) for _, path in first_distinct]
    unique_hash_count = len(set(hashes))
    return unique_hash_count == len(first_distinct), {
        "stories": [story_id for story_id, _ in first_distinct],
        "hashes": hashes,
        "uniqueHashCount": unique_hash_count,
    }


def _build_story_sequence_from_manifest(manifest_path: Path) -> list[dict[str, str]]:
    manifest = _load_json_dict(manifest_path)
    raw_stories = manifest.get("stories", [])
    if not isinstance(raw_stories, list):
        raise ValueError(f"manifest stories missing or invalid: {manifest_path}")

    story_sequence: list[dict[str, str]] = []
    for index, story_value in enumerate(raw_stories, start=1):
        if not isinstance(story_value, dict):
            continue
        story_id = str(story_value.get("id", "")).strip()
        if story_id == "":
            continue
        source_mode = str(story_value.get("defaultSourceMode", "fixture")).strip() or "fixture"
        story_sequence.append(
            {
                "story_id": story_id,
                "source_mode": source_mode,
                "file_name": f"{index:02d}_{story_id}_story.png",
            }
        )
    if not story_sequence:
        raise ValueError(f"manifest story sequence empty: {manifest_path}")
    return story_sequence


def _write_temp_driver_assets(
    screenshot_dir: Path,
    report_path: Path,
    story_sequence: list[dict[str, str]],
    presentation_capture_mode: bool,
) -> None:
    TEMP_DRIVER_DIR.mkdir(parents=True, exist_ok=True)
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    if report_path.exists():
        try:
            report_path.unlink()
        except Exception:
            pass
    driver_script = textwrap.dedent(
        f"""
        extends Control

        const SANDBOX_SCENE_PATH := "res://scenes/dev/ui_preview_sandbox.tscn"
        const SCREENSHOT_DIR := {json.dumps(screenshot_dir.as_posix())}
        const REPORT_PATH := {json.dumps(report_path.as_posix())}
        const STORY_SEQUENCE := {json.dumps(story_sequence, ensure_ascii=False)}
        const NAVIGATION_CHAIN := []
        const MAP_SURFACE_INTERACTION_CHAIN := [
            {{
                "entry_id": "ai_player",
                "trigger_method": "trigger_ai_player_entry",
                "visible_method": "is_ai_player_panel_open",
                "screenshot_file": "04a_map_surface_ai_player_panel.png",
            }},
            {{
                "entry_id": "ai_command_feedback",
                "trigger_method": "trigger_ai_command_feedback_entry",
                "visible_method": "is_ai_player_panel_open",
                "ready_method": "is_ai_command_feedback_ready",
                "screenshot_file": "04b_map_surface_ai_command_feedback.png",
            }},
            {{
                "entry_id": "mini_map",
                "trigger_method": "trigger_mini_map_entry",
                "visible_method": "is_mini_map_panel_open",
                "screenshot_file": "04c_map_surface_mini_map_panel.png",
            }},
        ]
        const PRESENTATION_CAPTURE_MODE := {json.dumps(presentation_capture_mode)}
        const STORY_SYNC_TIMEOUT_SEC := 2.4
        const STORY_SYNC_POLL_SEC := 0.06
        const STORY_SYNC_STABLE_HITS := 2

        var _sandbox: Node = null

        func _ready() -> void:
            set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
            call_deferred("_run")

        func _run() -> void:
            var packed_scene: PackedScene = load(SANDBOX_SCENE_PATH) as PackedScene
            if packed_scene == null:
                push_error("temporary preview driver failed to load sandbox scene: %s" % SANDBOX_SCENE_PATH)
                _write_report(false, [], [], [], [])
                get_tree().quit(1)
                return

            _sandbox = packed_scene.instantiate()
            add_child(_sandbox)
            if _sandbox is Control:
                (_sandbox as Control).set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
            if _sandbox != null and _sandbox.has_method("set_presentation_capture_mode"):
                _sandbox.call("set_presentation_capture_mode", PRESENTATION_CAPTURE_MODE)

            await _settle_render()

            var steps: Array = []
            var contexts: Array = []
            for index in range(STORY_SEQUENCE.size()):
                var entry: Dictionary = STORY_SEQUENCE[index] as Dictionary
                var story_id: String = str(entry.get("story_id", "")).strip_edges()
                var source_mode: String = str(entry.get("source_mode", "fixture")).strip_edges()
                var file_name: String = str(entry.get("file_name", "")).strip_edges()
                if story_id == "" or file_name == "":
                    continue
                await _select_story(story_id)
                await _select_source_mode(source_mode)
                var sync_ok: bool = await _await_story_sync(story_id, source_mode)
                var context := _record_story_state(story_id, source_mode)
                contexts.append(context)
                var capture_ok: bool = await _capture_png(file_name)
                steps.append({{"storyId": story_id, "sourceMode": source_mode, "fileName": file_name, "syncOk": sync_ok, "ok": capture_ok}})
                print("UI_PREVIEW_SANDBOX_CAPTURE story=%s source=%s file=%s sync=%s ok=%s" % [story_id, source_mode, file_name, str(sync_ok), str(capture_ok)])

            var navigation_steps := await _run_navigation_chain()
            var interaction_steps := await _run_map_surface_interaction_chain()
            _write_report(true, steps, contexts, navigation_steps, interaction_steps)
            print("UI_PREVIEW_SANDBOX_DRIVER_OK steps=%d report=%s" % [steps.size(), REPORT_PATH])
            get_tree().quit(0)

        func _select_story(story_id: String) -> void:
            if _sandbox == null:
                return
            if _sandbox.has_method("select_story_by_id"):
                var result = _sandbox.call("select_story_by_id", story_id)
                if typeof(result) == TYPE_OBJECT and result != null:
                    await result
                return
            if _sandbox.has_method("_activate_story"):
                var result = _sandbox.call("_activate_story", story_id)
                if typeof(result) == TYPE_OBJECT and result != null:
                    await result

        func _select_source_mode(source_mode: String) -> void:
            if _sandbox == null:
                return
            if _sandbox.has_method("select_data_source_by_id"):
                var result = _sandbox.call("select_data_source_by_id", source_mode)
                if typeof(result) == TYPE_OBJECT and result != null:
                    await result
                return
            if _sandbox.has_method("_select_source_mode"):
                var result = _sandbox.call("_select_source_mode", source_mode)
                if typeof(result) == TYPE_OBJECT and result != null:
                    await result

        func _record_story_state(expected_story_id: String, expected_source_mode: String) -> Dictionary:
            var context := _read_preview_context()
            var active_story_id := str(context.get("storyId", ""))
            var active_source_mode := str(context.get("sourceMode", ""))
            print("UI_PREVIEW_SANDBOX_STATE expected=%s source=%s active=%s activeSource=%s" % [expected_story_id, expected_source_mode, active_story_id, active_source_mode])
            return context

        func _read_preview_context() -> Dictionary:
            if _sandbox == null:
                return {{}}
            if not _sandbox.has_method("get_preview_context"):
                return {{}}
            return _sandbox.get_preview_context()

        func _await_story_sync(expected_story_id: String, expected_source_mode: String) -> bool:
            var timeout_at := Time.get_ticks_msec() + int(STORY_SYNC_TIMEOUT_SEC * 1000.0)
            var stable_hits := 0
            while Time.get_ticks_msec() <= timeout_at:
                await _settle_render()
                var context := _read_preview_context()
                var active_story_id := str(context.get("storyId", "")).strip_edges()
                var active_source_mode := str(context.get("sourceMode", "")).strip_edges()
                if active_story_id == expected_story_id and active_source_mode == expected_source_mode:
                    stable_hits += 1
                    if stable_hits >= STORY_SYNC_STABLE_HITS:
                        return true
                else:
                    stable_hits = 0
                await get_tree().create_timer(STORY_SYNC_POLL_SEC).timeout
            print("UI_PREVIEW_SANDBOX_SYNC_TIMEOUT expected=%s source=%s" % [expected_story_id, expected_source_mode])
            return false

        func _settle_render() -> void:
            for _index in range(6):
                await get_tree().process_frame
            await RenderingServer.frame_post_draw
            await get_tree().create_timer(0.35).timeout

        func _capture_png(file_name: String) -> bool:
            var viewport_texture: ViewportTexture = get_viewport().get_texture()
            if viewport_texture == null:
                push_error("temporary preview driver capture failed: missing viewport texture")
                return false
            var image: Image = viewport_texture.get_image()
            if image == null:
                push_error("temporary preview driver capture failed: missing image")
                return false
            DirAccess.make_dir_recursive_absolute(SCREENSHOT_DIR)
            var output_path := SCREENSHOT_DIR.path_join(file_name)
            var save_err: Error = image.save_png(output_path)
            if save_err != OK:
                push_error("temporary preview driver capture failed: %s err=%d" % [output_path, int(save_err)])
                return false
            return true

        func _write_report(ok: bool, steps: Array, contexts: Array, navigation_steps: Array, interaction_steps: Array) -> void:
            DirAccess.make_dir_recursive_absolute(SCREENSHOT_DIR)
            var screenshot_paths: Array = []
            for entry_variant in STORY_SEQUENCE:
                var entry: Dictionary = entry_variant as Dictionary
                screenshot_paths.append(SCREENSHOT_DIR.path_join(str(entry.get("file_name", ""))))
            var interaction_screenshots: Array = []
            for entry_variant in interaction_steps:
                if entry_variant is Dictionary:
                    var interaction_entry := entry_variant as Dictionary
                    var screenshot_path := str(interaction_entry.get("screenshotPath", "")).strip_edges()
                    if screenshot_path != "":
                        interaction_screenshots.append(screenshot_path)
            var payload := {{
                "ok": ok,
                "scenePath": SANDBOX_SCENE_PATH,
                "screenshotDir": SCREENSHOT_DIR,
                "storySequence": STORY_SEQUENCE,
                "screenshots": screenshot_paths,
                "interactionScreenshots": interaction_screenshots,
                "steps": steps,
                "contexts": contexts,
                "navigationSteps": navigation_steps,
                "interactionSteps": interaction_steps,
            }}
            var file := FileAccess.open(REPORT_PATH, FileAccess.WRITE)
            if file == null:
                push_error("temporary preview driver report write failed: %s" % REPORT_PATH)
                return
            file.store_string(JSON.stringify(payload, "  "))
            file.close()

        func _run_navigation_chain() -> Array:
            var steps: Array = []
            for entry_variant in NAVIGATION_CHAIN:
                var entry: Dictionary = entry_variant as Dictionary
                var story_id := str(entry.get("story_id", "")).strip_edges()
                var target_story_id := str(entry.get("target_story_id", "")).strip_edges()
                if story_id == "" or target_story_id == "":
                    continue
                await _select_story(story_id)
                await _select_source_mode("fixture")
                await _settle_render()
                var active_story := _get_active_story_node()
                var trigger_ok := active_story != null and active_story.has_method("trigger_navigation_entry")
                if trigger_ok:
                    active_story.call("trigger_navigation_entry")
                var reached_ok := await _await_active_story_id(target_story_id)
                var reached_story_id := ""
                if _sandbox != null and _sandbox.has_method("get_active_story_id"):
                    reached_story_id = str(_sandbox.call("get_active_story_id")).strip_edges()
                var ok := trigger_ok and reached_ok and reached_story_id == target_story_id
                steps.append({{
                    "storyId": story_id,
                    "targetStoryId": target_story_id,
                    "reachedStoryId": reached_story_id,
                    "triggerOk": trigger_ok,
                    "syncOk": reached_ok,
                    "ok": ok,
                }})
                print("UI_PREVIEW_SANDBOX_NAVIGATION story=%s target=%s reached=%s ok=%s" % [story_id, target_story_id, reached_story_id, str(ok)])
            return steps

        func _run_map_surface_interaction_chain() -> Array:
            var steps: Array = []
            await _select_story("map_surface")
            await _select_source_mode("fixture")
            var sync_ok := await _await_story_sync_light("map_surface", "fixture")
            await _settle_panel_state()
            var active_story := _get_active_story_node()
            if active_story == null:
                steps.append({{
                    "entryId": "map_surface",
                    "syncOk": sync_ok,
                    "ok": false,
                    "reason": "active_story_missing",
                }})
                return steps
            for entry_variant in MAP_SURFACE_INTERACTION_CHAIN:
                var entry: Dictionary = entry_variant as Dictionary
                var entry_id := str(entry.get("entry_id", "")).strip_edges()
                var trigger_method := str(entry.get("trigger_method", "")).strip_edges()
                var visible_method := str(entry.get("visible_method", "")).strip_edges()
                var ready_method := str(entry.get("ready_method", "")).strip_edges()
                var screenshot_file := str(entry.get("screenshot_file", "")).strip_edges()
                if entry_id == "" or trigger_method == "" or visible_method == "":
                    continue
                if active_story.has_method("close_surface_overlays"):
                    active_story.call("close_surface_overlays")
                await _settle_panel_state()
                var trigger_ok := active_story.has_method(trigger_method)
                if trigger_ok:
                    active_story.call(trigger_method)
                var open_ok := await _await_active_story_method_bool(active_story, visible_method, true)
                var ready_ok := true
                if ready_method != "":
                    ready_ok = await _await_active_story_method_bool(active_story, ready_method, true)
                var screenshot_ok := false
                var screenshot_path := ""
                if screenshot_file != "":
                    screenshot_ok = await _capture_png(screenshot_file)
                    screenshot_path = SCREENSHOT_DIR.path_join(screenshot_file) if screenshot_ok else ""
                var close_ok := active_story.has_method("close_surface_overlays")
                if close_ok:
                    active_story.call("close_surface_overlays")
                var reset_ok := await _await_active_story_method_bool(active_story, visible_method, false)
                var ok := sync_ok and trigger_ok and open_ok and ready_ok and close_ok and reset_ok and screenshot_ok
                steps.append({{
                    "entryId": entry_id,
                    "syncOk": sync_ok,
                    "triggerMethod": trigger_method,
                    "visibleMethod": visible_method,
                    "readyMethod": ready_method,
                    "triggerOk": trigger_ok,
                    "openOk": open_ok,
                    "readyOk": ready_ok,
                    "closeOk": close_ok,
                    "resetOk": reset_ok,
                    "screenshotOk": screenshot_ok,
                    "screenshotPath": screenshot_path,
                    "ok": ok,
                }})
                print("UI_PREVIEW_SANDBOX_INTERACTION story=map_surface entry=%s open=%s ready=%s reset=%s ok=%s" % [entry_id, str(open_ok), str(ready_ok), str(reset_ok), str(ok)])
            return steps

        func _await_active_story_id(expected_story_id: String) -> bool:
            var timeout_at := Time.get_ticks_msec() + int(STORY_SYNC_TIMEOUT_SEC * 1000.0)
            var stable_hits := 0
            while Time.get_ticks_msec() <= timeout_at:
                await _settle_render()
                var reached_story_id := ""
                if _sandbox != null and _sandbox.has_method("get_active_story_id"):
                    reached_story_id = str(_sandbox.call("get_active_story_id")).strip_edges()
                if reached_story_id == expected_story_id:
                    stable_hits += 1
                    if stable_hits >= STORY_SYNC_STABLE_HITS:
                        return true
                else:
                    stable_hits = 0
                await get_tree().create_timer(STORY_SYNC_POLL_SEC).timeout
            print("UI_PREVIEW_SANDBOX_NAV_TIMEOUT expected=%s" % [expected_story_id])
            return false

        func _await_active_story_method_bool(active_story: Node, method_name: String, expected_value: bool) -> bool:
            if active_story == null or method_name == "" or not active_story.has_method(method_name):
                return false
            var timeout_at := Time.get_ticks_msec() + int(STORY_SYNC_TIMEOUT_SEC * 1000.0)
            var stable_hits := 0
            while Time.get_ticks_msec() <= timeout_at:
                await _settle_panel_state()
                var current_value := bool(active_story.call(method_name))
                if current_value == expected_value:
                    stable_hits += 1
                    if stable_hits >= STORY_SYNC_STABLE_HITS:
                        return true
                else:
                    stable_hits = 0
                await get_tree().create_timer(STORY_SYNC_POLL_SEC).timeout
            print("UI_PREVIEW_SANDBOX_METHOD_TIMEOUT method=%s expected=%s" % [method_name, str(expected_value)])
            return false

        func _await_story_sync_light(expected_story_id: String, expected_source_mode: String) -> bool:
            var timeout_at := Time.get_ticks_msec() + int(STORY_SYNC_TIMEOUT_SEC * 1000.0)
            var stable_hits := 0
            while Time.get_ticks_msec() <= timeout_at:
                await _settle_panel_state()
                var context := _read_preview_context()
                var active_story_id := str(context.get("storyId", "")).strip_edges()
                var active_source_mode := str(context.get("sourceMode", "")).strip_edges()
                if active_story_id == expected_story_id and active_source_mode == expected_source_mode:
                    stable_hits += 1
                    if stable_hits >= STORY_SYNC_STABLE_HITS:
                        return true
                else:
                    stable_hits = 0
                await get_tree().create_timer(STORY_SYNC_POLL_SEC).timeout
            print("UI_PREVIEW_SANDBOX_LIGHT_SYNC_TIMEOUT expected=%s source=%s" % [expected_story_id, expected_source_mode])
            return false

        func _settle_panel_state() -> void:
            for _index in range(3):
                await get_tree().process_frame
            await get_tree().create_timer(0.12).timeout

        func _get_active_story_node() -> Node:
            if _sandbox != null and _sandbox.has_method("get_active_story_node"):
                return _sandbox.call("get_active_story_node")
            return null
        """
    ).strip()
    driver_scene = textwrap.dedent(
        """
        [gd_scene load_steps=2 format=3]

        [ext_resource type="Script" path="res://tmp/ui_preview_sandbox_driver.gd" id="1_driver"]

        [node name="UIPreviewSandboxDriver" type="Control"]
        anchor_right = 1.0
        anchor_bottom = 1.0
        script = ExtResource("1_driver")
        """
    ).strip()
    TEMP_DRIVER_SCRIPT_PATH.write_text(driver_script + "\n", encoding="utf-8")
    TEMP_DRIVER_SCENE_PATH.write_text(driver_scene + "\n", encoding="utf-8")


def _cleanup_temp_driver_assets() -> None:
    for path in [TEMP_DRIVER_SCENE_PATH, TEMP_DRIVER_SCRIPT_PATH]:
        try:
            if path.exists():
                path.unlink()
        except Exception:
            pass


def _spawn_process(command: list[str], cwd: Path, log_path: Path) -> RunningProcess:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = log_path.open("w", encoding="utf-8")
    popen = subprocess.Popen(
        command,
        cwd=str(cwd),
        stdin=subprocess.DEVNULL,
        stdout=log_file,
        stderr=log_file,
        text=True,
        encoding="utf-8",
        close_fds=True,
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
                    1 if ("Godot" in item[1] or "SLG" in item[1] or "Preview" in item[1]) else 0,
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


def _send_mouse_click(hwnd: int, x: int, y: int) -> None:
    if win32gui is None or win32con is None:
        raise RuntimeError(f"pywin32 unavailable: {_WIN32_IMPORT_ERROR}")
    left, top, _, _ = _window_client_bbox(hwnd)
    screen_x = left + x
    screen_y = top + y
    win32api.SetCursorPos((screen_x, screen_y))
    time.sleep(0.05)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.03)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)


def _send_key_press(hwnd: int, vk_code: int) -> None:
    if win32gui is None or win32con is None:
        raise RuntimeError(f"pywin32 unavailable: {_WIN32_IMPORT_ERROR}")
    win32api.keybd_event(vk_code, 0, 0, 0)
    time.sleep(0.03)
    win32api.keybd_event(vk_code, 0, win32con.KEYEVENTF_KEYUP, 0)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate the UI Preview Sandbox and capture screenshots.")
    parser.add_argument("--godot-exe", default="", help="Explicit Godot GUI executable path")
    parser.add_argument("--project-path", default=DEFAULT_PROJECT_PATH, help="Godot project path")
    parser.add_argument("--scene-path", default=DEFAULT_SCENE_PATH, help="Sandbox scene path")
    parser.add_argument("--screenshot-dir", default=str(DEFAULT_SCREENSHOT_DIR), help="Screenshot output directory")
    parser.add_argument("--report-path", default=str(DEFAULT_REPORT_PATH), help="Validation report path")
    parser.add_argument("--window-timeout-sec", type=float, default=90.0, help="Time allowed to find the Godot window")
    parser.add_argument("--interaction-settle-sec", type=float, default=0.75, help="Delay after each UI action")
    parser.add_argument("--headless-timeout-sec", type=float, default=120.0, help="Time allowed for the headless smoke run")
    parser.add_argument(
        "--presentation-capture",
        dest="presentation_capture_mode",
        action="store_true",
        help="Hide developer telemetry during the formal screenshot capture run.",
    )
    parser.add_argument(
        "--no-presentation-capture",
        dest="presentation_capture_mode",
        action="store_false",
        help="Keep the developer UI visible during capture.",
    )
    parser.set_defaults(presentation_capture_mode=True)
    parser.add_argument("--dry-run", action="store_true", help="Resolve the launch command and exit without launching")
    return parser.parse_args()


def _story_anchors(hwnd: int) -> dict[str, dict[str, int]]:
    left, top, right, bottom = _window_client_bbox(hwnd)
    width = right - left
    height = bottom - top
    return {
        "hudToken": {"x": int(width * 0.12), "y": int(height * 0.70)},
        "observability": {"x": int(width * 0.12), "y": int(height * 0.76)},
        "panelStack": {"x": int(width * 0.12), "y": int(height * 0.82)},
    }


def main() -> int:
    args = _parse_args()
    screenshot_dir = _resolve_output_path(args.screenshot_dir)
    report_path = _resolve_output_path(args.report_path)
    log_dir = screenshot_dir / "logs"
    headless_log_path = log_dir / "godot_preview_headless.log"
    driver_log_path = log_dir / "godot_preview_driver.log"
    driver_report_path = screenshot_dir / "driver_report.json"
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)

    report: dict[str, Any] = {
        "command": "validate_ui_preview_sandbox",
        "generatedAt": _now_iso(),
        "projectPath": args.project_path,
        "scenePath": args.scene_path,
        "screenshotDir": str(screenshot_dir),
        "presentationCaptureMode": args.presentation_capture_mode,
        "steps": [],
        "artifacts": {},
        "story": {
            "storyId": "panel_stack_demo",
            "description": "Registry-driven sandbox story flow",
        },
        "notes": [],
    }

    godot_proc: RunningProcess | None = None
    driver_proc: RunningProcess | None = None

    try:
        godot_exe = resolve_godot_gui_exe(args.godot_exe)
        manifest_path = PROJECT_ROOT / "data" / "ui_preview" / "stories" / "stories_manifest.json"
        contract_ok, contract_detail = _validate_story_manifest_contract(manifest_path)
        report["steps"].append({"name": "manifest_contract", "ok": contract_ok, **contract_detail})
        report["artifacts"]["manifest"] = str(manifest_path)
        if not contract_ok:
            raise RuntimeError(f"story contract validation failed: {contract_detail}")
        report["steps"].append({"name": "presentation_capture_mode", "ok": args.presentation_capture_mode, "enabled": args.presentation_capture_mode})
        story_sequence = _build_story_sequence_from_manifest(manifest_path)
        report["storySequence"] = story_sequence
        headless_cmd = build_godot_command(
            godot_exe=godot_exe,
            project_path=args.project_path,
            scene_path=args.scene_path,
            headless=True,
        )
        headless_result = _run_command(
            headless_cmd,
            REPO_ROOT,
            headless_log_path,
            timeout_sec=args.headless_timeout_sec,
        )
        report["steps"].append({"name": "headless_smoke", **headless_result})
        report["artifacts"]["headlessLog"] = str(headless_log_path)
        if not headless_result["ok"]:
            raise RuntimeError("headless smoke failed")
        headless_log_tail = "\n".join(headless_result.get("stdoutTail", []) + headless_result.get("stderrTail", []))
        if "UI_PREVIEW_SANDBOX_SMOKE_OK" not in headless_log_tail:
            report["notes"].append("Headless smoke completed, but the expected UI_PREVIEW_SANDBOX_SMOKE_OK marker was not found in the tail of the log.")

        if args.dry_run:
            _json_write(report_path, report)
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0

        _write_temp_driver_assets(
            screenshot_dir,
            driver_report_path,
            story_sequence,
            args.presentation_capture_mode,
        )
        driver_cmd = build_godot_command(
            godot_exe=godot_exe,
            project_path=args.project_path,
            scene_path="res://tmp/ui_preview_sandbox_driver.tscn",
            headless=False,
        )
        report["driverCommand"] = driver_cmd
        driver_timeout_sec = max(300.0, args.window_timeout_sec + 120.0)
        driver_result = _run_command(
            driver_cmd,
            REPO_ROOT,
            driver_log_path,
            timeout_sec=driver_timeout_sec,
        )
        report["steps"].append(
            {
                "name": "driver_capture",
                **driver_result,
                "timeoutSec": driver_timeout_sec,
                "reportPath": str(driver_report_path),
            }
        )
        report["artifacts"]["driverLog"] = str(driver_log_path)
        if not driver_result["ok"]:
            raise RuntimeError("temporary preview driver command failed")
        if not driver_report_path.exists():
            raise RuntimeError("temporary preview driver report missing")
        report["artifacts"]["driverReport"] = str(driver_report_path)

        driver_report = json.loads(driver_report_path.read_text(encoding="utf-8"))
        driver_screenshots = driver_report.get("screenshots", [])
        if not isinstance(driver_screenshots, list) or not driver_screenshots:
            raise RuntimeError("temporary preview driver did not produce screenshot paths")

        report["story"] = {
            "storyId": str(driver_report.get("storySequence", [{}])[0].get("story_id", "hud_token")) if isinstance(driver_report.get("storySequence", []), list) and driver_report.get("storySequence", []) else "hud_token",
            "description": "Registry-driven sandbox story flow",
        }
        report["steps"].append(
            {
                "name": "driver_report_loaded",
                "ok": True,
                "storyCount": len(driver_report.get("storySequence", [])) if isinstance(driver_report.get("storySequence", []), list) else 0,
                "screenshotCount": len(driver_screenshots),
            }
        )
        navigation_steps = driver_report.get("navigationSteps", [])
        navigation_ok = isinstance(navigation_steps, list) and (
            len(navigation_steps) == 0
            or all(isinstance(step, dict) and bool(step.get("ok", False)) for step in navigation_steps)
        )
        report["steps"].append(
            {
                "name": "navigation_chain",
                "ok": navigation_ok,
                "stepCount": len(navigation_steps) if isinstance(navigation_steps, list) else 0,
                "steps": navigation_steps if isinstance(navigation_steps, list) else [],
            }
        )
        if not navigation_ok:
            raise RuntimeError(f"preview sandbox navigation chain failed: {navigation_steps}")

        interaction_steps = driver_report.get("interactionSteps", [])
        interaction_ok = isinstance(interaction_steps, list) and len(interaction_steps) == 3 and all(
            isinstance(step, dict) and bool(step.get("ok", False)) for step in interaction_steps
        )
        report["steps"].append(
            {
                "name": "map_surface_interactions",
                "ok": interaction_ok,
                "stepCount": len(interaction_steps) if isinstance(interaction_steps, list) else 0,
                "steps": interaction_steps if isinstance(interaction_steps, list) else [],
            }
        )
        if not interaction_ok:
            raise RuntimeError(f"map_surface interaction chain failed: {interaction_steps}")

        screenshot_paths = [Path(str(item)) for item in driver_screenshots]
        uniqueness_ok, uniqueness_detail = _validate_story_uniqueness(screenshot_paths, driver_report)
        report["steps"].append(
            {
                "name": "story_uniqueness",
                "ok": uniqueness_ok,
                **uniqueness_detail,
            }
        )
        if not uniqueness_ok:
            raise RuntimeError(f"preview sandbox screenshots are not unique enough: {uniqueness_detail}")

        final_screenshots: list[str] = []
        for screenshot_variant in driver_screenshots:
            screenshot_path = Path(str(screenshot_variant))
            if not screenshot_path.exists():
                raise RuntimeError(f"temporary preview screenshot missing: {screenshot_path}")
            final_screenshots.append(str(screenshot_path))
            report["steps"].append(
                {
                    "name": f"capture:{screenshot_path.name}",
                    "ok": True,
                    "screenshot": str(screenshot_path),
                    "sha256": _sha256_file(screenshot_path),
                }
            )

        report["artifacts"] = {
            "screenshots": final_screenshots,
            "interactionScreenshots": driver_report.get("interactionScreenshots", []),
            "report": str(report_path),
            "headlessLog": str(headless_log_path),
            "driverLog": str(driver_log_path),
            "driverReport": str(driver_report_path),
        }
        report["ok"] = True
        _json_write(report_path, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        report["ok"] = False
        report["error"] = type(exc).__name__
        report["message"] = str(exc)
        _json_write(report_path, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1
    finally:
        _terminate_process(driver_proc)
        _terminate_process(godot_proc)
        _cleanup_temp_driver_assets()


if __name__ == "__main__":
    raise SystemExit(main())
