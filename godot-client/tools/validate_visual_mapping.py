#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate backend map-layout -> TMX(200x200) linear mapping stability.

This tool mirrors the mapping used in `map_grid.gd`:
- backend x/y min-max linearly mapped into TMX cell space
- output reproducible JSON evidence for gate/ops workflows
"""

from __future__ import annotations

import argparse
import json
import math
import os
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "http://127.0.0.1:8787"
DEFAULT_SCOPE = "bootstrap"
DEFAULT_TMX_SIZE = 200
DEFAULT_MIN_UNIQUE_RATIO = 0.30

REQUIRED_TILE_TYPES = ("plain", "resource", "city")
REQUIRED_TERRAINS = ("mountain", "grassland", "riverland")


@dataclass(frozen=True)
class Bounds:
    x_min: int
    x_max: int
    y_min: int
    y_max: int


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _http_get_json(base_url: str, path: str, timeout_sec: float) -> dict[str, Any]:
    url = urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        payload = resp.read().decode("utf-8")
    parsed = json.loads(payload)
    if not isinstance(parsed, dict):
        raise ValueError("response payload is not JSON object")
    return parsed


def _map_backend_to_tmx_axis(value: int, axis_min: int, axis_max: int, tmx_size: int) -> int:
    if tmx_size <= 1:
        return 0
    if axis_max <= axis_min:
        return 0
    ratio = (float(value) - float(axis_min)) / max(1.0, float(axis_max - axis_min))
    ratio = max(0.0, min(1.0, ratio))
    return max(0, min(tmx_size - 1, int(round(ratio * float(tmx_size - 1)))))


def _find_bounds(tiles: list[dict[str, Any]]) -> Bounds:
    x_values = [int(t.get("x", 0)) for t in tiles]
    y_values = [int(t.get("y", 0)) for t in tiles]
    return Bounds(min(x_values), max(x_values), min(y_values), max(y_values))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate map-layout -> TMX mapping stability.")
    parser.add_argument("--base-url", default=os.environ.get("SLG_BACKEND_URL", DEFAULT_BASE_URL), help="Backend base URL")
    parser.add_argument(
        "--scope",
        default=DEFAULT_SCOPE,
        choices=["full", "bootstrap", "province", "region", "viewport"],
        help="Map layout scope",
    )
    parser.add_argument("--timeout-sec", type=float, default=60.0, help="HTTP timeout seconds")
    parser.add_argument("--tmx-width", type=int, default=DEFAULT_TMX_SIZE, help="TMX width")
    parser.add_argument("--tmx-height", type=int, default=DEFAULT_TMX_SIZE, help="TMX height")
    parser.add_argument("--sample-limit", type=int, default=6, help="Sample size per type/terrain")
    parser.add_argument("--output", default="tmp/gates/godot_visual_mapping_latest.json", help="Output report path")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    raw = _http_get_json(args.base_url, f"/api/world/map-layout?scope={urllib.parse.quote(args.scope, safe='')}", args.timeout_sec)
    if "ok" in raw:
        ok = bool(raw.get("ok", False))
        data = raw.get("data", {}) if isinstance(raw.get("data", {}), dict) else {}
        status_value = raw.get("status")
        message_value = raw.get("message")
    else:
        ok = isinstance(raw.get("map", {}), dict)
        data = raw
        status_value = 200 if ok else None
        message_value = None
    map_data = data.get("map", {}) if isinstance(data.get("map", {}), dict) else {}
    raw_tiles = map_data.get("tiles", [])
    tiles = [t for t in raw_tiles if isinstance(t, dict)]

    report: dict[str, Any] = {
        "command": "validate_visual_mapping",
        "generatedAt": _now_iso(),
        "baseUrl": args.base_url,
        "scope": args.scope,
        "tmx": {"width": int(args.tmx_width), "height": int(args.tmx_height)},
        "checks": [],
        "summary": {},
    }

    report["checks"].append(
        {
            "name": "map_layout_ok",
            "passed": ok,
            "details": {"status": status_value, "message": message_value},
        }
    )
    has_tiles = len(tiles) > 0
    report["checks"].append(
        {
            "name": "has_tiles",
            "passed": has_tiles,
            "details": {"tileCount": len(tiles)},
        }
    )

    if not ok or not has_tiles:
        _write_report(Path(args.output), report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1

    bounds = _find_bounds(tiles)
    type_counter: Counter[str] = Counter()
    terrain_counter: Counter[str] = Counter()
    unique_cells: set[tuple[int, int]] = set()
    out_of_bounds = 0

    sample_by_type: dict[str, list[dict[str, Any]]] = defaultdict(list)
    sample_by_terrain: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for tile in tiles:
        tile_x = int(tile.get("x", 0))
        tile_y = int(tile.get("y", 0))
        mapped_x = _map_backend_to_tmx_axis(tile_x, bounds.x_min, bounds.x_max, int(args.tmx_width))
        mapped_y = _map_backend_to_tmx_axis(tile_y, bounds.y_min, bounds.y_max, int(args.tmx_height))
        if mapped_x < 0 or mapped_x >= int(args.tmx_width) or mapped_y < 0 or mapped_y >= int(args.tmx_height):
            out_of_bounds += 1
        unique_cells.add((mapped_x, mapped_y))

        tile_type = str(tile.get("type", "")).strip().lower()
        terrain = str(tile.get("terrain", "")).strip().lower()
        if tile_type:
            type_counter[tile_type] += 1
            if len(sample_by_type[tile_type]) < int(args.sample_limit):
                sample_by_type[tile_type].append(
                    {
                        "tileId": str(tile.get("id", "")),
                        "x": tile_x,
                        "y": tile_y,
                        "tmxX": mapped_x,
                        "tmxY": mapped_y,
                    }
                )
        if terrain:
            terrain_counter[terrain] += 1
            if len(sample_by_terrain[terrain]) < int(args.sample_limit):
                sample_by_terrain[terrain].append(
                    {
                        "tileId": str(tile.get("id", "")),
                        "x": tile_x,
                        "y": tile_y,
                        "tmxX": mapped_x,
                        "tmxY": mapped_y,
                    }
                )

    missing_types = [t for t in REQUIRED_TILE_TYPES if type_counter.get(t, 0) == 0]
    missing_terrains = [t for t in REQUIRED_TERRAINS if terrain_counter.get(t, 0) == 0]
    unique_ratio = len(unique_cells) / max(1, len(tiles))

    min_unique_ratio = DEFAULT_MIN_UNIQUE_RATIO
    report["checks"].extend(
        [
            {
                "name": "required_tile_types_present",
                "passed": len(missing_types) == 0,
                "details": {"required": list(REQUIRED_TILE_TYPES), "missing": missing_types},
            },
            {
                "name": "required_terrains_present",
                "passed": len(missing_terrains) == 0,
                "details": {"required": list(REQUIRED_TERRAINS), "missing": missing_terrains},
            },
            {
                "name": "mapped_in_bounds",
                "passed": out_of_bounds == 0,
                "details": {"outOfBounds": out_of_bounds},
            },
            {
                "name": "mapping_density_reasonable",
                "passed": unique_ratio >= min_unique_ratio,
                "details": {
                    "uniqueCellCount": len(unique_cells),
                    "tileCount": len(tiles),
                    "uniqueRatio": round(unique_ratio, 4),
                    "threshold": min_unique_ratio,
                    "note": "linear 320x320 -> 200x200 projection is expected to introduce coordinate collisions",
                },
            },
        ]
    )

    report["summary"] = {
        "bounds": {
            "backendX": {"min": bounds.x_min, "max": bounds.x_max},
            "backendY": {"min": bounds.y_min, "max": bounds.y_max},
        },
        "tileTypeCounts": dict(type_counter),
        "terrainCounts": dict(terrain_counter),
        "samples": {
            "tileTypes": {k: v for k, v in sample_by_type.items() if k in REQUIRED_TILE_TYPES},
            "terrains": {k: v for k, v in sample_by_terrain.items() if k in REQUIRED_TERRAINS},
        },
        "mapping": {
            "tileCount": len(tiles),
            "uniqueCellCount": len(unique_cells),
            "uniqueRatio": round(unique_ratio, 4),
            "outOfBounds": out_of_bounds,
        },
    }

    _write_report(Path(args.output), report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if all(bool(c.get("passed")) for c in report["checks"]) else 1


def _write_report(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
