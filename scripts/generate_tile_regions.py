#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/generate_tile_regions.py — 全国地图逐格郡归属数据生成

Phase 1 (默认): BBox 近似光栅化，立即可用
Phase 2 (--image <path>): 历史参考图轮廓线分割精化，需要 opencv-python

输出:
  My project/Assets/StreamingAssets/map_tile_regions.json  (Unity 消费)
  tmp/map_tile_regions_debug.svg                           (可视化验证)

坐标系: pos = x*10000 + y, X 南↓ (1→1851), Y 东→ (1→1501)
        X 扩展到 1851 以容纳交州南端（日南郡）

用法:
  py -3 scripts/generate_tile_regions.py                    # Phase 1
  py -3 scripts/generate_tile_regions.py --image tmp/hist.png  # Phase 2
"""

import json, pathlib, sys, argparse, time
from collections import Counter, defaultdict
from typing import Dict, List, Tuple

# ── 路径 ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR = pathlib.Path(__file__).parent
ROOT       = SCRIPT_DIR.parent

MAP_REGIONS_JSON = ROOT / "My project/Assets/StreamingAssets/map_regions.json"
OUTPUT_JSON      = ROOT / "My project/Assets/StreamingAssets/map_tile_regions.json"
DEBUG_SVG        = ROOT / "tmp/map_tile_regions_debug.svg"

# ── 网格尺寸 ─────────────────────────────────────────────────────────────────
# 原始游戏数据: x=[1,1501], y=[1,1501]
# 交州向南延伸约 350 格覆盖日南郡，形成历史参考图中的南部半岛形状
X_MIN, X_MAX = 1, 1851
Y_MIN, Y_MAX = 1, 1501

# ── 交州 (id=15) 郡级手工近似 ─────────────────────────────────────────────────
# 合成 ID 1501-1507 对应东汉末年交州 7 郡
# 坐标基于: 历史地理位置 + 相邻州郡 BBox 推算 + 历史参考图形状估算
# Phase 2 中将用图像识别对这些边界进行精化
#
# 交州形状特征（基于历史参考图）:
#   北端宽约 y=[150,950]（横跨现代广东、广西）
#   南端窄约 y=[300,490]（越南北部半岛，日南郡最南）
#   整体轮廓: 北宽南窄的楔形，东侧（南海/交趾方向）有海岸线
#
# 坐标说明: X↓南涨, Y→东涨
#   荆州中心 (1101, 493) → 交州应在 x>1400 的南端
#   益州中心  (805, 172) → 交州西边以益州南边郡为界
#   扬州中心 (1328, 889) → 交州东北与扬州南部接壤
JIAOZHOU_JUNXIAN = [
    # (id, name, regionId, bbox_minX, bbox_maxX, bbox_minY, bbox_maxY)
    # 苍梧: 广西中部，与荆州桂阳/零陵接壤（北边），偏西
    (1502, "苍梧",  15, 1440, 1590,  320,  650),
    # 南海: 广东核心，与扬州豫章/庐陵接壤（东北），沿海
    (1501, "南海",  15, 1450, 1620,  650,  950),
    # 郁林: 广西西南，益州牂牁以东
    (1503, "郁林",  15, 1480, 1700,  120,  380),
    # 合浦: 广西南海岸，下接交趾
    (1504, "合浦",  15, 1590, 1760,  420,  730),
    # 交趾: 越南北部，红河三角洲
    (1505, "交趾",  15, 1650, 1800,  200,  500),
    # 九真: 越南中北部（清化/义安一带）
    (1506, "九真",  15, 1770, 1835,  260,  480),
    # 日南: 越南中部，最南端
    (1507, "日南",  15, 1815, 1851,  300,  480),
]

# ── 颜色表（按 effectiveRegionId，与 map_regions.json 一致）────────────────
# 颜色取自 tmp/historical_map.png 参考图郡中心周边像素均值
REGION_COLORS = {
     1: "#ABA989",   2: "#95a5a6",   3: "#B9CF67",   4: "#B5D251",
     5: "#A7B265",   6: "#E0CC79",   7: "#DDD24B",   8: "#93A7B5",
     9: "#E1917F",  10: "#D5BC86",  11: "#E9A0C4",  12: "#9CD0E9",
    13: "#DDA1B5",  14: "#607d8b",  15: "#8796B8",
}

# 注: 2=雍州郡已全部重分配给司隶(1)/凉州(10)，14=湘西无对应郡数据，两者不出现在输出中
REGION_NAMES = {
     1: "司隶",   3: "兖州",   4: "豫州",
     5: "冀州",   6: "青州",   7: "徐州",   8: "扬州",
     9: "并州",  10: "凉州",  11: "益州",  12: "幽州",
    13: "荆州",  15: "交州",
}

# ── 南端 BBox 裁剪规则 ──────────────────────────────────────────────────────
SOUTH_CLIP = {
    8:  1420,   # 扬州: clip 到 x=1420
    13: 1400,   # 荆州: clip 到 x=1400
    11: 1350,   # 益州: clip 到 x=1350
}

# ── 东端 BBox 裁剪（防止北方州进入渤海/黄海——东边3块海域）─────────────────────
EAST_CLIP = {
    12: 1455,  # 幽州: maxY=1455（辽东半岛东端，切掉渤海东翼）
    5:  1380,  # 冀州: maxY=1380（秦皇岛/曹妃甸以东为渤海）
    9:  900,   # 并州: maxY=900（雁门以东已入冀州，切掉溢出）
}

# ── 西端 BBox 裁剪（防止益州/荆州延伸到缅甸/中亚——西边多余益州）───────────────
WEST_CLIP = {
    11: 85,    # 益州: minY=85（永昌郡西界，切掉缅甸方向）
    13: 90,    # 荆州: minY=90（切掉汉水以西溢出格）
    10: 55,    # 凉州: minY=55（敦煌以西沙漠）
}

# ── 东汉版图近似边界 ──────────────────────────────────────────────────────────
# 网格外的格子（海洋、沙漠、草原）将被清零。
# 坐标系: (x南↓, y东→)，顺时针定义边界点。
# 这是粗略估计，不影响 Phase 2 精化结果。
CHINA_BORDER = [
    # 西北角 (敦煌以西沙漠，从 Y=50 开始)  ← FIX: 原 Y=1 导致益州/荆州西边沙漠格爆炸
    (  1,   50),
    (  1, 1468),    # 北界: 辽西东端约 Y=1468（排除朝鲜半岛以东海域）
    # 东北渤海转角（幽州辽东 maxY≈1480）
    (100, 1480),    # 辽东半岛沿海  ← FIX: 排除渤海/黄海北段海域
    (200, 1490),    # 玄菟郡东侧
    (280, 1501),    # 渤海海峡口（进入山东半岛纬度，Y=1501 合理）
    # 东海岸 (山东→江南→岭南)
    (400, 1501),    # 山东半岛
    (600, 1501),    # 徐州海岸
    (900, 1501),    # 扬州海岸
    (1100, 1501),   # 会稽海岸
    (1300, 1400),   # 建安(福建)海岸
    (1450, 1100),   # 南海沿岸收窄
    (1501,  950),   # 交州东端
    # 交州南端半岛
    (1620,  730),   # 合浦→交趾
    (1800,  500),   # 交趾→九真
    (1851,  480),   # 九真
    (1851,  260),   # 日南西界
    # 西南 (益州→永昌) ← FIX: 从 Y=1 改为 Y=50-70，切掉缅甸/印度方向荒野格
    (1700,   70),   # 永昌郡西界（云南最西端，比缅甸更东）
    (1501,   65),   # 益州/永昌西界
    (1200,   60),   # 益州西端（蜀郡以西没有汉朝领土）
    (800,    55),   # 凉州/益州交界
    (400,    50),   # 凉州西端（酒泉/张掖以西）
    # 闭合回西北角
    (  1,    50),
]

# ── 数据加载 ─────────────────────────────────────────────────────────────────

def load_all_junxians() -> List[dict]:
    """从 map_regions.json 加载 94 郡，追加 7 个交州合成郡"""
    with open(MAP_REGIONS_JSON, encoding="utf-8") as f:
        data = json.load(f)

    result = []
    for j in data.get("junxian", []):
        b = j["bbox"]
        result.append({
            "id":         j["id"],
            "name":       j["name"],
            "regionId":   j.get("effectiveRegionId", j.get("originalRegionId", 0)),
            "minX": b["minX"], "maxX": b["maxX"],
            "minY": b["minY"], "maxY": b["maxY"],
            "area": (b["maxX"] - b["minX"]) * (b["maxY"] - b["minY"]),
        })

    for (jid, jname, jreg, x0, x1, y0, y1) in JIAOZHOU_JUNXIAN:
        result.append({
            "id": jid, "name": jname, "regionId": jreg,
            "minX": x0, "maxX": x1, "minY": y0, "maxY": y1,
            "area": (x1 - x0) * (y1 - y0),
        })

    # ── 南端 BBox 裁剪 ───────────────────────────────────────────────────
    clipped = 0
    for j in result:
        rid = j["regionId"]
        if j["maxX"] >= 1490 and rid in SOUTH_CLIP:
            old = j["maxX"]
            j["maxX"] = min(j["maxX"], SOUTH_CLIP[rid])
            if j["maxX"] != old:
                j["area"] = (j["maxX"] - j["minX"]) * (j["maxY"] - j["minY"])
                clipped += 1
        # ── 东端裁剪（切掉渤海/黄海海域块）
        if rid in EAST_CLIP and j["maxY"] > EAST_CLIP[rid]:
            j["maxY"] = EAST_CLIP[rid]
            j["area"] = (j["maxX"] - j["minX"]) * (j["maxY"] - j["minY"])
            clipped += 1
        # ── 西端裁剪（切掉缅甸/中亚方向空旷格）
        if rid in WEST_CLIP and j["minY"] < WEST_CLIP[rid]:
            j["minY"] = WEST_CLIP[rid]
            j["area"] = (j["maxX"] - j["minX"]) * (j["maxY"] - j["minY"])
            clipped += 1
    if clipped:
        print(f"  已裁剪 {clipped} 个郡的BBox（南/东/西端裁剪）")

    return result


def build_junxian_meta(junxians: List[dict]) -> dict:
    """构造 junxian_id → {name, regionId} 的查找表（写入 JSON 元信息）"""
    return {str(j["id"]): {"name": j["name"], "regionId": j["regionId"]}
            for j in junxians}

# ── Phase 1: BBox 光栅化 ─────────────────────────────────────────────────────

def phase1_bbox_rasterize(junxians: List[dict]) -> list:
    """
    BBox 光栅化策略: 大郡先填，小郡后覆盖（重叠区域归属较小郡）
    返回: flat list grid[x * STRIDE + y] = junxian_id
    """
    print("  [Phase 1] BBox 光栅化...")
    STRIDE = Y_MAX + 1
    grid = [0] * ((X_MAX + 1) * STRIDE)

    # 按面积升序（小郡先填，大郡后覆盖）—— 使大郡在重叠区域优先占据格子
    # P2修复: 原 reverse=True 导致凉州酒泉被并州乐平等小郡覆盖
    for j in sorted(junxians, key=lambda j: j["area"], reverse=False):
        jid = j["id"]
        x0 = max(j["minX"], X_MIN);  x1 = min(j["maxX"], X_MAX)
        y0 = max(j["minY"], Y_MIN);  y1 = min(j["maxY"], Y_MAX)
        for x in range(x0, x1 + 1):
            base = x * STRIDE
            for y in range(y0, y1 + 1):
                grid[base + y] = jid

    assigned = sum(1 for v in grid if v != 0)
    print(f"    已分配 {assigned:,} 格 / {len(grid):,} 格总计")
    return grid

# ── 版图遮罩: 清除海洋/沙漠/草原外的格子 ────────────────────────────────────

def apply_border_mask(grid: list) -> list:
    """清除 CHINA_BORDER 多边形外的格子（设为 0）"""
    print("  [遮罩] 应用东汉版图边界...")
    STRIDE = Y_MAX + 1
    cleared = 0

    # 用扫描线优化: 对每行 x，找出该行 y 的有效范围
    # 先对多边形每条边，计算和当前行 x 的交点 y 值
    poly = CHINA_BORDER
    n = len(poly)

    for x in range(X_MIN, X_MAX + 1):
        # 收集所有边与 x 行的交点
        intersections: List[float] = []
        j = n - 1
        for i in range(n):
            xi, yi = poly[i]
            xj, yj = poly[j]
            if (xi <= x < xj) or (xj <= x < xi):
                # 交点 y 坐标
                if abs(xj - xi) > 0:
                    y_cross = yi + (x - xi) * (yj - yi) / (xj - xi)
                    intersections.append(y_cross)
            j = i

        intersections.sort()

        # 扫描线: 交点两两配对确定有效区间
        base = x * STRIDE
        if len(intersections) < 2:
            # 该行完全在外 → 清零
            for y in range(Y_MIN, Y_MAX + 1):
                if grid[base + y] != 0:
                    grid[base + y] = 0
                    cleared += 1
        else:
            # 行内有效区间: [intersections[0], intersections[1]], [intersections[2], ...], ...
            for y in range(Y_MIN, Y_MAX + 1):
                inside = False
                for k in range(0, len(intersections) - 1, 2):
                    if intersections[k] <= y <= intersections[k + 1]:
                        inside = True
                        break
                if not inside and grid[base + y] != 0:
                    grid[base + y] = 0
                    cleared += 1

    print(f"    清除了 {cleared:,} 格（版图外）")
    return grid

# ── Phase 1B: Voronoi + BBox 约束光栅化（替代纯 BBox 顺序覆盖）───────────────
# 原 phase1_bbox_rasterize (reverse=False) 问题:
#   大州 BBox 后写覆盖小州 → 豫州/司隶/兖州 严重偏小（豫州仅 0.7%）
# 修复: 对每个格子，在包含它的 BBox 候选郡中选最近中心的郡（正确解）

def phase1_voronoi_rasterize(junxians: List[dict]) -> list:
    """
    Voronoi + BBox 约束光栅化
    对每个格子，在所有 BBox 包含它的郡中选中心距最近的郡。
    时间复杂度 O(X * Y * N_cands_per_row)，numpy 向量化，约 1-3 秒。
    """
    try:
        import numpy as np
    except ImportError:
        print("  [Phase 1] numpy 不可用，回退到 BBox 顺序覆盖法")
        return phase1_bbox_rasterize(junxians)

    print("  [Phase 1] Voronoi+BBox 光栅化 (numpy)...")
    STRIDE = Y_MAX + 1

    jids = np.array([j["id"] for j in junxians],                    dtype=np.int32)
    jcx  = np.array([(j["minX"] + j["maxX"]) / 2.0 for j in junxians], dtype=np.float32)
    jcy  = np.array([(j["minY"] + j["maxY"]) / 2.0 for j in junxians], dtype=np.float32)
    jx0  = np.array([j["minX"] for j in junxians], dtype=np.int32)
    jx1  = np.array([j["maxX"] for j in junxians], dtype=np.int32)
    jy0  = np.array([j["minY"] for j in junxians], dtype=np.float32)
    jy1  = np.array([j["maxY"] for j in junxians], dtype=np.float32)

    grid_out = np.zeros((X_MAX + 1) * STRIDE, dtype=np.int32)
    gy_arr   = np.arange(Y_MIN, Y_MAX + 1, dtype=np.float32)   # (1501,)

    for xi, gx in enumerate(range(X_MIN, X_MAX + 1)):
        if xi % 200 == 0:
            print(f"    {xi * 100 // (X_MAX - X_MIN + 1):3d}%", end="\r", flush=True)

        row_mask = (jx0 <= gx) & (jx1 >= gx)
        if not row_mask.any():
            continue

        r_jids = jids[row_mask]                             # (N,)
        dx2    = (float(gx) - jcx[row_mask]) ** 2          # (N,)
        r_cy   = jcy[row_mask]                              # (N,)
        r_y0   = jy0[row_mask]                              # (N,)
        r_y1   = jy1[row_mask]                              # (N,)

        dy     = gy_arr[:, None] - r_cy[None, :]            # (Y, N)
        dist2  = dx2[None, :] + dy * dy                     # (Y, N)
        in_y   = (gy_arr[:, None] >= r_y0[None, :]) & \
                 (gy_arr[:, None] <= r_y1[None, :])         # (Y, N)
        has_cand = in_y.any(axis=1)                         # (Y,)
        dist2[~in_y] = 1e18                                 # 排除不包含当前格的郡

        nearest  = np.argmin(dist2, axis=1)                 # (Y,)
        assigned = r_jids[nearest]                          # (Y,)
        assigned[~has_cand] = 0

        base = gx * STRIDE
        grid_out[base + Y_MIN : base + Y_MAX + 1] = assigned

    print(f"\n    已分配 {int((grid_out > 0).sum()):,} 格")
    return grid_out.tolist()


# ── Phase 2: 图像识别精化 ─────────────────────────────────────────────────────

def phase2_image_refine(grid: list, image_path: pathlib.Path,
                        junxians: List[dict]) -> list:
    """
    Phase 2: K-means 颜色聚类 → 州级边界精化

    历史参考图中每个「州」使用一种颜色，相同颜色的所有郡属于同一州。
    该函数利用颜色聚类识别「游戏格子属于哪个州」，当与 Phase 1 BBox 冲突时，
    将格子重新分配给图像颜色指示的正确州内最近郡。

    坐标系:
      图像: img_x →东(Y方向)  img_y ↓南(X方向)
      游戏: game_y →东  game_x ↓南  (X南↓ Y东→)
      线性映射: img_x → game_y,  img_y → game_x
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        print("  [Phase 2] 跳过: 需要 opencv-python")
        return grid

    from collections import defaultdict as _dd

    print(f"  [Phase 2] 加载图片: {image_path}")
    img = cv2.imread(str(image_path))
    if img is None:
        print(f"  [Phase 2] 无法读取: {image_path}")
        return grid

    img_h, img_w = img.shape[:2]
    print(f"           图片尺寸: {img_w}×{img_h}")

    # ── 1. 自动裁剪白边 ────────────────────────────────────────────────────
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, mask_nw = cv2.threshold(gray, 250, 255, cv2.THRESH_BINARY_INV)
    coords = cv2.findNonZero(mask_nw)
    if coords is not None:
        x_, y_, w_, h_ = cv2.boundingRect(coords)
        pad = 3
        map_left  = max(0, x_ - pad)
        map_top   = max(0, y_ - pad)
        map_right = min(img_w - 1, x_ + w_ + pad)
        map_bot   = min(img_h - 1, y_ + h_ + pad)
    else:
        map_left, map_top, map_right, map_bot = 0, 0, img_w - 1, img_h - 1

    map_w = map_right - map_left
    map_h = map_bot   - map_top
    print(f"           地图内容区域: ({map_left},{map_top})→({map_right},{map_bot})")

    # ── 2. 线性仿射: 图像像素 ↔ 游戏坐标 ────────────────────────────────
    # img_x ∈ [map_left, map_right] → game_y ∈ [0, Y_MAX]
    # img_y ∈ [map_top,  map_bot  ] → game_x ∈ [0, X_MAX]
    def img2game(ix: float, iy: float) -> Tuple[float, float]:
        gy = (ix - map_left) / map_w * Y_MAX
        gx = (iy - map_top)  / map_h * X_MAX
        return gx, gy

    def game2img_int(gx: float, gy: float) -> Tuple[int, int]:
        ix = int(round(gy / Y_MAX * map_w + map_left))
        iy = int(round(gx / X_MAX * map_h + map_top))
        return ix, iy

    # ── 3. K-means 颜色聚类 ──────────────────────────────────────────────
    # 裁剪到地图内容区域
    crop = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)[map_top:map_bot+1, map_left:map_right+1]
    crop_h, crop_w = crop.shape[:2]
    crop_flat = crop.reshape(-1, 3).astype(np.float32)

    # 白色背景过滤
    is_white = (crop_flat > 240).all(axis=1)
    colored_mask = ~is_white

    if colored_mask.sum() < 1000:
        print("  [Phase 2] 图像内容不足，跳过")
        return grid

    # 子采样以加速 k-means
    colored_idx = np.where(colored_mask)[0]
    step = max(1, len(colored_idx) // 40000)
    sample = crop_flat[colored_idx[::step]]

    N_CLUSTERS = 25  # 13州 + 背景 + 渐变/边界 — 25 聚类更好分离相近颜色（兖州/凉州等）
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 1.0)
    _, _, km_centers = cv2.kmeans(
        sample, N_CLUSTERS, None, criteria, 10, cv2.KMEANS_PP_CENTERS
    )

    # 用 numpy 批量把所有像素分配到最近聚类中心（分批避免OOM）
    BATCH = 200_000
    cluster_map_flat = np.full(len(crop_flat), -1, dtype=np.int16)
    for start in range(0, len(colored_idx), BATCH):
        batch_idx = colored_idx[start:start + BATCH]
        diffs = crop_flat[batch_idx][:, None, :] - km_centers[None, :, :]
        cluster_map_flat[batch_idx] = np.argmin((diffs * diffs).sum(axis=2), axis=1)

    cluster_map = cluster_map_flat.reshape(crop_h, crop_w)
    print(f"           K-means {N_CLUSTERS} 色聚类完成")

    # ── 4. 色块 → 州 ID 匹配 ──────────────────────────────────────────────
    # 每个聚类取质心，映射到游戏坐标，找最近的州中心
    real_junxians = [j for j in junxians if j["id"] <= 1500]
    rid_to_jlist: dict = _dd(list)
    for j in real_junxians:
        rid_to_jlist[j["regionId"]].append(j)

    # 州级游戏坐标中心
    rid_centers: Dict[int, Tuple[float, float]] = {}
    for rid, jlist in rid_to_jlist.items():
        cx = sum((j["minX"] + j["maxX"]) / 2 for j in jlist) / len(jlist)
        cy = sum((j["minY"] + j["maxY"]) / 2 for j in jlist) / len(jlist)
        rid_centers[rid] = (cx, cy)

    # ── 5-subpart A. 建立 Phase1 网格 rid 查询数组用于投票 ──────────────────
    X_lim_pre = min(X_MAX, 1501)
    STRIDE_pre = Y_MAX + 1
    grid_pre = np.array(grid, dtype=np.int32).reshape(X_MAX + 1, STRIDE_pre)
    cur_jid_pre = grid_pre[X_MIN:X_lim_pre + 1, Y_MIN:Y_MAX + 1]   # (X_range, Y_range)

    gx_arr_pre = np.arange(X_MIN, X_lim_pre + 1, dtype=np.float32)
    gy_arr_pre = np.arange(Y_MIN, Y_MAX + 1, dtype=np.float32)
    GX_pre, GY_pre = np.meshgrid(gx_arr_pre, gy_arr_pre, indexing='ij')

    IX_pre = np.clip((GY_pre / Y_MAX * map_w).astype(np.int32), 0, crop_w - 1)
    IY_pre = np.clip((GX_pre / X_MAX * map_h).astype(np.int32), 0, crop_h - 1)

    img_cluster_pre = cluster_map[IY_pre, IX_pre]   # 每个游戏格 → 图像聚类 id

    # Phase1 rid（仍用于 BBox 后备投票）
    cur_rid_pre = np.zeros_like(cur_jid_pre, dtype=np.int32)
    mask_real = (cur_jid_pre >= 100) & (cur_jid_pre < 1500)
    cur_rid_pre[mask_real] = cur_jid_pre[mask_real] // 100
    cur_rid_pre[cur_jid_pre >= 1501] = 15

    # ── 4a. 锚点法投票 — 用郡BBox真实中心坐标（精确校准），不靠猜测 ────────────
    # 注：下列坐标由实际郡BBox数据计算得出，并经过参考图非白像素验证
    STATE_ANCHORS: Dict[int, Tuple[float, float]] = {
        1:  (719, 646),   # 司隶  RGB≈(222,155,188) 保护州，锚点仅供记录
        3:  (790, 1008),  # 兖州  保护州
        4:  (1001, 909),  # 豫州  保护州
        5:  (405, 1106),  # 冀州  RGB≈(163,180,93)
        6:  (991, 1303),  # 青州  保护州（原锚点压白线，新锚点=东莱郡内）
        7:  (1124, 1284), # 徐州  保护州
        8:  (1307, 898),  # 扬州  RGB≈(139,160,186) 蓝灰色，有效
        9:  (338, 658),   # 并州  RGB≈(216,130,125) 粉橙，有效
        10: (367, 312),   # 凉州  RGB≈(214,189,135) 土黄，有效
        11: (1500, 279),  # 益州  保护州（永昌郡，重新定位）
        12: (285, 1032),  # 幽州  RGB≈(155,205,229) 蓝色（涿郡中心修正）
        13: (1124, 478),  # 荆州  保护州
        15: (1668, 460),  # 交州  保护州（无郡数据，纯Phase1）
    }
    ANCHOR_RADIUS = 100   # 格
    ANCHOR_N = 7

    from collections import Counter as _Counter
    WHITE_THRESH = 215.0
    white_clusters = {
        int(k) for k, center in enumerate(km_centers)
        if min(float(center[0]), float(center[1]), float(center[2])) > WHITE_THRESH
    }
    dark_clusters = {
        int(k) for k, center in enumerate(km_centers)
        if max(float(center[0]), float(center[1]), float(center[2])) < 40.0
    }
    skip_clusters = white_clusters | dark_clusters
    print(f"           排除背景聚类: 白{sorted(white_clusters)} 暗{sorted(dark_clusters)}")

    anchor_cluster_votes: dict = _dd(list)

    # ── 主锚点：手工固定州中心 7×7 网格采样 ──────────────────────────────────
    for rid, (ax, ay) in STATE_ANCHORS.items():
        for si in range(ANCHOR_N):
            for sj in range(ANCHOR_N):
                tx = ax + (si - ANCHOR_N // 2) * ANCHOR_RADIUS / max(1, ANCHOR_N // 2)
                ty = ay + (sj - ANCHOR_N // 2) * ANCHOR_RADIUS / max(1, ANCHOR_N // 2)
                ix_, iy_ = game2img_int(tx, ty)
                ix_ = max(0, min(crop_w - 1, ix_))
                iy_ = max(0, min(crop_h - 1, iy_))
                k = int(cluster_map[iy_, ix_])
                if k < 0 or k in skip_clusters:
                    continue
                anchor_cluster_votes[k].append(rid)

    # ── 补充锚点：郡 BBox 5×5 采样（仅补充尚未命中的聚类）────────────────────
    GRID_N = 5
    INSET  = 0.20
    for j in real_junxians:
        bx0 = j["minX"] + (j["maxX"] - j["minX"]) * INSET
        bx1 = j["maxX"] - (j["maxX"] - j["minX"]) * INSET
        by0 = j["minY"] + (j["maxY"] - j["minY"]) * INSET
        by1 = j["maxY"] - (j["maxY"] - j["minY"]) * INSET
        for si in range(GRID_N):
            for sj in range(GRID_N):
                tx = bx0 + (bx1 - bx0) * si / max(1, GRID_N - 1)
                ty = by0 + (by1 - by0) * sj / max(1, GRID_N - 1)
                ix_, iy_ = game2img_int(tx, ty)
                ix_ = max(0, min(crop_w - 1, ix_))
                iy_ = max(0, min(crop_h - 1, iy_))
                k = int(cluster_map[iy_, ix_])
                if k < 0 or k in skip_clusters:
                    continue
                anchor_cluster_votes[k].append(j["regionId"])

    cluster_to_rid: Dict[int, int] = {}
    for k, votes in anchor_cluster_votes.items():
        if votes:
            cluster_to_rid[k] = int(_Counter(votes).most_common(1)[0][0])

    # ── Debug：打印聚类中心颜色 + 对应州 ─────────────────────────────────────
    print("           聚类中心 → 州映射:")
    for k in sorted(cluster_to_rid):
        c = km_centers[k].astype(int)
        name = REGION_NAMES.get(cluster_to_rid[k], f"rid={cluster_to_rid[k]}")
        print(f"             cluster{k:2d} RGB({c[0]:3d},{c[1]:3d},{c[2]:3d}) → {name}")

    # ── 4b. BBox 后备投票 — 覆盖锚点未命中的聚类 ────────────────────────
    for k in range(N_CLUSTERS):
        if k in cluster_to_rid:
            continue
        km = img_cluster_pre == k
        if not km.any():
            continue
        rids = cur_rid_pre[km]
        rids_nonzero = rids[rids > 0]
        if len(rids_nonzero) < 50:
            continue
        cluster_to_rid[k] = int(_Counter(rids_nonzero.tolist()).most_common(1)[0][0])

    matched_states = len(set(cluster_to_rid.values()))
    print(f"           {len(cluster_to_rid)}/{N_CLUSTERS} 个色块匹配到 {matched_states} 个州"
          f"（锚点{len(anchor_cluster_votes)}+后备）")

    # ── 6. 检测不一致并修正（边界约束版）────────────────────────────────────
    STRIDE = Y_MAX + 1
    grid_np = np.array(grid, dtype=np.int32).reshape(X_MAX + 1, STRIDE)
    cur_jid = grid_np[X_MIN:X_lim_pre + 1, Y_MIN:Y_MAX + 1]  # view

    # Ph1 rid
    cur_rid = np.zeros_like(cur_jid, dtype=np.int32)
    cur_rid[(cur_jid >= 100) & (cur_jid < 1500)] = \
        cur_jid[(cur_jid >= 100) & (cur_jid < 1500)] // 100
    cur_rid[cur_jid >= 1501] = 15

    # img_rid（投票得到的州 id 映射）—— 只处理合法聚类 ID (>=0)
    img_rid2 = np.zeros_like(img_cluster_pre, dtype=np.int32)
    for k, rid in cluster_to_rid.items():
        if k >= 0:
            img_rid2[img_cluster_pre == k] = rid

    # 州不一致格子
    mismatch = (img_rid2 > 0) & (cur_jid > 0) & (cur_rid != img_rid2)

    # ── 全域精化: 修正所有不一致格子 ────────────────────────────────────────
    # 规则：
    # 1. img_rid2 必须属于有可信聚类的州（否则 img_rid2 可能是错配）
    # 2. cur_rid 若属于"无聚类映射的州"（如兖州被K-means漏掉），则保留 Phase1 结果
    matched_rids_set = set(cluster_to_rid.values())
    # 强制保护：参考图中多个州颜色极相似，K-means Phase2 害多于利。
    # 颜色距离分析表明：司隶/兖州/豫州/冀州/青州/徐州/益州/荆州/扬州 都有混淆风险。
    # 剩余 并州(9)/凉州(10)/幽州(12) 颜色足够独特 (dist>45)，但依赖 Phase2 会
    # 引起这三州边界轻微优化 vs 带来邻近州格子错移的风险；为稳定起见全部保护。
    # 结论：Phase2 对所有 13 州全部 FORCE_PROTECT，完全依赖 Phase1 Voronoi。
    FORCE_PROTECT_RIDS = set(REGION_NAMES.keys())  # 保护全部13州
    unmatched_rids = FORCE_PROTECT_RIDS  # 所有州都走 Phase1
    unmatched_rids = (set(REGION_NAMES.keys()) - matched_rids_set) | FORCE_PROTECT_RIDS
    if unmatched_rids:
        print(f"           保护未匹配州 Phase1 结果: {[REGION_NAMES[r] for r in sorted(unmatched_rids)]}")

    # img_rid2 → 有可信聚类
    safe_img_rid = np.isin(img_rid2, np.array(sorted(matched_rids_set), dtype=np.int32))
    # cur_rid → 不属于未匹配州（不保护未匹配州已经处于Phase1正确位置的格子）
    protect_mask = np.isin(cur_rid, np.array(sorted(unmatched_rids), dtype=np.int32))

    to_fix = mismatch & safe_img_rid & ~protect_mask
    n_mismatch = int(to_fix.sum())
    print(f"           全域不一致格子: {n_mismatch:,}（全局精化，无边界限制）")

    # 预索引: 州 → numpy [cx,cy,jid]
    rid_jarray: Dict[int, np.ndarray] = {}
    for rid, jlist in rid_to_jlist.items():
        rid_jarray[rid] = np.array(
            [[(j["minX"] + j["maxX"]) / 2,
              (j["minY"] + j["maxY"]) / 2,
              j["id"]] for j in jlist], dtype=np.float32
        )
    jiao_list = [j for j in junxians if j["id"] >= 1501]
    if jiao_list:
        rid_jarray[15] = np.array(
            [[(j["minX"] + j["maxX"]) / 2,
              (j["minY"] + j["maxY"]) / 2,
              j["id"]] for j in jiao_list], dtype=np.float32
        )

    # ── 向量化最近郡分配（按州批处理，避免 Python for 循环）────────────────
    grid_arr = np.array(grid, dtype=np.int32)
    refined = 0

    for target_rid in sorted(set(int(v) for v in img_rid2[to_fix].ravel())):
        if target_rid <= 0 or target_rid not in rid_jarray:
            continue
        state_mask = to_fix & (img_rid2 == target_rid)
        xi_arr, yi_arr = np.where(state_mask)
        if len(xi_arr) == 0:
            continue

        # 游戏坐标 (N, 1)
        gx_v = (X_MIN + xi_arr).astype(np.float32)[:, None]
        gy_v = (Y_MIN + yi_arr).astype(np.float32)[:, None]

        jarr  = rid_jarray[target_rid]   # (M, 3): [cx, cy, jid]
        jcx_v = jarr[:, 0][None, :]      # (1, M)
        jcy_v = jarr[:, 1][None, :]      # (1, M)

        # 分批处理避免超大内存 (50K × M)
        BATCH_N = 50_000
        new_jids = np.empty(len(xi_arr), dtype=np.int32)
        for b in range(0, len(xi_arr), BATCH_N):
            sl = slice(b, b + BATCH_N)
            dists = (gx_v[sl] - jcx_v) ** 2 + (gy_v[sl] - jcy_v) ** 2
            new_jids[sl] = jarr[np.argmin(dists, axis=1), 2].astype(np.int32)

        flat_idx = (X_MIN + xi_arr) * STRIDE + (Y_MIN + yi_arr)
        grid_arr[flat_idx] = new_jids
        refined += len(xi_arr)

    grid[:] = grid_arr.tolist()
    print(f"           精化了 {refined:,} 个格子（全域州色块匹配）")
    return grid

# ── RLE 压缩 ─────────────────────────────────────────────────────────────────

def compress_to_rle(grid: list) -> dict:
    """
    按行 RLE 压缩：跳过全零行，仅记录有郡归属的行段
    格式: { "行x": [[y起, y止, junxian_id], ...], ... }
    """
    STRIDE = Y_MAX + 1
    rows_rle: dict = {}
    for x in range(X_MIN, X_MAX + 1):
        base   = x * STRIDE
        runs: list = []
        cur_id    = 0
        run_start = Y_MIN
        for y in range(Y_MIN, Y_MAX + 1):
            cell = grid[base + y]
            if cell != cur_id:
                if cur_id != 0:
                    runs.append([run_start, y - 1, cur_id])
                cur_id    = cell
                run_start = y
        if cur_id != 0:
            runs.append([run_start, Y_MAX, cur_id])
        if runs:
            rows_rle[str(x)] = runs
    return rows_rle

# ── 调试 SVG ──────────────────────────────────────────────────────────────────

def generate_debug_svg(rows_rle: dict, junxians: List[dict]) -> str:
    """生成可视化 SVG（按游戏坐标绘制，直观验证郡归属）"""
    # 每格 → SVG 像素换算（缩小到合适尺寸）
    SCALE = 0.8
    LEGEND_H = 50
    SVG_W  = int((Y_MAX - Y_MIN + 1) * SCALE) + 40
    SVG_H  = int((X_MAX - X_MIN + 1) * SCALE) + 60 + LEGEND_H

    # 构造 junxian_id → regionId 的查找表
    jid2reg = {j["id"]: j["regionId"] for j in junxians}

    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{SVG_W}" height="{SVG_H}" '
        f'style="background:#1a1a2e">',
        '<style>.lbl{font-size:7px;fill:#fff;text-anchor:middle;'
        'dominant-baseline:central;font-family:sans-serif;}'
        '.st{font-size:11px;fill:#fff;text-anchor:middle;'
        'dominant-baseline:central;font-family:sans-serif;font-weight:bold;'
        'paint-order:stroke;stroke:#000;stroke-width:2.5px;}</style>',
        f'<text x="{SVG_W//2}" y="14" style="font-size:14px;fill:#ffd700;'
        f'text-anchor:middle;font-family:sans-serif;font-weight:bold">'
        f'全国郡归属格图 ({X_MAX}×{Y_MAX})</text>',
    ]

    def to_svg(game_x, game_y):
        sx = (game_y - Y_MIN) * SCALE + 20
        sy = (game_x - X_MIN) * SCALE + 20
        return sx, sy

    # 绘制每个 run 作为矩形条带
    for x_str, runs in rows_rle.items():
        x = int(x_str)
        h = max(1, SCALE)
        for (y0, y1, jid) in runs:
            reg = jid2reg.get(jid, 0)
            color = REGION_COLORS.get(reg, "#555")
            sx_start = (y0 - Y_MIN) * SCALE + 20
            w = (y1 - y0 + 1) * SCALE
            sy_pos = (x - X_MIN) * SCALE + 20
            lines.append(
                f'<rect x="{sx_start:.1f}" y="{sy_pos:.1f}" '
                f'width="{w:.1f}" height="{h:.1f}" '
                f'fill="{color}" fill-opacity="0.7" stroke="none"/>'
            )

    # ── 添加州名标签 ───────────────────────────────────────────────────────
    # 对每个 regionId 计算所有归属格子的质心
    reg_cells_xy: Dict[int, List[Tuple[int, int]]] = defaultdict(list)
    for x_str, runs in rows_rle.items():
        x = int(x_str)
        for (y0, y1, jid) in runs:
            reg = jid2reg.get(jid, 0)
            mid_y = (y0 + y1) // 2
            reg_cells_xy[reg].append((x, mid_y))

    for reg, cells in reg_cells_xy.items():
        if reg == 0:
            continue
        avg_x = sum(c[0] for c in cells) / len(cells)
        avg_y = sum(c[1] for c in cells) / len(cells)
        sx, sy = to_svg(avg_x, avg_y)
        name = REGION_NAMES.get(reg, f"#{reg}")
        lines.append(
            f'<text x="{sx:.1f}" y="{sy:.1f}" class="st">{name}</text>'
        )

    # ── 底部图例（仅显示有数据的州）────────────────────────────────────────
    active_regs = set(reg_cells_xy.keys()) - {0}
    legend_y = SVG_H - LEGEND_H + 10
    sw = 14  # 色块宽度
    gap = 5
    items = [(rid, REGION_NAMES.get(rid, f"#{rid}")) for rid in sorted(active_regs)]
    total_w = len(items) * (sw + gap + 30)
    start_x = max(10, (SVG_W - total_w) // 2)
    cx = start_x
    for rid, rname in items:
        color = REGION_COLORS.get(rid, "#555")
        lines.append(
            f'<rect x="{cx}" y="{legend_y}" width="{sw}" height="{sw}" '
            f'fill="{color}" rx="2"/>'
        )
        lines.append(
            f'<text x="{cx + sw + 3}" y="{legend_y + sw//2 + 1}" '
            f'style="font-size:9px;fill:#ccc;font-family:sans-serif;'
            f'dominant-baseline:central">{rname}</text>'
        )
        cx += sw + gap + 35

    lines.append(f'<text x="10" y="{SVG_H - 5}" style="font-size:8px;fill:#666;'
                 f'font-family:sans-serif">坐标系: X南↓ Y东→ | '
                 f'网格: {X_MIN}~{X_MAX} × {Y_MIN}~{Y_MAX}</text>')
    lines.append("</svg>")
    return "\n".join(lines)


# ── Plan A Phase2: 参考图逐像素颜色直接匹配（替代 K-means）─────────────────────
def phase2_direct_color_match(grid: list, image_path: pathlib.Path,
                               junxians: List[dict]) -> list:
    """
    Plan A Phase2: 参考图逐像素颜色匹配，替代 K-means。
    策略：每格 → 参考图像素 → 最近颜色州 → 置信度>0.72 则覆盖 Phase1。
    白色像素（郡边界线）和同色相邻组内竞争时，Phase1 胜出。
    颜色表由郡中心周边像素运行时自动采样建立，无需硬编码。

    同色相邻组（Phase1 胜出，颜色无法可靠分离）:
      {益州11, 荆州13}  颜色距离≈19
      {兖州3,  豫州4}   颜色距离≈23
      {扬州8,  交州15}  颜色距离≈21
    """
    try:
        import numpy as np
        from PIL import Image as _PIL
    except ImportError:
        print("  [Plan A] 跳过: 需要 numpy + Pillow")
        return grid

    img = np.array(_PIL.open(str(image_path)).convert('RGB'), dtype=np.float32)
    IH, IW = img.shape[:2]
    print(f"  [Plan A Phase2] 参考图 {IW}×{IH} px, 建颜色表 ...")

    # ── 郡中心周边采样 → per-state 均值颜色 ──────────────────────────────────
    with open(str(MAP_REGIONS_JSON), encoding='utf-8') as _f:
        _jxl: List[dict] = json.load(_f)['junxian']

    def _g2i(gx: float, gy: float) -> Tuple[int, int]:
        col = int(round((float(gy) - 1) / Y_MAX * (IW - 1)))
        row = int(round((float(gx) - 1) / X_MAX * (IH - 1)))
        return max(0, min(IW - 1, col)), max(0, min(IH - 1, row))

    _rs: Dict[int, List[float]] = {r: [] for r in REGION_NAMES}
    _gs: Dict[int, List[float]] = {r: [] for r in REGION_NAMES}
    _bs: Dict[int, List[float]] = {r: [] for r in REGION_NAMES}

    def _collect(gx: float, gy: float, rid: int) -> None:
        for dx in range(-25, 26, 5):
            for dy in range(-25, 26, 5):
                col, row = _g2i(gx + dx, gy + dy)
                rv, gv, bv = img[row, col]
                if rv < 220 or gv < 220:   # 排除白色郡边界像素
                    _rs[rid].append(float(rv))
                    _gs[rid].append(float(gv))
                    _bs[rid].append(float(bv))

    for _j in _jxl:
        _rid = _j.get('effectiveRegionId', 0)
        if _rid not in REGION_NAMES:
            continue
        _c = _j.get('center', {})
        _gx, _gy = _c.get('x', 0), _c.get('y', 0)
        if _gx > 0 and _gy > 0:
            _collect(_gx, _gy, _rid)

    for (_, _nm, _rid_j, _x0, _x1, _y0, _y1) in JIAOZHOU_JUNXIAN:
        _collect((_x0 + _x1) / 2, (_y0 + _y1) / 2, _rid_j)

    rid_list = sorted(REGION_NAMES.keys())
    ctbl = np.zeros((len(rid_list), 3), dtype=np.float32)
    for i, rid in enumerate(rid_list):
        _n = len(_rs[rid])
        if _n > 0:
            ctbl[i] = [sum(_rs[rid]) / _n, sum(_gs[rid]) / _n, sum(_bs[rid]) / _n]
        else:
            ctbl[i] = [180., 180., 150.]
        _cv = ctbl[i].astype(int)
        print(f"    {REGION_NAMES[rid]}({rid:2d}): n={_n:4d}  RGB({_cv[0]},{_cv[1]},{_cv[2]})")

    # ── 同色相邻组，组内竞争时 Phase1 胜出 ────────────────────────────────────
    SAME_ADJ: List[set] = [
        {11, 13},   # 益州 vs 荆州  颜色距离≈19
        {3, 4},     # 兖州 vs 豫州  颜色距离≈23
        {8, 15},    # 扬州 vs 交州  颜色距离≈21
    ]

    # ── Per-rid 郡坐标数组（重新分配时寻找最近郡）────────────────────────────
    _r2jl: Dict[int, List[dict]] = defaultdict(list)
    for _j2 in junxians:
        _r2jl[_j2['regionId']].append(_j2)
    _rja: Dict[int, np.ndarray] = {
        rid: np.array(
            [[(_j3['minX'] + _j3['maxX']) / 2.,
              (_j3['minY'] + _j3['maxY']) / 2.,
              float(_j3['id'])]
             for _j3 in jl],
            dtype=np.float32
        )
        for rid, jl in _r2jl.items()
    }

    # ── 全量向量化逐行处理 ─────────────────────────────────────────────────
    print("    逐行颜色匹配 ...")
    STR = Y_MAX + 1
    gnp = np.array(grid, dtype=np.int32)
    maxjid = max(_j4['id'] for _j4 in junxians)
    j2r = np.zeros(maxjid + 2, dtype=np.int32)
    for _j4 in junxians:
        if _j4['id'] <= maxjid:
            j2r[_j4['id']] = _j4['regionId']

    cols = np.clip(
        np.round((np.arange(Y_MIN, Y_MAX + 1, dtype=np.float32) - 1) / Y_MAX * (IW - 1)
                 ).astype(np.int32), 0, IW - 1
    )
    rid_arr = np.array(rid_list, dtype=np.int32)
    changed = 0

    for xi, gx in enumerate(range(X_MIN, X_MAX + 1)):
        if xi % 400 == 0:
            print(f"    {xi * 100 // (X_MAX - X_MIN + 1):3d}%", end='\r', flush=True)
        ri = int(round((gx - 1) / X_MAX * (IH - 1)))
        ri = max(0, min(IH - 1, ri))
        pix = img[ri, cols, :]                  # (Y, 3)
        white = (pix[:, 0] > 215) & (pix[:, 1] > 215) & (pix[:, 2] > 215)
        base = gx * STR
        cj = gnp[base + Y_MIN: base + Y_MAX + 1]   # view (Y,)
        vmask = (cj > 0) & ~white
        if not vmask.any():
            continue

        vi = np.where(vmask)[0]
        pv = pix[vi]                            # (V, 3)
        diff = pv[:, None, :] - ctbl[None, :, :]    # (V, K, 3)
        dst = np.sqrt((diff * diff).sum(2))          # (V, K)
        si = np.argsort(dst, 1)
        ni, sei = si[:, 0], si[:, 1]
        nrid = rid_arr[ni]; srid = rid_arr[sei]
        nd = dst[np.arange(len(vi)), ni]
        sd = dst[np.arange(len(vi)), sei]
        conf = (sd > 1.) & ((nd / np.maximum(sd, 1e-6)) < 0.72)

        for grp in SAME_ADJ:
            ga = np.array(sorted(grp), dtype=np.int32)
            conf &= ~(np.isin(nrid, ga) & np.isin(srid, ga))

        crv = j2r[np.clip(cj[vi], 0, maxjid)]
        fix = conf & (nrid != crv)
        if not fix.any():
            continue

        bmap: Dict[int, List[Tuple[int, int]]] = defaultdict(list)
        for fi in np.where(fix)[0]:
            bmap[int(nrid[fi])].append((int(vi[fi]), Y_MIN + int(vi[fi])))

        for trid, yl in bmap.items():
            if trid not in _rja:
                continue
            jt = _rja[trid]
            gs = np.array([y for _, y in yl], dtype=np.float32)
            dj = (float(gx) - jt[:, 0][None, :]) ** 2 + \
                 (gs[:, None] - jt[:, 1][None, :]) ** 2   # (M_y, M_j)
            bj = jt[np.argmin(dj, 1), 2].astype(np.int32)
            for k, (yp, _) in enumerate(yl):
                gnp[base + Y_MIN + yp] = bj[k]
                changed += 1

    print(f"\n  [Plan A] 完成: 修正 {changed:,} 格")
    return gnp.tolist()


# ── 主程序 ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="generate_tile_regions.py")
    parser.add_argument("--image", type=pathlib.Path, default=None,
                        help="历史参考图路径 (启用 Phase 2 精化)")
    parser.add_argument("--phase1-only", action="store_true",
                        help="强制仅用 Phase 1 BBox 近似")
    args = parser.parse_args()

    print("=== 全国地图逐格郡归属数据生成 ===")
    t0 = time.time()

    # ── 1. 加载郡数据 ────────────────────────────────────────────────────────
    print("加载 map_regions.json...")
    junxians = load_all_junxians()
    print(f"  共 {len(junxians)} 郡（含交州 7 个合成郡）")

    # ── 2. Phase 1: Voronoi + BBox 光栅化（最近中心法，修复中原小州被大州BBox覆盖）
    grid = phase1_voronoi_rasterize(junxians)

    # ── 2.5 版图遮罩: 清除海洋/沙漠外的格子 ────────────────────────────────
    grid = apply_border_mask(grid)

    # ── 3. Phase 2: 图像精化（可选）────────────────────────────────────────
    if args.image and not args.phase1_only:
        if args.image.exists():
            grid = phase2_direct_color_match(grid, args.image, junxians)
            # Phase 2 可能把格子移到版图外 → 二次遮罩清理
            grid = apply_border_mask(grid)
        else:
            print(f"  [Phase 2] 图片不存在: {args.image}, 跳过精化")
    elif not args.image:
        print("  提示: 使用 --image <历史参考图.png> 可启用 Phase 2 形状精化")

    # ── 4. RLE 压缩 ─────────────────────────────────────────────────────────
    print("RLE 压缩...")
    rows_rle = compress_to_rle(grid)
    active_rows = len(rows_rle)
    total_runs  = sum(len(v) for v in rows_rle.values())
    print(f"  有效行: {active_rows} | 总 run 段: {total_runs}")

    # ── 5. 写出 JSON ──────────────────────────────────────────────────────
    output = {
        "_meta": {
            "description": "逐格郡归属数据，RLE 行压缩，Phase 1 BBox 近似",
            "version": 1,
            "gridXRange": [X_MIN, X_MAX],
            "gridYRange": [Y_MIN, Y_MAX],
            "defaultValue": 0,
            "coordinateSystem": "pos=x*10000+y, X南↓ Y东→",
            "jiaozhou": "id=15, 郡id 1501-1507 为合成ID，交州x范围约[1440,1851]",
            "rowFormat": "rows[x] = [[y_start, y_end_inclusive, junxian_id], ...]",
        },
        "junxianMeta": build_junxian_meta(junxians),
        "rows": rows_rle,
    }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = OUTPUT_JSON.stat().st_size / 1024
    print(f"输出 JSON: {OUTPUT_JSON} ({size_kb:.1f} KB)")

    # ── 6. 调试 SVG ──────────────────────────────────────────────────────
    print("生成调试 SVG...")
    svg_content = generate_debug_svg(rows_rle, junxians)
    DEBUG_SVG.parent.mkdir(parents=True, exist_ok=True)
    with open(DEBUG_SVG, "w", encoding="utf-8") as f:
        f.write(svg_content)
    print(f"输出 SVG : {DEBUG_SVG}")

    # ── 7. 统计 ──────────────────────────────────────────────────────────
    print()
    print("=== 郡归属统计 ===")
    STRIDE = Y_MAX + 1
    jcount: Counter = Counter()
    for x in range(X_MIN, X_MAX + 1):
        base = x * STRIDE
        for y in range(Y_MIN, Y_MAX + 1):
            v = grid[base + y]
            if v:
                jcount[v] += 1

    # 按 regionId 分组统计
    reg_cells: Counter = Counter()
    jid2reg = {j["id"]: j["regionId"] for j in junxians}
    reg_names = {j["regionId"]: "" for j in junxians}
    for j in junxians:
        reg_names[j["regionId"]] = ""
    # 从 map_regions.json 取州名
    with open(MAP_REGIONS_JSON, encoding="utf-8") as f:
        mdata = json.load(f)
    for p in mdata.get("provinces", []):
        reg_names[p["regionId"]] = p["name"]
    reg_names[15] = "交州"

    for jid, cnt in jcount.items():
        reg = jid2reg.get(jid, 0)
        reg_cells[reg] += cnt

    for rid in sorted(reg_cells.keys()):
        n = reg_names.get(rid, f"州{rid}")
        print(f"  {n:<5} (id={rid:2d}): {reg_cells[rid]:>8,} 格")

    unassigned = sum(1 for x in range(X_MIN, X_MAX+1)
                     for y in range(Y_MIN, Y_MAX+1)
                     if grid[x * STRIDE + y] == 0)
    total = (X_MAX - X_MIN + 1) * (Y_MAX - Y_MIN + 1)
    print(f"  未分配: {unassigned:,} / {total:,} 格 ({unassigned/total*100:.1f}%)")
    print(f"\n总耗时: {time.time()-t0:.1f}s")
    print("\n=== 下一步 ===")
    print("  1. 浏览器打开 tmp/map_tile_regions_debug.svg 验证形状")
    print("  2. 准备历史参考图: cp <图片路径> tmp/historical_map.png")
    print("     然后: py -3 scripts/generate_tile_regions.py --image tmp/historical_map.png")
    print("  3. Unity C# 读取 StreamingAssets/map_tile_regions.json")
    print("     可在 MapRegionsData.cs 添加 GetJunxianIdAt(int x, int y) 方法")


if __name__ == "__main__":
    main()
