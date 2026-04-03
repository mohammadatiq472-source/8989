"""
generate_youzhou_map_v3.py — 幽州地图精确地理版 v3
===================================================
参照三张地图图像分析：
  1. 东汉幽州刺史部历史行政地图
  2. 幽州轮廓/郡界图
  3. 东汉十三州地形图（高程色彩）

坐标系 (380×270 逻辑格):
  x=0 → 西 ≈ 113°E   x=380 → 东 ≈ 131°E   (≈21.1格/°)
  y=0 → 南 ≈ 37°N    y=270 → 北 ≈ 46°N    (≈30格/°)

地形代码（严格对应 TerrainType.cs）:
  Snow=0  SnowForest=1  FrozenLake=2  SnowRoad=3  SnowTown=4
  SnowMountain=5  Grass=6  GrassForest=7  River=8  FrozenRiver=9
  CastleWall=10  Farmland=11
"""

import json, math, os

W, H = 380, 270

SNOW         = 0
SNOW_FOREST  = 1
FROZEN_LAKE  = 2   # 渤海 / 海洋
SNOW_ROAD    = 3
SNOW_TOWN    = 4
SNOW_MTN     = 5
GRASS        = 6
GRASS_FOREST = 7
RIVER        = 8
FROZEN_RIVER = 9
CASTLE_WALL  = 10
FARMLAND     = 11

LON0, LON1 = 113.0, 131.0
LAT0, LAT1 = 37.0,  46.0

def gx(lo): return max(0, min(W-1, int((lo - LON0) / (LON1 - LON0) * W)))
def gy(la): return max(0, min(H-1, int((la - LAT0) / (LAT1 - LAT0) * H)))
def lonlat(x, y): return LON0 + x/W*(LON1-LON0), LAT0 + y/H*(LAT1-LAT0)

# ─── 确定性 FBM 噪声（无 numpy 依赖）─────────────────────────────────

def _h(x, y, s=0):
    """整数坐标的哈希值 → 0.0-1.0"""
    v = (int(x) * 1664525 + int(y) * 1013904223 + int(s) * 22695477) & 0x7FFFFFFF
    return v / 0x7FFFFFFF

def _lerp(a, b, t):
    u = t * t * (3 - 2 * t)   # smoothstep
    return a + (b - a) * u

def vnoise(px, py, s=0):
    ix, iy = int(math.floor(px)), int(math.floor(py))
    fx, fy = px - ix, py - iy
    return _lerp(
        _lerp(_h(ix, iy, s),   _h(ix+1, iy, s),   fx),
        _lerp(_h(ix, iy+1, s), _h(ix+1, iy+1, s), fx),
        fy
    )

def fbm(x, y, octaves=4, freq=0.02, s=0):
    v, amp, tot = 0.0, 1.0, 0.0
    for _ in range(octaves):
        v   += vnoise(x * freq, y * freq, s) * amp
        tot += amp
        amp *= 0.5
        freq *= 2
    return v / tot  # 0 → 1

# ─── 网格 ─────────────────────────────────────────────────────────────
grid = [[SNOW] * H for _ in range(W)]

def st(x, y, t):
    if 0 <= x < W and 0 <= y < H:
        grid[x][y] = t

def gt(x, y):
    if 0 <= x < W and 0 <= y < H: return grid[x][y]
    return -1

# ═══════════════════════════════════════════════════════════════════════
# 第1步：全图基础地形
#   南部(y<180, lat<43°N)：雪地主色调（冬季幽州）
#   北部(y>200, lat>43.7°N)：鲜卑草原
# ═══════════════════════════════════════════════════════════════════════
for x in range(W):
    for y in range(H):
        lo, la = lonlat(x, y)
        n = fbm(x, y, octaves=3, freq=0.015, s=1)
        if la > 43.5 + n * 0.6:
            grid[x][y] = GRASS
        elif la > 42.8 + n * 0.4:
            grid[x][y] = GRASS if n > 0.45 else SNOW

# ═══════════════════════════════════════════════════════════════════════
# 第2步：渤海 + 外海
#   渤海主体：椭圆，中心约 119.3°E 38.7°N
#   辽东湾：北凸延伸，约 121°E 40.4°N
#   朝鲜湾：东南方向，约 124-127°E 南边缘
# ═══════════════════════════════════════════════════════════════════════
for x in range(W):
    for y in range(H):
        lo, la = lonlat(x, y)
        n = fbm(x, y, octaves=3, freq=0.04, s=42) * 0.3  # 海岸噪声 ±0.15°

        # -- 渤海主体（大椭圆）--
        cx, cy = 119.3, 38.75
        rx, ry = 2.15 + n * 0.4,  1.75 + n * 0.3
        if ((lo - cx) / rx)**2 + ((la - cy) / ry)**2 < 1.0:
            grid[x][y] = FROZEN_LAKE; continue

        # -- 辽东湾（北凸）--
        cx2, cy2 = 121.15, 40.45
        rx2, ry2 = 0.85 + n*0.2, 0.75 + n*0.2
        if ((lo - cx2) / rx2)**2 + ((la - cy2) / ry2)**2 < 1.0:
            grid[x][y] = FROZEN_LAKE; continue

        # -- 渤海海峡（南开口）--
        cx3, cy3 = 121.0, 37.6
        if ((lo - cx3) / 0.7)**2 + ((la - cy3) / 0.65)**2 < 1.0:
            grid[x][y] = FROZEN_LAKE; continue

        # -- 朝鲜湾 / 乐浪南海 --
        if 123.5 < lo < 127.8 and la < 38.0 + n * 0.3:
            grid[x][y] = FROZEN_LAKE; continue

        # -- 地图最南边（37-37.5°N）宽幅海岸 --
        if la < 37.3 + n * 0.25 and 118.5 < lo < 127.0:
            grid[x][y] = FROZEN_LAKE

# ═══════════════════════════════════════════════════════════════════════
# 第3步：辽东半岛（陆地覆盖回海洋）
#   121°E-122.6°E，38.8°N-40.6°N
#   南尖大连：121.6°E, 38.9°N
# ═══════════════════════════════════════════════════════════════════════
for x in range(W):
    for y in range(H):
        if grid[x][y] != FROZEN_LAKE:
            continue
        lo, la = lonlat(x, y)
        n = fbm(x, y, octaves=2, freq=0.05, s=7) * 0.15

        is_land = False

        # 北段（辽阳平原延伸入半岛）
        if 120.7 <= lo <= 122.5 and 40.0 <= la <= 40.65:
            is_land = True

        # 半岛主体（中段）
        cx, cy = 121.9, 39.75
        if ((lo - cx) / (0.65 + n))**2 + ((la - cy) / (0.55 + n))**2 < 1.0:
            is_land = True

        # 半岛南端（大连）
        half_w = 0.28 + (la - 38.78) * 0.28 + n
        if 38.78 <= la <= 39.4 and abs(lo - 121.72) < half_w:
            is_land = True

        if is_land:
            grid[x][y] = SNOW

# ═══════════════════════════════════════════════════════════════════════
# 第4步：太行山 / 西部边界山地
#   太行山：113°-115°E，南北延伸
#   代郡西侧高山：113°E-114.5°E, 40°-42°N
# ═══════════════════════════════════════════════════════════════════════
for x in range(W):
    for y in range(H):
        if grid[x][y] == FROZEN_LAKE: continue
        lo, la = lonlat(x, y)
        n = fbm(x, y, octaves=3, freq=0.04, s=9)
        # 太行山主脉（113-114.8°E)
        taihang_limit = 114.5 + n * 0.7
        if lo < taihang_limit:
            grid[x][y] = SNOW_MTN

# ═══════════════════════════════════════════════════════════════════════
# 第5步：燕山山脉
#   主脊走向：由西北→东南，参考等高线图
#   西段（113-117°E）：较高，脊线 lat ≈ 40.7-41.2°N
#   东段（117-122°E）：稍低，脊线 lat ≈ 41.2-41.8°N
# ═══════════════════════════════════════════════════════════════════════
for x in range(W):
    for y in range(H):
        if grid[x][y] == FROZEN_LAKE: continue
        lo, la = lonlat(x, y)
        n  = fbm(x, y, octaves=4, freq=0.025, s=11)
        n2 = fbm(x + 100, y + 100, octaves=3, freq=0.05, s=13) * 0.5 - 0.25

        if 114.2 <= lo <= 122.2:
            # 脊线纬度（随经度漂移 + 噪声扰动）
            if lo <= 117.0:
                ridge = 40.75 + (lo - 114.2) * 0.06 + n2 * 0.3
                half  = 0.85 + n * 0.3
            else:
                ridge = 41.05 + (lo - 117.0) * 0.08 + n2 * 0.25
                half  = 0.70 + n * 0.25

            dist = abs(la - ridge)
            if dist < half:
                intensity = 1.0 - dist / half
                if intensity > 0.25:
                    grid[x][y] = SNOW_MTN
                elif grid[x][y] == SNOW and intensity > 0.0:
                    grid[x][y] = SNOW_FOREST

# ═══════════════════════════════════════════════════════════════════════
# 第6步：辽东 / 长白山 / 朝鲜山地
#   长白山系：122°E+, 40°N+ 的大片山区
#   朝鲜半岛：124°E+，多山
# ═══════════════════════════════════════════════════════════════════════
for x in range(W):
    for y in range(H):
        if grid[x][y] == FROZEN_LAKE: continue
        lo, la = lonlat(x, y)
        n = fbm(x, y, octaves=4, freq=0.028, s=17)

        # 辽宁东部山地（122-125°E, 40-44°N）
        if 122.0 <= lo <= 125.5 and 40.0 <= la <= 44.0:
            if n > 0.52: grid[x][y] = SNOW_MTN
            elif n > 0.35 and grid[x][y] == SNOW:
                grid[x][y] = SNOW_FOREST

        # 长白山主体（124-128°E, 41-44°N）
        if 123.5 <= lo <= 128.0 and 41.0 <= la <= 44.5:
            if n > 0.38: grid[x][y] = SNOW_MTN

        # 朝鲜半岛脊梁（125°E+, 37-43°N）
        if lo > 125.0 and la < 43.0:
            if n > 0.42:
                grid[x][y] = SNOW_MTN
            elif lo > 128.5 and n > 0.25:
                grid[x][y] = SNOW_MTN  # 太白山脉（东侧）更密

# ═══════════════════════════════════════════════════════════════════════
# 第7步：辽东平原（恢复为平地）
#   辽阳—沈阳—铁岭走廊：121-124°E, 41-43°N
# ═══════════════════════════════════════════════════════════════════════
for x in range(W):
    for y in range(H):
        if grid[x][y] == FROZEN_LAKE: continue
        lo, la = lonlat(x, y)
        n = fbm(x, y, octaves=3, freq=0.025, s=19) * 0.2 - 0.1  # ±0.1° 扰动
        # 辽东核心平原
        cx, cy = 122.5, 41.8
        dist = ((lo - cx) / (1.5 + n))**2 + ((la - cy) / (1.2 + n))**2
        if dist < 1.0 and grid[x][y] == SNOW_MTN:
            grid[x][y] = SNOW

# ═══════════════════════════════════════════════════════════════════════
# 第8步：幽州核心平原农田化
#   燕山以南，渤海以北：涿郡、广阳、渔阳
#   115-120°E, 39-40.5°N
# ═══════════════════════════════════════════════════════════════════════
for x in range(W):
    for y in range(H):
        if grid[x][y] not in (SNOW, SNOW_FOREST): continue
        lo, la = lonlat(x, y)
        n = fbm(x, y, octaves=3, freq=0.04, s=21)
        # 幽州农业核心区
        if 115.0 <= lo <= 120.5 and 39.0 <= la <= 40.8:
            if grid[x][y] == SNOW and n > 0.55:
                grid[x][y] = FARMLAND

# ═══════════════════════════════════════════════════════════════════════
# 第9步：山地边缘森林（雪地森林过渡带）
# ═══════════════════════════════════════════════════════════════════════
# 标记山地邻近的平地格子
border_snow = set()
for x in range(W):
    for y in range(H):
        if grid[x][y] != SNOW_MTN: continue
        for dx in range(-4, 5):
            for dy in range(-4, 5):
                nx, ny = x+dx, y+dy
                if 0 <= nx < W and 0 <= ny < H and grid[nx][ny] == SNOW:
                    border_snow.add((nx, ny))

for (x, y) in border_snow:
    n = fbm(x, y, freq=0.06, s=23)
    if n > 0.45:
        grid[x][y] = SNOW_FOREST

# ═══════════════════════════════════════════════════════════════════════
# 第10步：北方草原（草地森林点缀）
# ═══════════════════════════════════════════════════════════════════════
for x in range(W):
    for y in range(200, H):
        if grid[x][y] == GRASS:
            n = fbm(x, y, freq=0.04, s=25)
            if n > 0.58: grid[x][y] = GRASS_FOREST
        # 北方山地中间的草甸
        elif grid[x][y] == SNOW and y > 220:
            n = fbm(x, y, freq=0.03, s=27)
            if n > 0.4: grid[x][y] = GRASS

# ═══════════════════════════════════════════════════════════════════════
# 第11步：河流系统（精确参照历史河道）
# ═══════════════════════════════════════════════════════════════════════

def draw_river(waypoints, terrain=FROZEN_RIVER, thick=1):
    """按折线段画河流，不覆盖海洋"""
    for i in range(len(waypoints) - 1):
        x0, y0 = waypoints[i]
        x1, y1 = waypoints[i + 1]
        steps = max(abs(x1-x0), abs(y1-y0), 1)
        for s in range(steps + 1):
            rx = round(x0 + (x1-x0) * s / steps)
            ry = round(y0 + (y1-y0) * s / steps)
            for dx in range(-(thick//2), thick//2 + 1):
                for dy in range(-((thick-1)//2), (thick-1)//2 + 1):
                    nx, ny = rx+dx, ry+dy
                    if 0 <= nx < W and 0 <= ny < H:
                        if grid[nx][ny] != FROZEN_LAKE:
                            grid[nx][ny] = terrain

# 滦河（Luan River）：发源燕山→东南入渤海
# 源：117.4°E, 41.6°N → 承德 → 秦皇岛 119.6°E, 39.9°N
draw_river([
    (gx(117.4), gy(41.5)), (gx(117.7), gy(41.0)),
    (gx(118.0), gy(40.6)), (gx(118.8), gy(40.2)),
    (gx(119.2), gy(39.9)), (gx(119.6), gy(39.4)),
], RIVER, thick=2)

# 潮白河/白河：北京东北，燕山→通州
draw_river([
    (gx(116.7), gy(40.9)), (gx(116.8), gy(40.5)),
    (gx(117.0), gy(40.1)), (gx(117.2), gy(39.7)),
], RIVER, thick=1)

# 永定河前身（桑干河）：代郡→蓟县
draw_river([
    (gx(114.0), gy(40.1)), (gx(114.8), gy(39.9)),
    (gx(115.6), gy(39.7)), (gx(116.3), gy(39.5)),
], RIVER, thick=1)

# 大凌河（辽西走廊关键水系）
draw_river([
    (gx(120.0), gy(41.8)), (gx(120.2), gy(41.4)),
    (gx(120.5), gy(41.1)), (gx(121.0), gy(40.7)),
], RIVER, thick=2)

# 辽河主干（最重要！）：中国东北第一大河
# 发源长白山西，经铁岭→沈阳→盘锦入辽东湾
draw_river([
    (gx(123.5), gy(43.2)), (gx(123.0), gy(42.7)),
    (gx(122.8), gy(42.2)), (gx(122.5), gy(41.8)),
    (gx(122.2), gy(41.4)), (gx(122.0), gy(41.1)),
    (gx(121.8), gy(40.8)),
], FROZEN_RIVER, thick=2)

# 浑河（辽河支流，流经沈阳）
draw_river([
    (gx(123.8), gy(41.9)), (gx(123.4), gy(41.7)),
    (gx(123.0), gy(41.5)), (gx(122.6), gy(41.3)),
    (gx(122.3), gy(41.1)),  # 汇入辽河附近
], RIVER, thick=1)

# 太子河（辽东，辽阳）
draw_river([
    (gx(124.0), gy(41.3)), (gx(123.5), gy(41.2)),
    (gx(123.0), gy(41.2)), (gx(122.7), gy(41.2)),
], RIVER, thick=1)

# 大同江前身（朝鲜半岛，乐浪郡核心水系）
draw_river([
    (gx(127.0), gy(40.2)), (gx(126.5), gy(39.8)),
    (gx(126.0), gy(39.5)), (gx(125.8), gy(39.1)),
], RIVER, thick=1)

# ═══════════════════════════════════════════════════════════════════════
# 第12步：主要郡治城市
#   参照历史：12郡 + 重要县城
# ═══════════════════════════════════════════════════════════════════════

CITIES = [
    # (lon, lat, name,  terrain,  r_farmland)
    # 七个核心郡治
    (113.6, 40.4, "代郡·代县",   SNOW_TOWN,  2),   # 今蔚县
    (115.5, 40.5, "上谷·沮阳",   SNOW_TOWN,  2),   # 今怀来
    (116.4, 39.9, "广阳·蓟县",   SNOW_TOWN,  4),   # 幽州治所·今北京 ★
    (116.9, 40.6, "渔阳·渔阳",   SNOW_TOWN,  3),   # 今密云
    (118.4, 40.5, "右北平·平刚", SNOW_TOWN,  2),   # 今平泉
    (120.8, 41.2, "辽西·阳乐",   SNOW_TOWN,  2),   # 今义县
    (122.7, 41.3, "辽东·襄平",   SNOW_TOWN,  3),   # 今辽阳 ★
    (123.4, 41.8, "玄菟·高句骊", SNOW_TOWN,  2),   # 今新宾
    (125.8, 39.0, "乐浪·朝鲜",   SNOW_TOWN,  3),   # 今平壤 ★
    # 其他重要地点
    (116.2, 39.6, "涿郡·涿县",   FARMLAND,   3),   # 刘备故乡 ★
    (116.0, 40.4, "范阳",         FARMLAND,   2),
    (121.1, 41.1, "辽西·徒河",   SNOW_TOWN,  2),   # 锦州附近
    (122.5, 41.3, "辽队",         SNOW_TOWN,  1),
    (115.9, 40.8, "渔阳·密云",   SNOW_TOWN,  2),
    (114.5, 41.1, "代郡·马城",   CASTLE_WALL, 1),  # 要塞
    (119.8, 40.7, "辽西·令支",   SNOW_TOWN,  2),
]

for lo, la, name, t, r in CITIES:
    cx, cy = gx(lo), gy(la)
    if not (0 <= cx < W and 0 <= cy < H): continue
    if grid[cx][cy] == FROZEN_LAKE: continue

    # 城周农田圈
    for dx in range(-r-1, r+2):
        for dy in range(-r-1, r+2):
            nx, ny = cx+dx, cy+dy
            if not (0 <= nx < W and 0 <= ny < H): continue
            if grid[nx][ny] in (SNOW, SNOW_FOREST, GRASS):
                if abs(dx)+abs(dy) <= r + 1:
                    grid[nx][ny] = FARMLAND

    # 城市核心（最高优先级，最后设置）
    grid[cx][cy] = t

# ═══════════════════════════════════════════════════════════════════════
# 第13步：驿道（辽西走廊大道）
# ═══════════════════════════════════════════════════════════════════════

ROADS = [
    # 幽州主驿道（蓟县→代郡）
    [(gx(116.4),gy(39.9)), (gx(115.5),gy(40.2)), (gx(114.5),gy(40.3)), (gx(113.6),gy(40.4))],
    # 蓟县→右北平→辽西→辽东（辽西走廊）
    [(gx(116.4),gy(39.9)), (gx(116.9),gy(40.6)), (gx(118.4),gy(40.5)),
     (gx(119.8),gy(40.7)), (gx(120.8),gy(41.2)), (gx(121.1),gy(41.1)),
     (gx(122.0),gy(41.2)), (gx(122.7),gy(41.3))],
    # 辽东→玄菟→北部
    [(gx(122.7),gy(41.3)), (gx(123.1),gy(41.5)), (gx(123.4),gy(41.8))],
    # 涿郡→蓟县
    [(gx(116.2),gy(39.6)), (gx(116.4),gy(39.9))],
    # 蓟县→乐浪（间接道路，沿海岸）
    [(gx(122.7),gy(41.3)), (gx(123.5),gy(40.8)), (gx(124.5),gy(39.8)),
     (gx(125.2),gy(39.3)), (gx(125.8),gy(39.0))],
]

for road_pts in ROADS:
    for i in range(len(road_pts) - 1):
        x0, y0 = road_pts[i]
        x1, y1 = road_pts[i+1]
        steps = max(abs(x1-x0), abs(y1-y0), 1)
        for s in range(steps + 1):
            rx = round(x0 + (x1-x0) * s / steps)
            ry = round(y0 + (y1-y0) * s / steps)
            if 0 <= rx < W and 0 <= ry < H:
                if grid[rx][ry] not in (FROZEN_LAKE, SNOW_TOWN, FARMLAND, CASTLE_WALL):
                    grid[rx][ry] = SNOW_ROAD

# ═══════════════════════════════════════════════════════════════════════
# 第14步：孤岛 / 孤海清理
#   去除被陆地包围的孤立海格（内陆湖除外）
#   去除完全被海包围的孤立单格陆地
# ═══════════════════════════════════════════════════════════════════════

def count_same_neighbors(x, y, t):
    c = 0
    for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
        nx, ny = x+dx, y+dy
        if nx < 0 or nx >= W or ny < 0 or ny >= H:
            c += 1  # 边界算相同类型
        elif grid[nx][ny] == t:
            c += 1
    return c

for _ in range(3):
    changes = []
    for x in range(1, W-1):
        for y in range(1, H-1):
            # 孤立陆地格（4邻居全是海）
            if grid[x][y] != FROZEN_LAKE:
                if count_same_neighbors(x, y, FROZEN_LAKE) == 4:
                    changes.append((x, y, FROZEN_LAKE))
    for x, y, t in changes:
        grid[x][y] = t

# ═══════════════════════════════════════════════════════════════════════
# 第15步：序列化输出
# ═══════════════════════════════════════════════════════════════════════

# 序列化顺序：y major, x minor（与 LogicalMapData 的 idx = y*WIDTH+x 一致）
terrain_flat = [grid[x][y] for y in range(H) for x in range(W)]
assert len(terrain_flat) == W * H, f"Expected {W*H}, got {len(terrain_flat)}"

output = {"terrainGrid": terrain_flat}

OUT_PATH = r"C:\Users\Buffoon Queer\Desktop\8989\My project\Assets\StreamingAssets\youzhou_map.json"
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
    bar = '█' * int(counts[t] / total * 40)
    print(f"  {NAMES.get(t,str(t)):12s} {counts[t]:6d} ({counts[t]/total*100:5.1f}%) {bar}")

land = sum(v for k, v in counts.items() if k != FROZEN_LAKE)
sea  = counts.get(FROZEN_LAKE, 0)
print(f"\n  陆地合计: {land:6d} ({land/total*100:.1f}%)")
print(f"  海洋合计: {sea:6d} ({sea/total*100:.1f}%)")

# ── ASCII 预览（y↑北, 每4格一字符）───────────────
CHARS = {0:'.', 1:'f', 2:'~', 3:'+', 4:'C', 5:'^',
         6:',', 7:'F', 8:'r', 9:'R', 10:'#', 11:'='}
STEP_X = max(1, W // 95)
STEP_Y = max(1, H // 45)

print(f"\nASCII Preview (W={W} H={H}, step {STEP_X}x{STEP_Y}):")
print("  N" + " " * (W // STEP_X // 2) + "↑")
for y in range(H - 1, -1, -STEP_Y):
    row = "".join(CHARS.get(grid[x][y], '?') for x in range(0, W, STEP_X))
    print(f"y{y:3d}|{row}|")
print("  " + "W←" + "─" * (W // STEP_X // 2) + "→E")
print(f"\n生成完成！地图文件: {OUT_PATH}")
