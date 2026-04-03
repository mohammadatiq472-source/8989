using UnityEngine;
using YouZhou.Map;

namespace YouZhou.Map
{
    /// <summary>
    /// 幽州本地坐标 ↔ 全局游戏坐标 双向映射工具
    ///
    /// ┌─────────────────────────────────────────────────────────────────┐
    /// │  坐标体系一览                                                    │
    /// │                                                                 │
    /// │  全局游戏坐标 (Global Game Coords)                               │
    /// │    ▸ pos = gx * 10000 + gy                                     │
    /// │    ▸ gx: 1 → 1851, 方向 南↓ (行 = 纬度)                        │
    /// │    ▸ gy: 1 → 1501, 方向 东→ (列 = 经度)                        │
    /// │    ▸ map_tile_regions.json / TileRegionsLoader 使用此坐标        │
    /// │    ▸ map_regions.json: xian.center.{x,y} 即 (gx, gy)           │
    /// │                                                                 │
    /// │  幽州本地逻辑坐标 (YouZhou Local Logical Coords)                 │
    /// │    ▸ lx: 0 → 299  (300 格宽)                                   │
    /// │    ▸ ly: 0 → 105  (106 格高)                                   │
    /// │    ▸ IsometricMapBuilder 和 MapEditorWindow 使用此坐标           │
    /// │    ▸ youzhou_map.json byte[lx + ly*300] = TerrainType           │
    /// │                                                                 │
    /// │  幽州视觉 Tilemap 坐标 (Visual)                                  │
    /// │    ▸ vx = lx*3, vy = ly*3 (每逻辑格对应 3×3 视觉格)             │
    /// │    ▸ 共 900×318 视觉格                                          │
    /// │                                                                 │
    /// │  ❌ 错误: 用幽州本地 lx/ly 直接调 GetJunxianIdAt(lx, ly)        │
    /// │           → lx 最大 299, 只在全局 gx=1~299 行附近查询           │
    /// │           → 导致幽州城池被映射到全国西北角 ≠ 真实幽州位置        │
    /// │                                                                 │
    /// │  ✅ 正确: 先调 LocalToGlobal(lx, ly, out gx, out gy)           │
    /// │           再调 TileRegionsLoader.GetJunxianIdAt(gx, gy)        │
    /// └─────────────────────────────────────────────────────────────────┘
    ///
    /// 使用示例：
    ///   int gx, gy;
    ///   YouZhouCoordBridge.LocalToGlobal(lx, ly, out gx, out gy);
    ///   int junxianId = TileRegionsLoader.GetJunxianIdAt(gx, gy);
    ///
    ///   int lx2, ly2;
    ///   bool inYouZhou = YouZhouCoordBridge.GlobalToLocal(gx, gy, out lx2, out ly2);
    /// </summary>
    public static class YouZhouCoordBridge
    {
        // ── 幽州 BBox（全局坐标）—— 从 map_regions.json 郡 BBox 归纳 ───────
        // 幽州6郡: 涿郡(1201) 渔阳郡(1202) 右北平郡(1203) 辽西郡(1204) 辽东郡(1205) 玄菟郡(1206)
        // 下方常量在首次调用时由 MapRegionsLoader 动态推算，这里提供保底值
        private const int YOUZHOU_GX_MIN_DEFAULT = 1;
        private const int YOUZHOU_GX_MAX_DEFAULT = 270;
        private const int YOUZHOU_GY_MIN_DEFAULT = 860;
        private const int YOUZHOU_GY_MAX_DEFAULT = 1501;

        private const int LOCAL_W = 300;
        private const int LOCAL_H = 106;

        // effectiveRegionId of 幽州
        private const int YOUZHOU_REGION_ID = 12;

        private static int _gxMin = -1, _gxMax = -1, _gyMin = -1, _gyMax = -1;

        // ── 延迟初始化：从 map_regions.json 读取幽州郡 BBox ──────────────
        private static void EnsureInit()
        {
            if (_gxMin >= 0) return;

            var data = MapRegionsLoader.Load();
            if (data != null && data.junxian != null)
            {
                int gxMin = int.MaxValue, gxMax = int.MinValue;
                int gyMin = int.MaxValue, gyMax = int.MinValue;
                bool found = false;

                foreach (var j in data.junxian)
                {
                    int rid = j.effectiveRegionId > 0 ? j.effectiveRegionId : j.originalRegionId;
                    if (rid != YOUZHOU_REGION_ID) continue;
                    found = true;
                    gxMin = Mathf.Min(gxMin, j.bbox.minX);
                    gxMax = Mathf.Max(gxMax, j.bbox.maxX);
                    gyMin = Mathf.Min(gyMin, j.bbox.minY);
                    gyMax = Mathf.Max(gyMax, j.bbox.maxY);
                }

                if (found)
                {
                    _gxMin = gxMin; _gxMax = gxMax;
                    _gyMin = gyMin; _gyMax = gyMax;
                    Debug.Log($"[CoordBridge] 幽州全局 BBox: gx=[{_gxMin},{_gxMax}] gy=[{_gyMin},{_gyMax}]");
                    return;
                }
            }

            // 降级：使用默认值
            _gxMin = YOUZHOU_GX_MIN_DEFAULT; _gxMax = YOUZHOU_GX_MAX_DEFAULT;
            _gyMin = YOUZHOU_GY_MIN_DEFAULT; _gyMax = YOUZHOU_GY_MAX_DEFAULT;
            Debug.LogWarning("[CoordBridge] 未能从 MapRegionsLoader 推算幽州 BBox，使用默认值");
        }

        // ── 双向映射 API ──────────────────────────────────────────────────

        /// <summary>
        /// 幽州本地逻辑坐标 → 全局游戏坐标
        /// lx ∈ [0,299], ly ∈ [0,105]
        /// gx ∈ [GX_MIN,GX_MAX] (南↓), gy ∈ [GY_MIN,GY_MAX] (东→)
        /// </summary>
        public static void LocalToGlobal(int lx, int ly, out int gx, out int gy)
        {
            EnsureInit();
            float tx = Mathf.Clamp01((float)lx / (LOCAL_W - 1));
            float ty = Mathf.Clamp01((float)ly / (LOCAL_H - 1));
            gx = Mathf.RoundToInt(Mathf.Lerp(_gxMin, _gxMax, tx));
            gy = Mathf.RoundToInt(Mathf.Lerp(_gyMin, _gyMax, ty));
        }

        /// <summary>
        /// 全局游戏坐标 → 幽州本地逻辑坐标
        /// 返回 true 表示该坐标在幽州 BBox 范围内
        /// </summary>
        public static bool GlobalToLocal(int gx, int gy, out int lx, out int ly)
        {
            EnsureInit();
            float tx = (_gxMax > _gxMin) ? (float)(gx - _gxMin) / (_gxMax - _gxMin) : 0f;
            float ty = (_gyMax > _gyMin) ? (float)(gy - _gyMin) / (_gyMax - _gyMin) : 0f;
            lx = Mathf.Clamp(Mathf.RoundToInt(tx * (LOCAL_W - 1)), 0, LOCAL_W - 1);
            ly = Mathf.Clamp(Mathf.RoundToInt(ty * (LOCAL_H - 1)), 0, LOCAL_H - 1);
            return gx >= _gxMin && gx <= _gxMax && gy >= _gyMin && gy <= _gyMax;
        }

        /// <summary>
        /// 视觉 Tilemap 坐标 → 全局游戏坐标（LogicalToVisual 的逆）
        /// vx = lx*3, vy = ly*3
        /// </summary>
        public static void VisualToGlobal(int vx, int vy, out int gx, out int gy)
            => LocalToGlobal(vx / 3, vy / 3, out gx, out gy);

        /// <summary>
        /// 查询某幽州本地坐标所在的郡（郡 ID = 返回值，0=未分配）
        /// </summary>
        public static int GetJunxianAtLocal(int lx, int ly)
        {
            LocalToGlobal(lx, ly, out int gx, out int gy);
            return TileRegionsLoader.GetJunxianIdAt(gx, gy);
        }

        /// <summary>
        /// 查询某幽州本地坐标所在的州（effectiveRegionId，0=未分配）
        /// </summary>
        public static int GetRegionAtLocal(int lx, int ly)
        {
            int jid = GetJunxianAtLocal(lx, ly);
            return TileRegionsLoader.GetRegionIdByJunxian(jid);
        }

        // ── 诊断接口 ─────────────────────────────────────────────────────
        public static (int gxMin, int gxMax, int gyMin, int gyMax) GetYouZhouBBox()
        {
            EnsureInit();
            return (_gxMin, _gxMax, _gyMin, _gyMax);
        }
    }
}
