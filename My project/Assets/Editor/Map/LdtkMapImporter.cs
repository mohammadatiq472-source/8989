using System.IO;
using UnityEngine;
using UnityEditor;
using Newtonsoft.Json.Linq;

namespace YouZhou.Map
{
    /// <summary>
    /// LDtk → Unity 地图导入器（无需 LDtkToUnity 插件）
    ///
    /// 工作流：
    ///   1. 用 LDtk 打开 Assets/StreamingAssets/YouZhouMap.ldtk 画地图
    ///   2. Ctrl+S 保存（LDtk 自动更新 intGridCsv 数组）
    ///   3. 在 Unity 执行 YouZhou/Import from LDtk → 自动同步地形到 youzhou_map.json
    ///   4. Map Builder 自动重新渲染
    ///
    /// LDtk IntGrid 约定：
    ///   0 = 空格（不应出现）
    ///   1 = Snow, 2 = SnowForest, 3 = FrozenLake, ...（值 = TerrainType + 1）
    /// </summary>
    public static class LdtkMapImporter
    {
        private const string LDTK_PATH     = "Assets/StreamingAssets/YouZhouMap.ldtk";
        private const string MAP_JSON_PATH = "Assets/StreamingAssets/youzhou_map.json";

        [MenuItem("YouZhou/Import from LDtk")]
        public static void ImportFromLDtk()
        {
            // ── 1. 读取 .ldtk 文件 ──
            string fullLdtk = Path.Combine(Application.dataPath, "../", LDTK_PATH);
            if (!File.Exists(fullLdtk))
            {
                Debug.LogError($"[LDtk Importer] 找不到 LDtk 文件: {fullLdtk}\n请先运行 scripts/generate_ldtk_project.py");
                return;
            }

            JObject ldtk;
            try { ldtk = JObject.Parse(File.ReadAllText(fullLdtk)); }
            catch (System.Exception e)
            {
                Debug.LogError($"[LDtk Importer] JSON 解析失败: {e.Message}");
                return;
            }

            // ── 2. 找 Terrain IntGrid 层 ──
            var levels = ldtk["levels"] as JArray;
            if (levels == null || levels.Count == 0) { Debug.LogError("[LDtk Importer] 找不到 levels"); return; }

            JArray intGridCsv = null;
            int ldtkW = 0, ldtkH = 0;

            foreach (var level in levels)
            {
                var layers = level["layerInstances"] as JArray;
                if (layers == null) continue;
                foreach (var layer in layers)
                {
                    if (layer["__type"]?.ToString() == "IntGrid" &&
                        layer["__identifier"]?.ToString() == "Terrain")
                    {
                        intGridCsv = layer["intGridCsv"] as JArray;
                        ldtkW = layer["__cWid"]?.Value<int>() ?? 0;
                        ldtkH = layer["__cHei"]?.Value<int>() ?? 0;
                        break;
                    }
                }
                if (intGridCsv != null) break;
            }

            if (intGridCsv == null || ldtkW == 0 || ldtkH == 0)
            {
                Debug.LogError("[LDtk Importer] 找不到 Terrain IntGrid 层数据");
                return;
            }

            if (ldtkW != LogicalMapData.WIDTH || ldtkH != LogicalMapData.HEIGHT)
            {
                Debug.LogWarning($"[LDtk Importer] 尺寸不匹配: LDtk={ldtkW}x{ldtkH}, 期望={LogicalMapData.WIDTH}x{LogicalMapData.HEIGHT}");
            }

            int W = Mathf.Min(ldtkW, LogicalMapData.WIDTH);
            int H = Mathf.Min(ldtkH, LogicalMapData.HEIGHT);

            // ── 3. 转换 IntGrid CSV → terrainGrid ──
            // LDtk: row 0 = 屏幕顶部（map Y = H-1），需要翻转 Y
            byte[] terrainGrid = new byte[LogicalMapData.WIDTH * LogicalMapData.HEIGHT];

            for (int row = 0; row < H; row++)
            {
                int mapY = H - 1 - row;
                for (int col = 0; col < W; col++)
                {
                    int csvIdx = row * ldtkW + col;
                    int ldtkVal = csvIdx < intGridCsv.Count ? intGridCsv[csvIdx].Value<int>() : 1;
                    // LDtk val = TerrainType + 1；val=0(空)→ Snow
                    byte terrain = (byte)Mathf.Max(0, ldtkVal - 1);
                    terrainGrid[mapY * LogicalMapData.WIDTH + col] = terrain;
                }
            }

            // ── 4. 写回 youzhou_map.json ──
            var mapJson = new JObject();
            mapJson["terrainGrid"] = new JArray(terrainGrid);

            string fullMapJson = Path.Combine(Application.dataPath, "../", MAP_JSON_PATH);
            File.WriteAllText(fullMapJson, mapJson.ToString(Newtonsoft.Json.Formatting.None));
            Debug.Log($"[LDtk Importer] 地形数据已同步 → {MAP_JSON_PATH} ({W}x{H})");

            // ── 5. 触发地图重新加载并渲染 ──
            var builder = Object.FindAnyObjectByType<IsometricMapBuilder>();
            if (builder != null)
            {
                var data = new LogicalMapData();
                for (int gy = 0; gy < LogicalMapData.HEIGHT; gy++)
                    for (int gx = 0; gx < LogicalMapData.WIDTH; gx++)
                        data.SetTerrain(gx, gy, (TerrainType)terrainGrid[gy * LogicalMapData.WIDTH + gx]);
                builder.Initialize(data);
                Debug.Log("[LDtk Importer] 地图渲染已更新！");
            }
            else
            {
                Debug.LogWarning("[LDtk Importer] 未找到 IsometricMapBuilder，地图 JSON 已写入但未渲染。请打开 YouZhouMap 场景后重新导入。");
            }

            AssetDatabase.Refresh();
        }

        /// <summary>从 Unity 把当前地图导出到 LDtk（用于更新编辑器里的显示）</summary>
        [MenuItem("YouZhou/Export to LDtk")]
        public static void ExportToLDtk()
        {
            // 目前用 Python 脚本更新（scripts/generate_ldtk_project.py）
            // 此处仅做提示
            Debug.Log("[LDtk Exporter] 请运行: py -3.11 scripts/generate_ldtk_project.py\n这会把当前 youzhou_map.json 同步到 LDtk 文件。");
            EditorUtility.DisplayDialog(
                "导出到 LDtk",
                "请在终端运行:\n\npy -3.11 scripts/generate_ldtk_project.py\n\n这会把当前地图数据写入 YouZhouMap.ldtk，然后在 LDtk 里重新打开该文件即可。",
                "OK");
        }
    }
}
