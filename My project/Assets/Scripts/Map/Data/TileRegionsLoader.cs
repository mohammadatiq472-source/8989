using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace YouZhou.Map
{
    /// <summary>
    /// 逐格郡归属数据加载器 — 从 StreamingAssets/map_tile_regions.json 加载 RLE 格式的郡归属网格。
    /// 数据由 scripts/generate_tile_regions.py 生成。
    ///
    /// 坐标系: pos = x*10000 + y, X 南↓ (1~1851), Y 东→ (1~1501)
    /// 查询: GetJunxianIdAt(gameX, gameY) → junxian_id（0 = 未分配/海洋）
    ///
    /// 郡 ID 约定:
    ///   原始 94 郡: 101-1313, ID÷100 = effectiveRegionId
    ///   交州合成 7 郡: 1501-1507, effectiveRegionId=15
    ///
    /// 格式说明:
    ///   rows["x"] = [[y_start, y_end_inclusive, junxian_id], ...]  按 y 升序
    /// </summary>
    public static class TileRegionsLoader
    {
        // 行 RLE 索引: gameX → sorted list of (y0, y1, junxianId)
        private static Dictionary<int, List<(int y0, int y1, int jid)>> _rows;

        // 郡元数据: junxianId → (name, regionId)
        private static Dictionary<int, (string name, int regionId)> _junxianMeta;

        private static bool _loaded;

        // ── 公开 API ──────────────────────────────────────────────────────────

        /// <summary>
        /// 查询游戏坐标 (gameX, gameY) 对应的郡 ID。
        /// 返回 0 表示该格在版图之外（海洋/沙漠/未分配）。
        /// </summary>
        public static int GetJunxianIdAt(int gameX, int gameY)
        {
            EnsureLoaded();
            if (!_rows.TryGetValue(gameX, out var runs)) return 0;
            foreach (var (y0, y1, jid) in runs)
            {
                if (gameY < y0) break;
                if (gameY <= y1) return jid;
            }
            return 0;
        }

        /// <summary>
        /// 同时获取郡 ID 和 regionId。
        /// 返回值: (junxianId, regionId)，无命中则均返回 0。
        /// </summary>
        public static (int junxianId, int regionId) GetRegionInfoAt(int gameX, int gameY)
        {
            int jid = GetJunxianIdAt(gameX, gameY);
            if (jid == 0) return (0, 0);
            int rid = GetRegionIdByJunxian(jid);
            return (jid, rid);
        }

        /// <summary>按 junxian_id 获取郡名</summary>
        public static string GetJunxianName(int junxianId)
        {
            EnsureLoaded();
            return _junxianMeta.TryGetValue(junxianId, out var m) ? m.name : "";
        }

        /// <summary>按 junxian_id 获取所属 regionId（州 ID）</summary>
        public static int GetRegionIdByJunxian(int junxianId)
        {
            EnsureLoaded();
            return _junxianMeta.TryGetValue(junxianId, out var m) ? m.regionId : 0;
        }

        /// <summary>清除缓存，下次调用时重新从磁盘读取</summary>
        public static void ClearCache()
        {
            _rows = null;
            _junxianMeta = null;
            _loaded = false;
        }

        // ── 内部加载逻辑 ──────────────────────────────────────────────────────

        private static void EnsureLoaded()
        {
            if (_loaded) return;
            Load();
            _loaded = true;
        }

        private static void Load()
        {
            string path = Path.Combine(Application.streamingAssetsPath, "map_tile_regions.json");
            if (!File.Exists(path))
            {
                Debug.LogError($"[TileRegions] 找不到 {path}，请先运行 scripts/generate_tile_regions.py");
                _rows = new Dictionary<int, List<(int, int, int)>>();
                _junxianMeta = new Dictionary<int, (string, int)>();
                return;
            }

            string raw = File.ReadAllText(path, System.Text.Encoding.UTF8);
            JObject root = JObject.Parse(raw);

            // ── 解析郡元数据 ─────────────────────────────────────────────────
            _junxianMeta = new Dictionary<int, (string, int)>();
            JObject metaObj = root["junxianMeta"] as JObject;
            if (metaObj != null)
            {
                foreach (var kv in metaObj)
                {
                    if (!int.TryParse(kv.Key, out int jid)) continue;
                    string name = kv.Value["name"]?.ToString() ?? "";
                    int rid = kv.Value["regionId"]?.Value<int>() ?? 0;
                    _junxianMeta[jid] = (name, rid);
                }
            }

            // ── 解析 RLE 行数据 ──────────────────────────────────────────────
            _rows = new Dictionary<int, List<(int, int, int)>>();
            JObject rowsObj = root["rows"] as JObject;
            if (rowsObj == null)
            {
                Debug.LogWarning("[TileRegions] JSON 中找不到 'rows' 字段");
                return;
            }

            foreach (var kv in rowsObj)
            {
                if (!int.TryParse(kv.Key, out int x)) continue;
                JArray runsArr = kv.Value as JArray;
                if (runsArr == null) continue;

                var runList = new List<(int, int, int)>(runsArr.Count);
                foreach (JArray run in runsArr)
                {
                    if (run.Count < 3) continue;
                    int y0  = run[0].Value<int>();
                    int y1  = run[1].Value<int>();
                    int jid = run[2].Value<int>();
                    runList.Add((y0, y1, jid));
                }
                // runs 已由生成脚本按 y 升序排列
                _rows[x] = runList;
            }

            int totalRows = _rows.Count;
            int totalRuns = 0;
            foreach (var v in _rows.Values) totalRuns += v.Count;
            Debug.Log($"[TileRegions] 已加载: {totalRows} 行 | {totalRuns} 段 RLE | {_junxianMeta.Count} 郡元数据");
        }
    }
}
