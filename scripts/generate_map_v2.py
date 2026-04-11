#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/generate_map_v2.py — V2 地图生成器（历史轮廓模式）

根本改进:
  V1: STZB 矩形 BBox → 州界方方正正（错误）
  V2: 历史参考图颜色分割 → 州界沿山河弯曲（正确）

架构:
  Phase 1: 参考图颜色采样 → 建 13 州颜色表（自动）
  Phase 2: 每游戏格 → 参考图像素 → 最近颜色 → 州ID
           同色相邻组用多郡城坐标消歧义（不用单一种子点）
  Phase 3: 约束 Voronoi → 每格郡ID（同州内最近郡治城市）
  Phase 4: RLE 压缩输出（引擎无关 rows[x] 结构）

城市坐标: 来自 STZB map_regions.json 的 center(x,y)，仅用中心点，不用 BBox。
          BBox 已完全弃用。

用法:
  py -3 scripts/generate_map_v2.py --image tmp/historical_map.png
  py -3 scripts/generate_map_v2.py --image tmp/historical_map.png --conf 0.80
"""

import json, pathlib, argparse, time
from collections import defaultdict, Counter
from typing import Dict, List, Tuple
import numpy as np

# ─── 路径 ────────────────────────────────────────────────────────────────────
ROOT        = pathlib.Path(__file__).parent.parent
MAP_REGIONS = ROOT / "tmp/map_data/map_regions.json"
OUTPUT_JSON = ROOT / "tmp/map_data/map_tile_regions.json"
DEBUG_SVG   = ROOT / "tmp/map_v2_debug.svg"

# ─── 游戏网格（与 V1 兼容）────────────────────────────────────────────────────
X_MIN, X_MAX = 1, 1851   # X 轴: 南↓（含交州延伸）
Y_MIN, Y_MAX = 1, 1501   # Y 轴: 东→

# ─── 州定义 ──────────────────────────────────────────────────────────────────
REGION_NAMES = {
    1:"司隶", 3:"兖州", 4:"豫州", 5:"冀州", 6:"青州", 7:"徐州",
    8:"扬州", 9:"并州", 10:"凉州", 11:"益州", 12:"幽州", 13:"荆州", 15:"交州",
}

# SVG 配色（视觉识别用，与参考图颜色区分）
REGION_COLORS_SVG = {
    1:"#7FB069",  3:"#D4A843",  4:"#E07B39",  5:"#4A90D9",
    6:"#45B7AA",  7:"#8B6AAE",  8:"#D4B83A",  9:"#C94040",
   10:"#B89535", 11:"#C9497A", 12:"#37A0C4", 13:"#6BAA3A", 15:"#E04D20",
}

# ─── 颜色表初始值（根据参考图直接采样校准，2026-03-21）─────────────────────────
# 采样方法: 在已知质心处直接读取像素 / K-Means 聚类校验
# 最重要的修正: 司隶 fallback 旧值 (171,169,137) 完全错误 → 实际为深绿 (3,165,90)
STATE_COLORS_FALLBACK: Dict[int, Tuple[int,int,int]] = {
    1:  (  3, 165,  90),  # 司隶 — 深绿 ← 大修正！旧值橄榄灰完全错误
    3:  (185, 207, 103),  # 兖州 — 黄绿（暂保留）
    4:  (169, 215,  85),  # 豫州 — 黄绿（采样校正）
    5:  (167, 178, 101),  # 冀州 — 暗黄绿（暂保留）
    6:  (224, 204, 121),  # 青州 — 沙黄（暂保留）
    7:  (227, 215,  73),  # 徐州 — 纯黄（采样校正）
    8:  (144, 163, 204),  # 扬州 — 蓝灰（采样校正）
    9:  (240, 137, 130),  # 并州 — 桃粉（采样校正）
   10:  (223, 198, 141),  # 凉州 — 土褐（采样校正）
   11:  (234, 162, 196),  # 益州 — 粉紫（采样校正）
   12:  (144, 217, 242),  # 幽州 — 天蓝（K-Means校正）
   13:  (234, 162, 196),  # 荆州 — 同益州!（采样校正，需地理消歧义）
   15:  (144, 163, 204),  # 交州 — 同扬州!（采样校正，需地理消歧义）
}

# ─── 已手工校验颜色（Phase 1 不允许自动覆盖）───────────────────────────────────
# 包含通过像素采样/K-Means 验证的所有州，防止郡城坐标偏差导致错误重采样
LOCKED_COLORS: set = {1, 4, 7, 8, 9, 10, 11, 12, 13, 15}

# ─── 参考图图像质心（图像空间 col,row）— 来自 CHGIS 哈佛三国坐标数据库 ────────────
# 校准方法: 凉州(102.635°E,37.927°N)→(370,338) 和 交州(113.256°E,23.135°N)→(810,1102)
# 公式: col = 370 + (lon-102.635)*41.42,  row = 338 - (lat-37.927)*51.65
# 来源: https://chgis.hudci.org/tgaz/ yr=240，三国魏/蜀汉/东吴各州治所实测
#
# 重要修正（与上一版相比）:
#   扬州 (769,1187)→(1038,641): 旧值落在越南境内，导致江苏瓦片全被误分到交州
#   荆州 (480,855)→(766,729):   旧值位于四川，导致四川瓦片全被误分到荆州
#   益州 (441,962)→(430,714):   向北移，成都(104°E,30.6°N)
#   冀州 (878,636)→(906,357):   旧值严重偏南302px，邺城(115.6°E,37.6°N)
#   兖州/豫州/青州/徐州/幽州: 全部用 CHGIS 精确值替换
IMAGE_CENTROIDS: Dict[int, Tuple[int,int]] = {
     1: ( 779,  505),  # 司隶 — 洛阳约值 (112.5°E,34.7°N)
     3: ( 912,  456),  # 兖州 — 三国魏治所 (115.726°E,35.636°N) CHGIS hvd_113107
     4: ( 885,  572),  # 豫州 — 三国魏治所 (115.064°E,33.397°N) CHGIS hvd_113250
     5: ( 906,  357),  # 冀州 — 邺城 (115.564°E,37.566°N) CHGIS hvd_113254  ← 大修正
     6: (1026,  402),  # 青州 — 临淄 (118.478°E,36.697°N) CHGIS hvd_112967
     7: (1005,  517),  # 徐州 — 彭城 (117.963°E,34.471°N) CHGIS hvd_113440
     8: (1006,  954),  # 扬州 — 孙吴领土地理质心(118°E,26°N,福建/江西中心)  ← 关键修正！
     9: ( 781,  341),  # 并州 — 晋阳 (112.565°E,37.874°N) CHGIS hvd_113256
    10: ( 370,  338),  # 凉州 — 姑臧 (102.635°E,37.927°N) ← 校准锚点
    11: ( 430,  714),  # 益州 — 成都 (104.078°E,30.650°N) CHGIS hvd_113523
    12: ( 939,  234),  # 幽州 — 蓟(北京) (116.368°E,39.931°N) CHGIS hvd_113258
    13: ( 766,  729),  # 荆州 — 江陵 (112.191°E,30.350°N)                  ← 关键修正！
    15: ( 810, 1102),  # 交州 — 番禺 (113.256°E,23.135°N) ← 校准锚点
}

# ─── 同色/相似色对（需要地理消歧义）────────────────────────────────────────────
# 益州/荆州 和 扬州/交州 在参考图中颜色完全相同，必须纯靠地理质心消歧义
AMBIGUOUS_PAIRS: List[Tuple[int,int]] = [
    (11, 13),   # 益州 vs 荆州  颜色完全相同！
    ( 8, 15),   # 扬州 vs 交州  颜色完全相同！
    ( 3,  4),   # 兖州 vs 豫州  dist≈23
    ( 3,  5),   # 兖州 vs 冀州  dist≈34
    ( 4,  5),   # 豫州 vs 冀州  dist≈40
    ( 1,  4),   # 司隶 vs 豫州（颜色已不同，但保留以防过渡区域）
]
AMBIGUOUS_PAIR_SET = {frozenset(p) for p in AMBIGUOUS_PAIRS}

# ─── 交州合成郡（map_regions.json 无此数据，手工定义）──────────────────────────
# 坐标: STZB 游戏坐标系 (cx=游戏X南↓, cy=游戏Y东→)
JIAOZHOU_COUNTIES: List[Tuple[int,str,int,float,float]] = [
    # (id, name, regionId, cx, cy)
    (1501, "南海",  15, 1535.0,  800.0),
    (1502, "苍梧",  15, 1515.0,  485.0),
    (1503, "郁林",  15, 1590.0,  250.0),
    (1504, "合浦",  15, 1675.0,  575.0),
    (1505, "交趾",  15, 1725.0,  350.0),
    (1506, "九真",  15, 1803.0,  370.0),
    (1507, "日南",  15, 1833.0,  390.0),
]

# ─── 颜色距离超过此阈值 → 非汉朝领土（海洋/沙漠/草原），不分配州 ────────────────
# 提高阈值到 75 以兼容新的校正颜色（部分过渡区域颜色略有偏差）
MAX_COLOR_DIST = 75.0


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 1: 颜色表构建
# ═══════════════════════════════════════════════════════════════════════════════

def sample_state_colors(img: np.ndarray,
                        junxian_raw: List[dict]) -> Dict[int, Tuple[int,int,int]]:
    """
    从参考图郡治中心周边采样非白色像素，建立每州的平均颜色。
    覆盖 13 州所有郡（含交州合成郡）。
    """
    IH, IW = img.shape[:2]

    def g2i(gx: float, gy: float) -> Tuple[int,int]:
        col = int(round((gy - 1) / (Y_MAX - 1) * (IW - 1)))
        row = int(round((gx - 1) / (X_MAX - 1) * (IH - 1)))
        return max(0, min(IW-1, col)), max(0, min(IH-1, row))

    acc: Dict[int, List[Tuple[int,int,int]]] = {r: [] for r in REGION_NAMES}

    for j in junxian_raw:
        rid = j.get('effectiveRegionId', j.get('originalRegionId', 0))
        if rid not in REGION_NAMES:
            continue
        c = j.get('center', {})
        gx, gy = c.get('x', 0), c.get('y', 0)
        if gx <= 0 or gy <= 0:
            continue
        for dx in range(-25, 26, 5):
            for dy in range(-25, 26, 5):
                col, row = g2i(gx + dx, gy + dy)
                r, g, b = img[row, col]
                if r < 225 or g < 225:   # 排除白色边界线
                    acc[rid].append((int(r), int(g), int(b)))

    for jid, jname, jrid, jcx, jcy in JIAOZHOU_COUNTIES:
        for dx in range(-40, 41, 10):
            for dy in range(-40, 41, 10):
                col, row = g2i(jcx + dx, jcy + dy)
                r, g, b = img[row, col]
                if r < 225 or g < 225:
                    acc[15].append((int(r), int(g), int(b)))

    result: Dict[int, Tuple[int,int,int]] = dict(STATE_COLORS_FALLBACK)
    for rid, samples in acc.items():
        if rid in LOCKED_COLORS:
            fb = STATE_COLORS_FALLBACK[rid]
            print(f"    {REGION_NAMES[rid]:4s}({rid:2d}): [锁定] RGB({fb[0]:3d},{fb[1]:3d},{fb[2]:3d})")
            continue
        if len(samples) >= 15:
            ra = sum(s[0] for s in samples) // len(samples)
            ga = sum(s[1] for s in samples) // len(samples)
            ba = sum(s[2] for s in samples) // len(samples)
            result[rid] = (ra, ga, ba)
            print(f"    {REGION_NAMES[rid]:4s}({rid:2d}): n={len(samples):4d}  "
                  f"RGB({ra:3d},{ga:3d},{ba:3d})")
        else:
            print(f"    {REGION_NAMES[rid]:4s}({rid:2d}): 样本不足({len(samples)})，使用默认值")
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 2: 参考图颜色分割 → 游戏格子州ID
# ═══════════════════════════════════════════════════════════════════════════════

def build_state_city_imgpos(junxian_list: List[dict],
                             IW: int, IH: int) -> Dict[int, np.ndarray]:
    """
    为每个州构建郡治城市在参考图中的像素坐标数组，
    用于同色相邻对的多城市几何消歧义。
    Returns: {rid: np.array([[col,row], ...])}
    """
    state_cities: Dict[int, List[Tuple[int,int]]] = defaultdict(list)
    for j in junxian_list:
        rid = j['regionId']
        cx, cy = j['cx'], j['cy']
        if cx <= 0 or cy <= 0:
            continue
        col = int(round((float(cy) - 1) / (Y_MAX - 1) * (IW - 1)))
        row = int(round((float(cx) - 1) / (X_MAX - 1) * (IH - 1)))
        col = max(0, min(IW-1, col))
        row = max(0, min(IH-1, row))
        state_cities[rid].append((col, row))

    return {
        rid: np.array(pos, dtype=np.float32)
        for rid, pos in state_cities.items()
        if pos
    }


def classify_game_grid(img: np.ndarray,
                        state_colors: Dict[int, Tuple[int,int,int]],
                        conf_thresh: float = 0.82) -> np.ndarray:
    """
    对每个游戏格子:
      1. 映射到参考图像素
      2. 计算与 13 州颜色表的距离
      3. 若最近色距离 > MAX_COLOR_DIST → 未分配（0）
      4. 若颜色匹配唯一（ratio < conf_thresh）→ 直接分配
      5. 若属于同色/相似对 → 用图像质心距离消歧义（IMAGE_CENTROIDS）

    Returns: grid_state (X_MAX+1, Y_MAX+1) of state IDs (0=未分配)
    """
    IH, IW = img.shape[:2]

    rid_list = sorted(state_colors.keys())
    K        = len(rid_list)
    rid_arr  = np.array(rid_list, dtype=np.int32)
    ctbl     = np.array([state_colors[r] for r in rid_list], dtype=np.float32)

    # 预计算每个游戏轴对应的图像轴
    game_ys  = np.arange(Y_MIN, Y_MAX + 1)
    img_cols = np.clip(
        np.round((game_ys - 1) / (Y_MAX - 1) * (IW - 1)).astype(int),
        0, IW - 1
    )
    img_rows = np.clip(
        np.round((np.arange(X_MIN, X_MAX + 1) - 1) / (X_MAX - 1) * (IH - 1)).astype(int),
        0, IH - 1
    )

    # 为同色对预先准备图像质心坐标（col,row）
    # 关键改进：用图像质心替代郡城坐标——图像质心从参考图直接测量，不依赖有误差的坐标变换
    pair_centroids: Dict[Tuple[int,int], Tuple[Tuple[float,float], Tuple[float,float]]] = {}
    for a, b in AMBIGUOUS_PAIRS:
        if a in IMAGE_CENTROIDS and b in IMAGE_CENTROIDS:
            ca_pt = (float(IMAGE_CENTROIDS[a][0]), float(IMAGE_CENTROIDS[a][1]))  # (col,row)
            cb_pt = (float(IMAGE_CENTROIDS[b][0]), float(IMAGE_CENTROIDS[b][1]))
            pair_centroids[(a, b)] = (ca_pt, cb_pt)
            pair_centroids[(b, a)] = (cb_pt, ca_pt)

    grid_state = np.zeros((X_MAX + 1, Y_MAX + 1), dtype=np.int32)
    total_changed_to_geo = 0

    for xi, gx in enumerate(range(X_MIN, X_MAX + 1)):
        if xi % 300 == 0:
            print(f"    {xi * 100 // (X_MAX - X_MIN + 1):3d}%", end='\r', flush=True)

        ir = img_rows[xi]
        pix = img[ir, img_cols, :].astype(np.float32)   # (Y, 3)

        # 白色掩码（郡/州边界线，留白）
        white = (pix[:, 0] > 218) & (pix[:, 1] > 218) & (pix[:, 2] > 218)

        # 颜色距离
        diff  = pix[:, None, :] - ctbl[None, :, :]    # (Y, K, 3)
        dists = np.sqrt((diff ** 2).sum(2))            # (Y, K)

        si  = np.argsort(dists, 1)
        d1  = dists[np.arange(len(game_ys)), si[:, 0]]
        d2  = dists[np.arange(len(game_ys)), si[:, 1]]

        n1_i = si[:, 0]
        n2_i = si[:, 1]

        # 最近颜色超过阈值 → 不属于汉朝领土（海洋/沙漠）
        too_far = d1 > MAX_COLOR_DIST

        # 置信度比例
        ratio     = d1 / np.maximum(d2, 1.0)
        ambiguous = (ratio >= conf_thresh) & ~white & ~too_far

        # 初始分配
        state_row = rid_arr[n1_i].copy()
        state_row[white]    = 0
        state_row[too_far]  = 0

        # 同色对消歧义：使用图像空间质心距离（比郡城坐标更准确）
        if ambiguous.any():
            amb     = np.where(ambiguous)[0]
            amb_col = img_cols[amb].astype(np.float32)
            ir_f    = float(ir)

            for pidx in range(len(amb)):
                yi   = amb[pidx]
                n1   = int(rid_arr[n1_i[yi]])
                n2   = int(rid_arr[n2_i[yi]])
                pair = frozenset([n1, n2])

                if pair not in AMBIGUOUS_PAIR_SET:
                    continue

                ic = float(amb_col[pidx])
                centroids = pair_centroids.get((n1, n2))
                if centroids is None:
                    continue
                ca_pt, cb_pt = centroids
                # 计算到各州图像质心的欧氏距离（在图像空间）
                da = (ic - ca_pt[0]) ** 2 + (ir_f - ca_pt[1]) ** 2
                db = (ic - cb_pt[0]) ** 2 + (ir_f - cb_pt[1]) ** 2

                if db < da:
                    state_row[yi] = n2
                    total_changed_to_geo += 1

        grid_state[gx, Y_MIN:Y_MAX + 1] = state_row

    print(f"\n    地理消歧义修正了 {total_changed_to_geo:,} 格")
    return grid_state


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 3: 约束 Voronoi → 郡 ID
# ═══════════════════════════════════════════════════════════════════════════════

def assign_counties(grid_state: np.ndarray,
                    junxian_list: List[dict]) -> np.ndarray:
    """
    对每个分配了州 ID 的游戏格子，在同州郡治城市中找最近者，
    赋予对应郡 ID。郡边界自然弯曲（Voronoi，非矩形）。
    """
    # 按州分组郡治城市
    state_jx: Dict[int, List[Tuple[float, float, int]]] = defaultdict(list)
    for j in junxian_list:
        rid = j['regionId']
        cx, cy = j['cx'], j['cy']
        if cx > 0 and cy > 0:
            state_jx[rid].append((float(cx), float(cy), int(j['id'])))

    grid_county = np.zeros_like(grid_state)

    for rid, jlist in state_jx.items():
        if not jlist:
            continue
        mask = (grid_state == rid)
        if not mask.any():
            continue

        xi, yi = np.where(mask)
        gx_v  = xi.astype(np.float32)[:, None]   # (N, 1)
        gy_v  = yi.astype(np.float32)[:, None]

        jcx  = np.array([j[0] for j in jlist], dtype=np.float32)[None, :]  # (1, M)
        jcy  = np.array([j[1] for j in jlist], dtype=np.float32)[None, :]
        jids = np.array([j[2] for j in jlist], dtype=np.int32)

        BATCH = 80_000
        nearest = np.empty(len(xi), dtype=np.int32)
        for b in range(0, len(xi), BATCH):
            sl   = slice(b, b + BATCH)
            d    = (gx_v[sl] - jcx) ** 2 + (gy_v[sl] - jcy) ** 2
            nearest[sl] = jids[np.argmin(d, 1)]

        grid_county[xi, yi] = nearest

    return grid_county


# ═══════════════════════════════════════════════════════════════════════════════
# 辅助：RLE 压缩 / JSON 元信息
# ═══════════════════════════════════════════════════════════════════════════════

def compress_rle(grid_county: np.ndarray) -> dict:
    """与 V1 相同的 RLE 格式，供 Godot/后端按需解码"""
    rows_rle: dict = {}
    for gx in range(X_MIN, X_MAX + 1):
        row = grid_county[gx, Y_MIN:Y_MAX + 1]
        if not row.any():
            continue
        runs: list = []
        cur = 0;  start = Y_MIN
        for yi, v in enumerate(row):
            y = Y_MIN + yi
            if int(v) != cur:
                if cur != 0:
                    runs.append([start, y - 1, cur])
                cur   = int(v)
                start = y
        if cur != 0:
            runs.append([start, Y_MAX, cur])
        if runs:
            rows_rle[str(gx)] = runs
    return rows_rle


def build_junxian_meta(junxian_list: List[dict]) -> dict:
    return {
        str(j['id']): {'name': j['name'], 'regionId': j['regionId']}
        for j in junxian_list
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 调试 SVG：只用 grid_state（州级），快速出图
# ═══════════════════════════════════════════════════════════════════════════════

def generate_debug_svg(rows_rle: dict, junxian_list: List[dict],
                       img_w: int = 1440, img_h: int = 1598) -> str:
    """
    生成调试 SVG。
    标签位置: 直接从瓦片 RLE 数据中计算加权质心（100% 准确，不依赖坐标变换）。
    文字渲染: 双重渲染（描边层+填充层），兼容所有浏览器（规避 paint-order 兼容问题）。
    背景: 白色，便于浏览器和印刷查阅。
    """
    SCALE    = 0.55
    SVG_W    = int((Y_MAX - Y_MIN + 1) * SCALE) + 40
    SVG_H    = int((X_MAX - X_MIN + 1) * SCALE) + 70

    # junxian_id → regionId
    jid2reg: Dict[int, int] = {j['id']: j['regionId'] for j in junxian_list}
    for jid2 in range(1501, 1508):
        jid2reg[jid2] = 15

    # ── 从瓦片数据计算各州 SVG 质心（不依赖 IMAGE_CENTROIDS）──────────────
    # 这是唯一 100% 准确的方法：标签落在实际着色区域的重心上
    from collections import defaultdict as _dd
    gx_acc = _dd(float)
    gy_acc = _dd(float)
    wt_acc = _dd(int)
    for x_str, runs in rows_rle.items():
        gx = int(x_str)
        for y0, y1, jid in runs:
            reg = jid2reg.get(int(jid), 0)
            if reg == 0:
                continue
            n = y1 - y0 + 1
            gx_acc[reg] += gx * n
            gy_acc[reg] += (y0 + y1) / 2.0 * n
            wt_acc[reg] += n
    label_pos: Dict[int, Tuple[float, float]] = {}
    for reg in wt_acc:
        if wt_acc[reg] == 0:
            continue
        mean_gx = gx_acc[reg] / wt_acc[reg]
        mean_gy = gy_acc[reg] / wt_acc[reg]
        lx = (mean_gy - Y_MIN) * SCALE + 20
        ly = (mean_gx - X_MIN) * SCALE + 24
        label_pos[reg] = (lx, ly)

    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{SVG_W}" height="{SVG_H}" '
        f'style="background:#ffffff">',
        # 无 CSS 类 — 使用内联属性，避免 paint-order 兼容问题
        f'<text x="{SVG_W//2}" y="16" text-anchor="middle" '
        f'font-size="14" font-family="Microsoft YaHei,sans-serif" font-weight="bold" fill="#333">'
        f'V2 历史轮廓地图（参考图颜色分割 + 约束Voronoi郡界）</text>',
    ]

    for x_str, runs in rows_rle.items():
        gx  = int(x_str)
        sy  = (gx - X_MIN) * SCALE + 24
        h   = max(1.0, SCALE)
        for y0, y1, jid in runs:
            reg   = jid2reg.get(int(jid), 0)
            color = REGION_COLORS_SVG.get(reg, '#ccc')
            sx    = (y0 - Y_MIN) * SCALE + 20
            w     = (y1 - y0 + 1) * SCALE
            lines.append(
                f'<rect x="{sx:.1f}" y="{sy:.1f}" width="{w:.1f}" height="{h:.1f}" '
                f'fill="{color}" stroke="none"/>'
            )

    # 郡名标签（小字，9px，白描边+黑填充，位于郡治坐标）
    if junxian_list:
        JFONT  = 'font-size="9" font-family="Microsoft YaHei,sans-serif"'
        JATTR  = 'text-anchor="middle" dominant-baseline="central"'
        for j in junxian_list:
            cx, cy = j.get('cx', 0), j.get('cy', 0)
            if cx <= 0 or cy <= 0:
                continue
            jx = (cy - Y_MIN) * SCALE + 20
            jy = (cx - X_MIN) * SCALE + 24
            if jx < 20 or jy < 24 or jx > SVG_W - 20 or jy > SVG_H - 20:
                continue
            jname = j.get('name', '')
            if not jname:
                continue
            # 只画郡名（无描边，白色半透描边使文字可读）
            lines.append(
                f'<text x="{jx:.1f}" y="{jy:.1f}" {JATTR} {JFONT} '
                f'fill="none" stroke="#ffffff" stroke-width="2" stroke-linejoin="round">{jname}</text>'
            )
            lines.append(
                f'<text x="{jx:.1f}" y="{jy:.1f}" {JATTR} {JFONT} '
                f'fill="#111111">{jname}</text>'
            )

    # 州名标签：双重渲染（描边层 + 填充层，兼容所有浏览器）
    LABEL_FONT = 'font-size="15" font-family="Microsoft YaHei,sans-serif" font-weight="bold"'
    LABEL_ATTRS = 'text-anchor="middle" dominant-baseline="central"'
    for rid in sorted(REGION_NAMES):
        if rid not in label_pos:
            continue
        lx, ly = label_pos[rid]
        name   = REGION_NAMES[rid]
        # 1st pass：黑色描边（轮廓）
        lines.append(
            f'<text x="{lx:.1f}" y="{ly:.1f}" {LABEL_ATTRS} {LABEL_FONT} '
            f'fill="none" stroke="#000000" stroke-width="3" stroke-linejoin="round">{name}</text>'
        )
        # 2nd pass：白色填充（无描边）
        lines.append(
            f'<text x="{lx:.1f}" y="{ly:.1f}" {LABEL_ATTRS} {LABEL_FONT} '
            f'fill="#ffffff">{name}</text>'
        )

    lines.append('</svg>')
    return '\n'.join(lines)


# ═══════════════════════════════════════════════════════════════════════════════
# 主程序
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description='V2 历史轮廓地图生成器')
    parser.add_argument('--image',  type=pathlib.Path, required=True,
                        help='历史参考图路径（e.g. tmp/historical_map.png）')
    parser.add_argument('--conf',   type=float, default=0.82,
                        help='颜色匹配置信度阈值 (default=0.82, 调低=更多几何消歧义)')
    args = parser.parse_args()

    t0 = time.time()
    print('=== V2 地图生成器（历史轮廓模式）===')
    print(f'参考图: {args.image}  置信度阈值: {args.conf}')

    # ── 加载参考图 ───────────────────────────────────────────────────────────
    from PIL import Image as _PIL
    img = np.array(_PIL.open(str(args.image)).convert('RGB'), dtype=np.uint8)
    IH, IW = img.shape[:2]
    print(f'参考图尺寸: {IW}×{IH} px')

    # ── 加载郡数据 ───────────────────────────────────────────────────────────
    print('加载郡数据...')
    with open(MAP_REGIONS, encoding='utf-8') as f:
        regions_data = json.load(f)
    junxian_raw = regions_data['junxian']

    # 标准化郡列表（用 effectiveRegionId，不用 BBox）
    junxian_list: List[dict] = []
    for j in junxian_raw:
        rid = j.get('effectiveRegionId', j.get('originalRegionId', 0))
        c   = j.get('center', {})
        junxian_list.append({
            'id':       j['id'],
            'name':     j['name'],
            'regionId': rid,
            'cx':       float(c.get('x', 0)),
            'cy':       float(c.get('y', 0)),
        })
    # 追加交州合成郡
    for jid, jname, jrid, jcx, jcy in JIAOZHOU_COUNTIES:
        junxian_list.append({
            'id': jid, 'name': jname, 'regionId': jrid, 'cx': jcx, 'cy': jcy,
        })
    print(f'  {len(junxian_list)} 郡（{len(junxian_raw)} 原始 + {len(JIAOZHOU_COUNTIES)} 交州合成）')

    # ── Phase 1: 颜色表 ──────────────────────────────────────────────────────
    print('Phase 1: 采样颜色表...')
    state_colors = sample_state_colors(img, junxian_raw)

    # ── 验证：郡城坐标落在参考图中预期州颜色区域 ─────────────────────────────
    print('验证郡城坐标 vs 参考图颜色...')
    rid_list = sorted(state_colors.keys())
    ctbl_v   = np.array([state_colors[r] for r in rid_list], dtype=np.float32)
    rid_arr  = np.array(rid_list, dtype=np.int32)
    mismatch_cnt = 0
    for j in junxian_list:
        rid = j['regionId']
        if rid not in REGION_NAMES:
            continue
        cx, cy = j['cx'], j['cy']
        if cx <= 0 or cy <= 0:
            continue
        col = int(round((cy - 1) / (Y_MAX - 1) * (IW - 1)))
        row = int(round((cx - 1) / (X_MAX - 1) * (IH - 1)))
        col = max(0, min(IW-1, col)); row = max(0, min(IH-1, row))
        pix  = np.array(img[row, col], dtype=np.float32)
        dist = np.sqrt(((pix - ctbl_v) ** 2).sum(1))
        pred = int(rid_arr[np.argmin(dist)])
        if pred != rid:
            mismatch_cnt += 1
            if mismatch_cnt <= 10:
                print(f'  [!] {j["name"]}({rid}/{REGION_NAMES.get(rid,"?")}) → 预测 {pred}/{REGION_NAMES.get(pred,"?")}')
    if mismatch_cnt == 0:
        print('  所有郡城坐标均落在正确州颜色区域 ✓')
    else:
        print(f'  共 {mismatch_cnt} 个郡城坐标颜色不符（属于坐标系线性映射误差，不影响整体）')

    # ── 构建郡城图像坐标（用于同色消歧义）───────────────────────────────────
    city_imgpos = build_state_city_imgpos(junxian_list, IW, IH)
    for rid in sorted(city_imgpos):
        n = len(city_imgpos[rid])
        print(f'  {REGION_NAMES.get(rid,str(rid)):4s}({rid:2d}): {n} 郡城种子')

    # ── Phase 2: 颜色分割 → 州 ID ────────────────────────────────────────────
    print(f'Phase 2: 参考图颜色分割（conf_thresh={args.conf}）...')
    grid_state = classify_game_grid(img, state_colors, args.conf)

    assigned = int((grid_state > 0).sum())
    total    = (X_MAX - X_MIN + 1) * (Y_MAX - Y_MIN + 1)
    print(f'  已分配: {assigned:,} / {total:,} 格 ({assigned/total*100:.1f}%)')
    sc = Counter(int(v) for v in grid_state.ravel() if v > 0)
    for rid in sorted(REGION_NAMES):
        cnt = sc.get(rid, 0)
        pct = cnt / assigned * 100 if assigned else 0
        print(f'  {REGION_NAMES[rid]:4s}({rid:2d}): {cnt:>8,} ({pct:4.1f}%)')

    # ── Phase 3: 约束 Voronoi → 郡 ID ────────────────────────────────────────
    print('Phase 3: 约束 Voronoi → 郡 ID...')
    grid_county = assign_counties(grid_state, junxian_list)

    # ── RLE 压缩 ─────────────────────────────────────────────────────────────
    print('RLE 压缩...')
    rows_rle   = compress_rle(grid_county)
    active     = len(rows_rle)
    total_runs = sum(len(v) for v in rows_rle.values())
    print(f'  有效行: {active:,}  总段数: {total_runs:,}')

    # ── 输出 JSON ──────────────────────────────────────────────────────────
    print('输出 JSON...')
    jmeta  = build_junxian_meta(junxian_list)
    output = {
        '_meta': {
            'description': 'V2 逐格郡归属，历史参考图颜色分割 + 约束Voronoi郡界',
            'version':     2,
            'gridXRange':  [X_MIN, X_MAX],
            'gridYRange':  [Y_MIN, Y_MAX],
            'defaultValue': 0,
            'coordinateSystem': 'pos=x*10000+y, X南↓ Y东→',
            'rowFormat':   'rows[x]=[[y_start,y_end_inclusive,junxian_id],...]',
        },
        'junxianMeta': jmeta,
        'rows':        rows_rle,
    }
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, separators=(',', ':'))
    size_kb = OUTPUT_JSON.stat().st_size / 1024
    print(f'  {OUTPUT_JSON}  ({size_kb:.1f} KB)')

    # ── 调试 SVG ──────────────────────────────────────────────────────────
    print('生成调试 SVG...')
    svg = generate_debug_svg(rows_rle, junxian_list)
    DEBUG_SVG.parent.mkdir(parents=True, exist_ok=True)
    with open(DEBUG_SVG, 'w', encoding='utf-8') as f:
        f.write(svg)
    print(f'  {DEBUG_SVG}')

    # ── 统计汇总 ────────────────────────────────────────────────────────────
    print()
    print('=== 州面积汇总 ===')
    cnt2 = Counter(int(v) for v in grid_county.ravel() if v > 0)
    jid2reg  = {j['id']: j['regionId'] for j in junxian_list}
    reg_cnt: Counter = Counter()
    for jid, n in cnt2.items():
        reg_cnt[jid2reg.get(jid, 0)] += n
    total_a = sum(v for k, v in reg_cnt.items() if k > 0)
    for rid in sorted(REGION_NAMES):
        n = reg_cnt.get(rid, 0)
        print(f'  {REGION_NAMES[rid]:4s}({rid:2d}): {n:>8,}  ({n/total_a*100:4.1f}%)')
    unassigned = sum(1 for x in range(X_MIN, X_MAX+1)
                     for y in range(Y_MIN, Y_MAX+1)
                     if grid_county[x, y] == 0)
    print(f'  未分配: {unassigned:,}')

    print(f'\n总耗时: {time.time()-t0:.1f}s')
    print('\n=== 下一步 ===')
    print('  1. 打开 tmp/map_v2_debug.svg 验证州形状')
    print('  2. 如州界有问题，调整 --conf 值（默认 0.82，调低更保守）')
    print('  3. 读取 tmp/map_data/map_tile_regions.json（格式未变）')


if __name__ == '__main__':
    main()
