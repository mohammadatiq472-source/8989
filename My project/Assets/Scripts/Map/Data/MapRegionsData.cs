using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace YouZhou.Map
{
    /// <summary>
    /// 区划空间数据 — 从 STZB cfg 逆向提取的 13州×94郡×316县 完整地图骨架。
    /// JSON 数据由 scripts/generate_all_provinces_map.py 生成，
    /// 存放在 StreamingAssets/map_regions.json。
    /// 
    /// 坐标系统: 统一编码 pos=x*10000+y
    ///   X 轴向南递增 (x≈1~1501)
    ///   Y 轴向东递增 (y≈1~1501)
    ///   地图约 1500×1500 近正方形网格
    /// ID 编码: junxian_id÷100=region_id, xian_id÷100=junxian_id
    /// 雍州拆分: 京兆/冯翊/扶风→司隶, 陇西/天水/安定/新平/北地→凉州
    /// </summary>
    public static class MapRegionsLoader
    {
        private static MapRegionsRoot _cached;

        /// <summary>
        /// 加载并缓存区划数据。首次调用时从 StreamingAssets 读取 JSON。
        /// </summary>
        public static MapRegionsRoot Load()
        {
            if (_cached != null) return _cached;

            string path = Path.Combine(Application.streamingAssetsPath, "map_regions.json");
            if (!File.Exists(path))
            {
                Debug.LogError($"[MapRegions] 找不到 {path}，请先运行 scripts/generate_all_provinces_map.py");
                return null;
            }

            string json = File.ReadAllText(path, System.Text.Encoding.UTF8);
            _cached = JsonUtility.FromJson<MapRegionsRoot>(json);
            Debug.Log($"[MapRegions] 已加载: {_cached.provinces.Length}州, {_cached.junxian.Length}郡, {_cached.xian.Length}县");
            return _cached;
        }

        /// <summary>清除缓存，下次调用 Load() 会重新读取文件</summary>
        public static void ClearCache() => _cached = null;

        /// <summary>按 effectiveRegionId 获取某州的所有郡</summary>
        public static List<JunxianData> GetJunxianByRegion(int regionId)
        {
            var root = Load();
            if (root == null) return new List<JunxianData>();

            var result = new List<JunxianData>();
            foreach (var j in root.junxian)
            {
                if (j.effectiveRegionId == regionId)
                    result.Add(j);
            }
            return result;
        }

        /// <summary>按 junxianId 获取某郡的所有县</summary>
        public static List<XianData> GetXianByJunxian(int junxianId)
        {
            var root = Load();
            if (root == null) return new List<XianData>();

            var result = new List<XianData>();
            foreach (var x in root.xian)
            {
                if (x.junxianId == junxianId)
                    result.Add(x);
            }
            return result;
        }
    }

    // ── JSON 数据结构 ──────────────────────────────────

    [Serializable]
    public class MapRegionsRoot
    {
        public ProvinceData[] provinces;
        public JunxianData[] junxian;
        public XianData[] xian;
        public NamedCityData[] namedCities;
        public RoadData[] roads;
    }

    [Serializable]
    public class ProvinceData
    {
        public int regionId;
        public string name;
        public string shortName;
        public string capital;
        public string color;
        public int[] adjacency;
        public int junxianCount;
        public int xianCount;
        public Vec2Data center;
        public BBoxData bbox;
        public int[] junxianIds;
    }

    [Serializable]
    public class JunxianData
    {
        public int id;
        public string name;
        public int originalRegionId;
        public int effectiveRegionId;
        public Vec2Data center;
        public BBoxData bbox;
        public int width;
        public int height;
    }

    [Serializable]
    public class XianData
    {
        public int id;
        public string name;
        public int junxianId;
        public int originalRegionId;
        public int effectiveRegionId;
        public Vec2Data center;
        public BBoxData bbox;
    }

    [Serializable]
    public class NamedCityData
    {
        public int pos;
        public string name;
        public int x;
        public int y;
        public int typeCode;
    }

    [Serializable]
    public class RoadData
    {
        public int from;
        public int to;
        public int distance;
    }

    [Serializable]
    public class Vec2Data
    {
        public float x;
        public float y;

        public Vector2 ToVector2() => new Vector2(x, y);
    }

    [Serializable]
    public class BBoxData
    {
        public int minX;
        public int minY;
        public int maxX;
        public int maxY;

        public Vector2 Min => new Vector2(minX, minY);
        public Vector2 Max => new Vector2(maxX, maxY);
        public Vector2 Size => new Vector2(maxX - minX, maxY - minY);
        public Vector2 Center => new Vector2((minX + maxX) * 0.5f, (minY + maxY) * 0.5f);
        public Rect ToRect() => new Rect(minX, minY, maxX - minX, maxY - minY);
    }
}
