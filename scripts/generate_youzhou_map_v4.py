"""
generate_youzhou_map_v4.py — 幽州9郡形状版 v4
==============================================
参照用户上传的幽州9郡边界轮廓图，以形状和比例为核心。

新地图尺寸: 300×106（东西更长，南北更短，更符合幽州实际比例）
基础填充: 草地
西部（代郡）: 雪山区域
郡界: 雪山山脉，留1-2条官道/雪道

地形代码（严格对应 TerrainType.cs）:
  Snow=0  SnowForest=1  FrozenLake=2  SnowRoad=3  SnowTown=4
  SnowMountain=5  Grass=6  GrassForest=7  River=8  FrozenRiver=9
  CastleWall=10  Farmland=11
"""

import json, math, os, sys

W, H = 300, 106

SNOW         = 0
SNOW_FOREST  = 1
FROZEN_LAKE  = 2
SNOW_ROAD    = 3
SNOW_TOWN    = 4
SNOW_MTN     = 5
GRASS        = 6
GRASS_FOREST = 7
RIVER        = 8
FROZEN_RIVER = 9
CASTLE_WALL  = 10
FARMLAND     = 11

# ─── 确定性哈希噪声 ─────────────────────────────────────────────────

def _h(x, y, s=0):
    v = (int(x) * 1664525 + int(y) * 1013904223 + int(s) * 22695477) & 0x7FFFFFFF
    return v / 0x7FFFFFFF

def _lerp(a, b, t):
    u = t * t * (3 - 2 * t)
    return a + (b - a) * u

def vnoise(px, py, s=0):
    ix, iy = int(math.floor(px)), int(math.floor(py))
    fx, fy = px - ix, py - iy
    return _lerp(
        _lerp(_h(ix, iy, s),   _h(ix+1, iy, s),   fx),
        _lerp(_h(ix, iy+1, s), _h(ix+1, iy+1, s), fx),
        fy
    )

def fbm(x, y, octaves=3, freq=0.03, s=0):
    v, amp, tot = 0.0, 1.0, 0.0
    for _ in range(octaves):
        v   += vnoise(x * freq, y * freq, s) * amp
        tot += amp
        amp *= 0.5
        freq *= 2
    return v / tot

# ─── 多边形工具 ──────────────────────────────────────────────────────

def point_in_polygon(px, py, polygon):
    """射线法判断点是否在多边形内"""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-10) + xi):
            inside = not inside
        j = i
    return inside

# ═══════════════════════════════════════════════════════════════════════
# 幽州外轮廓（300×106 网格坐标，y=0 为南/底部，y=105 为北/顶部）
# 参照用户上传的边界轮廓图，简化为 ~30 个控制点
# ═══════════════════════════════════════════════════════════════════════

# 从西北角顺时针描绘
YOUZHOU_OUTLINE = [
    # 西侧 (代郡西部边界，锯齿状山地)
    (8,  78),  (5,  72),  (3,  65),  (5,  58),  (3,  50),
    (5,  42),  (8,  35),  (12, 28),  (18, 22),  (25, 18),
    # 南侧 (涿郡/广阳南界 → 渤海北岸)
    (38, 12),  (55, 8),   (75, 6),   (95, 5),
    (115, 4),  (135, 5),  (155, 8),
    # 辽西/辽东南海岸线（渤海北岸 + 辽东湾）
    (170, 10), (185, 14), (195, 20),
    # 辽东半岛南端
    (200, 15), (208, 8),  (215, 5),  (220, 8),  (225, 15),
    # 辽东半岛东岸 → 乐浪
    (230, 22), (240, 18), (250, 12), (260, 8),
    # 乐浪东南角
    (272, 5),  (280, 8),  (288, 15), (292, 25),
    # 乐浪东侧 → 北上
    (295, 35), (293, 50), (288, 60), (282, 68),
    # 玄菟/辽东北界
    (270, 75), (258, 82), (248, 88), (238, 92),
    # 北侧界线 (鲜卑边界，大致平行)
    (220, 96), (200, 98), (180, 100), (160, 102),
    (140, 101), (120, 100), (100, 98),
    # 上谷/代郡北界（燕山线）
    (80, 96),  (60, 94),  (45, 92),  (30, 90),
    (18, 88),  (12, 84),
]

# ═══════════════════════════════════════════════════════════════════════
# 9 郡定义：种子点 + 属性
# 郡名参照东汉幽州刺史部实际行政区划
# ═══════════════════════════════════════════════════════════════════════

REGIONS = {
    1: {"name": "代郡",   "seed": (18, 58),  "terrain": "snow_mtn"},
    2: {"name": "上谷",   "seed": (48, 72),  "terrain": "grass"},
    3: {"name": "广阳",   "seed": (52, 30),  "terrain": "grass"},
    4: {"name": "渔阳",   "seed": (100, 62), "terrain": "grass"},
    5: {"name": "右北平", "seed": (145, 55), "terrain": "grass"},
    6: {"name": "辽西",   "seed": (185, 50), "terrain": "grass"},
    7: {"name": "辽东",   "seed": (225, 50), "terrain": "grass"},
    8: {"name": "玄菟",   "seed": (240, 85), "terrain": "grass"},
    9: {"name": "乐浪",   "seed": (278, 30), "terrain": "grass"},
}

# ═══════════════════════════════════════════════════════════════════════
# 郡界定义：连接线段（每条线分隔两个郡）
# 每条线的两侧对应不同的郡
# 格式: [(x1,y1), (x2,y2), ...] 的折线
# ═══════════════════════════════════════════════════════════════════════

# 内部边界线（从外轮廓延伸到内部，或连通两个轮廓点）
INTERNAL_BORDERS = [
    # 1-2 代郡|上谷 边界（大致竖线，从北界向南）
    {"regions": (1, 2), "line": [(30, 90), (32, 78), (35, 65), (38, 55)]},
    # 1-3 代郡|广阳 边界（紧接上方边界向南延伸）
    {"regions": (1, 3), "line": [(38, 55), (35, 45), (30, 35), (25, 18)]},
    # 2-3 上谷|广阳 边界（水平线，东西向）
    {"regions": (2, 3), "line": [(38, 55), (50, 52), (65, 50), (75, 48)]},
    # 2-4 上谷|渔阳 边界（从上谷东界向北）
    {"regions": (2, 4), "line": [(75, 48), (78, 58), (80, 70), (82, 82), (80, 96)]},
    # 3-4 广阳|渔阳 边界（从上谷|广阳交点向东南）
    {"regions": (3, 4), "line": [(75, 48), (80, 38), (85, 28), (90, 18), (95, 5)]},
    # 4-5 渔阳|右北平 边界
    {"regions": (4, 5), "line": [(120, 100), (122, 88), (125, 72), (128, 55), (130, 40), (132, 25), (135, 5)]},
    # 5-6 右北平|辽西 边界
    {"regions": (5, 6), "line": [(160, 102), (162, 90), (165, 75), (168, 58), (170, 42), (170, 10)]},
    # 6-7 辽西|辽东 边界
    {"regions": (6, 7), "line": [(200, 98), (202, 85), (205, 70), (208, 55), (210, 40), (208, 30), (200, 15)]},
    # 7-8 辽东|玄菟 边界
    {"regions": (7, 8), "line": [(220, 96), (222, 85), (225, 75), (228, 68), (232, 62)]},
    # 6-8 辽西|玄菟 边界（连接辽西上方与玄菟的分界）
    {"regions": (6, 8), "line": [(200, 98), (205, 95), (215, 94), (220, 96)]},
    # 7-9 辽东|乐浪 边界
    {"regions": (7, 9), "line": [(258, 82), (260, 70), (262, 58), (263, 45), (260, 35), (255, 22), (250, 12)]},
    # 8-9 玄菟|乐浪 边界（北侧，从玄菟东端向乐浪连接）
    {"regions": (8, 9), "line": [(258, 82), (262, 78), (268, 74), (270, 75)]},
]

# ═══════════════════════════════════════════════════════════════════════
# 每条边界上的官道通过点（1-2个pass per border）
# 坐标为边界线上或附近的点，半径内的山会被替换为道路
# ═══════════════════════════════════════════════════════════════════════

PASSES = [
    # 代郡|上谷: 1个山口
    {"pos": (33, 70), "radius": 3},
    # 代郡|广阳: 1个山口
    {"pos": (32, 40), "radius": 3},
    # 上谷|广阳: 1个隘口
    {"pos": (55, 52), "radius": 3},
    # 上谷|渔阳: 1个主要通道
    {"pos": (79, 68), "radius": 3},
    # 广阳|渔阳: 1个南部通道
    {"pos": (82, 32), "radius": 3},
    # 渔阳|右北平: 2个山口（南北各一）
    {"pos": (125, 78), "radius": 3},
    {"pos": (130, 35), "radius": 3},
    # 右北平|辽西: 2个山口
    {"pos": (165, 80), "radius": 3},
    {"pos": (170, 35), "radius": 3},
    # 辽西|辽东: 辽西走廊（重要通道，稍大些）
    {"pos": (205, 65), "radius": 4},
    {"pos": (205, 40), "radius": 3},
    # 辽东|玄菟: 1个
    {"pos": (225, 72), "radius": 3},
    # 辽东|乐浪: 1个（朝鲜古道）
    {"pos": (260, 50), "radius": 3},
]

# ═══════════════════════════════════════════════════════════════════════
# 生成网格
# ═══════════════════════════════════════════════════════════════════════

grid = [[SNOW] * H for _ in range(W)]         # 默认: Snow (边界外)
region_map = [[0] * H for _ in range(W)]       # 0 = 外部, 1-9 = 郡ID

def st(x, y, t):
    if 0 <= x < W and 0 <= y < H:
        grid[x][y] = t

def gt(x, y):
    if 0 <= x < W and 0 <= y < H: return grid[x][y]
    return -1

# === 第1步: 判定所有格子是否在幽州轮廓内 ===
print("第1步: 判定轮廓内外...")
inside_mask = [[False] * H for _ in range(W)]
for x in range(W):
    for y in range(H):
        if point_in_polygon(x, y, YOUZHOU_OUTLINE):
            inside_mask[x][y] = True
            grid[x][y] = GRASS  # 轮廓内默认草地

inside_count = sum(1 for x in range(W) for y in range(H) if inside_mask[x][y])
print(f"  轮廓内格子数: {inside_count} / {W*H} ({inside_count/W/H*100:.1f}%)")

# === 第2步: 分配每个格子所属的郡 ===
print("第2步: 分配郡区...")

def dist_to_seed(x, y, seed):
    sx, sy = seed
    return math.sqrt((x - sx)**2 + (y - sy)**2)

for x in range(W):
    for y in range(H):
        if not inside_mask[x][y]:
            continue
        # 找最近的种子点，分配郡
        best_id = 0
        best_dist = float('inf')
        for rid, rinfo in REGIONS.items():
            d = dist_to_seed(x, y, rinfo["seed"])
            if d < best_dist:
                best_dist = d
                best_id = rid
        region_map[x][y] = best_id

# 统计每个郡的格子数
region_counts = {}
for x in range(W):
    for y in range(H):
        r = region_map[x][y]
        if r > 0:
            region_counts[r] = region_counts.get(r, 0) + 1
for rid in sorted(region_counts):
    print(f"  {rid}.{REGIONS[rid]['name']:6s}: {region_counts[rid]:5d} 格")

# === 第3步: 绘制郡界山脉 ===
print("第3步: 绘制郡界山脉...")

def dist_point_to_segment(px, py, x1, y1, x2, y2):
    """点到线段的距离"""
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.sqrt((px - x1)**2 + (py - y1)**2)
    t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    nx = x1 + t * dx
    ny = y1 + t * dy
    return math.sqrt((px - nx)**2 + (py - ny)**2)

def dist_point_to_polyline(px, py, pts):
    """点到折线的最短距离"""
    best = float('inf')
    for i in range(len(pts) - 1):
        d = dist_point_to_segment(px, py, pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1])
        if d < best:
            best = d
    return best

# 构建边界距离场
BORDER_HALF_WIDTH = 2.5  # 山脉半宽（格数）

border_cells = set()
for border_def in INTERNAL_BORDERS:
    line = border_def["line"]
    for x in range(W):
        for y in range(H):
            if not inside_mask[x][y]:
                continue
            d = dist_point_to_polyline(x, y, line)
            if d <= BORDER_HALF_WIDTH:
                border_cells.add((x, y))

# 标记边界为雪山
mountain_count = 0
for (x, y) in border_cells:
    n = fbm(x, y, octaves=2, freq=0.08, s=42)
    if n > 0.2:  # 添加一些噪声使山脉不完全笔直
        grid[x][y] = SNOW_MTN
        mountain_count += 1
print(f"  郡界山脉格子: {mountain_count}")

# === 第4步: 开辟山口/通道 ===
print("第4步: 开辟山口...")

pass_count = 0
for p in PASSES:
    px, py = p["pos"]
    r = p["radius"]
    for dx in range(-r-1, r+2):
        for dy in range(-r-1, r+2):
            nx, ny = px + dx, py + dy
            if not (0 <= nx < W and 0 <= ny < H):
                continue
            if not inside_mask[nx][ny]:
                continue
            if (dx*dx + dy*dy) <= r*r:
                if grid[nx][ny] == SNOW_MTN:
                    grid[nx][ny] = SNOW_ROAD
                    pass_count += 1
print(f"  山口格子: {pass_count}")

# === 第5步: 西部代郡 → 雪山填充 ===
print("第5步: 代郡雪山区域...")

dai_mtn_count = 0
for x in range(W):
    for y in range(H):
        if region_map[x][y] == 1 and grid[x][y] == GRASS:
            n = fbm(x, y, octaves=3, freq=0.05, s=7)
            if n > 0.35:
                grid[x][y] = SNOW_MTN
                dai_mtn_count += 1
            else:
                grid[x][y] = SNOW  # 代郡非山地部分 → 雪地
print(f"  代郡雪山: {dai_mtn_count} 格")

# === 第6步: 外轮廓边缘森林带 ===
print("第6步: 外轮廓边缘森林带...")

# 在幽州边界附近添加一圈雪林过渡带
for x in range(W):
    for y in range(H):
        if not inside_mask[x][y]:
            continue
        if grid[x][y] != GRASS:
            continue
        # 检查是否靠近轮廓边缘
        near_edge = False
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H:
                    if not inside_mask[nx][ny]:
                        near_edge = True
                        break
            if near_edge:
                break
        if near_edge:
            n = fbm(x, y, freq=0.06, s=31)
            if n > 0.45:
                grid[x][y] = GRASS_FOREST

# === 第7步: 给山脉周围加森林过渡带 ===
print("第7步: 山脉森林过渡带...")

mtn_neighbor = set()
for x in range(W):
    for y in range(H):
        if grid[x][y] != SNOW_MTN:
            continue
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H:
                    if grid[nx][ny] == GRASS:
                        mtn_neighbor.add((nx, ny))

for (x, y) in mtn_neighbor:
    n = fbm(x, y, freq=0.07, s=37)
    if n > 0.5:
        grid[x][y] = GRASS_FOREST

# ═══════════════════════════════════════════════════════════════════════
# 序列化输出
# ═══════════════════════════════════════════════════════════════════════
print("序列化输出...")

# 序列化顺序：y major, x minor（与 LogicalMapData 的 idx = y*WIDTH+x 一致）
terrain_flat = [grid[x][y] for y in range(H) for x in range(W)]
assert len(terrain_flat) == W * H, f"Expected {W*H}, got {len(terrain_flat)}"

output = {"terrainGrid": terrain_flat}

OUT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "My project", "Assets", "StreamingAssets", "youzhou_map.json")
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(output, f, separators=(',', ':'))

print(f"[OK] Written: {OUT_PATH}")
print(f"     Cells: {len(terrain_flat)} ({W}x{H})")

# ── 统计 ──────────────────────────────────────────
NAMES = {
    0:'Snow', 1:'SnwForest', 2:'FrzLake', 3:'SnwRoad',
    4:'SnwTown', 5:'SnwMtn', 6:'Grass', 7:'GrsForest',
    8:'River', 9:'FrzRiver', 10:'Castle', 11:'Farmland'
}
counts = {}
for t in terrain_flat:
    counts[t] = counts.get(t, 0) + 1

print("\nTerrain distribution:")
total = len(terrain_flat)
for t in sorted(counts):
    bar = '#' * int(counts[t] / total * 40)
    print(f"  {NAMES.get(t,str(t)):12s} {counts[t]:6d} ({counts[t]/total*100:5.1f}%) {bar}")

land_inside = sum(1 for x in range(W) for y in range(H) if inside_mask[x][y])
land_outside = W * H - land_inside
print(f"\n  幽州内: {land_inside:6d} ({land_inside/total*100:.1f}%)")
print(f"  幽州外: {land_outside:6d} ({land_outside/total*100:.1f}%)")

# ═══════════════════════════════════════════════════════════════════════
# 生成预览图 (PPM 格式，不依赖 Pillow)
# ═══════════════════════════════════════════════════════════════════════
print("\n生成预览图...")

# 颜色映射 (R, G, B)
COLORS = {
    SNOW:         (214, 229, 240),
    SNOW_FOREST:  (71,  133, 85),
    FROZEN_LAKE:  (46,  98,  184),
    SNOW_ROAD:    (184, 158, 122),
    SNOW_TOWN:    (242, 192, 64),
    SNOW_MTN:     (92,  102, 140),
    GRASS:        (115, 199, 98),
    GRASS_FOREST: (46,  114, 55),
    RIVER:        (89,  160, 224),
    FROZEN_RIVER: (153, 204, 255),
    CASTLE_WALL:  (141, 98,  57),
    FARMLAND:     (217, 192, 90),
}

PREVIEW_SCALE = 4  # 每个逻辑格 = 4x4 像素
pw = W * PREVIEW_SCALE
ph = H * PREVIEW_SCALE

PREVIEW_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "tmp", "map_v4_preview.ppm")
os.makedirs(os.path.dirname(PREVIEW_PATH), exist_ok=True)

with open(PREVIEW_PATH, 'wb') as f:
    # PPM header
    f.write(f"P6\n{pw} {ph}\n255\n".encode('ascii'))
    # 注意: PPM 的 y=0 是图片顶部（北边），所以要翻转
    for py in range(ph):
        row = bytearray()
        gy = H - 1 - (py // PREVIEW_SCALE)  # 翻转 y（北在上）
        for px in range(pw):
            gx = px // PREVIEW_SCALE
            t = grid[gx][gy] if (0 <= gx < W and 0 <= gy < H) else SNOW
            r, g, b = COLORS.get(t, (128, 128, 128))
            # 在郡界上叠加深色线条
            if (gx, gy) in border_cells and grid[gx][gy] == SNOW_MTN:
                r, g, b = int(r * 0.7), int(g * 0.7), int(b * 0.7)
            # 在轮廓边界上叠加线条
            if inside_mask[gx][gy]:
                edge = False
                for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                    nx, ny = gx+dx, gy+dy
                    if 0 <= nx < W and 0 <= ny < H:
                        if not inside_mask[nx][ny]:
                            edge = True
                    elif True:
                        edge = True
                if edge and (py % PREVIEW_SCALE == 0 or px % PREVIEW_SCALE == 0):
                    r, g, b = max(0, r-60), max(0, g-60), max(0, b-60)
            row.extend([r, g, b])
        f.write(bytes(row))

print(f"[OK] Preview: {PREVIEW_PATH}")
print(f"     Size: {pw}x{ph} pixels")

# 同时生成 HTML 预览（可在浏览器中打开查看）
HTML_PATH = os.path.join(os.path.dirname(PREVIEW_PATH), "map_v4_preview.html")
# 先把颜色数据编码为 base64 PNG — 用纯 Python 写一个最简 PNG
# 实际上用 PPM 太大，改为生成一个 Canvas + JS 的 HTML

# 简单用 inline JS 绘制
region_data_json = json.dumps([region_map[x][y] for y in range(H) for x in range(W)])
terrain_data_json = json.dumps(terrain_flat)

html_content = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>幽州V4地图预览</title>
<style>
body {{ background: #1a1a2e; color: #eee; font-family: monospace; margin: 20px; }}
canvas {{ border: 1px solid #444; image-rendering: pixelated; }}
h1 {{ color: #d4a844; }}
.info {{ color: #aaa; margin: 8px 0; }}
#legend {{ display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; }}
.legend-item {{ display: flex; align-items: center; gap: 4px; }}
.legend-color {{ width: 16px; height: 16px; border: 1px solid #666; }}
</style></head>
<body>
<h1>幽州九郡 V4 地图预览</h1>
<div class="info">尺寸: {W}x{H} | 总格子: {W*H} | 缩放: 4x</div>
<div id="legend"></div>
<canvas id="map" width="{pw}" height="{ph}"></canvas>
<div class="info" id="hover">移动鼠标查看格子信息</div>
<script>
const W = {W}, H = {H}, SCALE = {PREVIEW_SCALE};
const terrain = {terrain_data_json};
const regions = {region_data_json};
const NAMES = {{0:'Snow',1:'SnwForest',2:'FrzLake',3:'SnwRoad',4:'SnwTown',5:'SnwMtn',6:'Grass',7:'GrsForest',8:'River',9:'FrzRiver',10:'Castle',11:'Farmland'}};
const RNAMES = {{0:'(外部)',1:'代郡',2:'上谷',3:'广阳',4:'渔阳',5:'右北平',6:'辽西',7:'辽东',8:'玄菟',9:'乐浪'}};
const COLORS = {{
  0:[214,229,240], 1:[71,133,85], 2:[46,98,184], 3:[184,158,122],
  4:[242,192,64], 5:[92,102,140], 6:[115,199,98], 7:[46,114,55],
  8:[89,160,224], 9:[153,204,255], 10:[141,98,57], 11:[217,192,90]
}};

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const img = ctx.createImageData({pw}, {ph});

for (let gy = 0; gy < H; gy++) {{
  for (let gx = 0; gx < W; gx++) {{
    const idx = gy * W + gx;
    const t = terrain[idx];
    const [r, g, b] = COLORS[t] || [128, 128, 128];
    const py0 = (H - 1 - gy) * SCALE;
    for (let dy = 0; dy < SCALE; dy++) {{
      for (let dx = 0; dx < SCALE; dx++) {{
        const pi = ((py0 + dy) * {pw} + gx * SCALE + dx) * 4;
        img.data[pi] = r; img.data[pi+1] = g; img.data[pi+2] = b; img.data[pi+3] = 255;
      }}
    }}
  }}
}}
ctx.putImageData(img, 0, 0);

// Legend
const legend = document.getElementById('legend');
for (const [id, name] of Object.entries(NAMES)) {{
  const c = COLORS[id] || [128,128,128];
  const el = document.createElement('div');
  el.className = 'legend-item';
  el.innerHTML = '<div class="legend-color" style="background:rgb('+c.join(',')+')"></div>' + name;
  legend.appendChild(el);
}}

// Hover
canvas.addEventListener('mousemove', e => {{
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const gx = Math.floor(mx / SCALE), gy = H - 1 - Math.floor(my / SCALE);
  if (gx >= 0 && gx < W && gy >= 0 && gy < H) {{
    const idx = gy * W + gx;
    const t = terrain[idx], r = regions[idx];
    document.getElementById('hover').textContent =
      'x=' + gx + ' y=' + gy + ' | 地形: ' + NAMES[t] + ' | 郡: ' + RNAMES[r];
  }}
}});
</script>
</body></html>"""

with open(HTML_PATH, 'w', encoding='utf-8') as f:
    f.write(html_content)
print(f"[OK] HTML Preview: {HTML_PATH}")

# ── ASCII 预览 ────────────────────────────────────
CHARS = {0:'.', 1:'f', 2:'~', 3:'+', 4:'C', 5:'^',
         6:',', 7:'F', 8:'r', 9:'R', 10:'#', 11:'='}
STEP_X = max(1, W // 95)
STEP_Y = max(1, H // 40)

print(f"\nASCII Preview (W={W} H={H}, step {STEP_X}x{STEP_Y}):")
print("  N" + " " * (W // STEP_X // 2) + "^")
for y in range(H - 1, -1, -STEP_Y):
    row = "".join(CHARS.get(grid[x][y], '?') for x in range(0, W, STEP_X))
    print(f"y{y:3d}|{row}|")
print("  " + "W<" + "-" * (W // STEP_X // 2) + ">E")

print(f"\n生成完成！")
print(f"  地图文件: {OUT_PATH}")
print(f"  PPM预览:  {PREVIEW_PATH}")
print(f"  HTML预览: {HTML_PATH}")
