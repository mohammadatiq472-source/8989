"""
generate_youzhou_map_v2.py
精准幽州地图生成器（380x270 逻辑格子）

基于东汉/三国时期幽州地理参考：
  - 幽州主体：今河北北部 + 北京 + 辽宁
  - 辽东半岛向南延伸入渤海
  - 乐浪郡（今朝鲜北部）在半岛东侧
  - 西北部燕山山脉：雪山地形
  - 辽东北部：山地
  - 中部：平原(snow)
  - 南/东南：渤海(FrozenLake)
  - 河流：辽河、滦河等

坐标系说明（380x270 逻辑格）：
  - X 轴向右 = 东方
  - Y 轴向上 = 北方
  - 等距视图中：右上=东北，左上=西北，右下=东南，左下=西南

地形枚举（与 TerrainType.cs 对应）：
  Snow=0, SnowForest=1, FrozenLake=2, SnowRoad=3,
  SnowTown=4, SnowMountain=5, Grass=6, GrassForest=7,
  River=8, FrozenRiver=9, CastleWall=10, Farmland=11
"""

import json
import math
import os

W, H = 380, 270

# Terrain type constants
SNOW         = 0
SNOW_FOREST  = 1
FROZEN_LAKE  = 2  # 渤海（冰封海洋）
SNOW_ROAD    = 3
SNOW_TOWN    = 4
SNOW_MOUNTAIN= 5
GRASS        = 6
GRASS_FOREST = 7
RIVER        = 8
FROZEN_RIVER = 9
CASTLE_WALL  = 10
FARMLAND     = 11

grid = [[FROZEN_LAKE] * H for _ in range(W)]  # 默认全海

def set_rect(x0, y0, x1, y1, t):
    for x in range(max(0,x0), min(W,x1)):
        for y in range(max(0,y0), min(H,y1)):
            grid[x][y] = t

def set_ellipse(cx, cy, rx, ry, t, only_if=None):
    for x in range(max(0, cx-rx-1), min(W, cx+rx+2)):
        for y in range(max(0, cy-ry-1), min(H, cy+ry+2)):
            if ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1.0:
                if only_if is None or grid[x][y] == only_if:
                    grid[x][y] = t

def fill_if(condition_fn, t):
    for x in range(W):
        for y in range(H):
            if condition_fn(x, y):
                grid[x][y] = t

# ══════════════════════════════════════════════════════
# 1. 幽州主体陆地（以地图左上区域为主体）
#    参考历史地理：幽州占据地图中心偏左，南边/东边是渤海
# ══════════════════════════════════════════════════════

# 主陆地区域：X:[8,80], Y:[30,100] = 西(左)到东(右,无半岛), 南到北
# 形状描述：梯形，北宽南窄，西侧更高
def main_land(x, y):
    # 主陆地区域（幽州核心：蓟县、幽燕平原）
    # 北边（y=60-100）: X从10到75（较宽）
    # 南边（y=30-60）: X从12到65（较窄，南边是海岸线）
    if y < 30 or y > 98: return False
    # 北边界随y变化：越往北越宽
    left = 8 + max(0, (50-y)//3)
    right = 78 - max(0, (50-y)//4)
    if y < 45:  # 南边开始收窄（海岸线）
        left = 12 + (45-y) // 2
        right = 68 - (45-y) // 2
    return left <= x <= right

fill_if(main_land, SNOW)

# ══════════════════════════════════════════════════════
# 2. 辽东半岛（向东南延伸）
#    参考：今辽宁省东南部，突入渤海
# ══════════════════════════════════════════════════════

def liaodong_peninsula(x, y):
    # 辽东主体（辽东、玄菟郡）X:62-82, Y:45-80
    if 62 <= x <= 82 and 45 <= y <= 80:
        # 东侧（x>72）南边界稍高
        south_limit = 45 + (x-62)*0.3
        return y >= south_limit
    # 辽东半岛延伸部分（X:65-78, Y:28-50）- 往南伸入渤海
    if 65 <= x <= 78 and 28 <= y <= 50:
        # 半岛形状：越往南越窄
        center_x = 71
        half_width = max(1, 6 - (50-y)//4)
        return abs(x - center_x) <= half_width
    return False

fill_if(liaodong_peninsula, SNOW)

# 辽东半岛与主体连接（渤海西海岸：Y:45-65, X:60-68）
set_rect(58, 45, 70, 68, SNOW)

# ══════════════════════════════════════════════════════
# 3. 乐浪郡（朝鲜半岛西北，在辽东半岛东侧）
#    参考：今朝鲜平壤附近，东汉幽州东最远处
# ══════════════════════════════════════════════════════

def lelang(x, y):
    # 乐浪郡：X:80-92, Y:38-65 - 小块半岛状延伸
    if not (80 <= x <= 92 and 38 <= y <= 65): return False
    # 形状：类似小半岛，北宽南窄
    north_full = y >= 55
    mid_taper = 52 <= y < 55 and x <= 90
    south_tip = 40 <= y < 52 and x <= 87 - (52-y)
    small_tip = 38 <= y < 40 and x <= 84
    return north_full or mid_taper or south_tip or small_tip

fill_if(lelang, SNOW)

# ══════════════════════════════════════════════════════
# 4. 北方边境补充（右北平、辽西走廊）X:42-62, Y:75-100
# ══════════════════════════════════════════════════════
set_rect(42, 72, 62, 100, SNOW)  # 辽西走廊（连接幽州主体和辽东）
set_rect(10, 85, 48, 102, SNOW)  # 北方草原/渔阳、上谷
set_rect(8, 60, 18, 88, SNOW)    # 西北（代郡）

# ══════════════════════════════════════════════════════
# 5. 地形细化：雪山（燕山、辽东北山）
# ══════════════════════════════════════════════════════

# 西北部燕山：X:8-30, Y:72-100
def yanshan(x, y):
    if not (8 <= x <= 32 and 72 <= y <= 100): return False
    # 山脉起伏：中间最高，和草原交界处有过渡
    intensity = (x - 8) / 24 * (1 - (y - 72) / 28 * 0.3)
    return intensity > 0.3

fill_if(yanshan, SNOW_MOUNTAIN)

# 代郡西侧高山：X:8-14, Y:60-80
set_rect(8, 62, 14, 82, SNOW_MOUNTAIN)

# 辽东北部山地：X:62-82, Y:78-100
def liaodong_mountains(x, y):
    if not (60 <= x <= 80 and 78 <= y <= 100): return False
    return True

fill_if(liaodong_mountains, SNOW_MOUNTAIN)

# 右北平北山：X:45-62, Y:88-100
set_rect(45, 88, 65, 102, SNOW_MOUNTAIN)

# ══════════════════════════════════════════════════════
# 6. 森林（雪地森林：渔阳、右北平平原与山地之间）
# ══════════════════════════════════════════════════════

def snow_forest(x, y):
    # 山地与平原之间的过渡区（雪地+树）
    if 14 <= x <= 30 and 65 <= y <= 85 and grid[x][y] == SNOW:
        return True
    if 40 <= x <= 60 and 78 <= y <= 88 and grid[x][y] == SNOW:
        return True
    if 65 <= x <= 78 and 65 <= y <= 78 and grid[x][y] == SNOW:
        return True
    return False

fill_if(snow_forest, SNOW_FOREST)

# ══════════════════════════════════════════════════════
# 7. 河流
#    辽河：从辽东北部山地向南汇入辽东湾
#    滦河：从燕山向南汇入渤海
# ══════════════════════════════════════════════════════

def draw_river(points, terrain=FROZEN_RIVER):
    """沿折线画1格宽河流"""
    for i in range(len(points)-1):
        x0,y0 = points[i]; x1,y1 = points[i+1]
        steps = max(abs(x1-x0), abs(y1-y0))
        if steps == 0: continue
        for s in range(steps+1):
            rx = round(x0 + (x1-x0)*s/steps)
            ry = round(y0 + (y1-y0)*s/steps)
            if 0 <= rx < W and 0 <= ry < H and grid[rx][ry] != FROZEN_LAKE:
                grid[rx][ry] = terrain

# 辽河主干：从北部山地(70,90)→(70,75)→(68,60)→(65,48)→入海
draw_river([(70,95),(70,78),(68,62),(65,48)], FROZEN_RIVER)

# 辽河支流（西辽河）：X方向延伸
draw_river([(55,85),(60,85),(65,82),(68,78)], RIVER)

# 滦河：从燕山(22,85)→(22,70)→(20,55)→(18,42)→入海
draw_river([(22,85),(22,68),(20,55),(18,42)], RIVER)

# 潮白河：(30,75)→(28,62)→(27,50)
draw_river([(30,75),(28,62),(27,50)], RIVER)

# ══════════════════════════════════════════════════════
# 8. 城池：幽州12大郡治
# ══════════════════════════════════════════════════════

cities = [
    # (x, y, name)   - 这里只标注地形，实际城市由CitySystem处理
    (25, 55, "蓟县",    SNOW_TOWN),   # 幽州治所（今北京）
    (18, 65, "广阳郡",  SNOW_TOWN),   # 今北京附近
    (35, 70, "渔阳郡",  SNOW_TOWN),   # 今密云附近
    (48, 80, "右北平",  SNOW_TOWN),   # 今平泉
    (55, 75, "辽西郡",  SNOW_TOWN),   # 今朝阳
    (68, 70, "辽东郡",  SNOW_TOWN),   # 今辽阳
    (75, 58, "玄菟郡",  SNOW_TOWN),   # 今沈阳附近
    (83, 52, "乐浪郡",  SNOW_TOWN),   # 今平壤
    (12, 72, "代郡",    SNOW_TOWN),   # 今蔚县
    (22, 75, "上谷郡",  SNOW_TOWN),   # 今张家口
    (30, 58, "涿郡",    FARMLAND),    # 今涿州（刘备故乡！）
    (25, 65, "范阳",    FARMLAND),    # 今涿州北（诸葛亮祖地）
]

for cx, cy, name, terrain in cities:
    if 0 <= cx < W and 0 <= cy < H and grid[cx][cy] != FROZEN_LAKE:
        # 城池本身
        grid[cx][cy] = terrain
        # 周边农田
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                nx, ny = cx+dx, cy+dy
                if 0 <= nx < W and 0 <= ny < H:
                    if grid[nx][ny] == SNOW and abs(dx)+abs(dy) <= 3:
                        grid[nx][ny] = FARMLAND

# ══════════════════════════════════════════════════════
# 9. 道路（连接主要城市）
# ══════════════════════════════════════════════════════

road_segments = [
    # 蓟县→广阳→上谷→代郡
    [(25,55),(22,60),(18,65),(15,70),(12,72)],
    # 蓟县→渔阳→右北平→辽西
    [(25,55),(30,63),(35,70),(42,76),(48,80),(55,78),(55,75)],
    # 辽西→辽东→玄菟
    [(55,75),(62,72),(68,70),(72,65),(75,58)],
]

for road in road_segments:
    draw_river(road, SNOW_ROAD)
# 道路不能画在海里
for x in range(W):
    for y in range(H):
        if grid[x][y] == SNOW_ROAD and (
            (x > 0 and grid[x-1][y] == FROZEN_LAKE and
             x < W-1 and grid[x+1][y] == FROZEN_LAKE) or
            (y > 0 and grid[x][y-1] == FROZEN_LAKE and
             y < H-1 and grid[x][y+1] == FROZEN_LAKE)
        ):
            grid[x][y] = SNOW  # 清除孤立的海中路

# ══════════════════════════════════════════════════════
# 10. 海岸线修整（确保过渡自然）
#     孤岛（全被海包围的单个陆地格）清除
# ══════════════════════════════════════════════════════

def count_sea_neighbors(x, y):
    count = 0
    for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
        nx, ny = x+dx, y+dy
        if nx < 0 or nx >= W or ny < 0 or ny >= H:
            count += 1
        elif grid[nx][ny] == FROZEN_LAKE:
            count += 1
    return count

# 多次迭代清除太孤立的小块
for _ in range(3):
    changed = []
    for x in range(W):
        for y in range(H):
            if grid[x][y] != FROZEN_LAKE:
                if count_sea_neighbors(x, y) >= 4:
                    changed.append((x, y))
    for x, y in changed:
        grid[x][y] = FROZEN_LAKE

# ══════════════════════════════════════════════════════
# 11. 序列化输出
# ══════════════════════════════════════════════════════

terrain_grid = []
for y in range(H):
    for x in range(W):
        terrain_grid.append(grid[x][y])

output = {"terrainGrid": terrain_grid}

out_path = r'C:\Users\Buffoon Queer\Desktop\8989\My project\Assets\StreamingAssets\youzhou_map.json'
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(output, f)
print(f"Written: {out_path} ({len(terrain_grid)} values)")

# 统计地形分布
counts = {}
for t in terrain_grid:
    counts[t] = counts.get(t, 0) + 1

names = {0:'Snow',1:'SnowForest',2:'FrozenLake',3:'SnowRoad',4:'SnowTown',
         5:'SnowMountain',6:'Grass',7:'GrassForest',8:'River',9:'FrozenRiver',
         10:'CastleWall',11:'Farmland'}

print("\nTerrain distribution:")
for t in sorted(counts.keys()):
    pct = counts[t] / len(terrain_grid) * 100
    print(f"  {names.get(t,t):14s} = {counts[t]:5d} ({pct:4.1f}%)")

land = sum(v for k,v in counts.items() if k != FROZEN_LAKE)
sea = counts.get(FROZEN_LAKE, 0)
print(f"\n  Land total = {land} ({land/len(terrain_grid)*100:.1f}%)")
print(f"  Sea  total = {sea} ({sea/len(terrain_grid)*100:.1f}%)")

# ASCII preview（简单验证）
print("\nASCII preview (# = land, ~ = sea):")
step = 4
for y in range(H-1, -1, -step):
    row = ""
    for x in range(0, W, step):
        t = grid[x][y]
        if t == FROZEN_LAKE: row += "~"
        elif t == SNOW_MOUNTAIN: row += "^"
        elif t in (SNOW_TOWN, FARMLAND): row += "C"
        elif t == SNOW_ROAD: row += "+"
        elif t in (RIVER, FROZEN_RIVER): row += "r"
        elif t in (SNOW_FOREST, GRASS_FOREST): row += "f"
        else: row += "#"
    print(f"y={y:3d}|{row}|")
