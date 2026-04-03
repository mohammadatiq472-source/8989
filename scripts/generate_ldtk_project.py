"""
生成 LDtk 项目文件（YouZhouMap.ldtk）
包含：幽州地图初始数据 + 12 种地形 IntGrid 颜色定义

工作流：
  1. 运行此脚本生成 .ldtk 文件
  2. 用 LDtk 打开 YouZhouMap.ldtk 画地图
  3. 保存后在 Unity 执行 YouZhou/Import from LDtk
"""

import json, os

MAP_JSON = r'My project\Assets\StreamingAssets\youzhou_map.json'
OUT_LDTK = r'My project\Assets\StreamingAssets\YouZhouMap.ldtk'

W, H = 380, 270

terrain_info = [
    (0,  "Snow",         "#C8DCE8", "雪地"),
    (1,  "SnowForest",   "#5B8A6A", "雪地森林"),
    (2,  "FrozenLake",   "#4878B8", "冰湖/海"),
    (3,  "SnowRoad",     "#B0A090", "雪道"),
    (4,  "SnowTown",     "#C8A86A", "城镇"),
    (5,  "SnowMountain", "#7080A0", "雪山"),
    (6,  "Grass",        "#78C868", "草地"),
    (7,  "GrassForest",  "#3A7848", "草地森林"),
    (8,  "River",        "#5890D0", "河流"),
    (9,  "FrozenRiver",  "#88B8D8", "冰河"),
    (10, "CastleWall",   "#806848", "城墙要塞"),
    (11, "Farmland",     "#C8B870", "农田"),
]

# 读取现有地图
with open(MAP_JSON, 'r', encoding='utf-8') as f:
    map_data = json.load(f)
grid = map_data.get('terrainGrid', [0] * (W * H))

int_grid_values = []
for val, ident, color, label in terrain_info:
    int_grid_values.append({
        "value": val + 1,
        "identifier": ident,
        "color": color,
        "tile": None,
        "groupUid": 0
    })

# LDtk CSV: Y 轴翻转（LDtk 行0=屏幕顶部，我们的坐标 y=0=底部）
intgrid_csv = []
for row in range(H):
    map_y = H - 1 - row
    for col in range(W):
        t = grid[map_y * W + col]
        intgrid_csv.append(int(t) + 1)

ldtk_project = {
    "__header__": {
        "fileType": "LDtk Project JSON",
        "app": "LDtk",
        "schema": "https://ldtk.io/files/JSON_SCHEMA.json",
        "appAuthor": "Sebastien 'deepnight' Benard",
        "appVersion": "1.5.3",
        "url": "https://ldtk.io"
    },
    "iid": "youzhou-map-001",
    "jsonVersion": "1.5.3",
    "nextUid": 200,
    "exportTiled": False,
    "simplifiedExport": False,
    "imageExportMode": "None",
    "externalLevels": False,
    "defs": {
        "layers": [{
            "__type": "IntGrid",
            "identifier": "Terrain",
            "type": "IntGrid",
            "uid": 1,
            "gridSize": 8,
            "displayOpacity": 1.0,
            "pxOffsetX": 0, "pxOffsetY": 0,
            "parallelDocPath": None,
            "requiredTags": [], "excludedTags": [],
            "intGridValues": int_grid_values,
            "intGridValuesGroups": [],
            "autoSourceLayerDefUid": None,
            "autoRuleGroups": [],
            "autoTilesetDefUid": None,
            "autoTilesKilledByOtherLayerUid": None,
            "tilesetDefUid": None,
            "tilePivotX": 0, "tilePivotY": 0,
            "renderInWorldView": True,
            "doc": None, "uiColor": None,
            "hideInList": False,
            "hideFieldsWhenInactive": True,
            "canSelectWhenInactive": True,
            "scrollOpacity": 1.0,
            "inactiveOpacity": 0.8,
            "annotationColor": "#FFF"
        }],
        "entities": [],
        "tilesets": [],
        "enums": [],
        "externalEnums": [],
        "levelFields": [],
    },
    "levels": [{
        "identifier": "YouZhouMap",
        "iid": "level-001",
        "uid": 100,
        "worldX": 0, "worldY": 0, "worldDepth": 0,
        "pxWid": W * 8,
        "pxHei": H * 8,
        "bgColor": None,
        "__bgColor": "#4878B8",
        "bgPos": None,
        "bgPivotX": 0.5, "bgPivotY": 0.5,
        "__bgPos": None,
        "externalRelPath": None,
        "fieldInstances": [],
        "layerInstances": [{
            "__identifier": "Terrain",
            "__type": "IntGrid",
            "__cWid": W, "__cHei": H,
            "__gridSize": 8,
            "__opacity": 1.0,
            "__pxTotalOffsetX": 0, "__pxTotalOffsetY": 0,
            "__tilesetDefUid": None,
            "__tilesetRelPath": None,
            "iid": "layer-001",
            "levelId": 100,
            "layerDefUid": 1,
            "pxOffsetX": 0, "pxOffsetY": 0,
            "visible": True,
            "optionalRules": [],
            "intGridCsv": intgrid_csv,
            "autoLayerTiles": [],
            "seed": 9999,
            "overrideTilesetUid": None,
            "gridTiles": [],
            "entityInstances": []
        }],
        "__neighbours": []
    }],
    "worlds": [],
    "worldGridWidth": 256,
    "worldGridHeight": 256,
    "worldLayout": "Free",
    "bgColor": "#4878B8",
    "defaultPivotX": 0, "defaultPivotY": 0,
    "defaultGridSize": 8,
    "defaultEntityWidth": 16,
    "defaultEntityHeight": 16,
    "exportLevelBg": True,
    "pngFilePattern": None,
    "oneFilePerLevel": False,
    "minifyJson": False,
    "identifierStyle": "Capitalize",
    "multiWorlds": False,
    "flags": [],
    "customCommands": [],
    "toc": [],
    "useLevelFieldsAsWorld": False,
    "useLinearCrossLevelRefs": True
}

with open(OUT_LDTK, 'w', encoding='utf-8') as f:
    json.dump(ldtk_project, f, indent=2, ensure_ascii=False)

print(f'OK: {OUT_LDTK}')
print(f'IntGrid CSV: {len(intgrid_csv)} cells ({W}x{H})')
from collections import Counter
counts = Counter(intgrid_csv)
for val, cnt in sorted(counts.items()):
    name = terrain_info[val-1][3] if 1 <= val <= len(terrain_info) else '?'
    print(f'  val={val} ({name}): {cnt}格  {cnt*100//len(intgrid_csv)}%')
