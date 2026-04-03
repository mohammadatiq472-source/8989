using System.IO;
using System.Text;
using UnityEngine;

namespace YouZhou.Map
{
    /// <summary>
    /// 城池持久化 - 独立于地形数据，保存/加载城池注册表
    /// </summary>
    public static class CityPersistence
    {
        private const string FILE_NAME = "youzhou_cities.json";

        public static string FilePath =>
            Path.Combine(Application.streamingAssetsPath, FILE_NAME);

        public static void Save(CityRegistry registry)
        {
            string dir = Path.GetDirectoryName(FilePath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            string json = JsonUtility.ToJson(registry, true);
            File.WriteAllText(FilePath, json, Encoding.UTF8);
            Debug.Log($"[CityPersistence] 已保存 {registry.cities.Count} 个城池至 {FilePath}");
        }

        public static CityRegistry Load()
        {
            if (!File.Exists(FilePath))
            {
                Debug.Log("[CityPersistence] 无已保存城池数据，创建默认");
                return CreateDefaultYouZhouCities();
            }

            string json = File.ReadAllText(FilePath, Encoding.UTF8);
            var registry = JsonUtility.FromJson<CityRegistry>(json);
            Debug.Log($"[CityPersistence] 已加载 {registry.cities.Count} 个城池");
            return registry;
        }

        /// <summary>
        /// 创建幽州默认城池配置
        /// 坐标基于 generate_youzhou_map.py 中的位置
        /// </summary>
        private static CityRegistry CreateDefaultYouZhouCities()
        {
            var reg = new CityRegistry();

            // === 幽州治所 ===
            reg.AddCity(new CityData {
                id = "ji_county", displayName = "\u84df\u53bf",
                size = CitySize.Large, logicalX = 36, logicalY = 56,
                district = "\u6daf\u90e1", isCapital = true
            });

            // === 各郡治 ===
            reg.AddCity(new CityData {
                id = "guangyang", displayName = "\u5e7f\u9633",
                size = CitySize.Medium, logicalX = 42, logicalY = 56,
                district = "\u5e7f\u9633\u90e1", isCapital = true
            });

            reg.AddCity(new CityData {
                id = "yuyang", displayName = "\u6e14\u9633",
                size = CitySize.Medium, logicalX = 50, logicalY = 63,
                district = "\u6e14\u9633\u90e1", isCapital = true
            });

            reg.AddCity(new CityData {
                id = "youbeiping", displayName = "\u53f3\u5317\u5e73",
                size = CitySize.Medium, logicalX = 58, logicalY = 60,
                district = "\u53f3\u5317\u5e73\u90e1", isCapital = true
            });

            reg.AddCity(new CityData {
                id = "liaoxi", displayName = "\u8fbd\u897f",
                size = CitySize.Medium, logicalX = 66, logicalY = 58,
                district = "\u8fbd\u897f\u90e1", isCapital = true
            });

            reg.AddCity(new CityData {
                id = "liaodong", displayName = "\u8fbd\u4e1c",
                size = CitySize.Medium, logicalX = 75, logicalY = 52,
                district = "\u8fbd\u4e1c\u90e1", isCapital = true
            });

            reg.AddCity(new CityData {
                id = "xuantu", displayName = "\u7384\u83df",
                size = CitySize.Medium, logicalX = 70, logicalY = 70,
                district = "\u7384\u83df\u90e1", isCapital = true
            });

            reg.AddCity(new CityData {
                id = "lelang", displayName = "\u4e50\u6d6a",
                size = CitySize.Medium, logicalX = 92, logicalY = 27,
                district = "\u4e50\u6d6a\u90e1", isCapital = true
            });

            // === 普通县城 ===
            reg.AddCity(new CityData {
                id = "dai_county", displayName = "\u4ee3\u53bf",
                size = CitySize.Small, logicalX = 22, logicalY = 72,
                district = "\u4ee3\u90e1", isCapital = false
            });

            reg.AddCity(new CityData {
                id = "shanggu", displayName = "\u4e0a\u8c37",
                size = CitySize.Small, logicalX = 28, logicalY = 65,
                district = "\u4e0a\u8c37\u90e1", isCapital = false
            });

            reg.AddCity(new CityData {
                id = "fanyang", displayName = "\u8303\u9633",
                size = CitySize.Small, logicalX = 38, logicalY = 48,
                district = "\u6daf\u90e1", isCapital = false
            });

            reg.AddCity(new CityData {
                id = "zhuo_county", displayName = "\u6daf\u53bf",
                size = CitySize.Small, logicalX = 33, logicalY = 52,
                district = "\u6daf\u90e1", isCapital = false
            });

            return reg;
        }
    }
}
