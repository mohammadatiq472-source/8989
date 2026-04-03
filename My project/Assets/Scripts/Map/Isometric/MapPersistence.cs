using System.IO;
using System.Text;
using UnityEngine;

namespace YouZhou.Map
{
    /// <summary>
    /// 地图数据持久化 - 保存/加载逻辑地图到 StreamingAssets/youzhou_map.json
    /// 编辑器中修改后保存即永久生效
    /// </summary>
    public static class MapPersistence
    {
        private const string FILE_NAME = "youzhou_map.json";

        public static string FilePath =>
            Path.Combine(Application.streamingAssetsPath, FILE_NAME);

        public static void Save(LogicalMapData data)
        {
            string dir = Path.GetDirectoryName(FilePath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            string json = JsonUtility.ToJson(data);
            // 原子写入：先写临时文件，再替换正式文件
            // 避免写入中洁崩澃天地图文件
            string tmpPath = FilePath + ".tmp";
            File.WriteAllText(tmpPath, json, Encoding.UTF8);
            // 原子性更高的覆盖方案：先备份原文件，再 Move 新文件，最后删备份
            // 即使在 Move 之前崩溃，备份仍可手动恢复，不会两个文件都丢失
            string bakPath = FilePath + ".bak";
            if (File.Exists(FilePath))
            {
                if (File.Exists(bakPath)) File.Delete(bakPath);
                File.Move(FilePath, bakPath);
            }
            try
            {
                File.Move(tmpPath, FilePath);
                if (File.Exists(bakPath)) File.Delete(bakPath);
            }
            catch
            {
                // 如果移动失败，尝试从备份恢复
                if (File.Exists(bakPath) && !File.Exists(FilePath))
                    File.Move(bakPath, FilePath);
                throw;
            }
            Debug.Log($"[MapPersistence] 已保存地图至 {FilePath} ({json.Length} bytes, {LogicalMapData.WIDTH}×{LogicalMapData.HEIGHT} 格)");
        }

        public static LogicalMapData Load()
        {
            if (!File.Exists(FilePath))
            {
                Debug.Log("[MapPersistence] 无已保存地图，创建默认空白地图");
                return new LogicalMapData();
            }

            string json = File.ReadAllText(FilePath, Encoding.UTF8);
            var data = JsonUtility.FromJson<LogicalMapData>(json);
            // JsonUtility 对普通 [Serializable] 类不调用 C# 构造函数
            // 需要手动校验 terrainGrid 尺寸（包括历史地图尺寸迁移）
            if (data == null)
            {
                Debug.LogWarning("[MapPersistence] 反序列化失败，创建空白地图");
                return new LogicalMapData();
            }
            data.EnsureGrid();
            Debug.Log($"[MapPersistence] 已加载地图 ({json.Length} bytes, {LogicalMapData.WIDTH}×{LogicalMapData.HEIGHT} 格)");
            return data;
        }

        public static bool SaveExists() => File.Exists(FilePath);
    }
}
