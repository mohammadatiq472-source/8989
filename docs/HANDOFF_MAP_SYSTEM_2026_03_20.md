# 地图系统交接文档 2026-03-20

> 本文件记录"13州地图可视化"任务的完整状态。
> 新开对话时直接引用本文，无需重新解释背景。

---

## 当前完成状态

| 文件 | 大小 | 状态 |
|------|------|------|
| `My project/Assets/StreamingAssets/map_regions.json` | 172KB | ✅ 已生成（13州 + 94郡 BBox） |
| `My project/Assets/StreamingAssets/map_tile_regions.json` | 350KB | ✅ 已生成（RLE格式逐格郡归属） |
| `tmp/map_all_provinces.svg` | 17KB | ✅ 简单13州SVG轮廓图 |
| `tmp/map_tile_regions_preview.png` | 158KB | ✅ 当前预览PNG（有已知问题，见下） |
| `tmp/map_tile_regions_debug.svg` | — | ✅ 调试SVG |
| `tmp/historical_map.png` | — | ✅ 历史参考图（Phase 2 已运行） |

---

## 数据流

```
scripts/generate_all_provinces_map.py
    ↓ 读 tmp/extracted_cfg/split/cfg_map_world.json
    → My project/Assets/StreamingAssets/map_regions.json  (13州+94郡 BBox)
    → tmp/map_all_provinces.svg

scripts/generate_tile_regions.py
    ↓ 读 map_regions.json
    → My project/Assets/StreamingAssets/map_tile_regions.json  (RLE逐格归属)
    → tmp/map_tile_regions_debug.svg
    → tmp/map_tile_regions_preview.png
```

---

## 坐标系

- 网格: X=1~1851 (1~1501 原始 + 1501~1851 交州南延伸), Y=1~1501
- X **向南递增**（北上南下），Y **向东递增**（西左东右）
- pos 编码: `pos = x * 10000 + y`
- Unity 中: `TileRegionsLoader.GetJunxianIdAt(int x, int y)` → junxian_id（0=海/沙漠）

---

## 13州 ID 与颜色

| ID | 州名 | 颜色 |
|----|------|------|
| 1 | 司隶 | #2ecc71 绿 |
| 3 | 兖州 | #f39c12 橙黄 |
| 4 | 豫州 | #e67e22 深橙 |
| 5 | 冀州 | #3498db 蓝 |
| 6 | 青州 | #1abc9c 青绿 |
| 7 | 徐州 | #9b59b6 紫 |
| 8 | 扬州 | #f1c40f 亮黄 |
| 9 | 并州 | #e74c3c 红 |
| 10 | 凉州 | #d4ac0d 暗金 |
| 11 | 益州 | #e91e63 粉红 |
| 12 | 幽州 | #00bcd4 青蓝 |
| 13 | 荆州 | #8bc34a 草绿 |
| 15 | 交州 | #ff5722 橘红 |

> 注：雍州(id=2)被拆分：京兆/冯翊/新平/北地 → 司隶(1)；陇西/天水/安定/扶风 → 凉州(10)

---

## 已知问题（tile_regions 可视化）

### 问题1：南端双色（最重要）
**现象**：南边出现扬州黄色 + 交州橘色两块，而不是全交州
**根因**：扬州/荆州/益州 南端郡的 `maxX` 被原始数据截断为 1501，实际上这些郡不应延伸到。例如：
- 扬州吴郡: `x=[1302,1501]` y=[1068,1501] 覆盖了交州南海郡
- 荆州武陵: `x=[1118,1501]` y=[78,381] 覆盖了交州郁林郡
- 益州永昌: `x=[1049,1501]` y=[1,280] 覆盖了交州西端

**修复方案**（已设计，未实施）：在 `load_all_junxians()` 后加裁剪：
```python
SOUTH_CLIP = {
    8:  1420,   # 扬州南端郡 clip 到 x=1420
    13: 1400,   # 荆州南端郡 clip 到 x=1400
    11: 1350,   # 益州南端郡 clip 到 x=1350
}
for j in result:
    if j["maxX"] >= 1490 and j["regionId"] in SOUTH_CLIP:
        j["maxX"] = min(j["maxX"], SOUTH_CLIP[j["regionId"]])
        j["area"] = (j["maxX"] - j["minX"]) * (j["maxY"] - j["minY"])
```

### 问题2：凉州显示偏小
**根因**：凉州11郡分布在西北角(小x小y)，与并州BBox重叠(y=405~579)
**诊断**：酒泉(116973面积，凉州最大)被并州乐平(84084)后续覆盖
**修复**：绘制顺序改为大面积后绘（覆盖小的），或用严格的优先级规则

### 问题3：地图是矩形，不是历史形状
**现象**：1501×1851矩形，东南角/西北角有大量海域/沙漠假区域
**修复方案**：添加中国版图遮罩——定义多边形边界，外部设为0（无主郡）

### 问题4：交州边界仅为手工近似
**现状**：交州7郡 (id=1501-1507) 是手工坐标，非游戏原始数据
**Phase 2状态**：已用 `tmp/historical_map.png` 运行过Phase 2图像精化 (exit code=0)

---

## 相关脚本位置

```
scripts/generate_all_provinces_map.py  ← 生成 map_regions.json + map_all_provinces.svg
scripts/generate_tile_regions.py       ← 生成 map_tile_regions.json + 预览PNG
    --image tmp/historical_map.png     ← Phase 2: 历史参考图形状精化
tmp/tile_regions_debug.md              ← 详细调试记录（问题根因+修复方案）
tmp/_svg2png.py                        ← SVG→PNG 转换辅助脚本
```

---

## 重新运行命令

```powershell
# Phase 1: 基础BBox光栅化（快，约5秒）
py -3 scripts/generate_tile_regions.py

# Phase 2: 历史参考图精化（需 opencv-python，约30-60秒）
py -3 scripts/generate_tile_regions.py --image tmp/historical_map.png

# 只重新生成 map_regions.json（如CFG数据更新后）
py -3 scripts/generate_all_provinces_map.py
```

---

## Unity 消费接口

```csharp
// TileRegionsLoader.cs
int junxianId = TileRegionsLoader.GetJunxianIdAt(gameX, gameY);
// 0 = 海/沙漠/无主   1-1500 = 原始郡   1501-1507 = 交州合成郡

// MapRegionsData.cs
var region = MapRegionsData.GetRegionForJunxian(junxianId);
```

---

## 完成状态（2026-03-20 续）

| 项 | 状态 | 备注 |
|----|------|------|
| P1 南端双色 SOUTH_CLIP | ✅ 已实施 | `load_all_junxians()` 内裁剪扬/荆/益南端郡 maxX |
| P2 绘制顺序 | ✅ 已修复 | 改为 `reverse=False`（小郡先填）凉州279k格 |
| P3 版图遮罩 CHINA_BORDER | ✅ 已实施 | `apply_border_mask()` 清除16.9%海洋/沙漠格 |
| P4 Unity 渲染器 | ✅ 已创建 | `RegionsMapRenderer.cs` (见下) |

## 下一步优先级

1. **P5 在 Unity 场景中接入战略地图面板** — 参考 `OverviewPanel.cs`，创建含 RawImage 的 Canvas UI，挂 `RegionsMapRenderer` 组件并绑定 `tooltipLabel`
2. **P6 相位 2 精化** — 用 `--image tmp/historical_map.png` 运行 Phase 2 修正州边界形状
3. **P7 幽州↔全国坐标桥接** — 将幽州逻辑坐标 (lx, ly) 映射到全国网格坐标 (gx, gy) 以查询郡归属

## RegionsMapRenderer.cs 用法

文件位置: `My project/Assets/Scripts/Map/Data/RegionsMapRenderer.cs`

```
Unity 场景接入步骤:
1. 在 Canvas 下创建 GameObject → 添加 RawImage 组件
2. 将 RegionsMapRenderer 挂到同一 GameObject
3. 可选: 将 tooltipLabel 指向 Text 组件（悬停时显示郡/州名）
4. Inspector 可调 textureWidth/textureHeight（默认750×600）
5. 运行后自动异步构建纹理（约10-15帧完成，不卡顿）
```

关键 API:
```csharp
// 查询游戏坐标对应的郡/州（用于游戏逻辑）
var (jid, jname, rid, rname) = renderer.QueryAt(gameX, gameY);

// 强制同步构建（编辑器截图）
renderer.BuildImmediately();

// 直接用 TileRegionsLoader（无需 renderer 实例）
int jid = TileRegionsLoader.GetJunxianIdAt(gameX, gameY);
(int jid, int rid) = TileRegionsLoader.GetRegionInfoAt(gameX, gameY);
```

---

## 为什么要有这个文件

上一个 Copilot 对话窗口在生成最终可视化 PNG 后触发了 413 Request Too Large 错误——不是代码 bug，是对话历史积累过多。本文件将关键状态固化，新开对话直接引用 `@docs/HANDOFF_MAP_SYSTEM_2026_03_20.md` 即可。
