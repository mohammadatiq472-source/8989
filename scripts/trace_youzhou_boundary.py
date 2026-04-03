"""
trace_youzhou_boundary.py — 从参考图片自动提取幽州9郡边界
==============================================================
输入: ChatGPT Image 2026年3月18日 08_54_20.png (1536×1024)
输出:
  - tmp/youzhou_traced_mask.png    可视化验证图
  - tmp/youzhou_traced_data.json   各郡格子数据
  - My project/Assets/StreamingAssets/youzhou_map.json  最终地图

原理:
  1. 识别图中白色区域（9个郡的领土）
  2. 标记灰色背景（领土外）
  3. 识别黑色边界线
  4. 对每个像素做 Voronoi 分配到9个郡
  5. 将像素坐标映射到 300×106 逻辑格子坐标
"""

import json
import math
import os
from PIL import Image

# ── 路径配置 ─────────────────────────────────────────────────────────
SRC_IMG = r"C:\Users\Buffoon Queer\Desktop\8989\ChatGPT Image 2026年3月18日 08_54_20.png"
OUT_DIR = r"C:\Users\Buffoon Queer\Desktop\8989\tmp"
MAP_OUT = r"C:\Users\Buffoon Queer\Desktop\8989\My project\Assets\StreamingAssets\youzhou_map.json"
os.makedirs(OUT_DIR, exist_ok=True)

# ── 目标网格尺寸 ──────────────────────────────────────────────────────
GRID_W, GRID_H = 300, 106

# ── 地形代码 ──────────────────────────────────────────────────────────
SNOW, SNOW_FOREST, FROZEN_LAKE, SNOW_ROAD, SNOW_TOWN = 0, 1, 2, 3, 4
SNOW_MTN, GRASS, GRASS_FOREST = 5, 6, 7

# ── 9郡种子（郡名 → 图片坐标近似中心点，1536×1024 像素）─────────────
#   通过截图视觉定位：图片内容区域大致 x:[30,1505], y:[270,710]
REGION_SEEDS_IMG = {
    "代郡":   (145, 490),
    "上谷":   (235, 450),
    "广阳":   (195, 565),
    "渔阳":   (390, 475),
    "右北平": (555, 455),
    "辽西":   (655, 395),
    "辽东":   (775, 445),
    "玄菟":   (710, 365),
    "乐浪":   (1360, 590),
}

# ── 郡属性（地形偏好）────────────────────────────────────────────────
REGION_PROPS = {
    "代郡":   {"base": SNOW_MTN, "has_snow_mtn": True},
    "上谷":   {"base": GRASS, "has_snow_mtn": False},
    "广阳":   {"base": GRASS, "has_snow_mtn": False},
    "渔阳":   {"base": GRASS, "has_snow_mtn": False},
    "右北平": {"base": GRASS, "has_snow_mtn": False},
    "辽西":   {"base": GRASS, "has_snow_mtn": False},
    "辽东":   {"base": GRASS, "has_snow_mtn": False},
    "玄菟":   {"base": GRASS, "has_snow_mtn": False},
    "乐浪":   {"base": GRASS, "has_snow_mtn": False},
}

BORDER_MTN_HALF = 2.5   # 郡界山脉半宽（格子数）
PASS_RADIUS     = 3     # 山口半径

def load_and_analyze():
    print(f"加载图片: {SRC_IMG}")
    img = Image.open(SRC_IMG).convert("RGB")
    W_img, H_img = img.size
    print(f"  图片尺寸: {W_img}×{H_img}")

    pixels = img.load()

    # ── Step 1: 分类每个像素 ─────────────────────────────────────────
    # 颜色统计辅助分类
    # 白色区域（郡内部）: R>210 AND G>210 AND B>210 AND 亮度高于灰背景
    # 灰色背景: R≈G≈B 且在 180-220 范围（灰阶）
    # 黑色边界: R<80 AND G<80 AND B<80
    #
    # 需要区分白色内部 vs 灰色背景:
    # 针对此图: 灰背景大约是 (200-225, 200-225, 200-225)
    #           白色郡内部是 (240-255, 240-255, 240-255)

    # 先统计颜色分布以校准阈值
    sample_pixels = []
    for sy in range(50, H_img, 20):
        for sx in range(50, W_img, 20):
            r, g, b = pixels[sx, sy]
            sample_pixels.append((r, g, b))

    # 统计灰色背景的亮度中心值
    gray_samples = [(r+g+b)//3 for r,g,b in sample_pixels
                    if abs(int(r)-int(g))<15 and abs(int(g)-int(b))<15 and 160<r<240]
    if gray_samples:
        gray_mean = sum(gray_samples)//len(gray_samples)
    else:
        gray_mean = 210
    print(f"  灰色背景亮度均值: {gray_mean}")

    WHITE_MIN  = min(gray_mean + 25, 235)  # 比背景明显更亮才算白色内部
    BLACK_MAX  = 80                          # 低于此值为边界线

    print(f"  白色阈值 > {WHITE_MIN}, 黑色阈值 < {BLACK_MAX}")

    # 生成 is_inside 掩码（True = 郡内部白色）
    is_inside = [[False] * H_img for _ in range(W_img)]
    is_border = [[False] * H_img for _ in range(W_img)]

    inside_count = 0
    for y in range(H_img):
        for x in range(W_img):
            r, g, b = pixels[x, y]
            brightness = (r + g + b) // 3
            if r < BLACK_MAX and g < BLACK_MAX and b < BLACK_MAX:
                is_border[x][y] = True
            elif brightness > WHITE_MIN and abs(int(r)-int(g))<20 and abs(int(g)-int(b))<20:
                is_inside[x][y] = True
                inside_count += 1

    print(f"  识别内部像素: {inside_count} ({inside_count/W_img/H_img*100:.1f}%)")

    # ── Step 2: 找出幽州轮廓的 bounding box ──────────────────────────
    min_x, max_x, min_y, max_y = W_img, 0, H_img, 0
    for y in range(H_img):
        for x in range(W_img):
            if is_inside[x][y]:
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)

    print(f"  幽州Bbox: x=[{min_x},{max_x}], y=[{min_y},{max_y}]")
    print(f"  幽州宽度: {max_x-min_x}px, 高度: {max_y-min_y}px")

    return (img, W_img, H_img, pixels, is_inside, is_border,
            (min_x, max_x, min_y, max_y))


def img_to_grid(px, py, min_x, max_x, min_y, max_y, margin=3):
    """图片像素坐标 → 逻辑格子坐标"""
    # x: 图片左 → 右 = 地图西 → 东
    # y: 图片上 → 下 = 地图北 → 南，所以要翻转
    gx = margin + (px - min_x) / (max_x - min_x) * (GRID_W - 2*margin)
    gy = (GRID_H - margin) - (py - min_y) / (max_y - min_y) * (GRID_H - 2*margin)
    return int(round(gx)), int(round(gy))


def dist2d(x1, y1, x2, y2):
    return math.sqrt((x1-x2)**2 + (y1-y2)**2)


def assign_regions(is_inside, W_img, H_img, min_x, max_x, min_y, max_y):
    """用 Voronoi 把每个内部像素分配到最近的郡种子"""
    # 种子已经是图片坐标 (图片像素)
    region_names = list(REGION_SEEDS_IMG.keys())

    # 对每个内部像素，找最近种子（直接 Voronoi）
    # 为了性能，我们逐格子而不是逐像素
    # 映射种子到格子坐标
    seed_grid = {}
    for name, (sx, sy) in REGION_SEEDS_IMG.items():
        gx, gy = img_to_grid(sx, sy, min_x, max_x, min_y, max_y)
        seed_grid[name] = (gx, gy)
        print(f"  种子 {name}: img({sx},{sy}) → grid({gx},{gy})")

    return seed_grid


def make_noise(x, y, s=0):
    v = (int(x) * 1664525 + int(y) * 1013904223 + int(s) * 22695477) & 0x7FFFFFFF
    return v / 0x7FFFFFFF


def fbm(x, y, octaves=3, freq=0.05, s=0):
    v, amp, tot = 0.0, 1.0, 0.0
    for _ in range(octaves):
        ix, iy = int(math.floor(x * freq)), int(math.floor(y * freq))
        fx = x * freq - ix
        fy = y * freq - iy
        u = fx*fx*(3-2*fx)
        uv = fy*fy*(3-2*fy)
        def h(a, b): return ((a*1664525+b*1013904223+s*22695477)&0x7FFFFFFF)/0x7FFFFFFF
        nv = (h(ix,iy)*(1-u)+h(ix+1,iy)*u)*(1-uv)+(h(ix,iy+1)*(1-u)+h(ix+1,iy+1)*u)*uv
        v += nv * amp
        tot += amp
        amp *= 0.5
        freq *= 2
    return v / tot


def build_grid(is_inside, W_img, H_img, min_x, max_x, min_y, max_y, seed_grid):
    """构建最终的 300×106 地形格子"""

    grid = [[SNOW] * GRID_H for _ in range(GRID_W)]  # 默认: 轮廓外=Snow
    region_grid = [[""] * GRID_H for _ in range(GRID_W)]  # 郡名

    # 把图片内部掩码下采样到逻辑格子
    # 每个逻辑格子 (gx, gy) 对应图片区域
    img_span_x = max_x - min_x
    img_span_y = max_y - min_y
    margin = 3

    def grid_to_img_box(gx, gy):
        """格子坐标 → 图片区域中心"""
        px = min_x + (gx - margin) / (GRID_W - 2*margin) * img_span_x
        py_flipped = (GRID_H - margin - gy) / (GRID_H - 2*margin) * img_span_y
        py = min_y + py_flipped
        return px, py

    # 构建逻辑格子的 inside/border 掩码（多数投票）
    SAMPLE_STEP = 2  # 每个格子采样 NxN 个像素
    grid_inside = [[False] * GRID_H for _ in range(GRID_W)]

    for gx in range(GRID_W):
        for gy in range(GRID_H):
            # 计算对应图片中心
            cx, cy = grid_to_img_box(gx, gy)
            # 采样格子周围区域
            votes = 0
            total = 0
            for dx in range(-SAMPLE_STEP, SAMPLE_STEP+1):
                for dy in range(-SAMPLE_STEP, SAMPLE_STEP+1):
                    px = int(cx) + dx
                    py = int(cy) + dy
                    if 0 <= px < W_img and 0 <= py < H_img:
                        total += 1
                        if is_inside[px][py]:
                            votes += 1
            if total > 0 and votes / total > 0.4:
                grid_inside[gx][gy] = True
                grid[gx][gy] = GRASS  # 内部默认草地

    inside_count = sum(1 for gx in range(GRID_W) for gy in range(GRID_H) if grid_inside[gx][gy])
    print(f"  网格内部格子数: {inside_count} ({inside_count/GRID_W/GRID_H*100:.1f}%)")

    # Voronoi 分配郡
    region_names = list(seed_grid.keys())
    region_seeds_list = [(name, seed_grid[name]) for name in region_names]

    for gx in range(GRID_W):
        for gy in range(GRID_H):
            if not grid_inside[gx][gy]:
                continue
            best_name = ""
            best_dist = float('inf')
            for name, (sx, sy) in region_seeds_list:
                d = dist2d(gx, gy, sx, sy)
                if d < best_dist:
                    best_dist = d
                    best_name = name
            region_grid[gx][gy] = best_name

    # 统计各郡格子数
    region_counts = {}
    for gx in range(GRID_W):
        for gy in range(GRID_H):
            r = region_grid[gx][gy]
            if r:
                region_counts[r] = region_counts.get(r, 0) + 1
    print("  郡格子数:")
    for name in region_names:
        print(f"    {name}: {region_counts.get(name, 0)}")

    return grid, grid_inside, region_grid


def apply_terrain(grid, grid_inside, region_grid):
    """应用各郡地形特征"""

    # 1. 代郡: 雪山主体
    for gx in range(GRID_W):
        for gy in range(GRID_H):
            if region_grid[gx][gy] == "代郡" and grid_inside[gx][gy]:
                n = fbm(gx, gy, s=7)
                grid[gx][gy] = SNOW_MTN if n > 0.38 else SNOW

    # 2. 郡界边缘 → 雪山山脉
    # 找出郡界（相邻格子属于不同郡的地方）
    border_cells = set()
    for gx in range(1, GRID_W-1):
        for gy in range(1, GRID_H-1):
            if not grid_inside[gx][gy]:
                continue
            r = region_grid[gx][gy]
            for dx, dy in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]:
                nx, ny = gx+dx, gy+dy
                if 0 <= nx < GRID_W and 0 <= ny < GRID_H:
                    nr = region_grid[nx][ny]
                    if grid_inside[nx][ny] and nr != r and r not in ("代郡",) and nr not in ("代郡",):
                        border_cells.add((gx, gy))
                        break

    # 扩展成山脉宽度
    expanded_border = set()
    for (bx, by) in border_cells:
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                nx, ny = bx+dx, by+dy
                if 0 <= nx < GRID_W and 0 <= ny < GRID_H and grid_inside[nx][ny]:
                    n = fbm(nx, ny, s=42)
                    if n > 0.25:
                        expanded_border.add((nx, ny))

    for (gx, gy) in expanded_border:
        if region_grid[gx][gy] not in ("代郡",):
            grid[gx][gy] = SNOW_MTN

    mtn_count = sum(1 for gx in range(GRID_W) for gy in range(GRID_H) if grid[gx][gy] == SNOW_MTN)
    print(f"  郡界山脉格子: {mtn_count}")

    # 3. 山脉周围的森林过渡
    for gx in range(GRID_W):
        for gy in range(GRID_H):
            if not grid_inside[gx][gy]:
                continue
            if grid[gx][gy] != GRASS:
                continue
            near_mtn = False
            for dx in range(-2, 3):
                for dy in range(-2, 3):
                    nx, ny = gx+dx, gy+dy
                    if 0<=nx<GRID_W and 0<=ny<GRID_H and grid[nx][ny] == SNOW_MTN:
                        near_mtn = True
                        break
                if near_mtn:
                    break
            if near_mtn:
                n = fbm(gx, gy, s=37, freq=0.07)
                if n > 0.5:
                    grid[gx][gy] = GRASS_FOREST

    # 4. 代郡与其他郡之间的边界山脉
    for gx in range(GRID_W):
        for gy in range(GRID_H):
            if not grid_inside[gx][gy]:
                continue
            if region_grid[gx][gy] != "代郡":
                continue
            # 如果在代郡边缘（有非代郡邻居），添加山脉
            for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                nx, ny = gx+dx, gy+dy
                if 0<=nx<GRID_W and 0<=ny<GRID_H:
                    if grid_inside[nx][ny] and region_grid[nx][ny] not in ("", "代郡"):
                        n = fbm(gx, gy, s=99)
                        if n > 0.3:
                            grid[gx][gy] = SNOW_MTN
                        break

    # 5. 在代郡/外郡边界和外郡/外郡边界上开辟山口（官道）
    # 官道沿主要郡界，每条界上1-2个
    PASS_DEFS = [
        # (在哪两个郡的交界上, 格子坐标范围内的通道中心)
        # 这些坐标要根据实际种子格子位置推算
        # 使用种子中点作为通道位置
    ]

    # 自动计算相邻郡对之间的中点作为山口
    region_names = list(REGION_SEEDS_IMG.keys())
    processed_pairs = set()
    for gx in range(GRID_W):
        for gy in range(GRID_H):
            if not grid_inside[gx][gy]:
                continue
            r1 = region_grid[gx][gy]
            if not r1:
                continue
            for dx, dy in [(1,0),(0,1)]:
                nx, ny = gx+dx, gy+dy
                if 0<=nx<GRID_W and 0<=ny<GRID_H:
                    r2 = region_grid[nx][ny]
                    if r2 and r2 != r1:
                        pair = tuple(sorted([r1, r2]))
                        if pair not in processed_pairs:
                            processed_pairs.add(pair)

    # 对每个郡对，在边界的中点附近开辟1个山口
    # 先找每对边界格子
    pair_border_cells = {}
    for gx in range(GRID_W):
        for gy in range(GRID_H):
            if not grid_inside[gx][gy]:
                continue
            r1 = region_grid[gx][gy]
            if not r1:
                continue
            for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                nx, ny = gx+dx, gy+dy
                if 0<=nx<GRID_W and 0<=ny<GRID_H:
                    r2 = region_grid[nx][ny]
                    if r2 and r2 != r1:
                        pair = tuple(sorted([r1, r2]))
                        if pair not in pair_border_cells:
                            pair_border_cells[pair] = []
                        pair_border_cells[pair].append((gx, gy))

    pass_count = 0
    for pair, cells in pair_border_cells.items():
        if not cells:
            continue
        # 找最多2个山口位置（取边界格子序列的1/3和2/3处）
        step = max(1, len(cells) // 3)
        pass_positions = [cells[step], cells[2*step]] if len(cells) >= 3 else [cells[len(cells)//2]]
        for (px, py) in pass_positions[:2]:
            # 在山口附近的山脉格子改为官道
            for dx in range(-PASS_RADIUS, PASS_RADIUS+1):
                for dy in range(-PASS_RADIUS, PASS_RADIUS+1):
                    nx, ny = px+dx, py+dy
                    if 0<=nx<GRID_W and 0<=ny<GRID_H and grid_inside[nx][ny]:
                        if (dx*dx + dy*dy) <= PASS_RADIUS*PASS_RADIUS:
                            if grid[nx][ny] == SNOW_MTN:
                                grid[nx][ny] = SNOW_ROAD
                                pass_count += 1

    print(f"  山口官道格子: {pass_count}")

    return grid


def save_outputs(grid, grid_inside, region_grid):
    """保存地图 JSON 和可视化 PNG"""

    # 序列化地图
    terrain_flat = [grid[x][y] for y in range(GRID_H) for x in range(GRID_W)]
    assert len(terrain_flat) == GRID_W * GRID_H

    with open(MAP_OUT, 'w', encoding='utf-8') as f:
        json.dump({"terrainGrid": terrain_flat}, f, separators=(',', ':'))
    print(f"[OK] 地图JSON: {MAP_OUT}  ({GRID_W}×{GRID_H}={len(terrain_flat)} 格)")

    # 可视化 PNG（用 PIL 绘制）
    COLORS = {
        SNOW:        (214, 229, 240),
        SNOW_FOREST: (71,  133, 85),
        FROZEN_LAKE: (46,  98,  184),
        SNOW_ROAD:   (184, 158, 122),
        SNOW_TOWN:   (242, 192, 64),
        SNOW_MTN:    (92,  102, 140),
        GRASS:       (115, 199, 98),
        GRASS_FOREST:(46,  114, 55),
        8:           (89,  160, 224),
        9:           (153, 204, 255),
        10:          (141, 98,  57),
        11:          (217, 192, 90),
    }
    REGION_COLORS = {
        "代郡":   (200, 180, 160), "上谷":   (160, 210, 160),
        "广阳":   (180, 210, 150), "渔阳":   (150, 200, 180),
        "右北平": (160, 190, 200), "辽西":   (180, 170, 220),
        "辽东":   (200, 170, 200), "玄菟":   (220, 200, 160),
        "乐浪":   (200, 220, 180),
    }

    SCALE = 6  # 每个逻辑格 = 6x6 像素
    pw, ph = GRID_W * SCALE, GRID_H * SCALE

    vis = Image.new("RGB", (pw, ph), (40, 40, 50))
    pix = vis.load()

    for gx in range(GRID_W):
        for gy in range(GRID_H):
            t = grid[gx][gy]
            rname = region_grid[gx][gy]
            if grid_inside[gx][gy]:
                r, g, b = COLORS.get(t, (128, 128, 128))
                # 用半透明郡色混合
                rc = REGION_COLORS.get(rname, (128, 128, 128))
                r = int(r * 0.7 + rc[0] * 0.3)
                g = int(g * 0.7 + rc[1] * 0.3)
                b = int(b * 0.7 + rc[2] * 0.3)
            else:
                r, g, b = 30, 35, 45  # 外部深色

            py0 = (GRID_H - 1 - gy) * SCALE
            for dy in range(SCALE):
                for dx in range(SCALE):
                    pix[gx*SCALE+dx, py0+dy] = (r, g, b)

    vis_path = os.path.join(OUT_DIR, "youzhou_traced_mask.png")
    vis.save(vis_path)
    print(f"[OK] 可视化PNG: {vis_path}")

    # 生成 HTML 预览
    region_json_data = json.dumps([region_grid[x][y] for y in range(GRID_H) for x in range(GRID_W)], ensure_ascii=False)
    terrain_json_data = json.dumps(terrain_flat)
    RNAMES_EN = {name: name for name in REGION_SEEDS_IMG.keys()}
    RNAMES_JSON = json.dumps(RNAMES_EN, ensure_ascii=False)

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>幽州V4精确版预览</title>
<style>
body{{background:#1a1a2e;color:#eee;font-family:monospace;margin:20px}}
canvas{{border:1px solid #444;image-rendering:pixelated}}
h1{{color:#d4a844}}
#legend{{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0}}
.li{{display:flex;align-items:center;gap:4px}}
.lc{{width:14px;height:14px;border:1px solid #666}}
</style></head>
<body>
<h1>幽州九郡 V4 精确版（图片自动提取）</h1>
<div>尺寸: {GRID_W}×{GRID_H} | 总格子: {GRID_W*GRID_H} | 缩放: {SCALE}x</div>
<div id="legend"></div>
<canvas id="map" width="{pw}" height="{ph}"></canvas>
<div id="info">移动鼠标查看格子信息</div>
<script>
const W={GRID_W},H={GRID_H},S={SCALE};
const terrain={terrain_json_data};
const regions={region_json_data};
const NAMES={{0:'Snow',1:'SnwForest',2:'FrzLake',3:'SnwRoad',4:'SnwTown',5:'SnwMtn',6:'Grass',7:'GrsForest',8:'River',9:'FrzRiver',10:'Castle',11:'Farmland'}};
const RNAMES={RNAMES_JSON};
const COLORS={{0:[214,229,240],1:[71,133,85],2:[46,98,184],3:[184,158,122],
  4:[242,192,64],5:[92,102,140],6:[115,199,98],7:[46,114,55],
  8:[89,160,224],9:[153,204,255],10:[141,98,57],11:[217,192,90]}};
const RCOL={{
  '代郡':[200,180,160],'上谷':[160,210,160],'广阳':[180,210,150],
  '渔阳':[150,200,180],'右北平':[160,190,200],'辽西':[180,170,220],
  '辽东':[200,170,200],'玄菟':[220,200,160],'乐浪':[200,220,180]
}};
const canvas=document.getElementById('map');
const ctx=canvas.getContext('2d');
const img=ctx.createImageData({pw},{ph});
for(let gy=0;gy<H;gy++){{
  for(let gx=0;gx<W;gx++){{
    const idx=gy*W+gx;
    const t=terrain[idx],rn=regions[idx];
    let c=COLORS[t]||[128,128,128];
    const rc=rn?RCOL[rn]||[128,128,128]:[30,30,30];
    const r=rn?Math.round(c[0]*0.7+rc[0]*0.3):30;
    const g=rn?Math.round(c[1]*0.7+rc[1]*0.3):35;
    const b=rn?Math.round(c[2]*0.7+rc[2]*0.3):45;
    const py0=(H-1-gy)*S;
    for(let dy=0;dy<S;dy++){{
      for(let dx=0;dx<S;dx++){{
        const pi=((py0+dy)*{pw}+(gx*S+dx))*4;
        img.data[pi]=r;img.data[pi+1]=g;img.data[pi+2]=b;img.data[pi+3]=255;
      }}
    }}
  }}
}}
ctx.putImageData(img,0,0);
// Draw region borders
ctx.strokeStyle='rgba(255,255,200,0.6)';ctx.lineWidth=1;
// Legend
const legend=document.getElementById('legend');
Object.entries(RNAMES).forEach(([k])=>{{
  const rc=RCOL[k]||[128,128,128];
  const el=document.createElement('div');el.className='li';
  el.innerHTML='<div class="lc" style="background:rgb('+rc.join(',')+')" ></div>'+k;
  legend.appendChild(el);
}});
canvas.addEventListener('mousemove',e=>{{
  const rect=canvas.getBoundingClientRect();
  const mx=e.clientX-rect.left,my=e.clientY-rect.top;
  const gx=Math.floor(mx/S),gy=H-1-Math.floor(my/S);
  if(gx>=0&&gx<W&&gy>=0&&gy<H){{
    const idx=gy*W+gx;
    document.getElementById('info').textContent=
      'x='+gx+' y='+gy+' | 地形: '+NAMES[terrain[idx]]+' | 郡: '+(regions[idx]||'(外)');
  }}
}});
</script>
</body></html>"""

    html_path = os.path.join(OUT_DIR, "map_v4_precise.html")
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"[OK] HTML预览: {html_path}")

    # 统计
    NAMES_MAP = {0:'Snow',1:'SnwForest',2:'FrzLake',3:'SnwRoad',4:'SnwTown',
                 5:'SnwMtn',6:'Grass',7:'GrsForest',8:'River',9:'FrzRiver',10:'Castle',11:'Farmland'}
    counts = {}
    for t in terrain_flat:
        counts[t] = counts.get(t, 0) + 1
    total = len(terrain_flat)
    print("\n地形分布:")
    for k in sorted(counts):
        bar = '#' * int(counts[k]/total*40)
        print(f"  {NAMES_MAP.get(k,str(k)):12s} {counts[k]:6d} ({counts[k]/total*100:5.1f}%) {bar}")

    inside = sum(1 for gx in range(GRID_W) for gy in range(GRID_H) if grid_inside[gx][gy])
    print(f"\n幽州内: {inside} ({inside/total*100:.1f}%)  外: {total-inside} ({(total-inside)/total*100:.1f}%)")


def main():
    # 1. 加载并分析图片
    (img, W_img, H_img, pixels, is_inside, is_border, bbox) = load_and_analyze()
    min_x, max_x, min_y, max_y = bbox

    # 2. 确定种子格子坐标
    print("\n种子格子映射:")
    seed_grid = assign_regions(is_inside, W_img, H_img, min_x, max_x, min_y, max_y)

    # 3. 构建格子
    print("\n构建格子...")
    grid, grid_inside, region_grid = build_grid(
        is_inside, W_img, H_img, min_x, max_x, min_y, max_y, seed_grid)

    # 4. 应用地形
    print("\n应用地形...")
    grid = apply_terrain(grid, grid_inside, region_grid)

    # 5. 保存输出
    print("\n保存输出...")
    save_outputs(grid, grid_inside, region_grid)

    print("\n=== 完成！===")


if __name__ == "__main__":
    main()
