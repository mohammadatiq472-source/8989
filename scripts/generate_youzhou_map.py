"""
幽州地图生成器 - 基于东汉十三州幽州行政区划+地形参考
生成 380×270 逻辑网格地形数据 → youzhou_map.json

幽州轮廓：
- 主体：倾斜的菱形，大致占据网格中部偏左
- 辽东半岛：右上方约45°倾斜突出的矩形
- 乐浪郡：辽东半岛东南方再延伸一小块

地形分布（北→上，东→右）：
- 西北(代郡/上谷郡)：SnowMountain 雪山
- 中西(涿郡/广阳郡)：Snow 雪地平原 + 城镇
- 中部偏东(渔阳郡)：Snow + SnowForest
- 东部(右北平/辽西)：SnowForest + Snow
- 东北(辽东/玄菟)：Snow + FrozenLake + FrozenRiver
- 极东(乐浪)：Snow + SnowForest
- 河流贯穿多处

TerrainType 枚举:
0=Snow, 1=SnowForest, 2=FrozenLake, 3=SnowRoad,
4=SnowTown, 5=SnowMountain, 6=Grass, 7=GrassForest,
8=River, 9=FrozenRiver, 10=CastleWall, 11=Farmland
"""

import json
import math
import os

W = 380
H = 270

# 初始化全部为空（用 FrozenLake=2 表示海洋/地图外）
grid = [[2] * W for _ in range(H)]

def set_terrain(lx, ly, t):
    """设置逻辑坐标 (lx, ly) 的地形, 0-indexed, y从下到上"""
    if 0 <= lx < W and 0 <= ly < H:
        grid[ly][lx] = t

def fill_rect(x1, y1, x2, y2, t):
    for y in range(min(y1,y2), max(y1,y2)+1):
        for x in range(min(x1,x2), max(x1,x2)+1):
            set_terrain(x, y, t)

def fill_diamond(cx, cy, rx, ry, t):
    """填充菱形区域"""
    for y in range(cy - ry, cy + ry + 1):
        dy = abs(y - cy)
        half_w = int(rx * (1 - dy / ry)) if ry > 0 else rx
        for x in range(cx - half_w, cx + half_w + 1):
            set_terrain(x, y, t)

def fill_ellipse(cx, cy, rx, ry, t):
    """填充椭圆区域"""
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            dx = (x - cx) / rx if rx > 0 else 0
            dy = (y - cy) / ry if ry > 0 else 0
            if dx*dx + dy*dy <= 1.0:
                set_terrain(x, y, t)

def fill_rotated_rect(cx, cy, half_w, half_h, angle_deg, t):
    """填充旋转矩形"""
    angle = math.radians(angle_deg)
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    # 扫描足够大的范围
    r = int(math.sqrt(half_w**2 + half_h**2)) + 2
    for dy in range(-r, r+1):
        for dx in range(-r, r+1):
            # 反旋转到矩形局部坐标
            lx = dx * cos_a + dy * sin_a
            ly = -dx * sin_a + dy * cos_a
            if abs(lx) <= half_w and abs(ly) <= half_h:
                set_terrain(cx + dx, cy + dy, t)

def draw_river(points, width=1):
    """沿点列表画河流"""
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i+1]
        steps = max(abs(x2-x1), abs(y2-y1), 1)
        for s in range(steps + 1):
            t = s / steps
            x = int(x1 + (x2-x1) * t)
            y = int(y1 + (y2-y1) * t)
            for w in range(-width//2, width//2 + 1):
                set_terrain(x + w, y, 9)  # FrozenRiver
                set_terrain(x, y + w, 9)

# ============================================================
# Step 1: 幽州主体轮廓 - 大致菱形/不规则多边形
# 网格坐标: x=0~105(西→东), y=0~105(南→北)
# 幽州主体中心大约在 (45, 60)
# ============================================================

# 主体区域 - 用雪地填充大致轮廓
# 西边界约 x=10, 东边界约 x=75（不含半岛）
# 南边界约 y=30, 北边界约 y=90

# 先画幽州主体（不规则形状，分层填充）
# 南部边界（与冀州接壤）较宽，约 x=15~70
# 中部最宽处约 x=10~75
# 北部收窄（燕山以北）约 x=20~65

for y in range(30, 92):
    # 计算每行的x范围（模拟幽州轮廓）
    progress = (y - 30) / 62.0  # 0=南端, 1=北端
    
    if progress < 0.3:
        # 南部：中等宽度，略向东倾斜
        x_left = int(18 - progress * 10)
        x_right = int(68 + progress * 5)
    elif progress < 0.6:
        # 中部：最宽处
        x_left = int(12 + (progress - 0.3) * 5)
        x_right = int(72 - (progress - 0.3) * 3)
    else:
        # 北部：逐渐收窄
        x_left = int(15 + (progress - 0.6) * 30)
        x_right = int(65 - (progress - 0.6) * 20)
    
    for x in range(max(0, x_left), min(W, x_right + 1)):
        set_terrain(x, y, 0)  # Snow

# ============================================================
# Step 2: 辽东半岛 - 从主体东北方向约45°突出
# 起点约 (70, 55)，向东南方向延伸
# ============================================================

fill_rotated_rect(80, 48, 5, 18, -50, 0)  # Snow
# 半岛尖端
fill_rotated_rect(88, 36, 3, 8, -50, 0)

# ============================================================
# Step 3: 乐浪郡 - 辽东半岛东南方再延伸
# 大约在 (90, 30) 附近的一小块
# ============================================================

fill_ellipse(93, 28, 6, 8, 0)  # Snow
fill_ellipse(95, 22, 4, 5, 0)

# ============================================================
# Step 4: 地形细化 - 各郡地形特征
# ============================================================

# --- 代郡 (西北，山地) ---
fill_ellipse(20, 78, 10, 8, 5)  # SnowMountain

# --- 上谷郡 (西部偏北，山谷) ---
fill_ellipse(22, 68, 8, 6, 5)  # SnowMountain
fill_ellipse(25, 65, 4, 3, 1)  # SnowForest (谷地有树)

# --- 燕山山脉（东西走向，幽州北部屏障）---
for x in range(18, 65):
    # 燕山在约 y=75~85 之间
    y_center = 80 + int(3 * math.sin(x * 0.15))
    for dy in range(-3, 4):
        set_terrain(x, y_center + dy, 5)  # SnowMountain

# --- 涿郡 (中西部，平原+城镇) ---
# 涿郡核心是平原，已由Snow覆盖
# 蓟县（幽州治所，大城池）
fill_rect(35, 55, 37, 57, 4)  # SnowTown - 蓟县(大城)

# --- 广阳郡 (中部) ---
fill_rect(42, 56, 43, 57, 4)  # SnowTown

# --- 渔阳郡 (中部偏东北) ---
fill_ellipse(52, 65, 8, 6, 1)  # SnowForest
fill_rect(50, 63, 51, 64, 4)   # SnowTown - 渔阳城

# --- 右北平郡 (东部偏北) ---
fill_ellipse(60, 62, 5, 5, 1)  # SnowForest
fill_rect(58, 60, 59, 61, 4)   # SnowTown

# --- 辽西郡 (东部) ---
fill_rect(66, 58, 67, 59, 4)   # SnowTown
fill_ellipse(68, 55, 4, 4, 1)  # SnowForest

# --- 辽东郡 (东北，含半岛) ---
fill_rect(75, 52, 76, 53, 4)   # SnowTown - 辽东郡治
fill_ellipse(78, 50, 3, 3, 1)  # SnowForest

# --- 玄菟郡 (东北极远) ---
fill_rect(70, 70, 71, 71, 4)   # SnowTown
fill_ellipse(68, 72, 4, 3, 1)  # SnowForest

# --- 乐浪郡 (极东) ---
fill_rect(92, 27, 93, 28, 4)   # SnowTown - 朝鲜县
fill_ellipse(91, 25, 3, 3, 1)  # SnowForest

# ============================================================
# Step 5: 河流系统
# ============================================================

# 桑干河（从西北流向东南）
draw_river([(15, 75), (22, 70), (30, 62), (38, 55), (42, 50)], 1)

# 潮河（从北向南）
draw_river([(40, 78), (42, 70), (43, 62), (44, 55), (45, 48)], 1)

# 滦河（中东部，从北向南）
draw_river([(55, 80), (56, 72), (55, 65), (54, 58), (52, 50), (50, 42)], 1)

# 辽河（东部，从北向南流入海）
draw_river([(65, 78), (67, 70), (70, 62), (73, 55), (76, 48)], 1)

# ============================================================
# Step 6: 道路连接主要城池
# ============================================================

def draw_road(points):
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i+1]
        steps = max(abs(x2-x1), abs(y2-y1), 1)
        for s in range(steps + 1):
            t = s / steps
            x = int(x1 + (x2-x1) * t)
            y = int(y1 + (y2-y1) * t)
            if grid[y][x] == 0:  # 只在雪地上画路
                set_terrain(x, y, 3)  # SnowRoad

# 蓟县→广阳
draw_road([(36, 56), (42, 56)])
# 蓟县→渔阳
draw_road([(37, 56), (42, 58), (47, 61), (50, 63)])
# 渔阳→右北平
draw_road([(51, 63), (55, 62), (58, 60)])
# 右北平→辽西
draw_road([(59, 60), (63, 59), (66, 58)])
# 辽西→辽东
draw_road([(67, 58), (70, 56), (73, 54), (75, 52)])
# 蓟县→代郡方向
draw_road([(35, 56), (30, 60), (25, 65), (22, 70)])
# 辽东→乐浪
draw_road([(76, 52), (80, 46), (85, 40), (88, 35), (91, 30), (92, 27)])

# ============================================================
# Step 7: 南部边界区域 - 与冀州接壤处加一些农田
# ============================================================

for x in range(25, 55):
    for y in range(32, 38):
        if grid[y][x] == 0:  # 雪地
            # 散布一些农田
            if (x * 7 + y * 13) % 11 < 3:
                set_terrain(x, y, 11)  # Farmland

# ============================================================
# Step 8: 边界外设为冰湖(海洋)
# 已由初始值处理 (FrozenLake=2)
# ============================================================

# ============================================================
# Step 9: 序列化为 Unity JsonUtility 兼容格式
# ============================================================

# Unity JsonUtility 序列化 LogicalMapData:
# { "terrainGrid": [byte, byte, ...] } 一维数组, 行主序 (y * WIDTH + x)
terrain_grid = []
for y in range(H):
    for x in range(W):
        terrain_grid.append(grid[y][x])

data = {"terrainGrid": terrain_grid}

output_path = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 
    'My project', 'Assets', 'StreamingAssets', 'youzhou_map.json'
)
os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(data, f)

print(f"Map generated: {W}x{H} = {W*H} blocks")
print(f"Saved to: {output_path}")
print(f"Data size: {len(terrain_grid)} bytes")

# 统计地形分布
names = ['Snow', 'SnowForest', 'FrozenLake', 'SnowRoad', 'SnowTown',
         'SnowMountain', 'Grass', 'GrassForest', 'River', 'FrozenRiver',
         'CastleWall', 'Farmland']
counts = {}
for t in terrain_grid:
    name = names[t] if t < len(names) else f'Unknown({t})'
    counts[name] = counts.get(name, 0) + 1

print("\nTerrain distribution:")
for name, count in sorted(counts.items(), key=lambda x: -x[1]):
    pct = count / len(terrain_grid) * 100
    print(f"  {name}: {count} ({pct:.1f}%)")

# 也生成ASCII预览
print("\nASCII Preview (每2行1字符):")
chars = {0:'·', 1:'♣', 2:'~', 3:'-', 4:'■', 5:'▲', 6:'.', 7:'♠', 
         8:'≈', 9:'≈', 10:'█', 11:'田'}
# 从上到下(北到南)打印，每2格取1
for y in range(H-1, -1, -2):
    row = ''
    for x in range(0, W, 2):
        t = grid[y][x]
        row += chars.get(t, '?')
    print(row)
