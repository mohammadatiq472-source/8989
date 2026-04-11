#!/usr/bin/env python3
"""
从 STZB cfg 数据生成全13州地图区划数据。

输入: tmp/extracted_cfg/split/cfg_map_world.json (47表, 6.6MB)
输出:
  - tmp/map_data/map_regions.json                       — 引擎无关结构化区划数据
  - tmp/map_all_provinces.svg                           — 可视化验证图

坐标系统:
  - junxian/xian/city 统一编码: pos = x * 10000 + y
  - x 轴向南递增 (x≈45~1410), y 轴向东递增 (y≈76~1472)
  - 实际地图约 1500×1500 网格（近正方形）

ID编码:
  - junxian_id ÷ 100 = region_id
  - xian_id ÷ 100 = junxian_id

策划调整: 雍州(id=2)拆分给 司隶/凉州/益州
"""

import json
import os
import math
from pathlib import Path

# ── 路径 ──────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
CFG_MAP = ROOT / "tmp" / "extracted_cfg" / "split" / "cfg_map_world.json"
OUT_JSON = ROOT / "tmp" / "map_data" / "map_regions.json"
OUT_SVG  = ROOT / "tmp" / "map_all_provinces.svg"

# ── 雍州拆分策略 ──────────────────────────────────────
# 雍州(id=2)下辖8郡，按历史归属重新分配:
#   司隶 ← 京兆(201), 冯翊(206), 新平(205), 北地(207)
#   凉州 ← 陇西(202), 天水(203), 安定(204), 扶风(208)
YONGZHOU_TO_SILI = {201, 206, 205, 207}
YONGZHOU_TO_LIANGZHOU = {202, 203, 204, 208}

# ── 州名映射与颜色 ────────────────────────────────────
REGION_META = {
    # 颜色原则: 相邻州不重色，每州有明确区分度
    1:  {"name": "司隶", "short": "司", "color": "#2ecc71", "capital": "洛阳"},     # 绿
    2:  {"name": "雍州", "short": "雍", "color": "#95a5a6", "capital": "长安"},     # 灰(拆分后不显示)
    3:  {"name": "兖州", "short": "兖", "color": "#f39c12", "capital": "濮阳"},     # 橙黄
    4:  {"name": "豫州", "short": "豫", "color": "#e67e22", "capital": "谯"},       # 橙
    5:  {"name": "冀州", "short": "冀", "color": "#3498db", "capital": "邺"},       # 蓝
    6:  {"name": "青州", "short": "青", "color": "#1abc9c", "capital": "临淄"},     # 青绿
    7:  {"name": "徐州", "short": "徐", "color": "#9b59b6", "capital": "彭城"},     # 紫
    8:  {"name": "扬州", "short": "扬", "color": "#f1c40f", "capital": "建业"},     # 金黄
    9:  {"name": "并州", "short": "并", "color": "#e74c3c", "capital": "晋阳"},     # 红
    10: {"name": "凉州", "short": "凉", "color": "#d4ac0d", "capital": "武威"},     # 土黄
    11: {"name": "益州", "short": "益", "color": "#e91e63", "capital": "成都"},     # 玫红
    12: {"name": "幽州", "short": "幽", "color": "#00bcd4", "capital": "蓟"},       # 青蓝
    13: {"name": "荆州", "short": "荆", "color": "#8bc34a", "capital": "襄阳"},     # 草绿
    14: {"name": "湘西", "short": "湘", "color": "#607d8b", "capital": "夷陵"},     # 灰(无郡)
    15: {"name": "交州", "short": "交", "color": "#ff5722", "capital": "番禺"},     # 深橙红
}


def decode_pos(pos) -> tuple[int, int]:
    """解码坐标: pos = x * 10000 + y
    x 轴向南递增, y 轴向东递增
    """
    p = int(pos)
    return p // 10000, p % 10000


def load_cfg():
    """加载 cfg_map_world.json"""
    with open(CFG_MAP, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_regions(cfg: dict) -> list[dict]:
    """提取13州数据 (tb_cfg_region_314)"""
    tbl = cfg.get("tb_cfg_region_314") or cfg.get("tb_cfg_region")
    if not tbl:
        raise KeyError("找不到 region 表")

    regions = []
    for row in tbl["rows"]:
        rid = row[0]
        name = row[1]
        short_name = row[2]
        desc = row[3] if len(row) > 3 else ""
        # 邻接列表在 row[6]
        adj_str = str(row[6]) if len(row) > 6 else ""
        adjacency = [int(x.strip()) for x in adj_str.split(",") if x.strip().isdigit()]

        regions.append({
            "id": rid,
            "name": name,
            "shortName": short_name,
            "description": desc,
            "adjacency": adjacency,
            "capital": REGION_META.get(rid, {}).get("capital", ""),
            "color": REGION_META.get(rid, {}).get("color", "#888"),
        })

    # 添加 id=1 司隶 (不在region表中但被引用)
    if not any(r["id"] == 1 for r in regions):
        regions.insert(0, {
            "id": 1,
            "name": "司隶",
            "shortName": "司",
            "description": "司隶校尉部，首府洛阳",
            "adjacency": [2, 3, 4, 9],
            "capital": "洛阳",
            "color": "#e74c3c",
        })

    # 添加交州(id=15) — 原始 cfg 中不存在，手动添加
    # 历史上交州位于最南端，与益州/荆州/扬州接壤
    if not any(r["id"] == 15 for r in regions):
        regions.append({
            "id": 15,
            "name": "交州",
            "shortName": "交",
            "description": "交州，首府番禺，位于最南，与益/荆/扬接壤",
            "adjacency": [8, 11, 13],
            "capital": "番禺",
            "color": "#ff5722",
        })

    return sorted(regions, key=lambda r: r["id"])


def extract_junxian(cfg: dict) -> list[dict]:
    """提取94郡数据 (tb_cfg_world_junxian_2), 含BBox"""
    tbl = cfg.get("tb_cfg_world_junxian_2") or cfg.get("tb_cfg_world_junxian")
    if not tbl:
        raise KeyError("找不到 junxian 表")

    junxian_list = []
    for row in tbl["rows"]:
        jid = row[0]
        center_xy = row[1]
        name = row[2]
        min_xy = row[3]
        max_xy = row[4]

        cx, cy = decode_pos(center_xy)
        p1 = decode_pos(min_xy)
        p2 = decode_pos(max_xy)
        # min/max pos 按 scalar 排序，各分量不一定 min<max，需矫正
        bmin_x, bmin_y = min(p1[0], p2[0]), min(p1[1], p2[1])
        bmax_x, bmax_y = max(p1[0], p2[0]), max(p1[1], p2[1])

        # 原始 region_id (未应用雍州拆分)
        original_region_id = jid // 100

        # 应用雍州拆分
        if original_region_id == 2:
            if jid in YONGZHOU_TO_SILI:
                effective_region_id = 1   # 司隶
            elif jid in YONGZHOU_TO_LIANGZHOU:
                effective_region_id = 10  # 凉州
            else:
                effective_region_id = 1   # 默认归司隶
        else:
            effective_region_id = original_region_id

        junxian_list.append({
            "id": jid,
            "name": name,
            "originalRegionId": original_region_id,
            "effectiveRegionId": effective_region_id,
            "center": {"x": cx, "y": cy},
            "bbox": {
                "minX": bmin_x, "minY": bmin_y,
                "maxX": bmax_x, "maxY": bmax_y,
            },
            "width": bmax_x - bmin_x,
            "height": bmax_y - bmin_y,
        })

    return sorted(junxian_list, key=lambda j: j["id"])


def extract_xian(cfg: dict) -> list[dict]:
    """提取316县数据 (tb_cfg_world_xian_14 or similar), 含BBox"""
    # 找最新版本的 xian 表
    tbl = None
    for suffix in ["_14", "_5314", "_5", ""]:
        key = f"tb_cfg_world_xian{suffix}"
        if key in cfg:
            tbl = cfg[key]
            break
    if not tbl:
        raise KeyError("找不到 xian 表")

    xian_list = []
    for row in tbl["rows"]:
        # 两种格式:
        #   5字段(无名): [id, center_xy, min_xy, max_xy, 0]
        #   6字段(有名): [id, 县名, center_xy, min_xy, max_xy, 0]
        if len(row) >= 6 and isinstance(row[1], str):
            xid = int(row[0])
            name = row[1]
            center_xy = row[2]
            min_xy = row[3]
            max_xy = row[4]
        elif len(row) >= 5:
            xid = int(row[0])
            name = ""
            center_xy = row[1]
            min_xy = row[2]
            max_xy = row[3]
        else:
            continue

        try:
            cx, cy = decode_pos(center_xy)
            p1 = decode_pos(min_xy)
            p2 = decode_pos(max_xy)
            # min/max pos 按 scalar 排序，各分量不一定 min<max，需矫正
            bmin_x, bmin_y = min(p1[0], p2[0]), min(p1[1], p2[1])
            bmax_x, bmax_y = max(p1[0], p2[0]), max(p1[1], p2[1])
        except (ValueError, TypeError):
            continue

        junxian_id = xid // 100
        original_region_id = junxian_id // 100

        # 应用雍州拆分
        if original_region_id == 2:
            if junxian_id in YONGZHOU_TO_SILI:
                effective_region_id = 1
            elif junxian_id in YONGZHOU_TO_LIANGZHOU:
                effective_region_id = 10
            else:
                effective_region_id = 1
        else:
            effective_region_id = original_region_id

        xian_list.append({
            "id": xid,
            "name": name,
            "junxianId": junxian_id,
            "originalRegionId": original_region_id,
            "effectiveRegionId": effective_region_id,
            "center": {"x": cx, "y": cy},
            "bbox": {
                "minX": bmin_x, "minY": bmin_y,
                "maxX": bmax_x, "maxY": bmax_y,
            },
        })

    return sorted(xian_list, key=lambda x: x["id"])


def extract_cities(cfg: dict) -> list[dict]:
    """提取城市数据 (tb_cfg_world_city_5), 只取有名字的重要城市"""
    tbl = cfg.get("tb_cfg_world_city_5") or cfg.get("tb_cfg_world_city")
    if not tbl:
        return []

    cities = []
    for row in tbl["rows"]:
        if len(row) < 6:
            continue
        pos = row[0] if isinstance(row[0], int) else 0
        if pos <= 100000:
            continue  # 过滤非坐标行
        # 城市名在 col[5]（col[3]=模型数据，col[4]=素材名）
        name = row[5] if len(row) > 5 and isinstance(row[5], str) and row[5] else None
        if not name:
            continue

        x, y = decode_pos(pos)
        cities.append({
            "pos": pos,
            "name": name,
            "x": x,
            "y": y,
            "typeCode": row[1] if len(row) > 1 else 0,
        })

    return cities


def extract_roads(cfg: dict) -> list[dict]:
    """提取道路网络"""
    tbl = cfg.get("tb_cfg_world_road_detail") or cfg.get("tb_cfg_world_road_detail_314")
    if not tbl:
        return []

    roads = []
    for row in tbl["rows"]:
        if len(row) >= 3:
            roads.append({
                "from": row[0],
                "to": row[1],
                "distance": row[2],
            })
    return roads


def build_province_summary(regions, junxian_list, xian_list):
    """构建每州的统计汇总 (应用雍州拆分后)"""
    # 按 effectiveRegionId 分组
    prov_junxian = {}
    prov_bbox = {}

    for j in junxian_list:
        rid = j["effectiveRegionId"]
        prov_junxian.setdefault(rid, []).append(j)

        # 计算每州的整体 BBox
        if rid not in prov_bbox:
            prov_bbox[rid] = {
                "minX": j["bbox"]["minX"],
                "minY": j["bbox"]["minY"],
                "maxX": j["bbox"]["maxX"],
                "maxY": j["bbox"]["maxY"],
            }
        else:
            bb = prov_bbox[rid]
            bb["minX"] = min(bb["minX"], j["bbox"]["minX"])
            bb["minY"] = min(bb["minY"], j["bbox"]["minY"])
            bb["maxX"] = max(bb["maxX"], j["bbox"]["maxX"])
            bb["maxY"] = max(bb["maxY"], j["bbox"]["maxY"])

    summaries = []
    for r in regions:
        rid = r["id"]
        if rid == 2:
            continue  # 雍州已拆分，不输出

        jun_list = prov_junxian.get(rid, [])
        xian_count = sum(1 for x in xian_list if x["effectiveRegionId"] == rid)

        if jun_list:
            # 计算中心: 所有郡中心的均值
            avg_x = sum(j["center"]["x"] for j in jun_list) / len(jun_list)
            avg_y = sum(j["center"]["y"] for j in jun_list) / len(jun_list)
        else:
            avg_x, avg_y = 0, 0

        summaries.append({
            "regionId": rid,
            "name": r["name"],
            "shortName": r["shortName"],
            "capital": r.get("capital", ""),
            "color": r.get("color", "#888"),
            "adjacency": r.get("adjacency", []),
            "junxianCount": len(jun_list),
            "xianCount": xian_count,
            "center": {"x": round(avg_x, 1), "y": round(avg_y, 1)},
            "bbox": prov_bbox.get(rid, {"minX": 0, "minY": 0, "maxX": 0, "maxY": 0}),
            "junxianIds": [j["id"] for j in jun_list],
        })

    return sorted(summaries, key=lambda s: s["regionId"])


def generate_svg(province_summaries, junxian_list, xian_list):
    """生成SVG可视化验证图

    坐标系转换:
      数据 X 轴向南递增 → SVG Y 轴（向下=南） — 不需翻转
      数据 Y 轴向东递增 → SVG X 轴（向右=东） — 不需翻转
    """

    # 找全局BBox (数据坐标: X=南, Y=东)
    all_min_x = min(j["bbox"]["minX"] for j in junxian_list)
    all_min_y = min(j["bbox"]["minY"] for j in junxian_list)
    all_max_x = max(j["bbox"]["maxX"] for j in junxian_list)
    all_max_y = max(j["bbox"]["maxY"] for j in junxian_list)

    pad = 40
    # SVG 宽 = Y轴范围(东西), 高 = X轴范围(南北)
    map_ew = all_max_y - all_min_y   # 东西跨度 (数据Y)
    map_ns = all_max_x - all_min_x   # 南北跨度 (数据X)
    scale = 1.2
    svg_w = int(map_ew * scale) + pad * 2
    svg_h = int(map_ns * scale) + pad * 2

    def to_svg_x(data_y):
        """数据Y(东) → SVG水平位置(右=东)"""
        return int((data_y - all_min_y) * scale) + pad

    def to_svg_y(data_x):
        """数据X(南) → SVG垂直位置(下=南)"""
        return int((data_x - all_min_x) * scale) + pad

    lines = []
    lines.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{svg_w}" height="{svg_h}" '
                 f'viewBox="0 0 {svg_w} {svg_h}" style="background:#1a1a2e">')

    # 样式
    lines.append('<style>')
    lines.append('  .jun-rect { stroke-width: 0.8; stroke-opacity: 0.7; fill-opacity: 0.35; }')
    lines.append('  .jun-label { font-size: 7px; fill: #fff; text-anchor: middle; dominant-baseline: central; font-family: sans-serif; }')
    lines.append('  .prov-label { font-size: 14px; fill: #ffd700; text-anchor: middle; dominant-baseline: central; font-family: sans-serif; font-weight: bold; }')
    lines.append('  .prov-border { fill: none; stroke-width: 2; stroke-opacity: 0.8; stroke-dasharray: 5,3; }')
    lines.append('  .title { font-size: 18px; fill: #ffd700; text-anchor: middle; font-family: sans-serif; font-weight: bold; }')
    lines.append('  .legend { font-size: 10px; fill: #ccc; font-family: sans-serif; }')
    lines.append('</style>')

    # 标题
    lines.append(f'<text x="{svg_w // 2}" y="15" class="title">13州地图区划 (94郡BBox可视化)</text>')

    # 按 effectiveRegionId 建颜色表
    rid_color = {}
    for s in province_summaries:
        rid_color[s["regionId"]] = s["color"]

    # 画郡矩形 — 注意轴交换: bbox minX/maxX 是南北, minY/maxY 是东西
    for j in junxian_list:
        rid = j["effectiveRegionId"]
        color = rid_color.get(rid, "#888")
        # SVG 左上角: (svgX=东的起点, svgY=南的起点)
        sx = to_svg_x(j["bbox"]["minY"])
        sy = to_svg_y(j["bbox"]["minX"])
        sw = int((j["bbox"]["maxY"] - j["bbox"]["minY"]) * scale)
        sh = int((j["bbox"]["maxX"] - j["bbox"]["minX"]) * scale)
        # 中心
        scx = to_svg_x(j["center"]["y"])
        scy = to_svg_y(j["center"]["x"])

        lines.append(f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" '
                     f'class="jun-rect" fill="{color}" stroke="{color}" />')
        lines.append(f'<text x="{scx}" y="{scy}" class="jun-label">{j["name"]}</text>')

    # 画州整体BBox (虚线边框) + 州名标签
    for s in province_summaries:
        bb = s["bbox"]
        if bb["maxX"] == 0:
            continue
        sx = to_svg_x(bb["minY"])
        sy = to_svg_y(bb["minX"])
        sw = int((bb["maxY"] - bb["minY"]) * scale)
        sh = int((bb["maxX"] - bb["minX"]) * scale)
        scx = to_svg_x(s["center"]["y"])
        scy = to_svg_y(s["center"]["x"])
        color = s["color"]

        lines.append(f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" '
                     f'class="prov-border" stroke="{color}" />')
        lines.append(f'<text x="{scx}" y="{scy - 15}" class="prov-label">{s["name"]}</text>')

    # 图例
    legend_y = svg_h - 30
    lines.append(f'<text x="10" y="{legend_y}" class="legend">'
                 f'实色矩形=郡BBox | 虚线=州边界 | 坐标: pos=x*10000+y (X南↓ Y东→) | 共{len(junxian_list)}郡 | '
                 f'雍州拆分→司隶(京兆/冯翊/新平/北地) + 凉州(陇西/天水/安定/扶风) | 交州=手动添加</text>')

    lines.append('</svg>')
    return '\n'.join(lines)


def main():
    print("=== 全13州地图区划数据生成 ===")
    print(f"读取: {CFG_MAP}")

    cfg = load_cfg()
    print(f"已加载 {len(cfg)} 个表")

    # 提取数据
    regions = extract_regions(cfg)
    print(f"州: {len(regions)} 个")

    junxian = extract_junxian(cfg)
    print(f"郡: {len(junxian)} 个")

    xian = extract_xian(cfg)
    print(f"县: {len(xian)} 个")

    cities = extract_cities(cfg)
    print(f"有名城市: {len(cities)} 个")

    roads = extract_roads(cfg)
    print(f"道路: {len(roads)} 条")

    # 构建省份汇总 (应用雍州拆分)
    province_summaries = build_province_summary(regions, junxian, xian)
    print(f"\n=== 拆分后州统计 ===")
    for s in province_summaries:
        print(f"  {s['name']:4s} (id={s['regionId']:2d}): "
              f"{s['junxianCount']}郡 {s['xianCount']}县 "
              f"center=({s['center']['x']:.0f},{s['center']['y']:.0f}) "
              f"bbox=[({s['bbox']['minX']},{s['bbox']['minY']})-({s['bbox']['maxX']},{s['bbox']['maxY']})]")

    # 输出 JSON
    # 计算实际坐标范围
    all_x = [j["center"]["x"] for j in junxian]
    all_y = [j["center"]["y"] for j in junxian]
    x_range = f"{min(all_x):.0f}~{max(all_x):.0f}"
    y_range = f"{min(all_y):.0f}~{max(all_y):.0f}"

    output = {
        "_meta": {
            "generator": "generate_all_provinces_map.py",
            "source": "cfg_map_world.json (STZB reverse)",
            "coordinateEncoding": "pos=x*10000+y, X轴向南递增 Y轴向东递增",
            "actualRange": f"junxian center x:{x_range}, y:{y_range}",
            "yongzhouSplit": "雍州(id=2)拆分: 京兆/冯翊/新平/北地→司隶, 陇西/天水/安定/扶风→凉州",
            "manualAddition": "交州(id=15) 手动添加，与益州/荆州/扬州接壤",
            "totalJunxian": len(junxian),
            "totalXian": len(xian),
            "totalNamedCities": len(cities),
        },
        "provinces": province_summaries,
        "junxian": junxian,
        "xian": xian,
        "namedCities": cities[:100],  # 只输出前100个有名城市避免文件过大
        "roads": roads[:200],  # 只输出前200条道路
    }

    os.makedirs(OUT_JSON.parent, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    file_size = os.path.getsize(OUT_JSON)
    print(f"\n输出 JSON: {OUT_JSON} ({file_size / 1024:.1f} KB)")

    # 生成 SVG
    svg_content = generate_svg(province_summaries, junxian, xian)
    os.makedirs(OUT_SVG.parent, exist_ok=True)
    with open(OUT_SVG, "w", encoding="utf-8") as f:
        f.write(svg_content)
    svg_size = os.path.getsize(OUT_SVG)
    print(f"输出 SVG: {OUT_SVG} ({svg_size / 1024:.1f} KB)")

    print("\n=== 完成 ===")
    print("下一步:")
    print("  1. 在浏览器中打开 tmp/map_all_provinces.svg 验证地图布局")
    print("  2. 后续地图管线读取 tmp/map_data/map_regions.json")
    print("  3. 如需逐格郡归属，继续执行 scripts/generate_tile_regions.py")


if __name__ == "__main__":
    main()
