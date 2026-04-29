#!/usr/bin/env python3
"""
Import slgclient prototype assets into Godot theme folders and generate manifests.

Formal entrypoint:
  py -3.11 godot-client/tools/import_slgclient_theme_assets.py
"""

from __future__ import annotations

import hashlib
import json
import plistlib
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[2]
THIRD_PARTY_ROOT = REPO_ROOT / "tmp" / "third_party" / "slgclient"
SOURCE_WORLD_ROOT = THIRD_PARTY_ROOT / "assets" / "resources" / "world"
SOURCE_GENERALPIC_ROOT = THIRD_PARTY_ROOT / "assets" / "resources" / "generalpic"
SOURCE_ANIM_ROOT = THIRD_PARTY_ROOT / "assets" / "animations"
SOURCE_UI_ROOT = THIRD_PARTY_ROOT / "assets" / "texure" / "ui"

THEME_ROOT = REPO_ROOT / "godot-client" / "assets" / "themes" / "slgclient"
CURRENT_WORLD_ROOT = THEME_ROOT / "current" / "world"
CURRENT_GENERALPIC_ROOT = THEME_ROOT / "current" / "generalpic"
CURRENT_UNITS_ROOT = THEME_ROOT / "current" / "units"
CURRENT_UNIT_FRAMES_ROOT = CURRENT_UNITS_ROOT / "qibing_frames"
CURRENT_OVERLAYS_ROOT = THEME_ROOT / "current" / "overlays"
CURRENT_OVERLAY_FRAMES_ROOT = CURRENT_OVERLAYS_ROOT / "frames"
CURRENT_UI_ROOT = THEME_ROOT / "current" / "ui"
REPLACEMENTS_ROOT = THEME_ROOT / "replacements"
EXCHANGE_BUNDLE_ROOT = REPLACEMENTS_ROOT / "exchange_bundle"
MANIFESTS_ROOT = THEME_ROOT / "manifests"
GENERALPIC_MANIFEST_PATH = MANIFESTS_ROOT / "generalpic_manifest.json"
UI_MANIFEST_PATH = MANIFESTS_ROOT / "ui_manifest.json"

SOURCE_REPO_URL = "https://github.com/llr104/slgclient"

WORLD_FILES = [
    "map.tmx",
    "map_qibing.png",
    "map_qibing.plist",
    "map_qibing.plist.meta",
    "cityComponent.png",
    "cityComponent.plist",
    "component_outside.png",
    "component_outside.plist",
]

ANIM_FILES = [
    "qb_run_r.anim",
    "qb_run_ru.anim",
    "qb_run_u.anim",
    "qb_run_lu.anim",
    "qb_run_l.anim",
    "qb_run_ld.anim",
    "qb_run_d.anim",
    "qb_run_rd.anim",
]

ANIM_DIRECTION_ORDER = ["r", "ru", "u", "lu", "l", "ld", "d", "rd"]

RESOURCE_EXTRA_FRAMES = ("sys_fortress.png",)
MARKER_REQUIRED_FRAMES = (
    "flag_blue_3.png",
    "flag_red_3.png",
    "home_defend.png",
)

OVERLAY_ATLAS_SPECS = (
    {"name": "city_component", "plist": "cityComponent.plist", "png": "cityComponent.png", "category": "marker"},
    {"name": "component_outside", "plist": "component_outside.plist", "png": "component_outside.png", "category": "marker"},
)


@dataclass(frozen=True)
class Rect:
    x: int
    y: int
    w: int
    h: int


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _parse_rect(value: str) -> Rect:
    match = re.match(r"\{\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\},\{\s*(\d+)\s*,\s*(\d+)\s*\}\}", value.strip())
    if not match:
        raise ValueError(f"invalid rect string: {value}")
    return Rect(int(match.group(1)), int(match.group(2)), int(match.group(3)), int(match.group(4)))


def _parse_size(value: str) -> tuple[int, int]:
    match = re.match(r"\{\s*(\d+)\s*,\s*(\d+)\s*\}", value.strip())
    if not match:
        raise ValueError(f"invalid size string: {value}")
    return int(match.group(1)), int(match.group(2))


def _parse_point(value: str) -> tuple[int, int]:
    match = re.match(r"\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}", value.strip())
    if not match:
        raise ValueError(f"invalid point string: {value}")
    return int(match.group(1)), int(match.group(2))


def _reset_output_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def _copy_world_assets() -> list[dict[str, Any]]:
    CURRENT_WORLD_ROOT.mkdir(parents=True, exist_ok=True)
    copied: list[dict[str, Any]] = []
    for name in WORLD_FILES:
        src = SOURCE_WORLD_ROOT / name
        if not src.exists():
            raise FileNotFoundError(f"missing required source asset: {src}")
        dst = CURRENT_WORLD_ROOT / name
        shutil.copy2(src, dst)
        copied.append(
            {
                "name": name,
                "path": str(dst.relative_to(REPO_ROOT)).replace("\\", "/"),
                "bytes": dst.stat().st_size,
                "sha256": _sha256(dst),
            }
        )
    return copied


def _collect_generalpic_selected_ids() -> list[int]:
    if not SOURCE_GENERALPIC_ROOT.exists():
        raise FileNotFoundError(f"missing generalpic source root: {SOURCE_GENERALPIC_ROOT}")

    selected_ids: list[int] = []
    for src in SOURCE_GENERALPIC_ROOT.glob("card_*.png"):
        match = re.fullmatch(r"card_(\d+)\.png", src.name)
        if not match:
            continue
        selected_ids.append(int(match.group(1)))
    selected_ids.sort()
    return selected_ids


def _copy_generalpic_assets(selected_ids: list[int]) -> tuple[list[dict[str, Any]], list[str]]:
    if not SOURCE_GENERALPIC_ROOT.exists():
        raise FileNotFoundError(f"missing generalpic source root: {SOURCE_GENERALPIC_ROOT}")

    _reset_output_dir(CURRENT_GENERALPIC_ROOT)

    copied: list[dict[str, Any]] = []
    for cfg_id in selected_ids:
        src = SOURCE_GENERALPIC_ROOT / f"card_{cfg_id}.png"
        if not src.exists():
            raise FileNotFoundError(f"missing curated generalpic asset: {src}")
        dst = CURRENT_GENERALPIC_ROOT / src.name
        shutil.copy2(src, dst)
        copied.append(
            {
                "cfgId": cfg_id,
                "name": src.name,
                "path": str(dst.relative_to(REPO_ROOT)).replace("\\", "/"),
                "sourcePath": str(src.relative_to(REPO_ROOT)).replace("\\", "/"),
                "bytes": dst.stat().st_size,
                "sha256": _sha256(dst),
            }
        )

    special_files: list[str] = []
    head_wrap_src = SOURCE_GENERALPIC_ROOT / "head_wrap.png"
    if head_wrap_src.exists():
        head_wrap_dst = CURRENT_GENERALPIC_ROOT / head_wrap_src.name
        shutil.copy2(head_wrap_src, head_wrap_dst)
        special_files.append(head_wrap_src.name)
        copied.append(
            {
                "name": head_wrap_src.name,
                "path": str(head_wrap_dst.relative_to(REPO_ROOT)).replace("\\", "/"),
                "sourcePath": str(head_wrap_src.relative_to(REPO_ROOT)).replace("\\", "/"),
                "bytes": head_wrap_dst.stat().st_size,
                "sha256": _sha256(head_wrap_dst),
                "special": True,
            }
        )

    return copied, special_files


def _prune_managed_ui_root() -> None:
    CURRENT_UI_ROOT.mkdir(parents=True, exist_ok=True)
    for child in CURRENT_UI_ROOT.iterdir():
        if child.name == "hud_v1":
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def _copy_ui_assets() -> tuple[list[dict[str, Any]], dict[str, int], dict[str, int]]:
    if not SOURCE_UI_ROOT.exists():
        raise FileNotFoundError(f"missing ui source root: {SOURCE_UI_ROOT}")

    _prune_managed_ui_root()

    copied: list[dict[str, Any]] = []
    folder_counts: dict[str, int] = {"root": 0}
    extension_counts: dict[str, int] = {}

    for src in sorted(path for path in SOURCE_UI_ROOT.rglob("*") if path.is_file()):
        rel = src.relative_to(SOURCE_UI_ROOT)
        dst = CURRENT_UI_ROOT / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

        top_level = rel.parts[0] if len(rel.parts) > 1 else "root"
        folder_counts[top_level] = folder_counts.get(top_level, 0) + 1
        extension = src.suffix.lower() or "<no_ext>"
        extension_counts[extension] = extension_counts.get(extension, 0) + 1
        copied.append(
            {
                "name": rel.name,
                "relativePath": rel.as_posix(),
                "targetPath": str(dst.relative_to(REPO_ROOT)).replace("\\", "/"),
                "topLevelFolder": top_level,
                "extension": extension,
                "bytes": dst.stat().st_size,
                "sha256": _sha256(dst),
            }
        )

    return copied, folder_counts, extension_counts


def _load_plist_frame_table() -> dict[str, dict[str, Any]]:
    plist_path = CURRENT_WORLD_ROOT / "map_qibing.plist"
    plist_data = plistlib.loads(plist_path.read_bytes())
    frames = plist_data.get("frames")
    if not isinstance(frames, dict):
        raise ValueError("map_qibing.plist missing frames table")
    return frames


def _load_cocos_submeta_name_index() -> dict[str, str]:
    meta_path = CURRENT_WORLD_ROOT / "map_qibing.plist.meta"
    meta_json = json.loads(meta_path.read_text(encoding="utf-8"))
    sub_metas = meta_json.get("subMetas", {})
    if not isinstance(sub_metas, dict):
        return {}
    indexed: dict[str, str] = {}
    for key, value in sub_metas.items():
        if not isinstance(value, dict):
            continue
        frame_name = str(value.get("name", "")).strip()
        if frame_name == "":
            continue
        indexed[str(key)] = f"{frame_name}.png"
    return indexed


def _read_anim_frame_names(submeta_index: dict[str, str]) -> dict[str, list[str]]:
    direction_to_frames: dict[str, list[str]] = {}
    for anim_name in ANIM_FILES:
        anim_path = SOURCE_ANIM_ROOT / anim_name
        if not anim_path.exists():
            raise FileNotFoundError(f"missing anim file: {anim_path}")
        direction = anim_name.replace("qb_run_", "").replace(".anim", "")
        payload = json.loads(anim_path.read_text(encoding="utf-8"))
        if not isinstance(payload, list) or len(payload) < 6:
            raise ValueError(f"unexpected anim payload shape: {anim_name}")
        curve = payload[5]
        if not isinstance(curve, dict):
            raise ValueError(f"unexpected curve payload: {anim_name}")
        values = curve.get("_values", [])
        frame_names: list[str] = []
        for value in values:
            if not isinstance(value, dict):
                continue
            uuid = str(value.get("__uuid__", ""))
            suffix = uuid.split("@", 1)[1] if "@" in uuid else ""
            frame_name = submeta_index.get(suffix, "")
            if frame_name:
                frame_names.append(frame_name)
        if len(frame_names) == 0:
            raise ValueError(f"failed to resolve anim frames for {anim_name}")
        direction_to_frames[direction] = frame_names
    return direction_to_frames


def _extract_unit_frames(
    frame_table: dict[str, dict[str, Any]],
    direction_to_names: dict[str, list[str]],
) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    atlas_path = CURRENT_WORLD_ROOT / "map_qibing.png"
    _reset_output_dir(CURRENT_UNIT_FRAMES_ROOT)
    atlas_image = Image.open(atlas_path).convert("RGBA")

    all_frames: list[dict[str, Any]] = []
    direction_frames: dict[str, list[dict[str, Any]]] = {direction: [] for direction in ANIM_DIRECTION_ORDER}
    seen_frame_names: set[str] = set()

    for direction in ANIM_DIRECTION_ORDER:
        name_list = direction_to_names.get(direction, [])
        for seq, frame_name in enumerate(name_list):
            frame_meta = frame_table.get(frame_name)
            if not isinstance(frame_meta, dict):
                continue
            frame_rect = _parse_rect(str(frame_meta.get("frame", "")))
            source_rect = _parse_rect(str(frame_meta.get("sourceColorRect", "")))
            source_w, source_h = _parse_size(str(frame_meta.get("sourceSize", "")))
            rotated = bool(frame_meta.get("rotated", False))

            crop = atlas_image.crop(
                (
                    frame_rect.x,
                    frame_rect.y,
                    frame_rect.x + frame_rect.w,
                    frame_rect.y + frame_rect.h,
                )
            )
            if rotated:
                crop = crop.transpose(Image.Transpose.ROTATE_90)

            canvas = Image.new("RGBA", (source_w, source_h), (0, 0, 0, 0))
            canvas.paste(crop, (source_rect.x, source_rect.y))

            output_name = f"{direction}_{seq:02d}_{frame_name.replace('.png', '')}.png"
            output_path = CURRENT_UNIT_FRAMES_ROOT / output_name
            canvas.save(output_path)

            frame_info = {
                "name": frame_name,
                "direction": direction,
                "sequence": seq,
                "sourceFrame": {
                    "x": frame_rect.x,
                    "y": frame_rect.y,
                    "w": frame_rect.w,
                    "h": frame_rect.h,
                    "rotated": rotated,
                },
                "texturePath": f"res://assets/themes/slgclient/current/units/qibing_frames/{output_name}",
                "size": {"w": source_w, "h": source_h},
            }
            direction_frames[direction].append(frame_info)
            if frame_name not in seen_frame_names:
                seen_frame_names.add(frame_name)
                all_frames.append(frame_info)

    return all_frames, direction_frames


def _select_overlay_frame_names(atlas_name: str, frame_table: dict[str, dict[str, Any]]) -> list[str]:
    selected: list[str] = []
    if atlas_name == "city_component":
        for frame_name in sorted(frame_table.keys()):
            if frame_name in MARKER_REQUIRED_FRAMES or frame_name.startswith("flag_"):
                selected.append(frame_name)
        return selected

    if atlas_name == "component_outside":
        for frame_name in sorted(frame_table.keys()):
            if frame_name.startswith("out_flag_"):
                selected.append(frame_name)
        return selected

    return selected


def _parse_plist_frame_meta(frame_meta: dict[str, Any]) -> tuple[Rect, Rect, int, int, bool]:
    if "frame" in frame_meta:
        frame_rect = _parse_rect(str(frame_meta.get("frame", "")))
        source_rect = _parse_rect(
            str(frame_meta.get("sourceColorRect", f"{{{{0,0}},{{{frame_rect.w},{frame_rect.h}}}}}"))
        )
        source_w, source_h = _parse_size(str(frame_meta.get("sourceSize", f"{{{source_rect.w},{source_rect.h}}}")))
        rotated = bool(frame_meta.get("rotated", False))
        return frame_rect, source_rect, source_w, source_h, rotated

    if "textureRect" in frame_meta:
        frame_rect = _parse_rect(str(frame_meta.get("textureRect", "")))
        sprite_w, sprite_h = _parse_size(str(frame_meta.get("spriteSize", f"{{{frame_rect.w},{frame_rect.h}}}")))
        source_w, source_h = _parse_size(str(frame_meta.get("spriteSourceSize", f"{{{sprite_w},{sprite_h}}}")))
        offset_x, offset_y = _parse_point(str(frame_meta.get("spriteOffset", "{0,0}")))
        source_x = max(0, int(round((source_w - sprite_w) * 0.5 + offset_x)))
        source_y = max(0, int(round((source_h - sprite_h) * 0.5 + offset_y)))
        source_rect = Rect(source_x, source_y, sprite_w, sprite_h)
        rotated = bool(frame_meta.get("textureRotated", False))
        return frame_rect, source_rect, source_w, source_h, rotated

    raise ValueError("unsupported plist frame schema (missing frame/textureRect)")


def _extract_overlay_frames() -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]], dict[str, list[str]]]:
    _reset_output_dir(CURRENT_OVERLAY_FRAMES_ROOT)
    overlay_frames: dict[str, dict[str, Any]] = {}
    overlay_atlases: list[dict[str, Any]] = []
    group_map: dict[str, list[str]] = {"resource": [], "marker": [], "home": [], "terrain": [], "edge": []}

    for atlas_spec in OVERLAY_ATLAS_SPECS:
        atlas_name = str(atlas_spec["name"])
        plist_name = str(atlas_spec["plist"])
        png_name = str(atlas_spec["png"])
        category = str(atlas_spec["category"])
        plist_path = CURRENT_WORLD_ROOT / plist_name
        png_path = CURRENT_WORLD_ROOT / png_name
        plist_data = plistlib.loads(plist_path.read_bytes())
        frame_table = plist_data.get("frames")
        if not isinstance(frame_table, dict):
            raise ValueError(f"{plist_name} missing frames table")
        selected_names = _select_overlay_frame_names(atlas_name, frame_table)
        atlas_image = Image.open(png_path).convert("RGBA")

        extracted_count = 0
        for frame_name in selected_names:
            frame_meta = frame_table.get(frame_name)
            if not isinstance(frame_meta, dict):
                continue
            if frame_name in overlay_frames:
                raise ValueError(f"duplicate overlay frame name detected: {frame_name}")

            frame_rect, source_rect, source_w, source_h, rotated = _parse_plist_frame_meta(frame_meta)
            crop = atlas_image.crop(
                (
                    frame_rect.x,
                    frame_rect.y,
                    frame_rect.x + frame_rect.w,
                    frame_rect.y + frame_rect.h,
                )
            )
            if rotated:
                crop = crop.transpose(Image.Transpose.ROTATE_90)
            canvas = Image.new("RGBA", (source_w, source_h), (0, 0, 0, 0))
            canvas.paste(crop, (source_rect.x, source_rect.y))

            output_path = CURRENT_OVERLAY_FRAMES_ROOT / frame_name
            canvas.save(output_path)
            overlay_frames[frame_name] = {
                "name": frame_name,
                "atlas": atlas_name,
                "category": category,
                "sourcePng": png_name,
                "sourcePlist": plist_name,
                "texturePath": f"res://assets/themes/slgclient/current/overlays/frames/{frame_name}",
                "sourceFrame": {
                    "x": frame_rect.x,
                    "y": frame_rect.y,
                    "w": frame_rect.w,
                    "h": frame_rect.h,
                    "rotated": rotated,
                },
                "sourceCanvasRect": {
                    "x": source_rect.x,
                    "y": source_rect.y,
                    "w": source_rect.w,
                    "h": source_rect.h,
                },
                "size": {"w": source_w, "h": source_h},
            }
            extracted_count += 1
            if category not in group_map:
                group_map[category] = []
            group_map[category].append(frame_name)
            if frame_name in MARKER_REQUIRED_FRAMES or frame_name.startswith("flag_") or frame_name.startswith("out_flag_"):
                group_map["home"].append(frame_name)

        overlay_atlases.append(
            {
                "name": atlas_name,
                "plist": plist_name,
                "png": png_name,
                "category": category,
                "sourceFrameCount": len(frame_table),
                "selectedFrameCount": len(selected_names),
                "extractedFrameCount": extracted_count,
            }
        )

    for key in group_map.keys():
        unique_sorted = sorted(set(group_map[key]))
        group_map[key] = unique_sorted

    return overlay_frames, overlay_atlases, group_map


def _count_files_and_bytes(root: Path) -> dict[str, int]:
    file_count = 0
    total_bytes = 0
    if not root.exists():
        return {"files": 0, "bytes": 0}
    for item in root.rglob("*"):
        if not item.is_file():
            continue
        file_count += 1
        total_bytes += item.stat().st_size
    return {"files": file_count, "bytes": total_bytes}


def _sync_exchange_bundle(imported_at: str, source_commit: str) -> dict[str, Any]:
    if EXCHANGE_BUNDLE_ROOT.exists():
        shutil.rmtree(EXCHANGE_BUNDLE_ROOT)
    EXCHANGE_BUNDLE_ROOT.mkdir(parents=True, exist_ok=True)

    world_dst = EXCHANGE_BUNDLE_ROOT / "world"
    generalpic_dst = EXCHANGE_BUNDLE_ROOT / "generalpic"
    units_dst = EXCHANGE_BUNDLE_ROOT / "units"
    overlays_dst = EXCHANGE_BUNDLE_ROOT / "overlays"
    ui_dst = EXCHANGE_BUNDLE_ROOT / "ui"
    manifests_dst = EXCHANGE_BUNDLE_ROOT / "manifests"
    shutil.copytree(CURRENT_WORLD_ROOT, world_dst)
    shutil.copytree(CURRENT_GENERALPIC_ROOT, generalpic_dst)
    shutil.copytree(CURRENT_UNITS_ROOT, units_dst)
    shutil.copytree(CURRENT_OVERLAYS_ROOT, overlays_dst)
    shutil.copytree(CURRENT_UI_ROOT, ui_dst)
    shutil.copytree(MANIFESTS_ROOT, manifests_dst)

    bundle_manifest = {
        "schemaVersion": 1,
        "theme": "slgclient",
        "importedAt": imported_at,
        "source": {
            "repo": SOURCE_REPO_URL,
            "commit": source_commit,
        },
        "bundleRoot": str(EXCHANGE_BUNDLE_ROOT.relative_to(REPO_ROOT)).replace("\\", "/"),
        "segments": {
            "world": str(world_dst.relative_to(REPO_ROOT)).replace("\\", "/"),
            "generalpic": str(generalpic_dst.relative_to(REPO_ROOT)).replace("\\", "/"),
            "units": str(units_dst.relative_to(REPO_ROOT)).replace("\\", "/"),
            "overlays": str(overlays_dst.relative_to(REPO_ROOT)).replace("\\", "/"),
            "ui": str(ui_dst.relative_to(REPO_ROOT)).replace("\\", "/"),
            "manifests": str(manifests_dst.relative_to(REPO_ROOT)).replace("\\", "/"),
        },
        "stats": {
            "world": _count_files_and_bytes(world_dst),
            "generalpic": _count_files_and_bytes(generalpic_dst),
            "units": _count_files_and_bytes(units_dst),
            "overlays": _count_files_and_bytes(overlays_dst),
            "ui": _count_files_and_bytes(ui_dst),
            "manifests": _count_files_and_bytes(manifests_dst),
        },
    }
    bundle_manifest_path = EXCHANGE_BUNDLE_ROOT / "exchange_bundle_manifest.json"
    bundle_manifest_path.write_text(json.dumps(bundle_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "bundleRoot": str(EXCHANGE_BUNDLE_ROOT.relative_to(REPO_ROOT)).replace("\\", "/"),
        "manifestPath": str(bundle_manifest_path.relative_to(REPO_ROOT)).replace("\\", "/"),
        "stats": bundle_manifest.get("stats", {}),
    }


def _detect_source_commit() -> str:
    if not THIRD_PARTY_ROOT.exists():
        return "unknown"
    try:
        proc = subprocess.run(
            ["git", "-C", str(THIRD_PARTY_ROOT), "rev-parse", "HEAD"],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if proc.returncode == 0:
            return proc.stdout.strip()
    except OSError:
        return "unknown"
    return "unknown"


def main() -> int:
    REPLACEMENTS_ROOT.mkdir(parents=True, exist_ok=True)
    CURRENT_GENERALPIC_ROOT.mkdir(parents=True, exist_ok=True)
    CURRENT_UNITS_ROOT.mkdir(parents=True, exist_ok=True)
    CURRENT_UI_ROOT.mkdir(parents=True, exist_ok=True)
    MANIFESTS_ROOT.mkdir(parents=True, exist_ok=True)

    copied_world = _copy_world_assets()
    generalpic_selected_ids = _collect_generalpic_selected_ids()
    generalpic_files, generalpic_special_files = _copy_generalpic_assets(generalpic_selected_ids)
    frame_table = _load_plist_frame_table()
    submeta_index = _load_cocos_submeta_name_index()
    direction_to_names = _read_anim_frame_names(submeta_index)
    unit_frames, direction_frames = _extract_unit_frames(frame_table, direction_to_names)
    overlay_frames, overlay_atlases, overlay_groups = _extract_overlay_frames()
    ui_files, ui_folder_counts, ui_extension_counts = _copy_ui_assets()

    imported_at = _now_iso()
    source_commit = _detect_source_commit()

    asset_manifest = {
        "schemaVersion": 1,
        "theme": "slgclient",
        "importedAt": imported_at,
        "source": {
            "repo": SOURCE_REPO_URL,
            "commit": source_commit,
            "licenseNotice": "素材来源于网络，仅供学习使用，请勿用于商业用途（来源仓库 README）",
        },
        "paths": {
            "current": "godot-client/assets/themes/slgclient/current",
            "replacements": "godot-client/assets/themes/slgclient/replacements",
            "manifests": "godot-client/assets/themes/slgclient/manifests",
            "generalpic": "godot-client/assets/themes/slgclient/current/generalpic",
            "generalpicManifest": "godot-client/assets/themes/slgclient/manifests/generalpic_manifest.json",
            "ui": "godot-client/assets/themes/slgclient/current/ui",
            "uiManifest": "godot-client/assets/themes/slgclient/manifests/ui_manifest.json",
        },
        "world": {
            "tmxPath": "res://assets/themes/slgclient/current/world/map.tmx",
            "files": copied_world,
        },
        "generalpic": {
            "sourceRepo": SOURCE_REPO_URL,
            "sourceRoot": "tmp/third_party/slgclient/assets/resources/generalpic",
            "targetRoot": "godot-client/assets/themes/slgclient/current/generalpic",
            "selectedIds": generalpic_selected_ids,
            "selectedIdCount": len(generalpic_selected_ids),
            "specialFiles": generalpic_special_files,
            "fileCount": len(generalpic_files),
            "files": generalpic_files,
        },
        "units": {
            "framesRoot": "res://assets/themes/slgclient/current/units/qibing_frames",
            "frameCount": len(unit_frames),
            "directionFrameCounts": {key: len(direction_frames.get(key, [])) for key in ANIM_DIRECTION_ORDER},
        },
        "overlays": {
            "framesRoot": "res://assets/themes/slgclient/current/overlays/frames",
            "manifestPath": "godot-client/assets/themes/slgclient/manifests/overlay_frames_manifest.json",
            "frameCount": len(overlay_frames),
            "groups": {key: len(value) for key, value in overlay_groups.items()},
            "atlases": overlay_atlases,
        },
        "ui": {
            "manifestPath": "godot-client/assets/themes/slgclient/manifests/ui_manifest.json",
            "sourceRoot": "tmp/third_party/slgclient/assets/texure/ui",
            "targetRoot": "godot-client/assets/themes/slgclient/current/ui",
            "preservedRoots": ["hud_v1"],
            "fileCount": len(ui_files),
            "folderCounts": ui_folder_counts,
            "extensionCounts": ui_extension_counts,
        },
    }

    unit_manifest = {
        "schemaVersion": 1,
        "theme": "slgclient",
        "importedAt": imported_at,
        "framesRoot": "res://assets/themes/slgclient/current/units/qibing_frames",
        "directions": direction_frames,
    }

    overlay_manifest = {
        "schemaVersion": 1,
        "theme": "slgclient",
        "importedAt": imported_at,
        "source": {
            "repo": SOURCE_REPO_URL,
            "commit": source_commit,
        },
        "framesRoot": "res://assets/themes/slgclient/current/overlays/frames",
        "groups": overlay_groups,
        "atlases": overlay_atlases,
        "frames": overlay_frames,
    }

    ui_manifest = {
        "schemaVersion": 1,
        "theme": "slgclient",
        "importedAt": imported_at,
        "source": {
            "repo": SOURCE_REPO_URL,
            "commit": source_commit,
            "root": "tmp/third_party/slgclient/assets/texure/ui",
        },
        "target": {
            "root": "godot-client/assets/themes/slgclient/current/ui",
            "preservedRoots": ["hud_v1"],
        },
        "fileCount": len(ui_files),
        "folderCounts": ui_folder_counts,
        "extensionCounts": ui_extension_counts,
        "files": ui_files,
    }

    asset_manifest_path = MANIFESTS_ROOT / "slgclient_asset_manifest.json"
    generalpic_manifest_path = GENERALPIC_MANIFEST_PATH
    unit_manifest_path = MANIFESTS_ROOT / "unit_frames_manifest.json"
    overlay_manifest_path = MANIFESTS_ROOT / "overlay_frames_manifest.json"
    ui_manifest_path = UI_MANIFEST_PATH
    asset_manifest_path.write_text(json.dumps(asset_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    generalpic_manifest = {
        "schemaVersion": 1,
        "theme": "slgclient",
        "packId": "map_surface_generalpic",
        "importedAt": imported_at,
        "sourceRepo": SOURCE_REPO_URL,
        "sourceRoot": "tmp/third_party/slgclient/assets/resources/generalpic",
        "targetRoot": "godot-client/assets/themes/slgclient/current/generalpic",
        "selectedIds": generalpic_selected_ids,
        "selectedIdCount": len(generalpic_selected_ids),
        "specialFiles": generalpic_special_files,
        "fileCount": len(generalpic_files),
        "sourceFileCount": len(list(SOURCE_GENERALPIC_ROOT.glob("*.png"))),
        "files": generalpic_files,
    }
    generalpic_manifest_path.write_text(json.dumps(generalpic_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    unit_manifest_path.write_text(json.dumps(unit_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    overlay_manifest_path.write_text(json.dumps(overlay_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    ui_manifest_path.write_text(json.dumps(ui_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    exchange_bundle = _sync_exchange_bundle(imported_at, source_commit)
    asset_manifest["paths"]["exchangeBundle"] = exchange_bundle.get("bundleRoot")
    asset_manifest["exchangeBundle"] = exchange_bundle
    asset_manifest_path.write_text(json.dumps(asset_manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[slgclient-assets] importedAt={imported_at}")
    print(f"[slgclient-assets] sourceCommit={source_commit}")
    print(f"[slgclient-assets] worldFiles={len(copied_world)}")
    print(f"[slgclient-assets] unitFrames={len(unit_frames)}")
    print(f"[slgclient-assets] overlayFrames={len(overlay_frames)}")
    print(f"[slgclient-assets] uiFiles={len(ui_files)}")
    print(f"[slgclient-assets] uiFolders={ui_folder_counts}")
    print(f"[slgclient-assets] manifest={asset_manifest_path}")
    print(f"[slgclient-assets] unitManifest={unit_manifest_path}")
    print(f"[slgclient-assets] overlayManifest={overlay_manifest_path}")
    print(f"[slgclient-assets] uiManifest={ui_manifest_path}")
    print(f"[slgclient-assets] exchangeBundle={exchange_bundle.get('bundleRoot')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
