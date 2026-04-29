from __future__ import annotations

import argparse
import json
import math
import random
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

from PIL import Image, ImageDraw


CANVAS_SIZE = 384
PROJECTION_SCALE = 226.274
PROJECTION_CENTER = (192.0, 230.0)
RESOURCE_KINDS = ("grain", "wood", "stone", "iron")
VISUAL_BRIGHTNESS_GAIN = 1.16
VISUAL_BRIGHTNESS_LIFT = 12
KIND_VISUAL_GRADE = {
    "grain": (1.20, 22),
    "wood": (1.22, 22),
    "stone": (1.18, 22),
    "iron": (1.26, 20),
}


@dataclass(frozen=True)
class Palette:
    top: tuple[int, int, int, int]
    edge: tuple[int, int, int, int]


GROUND_PALETTE = {
    "grain": Palette((92, 94, 70, 232), (156, 146, 96, 150)),
    "wood": Palette((78, 98, 74, 232), (128, 148, 94, 145)),
    "stone": Palette((96, 96, 88, 232), (150, 144, 122, 142)),
    "iron": Palette((101, 90, 80, 232), (154, 118, 94, 148)),
}


def project(x: float, y: float, z: float = 0.0) -> tuple[float, float]:
    rad_z = math.radians(45.0)
    rz_x = x * math.cos(rad_z) - y * math.sin(rad_z)
    rz_y = x * math.sin(rad_z) + y * math.cos(rad_z)
    sx = rz_x * PROJECTION_SCALE + PROJECTION_CENTER[0]
    sy = rz_y * PROJECTION_SCALE * 0.5 - z * PROJECTION_SCALE + PROJECTION_CENTER[1]
    return sx, sy


def rgba(hex_value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_value.strip().lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def with_alpha(color: tuple[int, int, int, int], alpha: int) -> tuple[int, int, int, int]:
    return (color[0], color[1], color[2], alpha)


def lerp_color(a: tuple[int, int, int, int], b: tuple[int, int, int, int], t: float) -> tuple[int, int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))  # type: ignore[return-value]


def world_rect_points(xmin: float, xmax: float, ymin: float, ymax: float, z: float) -> list[tuple[float, float]]:
    return [
        project(xmin, ymin, z),
        project(xmax, ymin, z),
        project(xmax, ymax, z),
        project(xmin, ymax, z),
    ]


def draw_projected_line(
    image: Image.Image,
    points: list[tuple[float, float, float]],
    fill: tuple[int, int, int, int],
    width: int = 1,
) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    draw.line([project(x, y, z) for x, y, z in points], fill=fill, width=width)


def draw_worker(image: Image.Image, x: float, y: float, z: float, color: tuple[int, int, int, int] = (42, 31, 22, 210)) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    cx, cy = project(x, y, z)
    draw.ellipse((cx - 1.4, cy - 6.0, cx + 1.4, cy - 3.2), fill=(99, 74, 45, 210))
    draw.line([(cx, cy - 3.0), (cx, cy + 2.0)], fill=color, width=2)
    draw.line([(cx - 2.0, cy + 0.5), (cx + 2.0, cy + 0.5)], fill=color, width=1)


def draw_low_shed(
    image: Image.Image,
    x: float,
    y: float,
    z: float,
    scale: float,
    wall: tuple[int, int, int, int] = (84, 63, 43, 220),
    roof: tuple[int, int, int, int] = (62, 45, 32, 235),
) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    w = 0.105 * scale
    d = 0.072 * scale
    h = 0.045 * scale
    base = [
        project(x - w, y - d, z),
        project(x + w, y - d, z),
        project(x + w, y + d, z),
        project(x - w, y + d, z),
    ]
    top = [
        project(x - w, y - d, z + h),
        project(x + w, y - d, z + h),
        project(x + w, y + d, z + h),
        project(x - w, y + d, z + h),
    ]
    draw.polygon([top[3], top[2], base[2], base[3]], fill=wall)
    draw.polygon([top[2], top[1], base[1], base[2]], fill=(52, 39, 30, 230))
    draw.polygon(top, fill=(88, 71, 49, 225))
    roof_pts = [
        project(x - w * 1.18, y - d * 1.05, z + h + 0.018 * scale),
        project(x + w * 1.18, y - d * 1.05, z + h + 0.018 * scale),
        project(x + w * 1.05, y + d * 1.15, z + h + 0.004 * scale),
        project(x - w * 1.05, y + d * 1.15, z + h + 0.004 * scale),
    ]
    draw.polygon(roof_pts, fill=roof)
    draw.line(roof_pts + [roof_pts[0]], fill=(122, 92, 50, 150), width=1)


def draw_fence_posts(
    image: Image.Image,
    points: list[tuple[float, float]],
    color: tuple[int, int, int, int] = (92, 65, 39, 210),
) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    last: tuple[float, float] | None = None
    for x, y in points:
        base = project(x, y, 0.018)
        top = project(x, y, 0.060)
        draw.line([base, top], fill=color, width=2)
        if last != None:
            draw.line([project(last[0], last[1], 0.046), project(x, y, 0.046)], fill=color, width=1)
        last = (x, y)


def draw_timber_frame(image: Image.Image, x: float, y: float, z: float, scale: float = 1.0) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    left_base = project(x - 0.045 * scale, y, z)
    left_top = project(x - 0.035 * scale, y, z + 0.090 * scale)
    right_base = project(x + 0.045 * scale, y, z)
    right_top = project(x + 0.035 * scale, y, z + 0.090 * scale)
    draw.line([left_base, left_top], fill=(94, 62, 37, 230), width=2)
    draw.line([right_base, right_top], fill=(94, 62, 37, 230), width=2)
    draw.line([left_top, right_top], fill=(110, 76, 43, 230), width=2)
    draw.line([project(x - 0.030 * scale, y + 0.026 * scale, z + 0.040 * scale), right_top], fill=(74, 51, 34, 210), width=1)


def draw_cart(image: Image.Image, x: float, y: float, z: float, scale: float = 1.0) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    c = project(x, y, z)
    w = 8.0 * scale
    h = 4.0 * scale
    draw.polygon([(c[0] - w, c[1]), (c[0] - w * 0.2, c[1] - h), (c[0] + w, c[1]), (c[0] + w * 0.2, c[1] + h)], fill=(82, 56, 35, 220))
    draw.ellipse((c[0] - w * 0.8, c[1] + h * 0.2, c[0] - w * 0.35, c[1] + h * 0.65), fill=(74, 58, 45, 180))
    draw.ellipse((c[0] + w * 0.35, c[1] + h * 0.2, c[0] + w * 0.8, c[1] + h * 0.65), fill=(74, 58, 45, 180))


def draw_resource_footprint(image: Image.Image, kind: str, level: int, rng: random.Random) -> list[tuple[float, float]]:
    draw = ImageDraw.Draw(image, "RGBA")
    palette = GROUND_PALETTE[kind]
    xmin = -0.50
    xmax = 0.50
    ymin = -0.50
    ymax = 0.50
    top = world_rect_points(xmin, xmax, ymin, ymax, 0.0)
    draw.polygon(top, fill=palette.top)
    draw.line(top + [top[0]], fill=palette.edge, width=1)

    texture = Image.new("RGBA", image.size, (0, 0, 0, 0))
    texture_draw = ImageDraw.Draw(texture, "RGBA")
    mask = Image.new("L", image.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.polygon(top, fill=255)

    if kind == "grain":
        for i in range(5 + min(level, 5)):
            t = -0.43 + i * 0.108
            p1 = project(-0.44, t, 0.002)
            p2 = project(0.44, t + 0.02, 0.002)
            texture_draw.line([p1, p2], fill=(116, 101, 61, 72), width=1)
        for i in range(3 + min(level, 4)):
            t = -0.36 + i * 0.14
            p1 = project(t, -0.40, 0.002)
            p2 = project(t + 0.025, 0.40, 0.002)
            texture_draw.line([p1, p2], fill=(58, 51, 36, 48), width=1)
        if level >= 5:
            p1 = project(-0.48, 0.08, 0.003)
            p2 = project(0.45, 0.12, 0.003)
            texture_draw.line([p1, p2], fill=(62, 73, 56, 80), width=2)
    elif kind == "wood":
        for _ in range(4 + level * 2):
            x = rng.uniform(-0.43, 0.43)
            y = rng.uniform(-0.42, 0.42)
            sx, sy = project(x, y, 0.003)
            r = rng.uniform(2.0, 5.2)
            texture_draw.ellipse((sx - r, sy - r * 0.55, sx + r, sy + r * 0.55), fill=(34, 45, 34, 38))
        if level >= 4:
            for y in (-0.22, 0.18):
                p1 = project(-0.38, y, 0.004)
                p2 = project(0.35, y + 0.01, 0.004)
                texture_draw.line([p1, p2], fill=(72, 57, 40, 66), width=2)
    elif kind == "stone":
        for _ in range(8 + level):
            x = rng.uniform(-0.42, 0.42)
            y = rng.uniform(-0.42, 0.42)
            sx, sy = project(x, y, 0.003)
            r = rng.uniform(1.4, 3.8)
            texture_draw.ellipse((sx - r, sy - r * 0.55, sx + r, sy + r * 0.55), fill=(88, 86, 78, 40))
        if level >= 6:
            for y in (-0.16, 0.02, 0.20):
                texture_draw.line([project(-0.32, y, 0.004), project(0.33, y + 0.015, 0.004)], fill=(108, 102, 90, 76), width=2)
    elif kind == "iron":
        for _ in range(7 + level):
            x = rng.uniform(-0.42, 0.42)
            y = rng.uniform(-0.42, 0.42)
            sx, sy = project(x, y, 0.003)
            r = rng.uniform(1.4, 3.5)
            texture_draw.ellipse((sx - r, sy - r * 0.55, sx + r, sy + r * 0.55), fill=(70, 58, 51, 36))
        for _ in range(1 + level // 2):
            x = rng.uniform(-0.34, 0.34)
            y = rng.uniform(-0.34, 0.34)
            texture_draw.line([project(x - 0.04, y, 0.005), project(x + 0.05, y + 0.025, 0.005)], fill=(116, 58, 45, 86), width=2)

    clipped = Image.new("RGBA", image.size, (0, 0, 0, 0))
    clipped.alpha_composite(texture)
    image.alpha_composite(Image.composite(clipped, Image.new("RGBA", image.size, (0, 0, 0, 0)), mask))
    return top


def draw_grain(image: Image.Image, level: int, rng: random.Random) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    count_by_level = [0, 30, 42, 58, 86, 130, 190, 276, 386, 526]
    count = count_by_level[clamp_level(level)]
    height_base = 0.050 + level * 0.007
    colors = [rgba("#827848", 226), rgba("#94864F", 226), rgba("#69643E", 218), rgba("#A08F56", 224)]
    for _ in range(count):
        x = rng.uniform(-0.41, 0.41)
        y = rng.uniform(-0.40, 0.40)
        coverage_limit = 0.72 if level <= 5 else min(0.92, 0.76 + (level - 5) * 0.045)
        if abs(x) + abs(y) > coverage_limit and rng.random() < 0.65:
            continue
        z = rng.uniform(0.006, 0.015)
        root = project(x, y, z)
        lean = rng.uniform(-0.012, 0.012)
        top = project(x + lean, y + rng.uniform(-0.010, 0.010), z + height_base * rng.uniform(0.75, 1.25))
        width = 1 if level < 5 else 2
        draw.line([root, top], fill=rng.choice(colors), width=width)
        if level >= 3:
            draw.ellipse((top[0] - 1.2, top[1] - 1.0, top[0] + 1.2, top[1] + 1.0), fill=rgba("#B6A35F", 200))
    if level >= 6:
        # High levels should read as managed farmland, not as buildings on top.
        for offset in (-0.26, -0.04, 0.18):
            draw_projected_line(image, [(-0.44, offset, 0.017), (0.44, offset + 0.030, 0.017)], (45, 62, 50, 95), 2)
            draw_projected_line(image, [(-0.44, offset - 0.014, 0.020), (0.44, offset + 0.016, 0.020)], (118, 104, 68, 70), 1)
        for offset in (-0.22, 0.00, 0.22):
            draw_projected_line(image, [(offset, -0.42, 0.018), (offset + 0.025, 0.42, 0.018)], (78, 65, 38, 82), 1)
    if level >= 8:
        draw_fence_posts(image, [(-0.46, -0.40), (-0.30, -0.44), (-0.12, -0.43), (0.06, -0.44), (0.24, -0.42), (0.42, -0.37)], (84, 60, 36, 110))
        for _ in range(level - 6):
            draw_worker(image, rng.uniform(-0.30, 0.30), rng.uniform(0.22, 0.40), 0.026, (45, 33, 23, 155))


def draw_tree(image: Image.Image, x: float, y: float, z: float, scale: float, rng: random.Random) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    root = project(x, y, z)
    trunk_top = project(x, y, z + 0.045 * scale)
    draw.line([root, trunk_top], fill=(86, 62, 38, 232), width=max(1, int(3 * scale)))
    canopy = project(x, y, z + 0.075 * scale)
    base_r = 9.5 * scale
    blobs = [
        (-0.45, 0.05, 0.98, rgba("#476E40", 236)),
        (0.38, 0.10, 0.90, rgba("#5D8548", 236)),
        (0.00, -0.55, 0.95, rgba("#7C9861", 224)),
        (0.05, 0.20, 1.08, rgba("#3C633D", 232)),
    ]
    for ox, oy, mul, color in blobs:
        r = base_r * mul * rng.uniform(0.88, 1.12)
        cx = canopy[0] + ox * base_r
        cy = canopy[1] + oy * base_r * 0.65
        draw.ellipse((cx - r, cy - r * 0.72, cx + r, cy + r * 0.72), fill=color)
    hi = project(x - 0.012, y - 0.012, z + 0.095 * scale)
    draw.ellipse((hi[0] - base_r * 0.42, hi[1] - base_r * 0.32, hi[0] + base_r * 0.42, hi[1] + base_r * 0.30), fill=(148, 170, 104, 106))


def draw_wood(image: Image.Image, level: int, rng: random.Random) -> None:
    count_by_level = [0, 7, 10, 16, 24, 36, 50, 65, 80, 96]
    count = count_by_level[clamp_level(level)]
    positions: list[tuple[float, float]] = []
    for _ in range(count * 3):
        if len(positions) >= count:
            break
        spread = 0.36 if level <= 5 else min(0.42, 0.36 + (level - 5) * 0.015)
        x = rng.uniform(-spread, spread)
        y = rng.uniform(-spread, spread)
        coverage_limit = min(0.94, 0.66 + level * 0.030)
        if abs(x) + abs(y) > coverage_limit:
            continue
        min_dist = 0.0065 if level <= 5 else 0.0046
        if any((x - px) ** 2 + (y - py) ** 2 < min_dist for px, py in positions):
            continue
        positions.append((x, y))
    for x, y in sorted(positions, key=lambda p: p[0] + p[1]):
        draw_tree(image, x, y, 0.012, rng.uniform(0.74, 1.12) * (0.92 + level * 0.034), rng)
    draw = ImageDraw.Draw(image, "RGBA")
    if level >= 5:
        for _ in range(level - 3):
            x = rng.uniform(-0.32, 0.30)
            y = rng.uniform(-0.30, 0.32)
            p1 = project(x - 0.035, y, 0.018)
            p2 = project(x + 0.035, y, 0.018)
            draw.line([p1, p2], fill=(111, 81, 45, 210), width=3)
            draw.line([project(x - 0.035, y + 0.018, 0.018), project(x + 0.035, y + 0.018, 0.018)], fill=(65, 48, 33, 210), width=2)
    if level >= 6:
        draw_projected_line(image, [(-0.40, 0.28, 0.018), (-0.08, 0.22, 0.018), (0.34, 0.28, 0.018)], (94, 72, 44, 110), 2)
        for _ in range(level - 5):
            x = rng.uniform(-0.36, 0.34)
            y = rng.uniform(0.06, 0.34)
            c = project(x, y, 0.021)
            draw.ellipse((c[0] - 2.5, c[1] - 1.3, c[0] + 2.5, c[1] + 1.3), fill=(95, 69, 42, 185))
    if level >= 8:
        draw_fence_posts(image, [(-0.44, -0.36), (-0.28, -0.42), (-0.10, -0.43), (0.08, -0.42), (0.26, -0.38), (0.42, -0.32)], (78, 56, 34, 145))
        for x in (-0.28, -0.02, 0.24):
            for stack_y in (0.35, 0.37):
                draw_projected_line(image, [(x - 0.045, stack_y, 0.030), (x + 0.045, stack_y + 0.006, 0.030)], (116, 80, 43, 205), 3)
                draw_projected_line(image, [(x - 0.045, stack_y + 0.018, 0.032), (x + 0.045, stack_y + 0.024, 0.032)], (70, 50, 32, 205), 2)
        for _ in range(level - 6):
            draw_worker(image, rng.uniform(-0.30, 0.30), rng.uniform(0.30, 0.42), 0.030, (40, 30, 22, 185))


def draw_rock_prism(
    image: Image.Image,
    x: float,
    y: float,
    size: float,
    height: float,
    top: tuple[int, int, int, int],
    left: tuple[int, int, int, int],
    right: tuple[int, int, int, int],
    rng: random.Random,
) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    sx = size * rng.uniform(0.70, 1.15)
    sy = size * rng.uniform(0.60, 1.00)
    z0 = 0.012
    z1 = z0 + height
    pts_top = [
        project(x - sx * 0.5, y - sy * 0.35, z1),
        project(x + sx * 0.45, y - sy * 0.45, z1),
        project(x + sx * 0.55, y + sy * 0.35, z1),
        project(x - sx * 0.40, y + sy * 0.50, z1),
    ]
    pts_low = [
        project(x - sx * 0.5, y - sy * 0.35, z0),
        project(x + sx * 0.45, y - sy * 0.45, z0),
        project(x + sx * 0.55, y + sy * 0.35, z0),
        project(x - sx * 0.40, y + sy * 0.50, z0),
    ]
    draw.polygon([pts_top[3], pts_top[2], pts_low[2], pts_low[3]], fill=left)
    draw.polygon([pts_top[2], pts_top[1], pts_low[1], pts_low[2]], fill=right)
    draw.polygon(pts_top, fill=top)
    draw.line(pts_top + [pts_top[0]], fill=(30, 29, 27, 80), width=1)


def draw_stone(image: Image.Image, level: int, rng: random.Random) -> None:
    count_by_level = [0, 10, 12, 16, 21, 29, 38, 48, 59, 72]
    count = count_by_level[clamp_level(level)]
    for _ in range(count):
        x = rng.uniform(-0.32, 0.32)
        y = rng.uniform(-0.32, 0.32)
        coverage_limit = min(0.84, 0.62 + level * 0.025)
        if abs(x) + abs(y) > coverage_limit:
            continue
        size = rng.uniform(0.060, 0.120) * (0.92 + level * 0.030)
        height = rng.uniform(0.018, 0.065) * (0.82 + level * 0.040)
        top = rng.choice([rgba("#A39E8F"), rgba("#8F897B"), rgba("#B4AB99"), rgba("#7C7D72")])
        draw_rock_prism(image, x, y, size, height, top, rgba("#716A5D"), rgba("#56524C"), rng)
    if level >= 4:
        for _ in range(2 + level // 3):
            draw_rock_prism(
                image,
                rng.uniform(-0.18, 0.18),
                rng.uniform(-0.18, 0.20),
                rng.uniform(0.115, 0.170),
                rng.uniform(0.045, 0.095) * (0.85 + level * 0.035),
                rng.choice([rgba("#AAA28E"), rgba("#969286"), rgba("#BDB39F")]),
                rgba("#756D5F"),
                rgba("#56534B"),
                rng,
            )
    draw = ImageDraw.Draw(image, "RGBA")
    if level >= 6:
        # Quarry management: stepped benches and a light work path.
        for i in range(min(4, level - 4)):
            y = -0.24 + i * 0.085
            draw.line([project(-0.34, y, 0.026), project(0.28, y + 0.025, 0.026)], fill=(138, 128, 106, 150), width=2)
            draw.line([project(-0.28, y + 0.026, 0.024), project(0.24, y + 0.048, 0.024)], fill=(92, 82, 68, 84), width=1)
        draw_projected_line(image, [(-0.36, 0.30, 0.024), (-0.06, 0.24, 0.024), (0.30, 0.30, 0.024)], (88, 73, 51, 135), 3)
    if level >= 8:
        draw_timber_frame(image, 0.26, 0.14, 0.030, 0.95)
        for _ in range(level - 6):
            draw_cart(image, rng.uniform(-0.20, 0.24), rng.uniform(0.14, 0.32), 0.032, 0.72)
            draw_worker(image, rng.uniform(-0.25, 0.28), rng.uniform(-0.04, 0.26), 0.034)


def draw_mine_entrance(image: Image.Image, level: int) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    c = project(-0.03, 0.29, 0.026)
    w = 18 + level * 0.8
    h = 12 + level * 0.4
    draw.pieslice((c[0] - w, c[1] - h, c[0] + w, c[1] + h), 180, 360, fill=(72, 58, 48, 168))
    draw.rectangle((c[0] - w, c[1] - 1, c[0] + w, c[1] + h), fill=(72, 58, 48, 168))
    draw.arc((c[0] - w, c[1] - h, c[0] + w, c[1] + h), 180, 360, fill=(122, 83, 54, 218), width=2)
    if level >= 6:
        draw.line([(c[0] - w * 0.72, c[1] + 3), (c[0] - w * 0.72, c[1] - h * 0.55)], fill=(85, 58, 37, 230), width=2)
        draw.line([(c[0] + w * 0.72, c[1] + 3), (c[0] + w * 0.72, c[1] - h * 0.55)], fill=(85, 58, 37, 230), width=2)
        draw.line([(c[0] - w * 0.82, c[1] - h * 0.48), (c[0] + w * 0.82, c[1] - h * 0.48)], fill=(103, 72, 44, 230), width=2)


def draw_iron(image: Image.Image, level: int, rng: random.Random) -> None:
    count_by_level = [0, 9, 11, 16, 22, 31, 42, 54, 67, 82]
    count = count_by_level[clamp_level(level)]
    for _ in range(count):
        x = rng.uniform(-0.30, 0.30)
        y = rng.uniform(-0.32, 0.26)
        coverage_limit = min(0.82, 0.60 + level * 0.025)
        if abs(x) + abs(y) > coverage_limit:
            continue
        size = rng.uniform(0.060, 0.125) * (0.92 + level * 0.030)
        height = rng.uniform(0.018, 0.068) * (0.88 + level * 0.045)
        top = rng.choice([rgba("#8C9290"), rgba("#918C83"), rgba("#7B8582"), rgba("#9B7A63"), rgba("#8C6958")])
        draw_rock_prism(image, x, y, size, height, top, rgba("#755F50"), rgba("#5B5952"), rng)
    draw = ImageDraw.Draw(image, "RGBA")
    veins = 2 + level
    for _ in range(veins):
        x = rng.uniform(-0.30, 0.30)
        y = rng.uniform(-0.30, 0.22)
        p1 = project(x - 0.035, y - 0.010, 0.060)
        p2 = project(x + 0.035, y + 0.020, 0.065)
        draw.line([p1, p2], fill=(178, 82, 58, 188), width=2 if level >= 5 else 1)
    if level >= 4:
        draw_mine_entrance(image, level)
    if level >= 6:
        # High-level iron tiles read as managed mines: rails, timber supports, ore carts.
        draw_projected_line(image, [(-0.22, 0.28, 0.026), (0.06, 0.20, 0.026), (0.32, 0.25, 0.026)], (91, 65, 45, 150), 3)
        draw_projected_line(image, [(-0.20, 0.25, 0.030), (0.06, 0.17, 0.030), (0.30, 0.22, 0.030)], (76, 63, 52, 148), 1)
        draw_projected_line(image, [(-0.18, 0.31, 0.030), (0.08, 0.23, 0.030), (0.32, 0.28, 0.030)], (76, 63, 52, 148), 1)
        draw_timber_frame(image, -0.03, 0.27, 0.035, 0.88)
    if level >= 7:
        for _ in range(level - 5):
            c = project(rng.uniform(-0.25, 0.22), rng.uniform(0.05, 0.30), 0.026)
            draw.ellipse((c[0] - 5, c[1] - 3, c[0] + 5, c[1] + 3), fill=(83, 45, 37, 210))
    if level >= 8:
        for _ in range(level - 6):
            draw_cart(image, rng.uniform(-0.08, 0.30), rng.uniform(0.16, 0.32), 0.034, 0.68)
            draw_worker(image, rng.uniform(-0.22, 0.26), rng.uniform(-0.10, 0.24), 0.034, (48, 35, 29, 210))


DRAWERS: dict[str, Callable[[Image.Image, int, random.Random], None]] = {
    "grain": draw_grain,
    "wood": draw_wood,
    "stone": draw_stone,
    "iron": draw_iron,
}


def clamp_level(level: int) -> int:
    return max(1, min(9, int(level)))


def render_resource(kind: str, level: int) -> Image.Image:
    if kind not in RESOURCE_KINDS:
        raise ValueError(f"unsupported resource kind: {kind}")
    rng = random.Random(f"world-resource-{kind}-{level}-v1")
    image = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    level = clamp_level(level)
    draw_resource_footprint(image, kind, level, rng)
    DRAWERS[kind](image, level, rng)
    apply_visual_brightness_grade(image, kind)
    return image


def apply_visual_brightness_grade(image: Image.Image, kind: str) -> None:
    """Lift generated resource PNG exposure without changing alpha or footprint."""
    gain, lift = KIND_VISUAL_GRADE.get(kind, (VISUAL_BRIGHTNESS_GAIN, VISUAL_BRIGHTNESS_LIFT))
    lut = [min(255, int(value * gain + lift)) for value in range(256)]
    red, green, blue, alpha = image.split()
    image.paste(Image.merge("RGBA", (red.point(lut), green.point(lut), blue.point(lut), alpha)))


def save_level_assets(output_dir: Path) -> dict[str, dict[str, str]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, str]] = {}
    for kind in RESOURCE_KINDS:
        kind_entries: dict[str, str] = {}
        base_image = render_resource(kind, 5)
        base_name = f"world_resource_{kind}_base_v1.png"
        base_image.save(output_dir / base_name)
        kind_entries["base"] = base_name
        for level in range(1, 10):
            image = render_resource(kind, level)
            filename = f"world_resource_{kind}_l{level:02d}_v1.png"
            image.save(output_dir / filename)
            kind_entries[f"l{level:02d}"] = filename
        manifest[kind] = kind_entries
    return manifest


def make_preview_sheet(output_dir: Path, manifest: dict[str, dict[str, str]], preview_path: Path) -> None:
    cell_w = 132
    cell_h = 106
    title_h = 32
    sheet = Image.new("RGBA", (cell_w * 10, title_h + cell_h * len(RESOURCE_KINDS)), (16, 20, 20, 255))
    draw = ImageDraw.Draw(sheet, "RGBA")
    draw.text((10, 8), "world resource levels v1 | source 384x384 | anchor bottom_center", fill=(230, 220, 190, 255))
    for row, kind in enumerate(RESOURCE_KINDS):
        y0 = title_h + row * cell_h
        draw.text((8, y0 + 42), kind, fill=(230, 220, 190, 255))
        for level in range(1, 10):
            filename = manifest[kind][f"l{level:02d}"]
            image = Image.open(output_dir / filename).convert("RGBA")
            bbox = image.getchannel("A").getbbox()
            if bbox:
                crop = image.crop(bbox)
            else:
                crop = image
            crop.thumbnail((104, 82), Image.Resampling.LANCZOS)
            panel = Image.new("RGBA", (cell_w, cell_h), (24, 28, 28, 255))
            px = (cell_w - crop.width) // 2
            py = 8 + (82 - crop.height) // 2
            panel.alpha_composite(crop, (px, py))
            pd = ImageDraw.Draw(panel, "RGBA")
            pd.text((6, 88), f"L{level:02d}", fill=(206, 194, 160, 255))
            sheet.alpha_composite(panel, (cell_w * level, y0))
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(preview_path)


def write_manifest(output_dir: Path, manifest: dict[str, dict[str, str]]) -> None:
    payload = {
        "schema": "world_resource_assets_manifest_v1",
        "source_canvas": [384, 384],
        "effective_footprint": [320, 160],
        "fit_footprint": [320, 160],
        "projection": {
            "type": "isometric_2_to_1",
            "tile_width_reference": 60,
            "tile_height_reference": 30,
            "anchor_rule": "bottom_center",
            "anchor_pixel": [192, 310],
        },
        "level_policy": {
            "min": 1,
            "max": 9,
            "base_level": 5,
            "strategy": "programmatic_density_and_feature_growth_from_unified_base_language",
        },
        "resources": manifest,
    }
    (output_dir / "world_resource_assets_manifest_v1.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def mirror_export_assets(output_dir: Path, export_dir: Path, preview_path: Path) -> None:
    export_dir.mkdir(parents=True, exist_ok=True)
    for path in output_dir.glob("world_resource_*_v1.png"):
        shutil.copy2(path, export_dir / path.name)
    manifest_path = output_dir / "world_resource_assets_manifest_v1.json"
    if manifest_path.exists():
        shutil.copy2(manifest_path, export_dir / manifest_path.name)
    if preview_path.exists():
        shutil.copy2(preview_path, export_dir / preview_path.name)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate world map resource tile assets.")
    parser.add_argument(
        "--output-dir",
        default="godot-client/assets/themes/slgclient/current/world/resources",
        help="Directory for generated PNG assets.",
    )
    parser.add_argument(
        "--preview",
        default="tmp/asset_review/world_resource_levels_v1_sheet.png",
        help="Preview contact sheet path.",
    )
    parser.add_argument(
        "--root-export-dir",
        default="world_resource_png_exports",
        help="Repo-root directory for quick PNG review/replacement copies. Pass empty string to skip.",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[2]
    output_dir = (root / args.output_dir).resolve()
    preview_path = (root / args.preview).resolve()
    manifest = save_level_assets(output_dir)
    write_manifest(output_dir, manifest)
    make_preview_sheet(output_dir, manifest, preview_path)
    export_dir: Path | None = None
    if str(args.root_export_dir).strip():
        export_dir = (root / str(args.root_export_dir)).resolve()
        mirror_export_assets(output_dir, export_dir, preview_path)
    print(f"generated_dir={output_dir}")
    print(f"preview={preview_path}")
    if export_dir != None:
        print(f"root_export_dir={export_dir}")
    print(f"assets={len(RESOURCE_KINDS) * 10}")


if __name__ == "__main__":
    main()
