using System;
using UnityEngine;

namespace YouZhou.Map
{
    /// <summary>
    /// 逻辑地图数据 - 300×106 网格（约 3.2 万格）
    /// 每个逻辑块对应 3×3 视觉 tile（共 900×318 视觉 tile）
    /// 地形类型独立于视觉贴图（方案C）
    /// 东西向（WIDTH）更宽，南北向（HEIGHT）较短，符合幽州9郡比例
    /// </summary>
    [Serializable]
    public class LogicalMapData
    {
        public const int WIDTH  = 300;
        public const int HEIGHT = 106;
        public const int VISUAL_SCALE = 3;
        public const int VISUAL_WIDTH  = WIDTH  * VISUAL_SCALE; // 900
        public const int VISUAL_HEIGHT = HEIGHT * VISUAL_SCALE; // 318

        [SerializeField]
        private byte[] terrainGrid;

        public LogicalMapData()
        {
            terrainGrid = new byte[WIDTH * HEIGHT];
            // 默认全部为雪地
        }

        public TerrainType GetTerrain(int lx, int ly)
        {
            if (lx < 0 || lx >= WIDTH || ly < 0 || ly >= HEIGHT)
                return TerrainType.Snow;
            if (terrainGrid == null) return TerrainType.Snow;
            int idx = ly * WIDTH + lx;
            if (idx >= terrainGrid.Length) return TerrainType.Snow;
            return (TerrainType)terrainGrid[idx];
        }

        public void SetTerrain(int lx, int ly, TerrainType type)
        {
            if (lx < 0 || lx >= WIDTH || ly < 0 || ly >= HEIGHT) return;
            if (terrainGrid == null) EnsureGrid();
            int idx = ly * WIDTH + lx;
            if (idx < terrainGrid.Length)
                terrainGrid[idx] = (byte)type;
        }

        /// <summary>
        /// 确保 terrainGrid 已分配且长度正确。
        /// 若旧数据长度不匹配（如地图尺寸变更），选择迁移而非静默清空，保留能对应的旧数据。
        /// </summary>
        public void EnsureGrid()
        {
            int expected = WIDTH * HEIGHT;
            if (terrainGrid == null)
            {
                terrainGrid = new byte[expected];
                return;
            }
            if (terrainGrid.Length == expected) return;

            // 尺寸不匹配：迁移旧数据，不丢弃能对应的格子
            Debug.LogWarning($"[LogicalMapData] terrainGrid 尺寸迁移: {terrainGrid.Length} → {expected} （地图尺寸变更）");
            var old = terrainGrid;
            terrainGrid = new byte[expected];
            // 将旧数据按行复制，旧宽度偏小时择小的那个
            int oldW = (int)Mathf.Sqrt(old.Length); // 意外情况下加保榜
            // 尝试按已知旧尺寸解析
            int srcW = 380, srcH = 270;
            if (old.Length == 106 * 106) { srcW = 106; srcH = 106; }
            else if (old.Length == 380 * 270) { srcW = 380; srcH = 270; }
            if (old.Length == srcW * srcH)
            {
                // 映射旧坐标到新地图（新地图更大，旧地图内容就地放在左下角）
                for (int y = 0; y < srcH && y < HEIGHT; y++)
                    for (int x = 0; x < srcW && x < WIDTH; x++)
                        terrainGrid[y * WIDTH + x] = old[y * srcW + x];
                Debug.Log($"[LogicalMapData] 已迁移 {srcW}x{srcH} 旧地图数据到新尺寸 {WIDTH}x{HEIGHT}");
            }
            else
            {
                // 未知旧格式：无法安全映射，重置为全雪地（避免坐标混乱）
                Debug.LogWarning($"[LogicalMapData] 未知旧格式（长度={old.Length}），已重置为全雪地。");
                // terrainGrid 保持全 0（雪地默认值，已在 new byte[expected] 时初始化）
            }
        }

        /// <summary>逻辑坐标 → 视觉块中心坐标</summary>
        public static Vector2Int LogicalToVisualCenter(int lx, int ly)
        {
            return new Vector2Int(lx * VISUAL_SCALE + 1, ly * VISUAL_SCALE + 1);
        }

        /// <summary>视觉坐标 → 逻辑坐标</summary>
        public static Vector2Int VisualToLogical(int vx, int vy)
        {
            return new Vector2Int(vx / VISUAL_SCALE, vy / VISUAL_SCALE);
        }
    }
}
